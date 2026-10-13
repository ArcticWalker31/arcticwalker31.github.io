// app.js — Forge UI: home (Kai + week + next workout), history, skills,
// awards, the workout runner (circuit rounds + rest timer), and settings.

import * as D from './data.js?v=2';
import { EXERCISES, LADDERS, WORKOUTS, ROTATION, ABS_POOL, slotKey } from './program.js?v=2';
import { checkIn, levelUpLine, poseImg } from './trainer.js?v=2';

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
  return `<li><span>${esc(EXERCISES[exId].name)}${lad ? `<span class="skill">${esc(lad.ladder.name)} ${lad.index + 1}/${lad.ladder.steps.length}</span>` : ''}</span><span class="tgt">${D.fmtTarget(d, exId)}</span></li>`;
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
      <div class="next-head"><span class="next-label">${chosen ? 'Picked' : 'Next up'}</span><span class="muted">${d.settings.rounds} rounds · rest ${fmtClock(d.settings.rest)}</span></div>
      <div class="next-name">${esc(WORKOUTS[next].name)}</div>
      <ul class="ex-list">${D.workoutItems(d, next).map((it) => exRow(d, it)).join('')}</ul>
      <button class="btn primary wide" type="button" data-start="${next}">Start ${esc(WORKOUTS[next].name)}</button>
      <div class="other"><span class="muted">Or:</span>${ROTATION.filter((w) => w !== next).map((w) => `<button class="chip" type="button" data-choose="${w}">${esc(WORKOUTS[w].name)}</button>`).join('')}${chosen ? '<button class="chip" type="button" data-choose="">Back to rotation</button>' : ''}</div>
    </section>

    ${sugg.length ? `<h2 class="sec">Kai says: level up</h2>${sugg.map((s) => `<section class="card suggest">
      <div class="txt">${s.type === 'ladder'
        ? `You've mastered <b>${esc(EXERCISES[s.exId].name)}</b>. Unlock <b>${esc(EXERCISES[s.next].name)}</b>?`
        : `<b>${esc(EXERCISES[s.exId].name)}</b> is getting easy. New target ${s.value[0]}–${s.value[1]}${EXERCISES[s.exId].kind === 'time' ? 's' : ''}${EXERCISES[s.exId].note?.includes('weight') || s.exId === 'decline-pushup' ? ' (or add weight)' : ''}?`}</div>
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
  const records = Object.keys(EXERCISES).map((id) => [id, D.bestValue(d, id)]).filter(([, v]) => v != null);
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
        ${openSession === s.id ? `<div class="hist-body"><table>${exIds.map((id) => `<tr><td>${esc(EXERCISES[id]?.name || id)}${s.prs?.includes(id) ? '<span class="pr-tag">PR</span>' : ''}</td><td>${s.rounds.map((r) => D.fmtValue(id, r[id])).join(' · ')}</td></tr>`).join('')}</table>
          <div class="row"><button class="btn small" type="button" data-delete="${esc(s.id)}">Delete workout</button></div></div>` : ''}
      </section>`;
    }).join('')}
    <h2 class="sec">Personal records</h2>
    <section class="card"><ul class="records">${records.map(([id, v]) => `<li><span>${esc(EXERCISES[id].name)}</span><b>${D.fmtValue(id, v)}</b></li>`).join('')}</ul></section>`
    : '<section class="card"><p class="muted">No workouts yet. Your first one is waiting on Home.</p></section>';
}

// ---------------------------------------------------------------------------
// Skills (progression ladders)
// ---------------------------------------------------------------------------
function renderSkills() {
  const d = data();
  $('view-skills').innerHTML = '<p class="fine">Train your current step. When you hit the top of its range in every round two workouts in a row, Kai offers the next step. You can also pick a step yourself.</p>' +
    Object.entries(LADDERS).map(([id, l]) => {
      const cur = d.ladders[id] ?? l.start;
      return `<section class="card ladder"><h3>${esc(l.name)}</h3><ol class="steps">${l.steps.map((exId, i) => {
        const cls = i < cur ? 'done' : i === cur ? 'current' : 'locked';
        const best = D.bestValue(d, exId);
        return `<li class="${cls}"><span class="step-dot">${i < cur ? '✓' : i + 1}</span>
          <span class="step-info"><span class="step-name">${esc(EXERCISES[exId].name)}</span>
          <span class="step-sub" style="display:block">${D.fmtTarget(d, exId)}${best != null ? ` · best ${D.fmtValue(exId, best)}` : ''}${i === cur ? ' · current' : ''}</span></span>
          ${i !== cur ? `<button type="button" data-step="${id}:${i}">Set current</button>` : ''}</li>`;
      }).join('')}</ol></section>`;
    }).join('');
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
    const ex = EXERCISES[exId];
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
        <div class="rest-next">Up next: <b>Round ${run.round + 1}</b> · ${esc(EXERCISES[run.exercises[0]].name)}</div>
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
        ${r.prs.length ? `<h3>Personal records 🏆</h3><ul class="records">${r.prs.map((p) => `<li><span>${esc(EXERCISES[p.exId].name)}</span><b>${D.fmtValue(p.exId, p.prev)} → ${D.fmtValue(p.exId, p.value)}</b></li>`).join('')}</ul>` : ''}
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
  const step = EXERCISES[exId]?.kind === 'time' ? 5 : 1;
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
  const absSet = new Set(d.settings.abs);
  $('abs-pick').innerHTML = ABS_POOL.map((slot) => {
    const key = slotKey(slot);
    const label = typeof slot === 'string' ? EXERCISES[slot].name : `${LADDERS[slot.ladder].name} <small>SKILL</small>`;
    return `<label><input type="checkbox" value="${esc(key)}" ${absSet.has(key) ? 'checked' : ''}>${label}</label>`;
  }).join('');
  const used = [...new Set([...ROTATION.flatMap((w) => D.workoutExercises(d, w))])];
  $('target-edit').innerHTML = used.map((id) => {
    const [a, b] = D.target(d, id);
    return `<li data-ex="${esc(id)}"><span>${esc(EXERCISES[id].name)}</span><input type="number" min="0" value="${a}" aria-label="min"><span>–</span><input type="number" min="0" value="${b}" aria-label="max"><span class="muted">${EXERCISES[id].kind === 'time' ? 's' : ''}</span></li>`;
  }).join('');
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
    const t = e.target.closest('[data-start],[data-choose],[data-apply],[data-dismiss],[data-session],[data-delete],[data-step]');
    if (!t) return;
    const d = data();
    if (t.dataset.start) startWorkout(t.dataset.start);
    else if (t.dataset.choose !== undefined) { chosen = t.dataset.choose || null; renderHome(); }
    else if (t.dataset.apply) {
      const s = D.suggestions(d).find((x) => x.exId === t.dataset.apply);
      if (s?.type === 'ladder') store.commit({ t: 'ladder', id: s.ladder, step: s.step });
      else if (s) store.commit({ t: 'target', id: s.exId, value: s.value });
      const earned = D.newAchievements(store.getData());
      if (earned.length) store.commit(...earned.map((a) => ({ t: 'achieve', id: a.id, at: new Date().toISOString() })));
      if (s?.type === 'ladder') celebrate({ pose: 'celebrate', text: `${EXERCISES[s.next].name} unlocked. New skill, new challenge.` }, 'Skill unlocked!');
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
  $('abs-pick').addEventListener('change', () => {
    const keys = [...$('abs-pick').querySelectorAll('input:checked')].map((i) => i.value);
    if (keys.length) store.commit({ t: 'settings', patch: { abs: keys } });
  });
  $('target-edit').addEventListener('change', (e) => {
    const li = e.target.closest('[data-ex]');
    if (!li) return;
    const [a, b] = [...li.querySelectorAll('input')].map((i) => Math.max(0, parseInt(i.value, 10) || 0));
    store.commit({ t: 'target', id: li.dataset.ex, value: [Math.min(a, b), Math.max(a, b)] });
  });
  $('gh-connect').addEventListener('click', () => syncAction(() => store.connect($('gh-token').value, $('gh-gist').value)));
  $('gh-create').addEventListener('click', () => syncAction(() => store.createAndConnect($('gh-token').value)));

  store.subscribe((e) => { if (e.type === 'data') render(); else renderHeader(); });
  render();
  store.startAutoSync();
  if (run) openRunner(); // resume an unfinished workout
}

init();
