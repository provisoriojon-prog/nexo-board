/* Independent axis snapping for one physical board. No DOM or mutable state. */
(function (root) {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const validBox = box => Array.isArray(box) && box.length === 4 && box.every(finite) && box[2] >= box[0] && box[3] >= box[1];
  const names = {x:['left','center','right'],y:['bottom','center','top']};
  const coordinate = (box,axis,index) => index === 1 ? (box[axis]+box[axis+2])/2 : box[axis+(index===2?2:0)];
  const compareText = (a,b) => a===b ? 0 : a<b ? -1 : 1;
  const compareNumber = (a,b) => a===b ? 0 : a<b ? -1 : 1;
  function compare(a,b) {
    // Quantize only the comparison to 1/10,000,000 px, not the actual position.
    // This gives deterministic ties despite tiny floating point noise.
    return compareNumber(a.distanceKey,b.distanceKey) ||
      compareNumber(a.sourceIndex===a.targetIndex?0:1,b.sourceIndex===b.targetIndex?0:1) ||
      compareText(a.targetId,b.targetId) || compareNumber(a.sourceIndex,b.sourceIndex) ||
      compareNumber(a.targetIndex,b.targetIndex) || compareNumber(a.value,b.value) ||
      compareNumber(a.targetBox[0],b.targetBox[0]) || compareNumber(a.targetBox[1],b.targetBox[1]) ||
      compareNumber(a.targetBox[2],b.targetBox[2]) || compareNumber(a.targetBox[3],b.targetBox[3]);
  }
  function nearest(box,targets,axis,scale,thresholdPx) {
    let best=null;
    for(const target of targets)for(let sourceIndex=0;sourceIndex<3;sourceIndex++)for(let targetIndex=0;targetIndex<3;targetIndex++){
      const value=coordinate(target.bbox,axis,targetIndex),delta=value-coordinate(box,axis,sourceIndex),distancePx=Math.abs(delta)*scale;
      if(distancePx>thresholdPx+1e-8)continue;
      const candidate={targetId:String(target.id),targetBox:target.bbox,sourceIndex,targetIndex,value,delta,distancePx,distanceKey:Math.round(distancePx*1e7)};
      if(!best||compare(candidate,best)<0)best=candidate;
    }
    return best;
  }
  function snap(data,boardId,dx,dy,scale,options={}) {
    if(!finite(dx)||!finite(dy))throw new TypeError('O deslocamento da placa deve ser finito.');
    const result={dx,dy,guides:[]};
    if(options?.enabled===false||!finite(scale)||scale<=0)return result;
    const thresholdPx=options?.thresholdPx??8;
    if(!finite(thresholdPx)||thresholdPx<0)throw new RangeError('A distância de encaixe deve ser positiva ou zero.');
    const ids=[...new Set((Array.isArray(boardId)?boardId:[boardId]).map(String))],id=ids[0],selected=new Set(ids),boards=Array.isArray(data?.boards)?data.boards:[],members=boards.filter(b=>b&&selected.has(String(b.id))&&validBox(b.bbox));
    if(!ids.length||members.length!==ids.length)return result;
    const board={bbox:members.map(b=>b.bbox).reduce((a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])])};
    const targets=boards.filter(b=>b&&!selected.has(String(b.id))&&validBox(b.bbox));
    if(!targets.length)return result;
    const box=[board.bbox[0]+dx,board.bbox[1]+dy,board.bbox[2]+dx,board.bbox[3]+dy],x=nearest(box,targets,0,scale,thresholdPx),y=nearest(box,targets,1,scale,thresholdPx);
    if(x)result.dx+=x.delta;if(y)result.dy+=y.delta;
    const finalBox=[board.bbox[0]+result.dx,board.bbox[1]+result.dy,board.bbox[2]+result.dx,board.bbox[3]+result.dy];
    for(const [axis,match] of [['x',x],['y',y]])if(match){
      const other=axis==='x'?1:0;
      result.guides.push({axis,value:match.value,from:Math.min(finalBox[other],match.targetBox[other]),to:Math.max(finalBox[other+2],match.targetBox[other+2]),boardId:id,...(ids.length>1?{boardIds:ids}:{}),targetId:match.targetId,sourceAnchor:names[axis][match.sourceIndex],targetAnchor:names[axis][match.targetIndex],delta:match.delta,distancePx:match.distancePx});
    }
    return result;
  }
  const api=Object.freeze({snap});root.NexusBoardSnap=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
