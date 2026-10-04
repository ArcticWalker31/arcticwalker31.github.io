# Habits

Live at **https://arcticwalker31.github.io/habits/** (part of the multi-app site; see the [root README](../README.md)).

A personal habit logger: a static site on GitHub Pages that syncs through one secret GitHub Gist. It uses plain HTML/CSS/JS, with no build step and no dependencies.

- **Phone**: the logger (`index.html`). Pin it to your home screen.
- **Laptop**: the stats dashboard (`dashboard.html`). Bookmark https://arcticwalker31.github.io/habits/dashboard.html.

## Files

| File | What it does |
|---|---|
| `index.html` | The logger page plus the settings screen |
| `app.js` | UI: rendering, taps, settings |
| `data.js` | Dates, completion rules, localStorage, Gist API, sync. No DOM rendering, so it can be reused by the dashboard |
| `style.css` | Logger styles (mobile-first) |
| `../shared/tokens.css` | The site-wide palette for light and dark mode, shared with other apps |
| `dashboard.html`, `dashboard.js`, `dashboard.css` | Read-only stats page for the laptop |
| `stats.js` | Pure stats math (completion, streaks, weekdays), no DOM |
| `manifest.json`, `icons/` | Home-screen app metadata and icons |

## 1. Create the GitHub token

1. Go to GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
   (direct link: https://github.com/settings/personal-access-tokens/new).
2. **Token name**: `habits`. **Expiration**: pick one, e.g. 1 year. You'll paste a new token when it expires (the app shows "Token invalid or expired").
3. **Repository access**: leave the default (**Public repositories**, read-only). Gists aren't repositories, so this doesn't matter.
4. **Permissions** → **Account permissions** → **Gists** → **Read and write**.
   Leave every other permission at *No access*.
5. Click **Generate token** and copy it (it starts with `github_pat_`). You can't view it again later, so keep it in your password manager.

> **Security note.** The token is stored in your browser's localStorage. Every app on `arcticwalker31.github.io` (and any other Pages site on the account) shares one browser origin, so any of them could read it. That's why the token is limited to Gists only. Don't host untrusted code on the same `github.io` account, and keep an expiry on the token. Never commit a token to this repo.

## 2. Hosting

The app is served by the site-wide GitHub Pages setup described in the [root README](../README.md). Nothing extra is needed for this app.

There's no service worker, so a normal reload always gets the newest version. If iOS shows something stale, close the home-screen app fully and reopen it.

## 3. First device (creates the Gist)

1. Open https://arcticwalker31.github.io/habits/. The settings screen appears on first launch.
2. Paste the token → **Save token**.
3. Tap **Create new Gist**. This creates a **secret** Gist containing `habits.json` with the default habits.
4. The Gist ID fills in. Tap **Copy** and keep it for your second device.
5. Tap **‹ Done** and start logging.

## 4. Second device (connects to the same Gist)

1. Open the site on the other device.
2. Paste the same token (or make a second token the same way) → **Save token**.
3. Paste the Gist ID (or the whole Gist URL) → **Connect to this Gist**.

Both devices now read and write the same `habits.json`.

## 5. Add to home screen

- **iPhone (Safari)**: Share → **Add to Home Screen**.
- **Android (Chrome)**: ⋮ menu → **Add to Home screen** / **Install app**.

## How it works

### Using the logger
- **Check** habit: tap the card to mark it done; tap again to clear. **Long-press** marks it explicitly *not done* (coral).
- **Minutes** habit: type the total for the day. It's complete when it's **at or under** the max. Clear the box to un-log it.
- **Count** habit: − / +. The card fills toward the target, and going past the target is allowed. Pressing − at 1 un-logs it.
- ‹ / › switch days. You can edit today and the previous 6 days, but not the future. The day rolls over at 3 AM by default (configurable in settings), so logging at 1 AM still counts for "yesterday".

### Sync
- Every change is applied instantly and cached in localStorage, so the app opens instantly and works offline.
- Saves are debounced (~1 s). A save **fetches the latest Gist, replays only the changes made on this device, then PATCHes**, so changes from the other device aren't overwritten.
- Unsynced changes are kept in localStorage and retried when you're back online or reopen the app.
- The status pill (top left) shows Saved / Saving… / Offline / Sync error. Tap it to sync now.
- Gist revisions (on gist.github.com → *Revisions*) are your backup and history.

### Dashboard
Open `dashboard.html` on the laptop. It uses the same token and Gist ID as the logger, stored in that browser, so connect once through the logger's settings on the laptop first. It refreshes when the tab regains focus.

- **Range**: 7 / 30 / 90 days / All. Ranges over 120 days switch the top chart to weekly bars.
- **Daily completion**: the share of habits done each day plus a 7-day average line. Green bars mark perfect days. "Show as table" lists the exact numbers.
- **Day by day**: a habit × day grid. Hover any square for the logged value.
- **Habits**: completion rate, current and best streak, and for minutes/count habits a chart of logged values against the goal line. The goal line steps on the day you changed the goal.
- **By day of week**: completion % for each weekday.

The rules: an unlogged day counts as **not done**. **Today is in progress**: it counts once a habit is complete, but never lowers a percentage or breaks a streak.

### Data model (`habits.json`)

```json
{
  "version": 1,
  "settings": { "dayStartHour": 3 },
  "habits": [
    { "id": "workout", "name": "Workout", "type": "check", "createdAt": "2026-09-30" },
    { "id": "insta", "name": "Instagram", "type": "minutes", "createdAt": "2026-09-30",
      "goals": [{ "from": "2026-09-30", "value": 60 }] },
    { "id": "water", "name": "Owala refills", "type": "count", "createdAt": "2026-09-30",
      "goals": [{ "from": "2026-09-30", "value": 3 }] }
  ],
  "log": {
    "2026-09-30": { "workout": true, "insta": 95, "water": 2 }
  }
}
```

- Date keys are **local** dates (`YYYY-MM-DD`), never UTC.
- `log[date][habitId]` missing means *not logged*. `false` means explicitly *not done*.
- `goals` is a history. The goal in effect on a date is the last entry with `from ≤ date`, so changing a target never rewrites old results. Use `effectiveGoal(habit, date)` from `data.js`.
- A habit counts on a day only if `createdAt ≤ day` and (if archived) `day < archivedAt`. Use `isActiveOn` / `dayProgress`.
- Array order of `habits` is display order.

## Regenerating the PNG icons

`icons/icon.svg` is the source. The PNGs (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) were rendered once from the same shapes and committed as static files. If you change the icon, re-export them at those sizes with any image tool. (For new apps, `tools/make-icons.ps1` generates simple letter icons.)

## Local testing

ES modules don't load from `file://`, so serve the **repo root** (the app needs `../shared/`):

```
python -m http.server 8000
```

Then open http://localhost:8000/habits/.
