/* Presentation timing and viewport math, also available to focused Node tests. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.NexusStudyPresentation89=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const duration=step=>Math.round(Math.min(20000,Math.max(11000,((step?.summary||'').length+(step?.explanation||'').length)*35))*.6);
 const loopPreference=stored=>stored!=='false';
 const nextStep=(index,count,loop)=>index+1<count?{index:index+1,finished:false}:loop&&count?{index:0,finished:false}:{index,finished:true};
 function insets(canvas,card,visible){if(!visible||!canvas||!card)return {};const bottom=Math.max(0,canvas.bottom-card.top)+12;return Number.isFinite(bottom)?{bottom}:{};}
 return Object.freeze({duration,loopPreference,nextStep,insets});
});
/* A guided journey with a compact sidebar and a bubble only when it is hidden. */
(() => {
 'use strict';
 if(typeof window==='undefined'||typeof document==='undefined')return;
 const $=id=>document.getElementById(id),pane=$('functionStudiesPane'),content=$('functionStudyContent'),board=window.JCIDBoardView,flow=window.NexusStudyFlow77,base=window.NexusFunctionStudies77,math=window.NexusStudyPresentation89;
 if(!pane||!content||!board||!flow||!base||$('studyMode83'))return;
 const wrap=$('canvasWrap'),workspace=$('workspace'),loopKey='nexus-study-story89-loop';
 const paths={previous:'<path d="m14 5-7 7 7 7"/>',next:'<path d="m10 5 7 7-7 7"/>',restart:'<path d="M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6"/>',locate:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>'};
 const icon=name=>'<svg class="study-playback-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+paths[name]+'</svg>';
 const control=(name,label)=>'<button type="button" data-story-action="'+name+'" title="'+label+'" aria-label="'+label+'">'+icon(name)+'</button>';
 const transport=()=>'<div class="story83-transport"><div class="story83-controls">'+control('restart','Desde o início')+control('previous','Etapa anterior')+'<button type="button" data-story-action="play"></button>'+control('next','Próxima etapa')+control('locate','Enquadrar etapa')+'</div><label class="story89-loop"><input type="checkbox" id="storyLoop89" data-story-loop checked>Loop</label></div>';
 const analysis=document.createElement('div');analysis.id='studyAnalysis83';while(content.firstChild)analysis.append(content.firstChild);
 const modes=document.createElement('div');modes.id='studyMode83';modes.className='study-mode83';modes.setAttribute('role','group');modes.setAttribute('aria-label','Modo de estudo');
 modes.innerHTML='<button type="button" data-study-mode="analysis" aria-pressed="true">Circuitos</button><button type="button" data-study-mode="story" aria-pressed="false">Passo a passo</button>';
 const storyPanel=document.createElement('section');storyPanel.id='studyJourney83';storyPanel.hidden=true;storyPanel.setAttribute('aria-label','Passo a passo da carga');
 storyPanel.innerHTML='<div class="story83-heading"><select id="storyStep83" aria-label="Etapa da carga"></select><span class="story83-counter"></span></div>'+transport()+'<div class="story83-progress" aria-hidden="true"><i></i></div><article class="story83-copy"><h3 class="story83-title"></h3><p class="story83-direction"></p><p class="story83-summary"></p></article><details class="story84-detail"><summary>Como funciona</summary><p class="story83-explanation"></p><p class="story84-mechanism"></p><div class="story84-terminals" aria-label="Terminais da etapa"></div><div class="story84-signals"></div><ul class="story84-dependencies"></ul><p class="story84-observation"></p></details>';
 content.append(modes,analysis,storyPanel);
 const card=document.createElement('section');card.id='storyCard83';card.hidden=true;card.setAttribute('aria-label','Etapa da carga');card.setAttribute('aria-live','polite');card.setAttribute('aria-atomic','true');
 card.innerHTML='<div class="story83-cardhead"><strong class="story83-title"></strong><span class="story83-counter"></span></div><p class="story83-summary"></p>';
 wrap.append(card);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let model=null,mode='analysis',index=0,running=false,finished=false,elapsed=0,frame=0,lastTime=0,generation=0,applying=false,lastContext='',layoutFrame=0,lastLayoutKey='',cameraBox=null,loop=true,suspended=false,resumeSnapshot=null;
 try{loop=math.loopPreference(localStorage.getItem(loopKey));}catch{}
 const active=()=>mode==='story'&&!pane.hidden&&!!model;
 const collapsed=()=>!!workspace?.classList.contains('tools-hidden');
 const step=()=>model?.steps[index]||null;
 const duration=math.duration;
 const frameWait=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 function component(name){const key=String(name??'').toUpperCase();return window.JCID_BOARD?.components.find(c=>[c.name,c.sourceName,c.sourceComponentName,...(c.componentAliases||[])].some(n=>n&&String(n).toUpperCase()===key))||null;}
 function syncBubble(){card.hidden=!active()||!collapsed();card.classList.toggle('story89-tight',wrap.clientHeight<260);}
 function cameraInsets(){return math.insets(wrap.getBoundingClientRect(),card.getBoundingClientRect(),!card.hidden);}
 function layoutKey(){const insets=cameraInsets();return [wrap.clientWidth,wrap.clientHeight,collapsed(),insets.bottom||0].join('|');}
 function fit(box,milliseconds=450){if(!box)return Promise.resolve(false);lastLayoutKey=layoutKey();if(board.animateFocusBounds)return board.animateFocusBounds(box,{duration:reduced.matches?0:milliseconds,insets:cameraInsets()});return Promise.resolve(board.focusBounds?.(box)!==false);}
 function queueLayout(force=false){
  if(!active())return;syncBubble();cancelAnimationFrame(layoutFrame);const token=generation;
  layoutFrame=requestAnimationFrame(()=>{layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;if(token!==generation||!active())return;syncBubble();const key=layoutKey();if((force||key!==lastLayoutKey)&&cameraBox)void fit(cameraBox,180);});});
 }
 function stop(){cancelAnimationFrame(frame);cancelAnimationFrame(layoutFrame);frame=0;layoutFrame=0;lastTime=0;generation++;board.cancelStudyCamera?.();running=false;cameraBox=null;lastLayoutKey='';card.hidden=true;document.body.classList.remove('nexus-story83-active');}
 function leaveStory(resetFocus=false){
  const owned=mode==='story';resumeSnapshot=null;stop();mode='analysis';
  if(owned){applying=true;try{if(resetFocus)flow.focusComponent(null);else if(flow.state()?.storyStepId===step()?.id)flow.clearStoryStep?.();}finally{applying=false;}}
  render();window.dispatchEvent(new CustomEvent('nexus:function-study'));return true;
 }
 function updateModel(){
  const study=base.getStudy(),ctx=base.getContext(),key=(ctx?.itemId||'')+':'+(ctx?.boardId||'')+':'+(window.JCID_BOARD?.nexusRevision||'base');
  const next=study&&window.NexusChargingStory83?.getStory(window.JCID_BOARD,ctx,study)||null;
  if(key!==lastContext){if(mode==='story')leaveStory(false);else stop();mode='analysis';index=0;finished=false;lastContext=key;}
  model=next?.available===false?null:next;index=Math.max(0,Math.min(index,(model?.steps.length||1)-1));const options=$('storyStep83');options.replaceChildren();
  for(const [i,s]of(model?.steps||[]).entries()){const option=document.createElement('option');option.value=String(i);option.textContent=(i+1)+'. '+s.title;options.append(option);}
  modes.querySelector('[data-study-mode="story"]').disabled=!model?.steps?.length;
  if(!model&&mode==='story')leaveStory(false);render();return model;
 }
 function render(){
  const current=step(),isStory=mode==='story';analysis.hidden=isStory;storyPanel.hidden=!isStory;
  modes.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.studyMode===mode)));
  document.body.classList.toggle('nexus-story83-active',active());syncBubble();
  storyPanel.querySelector('[data-story-loop]').checked=loop;
  if(!current)return;
  for(const view of[storyPanel,card]){
   view.querySelector('.story83-counter').textContent=(index+1)+' / '+model.steps.length;
   view.querySelector('.story83-title').textContent=current.title;view.querySelector('.story83-title').title=current.title;
   view.querySelector('.story83-summary').textContent=current.summary;view.querySelector('.story83-summary').title=current.summary;
  }
  const play=storyPanel.querySelector('[data-story-action="play"]'),label=finished?'Recomeçar':running?'Pausar':'Continuar';
  const shape=finished?paths.restart:running?'<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>':'<path d="m8 5 11 7-11 7Z"/>';
  play.innerHTML='<svg class="study-playback-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+shape+'</svg><span>'+label+'</span>';
  play.setAttribute('aria-label',label+' a apresentação');play.title=label+' a apresentação';play.setAttribute('aria-pressed',String(running));
  storyPanel.querySelector('[data-story-action="previous"]').disabled=index===0;
  storyPanel.querySelector('[data-story-action="next"]').disabled=index===model.steps.length-1;
  const roles=[...new Set((current.flowRoles||[]).map(r=>r.direction).filter(r=>r==='in'||r==='out'))],reference=current.directionReferenceComponentName;
  const direction=storyPanel.querySelector('.story83-direction');direction.textContent=roles.length===1?(roles[0]==='in'?'Entrada em ':'Saída de ')+reference:roles.length?'Entradas e saídas · '+reference:'Conexão sem sentido único';direction.dataset.role=roles.length===1?roles[0]:'neutral';
  $('storyStep83').value=String(index);storyPanel.querySelector('.story83-explanation').textContent=current.explanation||'';
  const terminals=storyPanel.querySelector('.story84-terminals');terminals.replaceChildren();
  for(const group of flow.getEndpointGroups?.()||[]){const button=document.createElement('button');button.type='button';button.dataset.storyPad=String(group.pinId);button.style.setProperty('--terminal-color',group.color);button.setAttribute('aria-label','Aproximar '+group.component+', pads '+group.pads.join(', '));button.title=group.component+' · '+group.pads.join(', ');const name=document.createElement('strong'),pads=document.createElement('span');name.textContent=group.component;pads.textContent=group.pads.join(' / ');button.append(name,pads);terminals.append(button);}
  storyPanel.querySelector('.story84-mechanism').textContent=current.mechanism||'';
  const signals=storyPanel.querySelector('.story84-signals');signals.replaceChildren();
  for(const signal of current.signals||[]){const row=document.createElement('div'),net=document.createElement('strong'),ends=document.createElement('span');net.textContent=signal.netName;ends.textContent=signal.from+(signal.bidirectional?' ↔ ':signal.direction==='in'||signal.direction==='out'?' → ':' — ')+signal.to;row.append(net,ends);signals.append(row);}
  const dependencies=storyPanel.querySelector('.story84-dependencies');dependencies.replaceChildren();for(const text of current.dependencies||[]){const li=document.createElement('li');li.textContent=text;dependencies.append(li);}
  storyPanel.querySelector('.story84-observation').textContent=current.observation||'';
  if(isStory){const text='Etapa '+(index+1)+' de '+model.steps.length+(finished?' · Concluído':running?'':' · Pausado');if($('functionStudyStatus')&&$('functionStudyStatus').textContent!==text)$('functionStudyStatus').textContent=text;}
  progress();queueLayout();
 }
 function progress(){const amount=Math.min(1,elapsed/duration(step()));storyPanel.querySelector('.story83-progress i').style.transform='scaleX('+amount+')';}
 function clock(now){
  frame=0;if(!active()||!running||document.hidden)return;elapsed+=lastTime?Math.min(250,now-lastTime):0;lastTime=now;progress();
  if(elapsed>=duration(step())){const next=math.nextStep(index,model.steps.length,loop);if(!next.finished){void showStep(next.index);return;}finished=true;running=false;flow.setPlaying(false);render();return;}
  frame=requestAnimationFrame(clock);
 }
 function startClock(){lastTime=0;if(active()&&running&&!frame&&!document.hidden)frame=requestAnimationFrame(clock);}
 const validBox=box=>Array.isArray(box)&&box.length===4&&box.every(Number.isFinite);
 function boundsFor(current){
  const data=window.JCID_BOARD,parts=current.focusComponentIds?.length?current.focusComponentIds.map(id=>data?.components.find(c=>c.id===id)).filter(Boolean):(current.focusComponentNames||[current.referenceComponentName]).map(component).filter(Boolean),boxes=parts.map(c=>c.bbox).filter(validBox);
  const pinIds=new Set([...(current.endpointPinIds||[]),...(current.focusPinIds||[]),...(flow.getEndpointGroups?.()||[]).flatMap(group=>group.pinIds||[])]);
  for(const id of pinIds){const p=data?.pins.find(p=>p.id===id);if(validBox(p?.bbox))boxes.push(p.bbox);else if(Number.isFinite(p?.x)&&Number.isFinite(p?.y))boxes.push([p.x-100,p.y-100,p.x+100,p.y+100]);}
  // Include the actual route extents, not just the local CI or one representative pad.
  const ids=new Set(current.flowIds||[]);for(const route of flow.state()?.routes||[]){if(!ids.has(route.id))continue;for(const leg of route.legs||[])for(const point of leg.points||[])if(Array.isArray(point)&&point.length>=2&&point.slice(0,2).every(Number.isFinite))boxes.push([point[0],point[1],point[0],point[1]]);}
  if(!boxes.length)return null;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const box of boxes){x0=Math.min(x0,box[0]);y0=Math.min(y0,box[1]);x1=Math.max(x1,box[2]);y1=Math.max(y1,box[3]);}
  const x=(x0+x1)/2,y=(y0+y1)/2,w=Math.max(3000,(x1-x0)*1.2),h=Math.max(3000,(y1-y0)*1.2);return[x-w/2,y-h/2,x+w/2,y+h/2];
 }
 async function locate(current,token){
  if(!current)return false;await frameWait();if(token!==generation||!active())return false;syncBubble();cameraBox=boundsFor(current);return fit(cameraBox,650);
 }
 async function showStep(value,{move=true}={}){
  if(!active())return false;const target=Math.max(0,Math.min(model.steps.length-1,Number(value)||0));
  cancelAnimationFrame(frame);cancelAnimationFrame(layoutFrame);frame=0;layoutFrame=0;board.cancelStudyCamera?.();const token=++generation;index=target;elapsed=0;lastTime=0;finished=false;cameraBox=null;lastLayoutKey='';
  const current=step(),focus=Number.isInteger(current.referenceComponentId)?window.JCID_BOARD?.components.find(c=>c.id===current.referenceComponentId):component(current.referenceComponentName||current.focusComponentNames?.[0]),reference=Number.isInteger(current.directionReferenceComponentId)?window.JCID_BOARD?.components.find(c=>c.id===current.directionReferenceComponentId):component(current.directionReferenceComponentName||current.referenceComponentName||current.focusComponentNames?.[0]);
  applying=true;try{board.clearSelection();flow.setStoryStep({id:current.id,flowIds:current.flowIds||[],focusComponentId:focus?.id??null,referenceComponentId:reference?.id??null});flow.setPlaying(running);}finally{applying=false;}
  render();window.dispatchEvent(new CustomEvent('nexus:function-study'));
  if(move)await locate(current,token);else cameraBox=boundsFor(current);
  if(token!==generation||!active())return false;startClock();return true;
 }
 function pause(){if(!active())return;generation++;cancelAnimationFrame(frame);cancelAnimationFrame(layoutFrame);frame=0;layoutFrame=0;lastTime=0;running=false;board.cancelStudyCamera?.();flow.setPlaying(false);render();}
 function play(){if(!active())return false;if(finished){running=true;return showStep(0);}running=true;flow.setPlaying(true);render();startClock();return true;}
 function setLoop(value){loop=!!value;try{localStorage.setItem(loopKey,String(loop));}catch{}storyPanel.querySelector('[data-story-loop]').checked=loop;return loop;}
 function setMode(value){if(value!=='story')return leaveStory(true);if(!updateModel()?.steps?.length)return false;mode='story';running=true;finished=false;void showStep(index);return true;}
 function action(name){if(name==='previous')void showStep(index-1);else if(name==='next')void showStep(index+1);else if(name==='play')running?pause():play();else if(name==='restart'){running=true;void showStep(0);}else if(name==='locate')void locate(step(),generation);}
 async function locateTerminal(id){
  if(!active())return false;const group=flow.getEndpointGroups?.().find(g=>g.pinId===id);if(!group)return false;
  pause();const token=generation;flow.focusEndpoint(id);const boxes=group.pinIds.map(id=>window.JCID_BOARD.pins.find(p=>p.id===id)?.bbox).filter(validBox);if(!boxes.length)return false;
  const box=[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))],x=(box[0]+box[2])/2,y=(box[1]+box[3])/2,width=Math.max(1200,(box[2]-box[0])*2),height=Math.max(1200,(box[3]-box[1])*2);
  await frameWait();if(token!==generation||!active())return false;cameraBox=[x-width/2,y-height/2,x+width/2,y+height/2];return fit(cameraBox,500);
 }
 modes.addEventListener('click',event=>{const button=event.target.closest('[data-study-mode]');if(button)setMode(button.dataset.studyMode);});
 storyPanel.addEventListener('click',event=>{const terminal=event.target.closest('[data-story-pad]');if(terminal){void locateTerminal(Number(terminal.dataset.storyPad));return;}const button=event.target.closest('[data-story-action]');if(button&&!button.disabled)action(button.dataset.storyAction);});
 storyPanel.addEventListener('change',event=>{if(event.target.matches('[data-story-loop]'))setLoop(event.target.checked);});
 $('storyStep83').addEventListener('change',event=>void showStep(Number(event.target.value)));
 $('boardCanvas').addEventListener('pointerdown',()=>{if(active())pause();},{capture:true,passive:true});$('boardCanvas').addEventListener('wheel',()=>{if(active())pause();},{capture:true,passive:true});
 window.addEventListener('jcid:selection',()=>{if(active()&&!applying&&!suspended)leaveStory(false);});
 window.addEventListener('nexus:study-flow',()=>{if(!active()||applying||suspended)return;const report=flow.state();if(report.storyStepId!==step()?.id){leaveStory(false);return;}if(running&&!report.playing){running=false;cancelAnimationFrame(frame);frame=0;lastTime=0;render();}else if(!running&&!finished&&report.playing){running=true;render();startClock();}});
 window.addEventListener('jcid:tool',event=>{if(event.detail!=='function-studies')leaveStory(false);});
 for(const event of['jcid:document','jcid:boardchange','jcid:boardloadstate','jcid:netnames-changed','nexus:session-ready'])window.addEventListener(event,()=>{if(document.body.classList.contains('board-loading'))leaveStory(false);else updateModel();});
 new MutationObserver(()=>{if(pane.hidden)leaveStory(false);else updateModel();}).observe(pane,{attributes:true,attributeFilter:['hidden']});
 if(workspace)new MutationObserver(()=>queueLayout()).observe(workspace,{attributes:true,attributeFilter:['class']});
 if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(()=>queueLayout());observer.observe(wrap);observer.observe(card);}
 window.addEventListener('jcid:panels',()=>queueLayout(true));window.addEventListener('resize',()=>queueLayout());window.addEventListener('jcid:orientation',()=>queueLayout(true));window.visualViewport?.addEventListener('resize',()=>queueLayout());
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&active())pause();});
 window.addEventListener('pagehide',event=>{resumeSnapshot=event.persisted&&active()?{id:step()?.id,context:lastContext,elapsed,finished}:null;suspended=!!event.persisted;stop();});
 window.addEventListener('pageshow',async event=>{
  const saved=resumeSnapshot,token=generation;if(!event.persisted||!saved){suspended=false;return;}
  // The base tool recreates its cleared flow first. Do not treat that interim
  // overview as a user selection, nor reopen a tool changed while away.
  await frameWait();suspended=false;
  if(token!==generation||resumeSnapshot!==saved){if(resumeSnapshot===saved)resumeSnapshot=null;if(mode==='story'&&flow.state()?.storyStepId!==step()?.id)leaveStory(false);return;}
  const tool=$('functionStudiesTool');if(pane.hidden||tool?.getAttribute('aria-pressed')!=='true'){leaveStory(false);return;}
  updateModel();if(resumeSnapshot!==saved||saved.context!==lastContext)return;resumeSnapshot=null;
  const position=model?.steps.findIndex(value=>value.id===saved.id)??-1;if(position<0){leaveStory(false);return;}
  mode='story';running=false;const restored=await showStep(position);
  if(restored&&active()&&step()?.id===saved.id&&!running){elapsed=Math.min(saved.elapsed,duration(step()));finished=saved.finished;render();}
 });
 window.addEventListener('storage',event=>{if(event.key===loopKey){loop=math.loopPreference(event.newValue);render();}});
 window.NexusStudyStory83=Object.freeze({setMode,showStep,play,pause,setLoop,stop:()=>setMode('analysis'),state:()=>({available:!!model,mode,index,stepId:step()?.id||null,step:step(),running,finished,loop,elapsed,duration:duration(step()),bubbleVisible:!card.hidden,cameraInsets:cameraInsets(),cameraBox:cameraBox?.slice()||null,steps:model?.steps.map(s=>({id:s.id,title:s.title,flowIds:s.flowIds,referenceComponentName:s.referenceComponentName,directionReferenceComponentName:s.directionReferenceComponentName}))||[],cameraMoving:board.isStudyCameraMoving?.()||false}),refresh:updateModel});
 updateModel();
})();
