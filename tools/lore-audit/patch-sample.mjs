// Prints the flora lore of a few real patches, without a browser.
//
//   node tools/lore-audit/patch-sample.mjs Auralis 12.5 -73.25
//   node tools/lore-audit/patch-sample.mjs --seeds 6
//
// It runs worker.js in this process: generate() for the world, then patch() for one site, and it
// prints every plant the patch grew. Use it to read whole stories after a change to flora-lore.js.
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.self = globalThis;
require(path.join(root, 'lore.js'));
require(path.join(root, 'species.js'));
require(path.join(root, 'flora-lore.js'));
globalThis.importScripts = () => {};
globalThis.postMessage = () => {};
new Function('self', readFileSync(path.join(root, 'worker.js'), 'utf8')
  + '\n;self.__generate = generate; self.__patch = patch;')(globalThis);

const argv = process.argv.slice(2);
const seedsFlag = argv.indexOf('--seeds');
const runs = [];
if (seedsFlag >= 0) {
  const n = Number(argv[seedsFlag + 1] || 5);
  for (let i = 0; i < n; i++) runs.push([`sample-${i}`, (i * 37) % 70 - 35, (i * 53) % 300 - 150]);
} else {
  runs.push([argv[0] || 'Auralis', Number(argv[1] ?? 12.5), Number(argv[2] ?? -73.25)]);
}

let bad = 0;
for (const [seed, lat, lon] of runs) {
  let world = null, patch = null;
  globalThis.postMessage = (m) => {
    if (m.type === 'done') world = m.result.world;
    if (m.type === 'patch-done') patch = m.result.patch;
  };
  globalThis.__generate(seed, { detail: 24, maxFlora: 400, maxFauna: 40 });
  if (!world || world.type === 'gas') { console.log(`--- ${seed}: gas giant, no ground`); continue; }
  globalThis.__patch(seed, lat, lon, { grid: 4, size: 1500, span: 74000, rim: 3150, maxFlora: 3000, maxFauna: 60, pulledKind: -1 });
  if (!patch) { console.log(`--- ${seed}: no patch`); bad++; continue; }
  console.log(`\n=== ${seed} @ ${lat},${lon} · ${world.typeLabel} · ${patch.biome} · ${patch.plants.length} plant kinds`);
  for (const p of patch.plants) {
    const l = p.lore;
    console.log(`\n  ${l.name} (${l.latin})  [kind ${p.kind}, ${p.count} on this ground]`);
    console.log(`  ${l.habitat} · ${l.size} · ${l.food} · ${l.spread}`);
    console.log(`  ${l.story}`);
    for (const tok of globalThis.Lore.tokensIn(l.story + l.food + l.spread)) {
      console.log(`  !! unfilled {${tok}}`); bad++;
    }
    const s = l.story.split(/(?<=[.!?]) /).map((x) => x.trim()).filter(Boolean);
    const dup = s.filter((x, j) => s.indexOf(x) !== j);
    if (dup.length) { console.log(`  !! repeated sentence — ${dup[0]}`); bad++; }
  }
}
process.exit(bad ? 1 : 0);
