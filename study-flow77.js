/* Educational flow overlay. No geometry, readings, net colors or circuit state is changed. */
(() => {
 'use strict';
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const finitePoint=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite);
 const cache=new WeakMap();
 const layerOrder=[12,40,41,42,43,44,45,46,47,13];
 function insideCopper(pin,point){
  // Bounding boxes include empty corners around round/rotated pads. Only their
  // actual copper can join a track endpoint; unknown pad shapes stay logical.
  return (pin.copper||[]).some(s=>{
   const w=Number(s.width),h=Number(s.height);if(!(w>0&&h>0))return false;
   const angle=(s.angle||0)*Math.PI/180,dx=point[0]-s.x,dy=point[1]-s.y;
   const x=Math.abs(dx*Math.cos(angle)+dy*Math.sin(angle)),y=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle)),eps=1e-7;
   if(s.kind==='circle')return x*x+y*y<=(w/2+eps)**2;
   if(x>w/2+eps||y>h/2+eps)return false;
   if(s.kind==='rect')return true;
   if(s.kind==='diamond')return x/(w/2)+y/(h/2)<=1+eps;
   if(s.kind==='octagon')return x+y<=w/2+h/2-Math.min(w,h)*(1-1/Math.sqrt(2))+eps;
   if(s.kind==='roundrect'||s.kind==='oval'){const r=s.kind==='oval'?Math.min(w,h)/2:Math.max(0,Math.min(Number(s.radius)||0,w/2,h/2));return Math.max(0,x-(w/2-r))**2+Math.max(0,y-(h/2-r))**2<=(r+eps)**2;}
   return false;
  });
 }
 function arcPoints(r){
  const start=Math.atan2(r[3]-r[1],r[2]-r[0]),end=Math.atan2(r[5]-r[1],r[4]-r[0]),delta=((end-start+Math.PI*3)%(Math.PI*2))-Math.PI;
  const count=Math.max(2,Math.min(32,Math.ceil(Math.abs(delta)*12))),points=[];
  for(let i=0;i<=count;i++){const a=start+delta*i/count;points.push([r[0]+r[6]*Math.cos(a),r[1]+r[6]*Math.sin(a)]);}
  points[0]=[r[2],r[3]];points[points.length-1]=[r[4],r[5]];return points;
 }
 function graphFor(D,netId){
  let entry=cache.get(D);if(!entry||entry.revision!==D.nexusRevision){entry={revision:D.nexusRevision,nets:new Map()};cache.set(D,entry);}const cached=entry.nets;if(cached.has(netId))return cached.get(netId);
  const nodes=[],tracks=[],lookup=new Map(),byLayer=new Map(),cellSize=1000,trackKeys=new Set();
  function node(point,layer){const key=layer+':'+point.join(',');if(lookup.has(key))return lookup.get(key);const id=nodes.length;nodes.push({point,layer,edges:[]});lookup.set(key,id);if(!byLayer.has(layer))byLayer.set(layer,new Map());const cells=byLayer.get(layer),cell=point.map(v=>Math.floor(v/cellSize)).join(',');if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push(id);return id;}
  function connect(a,b,points){if(a===b)return;let length=0;for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i]);nodes[a].edges.push({to:b,points,length});nodes[b].edges.push({to:a,points:points.slice().reverse(),length});}
  function track(layer,raw,sourceKind,sourceIndex,points){
   if(!points.every(finitePoint)||points.length<2)return;
   const key=layer+':'+sourceKind+':'+[JSON.stringify(points),JSON.stringify(points.slice().reverse())].sort()[0];if(trackKeys.has(key))return;trackKeys.add(key);
   const a=node(points[0],layer),b=node(points.at(-1),layer);if(a===b)return;
   const id=tracks.length;tracks.push({id,a,b,points,layer,raw,sourceKind,sourceIndex,width:Number(raw[sourceKind==='arc'?7:4])||0,net:netId});connect(a,b,points);
  }
  for(const layer of D.layers||[]){
   for(const [i,r] of (layer.segments||[]).entries())if(r[5]===netId&&r.slice(0,4).every(Number.isFinite))track(layer.id,r,'segment',i,[[r[0],r[1]],[r[2],r[3]]]);
   for(const [i,r] of (layer.arcs||[]).entries())if(r[8]===netId&&r.slice(0,7).every(Number.isFinite)&&r[6]>0)track(layer.id,r,'arc',i,arcPoints(r));
  }
  const pinNodes=new Map();
  for(const pin of D.pins||[]){
   if(pin.net!==netId||!Number.isFinite(pin.x)||!Number.isFinite(pin.y))continue;
   const center=[pin.x,pin.y],box=pin.bbox||[pin.x-1,pin.y-1,pin.x+1,pin.y+1];
   const start=layerOrder.indexOf(pin.startLayer),end=layerOrder.indexOf(pin.endLayer);
   const layers=start>=0&&end>=0?layerOrder.slice(Math.min(start,end),Math.max(start,end)+1):null;
   const matches=new Map();
   for(const [layer,cells] of byLayer){if(layers&&!layers.includes(layer))continue;
    // Only attach copper ends physically inside the pad; no nearest-neighbor wire guesses.
    const ids=[];for(let x=Math.floor(box[0]/cellSize);x<=Math.floor(box[2]/cellSize);x++)for(let y=Math.floor(box[1]/cellSize);y<=Math.floor(box[3]/cellSize);y++)for(const id of cells.get(x+','+y)||[])if(insideCopper(pin,nodes[id].point))ids.push(id);
    if(ids.length)matches.set(layer,ids);
   }
   if(!matches.size)continue;
   // A surface pad must never manufacture a via between overlapping layers.
   // Only a via with a known span may connect attachments on different layers.
   const groups=pin.via&&layers?[[null,[...matches.values()].flat()]]:[...matches],attachments=[];
   for(const [layer,ids] of groups){const id=nodes.length;nodes.push({point:center,layer,edges:[]});attachments.push(id);for(const other of ids)connect(id,other,[center,nodes[other].point]);}
   pinNodes.set(pin.id,attachments);
  }
  const graph={nodes,pinNodes,tracks};cached.set(netId,graph);return graph;
 }
 function route(D,a,b){
  if(!a||!b||a.net!==b.net||a.net===null||a.net===undefined)return null;
  const g=graphFor(D,a.net),starts=g.pinNodes.get(a.id),ends=g.pinNodes.get(b.id);if(!starts?.length||!ends?.length)return null;
  const startSet=new Set(starts),endSet=new Set(ends),destination=[b.x,b.y],cost=new Map(starts.map(id=>[id,0])),previous=new Map(),queue=starts.map(id=>({id,score:0})),closed=new Set();let end=null;
  let rounds=0;while(queue.length&&rounds++<50000){
   let best=0;for(let i=1;i<queue.length;i++)if(queue[i].score<queue[best].score)best=i;
   const {id}=queue.splice(best,1)[0];if(closed.has(id))continue;if(endSet.has(id)){end=id;break;}closed.add(id);
   for(const edge of g.nodes[id].edges){const candidate=cost.get(id)+edge.length;if(candidate>=(cost.get(edge.to)??Infinity))continue;cost.set(edge.to,candidate);previous.set(edge.to,{id,points:edge.points});queue.push({id:edge.to,score:candidate+distance(g.nodes[edge.to].point,destination)});}
  }
  if(end===null||!previous.has(end))return null;const segments=[];let at=end;while(!startSet.has(at)){const step=previous.get(at);if(!step)return null;segments.push(step.points);at=step.id;}segments.reverse();const points=[];for(const segment of segments)for(const point of segment)if(!points.length||distance(points.at(-1),point)>1e-9)points.push(point);return points.length>1?points:null;
 }

 // Pad attachments are graph-only. Only entries in graph.tracks may be painted.
 function distances(graph,pinIds){
  const costs=new Map(),queue=[],closed=new Set();
  for(const id of pinIds)for(const node of graph.pinNodes.get(id)||[]){costs.set(node,0);queue.push({id:node,cost:0});}
  while(queue.length){let best=0;for(let i=1;i<queue.length;i++)if(queue[i].cost<queue[best].cost)best=i;const item=queue.splice(best,1)[0];if(closed.has(item.id))continue;closed.add(item.id);
   for(const edge of graph.nodes[item.id].edges){const next=item.cost+edge.length;if(next<(costs.get(edge.to)??Infinity)){costs.set(edge.to,next);queue.push({id:edge.to,cost:next});}}
  }return costs;
 }
 function resolveEnd(end,D){
  if(!end)return null;
  const upper=v=>String(v??'').trim().toUpperCase(),names=[end.component,...(end.componentAliases||[])].filter(Boolean).map(upper);
  const matches=D.components.filter(c=>[c.name,c.sourceName,c.sourceComponentName,...(c.sourceNames||[]),...(c.componentAliases||[])].some(n=>n&&names.includes(upper(n))));
  const c=end.componentId!==undefined?matches.find(c=>c.id===end.componentId):(matches.length===1?matches[0]:null);if(!c)return null;
  const pads=(c.pins||[]).map(id=>D.pins[id]).filter(p=>p&&!p.via&&p.part===c.id);
  const wanted=[...(Array.isArray(end.pads)?end.pads:[]),end.pad].filter(v=>v!==undefined&&v!==null).map(String);
  const resolvedIds=[...(Array.isArray(end.pinIds)?end.pinIds:[]),end.pinId].filter(v=>v!==undefined&&v!==null);
  const candidates=resolvedIds.length?pads.filter(p=>resolvedIds.includes(p.id)):wanted.length?pads.filter(p=>[p.name,p.sourceName,...(p.sourceNames||[])].some(n=>n!==undefined&&wanted.includes(String(n)))):[];
  return candidates.length?{...end,componentId:c.id,componentName:c.name,componentView:String(c.view),pins:candidates}:null;
 }
 function compileCopper(D,study){
  const paths=[],missing=[],parts=new Set(),groups=new Map(),nets=new Map((D?.nets||[]).map(n=>[n.id,n]));
  if(!D||!Array.isArray(study?.flows))return{paths,components:[],missing,nets:[]};
  for(const flow of study.flows){
   const from=resolveEnd(flow.from,D),to=resolveEnd(flow.to,D);if(!from||!to){missing.push(flow.id);continue;}
   const ids=new Set();
   for(const a of from.pins)for(const b of to.pins){const n=nets.get(a.net),names=[n?.name,n?.sourceName,...(n?.sourceNames||[]),...(n?.aliases||[])];if(a.net===b.net&&a.net!==null&&a.net!==undefined&&(!flow.netName||names.includes(flow.netName)))ids.add(a.net);}
   if(!ids.size){missing.push(flow.id);continue;}
   parts.add(from.componentId);parts.add(to.componentId);
   for(const net of ids){if(!groups.has(net))groups.set(net,{out:new Set(),in:new Set(),flowIds:new Set()});const group=groups.get(net);group.flowIds.add(flow.id);
    for(const end of [from,to])if(end.direction==='out'||end.direction==='in')for(const p of end.pins)if(p.net===net)group[end.direction].add(p.id);
   }
  }
  for(const id of [...(study.componentIds||[]),...(study.components||[]).map(c=>typeof c==='object'?c.id:c)])if(D.components.some(c=>c.id===id))parts.add(id);
  for(const [net,group]of groups){
   // Contradictory labels on the same pad cannot establish a direction.
   for(const id of [...group.out])if(group.in.has(id)){group.out.delete(id);group.in.delete(id);}
   const graph=graphFor(D,net),out=distances(graph,group.out),input=distances(graph,group.in);
   for(const track of graph.tracks){
    const candidates=[];
    for(const [direction,cost]of [['out',out],['in',input]]){const a=cost.get(track.a),b=cost.get(track.b);if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)<1e-7)continue;
     const forward=direction==='out'?a<b:a>b;candidates.push({direction,forward,rank:Math.min(a,b),phaseOrigin:direction==='out'?Math.min(a,b):-Math.max(a,b)});
    }
    candidates.sort((a,b)=>a.rank-b.rank);let chosen=candidates[0];
    // Equally close disagreeing roots are ambiguous: show the copper, no arrow.
    if(candidates[1]&&Math.abs(chosen.rank-candidates[1].rank)<1e-7&&chosen.forward!==candidates[1].forward)chosen=null;
    paths.push({...track,id:net+':'+track.layer+':'+track.sourceKind+':'+track.sourceIndex,flowIds:[...group.flowIds],kind:'copper',direction:chosen?.direction||null,directed:!!chosen,phaseOrigin:chosen?.phaseOrigin||0,points:chosen&&!chosen.forward?track.points.slice().reverse():track.points,color:chosen?.direction==='out'?'#ff5664':chosen?.direction==='in'?'#62e791':'#2453b8'});
   }
  }
  return{paths,components:[...parts],missing,nets:[...groups.keys()]};
 }
 // Analysis is a direct neighborhood of the selected circuit. A profile may
 // also document a signal beyond a series filter; that is useful in a guided
 // explanation, but must not expand a direct circuit selection implicitly.
 function scopeRoutes(routes,{componentId=null,flowIds=null}={}){if(Array.isArray(flowIds)){const ids=new Set(flowIds);return routes.filter(r=>ids.has(r.id));}return Number.isInteger(componentId)?routes.filter(r=>r.fromComponentId===componentId||r.toComponentId===componentId):routes.slice();}
 function nativeRole(route,reference){
  if(!reference)return null;const role=reference.flowRoles?.find(r=>r.flowId===route.id);
  if(role)return role.direction==='in'||role.direction==='out'?role.direction:null;
  return route.directed?(route.toComponentId===reference.id&&route.toDirection==='in'?'in':route.fromComponentId===reference.id&&route.fromDirection==='out'?'out':null):null;
 }
 function relativeRole(route,reference,routes){
  const native=nativeRole(route,reference);if(!native)return null;
  const roles=new Set(routes.filter(r=>r.net===route.net).map(r=>nativeRole(r,reference)).filter(Boolean));
  return roles.size===1?native:null;
 }
 function overviewRole(route,study,routes){
  const family=routes.filter(r=>r.net===route.net),reference=study?.componentProfiles?.find(c=>c.id===study.defaultComponentId);
  // Keep the familiar charging-reference colors without selecting that IC.
  // A shared net has one color throughout, including all branches of SCL.
  const preferred=new Set(family.map(r=>nativeRole(r,reference)).filter(Boolean));
  if(preferred.size)return preferred.size===1?[...preferred][0]:null;
  // Other nets use their actual endpoint roles. Passive/BI paths have no
  // unilateral endpoint role and retain the added third (blue) color.
  if(family.some(r=>r.directed&&r.fromDirection==='out'))return 'out';
  if(family.some(r=>r.directed&&r.toDirection==='in'))return 'in';
  return null;
 }
 function routeDirected(route,role){return !!route.directed||role==='in'||role==='out';}
 globalThis.NexusStudyRouting77=Object.freeze({route,arcPoints,compileCopper,scopeRoutes,relativeRole,overviewRole,routeDirected});
 if(typeof document==='undefined')return;
 const board=window.JCIDBoardView,wrap=document.getElementById('canvasWrap'),padHelper=window.NexusStudyPads84;if(!board||!wrap||!padHelper)return;
 const canvas=document.createElement('canvas');canvas.id='studyFlowCanvas77';canvas.className='study-flow-overlay';canvas.setAttribute('aria-hidden','true');canvas.hidden=true;wrap.append(canvas);
 const ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)'),renderCache=new WeakMap();
 const empty=()=>({paths:[],routes:[],pins:[],padStyles:[],components:[],missing:[],nets:[]});
 let study=null,playing=true,compiled=empty(),raf=0,lastTime=0,phase=0,lastKey='',projected=[],routeViews=[],frames=0,activeData=null,studySelectionNet=null,selectedComponentId=null,storyStep=null;
 let selectedPads=[],endpointMarkers=[],endpointLabels=[],focusedEndpoint=null,directionFilter='both';
 const data=()=>window.JCID_BOARD;
 function compile(){
  activeData=data();const signature=JSON.stringify(study.flows),memo=renderCache.get(activeData);
  if(memo&&memo.revision===activeData.nexusRevision&&memo.signature===signature)compiled=memo.compiled;
  else{
   const physical=compileCopper(activeData,study),viewTransitions=window.NexusStudyVias79.resolve(activeData),continuous=window.NexusStudyContinuity79.compile(activeData,study,{viewTransitions});
   // Selection is independent of signal direction. Passive and BI terminals
   // still belong to the explanation, but receive no invented direction.
   const endpointCatalog=padHelper.compile(activeData,study.flows);
   compiled={...physical,routes:continuous.routes,endpointCatalog,missing:[...physical.missing,...continuous.missing],continuity:continuous.stats};
   renderCache.set(activeData,{revision:activeData.nexusRevision,signature,compiled});
  }
  if(!activeData.components.some(c=>c.id===selectedComponentId))selectedComponentId=null;
  lastKey='';board.setStudyComponents?.(compiled.components);board.setStudyFocusComponent?.(selectedComponentId);applyPadStyles();
 }
 function selectedComponent(){
  if(selectedComponentId===null)return null;
  const profile=study?.componentProfiles?.find(c=>c.id===selectedComponentId),component=data()?.components.find(c=>c.id===selectedComponentId);
  return profile||component&&{id:component.id,name:component.name,label:'',description:'',flowIds:compiled.routes.filter(r=>r.fromComponentId===component.id||r.toComponentId===component.id).map(r=>r.id)}||null;
 }
 function scopedRoutes(){return scopeRoutes(compiled.routes,{componentId:selectedComponentId,flowIds:storyStep?.flowIds});}
 function focusedNet(){return scopedRoutes().some(r=>r.net===studySelectionNet)?studySelectionNet:null;}
 function visibleRoutes(){const net=focusedNet();return scopedRoutes().filter(r=>(net===null||r.net===net)&&(!!storyStep||directionFilter==='both'||(directionFilter==='neutral'?flowRoleOf(r)===null:flowRoleOf(r)===directionFilter)));}
 const roleColor=role=>role==='out'?'#ff5664':role==='in'?'#62e791':padHelper.neutralColor;
 function flowRoleOf(route){
  const selected=storyStep?study?.componentProfiles?.find(c=>c.id===storyStep.referenceComponentId):selectedComponent();
  if(!selected&&!storyStep)return overviewRole(route,study,scopedRoutes());
  // A shared copper net has one visual meaning relative to the reference IC.
  // Never let a later branch repaint the destination with the opposite role.
  return relativeRole(route,selected,scopedRoutes());
 }
 function directedOf(route){return routeDirected(route,storyStep||selectedComponentId!==null?flowRoleOf(route):null);}
 function setDirectionFilter(value){
  if(!['both','in','out','neutral'].includes(value))return false;
  directionFilter=value;studySelectionNet=null;focusedEndpoint=null;lastKey='';
  applyPadStyles();projectPaths();paint();start();announce();return state();
 }
 function applyPadStyles(){
  const routes=visibleRoutes();selectedPads=padHelper.select(compiled.endpointCatalog,routes,flowRoleOf);
  board.setStudyPins?.(selectedPads.map(p=>({id:p.id,color:p.color})));
  if(!selectedPads.some(p=>p.id===focusedEndpoint))focusedEndpoint=null;
  const netColors=new Map();for(const route of routes){const role=flowRoleOf(route);netColors.set(route.net,{id:route.net,color:roleColor(role)});}
  board.setStudyTraceColors?.([...netColors.values()]);
 }
 function announce(){window.dispatchEvent(new CustomEvent('nexus:study-flow'));}
 function focusComponent(id){
  if(!study)return state();
  const next=Number.isInteger(id)&&data().components.some(c=>c.id===id)?id:null;
  storyStep=null;selectedComponentId=next;directionFilter='both';studySelectionNet=null;focusedEndpoint=null;phase=0;lastTime=0;lastKey='';
  board.setStudyFocusComponent?.(next);applyPadStyles();projectPaths();paint();start();announce();return state();
 }
 function setStoryStep(value){
  if(!study||!value||!Array.isArray(value.flowIds))return false;
  const valid=new Set(compiled.routes.map(r=>r.id)),focus=Number.isInteger(value.focusComponentId)&&compiled.components.includes(value.focusComponentId)?value.focusComponentId:null;
  storyStep={id:String(value.id||''),flowIds:value.flowIds.filter(id=>valid.has(id)),referenceComponentId:Number.isInteger(value.referenceComponentId)?value.referenceComponentId:focus};
  selectedComponentId=focus;directionFilter='both';studySelectionNet=null;focusedEndpoint=null;phase=0;lastTime=0;lastKey='';
  board.setStudyFocusComponent?.(focus);applyPadStyles();projectPaths();paint();start();announce();return state();
 }
 function clearStoryStep(){return storyStep?focusComponent(selectedComponentId):state();}
 function state(){const paths=compiled.paths,active=focusedNet(),selected=selectedComponent(),shown=visibleRoutes(),pinIds=new Set(board.getStudyPins?.()||[]);return{available:!!compiled.components.length,reason:!study?'Nenhum estudo aberto':!compiled.components.length?'Os circuitos da carga não foram encontrados nesta placa.':'',studyId:study?.id||null,selectedComponent:selected,reference:selected?{name:selected.name,componentId:selected.id}:null,visibleRoutes:shown.map(r=>({id:r.id,net:r.net,fromPinId:r.fromPinId,toPinId:r.toPinId,fromComponentId:r.fromComponentId,toComponentId:r.toComponentId,flowRole:flowRoleOf(r),directed:directedOf(r),color:roleColor(flowRoleOf(r)),continuous:r.continuous,endpointsVerified:r.endpointsVerified})),stageId:storyStep?.id||null,storyStepId:storyStep?.id||null,directionReferenceId:storyStep?.referenceComponentId??selected?.id??null,directionFilter,directionCounts:{in:scopedRoutes().filter(r=>flowRoleOf(r)==='in').length,out:scopedRoutes().filter(r=>flowRoleOf(r)==='out').length,neutral:scopedRoutes().filter(r=>!flowRoleOf(r)).length},playing,reducedMotion:reduced.matches,
  paths:paths.map(p=>({id:p.id,kind:'copper',net:p.net,layer:p.layer,sourceKind:p.sourceKind,sourceIndex:p.sourceIndex,direction:p.direction,directed:p.directed})),
  routes:compiled.routes.map(r=>({id:r.id,net:r.net,fromPinId:r.fromPinId,toPinId:r.toPinId,directed:r.directed,status:r.status,endpointsVerified:r.endpointsVerified,continuous:r.continuous,bridgeCount:r.bridgeCount,viewTransitionCount:r.viewTransitionCount,from:r.points[0],to:r.points.at(-1),legs:r.legs.map(l=>({kind:l.kind,points:l.points,layer:l.layer,sourceIds:l.sourceIds,reason:l.reason})),animation:routeViews.find(v=>v.id===r.id)?.animation||null})),
  components:compiled.components.slice(),pins:[...pinIds],padStyles:selectedPads.filter(p=>pinIds.has(p.id)).map(p=>({id:p.id,net:p.net,part:p.part,role:p.role,nativeRole:p.nativeRole,color:p.color,primary:p.primary})),endpointMarkers:endpointMarkers.map(p=>({...p})),endpointLabels:endpointLabels.map(p=>({...p})),focusedEndpoint,activeNet:active,visualRoutes:routeViews.map(r=>({id:r.id,net:r.net,from:r.from,to:r.to,length:r.total,flowRole:r.flowRole,color:r.color,directed:r.directed,continuous:r.continuous,issues:r.issues,visibleArrows:r.visibleArrows||0,legs:r.legs.map(l=>({kind:l.kind,displayKind:l.displayKind,points:l.points,start:l.start,length:l.length,color:r.color}))})),missing:compiled.missing.slice(),stats:{segments:paths.filter(p=>p.sourceKind==='segment').length,arcs:paths.filter(p=>p.sourceKind==='arc').length,directed:paths.filter(p=>p.directed).length,out:paths.filter(p=>p.direction==='out').length,in:paths.filter(p=>p.direction==='in').length,neutral:paths.filter(p=>!p.directed).length,nets:compiled.nets.length,...compiled.continuity},frames,visible:!canvas.hidden};}
 function show(value,options={}){if(!value||!Array.isArray(value.flows)){clear();return state();}if(!study){studySelectionNet=null;selectedComponentId=null;directionFilter='both';}study=value;playing=options.playing!==false;compile();canvas.hidden=!compiled.paths.length&&!compiled.routes.length;lastTime=0;start();return state();}
 function clear(){study=null;studySelectionNet=null;selectedComponentId=null;storyStep=null;selectedPads=[];endpointMarkers=[];endpointLabels=[];focusedEndpoint=null;compiled=empty();projected=[];routeViews=[];activeData=null;canvas.hidden=true;cancelAnimationFrame(raf);raf=0;ctx.clearRect(0,0,canvas.width,canvas.height);board.setStudyComponents?.([]);board.setStudyFocusComponent?.(null);board.setStudyPins?.([]);board.setStudyTraceColors?.([]);}
 function focusAll(){
  if(!study)return false;const ids=new Set(compiled.components),boxes=data().components.filter(c=>ids.has(c.id)).map(c=>c.bbox).filter(b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite));if(!boxes.length)return false;
  const box=[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))],pad=Math.max(900,Math.max(box[2]-box[0],box[3]-box[1])*.08);
  return board.focusBounds?board.focusBounds([box[0]-pad,box[1]-pad,box[2]+pad,box[3]+pad])!==false:false;
 }
 function insideBoard(point,physical){const polygon=physical?.points;if(!polygon?.length)return false;let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
 function projection(path){const points=path.points.map(point=>{const v=board.project(...point);return[v.x,v.y];}),lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+distance(points[i-1],points[i]));return{...path,points,lengths,length:lengths.at(-1)};}
 function projectPaths(){
  // The board resize observer may update its projection one frame after the
  // wrapper changes size. Include the actual projection origin to avoid stale
  // routes shifted sideways after opening/closing a sidebar.
  const s=board.getState(),origin=board.project(0,0),isolationIds=s.netColorIsolation?(board.getNetColorIsolation?.().ids||(s.netColorIsolationScope==='checked'?s.netColorChecked:board.getNetColors().map(n=>n.id))):[],w=wrap.clientWidth,h=wrap.clientHeight,dpr=window.NexusMobileLandscape91?.pixelRatio()||Math.min(2,devicePixelRatio||1),key=[w,h,dpr,origin.x,origin.y,selectedComponentId,studySelectionNet,s.camera.x,s.camera.y,s.camera.scale,s.rotation,s.mirrored,s.mirroredVertical,s.view,s.net,s.netColorIsolation,s.netColorIsolationScope,isolationIds.join(',')].join('|');
  if(key===lastKey)return false;lastKey=key;canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
  // Studies have their own temporary scope; saved Netcolor isolation resumes on exit.
  const allowed=null,net=focusedNet();
  applyPadStyles();
  endpointMarkers=padHelper.project(selectedPads,(x,y)=>board.project(x,y),[w,h]);
  const boardBounds=(data().boards||[]).map(b=>{const points=(b.points||[]).map(p=>board.project(...p));return points.length?[Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y)),Math.max(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))]:null;}).filter(Boolean);
  // state.view is a fitting/selection hint in this viewer, not a visibility
  // mask. Filtering by it used to hide half of a route after clicking a pad.
  routeViews=visibleRoutes().filter(r=>(!allowed||allowed.has(r.net))).map((route,index)=>{
   const visual=window.NexusStudyVisual80.compile(route,(x,y)=>board.project(x,y),{bounds:[0,0,w,h],boardBounds,lane:index});
   const legs=visual.legs.map(l=>({...l,visible:true})),total=visual.total;
   // The selected circuit is the reference for the whole connection. A remote
   // output arriving here is an input: retain its color along the entire route.
   const flowRole=flowRoleOf(route);
   return{...visual,legs,total,flowRole,color:roleColor(flowRole),directed:directedOf(route),targetVisible:true,animation:null,visibleArrows:0};
  });return true;
 }
 function at(path,amount){if(path.points.length<2||path.length<.001)return{x:path.points[0][0],y:path.points[0][1],angle:0};const d=Math.max(0,Math.min(path.length,amount));let lo=1,hi=path.lengths.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(path.lengths[mid]<d)lo=mid+1;else hi=mid;}const i=lo,a=path.points[i-1],b=path.points[i],part=(d-path.lengths[i-1])/Math.max(.001,path.lengths[i]-path.lengths[i-1]);return{x:a[0]+(b[0]-a[0])*part,y:a[1]+(b[1]-a[1])*part,angle:Math.atan2(b[1]-a[1],b[0]-a[0])};}
 function routeAt(route,amount){if(amount>=route.total){const last=[...route.legs].reverse().find(l=>l.length>.001),point=last?at(last,last.length):{angle:0};return{...point,x:route.to[0],y:route.to[1],kind:'arrival',visible:true};}const leg=route.legs.find(l=>l.animationLength>0&&amount<l.start+l.animationLength)||route.legs.at(-1);if(!leg)return null;return{...at(leg,(amount-leg.start)/Math.max(.001,leg.animationLength)*leg.length),kind:leg.kind,visible:true};}
 function arrow(route,amount,color){
  const p=routeAt(route,amount);if(!p||!onscreen(p))return false;
  // The tail follows the actual route even at a corner; it cannot jut into
  // another track. A short secant softens the tip rotation without moving it.
  const before=routeAt(route,Math.max(0,amount-2.5)),after=routeAt(route,Math.min(route.total,amount+2.5)),angle=Math.atan2(after.y-before.y,after.x-before.x),tip=3.4,wing=1.65;
  ctx.beginPath();let started=false;for(let d=Math.max(0,amount-7);d<amount;d+=1.5){const q=routeAt(route,d);if(!started){ctx.moveTo(q.x,q.y);started=true;}else ctx.lineTo(q.x,q.y);}ctx.lineTo(p.x,p.y);
  const c=Math.cos(angle),s=Math.sin(angle);ctx.moveTo(p.x-tip*c-wing*s,p.y-tip*s+wing*c);ctx.lineTo(p.x,p.y);ctx.lineTo(p.x-tip*c+wing*s,p.y-tip*s-wing*c);
  ctx.strokeStyle='rgba(3,12,20,.8)';ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=1.05;ctx.stroke();return true;
 }
 function stroke(path,color,width){if(path.points.length<2)return;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...path.points[0]);for(const p of path.points.slice(1))ctx.lineTo(...p);ctx.stroke();}
 const onscreen=p=>p.x>=-12&&p.y>=-12&&p.x<=wrap.clientWidth+12&&p.y<=wrap.clientHeight+12;
 function ring(point,color,radius=5,dashed=false){ctx.setLineDash(dashed?[2,2]:[]);ctx.lineWidth=1.5;ctx.strokeStyle=color;ctx.beginPath();ctx.arc(point[0],point[1],radius,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
 function getEndpointGroups(){return padHelper.groups(selectedPads).map(g=>({key:g.key,part:g.part,net:g.net,component:g.partName,color:g.color,role:g.role,pinId:g.anchor.id,pinIds:g.targets.map(p=>p.id),pads:g.targets.map(p=>p.padName)}));}
 function focusEndpoint(id){
  const target=selectedPads.find(p=>p.id===id);if(!target)return false;
  focusedEndpoint=id;lastKey='';projectPaths();paint();announce();return true;
 }
 function markerShape(m,extra=0){
  const x=m.x,y=m.y,w=m.width+extra*2,h=m.height+extra*2;
  ctx.beginPath();if(m.circular){ctx.arc(x,y,w/2,0,Math.PI*2);return;}
  const left=x-w/2,right=x+w/2,top=y-h/2,bottom=y+h/2,corner=Math.min(5,w*.35,h*.35);
  for(const [px,py,sx,sy]of[[left,top,1,1],[right,top,-1,1],[left,bottom,1,-1],[right,bottom,-1,-1]]){ctx.moveTo(px+corner*sx,py);ctx.lineTo(px,py);ctx.lineTo(px,py+corner*sy);}
 }
 function drawEndpoints(){
  endpointLabels=[];ctx.save();ctx.setLineDash([]);ctx.globalAlpha=1;
  const focused=selectedPads.find(p=>p.id===focusedEndpoint);
  for(const m of endpointMarkers){if(!m.visible)continue;
   const isFocused=focused&&m.part===focused.part&&m.net===focused.net;
   ctx.globalAlpha=isFocused?1:.82;
   markerShape(m);ctx.strokeStyle=m.color;ctx.lineWidth=isFocused?1:.75;ctx.stroke();
  }
  ctx.restore();
 }
 function paint(){
  ctx.clearRect(0,0,wrap.clientWidth,wrap.clientHeight);ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);
  let budget=500;
  // Green/red remain the input/output colors in overview. Dark blue is the
  // additional color for paths without a unilateral role. Selecting a circuit
  // limits routes to its direct endpoints and makes it the color reference.
  const ordered=[...routeViews].sort((a,b)=>Number(a.directed)-Number(b.directed));
  for(const route of ordered){
   const color=route.color;
   for(const leg of route.legs){
    if(leg.length<.01)continue;const connection=leg.displayKind==='connection';
    // Every interval is drawn, including contacts inside pads and the movement
    // between board faces. Dashes distinguish a visual connection from copper.
    ctx.setLineDash(connection?[3,4]:[]);ctx.lineDashOffset=0;
    // Dark blue needs full opacity on the black board; the old pale-cyan
    // opacity made passive/BI connections disappear at ordinary zoom.
    ctx.globalAlpha=route.flowRole?(connection?.72:.9):(connection?.8:1);
    stroke(leg,'rgba(3,12,20,.65)',route.directed?2:1.6);
    stroke(leg,color,1.1);
    ctx.globalAlpha=1;ctx.setLineDash([]);
   }
   route.visibleArrows=0;if(!route.directed||route.total<.001)continue;
   const cycle=route.total+24,progress=phase%cycle,head=routeAt(route,Math.min(route.total,progress));
   route.animation={distance:Math.min(route.total,progress),length:route.total,cycle,arriving:progress>=route.total,cycles:Math.floor(phase/cycle),position:head?[head.x,head.y]:null,color,flowRole:route.flowRole};
   const headDistance=Math.min(route.total,progress);
   for(let d=phase%96;d<route.total&&budget>0;d+=96){if(Math.abs(d-headDistance)<16)continue;if(arrow(route,d,color)){route.visibleArrows++;budget--;}}
   if(head&&onscreen(head)&&arrow(route,headDistance,color)){route.visibleArrows++;}
   // Close-up views can contain a short interval between moving arrows. Keep
   // its direction recognizable while the traveling markers enter that area.
   if(!route.visibleArrows){let best=null;for(const leg of route.legs){for(let i=1;i<leg.points.length;i++){const a=leg.points[i-1],b=leg.points[i],length=distance(a,b),mid={x:(a[0]+b[0])/2,y:(a[1]+b[1])/2};if(length>3&&onscreen(mid)&&(!best||length>best.length))best={amount:leg.start+leg.lengths[i-1]+length/2,length};}}if(best&&arrow(route,best.amount,color))route.visibleArrows++;}
  }drawEndpoints();frames++;
 }

 function tick(time){
  raf=0;if(!study||document.hidden||(!compiled.paths.length&&!compiled.routes.length))return;
  if(activeData!==data()||document.body.classList.contains('source-mode')||document.body.classList.contains('board-loading')){clear();return;}
  const changed=projectPaths(),animated=playing&&routeViews.some(route=>route.directed);if(animated)phase+=Math.min(50,lastTime?time-lastTime:0)*.034;if(changed||animated)paint();lastTime=time;
  raf=requestAnimationFrame(tick);
 }
 function start(){if(!raf&&!document.hidden&&(compiled.paths.length||compiled.routes.length))raf=requestAnimationFrame(tick);}
 function setPlaying(value){playing=!!value;lastKey='';start();announce();return state();}
 // First touch anywhere on an in-scope part chooses that circuit, including
 // dense mobile BGAs where pad hit targets cover the body. Further pad taps
 // mark the terminal without silently hiding the other inputs or outputs.
 window.addEventListener('jcid:selection',()=>{if(study){const s=board.getState();focusComponent(s.component);focusedEndpoint=selectedPads.some(p=>p.id===s.pin)?s.pin:null;lastKey='';start();}});
 window.addEventListener('jcid:tool',e=>{if(e.detail!=='function-studies')clear();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;lastTime=0;}else start();});
 window.addEventListener('pagehide',clear);reduced.addEventListener('change',()=>{lastKey='';start();});
 window.addEventListener('jcid:boardloadstate',()=>{if(document.body.classList.contains('board-loading'))clear();});
 for(const event of ['jcid:document','jcid:boardchange'])window.addEventListener(event,()=>{if(study&&(activeData!==data()||document.body.classList.contains('source-mode')))clear();});
 window.NexusStudyFlow77=Object.freeze({show,clear,focusAll,focusStage:focusAll,focusComponent,setStoryStep,clearStoryStep,state,setPlaying,getEndpointGroups,focusEndpoint,setDirectionFilter});

})();
