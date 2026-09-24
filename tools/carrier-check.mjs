// The bearing math of the carrier, with no browser. Issue 34, slice 1.
//
//   node tools/carrier-check.mjs
//
// East is easy to mirror, and the sky of this app had that defect once; see decision 10 of
// docs/probe.md. So nothing here trusts a comment. Four checks run:
//
// 0. The reach. The carrier does not reach the far side of the world. carrierAt() gives a reading
//    for an arc inside CARRIER_REACH and null past it, and nothing else decides that.
// 1. The wedge. Over PAIRS random pairs of a site and a source, the true bearing lies inside the
//    bearing carrierAt() states plus and minus its error.
// 2. The walk. A walk of the great circle from the site along the TRUE bearing passes within
//    WALK_TOL of the source. The frame of the walk comes from groundBasis() in ground-sky.js and
//    the bearing comes from site.js, so the two files have to agree or the walk misses.
// 3. The needle. carrierDir() turned back into a bearing reads the bearing carrierAt() states, so
//    the arrow and the three digits of the overlay say one thing.
// 4. The six faces, in the frame of the box. The needle stands on the terrain and not in the sky,
//    because the reader walks the terrain and the wreck of slice 3 stands on it. On a site in each
//    face of the cube grid, with a twist that is not zero:
//    a. boxPoint() is the exact inverse of the map patch() in generate.js builds the box with. A
//       source seated at a known point of the box comes back as that point, and the needle, with
//       the offset of the wedge taken out, lies along it.
//    b. For a far source, a short step of the globe from the site along the stated bearing lands
//       on the box along the needle.
// 5. The mirror. The box of patch() in generate.js and the frame of groundBasis() must be the same
//    hand. The box was the mirror of that frame once, and the needle then had to take the mirror
//    too. A step along box +x must read (1, 0) in the ground frame and a step along box +z must
//    read toward (0, 1), and the needle must stand where the sky frame holds the source. The map
//    of the box is boxTanX() and boxTanZ() of generate.js itself, and not a copy.
//
// site.js and ground-sky.js take three.js by the bare name `three`, which the import map of
// index.html resolves in the browser. Node has no import map, so a resolve hook points the same
// two names at vendor/. Nothing about the way the browser loads them changes.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
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

const THREE = await import('three');
const S = await import(root + 'site.js');
const { groundBasis } = await import(root + 'ground-sky.js');

const PAIRS = 1000;         // pairs of a site and a source
const WALK_STEPS = 4000;    // steps of the walk over the half circle: 0.00079 rad each
const WALK_TOL = 0.001;     // radians: how near the walk has to pass the source
const ANG_TOL = 1e-9;       // degrees: the slack on an angle two files compute two ways

// One generator, so a failing run repeats exactly.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260919);

// A direction on the globe, even over the sphere.
function randDir() {
  const y = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - y * y);
  return new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
}

// The middle of the cell a direction falls in. The worker snaps the source this way and the app
// snaps a landing this way, so every direction here is the middle of a cell.
function snapDir(d) {
  return S.cellDir(S.dirCell(d.x, d.y, d.z), 0.5, 0.5, new THREE.Vector3());
}

// A world with nothing but the members carrierAt() reads.
function worldWith(seed, dir) {
  return { seed, source: { kind: 'wreck', dir: [dir.x, dir.y, dir.z] }, stats: { radius: '6,000' } };
}

// The three axes of the ground frame at a site, from ground-sky.js. The matrix holds them as its
// rows, and three.js keeps its elements by column.
function frameOf(site, twist = 0) {
  const e = groundBasis(null, site, twist).elements;
  return {
    east: new THREE.Vector3(e[0], e[4], e[8]),
    up: new THREE.Vector3(e[1], e[5], e[9]),
    south: new THREE.Vector3(e[2], e[6], e[10]),
  };
}

const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;
const fails = [];
const fail = (what, detail) => { if (fails.length < 8) fails.push(`${what}: ${detail}`); };

// ---------------------------------------------------------------- 0, 1, 2 and 3: the random pairs
let worstWedge = 0;      // how near a true bearing came to the edge of its wedge, as a part of it
let worstWalk = 0;       // radians: the furthest a walk passed the source
let worstNeedle = 0;     // degrees: the widest gap between the needle and the three digits
let heard = 0, silent = 0;   // pairs inside the reach, and pairs past it
let worstErr = 0;        // degrees: the widest error a reading stated
for (let i = 0; i < PAIRS; i++) {
  const srcDir = snapDir(randDir());
  const site = S.dirToSite(snapDir(randDir()));
  const world = worldWith('Seed' + i, srcDir);
  const c = S.carrierAt(world, site);

  // 0. the reach: a reading inside CARRIER_REACH and null past it, and nothing else
  const arc = S.arcTo(S.snapSite(site), srcDir);
  const inReach = arc <= S.CARRIER_REACH;
  if (inReach !== !!c) {
    fail('reach', `pair ${i}: the arc is ${arc.toFixed(4)} rad and carrierAt() gave ${c ? 'a reading' : 'null'}`);
  }
  if (!c) { silent++; continue; }
  heard++;
  if (Math.abs(c.arc - arc) > 1e-12) fail('reach', `pair ${i}: the arc reads ${c.arc.toFixed(6)} and not ${arc.toFixed(6)}`);
  // the error runs straight over the reach, from CARRIER_ERR[0] to CARRIER_ERR[1]
  const wantErr = S.CARRIER_ERR[0] + (S.CARRIER_ERR[1] - S.CARRIER_ERR[0]) * (arc / S.CARRIER_REACH);
  if (Math.abs(c.err - wantErr) > 1e-9) fail('error', `pair ${i}: the error reads ${c.err.toFixed(6)} and not ${wantErr.toFixed(6)}`);
  worstErr = Math.max(worstErr, c.err);

  // 1. the wedge holds the true bearing
  const trueBrg = S.bearingTo(site, srcDir);
  const off = Math.abs(wrap180(c.brg - trueBrg));
  if (off > c.err + ANG_TOL) fail('wedge', `pair ${i}: the true bearing lies ${off.toFixed(4)} deg off, and the error is ${c.err.toFixed(4)}`);
  worstWedge = Math.max(worstWedge, off / c.err);

  // the same site twice gives the same fix, so a second visit never moves the wedge
  if (S.carrierAt(world, site).brg !== c.brg) fail('fix', `pair ${i} moved on a second read`);

  // the range shows only inside CARRIER_RANGE cells of arc. Decision 7.
  const near = c.arc <= S.CARRIER_RANGE * S.CELL;
  if (near !== (c.rangeKm != null)) fail('range', `pair ${i}: arc ${c.arc.toFixed(4)} rad, rangeKm ${c.rangeKm}`);

  // 2. the walk of the great circle along the true bearing passes the source
  const f = frameOf(site);
  const b = THREE.MathUtils.degToRad(trueBrg);
  // north is the opposite of south, and the walk leaves the site on the bearing
  const t = f.south.clone().multiplyScalar(-Math.cos(b)).addScaledVector(f.east, Math.sin(b));
  let best = Infinity;
  const p = new THREE.Vector3();
  for (let k = 0; k <= WALK_STEPS; k++) {
    const s = k * Math.PI / WALK_STEPS;
    p.copy(f.up).multiplyScalar(Math.cos(s)).addScaledVector(t, Math.sin(s));
    const a = Math.acos(THREE.MathUtils.clamp(p.dot(srcDir), -1, 1));
    if (a < best) best = a;
  }
  if (best > WALK_TOL) fail('walk', `pair ${i}: the walk passed ${best.toFixed(5)} rad from the source`);
  worstWalk = Math.max(worstWalk, best);

  // 3. the needle stands on the bearing the digits state
  const gap = Math.abs(wrap180(S.bearingTo(site, S.carrierDir(world, site, c)) - c.brg));
  if (gap > 1e-6) fail('needle', `pair ${i}: the needle stands ${gap.toFixed(6)} deg off the digits`);
  worstNeedle = Math.max(worstNeedle, gap);
}

// ---------------------------------------------------------------- the cell of the source
// A landing on the cell of the source has to read as the cell of the source. The arc there is not
// exactly zero, because a site of record carries two decimals of a degree and that rounding stands
// up to 0.013 of a cell from the middle. The overlay calls anything under a tenth of a cell "Here",
// so the arc has to stay well under that. See CARRIER_HERE in probe-hud.js.
let worstHere = 0;
for (let i = 0; i < 200; i++) {
  const world = worldWith('Here' + i, snapDir(randDir()));
  const site = S.sourceSite(world);
  const c = S.carrierAt(world, site);
  if (!S.sourceHere(world, site)) fail('here', `world ${i}: sourceHere() missed its own cell`);
  if (c.arc > 0.0005) fail('here', `world ${i}: the arc on the cell of the source is ${c.arc.toFixed(6)} rad`);
  if (c.rangeKm == null) fail('here', `world ${i}: the cell of the source states no range`);
  worstHere = Math.max(worstHere, c.arc);
}

// ---------------------------------------------------------------- the edge of the reach
// A source placed at a known arc from a site, on both sides of CARRIER_REACH. The reading has to
// stop at the reach and not one cell before it or one cell after it. The arcs stand clear of the
// reach by more than the rounding of a site, which is 0.013 of a cell.
let reachRow = '';
{
  const site = S.snapSite({ lat: -18.5, lon: 64.25, kind: -1 });
  const f = frameOf(site);
  const at = (arc) => f.up.clone().multiplyScalar(Math.cos(arc)).addScaledVector(f.east, Math.sin(arc));
  for (const [arc, want] of [
    [S.CARRIER_REACH - 0.02, true], [S.CARRIER_REACH - 0.001, true],
    [S.CARRIER_REACH + 0.001, false], [S.CARRIER_REACH + 0.02, false], [Math.PI - 0.01, false],
  ]) {
    const c = S.carrierAt(worldWith('Reach', at(arc)), site);
    if (!!c !== want) fail('reach', `an arc of ${arc.toFixed(4)} rad gave ${c ? 'a reading' : 'null'}`);
  }
  // the error at the two ends of the reach
  const near = S.carrierAt(worldWith('Reach', at(0.0005)), site);
  const edge = S.carrierAt(worldWith('Reach', at(S.CARRIER_REACH - 0.001)), site);
  if (Math.abs(near.err - S.CARRIER_ERR[0]) > 0.02) fail('error', `the error at the source is ${near.err.toFixed(3)} and not ${S.CARRIER_ERR[0]}`);
  if (Math.abs(edge.err - S.CARRIER_ERR[1]) > 0.02) fail('error', `the error at the edge of the reach is ${edge.err.toFixed(3)} and not ${S.CARRIER_ERR[1]}`);
  reachRow = `  reach   ${S.CARRIER_REACH.toFixed(4)} rad, a third of the circumference.`
    + ` The error runs ${near.err.toFixed(2)} to ${edge.err.toFixed(2)} deg over it, and past it the reading is null.`;
}

// ---------------------------------------------------------------- the plain east
// Bearing 90 is the east of the ground frame. A site, a step east of it, and nothing else.
{
  const site = { lat: 23.5, lon: -47.25, kind: -1 };
  const f = frameOf(site);
  const east = f.up.clone().multiplyScalar(Math.cos(0.02)).addScaledVector(f.east, Math.sin(0.02));
  const brg = S.bearingTo(site, east);
  if (Math.abs(wrap180(brg - 90)) > 1e-9) fail('east', `a step along the east of groundBasis() reads bearing ${brg.toFixed(6)}`);
  const south = f.up.clone().multiplyScalar(Math.cos(0.02)).addScaledVector(f.south, Math.sin(0.02));
  const sbrg = S.bearingTo(site, south);
  if (Math.abs(wrap180(sbrg - 180)) > 1e-9) fail('south', `a step along the south of groundBasis() reads bearing ${sbrg.toFixed(6)}`);
}

// ---------------------------------------------------------------- the map of generate.js
// patch() in generate.js builds the box with boxTanX() and boxTanZ(). The checks below take the map
// from that file and hold no copy of it, so a change of the box fails here and not on the ground.
const W = await import(root + 'generate.js');
// dirOn() of patch() in generate.js, for a cell: the globe direction under a point of the box
const dirOn = (cell, xu, zu, size) => new THREE.Vector3(...W.cellDirT(
  cell, W.boxTanX(cell, xu, size), W.boxTanZ(cell, zu, size), [0, 0, 0]));

// ---------------------------------------------------------------- 4: one site in each face
// The needle in the frame of the box, on a site in each face of the cube grid with a twist.
const BOX = 1500;             // units, the side of the box. PATCH_SIZE in site.js.
const SEAT = [[300, -200], [-450, 380], [60, 700], [-680, -40]];   // places in the box, in units
const STEP = 0.01;            // radians: the step of the far check, which is one cell
const PARALLEL_TOL = 0.5;     // degrees: how far two vectors of the box may stand apart
const faceRows = [];
{
  const want = new Map();
  for (let i = 0; i < 40000 && want.size < 6; i++) {
    const d = randDir();
    const cell = S.dirCell(d.x, d.y, d.z);
    if (want.has(cell.face)) continue;
    const site = S.dirToSite(S.cellDir(cell, 0.5, 0.5, new THREE.Vector3()));
    const twist = S.cellTwist(site);
    if (Math.abs(twist) < 0.02) continue;      // a twist of nothing proves nothing
    want.set(cell.face, { site, twist, cell });
  }
  if (want.size < 6) fail('faces', `only ${want.size} of the six faces gave a site with a twist`);
  // the angle between two vectors of the box, in degrees
  const angOf = (v) => THREE.MathUtils.radToDeg(Math.atan2(v.z, v.x));
  const apart = (a, b) => Math.abs(wrap180(angOf(a) - angOf(b)));
  for (const [face, { site, twist, cell }] of [...want].sort((a, b) => a[0] - b[0])) {
    const twistDeg = THREE.MathUtils.radToDeg(twist);
    let worstSeat = 0, worstAim = 0;
    // a. a source seated at a known point of the box
    for (const [x, z] of SEAT) {
      const dir = dirOn(cell, x, z, BOX);
      const world = worldWith('Seat' + face, dir);
      const p = S.boxPoint(site, dir, BOX);
      if (!p) { fail('boxPoint', `face ${face}: the seat at ${x},${z} gave no point`); continue; }
      const off = Math.hypot(p.x - x, p.z - z);
      if (off > 1e-6 * BOX) fail('boxPoint', `face ${face}: the seat at ${x},${z} came back at ${p.x.toFixed(6)},${p.z.toFixed(6)}`);
      worstSeat = Math.max(worstSeat, off);
      // the needle with the offset of the wedge taken out: a carrier on the true bearing
      const aim = S.carrierBox(world, site, { brg: S.bearingTo(site, dir) });
      const d = apart(aim, { x, z });
      if (d > PARALLEL_TOL) fail('needle', `face ${face}: the needle at the seat ${x},${z} stands ${d.toFixed(3)} deg off it`);
      worstAim = Math.max(worstAim, d);
    }
    // b. a far source: one step of the globe from the site along the bearing the instrument states.
    // The source has to stand inside the reach, or the instrument states nothing to step along.
    let srcDir = snapDir(randDir());
    for (let k = 0; k < 200 && S.arcTo(site, srcDir) > S.CARRIER_REACH; k++) srcDir = snapDir(randDir());
    const world = worldWith('Face' + face, srcDir);
    const c = S.carrierAt(world, site);
    if (!c) { fail('faces', `face ${face}: no source inside the reach after 200 draws`); continue; }
    const aim = S.carrierBox(world, site, c);
    const up = S.siteDir(site.lat, site.lon, new THREE.Vector3());
    const v = S.carrierDir(world, site, c, new THREE.Vector3());
    const t = v.clone().addScaledVector(up, -v.dot(up)).normalize();     // the way out, at the site
    const step = up.clone().multiplyScalar(Math.cos(STEP)).addScaledVector(t, Math.sin(STEP));
    const at = S.boxPoint(site, step, BOX);
    const here = S.boxPoint(site, up, BOX);
    const far = { x: at.x - here.x, z: at.z - here.z };
    const dFar = apart(aim, far);
    if (dFar > PARALLEL_TOL) fail('needle', `face ${face}: the step of the far source stands ${dFar.toFixed(3)} deg off the needle`);
    faceRows.push(`  face ${face}  lat ${site.lat.toFixed(2).padStart(7)}  lon ${site.lon.toFixed(2).padStart(8)}`
      + `  twist ${twistDeg.toFixed(2).padStart(8)} deg  bearing ${c.brg.toFixed(2).padStart(7)}`
      + `  seat ${worstSeat.toExponential(1)} u  near ${worstAim.toFixed(3)} deg  far ${dFar.toFixed(3)} deg`);
  }
}

// ---------------------------------------------------------------- 5: the mirror
// The sky against the box. patch() in generate.js lays the box on the axes of the cell of the cube
// grid, and groundBasis() builds the frame the sun, the moons, and the ring stand in: x east, y up,
// z south. The two were a mirror of each other once, with box z along the v axis of the cell, and
// no turn carries a mirror onto its image. So this is a check and not a note. A step along box +x
// must read (1, 0) in (x, z) of the ground frame. A step along box +z must read toward (0, 1); the
// two axes of a cell do not stand square near a corner of a face, so it gets a slack, and a mirror
// reads (0, -1), which no slack hides. The needle closes it: in a box of the right hand, a source
// to the east of north puts the needle to the right of box north, turned by the twist.
const MIRROR_Z_MIN = 0.85;    // the least z part of the +z step: cos of the 30 deg a face corner bends
const boxRows = [];
{
  const SIZE = 1500;
  const sites = [[0, 0], [12.5, -73.25], [-40, 120]].map(([lat, lon]) => S.snapSite({ lat, lon, kind: -1 }));
  for (const site of sites) {
    const cell = S.siteCell(site);
    const basis = groundBasis(null, site, S.cellTwist(site));
    const at = dirOn(cell, 0, 0, SIZE).applyMatrix4(basis);
    const ax = dirOn(cell, 300, 0, SIZE).applyMatrix4(basis).sub(at).normalize();
    const az = dirOn(cell, 0, 300, SIZE).applyMatrix4(basis).sub(at).normalize();
    const f = (v) => `(${v.x.toFixed(3)}, ${v.z.toFixed(3)})`;
    const name = `site ${site.lat.toFixed(2)},${site.lon.toFixed(2)}`;
    if (Math.hypot(ax.x - 1, ax.z) > 1e-3) fail('mirror', `${name}: box +x reads ${f(ax)} in the ground frame, not (1, 0)`);
    if (az.z < MIRROR_Z_MIN) {
      fail('mirror', `${name}: box +z reads ${f(az)} in the ground frame, not toward (0, 1)`
        + (az.z < 0 ? ': the box is the mirror of the sky' : ''));
    }
    // The needle against the sky. The source stands one cell out on a true bearing of 60 degrees.
    // Read through groundBasis(), that way is (sin 60, -cos 60) in (x, z): east is +x and north
    // is -z. carrierBox() must give the same way in the box, inside the slack of the map. A mirror
    // puts the needle on the other side of north, 120 degrees off, and no slack hides that.
    const fr = frameOf(site);
    const BRG = THREE.MathUtils.degToRad(60);
    const t = fr.east.clone().multiplyScalar(Math.sin(BRG)).addScaledVector(fr.south, -Math.cos(BRG));
    const src = fr.up.clone().multiplyScalar(Math.cos(0.01)).addScaledVector(t, Math.sin(0.01));
    const world = worldWith('Mirror', src);
    const aim = S.carrierBox(world, site, { brg: S.bearingTo(site, src) });
    const sky = src.clone().applyMatrix4(basis);
    const off = Math.abs(wrap180(THREE.MathUtils.radToDeg(Math.atan2(aim.z, aim.x) - Math.atan2(sky.z, sky.x))));
    if (off > 35) fail('mirror', `${name}: the needle stands ${off.toFixed(1)} deg off the source as the sky frame holds it`);
    boxRows.push(`  site ${site.lat.toFixed(2).padStart(7)},${site.lon.toFixed(2).padStart(8)}`
      + `  box +x reads ${f(ax)}  box +z reads ${f(az)}  needle ${off.toFixed(2)} deg off the sky`);
  }
}

// ---------------------------------------------------------------- the report
console.log(`carrier-check: ${PAIRS} pairs of a site and a source`);
console.log(reachRow);
console.log(`  heard   ${heard} pairs stood inside the reach and ${silent} past it, and the widest error stated was ${worstErr.toFixed(2)} deg`);
console.log(`  wedge   the true bearing reached ${(worstWedge * 100).toFixed(1)}% of the error at worst`);
console.log(`  walk    the great circle passed ${worstWalk.toFixed(6)} rad from the source at worst, limit ${WALK_TOL}`);
console.log(`  needle  the arrow stood ${worstNeedle.toExponential(1)} deg off the digits at worst`);
console.log(`  here    a landing on the cell of the source read ${worstHere.toExponential(1)} rad of arc at worst, limit 5.0e-4`);
console.log('the needle in the frame of the box, on a site in each face of the cube grid:');
console.log(`  seat: how far boxPoint() missed a seated source. near: the needle against that seat.`);
console.log(`  far: the needle against one step of ${STEP} rad along the stated bearing. Limit ${PARALLEL_TOL} deg.`);
for (const r of faceRows) console.log(r);
console.log(`the mirror: the axes of the box in (x, z) of the ground frame. +x must read (1, 0), +z toward (0, 1), z part ${MIRROR_Z_MIN} or more.`);
for (const r of boxRows) console.log(r);
if (fails.length) {
  console.error('\nFAIL');
  for (const f of fails) console.error('  ' + f);
  process.exitCode = 1;
} else {
  console.log('\nPASS');
}
