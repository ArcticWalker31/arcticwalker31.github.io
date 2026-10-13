// data.js — Forge data model, sync, and the game rules (XP, levels, streaks,
// PRs, achievements, level-up suggestions). No DOM.
//
// workout.json:
// {
//   version: 1,
//   settings: { weeklyGoal, rounds, rest, sound, workouts: { pull|push|abs: [slotKey…] } },
//   targets: { exerciseId: [min, max] },        // your edits to targets
//   custom: { id: { name, kind, target, cues } }, // exercises you added
//   skills: { treeNodeId: 'unlocked'|'progress'|'mastered' },
//   ladders: { ladderId: stepIndex },            // current step per skill
//   sessions: [{ id, workout, start, end, rounds: [{ exId: value }], xp, prs: [exId] }],
//   achievements: { id: ISO date earned }
// }

import { createStore } from '../shared/sync.js?v=4';
import { EXERCISES, LADDERS, WORKOUTS, ROTATION, DEFAULT_ABS, slotKey, keyToSlot } from './program.js?v=4';
import { NODES, GRADE_POINTS, STATUSES } from './tree.js?v=4';

export function defaults() {
  return {
    version: 1,
    settings: {
      weeklyGoal: 4, rounds: 3, rest: 210, sound: true,
      workouts: { pull: WORKOUTS.pull.slots.map(slotKey), push: WORKOUTS.push.slots.map(slotKey), abs: DEFAULT_ABS.map(slotKey) },
    },
    targets: {},
    custom: {},
    skills: {},
    ladders: Object.fromEntries(Object.entries(LADDERS).map(([id, l]) => [id, l.start])),
    sessions: [],
    achievements: {},
  };
}

function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : defaults();
  const def = defaults();
  const hadWorkouts = !!d.settings?.workouts;
  d.settings = { ...def.settings, ...(d.settings || {}) };
  // Older data kept only the Abs list; carry it into the editable workouts.
  if (!hadWorkouts && Array.isArray(d.settings.abs)) d.settings.workouts = { ...def.settings.workouts, abs: d.settings.abs };
  d.settings.workouts = { ...def.settings.workouts, ...d.settings.workouts };
  d.targets ||= {};
  d.custom ||= {};
  d.skills ||= {};
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
 *   { t: 'workout', key, slots: [slotKey…] }     edit a workout's exercises
 *   { t: 'custom', exercise: { id, name, kind, target, cues } }
 *   { t: 'skill', id, status, auto? }            auto = only ever upgrade
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
    case 'workout': d.settings.workouts[op.key] = [...op.slots]; break;
    case 'custom': d.custom[op.exercise.id] = op.exercise; break;
    case 'skill': {
      const rank = (st) => STATUSES.findIndex((x) => x.id === (st || 'locked'));
      if (!op.auto || rank(op.status) > rank(d.skills[op.id])) {
        if (op.status === 'locked') delete d.skills[op.id];
        else d.skills[op.id] = op.status;
      }
      break;
    }
  }
  return d;
}

export const store = createStore({ file: 'workout.json', ns: 'fg.', defaults, normalize, applyOp });
export const data = () => store.getData();

// ---------------------------------------------------------------------------
// Program helpers
// ---------------------------------------------------------------------------

/** An exercise from the library or one you added (never undefined). */
export function ex(exId, d = store.getData()) {
  return EXERCISES[exId] || d.custom?.[exId] || { name: exId, kind: 'reps', target: [8, 12], cues: [] };
}
export const allExercises = (d) => ({ ...EXERCISES, ...d.custom });

export const target = (d, exId) => d.targets[exId] || ex(exId, d).target;

/** A slot → the exercise to do now (ladders resolve to the current step). */
export function resolveSlot(d, slot) {
  if (typeof slot === 'string') return slot;
  const l = LADDERS[slot.ladder];
  return l.steps[Math.min(d.ladders[slot.ladder] ?? l.start, l.steps.length - 1)];
}

export function workoutSlots(d, key) {
  return (d.settings.workouts[key] || []).map(keyToSlot);
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

export const fmtValue = (exId, v) => (v == null ? '—' : ex(exId).kind === 'time' ? `${v}s` : `${v}`);
export function fmtTarget(d, exId) {
  const [a, b] = target(d, exId);
  const e = ex(exId, d);
  const range = a === b ? `${a}` : `${a}–${b}`;
  return e.kind === 'time' ? `${range} sec` : `${range} reps${e.perSide ? ' each' : ''}`;
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
        const bump = ex(exId, d).kind === 'time' ? 5 : 2;
        out.push({ type: 'target', exId, value: [a + bump, b + bump] });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Skill tree: statuses, automatic upgrades from logged sets, and rank
// ---------------------------------------------------------------------------

/** Your exercises → the tree skill they show progress on. */
const EX_TO_SKILL = {
  'decline-pushup': 'Push-up', dips: 'Dip', 'pike-pushup': 'Elevated Pike PU',
  pullup: 'Pull-up', 'australian-chinup': 'Inverted Row', 'scap-pull': 'Scapula Pull-up', 'active-hang': 'Active Hang',
  'hollow-hold': 'Hollow Body Hold', 'wall-handstand': 'Assisted Handstand', 'hs-kickup': 'Handstand', handstand: 'Handstand',
  'planche-lean': 'Planche Lean', 'pp-pushup': 'Pseudo Push-up', 'tuck-planche': 'Tuck Planche',
  lsit: 'L-sit', 'dragon-flag': 'Dragon Flag',
};
const NODE_BY_NAME = Object.fromEntries(NODES.map((n) => [n.name, n]));
export const skillForExercise = (exId) => NODE_BY_NAME[EX_TO_SKILL[exId]] || null;
export const skillStatus = (d, nodeId) => d.skills[nodeId] || 'locked';
const statusRank = (x) => STATUSES.findIndex((s) => s.id === (x || 'locked'));

/** Status earned by one set: 2 s / 1 rep unlocks, 6 s / 3 reps in progress, 12 s / 6 reps mastered. */
function statusFor(kind, v) {
  const [u, p, m] = kind === 'time' ? [2, 6, 12] : [1, 3, 6];
  return v >= m ? 'mastered' : v >= p ? 'progress' : v >= u ? 'unlocked' : null;
}

/** Ops that upgrade tree skills from a session's best sets (never downgrade). */
export function autoSkillOps(d, session) {
  const ops = [];
  for (const exId of new Set(session.rounds.flatMap((r) => Object.keys(r)))) {
    const node = skillForExercise(exId);
    if (!node) continue;
    const best = Math.max(...session.rounds.map((r) => r[exId] ?? 0));
    const st = statusFor(ex(exId, d).kind, best);
    if (st && statusRank(st) > statusRank(skillStatus(d, node.id))) ops.push({ t: 'skill', id: node.id, status: st, auto: true });
  }
  return ops;
}

const MAX_SKILL_POINTS = NODES.reduce((a, n) => a + GRADE_POINTS[n.grade], 0);
const RANKS = [[0, 'Unranked'], [0.02, 'Bronze'], [0.07, 'Silver'], [0.15, 'Gold'], [0.3, 'Platinum'], [0.5, 'Diamond'], [0.75, 'Master']];

/** Skill points = grade points × status multiplier, and the rank they earn. */
export function skillRank(d) {
  let points = 0;
  for (const n of NODES) points += GRADE_POINTS[n.grade] * STATUSES[statusRank(skillStatus(d, n.id))].mult;
  const pct = points / MAX_SKILL_POINTS;
  let i = 0;
  while (i + 1 < RANKS.length && pct >= RANKS[i + 1][0]) i++;
  const next = RANKS[i + 1];
  return { points: Math.round(points), max: MAX_SKILL_POINTS, rank: RANKS[i][1], next: next ? { name: next[1], at: Math.ceil(next[0] * MAX_SKILL_POINTS) } : null };
}
const countSkills = (d, status) => Object.values(d.skills).filter((s) => s === status).length;
const atLeast = (d, name, status) => {
  const n = NODE_BY_NAME[name];
  return !!n && statusRank(skillStatus(d, n.id)) >= statusRank(status);
};

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

const sets = (d) => d.sessions.flatMap((s) => s.rounds.flatMap((r) => Object.entries(r)));
const totalReps = (d) => sets(d).filter(([id]) => ex(id, d).kind !== 'time').reduce((a, [, v]) => a + v, 0);
const totalHold = (d) => sets(d).filter(([id]) => ex(id, d).kind === 'time').reduce((a, [, v]) => a + v, 0);
const prCount = (d) => d.sessions.reduce((a, s) => a + (s.prs?.length || 0), 0);
const ofType = (d, w) => d.sessions.filter((s) => s.workout === w).length;
const hourOf = (s) => new Date(s.start).getHours();
const DAY = 86400000;

export const ACHIEVEMENTS = [
  // Showing up
  { id: 'first', name: 'First Rep', desc: 'Finish your first workout', test: (d) => d.sessions.length >= 1 },
  { id: 'w10', name: 'Ten Down', desc: '10 workouts', test: (d) => d.sessions.length >= 10 },
  { id: 'w25', name: 'Quarter Century', desc: '25 workouts', test: (d) => d.sessions.length >= 25 },
  { id: 'w50', name: 'Half Hundred', desc: '50 workouts', test: (d) => d.sessions.length >= 50 },
  { id: 'w100', name: 'Centurion', desc: '100 workouts', test: (d) => d.sessions.length >= 100 },
  { id: 'w250', name: 'Forged in Iron', desc: '250 workouts', test: (d) => d.sessions.length >= 250 },
  { id: 'pull10', name: 'Pull Specialist', desc: '10 Pull workouts', test: (d) => ofType(d, 'pull') >= 10 },
  { id: 'push10', name: 'Push Specialist', desc: '10 Push workouts', test: (d) => ofType(d, 'push') >= 10 },
  { id: 'abs10', name: 'Core Crusher', desc: '10 Abs workouts', test: (d) => ofType(d, 'abs') >= 10 },
  { id: 'rotation', name: 'Full Rotation', desc: 'Pull, Push and Abs within 7 days', test: (d) => {
    const week = d.sessions.filter((s) => Date.now() - new Date(s.start) < 7 * DAY);
    return ['push', 'pull', 'abs'].every((w) => week.some((s) => s.workout === w));
  } },
  { id: 'comeback', name: 'Comeback Kid', desc: 'Train again after 7+ days off', test: (d) => d.sessions.some((s, i) => i > 0 && new Date(s.start) - new Date(d.sessions[i - 1].start) >= 7 * DAY) },
  { id: 'early', name: 'Early Bird', desc: 'Start a workout before 8 AM', test: (d) => d.sessions.some((s) => hourOf(s) < 8) },
  { id: 'night', name: 'Night Owl', desc: 'Start a workout after 10 PM', test: (d) => d.sessions.some((s) => hourOf(s) >= 22) },
  { id: 'weekend', name: 'Weekend Warrior', desc: 'Train Saturday and Sunday of one weekend', test: (d) => d.sessions.some((s) => {
    const a = new Date(s.start);
    if (a.getDay() !== 6) return false;
    return d.sessions.some((t) => { const b = new Date(t.start); return b.getDay() === 0 && b - a > 0 && b - a < 2 * DAY; });
  }) },

  // Streaks & goals
  { id: 'goal', name: 'Goal Getter', desc: 'Hit your weekly goal', test: (d) => weekStats(d).streak >= 1 },
  { id: 'streak3', name: 'Three-Peat', desc: '3-week streak', test: (d) => weekStats(d).streak >= 3 },
  { id: 'streak4', name: 'Month Strong', desc: '4-week streak', test: (d) => weekStats(d).streak >= 4 },
  { id: 'streak8', name: 'Iron Habit', desc: '8-week streak', test: (d) => weekStats(d).streak >= 8 },
  { id: 'streak12', name: 'Quarter Beast', desc: '12-week streak', test: (d) => weekStats(d).streak >= 12 },
  { id: 'streak26', name: 'Half-Year Hero', desc: '26-week streak', test: (d) => weekStats(d).streak >= 26 },
  { id: 'streak52', name: 'Year of Iron', desc: '52-week streak', test: (d) => weekStats(d).streak >= 52 },

  // Effort & records
  { id: 'extra', name: 'Extra Mile', desc: 'Do 4+ rounds in a workout', test: (d) => d.sessions.some((s) => s.rounds.length >= 4) },
  { id: 'marathon', name: 'Marathon', desc: 'Do 5+ rounds in a workout', test: (d) => d.sessions.some((s) => s.rounds.length >= 5) },
  { id: 'flawless', name: 'Flawless', desc: 'Hit the target on every set of a workout', test: (d) => d.sessions.some((s) => s.rounds.length >= 3 && s.rounds.every((r) => Object.entries(r).every(([id, v]) => v >= target(d, id)[0]))) },
  { id: 'reps1k', name: 'Thousand Club', desc: '1,000 total reps', test: (d) => totalReps(d) >= 1000 },
  { id: 'reps10k', name: 'Ten Thousand', desc: '10,000 total reps', test: (d) => totalReps(d) >= 10000 },
  { id: 'hold10', name: 'Time Under Tension', desc: '10 minutes of total holds', test: (d) => totalHold(d) >= 600 },
  { id: 'hold60', name: 'Statue', desc: '1 hour of total holds', test: (d) => totalHold(d) >= 3600 },
  { id: 'pr', name: 'New Best', desc: 'Set a personal record', test: (d) => prCount(d) >= 1 },
  { id: 'pr3', name: 'Triple Threat', desc: '3 PRs in one workout', test: (d) => d.sessions.some((s) => (s.prs?.length || 0) >= 3) },
  { id: 'pr25', name: 'PR Machine', desc: '25 personal records', test: (d) => prCount(d) >= 25 },
  { id: 'lvl10', name: 'Double Digits', desc: 'Reach level 10', test: (d) => levelInfo(totalXp(d)).level >= 10 },
  { id: 'lvl20', name: 'Titan Tier', desc: 'Reach level 20', test: (d) => levelInfo(totalXp(d)).level >= 20 },

  // Skills
  { id: 'skill', name: 'Level Up a Skill', desc: 'Move up a progression ladder', test: (d) => Object.entries(LADDERS).some(([id, l]) => (d.ladders[id] ?? l.start) > l.start) },
  { id: 'tree1', name: 'Branching Out', desc: 'Unlock a skill on the tree', test: (d) => Object.keys(d.skills).length >= 1 },
  { id: 'tree5', name: 'Five Mastered', desc: 'Master 5 tree skills', test: (d) => countSkills(d, 'mastered') >= 5 },
  { id: 'tree15', name: 'Skill Collector', desc: 'Master 15 tree skills', test: (d) => countSkills(d, 'mastered') >= 15 },
  { id: 'gold', name: 'Gold Rank', desc: 'Reach Gold skill rank', test: (d) => ['Gold', 'Platinum', 'Diamond', 'Master'].includes(skillRank(d).rank) },
  { id: 'upside', name: 'Upside Down', desc: 'Handstand in progress (6 s+)', test: (d) => atLeast(d, 'Handstand', 'progress') || (d.ladders.handstand ?? 0) >= 2 },
  { id: 'muscleup', name: 'Over the Bar', desc: 'Unlock the muscle-up', test: (d) => atLeast(d, 'Muscle-Up', 'unlocked') },
  { id: 'lever', name: 'Hover Mode', desc: 'Tuck front lever in progress', test: (d) => atLeast(d, 'Tuck FL', 'progress') },
  { id: 'planche', name: 'Floating', desc: 'Unlock the tuck planche', test: (d) => atLeast(d, 'Tuck Planche', 'unlocked') },
  { id: 'dragon', name: 'Dragon Slayer', desc: 'Unlock the full dragon flag', test: (d) => atLeast(d, 'Dragon Flag', 'unlocked') || (d.ladders.dragon ?? 0) >= LADDERS.dragon.steps.length - 1 },
  { id: 'custom', name: 'Make It Yours', desc: 'Customize a workout', test: (d) => Object.keys(d.custom).length > 0 || ['pull', 'push', 'abs'].some((w) => JSON.stringify(d.settings.workouts[w]) !== JSON.stringify(defaults().settings.workouts[w])) },
];

/** Achievements earned by the current data that aren't recorded yet. */
export const newAchievements = (d) => ACHIEVEMENTS.filter((a) => !d.achievements[a.id] && a.test(d));
