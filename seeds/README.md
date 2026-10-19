# Seed Pack

A cozy home-garden card game: https://arcticwalker31.github.io/seeds/

Open seed packets to collect cards, grow them in your garden in real time, and (optionally) defend the garden from pests.

## How it plays

- **Garden** (4×4): 6 plots to start, 10 more to unlock with coins and levels. Tap an empty plot to plant a seed you own (seeds cost a few coins). Plants grow in **real time** (Radish 5 min … Golden Apple Tree 12 h). Tap a ripe plant to harvest coins + XP. **Auto-replant** (on by default) puts the same seed back in. Ripe crops left too long **wilt**, slowly losing value down to half (never dying).
- **Watering**: watered soil grows plants 50% faster for 2 h. Watering comes from tool cards (Watering Can, Sprinkler).
- **Garden tools**: tool cards you own appear as round buttons with a recharge: water everything, speed up one plant (Trowel), double the next harvest (Fertilizer), harvest everything (Wheelbarrow), +50% growth (Greenhouse), +50% coins (Golden Hoe), ripen everything (Magic Watering Can).
- **Decor**: 2 slots, +1 every 5 levels (max 5). Gnome +coins, Birdhouse +XP, Sundial +growth, Wind Chime +pack luck, Scarecrow +battle sunlight, Fairy Fountain does a bit of everything.
- **Packs**:
  - **Seed Packet**: 4 cards, 100 coins.
  - **Gardener's Bundle**: 6 cards with a guaranteed Rare or better, 500 coins, unlocks at Lv 4.
  - **Golden Pack**: 5 cards with a guaranteed Epic or better, 1,500 coins, unlocks at Lv 8.

  Every 6 hours you get a free Seed Packet. You also get packs from leveling up, beating new battle stages, and the 7-day login streak. Opening a pack is a little show: tear it, then tap each card to flip it. **Skip** jumps straight to the results.
- **Cards** (80): 48 plants, 14 tools, 9 weather and 9 decor, in five rarities (Common 60%, Uncommon 25%, Rare 10%, Epic 4%, Legendary 1%). Cards you don't have are twice as likely to drop, and 4% of cards are **foil** (purely cosmetic shimmer). Cards are permanent unlocks. Duplicates level a card up to **Lv 5** (1, 2, 4, then 8 more copies). A higher level means faster growth, bigger harvests and stronger battle stats. Once a card is Lv 5, extra copies become coins.
- **Battle** (optional): lane defense on a 5×7 lawn. Pests crawl down toward your fence.
  - **Placing cards**: spend **sunlight** (you start with 100 and get +25 every 7 s) to place plants from your **deck of 8**, or to use tool and weather spells. Sun-makers earn more sunlight, shooters fire up their lane, and walls soak up bites. Bombs blow up, slowers slow pests down, traps bite back, and healers heal.
  - **Losing**: each lane has a one-time **sprinkler** that soaks the first pest to reach the fence there. After that, a pest getting through costs a life, and losing 3 lives loses the battle.
  - **Stages**: new pests show up as you go (slugs, snails, grasshoppers that hop over plants, beetles, crows that fly over everything, moles that tunnel under). There's a **Gopher King** boss every 5th stage.
  - **Rewards**: a first clear gives coins, XP and sometimes a pack. Replays give 40%. Losing still pays a little.
- **Levels**: XP comes from harvests and battles. Each level-up gives coins plus a pack (a Bundle every 5th level) and can unlock plots, shop packs and decor slots.

## Save & sync

- The save lives in localStorage (`sp.save`) and syncs to its **own private Gist**, as `seedpack.json`. This is a different Gist from the one Habits, Kyber and Forge share.
- It uses the **same GitHub token** (`ht.token`). On a device that already has the token, the game finds its Gist automatically, or creates it the first time. The game's Gist ID is stored as `sp.gistId`.
- **Newest save wins.** If both devices changed since their last sync, the game asks which garden to keep.
- **Settings ⚙** has sound on/off, auto-replant, sync status and connect, and **Start a new garden** (which wipes progress on every synced device).

## Files

| File | What it does |
|---|---|
| `index.html`, `style.css` | Page, tabs, sheets, pack opening and battle screen styles (light = sunny paper, dark = dusk garden) |
| `app.js` | Screens: garden, battle tab, packs, cards and deck, the pack-opening show, rewards, settings |
| `cards.js` | All 80 cards, plus the rules that turn rarity and level into garden and battle numbers |
| `art.js` | Every drawing (cards, growth stages, pests, seed packets) as storybook SVG built from shared templates |
| `state.js` | Save data, garden growth math, economy, packs, streaks, levels and Gist sync |
| `battle.js` | Lane-defense engine (canvas), pests, stage generator |
| `sound.js` | Soft synthesized sound effects (WebAudio, no audio files) |

To rebalance, change the numbers in `cards.js` (roles, rarity multipliers), `state.js` (pack prices, plot costs, XP curve) or `battle.js` (pest stats, stage budgets).

When you change CSS/JS, bump the `?v=` numbers in `index.html` and in the imports so phones load the new files.
