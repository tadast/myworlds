// myworlds — the landing site: the pick under the pointer, the pull to life, the marker, and the URL.
//
// A site is a lat and a lon in degrees in the planet's local frame, the frame of the worker's
// arrays before planet.rotation.y turns them. Lat is asin(y). Lon is atan2(z, x). Two decimals.
import * as THREE from 'three';
import { RIM, worldOpts } from './tiers.js';
import * as grid from './cell-grid.js';

export const PULL_REACH = 0.5;       // parts of a cell: how far the pull to life looks

// The patch cell. The reader picks a cell of the globe and the whole cell becomes the ground.
// cell-grid.js holds the grid and CELL, the arc of a cell in globe units.
//
// The cell is far wider than the box it draws into, so the ground holds an artificial scale.
// generate.js gives the two numbers back as patch.metresAcross and patch.metresUp. A plant and a
// creature keep their lore size in units, so they read as normal against the ground and they are
// no longer the metres the lore text says.
export { CELL, FACE_CELLS, dirCell } from './cell-grid.js';

// ---------------------------------------------------------------- the cell grid, issue 30
// The unit direction at (u, v) inside a cell, as a vector. cell-grid.js holds the map; this is the
// adapter of the page, which works in THREE.Vector3.
const _cell = [0, 0, 0];
export function cellDir(cell, u, v, out = new THREE.Vector3()) {
  return out.fromArray(grid.cellDir(cell, u, v, _cell));
}

// The cell a site falls in. The worker takes it as patch.cell and lays its box on the quad.
export function siteCell(site) {
  const d = siteDir(site.lat, site.lon, _local);
  return grid.dirCell(d.x, d.y, d.z);
}

// The turn from the frame of the site, x east and z south, to the frame of the box. The box of
// the patch runs x along the u axis of the cell and z against the v axis, so the sky must take the
// same turn or the sun stands in the wrong quarter of it. See groundBasis() in ground-sky.js.
//
// East is the east of groundBasis(): the direction of falling lon. The turn is the angle of the u
// axis from east toward south, which is the turn groundBasis() makes. patch() in generate.js builds
// a right-handed box, so one turn about the up axis brings the two frames together and the sky
// holds no mirror of the terrain.
export function cellTwist(site) {
  const cell = siteCell(site);
  const mid = cellDir(cell, 0.5, 0.5, _corner);
  const along = cellDir(cell, 1, 0.5, _dir).sub(mid);      // the u axis of the cell, at the middle
  const f = grid.tangentFrame(site.lat, site.lon);
  _east.fromArray(f.east);
  _south.fromArray(f.south);
  return Math.atan2(along.dot(_south), along.dot(_east));
}

const CENTRE = new THREE.Vector2(0, 0);
const _ray = new THREE.Raycaster();
const _centre = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _local = new THREE.Vector3();
const _east = new THREE.Vector3();
const _south = new THREE.Vector3();
const _corner = new THREE.Vector3();

const round2 = (v) => Math.round(v * 100) / 100;

// The site at the middle of the cell that holds a site. The URL keeps a lat and a lon, so the
// middle of the cell carries the cell: it stands half a cell from every edge, and two decimals of
// a degree cannot move it into the cell next door.
export function snapSite(site) {
  if (!site) return site;
  const d = cellDir(siteCell(site), 0.5, 0.5, _local);
  return dirToSite(d, site.kind);
}

// The metres of the globe across one cell, at its middle. The worker takes this as patch.span.
// A cell of the cube grid is not exactly CELL of arc, so the width comes from the cell itself.
export function cellSpan(world, site) {
  if (!site) return grid.CELL * radiusKm(world) * 1000;
  const cell = siteCell(site);
  const a = cellDir(cell, 0, 0.5, _corner), b = cellDir(cell, 1, 0.5, _dir);
  return 2 * Math.asin(THREE.MathUtils.clamp(a.distanceTo(b) / 2, 0, 1)) * radiusKm(world) * 1000;
}

// The ground radius under a unit direction in planet space, from the worker's lat/lon height map.
export function groundRadius(world, hm, dir) {
  if (!hm || !world.heightMapSize) return 1;
  const [W, H] = world.heightMapSize;
  const u = (Math.atan2(dir.z, dir.x) / (Math.PI * 2) + 0.5) * W - 0.5;
  const v = (Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) / Math.PI + 0.5) * H - 0.5;
  const x0 = Math.floor(u), y0 = THREE.MathUtils.clamp(Math.floor(v), 0, H - 2);
  const fx = u - x0, fy = THREE.MathUtils.clamp(v - y0, 0, 1);
  const xa = ((x0 % W) + W) % W, xb = (xa + 1) % W;
  const a = hm[xa + y0 * W], b = hm[xb + y0 * W], c = hm[xa + (y0 + 1) * W], d = hm[xb + (y0 + 1) * W];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

// A unit direction in planet space from a site.
export function siteDir(lat, lon, out = new THREE.Vector3()) {
  const a = THREE.MathUtils.degToRad(lat), o = THREE.MathUtils.degToRad(lon);
  const r = Math.cos(a);
  return out.set(r * Math.cos(o), Math.sin(a), r * Math.sin(o));
}

// The site under a unit direction in planet space.
export function dirToSite(dir, kind = -1) {
  const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x));
  return { lat: round2(lat), lon: round2(lon), kind };
}

// The planet radius in kilometres, from the stats line.
export function radiusKm(world) {
  const km = parseFloat(String(world?.stats?.radius || '').replace(/,/g, ''));
  return km > 0 ? km : 6000;
}

// The ray from a point of the screen, down onto the surface. The point is in normalised device
// coordinates and it is the screen centre when the caller gives none. Returns the hit direction in
// the planet's local frame and in world space, or null when the ray misses the planet.
export function pickDirs(camera, current, ndc = CENTRE) {
  if (!current || current.world.type === 'gas') return null;
  camera.updateMatrixWorld();
  current.planet.updateWorldMatrix(true, false);
  _centre.setFromMatrixPosition(current.planet.matrixWorld);
  _ray.setFromCamera(ndc, camera);
  const o = _ray.ray.origin, d = _ray.ray.direction;
  const ox = o.x - _centre.x, oy = o.y - _centre.y, oz = o.z - _centre.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz;
  let r = 1;
  for (let i = 0; i < 2; i++) {
    const disc = b * b - (cc - r * r);
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t <= 0) return null;
    _hit.copy(d).multiplyScalar(t).add(o);
    _local.copy(_hit);
    current.planet.worldToLocal(_local).normalize();
    r = groundRadius(current.world, current.heightMap, _local);
  }
  // The height map is smoother than the facets of the globe, so the hit above can stand a cell or
  // more off the ground the reader sees at a low camera. The facets and the sea take the last word.
  if (current.terrainMesh) facetHit(current, _ray.ray, _local);
  _dir.copy(_local).transformDirection(current.planet.matrixWorld);
  return { local: _local.clone(), world: _dir.clone() };
}

// ---------------------------------------------------------------- the pick on the facets
// The paint of the carrier and of the aim square lies on the facets of the globe, so the pick must
// meet the same facets. A walk over all 200,000 of them per pointer move costs too much, so the
// facets go into buckets once per world: a bucket is BUCKET by BUCKET cells of the cube grid, and
// a facet goes into the bucket of each of its three corners. The ray then tests only the facets in
// the buckets it passes through inside the shell of the terrain.
const BUCKET = 8;
const BUCKET_N = Math.ceil(grid.FACE_CELLS / BUCKET);
const RAY_STEP = grid.CELL / 2;           // globe units: the step of the walk along the ray
const facetIndex = new WeakMap();
const _lray = new THREE.Ray();
const _inv = new THREE.Matrix4();
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pc = new THREE.Vector3();
const _at = new THREE.Vector3(), _best = new THREE.Vector3();

const bucketOf = (x, y, z) => {
  const c = grid.dirCell(x, y, z);
  return (c.face * BUCKET_N + Math.floor(c.i / BUCKET)) * BUCKET_N + Math.floor(c.j / BUCKET);
};

function buildFacetIndex(geo) {
  const pos = geo.attributes.position.array;
  const idx = geo.index ? geo.index.array : null;
  const tris = idx ? idx.length / 3 : pos.length / 9;
  const corner = (t, k) => (idx ? idx[t * 3 + k] : t * 3 + k) * 3;
  const lists = new Map();
  let rLo = Infinity, rHi = 0;
  for (let t = 0; t < tris; t++) {
    const seen = [];
    for (let k = 0; k < 3; k++) {
      const v = corner(t, k);
      const x = pos[v], y = pos[v + 1], z = pos[v + 2];
      const r = Math.hypot(x, y, z);
      if (r < rLo) rLo = r;
      if (r > rHi) rHi = r;
      const b = bucketOf(x, y, z);
      if (seen.includes(b)) continue;
      seen.push(b);
      let l = lists.get(b);
      if (!l) lists.set(b, l = []);
      l.push(t);
    }
  }
  return { pos, corner, lists, rLo, rHi };
}

// Meet the ray with the facets and with the sea, in the local frame of the planet. `out` holds the
// estimate off the height map, and it takes the direction of the nearest hit. Without a hit it
// keeps the estimate.
function facetHit(current, worldRay, out) {
  const geo = current.terrainMesh.geometry;
  let fi = facetIndex.get(geo);
  if (!fi) facetIndex.set(geo, fi = buildFacetIndex(geo));
  _inv.copy(current.planet.matrixWorld).invert();
  _lray.copy(worldRay).applyMatrix4(_inv);
  _lray.direction.normalize();
  const o = _lray.origin, d = _lray.direction;
  // the part of the ray inside the shell of the terrain
  const b = o.dot(d), cc = o.lengthSq();
  const outer = b * b - (cc - fi.rHi * fi.rHi);
  if (outer < 0) return out;
  const t0 = Math.max(0, -b - Math.sqrt(outer));
  const inner = b * b - (cc - fi.rLo * fi.rLo);
  const t1 = inner >= 0 ? -b - Math.sqrt(inner) : -b + Math.sqrt(outer);
  let bestT = Infinity;
  const sea = current.world.seaRadius || 0;
  if (sea) {
    const disc = b * b - (cc - sea * sea);
    if (disc >= 0 && -b - Math.sqrt(disc) > 0) { bestT = -b - Math.sqrt(disc); _best.copy(d).multiplyScalar(bestT).add(o); }
  }
  const tested = new Set();
  for (let t = t0; t <= t1 + RAY_STEP && t < bestT; t += RAY_STEP) {
    _at.copy(d).multiplyScalar(t).add(o);
    const list = fi.lists.get(bucketOf(_at.x, _at.y, _at.z));
    if (!list || tested.has(list)) continue;
    tested.add(list);
    for (const tri of list) {
      const a = fi.corner(tri, 0), bb = fi.corner(tri, 1), c = fi.corner(tri, 2);
      _pa.fromArray(fi.pos, a); _pb.fromArray(fi.pos, bb); _pc.fromArray(fi.pos, c);
      if (!_lray.intersectTriangle(_pa, _pb, _pc, false, _at)) continue;
      const hitT = _at.sub(o).dot(d);
      if (hitT > 0 && hitT < bestT) { bestT = hitT; _best.copy(d).multiplyScalar(hitT).add(o); }
    }
  }
  if (bestT < Infinity) out.copy(_best).normalize();
  return out;
}

// The site under a point of the screen, or null. The point is the screen centre by default.
export function pickSite(camera, current, ndc) {
  const hit = pickDirs(camera, current, ndc);
  return hit ? dirToSite(hit.local) : null;
}

// The kinds of phenomenon the ground draws. The first slice of issue 14 builds the volcano and
// the geyser. The fissure, the aurora, and the storm wait for a later slice, so the pull and the
// patch do not know them yet.
export const GROUND_ACTIVITY = ['volcano', 'geyser'];

// The direction of the phenomenon of a world, or null. A world with no phenomenon, a kind the
// ground cannot draw yet, and a kind that stands in the sky and not on the ground all give null.
export function activityDir(world) {
  const act = world && world.activity;
  if (!act || !act.dir || !GROUND_ACTIVITY.includes(act.kind)) return null;
  return act.dir;
}

// The cell that holds that phenomenon, or null. activityHere() compares the landing cell against
// this cell: the patch shows the phenomenon when the two are the same, so a landing that reaches
// the cell without the pull shows it too, and one phenomenon can never stand in two patches.
// Issue 14.
export function activitySite(world) {
  const dir = activityDir(world);
  return dir ? snapSite(dirToSite({ x: dir[0], y: dir[1], z: dir[2] })) : null;
}

// ---------------------------------------------------------------- the carrier, issue 34
// Something on the world transmits. The instrument of the probe reads a bearing to that source,
// with an error and with no distance. Two landings give two wedges on the globe, and the source
// stands where the wedges cross.
//
// The frame of a bearing. North at a site is the part of the axis +y that lies in the tangent
// plane. East is the east of groundBasis() in ground-sky.js: a positive planet.rotation.y takes +x
// toward -z, lon counts from +x toward +z, so the surface runs toward falling lon and east is
// (sin lon, 0, -cos lon). Bearing 90 is then the east the globe holds, and a wedge that runs out
// on 90 runs east over the globe.
//
// cellTwist() above takes the same east, and patch() in generate.js builds the box of the ground as
// a right-handed set: x along the u axis of the cell and z against the v axis. The box was the
// mirror of that until 2026-09-19, with z along v; see "The box is right-handed" in docs/probe.md.
//
// The two frames still do two jobs here:
//
//   the globe    the three digits and the wedge of a fix keep the bearing above, because the
//                wedge is drawn on the globe
//   the ground   the needle keeps the frame of the box, because the reader walks the terrain and
//                the wreck of slice 3 stands on the terrain in the units of the box
//
// The box holds no mirror of the globe, so the sense of a bearing is the same in both. The box
// holds no angle all the same: its map stretches one way more than the other away from the middle
// of a face, so the needle comes from the slope of that map and not from the bearing less a twist.
// See carrierBox(). tools/carrier-check.mjs proves both jobs, and it fails when the box and the
// frame of groundBasis() stand as a mirror of each other.
// degrees: the error at the source and at the edge of the reach, straight in the arc between them.
//
// The first value was 3 to 25. Two far fixes then crossed over a quarter of a hemisphere, and the
// search took many landings. With 2 to 10 two far fixes cross over a region about 15 cells wide, a
// third fix from near that region closes it to a few cells, and the range of decision 7 does the
// rest. That is the three to five landings the plan asks for.
export const CARRIER_ERR = [2, 10];
export const CARRIER_RANGE = 6;       // cells of arc: the range states nothing further out

// radians: how far the carrier reaches. It is a third of the circumference, so the source stands
// silent over the far side of the world. A carrier every reader hears everywhere says the same
// thing on every cell: land anywhere, take a fix, land again. A reach turns the first landing into
// a real question, because a landing that hears nothing states a fact too: the source is more than
// a third of the way round from here. carrierAt() gives null past the reach, and the caller then
// shows no block, stores no fix, and draws no wedge.
export const CARRIER_REACH = 2 * Math.PI / 3;

const _up = new THREE.Vector3();
const _to = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _arr = [0, 0, 0];

// A direction argument as a vector. The worker writes a direction as three numbers in an array.
function asDir(dir, out = _to) {
  return Array.isArray(dir) ? out.set(dir[0], dir[1], dir[2]) : out.set(dir.x, dir.y, dir.z);
}

// A string to a number in 0 to 1. FNV-1a with an avalanche at the end. Every file that needs one
// keeps a copy; ground-sky.js holds another.
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The site of the source of a world, or null. A gas giant and a world where no vertex passed the
// tests of makeSource() both give null. See makeSource() in generate.js.
export function sourceSite(world) {
  const src = world && world.source;
  return src && src.dir ? snapSite(dirToSite({ x: src.dir[0], y: src.dir[1], z: src.dir[2] })) : null;
}

// True when the landing cell is the cell of the source. The rule is the cell and not the pull, as
// activityHere() has it, so one source can never stand in two patches. Slice 3 of issue 34 puts
// the wreck on the patch by this test.
export function sourceHere(world, site) {
  const at = sourceSite(world);
  if (!at || !site) return false;
  const here = snapSite(site);
  return here.lat === at.lat && here.lon === at.lon;
}

// ---------------------------------------------------------------- the patch message
// The phenomenon a landing at the site brings, or null. The rule is the cell and not the pull: a
// landing that reaches the cell of the phenomenon without the pull shows it too, and one
// phenomenon can never stand in two patches. The worker builds the patch as before when this gives
// null. Issue 14.
function activityHere(world, site) {
  const cell = activitySite(world);
  if (!cell) return null;
  const here = snapSite(site);
  return here.lat === cell.lat && here.lon === cell.lon ? { kind: world.activity.kind } : null;
}

// The source a landing at the site brings, or null, by the rule activityHere() holds. Issue 34,
// slice 3.
function sourceThere(world, site) {
  const src = world.source;
  return src && sourceHere(world, site) ? { kind: src.kind } : null;
}

// The options of a patch message: the row of a device tier, and the facts of the world at the
// site. app.js sends them, and the Node tools build the same ones, so a check measures the patch a
// reader gets. `tier` is a row of TIERS in tiers.js.
export function patchOpts(world, site, tier) {
  const ground = tier.ground;
  return {
    // the options of the world call, so the patch reads the world the reader looked at. See
    // contextFor() in generate.js.
    world: worldOpts(tier),
    grid: ground.grid, size: ground.size, span: cellSpan(world, site), rim: RIM,
    // the quad of the cube grid the box lands on. See "the cell grid" above.
    cell: siteCell(site),
    maxFlora: ground.maxFlora, maxFauna: ground.maxFauna, pulledKind: site.kind ?? -1,
    activity: activityHere(world, site),
    source: sourceThere(world, site),
  };
}

// The arc from a site to a direction, in radians on the globe of radius 1.
export function arcTo(site, dir) {
  const d = asDir(dir);
  return Math.acos(THREE.MathUtils.clamp(siteDir(site.lat, site.lon, _up).dot(d), -1, 1));
}

// The bearing from a site to a direction: the angle from north, 0 to 360 degrees, east positive.
// East and north stand in the tangent plane, so the two dots take the tangent part on their own.
export function bearingTo(site, dir) {
  const f = grid.tangentFrame(site.lat, site.lon);
  _east.fromArray(f.east);
  _south.fromArray(f.south);
  const d = asDir(dir);
  const e = d.dot(_east), n = -d.dot(_south);     // north is the opposite of south
  if (e === 0 && n === 0) return 0;               // the direction stands under the site or opposite it
  return (THREE.MathUtils.radToDeg(Math.atan2(e, n)) + 360) % 360;
}

// The carrier at one site: the bearing the instrument states, the error of that bearing, the arc
// to the source, and the range in kilometres when the site stands near it.
//
// The instrument does not state the true bearing. It states one inside the wedge, and the offset
// comes from a hash of the seed and the cell, so a fix is the same on every visit, two landings on
// one cell never disagree, and the true bearing always lies inside the wedge. The error runs from
// 2 degrees at the source to 10 degrees at the edge of the reach, straight in the arc: two far
// fixes cross wide, and the reader then decides between a third far fix and a near one. Decision 3
// of issue 34, with the reach of CARRIER_REACH over it.
//
// The site takes the snap first, because the fix belongs to the cell and not to two decimals of a
// degree. Gives null for a world with no source, and null for a site past the reach.
export function carrierAt(world, site) {
  const src = world && world.source;
  if (!src || !src.dir || !site) return null;
  const at = snapSite(site);
  const cell = siteCell(at);
  const arc = arcTo(at, src.dir);
  if (arc > CARRIER_REACH) return null;      // the carrier does not reach the far side of the world
  const err = CARRIER_ERR[0] + (CARRIER_ERR[1] - CARRIER_ERR[0]) * (arc / CARRIER_REACH);
  const off = hash01(`${world.seed}|carrier|${cell.face}|${cell.i}|${cell.j}`) * 2 - 1;
  const brg = (bearingTo(at, src.dir) + off * err + 360) % 360;
  // Decision 7: the range states nothing until the reader stands near the source.
  const rangeKm = arc <= CARRIER_RANGE * grid.CELL ? arc * radiusKm(world) : null;
  return { brg, err, arc, rangeKm };
}

// The direction the needle points at, in planet space: the direction of the source turned about
// the up axis of the site until it stands on the bearing carrierAt() states. The needle and the
// three digits then say one thing, and the needle gives the source away no better than the digits
// do. carrierBox() below reads this direction in the frame of the box, which is what the ground
// takes. boxPoint() reads it as a place on the box, which is what slice 3 takes.
//
// A turn of +a about the up axis takes east toward north, which takes the bearing down, so the
// offset turns the other way.
export function carrierDir(world, site, carrier, out = new THREE.Vector3()) {
  const src = world && world.source;
  if (!src || !src.dir || !carrier || !site) return null;
  const at = snapSite(site);
  const off = THREE.MathUtils.degToRad(carrier.brg - bearingTo(at, src.dir));
  out.set(src.dir[0], src.dir[1], src.dir[2]);
  return out.applyAxisAngle(siteDir(at.lat, at.lon, _up), -off);
}

// The point of the ground box of a landing at the site under a direction of the globe, in units of
// a box `size` units on a side, or null. The cell of the site carries the map; boxPoint() in
// cell-grid.js holds it, and it gives null for a direction more than 80 degrees from the face of the
// cell. Slice 3 takes the range to the wreck from this. The needle takes carrierBox() below, which
// holds at every arc.
export function boxPoint(site, dir, size) {
  if (!site) return null;
  const d = asDir(dir);
  _arr[0] = d.x; _arr[1] = d.y; _arr[2] = d.z;
  return grid.boxPoint(siteCell(snapSite(site)), _arr, size);
}

// The way the needle points, as a unit vector (x, z) in the frame of the box, or null when the
// source stands under the site or at its antipode.
//
// It is the step the box takes for a step of the globe toward the source: boxHeading() in
// cell-grid.js, the slope of boxPoint() at the site. The whole direction of carrierDir() goes in, at
// any arc, and the needle holds even where boxPoint() gives null. The needle may not come through
// the matrix of groundBasis() with the twist: that frame is square and the box is not, so the
// needle would stand off the wreck by the same angle.
export function carrierBox(world, site, carrier, out = { x: 0, z: 0 }) {
  if (!carrierDir(world, site, carrier, _aim)) return null;
  _arr[0] = _aim.x; _arr[1] = _aim.y; _arr[2] = _aim.z;
  return grid.boxHeading(siteCell(snapSite(site)), _arr, out);
}

// The pull to life. A creature home inside the cell under the pick takes the site. The nearest
// home wins. The site keeps the species id it was pulled to, or -1. The pull runs before the
// snap, so a home anywhere in the cell puts its species on the patch, and the snap then returns
// the site to the grid.
//
// The phenomenon of the world pulls too, and it wins over a home: the world holds many homes and
// at most one phenomenon, and the cell the pull lands on can still hold homes. Issue 14.
export function pullSite(site, current) {
  if (!site || !current) return site;
  const limit = grid.CELL * PULL_REACH;                              // globe units, the radius is 1
  const dir = siteDir(site.lat, site.lon, _local);
  // A home half a cell away can stand in the cell next door, and a pull there moved the landing off
  // the square under the pointer. So a pull stays inside the cell of the pick.
  const cell = grid.dirCell(dir.x, dir.y, dir.z);
  const inCell = (x, y, z) => { const c = grid.dirCell(x, y, z); return c.face === cell.face && c.i === cell.i && c.j === cell.j; };
  const act = activityDir(current.world);
  if (act) {
    const dx = act[0] - dir.x, dy = act[1] - dir.y, dz = act[2] - dir.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < limit && inCell(act[0], act[1], act[2])) return dirToSite(_dir.set(act[0], act[1], act[2]));
  }
  if (!current.homes || !current.homes.length) return site;
  const homes = current.homes;
  let best = -1, bestD = limit;
  for (let i = 0; i < homes.length; i += 4) {
    const dx = homes[i] - dir.x, dy = homes[i + 1] - dir.y, dz = homes[i + 2] - dir.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < bestD && inCell(homes[i], homes[i + 1], homes[i + 2])) { bestD = d; best = i; }
  }
  if (best < 0) return site;
  return dirToSite(_dir.set(homes[best], homes[best + 1], homes[best + 2]), homes[best + 3]);
}

// The home direction of every creature, four floats each: x y z kind. The worker gives the home
// position of each creature in the fauna array, nine floats each.
export function faunaHomes(fauna, count) {
  if (!fauna || !count) return new Float32Array(0);
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const o = i * 9;
    const x = fauna[o], y = fauna[o + 1], z = fauna[o + 2];
    const len = Math.hypot(x, y, z) || 1;
    out[i * 4] = x / len; out[i * 4 + 1] = y / len; out[i * 4 + 2] = z / len;
    out[i * 4 + 3] = fauna[o + 7];
  }
  return out;
}

// ---------------------------------------------------------------- the URL
// The hash carries the whole view, so a shared link opens the same ground from the same camera.
// Four forms:
//
//   #Seed                          orbit, the camera where a new world puts it
//   #Seed/lat,lon,dist             orbit, the camera over that point of the globe, dist radii out
//   #Seed@lat,lon                  the probe is down on that site, the camera where the dive puts it
//   #Seed@lat,lon/x,z,dist,az,pol  the probe is down, and the ground camera stands at that offset
//
// The site is a lat and a lon in degrees. The orbit camera is the point of the globe under it, in
// the same frame as a site, and its distance in globe radii. The ground camera is the target x and
// z metres from the site, then the distance in metres, the azimuth, and the polar angle of the
// camera from that target, both angles in degrees. The seed is URL-encoded, so a seed holds no
// bare @ and no bare /, and every number is plain. The view object keeps the two angles in
// radians, because the ground camera works in radians.
export function parseUrl(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (!h) return { seed: '', site: null, view: null };
  const s = h.indexOf('/');
  const head = s < 0 ? h : h.slice(0, s);
  const cam = s < 0 ? '' : h.slice(s + 1);
  const i = head.lastIndexOf('@');
  const site = i < 1 ? null : parseSite(head.slice(i + 1));
  if (!site) return { seed: decodeURIComponent(head), site: null, view: parseOrbitView(cam) };
  return { seed: decodeURIComponent(head.slice(0, i)), site, view: parseGroundView(cam) };
}

export function viewToUrl(seed, site, view) {
  const base = '#' + encodeURIComponent(seed);
  if (!site) {
    if (!view || view.kind !== 'orbit') return base;
    return `${base}/${view.lat.toFixed(2)},${view.lon.toFixed(2)},${view.dist.toFixed(3)}`;
  }
  const at = `${base}@${site.lat.toFixed(2)},${site.lon.toFixed(2)}`;
  if (!view || view.kind !== 'ground') return at;
  const deg = (r) => THREE.MathUtils.radToDeg(r).toFixed(2);
  return `${at}/${view.x.toFixed(1)},${view.z.toFixed(1)},${view.dist.toFixed(1)},${deg(view.az)},${deg(view.pol)}`;
}

// The numbers of one field, or null when the field does not hold exactly n of them.
function parseNums(text, n) {
  const parts = (text || '').split(',');
  if (parts.length !== n) return null;
  const out = parts.map(Number);
  return out.every((v) => Number.isFinite(v)) ? out : null;
}

function parseSite(text) {
  const v = parseNums(text, 2);
  if (!v || v[0] < -90 || v[0] > 90 || v[1] < -180 || v[1] > 180) return null;
  return { lat: round2(v[0]), lon: round2(v[1]), kind: -1 };
}

function parseOrbitView(text) {
  const v = parseNums(text, 3);
  if (!v || v[0] < -90 || v[0] > 90 || v[1] < -180 || v[1] > 180 || !(v[2] > 0)) return null;
  return { kind: 'orbit', lat: round2(v[0]), lon: round2(v[1]), dist: v[2] };
}

function parseGroundView(text) {
  const v = parseNums(text, 5);
  if (!v || !(v[2] > 0) || v[4] < 0 || v[4] > 180) return null;
  return {
    kind: 'ground', x: v[0], z: v[1], dist: v[2],
    az: THREE.MathUtils.degToRad(v[3]), pol: THREE.MathUtils.degToRad(v[4]),
  };
}

// ---------------------------------------------------------------- the marker
// The square of the cell the probe would land on is paint on the terrain, as the wedges are. See
// showMarker() in carrier-globe.js. A square of geometry draped on the height map stood a cell or
// more off the paint at a low camera, because the map is smoother than the facets.
