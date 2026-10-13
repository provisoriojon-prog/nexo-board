(() => {
  'use strict';
  const pane = document.getElementById('icValuesPane');
  const dialog = document.getElementById('icSmbDialog');
  const inspector = document.getElementById('inspector');
  if (!pane || !dialog || !inspector) return;
  const viewport = window.visualViewport;
  const mobile = matchMedia('(max-width: 900px), (orientation:landscape) and (pointer:coarse)');
  const workspace = document.getElementById('workspace');
  let frame = 0, armed = false, active = null;
  let baselineWidth = document.documentElement.clientWidth;
  let baselineHeight = Math.max(window.innerHeight, viewport?.height || 0);
  const properties = ['--ic-vv-top', '--ic-vv-left', '--ic-vv-width', '--ic-vv-height'];

  function textField(element) {
    return !!element?.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=button]),textarea,[contenteditable=true]');
  }
  function editing(element) {
    return textField(element) && (pane.contains(element) || dialog.contains(element) || document.getElementById('boardEditorPane')?.contains(element));
  }
  function clear() {
    for (const node of [inspector, dialog]) {
      node.classList.remove('ic-keyboard-panel', 'ic-keyboard-dialog', 'ic-keyboard-short');
      for (const property of properties) node.style.removeProperty(property);
    }
    active = null;
  }
  function update() {
    frame = 0;
    const width = document.documentElement.clientWidth;
    const height = viewport?.height || window.innerHeight;
    const scale = viewport?.scale || 1;
    // A browser pinch zoom must never be mistaken for the keyboard.
    const appScale = window.NexusMobileLandscape91?.state().scale || 1;
    if (!mobile.matches || Math.abs(scale - appScale) > .025) {
      clear();
      return;
    }
    if (Math.abs(width - baselineWidth) > 70) {
      baselineWidth = width;
      baselineHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, height);
    }
    const inputActive = editing(document.activeElement);
    if (inputActive) armed = true;
    const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, baselineHeight);
    const keyboard = armed && layoutHeight - height > Math.max(90, layoutHeight * .16);
    const target = dialog.open ? dialog : (!pane.hidden || document.getElementById('boardEditorPane')?.hidden === false) && !workspace?.classList.contains('tools-hidden') ? inspector : null;
    if (!target || !keyboard) {
      clear();
      if (!inputActive) {
        armed = false;
        baselineHeight = Math.max(window.innerHeight, height);
      }
      return;
    }
    if (active !== target) clear();
    active = target;
    const top = Math.max(0, viewport?.offsetTop || 0) + 5;
    const left = Math.max(0, viewport?.offsetLeft || 0) + 5;
    target.style.setProperty('--ic-vv-top', `${top}px`);
    target.style.setProperty('--ic-vv-left', `${left}px`);
    target.style.setProperty('--ic-vv-width', `${Math.max(1, (viewport?.width || width) - 10)}px`);
    target.style.setProperty('--ic-vv-height', `${Math.max(1, height - 10)}px`);
    target.classList.add(target === dialog ? 'ic-keyboard-dialog' : 'ic-keyboard-panel');
    target.classList.toggle('ic-keyboard-short', height < 370);
  }
  function schedule() {
    // Viewport changes must still be applied when the browser pauses animation
    // frames during focus/keyboard transitions. Coalesce same-turn events only.
    if (!frame) { frame = 1; queueMicrotask(update); }
  }
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  window.addEventListener('resize', schedule);
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('jcid:tool', schedule);
  dialog.addEventListener('close', schedule);
  new MutationObserver(schedule).observe(dialog, {attributes: true, attributeFilter: ['open']});
  new MutationObserver(schedule).observe(pane, {attributes: true, attributeFilter: ['hidden']});
  if (workspace) new MutationObserver(schedule).observe(workspace, {attributes: true, attributeFilter: ['class']});
  if (mobile.addEventListener) mobile.addEventListener('change', schedule);
  else mobile.addListener(schedule);
  schedule();
})();
