/* Educational continuity. Existing copper is immutable; only unresolved gaps
 * receive explicit bridge legs. No bridge is written back into board geometry. */
(function(root,factory){
 'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.NexusStudyContinuity79=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
 'use strict';
 const cache=new WeakMap(),compiledCache=new WeakMap(),EPS=1e-7;
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const finite=p=>Array.isArray(p)&&p.length>1&&p.slice(0,2).every(Number.isFinite);
 const same=(a,b)=>distance(a,b)<EPS;
 const length=points=>points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
 const compare=(a,b)=>Math.abs(a[0]-b[0])>EPS?a[0]-b[0]:a[1]!==b[1]?a[1]-b[1]:a[2]-b[2];
 function heap(){const items=[];return{push(v){let i=items.length;items.push(v);while(i){const p=(i-1)>>1;if(compare(items[p].cost,v.cost)<=0)break;items[i]=items[p];i=p;}items[i]=v;},pop(){const first=items[0],last=items.pop();if(items.length){let i=0;while(i*2+1<items.length){let c=i*2+1;if(c+1<items.length&&compare(items[c+1].cost,items[c].cost)<0)c++;if(compare(last.cost,items[c].cost)<=0)break;items[i]=items[c];i=c;}items[i]=last;}return first;},get size(){return items.length;}};}
 function edgeLeg(edge,reverse=false){
  const kind=edge.kind==='bridge'?'bridge':edge.kind==='view-transition'?'view-transition':edge.drawable?'copper':'internal';
  const points=(reverse?edge.points.slice().reverse():edge.points).map(p=>p.slice());
  return{kind,points,length:edge.length,animationLength:kind==='view-transition'?0:length(points),sourceIds:(edge.sourceIds||[]).slice(),pinIds:edge.pinIds?.slice()||(Number.isInteger(edge.pinId)?[edge.pinId]:[]),layer:edge.layer,proof:edge.proof||null,reason:edge.reason||null,graphEdgeId:edge.originalId??edge.id};
 }
 function shortest(g,starts,ends){
  const target=new Set(ends),cost=new Map(),previous=new Map(),queue=heap();
  for(const id of starts){cost.set(id,[0,0,0]);queue.push({id,cost:[0,0,0]});}
  let last=null;while(queue.size){const current=queue.pop();if(compare(current.cost,cost.get(current.id))!==0)continue;if(target.has(current.id)){last=current.id;break;}
   for(const edgeId of g.nodes[current.id].edges){const e=g.edges[edgeId],to=e.a===current.id?e.b:e.a,bridge=e.kind==='bridge';
    const next=[current.cost[0]+(bridge?e.length:0),current.cost[1]+(bridge?1:0),current.cost[2]+(bridge?0:e.length)];
    if(cost.has(to)&&compare(next,cost.get(to))>=0)continue;cost.set(to,next);previous.set(to,{node:current.id,edgeId});queue.push({id:to,cost:next});
   }
  }
  if(last===null)return null;const steps=[];let at=last;while(previous.has(at)){const p=previous.get(at),e=g.edges[p.edgeId];steps.push(edgeLeg(e,e.b===p.node));at=p.node;}steps.reverse();return{legs:steps,cost:cost.get(last),start:at,end:last};
 }
 function groups(g){const groupOf=new Int32Array(g.nodes.length).fill(-1),all=[];for(let n=0;n<g.nodes.length;n++){if(groupOf[n]!==-1)continue;const ids=[n],id=all.length;groupOf[n]=id;for(let i=0;i<ids.length;i++)for(const eId of g.nodes[ids[i]].edges){const e=g.edges[eId],to=e.a===ids[i]?e.b:e.a;if(groupOf[to]===-1){groupOf[to]=id;ids.push(to);}}all.push({id,ids,primitives:[]});}return{all,groupOf};}
 function pointOn(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
 function projection(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy;return q?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q)):0;}
 function closest(a,b){
  const candidates=[[0,projection(a.a,b.a,b.b)],[1,projection(a.b,b.a,b.b)],[projection(b.a,a.a,a.b),0],[projection(b.b,a.a,a.b),1]],rx=a.b[0]-a.a[0],ry=a.b[1]-a.a[1],sx=b.b[0]-b.a[0],sy=b.b[1]-b.a[1],cross=rx*sy-ry*sx;
  if(Math.abs(cross)>EPS){const dx=b.a[0]-a.a[0],dy=b.a[1]-a.a[1],t=(dx*sy-dy*sx)/cross,u=(dx*ry-dy*rx)/cross;if(t>=0&&t<=1&&u>=0&&u<=1)candidates.push([t,u]);}
  let best=null;for(const [t,u]of candidates){const p=pointOn(a.a,a.b,t),q=pointOn(b.a,b.b,u),d=distance(p,q);if(!best||d<best.distance-EPS)best={distance:d,p,q,t,u};}return best;
 }
 function bboxDistance(a,b){return Math.hypot(Math.max(0,a.box[0]-b.box[2],b.box[0]-a.box[2]),Math.max(0,a.box[1]-b.box[3],b.box[1]-a.box[3]));}
 function primitive(a,b,extra){return{a,b,box:[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])],...extra};}
 function populatePrimitives(g,clusters){
  const incident=new Set();for(const edge of g.edges){if(!edge.drawable||edge.points.length<2)continue;const group=clusters.all[clusters.groupOf[edge.a]];let offset=0;for(let i=1;i<edge.points.length;i++){const a=edge.points[i-1],b=edge.points[i],partLength=distance(a,b);if(partLength>EPS){if(edge.sourceKind==='arc')group.primitives.push(primitive(a,a,{edgeId:edge.id,offset,partLength:0,layer:edge.layer}));else group.primitives.push(primitive(a,b,{edgeId:edge.id,offset,partLength,layer:edge.layer}));}offset+=partLength;}if(edge.sourceKind==='arc'){const p=edge.points.at(-1);group.primitives.push(primitive(p,p,{edgeId:edge.id,offset,partLength:0,layer:edge.layer}));}incident.add(edge.a);incident.add(edge.b);}
  for(const group of clusters.all)for(const id of group.ids)if(!incident.has(id)){const n=g.nodes[id];group.primitives.push(primitive(n.point,n.point,{nodeId:id,layer:n.layer}));}
 }
 function slicePoints(points,start,end){
  const total=length(points);start=Math.max(0,Math.min(total,start));end=Math.max(start,Math.min(total,end));const out=[];let at=0;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],n=distance(a,b),next=at+n;if(next>=start-EPS&&at<=end+EPS&&n>EPS){const p=pointOn(a,b,Math.max(0,(start-at)/n)),q=pointOn(a,b,Math.min(1,(end-at)/n));if(!out.length||!same(out.at(-1),p))out.push(p);if(!same(out.at(-1),q))out.push(q);}at=next;}
  return out;
 }
 function prepare(base,anchorPinIds){
  const clusters=groups(base);populatePrimitives(base,clusters);
  const anchorGroups=new Set(anchorPinIds.flatMap(id=>(base.pinNodes.get(id)||[]).map(node=>clusters.groupOf[node])));
  // A disconnected point without copper or a proven view transition cannot
  // reduce missing distance (triangle inequality); it only adds bridges. Keep
  // every requested source/target and all real track/transition islands.
  const active=clusters.all.filter(group=>anchorGroups.has(group.id)||group.ids.some(id=>base.nodes[id].edges.some(e=>base.edges[e].drawable||base.edges[e].kind==='view-transition')));
  const g={nodes:base.nodes.map(n=>({...n,point:n.point.slice(),edges:n.edges.slice()})),edges:base.edges.map(e=>({...e,points:e.points.map(p=>p.slice()),originalId:e.id}))},splits=new Map(),attachments=new Map();
  const addEdge=e=>{e.id=g.edges.length;g.edges.push(e);g.nodes[e.a].edges.push(e.id);g.nodes[e.b].edges.push(e.id);return e.id;};
  function attach(p,t,point){
   if(p.nodeId!==undefined)return p.nodeId;const edge=base.edges[p.edgeId],where=p.offset+p.partLength*t,total=length(edge.points);if(where<EPS)return edge.a;if(total-where<EPS)return edge.b;
   const key=p.edgeId+':'+where.toFixed(7);if(attachments.has(key))return attachments.get(key);const id=g.nodes.length;g.nodes.push({id,point:point.slice(),x:point[0],y:point[1],layer:p.layer,edges:[]});attachments.set(key,id);if(!splits.has(p.edgeId))splits.set(p.edgeId,[]);splits.get(p.edgeId).push({where,id});return id;
  }
  // One closest bridge per pair of disconnected islands is sufficient for the
  // minimum unsupported-distance island graph. Intermediate islands remain
  // available, so a direct source-to-destination jump cannot replace a shorter
  // sequence that uses actual fragments of this same electrical net.
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
   let best=null;for(const a of active[i].primitives)for(const b of active[j].primitives){if(best&&bboxDistance(a,b)>best.distance+EPS)continue;const candidate=closest(a,b);if(!best||candidate.distance<best.distance-EPS)best={...candidate,a,b};}
   if(!best)continue;const a=attach(best.a,best.t,best.p),b=attach(best.b,best.u,best.q),crossLayer=best.a.layer!==best.b.layer;
   addEdge({a,b,points:[best.p,best.q],length:best.distance,kind:'bridge',drawable:false,sourceIds:[],layer:best.a.layer===best.b.layer?best.a.layer:null,reason:best.distance<EPS&&crossLayer?'unresolved-layer-contact':'missing-geometry',proof:{basis:'same-net-disconnected-islands',netId:base.netId,fromIsland:active[i].id,toIsland:active[j].id,fromLayer:best.a.layer,toLayer:best.b.layer}});
  }
  // Split only planner copies, retaining exact original polyline portions and
  // provenance. This permits attachment in the middle of a real track without
  // classifying the missing gap itself as copper.
  for(const [edgeId,values]of splits){const edge=base.edges[edgeId],total=length(edge.points),ordered=[{where:0,id:edge.a},...values.sort((a,b)=>a.where-b.where),{where:total,id:edge.b}];
   for(let i=1;i<ordered.length;i++){const a=ordered[i-1],b=ordered[i],points=slicePoints(edge.points,a.where,b.where);if(points.length<2)continue;addEdge({...edge,id:undefined,originalId:edge.id,a:a.id,b:b.id,points,length:length(points)});}
  }
  return{graph:g,clusters:clusters.all.length,activeClusters:active.length,bridgeCandidates:g.edges.filter(e=>e.kind==='bridge').length};
 }
 function entry(D,netId,options){
  const topology=options?.topology||root.NexusStudyTopology79||root.NexusStudyRouting79;if(!topology?.build)throw new Error('Topologia de trilhas indisponível.');
  let record=cache.get(D);if(!record||record.revision!==D.nexusRevision||record.transitions!==options?.viewTransitions||record.topology!==topology){record={revision:D.nexusRevision,transitions:options?.viewTransitions,topology,nets:new Map()};cache.set(D,record);}
  if(!record.nets.has(netId)){const graph=topology.build(D,netId,options||{});record.nets.set(netId,{graph,plans:new Map(),prepared:new Map()});}return record.nets.get(netId);
 }
 function plan(D,fromPinId,toPinId,options={}){
  const pins=new Map((D?.pins||[]).map(p=>[p.id,p])),from=pins.get(fromPinId),to=pins.get(toPinId),missing=reason=>({status:'missing',reason,fromPinId,toPinId,legs:[],points:[],bridgeCount:0,endpointsVerified:false});
  if(!from||!to)return missing('Pad de origem ou destino não encontrado.');if(from.net==null||from.net!==to.net)return missing('Origem e destino não pertencem à mesma linha elétrica.');if(!finite([from.x,from.y])||!finite([to.x,to.y]))return missing('Coordenadas inválidas.');
  const state=entry(D,from.net,options),key=fromPinId+':'+toPinId;if(state.plans.has(key))return state.plans.get(key);
  const starts=state.graph.pinNodes.get(fromPinId)||[],ends=state.graph.pinNodes.get(toPinId)||[];if(!starts.length||!ends.length)return missing('Pad sem identidade na topologia.');
  let result=shortest(state.graph,starts,ends);if(!result){const anchors=[...new Set([...(options.anchorPinIds||[]),fromPinId,toPinId])].filter(id=>pins.get(id)?.net===from.net).sort((a,b)=>a-b),anchorKey=anchors.join(',');if(!state.prepared.has(anchorKey))state.prepared.set(anchorKey,prepare(state.graph,anchors));result=shortest(state.prepared.get(anchorKey).graph,starts,ends);}
  if(!result)return missing('Não foi possível reconstruir uma ligação contínua.');const legs=result.legs,points=[];for(const leg of legs)for(const p of leg.points)if(!points.length||!same(points.at(-1),p))points.push(p.slice());
  if(!points.length)points.push([from.x,from.y],[to.x,to.y]);const continuous=legs.every((leg,i)=>leg.points.every(finite)&&(!i||same(legs[i-1].points.at(-1),leg.points[0]))),verified=continuous&&same(points[0],[from.x,from.y])&&same(points.at(-1),[to.x,to.y]);
  const bridges=legs.filter(l=>l.kind==='bridge'),transitions=legs.filter(l=>l.kind==='view-transition'),value={status:bridges.length?'bridged':'complete',net:from.net,fromPinId,toPinId,fromPoint:[from.x,from.y],toPoint:[to.x,to.y],legs,points,bridgeCount:bridges.length,bridgeLength:bridges.reduce((sum,l)=>sum+length(l.points),0),viewTransitionCount:transitions.length,copperLength:legs.filter(l=>l.kind==='copper').reduce((sum,l)=>sum+length(l.points),0),length:legs.reduce((sum,l)=>sum+l.animationLength,0),endpointsVerified:verified,continuous,optimization:'minimum missing distance, then gap count; shortest known route',topologyStats:state.graph.stats};
  if(!verified)return missing('A continuidade não passou na verificação dos pads.');state.plans.set(key,value);return value;
 }
 function compile(D,study,options={}){
  if(!D||typeof D!=='object')return{routes:[],missing:[],components:[],stats:{routes:0,arrived:0,bridges:0,viewTransitions:0,bridgeLength:0,copperLength:0}};
  const signature=JSON.stringify((study?.flows||[]).map(f=>[f.id,f.netName,f.from?.pinId,f.from?.direction,f.from?.componentId,f.to?.pinId,f.to?.direction,f.to?.componentId]));
  const previous=compiledCache.get(D);if(previous&&previous.revision===D.nexusRevision&&previous.transitions===options.viewTransitions&&previous.topology===options.topology&&previous.signature===signature)return previous.result;
  const routes=[],missing=[],components=new Set(),planOptions={...options,anchorPinIds:(study?.flows||[]).flatMap(f=>[f.from?.pinId,f.to?.pinId])};for(const flow of study?.flows||[]){let from=flow.from,to=flow.to;if(from?.direction==='in'&&to?.direction==='out')[from,to]=[to,from];
   const result=plan(D,from?.pinId,to?.pinId,planOptions);if(result.status==='missing'){missing.push({id:flow.id,reason:result.reason});continue;}
   if(from.componentId!==undefined)components.add(from.componentId);if(to.componentId!==undefined)components.add(to.componentId);
   const conflict=from.direction&&to.direction&&from.direction===to.direction,directed=!conflict&&(from.direction==='out'||to.direction==='in');
   routes.push({...result,id:flow.id,netName:flow.netName,fromDirection:conflict?null:from.direction||null,toDirection:conflict?null:to.direction||null,directed,fromComponentId:from.componentId,toComponentId:to.componentId});
  }
  const result={routes,missing,components:[...components],stats:{routes:routes.length,arrived:routes.filter(r=>r.endpointsVerified).length,bridges:routes.reduce((s,r)=>s+r.bridgeCount,0),viewTransitions:routes.reduce((s,r)=>s+r.viewTransitionCount,0),bridgeLength:routes.reduce((s,r)=>s+r.bridgeLength,0),copperLength:routes.reduce((s,r)=>s+r.copperLength,0)}};
  compiledCache.set(D,{revision:D.nexusRevision,transitions:options.viewTransitions,topology:options.topology,signature,result});return result;
 }
 return Object.freeze({plan,compile});
});
