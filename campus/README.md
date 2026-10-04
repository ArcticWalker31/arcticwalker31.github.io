# Campus

Virginia Tech at a glance: Blacksburg Transit buses, gym crowd levels and dining hours. Live at https://arcticwalker31.github.io/campus/

| Tab | What it shows | Source |
|---|---|---|
| **Bus** | Saved stops and the 3 nearest stops (GPS) with the next buses; **Directions** (“CID to McComas”); a live map of every running bus and how full it is | Blacksburg Transit's live data (the same feed ridebt.org's map uses), **through your relay** |
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

## Directions

Bus → **Directions**. Type a start and a destination (or both at once: `CID to McComas`) and tap **Get directions**. Places autocomplete from BT's own place list (300+ campus and town locations) plus CID, and from your **saved places**: add nicknames like *Home → CID* or *Gym → McComas Hall* in ⚙ Settings, then tap them as chips or type the nickname.

How it plans: it finds bus stops within a short walk (about 0.5 mi) of each end, the routes that serve both, and BT's predicted times for their next trips. Then it picks the fastest **walk → bus → walk** combinations you can still make. It shows the top options (arrive time, when to leave, which bus, how many stops, where to get off) and always shows walking the whole way for comparison. Buses slower than walking are left out. Tap **Show on map** to see it: the dotted line is walking, the colored line is the bus.

Limits: direct buses only (no transfers), leaving now only. Walking times are estimates (3 mph, with a bit added because streets aren't straight lines).

**Relay update needed for Directions:** the relay must also allow BT's BT4U service. If you set the relay up before Directions existed, open campus-relay in Cloudflare → **Edit code**, replace everything with the current [`worker/worker.js`](worker/worker.js), and **Deploy**. The app tells you if this is needed.

## Notes and limits

- **Saved stops** are kept on the device (`campus.favorites`). Star any stop card, or use **Add stop** to search by name or stop number.
- **BT only lists the routes running today.** The stop list builds up as the app sees new routes, so weekday-only stops may not show in search until you've opened the app on a weekday.
- **Gym counts** come from ID swipes, so they're only as accurate as people swiping in and out. The Bouldering Wall has no separate published hours.
- **Times past midnight** (e.g. Xpress Lane until 2 AM) count as the same night.
- **Map**: a vector map (MapLibre GL + free OpenFreeMap tiles, no API key) in a Google-Maps-like style, with a dark version in dark mode. It loads only when you open the Map view. Buses refresh every 10 seconds and glide to their new positions. Tap a bus to see its route ahead (bold, with direction arrows and upcoming stops), its next stop, how full it is, and when its GPS last updated.
- **Gym hours** show today's full hours and whether each facility is open now.
- Everything pauses when the app is in the background.

## Files

| File | What it does |
|---|---|
| `index.html`, `style.css` | Page, tabs and the three color schemes (VT / Earthy / Neutral) |
| `app.js` | Tabs, rendering, refresh timers, map, settings |
| `bt.js` | Blacksburg Transit: routes, stops, departures, live buses, route paths |
| `bt4u.js` | BT's BT4U service: named places and predicted trip times (for directions) |
| `planner.js` | Direct-bus trip planner and place search (pure functions) |
| `gym.js` | RecSports occupancy and hours |
| `dining.js` | Dining hours and open/closed status |
| `util.js` | Storage (`campus.` prefix), relay calls, time and distance helpers |
| `worker/worker.js` | The Cloudflare relay (deployed separately, not used by the page directly) |

## Testing locally

Serve the repo root (`python -m http.server 8000`) and open http://localhost:8000/campus/. The relay already allows `http://localhost:8000`.
