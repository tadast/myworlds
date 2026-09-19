// The fixes and the wedges of the carrier, with no browser. Issue 34, slice 2.
//
//   node tools/carrier-fix-check.mjs
//
// Four parts:
//
// A. The store. carrier-store.js runs against a fake localStorage: one fix per cell, the brief that
//    a record from an older build reads as unread, the find that drops the fixes and survives a
//    clear, the two bounds, a quota error that must not throw and must not touch the key of the
//    saved worlds, and a record of garbage that must read as empty.
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
// C. The cap, the age, the wash, and the fade. The store keeps MAX_FIXES = 4 fixes of a seed and
//    the shader holds MAX_WEDGES = 4 of them, so the two caps are one number and a world with more
//    draws the 4 newest. The line of a wedge weakens with its age, and the wash grows on the square
//    of the count. A new fix fades in over 1.2 s through its own slot of the fade uniform.
//
// D. The marks on the ground. The cell of a fix is four edge planes the shader paints; the middle
//    of the cell stands inside and each next cell outside. Three near fixes fill the cell of the
//    source, and two fixes or three wide ones do not. A find takes the wedges away, keeps the
//    source cell filled, and stands a pin of PIN_H on it with a model of MODEL_H on top.
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

// A site that hears the source of a world. The carrier reaches CARRIER_REACH and no further, so a
// site drawn at random is silent about one time in four and states no fix at all.
function siteHearing(world, what) {
  for (let k = 0; k < 400; k++) {
    const s = S.dirToSite(snapDir(randDir()));
    if (S.carrierAt(world, s)) return s;
  }
  fail(what, 'no site inside the reach after 400 draws');
  return null;
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

  // the brief: a record with no flag reads as not briefed, and the mark stands after a reload
  ok('store', C.loadFixes('Auralis').briefed === false, 'a record with no flag read as briefed');
  ok('store', C.markBriefed('Auralis').briefed === true, 'markBriefed() did not mark the brief');
  ok('store', C.loadFixes('Auralis').briefed === true, 'the brief did not survive a read');
  ok('store', C.loadFixes('Auralis').fixes.length === 2, 'the brief took the fixes with it');

  // the find. It drops the fixes of that seed, because the search is over.
  rec = C.markFound('Auralis');
  ok('store', rec.found === true, 'markFound() did not mark the find');
  ok('store', rec.fixes.length === 0, `the find left ${rec.fixes.length} fixes standing`);
  ok('store', C.loadFixes('Auralis').fixes.length === 0, 'the fixes came back after the find');

  // a found world takes no further fix
  rec = C.addFix('Auralis', { lat: site.lat, lon: site.lon, brg: 41.2, err: 12.5 });
  ok('store', rec.fixes.length === 0, 'a found world took a new fix');

  // the clear keeps the find and the brief
  rec = C.clearFixes('Auralis');
  ok('store', rec.fixes.length === 0 && rec.found === true, 'the clear took the find with the fixes');
  ok('store', rec.briefed === true, 'the clear took the brief with the fixes');
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
  store.set(C.CARRIER_KEY, '{"Bad": {"fixes": [1, {"lat": "x"}], "found": "yes", "briefed": 3}}');
  rec = C.loadFixes('Bad');
  ok('store', rec.fixes.length === 0 && rec.found === true && rec.briefed === true, 'a record of garbage did not clean up');
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
  const world = worldWith('Wedge' + i, srcDir);
  // The carrier reaches CARRIER_REACH and no further, so a site that hears nothing states no fix
  // and draws no wedge. A pair here is a pair the instrument really reads.
  const site = siteHearing(world, 'reach');
  if (!site) break;
  const c = S.carrierAt(world, site);
  ok('reach', S.arcTo(site, srcDir) <= S.CARRIER_REACH, `pair ${i}: a reading came from past the reach`);
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
// The store and the shader hold one cap of 4, so a landing past the fourth drops the oldest fix and
// the globe paints the 4 newest. The dots of every fix a group is given still stand on the globe,
// and only the paint takes the cap.
let capRow = '';
{
  ok('cap', C.MAX_FIXES === 4, `the store keeps ${C.MAX_FIXES} fixes and not 4`);
  ok('cap', G.MAX_WEDGES === 4, `the shader holds ${G.MAX_WEDGES} wedges and not 4`);
  ok('cap', C.MAX_FIXES === G.MAX_WEDGES, 'the store and the shader hold two different caps');

  const world = worldWith('Cap', snapDir(randDir()));
  const fixes = [];
  for (let i = 0; i < G.MAX_WEDGES + 3; i++) {
    const s = siteHearing(world, 'cap');
    if (!s) break;
    const c = S.carrierAt(world, s);
    fixes.push({ lat: s.lat, lon: s.lon, brg: c.brg, err: c.err });
  }
  const group = G.makeCarrierGroup(world, { fixes, found: false, ts: 0 }, HM);
  const u = G.carrierUniforms();
  ok('cap', u.uWedgeCount.value === G.MAX_WEDGES, `${fixes.length} fixes gave a count of ${u.uWedgeCount.value}`);
  const last = G.wedgePlanes(fixes[fixes.length - 1]);
  ok('cap', u.uWedgeS.value[G.MAX_WEDGES - 1].distanceTo(last.s) < 1e-6, 'the newest fix is not the last wedge in the uniforms');
  // the newest of the drawn set is the newest fix of the whole set, and the oldest drawn wedge is
  // the one the cap let through last, so the four slots carry the four newest fixes in order
  for (let i = 0; i < G.MAX_WEDGES; i++) {
    const slot = G.wedgePlanes(fixes[fixes.length - G.MAX_WEDGES + i]);
    ok('cap', u.uWedgeS.value[i].distanceTo(slot.s) < 1e-6, `slot ${i} does not hold the fix it should`);
  }
  // the age: the newest wedge draws its line full, and each older one draws weaker
  const ages = Array.from(u.uWedgeAge.value.slice(0, G.MAX_WEDGES));
  const want = G.WEDGE_AGE.slice(0, G.MAX_WEDGES).slice().reverse();
  ok('age', ages.every((a, i) => Math.abs(a - want[i]) < 1e-6), `the ages read ${ages.join(', ')} and not ${want.join(', ')}`);
  ok('age', G.WEDGE_AGE[0] === 1, `the newest wedge draws its line at ${G.WEDGE_AGE[0]} and not full`);

  ok('cap', group.children.length === 0, `${fixes.length} fixes drew ${group.children.length} meshes`);
  // each drawn fix paints the outline of its own cell, in the slots of its wedge
  for (let i = 0; i < G.MAX_WEDGES; i++) {
    const f = fixes[fixes.length - G.MAX_WEDGES + i];
    const planes = u.uVisitN.value.slice(i * 4, i * 4 + 4);
    const mid = S.siteDir(f.lat, f.lon, new THREE.Vector3());
    ok('cell', G.inCell(planes, mid) > 0, `slot ${i} does not hold the cell of its fix`);
  }
  capRow = `  cap     ${fixes.length} fixes gave ${u.uWedgeCount.value} wedges of paint and ${u.uWedgeCount.value} cells, no mesh`;
  capRow += `\n  age     the lines stand at ${ages.map((a) => a.toFixed(2)).join(', ')} of WEDGE_EDGE, the oldest first and the newest last`;
  G.disposeCarrierGroup(group);
}

// ---------------------------------------------------------------- C: the wash of the overlap
// One wedge alone must be almost only its two lines, and the ground two or more wedges cover must
// stand out. So the wash grows on the square of the count and not on the count. wedgeWash() is the
// formula of the GLSL in JS, and both read WEDGE_STEP of carrier-globe.js.
let washRow = '';
{
  const want = [0.06, 0.22, 0.43, 0.63];
  const got = want.map((_, i) => G.wedgeWash(i + 1));
  for (let i = 0; i < want.length; i++) {
    ok('wash', Math.abs(got[i] - want[i]) < 0.005, `${i + 1} wedges wash ${got[i].toFixed(4)} and not ${want[i]}`);
  }
  ok('wash', G.wedgeWash(0) === 0, 'no wedge still washed the ground');
  // it has to grow faster than the count, or two wedges read as two of one
  for (let i = 1; i < want.length; i++) {
    ok('wash', got[i] - got[i - 1] > got[0], `the step from ${i} to ${i + 1} wedges is no wider than one wedge alone`);
  }
  washRow = `  wash    1 to ${want.length} wedges wash ${got.map((k) => k.toFixed(2)).join(', ')} of the way to the accent`;
}

// ---------------------------------------------------------------- C: the fade and the replace
let fadeRow = '';
{
  const srcDir = snapDir(randDir());
  const world = worldWith('Fade', srcDir);
  const a = siteHearing(world, 'fade');
  const group = G.makeCarrierGroup(world, { fixes: [], found: false, ts: 0 }, HM);
  const u = group.userData;
  const uni = G.carrierUniforms();
  ok('fade', uni.uWedgeCount.value === 0, 'a world with no fix painted a wedge');

  const c = S.carrierAt(world, a);
  G.addWedge(group, { lat: a.lat, lon: a.lon, brg: c.brg, err: c.err }, { fade: true });
  ok('fade', uni.uWedgeCount.value === 1 && uni.uWedgeFade.value[0] === 0, 'the new wedge did not start at nothing');
  ok('fade', uni.uWedgeAge.value[0] === G.WEDGE_AGE[0], 'the wedge that fades in is not the newest one');
  G.updateCarrierGroup(group, 0.6);
  const half = uni.uWedgeFade.value[0];
  ok('fade', half > 0 && half < 1, `the wedge stood at ${half} halfway through the fade`);
  G.updateCarrierGroup(group, 0.7);
  ok('fade', u.fade === null && u.fixes.length === 1, 'the wedge did not settle at the end of the fade');
  ok('fade', uni.uWedgeFade.value[0] === 1, 'the settled wedge did not reach full paint');
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

  // the cell of the fix: its middle inside, the middle of each next cell outside
  {
    const planes = G.cellPlanes(a);
    const mid = S.siteDir(a.lat, a.lon, new THREE.Vector3());
    ok('cell', Math.abs(G.inCell(planes, mid) - S.CELL / 2) < S.CELL * 0.1, `the middle of a cell stands ${(G.inCell(planes, mid) / S.CELL).toFixed(3)} cells in and not 0.5`);
    const cell = S.siteCell(a);
    for (const [uu, vv] of [[1.5, 0.5], [-0.5, 0.5], [0.5, 1.5], [0.5, -0.5]]) {
      ok('cell', G.inCell(planes, S.cellDir(cell, uu, vv)) < 0, `the cell next door at ${uu},${vv} reads as inside`);
    }
    markRow = `  cell    the middle of a cell stands ${(G.inCell(planes, mid) / S.CELL).toFixed(3)} cells from its nearest edge, the four next cells outside`;
  }

  // The find takes the wedges away, keeps the cell of the source filled, and stands a pin there
  // with a small model on top. Every vertex is read back in the local frame of the planet, so the
  // check measures the thing the reader sees and not the numbers that built it.
  G.setFound(group, world, HM);
  const uni = G.carrierUniforms();
  ok('found', uni.uWedgeCount.value === 0, 'a found world still paints a wedge');
  ok('found', uni.uGoalK.value > 0, 'a found world does not fill the cell of the source');
  const at = S.sourceSite(world);
  const up = S.siteDir(at.lat, at.lon, new THREE.Vector3());
  ok('found', G.inCell(uni.uGoalN.value, up) > 0, 'the filled cell is not the cell of the source');
  ok('found', !!u.wreck && u.wreck.obj.parent === group, 'a found world stands no pin at the source');

  const ground = drapeR(world, up) - G.DRAPE_LIFT;
  const reach = (mesh) => {
    mesh.updateMatrixWorld(true);
    const pos = mesh.geometry.attributes.position, v = new THREE.Vector3();
    let lo = Infinity, hi = -Infinity, arc = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const over = v.dot(up) - ground;
      lo = Math.min(lo, over); hi = Math.max(hi, over);
      arc = Math.max(arc, S.arcTo(at, v.clone().normalize()) / S.CELL);
    }
    return { lo, hi, arc };
  };
  u.wreck.obj.updateMatrixWorld(true);
  const pin = reach(u.wreck.pin);
  ok('found', Math.abs(pin.lo) < 1e-6 && Math.abs(pin.hi - G.PIN_H) < 1e-6, `the pin runs ${pin.lo.toFixed(5)} to ${pin.hi.toFixed(5)} over the ground`);
  const model = reach(u.wreck.body);
  ok('found', Math.abs(model.lo - G.PIN_H) < 1e-4, `the model stands ${model.lo.toFixed(5)} over the ground and not on the pin`);
  ok('found', model.hi - model.lo <= G.MODEL_H + 1e-6, `the model stands ${(model.hi - model.lo).toFixed(5)} tall`);
  // The first build stood a wreck 0.06 radii tall that spread 4 cells. The model stays inside about
  // one cell of the pin.
  ok('found', model.arc < 1.5, `the model spreads ${model.arc.toFixed(2)} cells from the cell`);
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(u.wreck.obj.quaternion).normalize();
  ok('found', axis.angleTo(up) < 1e-6, `the pin stands ${axis.angleTo(up).toFixed(6)} rad off the surface normal`);
  const turn = u.wreck.float.rotation.y;
  G.updateCarrierGroup(group, 0.9);
  ok('found', u.wreck.float.rotation.y !== turn, 'the model does not turn');
  const stock = THREE.Mesh.prototype.raycast;
  ok('found', u.wreck.pin.raycast !== stock && u.wreck.body.raycast !== stock, 'the pin answers a ray');

  markRow += `\n  pin     the pin stands ${pin.hi.toFixed(3)} radii tall, the model ${(model.hi - model.lo).toFixed(4)} tall on top,`
    + ` reaching ${model.arc.toFixed(2)} cells from the middle of the cell`;
  G.disposeCarrierGroup(group);
  ok('found', u.wreck == null, 'the dispose left the mini wreck behind');
}

// ---------------------------------------------------------------- the goal
// Three fixes from near the source close on a few cells, and the globe then fills the cell of the
// source. Two fixes never do, and three wide fixes from the edge of the reach do not either.
let goalRow = '';
{
  let hit = 0, runs = 0, wide = 0;
  for (let n = 0; n < 40; n++) {
    const srcDir = snapDir(randDir());
    const world = worldWith('Goal' + n, srcDir);
    const at = S.sourceSite(world);
    const near = [], far = [];
    for (let k = 0; k < 3; k++) {
      // a near site 3 cells out on three bearings, and a far one near the edge of the reach
      const up = S.siteDir(at.lat, at.lon, new THREE.Vector3());
      const t = new THREE.Vector3(0, 1, 0).cross(up).normalize().applyAxisAngle(up, k * 2.1);
      for (const [arc, list] of [[3 * S.CELL, near], [S.CARRIER_REACH * 0.9, far]]) {
        const d = up.clone().multiplyScalar(Math.cos(arc)).addScaledVector(t, Math.sin(arc));
        const s = S.snapSite(S.dirToSite(d));
        const c = S.carrierAt(world, s);
        if (c) list.push({ lat: s.lat, lon: s.lon, brg: c.brg, err: c.err });
      }
    }
    if (near.length < 3 || far.length < 3) continue;
    runs++;
    ok('goal', G.goalCell(world, near.slice(0, 2)) === null, 'two fixes filled a goal');
    const g = G.goalCell(world, near);
    if (g) {
      hit++;
      ok('goal', g.lat === at.lat && g.lon === at.lon, 'the goal is not the cell of the source');
    }
    if (G.goalCell(world, far)) wide++;
  }
  ok('goal', runs > 20 && hit > runs * 0.8, `three near fixes filled the goal on ${hit} of ${runs} worlds`);
  ok('goal', wide === 0, `three far fixes filled the goal on ${wide} of ${runs} worlds`);
  goalRow = `  goal    three near fixes filled the source cell on ${hit} of ${runs} worlds, three far fixes on ${wide}`;
}

// ---------------------------------------------------------------- the report
console.log('carrier-fix-check');
console.log('  store   one fix per cell, the brief, the find that drops the fixes, both bounds, a quota error, and garbage');
console.log(`  wedge   ${PAIRS} pairs of a site and a source inside the reach, ${ARCS.length} arcs each, from the site to the antipode`);
console.log(`  cover   the source stood inside every wedge, and came within ${(worstMargin * 100).toFixed(2)}% of an edge at worst`);
console.log(`  edge    ${OUT_DEG} deg past an edge, behind the site, and past the antipode: all outside, all unpainted`);
console.log(`  uniform the ${G.MAX_WEDGES} slots the shader reads stood ${worstUniform.toExponential(1)} off wedgePlanes() at worst`);
console.log(capRow);
console.log(washRow);
console.log(fadeRow);
console.log(markRow);
console.log(goalRow);
if (fails.length) {
  console.error('\nFAIL');
  for (const f of fails) console.error('  ' + f);
  process.exitCode = 1;
} else {
  console.log('\nPASS');
}
