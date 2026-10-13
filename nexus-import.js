import {ZipReader,BlobReader,BlobWriter,configure} from './vendor/zipjs/index-native.min.js';
import {listPackages,putPackage,putFile,removePackage,activateSnapshot65,discardTransfer65} from './nexus-db.js';
import {validateManifest,safePath} from './nexus-manifest.js';
import {placeIndividual,describeIndividual} from './individual-package61.js';
import {validateBoard} from './board-validate59.js';
import {boardImages66,boardValidationCache66} from './nexus-board-validation66.js';
import {createSHA25665,digestBlob65} from './nexus-hash65.js';
import {verifiedSource65,checkSyncSpace65} from './nexus-sync-storage65.js';
configure({useWebWorkers:false,useCompressionStream:true,chunkSize:65536});
const abort=signal=>{if(signal?.aborted)throw new DOMException('Importação cancelada.','AbortError');};
const writeLock=(run,signal)=>navigator.locks?navigator.locks.request('nexus-library-write',{signal},run):run();
const quotaError=error=>error.name==='QuotaExceededError'?Error('O armazenamento do app ficou cheio. A biblioteca anterior foi mantida. Libere espaço no aparelho e tente novamente.'):error;
async function inspectArchive(reader,{onProgress,signal}){
 onProgress({phase:'checking',label:'Conferindo o pacote…',loaded:0,total:0});
 const entries=new Map();let count=0;
 for await(const entry of reader.getEntriesGenerator()){
  abort(signal);if(++count>12500)throw Error('O pacote contém arquivos demais.');
  const path=entry.directory?entry.filename.replace(/\/$/,''):entry.filename;safePath(path);
  if(entries.has(entry.filename)||entry.encrypted||((entry.externalFileAttributes>>>16)&0xf000)===0xa000)throw Error('O ZIP contém uma entrada não permitida.');
  entries.set(entry.filename,entry);
 }
 const meta=entries.get('nexus-package.json');if(!meta||meta.directory||meta.uncompressedSize>5*1024*1024)throw Error('Este ZIP não é um pacote de biblioteca compatível.');
 const manifest=validateManifest(JSON.parse(await(await meta.getData(new BlobWriter('application/json'),{signal,checkSignature:true})).text()));
 const declared=new Map(manifest.files.map(f=>[f.path,f]));
 for(const [path,e] of entries)if(!e.directory&&path!=='nexus-package.json'&&!declared.has(path))throw Error('Arquivo não declarado no pacote: '+path);
 for(const f of declared.values()){const e=entries.get(f.path);if(!e||e.directory||e.uncompressedSize!==f.size)throw Error('Arquivo ausente ou tamanho incorreto: '+f.path);}
 return {manifest,entries,declared};
}
async function newInstallation(manifest){
 const packages=await listPackages(),lastImportedAt=packages.reduce((latest,p)=>Math.max(latest,Number(p.lastImportedAt)||Number(p.createdAt)||0),Date.now())+1;
 const persistent=await navigator.storage?.persist?.().catch(()=>false)||false;
 return {id:crypto.randomUUID(),status:'staging',createdAt:Date.now(),updatedAt:Date.now(),lastImportedAt,manifest,persistent,boardValidation66:{}};
}
async function extractInstallation(installation,entries,declared,{onProgress,signal}){
 const manifest=installation.manifest,boards=new Set(manifest.catalog.models.flatMap(m=>m.children.map(item=>item.board_data).filter(Boolean))),hasher=await createSHA25665();
 await putPackage(installation);let loaded=0;
 for(const f of manifest.files){
  abort(signal);onProgress({phase:'extracting',label:f.path,loaded,total:manifest.bytes});
  const blob=await entries.get(f.path).getData(new BlobWriter(f.type),{signal,checkSignature:true});
  if(blob.size!==f.size||await digestBlob65(blob,{signal,hasher})!==f.sha256)throw Error('O arquivo está danificado: '+f.path+'. Copie o ZIP novamente.');
  let images;if(boards.has(f.path)){let data;try{data=JSON.parse(await blob.text());}catch{throw Error('A geometria da placa está danificada. A versão anterior foi mantida.');}validateBoard(data,declared);images=boardImages66(data);}
  abort(signal);const stored=await putFile(installation.id,f.path,blob,f.type);if(images)installation.boardValidation66[f.path]=boardValidationCache66(f,stored,images);loaded+=f.size;
  // The catalogue can be several MiB: do not rewrite it for every small image.
  if(Date.now()-installation.updatedAt>5000){installation.updatedAt=Date.now();await putPackage(installation);}
  onProgress({phase:'saving',label:f.path,loaded,total:manifest.bytes});
 }
 abort(signal);
}
export async function importFile(file,{onProgress=()=>{},signal,chooseDestination}={}){
 return writeLock(async()=>{
  abort(signal);if(!file?.size)throw Error('Escolha um pacote ZIP da biblioteca ou uma placa .sbnx.');
  const reader=new ZipReader(new BlobReader(file),{checkSignature:true});let installation;
  try{
   let {manifest,entries,declared}=await inspectArchive(reader,{onProgress,signal}),placement=null;
   if(/\.sbnx$/i.test(file.name||'')||manifest.packageType==='board'){
    describeIndividual(manifest);if(typeof chooseDestination!=='function')throw Error('Escolha a pasta e o nome para importar esta placa .sbnx.');
    await window.NexusLibrary?.refresh();abort(signal);
    const choice=await chooseDestination({manifest,signal});abort(signal);if(!choice)throw new DOMException('Importação cancelada.','AbortError');
    const placed=placeIndividual(manifest,window.JCID_DEVICES,choice);manifest=validateManifest(placed.manifest);placement=placed.placement;
   }
   const packages=await listPackages(),lastImportedAt=packages.reduce((latest,p)=>Math.max(latest,Number(p.lastImportedAt)||Number(p.createdAt)||0),Date.now())+1;
   const duplicate=packages.find(p=>p.status==='ready'&&p.manifest.id===manifest.id&&JSON.stringify(p.manifest.catalog)===JSON.stringify(manifest.catalog)&&JSON.stringify(p.manifest.schematics)===JSON.stringify(manifest.schematics)&&p.manifest.files.length===manifest.files.length&&p.manifest.files.every((f,i)=>f.sha256===manifest.files[i].sha256&&f.path===manifest.files[i].path));
   // Reusing an installed ZIP must still select it over older per-model packages.
   if(duplicate){duplicate.lastImportedAt=lastImportedAt;duplicate.updatedAt=Date.now();await putPackage(duplicate);return {record:duplicate,duplicate:true,placement};}
   const space=await navigator.storage?.estimate?.();if(space?.quota&&space.quota-(space.usage||0)<manifest.bytes+16*1024*1024)throw Error('Não há espaço suficiente no armazenamento do app. Libere espaço no aparelho e importe o ZIP completo novamente.');
   installation=await newInstallation(manifest);await extractInstallation(installation,entries,declared,{onProgress,signal});
   installation.status='ready';installation.updatedAt=Date.now();await putPackage(installation);return {record:installation,duplicate:false,placement};
  }catch(error){if(installation)await removePackage(installation.id).catch(()=>{});throw quotaError(error);}
  finally{await reader.close();}
 },signal);
}
export async function replaceLibrary65(source,{onProgress=()=>{},signal}={}){
 return writeLock(async()=>{
  abort(signal);const verified=await verifiedSource65(source),reader=new ZipReader(verified.reader,{checkSignature:true});let installation,committed=false;
  try{
   const {manifest,entries,declared}=await inspectArchive(reader,{onProgress,signal});
   if(!manifest.librarySnapshot)throw Error('Este pacote não contém uma biblioteca completa para sincronizar.');
   // Received ZIP already occupies storage. Reserve extracted bytes without
   // reclaiming any existing maps until validation and the atomic swap finish.
   await checkSyncSpace65(manifest.bytes);abort(signal);
   installation=await newInstallation(manifest);installation.archiveSha256=verified.archiveSha256;
   await extractInstallation(installation,entries,declared,{onProgress,signal});
   onProgress({phase:'activating',label:'Aplicando a biblioteca conferida…',loaded:manifest.bytes,total:manifest.bytes});abort(signal);
   installation.updatedAt=Date.now();const snapshot=await activateSnapshot65(installation,verified.transferId,signal);committed=true;installation.status='ready';installation.snapshotId=snapshot.id;
   // A cleanup failure must not turn a committed replacement into a failed ACK.
   await discardTransfer65(verified.transferId).catch(()=>{});
   return {record:installation,snapshot,archiveSha256:verified.archiveSha256};
  }catch(error){if(installation&&!committed)await removePackage(installation.id).catch(()=>{});throw quotaError(error);}
  finally{await reader.close();}
 },signal);
}
