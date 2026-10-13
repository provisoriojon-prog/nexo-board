/* Pure geometry edits for one physical board. Does not read DOM or storage. */
(function (global) {
  'use strict';
  const EPS = 1e-8, TAU = Math.PI * 2;
  const own = (o, key) => Object.prototype.hasOwnProperty.call(o || {}, key);
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const boxValid = b => Array.isArray(b) && b.length === 4 && b.every(finite) && b[2] >= b[0] && b[3] >= b[1];
  const dict = () => Object.create(null);
  const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const identity = () => [1, 0, 0, 1, 0, 0];
  const snap = n => Math.abs(n - Math.round(n)) < 1e-10 ? Math.round(n) : n;
  function matrixValid(m) {
    return Array.isArray(m) && m.length === 6 && m.every(finite) &&
      Math.abs(m[0]*m[0]+m[1]*m[1]-1) < EPS && Math.abs(m[2]*m[2]+m[3]*m[3]-1) < EPS &&
      Math.abs(m[0]*m[2]+m[1]*m[3]) < EPS && Math.abs(Math.abs(m[0]*m[3]-m[1]*m[2])-1) < EPS;
  }
  function checkedMatrix(m) { if (!matrixValid(m)) throw Error('A transformação deve ser uma rotação, espelhamento ou deslocamento válido.'); return m.map(snap); }
  function point(m, x, y) { return [snap(m[0]*x+m[2]*y+m[4]), snap(m[1]*x+m[3]*y+m[5])]; }
  function angle(m, degrees) { const a = (degrees || 0) * Math.PI / 180, x = Math.cos(a), y = Math.sin(a); return snap(((Math.atan2(m[1]*x+m[3]*y,m[0]*x+m[2]*y)*180/Math.PI)%360+360)%360); }
  function compose(left, right) {
    const [a,b,c,d,e,f]=left,[g,h,i,j,k,l]=right;
    return [a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f].map(snap);
  }
  function boxFromPoints(points) { return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]; }
  function mapBox(b,m) { if(!boxValid(b))return b;return boxFromPoints([[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].map(p=>point(m,...p))); }
  function transformArc(raw,m) {
    // Component outlines contain seven numbers (radius is last); layer arcs may
    // append width/net fields. Both use the same first seven geometric values.
    if(!Array.isArray(raw)||raw.length<7)return raw;
    const result=raw.slice(),center=point(m,raw[0],raw[1]);let start=point(m,raw[2],raw[3]),end=point(m,raw[4],raw[5]);
    // Paths are undirected. Reversing endpoints on reflection preserves the
    // original half-plane even for the implicit sweep of exactly semicircular arcs.
    if(m[0]*m[3]-m[1]*m[2]<0)[start,end]=[end,start];
    result.splice(0,6,...center,...start,...end);return result;
  }
  function arcGeometry(raw) {
    const start=Math.atan2(raw[3]-raw[1],raw[2]-raw[0]),end=Math.atan2(raw[5]-raw[1],raw[4]-raw[0]),delta=((end-start+Math.PI*3)%TAU)-Math.PI;
    return {start,delta,mid:[raw[0]+raw[6]*Math.cos(start+delta/2),raw[1]+raw[6]*Math.sin(start+delta/2)]};
  }
  function arcBox(raw) {
    const {start,delta}=arcGeometry(raw),angles=[start,start+delta];
    for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const travel=((delta>=0?a-start:start-a)%TAU+TAU)%TAU;if(travel<=Math.abs(delta)+1e-10)angles.push(a);}
    const b=boxFromPoints(angles.map(a=>[raw[0]+raw[6]*Math.cos(a),raw[1]+raw[6]*Math.sin(a)])),pad=Math.max(0,raw[7]||0)/2;
    return [b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad];
  }
  function pointOnSegment(x,y,a,b,tol) {
    const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
    if(!len)return Math.hypot(x-a[0],y-a[1])<=tol;
    const t=((x-a[0])*dx+(y-a[1])*dy)/len;
    return t>=-tol/Math.sqrt(len)&&t<=1+tol/Math.sqrt(len)&&Math.abs((x-a[0])*dy-(y-a[1])*dx)<=tol*Math.sqrt(len);
  }
  function inPolygon(x,y,points,tol) {
    if(!Array.isArray(points)||points.length<3)return false;let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[j],b=points[i];if(pointOnSegment(x,y,a,b,tol))return true;
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }return inside;
  }
  function resolver(data) {
    const boards=data.boards.map(b=>({id:String(b.id),points:b.points||[],box:b.bbox})).filter(b=>boxValid(b.box));
    const extent=Math.max(1,...boards.map(b=>Math.max(b.box[2]-b.box[0],b.box[3]-b.box[1]))),tol=extent*1e-9;
    return function resolve(x,y){
      if(!finite(x)||!finite(y))return null;
      const boxes=boards.filter(b=>x>=b.box[0]-tol&&x<=b.box[2]+tol&&y>=b.box[1]-tol&&y<=b.box[3]+tol);
      // A sole bbox candidate is also the unique fallback if its polygon has a
      // notch here. Avoid testing every polygon edge for that common case.
      if(boxes.length===1)return boxes[0].id;
      if(boxes.length>1){const inside=boxes.filter(b=>inPolygon(x,y,b.points,tol));return inside.length===1?inside[0].id:null;}
      const nearest=boards.map(b=>({id:b.id,distance:Math.hypot(Math.max(b.box[0]-x,0,x-b.box[2]),Math.max(b.box[1]-y,0,y-b.box[3]))})).sort((a,b)=>a.distance-b.distance);
      return nearest.length && (nearest.length===1||nearest[1].distance-nearest[0].distance>tol) ? nearest[0].id : null;
    };
  }
  function metadata(data) {
    const ids=new Set(data.boards.map(b=>String(b.id))),prior=data.nexusGeometry;
    if(prior && (prior.version!==1||!boxValid(prior.imageBounds)))throw Error('Os dados de alinhamento da placa são inválidos.');
    const meta=prior||{version:1,imageBounds:data.bounds.slice(),boardTransforms:dict(),sourceBoardPoints:dict(),owners:{components:dict(),pins:dict(),segments:dict(),arcs:dict()}};
    meta.boardTransforms||=dict();meta.sourceBoardPoints||=dict();meta.owners||={};for(const key of ['components','pins','segments','arcs'])meta.owners[key]||=dict();
    for(const b of data.boards){const id=String(b.id);if(own(meta.boardTransforms,id))checkedMatrix(meta.boardTransforms[id]);else meta.boardTransforms[id]=identity();if(!own(meta.sourceBoardPoints,id))meta.sourceBoardPoints[id]=clone(b.points||[]);}
    const resolve=resolver(data),validOwner=v=>v===null||typeof v==='string'&&ids.has(v),readOwner=(collection,key,fallback)=>{
      if(own(collection,key)){if(!validOwner(collection[key]))throw Error('A associação física da placa é inválida.');return collection[key];}
      return collection[key]=fallback();
    };
    const components=new Map(data.components.map(c=>[c.id,c]));
    for(const c of data.components){c.sourceComponentName??=c.name;c.sourceX??=c.x;c.sourceY??=c.y;if(!own(c,'sourceView'))c.sourceView=c.view;readOwner(meta.owners.components,c.id,()=>ids.has(String(c.view))?String(c.view):resolve(c.x,c.y));}
    for(const p of data.pins){
      readOwner(meta.owners.pins,p.id,()=>components.has(p.part)?meta.owners.components[p.part]:resolve(p.x,p.y));
      if(!own(p,'sourcePinId'))p.sourcePinId=p.id;if(!finite(p.sourceX))p.sourceX=p.x;if(!finite(p.sourceY))p.sourceY=p.y;
    }
    for(const layer of data.layers||[])for(const kind of ['segments','arcs']){
      const list=layer[kind]||[],previous=meta.owners[kind][layer.id];
      if(previous && (!Array.isArray(previous)||previous.length!==list.length||!previous.every(validOwner)))throw Error('A associação das trilhas precisa acompanhar os dados desta placa.');
      if(previous)continue;
      meta.owners[kind][layer.id]=list.map(raw=>{
        const center=kind==='arcs'?arcGeometry(raw).mid:[(raw[0]+raw[2])/2,(raw[1]+raw[3])/2],first=kind==='arcs'?[raw[2],raw[3]]:[raw[0],raw[1]],last=kind==='arcs'?[raw[4],raw[5]]:[raw[2],raw[3]];
        const owner=resolve(...center);if(owner!==null)return owner;
        const a=resolve(...first),b=resolve(...last);return a!==null&&a===b?a:null;
      });
    }
    data.nexusGeometry=meta;return meta;
  }
  function selectedBoards(data,boardId){
    const ids=new Set((Array.isArray(boardId)?boardId:[boardId]).map(String)),boards=(data.boards||[]).filter(b=>ids.has(String(b.id)));
    if(!ids.size||boards.length!==ids.size||boards.some(b=>!boxValid(b.bbox)))throw Error('Selecione uma placa física válida.');return {ids,boards};
  }
  function matrixFor(data,boardId,action,options={}) {
    const {boards}=selectedBoards(data,boardId),bbox=boards.map(b=>b.bbox).reduce((a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])]);
    if(action&&typeof action==='object'){options=action;action=action.type||action.action;}
    if(action==='translate'||action==='move'){const dx=options.dx??options.x??0,dy=options.dy??options.y??0;if(!finite(dx)||!finite(dy))throw Error('Informe um deslocamento válido.');return [1,0,0,1,dx,dy];}
    const linear={rotateLeft:[0,1,-1,0],rotateRight:[0,-1,1,0],mirrorH:[-1,0,0,1],mirrorV:[1,0,0,-1]}[action];if(!linear)throw Error('Transformação desconhecida.');
    const cx=(bbox[0]+bbox[2])/2,cy=(bbox[1]+bbox[3])/2,[a,b,c,d]=linear;return [a,b,c,d,cx-a*cx-c*cy,cy-b*cx-d*cy].map(snap);
  }
  function transform(input,boardId,matrix) {
    if(!input||!Array.isArray(input.boards)||!Array.isArray(input.components)||!Array.isArray(input.pins)||!boxValid(input.bounds))throw Error('Os dados da placa são inválidos.');
    const {ids}=selectedBoards(input,boardId);
    // Share unchanged immutable records rather than copying every trace/pad at
    // each gesture. Only edited geometry and metadata receive new objects.
    const m=checkedMatrix(matrix),data={...input,boards:input.boards.map(b=>({...b})),components:input.components.map(c=>({...c})),pins:input.pins.map(p=>({...p})),layers:input.layers.map(l=>({...l})),labelGeometry:input.labelGeometry?{...input.labelGeometry}:undefined};
    if(input.nexusGeometry){const prior=input.nexusGeometry;data.nexusGeometry={...prior,boardTransforms:{...prior.boardTransforms},sourceBoardPoints:{...prior.sourceBoardPoints},owners:Object.fromEntries(['components','pins','segments','arcs'].map(k=>[k,{...prior.owners?.[k]}]))};}
    const meta=metadata(data),selectedComponents=new Set();
    for(const b of data.boards)if(ids.has(String(b.id))){b.points=(b.points||[]).map(p=>point(m,...p));b.bbox=b.points.length?boxFromPoints(b.points):mapBox(b.bbox,m);}
    for(const c of data.components)if(ids.has(meta.owners.components[c.id])){
      selectedComponents.add(c.id);[c.x,c.y]=point(m,c.x,c.y);c.angle=angle(m,c.angle);c.bbox=mapBox(c.bbox,m);if(c.view===null||c.view===undefined)c.view=meta.owners.components[c.id];
      if(c.outlines)c.outlines=c.outlines.map(o=>({...o}));for(const outline of c.outlines||[]){if(outline.points)outline.points=outline.points.map(p=>point(m,...p));if(outline.arc)outline.arc=transformArc(outline.arc,m);if(boxValid(outline.bbox))outline.bbox=mapBox(outline.bbox,m);}
      const sourceLabel=data.labelGeometry?.[c.id];if(sourceLabel){const g=data.labelGeometry[c.id]={...sourceLabel};if(Array.isArray(g.center)&&g.center.length===2)g.center=point(m,...g.center);if(finite(g.angle)||g.available)g.angle=angle(m,g.angle);for(const key of ['body_bbox','bbox'])if(boxValid(g[key]))g[key]=mapBox(g[key],m);if(finite(g.x)&&finite(g.y))[g.x,g.y]=point(m,g.x,g.y);}
    }
    for(const p of data.pins)if(ids.has(meta.owners.pins[p.id])){
      [p.x,p.y]=point(m,p.x,p.y);p.bbox=mapBox(p.bbox,m);
      if(p.copper)p.copper=p.copper.map(s=>({...s}));for(const shape of p.copper||[]){[shape.x,shape.y]=point(m,shape.x,shape.y);shape.angle=angle(m,shape.angle);if(boxValid(shape.bbox))shape.bbox=mapBox(shape.bbox,m);}
    }
    for(const layer of data.layers||[]){
      layer.segments=(layer.segments||[]).map((raw,i)=>ids.has(meta.owners.segments[layer.id][i])?[...point(m,raw[0],raw[1]),...point(m,raw[2],raw[3]),...raw.slice(4)]:raw);
      layer.arcs=(layer.arcs||[]).map((raw,i)=>ids.has(meta.owners.arcs[layer.id][i])?transformArc(raw,m):raw);
    }
    for(const id of ids)meta.boardTransforms[id]=compose(m,meta.boardTransforms[id]);
    const boxes=[];for(const row of [...data.boards,...data.components,...data.pins])if(boxValid(row.bbox))boxes.push(row.bbox);
    for(const layer of data.layers||[]){for(const r of layer.segments||[]){const p=Math.max(0,r[4]||0)/2;boxes.push([Math.min(r[0],r[2])-p,Math.min(r[1],r[3])-p,Math.max(r[0],r[2])+p,Math.max(r[1],r[3])+p]);}for(const r of layer.arcs||[])boxes.push(arcBox(r));}
    if(boxes.length)data.bounds=boxes.reduce((a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])],[Infinity,Infinity,-Infinity,-Infinity]);
    return data;
  }
  const api=Object.freeze({transform,matrixFor});global.NexusBoardGeometry=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
