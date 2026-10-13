(() => {
 'use strict';
 const $=id=>document.getElementById(id),pane=$('rffePane'),button=$('rffeTool'),board=window.JCIDBoardView;
 if(!pane||!board)return;
 const composed=()=>window.JCID_BOARD?.nexusComposition?.version===1,compositionMessage='Junção: indisponível';
 const choices=new Map(),cache=new WeakMap(),noteCache=new Map(),emptyMapping=Object.freeze({}),roles=['sda','scl','vdd'],roleLabels={sda:'SDA',scl:'SCL',vdd:'1,8 V'},roleColors={sda:'#80ed80',scl:'#a148e5',vdd:'#1746bd'};
 let lastData=null;
 let context=null,buses=[],selected=null,message='',busy=false,allSignals=false;
 const marksCache=new Map();
 function boardScope(){return context?.boardId+(window.JCID_BOARD?.nexusRevision?'@'+window.JCID_BOARD.nexusRevision:'');}
 function marks(){const id=context?.boardId;if(!id)return new Set();if(!marksCache.has(id)){let names=window.JCID_BOARD?.nexusPersonal?.rffe?.marks||[];try{const value=JSON.parse(localStorage.getItem('jcid-rffe-marks-v1:'+boardScope()));if(Array.isArray(value))names=value.filter(name=>typeof name==='string');}catch{}const aliases=new Map((window.JCID_BOARD.components||[]).flatMap(c=>[c.name,c.sourceComponentName,...(c.componentAliases||[])].filter(Boolean).map(n=>[n,c.name])));marksCache.set(id,new Set(names.map(n=>aliases.get(n)).filter(Boolean)));}return marksCache.get(id);}
 function syncMarks(){const names=marks();board.setMarkedComponents?.(context?.available?(window.JCID_BOARD?.components||[]).filter(c=>names.has(c.name)).map(c=>c.id):[]);$('rffeClearMarks').disabled=busy||!context?.available||!names.size;for(const input of $('rffeRows').querySelectorAll('.rffe-mark'))input.checked=names.has(input.dataset.component);}
 function saveMarks(){try{localStorage.setItem('jcid-rffe-marks-v1:'+boardScope(),JSON.stringify([...marks()]));}catch{message='Marcações mantidas nesta sessão; não foi possível salvá-las.';status();}syncMarks();}
 function markDevice(device,enabled){if(busy||!context?.available)return;const names=marks();if(enabled)names.add(device.component);else names.delete(device.component);saveMarks();}
 function clearMarkedComponents(){if(busy||!context?.available)return;marks().clear();saveMarks();}
 function passivePads(){const ids=!pane.hidden&&!busy&&context?.available?roles.map(role=>targets(role)[0]?.pinId).filter(Number.isInteger):[];board.setToolPins?.([...new Set(ids)]);}
 function clearPassivePads(){board.setToolPins?.([]);}
 function current(){const doc=window.JCIDDesktop?.currentDocument();if(!doc)return null;const active=window.JCID_ACTIVE_BOARD,available=!composed()&&!doc.sourceMode&&!document.body.classList.contains('board-loading')&&active?.modelId===doc.modelId;return {...doc,boardId:available?active.id:null,available};}
 function catalog(){return window.JCID_BOARD?.rffeCatalog||window.JCID_RFFE_CATALOG?.boards?.[context?.boardId]||emptyMapping;}
 function notesKey(id=selected.id){return 'jcid-rffe-notes-v1:'+boardScope()+':'+id;}
 function notes(){const key=notesKey();if(!noteCache.has(key)){let value={};for(const id of [...(selected.aliasIds||[]),selected.id])Object.assign(value,window.JCID_BOARD?.nexusPersonal?.rffe?.notes?.[id]||{});for(const id of [...(selected.aliasIds||[]),selected.id])try{const parsed=JSON.parse(localStorage.getItem(notesKey(id)));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))value={...value,...parsed};}catch{}const mapped={};for(const c of window.JCID_BOARD.components||[]){for(const name of [c.sourceComponentName,...(c.componentAliases||[]),c.name])if(name&&Object.prototype.hasOwnProperty.call(value,name))mapped[c.name]=value[name];}noteCache.set(key,mapped);}return noteCache.get(key);}
 function findBus(id){return buses.find(bus=>bus.id===id||bus.aliasIds?.includes(id));}
 function rememberNote(component,value){const saved=notes();saved[component]=value.slice(0,500);try{localStorage.setItem(notesKey(),JSON.stringify(saved));}catch{$('rffeStatus').textContent='A nota ficará disponível somente nesta sessão.';}}
 function targets(role){return selected?.targets?.[role]||[];}
 function status(){
  $('rffeStatus').textContent=composed()?compositionMessage:message||(busy?'Abrindo placa…':!context?'Abra uma placa na lista de aparelhos.':!context.available?'Abra um mapa deste aparelho para consultar as linhas RFFE.':!buses.length?'Nenhuma linha RFFE identificada neste mapa.':!selected?.devices.length?'Nenhum PA/CI com ligação confirmada neste RFFE.':'Selecione um PA/CI ou localize SDA, SCL e 1,8 V.');
 }
 function allSignalIds(){return [...new Set(roles.flatMap(role=>(selected?.signals[role]||[]).map(net=>net.id)))];}
 function clearAllSignals(){clearPassivePads();allSignals=false;board.clearToolNets?.();$('rffeLocateall')?.setAttribute('aria-pressed','false');}
 function renderSignals(){const all=$('rffeLocateall');if(all){all.disabled=busy||!context?.available||!allSignalIds().length;all.setAttribute('aria-pressed',String(allSignals));}for(const role of roles){const options=selected?.signals[role]||[],destinations=targets(role),action=$('rffeLocate'+role),target=destinations[0];action.disabled=busy||!context?.available||!options.length;
  action.title=target?(target.isTestPoint?'Localizar test point ':'Localizar conexão ')+target.component+' · '+roleLabels[role]:options.length?'Localizar linha '+roleLabels[role]+'; não há test point confirmado':role==='vdd'?'Alimentação de 1,8 V ainda não confirmada para este RFFE.':'Linha não identificada neste mapa.';
  action.dataset.target=target?.component||'';action.dataset.testPoint=String(!!target?.isTestPoint);
 }}
 function deviceId(device){return Number.isInteger(device.componentId)?device.componentId:window.JCID_BOARD?.components.find(c=>c.name===device.component)?.id;}
 function highlight(clearSelection=false){if(!allSignals&&!pane.hidden&&!busy&&context?.available&&selected)board.setToolComponents(selected.devices.map(deviceId).filter(Number.isInteger),{clearSelection});else board.clearToolComponents();}
 function rowSelection(){const id=board.getState().component;for(const row of $('rffeRows').querySelectorAll('[data-component-id]')){const active=Number(row.dataset.componentId)===id;row.classList.toggle('is-current',active);row.querySelector('.rffe-part')?.setAttribute('aria-current',String(active));}}
 function locateDevice(device){if(composed()||busy||!context?.available||current()?.boardId!==context.boardId)return false;const id=deviceId(device),found=Number.isInteger(id)&&board.focusComponentById(id);message=found?'Componente selecionado: '+device.component:'Componente oculto. Reveja “Só componentes” no Netcolor.';rowSelection();status();return !!found;}
 function announceBus(){window.dispatchEvent(new CustomEvent('jcid:rffe-bus'));}
 function comparison(device){return window.JCIDRFFEConnection?.getComparison(context?.boardId,selected?.id,device)||{text:'—',title:'Aguardando leitura e comparação.',result:null,observedUsid:null};}
 function renderComparisons(){for(const cell of $('rffeRows').querySelectorAll('.rffe-result[data-device-index]')){const device=selected?.devices[Number(cell.dataset.deviceIndex)];if(!device)continue;const c=comparison(device);cell.textContent=c.text;cell.title=c.title;cell.dataset.result=c.result||'';cell.closest('tr').dataset.result=c.result||'';}renderExtras();}
 function renderExtras(){const body=$('rffeRows');for(const row of body.querySelectorAll('.rffe-extra'))row.remove();const reading=window.JCIDRFFEConnection?.getAccepted?.();if(!selected||!context?.available||reading?.context.boardId!==context.boardId||reading?.context.busId!==selected.id)return;const ids=window.JCIDRFFEComparison.extras(selected.devices,reading.found).ids;for(const usid of ids){const row=document.createElement('tr');row.className='rffe-extra';row.dataset.result='unexpected';for(const text of ['—',window.JCIDRFFEComparison.hex(usid),'Não esperado','—','Recebido']){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}row.title='USID recebido sem PA associado neste RFFE.';body.append(row);}}

 function renderRows(){
  const body=$('rffeRows');body.replaceChildren();
  if(!selected?.devices.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.className='rffe-empty';td.textContent=selected?'Nenhum PA/CI com conexão confirmada nos dados deste RFFE.':'Selecione um RFFE para consultar os PAs.';tr.append(td);body.append(tr);return;}
  const saved=notes();
  for(const [index,device] of selected.devices.entries()){
   const row=document.createElement('tr'),no=document.createElement('td'),pa=document.createElement('td'),note=document.createElement('td'),result=document.createElement('td'),mark=document.createElement('td'),checkbox=document.createElement('input'),locate=document.createElement('button'),id=deviceId(device);
   if(Number.isInteger(id))row.dataset.componentId=id;no.textContent=String(index+1);locate.type='button';locate.className='rffe-part';locate.textContent=device.component;locate.title=Number.isInteger(id)?'Localizar '+device.component:'Consta na referência; posição não disponível neste mapa.';locate.disabled=busy||!context?.available||!Number.isInteger(id);locate.addEventListener('click',()=>locateDevice(device));pa.append(locate);
   if(device.pa){const value=document.createElement('small');value.textContent=device.pa;pa.append(value);}
   const expected=window.JCIDRFFEComparison?.label(device);if(expected){const value=document.createElement('small');value.textContent=expected;value.title='USID esperado: '+expected;pa.append(value);}
   const input=document.createElement('input');input.type='text';input.maxLength=500;input.value=typeof saved[device.component]==='string'?saved[device.component]:device.notes||'';input.setAttribute('aria-label','Notas de '+device.component);input.placeholder='—';input.disabled=busy;input.addEventListener('input',()=>rememberNote(device.component,input.value));note.append(input);
   checkbox.type='checkbox';checkbox.className='rffe-mark';checkbox.dataset.component=device.component;checkbox.checked=marks().has(device.component);checkbox.disabled=busy||!context?.available||!Number.isInteger(id);checkbox.setAttribute('aria-label','Marcar '+device.component);checkbox.title='Manter '+device.component+' destacado em vermelho claro';checkbox.addEventListener('change',()=>markDevice(device,checkbox.checked));mark.className='rffe-mark-cell';mark.append(checkbox);
   result.textContent='—';result.className='rffe-result';result.dataset.deviceIndex=String(index);result.title='Aguardando leitura e comparação.';row.append(no,pa,note,mark,result);body.append(row);
  }rowSelection();renderComparisons();
 }
 function select(id,focus=false){if(composed())return false;const next=findBus(id);if(!next||busy)return false;clearAllSignals();selected=next;choices.set(context.boardId,next.id);message='';for(const option of $('rffeBusList').children){const yes=option.dataset.bus===next.id;option.setAttribute('aria-selected',String(yes));option.tabIndex=yes?0:-1;if(yes&&focus)option.focus();}$('rffeSelected').textContent=next.label;$('rffeSelected').title=next.id;renderSignals();renderRows();highlight(true);passivePads();syncMarks();status();announceBus();return true;}
 function renderList(){
  const list=$('rffeBusList');list.replaceChildren();list.setAttribute('aria-busy',String(busy));
  for(const bus of buses){const option=document.createElement('button');option.type='button';option.setAttribute('role','option');option.dataset.bus=bus.id;option.textContent=bus.label;option.title=bus.id;option.disabled=busy;option.tabIndex=bus.id===selected?.id?0:-1;option.setAttribute('aria-selected',String(bus.id===selected?.id));option.addEventListener('click',()=>select(bus.id));option.addEventListener('keydown',e=>{const index=buses.indexOf(bus);let next;if(e.key==='ArrowDown')next=buses[(index+1)%buses.length];else if(e.key==='ArrowUp')next=buses[(index-1+buses.length)%buses.length];else if(e.key==='Home')next=buses[0];else if(e.key==='End')next=buses.at(-1);if(next){e.preventDefault();select(next.id,true);}});list.append(option);}
  if(!buses.length){const empty=document.createElement('p');empty.className='rffe-list-empty';empty.textContent='Nenhum RFFE';list.append(empty);}
 }
 function refresh(){
  button.disabled=composed();button.title=composed()?compositionMessage:'RFFE';
  if(composed()){pane.hidden=true;button.setAttribute('aria-pressed','false');button.setAttribute('aria-expanded','false');clearAllSignals();board.clearToolComponents();}
  if(lastData!==window.JCID_BOARD){noteCache.clear();marksCache.clear();lastData=window.JCID_BOARD;}
  const next=current(),data=window.JCID_BOARD,changed=context?.itemId!==next?.itemId||context?.boardId!==next?.boardId;busy=document.body.classList.contains('board-loading');if(changed||busy)clearAllSignals();if(changed)message='';context=next;$('rffeModel').value=context?.modelLabel||'—';$('rffeModel').title=context?.itemLabel||'';buses=[];
  if(context?.available&&data){const mapping=catalog();let hit=cache.get(data);if(!hit||hit.mapping!==mapping){hit={mapping,buses:window.JCIDRFFEData.discover(data,mapping)};cache.set(data,hit);}buses=hit.buses;}
  selected=findBus(choices.get(context?.boardId))||buses[0]||null;if(selected)choices.set(context.boardId,selected.id);$('rffeSelected').textContent=selected?.label||'';$('rffeSelected').title=selected?.id||'';renderList();renderSignals();renderRows();highlight(changed&&!pane.hidden);syncMarks();if(changed)passivePads();status();
 }
 function locate(role){
  if(composed())return false;
  clearPassivePads();
  if(role==='all'){
   if(busy||!context?.available||current()?.boardId!==context.boardId||!board.setToolNets)return false;
   if(allSignals){clearAllSignals();highlight();message='Destaque conjunto desativado.';}else{const colors=Object.fromEntries(roles.flatMap(role=>(selected?.signals[role]||[]).map(net=>[net.id,roleColors[role]])));board.clearToolComponents();const ids=board.setToolNets(allSignalIds(),{clearSelection:true,colors,highlightComponents:false});allSignals=ids.length>0;message=allSignals?'SDA: verde claro · SCL: roxo · 1,8 V: azul escuro':'Nenhuma linha disponível para destacar.';}
   renderSignals();status();return allSignals;
  }
  if(busy||!context?.available||!roles.includes(role)||current()?.boardId!==context.boardId)return false;
  clearAllSignals();
  const options=selected?.signals[role]||[],destinations=targets(role);if(!options.length)return false;
  for(const target of destinations)if(board.focusPinById(target.pinId)){message=(target.isTestPoint?'Test point: ':'Conexão: ')+target.component+' · '+roleLabels[role];status();return true;}
  if(!destinations.length){for(const net of options)if(board.selectNet(net.id)){message='Linha '+roleLabels[role]+' selecionada; nenhum test point confirmado.';status();return true;}}
  message='As conexões estão ocultas. Reveja “Só componentes” no Netcolor.';status();return false;
 }
 function open(){if(composed()){refresh();return false;}board.openTools();pane.hidden=false;button.setAttribute('aria-pressed','true');button.setAttribute('aria-expanded','true');window.dispatchEvent(new CustomEvent('jcid:tool',{detail:'rffe'}));refresh();highlight(true);passivePads();announceBus();}
 function close(){pane.hidden=true;button.setAttribute('aria-pressed','false');button.setAttribute('aria-expanded','false');clearAllSignals();board.clearToolComponents();announceBus();}
 $('rffeClearMarks').addEventListener('click',clearMarkedComponents);
 button.addEventListener('click',()=>pane.hidden?open():close());for(const role of [...roles,'all'])$('rffeLocate'+role).addEventListener('click',()=>locate(role));
 for(const element of [pane])element.addEventListener('keydown',event=>{if(event.target.matches('input,textarea'))event.stopPropagation();});
 window.addEventListener('jcid:rffe-reading',renderComparisons);window.addEventListener('jcid:selection',()=>{const selection=board.getState();if(selection.pin!==null||selection.net!==null||selection.component!==null)clearPassivePads();if(allSignals){const s=selection;if(s.net!==null||s.pin!==null||s.component!==null){clearAllSignals();message='';status();}}rowSelection();});window.addEventListener('jcid:tool',e=>{if(e.detail!=='rffe')close();});for(const event of ['jcid:document','jcid:boardchange','jcid:boardloadstate'])window.addEventListener(event,refresh);
 window.addEventListener('jcid:netnames-changed',()=>{if(window.JCID_BOARD)cache.delete(window.JCID_BOARD);refresh();});
 window.addEventListener('jcid:rffe-catalog',()=>{if(window.JCID_BOARD)cache.delete(window.JCID_BOARD);refresh();});
 window.JCIDRFFE=Object.freeze({open,close,refresh,clearMarkedComponents,getMarkedComponents:()=>composed()?[]:[...marks()],selectBus:select,locate,locateComponent:name=>{const d=selected?.devices.find(d=>d.component===name);return !!d&&locateDevice(d);},getSelectedBus:()=>!composed()&&context?.available&&selected?{boardId:context.boardId,busId:selected.id,label:selected.label,modelLabel:context.modelLabel,devices:structuredClone(selected.devices)}:null,getContext:()=>context?{...context}:null,listBuses:()=>composed()?[]:buses.map(b=>({id:b.id,label:b.label,signals:structuredClone(b.signals),targets:structuredClone(b.targets||{}),devices:structuredClone(b.devices)})),getComparisonRows:()=>composed()||!selected?[]:selected.devices.map((d,index)=>({no:index+1,boardId:context.boardId,busId:selected.id,component:d.component,componentId:deviceId(d),pa:d.pa,expectedUsid:d.usid,expectedUsids:window.JCIDRFFEComparison.expected(d),expectedGroups:window.JCIDRFFEComparison.groups(d),observedUsid:comparison(d).observedUsid,observedUsids:comparison(d).observedUsids,missingUsids:comparison(d).missingUsids,referenceMissing:!!d.referenceMissing,referenceNotes:d.referenceNotes||'',notes:notes()[d.component]??d.notes,result:comparison(d).result}))});
 refresh();
})();
