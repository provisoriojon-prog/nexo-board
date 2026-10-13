(() => {
 'use strict';
 const base=new URL('schematics-pins/',document.currentScript.src),cache=new Map(),catalogs=new WeakMap();let manifestPromise=null;
 const validRect=rect=>Array.isArray(rect)&&rect.length===4&&rect.every(Number.isFinite)&&rect[0]>=0&&rect[1]>=0&&rect[2]>0&&rect[3]>0&&rect[0]+rect[2]<=1.00001&&rect[1]+rect[3]<=1.00001;
 async function read(url){const r=await fetch(url);if(!r.ok)throw Error('Posições dos terminais indisponíveis');return r.json();}
 async function load(index){
  const hash=index.pdf_sha256;if(!/^[0-9a-f]{64}$/i.test(hash||''))return null;
  if(cache.has(hash))return cache.get(hash);
  const pending=(async()=>{
   const imported=(window.JCID_SCHEMATICS?.documents||[]).find(d=>d.pdf_sha256===hash&&d.pin_index);if(imported){const data=await read(imported.pin_index);if(data?.version!==1||data.pdf_sha256!==hash||!data.pins)throw Error('Índice de terminais incompatível');return data;}
   if(!manifestPromise)manifestPromise=read(new URL('manifest.json',base)).catch(e=>{manifestPromise=null;throw e;});
   const manifest=await manifestPromise,entry=manifest?.version===1?manifest.documents?.[hash]:null;
   if(!entry||!/^[a-z0-9_-]+\.json$/i.test(entry.file||''))return null;
   const data=await read(new URL(entry.file,base));if(data?.version!==1||data.pdf_sha256!==hash||!data.pins||typeof data.pins!=='object')throw Error('Índice de terminais incompatível');return data;
  })();cache.set(hash,pending);try{return await pending;}catch(e){cache.delete(hash);throw e;}
 }
 const contains=(r,x,y)=>x>=r[0]&&y>=r[1]&&x<=r[0]+r[2]&&y<=r[1]+r[3];
 function rectangle(row){return row.terminal||row.rect;}
 async function prepare(index){
  if(catalogs.has(index))return catalogs.get(index);
  const pending=(async()=>{
   const data=await load(index),records=new Map(index.regions.map(r=>[r.record,r])),pages=new Map(index.pages.map(p=>[p.page,p])),byPage=new Map(),byRecord=new Map(),byPin=new Map(),candidates=new Map(),rejected=[];
   for(const [name,pads] of Object.entries(data?.pins||{}))for(const [pad,rows] of Object.entries(pads)){
    if(!Array.isArray(rows))continue;
    for(const row of rows){
     const r=records.get(row.record),page=pages.get(row.page);
     if(!page||r?.page!==row.page||String(r.identifier).toUpperCase()!==name.toUpperCase()||!validRect(row.rect))continue;
     // A terminal may extend to its short wire stub, never to a row of pins.
     // Fall back to the exact printed pad if a stale/imported box spans a group.
     const [x,y,w,h]=row.rect,size=Math.max(w*page.width,h*page.height),t=row.terminal;
     const terminal=validRect(t)&&t[2]*page.width<=size*6&&t[3]*page.height<=size*6&&contains(t,x+w/2,y+h/2)?t:null;
     const pin={...row,terminal,component:name.toUpperCase(),pad:String(pad).toUpperCase()},key=pin.component+'\0'+pin.pad;
     if(!candidates.has(row.page))candidates.set(row.page,[]);candidates.get(row.page).push(pin);
    }
   }
   // Some reconstructed indices assign the same printed text to two symbols,
   // or mistake a glyph fragment for another pad. Do not guess either direction.
   // Compare only printed labels; neighboring wire-stub hit areas may overlap.
   for(const [page,rows] of candidates){const grid=new Map(),bad=new Set();
    for(let i=0;i<rows.length;i++){const a=rows[i],r=a.rect,seen=new Set();
     for(let gx=Math.floor(r[0]*50);gx<=Math.floor((r[0]+r[2])*50);gx++)for(let gy=Math.floor(r[1]*50);gy<=Math.floor((r[1]+r[3])*50);gy++){
      const key=gx+','+gy;if(!grid.has(key))grid.set(key,[]);const bucket=grid.get(key);
      for(const j of bucket){if(seen.has(j))continue;seen.add(j);const b=rows[j],s=b.rect;if(a.component===b.component&&a.pad===b.pad)continue;
       const area=Math.max(0,Math.min(r[0]+r[2],s[0]+s[2])-Math.max(r[0],s[0]))*Math.max(0,Math.min(r[1]+r[3],s[1]+s[3])-Math.max(r[1],s[1]));
       if(area<Math.min(r[2]*r[3],s[2]*s[3])*.55&&!contains(r,s[0]+s[2]/2,s[1]+s[3]/2)&&!contains(s,r[0]+r[2]/2,r[1]+r[3]/2))continue;
       const nativeA=a.source==='jcst_exact_text',nativeB=b.source==='jcst_exact_text';
       if(nativeA&&!nativeB)bad.add(j);else if(nativeB&&!nativeA)bad.add(i);else {bad.add(i);bad.add(j);}
      }bucket.push(i);
     }
    }
    for(let i=0;i<rows.length;i++){const pin=rows[i];if(bad.has(i)){rejected.push({component:pin.component,pad:pin.pad,page,record:pin.record,reason:'ambiguous_printed_label'});continue;}
     if(!byPage.has(page))byPage.set(page,[]);byPage.get(page).push(pin);
     if(!byRecord.has(pin.record))byRecord.set(pin.record,[]);byRecord.get(pin.record).push(pin);
     const key=pin.component+'\0'+pin.pad;if(!byPin.has(key))byPin.set(key,[]);byPin.get(key).push(pin);
    }
   }
   return Object.freeze({forPage:page=>byPage.get(page)||[],forRecord:record=>byRecord.get(record)||[],find:(component,pad)=>byPin.get(String(component).trim().toUpperCase()+'\0'+String(pad).trim().toUpperCase())||[],rejected:Object.freeze(rejected)});
  })();catalogs.set(index,pending);try{return await pending;}catch(e){catalogs.delete(index);throw e;}
 }
 function hitTest(rows,x,y){
  let best=null,rank=Infinity,area=Infinity;
  for(const pin of rows){const text=contains(pin.rect,x,y),rect=text?pin.rect:rectangle(pin);if(!contains(rect,x,y))continue;
   const nextRank=text?0:1,nextArea=rect[2]*rect[3];
   if(nextRank<rank||nextRank===rank&&nextArea<area){best=pin;rank=nextRank;area=nextArea;}
  }
  return best;
 }
 async function find(index,component,pad){return (await prepare(index)).find(component,pad);}
 window.JCIDSchematicPins=Object.freeze({find,prepare,hitTest,rectangle,validRect});
})();
