/* One paired, ordered data channel. No library bytes are uploaded to signaling. */
const CHUNK=16*1024,WINDOW=1024*1024,WAIT=120000;
const random=n=>[...crypto.getRandomValues(new Uint8Array(n))].map(v=>v.toString(16).padStart(2,'0')).join('');
const delay=(ms,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(signal.reason||new DOMException('Cancelado','AbortError'));const abort=()=>{clearTimeout(timer);reject(signal.reason||new DOMException('Cancelado','AbortError'));},timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});});
function validMeta(meta){return meta&&Number.isSafeInteger(meta.size)&&meta.size>0&&meta.size<=8*1024**3&&Number.isSafeInteger(meta.uncompressedBytes)&&meta.uncompressedBytes>=0&&meta.uncompressedBytes<=8*1024**3&&/^[a-f0-9]{64}$/.test(meta.sha256);}
export function libraryPeer65({role,signalBase,onState=()=>{},onProgress=()=>{},onOffer=()=>{},onDone=()=>{},onError=()=>{},receiverFactory,replaceLibrary,iceServers=[{urls:'stun:stun.cloudflare.com:3478'}]}={}){
 const controller=new AbortController(),signal=controller.signal,base=new URL('/v1/library-sync/',signalBase||window.NEXUS_RELAY_CONFIG?.url||location.href);
 let pc,channel,room,token=random(32),meta,download,storage,queue=Promise.resolve(),sent=0,acked=0,lastAck=Date.now(),ready=false,transferring=false,complete=false,failed=false,replacing=false,pendingFailure=null,watchdog,wake;
 const state=(phase,detail={})=>onState({phase,...detail});
 const send=value=>{if(channel?.readyState!=='open')throw Error('A conexão com o outro aparelho foi encerrada.');channel.send(JSON.stringify(value));};
 async function api(path,{method='GET',body,auth=true}={}){const response=await fetch(new URL(path,base),{method,mode:'cors',credentials:'omit',cache:'no-store',headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal});let data;try{data=await response.json();}catch{throw Error('O serviço de sincronização não respondeu. Confira a internet.');}if(!response.ok)throw Error(data.message||'Não foi possível conectar os aparelhos.');return data;}
 async function endRoom(){if(!room)return;try{await api('rooms/'+room.id+'/close',{method:'POST'});}catch{}room=null;}
 async function keepAwake(){try{wake=await navigator.wakeLock?.request('screen');}catch{}}
 async function cleanup(){clearInterval(watchdog);wake?.release().catch(()=>{});await endRoom();controller.abort();channel?.close();pc?.close();}
 async function fail(error,notify=true){
  if(failed||complete||pendingFailure&&replacing)return;
  // Cancellation may race the IndexedDB commit. Let the importer decide whether
  // its atomic transaction committed before claiming the old library survived.
  if(replacing)pendingFailure=error;else failed=true;
  try{if(notify&&!replacing&&channel?.readyState==='open')send({type:'error',message:error.message});}catch{}
  controller.abort(error);clearInterval(watchdog);channel?.close();pc?.close();wake?.release().catch(()=>{});
  if(replacing)return;
  try{await storage?.discard();}catch{}onError(error);
 }
 function attach(dc){channel=dc;channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=CHUNK*4;
  channel.addEventListener('open',()=>{state('connected');keepAwake();if(role==='host')send({type:'hello',version:1,meta});watchdog=setInterval(()=>{if(transferring&&!complete&&Date.now()-lastAck>WAIT)fail(Error('A transferência parou. Mantenha os dois aparelhos abertos e tente novamente. A biblioteca anterior foi mantida.'));},1000);});
  channel.addEventListener('message',event=>{queue=queue.then(()=>consume(event.data)).catch(error=>fail(error));});
  channel.addEventListener('close',()=>{if(!complete&&!failed)fail(Error('A conexão foi interrompida. Confira no celular se a atualização foi concluída.'),false);});
  channel.addEventListener('error',()=>fail(Error('Falha na comunicação entre os aparelhos.'),false));
 }
 function create(){if(typeof RTCPeerConnection!=='function')throw Error('Este navegador não oferece a conexão necessária. Atualize o navegador para sincronizar.');pc=new RTCPeerConnection({iceServers});pc.addEventListener('connectionstatechange',()=>{if(pc.connectionState==='failed')fail(Error('Os aparelhos não conseguiram se conectar. Confira se estão no mesmo Wi-Fi e se a rede permite comunicação entre dispositivos.'));});if(role==='host')attach(pc.createDataChannel('nexus-library-v1',{ordered:true}));else pc.addEventListener('datachannel',event=>{if(channel||event.channel.label!=='nexus-library-v1'){event.channel.close();return;}attach(event.channel);});}
 async function gather(description){await pc.setLocalDescription(description);const started=Date.now();while(pc.iceGatheringState!=='complete'&&Date.now()-started<10000)await delay(100,signal);return {type:pc.localDescription.type,sdp:pc.localDescription.sdp};}
 async function host(details,url){if(role!=='host'||!validMeta(details))throw Error('O pacote de sincronização é inválido.');meta={size:details.size,uncompressedBytes:details.uncompressedBytes,sha256:details.sha256,name:details.name||'Biblioteca NEXUS.zip'};download=url;create();state('connecting');const offer=await gather(await pc.createOffer()),id=random(16);room=await api('rooms',{method:'POST',auth:false,body:{id,token,offer,meta}});state('code',{code:room.code,expiresAt:room.expiresAt});const deadline=room.expiresAt;while(!signal.aborted&&Date.now()<deadline){const result=await api('rooms/'+room.id);if(result.answer){state('pairing',{name:result.guestName});await pc.setRemoteDescription(result.answer);await waitOpen();return;}await delay(1500,signal);}throw Error('O código expirou. Abra uma nova conexão.');}
 async function join(code,name='NEXUS Mobile'){if(role!=='guest'||!/^\d{4}$/.test(code))throw Error('Digite os quatro números mostrados no PC.');state('connecting');room=await api('join',{method:'POST',auth:false,body:{code,token,name}});meta=room.meta;if(!validMeta(meta))throw Error('O PC enviou um pacote inválido.');create();await pc.setRemoteDescription(room.offer);const answer=await gather(await pc.createAnswer());await api('rooms/'+room.id+'/answer',{method:'POST',body:{answer}});await waitOpen();}
 async function waitOpen(){const start=Date.now();while(channel?.readyState!=='open'){if(Date.now()-start>30000)throw Error('Não foi possível estabelecer a conexão direta. Use o mesmo Wi-Fi nos dois aparelhos.');await delay(100,signal);}}
 async function accept(){if(role!=='guest'||!ready||storage||failed)throw Error('Aguarde o PC terminar de conectar.');state('preparing');storage=await receiverFactory({id:random(16),size:meta.size,sha256:meta.sha256,uncompressedBytes:meta.uncompressedBytes,name:meta.name},{signal,onProgress});transferring=true;lastAck=Date.now();send({type:'ready'});state('receiving');}
 async function consume(data){
  if(failed||complete)return;
  if(typeof data!=='string'){
   if(role!=='guest'||!storage||!transferring)throw Error('Dados recebidos antes da confirmação.');const chunk=data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(await data.arrayBuffer());if(!chunk.length||chunk.length>CHUNK)throw Error('Bloco de transferência inválido.');const written=await storage.append(chunk,storage.receivedBytes),persisted=typeof written==='number'?written:written.persistedBytes;lastAck=Date.now();onProgress({phase:'receiving',loaded:storage.receivedBytes,total:meta.size});if(persisted>acked){acked=persisted;send({type:'ack',bytes:acked});}return;
  }
  if(data.length>16384)throw Error('Mensagem de sincronização inválida.');let msg;try{msg=JSON.parse(data);}catch{throw Error('Mensagem de sincronização inválida.');}
  if(msg.type==='error')throw Error(String(msg.message||'O outro aparelho interrompeu a transferência.').slice(0,500));
  if(role==='guest'&&msg.type==='hello'){if(ready||msg.version!==1||!validMeta(msg.meta)||msg.meta.sha256!==meta.sha256||msg.meta.size!==meta.size)throw Error('O pacote mudou durante o pareamento.');ready=true;onOffer(meta);state('confirm',{meta});return;}
  if(role==='host'&&msg.type==='ready'){if(transferring)throw Error('A transferência já começou.');transferring=true;lastAck=Date.now();state('sending');sendArchive().catch(error=>fail(error));return;}
  if(role==='host'&&msg.type==='ack'){if(!Number.isSafeInteger(msg.bytes)||msg.bytes<acked||msg.bytes>sent)throw Error('Confirmação de bloco inválida.');acked=msg.bytes;lastAck=Date.now();onProgress({phase:'sending',loaded:acked,total:meta.size});return;}
  if(role==='guest'&&msg.type==='end'){
   if(!storage||storage.receivedBytes!==meta.size)throw Error('O pacote chegou incompleto.');state('validating');transferring=false;send({type:'validating'});replacing=true;
   let result;try{const source=await storage.finalize();result=await replaceLibrary(source,{signal,onProgress:p=>{onProgress(p);if(channel?.readyState==='open')send({type:'progress',phase:p.phase||'validating'});}});}catch(error){replacing=false;throw pendingFailure||error;}
   replacing=false;complete=true;let acknowledged=false;
   try{send({type:'complete',snapshotId:result.snapshot.id,archiveSha256:result.archiveSha256});acknowledged=true;}catch{}
   // The durable result remains a success even if the final network ACK is lost.
   onDone({...result,acknowledged});await delay(500);await cleanup();return;
  }
  if(role==='host'&&msg.type==='validating'){transferring=false;state('validating');return;}
  if(role==='host'&&msg.type==='progress'){state('validating');return;}
  if(role==='host'&&msg.type==='complete'){if(sent!==meta.size||typeof msg.snapshotId!=='string'||msg.archiveSha256!==meta.sha256)throw Error('Confirmação final inválida.');complete=true;onDone({snapshotId:msg.snapshotId,archiveSha256:msg.archiveSha256});await cleanup();return;}
  throw Error('Mensagem fora da sequência da sincronização.');
 }
 async function sendArchive(){const url=new URL(download,location.href);if(url.origin!==location.origin)throw Error('O pacote precisa estar no próprio PC.');const response=await fetch(url,{cache:'no-store',signal});if(!response.ok||!response.body)throw Error('Não foi possível ler o pacote preparado pelo PC.');const reader=response.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;for(let offset=0;offset<value.length;offset+=CHUNK){const part=value.subarray(offset,Math.min(offset+CHUNK,value.length));while(sent-acked+part.length>2*WINDOW||channel.bufferedAmount>WINDOW)await delay(10,signal);if(sent+part.length>meta.size)throw Error('O tamanho do pacote mudou durante a transferência.');channel.send(part);sent+=part.length;}}if(sent!==meta.size)throw Error('Não foi possível ler o pacote completo.');send({type:'end'});state('validating');}finally{reader.releaseLock();}}
 const guarded=fn=>async(...args)=>{try{return await fn(...args);}catch(error){await fail(error);throw error;}};
 return Object.freeze({host:guarded(host),join:guarded(join),accept:guarded(accept),cancel:()=>fail(new DOMException('Sincronização cancelada.','AbortError')),isComplete:()=>complete,isBusy:()=>transferring||!!storage&&!complete});
}
