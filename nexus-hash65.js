// Pinned local SHA-256 implementation; no network/CDN dependency while offline.
import './vendor/hash-wasm/sha256.umd.min.js';
export const createSHA25665=()=>globalThis.hashwasm.createSHA256();
export async function digestBlob65(blob,{signal,hasher}={}){
 const hash=hasher||await createSHA25665();hash.init();
 for(let offset=0;offset<blob.size;offset+=1024*1024){
  if(signal?.aborted)throw new DOMException('Importação cancelada.','AbortError');
  hash.update(new Uint8Array(await blob.slice(offset,offset+1024*1024).arrayBuffer()));
 }
 return hash.digest('hex');
}
