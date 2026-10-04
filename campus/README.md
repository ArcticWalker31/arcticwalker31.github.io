# Campus

Virginia Tech at a glance: Blacksburg Transit buses, gym crowd levels and dining hours. Live at https://arcticwalker31.github.io/campus/

| Tab | What it shows | Source |
|---|---|---|
| **Bus** | Saved stops and the 3 nearest stops (GPS) with the next buses, plus a live map of every running bus and how full it is | Blacksburg Transit's live data (the same feed ridebt.org's map uses), **through your relay** |
| **Gym** | Live % full for War Memorial Hall, McComas Hall and the Bouldering Wall, plus today's hours | RecSports occupancy page (direct); hours from the RecSports hours feed **through your relay** |
| **Dining** | Every dining spot open today: open now / later / closed, hours, "closes in 25 min" warnings, menu links | VT's official hours feed (direct) |

Dining and gym crowd levels work without any setup. Bus times, the map and gym hours need the relay.

## Set up the bus relay (one time, ~10 minutes, free)

Blacksburg Transit and the RecSports hours feed block web apps on other sites from reading their data. The fix is a tiny relay that runs on your own free Cloudflare account. It only forwards those two sources, and only for your site.

1. Create a free account at https://dash.cloudflare.com/sign-up (no credit card needed).
2. In the dashboard, go to **Workers & Pages** → **Create** → **Create Worker**.
3. Name it `campus-relay` → **Deploy** (it deploys a "Hello World" first; that's fine).
4. Click **Edit code**. Delete everything in the editor and paste the full contents of [`worker/worker.js`](worker/worker.js) → **Deploy**.
5. Copy the worker's address, e.g. `https://campus-relay.<your-subdomain>.workers.dev`.
6. Open Campus → ⚙ Settings → **Bus relay** → paste the address → **Save**. You should see "Connected ✓".

Do step 6 on each device (phone and laptop). The address is saved per browser.

The free plan allows 100,000 requests a day. The app uses roughly 2 requests every 30 seconds while the Bus tab is open on screen, so personal use stays far below that.

If you ever rename the site or test locally on a different port, update `ALLOWED_ORIGINS` at the top of `worker.js` and deploy again.

## Notes and limits

- **Saved stops** are kept on the device (`campus.favorites`). Star any stop card, or use **Add stop** to search by name or stop number.
- **BT only lists the routes running today.** The stop list builds up as the app sees new routes, so weekday-only stops may not show in search until you've opened the app on a weekday.
- **Gym counts** come from ID swipes, so they're only as accurate as people swiping in and out. The Bouldering Wall has no separate published hours.
- **Times past midnight** (e.g. Xpress Lane until 2 AM) count as the same night.
- **Map**: OpenStreetMap tiles, loaded only when you open the Map view. Buses refresh every 10 seconds while it's on screen.
- Everything pauses when the app is in the background.

## Files

| File | What it does |
|---|---|
| `index.html`, `style.css` | Page, tabs and the three color schemes (VT / Earthy / Neutral) |
| `app.js` | Tabs, rendering, refresh timers, map, settings |
| `bt.js` | Blacksburg Transit: routes, stops, departures, live buses |
| `gym.js` | RecSports occupancy and hours |
| `dining.js` | Dining hours and open/closed status |
| `util.js` | Storage (`campus.` prefix), relay calls, time and distance helpers |
| `worker/worker.js` | The Cloudflare relay (deployed separately, not used by the page directly) |

## Testing locally

Serve the repo root (`python -m http.server 8000`) and open http://localhost:8000/campus/. The relay already allows `http://localhost:8000`.
