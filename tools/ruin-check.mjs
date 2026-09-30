// The ruin of phase 2, with no browser. p2-35.
//
//   node tools/ruin-check.mjs                500 seeds on LOW; every tenth also on HIGH
//   node tools/ruin-check.mjs --seeds 100    another count of seeds
//
// Later issues of phase 2 add to this file. Six checks run now:
//
// 1. The hashes of ruin-types.js. parseFreq() takes every form p2-35 names and refuses the rest.
//    compass8() gives its eight words and puts a bearing on the line between two words clockwise.
//    freqOf() prints three decimals from 3.000 to 29.999. protoOf() reaches, for each world type,
//    exactly the protos of the table of p2-00, and nothing for a gas giant. portalSeed() reads as a
//    name and never names its own world.
// 2. The place. Every world with a wreck has a ruin, or the report names the world. The arc from
//    the wreck lies inside the band the world took, and inside CARRIER_REACH of site.js. The ruin
//    stands on the middle of its cell, off the cell of the wreck and of the activity, and the
//    tests of makeRuin() pass on it: over the beach band, under the slope, inside the latitude,
//    and SOURCE_KEEP cells from the activity. `from` is compass8() of bearingTo() in site.js, from
//    the site of the wreck.
// 3. The maker. It is the species decision 4 of p2-00 names, or a rolled body when no species can
//    build, and its limbs and its height follow the rules of p2-35.
// 4. The tiers and the cache. A world rides back through worker.js, so the ruin must survive the
//    clone. HIGH and LOW give one ruin, key for key. A world built again after another world gives
//    the same ruin.
// 5. The patch of the ruin, p2-41. On every tenth world with a ruin, on the first two worlds of
//    each proto, and on HIGH for every 50th seed, the patch of the cell of the ruin holds
//    patch.source = { kind: 'ruin', proto, x, y, z, yaw } and nothing more. The disc of the proto
//    is flat and dry, and the whole disc with its soft edge stands inside the reach, so the reader
//    can walk round the ruin. No plant stands on the disc with its soft edge, no group anchor stands
//    within its spread of it, and no member starts on it. Every part of the body that touches the
//    ground stands on the flat disc at the yaw of the patch, so the line of the arches fits. The
//    floor takes the stone of the fine pattern. On every 50th seed the patch is the same when it
//    builds again after another world, and the cell next to the ruin holds no ruin.
//    tools/world-checksum.mjs proves that every patch off the cell of the ruin did not move.
// 6. The card, p2-42. The script of 26 glyphs, and glyphsOf() over the seeds of the way on of part
//    1: two seeds of the way on give two lines. On every world with a ruin, the text of ruinCard():
//    the name, the rows in order, the makers row against the species or the rolled body and the
//    fauna card, the door or the steps, the day and the ship of the call, the glyphs of the way on,
//    and no sentence over 20 words.
//
// The copies of the rules below come from the text of p2-35, p2-00, and p2-41, and not from
// generate.js, so a slip in generate.js cannot pass its own check. The ground tests read the field
// of the globe, which only generate.js holds, so placeFacts() gives the check those numbers.
//
// site.js and ruin-geometry.js take three.js by a bare name; three-hook.mjs resolves it in Node.
import { root } from './three-hook.mjs';

const { TIERS, worldOpts, patchOpts } = await import(root + 'tiers.js');
const { CELL, dirCell, cellDir, cellSite, sameCell, boxHeading } = await import(root + 'cell-grid.js');
const { ruinGeometry } = await import(root + 'ruin-geometry.js');
const S = await import(root + 'site.js');
const R = await import(root + 'ruin-types.js');
const { Species } = await import(root + 'species.js');
const { SourceLore } = await import(root + 'source-lore.js');

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const SEEDS = arg('seeds', 500);
const HIGH_EVERY = 10;      // every tenth seed also builds on HIGH
const COLD_EVERY = 25;      // every 25th seed builds again after another world

// The bands of p2-35, in cells of arc from the wreck, in the order makeRuin() takes them.
const BANDS = [[12, 35], [6, 80], [2, 120]];
// The protos each world type allows, from the second table of p2-00.
const TYPE_PROTOS = {
  terran: ['dome', 'arches', 'colossus', 'hive'],
  ocean: ['spires', 'arches', 'ring', 'hive'],
  desert: ['dome', 'well', 'colossus'],
  ice: ['spires', 'well', 'colossus'],
  lava: ['spires', 'well', 'ring'],
  exotic: ['floaters', 'ring', 'hive'],
  gas: [],
};
const PROTO_ORDER = ['spires', 'dome', 'arches', 'well', 'floaters', 'colossus', 'ring', 'hive'];
// The maker of p2-35: the ways of moving that can build, in order, and the limbs by locomotion.
const MAKER_MOTION = ['mwalk', 'mcrawl', 'msling', 'mdig', 'mfly'];
const MAKER_LIMBS = { monopod: 1, biped: 2, tripod: 3, quad: 4, hexapod: 6, serpent: 0, slinger: 2, plough: 4, wings: 4 };

const holes = [];
const hole = (msg) => { if (holes.length < 60) holes.push(msg); else if (holes.length === 60) holes.push('...'); };

// ---------------------------------------------------------------- 1. the hashes
const FREQ_OK = [
  ['7.316', 7.316], ['7,316', 7.316], ['7316', 7.316], [' 7.316 mhz ', 7.316], ['7.316 MHz', 7.316],
  ['7.316MHz', 7.316], ['7,316 Mhz', 7.316], ['29999', 29.999], ['3.000', 3], ['5.07', 5.07],
  ['12', 12], ['406.025', 406.025], ['406025', 406.025], ['07316', 7.316], ['7.', 7],
];
const FREQ_NULL = ['abc', '', '7.3.1', '   ', 'MHz', '7.316 kHz', '-7.316', '7 316', '7,3.1', '1e3', '7.316 MHz MHz', null, undefined];
for (const [text, want] of FREQ_OK) {
  const got = R.parseFreq(text);
  if (got !== want) hole(`parseFreq(${JSON.stringify(text)}) gives ${got}, not ${want}`);
}
for (const text of FREQ_NULL) {
  const got = R.parseFreq(text);
  if (got !== null) hole(`parseFreq(${JSON.stringify(text)}) gives ${got}, not null`);
}

const COMPASS_CASES = [
  [0, 'north'], [45, 'north-east'], [90, 'east'], [135, 'south-east'], [180, 'south'],
  [225, 'south-west'], [270, 'west'], [315, 'north-west'], [360, 'north'], [720, 'north'],
  [-45, 'north-west'], [-90, 'west'], [359.9, 'north'], [22.4, 'north'], [22.5, 'north-east'],
  [67.4, 'north-east'], [67.5, 'east'], [337.4, 'north-west'], [337.5, 'north'], [202.5, 'south-west'],
];
for (const [brg, want] of COMPASS_CASES) {
  const got = R.compass8(brg);
  if (got !== want) hole(`compass8(${brg}) gives ${got}, not ${want}`);
}

if (JSON.stringify(R.RUIN_PROTOS.map((p) => p.id)) !== JSON.stringify(PROTO_ORDER)) {
  hole(`RUIN_PROTOS is not in the order of the table: ${R.RUIN_PROTOS.map((p) => p.id).join(', ')}`);
}
for (const p of R.RUIN_PROTOS) {
  if (!p.name || !p.light || !(p.disc > 0) || !(p.height > 0) || !Array.isArray(p.fits)) hole(`proto ${p.id}: a field is missing`);
}
// Every type reaches exactly its protos, over worlds that hold only a seed and a type.
for (const [type, want] of Object.entries(TYPE_PROTOS)) {
  const got = new Set();
  for (let i = 0; i < 400; i++) got.add(R.protoOf({ seed: `proto-${i}`, type }));
  const list = [...got].filter((x) => x !== null);
  if (type === 'gas') { if (list.length || !got.has(null)) hole('protoOf() gives a proto for a gas giant'); continue; }
  if (got.has(null)) hole(`protoOf() gives null for a ${type} world`);
  const order = list.sort((a, b) => PROTO_ORDER.indexOf(a) - PROTO_ORDER.indexOf(b));
  if (JSON.stringify(order) !== JSON.stringify(want)) hole(`protoOf() reaches ${order.join(', ')} on ${type}, not ${want.join(', ')}`);
}

const freqs = new Set();
let freqLow = Infinity, freqHigh = -Infinity, freqZeroEnd = 0;
const portals = [];
for (let i = 0; i < 2000; i++) {
  const seed = `freq-${i}`;
  const f = R.freqOf(seed);
  freqs.add(f);
  if (!/^\d{1,2}\.\d{3}$/.test(f)) hole(`freqOf(${seed}) gives '${f}', which is not N.NNN`);
  const v = Number(f);
  freqLow = Math.min(freqLow, v); freqHigh = Math.max(freqHigh, v);
  if (v < 3 || v > 29.999) hole(`freqOf(${seed}) gives ${f}, outside 3.000 to 29.999`);
  if (f.endsWith('0')) freqZeroEnd++;
  if (R.freqOf(seed) !== f) hole(`freqOf(${seed}) gives two answers`);
  // The reader types the number the log prints, in each form the field takes.
  for (const typed of [f, f.replace('.', ','), f.replace('.', ''), ` ${f} MHz `]) {
    if (R.parseFreq(typed) !== v) hole(`parseFreq('${typed}') does not give ${v}`);
  }
  const p = R.portalSeed({ seed });
  portals.push(p);
  if (!/^[A-Z][a-z]{3,15}$/.test(p)) hole(`portalSeed(${seed}) gives '${p}', which does not read as a name`);
  if (p.toLowerCase() === seed.toLowerCase()) hole(`portalSeed(${seed}) names its own world`);
  if (R.portalSeed({ seed }) !== p) hole(`portalSeed(${seed}) gives two answers`);
}
// The way on of a world named by a way on must name another world again.
for (const p of portals) {
  if (R.portalSeed({ seed: p }).toLowerCase() === p.toLowerCase()) hole(`portalSeed(${p}) names its own world`);
}
if (freqZeroEnd === 0) hole('no frequency ends in 0 over 2,000 seeds, so the three decimals went untested');

// ---------------------------------------------------------------- 1b. the glyphs, p2-42
// One fixed script of 26 glyphs, one for each letter. Every point stands in the box of 1 by 1,
// every glyph hangs from the rule at y = 0, no two glyphs are one glyph, and glyphsOf() gives the
// same strokes for a letter in either case, every time. Two portal seeds give two lines, and one
// portal seed gives one line.
const GLYPH_KEY = (g) => JSON.stringify(g);
if (R.GLYPHS.length !== 26) hole(`the script holds ${R.GLYPHS.length} glyphs, not 26`);
const glyphKeys = new Set();
R.GLYPHS.forEach((g, k) => {
  const ch = String.fromCharCode(97 + k);
  if (!g.length) hole(`the glyph of '${ch}' holds no stroke`);
  let hangs = false;
  for (const s of g) {
    if (!s.length) hole(`the glyph of '${ch}' holds an empty stroke`);
    for (const [x, y] of s) {
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) hole(`the glyph of '${ch}' has the point ${x}, ${y} outside its box`);
      if (y === 0) hangs = true;
    }
  }
  if (!hangs) hole(`the glyph of '${ch}' does not hang from the rule`);
  glyphKeys.add(GLYPH_KEY(g));
  if (R.glyphsOf(ch)[0] !== g || R.glyphsOf(ch.toUpperCase())[0] !== g) hole(`glyphsOf('${ch}') does not give its glyph`);
});
if (glyphKeys.size !== 26) hole(`the script holds ${26 - glyphKeys.size} glyphs twice`);
if (R.glyphsOf('Ka-vek').length !== 6 || R.glyphsOf('Ka-vek')[2].length !== 0) hole('glyphsOf() does not give a gap for a character that is not a letter');
const lines = new Map();
for (const p of portals) {
  const line = GLYPH_KEY(R.glyphsOf(p));
  if (line !== GLYPH_KEY(R.glyphsOf(p))) hole(`the glyphs of ${p} change from call to call`);
  if (R.glyphsOf(p).length !== p.length) hole(`the glyphs of ${p} are not one glyph per letter`);
  const seen = lines.get(line);
  if (seen && seen !== p.toLowerCase()) hole(`the portal seeds ${seen} and ${p} give one line of glyphs`);
  lines.set(line, p.toLowerCase());
}

// ---------------------------------------------------------------- 6. the card, p2-42
// The text of the card of the ruin, from ruinCard() of ruin-types.js. The rules are the rows of
// p2-42, copied from its text:
//   the name of the proto, and 'Ruin · sends on 7.316 MHz' under it;
//   Size, Age, Stone, Makers, The call, and The way on, in this order;
//   Makers names the species of the world and the limbs of its body, or a rolled body that no animal
//   of the world has, and says that a door or the steps fit the body where the proto sizes one;
//   The call names the day of the beacon and the ship of the log of the wreck;
//   The way on draws the glyphs of portalSeed(), and no text says "Coming soon", which only the chip
//   says; every sentence holds 20 words or less, as every sentence of the log does.
// The legs of the body the fauna card shows, from legPlan() of fauna.js: a slinger, a plough, and a
// winged animal carry none.
const CARD_ROWS = ['Size', 'Age', 'Stone', 'Makers', 'The call', 'The way on'];
const FAUNA_LEGS = { monopod: 1, biped: 2, tripod: 3, quad: 4, hexapod: 6, serpent: 0, slinger: 0, plough: 0, wings: 0 };
const WORDS = { no: 0, one: 1, two: 2, three: 3, four: 4, six: 6 };
let cardRuns = 0, cardSpecies = 0, cardRolled = 0, cardFits = 0, cardLongest = 0;
function checkCard(seed, w) {
  const r = w.ruin, c = R.ruinCard(w);
  cardRuns++;
  if (!c) { hole(`${seed}: a world with a ruin gives no card`); return; }
  const row = R.protoRow(r.proto);
  if (c.name !== row.name) hole(`${seed}: the card names '${c.name}' and not '${row.name}'`);
  if (c.sub !== `Ruin · sends on ${r.freq} MHz`) hole(`${seed}: the line under the name reads '${c.sub}'`);
  if (c.rows.map((x) => x.label).join('|') !== CARD_ROWS.join('|')) hole(`${seed}: the rows read ${c.rows.map((x) => x.label).join(', ')}`);
  const text = Object.fromEntries(c.rows.map((x) => [x.label, x.text]));
  for (const x of c.rows) {
    if (/coming soon/i.test(x.text)) hole(`${seed}: the row ${x.label} says "Coming soon"`);
    for (const sent of x.text.split(/(?<=\.)\s+/)) {
      const n = sent.split(/\s+/).length;
      cardLongest = Math.max(cardLongest, n);
      if (n > 20) hole(`${seed}: a sentence of ${n} words in the row ${x.label}: ${sent}`);
    }
  }
  if (!text.Size.includes(`${row.height} metres high`) || !text.Size.includes(`${row.disc * 2} metres across`)) hole(`${seed}: the size row reads '${text.Size}'`);
  if (text.Stone !== (w.type === 'lava' ? 'A stone that takes the heat and holds it.' : 'A stone this world does not make.')) hole(`${seed}: the stone row reads '${text.Stone}' on a ${w.type} world`);
  // Makers
  const mk = r.maker, mt = text.Makers;
  const body = /a body with (\w+) legs?( and two wings)?/.exec(mt);
  if (!body || !(body[1] in WORDS)) { hole(`${seed}: the makers row states no body: '${mt}'`); return; }
  const legs = WORDS[body[1]], wings = body[2] ? 2 : 0;
  if (legs + wings !== mk.limbs) hole(`${seed}: the makers row states ${legs} legs and ${wings} wings for a maker of ${mk.limbs} limbs`);
  if (mk.rolled) {
    cardRolled++;
    if (!mt.includes('No animal of this world has that body.')) hole(`${seed}: a rolled maker and the row does not say no animal has that body`);
    const h = /a height of about ([\d.]+) metres/.exec(mt);
    if (!h || Math.abs(Number(h[1]) - mk.height) > 0.25) hole(`${seed}: a rolled maker of ${mk.height} m and the row reads '${mt}'`);
  } else {
    cardSpecies++;
    const g = w.species[mk.species];
    if (!mt.includes(`It is the body of the ${g.lore.name.toLowerCase()}.`)) hole(`${seed}: the makers row does not name ${g.lore.name}: '${mt}'`);
    const live = FAUNA_LEGS[g.loco];
    const noLegsNow = mt.includes('The ones that live here now have no legs.');
    if (live === legs && noLegsNow) hole(`${seed}: a ${g.loco} maker of ${legs} legs and the row says the living ones have none`);
    if (live !== legs && !(live === 0 && noLegsNow)) hole(`${seed}: the carvings show ${legs} legs, the fauna card of the ${g.loco} shows ${live}, and the row does not say so`);
  }
  const part = R.MAKER_PARTS[r.proto];
  const fits = !!part && part.k * mk.height <= part.hi;
  if (fits) cardFits++;
  if (fits !== !!(part && mt.includes(part.line))) hole(`${seed}: the ${r.proto} of a maker of ${mk.height} m and the row reads '${mt}'`);
  // The call
  const log = w.source.log;
  if (!text['The call'].startsWith(`It began to send on day ${log.beacon} of the log of ${log.probe}.`)) hole(`${seed}: the call row reads '${text['The call']}', and the log has day ${log.beacon} and ${log.probe}`);
  // The way on
  const way = c.rows[c.rows.length - 1];
  if (GLYPH_KEY(way.glyphs) !== GLYPH_KEY(R.glyphsOf(R.portalSeed(w)))) hole(`${seed}: the way on does not draw the glyphs of portalSeed()`);
  if (JSON.stringify(R.ruinCard(w)) !== JSON.stringify(c)) hole(`${seed}: the card gives two texts`);
}

// ---------------------------------------------------------------- 2 to 4. the worlds
// The check runs generation through worker.js, as world-checksum.mjs does, so it reads the world
// the page receives: the stub of self clones each reply and transfers its buffers.
let reply = null;
globalThis.self = {
  postMessage(msg, transfer) { if (msg.type !== 'progress') reply = structuredClone(msg, { transfer }); },
};
await import(root + 'worker.js');
const G = await import(root + 'generate.js');   // the same module worker.js runs

function world(seed, tier) {
  reply = null;
  globalThis.self.onmessage({ data: { type: 'generate', seed, opts: worldOpts(tier) } });
  if (!reply) throw new Error(`"${seed}" sent no reply`);
  if (reply.type === 'error') throw new Error(reply.message);
  return reply.result.world;
}

function patch(seed, site, tier) {
  reply = null;
  globalThis.self.onmessage({ data: { type: 'patch', seed, site: { ...site, kind: -1 }, opts: patchOpts(tier) } });
  if (!reply) throw new Error(`the patch of "${seed}" sent no reply`);
  if (reply.type === 'error') throw new Error(reply.message);
  return reply.result;
}

// ---------------------------------------------------------------- 5. the patch of the ruin
// The rules of p2-41, copied from its text and from docs/ruin.md.
const PATCH_EVERY = 10;     // every tenth world with a ruin builds the patch of the ruin on LOW
const PATCH_HIGH = 50;      // every 50th seed builds it on HIGH too, and again after another world
const PATCH_FIRST = 2;      // and the first two worlds of each proto, so every proto is tested
const RUIN_EDGE = 0.4;      // the soft edge outside the flat disc, as a part of the disc
const PATCH_KEYS = 'kind,proto,x,y,z,yaw';
const STONE_MIN = 6;        // fifteenths of bare rock the middle of the floor holds at least
const patchByProto = {};
let patchRuns = 0, patchHigh = 0, patchCold = 0;
let flatWorst = 0, reachSlack = Infinity, plantGap = Infinity, groupGap = Infinity, footWorst = 0;

const hashOf = (p) => {
  let h = 2166136261;
  for (const arr of [p.heights, p.colors, p.flora, p.surface, p.groups, p.members]) {
    const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619); }
  }
  return `${(h >>> 0).toString(16)} ${JSON.stringify(p.patch.source)}`;
};

// The patch of the cell of the ruin on one tier, held to the rules above. Gives the hash.
function checkRuinPatch(seed, w, tier, tag) {
  const r = w.ruin;
  const site = cellSite(dirCell(r.dir[0], r.dir[1], r.dir[2]));
  const p = patch(seed, site, tier);
  const P = p.patch, s = P.source, row = R.protoRow(r.proto);
  const where = `${seed} ${tag} (${w.type}, ${r.proto})`;
  if (!s || s.kind !== 'ruin') { hole(`${where}: the cell of the ruin holds ${s ? s.kind : 'nothing'}`); return null; }
  const keys = r.log ? PATCH_KEYS + ',camp' : PATCH_KEYS;
  if (Object.keys(s).join(',') !== keys) hole(`${where}: patch.source holds ${Object.keys(s).join(', ')}`);
  if (s.proto !== r.proto) hole(`${where}: the patch holds a ${s.proto}`);
  if (!(s.yaw >= 0 && s.yaw < Math.PI * 2)) hole(`${where}: yaw ${s.yaw}`);
  if (P.activity) hole(`${where}: the cell of the ruin holds the phenomenon too`);
  const flat = row.disc, outer = flat * (1 + RUIN_EDGE);
  const half = P.size / 2, reach = half - P.floraEdge, n = P.n, g = P.grid;
  // the reach: the reader can walk round the whole disc
  const slack = reach - (Math.hypot(s.x, s.z) + outer);
  reachSlack = Math.min(reachSlack, slack);
  if (slack < -1e-6) hole(`${where}: the disc reaches ${(-slack).toFixed(1)} units past the reach`);
  // the disc is flat and dry, and its floor is stone
  if (!(s.y > 0)) hole(`${where}: the middle stands at ${s.y.toFixed(2)}, in the water`);
  const at = (x, z) => ((Math.round((z + half) / g)) * n + Math.round((x + half) / g));
  for (let j = 0; j < n; j++) {
    const z = -half + j * g;
    if (Math.abs(z - s.z) > flat) continue;
    for (let i = 0; i < n; i++) {
      const x = -half + i * g;
      if (Math.hypot(x - s.x, z - s.z) > flat) continue;
      const dev = Math.abs(p.heights[j * n + i] - s.y);
      flatWorst = Math.max(flatWorst, dev);
      if (dev > 1e-3) { hole(`${where}: the disc is not flat at ${x}, ${z}: ${dev.toFixed(3)}`); break; }
    }
  }
  if ((p.surface[at(s.x, s.z)] >> 4) < STONE_MIN) hole(`${where}: the floor holds ${p.surface[at(s.x, s.z)] >> 4} fifteenths of rock`);
  // nothing grows on it, and no group starts on it
  for (let k = 0; k < p.flora.length; k += 8) {
    const d = Math.hypot(p.flora[k] - s.x, p.flora[k + 2] - s.z);
    plantGap = Math.min(plantGap, d - outer);
    if (d < outer) { hole(`${where}: a plant stands ${d.toFixed(1)} units from the middle of a disc of ${outer.toFixed(1)}`); break; }
  }
  const gs = p.groups, ms = p.members;
  for (let k = 0; k < gs.length; k += 6) {
    const d = Math.hypot(gs[k] - s.x, gs[k + 1] - s.z) - gs[k + 4];
    groupGap = Math.min(groupGap, d - outer);
    if (d < outer) hole(`${where}: a group of spread ${gs[k + 4].toFixed(1)} stands ${(d + gs[k + 4]).toFixed(1)} units from the middle`);
  }
  // A member stands at its offset from the anchor, and the formation turns with the anchor, so the
  // test takes the length of the offset and not its way.
  for (let k = 0; k < ms.length; k += 4) {
    const a = ms[k] * 6, d = Math.hypot(gs[a] - s.x, gs[a + 1] - s.z) - Math.hypot(ms[k + 1], ms[k + 2]);
    if (d < outer) { hole(`${where}: a member can start ${d.toFixed(1)} units from the middle`); break; }
  }
  // The body stands on the flat disc: every vertex that touches the ground lies inside the disc.
  // The yaw turns the body about the middle of the disc and keeps every distance, so the line of
  // the arches fits the disc at every yaw. ruin-geometry-check.mjs holds the parts inside disc + 1,
  // and the same margin holds here.
  const geo = ruinGeometry(r.proto, w).body, pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    if (pos.getY(v) > 0.5) continue;
    const d = Math.hypot(pos.getX(v), pos.getZ(v));
    footWorst = Math.max(footWorst, d - flat);
    if (d > flat + 1) { hole(`${where}: a part touches the ground ${d.toFixed(1)} units out, past the disc of ${flat}`); break; }
  }
  // The traces of the crew, p2-43, decision 3 of p2-00: a camp for `all` and `some`, a cairn for
  // `one`, and nothing for `none`. The rover stands at the camp when the goers came in it.
  checkCamp(where, w, r, p, s, geo, flat, outer);
  geo.dispose();
  patchRuns++;
  patchByProto[r.proto] = (patchByProto[r.proto] || 0) + 1;
  return hashOf(p);
}

// The rules of p2-43, from its text and from docs/ruin.md: the trace stands at the edge of the
// disc, on the side the crew came from, off the body, and inside the disc with its soft edge, on a
// pad at the height of the floor. No plant and no group stands on it.
const CAMP_GAP = 1;         // units of clear ground from the flat disc to the nearest part
const CAMP_TURN = 0.5;      // rad: the most the trace stands off the way to the wreck
const CAMP_EASE = 3;        // units: the pad eases back to the ground over this
let campRuns = 0, cairnRuns = 0, roverRuns = 0, campBody = Infinity, campEdge = Infinity, campTurn = 0;
function checkCamp(where, w, r, p, s, geo, flat, outer) {
  const log = r.log, c = s.camp;
  if (!log) { if (c) hole(`${where}: nobody went and the ruin holds a trace`); return; }
  if (!c) { hole(`${where}: went "${log.went}" and the ruin holds no trace`); return; }
  const kind = log.went === 'one' ? 'cairn' : 'camp';
  if (c.kind !== kind) hole(`${where}: went "${log.went}" and the trace is a ${c.kind}`);
  if (c.rover !== (kind === 'camp' && log.by === 'rover')) hole(`${where}: the goers came by ${log.by} and the rover ${c.rover ? 'stands' : 'does not stand'} at the camp`);
  if (kind === 'camp') campRuns++; else cairnRuns++;
  if (c.rover) roverRuns++;
  if (Math.abs(c.y - s.y) > 1e-9) hole(`${where}: the trace stands at ${c.y}, and the floor at ${s.y}`);
  // The side the crew came from: the way to the wreck in the box, within the turn of the draw.
  const cell = dirCell(r.dir[0], r.dir[1], r.dir[2]);
  const h = boxHeading(cell, w.source.dir);
  const dx = c.x - s.x, dz = c.z - s.z;
  const turn = Math.acos(Math.max(-1, Math.min(1, (dx * h.x + dz * h.z) / Math.hypot(dx, dz))));
  campTurn = Math.max(campTurn, turn);
  if (turn > CAMP_TURN + 1e-6) hole(`${where}: the trace stands ${(turn * 180 / Math.PI).toFixed(1)} degrees off the way to the wreck`);
  // Inside the disc with its soft edge, and off the body: every vertex of the body, the glow, and
  // the orbit, at any height, stands clear of every circle of the footprint.
  const circles = R.campCircles(c);
  const parts = ruinGeometry(r.proto, w);
  const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
  let clear = Infinity;
  for (const g of [parts.body, parts.glow, parts.orbit]) {
    if (!g) continue;
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const lx = pos.getX(v), lz = pos.getZ(v);
      const x = s.x + cy * lx + sy * lz, z = s.z - sy * lx + cy * lz;
      for (const q of circles) clear = Math.min(clear, Math.hypot(x - q.x, z - q.z) - q.r);
    }
    g.dispose();
  }
  campBody = Math.min(campBody, clear);
  if (clear < CAMP_GAP * 0.5) hole(`${where}: the ${c.kind} stands ${clear.toFixed(2)} units from the body`);
  for (const q of circles) {
    const d = Math.hypot(q.x - s.x, q.z - s.z);
    campEdge = Math.min(campEdge, outer - (d + q.r));
    if (d + q.r > outer) hole(`${where}: the ${c.kind} reaches ${(d + q.r - outer).toFixed(2)} units past the soft edge`);
    if (d - q.r < flat + CAMP_GAP - 1e-6) hole(`${where}: the ${c.kind} reaches into the flat disc`);
  }
  // The pad: every node under a circle stands at the height of the floor.
  const half = p.patch.size / 2, n = p.patch.n, g = p.patch.grid;
  for (const q of circles) {
    for (let j = Math.floor((q.z - q.r + half) / g); j <= Math.ceil((q.z + q.r + half) / g); j++) {
      for (let i = Math.floor((q.x - q.r + half) / g); i <= Math.ceil((q.x + q.r + half) / g); i++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        if (Math.hypot(-half + i * g - q.x, -half + j * g - q.z) > q.r) continue;
        const dev = Math.abs(p.heights[j * n + i] - s.y);
        if (dev > 1e-3) { hole(`${where}: the pad of the ${c.kind} is not flat: ${dev.toFixed(3)}`); return; }
      }
    }
  }
  // No plant on the pad, and no group within its spread of it.
  for (let k = 0; k < p.flora.length; k += 8) {
    for (const q of circles) {
      if (Math.hypot(p.flora[k] - q.x, p.flora[k + 2] - q.z) < q.r + CAMP_EASE) { hole(`${where}: a plant stands on the ${c.kind}`); return; }
    }
  }
  for (let k = 0; k < p.groups.length; k += 6) {
    for (const q of circles) {
      if (Math.hypot(p.groups[k] - q.x, p.groups[k + 1] - q.z) - p.groups[k + 4] < q.r + CAMP_EASE) hole(`${where}: a group stands on the ${c.kind}`);
    }
  }
}

// The patch after another world is the same patch, and the cell next to the ruin holds no ruin.
function checkRuinCache(seed, w, tier, first, other) {
  const r = w.ruin, cell = dirCell(r.dir[0], r.dir[1], r.dir[2]);
  world(other, tier);
  const site = cellSite(cell);
  const again = hashOf(patch(seed, site, tier));
  if (again !== first) hole(`${seed}: the patch of the ruin differs after another world`);
  const next = { face: cell.face, i: cell.i > 0 ? cell.i - 1 : cell.i + 1, j: cell.j, n: cell.n };
  const np = patch(seed, cellSite(next), tier);
  if (np.patch.source && np.patch.source.kind === 'ruin') hole(`${seed}: the cell next to the ruin holds a ruin`);
  patchCold++;
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mid = (d) => cellDir(dirCell(d[0], d[1], d[2]), 0.5, 0.5, [0, 0, 0]);
const byBand = [0, 0, 0];
const byProto = {}, byMotion = {}, byFrom = {}, byWent = {};
let surface = 0, wrecks = 0, ruins = 0, rolled = 0, highRuns = 0, coldRuns = 0;
let arcMin = Infinity, arcMax = -Infinity;
const missing = [], fellBack = [];
const t0 = Date.now();

for (let i = 0; i < SEEDS; i++) {
  const seed = `ruin-${i}`;
  const w = world(seed, TIERS.LOW);
  const r = w.ruin;
  if (!('ruin' in w)) hole(`${seed}: the world carries no ruin key`);
  if (w.type === 'gas') { if (r !== null) hole(`${seed}: a gas giant holds a ruin`); continue; }
  surface++;
  if (!w.source) { if (r !== null) hole(`${seed}: a world with no wreck holds a ruin`); continue; }
  wrecks++;
  if (!r) { missing.push(`${seed} (${w.type})`); continue; }
  ruins++;

  // The shape and the hashes.
  if (r.kind !== 'ruin') hole(`${seed}: kind is ${r.kind}`);
  // The second log of p2-43: null when nobody went, and a log of the goers when somebody did.
  const went = w.source.log && w.source.log.went;
  if ((r.log === null) !== (went === 'none')) hole(`${seed}: went "${went}" and the second log is ${r.log === null ? 'null' : 'written'}`);
  if (r.log && r.log.went !== went) hole(`${seed}: the second log went "${r.log.went}" and the first "${went}"`);
  if (went) byWent[went] = (byWent[went] || 0) + 1;
  if (r.proto !== R.protoOf(w) || !TYPE_PROTOS[w.type].includes(r.proto)) hole(`${seed}: proto ${r.proto} on a ${w.type} world`);
  if (r.freq !== R.freqOf(seed)) hole(`${seed}: freq ${r.freq} is not freqOf() of the seed`);
  byProto[r.proto] = (byProto[r.proto] || 0) + 1;

  // The place.
  const d = r.dir, src = w.source.dir;
  const m = mid(d);
  if (Math.abs(m[0] - d[0]) + Math.abs(m[1] - d[1]) + Math.abs(m[2] - d[2]) > 1e-12) hole(`${seed}: the ruin is not on the middle of its cell`);
  const cell = dirCell(d[0], d[1], d[2]);
  if (sameCell(cell, dirCell(src[0], src[1], src[2]))) hole(`${seed}: the ruin shares the cell of the wreck`);
  const act = w.activity && w.activity.dir;
  if (act && sameCell(cell, dirCell(act[0], act[1], act[2]))) hole(`${seed}: the ruin shares the cell of the activity`);
  if (!(r.band >= 0 && r.band < BANDS.length)) { hole(`${seed}: band ${r.band} is not a band`); continue; }
  byBand[r.band]++;
  if (r.band > 0) fellBack.push(`${seed} (${w.type}, band ${r.band})`);
  const arc = Math.acos(Math.min(1, dot(src, d))) / CELL;
  arcMin = Math.min(arcMin, arc); arcMax = Math.max(arcMax, arc);
  const [lo, hi] = BANDS[r.band];
  if (arc < lo - 1e-9 || arc > hi + 1e-9) hole(`${seed}: the ruin stands ${arc.toFixed(3)} cells from the wreck, outside band ${r.band} (${lo} to ${hi})`);
  const at = S.sourceSite(w);
  if (S.arcTo(at, d) > S.CARRIER_REACH) hole(`${seed}: a fix at the wreck does not hear the ruin`);
  const facts = G.placeFacts(seed, worldOpts(TIERS.LOW), d);
  if (!(facts.h > facts.beachW)) hole(`${seed}: the ruin stands at ${facts.h.toFixed(4)}, not over the beach band ${facts.beachW}`);
  if (!(facts.slope < facts.maxSlope)) hole(`${seed}: the ruin stands on a slope of ${facts.slope.toFixed(3)}`);
  if (Math.abs(Math.asin(d[1])) * 180 / Math.PI > facts.maxLat + 1e-9) hole(`${seed}: the ruin stands past ${facts.maxLat} degrees of latitude`);
  if (act && dot(d, mid(act)) > Math.cos(facts.keep * CELL)) hole(`${seed}: the ruin stands inside ${facts.keep} cells of the activity`);
  const brg = S.bearingTo(at, d);
  if (r.from !== R.compass8(brg)) hole(`${seed}: from is ${r.from}, and bearingTo() reads ${brg.toFixed(3)} degrees, ${R.compass8(brg)}`);
  byFrom[r.from] = (byFrom[r.from] || 0) + 1;

  // The maker.
  // Chapter 3 pushes the kin of a rolled maker onto the species, after the maker. It lives only at
  // the twin, so the rule of the maker reads the species of the world without it.
  const mk = r.maker, sp = (w.species || []).filter((g) => !g.kin);
  const motions = sp.map((g) => SourceLore.motionOf(g));
  const firstMotion = MAKER_MOTION.find((x) => motions.includes(x));
  if (mk.rolled) {
    rolled++;
    byMotion.rolled = (byMotion.rolled || 0) + 1;
    if (firstMotion) hole(`${seed}: a rolled maker on a world with a ${firstMotion} species`);
    if (mk.species !== -1) hole(`${seed}: a rolled maker names species ${mk.species}`);
    if (![2, 3, 4, 6].includes(mk.limbs)) hole(`${seed}: a rolled maker with ${mk.limbs} limbs`);
    if (!(mk.height >= 1.5 && mk.height <= 6)) hole(`${seed}: a rolled maker ${mk.height} m tall`);
  } else {
    const g = sp[mk.species];
    if (!g) { hole(`${seed}: the maker names species ${mk.species}, which the world does not hold`); continue; }
    const motion = SourceLore.motionOf(g);
    byMotion[motion] = (byMotion[motion] || 0) + 1;
    if (motion !== firstMotion) hole(`${seed}: the maker moves by ${motion}, and the world holds a ${firstMotion} species`);
    const metres = Species.bodyMetres(g).metres;
    for (let k = 0; k < sp.length; k++) {
      if (motions[k] !== motion) continue;
      const mk2 = Species.bodyMetres(sp[k]).metres;
      if (mk2 > metres || (mk2 === metres && k < mk.species)) hole(`${seed}: species ${k} is a larger ${motion} than the maker`);
    }
    if (mk.limbs !== MAKER_LIMBS[g.loco]) hole(`${seed}: a ${g.loco} maker with ${mk.limbs} limbs`);
    if (mk.height !== metres) hole(`${seed}: the maker is ${mk.height} m and the species ${metres} m`);
  }

  // The card. p2-42.
  checkCard(seed, w);

  // The tiers, and a build after another world.
  if (i % HIGH_EVERY === 0) {
    highRuns++;
    const h = world(seed, TIERS.HIGH);
    if (JSON.stringify(h.ruin) !== JSON.stringify(r)) hole(`${seed}: HIGH and LOW give two ruins`);
  }
  if (i % COLD_EVERY === 0) {
    coldRuns++;
    world(`ruin-${i + 1}`, TIERS.LOW);
    const again = world(seed, TIERS.LOW);
    if (JSON.stringify(again.ruin) !== JSON.stringify(r)) hole(`${seed}: a second build gives another ruin`);
  }

  // The patch of the ruin. p2-41.
  if (ruins % PATCH_EVERY === 1 || (patchByProto[r.proto] || 0) < PATCH_FIRST || i % PATCH_HIGH === 0) {
    checkRuinPatch(seed, w, TIERS.LOW, 'LOW');
  }
  if (i % PATCH_HIGH === 0) {
    patchHigh++;
    const first = checkRuinPatch(seed, w, TIERS.HIGH, 'HIGH');
    if (first) checkRuinCache(seed, w, TIERS.HIGH, first, `ruin-${i + 1}`);
  }
}

// ---------------------------------------------------------------- the report
const pct = (n, of) => `${(n / Math.max(of, 1) * 100).toFixed(1)}%`;
const list = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
console.log(`ruin check: ${SEEDS} seeds on LOW in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${highRuns} of them on HIGH too, ${coldRuns} built again after another world`);
console.log(`  hashes: ${FREQ_OK.length + FREQ_NULL.length} forms of parseFreq(), ${COMPASS_CASES.length} bearings of compass8(),`
  + ` ${freqs.size} frequencies from ${freqLow.toFixed(3)} to ${freqHigh.toFixed(3)}, ${portals.length} seeds of the way on`);
console.log(`  worlds: ${surface} with a surface, ${wrecks} with a wreck, ${ruins} with a ruin`);
console.log(`  bands:  12-35 ${byBand[0]} (${pct(byBand[0], ruins)}), 6-80 ${byBand[1]} (${pct(byBand[1], ruins)}),`
  + ` 2-120 ${byBand[2]} (${pct(byBand[2], ruins)}); no ruin ${missing.length} (${pct(missing.length, wrecks)})`);
console.log(`  arc:    ${arcMin.toFixed(2)} to ${arcMax.toFixed(2)} cells from the wreck`);
console.log(`  protos: ${list(byProto)}`);
console.log(`  makers: ${list(byMotion)} (${pct(rolled, ruins)} rolled)`);
console.log(`  from:   ${list(byFrom)}`);
console.log(`  patch:  ${patchRuns} patches of the ruin, ${patchHigh} of them on HIGH, ${patchCold} built again after another world;`
  + ` by proto ${list(patchByProto)}`);
console.log(`          the disc flat to ${flatWorst.toExponential(1)} units, the nearest plant ${plantGap.toFixed(1)} and the nearest group`
  + ` ${groupGap.toFixed(1)} units outside the soft edge, ${reachSlack.toFixed(1)} units of the reach to spare at the least,`
  + ` and the body at most ${footWorst.toFixed(2)} units past the flat disc`);
console.log(`  glyphs: ${R.GLYPHS.length} glyphs, all apart; ${lines.size} lines of glyphs for ${new Set(portals.map((p) => p.toLowerCase())).size} seeds of the way on`);
console.log(`  card:   ${cardRuns} cards, ${cardSpecies} makers of a species and ${cardRolled} rolled, ${cardFits} with a door or steps that fit;`
  + ` the longest sentence holds ${cardLongest} words`);
console.log(`  crew:   went ${list(byWent)}; at the patches ${campRuns} camps (${roverRuns} with the rover) and ${cairnRuns} cairns,`
  + ` the nearest body ${campBody.toFixed(2)} units off, ${campEdge.toFixed(2)} units inside the soft edge at the least,`
  + ` at most ${(campTurn * 180 / Math.PI).toFixed(1)} degrees off the way to the wreck`);
if (!campRuns || !cairnRuns || !roverRuns) hole(`the patch check reached ${campRuns} camps, ${roverRuns} rovers, and ${cairnRuns} cairns`);
if (Object.keys(patchByProto).length !== PROTO_ORDER.length) hole(`the patch check reached ${Object.keys(patchByProto).length} protos of ${PROTO_ORDER.length}`);
if (fellBack.length) console.log(`  fell back, because no cell of the first band passed the tests: ${fellBack.join(', ')}`);
if (missing.length) console.log(`  no ruin, because no cell of any band passed the tests: ${missing.join(', ')}`);
if (holes.length) {
  console.error(`\n${holes.length} holes:\n  ` + holes.join('\n  '));
  process.exitCode = 1;
} else {
  console.log('\nruin check: every test passes');
}
