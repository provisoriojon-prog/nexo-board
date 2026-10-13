/* Personal readings are stored separately from the original board files. */
(() => {
 'use strict';
 const PREFIX='nexus-ic-values-v1:',VERSION=1,kinds=['diode','smb'],cache=new WeakMap(),handles=new Map();
 const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
 const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 const scalar=value=>value===undefined||value===null?null:String(value);
 const decimal='-?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)';
 function validate(kind,input){
  if(!kinds.includes(kind))throw Error('Tipo de leitura inválido.');
  const value=String(input??'').trim().replace(/\s*\/\s*/g,'/');
  if(value.length>32)throw Error('Use no máximo 32 caracteres.');
  if(!value)return '';
  if(kind==='diode'){
   if(/^ol$/i.test(value))return 'OL';
   if(!new RegExp('^'+decimal+'$').test(value))throw Error('Informe um número ou OL. Exemplo: 0.456.');
  }else if(!new RegExp('^'+decimal+'/'+decimal+'$').test(value))throw Error('Informe duas medições separadas por /. Exemplo: 456/3.14.');
  return value;
 }
 function read(boardId){
  let text;
  try{text=localStorage.getItem(PREFIX+boardId);}catch{throw Error('O armazenamento de leituras não está disponível neste navegador.');}
  if(!text)return {version:VERSION,values:{}};
  let saved;try{saved=JSON.parse(text);}catch{throw Error('Não foi possível ler as medições salvas desta placa. Os dados foram preservados.');}
  if(!object(saved)||saved.version!==VERSION||!object(saved.values))throw Error('As medições salvas desta placa têm um formato incompatível. Os dados foram preservados.');
  const values=Object.create(null);
  for(const [key,entry] of Object.entries(saved.values)){
   if(!object(entry))continue;const clean={};
   for(const kind of kinds)if(own(entry,kind)&&typeof entry[kind]==='string'){
    try{clean[kind]=validate(kind,entry[kind]);}catch{/* Ignore invalid individual measurements without interpreting them. */}
   }
   if(Object.keys(clean).length)values[key]=clean;
  }
  return {version:VERSION,values};
 }
 function forBoard(boardId,data,original={}){
  if(!data||!Array.isArray(data.pins)||!Array.isArray(data.components))throw Error('Abra uma placa para editar suas leituras.');
  boardId=String(boardId||'iphone-11-motherboard');const storageId=boardId+(data.nexusRevision?'@'+data.nexusRevision:'');
  let boards=cache.get(data);if(!boards){boards=new Map();cache.set(data,boards);}if(boards.has(boardId))return boards.get(boardId);
  const components=new Map(data.components.map(c=>[c.id,c])),pins=new Map(data.pins.map(p=>[p.id,p])),keys=new Map(),idsByKey=new Map(),baseKeys=new Map(),occurrences=new Map(),results=new Map();
  for(const pin of data.pins){const part=components.get(pin.part);if(!part||pin.via)continue;
   const base=JSON.stringify([String(('sourceView' in part?part.sourceView:part.view)??''),String(part.sourceComponentName??part.name??''),String(pin.name??'')]);baseKeys.set(pin.id,base);occurrences.set(base,(occurrences.get(base)||0)+1);
  }
  for(const [id,base] of baseKeys){const pin=pins.get(id),part=components.get(pin.part),ambiguous=occurrences.get(base)>1||!String(pin.name??'').trim()||!String(part.sourceComponentName??part.name??'').trim();
   const key=ambiguous?JSON.stringify([base,String(pin.sourceX??pin.x),String(pin.sourceY??pin.y),String(pin.sourcePinId??pin.id)]):base;keys.set(id,key);idsByKey.set(key,id);
  }
  let saved={version:VERSION,values:{}},problem='',counts={diode:0,smb:0};
  function reload(){
   problem='';try{saved=read(storageId);}catch(error){problem=error.message;}
   counts={diode:0,smb:0};results.clear();
   for(const [id,key] of keys){const custom=saved.values[key]||{},source=original?.pins?.[id],diodeOriginal=scalar(data.nexusPersonal?.values?.[id]?.diode??(object(source)?source.value:source));
    const diode=Object.freeze({original:diodeOriginal,value:own(custom,'diode')?custom.diode:diodeOriginal,overridden:own(custom,'diode')});
    const smbOriginal=scalar(data.nexusPersonal?.values?.[id]?.smb),smb=Object.freeze({original:smbOriginal,value:own(custom,'smb')?custom.smb:smbOriginal,overridden:own(custom,'smb')});
    if(diode.value)counts.diode++;if(smb.value)counts.smb++;results.set(id,Object.freeze({diode,smb}));
   }
  }
  function apply(next){
   const allKeys=new Set([...Object.keys(saved.values),...Object.keys(next.values)]);
   for(const key of allKeys){const previous=saved.values[key]||{},custom=next.values[key]||{};
    if(kinds.every(kind=>own(previous,kind)===own(custom,kind)&&previous[kind]===custom[kind]))continue;
    const id=idsByKey.get(key);if(id===undefined)continue;const old=results.get(id),diodeOriginal=old.diode.original;
    const diode=Object.freeze({original:diodeOriginal,value:own(custom,'diode')?custom.diode:diodeOriginal,overridden:own(custom,'diode')});
    const smbOriginal=scalar(data.nexusPersonal?.values?.[id]?.smb),smb=Object.freeze({original:smbOriginal,value:own(custom,'smb')?custom.smb:smbOriginal,overridden:own(custom,'smb')});
    counts.diode+=Number(!!diode.value)-Number(!!old.diode.value);counts.smb+=Number(!!smb.value)-Number(!!old.smb.value);results.set(id,Object.freeze({diode,smb}));
   }
   saved=next;problem='';
  }
  function changeMany(pinIds,kind,input,reset=false){
   const ids=[...new Set(pinIds)];
   if(!ids.length||ids.some(id=>!keys.has(id))||!kinds.includes(kind))throw Error('Selecione pads de componente para editar.');
   const value=reset?null:validate(kind,input),latest=read(storageId);
   for(const id of ids){const key=keys.get(id),entry={...(latest.values[key]||{})};
    if(reset)delete entry[kind];else entry[kind]=value;
    if(Object.keys(entry).length)latest.values[key]=entry;else delete latest.values[key];
   }
   try{localStorage.setItem(PREFIX+storageId,JSON.stringify(latest));}catch{throw Error('Não foi possível salvar a leitura neste aparelho. Libere espaço e tente novamente.');}
   for(const ref of handles.get(storageId)||[]){const handle=ref.deref();if(handle)handle._apply(latest);else handles.get(storageId).delete(ref);}
   window.dispatchEvent(new CustomEvent('jcid:icvalues-changed',{detail:{boardId,pinId:ids[0],pinIds:ids,kind,value:api.get(ids[0])?.[kind]?.value??null}}));
   return ids.map(id=>api.get(id));
  }
  const api=Object.freeze({boardId,get:pinId=>results.get(pinId)||null,set:(pinId,kind,value)=>changeMany([pinId],kind,value)[0],reset:(pinId,kind)=>changeMany([pinId],kind,null,true)[0],setMany:(ids,kind,value)=>changeMany(ids,kind,value),resetMany:(ids,kind)=>changeMany(ids,kind,null,true),has:kind=>!!counts[kind],problem:()=>problem,_reload:reload,_apply:apply});
  reload();boards.set(boardId,api);if(!handles.has(storageId))handles.set(storageId,new Set());handles.get(storageId).add(new WeakRef(api));return api;
 }
 window.addEventListener('storage',event=>{
  if(event.key!==null&&!event.key.startsWith(PREFIX))return;
  for(const [boardId,boardHandles] of handles)if(event.key===null||event.key===PREFIX+boardId){for(const ref of boardHandles){const handle=ref.deref();if(handle)handle._reload();else boardHandles.delete(ref);}window.dispatchEvent(new CustomEvent('jcid:icvalues-changed',{detail:{boardId:boardId.split('@')[0],pinId:null,kind:null,external:true}}));}
 });
 window.JCIDICValues=Object.freeze({forBoard,validate});
})();
