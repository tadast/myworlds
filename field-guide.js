// myworlds — the field guide: the creatures and the plants the reader has studied, on each world.
//
// A creature or a plant is undiscovered until the reader finds it on the planet and opens its card.
// The Planet window shows an undiscovered one as a locked card, and the study button names it only
// after the find. See docs/ui.md.
//
// A creature is one species of the world, so the guide keeps its index in world.species. A plant
// belongs to a patch, and its name reads the biome of that patch, so the guide keeps the name the
// card showed. The store keeps one record for each seed, newest last, and drops the oldest past
// MAX_SEEDS, as carrier-store.js does.
//
//   guideOf(seed)               `{ fauna: [kind], flora: [name] }`, empty for a world with no find
//   noteAnimal(seed, kind)      true when the creature is new to the guide
//   notePlant(seed, name)       true when the plant is new to the guide
export const GUIDE_KEY = 'myworlds.guide.v1';
export const MAX_SEEDS = 200;

// The page reads the guide every frame, through the study button, so the parsed store stays in
// memory. A write from another tab drops it.
let cache = null;
if (typeof addEventListener === 'function') addEventListener('storage', (e) => { if (e.key === GUIDE_KEY) cache = null; });

function readAll() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(GUIDE_KEY) || '{}'); } catch { cache = {}; }
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};
  return cache;
}

function writeAll(all) {
  const seeds = Object.keys(all);
  for (const s of seeds.slice(0, Math.max(0, seeds.length - MAX_SEEDS))) delete all[s];
  cache = all;
  try { localStorage.setItem(GUIDE_KEY, JSON.stringify(all)); } catch { /* the guide is a nicety: a full store keeps the old one */ }
}

// One record, cleaned: a hand edit or an older build cannot give the page a bad list.
function clean(rec) {
  const fauna = Array.isArray(rec && rec.fauna) ? rec.fauna.filter((k) => Number.isInteger(k) && k >= 0) : [];
  const flora = Array.isArray(rec && rec.flora) ? rec.flora.filter((n) => typeof n === 'string' && n) : [];
  return { fauna, flora };
}

export function guideOf(seed) {
  return clean(readAll()[seed]);
}

// The record of a seed moves to the end of the store on each find, so the oldest world goes first.
function note(seed, add) {
  const all = readAll();
  const rec = clean(all[seed]);
  if (!add(rec)) return false;
  delete all[seed];
  all[seed] = rec;
  writeAll(all);
  return true;
}

export function noteAnimal(seed, kind) {
  return note(seed, (rec) => !rec.fauna.includes(kind) && rec.fauna.push(kind) > 0);
}

export function notePlant(seed, name) {
  return note(seed, (rec) => !!name && !rec.flora.includes(name) && rec.flora.push(name) > 0);
}
