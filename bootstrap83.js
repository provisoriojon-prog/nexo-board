/* Parser-time shell: an up-to-date opening layout, not a stored screenshot.
   No timers, board data, preferences, or imported files are read or changed. */
(() => {
  'use strict';
  const root = document.documentElement;
  if (window.NexusBootstrap83) return;
  const definitions = [
    ['Arquivos','<path d="M3 6h7l2 3h9v11H3ZM3 6V3h7l2 3h9v3"/><path d="M7 13h10m-10 3h7"/>'],
    ['Exibição','<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>'],
    ['Medições','<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 6h8v4H8zM9 17h.01M15 17h.01m-5-4 2 2 2-2"/>'],
    ['Visualizar','<path d="M3 9V3h6m6 0h6v6m0 6v6h-6M9 21H3v-6m5-3 4-4 4 4-4 4-4-4Z"/>'],
    ['Camadas','<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>'],
    ['Ajustes','<path d="M5 3v6m0 4v8m7-18v11m0 4v3m7-18v3m0 4v11M2 9h6m1 5h6m1-8h6"/>']
  ];
  let opening = null, done = false, observer;
  const status = { ready:false, reason:'loading' };
  function finish(reason) {
    if (done) return;
    done = true;
    status.ready = reason === 'toolbar-ready';
    status.reason = reason;
    root.classList.remove('nexus-shell-pending83');
    opening?.remove();
    observer?.disconnect();
    document.removeEventListener('DOMContentLoaded', parsed);
    window.removeEventListener('error', failed, true);
    window.dispatchEvent(new CustomEvent('nexus:shell-ready83', {detail:{...status}}));
  }
  function inspect() {
    if (done) return;
    const ribbon = document.querySelector('.workbench-ribbon');
    if (!ribbon) return;
    if (ribbon.classList.contains('nexus-toolbar45')) { finish('toolbar-ready');return; }
    if (opening) return;
    opening = document.createElement('div');
    opening.className = 'nexus-opening83';
    opening.setAttribute('aria-hidden','true');
    const groups = document.createElement('div');
    groups.className = 'nexus-opening83-groups';
    for (const [label,paths] of definitions) {
      const item = document.createElement('span');
      item.className = 'nexus-opening83-item';
      item.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'+paths+'</svg><span>'+label+'</span>';
      groups.append(item);
    }
    const search = document.createElement('span');
    search.className = 'nexus-opening83-search';
    search.textContent = 'Componente, rede ou pino';
    opening.append(groups,search);
    ribbon.append(opening);
  }
  function parsed() { inspect();if (!done) finish('parser-fallback'); }
  function failed(event) {
    const script = event.target;
    if (script?.tagName === 'SCRIPT' && /(?:^|\/)toolbar45\.js(?:\?|$)/.test(script.src || '')) finish('toolbar-load-error');
  }
  window.NexusBootstrap83 = Object.freeze({state:()=>({...status})});
  root.classList.add('nexus-shell-pending83');
  observer = new MutationObserver(inspect);
  observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('error',failed,true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',parsed,{once:true});
  else parsed();
  inspect();
})();
