/* Real-copper topology. Geometry remains read-only; all synthetic joins carry proof. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.NexusStudyTopology79=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const EPS=1e-7,TAU=Math.PI*2,ORDER=[12,40,41,42,43,44,45,46,47,13],cache=new WeakMap();
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],dot=(a,b)=>a[0]*b[0]+a[1]*b[1],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
 function projectSegment(p,a,b){const v=sub(b,a),t=clamp(dot(sub(p,a),v)/(dot(v,v)||1));return{point:lerp(a,b,t),t};}
 function nearSegments(a,b,c,d){
  const u=sub(b,a),v=sub(d,c),den=cross(u,v),out=[];
  if(Math.abs(den)>1e-14){const w=sub(c,a),t=cross(w,v)/den,s=cross(w,u)/den;if(t>=0&&t<=1&&s>=0&&s<=1)out.push({t,s,d:0});}
  for(const [p,t]of [[a,0],[b,1]]){const r=projectSegment(p,c,d);out.push({t,s:r.t,d:dist(p,r.point)});}
  for(const [p,s]of [[c,0],[d,1]]){const r=projectSegment(p,a,b);out.push({t:r.t,s,d:dist(p,r.point)});}
  return out.sort((a,b)=>a.d-b.d);
 }
 function arcInfo(r){const start=Math.atan2(r[3]-r[1],r[2]-r[0]),end=Math.atan2(r[5]-r[1],r[4]-r[0]);return{start,delta:((end-start+Math.PI*3)%TAU)-Math.PI};}
 function evaluate(piece,t){if(piece.sourceKind==='segment')return lerp(piece.points[0],piece.points.at(-1),t);if(t===0)return piece.points[0];if(t===1)return piece.points.at(-1);const a=piece.start+piece.delta*t;return[piece.raw[0]+piece.raw[6]*Math.cos(a),piece.raw[1]+piece.raw[6]*Math.sin(a)];}
 function projectPiece(piece,p,low=0,high=1){
  if(piece.sourceKind==='segment'){const q=projectSegment(p,piece.points[0],piece.points.at(-1));q.t=clamp(q.t,low,high);q.point=evaluate(piece,q.t);return q;}
  const angle=Math.atan2(p[1]-piece.raw[1],p[0]-piece.raw[0]),candidates=[low,high];
  if(Math.abs(piece.delta)>1e-14)for(let k=-2;k<=2;k++)candidates.push(clamp((angle+TAU*k-piece.start)/piece.delta,low,high));
  let result=null;for(const t of candidates){const point=evaluate(piece,t),d=dist(point,p);if(!result||d<result.d)result={t,point,d};}return result;
 }
 function bounds(points,pad=0){return[Math.min(...points.map(p=>p[0]))-pad,Math.min(...points.map(p=>p[1]))-pad,Math.max(...points.map(p=>p[0]))+pad,Math.max(...points.map(p=>p[1]))+pad];}
 const overlaps=(a,b)=>a[0]<=b[2]+EPS&&a[2]+EPS>=b[0]&&a[1]<=b[3]+EPS&&a[3]+EPS>=b[1];
 function samples(piece){
  if(piece.sourceKind==='segment')return[{t:0,p:piece.points[0]},{t:1,p:piece.points[1]}];
  // Chord error is bounded. Contacts are subsequently proved against the exact arc.
  const error=Math.max(1e-4,Math.min(.5,Math.max(piece.width,0.01)/64)),step=2*Math.acos(clamp(1-error/piece.raw[6],-1,1)),count=Math.max(2,Math.min(1024,Math.ceil(Math.abs(piece.delta)/Math.max(.001,step))));
  return Array.from({length:count+1},(_,i)=>({t:i/count,p:evaluate(piece,i/count)}));
 }
 function shapeProject(shape,point){
  const w=+shape.width,h=+shape.height;if(!(w>0&&h>0&&Number.isFinite(shape.x)&&Number.isFinite(shape.y)))return null;
  const a=(shape.angle||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=point[0]-shape.x,dy=point[1]-shape.y,p=[dx*c+dy*s,-dx*s+dy*c],ax=w/2,ay=h/2;let q;
  if(shape.kind==='circle'){const r=ax,n=Math.hypot(...p);q=n<=r?p:p.map(v=>v*r/n);}
  else if(shape.kind==='rect')q=[clamp(p[0],-ax,ax),clamp(p[1],-ay,ay)];
  else if(shape.kind==='roundrect'||shape.kind==='oval'){
   const r=shape.kind==='oval'?Math.min(ax,ay):clamp(+shape.radius||0,0,Math.min(ax,ay)),base=[clamp(p[0],-ax+r,ax-r),clamp(p[1],-ay+r,ay-r)],v=sub(p,base),n=Math.hypot(...v);q=n<=r?p:[base[0]+v[0]*r/n,base[1]+v[1]*r/n];
  }else if(shape.kind==='diamond'||shape.kind==='octagon'){
   const k=Math.min(w,h)*(1-1/Math.SQRT2),poly=shape.kind==='diamond'?[[0,-ay],[ax,0],[0,ay],[-ax,0]]:[[-ax+k,-ay],[ax-k,-ay],[ax,-ay+k],[ax,ay-k],[ax-k,ay],[-ax+k,ay],[-ax,ay-k],[-ax,-ay+k]];
   let inside=true,best=null;for(let i=0;i<poly.length;i++){const b=poly[(i+1)%poly.length],a=poly[i];if(cross(sub(b,a),sub(p,a))<-EPS)inside=false;const r=projectSegment(p,a,b),d=dist(r.point,p);if(!best||d<best.d)best={point:r.point,d};}q=inside?p:best.point;
  }else return null;
  return[shape.x+q[0]*c-q[1]*s,shape.y+q[0]*s+q[1]*c];
 }
 function shapeBounds(shape){const w=+shape.width,h=+shape.height,a=(shape.angle||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return bounds([[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(p=>[shape.x+p[0]*c-p[1]*s,shape.y+p[0]*s+p[1]*c]));}
 function build(D,netId,options={}){
  if(!D||netId===undefined||netId===null)return{netId,nodes:[],edges:[],pinNodes:new Map(),sourcePieces:[],stats:{}};
  let memo=cache.get(D);if(!memo||memo.revision!==D.nexusRevision){memo={revision:D.nexusRevision,nets:new Map(),variants:new WeakMap()};cache.set(D,memo);}let netCache=memo.nets;if(Array.isArray(options.viewTransitions)){if(!memo.variants.has(options.viewTransitions))memo.variants.set(options.viewTransitions,new Map());netCache=memo.variants.get(options.viewTransitions);}if(netCache.has(netId))return netCache.get(netId);
  const sourcePieces=[],seen=new Set(),joins=[],padContacts=[],nodes=[],edges=[],pinNodes=new Map(),nodeLookup=new Map(),edgeLookup=new Set();let candidates=0;
  const boards=D.boards||[],scoped=boards.length>0,owners=D.nexusGeometry?.owners,partMap=new Map((D.components||[]).map(c=>[c.id,c]));
  function atView(point){const found=boards.filter(b=>Array.isArray(b.bbox)&&point[0]>=b.bbox[0]-EPS&&point[0]<=b.bbox[2]+EPS&&point[1]>=b.bbox[1]-EPS&&point[1]<=b.bbox[3]+EPS);if(found.length===1)return String(found[0].id);return null;}
  const validView=v=>v!==null&&v!==undefined&&boards.some(b=>String(b.id)===String(v))?String(v):null;
  const sameView=(a,b)=>!scoped||a!==null&&a===b;
  function pinView(pin){if(D.nexusGeometry)return validView(owners?.pins?.[pin.id]);return validView(partMap.get(pin.part)?.view)??atView([pin.x,pin.y]);}
  function addPiece(layer,raw,sourceKind,sourceIndex){
   const isArc=sourceKind==='arc',count=isArc?7:4;if(!raw.slice(0,count).every(Number.isFinite)||isArc&&!(raw[6]>0))return;
   const points=isArc?[[raw[2],raw[3]],[raw[4],raw[5]]]:[[raw[0],raw[1]],[raw[2],raw[3]]],width=Math.max(0,+raw[isArc?7:4]||0),viewId=D.nexusGeometry?validView(owners?.[isArc?'arcs':'segments']?.[layer]?.[sourceIndex]):atView(lerp(points[0],points[1],.5)),key=viewId+':'+layer+':'+sourceKind+':'+(isArc?raw.slice(0,2).concat(raw[6]):[]).join(',')+':'+[JSON.stringify(points),JSON.stringify(points.slice().reverse())].sort()[0]+':'+width;
   if(seen.has(key))return;seen.add(key);const piece={id:sourcePieces.length,netId,net:netId,layer,viewId,sourceKind,sourceIndex,raw,points,width,cuts:[0,1],...isArc?arcInfo(raw):{}};piece.samples=samples(piece);piece.points=piece.samples.map(x=>x.p);piece.bbox=bounds(piece.points,width/2+.5);sourcePieces.push(piece);
  }
  for(const l of D.layers||[]){for(const [i,r]of(l.segments||[]).entries())if(r[5]===netId)addPiece(l.id,r,'segment',i);for(const [i,r]of(l.arcs||[]).entries())if(r[8]===netId)addPiece(l.id,r,'arc',i);}
  const cut=(p,t)=>{const found=p.cuts.find(v=>Math.abs(t-v)<1e-10);if(found!==undefined)return found;p.cuts.push(t);return t;};
  // Junctions are accepted only after exact centerline distance proves that the
  // two physical copper strokes overlap, on the same layer and the same net.
  for(let i=0;i<sourcePieces.length;i++)for(let j=i+1;j<sourcePieces.length;j++){
   const a=sourcePieces[i],b=sourcePieces[j];if(a.layer!==b.layer||!sameView(a.viewId,b.viewId)||!overlaps(a.bbox,b.bbox))continue;const radius=(a.width+b.width)/2,contacts=[];
   for(let x=1;x<a.samples.length;x++)for(let y=1;y<b.samples.length;y++){
    const aa=a.samples[x-1],ab=a.samples[x],ba=b.samples[y-1],bb=b.samples[y];if(!overlaps(bounds([aa.p,ab.p],radius+.5),bounds([ba.p,bb.p],.5)))continue;
    for(const near of nearSegments(aa.p,ab.p,ba.p,bb.p).slice(0,3)){
     if(near.d>radius+1)continue;candidates++;let t=aa.t+(ab.t-aa.t)*near.t,s=ba.t+(bb.t-ba.t)*near.s;
     for(let k=0;k<6;k++){t=projectPiece(a,evaluate(b,s),aa.t,ab.t).t;s=projectPiece(b,evaluate(a,t),ba.t,bb.t).t;}
     const p=evaluate(a,t),q=evaluate(b,s),separation=dist(p,q);if(separation>radius+EPS)continue;
     if(contacts.some(c=>dist(c.p,p)<1e-5&&dist(c.q,q)<1e-5))continue;contacts.push({p,q});t=cut(a,t);s=cut(b,s);joins.push({a:a.id,b:b.id,t,s,proof:{kind:'stroke-overlap',distance:separation,radius}});
    }
   }
  }
  const order=Array.isArray(D.physicalLayers)&&D.physicalLayers.length?D.physicalLayers:ORDER,pins=(D.pins||[]).filter(p=>p.net===netId&&Number.isFinite(p.x)&&Number.isFinite(p.y));
  function span(pin){const a=order.indexOf(pin.startLayer),b=order.indexOf(pin.endLayer);return a>=0&&b>=0?order.slice(Math.min(a,b),Math.max(a,b)+1):null;}
  // Project onto pad copper, not its rectangular bounds. An interior hit splits
  // the source primitive, including contacts caused by its nonzero trace width.
  for(const pin of pins){const allowed=span(pin);
   for(const [shapeIndex,shape]of(pin.copper||[]).entries()){
    const center=[shape.x,shape.y];if(!shapeProject(shape,center))continue;const box=shapeBounds(shape);
    for(const piece of sourcePieces){if(!sameView(pinView(pin),piece.viewId)||allowed&&!allowed.includes(piece.layer)||!overlaps(box,piece.bbox))continue;let best=null;
     for(let k=1;k<piece.samples.length;k++){
      const lo=piece.samples[k-1].t,hi=piece.samples[k].t,initial=[lo,hi,projectPiece(piece,center,lo,hi).t];
      for(let t of initial){let q;for(let step=0;step<8;step++){q=shapeProject(shape,evaluate(piece,t));t=projectPiece(piece,q,lo,hi).t;}
       const p=evaluate(piece,t);q=shapeProject(shape,p);const d=dist(p,q);if(!best||d<best.distance)best={t,p,q,distance:d};
      }
     }
     if(best&&best.distance<=piece.width/2+EPS)padContacts.push({pin,shape,shapeIndex,piece,t:cut(piece,best.t),point:best.q,proof:{kind:'pad-stroke-overlap',distance:best.distance,radius:piece.width/2}});
    }
   }
  }
  function node(point,layer,extra={}){const key=String(layer)+':'+(extra.scope??extra.viewId??'')+':'+point.join(',')+':'+(extra.pinId===undefined?'':extra.pinId+':'+(extra.shapeIndex??''));if(nodeLookup.has(key))return nodeLookup.get(key);const id=nodes.length;nodes.push({id,point,x:point[0],y:point[1],layer,edges:[],...extra});nodeLookup.set(key,id);return id;}
  function edge(a,b,points,kind,metadata={}){if(a===b)return null;const key=[Math.min(a,b),Math.max(a,b),kind,...(metadata.sourceIds||[])].join(':');if(edgeLookup.has(key))return null;edgeLookup.add(key);let length=0;for(let i=1;i<points.length;i++)length+=dist(points[i-1],points[i]);const id=edges.length,e={id,a,b,points,length,kind,drawable:kind==='track',layer:nodes[a].layer,netId,sourceIds:[],...metadata};edges.push(e);nodes[a].edges.push(id);nodes[b].edges.push(id);return e;}
  const pieceNode=(piece,t)=>node(evaluate(piece,t),piece.layer,{viewId:piece.viewId,scope:scoped&&piece.viewId===null?'unknown-piece-'+piece.id:piece.viewId});
  for(const piece of sourcePieces){piece.cuts.sort((a,b)=>a-b);for(let i=1;i<piece.cuts.length;i++){const from=piece.cuts[i-1],to=piece.cuts[i];if(to-from<1e-12)continue;const points=[evaluate(piece,from),...piece.samples.filter(s=>s.t>from&&s.t<to).map(s=>s.p),evaluate(piece,to)];edge(pieceNode(piece,from),pieceNode(piece,to),points,'track',{sourceIds:[piece.id],sourceKind:piece.sourceKind,sourceIndex:piece.sourceIndex,viewId:piece.viewId,raw:piece.raw,width:piece.width,t0:from,t1:to,proof:{kind:'source-subdivision'}});}}
  for(const join of joins){const a=sourcePieces[join.a],b=sourcePieces[join.b],p=evaluate(a,join.t),q=evaluate(b,join.s);edge(pieceNode(a,join.t),pieceNode(b,join.s),[p,q],'contact',{sourceIds:[a.id,b.id],proof:join.proof});}
  const hubs=new Map();
  for(const contact of padContacts){const {pin,shape,shapeIndex,piece}=contact,key=pin.id+':'+piece.layer+':'+shapeIndex;let hub=hubs.get(key);
   if(hub===undefined){const center=[pin.x,pin.y],q=shapeProject(shape,center),point=dist(center,q)<EPS?center:[shape.x,shape.y];hub=node(point,piece.layer,{pinId:pin.id,shapeIndex,viewId:pinView(pin)});hubs.set(key,hub);if(!pinNodes.has(pin.id))pinNodes.set(pin.id,[]);pinNodes.get(pin.id).push(hub);}
   const point=evaluate(piece,contact.t);edge(hub,pieceNode(piece,contact.t),[nodes[hub].point,contact.point,point],'pad',{pinId:pin.id,shapeIndex,sourceIds:[piece.id],proof:contact.proof});
  }
  for(const pin of pins){const ids=pinNodes.get(pin.id)||[];
   // Multiple copper shapes on the same pad are not blindly shorted; connect
   // only shapes containing the physical terminal center, which proves overlap.
   for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const a=nodes[ids[i]],b=nodes[ids[j]],sameLayer=a.layer===b.layer,knownVia=pin.via&&span(pin);if(!sameLayer&&!knownVia)continue;if(dist(a.point,[pin.x,pin.y])>EPS||dist(b.point,[pin.x,pin.y])>EPS)continue;edge(a.id,b.id,[a.point,b.point],sameLayer?'pad':'via',{pinId:pin.id,proof:{kind:sameLayer?'shared-pad-copper':'known-via-span',span:span(pin)},drawable:false});}
   if(!ids.length){const allowed=span(pin),id=node([pin.x,pin.y],allowed?.length===1?allowed[0]:null,{pinId:pin.id,viewId:pinView(pin),isolated:true});pinNodes.set(pin.id,[id]);}
  }
  const pinMap=new Map(pins.map(p=>[p.id,p]));
  for(const transition of options.viewTransitions||[]){const [aId,bId]=transition.pinIds||[],a=pinMap.get(aId),b=pinMap.get(bId);if(!a?.via||!b?.via||transition.netId!==netId||!Array.isArray(transition.positions)||transition.positions.length!==2)continue;
   // Data provenance must be supplied by the audited source-pair catalog. Check
   // exact pin identity, copper center and layer span again against current D.
   if(!transition.positions.every((p,i)=>Array.isArray(p)&&dist(p,i?[b.x,b.y]:[a.x,a.y])<EPS)||a.startLayer!==b.startLayer||a.endLayer!==b.endLayer||a.hole!==b.hole)continue;
   for(const x of pinNodes.get(aId)||[])for(const y of pinNodes.get(bId)||[]){if(nodes[x].layer!==nodes[y].layer)continue;edge(x,y,[nodes[x].point,nodes[y].point],'view-transition',{length:0,drawable:false,semantic:true,pinIds:[aId,bId],proof:{kind:'audited-mirrored-via',rawPartIds:transition.rawPartIds,rawMirrorXSum:transition.rawMirrorXSum}});}
  }
  const groups=[],groupOf=Array(nodes.length).fill(-1);for(const start of nodes){if(groupOf[start.id]>=0)continue;const id=groups.length,members=[],q=[start.id];groupOf[start.id]=id;while(q.length){const at=q.pop();members.push(at);for(const eId of nodes[at].edges){const e=edges[eId],to=e.a===at?e.b:e.a;if(groupOf[to]<0){groupOf[to]=id;q.push(to);}}}groups.push(members);}
  const graph={netId,nodes,edges,pinNodes,sourcePieces,groups,groupOf,stats:{sourcePieces:sourcePieces.length,nodes:nodes.length,edges:edges.length,groups:groups.length,trackEdges:edges.filter(e=>e.kind==='track').length,junctions:edges.filter(e=>e.kind==='contact').length,padContacts:padContacts.length,viaEdges:edges.filter(e=>e.kind==='via').length,viewTransitions:edges.filter(e=>e.kind==='view-transition').length,candidates}};
  netCache.set(netId,graph);return graph;
 }
 function traverse(graph,starts){const costs=new Map(),previous=new Map(),q=[],visited=new Set();for(const id of starts||[]){costs.set(id,0);q.push(id);}while(q.length){let best=0;for(let i=1;i<q.length;i++)if(costs.get(q[i])<costs.get(q[best]))best=i;const at=q.splice(best,1)[0];if(visited.has(at))continue;visited.add(at);for(const edgeId of graph.nodes[at].edges){const e=graph.edges[edgeId],to=e.a===at?e.b:e.a,next=costs.get(at)+e.length;if(next<(costs.get(to)??Infinity)){costs.set(to,next);previous.set(to,{node:at,edgeId});q.push(to);}}}return{costs,previous,nodes:[...visited]};}
 function route(D,fromPinId,toPinId,options={}){
  const pins=new Map((D?.pins||[]).map(p=>[p.id,p])),from=pins.get(fromPinId),to=pins.get(toPinId);if(!from||!to||from.net===undefined||from.net===null||from.net!==to.net)return{status:'missing',reason:'pin-identity-or-net',points:[],edgeIds:[],fromReachable:[],toReachable:[],gap:null};
  const graph=build(D,from.net,options),starts=graph.pinNodes.get(fromPinId)||[],ends=graph.pinNodes.get(toPinId)||[],a=traverse(graph,starts),b=traverse(graph,ends),targets=ends.filter(id=>a.costs.has(id)).sort((x,y)=>a.costs.get(x)-a.costs.get(y));
  if(targets.length){let at=targets[0];const steps=[];while(a.previous.has(at)){const s=a.previous.get(at),e=graph.edges[s.edgeId];steps.push({edgeId:e.id,forward:e.a===s.node});at=s.node;}steps.reverse();const paths=[[]];for(const step of steps){const e=graph.edges[step.edgeId];if(e.kind==='view-transition'){if(paths.at(-1).length)paths.push([]);continue;}const points=paths.at(-1);for(const p of step.forward?e.points:e.points.slice().reverse())if(!points.length||dist(points.at(-1),p)>EPS)points.push(p);}const drawablePaths=paths.filter(p=>p.length>1);return{status:'complete',graph,steps,paths:drawablePaths,points:drawablePaths.length===1?drawablePaths[0]:[],edgeIds:steps.map(s=>s.edgeId),length:a.costs.get(targets[0]),fromReachable:a.nodes,toReachable:b.nodes,gap:null};}
  let gap=null;for(const x of a.nodes)for(const y of b.nodes){const p=graph.nodes[x],q=graph.nodes[y];if(p.layer!==null&&q.layer!==null&&p.layer!==q.layer)continue;const d=dist(p.point,q.point);if(!gap||d<gap.distance)gap={a:x,b:y,points:[p.point,q.point],distance:d,layer:p.layer??q.layer};}
  return{status:'partial',graph,points:[],edgeIds:[],fromReachable:a.nodes,toReachable:b.nodes,gap};
 }
 return Object.freeze({build,route,traverse,evaluate,projectPiece,shapeProject});
});
