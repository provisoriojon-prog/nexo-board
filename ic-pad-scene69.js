/* Values editor: the same physical copper/outline paths as the board, with its own camera. */
(() => {
 'use strict';
 const instances=new WeakMap(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const finiteBox=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[2]>=b[0]&&b[3]>=b[1];
 const median=a=>{a=a.filter(v=>v>0&&Number.isFinite(v)).sort((a,b)=>a-b);return a[Math.floor(a.length/2)]||1;};
 function create(host,{kind,onSelect}) {
  host.classList.add('ic-scene');
  const canvas=document.createElement('canvas');canvas.className='ic-scene-canvas';canvas.tabIndex=0;canvas.setAttribute('role','application');canvas.setAttribute('aria-label','Circuito: arraste para mover, use a roda ou dois dedos para ampliar. Enter edita o pad selecionado.');
  const empty=document.createElement('div');empty.className='ic-scene-empty';empty.textContent='Selecione um circuito no mapa para editar suas medições.';
  const hint=document.createElement('div');hint.className='ic-scene-hint';hint.textContent=matchMedia('(pointer:coarse)').matches?'Dois dedos para ampliar · arraste para mover':'Roda para ampliar · arraste para mover';
  const tip=document.createElement('div');tip.className='ic-scene-tip';tip.hidden=true;
  host.append(canvas,empty,hint,tip);
  const ctx=canvas.getContext('2d'),hit=document.createElement('canvas').getContext('2d');
  let context=null,drawing=null,pins=[],byId=new Map(),selected=null,related=new Set(),hover=null;
  let w=1,h=1,dpr=1,cx=0,cy=0,scale=1,base=1,fitted=true,orientation={rotation:0,mirrored:false,mirroredVertical:false},orientationKey='',pending=0,spacing=new Map(),pinSize=1,labels=[],screenPins=[],lastTouch=0;
  const pointers=new Map();let drag=null,pinch=null,gestureMulti=false;
  const cameras=new Map();
  function cameraKey(){return context?context.boardId+':'+context.componentId:null;}
  function remember(){const key=cameraKey();if(!key)return;cameras.delete(key);cameras.set(key,{cx,cy,scale,base,fitted,orientationKey});while(cameras.size>24)cameras.delete(cameras.keys().next().value);}
  function matrix(){const a=orientation.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),mx=orientation.mirrored?-1:1,my=orientation.mirroredVertical?-1:1;return {a:mx*c*scale,b:my*s*scale,c:mx*s*scale,d:-my*c*scale};}
  function project(x,y){const m=matrix();return{x:w/2+m.a*(x-cx)+m.c*(y-cy),y:h/2+m.b*(x-cx)+m.d*(y-cy)};}
  function world(x,y){const m=matrix(),det=m.a*m.d-m.b*m.c,dx=x-w/2,dy=y-h/2;return{x:cx+(m.d*dx-m.c*dy)/det,y:cy+(-m.b*dx+m.a*dy)/det};}
  function bounds(){const boxes=[drawing?.component.bbox,...pins.map(p=>p.bbox)].filter(finiteBox);return boxes.length?[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))]:[0,0,1,1];}
  function limits(){return {min:base*.45,max:Math.max(base*2,Math.min(base*180,230/pinSize))};}
  function fit(){if(!drawing)return;const b=bounds(),bw=b[2]-b[0]||1,bh=b[3]-b[1]||1,a=orientation.rotation*Math.PI/180,co=Math.abs(Math.cos(a)),si=Math.abs(Math.sin(a));cx=(b[0]+b[2])/2;cy=(b[1]+b[3])/2;base=Math.min(Math.max(30,w-44)/(co*bw+si*bh),Math.max(30,h-64)/(si*bw+co*bh));scale=base;fitted=true;remember();schedule();}
  function zoom(factor,x=w/2,y=h/2){if(!drawing)return;const before=world(x,y),l=limits();scale=clamp(scale*factor,l.min,l.max);const after=world(x,y);cx+=before.x-after.x;cy+=before.y-after.y;fitted=false;remember();schedule();}
  function orient(){const b=window.JCIDBoardView?.getState?.()||{},next={rotation:b.rotation||0,mirrored:!!b.mirrored,mirroredVertical:!!b.mirroredVertical},key=JSON.stringify(next);if(key===orientationKey)return false;orientation=next;orientationKey=key;if(drawing){const previous=scale/base,wasFitted=fitted;fit();if(!wasFitted){zoom(previous);reveal();}}return true;}
  function resize(){const r=canvas.getBoundingClientRect();if(r.width<2||r.height<2)return;const nw=r.width,nh=r.height,changed=Math.abs(w-nw)>.5||Math.abs(h-nh)>.5;w=nw;h=nh;dpr=window.NexusMobileLandscape91?.pixelRatio()||Math.min(2,devicePixelRatio||1);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}if(changed&&fitted)fit();else schedule();}
  function schedule(){if(!pending)pending=requestAnimationFrame(()=>{pending=0;draw();});}
  function padKind(p){return context?.classifier?.kind(p)||window.JCIDPadKinds.create(context.data,window.JCID_NC_DISPLAY).kind(p);}
  function buildSpacing(){spacing=new Map();pinSize=median(pins.map(p=>finiteBox(p.bbox)?Math.min(p.bbox[2]-p.bbox[0],p.bbox[3]-p.bbox[1]):0));for(const p of pins){let nearest=Infinity;for(const other of pins)if(p!==other){const d=Math.hypot(p.x-other.x,p.y-other.y);if(d>1e-7)nearest=Math.min(nearest,d);}spacing.set(p.id,Number.isFinite(nearest)?nearest:pinSize*2);}}
  function draw(){
   if(!host.isConnected||host.hidden)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#10181f';ctx.fillRect(0,0,w,h);labels=[];screenPins=[];
   hint.hidden=!drawing||!fitted;if(!drawing)return;const m=matrix(),appearance=window.JCIDBoardView.getAppearance(),stroke=drawing.outline;ctx.save();ctx.transform(m.a,m.b,m.c,m.d,w/2-m.a*cx-m.c*cy,h/2-m.b*cx-m.d*cy);ctx.lineJoin='round';ctx.lineCap='round';
   if(stroke?.hasArea){ctx.fillStyle='#19343e';ctx.fill(stroke.area);}
   for(const p of pins){const path=drawing.pinPaths.get(p.id);if(!path)continue;const pk=padKind(p);ctx.fillStyle=pk==='ground'?appearance.ground:pk==='nc'?appearance.nc:appearance.signal;ctx.fill(path);if(pk==='signal'&&(related.has(p.id)||p.id===selected)){ctx.save();ctx.clip(path);ctx.fillStyle=appearance.selectedPad;ctx.globalAlpha=.94;ctx.fill(path);ctx.restore();}ctx.strokeStyle=appearance.outline;ctx.lineWidth=.65/scale;ctx.stroke(path);if(p.hole>0){ctx.fillStyle='#10181f';ctx.beginPath();ctx.arc(p.x,p.y,p.hole/2,0,Math.PI*2);ctx.fill();}}
   if(stroke)for(const o of stroke.strokes){ctx.strokeStyle=o.orientation?appearance.orientation:appearance.outline;ctx.lineWidth=Math.max(o.width||0,(o.orientation?1.6:1)/scale);ctx.stroke(o.path);}
   const active=byId.get(selected);if(active){ctx.strokeStyle='#fff';ctx.lineWidth=1.5/scale;ctx.setLineDash([3/scale,2/scale]);ctx.stroke(drawing.pinPaths.get(active.id));ctx.setLineDash([]);}ctx.restore();
   // Only pad numbers belong on the drawing. Net and readings stay in the editor header.
   for(const p of pins){const at=project(p.x,p.y);if(at.x<-100||at.y<-100||at.x>w+100||at.y>h+100)continue;const b=p.bbox,size=finiteBox(b)?Math.min(b[2]-b[0],b[3]-b[1])*scale:pinSize*scale,room=(spacing.get(p.id)||pinSize)*scale*.88,pk=padKind(p);screenPins.push({id:p.id,x:at.x,y:at.y,kind:pk});
    if(size<11||room<12)continue;
    const number=String(p.name??p.id),font=clamp(Math.min(size*.25,room*.22),8,13),maxWidth=Math.min(300,Math.max(size,room));ctx.font=`500 ${font}px Segoe UI,Arial`;ctx.textAlign='center';ctx.textBaseline='middle';const width=ctx.measureText(number).width;if(width>maxWidth)continue;
    ctx.fillStyle='#10181fe6';ctx.fillRect(at.x-width/2-2,at.y-font/2-1,width+4,font+3);ctx.fillStyle='#eff6fc';ctx.fillText(number,at.x,at.y);labels.push({pinId:p.id,text:number,x:at.x,y:at.y,font,net:false});
   }
   canvas.dataset.zoom=(scale/base).toFixed(3);canvas.dataset.component=String(context.componentId);canvas.dataset.padCount=String(pins.length);
  }
  function selectAt(x,y){const p=pick(x,y);if(p&&padKind(p)==='signal')onSelect(p.id);}
  function pick(x,y){if(!drawing)return null;const at=world(x,y);let best=null,area=Infinity;for(const p of pins){const path=drawing.pinPaths.get(p.id);if(path&&hit.isPointInPath(path,at.x,at.y)){const b=p.bbox,a=finiteBox(b)?(b[2]-b[0])*(b[3]-b[1]):1;if(a<area){best=p;area=a;}}}if(best)return best;let distance=matchMedia('(pointer:coarse)').matches?18:7;for(const p of pins){const s=project(p.x,p.y),d=Math.hypot(s.x-x,s.y-y);if(d<distance){best=p;distance=d;}}return best;}
  function position(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  function reveal(){const p=byId.get(selected);if(!p||!drawing)return;const at=project(p.x,p.y),margin=Math.min(45,w/4,h/4),x=clamp(at.x,margin,w-margin),y=clamp(at.y,margin,h-margin);if(Math.abs(x-at.x)>.5||Math.abs(y-at.y)>.5){const a=world(at.x,at.y),b=world(x,y);cx+=a.x-b.x;cy+=a.y-b.y;fitted=false;remember();schedule();}}
  function focusSelected(){const p=byId.get(selected);if(!p||!drawing)return;const b=p.bbox,diameter=finiteBox(b)?Math.min(b[2]-b[0],b[3]-b[1]):pinSize,l=limits();cx=p.x;cy=p.y;scale=clamp(Math.max(base,72/Math.max(diameter,1e-6),150/(spacing.get(p.id)||pinSize)),l.min,l.max);fitted=false;remember();schedule();}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==1)return;e.preventDefault();const p=position(e);canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,p);tip.hidden=true;if(e.pointerType==='touch')lastTouch=Date.now();if(pointers.size===1){drag={id:e.pointerId,start:p,last:p,moved:false};gestureMulti=false;}else if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};gestureMulti=true;drag=null;}});
  canvas.addEventListener('pointermove',e=>{const p=position(e);if(!pointers.has(e.pointerId)){if(e.pointerType!=='touch'){const found=pick(p.x,p.y);if(hover!==found?.id){hover=found?.id??null;}canvas.style.cursor=found&&padKind(found)==='signal'?'pointer':'grab';if(found){tip.hidden=false;tip.textContent='Pad '+found.name;tip.style.left=clamp(p.x+12,6,Math.max(6,w-220))+'px';tip.style.top=clamp(p.y+16,4,Math.max(4,h-42))+'px';}else tip.hidden=true;}return;}e.preventDefault();pointers.set(e.pointerId,p);if(pointers.size===2&&pinch){const [a,b]=[...pointers.values()],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance=Math.hypot(a.x-b.x,a.y-b.y),before=world(pinch.center.x,pinch.center.y);if(pinch.distance>0)zoom(distance/pinch.distance,center.x,center.y);const after=world(center.x,center.y);cx+=before.x-after.x;cy+=before.y-after.y;pinch={distance,center};fitted=false;remember();schedule();}else if(drag?.id===e.pointerId){if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>4)drag.moved=true;if(drag.moved){const a=world(drag.last.x,drag.last.y),b=world(p.x,p.y);cx+=a.x-b.x;cy+=a.y-b.y;fitted=false;remember();schedule();}drag.last=p;}});
  function end(e,cancel){if(!pointers.has(e.pointerId))return;const p=position(e),tap=!cancel&&!gestureMulti&&drag?.id===e.pointerId&&!drag.moved;pointers.delete(e.pointerId);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);pinch=null;drag=null;if(pointers.size===1){const [id,point]=[...pointers][0];drag={id,start:point,last:point,moved:true};}if(!pointers.size)gestureMulti=false;if(tap)selectAt(p.x,p.y);}
  canvas.addEventListener('pointerup',e=>end(e,false));canvas.addEventListener('pointercancel',e=>end(e,true));canvas.addEventListener('lostpointercapture',e=>end(e,true));canvas.addEventListener('pointerleave',()=>{hover=null;tip.hidden=true;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();const p=position(e);zoom(Math.exp(-clamp(e.deltaY,-200,200)*.0035),p.x,p.y);},{passive:false});
  canvas.addEventListener('dblclick',e=>{if(Date.now()-lastTouch<800)return;const p=position(e);zoom(1.7,p.x,p.y);});
  canvas.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.3);}else if(e.key==='-'){e.preventDefault();zoom(1/1.3);}else if(e.key==='0'||e.key==='Home'){e.preventDefault();fit();}else if(e.key==='Enter'&&selected!=null){e.preventDefault();onSelect(selected,true);}});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  const ro=new ResizeObserver(resize);ro.observe(host);
  function render(next,ids){const changed=context?.data!==next?.data||context?.componentId!==next?.componentId;let restored=false;if(changed){remember();context=next;const saved=cameras.get(cameraKey());drawing=next&&window.JCIDBoardView.getComponentDrawing(next.componentId);if(drawing?.data!==next?.data)drawing=null;pins=drawing?.pins||[];byId=new Map(pins.map(p=>[p.id,p]));selected=null;hover=null;buildSpacing();orient();if(drawing){fit();if(saved&&saved.orientationKey===orientationKey){cx=saved.cx;cy=saved.cy;scale=saved.scale;base=saved.base;fitted=saved.fitted;restored=true;remember();}}}else context=next;empty.hidden=!!drawing;canvas.hidden=!drawing;hint.hidden=!drawing;related=new Set(ids||[]);const old=selected;selected=next?.pinId??null;orient();resize();schedule();if(selected!==old&&!restored)requestAnimationFrame(reveal);}
  window.addEventListener('jcid:orientation',()=>{if(context){orient();schedule();}});window.addEventListener('jcid:appearance',schedule);
  const api={render,fit,focusSelected,zoom,resize,reveal,refresh:schedule,getState:()=>({componentId:context?.componentId,pinId:selected,pinIds:pins.map(p=>p.id),orientation:{...orientation},camera:{x:cx,y:cy,scale,base,zoom:scale/base},size:{width:w,height:h},labels:labels.map(l=>({...l})),pads:screenPins.map(p=>({...p})),related:[...related],bounds:bounds()}),project};instances.set(host,api);return api;
 }
 window.JCIDICPadScene=Object.freeze({create,forElement:element=>instances.get(element)});
})();
