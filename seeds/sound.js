// sound.js — soft synthesized sound effects for Seed Pack (WebAudio, no files).
// Every effect is built on the fly from sine/triangle tones and filtered noise,
// with quick attacks and exponential decays so it all stays gentle. Sound is on
// by default; the choice lives in localStorage ('sp.sound': true = on).

const KEY = 'sp.sound';
const MASTER_VOL = 0.25;
const QUIET = 0.0001; // exponential ramps can't reach 0

// Busy-battle sounds get a minimum gap (ms) so a crowded lane stays calm.
const THROTTLE = { shoot: 70, hit: 70, pestDie: 50 };
const lastPlayed = {};

let ctx = null;
let master = null;
let noiseBuf = null;
let primed = false;
let now = 0; // start time of the effect being built
let muted = readMuted();

// ---------------------------------------------------------------------------
// Preference
// ---------------------------------------------------------------------------
function readMuted() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw != null && JSON.parse(raw) === false;
  } catch (e) {
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = !!m;
  try {
    localStorage.setItem(KEY, JSON.stringify(!muted));
  } catch (e) { /* storage unavailable: keep the in-memory choice */ }
  if (!muted) unlockAudio(); // usually called from a tap, so this unlocks iOS too
}

// ---------------------------------------------------------------------------
// Audio context (created lazily, unlocked by the first user gesture)
// ---------------------------------------------------------------------------
function getCtx() {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = MASTER_VOL;
  master.connect(ctx.destination);
  return ctx;
}

export function unlockAudio() {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state !== 'running') {
      const p = c.resume();
      if (p && p.catch) p.catch(() => {});
    }
    if (!primed) {
      // Older iOS only unlocks once a sound actually starts inside a gesture.
      primed = true;
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, c.sampleRate);
      src.connect(c.destination);
      src.start(0);
    }
  } catch (e) { /* no audio, no problem */ }
}

// Unlock on the first tap/key; stop listening once the context is running.
const GESTURES = ['pointerdown', 'touchend', 'keydown'];
function onGesture() {
  if (muted) return;
  unlockAudio();
  if (ctx && ctx.state === 'running') {
    GESTURES.forEach((ev) => window.removeEventListener(ev, onGesture, true));
  }
}
if (typeof window !== 'undefined' && window.addEventListener) {
  GESTURES.forEach((ev) => window.addEventListener(ev, onGesture, { capture: true, passive: true }));
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const jit = (f, amt = 0.03) => f * (1 + (Math.random() * 2 - 1) * amt);

function envelope(g, t0, vol, attack, dur) {
  g.gain.setValueAtTime(QUIET, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(attack, dur * 0.5));
  g.gain.exponentialRampToValueAtTime(QUIET, t0 + dur);
}

/** One enveloped oscillator note, `start` seconds into the effect. */
function tone(freq, start, dur, { type = 'sine', vol = 0.3, slideTo = 0, attack = 0.005 } = {}) {
  const t0 = now + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  envelope(g, t0, vol, attack, dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseBuffer() {
  if (!noiseBuf) {
    const len = Math.floor(ctx.sampleRate);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Filtered noise burst for whooshes, rips and thumps. */
function noise(start, dur, { vol = 0.2, filterFreq = 1200, filterEnd = 0, q = 1, type = 'bandpass', attack = 0.005 } = {}) {
  const t0 = now + start;
  const src = ctx.createBufferSource();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.buffer = noiseBuffer();
  src.loop = true;
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(filterFreq, t0);
  if (filterEnd) f.frequency.exponentialRampToValueAtTime(filterEnd, t0 + dur);
  envelope(g, t0, vol, attack, dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0, Math.random() * 0.8); // random offset so repeats differ
  src.stop(t0 + dur + 0.05);
}

/** Wooden mallet / kalimba pluck: soft body plus a brief bright overtone. */
function pluck(freq, start, dur = 0.35, vol = 0.3) {
  tone(freq, start, dur, { vol });
  tone(freq, start, dur * 0.6, { type: 'triangle', vol: vol * 0.3 });
  tone(freq * 4, start, Math.min(0.08, dur * 0.3), { vol: vol * 0.12 });
}

/** Little bell: sine with faint inharmonic partials. */
function bell(freq, start, dur = 0.5, vol = 0.2) {
  tone(freq, start, dur, { vol });
  tone(freq * 2.76, start, dur * 0.45, { vol: vol * 0.18 });
  tone(freq * 5.4, start, dur * 0.2, { vol: vol * 0.08 });
}

/** High glassy note; a slightly detuned twin gives it a soft shimmer. */
function glint(freq, start, dur = 0.4, vol = 0.08) {
  tone(freq, start, dur, { vol });
  tone(freq * 1.004, start, dur, { vol: vol * 0.6 });
}

// ---------------------------------------------------------------------------
// Effects (MIDI note numbers: 60 = C4, 72 = C5, 84 = C6, 96 = C7)
// ---------------------------------------------------------------------------
const FX = {
  // UI
  tap() {
    tone(jit(1050), 0, 0.05, { type: 'triangle', vol: 0.14, slideTo: 780 });
  },
  open() {
    noise(0, 0.2, { filterFreq: 500, filterEnd: 2600, q: 0.8, vol: 0.12, attack: 0.06 });
    pluck(hz(79), 0.04, 0.3, 0.16);
  },
  error() {
    tone(hz(57), 0, 0.16, { type: 'triangle', vol: 0.26 });
    tone(hz(53), 0.15, 0.28, { type: 'triangle', vol: 0.26, slideTo: hz(52) });
  },

  // Garden
  plant() {
    noise(0, 0.12, { type: 'lowpass', filterFreq: 900, filterEnd: 150, vol: 0.4 });
    tone(150, 0, 0.12, { vol: 0.3, slideTo: 70 });
    pluck(hz(76), 0.08, 0.3, 0.16);
  },
  water() {
    [0, 0.07, 0.15, 0.22].forEach((t, i) => {
      const f = jit(1300 - i * 120, 0.08);
      tone(f, t + Math.random() * 0.02, 0.08, { vol: 0.16, slideTo: f * 0.55 });
    });
  },
  harvest() {
    pluck(hz(76), 0, 0.25, 0.22);
    pluck(hz(79), 0.07, 0.25, 0.22);
    pluck(hz(84), 0.14, 0.45, 0.24);
  },
  coin() {
    bell(hz(83), 0, 0.14, 0.14);
    bell(hz(88), 0.06, 0.35, 0.14);
  },
  unlock() {
    [67, 72, 76, 79].forEach((m, i) => pluck(hz(m), i * 0.08, i === 3 ? 0.55 : 0.3, 0.2));
  },
  levelUp() {
    [72, 76, 79, 84].forEach((m, i) => pluck(hz(m), i * 0.09, 0.3, 0.2));
    [84, 88].forEach((m) => pluck(hz(m), 0.38, 0.45, 0.16));
    glint(hz(96), 0.4, 0.4, 0.05);
  },

  // Cards
  packTear() {
    noise(0, 0.26, { filterFreq: 1400, filterEnd: 4800, q: 0.9, vol: 0.28, attack: 0.02 });
    for (let i = 0; i < 4; i++) {
      noise(0.02 + i * 0.05 + Math.random() * 0.015, 0.035, { filterFreq: jit(2600 + i * 600, 0.1), q: 2.5, vol: 0.18, attack: 0.002 });
    }
  },
  cardFlip() {
    noise(0, 0.06, { filterFreq: 2800, filterEnd: 1400, q: 1.2, vol: 0.22, attack: 0.003 });
    tone(jit(hz(81), 0.02), 0.02, 0.09, { type: 'triangle', vol: 0.09 });
  },
  rare() {
    glint(hz(91), 0, 0.45, 0.1);
    glint(hz(96), 0.08, 0.55, 0.1);
  },
  epic() {
    [72, 76, 79].forEach((m) => tone(hz(m), 0, 0.7, { type: 'triangle', vol: 0.1, attack: 0.03 }));
    [88, 91, 96, 100].forEach((m, i) => glint(hz(m), 0.06 + i * 0.06, 0.45, 0.07));
  },
  legendary() {
    [60, 67, 71, 76].forEach((m) => { // Cmaj7 swell
      tone(hz(m), 0, 1.2, { vol: 0.09, attack: 0.35 });
      tone(hz(m), 0, 1.1, { type: 'triangle', vol: 0.04, attack: 0.35 });
    });
    noise(0.1, 1.0, { type: 'highpass', filterFreq: 5000, filterEnd: 9000, vol: 0.025, attack: 0.4 });
    [84, 88, 91, 96, 100, 103].forEach((m, i) => glint(hz(m), 0.3 + i * 0.07, 0.5, 0.06));
  },
  dupe() {
    pluck(hz(79), 0, 0.18, 0.16);
    bell(hz(86), 0.07, 0.4, 0.13);
  },

  // Battle
  shoot() {
    const f = jit(620, 0.06);
    tone(f, 0, 0.06, { vol: 0.12, slideTo: f * 0.5 });
  },
  hit() {
    noise(0, 0.03, { type: 'lowpass', filterFreq: 1400, vol: 0.12, attack: 0.002 });
    tone(jit(240, 0.05), 0, 0.04, { type: 'triangle', vol: 0.07, slideTo: 160 });
  },
  pestDie() {
    const f = jit(hz(84), 0.04);
    tone(f, 0, 0.14, { type: 'triangle', vol: 0.14, slideTo: f * 0.45 });
    tone(f * 1.5, 0.05, 0.08, { vol: 0.06, slideTo: f * 0.7 });
  },
  blast() {
    noise(0, 0.5, { type: 'lowpass', filterFreq: 700, filterEnd: 90, q: 0.7, vol: 0.5, attack: 0.01 });
    tone(160, 0, 0.4, { type: 'triangle', vol: 0.2, slideTo: 48 });
    tone(90, 0, 0.45, { vol: 0.25, slideTo: 40 });
  },
  heal() {
    tone(hz(72), 0, 0.35, { vol: 0.08, slideTo: hz(84), attack: 0.04 });
    [84, 88, 91, 96].forEach((m, i) => glint(hz(m), 0.06 + i * 0.05, 0.3, 0.06));
  },
  sun() {
    bell(jit(hz(88), 0.01), 0, 0.5, 0.13);
  },
  lifeLost() {
    tone(hz(62), 0, 0.2, { type: 'triangle', vol: 0.24 });
    tone(hz(57), 0.18, 0.4, { type: 'triangle', vol: 0.24, slideTo: hz(55) });
  },
  win() {
    [[72, 0], [76, 0.11], [79, 0.22], [84, 0.36]].forEach(([m, t]) => pluck(hz(m), t, 0.28, 0.2));
    [76, 79, 84].forEach((m) => pluck(hz(m), 0.52, 0.5, 0.13));
    glint(hz(96), 0.56, 0.45, 0.05);
  },
  lose() {
    tone(hz(67), 0, 0.3, { type: 'triangle', vol: 0.2 });
    tone(hz(63), 0.22, 0.3, { type: 'triangle', vol: 0.2 });
    tone(hz(60), 0.44, 0.65, { type: 'triangle', vol: 0.2, slideTo: hz(59) });
  },
  place() {
    tone(240, 0, 0.1, { vol: 0.26, slideTo: 110 });
    noise(0, 0.06, { type: 'lowpass', filterFreq: 600, vol: 0.15 });
    pluck(hz(72), 0.03, 0.18, 0.1);
  },
  spell() {
    noise(0, 0.45, { filterFreq: 350, filterEnd: 3200, q: 3, vol: 0.3, attack: 0.12 });
    tone(hz(79), 0.05, 0.4, { vol: 0.07, slideTo: hz(91), attack: 0.08 });
    glint(hz(88), 0.28, 0.35, 0.07);
  },
};

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------
/** Play a named effect. Unknown names, muted sound or no WebAudio: silent. */
export function sfx(name) {
  try {
    if (muted || !Object.prototype.hasOwnProperty.call(FX, name)) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const gap = THROTTLE[name];
    if (gap) {
      const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (t - (lastPlayed[name] || -Infinity) < gap) return;
      lastPlayed[name] = t;
    }
    if (!ctx || ctx.state !== 'running') unlockAudio();
    // Don't queue sounds on a suspended context; they'd all burst out on unlock.
    if (!ctx || ctx.state !== 'running') return;
    now = ctx.currentTime + 0.01;
    FX[name]();
  } catch (e) { /* sound is optional */ }
}
