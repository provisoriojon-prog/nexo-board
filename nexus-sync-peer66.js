/* Incremental sync. Signaling carries only pairing; hashes and ZIP bytes use RTC. */
const MAX_BYTES=8*1024**3,MAX_FILES=12000,CONTROL=16384,MAX_CHUNK=64*1024;
const INFLIGHT=8*1024*1024,BUFFER_HIGH=2*1024*1024,BUFFER_LOW=512*1024,WAIT=120000;
const UPDATE='Atualize o aplicativo nos dois aparelhos e inicie a sincronização novamente.';
const random=n=>[...crypto.getRandomValues(new Uint8Array(n))].map(v=>v.toString(16).padStart(2,'0')).join('');
const integer=(n,max=MAX_BYTES)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const cancelled=signal=>{if(signal.aborted)throw signal.reason||new DOMException('Cancelado','AbortError');};
const delay=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(signal.reason||new DOMException('Cancelado','AbortError'));
 const abort=()=>{clearTimeout(timer);reject(signal.reason||new DOMException('Cancelado','AbortError'));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});
});
function validMeta(v){return v&&integer(v.size)&&v.size>0&&integer(v.uncompressedBytes)&&hash(v.sha256);}
function cleanMeta(v){return {size:v.size,sha256:v.sha256,uncompressedBytes:v.uncompressedBytes,name:String(v.name||'NEXUS-BIBLIOTECA.zip').slice(0,120)};}
function validStats(s){return s&&integer(s.filesTotal,MAX_FILES)&&integer(s.filesSent,MAX_FILES)&&integer(s.filesReused,MAX_FILES)&&s.filesSent+s.filesReused===s.filesTotal&&integer(s.bytesTotal)&&integer(s.bytesSent)&&s.bytesSent<=s.bytesTotal;}
function validEntry(e){return e&&hash(e.sha256)&&integer(e.size);}

export function libraryPeer66({role,signalBase,onState=()=>{},onProgress=()=>{},onOffer=()=>{},onDone=()=>{},onError=()=>{},receiverFactory,replaceLibrary,getInventory,prepareDelta,iceServers=[{urls:'stun:stun.cloudflare.com:3478'}]}={}){
 if(!['host','guest'].includes(role))throw Error('Papel de sincronização inválido.');
 const controller=new AbortController(),signal=controller.signal,base=new URL('/v1/library-sync/',signalBase||window.NEXUS_RELAY_CONFIG?.url||location.href);
 let pc,channel,room,descriptor,meta,download,storage,watchdog,wake,openPromise;
 let stage='idle',queue=Promise.resolve(),sent=0,acked=0,chunkSize=MAX_CHUNK,lastActivity=Date.now(),lastTransferProgress=Date.now(),lastPing=0,lastRemoteProgress=0;
 let complete=false,failed=false,replacing=false,pendingFailure=null,inventory=null,inventoryExpected=0;
 let progressTime=0,progressPhase='',transferStart=0,peakInFlight=0,peakBuffered=0,route=null;
 const token=random(32),waiters=new Set();
 const state=(phase,detail={})=>onState({phase,...detail});
 const wakeSenders=()=>{for(const resume of [...waiters])resume();};
 const progress=(value,force=false)=>{
  const now=performance.now();lastActivity=Date.now();
  if(force||value.phase!==progressPhase||now-progressTime>=150){
   progressTime=now;progressPhase=value.phase;
   const throughput=transferStart&&['receiving','sending'].includes(value.phase)?{bytesPerSecond:Math.round((value.loaded||0)/Math.max(0.001,(now-transferStart)/1000))}:{};
   onProgress({...value,...throughput,...(route?{route}: {})});
  }
 };
 function send(value){
  if(channel?.readyState!=='open')throw Error('A conexão com o outro aparelho foi encerrada.');
  const text=JSON.stringify(value);if(new TextEncoder().encode(text).length>CONTROL)throw Error('Mensagem de sincronização grande demais.');channel.send(text);
 }
 async function api(path,{method='GET',body,auth=true}={}){
  const response=await fetch(new URL(path,base),{method,mode:'cors',credentials:'omit',cache:'no-store',headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal});
  let data;try{data=await response.json();}catch{throw Error('O serviço de pareamento não respondeu. Confira a internet.');}
  if(!response.ok)throw Error(data.message||'Não foi possível conectar os aparelhos.');return data;
 }
 async function endRoom(){if(!room)return;try{await api('rooms/'+room.id+'/close',{method:'POST'});}catch{}room=null;}
 async function keepAwake(){try{wake=await navigator.wakeLock?.request('screen');}catch{}}
 async function cleanup(){clearInterval(watchdog);wake?.release().catch(()=>{});await endRoom();controller.abort();wakeSenders();channel?.close();pc?.close();}
 async function fail(error,notify=true){
  if(failed||complete||pendingFailure&&replacing)return;
  error=error instanceof Error?error:Error(String(error));
  // The atomic importer owns the commit decision: cancellation after commit
  // must not report a rollback that did not happen.
  if(replacing)pendingFailure=error;else failed=true;
  try{if(notify&&!replacing&&channel?.readyState==='open')send({type:'error',message:error.message});}catch{}
  controller.abort(error);clearInterval(watchdog);wakeSenders();channel?.close();pc?.close();wake?.release().catch(()=>{});
  if(replacing)return;
  stage='error';try{await storage?.discard();}catch{}onError(error);
 }
 function maxMessage(){const max=pc?.sctp?.maxMessageSize;return Number.isFinite(max)&&max>0?Math.min(MAX_CHUNK,Math.floor(max)):MAX_CHUNK;}
 async function inspectRoute(){
  try{
   const stats=await pc.getStats();let pair;
   stats.forEach(s=>{if(s.type==='transport'&&s.selectedCandidatePairId)pair=stats.get(s.selectedCandidatePairId);});
   if(!pair)stats.forEach(s=>{if(s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated)pair=s;});
   if(!pair)return;
   const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId);
   if(!local?.candidateType||!remote?.candidateType)return;
   route={localCandidateType:local.candidateType,remoteCandidateType:remote.candidateType,protocol:local.protocol||null};
   // Host candidates suggest a local route; do not claim a verified LAN speed.
   state('route',{route});
  }catch{}
 }
 function attach(dc){
  channel=dc;channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=BUFFER_LOW;
  channel.addEventListener('bufferedamountlow',wakeSenders);
  channel.addEventListener('open',()=>{
   stage=role==='host'?'inventory':'hello';lastActivity=Date.now();state('connected');keepAwake();inspectRoute();
   if(role==='host')send({type:'hello',version:2,meta:descriptor});
   watchdog=setInterval(()=>{
    if(complete||failed)return;
    // Keep long local indexing/verification visible without a fake transfer.
    if(Date.now()-lastPing>15000){lastPing=Date.now();try{send({type:'ping'});}catch(error){fail(error,false);}}
    const quietSince=['sending','receiving','sent'].includes(stage)?lastTransferProgress:lastActivity;
    if(!['offered','accepting'].includes(stage)&&Date.now()-quietSince>WAIT)fail(Error('A comunicação parou. Mantenha os dois aparelhos abertos e tente novamente.'));
   },1000);
  });
  channel.addEventListener('message',event=>{queue=queue.then(()=>consume(event.data)).catch(error=>fail(error));});
  channel.addEventListener('close',()=>{wakeSenders();if(!complete&&!failed)fail(Error('A conexão foi interrompida. Confira no celular se a atualização foi concluída.'),false);});
  channel.addEventListener('error',()=>fail(Error('Falha na comunicação entre os aparelhos.'),false));
 }
 function create(){
  if(typeof RTCPeerConnection!=='function')throw Error('Este navegador não oferece a conexão necessária. Atualize o navegador para sincronizar.');
  pc=new RTCPeerConnection({iceServers});
  pc.addEventListener('connectionstatechange',()=>{if(pc.connectionState==='failed')fail(Error('Os aparelhos não conseguiram se conectar. Confira se estão no mesmo Wi-Fi e se a rede permite comunicação entre dispositivos.'));});
  // Keep the channel label so an older client can receive the update message.
  if(role==='host')attach(pc.createDataChannel('nexus-library-v1',{ordered:true}));
  else pc.addEventListener('datachannel',event=>{if(channel||event.channel.label!=='nexus-library-v1'){event.channel.close();fail(Error(UPDATE));return;}attach(event.channel);});
 }
 async function gather(description){
  await pc.setLocalDescription(description);const started=Date.now();
  while(pc.iceGatheringState!=='complete'&&Date.now()-started<10000)await delay(100,signal);
  return {type:pc.localDescription.type,sdp:pc.localDescription.sdp};
 }
 async function waitOpen(){
  if(openPromise)return openPromise;
  openPromise=(async()=>{const start=Date.now();while(channel?.readyState!=='open'){
   if(Date.now()-start>30000)throw Error('Não foi possível estabelecer a conexão direta. Use o mesmo Wi-Fi nos dois aparelhos.');await delay(100,signal);
  }})();return openPromise;
 }
 async function host(details){
  if(role!=='host'||stage!=='idle'||!validMeta(details)||!integer(details.fileCount,MAX_FILES))throw Error('O índice da biblioteca é inválido.');
  descriptor={...cleanMeta(details),fileCount:details.fileCount};stage='connecting';create();state('connecting');
  const offer=await gather(await pc.createOffer()),id=random(16);
  room=await api('rooms',{method:'POST',auth:false,body:{id,token,offer,meta:cleanMeta(descriptor)}});
  state('code',{code:room.code,expiresAt:room.expiresAt});
  while(!signal.aborted&&Date.now()<room.expiresAt){
   const result=await api('rooms/'+room.id);if(result.answer){state('pairing',{name:result.guestName});await pc.setRemoteDescription(result.answer);await waitOpen();return;}
   await delay(1500,signal);
  }
  throw Error('O código expirou. Abra uma nova conexão.');
 }
 async function join(code,name=window.NexoBrand92?.name()||'NEXO MOBILE'){
  if(role!=='guest'||stage!=='idle'||!/^\d{4}$/.test(code))throw Error('Digite os quatro números mostrados no PC.');
  stage='connecting';state('connecting');room=await api('join',{method:'POST',auth:false,body:{code,token,name}});descriptor=room.meta;
  if(!validMeta(descriptor))throw Error('O PC enviou um índice inválido.');
  create();await pc.setRemoteDescription(room.offer);const answer=await gather(await pc.createAnswer());
  await api('rooms/'+room.id+'/answer',{method:'POST',body:{answer}});await waitOpen();
 }
 async function waitCapacity(predicate){
  while(!predicate()){
   cancelled(signal);if(channel?.readyState!=='open')throw Error('A conexão com o outro aparelho foi encerrada.');
   await new Promise((resolve,reject)=>{
    const finish=()=>{waiters.delete(resume);signal.removeEventListener('abort',abort);resolve();};
    const resume=()=>{if(predicate()||channel?.readyState!=='open')finish();};
    const abort=()=>{waiters.delete(resume);reject(signal.reason||new DOMException('Cancelado','AbortError'));};
    waiters.add(resume);signal.addEventListener('abort',abort,{once:true});resume();if(signal.aborted)abort();
   });
  }
  cancelled(signal);
 }
 async function sendInventory(){
  if(typeof getInventory!=='function')throw Error('Não foi possível conferir a biblioteca do aparelho.');
  state('inventory');const result=await getInventory({signal,onProgress:p=>progress({...p,phase:'inventory'})});cancelled(signal);
  if(!result||!Array.isArray(result.have)||result.have.length>MAX_FILES||!integer(result.files,1000000)||result.files<result.have.length)throw Error('O inventário local é inválido.');
  const seen=new Set();for(const e of result.have){if(!validEntry(e)||seen.has(e.sha256))throw Error('O inventário local contém um arquivo inválido.');seen.add(e.sha256);}
  send({type:'inventory-start',version:2,count:result.have.length,files:result.files});
  for(let offset=0;offset<result.have.length;offset+=128){await waitCapacity(()=>channel.bufferedAmount<BUFFER_HIGH);send({type:'inventory',offset,have:result.have.slice(offset,offset+128)});}
  send({type:'inventory-end'});stage='preparing';state('preparing-delta');
 }
 async function prepare(){
  if(typeof prepareDelta!=='function')throw Error('Não foi possível preparar as diferenças da biblioteca.');
  state('preparing-delta');const details=await prepareDelta(inventory,{signal,onProgress:p=>{
   progress({...p,phase:'preparing-delta'});if(channel?.readyState==='open'&&Date.now()-lastRemoteProgress>=150){lastRemoteProgress=Date.now();send({type:'preparing'});}
  }});cancelled(signal);
  if(!validMeta(details)||!validStats(details.stats)||details.baseManifestSha256!==descriptor.sha256||details.stats.filesTotal!==descriptor.fileCount||details.stats.bytesTotal!==descriptor.uncompressedBytes||details.uncompressedBytes!==details.stats.bytesSent)throw Error('O pacote de diferenças não corresponde à biblioteca preparada.');
  const url=new URL(details.url,location.href);if(url.origin!==location.origin)throw Error('As novidades precisam estar no próprio PC.');
  meta={...cleanMeta(details),stats:{...details.stats},baseManifestSha256:details.baseManifestSha256};download=url.href;
  stage='offered';send({type:'offer',meta});onOffer(meta);state('confirm',{meta});
 }
 async function accept(){
  if(role!=='guest'||stage!=='offered'||storage||failed)throw Error('Aguarde a comparação das bibliotecas terminar.');
  stage='accepting';state('preparing');
  storage=await receiverFactory({id:random(16),...meta},{signal,onProgress:p=>progress(p)});cancelled(signal);
  chunkSize=maxMessage();if(chunkSize<1024)throw Error('O navegador não oferece blocos suficientes para esta transferência.');
  stage='receiving';lastActivity=lastTransferProgress=Date.now();transferStart=performance.now();send({type:'ready',maxChunk:chunkSize});state('receiving',{meta});
 }
 async function consume(data){
  if(failed||complete)return;
  lastActivity=Date.now();
  if(typeof data!=='string'){
   if(role!=='guest'||stage!=='receiving'||!storage)throw Error('Dados recebidos antes da confirmação.');
   const chunk=data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(await data.arrayBuffer());
   if(!chunk.length||chunk.length>chunkSize||storage.receivedBytes+chunk.length>meta.size)throw Error('Bloco de transferência inválido.');
   const written=await storage.append(chunk,storage.receivedBytes),persisted=typeof written==='number'?written:written.persistedBytes;
   if(!integer(persisted)||persisted<acked||persisted>storage.receivedBytes)throw Error('Confirmação de gravação inválida.');
   lastTransferProgress=Date.now();progress({phase:'receiving',loaded:storage.receivedBytes,total:meta.size});
   if(persisted>acked){acked=persisted;send({type:'ack',bytes:acked});}return;
  }
  if(new TextEncoder().encode(data).length>CONTROL)throw Error('Mensagem de sincronização inválida.');
  let msg;try{msg=JSON.parse(data);}catch{throw Error('Mensagem de sincronização inválida.');}
  if(!msg||typeof msg!=='object'||Array.isArray(msg))throw Error('Mensagem de sincronização inválida.');
  if(msg.type==='error')throw Error(/pacote mudou durante o pareamento/i.test(msg.message||'')?UPDATE:String(msg.message||'O outro aparelho interrompeu a transferência.').slice(0,500));
  if(msg.type==='ping'){send({type:'pong'});return;}if(msg.type==='pong')return;
  if(role==='guest'&&msg.type==='hello'){
   if(msg.version!==2)throw Error(UPDATE);
   if(stage!=='hello'||!validMeta(msg.meta)||!integer(msg.meta.fileCount,MAX_FILES)||msg.meta.sha256!==descriptor.sha256||msg.meta.size!==descriptor.size||msg.meta.uncompressedBytes!==descriptor.uncompressedBytes)throw Error('A biblioteca mudou durante o pareamento.');
   descriptor={...cleanMeta(msg.meta),fileCount:msg.meta.fileCount};stage='inventory';sendInventory().catch(error=>fail(error));return;
  }
  if(role==='host'&&msg.type==='inventory-start'){
   if(msg.version!==2)throw Error(UPDATE);
   if(stage!=='inventory'||!integer(msg.count,MAX_FILES)||!integer(msg.files,1000000)||msg.count>msg.files)throw Error('Inventário recebido inválido.');
   stage='collecting';inventoryExpected=msg.count;inventory={have:[],files:msg.files};return;
  }
  if(role==='host'&&msg.type==='inventory'){
   if(stage!=='collecting'||msg.offset!==inventory.have.length||!Array.isArray(msg.have)||!msg.have.length||msg.have.length>128||inventory.have.length+msg.have.length>inventoryExpected||msg.have.some(e=>!validEntry(e)))throw Error('Parte do inventário inválida.');
   inventory.have.push(...msg.have.map(e=>({sha256:e.sha256,size:e.size})));return;
  }
  if(role==='host'&&msg.type==='inventory-end'){
   if(stage!=='collecting'||inventory.have.length!==inventoryExpected||new Set(inventory.have.map(e=>e.sha256)).size!==inventoryExpected)throw Error('O inventário chegou incompleto.');
   stage='preparing';prepare().catch(error=>fail(error));return;
  }
  if(role==='guest'&&msg.type==='preparing'){if(stage!=='preparing')throw Error('Preparação fora de sequência.');return;}
  if(role==='guest'&&msg.type==='offer'){
   if(stage!=='preparing'||!validMeta(msg.meta)||!validStats(msg.meta.stats)||msg.meta.baseManifestSha256!==descriptor.sha256||msg.meta.stats.filesTotal!==descriptor.fileCount||msg.meta.stats.bytesTotal!==descriptor.uncompressedBytes||msg.meta.uncompressedBytes!==msg.meta.stats.bytesSent)throw Error('As novidades não correspondem à biblioteca pareada.');
   meta={...cleanMeta(msg.meta),stats:{...msg.meta.stats},baseManifestSha256:msg.meta.baseManifestSha256};stage='offered';onOffer(meta);state('confirm',{meta});return;
  }
  if(role==='host'&&msg.type==='ready'){
   if(stage!=='offered'||!integer(msg.maxChunk,MAX_CHUNK)||msg.maxChunk<1024)throw Error('Confirmação de recebimento inválida.');
   chunkSize=Math.min(msg.maxChunk,maxMessage());if(chunkSize<1024)throw Error('O navegador não oferece blocos suficientes para esta transferência.');
   stage='sending';lastTransferProgress=Date.now();transferStart=performance.now();state('sending',{meta});sendArchive().catch(error=>fail(error));return;
  }
  if(role==='host'&&msg.type==='ack'){
   if(!['sending','sent'].includes(stage)||!integer(msg.bytes)||msg.bytes<acked||msg.bytes>sent)throw Error('Confirmação de bloco inválida.');
   acked=msg.bytes;lastTransferProgress=Date.now();progress({phase:'sending',loaded:acked,total:meta.size});wakeSenders();return;
  }
  if(role==='guest'&&msg.type==='end'){
   if(stage!=='receiving'||!storage||storage.receivedBytes!==meta.size)throw Error('O pacote de novidades chegou incompleto.');
   stage='validating';progress({phase:'receiving',loaded:meta.size,total:meta.size},true);state('validating');send({type:'validating'});replacing=true;
   let result;try{
    const source=await storage.finalize();result=await replaceLibrary(source,{signal,expectedManifestSha256:descriptor.sha256,onProgress:p=>{
     progress(p);if(channel?.readyState==='open'&&Date.now()-lastRemoteProgress>=150){lastRemoteProgress=Date.now();send({type:'progress',phase:String(p.phase||'validating').slice(0,40)});}
    }});
   }catch(error){replacing=false;throw pendingFailure||error;}
   replacing=false;complete=true;stage='complete';let acknowledged=false;
   try{send({type:'complete',snapshotId:result.snapshot.id,archiveSha256:result.archiveSha256,manifestSha256:descriptor.sha256});acknowledged=true;}catch{}
   onDone({...result,acknowledged,stats:meta.stats,route});await delay(500);await cleanup();return;
  }
  if(role==='host'&&msg.type==='validating'){if(stage!=='sent')throw Error('Conferência fora de sequência.');stage='validating';state('validating');return;}
  if(role==='host'&&msg.type==='progress'){if(stage!=='validating')throw Error('Conferência fora de sequência.');state('validating',{step:msg.phase});return;}
  if(role==='host'&&msg.type==='complete'){
   if(stage!=='validating'||sent!==meta.size||typeof msg.snapshotId!=='string'||msg.snapshotId.length>200||msg.archiveSha256!==meta.sha256||msg.manifestSha256!==descriptor.sha256)throw Error('Confirmação final inválida.');
   complete=true;stage='complete';progress({phase:'sending',loaded:meta.size,total:meta.size},true);
   onDone({snapshotId:msg.snapshotId,archiveSha256:msg.archiveSha256,manifestSha256:descriptor.sha256,stats:meta.stats,route,transport:{chunkSize,peakInFlight,peakBuffered}});await cleanup();return;
  }
  throw Error('Mensagem fora da sequência da sincronização.');
 }
 async function sendArchive(){
  const response=await fetch(download,{cache:'no-store',signal});
  if(!response.ok||!response.body)throw Error('Não foi possível ler as novidades preparadas pelo PC.');
  const contentLength=response.headers.get('Content-Length');if(contentLength!==null&&Number(contentLength)!==meta.size)throw Error('O tamanho do pacote mudou durante a transferência.');
  const reader=response.body.getReader();try{
   while(true){
    const {done,value}=await reader.read();if(done)break;
    for(let offset=0;offset<value.length;offset+=chunkSize){
     const part=value.subarray(offset,Math.min(offset+chunkSize,value.length));
     await waitCapacity(()=>sent-acked+part.length<=INFLIGHT&&channel.bufferedAmount+part.length<=BUFFER_HIGH);
     if(sent+part.length>meta.size)throw Error('O tamanho do pacote mudou durante a transferência.');
     channel.send(part);sent+=part.length;peakInFlight=Math.max(peakInFlight,sent-acked);peakBuffered=Math.max(peakBuffered,channel.bufferedAmount);
    }
   }
   if(sent!==meta.size)throw Error('Não foi possível ler o pacote completo.');
   stage='sent';send({type:'end'});state('validating');
  }finally{if(signal.aborted)await reader.cancel().catch(()=>{});reader.releaseLock();}
 }
 const guarded=fn=>async(...args)=>{try{return await fn(...args);}catch(error){await fail(error);throw error;}};
 return Object.freeze({host:guarded(host),join:guarded(join),accept:guarded(accept),cancel:()=>fail(new DOMException('Sincronização cancelada.','AbortError')),isComplete:()=>complete,isBusy:()=>!['idle','error','complete'].includes(stage)&&!failed});
}
