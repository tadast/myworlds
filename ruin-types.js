// myworlds — the ruin types: the eight protos a ruin can take, and the pure functions of the seed
// that name the ruin of a world. Phase 2, p2-35. See docs/ruin.md and
// docs/issues/p2-00-the-second-signal.md.
//
// It holds no three.js and no DOM, on the pattern of world-types.js, so the worker, the page, and
// the tools import it. makeRuin() in generate.js places the ruin; this file names it. Since p2-42
// it also holds the script of the glyphs and the text of the card of the ruin, so the Node checks
// test both with no browser.
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
export const SYLLABLES = ['ka', 'zu', 'vek', 'tho', 'ryn', 'sae', 'quo', 'lor',
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

// ---------------------------------------------------------------- the glyphs, p2-42
// The script of the makers: 26 glyphs, one for each letter from a to z. Every world shares this one
// script, so the line of the way on on two worlds with one portal seed is one line, and the later
// issue that opens the way reads the same glyphs. Do not change a glyph: a reader may have drawn it.
//
// A glyph is a list of strokes in a box of 1 by 1, with x to the right and y down. A stroke is a
// list of points [x, y], and the card draws it as one line through them. A stroke of one point is
// a dot. The glyphs hang from a rule at y = 0 that the card draws across the whole word, so most
// glyphs start a stroke on that rule. No glyph is a letter of the Latin alphabet, so the line does
// not read as a word.
export const GLYPHS = Object.freeze([
  /* a */ [[[0.5, 0], [0.5, 0.7], [0.2, 1]], [[0.8, 0.45]]],
  /* b */ [[[0.25, 0], [0.25, 1]], [[0.75, 0], [0.75, 0.45], [0.25, 0.75]]],
  /* c */ [[[0.5, 0], [0.5, 0.4]], [[0.5, 0.4], [0.15, 1], [0.85, 1], [0.5, 0.4]]],
  /* d */ [[[0.2, 0], [0.2, 0.6], [0.8, 0.6], [0.8, 1]]],
  /* e */ [[[0.8, 0], [0.8, 0.6], [0.2, 0.6], [0.2, 1]]],
  /* f */ [[[0.5, 0], [0.5, 1]], [[0.5, 0.35], [0.15, 0.65]], [[0.5, 0.35], [0.85, 0.65]]],
  /* g */ [[[0.5, 0], [0.5, 0.45]], [[0.5, 0.45], [0.15, 0.72], [0.5, 1], [0.85, 0.72], [0.5, 0.45]]],
  /* h */ [[[0.2, 0], [0.2, 1]], [[0.2, 0.3], [0.8, 0.3], [0.8, 0.8]]],
  /* i */ [[[0.5, 0], [0.5, 0.72]], [[0.5, 0.95]]],
  /* j */ [[[0.2, 0], [0.8, 0.5], [0.2, 1]]],
  /* k */ [[[0.8, 0], [0.2, 0.5], [0.8, 1]]],
  /* l */ [[[0.5, 0], [0.5, 1]], [[0.15, 0.5], [0.85, 0.5]]],
  /* m */ [[[0.2, 0], [0.2, 0.7], [0.5, 1], [0.8, 0.7], [0.8, 0]]],
  /* n */ [[[0.5, 0], [0.5, 0.3]], [[0.15, 1], [0.15, 0.3], [0.85, 0.3], [0.85, 1]]],
  /* o */ [[[0.5, 0], [0.5, 0.35]], [[0.2, 0.35], [0.8, 0.35], [0.8, 1], [0.2, 1], [0.2, 0.35]]],
  /* p */ [[[0.2, 0], [0.2, 1]], [[0.7, 0.35]], [[0.7, 0.75]]],
  /* q */ [[[0.5, 0], [0.15, 0.5], [0.5, 1], [0.85, 0.5], [0.5, 0]]],
  /* r */ [[[0.2, 0], [0.2, 0.4], [0.8, 0.4]], [[0.5, 0.4], [0.5, 1]]],
  /* s */ [[[0.8, 0], [0.2, 0.35], [0.8, 0.7], [0.2, 1]]],
  /* t */ [[[0.2, 0], [0.8, 1]], [[0.8, 0], [0.8, 0.4]]],
  /* u */ [[[0.15, 0], [0.15, 0.8]], [[0.5, 0], [0.5, 1]], [[0.85, 0], [0.85, 0.8]]],
  /* v */ [[[0.5, 0], [0.5, 0.5]], [[0.15, 1], [0.5, 0.5], [0.85, 1]]],
  /* w */ [[[0.2, 0], [0.5, 0.45], [0.8, 0]], [[0.5, 0.45], [0.5, 1]]],
  /* x */ [[[0.5, 0], [0.5, 1]], [[0.2, 0.25], [0.8, 0.5]], [[0.2, 0.55], [0.8, 0.8]]],
  /* y */ [[[0.2, 0], [0.2, 0.5], [0.8, 1]], [[0.8, 0], [0.8, 0.5]]],
  /* z */ [[[0.5, 0], [0.5, 0.6]], [[0.15, 0.6], [0.85, 0.6]], [[0.5, 0.92]]],
].map((g) => Object.freeze(g.map((s) => Object.freeze(s.map((p) => Object.freeze(p)))))));

// The glyphs of one word, one for each character, in order. The case does not count, so 'Kavek'
// and 'kavek' give one line. A character that is not a letter from a to z gives an empty glyph, a
// gap. It is a pure function of the word: the same word gives the same strokes on every call.
export function glyphsOf(word) {
  return Array.from(String(word == null ? '' : word).toLowerCase(), (ch) => {
    const k = ch.charCodeAt(0) - 97;
    return k >= 0 && k < GLYPHS.length ? GLYPHS[k] : [];
  });
}

// ---------------------------------------------------------------- the card, p2-42
// The parts of a proto that the maker sizes: the door of the dome, the doors of the hive, and the
// steps of the well. ruin-geometry.js builds each part at `k` times the height of the maker, inside
// [lo, hi] units, because a part must fit the wall it stands in. The card says that the part fits
// the body of the maker only when the top of that range does not cut it. The hive holds its doors
// under the step of a terrace, 5 units, less 0.8.
export const MAKER_PARTS = Object.freeze({
  dome: Object.freeze({ k: 1.3, lo: 3, hi: 9, line: 'The door in the base ring fits that body.' }),
  hive: Object.freeze({ k: 1.15, lo: 1.2, hi: 4.2, line: 'The doors of the mounds fit that body.' }),
  well: Object.freeze({ k: 0.8, lo: 0.9, hi: 4, line: 'The steps down the shaft fit that body.' }),
});

// True when the maker sets the part of the proto and the top of its range does not cut it.
export function makerFits(proto, maker) {
  const p = MAKER_PARTS[proto];
  return !!p && p.k * ((maker && maker.height) || 1.8) <= p.hi;
}

// The words for the body of a maker. A species maker takes the words of its locomotion, the way the
// fauna card shows the body; a rolled maker takes the count of its limbs. A winged maker has two
// legs and two wings, which is `limbs` 4 in world.ruin.maker.
const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
const LOCO_BODY = {
  monopod: 'one leg', biped: 'two legs', tripod: 'three legs', quad: 'four legs', hexapod: 'six legs',
  serpent: 'no legs', slinger: 'two legs', plough: 'four legs', wings: 'two legs and two wings',
};
// A slinger, a plough, and a winged animal carry no leg on the fauna card, and the limbs of p2-35
// give their makers legs. The carvings show the makers, so the card states the legs and then what
// the living animal has, and the card and the fauna card never disagree.
const NO_LEGS_NOW = new Set(['slinger', 'plough', 'wings']);
export function limbWords(limbs) {
  const n = Math.max(0, Math.round(Number(limbs) || 0));
  if (n === 1) return 'one leg';
  return `${COUNT[n] || String(n)} legs`;
}

// A height in metres to the nearest half metre, as the card prints it: '3', '3.5', '1.5'.
const halfMetre = (h) => {
  const v = Math.round(Number(h) * 2) / 2;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

// The text of the card of the ruin: the name, the line under it, and the rows in the order of p2-42.
// Each row is a label and one or two plain sentences in the voice of the log. It reads the world and
// writes nothing, and it holds no DOM, so tools/ruin-check.mjs tests it in Node. Null for a world
// with no ruin.
//
//   name   the name of the proto on the card
//   sub    'Ruin · sends on 7.316 MHz'
//   rows   [{ key, label, text }], and the last row, `way`, also holds `glyphs`
export function ruinCard(world) {
  const ruin = world && world.ruin;
  if (!ruin) return null;
  const row = protoRow(ruin.proto) || RUIN_PROTOS[0];
  const maker = ruin.maker || { species: -1, limbs: 2, height: 1.8, rolled: true };
  const G = !maker.rolled && maker.species >= 0 && world.species ? world.species[maker.species] : null;
  const log = world.source && world.source.log;

  // Makers, decision 4. The name of a species is the name of the fauna card, in the case of a
  // sentence, as the log writes it.
  const makers = [];
  if (G && G.lore) {
    makers.push(`The carvings show a body with ${LOCO_BODY[G.loco] || limbWords(maker.limbs)}.`);
    makers.push(`It is the body of the ${G.lore.name.toLowerCase()}.`);
    if (NO_LEGS_NOW.has(G.loco)) makers.push('The ones that live here now have no legs.');
  } else {
    makers.push(`The carvings show a body with ${limbWords(maker.limbs)} and a height of about ${halfMetre(maker.height)} metres.`);
    makers.push('No animal of this world has that body.');
  }
  if (makerFits(ruin.proto, maker)) makers.push(MAKER_PARTS[ruin.proto].line);

  // The call, decision 6: the day of the beacon and the ship, from the log of the wreck. Two
  // sentences, because the log holds no sentence over 20 words.
  const ship = log && log.probe ? ` of the log of ${log.probe}` : ' of the log';
  const call = log && log.beacon
    ? `It began to send on day ${log.beacon}${ship}. That was the day the crew put the beacon on the mast.`
    : 'It began to send on the day the crew put the beacon on the mast.';

  return {
    name: row.name,
    sub: `Ruin · sends on ${ruin.freq} MHz`,
    rows: [
      { key: 'size', label: 'Size', text: `It stands ${row.height} metres high and ${row.disc * 2} metres across.` },
      { key: 'age', label: 'Age', text: 'Older than the rock it stands on. The probe cannot date it.' },
      { key: 'stone', label: 'Stone', text: world.type === 'lava' ? 'A stone that takes the heat and holds it.' : 'A stone this world does not make.' },
      { key: 'makers', label: 'Makers', text: makers.join(' ') },
      { key: 'call', label: 'The call', text: call },
      // Chapter 3: the line is a name, and the reader reads it. See way-types.js.
      { key: 'way', label: 'The way on', text: 'The probe reads a name here, in the script of the makers. The stones answer when the name is sent back.', glyphs: glyphsOf(portalSeed(world)) },
    ],
  };
}

// ---------------------------------------------------------------- the body of the maker, p2-43
// The words for the body the carvings show, as the card states them: the words of the locomotion
// for a maker of a species, and the count of the limbs for a rolled maker. `G` is the genome of the
// species, or null for a rolled maker. `legless` is true when the carvings give legs to an animal
// that has none now: a slinger, a plough, or a winged animal. `height` is the height of a rolled
// maker to the nearest half metre, as the card prints it. The second log of the crew reads the same
// words, so the log and the card never disagree on the body. Null for a world with no ruin.
export function makerBody(world) {
  const ruin = world && world.ruin;
  if (!ruin) return null;
  const maker = ruin.maker || { species: -1, limbs: 2, height: 1.8, rolled: true };
  const G = !maker.rolled && maker.species >= 0 && world.species ? world.species[maker.species] || null : null;
  if (G && G.lore) {
    return { words: LOCO_BODY[G.loco] || limbWords(maker.limbs), G, legless: NO_LEGS_NOW.has(G.loco),
      limbs: maker.limbs, height: halfMetre(maker.height) };
  }
  return { words: limbWords(maker.limbs), G: null, legless: false, limbs: maker.limbs, height: halfMetre(maker.height) };
}

// ---------------------------------------------------------------- the traces of the crew, p2-43
// The crew that went to the call left traces at the ruin, by decision 3 of p2-00. `all` and `some`
// left a camp: the shelter, its airlock, crates, a flag, and the rover when the crew came in it.
// `one` left a cairn of stones with a small case on top. `none` left nothing.
//
// ruinCamp() in generate.js places the traces and keeps the plants off them, and wreck-geometry.js
// builds them, so both read the layout here and the two cannot part. The layout is in the frame of
// the camp, before the scale: x points at the middle of the ruin, so the door of the shelter faces
// the stones, z runs along the edge of the disc, and y is up. A footprint is a list of circles
// [x, z, r] that holds every part, and the mask of the plants and the pad of the ground read them.
//
//   scale   the camp of the wreck stands at 0.85. The band between the flat disc and the outer edge
//           of the spires and of the floaters is 9.6 units, and the camp must fit inside it
//   gap     units of clear ground between the flat disc and the nearest part of the camp. The body of
//           a ruin touches the ground at most 0.52 units past the flat disc
//   ease    units over which the pad of the camp eases back to the ground around it
export const RUIN_CAMP = Object.freeze({
  scale: 0.8,
  gap: 1,
  ease: 3,
  // the shelter, its airlock, two crates by the door, and the flag with its cloth
  camp: Object.freeze([[0, 0, 3.4], [3.6, 0, 1.1], [4.4, 2.0, 0.8], [3.6, -2.3, 0.8], [-0.2, -4.2, 1.0]]),
  // the rover, parked along the edge of the disc beside the shelter
  rover: Object.freeze([[-0.5, 5.3, 1.5], [-0.5, 7.7, 1.5]]),
  // the cairn and its case
  cairn: Object.freeze([[0, 0, 1.3]]),
  // the parts the builder places, in the same frame and units
  flag: Object.freeze([-1, -4.2]),        // the foot of the pole
  roverAt: Object.freeze([-0.5, 6.5]),    // the middle of the rover
});

// The circles of the footprint of one trace, in the frame of the camp and after the scale. `kind` is
// 'camp' or 'cairn', and `rover` says whether the rover stands at the camp.
export function campLayout(kind, rover) {
  const k = RUIN_CAMP.scale;
  const list = kind === 'cairn' ? RUIN_CAMP.cairn : rover ? RUIN_CAMP.camp.concat(RUIN_CAMP.rover) : RUIN_CAMP.camp;
  return list.map(([x, z, r]) => [x * k, z * k, r * k]);
}

// The circles of the footprint of a trace in the frame of the patch: `info` is patch.source.camp,
// { kind, x, y, z, yaw, rover }. The yaw turns the camp about y as three.js turns a group: the x axis
// of the camp goes to (cos yaw, -sin yaw) in the patch.
export function campCircles(info) {
  if (!info) return [];
  const c = Math.cos(info.yaw || 0), s = Math.sin(info.yaw || 0);
  return campLayout(info.kind, info.rover).map(([x, z, r]) => ({
    x: info.x + c * x + s * z, z: info.z - s * x + c * z, r,
  }));
}
