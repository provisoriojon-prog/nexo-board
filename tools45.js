(() => {
  'use strict';
  const inspector = document.getElementById('inspector');
  const menu = inspector?.querySelector('.tool-menu');
  if (!inspector || !menu || document.getElementById('toolsWelcome')) return;

  const icons = {
    schematic: '<path d="M4 4h6v16H4zM14 4h6v16h-6M10 8h4m-4 8h4M6 8h2m-2 4h2m-2 4h2m8-8h2m-2 4h2m-2 4h2"/>',
    netcolor: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="19" r="2"/><path d="m7 6 10 0M6 8l5 9m7-9-5 9"/>',
    rffe: '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 3v4m4-4v4m-4 10v4m4-4v4M3 10h4m-4 4h4m10-4h4m-4 4h4"/>',
    i2c: '<path d="M3 7h18M3 11h18M7 7v10m10-6v6"/><rect x="4" y="17" width="6" height="4" rx="1"/><rect x="14" y="17" width="6" height="4" rx="1"/><circle cx="7" cy="7" r="1"/><circle cx="17" cy="11" r="1"/>',
    components: '<path d="M3 12h6m0-5v10m6-10v10m0-5h6"/>',
    values: '<path d="M4 5h16v14H4zM4 10h16M9 5v14m6-14v14M4 15h16"/>'
  };
  const tools = [
    ['functionStudiesTool', 'Estudos', 'Entenda a carga do iPhone 11 com o fluxo sobre a placa.', 'netcolor'],
    ['studiesTool', 'Notas', 'Anote por linha e guarde suas cores em perfis.', 'values'],
    ['boardEditorTool', 'Editor de placas', 'Renomeie linhas e exporte a placa completa.', 'values'],
    ['schematicTool', 'Esquemático', 'Siga as conexões entre o PDF e a placa.', 'schematic'],
    ['netcolorTool', 'Netcolor', 'Dê cor às linhas e isole o que precisa medir.', 'netcolor'],
    ['rffeTool', 'RFFE', 'Localize os PAs e compare as leituras do NEX-32.', 'rffe'],
    ['i2cTool', 'I2C', 'Explore os barramentos e os CIs ligados a SDA e SCL.', 'i2c'],
    ['icValuesTool', 'Valores IC', 'Edite diodo e SMB direto na matriz de pads.', 'values'],
    ['componentSearchTool', 'Buscar componentes', 'Encontre capacitores, resistores, bobinas e CIs em outras placas.', 'components']
  ];
  const home = document.createElement('section');
  home.id = 'toolsWelcome';
  home.className = 'tools-welcome';
  home.setAttribute('aria-labelledby', 'toolsWelcomeTitle');
  home.innerHTML = '<div class="tools-welcome-heading"><span class="tools-welcome-kicker" data-nexo-brand>' + (window.NexoBrand92?.name() || 'NEXO BOARD') + '</span><h2 id="toolsWelcomeTitle">Explore a placa</h2><p>Escolha uma ferramenta para começar.</p></div><div class="tools-welcome-actions"></div><div class="tools-welcome-tip"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 11v6m0-10v1"/></svg><p>Selecione um componente ou pad no mapa. As ferramentas acompanham a placa que estiver aberta.</p></div>';
  const actions = home.querySelector('.tools-welcome-actions');
  for (const [target, label, description, icon] of tools) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'tools-welcome-action';
    action.dataset.toolTarget = target;
    action.innerHTML = '<span class="tools-welcome-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + icons[icon] + '</svg></span><span class="tools-welcome-copy"><strong>' + label + '</strong><span>' + description + '</span></span><svg class="tools-welcome-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
    action.addEventListener('click', () => document.getElementById(target)?.click());
    actions.append(action);
  }
  menu.after(home);
  // Match keyboard traversal to the two visual rows; keep existing button nodes.
  if(document.getElementById('i2cTool'))for(const id of ['detailsButton','schematicTool','netcolorTool','rffeTool','i2cTool','icValuesTool','componentSearchTool','boardEditorTool','studiesTool','functionStudiesTool']){const element=document.getElementById(id);if(element)menu.append(element);}

  // Group existing elements; their event handlers and connection state remain intact.
  const connection = document.querySelector('#rffePane .rffe-connection');
  if (connection) {
    const controls = document.createElement('div');
    controls.className = 'rffe-connection-actions';
    const state = document.createElement('div');
    state.className = 'rffe-connection-summary';
    for (const id of ['rffeConnect', 'rffeRefreshConnection', 'rffeClearMarks']) {
      const element = document.getElementById(id);
      if (element) controls.append(element);
    }
    for (const id of ['rffeCommunicationState', 'rffeConnectionState']) {
      const element = document.getElementById(id);
      if (element) state.append(element);
    }
    connection.append(controls, state);
  }
  inspector.classList.add('tools-refined');

  let pending = false;
  function reflect() {
    pending = false;
    const active = [...inspector.children].some(element => element !== home && element.matches('section') && !element.hidden && !element.classList.contains('floating'));
    if (home.hidden !== active) home.hidden = active;
    for (const action of actions.children) {
      const target = document.getElementById(action.dataset.toolTarget);
      const unavailable = !target || target.hidden;
      if (action.hidden !== unavailable) action.hidden = unavailable;
    }
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(reflect); }
  }
  new MutationObserver(schedule).observe(inspector, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  for (const event of ['jcid:tool', 'jcid:panels', 'jcid:document']) window.addEventListener(event, schedule);
  reflect();
})();
