// app.js — Kyber Stock UI. Data and sync live in store.js.

import * as S from './store.js?v=3';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
};
const icon = (name, size = 22) => `<svg class="icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/** A faceted crystal in the given color. */
function crystal(hex, size = 34) {
  return `<svg class="crystal" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
    <polygon points="12,1.5 18.5,7 18.5,17 12,22.5 5.5,17 5.5,7" fill="${hex}" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>
    <polygon points="12,1.5 18.5,7 12,9 5.5,7" fill="#fff" opacity="0.38"/>
    <polyline points="12,9 12,22.5" stroke="#fff" stroke-opacity="0.35" stroke-width="0.8" fill="none"/>
    <polygon points="12,9 18.5,7 18.5,17 12,22.5" fill="#000" opacity="0.12"/>
  </svg>`;
}

const colors = () => S.getData().colors;
const colorById = (id) => colors().find((c) => c.id === id);
const level = (c) => (c.count <= 0 ? 'out' : c.count <= c.low ? 'low' : 'ok');

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

function render() {
  const list = colors();
  const owed = list.filter((c) => c.count < 0);   // sold but not made yet
  const out = list.filter((c) => c.count <= 0);
  const low = list.filter((c) => c.count > 0 && c.count <= c.low);
  const alert = $('alert');
  if (out.length) {
    alert.className = 'alert out';
    const empty = out.filter((c) => c.count === 0);
    alert.innerHTML = [
      owed.length && `<b>Make for current orders:</b> ${owed.map((c) => `${esc(c.name)} ×${-c.count}`).join(', ')}`,
      empty.length && `<b>Out:</b> ${empty.map((c) => esc(c.name)).join(', ')}`,
      low.length && `<b>Low:</b> ${low.map((c) => `${esc(c.name)} (${c.count})`).join(', ')}`,
    ].filter(Boolean).join(' · ');
  } else if (low.length) {
    alert.className = 'alert low';
    alert.innerHTML = `<b>Make more soon:</b> ${low.map((c) => `${esc(c.name)} (${c.count} left)`).join(', ')}`;
  } else {
    alert.className = 'alert';
    alert.textContent = 'All colors stocked ✓';
  }

  $('total').textContent = `· ${list.reduce((a, c) => a + Math.max(0, c.count), 0)} crystals`;
  $('stock').innerHTML = list.map((c) => {
    const lv = level(c);
    const state = lv === 'out' ? (c.count < 0 ? `Out · owe ${-c.count}` : 'Out') : lv === 'low' ? 'Low' : 'In stock';
    // Square tile: crystal, count, name, status (changes go through "Add new crystals").
    return `<li class="${lv === 'ok' ? '' : lv}" aria-label="${esc(c.name)}: ${c.count} left, ${state}">
      ${crystal(c.hex, 40)}
      <div class="count${c.count < 0 ? ' neg' : ''}">${c.count}</div>
      <div class="name">${esc(c.name)}</div>
      <div class="state">${state}</div>
    </li>`;
  }).join('');
}

const STATUS_TEXT = { saved: 'Synced', saving: 'Saving…', offline: 'Offline', error: 'Sync error', setup: 'Not synced' };
function renderStatus() {
  const { status, message } = S.getStatus();
  $('sync-pill').dataset.status = status;
  $('sync-pill').querySelector('.sync-text').textContent = STATUS_TEXT[status] || status;
  $('sync-pill').title = message || 'Sync now';
}

// ---------------------------------------------------------------------------
// Undo toast (no history is kept, just a few seconds to fix a mistap)
// ---------------------------------------------------------------------------

let toastTimer = 0, undoOps = null;
function toast(text, inverse) {
  $('toast-text').textContent = text;
  undoOps = inverse;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; undoOps = null; }, 6000);
}

/** Subtract a list of color ids (repeats allowed) as one order. */
function recordUse(ids, label) {
  const tally = {};
  for (const id of ids) tally[id] = (tally[id] || 0) + 1;
  const ops = Object.entries(tally).map(([id, n]) => ({ t: 'delta', id, n: -n }));
  S.commit(...ops);
  navigator.vibrate?.(12);
  toast(`Recorded ${label}: ${ids.map((id) => colorById(id)?.name).join(', ')}`, ops.map((o) => ({ ...o, n: -o.n })));
}

// ---------------------------------------------------------------------------
// Order picker
// ---------------------------------------------------------------------------

let order = { size: 1, picks: [] };

function openOrder(size) {
  order = { size, picks: [] };
  $('order-title').textContent = size === 7 ? '7-pack' : size === 1 ? '1 crystal' : '3 crystals';
  renderOrder();
  $('order-sheet').showModal();
}

function renderOrder() {
  const { size, picks } = order;
  const need = {};
  let ids;
  if (size === 7) {
    ids = S.getData().sevenPack;
    $('order-sub').textContent = 'The fixed set. Check you have each one:';
    $('picked').innerHTML = '';
    $('picked').hidden = true;
    $('palette').innerHTML = `<ul class="seven-list" style="grid-column:1/-1">${ids.map((id) => {
      const c = colorById(id);
      if (!c) return '';
      const short = c.count < 1;
      return `<li>${crystal(c.hex, 26)}<b>${esc(c.name)}</b><span class="n${short ? ' short' : ''}">${c.count} → ${c.count - 1}${short ? ` (owe ${1 - c.count})` : ''}</span></li>`;
    }).join('')}</ul>`;
  } else {
    ids = picks;
    $('picked').hidden = false;
    $('order-sub').textContent = size === 1 ? 'Tap the color they picked.' : `Tap the ${size} colors they picked (repeats are fine).`;
    $('picked').innerHTML = Array.from({ length: size }, (_, i) => {
      const c = colorById(picks[i]);
      return c
        ? `<span class="slot filled">${crystal(c.hex, 22)}${esc(c.name)}<button type="button" data-unpick="${i}" aria-label="Remove ${esc(c.name)}">✕</button></span>`
        : `<span class="slot">${i + 1}</span>`;
    }).join('');
    $('palette').innerHTML = colors().map((c) => {
      const left = c.count - picks.filter((p) => p === c.id).length;
      const lv = left <= 0 ? 'out' : left <= c.low ? 'low' : '';
      return `<button type="button" data-pick="${esc(c.id)}">${crystal(c.hex, 30)}<span class="pname">${esc(c.name)}</span><span class="pcount ${lv}">${c.count} in stock</span></button>`;
    }).join('');
  }
  for (const id of ids) need[id] = (need[id] || 0) + 1;
  const short = Object.entries(need).map(([id, n]) => ({ c: colorById(id), n })).filter(({ c, n }) => c && c.count < n);
  $('order-warn').textContent = short.length ? `Not enough ${short.map(({ c, n }) => `${c.name} (have ${Math.max(0, c.count)}, need ${n})`).join(', ')}. Recording it puts the count below 0 so you know what to make.` : '';
  const ready = size === 7 ? ids.length > 0 : picks.length === size;
  $('order-record').disabled = !ready;
  $('order-record').textContent = size === 7 ? 'Record 7-pack' : ready ? 'Record order' : `Pick ${size - picks.length} more`;
}

function recordOrder() {
  const label = order.size === 7 ? '7-pack' : order.size === 1 ? '1 crystal' : '3 crystals';
  const ids = order.size === 7 ? S.getData().sevenPack.filter(colorById) : order.picks;
  recordUse(ids, label);
  $('order-sheet').close();
}

// ---------------------------------------------------------------------------
// Add new crystals
// ---------------------------------------------------------------------------

function openRestock() {
  $('restock').innerHTML = colors().map((c) => `<li>
    ${crystal(c.hex, 28)}<span class="name">${esc(c.name)} <span class="now">· ${c.count} now</span></span>
    <button class="step" type="button" data-rs="${esc(c.id)}" data-n="-1" aria-label="Fewer ${esc(c.name)}">−</button>
    <input type="text" inputmode="numeric" value="0" data-rs-input="${esc(c.id)}" aria-label="${esc(c.name)} made (negative removes)">
    <button class="step" type="button" data-rs="${esc(c.id)}" data-n="1" aria-label="More ${esc(c.name)}">+</button>
  </li>`).join('');
  $('restock-sheet').showModal();
}

function saveRestock() {
  const ops = [...document.querySelectorAll('[data-rs-input]')]
    .map((i) => ({ t: 'delta', id: i.dataset.rsInput, n: parseInt(i.value, 10) || 0 }))
    .filter((o) => o.n !== 0);
  if (ops.length) {
    S.commit(...ops);
    const added = ops.filter((o) => o.n > 0).reduce((a, o) => a + o.n, 0);
    const removed = -ops.filter((o) => o.n < 0).reduce((a, o) => a + o.n, 0);
    const plural = (n) => `${n} crystal${n === 1 ? '' : 's'}`;
    const text = [added && `Added ${plural(added)}`, removed && `Removed ${plural(removed)}`].filter(Boolean).join(' · ');
    toast(text, ops.map((o) => ({ ...o, n: -o.n })));
  }
  $('restock-sheet').close();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function slug(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'color';
  let id = base;
  for (let i = 2; colorById(id); i++) id = `${base}-${i}`;
  return id;
}

function renderSettings() {
  const connected = S.gist.isConfigured();
  $('sync-connected').hidden = !connected;
  $('sync-setup').hidden = connected;
  $('gh-token').value = S.gist.getToken();
  $('gh-gist').value = S.gist.getGistId();

  $('color-edit').innerHTML = colors().map((c) => `<li data-color="${esc(c.id)}">
    <input type="color" value="${esc(c.hex)}" aria-label="${esc(c.name)} swatch">
    <input type="text" value="${esc(c.name)}" aria-label="Color name" maxlength="20">
    <input type="number" min="0" value="${c.low}" aria-label="${esc(c.name)} low at">
    <button class="del" type="button" data-del="${esc(c.id)}" aria-label="Delete ${esc(c.name)}">✕</button>
  </li>`).join('');

  const seven = new Set(S.getData().sevenPack);
  $('seven-pick').innerHTML = colors().map((c) => `<label>${crystal(c.hex, 18)}<input type="checkbox" value="${esc(c.id)}" ${seven.has(c.id) ? 'checked' : ''}>${esc(c.name)}</label>`).join('') +
    `<p class="fine" style="width:100%">${seven.size} colors selected.</p>`;
}

function saveColorRow(li) {
  const c = colorById(li.dataset.color);
  if (!c) return;
  const [hex, name, low] = li.querySelectorAll('input');
  const next = { id: c.id, hex: hex.value, name: name.value.trim() || c.name, low: Math.max(0, parseInt(low.value, 10) || 0) };
  if (next.hex !== c.hex || next.name !== c.name || next.low !== c.low) S.commit({ t: 'color', color: next });
}

async function syncAction(fn) {
  const msg = $('sync-msg');
  msg.textContent = 'Working…';
  msg.className = 'msg';
  try {
    await fn();
    const st = S.getStatus();
    if (st.status === 'error') throw new Error(st.message);
    msg.textContent = 'Connected ✓';
    msg.className = 'msg ok';
    renderSettings();
  } catch (err) {
    msg.textContent = err.message || 'Something went wrong';
    msg.className = 'msg error';
  }
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

function init() {
  $('open-settings').innerHTML = icon('settings');
  for (const b of document.querySelectorAll('[data-close]')) b.innerHTML = icon('close', 20);

  // Main screen
  for (const b of document.querySelectorAll('[data-order]')) b.addEventListener('click', () => openOrder(Number(b.dataset.order)));
  $('open-restock').addEventListener('click', openRestock);
  $('toast-undo').addEventListener('click', () => {
    if (undoOps) S.commit(...undoOps);
    undoOps = null;
    $('toast').hidden = true;
  });
  $('sync-pill').addEventListener('click', () => (S.gist.isConfigured() ? S.sync() : ($('settings-sheet').showModal(), renderSettings())));

  // Order picker
  $('palette').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    if (order.size === 1) order.picks = [b.dataset.pick];
    else if (order.picks.length < order.size) order.picks.push(b.dataset.pick);
    renderOrder();
  });
  $('picked').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unpick]');
    if (!b) return;
    order.picks.splice(Number(b.dataset.unpick), 1);
    renderOrder();
  });
  $('order-record').addEventListener('click', recordOrder);

  // Restock
  $('restock').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rs]');
    if (!b) return;
    const input = document.querySelector(`[data-rs-input="${b.dataset.rs}"]`);
    input.value = (parseInt(input.value, 10) || 0) + Number(b.dataset.n); // negative = remove
    input.classList.toggle('neg', Number(input.value) < 0);
  });
  $('restock').addEventListener('input', (e) => {
    if (e.target.matches('[data-rs-input]')) e.target.classList.toggle('neg', (parseInt(e.target.value, 10) || 0) < 0);
  });
  $('restock').addEventListener('focusin', (e) => { if (e.target.matches('input')) e.target.select(); });
  $('restock-save').addEventListener('click', saveRestock);

  // Settings
  $('open-settings').addEventListener('click', () => { renderSettings(); $('sync-msg').textContent = ''; $('settings-sheet').showModal(); });
  $('color-edit').addEventListener('change', (e) => { const li = e.target.closest('li'); if (li) saveColorRow(li); });
  $('color-edit').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const c = colorById(b.dataset.del);
    if (c && confirm(`Delete ${c.name}? Its count (${c.count}) is removed too.`)) { S.commit({ t: 'remove', id: c.id }); renderSettings(); }
  });
  $('add-color').addEventListener('click', () => {
    const name = prompt('New color name (e.g. Teal)');
    if (!name?.trim()) return;
    S.commit({ t: 'color', color: { id: slug(name.trim()), name: name.trim(), hex: '#14B8A6', low: 3 } });
    renderSettings();
  });
  $('seven-pick').addEventListener('change', () => {
    const ids = [...$('seven-pick').querySelectorAll('input:checked')].map((i) => i.value);
    S.commit({ t: 'seven', ids });
    renderSettings();
  });
  $('gh-connect').addEventListener('click', () => syncAction(() => S.connect($('gh-token').value, $('gh-gist').value)));
  $('gh-create').addEventListener('click', () => syncAction(() => S.createAndConnect($('gh-token').value)));

  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  }

  S.subscribe((e) => {
    if (e.type === 'data') {
      render();
      if ($('order-sheet').open) renderOrder();
    } else renderStatus();
  });
  render();
  renderStatus();
  S.startAutoSync();
}

init();
