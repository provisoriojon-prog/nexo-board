(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const inspector = $('inspector'), menu = inspector?.querySelector('.tool-menu'), board = window.JCIDBoardView;
  if (!inspector || !menu || !board || $('i2cPane')) return;

  const button = document.createElement('button');
  button.type = 'button'; button.id = 'i2cTool'; button.className = 'tool-tab'; button.textContent = 'I2C';
  button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'i2cPane');
  const adjacent = $('rffeTool'); if (adjacent) adjacent.after(button); else menu.append(button);
  const pane = document.createElement('section');
  pane.id = 'i2cPane'; pane.className = 'i2c-panel'; pane.hidden = true; pane.setAttribute('aria-label', 'Barramentos I2C');
  pane.innerHTML = `
    <div class="i2c-model"><span>Modelo</span><strong id="i2cModel">—</strong><button type="button" id="i2cRefresh" class="i2c-refresh" aria-label="Atualizar barramentos I2C" title="Atualizar barramentos I2C"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 8a7 7 0 0 1 12-2l2 3M4 15l2 3a7 7 0 0 0 12-2"/></svg></button></div>
    <div class="i2c-browser">
      <label class="i2c-search"><span class="i2c-caption">Barramentos</span><input id="i2cFilter" type="search" placeholder="Filtrar I2C" aria-label="Filtrar barramentos I2C" autocomplete="off" spellcheck="false"></label>
      <div id="i2cBusList" class="i2c-bus-list" role="listbox" aria-label="Barramentos I2C"></div>
      <div class="i2c-actions" role="group" aria-label="Localizar linhas na placa"><button id="i2cLocateall" type="button" aria-pressed="false">Todos</button><button id="i2cLocatesda" type="button"><span class="i2c-signal-dot i2c-sda" aria-hidden="true"></span>SDA</button><button id="i2cLocatescl" type="button"><span class="i2c-signal-dot i2c-scl" aria-hidden="true"></span>SCL</button></div>
    </div>
    <div class="i2c-table-title"><span>CIs envolvidos</span><strong id="i2cSelected"></strong></div>
    <div class="i2c-table-wrap"><table class="i2c-table"><colgroup><col><col><col></colgroup><thead><tr><th scope="col">CI</th><th scope="col">SDA</th><th scope="col">SCL</th></tr></thead><tbody id="i2cRows"></tbody></table></div>
    <p id="i2cStatus" class="i2c-status" role="status" aria-live="polite"></p>`;
  inspector.append(pane);

  const roles = ['sda', 'scl'], roleLabels = { sda: 'SDA', scl: 'SCL' }, colors = { sda: '#80ed80', scl: '#a148e5' };
  const choices = new Map(), filters = new Map(), cache = new WeakMap();
  let context = null, buses = [], selected = null, busy = false, allSignals = false, message = '', changingSelection = false;
  const composed = () => window.JCID_BOARD?.nexusComposition?.version === 1;
  function connectedBuses(data, candidates) {
    // The extractor recognizes named SDA/SCL families even when they contain
    // only test points/passives. List a family only when its table can show a
    // real, navigable IC terminal from this map. One IC is enough: the other
    // endpoint may live on a camera/flex absent from the current file.
    const components = new Map((data.components || []).map(component => [component.id, component]));
    const pins = new Map((data.pins || []).map(pin => [pin.id, pin]));
    const nets = new Set((data.nets || []).map(net => net.id));
    return (Array.isArray(candidates) ? candidates : []).flatMap(bus => {
      const signalIds = Object.fromEntries(['sda', 'scl'].map(role => [role, new Set((bus.signals?.[role] || []).map(signal => signal.id).filter(id => nets.has(id)))]));
      const devices = new Map();
      for (const device of bus.devices || []) {
        const matches = Number.isInteger(device.componentId) ? [components.get(device.componentId)].filter(Boolean) : [...components.values()].filter(component => component.name === device.component);
        if (matches.length !== 1) continue;
        const component = matches[0];
        if (!Number.isInteger(component.id)) continue;
        const valid = (device.pads || []).filter(pad => {
          const pin = pins.get(pad.pinId);
          return pin && !pin.via && pin.part === component.id && pin.net === pad.netId && signalIds[pad.role]?.has(pin.net);
        });
        if (!valid.length) continue;
        const previous = devices.get(component.id), unique = new Map([...(previous?.pads || []), ...valid].map(pad => [pad.role + ':' + pad.pinId, pad]));
        const pads = [...unique.values()];
        devices.set(component.id, { ...device, componentId: component.id, component: component.name, pads, roles: [...new Set(pads.map(pad => pad.role))] });
      }
      return devices.size ? [{ ...bus, devices: [...devices.values()] }] : [];
    });
  }
  function current() {
    const doc = window.JCIDDesktop?.currentDocument(); if (!doc) return null;
    const active = window.JCID_ACTIVE_BOARD;
    const available = !composed() && !doc.sourceMode && !document.body.classList.contains('board-loading') && active?.modelId === doc.modelId;
    return { ...doc, boardId: available ? active.id : null, available };
  }
  function scope() { return context?.boardId || ''; }
  function deviceId(device) { return Number.isInteger(device.componentId) ? device.componentId : window.JCID_BOARD?.components?.find(c => c.name === device.component)?.id; }
  function targets(role) { return selected?.targets?.[role] || []; }
  function signalIds(role) { return [...new Set((role === 'all' ? roles : [role]).flatMap(key => (selected?.signals?.[key] || []).map(net => net.id)))]; }
  function canNavigate() { return !pane.hidden && !busy && context?.available && current()?.boardId === context.boardId; }
  function status() {
    $('i2cStatus').textContent = composed() ? 'I2C indisponível em junções.' : message ||
      (busy ? 'Abrindo placa…' : !context ? 'Abra uma placa na lista de aparelhos.' : !context.available ? 'Abra um mapa deste aparelho para consultar as linhas I2C.' : !buses.length ? 'Nenhum I2C com CI conectado neste mapa.' : !selected ? 'Selecione um barramento I2C.' : 'Os CIs deste barramento estão em ciano. Toque em um CI para localizá-lo; SDA e SCL priorizam test points.');
  }
  function clearSignals() { if (allSignals) board.clearToolNets?.(); allSignals = false; $('i2cLocateall').setAttribute('aria-pressed', 'false'); }
  function highlight(clearSelection = false) {
    if (!canNavigate()) return;
    board.setToolComponents?.(allSignals ? [] : selected?.devices.map(deviceId).filter(Number.isInteger) || [], { clearSelection });
  }
  function renderSignals() {
    $('i2cLocateall').disabled = !canNavigate() || !signalIds('all').length;
    $('i2cLocateall').setAttribute('aria-pressed', String(allSignals));
    $('i2cLocateall').title = 'Destacar SDA e SCL deste barramento';
    for (const role of roles) {
      const action = $('i2cLocate' + role), target = targets(role)[0];
      action.disabled = !canNavigate() || !signalIds(role).length;
      action.title = target ? (target.isTestPoint ? 'Localizar test point ' : 'Localizar conexão ') + target.component + ' · ' + roleLabels[role] : signalIds(role).length ? 'Localizar ' + roleLabels[role] + '; nenhum test point confirmado' : roleLabels[role] + ' não identificada neste mapa';
      action.dataset.target = target?.component || ''; action.dataset.testPoint = String(!!target?.isTestPoint);
    }
  }
  function rowSelection() {
    const id = board.getState().component;
    for (const row of $('i2cRows').querySelectorAll('[data-component-id]')) {
      const yes = Number(row.dataset.componentId) === id; row.classList.toggle('is-current', yes);
      row.querySelector('.i2c-part')?.setAttribute('aria-current', String(yes));
    }
  }
  function locateDevice(device) {
    if (!canNavigate()) return false;
    const id = deviceId(device), found = Number.isInteger(id) && board.focusComponentById(id);
    message = found ? 'Componente selecionado: ' + device.component : 'Componente oculto. Reveja o isolamento no Netcolor.';
    rowSelection(); status(); return !!found;
  }
  function renderRows() {
    const body = $('i2cRows'); body.replaceChildren();
    if (!selected?.devices.length) {
      const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 3; td.className = 'i2c-empty';
      td.textContent = selected ? 'Nenhum CI com ligação confirmada neste mapa.' : 'Selecione um I2C para consultar os CIs.'; tr.append(td); body.append(tr); return;
    }
    for (const device of selected.devices) {
      const row = document.createElement('tr'), part = document.createElement('td'), action = document.createElement('button'), id = deviceId(device);
      if (Number.isInteger(id)) row.dataset.componentId = String(id);
      action.type = 'button'; action.className = 'i2c-part'; action.textContent = device.component; action.title = 'Localizar ' + device.component;
      action.disabled = busy || !context?.available || !Number.isInteger(id); action.addEventListener('click', () => locateDevice(device)); part.append(action); row.append(part);
      for (const role of roles) {
        const cell = document.createElement('td');
        const pads = (device.pads || []).filter(pad => pad.role === role);
        const names = [...new Set(pads.map(pad => String(pad.pad ?? '')).filter(Boolean))];
        cell.textContent = names.length ? names.join(', ') : '—';
        cell.title = pads.length ? roleLabels[role] + ' · ' + names.join(', ') : 'Sem pad ' + roleLabels[role] + ' identificado'; row.append(cell);
      }
      body.append(row);
    }
    rowSelection();
  }
  function filteredBuses() {
    const query = $('i2cFilter').value.trim().toLocaleUpperCase();
    return query ? buses.filter(bus => [bus.label, bus.id, ...roles.flatMap(role => (bus.signals?.[role] || []).map(net => net.name))].some(value => String(value).toLocaleUpperCase().includes(query))) : buses;
  }
  function revealOption(list, id) {
    const option = [...list.children].find(element => element.dataset.bus === id);
    if (!option || pane.hidden) return;
    const box = list.getBoundingClientRect(), row = option.getBoundingClientRect();
    const top = box.top + list.clientTop, bottom = top + list.clientHeight;
    // Scroll only the bus list; scrollIntoView would also move the tool pane/page.
    if (row.top < top || row.height > list.clientHeight) list.scrollTop += row.top - top;
    else if (row.bottom > bottom) list.scrollTop += row.bottom - bottom;
  }
  function renderList(focusId = null) {
    const list = $('i2cBusList'), visible = filteredBuses(); list.replaceChildren(); list.setAttribute('aria-busy', String(busy));
    for (const bus of visible) {
      const option = document.createElement('button'), yes = bus.id === selected?.id;
      option.type = 'button'; option.setAttribute('role', 'option'); option.dataset.bus = bus.id; option.textContent = bus.label;
      option.title = [...new Set(roles.flatMap(role => (bus.signals?.[role] || []).map(net => net.name)))].join('\n') || bus.label;
      option.disabled = busy; option.tabIndex = yes || (!visible.some(entry => entry.id === selected?.id) && bus === visible[0]) ? 0 : -1;
      option.setAttribute('aria-selected', String(yes)); option.addEventListener('click', () => selectBus(bus.id));
      option.addEventListener('keydown', event => {
        const index = visible.indexOf(bus); let next;
        if (event.key === 'ArrowDown') next = visible[(index + 1) % visible.length];
        else if (event.key === 'ArrowUp') next = visible[(index - 1 + visible.length) % visible.length];
        else if (event.key === 'Home') next = visible[0]; else if (event.key === 'End') next = visible.at(-1);
        if (next) { event.preventDefault(); selectBus(next.id, true); }
      }); list.append(option);
      if (bus.id === focusId) option.focus({ preventScroll: true });
    }
    if (!visible.length) { const empty = document.createElement('p'); empty.className = 'i2c-empty'; empty.textContent = buses.length ? 'Nenhum barramento corresponde ao filtro.' : 'Nenhum I2C com CI conectado neste mapa.'; list.append(empty); }
    revealOption(list, focusId || selected?.id);
  }
  function selectBus(id, focus = false) {
    const next = buses.find(bus => bus.id === id); if (!next || busy || composed()) return false;
    clearSignals(); selected = next; choices.set(scope(), next.id); message = '';
    $('i2cSelected').textContent = next.label; $('i2cSelected').title = next.id;
    renderList(focus ? id : null); renderSignals(); renderRows();
    changingSelection = true; try { highlight(true); } finally { changingSelection = false; }
    status(); window.dispatchEvent(new CustomEvent('jcid:i2c-bus')); return true;
  }
  function refresh({ invalidate = false } = {}) {
    const next = current(), data = window.JCID_BOARD, changed = context?.itemId !== next?.itemId || context?.boardId !== next?.boardId;
    busy = document.body.classList.contains('board-loading');
    button.disabled = composed(); button.title = composed() ? 'I2C indisponível em junções' : 'Barramentos I2C';
    if (composed()) close();
    if (changed || busy || invalidate) { clearSignals(); message = ''; }
    context = next; $('i2cModel').textContent = context?.modelLabel || '—'; $('i2cModel').title = context?.itemLabel || '';
    $('i2cFilter').disabled = busy || !context?.available; $('i2cRefresh').disabled = busy || !context?.available;
    if (changed) $('i2cFilter').value = filters.get(scope()) || '';
    buses = [];
    if (context?.available && data && window.JCIDI2CData) {
      if (invalidate) cache.delete(data);
      const cached = cache.get(data);
      if (!cached || cached.revision !== data.nexusRevision) {
        clearSignals();
        cache.set(data, { revision: data.nexusRevision, buses: connectedBuses(data, window.JCIDI2CData.discover(data)) });
      }
      buses = cache.get(data).buses;
    }
    selected = buses.find(bus => bus.id === choices.get(scope())) || buses[0] || null;
    if (selected) choices.set(scope(), selected.id);
    else if (context?.available) choices.delete(scope());
    $('i2cSelected').textContent = selected?.label || ''; $('i2cSelected').title = selected?.id || '';
    renderList(); renderSignals(); renderRows(); highlight(changed && !pane.hidden); status();
  }
  function locate(role) {
    if (!canNavigate() || !selected) return false;
    if (role === 'all') {
      if (allSignals) { clearSignals(); highlight(); message = ''; }
      else {
        const mapping = Object.fromEntries(roles.flatMap(key => (selected.signals?.[key] || []).map(net => [net.id, colors[key]])));
        changingSelection = true;
        try { const ids = board.setToolNets?.(signalIds('all'), { clearSelection: true, colors: mapping, highlightComponents: false }); allSignals = !!ids?.length; highlight(); }
        finally { changingSelection = false; }
        message = allSignals ? 'SDA: verde claro · SCL: roxo' : 'Nenhuma linha disponível para destacar.';
      }
      renderSignals(); status(); return allSignals;
    }
    if (!roles.includes(role) || !signalIds(role).length) return false;
    clearSignals();
    for (const target of targets(role)) if (board.focusPinById(target.pinId)) {
      message = (target.isTestPoint ? 'Test point: ' : 'Conexão: ') + target.component + ' · ' + roleLabels[role]; status(); return true;
    }
    for (const id of signalIds(role)) if (board.selectNet(id)) { message = roleLabels[role] + ' selecionada; nenhum test point acessível neste mapa.'; status(); return true; }
    message = 'As conexões estão ocultas. Reveja o isolamento no Netcolor.'; status(); return false;
  }
  function open() {
    if (composed()) { refresh(); return false; }
    board.openTools(); pane.hidden = false; button.setAttribute('aria-pressed', 'true'); button.setAttribute('aria-expanded', 'true');
    // Other tools release the shared temporary highlights first, then I2C owns them.
    window.dispatchEvent(new CustomEvent('jcid:tool', { detail: 'i2c' })); refresh(); highlight(true); return true;
  }
  function close() {
    const active = !pane.hidden; pane.hidden = true; button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-expanded', 'false');
    if (active) { clearSignals(); board.clearToolComponents?.(); }
  }
  function snapshot() { return { choices: Object.fromEntries(choices), filters: Object.fromEntries(filters) }; }
  function restore(state) {
    if (!state || typeof state !== 'object') return false;
    for (const [id, value] of Object.entries(state.choices || {})) if (typeof value === 'string') choices.set(id, value);
    for (const [id, value] of Object.entries(state.filters || {})) if (typeof value === 'string') filters.set(id, value.slice(0, 200));
    // Restoring a session is bookkeeping only: it never opens a pane or moves the map.
    refresh(); $('i2cFilter').value = filters.get(scope()) || ''; renderList(); return true;
  }
  button.addEventListener('click', () => pane.hidden ? open() : close());
  $('i2cFilter').addEventListener('input', () => { filters.set(scope(), $('i2cFilter').value); renderList(); });
  $('i2cRefresh').addEventListener('click', () => { refresh({ invalidate: true }); message = 'Barramentos atualizados a partir desta placa.'; status(); });
  for (const role of [...roles, 'all']) $('i2cLocate' + role).addEventListener('click', () => locate(role));
  pane.addEventListener('keydown', event => { if (event.target.matches('input,textarea') || ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) event.stopPropagation(); });
  window.addEventListener('jcid:tool', event => { if (event.detail !== 'i2c') close(); });
  window.addEventListener('jcid:selection', () => {
    if (pane.hidden || changingSelection) return;
    if (allSignals) { clearSignals(); message = ''; renderSignals(); status(); }
    rowSelection();
  });
  for (const event of ['jcid:document', 'jcid:boardchange', 'jcid:boardloadstate']) window.addEventListener(event, () => refresh());
  window.addEventListener('jcid:netnames-changed', () => refresh({ invalidate: true }));
  window.JCIDI2C = Object.freeze({ open, close, refresh, selectBus, locate, snapshot, restore,
    locateComponent: name => { const device = selected?.devices.find(value => value.component === name || value.componentId === name); return !!device && locateDevice(device); },
    getContext: () => context ? { ...context } : null,
    listBuses: () => structuredClone(buses),
    getSelectedBus: () => context?.available && selected ? { boardId: context.boardId, busId: selected.id, label: selected.label, modelLabel: context.modelLabel, signals: structuredClone(selected.signals), devices: structuredClone(selected.devices), targets: structuredClone(selected.targets) } : null });
  refresh();
})();
