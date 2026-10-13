(() => {
 'use strict';
 const $=id=>document.getElementById(id),pane=$('schematicPane'),frame=$('schematicFrame'),button=$('schematicTool'),status=$('schematicPaneStatus'),bar=$('schematicWindowBar'),board=window.JCIDBoardView,origin=location.origin,documents=()=>(window.JCID_SCHEMATICS?.documents||[]).filter(d=>d.type!=='reference');
 const composed=()=>window.JCID_BOARD?.nexusComposition?.version===1,compositionMessage='Junção: indisponível';
 let started=false,frameReady=false,popup=null,popupReady=false,sync=true,remote=false,drag=null,popupTimer=0,serial=0,sent=new WeakMap(),selected=null,modelId='',boardId='',session='',reference=null;
 const remembered=new Map(),active=()=>window.JCID_ACTIVE_BOARD||{id:'iphone-11-motherboard',modelId:'iphone-11'},matching=()=>!composed()&&!!selected&&(selected.board_ids||[]).includes(boardId)&&active().id===boardId&&!document.body.classList.contains('source-mode');
 const name=()=>!matching()||document.body.classList.contains('board-loading')?null:(()=>{const c=window.JCID_BOARD.components.find(c=>c.id===board.getState().component);return c?.sourceComponentName||c?.name||null;})();
 const selection=()=>{const component=name(),pin=component?window.JCID_BOARD.pins[board.getState().pin]:null;return {component,pad:pin?.name!=null?String(pin.name):null};};
 const selectionKey=value=>JSON.stringify([value.component,value.pad||null]);
 const message=(type,extra={})=>({channel:'jcid-workbench',schematicId:selected?.id,boardId,session,type,...extra});
 const post=(target,type,extra={})=>{if(selected&&target&&!target.closed)target.postMessage(message(type,extra),origin);};
 function choicesFor(model,boardId){if(composed())return [];return window.NexusDocumentScope.forBoard(window.JCID_SCHEMATICS?.documents||[],model,boardId).filter(d=>d.type!=='reference');}
 function choices(){return choicesFor(modelId,active().id);}
 function reflect(){const open=!pane.hidden||!!popup&&!popup.closed;button.disabled=composed()||!selected;button.setAttribute('aria-pressed',String(open));button.setAttribute('aria-expanded',String(open));button.title=composed()?compositionMessage:selected?'Abrir esquemático':'Nenhum esquemático disponível para este modelo';$('syncSchematic').disabled=!matching();$('syncSchematic').setAttribute('aria-pressed',String(sync&&matching()));}
 function url(mode){const params=new URLSearchParams({[mode]:'1',schematic:selected.id,model:modelId,board:boardId,session,v:'tools49'}),current=sync?selection():{};if(reference?.documentId===selected.id){params.set('componente',reference.component);params.set('pagina',reference.page);}else{if(current.component)params.set('componente',current.component);if(current.pad)params.set('pad',current.pad);}return 'esquema.html?'+params;}
 function sendSelection(except){if(composed())return;if(reference?.documentId===selected?.id){const key='reference:'+JSON.stringify(reference);for(const target of [frameReady&&!pane.hidden?frame.contentWindow:null,popupReady?popup:null])if(target&&target!==except&&sent.get(target)!==key){sent.set(target,key);post(target,'reference',reference);}return;}if(!sync)return;const current=selection(),key=selectionKey(current);for(const target of [frameReady&&!pane.hidden?frame.contentWindow:null,popupReady?popup:null])if(target&&target!==except&&sent.get(target)!==key){sent.set(target,key);post(target,'select',current);}}
 function start(){if(started||!selected)return;started=true;frame.src=url('embedded');}
 function refreshSource(requestedId,requestedModel){
  if(composed())reference=null;
  const nextModel=requestedModel||active().modelId,options=choicesFor(nextModel,active().id);
  const next=requestedId?(options.find(d=>d.id===requestedId)||null):options.find(d=>d.id===remembered.get(nextModel)&&(d.board_ids||[]).includes(active().id))||options.find(d=>(d.board_ids||[]).includes(active().id))||options[0]||null;
  const nextBoard=active().id,changed=composed()||selected?.id!==next?.id||selected?.pdf!==next?.pdf||selected?.index!==next?.index||boardId!==nextBoard||modelId!==nextModel;
  selected=next;modelId=nextModel;boardId=nextBoard;
  if(changed){session=Date.now().toString(36)+'-'+(++serial);started=frameReady=popupReady=false;sent=new WeakMap();status.textContent=composed()?compositionMessage:selected?(matching()?'Vinculado à placa':'Consulta do documento · sem vínculo com esta placa'):'Esquemático ainda não disponível';
   $('schematicWindowTitle').textContent=selected?.title||'Esquemático';frame.title=selected?.title||'Esquemático';
   $('schematicDocument').replaceChildren();for(const doc of options){const option=document.createElement('option');option.value=doc.id;option.textContent=doc.label;option.title=doc.title;$('schematicDocument').append(option);}$('schematicDocument').value=selected?.id||'';
   if(selected){if(!pane.hidden)start();if(popup&&!popup.closed){try{popup.location.href=url('detached');}catch{popup.close();popup=null;}}}else{pane.hidden=true;frame.src='about:blank';if(popup&&!popup.closed){popup.close();popup=null;}}
  }reflect();return selected;
 }
 function open(id,requestedModel){if(composed()){refreshSource();return false;}if(id||requestedModel)refreshSource(id,requestedModel);else if(!selected)refreshSource();if(!selected)return false;window.dispatchEvent(new CustomEvent('jcid:tool',{detail:'schematic'}));board.openTools();pane.hidden=false;start();reflect();requestAnimationFrame(()=>{post(frame.contentWindow,'resize');sendSelection();});return true;}
 function close(){pane.hidden=true;reflect();}
 function choose(id){if(composed())return false;reference=null;if(!choices().some(d=>d.id===id))return false;remembered.set(modelId,id);refreshSource(id,modelId);sendSelection();return true;}
 function activateBoard(){reference=null;const keep=selected&&modelId===active().modelId&&(selected.board_ids||[]).includes(active().id);refreshSource(keep?selected.id:undefined);sendSelection();}
 function clampWindow(){if(!pane.classList.contains('floating'))return;const r=pane.getBoundingClientRect();pane.style.left=Math.max(6,Math.min(innerWidth-r.width-6,parseFloat(pane.style.left)||6))+'px';pane.style.top=Math.max(6,Math.min(innerHeight-r.height-6,parseFloat(pane.style.top)||6))+'px';}
 function floating(value){pane.classList.toggle('floating',value);$('floatSchematic').title=value?'Encaixar na barra de ferramentas':'Abrir janela flutuante';$('floatSchematic').setAttribute('aria-label',$('floatSchematic').title);if(value){const w=Math.min(950,innerWidth-24),h=Math.min(740,innerHeight-36);pane.style.width=w+'px';pane.style.height=h+'px';pane.style.left=Math.max(6,(innerWidth-w)/2)+'px';pane.style.top=Math.max(6,(innerHeight-h)/2)+'px';clampWindow();}else{for(const key of ['width','height','left','top'])pane.style[key]='';board.openTools();}post(frame.contentWindow,'resize');}
 function detach(){if(composed()||!selected)return;if(popup&&!popup.closed){popup.focus();return;}popup=window.open(url('detached'),'jcid-schematic','popup=yes,width=1100,height=780,resizable=yes,scrollbars=yes');if(!popup){open();floating(true);return;}popupReady=false;close();reflect();popup.focus();clearInterval(popupTimer);popupTimer=setInterval(()=>{if(popup?.closed){popup=null;popupReady=false;clearInterval(popupTimer);reflect();}},800);}
 button.addEventListener('click',()=>{if(popup&&!popup.closed){popup.focus();return;}pane.hidden?open():close();});
 $('schematicDocument').addEventListener('change',()=>choose($('schematicDocument').value));$('closeSchematic').addEventListener('click',close);$('floatSchematic').addEventListener('click',()=>floating(!pane.classList.contains('floating')));$('separateSchematic').addEventListener('click',detach);
 $('syncSchematic').addEventListener('click',()=>{if(!matching())return;sync=!sync;status.textContent=sync?'Vinculado à placa':'Vínculo pausado';reflect();sendSelection();});
 bar.addEventListener('pointerdown',e=>{if(e.button!==0||!pane.classList.contains('floating')||e.target.closest('button'))return;e.preventDefault();const r=pane.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};bar.setPointerCapture(e.pointerId);pane.classList.add('window-dragging');});
 bar.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;pane.style.left=drag.left+e.clientX-drag.x+'px';pane.style.top=drag.top+e.clientY-drag.y+'px';clampWindow();});
 function endDrag(){if(!drag)return;const id=drag.id;drag=null;if(bar.hasPointerCapture(id))bar.releasePointerCapture(id);pane.classList.remove('window-dragging');}for(const e of ['pointerup','pointercancel','lostpointercapture'])bar.addEventListener(e,endDrag);
 window.addEventListener('resize',clampWindow);new ResizeObserver(clampWindow).observe(pane);frame.addEventListener('load',()=>{post(frame.contentWindow,'resize');sendSelection();});
 window.addEventListener('jcid:selection',()=>{if(!remote){reference=null;sendSelection();}});window.addEventListener('jcid:document',()=>{if(composed())refreshSource();else reflect();sendSelection();});
 window.addEventListener('message',e=>{
  if(composed())return;
  if(e.origin!==origin||(e.source!==frame.contentWindow&&e.source!==popup))return;const m=e.data;if(!m||m.channel!=='jcid-workbench'||m.schematicId!==selected?.id||m.boardId!==boardId||m.session!==session)return;
  if(m.type==='ready'){if(e.source===frame.contentWindow)frameReady=true;else popupReady=true;sent.delete(e.source);sendSelection();return;}
  if(m.type==='document'&&typeof m.documentId==='string'){choose(m.documentId);return;}
  if(m.type==='dock'&&e.source===popup){const old=popup;popup=null;popupReady=false;clearInterval(popupTimer);floating(false);open();old.close();return;}
  if(!matching()||!['selected','located','missing','pin-missing'].includes(m.type)||typeof m.component!=='string'||m.component.length>128)return;
  status.textContent=m.type==='missing'?'Sem posição para '+m.component:m.type==='pin-missing'?'Terminal '+m.component+'.'+String(m.pad||'')+' não localizado no esquema':m.component+(m.pad?'.'+m.pad:'')+(Number.isInteger(m.page)?' · Pág. '+m.page:'');
  if(m.type==='selected'&&sync){reference=null;remote=true;let found;try{if(typeof m.pad==='string'&&m.pad.length<=32){const c=window.JCID_BOARD.components.find(c=>[c.name,c.sourceComponentName].some(name=>name?.toUpperCase()===m.component.toUpperCase())),p=c?.pins.map(id=>window.JCID_BOARD.pins[id]).find(p=>String(p.name).toUpperCase()===m.pad.toUpperCase());found=!!p&&board.focusPinById(p.id);}else{const c=window.JCID_BOARD.components.find(c=>[c.name,c.sourceComponentName].some(name=>name?.toUpperCase()===m.component.toUpperCase()));found=!!c&&board.focusComponentById(c.id);}}finally{remote=false;}if(!found){status.textContent=(m.pad?'Terminal '+m.component+'.'+m.pad:'Componente '+m.component)+' indisponível neste mapa';return;}sent.set(e.source,selectionKey({component:m.component,pad:m.pad||null}));sendSelection(e.source);}
 });
 window.addEventListener('jcid:tool',e=>{if(e.detail!=='schematic'&&!pane.classList.contains('floating'))close();});window.addEventListener('jcid:boardchange',()=>{reference=null;refreshSource();sendSelection();});
 function openAt(documentId,modelId,component,page){if(composed())return false;reference={documentId,component,page};return open(documentId,modelId);}
 window.addEventListener('nexus:library',()=>{reference=null;refreshSource();sendSelection();});
 window.JCIDSchematic=Object.freeze({open,openAt,close,selectDocument:choose,activateBoard});refreshSource();reflect();
})();
