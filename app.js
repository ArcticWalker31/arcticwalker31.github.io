// app.js — the phone logger UI. All data/sync logic lives in data.js; this
// file only renders and turns taps into ops via D.commit().

import * as D from './data.js';

const $ = (id) => document.getElementById(id);

const BACKFILL_DAYS = 6;      // today + 6 previous days are editable
const LONG_PRESS_MS = 500;
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------------------
// View state
// ---------------------------------------------------------------------------

let viewDate = null;                 // null = follow "today" (also across midnight)
let lastProgress = { date: null, allDone: false };
let userActed = false;               // celebration only after a tap, not on load/sync
let popHabitId = null;               // card that just became done -> pop animation
let suppressTapUntil = 0;            // swallow the click that ends a long-press
let renderDeferred = false;          // a re-render waiting for an input to lose focus

const data = () => D.getData();
const today = () => D.todayKey(data().settings.dayStartHour);
const minDate = () => D.addDays(today(), -BACKFILL_DAYS);

/** The day being shown, clamped to [today-6, today]. */
function currentDate() {
  const t = today();
  if (viewDate && viewDate >= t) viewDate = null;
  if (viewDate && viewDate < minDate()) viewDate = minDate();
  return viewDate ?? t;
}

function buzz() {
  navigator.vibrate?.(10); // Android only; iOS Safari has no Vibration API
}

// ---------------------------------------------------------------------------
// Logger rendering
// ---------------------------------------------------------------------------

function renderLogger() {
  const date = currentDate();
  const t = today();

  // Header
  const d = D.parseKey(date);
  $('date-main').textContent =
    date === t ? 'Today'
    : date === D.addDays(t, -1) ? 'Yesterday'
    : d.toLocaleDateString(undefined, { weekday: 'long' });
  $('date-sub').textContent = d.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' });
  $('prev-day').disabled = date <= minDate();
  $('next-day').disabled = date >= t;
  $('today-btn').hidden = date === t;

  renderProgress(date);

  // Don't rebuild cards under an input that's being typed into.
  const cards = $('cards');
  if (cards.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
    renderDeferred = true;
    return;
  }
  const habits = D.activeHabitsOn(data(), date);
  const dayLog = data().log[date] || {};
  if (!habits.length) {
    cards.innerHTML = '<p class="empty">No habits yet. Add some in Settings.</p>';
  } else {
    cards.replaceChildren(...habits.map((h) => buildCard(h, dayLog[h.id], date)));
  }
  popHabitId = null;
}

function renderProgress(date) {
  const { done, total } = D.dayProgress(data(), date);
  const allDone = total > 0 && done === total;
  $('progress-count').textContent = `${done} of ${total}`;
  $('progress-label').textContent = allDone ? 'all done!' : 'done';
  $('ring-fill').style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - (total ? done / total : 0));
  $('progress').classList.toggle('all-done', allDone);

  // Celebrate only on the transition to all-done caused by a tap on this day.
  if (allDone && userActed && lastProgress.date === date && !lastProgress.allDone) celebrate();
  lastProgress = { date, allDone };
  userActed = false;
}

/** Build one habit card. Text goes in via textContent (habit names are user data). */
function buildCard(habit, value, date) {
  const status = D.habitStatus(habit, { [habit.id]: value }, date);
  const goal = D.effectiveGoal(habit, date);
  let el;

  if (habit.type === 'check') {
    // The whole card is the button. Tap: done <-> not logged. Long-press: "not done".
    el = document.createElement('button');
    el.type = 'button';
    el.className = 'card card-check';
    el.innerHTML = '<div class="card-body"><div class="card-name"></div><div class="card-detail"></div></div><div class="badge"></div>';
    el.querySelector('.card-detail').textContent =
      value === true ? 'Done' : value === false ? 'Not done' : 'Tap when done';
    el.querySelector('.badge').textContent = value === true ? '✓' : value === false ? '✕' : '';
    if (value === false) el.classList.add('miss');
    el.setAttribute('aria-pressed', String(value === true));
    attachPress(el,
      () => setValue(habit, date, value === true ? null : true),
      () => setValue(habit, date, value === false ? null : false));
  }

  else if (habit.type === 'minutes') {
    el = document.createElement('div');
    el.className = 'card card-minutes';
    el.innerHTML = '<div class="card-body"><div class="card-name"></div><div class="card-detail"></div></div>' +
      '<input class="minutes-input" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="–" enterkeyhint="done" aria-label="Minutes">';
    el.querySelector('.card-detail').textContent = value == null
      ? `max ${goal} min`
      : `${value} / ${goal} min max${status === 'done' ? '' : ' · over'}`;
    if (status === 'incomplete') el.classList.add('miss');
    const input = el.querySelector('input');
    input.value = value ?? '';
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    input.addEventListener('change', () => {
      const text = input.value.trim();
      if (text === '') return setValue(habit, date, null);   // cleared = not logged
      if (!/^\d+$/.test(text)) { input.value = value ?? ''; return; }
      setValue(habit, date, Number(text));
    });
    input.addEventListener('blur', () => {
      if (renderDeferred) { renderDeferred = false; setTimeout(renderLogger); }
    });
  }

  else if (habit.type === 'count') {
    const n = value ?? 0;
    const target = goal || 1;
    el = document.createElement('div');
    el.className = 'card card-count';
    el.style.setProperty('--fill', Math.min(n / target, 1));
    el.innerHTML = '<div class="card-body"><div class="card-name"></div><div class="card-detail"></div></div>' +
      '<div class="stepper"><button class="step-btn" type="button" aria-label="Decrease">−</button>' +
      '<span class="count-value"></span>' +
      '<button class="step-btn" type="button" aria-label="Increase">+</button></div>';
    el.querySelector('.card-detail').textContent =
      status === 'done' ? (n > target ? `Done, +${n - target} extra` : 'Done') : `Target ${target}`;
    el.querySelector('.count-value').textContent = `${n} / ${target}`;
    const [minus, plus] = el.querySelectorAll('.step-btn');
    minus.disabled = value == null;
    // Going down to 0 removes the entry ("not logged"), so 0 is never stored.
    minus.addEventListener('click', () => setValue(habit, date, n - 1 <= 0 ? null : n - 1));
    plus.addEventListener('click', () => setValue(habit, date, n + 1));
  }

  else {
    el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = '<div class="card-body"><div class="card-name"></div><div class="card-detail"></div></div>';
    el.querySelector('.card-detail').textContent = `Unknown type “${habit.type}”`;
  }

  el.querySelector('.card-name').textContent = habit.name;
  el.dataset.status = status;
  if (habit.id === popHabitId && status === 'done') el.classList.add('pop');
  return el;
}

/** Tap vs. long-press on one element. */
function attachPress(el, onTap, onLongPress) {
  let timer = null;
  let start = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      timer = null;
      // The card is re-rendered, so the click ending this press may land on a
      // new element. A global time window swallows it.
      suppressTapUntil = Date.now() + 700;
      buzz();
      onLongPress();
    }, LONG_PRESS_MS);
  });
  el.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
  });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('click', () => {
    if (Date.now() < suppressTapUntil) return;
    onTap();
  });
}

/** Record a value (null = remove) for a habit on a day. */
function setValue(habit, date, value) {
  const before = D.habitStatus(habit, data().log[date], date);
  const after = D.habitStatus(habit, { [habit.id]: value }, date);
  if (after === 'done' && before !== 'done') { popHabitId = habit.id; buzz(); }
  userActed = true;
  D.commit({ t: 'log', date, habitId: habit.id, value });
}

/** Ring pulse + a short burst of confetti in palette colors. */
function celebrate() {
  const ring = $('progress');
  ring.classList.remove('celebrate');
  void ring.offsetWidth; // restart the animation
  ring.classList.add('celebrate');
  if (reducedMotion.matches) return;

  const box = $('confetti');
  const r = ring.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const colors = ['#60935D', '#8797B2', '#EE6352', '#493B2A', '#C9A66B'];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 110;
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist + 60}px`); // slight fall
    p.style.setProperty('--rot', `${Math.random() * 540 - 270}deg`);
    p.style.animationDelay = `${Math.random() * 120}ms`;
    box.appendChild(p);
  }
  setTimeout(() => box.replaceChildren(), 1500);
}

// ---------------------------------------------------------------------------
// Sync status pill
// ---------------------------------------------------------------------------

const STATUS_LABELS = {
  saved: 'Saved', saving: 'Saving…', offline: 'Offline', error: 'Sync error', setup: 'Not connected',
};

function renderStatus() {
  const { status, message } = D.getStatus();
  const pill = $('sync-pill');
  pill.dataset.status = status;
  pill.querySelector('.sync-text').textContent = STATUS_LABELS[status] || status;
  pill.title = message || 'Tap to sync now';
  if (!$('settings-view').hidden) renderConnMessage();
}

function renderConnMessage() {
  const { status, message } = D.getStatus();
  if (status === 'error') showMsg(message, 'error');
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function openSettings() {
  $('token-input').value = D.getToken();
  $('gist-input').value = D.getGistId();
  $('setup-intro').hidden = D.isConfigured();
  showMsg('');
  renderConnMessage();
  renderSettings();
  $('logger-view').hidden = true;
  $('settings-view').hidden = false;
  window.scrollTo(0, 0);
}

function closeSettings() {
  $('settings-view').hidden = true;
  $('logger-view').hidden = false;
  renderLogger();
}

function showMsg(text, kind = '') {
  const el = $('conn-msg');
  el.textContent = text;
  el.className = `msg ${kind}`;
}

function renderSettings() {
  // Day-start selector
  const sel = $('day-start');
  if (!sel.options.length) {
    for (let h = 0; h <= 6; h++) {
      sel.add(new Option(h === 0 ? 'Midnight' : `${h}:00 AM`, String(h)));
    }
  }
  sel.value = String(data().settings.dayStartHour ?? 0);

  // Habit list (don't rebuild while typing in it)
  const list = $('habit-list');
  if (list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const active = data().habits.filter((h) => !h.archived);
  list.replaceChildren(...active.map((h, i) => buildHabitRow(h, i, active)));
}

const TYPE_LABELS = { check: 'Check', minutes: 'Minutes · stay at or under', count: 'Count · reach target' };

function buildHabitRow(habit, index, active) {
  const li = document.createElement('li');
  li.className = 'habit-row';
  li.innerHTML = `
    <div class="main">
      <input class="name" type="text" maxlength="40" aria-label="Habit name">
      <div class="type"></div>
      <label class="goal-field" hidden><span></span>
        <input class="goal" type="text" inputmode="numeric" pattern="[0-9]*"></label>
    </div>
    <div class="actions">
      <div class="row">
        <button class="btn up" type="button" aria-label="Move up">↑</button>
        <button class="btn down" type="button" aria-label="Move down">↓</button>
      </div>
      <button class="btn danger archive" type="button">Archive</button>
    </div>`;

  const name = li.querySelector('.name');
  name.value = habit.name;
  name.addEventListener('change', () => {
    const v = name.value.trim();
    if (!v) { name.value = habit.name; return; }
    D.commit({ t: 'habit', habit: { ...habit, name: v } });
  });

  li.querySelector('.type').textContent = TYPE_LABELS[habit.type] || habit.type;

  if (habit.type !== 'check') {
    const field = li.querySelector('.goal-field');
    field.hidden = false;
    field.querySelector('span').textContent = habit.type === 'minutes' ? 'Max minutes' : 'Target';
    const goal = field.querySelector('.goal');
    const current = D.effectiveGoal(habit, today());
    goal.value = current ?? '';
    goal.addEventListener('change', () => {
      const v = goal.value.trim();
      if (!/^\d+$/.test(v) || (habit.type === 'count' && Number(v) < 1)) { goal.value = current ?? ''; return; }
      setGoal(habit, Number(v));
    });
  }

  const up = li.querySelector('.up');
  const down = li.querySelector('.down');
  up.disabled = index === 0;
  down.disabled = index === active.length - 1;
  up.addEventListener('click', () => move(active, index, -1));
  down.addEventListener('click', () => move(active, index, +1));

  li.querySelector('.archive').addEventListener('click', () => {
    const ok = confirm(`Archive “${habit.name}”?\n\nIt will disappear from the logger. Its history is kept in the Gist, but it can't be restored from the app.`);
    if (ok) D.commit({ t: 'habit', habit: { ...habit, archived: true, archivedAt: today() } });
  });
  return li;
}

/**
 * Goals are a history: a change takes effect from today, so past days keep
 * the goal they had. Editing twice in one day just replaces today's entry.
 */
function setGoal(habit, value) {
  const t = today();
  const goals = (habit.goals || []).filter((g) => g.from !== t);
  goals.push({ from: t, value });
  goals.sort((a, b) => (a.from < b.from ? -1 : 1));
  D.commit({ t: 'habit', habit: { ...habit, goals } });
}

function move(active, index, delta) {
  const ids = active.map((h) => h.id);
  const j = index + delta;
  [ids[index], ids[j]] = [ids[j], ids[index]];
  // Archived habits keep their place after the active ones.
  const archived = data().habits.filter((h) => h.archived).map((h) => h.id);
  D.commit({ t: 'order', ids: [...ids, ...archived] });
}

function wireSettings() {
  $('open-settings').addEventListener('click', openSettings);
  $('close-settings').addEventListener('click', closeSettings);

  $('token-toggle').addEventListener('click', () => {
    const input = $('token-input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    $('token-toggle').textContent = show ? 'Hide' : 'Show';
  });

  $('token-save').addEventListener('click', () => {
    D.setToken($('token-input').value);
    if (!D.getToken()) return showMsg('Token removed.');
    showMsg(D.getGistId() ? 'Token saved. Syncing…' : 'Token saved. Now create or connect a Gist.', 'ok');
    if (D.getGistId()) D.sync().then(() => {
      if (D.getStatus().status === 'saved') showMsg('Token saved. Synced ✓', 'ok');
    });
  });

  $('gist-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('gist-input').value);
      showMsg('Gist ID copied.', 'ok');
    } catch {
      $('gist-input').select();
    }
  });

  $('gist-connect').addEventListener('click', async () => {
    const id = $('gist-input').value.trim();
    if (!D.getToken()) return showMsg('Save a token first.', 'error');
    if (!id) return showMsg('Paste a Gist ID first.', 'error');
    if (D.hasPending() && !confirm('This device has changes that were never synced. Connecting replaces them with the Gist’s data. Continue?')) return;
    await busy(async () => {
      showMsg('Connecting…');
      const connected = await D.connectGist(id);
      $('gist-input').value = connected;
      $('setup-intro').hidden = true;
      showMsg('Connected ✓', 'ok');
    });
  });

  $('gist-create').addEventListener('click', async () => {
    if (!D.getToken()) return showMsg('Save a token first.', 'error');
    if (D.getGistId() && !confirm('You are already connected to a Gist. Create a brand-new one anyway? (The old Gist is not deleted.)')) return;
    await busy(async () => {
      showMsg('Creating secret Gist…');
      const id = await D.createAndConnectGist();
      $('gist-input').value = id;
      $('setup-intro').hidden = true;
      showMsg('Created ✓. Use this Gist ID on your other device.', 'ok');
    });
  });

  $('day-start').addEventListener('change', (e) => {
    D.commit({ t: 'settings', settings: { dayStartHour: Number(e.target.value) } });
  });

  // Add-habit form: the goal field only shows for count/minutes.
  const form = $('add-habit');
  const syncGoalField = () => {
    const type = form.elements.type.value;
    form.elements.goal.hidden = type === 'check';
    form.elements.goal.placeholder = type === 'minutes' ? 'Max minutes per day' : 'Daily target';
  };
  form.elements.type.addEventListener('change', syncGoalField);
  syncGoalField();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const type = form.elements.type.value;
    const goalText = form.elements.goal.value.trim();
    if (!name) return;
    const t = today();
    const habit = { id: D.makeHabitId(name, data().habits), name, type, createdAt: t };
    if (type !== 'check') {
      if (!/^\d+$/.test(goalText) || (type === 'count' && Number(goalText) < 1)) {
        form.elements.goal.focus();
        return;
      }
      habit.goals = [{ from: t, value: Number(goalText) }];
    }
    D.commit({ t: 'habit', habit });
    form.reset();
    syncGoalField();
  });
}

/** Disable the connection buttons while a request runs; show errors. */
async function busy(fn) {
  const buttons = ['gist-connect', 'gist-create', 'token-save'].map($);
  buttons.forEach((b) => (b.disabled = true));
  try {
    await fn();
  } catch (err) {
    showMsg(err.message || 'Something went wrong', 'error');
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

function renderAll() {
  renderLogger();
  if (!$('settings-view').hidden) renderSettings();
}

function init() {
  $('prev-day').addEventListener('click', () => { viewDate = D.addDays(currentDate(), -1); renderLogger(); });
  $('next-day').addEventListener('click', () => { viewDate = D.addDays(currentDate(), +1); renderLogger(); });
  $('today-btn').addEventListener('click', () => { viewDate = null; renderLogger(); });
  $('sync-pill').addEventListener('click', () => {
    const { status } = D.getStatus();
    if (status === 'setup' || (status === 'error' && !D.isConfigured())) openSettings();
    else D.sync();
  });
  wireSettings();

  D.subscribe((e) => (e.type === 'data' ? renderAll() : renderStatus()));

  // Instant first paint from the local cache, then sync in the background.
  renderLogger();
  renderStatus();
  if (!D.isConfigured()) openSettings();

  // "Today" may have changed while the app sat in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renderLogger();
  });

  D.startAutoSync();
}

init();
