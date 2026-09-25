// A checksum of the worlds and the patches the worker builds, with no browser.
//
//   node tools/world-checksum.mjs                 print one line per world and per patch
//   node tools/world-checksum.mjs --check         compare against the baseline file
//   node tools/world-checksum.mjs --source        the source of each seed on both tiers
//
// Record the baseline before a change that must leave the worlds alone, run it again after, and
// every hash must be equal. Issue 34 used it to prove that the source drew no number from the
// streams of the other parts of a world.
//
// Both device tiers run. The options come from tiers.js, the same place app.js takes them, so the
// check measures the worlds and the patches a reader gets and cannot drift from them.
//
// A world line hashes the arrays the reader would see change: the height map, the position and the
// colour of the globe, the flora, the clouds, the fauna, and the flora grid. Then it hashes the
// world object as JSON in two parts: the facts, which carry the genomes of the species and the
// place of the source, and last the lore, the words the lore writers give the world.
//
// A patch line hashes every array of the patch, the biome of every node and of every rim node
// among them, and the patch object as JSON in the same two parts:
// the facts, which carry the biome and the place of the wreck, and last the lore of the plants.
//
// The lore writers draw from streams of their own, so a change of wording moves the last column of
// a line and no other. A change of the ground that comes in the same commit still shows in the
// columns before it. Each world with a surface lands at
// three sites: a fixed site with a pull to the first species, the cell of the source, and the cell
// of the phenomenon when the ground can draw it.
//
// The patch call decides from its own world whether a cell holds the source or the phenomenon.
// The check holds it to that: the cell of the source holds the wreck, the fixed site and the cell
// next to the source hold none, and the cell of the phenomenon shows it when the ground can draw
// the kind. The check finds those cells with cell-grid.js and no copy of the rule.
//
// Six seeds cover the seven planet types but one. Meridian is the ice world the acceptance criteria
// of issue 34 ask for, and Mire is a gas giant, which takes the other path through generate().
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootUrl = pathToFileURL(root + '/').href;
const BASELINE = path.join(root, 'tools', 'world-checksum.baseline.txt');

const { TIERS, worldOpts, patchOpts } = await import(rootUrl + 'tiers.js');
const { dirCell, cellSite, sameCell } = await import(rootUrl + 'cell-grid.js');

const SEEDS = ['Auralis', 'Vesper', 'Meridian', 'Tessaly', 'Orin', 'Mire'];
const FIXED_SITE = { lat: 20, lon: 40, kind: 0 };

// The check runs generation through worker.js, the adapter the page talks to, so it measures what
// the page receives. The stub of self below clones each reply and transfers its buffers, as a
// browser does. A buffer that generate.js kept for a later call would then come back detached, and
// the hash of that later call would change.
let reply = null;
globalThis.self = {
  postMessage(msg, transfer) { if (msg.type !== 'progress') reply = structuredClone(msg, { transfer }); },
};
await import(rootUrl + 'worker.js');

function ask(data) {
  reply = null;
  globalThis.self.onmessage({ data });
  if (!reply) throw new Error(`${data.type} "${data.seed}" sent no reply`);
  if (reply.type === 'error') throw new Error(reply.message);
  return reply.result;
}
const world = (seed, tier) => ask({ type: 'generate', seed, opts: worldOpts(tier) });
const patch = (w, site, tier) => ask({ type: 'patch', seed: w.seed, site, opts: patchOpts(tier) });

// The cell of a thing of the world that keeps a direction, or null.
const cellOf = (thing) => (thing && thing.dir ? dirCell(thing.dir[0], thing.dir[1], thing.dir[2]) : null);
// A cell next to a cell, on the same face.
const nextTo = (c) => ({ face: c.face, i: c.i > 0 ? c.i - 1 : c.i + 1, j: c.j, n: c.n });
const fail = (msg) => { throw new Error(msg); };

// FNV-1a over the bytes of an array, with an avalanche at the end. One word is enough: a slipped
// stream moves thousands of floats, not one bit.
function hashBytes(bytes) {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619); }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0).toString(16).padStart(8, '0');
}
const hashArray = (arr) => (arr ? hashBytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)) : '-');
const hashJson = (obj) => hashBytes(new TextEncoder().encode(JSON.stringify(obj)));

// The lore of a world: the story of every species, the log of the source, the fauna line of the
// stats, and the plant words of flora-lore.js. The facts are the rest. A key
// set to undefined drops out of JSON.stringify, so the facts keep the order of the keys they had.
function splitWorld(w) {
  const lore = {
    species: (w.species || []).map((g) => g.lore),
    log: w.source ? w.source.log : null,
    fauna: w.stats && w.stats.fauna,
    floraTags: w.env && w.env.floraTags, plantWord: w.env && w.env.plantWord,
  };
  const facts = {
    ...w,
    species: (w.species || []).map((g) => ({ ...g, lore: undefined })),
    source: w.source && { ...w.source, log: undefined },
    stats: w.stats && { ...w.stats, fauna: undefined },
    env: w.env && { ...w.env, floraTags: undefined, plantWord: undefined },
  };
  return [hashJson(facts), hashJson(lore)];
}

// The lore of a patch: the lore of every plant kind it grows.
function splitPatch(p) {
  const plants = p.plants || [];
  return [hashJson({ ...p, plants: plants.map((x) => ({ ...x, lore: undefined })) }), hashJson(plants.map((x) => x.lore))];
}

const patchLine = (seed, name, label, p) => [seed, name, 'patch', label, p.patch.biome.replace(/ /g, '_'),
  hashArray(p.heights), hashArray(p.colors), hashArray(p.flora), hashArray(p.surface),
  hashArray(p.groups), hashArray(p.members), hashArray(p.rimHeights), hashArray(p.rimColors),
  hashArray(p.rimSurface),
  ...splitPatch(p.patch)].join(' ');

// A patch depends only on its arguments. On the LOW tier the source patch of each world is built a
// second time after the world of another seed, so generate.js holds another world in its cache and
// must build this one again. The two patches must be equal.
const COLD_SEED = 'Cold';

function linesFor(seed) {
  const lines = [];
  for (const name of Object.keys(TIERS)) {
    const tier = TIERS[name];
    const r = world(seed, tier);
    const w = r.world;
    lines.push([seed, name, 'world', w.type,
      hashArray(r.heightMap), hashArray(r.terrain.pos), hashArray(r.terrain.col), hashArray(r.flora),
      hashArray(r.clouds), hashArray(r.fauna), hashArray(r.floraGrid), ...splitWorld(w)].join(' '));
    if (w.type === 'gas') continue;
    const src = cellOf(w.source), act = cellOf(w.activity);
    const sites = [['fixed', FIXED_SITE], ['source', src && cellSite(src)], ['activity', act && cellSite(act)]];
    for (const [label, site] of sites) {
      if (!site) { lines.push(`${seed} ${name} patch ${label} -`); continue; }
      const p = patch(w, site, tier);
      const here = p.patch.cell;
      if (!!p.patch.source !== sameCell(here, src)) fail(`${seed} ${name} ${label}: the wreck and the cell of the source disagree`);
      if (label === 'activity') {
        // A phenomenon the ground cannot draw, such as the storm of a lightning world, keeps a
        // direction too. Its cell then builds a plain patch, and the line stays the one it was.
        if (!p.patch.activity) { lines.push(`${seed} ${name} patch ${label} -`); continue; }
      } else if (p.patch.activity && !sameCell(here, act)) fail(`${seed} ${name} ${label}: a phenomenon off its cell`);
      const line = patchLine(seed, name, label, p);
      lines.push(line);
      if (name === 'LOW' && label === 'source') {
        const next = patch(w, cellSite(nextTo(src)), tier);
        if (next.patch.source) fail(`${seed} ${name}: the cell next to the source holds a wreck`);
        world(COLD_SEED, tier);
        const cold = patchLine(seed, name, label, patch(w, site, tier));
        if (cold !== line) throw new Error(`a patch after another world differs:\n  warm ${line}\n  cold ${cold}`);
      }
    }
  }
  return lines;
}

// ---------------------------------------------------------------- the source on the two tiers
// Issue 34. The source of a world must be the same on a phone and on a desktop. The two tiers draw
// the globe at two detail levels, so this builds every seed twice and compares.
// The six seeds above and nineteen more, so the sweep covers every planet type more than once.
const SOURCE_SEEDS = SEEDS.concat([
  'Caldera', 'Nyx', 'Selene', 'Thule', 'Boreas', 'Kestrel', 'Halcyon', 'Verdant', 'Meridian II',
  'Tarsis', 'Ilmen', 'Corvus', 'Peregrine', 'Solace', 'Ankaa', 'Draconis', 'Fennec',
  'Ostara', 'Wyrd',
]);

function sourceReport() {
  const deg = (v) => (v * 180 / Math.PI).toFixed(2);
  let bad = 0, nulls = 0, surface = 0;
  for (const seed of SOURCE_SEEDS) {
    const hi = world(seed, TIERS.HIGH).world, lo = world(seed, TIERS.LOW).world;
    const a = hi.source && hi.source.dir, b = lo.source && lo.source.dir;
    const same = !a === !b && (!a || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]));
    if (!same) bad++;
    if (hi.type !== 'gas') { surface++; if (!a) nulls++; }
    const where = a
      ? `lat ${deg(Math.asin(a[1])).padStart(7)}  lon ${deg(Math.atan2(a[2], a[0])).padStart(8)}`
      : hi.type === 'gas' ? 'none, a gas giant' : 'NO SOURCE';
    console.log(`  ${seed.padEnd(12)} ${hi.type.padEnd(7)} ${where.padEnd(32)} ${same ? 'same on both tiers' : 'DIFFERS'}`);
  }
  console.log(`\n${SOURCE_SEEDS.length} seeds on both tiers: ${bad} differ.`
    + ` ${nulls} of ${surface} worlds with a surface hold no source`
    + ` (${(nulls / Math.max(surface, 1) * 100).toFixed(0)}%).`);
  if (bad) { console.error('source: the tiers disagree'); process.exitCode = 1; }
}

if (process.argv.includes('--source')) {
  console.log(`the source on the two tiers, detail ${TIERS.HIGH.detail} against ${TIERS.LOW.detail}:`);
  sourceReport();
  process.exit(process.exitCode || 0);
}

const text = SEEDS.flatMap(linesFor).join('\n') + '\n';

if (process.argv.includes('--check')) {
  const want = readFileSync(BASELINE, 'utf8');
  if (want === text) { console.log(text.trimEnd()); console.log('\nchecksum: every hash matches the baseline'); }
  else {
    const a = want.trimEnd().split('\n'), b = text.trimEnd().split('\n');
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) console.log(`want: ${a[i] ?? '(none)'}\ngot:  ${b[i] ?? '(none)'}\n`);
    }
    console.error('checksum: the worlds changed');
    process.exitCode = 1;
  }
} else {
  process.stdout.write(text);
}
