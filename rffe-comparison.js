/* Expected addresses belong to a model and bus, never to a universal PA list. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JCIDRFFEComparison=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const valid=id=>Number.isInteger(id)&&id>=1&&id<=15;
 const ids=values=>[...new Set((Array.isArray(values)?values:[]).filter(valid))].sort((a,b)=>a-b);
 const hex=id=>'0x'+id.toString(16).toUpperCase();
 function groups(device){
  if(Number.isInteger(device))device={usid:device};
  if(!device)return [];
  const alternatives=(Array.isArray(device.expectedGroups)?device.expectedGroups:[]).map(ids).filter(a=>a.length);
  if(alternatives.length)return alternatives;
  const single=ids(device.expectedUsids?.length?device.expectedUsids:[device.usid]);return single.length?[single]:[];
 }
 function expected(device){return ids(groups(device).flat());}
 function label(device){return groups(device).map(group=>group.map(hex).join(' + ')).join(' ou ');}
 function compare(device,received){
  const variants=groups(device),all=expected(device),found=ids(received),seen=new Set(found);
  if(!all.length)return {text:'Sem USID',title:'Este componente ainda não tem USID de referência cadastrado.',result:null,observedUsid:null,observedUsids:[],missingUsids:[]};
  const complete=variants.find(group=>group.every(id=>seen.has(id))),best=complete||[...variants].sort((a,b)=>a.filter(id=>!seen.has(id)).length-b.filter(id=>!seen.has(id)).length)[0];
  const observedUsids=all.filter(id=>seen.has(id)),missingUsids=best.filter(id=>!seen.has(id));
  return {text:complete?'Localizado':observedUsids.length?'Parcial':'Ausente',result:complete?'found':'not-seen',observedUsid:observedUsids.length===1?observedUsids[0]:null,observedUsids,missingUsids,
   title:'Esperado: '+label(device)+(complete?'. Conjunto localizado.':'. Não recebido: '+missingUsids.map(hex).join(', ')+'. A ausência nesta leitura não determina defeito.')};
 }
 function extras(devices,received){const known=ids((devices||[]).flatMap(expected));return {hasReference:known.length>0,ids:ids(received).filter(id=>!known.includes(id))};}
 return Object.freeze({expected,groups,label,compare,extras,hex});
});
