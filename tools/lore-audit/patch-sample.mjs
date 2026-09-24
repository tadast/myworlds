// Prints the flora lore of a few real patches, without a browser.
//
//   node tools/lore-audit/patch-sample.mjs Auralis                the cell of the source
//   node tools/lore-audit/patch-sample.mjs Auralis 12.5 -73.25    the cell of a site
//   node tools/lore-audit/patch-sample.mjs --seeds 6
//
// It runs worker.js in this process: generate() for the world, then patch() for one site, and it
// prints every plant the patch grew. Use it to read whole stories after a change to flora-lore.js.
// The world and the patch take the LOW row of tiers.js, and the site snaps to its cell, so the
// patch is one a reader on a phone could land on.
import { createRequire, register } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rootUrl = pathToFileURL(root + '/').href;
// site.js takes three.js by the bare name `three`, which the import map of index.html resolves in
// the browser. Node has no import map, so a resolve hook points the same name at vendor/.
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: ${JSON.stringify(rootUrl + 'vendor/three.module.js')}, shortCircuit: true };
  return next(spec, ctx);
}`));
const { TIERS, worldOpts } = await import(rootUrl + 'tiers.js');
const { patchOpts, snapSite, sourceSite } = await import(rootUrl + 'site.js');
const TIER = TIERS.LOW;

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
  // With no site, the patch lands on the cell of the source, which always stands on dry land.
  runs.push([argv[0] || 'Auralis', argv[1] === undefined ? null : Number(argv[1]), argv[2] === undefined ? null : Number(argv[2])]);
}

let bad = 0;
for (const [seed, lat, lon] of runs) {
  let world = null, patch = null;
  globalThis.postMessage = (m) => {
    if (m.type === 'done') world = m.result.world;
    if (m.type === 'patch-done') patch = m.result.patch;
  };
  globalThis.__generate(seed, worldOpts(TIER));
  if (!world || world.type === 'gas') { console.log(`--- ${seed}: gas giant, no ground`); continue; }
  const site = lat === null ? sourceSite(world) : snapSite({ lat, lon });
  globalThis.__patch(seed, site.lat, site.lon, patchOpts(world, site, TIER.ground));
  if (!patch) { console.log(`--- ${seed}: no patch`); bad++; continue; }
  console.log(`\n=== ${seed} @ ${site.lat},${site.lon} · ${world.typeLabel} · ${patch.biome} · ${patch.plants.length} plant kinds`);
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
