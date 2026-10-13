import {libraryPeer66} from './nexus-sync-peer66.js';

const $=id=>document.getElementById(id);
const number=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
const format=bytes=>{bytes=Number(bytes)||0;const power=bytes>=1024**3?3:bytes>=1024**2?2:bytes>=1024?1:0;return number.format(bytes/1024**power)+' '+['B','KB','MB','GB'][power];};
let peer,controller,busy=false,desktop=false,receiverMeta=null,libraryBusy=false,parentJob=null,generation=0;
const live=run=>{if(run!==generation)throw new DOMException('Operação encerrada.','AbortError');};
const dialog=document.createElement('dialog');
dialog.id='librarySync65';dialog.className='library-sync65';
dialog.innerHTML=`<header><h2>Sincronizar biblioteca</h2><button type="button" id="librarySyncClose65" aria-label="Fechar">×</button></header>
<p id="librarySyncIntro65"></p>
<section id="librarySyncHost65" hidden>
 <div class="library-sync-actions66"><button type="button" id="librarySyncPrepare65">Conectar celular</button><button type="button" id="librarySyncFull66">Gerar ZIP completo</button></div>
 <div id="librarySyncCodeWrap65" hidden><span>No celular, digite este código</span><output id="librarySyncCode65"></output></div>
 <a id="librarySyncDownload65" hidden download>Baixar o pacote ZIP</a>
</section>
<form id="librarySyncJoin65" hidden><label for="librarySyncCodeInput65">Código exibido no PC</label><div class="library-sync-code-input"><input id="librarySyncCodeInput65" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="0000" required><button type="submit">Conectar</button></div></form>
<section id="librarySyncConfirm65" hidden>
 <strong id="librarySyncPackage65"></strong>
 <dl class="library-sync-summary66"><div><dt>Transferir</dt><dd id="librarySyncSend66"></dd></div><div><dt>Reaproveitar</dt><dd id="librarySyncReuse66"></dd></div></dl>
 <p id="librarySyncSaving66"></p>
 <p>A biblioteca ficará igual à do PC, incluindo nomes, ordem e exclusões. Os arquivos iguais serão reaproveitados. A atualização só será ativada após a conferência; uma falha mantém sua biblioteca atual.</p>
 <button type="button" id="librarySyncAccept65">Atualizar biblioteca</button>
</section>
<div class="library-sync-progress"><progress id="librarySyncProgress65" hidden></progress><p id="librarySyncStatus65" role="status" aria-live="polite"></p><small id="librarySyncDetail65"></small></div>
<footer><button type="button" id="librarySyncCancel65" hidden>Cancelar</button><button type="button" id="librarySyncFinish65" hidden>Concluir</button></footer>`;
document.body.append(dialog);
const labels={connecting:'Conectando os aparelhos…',code:'Aguardando o celular.',pairing:'Celular encontrado. Estabelecendo a conexão…',connected:'Aparelhos conectados.',inventory:'Comparando com os arquivos deste aparelho…',comparing:'Comparando as bibliotecas…',delta:'Preparando somente as novidades…',preparingDelta:'Preparando somente as novidades…',confirm:'Confira as novidades e confirme a atualização.',preparing:'Conferindo espaço no aparelho…',sending:'Enviando as novidades para o celular…',receiving:'Recebendo as novidades do PC…',validating:'Conferindo os arquivos recebidos…',checking:'Conferindo os arquivos recebidos…',importing:'Preparando a atualização…',extracting:'Descompactando os arquivos novos…',saving:'Salvando os arquivos novos…',reusing:'Reaproveitando os arquivos deste aparelho…',committing:'Ativando a biblioteca atualizada…',activating:'Ativando a biblioteca atualizada…'};
function status(text,error=false){$('librarySyncStatus65').textContent=text;$('librarySyncStatus65').classList.toggle('error',error);}
function setBusy(value){busy=value;for(const id of ['librarySyncPrepare65','librarySyncFull66'])$(id).disabled=value;for(const el of $('librarySyncJoin65').elements)el.disabled=value;$('librarySyncCancel65').hidden=!value;$('librarySyncClose65').disabled=value;$('librarySyncFinish65').hidden=value;window.dispatchEvent(new CustomEvent('nexus:sync-busy',{detail:{busy:value}}));}
function progress(p){
 const bar=$('librarySyncProgress65');bar.hidden=false;
 if(p.total){bar.max=p.total;bar.value=p.loaded||0;const count=/inventory|index|reusing|preparing-delta/.test(p.phase||'');$('librarySyncDetail65').textContent=count?(p.loaded||0)+' de '+p.total+' arquivos':format(p.loaded||0)+' de '+format(p.total);}
 else bar.removeAttribute('value');
 const speed=p.bytesPerSecond||p.speed;if(speed>0)$('librarySyncDetail65').textContent+=' · '+format(speed)+'/s';
 if(labels[p.phase])status(labels[p.phase]);
}
function releaseSnapshot(){const id=parentJob;parentJob=null;if(id)fetch('/api/library-sync66/'+encodeURIComponent(id)+'/release',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',keepalive:true}).catch(()=>{});}
function error(e,run=generation){if(run!==generation)return;releaseSnapshot();generation++;const previous=peer;peer=null;controller?.abort();previous?.cancel();setBusy(false);$('librarySyncConfirm65').hidden=$('librarySyncCodeWrap65').hidden=true;status(e.message||'Não foi possível sincronizar.',e.name!=='AbortError');$('librarySyncDetail65').textContent='A biblioteca só é substituída depois da conferência completa.';$('librarySyncProgress65').hidden=true;}
async function done(run){if(run!==generation)return;releaseSnapshot();$('librarySyncCancel65').hidden=true;$('librarySyncConfirm65').hidden=$('librarySyncCodeWrap65').hidden=true;$('librarySyncProgress65').hidden=true;$('librarySyncDetail65').textContent='';if(!desktop){try{window.JCIDBoards?.clearTemporaryCache();await window.NexusLibrary.refresh();await window.JCIDDesktop.whenReady();if(run===generation)status('Biblioteca atualizada. As novidades do PC já estão disponíveis.');}catch{if(run===generation)status('A biblioteca foi salva. Reabra o aplicativo para carregar a nova lista.');}}else status('Atualização recebida e confirmada pelo celular.');if(run===generation){generation++;peer=null;setBusy(false);}}
async function wait(ms,signal){await new Promise((resolve,reject)=>{if(signal.aborted)return reject(new DOMException('Cancelado','AbortError'));const abort=()=>{clearTimeout(id);reject(new DOMException('Cancelado','AbortError'));},id=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});}
async function request(url,options={}){const response=await fetch(url,{cache:'no-store',...options});let value;try{value=await response.json();}catch{throw Error('Atualize e reabra o aplicativo do PC para usar a sincronização por diferenças.');}if(!response.ok||value.state==='failed'||value.state==='error')throw Error(value.message||value.error||'Não foi possível preparar a biblioteca.');return value;}
async function poll(url,signal,onProgress=progress){while(true){const info=await request(url,{signal});if(info.state==='ready')return info.ready||info;onProgress({phase:'index',loaded:info.filesDone||0,total:info.filesTotal||0});await wait(600,signal);}}
async function payload(signal,run){await window.NexusReady;live(run);await window.NexusDurableDocuments?.flush();live(run);await window.NexusDurableDocuments?.migrateForExport?.({signal,onProgress:p=>{if(run===generation)progress(p);}});live(run);await window.NexusLibrary.refresh();live(run);const layout=window.NexusLibraryManager.snapshot();return{catalog:window.JCID_DEVICES,schematics:window.JCID_SCHEMATICS,layout,librarySnapshot:{version:1,id:'sync-'+crypto.randomUUID(),layout}};}
async function prepareDelta(inventory,{signal,onProgress}={},run){
 live(run);
 if(!parentJob)throw Error('Prepare a biblioteca novamente.');
 status('Preparando somente os arquivos que faltam no celular…');
 const job=await request('/api/library-sync66/'+encodeURIComponent(parentJob)+'/delta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({have:inventory.have}),signal});
 const result=await poll('/api/library-sync66/'+encodeURIComponent(job.id),signal,onProgress);live(run);
 const stats=result.stats||{};$('librarySyncDetail65').textContent=format(result.size)+' para transferir · '+(stats.filesReused||0)+' arquivos reaproveitados';return result;
}
function offer(meta){receiverMeta=meta;const stats=meta.stats||{};$('librarySyncPackage65').textContent='Atualização de '+format(meta.size);$('librarySyncSend66').textContent=(stats.filesSent??'?')+' arquivos';$('librarySyncReuse66').textContent=(stats.filesReused??0)+' arquivos';$('librarySyncSaving66').textContent=stats.filesSent===0?'Os mapas já estão atualizados. Apenas a organização e o índice serão sincronizados.':stats.filesReused>0?'Só os arquivos novos ou modificados serão transferidos.':'Primeira sincronização: os arquivos que ainda não estão neste aparelho serão transferidos.';$('librarySyncConfirm65').hidden=false;}
function createPeer(role,run){return libraryPeer66({role,onState:state=>{if(run!==generation||state.phase==='route')return;const label=state.phase==='preparing-delta'?'Preparando somente as novidades…':labels[state.phase];if(label)status(label);if(state.code){$('librarySyncCode65').textContent=state.code;$('librarySyncCodeWrap65').hidden=false;}$('librarySyncAccept65').disabled=state.phase!=='confirm';$('librarySyncAccept65').hidden=role==='host';if(role==='host'&&state.phase==='confirm')status('Aguardando a confirmação no celular.');},onProgress:p=>{if(run===generation)progress(p);},onOffer:meta=>{if(run===generation)offer(meta);},onDone:()=>done(run),onError:e=>error(e,run),receiverFactory:async(...args)=>(await import('./nexus-sync-storage65.js')).beginReceive65(...args),getInventory:async(...args)=>(await import('./nexus-sync-delta66.js')).getInventory66(...args),replaceLibrary:async(...args)=>(await import('./nexus-sync-delta66.js')).replaceDelta66(...args),prepareDelta:(inventory,options)=>prepareDelta(inventory,options,run)});}
async function prepare(full=false){if(busy||libraryBusy)return;const run=++generation;peer=null;parentJob=null;receiverMeta=null;setBusy(true);$('librarySyncCodeWrap65').hidden=$('librarySyncDownload65').hidden=$('librarySyncConfirm65').hidden=true;controller=new AbortController();const signal=controller.signal;try{
 status(full?'Preparando o ZIP completo…':'Conferindo a biblioteca do PC…');$('librarySyncProgress65').hidden=false;$('librarySyncProgress65').removeAttribute('value');
 const body=await payload(signal,run),base=full?'/api/library-export65':'/api/library-sync66';
 const job=await request(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});parentJob=full?null:job.id;
 const info=await poll(base+'/'+encodeURIComponent(job.id),signal,p=>{if(run===generation)progress(p);});live(run);$('librarySyncProgress65').hidden=true;
 if(full){const link=$('librarySyncDownload65');link.href=info.url;link.download=info.name||'NEXUS-BIBLIOTECA.zip';link.hidden=false;setBusy(false);status('ZIP completo pronto para baixar.');$('librarySyncDetail65').textContent=format(info.size);return;}
 $('librarySyncDetail65').textContent='O celular vai informar quais arquivos já possui.';peer=createPeer('host',run);await peer.host(info);
 }catch(e){error(e,run);}}
$('librarySyncPrepare65').addEventListener('click',()=>prepare());
$('librarySyncFull66').addEventListener('click',()=>prepare(true));
$('librarySyncJoin65').addEventListener('submit',async event=>{event.preventDefault();if(busy||libraryBusy)return;const run=++generation;receiverMeta=null;$('librarySyncConfirm65').hidden=true;setBusy(true);peer=createPeer('guest',run);try{await peer.join($('librarySyncCodeInput65').value.trim());}catch(e){error(e,run);}});
$('librarySyncAccept65').addEventListener('click',async()=>{if(!receiverMeta||!peer)return;const run=generation,active=peer;$('librarySyncAccept65').disabled=true;try{await window.NexusLibrary.ensureOffline();live(run);await active.accept();}catch(e){error(e,run);}});
function cancel(){controller?.abort();if(peer)peer.cancel();else error(new DOMException('Sincronização cancelada. A biblioteca anterior foi mantida.','AbortError'));}
$('librarySyncCancel65').addEventListener('click',cancel);$('librarySyncClose65').addEventListener('click',()=>{if(!busy)dialog.close();});$('librarySyncFinish65').addEventListener('click',()=>dialog.close());dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
async function open(){await window.NexusReady;if(libraryBusy)return;desktop=!!window.NexusDurableDocuments?.isAvailable?.();$('librarySyncHost65').hidden=!desktop;$('librarySyncJoin65').hidden=desktop;$('librarySyncIntro65').textContent=desktop?'Use o mesmo Wi-Fi no PC e no celular. A internet faz o pareamento; os arquivos seguem diretamente entre os aparelhos. No celular, abra Arquivos → Sincronizar com PC.':'No PC, abra Ajustes → Exportar → Conectar celular. Use o mesmo Wi-Fi e mantenha o aplicativo aberto nos dois aparelhos. Só as diferenças serão transferidas.';if(!busy){status('');$('librarySyncDetail65').textContent='';for(const id of ['librarySyncConfirm65','librarySyncProgress65','librarySyncCodeWrap65','librarySyncDownload65'])$(id).hidden=true;}dialog.showModal();}
window.NexusLibrarySync65=window.NexusLibrarySync66=Object.freeze({open,isBusy:()=>busy});
window.addEventListener('nexus:busy',event=>{libraryBusy=!!event.detail?.busy;for(const id of ['exportLibrary65','nexusSyncFromPc65'])if($(id))$(id).disabled=libraryBusy;});
await window.NexusReady;
const settings=$('organizeLibrary64');if(settings&&!$('exportLibrary65')){const button=document.createElement('button');button.id='exportLibrary65';button.type='button';button.textContent='Exportar';button.addEventListener('click',()=>{$('appearanceDialog').close();open();});settings.before(button);}
const mobileButton=document.createElement('button');mobileButton.id='nexusSyncFromPc65';mobileButton.type='button';mobileButton.textContent='Sincronizar com PC';mobileButton.addEventListener('click',()=>{$('nexusFilesDialog').close();open();});$('nexusAdd')?.parentElement?.append(mobileButton);
