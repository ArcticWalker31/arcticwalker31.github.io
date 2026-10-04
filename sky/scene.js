// scene.js — the illustrated, animated sky at the top of the app.
//
// Layers (back to front):
//   1. CSS gradient sky on the container (colors from the palette)
//   2. SVG: sun or moon, clouds, far hill, trees, mid hill, near hill, fog
//   3. Canvas: rain / drizzle / snow / sleet, stars + shooting stars, lightning bolts
//   4. A flash overlay for lightning
//
// Everything is driven by update(state). Animation pauses when the page is
// hidden, and is replaced by a still frame when the system asks for reduced
// motion.

const SVG_NS = 'http://www.w3.org/2000/svg';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------------------
// Palettes: the sky drives the whole scene's colors.
// ---------------------------------------------------------------------------

const PALETTES = {
  clear:   { top: '#2E8FE0', bottom: '#8FD3FA', far: '#5DB8EA', mid: '#3D9BD8', near: '#2380C6', tree: '#2A6FB0', cloud: '#FFFFFF', body: '#FFF6D6' },
  partly:  { top: '#4096D6', bottom: '#A9D6F2', far: '#6AAED9', mid: '#4E93C4', near: '#377AAE', tree: '#2F6B9E', cloud: '#FFFFFF', body: '#FFF6D6' },
  cloudy:  { top: '#6F8297', bottom: '#B3C0CC', far: '#8C9BAA', mid: '#71808F', near: '#5A6875', tree: '#4D5A66', cloud: '#E6EBF0', body: '#FFFFFF' },
  rain:    { top: '#4C5D70', bottom: '#8695A4', far: '#66768A', mid: '#4F5E70', near: '#3D4A5A', tree: '#33404E', cloud: '#B5C0CB', body: '#FFFFFF' },
  storm:   { top: '#333B49', bottom: '#5E6776', far: '#4A5262', mid: '#3A4150', near: '#2C323E', tree: '#232832', cloud: '#7D8796', body: '#FFFFFF' },
  snow:    { top: '#7F95AD', bottom: '#CFDAE5', far: '#E8EEF4', mid: '#D3DDE7', near: '#BFCBD8', tree: '#5F7186', cloud: '#F2F5F8', body: '#FFFFFF' },
  fog:     { top: '#7F8993', bottom: '#C3C9CF', far: '#A9B0B7', mid: '#959DA5', near: '#7F8790', tree: '#6D767F', cloud: '#E2E6EA', body: '#FFFFFF' },
  dawn:    { top: '#4D63A0', bottom: '#F4A881', far: '#8A789F', mid: '#665C86', near: '#4A4268', tree: '#3A3454', cloud: '#FFD9C4', body: '#FFE0A8' },
  dusk:    { top: '#33427F', bottom: '#F08A5D', far: '#74608E', mid: '#524675', near: '#383058', tree: '#2A2545', cloud: '#F7C1A6', body: '#FFD39A' },
  night:   { top: '#0B1630', bottom: '#253660', far: '#1F2E52', mid: '#172443', near: '#101A33', tree: '#0B1226', cloud: '#5B6888', body: '#F4F1E2' },
  nightCloudy: { top: '#1A2130', bottom: '#323B4D', far: '#29313F', mid: '#202734', near: '#171C26', tree: '#11151D', cloud: '#4A5466', body: '#E8E6DA' },
  nightSnow:   { top: '#2A3448', bottom: '#4E5A70', far: '#B8C3D1', mid: '#9AA6B6', near: '#7D8A9B', tree: '#3A4556', cloud: '#6E7A8E', body: '#F4F1E2' },
};

/** Choose a palette from time of day and the condition kind. */
export function pickPalette(phase, kind) {
  const sunny = kind === 'clear' || kind === 'partly';
  if (phase === 'night') return kind === 'snow' ? 'nightSnow' : sunny ? 'night' : 'nightCloudy';
  if ((phase === 'dawn' || phase === 'dusk') && sunny) return phase;
  if (kind === 'drizzle' || kind === 'sleet') return 'rain';
  return PALETTES[kind] ? kind : 'cloudy';
}

// ---------------------------------------------------------------------------
// Color schemes. Each scheme defines a clear DAY and clear NIGHT look; every
// other weather/time palette is derived by blending the scheme toward the
// classic palette for that condition, so rain still looks rainy and dusk
// still looks like dusk in every scheme. `weight` = how much of the classic
// condition color to blend in.
// ---------------------------------------------------------------------------

export const THEMES = {
  classic: { name: 'Classic' },
  meadow: {
    name: 'Meadow',
    day:   { top: '#3C9BE0', bottom: '#BDE5F7', far: '#9CCB86', mid: '#79B36A', near: '#5A9A55', tree: '#3F7A45', cloud: '#FFFFFF', body: '#FFF4C9' },
    night: { top: '#0E1B2C', bottom: '#22384A', far: '#1F3A2E', mid: '#183024', near: '#11241B', tree: '#0B1912', cloud: '#55687A', body: '#F4F1E2' },
  },
  earthy: {
    name: 'Earthy',
    day:   { top: '#7C8DAB', bottom: '#EFE6CC', far: '#A9BC92', mid: '#86A67E', near: '#60935D', tree: '#493B2A', cloud: '#FEFFEA', body: '#F6C27A' },
    night: { top: '#1D1A24', bottom: '#3A3240', far: '#3A3A2E', mid: '#2E2D24', near: '#22211A', tree: '#17150F', cloud: '#5E5A66', body: '#FEFFEA' },
  },
  pastel: {
    name: 'Pastel',
    day:   { top: '#8E8CD8', bottom: '#F7C9CC', far: '#CDB0DC', mid: '#AD90CC', near: '#8F74B8', tree: '#6F589C', cloud: '#FFF6F8', body: '#FFE9B8' },
    night: { top: '#1E1A3A', bottom: '#45386A', far: '#3B315E', mid: '#2F284E', near: '#231E3D', tree: '#18142C', cloud: '#6D6292', body: '#FFF3DC' },
  },
  ocean: {
    name: 'Ocean',
    day:   { top: '#0F7C8C', bottom: '#86D9D2', far: '#52B5AB', mid: '#2F978B', near: '#1C786C', tree: '#135C54', cloud: '#F0FFFD', body: '#FFF3C4' },
    night: { top: '#061C24', bottom: '#12394A', far: '#0F3540', mid: '#0B2A33', near: '#082028', tree: '#05161C', cloud: '#3F6672', body: '#E8F4F2' },
  },
  mono: {
    name: 'Mono',
    gray: true, // weather variants are blended in grayscale
    day:   { top: '#4A4F57', bottom: '#B9BDC3', far: '#8D9198', mid: '#6E737B', near: '#50555D', tree: '#33373D', cloud: '#F2F3F5', body: '#FFFFFF' },
    night: { top: '#0E0F11', bottom: '#2A2C30', far: '#26282C', mid: '#1C1E21', near: '#141518', tree: '#0B0C0E', cloud: '#55585E', body: '#F2F2F2' },
  },
};

const WEIGHT = { clear: 0, partly: 0.12, cloudy: 0.55, rain: 0.7, storm: 0.8, snow: 0.75, fog: 0.7, dawn: 0.6, dusk: 0.6, night: 0, nightCloudy: 0.5, nightSnow: 0.6 };

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, w) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * w)); };
const grayHex = (h) => { const [r, g, b] = hexToRgb(h); const y = 0.299 * r + 0.587 * g + 0.114 * b; return rgbToHex([y, y, y]); };

/** Final colors for a palette name ('clear', 'rain', 'night', …) in a scheme. */
export function paletteColors(name, themeId = 'classic') {
  const classic = PALETTES[name];
  const theme = THEMES[themeId];
  if (!theme?.day) return classic;
  const isNight = name.startsWith('night');
  const base = isNight ? theme.night : theme.day;
  const w = WEIGHT[name] ?? 0.6;
  const out = {};
  for (const k of Object.keys(classic)) {
    const target = theme.gray ? grayHex(classic[k]) : classic[k];
    // The sun/moon keeps the scheme's own color.
    out[k] = k === 'body' ? base.body : mixHex(base[k], target, w);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Static landscape geometry (viewBox 400×300, bottom-anchored).
// Trees sit between the far and mid hills so their trunks are hidden.
// ---------------------------------------------------------------------------

const HILL_FAR = 'M0 196 C 70 168 150 170 230 186 S 350 176 400 160 V300 H0Z';
const HILL_MID = 'M0 222 C 70 200 150 204 220 218 S 340 232 400 206 V300 H0Z';
const HILL_NEAR = 'M0 252 C 100 228 200 246 290 256 S 380 246 400 240 V300 H0Z';
const TREES = [
  { x: 96, y: 198, r: 13, h: 18 },
  { x: 132, y: 190, r: 20, h: 24 },
  { x: 168, y: 200, r: 10, h: 14 },
  { x: 276, y: 206, r: 11, h: 14 },
  { x: 306, y: 196, r: 18, h: 22 },
];

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

/** A wavy "halo" polygon around the sun, like the reference design. */
function wavyCircle(r, waves, amp) {
  const pts = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const rr = r + Math.sin(a * waves) * amp;
    pts.push(`${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** One puffy cloud shape centered on 0,0, about 110×40. */
function cloudShape(parent) {
  const g = el('g', {}, parent);
  for (const [cx, cy, r] of [[-30, 4, 18], [-6, -10, 24], [22, -2, 20], [42, 8, 13]]) el('circle', { cx, cy, r }, g);
  el('rect', { x: -48, y: 4, width: 104, height: 18, rx: 9 }, g);
  return g;
}

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------

export function createScene(root) {
  root.classList.add('scene');
  root.innerHTML = '';

  // ----- SVG layer -----
  const svg = el('svg', { class: 'scene-svg', viewBox: '0 0 400 300', preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true' });
  const defs = el('defs', {}, svg);
  defs.innerHTML = `
    <filter id="fogBlur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
    <mask id="moonMask"><rect x="-40" y="-40" width="80" height="80" fill="white"/><circle cx="9" cy="-7" r="17" fill="black"/></mask>`;

  const bodyG = el('g', { class: 'body' }, svg);        // sun or moon
  const cloudsG = el('g', { class: 'clouds' }, svg);
  el('path', { d: HILL_FAR, class: 'hill-far' }, svg);
  const treesG = el('g', { class: 'trees' }, svg);
  for (const t of TREES) {
    const g = el('g', { class: 'tree' }, treesG);
    g.style.animationDelay = `${rand(-3, 0).toFixed(2)}s`;
    el('rect', { x: t.x - 1.6, y: t.y - t.h + t.r, width: 3.2, height: t.h, rx: 1.5 }, g);
    // Canopy: one big circle plus two smaller ones for a fuller crown.
    const cy = t.y - t.h + t.r - t.r * 0.7;
    el('circle', { cx: t.x, cy, r: t.r }, g);
    el('circle', { cx: t.x - t.r * 0.55, cy: cy + t.r * 0.35, r: t.r * 0.62 }, g);
    el('circle', { cx: t.x + t.r * 0.55, cy: cy + t.r * 0.3, r: t.r * 0.66 }, g);
  }
  el('path', { d: HILL_MID, class: 'hill-mid' }, svg);
  el('path', { d: HILL_NEAR, class: 'hill-near' }, svg);
  const fogG = el('g', { class: 'fog', filter: 'url(#fogBlur)' }, svg);
  for (const [y, w, d] of [[150, 300, 26], [200, 360, 34], [245, 320, 30]]) {
    const e = el('ellipse', { cx: 200, cy: y, rx: w / 2, ry: 18 }, fogG);
    e.style.animationDuration = `${d}s`;
    e.style.animationDelay = `${rand(-d, 0).toFixed(1)}s`;
  }

  // ----- Canvas + flash -----
  const canvas = document.createElement('canvas');
  canvas.className = 'scene-fx';
  const flash = document.createElement('div');
  flash.className = 'scene-flash';
  root.append(svg, canvas, flash);
  const ctx = canvas.getContext('2d');

  let state = null;
  let particles = [];
  let stars = [];
  let shooting = null;
  let nextShoot = 0, nextBolt = 0;
  let bolt = null;
  let raf = 0, last = 0;
  let W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = root.clientWidth;
    H = root.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state) seedParticles();
  }

  // ----- Sun / moon -----
  function drawBody() {
    bodyG.innerHTML = '';
    const { phase, kind, sunPos } = state;
    const showSun = phase !== 'night' && (kind === 'clear' || kind === 'partly' || kind === 'cloudy');
    const showMoon = phase === 'night' && (kind === 'clear' || kind === 'partly');
    if (showSun) {
      // Follow the real sun: left at sunrise, high at noon, right at sunset.
      const p = clamp(sunPos ?? 0.5, 0, 1);
      // Stays in the right-hand sky so its glow never sits behind the
      // temperature and place name on the left.
      const x = 262 + 38 * p;
      const y = 158 - Math.sin(Math.PI * p) * 82;
      const g = el('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, class: kind === 'cloudy' ? 'sun dim' : 'sun' }, bodyG);
      el('polygon', { points: wavyCircle(46, 9, 3.5), class: 'halo halo-2' }, g);
      el('polygon', { points: wavyCircle(36, 8, 3), class: 'halo halo-1' }, g);
      el('circle', { r: 24, class: 'core' }, g);
    } else if (showMoon) {
      const g = el('g', { transform: 'translate(290 70)', class: 'moon' }, bodyG);
      el('circle', { r: 30, class: 'glow' }, g);
      el('circle', { r: 17, class: 'core', mask: 'url(#moonMask)' }, g);
    }
  }

  // ----- Clouds -----
  function drawClouds() {
    cloudsG.innerHTML = '';
    const { kind, cloud = 0, wind = 0 } = state;
    let count = Math.round((cloud / 100) * 6);
    if (kind === 'partly') count = clamp(count, 2, 4);
    if (['cloudy', 'rain', 'drizzle', 'sleet', 'storm', 'snow'].includes(kind)) count = clamp(count, 5, 7);
    if (kind === 'clear') count = Math.min(count, 1);
    if (kind === 'fog') count = 2;
    const duration = clamp(150 - wind * 5, 35, 150); // windier = faster drift
    for (let i = 0; i < count; i++) {
      const outer = el('g', { class: 'cloud' }, cloudsG);
      const y = rand(28, kind === 'partly' || kind === 'clear' ? 120 : 150);
      const s = rand(0.6, 1.3);
      outer.style.setProperty('--y', `${y}px`);
      outer.style.setProperty('--s', s);
      outer.style.animationDuration = `${(duration * rand(0.8, 1.25)).toFixed(1)}s`;
      outer.style.animationDelay = `${(-duration * (i / count) - rand(0, 10)).toFixed(1)}s`;
      outer.style.opacity = (['storm', 'rain'].includes(kind) ? rand(0.85, 1) : rand(0.75, 0.95)).toFixed(2);
      cloudShape(outer);
    }
  }

  // ----- Particles (canvas) -----
  function seedParticles() {
    const { kind, intensity = 0, phase } = state;
    const area = (W * H) / (390 * 420);
    particles = [];
    const add = (type, n) => {
      for (let i = 0; i < n; i++) particles.push(newParticle(type, true));
    };
    if (kind === 'rain' || kind === 'storm') add('rain', Math.round((80 + 240 * intensity) * area));
    if (kind === 'drizzle') add('drizzle', Math.round((60 + 120 * intensity) * area));
    if (kind === 'snow') add('snow', Math.round((60 + 180 * intensity) * area));
    if (kind === 'sleet') { add('rain', Math.round(90 * area)); add('snow', Math.round(60 * area)); }

    stars = [];
    if (phase === 'night' && (kind === 'clear' || kind === 'partly')) {
      const n = Math.round((kind === 'clear' ? 90 : 45) * area);
      for (let i = 0; i < n; i++) {
        stars.push({ x: rand(0, W), y: rand(0, H * 0.55), r: rand(0.5, 1.6), t: rand(0, 6.28), s: rand(0.8, 2.6) });
      }
    }
  }

  function newParticle(type, anywhere) {
    const y = anywhere ? rand(-H, H) : rand(-60, -10);
    const x = rand(-40, W + 40);
    if (type === 'rain') return { type, x, y, len: rand(10, 20), v: rand(620, 900), a: rand(0.35, 0.65) };
    if (type === 'drizzle') return { type, x, y, len: rand(5, 9), v: rand(320, 440), a: rand(0.3, 0.5) };
    return { type, x, y, r: rand(1, 3.2), v: rand(35, 90), phase: rand(0, 6.28), a: rand(0.6, 0.95) };
  }

  function frame(now) {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    ctx.clearRect(0, 0, W, H);
    const wind = state.wind ?? 0;
    const slant = clamp(wind / 25, 0, 0.6); // rain leans with the wind

    // Stars twinkle; occasional shooting star.
    for (const s of stars) {
      s.t += dt * s.s;
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(s.t));
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (stars.length && !reducedMotion.matches) {
      if (!shooting && now > nextShoot) {
        shooting = { x: rand(W * 0.1, W * 0.7), y: rand(10, H * 0.25), life: 0 };
        nextShoot = now + rand(5000, 12000);
      }
      if (shooting) {
        shooting.life += dt;
        const p = shooting.life / 0.9;
        const hx = shooting.x + p * 220, hy = shooting.y + p * 90;
        const grad = ctx.createLinearGradient(hx - 70, hy - 29, hx, hy);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(255,255,255,${(1 - p).toFixed(2)})`);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(hx - 70, hy - 29);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        if (p >= 1) shooting = null;
      }
    }

    // Precipitation.
    ctx.lineCap = 'round';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.type === 'snow') {
        p.phase += dt * 1.5;
        p.y += p.v * dt;
        p.x += (Math.sin(p.phase) * 18 + wind * 1.2) * dt;
        ctx.globalAlpha = p.a;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        p.y += p.v * dt;
        p.x += p.v * slant * dt;
        ctx.globalAlpha = p.a;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = p.type === 'rain' ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.len * slant, p.y - p.len);
        ctx.stroke();
      }
      if (p.y > H + 20 || p.x > W + 60 || p.x < -60) particles[i] = newParticle(p.type, false);
    }

    // Lightning: a jagged bolt plus a sky flash every few seconds.
    if (state.kind === 'storm' && !reducedMotion.matches) {
      if (now > nextBolt) {
        nextBolt = now + rand(2500, 8000);
        bolt = { pts: makeBolt(), until: now + 180 };
        flash.classList.remove('on');
        void flash.offsetWidth;
        flash.classList.add('on');
      }
      if (bolt && now < bolt.until) {
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = '#FFFBE6';
        ctx.lineWidth = 2.2;
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        bolt.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;
  }

  function makeBolt() {
    let x = rand(W * 0.2, W * 0.8), y = 0;
    const pts = [[x, y]];
    while (y < H * 0.55) {
      y += rand(12, 28);
      x += rand(-18, 18);
      pts.push([x, y]);
    }
    return pts;
  }

  function loop(now) {
    frame(now);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    stop();
    root.classList.remove('paused');
    if (reducedMotion.matches) {
      frame(performance.now()); // one still frame
      return;
    }
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    root.classList.add('paused');
  }

  // ----- Public API -----
  function update(next) {
    state = next;
    const pal = paletteColors(pickPalette(next.phase, next.kind), next.theme);
    const s = root.style;
    s.setProperty('--sky-top', pal.top);
    s.setProperty('--sky-bottom', pal.bottom);
    s.setProperty('--hill-far', pal.far);
    s.setProperty('--hill-mid', pal.mid);
    s.setProperty('--hill-near', pal.near);
    s.setProperty('--tree', pal.tree);
    s.setProperty('--cloud', pal.cloud);
    s.setProperty('--body', pal.body);
    // Trees sway harder and faster as the wind picks up.
    const wind = next.wind ?? 0;
    s.setProperty('--sway', `${clamp(1 + wind / 3, 1, 9).toFixed(1)}deg`);
    s.setProperty('--sway-dur', `${clamp(4.2 - wind / 10, 1.1, 4.2).toFixed(2)}s`);
    root.classList.toggle('foggy', next.kind === 'fog');

    drawBody();
    drawClouds();
    resize();
    if (!document.hidden) start();
    return pal;
  }

  document.addEventListener('visibilitychange', () => {
    if (!state) return;
    if (document.hidden) stop();
    else start();
  });
  reducedMotion.addEventListener?.('change', () => state && start());
  new ResizeObserver(() => { if (state) { resize(); if (reducedMotion.matches) frame(performance.now()); } }).observe(root);

  return { update };
}
