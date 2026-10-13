/* Screen-only educational connectors. Original board/copper geometry is never
 * edited: copper stays exact, and contact/view/gap links remain distinguishable. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.NexusStudyVisual80=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const EPS=1e-6,dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),finite=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
 const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
 function rect(value){
  if(Array.isArray(value)&&value.length===4&&value.every(Number.isFinite))return[value[0],value[1],value[2],value[3]];
  if(value&&[value.left,value.top,value.right,value.bottom].every(Number.isFinite))return[value.left,value.top,value.right,value.bottom];
  if(value&&[value.x,value.y,value.width,value.height].every(Number.isFinite))return[value.x,value.y,value.x+value.width,value.y+value.height];
  return null;
 }
 function clean(points){const out=[];for(const p of points)if(!out.length||dist(p,out.at(-1))>EPS)out.push(p.slice());return out.length===1?[out[0],out[0].slice()]:out;}
 function metrics(points){const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+dist(points[i-1],points[i]));return{lengths,length:lengths.at(-1)||0};}
 function overlap(a,b,r){
  const delta=[b[0]-a[0],b[1]-a[1]];let lo=0,hi=1;
  for(let axis=0;axis<2;axis++){if(Math.abs(delta[axis])<EPS){if(a[axis]<r[axis]||a[axis]>r[axis+2])return 0;}else{let enter=(r[axis]-a[axis])/delta[axis],leave=(r[axis+2]-a[axis])/delta[axis];if(enter>leave)[enter,leave]=[leave,enter];lo=Math.max(lo,enter);hi=Math.min(hi,leave);if(lo>=hi)return 0;}}
  return Math.max(0,hi-lo)*dist(a,b);
 }
 function roundCorners(points,radius=9){
  points=clean(points);if(points.length<3)return points;const out=[points[0].slice()];
  for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],ab=dist(a,b),bc=dist(b,c),r=Math.min(radius,ab*.3,bc*.3);if(r<EPS){out.push(b.slice());continue;}
   const enter=lerp(b,a,r/ab),leave=lerp(b,c,r/bc);out.push(enter);const samples=Math.max(3,Math.min(10,Math.ceil(r/2)));for(let n=1;n<=samples;n++){const t=n/samples,s=1-t;out.push([s*s*enter[0]+2*s*t*b[0]+t*t*leave[0],s*s*enter[1]+2*s*t*b[1]+t*t*leave[1]]);}
  }
  out.push(points.at(-1).slice());return clean(out);
 }
 function curved(a,b,offset){
  const d=dist(a,b);if(d<1)return[a.slice(),b.slice()];const perpendicular=[-(b[1]-a[1])/d,(b[0]-a[0])/d],c1=lerp(a,b,.33),c2=lerp(a,b,.67),amount=Math.min(30+offset,d*.12);
  for(const c of [c1,c2]){c[0]+=perpendicular[0]*amount;c[1]+=perpendicular[1]*amount;}const points=[];for(let n=0;n<=20;n++){const t=n/20,s=1-t;points.push([s*s*s*a[0]+3*s*s*t*c1[0]+3*s*t*t*c2[0]+t*t*t*b[0],s*s*s*a[1]+3*s*s*t*c1[1]+3*s*t*t*c2[1]+t*t*t*b[1]]);}points[0]=a.slice();points[points.length-1]=b.slice();return points;
 }
 function connector(a,b,options={}){
  if(!finite(a)||!finite(b))return[];if(dist(a,b)<2)return[a.slice(),b.slice()];
  const boards=(options.boardBounds||[]).map(rect).filter(Boolean),viewport=rect(options.bounds),lane=Math.max(0,Number(options.lane)||0),margin=12+(lane%6)*7;
  const inBounds=p=>!viewport||p[0]>=viewport[0]-EPS&&p[0]<=viewport[2]+EPS&&p[1]>=viewport[1]-EPS&&p[1]<=viewport[3]+EPS,stayVisible=!!viewport&&inBounds(a)&&inBounds(b);
  const safeCurve=()=>{const points=curved(a,b,(lane%6)*5).map(p=>stayVisible?[Math.max(viewport[0],Math.min(viewport[2],p[0])),Math.max(viewport[1],Math.min(viewport[3],p[1]))]:p);points[0]=a.slice();points[points.length-1]=b.slice();return points;};
  if(!boards.length)return safeCurve();
  const outer=[Math.min(...boards.map(r=>r[0])),Math.min(...boards.map(r=>r[1])),Math.max(...boards.map(r=>r[2])),Math.max(...boards.map(r=>r[3]))],candidates=[],maximumDetour=dist(a,b)*1.35+24;
  const push=points=>{points=clean(points);if(points.length<2||stayVisible&&points.some(p=>!inBounds(p)))return;const m=metrics(points);if(m.length>maximumDetour+EPS)return;let inside=0,outside=0;for(let i=1;i<points.length;i++){for(const r of boards)inside+=overlap(points[i-1],points[i],r);if(viewport)outside+=dist(points[i-1],points[i])-overlap(points[i-1],points[i],viewport);}candidates.push({points,length:m.length,score:m.length+inside*2.4+outside*1.6});};
  // Select an outside lane when it avoids drawing a long connection across
  // populated board faces. If zoom leaves no usable lane, a short curve/direct
  // connector still preserves exact endpoints instead of clipping or teleporting.
  const top=outer[1]-margin,bottom=outer[3]+margin,left=outer[0]-margin,right=outer[2]+margin;
  push([a,[a[0],top],[b[0],top],b]);push([a,[a[0],bottom],[b[0],bottom],b]);push([a,[left,a[1]],[left,b[1]],b]);push([a,[right,a[1]],[right,b[1]],b]);
  if(viewport){const [l,t,r,d]=viewport;for(const y of [t+margin,d-margin])push([a,[a[0],y],[b[0],y],b]);for(const x of [l+margin,r-margin])push([a,[x,a[1]],[x,b[1]],b]);}
  push(safeCurve());candidates.sort((x,y)=>x.score-y.score||x.length-y.length);const selected=candidates[0];if(!selected)return[a.slice(),b.slice()];
  const points=selected.points.length>8?selected.points:roundCorners(selected.points,8);points[0]=a.slice();points[points.length-1]=b.slice();return points.every(finite)?points:[a.slice(),b.slice()];
 }
 function compile(route,project,options={}){
  const issues=[],raw=route?.legs||[],legs=[],points=[];let total=0;
  const screen=p=>{const v=project(p[0],p[1]);const q=Array.isArray(v)?v:[v?.x,v?.y];return finite(q)?[q[0],q[1]]:null;};
  for(let i=0;i<raw.length;i++){
   const source=raw[i],projected=(source.points||[]).map(screen);if(!projected.length||projected.some(p=>!p)){issues.push({leg:i,reason:'invalid-projection'});continue;}
   let visual=projected.map(p=>p.slice()),connection=source.kind!=='copper';
   if(source.kind==='view-transition'){try{visual=connector(visual[0],visual.at(-1),options);}catch(_){issues.push({leg:i,reason:'connector-fallback'});visual=[projected[0],projected.at(-1)];}}
   // Internal edges are proven contacts inside pad/via copper. Drawing their
   // centerline thin and dotted prevents visual holes without pretending that
   // centerline was an original track segment. They are never silently skipped.
   visual=clean(visual);if(!visual.length)visual=[projected[0],projected.at(-1)];
   const m=metrics(visual),leg={...source,sourceKind:source.kind,sourceLegIndex:i,displayKind:connection?'connection':'copper',dashed:connection,points:visual,lengths:m.lengths,length:m.length,animationLength:m.length,start:total,visibleConnection:connection&&m.length>EPS};
   if(legs.length&&dist(legs.at(-1).points.at(-1),visual[0])>EPS)issues.push({leg:i,reason:'source-discontinuity',gap:dist(legs.at(-1).points.at(-1),visual[0])});
   total+=m.length;legs.push(leg);for(const p of visual)if(!points.length||dist(points.at(-1),p)>EPS)points.push(p.slice());
  }
  const from=screen(route?.fromPoint||route?.points?.[0]||raw[0]?.points?.[0]||[NaN,NaN]),to=screen(route?.toPoint||route?.points?.at(-1)||raw.at(-1)?.points?.at(-1)||[NaN,NaN]);
  const continuous=legs.length===raw.length&&!issues.some(i=>i.reason==='source-discontinuity'||i.reason==='invalid-projection')&&!!from&&!!to&&!!points.length&&dist(points[0],from)<EPS&&dist(points.at(-1),to)<EPS;
  return{...route,legs,points,from,to,total,length:total,continuous,issues};
 }
 return Object.freeze({compile,connector,roundCorners});
});
