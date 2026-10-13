// program.js — the exercise library, default workouts and skill ladders.
// Targets are [min, max] reps, or seconds for kind: 'time'.
// perSide: the number is per side (e.g. "7–8 each").

export const EXERCISES = {
  // ----- Push -----
  'decline-pushup': { name: 'Decline weighted push-ups', kind: 'reps', target: [8, 12], cues: ['Feet up, hands slightly wider than shoulders', 'Body in one straight line; squeeze glutes', 'Add weight (backpack) once 12 feels easy'] },
  dips: { name: 'Dips', kind: 'reps', target: [5, 7], note: 'Parallel bars 5–7 · chair 10–12', cues: ['Shoulders down, away from ears', 'Lower until shoulders are just below elbows', 'Lean slightly forward for more chest'] },
  'pike-pushup': { name: 'Elevated pike push-ups', kind: 'reps', target: [8, 9], cues: ['Hips high, feet elevated', 'Head travels forward of the hands (a triangle)', 'Elbows track back, not flared'] },
  'slow-incline-pushup': { name: 'Slow incline push-ups', kind: 'reps', target: [7, 8], cues: ['3 seconds down, 1 second pause, 2 up', 'Full lockout at the top', 'Keep ribs tucked'] },

  // ----- Pull -----
  pullup: { name: 'Pull-ups', kind: 'reps', target: [7, 8], cues: ['Start from a dead hang with shoulders engaged', 'Drive elbows down to your back pockets', 'Chin over the bar, control the way down'] },
  'australian-chinup': { name: 'Australian chin-ups', kind: 'reps', target: [6, 8], cues: ['Underhand grip, body straight like a plank', 'Pull your chest to the bar', 'Squeeze shoulder blades at the top'] },
  'scap-pull': { name: 'Scapula horizontal pulls', kind: 'reps', target: [10, 10], cues: ['Arms stay straight', 'Pinch shoulder blades together, then release', 'Small, controlled range'] },
  ytw: { name: 'Y-T-W lifts', kind: 'reps', target: [7, 8], perSide: true, note: 'each letter', cues: ['Thumbs up, lead with the shoulder blades', 'Light and slow: no swinging', 'Hold each top position for a second'] },
  chinup: { name: 'Chin-ups', kind: 'reps', target: [6, 8], cues: ['Palms facing you, shoulder-width', 'Chest up to the bar', 'Full extension at the bottom'] },
  'active-hang': { name: 'Active hang', kind: 'time', target: [20, 30], cues: ['Arms straight, pull shoulders down from ears', 'Ribs down, slight hollow', 'Breathe; grip hard'] },

  // ----- Abs pool -----
  'hollow-hold': { name: 'Hollow body hold', kind: 'time', target: [20, 30], cues: ['Lower back pressed into the floor', 'Arms by ears, legs low but back still flat', 'Shorten the lever (bend knees) if your back lifts'] },
  'hanging-leg-raise': { name: 'Hanging leg raises', kind: 'reps', target: [8, 12], cues: ['No swinging: start from an active hang', 'Curl the pelvis up at the top', 'Lower slowly'] },
  'side-plank-updown': { name: 'Side plank up-downs', kind: 'reps', target: [10, 12], perSide: true, cues: ['Stack shoulders over elbow', 'Dip the hip to the floor, then drive it high', 'Keep the body in one line'] },
  'v-ups': { name: 'V-ups', kind: 'reps', target: [8, 10], cues: ['Arms and legs meet over your hips', 'Keep legs straight', 'Lower with control, don\'t flop'] },
  'leg-raise': { name: 'Lying leg raises', kind: 'reps', target: [6, 8], cues: ['Hands under hips, lower back down', 'Raise to vertical, lower slowly', 'Stop before your back arches'] },
  'russian-twist': { name: 'Russian twists', kind: 'reps', target: [15, 15], perSide: true, cues: ['Lean back, chest up', 'Rotate from the ribs, not just the arms', 'Feet up for more challenge'] },
  'hanging-leg-lift': { name: 'Hanging leg lifts', kind: 'reps', target: [8, 12], cues: ['Knees or straight legs to hip height', 'Control the swing', 'Exhale on the way up'] },
  'leanback-crunch': { name: 'Lean-back crunches (legs up)', kind: 'reps', target: [10, 15], cues: ['Sit leaning back, lift feet off the ground', 'Pull knees to chest, then extend', 'Keep the chest tall'] },

  // ----- Ladder steps (skills) -----
  'wall-handstand': { name: 'Wall handstand', kind: 'time', target: [30, 30], cues: ['Stack wrists, shoulders, hips', 'Push the floor away: tall shoulders', 'Squeeze legs and glutes'] },
  'wall-hs-taps': { name: 'Wall handstand shoulder taps', kind: 'reps', target: [6, 10], perSide: true, cues: ['Chest to wall', 'Shift weight before lifting a hand', 'Keep hips still'] },
  'hs-kickup': { name: 'Freestanding kick-up holds', kind: 'time', target: [5, 10], cues: ['Kick up softly, find balance on fingertips', 'Practice the cartwheel bail-out', 'Count every second of balance'] },
  handstand: { name: 'Freestanding handstand', kind: 'time', target: [10, 20], cues: ['Fingers do the balancing', 'Tight hollow body', 'Eyes between the hands'] },

  'planche-lean': { name: 'Pseudo planche lean', kind: 'time', target: [15, 20], cues: ['Fingers turned out or back', 'Lean shoulders well past the hands', 'Protract: round the upper back'] },
  'pp-pushup': { name: 'Pseudo planche push-ups', kind: 'reps', target: [5, 8], cues: ['Keep the forward lean through every rep', 'Hands by the hips', 'Elbows close to the body'] },
  'tuck-planche': { name: 'Tuck planche', kind: 'time', target: [5, 10], cues: ['Knees tucked, hips at shoulder height', 'Arms locked straight', 'Push the floor away'] },

  'tuck-lsit': { name: 'Tuck L-sit', kind: 'time', target: [10, 20], cues: ['Arms locked, shoulders pushed down', 'Knees to chest', 'Hips lifted off the floor'] },
  'one-leg-lsit': { name: 'One-leg L-sit', kind: 'time', target: [10, 20], perSide: true, cues: ['One leg straight, one tucked', 'Point the toes', 'Switch legs each set'] },
  lsit: { name: 'L-sit hold', kind: 'time', target: [15, 25], cues: ['Legs straight and together, toes pointed', 'Shoulders down, chest up', 'Legs at hip height or higher'] },

  'tuck-df-neg': { name: 'Tuck dragon flag negatives', kind: 'reps', target: [4, 6], cues: ['Hold a sturdy bench behind your head', 'Knees tucked, lower slowly (3–5 s)', 'Shoulders stay on the bench'] },
  'single-leg-df-neg': { name: 'Single-leg dragon flag negatives', kind: 'reps', target: [4, 6], cues: ['One leg straight, one tucked', 'Lower as one straight line from shoulders', 'Stop if your hips sag'] },
  'df-neg': { name: 'Dragon flag negatives', kind: 'reps', target: [4, 6], cues: ['Straight body from shoulders to toes', '5-second lowering', 'Ribs down the whole way'] },
  'dragon-flag': { name: 'Dragon flag', kind: 'reps', target: [3, 5], cues: ['Lift and lower as one rigid line', 'No pike at the hips', 'Own the negative first'] },

  'lying-wipers': { name: 'Lying windshield wipers', kind: 'reps', target: [6, 8], perSide: true, cues: ['Legs up, arms out wide', 'Lower legs side to side under control', 'Shoulders stay down'] },
  'hanging-knee-wipers': { name: 'Hanging knee windshield wipers', kind: 'reps', target: [6, 8], perSide: true, cues: ['Knees up to hip height', 'Rotate knees left/right', 'Control the swing'] },
  'hanging-wipers': { name: 'Hanging windshield wipers', kind: 'reps', target: [5, 8], perSide: true, cues: ['Toes to the bar, then rotate side to side', 'Slow and controlled', 'Keep arms engaged'] },
};

/**
 * Skill ladders: the steps in order. A workout slot that names a ladder uses
 * whichever step you're on. `start` is the default current step.
 */
export const LADDERS = {
  handstand: { name: 'Handstand', steps: ['wall-handstand', 'wall-hs-taps', 'hs-kickup', 'handstand'], start: 0 },
  planche: { name: 'Planche', steps: ['planche-lean', 'pp-pushup', 'tuck-planche'], start: 0 },
  lsit: { name: 'L-sit', steps: ['tuck-lsit', 'one-leg-lsit', 'lsit'], start: 2 },
  dragon: { name: 'Dragon flag', steps: ['leg-raise', 'tuck-df-neg', 'single-leg-df-neg', 'df-neg', 'dragon-flag'], start: 1 },
  wipers: { name: 'Windshield wipers', steps: ['lying-wipers', 'hanging-knee-wipers', 'hanging-wipers'], start: 1 },
};

/** Workouts: a list of slots — an exercise id, or { ladder } for a skill. */
export const WORKOUTS = {
  push: { name: 'Push', slots: ['decline-pushup', 'dips', 'pike-pushup', { ladder: 'handstand' }, 'slow-incline-pushup', { ladder: 'planche' }] },
  pull: { name: 'Pull', slots: ['pullup', 'australian-chinup', 'scap-pull', 'ytw', 'chinup', 'active-hang'] },
  abs: { name: 'Abs', slots: null }, // chosen in settings (see ABS_POOL)
};
export const ROTATION = ['push', 'pull', 'abs'];

/** Everything that can go on Abs day. Ladders appear as one option each. */
export const ABS_POOL = [
  'hollow-hold', 'hanging-leg-raise', 'side-plank-updown', 'v-ups', 'leg-raise', 'russian-twist',
  { ladder: 'lsit' }, 'hanging-leg-lift', 'leanback-crunch', { ladder: 'dragon' }, { ladder: 'wipers' },
];
/** Your main Abs list as the default Abs day. */
export const DEFAULT_ABS = ['hollow-hold', 'hanging-leg-raise', 'side-plank-updown', 'v-ups', 'leg-raise', 'russian-twist', { ladder: 'lsit' }];

export const slotKey = (slot) => (typeof slot === 'string' ? slot : `ladder:${slot.ladder}`);
export const keyToSlot = (key) => (key.startsWith('ladder:') ? { ladder: key.slice(7) } : key);
