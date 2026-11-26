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
    for (const at of b.attributes) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
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
      vals = c.renderVals() || {};
      const s = html();
      if (first) { host.innerHTML = s; first = false; }
      else { const t = document.createElement('div'); t.innerHTML = s; const a = host.childNodes, b = t.childNodes;
        if (a.length !== b.length) host.innerHTML = s; else for (let i = 0; i < a.length; i++) patch(a[i], b[i]); }
      bind();
    };
    const fit = () => { if (!width) return; const d = document.documentElement;
      host.style.zoom = height ? Math.min(1, d.clientWidth / width, d.clientHeight / height) : Math.min(1, d.clientWidth / width); };
    fit(); window.addEventListener('resize', fit);
    c.__r();
    window.__acPage = c;
    if (window.acArrive) window.acArrive(host);
    return c;
  };
})();

/* page transition: clicking a link marked data-zoom flies the camera into the photo until we're inside the picture;
   the next page is loaded into this same document around the very same playing video, which then pulls back to show
   the whole frame. no reload, no pause. on the next page a sharper copy of the film quietly takes over once it's ready. */
(function () {
  const IN = 1050, OUT = 1250;
  const vids = (root) => root ? [...root.querySelectorAll('video')] : [];
  window.addEventListener('popstate', () => location.reload());
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-zoom]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const v = a.querySelector('video'); if (!v || !window.fetch || !window.DOMParser) return;
    e.preventDefault();
    const href = a.getAttribute('href'), page = fetch(href).then((r) => { if (!r.ok) throw 0; return r.text(); });
    document.documentElement.classList.add('ac-zooming');
    const vid = v.parentNode; vid.style.opacity = '1'; v.style.transform = 'none'; v.muted = true; { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    const vw = innerWidth, vh = innerHeight, host = document.getElementById('app'), z = parseFloat(getComputedStyle(host).zoom) || 1;
    const box = a.getBoundingClientRect(), w = a.offsetWidth * z, h = a.offsetHeight * z;
    const m = getComputedStyle(a).transform, ang = m && m !== 'none' ? Math.atan2(+m.split(',')[1], +m.split('(')[1].split(',')[0]) : 0;
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const S = Math.max(vw / w, vh / h) * 1.25;                                 // well past the edges of the photo
    const b = document.body;
    b.style.transformOrigin = cx + 'px ' + cy + 'px';
    b.style.transition = 'transform ' + IN + 'ms cubic-bezier(.5,0,.25,1)';
    void b.offsetWidth;   // commit the start state, then animate (no frame callbacks, so a background tab can't replay it late)
    b.style.transform = 'translate(' + (vw / 2 - cx) + 'px,' + (vh / 2 - cy) + 'px) rotate(' + (-ang) + 'rad) scale(' + S + ')';
    const t0 = Date.now();
    page.then((html) => new Promise((ok) => setTimeout(() => ok(html), Math.max(0, IN + 20 - (Date.now() - t0))))).then((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const css = [...doc.querySelectorAll('style')].map((n) => n.textContent).join('\n');
      const tpl = doc.querySelector('script[type="text/x-template"]');
      const code = [...doc.querySelectorAll('script:not([src]):not([type])')].map((n) => n.textContent).find((t) => /class\s+C0\s+extends\s+DCLogic/.test(t));
      if (!tpl || !code) throw 0;
      // what the photo shows right now, in screen pixels: the film at magnification M, centred
      const vb = getComputedStyle(vid).borderTopWidth, bw = (parseFloat(vb) || 0) * z;
      const wi = w - 2 * bw, hi = h - 2 * bw, Vw = v.videoWidth || 1920, Vh = v.videoHeight || 1080;
      const M = Math.max(wi / Vw, hi / Vh) * S, f = Math.max(vw / Vw, vh / Vh), k = M / f;
      // swap the document around the playing video (all in one task, so it never stops)
      const t = v.currentTime;
      const st = document.createElement('style'); st.textContent = css;
      const tp = document.createElement('script'); tp.type = 'text/x-template'; tp.id = 'ac-next-tpl'; tp.textContent = tpl.textContent;
      const sc = document.createElement('script'); sc.textContent = code.replace(/\bC0\b/g, 'AcNext') + '\nwindow.__AcNext = AcNext;';
      const nh = document.createElement('div');
      document.documentElement.classList.remove('fit', 'ac-zooming');
      b.style.transition = 'none'; b.style.transform = ''; b.style.transformOrigin = '';
      host.remove(); [...document.querySelectorAll('style')].forEach((n) => n.remove());
      document.head.appendChild(st); b.appendChild(tp); b.appendChild(sc);
      nh.id = 'app'; b.appendChild(nh);
      window.dcBoot(window.__AcNext, 'ac-next-tpl', 0, 0, nh);
      document.title = doc.title || document.title;
      history.pushState({}, '', href);
      const root = nh.firstElementChild, hq = vids(nh)[0];
      // the photo's own video sits underneath the new page and keeps playing; the new page's sharper copy waits hidden
      v.removeAttribute('style');
      v.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover;z-index:0;pointer-events:none;transform-origin:50% 50%;transform:scale(' + k + ')';
      b.insertBefore(v, nh); { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
      nh.style.position = 'relative'; nh.style.zIndex = '1';
      if (root) root.style.background = 'transparent';
      if (hq) { hq.style.opacity = '0'; hq.style.transition = 'opacity .5s ease'; }
      const rest = root ? [...root.children].filter((n) => n.tagName !== 'VIDEO') : [];
      rest.forEach((n) => { n.style.transition = 'none'; n.style.opacity = '0'; });
      void v.offsetWidth;
      v.style.transition = 'transform ' + OUT + 'ms cubic-bezier(.45,0,.15,1)'; v.style.transform = 'scale(1)';
      rest.forEach((n) => { n.style.transition = 'opacity .9s ease .45s'; n.style.opacity = '1'; });
      // hand over to the sharp copy once it can play from the same moment
      if (hq) {
        const done = () => { v.pause(); v.remove(); if (root) root.style.background = ''; };
        const sync = () => { try { hq.currentTime = (v.currentTime + 0.35) % (hq.duration || 1e9); } catch (x) {} };
        let tries = 0;
        const ready = () => { if (Date.now() - t0 < IN + OUT) { setTimeout(ready, 120); return; }
          const d = Math.abs(hq.currentTime - v.currentTime); if (d > 0.2 && tries++ < 6) { sync(); setTimeout(ready, 400); return; }
          hq.style.opacity = '1'; setTimeout(done, 600); };
        const start = () => { sync(); const p = hq.play(); if (p && p.catch) p.catch(() => {}); hq.addEventListener('playing', ready, { once: true }); };
        if (hq.readyState >= 1) start(); else hq.addEventListener('loadedmetadata', start, { once: true });
      }
    }).catch(() => { location.href = href; });
  });
})();
