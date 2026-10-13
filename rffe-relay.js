(() => {
 'use strict';
 // Configure only after the authenticated relay has been deployed and enabled.
 const config=window.NEXUS_RELAY_CONFIG||{},endpoint=String(config.url||'').replace(/\/$/,'');
 const isEndpoint=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/';}catch{return false;}};
 const enabled=config.enabled===true&&isEndpoint(endpoint);
 const allowedRoutes=new Set(['info','status','pair','context','ack','unpair','parts']);
 const fault=(message,code)=>Object.assign(Error(message),{code});
 const hex=bytes=>[...crypto.getRandomValues(new Uint8Array(bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const pause=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Conexão cancelada.','AbortError'));return;}
  const done=()=>{signal.removeEventListener('abort',cancel);resolve();},timer=setTimeout(done,ms);
  function cancel(){clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(new DOMException('Conexão cancelada.','AbortError'));}
  signal.addEventListener('abort',cancel,{once:true});
 });
 async function read(response){
  if(!response.headers.get('content-type')?.includes('application/json'))throw fault('O serviço de conexão não está disponível.','relay_unavailable');
  if(Number(response.headers.get('content-length'))>24576)throw fault('Resposta do serviço acima do limite.','relay_response');
  let bytes=0,text='';const reader=response.body?.getReader(),decoder=new TextDecoder();
  if(reader){try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>24576)throw fault('Resposta do serviço acima do limite.','relay_response');text+=decoder.decode(next.value,{stream:true});}text+=decoder.decode();}catch(e){await reader.cancel().catch(()=>{});throw e;}}
  else{text=await response.text();if(new TextEncoder().encode(text).length>24576)throw fault('Resposta do serviço acima do limite.','relay_response');}
  let data;try{data=JSON.parse(text);}catch{throw fault('Resposta inválida do serviço de conexão.','relay_response');}
  if(!response.ok){const code=typeof data?.error?.code==='string'?data.error.code:'relay_unavailable';const messages={device_offline:'O ESP está sem acesso à internet. Confira a indicação na tela dele.',request_pending_or_duplicate:'O ESP ainda está atendendo uma solicitação. Aguarde e tente novamente.',request_expired:'O ESP não respondeu a tempo. Confira a conexão e tente novamente.',request_not_found:'A solicitação não está mais disponível. Tente novamente.',relay_not_configured:'A conexão pela internet ainda não foi ativada.',relay_unavailable:'O serviço de conexão está indisponível. Tente novamente em instantes.',rate_limited:'Aguarde alguns segundos antes de tentar novamente.',pair_rate_limited:'Aguarde um minuto antes de tentar parear novamente.'};throw fault(messages[code]||'Não foi possível acessar o serviço de conexão.',code);}
  return data;
 }
 function create({fetcher=(...args)=>fetch(...args),base=endpoint}={}){
  let queue=Promise.resolve();
  const send=async(path,options)=>read(await fetcher(base+path,{cache:'no-store',credentials:'omit',redirect:'error',...options}));
  async function exchange(deviceId,route,body,token,signal){
   if(!enabled||!isEndpoint(base))throw fault('A conexão pela internet ainda não foi ativada.','relay_unconfigured');
   if(typeof deviceId!=='string'||!/^[A-Z2-7]{10}$/.test(deviceId)||!allowedRoutes.has(route)||!(body===null||body&&typeof body==='object'&&!Array.isArray(body))||new TextEncoder().encode(JSON.stringify(body)).length>2048)throw fault('Solicitação de conexão inválida.','invalid_request');
   if(['info','pair'].includes(route)?token!=='':typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fault('Pareamento salvo inválido.','invalid_token');
   if(signal.aborted)throw new DOMException('Conexão cancelada.','AbortError');
   const id=hex(16),accepted=await send('/v1/requests',{method:'POST',signal,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({id,deviceId,route,body,token})});
   if(accepted.id!==id||!/^[a-f0-9]{64}$/.test(accepted.ticket))throw fault('Confirmação inválida do serviço.','relay_response');
   const start=Date.now();
   while(Date.now()-start<28000){
    await pause(650,signal);
    const response=await send('/v1/requests/'+id,{method:'GET',signal,headers:{Accept:'application/json',Authorization:'Bearer '+accepted.ticket}});
    if(response.pending===true)continue;
    if(!Number.isInteger(response.status)||response.status<200||response.status>599||!response.data||typeof response.data!=='object'||Array.isArray(response.data)||new TextEncoder().encode(JSON.stringify(response.data)).length>16384)throw fault('Resposta inválida do ESP.','relay_response');
    if(response.status>=400){const e=response.data.error;throw Object.assign(fault(typeof e?.message==='string'?e.message.slice(0,300):'O ESP recusou a solicitação.',typeof e?.code==='string'?e.code:'esp_error'),{status:response.status});}
    return response.data;
   }
   throw fault('O ESP não respondeu a tempo. Confira a internet na tela dele.','relay_timeout');
  }
  // Only one command per ESP may be outstanding. In particular, never retry a
  // pairing, context, acknowledgment or unpair request automatically.
  function request(deviceId,route,body,token,signal=new AbortController().signal){
   if(signal.aborted)return Promise.reject(new DOMException('Conexão cancelada.','AbortError'));
   const work=queue.catch(()=>{}).then(()=>exchange(deviceId,route,body,token,signal));queue=work.catch(()=>{});
   // A queued cancellation rejects immediately, while its reserved slot still
   // waits for the preceding operation and cannot overlap/replay any command.
   return new Promise((resolve,reject)=>{
    const cancel=()=>reject(new DOMException('Conexão cancelada.','AbortError'));
    signal.addEventListener('abort',cancel,{once:true});
    work.then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));
   });
  }
  return Object.freeze({request});
 }
 window.JCIDRFFERelay=Object.freeze({enabled,create});
})();
