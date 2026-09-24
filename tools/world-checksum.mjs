// A checksum of the worlds and the patches worker.js builds, with no browser.
//
//   node tools/world-checksum.mjs                 print one line per world and per patch
//   node tools/world-checksum.mjs --check         compare against the baseline file
//   node tools/world-checksum.mjs --source        the source of each seed on both tiers
//
// Record the baseline before a change that must leave the worlds alone, run it again after, and
// every hash must be equal. Issue 34 used it to prove that the source drew no number from the
// streams of the other parts of a world.
//
// Both device tiers run. The options come from tiers.js and site.js, the same place app.js takes
// them, so the check measures the worlds and the patches a reader gets and cannot drift from them.
//
// A world line hashes the arrays the reader would see change: the height map, the position and the
// colour of the globe, the flora, the clouds, the fauna, and the flora grid. It also hashes the
// world object as JSON, which carries the species, their lore, and the log of the source.
//
// A patch line hashes every array of the patch and the patch object as JSON, which carries the
// lore of the plants, the biome, and the place of the wreck. Each world with a surface lands at
// three sites: a fixed site with a pull to the first species, the cell of the source, and the cell
// of the phenomenon when the ground can draw it.
//
// Six seeds cover the seven planet types but one. Meridian is the ice world the acceptance criteria
// of issue 34 ask for, and Mire is a gas giant, which takes the other path through generate().
import { register } from 'node:module';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootUrl = pathToFileURL(root + '/').href;
const BASELINE = path.join(root, 'tools', 'world-checksum.baseline.txt');

// site.js takes three.js by the bare name `three`, which the import map of index.html resolves in
// the browser. Node has no import map, so a resolve hook points the same name at vendor/.
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: ${JSON.stringify(rootUrl + 'vendor/three.module.js')}, shortCircuit: true };
  return next(spec, ctx);
}`));
const { TIERS, worldOpts } = await import(rootUrl + 'tiers.js');
const { patchOpts, snapSite, sourceSite, activitySite } = await import(rootUrl + 'site.js');

const SEEDS = ['Auralis', 'Vesper', 'Meridian', 'Tessaly', 'Orin', 'Mire'];
const FIXED_SITE = { lat: 20, lon: 40, kind: 0 };

// worker.js is a classic worker script, not a module. It is evaluated here in this scope, the way
// tools/lore-audit/audit.mjs does it. All four lore files load, so the log of the source is part
// of the hash. Nothing runs until generate() is called.
globalThis.self = globalThis;
for (const f of ['lore.js', 'species.js', 'flora-lore.js', 'source-lore.js']) require(path.join(root, f));
globalThis.importScripts = () => {};
let posted = null;
globalThis.postMessage = (msg) => { if (msg && (msg.type === 'done' || msg.type === 'patch-done')) posted = msg.result; };
new Function('self', readFileSync(path.join(root, 'worker.js'), 'utf8')
  + '\n;self.__generate = generate; self.__patch = patch;')(globalThis);

function world(seed, tier) {
  posted = null;
  globalThis.__generate(seed, worldOpts(tier));
  if (!posted) throw new Error(`generate("${seed}") posted no result`);
  return posted;
}

function patch(w, site, tier) {
  posted = null;
  globalThis.__patch(w.seed, site.lat, site.lon, patchOpts(w, site, tier.ground));
  if (!posted) throw new Error(`patch("${w.seed}", ${site.lat}, ${site.lon}) posted no result`);
  return posted;
}

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

function linesFor(seed) {
  const lines = [];
  for (const name of Object.keys(TIERS)) {
    const tier = TIERS[name];
    const r = world(seed, tier);
    const w = r.world;
    lines.push([seed, name, 'world', w.type,
      hashArray(r.heightMap), hashArray(r.terrain.pos), hashArray(r.terrain.col), hashArray(r.flora),
      hashArray(r.clouds), hashArray(r.fauna), hashArray(r.floraGrid), hashJson(w)].join(' '));
    if (w.type === 'gas') continue;
    const sites = [['fixed', snapSite(FIXED_SITE)], ['source', sourceSite(w)], ['activity', activitySite(w)]];
    for (const [label, site] of sites) {
      if (!site) { lines.push(`${seed} ${name} patch ${label} -`); continue; }
      const p = patch(w, site, tier);
      lines.push([seed, name, 'patch', label, p.patch.biome.replace(/ /g, '_'),
        hashArray(p.heights), hashArray(p.colors), hashArray(p.flora), hashArray(p.grass),
        hashArray(p.groups), hashArray(p.members), hashArray(p.rimHeights), hashArray(p.rimColors),
        hashJson(p.patch)].join(' '));
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
