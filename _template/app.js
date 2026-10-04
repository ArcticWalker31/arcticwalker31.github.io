// app.js — app logic.
//
// STORAGE RULE: every app on this site shares one browser origin, so they all
// share one localStorage. Always prefix keys with this app's own namespace so
// apps can't overwrite each other's data. (The habit tracker uses "ht.".)

const NS = 'template.'; // TODO: change to a short unique prefix, e.g. 'budget.'

/** localStorage, namespaced and safe (storage can throw in private mode). */
const store = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(NS + key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};

// --- Example: delete everything below and build your app. ---
const countEl = document.getElementById('count');
let count = store.get('count', 0);
countEl.textContent = count;

document.getElementById('tap').addEventListener('click', () => {
  count += 1;
  store.set('count', count);
  countEl.textContent = count;
});
