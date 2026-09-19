// A checksum of the worlds worker.js builds, with no browser.
//
//   node tools/world-checksum.mjs                 print one line per seed
//   node tools/world-checksum.mjs --check         compare against the baseline file
//   node tools/world-checksum.mjs --source        the source of each seed on both tiers
//
// Issue 34, decision 2. The source of a world takes its own hash stream, so no existing stream may
// draw one number more and no world may change. This tool proves it: record the baseline before the
// change, run it again after, and every hash must be equal.
//
// The hash covers the three arrays the reader would see change: heightMap, which carries the relief
// of the whole globe, flora, and fauna. A stream that slipped by one draw moves all three.
//
// Five seeds cover five of the six planet types. Meridian is the ice world the acceptance criteria
// ask for; the types come from worldContext(), so a change to chooseType() would show here first.
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(root, 'tools', 'world-checksum.baseline.txt');

// The seeds and the type each one rolls. One ice world, and no gas giant: a gas giant takes the
// other path through generate() and carries no height map.
const SEEDS = ['Auralis', 'Vesper', 'Meridian', 'Tessaly', 'Orin'];
// The options app.js sends on a generate message. See makeWorld() in app.js.
const OPTS = { detail: 96, maxFlora: 6000, maxFauna: 140 };

// worker.js is a classic worker script, not a module. It is evaluated here in this scope, the way
// tools/lore-audit/audit.mjs does it. Nothing runs until generate() is called.
globalThis.self = globalThis;
require(path.join(root, 'lore.js'));
require(path.join(root, 'species.js'));
require(path.join(root, 'flora-lore.js'));
globalThis.importScripts = () => {};
let posted = null;
globalThis.postMessage = (msg) => { if (msg && msg.type === 'done') posted = msg.result; };
new Function('self', readFileSync(path.join(root, 'worker.js'), 'utf8') + '\n;self.__generate = generate;')(globalThis);

// FNV-1a over the bytes of an array, with an avalanche at the end. One word is enough: a slipped
// stream moves thousands of floats, not one bit.
function hashArray(arr) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619); }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0).toString(16).padStart(8, '0');
}

function lineFor(seed) {
  posted = null;
  globalThis.__generate(seed, OPTS);
  const r = posted;
  if (!r) throw new Error(`generate("${seed}") posted no result`);
  const parts = [r.world.type, hashArray(r.heightMap), hashArray(r.flora), hashArray(r.fauna)];
  return `${seed} ${parts.join(' ')}`;
}

// ---------------------------------------------------------------- the source on the two tiers
// Issue 34. The source of a world must be the same on a phone and on a desktop. The two tiers draw
// the globe at two detail levels, so this builds every seed twice and compares. app.js sets the
// detail in Q; see the tier row there.
const TIERS = { HIGH: { detail: 100, maxFlora: 20000, maxFauna: 300 }, LOW: { detail: 64, maxFlora: 6000, maxFauna: 140 } };
// The five seeds above and twenty more, so the sweep covers every planet type more than once.
const SOURCE_SEEDS = SEEDS.concat([
  'Caldera', 'Nyx', 'Selene', 'Thule', 'Boreas', 'Kestrel', 'Halcyon', 'Verdant', 'Meridian II',
  'Tarsis', 'Ilmen', 'Corvus', 'Peregrine', 'Solace', 'Ankaa', 'Draconis', 'Mire', 'Fennec',
  'Ostara', 'Wyrd',
]);

function sourceOf(seed, opts) {
  posted = null;
  globalThis.__generate(seed, opts);
  return posted.world;
}

function sourceReport() {
  const deg = (v) => (v * 180 / Math.PI).toFixed(2);
  let bad = 0, nulls = 0, surface = 0;
  for (const seed of SOURCE_SEEDS) {
    const hi = sourceOf(seed, TIERS.HIGH), lo = sourceOf(seed, TIERS.LOW);
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

const lines = SEEDS.map(lineFor);
const text = lines.join('\n') + '\n';

if (process.argv.includes('--check')) {
  const want = readFileSync(BASELINE, 'utf8');
  if (want === text) { console.log(text.trimEnd()); console.log('\nchecksum: every hash matches the baseline'); }
  else {
    console.log('want:\n' + want.trimEnd() + '\n\ngot:\n' + text.trimEnd());
    console.error('\nchecksum: the worlds changed');
    process.exitCode = 1;
  }
} else {
  process.stdout.write(text);
}
