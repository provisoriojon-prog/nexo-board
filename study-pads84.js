/* Educational terminal selection: identity-based, never every consumer of a net. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.NexusStudyPads84=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const NEUTRAL='#2453b8';
 function compile(data,flows){
  const pins=new Map((data.pins||[]).map(p=>[p.id,p])),parts=new Map((data.components||[]).map(c=>[c.id,c])),nets=new Set((data.nets||[]).map(n=>n.id).filter(id=>id!==null&&id!==undefined)),siblings=new Map(),byFlow=new Map();
  for(const p of pins.values()){if(p.via||!parts.has(p.part))continue;const key=p.part+':'+p.net;if(!siblings.has(key))siblings.set(key,[]);siblings.get(key).push(p);}
  for(const flow of flows||[]){if(!nets.has(flow.netId))continue;const targets=new Map();
   const ends=[flow.from,flow.to];if(!ends.every(end=>{const p=pins.get(end?.pinId);return p&&!p.via&&p.part===end.componentId&&p.net===flow.netId&&parts.has(p.part);}))continue;
   for(const end of ends){const exact=pins.get(end.pinId),part=parts.get(exact.part);
    for(const p of siblings.get(exact.part+':'+exact.net)||[])targets.set(p.id,{id:p.id,part:p.part,net:p.net,pin:p,partName:part.name,padName:String(p.name??''),nativeRole:end.direction||null,primary:p.id===exact.id||!!targets.get(p.id)?.primary,flowId:flow.id});
   }byFlow.set(flow.id,[...targets.values()]);
  }return{byFlow};
 }
 function select(catalog,routes,roleOf){
  const selected=new Map();for(const route of routes||[]){const role=roleOf(route),color=role==='out'?'#ff5664':role==='in'?'#62e791':NEUTRAL;
   for(const target of catalog.byFlow.get(route.id)||[]){const previous=selected.get(target.id);selected.set(target.id,{...target,color,role,primary:target.primary||!!previous?.primary,flowIds:[...new Set([...(previous?.flowIds||[]),route.id])]});}
  }return [...selected.values()];
 }
 function groups(targets){
  const result=new Map();for(const target of targets){const key=target.part+':'+target.net;if(!result.has(key))result.set(key,{key,part:target.part,net:target.net,partName:target.partName,color:target.color,role:target.role,targets:[]});result.get(key).targets.push(target);}
  return [...result.values()].map(group=>{group.targets.sort((a,b)=>a.padName.localeCompare(b.padName,undefined,{numeric:true}));group.anchor=group.targets.find(p=>p.primary)||group.targets[0];return group;});
 }
 function project(targets,projectPoint,bounds){
  return targets.map(target=>{const p=target.pin,q=projectPoint(p.x,p.y),b=p.bbox;
   const corners=Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)?[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].map(point=>projectPoint(...point)):[q];
   const left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y));
   const width=Math.max(4,right-left+2),height=Math.max(4,bottom-top+2),x=(left+right)/2,y=(top+bottom)/2;
   return{pinId:target.id,part:target.part,net:target.net,x,y,width,height,radius:Math.max(width,height)/2,color:target.color,primary:target.primary,circular:p.copper?.length===1&&p.copper[0].kind==='circle',visible:x+width/2>=0&&x-width/2<=bounds[0]&&y+height/2>=0&&y-height/2<=bounds[1]};
  });
 }
 return Object.freeze({compile,select,groups,project,neutralColor:NEUTRAL});
});
