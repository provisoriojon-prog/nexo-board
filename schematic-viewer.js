(async () => {
 'use strict';
 const $=id=>document.getElementById(id),viewer=$('pageViewer'),stack=$('pageStack'),query=new URLSearchParams(location.search),origin=location.origin;
 // Imported documents are registered asynchronously in each viewer window.
 // Wait before resolving a document so the bundled preview cannot mask them.
 try{await (window.NexusReady||Promise.resolve());}catch(error){$('viewerStatus').textContent='Não foi possível preparar a biblioteca. Reabra o documento para tentar novamente.';for(const el of document.querySelectorAll('button,input,select'))el.disabled=true;return;}
 const documents=window.JCID_SCHEMATICS?.documents||[],doc=documents.find(d=>d.id===(query.get('schematic')||'iphone-11-schematic'));
 if(!doc){const libraryError=window.NexusStartupError||window.NexusLibrary?.status?.().error;$('viewerStatus').textContent=libraryError?'Não foi possível preparar a biblioteca. Reabra o documento para tentar novamente.':'Este esquemático não está disponível.';for(const el of document.querySelectorAll('button,input,select'))el.disabled=true;return;}
 const context={schematicId:doc.id,boardId:query.get('board')||doc.board_ids?.[0]||'',session:query.get('session')||'standalone'},canSync=(doc.board_ids||[]).includes(context.boardId);
 window.JCID_CURRENT_SCHEMATIC=doc;document.title=window.NexoBrand92?.title(doc.title)||(doc.title+' · SB APPLE');$('viewerTitle').textContent=doc.title;$('originalPdf').href=doc.pdf;
 const loadingControls=[...document.querySelectorAll('button,input,select')].map(el=>({el,disabled:el.disabled}));for(const {el} of loadingControls)el.disabled=true;
 void window.JCIDPdfPages.prepare().catch(()=>{});
 let D;try{const response=await fetch(doc.index);if(!response.ok)throw Error('Index unavailable');D=await response.json();if(!D.pages?.length||!Array.isArray(D.regions))throw Error('Invalid index');}catch(error){$('viewerStatus').textContent='Não foi possível abrir o esquema. Reabra este documento.';return;}
 // Individual pad geometry is shared by clicking the PDF and board-to-PDF sync.
 // Loading once also prevents an interim click on a legacy group of terminals.
 let pinCatalog=null;try{pinCatalog=await window.JCIDSchematicPins.prepare(D);}catch{}
 for(const {el,disabled} of loadingControls)el.disabled=disabled;
 const wheelModeKey='nexus-schematic-wheel-mode',touchNavigation=matchMedia('(pointer:coarse)');
 let wheelMode='zoom';try{if(localStorage.getItem(wheelModeKey)==='scroll')wheelMode='scroll';}catch{}
 let navigationHint='';
 function updateWheelControl(){
  const previous=navigationHint,zoom=wheelMode==='zoom';navigationHint=touchNavigation.matches?'Deslize para mover · use dois dedos para ampliar.':zoom?'Arraste para mover · roda para ampliar.':'Roda para rolar · Ctrl + roda para ampliar.';
  $('wheelMode').setAttribute('aria-pressed',String(zoom));$('wheelMode').setAttribute('aria-label','Roda do mouse: '+(zoom?'zoom. Alternar para rolagem':'rolagem. Alternar para zoom'));$('wheelMode').title=zoom?'Roda do mouse: zoom. Clique para rolar as páginas':'Roda do mouse: rolagem. Clique para ampliar';$('wheelModeLabel').textContent=zoom?'Zoom':'Rolar';
  const hint=document.querySelector('.viewer-hint');if(hint)hint.textContent=zoom?'Roda: zoom · arraste para mover':'Roda: rolagem · Ctrl + roda: zoom';
  if($('viewerStatus').textContent===previous)$('viewerStatus').textContent=navigationHint;
 }
 updateWheelControl();touchNavigation.addEventListener?.('change',updateWheelControl);
 $('viewerStatus').textContent=navigationHint;
 const embedded=query.get('embedded')==='1',host=embedded?window.parent:window.opener,svgNS='http://www.w3.org/2000/svg';
 const model=query.get('model')||doc.modelIds[0];for(const source of window.NexusDocumentScope.forBoard(documents,model,context.boardId||doc.scope_board_id).filter(d=>Boolean(d.type==='reference')===Boolean(doc.type==='reference'))){const option=document.createElement('option');option.value=source.id;option.textContent=source.title;$('viewerDocument').append(option);}$('viewerDocument').value=doc.id;
 $('viewerDocument').addEventListener('change',()=>{stopMomentum();const next=$('viewerDocument').value;if(host){send('document',{documentId:next});$('viewerDocument').value=doc.id;}else{const params=new URLSearchParams({schematic:next,model});location.href='esquema.html?'+params;}});
 document.body.classList.toggle('embedded',embedded);$('dockViewer').hidden=!(host&&!embedded);
 const pages=[...D.pages].sort((a,b)=>a.page-b.page),byPage=new Map(),byName=new Map(),shells=new Map(),mounted=new Map();
 const navigation=window.JCIDSchematicNavigation.create(D);
 const state={zoom:.35,fit:'width',page:pages[0].page,selected:null,selectedPin:null,pad:null,name:'',searchMatches:null,layout:[],width:0,height:0};
 let raf=0,wheelFrame=0,wheelDelta=0,wheelPoint=null,drag=null,suppressClick=false,pending=null;
 let selectionSerial=0;
 let momentum=null,momentumFrame=0;const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 let visit=0;const lastVisit=new Map();
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const send=(type,extra={})=>{if(host)host.postMessage({channel:'jcid-workbench',...context,type,...extra},origin);};
 for(const r of D.regions){const key=r.identifier.toUpperCase();if(!byName.has(key))byName.set(key,[]);byName.get(key).push(r);if(!byPage.has(r.page))byPage.set(r.page,[]);byPage.get(r.page).push(r);}
 for(const regions of byName.values())regions.sort(navigation.compare);
 for(const regions of byPage.values())regions.sort((a,b)=>{const ar=navigation.rectangle(a),br=navigation.rectangle(b);return br[2]*br[3]-ar[2]*ar[3];});
 for(const p of pages){const shell=document.createElement('section');shell.className='schema-page';shell.setAttribute('aria-label','Página '+p.page);shell.dataset.page=p.page;const placeholder=document.createElement('div');placeholder.className='page-placeholder';placeholder.textContent='Página '+p.page;shell.append(placeholder);shells.set(p.page,shell);stack.append(shell);}
 const pageData=n=>pages.find(p=>p.page===n)||pages[0];
 const entry=n=>state.layout.find(p=>p.page===n);
 function anchor(){const y=viewer.scrollTop+viewer.clientHeight/2,x=viewer.scrollLeft+viewer.clientWidth/2;const p=state.layout.find(p=>y<p.top+p.height)||state.layout.at(-1);return p?{page:p.page,x:(x-p.left)/state.zoom,y:(y-p.top)/state.zoom}:null;}
 function restore(a){if(!a)return;const p=entry(a.page);if(!p)return;viewer.scrollTop=clamp(p.top+a.y*state.zoom-viewer.clientHeight/2,0,Math.max(0,state.height-viewer.clientHeight));viewer.scrollLeft=clamp(p.left+a.x*state.zoom-viewer.clientWidth/2,0,Math.max(0,state.width-viewer.clientWidth));}
 function fitScale(){const p=pageData(state.page),w=Math.max(40,viewer.clientWidth-24)/p.width,h=Math.max(40,viewer.clientHeight-24)/p.height;return state.fit==='page'?Math.min(w,h):w;}
 function layout(a){
  if(!viewer.clientWidth||!viewer.clientHeight)return;
  const gap=14;state.width=Math.max(viewer.clientWidth,Math.max(...pages.map(p=>p.width))*state.zoom+24);let top=12;
  state.layout=pages.map(p=>{const width=p.width*state.zoom,height=p.height*state.zoom,left=(state.width-width)/2;const shell=shells.get(p.page);Object.assign(shell.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});const row={page:p.page,top,left,width,height};top+=height+gap;return row;});
  state.height=top-2+Math.max(0,viewer.clientHeight-state.layout.at(-1).height);stack.style.width=state.width+'px';stack.style.height=state.height+'px';restore(a);$('fitDocument').setAttribute('aria-pressed',String(!!state.fit));refresh();
 }
 function limitZoom(value){const p=pageData(state.page),fit=Math.min(Math.max(40,viewer.clientWidth-24)/p.width,Math.max(40,viewer.clientHeight-24)/p.height);return clamp(value,Math.min(fit*.5,8),Math.max(fit,8));}
 function setZoom(value,a=anchor()){stopMomentum();state.fit=null;state.zoom=limitZoom(value);layout(a);}
 function chooseFit(mode){stopMomentum();const a=anchor();state.fit=mode;state.zoom=fitScale();layout(a);}
 function mount(p,priority=0){
  const shell=shells.get(p.page),meta=pageData(p.page);const surface=window.JCIDPdfPages.create(p.page,p.width,()=>{if(mounted.get(p.page)?.surface!==surface)return;const el=document.createElement('div');el.className='page-placeholder page-error';el.textContent='Não foi possível abrir esta página. Use o botão PDF.';shell.append(el);},priority);const img=surface.element;
  const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('viewBox','0 0 '+meta.width+' '+meta.height);svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-label','Componentes da página '+p.page);
  const regions=new Map(),pagePins=pinCatalog?.forPage(p.page)||[],interactiveRegions=(byPage.get(p.page)||[]).filter(r=>navigation.selectionRectangle(r));
  function pick(e,fallback=null){
   if(suppressClick)return;
   const box=svg.getBoundingClientRect(),x=(e.clientX-box.left)/box.width,y=(e.clientY-box.top)/box.height,pin=e.detail===0?null:window.JCIDSchematicPins.hitTest(pagePins,x,y);
   if(pin){selectPin(pin,false,true);return;}
   const r=e.detail===0?fallback:navigation.hitTest(interactiveRegions,x,y);
   if(r)selectRecord(r,false,true);
  }
  svg.addEventListener('click',e=>pick(e));
  for(const r of interactiveRegions){const [x,y,w,h]=navigation.selectionRectangle(r),rect=document.createElementNS(svgNS,'rect');rect.setAttribute('x',x*meta.width);rect.setAttribute('y',y*meta.height);rect.setAttribute('width',w*meta.width);rect.setAttribute('height',h*meta.height);rect.setAttribute('class','region'+(!state.selectedPin&&state.selected?.record===r.record?' selected':''));rect.setAttribute('role','button');rect.setAttribute('tabindex','0');rect.setAttribute('aria-label',r.identifier+' · Página '+r.page);const title=document.createElementNS(svgNS,'title');title.textContent=r.identifier;rect.append(title);rect.addEventListener('click',e=>{e.stopPropagation();pick(e,r);});rect.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectRecord(r,false,true);}});regions.set(r.record,rect);svg.append(rect);}
  for(const pin of pagePins){const [x,y,w,h]=window.JCIDSchematicPins.rectangle(pin),rect=document.createElementNS(svgNS,'rect');rect.setAttribute('x',x*meta.width);rect.setAttribute('y',y*meta.height);rect.setAttribute('width',w*meta.width);rect.setAttribute('height',h*meta.height);rect.setAttribute('class','pin-hit');rect.setAttribute('role','button');rect.setAttribute('tabindex','0');rect.setAttribute('aria-label',pin.component+' · Pad '+pin.pad+' · Página '+pin.page);rect.dataset.component=pin.component;rect.dataset.pad=pin.pad;const title=document.createElementNS(svgNS,'title');title.textContent=pin.component+' · Pad '+pin.pad;rect.append(title);rect.addEventListener('click',e=>{e.stopPropagation();if(e.detail===0&&!suppressClick)selectPin(pin,false,true);else pick(e);});rect.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectPin(pin,false,true);}});svg.append(rect);}
  img.addEventListener('pdfpagepaint',schedule);shell.append(img,svg);mounted.set(p.page,{img,svg,regions,surface});pinOverlay(mounted.get(p.page),p.page);
 }
 function unmount(number){mounted.get(number)?.surface.destroy();const shell=shells.get(number);shell.replaceChildren();const placeholder=document.createElement('div');placeholder.className='page-placeholder';placeholder.textContent='Página '+number;shell.append(placeholder);mounted.delete(number);}
 function refresh(){
  if(raf){cancelAnimationFrame(raf);raf=0;}if(!state.layout.length||!viewer.clientHeight)return;
  const start=viewer.scrollTop-viewer.clientHeight*.75,end=viewer.scrollTop+viewer.clientHeight*1.75,visible=state.layout.filter(p=>p.top+p.height>=start&&p.top<=end),wanted=new Set(visible.map(p=>p.page));
  const center=viewer.scrollTop+viewer.clientHeight/2;
  visible.sort((a,b)=>Math.abs(a.top+a.height/2-center)-Math.abs(b.top+b.height/2-center));
  for(const p of visible){lastVisit.set(p.page,++visit);const priority=Math.abs(p.top+p.height/2-center);if(!mounted.has(p.page))mount(p,priority);const surface=mounted.get(p.page).surface;surface.setPriority?.(priority);surface.resize(p.width,{x:viewer.scrollLeft-p.left,y:viewer.scrollTop-p.top,width:viewer.clientWidth,height:viewer.clientHeight,pageHeight:p.height,moving:!!momentum||!!pinch||touches.size>0&&!!drag?.moved});}
  for(const n of [...mounted.keys()])if(!wanted.has(n)&&mounted.get(n).img.dataset.ready!=='true'){unmount(n);lastVisit.delete(n);}
  let bytes=[...mounted.values()].reduce((n,m)=>n+(m.surface.getBytes?.()||m.img.width*m.img.height*4),0);
  const cold=[...mounted.keys()].filter(n=>!wanted.has(n)).sort((a,b)=>(lastVisit.get(a)||0)-(lastVisit.get(b)||0));
  while(cold.length&&(mounted.size>6||bytes>24000000)){const n=cold.shift(),m=mounted.get(n);bytes-=m.surface.getBytes?.()||m.img.width*m.img.height*4;unmount(n);lastVisit.delete(n);}
  for(const n of cold)mounted.get(n).surface.suspend?.();
  const current=state.layout.find(p=>center<p.top+p.height)||state.layout.at(-1);state.page=current.page;
  if(document.activeElement!==$('pageNumber'))$('pageNumber').value=state.page;$('previousPage').disabled=state.page===pages[0].page;$('nextPage').disabled=state.page===pages.at(-1).page;$('originalPdf').href=doc.pdf+'#page='+state.page;
 }
 function schedule(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;refresh();});}
 function pinOverlay(m,page){
  m.svg.querySelector('.pin-target')?.remove();const pin=state.selectedPin;if(!pin||pin.page!==page)return;
  const meta=pageData(page),[x,y,w,h]=pin.terminal||pin.rect,node=document.createElementNS(svgNS,'rect');
  node.setAttribute('x',x*meta.width-.5);node.setAttribute('y',y*meta.height-.5);node.setAttribute('width',w*meta.width+1);node.setAttribute('height',h*meta.height+1);node.setAttribute('class','pin-target');node.setAttribute('aria-label',state.name+' · Pad '+state.pad+' · Página '+page);node.dataset.component=state.name;node.dataset.pad=state.pad;m.svg.append(node);
 }
 function highlight(){for(const [n,m] of mounted){for(const r of byPage.get(n)||[])m.regions.get(r.record)?.setAttribute('class','region'+(!state.selectedPin&&state.selected?.record===r.record?' selected':''));pinOverlay(m,n);}}
 function occurrenceRows(){
  const rows=(state.searchMatches||(byName.get(state.name)||[])).filter(r=>navigation.selectionRectangle(r));
  // A precise pin may still point to its historical bank record. Represent
  // that current pad explicitly instead of leaving the occurrence field empty.
  if(state.selectedPin&&state.selected&&!rows.some(r=>r.record===state.selected.record))rows.unshift({...state.selected,pinSelection:state.selectedPin});
  return rows;
 }
 function fillOccurrences(){const choices=occurrenceRows(),select=$('occurrences');select.replaceChildren();if(!state.selected||!choices.length){const o=document.createElement('option');o.value='';o.textContent=choices.length?'Escolha…':'Ocorrências';select.append(o);}for(const r of choices){const o=document.createElement('option');o.value=r.record;o.textContent=r.identifier+(r.pinSelection?' · Pad '+r.pinSelection.pad:'')+' · p. '+r.page+(navigation.pageRole(r)==='physical'?' · posição':'');o.title=r.pinSelection?r.identifier+' · Pad '+r.pinSelection.pad:(navigation.pageRole(r)==='physical'?'Desenho de posição · ':navigation.exactLabel(r)?'Símbolo elétrico · ':'Terminais · ')+(r.marker_tokens||[r.identifier]).join(' / ');select.append(o);}select.disabled=!choices.length;if(state.selected)select.value=state.selected.record;select.title=state.selected?state.selected.identifier+' · Página '+state.selected.page:'Resultados da busca';}
 function searchComponents(){
  stopMomentum();
  const value=$('componentQuery').value.trim();state.searchMatches=null;const parts=value.toUpperCase().match(/^(.+?)[.:/\s]([A-Z]*[0-9]+)$/);if(parts&&byName.has(parts[1]))return selectName(parts[1],true,parts[2]);
  if($('searchExact').checked||!value)return selectName(value||null);
  const name=value.toUpperCase(),names=[...byName.keys()].filter(n=>n.includes(name)).sort((a,b)=>Number(b===name)-Number(a===name)||a.localeCompare(b,undefined,{numeric:true}));
  if(!names.length)return selectName(value);
  state.searchMatches=names.flatMap(n=>byName.get(n)).filter(r=>navigation.selectionRectangle(r));
  if(names.length===1){if(state.searchMatches.length)selectRecord(state.searchMatches[0],true,true,true);else selectName(names[0]);return;}
  selectionSerial++;state.name='';state.selected=null;state.selectedPin=null;state.pad=null;pending=null;highlight();fillOccurrences();$('focusRegion').disabled=true;$('viewerStatus').textContent='Escolha o componente na lista de ocorrências.';
 }
 function focusRecord(r){
  stopMomentum();
  if(!viewer.clientWidth||!viewer.clientHeight){pending=r;return;}
  const meta=pageData(r.page),[x,y,w,h]=navigation.rectangle(r);state.page=r.page;const scale=Math.min(viewer.clientWidth*.65/(w*meta.width),viewer.clientHeight*.45/(h*meta.height),2.2);
  state.fit=null;state.zoom=limitZoom(Math.max(state.zoom,Math.min(scale,r.pinTarget?1.1:.72)));layout();restore({page:r.page,x:(x+w/2)*meta.width,y:(y+h/2)*meta.height});refresh();
 }
 function selectRecord(r,focus=true,notify=true,keepResults=false){
  stopMomentum();
  selectionSerial++;state.selectedPin=null;state.pad=null;
  if(!keepResults)state.searchMatches=null;
  state.selected=r;state.name=r.identifier.toUpperCase();$('componentQuery').value=r.identifier;fillOccurrences();highlight();$('focusRegion').disabled=false;$('viewerStatus').textContent=r.identifier+' · Página '+r.page;if(focus)focusRecord(r);if(notify&&canSync)send('selected',{component:r.identifier,page:r.page});
 }
 function selectPin(pin,focus=true,notify=true){
  const parent=(byName.get(pin.component)||[]).find(r=>r.record===pin.record);if(!parent)return false;
  selectRecord(parent,false,false);state.selectedPin=pin;state.pad=pin.pad;fillOccurrences();$('componentQuery').value=pin.component+'.'+pin.pad;highlight();if(focus)focusSelection();$('viewerStatus').textContent=pin.component+' · Pad '+pin.pad+' · Página '+pin.page;if(canSync)send(notify?'selected':'located',{component:pin.component,pad:pin.pad,page:pin.page});return true;
 }
 function focusSelection(){const pin=state.selectedPin;if(pin)focusRecord({page:pin.page,rect_normalized:pin.terminal||pin.rect,pinTarget:true});else if(state.selected)focusRecord(state.selected);}
 async function selectName(value,notify=true,pad=null,preferredPage=null){
  stopMomentum();
  const ticket=++selectionSerial;state.searchMatches=null;
  if(value===null){state.name='';state.selected=null;state.selectedPin=null;state.pad=null;pending=null;highlight();fillOccurrences();$('componentQuery').value='';$('focusRegion').disabled=true;$('viewerStatus').textContent=navigationHint;return true;}
  const name=String(value||'').trim().toUpperCase(),matches=byName.get(name);
  if(!matches?.length){state.name='';state.selected=null;state.selectedPin=null;state.pad=null;pending=null;highlight();fillOccurrences();$('focusRegion').disabled=true;$('componentQuery').value=name;$('viewerStatus').textContent='Sem posição no esquema para '+name;send('missing',{component:name});return false;}
  const pinName=typeof pad==='string'&&pad.length<=32?pad.trim().toUpperCase():null;
  if(pinName){
   $('viewerStatus').textContent='Localizando '+name+'.'+pinName+'…';let pins=[];
   try{pins=await window.JCIDSchematicPins.find(D,name,pinName);}catch{}
   if(ticket!==selectionSerial)return false;
   if(pins.length){
    const old=state.name===name&&state.pad===pinName?state.selectedPin:null;
    pins.sort((a,b)=>a.page-b.page||a.rect[1]-b.rect[1]||a.rect[0]-b.rect[0]);
    const pin=pins.find(p=>old&&p.page===old.page&&p.record===old.record)||pins.find(p=>p.page===state.page)||pins[0],parent=matches.find(r=>r.record===pin.record);
    if(parent)return selectPin(pin,true,notify);
   }
  }
  const safeMatches=matches.filter(r=>navigation.selectionRectangle(r));
  if(!safeMatches.length){state.name=name;state.selected=null;state.selectedPin=null;state.pad=null;pending=null;highlight();fillOccurrences();$('componentQuery').value=pinName?name+'.'+pinName:name;$('focusRegion').disabled=true;$('viewerStatus').textContent='Referência individual não localizada para '+name;send(pinName?'pin-missing':'missing',{component:name,...(pinName?{pad:pinName}:{})});return false;}
  const exactPage=Number.isInteger(preferredPage)?safeMatches.filter(r=>r.page===preferredPage):[],r=navigation.choose(exactPage.length?exactPage:safeMatches,state.page,preferredPage===null&&state.name===name?state.selected:null);selectRecord(r,true,notify&&!pinName);
  if(pinName){$('componentQuery').value=name+'.'+pinName;$('viewerStatus').textContent='Terminal '+pinName+' não localizado · mostrando '+name;send('pin-missing',{component:name,pad:pinName,page:r.page});}
  else if(!notify)send('located',{component:r.identifier,page:r.page});return !pinName;
 }

 function gotoPage(value){stopMomentum();const number=clamp(Math.round(Number(value)||1),1,pages.length),page=pageData(number).page;state.page=page;if(state.fit){state.zoom=fitScale();layout();}const p=entry(page);if(p){viewer.scrollTop=p.top-10;refresh();}$('pageNumber').value=state.page;}
 $('componentSearch').addEventListener('submit',e=>{e.preventDefault();searchComponents();});
 $('occurrences').addEventListener('change',()=>{const r=occurrenceRows().find(r=>String(r.record)===$('occurrences').value);if(r?.pinSelection)selectPin(r.pinSelection,true,true);else if(r)selectRecord(r,true,true,true);});
 $('pageNumber').max=pages.length;$('pageTotal').textContent='/ '+pages.length;$('pageNumber').addEventListener('change',()=>gotoPage($('pageNumber').value));$('pageNumber').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();gotoPage($('pageNumber').value);viewer.focus();}});
 $('previousPage').addEventListener('click',()=>gotoPage(state.page-1));$('nextPage').addEventListener('click',()=>gotoPage(state.page+1));$('fitDocument').addEventListener('click',()=>chooseFit('width'));$('focusRegion').addEventListener('click',focusSelection);
 $('dockViewer').addEventListener('click',()=>send('dock'));
 viewer.addEventListener('scroll',schedule,{passive:true});
 function setWheelMode(mode,persist=true){
  stopMomentum();if(wheelFrame)cancelAnimationFrame(wheelFrame);wheelFrame=0;wheelDelta=0;wheelPoint=null;wheelMode=mode==='scroll'?'scroll':'zoom';
  if(persist)try{localStorage.setItem(wheelModeKey,wheelMode);}catch{}
  updateWheelControl();
 }
 $('wheelMode').addEventListener('click',()=>setWheelMode(wheelMode==='zoom'?'scroll':'zoom'));
 window.addEventListener('storage',e=>{if(e.key===wheelModeKey)setWheelMode(e.newValue,false);});
 function flushWheel(){wheelFrame=0;const point=wheelPoint,delta=wheelDelta;wheelDelta=0;if(!point)return;const box=viewer.getBoundingClientRect(),sx=point.x-box.left,sy=point.y-box.top,pointY=viewer.scrollTop+sy,p=state.layout.find(p=>pointY<p.top+p.height)||state.layout.at(-1);if(!p)return;const px=(viewer.scrollLeft+sx-p.left)/state.zoom,py=(pointY-p.top)/state.zoom;setZoom(state.zoom*Math.exp(-clamp(delta,-600,600)*.002),null);const next=entry(p.page);viewer.scrollLeft=next.left+px*state.zoom-sx;viewer.scrollTop=next.top+py*state.zoom-sy;schedule();}
 viewer.addEventListener('wheel',e=>{stopMomentum();if(wheelMode==='scroll'&&!e.ctrlKey)return;e.preventDefault();wheelPoint={x:e.clientX,y:e.clientY};wheelDelta+=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?viewer.clientHeight:1);if(!wheelFrame)wheelFrame=requestAnimationFrame(flushWheel);},{passive:false});
 // Own the PDF gesture from its first contact. Native scrolling can otherwise
 // cancel the sequence before the second finger arrives, especially in an iframe.
 const touches=new Map();let pinch=null,touchFrame=0,touchClickTimer=0,touchMoved=false,pinchedSequence=false;
 // All motion is in CSS pixels and milliseconds, independent of frame rate.
 // Only a recent, uninterrupted one-finger touch can launch a glide.
 function stopMomentum(){
  const moving=!!momentum;momentum=null;if(momentumFrame)cancelAnimationFrame(momentumFrame);momentumFrame=0;
  if(moving)schedule();
 }
 function sampleDrag(d,time=performance.now()){
  if(!d.samples)return;
  d.samples.push({time,x:viewer.scrollLeft,y:viewer.scrollTop});
  while(d.samples.length>2&&d.samples[1].time<time-100)d.samples.shift();
  d.lastMove=time;
 }
 function glide(d,releasedAt=performance.now()){
  if(!d?.samples||!d.moved||pinchedSequence||reducedMotion.matches||document.hidden)return;
  const now=performance.now();if(releasedAt-d.lastMove>80)return;
  const samples=d.samples,last=samples.at(-1),first=samples.find(p=>p!==last&&p.time>=last.time-100)||samples.at(-2)||last,dt=last.time-first.time;
  if(dt<12)return;
  let vx=(last.x-first.x)/dt,vy=(last.y-first.y)/dt;
  const speed=Math.hypot(vx,vy);if(speed<.08)return;if(speed>3){vx*=3/speed;vy*=3/speed;}
  momentum={x:viewer.scrollLeft,y:viewer.scrollTop,vx,vy,last:now};
  function step(time){
   momentumFrame=0;const m=momentum;if(!m)return;
   if(document.hidden||reducedMotion.matches||touches.size){stopMomentum();return;}
   const elapsed=Math.min(48,Math.max(0,time-m.last)),decay=Math.exp(-elapsed/260),distance=260*(1-decay);m.last=time;
   const maxX=Math.max(0,viewer.scrollWidth-viewer.clientWidth),maxY=Math.max(0,viewer.scrollHeight-viewer.clientHeight);
   const nextX=m.x+m.vx*distance,nextY=m.y+m.vy*distance;
   m.x=clamp(nextX,0,maxX);m.y=clamp(nextY,0,maxY);
   m.vx=nextX!==m.x?0:m.vx*decay;m.vy=nextY!==m.y?0:m.vy*decay;
   viewer.scrollLeft=m.x;viewer.scrollTop=m.y;schedule();
   if(Math.hypot(m.vx,m.vy)<.035){stopMomentum();return;}
   momentumFrame=requestAnimationFrame(step);
  }
  momentumFrame=requestAnimationFrame(step);schedule();
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMomentum();});
 document.addEventListener('pointerdown',e=>{if(!viewer.contains(e.target))stopMomentum();},{capture:true});
 window.addEventListener('pagehide',stopMomentum);
 reducedMotion.addEventListener?.('change',()=>{if(reducedMotion.matches)stopMomentum();});
 function holdClick(){clearTimeout(touchClickTimer);suppressClick=true;touchMoved=true;}
 function capture(id){try{viewer.setPointerCapture(id);}catch{}}
 function pairPosition(){const [a,b]=[...touches.values()];if(!a||!b)return null;return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};}
 function startPinch(){
  const point=pairPosition();if(!point)return;
  const box=viewer.getBoundingClientRect(),sx=point.x-box.left,sy=point.y-box.top,y=viewer.scrollTop+sy,p=state.layout.find(p=>y<p.top+p.height)||state.layout.at(-1);if(!p)return;
  pinchedSequence=true;pinch={zoom:state.zoom,distance:point.distance,page:p.page,x:(viewer.scrollLeft+sx-p.left)/state.zoom,y:(y-p.top)/state.zoom};
  drag=null;holdClick();for(const id of touches.keys())capture(id);viewer.classList.remove('panning');viewer.classList.add('pinching');
 }
 function flushTouch(){
  if(touchFrame){cancelAnimationFrame(touchFrame);touchFrame=0;}
  if(!pinch)return;const point=pairPosition();if(!point)return;
  const box=viewer.getBoundingClientRect(),sx=point.x-box.left,sy=point.y-box.top;
  setZoom(pinch.zoom*point.distance/pinch.distance,null);
  const p=entry(pinch.page);if(p){viewer.scrollLeft=p.left+pinch.x*state.zoom-sx;viewer.scrollTop=p.top+pinch.y*state.zoom-sy;schedule();}
 }
 function startDrag(e){const time=e.timeStamp;drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewer.scrollLeft,top:viewer.scrollTop,moved:false,lastMove:time,samples:e.pointerType==='touch'?[{time,x:viewer.scrollLeft,y:viewer.scrollTop}]:null};}
 viewer.addEventListener('pointerdown',e=>{
  const stopped=!!momentum;stopMomentum();
  if(e.pointerType==='mouse'){if(e.button!==0||touches.size)return;suppressClick=false;startDrag(e);viewer.focus({preventScroll:true});return;}
  if(!touches.size){clearTimeout(touchClickTimer);touchMoved=stopped;suppressClick=stopped;pinchedSequence=false;startDrag(e);}
  touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size>=2){if(e.cancelable)e.preventDefault();flushTouch();startPinch();}
 });
 viewer.addEventListener('pointermove',e=>{
  if(touches.has(e.pointerId)){touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch){if(e.cancelable)e.preventDefault();if(!touchFrame)touchFrame=requestAnimationFrame(flushTouch);return;}}
  if(!drag||drag.id!==e.pointerId)return;
  if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4){drag.moved=true;capture(e.pointerId);viewer.classList.add('panning');if(e.pointerType!=='mouse')holdClick();}
  if(drag.moved){if(e.cancelable)e.preventDefault();viewer.scrollLeft=drag.left+drag.x-e.clientX;viewer.scrollTop=drag.top+drag.y-e.clientY;sampleDrag(drag,e.timeStamp);schedule();}
 });
 function endPointer(e){
  // A touch begins implicitly captured by the hit SVG rect. Moving capture to
  // this viewport emits a bubbling loss from that rect, not an ended gesture.
  if(e.type==='lostpointercapture'&&e.target!==viewer)return;
  if(touches.has(e.pointerId)){
   const ended=drag,wasPinch=!!pinch;flushTouch();touches.delete(e.pointerId);pinch=null;drag=null;
   if(touches.size>=2){startPinch();return;}
   viewer.classList.remove('pinching','panning');
   if(touches.size){const [id,p]=[...touches][0];drag={id,x:p.x,y:p.y,left:viewer.scrollLeft,top:viewer.scrollTop,moved:touchMoved};}
   else{if(e.type==='pointerup'&&!wasPinch)glide(ended,e.timeStamp);if(touchMoved)touchClickTimer=setTimeout(()=>{suppressClick=false;},300);schedule();}
   return;
  }
  if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;suppressClick=d.moved;viewer.classList.remove('panning');if(suppressClick)setTimeout(()=>{suppressClick=false;},0);
 }
 for(const type of ['pointerup','pointercancel','lostpointercapture'])viewer.addEventListener(type,endPointer);
 // Prevent long-press selection and legacy Safari's outer-page magnification.
 viewer.addEventListener('contextmenu',e=>e.preventDefault());
 for(const type of ['gesturestart','gesturechange'])viewer.addEventListener(type,e=>e.preventDefault(),{passive:false});
 function resize(){stopMomentum();if(!viewer.clientWidth||!viewer.clientHeight)return;const a=anchor();if(state.fit)state.zoom=fitScale();else state.zoom=limitZoom(state.zoom);layout(a);if(pending){const r=pending;pending=null;focusRecord(r);}}
 new ResizeObserver(resize).observe(viewer);
 viewer.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(state.zoom*1.25);}else if(e.key==='-'){e.preventDefault();setZoom(state.zoom/1.25);}else if(e.key==='0'){e.preventDefault();chooseFit('width');}else if(e.key.toLowerCase()==='f'&&state.selected){e.preventDefault();focusSelection();}});
 window.addEventListener('message',e=>{if(!host||e.source!==host||e.origin!==origin)return;const m=e.data;if(m?.channel!=='jcid-workbench'||m.schematicId!==context.schematicId||m.boardId!==context.boardId||m.session!==context.session)return;if(m.type==='resize')resize();if(m.type==='reference'&&typeof m.component==='string'&&m.component.length<=128&&Number.isInteger(m.page)&&pages.some(p=>p.page===m.page))selectName(m.component,false,null,m.page);if(m.type==='select'&&(m.component===null||canSync&&typeof m.component==='string'&&m.component.length<=128))selectName(m.component,false,typeof m.pad==='string'?m.pad:null);});
 if(!D.regions.length){$('componentQuery').disabled=true;$('componentQuery').placeholder=doc.type==='reference'?'Documento de referência':'PDF sem índice de componentes';$('searchExact').disabled=true;}
 resize();if(canSync&&query.get('componente'))selectName(query.get('componente'),false,query.get('pad'),query.has('pagina')?Number(query.get('pagina')):null);send('ready');
})();
