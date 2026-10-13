/* Shared visual pad classes. No-connect follows the verified JCID display rule,
 * never diode readings, OL values, or a missing net in an unknown data source. */
(() => {
 'use strict';
 const NC_NAMES=new Set(['NC','N-C','N_C','N.C.','N/C','NO CONNECT','NOT CONNECTED','UNCONNECTED']);
 const cache=new WeakMap();
 function create(data,ncDisplay){
  if(!data||typeof data!=='object')return Object.freeze({kind:()=> 'signal',selectable:()=>false,netName:()=> 'Sem rede indicada'});
  const nc=ncDisplay??data.ncDisplay;
  const saved=cache.get(data);if(saved&&saved.nc===nc)return saved.classifier;
  const nets=new Map((data.nets||[]).map(n=>[n.id,n]));
  const explicit=new Set(nc?.jcidDisplayNcPinIds||[]),ambiguous=new Set();
  const src=data.source;
  let verified=!!(data.version===2&&src?.zip_eof===true&&src.cipher_roundtrip===true&&/^[a-f0-9]{64}$/i.test(src.sha256||''));
  const notes=(data.notes||[]).filter(n=>n?.kind==='ambiguous_source_pin_nets');
  if(notes.length){
   // Exported pins retain original component/local-pin order. A net deliberately
   // cleared because two source nets claimed it is unknown, rather than NC.
   const byPart=new Map();
   for(const pin of data.pins||[]){let list=byPart.get(pin.part);if(!list){list=[];byPart.set(pin.part,list);}list.push(pin);}
   for(const note of notes){
    if(!Array.isArray(note.pins)){verified=false;continue;}
    for(const ref of note.pins){const pin=byPart.get(ref.part)?.[ref.localPin];if(pin)ambiguous.add(pin.id);else verified=false;}
   }
  }
  const kinds=new Map();
  function kind(pin){
   if(!pin)return 'signal';
   if(kinds.has(pin.id))return kinds.get(pin.id);
   const name=String(nets.get(pin.net)?.sourceName??nets.get(pin.net)?.name??'').trim().toUpperCase();
   const value=explicit.has(pin.id)?'nc':name==='GND'?'ground':NC_NAMES.has(name)?'nc':verified&&pin.net===null&&!ambiguous.has(pin.id)?'nc':'signal';
   kinds.set(pin.id,value);return value;
  }
  const classifier=Object.freeze({kind,selectable:pin=>!!pin&&kind(pin)==='signal',netName:pin=>String(nets.get(pin?.net)?.name||(kind(pin)==='nc'?'NC':'Sem rede indicada'))});
  cache.set(data,{nc,classifier});return classifier;
 }
 window.JCIDPadKinds=Object.freeze({create});
})();
