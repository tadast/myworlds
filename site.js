// myworlds — the landing site: the pick under the pointer, the pull to life, the carrier, and the
// URL. The square marker of the cell is paint in the shaders; see showMarker() in carrier-globe.js.
//
// A site is a lat and a lon in degrees in the planet's local frame, the frame of the worker's
// arrays before planet.rotation.y turns them. Lat is asin(y). Lon is atan2(z, x). Two decimals.
import * as THREE from 'three';
import * as grid from './cell-grid.js';
import * as C from './carrier.js';
import { snapSite } from './carrier.js';

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

// The cell a site falls in. The patch call finds the same cell, gives it back as patch.cell, and
// lays its box on the quad.
export function siteCell(site) {
  return grid.siteCell(site.lat, site.lon);
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

// The site at the middle of the cell that holds a site. See snapSite() in carrier.js.
export { snapSite };

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

// True when the ground hides `point` from `eye`: the line of sight between them dips under the
// sphere of radius `ground` about the centre of the planet. All three are in one frame. Give the
// ground under the point, and not the height of the point: a flyer over the horizon stands against
// the sky. When `ground` is the length of `point`, this is the test of the tangent plane at it.
// See tools/pick-check.mjs.
const _ld = new THREE.Vector3(), _lc = new THREE.Vector3();
export function groundHides(eye, point, ground) {
  _ld.copy(point).sub(eye);
  const t = THREE.MathUtils.clamp(-eye.dot(_ld) / _ld.lengthSq(), 0, 1);
  // The line must dip a hair under the ground. A point on the ground has `ground` at its own
  // length, and without the margin the rounding of the two squares alone would hide it.
  return _lc.copy(eye).addScaledVector(_ld, t).lengthSq() < ground * ground * (1 - 1e-9);
}

// A unit direction in planet space from a site. See siteDir() in cell-grid.js.
const _siteArr = [0, 0, 0];
export function siteDir(lat, lon, out = new THREE.Vector3()) {
  return out.fromArray(grid.siteDir(lat, lon, _siteArr));
}

// The site under a unit direction in planet space. See dirSite() in cell-grid.js.
export function dirToSite(dir, kind = -1) {
  const at = grid.dirSite(dir.x, dir.y, dir.z);
  return { lat: at.lat, lon: at.lon, kind };
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
// the geyser. The fissure, the aurora, and the storm wait for a later slice, so the pull does not
// know them yet. patchActivity() in generate.js keeps the same two kinds.
export const GROUND_ACTIVITY = ['volcano', 'geyser'];

// The direction of the phenomenon of a world, or null. A world with no phenomenon, a kind the
// ground cannot draw yet, and a kind that stands in the sky and not on the ground all give null.
export function activityDir(world) {
  const act = world && world.activity;
  if (!act || !act.dir || !GROUND_ACTIVITY.includes(act.kind)) return null;
  return act.dir;
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
// The numbers of the carrier live in carrier.js, which holds no three.js, so chapters.js, the
// Node checks, and generate.js read the same calls. This file gives them to the page. carrierDir()
// alone comes back as a THREE.Vector3 here, because the page turns it with the vectors of three.js.
export {
  CARRIER_ERR, CARRIER_RANGE, CARRIER_REACH, sourceSite, arcTo, bearingTo, carrierAt, boxPoint, carrierBox,
} from './carrier.js';

// `src` stands last, after `out`, so every call of issue 34 keeps its arguments where they are.
const _aim = [0, 0, 0];
export function carrierDir(world, site, carrier, out = new THREE.Vector3(), src = world && world.source) {
  return C.carrierDir(world, site, carrier, _aim, src) ? out.fromArray(_aim) : null;
}

// The distress band of the wreck. See carrier.js; the progress of the chapters lives in chapters.js.
export { WRECK_FREQ } from './carrier.js';

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
