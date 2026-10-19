// state.js — the Seed Pack save: cards, garden, packs, levels, streaks, and
// sync to the game's OWN private Gist (same GitHub token as the other apps,
// different Gist). No DOM.
//
// The save is one JSON object in localStorage ("sp.save"). Every change
// stamps savedAt. Sync is "newest save wins": whichever copy changed since the
// last sync is kept. If BOTH this device and the Gist changed, the app asks.

import { gistClient } from '../shared/gist.js?v=6';
import {
  CARD, CARDS, RARITIES, RARITY_ORDER, LEVEL_COPIES, MAX_LEVEL, levelMult,
  harvestCoins, harvestXp, seedCost, growMinutes,
} from './cards.js?v=1';

const KEY = 'sp.save';
const META = 'sp.meta';
const FILE = 'seedpack.json';
export const gist = gistClient('sp.gistId', 'Seed Pack save');

const M = 60e3, H = 60 * M;
export const PLOTS = 16;
export const START_PLOTS = 6;
/** Plots 7–16, unlocked in order. */
export const PLOT_UNLOCK = [
  { cost: 150, level: 2 }, { cost: 250, level: 3 }, { cost: 400, level: 4 }, { cost: 600, level: 5 },
  { cost: 900, level: 7 }, { cost: 1300, level: 9 }, { cost: 1800, level: 11 }, { cost: 2400, level: 13 },
  { cost: 3200, level: 15 }, { cost: 4200, level: 18 },
];
export const WATER_MS = 2 * H;
export const FREE_PACK_MS = 6 * H;
export const DECK_SIZE = 8;
export const PACKS = {
  basic: { name: 'Seed Packet', size: 4, price: 100, level: 1, guarantee: null, blurb: '4 cards' },
  bundle: { name: "Gardener's Bundle", size: 6, price: 500, level: 4, guarantee: 'rare', blurb: '6 cards · 1 Rare or better' },
  golden: { name: 'Golden Pack', size: 5, price: 1500, level: 8, guarantee: 'epic', blurb: '5 cards · 1 Epic or better' },
};
export const STREAK_REWARDS = [
  { coins: 50 }, { pack: 'basic' }, { coins: 100 }, { pack: 'basic' }, { coins: 200 }, { pack: 'bundle' }, { pack: 'golden' },
];
/** Coins for a duplicate of a card that's already Lv 5. */
const MAXED_COINS = { common: 10, uncommon: 25, rare: 60, epic: 150, legendary: 400 };
const FOIL_CHANCE = 0.04;
const STARTER = ['radish', 'pea', 'lettuce', 'daisy', 'potato', 'basil', 'mint', 'wateringcan', 'gnome'];
const STARTER_DECK = ['radish', 'pea', 'lettuce', 'daisy', 'potato', 'basil', 'mint', 'wateringcan'];

// ---------------------------------------------------------------------------
// Save + events
// ---------------------------------------------------------------------------
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } }

function fresh() {
  const now = Date.now();
  return {
    v: 1, savedAt: now, n: 0, created: now,
    coins: 150, xp: 0,
    cards: Object.fromEntries(STARTER.map((id) => [id, { n: 1, at: now, seen: true }])),
    deck: [...STARTER_DECK],
    plots: Array.from({ length: PLOTS }, (_, i) => ({ open: i < START_PLOTS })),
    decor: ['gnome'],
    packs: { basic: 1, bundle: 0, golden: 0 },
    freePackAt: now + FREE_PACK_MS,
    streak: { day: '', count: 0 },
    toolReady: {},
    boosts: {},
    stage: 0,
    stats: { harvests: 0, packs: 0, pests: 0, wins: 0, coins: 0 },
    prefs: { replant: true },
  };
}

/** Fill in anything missing (older saves, hand-edited Gists). */
function normalize(s) {
  const f = fresh();
  if (!s || typeof s !== 'object' || !s.cards) return f;
  for (const k of Object.keys(f)) if (s[k] === undefined) s[k] = f[k];
  s.stats = { ...f.stats, ...s.stats };
  s.prefs = { ...f.prefs, ...s.prefs };
  s.packs = { ...f.packs, ...s.packs };
  while (s.plots.length < PLOTS) s.plots.push({ open: false });
  for (const id of Object.keys(s.cards)) if (!CARD[id]) delete s.cards[id];
  s.deck = s.deck.filter((id) => s.cards[id] && CARD[id].type !== 'decor').slice(0, DECK_SIZE);
  s.decor = s.decor.filter((id) => !id || s.cards[id]);
  return s;
}

let save = normalize(lsGet(KEY));
export const S = () => save;

/** Random ID for this browser, so two saves stamped in the same ms never look identical. */
const DEVICE = lsGet('sp.device') || (() => { const id = Math.random().toString(36).slice(2, 10); lsSet('sp.device', id); return id; })();

const listeners = {};
export function on(evt, fn) { (listeners[evt] ||= []).push(fn); }
function emit(evt, arg) { for (const fn of listeners[evt] || []) { try { fn(arg); } catch (e) { console.error(e); } } }

/** Persist a local change: stamp it, store it, schedule a push. */
function commit() {
  save.savedAt = Math.max(Date.now(), save.savedAt + 1);
  save.n = (save.n || 0) + 1;
  save.by = DEVICE;
  lsSet(KEY, save);
  emit('change');
  schedulePush();
}

// ---------------------------------------------------------------------------
// Levels, cards, bonuses
// ---------------------------------------------------------------------------
export const xpToNext = (level) => Math.round(100 * Math.pow(level, 1.4));
export function levelInfo(xp = save.xp) {
  let level = 1, into = xp;
  while (into >= xpToNext(level)) { into -= xpToNext(level); level++; }
  return { level, into, need: xpToNext(level) };
}
export const playerLevel = () => levelInfo().level;

/** Card level from total copies owned (Lv 2 at +1 dupe, Lv 3 at +2 more, …). */
export function levelFromCopies(n) {
  let level = 1, extra = n - 1;
  while (level < MAX_LEVEL && extra >= LEVEL_COPIES[level - 1]) { extra -= LEVEL_COPIES[level - 1]; level++; }
  return { level, extra, need: level < MAX_LEVEL ? LEVEL_COPIES[level - 1] : 0 };
}
export const owned = (id) => !!save.cards[id];
export const cardLevel = (id) => (save.cards[id] ? levelFromCopies(save.cards[id].n).level : 0);
export const ownedCards = () => CARDS.filter((c) => save.cards[c.id]);

export const decorSlots = (level = playerLevel()) => Math.min(5, 2 + Math.floor(level / 5));

/** Sum of the bonuses from placed decor (higher-level decor gives more). */
export function bonus() {
  const b = { coins: 0, xp: 0, speed: 0, water: 0, luck: 0, flowers: 0, battleSun: 0, wilt: 0 };
  for (const id of save.decor.slice(0, decorSlots())) {
    if (!id || !CARD[id]) continue;
    const k = 1 + 0.2 * (cardLevel(id) - 1);
    for (const [key, v] of Object.entries(CARD[id].bonus)) b[key] += key === 'battleSun' ? Math.round(v * k) : v * k;
  }
  b.wilt = Math.min(b.wilt, 0.75);
  return b;
}

// ---------------------------------------------------------------------------
// Garden growth (real time). A crop stores progress in minutes as of `at`;
// everything else is computed on the fly, so nothing ticks in the save.
// Rates: ×1.5 while the soil is watered, ×1.5 during a greenhouse boost,
// plus decor speed bonuses.
// ---------------------------------------------------------------------------
function rates(plot) {
  const speed = 1 + bonus().speed;
  const wet = plot.wet || 0, boost = save.boosts.growUntil || 0;
  return { speed, wet, boost, at: (t) => (speed * (t < wet ? 1.5 : 1) * (t < boost ? 1.5 : 1)) / M };
}

/** Progress (minutes) and ripe time of a crop at `now`. */
function integrate(plot, now) {
  const c = plot.crop;
  if (c.ripeAt) return { prog: c.need, ripeAt: c.ripeAt };
  const r = rates(plot);
  let t = c.at, prog = c.prog;
  const stops = [r.wet, r.boost].filter((x) => x > t && x < now).sort((a, b) => a - b);
  stops.push(now);
  for (const end of stops) {
    const rate = r.at(t), gain = (end - t) * rate;
    if (prog + gain >= c.need) return { prog: c.need, ripeAt: t + (c.need - prog) / rate };
    prog += gain; t = end;
  }
  return { prog, ripeAt: 0 };
}

function msToRipe(plot, now, prog) {
  const r = rates(plot);
  let t = now, left = plot.crop.need - prog;
  const stops = [r.wet, r.boost].filter((x) => x > now).sort((a, b) => a - b);
  stops.push(Infinity);
  for (const end of stops) {
    const rate = r.at(t), cap = (end - t) * rate;
    if (cap >= left) return t + left / rate - now;
    left -= cap; t = end;
  }
  return 0;
}

/** Bake progress into the save before a rate changes (water, boost, decor). */
function settle(plot, now) {
  if (!plot.crop) return;
  const { prog, ripeAt } = integrate(plot, now);
  plot.crop.prog = prog; plot.crop.at = now;
  if (ripeAt) plot.crop.ripeAt = ripeAt;
}
const settleAll = (now) => save.plots.forEach((p) => settle(p, now));

const isFlower = (card) => card.art.t === 'flower' || card.art.t === 'clover';

/** Everything the garden needs to draw one plot. */
export function plotView(i, now = Date.now()) {
  const plot = save.plots[i];
  const v = { i, open: plot.open, wet: (plot.wet || 0) > now, wetLeft: Math.max(0, (plot.wet || 0) - now) };
  if (!plot.open) {
    const opened = save.plots.filter((p) => p.open).length;
    v.next = i === opened;
    v.unlock = PLOT_UNLOCK[i - START_PLOTS];
    return v;
  }
  if (!plot.crop) return v;
  const card = CARD[plot.crop.id];
  const { prog, ripeAt } = integrate(plot, now);
  const level = cardLevel(card.id) || 1;
  Object.assign(v, { card, level, prog: prog / plot.crop.need, ripe: !!ripeAt });
  if (ripeAt) {
    const need = plot.crop.need, since = now - ripeAt;
    const grace = Math.max(30, need) * M, decay = 2 * need * M / (1 - bonus().wilt);
    v.fresh = since <= grace ? 1 : Math.max(0.5, 1 - 0.5 * (since - grace) / decay);
    v.wilting = v.fresh < 1;
    v.wiltIn = Math.max(0, grace - since);
    v.stage = 3;
    v.coins = harvestValue(card, level, v.fresh, now).coins;
  } else {
    v.msLeft = msToRipe(plot, now, prog);
    v.stage = v.prog < 0.15 ? 0 : v.prog < 0.5 ? 1 : 2;
  }
  return v;
}

function harvestValue(card, level, freshness, now) {
  const b = bonus();
  let coins = harvestCoins(card, level) * freshness * (1 + b.coins + (isFlower(card) ? b.flowers : 0));
  if ((save.boosts.coinUntil || 0) > now) coins *= 1.5;
  if (save.boosts.double) coins *= 2;
  const xp = harvestXp(card, level) * (1 + b.xp);
  return { coins: Math.max(1, Math.round(coins)), xp: Math.max(1, Math.round(xp)) };
}

// ---------------------------------------------------------------------------
// Garden actions. Each returns { ok, msg?, … } and commits on success.
// ---------------------------------------------------------------------------
const fail = (msg) => ({ ok: false, msg });

export function plant(i, id, now = Date.now()) {
  const plot = save.plots[i], card = CARD[id];
  if (!plot?.open || plot.crop) return fail('That plot is busy.');
  if (!card || card.type !== 'plant' || !owned(id)) return fail("You don't have that seed.");
  const cost = seedCost(card);
  if (save.coins < cost) return fail(`Seeds cost ${cost} coins.`);
  save.coins -= cost;
  plot.crop = { id, at: now, prog: 0, need: growMinutes(card, cardLevel(id)) };
  commit();
  return { ok: true, cost };
}

/** Harvest one ripe plot. Replants the same seed if that pref is on and you can afford it. */
export function harvest(i, now = Date.now(), { replant = save.prefs.replant, quiet = false } = {}) {
  const v = plotView(i, now);
  if (!v.ripe) return fail('Not ripe yet.');
  const { coins, xp } = harvestValue(v.card, v.level, v.fresh, now);
  const doubled = !!save.boosts.double;
  save.boosts.double = false;
  save.plots[i].crop = null;
  save.coins += coins;
  save.stats.harvests++;
  save.stats.coins += coins;
  let replanted = false;
  if (replant && save.coins >= seedCost(v.card)) {
    save.coins -= seedCost(v.card);
    save.plots[i].crop = { id: v.card.id, at: now, prog: 0, need: growMinutes(v.card, v.level) };
    replanted = true;
  }
  const lv = addXp(xp);
  if (!quiet) commit();
  return { ok: true, coins, xp, doubled, replanted, card: v.card, ...lv };
}

export function harvestAll(now = Date.now()) {
  const out = { ok: true, coins: 0, xp: 0, count: 0, levelUps: [] };
  for (let i = 0; i < PLOTS; i++) {
    if (!save.plots[i].crop || !plotView(i, now).ripe) continue;
    const r = harvest(i, now, { quiet: true });
    out.coins += r.coins; out.xp += r.xp; out.count++; out.levelUps.push(...r.levelUps);
  }
  if (!out.count) return fail('Nothing is ripe yet.');
  commit();
  return out;
}

export function digUp(i) {
  if (!save.plots[i].crop) return fail('Nothing planted.');
  save.plots[i].crop = null;
  commit();
  return { ok: true };
}

export function unlockPlot(i) {
  const v = plotView(i);
  if (v.open || !v.next) return fail('Unlock the plots in order.');
  if (playerLevel() < v.unlock.level) return fail(`Reach level ${v.unlock.level} first.`);
  if (save.coins < v.unlock.cost) return fail(`Needs ${v.unlock.cost} coins.`);
  save.coins -= v.unlock.cost;
  save.plots[i].open = true;
  commit();
  return { ok: true };
}

export function setDecor(slot, id) {
  if (slot >= decorSlots()) return fail('Slot locked.');
  if (id && (!owned(id) || CARD[id].type !== 'decor')) return fail("You don't have that.");
  settleAll(Date.now());
  save.decor = save.decor.map((d) => (d === id ? null : d));
  while (save.decor.length <= slot) save.decor.push(null);
  save.decor[slot] = id || null;
  commit();
  return { ok: true };
}

// Tool powers (garden side of tool cards)
export const powerTools = () => ownedCards().filter((c) => c.garden);
export const powerCooldown = (card) => card.garden.cd * M * (1 - 0.06 * (cardLevel(card.id) - 1));
export const powerReadyIn = (id, now = Date.now()) => Math.max(0, (save.toolReady[id] || 0) - now);
export const needsTarget = (id) => CARD[id]?.garden?.effect === 'speedOne';

export function usePower(id, target, now = Date.now()) {
  const card = CARD[id];
  if (!card?.garden || !owned(id)) return fail("You don't have that tool.");
  if (powerReadyIn(id, now) > 0) return fail('Still recharging.');
  const g = card.garden, b = bonus();
  const growing = () => save.plots.filter((p) => p.crop && !integrate(p, now).ripeAt);
  let result = { ok: true, effect: g.effect };
  switch (g.effect) {
    case 'waterAll':
    case 'waterAllLong': {
      const ms = WATER_MS * (g.effect === 'waterAllLong' ? 2 : 1) * (1 + b.water);
      for (const p of save.plots) if (p.open) { settle(p, now); p.wet = Math.max(p.wet || 0, now + ms); }
      result.msg = `Watered! Plants grow 50% faster for ${fmtDuration(ms)}.`;
      break;
    }
    case 'speedOne': {
      const p = save.plots[target];
      if (!p?.crop || integrate(p, now).ripeAt) return fail('Pick a plant that is still growing.');
      settle(p, now);
      p.crop.prog = Math.min(p.crop.need, p.crop.prog + g.minutes);
      if (p.crop.prog >= p.crop.need) p.crop.ripeAt = now;
      result.msg = `${CARD[p.crop.id].name} jumped ahead ${g.minutes} minutes.`;
      break;
    }
    case 'doubleNext':
      if (save.boosts.double) return fail('Your next harvest is already doubled.');
      save.boosts.double = true;
      result.msg = 'Your next harvest pays double.';
      break;
    case 'harvestAll': {
      const r = harvestAll(now);
      if (!r.ok) return r;
      result = { ...r, effect: g.effect };
      break;
    }
    case 'growBoost':
      settleAll(now);
      save.boosts.growUntil = now + g.hours * H;
      result.msg = `Greenhouse up: +50% growth for ${g.hours} h.`;
      break;
    case 'coinBoost':
      save.boosts.coinUntil = now + g.hours * H;
      result.msg = `+50% harvest coins for ${g.hours} h.`;
      break;
    case 'ripenAll': {
      const list = growing();
      if (!list.length) return fail('Nothing is growing.');
      for (const p of list) { settle(p, now); p.crop.prog = p.crop.need; p.crop.ripeAt = now; }
      result.msg = 'Everything ripened at once!';
      break;
    }
  }
  if (g.cd) save.toolReady[id] = now + powerCooldown(card);
  commit();
  return result;
}

// ---------------------------------------------------------------------------
// XP & coins
// ---------------------------------------------------------------------------
/** Level-up reward: coins, plus a pack (a Bundle every 5th level). */
export function levelReward(level) {
  return { coins: 25 * level, pack: level % 5 === 0 ? 'bundle' : 'basic' };
}

function addXp(xp) {
  const before = levelInfo().level;
  save.xp += xp;
  const after = levelInfo().level;
  const levelUps = [];
  for (let L = before + 1; L <= after; L++) {
    const r = levelReward(L);
    save.coins += r.coins;
    save.packs[r.pack]++;
    levelUps.push({ level: L, ...r });
  }
  if (levelUps.length) emit('levelup', levelUps);
  return { levelUps };
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------
const BY_RARITY = Object.fromEntries(RARITY_ORDER.map((r) => [r, CARDS.filter((c) => c.rarity === r)]));

function rollRarity(min) {
  const luck = bonus().luck;
  const allowed = RARITY_ORDER.slice(min ? RARITY_ORDER.indexOf(min) : 0);
  const w = allowed.map((r) => RARITIES[r].weight * (RARITY_ORDER.indexOf(r) >= 2 ? 1 + luck : 1));
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < allowed.length; i++) { x -= w[i]; if (x <= 0) return allowed[i]; }
  return allowed[allowed.length - 1];
}

/** Within a rarity, cards you don't have yet are twice as likely. */
function pickCard(rarity) {
  const pool = BY_RARITY[rarity];
  const w = pool.map((c) => (save.cards[c.id] ? 1 : 2));
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

export function buyPack(kind) {
  const p = PACKS[kind];
  if (playerLevel() < p.level) return fail(`Unlocks at level ${p.level}.`);
  if (save.coins < p.price) return fail(`Needs ${p.price} coins.`);
  save.coins -= p.price;
  save.packs[kind]++;
  commit();
  return { ok: true };
}

/** Open one pack you own. Returns the cards in reveal order (best last). */
export function openPack(kind) {
  const p = PACKS[kind];
  if (!(save.packs[kind] > 0)) return fail('No pack to open.');
  save.packs[kind]--;
  const rolls = [];
  for (let i = 0; i < p.size; i++) {
    const min = i === p.size - 1 ? p.guarantee : null;
    rolls.push({ card: pickCard(rollRarity(min)), foil: Math.random() < FOIL_CHANCE });
  }
  rolls.sort((a, b) => RARITY_ORDER.indexOf(a.card.rarity) - RARITY_ORDER.indexOf(b.card.rarity));
  const now = Date.now();
  const results = rolls.map(({ card, foil }) => {
    const have = save.cards[card.id];
    const r = { card, foil, isNew: !have, levelBefore: have ? levelFromCopies(have.n).level : 0, coins: 0 };
    if (!have) save.cards[card.id] = { n: 1, at: now, seen: false };
    else {
      if (r.levelBefore >= MAX_LEVEL) { r.coins = MAXED_COINS[card.rarity]; save.coins += r.coins; }
      have.n++;
    }
    if (foil) save.cards[card.id].foil = true;
    r.levelAfter = levelFromCopies(save.cards[card.id].n).level;
    r.progress = levelFromCopies(save.cards[card.id].n);
    return r;
  });
  save.stats.packs++;
  // New plants grow faster as they level, so re-plantings pick it up; also
  // auto-fill an empty deck slot with a brand-new battle card.
  for (const r of results) {
    if (r.isNew && r.card.type !== 'decor' && save.deck.length < DECK_SIZE && !save.deck.includes(r.card.id)) save.deck.push(r.card.id);
  }
  commit();
  return { ok: true, kind, results };
}

export const freePackIn = (now = Date.now()) => Math.max(0, save.freePackAt - now);
export function claimFreePack(now = Date.now()) {
  if (freePackIn(now) > 0) return fail('Not ready yet.');
  save.packs.basic++;
  save.freePackAt = now + FREE_PACK_MS;
  commit();
  return { ok: true };
}

export function markSeen(id) {
  if (save.cards[id] && !save.cards[id].seen) { save.cards[id].seen = true; lsSet(KEY, save); }
}

// ---------------------------------------------------------------------------
// Daily login streak (7-day cycle; missing a day starts over)
// ---------------------------------------------------------------------------
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Claims today's reward if it hasn't been claimed. Returns { day, reward } or null. */
export function claimStreak(now = new Date()) {
  const today = dayKey(now);
  if (save.streak.day === today) return null;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const count = save.streak.day === dayKey(y) ? (save.streak.count % 7) + 1 : 1;
  const reward = STREAK_REWARDS[count - 1];
  save.streak = { day: today, count };
  if (reward.coins) save.coins += reward.coins;
  if (reward.pack) save.packs[reward.pack]++;
  commit();
  return { day: count, reward };
}

// ---------------------------------------------------------------------------
// Deck & battles
// ---------------------------------------------------------------------------
export function setDeck(ids) {
  const deck = [...new Set(ids)].filter((id) => owned(id) && CARD[id].type !== 'decor').slice(0, DECK_SIZE);
  save.deck = deck;
  commit();
  return { ok: true };
}

export function battleReward(stage, first) {
  const k = first ? 1 : 0.4;
  return {
    coins: Math.round((60 + 25 * stage) * k),
    xp: Math.round((15 + 6 * stage) * k),
    pack: first ? (stage % 5 === 0 ? 'bundle' : stage % 3 === 0 ? 'basic' : null) : null,
  };
}

/** Record a finished battle. Returns the rewards given. */
export function finishBattle(stage, won, pests) {
  save.stats.pests += pests;
  let r;
  if (won) {
    const first = stage > save.stage;
    r = { won, first, ...battleReward(stage, first) };
    if (first) save.stage = stage;
    save.stats.wins++;
  } else {
    r = { won, first: false, coins: Math.min(40, 5 + pests), xp: 5, pack: null };
  }
  save.coins += r.coins;
  if (r.pack) save.packs[r.pack]++;
  Object.assign(r, addXp(r.xp));
  commit();
  return r;
}

export function setPref(k, v) { save.prefs[k] = v; commit(); }

/** Start over (used from settings, with a confirm). */
export function resetSave() {
  save = fresh();
  commit();
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function fmtDuration(ms) {
  const m = Math.ceil(ms / M);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? `${h}h ${r}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}
export const fmt = (n) => Math.round(n).toLocaleString();

// ---------------------------------------------------------------------------
// Sync with the game's own Gist
// ---------------------------------------------------------------------------
let status = { state: 'off', msg: '' };
let busy = false, again = false, pushTimer = 0;
let resolver = null;
export const syncStatus = () => status;
/** UI hook for a true conflict: fn(local, cloud) → Promise<'local' | 'cloud'>. */
export function setConflictResolver(fn) { resolver = fn; }

function setStatus(state, msg = '') { status = { state, msg }; emit('sync', status); }
const getMeta = () => lsGet(META) || {};
function setBase(stamp) { lsSet(META, { gist: gist.getGistId(), base: stamp }); }

/** Short summary for the "which save?" prompt. */
export function describe(s) {
  return { level: levelInfo(s.xp).level, coins: s.coins, cards: Object.keys(s.cards || {}).length, stage: s.stage, savedAt: s.savedAt };
}

function schedulePush() {
  if (!gist.getToken()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => sync(), 4000);
}

async function push() {
  const stamp = save.savedAt;
  await gist.writeFile(FILE, save);
  setBase(stamp);
}

function adopt(cloud) {
  save = normalize(cloud);
  lsSet(KEY, save);
  setBase(save.savedAt);
  emit('change', { remote: true });
}

/** Pull/push as needed. Safe to call often. */
export async function sync() {
  clearTimeout(pushTimer);
  pushTimer = 0;
  if (!gist.getToken()) { setStatus('off'); return; }
  if (busy) { again = true; return; }
  busy = true;
  setStatus('syncing');
  try {
    if (!gist.getGistId()) {
      const found = await gist.findByFile(FILE);
      if (!found) { const stamp = save.savedAt; await gist.createGist(FILE, save); setBase(stamp); setStatus('synced'); return; }
    }
    const meta = getMeta();
    const base = meta.gist === gist.getGistId() ? meta.base || 0 : 0;
    const cloud = await gist.readFile(FILE);
    if (!cloud || !cloud.savedAt) await push();
    else if (cloud.savedAt === save.savedAt && cloud.by === save.by) setBase(save.savedAt);
    else {
      const cloudChanged = cloud.savedAt > base, localChanged = save.savedAt > base;
      if (!base && !(save.n > 0)) adopt(cloud); // brand-new device: take the cloud save
      else if (cloudChanged && !localChanged) adopt(cloud);
      else if (localChanged && !cloudChanged) await push();
      else {
        // Both changed since the last sync. Ask; default to the newest.
        const pick = resolver ? await resolver(describe(save), describe(cloud)) : cloud.savedAt > save.savedAt ? 'cloud' : 'local';
        if (pick === 'cloud') adopt(cloud);
        else { save.savedAt = Math.max(Date.now(), cloud.savedAt + 1); save.by = DEVICE; lsSet(KEY, save); await push(); }
      }
    }
    setStatus('synced');
  } catch (e) {
    console.warn('sync', e);
    setStatus(e.kind === 'network' ? 'offline' : 'error', e.message || 'Sync failed');
  } finally {
    busy = false;
    if (again) { again = false; schedulePush(); }
  }
}

/** Connect this device: token (if new) + optional existing Gist ID. */
export async function connect(token, gistId) {
  if (token) gist.setToken(token);
  if (gistId) gist.setGistId(gistId);
  await sync();
  return status;
}
export function disconnect() { gist.setGistId(''); try { localStorage.removeItem(META); } catch { /* blocked */ } setStatus('off'); }

// Save on the way out; pull fresh when coming back.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (pushTimer) sync(); } else sync();
  });
  addEventListener('online', () => sync());
}
