(() => {
 'use strict';
 const $=id=>document.getElementById(id),board=window.JCIDBoardView;
 if(!board)return;
 $('layersButton').addEventListener('click',()=>{const open=$('layersPanel').hidden;$('layersPanel').hidden=!open;$('layersButton').setAttribute('aria-expanded',String(open));$('layersButton').setAttribute('aria-pressed',String(open));$('layersButton').title=open?'Recolher camadas':'Exibir camadas';});
 const colorNames={background:'Fundo',board:'Placa',signal:'Pads de sinal',ground:'Pads GND',nc:'Pads NC',outline:'Bordas',component:'Circuito destacado',selectedPad:'Pads selecionados',orientation:'Indicador de posição (L)'};
 function colorControl(key,name,value){const label=document.createElement('label'),text=document.createElement('span'),input=document.createElement('input');text.textContent=name;input.type='color';input.value=value;input.disabled=window.JCIDAppearanceProfiles.isLocked();input.setAttribute('aria-label','Cor: '+name);input.addEventListener('input',()=>board.setAppearance(key,input.value));label.append(text,input);return label;}
 function populateColors(){const colors=board.getAppearance();$('appearanceColors').replaceChildren(...Object.entries(colorNames).map(([key,name])=>colorControl(key,name,colors[key])));$('appearanceLayers').replaceChildren(...window.JCID_BOARD.layers.map(l=>colorControl('layer:'+l.id,l.label,colors.layers[l.id])));}
 const profiles=window.JCIDAppearanceProfiles;
 function reflectProfile(){const locked=profiles.isLocked(),rows=profiles.list();$('appearanceProfile').replaceChildren(...rows.map(row=>{const option=document.createElement('option');option.value=row.id;option.textContent=row.name+(row.dirty?' *':'');return option;}));$('appearanceProfile').value=profiles.activeId();if(document.activeElement!==$('appearanceProfileName'))$('appearanceProfileName').value=rows.find(p=>p.id===profiles.activeId()).name;$('appearanceProfileName').disabled=locked;$('deleteAppearanceProfile').disabled=locked;$('resetAppearance').disabled=locked;$('saveAppearanceProfile').disabled=locked||!profiles.dirty();$('appearanceProfileStatus').textContent=profiles.error()||(locked?'Perfil 1 protegido. Adicione um perfil para personalizar.':profiles.dirty()?'Alterações não salvas.':'Perfil salvo.');}
 function showProfiles(){reflectProfile();populateColors();}
 $('settingsButton').addEventListener('click',()=>{showProfiles();$('appearanceDialog').showModal();});
 $('appearanceProfile').addEventListener('change',()=>{profiles.select($('appearanceProfile').value);showProfiles();});
 $('addAppearanceProfile').addEventListener('click',()=>{profiles.create();showProfiles();$('appearanceProfileName').focus();$('appearanceProfileName').select();});
 $('appearanceProfileName').addEventListener('input',()=>profiles.rename($('appearanceProfileName').value));
 $('saveAppearanceProfile').addEventListener('click',()=>{profiles.save();showProfiles();});
 $('deleteAppearanceProfile').addEventListener('click',()=>{profiles.remove();showProfiles();});
 $('resetAppearance').addEventListener('click',()=>{board.resetAppearance();showProfiles();});
 window.addEventListener('nexo:appearance',reflectProfile);
 window.addEventListener('jcid:boardchange',()=>{if($('appearanceDialog').open)showProfiles();});
 $('appearanceDialog').addEventListener('click',e=>{if(e.target!==$('appearanceDialog'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();});
 let netMatches=[],activeNet=-1;
 function closeNetResults(){netMatches=[];activeNet=-1;$('netResults').hidden=true;$('netSearchMessage').hidden=true;$('statusNet').setAttribute('aria-expanded','false');$('statusNet').removeAttribute('aria-activedescendant');}
 function activateNet(index){activeNet=index;for(let i=0;i<$('netResults').children.length;i++)$('netResults').children[i].setAttribute('aria-selected',String(i===index));const option=$('netResults').children[index];if(option){$('statusNet').setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}}
 function chooseNet(index){const net=netMatches[index];if(!net)return;if(board.selectNet(net.id)){closeNetResults();$('statusNet').focus();}}
 function searchNets(){const field=$('statusNet');if(field.readOnly||field.disabled)return;const query=field.value.trim();closeNetResults();if(!query)return;netMatches=board.findNets(query);if(!netMatches.length){$('netSearchMessage').textContent='Nenhuma linha encontrada.';$('netSearchMessage').hidden=false;return;}$('netResults').replaceChildren(...netMatches.map((net,index)=>{const b=document.createElement('button');b.type='button';b.id='net-result-'+net.id;b.className='net-result';b.setAttribute('role','option');b.tabIndex=-1;b.textContent=net.name;b.title=net.name;b.addEventListener('click',()=>chooseNet(index));return b;}));$('netResults').hidden=false;field.setAttribute('aria-expanded','true');activateNet(0);}
 $('statusNet').addEventListener('input',()=>{if(!$('statusNet').readOnly)closeNetResults();});
 $('statusNet').addEventListener('keydown',e=>{if(e.key==='Escape'){closeNetResults();return;}if($('statusNet').readOnly)return;if(e.key==='Enter'){e.preventDefault();if(!$('netResults').hidden&&activeNet>=0)chooseNet(activeNet);else searchNets();}else if(!e.ctrlKey&&!$('netResults').hidden&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();activateNet((activeNet+(e.key==='ArrowDown'?1:-1)+netMatches.length)%netMatches.length);}});
 $('clearNet').addEventListener('click',()=>{board.clearSelection();closeNetResults();$('statusNet').focus();});
 document.addEventListener('pointerdown',e=>{if(e.target!==$('statusNet')&&!$('netResults').contains(e.target))closeNetResults();});
 window.addEventListener('jcid:selection',closeNetResults);window.addEventListener('jcid:document',closeNetResults);
 $('imageButton').addEventListener('click',()=>board.setImageEnabled(!board.getState().objects.image));
 const colors=board.getAppearance();for(const key of ['signal','ground','nc']){const swatch=document.querySelector('[data-pad-color="'+key+'"]');if(swatch)swatch.style.background=colors[key];}
})();
