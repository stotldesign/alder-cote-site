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

/* page transition: a link marked data-zoom pulls the whole page into itself, then the next page settles out of the zoom */
(function () {
  const KEY = 'ac-zoom';
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-zoom]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const href = a.getAttribute('href'), r = a.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    const s = Math.max(vw / r.width, vh / r.height) * 1.18, cx = r.left + r.width / 2, cy = r.top + r.height / 2, b = document.body;
    b.style.transformOrigin = cx + 'px ' + cy + 'px';
    b.style.transition = 'transform 1.05s cubic-bezier(.7,0,.2,1)';
    const veil = document.createElement('div'); veil.className = 'ac-veil';
    veil.style.cssText = 'position:fixed;inset:0;background:#111111;opacity:0;transition:opacity .32s ease .78s;z-index:2147483647;pointer-events:none';
    document.documentElement.appendChild(veil);
    requestAnimationFrame(() => requestAnimationFrame(() => { b.style.transform = 'translate(' + (vw / 2 - cx) + 'px,' + (vh / 2 - cy) + 'px) scale(' + s + ')'; veil.style.opacity = '1'; }));
    try { sessionStorage.setItem(KEY, '1'); } catch (x) {}
    setTimeout(() => { location.href = href; }, 1120);
  });
  window.addEventListener('pageshow', (e) => { if (!e.persisted) return; document.body.style.transform = ''; document.body.style.transition = ''; document.querySelectorAll('.ac-veil').forEach((v) => v.remove()); });
  window.acArrive = (host) => {
    let on = false; try { on = sessionStorage.getItem(KEY) === '1'; sessionStorage.removeItem(KEY); } catch (x) {}
    if (!on) return;
    host.style.transition = 'none'; host.style.transform = 'scale(1.14)'; host.style.opacity = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => { host.style.transition = 'transform 1.1s cubic-bezier(.16,.84,.24,1), opacity .7s ease'; host.style.transform = 'none'; host.style.opacity = '1'; }));
  };
})();
