// The terrain of a patch, with no browser.
//
//   node tools/patch-terrain-check.mjs
//
// patch-terrain.js answers where a thing on the ground stands: the height as the mesh draws it, the
// water, and the discs of the keep-out. This check builds patches through worker.js, as the page
// receives them, on the cell of the wreck, the cell of the ruin, the cell of the phenomenon, and a
// plain cell, and tests the answers against the patch itself.
//
// 1. The height. At every node it is the height of the node. Between the nodes it lies on the
//    triangle the mesh draws: the plane through the three corners of that triangle, found here with
//    a cross product and no copy of the formula. Off the patch it is 0.
// 2. The keep-out. The patch carries a disc round the wreck, the ruin, and the phenomenon, a disc
//    for each part of the camp, and no disc on a plain cell. No plant of the worker stands on a disc,
//    and no group of the worker starts on one with its spread as the pad. So the discs the ground
//    reads are the discs the worker masked.
// 3. The water. wet() and topAt() read the sea level of the patch.
import { root } from './three-hook.mjs';

const { PatchTerrain } = await import(root + 'patch-terrain.js');
const { sourceSite } = await import(root + 'carrier.js');
const W = await import(root + 'cell-grid.js');
const { TIERS, worldOpts, patchOpts } = await import(root + 'tiers.js');

let reply = null;
globalThis.self = {
  postMessage(msg, transfer) { if (msg.type !== 'progress') reply = structuredClone(msg, { transfer }); },
};
await import(root + 'worker.js');
function ask(data) {
  reply = null;
  globalThis.self.onmessage({ data });
  if (!reply || reply.type === 'error') throw new Error(`the worker gave ${reply && reply.message}`);
  return reply.result;
}
const TIER = TIERS.LOW;
const world = (seed) => ask({ type: 'generate', seed, opts: worldOpts(TIER) }).world;
const patchAt = (w, site) => ask({ type: 'patch', seed: w.seed, site: { lat: site.lat, lon: site.lon, kind: -1 }, opts: patchOpts(TIER) });
const cellOf = (dir) => W.cellSite(W.dirCell(dir[0], dir[1], dir[2]));

let fails = 0;
function ok(part, cond, msg) {
  if (cond) return;
  fails++;
  if (fails <= 30) console.log(`FAIL ${part}: ${msg}`);
}

// The height of the plane through three points [x, y, z] at (x, z).
function plane(p, q, r, x, z) {
  const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
  const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  return p[1] - (nx * (x - p[0]) + nz * (z - p[2])) / ny;
}

// A stream of numbers from 0 to 1, so the check reads the same points on every run.
let s = 12345;
const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);

const seen = { wreck: 0, ruin: 0, camp: 0, phenomenon: 0, plain: 0 };
let plants = 0, groups = 0, points = 0;

function test(label, result) {
  const P = result.patch, H = result.heights, n = P.n, g = P.grid, half = P.size / 2;
  const t = new PatchTerrain(result);

  // 1. the height
  let worst = 0;
  for (let j = 0; j < n; j += 7) {
    for (let i = 0; i < n; i += 7) worst = Math.max(worst, Math.abs(t.heightAt(-half + i * g, -half + j * g) - H[j * n + i]));
  }
  ok('node', worst === 0, `${label}: a node reads ${worst} off its height`);
  const node = (i, j) => [-half + i * g, H[j * n + i], -half + j * g];
  worst = 0;
  for (let k = 0; k < 4000; k++) {
    const i = Math.floor(rand() * (n - 1)), j = Math.floor(rand() * (n - 1));
    const fx = rand(), fz = rand();
    const x = -half + (i + fx) * g, z = -half + (j + fz) * g;
    // the mesh draws (i, j), (i, j + 1), (i + 1, j + 1) and (i, j), (i + 1, j + 1), (i + 1, j)
    const want = fz > fx ? plane(node(i, j), node(i, j + 1), node(i + 1, j + 1), x, z)
      : plane(node(i, j), node(i + 1, j + 1), node(i + 1, j), x, z);
    worst = Math.max(worst, Math.abs(t.heightAt(x, z) - want));
    points++;
  }
  ok('triangle', worst < 1e-6, `${label}: a point reads ${worst.toExponential(2)} off the drawn triangle`);
  ok('off', t.heightAt(half + g, 0) === 0 && t.heightAt(0, -half - g) === 0, `${label}: a point off the patch reads a height`);

  // 2. the keep-out
  const discs = P.keepOut;
  ok('discs', Array.isArray(discs) && t.discs === discs, `${label}: the terrain does not read patch.keepOut`);
  const src = P.source, act = P.activity;
  const at = (x, z, r) => discs.some((d) => Math.abs(d[0] - x) < 1e-9 && Math.abs(d[1] - z) < 1e-9 && (r == null || d[2] === r));
  if (src && src.kind === 'wreck') { ok('wreck', at(src.x, src.z) && discs.length === 1, `${label}: the discs of the wreck are ${JSON.stringify(discs)}`); seen.wreck++; }
  if (src && src.kind === 'ruin') {
    ok('ruin', at(src.x, src.z), `${label}: no disc stands round the ruin`);
    seen.ruin++;
    if (src.camp) {
      ok('camp', discs.length >= 2 && t.keptOut(src.camp.x, src.camp.z), `${label}: the camp stands on no disc`);
      seen.camp++;
    }
  }
  if (act) { ok('phenomenon', at(0, 0, act.radius), `${label}: no disc of radius ${act.radius} stands at the phenomenon`); seen.phenomenon++; }
  if (!src && !act) { ok('plain', discs.length === 0, `${label}: a plain cell carries ${discs.length} discs`); seen.plain++; }
  for (let k = 0; k < result.flora.length; k += 8) {
    ok('plants', !t.keptOut(result.flora[k], result.flora[k + 2]), `${label}: a plant of the worker stands on a disc at ${result.flora[k].toFixed(1)}, ${result.flora[k + 2].toFixed(1)}`);
    plants++;
  }
  for (let k = 0; k < result.groups.length; k += 6) {
    ok('groups', !t.keptOut(result.groups[k], result.groups[k + 1], result.groups[k + 4]), `${label}: a group of the worker starts on a disc`);
    groups++;
  }

  // 3. the water
  const x = 0, z = 0, h = t.heightAt(x, z);
  ok('water', t.seaLevel === (P.seaLevel || 0) && t.wet(x, z, 0.5) === (h < t.seaLevel + 0.5) && t.topAt(x, z) === Math.max(h, t.seaLevel),
    `${label}: the water reads another sea level`);
}

// Worlds until each kind of cell stands tested: the wreck, the ruin with a camp, and the phenomenon.
for (let i = 0; i < 40 && !(seen.wreck >= 3 && seen.camp >= 2 && seen.phenomenon >= 2 && seen.plain >= 3); i++) {
  const w = world(`terrain-${i}`);
  if (w.type === 'gas') continue;
  if (w.source && w.source.dir) test(`${w.seed} wreck`, patchAt(w, sourceSite(w, w.source)));
  if (w.ruin && w.ruin.dir && (seen.camp < 2 || seen.ruin < 2)) test(`${w.seed} ruin`, patchAt(w, sourceSite(w, w.ruin)));
  if (w.activity && w.activity.dir && seen.phenomenon < 2) {
    const r = patchAt(w, cellOf(w.activity.dir));
    if (r.patch.activity) test(`${w.seed} ${r.patch.activity.kind}`, r);
  }
  if (seen.plain < 3) test(`${w.seed} plain`, patchAt(w, { lat: 12.5, lon: -73.25 }));
}
ok('cover', seen.wreck >= 3 && seen.camp >= 2 && seen.phenomenon >= 2 && seen.plain >= 3, `the worlds gave too few cells: ${JSON.stringify(seen)}`);

console.log(`  height    every node, and ${points} points on the drawn triangles, on ${Object.values(seen).reduce((a, b) => a + b, 0) - seen.camp} patches`);
console.log(`  keep-out  ${seen.wreck} wrecks, ${seen.ruin} ruins with ${seen.camp} camps, ${seen.phenomenon} phenomena, and ${seen.plain} plain cells; ${plants} plants and ${groups} groups off every disc`);
console.log('  water     wet() and topAt() read the sea level of the patch');
console.log('');
if (fails) { console.log(`FAIL: ${fails} checks`); process.exit(1); }
console.log('PASS');
