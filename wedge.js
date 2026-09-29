// myworlds — the wedge and the cell as numbers: the arithmetic of the paint of the carrier on the
// globe. Issue 34, slice 2.
//
// This file holds no three.js and no DOM, so chapters.js and the Node checks can import it.
// carrier-globe.js builds the uniforms of the shader from these calls and re-exports them. A
// direction argument is any object with x, y, and z, as THREE.Vector3 is. A result is a plain
// object with x, y, and z, which THREE.Vector3.copy() takes. The arithmetic is the arithmetic of
// THREE.Vector3 step for step, in the same order, so the shader gets the numbers it got before.
//
// **East is easy to mirror.** The planes below walk the east of bearingTo() in carrier.js,
// (sin lon, 0, -cos lon), the direction of falling lon. tools/carrier-fix-check.mjs builds the
// planes with wedgePlanes() and reads them back through bearingTo() and carrierAt().
import * as grid from './cell-grid.js';
import { sourceSite } from './carrier.js';

// The tint of one wedge, as a part of the way from the lit colour to the accent of the palette.
// n wedges give 1 - pow(1 - WEDGE_STEP, n * n), so one wedge reads 0.06, two read 0.22, three read
// 0.43, and four read 0.63. The square of the count is the point: the wash grows faster than the
// count, so one wedge alone is almost only its two lines, and the ground two or more wedges cover
// stands out as the answer. The first build stepped by 1 - pow(1 - 0.08, n), and one wedge then
// washed as much ground as a crossing did.
export const WEDGE_STEP = 0.06;
// degrees: the soft band on each edge of a wedge, as the sine the shader tests. The facets of the
// globe are 0.0105 units across, which is 0.6 degrees of arc, so a hard edge crawled from facet to
// facet as the world turned. The band is measured on the angle to the edge plane and not on the
// plane distance, so it holds the same width from the site to the antipode.
export const WEDGE_SOFT = Math.sin(0.15 * (Math.PI / 180));
// degrees: the widest error a wedge may carry. The two half plane tests give the lune between the
// two edge great circles, and that lune is the wedge only while the wedge is narrower than a half
// plane. carrierAt() tops the error at 10 degrees today, so the clamp never bites.
const MAX_ERR = 89.5;

// The goal: the cell of the source, filled when GOAL_WEDGES or more wedges overlap in a region under
// GOAL_CELLS cells.
export const GOAL_WEDGES = 3;
export const GOAL_CELLS = 4;
// The step of the grid goalCell() fills the overlap on, as a part of a cell, and how far out it
// looks, in cells. An overlap that reaches the edge of the grid is far wider than GOAL_CELLS.
const GOAL_STEP = 1 / 4;
const GOAL_REACH = 12;

const DEG2RAD = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (x, lo, hi) => {
  if (x <= lo) return 0;
  if (x >= hi) return 1;
  x = (x - lo) / (hi - lo);
  return x * x * (3 - 2 * x);
};
const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
function cross(a, b, out = vec()) {
  const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
  out.x = ay * bz - az * by;
  out.y = az * bx - ax * bz;
  out.z = ax * by - ay * bx;
  return out;
}
function normalize(v) {
  const k = 1 / (Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1);
  v.x *= k; v.y *= k; v.z *= k;
  return v;
}
const fromArray = (a, out = vec()) => { out.x = a[0]; out.y = a[1]; out.z = a[2]; return out; };

// ---------------------------------------------------------------- the wedge
// The three axes of a bearing at a site: east, north, and up. This is the frame of bearingTo() and
// not the frame of the box of a landing. The wedge is drawn on the globe, so it keeps the bearing
// of the globe.
function frameAt(site) {
  const f = grid.tangentFrame(site.lat, site.lon);
  return {
    east: fromArray(f.east),                                       // falling lon
    north: vec(-f.south[0], -f.south[1], -f.south[2]),             // the part of +y in the tangent plane
    up: fromArray(f.up),                                           // siteDir(lat, lon)
  };
}

// The unit tangent at the site along a bearing in degrees. North is 0 and east is 90.
function tangentAt(frame, brg) {
  const b = brg * DEG2RAD, c = Math.cos(b), s = Math.sin(b);
  const n = frame.north, e = frame.east;
  return vec(n.x * c + e.x * s, n.y * c + e.y * s, n.z * c + e.z * s);
}

// A wedge is three unit vectors: the direction of the site `s`, and the inward normals `nL` and
// `nR` of the two edge great circle planes. Each plane runs through the centre, through the site,
// and along the tangent at one edge bearing, so both planes hold the axis through s and -s. The two
// planes cut the sphere into four lunes, and the pair of tests `dot(d, nL) > 0` and
// `dot(d, nR) > 0` selects one of them: the lune that leaves the site along the bearing and closes
// at the antipode of the site. That is decision 5 of issue 34 with no further rule, because a lune
// runs from one pole of its axis to the other and it cannot reach round the back.
//
// The rule holds while the wedge is narrower than a half plane. At an error of exactly 90 degrees
// the two planes fall together and the lune is a hemisphere, which is still right. Past 90 degrees
// the intersection flips to the narrow lune on the far side, so the error takes the clamp of
// MAX_ERR.
//
// The shader runs this same arithmetic per fragment, and the uniforms come from this function, so
// tools/carrier-fix-check.mjs tests the numbers the shader gets.
export function wedgePlanes(fix) {
  const f = frameAt(fix);
  const err = clamp(Math.abs(fix.err), 0, MAX_ERR);
  const s = f.up;
  const tL = tangentAt(f, fix.brg - err);
  const tR = tangentAt(f, fix.brg + err);
  return { s, nL: normalize(cross(tL, s)), nR: normalize(cross(s, tR)) };
}

// How far a direction stands inside each edge of a wedge, as the sine of the angle to that plane.
//
// The raw dot product with a plane normal falls to nothing at the site and at the antipode, because
// the direction lies along the axis of the two planes there. The divide by sin of the arc takes
// that out, so the two numbers read the true angle to the edge at every arc and one soft band holds
// the same width along the whole wedge. Both numbers are positive inside the wedge. This is the
// arithmetic of the shader, line for line.
export function wedgeEdges(planes, dir, out = { l: 0, r: 0 }) {
  const c = dot(dir, planes.s);
  const inv = 1 / Math.max(Math.sqrt(Math.max(1 - c * c, 0)), 1e-4);
  out.l = dot(dir, planes.nL) * inv;
  out.r = dot(dir, planes.nR) * inv;
  return out;
}

// The hard test: does a direction lie in the wedge?
export function inWedge(planes, dir) {
  const e = wedgeEdges(planes, dir);
  return e.l > 0 && e.r > 0;
}

// The soft test the shader paints with: 0 outside the wedge, 1 inside it, and a band of 0.15
// degrees on each edge.
export function wedgeCoverage(planes, dir) {
  const e = wedgeEdges(planes, dir);
  return smoothstep(e.l, 0, WEDGE_SOFT) * smoothstep(e.r, 0, WEDGE_SOFT);
}

// The wash n wedges lay on one fragment, as a part of the way from the lit colour to the accent.
// This is the formula of the GLSL in carrier-globe.js, and both read WEDGE_STEP, so the two cannot
// drift apart.
export function wedgeWash(n) { return 1 - Math.pow(1 - WEDGE_STEP, n * n); }

// ---------------------------------------------------------------- the cell
// A cell of the cube grid is bounded by four great circles: a line of one gnomonic coordinate on a
// face is a plane through the centre. So a cell is four inward plane normals, and a direction lies
// in the cell when all four dots are positive. The dot is the sine of the angle to that edge, so
// the shader draws one line width along all four edges.
//
// `out` takes four objects with x, y, and z. carrier-globe.js passes the THREE.Vector3 slots of its
// uniforms, so the planes go straight to the shader.
const CELL_EDGES = [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]];
const _ca = [0, 0, 0], _cb = [0, 0, 0], _cm = [0, 0, 0];
const _va = vec(), _vb = vec(), _vm = vec();
export function cellPlanes(site, out = [vec(), vec(), vec(), vec()]) {
  const cell = grid.siteCell(site.lat, site.lon);
  fromArray(grid.cellDir(cell, 0.5, 0.5, _cm), _vm);
  CELL_EDGES.forEach(([u0, v0, u1, v1], k) => {
    fromArray(grid.cellDir(cell, u0, v0, _ca), _va);
    fromArray(grid.cellDir(cell, u1, v1, _cb), _vb);
    normalize(cross(_va, _vb, out[k]));
    if (dot(out[k], _vm) < 0) { out[k].x = -out[k].x; out[k].y = -out[k].y; out[k].z = -out[k].z; }
  });
  return out;
}

// The dot of a direction with the four planes of a cell: the least of them, positive inside.
export function inCell(planes, dir) {
  return Math.min(...planes.map((n) => dot(n, dir)));
}

// ---------------------------------------------------------------- the goal
// The cell of the source, or null. It takes the wedges of the globe and fills their overlap on a
// grid of GOAL_STEP of a cell around the source, from the source out. The source always stands
// inside every wedge, because carrierAt() states a bearing inside its error, so the fill starts
// there. When the overlap holds less than GOAL_CELLS cells of area, the reader cannot miss the
// cell any more, and the globe fills it.
//
// The grid is the tangent plane at the source, and a direction on it takes a normalize. The
// overlap stands at most GOAL_REACH cells out, where the plane and the sphere part by under 0.1%.
//
// `source` is the source of the fixes, and the wreck when the caller gives none.
export function goalCell(world, fixes, source = world && world.source) {
  if (!fixes || fixes.length < GOAL_WEDGES) return null;
  const at = sourceSite(world, source);
  if (!at) return null;
  const s = normalize(fromArray(source.dir));
  const planes = fixes.map(wedgePlanes);
  const gE = cross(vec(0, 1, 0), s);
  if (dot(gE, gE) < 1e-8) cross(vec(1, 0, 0), s, gE);
  normalize(gE);
  const gN = cross(s, gE);
  const h = grid.CELL * GOAL_STEP;
  const R = Math.round(GOAL_REACH / GOAL_STEP);
  const d = vec();
  const dirAt = (i, j) => {
    const a = i * h, b = j * h;
    d.x = s.x + gE.x * a + gN.x * b;
    d.y = s.y + gE.y * a + gN.y * b;
    d.z = s.z + gE.z * a + gN.z * b;
    return normalize(d);
  };
  const inAll = (v) => planes.every((p) => inWedge(p, v));
  if (!inAll(dirAt(0, 0))) return null;
  // the true area of a cell of the source, off its corners, in the units of the grid
  const cell = grid.siteCell(at.lat, at.lon);
  const c00 = grid.cellDir(cell, 0, 0), c10 = grid.cellDir(cell, 1, 0), c01 = grid.cellDir(cell, 0, 1);
  const e1 = vec(c10[0] - c00[0], c10[1] - c00[1], c10[2] - c00[2]);
  const e2 = vec(c01[0] - c00[0], c01[1] - c00[1], c01[2] - c00[2]);
  const n = cross(e1, e2);
  const cellArea = Math.sqrt(dot(n, n));
  const most = GOAL_CELLS * cellArea / (h * h);
  const seen = new Set(['0,0']);
  const open = [[0, 0]];
  let count = 0;
  while (open.length) {
    const [i, j] = open.pop();
    if (++count >= most) return null;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj, key = a + ',' + b;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!inAll(dirAt(a, b))) continue;
      if (Math.abs(a) >= R || Math.abs(b) >= R) return null;   // the overlap runs off the grid
      open.push([a, b]);
    }
  }
  return at;
}
