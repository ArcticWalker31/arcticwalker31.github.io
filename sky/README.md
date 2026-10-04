# Sky

Clean, accurate local weather for the US: https://arcticwalker31.github.io/sky/

## Where the data comes from

All of these are free, need no API key, and are called straight from the browser:

| What | Source |
|---|---|
| Forecast | **NOAA National Blend of Models (NBM)** via [Open-Meteo](https://open-meteo.com/). This is the blend the National Weather Service starts its forecasts from. It's preferred for every value it provides. |
| Gaps + 15-minute rain | **NOAA HRRR/GFS** via Open-Meteo. Fills in what NBM lacks (UV, pressure, places outside the lower 48) and provides the real 15-minute precipitation behind "Next 2 hours". If NBM fails, the app uses this alone. |
| Air quality | Open-Meteo air-quality API (US AQI) |
| City name | BigDataCloud's free reverse geocoder. Coordinates are rounded to about 1 km before sending. |

Open-Meteo data is CC BY 4.0, which is why the attribution sits at the bottom of the app. There's no pollen: Open-Meteo only has pollen data for Europe.

## Behavior

- **Location**: GPS each time the app opens. If that fails, it uses the last good location and says "Using last location".
- **Caching**: the last forecast is stored on the device, so the app opens instantly and works offline. It re-fetches when opened or brought back to the foreground if the data is over 10 minutes old, or if you've moved more than 2 km. Pull down or tap ↻ to force a refresh.
- **Scene**: the colors follow the real sky (sunrise and sunset come from the forecast), and the sun follows its actual arc. Clouds come from cloud cover, rain and snow density from intensity, and tree sway and cloud speed from wind. Storms get lightning, and clear nights get stars and shooting stars. The animation pauses in the background and becomes a still image if your phone's reduce-motion setting is on.
- **Units**: °F, mph, inches, inHg.

## Files

| File | What it does |
|---|---|
| `index.html`, `style.css` | Page and styles. The bottom sheet uses `../shared/tokens.css`. |
| `app.js` | Location → fetch → render, caching, refresh, interactions |
| `weather.js` | API calls, merging NBM and HRRR/GFS, condition descriptions, time helpers. No DOM. |
| `geo.js` | GPS, place name, distance |
| `scene.js` | Animated sky (SVG landscape + canvas particles) |
| `chart.js` | Hourly chart (temperature / precipitation / UV) |
| `icons.js` | Line icons (adapted from Lucide, ISC) |

Storage keys use the `sky.` prefix (`sky.cache`, `sky.loc`, `sky.mode`, `sky.detailsOpen`).

## Testing locally

Serve the repo root (`python -m http.server 8000`) and open http://localhost:8000/sky/. Browsers allow GPS on `localhost`, so location works there too.
