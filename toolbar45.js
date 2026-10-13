(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ribbon = document.querySelector('.workbench-ribbon');
  const main = ribbon?.querySelector('.ribbon-scroll');
  if (!ribbon || !main || window.NexusToolbar45) return;

  // Reuse the original buttons: their state and board event handlers stay intact.
  const svg = paths => '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>';
  const definitions = [
    { id:'display', label:'Exibição', icon:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>', buttons:['imageButton','namesButton','componentsButton','netNamesButton'] },
    { id:'measure', label:'Medições', icon:'<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 6h8v4H8zM9 17h.01M15 17h.01"/><path d="m10 13 2 2 2-2"/>', buttons:['diodeButton','smbButton'] },
    { id:'view', label:'Visualizar', icon:'<path d="M3 9V3h6m6 0h6v6m0 6v6h-6M9 21H3v-6"/><path d="m8 12 4-4 4 4-4 4-4-4Z"/>', buttons:['rotateLeftButton','rotateButton','mirrorButton','mirrorVerticalButton','fitView','previousConnection','nextConnection'] }
  ];
  const subrow = document.createElement('div');
  subrow.id = 'nexusToolbarOptions';
  subrow.className = 'nexus-toolbar-options';
  subrow.hidden = true;
  ribbon.insertBefore(subrow, $('searchForm'));
  let active = null;
  const groups = new Map();

  function setGroup(id, returnFocus = false) {
    active = groups.has(id) ? id : null;
    for (const [key, group] of groups) {
      const selected = key === active;
      group.trigger.setAttribute('aria-expanded', String(selected));
      group.panel.hidden = !selected;
    }
    subrow.hidden = !active;
    if (returnFocus && id) groups.get(id)?.trigger.focus({preventScroll:true});
    window.dispatchEvent(new CustomEvent('nexus:toolbar', {detail:{group:active}}));
  }

  const fragments = [];
  let files = $('nexusFilesButton');
  if (!files) {
    files = document.createElement('button');
    files.id = 'nexusDesktopFilesButton';
    files.type = 'button';
    files.className = 'ribbon-button';
    files.title = 'Exibir ou recolher a biblioteca de aparelhos';
    files.setAttribute('aria-controls', 'deviceSidebar');
    files.innerHTML = svg('<path d="M3 6h7l2 3h9v11H3ZM3 6V3h7l2 3h9v3"/><path d="M7 13h10m-10 3h7"/>') + '<span>Arquivos</span>';
    files.addEventListener('click', () => $('devicesButton')?.click());
    const workspace = $('workspace');
    const syncFiles = () => files.setAttribute('aria-expanded', String(!workspace?.classList.contains('devices-hidden')));
    if (workspace) new MutationObserver(syncFiles).observe(workspace, {attributes:true,attributeFilter:['class']});
    syncFiles();
  }
  fragments.push(files);

  for (const definition of definitions) {
    const trigger = document.createElement('button');
    trigger.id = 'nexus' + definition.id[0].toUpperCase() + definition.id.slice(1) + 'Tools';
    trigger.type = 'button';
    trigger.className = 'ribbon-button nexus-toolbar-group';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'nexusToolbar-' + definition.id);
    trigger.title = 'Exibir ou recolher opções de ' + definition.label.toLocaleLowerCase('pt-BR');
    trigger.innerHTML = svg(definition.icon) + '<span>' + definition.label + '</span>';

    const panel = document.createElement('div');
    panel.id = 'nexusToolbar-' + definition.id;
    panel.className = 'nexus-toolbar-group-panel nexus-toolbar-' + definition.id;
    panel.setAttribute('role', 'toolbar');
    panel.setAttribute('aria-label', definition.label);
    panel.hidden = true;
    for (const id of definition.buttons) {
      const button = $(id);
      if (!button) continue;
      if (button.closest('.board-controls')) button.classList.add('board-controls');
      panel.append(button);
    }
    subrow.append(panel);
    groups.set(definition.id, {trigger,panel});
    trigger.addEventListener('click', () => setGroup(active === definition.id ? null : definition.id));
    fragments.push(trigger);
  }
  fragments.push($('layersButton'), $('settingsButton'));
  main.replaceChildren(...fragments.filter(Boolean));
  main.setAttribute('role', 'toolbar');
  main.setAttribute('aria-label', 'Opções da placa');
  ribbon.classList.add('nexus-toolbar45');
  document.documentElement.classList.add('nexus-native-shell');
  $('previousConnection')?.classList.add('nexus-toolbar-nav-start');

  // A group stays open while actions are repeated, including on touchscreens.
  // Escape is an explicit close action and leaves dialogs to their own handler.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !active || document.querySelector('dialog[open]')) return;
    if (event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    const id = active;
    setGroup(null);
    groups.get(id)?.trigger.focus({preventScroll:true});
    event.preventDefault();
  });

  const touchUI = matchMedia('(hover: none), (pointer: coarse)');
  const allowsText = target => target instanceof Element && !!target.closest('input,textarea,[contenteditable="true"],[data-allow-selection]');
  document.addEventListener('contextmenu', event => {
    if ((touchUI.matches || event.pointerType === 'touch') && !allowsText(event.target)) event.preventDefault();
  });
  document.addEventListener('selectstart', event => {
    if (touchUI.matches && !allowsText(event.target)) event.preventDefault();
  });


  // Keep the directional icon above a plain label on every screen size.
  for (const [id,direction] of [['rotateLeftButton','esquerda'],['rotateButton','direita']]) {
    const button=$(id),label=button?.querySelector(':scope > span');
    if(label)label.textContent='Girar';
    button?.setAttribute('aria-label','Girar 90° para a '+direction);
  }

  const mobileLayout = matchMedia('(max-width:900px)');
  const labelMeasure = document.createElement('canvas').getContext('2d');
  const rows = [main, ...[...groups.values()].map(group => group.panel)];
  let fitFrame = 0;
  function fitMobileRows() {
    fitFrame = 0;
    for (const row of rows) {
      if (!mobileLayout.matches) {
        row.style.removeProperty('--nexus-row-label');
        row.style.removeProperty('--nexus-row-icon');
        row.style.removeProperty('--nexus-row-count');
        continue;
      }
      if (!row.getClientRects().length) continue;
      const buttons = [...row.children].filter(button => button.matches('.ribbon-button') && getComputedStyle(button).display !== 'none');
      if (!buttons.length) continue;
      row.style.setProperty('--nexus-row-count', buttons.length);
      let font = 10.5;
      for (const button of buttons) {
        const label = [...button.children].find(node => node.tagName === 'SPAN' && getComputedStyle(node).display !== 'none');
        if (!label) continue;
        const style = getComputedStyle(button);
        const available = Math.max(1, button.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 4);
        labelMeasure.font = '400 10.5px ' + getComputedStyle(label).fontFamily;
        const natural = labelMeasure.measureText(label.textContent.trim()).width + (label.querySelector('svg') ? 13 : 0);
        if (natural) font = Math.min(font, 10.5 * available / natural);
      }
      // One common text size per row avoids an uneven ribbon. No clipping or ellipsis.
      row.style.setProperty('--nexus-row-label', Math.max(1,Math.floor(font*10)/10)+'px');
      const buttonWidth = Math.min(...buttons.map(button=>button.getBoundingClientRect().width));
      row.style.setProperty('--nexus-row-icon',Math.max(10,Math.min(20,buttonWidth*.4))+'px');
    }
  }
  function queueMobileFit() { if (!fitFrame) fitFrame = requestAnimationFrame(fitMobileRows); }
  const widths = new WeakMap();
  new ResizeObserver(entries => {
    if (entries.some(entry => {const changed=widths.get(entry.target)!==entry.contentRect.width;widths.set(entry.target,entry.contentRect.width);return changed;})) queueMobileFit();
  }).observe(ribbon);
  mobileLayout.addEventListener('change',queueMobileFit);
  window.addEventListener('nexus:toolbar',queueMobileFit);
  window.addEventListener('resize',queueMobileFit);
  document.fonts?.ready.then(queueMobileFit);
  new MutationObserver(queueMobileFit).observe(document.body,{attributes:true,attributeFilter:['class']});
  queueMobileFit();

  window.NexusToolbar45 = Object.freeze({open:setGroup, current:() => active});
})();
