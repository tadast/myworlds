// The frame of the ground box against the frame of the sky, with no browser.
//
//   node tools/frame-check.mjs
//
// patch() in worker.js lays the ground box on a cell of the cube grid. groundBasis() in
// ground-sky.js turns the sun, the moons, and the ring into the ground frame: x east, y up,
// z south, a right-handed set. Until this check the box ran z along the v axis of the cell, and
// (u, up, v) is a left-handed set, so the terrain was the mirror of its cell and the sky stood
// mirrored against it. No turn about the up axis hides a mirror, so nothing here trusts a comment.
// Three checks run:
//
// 1. The box of a cell. On a site in each face of the cube grid, with a twist that is not zero,
//    and on three fixed sites, a step along box +x and a step along box +z go through
//    groundBasis() with the twist of cellTwist(). The +x step must read (1, 0) in (x, z) of the
//    ground frame, and the +z step must read toward (0, 1). The two axes of a cell do not stand
//    square near a corner of a face, so the +z step gets a slack; a mirror reads (0, -1) and no
//    slack hides it.
// 2. The hand of the box. In the ground frame x cross z is -y. The cross of the two steps must
//    point down, on every site.
// 3. The patch with no cell. The east and the south of tangentFrame() in worker.js read (1, 0, 0)
//    and (0, 0, 1) through groundBasis() with no twist.
//
// The map under test is boxTanX(), boxTanZ(), and tangentFrame() of worker.js itself, not a copy.
//
// site.js and ground-sky.js take three.js by the bare name `three`, which the import map of
// index.html resolves in the browser. Node has no import map, so a resolve hook points the same
// two names at vendor/.
import { register, createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = pathToFileURL(dir + '/').href;
const hook = `
const root = ${JSON.stringify(root)};
const ADDONS = 'three/addons/';
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: root + 'vendor/three.module.js', shortCircuit: true };
  if (spec.startsWith(ADDONS)) return { url: root + 'vendor/addons/' + spec.slice(ADDONS.length), shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hook));

const THREE = await import('three');
const S = await import(root + 'site.js');
const { groundBasis } = await import(root + 'ground-sky.js');

// The worker, as a classic script. The three lore files hang their tables on self first.
const require = createRequire(import.meta.url);
globalThis.self = globalThis;
for (const f of ['lore.js', 'species.js', 'flora-lore.js']) require(path.join(dir, f));
globalThis.importScripts = () => {};
globalThis.postMessage = () => {};
new Function('self', readFileSync(path.join(dir, 'worker.js'), 'utf8')
  + '\n;self.__w = { cellDirT, boxTanX, boxTanZ, tangentFrame };')(globalThis);
const W = globalThis.__w;

const SIZE = 1500;          // units, the side of the box
const STEP = 300;           // units of the box: the step along an axis
const X_TOL = 1e-3;         // how far the +x step may stand off (1, 0)
const Z_MIN = 0.85;         // the least z part of the +z step: cos of the 30 deg a face corner bends
const FLAT_TOL = 1e-9;      // the slack on the frame of a patch with no cell

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(30);
const randDir = () => {
  const y = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
  return new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
};

const fails = [];
const fail = (what, text) => fails.push(`${what}: ${text}`);

// dirOn() of patch() for a cell: the globe direction under a point of the box
const dirOn = (cell, xu, zu) => new THREE.Vector3(
  ...W.cellDirT(cell, W.boxTanX(cell, xu, SIZE), W.boxTanZ(cell, zu, SIZE), [0, 0, 0]));

// ---------------------------------------------------------------- the sites
const sites = [[0, 0], [12.5, -73.25], [-40, 120]].map(([lat, lon]) => S.snapSite({ lat, lon, kind: -1 }));
{
  const want = new Map();
  for (let i = 0; i < 40000 && want.size < 6; i++) {
    const d = randDir();
    const cell = S.dirCell(d.x, d.y, d.z);
    if (want.has(cell.face)) continue;
    const site = S.dirToSite(S.cellDir(cell, 0.5, 0.5, new THREE.Vector3()));
    if (Math.abs(S.cellTwist(site)) < 0.02) continue;      // a twist of nothing proves nothing
    want.set(cell.face, site);
  }
  if (want.size < 6) fail('faces', `only ${want.size} of the six faces gave a site with a twist`);
  for (const [, site] of [...want].sort((a, b) => a[0] - b[0])) sites.push(site);
}

// ---------------------------------------------------------------- 1 and 2: the box of a cell
const rows = [];
for (const site of sites) {
  const cell = S.siteCell(site);
  const twist = S.cellTwist(site);
  const basis = groundBasis(null, site, twist);
  const at = dirOn(cell, 0, 0).applyMatrix4(basis);
  const ax = dirOn(cell, STEP, 0).applyMatrix4(basis).sub(at).normalize();
  const az = dirOn(cell, 0, STEP).applyMatrix4(basis).sub(at).normalize();
  const name = `face ${cell.face} site ${site.lat.toFixed(2)},${site.lon.toFixed(2)}`;
  if (Math.hypot(ax.x - 1, ax.z) > X_TOL) fail('box +x', `${name}: reads (${ax.x.toFixed(3)}, ${ax.z.toFixed(3)}), not (1, 0)`);
  if (az.z < Z_MIN) {
    fail('box +z', `${name}: reads (${az.x.toFixed(3)}, ${az.z.toFixed(3)}), not toward (0, 1)`
      + (az.z < 0 ? ': the box is the mirror of the ground frame' : ''));
  }
  const hand = new THREE.Vector3().crossVectors(ax, az).y;      // x cross z is -y in a right-handed set
  if (hand > -Z_MIN) fail('hand', `${name}: box x cross box z reads y ${hand.toFixed(3)}, not -1: a left-handed box`);
  const f = (v) => `(${v.x.toFixed(3).padStart(6)}, ${v.z.toFixed(3).padStart(6)})`;
  rows.push(`  face ${cell.face}  lat ${site.lat.toFixed(2).padStart(7)}  lon ${site.lon.toFixed(2).padStart(8)}`
    + `  twist ${THREE.MathUtils.radToDeg(twist).toFixed(2).padStart(8)} deg`
    + `  +x ${f(ax)}  +z ${f(az)}  hand ${hand.toFixed(3)}`);
}

// ---------------------------------------------------------------- 3: the patch with no cell
let worstFlat = 0;
for (let i = 0; i < 200; i++) {
  const site = S.dirToSite(randDir());
  const t = W.tangentFrame(site.lat, site.lon);
  const basis = groundBasis(null, site, 0);
  const e = new THREE.Vector3(...t.east).applyMatrix4(basis);
  const s = new THREE.Vector3(...t.south).applyMatrix4(basis);
  const u = new THREE.Vector3(...t.up).applyMatrix4(basis);
  const off = Math.max(e.distanceTo(new THREE.Vector3(1, 0, 0)), u.distanceTo(new THREE.Vector3(0, 1, 0)),
    s.distanceTo(new THREE.Vector3(0, 0, 1)));
  if (off > FLAT_TOL) fail('no cell', `site ${site.lat.toFixed(2)},${site.lon.toFixed(2)}: the frame of tangentFrame() stands ${off.toExponential(1)} off the ground frame`);
  worstFlat = Math.max(worstFlat, off);
}

// ---------------------------------------------------------------- the report
console.log('frame-check: the axes of the ground box, read in the ground frame of groundBasis()');
console.log(`  +x must read (1, 0) and +z must read toward (0, 1), z part ${Z_MIN} or more. hand must read near -1.`);
for (const r of rows) console.log(r);
console.log(`  no cell  the frame of tangentFrame() stood ${worstFlat.toExponential(1)} off the ground frame at worst`);
if (fails.length) {
  console.error('\nFAIL');
  for (const f of fails) console.error('  ' + f);
  process.exitCode = 1;
} else {
  console.log('\nPASS');
}
