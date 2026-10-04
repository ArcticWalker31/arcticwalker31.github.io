// chart.js — the hourly chart (SVG). One mode at a time, never two y-axes:
//   temp:   temperature line (+ fainter feels-like line) with a soft wash
//   precip: rain-chance bars (0–100%), amounts listed under the hours
//   uv:     UV index bars
// Night hours get a faint band; midnight gets a day divider.

import { iconPaths } from './icons.js';
import { hourLabel, weekday, iconFor } from './weather.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function text(parent, x, y, str, cls, anchor = 'middle') {
  const t = el('text', { x, y, class: cls, 'text-anchor': anchor }, parent);
  t.textContent = str;
  return t;
}

/** Bar with a 4px rounded top and a square base. */
function bar(parent, cx, w, top, base, cls) {
  const h = base - top;
  if (h <= 0.5) return;
  const r = Math.min(4, w / 2, h);
  const x = cx - w / 2;
  el('path', {
    class: cls,
    d: `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`,
  }, parent);
}

/**
 * @param hours   hourly entries (from weather.js)
 * @param o.mode  'temp' | 'precip' | 'uv'
 * @param o.pointW  px per hour
 * @param o.every   label every Nth hour (1 = every hour)
 * @param o.nowIndex  index to label "Now" (or -1)
 */
export function hourlyChart(hours, o) {
  const pw = o.pointW;
  const every = o.every ?? 1;
  const n = hours.length;
  const W = Math.round(pw * n);
  const top = 30;                 // room for value labels
  const plotH = o.plotH ?? 80;
  const base = top + plotH;
  const iconY = base + 12;
  const timeY = iconY + 40;
  const extraY = timeY + 16;
  const H = extraY + 6;
  const cx = (i) => pw * (i + 0.5);
  const show = (i) => i % every === 0;

  const svg = el('svg', { class: `hourly-chart mode-${o.mode}`, width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': o.ariaLabel || 'Hourly forecast' });

  // Night bands
  let start = -1;
  hours.forEach((h, i) => {
    if (!h.isDay && start < 0) start = i;
    if ((h.isDay || i === n - 1) && start >= 0) {
      const end = h.isDay ? i : i + 1;
      el('rect', { class: 'night', x: start * pw, y: 0, width: (end - start) * pw, height: base + 4 }, svg);
      start = -1;
    }
  });

  // Day dividers at midnight
  hours.forEach((h, i) => {
    if (i > 0 && h.time.endsWith('T00:00')) {
      el('line', { class: 'divider', x1: i * pw, x2: i * pw, y1: 4, y2: H - 4 }, svg);
      text(svg, i * pw + 6, 14, weekday(h.time.slice(0, 10)), 'day-label', 'start');
    }
  });

  // Baseline
  el('line', { class: 'baseline', x1: 0, x2: W, y1: base, y2: base }, svg);

  if (o.mode === 'temp') {
    const vals = hours.flatMap((h) => [h.temp, h.feels]).filter((v) => v != null);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (max - min < 8) { const mid = (max + min) / 2; min = mid - 4; max = mid + 4; }
    const y = (v) => top + 6 + (1 - (v - min) / (max - min)) * (plotH - 12);
    const line = (key) => hours.map((h, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${y(h[key]).toFixed(1)}`).join('');
    const temp = line('temp');
    el('path', { class: 'area', d: `${temp}L${cx(n - 1)},${base}L${cx(0)},${base}Z` }, svg);
    el('path', { class: 'line-feels', d: line('feels') }, svg);
    el('path', { class: 'line-temp', d: temp }, svg);
    hours.forEach((h, i) => {
      if (!show(i)) return;
      el('circle', { class: 'dot', cx: cx(i), cy: y(h.temp), r: 3 }, svg);
      text(svg, cx(i), y(h.temp) - 9, `${Math.round(h.temp)}°`, 'value');
    });
  } else if (o.mode === 'precip') {
    const y = (v) => base - (v / 100) * plotH;
    const w = Math.min(16, pw * 0.5);
    hours.forEach((h, i) => {
      const p = h.prob ?? 0;
      bar(svg, cx(i), w, y(p), base, 'bar-precip');
      if (show(i)) text(svg, cx(i), y(p) - 7, `${p}%`, 'value');
    });
  } else if (o.mode === 'uv') {
    const maxUv = Math.max(8, ...hours.map((h) => h.uv ?? 0));
    const y = (v) => base - (v / maxUv) * plotH;
    const w = Math.min(16, pw * 0.5);
    hours.forEach((h, i) => {
      const v = h.uv ?? 0;
      bar(svg, cx(i), w, y(v), base, 'bar-uv');
      if (show(i) && h.isDay) text(svg, cx(i), y(v) - 7, String(Math.round(v)), 'value');
    });
  }

  // Icon + time (+ extra line) under every labeled hour
  hours.forEach((h, i) => {
    if (!show(i)) return;
    const g = el('svg', {
      x: cx(i) - 11, y: iconY, width: 22, height: 22, viewBox: '0 0 24 24',
      class: 'hour-icon', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }, svg);
    g.innerHTML = iconPaths(iconFor(h.code, h.isDay));
    text(svg, cx(i), timeY, i === o.nowIndex ? 'Now' : hourLabel(h.time), i === o.nowIndex ? 'time now' : 'time');
    let extra = '';
    if (o.mode === 'temp' && (h.prob ?? 0) >= 20) extra = `${h.prob}%`;
    if (o.mode === 'precip' && h.precip >= 0.01) extra = `${h.precip.toFixed(2)}″`;
    if (extra) text(svg, cx(i), extraY, extra, 'extra');
  });

  return svg;
}
