(() => {
 'use strict';
 const $=id=>document.getElementById(id),pane=$('boardEditorPane'),wrap=$('canvasWrap'),view=window.JCIDBoardView;
 if(!pane||!wrap||!view)return;
 const NS='http://www.w3.org/2000/svg',overlay=document.createElementNS(NS,'svg');
 overlay.classList.add('editor-pad-outline');overlay.setAttribute('aria-hidden','true');overlay.hidden=true;wrap.append(overlay);
 const selected=new Set(),mobile=matchMedia('(max-width:900px), (pointer:coarse)');
 let activeBoard=window.JCID_ACTIVE_BOARD?.id,raf=0,lastKey='',revision=0,renderedData=null,renderedRevision=-1;
 const page=()=>pane.querySelector('[data-editor-page="transform"]');
 function isActive(){return !mobile.matches&&!pane.hidden&&!page()?.hidden&&!window.NexusBoardEditor?.isBusy()&&!document.body.classList.contains('board-loading')&&!document.body.classList.contains('source-mode')&&!!window.JCIDDesktop?.currentDocument()?.interactiveMapReady;}
 let indexedData=null,partIndex=new Map();
 function usable(id){const data=window.JCID_BOARD;if(indexedData!==data){indexedData=data;partIndex=new Map((data?.components||[]).map(c=>[c.id,c]));}const p=data?.pins?.[id];return !!p&&!p.via&&partIndex.has(p.part);}
 const connected=id=>window.NexusBoardTopology.connectedPadIds(window.JCID_BOARD,[id]).filter(usable);
 function refresh(){
  const enabled=isActive();document.body.classList.toggle('editing-pad-nature',enabled);
  const id=window.JCID_ACTIVE_BOARD?.id;
  if(activeBoard!==id){activeBoard=id;selected.clear();revision++;}
  for(const id of selected)if(!usable(id)){selected.delete(id);revision++;}
  const busy=window.NexusBoardEditor?.isBusy();
  for(const button of pane.querySelectorAll('[data-pad-kind]'))button.disabled=!enabled||!selected.size||busy;
  $('boardEditorPadClear').disabled=!selected.size||busy;
  const data=window.JCID_BOARD;
  if(renderedData!==data||renderedRevision!==revision){
   renderedData=data;renderedRevision=revision;
   $('boardEditorPadCount').textContent=selected.size===0?'Nenhum pad selecionado':selected.size===1?'1 pad selecionado':selected.size+' pads selecionados';
   const host=$('boardEditorPadSelection'),fragment=document.createDocumentFragment(),parts=new Map((data?.components||[]).map(c=>[c.id,c])),nets=new Map((data?.nets||[]).map(n=>[n.id,n])),kinds=data&&window.JCIDPadKinds.create(data,data.ncDisplay),remaining=new Set(selected);
   // One row per connected line, rather than thousands of DOM rows for GND.
   let groups=0;
   while(remaining.size){const id=remaining.values().next().value,ids=connected(id).filter(id=>selected.has(id));if(!ids.length)ids.push(id);for(const id of ids)remaining.delete(id);groups++;
    const p=data.pins[id],row=document.createElement('button'),kind=kinds.kind(p),name=nets.get(p.net)?.name||(kind==='nc'?'NC':'Sem linha'),components=[...new Set(ids.map(id=>parts.get(data.pins[id].part)?.name).filter(Boolean))];
    row.type='button';row.dataset.padId=id;row.className='editor-selected-pad';row.title='Remover a linha '+name+' da seleção';row.setAttribute('aria-label',row.title);
    const dot=document.createElement('i');dot.className='editor-kind-dot '+kind;const label=document.createElement('span');label.textContent=name;const net=document.createElement('small');net.textContent=(ids.length===1?'1 pad':ids.length+' pads')+' · '+components.slice(0,3).join(', ')+(components.length>3?'…':'');row.append(dot,label,net);row.addEventListener('click',()=>{for(const id of ids)selected.delete(id);revision++;refresh();});fragment.append(row);
   }
   if(groups)$('boardEditorPadCount').textContent=(groups===1?'1 linha':groups+' linhas')+' · '+selected.size+(selected.size===1?' pad':' pads');
   host.replaceChildren(fragment);
  }
  overlay.hidden=!enabled||!selected.size;overlay.toggleAttribute('hidden',overlay.hidden);
  if(overlay.hidden){cancelAnimationFrame(raf);raf=0;lastKey='';overlay.replaceChildren();}
  else if(!raf)raf=requestAnimationFrame(draw);
 }
 function draw(){
  raf=0;if(!isActive()||!selected.size){refresh();return;}
  const state=view.getState(),r=wrap.getBoundingClientRect(),key=JSON.stringify([revision,window.JCID_BOARD.nexusRevision,state.camera,state.rotation,state.mirrored,state.mirroredVertical,state.view,state.objects.components,r.width,r.height]);
  if(key!==lastKey){lastKey=key;overlay.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);const fragment=document.createDocumentFragment();
   if(state.objects.components)for(const id of selected){const p=window.JCID_BOARD.pins[id];if(!p)continue;const b=p.bbox;if(!Array.isArray(b))continue;const points=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].map(([x,y])=>view.project(x,y));if(points.every(p=>p.x<0)||points.every(p=>p.x>r.width)||points.every(p=>p.y<0)||points.every(p=>p.y>r.height))continue;const polygon=document.createElementNS(NS,'polygon');polygon.dataset.padId=id;polygon.setAttribute('points',points.map(p=>`${p.x},${p.y}`).join(' '));fragment.append(polygon);}
   overlay.replaceChildren(fragment);
  }
  raf=requestAnimationFrame(draw);
 }
 function clear(){if(selected.size){selected.clear();revision++;}refresh();}
 function handlePointerSelection(id,event={}){
  if(!isActive())return false;
  if(id===null||!usable(id)){clear();return true;}
  const ids=connected(id),all=ids.every(id=>selected.has(id));
  if(event.shiftKey){for(const id of ids){if(all)selected.delete(id);else selected.add(id);}}
  else {const only=selected.size===ids.length&&all;selected.clear();if(!only)for(const id of ids)selected.add(id);}
  revision++;view.clearSelection();refresh();window.NexusBoardEditor.message('');return true;
 }
 function apply(kind){
  if(!isActive()||!selected.size)return false;
  try{const result=window.NexusBoardDraft.execute({type:'setPadKind',ids:[...selected],kind});revision++;refresh();const name=kind==='signal'?'amarelo':kind==='ground'?'GND':'NC';window.NexusBoardEditor.message(result.changed?'Toda a linha foi alterada para '+name+'. Desfazer restaura o estado anterior.':'A seleção já possui essa natureza.');return result;}
  catch(error){window.NexusBoardEditor.message(error.message,true);return false;}
 }
 for(const button of pane.querySelectorAll('[data-pad-kind]'))button.addEventListener('click',()=>apply(button.dataset.padKind));
 $('boardEditorPadClear').addEventListener('click',clear);
 window.addEventListener('jcid:editorsection',event=>{if(event.detail!=='transform')clear();else{view.clearSelection();refresh();}});
 window.addEventListener('jcid:tool',event=>{if(event.detail!=='boardEditor')clear();else refresh();});
 for(const event of ['jcid:boardchange','jcid:document','jcid:boardloadstate','jcid:board-edited','jcid:editorbusy','jcid:panels'])window.addEventListener(event,refresh);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&isActive())clear();},true);
 // A closed pane is also possible by clicking its own tool button.
 new MutationObserver(refresh).observe(pane,{attributes:true,attributeFilter:['hidden']});
 mobile.addEventListener('change',()=>{clear();});
 const names={nets:['Linhas','Lin.'],boards:['Placas','Pl.'],parts:['Componentes','Comp.'],transform:['Transformar','Transf.'],join:['Junção','Jun.']};
 for(const button of pane.querySelectorAll('[data-editor-section]')){const labels=names[button.dataset.editorSection];if(!labels)continue;button.title=labels[0];button.setAttribute('aria-label',labels[0]);const full=document.createElement('span'),short=document.createElement('span');full.className='editor-tab-full';full.textContent=labels[0];short.className='editor-tab-short';short.textContent=labels[1];button.replaceChildren(full,short);}
 window.NexusPadTransform67=Object.freeze({isActive,getSelectedIds:()=>[...selected],handlePointerSelection,clear,apply});refresh();
})();
