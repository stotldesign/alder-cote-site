// Serves the site's static files. Videos go through here first so they answer
// "Range" requests (206 Partial Content), which Safari and iPhones need to play video.
export default {
  async fetch(request, env) {
    const range = request.headers.get('Range');
    const asset = await env.ASSETS.fetch(request);
    if (!range || asset.status !== 200) return withRanges(asset);
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === '' && m[2] === '')) return withRanges(asset);
    let size = Number(asset.headers.get('Content-Length')) || 0, buf = null;
    if (!size) { buf = await asset.arrayBuffer(); size = buf.byteLength; }   // no length given: read it whole
    let start, end;
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
    else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
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
