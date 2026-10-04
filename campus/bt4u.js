// bt4u.js — BT's BT4U web service (via the relay): named places and
// predicted stop times for upcoming trips. Used by directions. No DOM.
//
// Methods (documented at ridebt.org/developers):
//   GetAllPlaces
//   GetArrivalAndDepartureTimesForRoutes(routeShortNames, noOfTrips, serviceDate)

import { relayFetch, store } from './util.js';

const BASE = 'https://www.bt4uclassic.org/webservices/bt4u_webservice.asmx/';
const PLACES_TTL = 30 * 24 * 3600 * 1000;

/** Places BT's list doesn't have. */
export const EXTRA_PLACES = [
  { name: 'Creativity and Innovation District (CID)', lat: 37.22737, lon: -80.41726, aliases: ['CID', 'Creativity and Innovation District'] },
];

async function call(method, form) {
  const res = await relayFetch(BASE + method, { form });
  return res.text();
}

/** Tiny XML helpers (regex: the responses are flat and simple). */
function rows(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
}
const field = (row, tag) => {
  const m = row.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"') : null;
};

/** [{ name, lat, lon, aliases? }] — BT's named places plus EXTRA_PLACES. Cached 30 days. */
export async function getPlaces() {
  const cached = store.get('places');
  let places = cached && Date.now() - cached.at < PLACES_TTL ? cached.places : null;
  if (!places) {
    const xml = await call('GetAllPlaces');
    const seen = new Set();
    // Include places BT hides in its own app (e.g. Owens Hall): many are useful.
    places = rows(xml, 'CurrentPlaces')
      .map((r) => ({ name: field(r, 'PlaceName')?.trim(), lat: +field(r, 'Latitude'), lon: +field(r, 'Longitude') }))
      .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat !== 0)
      .filter((p) => (seen.has(p.name.toLowerCase()) ? false : seen.add(p.name.toLowerCase())));
    store.set('places', { at: Date.now(), places });
  }
  return [...EXTRA_PLACES, ...places];
}

/** BT wants MM/DD/YYYY. */
function serviceDate(d = new Date()) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Upcoming trips on a route with predicted times at each stop:
 * [{ id, route, pattern, stops: [{ code, name, rank, arrive: Date, depart: Date }] }]
 */
export async function getTrips(route, count = 6) {
  const xml = await call('GetArrivalAndDepartureTimesForRoutes', { routeShortNames: route, noOfTrips: String(count), serviceDate: serviceDate() });
  const trips = new Map();
  for (const r of rows(xml, 'DeparturesForRoute')) {
    const id = field(r, 'TripID');
    if (!trips.has(id)) trips.set(id, { id, route, pattern: field(r, 'PatternName'), stops: [] });
    trips.get(id).stops.push({
      code: field(r, 'StopCode'),
      name: field(r, 'StopName'),
      rank: Number(field(r, 'Rank')),
      arrive: new Date(field(r, 'CalculatedArrivalTime')),
      depart: new Date(field(r, 'CalculatedDepartureTime')),
    });
  }
  for (const t of trips.values()) t.stops.sort((a, b) => a.rank - b.rank);
  return [...trips.values()];
}
