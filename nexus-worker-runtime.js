const CACHE='nexus-shell-'+VERSION,base=new URL('./',self.location.href),shell=new Set(FILES.map(f=>new URL(f,base).pathname));
// A followed redirect cannot be replayed for a navigation with redirect:manual.
// Keep the decoded body/headers, but not the network response's redirect history.
function replayable(response){
 if(!response.redirected)return response;
 const headers=new Headers(response.headers);headers.delete('Content-Encoding');headers.delete('Content-Length');headers.delete('Transfer-Encoding');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
async function shellResponse(response,path){
 if(!response.ok||response.type==='opaque'||response.type==='opaqueredirect')throw Error('Offline asset unavailable: '+path);
 if(/\.(js|json|css|pdf|wasm)$/.test(path)&&response.headers.get('Content-Type')?.includes('text/html'))throw Error('Offline asset redirected: '+path);
 const marker={'index.html':'id="boardCanvas"','esquema.html':'id="viewerTitle"','recuperar.html':'id="recoveryStatus"'}[path];
 if(marker&&!(await response.clone().text()).includes(marker))throw Error('Offline document is not the application: '+path);
 return replayable(response);
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);let next=0;
 await Promise.all(Array.from({length:4},async()=>{while(next<FILES.length){const path=FILES[next++],url=new URL(path,base),response=await fetch(url,{cache:'reload'});await cache.put(url,await shellResponse(response,path));}}));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('nexus-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='NEXUS_VERSION')event.ports[0]?.postMessage({version:VERSION,ready:true,safeNavigation:true});});
function blobResponse(blob,type,request){
 const size=blob.size,headers=new Headers({'Content-Type':type||blob.type||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}),range=request.headers.get('Range');let start=0,end=size-1,status=200;
 if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
  if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}else{const suffix=Number(match[2]);start=Math.max(0,size-suffix);}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
  status=206;headers.set('Content-Range',`bytes ${start}-${end}/${size}`);
 }
 headers.set('Content-Length',String(Math.max(0,end-start+1)));return new Response(request.method==='HEAD'?null:status===206?blob.slice(start,end+1,type):blob,{status,headers});
}
async function imported(request,url){
 try{const relative=url.pathname.slice(base.pathname.length+'__nexus_data__/'.length),parts=relative.split('/').map(decodeURIComponent),id=safeId(parts.shift()),path=safePath(parts.join('/'));const record=await getPackage(id);if(record?.status!=='ready'||!record.manifest.files.some(f=>f.path===path))return new Response('Arquivo não instalado.',{status:404});const file=await getFile(id,path);if(!file)return new Response('Arquivo não instalado.',{status:404});return blobResponse(file.blob,file.type,request);}catch{return new Response('Arquivo inválido.',{status:400});}
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||!['GET','HEAD'].includes(request.method))return;
 if(url.pathname.startsWith(base.pathname+'__nexus_data__/')){event.respondWith(imported(request,url));return;}
 if(url.pathname===base.pathname)url.pathname+='index.html';
 if(!shell.has(url.pathname))return;
 url.search='';url.hash='';event.respondWith((async()=>{const hit=await (await caches.open(CACHE)).match(url);if(!hit)return fetch(request);if(request.headers.has('Range')||request.method==='HEAD')return blobResponse(await hit.blob(),hit.headers.get('Content-Type'),request);return replayable(hit);})());
});
