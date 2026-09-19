// The fixes and the wedges of the carrier, with no browser. Issue 34, slice 2.
//
//   node tools/carrier-fix-check.mjs
//
// Two parts:
//
// A. The store. carrier-store.js runs against a fake localStorage: one fix per cell, the find that
//    survives a clear, the two bounds, a quota error that must not throw and must not touch the key
//    of the saved worlds, and a record of garbage that must read as empty.
//
// B. The wedge. East is easy to mirror, and the sky of this app had that defect once; see decision
//    10 of docs/probe.md. carrier-globe.js keeps its own copy of the east of site.js, so this check
//    reads the built geometry back through bearingTo() of site.js: every point of an edge has to
//    read the bearing of that edge, and the direction of the source has to lie between the two edge
//    great circles. The planes come from the drawn vertices and not from the formula that made
//    them, so a mirror in either file fails the run.
//
// site.js takes three.js by the bare name `three`, which the import map of index.html resolves in
// the browser. Node has no import map, so a resolve hook points the same name at vendor/, as
// tools/carrier-check.mjs does.
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/').href;
const hook = `
const root = ${JSON.stringify(root)};
const ADDONS = 'three/addons/';
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: root + 'vendor/three.module.js', shortCircuit: true };
  if (spec.startsWith(ADDONS)) return { url: root + 'vendor/addons/' + spec.slice(ADDONS.length), shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hook));

// The store reads localStorage the moment a call runs, so the fake stands before the import.
const WORLDS_KEY = 'myworlds.v1';
const store = new Map();
let quota = false;                 // true makes every write throw, as a full store does
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { if (quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};

const THREE = await import('three');
const S = await import(root + 'site.js');
const C = await import(root + 'carrier-store.js');
const G = await import(root + 'carrier-globe.js');

const PAIRS = 300;              // pairs of a site and a source for the wedge
// degrees: the slack on a bearing two files compute two ways. A position buffer holds float32, so
// a vertex carries about seven digits and a bearing read back off it lands within a ten-thousandth
// of a degree of the one that made it. The defect this guards against is a mirrored east, and that
// reads 90 or 180 degrees off, so the limit has room to spare.
const ANG_TOL = 1e-3;
const R_TOL = 1e-6;             // globe units: the slack on the radius of a vertex

const fails = [];
const fail = (what, detail) => { if (fails.length < 10) fails.push(`${what}: ${detail}`); };
const ok = (what, cond, detail) => { if (!cond) fail(what, detail); };

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260919);
function randDir() {
  const y = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - y * y);
  return new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
}
const snapDir = (d) => S.cellDir(S.dirCell(d.x, d.y, d.z), 0.5, 0.5, new THREE.Vector3());
const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;

function worldWith(seed, dir) {
  return {
    seed, type: 'terran', source: { kind: 'wreck', dir: [dir.x, dir.y, dir.z] },
    palette: { fauna: { accent: '#ff7b5c' } }, stats: { radius: '6,000' },
  };
}

// ---------------------------------------------------------------- A: the store
{
  store.clear();
  store.set(WORLDS_KEY, '[{"seed":"Auralis"}]');   // the saved worlds, which nothing here may touch

  const none = C.loadFixes('Nobody');
  ok('store', none.fixes.length === 0 && none.found === false, 'an unknown seed gave a record with something in it');

  const site = S.snapSite({ lat: 12.5, lon: -73.25, kind: -1 });
  const other = S.snapSite({ lat: -40.1, lon: 119.8, kind: -1 });
  C.addFix('Auralis', { lat: site.lat, lon: site.lon, brg: 41.2, err: 12.5 });
  let rec = C.addFix('Auralis', { lat: other.lat, lon: other.lon, brg: 200.4, err: 21 });
  ok('store', rec.fixes.length === 2, `two cells gave ${rec.fixes.length} fixes`);

  // one fix per cell: a landing on a cell that already holds one replaces it
  rec = C.addFix('Auralis', { lat: site.lat, lon: site.lon, brg: 44.9, err: 12.5 });
  ok('store', rec.fixes.length === 2, `a second landing on one cell gave ${rec.fixes.length} fixes`);
  ok('store', rec.fixes.some((f) => f.brg === 44.9), 'the second landing did not replace the fix of its cell');

  // a site off the grid snaps on the way in, so it lands on the fix it belongs to
  rec = C.addFix('Auralis', { lat: site.lat + 0.02, lon: site.lon - 0.02, brg: 45.5, err: 12.5 });
  ok('store', rec.fixes.length === 2, `a site two hundredths off the grid gave ${rec.fixes.length} fixes`);

  // a reload reads the same record back
  ok('store', C.loadFixes('Auralis').fixes.length === 2, 'the record did not survive a read');

  // the find, and the clear that keeps it
  ok('store', C.markFound('Auralis').found === true, 'markFound() did not mark the find');
  rec = C.clearFixes('Auralis');
  ok('store', rec.fixes.length === 0 && rec.found === true, 'the clear took the find with the fixes');
  ok('store', C.foundSeeds().has('Auralis'), 'foundSeeds() missed a found world');

  // the bound on the fixes of one seed: the oldest goes first
  for (let i = 0; i < C.MAX_FIXES + 16; i++) {
    const d = S.dirToSite(snapDir(randDir()));
    C.addFix('Deep', { lat: d.lat, lon: d.lon, brg: i, err: 10 });
  }
  rec = C.loadFixes('Deep');
  ok('store', rec.fixes.length <= C.MAX_FIXES, `${rec.fixes.length} fixes stand over the bound of ${C.MAX_FIXES}`);
  ok('store', rec.fixes[rec.fixes.length - 1].brg === C.MAX_FIXES + 15, 'the newest fix is not the one that stayed');

  // the bound on the seeds
  for (let i = 0; i < C.MAX_SEEDS + 40; i++) C.addFix('Seed' + i, { lat: 0, lon: 0, brg: 1, err: 5 });
  const all = JSON.parse(store.get(C.CARRIER_KEY));
  ok('store', Object.keys(all).length <= C.MAX_SEEDS, `${Object.keys(all).length} seeds stand over the bound of ${C.MAX_SEEDS}`);
  ok('store', all['Seed' + (C.MAX_SEEDS + 39)], 'the newest seed is not the one that stayed');

  // a quota error: no throw, and the saved worlds stand untouched
  quota = true;
  let threw = null;
  try { C.addFix('Quota', { lat: 0, lon: 0, brg: 10, err: 5 }); } catch (e) { threw = e; }
  quota = false;
  ok('store', !threw, `a full store threw ${threw && threw.name}`);
  ok('store', store.get(WORLDS_KEY) === '[{"seed":"Auralis"}]', 'the store of the saved worlds lost its key');

  // a record of garbage reads as empty and throws nothing
  store.set(C.CARRIER_KEY, '{"Bad": {"fixes": [1, {"lat": "x"}], "found": "yes"}}');
  rec = C.loadFixes('Bad');
  ok('store', rec.fixes.length === 0 && rec.found === true, 'a record of garbage did not clean up');
  store.set(C.CARRIER_KEY, 'not json at all');
  ok('store', C.loadFixes('Bad').fixes.length === 0, 'a key of rubbish did not read as empty');
  store.clear();
}

// ---------------------------------------------------------------- B: the wedge
// The vertices of a wedge, as two edges of unit directions. The mesh holds the pair of a step
// beside each other: the edge of brg - err first and the edge of brg + err second.
function edgesOf(mesh, radius) {
  const pos = mesh.geometry.attributes.position;
  const left = [], right = [];
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    ok('radius', Math.abs(v.length() - radius) < R_TOL, `a vertex stands at ${v.length().toFixed(6)} and not at ${radius}`);
    (i % 2 === 0 ? left : right).push(v.normalize());
  }
  return { left, right };
}

let worstEdge = 0;        // degrees: the widest gap between a drawn edge and the bearing it carries
let worstMargin = 1;      // parts of the wedge: how near the source came to an edge, 0 is on it
const wedgeCount = { verts: 0, tris: 0 };
for (let i = 0; i < PAIRS; i++) {
  const srcDir = snapDir(randDir());
  const site = S.dirToSite(snapDir(randDir()));
  const world = worldWith('Wedge' + i, srcDir);
  const c = S.carrierAt(world, site);
  const fix = { lat: site.lat, lon: site.lon, brg: c.brg, err: c.err };
  const group = G.makeCarrierGroup(world, { fixes: [fix], found: false, ts: 0 });
  if (!group) { fail('group', `pair ${i} gave no group`); continue; }
  const wedges = group.userData.meshes.wedges;
  wedgeCount.verts = wedges.geometry.attributes.position.count;
  wedgeCount.tris = wedges.geometry.index.count / 3;
  const { left, right } = edgesOf(wedges, G.WEDGE_R);

  // 1. every point of an edge reads the bearing of that edge, through bearingTo() of site.js. The
  //    two ends stand on the site and on its antipode, where a bearing means nothing.
  for (let k = 1; k < left.length - 1; k++) {
    const dl = Math.abs(wrap180(S.bearingTo(site, left[k]) - (c.brg - c.err)));
    const dr = Math.abs(wrap180(S.bearingTo(site, right[k]) - (c.brg + c.err)));
    if (dl > ANG_TOL || dr > ANG_TOL) fail('edge', `pair ${i} step ${k}: the drawn edges read ${dl.toFixed(9)} and ${dr.toFixed(9)} deg off their bearings`);
    worstEdge = Math.max(worstEdge, dl, dr);
  }

  // 2. the antipode closes the wedge
  const last = left[left.length - 1].clone().add(right[right.length - 1]).multiplyScalar(0.5);
  const up = S.siteDir(site.lat, site.lon, new THREE.Vector3());
  ok('close', last.distanceTo(up.clone().multiplyScalar(-1)) < 1e-6, `pair ${i}: the two edges do not meet at the antipode`);

  // 3. the direction of the source lies between the two edge great circles. The planes come from
  //    the drawn vertices: the normal of the circle through two points of one edge is their cross
  //    product, and the sign of the source against the two normals states the side it stands on.
  const nL = left[1].clone().cross(left[2]).normalize();
  const nR = right[1].clone().cross(right[2]).normalize();
  const dL = srcDir.dot(nL), dR = srcDir.dot(nR);
  if (!(dL * dR < 0)) fail('wedge', `pair ${i}: the source stands outside the drawn wedge (${dL.toExponential(2)}, ${dR.toExponential(2)})`);
  // how near the source came to an edge, as a part of the half width of the wedge
  const arc = S.arcTo(site, srcDir);
  const half = Math.sin(THREE.MathUtils.degToRad(2 * c.err)) * Math.sin(arc);
  worstMargin = Math.min(worstMargin, Math.min(Math.abs(dL), Math.abs(dR)) / Math.max(half, 1e-12));

  G.disposeCarrierGroup(group);
  ok('dispose', group.children.length === 0, `pair ${i}: the group kept its children after the dispose`);
}

// ---------------------------------------------------------------- B: three fixes in one mesh
// The frame cost: the wedges of a world merge into one mesh and their dots into one more, whatever
// the number of fixes, so the group costs a handful of draw calls and no more.
let mergeRow = '';
{
  const world = worldWith('Merge', snapDir(randDir()));
  const fixes = [];
  for (let i = 0; i < 3; i++) {
    const s = S.dirToSite(snapDir(randDir()));
    const c = S.carrierAt(world, s);
    fixes.push({ lat: s.lat, lon: s.lon, brg: c.brg, err: c.err });
  }
  const group = G.makeCarrierGroup(world, { fixes, found: false, ts: 0 });
  const drawn = group.children.filter((m) => m.visible);
  ok('merge', drawn.length === 2, `three fixes drew ${drawn.length} meshes`);
  const verts = group.userData.meshes.wedges.geometry.attributes.position.count;
  ok('merge', verts === 3 * wedgeCount.verts, `three wedges hold ${verts} vertices and not ${3 * wedgeCount.verts}`);
  mergeRow = `  merge   three fixes drew ${drawn.length} meshes, ${verts} vertices of wedge and ${group.userData.meshes.marks.geometry.attributes.position.count} of dot`;
  G.disposeCarrierGroup(group);
}

// ---------------------------------------------------------------- B: the fade, the replace, the ring
let fadeRow = '';
{
  const srcDir = snapDir(randDir());
  const world = worldWith('Fade', srcDir);
  const a = S.dirToSite(snapDir(randDir()));
  const group = G.makeCarrierGroup(world, { fixes: [], found: false, ts: 0 });
  const u = group.userData;
  ok('fade', !u.meshes.wedges.visible, 'a world with no fix drew a wedge');

  const c = S.carrierAt(world, a);
  G.addWedge(group, { lat: a.lat, lon: a.lon, brg: c.brg, err: c.err }, { fade: true });
  ok('fade', u.meshes.fadeWedge.visible && u.mats.fadeWedge.opacity === 0, 'the new wedge did not start at nothing');
  G.updateCarrierGroup(group, 0.6);
  const half = u.mats.fadeWedge.opacity;
  ok('fade', half > 0 && half < 0.16, `the wedge stood at ${half} halfway through the fade`);
  G.updateCarrierGroup(group, 0.7);
  ok('fade', u.fade === null && u.fixes.length === 1, 'the wedge did not settle at the end of the fade');
  ok('fade', !u.meshes.fadeWedge.visible && u.meshes.wedges.visible, 'the settled wedge stands on the wrong mesh');
  fadeRow = `  fade    the wedge stood at ${half.toFixed(4)} of 0.16 halfway through the 1.2 s`;

  // a second landing on the same cell replaces the wedge of that cell
  G.addWedge(group, { lat: a.lat, lon: a.lon, brg: c.brg, err: c.err }, { fade: false });
  ok('replace', u.fixes.length === 1, `a second landing on one cell left ${u.fixes.length} wedges`);

  // the find takes the wedges away and leaves one ring at the source
  G.setFound(group, world);
  ok('found', !u.meshes.wedges.visible, 'a found world still draws a wedge');
  ok('found', u.meshes.marks.visible, 'a found world draws no ring');
  const at = S.sourceSite(world);
  const pos = u.meshes.marks.geometry.attributes.position;
  let lo = Infinity, hi = 0;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    ok('found', Math.abs(v.length() - G.WEDGE_R) < R_TOL, 'a point of the ring stands off the sphere of the wedges');
    const arc = S.arcTo(at, v.normalize());
    lo = Math.min(lo, arc); hi = Math.max(hi, arc);
  }
  const cells = (x) => x / S.CELL;
  ok('found', cells(lo) > 1.2 && cells(hi) < 1.8, `the ring runs ${cells(lo).toFixed(2)} to ${cells(hi).toFixed(2)} cells out`);
  fadeRow += `\n  ring    the ring of a find runs ${cells(lo).toFixed(2)} to ${cells(hi).toFixed(2)} cells out from the source`;
  G.disposeCarrierGroup(group);
}

// ---------------------------------------------------------------- the report
console.log('carrier-fix-check');
console.log('  store   one fix per cell, the find that survives a clear, both bounds, a quota error, and garbage');
console.log(`  wedge   ${PAIRS} pairs of a site and a source, ${wedgeCount.verts} vertices and ${wedgeCount.tris} triangles each`);
console.log(`  edge    a drawn edge read ${worstEdge.toExponential(1)} deg off its bearing at worst, limit ${ANG_TOL}`);
console.log(`  cover   the source stood inside every wedge, and came within ${(worstMargin * 100).toFixed(2)}% of an edge at worst`);
console.log(mergeRow);
console.log(fadeRow);
if (fails.length) {
  console.error('\nFAIL');
  for (const f of fails) console.error('  ' + f);
  process.exitCode = 1;
} else {
  console.log('\nPASS');
}
