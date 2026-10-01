// data.js — everything about habit data: dates, completion rules, local
// storage, the GitHub Gist API, and background sync.
//
// This module never touches the page's DOM, so the future dashboard page can
// import it as-is. UI code talks to it through:
//   getData(), subscribe(fn), commit(op), sync(), startAutoSync()
// plus the pure helpers (dateKey, isComplete, dayProgress, ...).

export const GIST_FILE = 'habits.json';
const API = 'https://api.github.com';

// ---------------------------------------------------------------------------
// localStorage helpers. Every access is wrapped: storage can throw in private
// mode or when blocked, and the app should still run (just without caching).
// ---------------------------------------------------------------------------

const KEYS = {
  token: 'ht.token',
  gistId: 'ht.gistId',
  cache: 'ht.cache',     // last known full data object (JSON)
  pending: 'ht.pending', // ops not yet written to the Gist (JSON array)
};

function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, value) {
  try {
    if (value == null || value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage unavailable: ignore */ }
}
function lsGetJSON(key, fallback) {
  try { return JSON.parse(lsGet(key)) ?? fallback; } catch { return fallback; }
}

export const getToken = () => lsGet(KEYS.token) || '';
export const setToken = (t) => lsSet(KEYS.token, (t || '').trim());
export const getGistId = () => lsGet(KEYS.gistId) || '';
export const isConfigured = () => !!(getToken() && getGistId());

// ---------------------------------------------------------------------------
// Dates. Keys are LOCAL calendar dates "YYYY-MM-DD".
// Never use toISOString() here: it converts to UTC and would put
// late-evening entries on the wrong day.
// ---------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');

/** Local-date key for a Date object. */
export function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a key back into a local Date at midnight. */
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Shift a key by n days (n can be negative). */
export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/**
 * The "logical" today. Before `dayStartHour` (e.g. 3 = 3 AM) it's still
 * yesterday, so late-night logging lands on the day you'd expect.
 */
export function todayKey(dayStartHour = 0, now = new Date()) {
  const d = new Date(now.getTime());
  d.setHours(d.getHours() - dayStartHour);
  return dateKey(d);
}

// ---------------------------------------------------------------------------
// Data model & completion rules
//
// {
//   version: 1,
//   settings: { dayStartHour: 3 },
//   habits: [ { id, name, type: 'check'|'minutes'|'count',
//               createdAt: 'YYYY-MM-DD',
//               goals: [ { from: 'YYYY-MM-DD', value: number } ],  // minutes/count only
//               archived?: true, archivedAt?: 'YYYY-MM-DD' } ],
//   log: { 'YYYY-MM-DD': { habitId: true|false|number } }
// }
//
// Array order of `habits` is display order.
// `goals` is a history: the goal in effect on a date is the last entry whose
// `from` <= that date, so editing a goal never rewrites past results.
// A habit with no entry in log[date] is "not logged" (different from
// logged-but-incomplete).
// ---------------------------------------------------------------------------

export function defaultData(today = todayKey(3)) {
  return {
    version: 1,
    settings: { dayStartHour: 3 },
    habits: [
      { id: 'workout', name: 'Workout', type: 'check', createdAt: today },
      { id: 'meditate', name: 'Meditate / Yoga', type: 'check', createdAt: today },
      { id: 'insta', name: 'Instagram', type: 'minutes', createdAt: today,
        goals: [{ from: today, value: 60 }] },
      { id: 'water', name: 'Owala refills', type: 'count', createdAt: today,
        goals: [{ from: today, value: 3 }] },
    ],
    log: {},
  };
}

/**
 * Fill in missing fields so the rest of the code can rely on them.
 * Also accepts the simpler shape (habit.max / habit.target instead of goals)
 * in case the Gist is ever edited by hand.
 */
export function normalize(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  data.version ??= 1;
  data.settings = { dayStartHour: 3, ...(data.settings || {}) };
  data.habits = Array.isArray(data.habits) ? data.habits : [];
  data.log = data.log && typeof data.log === 'object' ? data.log : {};
  for (const h of data.habits) {
    if (h.type !== 'check' && !Array.isArray(h.goals)) {
      const v = h.type === 'minutes' ? h.max : h.target;
      h.goals = v != null ? [{ from: h.createdAt || '0000-00-00', value: Number(v) }] : [];
    }
  }
  return data;
}

/** Goal (max minutes / target count) in effect on `date`. */
export function effectiveGoal(habit, date) {
  const goals = habit.goals || [];
  let value = goals.length ? goals[0].value : null; // before first goal: use earliest
  for (const g of goals) if (g.from <= date) value = g.value;
  return value ?? habit.max ?? habit.target ?? null;
}

/** Is `value` a completed result for this habit on `date`? */
export function isComplete(habit, value, date) {
  if (value == null) return false;
  const goal = effectiveGoal(habit, date);
  switch (habit.type) {
    case 'check': return value === true;
    case 'minutes': return goal != null && value <= goal; // at or under the limit
    case 'count': return goal != null && value >= goal;
    default: return false;
  }
}

/** 'none' (not logged) | 'done' | 'incomplete' (logged but not complete). */
export function habitStatus(habit, dayLog, date) {
  const value = dayLog?.[habit.id];
  if (value == null) return 'none';
  return isComplete(habit, value, date) ? 'done' : 'incomplete';
}

/** Did this habit exist (and wasn't archived yet) on `date`? */
export function isActiveOn(habit, date) {
  if (habit.createdAt && date < habit.createdAt) return false;
  if (habit.archived) return !!habit.archivedAt && date < habit.archivedAt;
  return true;
}

export function activeHabitsOn(data, date) {
  return data.habits.filter((h) => isActiveOn(h, date));
}

/** { done, total } for a day, counting only habits active that day. */
export function dayProgress(data, date) {
  const habits = activeHabitsOn(data, date);
  const dayLog = data.log[date] || {};
  const done = habits.filter((h) => habitStatus(h, dayLog, date) === 'done').length;
  return { done, total: habits.length };
}

/** URL-safe unique id from a name ("Read 20 min" -> "read-20-min"). */
export function makeHabitId(name, habits) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'habit';
  let id = base;
  for (let i = 2; habits.some((h) => h.id === id); i++) id = `${base}-${i}`;
  return id;
}

// ---------------------------------------------------------------------------
// Ops: every change is a small, replayable operation. They're applied locally
// at once, queued, and replayed onto the freshest Gist copy when saving. That
// way a save only touches the keys I changed and never clobbers edits made on
// the other device.
//
//   { t: 'log', date, habitId, value }   value null = remove entry
//   { t: 'habit', habit }                add or replace one habit definition
//   { t: 'order', ids }                  reorder habits
//   { t: 'settings', settings }          merge into settings
// ---------------------------------------------------------------------------

export function applyOp(data, op) {
  switch (op.t) {
    case 'log': {
      const day = (data.log[op.date] ||= {});
      if (op.value == null) {
        delete day[op.habitId];
        if (!Object.keys(day).length) delete data.log[op.date];
      } else {
        day[op.habitId] = op.value;
      }
      break;
    }
    case 'habit': {
      // Whole-object replace: if both devices edit the SAME habit at the same
      // time, the last save wins. Fine for a single user.
      const habit = structuredClone(op.habit);
      const i = data.habits.findIndex((h) => h.id === habit.id);
      if (i >= 0) data.habits[i] = habit;
      else data.habits.push(habit);
      break;
    }
    case 'order': {
      const rank = new Map(op.ids.map((id, i) => [id, i]));
      // Habits not in the list (added elsewhere) keep their place at the end.
      data.habits.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
      break;
    }
    case 'settings':
      Object.assign(data.settings, op.settings);
      break;
  }
  return data;
}

// ---------------------------------------------------------------------------
// GitHub Gist API
// ---------------------------------------------------------------------------

/** Error with a `kind` the UI can show: 'auth' | 'notfound' | 'network' | 'http' | 'format'. */
export class SyncError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  if (!token) throw new SyncError('auth', 'No GitHub token set');
  let res;
  try {
    res = await fetch(API + path, {
      method,
      cache: 'no-store', // always read the latest version, never a cached one
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SyncError('network', 'Network unavailable');
  }
  if (res.status === 401) throw new SyncError('auth', 'Token invalid or expired');
  if (res.status === 403) throw new SyncError('auth', 'Token lacks Gist permission (or rate limited)');
  if (res.status === 404) throw new SyncError('notfound', 'Gist not found (check the ID and token)');
  if (!res.ok) throw new SyncError('http', `GitHub error ${res.status}`);
  return res.json();
}

/** Create a new SECRET gist holding `data`. Returns the gist id. */
export async function createGist(data) {
  const json = await api('/gists', {
    method: 'POST',
    body: {
      description: 'Habit tracker data',
      public: false,
      files: { [GIST_FILE]: { content: JSON.stringify(data, null, 1) } },
    },
  });
  return json.id;
}

/** Read and parse habits.json from the gist. */
export async function fetchGist(id = getGistId()) {
  const json = await api(`/gists/${encodeURIComponent(id)}`);
  const file = json.files?.[GIST_FILE];
  if (!file) throw new SyncError('format', `Gist has no ${GIST_FILE} file`);
  let text = file.content;
  if (file.truncated) {
    // Only happens past ~1 MB (years of data), but handle it anyway.
    const raw = await fetch(file.raw_url, { cache: 'no-store' });
    text = await raw.text();
  }
  try {
    return normalize(JSON.parse(text));
  } catch {
    throw new SyncError('format', `${GIST_FILE} is not valid JSON`);
  }
}

export async function patchGist(data, id = getGistId()) {
  await api(`/gists/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { files: { [GIST_FILE]: { content: JSON.stringify(data, null, 1) } } },
  });
}

// ---------------------------------------------------------------------------
// Sync engine
//
// Status values: 'saved' | 'saving' | 'offline' | 'error' | 'setup' (not
// connected yet). Listeners get { type: 'data' } when data changes and
// { type: 'status', status, message } when sync status changes.
//
// Known limitation: Gists have no conditional writes (no "only save if
// unchanged"), so if both devices save within the same ~second, one write
// could be lost. Each save is fetch -> merge -> PATCH, so the window is tiny.
// ---------------------------------------------------------------------------

const SAVE_DEBOUNCE_MS = 1000;
const RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 300_000];

let data = normalize(lsGetJSON(KEYS.cache, null) || defaultData());
let pending = lsGetJSON(KEYS.pending, []);
let state = { status: isConfigured() ? 'saved' : 'setup', message: '' };
let saveTimer = null;
let retryTimer = null;
let retryCount = 0;
let inFlight = null; // the running sync promise, if any
const listeners = new Set();

export const getData = () => data;
export const getStatus = () => state;
export const hasPending = () => pending.length > 0;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(event) {
  for (const fn of listeners) fn(event);
}
function setStatus(status, message = '') {
  state = { status, message };
  emit({ type: 'status', ...state });
}
function persist() {
  lsSet(KEYS.cache, JSON.stringify(data));
  lsSet(KEYS.pending, JSON.stringify(pending));
}

/** Apply a change locally right away and schedule a (debounced) save. */
export function commit(op) {
  applyOp(data, op);
  pending.push(op);
  persist();
  emit({ type: 'data' });
  if (!isConfigured()) return; // kept locally until a Gist is connected
  setStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => sync(), SAVE_DEBOUNCE_MS);
}

/**
 * Pull the latest Gist and push any queued ops. Safe to call any time;
 * concurrent calls share the run in progress (then re-run if new ops arrived).
 */
export function sync() {
  if (inFlight) return inFlight.then(() => (pending.length ? sync() : undefined));
  clearTimeout(saveTimer);
  clearTimeout(retryTimer);
  if (!isConfigured()) {
    setStatus('setup');
    return Promise.resolve();
  }
  inFlight = runSync().finally(() => { inFlight = null; });
  return inFlight;
}

async function runSync() {
  const hadPending = pending.length > 0;
  if (hadPending) setStatus('saving');
  try {
    const remote = await fetchGist();
    const sending = pending.slice();
    if (sending.length) {
      for (const op of sending) applyOp(remote, op);
      await patchGist(remote);
      // Ops committed while we were saving stay queued.
      pending = pending.slice(sending.length);
    }
    // Local view = latest remote + anything still unsent.
    data = structuredClone(remote);
    for (const op of pending) applyOp(data, op);
    persist();
    emit({ type: 'data' });
    retryCount = 0;
    if (pending.length) {
      saveTimer = setTimeout(() => sync(), SAVE_DEBOUNCE_MS);
    } else {
      setStatus('saved');
    }
  } catch (err) {
    handleSyncError(err);
  }
}

function handleSyncError(err) {
  const kind = err instanceof SyncError ? err.kind : 'http';
  if (kind === 'network' || !navigator.onLine) {
    // Retried automatically by the 'online' listener in startAutoSync.
    setStatus('offline', 'Offline: changes will sync when you reconnect');
    return;
  }
  setStatus('error', err.message || 'Sync failed');
  // Auth/not-found won't fix themselves; everything else retries with backoff.
  if (kind !== 'auth' && kind !== 'notfound' && kind !== 'format') {
    const delay = RETRY_DELAYS_MS[Math.min(retryCount++, RETRY_DELAYS_MS.length - 1)];
    retryTimer = setTimeout(() => sync(), delay);
  }
}

/** Create a new secret Gist from the current local data and connect to it. */
export async function createAndConnectGist() {
  const id = await createGist(data);
  lsSet(KEYS.gistId, id);
  pending = []; // everything local is now in the new gist
  persist();
  setStatus('saved');
  return id;
}

/**
 * Connect to an existing Gist (e.g. from a second device). Local unsynced
 * changes are dropped, and the Gist becomes the source of truth.
 */
export async function connectGist(id) {
  id = (id || '').trim();
  // Accept a full gist URL too: take the last path segment.
  id = id.split('/').filter(Boolean).pop() || '';
  const remote = await fetchGist(id); // throws if bad id/token
  lsSet(KEYS.gistId, id);
  pending = [];
  data = remote;
  persist();
  emit({ type: 'data' });
  setStatus('saved');
  return id;
}

/** Forget the Gist connection (the Gist itself is untouched). */
export function disconnectGist() {
  lsSet(KEYS.gistId, null);
  setStatus('setup');
}

/**
 * Keep data fresh: sync now, when the app comes back to the foreground, and
 * when the network returns. Call once from the page.
 */
export function startAutoSync() {
  window.addEventListener('online', () => sync());
  window.addEventListener('offline', () => {
    if (isConfigured()) setStatus('offline', 'Offline: changes will sync when you reconnect');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
    // Leaving the app with a save pending: try to flush it right away.
    else if (pending.length && isConfigured()) sync();
  });
  return sync();
}
