// This module is also embedded in the classic service worker. Keep it import-free.
const NAME='nexus-mobile-library',VERSION=2;
let opened;
export function database(){
 if(!opened)opened=new Promise((resolve,reject)=>{
  const request=indexedDB.open(NAME,VERSION);
  request.onupgradeneeded=()=>{const db=request.result;
   if(!db.objectStoreNames.contains('packages'))db.createObjectStore('packages',{keyPath:'id'});
   if(!db.objectStoreNames.contains('files')){const files=db.createObjectStore('files',{keyPath:'key'});files.createIndex('package','packageId');}
   if(!db.objectStoreNames.contains('metadata'))db.createObjectStore('metadata',{keyPath:'key'});
   if(!db.objectStoreNames.contains('syncTransfers'))db.createObjectStore('syncTransfers',{keyPath:'id'});
   if(!db.objectStoreNames.contains('syncChunks')){const chunks=db.createObjectStore('syncChunks',{keyPath:['transferId','index']});chunks.createIndex('transfer','transferId');}
  };
  request.onerror=()=>{opened=null;reject(request.error);};
  request.onblocked=()=>{opened=null;reject(Error('Feche as outras janelas do aplicativo e tente novamente.'));};
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opened=null;};resolve(db);};
 });
 return opened;
}
async function transact(stores,mode,action){const db=await database();return new Promise((resolve,reject)=>{
 // Strict durability is a hint on engines that support it. Others use their default.
 let tx;try{tx=db.transaction(stores,mode,mode==='readwrite'?{durability:'strict'}:{});}catch{tx=db.transaction(stores,mode);}
 let result,failure;const fail=error=>{failure=error;tx.abort();};
 tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(failure||tx.error||Error('Falha ao guardar os arquivos.'));tx.onabort=()=>reject(failure||tx.error||Error('Operação cancelada.'));
 try{action(tx,value=>result=value,fail);}catch(error){fail(error);}
 });}
export const listPackages=()=>transact(['packages'],'readonly',(tx,done)=>{const r=tx.objectStore('packages').getAll();r.onsuccess=()=>done(r.result);});
export const getPackage=id=>transact(['packages'],'readonly',(tx,done)=>{const r=tx.objectStore('packages').get(id);r.onsuccess=()=>done(r.result);});
export const putPackage=value=>transact(['packages'],'readwrite',tx=>{tx.objectStore('packages').put(value);});
export const putFile=(packageId,path,blob,type)=>transact(['files'],'readwrite',(tx,done)=>{const value={key:packageId+'/'+path,packageId,path,blob,type,storageRevision66:crypto.randomUUID()};tx.objectStore('files').put(value);done(value);});
// Synchronized packages can refer directly to existing physical Blob records.
// No alias chains and no byte copy are needed when only a path/catalogue changes.
export const getFile=(packageId,path)=>transact(['packages','files'],'readonly',(tx,done)=>{const p=tx.objectStore('packages').get(packageId);p.onsuccess=()=>{if(!p.result)return done(undefined);const key=p.result.fileKeys66?.[path]||packageId+'/'+path,r=tx.objectStore('files').get(key);r.onsuccess=()=>done(r.result?{...r.result,packageId,path,type:p.result.manifest?.files?.find(f=>f.path===path)?.type||r.result.type}:undefined);};});
function deleteIndexed(tx,store,index,id){const r=tx.objectStore(store).index(index).openKeyCursor(IDBKeyRange.only(id));r.onsuccess=()=>{const cursor=r.result;if(cursor){tx.objectStore(store).delete(cursor.primaryKey);cursor.continue();}};}
export const removePackage=id=>transact(['packages','files'],'readwrite',tx=>{const packages=tx.objectStore('packages'),files=tx.objectStore('files'),r=packages.getAll();r.onsuccess=()=>{const target=r.result.find(p=>p.id===id),retained=new Set();for(const p of r.result)if(p.id!==id)for(const f of p.manifest?.files||[])retained.add(p.fileKeys66?.[f.path]||p.id+'/'+f.path);for(const key of Object.values(target?.fileKeys66||{}))if(!retained.has(key))files.delete(key);packages.delete(id);const cursor=files.index('package').openKeyCursor(IDBKeyRange.only(id));cursor.onsuccess=()=>{const row=cursor.result;if(row){if(!retained.has(row.primaryKey))files.delete(row.primaryKey);row.continue();}};};});
export const getLibrarySnapshot65=()=>transact(['metadata'],'readonly',(tx,done)=>{const r=tx.objectStore('metadata').get('librarySnapshot65');r.onsuccess=()=>done(r.result?.value||null);});
export const getTransfer65=id=>transact(['syncTransfers'],'readonly',(tx,done)=>{const r=tx.objectStore('syncTransfers').get(id);r.onsuccess=()=>done(r.result);});
export const createTransfer65=value=>transact(['syncTransfers'],'readwrite',tx=>{tx.objectStore('syncTransfers').add(value);});
export const getTransferChunk65=(id,index)=>transact(['syncChunks'],'readonly',(tx,done)=>{const r=tx.objectStore('syncChunks').get([id,index]);r.onsuccess=()=>done(r.result);});
export const writeTransferChunk65=(id,index,blob,previousBytes,persistedBytes)=>transact(['syncTransfers','syncChunks'],'readwrite',(tx,done,fail)=>{
 const store=tx.objectStore('syncTransfers'),r=store.get(id);r.onsuccess=()=>{
  const record=r.result;if(!record||record.status!=='receiving'||record.persistedBytes!==previousBytes||persistedBytes>record.size)return fail(Error('O recebimento foi interrompido. Conecte novamente.'));
  tx.objectStore('syncChunks').put({transferId:id,index,blob});store.put({...record,persistedBytes,updatedAt:Date.now()});
 };
});
export const verifyTransfer65=(id,sha256)=>transact(['syncTransfers'],'readwrite',(tx,done,fail)=>{const store=tx.objectStore('syncTransfers'),r=store.get(id);r.onsuccess=()=>{
 const record=r.result;if(!record||record.status!=='receiving'||record.persistedBytes!==record.size||record.sha256!==sha256)return fail(Error('O pacote recebido está incompleto ou danificado.'));
 const verified={...record,status:'verified',verifiedAt:Date.now(),updatedAt:Date.now()};store.put(verified);done(verified);
};});
export const discardTransfer65=id=>transact(['syncTransfers','syncChunks'],'readwrite',tx=>{tx.objectStore('syncTransfers').delete(id);deleteIndexed(tx,'syncChunks','transfer',id);});
const readySignature66=packages=>JSON.stringify(packages.filter(p=>p.status==='ready').sort((a,b)=>a.id.localeCompare(b.id)));
// One coherent readonly transaction checks every advertised local Blob handle.
// Reading a Blob from IDB does not load its body or calculate a digest again.
export const readLibraryState66=()=>transact(['packages','files'],'readonly',(tx,done,fail)=>{
 const request=tx.objectStore('packages').getAll();request.onsuccess=()=>{const packages=request.result.filter(p=>p.status==='ready'),rows=[];let waiting=0;
  for(const p of packages)for(const f of p.manifest?.files||[]){if(++waiting>120000)return fail(Error('A biblioteca local contém arquivos demais para sincronizar.'));const key=p.fileKeys66?.[f.path]||p.id+'/'+f.path,r=tx.objectStore('files').get(key);r.onsuccess=()=>{const value=r.result;if(value?.blob instanceof Blob&&value.blob.size===f.size&&/^[a-f0-9]{64}$/i.test(f.sha256||''))rows.push({packageId:p.id,path:f.path,key,size:f.size,sha256:f.sha256.toLowerCase(),storageRevision66:value.storageRevision66||null,boardValidation66:p.boardValidation66?.[f.path]||null});if(!--waiting)done({signature:readySignature66(packages),files:rows});};}
  if(!waiting)done({signature:readySignature66(packages),files:rows});
 };
});
// Only new bytes were staged. Activation switches logical paths/catalogue and
// keeps the reused physical records in place, deleting only unreferenced blobs.
export const activateDelta66=(record,transferId,baseline,references,signal)=>transact(['packages','files','metadata','syncTransfers'],'readwrite',(tx,done,fail)=>{
 const cancel=()=>fail(new DOMException('Importação cancelada.','AbortError'));if(signal?.aborted)return cancel();signal?.addEventListener('abort',cancel,{once:true});const clean=()=>signal?.removeEventListener('abort',cancel);tx.addEventListener('complete',clean);tx.addEventListener('abort',clean);
 const packages=tx.objectStore('packages'),files=tx.objectStore('files'),all=packages.getAll(),transfer=tx.objectStore('syncTransfers').get(transferId);let pending=2+references.length,invalid=false;
 const finish=()=>{if(--pending||invalid)return;const incoming=all.result.find(p=>p.id===record.id),t=transfer.result;
  if(readySignature66(all.result)!==baseline||incoming?.status!=='staging'||incoming.manifestSha256!==record.manifestSha256||t?.status!=='verified'||t.sha256!==record.archiveSha256)return fail(Error('A biblioteca foi alterada durante a sincronização. Tente novamente; a versão anterior foi mantida.'));
  const fileKeys66=Object.fromEntries(references.map(f=>[f.path,f.key])),retained=new Set(references.map(f=>f.key)),snapshot={...record.manifest.librarySnapshot,packageId:record.id,installedAt:Date.now()};
  const ready={...record,status:'ready',fileKeys66,snapshotId:snapshot.id};packages.put(ready);tx.objectStore('metadata').put({key:'librarySnapshot65',value:snapshot});
  for(const p of all.result)if(p.id!==record.id)packages.delete(p.id);
  const cursor=files.openKeyCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row){if(!retained.has(row.primaryKey))files.delete(row.primaryKey);row.continue();}};
  done({record:ready,snapshot});
 };
 all.onsuccess=finish;transfer.onsuccess=finish;
 for(const f of references){const r=files.get(f.key);r.onsuccess=()=>{const value=r.result;if(!(value?.blob instanceof Blob)||value.blob.size!==f.size||(value.storageRevision66||null)!==(f.storageRevision66||null)){invalid=true;return fail(Error('Um arquivo local mudou ou desapareceu. Sincronize novamente; a biblioteca anterior foi mantida.'));}finish();};}
});
// No asynchronous gaps inside this transaction: ready flag, catalogue/layout and
// old-file deletion either all commit, or the complete previous library survives.
export const activateSnapshot65=(record,transferId,signal)=>transact(['packages','files','metadata','syncTransfers'],'readwrite',(tx,done,fail)=>{
 const cancel=()=>fail(new DOMException('Importação cancelada.','AbortError'));if(signal?.aborted)return cancel();signal?.addEventListener('abort',cancel,{once:true});const clean=()=>signal?.removeEventListener('abort',cancel);tx.addEventListener('complete',clean);tx.addEventListener('abort',clean);
 const packages=tx.objectStore('packages'),incoming=packages.get(record.id),transfer=tx.objectStore('syncTransfers').get(transferId),count=tx.objectStore('files').index('package').count(IDBKeyRange.only(record.id));let waiting=3;
 const activate=()=>{if(--waiting)return;const stored=incoming.result,t=transfer.result;
  if(!stored||stored.status!=='staging'||!stored.manifest?.librarySnapshot||stored.manifest.librarySnapshot.id!==record.manifest?.librarySnapshot?.id||count.result!==stored.manifest.files.length||t?.status!=='verified'||t.sha256!==record.archiveSha256)return fail(Error('Não foi possível conferir a biblioteca recebida. A anterior foi preservada.'));
  const snapshot={...stored.manifest.librarySnapshot,packageId:record.id,installedAt:Date.now()};
  packages.put({...record,status:'ready',snapshotId:snapshot.id});tx.objectStore('metadata').put({key:'librarySnapshot65',value:snapshot});
  const old=packages.openCursor();old.onsuccess=()=>{const cursor=old.result;if(cursor){if(cursor.key!==record.id)cursor.delete();cursor.continue();}};
  const files=tx.objectStore('files').openCursor();files.onsuccess=()=>{const cursor=files.result;if(cursor){if(cursor.value.packageId!==record.id)cursor.delete();cursor.continue();}};
  done(snapshot);
 };incoming.onsuccess=activate;transfer.onsuccess=activate;count.onsuccess=activate;
});
export async function cleanupStaging(){
 const cutoff=Date.now()-24*60*60*1000;for(const p of await listPackages())if(p.status!=='ready'&&(p.updatedAt||p.createdAt)<cutoff)await removePackage(p.id);
 const transfers=await transact(['syncTransfers'],'readonly',(tx,done)=>{const r=tx.objectStore('syncTransfers').getAll();r.onsuccess=()=>done(r.result);});
 for(const t of transfers)if(t.updatedAt<cutoff)await discardTransfer65(t.id);
}
