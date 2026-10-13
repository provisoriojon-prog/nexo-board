(() => {
 'use strict';
 const maxBytes=16384,tokenPattern=/^[a-f0-9]{64}$/,noncePattern=/^[a-f0-9]{32}$/;
 const routes={info:'GET',status:'GET',pair:'POST',context:'POST',ack:'POST',unpair:'POST',parts:'POST'};
 const uint=v=>Number.isInteger(v)&&v>=0&&v<=4294967295;
 const ascii=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&/^[\x20-\x7e]+$/.test(v);
 const shortText=(v,max)=>typeof v==='string'&&v.length>0&&new TextEncoder().encode(v).length<=max&&!/[\x00-\x1f\x7f]/.test(v);
 const copy=v=>v?structuredClone(v):v;
 function fault(message,code='invalid_response'){return Object.assign(Error(message),{code});}
 function normalizeHost(value){
  const input=String(value||'').trim();
  if(/^cloud:/i.test(input)){const id=input.slice(6).toUpperCase();if(!/^[A-Z2-7]{10}$/.test(id))throw fault('Informe os 10 caracteres do ID Internet mostrado no ESP.','invalid_device_id');return 'cloud:'+id;}
  const text=input.toLowerCase();
  if(!text||text.length>280||/[\\\s?#@%]/.test(text))throw fault('Informe o IP do ESP ou astra-rffe.local.','invalid_host');
  let url;try{url=new URL(text.includes('://')?text:'http://'+text);}catch{throw fault('Endereço do ESP inválido.','invalid_host');}
  if(url.protocol!=='http:'||url.username||url.password||url.port&&url.port!=='80'||url.pathname!=='/'||url.search||url.hash)throw fault('Use somente o IP ou nome local do ESP, sem caminho ou senha.','invalid_host');
  const host=url.hostname,ip=host.split('.').map(Number),ipv4=/^\d{1,3}(\.\d{1,3}){3}$/.test(host)&&ip.every(n=>n>=0&&n<=255);
  const local=ipv4&&(ip[0]===10||ip[0]===192&&ip[1]===168||ip[0]===172&&ip[1]>=16&&ip[1]<=31);
  if(!local&&!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+local$/.test(host))throw fault('O endereço deve ser um IP da rede local ou terminar em .local.','invalid_host');
  return host;
 }
 function envelope(value){if(value?.protocol!=='astra-rffe'||value.api!==2)throw fault('Atualize o ESP com o firmware ASTRA NEXUS 2.','incompatible_protocol');return value;}
 function validateInfo(value){
  envelope(value);const d=value.device,n=value.network,p=value.pairing;
  if(!d||!ascii(d.id,64)||!shortText(d.name,64)||!ascii(d.firmware,64)||!uint(d.bootId)||!n||!ascii(n.ip,48)||!ascii(n.hostname,253)||!p||typeof p.open!=='boolean'||typeof p.paired!=='boolean'||!uint(p.expiresInMs)||p.expiresInMs>120000||p.codeLength!==undefined&&![4,6].includes(p.codeLength))throw fault('Identificação inválida recebida do ESP.');
  return {protocol:'astra-rffe',api:2,capabilities:{partsFocus:value.capabilities?.partsFocus===true},device:{id:d.id,name:d.name,firmware:d.firmware,bootId:d.bootId},network:{ip:n.ip,hostname:n.hostname},pairing:{open:p.open,paired:p.paired,expiresInMs:p.expiresInMs,codeLength:p.codeLength||6}};
 }
 function validateContext(value,lease=false){
  if(!value||!noncePattern.test(value.nonce)||!ascii(value.boardId,120)||!ascii(value.busId,200)||!shortText(value.label,96)||lease&&(!uint(value.remainingMs)||value.remainingMs>180000))throw fault('Vínculo de placa inválido recebido do ESP.');
  return {nonce:value.nonce,boardId:value.boardId,busId:value.busId,label:value.label,...(lease?{remainingMs:value.remainingMs}:{})};
 }
 function validateParts(value){
  if(!value||!noncePattern.test(value.contextNonce)||!Array.isArray(value.rows)||value.rows.length>32)throw fault('Lista de PAs inválida.','invalid_parts');
  const rows=value.rows.map(row=>{if(!row||!Number.isInteger(row.usid)||row.usid<1||row.usid>15||!ascii(row.component,32))throw fault('USID ou PA inválido.','invalid_parts');return {usid:row.usid,component:row.component};});
  for(let i=1;i<rows.length;i++)if(rows[i].usid<rows[i-1].usid||rows[i].usid===rows[i-1].usid&&rows[i].component<=rows[i-1].component)throw fault('A lista de PAs deve estar ordenada e sem duplicatas.','invalid_parts');
  const parts={contextNonce:value.contextNonce,rows};
  if(new TextEncoder().encode(JSON.stringify(parts)).length>2048)throw fault('A lista de PAs excede o limite de transmissão.','invalid_parts');
  return parts;
 }
 function validateFocus(value){
  if(!value||!uint(value.id)||value.id===0||!noncePattern.test(value.contextNonce)||!ascii(value.component,32)||!Number.isInteger(value.usid)||value.usid<1||value.usid>15)throw fault('Seleção de PA inválida recebida do ESP.');
  return {id:value.id,contextNonce:value.contextNonce,component:value.component,usid:value.usid};
 }
 function pins(value){if(typeof value.swapped!=='boolean'||![[1,2],[2,1]].some(([a,b])=>value.dataPin===a&&value.clockPin===b))throw fault('Configuração de pinos inválida recebida do ESP.');return {swapped:value.swapped,dataPin:value.dataPin,clockPin:value.clockPin};}
 function identities(found,value){
  if(!Array.isArray(found)||found.length>15||found.some(id=>!Number.isInteger(id)||id<1||id>15)||new Set(found).size!==found.length||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>15)throw fault('USIDs inválidos recebidos do ESP.');
  const result={};for(const [id,byte] of Object.entries(value)){if(!/^([1-9]|1[0-5])$/.test(id)||!found.includes(Number(id))||!Number.isInteger(byte)||byte<0||byte>255||(byte&15)!==Number(id))throw fault('Identidade incompatível com o USID recebido.');result[id]=byte;}return result;
 }
 function validateStatus(value){
  const info=validateInfo(value),s=value.scan;
  if(!uint(value.uptimeMs)||!s||!uint(s.id)||!uint(s.round)||!['idle','scanning','complete','stopped'].includes(s.state)||typeof s.active!=='boolean'||s.active!==(s.state==='scanning')||!Number.isInteger(s.progress)||s.progress<0||s.progress>15||typeof s.busy!=='boolean'||'found' in s||'identities' in s)throw fault('Estado de leitura inválido recebido do ESP.');
  let submission=null;const sent=value.submission;
  if(sent!==null){if(!sent||!uint(sent.id)||sent.id===0||!uint(sent.bootId)||sent.bootId!==info.device.bootId||!uint(sent.scanId)||!uint(sent.round)||!uint(sent.createdUptimeMs)||sent.complete!==true||typeof sent.acked!=='boolean')throw fault('Captura enviada inválida recebida do ESP.');const ids=identities(sent.found,sent.identities);submission={id:sent.id,bootId:sent.bootId,scanId:sent.scanId,context:validateContext(sent.context),found:[...sent.found].sort((a,b)=>a-b),identities:ids,round:sent.round,...pins(sent),createdUptimeMs:sent.createdUptimeMs,complete:true,acked:sent.acked};}
  return {...info,uptimeMs:value.uptimeMs,scan:{id:s.id,state:s.state,active:s.active,progress:s.progress,round:s.round,busy:s.busy,...pins(s)},context:value.context===null?null:validateContext(value.context,true),submission,focus:info.capabilities.partsFocus&&value.focus!=null?validateFocus(value.focus):null};
 }
 function createClient({fetcher=(...args)=>fetch(...args),onChange=()=>{},location=window.location,interval=1500,timeout=6500}={}){
  const relay=window.JCIDRFFERelay?.enabled?window.JCIDRFFERelay.create({fetcher}):null;
  let expectedDeviceId='',generation=0,timer=null,inflight=null,closed=true,bridge=null,failures=0,token='',controllers=new Set(),mutationTail=Promise.resolve();
  let state={phase:'disconnected',host:'',transport:null,payload:null,info:null,lastSeen:0,error:'',errorCode:''};
  const getState=()=>({...state,payload:copy(state.payload),info:copy(state.info)}),emit=()=>onChange(getState());
  async function json(url,signal,method='GET',body=null,auth=''){
   const headers={Accept:'application/json'};if(auth)headers['X-Nexus-Token']=auth;if(body!==null)headers['Content-Type']='application/json';
   const response=await fetcher(url,{method,headers,...(body!==null?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',redirect:'error',signal});
   if(!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw fault('Este endereço não respondeu com os dados do ASTRA RFFE.');
   if(Number(response.headers.get('content-length'))>maxBytes)throw fault('Resposta do ESP acima do limite.');
   const reader=response.body?.getReader();let text='';
   if(reader){const decoder=new TextDecoder();let bytes=0;try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maxBytes)throw fault('Resposta do ESP acima do limite.');text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}catch(e){await reader.cancel().catch(()=>{});throw e;}}
   else{text=await response.text();if(new TextEncoder().encode(text).length>maxBytes)throw fault('Resposta do ESP acima do limite.');}
   let data;try{data=JSON.parse(text);}catch{throw fault('O ESP enviou uma resposta inválida.');}
   if(!response.ok){const code=ascii(data?.error?.code,64)?data.error.code:'http_error',message=shortText(data?.error?.message,300)?data.error.message:'O ESP não respondeu corretamente ('+response.status+').';throw Object.assign(fault(message,code),{status:response.status});}return data;
  }
  async function findBridge(signal){
   if(bridge!==null)return;bridge=false;
   if(!['127.0.0.1','localhost'].includes(location.hostname))return;
   try{const info=await json('/__nexo_board__/status',signal);if(info.app==='nexo-board-local-v1'&&info.rffeBridge===2)bridge='';}catch(e){if(signal.aborted)throw e;}
   if(bridge===false&&location.port==='8767'){const companion='http://'+location.hostname+':8769';try{const info=await json(companion+'/__nexo_board__/status',signal);if(info.app==='nexo-board-local-v1'&&info.rffeBridge===2&&info.companion===true)bridge=companion;}catch(e){if(signal.aborted)throw e;}}
  }
  async function request(route,body=null){
   if(closed)throw fault('Conexão encerrada.','cancelled');
   const cloud=state.host.startsWith('cloud:'),run=generation,active=new AbortController(),deadline=setTimeout(()=>active.abort(),cloud?30000:timeout);controllers.add(active);
   try{
    if(cloud){state.transport='cloud';if(!relay)throw fault('A conexão pela internet ainda não foi ativada.','relay_unconfigured');const data=await relay.request(state.host.slice(6),route,body,['info','pair'].includes(route)?'':token,active.signal);if(run!==generation||closed)throw fault('Conexão alterada.','cancelled');return data;}
    await findBridge(active.signal);if(run!==generation||closed)throw fault('Conexão alterada.','cancelled');
    const local=bridge!==false;state.transport=local?'local':'direct';
    const url=local?bridge+'/__nexo_board__/rffe/'+route+'?host='+encodeURIComponent(state.host):'http://'+state.host+'/api/nexus/v2/'+route;
    const data=await json(url,active.signal,routes[route],body,['info','pair'].includes(route)?'':token);
    if(run!==generation||closed)throw fault('Conexão alterada.','cancelled');return data;
   }catch(error){if(run!==generation||closed)throw fault('Conexão alterada.','cancelled');throw error;}
   finally{clearTimeout(deadline);controllers.delete(active);}
  }
  function errorState(error){
   const cloud=state.transport==='cloud'||state.host.startsWith('cloud:');
   let message=error.name==='AbortError'?(cloud?'O ESP demorou para responder pela internet. Confira a conexão indicada na tela dele.':'O ESP demorou para responder. Confira o Wi‑Fi e o endereço.'):error.message||'Não foi possível acessar o ESP.';
   if(error instanceof TypeError&&cloud)message='Não foi possível acessar o serviço de conexão. Confira a internet deste aparelho e do ESP.';
   else if(error instanceof TypeError&&location.protocol==='https:')message='O navegador não conseguiu acessar o ESP. A conexão HTTP pode ser bloqueada por este site HTTPS, especialmente no Safari/iPhone. Confira também o Wi-Fi e o IP do ESP.';
   else if(error instanceof TypeError)message='ESP não encontrado. Confira o Wi‑Fi e o endereço nos ajustes do ESP.';
   if(error.status===401){token='';state={...state,phase:state.info?'pairing-required':'unreachable',payload:null,lastSeen:0,error:state.info?'Abra os ajustes do ESP e faça o pareamento novamente.':message,errorCode:error.code};}
   else state={...state,phase:!state.info?'unreachable':token?'retrying':'pairing-required',error:message,errorCode:error.code||'network_error'};
   emit();
  }
  async function poll(){
   if(closed)return false;if(inflight)return inflight;clearTimeout(timer);const run=generation;
   const work=(async()=>{try{
    if(!state.info||!token){const info=validateInfo(await request('info'));if(run!==generation||closed)return false;if(expectedDeviceId&&info.device.id!==expectedDeviceId)throw fault('Este endereço respondeu com outro ESP. Confira o aparelho antes de parear.','device_mismatch');state={...state,info};}
    if(!token){state={...state,phase:'pairing-required',payload:null,lastSeen:0,error:'',errorCode:''};emit();return true;}
    const payload=validateStatus(await request('status'));if(run!==generation||closed)return false;
    state={...state,phase:'connected',payload,info:validateInfo(payload),lastSeen:Date.now(),error:'',errorCode:''};failures=0;emit();return true;
   }catch(e){if(run!==generation||closed||e.code==='cancelled')return false;failures++;errorState(e);return false;}
   finally{if(run===generation){inflight=null;if(!closed&&token)timer=setTimeout(poll,Math.min(10000,interval*Math.max(1,failures)));}}})();inflight=work;return work;
  }
  function disconnect(){closed=true;generation++;clearTimeout(timer);for(const active of controllers)active.abort();controllers.clear();inflight=null;token='';state={...state,phase:'disconnected',payload:null,info:null,lastSeen:0,error:'',errorCode:''};emit();}
  async function connect(host,options={}){const normalized=normalizeHost(host),saved=options.token||'';if(saved&&!tokenPattern.test(saved))throw fault('Pareamento salvo inválido. Faça o pareamento novamente.','invalid_token');disconnect();closed=false;bridge=null;failures=0;token=saved;expectedDeviceId=options.deviceId||'';state={phase:'connecting',host:normalized,transport:null,payload:null,info:null,lastSeen:0,error:'',errorCode:''};emit();return poll();}
  function mutate(route,body){const run=generation;const task=mutationTail.catch(()=>{}).then(async()=>{if(run!==generation||closed)throw fault('Conexão alterada.','cancelled');try{return envelope(await request(route,body));}catch(e){if(run===generation&&!closed&&e.code!=='cancelled')errorState(e);throw e;}});mutationTail=task;return task;}
  async function pair(code,clientName='NEXUS'){
   const digits=state.info?.pairing.codeLength||6;
   if(!new RegExp('^\\d{'+digits+'}$').test(code)||!shortText(clientName,48))throw fault('Digite os '+digits+' números exibidos nos ajustes do ESP.','invalid_pair');
   if(!state.info)throw fault('Conecte ao ESP antes de informar o código de pareamento.','esp_unreachable');
   const run=generation,data=await mutate('pair',{code,clientName}),info=validateInfo(data);
   if(!tokenPattern.test(data.token))throw fault('O ESP retornou um pareamento inválido.');
   if(run!==generation||closed)throw fault('Conexão alterada.','cancelled');token=data.token;state={...state,info,error:'',errorCode:''};await poll();return {...info,token:data.token};
  }
  async function setContext(value){const context=value===null?null:validateContext(value),data=await mutate('context',context?{active:true,...context}:{active:false});if(data.ok!==true)throw fault('O ESP não confirmou o vínculo de placa.');const accepted=data.context===null?null:validateContext(data.context,true);if(JSON.stringify(context)!==JSON.stringify(accepted&&validateContext(accepted)))throw fault('O ESP confirmou um vínculo diferente.');return {...data,context:accepted};}
  async function setParts(value){
   if(!state.info?.capabilities.partsFocus)throw fault('Atualize o firmware do ESP para usar a lista de PAs.','unsupported_parts');
   const parts=validateParts(value),data=await mutate('parts',parts);
   if(data.ok!==true||data.contextNonce!==parts.contextNonce||data.count!==parts.rows.length)throw fault('O ESP não confirmou a lista de PAs.');return data;
  }
  async function ack(value){if(!value||!uint(value.id)||!noncePattern.test(value.contextNonce))throw fault('Confirmação de captura inválida.','invalid_ack');const data=await mutate('ack',{id:value.id,contextNonce:value.contextNonce});if(data.ok!==true||data.id!==value.id)throw fault('O ESP não confirmou o recebimento da captura.');return data;}
  async function unpair(){const data=await mutate('unpair',{});if(data.ok!==true)throw fault('O ESP não confirmou a remoção do pareamento.');disconnect();return data;}
  return Object.freeze({connect,pair,setContext,setParts,ack,unpair,disconnect,refresh:()=>{if(!inflight&&bridge===false)bridge=null;return poll();},getState});
 }
 window.JCIDRFFETransport=Object.freeze({normalizeHost,validateInfo,validateContext,validateParts,validateStatus,createClient});
})();
