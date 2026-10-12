# Kyber Stock

Inventory for the Etsy kyber crystals: https://arcticwalker31.github.io/kyber/

## Using it

- **Record an order**: tap **1**, **3** or **7**.
  - **1 / 3 crystals**: tap the color(s) the buyer picked. Repeats are fine. Tap ✕ on a pick to change it. Then tap **Record order**.
  - **7-pack**: shows the fixed set (White, Red, Yellow, Green, Blue, Pink, Black) and what each count will become. Tap **Record 7-pack**.
  - If you don't have enough of a color, it warns you but still records it. The count goes negative, shown as "Out · owe 1", so you know what to make.
  - A 6-second **Undo** appears after each order or restock, for mistaps. No history is kept.
- **Made new ones**: **+ Add new crystals** → set how many of each color you made → **Add to stock**.
- **Quick fixes**: the − / + next to each color adjusts it by one.
- **Warnings**: a color turns amber at or below its "low" number (default 3) and red when it's out. The banner at the top lists what to make.

## Settings (⚙)

- **Colors**: rename, change the swatch color, set each color's low number, delete, or add new colors.
- **7-pack contents**: tick which colors make up the 7-pack.
- **Sync**: phone and laptop share data through the same private GitHub Gist as the Habits app, in its own file `kyber.json`. If Habits is already set up in that browser, Kyber Stock connects automatically. Otherwise paste the token and Gist ID (the ones from Habits → Settings).

Counts sync as *changes* (−1 red, +5 blue), not as totals, so orders recorded on your phone and laptop at the same time both count.

## Files

| File | What it does |
|---|---|
| `index.html`, `style.css` | Page and styles (site palette from `../shared/tokens.css`) |
| `app.js` | Screens: inventory, order picker, add crystals, settings, undo |
| `store.js` | Data model, local cache, and sync through `../shared/gist.js` |

Storage keys use the `ks.` prefix; the GitHub token and Gist ID are shared with Habits (`ht.token`, `ht.gistId`).
