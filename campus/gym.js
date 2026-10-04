// gym.js — RecSports crowd levels and today's hours. No DOM rendering.
//
// Occupancy: the public RecSports occupancy page (allows cross-site reads),
//   parsed from its server-rendered cards.
// Hours: VT's RecSports hours feed (via the relay; it blocks browsers).

import { relayFetch, dateKey, atTime } from './util.js';

const OCCUPANCY_URL = 'https://connect.recsports.vt.edu/FacilityOccupancy';
const HOURS_URL = 'https://apps.students.vt.edu/rshours/Api/NonRestricted/UnitsOpenOnDay/Date/';

/**
 * Facilities we show, in order. `match` finds the card on the occupancy page;
 * `hours` is the unit name in the hours feed (null = no published hours).
 */
export const FACILITIES = [
  { id: 'war', name: 'War Memorial Hall', match: /^WMH|War Memorial/i, hours: 'War Memorial' },
  { id: 'mccomas', name: 'McComas Hall', match: /McComas/i, hours: 'McComas' },
  { id: 'boulder', name: 'Bouldering Wall', match: /Boulder/i, hours: null },
];

/** [{ id, name, count, max, ratio }] plus `asOf` text ("4:55 PM") */
export async function getOccupancy() {
  const res = await fetch(OCCUPANCY_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`RecSports error ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const cards = [...doc.querySelectorAll('.occupancy-card')].map((card) => {
    const name = card.querySelector('h2')?.textContent.trim() || '';
    const chart = card.querySelector('canvas.occupancy-chart');
    const count = Number(chart?.dataset.occupancy);
    const remaining = Number(chart?.dataset.remaining);
    return { name, count, max: count + remaining, ratio: Number(chart?.dataset.ratio) };
  });
  const asOf = (doc.body.textContent.match(/Showing results from\s+([0-9:]+\s*[AP]M)/i) || [])[1] || null;
  const facilities = FACILITIES.map((f) => {
    const c = cards.find((x) => f.match.test(x.name));
    return c && Number.isFinite(c.count) ? { id: f.id, name: f.name, count: c.count, max: c.max, ratio: c.ratio } : { id: f.id, name: f.name, missing: true };
  });
  return { facilities, asOf };
}

/** { war: [{ open: Date, close: Date, label }], mccomas: [...] } for today. */
export async function getHours() {
  const day = dateKey();
  const res = await relayFetch(HOURS_URL + day);
  const units = await res.json();
  const out = {};
  for (const f of FACILITIES) {
    if (!f.hours) continue;
    const unit = units.find((u) => u.name === f.hours);
    out[f.id] = (unit?.hours || [])
      .filter((h) => h.open_time && h.close_time)
      .map((h) => {
        const open = atTime(day, h.open_time);
        let close = atTime(day, h.close_time);
        if (close <= open) close = new Date(close.getTime() + 86400000); // past midnight
        return { open, close, label: h.label };
      })
      .sort((a, b) => a.open - b.open);
  }
  return out;
}

/** Quiet / Moderate / Busy from a 0–1 ratio. */
export function crowdLevel(ratio) {
  if (ratio < 0.4) return { key: 'quiet', label: 'Quiet' };
  if (ratio < 0.7) return { key: 'moderate', label: 'Moderate' };
  return { key: 'busy', label: 'Busy' };
}
