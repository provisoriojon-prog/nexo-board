// Pure destination planning for a single .sbnx board. File payloads are unchanged.
export const INDIVIDUAL_ICONS=Object.freeze(['board','chip','camera','connector','speaker','image','schematic','document']);
const allowedIcons=new Set(INDIVIDUAL_ICONS);
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,180}$/.test(value);
const clone=value=>structuredClone(value);
const cleanLabel=value=>{
 if(typeof value!=='string')throw Error('Digite um nome para o arquivo.');
 const label=value.normalize('NFKC').trim().replace(/\s+/gu,' ');
 if(!label||label.length>180||/[\u0000-\u001f\u007f]/u.test(label))throw Error('Use um nome de 1 a 180 caracteres, sem caracteres de controle.');
 return label;
};
export const normalizeItemName=value=>cleanLabel(value).toLocaleLowerCase('pt-BR');
const groupOf=item=>typeof item?.group==='string'?item.group:'';
function modelsOf(catalog){const models=Array.isArray(catalog)?catalog:catalog?.models;if(!Array.isArray(models))throw Error('A biblioteca de destino não está disponível.');return models;}
function hash(value){let h=14695981039346656037n;for(const point of new TextEncoder().encode(value)){h^=BigInt(point);h=BigInt.asUintN(64,h*1099511628211n);}return h.toString(16).padStart(16,'0');}
function newItemId(modelId,group,name,used){
 const base='sbnx-'+modelId.slice(0,100)+'-'+hash(modelId+'\0'+group+'\0'+name);let id=base,n=1;
 while(used.has(id))id=base+'-'+(++n);
 return id;
}
export function inferIndividualIcon(item){
 if(allowedIcons.has(item?.icon))return item.icon;
 const id=item?.id||'';
 return /camera/.test(id)?'camera':/receiver/.test(id)?'speaker':/dock/.test(id)?'connector':/wifi_chip|dot_projector/.test(id)?'chip':item?.viewer==='schematic'||/schematic|diagnostic/.test(id)?'schematic':item?.viewer==='image'||item?.kind==='board_image'||/image/.test(id)?'image':item?.interactive_map_ready||/motherboard/.test(id)?'board':'document';
}
export function describeIndividual(manifest){
 const models=manifest?.catalog?.models;
 if(!Array.isArray(models))throw Error('O arquivo individual não contém uma placa válida.');
 const boards=models.flatMap(model=>(model.children||[]).filter(item=>item.interactive_map_ready===true).map(item=>({model,item})));
 if(boards.length!==1||!boards[0].item.board_data)throw Error('Um arquivo .sbnx deve conter exatamente uma placa interativa. Use ZIP para importar a biblioteca completa.');
 const {model,item}=boards[0];
 if(!validId(model.id)||!validId(item.id))throw Error('A identificação da placa individual é inválida.');
 return {model:clone(model),item:clone(item)};
}
export function individualFolders(catalog){
 return modelsOf(catalog).flatMap(model=>{
  if(!validId(model.id)||!Array.isArray(model.children))return [];
  const folders=[{modelId:model.id,modelLabel:model.label,group:'',groupLabel:'',label:model.label}],seen=new Set();
  for(const item of model.children){const group=groupOf(item);if(!group||seen.has(group))continue;seen.add(group);const groupLabel=item.groupLabel||group;folders.push({modelId:model.id,modelLabel:model.label,group,groupLabel,label:model.label+' / '+groupLabel});}
  return folders;
 });
}
export function planIndividual(manifest,catalog,options={}){
 const source=describeIndividual(manifest),models=modelsOf(catalog),model=models.find(m=>m.id===options.modelId);
 if(!model||!validId(model.id)||!Array.isArray(model.children))throw Error('Escolha uma pasta existente na biblioteca.');
 const group=options.group??'';
 if(typeof group!=='string')throw Error('Escolha uma subpasta existente.');
 const groupItem=group?model.children.find(item=>groupOf(item)===group):null;
 if(group&&!groupItem)throw Error('Esta subpasta não existe na biblioteca.');
 const label=cleanLabel(options.label??source.item.label),nameKey=normalizeItemName(label),icon=options.icon??inferIndividualIcon(source.item);
 if(!allowedIcons.has(icon))throw Error('Escolha um dos ícones disponíveis.');
 const matches=model.children.filter(item=>(item.nexus_root||groupOf(item)===group)&&normalizeItemName(item.label)===nameKey);
 if(matches.length>1)throw Error('Esta pasta já contém nomes repetidos. Corrija a duplicação antes de substituir o arquivo.');
 const existing=matches[0],used=new Set(models.flatMap(m=>(m.children||[]).map(item=>item.id)));
 if(existing&&!validId(existing.id))throw Error('O arquivo de destino tem uma identificação inválida.');
 const itemId=existing?.id||newItemId(model.id,group,nameKey,used);
 return {mode:existing?'replace':'create',modelId:model.id,modelLabel:model.label,group,groupLabel:groupItem?.groupLabel||group,label,icon,itemId,existingId:existing?.id||null,existingLabel:existing?.label||null,existingInteractive:existing?.interactive_map_ready===true,sourceModelId:source.model.id,sourceItemId:source.item.id};
}
export function placeIndividual(manifest,catalog,options={}){
 const placement=planIndividual(manifest,catalog,options);
 if(placement.mode==='replace'&&options.replace!==true)throw Error('Já existe um arquivo com esse nome. Confirme a substituição ou escolha outro nome.');
 const source=describeIndividual(manifest),target=modelsOf(catalog).find(m=>m.id===placement.modelId),out=clone(manifest),files=new Map(out.files.map(f=>[f.path,f])),docIds=new Map(),documents=new Map();
 for(const original of out.schematics.documents){
  const pdf=files.get(original.pdf),index=files.get(original.index);
  if(!pdf||!index)throw Error('Falta um arquivo associado ao esquemático.');
  // Hash-backed IDs survive export/import cycles and never overwrite a sibling's PDF.
  const id='sbnx-doc-'+hash([placement.itemId,pdf.sha256,index.sha256,original.type||'schematic',original.variant||''].join('\0'));
  docIds.set(original.id,id);
  const connected=(original.board_ids||[]).includes(source.item.id);
  const document={...original,id,modelIds:[placement.modelId],modelLabels:[placement.modelLabel],board_ids:connected?[placement.itemId]:[],board_scoped:true,scope_board_id:placement.itemId};
  delete document.nexus_package;
  if(documents.has(id)&&connected)documents.get(id).board_ids=[placement.itemId];else if(!documents.has(id))documents.set(id,document);
 }
 const item=clone(source.item);item.id=placement.itemId;item.label=placement.label;item.icon=placement.icon;item.nexus_root=true;
 delete item.nexus_package;delete item.group;delete item.groupLabel;
 if(placement.group){item.group=placement.group;item.groupLabel=placement.groupLabel;}
 for(const key of ['schematic_id','reference_id'])if(item[key]){const next=docIds.get(item[key]);if(!next)throw Error('Falta um documento associado à placa.');item[key]=next;}
 if(item.preview?.startsWith('esquema.html?')){
  const u=new URL(item.preview,'https://nexus.invalid/'),id=docIds.get(u.searchParams.get('schematic'));
  if(!id)throw Error('Falta um documento auxiliar.');
  item.preview='esquema.html?'+new URLSearchParams({schematic:id,model:placement.modelId,embedded:'1'});
 }
 const model={id:target.id,label:target.label,label_qualifier:target.label_qualifier||'',nexus_order:Number.isFinite(target.nexus_order)?target.nexus_order:1000,children:[item]};
 out.id='individual-'+hash(placement.itemId);out.packageType='board';out.label=placement.modelLabel+' · '+placement.label;
 out.catalog={version:out.catalog.version||1,models:[model]};out.schematics={version:out.schematics.version||1,documents:[...documents.values()]};
 return {manifest:out,placement};
}
