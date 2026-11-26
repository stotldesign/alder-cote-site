// Serves the site's static files. Videos go through here first so they answer
// "Range" requests (206 Partial Content), which Safari and iPhones need to play video.
// A video too big for one file (Cloudflare's limit is 25 MiB) is stored as numbered pieces next to a
// small "<name>.mp4.parts.json" ({ size, chunk, n }); to the browser it is still one ordinary .mp4.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404 && url.pathname.endsWith('.mp4')) {
      const man = await env.ASSETS.fetch(new URL(url.pathname + '.parts.json', url).toString());
      if (man.ok) return pieces(request, env, url, await man.json());
      return asset;
    }
    const range = request.headers.get('Range');
    if (!range || asset.status !== 200) return withRanges(asset);
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === '' && m[2] === '')) return withRanges(asset);
    let size = Number(asset.headers.get('Content-Length')) || 0, buf = null;
    if (!size) { buf = await asset.arrayBuffer(); size = buf.byteLength; }   // no length given: read it whole
    const [start, end] = span(m, size);
    if (start >= size || start > end) {
      if (!buf) asset.body?.cancel();
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
    }
    const headers = new Headers(asset.headers);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    if (request.method === 'HEAD') { if (!buf) asset.body?.cancel(); return new Response(null, { status: 206, headers }); }
    if (buf) return new Response(buf.slice(start, end + 1), { status: 206, headers });
    return new Response(asset.body.pipeThrough(slice(start, end)), { status: 206, headers });
  },
};

function span(m, size) {
  if (m[1] === '') return [Math.max(0, size - Number(m[2])), size - 1];
  return [Number(m[1]), m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)];
}

// one big video from its pieces: each answer covers at most the piece the request starts in
// (a 206 may return less than asked; browsers simply ask for the rest)
async function pieces(request, env, url, man) {
  const { size, chunk, n } = man;
  const base = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' };
  const part = (i) => env.ASSETS.fetch(new URL(`${url.pathname}.part${i}`, url).toString());
  const range = request.headers.get('Range');
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === '' && m[2] === '')) {
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers: { ...base, 'Content-Length': String(size) } });
    let i = 0;   // the whole file, piece after piece
    const body = new ReadableStream({
      async pull(ctl) {
        if (i >= n) { ctl.close(); return; }
        const r = await part(i++); const rd = r.body.getReader();
        for (;;) { const { done, value } = await rd.read(); if (done) break; ctl.enqueue(value); }
      },
    });
    return new Response(body, { status: 200, headers: { ...base, 'Content-Length': String(size) } });
  }
  let [start, end] = span(m, size);
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
  const i = Math.floor(start / chunk), off = i * chunk;
  end = Math.min(end, off + chunk - 1, size - 1);
  const headers = { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) };
  if (request.method === 'HEAD') return new Response(null, { status: 206, headers });
  const r = await part(i);
  if (!r.ok) return new Response(null, { status: 502 });
  return new Response(r.body.pipeThrough(slice(start - off, end - off)), { status: 206, headers });
}

function withRanges(res) {
  if (res.status !== 200) return res;
  const headers = new Headers(res.headers); headers.set('Accept-Ranges', 'bytes');
  return new Response(res.body, { status: 200, headers });
}

// passes through only bytes start..end (inclusive) of the stream, then stops reading
function slice(start, end) {
  let pos = 0;
  return new TransformStream({
    transform(chunk, ctl) {
      const a = pos, b = pos + chunk.byteLength; pos = b;
      if (b <= start || a > end) { if (a > end) ctl.terminate(); return; }
      ctl.enqueue(chunk.subarray(Math.max(0, start - a), Math.min(chunk.byteLength, end + 1 - a)));
      if (b > end) ctl.terminate();
    },
  });
}
