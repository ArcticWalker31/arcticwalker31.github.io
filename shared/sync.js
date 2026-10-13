// sync.js — a small synced store for apps on this site.
//
// Local-first: changes ("ops") apply instantly, are cached in localStorage,
// and are replayed onto the latest copy of the app's file in the shared
// private Gist (see gist.js) on save. Replaying ops — instead of uploading the
// whole local copy — means edits from the phone and the laptop merge.
//
//   const store = createStore({ file, ns, defaults, normalize, applyOp });
//   store.commit(op1, op2…); store.subscribe(fn); store.startAutoSync();

import * as G from './gist.js';

const SAVE_DEBOUNCE_MS = 1000;
const RETRY_MS = [5000, 15000, 60000, 300000];

export function createStore({ file, ns, defaults, normalize, applyOp }) {
  const lsGet = (k, f) => { try { return JSON.parse(localStorage.getItem(ns + k)) ?? f; } catch { return f; } };
  const lsSet = (k, v) => { try { localStorage.setItem(ns + k, JSON.stringify(v)); } catch { /* blocked */ } };

  let data = normalize(lsGet('cache', null) || defaults());
  let pending = lsGet('pending', []);
  let state = { status: G.isConfigured() ? 'saved' : 'setup', message: '' };
  let saveTimer = 0, retryTimer = 0, retries = 0, inFlight = null;
  const listeners = new Set();

  const emit = (e) => listeners.forEach((fn) => fn(e));
  const setStatus = (status, message = '') => { state = { status, message }; emit({ type: 'status', ...state }); };
  const persist = () => { lsSet('cache', data); lsSet('pending', pending); };

  function commit(...ops) {
    for (const op of ops) { applyOp(data, op); pending.push(op); }
    persist();
    emit({ type: 'data' });
    if (!G.isConfigured()) return;
    setStatus('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(sync, SAVE_DEBOUNCE_MS);
  }

  function sync() {
    if (inFlight) return inFlight.then(() => (pending.length ? sync() : undefined));
    clearTimeout(saveTimer);
    clearTimeout(retryTimer);
    if (!G.isConfigured()) { setStatus('setup'); return Promise.resolve(); }
    inFlight = run().finally(() => { inFlight = null; });
    return inFlight;
  }

  async function run() {
    try {
      const remote = await G.readFile(file);
      const sending = pending.slice();
      let base;
      if (!remote) {
        base = structuredClone(data); // first sync: upload this device's data
        await G.writeFile(file, base);
      } else {
        base = normalize(remote);
        if (sending.length) {
          for (const op of sending) applyOp(base, op);
          await G.writeFile(file, base);
        }
      }
      pending = pending.slice(sending.length);
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

  return {
    getData: () => data,
    getStatus: () => state,
    hasPending: () => pending.length > 0,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    commit,
    sync,
    startAutoSync() {
      addEventListener('online', () => sync());
      addEventListener('offline', () => { if (G.isConfigured()) setStatus('offline', 'Offline: changes will sync when you reconnect'); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' || pending.length) sync(); });
      return sync();
    },
    async connect(token, gistId) {
      if (token) G.setToken(token);
      if (gistId) G.setGistId(gistId);
      return sync();
    },
    async createAndConnect(token) {
      if (token) G.setToken(token);
      await G.createGist(file, data);
      pending = [];
      persist();
      setStatus('saved');
    },
    gist: G,
  };
}
