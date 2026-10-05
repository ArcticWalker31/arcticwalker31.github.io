// app.js — Sky: location → forecast → render. Data logic is in weather.js,
// the animated scene in scene.js, the hourly chart in chart.js.

import * as W from './weather.js';
import { getPosition, placeName, distanceKm, locationErrorText } from './geo.js';
import { createScene, THEMES, paletteColors } from './scene.js';
import { hourlyChart } from './chart.js';
import { icon } from './icons.js';
import { openDaySheet, updateDaySheet, tempColor } from './daysheet.js';

const $ = (id) => document.getElementById(id);

// localStorage is shared by every app on this site, so keys are prefixed.
const NS = 'sky.';
const store = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(NS + key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch { /* storage blocked */ }
  },
};

const STALE_MS = 10 * 60 * 1000;  // refetch if older than this
const MOVED_KM = 2;               // a new place name if we moved this far
const PLACE_V = 2;                // bump when placeName() logic changes, to refresh saved names

let mode = store.get('mode', 'temp');
let theme = THEMES[store.get('theme')] ? store.get('theme') : 'classic';
let busy = false;
let status = { offline: false, usingLast: false, error: '' };
const scene = createScene($('scene'));

// ---------------------------------------------------------------------------
// Data flow
// ---------------------------------------------------------------------------

async function refresh({ force = false } = {}) {
  if (busy) return;
  busy = true;
  setSpinning(true);
  try {
    // 1. Where are we? Fall back to the last known spot.
    let pos;
    const last = store.get('loc');
    try {
      pos = await getPosition();
      status.usingLast = false;
      hideNotice();
    } catch (err) {
      if (!last) {
        showNotice(locationErrorText(err));
        return;
      }
      pos = last;
      status.usingLast = true;
      if (err?.code === 1) showNotice(locationErrorText(err));
    }

    // 2. Skip the network if the cache is fresh and we haven't moved.
    const moved = !last || distanceKm(last, pos) > MOVED_KM;
    const needPlace = moved || !last?.place || last.placeV !== PLACE_V;
    const cache = store.get('cache');
    if (!force && !needPlace && cache && Date.now() - cache.fetchedAt < STALE_MS) {
      status.offline = false;
      render();
      return;
    }

    // 3. Fetch forecast (and a place name if we moved or it's outdated).
    const [forecast, place] = await Promise.all([
      W.fetchForecast(pos.lat, pos.lon),
      needPlace ? placeName(pos.lat, pos.lon).catch(() => last?.place ?? null) : last.place,
    ]);
    store.set('loc', { lat: pos.lat, lon: pos.lon, place, placeV: PLACE_V });
    store.set('cache', { forecast, fetchedAt: Date.now() });
    status.offline = false;
    status.error = '';
    render();
  } catch (err) {
    // Network or service failure: keep showing the cached forecast.
    status.offline = !navigator.onLine;
    status.error = status.offline ? '' : (err?.message || 'Couldn’t update');
    renderUpdated();
  } finally {
    busy = false;
    setSpinning(false);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** "Now" conditions: the live reading, or the hourly forecast if the cache is old. */
function nowConditions(f) {
  const nowStr = W.localNow(f.utcOffset);
  const ageMin = (Date.parse(nowStr + ':00Z') - Date.parse(f.current.time + ':00Z')) / 60000;
  if (ageMin < 60) return f.current;
  const h = f.hourly[W.currentHourIndex(f)];
  return { ...f.current, temp: h.temp, feels: h.feels, code: h.code, isDay: h.isDay, uv: h.uv, wind: h.wind, gust: h.gust, windDir: h.windDir, cloud: h.cloud, pressure: h.pressure };
}

function todayOf(f) {
  const date = W.localNow(f.utcOffset).slice(0, 10);
  return f.daily.find((d) => d.date === date) ?? f.daily[0];
}

/** dawn / day / dusk / night, plus where the sun is (0 = sunrise, 1 = sunset). */
function sunPhase(f) {
  const now = W.minutesOfDay(W.localNow(f.utcOffset));
  const t = todayOf(f);
  const rise = W.minutesOfDay(t.sunrise), set = W.minutesOfDay(t.sunset);
  const sunPos = (now - rise) / (set - rise);
  if (now < rise - 30 || now > set + 30) return { phase: 'night', sunPos: null };
  if (now < rise + 45) return { phase: 'dawn', sunPos };
  if (now > set - 45) return { phase: 'dusk', sunPos };
  return { phase: 'day', sunPos };
}

function render() {
  const cache = store.get('cache');
  if (!cache) return renderEmpty();
  const f = cache.forecast;
  const now = nowConditions(f);
  const d = W.describe(now.code);
  const { phase, sunPos } = sunPhase(f);

  // Scene + status-bar color
  const pal = scene.update({ kind: d.kind, intensity: d.intensity, phase, sunPos, cloud: now.cloud, wind: now.wind, theme });
  $('theme-color').setAttribute('content', pal.top);

  // Hero
  $('temp').textContent = Math.round(now.temp);
  const loc = store.get('loc');
  $('place').textContent = loc?.place || 'Current location';
  $('cond').textContent = `${d.label} · Feels like ${Math.round(now.feels)}°`;
  renderUpdated();

  renderRain(f);
  renderDetails(f, now);
  renderHourly(f);
  renderDays(f, now);
  updateDaySheet(f); // keep an open day view current after a refresh
  $('credits').hidden = false;
}

function renderEmpty() {
  const pal = scene.update({ kind: 'partly', intensity: 0, phase: 'day', sunPos: 0.5, cloud: 30, wind: 4, theme });
  $('theme-color').setAttribute('content', pal.top);
  $('rain-summary').textContent = 'Loading forecast…';
}

function renderUpdated() {
  const cache = store.get('cache');
  const parts = [];
  if (status.usingLast) parts.push('Using last location');
  if (status.offline) parts.push('Offline');
  if (status.error) parts.push(status.error);
  if (cache) {
    const min = Math.round((Date.now() - cache.fetchedAt) / 60000);
    parts.push(min < 1 ? 'Updated just now' : min < 60 ? `Updated ${min} min ago` : `Updated ${Math.round(min / 60)} h ago`);
  }
  $('updated').textContent = parts.join(' · ');
}

function renderRain(f) {
  const { text, wet, slots } = W.nearTermPrecip(f);
  // Only show the section when rain/snow is actually expected.
  $('rain-section').hidden = !wet;
  if (!wet) return;
  $('rain-summary').textContent = text;
  const max = Math.max(0.2, ...slots.map((s) => s.rate));
  const bars = slots.map((s) => {
    const wet = s.rate >= 0.01;
    const h = wet ? Math.max(8, (s.rate / max) * 100) : 4;
    const label = `${W.clockLabel(s.time)}: ${wet ? `${s.rate.toFixed(2)} in/hr` : 'dry'}`;
    return `<span class="${wet ? '' : 'dry'}" style="height:${h}%" title="${label}" aria-label="${label}"></span>`;
  }).join('');
  $('rain-strip').innerHTML = `
    <div class="rain-bars" role="img" aria-label="Precipitation in 15-minute steps for the next 2 hours">${bars}</div>
    <div class="rain-axis"><span>Now</span><span>30 min</span><span>1 h</span><span>1.5 h</span><span>2 h</span></div>`;
}

function detail(iconName, value, label, { more = false, note = '' } = {}) {
  return `<div class="detail${more ? ' more' : ''}">
    ${icon(iconName, { size: 26 })}
    <div><div class="value">${value}</div><div class="label">${label}</div>${note ? `<div class="note">${note}</div>` : ''}</div>
  </div>`;
}

function renderDetails(f, now) {
  const t = todayOf(f);
  const trend = W.pressureTrend(f);
  const arrow = `<span class="wind-arrow" style="transform:rotate(${(now.windDir ?? 0) + 180}deg)" title="Wind from ${W.compass(now.windDir)}">${icon('arrow', { size: 16, stroke: 2.25 })}</span>`;
  const air = f.air;
  const open = store.get('detailsOpen', false);
  $('details-grid').classList.toggle('open', open);
  $('details-toggle').setAttribute('aria-expanded', String(open));
  $('details-grid').innerHTML = [
    detail('thermometer', `${Math.round(t.hi)}° | ${Math.round(t.lo)}°`, 'High | Low'),
    detail('feels', `${Math.round(now.feels)}°`, 'Feels like'),
    detail('umbrella', `${t.prob ?? 0}%`, 'Rain chance', { note: t.precip >= 0.01 ? `${t.precip.toFixed(2)}″ today` : '' }),
    detail('wind', `${Math.round(now.wind)} mph ${arrow}`, `Wind ${W.compass(now.windDir)}`, { note: now.gust ? `Gusts ${Math.round(now.gust)} mph` : '' }),
    detail('uv', `${Math.round(now.uv ?? 0)}`, `UV · ${W.uvLevel(now.uv)}`, { more: true, note: `Peak ${Math.round(t.uvMax ?? 0)} today` }),
    detail('leaf', air?.aqi != null ? String(Math.round(air.aqi)) : '—', `Air quality`, { more: true, note: air ? W.aqiLevel(air.aqi) : 'Unavailable' }),
    detail('sunrise', W.clockLabel(t.sunrise), 'Sunrise', { more: true }),
    detail('sunset', W.clockLabel(t.sunset), 'Sunset', { more: true }),
    detail('droplet', `${Math.round(now.humidity)}%`, 'Humidity', { more: true }),
    detail('dew', `${Math.round(now.dew)}°`, 'Dew point', { more: true }),
    detail('gauge', now.pressure ? `${W.inHg(now.pressure).toFixed(2)}` : '—', 'Pressure (inHg)', { more: true, note: trend[0].toUpperCase() + trend.slice(1) }),
  ].join('');
}

function renderHourly(f) {
  const start = W.currentHourIndex(f);
  const hours = f.hourly.slice(start, start + 48);
  for (const b of document.querySelectorAll('.mode-btn')) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  const legend = {
    temp: '<span><i style="background:var(--c-temp)"></i>Temperature</span><span><i style="background:var(--c-temp);opacity:.35"></i>Feels like</span>',
    precip: '<span>Chance of precipitation · amounts below</span>',
    uv: '<span>UV index</span>',
  }[mode];
  $('hourly-legend').innerHTML = legend;
  const box = $('hourly');
  const scrollLeft = box.scrollLeft;
  box.replaceChildren(hourlyChart(hours, {
    mode, pointW: 54, every: 1, nowIndex: 0,
    ariaLabel: `Next 48 hours: ${mode === 'temp' ? 'temperature' : mode === 'precip' ? 'chance of precipitation' : 'UV index'}`,
  }));
  box.scrollLeft = scrollLeft;
}

function renderDays(f, now) {
  const today = W.localNow(f.utcOffset).slice(0, 10);
  const days = f.daily.filter((d) => d.date >= today).slice(0, 10);
  const min = Math.min(...days.map((d) => d.lo));
  const max = Math.max(...days.map((d) => d.hi));
  const pct = (v) => ((v - min) / (max - min || 1)) * 100;

  $('days').replaceChildren(...days.map((d, i) => {
    const li = document.createElement('li');
    li.className = 'day';
    const name = i === 0 ? 'Today' : W.weekday(d.date);
    const prob = d.prob >= 10 ? `${d.prob}%` : '';
    const dot = i === 0 ? `<span class="now-dot" style="left:${pct(Math.min(Math.max(now.temp, d.lo), d.hi))}%"></span>` : '';
    li.innerHTML = `
      <button class="day-row" type="button" aria-haspopup="dialog">
        <span class="day-name">${name}</span>
        ${icon(W.iconFor(d.code, true), { size: 24, label: W.describe(d.code).label })}
        <span class="day-prob">${prob}</span>
        <span class="day-lo">${Math.round(d.lo)}°</span>
        <span class="range"><span class="fill" style="left:${pct(d.lo)}%;right:${100 - pct(d.hi)}%;background:linear-gradient(90deg, ${tempColor(d.lo)}, ${tempColor(d.hi)})"></span>${dot}</span>
        <span class="day-hi">${Math.round(d.hi)}°</span>
      </button>`;
    li.querySelector('.day-row').addEventListener('click', () => openDaySheet(f, d.date));
    return li;
  }));
}

// ---------------------------------------------------------------------------
// UI bits
// ---------------------------------------------------------------------------

function setSpinning(on) {
  $('ptr').classList.toggle('busy', on);
  $('refresh').disabled = on;
  $('refresh-label').textContent = on ? 'Updating…' : 'Refresh now';
}

// ---------------------------------------------------------------------------
// Settings: color schemes
// ---------------------------------------------------------------------------

/** Tiny landscape preview of a scheme's clear-day look. */
function themePreview(id) {
  const c = paletteColors('clear', id);
  return `<svg viewBox="0 0 120 74" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="g-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.top}"/><stop offset="1" stop-color="${c.bottom}"/></linearGradient></defs>
    <rect width="120" height="74" fill="url(#g-${id})"/>
    <circle cx="88" cy="24" r="10" fill="${c.body}"/>
    <path d="M0 50 C30 40 60 44 120 38 V74 H0Z" fill="${c.far}"/>
    <path d="M0 60 C40 52 80 62 120 54 V74 H0Z" fill="${c.near}"/>
  </svg>`;
}

function renderThemes() {
  $('themes').innerHTML = Object.entries(THEMES).map(([id, t]) => `
    <button class="theme-btn" type="button" role="radio" data-theme="${id}" aria-checked="${id === theme}">
      <span class="theme-preview">${themePreview(id)}</span>
      <span class="theme-name">${t.name}</span>
    </button>`).join('');
}

function setTheme(id) {
  theme = id;
  store.set('theme', id);
  document.documentElement.dataset.theme = id;
  for (const b of $('themes').querySelectorAll('.theme-btn')) b.setAttribute('aria-checked', String(b.dataset.theme === id));
  if (store.get('cache')) render();
  else renderEmpty();
}

function initSettings() {
  const dlg = $('settings');
  $('open-settings').innerHTML = icon('settings', { size: 22, stroke: 2 });
  $('close-settings').innerHTML = icon('close', { size: 20, stroke: 2 });
  $('refresh-icon').innerHTML = icon('refresh', { size: 18, stroke: 2 });
  renderThemes();
  $('open-settings').addEventListener('click', () => dlg.showModal());
  $('close-settings').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // tap the backdrop
  $('themes').addEventListener('click', (e) => {
    const b = e.target.closest('.theme-btn');
    if (b) setTheme(b.dataset.theme);
  });
}

function showNotice(text) {
  $('notice-text').textContent = text;
  $('notice').hidden = false;
}
function hideNotice() {
  $('notice').hidden = true;
}

/** Pull down at the top of the page to refresh. */
function initPullToRefresh() {
  const ptr = $('ptr');
  let startY = null, pull = 0;
  addEventListener('touchstart', (e) => {
    startY = scrollY <= 0 ? e.touches[0].clientY : null;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (startY == null) return;
    pull = Math.max(0, e.touches[0].clientY - startY);
    const k = Math.min(pull / 80, 1);
    ptr.style.opacity = k;
    ptr.style.transform = `translateY(${-40 + k * 50}px) rotate(${pull * 3}deg)`;
  }, { passive: true });
  addEventListener('touchend', () => {
    if (startY != null && pull > 80) refresh({ force: true });
    startY = null;
    pull = 0;
    ptr.style.opacity = 0;
    ptr.style.transform = '';
  });
}

function init() {
  // Static icons
  document.documentElement.dataset.theme = theme;
  initSettings();
  $('place-icon').innerHTML = icon('pin', { size: 18, stroke: 2 });
  $('details-chevron').innerHTML = icon('chevron', { size: 26 });
  $('ptr').innerHTML = icon('refresh', { size: 18, stroke: 2.25 });
  for (const m of document.querySelectorAll('.mi')) m.innerHTML = icon(m.dataset.icon, { size: 20 });

  $('refresh').addEventListener('click', () => refresh({ force: true }));
  $('notice-retry').addEventListener('click', () => refresh({ force: true }));
  $('details-toggle').addEventListener('click', () => {
    const open = !store.get('detailsOpen', false);
    store.set('detailsOpen', open);
    $('details-grid').classList.toggle('open', open);
    $('details-toggle').setAttribute('aria-expanded', String(open));
  });
  for (const b of document.querySelectorAll('.mode-btn')) {
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      store.set('mode', mode);
      const cache = store.get('cache');
      if (cache) renderHourly(cache.forecast);
    });
  }
  initPullToRefresh();

  // Coming back to the app: refresh if stale, otherwise just re-render
  // (the current hour and sun position may have moved on).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const cache = store.get('cache');
    if (!cache || Date.now() - cache.fetchedAt > STALE_MS) refresh();
    else render();
  });
  addEventListener('online', () => refresh());
  setInterval(renderUpdated, 60 * 1000);

  render();   // instant, from cache
  refresh();  // then live
}

init();
