// store.js — Kyber Stock data, local cache and Gist sync. No DOM rendering.
//
// Data (kyber.json in the shared Gist):
// {
//   version: 1,
//   colors: [{ id, name, hex, count, low }],   // display order
//   sevenPack: ['white', 'red', …]             // the fixed 7-pack set
// }
//
// Every change is an "op". Counts change by DELTAS (+3, −1), which are
// replayed onto the latest Gist copy when saving, so taps on the phone and
// the laptop add up instead of overwriting each other.
//   { t: 'delta', id, n }                 add n (negative = use)
//   { t: 'set', id, value }               exact correction
//   { t: 'color', color: {id,name,hex,low} } add / edit a color (not its count)
//   { t: 'remove', id }                   delete a color
//   { t: 'seven', ids }                   change the 7-pack contents

import * as G from '../shared/gist.js?v=3';

export const FILE = 'kyber.json';
const NS = 'ks.';
const SAVE_DEBOUNCE_MS = 1000;
const RETRY_MS = [5000, 15000, 60000, 300000];

export const DEFAULT_COLORS = [
  { id: 'purple', name: 'Purple', hex: '#8B5CF6' },
  { id: 'orange', name: 'Orange', hex: '#F97316' },
  { id: 'black', name: 'Black', hex: '#2B2B33' },
  { id: 'red', name: 'Red', hex: '#EF4444' },
  { id: 'yellow', name: 'Yellow', hex: '#FACC15' },
  { id: 'green', name: 'Green', hex: '#22C55E' },
  { id: 'blue', name: 'Blue', hex: '#3B82F6' },
  { id: 'pink', name: 'Pink', hex: '#EC4899' },
  { id: 'white', name: 'White', hex: '#F4F6FA' },
];

export function defaultData() {
  return {
    version: 1,
    colors: DEFAULT_COLORS.map((c) => ({ ...c, count: 0, low: 3 })),
    sevenPack: ['white', 'red', 'yellow', 'green', 'blue', 'pink', 'black'],
  };
}

export function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : defaultData();
  d.version ??= 1;
  d.colors = Array.isArray(d.colors) ? d.colors : [];
  for (const c of d.colors) { c.count = Number(c.count) || 0; c.low = Number.isFinite(+c.low) ? +c.low : 3; }
  d.sevenPack = Array.isArray(d.sevenPack) ? d.sevenPack : [];
  return d;
}

export function applyOp(d, op) {
  const find = (id) => d.colors.find((c) => c.id === id);
  switch (op.t) {
    case 'delta': { const c = find(op.id); if (c) c.count += op.n; break; }
    case 'set': { const c = find(op.id); if (c) c.count = op.value; break; }
    case 'color': {
      const c = find(op.color.id);
      if (c) Object.assign(c, { name: op.color.name, hex: op.color.hex, low: op.color.low });
      else d.colors.push({ ...op.color, count: 0 });
      break;
    }
    case 'remove':
      d.colors = d.colors.filter((c) => c.id !== op.id);
      d.sevenPack = d.sevenPack.filter((id) => id !== op.id);
      break;
    case 'seven': d.sevenPack = [...op.ids]; break;
  }
  return d;
}

// ----- local storage -----
const lsGet = (k, f) => { try { return JSON.parse(localStorage.getItem(NS + k)) ?? f; } catch { return f; } };
const lsSet = (k, v) => { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch { /* blocked */ } };

let data = normalize(lsGet('cache', null) || defaultData());
let pending = lsGet('pending', []);
let state = { status: G.isConfigured() ? 'saved' : 'setup', message: '' };
let saveTimer = 0, retryTimer = 0, retries = 0, inFlight = null;
const listeners = new Set();

export const getData = () => data;
export const getStatus = () => state;
export const hasPending = () => pending.length > 0;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = (e) => listeners.forEach((fn) => fn(e));
function setStatus(status, message = '') { state = { status, message }; emit({ type: 'status', ...state }); }
function persist() { lsSet('cache', data); lsSet('pending', pending); }

/** Apply changes locally at once; save to the Gist shortly after (debounced). */
export function commit(...ops) {
  for (const op of ops) { applyOp(data, op); pending.push(op); }
  persist();
  emit({ type: 'data' });
  if (!G.isConfigured()) return;
  setStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(sync, SAVE_DEBOUNCE_MS);
}

export function sync() {
  if (inFlight) return inFlight.then(() => (pending.length ? sync() : undefined));
  clearTimeout(saveTimer);
  clearTimeout(retryTimer);
  if (!G.isConfigured()) { setStatus('setup'); return Promise.resolve(); }
  inFlight = run().finally(() => { inFlight = null; });
  return inFlight;
}

async function run() {
  try {
    const remote = await G.readFile(FILE);
    const sending = pending.slice();
    let base;
    if (!remote) {
      // First sync for this Gist: upload what this device has.
      base = structuredClone(data);
      await G.writeFile(FILE, base);
      pending = pending.slice(sending.length);
    } else {
      base = normalize(remote);
      if (sending.length) {
        for (const op of sending) applyOp(base, op);
        await G.writeFile(FILE, base);
        pending = pending.slice(sending.length);
      }
    }
    data = structuredClone(base);
    for (const op of pending) applyOp(data, op);
    persist();
    emit({ type: 'data' });
    retries = 0;
    if (pending.length) saveTimer = setTimeout(sync, SAVE_DEBOUNCE_MS);
    else setStatus('saved');
  } catch (err) {
    const kind = err instanceof G.GistError ? err.kind : 'http';
    if (kind === 'network' || !navigator.onLine) { setStatus('offline', 'Offline: changes will sync when you reconnect'); return; }
    setStatus('error', err.message || 'Sync failed');
    if (!['auth', 'notfound', 'format'].includes(kind)) retryTimer = setTimeout(sync, RETRY_MS[Math.min(retries++, RETRY_MS.length - 1)]);
  }
}

/** Sync now, when the app comes back to the foreground, and when back online. */
export function startAutoSync() {
  addEventListener('online', () => sync());
  addEventListener('offline', () => { if (G.isConfigured()) setStatus('offline', 'Offline: changes will sync when you reconnect'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' || pending.length) sync(); });
  return sync();
}

/** Connect this device to the Gist (token + ID), then pull. */
export async function connect(token, gistId) {
  if (token) G.setToken(token);
  if (gistId) G.setGistId(gistId);
  setStatus(G.isConfigured() ? 'saving' : 'setup');
  return sync();
}

/** Create a new secret Gist with this device's data. */
export async function createAndConnect(token) {
  if (token) G.setToken(token);
  await G.createGist(FILE, data);
  pending = [];
  persist();
  setStatus('saved');
}

export { G as gist };
