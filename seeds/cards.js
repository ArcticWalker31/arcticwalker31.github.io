// cards.js — every card in Seed Pack, plus the rules that turn a card (and
// its level) into garden and battle numbers. No DOM.
//
// Cards are permanent unlocks. Duplicates level a card up (to Lv 5).
// types: plant · tool · decor · weather

export const RARITIES = {
  common: { name: 'Common', weight: 60, mult: 1, cost: 0, coin: 1 },
  uncommon: { name: 'Uncommon', weight: 25, mult: 1.25, cost: 25, coin: 1.1 },
  rare: { name: 'Rare', weight: 10, mult: 1.6, cost: 50, coin: 1.2 },
  epic: { name: 'Epic', weight: 4, mult: 2.1, cost: 75, coin: 1.35 },
  legendary: { name: 'Legendary', weight: 1, mult: 2.8, cost: 125, coin: 1.6 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Copies needed to reach Lv 2, 3, 4, 5 (duplicates beyond the first). */
export const LEVEL_COPIES = [1, 2, 4, 8];
export const MAX_LEVEL = 5;
export const levelMult = (level) => 1 + 0.15 * (level - 1);

// ---------------------------------------------------------------------------
// Plants (48). art: template + colors (drawn in art.js)
//   role: sun | shooter | wall | bomb | slow | trap | support
//   mod: role variant (see ROLE rules below)
//   grow: real minutes to ripen
// ---------------------------------------------------------------------------
const P = (id, name, rarity, grow, role, art, desc, mod) => ({ id, name, type: 'plant', rarity, grow, role, mod, art, desc });

const PLANTS = [
  // Common
  P('radish', 'Radish', 'common', 5, 'shooter', { t: 'root', c: '#E0466B', shape: 'round' }, 'Fires little radish bits up its lane.'),
  P('pea', 'Pea Pod', 'common', 8, 'shooter', { t: 'pod', c: '#7CC36A' }, 'Pops peas at pests. Reliable and cheap.'),
  P('carrot', 'Carrot', 'common', 10, 'shooter', { t: 'root', c: '#F28C28', shape: 'carrot' }, 'Its pointy shots pierce through pests.', 'pierce'),
  P('lettuce', 'Lettuce', 'common', 6, 'wall', { t: 'leafy', c: '#9BD46C', style: 'lettuce' }, 'A crunchy wall that soaks up bites.'),
  P('potato', 'Potato', 'common', 12, 'wall', { t: 'root', c: '#C99A5B', shape: 'potato' }, 'Tough little spud. Pests chew on it for ages.'),
  P('onion', 'Onion', 'common', 15, 'slow', { t: 'root', c: '#C985C9', shape: 'bulb' }, 'Its fumes make pests teary and slow.'),
  P('basil', 'Basil', 'common', 9, 'support', { t: 'herb', c: '#4FA35A', style: 'round' }, 'Fresh scent heals nearby plants.'),
  P('mint', 'Mint', 'common', 7, 'slow', { t: 'herb', c: '#5FC7A0', style: 'pointy' }, 'Chilly breath slows pests.'),
  P('daisy', 'Daisy', 'common', 5, 'sun', { t: 'flower', c: '#FFFFFF', center: '#F6C744', petals: 10 }, 'Soaks up sunlight to power your cards.'),
  P('marigold', 'Marigold', 'common', 11, 'sun', { t: 'flower', c: '#F59E2B', center: '#C2410C', petals: 14, style: 'fluffy' }, 'A sunny bloom that makes extra light.'),
  P('clover', 'Lucky Clover', 'common', 6, 'sun', { t: 'clover', c: '#43A047' }, 'A little luck, a little sunlight.'),
  P('strawberry', 'Strawberry', 'common', 14, 'shooter', { t: 'bush', c: '#E53950', fruit: 'berry' }, 'Flings sweet berries rapidly.', 'rapid'),
  P('spinach', 'Spinach', 'common', 13, 'wall', { t: 'leafy', c: '#2E7D32', style: 'kale' }, 'Iron-strong leaves hold the line.'),
  P('dandelion', 'Dandelion', 'common', 4, 'support', { t: 'flower', c: '#FFD43B', center: '#F59F00', petals: 18, style: 'fluffy' }, 'Puffs of seeds heal neighbors.'),

  // Uncommon
  P('tomato', 'Tomato', 'uncommon', 30, 'shooter', { t: 'bush', c: '#E8402E', fruit: 'round' }, 'Splattering tomatoes hit nearby pests too.', 'splash'),
  P('cabbage', 'Cabbage', 'uncommon', 40, 'wall', { t: 'leafy', c: '#8FCF6F', style: 'cabbage' }, 'Layers on layers of tough leaves.'),
  P('corn', 'Corn', 'uncommon', 45, 'shooter', { t: 'stalk', c: '#F7C948', style: 'corn' }, 'Lobs heavy kernels that burst on impact.', 'lob'),
  P('cucumber', 'Cucumber', 'uncommon', 35, 'slow', { t: 'vine', c: '#3F9142', fruit: 'cucumber' }, 'Cool as a… you know. Slows pests a lot.'),
  P('beet', 'Beet', 'uncommon', 30, 'bomb', { t: 'root', c: '#8E2350', shape: 'round' }, 'Beet bomb! Blasts pests around it.', 'cell3'),
  P('garlic', 'Garlic', 'uncommon', 50, 'trap', { t: 'root', c: '#EDE7DA', shape: 'bulb' }, 'Pests that bite it get a nasty surprise.'),
  P('sunflower', 'Sunflower', 'uncommon', 35, 'sun', { t: 'flower', c: '#FFC107', center: '#6D4C41', petals: 16, style: 'big' }, 'Turns toward the sun and pays you back.'),
  P('tulip', 'Tulip', 'uncommon', 40, 'sun', { t: 'flower', c: '#F06292', center: '#F06292', style: 'tulip' }, 'An elegant bloom with steady sunlight.'),
  P('lavender', 'Lavender', 'uncommon', 45, 'slow', { t: 'flower', c: '#9575CD', style: 'spike' }, 'A calming aura slows every pest near it.', 'aura'),
  P('rosemary', 'Rosemary', 'uncommon', 55, 'support', { t: 'herb', c: '#5E8C61', style: 'needle' }, 'Heals all plants around it.'),
  P('blueberry', 'Blueberry', 'uncommon', 50, 'shooter', { t: 'bush', c: '#4F6BD8', fruit: 'berry' }, 'Rapid-fire berries.', 'rapid'),
  P('cactus', 'Cactus', 'uncommon', 60, 'trap', { t: 'cactus', c: '#4CAF50', style: 'saguaro' }, 'Spiky. Pests regret chewing it.'),

  // Rare
  P('pumpkin', 'Pumpkin', 'rare', 120, 'wall', { t: 'vine', c: '#F57C00', fruit: 'pumpkin' }, 'A huge orange fortress.'),
  P('chili', 'Chili Pepper', 'rare', 90, 'bomb', { t: 'bush', c: '#D32F2F', fruit: 'long' }, 'Burns its whole lane in a fiery blast.', 'lane'),
  P('eggplant', 'Eggplant', 'rare', 110, 'shooter', { t: 'bush', c: '#6A1B9A', fruit: 'long' }, 'Slow, heavy hits that knock pests silly.', 'heavy'),
  P('watermelon', 'Watermelon', 'rare', 150, 'shooter', { t: 'vine', c: '#2E7D32', fruit: 'melon' }, 'Lobs whole melons. Big splash.', 'lob'),
  P('aloe', 'Aloe', 'rare', 100, 'support', { t: 'cactus', c: '#7CB342', style: 'aloe' }, 'Soothing gel heals a whole lane.', 'lane'),
  P('rose', 'Rose', 'rare', 130, 'trap', { t: 'flower', c: '#C62828', center: '#8E0000', style: 'rose' }, 'Beautiful, and covered in thorns.'),
  P('bamboo', 'Bamboo', 'rare', 90, 'wall', { t: 'stalk', c: '#7CB342', style: 'bamboo' }, 'Grows fast, stands firm.'),
  P('snowdrop', 'Snowdrop', 'rare', 140, 'slow', { t: 'flower', c: '#E3F2FD', center: '#90CAF9', style: 'bell' }, 'Frosty shots nearly freeze pests.', 'frost'),
  P('appletree', 'Apple Tree', 'rare', 150, 'sun', { t: 'tree', c: '#E53935' }, 'A small tree heavy with sunlight and apples.'),
  P('grapevine', 'Grapevine', 'rare', 120, 'shooter', { t: 'vine', c: '#7B1FA2', fruit: 'grape' }, 'Fires grapes into three lanes at once.', 'multi'),

  // Epic
  P('flytrap', 'Venus Flytrap', 'epic', 240, 'trap', { t: 'trap', style: 'flytrap' }, 'Snaps up a whole pest, then chews for a while.', 'eat'),
  P('moonflower', 'Moonflower', 'epic', 300, 'sun', { t: 'flower', c: '#ECEFF1', center: '#B0BEC5', petals: 5, style: 'moon' }, 'Glows with stored light: lots of sun.'),
  P('ghostpepper', 'Ghost Pepper', 'epic', 270, 'bomb', { t: 'bush', c: '#FF7043', fruit: 'ghost' }, 'Spooky hot. Scorches three lanes.', 'lanes3'),
  P('lemontree', 'Lemon Tree', 'epic', 330, 'shooter', { t: 'tree', c: '#FDD835' }, 'Sour lemons hurt AND slow.', 'sour'),
  P('pitcher', 'Pitcher Plant', 'epic', 280, 'trap', { t: 'trap', style: 'pitcher' }, 'Pests that touch it slip in. Gulp.', 'eat'),
  P('dragonfruit', 'Dragon Fruit', 'epic', 300, 'shooter', { t: 'cactus', c: '#E91E63', style: 'dragon' }, 'Shoots fiery fruit that burns over time.', 'fire'),
  P('pineapple', 'Pineapple', 'epic', 260, 'wall', { t: 'pineapple' }, 'A spiky, juicy bunker.', 'thorns'),
  P('lotus', 'Lotus', 'epic', 320, 'support', { t: 'flower', c: '#F8BBD0', center: '#FFEB3B', petals: 8, style: 'lotus' }, 'Heals every plant in its lane and beside it.', 'lane'),

  // Legendary
  P('goldenapple', 'Golden Apple Tree', 'legendary', 720, 'sun', { t: 'tree', c: '#FFC400', gold: true }, 'A legend. Gold harvests, endless sunlight.'),
  P('giantpumpkin', 'Giant Pumpkin', 'legendary', 600, 'wall', { t: 'vine', c: '#EF6C00', fruit: 'giant' }, 'Prize-winning. Practically unbreakable.'),
  P('corpseflower', 'Corpse Flower', 'legendary', 660, 'bomb', { t: 'trap', style: 'corpse' }, 'Its stench blasts every pest on the field.', 'all'),
  P('oak', 'Ancient Oak', 'legendary', 690, 'shooter', { t: 'tree', c: '#6D8B3A', oak: true }, 'Hurls acorns into every lane.', 'oak'),
];

// ---------------------------------------------------------------------------
// Tools (14): battle spells, and some have a garden power with a cooldown.
// Weather (9): battle spells. Decor (9): passive bonuses in decor slots.
// spell.target: lane | all | area (3×3) | front (front-most pest)
// ---------------------------------------------------------------------------
const T = (id, name, rarity, art, desc, spell, garden) => ({ id, name, type: 'tool', rarity, art, desc, spell, garden });
const TOOLS = [
  T('wateringcan', 'Watering Can', 'common', { t: 'wateringcan', c: '#4FA3D8' }, 'Garden: water every plot. Battle: heal a lane.', { cost: 50, cd: 12, target: 'lane', heal: 120 }, { effect: 'waterAll', cd: 120 }),
  T('rake', 'Hand Rake', 'common', { t: 'rake' }, 'Battle: rake pests in a lane back.', { cost: 50, cd: 14, target: 'lane', push: 1.5 }),
  T('spray', 'Spray Bottle', 'common', { t: 'spray' }, 'Battle: soak a lane: damage and slow.', { cost: 75, cd: 14, target: 'lane', dmg: 60, slow: 0.5, slowFor: 3 }),
  T('trowel', 'Trowel', 'common', { t: 'trowel' }, 'Garden: speed one plant up by 15 min. Battle: whack the front pest.', { cost: 50, cd: 10, target: 'front', dmg: 160 }, { effect: 'speedOne', minutes: 15, cd: 240 }),
  T('fertilizer', 'Fertilizer', 'uncommon', { t: 'bag', c: '#8D6E63' }, 'Garden: double your next harvest. Battle: plants attack twice as fast for 8 s.', { cost: 100, cd: 30, target: 'all', haste: 8 }, { effect: 'doubleNext', cd: 360 }),
  T('shears', 'Garden Shears', 'uncommon', { t: 'shears' }, 'Battle: snip every pest in a lane.', { cost: 100, cd: 18, target: 'lane', dmg: 140 }),
  T('bugnet', 'Bug Net', 'uncommon', { t: 'net' }, 'Battle: scoop up the front pest (not bosses).', { cost: 100, cd: 25, target: 'front', remove: true }),
  T('hoe', 'Hoe', 'uncommon', { t: 'hoe' }, 'Battle: chop a 3×3 area.', { cost: 100, cd: 16, target: 'area', dmg: 180 }),
  T('wheelbarrow', 'Wheelbarrow', 'rare', { t: 'wheelbarrow' }, 'Garden: harvest everything ripe. Battle: roll over a lane.', { cost: 150, cd: 25, target: 'lane', dmg: 300 }, { effect: 'harvestAll', cd: 0 }),
  T('sprinkler', 'Sprinkler', 'rare', { t: 'sprinkler' }, 'Garden: water everything for twice as long. Battle: heal every plant.', { cost: 125, cd: 25, target: 'all', heal: 200 }, { effect: 'waterAllLong', cd: 180 }),
  T('leafblower', 'Leaf Blower', 'rare', { t: 'blower' }, 'Battle: blow every pest back up the field.', { cost: 150, cd: 30, target: 'all', push: 1.5 }),
  T('greenhouse', 'Greenhouse Kit', 'epic', { t: 'greenhouse' }, 'Garden: +50% growth for 2 h. Battle: shield every plant.', { cost: 150, cd: 35, target: 'all', shield: 300 }, { effect: 'growBoost', hours: 2, cd: 720 }),
  T('goldenhoe', 'Golden Hoe', 'epic', { t: 'hoe', gold: true }, 'Garden: +50% coins for 1 h. Battle: a huge 3×3 chop.', { cost: 175, cd: 25, target: 'area', dmg: 500 }, { effect: 'coinBoost', hours: 1, cd: 720 }),
  T('magiccan', 'Magic Watering Can', 'legendary', { t: 'wateringcan', c: '#B388FF', magic: true }, 'Garden: ripen everything instantly. Battle: full heal and +150 sun.', { cost: 200, cd: 60, target: 'all', heal: 9999, sun: 150 }, { effect: 'ripenAll', cd: 1440 }),
];

const W = (id, name, rarity, art, desc, spell) => ({ id, name, type: 'weather', rarity, art, desc, spell });
const WEATHER = [
  W('drizzle', 'Drizzle', 'common', { t: 'cloud', rain: 2 }, 'Gentle rain heals every plant a little.', { cost: 50, cd: 15, target: 'all', heal: 60 }),
  W('breeze', 'Breeze', 'common', { t: 'wind' }, 'Nudges every pest back.', { cost: 50, cd: 18, target: 'all', push: 0.6 }),
  W('sunshine', 'Sunshine', 'uncommon', { t: 'sun' }, '+75 sunlight right now.', { cost: 0, cd: 30, target: 'all', sun: 75 }),
  W('fog', 'Fog', 'uncommon', { t: 'fog' }, 'Pests lose their way: 50% slower for 8 s.', { cost: 75, cd: 25, target: 'all', slow: 0.5, slowFor: 8 }),
  W('rainshower', 'Rain Shower', 'rare', { t: 'cloud', rain: 4 }, 'Heals every plant and adds sunlight.', { cost: 100, cd: 25, target: 'all', heal: 150, sun: 25 }),
  W('heatwave', 'Heatwave', 'rare', { t: 'heat' }, 'Scorches every pest on the field.', { cost: 125, cd: 30, target: 'all', dmg: 90 }),
  W('frost', 'Frost', 'epic', { t: 'snow' }, 'Freezes every pest solid for 4 s.', { cost: 125, cd: 35, target: 'all', freeze: 4 }),
  W('thunder', 'Thunderstorm', 'epic', { t: 'storm' }, 'Lightning strikes 6 pests hard.', { cost: 150, cd: 35, target: 'all', strikes: 6, dmg: 220 }),
  W('rainbow', 'Rainbow', 'legendary', { t: 'rainbow' }, 'Full heal, +150 sun, and every pest slows down.', { cost: 150, cd: 60, target: 'all', heal: 9999, sun: 150, slow: 0.5, slowFor: 10 }),
];

const D = (id, name, rarity, art, desc, bonus) => ({ id, name, type: 'decor', rarity, art, desc, bonus });
const DECOR = [
  D('gnome', 'Garden Gnome', 'common', { t: 'gnome' }, '+5% coins from harvests.', { coins: 0.05 }),
  D('birdhouse', 'Birdhouse', 'common', { t: 'birdhouse' }, '+5% XP from harvests.', { xp: 0.05 }),
  D('stones', 'Stepping Stones', 'uncommon', { t: 'stones' }, 'Plants grow 5% faster.', { speed: 0.05 }),
  D('birdbath', 'Birdbath', 'uncommon', { t: 'birdbath' }, 'Watering lasts 30% longer.', { water: 0.3 }),
  D('windchime', 'Wind Chime', 'rare', { t: 'chime' }, 'Better odds of Rare+ cards in packs.', { luck: 0.15 }),
  D('sundial', 'Sundial', 'rare', { t: 'sundial' }, 'Plants grow 10% faster.', { speed: 0.1 }),
  D('beehive', 'Beehive', 'epic', { t: 'beehive' }, 'Flowers give +25% coins.', { flowers: 0.25 }),
  D('scarecrow', 'Scarecrow', 'epic', { t: 'scarecrow' }, 'Start every battle with +50 sunlight.', { battleSun: 50 }),
  D('fountain', 'Fairy Fountain', 'legendary', { t: 'fountain' }, '+15% coins and XP; crops wilt half as fast.', { coins: 0.15, xp: 0.15, wilt: 0.5 }),
];

export const CARDS = [...PLANTS, ...TOOLS, ...WEATHER, ...DECOR];
export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c]));
export const TYPES = { plant: 'Plant', tool: 'Tool', weather: 'Weather', decor: 'Decor' };

// ---------------------------------------------------------------------------
// Garden numbers
// ---------------------------------------------------------------------------

/** Coins from one harvest (before decor/boosts). */
export function harvestCoins(card, level = 1) {
  return Math.round((10 + card.grow * 2) * RARITIES[card.rarity].coin * levelMult(level));
}
export const harvestXp = (card, level = 1) => Math.round((4 + card.grow * 0.5) * levelMult(level));
/** Seed cost to plant: about a quarter of the harvest. */
export const seedCost = (card) => Math.max(2, Math.round(harvestCoins(card) * 0.25));
export const growMinutes = (card, level = 1) => card.grow * (1 - 0.05 * (level - 1));

// ---------------------------------------------------------------------------
// Battle numbers: derived from role + rarity + level so cards stay balanced.
// ---------------------------------------------------------------------------
const ROLE = {
  //          cost  recharge  hp
  shooter: { cost: 100, cd: 7, hp: 300, dmg: 20, rate: 1.4 },
  sun: { cost: 50, cd: 8, hp: 250, sun: 25, every: 10 },
  wall: { cost: 50, cd: 20, hp: 1400 },
  bomb: { cost: 150, cd: 30, dmg: 380 },
  slow: { cost: 100, cd: 8, hp: 300, dmg: 12, rate: 1.6, slow: 0.5, slowFor: 2 },
  trap: { cost: 100, cd: 16, hp: 700, thorns: 22 },
  support: { cost: 100, cd: 15, hp: 300, heal: 40, every: 4 },
};
const SUN_COST_ADD = { common: 0, uncommon: 15, rare: 25, epic: 50, legendary: 75 };

export function battleStats(card, level = 1) {
  if (card.type !== 'plant') {
    return { ...card.spell, power: RARITIES[card.rarity].mult * levelMult(level) };
  }
  const r = RARITIES[card.rarity];
  const m = r.mult * levelMult(level);
  const base = ROLE[card.role];
  const s = { role: card.role, mod: card.mod, cost: base.cost + (card.role === 'sun' ? SUN_COST_ADD[card.rarity] : r.cost), cd: base.cd };
  if (base.hp) s.hp = Math.round(base.hp * m);
  switch (card.role) {
    case 'shooter': {
      s.dmg = base.dmg * m; s.rate = base.rate;
      if (card.mod === 'rapid') { s.dmg *= 0.6; s.rate = 0.7; }
      if (card.mod === 'heavy') { s.dmg *= 2.4; s.rate = 2.3; }
      if (card.mod === 'lob') { s.dmg *= 1.8; s.rate = 2.4; s.splash = 0.7; }
      if (card.mod === 'splash') { s.splash = 0.6; }
      if (card.mod === 'multi') { s.lanes = 3; s.dmg *= 0.8; }
      if (card.mod === 'oak') { s.lanes = 5; s.dmg *= 1.1; s.rate = 1.8; }
      if (card.mod === 'pierce') { s.pierce = true; }
      if (card.mod === 'sour') { s.slow = 0.6; s.slowFor = 2; }
      if (card.mod === 'fire') { s.burn = 8 * m; }
      break;
    }
    case 'sun':
      s.sun = Math.round(base.sun * (card.rarity === 'common' ? 1 : card.rarity === 'uncommon' ? 1.2 : card.rarity === 'rare' ? 1.6 : card.rarity === 'epic' ? 2.2 : 3) * levelMult(level));
      s.every = base.every;
      break;
    case 'bomb': s.dmg = base.dmg * m; s.area = card.mod || 'cell3'; break;
    case 'slow':
      s.dmg = base.dmg * m; s.rate = base.rate; s.slow = base.slow; s.slowFor = base.slowFor;
      if (card.mod === 'aura') { s.aura = 2.5; s.dmg = 6 * m; }
      if (card.mod === 'frost') { s.slow = 0.75; s.slowFor = 3; }
      break;
    case 'trap':
      s.thorns = base.thorns * m;
      if (card.mod === 'eat') { s.eat = true; s.chew = card.id === 'pitcher' ? 6 : 8; }
      break;
    case 'support': s.heal = base.heal * m; s.every = base.every; if (card.mod === 'lane') s.healLane = true; break;
    case 'wall': if (card.mod === 'thorns') s.thorns = 18 * m; break;
  }
  return s;
}

/** Short stat line for card faces. */
export function statLine(card, level = 1) {
  if (card.type === 'decor') return card.desc;
  const s = battleStats(card, level);
  if (card.type !== 'plant') return `${s.cost} ☀ · ${card.desc}`;
  const bits = [`${s.cost} ☀`];
  if (s.hp) bits.push(`${s.hp} HP`);
  if (s.role === 'shooter') bits.push(`${Math.round(s.dmg)} dmg`);
  if (s.role === 'sun') bits.push(`+${s.sun} ☀/${s.every}s`);
  if (s.role === 'bomb') bits.push(`${Math.round(s.dmg)} blast`);
  if (s.role === 'support') bits.push(`+${Math.round(s.heal)} heal`);
  return bits.join(' · ');
}

export const ROLE_NAMES = { sun: 'Sun-maker', shooter: 'Shooter', wall: 'Wall', bomb: 'Bomb', slow: 'Slower', trap: 'Trap', support: 'Healer' };
