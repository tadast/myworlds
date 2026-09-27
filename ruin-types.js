// myworlds — the ruin types: the eight protos a ruin can take, and the pure functions of the seed
// that name the ruin of a world. Phase 2, p2-35. See docs/ruin.md and
// docs/issues/p2-00-the-second-signal.md.
//
// It holds no three.js and no DOM, on the pattern of world-types.js, so the worker, the page, and
// the tools import it. makeRuin() in generate.js places the ruin; this file names it.
//
// Every pick here is a hash of the seed and not a draw from a stream of generate.js, as hullOf()
// in wreck-geometry.js picks a hull. So no stream of a world draws one number more, and the
// proto, the frequency, and the seed of the way on are the same on every tier and on every load.

// The protos, in the order of the table of p2-00. protoOf() picks among the rows that fit a world
// type in this order, so the order is part of the contract: do not sort it.
//
//   id      the name in the code and in world.ruin.proto
//   name    the name on the card of the ruin
//   fits    the world types that can hold it
//   disc    the radius of the flat ground the patch lays, in units of the box
//   height  the height of the tallest part, in units. The mast of the wreck stands 18
//   light   where the light of the ruin stands. The card and the geometry read it
export const RUIN_PROTOS = [
  { id: 'spires', name: 'Needle spires', fits: ['ice', 'ocean', 'lava'], disc: 24, height: 88,
    light: 'the tip of the tallest spire, and a band on each spire' },
  { id: 'dome', name: 'Broken dome', fits: ['desert', 'terran'], disc: 36, height: 28,
    light: 'a core on a plinth inside the ribs' },
  { id: 'arches', name: 'Arch causeway', fits: ['ocean', 'terran'], disc: 52, height: 30,
    light: 'the keystone of the first arch' },
  { id: 'well', name: 'The deep well', fits: ['ice', 'desert', 'lava'], disc: 30, height: 25,
    light: 'the floor of the shaft, and the cap of each pylon' },
  { id: 'floaters', name: 'Floating stones', fits: ['exotic'], disc: 24, height: 36,
    light: 'a core that the slabs turn around' },
  { id: 'colossus', name: 'Fallen maker', fits: ['terran', 'desert', 'ice'], disc: 38, height: 22,
    light: 'the eye, and the palm of the hand that stands' },
  { id: 'ring', name: 'The ring', fits: ['exotic', 'lava', 'ocean'], disc: 30, height: 38,
    light: 'the inner edge of the ring' },
  { id: 'hive', name: 'Hive colony', fits: ['exotic', 'ocean', 'terran'], disc: 55, height: 30,
    light: 'the doors at the foot of each mound, and a crown on the great mound' },
];

// FNV-1a over the characters of a string, as hullOf() in wreck-geometry.js and motifOf() in
// music.js have it. No avalanche, so the hash of a string is the hash those files take.
function fnv(s) {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// The avalanche of a word, for a second number from one hash. It is a bijection, so two inputs
// never give one output.
function mix(h) {
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

const seedOf = (world) => String((world && world.seed) || '');

// The row of an id, or null.
export function protoRow(id) {
  return RUIN_PROTOS.find((p) => p.id === id) || null;
}

// The proto of the ruin of a world: the id of one row that fits the type of the world. The FNV
// hash of 'ruin:' + seed picks among those rows in the order of the table. A gas giant gives null,
// because no row fits it.
export function protoOf(world) {
  const type = world && world.type;
  const list = RUIN_PROTOS.filter((p) => p.fits.includes(type));
  if (!list.length) return null;
  return list[fnv('ruin:' + seedOf(world)) % list.length].id;
}

// The frequency of the ruin, as the log and the overlay print it without the unit: 'N.NNN', from
// 3.000 to 29.999 MHz. Three digits after the point always, so '5.070' and not '5.07'. The FNV
// hash of 'freq:' + seed picks the number.
export const FREQ_MIN = 3000;     // kHz: 3.000 MHz
export const FREQ_MAX = 29999;    // kHz: 29.999 MHz
export function freqOf(seed) {
  const k = FREQ_MIN + fnv('freq:' + String(seed == null ? '' : seed)) % (FREQ_MAX - FREQ_MIN + 1);
  return `${Math.floor(k / 1000)}.${String(k % 1000).padStart(3, '0')}`;
}

// A frequency the reader typed, as a number of MHz, or null. The rules:
//
// - Spaces at the two ends go, and a trailing 'MHz' in any case goes with the spaces before it.
// - A comma is the point, so '7,316' is 7.316.
// - A number of four digits or more with no point takes a point before its last three digits,
//   because the reader who types '7316' means the number the log prints. '7' stays 7.
// - Anything else gives null: letters, an empty field, two points, a sign.
//
// '7.316', '7,316', '7316', and ' 7.316 mhz ' all give 7.316. 'abc', '', and '7.3.1' give null.
export function parseFreq(text) {
  if (text == null) return null;
  let s = String(text).trim().replace(/\s*mhz$/i, '').trim().replace(/,/g, '.');
  if (/^\d+$/.test(s)) {
    if (s.length >= 4) s = s.slice(0, -3) + '.' + s.slice(-3);
  } else if (!/^(\d+\.\d*|\.\d+)$/.test(s)) {
    return null;
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

// The seed of the world the way on names. p2-42 draws it as glyphs, and a later issue opens that
// world. It is two to four syllables from the list below, capitalised, so it reads as a name.
//
// No word of two to four of these syllables, with no syllable twice in a row, is a word of the
// word list of macOS (/usr/share/dict/words and propernames, 2026-09-27). Test a change of the
// list the same way before it goes in.
const SYLLABLES = ['ka', 'zu', 'vek', 'tho', 'ryn', 'sae', 'quo', 'lor',
  'myr', 'ix', 'ol', 'shen', 'dra', 'yve', 'kor', 'uun'];

export function portalSeed(world) {
  const seed = seedOf(world);
  const h = fnv('portal:' + seed);
  const count = 2 + h % 3;
  const idx = [];
  for (let i = 0; i < count; i++) {
    let k = mix((h + Math.imul(i + 1, 0x9e3779b9)) >>> 0) % SYLLABLES.length;
    if (i > 0 && k === idx[i - 1]) k = (k + 1) % SYLLABLES.length;   // no syllable twice in a row
    idx.push(k);
  }
  const word = () => {
    const w = idx.map((k) => SYLLABLES[k]).join('');
    return w[0].toUpperCase() + w.slice(1);
  };
  // The way on never names the world it stands on. On a match the last syllable moves on to the
  // next one of the list. The rest of the word stays, so the word changes and one step is enough.
  let out = word();
  while (out.toLowerCase() === seed.toLowerCase()) {
    let k = (idx[count - 1] + 1) % SYLLABLES.length;
    if (k === idx[count - 2]) k = (k + 1) % SYLLABLES.length;
    idx[count - 1] = k;
    out = word();
  }
  return out;
}

// One of eight words for a bearing in degrees, with north at 0 and east at 90. The word covers
// 22.5 degrees each way, and a bearing on the line between two words takes the one clockwise.
export const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export function compass8(brg) {
  const b = ((Number(brg) % 360) + 360) % 360;
  return COMPASS[Math.round(b / 45) % 8];
}
