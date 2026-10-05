// daysheet.js — full-screen day view (like Apple Weather's "Conditions").
//
//   • Day strip to switch days (tap, or swipe the header/readout sideways)
//   • Charts: Temperature (Actual / Feels like), Precipitation, UV, Humidity
//   • Press and hold on the chart to scrub: a line follows your finger and the
//     readout shows that hour (temperature shows both Actual and Feels like)
//   • Today's past hours are dashed/dimmed, with a "now" line

import * as W from './weather.js';
import { icon, iconPaths } from './icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);

// Temperature → color (cold blue → warm orange); also used by the 10-day bars.
const TEMP_STOPS = [[0, [108, 142, 232]], [32, [95, 168, 224]], [55, [120, 190, 160]], [70, [242, 181, 68]], [90, [226, 112, 58]], [105, [200, 60, 50]]];
export function tempColor(t) {
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    const [t0, c0] = TEMP_STOPS[i - 1];
    if (t <= t1) {
      const k = Math.max(0, (t - t0) / (t1 - t0));
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(',')})`;
    }
  }
  return 'rgb(200,60,50)';
}

const METRICS = {
  temp: { title: 'Temperature', icon: 'thermometer' },
  precip: { title: 'Precipitation', icon: 'umbrella' },
  uv: { title: 'UV Index', icon: 'uv' },
  humidity: { title: 'Humidity', icon: 'droplet' },
};
const DESCRIPTIONS = {
  actual: 'The air temperature measured in the shade.',
  feels: 'What the temperature feels like, as a result of humidity, sunlight, or wind.',
  precip: 'The chance of rain or snow in each hour, and how much is expected.',
  uv: 'Sunburn risk from the sun’s ultraviolet light. 3+ is moderate: wear sunscreen around midday.',
  humidity: 'The amount of moisture in the air. The dew point is the temperature the air would need to cool to for dew to form; above ~65° feels muggy.',
};

const state = { f: null, date: null, metric: 'temp', series: 'actual', chart: null };

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

let ready = false;
export function openDaySheet(forecast, date) {
  state.f = forecast;
  state.date = date;
  if (!ready) init();
  $('day-sheet').showModal();
  render();
}

/** Keep an open sheet in sync after a refresh. */
export function updateDaySheet(forecast) {
  if (!$('day-sheet')?.open) return;
  state.f = forecast;
  render();
}

// ---------------------------------------------------------------------------
// Setup & rendering
// ---------------------------------------------------------------------------

function init() {
  ready = true;
  const dlg = $('day-sheet');
  $('ds-close').innerHTML = icon('close', { size: 22, stroke: 2.25 });
  $('ds-close').addEventListener('click', () => dlg.close());
  $('ds-metric').addEventListener('change', (e) => { state.metric = e.target.value; render(); });
  $('ds-days').addEventListener('click', (e) => {
    const b = e.target.closest('[data-date]');
    if (b) { state.date = b.dataset.date; render(); }
  });
  $('ds-toggle').addEventListener('click', (e) => {
    const b = e.target.closest('[data-series]');
    if (b) { state.series = b.dataset.series; render(); }
  });
  // Swipe sideways on the date/readout area to change day.
  let sx = null;
  const area = $('ds-swipe');
  area.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  area.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 50) shiftDay(dx < 0 ? 1 : -1);
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') shiftDay(1);
    if (e.key === 'ArrowLeft') shiftDay(-1);
  });
  new ResizeObserver(() => { if (dlg.open) drawChart(); }).observe($('ds-chart'));
}

function days() {
  const today = W.localNow(state.f.utcOffset).slice(0, 10);
  return state.f.daily.filter((d) => d.date >= today).slice(0, 10);
}

function shiftDay(delta) {
  const list = days();
  const i = list.findIndex((d) => d.date === state.date);
  const next = list[i + delta];
  if (next) { state.date = next.date; render(); }
}

function render() {
  const list = days();
  const day = list.find((d) => d.date === state.date) || list[0];
  state.date = day.date;
  const m = METRICS[state.metric];

  $('ds-title').textContent = 'Conditions'; // the pill on the right picks the chart
  $('ds-metric').value = state.metric;
  $('ds-metric-icon').innerHTML = icon(m.icon, { size: 18 });

  $('ds-days').innerHTML = list.map((d) => {
    const [y, mo, dd] = d.date.split('-').map(Number);
    return `<button type="button" role="tab" data-date="${d.date}" aria-selected="${d.date === state.date}">
      <span class="dow">${W.weekday(d.date, 'narrow')}</span><span class="num">${dd}</span></button>`;
  }).join('');
  $('ds-days').querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });

  const [y, mo, dd] = day.date.split('-').map(Number);
  $('ds-date').textContent = new Date(y, mo - 1, dd).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  $('ds-toggle').hidden = state.metric !== 'temp';
  for (const b of $('ds-toggle').querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.series === state.series));
  $('ds-desc').textContent = state.metric === 'temp' ? DESCRIPTIONS[state.series] : DESCRIPTIONS[state.metric];

  renderFacts(day);
  drawChart();
}

function dayHours() {
  return state.f.hourly.filter((h) => h.time.startsWith(state.date));
}

/** Fractional index of "now" in today's hours (-1 on other days). */
function nowIndex() {
  const now = W.localNow(state.f.utcOffset);
  return now.slice(0, 10) === state.date ? W.minutesOfDay(now) / 60 : -1;
}

// ---------------------------------------------------------------------------
// Readout (big number at the top). idx = hovered hour, or null for default.
// ---------------------------------------------------------------------------

function readout(idx) {
  const hours = dayHours();
  const day = state.f.daily.find((d) => d.date === state.date);
  const ni = nowIndex();
  const scrub = idx != null;
  const h = scrub ? hours[idx] : hours[Math.max(0, Math.floor(ni))] || hours[12];
  const when = scrub ? W.hourLabel(h.time) : null;
  const deg = (v) => `${Math.round(v)}°`;
  let big, sub, iconName = W.iconFor(scrub || ni >= 0 ? h.code : day.code, scrub || ni >= 0 ? h.isDay : true);

  if (state.metric === 'temp') {
    const sel = state.series === 'actual' ? 'temp' : 'feels';
    if (scrub) {
      big = deg(h[sel]);
      sub = `${when} · Actual ${deg(h.temp)} · Feels like ${deg(h.feels)}`;
    } else if (ni >= 0) {
      big = deg(h[sel]);
      sub = state.series === 'actual' ? `Feels like: ${deg(h.feels)}` : `Actual: ${deg(h.temp)}`;
    } else {
      big = deg(day.hi);
      sub = `H: ${deg(day.hi)}  L: ${deg(day.lo)}`;
    }
  } else if (state.metric === 'precip') {
    if (scrub) {
      big = `${h.prob ?? 0}%`;
      sub = `${when} · ${h.precip >= 0.01 ? `${h.precip.toFixed(2)}″ expected` : 'No precipitation expected'}`;
    } else {
      big = `${day.prob ?? 0}%`;
      sub = `Chance today · ${(day.precip ?? 0).toFixed(2)}″ total${day.snow > 0 ? ` · ${day.snow.toFixed(1)}″ snow` : ''}`;
    }
    iconName = 'umbrella';
  } else if (state.metric === 'uv') {
    const v = scrub ? h.uv : day.uvMax;
    big = String(Math.round(v ?? 0));
    sub = scrub ? `${when} · ${W.uvLevel(v)}` : `Peak today · ${W.uvLevel(v)}`;
    iconName = 'uv';
  } else {
    const avg = Math.round(hours.reduce((a, x) => a + (x.humidity ?? 0), 0) / hours.length);
    const v = scrub || ni >= 0 ? h.humidity : avg;
    big = `${Math.round(v ?? 0)}%`;
    sub = scrub ? `${when} · Dew point ${deg(h.dew)}` : ni >= 0 ? `Now · Dew point ${deg(h.dew)}` : `Average today · Dew point ${deg(Math.max(...hours.map((x) => x.dew ?? -99)))} max`;
    iconName = 'droplet';
  }
  $('ds-readout').innerHTML = `<div class="ro-big"><span>${big}</span>${icon(iconName, { size: 38, stroke: 1.6 })}</div><div class="ro-sub">${sub}</div>`;
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

/** Clean axis: [min, max, step] covering the values. */
function niceAxis(vals, step) {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  let min = Math.floor((lo - step / 3) / step) * step;
  let max = Math.ceil((hi + step / 3) / step) * step;
  while ((max - min) / step < 4) { min -= step; if ((max - min) / step < 4) max += step; }
  return [min, max, step];
}

function drawChart() {
  const box = $('ds-chart');
  const width = box.clientWidth;
  if (!width) return;
  const hours = dayHours();
  const n = hours.length;
  if (n < 2) { box.innerHTML = '<p class="ds-empty">No hourly data for this day.</p>'; readout(null); return; }

  const H = 290, padL = 14, padR = 46, top = 42, bottom = 30;
  const plotW = width - padL - padR, plotH = H - top - bottom;
  const xAt = (i) => padL + (i / (n - 1)) * plotW;
  const ni = nowIndex();
  const nowX = ni >= 0 ? xAt(Math.min(ni, n - 1)) : null;

  const metric = state.metric;
  const isLine = metric === 'temp' || metric === 'humidity';
  const key = metric === 'temp' ? (state.series === 'actual' ? 'temp' : 'feels') : metric === 'precip' ? 'prob' : metric;
  const vals = hours.map((h) => h[key] ?? 0);
  let axis;
  if (metric === 'temp') axis = niceAxis([...hours.map((h) => h.temp), ...hours.map((h) => h.feels)], 6);
  else if (metric === 'uv') axis = [0, Math.max(10, Math.ceil(Math.max(...vals) / 2) * 2 + 2), 2];
  else axis = [0, 100, 20];
  const [amin, amax, step] = axis;
  const yAt = (v) => top + (1 - (v - amin) / (amax - amin)) * plotH;
  const unit = metric === 'temp' ? '°' : metric === 'uv' ? '' : '%';

  const svg = el('svg', { class: 'ds-svg', viewBox: `0 0 ${width} ${H}`, width, height: H, role: 'img',
    'aria-label': `${METRICS[metric].title} by hour for ${state.date}. Press and hold to see each hour.` });
  const defs = el('defs', {}, svg);

  // Grid + right-hand axis labels
  for (let t = amin; t <= amax + 1e-9; t += step) {
    el('line', { class: 'ds-grid', x1: padL, x2: padL + plotW, y1: yAt(t), y2: yAt(t) }, svg);
    el('text', { class: 'ds-axis', x: width - 4, y: yAt(t) + 4, 'text-anchor': 'end' }, svg).textContent = `${t}${unit}`;
  }
  el('line', { class: 'ds-grid', x1: padL + plotW, x2: padL + plotW, y1: top - 36, y2: top + plotH + bottom - 6 }, svg);
  // Time markers
  [[0, '12AM'], [6, '6AM'], [12, '12PM'], [18, '6PM']].forEach(([i, label]) => {
    if (i >= n) return;
    if (i > 0) el('line', { class: 'ds-vgrid', x1: xAt(i), x2: xAt(i), y1: top - 36, y2: top + plotH + bottom - 6 }, svg);
    el('text', { class: 'ds-axis', x: xAt(i) + 4, y: H - 8 }, svg).textContent = label;
  });

  // Condition icons every 2 hours
  for (let i = 0; i < n; i += 2) {
    const g = el('svg', { x: Math.max(0, xAt(i) - 11), y: 6, width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: `ds-icon${nowX != null && xAt(i) < nowX - 1 ? ' past' : ''}` }, svg);
    g.innerHTML = iconPaths(W.iconFor(hours[i].code, hours[i].isDay));
  }

  // Past / future clipping for today
  const clip = (id, x, w) => { const c = el('clipPath', { id }, defs); el('rect', { x, y: 0, width: Math.max(0, w), height: H }, c); };
  if (nowX != null) { clip('ds-past', 0, nowX); clip('ds-future', nowX, width - nowX); }

  if (isLine) {
    const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join('');
    let stroke = 'var(--c-precip)';
    if (metric === 'temp') {
      // Color along the line by temperature.
      const grad = el('linearGradient', { id: 'ds-grad', gradientUnits: 'userSpaceOnUse', x1: padL, x2: padL + plotW, y1: 0, y2: 0 }, defs);
      vals.forEach((v, i) => el('stop', { offset: `${(i / (n - 1)) * 100}%`, 'stop-color': tempColor(v) }, grad));
      stroke = 'url(#ds-grad)';
      // The other series, faint, behind (Feels like ↔ Actual).
      const other = hours.map((h) => (state.series === 'actual' ? h.feels : h.temp));
      el('path', { class: 'ds-other', d: path(other) }, svg);
    }
    const d = path(vals);
    if (nowX != null) {
      el('path', { class: 'ds-line past', d, stroke, 'clip-path': 'url(#ds-past)' }, svg);
      el('path', { class: 'ds-line', d, stroke, 'clip-path': 'url(#ds-future)' }, svg);
    } else {
      el('path', { class: 'ds-line', d, stroke }, svg);
    }
    if (metric === 'temp') {
      const iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals));
      const lx = (i) => Math.min(Math.max(xAt(i), padL + 6), padL + plotW - 8); // keep labels inside
      el('text', { class: 'ds-hl', x: lx(iMax), y: yAt(vals[iMax]) - 12, 'text-anchor': 'middle' }, svg).textContent = 'H';
      el('text', { class: 'ds-hl', x: lx(iMin), y: yAt(vals[iMin]) + 22, 'text-anchor': 'middle' }, svg).textContent = 'L';
    }
  } else {
    const bw = Math.max(2, Math.min(12, (plotW / n) * 0.62));
    vals.forEach((v, i) => {
      if (!(v > 0)) return;
      const x = Math.min(Math.max(xAt(i) - bw / 2, padL), padL + plotW - bw);
      const y = yAt(v), h = top + plotH - y, r = Math.min(3, bw / 2, h);
      el('path', {
        class: `ds-bar ${metric}${nowX != null && xAt(i) < nowX - 1 ? ' past' : ''}`,
        d: `M${x},${top + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${top + plotH} Z`,
      }, svg);
    });
  }

  // "Now" line + dot
  if (nowX != null) {
    el('line', { class: 'ds-now', x1: nowX, x2: nowX, y1: top - 36, y2: top + plotH + bottom - 6 }, svg);
    if (isLine) {
      const i0 = Math.floor(ni), k = ni - i0;
      const v = vals[i0] + ((vals[Math.min(i0 + 1, n - 1)] ?? vals[i0]) - vals[i0]) * k;
      el('circle', { class: 'ds-now-dot', cx: nowX, cy: yAt(v), r: 5 }, svg);
    }
  }

  // Scrub cursor
  const cursor = el('g', { class: 'ds-cursor', visibility: 'hidden' }, svg);
  const cLine = el('line', { y1: top - 36, y2: top + plotH }, cursor);
  const cDot = el('circle', { r: 6 }, cursor);

  box.replaceChildren(svg);
  readout(null);

  // Press and hold / drag to scrub
  let active = false;
  const indexAt = (e) => {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * width;
    return Math.max(0, Math.min(n - 1, Math.round(((x - padL) / plotW) * (n - 1))));
  };
  const show = (i) => {
    const x = xAt(i);
    cLine.setAttribute('x1', x); cLine.setAttribute('x2', x);
    cDot.setAttribute('cx', x); cDot.setAttribute('cy', yAt(vals[i]));
    cursor.setAttribute('visibility', 'visible');
    readout(i);
  };
  svg.addEventListener('pointerdown', (e) => {
    active = true;
    try { svg.setPointerCapture(e.pointerId); } catch { /* keep scrubbing without capture */ }
    show(indexAt(e));
    navigator.vibrate?.(5);
  });
  svg.addEventListener('pointermove', (e) => { if (active) show(indexAt(e)); });
  const end = () => { active = false; cursor.setAttribute('visibility', 'hidden'); readout(null); };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
}

// ---------------------------------------------------------------------------
// Day summary facts
// ---------------------------------------------------------------------------

function renderFacts(d) {
  const hours = dayHours();
  const feels = hours.map((h) => h.feels);
  const rows = [
    [W.describe(d.code).label, 'Conditions'],
    [`${Math.round(d.hi)}° / ${Math.round(d.lo)}°`, 'High / Low'],
    [`${Math.round(Math.max(...feels))}° / ${Math.round(Math.min(...feels))}°`, 'Feels like high / low'],
    [`${d.prob ?? 0}% · ${(d.precip ?? 0).toFixed(2)}″`, 'Precipitation'],
    [`${Math.round(d.windMax)} mph ${W.compass(d.windDir)}`, `Gusts ${Math.round(d.gustMax)} mph`],
    [`${Math.round(d.uvMax ?? 0)} · ${W.uvLevel(d.uvMax)}`, 'Peak UV'],
    [W.clockLabel(d.sunrise), 'Sunrise'],
    [W.clockLabel(d.sunset), 'Sunset'],
  ];
  if (d.snow > 0) rows.splice(4, 0, [`${d.snow.toFixed(1)}″`, 'Snowfall']);
  $('ds-facts').innerHTML = `<h3>Day summary</h3><div class="day-facts">${rows.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
}
