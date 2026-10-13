(function(root,factory){
 'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.NexusComponentSearch88=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const clean=value=>String(value??'').trim().replace(/[µμ]/g,'u').replace(/,/g,'.');
 const upper=value=>String(value??'').trim().toUpperCase();
 const types={capacitor:{label:'Capacitor',field:'capacitancePf',placeholder:'Valor / ref.'},resistor:{label:'Resistor',field:'resistanceOhm',placeholder:'Valor / ref.'},inductor:{label:'Bobina',field:'inductanceNh',placeholder:'Valor / ref.'},ic:{label:'CI',placeholder:'Nome de fábrica'}};
 const units={
  capacitor:[{id:'pF',label:'pF',factor:1},{id:'nF',label:'nF',factor:1e3},{id:'uF',label:'µF',factor:1e6},{id:'mF',label:'mF',factor:1e9}],
  resistor:[{id:'mOhm',label:'mΩ',factor:1e-3},{id:'Ohm',label:'Ω',factor:1},{id:'kOhm',label:'kΩ',factor:1e3},{id:'MOhm',label:'MΩ',factor:1e6}],
  inductor:[{id:'nH',label:'nH',factor:1},{id:'uH',label:'µH',factor:1e3},{id:'mH',label:'mH',factor:1e6},{id:'H',label:'H',factor:1e9},{id:'Ohm',label:'Ω · ferrite',factor:1,field:'impedanceOhm'}]
 };
 const numberPattern='(\\d+(?:\\.\\d+)?|\\.\\d+)',patterns={
  capacitor:[new RegExp('^'+numberPattern+'\\s*([pnum])f?$','i'),new RegExp('^'+numberPattern+'\\s*([pnum])f?(?=$|[^a-z])','i')],
  inductor:[new RegExp('^'+numberPattern+'\\s*([num]?)h$','i'),new RegExp('^'+numberPattern+'\\s*([num]?)h(?=$|[^a-z])','i')],
  ferrite:[new RegExp('^'+numberPattern+'\\s*-?\\s*(?:Ω|ohms?)$','i'),new RegExp('^'+numberPattern+'\\s*-?\\s*(?:Ω|ohms?)(?=$|[^a-z])','i')],
  resistor:new RegExp('^'+numberPattern+'\\s*([kKmMrR]?)(?:Ω|ohms?)?$','i'),number:new RegExp('^'+numberPattern+'$')
 };
 function unitOf(type,value){
  const text=clean(value);if(!text)return null;
  return units[type]?.find(u=>u.id===text||clean(u.label)===text||((type!=='resistor'||!/^m/i.test(text))&&u.id.toLowerCase()===text.toLowerCase()))||null;
 }
 function quantity(text,type,source=false){
  let value=clean(text),m;
  if(type==='capacitor'&&(m=patterns.capacitor[Number(source)].exec(value)))return {literal:Number(m[1]),unit:({p:'pF',n:'nF',u:'uF',m:'mF'})[m[2].toLowerCase()]};
  if(type==='inductor'&&(m=patterns.inductor[Number(source)].exec(value)))return {literal:Number(m[1]),unit:({n:'nH',u:'uH',m:'mH','':'H'})[m[2].toLowerCase()]};
  if(type==='inductor'&&(m=patterns.ferrite[Number(source)].exec(value)))return {literal:Number(m[1]),unit:'Ohm'};
  if(type==='resistor'){
   if((m=patterns.resistor.exec(value)))return {literal:Number(m[1]),unit:({k:'kOhm',K:'kOhm',M:'MOhm',m:'mOhm',r:'Ohm',R:'Ohm','':'Ohm'})[m[2]],implicit:!m[2]&&!/[Ωa-z]/i.test(value)};
   if((m=/^(\d+)([rRkKMm])(\d+)$/.exec(value)))return {literal:Number(m[1]+'.'+m[3]),unit:({r:'Ohm',R:'Ohm',k:'kOhm',K:'kOhm',M:'MOhm',m:'mOhm'})[m[2]]};
  }
  if((m=patterns.number.exec(value)))return {literal:Number(m[1]),unit:null,implicit:true};
  return null;
 }
 function parseQuery(text,type='capacitor',packageText='',unitText='',referenceText=''){
  if(!types[type])return {error:'Escolha o tipo de componente.'};
  let value=clean(text),pkg=upper(packageText)||null,reference=upper(referenceText)||null,term=null,amount=null,literal=null,field=types[type].field,unit=unitOf(type,unitText);
  if(unitText&&!unit)return {error:'Unidade incompatível com o tipo de componente.'};
  if(type==='ic'){
   term=upper(value)||null;pkg=null;
   // Older saved searches put an exact reference in the only available field.
   if(!reference&&term&&/^U(?:\d|_)[A-Z\d_]*$/.test(term)){reference=term;term=null;}
  }else{
   value=value.replace(/\s+(\d{4,6})$/,(_,n)=>{pkg=pkg||n;return '';});
   const prefix=type==='capacitor'?'C':type==='resistor'?'R':'L';
   if(new RegExp('^'+prefix+'(?:\\d|_)[A-Z\\d_]*$','i').test(value)){reference=upper(value);value='';}
   // Keep the former package-only shortcut without swallowing numeric values.
   if(type==='capacitor'&&!pkg&&!unit&&/^(?:01005|0201|0402|0603|1206)$/.test(value)){pkg=value;value='';}
   if(value){
    const q=quantity(value,type);
    if(!q||!Number.isFinite(q.literal)||q.literal<0||(type!=='resistor'&&q.literal===0))return {error:'Informe um valor válido ou a referência do componente.'};
    const inline=q.implicit?null:unitOf(type,q.unit);
    if(inline&&unit&&inline.id!==unit.id)return {error:'A unidade escrita difere da unidade selecionada.'};
    unit=inline||unit;
    if(unit){field=unit.field||field;amount=q.literal*unit.factor;}else literal=q.literal;
   }
   if(unit)field=unit.field||field;
  }
  if(amount===null&&literal===null&&!pkg&&!reference&&!term&&!unit)return {error:'Preencha um valor, uma referência ou um filtro.'};
  return {type,amount,literal,field,pf:type==='capacitor'?amount:null,pkg,reference,term,unit:unit?.id||null};
 }
 const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<=Math.max(1e-9,Math.abs(b)*1e-9);
 function matchesRow(row,query){
  if(!row||query.error||row.type!==query.type||row.population==='not-fitted')return false;
  if(query.pkg&&upper(row.package)!==query.pkg&&upper(row.packageRaw)!==query.pkg)return false;
  if(query.reference&&upper(row.component)!==query.reference)return false;
  if(query.term&&![row.partNumber,...(row.partNumbers||[]),row.value].some(v=>upper(v).includes(query.term)))return false;
  if(query.amount!==null&&!near(row[query.field],query.amount))return false;
  if(query.literal!==null){
   const original=quantity(row.value,row.type,true);
   // Without a unit, 2.2 searches the literal 2.2 in every recorded scale.
   if(!original||!near(original.literal,query.literal))return false;
  }
  if(query.unit&&query.amount===null){
   const original=quantity(row.value,row.type,true);
   const milli= row.type==='resistor'&&query.unit==='mOhm'&&row.resistanceOhm>0&&row.resistanceOhm<1;
   if(!milli&&(!original||original.unit!==query.unit))return false;
  }
  return true;
 }
 function getOptions(rows,type){
  const entries=Array.isArray(rows)?rows:(rows?.components||[]),packages=new Set(),foundUnits=new Set();
  for(const r of entries){if(r.type!==type||r.population==='not-fitted')continue;
   if(type!=='ic'&&r.package)packages.add(upper(r.package));
   const q=quantity(r.value,type,true);if(q?.unit)foundUnits.add(q.unit);
   if(type==='resistor'&&r.resistanceOhm>0&&r.resistanceOhm<1)foundUnits.add('mOhm');
  }
  return {packages:[...packages].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:!(/^\d+$/.test(a)&&/^\d+$/.test(b))})),units:(units[type]||[]).filter(u=>foundUnits.has(u.id)).map(u=>({...u}))};
 }
 return Object.freeze({types,clean,parseQuery,matchesRow,getOptions,quantity});
});

(() => {
 'use strict';
 if(typeof window==='undefined'||typeof document==='undefined')return;
 const $=id=>document.getElementById(id),board=window.JCIDBoardView,menu=document.querySelector('#inspector .tool-menu');
 if(!board||!menu||window.JCIDCapacitors)return;
 const composed=()=>window.JCID_BOARD?.nexusComposition?.version===1,compositionMessage='Junção: indisponível';
 const base=new URL('.',document.currentScript.src),key='nexus-component-search-v2';
 let catalog=null,loading=null,loadError='',byBoard=new Map(),docs=new Map(),serial=0;
 const upper=value=>String(value||'').trim().toUpperCase(),isCap=name=>/^C(?:\d|_)/i.test(name||'');
 const selected=()=>!composed()&&!document.body.classList.contains('source-mode')&&!document.body.classList.contains('board-loading')?window.JCID_BOARD?.components.find(c=>c.id===board.getState().component):null;
 const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};

 const {types,clean,parseQuery:parseSearch,matchesRow,getOptions,quantity}=window.NexusComponentSearch88;
 let activeType='capacitor';
 const parseQuery=(text,type=activeType,packageText='',unitText='',referenceText='')=>parseSearch(text,type,packageText,unitText,referenceText);
 function formatValue(r){
  const n=r[types[r.type]?.field];
  const number=x=>Number(x.toPrecision(8)).toLocaleString('pt-BR',{maximumFractionDigits:8});
  if(Number.isFinite(n)){
   if(r.type==='capacitor')return n>=1e6?number(n/1e6)+' µF':n>=1e3?number(n/1e3)+' nF':number(n)+' pF';
   if(r.type==='resistor')return n>=1e6?number(n/1e6)+' MΩ':n>=1e3?number(n/1e3)+' kΩ':number(n)+' Ω';
   if(r.type==='inductor')return n>=1e6?number(n/1e6)+' mH':n>=1e3?number(n/1e3)+' µH':number(n)+' nH';
  }
  if(r.type==='inductor'&&Number.isFinite(r.impedanceOhm))return number(r.impedanceOhm)+' Ω';
  return r.type==='ic'?(r.partNumber||r.partNumbers?.[0]||''):'';
 }
 function load(){
  if(catalog)return Promise.resolve(catalog);if(loading)return loading;
  loadError='';loading=fetch(new URL('component-catalog.json',base)).then(r=>{if(!r.ok)throw Error('Catálogo indisponível');return r.json();}).then(data=>{
   if(data?.version!==2||!Array.isArray(data.documents)||!Array.isArray(data.components))throw Error('Catálogo inválido');
   docs=new Map(data.documents.map(d=>[d.id,d]));byBoard=new Map();
   data.components=data.components.filter(r=>docs.has(r.documentId)&&types[r.type]&&r.component&&Number.isInteger(r.page)&&Array.isArray(r.boardIds));
   for(const r of data.components)for(const id of r.boardIds){if(!byBoard.has(id))byBoard.set(id,new Map());const map=byBoard.get(id),name=upper(r.component);if(!map.has(name))map.set(name,[]);map.get(name).push(r);}
   catalog=data;refreshFilters();window.dispatchEvent(new CustomEvent('jcid:components-ready'));reflectSelection();return data;
  }).catch(error=>{loadError='Não foi possível abrir o catálogo. Toque em Buscar para tentar novamente.';throw error;}).finally(()=>{loading=null;});
  return loading;
 }
 function info(boardId,name){if(composed()&&boardId===window.JCID_ACTIVE_BOARD?.id)return [];const part=boardId===window.JCID_ACTIVE_BOARD?.id?window.JCID_BOARD?.components.find(c=>upper(c.name)===upper(name)):null;return byBoard.get(boardId)?.get(upper(part?.sourceComponentName??name))||[];}
 function attributes(r){return [formatValue(r),r.packageRaw||r.package,r.voltage].filter(Boolean).join(' · ')||'Valor não identificado';}
 function tooltip(target,part){
  if(composed()||!part)return;
  if(!catalog){if(!loadError)void load().catch(()=>{});return;}
  const rows=info(window.JCID_ACTIVE_BOARD?.id,part.name);if(!rows.length)return;
  const distinct=fn=>[...new Set(rows.map(fn).filter(Boolean))];
  const values=distinct(formatValue),packages=distinct(r=>r.packageRaw||r.package),voltages=distinct(r=>r.voltage);
  const value=[values.join(' / '),packages.join(' / '),voltages.join(' / ')].filter(Boolean).join(' · ');
  if(value)target.append(el('span','tooltip-capacitor',value));
 }
 const button=el('button','tool-tab','Buscar');button.id='componentSearchTool';button.type='button';button.setAttribute('aria-controls','componentSearchPane');button.setAttribute('aria-pressed','false');button.setAttribute('aria-expanded','false');menu.append(button);
 const pane=el('section','component-search-panel');pane.id='componentSearchPane';pane.hidden=true;pane.setAttribute('aria-label','Buscar componentes');
 pane.innerHTML='<form id="capacitorSearchForm" class="capacitor-search-form"><fieldset class="component-kind" aria-label="Tipo de componente"><div id="componentKinds"></div></fieldset><div class="capacitor-query-row"><input id="capacitorQuery" maxlength="100" aria-label="Valor ou referência" autocomplete="off" autocapitalize="off" spellcheck="false"><select id="componentUnit" aria-label="Unidade" title="Unidade; vazio busca o mesmo valor em todas as escalas"></select><select id="componentPackage" aria-label="Encapsulamento" title="Encapsulamento encontrado nos esquemáticos"></select><input id="componentReference" maxlength="60" aria-label="Referência do CI" placeholder="Ref.: U1000" autocomplete="off" autocapitalize="characters" spellcheck="false" hidden><button type="submit" id="capacitorSearchSubmit">Buscar</button></div><div class="capacitor-selection-row"><button type="button" id="capacitorUseSelected" disabled>Usar selecionado</button><p id="capacitorSelectedInfo"></p></div></form><div id="capacitorSearchStatus" class="capacitor-search-status" role="status" aria-live="polite">Busque um valor ou uma referência nos esquemáticos disponíveis.</div><div id="capacitorResults" class="capacitor-results"></div><div class="capacitor-search-foot">Dados do esquemático. Confira a especificação antes da substituição.</div>';
 $('inspector').append(pane);
 for(const [type,meta] of Object.entries(types)){const label=el('label','component-kind-choice'),radio=el('input');radio.type='radio';radio.name='componentType';radio.value=type;radio.addEventListener('change',()=>setType(type,true));label.append(radio,el('span',null,meta.label));$('componentKinds').append(label);}
 const save=()=>{try{localStorage.setItem(key,JSON.stringify({type:activeType,query:$('capacitorQuery').value.slice(0,100),package:$('componentPackage').value.slice(0,60),unit:$('componentUnit').value,reference:$('componentReference').value.slice(0,60)}));}catch{}};
 function fillSelect(node,options,empty,wanted){
  const first=el('option',null,empty);first.value='';const choices=[first];
  for(const entry of options){const option=el('option',null,entry.label||entry);option.value=entry.id||entry;choices.push(option);}
  // Saved filters remain available while the asynchronous catalog is loading.
  if(wanted&&!catalog&&!choices.some(o=>o.value===wanted)){const option=el('option',null,wanted);option.value=wanted;choices.push(option);}
  node.replaceChildren(...choices);node.value=choices.some(o=>o.value===wanted)?wanted:'';
 }
 function refreshFilters(wanted={unit:$('componentUnit').value,package:$('componentPackage').value}){
  const options=getOptions(catalog,activeType),ic=activeType==='ic';let pkg=upper(wanted.package);
  if(catalog&&pkg&&!options.packages.includes(pkg)){const row=catalog.components.find(r=>r.type===activeType&&upper(r.packageRaw)===pkg);if(row?.package)pkg=upper(row.package);}
  fillSelect($('componentUnit'),options.units,'Unid.',wanted.unit||'');fillSelect($('componentPackage'),options.packages,'Encaps.',pkg);
  $('componentUnit').hidden=ic;$('componentPackage').hidden=ic;$('componentReference').hidden=!ic;
  $('componentPackage').disabled=!catalog;$('componentUnit').disabled=!catalog;
 }
 function setType(type,reset=false){
  const previous=activeType;activeType=types[type]?type:'capacitor';
  for(const input of $('componentKinds').querySelectorAll('input'))input.checked=input.value===activeType;
  $('capacitorQuery').placeholder=types[activeType].placeholder;
  $('capacitorQuery').setAttribute('aria-label',activeType==='ic'?'Nome de fábrica do CI, completo ou parcial':'Valor ou referência');
  $('capacitorQuery').title=activeType==='ic'?'Nome de fábrica ou parte dele':'Ex.: 2,2 ou 2.2; sem unidade, busca esse valor em todas as escalas';
  refreshFilters(reset||previous!==activeType?{unit:'',package:''}:undefined);
  if(reset){serial++;$('capacitorQuery').value='';$('componentReference').value='';$('capacitorResults').replaceChildren();$('capacitorSearchStatus').textContent='Busque um valor ou uma referência nos esquemáticos disponíveis.';save();}
 }
 try{const saved=JSON.parse(localStorage.getItem(key)||localStorage.getItem('nexus-capacitor-search-v1'))||{};setType(saved.type);$('capacitorQuery').value=String(saved.query||'').slice(0,100);$('componentReference').value=String(saved.reference||'').slice(0,60);refreshFilters({unit:String(saved.unit||''),package:String(saved.package||'').slice(0,60)});}catch{setType('capacitor');}
 function reflectSelection(){
  button.disabled=composed();button.title=composed()?compositionMessage:'Buscar componentes';
  if(composed()){serial++;close();$('capacitorUseSelected').disabled=true;$('capacitorSelectedInfo').textContent='';$('capacitorResults').replaceChildren();$('capacitorSearchStatus').textContent=compositionMessage;return;}
  if($('capacitorSearchStatus').textContent===compositionMessage)$('capacitorSearchStatus').textContent='Busque um valor ou uma referência nos esquemáticos disponíveis.';
  const part=selected(),rows=part?info(window.JCID_ACTIVE_BOARD?.id,part.name):[],signatures=new Set(rows.map(r=>r.type+'|'+formatValue(r)+'|'+r.package));
  $('capacitorUseSelected').disabled=!part||!rows.length||signatures.size!==1;
  $('capacitorSelectedInfo').textContent=part?part.name+(rows.length?' · '+attributes(rows[0]):catalog?' · sem especificação':''):'';
  $('capacitorSelectedInfo').title=$('capacitorSelectedInfo').textContent;
  if(part&&!catalog&&!loadError)void load().catch(()=>{});
 }
 function available(row,modelId){
  const model=window.JCID_DEVICES?.models?.find(m=>m.id===modelId),item=model?.children?.find(i=>row.boardIds.includes(i.id)&&i.interactive_map_ready);
  return item?{model,item}:null;
 }
 async function locate(row,modelId,schematic){
  if(composed())return false;
  const choice=available(row,modelId);if(!choice){$('capacitorSearchStatus').textContent='Importe o pacote desta placa em Arquivos para localizá-la no mapa.';return;}
  const token=++serial;$('capacitorSearchStatus').textContent='Abrindo '+row.component+'…';
  try{
   await window.JCIDDesktop.openItem(choice.model.id,choice.item.id);await window.JCIDDesktop.whenReady();if(token!==serial||composed())return;
   if(window.JCID_ACTIVE_BOARD?.id!==choice.item.id||!board.selectComponent(row.component))throw Error('Não foi possível selecionar este componente. Confira o limite de abas e a exibição dos componentes.');
   $('capacitorSearchStatus').textContent=choice.model.label+' · '+row.component+' · '+attributes(row);
   if(schematic){window.JCIDSchematic.openAt(row.documentId,modelId,row.component,row.page);}else if(matchMedia('(max-width:900px)').matches)board.closePanels();
  }catch(error){if(token===serial)$('capacitorSearchStatus').textContent=error.message||'Não foi possível abrir esta placa.';}
 }
 function resultRow(row,modelId){
  const item=el('div','capacitor-result'),top=el('div','capacitor-result-main'),name=el('button','capacitor-part',row.component);name.type='button';item.dataset.component=row.component;
  const choice=available(row,modelId);name.disabled=!choice;name.title=choice?'Localizar '+row.component+' na placa':'Importe o pacote desta placa para abrir o mapa';name.addEventListener('click',()=>locate(row,modelId,false));
  const spec=el('span','capacitor-spec',attributes(row));spec.title=attributes(row)+(row.multipleSpecifications?' · Especificação alternativa no documento':'');top.append(name,spec);
  const source=el('button','capacitor-source','Pág. '+row.page);source.type='button';source.title='Abrir '+row.component+' na página '+row.page;source.setAttribute('aria-label',source.title);source.disabled=!choice||!window.JCID_SCHEMATICS?.documents?.some(d=>d.id===row.documentId);source.addEventListener('click',()=>locate(row,modelId,true));
  item.append(top,source);return item;
 }
 function render(rows){
  const groups=new Map(),activeModel=window.JCID_ACTIVE_BOARD?.modelId;
  for(const row of rows){const doc=docs.get(row.documentId);for(let i=0;i<doc.modelIds.length;i++){
   const modelId=doc.modelIds[i],id=modelId+'|'+doc.id;if(!groups.has(id))groups.set(id,{modelId,label:doc.modelLabels?.[i]||modelId,doc,rows:new Map()});
   const group=groups.get(id),key=row.component+'|'+row.type+'|'+formatValue(row)+'|'+row.package+'|'+(row.voltage||'');if(!group.rows.has(key))group.rows.set(key,row);
  }}
  const generation=id=>/^iphone-(\d+)/.exec(id)?.[1]*1||(/^iphone-x/.test(id)?10:0);
  const ordered=[...groups.values()].sort((a,b)=>Number(a.modelId===activeModel)-Number(b.modelId===activeModel)||generation(b.modelId)-generation(a.modelId)||b.label.localeCompare(a.label,'pt-BR',{numeric:true})||a.doc.title.localeCompare(b.doc.title));
  const fragment=document.createDocumentFragment();let initial=true;
  for(const group of ordered){
   const section=el('details','capacitor-model');section.dataset.model=group.modelId;section.dataset.document=group.doc.id;section.open=initial;initial=false;
   const summary=el('summary'),label=el('strong',null,group.label+(group.modelId===activeModel?' · atual':'')),count=el('span',null,String(group.rows.size));summary.append(label,count);section.append(summary);
   if(group.doc.variant||ordered.filter(g=>g.modelId===group.modelId).length>1)section.append(el('div','capacitor-variant',group.doc.label||group.doc.title));
   const list=el('div','capacitor-model-list'),entries=[...group.rows.values()].sort((a,b)=>a.component.localeCompare(b.component,'pt-BR',{numeric:true}));let shown=0;
   const more=el('button','capacitor-more','Mostrar mais');more.type='button';
   function add(){const stop=Math.min(shown+60,entries.length);for(;shown<stop;shown++)list.append(resultRow(entries[shown],group.modelId));more.hidden=shown===entries.length;}
   // Create only the rows being inspected; large result sets keep scrolling light.
   section.addEventListener('toggle',()=>{if(section.open&&!shown)add();});if(section.open)add();more.addEventListener('click',add);section.append(list,more);fragment.append(section);
  }
  $('capacitorResults').replaceChildren(fragment);
  const modelCount=new Set(ordered.map(g=>g.modelId)).size;
  $('capacitorSearchStatus').textContent=modelCount?modelCount+' placa'+(modelCount===1?'':'s')+' com o valor procurado.':'Nenhum componente com esses dados foi identificado nos esquemáticos disponíveis.';
 }
 async function search(){
  if(composed()){reflectSelection();return false;}
  const token=++serial;save();const parsed=parseQuery($('capacitorQuery').value,activeType,$('componentPackage').value,$('componentUnit').value,$('componentReference').value);if(parsed.error){$('capacitorSearchStatus').textContent=parsed.error;$('capacitorResults').replaceChildren();return;}
  $('capacitorSearchStatus').textContent='Consultando os esquemáticos…';
  try{await load();if(token!==serial||composed())return;render(catalog.components.filter(r=>matchesRow(r,parsed)));}
  catch{if(token===serial)$('capacitorSearchStatus').textContent=loadError;}
 }
 function open(){if(composed()){reflectSelection();return false;}board.openTools();pane.hidden=false;button.setAttribute('aria-pressed','true');button.setAttribute('aria-expanded','true');window.dispatchEvent(new CustomEvent('jcid:tool',{detail:'components'}));reflectSelection();if(($('capacitorQuery').value.trim()||$('componentPackage').value||$('componentUnit').value||$('componentReference').value.trim())&&!$('capacitorResults').children.length)void search();else void load().catch(()=>{$('capacitorSearchStatus').textContent=loadError;});}
 function close(){pane.hidden=true;button.setAttribute('aria-pressed','false');button.setAttribute('aria-expanded','false');}
 button.addEventListener('click',()=>pane.hidden?open():close());$('capacitorSearchForm').addEventListener('submit',e=>{e.preventDefault();void search();});
 for(const id of ['capacitorQuery','componentReference'])$(id).addEventListener('input',save);
 for(const id of ['componentPackage','componentUnit'])$(id).addEventListener('change',save);
 $('capacitorUseSelected').addEventListener('click',()=>{const part=selected(),r=part&&info(window.JCID_ACTIVE_BOARD?.id,part.name)[0];if(r){setType(r.type);const q=quantity(r.value,r.type,true);$('componentReference').value='';if(r.type==='ic'){$('capacitorQuery').value=formatValue(r)||'';$('componentReference').value=$('capacitorQuery').value?'':r.component;}else{$('capacitorQuery').value=q?String(q.literal).replace('.',','):formatValue(r)||r.component;refreshFilters({unit:q?.unit||'',package:r.package||r.packageRaw||''});}void search();}});
 for(const type of ['jcid:selection','jcid:boardchange','jcid:document','jcid:boardloadstate'])window.addEventListener(type,reflectSelection);
 window.addEventListener('jcid:tool',e=>{if(e.detail!=='components')close();});
 window.JCIDComponents=window.JCIDCapacitors=Object.freeze({open,close,load,info,tooltip,parseQuery,formatValue,matchesRow,getOptions,getCatalog:()=>catalog});
 reflectSelection();
})();
