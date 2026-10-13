(() => {
  'use strict';
  const ribbon = document.querySelector('.workbench-ribbon');
  const layers = document.getElementById('layersPanel');
  const status = document.getElementById('nexusAppStatus');
  const tabs = document.querySelector('.document-toolbar');
  if (!ribbon || !(status || tabs) || document.getElementById('nexusFocusButton')) return;
  const mobile = matchMedia('(max-width:900px), (hover:none) and (pointer:coarse)');
  // Retain the existing preference so an installed/mobile app keeps its state.
  // The mode now works at every viewport size; this is not OS fullscreen.
  const key = 'nexus-mobile-focus-v1';
  let preferred = false;
  try { preferred = localStorage.getItem(key) === 'true'; } catch {}
  ribbon.id ||= 'nexusTopToolbar';
  const button = document.createElement('button');
  button.id = 'nexusFocusButton';
  button.type = 'button';
  button.className = 'nexus-focus-button';
  button.setAttribute('aria-controls', ribbon.id + (layers ? ' ' + layers.id : ''));
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="focus-expand" d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path class="focus-restore" d="M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5"/></svg>';
  function render() {
    const host = mobile.matches ? status || tabs : tabs || status;
    const restoreFocus = document.activeElement === button;
    if (button.parentElement !== host) {
      host.append(button);
      if (restoreFocus) button.focus({preventScroll:true});
    }
    button.classList.toggle('nexus-focus-button--tabs', host === tabs);
    const active = preferred;
    const changed = document.body.classList.contains('nexus-focus-mode') !== active;
    button.hidden = false;
    button.setAttribute('aria-pressed', String(active));
    button.title = active ? 'Reexibir menu superior' : 'Ampliar área do mapa';
    button.setAttribute('aria-label', button.title);
    if (active && (ribbon.contains(document.activeElement) || layers?.contains(document.activeElement))) button.focus({preventScroll:true});
    document.body.classList.toggle('nexus-focus-mode', active);
    // Resize only the viewport, without restoring/changing selection or tool state.
    if (changed) window.JCIDBoardView?.resizeViewport?.();
    window.dispatchEvent(new CustomEvent('nexus:focusmode', {detail:{active}}));
  }
  button.addEventListener('click', () => {
    preferred = !preferred;
    try { localStorage.setItem(key, String(preferred)); } catch {}
    render();
  });
  mobile.addEventListener('change', render);
  render();
})();
