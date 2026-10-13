/* Pure temporary composition. Source maps are never mutated or linked by name. */
(function(global){
 'use strict';
 const clone=value=>structuredClone(value),own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj||{},key),id=()=>[1,0,0,1,0,0];
 const finite=Number.isFinite,box=b=>Array.isArray(b)&&b.length===4&&b.every(finite)&&b[2]>=b[0]&&b[3]>=b[1];
 const safe=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,180}$/.test(value);
 const unique=values=>[...new Set(values)],mapIds=(values,map)=>(values||[]).map(value=>map[value]).filter(value=>value!==undefined);
 const combineBox=(a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
 const offsetBox=(b,dx,dy)=>box(b)?[b[0]+dx,b[1]+dy,b[2]+dx,b[3]+dy]:b;
 function shape(data){
  if(data?.version!==2||!box(data.bounds)||!['components','pins','nets','boards','layers'].every(k=>Array.isArray(data[k]))||!data.components.length||!data.pins.length||!data.boards.length)throw Error('Escolha um mapa interativo com componentes e pads.');
  for(const key of ['components','nets'])if(new Set(data[key].map(x=>x.id)).size!==data[key].length||data[key].some(x=>!Number.isSafeInteger(x.id)||x.id<0))throw Error('O mapa contém identificações inválidas.');
  if(data.pins.some((p,i)=>p.id!==i||!finite(p.x)||!finite(p.y)||!box(p.bbox)))throw Error('A numeração ou as posições dos pads são inválidas.');
  for(const key of ['boards','layers'])if(new Set(data[key].map(x=>String(x.id))).size!==data[key].length)throw Error('O mapa contém vistas ou camadas duplicadas.');
 }
 function source(meta){if(!meta||!safe(meta.itemId)||!safe(meta.modelId))throw Error('A identificação do arquivo de origem é inválida.');return {...meta,label:String(meta.label||meta.itemId).slice(0,180)};}
 function initialize(data){
  const geometry=global.NexusBoardGeometry;if(!geometry)throw Error('O editor de posições não está disponível.');
  // Geometry gestures share unchanged immutable records. Joining deliberately
  // translates/remaps the entire document below, so it needs its own mutable
  // copy before initialization (including unselected outlines, nets and traces).
  return geometry.transform(clone(data),data.boards[0].id,id());
 }
 function parts(data,meta){
  if(data.nexusComposition){const composition=data.nexusComposition;if(composition.version!==1||!Array.isArray(composition.parts)||!composition.parts.length)throw Error('A composição de origem é inválida.');const result=clone(composition.parts);for(const part of result)if(own(meta.imageSources,part.id))part.imageSource=meta.imageSources[part.id];return result;}
  return [{id:'part-0',sourceItemId:meta.itemId,sourceModelId:meta.modelId,label:meta.label,componentIds:data.components.map(c=>c.id),pinIds:data.pins.map(p=>p.id),netIds:data.nets.map(n=>n.id),boardIds:data.boards.map(b=>String(b.id)),layerIds:data.layers.map(l=>l.id),imageSource:meta.imageSource??data.imageSource??null,imageBounds:clone(data.nexusGeometry.imageBounds),unassignedImageTransform:id(),source:clone(data.source||{})}];
 }
 function ncPins(data){
  const result=new Set(data.ncDisplay?.jcidDisplayNcPinIds||[]),nets=new Map(data.nets.map(n=>[n.id,n])),ambiguous=new Set(),byPart=new Map();
  const names=new Set(['NC','N-C','N_C','N.C.','N/C','NO CONNECT','NOT CONNECTED','UNCONNECTED']);
  for(const p of data.pins){if(!byPart.has(p.part))byPart.set(p.part,[]);byPart.get(p.part).push(p);}
  const src=data.source;let verified=src?.zip_eof===true&&src.cipher_roundtrip===true&&/^[a-f0-9]{64}$/i.test(src.sha256||'');
  for(const note of data.notes||[])if(note?.kind==='ambiguous_source_pin_nets'){if(!Array.isArray(note.pins)){verified=false;continue;}for(const ref of note.pins){const p=byPart.get(ref.part)?.[ref.localPin];if(p)ambiguous.add(p.id);else verified=false;}}
  for(const p of data.pins){const net=nets.get(p.net),name=String(net?.sourceName??net?.name??'').trim().toUpperCase();if(names.has(name)||verified&&p.net===null&&!ambiguous.has(p.id))result.add(p.id);}
  return [...result];
 }
 function numericMap(rows,start){return Object.fromEntries(rows.map((row,i)=>[row.id,start+i]));}
 function nextNumber(rows){let n=0;for(const row of rows)if(Number.isSafeInteger(Number(row.id)))n=Math.max(n,Number(row.id)+1);return n;}
 function translate(data,dx,dy){
  const point=p=>[p[0]+dx,p[1]+dy],arc=a=>{if(Array.isArray(a)&&a.length>=6)for(let i=0;i<6;i+=2){a[i]+=dx;a[i+1]+=dy;}};
  for(const b of data.boards){b.points=(b.points||[]).map(point);b.bbox=offsetBox(b.bbox,dx,dy);}
  for(const c of data.components){c.x+=dx;c.y+=dy;c.bbox=offsetBox(c.bbox,dx,dy);for(const o of c.outlines||[]){if(o.points)o.points=o.points.map(point);if(o.arc)arc(o.arc);if(o.bbox)o.bbox=offsetBox(o.bbox,dx,dy);}const g=data.labelGeometry?.[c.id];if(g){if(Array.isArray(g.center))g.center=point(g.center);for(const key of ['bbox','body_bbox'])if(g[key])g[key]=offsetBox(g[key],dx,dy);if(finite(g.x)&&finite(g.y)){g.x+=dx;g.y+=dy;}}}
  for(const p of data.pins){p.x+=dx;p.y+=dy;p.bbox=offsetBox(p.bbox,dx,dy);for(const c of p.copper||[]){c.x+=dx;c.y+=dy;if(c.bbox)c.bbox=offsetBox(c.bbox,dx,dy);}}
  for(const l of data.layers){for(const s of l.segments||[]){s[0]+=dx;s[1]+=dy;s[2]+=dx;s[3]+=dy;}for(const a of l.arcs||[])arc(a);}
  for(const m of Object.values(data.nexusGeometry.boardTransforms)){m[4]+=dx;m[5]+=dy;}
  data.bounds=offsetBox(data.bounds,dx,dy);
 }
 function rekey(entries,map){const out={};for(const [key,value]of Object.entries(entries||{})){const target=map[key];if(target!==undefined)out[target]=value;}return out;}
 function merge(baseInput,additionInput,metadata={}){
  shape(baseInput);shape(additionInput);const baseMeta=source(metadata.base),addMeta=source(metadata.addition);
  if(baseMeta.modelId!==addMeta.modelId)throw Error('A Junção aceita apenas mapas da mesma pasta de aparelho.');
  const base=initialize(baseInput),add=initialize(additionInput),baseParts=parts(base,baseMeta),addedParts=parts(add,addMeta);
  const baseSources=unique([baseMeta.itemId,...(base.nexusComposition?.sourceItemIds||baseParts.map(p=>p.sourceItemId))]),addSources=unique([addMeta.itemId,...(add.nexusComposition?.sourceItemIds||addedParts.map(p=>p.sourceItemId))]);
  if(addSources.some(value=>baseSources.includes(value)))throw Error('Este mapa já faz parte da junção.');
  const gap=metadata.gap??Math.max(base.bounds[2]-base.bounds[0],base.bounds[3]-base.bounds[1],add.bounds[2]-add.bounds[0],add.bounds[3]-add.bounds[1])*0.05;
  if(!finite(gap)||gap<0)throw Error('O espaçamento entre mapas é inválido.');
  const dx=base.bounds[2]+gap-add.bounds[0],dy=base.bounds[3]-add.bounds[3],ncBase=ncPins(base),ncAdd=ncPins(add);
  translate(add,dx,dy);
  // Source files give vias virtual part IDs with no component. Reserve them too:
  // otherwise a previously unowned via could accidentally attach to a new part.
  const componentRefs=unique([...add.components.map(c=>c.id),...add.pins.map(p=>p.part).filter(v=>Number.isSafeInteger(v)&&v>=0)]),reservedParts=[...base.components,...base.pins.filter(p=>Number.isSafeInteger(p.part)&&p.part>=0).map(p=>({id:p.part}))];
  const componentMap=numericMap(componentRefs.map(id=>({id})),nextNumber(reservedParts)),pinMap=numericMap(add.pins,base.pins.length),netMap=numericMap(add.nets,nextNumber(base.nets)),layerMap=numericMap(add.layers,nextNumber(base.layers)),boardMap={},partMap={},usedParts=new Set(baseParts.map(p=>p.id)),usedBoards=new Set(base.boards.map(b=>String(b.id)));
  let partSeq=baseParts.length;
  for(const p of addedParts){let next;do{next='part-'+partSeq++;}while(usedParts.has(next));partMap[p.id]=next;usedParts.add(next);}
  let boardSeq=0;for(const b of add.boards){let next;do{next='join-'+baseParts.length+'-'+boardSeq++;}while(usedBoards.has(next));boardMap[b.id]=next;usedBoards.add(next);}
  const ownerComponent=new Map(),ownerPin=new Map(),ownerNet=new Map(),ownerLayer=new Map();
  for(const p of addedParts){for(const v of p.componentIds)ownerComponent.set(v,partMap[p.id]);for(const v of p.pinIds)ownerPin.set(v,partMap[p.id]);for(const v of p.netIds)ownerNet.set(v,partMap[p.id]);for(const v of p.layerIds)ownerLayer.set(v,partMap[p.id]);}
  for(const c of add.components){const before=c.id;c.sourceComponentId??=before;c.sourceOriginalView??=c.sourceView??c.view;c.sourceItemId??=addMeta.itemId;c.compositionPartId=ownerComponent.get(before);c.sourceView=c.compositionPartId+'|'+String(c.sourceOriginalView??'');c.id=componentMap[before];c.pins=mapIds(c.pins,pinMap);if(c.view!==null&&c.view!==undefined)c.view=boardMap[c.view]??null;}
  for(const p of add.pins){const before=p.id;p.id=pinMap[before];p.part=p.part===null||p.part===undefined||p.part<0?p.part:componentMap[p.part]??null;p.net=p.net===null||p.net===undefined?p.net:netMap[p.net]??null;p.compositionPartId=ownerPin.get(before);for(const key of ['startLayer','endLayer'])if(own(layerMap,p[key]))p[key]=layerMap[p[key]];}
  for(const n of add.nets){const before=n.id;n.id=netMap[before];n.pins=mapIds(n.pins,pinMap);n.compositionPartId=ownerNet.get(before);}
  for(const b of add.boards){b.sourceBoardId??=b.id;b.id=boardMap[b.id];}
  for(const l of add.layers){const before=l.id;l.id=layerMap[before];l.sourceLayerId??=before;l.compositionPartId=ownerLayer.get(before);l.sourceLabel??=l.label;l.label=addMeta.label+' · '+l.sourceLabel;for(const t of l.segments||[])if(t[5]!==null&&t[5]!==undefined)t[5]=netMap[t[5]]??null;for(const t of l.arcs||[])if(t[8]!==null&&t[8]!==undefined)t[8]=netMap[t[8]]??null;}
  const targetGeometry=base.nexusGeometry,geometry=add.nexusGeometry,owner=value=>value===null?null:boardMap[value]??null;
  Object.assign(targetGeometry.boardTransforms,rekey(geometry.boardTransforms,boardMap));Object.assign(targetGeometry.sourceBoardPoints,rekey(geometry.sourceBoardPoints,boardMap));
  for(const [kind,map]of [['components',componentMap],['pins',pinMap]])for(const [old,value]of Object.entries(geometry.owners[kind]))targetGeometry.owners[kind][map[old]]=owner(value);
  for(const kind of ['segments','arcs'])for(const [old,list]of Object.entries(geometry.owners[kind]))targetGeometry.owners[kind][layerMap[old]]=list.map(owner);
  for(const key of ['components','pins','nets','boards','layers'])for(const row of add[key])base[key].push(row);
  base.labelGeometry={...(base.labelGeometry||{}),...rekey(add.labelGeometry,componentMap)};
  base.readings={...(base.readings||{label:'Diodo'}),pins:{...(base.readings?.pins||{}),...rekey(add.readings?.pins,pinMap)}};
  base.ncDisplay={...(base.ncDisplay||{}),jcidDisplayNcPinIds:unique([...ncBase,...mapIds(ncAdd,pinMap)])};
  base.nexusPersonal={version:1,values:{...(base.nexusPersonal?.values||{}),...rekey(add.nexusPersonal?.values,pinMap)},rffe:{notes:{},marks:[]},...(base.nexusPersonal?.view?{view:base.nexusPersonal.view}:{})};
  const addedNotes=clone(add.notes||[]);for(const n of addedNotes)if(n?.kind==='ambiguous_source_pin_nets'&&Array.isArray(n.pins))for(const ref of n.pins)ref.part=componentMap[ref.part];base.notes=[...(base.notes||[]),...addedNotes];
  const newParts=addedParts.map(p=>({...p,id:partMap[p.id],componentIds:mapIds(p.componentIds,componentMap),pinIds:mapIds(p.pinIds,pinMap),netIds:mapIds(p.netIds,netMap),boardIds:mapIds(p.boardIds,boardMap).map(String),layerIds:mapIds(p.layerIds,layerMap),unassignedImageTransform:(()=>{const m=clone(p.unassignedImageTransform||id());m[4]+=dx;m[5]+=dy;return m;})()}));
  base.nexusComposition={version:1,modelId:baseMeta.modelId,sourceItemIds:unique([...baseSources,...addSources]),parts:[...baseParts,...newParts]};
  base.source={kind:'nexus-composition',sources:base.nexusComposition.parts.map(p=>({itemId:p.sourceItemId,source:p.source||{}}))};
  base.bounds=combineBox(base.bounds,add.bounds);delete base.rffeCatalog;delete base.imageSource;
  if(metadata.revision!==undefined){if(typeof metadata.revision!=='string'||metadata.revision.length>100)throw Error('A revisão da junção é inválida.');base.nexusRevision=metadata.revision;}
  base.stats={...(base.stats||{}),components:base.components.length,pins:base.pins.length,nets:base.nets.length,vias:base.pins.filter(p=>p.via).length};
  return {data:base,maps:{componentMap,pinMap,netMap,layerMap,boardMap,partMap},partIds:newParts.map(p=>p.id),offset:{dx,dy},changed:true};
 }
 const api=Object.freeze({merge});global.NexusBoardComposition=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
