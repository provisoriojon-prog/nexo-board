(() => {
 'use strict';
 const $=id=>document.getElementById(id),settings=$('appearanceDialog');
 if(!settings||$('clearTemporary64'))return;
 const footer=document.createElement('div');footer.className='maintenance-actions';
 footer.innerHTML='<button id="clearTemporary64" type="button">Limpar dados temporários</button><button id="organizeLibrary64" type="button" aria-pressed="false">Organizar biblioteca</button><p id="maintenanceStatus64" role="status"></p>';
 settings.append(footer);
 const dialog=document.createElement('dialog');dialog.id='clearTemporaryDialog64';dialog.className='maintenance-dialog';
 dialog.setAttribute('aria-labelledby','clearTemporaryTitle64');
 dialog.innerHTML='<h2 id="clearTemporaryTitle64">Limpar dados temporários?</h2><p>Fecha as abas e descarta posições, seleções, listas Netcolor e alterações temporárias do Editor.</p><p class="maintenance-preserved">Seus mapas, pastas, esquemáticos, imagens, leituras salvas, notas e perfis serão mantidos. O app continuará disponível offline.</p><p id="clearTemporaryStatus64" role="status"></p><form method="dialog"><button type="submit" value="cancel">Cancelar</button><button type="button" id="confirmTemporary64">Limpar e reabrir</button></form>';
 document.body.append(dialog);
 let importing=false,cleaning=false;
 window.addEventListener('nexus:busy',event=>{importing=!!event.detail?.busy;});
 const blocked=()=>importing||window.NexusLibrarySync65?.isBusy()||window.NexusLibraryManager?.isSaving()||window.NexusBoardEditor?.isBusy()||document.body.classList.contains('board-loading')||!window.JCIDSession?.isReady()||window.JCIDSession?.isRestoring();
 $('clearTemporary64').addEventListener('click',()=>{
   $('maintenanceStatus64').textContent='';
   if(blocked()){$('maintenanceStatus64').textContent='Aguarde a operação atual terminar.';return;}
   $('clearTemporaryStatus64').textContent='';dialog.showModal();
 });
 $('confirmTemporary64').addEventListener('click',async()=>{
   if(cleaning)return;
   if(blocked()){$('clearTemporaryStatus64').textContent='Aguarde a operação atual terminar.';return;}
   cleaning=true;$('confirmTemporary64').disabled=true;
   try {
     await window.NexusDurableDocuments?.flush();
     window.JCIDSession.clearTemporaryState();
     // Reload releases decoded geometries, canvases, PDF/image caches and edit
     // history. Never clear IndexedDB, CacheStorage or the browser's storage.
     window.JCIDSession.restartClean();
   } catch(error) {
     $('clearTemporaryStatus64').textContent=error.message;
     cleaning=false;$('confirmTemporary64').disabled=false;
   }
 });
 $('organizeLibrary64').addEventListener('click',()=>{
   const manager=window.NexusLibraryManager;
   if(!manager){$('maintenanceStatus64').textContent='Aguarde a biblioteca terminar de abrir.';return;}
   if(blocked()){$('maintenanceStatus64').textContent='Aguarde a operação atual terminar.';return;}
   const before=manager.isActive();manager.toggle();
   if(manager.isActive()!==before)settings.close();
 });
 window.addEventListener('nexus:library-notice',event=>{if(event.detail?.error)$('maintenanceStatus64').textContent=event.detail.text;});
 window.addEventListener('nexus:library-editing',event=>{
   $('organizeLibrary64').setAttribute('aria-pressed',String(!!event.detail?.active));
   $('organizeLibrary64').textContent=event.detail?.active?'Concluir organização':'Organizar biblioteca';
 });
})();
