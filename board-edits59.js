/* Compatibility helpers; editor changes never modify stored source files. */
(() => {window.NexusBoardEdits=Object.freeze({apply:()=>{},baseName:(_id,data,id)=>{const n=data.nets.find(n=>n.id===id);return n?.sourceName??n?.name;},changes:(_id,data)=>data.nets.filter(n=>n.sourceName&&n.sourceName!==n.name).map(n=>({id:n.id,before:n.sourceName,after:n.name}))});})();
