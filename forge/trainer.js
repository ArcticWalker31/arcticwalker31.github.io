// trainer.js — Kai: what he says and which pose he's in.
//
// Personality mixes by situation: hype when you're on it, calm after a
// workout, tougher the longer you've been away.
//
// Pose images live in trainer/ as <pose>.png (or .jpg / .webp). Missing poses
// fall back to idle, so the app works with just one picture.

export const POSES = {
  idle: 'Neutral / default',
  wave: 'Welcome (first visit)',
  point: 'Call to action (ready to train)',
  hype: 'Fired up (on a streak)',
  proud: 'Proud (trained today / goal hit)',
  stern: 'Stern (been a while)',
  celebrate: 'Celebrating (level up)',
  flex: 'Flexing (personal record)',
};

const LINES = {
  first: ['I\'m Kai. We\'ll build this one rep at a time. Start with {next} today.', 'New here? Good. {next} is up first. Let\'s see what you\'ve got.'],
  today: ['Work\'s done for today. Eat, sleep, recover. {next} is next.', 'That\'s how it\'s done. Rest up; {next} tomorrow.', 'Solid session. Recovery is training too.'],
  ready: ['{next} day. Let\'s go!', 'Bar\'s waiting. {next} is up.', 'You\'re warmed up from yesterday. Keep it rolling: {next}.'],
  nudge: ['Two days off. Perfect recovery. Now {next}.', 'Rested and ready? {next}, today.', 'Don\'t let two become four. {next} is on deck.'],
  push: ['{days} days since your last workout. We train today. {next}.', '{days} days. The rust is real. {next}, no excuses.', 'Hey. {days} days. Even one round of {next} counts.'],
  tough: ['{days} days?! The pull-up bar misses you. {next}. Now.', '{days} days off. Start small: one round of {next}. Just start.', 'Reset button\'s right here. {next}, today. I\'ll be counting.'],
  goalHit: ['Weekly goal: smashed. 🔥 {streak}-week streak. Anything extra is bonus XP.', 'Goal hit for the week. Keep the streak alive at {streak}.'],
  behind: ['{left} more workouts to hit your goal this week. Get one in today.', 'Week\'s slipping: {left} to go. {next} now keeps the streak alive.'],
  levelUp: ['LEVEL {level}! You\'re a {title} now. Keep stacking reps.', 'Level {level} unlocked. {title} status. Proud of you.'],
  pr: ['New personal record! {pr}. That\'s growth.', 'PR on {pr}! The work is paying off.'],
};

const pick = (list, seed) => list[Math.abs(seed) % list.length];
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/**
 * Home-screen check-in.
 * ctx: { sessions, daysSince, next, week: { done, goal, left, streak }, now }
 */
export function checkIn(ctx) {
  const { daysSince, week } = ctx;
  const day = Math.floor((ctx.now || new Date()).getTime() / 86400000);
  const vars = { next: ctx.next, days: daysSince, streak: week.streak, left: week.left };
  const daysLeftInWeek = 7 - (((ctx.now || new Date()).getDay() + 6) % 7);
  if (ctx.sessions === 0) return { pose: 'wave', text: fill(pick(LINES.first, day), vars) };
  if (daysSince === 0) return { pose: 'proud', text: fill(pick(week.done >= week.goal ? LINES.goalHit : LINES.today, day), vars) };
  if (daysSince >= 5) return { pose: 'stern', text: fill(pick(LINES.tough, day), vars) };
  if (daysSince >= 3) return { pose: 'stern', text: fill(pick(LINES.push, day), vars) };
  if (week.left > 0 && week.left >= daysLeftInWeek - 1) return { pose: 'point', text: fill(pick(LINES.behind, day), vars) };
  if (daysSince === 2) return { pose: 'point', text: fill(pick(LINES.nudge, day), vars) };
  return { pose: week.streak >= 2 ? 'hype' : 'point', text: fill(pick(LINES.ready, day), vars) };
}

export const levelUpLine = (level, title) => ({ pose: 'celebrate', text: fill(pick(LINES.levelUp, level), { level, title }) });
export const prLine = (pr) => ({ pose: 'flex', text: fill(pick(LINES.pr, pr.length), { pr }) });

/** <img> markup that tries pose.png/.jpg/.webp, then falls back to idle. */
export function poseImg(pose, cls = 'kai-img') {
  const tries = [`trainer/${pose}.png`, `trainer/${pose}.jpg`, `trainer/${pose}.webp`, 'trainer/idle.jpg'];
  return `<img class="${cls}" src="${tries[0]}" alt="Kai" data-tries='${JSON.stringify(tries.slice(1))}' onerror="const t=JSON.parse(this.dataset.tries);if(t.length){this.src=t.shift();this.dataset.tries=JSON.stringify(t);}">`;
}
