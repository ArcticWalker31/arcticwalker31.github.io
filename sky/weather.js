// weather.js — fetching, merging and describing the forecast. No DOM.
//
// Sources (all free, no API key, called straight from the browser):
//   • NOAA National Blend of Models (NBM) via Open-Meteo — the blend the
//     National Weather Service starts from; the most accurate general US
//     forecast. Preferred for every value it provides.
//   • NOAA HRRR + GFS ("gfs_seamless") via Open-Meteo — fills what NBM lacks
//     (UV, pressure, places outside the lower 48) and provides the real
//     15-minute precipitation (HRRR) for the "next 2 hours" strip.
//   • Open-Meteo air quality (US AQI).
// Units are requested in °F, mph and inches.

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const CURRENT = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'dew_point_2m', 'is_day',
  'precipitation', 'weather_code', 'cloud_cover', 'pressure_msl',
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'uv_index',
];
const HOURLY = [
  'temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation',
  'weather_code', 'uv_index', 'is_day', 'pressure_msl', 'cloud_cover',
  'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m',
];
const DAILY = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max',
  'precipitation_sum', 'snowfall_sum', 'sunrise', 'sunset', 'uv_index_max',
  'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant',
];

function forecastUrl(lat, lon, model, withMinutely) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    models: model,
    current: CURRENT.join(','),
    hourly: HOURLY.join(','),
    daily: DAILY.join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
    forecast_days: '10', // hourly covers whole days: today 00:00 → day 10 23:00
  });
  if (withMinutely) {
    p.set('minutely_15', 'precipitation');
    p.set('forecast_minutely_15', '8'); // next 2 hours
  }
  return `${FORECAST}?${p}`;
}

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Weather service error ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.reason || 'Weather service error');
  return json;
}

/**
 * Merge two Open-Meteo sections (current / hourly / daily), preferring `a`
 * value-by-value and falling back to `b` wherever `a` is missing or null.
 * Arrays are aligned by their `time` entries.
 */
function mergeSection(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (!Array.isArray(b.time)) {
    // "current" block: plain values
    const out = { ...b };
    for (const [k, v] of Object.entries(a)) if (v != null) out[k] = v;
    return out;
  }
  const aIndex = new Map(a.time.map((t, i) => [t, i]));
  const out = { time: b.time };
  for (const key of Object.keys(b)) {
    if (key === 'time') continue;
    out[key] = b.time.map((t, i) => {
      const ai = aIndex.get(t);
      const av = ai != null ? a[key]?.[ai] : null;
      return av ?? b[key][i];
    });
  }
  return out;
}

/**
 * Fetch and merge everything for a location. Resolves to the normalized
 * forecast (see normalize). Throws only if both forecast models fail.
 */
export async function fetchForecast(lat, lon) {
  const aqUrl = `${AIR}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=us_aqi,pm2_5,ozone&timezone=auto`;
  const [nbm, gfs, air] = await Promise.allSettled([
    getJSON(forecastUrl(lat, lon, 'ncep_nbm_conus', false)),
    getJSON(forecastUrl(lat, lon, 'gfs_seamless', true)),
    getJSON(aqUrl),
  ]);
  if (nbm.status === 'rejected' && gfs.status === 'rejected') throw gfs.reason;
  const A = nbm.value, B = gfs.value;
  return normalize({
    utcOffset: (B ?? A).utc_offset_seconds,
    current: mergeSection(A?.current, B?.current),
    hourly: mergeSection(A?.hourly, B?.hourly),
    daily: mergeSection(A?.daily, B?.daily),
    minutely: B?.minutely_15 ?? null,
    air: air.value?.current ?? null,
    sources: [A && 'NOAA NBM', B && 'NOAA HRRR/GFS'].filter(Boolean),
  });
}

/** Column-arrays → arrays of plain objects with short names. */
function normalize(raw) {
  const c = raw.current, h = raw.hourly, d = raw.daily, m = raw.minutely;
  return {
    utcOffset: raw.utcOffset,
    sources: raw.sources,
    current: {
      time: c.time,
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      dew: c.dew_point_2m,
      isDay: !!c.is_day,
      precip: c.precipitation,
      code: c.weather_code,
      cloud: c.cloud_cover,
      pressure: c.pressure_msl,
      wind: c.wind_speed_10m,
      windDir: c.wind_direction_10m,
      gust: c.wind_gusts_10m,
      uv: c.uv_index,
    },
    hourly: h.time.map((time, i) => ({
      time,
      temp: h.temperature_2m[i],
      feels: h.apparent_temperature[i],
      prob: h.precipitation_probability[i],
      precip: h.precipitation[i],
      code: h.weather_code[i],
      uv: h.uv_index[i],
      isDay: !!h.is_day[i],
      pressure: h.pressure_msl[i],
      cloud: h.cloud_cover[i],
      wind: h.wind_speed_10m[i],
      gust: h.wind_gusts_10m[i],
      windDir: h.wind_direction_10m[i],
    })),
    daily: d.time.map((date, i) => ({
      date,
      code: d.weather_code[i],
      hi: d.temperature_2m_max[i],
      lo: d.temperature_2m_min[i],
      prob: d.precipitation_probability_max[i],
      precip: d.precipitation_sum[i],
      snow: d.snowfall_sum[i],
      sunrise: d.sunrise[i],
      sunset: d.sunset[i],
      uvMax: d.uv_index_max[i],
      windMax: d.wind_speed_10m_max[i],
      gustMax: d.wind_gusts_10m_max[i],
      windDir: d.wind_direction_10m_dominant[i],
    })),
    minutely: m ? m.time.map((time, i) => ({ time, precip: m.precipitation[i] ?? 0 })) : [],
    air: raw.air ? { aqi: raw.air.us_aqi, pm25: raw.air.pm2_5, ozone: raw.air.ozone } : null,
  };
}

// ---------------------------------------------------------------------------
// Time. Open-Meteo returns LOCAL wall-clock strings for the location
// ("2026-10-04T16:00"). We compare those strings directly and compute the
// location's "now" from the UTC offset, so cached data still lines up with
// the real current hour when the app is reopened later.
// ---------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');

/** Location-local "YYYY-MM-DDTHH:MM" for right now. */
export function localNow(utcOffset) {
  const d = new Date(Date.now() + utcOffset * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export const minutesOfDay = (t) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));

/** "5 PM", "12 AM" */
export function hourLabel(t) {
  const h = Number(t.slice(11, 13));
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "6:55 AM" */
export function clockLabel(t) {
  const h = Number(t.slice(11, 13));
  return `${h % 12 || 12}:${t.slice(14, 16)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Mon" for a "YYYY-MM-DD" date. */
export function weekday(date, style = 'short') {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: style });
}

/** Index of the hourly entry for the current hour (0 if not found). */
export function currentHourIndex(forecast) {
  const key = localNow(forecast.utcOffset).slice(0, 13) + ':00';
  const i = forecast.hourly.findIndex((h) => h.time === key);
  return i >= 0 ? i : 0;
}

// ---------------------------------------------------------------------------
// Describing conditions (WMO weather codes)
// ---------------------------------------------------------------------------

/**
 * kind: clear | partly | cloudy | fog | drizzle | rain | sleet | snow | storm
 * intensity: 0..1 (drives rain/snow particle counts)
 */
export function describe(code) {
  const table = {
    0: ['Clear', 'clear', 0], 1: ['Mostly clear', 'partly', 0], 2: ['Partly cloudy', 'partly', 0],
    3: ['Cloudy', 'cloudy', 0], 45: ['Fog', 'fog', 0], 48: ['Freezing fog', 'fog', 0],
    51: ['Light drizzle', 'drizzle', 0.2], 53: ['Drizzle', 'drizzle', 0.3], 55: ['Heavy drizzle', 'drizzle', 0.45],
    56: ['Freezing drizzle', 'sleet', 0.3], 57: ['Freezing drizzle', 'sleet', 0.5],
    61: ['Light rain', 'rain', 0.35], 63: ['Rain', 'rain', 0.6], 65: ['Heavy rain', 'rain', 1],
    66: ['Freezing rain', 'sleet', 0.5], 67: ['Heavy freezing rain', 'sleet', 0.9],
    71: ['Light snow', 'snow', 0.3], 73: ['Snow', 'snow', 0.6], 75: ['Heavy snow', 'snow', 1], 77: ['Snow grains', 'snow', 0.3],
    80: ['Light showers', 'rain', 0.4], 81: ['Showers', 'rain', 0.65], 82: ['Heavy showers', 'rain', 1],
    85: ['Snow showers', 'snow', 0.5], 86: ['Heavy snow showers', 'snow', 0.9],
    95: ['Thunderstorm', 'storm', 0.8], 96: ['Thunderstorm, hail', 'storm', 0.9], 99: ['Severe thunderstorm', 'storm', 1],
  };
  const [label, kind, intensity] = table[code] ?? ['—', 'cloudy', 0];
  return { label, kind, intensity };
}

/** Icon name for a code, day/night aware. */
export function iconFor(code, isDay = true) {
  const { kind } = describe(code);
  if (code === 0) return isDay ? 'sun' : 'moon';
  if (kind === 'partly') return isDay ? 'cloudSun' : 'cloudMoon';
  return { cloudy: 'cloud', fog: 'fog', drizzle: 'drizzle', rain: 'rain', sleet: 'sleet', snow: 'snow', storm: 'storm' }[kind] ?? 'cloud';
}

// ---------------------------------------------------------------------------
// Friendly readings
// ---------------------------------------------------------------------------

export function uvLevel(uv) {
  if (uv == null) return '—';
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}

export function aqiLevel(aqi) {
  if (aqi == null) return '—';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

export function compass(deg) {
  if (deg == null) return '';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

/** hPa → inHg (US barometer units). */
export const inHg = (hpa) => hpa * 0.02953;

/** Pressure trend over the last 3 hours: 'rising' | 'falling' | 'steady'. */
export function pressureTrend(forecast) {
  const i = currentHourIndex(forecast);
  const now = forecast.hourly[i]?.pressure, before = forecast.hourly[i - 3]?.pressure;
  if (now == null || before == null) return 'steady';
  if (now - before >= 1) return 'rising';
  if (before - now >= 1) return 'falling';
  return 'steady';
}

/**
 * Summary for the next-2-hours strip from 15-minute precipitation.
 * Returns { text, wet, slots: [{ time, rate }] } where rate is inches/hour
 * and `wet` says whether any precipitation is expected in the window.
 */
export function nearTermPrecip(forecast) {
  const now = localNow(forecast.utcOffset);
  // Keep the slot we're in and later (cached data may be older).
  const slots = forecast.minutely
    .filter((s) => s.time >= now.slice(0, 14) + String(Math.floor(Number(now.slice(14, 16)) / 15) * 15).padStart(2, '0'))
    .map((s) => ({ time: s.time, rate: s.precip * 4 }));
  const WET = 0.01; // in/hr — below this it's not worth mentioning
  const kind = describe(forecast.current.code).kind;
  const word = kind === 'snow' ? 'Snow' : kind === 'sleet' ? 'Sleet' : 'Rain';
  if (!slots.length) return { text: 'No short-term data right now', wet: false, slots };

  const wetNow = slots[0].rate >= WET;
  const change = slots.findIndex((s) => (s.rate >= WET) !== wetNow);
  const mins = (i) => i * 15;
  const intensity = (r) => (r < 0.1 ? 'Light' : r < 0.3 ? 'Moderate' : 'Heavy');
  let text;
  if (wetNow && change === -1) text = `${intensity(Math.max(...slots.map((s) => s.rate)))} ${word.toLowerCase()} for the next 2 hours`;
  else if (wetNow) text = `${word} ending in about ${mins(change)} min`;
  else if (change === -1) text = `No ${word.toLowerCase()} expected in the next 2 hours`;
  else text = `${intensity(slots[change].rate)} ${word.toLowerCase()} starting in about ${mins(change)} min`;
  return { text, wet: slots.some((s) => s.rate >= WET), slots };
}
