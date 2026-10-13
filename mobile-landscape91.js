/* Use the browser's own viewport scaling so canvas/PDF hit coordinates remain
   native CSS pixels. Never transform or zoom the canvas element independently. */
(() => {
  'use strict';
  if (window.NexusMobileLandscape91) return;
  const viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) return;
  if (window.top !== window.self) {
    // The schematic iframe already inherits the outer page scale. Only share
    // the field styling; applying a second viewport scale would shrink it twice.
    try {
      const sync = () => document.documentElement.classList.toggle('nexus-landscape91', !!parent.NexusMobileLandscape91?.state().active);
      const attach = () => { parent.removeEventListener('nexus:mobile-scale', sync); parent.addEventListener('nexus:mobile-scale', sync); sync(); };
      window.addEventListener('pagehide', () => parent.removeEventListener('nexus:mobile-scale', sync));
      window.addEventListener('pageshow', attach);
      attach();
    } catch {}
    return;
  }
  const original = viewport.content;
  const mobile = matchMedia('(hover:none) and (pointer:coarse)');
  const root = document.documentElement;
  const compactScale = .6;
  let active = null, frame = 0;
  function landscape() {
    // Physical orientation does not change when the software keyboard opens.
    const type = screen.orientation?.type;
    if (type) return type.startsWith('landscape');
    if (typeof window.orientation === 'number') return Math.abs(window.orientation) === 90;
    return screen.width > screen.height;
  }
  function update() {
    frame = 0;
    const next = mobile.matches && landscape();
    if (active === next) return;
    active = next;
    root.classList.toggle('nexus-landscape91', active);
    viewport.content = active
      ? original.replace(/initial-scale\s*=\s*[^,]+/i, 'initial-scale=' + compactScale)
      : original;
    window.dispatchEvent(new CustomEvent('nexus:mobile-scale', {detail:{active, scale:active ? compactScale : 1}}));
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  window.NexusMobileLandscape91 = Object.freeze({state:()=>({active:!!active,scale:active ? compactScale : 1}),pixelRatio:()=>Math.min(2,(devicePixelRatio||1)*(active ? compactScale : 1))});
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('pageshow', schedule);
  screen.orientation?.addEventListener('change', schedule);
  mobile.addEventListener('change', schedule);
  update();
})();
