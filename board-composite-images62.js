(() => {
 'use strict';
 window.NexusCompositeImages=Object.freeze({create(data,partPaths,ringComponents){
  const images=new Map(),unassigned=new Map();let generation=0;
  const parts=data.nexusComposition.parts.filter(p=>p.imageSource);
  for(const part of parts){const mask=new Path2D();for(const id of part.componentIds){const shape=partPaths.get(id);if(shape?.hasArea&&!ringComponents.has(id)&&data.nexusGeometry.owners.components[id]===null)mask.addPath(shape.area);}unassigned.set(part.id,mask);}
  return {available:parts.length>0,async load(){const token=++generation;
   await Promise.all(parts.map(async part=>{const active=window.JCID_ACTIVE_BOARD,model=window.JCID_DEVICES.models.find(m=>m.id===active.modelId),item=model?.children.find(i=>i.id===active.id),blob=await window.NexusLibrary.loadImageAsset(item,part.imageSource);if(token!==generation)return;const url=URL.createObjectURL(blob),img=new Image();try{img.src=url;await img.decode();if(token===generation)images.set(part.id,img);}finally{URL.revokeObjectURL(url);}}));
  },draw(ctx,physicalMasks){
   for(const part of parts){const img=images.get(part.id);if(!img)continue;const atlas=part.imageBounds;
    function paint(){ctx.translate(atlas[0],atlas[3]);ctx.scale(1,-1);ctx.drawImage(img,0,0,atlas[2]-atlas[0],atlas[3]-atlas[1]);}
    for(const id of part.boardIds){ctx.save();ctx.clip(physicalMasks.get(String(id))||new Path2D());ctx.transform(...(data.nexusGeometry.boardTransforms[String(id)]||[1,0,0,1,0,0]));paint();ctx.restore();}
    ctx.save();ctx.clip(unassigned.get(part.id));ctx.transform(...(part.unassignedImageTransform||[1,0,0,1,0,0]));paint();ctx.restore();
   }
  },destroy(){generation++;for(const img of images.values())img.removeAttribute('src');images.clear();}};
 }});
})();
