// util.js — storage, the relay, time formatting and distance helpers.

// localStorage is shared by every app on this site, so keys are prefixed.
const NS = 'campus.';
export const store = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(NS + key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch { /* storage blocked */ }
  },
};

// ---------------------------------------------------------------------------
// Relay (Cloudflare Worker, see worker/worker.js). BT and the RecSports
// hours feed block direct browser requests, so those go through it.
// ---------------------------------------------------------------------------

export const getRelay = () => (store.get('relay', '') || '').trim().replace(/\/+$/, '');
export const hasRelay = () => !!getRelay();

export class NeedsRelay extends Error {
  constructor() { super('Bus relay not set up'); }
}

/** Fetch `url` through the relay. `form` (object) makes it a form POST. */
export async function relayFetch(url, { form } = {}) {
  const relay = getRelay();
  if (!relay) throw new NeedsRelay();
  const init = form
    ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() }
    : {};
  const res = await fetch(`${relay}/?url=${encodeURIComponent(url)}`, { ...init, cache: 'no-store' });
  if (!res.ok) throw new Error(`Relay error ${res.status}`);
  return res;
}

export async function getJSON(url, opts) {
  const res = await fetch(url, { cache: 'no-store', ...opts });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Time (device-local; Blacksburg)
// ---------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "5:15 PM" (":00" dropped → "5 PM") */
export function clock(d, { short = true } = {}) {
  const h = d.getHours(), m = d.getMinutes();
  const mm = short && m === 0 ? '' : `:${pad(m)}`;
  return `${h % 12 || 12}${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "in 6 min", "in 1 h 20 min" */
export function inTime(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Date for "HH:MM:SS" on the given day key. */
export function atTime(day, hms) {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, m] = hms.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m);
}

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

export function distanceM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "350 ft" / "0.4 mi" */
export function fmtDistance(m) {
  const ft = m * 3.281;
  return ft < 1000 ? `${Math.round(ft / 10) * 10} ft` : `${(m / 1609).toFixed(1)} mi`;
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location not supported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

/** Escape text for innerHTML templates. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
