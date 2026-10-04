// stats.js — pure statistics over the habit data, for the dashboard.
// No DOM; everything here is a function of (data, today).
//
// Rules:
// - A day where a habit is active but has no complete entry counts as MISSED
//   ("not logged" = not done on the dashboard).
// - Exception: TODAY is in progress. It counts once a habit is complete, but
//   an incomplete today never lowers a percentage or breaks a streak.
// - Days before a habit was created / from its archive date are inactive and
//   ignored entirely.

import { addDays, parseKey, isActiveOn, habitStatus, effectiveGoal } from './data.js';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday = 0 … Sunday = 6. */
export const weekdayIndex = (key) => (parseKey(key).getDay() + 6) % 7;

/** Earliest date that has any data (habit creation or log entry). */
export function firstDate(data, today) {
  let first = today;
  for (const h of data.habits) if (h.createdAt && h.createdAt < first) first = h.createdAt;
  for (const k of Object.keys(data.log)) if (k < first) first = k;
  return first;
}

/** Date keys from start to end inclusive. */
export function dateSpan(start, end) {
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Days in a range: '7' | '30' | '90' | 'all', ending today. */
export function rangeDays(data, range, today) {
  const start = range === 'all' ? firstDate(data, today) : addDays(today, -(Number(range) - 1));
  return dateSpan(start, today);
}

/**
 * One habit on one day:
 *   'inactive' (didn't exist / archived) | 'done' | 'missed' | 'pending' (today, not done yet)
 */
export function cellState(habit, data, date, today) {
  if (!isActiveOn(habit, date)) return 'inactive';
  if (habitStatus(habit, data.log[date], date) === 'done') return 'done';
  return date === today ? 'pending' : 'missed';
}

/** Counts toward percentages? (done or missed; never inactive/pending) */
export const counts = (state) => state === 'done' || state === 'missed';

/** Habits active on at least one of `days` (includes archived ones). */
export function habitsInDays(data, days) {
  return data.habits.filter((h) => days.some((d) => isActiveOn(h, d)));
}

/** Whole-day summary: { date, done, total, eligible, pct, inProgress, perfect } */
export function daySummary(data, date, today) {
  let done = 0, total = 0, eligible = 0;
  for (const h of data.habits) {
    const s = cellState(h, data, date, today);
    if (s === 'inactive') continue;
    total++;
    if (s === 'done') done++;
    if (counts(s)) eligible++;
  }
  return {
    date,
    done,
    total,
    eligible,
    // Today's bar shows progress so far; inProgress keeps it out of averages.
    pct: total ? done / total : null,
    inProgress: date === today && done < total,
    perfect: total > 0 && done === total,
  };
}

/**
 * Group days into chart buckets. Up to 120 days: one bucket per day.
 * Longer ("All"): one bucket per Monday-start week so bars stay readable.
 */
export function bucketize(days) {
  if (days.length <= 120) return { weekly: false, buckets: days.map((d) => ({ key: d, days: [d] })) };
  const map = new Map();
  for (const d of days) {
    const monday = addDays(d, -weekdayIndex(d));
    if (!map.has(monday)) map.set(monday, { key: monday, days: [] });
    map.get(monday).days.push(d);
  }
  return { weekly: true, buckets: [...map.values()] };
}

/**
 * Completion per bucket plus a rolling average (7 days, or 4 weeks when
 * weekly). `days` should start ~7 days before the visible range so the
 * average is meaningful from the first visible bar; `visibleFrom` trims.
 */
export function completionSeries(data, days, today, visibleFrom) {
  const { weekly, buckets } = bucketize(days);
  const series = buckets.map((b) => {
    let done = 0, total = 0, inProgress = false, perfectDays = 0;
    let avgDone = 0, avgTotal = 0; // excludes an unfinished today
    for (const d of b.days) {
      const s = daySummary(data, d, today);
      done += s.done;
      total += s.total;
      if (s.perfect) perfectDays++;
      if (s.inProgress) inProgress = true;
      else { avgDone += s.done; avgTotal += s.total; }
    }
    return {
      key: b.key, days: b.days, done, total, inProgress, perfectDays,
      pct: total ? done / total : null,               // bar height (today = so far)
      perfect: !weekly && total > 0 && done === total,
      avgPct: avgTotal ? avgDone / avgTotal : null,   // feeds the rolling average
    };
  });

  const win = weekly ? 4 : 7;
  series.forEach((item, i) => {
    const window = series.slice(Math.max(0, i - win + 1), i + 1).filter((x) => x.avgPct != null);
    item.rolling = window.length ? window.reduce((a, x) => a + x.avgPct, 0) / window.length : null;
  });
  return { weekly, series: series.filter((x) => x.days[x.days.length - 1] >= visibleFrom) };
}

/** Current and best streak from a list of states, oldest -> newest. */
export function streaks(states) {
  let best = 0, run = 0;
  for (const s of states) {
    if (s === 'done') best = Math.max(best, ++run);
    else if (s !== 'pending') run = 0;  // missed or inactive breaks it
  }
  let current = 0;
  for (let i = states.length - 1; i >= 0; i--) {
    if (states[i] === 'pending') continue; // today not done yet: doesn't break
    if (states[i] !== 'done') break;
    current++;
  }
  return { current, best };
}

/** Per-habit stats for the range; streaks are all-time. */
export function habitStats(habit, data, days, today) {
  let done = 0, eligible = 0;
  for (const d of days) {
    const s = cellState(habit, data, d, today);
    if (s === 'done') done++;
    if (counts(s)) eligible++;
  }
  // Streaks run over the habit's whole lifetime, ignoring days it didn't exist.
  const allDays = dateSpan(firstDate(data, today), today);
  const st = streaks(allDays.map((d) => cellState(habit, data, d, today)).filter((s) => s !== 'inactive'));
  if (habit.archived) st.current = 0; // an archived habit has no running streak
  return { done, eligible, rate: eligible ? done / eligible : null, ...st };
}

/** Perfect-day stats: count in range, plus all-time current/best streak. */
export function perfectDayStats(data, days, today) {
  const stateOf = (d) => {
    const s = daySummary(data, d, today);
    if (!s.total) return 'inactive';
    if (s.perfect) return 'done';
    return d === today ? 'pending' : 'missed';
  };
  const count = days.filter((d) => stateOf(d) === 'done').length;
  const allDays = dateSpan(firstDate(data, today), today);
  // Days with no habits at all (before the very first one) don't break streaks.
  return { count, ...streaks(allDays.map(stateOf).filter((s) => s !== 'inactive')) };
}

/** Overall share of habit-days done in the range. */
export function overallRate(data, days, today) {
  let done = 0, eligible = 0;
  for (const d of days) {
    for (const h of data.habits) {
      const s = cellState(h, data, d, today);
      if (s === 'done') done++;
      if (counts(s)) eligible++;
    }
  }
  return { done, eligible, rate: eligible ? done / eligible : null };
}

/** Completion % per weekday (Mon..Sun) across the range. */
export function weekdayRates(data, days, today) {
  const done = Array(7).fill(0), eligible = Array(7).fill(0);
  for (const d of days) {
    const w = weekdayIndex(d);
    for (const h of data.habits) {
      const s = cellState(h, data, d, today);
      if (s === 'done') done[w]++;
      if (counts(s)) eligible[w]++;
    }
  }
  return WEEKDAYS.map((name, i) => ({
    name, done: done[i], eligible: eligible[i], rate: eligible[i] ? done[i] / eligible[i] : null,
  }));
}

/**
 * Raw values for a minutes/count habit, bucketed like the completion chart.
 * Weekly buckets average the logged days. `goal` is the goal in effect at the
 * bucket's last day.
 */
export function valueSeries(habit, data, days, today) {
  const { weekly, buckets } = bucketize(days);
  return {
    weekly,
    series: buckets.map((b) => {
      const active = b.days.filter((d) => isActiveOn(habit, d));
      const logged = active.map((d) => data.log[d]?.[habit.id]).filter((v) => typeof v === 'number');
      const last = b.days[b.days.length - 1];
      return {
        key: b.key,
        days: b.days,
        active: active.length > 0,
        value: logged.length ? logged.reduce((a, v) => a + v, 0) / logged.length : null,
        loggedDays: logged.length,
        goal: active.length ? effectiveGoal(habit, last) : null,
        state: weekly ? null : cellState(habit, data, last, today),
      };
    }),
  };
}
