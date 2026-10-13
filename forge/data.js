// data.js — Forge data model, sync, and the game rules (XP, levels, streaks,
// PRs, achievements, level-up suggestions). No DOM.
//
// workout.json:
// {
//   version: 1,
//   settings: { weeklyGoal, rounds, rest, abs: [slotKey…] },
//   targets: { exerciseId: [min, max] },        // your edits to targets
//   ladders: { ladderId: stepIndex },            // current step per skill
//   sessions: [{ id, workout, start, end, rounds: [{ exId: value }], xp, prs: [exId] }],
//   achievements: { id: ISO date earned }
// }

import { createStore } from '../shared/sync.js?v=3';
import { EXERCISES, LADDERS, WORKOUTS, ROTATION, DEFAULT_ABS, slotKey, keyToSlot } from './program.js?v=3';

export function defaults() {
  return {
    version: 1,
    settings: { weeklyGoal: 4, rounds: 3, rest: 210, sound: true, abs: DEFAULT_ABS.map(slotKey) },
    targets: {},
    ladders: Object.fromEntries(Object.entries(LADDERS).map(([id, l]) => [id, l.start])),
    sessions: [],
    achievements: {},
  };
}

function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : defaults();
  const def = defaults();
  d.settings = { ...def.settings, ...(d.settings || {}) };
  d.targets ||= {};
  d.ladders = { ...def.ladders, ...(d.ladders || {}) };
  d.sessions = Array.isArray(d.sessions) ? d.sessions : [];
  d.achievements ||= {};
  return d;
}

/**
 * Ops:
 *   { t: 'session', session }    add a finished workout (deduped by id)
 *   { t: 'deleteSession', id }
 *   { t: 'settings', patch }
 *   { t: 'target', id, value: [min,max] }
 *   { t: 'ladder', id, step }
 *   { t: 'achieve', id, at }
 */
function applyOp(d, op) {
  switch (op.t) {
    case 'session':
      if (!d.sessions.some((s) => s.id === op.session.id)) {
        d.sessions.push(op.session);
        d.sessions.sort((a, b) => (a.start < b.start ? -1 : 1));
      }
      break;
    case 'deleteSession': d.sessions = d.sessions.filter((s) => s.id !== op.id); break;
    case 'settings': Object.assign(d.settings, op.patch); break;
    case 'target': d.targets[op.id] = op.value; break;
    case 'ladder': d.ladders[op.id] = op.step; break;
    case 'achieve': d.achievements[op.id] ||= op.at; break;
  }
  return d;
}

export const store = createStore({ file: 'workout.json', ns: 'fg.', defaults, normalize, applyOp });
export const data = () => store.getData();

// ---------------------------------------------------------------------------
// Program helpers
// ---------------------------------------------------------------------------

export const target = (d, exId) => d.targets[exId] || EXERCISES[exId].target;

/** A slot → the exercise to do now (ladders resolve to the current step). */
export function resolveSlot(d, slot) {
  if (typeof slot === 'string') return slot;
  const l = LADDERS[slot.ladder];
  return l.steps[Math.min(d.ladders[slot.ladder] ?? l.start, l.steps.length - 1)];
}

export function workoutSlots(d, key) {
  return key === 'abs' ? d.settings.abs.map(keyToSlot) : WORKOUTS[key].slots;
}
export const workoutExercises = (d, key) => workoutSlots(d, key).map((s) => resolveSlot(d, s));

/** [{ exId, ladder }] — ladder is set only when the slot itself is a skill ladder. */
export const workoutItems = (d, key) => workoutSlots(d, key).map((s) => ({ exId: resolveSlot(d, s), ladder: typeof s === 'string' ? null : s.ladder }));

/** Ladder position for a slot that IS a ladder: { index, ladder } or null. */
export function ladderStep(ladderId, exId) {
  if (!ladderId) return null;
  const ladder = LADDERS[ladderId];
  return { index: ladder.steps.indexOf(exId), ladder };
}

/** Which ladder (if any) an exercise belongs to, and its position. */
export function ladderOf(exId) {
  for (const [id, l] of Object.entries(LADDERS)) {
    const i = l.steps.indexOf(exId);
    if (i >= 0) return { id, index: i, ladder: l };
  }
  return null;
}

/** Next in the Pull → Push → Abs rotation after your last workout. */
export function nextWorkout(d) {
  const last = d.sessions[d.sessions.length - 1];
  if (!last) return ROTATION[0];
  return ROTATION[(ROTATION.indexOf(last.workout) + 1) % ROTATION.length];
}

/** Per-round values from the most recent session that included exId. */
export function lastValues(d, exId) {
  for (let i = d.sessions.length - 1; i >= 0; i--) {
    const vals = d.sessions[i].rounds.map((r) => r[exId]).filter((v) => v != null);
    if (vals.length) return vals;
  }
  return [];
}

export function bestValue(d, exId, sessions = d.sessions) {
  let best = null;
  for (const s of sessions) for (const r of s.rounds) if (r[exId] != null && (best == null || r[exId] > best)) best = r[exId];
  return best;
}

export const fmtValue = (exId, v) => (v == null ? '—' : EXERCISES[exId].kind === 'time' ? `${v}s` : `${v}`);
export function fmtTarget(d, exId) {
  const [a, b] = target(d, exId);
  const ex = EXERCISES[exId];
  const range = a === b ? `${a}` : `${a}–${b}`;
  return ex.kind === 'time' ? `${range} sec` : `${range} reps${ex.perSide ? ' each' : ''}`;
}

// ---------------------------------------------------------------------------
// Time & weeks (local, Monday-start)
// ---------------------------------------------------------------------------

export function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
const weekKey = (date) => weekStart(date).toISOString().slice(0, 10);

export function daysSinceLast(d, now = new Date()) {
  const last = d.sessions[d.sessions.length - 1];
  if (!last) return null;
  const a = new Date(last.start); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

/** This week's count, the goal, the days trained, and the weekly streak. */
export function weekStats(d, now = new Date()) {
  const goal = d.settings.weeklyGoal;
  const byWeek = new Map();
  for (const s of d.sessions) byWeek.set(weekKey(s.start), (byWeek.get(weekKey(s.start)) || 0) + 1);
  const thisWeek = weekKey(now);
  const done = byWeek.get(thisWeek) || 0;
  const days = new Set(d.sessions.filter((s) => weekKey(s.start) === thisWeek).map((s) => (new Date(s.start).getDay() + 6) % 7));
  // Streak: consecutive goal-hitting weeks up to last week, plus this week if already hit.
  let streak = done >= goal ? 1 : 0;
  const cursor = weekStart(now);
  for (;;) {
    cursor.setDate(cursor.getDate() - 7);
    if ((byWeek.get(cursor.toISOString().slice(0, 10)) || 0) >= goal) streak++;
    else break;
  }
  return { done, goal, days, streak, left: Math.max(0, goal - done) };
}

// ---------------------------------------------------------------------------
// XP & levels
// ---------------------------------------------------------------------------

export const XP = { set: 10, hitTarget: 5, workout: 50, pr: 25 };
const TITLES = [[1, 'Rookie'], [4, 'Grinder'], [8, 'Athlete'], [13, 'Beast'], [19, 'Titan'], [26, 'Legend']];

export const totalXp = (d) => d.sessions.reduce((a, s) => a + (s.xp || 0), 0);

/** Level L needs 150·L·(L−1)/2 total XP (150, 300, 450… more per level). */
export function levelInfo(xp) {
  let level = 1;
  while (75 * (level + 1) * level <= xp) level++;
  const base = 75 * level * (level - 1), next = 75 * (level + 1) * level;
  const title = TITLES.filter(([l]) => level >= l).pop()[1];
  return { level, title, into: xp - base, need: next - base, pct: (xp - base) / (next - base) };
}

/** Score a finished session; also returns which exercises set a PR. */
export function scoreSession(d, session) {
  let xp = XP.workout;
  const prs = [];
  for (const exId of new Set(session.rounds.flatMap((r) => Object.keys(r)))) {
    const before = bestValue(d, exId);
    const now = Math.max(...session.rounds.map((r) => r[exId] ?? -Infinity));
    if (before != null && now > before) prs.push({ exId, value: now, prev: before });
  }
  for (const r of session.rounds) {
    for (const [exId, v] of Object.entries(r)) {
      xp += XP.set;
      if (v >= target(d, exId)[0]) xp += XP.hitTarget;
    }
  }
  xp += prs.length * XP.pr;
  return { xp, prs };
}

// ---------------------------------------------------------------------------
// Level-up suggestions: top of the range in every round, two sessions running
// ---------------------------------------------------------------------------

export function suggestions(d) {
  const out = [];
  const seen = new Set();
  for (const s of [...d.sessions].reverse()) {
    for (const exId of Object.keys(s.rounds[0] || {})) {
      if (seen.has(exId)) continue;
      seen.add(exId);
      const recent = d.sessions.filter((x) => x.rounds.some((r) => r[exId] != null)).slice(-2);
      if (recent.length < 2) continue;
      const max = target(d, exId)[1];
      const crushed = recent.every((x) => x.rounds.every((r) => r[exId] == null || r[exId] >= max));
      if (!crushed) continue;
      const lad = ladderOf(exId);
      if (lad && lad.index === (d.ladders[lad.id] ?? lad.ladder.start) && lad.index < lad.ladder.steps.length - 1) {
        out.push({ type: 'ladder', exId, ladder: lad.id, step: lad.index + 1, next: lad.ladder.steps[lad.index + 1] });
      } else {
        const [a, b] = target(d, exId);
        const bump = EXERCISES[exId].kind === 'time' ? 5 : 2;
        out.push({ type: 'target', exId, value: [a + bump, b + bump] });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export const ACHIEVEMENTS = [
  { id: 'first', name: 'First Rep', desc: 'Finish your first workout', test: (d) => d.sessions.length >= 1 },
  { id: 'w10', name: 'Ten Down', desc: '10 workouts', test: (d) => d.sessions.length >= 10 },
  { id: 'w25', name: 'Quarter Century', desc: '25 workouts', test: (d) => d.sessions.length >= 25 },
  { id: 'w50', name: 'Half Hundred', desc: '50 workouts', test: (d) => d.sessions.length >= 50 },
  { id: 'w100', name: 'Centurion', desc: '100 workouts', test: (d) => d.sessions.length >= 100 },
  { id: 'pr', name: 'New Best', desc: 'Set a personal record', test: (d) => d.sessions.some((s) => s.prs?.length) },
  { id: 'goal', name: 'Goal Getter', desc: 'Hit your weekly goal', test: (d) => weekStats(d).streak >= 1 },
  { id: 'streak3', name: 'Three-Peat', desc: '3-week streak', test: (d) => weekStats(d).streak >= 3 },
  { id: 'streak8', name: 'Iron Habit', desc: '8-week streak', test: (d) => weekStats(d).streak >= 8 },
  { id: 'rotation', name: 'Full Rotation', desc: 'Push, Pull and Abs within 7 days', test: (d) => {
    const week = d.sessions.filter((s) => Date.now() - new Date(s.start) < 7 * 86400000);
    return ['push', 'pull', 'abs'].every((w) => week.some((s) => s.workout === w));
  } },
  { id: 'extra', name: 'Extra Mile', desc: 'Do 4+ rounds in a workout', test: (d) => d.sessions.some((s) => s.rounds.length >= 4) },
  { id: 'early', name: 'Early Bird', desc: 'Start a workout before 8 AM', test: (d) => d.sessions.some((s) => new Date(s.start).getHours() < 8) },
  { id: 'skill', name: 'Skill Unlocked', desc: 'Move up any skill ladder', test: (d) => Object.entries(LADDERS).some(([id, l]) => (d.ladders[id] ?? l.start) > l.start) },
  { id: 'upside', name: 'Upside Down', desc: 'Reach freestanding handstand holds', test: (d) => (d.ladders.handstand ?? 0) >= 2 },
  { id: 'dragon', name: 'Dragon Slayer', desc: 'Unlock the full dragon flag', test: (d) => (d.ladders.dragon ?? 0) >= LADDERS.dragon.steps.length - 1 },
];

/** Achievements earned by the current data that aren't recorded yet. */
export const newAchievements = (d) => ACHIEVEMENTS.filter((a) => !d.achievements[a.id] && a.test(d));
