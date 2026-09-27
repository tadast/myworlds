// The ruin of phase 2, with no browser. p2-35.
//
//   node tools/ruin-check.mjs                500 seeds on LOW; every tenth also on HIGH
//   node tools/ruin-check.mjs --seeds 100    another count of seeds
//
// Later issues of phase 2 add to this file. Four checks run now:
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
//
// The copies of the rules below come from the text of p2-35 and p2-00, and not from
// generate.js, so a slip in generate.js cannot pass its own check. The ground tests read the field
// of the globe, which only generate.js holds, so placeFacts() gives the check those numbers.
//
// site.js takes three.js by a bare name; three-hook.mjs resolves it in Node.
import { root } from './three-hook.mjs';

const { TIERS, worldOpts } = await import(root + 'tiers.js');
const { CELL, dirCell, cellDir, sameCell } = await import(root + 'cell-grid.js');
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

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mid = (d) => cellDir(dirCell(d[0], d[1], d[2]), 0.5, 0.5, [0, 0, 0]);
const byBand = [0, 0, 0];
const byProto = {}, byMotion = {}, byFrom = {};
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
  if (r.log !== null) hole(`${seed}: the log is not null`);
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
  const mk = r.maker, sp = w.species || [];
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
if (fellBack.length) console.log(`  fell back, because no cell of the first band passed the tests: ${fellBack.join(', ')}`);
if (missing.length) console.log(`  no ruin, because no cell of any band passed the tests: ${missing.join(', ')}`);
if (holes.length) {
  console.error(`\n${holes.length} holes:\n  ` + holes.join('\n  '));
  process.exitCode = 1;
} else {
  console.log('\nruin check: every test passes');
}
