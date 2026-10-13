(() => {
 'use strict';
 let loading,active=false;
 const base=new URL('.',document.currentScript.src),queue=new Map();
 const metrics={renders:0,reused:0,cancelled:0,detailRenders:0,detailPixels:0};
 function prepare(){
  if(!loading)loading=import(new URL('vendor/pdfjs/pdf.min.js',base).href).then(pdf=>{
   pdf.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.min.js',base).href;
   return pdf.getDocument({url:new URL(window.JCID_CURRENT_SCHEMATIC.pdf,base).href,standardFontDataUrl:new URL('vendor/pdfjs/standard_fonts/',base).href,cMapUrl:new URL('vendor/pdfjs/cmaps/',base).href,cMapPacked:true,iccUrl:new URL('vendor/pdfjs/iccs/',base).href,wasmUrl:new URL('vendor/pdfjs/wasm/',base).href,disableFontFace:true,useSystemFonts:false,isEvalSupported:false,verbosity:0}).promise;
  });
  return loading;
 }
 async function drain(){
  if(active)return;active=true;
  try{while(queue.size){const [key,job]=[...queue].sort((a,b)=>a[1].priority()-b[1].priority())[0];queue.delete(key);await job.paint();}}
  finally{active=false;}
 }
 function create(number,width,onError,initialPriority=0){
  const element=document.createElement('canvas');element.setAttribute('aria-label',window.JCID_CURRENT_SCHEMATIC.title+', página '+number);element.setAttribute('role','img');
  let disposed=false,timer=0,generation=0,task=null,page=null,renderedWidth=0,wantedWidth=0,priority=initialPriority,painting=null;
  const detail=document.createElement('canvas');detail.className='pdf-detail';detail.hidden=true;detail.setAttribute('aria-hidden','true');
  let detailTimer=0,detailGeneration=0,detailTask=null,detailPainting=null,detailCrop=null,wantedCrop=null,detailPaused=false;
  async function paint(ticket,pixels){
   if(disposed||ticket!==generation)return;
   let buffer=null;
   try{
    const doc=await prepare();if(disposed||ticket!==generation)return;
    page=await doc.getPage(number);if(disposed||ticket!==generation)return;
    const native=page.getViewport({scale:1}),scale=Math.min(pixels/native.width,Math.sqrt(6000000/(native.width*native.height))),viewport=page.getViewport({scale});buffer=document.createElement('canvas');
    buffer.width=Math.ceil(viewport.width);buffer.height=Math.ceil(viewport.height);
    task=page.render({canvas:buffer,canvasContext:buffer.getContext('2d'),viewport,background:'rgb(255,255,255)'});metrics.renders++;
    await task.promise;
    if(disposed||ticket!==generation)return;
    element.width=buffer.width;element.height=buffer.height;element.getContext('2d').drawImage(buffer,0,0);renderedWidth=pixels;element.dataset.ready='true';element.dispatchEvent(new Event('pdfpagepaint'));
   }catch(error){if(error.name==='RenderingCancelledException')metrics.cancelled++;else if(!disposed&&ticket===generation)onError(error);}
   finally{task=null;if(buffer)buffer.width=buffer.height=1;}
  }
  function cancelDetail(hide=false){detailGeneration++;clearTimeout(detailTimer);detailTimer=0;queue.delete(detail);detailTask?.cancel();wantedCrop=null;if(hide){detail.hidden=true;detailCrop=null;detail.width=detail.height=1;}}
  function positionDetail(crop){Object.assign(detail.style,{left:crop.x+'px',top:crop.y+'px',width:crop.width+'px',height:crop.height+'px'});}
  async function paintDetail(ticket,crop){
   let buffer=null;
   try{
    const doc=await prepare();if(disposed||ticket!==detailGeneration)return;
    const source=await doc.getPage(number);if(disposed||ticket!==detailGeneration)return;
    const native=source.getViewport({scale:1}),ratio=Math.min(2,devicePixelRatio||1,Math.sqrt(2500000/(crop.width*crop.height))),viewport=source.getViewport({scale:crop.displayWidth/native.width*ratio});
    buffer=document.createElement('canvas');buffer.width=Math.ceil(crop.width*ratio);buffer.height=Math.ceil(crop.height*ratio);
    detailTask=source.render({canvas:buffer,canvasContext:buffer.getContext('2d'),viewport,transform:[1,0,0,1,-crop.x*ratio,-crop.y*ratio],background:'rgb(255,255,255)'});metrics.detailRenders++;metrics.detailPixels=Math.max(metrics.detailPixels,buffer.width*buffer.height);
    await detailTask.promise;if(disposed||ticket!==detailGeneration)return;
    detail.width=buffer.width;detail.height=buffer.height;detail.getContext('2d').drawImage(buffer,0,0);detailCrop=crop;positionDetail(crop);
    if(element.parentNode)element.after(detail);detail.hidden=false;detail.dataset.ready='true';
   }catch(error){if(error.name==='RenderingCancelledException')metrics.cancelled++;}
   finally{detailTask=null;if(buffer)buffer.width=buffer.height=1;}
  }
  function resizeDetail(displayWidth,view){
   // Retain already-painted pixels while gliding; prepare one sharp viewport at rest.
   if(detailCrop&&detailCrop.displayWidth!==displayWidth){const ratio=displayWidth/detailCrop.displayWidth;positionDetail({x:detailCrop.x*ratio,y:detailCrop.y*ratio,width:detailCrop.width*ratio,height:detailCrop.height*ratio});}
   if(view?.moving){if(!detailPaused){cancelDetail();detailPaused=true;}return;}
   detailPaused=false;
   const basePixelWidth=view?Math.min(3000,Math.sqrt(6000000*displayWidth/view.pageHeight)):3000;
   if(!view||displayWidth*Math.min(2,devicePixelRatio||1)<=basePixelWidth||view.x>=displayWidth||view.y>=view.pageHeight||view.x+view.width<=0||view.y+view.height<=0){if(wantedCrop||detailCrop)cancelDetail(true);return;}
   const margin=120,x=Math.max(0,view.x-margin),y=Math.max(0,view.y-margin),right=Math.min(displayWidth,view.x+view.width+margin),bottom=Math.min(view.pageHeight,view.y+view.height+margin);
   if(right<=x||bottom<=y)return;
   const crop={x,y,width:right-x,height:bottom-y,displayWidth};
   // Keep a valid old crop aligned with the PDF while a new sharp crop is prepared.
   if(detailCrop&&detailCrop.displayWidth!==displayWidth){const ratio=displayWidth/detailCrop.displayWidth;positionDetail({x:detailCrop.x*ratio,y:detailCrop.y*ratio,width:detailCrop.width*ratio,height:detailCrop.height*ratio});}
   const same=wantedCrop&&Math.abs(wantedCrop.displayWidth-displayWidth)<.5&&Math.abs(wantedCrop.x-x)<16&&Math.abs(wantedCrop.y-y)<16&&Math.abs(wantedCrop.width-crop.width)<16&&Math.abs(wantedCrop.height-crop.height)<16;
   if(same)return;
   cancelDetail();wantedCrop=crop;const ticket=detailGeneration;
   detailTimer=setTimeout(()=>{queue.set(detail,{priority:()=>priority-1,paint:()=>{detailPainting=paintDetail(ticket,crop);return detailPainting;}});void drain();},140);
  }
  function resize(displayWidth,view){
   resizeDetail(displayWidth,view);
   const pixels=Math.max(160,Math.min(3000,Math.round(displayWidth*Math.min(2,devicePixelRatio||1))));
   if(pixels===wantedWidth)return;
   wantedWidth=pixels;generation++;clearTimeout(timer);queue.delete(element);task?.cancel();
   if(renderedWidth&&pixels<=renderedWidth*1.08){metrics.reused++;return;}
   const ticket=generation;
   const enqueue=()=>{queue.set(element,{priority:()=>priority,paint:()=>{painting=paint(ticket,pixels);return painting;}});void drain();};
   if(renderedWidth)timer=setTimeout(enqueue,120);else enqueue();
  }
  function suspend(){generation++;clearTimeout(timer);queue.delete(element);task?.cancel();wantedWidth=0;cancelDetail(true);}
  function destroy(){disposed=true;suspend();Promise.allSettled([painting,detailPainting]).then(()=>{if(page)page.cleanup();});element.width=element.height=1;detail.remove();}
  resize(width);return {element,resize,destroy,suspend,getBytes:()=>4*(element.width*element.height+detail.width*detail.height),setPriority:value=>{priority=value;}};
 }
 window.JCIDPdfPages=Object.freeze({create,prepare,getMetrics:()=>({...metrics,queued:queue.size,rendering:active})});
})();
