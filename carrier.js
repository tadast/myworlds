// myworlds — the carrier as numbers: what the receiver of the probe reads at a site. Issue 34 and
// p2-38.
//
// This file holds no three.js and no DOM, so chapters.js, the Node checks, and generate.js can
// import it. A direction is an array of three numbers, as the worker writes it, or an object with
// x, y, and z, as THREE.Vector3 is. A result is an array or a plain object. site.js re-exports every
// call for the page, and it gives carrierDir() back as a THREE.Vector3.
//
// The arithmetic is the arithmetic of THREE.Vector3 step for step, in the same order, so the page
// reads the same bearings as it did when site.js held these calls.
//
// Bearings. A bearing is the angle from north, 0 to 360 degrees, east positive, in the frame of
// tangentFrame() in cell-grid.js: east is (sin lon, 0, -cos lon), the direction of falling lon,
// and north is the part of +y in the tangent plane. The wedge on the globe keeps this bearing. The
// needle of the overlay keeps the frame of the box instead, because the reader walks the terrain:
// see carrierBox(). tools/carrier-check.mjs proves both jobs, and it fails when the box and the
// frame of groundBasis() stand as a mirror of each other.
import * as grid from './cell-grid.js';

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

// The distress band of the wreck, as the overlay prints it with no unit. The overlay shows it for
// the whole search for the wreck, so the reader learns the look of a frequency before a log states
// one. Decision 7 of p2-00. Every later source sends on the band of its own `freq`.
export const WRECK_FREQ = '406.025';

// The band a source sends on, with no unit: its own `freq`, or the distress band of the wreck.
export function sourceFreq(src) {
  return src && src.kind !== 'wreck' && src.freq ? src.freq : WRECK_FREQ;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A direction argument as three numbers.
const _d = [0, 0, 0];
function asDir(dir, out = _d) {
  if (Array.isArray(dir)) { out[0] = dir[0]; out[1] = dir[1]; out[2] = dir[2]; }
  else { out[0] = dir.x; out[1] = dir.y; out[2] = dir.z; }
  return out;
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

// The site at the middle of the cell that holds a site. The URL keeps a lat and a lon, so the
// middle of the cell carries the cell. See cellSite() in cell-grid.js. The site keeps its kind.
export function snapSite(site) {
  if (!site) return site;
  const at = grid.cellSite(grid.siteCell(site.lat, site.lon));
  return { lat: at.lat, lon: at.lon, kind: site.kind === undefined ? -1 : site.kind };
}

// The site of a source, or null: the middle of the cell its direction falls in. `src` is the wreck
// when the caller gives none. A gas giant and a world where no vertex passed the tests of
// makeSource() both give null. The patch call puts the source on the patch of this cell and of no
// other; see kindIn() in generate.js.
export function sourceSite(world, src = world && world.source) {
  if (!src || !src.dir) return null;
  const at = grid.cellSite(grid.dirCell(src.dir[0], src.dir[1], src.dir[2]));
  return { lat: at.lat, lon: at.lon, kind: -1 };
}

// The arc from a site to a direction, in radians on the globe of radius 1.
const _up = [0, 0, 0];
export function arcTo(site, dir) {
  const u = grid.siteDir(site.lat, site.lon, _up);
  const d = asDir(dir);
  return Math.acos(clamp(u[0] * d[0] + u[1] * d[1] + u[2] * d[2], -1, 1));
}

// The bearing from a site to a direction: the angle from north, 0 to 360 degrees, east positive.
// East and north stand in the tangent plane, so the two dots take the tangent part on their own.
export function bearingTo(site, dir) {
  const f = grid.tangentFrame(site.lat, site.lon);
  const d = asDir(dir);
  const e = d[0] * f.east[0] + d[1] * f.east[1] + d[2] * f.east[2];
  const n = -(d[0] * f.south[0] + d[1] * f.south[1] + d[2] * f.south[2]);   // north is the opposite of south
  if (e === 0 && n === 0) return 0;               // the direction stands under the site or opposite it
  return (Math.atan2(e, n) * RAD2DEG + 360) % 360;
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
//
// `src` is the source the receiver hears, and the wreck when the caller gives none. The hash of the
// offset takes the kind of every source but the wreck, so each later source reads offsets of its
// own on each cell. The wreck keeps the key of issue 34, so no fix of the search for the wreck
// moves. p2-38.
export function carrierAt(world, site, src = world && world.source) {
  if (!src || !src.dir || !site) return null;
  const at = snapSite(site);
  const cell = grid.siteCell(at.lat, at.lon);
  const arc = arcTo(at, src.dir);
  if (arc > CARRIER_REACH) return null;      // the carrier does not reach the far side of the world
  const err = CARRIER_ERR[0] + (CARRIER_ERR[1] - CARRIER_ERR[0]) * (arc / CARRIER_REACH);
  const kind = src.kind && src.kind !== 'wreck' ? `|${src.kind}` : '';
  const off = hash01(`${world.seed}|carrier${kind}|${cell.face}|${cell.i}|${cell.j}`) * 2 - 1;
  const brg = (bearingTo(at, src.dir) + off * err + 360) % 360;
  // Decision 7: the range states nothing until the reader stands near the source.
  const rangeKm = arc <= CARRIER_RANGE * grid.CELL ? arc * world.env.radiusKm : null;
  return { brg, err, arc, rangeKm };
}

// The direction the needle points at, in planet space, as three numbers: the direction of the
// source turned about the up axis of the site until it stands on the bearing carrierAt() states.
// The needle and the three digits then say one thing, and the needle gives the source away no
// better than the digits do. carrierBox() below reads this direction in the frame of the box, which
// is what the ground takes. boxPoint() reads it as a place on the box.
//
// A turn of +a about the up axis takes east toward north, which takes the bearing down, so the
// offset turns the other way. The turn is the quaternion turn of THREE.Vector3.applyAxisAngle().
export function carrierDir(world, site, carrier, out = [0, 0, 0], src = world && world.source) {
  if (!src || !src.dir || !carrier || !site) return null;
  const at = snapSite(site);
  const angle = -((carrier.brg - bearingTo(at, src.dir)) * DEG2RAD);
  const axis = grid.siteDir(at.lat, at.lon, _up);
  const half = angle / 2, s = Math.sin(half);
  const qx = axis[0] * s, qy = axis[1] * s, qz = axis[2] * s, qw = Math.cos(half);
  const vx = src.dir[0], vy = src.dir[1], vz = src.dir[2];
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[0] = vx + qw * tx + qy * tz - qz * ty;
  out[1] = vy + qw * ty + qz * tx - qx * tz;
  out[2] = vz + qw * tz + qx * ty - qy * tx;
  return out;
}

// The point of the ground box of a landing at the site under a direction of the globe, in units of
// a box `size` units on a side, or null. The cell of the site carries the map; boxPoint() in
// cell-grid.js holds it, and it gives null for a direction more than 80 degrees from the face of the
// cell. The range to the source takes this. The needle takes carrierBox() below, which holds at
// every arc.
const _box = [0, 0, 0];
export function boxPoint(site, dir, size) {
  if (!site) return null;
  const at = snapSite(site);
  return grid.boxPoint(grid.siteCell(at.lat, at.lon), asDir(dir, _box), size);
}

// The way the needle points, as a unit vector (x, z) in the frame of the box, or null when the
// source stands under the site or at its antipode.
//
// It is the step the box takes for a step of the globe toward the source: boxHeading() in
// cell-grid.js, the slope of boxPoint() at the site. The whole direction of carrierDir() goes in, at
// any arc, and the needle holds even where boxPoint() gives null. The needle may not come through
// the matrix of groundBasis() with the twist: that frame is square and the box is not, so the
// needle would stand off the source by the same angle.
const _aim = [0, 0, 0];
export function carrierBox(world, site, carrier, out = { x: 0, z: 0 }, src = world && world.source) {
  if (!carrierDir(world, site, carrier, _aim, src)) return null;
  const at = snapSite(site);
  return grid.boxHeading(grid.siteCell(at.lat, at.lon), _aim, out);
}
