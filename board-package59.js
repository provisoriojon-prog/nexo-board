import {ZipWriter,BlobReader,BlobWriter,configure} from './vendor/zipjs/index-native.min.js';
import {getFile} from './nexus-db.js';
import {mimeFor,validateManifest} from './nexus-manifest.js';
configure({useWebWorkers:false,useCompressionStream:true,chunkSize:65536});
const hash=async blob=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
const json=value=>new Blob([JSON.stringify(value)],{type:'application/json'});
const stop=signal=>{if(signal?.aborted)throw new DOMException('Operação cancelada.','AbortError');};
async function read(url,signal){
 stop(signal);const absolute=new URL(url,location.href),base=new URL('.',location.href);
 if(absolute.origin!==base.origin||!absolute.pathname.startsWith(base.pathname))throw Error('Um arquivo da placa está fora da biblioteca.');
 const relative=decodeURIComponent(absolute.pathname.slice(base.pathname.length)),match=/^__nexus_data__\/([^/]+)\/(.+)$/.exec(relative);
 if(match){const file=await getFile(match[1],match[2]);if(!file?.blob)throw Error('Arquivo não encontrado no pacote: '+match[2]);return file.blob;}
 const response=await fetch(absolute,{signal});if(!response.ok)throw Error('Não foi possível incluir: '+relative);
 if(response.headers.get('content-type')?.includes('text/html'))throw Error('O arquivo não está disponível: '+relative);
 return response.blob();
}
function personal(boardId,data,readings=window.JCID_READINGS,view=window.JCIDBoardView.snapshot()){
 const scope=boardId+(data.nexusRevision?'@'+data.nexusRevision:'');
 const values={},handle=window.JCIDICValues?.forBoard(boardId,data,readings);
 for(const pin of data.pins){const value=handle?.get(pin.id);if(value)values[pin.id]={diode:value.diode.value,smb:value.smb.value};}
 const notes={...(data.nexusPersonal?.rffe?.notes||{})};let marks=data.nexusPersonal?.rffe?.marks||[];
 for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i),prefix='jcid-rffe-notes-v1:'+scope+':';if(key.startsWith(prefix)){try{notes[key.slice(prefix.length)]=JSON.parse(localStorage.getItem(key));}catch{}}}
 try{marks=JSON.parse(localStorage.getItem('jcid-rffe-marks-v1:'+scope)||'null')||marks;}catch{}
 return {version:1,values,rffe:{notes,marks},view};
}
export function captureBoard(){
 const doc=window.JCIDDesktop?.currentDocument(),active=window.JCID_ACTIVE_BOARD;
 if(!doc?.interactiveMapReady||doc.sourceMode||document.body.classList.contains('board-loading'))throw Error('Abra a placa que deseja guardar.');
 const model=window.JCID_DEVICES.models.find(m=>m.id===active.modelId),item=model?.children.find(i=>i.id===active.id);
 if(!item)throw Error('A placa não foi encontrada na biblioteca.');
 const data=window.JCID_BOARD,readings=window.JCID_READINGS||{label:'Diodo',pins:{}},nc=window.JCID_NC_DISPLAY||{},view=window.JCIDBoardView.snapshot(),rffe=data.rffeCatalog||window.JCID_RFFE_CATALOG?.boards?.[active.id]||{};
 const documents=data.nexusComposition?[]:window.NexusDocumentScope.forBoard(window.JCID_SCHEMATICS?.documents||[],model.id,active.id);
 return {doc:structuredClone(doc),active:structuredClone(active),model:structuredClone(model),item:structuredClone(item),data,readings,nc,view,rffe,documents:structuredClone(documents)};
}
export function boardDataFromSnapshot(source){const data=structuredClone(source.data);data.readings=structuredClone(source.readings);data.ncDisplay=structuredClone(source.nc);data.nexusPersonal=personal(source.active.id,source.data,source.readings,source.view);if(data.nexusComposition){delete data.rffeCatalog;data.nexusPersonal.rffe={notes:{},marks:[]};}else data.rffeCatalog=structuredClone(source.rffe||{});return data;}
export async function exportBoard({signal,onProgress=()=>{},snapshot,identity}={}){
 const source=snapshot||captureBoard(),model=source.model,item={...source.item,...identity},boardId=source.active.id,data=boardDataFromSnapshot(source);
 data.nexusRevision=crypto.randomUUID();
 const files=new Map(),resources=new Map();let step=0;
 async function add(blob,path){stop(signal);const sha256=await hash(blob),type=mimeFor(path);if(!type)throw Error('Formato não suportado: '+path);const previous=files.get(path);if(previous&&previous.sha256!==sha256)throw Error('Dois arquivos diferentes usam o mesmo caminho.');files.set(path,{path,size:blob.size,sha256,type,blob});return path;}
 async function resource(url){
  stop(signal);const absolute=new URL(url,location.href).href;if(resources.has(absolute))return resources.get(absolute);
  onProgress({label:'Incluindo '+decodeURIComponent(new URL(absolute).pathname.split('/').pop()),step:++step});
  const blob=await read(absolute,signal),ext=new URL(absolute).pathname.split('.').pop().toLowerCase();
  if(!mimeFor('x.'+ext))throw Error('Formato não suportado no arquivo '+url);
  const path='assets/'+await hash(blob)+'.'+ext;await add(blob,path);resources.set(absolute,path);return path;
 }
 const image=!data.nexusComposition&&(data.imageSource||(boardId==='iphone-11-motherboard'?'fontes-previas/iphone11-placa-principal.jpg':null));
 if(image){const url=window.NexusLibrary?.localResource(item,image)||(!item.nexus_package?image:null);if(!url)throw Error('Os desenhos da placa estão ausentes. Importe o pacote completo antes de exportar.');data.imageSource=await resource(url);}
 for(const part of data.nexusComposition?.parts||[]){if(!part.imageSource)continue;const url=/^https?:\/\//i.test(part.imageSource)?part.imageSource:window.NexusLibrary.localResource(item,part.imageSource);if(!url)throw Error('Faltam os desenhos de '+part.label+'.');part.imageSource=await resource(url);}
 const documents=[],sourceDocs=source.documents||[];
 let pinManifest=null;try{pinManifest=await (await read('schematics-pins/manifest.json',signal)).text();pinManifest=JSON.parse(pinManifest);}catch(error){if(error.name==='AbortError')throw error;}
 for(const original of sourceDocs){
  const d=structuredClone(original);delete d.nexus_package;d.pdf=await resource(original.pdf);d.index=await resource(original.index);
  const index=JSON.parse(await files.get(d.index).blob.text());d.pdf_sha256=index.pdf_sha256;
  let pins=original.pin_index;const entry=pinManifest?.documents?.[index.pdf_sha256];if(!pins&&entry?.file)pins='schematics-pins/'+entry.file;
  if(pins)d.pin_index=await resource(pins);documents.push(d);
 }
 const children=[];
 async function catalogItem(original){
  const result=structuredClone(original);delete result.nexus_package;delete result.board_data;
  for(const field of ['preview','original'])if(result[field]&&!result[field].startsWith('esquema.html?'))result[field]=await resource(result[field]);
  return result;
 }
 const cleanItem=structuredClone(item);if(data.nexusComposition)for(const key of ['preview','original','schematic_id','reference_id'])delete cleanItem[key];const edited=await catalogItem(cleanItem);edited.board_data='boards/'+boardId+'.json';edited.interactive_map_ready=true;children.push(edited);
 const documentIds=new Set(documents.map(d=>d.id));
 for(const child of data.nexusComposition?[]:model.children){if(child.id===boardId||child.interactive_map_ready||!child.preview&&!child.original)continue;
  if(child.schematic_id&&!documentIds.has(child.schematic_id)||child.reference_id&&!documentIds.has(child.reference_id))continue;
  children.push(await catalogItem(child));
 }
 await add(json(data),edited.board_data);
 const cleanModel={...structuredClone(model),children};delete cleanModel.nexus_package;
 const entries=[...files.values()],raw={format:'nexus-mobile',version:1,packageType:'board',id:'edited-'+boardId,label:model.label+' · '+item.label+' · editada',createdAt:new Date().toISOString(),bytes:entries.reduce((sum,f)=>sum+f.size,0),files:entries.map(({blob,...file})=>file),catalog:{version:1,models:[cleanModel]},schematics:{version:1,documents}};
 const manifest=validateManifest(raw),writer=new ZipWriter(new BlobWriter('application/zip'),{level:0});
 try{await writer.add('nexus-package.json',new BlobReader(json(manifest)),{signal});let completed=0;for(const f of entries){stop(signal);onProgress({label:'Empacotando arquivos',loaded:completed,total:raw.bytes});await writer.add(f.path,new BlobReader(f.blob),{signal});completed+=f.size;}const blob=await writer.close();return{blob,name:(model.label+' - '+item.label).replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,160)+'.sbnx',manifest};}
 catch(error){try{await writer.close();}catch{}throw error;}
}
