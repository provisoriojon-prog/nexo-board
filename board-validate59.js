const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const box=value=>Array.isArray(value)&&value.length===4&&value.every(Number.isFinite)&&value[2]>=value[0]&&value[3]>=value[1];
const id=value=>Number.isSafeInteger(value)&&value>=0;
// Increment whenever geometry validation rules (including the helpers) change.
export const BOARD_VALIDATOR_VERSION66=1;
export function validateBoard(data,files){
 const fail=()=>{throw Error('O pacote contém uma placa inválida. A versão anterior foi mantida.');};
 if(data?.version!==2||!box(data.bounds)||data.bounds[2]===data.bounds[0]||data.bounds[3]===data.bounds[1]||!['components','pins','boards','nets','layers'].every(k=>Array.isArray(data[k]))||!data.pins.length||!data.components.length)fail();
 const netIds=new Set(),partIds=new Set();
 for(const net of data.nets){if(!plain(net)||!id(net.id)||netIds.has(net.id)||typeof net.name!=='string'||!Array.isArray(net.pins)||net.sourceName!==undefined&&typeof net.sourceName!=='string')fail();netIds.add(net.id);}
 for(const part of data.components){if(!plain(part)||!id(part.id)||partIds.has(part.id)||!box(part.bbox)||typeof part.name!=='string'||part.nameVisible!==undefined&&typeof part.nameVisible!=='boolean')fail();partIds.add(part.id);}
 if(!data.pins.every((pin,i)=>plain(pin)&&pin.id===i&&Number.isFinite(pin.x)&&Number.isFinite(pin.y)&&box(pin.bbox)))fail();
 const identified=rows=>rows.every(row=>plain(row)&&(id(row.id)||typeof row.id==='string'))&&new Set(rows.map(row=>row.id)).size===rows.length;
 if(!identified(data.boards)||!identified(data.layers))fail();
 for(const net of data.nets)if(net.pins.some(pin=>!id(pin)||!data.pins[pin]||data.pins[pin].net!==net.id))fail();
 if(data.imageSource){const file=files.get(data.imageSource);if(!file||!/^image\//.test(file.type))throw Error('Faltam os desenhos dos componentes neste pacote. A versão anterior foi mantida.');}
 if(data.nexusPersonal!==undefined){const p=data.nexusPersonal;if(!plain(p)||p.version!==1||!plain(p.values)||!plain(p.rffe)||!plain(p.rffe.notes)||!Array.isArray(p.rffe.marks))fail();
  for(const [pin,values] of Object.entries(p.values)){if(!data.pins[pin]||!plain(values))fail();for(const kind of ['diode','smb'])if(values[kind]!=null&&(typeof values[kind]!=='string'||values[kind].length>256))fail();}
  if(p.rffe.marks.some(name=>typeof name!=='string'||name.length>180))fail();
  for(const notes of Object.values(p.rffe.notes)){if(!plain(notes))fail();if(Object.values(notes).some(note=>typeof note!=='string'||note.length>500))fail();}
  const v=p.view;if(v!==undefined&&(!plain(v)||!plain(v.objects)||!Array.isArray(v.layers)||!Array.isArray(v.netColors)||!Array.isArray(v.netColorChecked)||v.netColors.some(c=>!id(c?.id)||!/^#[a-f0-9]{6}$/i.test(c.color))))fail();
 }
 const names=value=>Array.isArray(value)&&value.every(v=>typeof v==='string'&&v.length<=256);
 for(const net of data.nets)if(net.sourceNames!==undefined&&!names(net.sourceNames))fail();
 for(const part of data.components)if(part.sourceComponentName!==undefined&&typeof part.sourceComponentName!=='string'||part.componentAliases!==undefined&&!names(part.componentAliases))fail();
 if(data.nexusGeometry!==undefined){const g=data.nexusGeometry;if(!plain(g)||g.version!==1||!box(g.imageBounds)||!plain(g.boardTransforms)||!plain(g.owners)||!['components','pins','segments','arcs'].every(k=>plain(g.owners[k])))fail();
  const boardIds=new Set(data.boards.map(b=>String(b.id))),owner=v=>v===null||boardIds.has(v);
  for(const b of data.boards){const m=g.boardTransforms[String(b.id)];if(!Array.isArray(m)||m.length!==6||!m.every(Number.isFinite)||Math.abs(Math.abs(m[0]*m[3]-m[1]*m[2])-1)>1e-5)fail();}
  for(const key of ['components','pins'])if(!Object.values(g.owners[key]).every(owner))fail();
  for(const key of ['segments','arcs'])for(const row of Object.values(g.owners[key]))if(!Array.isArray(row)||!row.every(owner))fail();
 }
 if(data.nexusComposition!==undefined){
  const c=data.nexusComposition,safe=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,180}$/.test(value),matrix=value=>Array.isArray(value)&&value.length===6&&value.every(Number.isFinite)&&Math.abs(Math.abs(value[0]*value[3]-value[1]*value[2])-1)<1e-5;
  if(!plain(c)||c.version!==1||!safe(c.modelId)||!Array.isArray(c.sourceItemIds)||!c.sourceItemIds.length||!c.sourceItemIds.every(safe)||!Array.isArray(c.parts)||c.parts.length<2||!data.nexusGeometry)fail();
  const ids=new Set(),sets={componentIds:partIds,pinIds:new Set(data.pins.map(p=>p.id)),netIds,boardIds:new Set(data.boards.map(b=>String(b.id))),layerIds:new Set(data.layers.map(l=>l.id))},seen={componentIds:new Set(),pinIds:new Set(),boardIds:new Set(),layerIds:new Set()};
  for(const part of c.parts){if(!plain(part)||!safe(part.id)||ids.has(part.id)||!safe(part.sourceItemId)||!safe(part.sourceModelId)||typeof part.label!=='string'||part.label.length>180||!box(part.imageBounds)||!matrix(part.unassignedImageTransform))fail();ids.add(part.id);
   for(const key of Object.keys(sets)){if(!Array.isArray(part[key])||part[key].some(id=>!sets[key].has(id)))fail();if(seen[key])for(const id of part[key]){if(seen[key].has(id))fail();seen[key].add(id);}}
   if(part.imageSource){const image=files.get(part.imageSource);if(!image||!/^image\//.test(image.type))throw Error('Faltam desenhos de uma das partes da junção. O arquivo anterior foi mantido.');}
  }
  for(const key of Object.keys(seen))if(seen[key].size!==sets[key].size)fail();
  // Membership is a partition of physical data; net membership may overlap only
  // because explicit net linking can connect two composition parts.
  const membership={componentIds:new Map(),pinIds:new Map(),layerIds:new Map()},allNets=new Set();
  const partSets=new Map(c.parts.map(part=>[part.id,{boards:new Set(part.boardIds),nets:new Set(part.netIds)}]));
  for(const part of c.parts){
   if(new Set(part.netIds).size!==part.netIds.length)fail();
   for(const net of part.netIds)allNets.add(net);
   for(const key of Object.keys(membership))for(const value of part[key])membership[key].set(value,part.id);
  }
  if(allNets.size!==netIds.size)fail();
  const componentPins=new Map(),owners=data.nexusGeometry.owners;
  const ownsBoard=(partId,owner)=>owner===null||partSets.get(partId).boards.has(owner);
  for(const component of data.components){
   const partId=membership.componentIds.get(component.id);
   if(!Array.isArray(component.pins)||!ownsBoard(partId,owners.components[component.id]))fail();
   const pins=new Set(component.pins);if(pins.size!==component.pins.length)fail();componentPins.set(component.id,pins);
   for(const pinId of pins)if(!id(pinId)||!data.pins[pinId]||data.pins[pinId].part!==component.id||membership.pinIds.get(pinId)!==partId)fail();
  }
  for(const pin of data.pins){
   const partId=membership.pinIds.get(pin.id),part=partSets.get(partId);
   if(!ownsBoard(partId,owners.pins[pin.id])||pin.net!=null&&!part.nets.has(pin.net))fail();
   // Vias can reference a virtual source part absent from components.
   if(partIds.has(pin.part)&&(membership.componentIds.get(pin.part)!==partId||!componentPins.get(pin.part).has(pin.id)))fail();
  }
  for(const layer of data.layers){
   const partId=membership.layerIds.get(layer.id),part=partSets.get(partId);
   for(const kind of ['segments','arcs']){
    const rows=layer[kind]||[],rowOwners=owners[kind][layer.id],netIndex=kind==='segments'?5:8;
    if(!Array.isArray(rows)||!Array.isArray(rowOwners)||rowOwners.length!==rows.length||rowOwners.some(owner=>!ownsBoard(partId,owner)))fail();
    for(const row of rows)if(row[netIndex]!=null&&!part.nets.has(row[netIndex]))fail();
   }
  }

 }
 if(data.nexusRevision!==undefined&&(typeof data.nexusRevision!=='string'||data.nexusRevision.length>100))fail();
 return data;
}
