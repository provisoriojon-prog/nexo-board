/* Installed mobile uses the same application, with its own safe-area shell. */
(() => {
  'use strict';
  if (window.top !== window.self) return;
  const root = document.documentElement;
  const installed = matchMedia('(display-mode: standalone)');
  const mobile = window.NexoBrand92?.mobile ?? (
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
  const themes = [...document.querySelectorAll('meta[name="theme-color"]')];
  const originalThemes = themes.map(meta => meta.content);
  function update() {
    const active = !!mobile && (installed.matches || navigator.standalone === true);
    const changed = root.classList.contains('nexo-pwa94') !== active;
    root.classList.toggle('nexo-pwa94', active);
    // Match the opaque status-area background instead of tinting it dark blue.
    themes.forEach((meta, i) => { meta.content = active ? '#edf2f6' : originalThemes[i]; });
    if (changed) window.dispatchEvent(new CustomEvent('nexo:pwa-mode', {detail:{active}}));
  }
  if (installed.addEventListener) installed.addEventListener('change', update);
  else installed.addListener(update);
  window.addEventListener('pageshow', update);
  update();
})();
