import {adoptIndividualImport} from './library-manager64.js';
import {importFile} from './nexus-import.js';
import {describeIndividual,planIndividual} from './individual-package61.js';
import {ICON_LABELS,createFileIcon,inferIcon} from './file-icons61.js';
let pending=false;
const cancelled=()=>new DOMException('Importação cancelada.','AbortError');
export function chooseDestination({manifest,signal}){
 if(pending)return Promise.reject(Error('Conclua a importação atual antes de abrir outra placa.'));
 if(signal?.aborted)return Promise.reject(cancelled());
 const source=describeIndividual(manifest),catalog=window.JCID_DEVICES,models=catalog?.models||[];
 if(!models.length)return Promise.reject(Error('Importe primeiro um pacote ZIP para criar as pastas dos aparelhos.'));
 pending=true;
 return new Promise((resolve,reject)=>{
  const dialog=document.createElement('dialog');dialog.id='nexusIndividualDialog';dialog.className='nexus-individual-dialog';dialog.setAttribute('aria-labelledby','nexusIndividualTitle');
  dialog.innerHTML='<form><header><h2 id="nexusIndividualTitle">Importar placa <small>.sbnx</small></h2><button type="button" id="nexusIndividualClose" aria-label="Cancelar importação">×</button></header><div class="individual-fields"><label for="nexusIndividualFolder">Pasta</label><select id="nexusIndividualFolder" required></select><label for="nexusIndividualName">Nome do arquivo na pasta</label><input id="nexusIndividualName" maxlength="180" required autocomplete="off" spellcheck="false"><fieldset><legend>Ícone</legend><div id="nexusIndividualIcons" class="individual-icons"></div></fieldset><p id="nexusIndividualNotice" role="status" aria-live="polite"></p></div><footer><button type="button" id="nexusIndividualCancel">Cancelar</button><button type="submit" id="nexusIndividualSubmit">Importar</button></footer></form>';
  const $=id=>dialog.querySelector('#'+id),folder=$('nexusIndividualFolder'),name=$('nexusIndividualName'),notice=$('nexusIndividualNotice'),submit=$('nexusIndividualSubmit');let icon=inferIcon(source.item),done=false;
  for(const model of models){const group=document.createElement('optgroup');group.label=model.label;const root=new Option(model.label,model.id);root.dataset.model=model.id;root.dataset.group='';group.append(root);for(const key of new Set((model.children||[]).map(i=>i.group).filter(Boolean))){const item=model.children.find(i=>i.group===key),option=new Option(model.label+' / '+(item.groupLabel||key),model.id+'::'+key);option.dataset.model=model.id;option.dataset.group=key;group.append(option);}folder.append(group);}
  const original=models.find(m=>m.id===source.model.id)||models.find(m=>m.label.trim().toLowerCase()===source.model.label.trim().toLowerCase())||models.find(m=>m.id===window.JCID_ACTIVE_BOARD?.modelId)||models[0];
  folder.value=original.id;const sourceFolder=source.item.group?original.id+'::'+source.item.group:original.id;if([...folder.options].some(o=>o.value===sourceFolder))folder.value=sourceFolder;name.value=source.item.label;
  const options=()=>({modelId:folder.selectedOptions[0]?.dataset.model,group:folder.selectedOptions[0]?.dataset.group||'',label:name.value,icon});
  function update(){for(const b of $('nexusIndividualIcons').children)b.setAttribute('aria-pressed',String(b.dataset.individualIcon===icon));try{const plan=planIndividual(manifest,catalog,options());notice.classList.remove('error');notice.textContent=plan.mode==='replace'?'Já existe “'+plan.label+'” nesta pasta. Ele será substituído. Para manter os dois, use outro nome.':'O arquivo ficará na raiz da biblioteca, associado ao aparelho escolhido.';submit.textContent=plan.mode==='replace'?'Substituir arquivo':'Importar';submit.disabled=false;}catch(error){notice.textContent=error.message;notice.classList.add('error');submit.disabled=true;}}
  for(const[key,label]of Object.entries(ICON_LABELS)){const b=document.createElement('button');b.type='button';b.dataset.individualIcon=key;b.title=label;b.setAttribute('aria-label',label);const text=document.createElement('span');text.textContent=label;b.append(createFileIcon(key),text);b.addEventListener('click',()=>{icon=key;update();});$('nexusIndividualIcons').append(b);}
  const previous=document.activeElement;
  function finish(error,value){if(done)return;done=true;pending=false;signal?.removeEventListener('abort',abort);dialog.close();dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});error?reject(error):resolve(value);}
  const abort=()=>finish(cancelled());signal?.addEventListener('abort',abort,{once:true});
  dialog.addEventListener('cancel',e=>{e.preventDefault();e.stopPropagation();abort();});dialog.addEventListener('keydown',e=>e.stopPropagation());$('nexusIndividualClose').addEventListener('click',abort);$('nexusIndividualCancel').addEventListener('click',abort);
  folder.addEventListener('change',update);name.addEventListener('input',update);dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();try{const value=options(),plan=planIndividual(manifest,catalog,value);finish(null,{...value,replace:plan.mode==='replace'});}catch(error){notice.textContent=error.message;notice.classList.add('error');}});
  document.body.append(dialog);update();dialog.showModal();folder.focus({preventScroll:true});
 });
}
export async function importChosenFile(file,options={}){let result=await importFile(file,{...options,chooseDestination});if(result.placement){await adoptIndividualImport(result.placement);if(window.NexusDurableDocuments?.isAvailable())result=await window.NexusDurableDocuments.importIndividual(result,{signal:options.signal,onProgress:options.onProgress});}return result;}
