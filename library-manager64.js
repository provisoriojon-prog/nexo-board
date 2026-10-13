import {STORAGE_KEY,validateLayout,loadLayout,saveLayout,applyLayout,orderedKeys,modelKey,itemKey,groupKey,parentKey,legacyModel,cleanLabel,normalizeLabel,hiddenItem} from './library-layout64.js';
import {ICON_LABELS,createFileIcon,inferIcon} from './file-icons61.js';
import {listPackages,removePackage} from './nexus-db.js';
let layout,loadError='',active=false,busy=false,saving=false,serverRevision=null,hooks={},rawCatalog={models:[]},rawRegistry={documents:[]},dialog,dialogTarget,drag,suppressClick=false;
try{layout=loadLayout();}catch(error){loadError=error.message;layout={version:1,entries:{},orders:{}};}
const descriptors=new Map(),$=id=>document.getElementById(id),endpoint=new URL('/api/library-layout64',location.href);
const SERVER_KEY='nexus-library-server64';
export async function initializeLibraryManager(){
 let recognized=false;try{recognized=localStorage.getItem(SERVER_KEY)===location.origin;}catch{}
 try{
  const response=await fetch(endpoint,{cache:'no-store',headers:{Accept:'application/json'}});
  if(response.status===404||response.status===405||!response.headers.get('content-type')?.includes('application/json')){if(recognized)throw Error('O serviço de biblioteca do PC não está disponível.');return;}
  recognized=true;if(!response.ok)throw Error('Não foi possível abrir a organização salva no PC. Seus dados foram preservados.');
  const data=await response.json();if(data.version!==1||!Number.isSafeInteger(data.revision)||data.revision<0||data.layout!==null&&!data.layout)throw Error('A organização salva no PC é inválida. Seus dados foram preservados.');
  serverRevision=data.revision;try{localStorage.setItem(SERVER_KEY,location.origin);}catch{}
  if(data.layout){layout=validateLayout(data.layout);try{saveLayout(layout);}catch{}loadError='';}
  else if(Object.keys(layout.entries).length||Object.keys(layout.orders).length){await persist(layout);}
 }catch(error){if(recognized||serverRevision!==null)loadError=error.message;}
}

async function persist(next){
 if(serverRevision!==null){const response=await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:serverRevision,layout:next})});if(response.status===409){const latest=await response.json();if(latest.layout){layout=validateLayout(latest.layout);serverRevision=latest.revision;try{saveLayout(layout);}catch{}hooks.refreshMetadata?.();}throw Error('A biblioteca foi alterada em outra janela. Confira a lista e tente novamente.');}if(!response.ok)throw Error('Não foi possível salvar a organização no PC. Tente novamente.');const saved=await response.json();serverRevision=saved.revision;try{saveLayout(next);}catch{}
 }else saveLayout(next);
}
function message(text,error=false){const field=$('libraryManagerMessage');if(field){field.textContent=text;field.classList.toggle('error',error);}window.dispatchEvent(new CustomEvent('nexus:library-notice',{detail:{text,error}}));}
export function configureLibraryManager(value){hooks=value;}
export function applyLibraryLayout(catalog,registry){rawCatalog=catalog;rawRegistry=registry;return applyLayout(catalog,registry,layout);}
async function commit(next){if(loadError)throw Error(loadError);if(saving)throw Error('Aguarde a alteração anterior terminar.');saving=true;try{await persist(next);layout=next;hooks.refreshMetadata?.();}finally{saving=false;}}
function resolve(key){return descriptors.get(key);}
function setActive(value){if(busy||saving)return false;if(value&&loadError){message(loadError,true);return false;}active=!!value;document.body.classList.toggle('library-edit-mode',active);$('libraryManagerBar')?.toggleAttribute('hidden',!active);if(active){if($('workspace')?.classList.contains('devices-hidden'))$('devicesButton')?.click();}window.dispatchEvent(new CustomEvent('nexus:library-editing',{detail:{active}}));hooks.render?.();return active;}
function buildUI(){
 if($('libraryManagerBar'))return;
 const list=$('deviceList');if(!list)return;
 const bar=document.createElement('div');bar.id='libraryManagerBar';bar.hidden=!active;bar.innerHTML='<span><i aria-hidden="true"></i>EDITANDO BIBLIOTECA</span><button type="button" id="libraryManagerDone">Concluir</button><small id="libraryManagerMessage">Arraste pela alça. Toque no nome para editar.</small>';list.before(bar);$('libraryManagerDone').onclick=()=>setActive(false);
 dialog=document.createElement('dialog');dialog.id='libraryManagerDialog';dialog.className='library-manager-dialog';dialog.innerHTML='<form id="libraryManagerForm"><header><strong id="libraryManagerTitle">Editar arquivo</strong><button type="button" id="libraryManagerClose" aria-label="Fechar">×</button></header><label class="library-manager-name">Nome<input id="libraryManagerName" maxlength="180" autocomplete="off" required></label><fieldset id="libraryManagerIcons"><legend>Ícone</legend><div></div></fieldset><p id="libraryManagerError" role="alert"></p><footer><button type="button" id="libraryManagerCancel">Cancelar</button><button type="submit" id="libraryManagerSave">Salvar</button></footer></form>';document.body.append(dialog);
 const icons=$('libraryManagerIcons').querySelector('div');for(const [id,label] of Object.entries(ICON_LABELS)){const b=document.createElement('button');b.type='button';b.dataset.libraryIcon=id;b.title=label;b.setAttribute('aria-label',label);b.append(createFileIcon(id));const text=document.createElement('span');text.textContent=label;b.append(text);b.onclick=()=>selectIcon(id);icons.append(b);}
 $('libraryManagerClose').onclick=$('libraryManagerCancel').onclick=()=>dialog.close();$('libraryManagerForm').onsubmit=async e=>{e.preventDefault();if(saving)return;$('libraryManagerSave').disabled=true;try{await saveDialog();}catch(error){$('libraryManagerError').textContent=error.message;}finally{$('libraryManagerSave').disabled=false;}};
 list.addEventListener('click',event=>{
  if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;return;}
  if(!active)return;const row=event.target.closest('.library-row');if(!row)return;
  const key=row.dataset.libraryKey;if(event.target.closest('.library-delete')){event.preventDefault();event.stopImmediatePropagation();deleteEntry(key);return;}
  if(event.target.closest('.library-grip')){event.preventDefault();event.stopImmediatePropagation();return;}
  if(event.target.closest('.folder-expand'))return;
  event.preventDefault();event.stopImmediatePropagation();editEntry(key);
 },true);
 list.addEventListener('pointerdown',pointerDown);list.addEventListener('pointermove',pointerMove);list.addEventListener('pointerup',pointerUp);list.addEventListener('pointercancel',cancelDrag);
 list.addEventListener('keydown',async event=>{if(!active||!event.target.matches('.library-grip')||!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const row=event.target.closest('.library-row'),keys=siblingKeys(row),at=keys.indexOf(row.dataset.libraryKey),to=at+(event.key==='ArrowUp'?-1:1);if(to>=0&&to<keys.length){try{await moveEntry(row.dataset.libraryKey,keys[to],to>at);}catch(error){message(error.message,true);}findRow(row.dataset.libraryKey)?.querySelector('.library-grip')?.focus();}});
}
function selectIcon(id){for(const b of $('libraryManagerIcons').querySelectorAll('[data-library-icon]'))b.setAttribute('aria-pressed',String(b.dataset.libraryIcon===id));}
function editEntry(key){if(busy)return;const target=resolve(key);if(!target)return;dialogTarget=target;$('libraryManagerTitle').textContent=target.type==='file'?'Editar arquivo':'Editar pasta';$('libraryManagerName').value=target.label;$('libraryManagerIcons').hidden=target.type!=='file';selectIcon(inferIcon(target.item||{}));$('libraryManagerError').textContent='';dialog.showModal();$('libraryManagerName').focus();$('libraryManagerName').select();}
async function saveDialog(){
 const target=dialogTarget,label=cleanLabel($('libraryManagerName').value),conflict=[...descriptors.values()].find(d=>d.key!==target.key&&d.parent===target.parent&&normalizeLabel(d.label)===normalizeLabel(label));if(conflict)throw Error('Já existe um arquivo ou pasta com esse nome neste local.');
 const next=structuredClone(layout),entry={...next.entries[target.key],label};if(target.type==='file')entry.icon=document.querySelector('#libraryManagerIcons [aria-pressed="true"]').dataset.libraryIcon;next.entries[target.key]=entry;await commit(next);dialog.close();message('Alteração salva.');
}
async function deleteEntry(key){
 const target=resolve(key);if(!target||busy)return;
 const descendants=target.type==='file'?[]:rawCatalog.models.filter(m=>target.type==='legacy'?legacyModel(m.id):m.id===target.modelId).flatMap(m=>m.children.filter(i=>!i.nexus_root&&(target.type!=='group'||i.group===target.group)));
 const prompt=target.type==='file'?'Excluir “'+target.label+'” da biblioteca?':'Excluir a pasta “'+target.label+'” e seus '+descendants.length+' arquivos da biblioteca?';
 if(!confirm(prompt+' Essa alteração é permanente nesta biblioteca.'))return;
 busy=true;try{
  if(target.item?.nexus_document){await window.NexusDurableDocuments.remove(target.item.nexus_document);message('Excluído da biblioteca.');return;}
  const next=structuredClone(layout);next.entries[key]={...next.entries[key],deleted:true};await commit(next);
  // A package is removed only when every catalog item was explicitly deleted.
  // Shared bulk-package blobs remain intact while any sibling can still use them.
  let removed=0;const gc=async()=>{for(const record of await listPackages()){if(record.status!=='ready')continue;const pairs=record.manifest.catalog.models.flatMap(m=>m.children.map(item=>({model:m,item})));if(pairs.length&&pairs.every(({model,item})=>hiddenItem(layout,model,item))){await removePackage(record.id);removed++;}}};
  if(navigator.locks)await navigator.locks.request('nexus-library-write',gc);else await gc();if(removed)await hooks.refresh?.();message('Excluído da biblioteca.');
 }catch(error){message(error.message,true);}finally{busy=false;}
}
function findRow(key){return [...document.querySelectorAll('#deviceList .library-row')].find(el=>el.dataset.libraryKey===key);}
function siblingKeys(row){return [...document.querySelectorAll('#deviceList .library-row')].filter(r=>r.dataset.libraryParent===row.dataset.libraryParent).map(r=>r.dataset.libraryKey);}
async function moveEntry(key,target,after){const source=resolve(key),destination=resolve(target);if(!source||!destination||source.parent!==destination.parent||key===target)return false;const keys=orderedKeys([...descriptors.values()].filter(d=>d.parent===source.parent).map(d=>d.key),source.parent,layout).filter(k=>k!==key),at=keys.indexOf(target);keys.splice(at+(after?1:0),0,key);const next=structuredClone(layout);next.orders[source.parent]=keys;await commit(next);message('Posição salva.');return true;}
function cancelDrag(){if(drag?.timer)clearTimeout(drag.timer);drag=null;document.body.classList.remove('library-dragging');for(const el of document.querySelectorAll('.library-drop-before,.library-drop-after,.library-drag-source'))el.classList.remove('library-drop-before','library-drop-after','library-drag-source');}
function pointerDown(e){suppressClick=false;if(!active||busy||saving||e.button!==0)return;const row=e.target.closest('.library-row');if(!row||e.target.closest('.library-delete,.folder-expand'))return;const grip=!!e.target.closest('.library-grip');drag={id:e.pointerId,key:row.dataset.libraryKey,parent:row.dataset.libraryParent,x:e.clientX,y:e.clientY,started:false,ready:e.pointerType!=='touch'||grip};if(!drag.ready)drag.timer=setTimeout(()=>{if(drag)drag.ready=true;},330);if(grip){e.preventDefault();row.setPointerCapture(e.pointerId);}}
function pointerMove(e){if(!drag||drag.id!==e.pointerId)return;const distance=Math.hypot(e.clientX-drag.x,e.clientY-drag.y);if(!drag.ready){if(distance>8)cancelDrag();return;}if(!drag.started&&distance<6)return;e.preventDefault();drag.started=true;document.body.classList.add('library-dragging');findRow(drag.key)?.classList.add('library-drag-source');const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.library-row');for(const row of document.querySelectorAll('.library-drop-before,.library-drop-after'))row.classList.remove('library-drop-before','library-drop-after');drag.target=null;if(target&&target.dataset.libraryParent===drag.parent&&target.dataset.libraryKey!==drag.key){const rect=target.getBoundingClientRect();drag.target=target.dataset.libraryKey;drag.after=e.clientY>rect.top+rect.height/2;target.classList.add(drag.after?'library-drop-after':'library-drop-before');}const list=$('deviceList'),rect=list.getBoundingClientRect();if(e.clientY<rect.top+32)list.scrollTop-=12;else if(e.clientY>rect.bottom-32)list.scrollTop+=12;}
async function pointerUp(e){if(!drag||drag.id!==e.pointerId)return;const current=drag;cancelDrag();if(current.started){suppressClick=true;setTimeout(()=>suppressClick=false,200);try{if(current.target)await moveEntry(current.key,current.target,current.after);}catch(error){message(error.message,true);}}}
function wrap(button,descriptor){descriptors.set(descriptor.key,descriptor);const row=document.createElement('div');row.className='library-row';row.dataset.libraryKey=descriptor.key;row.dataset.libraryParent=descriptor.parent;button.before(row);row.append(button);button.classList.add('library-main');const grip=document.createElement('button');grip.type='button';grip.className='library-grip';grip.textContent='⠿';grip.title='Arrastar para reordenar';grip.setAttribute('aria-label','Mover '+descriptor.label);const remove=document.createElement('button');remove.type='button';remove.className='library-delete';remove.setAttribute('aria-label','Excluir '+descriptor.label);remove.title='Excluir '+descriptor.label;remove.innerHTML='<span aria-hidden="true"></span>';row.append(grip,remove);return row;}
export function decorateLibraryTree(){
 buildUI();const list=$('deviceList');if(!list)return;descriptors.clear();
 const catalog=window.JCID_DEVICES;
 for(const model of [...(catalog?.models||[])].reverse()){
  const key=modelKey(model.id);if(!model.nexus_hidden_folder&&(!model.children.length||model.children.some(i=>!i.nexus_root)))descriptors.set(key,{key,parent:legacyModel(model.id)?'legacy':'root',type:'model',modelId:model.id,label:model.label});
  const groups=new Set();for(const item of model.children){const key=itemKey(item.id);descriptors.set(key,{key,parent:parentKey(model,item),type:'file',modelId:model.id,itemId:item.id,item,label:item.label});if(item.group&&!groups.has(item.group)){groups.add(item.group);const key=groupKey(model.id,item.group);descriptors.set(key,{key,parent:modelKey(model.id),type:'group',modelId:model.id,group:item.group,label:item.groupLabel||item.group});}}
 }
 if(catalog.models.some(m=>legacyModel(m.id)&&!m.nexus_hidden_folder&&m.children.some(i=>!i.nexus_root)))descriptors.set('legacy',{key:'legacy',parent:'root',type:'legacy',label:layout.entries.legacy?.label||'iPhones antigos'});
 for(const model of catalog?.models||[]){
  const group=[...list.querySelectorAll('.device-folder[data-model]')].find(el=>el.dataset.model===model.id);if(!group)continue;const folder=group.querySelector(':scope > .folder-button');if(folder)wrap(folder,{key:modelKey(model.id),parent:legacyModel(model.id)?'legacy':'root',type:'model',modelId:model.id,label:model.label});
  for(const sub of group.querySelectorAll('.device-subfolder')){const button=sub.querySelector(':scope > .folder-button'),key=button.dataset.folder.slice(model.id.length+1),item=model.children.find(i=>i.group===key);wrap(button,{key:groupKey(model.id,key),parent:modelKey(model.id),type:'group',modelId:model.id,group:key,label:item?.groupLabel||key});}
  for(const button of group.querySelectorAll('.device-child')){const item=model.children.find(i=>i.id===button.dataset.item);if(item)wrap(button,{key:itemKey(item.id),parent:parentKey(model,item),type:'file',modelId:model.id,itemId:item.id,item,label:item.label});}
 }
 for(const button of [...list.querySelectorAll(':scope > .device-child')]){const model=catalog.models.find(m=>m.id===button.dataset.model),item=model?.children.find(i=>i.id===button.dataset.item);if(item)wrap(button,{key:itemKey(item.id),parent:'root',type:'file',modelId:model.id,itemId:item.id,item,label:item.label});}
 const legacy=list.querySelector('.legacy-folder > .folder-button');if(legacy){legacy.querySelector('.folder-label').textContent=layout.entries.legacy?.label||'iPhones antigos';wrap(legacy,{key:'legacy',parent:'root',type:'legacy',label:layout.entries.legacy?.label||'iPhones antigos'});}
 // Reorder direct siblings, including folders mixed with files, without moving across folders.
 for(const container of [...list.querySelectorAll('.device-children,.legacy-children'),list]){const nodes=[...container.children].map(node=>({node,row:node.matches('.library-row')?node:node.querySelector(':scope > .library-row')})).filter(x=>x.row);if(!nodes.length)continue;const keys=orderedKeys(nodes.map(x=>x.row.dataset.libraryKey),nodes[0].row.dataset.libraryParent,layout),map=new Map(nodes.map(x=>[x.row.dataset.libraryKey,x.node]));for(const key of keys)container.append(map.get(key));}
}
export async function adoptIndividualImport(placement){
 // A deliberate .sbnx import selects its new label/icon and may restore that item.
 // A bulk ZIP refresh keeps all permanent names, positions and deletion markers.
 if(!placement?.itemId)return;const key=itemKey(placement.itemId);if(!layout.entries[key])return;
 const next=structuredClone(layout);delete next.entries[key];await commit(next);
}

export async function adoptSnapshot(next,id){
 if(typeof id!=='string'||!id||id.length>180)throw Error('Identificação inválida da sincronização.');
 const marker='nexus-library-snapshot65';if(localStorage.getItem(marker)===id)return false;
 next=validateLayout(structuredClone(next));await commit(next);localStorage.setItem(marker,id);return true;
}

export async function migrateDocumentIdentity(oldId,newId){
 if(oldId===newId)return;const oldKey=itemKey(oldId),newKey=itemKey(newId),next=structuredClone(layout),prior=next.entries[oldKey];
 if(prior?.deleted)return;
 if(prior)next.entries[newKey]={...prior,...next.entries[newKey]};
 next.entries[oldKey]={...prior,deleted:true};
 for(const key of Object.keys(next.orders))next.orders[key]=next.orders[key].map(value=>value===oldKey?newKey:value).filter((value,index,array)=>array.indexOf(value)===index);
 await commit(next);
}

window.addEventListener('storage',event=>{if(event.key!==STORAGE_KEY)return;try{layout=loadLayout();loadError='';hooks.refreshMetadata?.();}catch(error){loadError=error.message;message(loadError,true);}});
window.NexusLibraryManager=Object.freeze({open:()=>setActive(true),close:()=>setActive(false),toggle:()=>setActive(!active),isActive:()=>active,isSaving:()=>saving,storageMode:()=>serverRevision===null?'browser':'desktop',decorate:decorateLibraryTree,storageKey:STORAGE_KEY,adoptSnapshot,migrateDocumentIdentity,snapshot:()=>structuredClone(layout),edit:editEntry});
