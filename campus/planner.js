// planner.js — direct-bus trip planning. Pure functions, no DOM, no network.
//
// Given a start and end point, the known stops, and upcoming trips (with
// predicted times at each stop), it finds the fastest ways to get there on
// ONE bus: walk to a stop → wait → ride → walk to the destination. It also
// reports how long walking the whole way would take.

import { distanceM } from './util.js';

export const WALK_M_PER_MIN = 80;   // ≈ 3 mph
export const DETOUR = 1.25;         // streets aren't straight lines
export const MAX_WALK_M = 900;      // ≈ 0.55 mi each end
export const MIN_BOARD_BUFFER = 1;  // minutes of slack to reach the stop

/** Walking minutes between two points (rounded up). */
export const walkMinutes = (a, b) => Math.ceil((distanceM(a, b) * DETOUR) / WALK_M_PER_MIN);

/** Stops within walking range of a point: [{ stop, walk (min), dist (m) }], closest first. */
export function stopsNear(point, stops, maxM = MAX_WALK_M) {
  return stops
    .map((stop) => ({ stop, dist: distanceM(point, stop) }))
    .filter((x) => x.dist * DETOUR <= maxM)
    .map((x) => ({ ...x, walk: walkMinutes(point, x.stop) }))
    .sort((a, b) => a.dist - b.dist);
}

/** Routes that could connect the two ends directly (serve a stop near each). */
export function candidateRoutes(fromStops, toStops) {
  const near = (list) => new Set(list.flatMap((x) => x.stop.routes));
  const a = near(fromStops), b = near(toStops);
  return [...a].filter((r) => b.has(r));
}

/**
 * Best direct options, fastest arrival first (one per trip, top `limit`).
 * Each option: { route, pattern, tripId, board: {stop, walk, at}, alight: {stop, walk, at},
 *   leave (Date to start walking), arrive (Date at destination), rideMin, stopsRidden }
 */
export function planDirect({ from, to, stops, trips, now = new Date(), limit = 3 }) {
  const fromNear = stopsNear(from, stops);
  const toNear = stopsNear(to, stops);
  const walkFrom = new Map(fromNear.map((x) => [x.stop.code, x]));
  const walkTo = new Map(toNear.map((x) => [x.stop.code, x]));
  const options = [];

  for (const trip of trips) {
    let best = null;
    trip.stops.forEach((b, i) => {
      const wf = walkFrom.get(b.code);
      if (!wf) return;
      // Can we make it to this stop before the bus leaves?
      const reachBy = new Date(now.getTime() + (wf.walk + MIN_BOARD_BUFFER) * 60000);
      if (b.depart < reachBy) return;
      for (let j = i + 1; j < trip.stops.length; j++) {
        const a = trip.stops[j];
        const wt = walkTo.get(a.code);
        if (!wt) continue;
        const arrive = new Date(a.arrive.getTime() + wt.walk * 60000);
        const cand = {
          route: trip.route, pattern: trip.pattern, tripId: trip.id,
          board: { stop: wf.stop, walk: wf.walk, dist: wf.dist, at: b.depart, name: b.name },
          alight: { stop: wt.stop, walk: wt.walk, dist: wt.dist, at: a.arrive, name: a.name },
          leave: new Date(b.depart.getTime() - wf.walk * 60000),
          arrive,
          rideMin: Math.max(1, Math.round((a.arrive - b.depart) / 60000)),
          stopsRidden: j - i,
        };
        // Per trip: earliest arrival, then least total walking.
        if (!best || cand.arrive < best.arrive || (+cand.arrive === +best.arrive && cand.board.walk + cand.alight.walk < best.board.walk + best.alight.walk)) best = cand;
      }
    });
    if (best) options.push(best);
  }
  options.sort((x, y) => x.arrive - y.arrive || x.leave - y.leave);
  // A bus that gets you there later than walking isn't worth suggesting.
  const walkOnly = walkMinutes(from, to);
  const walkArrive = new Date(now.getTime() + walkOnly * 60000);
  return {
    options: options.filter((o) => o.arrive < walkArrive).slice(0, limit),
    walkOnly,
    walkArrive,
    anyBus: options.length > 0, // a bus exists, even if walking is faster
    fromNear, toNear,
  };
}

/**
 * Match typed text against saved places and BT places.
 * Exact nickname / name / alias first, then starts-with, then contains;
 * shorter names win ties. Returns up to `limit` places.
 */
export function searchPlaces(query, places, saved = [], limit = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return saved.slice(0, limit).map((s) => ({ ...s.place, nickname: s.nickname }));
  const scored = [];
  const score = (text) => {
    const t = text.toLowerCase();
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    if (t.split(/[\s/()-]+/).some((w) => w.startsWith(q))) return 2;
    if (t.includes(q)) return 3;
    return null;
  };
  for (const s of saved) {
    const sc = score(s.nickname);
    if (sc != null) scored.push({ p: { ...s.place, nickname: s.nickname }, sc: sc - 0.5, len: 0 });
  }
  for (const p of places) {
    const scores = [p.name, ...(p.aliases || [])].map(score).filter((x) => x != null);
    if (scores.length) scored.push({ p, sc: Math.min(...scores), len: p.name.length });
  }
  scored.sort((a, b) => a.sc - b.sc || a.len - b.len);
  const seen = new Set();
  return scored.map((x) => x.p).filter((p) => (seen.has(p.name) ? false : seen.add(p.name))).slice(0, limit);
}

/** Split "CID to McComas" → ['CID', 'McComas'] (or null). */
export function splitTrip(text) {
  const m = text.match(/^\s*(.+?)\s+(?:to|->|→)\s+(.+?)\s*$/i);
  return m ? [m[1], m[2]] : null;
}
