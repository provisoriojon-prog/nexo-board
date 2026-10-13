(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const workspace = $('workspace');
  if (!workspace || $('nexusAppStatus')) return;
  const mobile = matchMedia('(max-width: 900px)');
  const status = document.createElement('div');
  status.id = 'nexusAppStatus';
  status.className = 'nexus-app-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  status.innerHTML = '<span id="nexusAppState">Preparando uso offline…</span><span id="nexusAppMode">Online</span>';
  workspace.after(status);

  if (mobile.addEventListener) mobile.addEventListener('change', renderStatus);
  else mobile.addListener(renderStatus);
  let activity = null;
  function selectedNetName(){
    if(document.body.classList.contains('board-loading')||document.body.classList.contains('source-mode'))return '';
    const field=$('statusNet');
    return field?.readOnly&&!field.disabled?field.value:'';
  }
  function renderStatus() {
    status.classList.toggle('is-net-status',mobile.matches);
    $('nexusAppMode').hidden=mobile.matches;
    if(mobile.matches){
      const name=selectedNetName();
      $('nexusAppState').textContent=name||'Selecione uma linha';
      $('nexusAppState').title=name;
      $('nexusAppState').setAttribute('aria-label',name?'Linha selecionada: '+name:'Nenhuma linha selecionada');
      status.dataset.state='selection';
      delete status.dataset.online;
      return;
    }
    $('nexusAppState').removeAttribute('aria-label');
    const state = window.NexusLibrary?.status?.() || {};
    const online = navigator.onLine !== false;
    let text, detail = '', kind = 'preparing';
    if (activity?.busy) {
      text = activity.message || 'Importando arquivo…';
      kind = 'busy';
    } else if (activity?.error) {
      text = activity.message || 'Falha na importação';
      detail = typeof activity.error === 'string' ? activity.error : text;
      kind = 'error';
    } else if (state.error || window.NexusStartupError) {
      text = 'Falha ao preparar uso offline';
      detail = state.error || window.NexusStartupError;
      kind = 'error';
    } else if (state.prepared) {
      text = 'Pronto para uso offline';
      kind = 'ready';
    } else if (!online) {
      text = 'Uso offline ainda indisponível';
    } else {
      text = 'Preparando uso offline…';
    }
    $('nexusAppState').textContent = text;
    $('nexusAppState').title = detail || text;
    $('nexusAppMode').textContent = online ? 'Online' : 'Offline';
    status.dataset.state = kind;
    status.dataset.online = String(online);
  }
  window.addEventListener('nexus:busy', event => {
    const detail = event.detail || {};
    activity = detail.busy || detail.error ? {busy:!!detail.busy, error:detail.error, message:detail.message} : null;
    renderStatus();
  });
  for (const event of ['nexus:offline', 'nexus:library', 'online', 'offline']) window.addEventListener(event, renderStatus);
  for (const event of ['jcid:selection','jcid:document','jcid:boardchange','jcid:boardloadstate','jcid:netnames-changed']) window.addEventListener(event,renderStatus);
  window.NexusReady?.then(renderStatus, renderStatus);
  renderStatus();
})();
