(() => {
  'use strict';
  if (window.JCIDSession) return;
  const $ = id => document.getElementById(id);
  const scope = location.pathname.replace(/(?:index\.html)?$/, '').replace(/\/$/, '') || '/';
  const key = 'nexus-workspace-v1:' + scope;
  const resetKey = 'nexus-workspace-reset-v1:' + scope;
  const maxBytes = 2 * 1024 * 1024;
  const tools = {'function-studies':'functionStudiesTool',studies:'studiesTool',schematic:'schematicTool', netcolor:'netcolorTool', rffe:'rffeTool', i2c:'i2cTool', values:'icValuesTool', components:'componentSearchTool',boardEditor:'boardEditorTool'};
  const panes = {'function-studies':'functionStudiesPane',studies:'studiesPane',schematic:'schematicPane', netcolor:'netcolorPane', rffe:'rffePane', i2c:'i2cPane', values:'icValuesPane', components:'componentSearchPane',boardEditor:'boardEditorPane'};
  const objectKeys = ['components','boards','outlines','pads','vias','names','netNames','readings','smb','markers','image'];
  let ready = false, restoring = true, timer = 0, firstChange = 0, lastWritten = '', failure = null;
  let busChoices = {}, i2cChoices = {}, saved = null, recovery = null;

  const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !['__proto__','prototype','constructor'].includes(value);
  const numericId = value => Number.isSafeInteger(value) && value >= 0;
  const listId = value => numericId(value) || typeof value === 'string' && value.length <= 100;
  const finite = value => Number.isFinite(value) && Math.abs(value) < 1e12;
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  function boardSnapshot(value) {
    if (!plain(value)) return null;
    const objects = {};
    for (const field of objectKeys) if (typeof value.objects?.[field] === 'boolean') objects[field] = value.objects[field];
    const result = {
      dataRevision:typeof value.dataRevision==='string'&&value.dataRevision.length<=100?value.dataRevision:'base',
      component:numericId(value.component)?value.component:null,
      pin:numericId(value.pin)?value.pin:null,
      net:numericId(value.net)?value.net:null,
      view:listId(value.view)?value.view:'all',
      rotation:[0,90,180,270].includes(value.rotation)?value.rotation:0,
      mirrored:!!value.mirrored, mirroredVertical:!!value.mirroredVertical,
      fit:!!value.fit, selectionTracks:value.selectionTracks !== false, objects,
      layers:Array.isArray(value.layers)?value.layers.filter(listId).slice(0,128):[],
      netColors:[], netColorChecked:[], netColorIsolation:!!value.netColorIsolation,
      netColorIsolationScope:value.netColorIsolationScope === 'checked'?'checked':'all',
      netColorSequence:numericId(value.netColorSequence)?Math.min(value.netColorSequence,1000000):0
    };
    if (plain(value.camera) && [value.camera.x,value.camera.y,value.camera.scale].every(finite) && value.camera.scale > 0)
      result.camera = {x:value.camera.x,y:value.camera.y,scale:value.camera.scale};
    const ids = new Set();
    for (const entry of (Array.isArray(value.netColors)?value.netColors:[]).slice(0,5000)) {
      if (!numericId(entry?.id) || !/^#[0-9a-f]{6}$/i.test(entry.color) || ids.has(entry.id)) continue;
      ids.add(entry.id); result.netColors.push({id:entry.id,color:entry.color.toLowerCase()});
    }
    result.netColorChecked = [...new Set((Array.isArray(value.netColorChecked)?value.netColorChecked:[]).filter(id=>ids.has(id)))];
    if(plain(value.netColorGroups)){
      result.netColorGroup=value.netColorGroup==='alternative'?'alternative':'normal';result.netColorGroups={};
      for(const name of ['normal','alternative']){const input=value.netColorGroups[name]||{},entries=[],seen=new Set();for(const entry of (Array.isArray(input.entries)?input.entries:[]).slice(0,5000)){if(!numericId(entry?.id)||!/^#[0-9a-f]{6}$/i.test(entry.color)||seen.has(entry.id))continue;seen.add(entry.id);entries.push({id:entry.id,color:entry.color.toLowerCase()});}result.netColorGroups[name]={entries,checked:[...new Set((Array.isArray(input.checked)?input.checked:[]).filter(id=>seen.has(id)))],sequence:numericId(input.sequence)?Math.min(input.sequence,1000000):entries.length,isolation:{enabled:!!input.isolation?.enabled,scope:input.isolation?.scope==='checked'?'checked':'all'}};}
    }
    return result;
  }
  function normalize(value) {
    if (!plain(value) || value.version !== 1 || !Array.isArray(value.desktop?.tabs)) return null;
    const tabs = [], seen = new Set();
    for (const tab of value.desktop.tabs.slice(0,8)) {
      if (!identifier(tab?.modelId) || !identifier(tab.itemId) || seen.has(tab.itemId)) continue;
      seen.add(tab.itemId);tabs.push({modelId:tab.modelId,itemId:tab.itemId});
    }
    const boards = {};
    for (const [id, state] of Object.entries(plain(value.boards)?value.boards:{}).slice(0,16)) {
      if (!identifier(id)) continue;
      const snapshot=boardSnapshot(state);if(snapshot)boards[id]=snapshot;
    }
    const ui = plain(value.ui)?value.ui:{}, buses = {}, i2c = {};
    for(const [board,bus] of Object.entries(plain(ui.rffe)?ui.rffe:{}).slice(0,16))
      if(identifier(board)&&identifier(bus))buses[board]=bus;
    for(const [board,bus] of Object.entries(plain(ui.i2c)?ui.i2c:{}).slice(0,16))
      if(identifier(board)&&identifier(bus))i2c[board]=bus;
    return {version:1, desktop:{tabs,activeItem:identifier(value.desktop.activeItem)?value.desktop.activeItem:null,expanded:(Array.isArray(value.desktop.expanded)?value.desktop.expanded:[]).filter(identifier).slice(0,128)}, boards, ui:{
      devices:!!ui.devices,tools:!!ui.tools,tool:Object.hasOwn(tools,ui.tool)?ui.tool:null,
      toolbar:['display','measure','view'].includes(ui.toolbar)?ui.toolbar:null,layers:!!ui.layers,
      rffe:buses,i2c,schematic:identifier(ui.schematic)?ui.schematic:null,
      functionStudies:{functionId:identifier(ui.functionStudies?.functionId)?ui.functionStudies.functionId:'charging',stageId:identifier(ui.functionStudies?.stageId)?ui.functionStudies.stageId:null,playing:ui.functionStudies?.playing!==false},
      editor:{smbOpen:!!ui.editor?.smbOpen,grouping:{diode:ui.editor?.grouping?.diode!==false,smb:ui.editor?.grouping?.smb!==false}},
      deviceScroll:finite(ui.deviceScroll)?Math.max(0,ui.deviceScroll):0,
      netcolorScroll:finite(ui.netcolorScroll)?Math.max(0,ui.netcolorScroll):0
    }};
  }
  function read(storageKey=key) {
    try {const text=localStorage.getItem(storageKey);return text && text.length<=maxBytes?normalize(JSON.parse(text)):null;}
    catch {return null;}
  }
  function keepMissing(snapshot) {
    const opened=new Set(window.JCIDDesktop.snapshot().tabs.map(tab=>tab.itemId));
    const missing=snapshot.desktop.tabs.filter(tab=>!opened.has(tab.itemId));
    if(!missing.length)return;
    recovery=normalize({...snapshot,desktop:{...snapshot.desktop,tabs:missing}});
    try{localStorage.setItem(key+':recovery',JSON.stringify(recovery));}
    catch{message('Não foi possível guardar as abas indisponíveis. Libere espaço antes de atualizar.',true);}
  }
  function message(text, error=false) {
    let notice=$('nexusSessionNotice');
    if(!notice){notice=document.createElement('div');notice.id='nexusSessionNotice';notice.setAttribute('role','status');notice.style.cssText='position:fixed;z-index:1000;left:12px;bottom:max(12px,env(safe-area-inset-bottom));max-width:min(430px,calc(100vw - 24px));padding:10px 14px;background:#edf6fb;color:#193e50;border:1px solid #7da4b7;border-radius:6px;font:12px/1.4 system-ui;box-shadow:0 2px 8px #0002';document.body.append(notice);}
    notice.textContent=text;notice.dataset.error=String(error);
    clearTimeout(notice._timer);if(!error)notice._timer=setTimeout(()=>notice.remove(),7000);
  }
  function currentTool() {return Object.entries(panes).find(([,id])=>$(id)&&!$(id).hidden)?.[0]||null;}
  function capture() {
    const desktop=window.JCIDDesktop?.snapshot();if(!desktop)return null;
    const current=window.JCIDBoards?.current(),wanted=new Set([...desktop.tabs.map(t=>t.itemId),current].filter(Boolean));
    const all=window.JCIDBoards?.snapshotAll?.()||{[current]:window.JCIDBoardView?.snapshot()},boards={};
    for(const id of wanted){const state=boardSnapshot(all[id]);if(state)boards[id]=state;}
    const bus=window.JCIDRFFE?.getSelectedBus();if(bus?.boardId&&bus.busId)busChoices[bus.boardId]=bus.busId;
    const rffe={};for(const id of wanted)if(identifier(busChoices[id]))rffe[id]=busChoices[id];
    const i2cBus=window.JCIDI2C?.getSelectedBus();if(i2cBus?.boardId&&i2cBus.busId)i2cChoices[i2cBus.boardId]=i2cBus.busId;
    const i2c={};for(const id of wanted)if(identifier(i2cChoices[id]))i2c[id]=i2cChoices[id];
    const workspace=$('workspace');
    return normalize({version:1,desktop,boards,ui:{
      devices:!workspace.classList.contains('devices-hidden'),tools:!workspace.classList.contains('tools-hidden'),
      tool:currentTool(),toolbar:window.NexusToolbar45?.current(),layers:!$('layersPanel')?.hidden,
      rffe,i2c,schematic:$('schematicDocument')?.value||null,functionStudies:window.NexusFunctionStudies77?.snapshot(),editor:window.JCIDICEditor?.getSession?.(),deviceScroll:$('deviceList')?.scrollTop||0,netcolorScroll:$('netcolorList')?.scrollTop||0
    }});
  }
  function flush() {
    clearTimeout(timer);timer=0;firstChange=0;
    if(!ready||restoring||document.body.classList.contains('board-loading'))return false;
    try {
      const data=capture();if(!data)return false;
      const text=JSON.stringify(data);if(text===lastWritten)return true;
      if(text.length>maxBytes)throw Error('A sessão ultrapassou o espaço reservado.');
      // setItem is atomic: a quota/storage failure preserves the last good save.
      localStorage.setItem(key,text);lastWritten=text;saved=data;
      if(failure){failure=null;$('nexusSessionNotice')?.remove();}
      window.dispatchEvent(new CustomEvent('nexus:session-saved'));
      return true;
    }catch(error){failure=error?.message||'Armazenamento indisponível';message('Não foi possível salvar a sessão neste aparelho. Libere espaço antes de fechar ou atualizar.',true);return false;}
  }
  function schedule() {
    if(!ready||restoring)return;
    if(!firstChange)firstChange=Date.now();clearTimeout(timer);
    timer=setTimeout(flush,Math.max(0,Math.min(350,1600-(Date.now()-firstChange))));
  }
  function panel(side, enabled) {
    const hidden=$('workspace').classList.contains(side==='devices'?'devices-hidden':'tools-hidden');
    if(hidden===enabled)$(side==='devices'?'devicesButton':'detailsButton')?.click();
  }
  const paint = ()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  async function restoreUI(snapshot) {
    const ui=snapshot.ui;
    window.NexusToolbar45?.open(ui.toolbar);
    if($('layersPanel')&&$('layersPanel').hidden===ui.layers)$('layersButton')?.click();
    if(ui.schematic)window.JCIDSchematic?.selectDocument(ui.schematic);
    window.JCIDI2C?.restore?.({choices:ui.i2c});
    window.NexusFunctionStudies77?.restore?.(ui.functionStudies);
    // Restore the inactive RFFE choice before the visible tool owns highlights.
    const bus=ui.rffe[window.JCIDBoards?.current()];if(bus)window.JCIDRFFE?.selectBus(bus);
    if(ui.tool){const target=$(tools[ui.tool]),pane=$(panes[ui.tool]);if(target&&!target.disabled&&pane?.hidden)target.click();}
    panel('devices',ui.devices);panel('tools',ui.tools);
    await paint();
    const state=snapshot.boards[window.JCIDBoards?.current()];
    if(state){window.JCIDBoardView.restore(state);if(!state.netColorGroups)window.JCIDBoardView.setNetColorChecked(state.netColorChecked);}
    window.JCIDICEditor?.restoreSession?.(ui.editor);
    if($('deviceList'))$('deviceList').scrollTop=ui.deviceScroll;
    if($('netcolorList'))$('netcolorList').scrollTop=ui.netcolorScroll;
  }
  async function recoverMissing() {
    if(!ready||restoring||!recovery||document.body.classList.contains('board-loading'))return;
    const current=capture();if(!current)return;
    const existing=new Set(current.desktop.tabs.map(tab=>tab.itemId));
    const candidates=recovery.desktop.tabs.filter(tab=>!existing.has(tab.itemId)&&window.JCID_DEVICES?.models?.some(model=>model.id===tab.modelId&&model.children?.some(item=>item.id===tab.itemId))).slice(0,8-existing.size);
    if(!candidates.length)return;
    restoring=true;
    try{
      const merged={...current,desktop:{...current.desktop,tabs:[...current.desktop.tabs,...candidates]},boards:{...recovery.boards,...current.boards}};
      window.JCIDBoards.seedSnapshots(merged.boards);
      await window.JCIDDesktop.restoreSession(merged.desktop);await restoreUI(merged);
      const opened=new Set(window.JCIDDesktop.snapshot().tabs.map(tab=>tab.itemId));
      recovery.desktop.tabs=recovery.desktop.tabs.filter(tab=>!opened.has(tab.itemId));
      if(recovery.desktop.tabs.length)localStorage.setItem(key+':recovery',JSON.stringify(recovery));
      else{localStorage.removeItem(key+':recovery');recovery=null;}
      message('As abas recuperadas voltaram à sua sessão.');
    }catch(error){console.warn('NEXUS: abas pendentes continuam guardadas.',error);}
    finally{restoring=false;schedule();}
  }
  async function start() {
    // Imported boards/PDFs replace temporary URLs during boot. Resolve IDs only
    // after the local library and the default document have both finished.
    try {
      await window.NexusReady;
      await window.JCIDDesktop?.whenReady?.();
      if(!window.JCIDDesktop?.restoreSession)return;
      const route=new URLSearchParams(location.search),explicit=['board','componente','id','rede'].some(name=>route.has(name));
      if(saved&&!explicit){
        busChoices={...saved.ui.rffe};i2cChoices={...saved.ui.i2c};window.JCIDI2C?.restore?.({choices:i2cChoices});window.JCIDBoards?.seedSnapshots?.(saved.boards);
        // Loading another tab first remembers the default board. Give that
        // board its saved state before the loader snapshots it on the way out.
        const initial=saved.boards[window.JCIDBoards?.current()];
        if(initial){window.JCIDBoardView.restore(initial);window.JCIDBoardView.setNetColorChecked(initial.netColorChecked);}
        const result=await window.JCIDDesktop.restoreSession(saved.desktop);
        if(result.restored)await restoreUI(saved);
        if(result.missing){keepMissing(saved);message('Algumas abas não estão disponíveis. A sessão foi guardada; importe os pacotes correspondentes para recuperá-las.');}
      }
    }catch(error){
      if(saved){recovery=saved;try{localStorage.setItem(key+':recovery',JSON.stringify(saved));}catch{}}
      console.warn('NEXUS: não foi possível recuperar toda a sessão.',error);message('Não foi possível recuperar toda a sessão. Seus valores e notas continuam salvos.');
    }
    finally{restoring=false;ready=true;window.dispatchEvent(new CustomEvent('nexus:session-ready'));schedule();setTimeout(recoverMissing,0);}
  }
  // This deliberately owns only the workspace snapshot. The library, readings,
  // notes, profiles, pairing and offline installation have separate lifetimes.
  function clearTemporaryState() {
    if(!ready||restoring)throw Error('Aguarde a abertura da sessão antes de limpar.');
    const previous=[key,key+':recovery'].map(name=>[name,localStorage.getItem(name)]);
    restoring=true;clearTimeout(timer);timer=0;firstChange=0;
    try {
      for(const [name] of previous)localStorage.removeItem(name);
      localStorage.setItem(resetKey,Date.now()+':'+Math.random().toString(36).slice(2));
      saved=recovery=null;busChoices={};i2cChoices={};lastWritten='';failure=null;
      return true;
    } catch(error) {
      for(const [name,value] of previous)if(value!==null)try{localStorage.setItem(name,value);}catch{}
      restoring=false;schedule();throw Error('Não foi possível limpar a sessão. Seus mapas foram preservados.');
    }
  }
  function restartClean() {
    const url=new URL(location.href);
    for(const name of ['board','componente','id','rede'])url.searchParams.delete(name);
    location.replace(url.href);
  }
  window.addEventListener('storage',event=>{
    if(event.storageArea!==localStorage||event.key!==resetKey||!event.newValue)return;
    // An older open window must not put the cleared session back on disk.
    restoring=true;clearTimeout(timer);timer=0;saved=recovery=null;restartClean();
  });
  for(const event of ['jcid:camera','jcid:selection','jcid:netcolors','jcid:document','jcid:boardchange','jcid:boardloadstate','jcid:tool','jcid:panels','jcid:rffe-bus','jcid:i2c-bus','jcid:editorstate','nexus:toolbar','nexus:library','nexus:function-study'])window.addEventListener(event,schedule);
  for(const event of ['click','change','input','pointerup','pointercancel','keyup','wheel'])document.addEventListener(event,schedule,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});
  window.addEventListener('pagehide',flush);
  // A normal reload is synchronous; flush even if the debounce has not elapsed.
  window.addEventListener('beforeunload',flush);
  window.addEventListener('nexus:library',()=>setTimeout(recoverMissing,0));
  window.JCIDSession=Object.freeze({flush,key,clearTemporaryState,restartClean,recoverMissing,isReady:()=>ready,isRestoring:()=>restoring,problem:()=>failure});
  saved=read();recovery=read(key+':recovery');
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
