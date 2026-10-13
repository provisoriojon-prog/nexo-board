(function (root, factory) {
 'use strict';
 const api = factory();
 if (typeof module === 'object' && module.exports) module.exports = api;
 if (root) root.JCIDI2CData = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
 'use strict';

 const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
 const compare = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));
 const upper = value => String(value ?? '').trim().toUpperCase();
 const roleNames = { SDA: 'sda', SDATA: 'sda', SDAT: 'sda', DATA: 'sda', SCL: 'scl', SCLK: 'scl', CLK: 'scl', CLOCK: 'scl' };
 const directions = new Set(['TO', 'BI', 'FROM']);
 const voltage = token => /^\d+(?:V\d*|[.,]\d+V)$/.test(token);
 const marker = token => /^(?:I2C|IIC|I2CC)\d*$/.test(token);
 const blocked = name => /^(?:GND|GROUND|NC|N[._/-]?C|NO[ _-]?CONNECT|NOT[ _-]?CONNECTED|UNCONNECTED)(?:$|_)/.test(upper(name));
 const supply = name => /^(?:PP(?:\d|_)|(?:VDD|VCC|VIO|VBAT|VBATT|GND|GROUND)(?:_|\d|$))/.test(upper(name));
 const tokenise = name => upper(name).replace(/I²C/g, 'I2C').replace(/\bI2C[_ -]+(\d+)(?=[_ -]|$)/g, 'I2C$1').split(/[\s_/-]+/).filter(Boolean);
 const namesOf = net => [...new Set([net.sourceName, net.name, ...(net.sourceNames || [])].filter(value => typeof value === 'string' && value.trim()))];

 function identify(name) {
  const tokens = tokenise(name), markerIndex = tokens.findIndex(marker);
  if (markerIndex < 0) return null;
  const found = tokens.map((token, index) => ({ role: roleNames[token], index })).filter(value => value.role);
  // GPIO interrupts and isolation enables mentioning I2C are not bus signals.
  if (found.length !== 1) return null;
  const { role, index: roleIndex } = found[0];
  const busToken = tokens[markerIndex].replace(/^IIC/, 'I2C');
  const numberMatch = busToken.match(/(\d+)$/), number = numberMatch ? Number(numberMatch[1]) : null;
  const rail = tokens.filter(voltage).join('_');
  let domain;
  if (number !== null) {
   // Numbered controller buses keep their branches in one section. The actual
   // net IDs and every original branch name remain separate in signals/pads.
   const after = tokens.slice(markerIndex + 1, roleIndex > markerIndex ? roleIndex : tokens.length);
   const cleanAfter = after.filter(token => !directions.has(token) && !voltage(token));
   const before = tokens.slice(0, markerIndex).filter(token => !directions.has(token) && token !== 'TP' && !voltage(token));
   const candidate = cleanAfter.length ? cleanAfter : before;
   domain = /^(?:CAM|CAN)$/.test(candidate[0] || '') && /^PMU[\dI]+$/.test(candidate[1] || '') ? candidate.slice(0, 2) : candidate.slice(0, 1);
  } else {
   // Older files put the controller before I2C; others put the peripheral after
   // SDA/SCL. Keep both endpoints; only SCL/SDA direction words are paired.
   domain = tokens.filter((token, index) => index !== markerIndex && index !== roleIndex && !directions.has(token) && !voltage(token));
   while (domain.length && /^(?:CONN|R|K|E|TP)$/.test(domain[domain.length - 1])) domain.pop();
   if (domain[0] === 'TP') domain.shift();
   // Both I2C_S4_BT_... and I2C_BT_..._S4 occur in the source catalog.
   if (domain.includes('S4')) domain = ['S4', ...domain.filter(token => token !== 'S4')];
  }
  const familyId = [busToken, ...domain].join('_');
  // Voltage domains may have translators between them. Never merge them into
  // one electrical connection or infer a connection through an IC.
  const id = rail ? familyId + '_' + rail : familyId;
  return { id, familyId, label: id, role, number, domain: domain.join('_'), voltage: rail, sourceName: String(name), branch: tokens.filter((_, i) => i !== roleIndex).join('_') };
 }

 function indexData(data) {
  const nets = new Map(), components = new Map(), pins = new Map(), partPins = new Map(), netPins = new Map(), series = new Map(), identified = new Map();
  for (const net of data?.nets || []) { nets.set(net.id, net); identified.set(net.id, namesOf(net).map(identify).filter(Boolean)); }
  for (const component of data?.components || []) components.set(component.id, component);
  for (const pin of data?.pins || []) {
   pins.set(pin.id, pin);
   if (pin.via || !components.has(pin.part) || !nets.has(pin.net)) continue;
   if (!partPins.has(pin.part)) partPins.set(pin.part, []);
   if (!netPins.has(pin.net)) netPins.set(pin.net, []);
   partPins.get(pin.part).push(pin); netPins.get(pin.net).push(pin);
  }
  for (const component of components.values()) {
   if (!/^(?:R|L|FL|FB)(?:\d|_)/.test(upper(component.sourceComponentName ?? component.name))) continue;
   const pp = partPins.get(component.id) || [];
   if (pp.length !== 2 || pp[0].net === pp[1].net) continue;
   if (pp.some(pin => namesOf(nets.get(pin.net)).some(name => blocked(name) || supply(name)))) continue;
   for (let i = 0; i < 2; i++) {
    if (!series.has(pp[i].net)) series.set(pp[i].net, []);
    series.get(pp[i].net).push({ to: pp[1 - i].net, component: component.name, componentId: component.id });
   }
  }
  const index = { nets, components, pins, partPins, netPins, series, identified };
  // The iPhone 6 source calls this pair BB_EEPROM_SDA/SCL, without I2C.
  // Accept only that known legacy name AND shared endpoints on two real ICs;
  // a lone SDA/SCL, similarly named GPIO or pull-up is insufficient evidence.
  const legacy = { sda: [], scl: [] };
  for (const net of nets.values()) for (const name of namesOf(net)) {
   const match = upper(name).match(/^BB_EEPROM_(SDA|SCL)$/);
   if (match) legacy[match[1].toLowerCase()].push({ net, name });
  }
  const endpointIds = role => new Set(legacy[role].flatMap(({net}) => (netPins.get(net.id) || []).filter(pin => isIC(components.get(pin.part), index)).map(pin => pin.part)));
  const dataIds = endpointIds('sda'), clockIds = endpointIds('scl');
  if ([...dataIds].filter(id => clockIds.has(id)).length >= 2) {
   for (const role of ['sda', 'scl']) for (const { net, name } of legacy[role]) identified.get(net.id).push({ ...identify('I2C_BB_EEPROM_' + role.toUpperCase()), sourceName: name, evidence: 'legacy-paired-eeprom-with-common-ic-endpoints' });
  }
  return index;
 }

 function isTestPoint(component, index) {
  return (index.partPins.get(component.id) || []).length === 1 && /^(?:PP\d|TP(?:\d|_|$)|TEST[_ ]?POINT)/.test(upper(component.sourceComponentName ?? component.name));
 }
 function isIC(component, index) {
  const count = (index.partPins.get(component.id) || []).length;
  const name = upper(component.sourceComponentName ?? component.name);
  if (count < 3 || isTestPoint(component, index)) return false;
  if (/^(?:R|RN|RP|L|C|D|Q|FL|FB|F|DZ|J|P|PP|TP|ANT|SH|BH|BS|SP|MIC|X|Y|XTAL)(?:\d|_|$)/.test(name)) return false;
  if (/CONNECTOR|TEST[_ ]?POINT|SHIELD|SCREW|FIDUCIAL/.test(name)) return false;
  return true;
 }
 function relatedName(name, bus, role) {
  // A real iPhone 12 branch loses the initial I: 2C0_AOP_SDA_R. Its
  // resistor connection, not the spelling alone, establishes the bus.
  const repaired = identify(upper(name).replace(/\b2C(?=\d)/g, 'I2C'));
  if (repaired) return repaired.id === bus.id && repaired.role === role;
  const tokens = tokenise(name), found = tokens.filter(token => roleNames[token]);
  if (found.length !== 1 || roleNames[found[0]] !== role || tokens.some(marker)) return false;
  const rail = tokens.filter(voltage).join('_');
  if (rail && rail !== bus.voltage) return false;
  const domain = tokens.filter(token => !roleNames[token] && !directions.has(token) && !voltage(token));
  while (domain.length && /^(?:CONN|R|K|E|TP)$/.test(domain[domain.length - 1])) domain.pop();
  return domain.join('_') === bus.domain;
 }
 function sameSignalBranch(found, bus, role) {
  if (found.role !== role) return false;
  if (found.id === bus.id) return true;
  // XR names the device-side branch I2C3_RIGEL and the controller side
  // I2C3_ISP. R4400 physically joins the two SDA nets. Permit this specific
  // controller/device naming pair only while traversing a real series part;
  // matching numbers alone must never connect AP, AOP or other controllers.
  return found.number !== null && found.number === bus.number && found.voltage === bus.voltage &&
   ((found.domain === 'RIGEL' && bus.domain === 'ISP') || (found.domain === 'ISP' && bus.domain === 'RIGEL'));
 }
 function reachable(index, seeds, bus, role) {
  const result = new Map(), queue = [];
  for (const signal of seeds) if (!result.has(signal.id)) {
   const step = { netId: signal.id, distance: 0, viaComponents: [] };
   result.set(signal.id, step); queue.push(step);
  }
  for (let i = 0; i < queue.length; i++) {
   const step = queue[i]; if (step.distance >= 4) continue;
   for (const edge of index.series.get(step.netId) || []) {
    if (result.has(edge.to)) continue;
    const net = index.nets.get(edge.to), identities = index.identified.get(edge.to) || [];
    if (!net || namesOf(net).some(name => blocked(name) || supply(name))) continue;
    // A series resistor is not a license to cross into another named bus,
    // voltage domain, clock/data role, or an unrelated named signal.
    if (identities.length) {
     if (!identities.some(found => sameSignalBranch(found, bus, role))) continue;
     if (identities.some(found => !sameSignalBranch(found, bus, role))) continue;
    } else if (!namesOf(net).some(name => relatedName(name, bus, role)) && !/^(?:NET[_\d]|N\d|\$|UNNAMED|UNASSIGNED)/.test(upper(net.name))) continue;
    const next = { netId: edge.to, distance: step.distance + 1, viaComponents: [...step.viaComponents, edge.component] };
    result.set(edge.to, next); queue.push(next);
   }
  }
  return result;
 }
 function busOrder(a, b) {
  return (a.number ?? Infinity) - (b.number ?? Infinity) || compare(a.familyId, b.familyId) || compare(a.voltage, b.voltage) || compare(a.id, b.id);
 }
 function discover(data) {
  if (!data || data.nexusComposition?.version === 1) return [];
  const index = indexData(data), buses = new Map();
  for (const net of index.nets.values()) {
   if (blocked(net.name)) continue;
   for (const identity of index.identified.get(net.id) || []) {
    let bus = buses.get(identity.id);
    if (!bus) {
     bus = { id: identity.id, familyId: identity.familyId, label: identity.label, number: identity.number, domain: identity.domain, voltage: identity.voltage, signals: { sda: [], scl: [] }, targets: { sda: [], scl: [] }, devices: [], linkedComponents: [] };
     buses.set(identity.id, bus);
    }
    let signal = bus.signals[identity.role].find(signal => signal.id === net.id);
    if (!signal) { signal = { id: net.id, name: net.name, sourceNames: [], evidence: identity.evidence || 'explicit-i2c-net-name' }; bus.signals[identity.role].push(signal); }
    if (!signal.sourceNames.includes(identity.sourceName)) signal.sourceNames.push(identity.sourceName);
   }
  }
  for (const bus of buses.values()) {
   const devices = new Map(), linked = new Map();
   for (const role of ['sda', 'scl']) {
    bus.signals[role].sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));
    for (const [netId, step] of reachable(index, bus.signals[role], bus, role)) {
     const net = index.nets.get(netId);
     if (!bus.signals[role].some(signal => signal.id === netId)) bus.signals[role].push({ id: netId, name: net.name, sourceNames: namesOf(net), viaComponents: [...step.viaComponents], evidence: 'two-terminal-series-path' });
     for (const pin of index.netPins.get(netId) || []) {
      const component = index.components.get(pin.part), testPoint = isTestPoint(component, index), ic = isIC(component, index);
      linked.set(component.id, { id: component.id, name: component.name, kind: testPoint ? 'testpoint' : ic ? 'ic' : 'connection' });
      bus.targets[role].push({ pinId: pin.id, pad: String(pin.name ?? ''), componentId: component.id, component: component.name, netId, netName: net.name, isTestPoint: testPoint, view: String(component.view ?? ''), score: (testPoint ? 1000 : ic ? 300 : 100) - step.distance * 20, viaComponents: [...step.viaComponents], evidence: step.distance ? 'two-terminal-series-path' : 'same-net' });
      if (!ic) continue;
      let device = devices.get(component.id);
      if (!device) { device = { componentId: component.id, component: component.name, pads: [], roles: [], kind: 'connected-ic' }; devices.set(component.id, device); }
      if (!device.roles.includes(role)) device.roles.push(role);
      if (!device.pads.some(pad => pad.pinId === pin.id && pad.role === role)) device.pads.push({ pinId: pin.id, pad: String(pin.name ?? ''), netId, netName: net.name, role, viaComponents: [...step.viaComponents] });
     }
    }
    bus.targets[role].sort((a, b) => b.score - a.score || compare(a.component, b.component) || compare(a.pad, b.pad) || compare(a.pinId, b.pinId));
    bus.signals[role].sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));
   }
   bus.devices = [...devices.values()].sort((a, b) => compare(a.component, b.component) || compare(a.componentId, b.componentId));
   for (const device of bus.devices) {
    device.roles.sort(); device.pads.sort((a, b) => compare(a.role, b.role) || compare(a.pad, b.pad) || compare(a.pinId, b.pinId));
    device.evidence = device.roles.length === 2 ? 'connected-to-sda-and-scl' : 'connected-to-' + device.roles[0];
   }
   bus.linkedComponents = [...linked.values()].sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));
   bus.complete = !!bus.signals.sda.length && !!bus.signals.scl.length;
  }
  return [...buses.values()].sort(busOrder);
 }
 return Object.freeze({ version: 3, identify, discover });
});
