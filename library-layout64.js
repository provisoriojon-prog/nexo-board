// Permanent library organization. Never included in temporary-session cleanup.
export const STORAGE_KEY='nexus-library-layout-v1';
const empty=()=>({version:1,entries:{},orders:{}});
export const legacyModel=id=>/^iphone-(?:[678](?:s)?(?:-|$)|x(?:r|s)?(?:-|$))/.test(id);
export const modelKey=id=>'model:'+id;
export const itemKey=id=>'file:'+id;
export const groupKey=(id,group)=>'group:'+id+':'+group;
export const parentKey=(model,item)=>item?.nexus_root?'root':item?.group?groupKey(model.id,item.group):modelKey(model.id);
export const normalizeLabel=value=>String(value||'').normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('pt-BR');
export function cleanLabel(value){const label=String(value||'').normalize('NFKC').trim().replace(/\s+/gu,' ');if(!label||label.length>180||/[\x00-\x1f\x7f]/.test(label))throw Error('Use um nome de 1 a 180 caracteres.');return label;}
export function validateLayout(parsed){
 const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value),key=value=>typeof value==='string'&&value.length<=500&&/^(?:root|legacy|(?:model|file|group):[^\x00-\x1f]+)$/.test(value),icons=new Set(['board','chip','camera','connector','speaker','image','schematic','document']);
 const invalid=()=>{throw Error('A organização da biblioteca não pôde ser lida. Seus arquivos foram preservados.');};
 if(parsed?.version!==1||!plain(parsed.entries)||!plain(parsed.orders)||Object.keys(parsed.entries).length>20000||Object.keys(parsed.orders).length>20000)invalid();
 for(const [id,entry]of Object.entries(parsed.entries)){if(!key(id)||!plain(entry))invalid();for(const name of Object.keys(entry))if(!['label','icon','deleted'].includes(name))invalid();if(entry.label!==undefined&&(typeof entry.label!=='string'||cleanLabel(entry.label)!==entry.label))invalid();if(entry.icon!==undefined&&!icons.has(entry.icon))invalid();if(entry.deleted!==undefined&&typeof entry.deleted!=='boolean')invalid();}
 for(const [id,order]of Object.entries(parsed.orders))if(!key(id)||!Array.isArray(order)||order.length>20000||order.some(value=>!key(value))||new Set(order).size!==order.length)invalid();
 return parsed;
}
export function loadLayout(storage=localStorage){const raw=storage.getItem(STORAGE_KEY);return raw?validateLayout(JSON.parse(raw)):empty();}
export function saveLayout(layout,storage=localStorage){storage.setItem(STORAGE_KEY,JSON.stringify(layout));}
export const hiddenItem=(layout,model,item)=>!!(layout.entries[itemKey(item.id)]?.deleted||!item.nexus_root&&(layout.entries[modelKey(model.id)]?.deleted||legacyModel(model.id)&&layout.entries.legacy?.deleted||item.group&&layout.entries[groupKey(model.id,item.group)]?.deleted));
export function applyLayout(catalog,registry,layout){
 const models=catalog.models.map(m=>({...m,nexus_hidden_folder:!!(layout.entries[modelKey(m.id)]?.deleted||legacyModel(m.id)&&layout.entries.legacy?.deleted),label:layout.entries[modelKey(m.id)]?.label||m.label,children:m.children.filter(i=>!hiddenItem(layout,m,i)).map(i=>({...i,...(layout.entries[itemKey(i.id)]?.label?{label:layout.entries[itemKey(i.id)].label}:{}),...(layout.entries[itemKey(i.id)]?.icon?{icon:layout.entries[itemKey(i.id)].icon}:{}),...(i.group&&layout.entries[groupKey(m.id,i.group)]?.label?{groupLabel:layout.entries[groupKey(m.id,i.group)].label}:{})}))})).filter(m=>!m.nexus_hidden_folder||m.children.some(i=>i.nexus_root));
 const modelIds=new Set(models.map(m=>m.id)),itemIds=new Set(models.flatMap(m=>m.children.map(i=>i.id))),originalIds=new Set(catalog.models.flatMap(m=>m.children.map(i=>i.id)));
 const documents=registry.documents.filter(d=>!layout.entries[itemKey(d.id)]?.deleted&&(!d.modelIds?.length||d.modelIds.some(id=>modelIds.has(id)))&&(!d.scope_board_id||itemIds.has(d.scope_board_id))&&(!d.board_ids?.length||d.board_ids.some(id=>itemIds.has(id)||!originalIds.has(id)))).map(d=>({...d,modelIds:d.modelIds?.filter(id=>modelIds.has(id)),board_ids:d.board_ids?.filter(id=>itemIds.has(id)||!originalIds.has(id))}));
 return {catalog:{...catalog,models},registry:{...registry,documents}};
}
export function orderedKeys(keys,parent,layout){const order=layout.orders[parent]||[],rank=new Map(order.map((key,i)=>[key,i]));return keys.map((key,i)=>({key,i})).sort((a,b)=>(rank.get(a.key)??order.length+a.i)-(rank.get(b.key)??order.length+b.i)).map(x=>x.key);}
