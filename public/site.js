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
  };
})();
