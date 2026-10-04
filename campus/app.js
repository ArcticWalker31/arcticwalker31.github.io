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

// Vector map (MapLibre GL + free OpenFreeMap tiles, no API key): renders like
// Apple/Google Maps, with crisp labels, smooth zoom and a real dark style.
const MAP_JS = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js';
const MAP_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css';
const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let map = null, meMarker = null;
const busMarkers = new Map(); // bus id → { marker, popup, bus }
let openBusId = null;         // bus whose popup is open
let routeData = null;         // GeoJSON for the open bus's route (re-applied after style changes)
let arrowMarkers = [];

function loadMapLibrary() {
  if (window.maplibregl) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = MAP_CSS;
    document.head.append(css);
    const js = document.createElement('script');
    js.src = MAP_JS;
    js.onload = resolve;
    js.onerror = () => reject(new Error('Map library failed to load'));
    document.head.append(js);
  });
}

/** "Updated 38s ago" / "Updated 3 min ago" */
function ageText(updatedAt) {
  if (!updatedAt) return 'Update time unknown';
  const sec = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  return sec < 60 ? `Updated ${sec}s ago` : `Updated ${Math.round(sec / 60)} min ago`;
}

function busElement(b) {
  const el = document.createElement('div');
  el.className = 'bus-icon';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${b.route} bus`);
  fillBusElement(el, b);
  return el;
}
function fillBusElement(el, b) {
  const r = routes[b.route] || { color: '#444', text: '#fff' };
  // The arrow ring rotates with the bus heading; the label stays upright.
  el.innerHTML = `<div class="bus-heading" style="transform:rotate(${b.heading}deg)"><i style="border-bottom-color:${r.color}"></i></div>
    <div class="bus-dot" style="background:${r.color};color:${r.text}">${esc(b.route)}</div>`;
}

function busPopupHTML(b) {
  const r = routes[b.route] || { name: b.route };
  const full = b.full != null ? `<div class="pop-row">${b.full}% full</div>` : '';
  return `<div class="pop-title">${routeChip(b.route)}<span>${esc(r.name)}</span></div>${full}
    <div class="pop-row" data-next></div>
    <div class="pop-age" data-age>${ageText(b.updatedAt)}</div>`;
}

/** Glide a marker to its new position instead of jumping. */
function glide(marker, to, ms = 1200) {
  const from = marker.getLngLat();
  if (reducedMotion() || distanceM({ lat: from.lat, lon: from.lng }, { lat: to[1], lon: to[0] }) > 2000) return marker.setLngLat(to);
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - (1 - k) ** 3; // ease-out
    marker.setLngLat([from.lng + (to[0] - from.lng) * e, from.lat + (to[1] - from.lat) * e]);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ----- Tapped bus: draw the route ahead -----

function bearing(a, b) {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

const EMPTY = { type: 'FeatureCollection', features: [] };

/** Route line layers; re-added whenever the map style (light/dark) loads. */
function addRouteLayers() {
  if (map.getSource('route')) return;
  map.addSource('route', { type: 'geojson', data: routeData || EMPTY });
  const line = { 'line-cap': 'round', 'line-join': 'round' };
  map.addLayer({ id: 'route-behind', type: 'line', source: 'route', filter: ['==', ['get', 'part'], 'behind'],
    layout: line, paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.3 } });
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', filter: ['==', ['get', 'part'], 'ahead'],
    layout: line, paint: { 'line-color': '#FFFFFF', 'line-width': 10 } });
  map.addLayer({ id: 'route-ahead', type: 'line', source: 'route', filter: ['==', ['get', 'part'], 'ahead'],
    layout: line, paint: { 'line-color': ['get', 'color'], 'line-width': 6 } });
  map.addLayer({ id: 'route-stops', type: 'circle', source: 'route', filter: ['==', ['get', 'part'], 'stop'],
    paint: { 'circle-radius': 4.5, 'circle-color': '#FFFFFF', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2.5 } });
}

function clearRoute() {
  routeData = null;
  map?.getSource('route')?.setData(EMPTY);
  arrowMarkers.forEach((m) => m.remove());
  arrowMarkers = [];
}

/**
 * The bus's pattern: the stretch already driven faded, the stretch ahead bold
 * in the route color with direction arrows and its stops; the next stop goes
 * into the popup.
 */
async function showRoute(bus) {
  if (!bus.pattern) return;
  let path;
  try { path = await BT.getPatternPath(bus.pattern); } catch { return; }
  if (openBusId !== bus.id || path.length < 2) return; // closed meanwhile

  let at = 0, best = Infinity; // closest path point to the bus
  path.forEach((p, i) => {
    const d = distanceM(p, bus);
    if (d < best) { best = d; at = i; }
  });
  const color = (routes[bus.route] || { color: '#444' }).color;
  const lnglat = (p) => [p.lon, p.lat];
  const behind = path.slice(0, at + 1);
  const ahead = [{ lat: bus.lat, lon: bus.lon }, ...path.slice(at + 1)];
  const upcoming = path.slice(at + 1).filter((p) => p.stop);

  const features = [];
  if (behind.length > 1) features.push({ type: 'Feature', properties: { part: 'behind', color }, geometry: { type: 'LineString', coordinates: behind.map(lnglat) } });
  features.push({ type: 'Feature', properties: { part: 'ahead', color }, geometry: { type: 'LineString', coordinates: ahead.map(lnglat) } });
  for (const s of upcoming) features.push({ type: 'Feature', properties: { part: 'stop', color, name: s.name }, geometry: { type: 'Point', coordinates: lnglat(s) } });
  routeData = { type: 'FeatureCollection', features };
  map.getSource('route')?.setData(routeData);

  // Direction arrows roughly every 250 m along the stretch ahead.
  arrowMarkers.forEach((m) => m.remove());
  arrowMarkers = [];
  let run = 0;
  for (let i = 1; i < ahead.length; i++) {
    run += distanceM(ahead[i - 1], ahead[i]);
    if (run < 250) continue;
    run = 0;
    const el = document.createElement('div');
    el.className = 'route-arrow';
    el.style.color = color;
    arrowMarkers.push(new maplibregl.Marker({ element: el, rotation: bearing(ahead[i - 1], ahead[i]), rotationAlignment: 'map' })
      .setLngLat(lnglat(ahead[i])).addTo(map));
  }

  const el = busMarkers.get(bus.id)?.popup.getElement()?.querySelector('[data-next]');
  if (el) el.textContent = upcoming[0] ? `Next stop: ${upcoming[0].name}` : 'End of the line';
}

async function refreshMap() {
  await loadMapLibrary();
  if (!map) {
    map = new maplibregl.Map({
      container: 'bus-map',
      style: MAP_STYLES[darkQuery.matches ? 'dark' : 'light'],
      center: [-80.4234, 37.2284],
      zoom: 14.6,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.on('style.load', addRouteLayers);
    darkQuery.addEventListener?.('change', () => map.setStyle(MAP_STYLES[darkQuery.matches ? 'dark' : 'light']));

    for (const code of favorites) {
      const s = stops.find((x) => x.code === code);
      if (!s) continue;
      const el = document.createElement('div');
      el.className = 'stop-marker';
      el.title = s.name;
      new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map);
    }
    // Tick the open popup's "Updated Xs ago" every second.
    setInterval(() => {
      const entry = busMarkers.get(openBusId);
      const el = entry?.popup.getElement()?.querySelector('[data-age]');
      if (el) el.textContent = ageText(entry.bus.updatedAt);
    }, 1000);
    getPosition().then((p) => {
      position = p;
      const el = document.createElement('div');
      el.className = 'me-marker';
      meMarker = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
    }).catch(() => {});
  }
  map.resize();
  requestAnimationFrame(() => map.resize()); // after the container is laid out

  const buses = await BT.getBuses();
  const seen = new Set();
  for (const b of buses) {
    seen.add(b.id);
    const entry = busMarkers.get(b.id);
    if (entry) {
      entry.bus = b;
      glide(entry.marker, [b.lon, b.lat]);
      fillBusElement(entry.marker.getElement(), b);
      if (openBusId !== b.id) entry.popup.setHTML(busPopupHTML(b));
    } else {
      const popup = new maplibregl.Popup({ closeButton: false, offset: 24, className: 'bus-popup', maxWidth: '260px' }).setHTML(busPopupHTML(b));
      popup.on('open', () => { openBusId = b.id; showRoute(busMarkers.get(b.id).bus); });
      popup.on('close', () => { if (openBusId === b.id) { openBusId = null; clearRoute(); } });
      const marker = new maplibregl.Marker({ element: busElement(b) }).setLngLat([b.lon, b.lat]).setPopup(popup).addTo(map);
      busMarkers.set(b.id, { marker, popup, bus: b });
    }
  }
  // Re-draw the open bus's route from its new position.
  const open = busMarkers.get(openBusId);
  if (open) showRoute(open.bus);
  // Buses that went off duty
  for (const [id, entry] of busMarkers) {
    if (!seen.has(id)) { entry.marker.remove(); busMarkers.delete(id); }
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
      <div class="meta"><span>${f.count.toLocaleString()} of ${f.max.toLocaleString()} people</span></div>
      ${(() => {
        const h = gymHours(f.id, H[f.id], now);
        const cls = h.open === true ? 'open' : h.open === false ? 'closed' : '';
        return `<div class="gym-hours">${icon('clock', { size: 16 })}<span>${esc(h.range)}</span>${h.status ? `<b class="${cls}">${esc(h.status)}</b>` : ''}</div>`;
      })()}
    </div>`;
  }).join('');
  markUpdated('gym', occ.value.asOf ? `Count as of ${occ.value.asOf}` : '');
}

/**
 * Today's hours line for a facility: { range: 'Today 10 AM – 10 PM', status, open }.
 * `periods` undefined = no published hours (or the relay isn't set up).
 */
function gymHours(facilityId, periods, now) {
  if (periods === undefined) {
    const why = facilityId === 'boulder' ? 'Hours not published' : hasRelay() ? 'Hours unavailable' : 'Hours need the relay (Settings)';
    return { range: why, status: '', open: null };
  }
  if (!periods.length) return { range: 'Closed today', status: '', open: false };
  const range = `Today ${periods.map((p) => `${clock(p.open)} – ${clock(p.close)}`).join(', ')}`;
  const cur = periods.find((p) => p.open <= now && now < p.close);
  if (cur) {
    const left = cur.close - now;
    return { range, status: left <= 60 * 60000 ? `Closes in ${inTime(left)}` : `Open · closes ${clock(cur.close)}`, open: true };
  }
  const next = periods.find((p) => p.open > now);
  if (next) return { range, status: `Opens ${clock(next.open)}`, open: false };
  return { range, status: 'Closed for the day', open: false };
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
      map?.flyTo({ center: [p.lon, p.lat], zoom: 16 });
      meMarker?.setLngLat([p.lon, p.lat]);
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
