import {ZipReader,BlobWriter,configure} from './vendor/zipjs/index-native.min.js';
import {readLibraryState66,getFile,putPackage,putFile,removePackage,activateDelta66,discardTransfer65} from './nexus-db.js';
import {safePath,validateManifest} from './nexus-manifest.js';
import {validateBoard} from './board-validate59.js';
import {boardImages66,boardValidationCache66,cachedBoardImages66} from './nexus-board-validation66.js';
import {createSHA25665,digestBlob65} from './nexus-hash65.js';
import {verifiedSource65,checkSyncSpace65} from './nexus-sync-storage65.js';

configure({useWebWorkers:false,useCompressionStream:true,chunkSize:65536});
const abort=signal=>{if(signal?.aborted)throw new DOMException('Importação cancelada.','AbortError');};
const lock=(run,signal)=>navigator.locks?navigator.locks.request('nexus-library-write',{signal},run):run();
const fingerprint=f=>f.sha256+':'+f.size;
const quotaError=error=>error?.name==='QuotaExceededError'?Error('O armazenamento do app ficou cheio. A biblioteca anterior foi mantida. Libere espaço e tente novamente.'):error;

export async function getInventory66({signal,onProgress=()=>{}}={}){
 abort(signal);onProgress({phase:'inventory',label:'Conferindo os arquivos que já estão neste aparelho…',loaded:0,total:0});
 const state=await readLibraryState66();abort(signal);const unique=new Map();
 for(const f of state.files)if(!unique.has(fingerprint(f))&&unique.size<12000)unique.set(fingerprint(f),{sha256:f.sha256,size:f.size});
 onProgress({phase:'inventory',label:'Biblioteca local conferida',loaded:state.files.length,total:state.files.length});
 return {have:[...unique.values()],files:state.files.length};
}

async function inspect(reader,expectedManifestSha256,signal){
 if(!/^[a-f0-9]{64}$/i.test(expectedManifestSha256||''))throw Error('A identificação da biblioteca esperada está ausente. Conecte novamente.');
 const entries=new Map();let count=0;
 for await(const entry of reader.getEntriesGenerator()){
  abort(signal);if(++count>12500)throw Error('O pacote contém arquivos demais.');
  safePath(entry.directory?entry.filename.replace(/\/$/,''):entry.filename);
  if(entries.has(entry.filename)||entry.encrypted||((entry.externalFileAttributes>>>16)&0xf000)===0xa000)throw Error('O ZIP contém uma entrada não permitida.');
  entries.set(entry.filename,entry);
 }
 const meta=entries.get('nexus-package.json'),delta=entries.get('sync-delta.json');
 if(!meta||meta.directory||meta.uncompressedSize>5*1024*1024||!delta||delta.directory||delta.uncompressedSize>2*1024*1024)throw Error('Este arquivo não contém uma atualização incremental compatível.');
 const raw=await meta.getData(new BlobWriter('application/json'),{signal,checkSignature:true}),manifestSha256=await digestBlob65(raw,{signal});
 const descriptor=JSON.parse(await(await delta.getData(new BlobWriter('application/json'),{signal,checkSignature:true})).text());
 if(descriptor?.format!=='nexus-sync-delta'||descriptor.version!==1||descriptor.baseManifestSha256!==manifestSha256||manifestSha256!==expectedManifestSha256.toLowerCase()||!Array.isArray(descriptor.transferPaths)||descriptor.transferPaths.length>12000)throw Error('A atualização não corresponde à biblioteca anunciada pelo PC.');
 const manifest=validateManifest(JSON.parse(await raw.text()));if(!manifest.librarySnapshot)throw Error('Falta a organização completa da biblioteca nesta atualização.');
 const declared=new Map(manifest.files.map(f=>[f.path,f])),transferPaths=new Set();let bytes=0;
 for(const path of descriptor.transferPaths){safePath(path);const f=declared.get(path),entry=entries.get(path);if(transferPaths.has(path)||!f||!entry||entry.directory||entry.uncompressedSize!==f.size)throw Error('Arquivo ausente ou tamanho incorreto na atualização: '+path);transferPaths.add(path);bytes+=f.size;}
 for(const [path,entry]of entries)if(!entry.directory&&!['nexus-package.json','sync-delta.json'].includes(path)&&!transferPaths.has(path))throw Error('Arquivo não declarado na atualização: '+path);
 return {manifest,manifestSha256,declared,transferPaths,entries,bytes};
}

export async function replaceDelta66(source,{expectedManifestSha256=source?.expectedManifestSha256,onProgress=()=>{},signal}={}){
 return lock(async()=>{
  abort(signal);const verified=await verifiedSource65(source),reader=new ZipReader(verified.reader,{checkSignature:true});let installation,committed=false;
  try{
   onProgress({phase:'checking',label:'Conferindo as novidades recebidas…',loaded:0,total:0});
   const {manifest,manifestSha256,declared,transferPaths,entries,bytes}=await inspect(reader,expectedManifestSha256,signal);
   const state=await readLibraryState66(),local=new Map();for(const f of state.files)if(!local.has(fingerprint(f)))local.set(fingerprint(f),f);
   const reuse=new Map();for(const f of manifest.files)if(!transferPaths.has(f.path)){const found=local.get(fingerprint(f));if(!found)throw Error('Um arquivo necessário não está mais neste aparelho: '+f.path+'. Sincronize novamente; a biblioteca anterior foi mantida.');reuse.set(f.path,found);}
   await checkSyncSpace65(bytes);abort(signal);
   installation={id:crypto.randomUUID(),status:'staging',createdAt:Date.now(),updatedAt:Date.now(),lastImportedAt:Date.now()+1,manifest,manifestSha256,archiveSha256:verified.archiveSha256,boardValidation66:{},persistent:await navigator.storage?.persist?.().catch(()=>false)||false};
   await putPackage(installation);const references=[],hasher=await createSHA25665(),boards=new Set(manifest.catalog.models.flatMap(m=>m.children.map(i=>i.board_data).filter(Boolean)));let loaded=0;
   for(const f of manifest.files){
    abort(signal);let blob,images,reference=transferPaths.has(f.path)?null:reuse.get(f.path);
    const isBoard=boards.has(f.path),cachedImages=isBoard&&reference?cachedBoardImages66(f,reference,declared):null;
    if(!reference){
     onProgress({phase:'extracting',label:f.path,loaded,total:bytes});blob=await entries.get(f.path).getData(new BlobWriter(f.type),{signal,checkSignature:true});
     if(blob.size!==f.size||await digestBlob65(blob,{signal,hasher})!==f.sha256)throw Error('O arquivo recebido está danificado: '+f.path+'. A biblioteca anterior foi mantida.');
    }else if(isBoard&&!cachedImages){const stored=await getFile(reference.packageId,reference.path);if(!stored?.blob||stored.blob.size!==f.size)throw Error('Uma placa local mudou durante a atualização. Sincronize novamente.');blob=stored.blob;}
    // Unchanged, validated geometry needs only its image dependencies checked.
    // Legacy/new/changed bytes still go through the complete geometry validator.
    if(isBoard){if(cachedImages)images=cachedImages;else{let data;try{data=JSON.parse(await blob.text());}catch{throw Error('A geometria da placa está danificada. A versão anterior foi mantida.');}validateBoard(data,declared);images=boardImages66(data);}}
    abort(signal);
    if(!reference){const stored=await putFile(installation.id,f.path,blob,f.type);reference={key:stored.key,size:f.size,sha256:f.sha256,storageRevision66:stored.storageRevision66};loaded+=f.size;onProgress({phase:'saving',label:f.path,loaded,total:bytes});}
    if(isBoard)installation.boardValidation66[f.path]=boardValidationCache66(f,reference,images);
    references.push({...reference,path:f.path});
   }
   onProgress({phase:'activating',label:'Aplicando as novidades e a organização da biblioteca…',loaded:bytes,total:bytes});abort(signal);
   installation.updatedAt=Date.now();const result=await activateDelta66(installation,verified.transferId,state.signature,references,signal);committed=true;
   await discardTransfer65(verified.transferId).catch(()=>{});
   return {...result,archiveSha256:verified.archiveSha256,manifestSha256,filesTransferred:transferPaths.size,filesReused:reuse.size,bytesTransferred:bytes};
  }catch(error){if(installation&&!committed)await removePackage(installation.id).catch(()=>{});throw quotaError(error);}
  finally{await reader.close();}
 },signal);
}
