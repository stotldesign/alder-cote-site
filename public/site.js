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

/* page transition: clicking a link marked data-zoom lifts its playing video out of the photo and grows it, straightening,
   until it fills the window exactly as the next page shows it; the next page opens on that same frame and plays on */
(function () {
  const KEY = 'ac-zoom', EASE = 'cubic-bezier(.65,0,.2,1)', DUR = 950;
  try { const st = document.createElement('style'); st.textContent = '@view-transition{navigation:auto}'; document.head.appendChild(st); } catch (x) {}
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-zoom]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const v = a.querySelector('video'); if (!v) return;
    e.preventDefault();
    const href = a.getAttribute('href'), vw = innerWidth, vh = innerHeight;
    const host = document.getElementById('app'), z = parseFloat(getComputedStyle(host).zoom) || 1;
    const box = a.getBoundingClientRect(), w = a.offsetWidth * z, h = a.offsetHeight * z;
    const m = getComputedStyle(a).transform, ang = m && m !== 'none' ? Math.atan2(+m.split(',')[1], +m.split('(')[1].split(',')[0]) : 0;
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    // dark behind, page pushes in a little
    const back = document.createElement('div'); back.className = 'ac-veil';
    back.style.cssText = 'position:fixed;inset:0;background:#111111;opacity:0;transition:opacity .7s ease .1s;z-index:2147483646;pointer-events:none';
    // the frame that grows: starts exactly over the photo, with its white edge and its tilt
    const frame = document.createElement('div'); frame.className = 'ac-veil';
    frame.style.cssText = 'position:fixed;left:' + (cx - w / 2) + 'px;top:' + (cy - h / 2) + 'px;width:' + w + 'px;height:' + h + 'px;transform:rotate(' + ang + 'rad);' +
      'border:' + Math.max(1, 2 * z) + 'px solid #FFFFFF;box-sizing:border-box;overflow:hidden;background:#111111;z-index:2147483647;pointer-events:none;' +
      'transition:left ' + DUR + 'ms ' + EASE + ',top ' + DUR + 'ms ' + EASE + ',width ' + DUR + 'ms ' + EASE + ',height ' + DUR + 'ms ' + EASE + ',transform ' + DUR + 'ms ' + EASE + ',border-width ' + DUR + 'ms ' + EASE;
    document.documentElement.appendChild(back); document.documentElement.appendChild(frame);
    // move the playing video itself, so not a single frame is lost
    v.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;transform:none;transition:none';
    frame.appendChild(v); v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {});
    const b = document.body; b.style.transformOrigin = cx + 'px ' + cy + 'px'; b.style.transition = 'transform ' + DUR + 'ms ' + EASE;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      frame.style.left = '0px'; frame.style.top = '0px'; frame.style.width = vw + 'px'; frame.style.height = vh + 'px';
      frame.style.transform = 'rotate(0rad)'; frame.style.borderWidth = '0px'; back.style.opacity = '1'; b.style.transform = 'scale(1.12)';
    }));
    setTimeout(() => {
      const d = { t: v.currentTime, at: Date.now(), still: '' };
      try { const c = document.createElement('canvas'), k = Math.min(1, 1280 / (v.videoWidth || 1280)); c.width = Math.round((v.videoWidth || 1280) * k); c.height = Math.round((v.videoHeight || 720) * k);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); d.still = c.toDataURL('image/jpeg', 0.82); } catch (x) {}
      try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch (x) { try { d.still = ''; sessionStorage.setItem(KEY, JSON.stringify(d)); } catch (y) {} }
      location.href = href;
    }, DUR + 40);
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted && document.querySelector('.ac-veil')) location.reload(); });
  window.acArrive = (host) => {
    let d = null; try { d = JSON.parse(sessionStorage.getItem(KEY) || 'null'); sessionStorage.removeItem(KEY); } catch (x) {}
    if (!d) return;
    const v = host.querySelector('video'); if (!v) return;
    if (d.still) v.poster = d.still;                                   // first paint is the very frame we zoomed into
    const seek = () => { const t = d.t + (Date.now() - d.at) / 1000; try { v.currentTime = v.duration ? t % v.duration : t; } catch (x) {} const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    if (v.readyState >= 1) seek(); else v.addEventListener('loadedmetadata', seek, { once: true });
    const root = host.firstElementChild; if (!root) return;           // the words come in over the picture
    const rest = [...root.children].filter((n) => n !== v && !n.contains(v));
    rest.forEach((n) => { n.style.transition = 'none'; n.style.opacity = '0'; });
    requestAnimationFrame(() => requestAnimationFrame(() => rest.forEach((n) => { n.style.transition = 'opacity .8s ease .15s'; n.style.opacity = '1'; })));
  };
})();
