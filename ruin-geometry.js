// myworlds — the body of the ruin: the eight protos, the stone of each world type, the light, and
// the mini model of the globe.
//
// A ruin is the second kind of source (docs/issues/p2-00-the-second-signal.md). Its shape is one
// of eight protos, and the shapes are the prototypes of the design session of 2026-09-27, ported
// here part for part. See docs/ruin.md, "The body".
//
//   spires    seven thin spires with bridges; the tallest carries the light
//   dome      the ribs of a broken dome, a door in the base ring, and a lit core on a plinth
//   arches    six arches in a line, each one lower than the last; the first keystone is lit
//   well      a shaft into the ground with steps, a rim, and eight pylons with lit caps
//   floaters  nine slabs that turn around a lit core, over a ring of stones
//   colossus  a statue of the maker lies on its side; one hand stands out of the ground
//   ring      a ring on its edge, a part of it under the ground; the inner edge is lit
//   hive      a colony: one great mound of hex cells in terraces, three small hives, paved paths
//
// This file takes no DOM and does nothing at import, so the ground (p2-41), the card (p2-42), and
// the globe all build their ruin here, as wreck-geometry.js serves the wreck. Every body is in its
// own frame: y up, the origin on the ground under the middle of the ruin. The parts weld into one
// flat-shaded geometry with a colour per vertex, as the wreck does.
import * as THREE from 'three';
// The table of protos: the ids, the fits, the disc, and the height. ruin-types.js holds it, so the
// worker and the tools read the same rows with no three.js.
import { RUIN_PROTOS, protoRow } from './ruin-types.js';

// ---------------------------------------------------------------- the stone
// The stone of a ruin is fixed per world type: the stone, the dark, and an accent. It does not take
// the colours of the biome, so a ruin reads as a made thing on every world, as the hull of the wreck
// does. `glow` is the colour of the light; the glow geometry carries no colour, and the material of
// p2-41 takes this one. On a lava world `seam` is set: the accent is a seam that takes the glow,
// so the accent parts join the glow geometry there.
export const RUIN_PAL = {
  terran: { stone: '#9b9a88', dark: '#6a6b5d', accent: '#4c7a38', glow: '#8ef0c6' },
  ocean:  { stone: '#e3dfd0', dark: '#a4aca6', accent: '#5f9e98', glow: '#8ef0c6' },
  desert: { stone: '#c68b56', dark: '#8b5a37', accent: '#e9c38e', glow: '#9df5ff' },
  ice:    { stone: '#2e3440', dark: '#1d222c', accent: '#d4e8f5', glow: '#7fe0ff' },
  lava:   { stone: '#2e2830', dark: '#19151c', accent: '#ff6a2a', glow: '#ffc070', seam: true },
  exotic: { stone: '#9587c2', dark: '#51457a', accent: '#6fe0c8', glow: '#ff9df0' },
};
export const ruinPalette = (type) => RUIN_PAL[type] || RUIN_PAL.terran;

// ---------------------------------------------------------------- the mini model
// The mini model on the globe takes the height of the mini wreck, MODEL_H of carrier-globe.js,
// scaled by the ratio of the heights of the table: the spires stand taller than the wreck and the
// colossus lower. The constant is a copy, because carrier-globe.js imports this file for the mini
// ruin and an import the other way would be a cycle. MODEL_H is 0.012 globe radii, and the mast of
// the wreck stands 18 units, so one unit of a ruin is 0.012 / 18 globe radii on the globe.
export const WRECK_MODEL_H = 0.012;   // globe radii: MODEL_H of carrier-globe.js
export const WRECK_MAST_H = 18;       // units: MAST_H of wreck-geometry.js
export const MINI_UNIT = WRECK_MODEL_H / WRECK_MAST_H;   // globe radii per unit of a ruin
export function miniHeight(proto) {
  const row = protoRow(proto);
  return row ? row.height * MINI_UNIT : WRECK_MODEL_H;
}

// The budget. tools/ruin-geometry-check.mjs and tools/ruin-lab.html hold every proto to it.
export const BODY_BUDGET = 4000;   // triangles of the body of any proto
export const MINI_BUDGET = 1500;   // triangles of the mini model

// ---------------------------------------------------------------- the entry
// The body of one proto for one world. `world` gives the type, for the stone, and `world.ruin.maker`,
// for the limbs of the colossus and the size of the doors and the steps. A plain stub does:
// `{ type: 'terran', ruin: { maker: { limbs: 6, height: 1.8 } } }`.
//
//   body   BufferGeometry, non-indexed, a colour per vertex, flat-shaded, y up, the origin on the
//          ground under the middle of the ruin. `userData.lamp` repeats `lamp`, and the well sets
//          `userData.hole`, the radius of the mouth p2-41 opens in the terrain
//   glow   BufferGeometry of the parts that hold the light, the same frame, no vertex colour
//   orbit  BufferGeometry of the parts that move, or null. Only the floaters have one
//   lamp   [x, y, z] of the brightest point, for the point light of HIGH and the lamp of the globe
//
// With `mini: true` the body holds the big parts only, in one colour, the stone of the type, and
// `glow` and `orbit` are null. The globe draws that body beside the mini wreck.
export function ruinGeometry(proto, world, { mini = false } = {}) {
  const type = (world && world.type) || 'terran';
  const maker = (world && world.ruin && world.ruin.maker) || { limbs: 6, height: 1.8 };
  const P = ruinPalette(type);
  const B = { body: [], glow: [], orbit: [], lamp: [0, 0, 0], hole: 0, P, mini, maker, r: rngOf(proto) };
  const build = BUILD[proto] || BUILD.spires;
  build(B);
  const body = weld(B.body, true);
  body.userData.lamp = B.lamp;
  if (B.hole) body.userData.hole = B.hole;
  return {
    body,
    glow: !mini && B.glow.length ? weld(B.glow, false) : null,
    orbit: !mini && B.orbit.length ? weld(B.orbit, true) : null,
    lamp: B.lamp,
  };
}

// The count of triangles of a welded geometry, for the lab and the check.
export const triangles = (geo) => (geo ? geo.attributes.position.count / 3 : 0);

// ---------------------------------------------------------------- the parts
// A part is a geometry, a role, and a matrix. `push()` routes a part by its role:
//   stone, dark   the body, in the colour of the type
//   accent        the body, or the glow on a lava world, where the accent is a seam
//   glow          the glow. The mini drops it, or takes it as stone when `big` is set
//   orbit         the parts that move. The mini takes them into the body
// The mini takes one colour, the stone, for every part of the body.
const _pos = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

// A matrix from a place and a turn. The turn is the Euler of the prototype, order YXZ.
function M(x, y, z, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(_pos.set(x, y, z), _q.setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), _one);
}

function push(B, role, geo, matrix, { big = false, small = false, orbit = false } = {}) {
  if (B.mini && small) { geo.dispose(); return; }
  if (role === 'glow') {
    if (!B.mini) { B.glow.push({ geo, matrix }); return; }
    if (!big) { geo.dispose(); return; }
    role = 'stone';
  }
  if (role === 'accent' && B.P.seam && !B.mini) { B.glow.push({ geo, matrix }); return; }
  const color = B.mini ? B.P.stone : B.P[role];
  (orbit && !B.mini ? B.orbit : B.body).push({ geo, color, matrix });
}
// A part at a place with a turn.
const add = (B, role, geo, x, y, z, rx = 0, ry = 0, rz = 0, o) => push(B, role, geo, M(x, y, z, rx, ry, rz), o);
// A part with a matrix of its own, for a part inside a posed group.
const addM = (B, role, geo, m, o) => push(B, role, geo, m, o);

// A beam from a to b: a box of side w, or a six-sided rod. The ends are left off, because a beam
// ends inside another part or in the ground; `ends` puts them back for a free end.
function beam(B, role, a, b, w, { round = false, ends = false, orbit = false, small = false } = {}) {
  const A = new THREE.Vector3(...a), E = new THREE.Vector3(...b);
  const d = E.clone().sub(A), len = d.length() || 0.001;
  const geo = round
    ? prism(w, w, -len / 2, len / 2, 6, { top: ends, bottom: ends })
    : boxGeo(w, len, w, ends ? [] : ['py', 'ny']);
  const m = new THREE.Matrix4().compose(A.clone().add(E).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(_up, d.normalize()), _one);
  push(B, role, geo, m, { orbit, small });
}

// The PRNG of the prototype, seeded by the id of the proto, so the scatter of the rubble is the
// same on every world and the ruin is a pure function of the proto and the maker.
function rngOf(s) {
  let a = 0;
  for (const c of s) a = (a * 31 + c.charCodeAt(0)) | 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the geometry of a part
// Every face that stands under the ground or inside another part costs a triangle for nothing, so
// the parts here take a mask of faces. They build non-indexed geometry with positions only, and
// weld() computes the flat normals.
class Tris {
  constructor() { this.p = []; }
  tri(a, b, c) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
  // A quad a b c d that faces the way `n` points. The order is corrected when it faces the other way.
  quad(a, b, c, d, n) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { const t = b; b = d; d = t; }
    this.tri(a, b, c); this.tri(a, c, d);
  }
  // A fan over a ring of points that faces the way `n` points.
  fan(pts, n) {
    for (let i = 1; i + 1 < pts.length; i++) {
      const a = pts[0], b = pts[i], c = pts[i + 1];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * n[0] + cy * n[1] + cz * n[2] < 0) this.tri(a, c, b); else this.tri(a, b, c);
    }
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    return g;
  }
}

// A box of w by h by d about the origin. `skip` names the faces to leave off: px nx py ny pz nz.
function boxGeo(w, h, d, skip = []) {
  const x = w / 2, y = h / 2, z = d / 2, T = new Tris();
  const P = (sx, sy, sz) => [sx * x, sy * y, sz * z];
  const S = new Set(skip);
  if (!S.has('px')) T.quad(P(1, -1, -1), P(1, -1, 1), P(1, 1, 1), P(1, 1, -1), [1, 0, 0]);
  if (!S.has('nx')) T.quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), [-1, 0, 0]);
  if (!S.has('py')) T.quad(P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1), [0, 1, 0]);
  if (!S.has('ny')) T.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), [0, -1, 0]);
  if (!S.has('pz')) T.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), [0, 0, 1]);
  if (!S.has('nz')) T.quad(P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), [0, 0, -1]);
  return T.geo();
}
// A box that stands on the ground: no bottom face.
const slab = (w, h, d) => boxGeo(w, h, d, ['ny']);

// A prism or a cone of n sides about the y axis, from y0 to y1. The vertex k stands at the angle
// k * 2 PI / n, measured as atan2(x, z), so the face k has its normal at (k + 1/2) * 2 PI / n.
//   faces    a mask per face, or null for every face
//   yFace    a y per face where the face starts, for a face that a lower neighbour hides in part
//   top      the top cap. bottom: the bottom cap. inward: the sides face in, for a shaft
//   a0, arc  the start angle and the extent, for a part of a ring
function prism(rTop, rBot, y0, y1, n, { faces = null, yFace = null, top = false, bottom = false, inward = false, a0 = 0, arc = Math.PI * 2 } = {}) {
  const T = new Tris(), full = arc >= Math.PI * 2 - 1e-6;
  const at = (k, r, y) => { const a = a0 + (k / n) * arc; return [Math.sin(a) * r, y, Math.cos(a) * r]; };
  for (let k = 0; k < n; k++) {
    if (faces && !faces[k]) continue;
    const yb = yFace ? yFace[k] : y0;
    const a = a0 + ((k + 0.5) / n) * arc, nrm = inward ? [-Math.sin(a), 0, -Math.cos(a)] : [Math.sin(a), 0, Math.cos(a)];
    if (rTop > 0) T.quad(at(k, rBot, yb), at(k + 1, rBot, yb), at(k + 1, rTop, y1), at(k, rTop, y1), nrm);
    else T.fan([at(k, rBot, yb), at(k + 1, rBot, yb), [0, y1, 0]], nrm);
  }
  const m = full ? n : n + 1;
  if (top && rTop > 0) T.fan(Array.from({ length: m }, (_, k) => at(k, rTop, y1)), [0, 1, 0]);
  if (bottom) T.fan(Array.from({ length: m }, (_, k) => at(k, rBot, y0)), [0, -1, 0]);
  return T.geo();
}
// A hex cell of the hive: a prism of six sides with a top and no bottom.
const hexCell = (r, h, faces, yFace) => prism(r, r, 0, h, 6, { faces, yFace, top: true });

// A low wall on a ring from rIn to rOut, from the ground to h, over n segments: the base of the
// dome and the rim of the well. It has an outer face, an inner face, and a top, and no bottom.
// `a0` and `arc` cut a gap in it, for a door, and the two ends then take a cap.
function ringWall(rIn, rOut, h, n, a0 = 0, arc = Math.PI * 2) {
  const T = new Tris(), full = arc >= Math.PI * 2 - 1e-6;
  const at = (k, r, y) => { const a = a0 + (k / n) * arc; return [Math.sin(a) * r, y, Math.cos(a) * r]; };
  for (let k = 0; k < n; k++) {
    const a = a0 + ((k + 0.5) / n) * arc, o = [Math.sin(a), 0, Math.cos(a)];
    T.quad(at(k, rOut, 0), at(k + 1, rOut, 0), at(k + 1, rOut, h), at(k, rOut, h), o);
    T.quad(at(k, rIn, 0), at(k + 1, rIn, 0), at(k + 1, rIn, h), at(k, rIn, h), [-o[0], 0, -o[2]]);
    T.quad(at(k, rIn, h), at(k + 1, rIn, h), at(k + 1, rOut, h), at(k, rOut, h), [0, 1, 0]);
  }
  if (!full) {
    for (const [k, s] of [[0, -1], [n, 1]]) {
      const a = a0 + (k / n) * arc, t = [s * Math.cos(a), 0, -s * Math.sin(a)];
      T.quad(at(k, rIn, 0), at(k, rOut, 0), at(k, rOut, h), at(k, rIn, h), t);
    }
  }
  return T.geo();
}

// A closed ring with a diamond section, in the air: the bands of the dome and the light of the
// ring. `arc` leaves out the part under the ground. It is TorusGeometry with four sides.
const torus = (R, r, n, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, 4, n, arc);
const octa = (r) => new THREE.OctahedronGeometry(r);

// The parts welded into one non-indexed geometry, with a colour per vertex when `colors` is set.
// The material takes flatShading, so the facets read like the ground and like the wreck.
function weld(parts, colors) {
  const pos = [], nor = [], col = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (const { geo, color, matrix } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const pa = g.attributes.position, na = g.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    if (colors) c.set(color);
    for (let i = 0; i < pa.count; i++) {
      p.fromBufferAttribute(pa, i).applyMatrix4(matrix);
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
      if (colors) col.push(c.r, c.g, c.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (colors) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// The size of a door or a step follows the maker: a big maker leaves a big door. The height of the
// maker is in metres, from 0.3 for a small animal to 30 for a giant, and the door stays inside
// [lo, hi] units, because a door must fit the wall it stands in.
const makerSize = (B, k, lo, hi) => Math.min(hi, Math.max(lo, k * ((B.maker && B.maker.height) || 1.8)));

// ---------------------------------------------------------------- the eight protos
const BUILD = {
  // Seven thin spires up to 88 units, joined by bridges. The tallest carries the light on its tip,
  // and every spire wears a lit band at 0.62 of its height. Rubble lies about the feet.
  spires(B) {
    const r = B.r;
    const list = [[0, 0, 88], [11, 6, 62], [-10, 8, 55], [5, -12, 48], [-13, -6, 40], [17, -5, 34], [-3, 15, 30]];
    list.forEach(([x, z, h], i) => {
      const rb = 2.2 + h / 40, lean = i ? (r() - 0.5) * 0.07 : 0;
      add(B, 'stone', prism(0, rb, -h / 2, h / 2, 5), x, h / 2 - 1, z, lean, r() * 6, lean);
      add(B, 'dark', prism(rb * 1.25, rb * 1.5, -2, 2, 5, { top: true }), x, 2, z);
      const yb = h * 0.62, rBand = rb * 0.38 + 0.35;
      add(B, 'glow', prism(rBand, rBand + 0.02, -0.45, 0.45, 5, { top: true, bottom: true }), x, yb - 1, z, 0, 0, 0, { small: true });
    });
    add(B, 'glow', octa(1.7), 0, 88, 0);
    B.lamp = [0, 88, 0];
    for (const [a, b, y] of [[0, 1, 22], [0, 2, 18], [0, 3, 26], [2, 4, 14], [1, 5, 12], [2, 6, 11]]) {
      beam(B, 'dark', [list[a][0], y, list[a][1]], [list[b][0], y - 2, list[b][1]], 0.9, { small: true });
    }
    for (let i = 0; i < 16; i++) {
      const a = r() * 6.28, d = 8 + r() * 14, s = 1 + r() * 2.2;
      add(B, i % 3 ? 'dark' : 'accent', boxGeo(s, s * 0.7, s), Math.cos(a) * d, s * 0.3, Math.sin(a) * d, r(), r() * 3, r(), { small: true });
    }
  },

  // The ribs of a dome 56 units wide on a base ring. Six ribs broke and lie on the ground. A door in
  // the base ring takes the size of the maker. A lit core stands on a plinth in the middle.
  dome(B) {
    const r = B.r, R = 28, n = 14, seg = B.mini ? 6 : 12;
    const reach = [12, 12, 5, 12, 8, 3, 12, 10, 12, 4, 12, 7, 12, 11];
    // the base ring, with a gap for the door between the first two ribs
    const doorH = makerSize(B, 1.3, 3, 9), doorW = makerSize(B, 0.9, 2.6, 8);
    const doorA = Math.PI / n, gap = doorW / R;
    add(B, 'dark', ringWall(R - 1.6, R + 1.6, 2.2, B.mini ? 18 : 36, doorA + gap / 2, Math.PI * 2 - gap), 0, 0, 0);
    if (!B.mini) {
      for (const s of [-1, 1]) {
        const a = doorA + s * (gap / 2 + 0.9 / R);
        add(B, 'stone', slab(1.8, doorH, 3.6), Math.sin(a) * R, doorH / 2, Math.cos(a) * R, 0, a, 0);
      }
      add(B, 'accent', boxGeo(doorW + 4, 1.2, 3.8), Math.sin(doorA) * R, doorH + 0.6, Math.cos(doorA) * R, 0, doorA, 0);
    }
    // the ribs: beams along quarter circles, and the broken ones end in a cap
    const p = (phi, t) => [Math.cos(phi) * R * Math.cos(t), R * Math.sin(t), Math.sin(phi) * R * Math.cos(t)];
    for (let i = 0; i < n; i++) {
      const phi = (i / n) * Math.PI * 2, last = Math.round((reach[i] / 12) * seg);
      for (let s = 0; s < last; s++) {
        beam(B, 'stone', p(phi, (s / seg) * Math.PI / 2), p(phi, ((s + 1) / seg) * Math.PI / 2), 1.4, { ends: reach[i] < 12 && s === last - 1 });
      }
      if (reach[i] < 12) {
        for (let k = 0; k < 2; k++) {
          const d = R * (0.7 + r() * 0.5), a = phi + (r() - 0.5) * 0.4;
          add(B, 'stone', slab(1.4, 1.4, 6.5), Math.cos(a) * d, 0.7, Math.sin(a) * d, 0, r() * 3, 0, { small: true });
        }
      }
    }
    // the bands: an accent ring low on the ribs, dark beams between the ribs half way up, and a stone
    // ring near the top where the whole ribs meet
    const t1 = (2 / 12) * Math.PI / 2;
    add(B, 'accent', torus(R * Math.cos(t1), 0.9, 32), 0, R * Math.sin(t1), 0, Math.PI / 2, 0, 0, { small: true });
    const t2 = (6 / 12) * Math.PI / 2;
    for (let i = 0; i < n; i++) {
      if (reach[i] > 6 && reach[(i + 1) % n] > 6) beam(B, 'dark', p((i / n) * Math.PI * 2, t2), p(((i + 1) / n) * Math.PI * 2, t2), 0.9, { small: true });
    }
    const tt = (11 / 12) * Math.PI / 2;
    add(B, 'stone', torus(R * Math.cos(tt), 0.9, 16), 0, R * Math.sin(tt), 0, Math.PI / 2, 0, 0, { small: true });
    // the plinth and the core
    add(B, 'dark', prism(5, 6.5, -1.5, 1.5, 6, { top: true }), 0, 1.5, 0);
    add(B, 'glow', new THREE.IcosahedronGeometry(3.2), 0, 7.5, 0);
    B.lamp = [0, 7.5, 0];
  },

  // Six arches in a line along z, each one lower and narrower than the last, on a gentle curve.
  // The fifth arch keeps four blocks, the sixth none and one short leg. The keystone of the first
  // arch holds the light. Paving lies between the legs.
  arches(B) {
    for (let k = 0; k < 6; k++) {
      const z = -45 + k * 18, x = 7 * Math.sin(z / 28), hl = 22 - k * 2.4, w = 16 - k * 0.9;
      const shortLeg = k === 5 ? 0.45 : 1;
      add(B, 'stone', slab(3.2, hl, 3.2), x - w / 2, hl / 2, z);
      add(B, 'stone', slab(3.2, hl * shortLeg, 3.2), x + w / 2, (hl * shortLeg) / 2, z);
      add(B, 'accent', slab(4, 1.4, 4), x - w / 2, 0.7, z, 0, 0, 0, { small: true });
      add(B, 'accent', slab(4, 1.4, 4), x + w / 2, 0.7, z, 0, 0, 0, { small: true });
      const nb = 9, keep = k === 4 ? 4 : k === 5 ? 0 : nb, rr = w / 2, len = (Math.PI * rr) / nb + 0.4;
      for (let i = 0; i < keep; i++) {
        const th = Math.PI - ((i + 0.5) / nb) * Math.PI, key = k === 0 && i === 4;
        const ends = i === 0 || i === keep - 1;
        add(B, key ? 'glow' : 'stone', boxGeo(len, 3.2, 3.2, ends ? [] : ['px', 'nx']), x + Math.cos(th) * rr, hl + Math.sin(th) * rr, z, 0, 0, th + Math.PI / 2);
        if (key) B.lamp = [x + Math.cos(th) * rr, hl + Math.sin(th) * rr, z];
      }
      if (k < 5) add(B, k % 2 ? 'dark' : 'stone', slab(9, 0.6, 18), x + (7 * (Math.sin((z + 9) / 28) - Math.sin(z / 28))) / 2, 0.3, z + 9, 0, 0, 0, { small: true });
    }
    add(B, 'stone', boxGeo(3.2, 3.2, 7), 12, 1.6, 44, 0.2, 0.4, 0, { small: true });
  },

  // A shaft 46 units into the ground, with a lit floor, steps down the wall, a rim, and eight
  // pylons that lean out with a lit cap each. The rise of the steps follows the maker. The light
  // comes out of the mouth, so the lamp stands there. The body holds the shaft wall and the floor;
  // `userData.hole` gives the radius of the mouth, and p2-41 opens the terrain over it.
  well(B) {
    const r = B.r, hole = 13, depth = 46, n = 18;
    B.hole = hole;
    if (!B.mini) {
      add(B, 'dark', prism(hole, hole, -depth, 0.1, n, { inward: true }), 0, 0, 0);
      add(B, 'glow', prism(hole - 0.2, hole - 0.2, -depth, -depth + 0.5, n, { top: true }), 0, 0, 0);
    }
    add(B, 'stone', ringWall(hole, hole + 2.3, 1.8, n), 0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const g = M(Math.cos(a) * 19, 0, Math.sin(a) * 19, -0.2, -a - Math.PI / 2, 0);
      addM(B, 'stone', slab(3, 25, 2.2), M(0, 11.5, 0).premultiply(g));
      addM(B, 'accent', boxGeo(3.6, 2.4, 2.8), M(0, 0.6, 0).premultiply(g), { small: true });
      addM(B, 'glow', boxGeo(1, 1.6, 2.4), M(0, 24.6, 0).premultiply(g));
    }
    B.lamp = [0, 2, 0];
    // the steps: a stair down the wall, one step per rise, the rise from the maker
    if (!B.mini) {
      const rise = makerSize(B, 0.8, 0.9, 4), pitch = 0.45 * (rise / 1.5), along = 4.2 * (rise / 1.5);
      const steps = Math.floor((depth - 2) / rise);
      for (let i = 0; i < steps; i++) {
        const a = i * pitch;
        add(B, 'dark', boxGeo(along, 0.8, 2.4), Math.cos(a) * 11, -1 - i * rise, Math.sin(a) * 11, 0, -a - Math.PI / 2, 0);
      }
      for (let i = 0; i < 8; i++) {
        const a = r() * 6.28, d = 22 + r() * 6;
        add(B, 'dark', boxGeo(2.5, 1.2, 2), Math.cos(a) * d, 0.5, Math.sin(a) * d, 0, r() * 3, 0.1);
      }
    }
  },

  // Nine slabs turn about a lit core with no support, over a plinth and a ring of ten stones on the
  // ground. Two thin accent rings turn with them. The slabs and the rings are the orbit geometry,
  // and p2-41 turns it about y. The mini takes the slabs into the body.
  floaters(B) {
    const r = B.r;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      add(B, i % 2 ? 'stone' : 'dark', slab(3, 2.4, 3), Math.cos(a) * 17, 1.1, Math.sin(a) * 17, 0, -a, 0);
    }
    add(B, 'dark', prism(5, 6.5, -1, 1, 6, { top: true }), 0, 1, 0);
    add(B, 'glow', octa(3.3), 0, 23, 0, 0, 0, 0, { big: true });
    B.lamp = [0, 23, 0];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.3, d = 9 + r() * 8, y = 12 + r() * 22;
      add(B, i % 2 ? 'stone' : 'dark', boxGeo(3 + r() * 3, 7 + r() * 8, 1.6 + r()), Math.cos(a) * d, y, Math.sin(a) * d, (r() - 0.5) * 0.5, -a - Math.PI / 2, (r() - 0.5) * 0.5, { orbit: true });
    }
    for (const tilt of [0.3, 1.2]) add(B, 'accent', torus(6.5, 0.25, 24), 0, 23, 0, tilt, 0, 0.4, { orbit: true, small: true });
  },

  // A statue of the maker lies on its side, the head to -x. The limbs of the maker set the legs:
  // pairs lie along the body, one leg on the up side and one crushed under the body, as the
  // prototype lays three. A maker of 0 limbs lies as a long body in coils, and a maker of 1 limb
  // lies on one thick leg. One hand stands out of the ground, and the eye and the palm are lit. The
  // palm is the lamp, because it is the landmark from across the cell.
  colossus(B) {
    const r = B.r, L = Math.max(0, Math.round((B.maker && B.maker.limbs) || 0));
    const body = M(0, 0, 0, 0, 0.25, 0.1);
    const inBody = (x, y, z, rx = 0, ry = 0, rz = 0) => M(x, y, z, rx, ry, rz).premultiply(body);
    const at = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(body).toArray();
    const sides = B.mini ? 4 : 6;
    if (L === 0) {
      // the coils: a chain of rods on a wave, thick at the head and thin at the tail
      const pts = [];
      for (let k = 0; k <= 8; k++) pts.push([-14 + 4.6 * k, 3.2, 8.5 * Math.sin(k * 1.2)]);
      for (let k = 0; k < 8; k++) beam(B, 'stone', at(...pts[k]), at(...pts[k + 1]), 3.6 - 1.5 * (k / 8), { round: true, ends: k === 7 });
      const yaw = Math.atan2(pts[1][2] - pts[0][2], pts[1][0] - pts[0][0]);
      addM(B, 'accent', boxGeo(6, 8.4, 8.4), inBody(pts[1][0], 3.2, pts[1][2], 0, -yaw, 0));
    } else {
      addM(B, 'stone', boxGeo(30, 9, 11), inBody(0, 3.2, 0));
      addM(B, 'accent', boxGeo(12, 9.6, 11.6), inBody(-6, 3.2, 0));
      addM(B, 'dark', boxGeo(10, 4, 8), inBody(16, 1.4, -2, 0, 0.1, -0.1));
    }
    beam(B, 'stone', at(-15, 5, -1), at(-21, 6.5, -2), 2.6, { round: true });
    addM(B, 'stone', new THREE.DodecahedronGeometry(5.6), inBody(-25.5, 6, -2.5, 0.3, 0.4, 0));
    addM(B, 'glow', octa(1.2), inBody(-29.6, 7.4, -0.2));
    // the legs, at stations along the body
    const stations = L <= 2 ? [2] : L <= 4 ? [-9, 12] : [-9, 2, 12];
    for (let k = 0; k < L; k++) {
      const x = stations[Math.min(Math.floor(k / 2), stations.length - 1)], i = Math.floor(k / 2), s = k % 2 ? -1 : 1;
      const w = L === 1 ? 1.6 : 1;
      if (s > 0) {
        const knee = [x + 4, 1, 17 - i * 2];
        beam(B, 'stone', at(x, 4, 5.5), at(...knee), 1.7 * w, { round: true });
        if (i !== 1 || L === 1) beam(B, 'dark', at(...knee), at(x + 2, 0.8, 24 - i * 2), 1.4 * w, { round: true, ends: true });
        else addM(B, 'dark', boxGeo(3, 2.4, 5), inBody(x + 9, 1, 22, 0.3, 0.8, 0.2));
      } else {
        const knee = [x + 5, 0.9, -14 + i];
        beam(B, 'stone', at(x, 2, -5.5), at(...knee), 1.7, { round: true });
        beam(B, 'dark', at(...knee), at(x + 3, 0.7, -20 + i), 1.4, { round: true, ends: true });
      }
    }
    // the hand that stands: a forearm out of the ground, a palm, three fingers, and the lit palm
    beam(B, 'stone', [8, -2, -16], [8.6, 14, -17], 1.9, { round: true });
    add(B, 'stone', boxGeo(5, 4.2, 2.2), 8.8, 16.6, -17.2);
    for (let f = 0; f < 3; f++) add(B, 'stone', boxGeo(0.9, 4, 0.9), 7.2 + f * 1.6, 20.5, -17.2, 0, 0, (f - 1) * 0.12);
    add(B, 'glow', boxGeo(1.4, 1.4, 0.4), 8.8, 16.6, -16);
    B.lamp = [8.8, 16.6, -15.7];
    for (let i = 0; i < 10; i++) {
      const a = r() * 6.28, d = 14 + r() * 22, s = 1 + r() * 2.5;
      add(B, 'dark', boxGeo(s, s * 0.8, s), Math.cos(a) * d, s * 0.3, Math.sin(a) * d, r(), r() * 3, r(), { small: true });
    }
  },

  // A ring of 26 stones, 48 units across, stands on its edge with a part of it under the ground.
  // One stone is missing. Every third stone carries an accent block on the outer face. A lit torus
  // runs along the inner edge, over the ground only.
  ring(B) {
    const R = 24, n = 26, cy = 14;
    const ring = M(0, 0, 0, 0, 0.55, 0);
    for (let i = 0; i < n; i++) {
      if (i === 5) continue;
      const th = (i / n) * Math.PI * 2, x = Math.cos(th) * R, y = cy + Math.sin(th) * R;
      if (y < -4) continue;
      addM(B, i % 2 ? 'dark' : 'stone', boxGeo((R * 2 * Math.PI) / n + 0.3, 5, 6), M(x, y, 0, 0, 0, th + Math.PI / 2).premultiply(ring));
      if (i % 3 === 0) addM(B, 'accent', boxGeo(2, 2.2, 6.8), M(Math.cos(th) * (R + 2.4), cy + Math.sin(th) * (R + 2.4), 0, 0, 0, th + Math.PI / 2).premultiply(ring), { small: true });
    }
    // the light: the arc of the inner edge that stands over the ground
    const Ri = R - 2.9, under = Math.asin(Math.min(1, cy / Ri)), gap = Math.PI - 2 * under;
    addM(B, 'glow', torus(Ri, 0.5, 40, Math.PI * 2 - gap), M(0, cy, 0, 0, 0, -under).premultiply(ring));
    B.lamp = [0, cy + Ri, 0];
    add(B, 'stone', boxGeo(6, 3.2, 3.6), 16, 1.2, 14, 0.2, 0.6, 0.3, { small: true });
    add(B, 'dark', boxGeo(4, 3, 4), -18, 1, -12, 0.1, 0.2, 0.2, { small: true });
  },

  // A colony: one great mound of equal hex cells in terraces of one step, three small hives around
  // it, paved paths of hex pavers between them, lit doors at the foot of each mound, and a crown on
  // the great mound. One cell size and one step height everywhere, so it reads as built and not as
  // grown. A mound is a hexagon of rings, and each ring stands one step over the ring outside it,
  // so the terraces are level. A few cells inside a mound fell one step: it is a ruin.
  //
  // A face of a cell that a neighbour of the same height or higher covers is left out, and a face
  // over a lower neighbour starts at the top of that neighbour, so a terrace costs its top and its
  // outer wall and nothing more.
  hive(B) {
    const r = B.r, rc = 2.6, gap = 0.12, STEP = 5, a = rc + gap, sq = Math.sqrt(3);
    const doorH = makerSize(B, 1.15, 1.2, STEP - 0.8), doorW = doorH * 0.7;
    // face k of a cell looks at the neighbour at this step of the axial grid
    const NB = [[0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1]];
    const key = (q, s) => q + ',' + s;
    const mound = (cx, cz, rings, crown) => {
      const cells = new Map();
      for (let s = -rings; s <= rings; s++) for (let q = -rings; q <= rings; q++) {
        const ring = Math.max(Math.abs(q), Math.abs(s), Math.abs(q + s));
        if (ring > rings) continue;
        const fell = ring > 0 && ring < rings && r() < 0.08;
        const layers = rings - ring + 1 - (fell ? 1 : 0);
        cells.set(key(q, s), { q, s, x: a * sq * (q + s / 2), z: a * 1.5 * s, ring, layers, h: layers * STEP });
      }
      let rim = 0;
      for (const c of cells.values()) {
        const faces = [], yFace = [];
        let door = -1, best = -Infinity;
        for (let k = 0; k < 6; k++) {
          const nb = cells.get(key(c.q + NB[k][0], c.s + NB[k][1]));
          faces.push(!(nb && nb.h >= c.h));
          yFace.push(nb ? Math.min(nb.h, c.h) : 0);
          if (!nb) {   // an open face at the foot: the one that looks away from the middle takes the door
            const fa = ((k + 0.5) / 6) * Math.PI * 2, out = Math.sin(fa) * c.x + Math.cos(fa) * c.z;
            if (out > best) { best = out; door = k; }
          }
        }
        add(B, c.layers % 2 ? 'stone' : 'dark', hexCell(rc, c.h, faces, yFace), cx + c.x, 0, cz + c.z);
        add(B, 'accent', hexCell(rc * 0.78, 0.4, null, null), cx + c.x, c.h, cz + c.z, 0, 0, 0, { small: true });
        if (door >= 0 && rim++ % 3 === 0) {
          const fa = ((door + 0.5) / 6) * Math.PI * 2;
          add(B, 'glow', boxGeo(doorW, doorH, 0.3), cx + c.x + Math.sin(fa) * rc * 0.87, doorH / 2 + 0.1, cz + c.z + Math.cos(fa) * rc * 0.87, 0, fa, 0);
        }
        if (crown && c.ring === 0) {
          add(B, 'glow', octa(1.7), cx + c.x, c.h + 2.6, cz + c.z);
          for (let k = 0; k < 6; k++) {
            const fa = (k / 6) * Math.PI * 2;
            add(B, 'stone', boxGeo(0.6, 2.2, 0.6, ['ny']), cx + c.x + Math.sin(fa) * 1.9, c.h + 1.4, cz + c.z + Math.cos(fa) * 1.9, 0, 0, 0, { small: true });
          }
          B.lamp = [cx + c.x, c.h + 2.6, cz + c.z];
        }
      }
      return rings * a * sq + rc;   // the reach of the mound, at a corner of the hexagon
    };
    const reach = mound(0, 0, 5, true);
    const sats = [[40, 12], [-30, 30], [-12, -40]];
    for (const [x, z] of sats) {
      const sr = mound(x, z, 1, false);
      // the paved path: two rows of hex pavers from the great mound to the small hive
      const len = Math.hypot(x, z), ux = x / len, uz = z / len;
      for (let t = reach - 1; t < len - sr + 1; t += 4.6) {
        for (const side of [-1, 1]) {
          add(B, 'accent', prism(2, 2, 0, 0.35, 6, { top: true }), ux * t - uz * side * 2.15, 0, uz * t + ux * side * 2.15, 0, 0, 0, { small: true });
        }
      }
    }
  },
};
