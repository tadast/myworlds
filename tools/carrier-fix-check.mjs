// The fixes and the wedges of the carrier, with no browser. Issue 34, slice 2.
//
//   node tools/carrier-fix-check.mjs
//
// Four parts:
//
// A. The store. carrier-store.js runs against a fake localStorage: one fix per cell, the find that
//    survives a clear, the two bounds, a quota error that must not throw and must not touch the key
//    of the saved worlds, and a record of garbage that must read as empty.
//
// B. The wedge. A wedge is no longer geometry: the terrain shader and the ocean shader paint it, so
//    there is no mesh to read back. carrier-globe.js states the wedge as three unit vectors per fix
//    — the site `s` and the two inward edge normals `nL` and `nR` — and wedgePlanes() builds both
//    the uniforms the shader gets and the numbers this check tests. wedgeEdges() holds the same
//    arithmetic the GLSL runs, line for line.
//
//    East is easy to mirror, and the sky of this app had that defect once; see decision 10 of
//    docs/probe.md. So every direction this check builds is read back through bearingTo() of
//    site.js before it goes into a plane test: a mirror in either file fails the run.
//
// C. The cap and the fade. The shader holds MAX_WEDGES = 8 fixes, and a world with more draws the 8
//    newest. A new fix fades in over 1.2 s through its own slot of the fade uniform.
//
// D. The marks on the ground. The dot of a fix and the ring of a find lie on the terrain: every
//    vertex takes the ground under it, or the sea where the ground lies under the sea, plus
//    DRAPE_LIFT. The check builds a fake height map with relief inside one cell, so a mark that
//    stood at one radius fails the run.
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
// degrees: the slack on a bearing two files compute two ways. The defect this guards against is a
// mirrored east, and that reads 90 or 180 degrees off, so the limit has room to spare.
const ANG_TOL = 1e-3;
const R_TOL = 1e-6;             // globe units: the slack on the radius of a vertex
const OUT_DEG = 1;              // degrees past an edge that must read outside the wedge

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

// A unit direction at a bearing and an arc from a site. This check keeps its own copy of the east
// of the globe, and every direction it builds goes back through bearingTo() of site.js below, so
// the copy is checked and not trusted.
function dirAt(site, brg, arc) {
  const la = THREE.MathUtils.degToRad(site.lat), lo = THREE.MathUtils.degToRad(site.lon);
  const cla = Math.cos(la), sla = Math.sin(la), clo = Math.cos(lo), slo = Math.sin(lo);
  const east = new THREE.Vector3(slo, 0, -clo);
  const north = new THREE.Vector3(-sla * clo, cla, -sla * slo);
  const up = new THREE.Vector3(cla * clo, sla, cla * slo);
  const b = THREE.MathUtils.degToRad(brg);
  const tan = north.multiplyScalar(Math.cos(b)).addScaledVector(east, Math.sin(b));
  return up.multiplyScalar(Math.cos(arc)).addScaledVector(tan, Math.sin(arc));
}

// The same direction, with the bearing read back through site.js before it is used.
function probe(site, brg, arc, what, why) {
  const d = dirAt(site, brg, arc);
  const back = Math.abs(wrap180(S.bearingTo(site, d) - brg));
  ok(what, back < ANG_TOL, `${why}: the built direction reads ${back.toFixed(6)} deg off the bearing it was built at`);
  return d;
}

// A fake height map, at the 384 by 192 the worker sends. One texel is 0.016 rad of lon, and the
// ring of a find runs 1.5 cells out, which is 0.015 rad, so the band crosses a texel edge and reads
// more than one value. The high term along lon makes two neighbouring texels differ, so a mark that
// stood at one radius could not pass the spread check below. Some of the field lies under SEA_R, so
// the max() of the drape is exercised too.
const HM_W = 384, HM_H = 192;
const SEA_R = 0.995;
const HM = new Float32Array(HM_W * HM_H);
for (let j = 0; j < HM_H; j++) {
  const lat = ((j + 0.5) / HM_H - 0.5) * Math.PI;
  for (let i = 0; i < HM_W; i++) {
    const lon = ((i + 0.5) / HM_W - 0.5) * Math.PI * 2;
    HM[i + j * HM_W] = 1 + 0.02 * Math.sin(lon * 17) * Math.cos(lat * 23) + 0.03 * Math.sin(lat * 3 + lon);
  }
}

function worldWith(seed, dir) {
  return {
    seed, type: 'terran', source: { kind: 'wreck', dir: [dir.x, dir.y, dir.z] },
    palette: { fauna: { accent: '#ff7b5c' } }, stats: { radius: '6,000' },
    heightMapSize: [HM_W, HM_H], seaRadius: SEA_R,
  };
}

// The radius one vertex of a mark must stand at, read off site.js and not off carrier-globe.js.
const drapeR = (world, dir) => Math.max(S.groundRadius(world, HM, dir), SEA_R) + G.DRAPE_LIFT;

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
// The two plane tests of carrier-globe.js against 300 pairs of a site and a source. Every pair
// checks five things:
//
//   1. the source lies inside the wedge of its own fix
//   2. a direction one degree past either edge lies outside it
//   3. a direction behind the site, on the other half of the great circle, lies outside it
//   4. the wedge runs the whole way from the site to the antipode of the site, and no further
//   5. the uniforms the shader gets hold the same three vectors
let worstMargin = 1;      // parts of the wedge: how near the source came to an edge, 0 is on it
let worstUniform = 0;     // the widest gap between a uniform and the plane it must carry
const ARCS = [0.02, 0.5, 1.2, 2.0, 2.8, Math.PI - 0.02];
for (let i = 0; i < PAIRS; i++) {
  const srcDir = snapDir(randDir());
  const site = S.dirToSite(snapDir(randDir()));
  const world = worldWith('Wedge' + i, srcDir);
  const c = S.carrierAt(world, site);
  const fix = { lat: site.lat, lon: site.lon, brg: c.brg, err: c.err };
  const planes = G.wedgePlanes(fix);

  // 1. the true direction of the source lies between the two edge great circles
  const e = G.wedgeEdges(planes, srcDir);
  ok('wedge', G.inWedge(planes, srcDir), `pair ${i}: the source stands outside its own wedge (${e.l.toExponential(2)}, ${e.r.toExponential(2)})`);
  // how near the source came to an edge, as a part of the half width of the wedge
  worstMargin = Math.min(worstMargin, Math.min(e.l, e.r) / Math.sin(THREE.MathUtils.degToRad(c.err)));

  for (const arc of ARCS) {
    // 2. one degree past either edge is outside the wedge, and the paint there is nothing
    for (const brg of [c.brg - c.err - OUT_DEG, c.brg + c.err + OUT_DEG]) {
      const d = probe(site, brg, arc, 'edge', `pair ${i} at arc ${arc}`);
      ok('edge', !G.inWedge(planes, d), `pair ${i}: a direction ${OUT_DEG} deg past an edge at arc ${arc} stands inside the wedge`);
      ok('edge', G.wedgeCoverage(planes, d) === 0, `pair ${i}: a direction past an edge at arc ${arc} still takes paint`);
    }
    // 3. the other half of the great circle, behind the site, is outside the wedge
    const back = probe(site, (c.brg + 180) % 360, arc, 'back', `pair ${i} at arc ${arc}`);
    ok('back', !G.inWedge(planes, back), `pair ${i}: a direction behind the site at arc ${arc} stands inside the wedge`);
    // 4. the wedge itself runs the whole way along the bearing, from the site to the antipode
    const along = probe(site, c.brg, arc, 'along', `pair ${i} at arc ${arc}`);
    ok('along', G.inWedge(planes, along), `pair ${i}: the bearing itself falls out of the wedge at arc ${arc}`);
    ok('along', G.wedgeCoverage(planes, along) === 1, `pair ${i}: the bearing itself takes less than full paint at arc ${arc}`);
  }

  // 4. the antipode closes the wedge: the two edges meet there, so both tests read nothing
  const anti = S.siteDir(site.lat, site.lon, new THREE.Vector3()).multiplyScalar(-1);
  const ae = G.wedgeEdges(planes, anti);
  ok('close', Math.abs(ae.l) < 1e-3 && Math.abs(ae.r) < 1e-3, `pair ${i}: the wedge does not close at the antipode (${ae.l.toExponential(2)}, ${ae.r.toExponential(2)})`);
  // past the antipode the wedge is gone: a direction just past it on the same great circle is out
  // a point at arc PI - x along the reverse bearing is the point x past the antipode along the
  // bearing itself, so this is the wedge one twentieth of a radian past its own end
  const past = probe(site, (c.brg + 180) % 360, Math.PI - 0.05, 'close', `pair ${i} past the antipode`);
  ok('close', !G.inWedge(planes, past), `pair ${i}: the wedge reaches past the antipode of its site`);

  // 5. the uniforms the shader gets carry these same three vectors
  const group = G.makeCarrierGroup(world, { fixes: [fix], found: false, ts: 0 }, HM);
  if (!group) { fail('group', `pair ${i} gave no group`); continue; }
  const u = G.carrierUniforms();
  ok('uniform', u.uWedgeCount.value === 1, `pair ${i}: one fix gave a count of ${u.uWedgeCount.value}`);
  worstUniform = Math.max(
    worstUniform,
    u.uWedgeS.value[0].distanceTo(planes.s),
    u.uWedgeL.value[0].distanceTo(planes.nL),
    u.uWedgeR.value[0].distanceTo(planes.nR),
  );
  ok('uniform', u.uWedgeFade.value[0] === 1, `pair ${i}: a settled fix stands at fade ${u.uWedgeFade.value[0]}`);

  G.disposeCarrierGroup(group);
  ok('dispose', group.children.length === 0, `pair ${i}: the group kept its children after the dispose`);
  ok('dispose', G.carrierUniforms().uWedgeCount.value === 0, `pair ${i}: the dispose left ${G.carrierUniforms().uWedgeCount.value} wedges in the uniforms`);
}

// ---------------------------------------------------------------- C: the cap of MAX_WEDGES
// The shader holds MAX_WEDGES slots, so a world with more fixes draws the newest of them. The dots
// of every fix still stand on the globe, and only the paint takes the cap.
let capRow = '';
{
  const world = worldWith('Cap', snapDir(randDir()));
  const fixes = [];
  for (let i = 0; i < G.MAX_WEDGES + 3; i++) {
    const s = S.dirToSite(snapDir(randDir()));
    const c = S.carrierAt(world, s);
    fixes.push({ lat: s.lat, lon: s.lon, brg: c.brg, err: c.err });
  }
  const group = G.makeCarrierGroup(world, { fixes, found: false, ts: 0 }, HM);
  const u = G.carrierUniforms();
  ok('cap', u.uWedgeCount.value === G.MAX_WEDGES, `${fixes.length} fixes gave a count of ${u.uWedgeCount.value}`);
  const last = G.wedgePlanes(fixes[fixes.length - 1]);
  ok('cap', u.uWedgeS.value[G.MAX_WEDGES - 1].distanceTo(last.s) < 1e-6, 'the newest fix is not the last wedge in the uniforms');
  const drawn = group.children.filter((m) => m.visible);
  ok('cap', drawn.length === 1, `${fixes.length} fixes drew ${drawn.length} meshes of dots`);
  const dots = group.userData.meshes.marks.geometry.attributes.position.count;
  ok('cap', dots === fixes.length * (1 + 16), `${fixes.length} dots hold ${dots} vertices`);
  capRow = `  cap     ${fixes.length} fixes gave ${u.uWedgeCount.value} wedges of paint and one mesh of ${dots} vertices`;
  G.disposeCarrierGroup(group);
}

// ---------------------------------------------------------------- C: the fade and the replace
let fadeRow = '';
{
  const srcDir = snapDir(randDir());
  const world = worldWith('Fade', srcDir);
  const a = S.dirToSite(snapDir(randDir()));
  const group = G.makeCarrierGroup(world, { fixes: [], found: false, ts: 0 }, HM);
  const u = group.userData;
  const uni = G.carrierUniforms();
  ok('fade', uni.uWedgeCount.value === 0, 'a world with no fix painted a wedge');
  ok('fade', !u.meshes.marks.visible, 'a world with no fix drew a dot');

  const c = S.carrierAt(world, a);
  G.addWedge(group, { lat: a.lat, lon: a.lon, brg: c.brg, err: c.err }, { fade: true });
  ok('fade', uni.uWedgeCount.value === 1 && uni.uWedgeFade.value[0] === 0, 'the new wedge did not start at nothing');
  ok('fade', u.meshes.fadeMark.visible && u.mats.fadeMark.opacity === 0, 'the new dot did not start at nothing');
  G.updateCarrierGroup(group, 0.6);
  const half = uni.uWedgeFade.value[0];
  ok('fade', half > 0 && half < 1, `the wedge stood at ${half} halfway through the fade`);
  G.updateCarrierGroup(group, 0.7);
  ok('fade', u.fade === null && u.fixes.length === 1, 'the wedge did not settle at the end of the fade');
  ok('fade', uni.uWedgeFade.value[0] === 1, 'the settled wedge did not reach full paint');
  ok('fade', !u.meshes.fadeMark.visible && u.meshes.marks.visible, 'the settled dot stands on the wrong mesh');
  fadeRow = `  fade    the wedge stood at ${half.toFixed(4)} of 1 halfway through the 1.2 s`;

  // a second landing on the same cell replaces the wedge of that cell
  G.addWedge(group, { lat: a.lat, lon: a.lon, brg: c.brg, err: c.err }, { fade: false });
  ok('replace', u.fixes.length === 1, `a second landing on one cell left ${u.fixes.length} wedges`);
  ok('replace', uni.uWedgeCount.value === 1, `a second landing on one cell painted ${uni.uWedgeCount.value} wedges`);
  G.disposeCarrierGroup(group);
}

// ---------------------------------------------------------------- D: the marks on the ground
// The dot of a fix and the ring of a find both drape on the terrain. A mark at one radius floats:
// the surface stands near 1.0 and the camera comes to 1.11.
let markRow = '';
{
  const srcDir = snapDir(randDir());
  const world = worldWith('Mark', srcDir);
  const a = S.dirToSite(snapDir(randDir()));
  const group = G.makeCarrierGroup(world, { fixes: [{ lat: a.lat, lon: a.lon, brg: 10, err: 12 }], found: false, ts: 0 }, HM);
  const u = group.userData;

  // the dot: on the ground, and about 0.35 of a cell across
  {
    const pos = u.meshes.marks.geometry.attributes.position;
    let rLo = Infinity, rHi = 0, worstDrape = 0, hi = 0;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      const r = v.length();
      rLo = Math.min(rLo, r); rHi = Math.max(rHi, r);
      v.normalize();
      worstDrape = Math.max(worstDrape, Math.abs(r - drapeR(world, v)));
      hi = Math.max(hi, S.arcTo(a, v));
    }
    ok('dot', Math.abs(hi / S.CELL - 0.35) < 0.01, `the dot runs ${(hi / S.CELL).toFixed(3)} cells out and not 0.35`);
    // The drape is the proof that the dot lies on the terrain: every vertex has to read the rule of
    // site.js to a millionth, and the old shell of 1.07 missed it by the whole relief. The spread
    // of the radius says nothing here, because the dot covers a third of a cell and the height map
    // holds one texel every one and a half cells.
    ok('dot', worstDrape < R_TOL, `a point of the dot stood ${worstDrape.toExponential(2)} off the ground under it`);
    markRow = `  dot     the dot of a fix runs ${(hi / S.CELL).toFixed(2)} cells out, on the ground, radius ${rLo.toFixed(4)} to ${rHi.toFixed(4)}`;
  }

  // the find takes the wedges away and leaves one ring at the source
  G.setFound(group, world, HM);
  ok('found', G.carrierUniforms().uWedgeCount.value === 0, 'a found world still paints a wedge');
  ok('found', u.meshes.marks.visible, 'a found world draws no ring');
  const at = S.sourceSite(world);
  const pos = u.meshes.marks.geometry.attributes.position;
  let lo = Infinity, hi = 0;                 // cells of arc: how far out the band runs
  let rLo = Infinity, rHi = 0;               // globe units: the radius the band stands at
  let worstDrape = 0;                        // globe units: the gap against the rule of site.js
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    const r = v.length();
    rLo = Math.min(rLo, r); rHi = Math.max(rHi, r);
    v.normalize();
    // The drape: the ground under this vertex, or the sea over it, plus the lift.
    worstDrape = Math.max(worstDrape, Math.abs(r - drapeR(world, v)));
    ok('found', r >= SEA_R + G.DRAPE_LIFT - R_TOL, `a point of the ring stands at ${r.toFixed(6)}, under the sea`);
    const arc = S.arcTo(at, v);
    lo = Math.min(lo, arc); hi = Math.max(hi, arc);
  }
  const cells = (x) => x / S.CELL;
  ok('found', cells(lo) > 1.2 && cells(hi) < 1.8, `the ring runs ${cells(lo).toFixed(2)} to ${cells(hi).toFixed(2)} cells out`);
  ok('drape', worstDrape < R_TOL, `a point of the ring stood ${worstDrape.toExponential(2)} off the ground under it`);
  // The band follows the relief, so it cannot be one sphere. A ring that went back to a fixed
  // radius reads a spread of zero here.
  ok('drape', rHi - rLo > 1e-4, `the ring stands at one radius, spread ${(rHi - rLo).toExponential(2)}`);
  markRow += `\n  ring    the ring of a find runs ${cells(lo).toFixed(2)} to ${cells(hi).toFixed(2)} cells out from the source`;
  markRow += `\n  drape   its ${pos.count} vertices lie on the ground, radius ${rLo.toFixed(4)} to ${rHi.toFixed(4)}, ${worstDrape.toExponential(1)} off the rule of site.js`;
  G.disposeCarrierGroup(group);
}

// ---------------------------------------------------------------- the report
console.log('carrier-fix-check');
console.log('  store   one fix per cell, the find that survives a clear, both bounds, a quota error, and garbage');
console.log(`  wedge   ${PAIRS} pairs of a site and a source, ${ARCS.length} arcs each, from the site to the antipode`);
console.log(`  cover   the source stood inside every wedge, and came within ${(worstMargin * 100).toFixed(2)}% of an edge at worst`);
console.log(`  edge    ${OUT_DEG} deg past an edge, behind the site, and past the antipode: all outside, all unpainted`);
console.log(`  uniform the ${G.MAX_WEDGES} slots the shader reads stood ${worstUniform.toExponential(1)} off wedgePlanes() at worst`);
console.log(capRow);
console.log(fadeRow);
console.log(markRow);
if (fails.length) {
  console.error('\nFAIL');
  for (const f of fails) console.error('  ' + f);
  process.exitCode = 1;
} else {
  console.log('\nPASS');
}
