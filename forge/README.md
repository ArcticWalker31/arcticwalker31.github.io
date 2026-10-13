# Forge

Bodyweight training with Kai: https://arcticwalker31.github.io/forge/

## How it works

- **Rotation**: Push → Pull → Abs → repeat. Home always shows the next workout. Tap **Push / Pull / Abs** under it to do a different one today.
- **Circuits**: one set of every exercise = a round. After each round, a rest timer starts on its own (3:30 by default; +30 s or skip). It vibrates and beeps when it's done and moves you into the next round. After the last round you can **Finish** or do **One more round** (+50 XP).
- **Logging**: each set is pre-filled with last time's number for that round. Adjust with − / + and tap **Done**. Timed holds have a **Start hold timer** stopwatch. You can leave the app mid-workout; it resumes where you were.
- **Level-up suggestions**: hit the top of an exercise's range in every round, two workouts in a row, and Kai offers a harder target (or the next skill step).
- **Skills**: progression ladders for Handstand, Planche, L-sit, Dragon flag and Windshield wipers. A workout uses your current step. Unlock the next from a suggestion, or pick any step in the Skills tab.
- **Motivation**:
  - **Weekly goal** (default 4) with a streak counted in weeks, so one missed day never breaks it.
  - **XP** (10 per set, +5 when you hit the target, +50 per workout, +25 per PR) and **levels** with titles: Rookie → Grinder → Athlete → Beast → Titan → Legend.
  - **Achievements** and **personal records**, and Kai's check-ins get tougher the longer you're away.

## Settings (⚙)

- **Color scheme**: Golden Hour, Midnight, Arcade, Earthy, Clean (saved per device).
- **Training**: weekly goal, rounds per workout, rest length, end-of-rest sound.
- **Abs day**: tick which exercises go in it (skills use your ladder step).
- **Targets**: change any exercise's rep or second range.
- **Sync**: same private Gist and token as Habits and Kyber Stock, saved as `workout.json`.

## Kai's poses

Kai uses one image per mood. Only `trainer/idle.jpg` exists right now (your original picture), and every other pose falls back to it. To add a pose, save the image as `trainer/<name>.png` (or `.jpg` / `.webp`) and push.

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
| `program.js` | Exercises (targets, form cues), workouts, skill ladders, Abs pool |
| `data.js` | Data model, sync (`../shared/sync.js`), XP/levels, streaks, PRs, suggestions, achievements |
| `trainer.js` | Kai's lines per situation and pose image fallback |
| `trainer/` | Kai's pose images |

When you change CSS/JS, bump the `?v=` numbers in `index.html` (and the imports) so phones load the new files.
