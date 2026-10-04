// geo.js — GPS position and a friendly place name.

/** Current position as { lat, lon }. Rejects with a GeolocationPositionError. */
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('Location is not supported in this browser'), { code: 2 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

/**
 * "Brooklyn, NY" from coordinates via BigDataCloud's free, keyless
 * client-side reverse geocoder. Coordinates are rounded to 2 decimals
 * (~1 km) before they leave the device.
 */
export async function placeName(lat, lon) {
  const url = `https://api-bdc.io/data/reverse-geocode-client?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&localityLanguage=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Place lookup failed');
  const j = await res.json();
  // In the US, `city`/`locality` are often census subdivisions ("District
  // A-01"). Prefer the incorporated town/city (admin level 8), then a real
  // locality, then the county.
  const admin = j.localityInfo?.administrative ?? [];
  const level = (n) => admin.find((a) => a.adminLevel === n)?.name;
  const usable = (s) => s && !/\bdistrict\b/i.test(s) && !/\d/.test(s);
  const name = [level(8), j.locality, j.city, level(7), level(6), j.principalSubdivision].find(usable) || '';
  const state = (j.principalSubdivisionCode || '').replace(/^US-/, '');
  return name ? (state && state !== name ? `${name}, ${state}` : name) : null;
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Human message for a location failure. */
export function locationErrorText(err) {
  if (err?.code === 1) {
    return 'Location access is off. Allow it for this site to see your local weather (iPhone: Settings → Privacy & Security → Location Services → Safari Websites → While Using).';
  }
  if (err?.code === 3) return 'Finding your location took too long.';
  return 'Couldn’t get your location.';
}
