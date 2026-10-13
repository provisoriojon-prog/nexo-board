/* Prefer an electrical symbol over its placement drawing or pin-only markers. */
(() => {
 'use strict';
 function create(index){
  const hints=window.JCID_SCHEMATIC_HINTS?.documents?.[index.pdf_sha256]||null;
  const pages=new Map(index.pages.map(p=>[p.page,p]));
  function pageRole(region){
   const hint=hints?.pages?.[region.page];
   if(hint==='physical'||hint==='schematic')return hint;
   // False means too few recognized nets, not proof of a placement drawing.
   return pages.get(region.page)?.has_electrical_content===true?'schematic':'unknown';
  }
  function exactLabel(r){return r.source==='pdf_text_label'||(r.marker_tokens||[]).some(t=>String(t).trim().toUpperCase()===r.identifier.toUpperCase());}
  function priority(r){return (pageRole(r)==='physical'?10:0)+(exactLabel(r)?0:2);}
  function compare(a,b){return priority(a)-priority(b)||a.page-b.page||a.rect_normalized[1]-b.rect_normalized[1]||a.rect_normalized[0]-b.rect_normalized[0]||a.record-b.record;}
  function choose(matches,currentPage,selected){
   const ordered=[...matches].sort(compare),best=priority(ordered[0]);
   const preferred=ordered.filter(r=>priority(r)===best);
   if(selected&&preferred.includes(selected))return selected;
   return preferred.find(r=>r.page===currentPage)||preferred[0];
  }
  function rectangle(r){
   const hint=hints?.regions?.[r.record];
   if(hint&&hint.page===r.page&&hint.identifier===r.identifier&&Array.isArray(hint.sourceRect)&&hint.sourceRect.length===4&&hint.sourceRect.every((v,i)=>Math.abs(v-r.rect_normalized[i])<.000001)&&Array.isArray(hint.body)&&hint.body.length===4&&hint.body.every(Number.isFinite))return hint.body;
   return r.rect_normalized;
  }
  function compactPassive(r){
   const p=pages.get(r.page),b=r.rect_normalized;
   if(!p||pageRole(r)==='physical'||!/^(?:C|R|L|D|DZ|FL|FB|F)\d/i.test(r.identifier))return false;
   const w=b[2]*p.width,h=b[3]*p.height;
   return w>0&&h>0&&w<=120&&h<=120&&Math.max(w,h)/Math.min(w,h)<=6;
  }
  function terminalGroup(r){
   return !exactLabel(r)&&!compactPassive(r)&&(r.marker_tokens||[]).some(t=>/^(?:[A-Z]{1,3})?\d{1,3}$/.test(String(t)));
  }
  function selectionRectangle(r){
   // Body hints are useful to frame the electrical context, but must never
   // become a giant clickable/highlighted rectangle over the processor pins.
   // A component is picked at its printed reference; pads have their own hits.
   const p=pages.get(r.page),b=r.rect_normalized;if(!p||!Array.isArray(b))return null;
   if(!b.every(Number.isFinite)||b.length!==4||b[2]<=0||b[3]<=0)return null;
   if(exactLabel(r)){
    const w=b[2]*p.width,h=b[3]*p.height;
    // Imported grouped annotations may contain a reference as well as pins.
    // Without an exact compact label, do not guess a new position inside them.
    return Math.min(w,h)<=48&&Math.max(w,h)<=Math.max(180,String(r.identifier).length*24)?b:null;
   }
   return compactPassive(r)?b:null;
  }
  const hitCache=new WeakMap();
  function hitRectangles(r){
   if(hitCache.has(r))return hitCache.get(r);
   const body=selectionRectangle(r),rects=body?[body]:[],p=pages.get(r.page),tokens=r.marker_tokens||[];
   // Compact two-terminal JCST regions often bound the terminal numbers beside
   // a passive symbol. Include its stroke on the other side of those numbers;
   // never infer an IC body or a placement drawing from a nearby text label.
   if(body&&!exactLabel(r)&&compactPassive(r)&&tokens.includes('1')&&tokens.includes('2')&&tokens.every(t=>t==='1'||t==='2'||t===r.identifier)){
    const [x,y,w,h]=body,pw=w*p.width,ph=h*p.height;
    if(pw>0&&ph>0&&pw<=120&&ph<=120&&Math.max(pw,ph)/Math.min(pw,ph)<=6){
     const pad=Math.min(12,Math.min(pw,ph)*.65),left=Math.max(0,x-pad/p.width),top=Math.max(0,y-pad/p.height);
     rects[0]=[left,top,Math.min(1,x+w+pad/p.width)-left,Math.min(1,y+h+pad/p.height)-top];
    }
   }
   hitCache.set(r,rects);return rects;
  }
  function hitTest(regions,x,y){
   let best=null,rank=Infinity,area=Infinity;
   const contains=([a,b,w,h])=>x>=a&&y>=b&&x<=a+w&&y<=b+h;
   for(const r of regions){
    const label=exactLabel(r)&&contains(r.rect_normalized),rects=hitRectangles(r);
    for(const rect of rects){
     if(!contains(rect))continue;
     const nextRank=label?0:1,nextArea=(label?r.rect_normalized[2]*r.rect_normalized[3]:rect[2]*rect[3]);
     if(nextRank<rank||nextRank===rank&&(nextArea<area||nextArea===area&&compare(r,best)<0)){best=r;rank=nextRank;area=nextArea;}
    }
   }
   return best;
  }
  return Object.freeze({compare,choose,rectangle,selectionRectangle,terminalGroup,pageRole,exactLabel,hitRectangles,hitTest});
 }
 window.JCIDSchematicNavigation=Object.freeze({create});
})();
