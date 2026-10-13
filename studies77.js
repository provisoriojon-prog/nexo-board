(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const inspector = $('inspector'), menu = inspector?.querySelector('.tool-menu'), board = window.JCIDBoardView;
  if (!inspector || !menu || !board || $('functionStudiesPane')) return;
  const tool = document.createElement('button');
  tool.type = 'button'; tool.id = 'functionStudiesTool'; tool.className = 'tool-tab'; tool.textContent = 'Estudos'; tool.title = 'Funcionamento dos circuitos';
  tool.setAttribute('aria-controls', 'functionStudiesPane'); tool.setAttribute('aria-pressed', 'false'); tool.setAttribute('aria-expanded', 'false');
  const notes = $('studiesTool'); if (notes) notes.after(tool); else menu.append(tool);
  const pane = document.createElement('section');
  pane.id = 'functionStudiesPane'; pane.className = 'function-studies-panel'; pane.hidden = true; pane.setAttribute('aria-label', 'Estudos do funcionamento');
  pane.innerHTML = `
    <div class="function-studies-model"><strong id="functionStudyModel">Abra uma placa</strong><select id="functionStudyFunction" aria-label="Função do aparelho"></select></div>
    <div class="function-studies-scroll" id="functionStudyScroll">
      <div id="functionStudyContent" hidden>
        <div class="function-studies-actions"><button id="functionStudyPlayback" type="button" aria-pressed="true"></button><button id="functionStudyLocate" type="button" title="Enquadrar os circuitos da carga"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5"/><circle cx="12" cy="12" r="3"/></svg><span>Enquadrar</span></button></div>
        <div class="function-studies-circuits"><div class="function-studies-circuits-head"><strong>Circuitos</strong><button id="functionStudyAll" type="button" aria-pressed="true" title="Mostrar toda a carga sem mover a placa">Todos</button></div><div class="function-studies-components" id="functionStudyComponents" aria-label="Selecionar e localizar circuitos da carga"></div></div>
        <div class="function-studies-summary" id="functionStudySummary"><div><strong id="functionStudySelectedName">Visão geral</strong><span id="functionStudySelectedLabel"></span></div><p id="functionStudySelectedDescription">Selecione um circuito para isolar suas conexões.</p></div>
        <div class="function-studies-legend" id="functionStudyLegend" aria-label="Entrada e saída em relação ao circuito selecionado">
          <div class="study85-directions" role="group" aria-label="Fluxos visíveis"><button type="button" data-study-direction="both"><span>Todas</span></button><button type="button" data-study-direction="in"><i></i><span>IN</span></button><button type="button" data-study-direction="out"><i></i><span>OUT</span></button><button type="button" data-study-direction="neutral"><i></i><span>Geral</span></button></div>
        </div>
        <p class="function-studies-hint89" title="O pontilhado completa trechos ausentes da geometria, sem representar cobre adicional.">Pontilhado: continuidade elétrica.</p>
      </div>
      <div class="function-studies-empty" id="functionStudyEmpty"><svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="5" width="13" height="12" rx="2"/><rect x="24" y="23" width="13" height="12" rx="2"/><path d="M16 11h14v12m-3-4 3 4 3-4M9 17v12h15m-4-3 4 3-4 3"/></svg><strong id="functionStudyEmptyTitle">Comece pela carga do iPhone 11</strong><p id="functionStudyEmptyText">Abra a placa principal do iPhone 11 para acompanhar as conexões no mapa.</p></div>
    </div>
    <p id="functionStudyStatus" class="function-studies-status" role="status" aria-live="polite"></p>`;
  inspector.append(pane);
  pane.addEventListener('click',event=>{const button=event.target.closest('[data-study-direction]');if(button)flow()?.setDirectionFilter(button.dataset.studyDirection);});

  const functions = [
    ['charging', 'Carga'], ['camera1', 'Câmera 1'], ['camera2', 'Câmera 2'], ['camera3', 'Câmera 3'],
    ['front-camera', 'Câmera frontal'], ['power-on', 'Power on'], ['display', 'Display'], ['touch', 'Touch'],
    ['audio', 'Áudio'], ['vibration', 'Vibração'], ['wifi', 'Wi-Fi'], ['nfc', 'NFC'], ['gps', 'GPS']
  ];
  for (const [id, name] of functions) {
    const option = document.createElement('option'); option.value = id; option.textContent = name + (id === 'charging' ? '' : ' · Em breve');
    option.disabled = id !== 'charging'; $('functionStudyFunction').append(option);
  }
  let study = null, context = null, playing = true, message = '', renderedStudy = null;
  const flow = () => window.NexusStudyFlow77;
  const composed = () => window.JCID_BOARD?.nexusComposition?.version === 1;
  function descriptor() {
    const doc = window.JCIDDesktop?.currentDocument(), active = window.JCID_ACTIVE_BOARD;
    if (!doc) return null;
    return { ...doc, boardId: active?.id || null, available: !doc.sourceMode && !composed() && !document.body.classList.contains('board-loading') && active?.modelId === doc.modelId };
  }
  function canShow() { return !!study && context?.available && !pane.hidden; }
  function changed() { window.dispatchEvent(new CustomEvent('nexus:function-study')); }
  function directed(report) { return !!(report?.visibleRoutes || report?.visualRoutes || []).some(route => route.directed); }
  function reflectContext(report = flow()?.state()) {
    const selected = report?.selectedComponent || null;
    $('functionStudySelectedName').textContent = selected?.name || 'Visão geral';
    $('functionStudySelectedLabel').textContent = selected?.label || '';
    $('functionStudySelectedDescription').textContent = selected?.description || (selected ? '' : 'Selecione um circuito para isolar suas conexões.');
    $('functionStudySelectedDescription').hidden = !$('functionStudySelectedDescription').textContent;
    $('functionStudySelectedLabel').hidden = !selected?.label;
    $('functionStudySummary').classList.toggle('has-selection', !!selected);
    $('functionStudyLegend').setAttribute('aria-label', selected ? 'Entrada e saída em relação a ' + selected.name : 'Entrada e saída em relação ao circuito selecionado');
    const roles=report?.directionCounts||{in:0,out:0,neutral:0};
    for(const host of [$('functionStudyLegend')]){
      for(const button of host.querySelectorAll('[data-study-direction]')){
        const key=button.dataset.studyDirection;
        button.disabled=key==='both'?!study:!study||!roles[key];
        button.setAttribute('aria-pressed',String((report?.directionFilter||'both')===key));
        button.title=key==='both'?'IN verde, OUT vermelho e demais conexões em azul-escuro':key==='neutral'?'Conexões gerais em azul-escuro':(key==='in'?'Entradas verdes':'Saídas vermelhas')+(selected?' · '+selected.name:'');
        button.setAttribute('aria-label',button.title);
      }
    }
    for (const button of $('functionStudyComponents').querySelectorAll('[data-component-id]')) button.setAttribute('aria-pressed', String(!!selected && Number(button.dataset.componentId) === selected.id));
    $('functionStudyAll').setAttribute('aria-pressed', String(!selected));
    $('functionStudyAll').disabled = !study;
  }
  function reflectPlayback(report = null) {
    const available = !report || directed(report), running = playing && available;
    const button = $('functionStudyPlayback'); button.setAttribute('aria-pressed', String(running));
    button.title = !available ? 'Estas conexões não indicam um sentido único' : running ? 'Pausar a animação; manter as conexões visíveis' : 'Animar o sentido das conexões';
    button.replaceChildren();
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    if (running) {
      for (const x of [6, 14]) { const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); for (const [key, value] of Object.entries({x, y:4, width:4, height:16, rx:1, fill:'currentColor', stroke:'none'})) bar.setAttribute(key, value); icon.append(bar); }
    } else { const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path'); shape.setAttribute('d', 'm8 5 11 7-11 7Z'); icon.append(shape); }
    const label = document.createElement('span'); label.textContent = running ? 'Pausar' : 'Animar'; button.append(icon, label);
    button.disabled = !study || !available; $('functionStudyLocate').disabled = !study;
  }
  function status(report = null) {
    const element = $('functionStudyStatus');
    if (message) { element.textContent = message; return; }
    if (!study) { element.textContent = document.body.classList.contains('board-loading') ? 'Abrindo placa…' : composed() ? 'Abra um mapa individual para estudar a carga.' : 'Primeiro estudo disponível: carga do iPhone 11.'; return; }
    if (report && !report.available) { element.textContent = report.reason || 'As conexões da carga não estão disponíveis neste mapa.'; return; }
    if (report?.missing?.length) { element.textContent = 'Algumas conexões não foram encontradas nesta revisão do mapa.'; return; }
    const scope = report?.selectedComponent?.name || 'Carga';
    element.textContent = report && !directed(report) ? scope + ' · Conexões sem sentido único' : scope + (playing ? ' · Animando' : ' · Pausado');
    const net = report?.activeNet;
    if (net !== null && net !== undefined) element.textContent = (window.JCID_BOARD?.nets.find(n=>n.id===net)?.name || 'Linha selecionada') + (directed(report) ? (playing?' · Animando':' · Pausado') : ' · Ligação destacada');
  }
  function showFlow() {
    if (!canShow()) return;
    const report = flow()?.show(study, { playing });
    if (!report) { message = 'O visualizador do estudo não carregou. Reabra a página para atualizar.'; status(); return; }
    reflectContext(report); reflectPlayback(report); $('functionStudyLocate').disabled = !report.available; status(report);
  }
  // Compatibility for older sessions/callers: this tool always shows the complete circuit.
  function selectStage() { if (!study) return false; message = ''; showFlow(); changed(); return true; }
  function locateComponent(name) {
    if (!canShow()) return false;
    const wanted = String(name).toUpperCase();
    const component = window.JCID_BOARD?.components.find(value => (Number.isInteger(name) && value.id === name) || [value.name, value.sourceComponentName, ...(value.componentAliases || [])].some(alias => alias && String(alias).toUpperCase() === wanted));
    const found = Number.isInteger(component?.id) && board.focusComponentById(component.id);
    if (found) flow()?.focusComponent(component.id);
    message = found ? '' : 'Componente oculto ou ausente nesta revisão do mapa.'; const report = flow()?.state(); reflectContext(report); reflectPlayback(report); status(report); return !!found;
  }
  function renderComponents() {
    const list = $('functionStudyComponents'); list.replaceChildren();
    if (!study) return;
    const profiles = study.componentProfiles || [], ids = [...new Set([...profiles.map(value => value.id), ...study.flows.flatMap(value => [value.from?.componentId, value.to?.componentId])].filter(Number.isInteger))];
    const components = ids.map(id => window.JCID_BOARD?.components.find(value => value.id === id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
    for (const component of components) {
      const profile = profiles.find(value => value.id === component.id), button = document.createElement('button'); button.type = 'button'; button.className = 'function-studies-component'; button.dataset.componentId = component.id; button.textContent = component.name; button.title = 'Selecionar e localizar ' + component.name + (profile?.label ? ' · ' + profile.label : ''); button.setAttribute('aria-pressed', 'false'); button.addEventListener('click', () => locateComponent(component.id)); list.append(button);
    }
  }
  function refresh({ force = false } = {}) {
    const next = descriptor(), nextStudy = next?.available && window.NexusCharging77?.getStudy(window.JCID_BOARD, next) || null;
    const different = context?.itemId !== next?.itemId || context?.boardId !== next?.boardId || study?.id !== nextStudy?.id;
    context = next; study = nextStudy;
    if (different || force) message = '';
    $('functionStudyModel').textContent = context?.modelLabel || 'Abra uma placa'; $('functionStudyModel').title = context?.itemLabel || '';
    $('functionStudyContent').hidden = !study; $('functionStudyEmpty').hidden = !!study;
    if (study) {
      if (renderedStudy !== study || force) { renderComponents(); renderedStudy = study; }
    } else {
      renderedStudy = null;
      $('functionStudyEmptyTitle').textContent = document.body.classList.contains('board-loading') ? 'Abrindo a placa…' : composed() ? 'Estudo em mapa individual' : 'Carga do iPhone 11';
      $('functionStudyEmptyText').textContent = composed() ? 'Abra um mapa individual da placa principal do iPhone 11.' : context?.available ? 'Este mapa ainda não tem um estudo de carga.' : 'Abra a placa principal do iPhone 11 para acompanhar a carga.';
      if (!pane.hidden) flow()?.clear();
    }
    reflectPlayback(); status(); if (canShow()) showFlow();
  }
  function open() {
    playing = true; flow()?.clear(); board.clearSelection();
    board.openTools(); pane.hidden = false; tool.setAttribute('aria-pressed', 'true'); tool.setAttribute('aria-expanded', 'true');
    window.dispatchEvent(new CustomEvent('jcid:tool', { detail: 'function-studies' })); refresh(); return true;
  }
  function close() {
    const active = !pane.hidden; pane.hidden = true; tool.setAttribute('aria-pressed', 'false'); tool.setAttribute('aria-expanded', 'false'); if (active) flow()?.clear();
  }
  function snapshot() { return { functionId: 'charging', stageId: null, playing }; }
  function restore(value) {
    if (!value || typeof value !== 'object') return false;
    // Opening/reloading a study starts the flow. Pause is only for this viewing.
    playing = true;
    // Session bookkeeping: restoring never opens the tool or takes another tool's overlay.
    refresh(); return true;
  }
  tool.addEventListener('click', () => pane.hidden ? open() : close());
  $('functionStudyFunction').addEventListener('change', () => { $('functionStudyFunction').value = 'charging'; });
  $('functionStudyPlayback').addEventListener('click', () => { playing = !playing; message = ''; reflectPlayback(); const report = canShow() ? flow()?.setPlaying(playing) : null; status(report); changed(); });
  $('functionStudyAll').addEventListener('click', () => { if (!canShow()) return; message = ''; flow()?.focusComponent(null); const report = flow()?.state(); reflectContext(report); reflectPlayback(report); status(report); changed(); });
  $('functionStudyLocate').addEventListener('click', () => { if (!canShow()) return; message = flow()?.focusStage(null) ? '' : 'Nenhum circuito disponível para enquadrar.'; status(flow()?.state()); });
  pane.addEventListener('keydown', event => { if (event.target.matches('select,input,textarea') || ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) event.stopPropagation(); });
  const reflectSelection = () => { if (canShow()) { message = ''; const report = flow()?.state(); if (typeof report?.playing === 'boolean') playing = report.playing; reflectContext(report); reflectPlayback(report); status(report); } };
  window.addEventListener('jcid:selection', reflectSelection);
  window.addEventListener('nexus:study-flow', reflectSelection);
  window.addEventListener('jcid:tool', event => { if (event.detail !== 'function-studies') close(); });
  for (const event of ['jcid:document', 'jcid:boardchange', 'jcid:boardloadstate', 'jcid:netnames-changed', 'nexus:session-ready']) window.addEventListener(event, () => refresh());
  window.addEventListener('pageshow', event => {
    // BFCache restores the DOM after pagehide has cleared the temporary flow.
    // Rebuild only the tool still owned by this pane, and never resume motion.
    if (!event.persisted || pane.hidden || tool.getAttribute('aria-pressed') !== 'true') return;
    playing = false; message = ''; refresh();
    if (canShow()) flow()?.setPlaying(false);
    changed();
  });
  window.NexusFunctionStudies77 = Object.freeze({ open, close, refresh, snapshot, restore, selectStage, locateComponent, getStudy: () => study, getContext: () => context ? { ...context } : null });
  refresh();
})();
