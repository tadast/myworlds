// Prints the flora lore of a few real patches, without a browser.
//
//   node tools/lore-audit/patch-sample.mjs Auralis                the cell of the source
//   node tools/lore-audit/patch-sample.mjs Auralis 12.5 -73.25    the cell of a site
//   node tools/lore-audit/patch-sample.mjs --seeds 6
//
// It runs generate.js in this process: the world call, then the patch call for one site, and it
// prints every plant the patch grew. Use it to read whole stories after a change to flora-lore.js.
// The world and the patch take the LOW row of tiers.js, and the patch call builds the whole cell
// of the site, so the patch is one a reader on a phone could land on.
import { Lore } from '../../lore.js';
import * as generate from '../../generate.js';
import { TIERS, worldOpts, patchOpts } from '../../tiers.js';
import { dirCell, cellSite } from '../../cell-grid.js';
const TIER = TIERS.LOW;

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
  const { world } = generate.world(seed, worldOpts(TIER));
  if (world.type === 'gas') { console.log(`--- ${seed}: gas giant, no ground`); continue; }
  const src = world.source && world.source.dir;
  const site = lat === null ? cellSite(dirCell(src[0], src[1], src[2])) : { lat, lon };
  const { patch } = generate.patch(seed, site, patchOpts(TIER));
  console.log(`\n=== ${seed} @ ${patch.lat},${patch.lon} · ${world.typeLabel} · ${patch.biome} · ${patch.plants.length} plant kinds`);
  for (const p of patch.plants) {
    const l = p.lore;
    console.log(`\n  ${l.name} (${l.latin})  [kind ${p.kind}, ${p.count} on this ground]`);
    console.log(`  ${l.habitat} · ${l.size} · ${l.food} · ${l.spread}`);
    console.log(`  ${l.story}`);
    for (const tok of Lore.tokensIn(l.story + l.food + l.spread)) {
      console.log(`  !! unfilled {${tok}}`); bad++;
    }
    const s = l.story.split(/(?<=[.!?]) /).map((x) => x.trim()).filter(Boolean);
    const dup = s.filter((x, j) => s.indexOf(x) !== j);
    if (dup.length) { console.log(`  !! repeated sentence — ${dup[0]}`); bad++; }
  }
}
process.exit(bad ? 1 : 0);
