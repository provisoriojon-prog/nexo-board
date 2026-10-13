/* Source-backed topics. Selecting a topic is manual; it never advances a tour. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),host=$('studyAnalysis83'),pane=$('functionStudiesPane'),base=window.NexusFunctionStudies77,flow=window.NexusStudyFlow77,board=window.JCIDBoardView;
 if(!host||!base||!flow||!board||!window.NexusChargingResearch86||$('studyResearch86'))return;
 const section=document.createElement('details');section.id='studyResearch86';section.className='study-research86';
 section.innerHTML=`<summary>Comunicação da carga</summary>
  <select id="researchTopic86" aria-label="Assunto da comunicação de carga"></select>
  <div class="research86-content" hidden>
   <div class="research86-actions"><button type="button" data-research-action="show">Ver no mapa</button><button type="button" data-research-action="locate">Enquadrar</button><button type="button" data-research-action="clear">Visão geral</button></div>
   <details class="research86-explanation"><summary>Funcionamento</summary><p class="research86-summary"></p><div class="research86-mechanism"></div></details>
   <details class="research86-connection-details"><summary>Conexões</summary><div class="research86-connections"></div></details>
  </div>`;
 host.append(section);
 let catalog={topics:[]},model=null,modelBoard=null,currentId='',activeId='',applying=false;
 const topic=()=>catalog.topics.find(t=>t.id===currentId)||null;
 const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
 const reference=t=>base.getStudy()?.componentProfiles.find(c=>[c.name,c.sourceName].includes(t.referenceComponentName));
 function sync(){
  if(applying)return;
  const s=flow.state(),active=activeId&&s.storyStepId==='research86:'+activeId;
  if(activeId&&!active){activeId='';currentId='';$('researchTopic86').value='';section.querySelector('.research86-content').hidden=true;}
  section.classList.toggle('is-active',!!active);
  section.querySelector('[data-research-action="show"]').hidden=!!active;
  section.querySelector('[data-research-action="clear"]').hidden=!active;
  // The main playback control remains available for a topic. It reflects the
  // renderer's actual directed routes, without duplicating a second control.
  for(const id of ['functionStudySummary','functionStudyLegend'])$(id).classList.toggle('research86-hidden',!!active);
 }
 function render(){
  const t=topic(),content=section.querySelector('.research86-content');content.hidden=!t;if(!t){sync();return;}
  section.querySelector('.research86-summary').textContent=t.summary;
  const mechanism=section.querySelector('.research86-mechanism');mechanism.replaceChildren();for(const text of t.mechanism||[])mechanism.append(node('p',text));for(const item of t.protocol||[]){const p=node('p','');p.append(node('strong',item.title+' · '),document.createTextNode(item.text));mechanism.append(p);}
  const connections=section.querySelector('.research86-connections');connections.replaceChildren();
  const flows=base.getStudy()?.flows||[];
  for(const id of t.flowIds){const f=flows.find(f=>f.id===id);if(!f)continue;const row=node('div','');row.className='research86-connection';row.append(node('strong',f.netName));const ends=node('div','');
   for(const end of [f.from,f.to]){const button=node('button',end.componentName+' · '+end.pad);button.type='button';button.dataset.researchPad=String(end.pinId);button.title='Localizar este pad mantendo o assunto';ends.append(button);}row.append(ends);connections.append(row);}
  sync();
 }
 function refresh(){
  const study=base.getStudy();
  if(study!==model){
   const previous=flow.state(),keepId=modelBoard===window.JCID_BOARD?currentId:'',owned=activeId&&previous.storyStepId==='research86:'+activeId;
   model=study;modelBoard=window.JCID_BOARD;catalog=window.NexusChargingResearch86.getTopics(study);currentId=catalog.topics.some(t=>t.id===keepId&&t.available)?keepId:'';activeId='';
   const select=$('researchTopic86');select.replaceChildren();const placeholder=node('option','Escolha um assunto…');placeholder.value='';select.append(placeholder);for(const t of catalog.topics){const option=node('option',t.title);option.value=t.id;option.disabled=t.available===false;select.append(option);}select.value=currentId;
   if(owned){applying=true;try{const t=topic(),ref=t&&reference(t);if(t&&ref&&!pane.hidden){flow.setStoryStep({id:'research86:'+t.id,flowIds:t.flowIds,focusComponentId:ref.id,referenceComponentId:ref.id});flow.setPlaying(previous.playing);activeId=t.id;}else if(study){if(flow.clearStoryStep)flow.clearStoryStep();else flow.focusComponent(null);}else flow.clear();}finally{applying=false;}}
   section.hidden=!catalog.topics.length;render();
  }
  sync();
 }
 function show(id=currentId){
  refresh();const t=catalog.topics.find(t=>t.id===id),ref=t&&reference(t);if(!t||!ref||t.available===false||pane.hidden)return false;
  applying=true;
  try{
   if(window.NexusStudyStory83?.state().mode==='story')window.NexusStudyStory83.setMode('analysis');
   currentId=id;$('researchTopic86').value=id;section.open=true;board.clearSelection();
   flow.setStoryStep({id:'research86:'+id,flowIds:t.flowIds,focusComponentId:ref.id,referenceComponentId:ref.id});flow.setPlaying(true);activeId=id;
  }finally{applying=false;}
  render();return true;
 }
 function clear(){activeId='';currentId='';$('researchTopic86').value='';flow.focusComponent(null);render();}
 async function locate(pinId=null){
  if(!activeId&&!show())return false;
  const data=window.JCID_BOARD,t=topic(),ids=new Set(t.flowIds),routes=base.getStudy().flows.filter(f=>ids.has(f.id)),pins=pinId===null?routes.flatMap(f=>[f.from.pinId,f.to.pinId]):[pinId],boxes=pins.map(id=>data.pins.find(p=>p.id===id)?.bbox).filter(b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite));
  if(!boxes.length)return false;if(pinId!==null)flow.focusEndpoint(pinId);
  if(matchMedia('(max-width:900px),(pointer:coarse)').matches){board.closePanels();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}
  const bounds=[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))],padding=Math.max(pinId===null?1000:650,Math.max(bounds[2]-bounds[0],bounds[3]-bounds[1])*.12);
  return board.focusBounds([bounds[0]-padding,bounds[1]-padding,bounds[2]+padding,bounds[3]+padding]);
 }
 $('researchTopic86').addEventListener('change',()=>{currentId=$('researchTopic86').value;if(currentId)show();else{clear();render();}});
 section.addEventListener('click',e=>{const pad=e.target.closest('[data-research-pad]');if(pad){locate(Number(pad.dataset.researchPad));return;}const action=e.target.closest('[data-research-action]')?.dataset.researchAction;if(action==='show')show();else if(action==='locate')locate();else if(action==='clear')clear();});
 window.addEventListener('nexus:study-flow',sync);
 for(const event of ['jcid:document','jcid:boardchange','jcid:boardloadstate','jcid:netnames-changed','nexus:session-ready'])window.addEventListener(event,refresh);
 new MutationObserver(()=>{if(pane.hidden){activeId='';currentId='';$('researchTopic86').value='';section.querySelector('.research86-content').hidden=true;sync();}else refresh();}).observe(pane,{attributes:true,attributeFilter:['hidden']});
 window.NexusStudyResearch86=Object.freeze({show,clear,refresh,locate,state:()=>({currentId,activeId,topics:catalog.topics})});
 refresh();
})();
