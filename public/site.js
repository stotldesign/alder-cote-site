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
  window.dcBoot = function (Component, tplId, width, height) {
    const host = document.getElementById('app');
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
    if (window.acArrive) window.acArrive(host);
  };
})();

/* page transition: a link marked data-zoom pulls the page into its video until it fills the window, a full-window copy of
   the same video takes over at the same moment, and the next page picks that video up where it left off */
(function () {
  const KEY = 'ac-zoom';
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-zoom]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const href = a.getAttribute('href'), v = a.querySelector('video'), r = a.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    const s = Math.max(vw / r.width, vh / r.height) * 1.12, cx = r.left + r.width / 2, cy = r.top + r.height / 2, b = document.body;
    b.style.transformOrigin = cx + 'px ' + cy + 'px';
    b.style.transition = 'transform 1s cubic-bezier(.7,0,.2,1)';
    let full = null;
    if (v) {
      full = document.createElement('video'); full.className = 'ac-veil';
      full.src = v.currentSrc || v.src; full.muted = true; full.playsInline = true; full.loop = true;
      full.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover;background:#111111;opacity:0;transition:opacity .3s ease .72s;z-index:2147483647;pointer-events:none';
      try { full.currentTime = v.currentTime; } catch (x) {}
      document.documentElement.appendChild(full); const p = full.play(); if (p && p.catch) p.catch(() => {});
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      b.style.transform = 'translate(' + (vw / 2 - cx) + 'px,' + (vh / 2 - cy) + 'px) scale(' + s + ')';
      if (full) full.style.opacity = '1';
    }));
    setTimeout(() => {
      try { sessionStorage.setItem(KEY, JSON.stringify({ t: full ? full.currentTime : 0, at: Date.now() })); } catch (x) {}
      location.href = href;
    }, 1060);
  });
  window.addEventListener('pageshow', (e) => { if (!e.persisted) return; document.body.style.transform = ''; document.body.style.transition = ''; document.querySelectorAll('.ac-veil').forEach((n) => n.remove()); });
  window.acArrive = (host) => {
    let d = null; try { d = JSON.parse(sessionStorage.getItem(KEY) || 'null'); sessionStorage.removeItem(KEY); } catch (x) {}
    if (!d) return;
    const v = host.querySelector('video'); if (!v) return;
    const seek = () => { const t = d.t + (Date.now() - d.at) / 1000; try { v.currentTime = v.duration ? t % v.duration : t; } catch (x) {} const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    if (v.readyState >= 1) seek(); else v.addEventListener('loadedmetadata', seek, { once: true });
  };
})();
