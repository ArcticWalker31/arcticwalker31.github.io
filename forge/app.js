// app.js — Forge UI: home (Kai + week + next workout), history, skills,
// awards, the workout runner (circuit rounds + rest timer), and settings.

import * as D from './data.js?v=4';
import { LADDERS, WORKOUTS, ROTATION, keyToSlot } from './program.js?v=4';
import { NODES, EDGES, STARTS, BRANCHES, STATUSES } from './tree.js?v=4';
import { checkIn, levelUpLine, poseImg } from './trainer.js?v=4';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = D.store;
const data = () => store.getData();
const ls = {
  get(k, f) { try { return JSON.parse(localStorage.getItem('fg.' + k)) ?? f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem('fg.' + k, JSON.stringify(v)); } catch { /* blocked */ } },
};

// ---------------------------------------------------------------------------
// Icons (Lucide-style, ISC)
// ---------------------------------------------------------------------------
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  ladder: '<path d="M8 3v18M16 3v18M8 7h8M8 12h8M8 17h8"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  star: '<path d="M11.5 2.3a.5.5 0 0 1 1 0l2.3 4.7 5.2.8a.5.5 0 0 1 .3.9l-3.8 3.6.9 5.2a.5.5 0 0 1-.8.5L12 15.6l-4.6 2.4a.5.5 0 0 1-.8-.5l.9-5.2-3.8-3.6a.5.5 0 0 1 .3-.9l5.2-.8z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};
const icon = (name, size = 22, stroke = 2) => `<svg class="icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

// ---------------------------------------------------------------------------
// Color schemes (per device)
// ---------------------------------------------------------------------------
const THEMES = {
  golden: { name: 'Golden Hour', sw: ['#F2A541', '#E07A3F', '#17100A'], bar: '#17100A' },
  midnight: { name: 'Midnight', sw: ['#4F8CFF', '#7CF0FF', '#0A0F1E'], bar: '#0A0F1E' },
  arcade: { name: 'Arcade', sw: ['#39FF88', '#FF3CAC', '#07070B'], bar: '#07070B' },
  earthy: { name: 'Earthy', sw: ['#60935D', '#EE6352', '#FEFFEA'], bar: null },
  clean: { name: 'Clean', sw: ['#12151B', '#2563EB', '#F5F6F8'], bar: null },
};
let theme = THEMES[ls.get('theme')] ? ls.get('theme') : 'golden';
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  $('theme-color').setAttribute('content', THEMES[theme].bar || getComputedStyle(document.body).backgroundColor);
}

// ---------------------------------------------------------------------------
// Tabs & header
// ---------------------------------------------------------------------------
let tab = 'home';
function showTab(next) {
  tab = next;
  for (const b of document.querySelectorAll('.tabbar button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${tab}`;
  render();
  scrollTo(0, 0);
}

function renderHeader() {
  const info = D.levelInfo(D.totalXp(data()));
  $('level-chip').textContent = `Lv ${info.level} · ${info.title}`;
  $('xpbar').querySelector('span').style.width = `${Math.round(info.pct * 100)}%`;
  $('xpbar').setAttribute('aria-valuenow', Math.round(info.pct * 100));
  const { status, message } = store.getStatus();
  $('sync-pill').dataset.status = status;
  $('sync-pill').querySelector('.sync-text').textContent = { saved: 'Synced', saving: 'Saving…', offline: 'Offline', error: 'Sync error', setup: 'Not synced' }[status] || status;
  $('sync-pill').title = message || 'Sync now';
}

function render() {
  renderHeader();
  if (tab === 'home') renderHome();
  if (tab === 'history') renderHistory();
  if (tab === 'skills') renderSkills();
  if (tab === 'awards') renderAwards();
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
let chosen = null; // workout picked instead of the rotation's next

function exRow(d, { exId, ladder }) {
  const lad = D.ladderStep(ladder, exId);
  return `<li><span>${esc(D.ex(exId).name)}${lad ? `<span class="skill">${esc(lad.ladder.name)} ${lad.index + 1}/${lad.ladder.steps.length}</span>` : ''}</span><span class="tgt">${D.fmtTarget(d, exId)}</span></li>`;
}

function renderHome() {
  const d = data();
  const next = chosen || D.nextWorkout(d);
  const week = D.weekStats(d);
  const kai = checkIn({ sessions: d.sessions.length, daysSince: D.daysSinceLast(d), next: WORKOUTS[next].name, week });
  const todayIdx = (new Date().getDay() + 6) % 7;
  const dots = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => `<span class="${week.days.has(i) ? 'on' : ''} ${i === todayIdx ? 'today' : ''}"><i></i>${l}</span>`).join('');
  const dismissed = ls.get('dismissed', {});
  const sugg = D.suggestions(d).filter((s) => dismissed[s.exId] !== d.sessions.length);

  $('view-home').innerHTML = `
    <section class="card kai-card">
      ${poseImg(kai.pose)}
      <div class="kai-say"><div class="kai-name">Kai</div><div class="bubble">${esc(kai.text)}</div></div>
    </section>

    <section class="card">
      <div class="week">
        <div class="week-count">${week.done}<small> / ${week.goal} this week</small></div>
        <div class="week-dots" aria-label="Days trained this week">${dots}</div>
      </div>
      <div class="streak">${week.streak ? `🔥 ${week.streak}-week streak` : week.left ? `${week.left} more to hit your weekly goal` : ''}</div>
    </section>

    <section class="card">
      <div class="next-head"><span class="next-label">${chosen ? 'Picked' : 'Next up'}</span><span class="muted">${d.settings.rounds} rounds · rest ${fmtClock(d.settings.rest)} · <button class="link-btn" type="button" data-edit="${next}">Edit</button></span></div>
      <div class="next-name">${esc(WORKOUTS[next].name)}</div>
      <ul class="ex-list">${D.workoutItems(d, next).map((it) => exRow(d, it)).join('')}</ul>
      <button class="btn primary wide" type="button" data-start="${next}">Start ${esc(WORKOUTS[next].name)}</button>
      <div class="other"><span class="muted">Or:</span>${ROTATION.filter((w) => w !== next).map((w) => `<button class="chip" type="button" data-choose="${w}">${esc(WORKOUTS[w].name)}</button>`).join('')}${chosen ? '<button class="chip" type="button" data-choose="">Back to rotation</button>' : ''}</div>
    </section>

    ${sugg.length ? `<h2 class="sec">Kai says: level up</h2>${sugg.map((s) => `<section class="card suggest">
      <div class="txt">${s.type === 'ladder'
        ? `You've mastered <b>${esc(D.ex(s.exId).name)}</b>. Unlock <b>${esc(D.ex(s.next).name)}</b>?`
        : `<b>${esc(D.ex(s.exId).name)}</b> is getting easy. New target ${s.value[0]}–${s.value[1]}${D.ex(s.exId).kind === 'time' ? 's' : ''}${D.ex(s.exId).note?.includes('weight') || s.exId === 'decline-pushup' ? ' (or add weight)' : ''}?`}</div>
      <button class="btn small primary" type="button" data-apply="${s.exId}">Yes</button>
      <button class="btn small" type="button" data-dismiss="${s.exId}">Not yet</button>
    </section>`).join('')}` : ''}`;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
let openSession = null;
function renderHistory() {
  const d = data();
  const list = [...d.sessions].reverse();
  const records = Object.keys(D.allExercises(d)).map((id) => [id, D.bestValue(d, id)]).filter(([, v]) => v != null);
  $('view-history').innerHTML = list.length ? `
    <h2 class="sec">Workouts</h2>
    ${list.map((s) => {
      const date = new Date(s.start);
      const mins = s.end ? Math.round((new Date(s.end) - date) / 60000) : null;
      const exIds = [...new Set(s.rounds.flatMap((r) => Object.keys(r)))];
      return `<section class="card">
        <button class="hist-head" type="button" data-session="${esc(s.id)}" aria-expanded="${openSession === s.id}">
          <span><span class="hist-title">${esc(WORKOUTS[s.workout]?.name || s.workout)}</span>${s.prs?.length ? '<span class="pr-tag">PR</span>' : ''}
            <span class="hist-sub" style="display:block">${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${s.rounds.length} rounds${mins ? ` · ${mins} min` : ''}</span></span>
          <span class="hist-xp">+${s.xp || 0} XP</span>
        </button>
        ${openSession === s.id ? `<div class="hist-body"><table>${exIds.map((id) => `<tr><td>${esc(D.ex(id).name)}${s.prs?.includes(id) ? '<span class="pr-tag">PR</span>' : ''}</td><td>${s.rounds.map((r) => D.fmtValue(id, r[id])).join(' · ')}</td></tr>`).join('')}</table>
          <div class="row"><button class="btn small" type="button" data-delete="${esc(s.id)}">Delete workout</button></div></div>` : ''}
      </section>`;
    }).join('')}
    <h2 class="sec">Personal records</h2>
    <section class="card"><ul class="records">${records.map(([id, v]) => `<li><span>${esc(D.ex(id).name)}</span><b>${D.fmtValue(id, v)}</b></li>`).join('')}</ul></section>`
    : '<section class="card"><p class="muted">No workouts yet. Your first one is waiting on Home.</p></section>';
}

// ---------------------------------------------------------------------------
// Skills: the skill tree (pan / pinch-zoom), tap a skill to set its status
// ---------------------------------------------------------------------------
const SVG_NS = 'http://www.w3.org/2000/svg';
const NODE_R = 110;
const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n]));
const BOUNDS = (() => {
  const xs = [...NODES.map((n) => n.x), ...BRANCHES.map((b) => b.x)], ys = [...NODES.map((n) => n.y), ...BRANCHES.map((b) => b.y)];
  return { x0: Math.min(...xs) - 400, x1: Math.max(...xs) + 400, y0: Math.min(...ys) - 300, y1: Math.max(...ys) + 300 };
})();
let view = ls.get('treeView', null); // { tx, ty, k } screen = world * k + t

function renderSkills() {
  const d = data();
  const r = D.skillRank(d);
  const mastered = Object.values(d.skills).filter((s) => s === 'mastered').length;
  $('view-skills').innerHTML = `
    <section class="card rank-card">
      <div class="rank-top"><div><div class="rank-label">Skill rank</div><div class="rank-name">${esc(r.rank)}</div></div>
        <div class="rank-pts"><b>${r.points}</b> pts<small>${mastered} mastered${r.next ? ` · ${r.next.at - r.points} to ${esc(r.next.name)}` : ''}</small></div></div>
      <div class="legend">${STATUSES.map((s) => `<span><i class="st st-${s.id}"></i><b>${s.name}</b><small>${s.rule}</small></span>`).join('')}</div>
    </section>
    <div class="tree-wrap" id="tree-wrap">
      <svg id="tree-svg" role="img" aria-label="Calisthenics skill tree"><g id="tree-g"></g></svg>
      <div class="tree-ctrl"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="fit" aria-label="Fit whole tree">⤢</button></div>
    </div>
    <p class="fine">Drag to move, pinch or +/− to zoom, tap a skill to set its status. Skills you log in workouts upgrade on their own. Grades run F (easiest) → SS.</p>`;
  drawTree();
  attachTreeGestures();
}

function drawTree() {
  const d = data();
  const g = $('tree-g');
  if (!g) return;
  const lines = EDGES.map(([a, b]) => {
    const s = nodeById[a], t = nodeById[b];
    const dx = t.x - s.x, dy = t.y - s.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const lit = D.skillStatus(d, a) !== 'locked';
    return `<line class="edge${lit ? ' lit' : ''}" x1="${s.x + ux * NODE_R}" y1="${s.y + uy * NODE_R}" x2="${t.x - ux * (NODE_R + 26)}" y2="${t.y - uy * (NODE_R + 26)}" marker-end="url(#arrow${lit ? '-lit' : ''})"/>`;
  }).join('');
  const label = (name) => {
    const words = name.split(' ');
    const rows = [];
    for (const w of words) (rows.length && (rows[rows.length - 1] + ' ' + w).length <= 13) ? rows[rows.length - 1] += ' ' + w : rows.push(w);
    return rows.map((row, i) => `<tspan x="0" dy="${i ? 54 : 0}">${esc(row)}</tspan>`).join('');
  };
  const nodes = NODES.map((n) => {
    const st = D.skillStatus(d, n.id);
    return `<g class="node st-${st}" data-node="${n.id}" transform="translate(${n.x} ${n.y})">
      <circle class="hit" r="${NODE_R + 30}"/>
      <circle class="ring" r="${NODE_R}"/>
      <text class="grade" y="22">${n.grade}</text>
      <text class="name" y="${NODE_R + 62}">${label(n.name)}</text>
    </g>`;
  }).join('');
  g.innerHTML = `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="arrow"/></marker>
      <marker id="arrow-lit" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="arrow lit"/></marker>
    </defs>
    ${BRANCHES.map((b) => `<text class="branch" x="${b.x}" y="${b.y}">${esc(b.name.toUpperCase())}</text>`).join('')}
    ${STARTS.map((s) => `<g class="start" transform="translate(${s.x + 90} ${s.y})"><rect x="-90" y="-36" width="180" height="72" rx="36"/><text y="16">START</text></g>`).join('')}
    ${lines}${nodes}`;
  applyView();
}

function fitView() {
  const wrap = $('tree-wrap');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  const k = Math.min(W / (BOUNDS.x1 - BOUNDS.x0), H / (BOUNDS.y1 - BOUNDS.y0));
  view = { k, tx: W / 2 - ((BOUNDS.x0 + BOUNDS.x1) / 2) * k, ty: H / 2 - ((BOUNDS.y0 + BOUNDS.y1) / 2) * k };
}
/** Default view: zoomed in enough to read, centered on your progress (or Push-up). */
function startView() {
  const wrap = $('tree-wrap');
  const d = data();
  const mine = NODES.filter((n) => D.skillStatus(d, n.id) !== 'locked');
  const pts = mine.length ? mine : [nodeById['2']];
  const cx = pts.reduce((a, n) => a + n.x, 0) / pts.length, cy = pts.reduce((a, n) => a + n.y, 0) / pts.length;
  const k = 0.22;
  view = { k, tx: wrap.clientWidth / 2 - cx * k, ty: wrap.clientHeight / 2 - cy * k };
}
function applyView() {
  if (!view) startView();
  $('tree-g')?.setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.k})`);
}
function zoomAt(factor, cx, cy) {
  const k = Math.min(1.2, Math.max(0.03, view.k * factor));
  const f = k / view.k;
  view = { k, tx: cx - (cx - view.tx) * f, ty: cy - (cy - view.ty) * f };
  applyView();
  ls.set('treeView', view);
}

function attachTreeGestures() {
  const wrap = $('tree-wrap');
  const pts = new Map();
  let moved = 0, downNode = null, pinch = null;
  const local = (e) => { const r = wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.tree-ctrl')) return;
    wrap.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, local(e));
    moved = 0;
    downNode = pts.size === 1 ? e.target.closest('[data-node]')?.dataset.node : null;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]) };
    }
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId), cur = local(e);
    pts.set(e.pointerId, cur);
    if (pts.size === 1) {
      view.tx += cur[0] - prev[0];
      view.ty += cur[1] - prev[1];
      moved += Math.abs(cur[0] - prev[0]) + Math.abs(cur[1] - prev[1]);
      applyView();
    } else if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt(dist / pinch.dist, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      pinch.dist = dist;
      moved = 99;
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!pts.size) {
      ls.set('treeView', view);
      if (downNode && moved < 8) openSkill(downNode);
      downNode = null;
    }
  };
  wrap.addEventListener('pointerup', up);
  wrap.addEventListener('pointercancel', up);
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = local(e);
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y);
  }, { passive: false });
  wrap.querySelector('.tree-ctrl').addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoom]')?.dataset.zoom;
    if (!z) return;
    if (z === 'fit') { fitView(); applyView(); ls.set('treeView', view); return; }
    zoomAt(z === 'in' ? 1.4 : 1 / 1.4, wrap.clientWidth / 2, wrap.clientHeight / 2);
  });
}

let openNode = null;
function openSkill(id) {
  openNode = id;
  renderSkillSheet();
  $('skill-sheet').showModal();
}
function renderSkillSheet() {
  const d = data();
  const n = nodeById[openNode];
  if (!n) return;
  const st = D.skillStatus(d, n.id);
  const pre = EDGES.filter(([, b]) => b === n.id).map(([a]) => nodeById[a]);
  const next = EDGES.filter(([a]) => a === n.id).map(([, b]) => nodeById[b]);
  const chip = (x) => `<button type="button" class="skill-chip st-${D.skillStatus(d, x.id)}" data-node-open="${x.id}"><span class="g">${x.grade}</span>${esc(x.name)}</button>`;
  $('skill-body').innerHTML = `
    <div class="skill-head"><span class="grade-badge">${n.grade}</span><h2>${esc(n.name)}</h2></div>
    <div class="status-pick" role="radiogroup" aria-label="Status">${STATUSES.map((s) => `<button type="button" role="radio" data-status="${s.id}" aria-checked="${s.id === st}" class="st-${s.id}"><b>${s.name}</b><small>${s.rule}</small></button>`).join('')}</div>
    ${pre.length ? `<h3>Builds on</h3><div class="chips">${pre.map(chip).join('')}</div>` : '<h3>Starting skill</h3><p class="fine">No prerequisites: a branch starts here.</p>'}
    ${next.length ? `<h3>Leads to</h3><div class="chips">${next.map(chip).join('')}</div>` : ''}
    <a class="btn wide" style="margin-top:18px" href="https://www.youtube.com/results?search_query=${encodeURIComponent(n.name + ' calisthenics tutorial')}" target="_blank" rel="noopener">How to: tutorials ↗</a>`;
}

// ---------------------------------------------------------------------------
// Workout editor (Edit button on Home)
// ---------------------------------------------------------------------------
let editKey = 'pull';
let adding = false;

function openEditor(key) {
  editKey = key;
  adding = false;
  renderEditor();
  $('editor').showModal();
}

function renderEditor() {
  const d = data();
  const slots = d.settings.workouts[editKey] || [];
  $('editor-tabs').innerHTML = ROTATION.map((w) => `<button type="button" role="tab" data-edit-tab="${w}" aria-selected="${w === editKey}">${esc(WORKOUTS[w].name)}</button>`).join('');
  $('editor-list').innerHTML = slots.length ? slots.map((key, i) => {
    const slot = keyToSlot(key);
    const exId = D.resolveSlot(d, slot);
    const e = D.ex(exId, d);
    const [a, b] = D.target(d, exId);
    const ladderSel = typeof slot === 'string' ? '' : `<label class="ed-step"><span>${esc(LADDERS[slot.ladder].name)} step</span>
      <select data-ladder="${slot.ladder}">${LADDERS[slot.ladder].steps.map((sid, si) => `<option value="${si}" ${sid === exId ? 'selected' : ''}>${si + 1}. ${esc(D.ex(sid, d).name)}</option>`).join('')}</select></label>`;
    return `<li data-i="${i}">
      <div class="ed-main"><div class="ed-name">${esc(e.name)}${typeof slot === 'string' ? '' : ' <span class="skill">SKILL</span>'}</div>${ladderSel}
        <div class="ed-target" data-ex="${esc(exId)}"><input type="number" min="0" value="${a}" aria-label="Target min"><span>–</span><input type="number" min="0" value="${b}" aria-label="Target max"><span class="muted">${e.kind === 'time' ? 'sec' : 'reps'}${e.perSide ? ' each' : ''}</span></div></div>
      <div class="ed-btns"><button type="button" data-move="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-move="1" aria-label="Move down" ${i === slots.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-remove aria-label="Remove">✕</button></div>
    </li>`;
  }).join('') : '<li class="fine">No exercises yet. Add some below.</li>';

  const inWorkout = new Set(slots);
  const lib = Object.entries(D.allExercises(d)).filter(([id]) => !inWorkout.has(id));
  const ladders = Object.entries(LADDERS).filter(([id]) => !inWorkout.has(`ladder:${id}`));
  $('editor-add').innerHTML = adding ? `
    <input type="search" id="ed-search" placeholder="Search exercises" autocomplete="off">
    <div class="ed-pick" id="ed-pick">
      ${ladders.map(([id, l]) => `<button type="button" data-add="ladder:${id}"><b>${esc(l.name)}</b><small>Skill ladder · ${l.steps.length} steps</small></button>`).join('')}
      ${lib.map(([id, e]) => `<button type="button" data-add="${esc(id)}" data-name="${esc(e.name.toLowerCase())}"><b>${esc(e.name)}</b><small>${D.fmtTarget(d, id)}</small></button>`).join('')}
    </div>
    <details class="ed-custom"><summary>Create your own exercise</summary>
      <div class="ed-custom-form">
        <input id="cx-name" type="text" placeholder="Name (e.g. Archer push-ups)" maxlength="40">
        <select id="cx-kind"><option value="reps">Reps</option><option value="time">Seconds</option></select>
        <input id="cx-min" type="number" min="0" placeholder="Min" value="8"><input id="cx-max" type="number" min="0" placeholder="Max" value="12">
        <button class="btn primary" type="button" id="cx-add">Add</button>
      </div>
    </details>
    <button class="btn wide" type="button" data-adding="0">Done adding</button>`
    : '<button class="btn primary wide" type="button" data-adding="1">+ Add exercise</button>';
}

function onEditorClick(e) {
  const d = data();
  const slots = [...(d.settings.workouts[editKey] || [])];
  const t = e.target;
  const tab = t.closest('[data-edit-tab]');
  if (tab) { editKey = tab.dataset.editTab; adding = false; renderEditor(); return; }
  const li = t.closest('#editor-list li[data-i]');
  if (li && t.closest('[data-move]')) {
    const i = Number(li.dataset.i), j = i + Number(t.closest('[data-move]').dataset.move);
    [slots[i], slots[j]] = [slots[j], slots[i]];
    store.commit({ t: 'workout', key: editKey, slots });
    return renderEditor();
  }
  if (li && t.closest('[data-remove]')) {
    slots.splice(Number(li.dataset.i), 1);
    store.commit({ t: 'workout', key: editKey, slots });
    return renderEditor();
  }
  const add = t.closest('[data-add]');
  if (add) {
    store.commit({ t: 'workout', key: editKey, slots: [...slots, add.dataset.add] });
    return renderEditor();
  }
  const adder = t.closest('[data-adding]');
  if (adder) { adding = adder.dataset.adding === '1'; renderEditor(); if (adding) $('ed-search')?.focus(); return; }
  if (t.closest('#cx-add')) {
    const name = $('cx-name').value.trim();
    if (!name) return $('cx-name').focus();
    const kind = $('cx-kind').value;
    const a = Math.max(0, parseInt($('cx-min').value, 10) || 0), b = Math.max(a, parseInt($('cx-max').value, 10) || a);
    let id = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    while (D.allExercises(d)[id]) id += '-2';
    store.commit({ t: 'custom', exercise: { id, name, kind, target: [a, b], cues: [] } }, { t: 'workout', key: editKey, slots: [...slots, id] });
    renderEditor();
  }
}

function onEditorChange(e) {
  const t = e.target;
  const ladder = t.closest('[data-ladder]');
  if (ladder) { store.commit({ t: 'ladder', id: ladder.dataset.ladder, step: Number(ladder.value) }); return renderEditor(); }
  const tgt = t.closest('.ed-target');
  if (tgt) {
    const [a, b] = [...tgt.querySelectorAll('input')].map((i) => Math.max(0, parseInt(i.value, 10) || 0));
    store.commit({ t: 'target', id: tgt.dataset.ex, value: [Math.min(a, b), Math.max(a, b)] });
  }
}

// ---------------------------------------------------------------------------
// Awards
// ---------------------------------------------------------------------------
function renderAwards() {
  const d = data();
  const info = D.levelInfo(D.totalXp(d));
  $('view-awards').innerHTML = `
    <section class="card level-card">
      <div class="level-big">${info.level}</div>
      <div class="level-title">${esc(info.title)}</div>
      <div class="level-bar"><span style="width:${Math.round(info.pct * 100)}%"></span></div>
      <div class="muted">${info.into} / ${info.need} XP to level ${info.level + 1} · ${D.totalXp(d)} XP total</div>
    </section>
    <h2 class="sec">Achievements</h2>
    <div class="badges">${D.ACHIEVEMENTS.map((a) => {
      const got = d.achievements[a.id];
      return `<div class="badge ${got ? '' : 'locked'}"><div class="medal">${icon(got ? 'star' : 'lock', 22)}</div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`;
    }).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Workout runner
// ---------------------------------------------------------------------------
let run = ls.get('active', null); // persisted so leaving the app mid-workout is safe
let tick = 0, hold = null, wakeLock = null, audio = null;
const saveRun = () => ls.set('active', run);
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function startWorkout(key) {
  const d = data();
  audio ||= new (window.AudioContext || window.webkitAudioContext)(); // unlock sound on this tap
  const items = D.workoutItems(d, key);
  run = { workout: key, exercises: items.map((i) => i.exId), ladders: items.map((i) => i.ladder), rounds: d.settings.rounds, round: 0, idx: 0, values: [{}], start: new Date().toISOString(), phase: 'exercise' };
  saveRun();
  openRunner();
}

function openRunner() {
  $('runner').hidden = false;
  document.body.style.overflow = 'hidden';
  navigator.wakeLock?.request('screen').then((l) => { wakeLock = l; }).catch(() => {});
  clearInterval(tick);
  tick = setInterval(runnerTick, 250);
  renderRunner();
}

function closeRunner() {
  clearInterval(tick);
  hold = null;
  wakeLock?.release?.().catch?.(() => {});
  wakeLock = null;
  $('runner').hidden = true;
  document.body.style.overflow = '';
}

/** Suggested starting value: last time's number for this round, else target min. */
function prefill(exId, round) {
  const last = D.lastValues(data(), exId);
  return last[round] ?? last[last.length - 1] ?? D.target(data(), exId)[0];
}

function currentValue() {
  const exId = run.exercises[run.idx];
  return run.values[run.round][exId] ?? run.pending ?? prefill(exId, run.round);
}

function renderRunner() {
  if (!run) return;
  const d = data();
  const el = $('runner');
  const elapsed = Math.floor((Date.now() - new Date(run.start)) / 1000);
  const top = `<div class="run-top">
    <button class="icon-btn" type="button" data-run="quit" aria-label="End workout">${icon('close', 20)}</button>
    <div class="run-title">${esc(WORKOUTS[run.workout].name)} · Round ${Math.min(run.round + 1, run.rounds)} of ${run.rounds}<small id="run-elapsed">${fmtClock(elapsed)}</small></div>
    <span style="width:44px"></span></div>`;

  if (run.phase === 'exercise') {
    const exId = run.exercises[run.idx];
    const ex = D.ex(exId);
    const lad = D.ladderStep(run.ladders?.[run.idx], exId);
    const last = D.lastValues(d, exId);
    const best = D.bestValue(d, exId);
    const val = currentValue();
    const segs = run.exercises.map((_, i) => `<i class="${i < run.idx ? 'done' : i === run.idx ? 'now' : ''}"></i>`).join('');
    el.innerHTML = `<div class="runner-inner">${top}
      <div class="segs">${segs}</div>
      ${lad ? `<div class="ex-skill">${esc(lad.ladder.name)} · step ${lad.index + 1}/${lad.ladder.steps.length}</div>` : ''}
      <div class="ex-name">${esc(ex.name)}</div>
      <div class="ex-target">Target ${D.fmtTarget(d, exId)}</div>
      ${ex.note ? `<div class="ex-note">${esc(ex.note)}</div>` : ''}
      <div class="ex-hist">${last.length ? `<span>Last: <b>${last.map((v) => D.fmtValue(exId, v)).join(' · ')}</b></span>` : '<span>First time. Set the bar.</span>'}${best != null ? `<span>Best: <b>${D.fmtValue(exId, best)}</b></span>` : ''}</div>
      <ul class="cues">${ex.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      <div class="counter">
        <button type="button" data-run="minus" aria-label="Less">−</button>
        <div class="val" id="run-val">${val}<small>${ex.kind === 'time' ? 'seconds' : ex.perSide ? 'reps each side' : 'reps'}</small></div>
        <button type="button" data-run="plus" aria-label="More">+</button>
      </div>
      ${ex.kind === 'time' ? `<button class="btn hold-btn${hold ? ' running' : ''}" type="button" data-run="hold">${hold ? 'Stop hold' : 'Start hold timer'}</button>` : ''}
      <div class="run-actions">
        <button class="btn primary wide" type="button" data-run="done">Done ✓</button>
        <button class="skip" type="button" data-run="skip">Skip this one</button>
      </div></div>`;
  } else if (run.phase === 'rest') {
    const left = Math.max(0, Math.ceil((run.restEnd - Date.now()) / 1000));
    const total = run.restTotal;
    const C = 2 * Math.PI * 110;
    el.innerHTML = `<div class="runner-inner">${top}
      <div class="rest">
        <div class="rest-label">Rest · round ${run.round} done</div>
        <div class="ring"><svg viewBox="0 0 240 240"><circle class="track" cx="120" cy="120" r="110"/>
          <circle class="fill" id="rest-fill" cx="120" cy="120" r="110" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - left / total)}"/></svg>
          <div class="time" id="rest-time">${fmtClock(left)}</div></div>
        <div class="rest-next">Up next: <b>Round ${run.round + 1}</b> · ${esc(D.ex(run.exercises[0]).name)}</div>
        <div class="rest-btns"><button class="btn" type="button" data-run="rest+30">+30 s</button><button class="btn" type="button" data-run="rest-skip">Skip rest</button></div>
      </div></div>`;
  } else if (run.phase === 'roundsDone') {
    el.innerHTML = `<div class="runner-inner">${top}
      <div class="summary"><div class="rest-label" style="margin-top:30px">All ${run.rounds} rounds done</div>
      <div class="sum-xp">💪</div><p class="muted">Finish now, or push one more round for bonus XP.</p></div>
      <div class="run-actions">
        <button class="btn primary wide" type="button" data-run="finish">Finish workout</button>
        <button class="btn wide" type="button" data-run="extra">One more round</button>
      </div></div>`;
  } else if (run.phase === 'summary') {
    const r = run.result;
    el.innerHTML = `<div class="runner-inner"><div class="summary">
      <div class="rest-label" style="margin-top:20px">Workout complete</div>
      <div class="sum-xp">+${r.xp} XP</div>
      <div class="sum-stats"><span><b>${r.rounds}</b>rounds</span><span><b>${r.sets}</b>sets</span><span><b>${r.minutes}</b>min</span></div>
      <div class="sum-list">
        ${r.prs.length ? `<h3>Personal records 🏆</h3><ul class="records">${r.prs.map((p) => `<li><span>${esc(D.ex(p.exId).name)}</span><b>${D.fmtValue(p.exId, p.prev)} → ${D.fmtValue(p.exId, p.value)}</b></li>`).join('')}</ul>` : ''}
        ${r.achievements.length ? `<h3>Achievements unlocked</h3><ul class="records">${r.achievements.map((a) => `<li><span>⭐ ${esc(a.name)}</span><span class="muted">${esc(a.desc)}</span></li>`).join('')}</ul>` : ''}
        ${r.levelUp ? `<h3>Level up</h3><p>You reached <b>level ${r.levelUp.level}</b>: ${esc(r.levelUp.title)}.</p>` : ''}
      </div></div>
      <div class="run-actions"><button class="btn primary wide" type="button" data-run="close">Done</button></div></div>`;
  }
}

/** Live parts: elapsed clock, rest countdown, hold timer. */
function runnerTick() {
  if (!run) return;
  const elapsedEl = $('run-elapsed');
  if (elapsedEl) elapsedEl.textContent = fmtClock(Math.floor((Date.now() - new Date(run.start)) / 1000));
  if (run.phase === 'rest') {
    const left = Math.max(0, Math.ceil((run.restEnd - Date.now()) / 1000));
    const t = $('rest-time'), f = $('rest-fill');
    if (t) t.textContent = fmtClock(left);
    if (f) f.setAttribute('stroke-dashoffset', 2 * Math.PI * 110 * (1 - left / run.restTotal));
    if (left <= 0) { alarm(); nextRound(); }
  }
  if (hold) {
    const secs = Math.floor((Date.now() - hold) / 1000);
    run.pending = secs;
    const v = $('run-val');
    if (v) v.firstChild.nodeValue = secs;
  }
}

function alarm() {
  navigator.vibrate?.([200, 100, 200, 100, 400]);
  if (!data().settings.sound || !audio) return;
  try {
    audio.resume?.();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.25, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + t + 0.2);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + t);
      o.stop(audio.currentTime + t + 0.22);
    });
  } catch { /* sound unavailable */ }
}

function recordSet(skip = false) {
  const exId = run.exercises[run.idx];
  if (!skip) run.values[run.round][exId] = Math.max(0, currentValue());
  run.pending = null;
  hold = null;
  if (run.idx < run.exercises.length - 1) {
    run.idx++;
  } else if (run.round + 1 < run.rounds) {
    run.phase = 'rest';
    run.restTotal = data().settings.rest;
    run.restEnd = Date.now() + run.restTotal * 1000;
    run.round++;
  } else {
    run.phase = 'roundsDone';
  }
  saveRun();
  renderRunner();
}

function nextRound() {
  run.phase = 'exercise';
  run.idx = 0;
  run.values[run.round] ||= {};
  saveRun();
  renderRunner();
}

function finishWorkout() {
  const d = data();
  const before = D.levelInfo(D.totalXp(d));
  const rounds = run.values.filter((r) => Object.keys(r).length);
  const session = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, workout: run.workout, start: run.start, end: new Date().toISOString(), rounds };
  const { xp, prs } = D.scoreSession(d, session);
  session.xp = xp + (rounds.length > data().settings.rounds ? 50 : 0); // bonus for the extra round
  session.prs = prs.map((p) => p.exId);
  store.commit({ t: 'session', session });
  const skillOps = D.autoSkillOps(store.getData(), session);
  if (skillOps.length) store.commit(...skillOps);
  const earned = D.newAchievements(store.getData());
  if (earned.length) store.commit(...earned.map((a) => ({ t: 'achieve', id: a.id, at: session.end })));
  const after = D.levelInfo(D.totalXp(store.getData()));
  chosen = null;
  run.phase = 'summary';
  run.result = {
    xp: session.xp, prs, achievements: earned,
    rounds: rounds.length, sets: rounds.reduce((a, r) => a + Object.keys(r).length, 0),
    minutes: Math.max(1, Math.round((new Date(session.end) - new Date(session.start)) / 60000)),
    levelUp: after.level > before.level ? after : null,
  };
  saveRun();
  renderRunner();
}

function onRunnerClick(e) {
  const b = e.target.closest('[data-run]');
  if (!b || !run) return;
  const a = b.dataset.run;
  const exId = run.exercises[run.idx];
  const step = D.ex(exId).kind === 'time' ? 5 : 1;
  if (a === 'plus' || a === 'minus') {
    run.pending = Math.max(0, currentValue() + (a === 'plus' ? step : -step));
    run.values[run.round][exId] = undefined;
    delete run.values[run.round][exId];
    saveRun();
    renderRunner();
  } else if (a === 'hold') {
    if (hold) { run.pending = Math.floor((Date.now() - hold) / 1000); hold = null; navigator.vibrate?.(30); }
    else { hold = Date.now(); run.pending = 0; }
    saveRun();
    renderRunner();
  } else if (a === 'done') recordSet();
  else if (a === 'skip') recordSet(true);
  else if (a === 'rest+30') { run.restEnd += 30000; run.restTotal += 30; saveRun(); }
  else if (a === 'rest-skip') nextRound();
  else if (a === 'extra') { run.rounds++; run.round++; run.values[run.round] = {}; run.phase = 'rest'; run.restTotal = data().settings.rest; run.restEnd = Date.now() + run.restTotal * 1000; saveRun(); renderRunner(); }
  else if (a === 'finish') finishWorkout();
  else if (a === 'close') {
    const levelUp = run.result?.levelUp;
    run = null;
    ls.set('active', null);
    closeRunner();
    showTab('home');
    if (levelUp) celebrate(levelUpLine(levelUp.level, levelUp.title), `Level ${levelUp.level}!`);
  } else if (a === 'quit') {
    const any = run.values.some((r) => Object.keys(r).length);
    if (any && confirm('End the workout now and save what you did?')) finishWorkout();
    else if (!any || confirm('Discard this workout?')) { run = null; ls.set('active', null); closeRunner(); render(); }
  }
}

// ---------------------------------------------------------------------------
// Celebration overlay
// ---------------------------------------------------------------------------
function celebrate(line, title) {
  $('celebrate-kai').innerHTML = poseImg(line.pose);
  $('celebrate-title').textContent = title;
  $('celebrate-text').textContent = line.text;
  $('celebrate').hidden = false;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const colors = ['var(--accent)', 'var(--accent-2)', '#fff', '#FFD166'];
    $('confetti').innerHTML = Array.from({ length: 60 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${colors[i % 4]};animation-duration:${2 + Math.random() * 2}s;animation-delay:${Math.random() * 0.6}s"></i>`).join('');
  }
  navigator.vibrate?.([60, 40, 120]);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function renderSettings() {
  const d = data();
  $('themes').innerHTML = Object.entries(THEMES).map(([id, t]) => `<button class="theme-btn" type="button" role="radio" data-theme="${id}" aria-checked="${id === theme}"><span class="sw">${t.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span>${esc(t.name)}</button>`).join('');
  $('set-goal').value = String(d.settings.weeklyGoal);
  $('set-rounds').value = String(d.settings.rounds);
  $('set-rest').value = String(d.settings.rest);
  $('set-sound').checked = d.settings.sound !== false;
  const connected = store.gist.isConfigured();
  $('sync-connected').hidden = !connected;
  $('sync-setup').hidden = connected;
  $('gh-token').value = store.gist.getToken();
  $('gh-gist').value = store.gist.getGistId();
}

async function syncAction(fn) {
  const msg = $('sync-msg');
  msg.textContent = 'Working…';
  msg.className = 'msg';
  try {
    await fn();
    if (store.getStatus().status === 'error') throw new Error(store.getStatus().message);
    msg.textContent = 'Connected ✓';
    msg.className = 'msg ok';
    renderSettings();
  } catch (err) {
    msg.textContent = err.message || 'Something went wrong';
    msg.className = 'msg error';
  }
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
function init() {
  applyTheme();
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon, 24);
  $('open-settings').innerHTML = icon('settings');
  for (const b of document.querySelectorAll('[data-close]')) b.innerHTML = icon('close', 20);

  for (const b of document.querySelectorAll('.tabbar button')) b.addEventListener('click', () => showTab(b.dataset.tab));
  $('level-chip').addEventListener('click', () => showTab('awards'));
  $('sync-pill').addEventListener('click', () => store.sync());

  document.querySelector('.app').addEventListener('click', (e) => {
    const t = e.target.closest('[data-start],[data-choose],[data-apply],[data-dismiss],[data-session],[data-delete],[data-step],[data-edit]');
    if (!t) return;
    const d = data();
    if (t.dataset.edit) openEditor(t.dataset.edit);
    else if (t.dataset.start) startWorkout(t.dataset.start);
    else if (t.dataset.choose !== undefined) { chosen = t.dataset.choose || null; renderHome(); }
    else if (t.dataset.apply) {
      const s = D.suggestions(d).find((x) => x.exId === t.dataset.apply);
      if (s?.type === 'ladder') store.commit({ t: 'ladder', id: s.ladder, step: s.step });
      else if (s) store.commit({ t: 'target', id: s.exId, value: s.value });
      const earned = D.newAchievements(store.getData());
      if (earned.length) store.commit(...earned.map((a) => ({ t: 'achieve', id: a.id, at: new Date().toISOString() })));
      if (s?.type === 'ladder') celebrate({ pose: 'celebrate', text: `${D.ex(s.next).name} unlocked. New skill, new challenge.` }, 'Skill unlocked!');
    } else if (t.dataset.dismiss) {
      const dis = ls.get('dismissed', {});
      dis[t.dataset.dismiss] = d.sessions.length; // ask again after your next workout
      ls.set('dismissed', dis);
      renderHome();
    } else if (t.dataset.session) { openSession = openSession === t.dataset.session ? null : t.dataset.session; renderHistory(); }
    else if (t.dataset.delete) { if (confirm('Delete this workout? Its XP is removed too.')) store.commit({ t: 'deleteSession', id: t.dataset.delete }); }
    else if (t.dataset.step) { const [id, step] = t.dataset.step.split(':'); store.commit({ t: 'ladder', id, step: Number(step) }); }
  });

  $('runner').addEventListener('click', onRunnerClick);

  // Workout editor & skill sheet
  for (const dlgId of ['editor', 'skill-sheet']) {
    const dl = $(dlgId);
    dl.addEventListener('click', (e) => { if (e.target === dl || e.target.closest('[data-close]')) dl.close(); });
  }
  $('editor').addEventListener('click', onEditorClick);
  $('editor').addEventListener('change', onEditorChange);
  $('editor').addEventListener('input', (e) => {
    if (e.target.id !== 'ed-search') return;
    const q = e.target.value.trim().toLowerCase();
    for (const b of $('ed-pick').querySelectorAll('[data-add]')) b.hidden = !!q && !(b.dataset.name || b.textContent.toLowerCase()).includes(q);
  });
  $('skill-sheet').addEventListener('click', (e) => {
    const st = e.target.closest('[data-status]');
    if (st) store.commit({ t: 'skill', id: openNode, status: st.dataset.status });
    const other = e.target.closest('[data-node-open]');
    if (other) { openNode = other.dataset.nodeOpen; renderSkillSheet(); }
  });
  addEventListener('resize', () => { if (tab === 'skills') applyView(); });
  $('celebrate-ok').addEventListener('click', () => { $('celebrate').hidden = true; $('confetti').innerHTML = ''; });

  // Settings
  const dlg = $('settings');
  $('open-settings').addEventListener('click', () => { renderSettings(); $('sync-msg').textContent = ''; dlg.showModal(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
  $('themes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    theme = b.dataset.theme;
    ls.set('theme', theme);
    applyTheme();
    renderSettings();
  });
  $('set-goal').addEventListener('change', (e) => store.commit({ t: 'settings', patch: { weeklyGoal: Number(e.target.value) } }));
  $('set-rounds').addEventListener('change', (e) => store.commit({ t: 'settings', patch: { rounds: Number(e.target.value) } }));
  $('set-rest').addEventListener('change', (e) => store.commit({ t: 'settings', patch: { rest: Number(e.target.value) } }));
  $('set-sound').addEventListener('change', (e) => store.commit({ t: 'settings', patch: { sound: e.target.checked } }));
  $('gh-connect').addEventListener('click', () => syncAction(() => store.connect($('gh-token').value, $('gh-gist').value)));
  $('gh-create').addEventListener('click', () => syncAction(() => store.createAndConnect($('gh-token').value)));

  store.subscribe((e) => {
    if (e.type !== 'data') return renderHeader();
    if (tab === 'skills' && $('tree-g')) { renderHeader(); drawTree(); } else render();
    if ($('skill-sheet').open) renderSkillSheet();
    if ($('editor').open && !$('editor').contains(document.activeElement)) renderEditor();
    if (tab === 'skills') { const r = D.skillRank(data()); const el = document.querySelector('.rank-name'); if (el) el.textContent = r.rank; }
  });
  render();
  store.startAutoSync();
  if (run) openRunner(); // resume an unfinished workout
}

init();

