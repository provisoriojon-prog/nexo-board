(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root.document) return;
  root.NexoBrand92 = api;
  api.apply();
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', api.apply, {once: true});
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  // Device identity stays fixed when the window is resized or the phone rotates.
  // A Windows touch screen remains the desktop edition.
  const navigator = root.navigator || {};
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
  const appName = mobile ? 'NEXO MOBILE' : 'NEXO BOARD';
  const name = () => appName;
  const title = context => (String(context || '').trim() || appName) + ' · SB APPLE';
  function apply() {
    const document = root.document;
    if (!document) return;
    document.querySelectorAll('[data-nexo-brand]').forEach(element => { element.textContent = appName; });
    for (const key of ['application-name', 'apple-mobile-web-app-title']) {
      const meta = document.querySelector('meta[name="' + key + '"]');
      if (meta) meta.setAttribute('content', appName);
    }
    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) manifest.setAttribute('href', mobile ? 'manifest.webmanifest' : 'manifest-desktop.webmanifest');
    // Do not overwrite the current board or document after asynchronous activation.
    if (/^(?:NEXUS(?:[- ](?:PM|MOBILE))?|NEXO (?:BOARD|MOBILE))(?: · SB APPLE)?$/i.test(document.title || '')) document.title = title();
  }
  return Object.freeze({mobile, name, title, apply});
});
