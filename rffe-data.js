(() => {
 'use strict';
 const sort=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'}),signalRoles={SDA:'sda',SDATA:'sda',SDAT:'sda',DATA:'sda',SCL:'scl',SCLK:'scl',CLK:'scl'},roles=['sda','scl','vdd'];
 const upper=value=>String(value??'').trim().toUpperCase();
 const blocked=name=>/^(?:GND|GROUND|NC|N[._/-]?C|NO[ _-]?CONNECT|NOT[ _-]?CONNECTED|UNCONNECTED)(?:$|_)/.test(upper(name));
 const label=id=>id;
 const wifiBus=bus=>[bus.id,bus.label,...(bus.referenceLabels||[]),...bus.signals.sda.map(n=>n.name),...bus.signals.scl.map(n=>n.name)].some(name=>/WLAN|WI[\s_-]?FI/i.test(String(name??'')));
 const firstUsid=device=>Math.min(...(device.expectedUsids?.length?device.expectedUsids:[device.usid]).filter(value=>Number.isInteger(value)&&value>=1&&value<=15));
 const busNumber=bus=>{const match=String(bus.label).match(/RFFE[\s_-]*(\d+)/i)||String(bus.id).match(/RFFE[\s_-]*(\d+)/i);return match?Number(match[1]):Infinity;};
 const busOrder=(a,b)=>busNumber(a)-busNumber(b)||sort.compare(a.label,b.label)||sort.compare(a.id,b.id);
 const deviceOrder=(a,b)=>firstUsid(a)-firstUsid(b)||sort.compare(a.component,b.component);
 const signalOrder=(a,b)=>(b.score||0)-(a.score||0)||sort.compare(a.name,b.name)||a.id-b.id;
 const targetOrder=(a,b)=>b.score-a.score||sort.compare(a.component,b.component)||sort.compare(a.pad,b.pad)||a.pinId-b.pinId;
 const unique=(items,key)=>[...new Map(items.map(item=>[key(item),item])).values()];
 function compactBuses(buses){
  const groups=new Map();
  for(const bus of buses){if(wifiBus(bus))continue;const name=upper(bus.label);if(!groups.has(name))groups.set(name,[]);groups.get(name).push(bus);}
  const result=[];
  for(const group of groups.values()){
   const named=identify(group[0].label)?.id;
   group.sort((a,b)=>Number(b.id===named)-Number(a.id===named)||b.devices.length-a.devices.length||sort.compare(a.id,b.id));
   const primary=group[0],merged={...primary,aliasIds:group.slice(1).map(b=>b.id)},devices=new Map();
   // Equivalent JCID names may come from several electrically continuous aliases.
   // Keep their positions, but use one reference row per component, not per alias.
   for(const bus of group)for(const device of bus.devices){const key=upper(device.component),prior=devices.get(key);if(!prior||prior.automatic&&!device.automatic||!Number.isFinite(firstUsid(prior))&&Number.isFinite(firstUsid(device)))devices.set(key,device);}
   merged.devices=[...devices.values()].filter(device=>Number.isFinite(firstUsid(device))).sort(deviceOrder);
   if(!merged.devices.some(device=>Number.isFinite(firstUsid(device))))continue;
   merged.signals={};merged.targets={};
   for(const role of roles){
    merged.signals[role]=unique(group.flatMap(b=>b.signals[role]).sort(signalOrder).reverse(),n=>n.id).sort(signalOrder);
    merged.targets[role]=unique(group.flatMap(b=>b.targets[role]).sort(targetOrder).reverse(),t=>t.pinId).sort(targetOrder);
   }
   merged.linkedComponents=unique(group.flatMap(b=>b.linkedComponents),c=>c.id).sort((a,b)=>sort.compare(a.name,b.name));
   merged.referenceSources=unique(group.flatMap(b=>b.referenceSources||[]),source=>JSON.stringify(source));
   merged.referenceNotes=unique(group.flatMap(b=>b.referenceNotes||[]),String);
   merged.referenceLabels=unique(group.flatMap(b=>b.referenceLabels||[]),upper);
   result.push(merged);
  }
  return result.sort(busOrder);
 }
 function identify(name){
  const tokens=upper(name).split(/[_\s]+/);if(!tokens.some(t=>/^RFFE\d*$/.test(t)))return null;
  const found=tokens.map((t,i)=>({role:signalRoles[t],i})).filter(t=>t.role);if(found.length!==1)return null;
  const {role,i}=found[0],id=tokens.filter((_,j)=>i!==j).join('_');return {id,role};
 }
 function indexData(data){
  const nets=new Map(),namedNets=new Map(),pins=new Map(),components=new Map(),partPins=new Map(),netPins=new Map(),series=new Map();
  for(const net of data?.nets||[]){nets.set(net.id,net);for(const name of new Set([net.name,...(net.sourceNames||[])].map(upper))){if(!namedNets.has(name))namedNets.set(name,[]);namedNets.get(name).push(net);}}
  for(const c of data?.components||[])components.set(c.id,c);
  for(const p of data?.pins||[]){pins.set(p.id,p);if(p.via||!components.has(p.part)||!nets.has(p.net))continue;if(!partPins.has(p.part))partPins.set(p.part,[]);partPins.get(p.part).push(p);if(!netPins.has(p.net))netPins.set(p.net,[]);netPins.get(p.net).push(p);}
  for(const c of components.values()){
   // Only an actual two-terminal resistor/inductor can continue a signal.
   // Capacitors, resistor packs and connections through an IC are never traversed.
   if(!/^(?:R|L)(?:\d|_)/.test(upper(c.name)))continue;
   const pp=partPins.get(c.id)||[];if(pp.length!==2||pp[0].net===pp[1].net)continue;
   const nn=pp.map(p=>nets.get(p.net));if(nn.some(n=>blocked(n.name)||!upper(n.name)))continue;
   for(let i=0;i<2;i++){const from=pp[i].net,to=pp[1-i].net;if(!series.has(from))series.set(from,[]);series.get(from).push({to,component:c.name,componentId:c.id});}
  }
  return {nets,namedNets,pins,components,partPins,netPins,series};
 }
 function isTestPoint(c,index){return (index.partPins.get(c.id)||[]).length===1&&/^(?:PP\d|TP(?:\d|_|$)|TEST[_ ]?POINT)/.test(upper(c.name));}
 function controller(c){const name=upper(c.name);return /(?:^|_)(?:MDM|BASEBAND|BB|BBRF|BB_RF|XCV(?:R|F)(?:FR)?\d*|SDR\d*|SMR|WLAN|WIFI|WCN\d*|TRANSCEIVER)(?:_|$)/.test(name)||/^UXCV(?:R|F)(?:FR)?\d/.test(name);}
 function moduleCandidate(c,index,hostIds){
  const name=upper(c.name),count=(index.partPins.get(c.id)||[]).length;
  if(count<3||controller(c)||hostIds.has(c.id))return false;
  return /^(?:U(?:\d|_)|PA[A-Z0-9_]*$|[LMHU]*BPA(?:_|$)|MHBPA(?:_|$)|TDDPA(?:_|$)|GSMPA(?:_|$)|DSM|FEM|LNA|ASM|ET(?:_|\d)|SW(?:_|\d)|CPL|MIMO|TRXMOD|SPAD|LPAMID|GPO(?:LAT|UAT)|(?:UAT|LAT)(?:TUN|CP)|TUN(?:FX|ER)|[ML]H?BLN|QPOET|UET\d|U[HL]ASM|UDIVA|UBUFR)/.test(name);
 }
 function reach(index,seeds,role){
  const found=new Map(),queue=[];
  for(const net of seeds)if(index.nets.has(net.id)&&!found.has(net.id)){const step={netId:net.id,viaComponents:[],distance:0};found.set(net.id,step);queue.push(step);}
  for(let q=0;q<queue.length;q++){
   const step=queue[q],net=index.nets.get(step.netId);
   // A source may contain separate IDs bearing the same line name. Keep all.
   for(const alias of index.namedNets.get(upper(net.name))||[])if(!found.has(alias.id)){const next={...step,netId:alias.id};found.set(alias.id,next);queue.push(next);}
   if(step.distance>=2)continue;
   for(const edge of index.series.get(step.netId)||[]){
    if(found.has(edge.to))continue;const nextNet=index.nets.get(edge.to),name=upper(nextNet.name),signal=identify(name);
    if(role!=='vdd'&&(/^PP(?:\d|_)|(?:^|_)(?:GND|VDD|VCC|VIO|VBAT|VBATT)(?:_|$)|\dV\d/.test(name)||signal&&signal.role!==role))continue;
    if(role==='vdd'&&signal)continue;
    const next={netId:edge.to,viaComponents:[...step.viaComponents,edge.component],distance:step.distance+1};found.set(edge.to,next);queue.push(next);
   }
  }
  return found;
 }
 function connectedComponents(index,reachable){const out=new Set();for(const id of reachable.keys())for(const p of index.netPins.get(id)||[])out.add(p.part);return out;}
 function supplyCandidates(index,bus,devices){
  const ids=new Set(devices.map(d=>d.componentId).filter(id=>index.components.has(id))),namedBus=bus.id.match(/(?:^|_)RFFE(\d+)(?:_|$)/)?.[1],out=[];
  if(!ids.size)return out;
  for(const net of index.nets.values()){
   const name=upper(net.name);
   // A generic PP1V8 rail is insufficient: require RF I/O supply naming AND
   // an actual connection to a detected slave on this bus.
   if(!/(?:1V8|1[.,]8V)/.test(name)||!/(?:RFFE|VIO|RF_IO)/.test(name))continue;
   const namedRail=name.match(/(?:^|_)RFFE(\d+)(?:_|$)/)?.[1];if(namedRail&&namedBus&&namedRail!==namedBus)continue;
   const reached=reach(index,[net],'vdd'),distances=new Map();for(const [netId,step] of reached)for(const p of index.netPins.get(netId)||[])if(ids.has(p.part))distances.set(p.part,Math.min(distances.get(p.part)??Infinity,step.distance));
   const linked=[...distances.keys()];if(!linked.length)continue;
   const coverage=[...distances.values()].reduce((sum,distance)=>sum+1/(distance+1),0)/ids.size;
   const score=coverage*100+(namedRail&&namedRail===namedBus?50:0)+(/VIO/.test(name)?20:0)+(/RFFE/.test(name)?20:0);
   out.push({id:net.id,name:net.name,score,componentIds:linked,evidence:'rf-io-supply-connected-to-bus-device'});
  }
  out.sort((a,b)=>b.score-a.score||sort.compare(a.name,b.name)||a.id-b.id);
  if(!out.length)return out;
  // Keep best-supported supplies, including equally supported supply domains.
  return out.filter(n=>n.score===out[0].score);
 }
 function targets(index,reachable,devices){
  const deviceIds=new Set(devices.map(d=>d.componentId)),out=[];
  for(const [netId,step] of reachable){const net=index.nets.get(netId);if(!net||blocked(net.name))continue;
   for(const p of index.netPins.get(netId)||[]){const c=index.components.get(p.part);if(!c)continue;const test=isTestPoint(c,index),isDevice=deviceIds.has(c.id),isController=controller(c);
    const score=(test?1000:isDevice?300:isController?10:100)-step.distance*30+(test&&c.sourceSide===1?5:0);
    out.push({component:c.name,componentId:c.id,pinId:p.id,pad:String(p.name??''),netId,netName:net.name,view:String(c.view??''),isTestPoint:test,score,viaComponents:[...step.viaComponents],evidence:step.distance?'two-terminal-series-path':'same-net'});
   }
  }
  return out.sort(targetOrder);
 }
 function discover(data,mapping={}){
  if(data?.nexusComposition?.version===1)return [];
  const index=indexData(data),buses=new Map(),config=new Map();
  const create=id=>({id,label:label(id),signals:{sda:[],scl:[],vdd:[]},targets:{sda:[],scl:[],vdd:[]},devices:[],linkedComponents:[]});
  for(const net of index.nets.values())for(const alias of new Set([net.name,...(net.sourceNames||[])])){const found=identify(alias);if(!found)continue;let bus=buses.get(found.id);if(!bus){bus=create(found.id);buses.set(found.id,bus);}bus.signals[found.role].push({id:net.id,name:net.name});}
  for(const configured of mapping.buses||[]){
   if(typeof configured.id!=='string'||!configured.id.trim())continue;const id=upper(configured.id),bus=buses.get(id)||create(id);buses.set(id,bus);config.set(id,configured);
   if(configured.label)bus.label=String(configured.label);
   for(const role of roles)if(Array.isArray(configured.signals?.[role])){const requested=[...new Set(configured.signals[role].map(upper))];bus.signals[role]=requested.flatMap(name=>(index.namedNets.get(name)||[]).map(net=>({id:net.id,name:net.name})));}
  }
  const busReach=new Map(),pairedBuses=new Map();
  for(const bus of buses.values()){const sda=reach(index,bus.signals.sda,'sda'),scl=reach(index,bus.signals.scl,'scl'),dataParts=connectedComponents(index,sda),clockParts=connectedComponents(index,scl);busReach.set(bus.id,{sda,scl,dataParts,clockParts});for(const id of dataParts)if(clockParts.has(id))pairedBuses.set(id,(pairedBuses.get(id)||0)+1);}
  // Numeric references carry no functional name. A large IC at the common end
  // of several complete buses is a controller, not an RF front-end module.
  const hostIds=new Set([...pairedBuses].filter(([id,count])=>{const c=index.components.get(id),pp=index.partPins.get(id)||[];return /^U\d/.test(upper(c.name))&&count>=2&&pp.length>=128&&pp.filter(p=>/(?:^|_)(?:AP_TO|TO_AP|PCIE|DDR|NAND|SDRAM)(?:_|$)/.test(upper(index.nets.get(p.net)?.name))).length>=2;}).map(([id])=>id));
  for(const bus of buses.values()){
   const configured=config.get(bus.id)||{},{sda,scl,dataParts,clockParts}=busReach.get(bus.id),linked=new Set([...dataParts,...clockParts]);
   if(Array.isArray(configured.referenceSources))bus.referenceSources=structuredClone(configured.referenceSources);
   if(Array.isArray(configured.referenceNotes))bus.referenceNotes=[...configured.referenceNotes];
   if(Array.isArray(configured.referenceLabels))bus.referenceLabels=[...configured.referenceLabels];
   bus.linkedComponents=[...linked].map(id=>({id,name:index.components.get(id).name})).sort((a,b)=>sort.compare(a.name,b.name));
   const manual=(configured.devices||[]).filter(d=>d&&typeof d.component==='string'),exclude=new Set((configured.excludeDevices||[]).map(upper));
   for(const id of dataParts){const c=index.components.get(id);if(!clockParts.has(id)||!moduleCandidate(c,index,hostIds)||exclude.has(upper(c.name)))continue;
    bus.devices.push({component:c.name,componentId:id,pa:'',notes:'',usid:null,automatic:true,kind:/^U\d/.test(upper(c.name))?'connected-ic':'rf-module',evidence:'connected-to-sda-and-scl'});
   }
   for(const d of manual){let row=bus.devices.find(r=>upper(r.component)===upper(d.component));const c=[...index.components.values()].find(c=>upper(c.name)===upper(d.component));if(!row){row={component:d.component,componentId:c?.id??null};bus.devices.push(row);}const expectedUsids=[...new Set((Array.isArray(d.expectedUsids)?d.expectedUsids:[d.usid]).filter(value=>Number.isInteger(value)&&value>=1&&value<=15))].sort((a,b)=>a-b);
    const expectedGroups=Array.isArray(d.expectedGroups)?d.expectedGroups.filter(group=>Array.isArray(group)&&group.length&&group.every(value=>expectedUsids.includes(value))).map(group=>[...new Set(group)]):undefined;
    Object.assign(row,{component:d.component,pa:d.pa?String(d.pa):'',notes:d.notes?String(d.notes):'',usid:expectedUsids.length===1?expectedUsids[0]:null,expectedUsids,automatic:false,kind:'configured',evidence:'board-catalog',referenceMissing:!!d.referenceMissing||!expectedUsids.length,referenceComponentMissing:!c,referenceNotes:typeof d.referenceNotes==='string'?d.referenceNotes:'',referenceSources:Array.isArray(d.referenceSources)?structuredClone(d.referenceSources):[]});
    if(expectedGroups?.length)row.expectedGroups=expectedGroups;}
   bus.devices.sort(deviceOrder);
   if(!Array.isArray(configured.signals?.vdd))bus.signals.vdd=supplyCandidates(index,bus,bus.devices);
   const reachByRole={sda,scl,vdd:reach(index,bus.signals.vdd,'vdd')};
   for(const role of roles){bus.signals[role].sort(signalOrder);bus.targets[role]=targets(index,reachByRole[role],bus.devices);}
   if(!configured.label)bus.label=bus.signals.sda[0]?.name||bus.signals.scl[0]?.name||bus.id;
  }
  return compactBuses([...buses.values()]);
 }
 function discoverEdited(data,mapping){
  if(data?.nexusComposition?.version===1)return [];
  const edited=data?.nets?.some(n=>n.sourceName!==undefined)||data?.components?.some(c=>c.sourceComponentName!==undefined);if(!edited)return discover(data,mapping);
  const current=new Map(data.nets.map(n=>[n.id,n.name])),parts=new Map(data.components.map(c=>[c.id,c])),aliases=new Map();for(const c of data.components)for(const name of [c.name,c.sourceComponentName,...(c.componentAliases||[])])if(name)aliases.set(upper(name),c);
  const canonical={...data,components:data.components.map(c=>({...c,name:c.sourceComponentName??c.name})),nets:data.nets.map(n=>({...n,name:n.sourceName??n.name}))},config=structuredClone(mapping||{});
  for(const b of config.buses||[]){b.devices=(b.devices||[]).flatMap(d=>{const c=aliases.get(upper(d.component));return c?[{...d,component:c.sourceComponentName??c.name}]:[];});if(b.excludeDevices)b.excludeDevices=b.excludeDevices.map(n=>{const c=aliases.get(upper(n));return c?.sourceComponentName??n;});}
  const buses=discover(canonical,config);for(const bus of buses){for(const d of bus.devices)if(parts.has(d.componentId))d.component=parts.get(d.componentId).name;for(const c of bus.linkedComponents)if(parts.has(c.id))c.name=parts.get(c.id).name;for(const role of ['sda','scl','vdd']){for(const signal of bus.signals[role])signal.name=current.get(signal.id)||signal.name;for(const target of bus.targets[role]){target.netName=current.get(target.netId)||target.netName;const c=parts.get(data.pins[target.pinId]?.part);if(c)target.component=c.name;}}}return buses;
 }
 window.JCIDRFFEData=Object.freeze({identify,discover:discoverEdited});
})();
