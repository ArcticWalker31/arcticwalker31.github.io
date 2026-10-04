# arcticwalker31.github.io

My personal web apps, all hosted from this one repo on GitHub Pages. Each app is a folder, and each folder is its own URL and its own home-screen app.

| App | URL |
|---|---|
| Launcher | https://arcticwalker31.github.io/ |
| [Habits](habits/README.md) | https://arcticwalker31.github.io/habits/ (stats: `/habits/dashboard.html`) |
| [Sky](sky/README.md) | https://arcticwalker31.github.io/sky/ (weather) |

Plain HTML/CSS/JS everywhere: no build step, no npm.

## Layout

```
index.html        launcher page (reads apps.json)
apps.json         list of apps shown on the launcher
shared/
  tokens.css      site-wide colors for light and dark mode
habits/           the habit tracker (its own README)
sky/              the weather app (its own README)
_template/        copy this to start a new app
tools/
  make-icons.ps1  generates letter icons for a new app
.nojekyll         tells GitHub Pages to serve files as-is
```

## One-time setup

1. **Rename the repo** to `arcticwalker31.github.io` (GitHub → repo **Settings** → **General** → *Repository name*).
   A repo with exactly this name is your *user site*, served at the root URL, so apps live at `arcticwalker31.github.io/<app>/`.
2. Point your local clone at the new name. GitHub redirects the old name, but it's cleaner to update:
   ```
   git remote set-url origin https://github.com/ArcticWalker31/arcticwalker31.github.io.git
   ```
3. **Pages**: repo **Settings** → **Pages** → *Source: Deploy from a branch* → `main` / `/ (root)` → **Save** (check it's still set after the rename).
4. The old address `arcticwalker31.github.io/habit_tracker/` stops working. **Re-add the Habits home-screen icon** from `arcticwalker31.github.io/habits/`.
   Your habit data, token and Gist ID are kept, because localStorage is tied to `arcticwalker31.github.io` and not the path. Everything is in the Gist anyway.

## Adding a new app

1. Copy `_template/` to a new folder with a short URL-friendly name, e.g. `budget/`.
2. In the new folder:
   - `index.html`: replace every "App Name" / TODO.
   - `manifest.json`: set `name`, `short_name`, `description`.
   - `app.js`: set `NS` to a unique storage prefix, e.g. `'budget.'`.
3. Make its icons from the repo root in PowerShell:
   ```
   .\tools\make-icons.ps1 -Dir budget -Letter B -Bg '#60935D'
   ```
   Or put your own PNGs in `budget/icons/` (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png` at 180×180, plus `icon.svg`).
4. Add it to `apps.json` so it shows on the launcher:
   ```json
   { "path": "budget/", "name": "Budget", "description": "Spending log", "icon": "budget/icons/icon-192.png" }
   ```
5. Commit and push. It's live at `https://arcticwalker31.github.io/budget/` within a minute or two.

## Rules every app follows

- **Namespace localStorage keys.** All apps share one origin and therefore one localStorage. Prefix every key with the app's own namespace (`ht.` for Habits) so apps can't clobber each other.
- **Use relative paths only** (`icons/x.png`, `../shared/tokens.css`). Never start a path with `/`, so apps keep working locally and if the site ever moves.
- **Keep the manifest's `start_url` and `scope` as `"./"`** so each folder installs as a separate home-screen app.
- **Shared code goes in `shared/`.** Right now that's only the palette. If a second app needs phone↔laptop sync, the Gist code in `habits/data.js` is the candidate to move there.
- **Secrets never go in the repo.** Tokens are pasted into the app and live only in the browser.

> **Security note.** Every app here can read every other app's localStorage, including the Habits GitHub token. That's fine because you write all the code, but don't add third-party code you haven't read, and keep the token limited to Gists.

## Local testing

Serve the repo root (apps reach `../shared/`, and ES modules don't load from `file://`):

```
python -m http.server 8000
```

Then open http://localhost:8000/ for the launcher, or http://localhost:8000/habits/.
