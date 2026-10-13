/* Temporary edits in memory only. Closing the tab discards the draft; exporting creates a portable copy. */
(() => {
 'use strict';
 const records=new WeakMap();
 const clone=x=>structuredClone(x);
 const netColorFields=['netColors','netColorChecked','netColorIsolation','netColorIsolationScope','netColorSequence'];
 const netColorState=snapshot=>Object.fromEntries(netColorFields.filter(key=>Object.prototype.hasOwnProperty.call(snapshot,key)).map(key=>[key,clone(snapshot[key])]));
 const restoresNetColor=type=>type==='renameNet'||type==='connectCompositionNets'||type==='setPadKind';
 function revision(data){let h=2166136261;for(const n of data.nets)for(const c of n.id+':'+n.name+';')h=Math.imul(h^c.charCodeAt(0),16777619);return data.nexusRevision||`base-${h>>>0}-${data.components.length}-${data.pins.length}`;}
 function run(data,op,snapshot){
  if(op.type==='joinBoard'){
   const base=clone(data);base.nexusPersonal={...(base.nexusPersonal||{}),version:1,values:clone(op.baseValues||base.nexusPersonal?.values||{}),rffe:{notes:{},marks:[]}};
   if(base.nexusComposition&&op.baseImages)for(const part of base.nexusComposition.parts){const image=op.baseImages.find(p=>p.id===part.id);if(image)part.imageSource=image.imageSource;}
   const result=window.NexusBoardComposition.merge(base,op.addition,op.metadata),saved=clone(snapshot);saved.dataRevision=result.data.nexusRevision||'base';saved.component=saved.pin=saved.net=null;saved.view='all';return {...result,snapshot:saved};
  }
  if(op.type==='transformBoards')return {data:window.NexusBoardGeometry.transform(data,op.ids,op.matrix),snapshot:clone(snapshot)};
  if(op.type==='transformBoard')return {data:window.NexusBoardGeometry.transform(data,op.id,op.matrix),snapshot:clone(snapshot)};
  return window.NexusBoardTopology.apply(data,op,snapshot);
 }
 function prepare(id,data,readings,nc){
  if(records.has(data))return;
  data.readings??=clone(readings||{pins:{}});data.ncDisplay??=clone(nc||{});
  const record={id,revision:revision(data),base:null,ops:[],netColorUndo:[],checkpoints:[]};
  records.set(data,record);
 }
 function context(){if(document.body.classList.contains('source-mode')||document.body.classList.contains('board-loading'))throw Error('Abra um mapa de placa para editar.');const data=window.JCID_BOARD,id=window.JCID_ACTIVE_BOARD.id;prepare(id,data,window.JCID_READINGS,window.JCID_NC_DISPLAY);return {data,record:records.get(data)};}
 function validate(data){if(!data.components.length||!data.pins.length)throw Error('Mantenha pelo menos um componente com pads nesta placa.');if(!data.pins.every((p,i)=>p.id===i&&[p.x,p.y,...p.bbox].every(Number.isFinite)))throw Error('Não foi possível validar as posições editadas.');}
 function commit(result,record,ops,base){
  const previousData=window.JCID_BOARD;
  validate(result.data);records.set(result.data,{...record,ops,base});
  window.JCIDBoards.replaceEdited(result.data,result.snapshot);
  if(previousData!==result.data)records.delete(previousData);
  window.dispatchEvent(new CustomEvent('jcid:board-edited',{detail:{boardId:record.id,operation:ops.at(-1)?.type||'undo'}}));
  return result;
 }
 function execute(op){const {data,record}=context(),snapshot=window.JCIDBoardView.snapshot(),result=run(data,op,snapshot);if(result.changed===false)return result;
  if(['renameComponent','setComponentNameVisibility'].includes(op.type))window.NexusRenderCache64?.inherit(data,result.data);
  const netColorUndo=[...(record.netColorUndo||record.ops.map(()=>null)),restoresNetColor(op.type)?netColorState(snapshot):null];
  const checkpoints=[...(record.checkpoints||[]),{index:record.ops.length,data}].slice(-8);
  return commit(result,{...record,netColorUndo,checkpoints},[...record.ops,clone(op)],record.base||data);
 }
 function undo(){const {record}=context();if(!record.ops.length)return false;const ops=record.ops.slice(0,-1),checkpoint=record.checkpoints?.find(c=>c.index===ops.length);let data=checkpoint?.data||record.base;if(!checkpoint)for(const op of ops)data=run(data,op,{}).data;const snapshot=window.JCIDBoardView.snapshot();
  const previousNetColor=record.netColorUndo?.at(-1);
  if(restoresNetColor(record.ops.at(-1)?.type)&&previousNetColor){for(const key of netColorFields)delete snapshot[key];Object.assign(snapshot,clone(previousNetColor));}
  snapshot.dataRevision=data.nexusRevision||'base';snapshot.component=snapshot.pin=snapshot.net=null;snapshot.netColors=(snapshot.netColors||[]).filter(n=>data.nets.some(v=>v.id===n.id));snapshot.netColorChecked=(snapshot.netColorChecked||[]).filter(id=>data.nets.some(n=>n.id===id));
  commit({data,snapshot},{...record,checkpoints:(record.checkpoints||[]).filter(c=>c.index<ops.length),netColorUndo:(record.netColorUndo||[]).slice(0,-1)},ops,record.base);return true;
 }
 window.NexusBoardDraft=Object.freeze({prepare,execute,undo,canUndo:()=>{try{return !!context().record.ops.length;}catch{return false;}},history:()=>{try{return clone(context().record.ops);}catch{return [];}}});
})();
