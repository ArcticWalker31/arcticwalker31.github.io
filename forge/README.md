# Forge

Bodyweight training with Kai: https://arcticwalker31.github.io/forge/

## How it works

- **Rotation**: Pull → Push → Abs → repeat. Home always shows the next workout. Tap **Push / Pull / Abs** under it to do a different one today.
- **Circuits**: one set of every exercise = a round. After each round, a rest timer starts on its own (3:30 by default; +30 s or skip). It vibrates and beeps when it's done and moves you into the next round. After the last round you can **Finish** or do **One more round** (+50 XP).
- **Logging**: each set is pre-filled with last time's number for that round. Adjust with − / + and tap **Done**. Timed holds have a **Start hold timer** stopwatch. You can leave the app mid-workout; it resumes where you were.
- **Level-up suggestions**: hit the top of an exercise's range in every round, two workouts in a row, and Kai offers a harder target (or the next skill step).
- **Edit workouts**: tap **Edit** on the workout card on Home. Switch between Pull / Push / Abs, reorder (↑ ↓), remove (✕), change targets inline, pick the step for skill ladders (Handstand, Planche, L-sit, Dragon flag, Windshield wipers), and add any exercise, a skill ladder, or your own custom exercise.
- **Skill tree** (Skills tab): 73 calisthenics skills across vertical/horizontal push, vertical/horizontal pull, core and legs, graded F → SS. The structure follows the WINGS skill tree (https://wingssw.com/#/skilltree). Drag to move, pinch or +/− to zoom, ⤢ to see it all. Tap a skill to set Locked / Unlocked (2 s or 1 rep) / In progress (6 s or 3 reps) / Mastered (12 s+ or 6+ reps) and see what it builds on and leads to. Exercises you log upgrade their skill automatically (never downgrade). Skill points (grade × status) give your **skill rank**: Bronze → Silver → Gold → Platinum → Diamond → Master.
- **Motivation**:
  - **Weekly goal** (default 4) with a streak counted in weeks, so one missed day never breaks it.
  - **XP** (10 per set, +5 when you hit the target, +50 per workout, +25 per PR) and **levels** with titles: Rookie → Grinder → Athlete → Beast → Titan → Legend.
  - **44 achievements** (showing up, streaks, volume, PRs, levels, skill tree) and **personal records**, and Kai's check-ins get tougher the longer you're away.

## Settings (⚙)

- **Color scheme**: Golden Hour, Midnight, Arcade, Earthy, Clean (saved per device).
- **Training**: weekly goal, rounds per workout, rest length, end-of-rest sound.
- **Sync**: same private Gist and token as Habits and Kyber Stock, saved as `workout.json`.

## Kai's poses

Kai uses one image per mood, all in `trainer/` as 600px-wide JPEGs (about 60 KB each so the app loads fast). Any missing pose falls back to `idle.jpg`. To replace one, save it as `trainer/<name>.jpg` (`.png` / `.webp` also work, but shrink big images first).

**Image tips:** portrait (about 9:16), Kai centered with his **head in the top third** (the app crops from the top), and a simple background.

Give the generator your original image as the character reference, then use this shared start plus one pose line:

> **Shared start:** *"Same character as the reference image: young athletic man, short dark tousled hair, black jogger sweatpants, shirtless, same semi-realistic comic illustration style with clean dark outlines and warm golden-hour lighting in a simple gym with a pull-up bar. Portrait 9:16, full upper body visible, head in the top third."*

| File | Used when | Pose line to add |
|---|---|---|
| `wave.png` | Your first visit | "Waving hello with one hand, friendly open smile, relaxed stance." |
| `point.png` | Ready to train / behind on the week | "Pointing straight at the viewer with a confident, determined grin, like saying 'your turn'." |
| `hype.png` | On a streak | "Both fists raised and pumped, shouting with excitement, high energy." |
| `proud.png` | You trained today / hit the weekly goal | "Arms crossed, satisfied proud smile, slight nod, towel over one shoulder." |
| `stern.png` | It's been 3+ days | "Arms crossed, serious stern expression, one eyebrow raised, tapping his wrist like checking a watch." |
| `celebrate.png` | Level up / skill unlocked | "Jumping with joy holding a gold trophy overhead, confetti falling, huge grin." |
| `flex.png` | Personal record | "Double biceps flex facing the viewer, big confident grin." |

## Files

| File | What it does |
|---|---|
| `index.html`, `style.css` | Page, tabs, workout runner, the five color schemes |
| `app.js` | Screens: home, history, skills, awards, runner, summary, celebrations, settings |
| `program.js` | Exercises (targets, form cues), default workouts, skill ladders |
| `tree.js` | Skill tree: skills, grades, positions, connections |
| `data.js` | Data model, sync (`../shared/sync.js`), XP/levels, streaks, PRs, suggestions, achievements |
| `trainer.js` | Kai's lines per situation and pose image fallback |
| `trainer/` | Kai's pose images |

When you change CSS/JS, bump the `?v=` numbers in `index.html` (and the imports) so phones load the new files.
