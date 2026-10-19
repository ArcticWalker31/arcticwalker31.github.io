// app.js — Seed Pack screens: garden, battle, packs, cards, the pack-opening
// show, sheets and settings. Game rules live in state.js / cards.js.

import * as St from './state.js?v=3';
import { CARD, CARDS, RARITIES, RARITY_ORDER, TYPES, ROLE_NAMES, MAX_LEVEL, harvestCoins, harvestXp, seedCost, growMinutes, battleStats } from './cards.js?v=3';
import { cardSvg, cardArt, stageArt, pestArt, packetSvg } from './art.js?v=3';
import { startBattle, stageInfo, PESTS, CHAPTERS, ENDLESS_FROM } from './battle.js?v=3';
import { sfx, isMuted, setMuted } from './sound.js?v=3';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = St.S;
const { fmt, fmtDuration } = St;
const ls = {
  get(k, d) { try { const v = localStorage.getItem('sp.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sp.' + k, JSON.stringify(v)); } catch { /* blocked */ } },
};
const coin = (n) => `<span class="coin"></span>${fmt(n)}`;
const packCount = () => Object.values(S().packs).reduce((a, n) => a + (n || 0), 0);
const svg100 = (inner) => `<svg viewBox="0 0 100 100" aria-hidden="true">${inner}</svg>`;
const CARD_BACK = svg100(`<circle cx="50" cy="50" r="40" fill="#FBF5E6" stroke="#3B2A1E" stroke-width="4"/><path d="M50 74 V48" stroke="#4E9446" stroke-width="6" stroke-linecap="round"/><path d="M50 52 C 36 52 28 42 28 30 C 42 30 50 38 50 52 Z" fill="#6DB55B" stroke="#3B2A1E" stroke-width="3" stroke-linejoin="round"/><path d="M50 48 C 62 48 72 40 72 26 C 58 26 50 34 50 48 Z" fill="#8BC34A" stroke="#3B2A1E" stroke-width="3" stroke-linejoin="round"/>`);

let tab = ls.get('tab', 'garden');
let cardFilter = 'all';
let targeting = null; // tool id waiting for a plot tap (Trowel)
let battle = null;
const plotKeys = [];

// ---------------------------------------------------------------------------
// Little UI helpers
// ---------------------------------------------------------------------------
function toast(msg, bad = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  $('toasts').append(t);
  setTimeout(() => t.remove(), 2600);
  if (bad) sfx('error');
}
function floatAt(el, html) {
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'float';
  f.innerHTML = html;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top + r.height * 0.3}px`;
  document.body.append(f);
  setTimeout(() => f.remove(), 1200);
}

/** Card face as HTML (owned or missing). */
function cardHTML(card, { tag = 'button', extra = '' } = {}) {
  const have = S().cards[card.id];
  if (!have) {
    return `<${tag} class="card missing r-${card.rarity}" data-card="${card.id}" ${tag === 'button' ? 'type="button"' : ''}>
      <span class="c-art">?</span><span class="c-name">${RARITIES[card.rarity].name} ${TYPES[card.type]}</span></${tag}>`;
  }
  const p = St.levelFromCopies(have.n);
  const inDeck = S().deck.includes(card.id);
  return `<${tag} class="card r-${card.rarity}${have.foil ? ' foil' : ''}${extra}" data-card="${card.id}" ${tag === 'button' ? 'type="button"' : ''}>
    <span class="c-art">${cardSvg(card)}</span>
    <span class="c-lv">Lv ${p.level}</span>
    ${inDeck ? '<span class="c-deck" title="In your deck">✓</span>' : ''}
    ${have.seen === false ? '<span class="c-new">NEW</span>' : ''}
    <span class="c-name">${esc(card.name)}</span>
    <span class="c-prog"><span style="width:${p.level >= MAX_LEVEL ? 100 : (p.extra / p.need) * 100}%"></span></span>
  </${tag}>`;
}

// ---------------------------------------------------------------------------
// Sheets (one reusable bottom sheet, queued so rewards never collide)
// ---------------------------------------------------------------------------
const sheetQueue = [];
let sheetHandler = null, sheetOnClose = null;
function openSheet(title, html, onClick, onClose) {
  const d = $('sheet');
  if (d.open || !$('opening').hidden) { sheetQueue.push([title, html, onClick, onClose]); return; }
  $('sheet-title').textContent = title;
  $('sheet-content').innerHTML = html;
  sheetHandler = onClick || null;
  sheetOnClose = onClose || null;
  d.showModal();
  sfx('open');
}
function setSheet(html) { $('sheet-content').innerHTML = html; }
function closeSheet() { if ($('sheet').open) $('sheet').close(); }
$('sheet').addEventListener('close', () => {
  const cb = sheetOnClose;
  sheetHandler = sheetOnClose = null;
  if (cb) cb();
  flushSheets();
});
/** Show the next queued sheet once nothing else (sheet or pack opening) is up. */
function flushSheets() {
  setTimeout(() => {
    if (sheetQueue.length && !$('sheet').open && $('opening').hidden) openSheet(...sheetQueue.shift());
  }, 120);
}
$('sheet').addEventListener('click', (e) => {
  if (e.target === $('sheet') || e.target.closest('[data-close]')) { closeSheet(); return; }
  const op = e.target.closest('[data-open-pack]');
  if (op) { closeSheet(); openPackFlow(op.dataset.openPack); return; }
  if (sheetHandler) sheetHandler(e);
});
$('settings').addEventListener('click', (e) => {
  if (e.target === $('settings') || e.target.closest('[data-close]')) $('settings').close();
});

// ---------------------------------------------------------------------------
// Tabs & header
// ---------------------------------------------------------------------------
function showTab(next) {
  tab = next;
  ls.set('tab', tab);
  targeting = null;
  for (const b of document.querySelectorAll('.tabbar [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const v of ['garden', 'battle', 'packs', 'cards']) $('view-' + v).hidden = v !== tab;
  render();
  window.scrollTo(0, 0);
}
document.querySelector('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b && b.dataset.tab !== tab) { sfx('tap'); showTab(b.dataset.tab); }
});

function renderHeader() {
  const s = S(), L = St.levelInfo();
  $('level-chip').innerHTML = `<span class="lv">Lv ${L.level}</span>`;
  $('coin-chip').innerHTML = coin(s.coins);
  $('xpbar').firstElementChild.style.width = `${(L.into / L.need) * 100}%`;
  $('xpbar').title = `${fmt(L.into)} / ${fmt(L.need)} XP to level ${L.level + 1}`;
  const packs = packCount() + (St.freePackIn() === 0 ? 1 : 0);
  $('packs-badge').hidden = !packs;
  $('packs-badge').textContent = packs;
  const unseen = Object.values(s.cards).filter((c) => c.seen === false).length;
  $('cards-badge').hidden = !unseen;
  $('cards-badge').textContent = unseen;
}
$('level-chip').addEventListener('click', () => {
  const L = St.levelInfo();
  const r = St.levelReward(L.level + 1);
  openSheet(`Level ${L.level}`, `<div class="reward">
    <p class="fine">${fmt(L.into)} / ${fmt(L.need)} XP to level ${L.level + 1}. Harvests and battles give XP.</p>
    <div class="items"><span class="item">${coin(r.coins)}</span><span class="item">${packetMini(r.pack)} ${St.PACKS[r.pack].name}</span></div>
    <p class="fine">Reward for reaching level ${L.level + 1}${unlocksAt(L.level + 1).length ? ', plus: ' + unlocksAt(L.level + 1).join(', ') : ''}.</p></div>`);
});

function render() {
  renderHeader();
  if (tab === 'garden') renderGarden();
  else if (tab === 'battle') renderBattleTab();
  else if (tab === 'packs') renderPacks();
  else renderCards();
}

// ---------------------------------------------------------------------------
// Garden
// ---------------------------------------------------------------------------
function plotKey(v) {
  if (!v.open) return `L${v.next ? 1 : 0}`;
  if (!v.card) return `E${v.wet ? 1 : 0}`;
  return `${v.card.id}|${v.stage}|${v.ripe ? 1 : 0}|${v.wilting ? 1 : 0}|${v.wet ? 1 : 0}`;
}
function plotInner(v) {
  if (!v.open) {
    if (!v.next) return '<span class="p-lock">🔒</span>';
    return `<span class="p-lock"><span>🔒 Lv ${v.unlock.level}</span><span>${coin(v.unlock.cost)}</span></span>`;
  }
  if (!v.card) return '<span class="p-plus">+</span>';
  let h = `<svg class="p-art" viewBox="0 0 100 100" aria-hidden="true">${stageArt(v.card, v.stage)}</svg>`;
  if (v.ripe) h += `<span class="p-ready">${v.wilting ? '!' : '✓'}</span>`;
  else h += `<span class="p-time">${fmtDuration(v.msLeft)}</span><span class="p-bar"><span style="width:${v.prog * 100}%"></span></span>`;
  return h;
}
function plotClass(v) {
  return ['plot', !v.open && 'locked', v.next && 'next', v.open && !v.card && 'empty', v.wet && 'wet', v.ripe && 'ripe', v.wilting && 'wilting',
    targeting && v.card && !v.ripe && 'target'].filter(Boolean).join(' ');
}
function plotLabel(v) {
  if (!v.open) return v.next ? `Locked plot: ${v.unlock.cost} coins at level ${v.unlock.level}` : 'Locked plot';
  if (!v.card) return 'Empty plot: plant a seed';
  return v.ripe ? `${v.card.name}, ready to harvest` : `${v.card.name}, ready in ${fmtDuration(v.msLeft)}`;
}

function renderGarden() {
  const s = S(), now = Date.now();
  let h = '';
  if (s.packs.starter > 0) h += notice('starter', `${s.packs.starter} Starter Packet${s.packs.starter > 1 ? 's' : ''}`, 'Open them to get your first seeds', 'open-starter', 'Open');
  else if (St.freePackIn(now) === 0) h += notice('basic', 'Free Seed Packet ready!', 'Claim it and open it', 'claim-free', 'Claim');
  else if (packCount() > 0) {
    const n = packCount();
    h += notice(s.packs.golden ? 'golden' : s.packs.bundle ? 'bundle' : 'basic', `${n} unopened pack${n > 1 ? 's' : ''}`, 'New cards are waiting', 'go-packs', 'Open');
  }
  const boosts = [];
  const wetLeft = Math.max(0, ...s.plots.map((p) => (p.open ? (p.wet || 0) - now : 0)));
  if (wetLeft > 0) boosts.push(`<span class="boost water">💧 Watered · ${fmtDuration(wetLeft)}</span>`);
  if ((s.boosts.growUntil || 0) > now) boosts.push(`<span class="boost">🌱 +50% growth · ${fmtDuration(s.boosts.growUntil - now)}</span>`);
  if ((s.boosts.coinUntil || 0) > now) boosts.push(`<span class="boost">✨ +50% coins · ${fmtDuration(s.boosts.coinUntil - now)}</span>`);
  if (s.boosts.double) boosts.push('<span class="boost">×2 next harvest</span>');
  h += `<div class="boosts" id="boosts">${boosts.join('')}</div>`;

  h += '<div class="garden" id="garden">';
  for (let i = 0; i < St.PLOTS; i++) {
    const v = St.plotView(i, now);
    plotKeys[i] = plotKey(v);
    h += `<button class="${plotClass(v)}" type="button" data-plot="${i}" aria-label="${esc(plotLabel(v))}">${plotInner(v)}</button>`;
  }
  h += '</div>';
  if (targeting) h += `<p class="fine" style="text-align:center"><b>Tap a growing plant</b> to use the ${esc(CARD[targeting].name)}. <button class="btn small" data-cancel-target type="button">Cancel</button></p>`;

  const tools = St.powerTools();
  h += `<div class="section-head"><h2>Garden tools</h2><small>${tools.length ? 'Tap to use' : 'Find tools in packs'}</small></div>`;
  h += tools.length ? `<div class="powers" id="powers">${tools.map(powerHTML).join('')}</div>` : '<p class="fine">Tools like the Watering Can give your garden powers. You have none yet.</p>';

  const slots = St.decorSlots();
  h += `<div class="section-head"><h2>Decor</h2><small>${slots} of 5 slots</small></div><div class="decor-row">`;
  for (let i = 0; i < 5; i++) {
    const id = s.decor[i];
    if (i >= slots) h += `<div class="decor-slot locked">Lv ${(i - 1) * 5}</div>`;
    else if (id && CARD[id]) h += `<button class="decor-slot filled" type="button" data-decor="${i}" aria-label="${esc(CARD[id].name)}">${cardSvg(CARD[id])}</button>`;
    else h += `<button class="decor-slot" type="button" data-decor="${i}" aria-label="Empty decor slot">+</button>`;
  }
  h += `</div><p class="bonus-line">${bonusText() || 'Place decor for passive bonuses.'}</p>`;
  $('view-garden').innerHTML = h;
}

function notice(kind, title, sub, action, btn) {
  return `<button class="notice" type="button" data-action="${action}"><span class="n-art">${packetSvg(kind)}</span><span><b>${title}</b><small>${sub}</small></span><span class="btn small primary">${btn}</span></button>`;
}

function powerHTML(card) {
  const left = St.powerReadyIn(card.id);
  const total = St.powerCooldown(card);
  const pct = total ? Math.round((left / total) * 100) : 0;
  return `<button class="power${left ? ' cooling' : ''}" type="button" data-power="${card.id}">
    <span class="pw-art">${cardSvg(card)}${left ? `<span class="pw-cd" style="--p:${pct}%">${fmtDuration(left)}</span>` : ''}</span>
    <span>${esc(card.name)}</span></button>`;
}

function bonusText() {
  const b = St.bonus(), bits = [];
  const pct = (x) => `${Math.round(x * 100)}%`;
  if (b.coins) bits.push(`+${pct(b.coins)} coins`);
  if (b.xp) bits.push(`+${pct(b.xp)} XP`);
  if (b.speed) bits.push(`+${pct(b.speed)} growth`);
  if (b.water) bits.push(`+${pct(b.water)} watering time`);
  if (b.flowers) bits.push(`+${pct(b.flowers)} flower coins`);
  if (b.luck) bits.push(`better pack luck`);
  if (b.battleSun) bits.push(`+${b.battleSun} battle sun`);
  if (b.wilt) bits.push(`slower wilting`);
  return bits.join(' · ');
}

/** Update timers in place every second; re-draw a plot only when it changes. */
function tickGarden() {
  const g = $('garden');
  if (!g) return;
  const now = Date.now();
  for (let i = 0; i < St.PLOTS; i++) {
    const v = St.plotView(i, now);
    const el = g.children[i];
    const key = plotKey(v);
    if (key !== plotKeys[i]) {
      plotKeys[i] = key;
      el.className = plotClass(v);
      el.innerHTML = plotInner(v);
      el.setAttribute('aria-label', plotLabel(v));
    } else if (v.card && !v.ripe) {
      el.querySelector('.p-time').textContent = fmtDuration(v.msLeft);
      el.querySelector('.p-bar span').style.width = `${v.prog * 100}%`;
    }
  }
  const p = $('powers');
  if (p) for (const b of p.children) {
    const card = CARD[b.dataset.power], left = St.powerReadyIn(card.id);
    if (!!left !== b.classList.contains('cooling') || left) b.outerHTML = powerHTML(card);
  }
}

$('view-garden').addEventListener('click', (e) => {
  const t = e.target;
  const plot = t.closest('[data-plot]');
  if (plot) return onPlot(+plot.dataset.plot, plot);
  const pw = t.closest('[data-power]');
  if (pw) return onPower(pw.dataset.power, pw);
  const dec = t.closest('[data-decor]');
  if (dec) return openDecorPicker(+dec.dataset.decor);
  if (t.closest('[data-cancel-target]')) { targeting = null; renderGarden(); return; }
  const a = t.closest('[data-action]');
  if (a?.dataset.action === 'claim-free') { claimFree(); return; }
  if (a?.dataset.action === 'open-starter') { openPackFlow('starter'); return; }
  if (a?.dataset.action === 'go-packs') { sfx('tap'); showTab('packs'); }
});

function onPlot(i, el) {
  const v = St.plotView(i);
  if (targeting) {
    const id = targeting;
    if (!v.card || v.ripe) { toast('Pick a plant that is still growing.', true); return; }
    targeting = null;
    const r = St.usePower(id, i);
    if (!r.ok) toast(r.msg, true); else { sfx('water'); toast(r.msg); }
    renderGarden();
    return;
  }
  if (!v.open) { if (v.next) openUnlock(i); return; }
  if (!v.card) return openPlantPicker(i);
  if (v.ripe) {
    const r = St.harvest(i);
    if (!r.ok) return toast(r.msg, true);
    sfx('harvest');
    floatAt(el, `+${fmt(r.coins)} <span class="coin"></span> <small>+${r.xp} XP${r.doubled ? ' · ×2!' : ''}</small>`);
    return;
  }
  openCropSheet(i);
}

function openPlantPicker(i) {
  const s = S(), b = St.bonus();
  const plants = St.ownedCards().filter((c) => c.type === 'plant').sort((a, c) => a.grow - c.grow);
  if (!plants.length) {
    openSheet('Plant a seed', `<p class="empty">No seeds yet! Open a pack to get some plants.</p>
      <button class="btn primary wide" type="button" data-go>Go to packs</button>`, (e) => {
      if (e.target.closest('[data-go]')) { closeSheet(); showTab('packs'); }
    });
    return;
  }
  const empties = s.plots.filter((p) => p.open && !p.crop).length;
  let all = ls.get('fillAll', false) && empties > 1;
  const list = () => `${empties > 1 ? `<label class="setting-row"><span>Plant in all ${empties} empty plots</span><input type="checkbox" id="fill-all" ${all ? 'checked' : ''}></label>` : ''}
    <ul class="pick-list">${plants.map((c) => {
      const lvl = St.cardLevel(c.id), cost = seedCost(c);
      const mins = growMinutes(c, lvl) / (1 + b.speed);
      return `<li><button class="pick r-${c.rarity}" type="button" data-plant="${c.id}" ${S().coins < cost ? 'disabled' : ''}>
        <span class="pk-art">${cardSvg(c)}</span>
        <span><b>${esc(c.name)} <small>Lv ${lvl}</small></b><small>${fmtDuration(mins * 60e3)} · ~${fmt(harvestCoins(c, lvl) * (1 + b.coins))} coins · ${harvestXp(c, lvl)} XP</small></span>
        <span class="pk-cost">${coin(cost)}</span></button></li>`;
    }).join('')}</ul>`;
  openSheet('Plant a seed', list(), (e) => {
    if (e.target.id === 'fill-all') { all = e.target.checked; ls.set('fillAll', all); return; }
    const b2 = e.target.closest('[data-plant]');
    if (!b2) return;
    const id = b2.dataset.plant;
    const targets = all ? S().plots.map((p, j) => (p.open && !p.crop ? j : -1)).filter((j) => j >= 0) : [i];
    let n = 0, msg = '';
    for (const j of targets) { const r = St.plant(j, id); if (r.ok) n++; else { msg = r.msg; break; } }
    if (!n) { toast(msg, true); return; }
    sfx('plant');
    closeSheet();
    if (msg && all) toast(`Planted ${n}. ${msg}`);
  });
}

function openCropSheet(i) {
  const v = St.plotView(i);
  const c = v.card;
  let confirmDig = false;
  const body = () => `<div class="detail"><div>${cardHTML(c, { tag: 'div' })}</div><div class="d-meta">
      <span class="rarity-tag r-${c.rarity}" style="justify-self:start">${RARITIES[c.rarity].name}</span>
      <b>Ready in ${fmtDuration(St.plotView(i).msLeft)}</b>
      <span class="fine" style="margin:0">${v.wet ? `Watered: growing 50% faster for ${fmtDuration(v.wetLeft)}.` : 'Not watered. Watering makes it grow 50% faster.'}</span>
      <span class="fine" style="margin:0">Harvest: about ${coin(harvestCoins(c, v.level))} and ${harvestXp(c, v.level)} XP.</span>
    </div></div>
    <div class="row" style="margin-top:14px"><button class="btn danger" type="button" data-dig>${confirmDig ? 'Tap again to dig up' : 'Dig up'}</button></div>`;
  openSheet(c.name, body(), (e) => {
    if (!e.target.closest('[data-dig]')) return;
    if (!confirmDig) { confirmDig = true; setSheet(body()); return; }
    St.digUp(i);
    sfx('plant');
    closeSheet();
  });
}

function openUnlock(i) {
  const v = St.plotView(i);
  const lvl = St.playerLevel();
  const ok = lvl >= v.unlock.level && S().coins >= v.unlock.cost;
  openSheet('Expand the garden', `<div class="reward">
    <p>Clear a new plot for ${coin(v.unlock.cost)}.</p>
    ${lvl < v.unlock.level ? `<p class="fine">Reach <b>level ${v.unlock.level}</b> first (you're level ${lvl}).</p>` : ''}
    <button class="btn primary wide" type="button" data-unlock ${ok ? '' : 'disabled'}>Unlock plot ${i + 1}</button></div>`, (e) => {
    if (!e.target.closest('[data-unlock]')) return;
    const r = St.unlockPlot(i);
    if (!r.ok) return toast(r.msg, true);
    sfx('unlock');
    closeSheet();
    toast('New plot ready to plant!');
  });
}

function onPower(id, el) {
  const card = CARD[id];
  if (St.powerReadyIn(id) > 0) { toast(`${card.name} recharges in ${fmtDuration(St.powerReadyIn(id))}.`); return; }
  if (St.needsTarget(id)) { targeting = id; sfx('tap'); renderGarden(); return; }
  const r = St.usePower(id);
  if (!r.ok) return toast(r.msg, true);
  if (r.effect === 'harvestAll') { sfx('harvest'); floatAt(el, `+${fmt(r.coins)} <span class="coin"></span> <small>+${r.xp} XP</small>`); toast(`Harvested ${r.count} plants.`); }
  else { sfx(r.effect.startsWith('water') ? 'water' : 'spell'); toast(r.msg); }
}

function openDecorPicker(slot) {
  const s = S();
  const decor = St.ownedCards().filter((c) => c.type === 'decor');
  const cur = s.decor[slot];
  const html = decor.length ? `<ul class="pick-list">${decor.map((c) => {
    const where = s.decor.indexOf(c.id);
    return `<li><button class="pick r-${c.rarity}${c.id === cur ? ' on' : ''}" type="button" data-pick="${c.id}">
      <span class="pk-art">${cardSvg(c)}</span><span><b>${esc(c.name)} <small>Lv ${St.cardLevel(c.id)}</small></b><small>${esc(c.desc)}${where >= 0 && where !== slot ? ' · in another slot' : ''}</small></span><span></span></button></li>`;
  }).join('')}</ul>${cur ? '<button class="btn wide" type="button" data-pick="" style="margin-top:10px">Empty this slot</button>' : ''}` : '<p class="empty">No decor yet. Gnomes, birdbaths and more come in packs.</p>';
  openSheet('Decor', html, (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const r = St.setDecor(slot, b.dataset.pick || null);
    if (!r.ok) return toast(r.msg, true);
    sfx('place');
    closeSheet();
  });
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------
const packetMini = (kind) => `<span style="display:inline-block;width:22px">${packetSvg(kind)}</span>`;
function unlocksAt(level) {
  const out = [];
  const plot = St.PLOT_UNLOCK.findIndex((p) => p.level === level);
  if (plot >= 0) out.push('a new garden plot');
  for (const p of Object.values(St.PACKS)) if (p.level === level && level > 1) out.push(`the ${p.name} in the shop`);
  if (level % 5 === 0 && level <= 15) out.push('a new decor slot');
  return out;
}

function renderPacks() {
  const s = S(), lvl = St.playerLevel(), now = Date.now();
  let h = '';
  if (s.packs.starter > 0) h += notice('starter', `${s.packs.starter} Starter Packet${s.packs.starter > 1 ? 's' : ''}`, 'Open them to get your first seeds', 'open-starter', 'Open');
  // Daily streak
  const today = St.dayKey();
  const count = s.streak.day === today ? s.streak.count : 0;
  h += `<div class="section-head"><h2>Daily visits</h2><small>Come back each day</small></div><div class="streak">`;
  St.STREAK_REWARDS.forEach((r, i) => {
    const done = i < count;
    h += `<div class="day${done ? ' done' : ''}${i === count - 1 ? ' today' : ''}"><span>Day ${i + 1}</span><span class="ico">${r.coins ? '<span class="coin"></span>' : packetMini(r.pack)}</span><span>${r.coins ? r.coins : { basic: 'Packet', bundle: 'Bundle', golden: 'Golden' }[r.pack]}</span></div>`;
  });
  h += '</div>';

  // Free pack
  const left = St.freePackIn(now);
  h += `<div class="section-head"><h2>Free Seed Packet</h2><small>Every 6 hours</small></div>
    <div class="panel" style="display:flex;align-items:center;gap:12px">
      <span style="width:44px;flex:none">${packetSvg('basic')}</span>
      <span style="flex:1">${left ? `Next one in <b data-free-left>${fmtDuration(left)}</b>` : '<b>Ready now!</b>'}</span>
      <button class="btn ${left ? '' : 'primary'}" type="button" data-claim ${left ? 'disabled' : ''}>Claim</button></div>`;

  // Packs (owned + shop)
  h += `<div class="section-head"><h2>Packs</h2><small>${coin(s.coins)}</small></div><div class="pack-row">`;
  for (const [kind, p] of Object.entries(St.PACKS)) {
    if (p.starter) continue;
    const have = s.packs[kind], locked = lvl < p.level;
    h += `<div class="pack${locked && !have ? ' locked' : ''}">
      <span class="pk-img${have ? ' wobble' : ''}">${packetSvg(kind)}</span>
      <b>${p.name}</b><small>${p.blurb}</small>
      ${have ? `<span class="count">×${have}</span><button class="btn primary small" type="button" data-open="${kind}">Open</button>` : ''}
      ${locked ? `<small>Shop unlocks at level ${p.level}</small>` : `<button class="btn small" type="button" data-buy="${kind}" ${s.coins < p.price ? 'disabled' : ''}>${coin(p.price)}</button>`}
    </div>`;
  }
  h += '</div>';

  // Odds
  const total = RARITY_ORDER.reduce((a, r) => a + RARITIES[r].weight, 0);
  h += `<div class="section-head"><h2>Card odds</h2><small>Per card</small></div><div class="panel"><table class="odds">
    ${RARITY_ORDER.map((r) => `<tr><td><span class="rarity-tag r-${r}">${RARITIES[r].name}</span></td><td>${Math.round((RARITIES[r].weight / total) * 1000) / 10}%</td></tr>`).join('')}
    </table><p class="fine">Foil cards: 4%. Cards you don't have yet are twice as likely. Duplicates level a card up to Lv ${MAX_LEVEL}; after that they turn into coins. Bundles guarantee a Rare+ and Golden Packs an Epic+ in the last slot.</p></div>`;
  $('view-packs').innerHTML = h;
}

$('view-packs').addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-action="open-starter"]')) return openPackFlow('starter');
  if (t.closest('[data-claim]')) return claimFree();
  const o = t.closest('[data-open]');
  if (o) return openPackFlow(o.dataset.open);
  const b = t.closest('[data-buy]');
  if (b) {
    const kind = b.dataset.buy;
    const r = St.buyPack(kind);
    if (!r.ok) return toast(r.msg, true);
    sfx('coin');
    openPackFlow(kind);
  }
});

function claimFree() {
  const r = St.claimFreePack();
  if (!r.ok) return toast(r.msg, true);
  sfx('coin');
  openPackFlow('basic');
}

// ---------------------------------------------------------------------------
// Pack opening show: tear the packet, deal face-down cards, tap to flip.
// ---------------------------------------------------------------------------
function openPackFlow(kind) {
  const res = St.openPack(kind);
  if (!res.ok) return toast(res.msg, true);
  const L = $('opening');
  const p = St.PACKS[kind];
  let flipped = 0;
  const n = res.results.length;
  L.hidden = false;
  document.body.style.overflow = 'hidden';
  L.innerHTML = `<div class="o-top"><h2>${p.name}</h2><button class="btn small" type="button" data-skip>Skip</button></div>
    <div class="o-stage" id="o-stage"><div class="rays"></div>
      <div class="o-packet" id="o-packet" role="button" aria-label="Tear open the packet">
        <div class="body" style="clip-path: inset(11% 0 0 0)">${packetSvg(kind)}</div>
        <div class="tear-top" style="height:11%">${packetSvg(kind)}</div>
      </div></div>
    <div class="o-foot"><p class="o-hint" id="o-hint">Tap the packet to tear it open</p></div>`;
  sfx('open');

  const deal = () => {
    $('o-stage').innerHTML = `<div class="o-cards n${n}" id="o-cards">${res.results.map((r, i) => {
      const glow = ['rare', 'epic', 'legendary'].includes(r.card.rarity) ? ` glow-${r.card.rarity}` : '';
      const tagText = r.isNew ? 'NEW!' : r.coins ? `+${r.coins} coins` : r.levelAfter > r.levelBefore ? `Lv ${r.levelAfter}!` : `${r.progress.extra}/${r.progress.need || '·'} to Lv ${r.levelAfter + 1}`;
      const tagCls = r.isNew ? '' : r.coins ? ' coins' : r.levelAfter > r.levelBefore ? ' up' : ' up';
      const showTag = r.isNew || r.coins || r.levelAfter > r.levelBefore || r.levelAfter < MAX_LEVEL;
      return `<div class="flip${glow}" data-flip="${i}" style="animation-delay:${i * 0.09}s">
        <div class="inner"><div class="face back">${CARD_BACK}</div>
        <div class="face front">${cardHTML(r.card, { tag: 'div', extra: r.foil ? ' foil' : '' })}</div></div>
        ${showTag ? `<span class="tag${tagCls}">${tagText}</span>` : ''}</div>`;
    }).join('')}</div>`;
    $('o-hint').textContent = 'Tap each card to flip it';
    L.querySelector('.o-foot').innerHTML = `<p class="o-hint" id="o-hint">Tap each card to flip it</p><button class="btn" type="button" data-flipall>Flip all</button>`;
  };

  const flip = (el, quiet) => {
    if (el.classList.contains('up')) return;
    el.classList.add('up');
    flipped++;
    const r = res.results[+el.dataset.flip];
    if (!quiet) {
      sfx('cardFlip');
      if (r.card.rarity === 'legendary') setTimeout(() => sfx('legendary'), 150);
      else if (r.card.rarity === 'epic') setTimeout(() => sfx('epic'), 150);
      else if (r.card.rarity === 'rare') setTimeout(() => sfx('rare'), 150);
      else if (!r.isNew && r.levelAfter > r.levelBefore) setTimeout(() => sfx('dupe'), 150);
      if (['rare', 'epic', 'legendary'].includes(r.card.rarity) || r.foil) burst(el, r.card.rarity);
    }
    if (flipped === n) finish();
  };

  const finish = () => {
    const more = S().packs[kind];
    const news = res.results.filter((r) => r.isNew).length;
    const ups = res.results.filter((r) => !r.isNew && r.levelAfter > r.levelBefore).length;
    L.querySelector('.o-foot').innerHTML = `<p class="o-hint">${[news && `${news} new card${news > 1 ? 's' : ''}`, ups && `${ups} level-up${ups > 1 ? 's' : ''}`].filter(Boolean).join(' · ') || 'Nice haul!'}</p>
      <div class="row" style="justify-content:center">${more ? `<button class="btn" type="button" data-again>Open another (${more})</button>` : ''}<button class="btn primary" type="button" data-done>Done</button></div>`;
    const skip = L.querySelector('[data-skip]');
    if (skip) skip.hidden = true;
  };

  const close = (done = true) => {
    L.hidden = true;
    L.innerHTML = '';
    L.onclick = null;
    document.body.style.overflow = '';
    if (done && kind === 'starter' && !S().packs.starter) {
      showTab('garden');
      toast('Now tap an empty plot to plant your first seed!');
    } else render();
    if (done) flushSheets();
  };

  L.onclick = (e) => {
    const t = e.target;
    const packet = t.closest('#o-packet');
    if (packet && !packet.classList.contains('torn')) {
      packet.classList.add('torn');
      sfx('packTear');
      $('o-hint').textContent = '';
      setTimeout(deal, 650);
      return;
    }
    const f = t.closest('[data-flip]');
    if (f) return flip(f);
    if (t.closest('[data-flipall]')) {
      const best = res.results.reduce((a, r) => Math.max(a, RARITY_ORDER.indexOf(r.card.rarity)), 0);
      document.querySelectorAll('#o-cards [data-flip]').forEach((el, i) => setTimeout(() => flip(el, true), i * 110));
      setTimeout(() => sfx(best >= 4 ? 'legendary' : best === 3 ? 'epic' : best === 2 ? 'rare' : 'cardFlip'), n * 110);
      return;
    }
    if (t.closest('[data-skip]')) {
      if (!$('o-cards')) deal();
      document.querySelectorAll('#o-cards [data-flip]').forEach((el) => { el.style.animation = 'none'; flip(el, true); });
      return;
    }
    if (t.closest('[data-again]')) { close(false); openPackFlow(kind); return; }
    if (t.closest('[data-done]')) close();
  };
}

function burst(el, rarity) {
  const r = el.getBoundingClientRect();
  const color = getComputedStyle(document.documentElement).getPropertyValue(`--r-${rarity}`) || '#FFD54F';
  for (let i = 0; i < 14; i++) {
    const d = document.createElement('span');
    d.className = 'o-burst';
    const a = (i / 14) * Math.PI * 2;
    d.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;position:fixed;background:${i % 2 ? color : '#FFF59D'};--dx:${Math.cos(a) * 90}px;--dy:${Math.sin(a) * 90}px`;
    document.body.append(d);
    setTimeout(() => d.remove(), 900);
  }
}

// ---------------------------------------------------------------------------
// Cards & deck
// ---------------------------------------------------------------------------
function renderCards() {
  const s = S();
  const ownedN = Object.keys(s.cards).length;
  let h = `<div class="collection-bar"><span>${ownedN} / ${CARDS.length} cards</span><span class="meter"><span style="width:${(ownedN / CARDS.length) * 100}%"></span></span></div>`;
  h += `<div class="section-head" style="margin-top:4px"><h2>Battle deck</h2><button class="btn small" type="button" data-edit-deck>Edit deck</button></div>`;
  h += deckStrip();
  h += `<div class="section-head"><h2>Collection</h2><small>Tap a card for details</small></div>`;
  h += `<div class="filters" role="group" aria-label="Filter">${[['all', 'All'], ['plant', 'Plants'], ['tool', 'Tools'], ['weather', 'Weather'], ['decor', 'Decor']]
    .map(([k, label]) => `<button type="button" data-filter="${k}" aria-pressed="${cardFilter === k}">${label}</button>`).join('')}</div>`;
  const list = CARDS.filter((c) => cardFilter === 'all' || c.type === cardFilter)
    .map((c, i) => [c, i]).sort((a, b) => RARITY_ORDER.indexOf(a[0].rarity) - RARITY_ORDER.indexOf(b[0].rarity) || a[1] - b[1]).map(([c]) => c);
  h += `<div class="card-grid">${list.map((c) => cardHTML(c)).join('')}</div>`;
  $('view-cards').innerHTML = h;
}

function deckStrip() {
  const d = S().deck;
  return `<div class="deck-strip">${Array.from({ length: St.DECK_SIZE }, (_, i) => d[i]
    ? `<button class="slot" type="button" data-card="${d[i]}" aria-label="${esc(CARD[d[i]].name)}">${cardSvg(CARD[d[i]])}</button>`
    : '<span class="slot empty"></span>').join('')}</div>`;
}

$('view-cards').addEventListener('click', (e) => {
  const f = e.target.closest('[data-filter]');
  if (f) { cardFilter = f.dataset.filter; sfx('tap'); renderCards(); return; }
  if (e.target.closest('[data-edit-deck]')) return openDeckEditor();
  const c = e.target.closest('[data-card]');
  if (c && S().cards[c.dataset.card]) openCard(c.dataset.card);
});

function statsHTML(card, level) {
  const rows = [];
  const add = (k, v) => rows.push(`<dt>${k}</dt><dd>${v}</dd>`);
  if (card.type === 'plant') {
    rows.push('<h4>In the garden</h4>');
    add('Grows in', fmtDuration(growMinutes(card, level) * 60e3));
    add('Harvest', `${coin(harvestCoins(card, level))} · ${harvestXp(card, level)} XP`);
    add('Seeds', coin(seedCost(card)));
    const s = battleStats(card, level);
    rows.push(`<h4>In battle · ${ROLE_NAMES[card.role]}</h4>`);
    add('Sunlight cost', `☀ ${s.cost}`);
    add('Recharge', `${s.cd} s`);
    if (s.hp) add('Health', fmt(s.hp));
    if (s.role === 'shooter' || s.role === 'slow') add('Damage', `${fmt(s.dmg)}${s.lanes ? ` × ${s.lanes} lanes` : ''} every ${s.rate} s`);
    if (s.splash) add('Splash', `${Math.round(s.splash * 100)}%`);
    if (s.slow) add('Slows', `${Math.round(s.slow * 100)}% for ${s.slowFor} s`);
    if (s.burn) add('Burn', `${fmt(s.burn)}/s`);
    if (s.sun) add('Sunlight', `+${s.sun} every ${s.every} s`);
    if (s.role === 'bomb') add('Blast', `${fmt(s.dmg)} (${{ cell3: '3×3', lane: 'whole lane', lanes3: '3 lanes', all: 'everything' }[s.area]})`);
    if (s.thorns) add('Thorns', `${fmt(s.thorns)}/s to biters`);
    if (s.eat) add('Special', `Swallows a pest whole, then chews ${s.chew} s`);
    if (s.heal) add('Heals', `${fmt(s.heal)} every ${s.every} s`);
  } else if (card.type === 'decor') {
    rows.push('<h4>Decor bonus</h4>');
    add('Effect', esc(card.desc));
    add('At this level', `×${(1 + 0.2 * (level - 1)).toFixed(1)}`);
  } else {
    const s = card.spell;
    rows.push('<h4>In battle</h4>');
    add('Sunlight cost', `☀ ${s.cost}`);
    add('Recharge', `${s.cd} s`);
    add('Target', { lane: 'One lane', all: 'Whole field', area: '3×3 area', front: 'Front-most pest' }[s.target]);
    if (level > 1) add('Strength', `×${(1 + 0.15 * (level - 1)).toFixed(2)}`);
    if (card.garden) {
      rows.push('<h4>Garden power</h4>');
      add('Recharge', card.garden.cd ? fmtDuration(St.powerCooldown(card)) : 'None');
    }
  }
  return `<dl class="stats">${rows.join('')}</dl>`;
}

/** Full deck: show the 8 deck cards so the player picks which one `id` replaces. */
function swapHTML(id) {
  return `<p class="fine">Your deck is full. Tap the card that <b>${esc(CARD[id].name)}</b> should replace.</p>
    <div class="swap-grid">${S().deck.map((x) => cardHTML(CARD[x])).join('')}</div>
    <button class="btn wide" type="button" data-swap-cancel style="margin-top:14px">Cancel</button>`;
}
/** Handles a tap inside the swap view. Returns true if it was handled. */
function onSwapClick(e, id, back) {
  const pick = e.target.closest('.swap-grid [data-card]');
  if (pick) {
    const out = pick.dataset.card;
    St.setDeck(S().deck.map((x) => (x === out ? id : x)));
    sfx('place');
    toast(`${CARD[id].name} swapped in for ${CARD[out].name}.`);
    back();
    return true;
  }
  if (e.target.closest('[data-swap-cancel]')) { sfx('tap'); back(); return true; }
  return false;
}

function openCard(id) {
  const card = CARD[id];
  St.markSeen(id);
  const draw = () => {
    const have = S().cards[id];
    const p = St.levelFromCopies(have.n);
    const inDeck = S().deck.includes(id);
    return `<div class="detail"><div>${cardHTML(card, { tag: 'div' })}</div><div class="d-meta">
        <span class="rarity-tag r-${card.rarity}" style="justify-self:start">${RARITIES[card.rarity].name} ${TYPES[card.type]}</span>
        <span>${esc(card.desc)}</span>
        <b>Level ${p.level}${p.level < MAX_LEVEL ? ` · ${p.extra}/${p.need} copies to Lv ${p.level + 1}` : ' (max)'}</b>
        ${have.foil ? '<small>✨ Foil</small>' : ''}
      </div></div>
      ${statsHTML(card, p.level)}
      ${card.type === 'decor' ? '<button class="btn wide" type="button" data-to-garden>Place in the garden</button>'
        : `<button class="btn ${inDeck ? '' : 'primary'} wide" type="button" data-deck-toggle>${inDeck ? 'Remove from deck' : 'Add to deck'}</button>`}`;
  };
  openSheet(card.name, draw(), (e) => {
    if (onSwapClick(e, id, () => setSheet(draw()))) return;
    if (e.target.closest('[data-deck-toggle]')) {
      const d = S().deck;
      if (d.includes(id)) St.setDeck(d.filter((x) => x !== id));
      else if (d.length >= St.DECK_SIZE) { sfx('tap'); setSheet(swapHTML(id)); $('sheet').scrollTop = 0; return; }
      else St.setDeck([...d, id]);
      sfx('tap');
      setSheet(draw());
    }
    if (e.target.closest('[data-to-garden]')) {
      const s = S(), slots = St.decorSlots();
      let slot = s.decor.slice(0, slots).findIndex((x) => !x);
      if (slot < 0) slot = 0;
      St.setDecor(slot, id);
      sfx('place');
      closeSheet();
      showTab('garden');
      toast(`${card.name} placed in decor slot ${slot + 1}.`);
    }
  }, () => render());
}

const DECK_FILTERS = [['all', 'All'], ['sun', 'Sun-makers'], ['shooter', 'Shooters'], ['wall', 'Walls'], ['support', 'Healers'],
  ['slow', 'Slowers'], ['trap', 'Traps'], ['bomb', 'Bombs'], ['tool', 'Tools'], ['weather', 'Weather']];
const deckCat = (c) => (c.type === 'plant' ? c.role : c.type);
let deckFilter = 'all';

function openDeckEditor() {
  const draw = () => {
    const d = S().deck;
    const all = St.ownedCards().filter((c) => c.type !== 'decor');
    const counts = {};
    for (const c of all) counts[deckCat(c)] = (counts[deckCat(c)] || 0) + 1;
    if (deckFilter !== 'all' && !counts[deckFilter]) deckFilter = 'all';
    const list = all.filter((c) => deckFilter === 'all' || deckCat(c) === deckFilter)
      .sort((a, b) => (d.includes(b.id) - d.includes(a.id)) || battleStats(a, 1).cost - battleStats(b, 1).cost);
    const chips = DECK_FILTERS.filter(([k]) => k === 'all' || counts[k])
      .map(([k, label]) => `<button type="button" data-dfilter="${k}" aria-pressed="${deckFilter === k}">${label}${k === 'all' ? '' : ` ${counts[k]}`}</button>`).join('');
    return `<p class="fine">${d.length} / ${St.DECK_SIZE} cards. Mix sun-makers, shooters, walls and a spell or two.</p>${deckStrip()}
      <div class="filters" role="group" aria-label="Filter by type" style="margin:12px 0 10px">${chips}</div>
      <ul class="pick-list">${list.map((c) => `<li><button class="pick r-${c.rarity}${d.includes(c.id) ? ' on' : ''}" type="button" data-toggle="${c.id}">
        <span class="pk-art">${cardSvg(c)}</span><span><b>${esc(c.name)} <small>Lv ${St.cardLevel(c.id)}</small></b>
        <small>${c.type === 'plant' ? ROLE_NAMES[c.role] : TYPES[c.type]} · ☀ ${battleStats(c, 1).cost}</small></span>
        <span class="pk-cost">${d.includes(c.id) ? '✓' : '+'}</span></button></li>`).join('')}</ul>`;
  };
  let swapping = null, keepY = 0;
  const back = () => { swapping = null; setSheet(draw()); $('sheet').scrollTop = keepY; };
  openSheet('Battle deck', draw(), (e) => {
    if (swapping) { onSwapClick(e, swapping, back); return; }
    const f = e.target.closest('[data-dfilter]');
    if (f) { deckFilter = f.dataset.dfilter; sfx('tap'); setSheet(draw()); return; }
    const t = e.target.closest('[data-toggle], .deck-strip [data-card]');
    if (!t) return;
    const id = t.dataset.toggle || t.dataset.card;
    const d = S().deck;
    const y = $('sheet').scrollTop;
    if (d.includes(id)) St.setDeck(d.filter((x) => x !== id));
    else if (d.length >= St.DECK_SIZE) { swapping = id; keepY = y; sfx('tap'); setSheet(swapHTML(id)); $('sheet').scrollTop = 0; return; }
    else St.setDeck([...d, id]);
    sfx('tap');
    setSheet(draw());
    $('sheet').scrollTop = y;
  }, () => render());
}

// ---------------------------------------------------------------------------
// Battle tab: chapters of 10 stages, then endless
// ---------------------------------------------------------------------------
const pestChip = (p) => `<span class="pest-chip${p.boss ? ' boss' : ''}" title="${esc(p.note || '')}">${svg100(pestArt(p.kind))}${esc(p.name)}</span>`;
/** This chapter's pests (and the boss) get chips; older ones are summed up. */
function pestChips(info) {
  const ch = info.chapter;
  const fresh = info.pests.filter((p) => p.boss || ch.endless || p.from >= ch.from);
  const old = info.pests.length - fresh.length;
  return `<div class="pest-row">${fresh.map(pestChip).join('')}${old ? `<span class="pest-chip more">+${old} familiar pest${old > 1 ? 's' : ''}</span>` : ''}</div>`;
}
function rewardLine(stage, first) {
  const r = St.battleReward(stage, first);
  return `<div class="reward-line"><span>${coin(r.coins)}</span><span>+${r.xp} XP</span>${r.pack ? `<span>${packetMini(r.pack)} ${St.PACKS[r.pack].name}</span>` : ''}</div>`;
}
const chapterLabel = (ch) => (ch.endless ? 'Endless · Wild Garden' : `Chapter ${ch.index + 1} · ${ch.name}`);
const swatch = (theme) => `<span class="ch-swatch" style="background:${theme.a};border-color:${theme.hedge}"></span>`;

function stageGrid(from, to, cleared, next) {
  let h = '<div class="stage-list">';
  for (let n = from; n <= to; n++) {
    const cls = n <= cleared ? 'cleared' : n === next ? 'next' : '';
    h += `<button class="stage-btn ${cls}${n % 5 === 0 ? ' boss' : ''}" type="button" data-stage="${n}" ${n > next ? 'disabled' : ''}>${n}</button>`;
  }
  return h + '</div>';
}

function renderBattleTab() {
  const s = S();
  const next = s.stage + 1;
  const info = stageInfo(next);
  const ch = info.chapter;
  let h = `<div class="panel stage-hero">
    <small class="ch-label">${swatch(ch.theme)}${chapterLabel(ch)}</small>
    <h2>Stage ${next}${info.boss ? ` · ${esc(PESTS[info.boss].name)}` : ''}</h2>
    <span class="fine" style="margin:0">${info.waves} waves · optional</span>
    ${pestChips(info)}
    <div><small class="fine">First-clear reward</small>${rewardLine(next, true)}</div>
    <button class="btn primary wide" type="button" data-play="${next}">Defend the garden</button>
  </div>`;
  h += `<div class="section-head"><h2>Your deck</h2><button class="btn small" type="button" data-edit-deck>Edit</button></div>${deckStrip()}`;
  const newPests = Object.values(PESTS).filter((p) => p.from === next && p.from > 1);
  if (newPests.length) h += `<p class="fine">New pest: <b>${esc(newPests[0].name)}</b>. ${esc(newPests[0].note || '')}</p>`;

  h += `<div class="section-head"><h2>Chapters</h2><small>Replays give 40% rewards</small></div>`;
  CHAPTERS.forEach((c, i) => {
    const from = c.from, to = from + 9;
    const done = Math.max(0, Math.min(10, s.stage - from + 1));
    const head = `<div class="ch-head">${swatch(c.theme)}<b>Chapter ${i + 1} · ${c.name}</b><small>${done === 10 ? '✓ 10/10' : `${done}/10`}</small></div>`;
    if (next < from) {
      const teaser = Object.entries(PESTS).filter(([, p]) => p.from >= from && p.from <= to).map(([k, p]) => ({ kind: k, ...p }));
      teaser.push({ kind: c.boss, ...PESTS[c.boss] });
      h += `<div class="chapter locked">${head}<p class="fine">Beat stage ${from - 1} to unlock.${teaser.length > 1 ? ' New here:' : ''}</p><div class="pest-row">${teaser.map(pestChip).join('')}</div></div>`;
    } else if (next <= to) {
      h += `<div class="chapter current">${head}${stageGrid(from, to, s.stage, next)}</div>`;
    } else {
      h += `<details class="chapter"><summary>${head}</summary>${stageGrid(from, to, s.stage, next)}</details>`;
    }
  });
  const endHead = `<div class="ch-head">${swatch({ a: '#D7CCC8', hedge: '#8D6E63' })}<b>Endless · Wild Garden</b><small>${Math.max(0, s.stage - ENDLESS_FROM + 1)} cleared</small></div>`;
  if (next < ENDLESS_FROM) h += `<div class="chapter locked">${endHead}<p class="fine">Beat stage ${ENDLESS_FROM - 1} to unlock never-ending stages with every pest and boss.</p></div>`;
  else h += `<div class="chapter current">${endHead}${stageGrid(ENDLESS_FROM, Math.max(ENDLESS_FROM + 9, Math.ceil(next / 10) * 10), s.stage, next)}</div>`;
  $('view-battle').innerHTML = h;
}

$('view-battle').addEventListener('click', (e) => {
  if (e.target.closest('[data-edit-deck]')) return openDeckEditor();
  const p = e.target.closest('[data-play]');
  if (p) return playStage(+p.dataset.play);
  const st = e.target.closest('[data-stage]');
  if (st) {
    const n = +st.dataset.stage;
    if (n === S().stage + 1) return playStage(n);
    const info = stageInfo(n);
    openSheet(`Stage ${n}${info.boss ? ' · Boss' : ''}`, `<div class="stage-hero"><small class="ch-label">${swatch(info.chapter.theme)}${chapterLabel(info.chapter)}</small><span class="fine">${info.waves} waves · cleared ✓</span>${pestChips(info)}
      <div><small class="fine">Replay reward</small>${rewardLine(n, false)}</div>
      <button class="btn primary wide" type="button" data-go>Play again</button></div>`, (ev) => {
      if (ev.target.closest('[data-go]')) { closeSheet(); playStage(n); }
    });
  }
});

function playStage(n) {
  const deck = S().deck.filter((id) => CARD[id]);
  if (!deck.length) return toast('Add some cards to your deck first.', true);
  if (!deck.some((id) => CARD[id].type === 'plant')) return toast('Your deck needs at least one plant.', true);
  const host = $('battle');
  host.hidden = false;
  document.body.style.overflow = 'hidden';
  sfx('open');
  battle = startBattle({
    host, stage: n, bonusSun: St.bonus().battleSun,
    deck: deck.map((id) => ({ card: CARD[id], level: St.cardLevel(id) })),
    onEnd: (res) => {
      battle = null;
      host.hidden = true;
      host.innerHTML = '';
      document.body.style.overflow = '';
      const r = St.finishBattle(n, res.won, res.pests);
      render();
      showBattleResult(n, res, r);
    },
  });
}

function showBattleResult(n, res, r) {
  const title = res.won ? (r.first ? 'Garden saved!' : 'Pests cleared!') : res.quit ? 'Retreated' : 'The pests got through';
  const items = [`<span class="item">${coin(r.coins)}</span>`, `<span class="item">+${r.xp} XP</span>`];
  if (r.pack) items.push(`<span class="item">${packetMini(r.pack)} ${St.PACKS[r.pack].name}</span>`);
  openSheet(title, `<div class="reward">
    <p>${res.won ? `You beat stage ${n}` : `Stage ${n}`} · ${res.pests} pest${res.pests === 1 ? '' : 's'} squashed</p>
    <div class="items">${items.join('')}</div>
    ${res.won ? '' : '<p class="fine">Try planting sun-makers early, walls in front, and shooters behind them. Leveling cards (duplicates) helps a lot.</p>'}
    <div class="row" style="justify-content:center">
      ${res.won ? `<button class="btn primary" type="button" data-next>Stage ${S().stage + 1}</button>` : `<button class="btn primary" type="button" data-retry>Try again</button>`}
      ${r.pack ? '<button class="btn" type="button" data-openpack>Open pack</button>' : ''}
      <button class="btn" type="button" data-close>Close</button>
    </div></div>`, (e) => {
    if (e.target.closest('[data-next]')) { closeSheet(); playStage(S().stage + 1); }
    if (e.target.closest('[data-retry]')) { closeSheet(); playStage(n); }
    if (e.target.closest('[data-openpack]')) { closeSheet(); openPackFlow(r.pack); }
  });
  if (res.won) sfx('coin');
}

// ---------------------------------------------------------------------------
// Level-ups, daily streak, conflicts
// ---------------------------------------------------------------------------
St.on('levelup', (ups) => {
  sfx('levelUp');
  for (const u of ups) {
    const extra = unlocksAt(u.level);
    openSheet(`Level ${u.level}!`, `<div class="reward"><div class="big">Level ${u.level}</div>
      <div class="items"><span class="item">${coin(u.coins)}</span><span class="item">${packetMini(u.pack)} ${St.PACKS[u.pack].name}</span></div>
      ${extra.length ? `<p>Unlocked: ${extra.join(', ')}.</p>` : ''}
      <div class="row" style="justify-content:center"><button class="btn primary" type="button" data-open-pack="${u.pack}">Open the pack</button><button class="btn" type="button" data-close>Later</button></div></div>`);
  }
});

/** First visit ever: welcome, then straight into opening the two Starter Packets. */
function welcome() {
  openSheet('Welcome to Seed Pack!', `<div class="reward">
    <span style="display:block;width:96px">${packetSvg('starter')}</span>
    <p>Your garden is waiting! You start with ${coin(S().coins)} and <b>2 Starter Packets</b> full of seeds.</p>
    <ul>
      <li><b>Garden:</b> tap an empty plot to plant. Plants grow in real time, so come back to harvest coins and XP.</li>
      <li><b>Packs:</b> open them for new cards. Duplicates level cards up.</li>
      <li><b>Battle:</b> optional. Defend the garden from pests with your deck of 8.</li>
    </ul>
    <button class="btn primary wide" type="button" data-open-pack="starter">Open my packets</button></div>`);
}

function dailyCheck() {
  const brandNew = !(S().n > 0);
  const r = St.claimStreak(); // a brand-new garden gets its day-1 coins quietly (they show in the welcome)
  if (brandNew) { welcome(); return; }
  if (!r) return;
  const rw = r.reward;
  openSheet(`Day ${r.day} of 7`, `<div class="reward">
    <p>Welcome back to the garden!</p>
    <div class="items"><span class="item">${rw.coins ? coin(rw.coins) : `${packetMini(rw.pack)} ${St.PACKS[rw.pack].name}`}</span></div>
    <p class="fine">${r.day < 7 ? `Come back tomorrow for day ${r.day + 1}.` : 'A full week! The streak starts a new week tomorrow.'} Missing a day starts over at day 1.</p>
    ${rw.pack
      ? `<div class="row" style="justify-content:center"><button class="btn primary" type="button" data-open-pack="${rw.pack}">Open it now</button><button class="btn" type="button" data-close>Later</button></div>`
      : '<button class="btn primary wide" type="button" data-close>Collect</button>'}</div>`, null, () => render());
  sfx('coin');
}

St.setConflictResolver((local, cloud) => new Promise((resolve) => {
  const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const desc = (x) => `Level ${x.level} · ${fmt(x.coins)} coins · ${x.cards} cards · stage ${x.stage} · saved ${when(x.savedAt)}`;
  let picked = 'cloud';
  openSheet('Which garden should we keep?', `<p class="fine">This device and your other device both changed the game since they last synced. Pick one; the other is replaced.</p>
    <button class="choice" type="button" data-keep="local"><b>This device</b><small>${desc(local)}</small></button>
    <button class="choice" type="button" data-keep="cloud"><b>Cloud save</b><small>${desc(cloud)}</small></button>`, (e) => {
    const b = e.target.closest('[data-keep]');
    if (b) { picked = b.dataset.keep; closeSheet(); }
  }, () => resolve(picked));
}));

// ---------------------------------------------------------------------------
// Settings & sync
// ---------------------------------------------------------------------------
function renderSettings() {
  $('set-sound').checked = !isMuted();
  $('set-replant').checked = !!S().prefs.replant;
  const st = St.syncStatus();
  const connected = !!(St.gist.getToken() && St.gist.getGistId());
  $('sync-connected').hidden = !connected;
  $('sync-setup').hidden = connected;
  $('sync-status').textContent = {
    off: 'Not syncing. Your game is saved on this device only.',
    syncing: 'Syncing…',
    synced: 'Synced with your private game Gist.',
    offline: 'Offline. Changes will sync when you reconnect.',
    error: `Sync problem: ${st.msg}`,
  }[st.state] || '';
  if (!connected) $('gh-token').placeholder = St.gist.getToken() ? 'Token already saved on this device' : 'github_pat_…';
}
$('open-settings').addEventListener('click', () => { renderSettings(); $('settings').showModal(); sfx('open'); });
$('set-sound').addEventListener('change', (e) => { setMuted(!e.target.checked); sfx('tap'); });
$('set-replant').addEventListener('change', (e) => St.setPref('replant', e.target.checked));
$('sync-now').addEventListener('click', async () => { await St.sync(); renderSettings(); });
$('sync-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(St.gist.getGistId()); toast('Gist ID copied.'); } catch { toast(St.gist.getGistId()); }
});
$('gh-connect').addEventListener('click', async () => {
  const token = $('gh-token').value.trim();
  if (!token && !St.gist.getToken()) return toast('Paste your GitHub token first.', true);
  $('gh-connect').disabled = true;
  const st = await St.connect(token, $('gh-gist').value.trim());
  $('gh-connect').disabled = false;
  $('gh-token').value = '';
  renderSettings();
  toast(st.state === 'synced' ? 'Connected! Your garden is backed up.' : st.msg || 'Could not connect.', st.state !== 'synced');
});
$('reset').addEventListener('click', () => {
  if (!confirm('Start a brand-new garden? All cards, coins and progress on this save will be lost (on every synced device).')) return;
  St.resetSave();
  $('settings').close();
  showTab('garden');
  welcome();
});

St.on('sync', (s) => {
  $('sync-dot').dataset.state = s.state;
  if ($('settings').open) renderSettings();
});
St.on('change', (info) => {
  if (info?.remote) { render(); return; }
  if (!battle) render();
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
function init() {
  showTab(['garden', 'battle', 'packs', 'cards'].includes(tab) ? tab : 'garden');
  setInterval(() => {
    if (document.hidden || battle) return;
    if (tab === 'garden') tickGarden();
    else if (tab === 'packs') {
      const el = document.querySelector('[data-free-left]');
      if (el) { const left = St.freePackIn(); if (left) el.textContent = fmtDuration(left); else renderPacks(); }
    }
    renderHeader();
  }, 1000);
  // Pull the cloud save first (if connected) so a stale device doesn't claim
  // today's reward on old data; then hand out the daily reward.
  let checked = false;
  const daily = () => { if (!checked) { checked = true; dailyCheck(); } };
  setTimeout(daily, 4000);
  St.sync().finally(daily);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checked = false; setTimeout(() => { checked = false; daily(); }, 2500); } });
}
init();
