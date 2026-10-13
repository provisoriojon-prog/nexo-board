(() => {
 'use strict';
 function forBoard(documents,modelId,boardId){const scoped=documents.filter(d=>d.scope_board_id===boardId&&d.modelIds.includes(modelId));return scoped.length?scoped:documents.filter(d=>!d.scope_board_id&&d.modelIds.includes(modelId));}
 window.NexusDocumentScope=Object.freeze({forBoard});
})();
