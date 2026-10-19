// battle.js — optional lane-defense battles. Pests crawl down 5 lanes toward
// the garden fence; you spend sunlight to place plants from your deck of 8
// and cast tool/weather spells. Three pests through the fence and you lose.
//
// startBattle() builds the battle screen inside `host` and calls onEnd() once.

import { CARD, battleStats, levelMult } from './cards.js?v=1';
import { cardArt, pestArt, svgImage } from './art.js?v=1';
import { sfx } from './sound.js?v=1';

const COLS = 5, ROWS = 7;
const TOP = 0.9, BOTTOM = 0.75; // spawn strip above, fence strip below (in cells)
const LIVES = 3;
const START_SUN = 100, SUN_TICK = 7, SUN_TICK_AMT = 25;

// ---------------------------------------------------------------------------
// Pests
// ---------------------------------------------------------------------------
export const PESTS = {
  aphid: { name: 'Aphid', hp: 110, speed: 0.26, bite: 20, pts: 1, size: 0.62, from: 1 },
  slug: { name: 'Slug', hp: 240, speed: 0.18, bite: 26, pts: 2, size: 0.74, from: 2 },
  caterpillar: { name: 'Caterpillar', hp: 180, speed: 0.32, bite: 28, pts: 2, size: 0.8, from: 3 },
  snail: { name: 'Snail', hp: 440, speed: 0.14, bite: 26, pts: 3, size: 0.8, armor: 0.25, from: 4, note: 'Shell blocks some damage' },
  grasshopper: { name: 'Grasshopper', hp: 210, speed: 0.28, bite: 24, pts: 3, size: 0.76, hop: true, from: 6, note: 'Hops over the first plant' },
  beetle: { name: 'Beetle', hp: 820, speed: 0.16, bite: 40, pts: 5, size: 0.82, armor: 0.3, from: 8, note: 'Heavily armored' },
  crow: { name: 'Crow', hp: 170, speed: 0.55, bite: 0, pts: 3, size: 0.82, fly: true, from: 11, note: 'Flies over plants: shoot it down' },
  mole: { name: 'Mole', hp: 300, speed: 0.26, bite: 34, pts: 4, size: 0.76, dig: true, from: 13, note: 'Tunnels under your first rows' },
  gopher: { name: 'Gopher King', hp: 2600, speed: 0.1, bite: 90, pts: 0, size: 1.3, armor: 0.1, boss: true, note: 'Boss' },
};
const DIG_UNTIL = 3; // moles surface at this row

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The waves for stage n (same every time you play it). */
export function stagePlan(n) {
  const r = rng(n * 9973 + 17);
  const kinds = Object.keys(PESTS).filter((k) => PESTS[k].from && PESTS[k].from <= n);
  const waveCount = Math.min(6, 2 + Math.floor((n + 1) / 3));
  const waves = [];
  for (let w = 0; w < waveCount; w++) {
    let budget = Math.round((2 + n * 1.2) * (0.7 + (0.6 * w) / Math.max(1, waveCount - 1)));
    const list = [];
    while (budget > 0) {
      const k = kinds[Math.floor(r() * kinds.length)];
      if (PESTS[k].pts > budget) { if (budget < 2) { list.push('aphid'); budget--; } continue; }
      list.push(k);
      budget -= PESTS[k].pts;
    }
    waves.push(list);
  }
  const boss = n % 5 === 0;
  if (boss) waves[waves.length - 1].push('gopher');
  return { waves, boss, kinds: boss ? [...kinds, 'gopher'] : kinds, scale: 1 + 0.09 * (n - 1), seed: n };
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SUN_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="5.5" fill="#FFC83D" stroke="#B7791F" stroke-width="1.4"/><g stroke="#E8A317" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g></svg>';

/**
 * @param {{host: HTMLElement, stage: number, deck: {card: object, level: number}[], bonusSun?: number,
 *          onEnd: (r: {won: boolean, pests: number, stage: number, quit?: boolean}) => void}} opts
 */
export function startBattle({ host, stage, deck, bonusSun = 0, onEnd }) {
  const plan = stagePlan(stage);
  const G = {
    t: 0, sun: START_SUN + bonusSun, sunTimer: SUN_TICK, lives: LIVES, killed: 0,
    plants: Array.from({ length: COLS }, () => Array(ROWS).fill(null)),
    pests: [], shots: [], fx: [],
    wave: -1, queue: [], spawnTimer: 0, nextWaveAt: stage <= 3 ? 22 : 16, lastSpawn: 0,
    hoses: Array(COLS).fill(true), // one-time sprinkler at the end of each lane
    hasteUntil: 0, speed: 1, paused: false, over: false,
    selected: -1, shovel: false,
    cards: deck.map(({ card, level }) => ({ card, level, st: battleStats(card, level), ready: 0 })),
  };
  const R = rng(stage * 31 + Date.now() % 1000);

  // ---- DOM --------------------------------------------------------------
  host.innerHTML = `
    <div class="b-hud">
      <div class="b-sun">${SUN_SVG}<b id="b-sun">0</b></div>
      <div class="b-wave"><span id="b-wave-label">Stage ${stage}</span><div class="b-wavebar"><span id="b-wavebar"></span></div></div>
      <div class="b-lives" id="b-lives" aria-label="Lives"></div>
      <button class="b-btn" id="b-speed" type="button" aria-label="Speed">1×</button>
      <button class="b-btn" id="b-pause" type="button" aria-label="Pause"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></button>
    </div>
    <div class="b-field" id="b-field"><canvas id="b-canvas"></canvas>
      <button class="b-banner" id="b-banner" type="button" hidden></button>
      <div class="b-hint" id="b-hint" hidden></div>
    </div>
    <div class="b-tray" id="b-tray">
      ${G.cards.map((c, i) => `<button class="b-card r-${c.card.rarity}" type="button" data-i="${i}">
        <span class="b-art">${'<svg viewBox="0 0 100 100">' + cardArt(c.card) + '</svg>'}</span>
        <span class="b-cost">${c.st.cost}</span><span class="b-cd"></span></button>`).join('')}
      <button class="b-card b-shovel" type="button" data-shovel aria-label="Shovel: remove a plant">
        <span class="b-art"><svg viewBox="0 0 100 100"><path d="M50 14 C 66 22 66 46 54 52 L46 52 C 34 46 34 22 50 14 Z" fill="#B0BEC5" stroke="#3B2A1E" stroke-width="3"/><rect x="46" y="52" width="8" height="26" fill="#8D6E63" stroke="#3B2A1E" stroke-width="3"/><rect x="38" y="76" width="24" height="10" rx="5" fill="#FF7043" stroke="#3B2A1E" stroke-width="3"/></svg></span>
        <span class="b-cost">dig</span></button>
    </div>
    <div class="b-pausemenu" id="b-pausemenu" hidden>
      <div class="b-pausecard"><h2>Paused</h2>
        <button class="btn primary wide" id="b-resume" type="button">Keep playing</button>
        <button class="btn wide" id="b-quit" type="button">Give up</button></div>
    </div>`;
  const $ = (id) => host.querySelector('#' + id);
  const canvas = $('b-canvas'), ctx = canvas.getContext('2d');
  const trayBtns = [...host.querySelectorAll('.b-card[data-i]')];
  const shovelBtn = host.querySelector('[data-shovel]');

  const imgs = {};
  for (const c of G.cards) imgs[c.card.id] = svgImage('c:' + c.card.id, cardArt(c.card));
  for (const k of plan.kinds) imgs['p:' + k] = svgImage('p:' + k, pestArt(k));

  // ---- Layout -------------------------------------------------------------
  let W = 0, Hh = 0, cs = 0, ox = 0, oy = 0, dpr = 1;
  function layout() {
    const box = $('b-field').getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = box.width; Hh = box.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = Hh + 'px';
    cs = Math.min(W / COLS, Hh / (ROWS + TOP + BOTTOM));
    ox = (W - cs * COLS) / 2;
    oy = (Hh - cs * (ROWS + TOP + BOTTOM)) / 2 + cs * TOP;
  }
  const ro = new ResizeObserver(layout);
  ro.observe($('b-field'));
  layout();

  // ---- Helpers ------------------------------------------------------------
  const px = (col) => ox + (col + 0.5) * cs; // lane center x
  const py = (y) => oy + y * cs; // row units → pixels
  const allPlants = () => G.plants.flat().filter(Boolean);
  const targetable = (p) => !p.dead && !p.under && p.y > -0.45;
  const slowMul = (p) => (G.t < p.frozenUntil ? 0 : G.t < p.slowUntil ? 1 - p.slowAmt : 1);

  function text(x, y, str, color = '#3B2A1E', big = false) { G.fx.push({ k: 'text', x, y, str, color, big, t: 0, T: 1.1 }); }
  function ring(x, y, r, color, T = 0.45) { G.fx.push({ k: 'ring', x, y, r, color, t: 0, T }); }
  function puff(x, y, color, n = 7) {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, s = 0.6 + R() * 1.4;
      G.fx.push({ k: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.6, color, t: 0, T: 0.5 + R() * 0.3, r: 0.05 + R() * 0.05 });
    }
  }

  function hurt(p, amount, color) {
    if (p.dead || p.under) return;
    p.hp -= amount * (1 - (p.def.armor || 0));
    p.flash = 0.12;
    if (p.hp <= 0) {
      p.dead = true;
      G.killed++;
      puff(p.col + 0.5, p.y, color || '#C5E1A5', p.def.boss ? 18 : 8);
      sfx('pestDie');
      if (p.def.boss) { ring(p.col + 0.5, p.y, 2, '#FFD54F', 0.8); text(p.col + 0.5, p.y - 0.4, 'Boss down!', '#B7791F', true); }
    } else sfx('hit');
  }
  function slow(p, amt, dur) {
    if (p.def.boss) amt *= 0.6;
    if (G.t > p.slowUntil || amt >= p.slowAmt) p.slowAmt = amt;
    p.slowUntil = Math.max(p.slowUntil, G.t + dur);
  }
  function pushBack(p, cells) { if (!p.under) p.y = Math.max(-0.4, p.y - cells * (p.def.boss ? 0.35 : 1)); p.eating = null; }
  function healPlant(pl, amount) {
    if (!pl || pl.hp >= pl.max) return;
    pl.hp = Math.min(pl.max, pl.hp + amount);
    pl.glow = 0.5;
  }
  function addSun(n, x, y) {
    G.sun = Math.min(9999, G.sun + n);
    if (x !== undefined) text(x, y, `+${n}`, '#C98A00');
    sfx('sun');
  }
  const pestsIn = (col) => G.pests.filter((p) => p.col === col && targetable(p));

  // ---- Placing & casting ------------------------------------------------
  function canAfford(c) { return G.sun >= c.st.cost && G.t >= c.ready; }

  function place(i, col, row) {
    const c = G.cards[i];
    if (!canAfford(c)) { sfx('error'); return false; }
    if (c.card.type === 'plant') {
      if (row < 0 || row >= ROWS || G.plants[col][row]) { sfx('error'); return false; }
      const st = c.st;
      G.plants[col][row] = {
        card: c.card, st, col, row, hp: st.hp || 1, max: st.hp || 1, shield: 0,
        timer: st.role === 'sun' ? 4 : st.role === 'bomb' ? 0.6 : 0.3, chew: 0, born: G.t, glow: 0, kick: 0,
      };
      sfx('place');
      puff(col + 0.5, row + 0.8, '#A1887F', 5);
    } else if (!cast(c, col, row)) { sfx('error'); return false; }
    G.sun -= c.st.cost;
    c.ready = G.t + c.st.cd;
    return true;
  }

  function cast(c, col, row) {
    const s = c.st, k = levelMult(c.level);
    const color = c.card.type === 'weather' ? '#81D4FA' : '#FFCC80';
    let hits = [];
    if (s.target === 'lane') hits = G.pests.filter((p) => p.col === col && !p.dead);
    else if (s.target === 'all') hits = G.pests.filter((p) => !p.dead);
    else if (s.target === 'area') hits = G.pests.filter((p) => !p.dead && Math.abs(p.col - col) <= 1 && Math.abs(p.y - (row + 0.5)) <= 1.5);
    else if (s.target === 'front') {
      const f = G.pests.filter(targetable).sort((a, b) => b.y - a.y)[0];
      if (!f) return false;
      hits = [f];
    }
    if (s.remove) {
      const p = hits[0];
      if (p.def.boss) hurt(p, 400 * k, color);
      else { p.dead = true; G.killed++; puff(p.col + 0.5, p.y, '#E1F5FE', 10); text(p.col + 0.5, p.y, 'Scooped!'); }
    }
    if (s.strikes) {
      const pool = G.pests.filter(targetable).sort(() => R() - 0.5).slice(0, s.strikes);
      for (const p of pool) { hurt(p, s.dmg * k, '#FFEB3B'); ring(p.col + 0.5, p.y, 0.7, '#FFEB3B', 0.35); }
    } else if (s.dmg) for (const p of hits) hurt(p, s.dmg * k, color);
    if (s.slow) for (const p of hits) slow(p, s.slow, s.slowFor);
    if (s.freeze) for (const p of hits) p.frozenUntil = G.t + s.freeze * (p.def.boss ? 0.5 : 1);
    if (s.push) for (const p of hits) pushBack(p, s.push);
    if (s.heal) {
      const pls = s.target === 'lane' ? G.plants[col].filter(Boolean) : allPlants();
      for (const pl of pls) healPlant(pl, s.heal * k);
      sfx('heal');
    }
    if (s.shield) for (const pl of allPlants()) { pl.shield = s.shield * k; pl.glow = 0.6; }
    if (s.haste) G.hasteUntil = G.t + s.haste;
    if (s.sun) addSun(Math.round(s.sun), col + 0.5, row + 0.5);
    // visuals
    if (s.target === 'lane') G.fx.push({ k: 'lane', col, color, t: 0, T: 0.5 });
    else if (s.target === 'area') ring(col + 0.5, row + 0.5, 1.6, color, 0.5);
    else if (s.target === 'all') G.fx.push({ k: 'flash', color, t: 0, T: 0.6 });
    sfx('spell');
    return true;
  }

  // ---- Waves --------------------------------------------------------------
  function spawn(kind) {
    const def = PESTS[kind];
    let col = Math.floor(R() * COLS);
    if (col === G.lastLane && R() < 0.6) col = (col + 1 + Math.floor(R() * (COLS - 1))) % COLS;
    G.lastLane = col;
    const hp = def.hp * plan.scale * (def.boss ? 1 + 0.15 * Math.floor(stage / 5) : 1);
    G.pests.push({
      kind, def, col, y: -0.5, hp, max: hp, slowUntil: 0, slowAmt: 0, frozenUntil: 0, burnUntil: 0, burnDps: 0,
      eating: null, hopped: false, hop: 0, under: !!def.dig, flash: 0, phase: R() * 6, dead: false,
    });
  }

  function startWave() {
    G.wave++;
    G.queue = [...plan.waves[G.wave]].sort(() => R() - 0.5);
    if (G.queue.includes('gopher')) G.queue = [...G.queue.filter((k) => k !== 'gopher'), 'gopher'];
    G.spawnTimer = 0.5;
    const last = G.wave === plan.waves.length - 1;
    banner(last ? (plan.boss ? 'The Gopher King approaches!' : 'Final wave!') : `Wave ${G.wave + 1} of ${plan.waves.length}`, 2.2);
  }

  let bannerTimer = 0;
  function banner(str, secs) {
    const b = $('b-banner');
    b.textContent = str; b.hidden = false; b.dataset.skip = '';
    bannerTimer = secs;
  }

  // ---- Simulation ---------------------------------------------------------
  function step(dt) {
    G.t += dt;
    const haste = G.t < G.hasteUntil ? 2 : 1;

    // passive sunlight
    G.sunTimer -= dt;
    if (G.sunTimer <= 0) { G.sunTimer += SUN_TICK; G.sun = Math.min(9999, G.sun + SUN_TICK_AMT); }

    // waves
    if (G.wave < 0) {
      if (G.t >= G.nextWaveAt) startWave();
    } else if (G.queue.length) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        spawn(G.queue.shift());
        G.lastSpawn = G.t;
        G.spawnTimer = Math.max(1.4, 3.8 - stage * 0.1) * (0.6 + R() * 0.8);
      }
    } else if (G.wave < plan.waves.length - 1) {
      const alive = G.pests.some((p) => !p.dead);
      if (!alive || G.t - G.lastSpawn > 22) {
        if (!G.breakAt) G.breakAt = G.t + (alive ? 0 : 4);
        if (G.t >= G.breakAt) { G.breakAt = 0; startWave(); }
      }
    } else if (!G.pests.some((p) => !p.dead)) {
      return end(true);
    }

    // plants
    for (const pl of allPlants()) {
      pl.glow = Math.max(0, pl.glow - dt);
      pl.kick = Math.max(0, pl.kick - dt * 4);
      if (pl.chew > 0) { pl.chew -= dt; continue; }
      pl.timer -= dt * haste;
      const st = pl.st;
      switch (st.role) {
        case 'sun':
          if (pl.timer <= 0) { pl.timer = st.every; addSun(st.sun, pl.col + 0.5, pl.row + 0.3); pl.kick = 1; }
          break;
        case 'support':
          if (pl.timer <= 0) {
            pl.timer = st.every;
            let healed = false;
            for (const o of allPlants()) {
              const dc = Math.abs(o.col - pl.col), dr = Math.abs(o.row - pl.row);
              const inRange = st.healLane ? (pl.card.id === 'lotus' ? dc <= 1 : dc === 0) : dc <= 1 && dr <= 1;
              if (inRange && o.hp < o.max) { healPlant(o, st.heal); healed = true; }
            }
            if (healed) { pl.kick = 1; ring(pl.col + 0.5, pl.row + 0.5, st.healLane ? 1 : 1.4, '#A5D6A7', 0.5); }
          }
          break;
        case 'bomb':
          if (pl.timer <= 0) explode(pl);
          break;
        case 'shooter':
        case 'slow':
          if (st.aura) {
            if (pl.timer <= 0) {
              const near = G.pests.filter((p) => targetable(p) && Math.hypot(p.col - pl.col, p.y - (pl.row + 0.5)) <= st.aura);
              if (near.length) {
                pl.timer = st.rate; pl.kick = 1;
                for (const p of near) { hurt(p, st.dmg, '#B39DDB'); slow(p, st.slow, st.slowFor); }
                ring(pl.col + 0.5, pl.row + 0.5, st.aura, '#B39DDB', 0.6);
              }
            }
            break;
          }
          if (pl.timer <= 0) shoot(pl);
          break;
      }
    }

    // shots
    for (const s of G.shots) {
      if (s.lob) {
        s.t += dt;
        if (s.t >= s.T) {
          s.done = true;
          for (const p of G.pests) {
            if (!targetable(p) || p.def.fly) continue;
            const d = Math.hypot(p.col - s.tx, p.y - s.ty);
            if (d <= 0.75) hurt(p, d < 0.3 ? s.dmg : s.dmg * s.splash, s.color);
          }
          ring(s.tx + 0.5, s.ty, 0.75, s.color, 0.35);
        }
        continue;
      }
      s.y += s.vy * dt;
      if (s.y < -1) { s.done = true; continue; }
      for (const p of G.pests) {
        if (p.col !== s.col || !targetable(p) || s.hit.has(p) || Math.abs(p.y - s.y) > 0.32) continue;
        s.hit.add(p);
        hurt(p, s.dmg, s.color);
        if (s.slow) slow(p, s.slow, s.slowFor);
        if (s.burn) { p.burnUntil = G.t + 3; p.burnDps = Math.max(p.burnDps, s.burn); }
        if (s.knock) pushBack(p, s.knock);
        if (s.splash) for (const o of G.pests) if (o !== p && targetable(o) && Math.hypot(o.col - p.col, o.y - p.y) < 0.85) hurt(o, s.dmg * s.splash, s.color);
        if (!s.pierce) { s.done = true; break; }
      }
    }
    G.shots = G.shots.filter((s) => !s.done);

    // pests
    for (const p of G.pests) {
      if (p.dead) continue;
      p.flash = Math.max(0, p.flash - dt);
      if (G.t < p.burnUntil) hurt(p, p.burnDps * dt, '#FF7043');
      if (p.dead) continue;
      const mul = slowMul(p);
      if (p.hop > 0) { p.hop -= dt; p.y += (1.15 / 0.5) * dt; continue; }
      const row = Math.floor(p.y + 0.3);
      const pl = !p.def.fly && !p.under && row >= 0 && row < ROWS ? G.plants[p.col][row] : null;
      if (pl && p.def.hop && !p.hopped) { p.hopped = true; p.hop = 0.5; continue; }
      if (pl) {
        p.eating = pl;
        if (pl.st.eat && pl.chew <= 0) {
          pl.chew = pl.st.chew; pl.kick = 1;
          if (p.def.boss) hurt(p, 500 * (pl.st.thorns / 22), '#7CB342');
          else { p.dead = true; G.killed++; text(p.col + 0.5, p.y, 'Gulp!', '#558B2F'); sfx('pestDie'); }
          continue;
        }
        if (mul > 0) {
          let bite = p.def.bite * dt * (mul < 1 ? 0.6 : 1);
          if (pl.shield > 0) { const a = Math.min(pl.shield, bite); pl.shield -= a; bite -= a; }
          pl.hp -= bite;
          if (pl.st.thorns) hurt(p, pl.st.thorns * dt, '#8BC34A');
          if (pl.hp <= 0) { G.plants[pl.col][pl.row] = null; puff(pl.col + 0.5, pl.row + 0.5, '#81C784', 6); p.eating = null; }
        }
      } else {
        p.eating = null;
        p.y += p.def.speed * mul * dt;
        if (p.under && p.y >= DIG_UNTIL) { p.under = false; puff(p.col + 0.5, p.y, '#8D6E63', 8); }
      }
      if (p.y >= ROWS + 0.05 && G.hoses[p.col]) { sprinkler(p.col); continue; }
      if (p.y >= ROWS + 0.2) {
        p.dead = true;
        G.lives -= p.def.boss ? LIVES : 1;
        G.fx.push({ k: 'flash', color: '#EF5350', t: 0, T: 0.5 });
        sfx('lifeLost');
        if (G.lives <= 0) return end(false);
      }
    }
    G.pests = G.pests.filter((p) => !p.dead);

    // effects
    for (const f of G.fx) {
      f.t += dt;
      if (f.k === 'dot') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 3 * dt; }
    }
    G.fx = G.fx.filter((f) => f.t < f.T);
  }

  /** A lane's one-time sprinkler: soaks every pest in the lane (bosses just get pushed back). */
  function sprinkler(col) {
    G.hoses[col] = false;
    for (const p of G.pests) {
      if (p.dead || p.col !== col) continue;
      if (p.def.boss) { hurt(p, 600, '#4FC3F7'); pushBack(p, 3 / 0.35); }
      else { p.under = false; p.dead = true; G.killed++; puff(p.col + 0.5, p.y, '#81D4FA', 8); }
    }
    G.fx.push({ k: 'lane', col, color: '#4FC3F7', t: 0, T: 0.8 });
    text(col + 0.5, ROWS - 0.6, 'Sprinkler!', '#0277BD', true);
    sfx('water');
  }

  function shoot(pl) {
    const st = pl.st;
    const lanes = st.lanes === 5 ? [0, 1, 2, 3, 4] : st.lanes === 3 ? [pl.col - 1, pl.col, pl.col + 1].filter((c) => c >= 0 && c < COLS) : [pl.col];
    const ahead = (c) => pestsIn(c).filter((p) => p.y < pl.row + 0.9);
    if (!lanes.some((c) => ahead(c).length)) { pl.timer = 0; return; }
    pl.timer = st.rate;
    pl.kick = 1;
    const color = pl.card.art.c || '#9CCC65';
    const base = { dmg: st.dmg, color, hit: new Set(), slow: st.slow, slowFor: st.slowFor, burn: st.burn, pierce: st.pierce, splash: st.splash || 0, knock: pl.card.mod === 'heavy' ? 0.25 : 0 };
    if (pl.card.mod === 'lob') {
      const target = ahead(pl.col).filter((p) => !p.def.fly).sort((a, b) => b.y - a.y)[0];
      if (!target) { pl.timer = 0.3; return; }
      const T = 0.7;
      G.shots.push({ ...base, lob: true, col: pl.col, sx: pl.col, sy: pl.row + 0.3, tx: target.col, ty: Math.min(ROWS, target.y + target.def.speed * slowMul(target) * T), t: 0, T });
    } else {
      for (const c of lanes) G.shots.push({ ...base, hit: new Set(), col: c, y: pl.row + 0.3, vy: -7 });
    }
    sfx('shoot');
  }

  function explode(pl) {
    const st = pl.st, a = st.area;
    G.plants[pl.col][pl.row] = null;
    const inArea = (p) => a === 'all' || (a === 'lane' && p.col === pl.col) || (a === 'lanes3' && Math.abs(p.col - pl.col) <= 1) ||
      (a === 'cell3' && Math.abs(p.col - pl.col) <= 1 && Math.abs(p.y - (pl.row + 0.5)) <= 1.5);
    for (const p of G.pests) if (!p.dead && inArea(p)) { p.under = false; hurt(p, st.dmg, '#FF7043'); }
    if (a === 'all') G.fx.push({ k: 'flash', color: '#CE93D8', t: 0, T: 0.7 });
    else if (a === 'cell3') ring(pl.col + 0.5, pl.row + 0.5, 1.6, '#FF8A65', 0.5);
    else for (let c = 0; c < COLS; c++) if (a === 'lane' ? c === pl.col : Math.abs(c - pl.col) <= 1) G.fx.push({ k: 'lane', col: c, color: '#FF8A65', t: 0, T: 0.55 });
    sfx('blast');
  }

  // ---- Drawing --------------------------------------------------------
  function draw() {
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, Hh);
    const fw = cs * COLS;
    // hedge / spawn strip
    c.fillStyle = '#5E8C4A';
    c.fillRect(ox, oy - cs * TOP, fw, cs * TOP);
    c.fillStyle = '#4E7A3D';
    for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(ox + (i + 0.5) * fw / 12, oy - cs * TOP + cs * 0.18, cs * 0.28, 0, Math.PI * 2); c.fill(); }
    // lawn: lanes alternate shades, rows checkered
    for (let col = 0; col < COLS; col++) for (let row = 0; row < ROWS; row++) {
      c.fillStyle = (col + row) % 2 ? '#9CCC65' : '#A8D672';
      c.fillRect(ox + col * cs, oy + row * cs, cs + 0.5, cs + 0.5);
    }
    // little flowers in the grass
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 18; i++) { const x = ox + ((i * 53) % 100) / 100 * fw, y = oy + ((i * 37) % 100) / 100 * ROWS * cs; c.beginPath(); c.arc(x, y, cs * 0.03, 0, 7); c.fill(); }
    // selection hints
    const sel = G.selected >= 0 ? G.cards[G.selected] : null;
    if (sel || G.shovel) {
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2; c.setLineDash([5, 5]);
      for (let col = 0; col < COLS; col++) for (let row = 0; row < ROWS; row++) {
        const occ = !!G.plants[col][row];
        if ((sel && sel.card.type === 'plant' && !occ) || (G.shovel && occ)) c.strokeRect(ox + col * cs + 4, oy + row * cs + 4, cs - 8, cs - 8);
      }
      c.setLineDash([]);
      if (sel && sel.card.type !== 'plant') { c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(ox, oy, fw, ROWS * cs); }
    }
    // fence
    const fy = oy + ROWS * cs;
    c.fillStyle = '#C8A27A';
    c.fillRect(ox, fy + cs * 0.22, fw, cs * 0.1);
    c.fillRect(ox, fy + cs * 0.5, fw, cs * 0.1);
    for (let i = 0; i < COLS * 3; i++) {
      const x = ox + (i + 0.5) * fw / (COLS * 3) - cs * 0.09;
      c.fillStyle = '#F3E3C8'; c.strokeStyle = '#3B2A1E'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(x, fy + cs * BOTTOM); c.lineTo(x, fy + cs * 0.12); c.lineTo(x + cs * 0.09, fy + cs * 0.02); c.lineTo(x + cs * 0.18, fy + cs * 0.12); c.lineTo(x + cs * 0.18, fy + cs * BOTTOM); c.closePath(); c.fill(); c.stroke();
    }
    // lane sprinklers (one use each)
    for (let col = 0; col < COLS; col++) {
      if (!G.hoses[col]) continue;
      const x = px(col), y = fy + cs * 0.4;
      c.fillStyle = '#4FC3F7'; c.strokeStyle = '#3B2A1E'; c.lineWidth = 1.6;
      c.beginPath(); c.arc(x, y, cs * 0.13, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x - cs * 0.04, y - cs * 0.04, cs * 0.035, 0, 7); c.fill();
    }
    // lane flashes
    for (const f of G.fx) if (f.k === 'lane') { c.globalAlpha = 0.45 * (1 - f.t / f.T); c.fillStyle = f.color; c.fillRect(ox + f.col * cs, oy - cs * TOP, cs, (ROWS + TOP) * cs); c.globalAlpha = 1; }
    // plants
    for (const pl of allPlants()) {
      const x = px(pl.col), y = py(pl.row + 0.5);
      const age = G.t - pl.born;
      const pop = Math.min(1, age / 0.25);
      const bob = Math.sin(G.t * 2.2 + pl.col + pl.row) * 0.02 + pl.kick * 0.08;
      const size = cs * 0.95 * (0.6 + 0.4 * pop);
      c.save();
      c.translate(x, y + cs * 0.42);
      c.scale(1 - bob * 0.5, 1 + bob);
      if (pl.st.role === 'bomb') { const sh = Math.sin(G.t * 60) * cs * 0.03; c.translate(sh, 0); }
      if (pl.chew > 0) c.globalAlpha = 0.75;
      if (pl.shield > 0) { c.fillStyle = 'rgba(128,222,234,0.35)'; c.beginPath(); c.arc(0, -cs * 0.45, cs * 0.5, 0, 7); c.fill(); }
      if (pl.glow > 0) { c.fillStyle = `rgba(165,214,167,${pl.glow})`; c.beginPath(); c.arc(0, -cs * 0.45, cs * 0.5, 0, 7); c.fill(); }
      if (imgs[pl.card.id].complete) c.drawImage(imgs[pl.card.id], -size / 2, -size * 0.92, size, size);
      c.restore();
      if (pl.hp < pl.max) bar(x, y + cs * 0.4, pl.hp / pl.max, '#66BB6A');
    }
    // pests
    for (const p of G.pests) {
      const x = px(p.col), y = py(p.y);
      if (p.under) {
        c.fillStyle = 'rgba(93,64,55,0.55)';
        for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(x + Math.sin(i * 2 + G.t * 3) * cs * 0.12, y - i * cs * 0.12, cs * 0.14, cs * 0.08, 0, 0, 7); c.fill(); }
        continue;
      }
      const size = cs * p.def.size;
      const frozen = G.t < p.frozenUntil;
      const wob = frozen ? 0 : Math.sin(G.t * (p.eating ? 14 : 7) + p.phase) * 0.12;
      const lift = p.hop > 0 ? Math.sin((1 - p.hop / 0.5) * Math.PI) * cs * 0.6 : p.def.fly ? cs * 0.18 + Math.sin(G.t * 5 + p.phase) * cs * 0.06 : 0;
      c.save();
      if (p.def.fly) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.beginPath(); c.ellipse(x, y + size * 0.35, size * 0.3, size * 0.1, 0, 0, 7); c.fill(); }
      c.translate(x, y - lift);
      c.rotate(wob);
      const img = imgs['p:' + p.kind];
      if (img.complete) c.drawImage(img, -size / 2, -size / 2, size, size);
      if (p.flash > 0) { c.globalAlpha = 0.5; c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, size * 0.36, 0, 7); c.fill(); c.globalAlpha = 1; }
      if (frozen) { c.fillStyle = 'rgba(129,212,250,0.45)'; c.beginPath(); c.arc(0, 0, size * 0.45, 0, 7); c.fill(); }
      else if (G.t < p.slowUntil) { c.strokeStyle = 'rgba(79,195,247,0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, size * 0.42, 0, 7); c.stroke(); }
      if (G.t < p.burnUntil) { c.fillStyle = 'rgba(255,112,67,0.3)'; c.beginPath(); c.arc(0, 0, size * 0.4, 0, 7); c.fill(); }
      c.restore();
      if (p.hp < p.max || p.def.boss) bar(x, y - lift - size * 0.52, Math.max(0, p.hp / p.max), p.def.boss ? '#EF5350' : '#FFA726', p.def.boss ? 1.6 : 1);
    }
    // shots
    for (const s of G.shots) {
      let x, y, r = cs * 0.09;
      if (s.lob) {
        const k = s.t / s.T;
        x = px(s.sx + (s.tx - s.sx) * k); y = py(s.sy + (s.ty - s.sy) * k) - Math.sin(k * Math.PI) * cs * 1.2; r = cs * 0.14;
      } else { x = px(s.col); y = py(s.y); }
      c.fillStyle = s.color; c.strokeStyle = '#3B2A1E'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke();
    }
    // effects
    for (const f of G.fx) {
      const k = f.t / f.T;
      if (f.k === 'ring') { c.strokeStyle = f.color; c.globalAlpha = 1 - k; c.lineWidth = 3; c.beginPath(); c.arc(ox + f.x * cs, py(f.y), f.r * cs * (0.3 + 0.7 * k), 0, 7); c.stroke(); }
      else if (f.k === 'dot') { c.fillStyle = f.color; c.globalAlpha = 1 - k; c.beginPath(); c.arc(ox + f.x * cs, py(f.y), f.r * cs, 0, 7); c.fill(); }
      else if (f.k === 'text') {
        c.globalAlpha = 1 - k * k; c.fillStyle = f.color;
        c.font = `800 ${Math.round(cs * (f.big ? 0.32 : 0.24))}px Nunito, system-ui, sans-serif`; c.textAlign = 'center';
        c.fillText(f.str, ox + f.x * cs, py(f.y) - k * cs * 0.6);
      } else if (f.k === 'flash') { c.globalAlpha = 0.25 * (1 - k); c.fillStyle = f.color; c.fillRect(0, 0, W, Hh); }
      c.globalAlpha = 1;
    }
  }
  function bar(x, y, f, color, wide = 1) {
    const w = cs * 0.6 * wide, h = Math.max(4, cs * 0.07);
    ctx.fillStyle = 'rgba(59,42,30,0.55)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, w * f, h);
  }

  // ---- HUD ----------------------------------------------------------------
  let lastHud = '';
  function hud() {
    const total = plan.waves.reduce((a, w) => a + w.length, 0);
    const spawned = plan.waves.slice(0, Math.max(0, G.wave)).reduce((a, w) => a + w.length, 0) + (G.wave >= 0 ? plan.waves[G.wave].length - G.queue.length : 0);
    const label = G.wave < 0 ? `Pests in ${Math.ceil(G.nextWaveAt - G.t)}s` : `Wave ${G.wave + 1}/${plan.waves.length}`;
    const cards = G.cards.map((c) => `${G.sun >= c.st.cost ? 1 : 0}${Math.ceil(Math.max(0, c.ready - G.t) * 4)}`).join('');
    const key = `${Math.floor(G.sun)}|${label}|${G.lives}|${spawned}|${cards}|${G.selected}|${G.shovel}`;
    if (key === lastHud) return;
    lastHud = key;
    $('b-sun').textContent = Math.floor(G.sun);
    $('b-wave-label').textContent = label;
    $('b-wavebar').style.width = `${(spawned / total) * 100}%`;
    $('b-lives').innerHTML = Array.from({ length: LIVES }, (_, i) => `<span class="${i < G.lives ? 'on' : ''}">♥</span>`).join('');
    G.cards.forEach((c, i) => {
      const b = trayBtns[i];
      const left = Math.max(0, c.ready - G.t);
      b.classList.toggle('poor', G.sun < c.st.cost);
      b.classList.toggle('cooling', left > 0);
      b.classList.toggle('sel', G.selected === i);
      b.querySelector('.b-cd').style.height = `${(left / c.st.cd) * 100}%`;
    });
    shovelBtn.classList.toggle('sel', G.shovel);
    const hint = $('b-hint');
    const sel = G.selected >= 0 ? G.cards[G.selected] : null;
    hint.hidden = !sel && !G.shovel;
    if (G.shovel) hint.textContent = 'Tap a plant to dig it up';
    else if (sel) hint.textContent = sel.card.type === 'plant' ? `Tap an empty square for ${sel.card.name}` : sel.st.target === 'lane' ? `Tap a lane for ${sel.card.name}` : sel.st.target === 'area' ? `Tap where to use ${sel.card.name}` : `Tap the field to use ${sel.card.name}`;
  }

  // ---- Input ----------------------------------------------------------------
  host.querySelector('#b-tray').addEventListener('click', (e) => {
    const b = e.target.closest('.b-card');
    if (!b || G.over) return;
    if (b.dataset.shovel !== undefined) { G.shovel = !G.shovel; G.selected = -1; sfx('tap'); hud(); return; }
    const i = +b.dataset.i;
    const c = G.cards[i];
    G.shovel = false;
    if (G.selected === i) G.selected = -1;
    else if (G.t < c.ready) { sfx('error'); return; }
    else G.selected = i;
    sfx('tap');
    hud();
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (G.over || G.paused) return;
    const r = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left - ox) / cs);
    const row = Math.floor((e.clientY - r.top - oy) / cs);
    if (col < 0 || col >= COLS) return;
    if (G.shovel) {
      if (row >= 0 && row < ROWS && G.plants[col][row]) { G.plants[col][row] = null; puff(col + 0.5, row + 0.6, '#8D6E63', 6); sfx('place'); }
      G.shovel = false; hud(); return;
    }
    if (G.selected < 0) return;
    const c = G.cards[G.selected];
    const rr = Math.max(0, Math.min(ROWS - 1, row));
    if (c.card.type === 'plant' && (row < 0 || row >= ROWS)) return;
    if (place(G.selected, col, c.card.type === 'plant' ? row : rr)) { G.selected = -1; hud(); }
  });

  $('b-banner').addEventListener('click', () => {
    if (G.wave < 0) { G.nextWaveAt = G.t; $('b-banner').hidden = true; }
  });
  $('b-speed').addEventListener('click', () => { G.speed = G.speed === 1 ? 2 : 1; $('b-speed').textContent = `${G.speed}×`; sfx('tap'); });
  const setPaused = (p) => { if (G.over) return; G.paused = p; $('b-pausemenu').hidden = !p; };
  $('b-pause').addEventListener('click', () => { setPaused(true); sfx('tap'); });
  $('b-resume').addEventListener('click', () => { setPaused(false); sfx('tap'); });
  $('b-quit').addEventListener('click', () => { G.paused = false; end(false, true); });
  const onVis = () => { if (document.hidden) setPaused(true); };
  document.addEventListener('visibilitychange', onVis);

  // ---- Loop ---------------------------------------------------------------
  let raf = 0, last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // rAF time can predate `last`
    last = now;
    if (!G.paused && !G.over) {
      const steps = G.speed;
      for (let i = 0; i < steps && !G.over; i++) step(dt);
      if (G.wave < 0 && bannerTimer <= 0) {
        const b = $('b-banner');
        b.hidden = false; b.dataset.skip = '1';
        b.textContent = `Pests arrive in ${Math.ceil(G.nextWaveAt - G.t)}s · tap to start now`;
      } else if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) $('b-banner').hidden = true;
      }
    }
    draw();
    hud();
    if (!G.over) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function end(won, quit = false) {
    if (G.over) return;
    G.over = true;
    sfx(won ? 'win' : 'lose');
    setTimeout(() => { cleanup(); onEnd({ won, quit, pests: G.killed, stage }); }, won ? 900 : 600);
  }
  function cleanup() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
  }

  return { stop() { G.over = true; cleanup(); } };
}

/** Readable summary of a stage for the stage picker. */
export function stageInfo(n) {
  const p = stagePlan(n);
  return { waves: p.waves.length, boss: p.boss, pests: p.kinds.map((k) => ({ kind: k, ...PESTS[k] })) };
}
export { esc };
