/* Pure board topology commands. No storage, DOM, rendering, or revision changes. */
(() => {
 'use strict';
 const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
 const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 const unique=values=>[...new Set(values)];
 const clone=value=>value===undefined?undefined:structuredClone(value);
 const name=value=>{if(typeof value!=='string')throw Error('Informe um nome.');const result=value.trim();if(!result||result.length>180||/[\x00-\x1f\x7f]/.test(result))throw Error('Use um nome com ate 180 caracteres, sem quebras de linha.');return result;};
 const originalNames=net=>unique([net.sourceName??net.name,...(Array.isArray(net.sourceNames)?net.sourceNames:[]),net.name].filter(n=>typeof n==='string'&&n));
 function shape(data){
  if(!object(data)||!['components','pins','nets'].every(key=>Array.isArray(data[key])))throw Error('Dados da placa indisponiveis.');
  for(const key of ['components','nets'])if(new Set(data[key].map(row=>row.id)).size!==data[key].length||data[key].some(row=>!Number.isSafeInteger(row.id)||row.id<0))throw Error('IDs invalidos na placa.');
  if(data.pins.some((pin,index)=>!pin||pin.id!==index))throw Error('A numeracao dos pads esta inconsistente.');
 }
 function sourceIdentity(data){
  for(const c of data.components){c.sourceComponentName??=c.name;c.sourceComponentId??=c.id;c.sourceX??=c.x;c.sourceY??=c.y;c.sourceView??=c.view;}
  for(const p of data.pins){p.sourcePinId??=p.id;p.sourceX??=p.x;p.sourceY??=p.y;}
 }
 function rekey(value,map){
  if(!object(value)&&!Array.isArray(value))return value;
  const result=Array.isArray(value)?[]:{};
  for(const [key,entry] of Object.entries(value)){if(!/^\d+$/.test(key)){result[key]=entry;continue;}const next=map[key];if(next!==null&&next!==undefined)result[next]=entry;}
  return result;
 }
 function remapList(list,map){return unique((Array.isArray(list)?list:[]).map(id=>map[id]).filter(id=>id!==null&&id!==undefined));}
 function remapSnapshot(saved,data,maps){
  if(!object(saved))return saved;
  const result=clone(saved),{pinMap,netMap,componentMap}=maps,nets=new Map(data.nets.map(n=>[n.id,n]));
  for(const [field,map] of [['pin',pinMap],['net',netMap],['component',componentMap],['hover',pinMap],['hoverComponent',componentMap]])if(own(result,field))result[field]=result[field]===null?null:map[result[field]]??null;
  for(const [field,map] of [['toolPins',pinMap],['toolNets',netMap],['toolComponents',componentMap],['markedComponents',componentMap],['netColorChecked',netMap]])if(Array.isArray(result[field]))result[field]=remapList(result[field],map);
  if(Array.isArray(result.netColors)){
   // A destination net's explicit color wins over colors inherited from sources.
   const destination=new Map();for(const item of result.netColors)if(netMap[item.id]===item.id)destination.set(item.id,item);
   const rows=new Map();for(const item of result.netColors){const id=netMap[item.id];if(id===null||id===undefined||!nets.has(id)||rows.has(id))continue;rows.set(id,{...(destination.get(id)||item),id,name:nets.get(id).name});}
   result.netColors=[...rows.values()];if(Array.isArray(result.netColorChecked))result.netColorChecked=result.netColorChecked.filter(id=>rows.has(id));if(!rows.size)result.netColorIsolation=false;
  }
  return result;
 }
 function componentAliases(part){return unique([part.name,part.sourceComponentName,...(part.componentAliases||[])].filter(value=>typeof value==='string'));}
 function renameComponentReferences(data,part,newName){
  const oldName=part.name,aliases=componentAliases(part),matches=value=>typeof value==='string'&&aliases.includes(value);
  for(const bus of data.rffeCatalog?.buses||[]){
   for(const device of bus.devices||[])if(device.componentId===part.id||matches(device.component)){device.sourceComponentName??=device.component;device.component=newName;}
   if(Array.isArray(bus.excludeDevices))bus.excludeDevices=bus.excludeDevices.map(value=>matches(value)?newName:value);
   for(const device of bus.linkedComponents||[])if(device.id===part.id||matches(device.name))device.name=newName;
  }
  const rffe=data.nexusPersonal?.rffe;
  if(object(rffe?.notes))for(const notes of Object.values(rffe.notes))if(object(notes)&&own(notes,oldName)){notes[newName]=notes[oldName];if(oldName!==newName)delete notes[oldName];}
  if(Array.isArray(rffe?.marks))rffe.marks=unique(rffe.marks.map(value=>value===oldName?newName:value));
 }
 function deleteComponentReferences(data,part){
  const aliases=componentAliases(part),matches=value=>typeof value==='string'&&aliases.includes(value);
  for(const bus of data.rffeCatalog?.buses||[]){
   if(Array.isArray(bus.devices))bus.devices=bus.devices.filter(device=>device.componentId!==part.id&&!matches(device.component));
   if(Array.isArray(bus.excludeDevices))bus.excludeDevices=bus.excludeDevices.filter(value=>!matches(value));
   if(Array.isArray(bus.linkedComponents))bus.linkedComponents=bus.linkedComponents.filter(device=>device.id!==part.id&&!matches(device.name));
  }
  const rffe=data.nexusPersonal?.rffe;
  if(object(rffe?.notes))for(const notes of Object.values(rffe.notes))if(object(notes))for(const alias of aliases)delete notes[alias];
  if(Array.isArray(rffe?.marks))rffe.marks=rffe.marks.filter(value=>!matches(value));
  if(object(data.labelGeometry))delete data.labelGeometry[part.id];
  if(Array.isArray(data.notes))for(const note of data.notes)if(note?.kind==='ambiguous_source_pin_nets'&&Array.isArray(note.pins))note.pins=note.pins.filter(ref=>ref.part!==part.id);
 }
 function remapPins(data,map){
  for(const c of data.components)if(Array.isArray(c.pins))c.pins=remapList(c.pins,map);
  for(const net of data.nets)net.pins=remapList(net.pins,map);
  if(data.readings?.pins)data.readings.pins=rekey(data.readings.pins,map);
  if(data.ncDisplay?.jcidDisplayNcPinIds)data.ncDisplay.jcidDisplayNcPinIds=remapList(data.ncDisplay.jcidDisplayNcPinIds,map);
  if(data.nexusPersonal?.values)data.nexusPersonal.values=rekey(data.nexusPersonal.values,map);
  if(data.nexusGeometry?.owners?.pins)data.nexusGeometry.owners.pins=rekey(data.nexusGeometry.owners.pins,map);
 }

 const NC_NAMES=new Set(['NC','N-C','N_C','N.C.','N/C','NO CONNECT','NOT CONNECTED','UNCONNECTED']);
 const isUnconnected=net=>[net.name,net.sourceName,...(Array.isArray(net.sourceNames)?net.sourceNames:[])].some(value=>typeof value==='string'&&NC_NAMES.has(value.trim().toUpperCase()));
 const connectionCache=new WeakMap();
 const canonicalName=net=>String(net?.sourceName??net?.name??'').trim().toUpperCase();
 function connectionIndex(data){
  let index=connectionCache.get(data);if(index)return index;shape(data);
  const nets=new Map(data.nets.map(net=>[net.id,net])),members=new Map();
  // pin.net is authoritative. Original net.pins arrays can omit vias; those
  // must still be selected/transformed with their electrically connected net.
  for(const pin of data.pins){if(!nets.has(pin.net))continue;if(!members.has(pin.net))members.set(pin.net,[]);members.get(pin.net).push(pin.id);}
  index={nets,members};connectionCache.set(data,index);return index;
 }
 function connectedGroups(data,ids){
  if(!Array.isArray(ids)||ids.some(id=>!Number.isSafeInteger(id)||!data?.pins?.[id]))throw Error('Selecione pads válidos para transformar.');
  const index=connectionIndex(data),groups=new Map();
  for(const id of ids){
   const pin=data.pins[id],net=index.nets.get(pin.net);
   // Source NC buckets do not prove any electrical connection. A line which
   // the editor deliberately converted to NC retains an explicit lineage bit
   // so its original connected group survives serialization and later edits.
   const connected=!!net&&(!NC_NAMES.has(canonicalName(net))||net.nexusConnectedNc===true),key=connected?'net:'+net.id:'pin:'+id;
   if(!groups.has(key))groups.set(key,{netId:net?.id??null,connected,ids:connected?index.members.get(net.id):[id]});
  }
  return [...groups.values()];
 }
 function connectedPadIds(data,ids){return connectedGroups(data,ids).flatMap(group=>group.ids);}
 function setPadKind(data,op,netMap,original){
  if(!['ground','nc','signal'].includes(op.kind))throw Error('Escolha GND, NC ou Amarelo.');
  if(!Array.isArray(op.ids)||!op.ids.length)throw Error('Selecione pads válidos para transformar.');
  const groups=connectedGroups(original,op.ids);
  const classifier=globalThis.JCIDPadKinds?.create(original,original.ncDisplay);
  if(!classifier)throw Error('A classificação dos pads não está disponível. Reabra o mapa.');
  const padIds=groups.flatMap(group=>group.ids),nets=new Map(data.nets.map(net=>[net.id,net])),changedPadIds=[],newNetIds=[],touchedNets=new Set();
  const explicit=new Set(data.ncDisplay?.jcidDisplayNcPinIds||[]),parts=data.nexusComposition?.parts||[],pinPart=new Map();
  for(const part of parts)for(const id of part.pinIds)pinPart.set(id,part);
  const usedNames=new Set(data.nets.flatMap(originalNames).map(value=>value.trim().toUpperCase()));
  let nextNetId=0,nextName=1;for(const net of data.nets)nextNetId=Math.max(nextNetId,net.id+1);
  const freshName=()=>{let value;do{value='NetName_'+nextName++;}while(usedNames.has(value.toUpperCase()));usedNames.add(value.toUpperCase());return value;};
  const createNet=(netName,part)=>{
   if(!Number.isSafeInteger(nextNetId))throw Error('A placa atingiu o limite de identificações de linhas.');
   // A new electrical line has a new canonical name. Inheriting the old GND/NC
   // alias would classify a yellow pad as ground/NC again after export/import.
   const net={id:nextNetId++,name:netName,sourceName:netName,pins:[]};
   if(part){net.compositionPartId=part.id;part.netIds.push(net.id);}
   data.nets.push(net);nets.set(net.id,net);netMap[net.id]=net.id;newNetIds.push(net.id);return net;
  };
  for(const group of groups){
   const oldNet=nets.get(group.netId),source=canonicalName(oldNet),validSignal=!!oldNet&&source!=='GND'&&!NC_NAMES.has(source)&&!!oldNet.name.trim();
   const sameKind=group.ids.every(id=>classifier.kind(original.pins[id])===op.kind);
   if(sameKind&&(op.kind!=='signal'||validSignal))continue;
   const target=group.connected?oldNet:createNet(op.kind==='signal'?freshName():op.kind==='ground'?'GND':'NC',pinPart.get(group.ids[0]));
   // Keep an existing electrical net's ID and all its trace associations. Only
   // unconnected source NC/missing-net pads need a new independent net record.
   if(group.connected){
    if(op.kind==='signal'?!validSignal:source!==(op.kind==='ground'?'GND':'NC')){
     target.name=op.kind==='signal'?freshName():op.kind==='ground'?'GND':'NC';target.sourceName=target.name;delete target.sourceNames;
    }
    if(op.kind==='nc')target.nexusConnectedNc=true;else delete target.nexusConnectedNc;
   }
   if(oldNet)touchedNets.add(oldNet.id);touchedNets.add(target.id);
   for(const id of group.ids){data.pins[id].net=target.id;changedPadIds.push(id);if(op.kind==='nc')explicit.add(id);else explicit.delete(id);}
  }
  if(changedPadIds.length){
   // Rebuild only the affected memberships in one pass, including the case
   // where an explicit NC pad was already attached to the target GND net.
   for(const id of touchedNets)nets.get(id).pins=[];
   for(const pin of data.pins)if(touchedNets.has(pin.net))nets.get(pin.net).pins.push(pin.id);
   if(data.ncDisplay||explicit.size)data.ncDisplay={...(data.ncDisplay||{}),jcidDisplayNcPinIds:[...explicit]};
  }
  return {changed:changedPadIds.length>0,padIds,changedPadIds,newNetIds,groupCount:groups.length,padKind:op.kind};
 }
 function refreshPadSelection(saved,data,ids){
  if(!object(saved))return;
  const changed=new Set(ids),classifier=globalThis.JCIDPadKinds.create(data,data.ncDisplay);
  if(changed.has(saved.pin)){
   const pin=data.pins[saved.pin];if(classifier.selectable(pin))saved.net=pin.net;else saved.pin=saved.net=null;
  }
  if(changed.has(saved.hover)&&!classifier.selectable(data.pins[saved.hover]))saved.hover=null;
  if(Array.isArray(saved.toolPins))saved.toolPins=saved.toolPins.filter(id=>!changed.has(id)||classifier.selectable(data.pins[id]));
 }
 function connectCompositionNets(data,netMap){
  const parts=data.nexusComposition?.parts;
  if(!Array.isArray(parts)||parts.length<2||parts.some(p=>!object(p)||typeof p.id!=='string'||!Array.isArray(p.netIds)))throw Error('Junte dois mapas antes de conectar os nomes iguais.');
  const membership=new Map(),groups=new Map(),skippedNcNetIds=[];
  for(const part of parts)for(const netId of part.netIds){if(!own(netMap,netId))throw Error('As linhas da junção estão inconsistentes.');if(!membership.has(netId))membership.set(netId,new Set());membership.get(netId).add(part.id);}
  for(const net of data.nets){
   if(isUnconnected(net)){skippedNcNetIds.push(net.id);continue;}
   if(typeof net.name!=='string'||!net.name.trim())continue;
   if(!groups.has(net.name))groups.set(net.name,[]);groups.get(net.name).push(net);
  }
  const removed=new Set(),linkedGroups=[];
  for(const [netName,sources] of groups){
   if(sources.length<2)continue;
   const partIds=unique(sources.flatMap(net=>[...(membership.get(net.id)||[])]));
   if(partIds.length<2)continue;
   sources.sort((a,b)=>a.id-b.id);const target=sources[0],merged=sources.slice(1);
   target.sourceName??=target.name;target.sourceNames=unique(sources.flatMap(originalNames));
   target.pins=unique(sources.flatMap(net=>net.pins||[]));
   for(const net of merged){netMap[net.id]=target.id;removed.add(net.id);}
   linkedGroups.push({name:netName,netId:target.id,mergedNetIds:merged.map(net=>net.id),partIds});
  }
  if(removed.size){
   for(const pin of data.pins)if(removed.has(pin.net))pin.net=netMap[pin.net];
   for(const layer of data.layers||[]){for(const trace of layer.segments||[])if(removed.has(trace[5]))trace[5]=netMap[trace[5]];for(const trace of layer.arcs||[])if(removed.has(trace[8]))trace[8]=netMap[trace[8]];}
   data.nets=data.nets.filter(net=>!removed.has(net.id));
  }
  return {changed:removed.size>0,linkedGroups,connectedNameCount:linkedGroups.length,mergedNetCount:removed.size,mergedNetIds:[...removed],skippedNcNetIds};
 }
 function apply(input,operation,snapshot){
  shape(input);if(!object(operation))throw Error('Operacao invalida.');
  const data=clone(input),op=clone(operation),type=op.type||op.kind;
  const pinMap=Object.fromEntries(data.pins.map(p=>[p.id,p.id])),netMap=Object.fromEntries(data.nets.map(n=>[n.id,n.id])),componentMap=Object.fromEntries(data.components.map(c=>[c.id,c.id]));
  const maps={pinMap,netMap,componentMap};sourceIdentity(data);let changed=false,details={};
  if(type==='renameComponent'){
   const part=data.components.find(c=>c.id===op.id);if(!part)throw Error('Componente nao encontrado.');const next=name(op.name);
   if(data.components.some(c=>c.id!==part.id&&c.name.toUpperCase()===next.toUpperCase()))throw Error('Outro componente ja usa esse nome.');
   details={componentId:part.id,before:part.name,after:next};
   if(part.name!==next){renameComponentReferences(data,part,next);part.componentAliases=unique([...(part.componentAliases||[]),part.name]);part.name=next;if(data.labelGeometry?.[part.id])data.labelGeometry[part.id].name=next;changed=true;}
  }else if(type==='setComponentNameVisibility'){
   const part=data.components.find(c=>c.id===op.id);if(!part)throw Error('Componente não encontrado.');if(typeof op.visible!=='boolean')throw Error('Visibilidade inválida.');
   changed=(part.nameVisible!==false)!==op.visible;part.nameVisible=op.visible;details={componentId:part.id,visible:op.visible};
  }else if(type==='renameNet'){
   const net=data.nets.find(n=>n.id===op.id);if(!net)throw Error('Linha nao encontrada.');const next=name(op.name),before=net.name;
   const matches=op.linkSameNames===true?data.nets.filter(n=>n.id!==net.id&&n.name===next):[];
   const target=matches.length?[...matches].sort((a,b)=>a.id-b.id)[0]:net;
   const sources=unique([net,...matches]),aliases=unique([target,...sources].flatMap(originalNames));
   if(net.name!==next||matches.length){target.sourceName??=target.name;target.sourceNames=aliases;target.name=next;
    const removed=new Set(sources.filter(n=>n!==target).map(n=>n.id));for(const id of removed)netMap[id]=target.id;
    for(const p of data.pins)if(removed.has(p.net))p.net=target.id;
    target.pins=unique(sources.flatMap(n=>n.pins||[]));data.nets=data.nets.filter(n=>!removed.has(n.id));
    for(const layer of data.layers||[]){for(const trace of layer.segments||[])if(removed.has(trace[5]))trace[5]=target.id;for(const trace of layer.arcs||[])if(removed.has(trace[8]))trace[8]=target.id;}
    changed=true;
   }
   details={netId:target.id,sourceNetId:net.id,before,after:next,mergedNetIds:sources.filter(n=>n!==target).map(n=>n.id)};
  }else if(type==='connectCompositionNets'){
   const result=connectCompositionNets(data,netMap);changed=result.changed;details=result;
  }else if(type==='setPadKind'){
   const result=setPadKind(data,op,netMap,input);changed=result.changed;details=result;
  }else throw Error('Operacao de edicao desconhecida.');
  if(data.nexusComposition)for(const part of data.nexusComposition.parts)part.netIds=remapList(part.netIds,netMap);
  if(data.nexusPersonal?.view)data.nexusPersonal.view=remapSnapshot(data.nexusPersonal.view,data,maps);
  const nextSnapshot=remapSnapshot(snapshot,data,maps);
  if(type==='setPadKind'&&changed){refreshPadSelection(nextSnapshot,data,details.changedPadIds);refreshPadSelection(data.nexusPersonal?.view,data,details.changedPadIds);}
  if(changed&&object(data.stats)){data.stats.components=data.components.length;data.stats.pins=data.pins.length;data.stats.vias=data.pins.filter(p=>p.via).length;data.stats.nets=data.nets.length;}
  return {data,snapshot:nextSnapshot,changed,type,...details,...maps};
 }
 globalThis.NexusBoardTopology=Object.freeze({apply,connectedPadIds});
})();
