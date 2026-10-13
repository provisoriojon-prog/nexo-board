import {importChosenFile as importFile} from './nexus-individual-ui61.js';
import {listPackages,removePackage} from './nexus-db.js';
await window.NexusReady;
const library=window.NexusLibrary,$=id=>document.getElementById(id),dialog=$('nexusFilesDialog');
let installPrompt=null,busy=false,controller,updating=false;
const updateButton=document.createElement('button');updateButton.type='button';updateButton.id='nexusUpdate';updateButton.textContent='Atualizar app';$('nexusInstall').after(updateButton);
updateButton.addEventListener('click',async()=>{
 if(busy||updating)return;updating=true;updateButton.disabled=true;
 const previous=navigator.serviceWorker?.controller;message('Preparando o app offline…');
 try{await library.ensureOffline({update:true});await library.refresh();message('App pronto. Você pode importar o ZIP completo de uma vez.');if(previous){location.reload();return;}}
 catch(error){message(library?.readableError(error)||error.message,true);}
 finally{updating=false;await render();}
});
const size=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(n/1024**(n>=1024**3?3:2))+(n>=1024**3?' GB':' MB');
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
function installState(){const installed=standalone();$('nexusInstall').hidden=installed;$('nexusInstallHint').textContent=installed?'App instalado. Importe seus pacotes aqui.':/iPad|iPhone|iPod/.test(navigator.userAgent)?'Primeiro instale: no Safari, toque em Compartilhar → Adicionar à Tela de Início. Abra pelo novo ícone e importe o ZIP.':'Para abrir sem a barra de endereço, instale o app. Depois abra pelo novo ícone e importe o ZIP.';}
async function render(){
 const list=$('nexusPackages');list.replaceChildren();
 for(const record of (await listPackages()).sort((a,b)=>(b.lastImportedAt||b.createdAt)-(a.lastImportedAt||a.createdAt))){
  const row=document.createElement('div'),description=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small'),button=document.createElement('button');row.className='nexus-package';name.textContent=record.manifest.label;detail.textContent=size(record.manifest.bytes)+(record.status==='ready'?' · Disponível neste aparelho':' · Importação incompleta');description.append(name,detail);button.type='button';button.textContent='Remover';button.disabled=busy;
  button.addEventListener('click',async()=>{if(!confirm('Remover “'+record.manifest.label+'” deste aparelho? Você poderá importar o ZIP novamente.'))return;button.disabled=true;try{const remove=async()=>removePackage(record.id);if(navigator.locks)await navigator.locks.request('nexus-library-write',remove);else await remove();await library.refresh();await render();message('Pacote removido deste aparelho.');}catch(e){message(e.message,true);button.disabled=false;}});row.append(description,button);list.append(row);
 }
 if(!list.childElementCount){const empty=document.createElement('p');empty.className='nexus-empty';empty.textContent='A prévia do iPhone 11 já está disponível. Adicione um pacote ZIP ou uma placa .sbnx para ampliar sua biblioteca.';list.append(empty);}
 const estimate=await navigator.storage?.estimate?.();$('nexusStorage').textContent=estimate?.quota?size(estimate.usage||0)+' usados · '+size(Math.max(0,estimate.quota-(estimate.usage||0)))+' disponíveis para o app':'';
 const state=library?.status();$('nexusOffline').textContent=state?.prepared?'Pronto para abrir offline':state?.error||'Preparando o app para abrir offline…';updateButton.textContent=state?.error?'Tentar novamente':'Atualizar app';updateButton.disabled=busy||updating;installState();
}
function message(text,error=false){$('nexusMessage').textContent=text;$('nexusMessage').classList.toggle('error',error);window.dispatchEvent(new CustomEvent('nexus:busy',{detail:{message:text,error,busy}}));}
function setBusy(value){busy=value;$('nexusAdd').disabled=$('nexusAddBoard').disabled=value;updateButton.disabled=value||updating;$('nexusCancel').hidden=!value;$('nexusProgressWrap').hidden=!value;for(const button of $('nexusPackages').querySelectorAll('button'))button.disabled=value;if(!value)window.dispatchEvent(new CustomEvent('nexus:busy',{detail:{busy:false}}));}
$('nexusFilesButton').addEventListener('click',()=>{dialog.showModal();render().catch(e=>message(e.message,true));});
$('nexusFilesClose').addEventListener('click',()=>{if(!busy)dialog.close();});dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('nexusAdd').addEventListener('click',()=>$('nexusFileInput').click());
$('nexusCancel').addEventListener('click',()=>{controller?.abort();message('Cancelando a importação…');});
$('nexusAddBoard').addEventListener('click',()=>$('nexusBoardFileInput').click());
async function importSelection(e){
 const files=[...e.target.files];e.target.value='';if(!files.length||busy)return;
 setBusy(true);controller=new AbortController();let completed=0;
 try{
  if(!library)throw Error('Não foi possível iniciar a biblioteca. Reabra o app.');
  message('Preparando a importação…');await library.ensureOffline({signal:controller.signal});
  for(const file of files){if(controller.signal.aborted)throw new DOMException('Cancelado','AbortError');const result=await importFile(file,{signal:controller.signal,onProgress:p=>{const progress=$('nexusProgress');if(p.total){progress.max=p.total;progress.value=p.loaded;}else progress.removeAttribute('value');$('nexusProgressLabel').textContent=p.phase==='checking'?'Conferindo '+file.name+'…':p.label.split('/').pop();message('Importando '+file.name+' · mantenha o app aberto.');}});completed++;await library.refresh();message(result.placement?'Placa importada em '+result.placement.modelLabel+' · '+result.placement.label+'.':result.duplicate?'Pacote já instalado. Seus mapas, esquemas e imagens foram selecionados novamente.':'Importação concluída. Os aparelhos já estão na lista.');}
 }catch(error){message(error.name==='AbortError'?'Importação cancelada.'+(completed?' Os pacotes concluídos foram mantidos.':''):library?.readableError(error)||error.message||'Não foi possível importar este ZIP.',error.name!=='AbortError');}
 finally{setBusy(false);controller=null;await render();}
}
for(const id of ['nexusFileInput','nexusBoardFileInput'])$(id).addEventListener('change',importSelection);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;installState();});
window.addEventListener('appinstalled',()=>{installPrompt=null;installState();});
$('nexusInstall').addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;}else message(/iPad|iPhone|iPod/.test(navigator.userAgent)?'No Safari: Compartilhar → Adicionar à Tela de Início.':'Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.');installState();});
window.addEventListener('nexus:offline',()=>{if(dialog.open)render().catch(()=>{});});
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
installState();
