// art.js — storybook-style vector art for every card, pest and growth stage.
// Everything is drawn on a 100×100 canvas and returned as SVG markup, so the
// same drawings work on cards (HTML) and in battles (canvas images).

const INK = '#3B2A1E';
const O = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;
const O1 = `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;

/** Lighten (+) or darken (−) a hex color by amt (−1…1). */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)));
  return '#' + ch.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
const LEAF = '#6DB55B', LEAF_D = '#4E9446', STEM = '#5E9E4B', SOIL = '#8B5E3C';

const soil = () => `<ellipse cx="50" cy="90" rx="34" ry="8" fill="${SOIL}" ${O}/><ellipse cx="44" cy="88" rx="10" ry="2.2" fill="${shade(SOIL, 0.25)}"/>`;
const leaf = (x, y, rot, s = 1, c = LEAF) =>
  `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 0 C 6 -10 18 -12 24 -4 C 16 4 6 6 0 0 Z" fill="${c}" ${O1}/>`;
const shine = (x, y, r = 3) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.6}" fill="#fff" opacity="0.55"/>`;

// ---------------------------------------------------------------------------
// Plant templates
// ---------------------------------------------------------------------------
const PLANT = {
  root({ c, shape }) {
    const leaves = `${leaf(50, 52, -110, 1.1)}${leaf(50, 52, -70, 1.1, LEAF_D)}${leaf(50, 54, -140, 0.9)}${leaf(50, 54, -40, 0.9, LEAF_D)}`;
    let body;
    if (shape === 'carrot') body = `<path d="M38 56 Q50 50 62 56 L52 96 Q50 99 48 96 Z" fill="${c}" ${O}/><path d="M43 66 h6 M47 76 h6 M45 86 h5" stroke="${shade(c, -0.3)}" stroke-width="2" stroke-linecap="round"/>`;
    else if (shape === 'potato') body = `<ellipse cx="50" cy="74" rx="20" ry="15" fill="${c}" ${O}/><circle cx="43" cy="70" r="1.6" fill="${shade(c, -0.35)}"/><circle cx="56" cy="78" r="1.6" fill="${shade(c, -0.35)}"/><circle cx="52" cy="67" r="1.3" fill="${shade(c, -0.35)}"/>`;
    else if (shape === 'bulb') body = `<path d="M50 56 C 70 64 70 90 50 92 C 30 90 30 64 50 56 Z" fill="${c}" ${O}/><path d="M50 60 C 58 70 58 84 50 90 M50 60 C 42 70 42 84 50 90" fill="none" stroke="${shade(c, -0.25)}" stroke-width="1.6"/>`;
    else body = `<circle cx="50" cy="74" r="17" fill="${c}" ${O}/><path d="M50 91 L50 98" ${O}/>`;
    return `${soil()}${leaves}${body}${shine(43, 68, 4)}`;
  },
  pod({ c }) {
    return `${soil()}<path d="M50 88 C 48 70 54 50 50 28" fill="none" stroke="${STEM}" stroke-width="4" stroke-linecap="round"/>
      ${leaf(50, 60, -150, 0.9)}${leaf(50, 46, -30, 0.9, LEAF_D)}
      <path d="M30 52 C 40 40 64 36 72 42 C 66 56 44 64 30 52 Z" fill="${c}" ${O}/>
      <circle cx="42" cy="50" r="5" fill="${shade(c, 0.25)}" ${O1}/><circle cx="52" cy="47" r="5" fill="${shade(c, 0.25)}" ${O1}/><circle cx="62" cy="45" r="4.5" fill="${shade(c, 0.25)}" ${O1}/>
      <path d="M58 30 q8 -6 10 2" fill="none" stroke="${STEM}" stroke-width="2.5" stroke-linecap="round"/>`;
  },
  leafy({ c, style }) {
    if (style === 'cabbage') {
      return `${soil()}<circle cx="50" cy="66" r="24" fill="${shade(c, -0.15)}" ${O}/><circle cx="50" cy="64" r="16" fill="${shade(c, 0.15)}" ${O1}/>
        <path d="M50 48 C 44 58 44 70 50 80 M38 56 C 44 62 44 70 40 78 M62 56 C 56 62 56 70 60 78" fill="none" stroke="${shade(c, -0.25)}" stroke-width="1.6"/>${shine(43, 56, 4)}`;
    }
    const ruff = style === 'kale' ? 0.12 : 0.05;
    let s = soil();
    for (const [x, rot, sc, dk] of [[50, -160, 1.4, 1], [50, -20, 1.4, 1], [50, -125, 1.3, 0], [50, -55, 1.3, 0], [50, -90, 1.3, 1]]) {
      s += `<path transform="translate(${x} 80) rotate(${rot}) scale(${sc})" d="M0 0 C 4 -12 18 -16 26 -6 C ${22 - ruff * 40} 2 ${10} 6 0 0 Z" fill="${dk ? shade(c, -0.12) : c}" ${O1}/>`;
    }
    return s + shine(48, 52, 3);
  },
  herb({ c, style }) {
    let s = soil();
    for (const [x, h] of [[38, 44], [50, 34], [62, 44]]) {
      s += `<path d="M${x} 88 L${x} ${h}" stroke="${STEM}" stroke-width="2.6" stroke-linecap="round"/>`;
      for (let y = h + 4; y < 82; y += 10) {
        if (style === 'needle') s += `<path d="M${x} ${y} l-7 -4 M${x} ${y} l7 -4" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
        else {
          const r = style === 'round' ? 5.5 : 4.5;
          s += `<ellipse cx="${x - 6}" cy="${y}" rx="${r + 1}" ry="${r - 1}" fill="${c}" ${O1}/><ellipse cx="${x + 6}" cy="${y - 3}" rx="${r + 1}" ry="${r - 1}" fill="${shade(c, -0.12)}" ${O1}/>`;
        }
      }
    }
    return s;
  },
  clover({ c }) {
    const heart = (rot) => `<path transform="translate(50 50) rotate(${rot})" d="M0 0 C -14 -6 -14 -24 0 -18 C 14 -24 14 -6 0 0 Z" fill="${c}" ${O1}/>`;
    return `${soil()}<path d="M50 88 L50 52" stroke="${STEM}" stroke-width="3" stroke-linecap="round"/>${heart(0)}${heart(90)}${heart(180)}${heart(270)}<circle cx="50" cy="50" r="3" fill="${shade(c, 0.4)}"/>`;
  },
  flower({ c, center, petals = 8, style }) {
    let s = soil() + `<path d="M50 88 C 48 72 52 60 50 46" fill="none" stroke="${STEM}" stroke-width="3.4" stroke-linecap="round"/>${leaf(50, 74, -150, 0.9)}${leaf(50, 66, -30, 0.9, LEAF_D)}`;
    if (style === 'tulip') return s + `<path d="M36 34 C 36 52 64 52 64 34 L58 40 L50 28 L42 40 Z" fill="${c}" ${O}/>${shine(43, 40, 3)}`;
    if (style === 'spike') {
      for (let i = 0; i < 6; i++) s += `<ellipse cx="${50 + (i % 2 ? 4 : -4)}" cy="${44 - i * 5}" rx="5" ry="4" fill="${shade(c, i * 0.06)}" ${O1}/>`;
      return s;
    }
    if (style === 'rose') {
      return s + `<circle cx="50" cy="36" r="15" fill="${c}" ${O}/><path d="M50 26 C 60 28 60 42 50 44 C 42 42 42 32 50 32 C 55 33 55 38 50 39" fill="none" stroke="${center}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M54 62 l5 -3 M45 70 l-5 -3" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
    }
    if (style === 'bell') {
      return s.replace('C 48 72 52 60 50 46', 'C 48 70 56 50 62 40') + `<path d="M52 40 C 52 56 74 56 74 40 C 70 34 56 34 52 40 Z" fill="${c}" ${O}/><path d="M56 52 l2 4 M63 53 v5 M70 52 l-2 4" stroke="${center}" stroke-width="2" stroke-linecap="round"/>`;
    }
    const cy = 38;
    const R = style === 'big' ? 22 : style === 'fluffy' ? 18 : style === 'lotus' ? 20 : 17;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * 360;
      if (style === 'lotus') s += `<path transform="translate(50 ${cy + 6}) rotate(${a / 2 - 90})" d="M0 0 C -7 -8 -5 -${R} 0 -${R + 2} C 5 -${R} 7 -8 0 0 Z" fill="${shade(c, (i % 2) * -0.1)}" ${O1}/>`;
      else if (style === 'moon') s += `<path transform="translate(50 ${cy}) rotate(${a})" d="M0 0 C -12 -8 -10 -${R} 0 -${R + 2} C 10 -${R} 12 -8 0 0 Z" fill="${c}" ${O1}/>`;
      else s += `<ellipse transform="translate(50 ${cy}) rotate(${a})" cx="0" cy="-${R * 0.62}" rx="${style === 'fluffy' ? 4 : 5.5}" ry="${R * 0.45}" fill="${i % 2 ? shade(c, -0.08) : c}" ${O1}/>`;
    }
    s += `<circle cx="50" cy="${style === 'lotus' ? cy + 4 : cy}" r="${style === 'big' ? 10 : style === 'lotus' ? 6 : 7}" fill="${center}" ${O1}/>`;
    if (style === 'big') for (let i = 0; i < 6; i++) s += `<circle cx="${46 + (i % 3) * 4}" cy="${35 + Math.floor(i / 3) * 5}" r="1" fill="${shade(center, -0.4)}"/>`;
    if (style === 'moon') s += `<circle cx="50" cy="${cy}" r="24" fill="#FFFDE7" opacity="0.25"/>`;
    return s;
  },
  bush({ c, fruit }) {
    let s = soil() + `<path d="M26 82 C 14 62 30 40 50 42 C 72 40 86 62 74 82 Z" fill="${LEAF}" ${O}/>
      <path d="M40 56 q6 -6 12 0 M56 66 q6 -6 12 0 M32 70 q5 -5 10 0" fill="none" stroke="${LEAF_D}" stroke-width="2" stroke-linecap="round"/>`;
    const spots = [[38, 62], [58, 54], [62, 72], [44, 76]];
    for (const [x, y] of spots) {
      if (fruit === 'berry') s += `<path d="M${x - 6} ${y - 3} C ${x - 6} ${y + 8} ${x + 6} ${y + 8} ${x + 6} ${y - 3} Z" fill="${c}" ${O1}/><path d="M${x - 4} ${y - 4} l4 -3 l4 3" fill="${LEAF_D}" ${O1}/><circle cx="${x - 2}" cy="${y + 1}" r="0.8" fill="#FFF59D"/><circle cx="${x + 2}" cy="${y + 3}" r="0.8" fill="#FFF59D"/>`;
      else if (fruit === 'long') s += `<path d="M${x} ${y - 6} C ${x + 8} ${y - 4} ${x + 6} ${y + 10} ${x - 2} ${y + 12} C ${x + 1} ${y + 4} ${x - 3} ${y} ${x} ${y - 6} Z" fill="${c}" ${O1}/><path d="M${x - 2} ${y - 7} h5" stroke="${LEAF_D}" stroke-width="2.4" stroke-linecap="round"/>`;
      else if (fruit === 'ghost') s += `<path d="M${x - 6} ${y + 8} C ${x - 8} ${y - 6} ${x + 8} ${y - 6} ${x + 6} ${y + 8} l-3 -3 l-3 3 l-3 -3 Z" fill="${c}" ${O1}/><circle cx="${x - 2}" cy="${y}" r="1" fill="${INK}"/><circle cx="${x + 2}" cy="${y}" r="1" fill="${INK}"/>`;
      else s += `<circle cx="${x}" cy="${y}" r="7" fill="${c}" ${O1}/><path d="M${x - 3} ${y - 7} l3 2 l3 -2" fill="${LEAF_D}" ${O1}/>${shine(x - 2.5, y - 2.5, 2)}`;
    }
    return s;
  },
  stalk({ c, style }) {
    if (style === 'bamboo') {
      let s = soil();
      for (const [x, top, w] of [[40, 16, 9], [56, 26, 8], [66, 40, 7]]) {
        s += `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${88 - top}" rx="3" fill="${c}" ${O1}/>`;
        for (let y = top + 16; y < 86; y += 16) s += `<path d="M${x - w / 2} ${y} h${w}" stroke="${INK}" stroke-width="1.6"/>`;
        s += leaf(x, top + 10, -30, 0.7, LEAF_D);
      }
      return s;
    }
    return `${soil()}<path d="M50 88 L50 14" stroke="${STEM}" stroke-width="4" stroke-linecap="round"/>
      <path d="M50 70 C 30 66 22 54 18 44 M50 56 C 70 50 78 40 82 30" fill="none" stroke="${LEAF}" stroke-width="5" stroke-linecap="round"/>
      <path d="M50 26 C 62 30 64 58 54 64 C 44 66 40 34 50 26 Z" fill="${c}" ${O}/>
      <path d="M48 34 h8 M47 42 h10 M47 50 h10 M49 58 h6" stroke="${shade(c, -0.3)}" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M54 64 C 64 58 66 44 62 36 M50 64 C 40 58 40 44 44 36" fill="none" stroke="${LEAF_D}" stroke-width="3" stroke-linecap="round"/>`;
  },
  vine({ c, fruit }) {
    let s = `${soil()}<path d="M14 84 C 30 70 40 92 56 80 S 80 70 88 82" fill="none" stroke="${STEM}" stroke-width="3" stroke-linecap="round"/>${leaf(26, 76, -60, 0.8)}${leaf(80, 74, -120, 0.8, LEAF_D)}
      <path d="M70 78 q6 -10 0 -14 q-5 -3 -6 3" fill="none" stroke="${STEM}" stroke-width="2" stroke-linecap="round"/>`;
    if (fruit === 'pumpkin' || fruit === 'giant') {
      const r = fruit === 'giant' ? 30 : 24;
      return s + `<ellipse cx="50" cy="${80 - r * 0.7}" rx="${r}" ry="${r * 0.78}" fill="${c}" ${O}/><ellipse cx="50" cy="${80 - r * 0.7}" rx="${r * 0.45}" ry="${r * 0.78}" fill="none" ${O1}/><path d="M${50 - r * 0.75} ${80 - r * 0.7} C ${50 - r * 0.75} ${80 - r * 1.3} ${50 + r * 0.75} ${80 - r * 1.3} ${50 + r * 0.75} ${80 - r * 0.7}" fill="none" stroke="${shade(c, -0.2)}" stroke-width="1.4"/>
        <path d="M48 ${80 - r * 1.45} q2 -8 8 -9" fill="none" stroke="${STEM}" stroke-width="4" stroke-linecap="round"/>${shine(40, 80 - r, 4)}${fruit === 'giant' ? `<path d="M30 30 l4 -6 l4 6 l6 -4 l-2 7" fill="#FFD54F" ${O1}/>` : ''}`;
    }
    if (fruit === 'melon') return s + `<ellipse cx="50" cy="62" rx="26" ry="19" fill="${c}" ${O}/><path d="M30 56 Q50 48 70 56 M28 64 Q50 56 72 64 M32 72 Q50 64 68 72" fill="none" stroke="${shade(c, 0.35)}" stroke-width="3"/>${shine(40, 52, 4)}`;
    if (fruit === 'cucumber') return s + `<path d="M24 64 C 30 46 70 42 78 56 C 72 70 32 76 24 64 Z" fill="${c}" ${O}/><circle cx="40" cy="58" r="1.4" fill="${shade(c, 0.5)}"/><circle cx="52" cy="54" r="1.4" fill="${shade(c, 0.5)}"/><circle cx="62" cy="58" r="1.4" fill="${shade(c, 0.5)}"/><circle cx="48" cy="64" r="1.4" fill="${shade(c, 0.5)}"/>`;
    // grape bunch
    for (const [x, y] of [[44, 40], [56, 40], [38, 50], [50, 50], [62, 50], [44, 60], [56, 60], [50, 70]]) s += `<circle cx="${x}" cy="${y}" r="7" fill="${c}" ${O1}/>${shine(x - 2, y - 2, 1.6)}`;
    return s + `<path d="M50 34 L50 24 q8 -2 12 4" fill="none" stroke="${STEM}" stroke-width="3" stroke-linecap="round"/>${leaf(50, 28, -40, 0.8)}`;
  },
  cactus({ c, style }) {
    if (style === 'aloe') {
      let s = soil();
      for (const rot of [-160, -130, -105, -75, -50, -20]) s += `<path transform="translate(50 86) rotate(${rot})" d="M0 -4 C 20 -8 36 -4 42 0 C 36 4 20 8 0 4 Z" fill="${rot % 2 ? c : shade(c, -0.12)}" ${O1}/>`;
      return s;
    }
    if (style === 'dragon') {
      return `${soil()}<path d="M50 88 L50 64" stroke="${LEAF_D}" stroke-width="8" stroke-linecap="round"/>
        <path d="M50 30 C 70 30 74 58 50 66 C 26 58 30 30 50 30 Z" fill="${c}" ${O}/>
        <path d="M50 30 l-6 -10 M40 38 l-12 -4 M60 38 l12 -4 M36 52 l-12 2 M64 52 l12 2" stroke="#8BC34A" stroke-width="4" stroke-linecap="round"/>
        ${shine(42, 40, 4)}`;
    }
    return `${soil()}<rect x="40" y="26" width="20" height="64" rx="10" fill="${c}" ${O}/>
      <path d="M40 60 H28 V44" fill="none" stroke="${INK}" stroke-width="2.4"/><path d="M28 64 Q22 62 22 52 V42 a6 6 0 0 1 12 0 V56 H40" fill="${c}" ${O}/>
      <path d="M60 50 H70 V36" fill="none"/><path d="M60 54 H72 Q78 54 78 46 V34 a6 6 0 0 0 -12 0 V48 H60" fill="${c}" ${O}/>
      <path d="M46 34 v4 M54 44 v4 M46 56 v4 M54 70 v4" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="50" cy="24" r="5" fill="#F48FB1" ${O1}/>`;
  },
  tree({ c, gold, oak }) {
    const crown = oak ? '#6D8B3A' : gold ? '#7CB342' : '#66BB6A';
    let s = `${soil()}<path d="M44 90 L46 58 L54 58 L56 90 Z" fill="#8D6E63" ${O}/>
      <path d="M50 14 C 76 12 90 34 80 52 C 76 66 58 66 50 62 C 40 66 22 66 18 52 C 10 34 26 12 50 14 Z" fill="${crown}" ${O}/>
      <path d="M30 36 q8 -8 16 0 M54 30 q8 -8 16 0" fill="none" stroke="${shade(crown, -0.2)}" stroke-width="2" stroke-linecap="round"/>`;
    for (const [x, y] of [[34, 46], [50, 36], [66, 46], [42, 56], [60, 56]]) {
      if (oak) s += `<ellipse cx="${x}" cy="${y + 2}" rx="4" ry="5" fill="#A1887F" ${O1}/><path d="M${x - 4.5} ${y - 1} h9 v-2 h-9 Z" fill="#6D4C41" ${O1}/>`;
      else s += `<circle cx="${x}" cy="${y}" r="5.5" fill="${c}" ${O1}/>${shine(x - 1.8, y - 2, 1.5)}`;
    }
    if (gold) s += `<g fill="#FFF8E1"><path d="M22 20 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z"/><path d="M82 64 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 Z"/></g>`;
    return s;
  },
  trap({ style }) {
    if (style === 'pitcher') {
      return `${soil()}<path d="M36 88 C 30 60 32 34 46 26 L64 26 C 70 40 70 64 62 88 Z" fill="#8BC34A" ${O}/><ellipse cx="55" cy="26" rx="11" ry="4" fill="#33691E" ${O}/>
        <path d="M52 22 C 54 10 70 10 72 20" fill="#C62828" ${O}/><path d="M40 50 q8 4 18 0 M40 64 q8 4 18 0" fill="none" stroke="#C62828" stroke-width="2.4" stroke-linecap="round"/>`;
    }
    if (style === 'corpse') {
      return `${soil()}<path d="M24 88 C 18 62 30 50 50 50 C 70 50 82 62 76 88 Z" fill="#8E244D" ${O}/><path d="M28 70 C 40 64 60 64 72 70" fill="none" stroke="#5D1035" stroke-width="2"/>
        <path d="M44 56 C 42 30 46 12 50 8 C 54 12 58 30 56 56 Z" fill="#F3E5AB" ${O}/>
        <path d="M30 40 q-4 -6 0 -12 M70 40 q4 -6 0 -12 M40 30 q-3 -5 0 -10" fill="none" stroke="#9CCC65" stroke-width="2.2" stroke-linecap="round" opacity="0.8"/>`;
    }
    return `${soil()}<path d="M50 88 L50 62" stroke="${STEM}" stroke-width="4" stroke-linecap="round"/>${leaf(50, 80, -150, 0.9)}${leaf(50, 76, -30, 0.9, LEAF_D)}
      <path d="M50 60 C 26 58 22 34 34 26 C 42 40 48 50 50 60 Z" fill="#7CB342" ${O}/><path d="M50 60 C 74 58 78 34 66 26 C 58 40 52 50 50 60 Z" fill="#7CB342" ${O}/>
      <path d="M36 32 C 40 42 46 50 50 56 C 54 50 60 42 64 32" fill="#E57373"/>
      <path d="M34 26 l-3 -5 M40 32 l-5 -3 M66 26 l3 -5 M60 32 l5 -3" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`;
  },
  pineapple() {
    let s = `${soil()}<ellipse cx="50" cy="66" rx="18" ry="22" fill="#F9A825" ${O}/>`;
    s += `<path d="M36 54 L64 80 M36 66 L56 86 M40 46 L64 68 M64 54 L36 80 M64 66 L44 86 M60 46 L36 68" stroke="#C17900" stroke-width="1.6"/>`;
    for (const rot of [-40, -15, 15, 40, 0]) s += `<path transform="translate(50 46) rotate(${rot})" d="M-4 0 L0 -26 L4 0 Z" fill="${LEAF}" ${O1}/>`;
    return s;
  },
};

// ---------------------------------------------------------------------------
// Tools, weather, decor
// ---------------------------------------------------------------------------
const ITEM = {
  wateringcan({ c, magic }) {
    return `<path d="M24 46 h40 v34 a6 6 0 0 1 -6 6 h-28 a6 6 0 0 1 -6 -6 Z" fill="${c}" ${O}/><path d="M64 54 L84 36 L88 40 L68 64" fill="${shade(c, -0.1)}" ${O}/>
      <path d="M30 46 C 30 30 58 30 58 46" fill="none" ${O}/><ellipse cx="88" cy="37" rx="4" ry="5" fill="${shade(c, -0.25)}" ${O1}/>
      ${magic ? '<g fill="#FFF59D"><path d="M16 26 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z"/><path d="M76 16 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 Z"/></g>' : ''}
      <path d="M92 44 l2 6 M88 48 l0 6" stroke="#4FC3F7" stroke-width="2.4" stroke-linecap="round"/>${shine(32, 56, 4)}`;
  },
  rake: () => `<path d="M30 86 L64 30" stroke="#A1887F" stroke-width="6" stroke-linecap="round"/><path d="M30 86 L64 30" stroke="${INK}" stroke-width="1.2"/>
    <path d="M52 22 L84 38" stroke="#90A4AE" stroke-width="6" stroke-linecap="round"/><path d="M56 24 l-6 12 M64 28 l-6 12 M72 32 l-6 12 M80 36 l-6 12" stroke="#78909C" stroke-width="3.5" stroke-linecap="round"/>`,
  spray: () => `<rect x="34" y="44" width="30" height="44" rx="8" fill="#81D4FA" ${O}/><path d="M42 44 v-10 h16 v10" fill="#ECEFF1" ${O}/><path d="M42 34 h-12 v-6 h28 v6" fill="#FF8A65" ${O}/>
    <path d="M58 34 l8 10" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M24 26 l-6 -3 M24 30 l-8 0 M24 34 l-6 3" stroke="#4FC3F7" stroke-width="2.4" stroke-linecap="round"/>${shine(42, 56, 3)}`,
  trowel: () => `<path d="M50 20 C 70 30 68 56 54 62 L46 62 C 32 56 30 30 50 20 Z" fill="#B0BEC5" ${O}/><path d="M50 26 L50 56" stroke="#78909C" stroke-width="2"/><rect x="46" y="62" width="8" height="10" fill="#8D6E63" ${O}/><rect x="44" y="72" width="12" height="18" rx="5" fill="#FF7043" ${O}/>`,
  bag: ({ c }) => `<path d="M28 34 L72 34 L78 88 L22 88 Z" fill="#D7B98E" ${O}/><path d="M28 34 Q50 24 72 34" fill="#C9A673" ${O}/><circle cx="50" cy="62" r="12" fill="${c}" ${O1}/><path d="M44 62 q6 -10 12 0 q-6 8 -12 0" fill="#9CCC65" ${O1}/>`,
  shears: () => `<path d="M48 54 L22 22 M52 54 L78 22" stroke="#B0BEC5" stroke-width="7" stroke-linecap="round"/><path d="M48 54 L22 22 M52 54 L78 22" stroke="${INK}" stroke-width="1.2"/>
    <ellipse cx="38" cy="74" rx="11" ry="14" fill="none" stroke="#E53935" stroke-width="6"/><ellipse cx="62" cy="74" rx="11" ry="14" fill="none" stroke="#E53935" stroke-width="6"/><circle cx="50" cy="56" r="3.5" fill="${INK}"/>`,
  net: () => `<path d="M22 88 L56 44" stroke="#A1887F" stroke-width="6" stroke-linecap="round"/><ellipse cx="66" cy="34" rx="20" ry="18" fill="#E1F5FE" fill-opacity="0.6" ${O}/>
    <path d="M50 28 L82 40 M54 20 L78 48 M66 16 L66 52 M48 38 L84 30" stroke="#90A4AE" stroke-width="1.2"/>`,
  hoe: ({ gold }) => `<path d="M30 88 L66 26" stroke="${gold ? '#FFB300' : '#A1887F'}" stroke-width="6" stroke-linecap="round"/><path d="M56 24 L86 30 L84 44 L62 38 Z" fill="${gold ? '#FFD54F' : '#B0BEC5'}" ${O}/>${gold ? '<path d="M24 30 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" fill="#FFF59D"/>' : ''}`,
  wheelbarrow: () => `<path d="M18 40 L76 40 L66 70 L28 70 Z" fill="#E57373" ${O}/><path d="M76 40 L90 30" stroke="#8D6E63" stroke-width="5" stroke-linecap="round"/>
    <circle cx="36" cy="80" r="9" fill="#5D4037" ${O}/><circle cx="36" cy="80" r="3" fill="#BCAAA4"/><path d="M60 70 L66 88" ${O}/><ellipse cx="34" cy="38" rx="8" ry="6" fill="#FB8C00" ${O1}/><ellipse cx="52" cy="36" rx="9" ry="7" fill="#7CB342" ${O1}/>`,
  sprinkler: () => `<rect x="44" y="50" width="12" height="36" rx="3" fill="#78909C" ${O}/><ellipse cx="50" cy="88" rx="18" ry="5" fill="#8D6E63" ${O1}/><circle cx="50" cy="46" r="8" fill="#B0BEC5" ${O}/>
    <path d="M42 40 Q26 20 14 34 M58 40 Q74 20 86 34 M50 38 Q50 18 50 12" fill="none" stroke="#4FC3F7" stroke-width="3" stroke-dasharray="2 5" stroke-linecap="round"/>`,
  blower: () => `<path d="M30 40 h34 a10 10 0 0 1 10 10 v8 a10 10 0 0 1 -10 10 h-34 Z" fill="#FFB74D" ${O}/><path d="M74 50 L92 46 L92 62 L74 58" fill="#90A4AE" ${O}/><path d="M40 68 v14 h14 v-14" fill="none" ${O}/>
    <path d="M22 44 h-12 M22 54 h-14 M22 64 h-10" stroke="#B2DFDB" stroke-width="3" stroke-linecap="round"/>${leaf(8, 30, 20, 0.5, '#E57373')}`,
  greenhouse: () => `<path d="M16 88 V48 L50 20 L84 48 V88 Z" fill="#E0F7FA" fill-opacity="0.85" ${O}/><path d="M50 20 V88 M16 60 H84 M33 34 V88 M67 34 V88" stroke="#4DB6AC" stroke-width="2"/>
    <path d="M24 88 q4 -12 8 0 M60 88 q4 -14 8 0" fill="${LEAF}" ${O1}/>${shine(28, 54, 5)}`,
  // weather
  cloud: ({ rain }) => {
    let s = `<path d="M24 60 a14 14 0 0 1 6 -27 a18 18 0 0 1 34 -4 a14 14 0 0 1 12 31 Z" fill="#ECEFF1" ${O}/>`;
    for (let i = 0; i < rain; i++) s += `<path d="M${32 + i * 12} ${68 + (i % 2) * 6} l-3 9" stroke="#29B6F6" stroke-width="3.5" stroke-linecap="round"/>`;
    return s;
  },
  wind: () => `<path d="M14 40 H62 a10 10 0 1 0 -10 -10 M14 56 H76 a10 10 0 1 1 -10 10 M14 72 H44" fill="none" stroke="#80CBC4" stroke-width="6" stroke-linecap="round"/>${leaf(70, 32, 30, 0.6, '#FFB74D')}`,
  sun: () => {
    let s = '';
    for (let i = 0; i < 12; i++) s += `<path transform="rotate(${i * 30} 50 50)" d="M50 10 L54 22 L46 22 Z" fill="#FFB300" ${O1}/>`;
    return s + `<circle cx="50" cy="50" r="22" fill="#FFD54F" ${O}/><circle cx="43" cy="47" r="2" fill="${INK}"/><circle cx="57" cy="47" r="2" fill="${INK}"/><path d="M43 56 q7 6 14 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
  },
  fog: () => `<path d="M14 36 H86 M22 50 H78 M14 64 H70 M30 78 H86" stroke="#B0BEC5" stroke-width="8" stroke-linecap="round" opacity="0.9"/>`,
  heat: () => `<circle cx="50" cy="44" r="20" fill="#FF7043" ${O}/><path d="M26 82 q6 -8 0 -16 M44 86 q6 -8 0 -16 M62 82 q6 -8 0 -16 M80 86 q6 -8 0 -16" fill="none" stroke="#FFAB40" stroke-width="3.5" stroke-linecap="round"/>`,
  snow: () => {
    let s = '';
    for (const [x, y, r] of [[50, 48, 26], [22, 22, 9], [80, 76, 10]]) {
      for (let i = 0; i < 3; i++) s += `<path transform="rotate(${i * 60} ${x} ${y})" d="M${x} ${y - r} V${y + r} M${x - r * 0.3} ${y - r * 0.7} L${x} ${y - r * 0.45} L${x + r * 0.3} ${y - r * 0.7} M${x - r * 0.3} ${y + r * 0.7} L${x} ${y + r * 0.45} L${x + r * 0.3} ${y + r * 0.7}" fill="none" stroke="#4FC3F7" stroke-width="3" stroke-linecap="round"/>`;
    }
    return s;
  },
  storm: () => `<path d="M24 52 a14 14 0 0 1 6 -27 a18 18 0 0 1 34 -4 a14 14 0 0 1 12 31 Z" fill="#78909C" ${O}/><path d="M52 52 L40 74 H52 L44 94 L68 64 H56 L64 52 Z" fill="#FFEB3B" ${O}/>`,
  rainbow: () => {
    const cols = ['#EF5350', '#FFA726', '#FFEE58', '#66BB6A', '#42A5F5', '#AB47BC'];
    return cols.map((c, i) => `<path d="M${12 + i * 5} 76 A${38 - i * 5} ${38 - i * 5} 0 0 1 ${88 - i * 5} 76" fill="none" stroke="${c}" stroke-width="5"/>`).join('') +
      `<path d="M8 80 a8 8 0 0 1 8 -10 a8 8 0 0 1 14 2 a7 7 0 0 1 0 10 Z" fill="#fff" ${O1}/><path d="M70 80 a8 8 0 0 1 8 -10 a8 8 0 0 1 14 2 a7 7 0 0 1 0 10 Z" fill="#fff" ${O1}/>`;
  },
  // decor
  gnome: () => `<path d="M34 50 L50 10 L66 50 Z" fill="#E53935" ${O}/><circle cx="50" cy="54" r="10" fill="#FFCC80" ${O}/><path d="M38 58 C 38 84 62 84 62 58 C 56 64 44 64 38 58 Z" fill="#FAFAFA" ${O}/>
    <circle cx="50" cy="58" r="3.5" fill="#F48FB1" ${O1}/><path d="M34 70 h32 v16 h-32 Z" fill="#1E88E5" ${O}/><path d="M34 86 h14 v4 h-14 Z M52 86 h14 v4 h-14 Z" fill="#5D4037" ${O1}/>`,
  birdhouse: () => `<path d="M50 88 V64" stroke="#8D6E63" stroke-width="5"/><rect x="30" y="34" width="40" height="34" fill="#FFB74D" ${O}/><path d="M24 38 L50 16 L76 38 Z" fill="#E57373" ${O}/><circle cx="50" cy="50" r="7" fill="${INK}"/><path d="M46 62 h8" ${O}/>`,
  stones: () => `<ellipse cx="30" cy="76" rx="14" ry="8" fill="#B0BEC5" ${O}/><ellipse cx="54" cy="58" rx="13" ry="7" fill="#CFD8DC" ${O}/><ellipse cx="72" cy="40" rx="12" ry="6.5" fill="#B0BEC5" ${O}/><path d="M12 88 q4 -8 8 0 M80 70 q4 -8 8 0" fill="${LEAF}" ${O1}/>`,
  birdbath: () => `<path d="M44 86 h12 l-2 -30 h-8 Z" fill="#CFD8DC" ${O}/><path d="M18 46 h64 C 80 60 20 60 18 46 Z" fill="#CFD8DC" ${O}/><ellipse cx="50" cy="46" rx="30" ry="5" fill="#81D4FA" ${O1}/>
    <path d="M64 40 c0 -10 10 -12 14 -8 l4 -2 l-2 4 c2 6 -4 10 -10 8 Z" fill="#90CAF9" ${O1}/><ellipse cx="38" cy="88" rx="22" ry="4" fill="#A1887F"/>`,
  chime: () => `<path d="M24 22 H76" stroke="#8D6E63" stroke-width="5" stroke-linecap="round"/><path d="M50 10 V22" stroke="${INK}" stroke-width="2"/>
    ${[[32, 56], [44, 66], [56, 60], [68, 50]].map(([x, h]) => `<path d="M${x} 22 V30" stroke="${INK}" stroke-width="1.5"/><rect x="${x - 3.5}" y="30" width="7" height="${h - 30}" rx="3" fill="#B0BEC5" ${O1}/>`).join('')}
    <path d="M50 22 V78" stroke="${INK}" stroke-width="1.5"/><path d="M44 78 h12 l-6 12 Z" fill="#FFB74D" ${O1}/>`,
  sundial: () => `<ellipse cx="50" cy="70" rx="34" ry="14" fill="#E0E0E0" ${O}/><path d="M50 70 L50 36 L74 70 Z" fill="#BDBDBD" ${O}/><path d="M24 70 h6 M70 70 h6 M50 82 v4 M32 62 l4 2 M68 62 l-4 2" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><path d="M50 70 L26 78" stroke="#757575" stroke-width="3" opacity="0.5"/>`,
  beehive: () => `<path d="M50 88 V80" stroke="#8D6E63" stroke-width="4"/><path d="M30 80 h40 c4 -10 0 -14 -4 -16 c4 -6 0 -14 -6 -16 c2 -8 -6 -14 -10 -14 c-4 0 -12 6 -10 14 c-6 2 -10 10 -6 16 c-4 2 -8 6 -4 16 Z" fill="#FFCA28" ${O}/>
    <path d="M32 64 h36 M34 48 h32" stroke="#E0A800" stroke-width="2"/><circle cx="50" cy="72" r="4" fill="${INK}"/>
    <g transform="translate(76 34)"><ellipse rx="6" ry="4.5" fill="#FFD54F" ${O1}/><path d="M-2 -4 v8 M2 -4 v8" stroke="${INK}" stroke-width="1.6"/><ellipse cx="0" cy="-6" rx="4" ry="3" fill="#E3F2FD" ${O1}/></g>`,
  scarecrow: () => `<path d="M50 90 V36 M22 50 H78" stroke="#8D6E63" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="30" r="11" fill="#FFE0B2" ${O}/><path d="M32 22 h36 l-6 -10 h-24 Z" fill="#795548" ${O}/>
    <path d="M36 44 h28 l4 26 h-36 Z" fill="#E57373" ${O}/><circle cx="46" cy="29" r="1.8" fill="${INK}"/><circle cx="54" cy="29" r="1.8" fill="${INK}"/><path d="M45 35 q5 3 10 0" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M22 50 l-4 6 M22 50 l-6 2 M78 50 l4 6 M78 50 l6 2" stroke="#FFCA28" stroke-width="2.4" stroke-linecap="round"/>`,
  fountain: () => `<ellipse cx="50" cy="80" rx="36" ry="9" fill="#B39DDB" ${O}/><ellipse cx="50" cy="78" rx="30" ry="6" fill="#80DEEA"/><path d="M44 78 V50 h12 V78" fill="#D1C4E9" ${O}/><ellipse cx="50" cy="50" rx="18" ry="5" fill="#B39DDB" ${O}/>
    <path d="M50 46 C 50 30 36 26 32 44 M50 46 C 50 30 64 26 68 44 M50 46 V24" fill="none" stroke="#4DD0E1" stroke-width="3" stroke-linecap="round"/>
    <g fill="#FFF59D"><circle cx="24" cy="30" r="2"/><circle cx="78" cy="22" r="2.5"/><circle cx="70" cy="64" r="1.6"/></g>`,
};

// ---------------------------------------------------------------------------
// Pests (battle enemies)
// ---------------------------------------------------------------------------
const eyes = (x, y, gap = 8, r = 3) => `<circle cx="${x - gap / 2}" cy="${y}" r="${r}" fill="#fff" ${O1}/><circle cx="${x + gap / 2}" cy="${y}" r="${r}" fill="#fff" ${O1}/><circle cx="${x - gap / 2}" cy="${y + 0.8}" r="${r * 0.45}" fill="${INK}"/><circle cx="${x + gap / 2}" cy="${y + 0.8}" r="${r * 0.45}" fill="${INK}"/>`;
const PESTS = {
  aphid: () => `<ellipse cx="50" cy="58" rx="22" ry="18" fill="#9CCC65" ${O}/><path d="M34 70 l-8 8 M50 76 v9 M66 70 l8 8" ${O}/><path d="M42 42 q-6 -14 -14 -14 M58 42 q6 -14 14 -14" fill="none" ${O}/>${eyes(50, 52, 12, 4.5)}`,
  slug: () => `<path d="M14 74 C 14 60 30 56 46 58 C 60 44 80 46 84 62 C 86 76 70 78 50 78 L18 78 Z" fill="#BCAAA4" ${O}/><path d="M66 50 L62 34 M76 50 L78 34" ${O}/><circle cx="62" cy="33" r="3" fill="${INK}"/><circle cx="78" cy="33" r="3" fill="${INK}"/><path d="M66 64 q4 3 8 0" fill="none" ${O1}/>`,
  snail: () => `<path d="M12 78 C 14 68 40 68 60 72 C 74 62 84 66 86 76 L86 80 L14 80 Z" fill="#D7CCC8" ${O}/><circle cx="44" cy="56" r="20" fill="#FFB74D" ${O}/><path d="M44 56 m-12 0 a12 12 0 1 1 12 12 a7 7 0 1 1 -7 -7" fill="none" stroke="#E65100" stroke-width="2.4"/><path d="M74 66 L72 52 M82 68 L84 54" ${O}/><circle cx="72" cy="51" r="2.6" fill="${INK}"/><circle cx="84" cy="53" r="2.6" fill="${INK}"/>`,
  caterpillar: () => `${[20, 34, 48, 62].map((x) => `<circle cx="${x}" cy="66" r="10" fill="#AED581" ${O}/>`).join('')}<circle cx="76" cy="58" r="13" fill="#9CCC65" ${O}/>${eyes(76, 55, 9, 3.6)}<path d="M70 44 l-4 -8 M82 44 l4 -8" ${O}/>`,
  beetle: () => `<ellipse cx="50" cy="58" rx="26" ry="28" fill="#5C6BC0" ${O}/><path d="M50 30 V86" stroke="${INK}" stroke-width="2.4"/><circle cx="50" cy="30" r="12" fill="#283593" ${O}/><path d="M26 50 l-12 -6 M26 62 l-14 0 M26 74 l-12 6 M74 50 l12 -6 M74 62 l14 0 M74 74 l12 6" ${O}/>${eyes(50, 28, 9, 3.4)}${shine(40, 48, 5)}`,
  grasshopper: () => `<ellipse cx="46" cy="60" rx="28" ry="12" fill="#8BC34A" ${O}/><circle cx="74" cy="52" r="10" fill="#9CCC65" ${O}/><path d="M30 60 L18 40 L12 74 M50 66 L44 82 M60 66 L66 82" fill="none" ${O}/>${eyes(76, 49, 7, 3)}<path d="M80 44 q8 -14 14 -14" fill="none" ${O1}/>`,
  crow: () => `<path d="M20 60 C 30 40 60 36 70 48 L88 46 L74 58 C 70 72 40 76 20 60 Z" fill="#37474F" ${O}/><path d="M40 52 C 46 30 64 28 66 40" fill="#455A64" ${O}/><circle cx="66" cy="50" r="3" fill="#fff"/><circle cx="66.5" cy="50.5" r="1.4" fill="${INK}"/><path d="M44 72 l-4 10 M54 72 l2 10" ${O}/>`,
  mole: () => `<ellipse cx="50" cy="62" rx="26" ry="22" fill="#6D4C41" ${O}/><ellipse cx="50" cy="66" rx="10" ry="8" fill="#F8BBD0" ${O1}/><circle cx="50" cy="60" r="4" fill="#EC407A"/><circle cx="42" cy="52" r="2" fill="${INK}"/><circle cx="58" cy="52" r="2" fill="${INK}"/><path d="M22 74 l-6 6 l4 2 l4 -4 M78 74 l6 6 l-4 2 l-4 -4" fill="#F8BBD0" ${O1}/>`,
  gopher: () => `<ellipse cx="50" cy="60" rx="34" ry="30" fill="#A1887F" ${O}/><ellipse cx="50" cy="70" rx="18" ry="14" fill="#D7CCC8" ${O1}/><path d="M44 74 h12 v8 h-12 Z" fill="#fff" ${O1}/><path d="M50 74 v8" stroke="${INK}" stroke-width="1.2"/>
    ${eyes(50, 50, 18, 6)}<path d="M38 40 l-4 -4 M62 40 l4 -4" ${O}/><path d="M30 26 L36 10 L44 22 L50 6 L56 22 L64 10 L70 26 Z" fill="#FFD54F" ${O}/><circle cx="50" cy="62" r="4" fill="#4E342E"/>`,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
const TYPE_BG = { plant: ['#EAF5DA', '#CFE8B4'], tool: ['#E7EEF7', '#C9D9EC'], weather: ['#E3F2FD', '#BBDEFB'], decor: ['#F7ECDF', '#EBD3B7'] };

/** Inner drawing for a card (no background), 100×100. */
export function cardArt(card) {
  const a = card.art;
  const fn = PLANT[a.t] || ITEM[a.t];
  return fn ? fn(a) : '';
}

/** Full card art with its soft background, as an <svg> string. */
export function cardSvg(card, { size = '100%' } = {}) {
  const [b1, b2] = TYPE_BG[card.type];
  const id = `g${card.id}`;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><defs><radialGradient id="${id}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></radialGradient></defs><rect width="100" height="100" fill="url(#${id})"/>${cardArt(card)}</svg>`;
}

export const pestArt = (kind) => (PESTS[kind] || PESTS.aphid)();

/** Garden growth stages: 0 seedling, 1 sprout, 2 young (scaled plant), 3 grown. */
export function stageArt(card, stage) {
  if (stage <= 0) return `<ellipse cx="50" cy="88" rx="26" ry="6" fill="${SOIL}" ${O1}/><path d="M50 86 L50 72" stroke="${STEM}" stroke-width="3" stroke-linecap="round"/>${leaf(50, 74, -130, 0.5)}${leaf(50, 74, -50, 0.5, LEAF_D)}`;
  if (stage === 1) return `<ellipse cx="50" cy="88" rx="28" ry="6" fill="${SOIL}" ${O1}/><path d="M50 86 L50 58" stroke="${STEM}" stroke-width="3.4" stroke-linecap="round"/>${leaf(50, 70, -150, 0.8)}${leaf(50, 64, -30, 0.8, LEAF_D)}${leaf(50, 58, -120, 0.6)}`;
  const s = stage === 2 ? 0.7 : 1;
  return `<g transform="translate(${50 - 50 * s} ${92 - 92 * s}) scale(${s})">${cardArt(card)}</g>`;
}

/** SVG string → Image (for canvas drawing), cached. */
const imgCache = new Map();
export function svgImage(key, inner) {
  if (imgCache.has(key)) return imgCache.get(key);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">${inner}</svg>`);
  imgCache.set(key, img);
  return img;
}

/** Seed packet art for the shop / opening animation. */
export function packetSvg(kind) {
  const P_ = { starter: ['#E07A4F', '#FFD9C2', 'Starter Packet'], basic: ['#7CB342', '#C5E1A5', 'Seed Packet'], bundle: ['#1E88E5', '#BBDEFB', "Gardener's Bundle"], golden: ['#F9A825', '#FFF59D', 'Golden Pack'] }[kind];
  const [c, light, label] = P_;
  return `<svg viewBox="0 0 100 140" aria-hidden="true">
    <path d="M10 14 L90 14 L90 132 L10 132 Z" fill="${light}" ${O}/>
    <path d="M10 14 L14 6 L20 14 L26 6 L32 14 L38 6 L44 14 L50 6 L56 14 L62 6 L68 14 L74 6 L80 14 L86 6 L90 14" fill="${light}" ${O}/>
    <rect x="18" y="26" width="64" height="62" rx="8" fill="#FFFDF5" ${O1}/>
    <g transform="translate(18 26) scale(0.64 0.62)">${kind === 'golden' ? PLANT.tree({ c: '#FFC400', gold: true }) : kind === 'starter' ? PLANT.flower({ c: '#FFFFFF', center: '#F6C744', petals: 10 }) : kind === 'bundle' ? PLANT.flower({ c: '#FFC107', center: '#6D4C41', petals: 16, style: 'big' }) : PLANT.root({ c: '#E0466B', shape: 'round' })}</g>
    <rect x="10" y="96" width="80" height="20" fill="${c}" ${O1}/>
    <text x="50" y="110" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="${label.length > 12 ? 8 : 10}" fill="#fff">${label}</text>
    ${kind === 'golden' ? '<g fill="#fff"><path d="M24 124 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 Z"/><path d="M76 122 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 Z"/></g>' : ''}
  </svg>`;
}
