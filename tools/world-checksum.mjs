// A checksum of the worlds worker.js builds, with no browser.
//
//   node tools/world-checksum.mjs                 print one line per seed
//   node tools/world-checksum.mjs --check         compare against the baseline file
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
