(() => {
 'use strict';
 const KEY='nexo-appearance-profiles-v1',DEFAULT='profile-1',valid=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c),clone=o=>JSON.parse(JSON.stringify(o));
 let defaults={},profiles=[],selected=DEFAULT,loaded=false,upgradeMarkerDefault=true,error='';
 const drafts=new Map();
 function cleanColors(raw){const result={layers:{}};if(!raw||typeof raw!=='object')return result;for(const key of ['background','board','signal','ground','nc','outline','component','selectedPad','orientation'])if(valid(raw[key]))result[key]=raw[key];for(const [key,value] of Object.entries(raw.layers||{}))if(/^\d+$/.test(key)&&valid(value))result.layers[key]=value;return result;}
 try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved?.version===1&&Array.isArray(saved.profiles)){loaded=true;upgradeMarkerDefault=saved.markerDefaultVersion!==2;const ids=new Set();for(const p of saved.profiles){if(typeof p.id!=='string'||p.id===DEFAULT||ids.has(p.id))continue;ids.add(p.id);profiles.push({id:p.id,name:String(p.name||'Perfil personalizado').slice(0,40),colors:cleanColors(p.colors)});}if(profiles.some(p=>p.id===saved.activeId))selected=saved.activeId;}}catch{}
 // A loaded study has its own editable colors, never overwriting a saved preset.
 const STUDY='study-session';let study=null;
 const original=()=>selected===STUDY?study:profiles.find(p=>p.id===selected),current=()=>drafts.get(selected)||original();
 function persist(){try{localStorage.setItem(KEY,JSON.stringify({version:1,markerDefaultVersion:2,activeId:selected,profiles}));error='';return true;}catch{error='Não foi possível salvar neste navegador.';return false;}}
 function emit(){window.dispatchEvent(new CustomEvent('nexo:appearance'));}
 function dirty(id=selected){return drafts.has(id)&&JSON.stringify(drafts.get(id))!==JSON.stringify(id===STUDY?study:profiles.find(p=>p.id===id));}
 function get(){const colors=selected===DEFAULT?{}:current()?.colors||{};return {...defaults,...colors,layers:{...defaults.layers,...colors.layers}};}
 function configure(value){defaults=clone(value);if(!loaded){loaded=true;try{const legacy=JSON.parse(localStorage.getItem('jcid-appearance-v1')||'null');if(legacy){const colors=cleanColors(legacy);if(legacy.schemaVersion!==2&&colors.component?.toLowerCase()==='#00d5dd')colors.component=defaults.component;const resolved={...defaults,...colors,layers:{...defaults.layers,...colors.layers}};if(JSON.stringify(resolved)!==JSON.stringify(defaults)){selected='profile-migrated';profiles.push({id:selected,name:'Minhas cores',colors:resolved});}}}catch{}persist();}if(upgradeMarkerDefault){upgradeMarkerDefault=false;for(const p of profiles)if(p.colors.orientation?.toLowerCase()==='#ff63c3')p.colors.orientation=defaults.orientation;persist();}return get();}
 function list(){return [{id:DEFAULT,name:'Perfil 1',locked:true,dirty:false},...profiles.map(p=>({id:p.id,name:(drafts.get(p.id)||p).name,locked:false,dirty:dirty(p.id)})),...(study?[{id:STUDY,name:(drafts.get(STUDY)||study).name,locked:false,dirty:dirty(STUDY)}]:[])];}
 function select(id){if(id!==DEFAULT&&!(id===STUDY&&study)&&!profiles.some(p=>p.id===id))return false;selected=id;persist();emit();return true;}
 function applyStudy(raw){const colors=cleanColors(raw);study={id:STUDY,name:'Cores das notas',colors:{...defaults,...colors,layers:{...defaults.layers,...colors.layers}}};drafts.delete(STUDY);selected=STUDY;emit();return get();}
 function create(name){let n=2;while(profiles.some(p=>p.name==='Perfil '+n))n++;const id='profile-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);profiles.push({id,name:String(name||'Perfil '+n).trim().slice(0,40)||'Perfil '+n,colors:clone(defaults)});selected=id;persist();emit();return id;}
 function edit(){if(selected===DEFAULT)return null;if(!drafts.has(selected))drafts.set(selected,clone(original()));return drafts.get(selected);}
 function set(key,value){if(selected===DEFAULT||!valid(value))return false;if(key.startsWith('layer:')){const id=key.slice(6);if(!Object.hasOwn(defaults.layers||{},id))return false;edit().colors.layers[id]=value;}else{if(key==='layers'||!Object.hasOwn(defaults,key))return false;edit().colors[key]=value;}emit();return true;}
 function rename(name){if(selected===DEFAULT||typeof name!=='string'||!name.trim())return false;edit().name=name.trim().slice(0,40);emit();return true;}
 function save(){if(selected===DEFAULT)return false;const p=original(),before=clone(p);if(drafts.has(selected))Object.assign(p,clone(drafts.get(selected)));if(!persist()){Object.assign(p,before);emit();return false;}drafts.delete(selected);emit();return true;}
 function remove(id=selected){if(id===DEFAULT)return false;if(id===STUDY){study=null;drafts.delete(STUDY);if(selected===STUDY)selected=DEFAULT;emit();return true;}const index=profiles.findIndex(p=>p.id===id);if(index<0)return false;profiles.splice(index,1);drafts.delete(id);if(selected===id)selected=DEFAULT;persist();emit();return true;}
 function reset(){const draft=edit();if(!draft)return false;draft.colors=clone(defaults);emit();return true;}
 window.JCIDAppearanceProfiles=Object.freeze({configure,get,getDefaults:()=>clone(defaults),applyStudy,list,select,create,set,rename,save,remove,reset,dirty,activeId:()=>selected,isLocked:()=>selected===DEFAULT,error:()=>error});
})();
