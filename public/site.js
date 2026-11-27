/* tiny runtime for the alder cote pages: fills {{holes}} from renderVals(), binds events, patches in place so transitions run */
class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(o) { Object.assign(this.state, typeof o === 'function' ? o(this.state) : o); if (this.__r) this.__r(); }
  forceUpdate() { if (this.__r) this.__r(); }
}
(function () {
  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function patch(a, b) {
    if (a.nodeType === 3) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    if (a.nodeType !== 1 || b.nodeType !== 1) return;
    const keep = a.__acStream ? 'src' : '';   // a streaming film's source is set by the player, not the template
    for (const at of b.attributes) if (at.name !== keep && a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    for (const at of [...a.attributes]) if (at.name !== keep && !b.hasAttribute(at.name)) a.removeAttribute(at.name);
    const ac = a.childNodes, bc = b.childNodes;
    if (ac.length !== bc.length) { a.innerHTML = b.innerHTML; return; }
    for (let i = 0; i < ac.length; i++) patch(ac[i], bc[i]);
  }
  window.dcBoot = function (Component, tplId, width, height, hostEl) {
    const host = hostEl || document.getElementById('app');
    const src = document.getElementById(tplId).textContent
      .replace(/\s(on[A-Za-z]+)="\{\{\s*([\w.$]+)\s*\}\}"/g, (m, ev, k) => ` data-ev-${ev.slice(2).toLowerCase()}="${k}"`)
      .replace(/\sref="\{\{\s*([\w.$]+)\s*\}\}"/g, ' data-ref="$1"');
    const c = new Component({});
    let vals = {}, first = true;
    const html = () => src.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, (m, k) => esc(get(vals, k)));
    const bind = () => host.querySelectorAll('[data-ref], *').forEach((el) => {
      for (const at of el.attributes) {
        if (at.name.startsWith('data-ev-')) { const f = get(vals, at.value); el['on' + at.name.slice(8)] = typeof f === 'function' ? f : null; }
        else if (at.name === 'data-ref') { const f = get(vals, at.value); if (typeof f === 'function') f(el); }
      }
    });
    c.__r = () => {
      if (host.dataset.acFrozen) return;   // held still while a page transition moves things by hand
      vals = c.renderVals() || {};
      const s = html();
      if (first) { host.innerHTML = s; first = false; }
      else { const t = document.createElement('div'); t.innerHTML = s; const a = host.childNodes, b = t.childNodes;
        if (a.length !== b.length) host.innerHTML = s; else for (let i = 0; i < a.length; i++) patch(a[i], b[i]); }
      bind();
      if (window.acStreams) window.acStreams(host);
    };
    const fit = () => { if (!width) return; const d = document.documentElement;
      if (height === 'fill') { const z = d.clientWidth / width; host.style.zoom = z; host.style.setProperty('--acvh', (d.clientHeight / z) + 'px'); return; }
      host.style.zoom = height ? Math.min(1, d.clientWidth / width, d.clientHeight / height) : Math.min(1, d.clientWidth / width); };
    fit(); window.addEventListener('resize', fit);
    c.__r();
    window.__acPage = c;
    if (window.acArrive) window.acArrive(host);
    return c;
  };
})();

/* the big films stream adaptively: each is cut into short segments at three qualities, and the player starts at one the
   connection can carry, then climbs to full resolution as soon as it can keep up — sharp without stalling.
   <video data-hls="…/master.m3u8" data-mp4="…mp4">: hls.js where the browser has Media Source, Safari's own player
   otherwise, and the plain mp4 if neither works. Quality is capped at what the screen can actually show. */
(function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.light.min.js';
  let lib = null;
  const load = () => lib || (lib = new Promise((ok, no) => {
    if (window.Hls) return ok(window.Hls);
    const s = document.createElement('script'); s.src = LIB; s.async = true;
    s.onload = () => (window.Hls ? ok(window.Hls) : no()); s.onerror = no; document.head.appendChild(s);
  }));
  const go = (v) => { if (v.autoplay) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } };
  const plain = (v, url, how) => { v.__acStream = how; v.src = url; go(v); };
  function attach(v) {
    if (v.__acStream) return;
    const url = v.dataset.hls, mp4 = v.dataset.mp4 || '';
    v.__acStream = 'pending';
    const mse = window.MediaSource || window.ManagedMediaSource;
    if (!mse && v.canPlayType('application/vnd.apple.mpegurl')) return plain(v, url, 'native');   // older iPhones
    load().then((Hls) => {
      if (!Hls.isSupported()) throw 0;
      const hls = new Hls({ abrEwmaDefaultEstimate: 6e6, maxBufferLength: 30, maxMaxBufferLength: 60, startFragPrefetch: true, capLevelOnFPSDrop: true });
      v.__acStream = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, (e, d) => {   // no point fetching more pixels than the screen has
        const want = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1) * 1.15;
        let cap = 0; d.levels.forEach((l, i) => { if (l.width <= want) cap = i; });
        hls.autoLevelCapping = cap; go(v);
      });
      let media = 0, net = 0;
      hls.on(Hls.Events.ERROR, (e, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR && net++ < 3 && !/manifest/i.test(d.details)) hls.startLoad();
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && media++ < 2) hls.recoverMediaError();
        else { hls.destroy(); v.removeAttribute('src'); if (mp4) plain(v, mp4, 'mp4'); }
      });
      hls.loadSource(url); hls.attachMedia(v);
    }).catch(() => {
      if (v.canPlayType('application/vnd.apple.mpegurl')) plain(v, url, 'native');
      else if (mp4) plain(v, mp4, 'mp4');
    });
  }
  window.acStreams = (root) => (root || document).querySelectorAll('video[data-hls]').forEach(attach);
})();

/* page transitions between the home page and /songs, in one continuous camera move, both ways.
   home → songs: the camera flies into the photo; while the photo's frame grows past the edges of the window, the film
   inside it opens out from the photo's crop to its full frame, landing exactly as /songs shows it. /songs is then built
   in this same document around the very same playing video (no reload), and its words fade in.
   songs → home (the "alder cote" link): the same move in reverse. */
(function () {
  const DUR = 1350, ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const smin = (a, b) => Math.pow(Math.pow(a, -8) + Math.pow(b, -8), -1 / 8);
  let seq = 0, busy = false;
  window.addEventListener('popstate', () => location.reload());

  // put another page of this site into the document (its styles, templates and component code), return its host
  function install(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html'), n = ++seq;
    const css = [...doc.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    const tpls = [...doc.querySelectorAll('script[type="text/x-template"]')];
    const code = [...doc.querySelectorAll('script:not([src]):not([type])')].map((x) => x.textContent).join('\n');
    if (!tpls.length || !/dcBoot\(/.test(code)) throw new Error('page');
    const ren = (t) => t.replace(/\bC(\d)\b/g, 'Ac' + n + 'C$1').replace(/(["'])tpl(\d)\1/g, '$1ac' + n + '-tpl$2$1');
    [...document.querySelectorAll('style')].forEach((x) => x.remove());
    document.documentElement.className = '';
    const old = document.getElementById('app'); if (old) old.id = 'ac-old';
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    tpls.forEach((t) => { const e = document.createElement('script'); e.type = 'text/x-template'; e.id = 'ac' + n + '-' + t.id; e.textContent = t.textContent; document.body.appendChild(e); });
    const host = document.createElement('div'); host.id = 'app'; document.body.appendChild(host);
    const sc = document.createElement('script'); sc.textContent = ren(code); document.body.appendChild(sc);
    document.title = doc.title || document.title;
    return { host, old };
  }

  // where the photo is, and how the film inside it has to be drawn at each point of the move
  function geometry(a, v) {
    const vw = innerWidth, vh = innerHeight, host = a.closest('#app') || document.getElementById('app');
    const z = parseFloat(getComputedStyle(host).zoom) || 1, box = a.getBoundingClientRect();
    const m = getComputedStyle(a).transform, ang = m && m !== 'none' ? Math.atan2(+m.split(',')[1], +m.split('(')[1].split(',')[0]) : 0;
    const vid = v.parentNode, bwl = parseFloat(getComputedStyle(vid).borderTopWidth) || 0;
    const liw = a.offsetWidth - 2 * bwl, lih = a.offsetHeight - 2 * bwl, Vw = v.videoWidth || 3840, Vh = v.videoHeight || 2160;
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    return { vw, vh, z, ang, cx, cy, liw, lih, Vw, Vh,
      S1: Math.max(vw / (a.offsetWidth * z), vh / (a.offsetHeight * z)) * 1.12,   // frame fully past the window edges
      c0: Math.max(liw * z / Vw, lih * z / Vh),                                   // the film as the photo crops it
      f: Math.max(vw / Vw, vh / Vh) };                                            // the film as /songs shows it
  }
  function pose(g, v, e) {   // e: 0 = resting on the home page, 1 = exactly the /songs view
    const S = Math.pow(g.S1, e), V = smin(g.c0 * S, g.f), W = V * g.Vw / (g.z * S), H = V * g.Vh / (g.z * S);
    document.body.style.transform = 'translate(' + ((g.vw / 2 - g.cx) * e) + 'px,' + ((g.vh / 2 - g.cy) * e) + 'px) rotate(' + (-g.ang * e) + 'rad) scale(' + S + ')';
    v.style.cssText = 'position:absolute;left:' + (g.liw - W) / 2 + 'px;top:' + (g.lih - H) / 2 + 'px;width:' + W + 'px;height:' + H + 'px;max-width:none;object-fit:fill;transform:none;transition:none;display:block';
  }
  function run(g, v, from, to, done) {
    const t0 = performance.now(); let fin = false;
    const end = () => { if (fin) return; fin = true; pose(g, v, to); done(); };
    const tick = (now) => { if (fin) return; const p = Math.min(1, (now - t0) / DUR); pose(g, v, from + (to - from) * ease(p)); if (p < 1) requestAnimationFrame(tick); else end(); };
    requestAnimationFrame(tick); setTimeout(end, DUR + 250);       // a hidden tab still finishes
  }
  const play = (v) => { v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); };

  // home → songs
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-zoom]');
    if (!a || busy || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const v = a.querySelector('video'); if (!v || !window.fetch || !window.DOMParser) return;
    e.preventDefault(); busy = true;
    const href = a.getAttribute('href'), page = fetch(href).then((r) => { if (!r.ok) throw 0; return r.text(); });
    const home = a.closest('#app'); home.dataset.acFrozen = '1';
    document.documentElement.classList.add('ac-zooming');
    const vid = v.parentNode; vid.style.opacity = '1'; play(v);
    const g = geometry(a, v);
    document.body.style.transformOrigin = g.cx + 'px ' + g.cy + 'px'; document.body.style.transition = 'none';
    run(g, v, 0, 1, () => page.then((html) => {
      const t = v.currentTime;
      document.body.style.transform = ''; document.body.style.transformOrigin = '';
      const { host, old } = install(html);
      // the photo's film keeps playing underneath /songs until /songs' sharp copy has caught up with it
      v.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover;z-index:0;pointer-events:none';
      document.body.insertBefore(v, host); play(v); if (Math.abs(v.currentTime - t) > 0.05) { try { v.currentTime = t; } catch (x) {} }
      if (old) old.remove();
      history.pushState({}, '', href);
      host.style.position = 'relative'; host.style.zIndex = '1';
      const root = host.firstElementChild, hq = host.querySelector('video');
      if (root) root.style.background = 'transparent';
      const words = root ? [...root.children].filter((n) => n.tagName !== 'VIDEO') : [];
      words.forEach((n) => { n.style.transition = 'none'; n.style.opacity = '0'; });
      void document.body.offsetWidth;
      words.forEach((n) => { n.style.transition = 'opacity .8s ease .1s'; n.style.opacity = '1'; });
      busy = false;
      if (!hq) return;
      hq.style.opacity = '0'; hq.style.transition = 'opacity .5s ease';
      const sync = () => { try { hq.currentTime = (v.currentTime + 0.35) % (hq.duration || 1e9); } catch (x) {} };
      let tries = 0;
      const ready = () => { const d = Math.abs(hq.currentTime - v.currentTime); if (d > 0.2 && tries++ < 8) { sync(); setTimeout(ready, 400); return; }
        hq.style.opacity = '1'; setTimeout(() => { v.pause(); v.remove(); if (root) root.style.background = ''; }, 600); };
      const start = () => { sync(); play(hq); hq.addEventListener('playing', () => setTimeout(ready, 150), { once: true }); };
      if (hq.readyState >= 1) start(); else hq.addEventListener('loadedmetadata', start, { once: true });
    }).catch(() => { location.href = href; }));
  });

  // songs → home
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-zoom-out]');
    if (!a || busy || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const songs = a.closest('#app'), sv = songs && songs.querySelector('video');
    if (!sv || !window.fetch || !window.DOMParser) return;
    e.preventDefault(); e.stopPropagation(); busy = true;
    const href = a.getAttribute('href'), page = fetch(href).then((r) => { if (!r.ok) throw 0; return r.text(); });
    songs.dataset.acFrozen = '1';
    const root = songs.firstElementChild, words = root ? [...root.children].filter((n) => n.tagName !== 'VIDEO') : [];
    words.forEach((n) => { n.style.transition = 'opacity .3s ease'; n.style.opacity = '0'; });
    const t0 = Date.now();
    page.then((html) => new Promise((ok) => setTimeout(() => ok(html), Math.max(0, 320 - (Date.now() - t0))))).then((html) => {
      document.querySelectorAll('body > video').forEach((x) => { if (x !== sv) { x.pause(); x.remove(); } });   // a hand-over still in progress
      const { host, old } = install(html);                       // boots the home page (fits it to the window)
      const ph = host.querySelector('a[data-zoom]'), hv = ph && ph.querySelector('video');
      if (!ph || !hv) throw 0;
      host.dataset.acFrozen = '1';
      document.documentElement.classList.add('ac-zooming');
      const vid = hv.parentNode; vid.style.opacity = '1';
      hv.replaceWith(sv); play(sv);                                // the same film, still playing, now inside the photo
      if (old) old.remove();
      const g = geometry(ph, sv);
      document.body.style.transformOrigin = g.cx + 'px ' + g.cy + 'px'; document.body.style.transition = 'none';
      pose(g, sv, 1);
      history.pushState({}, '', href);
      run(g, sv, 1, 0, () => {
        document.body.style.transform = ''; document.body.style.transformOrigin = '';
        sv.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover';
        document.documentElement.classList.remove('ac-zooming'); delete host.dataset.acFrozen;
        setTimeout(() => { if (!ph.matches(':hover')) { vid.style.transition = 'opacity .7s ease'; vid.style.opacity = '0'; } }, 500);
        busy = false;
      });
    }).catch(() => { location.href = href; });
  });
})();
