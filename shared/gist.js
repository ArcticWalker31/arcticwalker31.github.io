// gist.js — shared GitHub Gist storage for apps on this site.
//
// Apps sync through ONE private Gist, one file per app (habits.json,
// kyber.json, …). The token and Gist ID are the ones the Habits app saves
// (localStorage keys "ht.token" / "ht.gistId"), so setting up sync once
// covers every app on this device.
//
// Only the named file is ever written, so apps never touch each other's data.

const API = 'https://api.github.com';
const KEYS = { token: 'ht.token', gistId: 'ht.gistId' };

function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
function lsSet(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* blocked */ } }

export const getToken = () => lsGet(KEYS.token);
export const setToken = (t) => lsSet(KEYS.token, (t || '').trim());
export const getGistId = () => lsGet(KEYS.gistId);
export const setGistId = (id) => lsSet(KEYS.gistId, (id || '').trim().split('/').filter(Boolean).pop() || '');
export const isConfigured = () => !!(getToken() && getGistId());

/** Error with kind: 'auth' | 'notfound' | 'network' | 'http' | 'format'. */
export class GistError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  if (!token) throw new GistError('auth', 'No GitHub token set');
  let res;
  try {
    res = await fetch(API + path, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new GistError('network', 'Network unavailable');
  }
  if (res.status === 401) throw new GistError('auth', 'Token invalid or expired');
  if (res.status === 403) throw new GistError('auth', 'Token lacks Gist permission (or rate limited)');
  if (res.status === 404) throw new GistError('notfound', 'Gist not found (check the ID and token)');
  if (!res.ok) throw new GistError('http', `GitHub error ${res.status}`);
  return res.json();
}

/** Read one JSON file from the Gist. Resolves to null if the file doesn't exist yet. */
export async function readFile(name) {
  const json = await api(`/gists/${encodeURIComponent(getGistId())}`);
  const file = json.files?.[name];
  if (!file) return null;
  let text = file.content;
  if (file.truncated) text = await (await fetch(file.raw_url, { cache: 'no-store' })).text();
  try { return JSON.parse(text); } catch { throw new GistError('format', `${name} is not valid JSON`); }
}

/** Write (create or replace) one JSON file in the Gist. Other files are untouched. */
export async function writeFile(name, data) {
  await api(`/gists/${encodeURIComponent(getGistId())}`, {
    method: 'PATCH',
    body: { files: { [name]: { content: JSON.stringify(data, null, 1) } } },
  });
}

/** Create a new secret Gist holding one file; saves and returns its ID. */
export async function createGist(name, data) {
  const json = await api('/gists', {
    method: 'POST',
    body: { description: 'Personal app data', public: false, files: { [name]: { content: JSON.stringify(data, null, 1) } } },
  });
  setGistId(json.id);
  return json.id;
}

/**
 * A client for a SEPARATE Gist (same GitHub token, its own Gist ID saved under
 * `gistKey`). Used by apps that shouldn't share the main Gist, e.g. the game.
 * Same methods as the module-level functions above.
 */
export function gistClient(gistKey, description = 'Personal app data') {
  const getId = () => lsGet(gistKey);
  const setId = (id) => lsSet(gistKey, (id || '').trim().split('/').filter(Boolean).pop() || '');
  return {
    getToken,
    setToken,
    getGistId: getId,
    setGistId: setId,
    isConfigured: () => !!(getToken() && getId()),
    async readFile(name) {
      const json = await api(`/gists/${encodeURIComponent(getId())}`);
      const file = json.files?.[name];
      if (!file) return null;
      let text = file.content;
      if (file.truncated) text = await (await fetch(file.raw_url, { cache: 'no-store' })).text();
      try { return JSON.parse(text); } catch { throw new GistError('format', `${name} is not valid JSON`); }
    },
    async writeFile(name, data) {
      await api(`/gists/${encodeURIComponent(getId())}`, {
        method: 'PATCH',
        body: { files: { [name]: { content: JSON.stringify(data) } } },
      });
    },
    async createGist(name, data) {
      const json = await api('/gists', {
        method: 'POST',
        body: { description, public: false, files: { [name]: { content: JSON.stringify(data) } } },
      });
      setId(json.id);
      return json.id;
    },
    /** Look through your Gists for one holding `name`; saves and returns its ID (or ''). */
    async findByFile(name) {
      const list = await api('/gists?per_page=100');
      const hit = list.find((g) => g.files && g.files[name]);
      if (hit) setId(hit.id);
      return hit ? hit.id : '';
    },
  };
}
