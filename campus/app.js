// app.js — Campus: tabs, rendering and refresh timers.
// Data comes from bt.js (buses), gym.js (RecSports) and dining.js.

import { store, hasRelay, getRelay, NeedsRelay, clock, inTime, distanceM, fmtDistance, getPosition, esc } from './util.js';
import * as BT from './bt.js';
import * as Gym from './gym.js';
import { getDining } from './dining.js';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);
const TITLES = { bus: 'Buses', gym: 'Gym', dining: 'Dining' };
const REFRESH_MS = { bus: 30_000, gym: 120_000, dining: 300_000 };
const MAP_REFRESH_MS = 10_000;
const NEARBY_COUNT = 3;

let tab = store.get('tab', 'bus');
let busView = store.get('busView', 'stops');
let favorites = store.get('favorites', []); // stop codes
let routes = {};
let stops = [];
let position = null;
const lastUpdated = {};
let timer = 0;

// ---------------------------------------------------------------------------
// Color schemes
// ---------------------------------------------------------------------------

const THEMES = {
  vt: { name: 'VT', swatches: ['#861F41', '#E5751F', '#FAF7F6'], bar: ['#FAF7F6', '#160D10'] },
  earthy: { name: 'Earthy', swatches: ['#60935D', '#493B2A', '#FEFFEA'], bar: ['#FEFFEA', '#2B231A'] },
  neutral: { name: 'Neutral', swatches: ['#14171C', '#8A9099', '#FFFFFF'], bar: ['#F5F6F8', '#0E1013'] },
};
let theme = THEMES[store.get('theme')] ? store.get('theme') : 'vt';

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  $('theme-color').setAttribute('content', THEMES[theme].bar[dark ? 1 : 0]);
}

// ---------------------------------------------------------------------------
// Tabs & refresh loop
// ---------------------------------------------------------------------------

function showTab(next) {
  tab = next;
  store.set('tab', tab);
  for (const b of document.querySelectorAll('.tabbar button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.dataset.tab !== tab;
  $('title').textContent = TITLES[tab];
  renderUpdated();
  refresh();
}

/** Refresh the visible tab now, then on its interval while the app is visible. */
async function refresh() {
  clearTimeout(timer);
  if (document.hidden) return;
  try {
    if (tab === 'bus') await refreshBus();
    if (tab === 'gym') await refreshGym();
    if (tab === 'dining') await refreshDining();
  } finally {
    const ms = tab === 'bus' && busView === 'map' ? MAP_REFRESH_MS : REFRESH_MS[tab];
    timer = setTimeout(refresh, ms);
  }
}

function markUpdated(which, note = '') {
  lastUpdated[which] = { at: Date.now(), note };
  renderUpdated();
}

function renderUpdated() {
  const u = lastUpdated[tab];
  if (!u) { $('updated').textContent = ''; return; }
  const sec = Math.round((Date.now() - u.at) / 1000);
  const ago = sec < 45 ? 'Updated just now' : `Updated ${Math.round(sec / 60)} min ago`;
  $('updated').textContent = u.note ? `${u.note} · ${ago}` : ago;
}

// ---------------------------------------------------------------------------
// Bus
// ---------------------------------------------------------------------------

function routeChip(code) {
  const r = routes[code] || { color: '#666', text: '#fff' };
  return `<span class="route-chip" style="background:${r.color};color:${r.text}">${esc(code)}</span>`;
}

async function ensureStops() {
  if (!routes || !Object.keys(routes).length) routes = await BT.getRoutes();
  if (!stops.length) stops = await BT.getStops();
}

async function refreshBus() {
  $('relay-setup').hidden = hasRelay();
  $('fav-section').hidden = !hasRelay();
  $('near-section').hidden = !hasRelay();
  if (!hasRelay()) return;
  try {
    await ensureStops();
    if (busView === 'map') return await refreshMap();

    // Where are we? (for "Nearby"). Failure just hides the section.
    position = await getPosition().catch(() => position);
    const nearby = position
      ? stops
          .filter((s) => !favorites.includes(s.code))
          .map((s) => ({ ...s, dist: distanceM(position, s) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, NEARBY_COUNT)
      : [];
    const favStops = favorites.map((c) => stops.find((s) => s.code === c)).filter(Boolean);

    // Departures for every stop shown, in parallel.
    const shown = [...favStops, ...nearby];
    const deps = await Promise.all(shown.map((s) => BT.getDepartures(s.code).catch(() => null)));
    const depsByCode = Object.fromEntries(shown.map((s, i) => [s.code, deps[i]]));

    $('fav-stops').innerHTML = favStops.length
      ? favStops.map((s) => stopCard(s, depsByCode[s.code])).join('')
      : '<p class="empty">Star a stop below, or tap “Add stop”, to keep it here.</p>';
    $('near-stops').innerHTML = position
      ? nearby.map((s) => stopCard(s, depsByCode[s.code])).join('')
      : '<p class="empty">Allow location to see the stops closest to you.</p>';
    markUpdated('bus');
  } catch (err) {
    showBusError(err);
  }
}

function stopCard(stop, deps) {
  const fav = favorites.includes(stop.code);
  const now = Date.now();
  let list;
  if (deps == null) list = '<p class="empty">Couldn’t load times.</p>';
  else if (!deps.length) list = '<p class="empty">No more buses scheduled today.</p>';
  else {
    list = `<ul class="deps">${deps.map((d) => {
      const ms = d.time - now;
      const due = ms < 60_000;
      const name = routes[d.route]?.name || d.pattern;
      return `<li class="dep">${routeChip(d.route)}<span class="route-name">${esc(name)}</span>
        <span class="eta${due ? ' due' : ''}">${due ? 'Due' : inTime(ms)}</span><span class="at">${clock(d.time, { short: false })}</span></li>`;
    }).join('')}</ul>`;
  }
  const meta = [`Stop ${esc(stop.code)}`, stop.dist != null ? fmtDistance(stop.dist) : ''].filter(Boolean).join(' · ');
  return `<div class="card stop">
    <div class="stop-head">
      <div class="info"><div class="stop-name">${esc(stop.name)}</div><div class="stop-meta">${meta}</div></div>
      <button class="star-btn" type="button" data-star="${esc(stop.code)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from' : 'Add to'} saved stops">
        ${icon('star', { size: 22, fill: fav ? 'currentColor' : 'none' })}
      </button>
    </div>${list}</div>`;
}

function showBusError(err) {
  if (err instanceof NeedsRelay) return;
  const msg = `<p class="empty">Couldn’t reach Blacksburg Transit (${esc(err.message)}). Retrying shortly.</p>`;
  if (!$('fav-stops').innerHTML) $('fav-stops').innerHTML = msg;
  markUpdated('bus', 'Offline');
}

function toggleFavorite(code) {
  favorites = favorites.includes(code) ? favorites.filter((c) => c !== code) : [...favorites, code];
  store.set('favorites', favorites);
}

// ----- Add-stop search -----

function renderStopResults() {
  const q = $('stop-query').value.trim().toLowerCase();
  const list = (q ? stops.filter((s) => s.name.toLowerCase().includes(q) || s.code.includes(q)) : stops).slice(0, 60);
  $('stop-results').innerHTML = list.length
    ? list.map((s) => {
        const fav = favorites.includes(s.code);
        return `<li><button type="button" data-star="${esc(s.code)}">
          <span class="info"><span class="stop-name">${esc(s.name)}</span>
            <span class="stop-meta"> · Stop ${esc(s.code)}</span>
            <span class="chips">${s.routes.map(routeChip).join('')}</span></span>
          <span class="${fav ? 'added' : ''}">${icon('star', { size: 22, fill: fav ? 'currentColor' : 'none' })}</span>
        </button></li>`;
      }).join('')
    : '<li><p class="empty">No stops match.</p></li>';
}

async function openStopSearch() {
  $('stop-search').showModal();
  $('stop-results').innerHTML = '<li><p class="empty">Loading stops…</p></li>';
  try {
    await ensureStops();
    renderStopResults();
  } catch (err) {
    $('stop-results').innerHTML = `<li><p class="empty">${esc(err.message)}</p></li>`;
  }
}

// ----- Live map (Leaflet, loaded on first use) -----

let map = null, busLayer = null, meMarker = null, stopLayer = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    js.onload = resolve;
    js.onerror = () => reject(new Error('Map library failed to load'));
    document.head.append(js);
  });
}

async function refreshMap() {
  await loadLeaflet();
  if (!map) {
    map = L.map('bus-map', { zoomControl: false, attributionControl: true }).setView([37.2284, -80.4234], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);
    busLayer = L.layerGroup().addTo(map);
    stopLayer = L.layerGroup().addTo(map);
    for (const code of favorites) {
      const s = stops.find((x) => x.code === code);
      if (s) L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: '<div class="stop-marker"></div>', iconSize: [10, 10] }) })
        .bindTooltip(s.name).addTo(stopLayer);
    }
    getPosition().then((p) => {
      position = p;
      meMarker = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: '<div class="me-marker"></div>', iconSize: [16, 16] }), zIndexOffset: 1000 }).addTo(map);
    }).catch(() => {});
  }
  map.invalidateSize();
  requestAnimationFrame(() => map.invalidateSize()); // after the container is laid out
  const buses = await BT.getBuses();
  busLayer.clearLayers();
  for (const b of buses) {
    const r = routes[b.route] || { color: '#444', text: '#fff', name: b.route };
    const full = b.full != null ? ` · ${b.full}% full` : '';
    L.marker([b.lat, b.lon], {
      icon: L.divIcon({ className: '', html: `<div class="bus-marker" style="background:${r.color};color:${r.text}">${esc(b.route)}</div>`, iconSize: [34, 34] }),
    }).bindPopup(`<b>${esc(r.name)}</b>${esc(full)}`).addTo(busLayer);
  }
  markUpdated('bus', `${buses.length} buses running`);
}

function setBusView(view, { go = true } = {}) {
  busView = view;
  store.set('busView', view);
  for (const b of document.querySelectorAll('.segmented button')) b.setAttribute('aria-checked', String(b.dataset.view === view));
  $('bus-stops').hidden = view !== 'stops';
  $('bus-map-wrap').hidden = view !== 'map' || !hasRelay();
  if (view === 'map' && !hasRelay()) $('bus-stops').hidden = false;
  if (go) refresh();
}

// ---------------------------------------------------------------------------
// Gym
// ---------------------------------------------------------------------------

async function refreshGym() {
  const [occ, hours] = await Promise.allSettled([Gym.getOccupancy(), hasRelay() ? Gym.getHours() : Promise.reject(new NeedsRelay())]);
  if (occ.status === 'rejected') {
    if (!$('gym-list').innerHTML) $('gym-list').innerHTML = `<p class="empty">Couldn’t load gym data (${esc(occ.reason.message)}).</p>`;
    markUpdated('gym', 'Offline');
    return;
  }
  const H = hours.status === 'fulfilled' ? hours.value : {};
  const now = new Date();
  $('gym-list').innerHTML = occ.value.facilities.map((f) => {
    if (f.missing) return `<div class="card gym-card"><div class="fac">${esc(f.name)}</div><p class="empty">No live count right now.</p></div>`;
    const lvl = Gym.crowdLevel(f.ratio);
    const pct = Math.round(f.ratio * 100);
    return `<div class="card gym-card">
      <div class="row1"><span class="fac">${esc(f.name)}</span><span class="level ${lvl.key}">${lvl.label}</span></div>
      <div class="pct">${pct}%</div>
      <div class="meter ${lvl.key}" role="img" aria-label="${pct}% full"><span style="width:${Math.min(pct, 100)}%"></span></div>
      <div class="meta"><span>${f.count.toLocaleString()} of ${f.max.toLocaleString()} people</span><span>${esc(gymHoursText(H[f.id], now))}</span></div>
    </div>`;
  }).join('');
  markUpdated('gym', occ.value.asOf ? `Count as of ${occ.value.asOf}` : '');
}

function gymHoursText(periods, now) {
  if (periods === undefined) return '';
  if (!periods.length) return 'Closed today';
  const cur = periods.find((p) => p.open <= now && now < p.close);
  const range = periods.map((p) => `${clock(p.open)}–${clock(p.close)}`).join(', ');
  if (cur) return `Open until ${clock(cur.close)}`;
  const next = periods.find((p) => p.open > now);
  if (next) return `Opens ${clock(next.open)} · ${range}`;
  return `Closed · was ${range}`;
}

// ---------------------------------------------------------------------------
// Dining
// ---------------------------------------------------------------------------

async function refreshDining() {
  let venues;
  try {
    venues = await getDining();
  } catch (err) {
    if (!$('dining-list').innerHTML) $('dining-list').innerHTML = `<p class="empty">Couldn’t load dining hours (${esc(err.message)}).</p>`;
    markUpdated('dining', 'Offline');
    return;
  }
  const now = Date.now();
  const open = venues.filter((v) => v.state === 'open').sort((a, b) => a.until - b.until);
  const later = venues.filter((v) => v.state === 'later').sort((a, b) => a.until - b.until);
  const closed = venues.filter((v) => v.state === 'closed').sort((a, b) => a.name.localeCompare(b.name));

  $('dining-summary').textContent = venues.length
    ? `${open.length} of ${venues.length} places open right now`
    : 'Nothing is scheduled to open today.';

  const row = (v) => {
    let status;
    if (v.state === 'open') {
      const left = v.until - now;
      status = left <= 30 * 60000
        ? `<div class="status soon">Closes in ${inTime(left)}<small>at ${clock(v.until)}</small></div>`
        : `<div class="status open">Open<small>until ${clock(v.until)}</small></div>`;
    } else if (v.state === 'later') {
      status = `<div class="status later">Opens ${clock(v.until)}<small>in ${inTime(v.until - now)}</small></div>`;
    } else {
      status = '<div class="status closed">Closed</div>';
    }
    const hours = v.periods.map((p) => `${p.label ? `${p.label} ` : ''}${clock(p.open)}–${clock(p.close)}`).join(' · ');
    const menu = v.menu ? `<a class="menu-link" href="${esc(v.menu)}" target="_blank" rel="noopener" aria-label="${esc(v.name)} menu">${icon('external', { size: 18 })}</a>` : '';
    return `<div class="card venue">
      <div class="info"><div class="name">${esc(v.name)}</div>${v.building ? `<div class="bldg">${esc(v.building)}</div>` : ''}<div class="hours">${esc(hours)}</div></div>
      ${status}${menu}
    </div>`;
  };
  const group = (title, list) => (list.length ? `<section class="dining-group"><h2>${title}</h2>${list.map(row).join('')}</section>` : '');
  $('dining-list').innerHTML = group('Open now', open) + group('Later today', later) + group('Closed for the day', closed);
  markUpdated('dining');
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function renderThemes() {
  $('themes').innerHTML = Object.entries(THEMES).map(([id, t]) => `
    <button class="theme-btn" type="button" role="radio" data-theme="${id}" aria-checked="${id === theme}">
      <span class="swatches">${t.swatches.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
      <span>${t.name}</span>
    </button>`).join('');
}

async function saveRelay() {
  const url = $('relay-input').value.trim().replace(/\/+$/, '');
  store.set('relay', url);
  const msg = $('relay-msg');
  if (!url) { msg.textContent = 'Relay removed.'; msg.className = 'msg'; return; }
  msg.textContent = 'Testing…';
  msg.className = 'msg';
  try {
    stops = [];
    routes = {};
    await BT.getRoutes();
    msg.textContent = 'Connected ✓';
    msg.className = 'msg ok';
    refresh();
  } catch (err) {
    msg.textContent = `Couldn’t reach it: ${err.message}`;
    msg.className = 'msg error';
  }
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

function init() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

  // Static icons
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon, { size: el.closest('.tabbar') ? 24 : 18 });
  $('open-settings').innerHTML = icon('settings');
  for (const b of document.querySelectorAll('[data-close]')) b.innerHTML = icon('close', { size: 20 });
  $('map-locate').innerHTML = icon('locate', { size: 20 });

  // Tabs
  for (const b of document.querySelectorAll('.tabbar button')) b.addEventListener('click', () => showTab(b.dataset.tab));
  for (const b of document.querySelectorAll('.segmented button')) b.addEventListener('click', () => setBusView(b.dataset.view));

  // Stars (cards and search results share data-star)
  document.addEventListener('click', (e) => {
    const star = e.target.closest('[data-star]');
    if (!star) return;
    toggleFavorite(star.dataset.star);
    if ($('stop-search').open) renderStopResults();
    if (tab === 'bus') refresh();
  });
  $('add-stop').addEventListener('click', openStopSearch);
  $('stop-query').addEventListener('input', renderStopResults);
  $('map-locate').addEventListener('click', () => {
    getPosition().then((p) => {
      position = p;
      map?.setView([p.lat, p.lon], 16);
      meMarker?.setLatLng([p.lat, p.lon]);
    }).catch(() => {});
  });

  // Sheets
  const settings = $('settings');
  const openSettings = () => {
    $('relay-input').value = getRelay();
    $('relay-msg').textContent = '';
    renderThemes();
    settings.showModal();
  };
  $('open-settings').addEventListener('click', openSettings);
  for (const b of document.querySelectorAll('[data-open-settings]')) b.addEventListener('click', openSettings);
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  }
  $('themes').addEventListener('click', (e) => {
    const b = e.target.closest('.theme-btn');
    if (!b) return;
    theme = b.dataset.theme;
    store.set('theme', theme);
    applyTheme();
    renderThemes();
  });
  $('relay-save').addEventListener('click', saveRelay);

  // Pause when hidden, refresh when back.
  document.addEventListener('visibilitychange', () => (document.hidden ? clearTimeout(timer) : refresh()));
  setInterval(renderUpdated, 15_000);

  setBusView(busView, { go: false });
  showTab(tab);
}

init();
