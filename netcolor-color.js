(() => {
 'use strict';
 const $=id=>document.getElementById(id),dialog=$('netcolorColorDialog'),ns='http://www.w3.org/2000/svg';
 let draft='#ff0000',current=draft,apply=null,hsv={h:0,s:1,v:1},epoch=0,dropper=null;
 const cells=[],valid=c=>/^#[0-9a-f]{6}$/i.test(c),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 function rgbHex(rgb){return '#'+rgb.map(x=>Math.round(clamp(x,0,255)).toString(16).padStart(2,'0')).join('');}
 function toRgb({h,s,v}){const i=Math.floor(h/60)%6,f=h/60-Math.floor(h/60),p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i].map(x=>x*255);}
 function fromHex(c){const [r,g,b]=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=hsv.h;if(d)h=((max===r?(g-b)/d:max===g?2+(b-r)/d:4+(r-g)/d)*60+360)%360;return {h,s:max?d/max:0,v:max};}
 function reflect(){
  $('netcolorColorPicker').value=draft;$('netcolorColorHex').value=draft.toUpperCase();$('netcolorColorNew').style.background=draft;$('netcolorColorCurrent').style.background=current;
  $('netcolorColorNew').setAttribute('aria-label','Nova cor '+draft);$('netcolorColorCurrent').setAttribute('aria-label','Cor atual '+current);
  [1,3,5].forEach((n,i)=>{$(['netcolorColorRed','netcolorColorGreen','netcolorColorBlue'][i]).value=parseInt(draft.slice(n,n+2),16);});
  $('netcolorColorHue').value=Math.round(hsv.h);$('netcolorColorSaturation').style.setProperty('--hue',hsv.h);
  $('netcolorColorCursor').style.left=(hsv.s*100)+'%';$('netcolorColorCursor').style.top=((1-hsv.v)*100)+'%';
  $('netcolorColorSaturation').setAttribute('aria-valuenow',String(Math.round(hsv.s*100)));
  $('netcolorColorSaturation').setAttribute('aria-valuetext','Saturação '+Math.round(hsv.s*100)+'%, brilho '+Math.round(hsv.v*100)+'%');
  let selected=-1;cells.forEach((cell,i)=>{const yes=cell.dataset.color===draft;cell.setAttribute('aria-selected',String(yes));if(yes&&selected<0)selected=i;});
  cells.forEach((cell,i)=>cell.setAttribute('tabindex',String(i===(selected<0?0:selected)?0:-1)));
  $('netcolorColorApply').disabled=false;$('netcolorColorHex').setCustomValidity('');$('netcolorColorStatus').textContent='';
 }
 function setColor(color){if(!valid(color))return false;draft=color.toLowerCase();hsv=fromHex(draft);reflect();return true;}
 function fromHsv(){draft=rgbHex(toRgb(hsv));reflect();}
 function tab(custom){for(const [id,active] of [['netcolorColorStandardTab',!custom],['netcolorColorCustomTab',custom]]){$(id).setAttribute('aria-selected',String(active));$(id).tabIndex=active?0:-1;}$('netcolorColorStandardPanel').hidden=custom;$('netcolorColorCustomPanel').hidden=!custom;}
 const svg=$('netcolorColorHoneycomb');
 function hexagon(cx,cy,r,color){const group=document.createElementNS(ns,'g'),polygon=document.createElementNS(ns,'polygon');group.dataset.color=color;group.setAttribute('role','option');group.setAttribute('aria-label','Cor '+color);polygon.setAttribute('points',Array.from({length:6},(_,i)=>{const a=(60*i-30)*Math.PI/180;return [cx+r*Math.cos(a),cy+r*Math.sin(a)].join(',');}).join(' '));polygon.setAttribute('fill',color);group.append(polygon);group.addEventListener('click',()=>{setColor(color);group.focus();});group.addEventListener('keydown',e=>{const i=cells.indexOf(group);if(['Enter',' '].includes(e.key)){e.preventDefault();setColor(color);return;}let next;if(e.key==='ArrowRight'||e.key==='ArrowDown')next=(i+1)%cells.length;if(e.key==='ArrowLeft'||e.key==='ArrowUp')next=(i-1+cells.length)%cells.length;if(e.key==='Home')next=0;if(e.key==='End')next=cells.length-1;if(next!==undefined){e.preventDefault();setColor(cells[next].dataset.color);cells[next].focus();}});cells.push(group);svg.append(group);}
 const radius=7,size=10.3;
 for(let r=-radius;r<=radius;r++)for(let q=Math.max(-radius,-r-radius);q<=Math.min(radius,-r+radius);q++){
  const x=Math.sqrt(3)*size*(q+r/2),y=1.5*size*r,distance=Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r)),h=(Math.atan2(y,x)*180/Math.PI+360)%360,t=distance/radius;
  const saturation=distance===0?0:Math.min(1,t*1.7),value=distance===0?1:1-Math.max(0,t-.55)*1.25;
  hexagon(149+x,125+y,size+.12,rgbHex(toRgb({h,s:saturation,v:value})));
 }
 for(let i=0;i<16;i++){const row=i%2,col=Math.floor(i/2),v=Math.round(255*(1-i/17));hexagon(33+col*25+row*12.5,270+row*18,12,rgbHex([v,v,v]));}
 hexagon(264,280,20,'#000000');
 for(const [id,custom] of [['netcolorColorStandardTab',false],['netcolorColorCustomTab',true]]){$(id).addEventListener('click',()=>tab(custom));$(id).addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();tab(!custom);$(custom?'netcolorColorStandardTab':'netcolorColorCustomTab').focus();}});}
 $('netcolorColorHex').addEventListener('input',()=>{const c=$('netcolorColorHex').value.trim();if(valid(c))setColor(c);else{$('netcolorColorApply').disabled=true;$('netcolorColorHex').setCustomValidity('Digite uma cor no formato #RRGGBB.');}});
 $('netcolorColorPicker').addEventListener('input',()=>setColor($('netcolorColorPicker').value));
 for(const id of ['netcolorColorRed','netcolorColorGreen','netcolorColorBlue'])$(id).addEventListener('input',()=>{const inputs=['netcolorColorRed','netcolorColorGreen','netcolorColorBlue'].map($),values=inputs.map(i=>Number(i.value));if(inputs.some(i=>i.value==='')||values.some(v=>!Number.isInteger(v)||v<0||v>255)){$('netcolorColorApply').disabled=true;return;}setColor(rgbHex(values));});
 $('netcolorColorHue').addEventListener('input',()=>{hsv.h=Number($('netcolorColorHue').value)%360;fromHsv();});
 const field=$('netcolorColorSaturation');let pointer=null;
 function point(e){const box=field.getBoundingClientRect();hsv.s=clamp((e.clientX-box.left)/box.width);hsv.v=1-clamp((e.clientY-box.top)/box.height);fromHsv();}
 field.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();pointer=e.pointerId;field.setPointerCapture(pointer);field.focus();point(e);});field.addEventListener('pointermove',e=>{if(pointer===e.pointerId)point(e);});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])field.addEventListener(ev,()=>{if(pointer!==null&&field.hasPointerCapture(pointer))field.releasePointerCapture(pointer);pointer=null;});
 field.addEventListener('keydown',e=>{const step=e.shiftKey?.1:.01;if(e.key==='ArrowLeft')hsv.s=clamp(hsv.s-step);else if(e.key==='ArrowRight')hsv.s=clamp(hsv.s+step);else if(e.key==='ArrowUp')hsv.v=clamp(hsv.v+step);else if(e.key==='ArrowDown')hsv.v=clamp(hsv.v-step);else return;e.preventDefault();fromHsv();});
 $('netcolorColorEyedropper').disabled=!window.EyeDropper;$('netcolorColorEyedropper').title=window.EyeDropper?'Escolher uma cor na tela':'Captura de cor indisponível neste navegador';
 $('netcolorColorEyedropper').addEventListener('click',async()=>{if(!window.EyeDropper)return;const token=epoch;dropper?.abort();dropper=new AbortController();try{const result=await new window.EyeDropper().open({signal:dropper.signal});if(dialog.open&&epoch===token)setColor(result.sRGBHex);}catch(error){if(error.name!=='AbortError'&&dialog.open&&epoch===token)$('netcolorColorStatus').textContent='Não foi possível capturar a cor. Escolha na paleta.';}});
 function close(){epoch++;dropper?.abort();dropper=null;apply=null;if(dialog.open)dialog.close();}
 dialog.addEventListener('close',()=>{epoch++;dropper?.abort();dropper=null;apply=null;});
 for(const id of ['netcolorColorClose','netcolorColorCancel'])$(id).addEventListener('click',close);
 $('netcolorColorForm').addEventListener('submit',e=>{e.preventDefault();if($('netcolorColorApply').disabled||!valid($('netcolorColorHex').value.trim()))return;const callback=apply,color=draft;close();callback?.(color);});
 window.JCIDColorDialog=Object.freeze({open(color,onApply){close();current=valid(color)?color.toLowerCase():'#ff0000';setColor(current);tab(false);apply=onApply;dialog.showModal();$('netcolorColorApply').focus();},close});
})();
