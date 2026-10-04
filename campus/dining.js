// dining.js — today's VT Dining hours. No DOM.
//
// Source: VT's official hours feed (apps.students.vt.edu/hours), which
// allows cross-site reads. It lists the venues open on a given day.

import { getJSON, dateKey, atTime } from './util.js';

const URL = 'https://apps.students.vt.edu/hours/Api/NonRestricted/UnitsOpenOnDay/Date/';

function periods(day, unit) {
  return (unit.hours || [])
    .filter((h) => h.open_time && h.close_time)
    .map((h) => {
      const open = atTime(day, h.open_time);
      let close = atTime(day, h.close_time);
      if (close <= open) close = new Date(close.getTime() + 86400000); // e.g. 6 PM – 2 AM
      return { open, close, label: h.label === 'Regular Hours' ? '' : h.label };
    })
    .sort((a, b) => a.open - b.open);
}

/**
 * Venues with their status right now:
 *   { name, building, periods, menu, state: 'open'|'later'|'closed', until: Date|null }
 * Late-night venues from yesterday that are still open (e.g. until 2 AM)
 * are included too.
 */
export async function getDining(now = new Date()) {
  const today = dateKey(now);
  const yesterday = dateKey(new Date(now.getTime() - 86400000));
  const [todayUnits, yUnits] = await Promise.all([
    getJSON(URL + today),
    now.getHours() < 5 ? getJSON(URL + yesterday).catch(() => []) : Promise.resolve([]),
  ]);

  const venues = new Map();
  const add = (unit, day) => {
    const ps = periods(day, unit);
    const v = venues.get(unit.id) ?? {
      id: unit.id,
      ...splitName(unit.name),
      menu: unit.urls?.find((u) => /menu/i.test(u.label))?.url?.replace(/^http:/, 'https:') || null,
      periods: [],
    };
    v.periods.push(...ps);
    venues.set(unit.id, v);
  };
  for (const u of yUnits) {
    // Only yesterday's periods that run past midnight into now matter.
    if (periods(yesterday, u).some((p) => p.close > now)) add(u, yesterday);
  }
  for (const u of todayUnits) add(u, today);

  return [...venues.values()].map((v) => {
    v.periods = v.periods.filter((p) => p.close > new Date(now.getTime() - 12 * 3600000)).sort((a, b) => a.open - b.open);
    const current = v.periods.find((p) => p.open <= now && now < p.close);
    const next = v.periods.find((p) => p.open > now);
    if (current) return { ...v, state: 'open', until: current.close, period: current };
    if (next) return { ...v, state: 'later', until: next.open, period: next };
    return { ...v, state: 'closed', until: null, period: null };
  });
}

/** "Owens Hall - Dunkin'" → { building: 'Owens Hall', name: "Dunkin'" } */
function splitName(full) {
  const i = full.indexOf(' - ');
  return i < 0 ? { building: '', name: full } : { building: full.slice(0, i), name: full.slice(i + 3) };
}
