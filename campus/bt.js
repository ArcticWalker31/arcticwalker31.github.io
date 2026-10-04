// bt.js — Blacksburg Transit data (via the relay). No DOM.
//
// Endpoints are the ones ridebt.org's own map uses:
//   getRoutes, getRoutePatterns, getPatternPoints (POST patternName),
//   getNextDeparturesForStop (POST stopCode, numOfTrips), getBuses.

import { relayFetch, store } from './util.js';

const BASE = 'https://ridebt.org/index.php?option=com_ajax&module=bt_map&format=json&Itemid=101&method=';
// BT only lists the routes running TODAY, so stops/routes are re-read daily
// and MERGED into what we already know (weekday-only routes stick around).
const STOPS_TTL = 24 * 3600 * 1000;

async function call(method, form) {
  const res = await relayFetch(BASE + method, { form });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'BT error');
  return json.data;
}

/** { CAS: { name, color, text } , … } */
export async function getRoutes() {
  const cached = store.get('routes');
  if (cached && Date.now() - cached.at < STOPS_TTL) return cached.routes;
  const data = await call('getRoutes');
  const routes = { ...(cached?.routes || {}) };
  for (const [code, list] of Object.entries(data)) {
    const r = list[0] || {};
    routes[code] = { name: r.routeName || code, color: `#${r.routeColor || '666666'}`, text: `#${r.routeTextColor || 'FFFFFF'}` };
  }
  store.set('routes', { at: Date.now(), routes });
  return routes;
}

/**
 * All bus stops: [{ code, name, lat, lon, routes: ['HWC', …] }].
 * Built from every route pattern's points; refreshed daily and merged with
 * previously seen stops.
 */
export async function getStops({ force = false } = {}) {
  const cached = store.get('stops');
  if (!force && cached && Date.now() - cached.at < STOPS_TTL) return cached.stops;
  const patterns = await call('getRoutePatterns');
  const byCode = new Map((cached?.stops || []).map((s) => [s.code, { ...s, routes: [...s.routes] }]));
  // A few requests at a time to be polite to BT.
  const queue = [...patterns];
  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      let points = [];
      try { points = await call('getPatternPoints', { patternName: p.name }); } catch { /* skip pattern */ }
      for (const pt of points) {
        if (pt.isBusStop !== 'Y' || !pt.stopCode) continue;
        const s = byCode.get(pt.stopCode) ?? { code: pt.stopCode, name: pt.patternPointName, lat: +pt.latitude, lon: +pt.longitude, routes: [] };
        if (!s.routes.includes(p.routeId)) s.routes.push(p.routeId);
        byCode.set(pt.stopCode, s);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  const stops = [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (stops.length) store.set('stops', { at: Date.now(), stops });
  return stops;
}

/** Next departures at a stop: [{ route, pattern, time: Date }] */
export async function getDepartures(stopCode, count = 3) {
  const data = await call('getNextDeparturesForStop', { stopCode, numOfTrips: String(count) });
  return data.map((d) => ({ route: d.routeShortName, pattern: d.patternName, time: new Date(d.adjustedDepartureTime) }));
}

/**
 * Live buses: [{ id, route, pattern, lat, lon, heading, full (0–100 or null),
 *   atStop, updatedAt (ms epoch of the GPS fix) }]
 */
export async function getBuses() {
  const data = await call('getBuses');
  return data
    .map((b) => {
      const s = b.states?.[0] || {};
      const full = b.percentOfCapacity === '' || b.percentOfCapacity == null ? null : Number(b.percentOfCapacity);
      return {
        id: b.id, route: b.routeId, pattern: b.patternName,
        lat: Number(s.realtimeLatitude ?? s.latitude), lon: Number(s.realtimeLongitude ?? s.longitude),
        heading: Number(s.direction) || 0, full, atStop: s.isBusAtStop === 'Y',
        updatedAt: Number(s.version) || null, // BT's "version" is the GPS fix time
      };
    })
    .filter((b) => b.route && Number.isFinite(b.lat) && Number.isFinite(b.lon));
}

const pathCache = new Map();

/**
 * A route pattern's path in driving order:
 * [{ lat, lon, stop: boolean, name, code }] (waypoints have stop=false).
 * Cached for the session.
 */
export async function getPatternPath(patternName) {
  if (pathCache.has(patternName)) return pathCache.get(patternName);
  const points = await call('getPatternPoints', { patternName });
  const path = points
    .map((p) => ({ lat: +p.latitude, lon: +p.longitude, stop: p.isBusStop === 'Y', name: p.patternPointName, code: p.stopCode }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  pathCache.set(patternName, path);
  return path;
}
