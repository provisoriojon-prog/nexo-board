(() => {
 'use strict';
 const $=id=>document.getElementById(id),board=window.JCIDBoardView,pane=$('netcolorPane'),button=$('netcolorTool'),dialog=$('netcolorColorDialog');
 if(!board||!pane)return;
 const checked=new Set(),palette=['#ff0000','#ff6600','#ffff00','#00ff00','#00ffff','#0066ff','#0000ff','#9900ff','#ff00ff','#ff0066','#009900','#008080','#800000','#000080','#ffffff','#000000'];
 const firstColors=['#80ed80','#00ffff','#ff50c8','#0000ff','#ff8000','#800020','#556b2f','#8a00ff'];
 let boardKey=null,anchor=null,colorTargets=[],locatingFromList=false,pendingReveal=null,revealFrame=0;
 const currentGroup=()=>board.getNetColorGroup(),groupLabel={normal:'Cores',alternative:'Alternativa'},groupScroll={normal:0,alternative:0},groupAnchor={normal:null,alternative:null};
 let renderedGroup=currentGroup();
 // Both lists share the compact controls below; board state keeps their colors,
 // checks, order and isolation independent, including across saved sessions.
 const alternative=document.createElement('button');alternative.id='netcolorAlternative';alternative.type='button';alternative.innerHTML='Cor alternativa <kbd>P</kbd>';alternative.title='Adicionar à lista alternativa, começando em preto · P';
 $('netcolorAdd').after(alternative);
 const listHead=document.createElement('div');listHead.className='netcolor-listhead';
 const tabs=document.createElement('div');tabs.className='netcolor-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Lista de cores');
 for(const group of ['normal','alternative']){const tab=document.createElement('button');tab.type='button';tab.id='netcolorTab-'+group;tab.dataset.group=group;tab.textContent=groupLabel[group];tab.setAttribute('role','tab');tab.setAttribute('aria-controls','netcolorList');tab.addEventListener('click',()=>switchGroup(group));tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'normal':e.key==='End'?'alternative':currentGroup()==='normal'?'alternative':'normal';switchGroup(next);$('netcolorTab-'+next).focus();});tabs.append(tab);}
 listHead.append(tabs);const autoColor=$('netcolorAutoColor').closest('label');if(autoColor)listHead.append(autoColor);$('netcolorList').before(listHead);$('netcolorList').setAttribute('role','tabpanel');
 function switchGroup(group,options){if(currentGroup()===group)return;pendingReveal=null;board.setNetColorGroup(group,options);}
 const active=()=>!document.body.classList.contains('source-mode')&&!document.body.classList.contains('board-loading');
 const validColor=c=>/^#[0-9a-f]{6}$/i.test(c);
 function selected(){if(!active())return null;const id=board.getState().net;return window.JCID_BOARD.nets.find(n=>n.id===id)||null;}
 function open(){board.openTools();pane.hidden=false;button.setAttribute('aria-pressed','true');button.setAttribute('aria-expanded','true');window.dispatchEvent(new CustomEvent('jcid:tool',{detail:'netcolor'}));refresh();}
 function close(){pane.hidden=true;button.setAttribute('aria-pressed','false');button.setAttribute('aria-expanded','false');}
 function nextColor(){
  const index=board.getNetColorSequence(),used=new Set([...firstColors,...board.getNetColors().map(n=>n.color.toLowerCase())]);
  if(index<firstColors.length)return firstColors[index];
  // Saturated greens, cyan, blues, violet and pink; no red/yellow/gray/white.
  // Keep the first eight exact values reserved even after a row is removed.
  const hsl=(h,s,l)=>{const a=s*Math.min(l,1-l),channel=n=>{const k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));};return '#'+[0,8,4].map(n=>Math.round(channel(n)*255).toString(16).padStart(2,'0')).join('');};
  for(let attempt=0;attempt<256;attempt++){const color=hsl(95+Math.random()*225,.75+Math.random()*.25,.38+Math.random()*.24);if(!used.has(color))return color;}
  // A bounded fallback also avoids collisions if a random source repeats.
  for(let i=0;i<65536;i++){const color=hsl(95+(i%225),.75+(Math.floor(i/225)%6)*.04,.38+(Math.floor(i/1350)%13)*.02);if(!used.has(color))return color;}
  return '#32cd32';
 }
 function add(group='normal'){const net=selected();if(!net)return false;switchGroup(group);if(!board.getNetColors().some(n=>n.id===net.id)&&!board.setNetColor(net.id,group==='alternative'?'#000000':nextColor()))return false;pendingReveal=net.id;open();return true;}
 function refreshActions(){
  $('netcolorAutoColor').checked=board.getAutoColorEnabled();
  const rows=board.getNetColors(),hasChecked=rows.some(n=>checked.has(n.id));
  $('netcolorAll').checked=!!rows.length&&rows.every(n=>checked.has(n.id));$('netcolorAll').indeterminate=hasChecked&&!$('netcolorAll').checked;
  $('netcolorAll').disabled=!rows.length;$('netcolorRemove').disabled=!hasChecked;$('netcolorClear').disabled=!rows.length;$('netcolorGroup').disabled=rows.length<2;$('netcolorCustom').disabled=!hasChecked;
  const mode=board.getNetColorIsolation(),isChecked=mode.enabled&&mode.scope==='checked';
  $('netcolorIsolate').disabled=!active()||!rows.length||!hasChecked&&!isChecked;$('netcolorIsolate').setAttribute('aria-pressed',String(isChecked));
  $('netcolorIsolateAll').disabled=!active()||!rows.length;$('netcolorIsolateAll').setAttribute('aria-pressed',String(mode.enabled&&mode.scope==='all'));
  for(const swatch of $('netcolorPalette').children)swatch.disabled=!hasChecked;
 }
 function reflectChecked(){board.setNetColorChecked([...checked]);for(const line of $('netcolorList').children){const input=line.querySelector('input');if(!input)continue;const yes=checked.has(Number(input.dataset.net));input.checked=yes;line.classList.toggle('is-checked',yes);}refreshActions();}
 function mark(id,e){
  pendingReveal=null;
  const ids=board.getNetColors().map(n=>n.id),index=ids.indexOf(id),start=ids.indexOf(anchor),multiple=e.ctrlKey||e.metaKey;
  if(e.shiftKey&&start>=0){if(!multiple)checked.clear();for(let i=Math.min(start,index);i<=Math.max(start,index);i++)checked.add(ids[i]);}
  else if(multiple){checked.has(id)?checked.delete(id):checked.add(id);anchor=id;}
  else{const turnOff=checked.size===1&&checked.has(id);checked.clear();if(!turnOff)checked.add(id);anchor=id;}
  reflectChecked();
 }
 // Reveal only on a requested selection, after the panel has a real viewport.
 function queueReveal(){
  if(revealFrame||pendingReveal===null)return;
  revealFrame=requestAnimationFrame(()=>{
   revealFrame=0;const list=$('netcolorList');
   if(pendingReveal===null||pane.hidden||!list.clientHeight||!list.clientWidth)return;
   const row=list.querySelector('[data-net="'+pendingReveal+'"]')?.parentElement;
   if(!row){pendingReveal=null;return;}
   const bounds=list.getBoundingClientRect(),item=row.getBoundingClientRect(),top=bounds.top+list.clientTop,bottom=top+list.clientHeight;
   if(item.top<top||item.bottom>bottom)list.scrollTop+=(item.top+item.bottom-top-bottom)/2;
   pendingReveal=null;
  });
 }
 function selectionChanged(event){
  // Restoring tabs/Notes must preserve their list and multi-selection, rather
  // than treating the restored board selection as a fresh user click.
  if(event.detail?.preserveNetcolor){pendingReveal=null;refresh();return;}
  const net=locatingFromList?null:selected();
  // Prefer the visible list if both contain the same line. Otherwise reveal
  // its independent list automatically, with the matching row in view.
  if(net&&!board.getNetColors().some(row=>row.id===net.id)){const other=currentGroup()==='normal'?'alternative':'normal';if(board.getNetColors(other).some(row=>row.id===net.id))switchGroup(other,{checked:[net.id]});}
  const match=net&&board.getNetColors().some(row=>row.id===net.id);
  // Board selection checks an existing entry without toggling it off. Locating
  // from this list must not replace a deliberate Ctrl/Shift checkbox selection.
  if(!locatingFromList)pendingReveal=match?net.id:null;
  if(match){anchor=net.id;board.setNetColorChecked([net.id]);}
  refresh();
 }
 function applyColor(ids,color,group=currentGroup()){if(validColor(color))board.recolorNetColors(ids,color.toLowerCase(),group);}
 window.addEventListener('jcid:netnames-changed',()=>refresh());
 function refresh(){
  const group=currentGroup();let restoredScroll=null;if(group!==renderedGroup){groupScroll[renderedGroup]=$('netcolorList').scrollTop;groupAnchor[renderedGroup]=anchor;renderedGroup=group;anchor=groupAnchor[group];restoredScroll=groupScroll[group];}
  for(const tab of tabs.children){const yes=tab.dataset.group===group;tab.setAttribute('aria-selected',String(yes));tab.tabIndex=yes?0:-1;}
  $('netcolorList').setAttribute('aria-labelledby','netcolorTab-'+group);pane.dataset.colorGroup=group;
  checked.clear();for(const id of board.getNetColorChecked())checked.add(id);
  const rows=board.getNetColors(),ids=new Set(rows.map(n=>n.id));for(const id of checked)if(!ids.has(id))checked.delete(id);if(!ids.has(anchor))anchor=null;
  const net=selected();$('netcolorCurrent').textContent=net?.name||'Selecione uma linha na placa';$('netcolorCurrent').title=net?.name||'';$('netcolorAdd').disabled=!net;alternative.disabled=!net;
  const focused=document.activeElement?.dataset?.net,fragment=document.createDocumentFragment();
  for(const row of rows){
   const line=document.createElement('div');line.className='netcolor-row';line.classList.toggle('is-checked',checked.has(row.id));
   const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=checked.has(row.id);checkbox.dataset.net=String(row.id);checkbox.setAttribute('aria-label','Marcar '+row.name);checkbox.title='Clique: uma linha · Ctrl: várias · Shift: intervalo';
   checkbox.addEventListener('click',e=>mark(row.id,e));
   const name=document.createElement('button');name.type='button';name.className='netcolor-name';name.title=row.name;name.textContent=row.name;name.style.setProperty('--net-color',row.color);name.setAttribute('aria-label','Selecionar linha '+row.name);name.addEventListener('click',()=>{if(!active())return;locatingFromList=true;try{board.selectNet(row.id);}finally{locatingFromList=false;}});
   line.append(checkbox,name);fragment.append(line);
  }
  if(!rows.length){const empty=document.createElement('p');empty.className='netcolor-empty';empty.textContent=group==='alternative'?'Selecione uma linha e use Cor alternativa ou P. Cada nova linha começa em preto.':'Selecione uma linha e use Adicionar ou A.';fragment.append(empty);}
  const scroll=restoredScroll??$('netcolorList').scrollTop;$('netcolorList').replaceChildren(fragment);$('netcolorList').scrollTop=scroll;
  if(focused!==undefined)$('netcolorList').querySelector('[data-net="'+focused+'"]')?.focus({preventScroll:true});refreshActions();queueReveal();
 }
 for(const color of palette){const swatch=document.createElement('button');swatch.type='button';swatch.className='netcolor-swatch';swatch.style.background=color;swatch.title='Aplicar '+color;swatch.setAttribute('aria-label','Aplicar cor '+color+' às linhas marcadas');swatch.disabled=true;swatch.addEventListener('click',()=>applyColor([...checked],color));$('netcolorPalette').append(swatch);}
 function isolate(scope='checked'){if(!active()||!board.getNetColors().length)return false;const mode=board.getNetColorIsolation(),same=mode.enabled&&mode.scope===scope;if(scope==='checked'&&!checked.size&&!same)return false;board.setNetColorIsolation(!same,{scope});return true;}
 button.addEventListener('click',()=>pane.hidden?open():close());$('netcolorAdd').addEventListener('click',()=>add('normal'));alternative.addEventListener('click',()=>add('alternative'));$('netcolorIsolate').addEventListener('click',()=>isolate('checked'));$('netcolorIsolateAll').addEventListener('click',()=>isolate('all'));
 $('netcolorAutoColor').addEventListener('change',()=>board.setAutoColorEnabled($('netcolorAutoColor').checked));
 window.addEventListener('jcid:autocolor',()=>{$('netcolorAutoColor').checked=board.getAutoColorEnabled();});
 $('netcolorGroup').addEventListener('click',()=>{board.groupNetColorsByColor();const net=selected();pendingReveal=net&&board.getNetColors().some(row=>row.id===net.id)?net.id:null;queueReveal();});
 $('netcolorAll').addEventListener('change',()=>{checked.clear();if($('netcolorAll').checked)for(const row of board.getNetColors())checked.add(row.id);reflectChecked();});
 $('netcolorRemove').addEventListener('click',()=>{board.removeNetColors([...checked]);checked.clear();refresh();});$('netcolorClear').addEventListener('click',()=>{board.clearNetColors();checked.clear();anchor=null;refresh();});
 $('netcolorCustom').addEventListener('click',()=>{colorTargets=[...checked];if(!colorTargets.length)return;const group=currentGroup(),ids=[...colorTargets],current=board.getNetColors().find(n=>checked.has(n.id))?.color||'#ff0000';window.JCIDColorDialog.open(current,color=>applyColor(ids,color,group));});
 document.addEventListener('keydown',e=>{const key=e.key.toLowerCase();if(!['a','p','s','w'].includes(key)||e.repeat||e.ctrlKey||e.altKey||e.metaKey||!active()||document.querySelector('dialog[open]'))return;const t=e.target,typing=t?.tagName==='INPUT'&&!t.readOnly&&!['checkbox','radio','button','submit','reset','range'].includes(t.type);if(t?.isContentEditable||t?.tagName==='TEXTAREA'||t?.tagName==='SELECT'||typing)return;if(key==='a'||key==='p'?add(key==='p'?'alternative':'normal'):isolate(key==='w'?'all':'checked'))e.preventDefault();});
 window.addEventListener('jcid:tool',e=>{if(e.detail!=='netcolor')close();});window.addEventListener('jcid:netcolors',refresh);window.addEventListener('jcid:selection',selectionChanged);window.addEventListener('jcid:document',refresh);window.addEventListener('jcid:boardchange',e=>{if(boardKey!==e.detail?.id){checked.clear();anchor=null;groupAnchor.normal=groupAnchor.alternative=null;groupScroll.normal=groupScroll.alternative=0;renderedGroup=currentGroup();$('netcolorList').scrollTop=0;colorTargets=[];pendingReveal=null;boardKey=e.detail?.id;if(dialog.open)window.JCIDColorDialog.close();}refresh();});
 window.addEventListener('jcid:panels',queueReveal);new ResizeObserver(queueReveal).observe($('netcolorList'));
 window.addEventListener('jcid:boardloadstate',refresh);refresh();
})();
