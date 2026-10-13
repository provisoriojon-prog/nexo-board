(() => {
 'use strict';
 const $=id=>document.getElementById(id),dialog=$('rffeEspDialog'),pane=$('rffePane'),math=window.JCIDRFFEComparison;
 if(!dialog||!window.JCIDRFFETransport||!math)return;
 const composed=()=>window.JCID_BOARD?.nexusComposition?.version===1,compositionMessage='Junção: indisponível';
 let wasComposed=false;
 const storageKey='jcid-rffe-pair-v2',encoder=new TextEncoder();
 let connectionMode=null,activeToken='',reconnectWork=null,refreshBusy=false,refreshMessage='',refreshUntil=0,reconnectEpoch=0;
 const draftHosts={local:'astra-rffe.local',cloud:''};
 function installConnectionMode(){
  if(!window.JCIDRFFERelay?.enabled)return;
  const input=$('rffeEspHost'),hostLabel=input.closest('label'),form=$('rffeEspForm'),intro=form.querySelector(':scope > p'),note=form.querySelector('.rffe-esp-browser-note');
  const label=document.createElement('label'),caption=document.createElement('span'),mode=document.createElement('select');
  caption.textContent='Conexão';mode.id='rffeEspMode';mode.style.cssText='font:inherit;min-height:36px;width:100%;';
  for(const [value,text]of [['local','Wi-Fi local'],['cloud','Internet']]){const option=document.createElement('option');option.value=value;option.textContent=text;mode.append(option);}
  label.append(caption,mode);hostLabel.before(label);connectionMode=mode;
  const hostCaption=document.createElement('span');hostLabel.firstChild.replaceWith(hostCaption);
  const labels=()=>{const cloud=mode.value==='cloud';hostCaption.textContent=cloud?'ID Internet do NEX-32':'Endereço do NEX-32';input.placeholder=cloud?'ID mostrado nos ajustes do NEX-32':'astra-rffe.local';input.maxLength=cloud?10:253;input.autocapitalize=cloud?'characters':'none';input.pattern=cloud?'[A-Za-z2-7]{10}':'.*';if(intro)intro.textContent=cloud?'Conecte o NEX-32 à internet e informe o ID Internet mostrado nos ajustes dele.':'Conecte o NEX-32 e este aparelho ao mesmo Wi-Fi. Use o endereço mostrado nos ajustes do NEX-32.';if(note)note.textContent=cloud?'Funciona no PC e no iPhone sem precisar manter um computador ligado.':'O Safari pode bloquear o acesso local. Nesse caso, selecione Internet.';};
  mode.addEventListener('change',()=>{const stored=saved();input.value=mode.value==='cloud'?(stored?.cloudHost?.slice(6)||draftHosts.cloud):(stored?.localHosts?.[0]||draftHosts.local);$('rffeEspCode').value='';labels();input.focus();});
  input.addEventListener('input',()=>{draftHosts[mode.value]=input.value;});mode.refreshLabels=labels;labels();
 }
 const inputHost=()=>connectionMode?.value==='cloud'?'cloud:'+$('rffeEspHost').value.trim():$('rffeEspHost').value;
 let state={phase:'disconnected',payload:null,info:null,lastSeen:0,error:''},desired=null,contextKey='',bootKey='',accepted=null;
 let confirmedNonce='',lastSync=0,syncWork=null,ackWork='',lastAck='',contextError='',ackError='',submitBusy=false;
 let partsKey='',partsConfirmed='',lastFocusId=0;
 const current=()=>!composed()&&!pane.hidden&&!document.body.classList.contains('board-loading')?window.JCIDRFFE?.getSelectedBus?.()||null:null;
 const activeKey=c=>c?JSON.stringify([c.boardId,c.busId,c.modelLabel,c.label]):'';
 const submissionKey=(s,device)=>device+':'+s.bootId+':'+s.id;
 const emit=()=>window.dispatchEvent(new CustomEvent('jcid:rffe-reading'));
 const fresh=()=>state.phase==='connected'&&Date.now()-state.lastSeen<6500;
 function saved(){try{const value=JSON.parse(localStorage.getItem(storageKey));if(!value||typeof value.host!=='string'||!/^[a-f0-9]{64}$/.test(value.token)||typeof value.deviceId!=='string')return null;value.localHosts=Array.isArray(value.localHosts)?value.localHosts:[];if(value.host.startsWith('cloud:'))value.cloudHost=value.host;else if(!value.localHosts.includes(value.host))value.localHosts.unshift(value.host);return value;}catch{return null;}}
 function remember(info,host,token=activeToken){if(!info||!/^[a-f0-9]{64}$/.test(token))return;const previous=saved(),value=previous?.deviceId===info.device.id?previous:{localHosts:[]};Object.assign(value,{host,token,deviceId:info.device.id,name:info.device.name,paused:false});if(host.startsWith('cloud:'))value.cloudHost=host;const aliases=[info.network.hostname.endsWith('.local')?info.network.hostname:info.network.hostname+'.local',info.network.hostname,info.network.ip,...value.localHosts].map(h=>{try{return JCIDRFFETransport.normalizeHost(h);}catch{return null;}}).filter(h=>h&&!h.startsWith('cloud:'));value.localHosts=[...new Set(aliases)].slice(0,4);try{const encoded=JSON.stringify(value);if(localStorage.getItem(storageKey)!==encoded)localStorage.setItem(storageKey,encoded);}catch{contextError='Conectado nesta sessão; não foi possível salvar o vínculo neste navegador.';}}
 function pauseSaved(paused){const value=saved();if(value)try{localStorage.setItem(storageKey,JSON.stringify({...value,paused}));}catch{}}
 async function connectHost(host){if(composed())return false;contextError='';const stored=saved();activeToken=stored?.token||'';await client.connect(host,{token:activeToken,deviceId:activeToken?stored.deviceId:''});if(state.phase==='connected')remember(state.info,state.host);return state.phase==='connected';}
 function reconnect(mode){if(composed())return Promise.resolve(false);if(reconnectWork)return reconnectWork;const run=++reconnectEpoch,stored=saved(),cloud=mode?mode==='cloud':stored?stored.host.startsWith('cloud:'):location.protocol==='https:';const candidates=cloud?[stored?.cloudHost||inputHost()]:[...(stored?.localHosts||[]),'astra-rffe.local'];pauseSaved(false);reconnectWork=(async()=>{for(const host of [...new Set(candidates.filter(Boolean))]){if(run!==reconnectEpoch)return false;try{await connectHost(host);}catch(error){contextError=error.message;render();}if(run!==reconnectEpoch)return false;if(['connected','pairing-required'].includes(state.phase))break;}return state.phase==='connected';})().finally(()=>{reconnectWork=null;});return reconnectWork;}
 async function refreshConnection(){if(composed()){render();return false;}if(refreshBusy)return;refreshBusy=true;refreshMessage='';render();try{if(['disconnected','unreachable','retrying'].includes(state.phase)){await reconnect();}else await client.refresh();if(state.phase==='connected'){const run=reconnectEpoch;lastSync=0;partsConfirmed='';await syncContext();if(run===reconnectEpoch&&state.phase==='connected'&&!contextError&&!ackError){refreshMessage='Atualizado '+new Date().toLocaleTimeString('pt-BR');refreshUntil=Date.now()+4000;}}else if(state.phase==='pairing-required')open();}finally{refreshBusy=false;render();}}

 function nonce(){return [...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');}
 function label(c){let value=c.modelLabel+' · '+c.label;while(encoder.encode(value).length>96)value=value.slice(0,-1);return value;}
 function clearReading(){accepted=null;lastAck='';ackError='';emit();}
 function contextChanged(force=false){
  const blocked=composed(),resumed=wasComposed&&!blocked,changedComposition=wasComposed!==blocked;wasComposed=blocked;if(blocked&&dialog.open)dialog.close();
  const c=current(),key=activeKey(c);if(force||changedComposition||key!==contextKey){contextKey=key;desired=c?{nonce:nonce(),boardId:c.boardId,busId:c.busId,label:label(c)}:null;confirmedNonce='';lastSync=0;partsKey='';partsConfirmed='';lastFocusId=0;contextError='';clearReading();}
  render();if(state.phase==='connected')void syncContext();else if(resumed&&state.phase==='disconnected'&&saved()&&!saved().paused)void reconnect();
 }
 function partRows(c){
  const unique=new Map();
  for(const device of c?.devices||[])for(const usid of math.expected(device)){
   if(typeof device.component!=='string'||!device.component.length||device.component.length>32||!/^[\x20-\x7e]+$/.test(device.component))throw Error('Nome de PA incompatível com a lista do NEX-32.');
   unique.set(usid+':'+device.component,{usid,component:device.component});
  }
  return [...unique.values()].sort((a,b)=>a.usid-b.usid||(a.component<b.component?-1:a.component>b.component?1:0));
 }
 async function syncContext(){
  if(document.hidden||state.phase!=='connected')return;if(syncWork)return syncWork;
  let rows;try{rows=partRows(current());}catch(error){contextError=error.message;render();return;}
  const target=desired?{...desired}:null,boot=bootKey,key=JSON.stringify([target?.nonce||'',rows]);
  const foreign=state.payload?.context;if(target&&lastSync&&confirmedNonce===target.nonce&&foreign?.remainingMs>0&&foreign.nonce!==target.nonce){contextError='NEX-32 em uso por outra sessão do aplicativo. Toque em atualizar para usar esta placa.';render();return;}
  const needsContext=!lastSync||Date.now()-lastSync>=30000||confirmedNonce!==(target?.nonce||'none');
  const needsParts=!!target&&state.info?.capabilities.partsFocus===true&&partsConfirmed!==key;
  if(!needsContext&&!needsParts)return;
  syncWork=(async()=>{try{
    if(needsContext)await client.setContext(target);
    if(boot!==bootKey||(target?.nonce||'')!==(desired?.nonce||''))return;
    confirmedNonce=target?.nonce||'none';if(needsContext)lastSync=Date.now();contextError='';
    if(needsParts){await client.setParts({contextNonce:target.nonce,rows});if(boot===bootKey&&target.nonce===desired?.nonce){partsKey=key;partsConfirmed=key;}}
   }
   catch(error){if(error.code!=='cancelled'&&boot===bootKey)contextError=error.message;}
   finally{syncWork=null;render();if(boot===bootKey&&(target?.nonce||'')!==(desired?.nonce||'')&&state.phase==='connected')void syncContext();}})();
  return syncWork;
 }
 function receiveFocus(payload){
  if(composed())return;
  const event=payload.focus,c=desired,live=payload.context,selected=current();
  if(!event||!c||!fresh()||confirmedNonce!==c.nonce||!live||live.remainingMs<=0||
     live.nonce!==c.nonce||live.boardId!==c.boardId||live.busId!==c.busId||live.label!==c.label||
     event.contextNonce!==c.nonce||event.id<=lastFocusId||activeKey(selected)!==contextKey)return;
  let rows;try{rows=partRows(selected);}catch{return;}
  const key=JSON.stringify([c.nonce,rows]);
  if(partsConfirmed!==key||partsKey!==key||!rows.some(row=>row.usid===event.usid&&row.component===event.component))return;
  lastFocusId=event.id;
  window.JCIDRFFE?.locateComponent?.(event.component);
 }
 function comparison(boardId,busId,device){
  const empty={text:'—',title:'Selecione este RFFE, inicie a leitura no NEX-32 e toque em ENVIAR.',result:null,observedUsid:null,observedUsids:[],missingUsids:[]};
  if(composed())return empty;
  if(!math.expected(device).length)return {...empty,text:'Sem USID',title:'USID de referência ainda não cadastrado para este componente.'};
  if(!accepted||accepted.context.boardId!==boardId||accepted.context.busId!==busId||accepted.context.nonce!==desired?.nonce)return empty;
  return math.compare(device,accepted.found);
 }
 async function acknowledge(sent){
  const key=submissionKey(sent,state.payload.device.id);if(ackWork||lastAck===key&&sent.acked)return;
  ackWork=key;
  try{await client.ack({id:sent.id,contextNonce:sent.context.nonce});if(accepted&&accepted.key===key){lastAck=key;accepted.acknowledged=true;ackError='';}}
  catch(error){if(error.code!=='cancelled'&&accepted?.key===key)ackError='Leitura recebida; aguardando confirmar ao NEX-32.';}
  finally{ackWork='';render();}
 }
 function receive(payload){
  if(composed())return;
  const sent=payload.submission,c=desired;
  if(!c||!sent||confirmedNonce!==c.nonce||sent.bootId!==payload.device.bootId||sent.context.nonce!==c.nonce||sent.context.boardId!==c.boardId||sent.context.busId!==c.busId||sent.context.label!==c.label)return;
  const key=submissionKey(sent,payload.device.id);
  if(accepted?.key!==key){accepted={...structuredClone(sent),key,deviceId:payload.device.id,receivedAt:Date.now(),acknowledged:sent.acked};contextError='';emit();}
  void acknowledge(sent);
 }
 function update(next){
  state=next;if(next.phase!=='connected'){refreshMessage='';refreshUntil=0;}if(next.phase==='connected'&&next.info)remember(next.info,next.host);
  if(['disconnected','connecting','unreachable','pairing-required'].includes(next.phase)){bootKey='';confirmedNonce='';lastSync=0;partsKey='';partsConfirmed='';lastFocusId=0;if(accepted)clearReading();}
  if(next.phase==='connected'&&next.payload){const boot=next.payload.device.id+':'+next.payload.device.bootId;if(boot!==bootKey){bootKey=boot;contextChanged(true);}else contextChanged();receive(next.payload);receiveFocus(next.payload);}
  render();
 }
 const client=JCIDRFFETransport.createClient({onChange:update});
 function render(){
  const connected=state.phase==='connected',live=fresh(),pairing=state.phase==='pairing-required'&&!!state.info,scan=state.payload?.scan,info=state.info;
  const names={disconnected:'Não conectado',connecting:'Conectando…',unreachable:'Sem acesso ao NEX-32','pairing-required':'Parear NEX-32',connected:live?'Conectado · '+(state.transport==='cloud'?'Internet':'Local'):'Atualizando…',retrying:'Sem resposta'};
  $('rffeConnectionState').textContent=composed()?compositionMessage:refreshBusy?'Atualizando…':refreshMessage&&Date.now()<refreshUntil?refreshMessage:names[state.phase]||'Não conectado';$('rffeConnectionState').dataset.state=live?'connected':state.phase;
  $('rffeConnect').querySelector('span').textContent='NEX-32';
  $('rffeConnect').disabled=composed();
  $('rffeConnect').title=composed()?compositionMessage:state.host?'Configurar NEX-32 · '+state.host:'Conectar ao NEX-32';
  $('rffeRefreshConnection').disabled=composed()||refreshBusy||state.phase==='connecting';$('rffeRefreshConnection').setAttribute('aria-busy',String(refreshBusy));
  $('rffeEspDisconnect').hidden=state.phase==='disconnected';$('rffeEspForget').hidden=!connected;
  $('rffeEspPairing').hidden=!pairing;$('rffeEspCode').required=pairing;
  const digits=info?.pairing.codeLength||4;$('rffeEspCode').maxLength=digits;$('rffeEspCode').pattern='[0-9]{'+digits+'}';$('rffeEspCode').placeholder='0'.repeat(digits);
  $('rffeEspSubmit').textContent=pairing?'Parear':state.phase==='unreachable'?'Tentar novamente':'Conectar';$('rffeEspSubmit').disabled=composed()||submitBusy;
  $('rffeEspPairHint').textContent=info?.pairing.open?'Digite o código mostrado na tela do NEX-32.':'No NEX-32, abra a opção de pareamento nos AJUSTES para gerar o código.';
  $('rffeEspFeedback').textContent=state.error||contextError||ackError||(live?'Conectado a '+info.device.name+' · '+(state.transport==='cloud'?'Internet':info.network.ip):state.phase==='connecting'?'Procurando o NEX-32…':'');
  $('rffeEspFeedback').dataset.error=String(!!(state.error||contextError||ackError));
  const communication=$('rffeCommunicationState'),issue=contextError||ackError;
  const acceptedCurrent=accepted&&scan?.id===accepted.scanId;
  const text=composed()?'':issue?'Atenção':pairing?'Parear':!live?'':acceptedCurrent?(accepted.acknowledged?'Recebido':'Confirmando…'):scan?.state==='scanning'?'Buscando…':scan?.state==='complete'?'Enviar':scan?.state==='stopped'?'Interrompido':syncWork?'Sincronizando…':'';
  communication.textContent=text;communication.hidden=!text;communication.dataset.error=String(!!issue);
  communication.title=issue||(acceptedCurrent?'Leitura recebida e comparada na tabela.':scan?.state==='complete'?'Busca concluída. Toque em ENVIAR no NEX-32.':text);

 }
 function open(){if(composed()){render();return false;}const stored=saved(),host=state.host||stored?.host||(connectionMode&&window.location.protocol==='https:'?'cloud:':'astra-rffe.local');if(connectionMode){connectionMode.value=host.startsWith('cloud:')?'cloud':'local';$('rffeEspHost').value=host.startsWith('cloud:')?host.slice(6):host;connectionMode.refreshLabels();}else $('rffeEspHost').value=host;$('rffeEspCode').value='';render();dialog.showModal();requestAnimationFrame(()=>$(state.phase==='pairing-required'&&state.info?'rffeEspCode':'rffeEspHost').focus());}
 function disconnect(){reconnectEpoch++;pauseSaved(true);activeToken='';client.disconnect();contextChanged(true);}
 $('rffeConnect').disabled=false;$('rffeConnect').addEventListener('click',async()=>{if(composed())return;if(state.phase==='connected'){open();return;}await reconnect();if(state.phase!=='connected')open();});
 $('rffeRefreshConnection').title='Atualizar a conexão; a busca começa no NEX-32';$('rffeRefreshConnection').addEventListener('click',refreshConnection);
 $('rffeEspClose').addEventListener('click',()=>dialog.close());$('rffeEspDisconnect').addEventListener('click',disconnect);
 $('rffeEspForget').addEventListener('click',async()=>{reconnectEpoch++;try{await client.unpair();localStorage.removeItem(storageKey);contextChanged(true);}catch(error){$('rffeEspFeedback').textContent=error.message;}});
 $('rffeEspForm').addEventListener('submit',async event=>{event.preventDefault();if(composed()){render();return;}reconnectEpoch++;submitBusy=true;render();try{
  const host=JCIDRFFETransport.normalizeHost(inputHost());
  if(state.phase==='pairing-required'&&state.info&&state.host===host){const result=await client.pair($('rffeEspCode').value.trim());activeToken=result.token;remember(result,host,result.token);}
  else{await connectHost(host);}
  if(state.phase==='connected')dialog.close();else if(state.phase==='pairing-required'&&state.info)$('rffeEspCode').focus();
 }catch(error){$('rffeEspFeedback').textContent=error.message;$('rffeEspFeedback').dataset.error='true';}finally{submitBusy=false;$('rffeEspSubmit').disabled=composed();}});
 for(const event of ['jcid:rffe-bus','jcid:document','jcid:boardchange','jcid:boardloadstate','jcid:tool'])window.addEventListener(event,()=>contextChanged());
 dialog.addEventListener('keydown',event=>event.stopPropagation());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.phase!=='disconnected'){void client.refresh();if(state.phase==='connected')void syncContext();}});
 setInterval(()=>{render();if(state.phase==='connected')void syncContext();},5000);
 window.JCIDRFFEConnection=Object.freeze({open,disconnect,refresh:refreshConnection,getState:client.getState,getComparison:comparison,getBinding:()=>!composed()&&desired?{...desired}:null,getAccepted:()=>!composed()&&accepted?structuredClone(accepted):null});
 installConnectionMode();contextChanged();const stored=saved();if(stored&&!stored.paused)setTimeout(()=>void reconnect(),0);
})();
