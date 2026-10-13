/* Component pad layout, independent of the board camera and personal readings. */
(() => {
 'use strict';
 const indexes=new WeakMap(),NC_NAMES=new Set(['NC','N-C','N_C','N.C.','N/C','NO CONNECT','NOT CONNECTED','UNCONNECTED']);
 const MAX_CELLS=32768,MAX_AXIS=256;
 const labelCompare=(a,b)=>String(a).localeCompare(String(b),'en',{numeric:true,sensitivity:'base'});
 const median=values=>{const v=values.filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:0;};
 function index(data){
  let saved=indexes.get(data);if(saved)return saved;
  const components=new Map((data.components||[]).map(c=>[c.id,c])),pins=new Map(),nets=new Map((data.nets||[]).map(n=>[n.id,n]));
  for(const pin of data.pins||[]){if(pin.via||!components.has(pin.part))continue;let list=pins.get(pin.part);if(!list){list=[];pins.set(pin.part,list);}list.push(pin);}
  saved={components,pins,nets};indexes.set(data,saved);return saved;
 }
 function alphaRank(value){let rank=0;for(const letter of value)rank=rank*26+letter.charCodeAt(0)-64;return rank;}
 function makeGrid(componentId,rows,columns,records,position,kind){
  const result={componentId,rows:rows.map(r=>({...r,cells:Array(columns.length).fill(null)})),columns,order:[]};
  for(const record of records){const [row,column]=position(record);if(result.rows[row].cells[column]!==null)return null;const pin=record.pin||record;
   result.rows[row].cells[column]={pinId:pin.id,padName:String(pin.name??''),row,column,kind:kind(pin)};
  }
  for(const row of result.rows)for(const cell of row.cells)if(cell?.kind==='signal')result.order.push(cell.pinId);
  return result;
 }
 function labelled(componentId,pins,kind){
  const records=[],names=new Set(),letters=new Set(),numbers=new Set();
  for(const pin of pins){const name=String(pin.name??'').trim().toUpperCase(),match=/^([A-Z]{1,2})([1-9]\d{0,2})$/.exec(name);if(!match||names.has(name))return null;
   const number=Number(match[2]);if(number>MAX_AXIS)return null;names.add(name);letters.add(match[1]);numbers.add(number);records.push({pin,letter:match[1],number});
  }
  const rowLabels=[...letters].sort((a,b)=>alphaRank(a)-alphaRank(b)),columnLabels=[...numbers].sort((a,b)=>a-b),area=rowLabels.length*columnLabels.length;
  if(rowLabels.length>MAX_AXIS||columnLabels.length>MAX_AXIS||area>MAX_CELLS||area>Math.max(1024,pins.length*12))return null;
  const rowIndexes=new Map(rowLabels.map((label,i)=>[label,i])),columnIndexes=new Map(columnLabels.map((label,i)=>[label,i]));
  return makeGrid(componentId,rowLabels.map(label=>({key:label,label})),columnLabels.map(label=>({key:String(label),label:String(label)})),records,r=>[rowIndexes.get(r.letter),columnIndexes.get(r.number)],kind);
 }
 function clusters(records,axis,tolerance,descending=false){
  const sign=descending?-1:1,sorted=[...records].sort((a,b)=>sign*(a[axis]-b[axis])||labelCompare(a.pin.name,b.pin.name)||labelCompare(a.pin.id,b.pin.id)),groups=[],membership=new Map();
  for(const record of sorted){let group=groups.at(-1);if(!group||Math.abs(record[axis]-group.center)>tolerance){group={center:record[axis],records:[]};groups.push(group);}group.records.push(record);group.center+=(record[axis]-group.center)/group.records.length;membership.set(record,groups.length-1);}
  return {groups,membership};
 }
 function physical(componentId,component,pins,kind){
  const angle=Number.isFinite(component.angle)?component.angle*Math.PI/180:0,cos=Math.cos(angle),sin=Math.sin(angle),cx=Number.isFinite(component.x)?component.x:0,cy=Number.isFinite(component.y)?component.y:0;
  const records=[],unplaced=[];
  for(const pin of pins){if(!Number.isFinite(pin.x)||!Number.isFinite(pin.y)){unplaced.push({pin});continue;}const dx=pin.x-cx,dy=pin.y-cy;records.push({pin,x:dx*cos+dy*sin,y:-dx*sin+dy*cos});}
  const padSize=median(pins.map(p=>Array.isArray(p.bbox)?Math.min(p.bbox[2]-p.bbox[0],p.bbox[3]-p.bbox[1]):0));
  let tolerance=Math.max(0.000001,padSize*.15),rows,columns;
  for(let attempt=0;attempt<8&&records.length;attempt++){
   rows=clusters(records,'y',tolerance,true);columns=clusters(records,'x',tolerance);const occupied=new Set();let collision=false;
   for(const record of records){const key=rows.membership.get(record)+':'+columns.membership.get(record);if(occupied.has(key)){collision=true;break;}occupied.add(key);}
   const area=rows.groups.length*columns.groups.length;
   if(!collision&&!unplaced.length&&rows.groups.length<=MAX_AXIS&&columns.groups.length<=MAX_AXIS&&area<=MAX_CELLS&&area<=Math.max(1024,pins.length*12)){
    return makeGrid(componentId,rows.groups.map((_,i)=>({key:'y:'+i,label:String(i+1)})),columns.groups.map((_,i)=>({key:'x:'+i,label:String(i+1)})),records,r=>[rows.membership.get(r),columns.membership.get(r)],kind);
   }
   if(!collision)break;tolerance/=2;
  }
  // Irregular or coincident positions: keep each physical row in x order,
  // without allocating a mostly empty n-by-n matrix or discarding a real pin.
  rows=rows||clusters(records,'y',tolerance,true);
  const width=Math.max(1,Math.min(64,Math.floor(MAX_CELLS/Math.max(1,pins.length)))),packed=[];
  const groups=rows.groups.map(g=>[...g.records].sort((a,b)=>a.x-b.x||labelCompare(a.pin.name,b.pin.name)||labelCompare(a.pin.id,b.pin.id)));
  if(unplaced.length)groups.push(unplaced.sort((a,b)=>labelCompare(a.pin.name,b.pin.name)||labelCompare(a.pin.id,b.pin.id)));
  for(const group of groups)for(let i=0;i<group.length;i+=width)packed.push(group.slice(i,i+width));
  const positions=new Map();packed.forEach((row,r)=>row.forEach((record,c)=>positions.set(record,[r,c])));
  const length=Math.max(0,...packed.map(row=>row.length));
  return makeGrid(componentId,packed.map((_,i)=>({key:'row:'+i,label:String(i+1)})),Array.from({length},(_,i)=>({key:'column:'+i,label:String(i+1)})),packed.flat(),r=>positions.get(r),kind);
 }
 function build(data,componentId,ncDisplay){
  const empty=()=>({componentId,rows:[],columns:[],order:[]});if(!data||typeof data!=='object'||!Array.isArray(data.components)||!Array.isArray(data.pins))return empty();
  const saved=index(data),component=saved.components.get(componentId),pins=saved.pins.get(componentId)||[];if(!component||!pins.length)return empty();
  const kind=window.JCIDPadKinds.create(data,ncDisplay).kind;
  return labelled(component.id,pins,kind)||physical(component.id,component,pins,kind);
 }
 window.JCIDPadMatrix=Object.freeze({build});
})();
