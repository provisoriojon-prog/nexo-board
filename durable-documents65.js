import {getFile,listPackages,removePackage} from './nexus-db.js';
import {hiddenItem} from './library-layout64.js';
let initialization,available=false,packageTools,hooks={},creating=false,migrating=false,records=new Map(),packages=new Map();
const pending=new Map(),states=new Map(),endpoint=new URL('/api/documents65',location.href),$=id=>document.getElementById(id);
const checkAbort=signal=>{if(signal?.aborted)throw new DOMException('Operação cancelada','AbortError');};
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const json=async response=>{let body;try{body=await response.json();}catch{throw Error('O aplicativo não conseguiu ler a resposta do armazenamento.');}if(!response.ok)throw Error(response.status===409?'Este documento foi alterado em outra janela. Reabra a cópia salva antes de editar novamente.':body.error||'Não foi possível guardar o documento no PC.');return body;};
const signal=()=>{renderStatus();window.dispatchEvent(new CustomEvent('nexus:durable-state'));};
function setStatus(id,status,message){states.set(id,{status,message});signal();}
export function configure(value){hooks=value;}
export function isAvailable(){return available;}
export function isCurrentSaved(){return records.has(currentId());}
export function isBusy(){return creating||migrating||[...pending.values()].some(p=>p.running||p.snapshot);}
function currentId(){return window.JCID_ACTIVE_BOARD?.id;}
function record(id){return records.get(id);}
function resource(value,entry){if(!value||value.startsWith('esquema.html?'))return value;const path=String(value).split('?')[0];if(path.startsWith('/')||path.split('/').some(p=>p==='..'||!p))throw Error('Caminho inválido no documento salvo.');return new URL(path.split('/').map(encodeURIComponent).join('/')+'?v='+entry.revision,new URL(entry.resourceBase,location.href)).href;}
export function localResource(item,path){const entry=records.get(item?.nexus_document)||packages.get(item?.nexus_server_package);return entry?resource(path,entry):null;}
export function catalog(){
 const models=new Map(),documents=new Map();
 const add=(entry,individual)=>{for(const source of entry.manifest.catalog.models){const items=(source.children||[]).filter(i=>!individual||i.interactive_map_ready).map(item=>{const next={...item};delete next.nexus_package;if(individual){next.nexus_document=entry.id;next.nexus_root=true;next.nexus_revision=entry.revision;}else next.nexus_server_package=entry.id;for(const key of ['board_data','preview','original'])if(next[key])next[key]=resource(next[key],entry);return next;});const existing=models.get(source.id);models.set(source.id,{...existing,...source,children:[...new Map([...(existing?.children||[]),...items].map(item=>[item.id,item])).values()]});}for(const doc of entry.manifest.schematics.documents){const next={...doc};delete next.nexus_package;for(const key of ['pdf','index','pin_index'])if(next[key])next[key]=resource(next[key],entry);documents.set(next.id,next);}};
 for(const entry of packages.values())add(entry,false);for(const entry of records.values())add(entry,true);
 return {catalog:{version:1,models:[...models.values()]},registry:{version:1,documents:[...documents.values()]}};
}
async function refreshLibrary(metadataOnly=false){await hooks.refreshLibrary?.({metadataOnly});}
async function upload(id,blob,{revision=0,originKey,signal}={}){const headers={'Content-Type':'application/zip','X-Nexus-Revision':String(revision)};if(originKey)headers['X-Nexus-Origin']=originKey;const entry=await json(await fetch(new URL(endpoint.href+'/'+encodeURIComponent(id)),{method:'PUT',headers,body:blob,signal}));records.set(entry.id,entry);return entry;}
async function installedPackage(record,manifest=record.manifest,{signal,onProgress=()=>{}}={}){
 const {ZipWriter,BlobWriter,BlobReader}=await import('./vendor/zipjs/index-native.min.js'),writer=new ZipWriter(new BlobWriter('application/zip'),{level:0});
 try{await writer.add('nexus-package.json',new BlobReader(new Blob([JSON.stringify(manifest)],{type:'application/json'})));let loaded=0;for(const file of record.manifest.files){checkAbort(signal);const stored=await getFile(record.id,file.path);if(!stored?.blob||stored.blob.size!==file.size)throw Error('Um arquivo importado não pôde ser lido: '+file.path);await writer.add(file.path,new BlobReader(stored.blob),{signal});loaded+=file.size;onProgress({phase:'migrating',label:'Preparando '+file.path,loaded,total:record.manifest.bytes});}return await writer.close();}catch(error){try{await writer.close();}catch{}throw error;}
}
const primary=manifest=>manifest.catalog.models.flatMap(model=>model.children.filter(item=>item.interactive_map_ready).map(item=>({model,item})))[0];
async function originOf(manifest){const {model,item}=primary(manifest);return sha(model.id+'\n'+item.id);}
export async function importIndividual(result,{migration=false,publish=true,signal,onProgress=()=>{}}={}){
 await ready();checkAbort(signal);if(!available)return result;
 const source=result.record,originKey=await originOf(source.manifest),prior=migration?[...records.values()].find(r=>r.originKey===originKey):records.get(result.placement?.existingId),id=prior?.id||(migration?'nexus-doc-'+originKey.slice(0,32):'nexus-doc-'+crypto.randomUUID());
 if(migration&&(prior||records.has(id))){await window.NexusLibraryManager?.migrateDocumentIdentity(primary(source.manifest).item.id,prior?.id||id);await removePackage(source.id);return {...result,durable:true,documentId:prior?.id||id};}
 setStatus(id,'saving','Guardando documento no PC…');
 const manifest=structuredClone(source.manifest),sourceItem=primary(manifest).item,overlay=migration?window.NexusLibraryManager?.snapshot().entries['file:'+sourceItem.id]:null;
 if(overlay?.label)sourceItem.label=overlay.label;if(overlay?.icon)sourceItem.icon=overlay.icon;
 const entry=await upload(id,await installedPackage(source,manifest,{signal,onProgress}),{revision:prior?.revision||0,originKey,signal});
 if(migration||result.placement?.existingId&&result.placement.existingId!==entry.id)await window.NexusLibraryManager?.migrateDocumentIdentity(result.placement?.existingId||sourceItem.id,entry.id);
 // The server verified every file before this browser copy can be discarded.
 await removePackage(source.id);setStatus(id,'saved','Guardado no PC');if(publish)await refreshLibrary(false);
 const target=primary(entry.manifest);return {...result,durable:true,documentId:entry.id,placement:{...result.placement,modelId:target.model.id,itemId:target.item.id,label:target.item.label,modelLabel:target.model.label}};
}
function availableName(value){const used=new Set((window.JCID_DEVICES?.models||[]).flatMap(m=>m.children.filter(i=>i.nexus_root).map(i=>i.label.toLocaleLowerCase('pt-BR'))));let label=value.slice(0,168),n=2;while(used.has(label.toLocaleLowerCase('pt-BR')))label=value.slice(0,158)+' ('+(n++)+')';return label;}
export async function saveCopy({label,joined=false,signal:abortSignal,onProgress=()=>{}}={}){
 await ready();if(!available)throw Error('Abra a versão local no PC para guardar documentos na biblioteca.');if(creating)throw Error('Aguarde o documento atual terminar de salvar.');
 const snapshot=packageTools.captureBoard(),oldId=snapshot.active.id,existing=records.get(oldId);
 if(existing&&joined){queueSnapshot(oldId,snapshot,true);await flush(oldId);return existing.id;}
 const id='nexus-doc-'+crypto.randomUUID(),name=availableName(label||(snapshot.model.label+' · '+(joined?'Junção':snapshot.item.label+' — cópia')));creating=true;setStatus(id,'saving','Criando documento na biblioteca…');
 try{const result=await packageTools.exportBoard({signal:abortSignal,onProgress,snapshot,identity:{label:name,icon:snapshot.item.icon||'board',nexus_root:true}});const entry=await upload(id,result.blob,{originKey:await originOf(result.manifest),signal:abortSignal});setStatus(id,'saved','Guardado no PC');await refreshLibrary(true);const target=primary(entry.manifest);await window.JCIDDesktop.replaceDocument(oldId,target.model.id,target.item.id);return id;}catch(error){setStatus(id,'error',error.message);throw error;}finally{creating=false;signal();}
}
export const saveJoinedCopy=options=>saveCopy({...options,joined:true});
function normalizeImages(data,entry){const base=new URL(entry.resourceBase,location.href);function clean(value){if(!value||!/^https?:/i.test(value))return value;const url=new URL(value);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw Error('Há novos desenhos nesta junção. Guarde novamente o documento completo.');return decodeURIComponent(url.pathname.slice(base.pathname.length));}if(data.imageSource)data.imageSource=clean(data.imageSource);for(const part of data.nexusComposition?.parts||[])if(part.imageSource)part.imageSource=clean(part.imageSource);return data;}
function queueSnapshot(id,snapshot,full=false){let task=pending.get(id);if(!task){task={id,snapshot:null,full:false,timer:null,running:null};pending.set(id,task);}task.snapshot=snapshot;task.full=task.full||full;clearTimeout(task.timer);task.timer=setTimeout(()=>flush(id).catch(()=>{}),900);setStatus(id,'pending','Alterações pendentes…');}
async function flushOne(id){const task=pending.get(id);if(!task)return;clearTimeout(task.timer);task.timer=null;if(task.running){await task.running;if(task.snapshot)return flushOne(id);return;}if(!task.snapshot)return;
 const snapshot=task.snapshot,full=task.full;task.snapshot=null;task.full=false;setStatus(id,'saving','Salvando alterações…');
 task.running=(async()=>{const entry=records.get(id);if(!entry)throw Error('O documento não está mais na biblioteca.');let saved;if(full){const result=await packageTools.exportBoard({snapshot,identity:{label:entry.label,nexus_root:true}});saved=await upload(id,result.blob,{revision:entry.revision,originKey:entry.originKey});}else{const data=normalizeImages(packageTools.boardDataFromSnapshot(snapshot),entry);saved=await json(await fetch(new URL(endpoint.href+'/'+encodeURIComponent(id)+'/board'),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:entry.revision,data})}));records.set(saved.id,saved);}setStatus(id,'saved','Alterações guardadas no PC');await refreshLibrary(true);})().catch(error=>{if(!task.snapshot)task.snapshot=snapshot;task.full=task.full||full;setStatus(id,'error',error.message);throw error;}).finally(()=>{task.running=null;signal();});
 await task.running;if(task.snapshot)await flushOne(id);
}
export async function flush(id){if(id)return flushOne(id);for(const key of pending.keys())await flushOne(key);}
export async function remove(id){await flush(id);const entry=records.get(id);if(!entry)throw Error('O documento não foi encontrado.');await json(await fetch(new URL(endpoint.href+'/'+encodeURIComponent(id)),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:entry.revision})}));records.delete(id);pending.delete(id);states.delete(id);await refreshLibrary(true);signal();}
async function migrateIndividuals({signal,onProgress=()=>{}}={}){
 const layout=window.NexusLibraryManager?.snapshot()||{entries:{}};
 for(const record of await listPackages()){checkAbort(signal);if(record.status!=='ready'||record.manifest.packageType!=='board')continue;const target=primary(record.manifest);if(hiddenItem(layout,target.model,target.item))continue;await importIndividual({record},{migration:true,publish:false,signal,onProgress});}
}
export async function migrateLegacy(){await ready();if(available)await migrateIndividuals();}
export async function reloadCatalog(){
 await ready();if(!available)return false;await flush();
 const result=await json(await fetch(endpoint,{cache:'no-store'}));if(result.version!==1||!Array.isArray(result.documents))throw Error('O catálogo de documentos do PC é inválido.');
 records=new Map(result.documents.map(entry=>[entry.id,entry]));
 const bulk=await json(await fetch('/api/library-packages65',{cache:'no-store'}));if(!Array.isArray(bulk.packages))throw Error('O catálogo de pacotes do PC é inválido.');packages=new Map(bulk.packages.map(entry=>[entry.id,{...entry,revision:entry.revision||1}]));return true;
}
export async function migrateForExport({signal:abortSignal,onProgress=()=>{}}={}){
 await ready();if(!available)throw Error('Abra a versão local no PC para exportar a biblioteca.');if(migrating)throw Error('A biblioteca já está sendo preparada.');migrating=true;signal();
 try{
  // Existing edits finish saving even when the subsequent export is cancelled.
  await reloadCatalog();checkAbort(abortSignal);await migrateIndividuals({signal:abortSignal,onProgress});
  const sources=(await listPackages()).filter(source=>source.status==='ready'&&source.manifest.packageType!=='board'),total=sources.reduce((sum,source)=>sum+source.manifest.bytes,0),migrated={};let loaded=0;
  for(const source of sources){
   checkAbort(abortSignal);onProgress({phase:'migrating',label:'Preparando '+source.manifest.label,loaded,total});
   const fingerprint=await sha(JSON.stringify(source.manifest)),entry=await json(await fetch('/api/library-packages65',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({manifest:source.manifest,fingerprint}),signal:abortSignal}));
   if(!entry.ready){const missing=new Set(entry.missing);loaded+=source.manifest.files.filter(file=>!missing.has(file.path)).reduce((sum,file)=>sum+file.size,0);
    for(const path of entry.missing){
     checkAbort(abortSignal);const file=await getFile(source.id,path);if(!file?.blob)throw Error('Arquivo importado ausente: '+path);
     onProgress({phase:'migrating',label:'Guardando '+path,loaded,total});
     await json(await fetch('/api/library-packages65/'+encodeURIComponent(entry.id)+'/files/'+path.split('/').map(encodeURIComponent).join('/'),{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file.blob,signal:abortSignal}));loaded+=file.blob.size;
    }
    checkAbort(abortSignal);Object.assign(entry,await json(await fetch('/api/library-packages65/'+encodeURIComponent(entry.id)+'/commit',{method:'POST',signal:abortSignal})));
   }else loaded+=source.manifest.bytes;
   packages.set(entry.id,{...entry,revision:entry.revision||1});migrated[source.id]=entry.resourceBase;onProgress({phase:'migrating',label:'Arquivos guardados no PC',loaded,total});
  }
  await refreshLibrary(true);return {packages:migrated,documents:[...records.keys()]};
 }finally{migrating=false;signal();}
}

function renderStatus(){const note=document.querySelector('#boardEditorPane .board-editor-footer > p:not(.durable-save65)');if(note)note.textContent=records.has(currentId())?'Cópia independente: suas alterações são guardadas automaticamente na biblioteca do PC.':'Edições temporárias: use Guardar na biblioteca para criar uma cópia no PC ou exporte o .sbnx.';const id=currentId(),field=$('durableSaveState65'),retry=$('durableRetry65'),save=$('durableSave65');if(save){save.hidden=!available;save.disabled=creating||migrating||window.NexusBoardEditor?.isBusy()||!window.JCIDDesktop?.currentDocument()?.interactiveMapReady;save.textContent=records.has(id)?'Guardar agora':'Guardar na biblioteca';}if(!field)return;const state=states.get(id)||{status:'saved',message:'Documento guardado no PC'};field.hidden=!records.has(id);field.dataset.state=state.status;field.textContent=state.message;retry.hidden=field.hidden||state.status!=='error';}
function buildUI(){const footer=document.querySelector('#boardEditorPane .board-editor-footer');if(!footer||$('durableSave65'))return;const save=document.createElement('button');save.type='button';save.id='durableSave65';save.textContent='Guardar na biblioteca';footer.querySelector('.board-editor-actions').prepend(save);const status=document.createElement('p');status.id='durableSaveState65';status.className='durable-save65';status.setAttribute('role','status');const retry=document.createElement('button');retry.type='button';retry.id='durableRetry65';retry.textContent='Tentar guardar novamente';retry.hidden=true;footer.prepend(status,retry);save.addEventListener('click',()=>window.NexusBoardEditor.runTask(async({signal,progress})=>{if(records.has(currentId()))await flush(currentId());else await saveCopy({signal,onProgress:progress});window.NexusBoardEditor.message('Documento guardado na biblioteca do PC.');}));retry.onclick=()=>flush(currentId()).catch(error=>window.NexusBoardEditor.message(error.message,true));renderStatus();}
export function ready(){
 if(initialization)return initialization;
 initialization=(async()=>{try{const response=await fetch(endpoint,{cache:'no-store',headers:{Accept:'application/json'}});if(response.status===404||response.status===405||!response.headers.get('content-type')?.includes('application/json'))return false;const result=await json(response);if(result.version!==1||!Array.isArray(result.documents))throw Error('O catálogo de documentos do PC é inválido.');records=new Map(result.documents.map(d=>[d.id,d]));packageTools=await import('./board-package59.js');const p=await fetch('/api/library-packages65',{cache:'no-store'}),bulk=await json(p);if(!Array.isArray(bulk.packages))throw Error('O catálogo de pacotes do PC é inválido.');packages=new Map(bulk.packages.map(d=>[d.id,{...d,revision:d.revision||1}]));available=true;return true;}finally{buildUI();}})();return initialization;
}
window.addEventListener('jcid:board-edited',event=>{if(!available||creating||!records.has(event.detail?.boardId))return;try{queueSnapshot(event.detail.boardId,packageTools.captureBoard(),event.detail.operation==='joinBoard');}catch(error){setStatus(event.detail.boardId,'error',error.message);}});
function personalChanged(event){if(event?.detail?.transient)return;if(!available||creating||!records.has(currentId())||document.body.classList.contains('board-loading'))return;try{queueSnapshot(currentId(),packageTools.captureBoard());}catch(error){setStatus(currentId(),'error',error.message);}}
for(const name of ['jcid:icvalues-changed','jcid:netcolors'])window.addEventListener(name,personalChanged);
for(const name of ['input','change'])document.addEventListener(name,event=>{if(event.target.closest?.('#rffeRows'))personalChanged();});
document.addEventListener('click',event=>{if(event.target.closest?.('#rffeClearMarks'))personalChanged();});
for(const name of ['jcid:document','jcid:tool','jcid:editorbusy'])window.addEventListener(name,()=>{buildUI();renderStatus();});
window.addEventListener('beforeunload',event=>{if(!isBusy())return;flush().catch(()=>{});event.preventDefault();event.returnValue='';});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush().catch(()=>{});});
window.NexusDurableDocuments=Object.freeze({ready,configure,isAvailable,isCurrentSaved,isBusy,catalog,localResource,saveCopy,saveJoinedCopy,importIndividual,migrateLegacy,migrateForExport,reloadCatalog,flush,remove,status:()=>({creating,migrating,documents:[...records.keys()],pending:[...pending.entries()].filter(([,v])=>v.snapshot||v.running).map(([id])=>id)})});
