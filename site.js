// myworlds — the landing site: the pick under the pointer, the pull to life, the marker, and the URL.
//
// A site is a lat and a lon in degrees in the planet's local frame, the frame of the worker's
// arrays before planet.rotation.y turns them. Lat is asin(y). Lon is atan2(z, x). Two decimals.
import * as THREE from 'three';

export const PATCH_SIZE = 1500;      // units, the side of the ground box a patch draws into
export const PULL_REACH = 0.5;       // parts of a cell: how far the pull to life looks

// The patch cell. The reader picks a square of the globe and the whole square becomes the
// ground. CELL is the arc of that square in globe units, so it is the same size on the screen
// for every planet: about 62 px at the closest zoom, which the reader can see and aim at.
// A finer square would be false precision. The globe draws its surface from an icosphere at
// detail 100, which puts about 0.011 units between two vertices, so a square under CELL would
// sit inside one facet and the coast the reader aims at would not be where the field puts it.
//
// The cell is far wider than the box it draws into, so the ground holds an artificial scale.
// worker.js gives the two numbers back as patch.metresAcross and patch.metresUp. A plant and a
// creature keep their lore size in units, so they read as normal against the ground and they are
// no longer the metres the lore text says.
//
// CELL is the nominal arc: the cell grid below divides a face of a cube into whole cells, so a
// true cell stands a little under it.
export const CELL = 0.01;

// ---------------------------------------------------------------- the cell grid, issue 30
// A cell is a quad of a cube grid and no longer a square of a band of latitude. A band grid
// changes its step of longitude at every band, so two cells in two bands do not share an edge,
// and their two patches could never be stitched. A cube grid tiles the whole globe with quads
// that share their edges exactly, and it holds no pole.
//
// Each face carries FACE_CELLS by FACE_CELLS cells. The grid coordinate w runs -1 to 1 across a
// face, and the gnomonic coordinate of the cube is tan(w * PI / 4). The tangent holds the arc of
// a cell nearly equal from the middle of a face to its corner; a plain gnomonic grid would leave
// a corner cell at about half the arc of a middle one. A coordinate past the face is legal and
// the map stays true there, which is what the rim of a patch needs.
//
// worker.js holds the same map, because a Web Worker cannot import a module. Keep the two in step.
// Each row is the face normal, then the u axis, then the v axis, and u cross v is the normal.
const FACES = [
  [1, 0, 0, 0, 0, -1, 0, 1, 0],
  [-1, 0, 0, 0, 0, 1, 0, 1, 0],
  [0, 1, 0, 1, 0, 0, 0, 0, -1],
  [0, -1, 0, 1, 0, 0, 0, 0, 1],
  [0, 0, 1, 1, 0, 0, 0, 1, 0],
  [0, 0, -1, -1, 0, 0, 0, 1, 0],
];
// The arc of a face is PI / 2, so this many cells hold the arc of CELL each. The reader sees the
// same square at the same size on every planet, which is what issue 19 asked for.
export const FACE_CELLS = Math.round(Math.PI / 2 / CELL);

// The unit direction at (u, v) inside a cell. u and v run 0 to 1 across the cell and may run
// past it.
export function cellDir(cell, u, v, out = new THREE.Vector3()) {
  const F = FACES[cell.face];
  const a = Math.tan(((cell.i + u) * 2 / cell.n - 1) * Math.PI / 4);
  const b = Math.tan(((cell.j + v) * 2 / cell.n - 1) * Math.PI / 4);
  return out.set(
    F[0] + F[3] * a + F[6] * b,
    F[1] + F[4] * a + F[7] * b,
    F[2] + F[5] * a + F[8] * b,
  ).normalize();
}

// The cell a unit direction falls in.
export function dirCell(x, y, z) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  const face = ax >= ay && ax >= az ? (x >= 0 ? 0 : 1) : ay >= az ? (y >= 0 ? 2 : 3) : (z >= 0 ? 4 : 5);
  const F = FACES[face];
  const d = x * F[0] + y * F[1] + z * F[2];
  const wa = Math.atan((x * F[3] + y * F[4] + z * F[5]) / d) * 4 / Math.PI;
  const wb = Math.atan((x * F[6] + y * F[7] + z * F[8]) / d) * 4 / Math.PI;
  const n = FACE_CELLS;
  const q = (w) => THREE.MathUtils.clamp(Math.floor((w + 1) * 0.5 * n), 0, n - 1);
  return { face, i: q(wa), j: q(wb), n };
}

// The cell a site falls in. The worker takes it as patch.cell and lays its box on the quad.
export function siteCell(site) {
  const d = siteDir(site.lat, site.lon, _local);
  return dirCell(d.x, d.y, d.z);
}

// The turn from the frame of the site, x east and z south, to the frame of the box. The box of
// the patch runs x along the u axis of the cell and z against the v axis, so the sky must take the
// same turn or the sun stands in the wrong quarter of it. See groundBasis() in ground-sky.js.
//
// East is the east of groundBasis(): the direction of falling lon. The turn is the angle of the u
// axis from east toward south, which is the turn groundBasis() makes. patch() in worker.js builds
// a right-handed box, so one turn about the up axis brings the two frames together and the sky
// holds no mirror of the terrain.
export function cellTwist(site) {
  const cell = siteCell(site);
  const mid = cellDir(cell, 0.5, 0.5, _corner);
  const along = cellDir(cell, 1, 0.5, _dir).sub(mid);      // the u axis of the cell, at the middle
  const la = THREE.MathUtils.degToRad(site.lat), lo = THREE.MathUtils.degToRad(site.lon);
  const cla = Math.cos(la), sla = Math.sin(la), clo = Math.cos(lo), slo = Math.sin(lo);
  _east.set(slo, 0, -clo);
  _north.set(-sla * clo, cla, -sla * slo);
  return Math.atan2(-along.dot(_north), along.dot(_east));  // south is the opposite of north
}

const CENTRE = new THREE.Vector2(0, 0);
const _ray = new THREE.Raycaster();
const _centre = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _local = new THREE.Vector3();
const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
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
  if (!site) return CELL * radiusKm(world) * 1000;
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
  _dir.copy(_hit).sub(_centre).normalize();
  return { local: _local.clone(), world: _dir.clone() };
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

// The cell that holds that phenomenon, or null. app.js compares the landing cell against this
// cell: the patch shows the phenomenon when the two are the same, so a landing that reaches the
// cell without the pull shows it too, and one phenomenon can never stand in two patches. Issue 14.
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
// The east of cellTwist() above is the opposite vector, and patch() in worker.js builds the box of
// the ground in that same set. The box runs x along the u axis of the cell and z along the v axis,
// and (u, up, v) is left-handed, so the terrain is the mirror of the frame above. Do not read an
// east out of cellTwist() and do not change it, patch(), or the sky.
//
// So the two frames do two jobs here:
//
//   the globe    the three digits and the wedge of a fix keep the bearing above, because the
//                wedge is drawn on the globe and the globe holds no mirror
//   the ground   the needle keeps the frame of the box, because the reader walks the terrain and
//                the wreck of slice 3 stands on the terrain in the units of the box
//
// The sky stands in the frame of groundBasis() and the terrain in the mirror of it. That is an
// older defect and issue 34 does not touch it. tools/carrier-check.mjs proves both jobs and prints
// the mirror as a note.
export const CARRIER_ERR = [3, 25];   // degrees: the error at the source and at its antipode
export const CARRIER_RANGE = 6;       // cells of arc: the range states nothing further out

const _up = new THREE.Vector3();
const _to = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _mid = new THREE.Vector3();
// A direction this far off the face of its cell has no point on the box: the gnomonic map of the
// cube grid runs to infinity at a quarter turn from the face. See boxPoint().
const BOX_FACE_MIN = Math.cos(80 * Math.PI / 180);

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
// tests of makeSource() both give null. See makeSource() in worker.js.
export function sourceSite(world) {
  const src = world && world.source;
  return src && src.dir ? snapSite(dirToSite({ x: src.dir[0], y: src.dir[1], z: src.dir[2] })) : null;
}

// True when the landing cell is the cell of the source. The rule is the cell and not the pull, as
// activityHere() has it in app.js, so one source can never stand in two patches. Slice 3 of issue
// 34 puts the wreck on the patch by this test.
export function sourceHere(world, site) {
  const at = sourceSite(world);
  if (!at || !site) return false;
  const here = snapSite(site);
  return here.lat === at.lat && here.lon === at.lon;
}

// The arc from a site to a direction, in radians on the globe of radius 1.
export function arcTo(site, dir) {
  const d = asDir(dir);
  return Math.acos(THREE.MathUtils.clamp(siteDir(site.lat, site.lon, _up).dot(d), -1, 1));
}

// The bearing from a site to a direction: the angle from north, 0 to 360 degrees, east positive.
// East and north stand in the tangent plane, so the two dots take the tangent part on their own.
export function bearingTo(site, dir) {
  const la = THREE.MathUtils.degToRad(site.lat), lo = THREE.MathUtils.degToRad(site.lon);
  const cla = Math.cos(la), sla = Math.sin(la), clo = Math.cos(lo), slo = Math.sin(lo);
  _east.set(slo, 0, -clo);                        // the east of groundBasis(): falling lon
  _north.set(-sla * clo, cla, -sla * slo);        // the part of +y in the tangent plane
  const d = asDir(dir);
  const e = d.dot(_east), n = d.dot(_north);
  if (e === 0 && n === 0) return 0;               // the direction stands under the site or opposite it
  return (THREE.MathUtils.radToDeg(Math.atan2(e, n)) + 360) % 360;
}

// The carrier at one site: the bearing the instrument states, the error of that bearing, the arc
// to the source, and the range in kilometres when the site stands near it.
//
// The instrument does not state the true bearing. It states one inside the wedge, and the offset
// comes from a hash of the seed and the cell, so a fix is the same on every visit, two landings on
// one cell never disagree, and the true bearing always lies inside the wedge. The error runs from
// 3 degrees at the source to 25 degrees at its antipode, straight in the arc: two far fixes cross
// wide, and the reader then decides between a third far fix and a near one. Decision 3 of issue 34.
//
// The site takes the snap first, because the fix belongs to the cell and not to two decimals of a
// degree. Gives null for a world with no source.
export function carrierAt(world, site) {
  const src = world && world.source;
  if (!src || !src.dir || !site) return null;
  const at = snapSite(site);
  const cell = siteCell(at);
  const arc = arcTo(at, src.dir);
  const err = CARRIER_ERR[0] + (CARRIER_ERR[1] - CARRIER_ERR[0]) * (arc / Math.PI);
  const off = hash01(`${world.seed}|carrier|${cell.face}|${cell.i}|${cell.j}`) * 2 - 1;
  const brg = (bearingTo(at, src.dir) + off * err + 360) % 360;
  // Decision 7: the range states nothing until the reader stands near the source.
  const rangeKm = arc <= CARRIER_RANGE * CELL ? arc * radiusKm(world) : null;
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

// The point of the ground box under a direction of the globe, in units of the box, or null.
//
// It is the exact inverse of the map patch() in worker.js builds the box with: that function reads
// the two gnomonic coordinates of the cell at a point of the box and takes the direction, and this
// reads the two coordinates of a direction and takes the point. So a direction inside the cell
// comes back as the place on the ground the reader can walk to. The cell of the site carries the
// map, and a direction outside that cell is legal: the gnomonic map stays true past the edge of a
// face, which is what the rim of a patch already needs.
//
// Gives null for a direction more than 80 degrees from the face of the cell. The map runs to
// infinity at a quarter turn from the face, and the far side of the globe has no point on the box.
// Slice 3 takes the range to the wreck from this. The needle takes carrierBox() below, which holds
// at every arc.
export function boxPoint(site, dir, size = PATCH_SIZE) {
  if (!site) return null;
  const cell = siteCell(snapSite(site));
  const F = FACES[cell.face];
  const d = asDir(dir);
  const n = d.x * F[0] + d.y * F[1] + d.z * F[2];
  if (n <= BOX_FACE_MIN) return null;
  const a = (d.x * F[3] + d.y * F[4] + d.z * F[5]) / n;
  const b = (d.x * F[6] + d.y * F[7] + d.z * F[8]) / n;
  const u = (Math.atan(a) * 4 / Math.PI + 1) * 0.5 * cell.n - cell.i;
  const v = (Math.atan(b) * 4 / Math.PI + 1) * 0.5 * cell.n - cell.j;
  return { x: (u - 0.5) * size, z: (v - 0.5) * size };
}

// The way the needle points, as a unit vector (x, z) in the frame of the box, or null.
//
// It is the step the box takes for a step of the globe toward the source: the slope of boxPoint()
// at the site. A plain projection on two axes of the cell will not do, because the map of the box
// holds no angle. It is a gnomonic map of a face of the cube with a tangent over it, and both
// stretch one way more than the other away from the middle of the face. Measured on the six faces,
// a projection stood up to 22 degrees off the true way.
//
// The slope, for a step from the site along a tangent t:
//
//   n = d . N, a = (d . U) / n, b = (d . V) / n      the gnomonic coordinates of boxPoint()
//   x runs with atan(a), so dx/da is 1 / (1 + a * a), and z runs the same way with b
//   da for a step t is ((t . U) - a * (t . N)) / n, and db is ((t . V) - b * (t . N)) / n
//
// Every factor the two share falls out when the pair is made a unit vector, and the part of the
// direction that stands along the site falls out on its own: it gives da and db of nothing. So the
// whole direction of carrierDir() goes in, at any arc, and the needle holds even where boxPoint()
// gives null. The box is the mirror of the frame of groundBasis(), so the needle may not come
// through that matrix: it would point at the mirror of the source and away from the wreck.
export function carrierBox(world, site, carrier, out = { x: 0, z: 0 }) {
  if (!carrierDir(world, site, carrier, _aim)) return null;
  const cell = siteCell(snapSite(site));
  const F = FACES[cell.face];
  cellDir(cell, 0.5, 0.5, _mid);
  const n = _mid.x * F[0] + _mid.y * F[1] + _mid.z * F[2];
  const a = (_mid.x * F[3] + _mid.y * F[4] + _mid.z * F[5]) / n;
  const b = (_mid.x * F[6] + _mid.y * F[7] + _mid.z * F[8]) / n;
  const vn = _aim.x * F[0] + _aim.y * F[1] + _aim.z * F[2];
  const x = (_aim.x * F[3] + _aim.y * F[4] + _aim.z * F[5] - a * vn) / (1 + a * a);
  const z = (_aim.x * F[6] + _aim.y * F[7] + _aim.z * F[8] - b * vn) / (1 + b * b);
  const l = Math.hypot(x, z);
  if (l < 1e-12) return null;     // the source stands under the site or at its antipode
  out.x = x / l; out.z = z / l;
  return out;
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
  const limit = CELL * PULL_REACH;                              // globe units, the radius is 1
  const dir = siteDir(site.lat, site.lon, _local);
  const act = activityDir(current.world);
  if (act) {
    const dx = act[0] - dir.x, dy = act[1] - dir.y, dz = act[2] - dir.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < limit) return dirToSite(_dir.set(act[0], act[1], act[2]));
  }
  if (!current.homes || !current.homes.length) return site;
  const homes = current.homes;
  let best = -1, bestD = limit;
  for (let i = 0; i < homes.length; i += 4) {
    const dx = homes[i] - dir.x, dy = homes[i + 1] - dir.y, dz = homes[i + 2] - dir.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < bestD) { bestD = d; best = i; }
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
// The square of the cell the probe would land on. It is the true footprint of the patch, not a
// symbol: what the square holds is what the ground shows. Each vertex sits at the ground radius
// under it, so the square follows the relief instead of floating over a hill.
//
// Each side carries MARK_SEGS steps, so the outline holds 32 outer and 32 inner vertices. Four
// corners alone gave four long chords, and a ridge inside the cell cut through the middle of a
// side. The height map holds one texel every 0.016 units of arc and a cell is 0.01 units across,
// so eight steps read every value the map holds along a side.
//
// Two meshes share the one geometry. The ghost pass draws first with depthTest off at a low
// opacity, so the outline still reads where a ridge stands in front of it, and the solid pass
// draws after it with depthTest on, so the square reads as a thing on the ground. The far side of
// the globe never shows the ghost, because the marker follows the pointer: pickSite() takes the
// near hit of the ray, and the pull stays inside the cell, so the square always stands on the half
// of the globe that faces the camera.
const RING_IN = 0.9;                 // the inner edge of the outline, as a part of the cell
const MARK_SEGS = 8;                 // steps along one side of the square
// globe units the outline floats, so it clears the facets of the globe.
//
// The square drapes on the height map, and the terrain draws from an icosphere. The two do not
// agree: the map holds 384 by 192 texels, which is 0.016 units of arc, and a facet of the globe is
// 0.013 units across, so the mesh carries detail the map has already smoothed away. A facet is also
// a flat chord under a curve. Both together let a facet stand over the map at its own middle, and
// the outline then sinks into the ground.
//
// Measured on five worlds, 184,320 facets each, as the radius of a facet at its middle less the map
// under it:
//
//   world      p99      p99.9    worst
//   Auralis    0.0012   0.0024   0.0049
//   Vesper     0.0008   0.0027   0.0188
//   Meridian   0.0033   0.0069   0.0165
//   Tessaly    0.0036   0.0063   0.0140
//   Orin       0.0040   0.0076   0.0350
//
// 0.006 clears about 999 facets in every 1,000 on the worst world, and it holds the everyday
// mountain off the outline. The old 0.0008 cleared about 98 in 100, which is the defect. A lift
// that cleared the last peak of a lava world would have to stand at 0.035, far over the 0.011 units
// the flora of the globe stands, and the square would then float over a forest. The ghost pass
// takes those last facets instead: the outline reads through a ridge at a low opacity.
const LIFT = 0.006;
// the four corners of the cell, in the order they go round it
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

let marker = null;

function makeMarker() {
  const n = MARK_SEGS * 4;           // vertices round one ring of the outline
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  // two triangles per step: the outer point, the next outer point, and the two inner ones
  const idx = [];
  for (let i = 0; i < n; i++) {
    const a = i, b = (i + 1) % n, c = n + b, d = n + i;
    idx.push(a, b, c, a, c, d);
  }
  geo.setIndex(idx);
  const group = new THREE.Group();
  group.name = 'site-marker';
  // the ghost first, then the solid, so the solid stands over it where the ground faces the camera
  for (const pass of [
    { opacity: 0.25, depthTest: false, order: 3 },
    { opacity: 0.9, depthTest: true, order: 4 },
  ]) {
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: pass.opacity,
      side: THREE.DoubleSide, depthWrite: false, depthTest: pass.depthTest,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = pass.order;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  group.userData.geo = geo;
  return group;
}

// Show the square of the cell on the planet. A null site takes it off the scene. It gives the
// group of the two passes back; no caller in app.js reads it today.
export function showMarker(site, current) {
  if (!site || !current) {
    if (marker && marker.parent) marker.parent.remove(marker);
    return marker;
  }
  if (!marker) marker = makeMarker();
  if (marker.parent !== current.planet) {
    if (marker.parent) marker.parent.remove(marker);
    current.planet.add(marker);
  }
  const pal = current.world.palette;
  for (const m of marker.children) m.material.color.set(pal.fauna?.accent || '#ffffff');

  // The corners come from the cell of the cube grid, so the square the reader aims at is the quad
  // the patch draws and it shares its edges with the cell next door. Each side then walks from one
  // corner to the next in MARK_SEGS steps.
  const cell = siteCell(site);
  const sea = current.world.seaRadius || 0;
  const pos = marker.userData.geo.attributes.position;
  const n = MARK_SEGS * 4;
  for (let ring = 0; ring < 2; ring++) {
    const w = ring === 0 ? 0.5 : 0.5 * RING_IN;
    for (let c = 0; c < 4; c++) {
      const from = CORNERS[c], to = CORNERS[(c + 1) % 4];
      for (let k = 0; k < MARK_SEGS; k++) {
        const f = k / MARK_SEGS;
        const u = from[0] + (to[0] - from[0]) * f, v = from[1] + (to[1] - from[1]) * f;
        cellDir(cell, 0.5 + u * w, 0.5 + v * w, _corner);
        const r = Math.max(groundRadius(current.world, current.heightMap, _corner), sea) + LIFT;
        pos.setXYZ(ring * n + c * MARK_SEGS + k, _corner.x * r, _corner.y * r, _corner.z * r);
      }
    }
  }
  pos.needsUpdate = true;
  marker.position.set(0, 0, 0);
  marker.quaternion.identity();
  return marker;
}
