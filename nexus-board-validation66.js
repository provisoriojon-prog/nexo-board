import {BOARD_VALIDATOR_VERSION66} from './board-validate59.js';

export function boardImages66(data){return [...new Set([data.imageSource,...(data.nexusComposition?.parts||[]).map(p=>p.imageSource)].filter(Boolean))];}
export function boardValidationCache66(file,reference,images){return {version:1,validator:BOARD_VALIDATOR_VERSION66,sha256:file.sha256,size:file.size,key:reference.key,storageRevision66:reference.storageRevision66||null,images:[...images]};}
export function cachedBoardImages66(file,reference,declared){
 const cache=reference?.boardValidation66;
 if(cache?.version!==1||cache.validator!==BOARD_VALIDATOR_VERSION66||cache.sha256!==file.sha256||cache.size!==file.size||cache.key!==reference.key||(cache.storageRevision66||null)!==(reference.storageRevision66||null)||!Array.isArray(cache.images)||cache.images.some(path=>typeof path!=='string'||!path||path.length>500))return null;
 for(const path of cache.images){const image=declared.get(path);if(!image||!/^image\//.test(image.type))throw Error('Faltam os desenhos dos componentes neste pacote. A versão anterior foi mantida.');}
 return [...cache.images];
}
