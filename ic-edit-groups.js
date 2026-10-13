/* Electrical groups are deliberately scoped to one component's editable pads. */
(() => {
 'use strict';
 function build(data,layout){
  const pins=new Map(data.pins.map(p=>[p.id,p])),nets=new Map(data.nets.map(n=>[n.id,n]));
  const byKey=new Map(),byPin=new Map(),groups=[];
  for(const id of layout.order){const p=pins.get(id),net=nets.get(p?.net),key=net&&String(net.name||'').trim()?'net:'+net.id:'pin:'+id;
   let group=byKey.get(key);if(!group){group={key,get netName(){return net?.name||'';},ids:[],index:groups.length};groups.push(group);byKey.set(key,group);}group.ids.push(id);byPin.set(id,group);
  }
  return {groups,byPin};
 }
 function summarize(handle,ids,kind,field='value'){
  const values=ids.map(id=>handle.get(id)?.[kind]?.[field]??null),mixed=values.some(v=>v!==values[0]);
  return {mixed,value:mixed?null:values[0]??null,overridden:ids.some(id=>handle.get(id)?.[kind]?.overridden)};
 }
 window.JCIDEditGroups=Object.freeze({build,summarize});
})();
