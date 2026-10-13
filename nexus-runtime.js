import {configureLibraryManager,applyLibraryLayout,initializeLibraryManager} from './library-manager64.js';
import {listPackages,cleanupStaging,getFile,getLibrarySnapshot65} from './nexus-db.js';
import * as durableDocuments from './durable-documents65.js';
import {materialize,resourceUrl,safePath} from './nexus-manifest.js';
const baseCatalog=structuredClone(window.JCID_DEVICES||{version:1,models:[]}),baseRegistry=structuredClone(window.JCID_SCHEMATICS||{version:1,documents:[]});
let currentCatalog=baseCatalog,currentRegistry=baseRegistry;
let installed=[],offlinePromise,problem='',prepared=!!navigator.serviceWorker?.controller;
export const status=()=>({packages:installed,error:problem,controlled:!!navigator.serviceWorker?.controller,prepared});
const announce=()=>window.dispatchEvent(new CustomEvent('nexus:offline'));
export function readableError(error){
 const text=error?.message||String(error);
 if(/module script|service.?worker|load failed|fetch|networkerror|network request/i.test(text))return 'Não foi possível preparar o app offline. Confira a conexão e toque em “Tentar novamente”. Seus arquivos já importados foram mantidos.';
 return text;
}
export function localResource(item,path){if(item.nexus_document||item.nexus_server_package)return durableDocuments.localResource(item,path);if(!item.nexus_package)return path;const record=installed.find(p=>p.id===item.nexus_package),clean=safePath(String(path).split('?')[0]);if(!record?.manifest.files.some(f=>f.path===clean))return null;return resourceUrl(item.nexus_package,clean);}
// Decode imported component artwork from the stored file itself. An <img> request
// routed through a worker is unnecessary here and is less reliable on mobile.
export async function loadImage(item,path){
 const clean=safePath(String(path).split('?')[0]),record=installed.find(p=>p.id===item.nexus_package),entry=record?.manifest.files.find(f=>f.path===clean);
 if(!entry||!/^image\//.test(entry.type))throw Error('Os desenhos desta placa não estão no pacote importado.');
 const file=await getFile(record.id,clean);
 if(!(file?.blob instanceof Blob)||!file.blob.size)throw Error('Não foi possível ler os desenhos guardados neste aparelho.');
 return file.blob.type===entry.type?file.blob:new Blob([file.blob],{type:entry.type});
}
export async function loadImageAsset(item,path){
 const base=new URL('.',location.href);let url;
 if(/^https?:\/\//i.test(path))url=new URL(path);else {const resolved=localResource(item,path);if(!resolved)throw Error('Os desenhos deste mapa não estão no pacote.');url=new URL(resolved,base);}
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw Error('Os desenhos devem pertencer à biblioteca deste aplicativo.');
 const relative=decodeURIComponent(url.pathname.slice(base.pathname.length)),match=/^__nexus_data__\/([^/]+)\/(.+)$/.exec(relative);let blob;
 if(match){safePath(match[2]);blob=(await getFile(match[1],match[2]))?.blob;}else {const response=await fetch(url);if(!response.ok)throw Error('Não foi possível carregar os desenhos.');blob=await response.blob();}
 if(!(blob instanceof Blob)||!blob.size||!/^image\//.test(blob.type))throw Error('Os desenhos deste mapa não estão disponíveis.');return blob;
}
export async function ensureOffline({update=false,signal}={}){
 if(!('serviceWorker' in navigator)||!window.isSecureContext)throw Error('Abra o endereço seguro do aplicativo para importar os arquivos.');
 if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
 if(prepared&&!update)return true;
 if(!offlinePromise){
  offlinePromise=(async()=>{
   let timer,poll;
   try{
    const work=(async()=>{
     const registration=await navigator.serviceWorker.register(new URL('nexus-sw.js',import.meta.url),{scope:'./',updateViaCache:'none'});
     const worker=registration.installing||registration.waiting;
     await new Promise((resolve,reject)=>{const check=()=>{if(worker?.state==='redundant')reject(Error('Não foi possível preparar o app offline. Confira a conexão e toque em “Tentar novamente”.'));else if((!worker||worker.state==='activated')&&navigator.serviceWorker.controller)resolve();};poll=setInterval(check,150);check();});
     prepared=true;problem='';announce();return true;
    })();
    return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('A preparação offline demorou mais que o esperado. Confira a conexão e toque em “Tentar novamente”.')),90000);})]);
   }catch(error){problem=readableError(error);announce();throw Error(problem);}
   finally{clearTimeout(timer);clearInterval(poll);offlinePromise=null;}
  })();
 }
 if(!signal)return offlinePromise;
 let cancel;try{return await Promise.race([offlinePromise,new Promise((_,reject)=>{cancel=()=>reject(new DOMException('Cancelado','AbortError'));signal.addEventListener('abort',cancel,{once:true});})]);}finally{signal.removeEventListener('abort',cancel);}
}
export async function refresh({metadataOnly=false}={}){
 const ready=(await listPackages()).filter(p=>p.status==='ready').sort((a,b)=>(a.lastImportedAt||a.createdAt)-(b.lastImportedAt||b.createdAt));installed=ready;
 if(ready.length)await ensureOffline();
 const snapshot=await getLibrarySnapshot65();if(snapshot)await window.NexusLibraryManager.adoptSnapshot(snapshot.layout,snapshot.id);
 // A synchronized library is authoritative, even when its final package was
 // explicitly deleted. Bundled preview maps must never reappear underneath it.
 const models=new Map((snapshot?[]:baseCatalog.models).map(m=>[m.id,structuredClone(m)])),documents=new Map((snapshot?[]:baseRegistry.documents).map(d=>[d.id,structuredClone(d)]));
 for(const record of ready){const data=materialize(record);for(const m of data.models){const prior=models.get(m.id),children=new Map((prior?.children||[]).map(item=>[item.id,item]));for(const item of m.children)children.set(item.id,item);models.set(m.id,{...prior,...m,children:[...children.values()]});}for(const d of data.documents)documents.set(d.id,d);}
 const durable=durableDocuments.catalog();for(const m of durable.catalog.models){const prior=models.get(m.id),children=new Map((prior?.children||[]).map(item=>[item.id,item]));for(const item of m.children)children.set(item.id,item);models.set(m.id,{...prior,...m,children:[...children.values()]});}for(const d of durable.registry.documents)documents.set(d.id,d);
 currentCatalog={version:1,models:[...models.values()].sort((a,b)=>(a.nexus_order??1000)-(b.nexus_order??1000))};currentRegistry={version:1,documents:[...documents.values()]};publishLibrary(metadataOnly);return installed;
}
export async function start(){
 ensureOffline({update:true}).catch(()=>{if(prepared){problem='';announce();}});
 try{await initializeLibraryManager();await durableDocuments.ready();await durableDocuments.migrateLegacy();await cleanupStaging();await refresh();}catch(e){problem=e.message;announce();}
}

function publishLibrary(metadataOnly=true){const result=applyLibraryLayout(currentCatalog,currentRegistry);window.JCID_DEVICES=result.catalog;window.JCID_SCHEMATICS=result.registry;window.dispatchEvent(new CustomEvent('nexus:library',{detail:{metadataOnly}}));}
configureLibraryManager({refresh,refreshMetadata:()=>publishLibrary(),render:()=>window.JCIDDesktop?.renderLibrary?.()});
durableDocuments.configure({refreshLibrary:refresh});
