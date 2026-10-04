// dashboard.js — read-only stats page for the laptop.
// Data/sync comes from data.js (same Gist, same localStorage as the logger);
// the numbers come from stats.js; this file only draws.

import * as D from './data.js';
import * as S from './stats.js';

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const RANGE_KEY = 'ht.dashRange';

let range = loadRange();

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function loadRange() {
  try {
    const r = localStorage.getItem(RANGE_KEY);
    if (['7', '30', '90', 'all'].includes(r)) return r;
  } catch { /* storage blocked */ }
  return '30';
}
function saveRange(r) {
  try { localStorage.setItem(RANGE_KEY, r); } catch { /* ignore */ }
}

/** Create an SVG element with attributes. */
function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

/** Create an HTML element with a class and optional text. */
function h(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const fmtDay = (key, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  D.parseKey(key).toLocaleDateString(undefined, opts);
const fmtShort = (key) => fmtDay(key, { month: 'short', day: 'numeric' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Round an axis max up to 1/2/5 × 10^k and return ~4 clean ticks. */
function niceScale(max) {
  if (!(max > 0)) max = 1;
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = 0; t <= top + 1e-9; t += step) ticks.push(t);
  return { max: top, ticks };
}

// ---------------------------------------------------------------------------
// Tooltip: any element with data-tip shows it on hover or keyboard focus.
// Tooltips only enhance — every value is also in the table view or labels.
// ---------------------------------------------------------------------------

function initTooltip() {
  const tip = $('tooltip');
  const show = (target) => {
    const text = target.closest?.('[data-tip]')?.getAttribute('data-tip');
    if (!text) return hide();
    tip.textContent = text;
    tip.hidden = false;
    const r = target.closest('[data-tip]').getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    let y = r.top - th - 8;
    if (y < 8) y = r.bottom + 8;                      // flip below if no room
    x = Math.max(8, Math.min(x, innerWidth - tw - 8)); // keep on screen
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  };
  const hide = () => { tip.hidden = true; };
  document.addEventListener('mouseover', (e) => show(e.target));
  document.addEventListener('focusin', (e) => show(e.target));
  document.addEventListener('focusout', hide);
  document.addEventListener('scroll', hide, true);
}

// ---------------------------------------------------------------------------
// Generic column chart (bars + optional line + optional goal reference line).
// Specs: bars ≤ 24px with a 4px rounded top, square at the baseline; 2px
// line; hairline solid gridlines; hit targets span the whole column slot.
// ---------------------------------------------------------------------------

function columnChart(container, o) {
  const n = o.items.length;
  const width = Math.max(container.clientWidth, 280);
  const height = o.height ?? 200;
  const m = { top: o.valueLabels ? 22 : 12, right: o.refLabel ? 64 : 12, bottom: 22, left: 40 };
  const plotW = width - m.left - m.right;
  const plotH = height - m.top - m.bottom;
  const slot = plotW / Math.max(n, 1);
  const barW = Math.max(1, Math.min(24, slot - 2)); // 2px surface gap between bars
  const y = (v) => m.top + plotH - (Math.min(v, o.yMax) / o.yMax) * plotH;
  const cx = (i) => m.left + slot * (i + 0.5);

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, height, role: 'img', 'aria-label': o.ariaLabel });

  // Gridlines + y tick labels
  for (const t of o.ticks) {
    svgEl('line', { class: 'gridline', x1: m.left, x2: m.left + plotW, y1: y(t), y2: y(t) }, svg);
    svgEl('text', { x: m.left - 8, y: y(t) + 4, 'text-anchor': 'end' }, svg).textContent = o.fmtTick(t);
  }

  // Bars
  o.items.forEach((item, i) => {
    const v = o.value(item);
    if (v == null || v <= 0) return;
    const top = y(v), base = y(0);
    const r = Math.min(4, barW / 2, base - top);
    const x = cx(i) - barW / 2;
    const style = o.barStyle(item);
    svgEl('path', {
      d: `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`,
      style: `fill:${style.color}`,
      opacity: style.opacity ?? 1,
    }, svg);
    if (o.valueLabels) {
      svgEl('text', { class: 'bar-label', x: cx(i), y: top - 6, 'text-anchor': 'middle' }, svg).textContent = o.fmtValue(v);
    }
  });

  // Goal reference line (a step line: it moves on the day a goal changed)
  if (o.ref) {
    let d = '', prev = null, last = null;
    o.items.forEach((item, i) => {
      const g = o.ref(item);
      if (g == null) { prev = null; return; }
      const x0 = m.left + slot * i, x1 = x0 + slot, gy = y(g);
      d += prev == null ? `M${x0},${gy} H${x1}` : `V${gy} H${x1}`;
      prev = g; last = { g, gy, x1 };
    });
    if (d) {
      svgEl('path', { d, fill: 'none', style: 'stroke:var(--text)', 'stroke-width': 1.5, opacity: 0.75 }, svg);
      svgEl('text', { class: 'ref-label', x: last.x1 + 6, y: last.gy + 4 }, svg).textContent = o.refLabel(last.g);
    }
  }

  // Trend line (gaps where there's no value)
  if (o.line) {
    let d = '', pen = false;
    o.items.forEach((item, i) => {
      const v = o.line(item);
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${cx(i)},${y(v)}`;
      pen = true;
    });
    if (d) svgEl('path', { d, fill: 'none', style: 'stroke:var(--text)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  }

  // X labels: thinned to fit, always including the last (most recent) one.
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 64))));
  o.items.forEach((item, i) => {
    if ((n - 1 - i) % every) return;
    const label = o.xLabel(item, i);
    if (label) svgEl('text', { x: cx(i), y: height - 6, 'text-anchor': 'middle' }, svg).textContent = label;
  });

  // Hit targets: the full column slot (bigger than the bar), keyboard-focusable
  // when there are few enough to tab through.
  o.items.forEach((item, i) => {
    svgEl('rect', {
      class: 'hit', x: m.left + slot * i, y: m.top, width: slot, height: plotH,
      'data-tip': o.tip(item), tabindex: n <= 31 ? 0 : null,
    }, svg);
  });

  container.replaceChildren(svg);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function renderSummary(data, days, today) {
  const overall = S.overallRate(data, days, today);
  const perfect = S.perfectDayStats(data, days, today);
  const rangeText = range === 'all' ? 'all time' : `last ${range} days`;

  const tile = (cls, label, value, detail) => {
    const t = h('div', `tile ${cls}`);
    t.append(h('div', 'label', label), h('div', 'value', value), h('div', 'detail', detail));
    return t;
  };
  $('summary').replaceChildren(
    tile('hero', 'Habits done', pct(overall.rate),
      `${overall.done} of ${plural(overall.eligible, 'habit-day')} · ${rangeText}`),
    tile('', 'Perfect days', String(perfect.count), `every habit done · ${rangeText}`),
    tile('', 'Perfect-day streak', plural(perfect.current, 'day'), `best ever: ${plural(perfect.best, 'day')}`),
  );
}

function renderDaily(data, days, today) {
  // Start 6 days early so the 7-day average is real from the first bar.
  const extended = range === 'all' ? days : S.dateSpan(D.addDays(days[0], -6), today);
  const { weekly, series } = S.completionSeries(data, extended, today, days[0]);
  const avgName = weekly ? '4-week average' : '7-day average';

  $('daily-sub').textContent = weekly
    ? 'Share of habits done each week (weekly bars because the range is long)'
    : 'Share of habits done each day';

  const legend = $('daily-legend');
  legend.replaceChildren();
  const addKey = (cls, color, label) => {
    const s = h('span');
    const k = h('i', `key ${cls}`);
    k.style.background = color;
    s.append(k, label);
    legend.append(s);
  };
  addKey('', 'var(--progress)', 'Share done');
  if (!weekly) addKey('', 'var(--done)', 'All done');
  addKey('line', 'var(--text)', avgName);

  columnChart($('daily-chart'), {
    items: series,
    height: 220,
    yMax: 1,
    ticks: [0, 0.25, 0.5, 0.75, 1],
    fmtTick: (t) => `${t * 100}%`,
    value: (it) => it.pct,
    barStyle: (it) => ({
      color: it.perfect ? 'var(--done)' : 'var(--progress)',
      opacity: it.inProgress ? 0.45 : 1, // today, still in progress
    }),
    line: (it) => it.rolling,
    xLabel: (it) => fmtShort(it.key),
    ariaLabel: `${weekly ? 'Weekly' : 'Daily'} share of habits done, with ${avgName}`,
    tip: (it) => {
      const head = weekly ? `Week of ${fmtShort(it.key)}` : fmtDay(it.key);
      const lines = [
        `${head}${it.inProgress ? ' (in progress)' : ''}`,
        it.total ? `${it.done} of ${it.total} done (${pct(it.pct)})` : 'No habits yet',
      ];
      if (weekly) lines.push(plural(it.perfectDays, 'perfect day'));
      if (it.rolling != null) lines.push(`${avgName}: ${pct(it.rolling)}`);
      return lines.join('\n');
    },
  });

  // Table twin of the chart (the accessible, exact-values view).
  const table = h('table');
  const head = table.createTHead().insertRow();
  for (const t of [weekly ? 'Week of' : 'Day', 'Done', 'Habits', 'Share', avgName]) head.append(h('th', '', t));
  const body = table.createTBody();
  for (const it of [...series].reverse()) {
    const r = body.insertRow();
    for (const t of [weekly ? fmtShort(it.key) : fmtDay(it.key), it.done, it.total, pct(it.pct), pct(it.rolling)]) {
      r.insertCell().textContent = t;
    }
  }
  const wrap = h('div', 'scroll');
  wrap.append(table);
  $('daily-table').replaceChildren(wrap);
}

/** Describe one habit/day for the grid tooltip. */
function describeCell(habit, data, date, state) {
  const value = data.log[date]?.[habit.id];
  const goal = D.effectiveGoal(habit, date);
  const fmt = () => {
    if (habit.type === 'check') return value === true ? 'Done' : 'Marked not done';
    if (habit.type === 'minutes') return `${value} min (max ${goal})`;
    return `${value} / ${goal}`;
  };
  let line;
  if (state === 'inactive') line = habit.createdAt && date < habit.createdAt ? 'Habit not created yet' : 'Archived';
  else if (state === 'pending') line = value == null ? 'Today: not logged yet' : `Today so far: ${fmt()}`;
  else if (value == null) line = 'Not logged';
  else line = state === 'done' ? `${fmt()} ✓` : `${fmt()}, not done`;
  return `${habit.name}\n${fmtDay(date)}\n${line}`;
}

function renderGrid(data, days, today) {
  const habits = S.habitsInDays(data, days);
  const scroll = $('grid-scroll');
  if (!habits.length) {
    scroll.replaceChildren(h('p', 'empty', 'No habits in this range.'));
    return;
  }

  const cell = days.length <= 7 ? 30 : days.length <= 31 ? 20 : 13;
  const table = h('table', 'grid');
  table.style.setProperty('--cell', `${cell}px`);
  const thead = table.createTHead();

  // Header: with roomy cells, a month row + every day number; with small
  // cells, only Mondays get a "Sep 28" label so nothing collides.
  if (cell >= 20) {
    const months = thead.insertRow();
    months.append(h('th', 'name'));
    days.forEach((d, i) => {
      const th = h('th', 'month', i === 0 || d.endsWith('-01') ? fmtDay(d, { month: 'short' }) : '');
      months.append(th);
    });
    const nums = thead.insertRow();
    nums.append(h('th', 'name'));
    days.forEach((d) => {
      const th = h('th', d === today ? 'today-label' : '', String(D.parseKey(d).getDate()));
      th.title = fmtDay(d);
      nums.append(th);
    });
  } else {
    const row = thead.insertRow();
    row.append(h('th', 'name'));
    days.forEach((d, i) => {
      const th = h('th');
      // First column gets a label too, unless a Monday label is close enough to collide.
      const firstLabel = i === 0 && S.weekdayIndex(d) <= 3;
      if (S.weekdayIndex(d) === 0 || firstLabel) {
        const span = h('span', '', fmtShort(d));
        span.style.cssText = 'position:absolute;left:0;bottom:2px;white-space:nowrap';
        th.style.position = 'relative';
        th.append(span);
      }
      row.append(th);
    });
  }

  const tbody = table.createTBody();
  for (const habit of habits) {
    const tr = tbody.insertRow();
    const name = h('th', 'name', habit.name);
    name.title = habit.name;
    if (habit.archived) name.append(h('span', 'tag', 'archived'));
    tr.append(name);
    for (const d of days) {
      const state = S.cellState(habit, data, d, today);
      const td = tr.insertCell();
      td.className = state + (d === today ? ' today' : '');
      // A × on missed cells as a second cue beyond color, when there's room.
      if (state === 'missed' && cell >= 20) td.textContent = '×';
      td.dataset.tip = describeCell(habit, data, d, state);
      if (days.length <= 31) td.tabIndex = 0;
    }
  }

  scroll.replaceChildren(table);
  scroll.scrollLeft = scroll.scrollWidth; // most recent days in view

  // Legend
  const legend = $('grid-legend');
  legend.replaceChildren();
  for (const [cls, label] of [['done', 'Done'], ['missed', 'Missed / not logged'], ['pending', 'Today, not yet'], ['inactive', 'Not tracked']]) {
    const s = h('span');
    const k = h('i', 'key');
    k.style.background = {
      done: 'var(--done)', missed: 'var(--miss-cell)', pending: 'var(--pending-cell)',
      inactive: 'repeating-linear-gradient(135deg, transparent 0 3px, var(--gridline) 3px 4px)',
    }[cls];
    if (cls === 'inactive') k.style.boxShadow = 'inset 0 0 0 1px var(--gridline)';
    s.append(k, label);
    legend.append(s);
  }
}

function renderHabitCards(data, days, today) {
  const habits = S.habitsInDays(data, days);
  const wrap = $('habit-cards');
  if (!habits.length) {
    wrap.replaceChildren(h('p', 'empty', 'No habits in this range.'));
    return;
  }
  wrap.replaceChildren(...habits.map((habit) => {
    const st = S.habitStats(habit, data, days, today);
    const card = h('section', 'card habit-card');
    const title = h('h2', '', habit.name);
    if (habit.archived) title.append(h('span', 'tag', 'archived'));
    card.append(title);

    const stats = h('div', 'stats');
    const stat = (num, lbl) => {
      const s = h('div', 'stat');
      s.append(h('div', 'num', num), h('div', 'lbl', lbl));
      return s;
    };
    stats.append(
      stat(pct(st.rate), `${st.done} of ${plural(st.eligible, 'day')}`),
      stat(habit.archived ? '—' : plural(st.current, 'day'), 'current streak'),
      stat(plural(st.best, 'day'), 'best streak'),
    );
    card.append(stats);

    // Value chart for minutes / count habits: what you actually logged vs the goal.
    if (habit.type === 'minutes' || habit.type === 'count') {
      const { weekly, series } = S.valueSeries(habit, data, days, today);
      const unit = habit.type === 'minutes' ? ' min' : '';
      const maxVal = Math.max(0, ...series.map((x) => Math.max(x.value ?? 0, x.goal ?? 0)));
      const scale = niceScale(maxVal * 1.1);
      const chart = h('div', 'chart');
      card.append(chart);
      // Drawn after insertion so the container has a width.
      queueMicrotask(() => columnChart(chart, {
        items: series,
        height: 150,
        yMax: scale.max,
        ticks: scale.ticks,
        fmtTick: (t) => String(t),
        value: (it) => it.value,
        barStyle: () => ({ color: 'var(--progress)' }),
        ref: (it) => it.goal,
        refLabel: (g) => (habit.type === 'minutes' ? `max ${g}` : `target ${g}`),
        xLabel: (it) => fmtShort(it.key),
        ariaLabel: `${habit.name}: ${weekly ? 'weekly average' : 'daily'} values against the goal`,
        tip: (it) => {
          const head = weekly ? `Week of ${fmtShort(it.key)}` : fmtDay(it.key);
          if (!it.active) return `${head}\nNot tracked`;
          if (it.value == null) return `${head}\nNot logged (goal ${it.goal}${unit})`;
          const v = Math.round(it.value * 10) / 10;
          return weekly
            ? `${head}\nAverage ${v}${unit} over ${plural(it.loggedDays, 'logged day')}\nGoal ${it.goal}${unit}`
            : `${head}\n${v}${unit} (goal ${it.goal}${unit})`;
        },
      }));
    }
    return card;
  }));
}

function renderWeekdays(data, days, today) {
  const rates = S.weekdayRates(data, days, today);
  const known = rates.filter((r) => r.rate != null);
  if (known.length >= 2) {
    const best = known.reduce((a, b) => (b.rate > a.rate ? b : a));
    const worst = known.reduce((a, b) => (b.rate < a.rate ? b : a));
    $('weekday-sub').textContent = `Best: ${best.name} (${pct(best.rate)}) · Toughest: ${worst.name} (${pct(worst.rate)})`;
  } else {
    $('weekday-sub').textContent = 'Needs a few more days of data.';
  }
  columnChart($('weekday-chart'), {
    items: rates,
    height: 180,
    yMax: 1,
    ticks: [0, 0.5, 1],
    fmtTick: (t) => `${t * 100}%`,
    value: (it) => it.rate,
    valueLabels: true, // only 7 bars, so every bar gets its value on the cap
    fmtValue: (v) => pct(v),
    barStyle: () => ({ color: 'var(--progress)' }),
    xLabel: (it) => it.name,
    ariaLabel: 'Share of habits done by day of week',
    tip: (it) => (it.rate == null ? `${it.name}\nNo data` : `${it.name}\n${it.done} of ${plural(it.eligible, 'habit-day')} (${pct(it.rate)})`),
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function render() {
  const data = D.getData();
  const today = D.todayKey(data.settings.dayStartHour);
  const days = S.rangeDays(data, range, today);

  for (const b of $('range').querySelectorAll('button')) {
    b.setAttribute('aria-checked', String(b.dataset.range === range));
  }
  $('setup-banner').hidden = D.isConfigured();

  renderSummary(data, days, today);
  renderDaily(data, days, today);
  renderGrid(data, days, today);
  renderHabitCards(data, days, today);
  renderWeekdays(data, days, today);
}

const STATUS_LABELS = { saved: 'Synced', saving: 'Syncing…', offline: 'Offline', error: 'Sync error', setup: 'Not connected' };

function renderStatus() {
  const { status, message } = D.getStatus();
  const pill = $('sync-pill');
  pill.dataset.status = status;
  pill.querySelector('.sync-text').textContent = STATUS_LABELS[status] || status;
  pill.title = message || 'Sync now';
}

function init() {
  initTooltip();
  $('range').addEventListener('click', (e) => {
    const r = e.target.closest('button')?.dataset.range;
    if (!r || r === range) return;
    range = r;
    saveRange(r);
    render();
  });
  $('sync-pill').addEventListener('click', () => D.sync());

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });

  D.subscribe((e) => (e.type === 'data' ? render() : renderStatus()));
  render();        // instant, from the local cache
  renderStatus();
  D.startAutoSync(); // then fresh data from the Gist (and again on focus)
}

init();
