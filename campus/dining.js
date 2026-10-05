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

/**
 * Dining halls: the building part of each venue name in VT's feed, with a
 * friendlier display name and a location (for "nearest first").
 * Venues without a building prefix (e.g. "West End") are their own hall.
 */
export const HALLS = {
  'Turner Place': { name: 'Turner Place', lat: 37.23045, lon: -80.42294 },
  'West End': { name: 'West End', lat: 37.22261, lon: -80.42022 },
  'Perry Place': { name: 'Perry Place', lat: 37.22944, lon: -80.42606 },
  'Owens Hall': { name: 'Owens', lat: 37.2267, lon: -80.4189 },
  'Squires Food Court': { name: 'Squires', lat: 37.2298, lon: -80.4187 },
  Dietrick: { name: 'Dietrick', lat: 37.2245, lon: -80.4211 },
  GLC: { name: 'GLC', lat: 37.2282, lon: -80.4176 },
  'Goodwin Hall': { name: 'Goodwin Hall', lat: 37.2324, lon: -80.4254 },
  'Johnston Student Center': { name: 'Johnston Student Center', lat: 37.2292, lon: -80.4246 },
};

/** Group venues into halls: [{ key, name, lat?, lon?, venues }] */
export function groupByHall(venues) {
  const halls = new Map();
  for (const v of venues) {
    const key = v.building || v.name;
    const info = HALLS[key] || { name: key };
    if (!halls.has(key)) halls.set(key, { key, ...info, venues: [] });
    halls.get(key).venues.push(v);
  }
  return [...halls.values()];
}
