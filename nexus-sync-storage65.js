import {Reader} from './vendor/zipjs/index-native.min.js';
import {safeId} from './nexus-manifest.js';
import {createSHA25665} from './nexus-hash65.js';
import {createTransfer65,getTransfer65,getTransferChunk65,writeTransferChunk65,verifyTransfer65,discardTransfer65} from './nexus-db.js';

export const SYNC_CHUNK_BYTES65=1024*1024;
const abort=signal=>{if(signal?.aborted)throw new DOMException('Recebimento cancelado.','AbortError');};
const quotaMessage='Não há espaço livre suficiente para receber e conferir a nova biblioteca mantendo a anterior. Libere espaço no aparelho e tente novamente.';
export async function checkSyncSpace65(bytes){
 const space=await navigator.storage?.estimate?.();
 if(space?.quota&&space.quota-(space.usage||0)<bytes+64*1024*1024)throw Error(quotaMessage);
 return space;
}
function storageError(error){return error?.name==='QuotaExceededError'?Error(quotaMessage):error;}
// Seekable storage: only the requested chunk (1 MiB) and output range are in RAM.
// ZIP central-directory reads may exceed one chunk; file bodies stream in 64 KiB.
class ChunkReader65 extends Reader {
 constructor(record){super();this.record=record;this.size=record.size;this.cachedIndex=-1;this.cachedBlob=null;}
 async readUint8Array(offset,length){
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset>this.size)throw Error('Intervalo inválido no pacote recebido.');
  length=Math.min(length,this.size-offset);
  if(length>32*1024*1024)throw Error('O índice deste ZIP é grande demais.');
  const output=new Uint8Array(length);let done=0;
  while(done<length){
   const position=offset+done,index=Math.floor(position/SYNC_CHUNK_BYTES65),within=position%SYNC_CHUNK_BYTES65;
   let blob=this.cachedIndex===index?this.cachedBlob:null;
   if(!blob){blob=(await getTransferChunk65(this.record.id,index))?.blob;if(!blob)throw Error('Falta uma parte do pacote recebido.');this.cachedIndex=index;this.cachedBlob=blob;}
   const count=Math.min(length-done,blob.size-within);if(count<=0)throw Error('Uma parte do pacote recebido está incompleta.');
   output.set(new Uint8Array(await blob.slice(within,within+count).arrayBuffer()),done);done+=count;
  }
  return output;
 }
}
export async function verifiedSource65(source){
 const transferId=safeId(source?.transferId),record=await getTransfer65(transferId);
 if(!record||record.status!=='verified'||record.persistedBytes!==record.size)throw Error('A transferência ainda não foi conferida.');
 return {reader:new ChunkReader65(record),size:record.size,name:'NEXUS-BIBLIOTECA.zip',transferId,archiveSha256:record.sha256};
}
export async function beginReceive65({id,size,sha256,uncompressedBytes},{signal,onProgress=()=>{}}={}){
 safeId(id);abort(signal);
 if(!Number.isSafeInteger(size)||size<1||size>8*1024**3||!/^[a-f\d]{64}$/i.test(sha256||'')||uncompressedBytes!==undefined&&(!Number.isSafeInteger(uncompressedBytes)||uncompressedBytes<0||uncompressedBytes>8*1024**3))throw Error('As informações da transferência são inválidas.');
 await checkSyncSpace65(size+(uncompressedBytes||0));abort(signal);
 const hash=await createSHA25665();hash.init();
 await createTransfer65({id,size,sha256:sha256.toLowerCase(),uncompressedBytes:uncompressedBytes??null,status:'receiving',createdAt:Date.now(),updatedAt:Date.now(),persistedBytes:0});
 let receivedBytes=0,persistedBytes=0,index=0,used=0,buffer=new Uint8Array(SYNC_CHUNK_BYTES65),queue=Promise.resolve(),closed=false,failure=null,finalized=null;
 const counts=()=>({receivedBytes,persistedBytes});
 const ensure=()=>{abort(signal);if(failure)throw failure;if(closed)throw Error('Esta transferência já foi encerrada.');};
 const serial=operation=>{const result=queue.then(async()=>{try{ensure();return await operation();}catch(error){failure=storageError(error);throw failure;}});queue=result.catch(()=>{});return result;};
 const flush=async()=>{
  if(receivedBytes===persistedBytes)return counts();
  await writeTransferChunk65(id,index,new Blob([buffer.subarray(0,used)]),persistedBytes,receivedBytes);
  persistedBytes=receivedBytes;onProgress({phase:'receiving',loaded:persistedBytes,total:size,...counts()});return counts();
 };
 return {
  id,get receivedBytes(){return receivedBytes;},get persistedBytes(){return persistedBytes;},
  append(chunk,offset){
   let bytes;try{bytes=chunk instanceof ArrayBuffer?new Uint8Array(chunk):ArrayBuffer.isView(chunk)?new Uint8Array(chunk.buffer,chunk.byteOffset,chunk.byteLength):null;if(!bytes||!bytes.length||bytes.length>SYNC_CHUNK_BYTES65)throw Error('Bloco de transferência inválido.');bytes=bytes.slice();}catch(error){return Promise.reject(error);}
   return serial(async()=>{
    if(offset!==undefined&&offset!==receivedBytes||receivedBytes+bytes.length>size)throw Error('A sequência do pacote recebido não confere.');
    hash.update(bytes);let cursor=0;
    while(cursor<bytes.length){const count=Math.min(bytes.length-cursor,buffer.length-used);buffer.set(bytes.subarray(cursor,cursor+count),used);used+=count;receivedBytes+=count;cursor+=count;
     if(used===buffer.length){await flush();index++;used=0;buffer=new Uint8Array(SYNC_CHUNK_BYTES65);}
    }
    return counts();
   });
  },
  flush:()=>serial(flush),
  finalize(){
   if(finalized)return finalized;
   finalized=serial(async()=>{
    if(receivedBytes!==size)throw Error('O pacote ainda não foi recebido por inteiro.');
    await flush();abort(signal);const actual=hash.digest('hex');
    if(actual!==sha256.toLowerCase())throw Error('O pacote recebido está danificado. A biblioteca anterior foi preservada.');
    await verifyTransfer65(id,actual);closed=true;buffer=null;
    return verifiedSource65({transferId:id});
   });return finalized;
  },
  async discard(){await queue;closed=true;buffer=null;await discardTransfer65(id);}
 };
}
