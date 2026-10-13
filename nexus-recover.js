(()=>{
 const status=document.getElementById('recoveryStatus'),retry=document.getElementById('recoveryRetry'),open=document.getElementById('recoveryOpen');let busy=false;
 async function recover(){
  if(busy)return;busy=true;retry.hidden=true;open.hidden=true;status.textContent='Atualizando o suporte offline… mantenha esta página aberta.';let poll,timer,finished=false;
  try{
   if(!navigator.serviceWorker)throw Error('Abra esta página no Safari.');
   const work=(async()=>{
    const registration=await navigator.serviceWorker.register(new URL('nexus-sw.js',location.href),{scope:'./',updateViaCache:'none'});
    if(finished)return;
    // Registration may still expose the previous active worker during an update.
    // Only offer navigation after the controller confirms the redirect fix.
    await new Promise(resolve=>{let pending=false;const check=()=>{
     const worker=navigator.serviceWorker.controller;if(pending||finished||worker?.state!=='activated')return;
     pending=true;const channel=new MessageChannel();let deadline;
     const close=()=>{clearTimeout(deadline);channel.port1.close();channel.port2.close();pending=false;};
     channel.port1.onmessage=e=>{close();if(e.data?.safeNavigation===true&&!finished)resolve();};
     deadline=setTimeout(close,2000);worker.postMessage({type:'NEXUS_VERSION'},[channel.port2]);
    };poll=setInterval(check,400);check();});
   })();
   await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('A atualização demorou mais que o esperado. Confira a conexão e tente novamente.')),120000);})]);
   status.textContent='Atualização concluída. Seus arquivos foram mantidos.';open.hidden=false;
  }catch(e){status.textContent=e.message==='Abra esta página no Safari.'?e.message:'Não foi possível concluir a atualização. Confira a conexão e toque em Tentar novamente.';retry.hidden=false;}
  finally{finished=true;clearInterval(poll);clearTimeout(timer);busy=false;}
 }
 retry.addEventListener('click',recover);recover();
})();
