// myworlds — the body of the wreck: four hulls, and the pick of one from the seed of the world.
//
// The log fixes what every hull must hold: an engine bell, a climb tank for the one climb back to
// the orbiter, and a mast the crew raised. The lander could reach orbit and no further, so every
// hull here is a ship that climbs, and none is a plain tube with fins. See docs/source.md.
//
//   rocket      a tall reusable booster with a crew cabin on top. One leg of four folded, and it leans
//   spaceplane  a lifting body on its belly. One wing broke off, and one of the three bells split
//   rotor       rotors for the landing, a bell for the climb. It fell on its side, and one blade stands
//   tripod      a crew sphere in a ring tank on three tall legs. One leg buckled at the knee
//
// The lamp stands on the highest point of each hull, so the reader finds it from across the cell.
// The spaceplane and the tripod are low, and the lamp stands on the mast of the crew. The rocket
// carries it on its nose, and the rotor on the blade that still stands.
//
// This file takes no DOM and does nothing at import, so the ground, the card, and the globe all
// build their wreck here. Each body is in its own frame: y up, the origin on the ground under it.
import * as THREE from 'three';

// The metal of a machine. It takes no colour from the palette: a wreck must read as a made thing on
// a green world and on an ice world alike, and a hull in the colours of the biome would read as
// rock. Only the lamp takes the accent of the world.
//
// WRECK_HULL is the one colour that leaves this file. The mini wreck a find leaves on the globe is
// far too small for a colour per part, so it takes the hull colour for the whole body and the two
// wrecks then read as one machine. See carrier-globe.js.
export const WRECK_HULL = '#8f959d';
const C_HULL = WRECK_HULL;
const C_HULL_DARK = '#5c626a';
const C_BURN = '#3b3a3c';
const C_DISH = '#c2c8d0';
const C_LEG = '#6d747c';
const C_PANEL = '#d6d9dd';   // the white tile of a crew section
const C_GLASS = '#1d2838';

const MAST_H = 18;           // units, the mast of the crew over the ground

// The four hulls, and the ones a world with no air can hold: a rotor and a wing need air to land on.
export const HULLS = ['rocket', 'spaceplane', 'rotor', 'tripod'];
const AIRLESS = ['rocket', 'tripod'];

// The hull of the wreck of a world. The pick is a pure function of the seed, the way motifOf() in
// music.js is, so the ground, the card, and the globe agree and no stream of generate.js draws one
// number more. The hash is the FNV hash music.js uses.
export function hullOf(world) {
  const seed = String((world && world.seed) || '');
  let h = 2166136261;
  for (const ch of 'hull:' + seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const list = world && world.hasAtmosphere === false ? AIRLESS : HULLS;
  return list[(h >>> 0) % list.length];
}

// The body of one hull and the camp of its crew, with the place of the lamp in geo.userData.lamp.
// The mini wreck on the globe passes camp: false, because a camp at that size reads as noise.
export function wreckGeometry(hull = 'rocket', { camp = true } = {}) {
  const build = hull === 'spaceplane' ? spaceplane : hull === 'rotor' ? rotor : hull === 'tripod' ? tripod : rocket;
  const body = build();
  const parts = camp ? [...body.parts, ...campParts(body.camp[0], body.camp[1])] : body.parts;
  const geo = mergeParts(parts);
  geo.userData.lamp = body.lamp;
  return geo;
}

// ---------------------------------------------------------------- the parts
const _up = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);

// One part of the body: a geometry, a colour, and where it stands. mergeParts() below welds them
// into one flat-shaded mesh, the way mergeGeos() in fauna.js welds a creature.
function part(geo, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(
    _a.set(x, y, z), _q.setFromEuler(new THREE.Euler(rx, ry, rz)), _one);
  return { geo, color, matrix: m };
}

// A part with a scale, which part() does not take.
function partS(geo, color, pos, rot, scale) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
  return { geo, color, matrix: m };
}

// A strut between two points: a tapered cylinder that stands along the line from a to b.
function strut(a, b, r1, r2, color, sides = 5) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
  const d = _b.clone().sub(_a);
  const len = d.length() || 0.001;
  const m = new THREE.Matrix4().compose(
    _b.clone().add(_a).multiplyScalar(0.5),
    _q.setFromUnitVectors(_up, d.normalize()),
    _one);
  return { geo: new THREE.CylinderGeometry(r2, r1, len, sides, 1), color, matrix: m };
}

// A flat polygon in the xy plane, extruded by `depth` along z: a wing, a fin.
function plate(pts, depth) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

// A body is built upright and then posed: one matrix moves a list of parts.
function poseMatrix(pos, rot) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), _one);
}
function pose(parts, m) {
  for (const p of parts) p.matrix.premultiply(m);
  return parts;
}
const at = (m, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m).toArray();

// The parts welded into one non-indexed geometry with a colour per vertex. The material takes
// flatShading, so the facets read like the ground and like every other body in this app.
function mergeParts(parts) {
  const pos = [], nor = [], col = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (const { geo, color, matrix } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const pa = g.attributes.position, na = g.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const c = new THREE.Color(color);
    for (let i = 0; i < pa.count; i++) {
      p.fromBufferAttribute(pa, i).applyMatrix4(matrix);
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// A lathe is one surface, and its back face is culled: an open bowl or bell seen from behind shows
// nothing. So a dish and a bell are closed shells, a profile that runs out along one face and back
// along the other. The outer face runs up and the inner face runs down, so both face outward.
//
// The dish: a shallow bowl, the back at the origin and the hollow facing +y.
function dishGeo() {
  return new THREE.LatheGeometry([
    new THREE.Vector2(0.05, 0), new THREE.Vector2(0.9, 0.15), new THREE.Vector2(1.5, 0.5),
    new THREE.Vector2(1.5, 0.6), new THREE.Vector2(0.9, 0.27), new THREE.Vector2(0.05, 0.12),
    new THREE.Vector2(0.05, 0),
  ], 12);
}
// A bell, with the radii and the height of CylinderGeometry(rTop, rBottom, h): the wall has a
// thickness, so the mouth reads as hollow from below and the bell reads whole from any side.
function bellGeo(rTop, rBottom, h, sides = 8, wall = 0.08) {
  const y = h / 2;
  return new THREE.LatheGeometry([
    new THREE.Vector2(rBottom, -y), new THREE.Vector2(rTop, y),
    new THREE.Vector2(rTop - wall, y), new THREE.Vector2(rBottom - wall, -y),
    new THREE.Vector2(rBottom, -y),
  ], sides);
}

// The mast the crew raised: a three-sided lattice with rungs, three guy wires, and a small dish.
// `head` puts a box on top for the lamp; a hull that carries the lamp itself leaves it off.
function crewMast(x, z, h = MAST_H, guy = 4.5, head = true) {
  const parts = [];
  const top = [x + 0.3, h - 0.6, z];
  const bases = [0, 1, 2].map((i) => {
    const a = (i * 2 * Math.PI) / 3;
    return [x + 1.1 * Math.cos(a), 0, z + 1.1 * Math.sin(a)];
  });
  for (const b of bases) parts.push(strut(b, top, 0.2, 0.1, C_LEG, 4));
  const along = (b, t) => [b[0] + (top[0] - b[0]) * t, b[1] + (top[1] - b[1]) * t, b[2] + (top[2] - b[2]) * t];
  for (const t of [0.22, 0.48, 0.74]) {
    for (let i = 0; i < 3; i++) parts.push(strut(along(bases[i], t), along(bases[(i + 1) % 3], t), 0.08, 0.08, C_LEG, 3));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3 + Math.PI / 3;
    parts.push(strut([x + guy * Math.cos(a), 0, z + guy * Math.sin(a)], [x + 0.25, h * 0.78, z], 0.05, 0.05, C_HULL_DARK, 3));
  }
  // The dish rides on an arm out of the mast. The back of the bowl sits on the end of the arm, and a
  // feed stands out of the bowl along its axis.
  const t = 0.66, tilt = -1.1;
  const arm = [x + 0.3 * t, (h - 0.6) * t, z];
  const mount = [arm[0] + 1.0, arm[1] + 0.25, z];
  const ax = [Math.sin(-tilt), Math.cos(-tilt)];
  parts.push(strut(arm, mount, 0.1, 0.1, C_LEG, 4));
  parts.push(part(dishGeo(), C_DISH, mount[0], mount[1], mount[2], 0, 0, tilt));
  parts.push(strut(mount, [mount[0] + 1.1 * ax[0], mount[1] + 1.1 * ax[1], z], 0.06, 0.04, C_LEG, 3));
  if (head) parts.push(part(new THREE.BoxGeometry(0.9, 0.5, 0.9), C_HULL_DARK, top[0], top[1] + 0.2, top[2]));
  return { parts, lamp: [top[0], h + 0.4, top[2]] };
}

// ---------------------------------------------------------------- the camp
// The crew did not live in the ship. They lived in a dome beside it: a half sphere on a ring, an
// airlock tunnel with the door toward the ship, a row of windows, and around it the rest of a
// camp: crates, a solar array, and the water tank of the fuel maker. Each hull names a spot for
// it in the free ground of the disc the worker flattened, about 8 to 10 units out, and the door
// turns to face the ship. The camp stands a little smaller than life, so it fits inside the disc.
const C_DOOR = '#c0662e';     // the paint of a hatch: a made colour, and not one of the palette
const C_CRATE = '#7d735c';
const C_SOLAR = '#27365a';
const CAMP_K = 0.85;

function campParts(cx, cz) {
  const p = [];
  const R = 3;
  // the dome, its ring, and three windows a third of the way up
  p.push(part(new THREE.SphereGeometry(R, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), C_PANEL, 0, 0.3, 0));
  p.push(part(new THREE.CylinderGeometry(R + 0.1, R + 0.25, 0.5, 12), C_HULL_DARK, 0, 0.25, 0));
  for (const a of [-0.9, 0.9, Math.PI]) {
    const e = 0.55;
    p.push(part(new THREE.BoxGeometry(0.2, 0.5, 1.0), C_GLASS,
      R * Math.cos(e) * Math.cos(a), 0.3 + R * Math.sin(e), -R * Math.cos(e) * Math.sin(a), 0, a, e));
  }
  // the airlock along +x, and its door
  p.push(part(new THREE.CylinderGeometry(1.0, 1.0, 2.2, 8), C_HULL, R + 0.3, 1.0, 0, 0, 0, Math.PI / 2));
  p.push(part(new THREE.BoxGeometry(0.2, 1.5, 1.0), C_DOOR, R + 1.45, 0.95, 0));
  // crates by the door, one on another
  p.push(part(new THREE.BoxGeometry(1.1, 1.1, 1.1), C_CRATE, R + 1.4, 0.55, 2.0, 0, 0.3, 0));
  p.push(part(new THREE.BoxGeometry(0.9, 0.8, 0.9), C_CRATE, R + 1.5, 1.5, 1.9, 0, 0.8, 0));
  p.push(part(new THREE.BoxGeometry(1.2, 0.8, 0.9), C_HULL_DARK, R + 0.6, 0.4, -2.3, 0, -0.4, 0));
  // the solar array behind, two panels on posts, tilted up
  for (const x of [-1.6, 1.3]) {
    p.push(strut([x, 0, 4.0], [x, 1.2, 4.0], 0.1, 0.1, C_LEG, 4));
    p.push(part(new THREE.BoxGeometry(2.6, 0.12, 1.5), C_SOLAR, x, 1.3, 4.0, 0.55, 0, 0));
  }
  p.push(strut([0, 0.06, 3.3], [-0.2, 0.06, R - 0.2], 0.05, 0.05, C_BURN, 3));   // the cable in
  // the tank of the fuel maker, and a pipe to the dome
  p.push(part(new THREE.CylinderGeometry(0.8, 0.8, 1.8, 8), C_HULL, -R - 0.9, 0.9, -1.4));
  p.push(strut([-R - 0.2, 0.5, -1.2], [-R + 0.3, 0.5, -0.9], 0.08, 0.08, C_LEG, 4));
  // the door turns to face the ship at the origin
  const yaw = Math.atan2(cz, -cx);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, 0, cz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(CAMP_K, CAMP_K, CAMP_K));
  return pose(p, m);
}

// ---------------------------------------------------------------- the four hulls

// A tall reusable booster with the crew cabin on its nose. It came down on four legs, the leg on
// the -x side folded, and the booster settled onto that side. The soot of the landing burn blackens
// the lower third, grid fins stand out under the cabin, and one of the three bells is split. The lamp
// sits on the tip of the nose, the highest point of any hull.
function rocket() {
  const body = [];
  const base = 1.6, len = 22, R = 1.8;
  body.push(part(new THREE.CylinderGeometry(R, R, len, 10), C_HULL, 0, base + len / 2, 0));
  body.push(part(new THREE.CylinderGeometry(R + 0.03, R + 0.03, 7, 10), C_HULL_DARK, 0, base + 3.5, 0));
  body.push(part(new THREE.CylinderGeometry(R + 0.06, R + 0.2, 0.9, 10), C_BURN, 0, base + 0.45, 0));
  body.push(part(new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.5, 10), C_PANEL, 0, base + 15, 0));
  // the climb tank shows as a white band, and the cabin is a white ogive with a row of windows
  const nose = new THREE.LatheGeometry([
    new THREE.Vector2(R, 0), new THREE.Vector2(R * 0.97, 1.6), new THREE.Vector2(R * 0.82, 3.1),
    new THREE.Vector2(R * 0.55, 4.3), new THREE.Vector2(R * 0.22, 5.1), new THREE.Vector2(0.01, 5.4),
  ], 10);
  const top = base + len;
  body.push(part(nose, C_PANEL, 0, top, 0));
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i - 1) * 0.5;
    body.push(part(new THREE.BoxGeometry(0.55, 0.7, 0.2), C_GLASS,
      1.72 * Math.cos(a), top + 1.2, 1.72 * Math.sin(a), 0, -a + Math.PI / 2, 0));
  }
  // four grid fins under the cabin, each a flat plate that stands out from the hull
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    body.push(part(new THREE.BoxGeometry(1.6, 0.25, 1.5), C_LEG, (R + 0.8) * Math.cos(a), top - 1.4, (R + 0.8) * Math.sin(a), 0, -a, 0));
  }
  // three bells under the skirt; the split one hangs crooked
  const bell = () => bellGeo(0.45, 0.85, 1.3);
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3;
    const split = i === 2;
    body.push(part(bell(), split ? C_BURN : C_HULL_DARK, 0.85 * Math.cos(a), base - 0.6, 0.85 * Math.sin(a),
      split ? 0.3 : 0, 0, split ? 0.25 : 0));
  }
  // the lean: the booster turns onto the side of the folded leg, about the rim on that side
  const m = poseMatrix([0, 0, 0], [0, 0, 0.19]);
  m.premultiply(new THREE.Matrix4().makeTranslation(-0.3, -0.25, 0));
  pose(body, m);
  const parts = [...body];
  // four legs from the hull to pads on the ground; the one on -x folded up against the hull
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const c = Math.cos(a), s = Math.sin(a);
    const hip = at(m, R * c, base + 5, R * s);
    if (i === 2) {
      const knee = at(m, (R + 0.7) * c, base + 1.2, (R + 0.7) * s);
      parts.push(strut(hip, knee, 0.4, 0.35, C_BURN, 5));
      parts.push(part(new THREE.CylinderGeometry(1.1, 1.3, 0.45, 7), C_BURN, -6.2, 0.22, 3.4, 0.15, 0, 0.1));
      continue;
    }
    const foot = [6.2 * c, 0.35, 6.2 * s];
    parts.push(strut(hip, foot, 0.42, 0.3, C_LEG, 5));
    parts.push(strut(at(m, R * c, base + 0.8, R * s), [foot[0] * 0.6, 1.1, foot[2] * 0.6], 0.2, 0.2, C_LEG, 4));
    parts.push(part(new THREE.CylinderGeometry(1.1, 1.3, 0.5, 7), C_LEG, foot[0], 0.25, foot[2]));
  }
  // the crew mast holds the dish and no lamp: the nose is higher
  const mast = crewMast(6.5, -6.5, 10, 3.5, false);
  parts.push(...mast.parts);
  return { parts, lamp: at(m, 0, top + 5.9, 0), camp: [-6, -6] };
}

// A lifting body that came in on its belly. The nose points to +x. The top is white tile and the
// belly is burnt, so the body reads as a spaceplane at any range. The left wing snapped off and lies
// on the ground. The climb tank rides as a hump on the back, and one of the three bells split.
function spaceplane() {
  const body = [];
  const R = [0, 0, -Math.PI / 2];              // the axis of a cylinder along +x
  body.push(partS(new THREE.CylinderGeometry(1.5, 3.0, 14, 8), C_PANEL, [0, 1.65, 0], R, [0.55, 1, 1]));
  body.push(partS(new THREE.ConeGeometry(1.5, 4, 8), C_PANEL, [9, 1.65, 0], R, [0.55, 1, 1]));
  body.push(part(new THREE.BoxGeometry(13, 0.4, 4.4), C_BURN, -0.5, 0.35, 0));
  body.push(part(new THREE.BoxGeometry(2.4, 0.5, 1.9), C_GLASS, 5.4, 2.35, 0, 0, 0, -0.22));
  body.push(partS(new THREE.CylinderGeometry(1.1, 1.3, 7, 8), C_HULL, [-1.5, 2.7, 0], R, [0.7, 1, 1]));
  body.push(part(plate([[3, 0], [-6, 0], [-6.2, 6.5]], 0.35), C_PANEL, 0, 0.9, 2.2, Math.PI / 2 - 0.12, 0, 0));
  body.push(part(plate([[3, 0], [-6, 0], [-5.2, 2.6], [-1.5, 2.2]], 0.35), C_PANEL, 0, 0.9, -2.2, -Math.PI / 2, 0, 0));
  for (const s of [1, -1]) {
    body.push(part(plate([[0, 0], [-3.4, 0], [-3.8, 3.6]], 0.3), C_HULL, -3.6, 2.2, 1.5 * s, -0.35 * s, 0, 0));
  }
  const bell = () => bellGeo(1.0, 0.45, 1.6);
  body.push(part(bell(), C_HULL_DARK, -7.6, 2.2, 0.95, 0, 0, Math.PI / 2));
  body.push(part(bell(), C_HULL_DARK, -7.6, 2.2, -0.95, 0, 0, Math.PI / 2));
  body.push(part(bell(), C_BURN, -7.4, 0.95, 0, 0.35, 0.2, Math.PI / 2 + 0.25));
  pose(body, poseMatrix([0, 0, 0], [-0.1, 0.15, 0]));   // it leans onto the broken wing
  const parts = [...body];
  parts.push(part(plate([[0, 0], [-4, 0], [-3.4, 4.2]], 0.35), C_PANEL, -3.5, 0.25, -8.5, Math.PI / 2, 0.6, 0));
  const mast = crewMast(5.5, -7);
  parts.push(...mast.parts);
  return { parts, lamp: mast.lamp, camp: [6, 7] };
}

// A gumdrop with a rotor head. The rotors brought it down through the air; the bell under the heat
// shield is for the one climb. It fell over, the base to -x and the rotor head to +x. One blade
// stands straight up, and the crew hung the beacon on its tip.
function rotor() {
  const body = [];
  body.push(part(new THREE.CylinderGeometry(3.8, 3.8, 0.6, 10), C_BURN, 0, 0.3, 0));
  body.push(part(new THREE.CylinderGeometry(1.7, 3.6, 5.4, 10), C_HULL, 0, 3.3, 0));
  body.push(part(new THREE.CylinderGeometry(3.62, 3.62, 1.0, 10), C_PANEL, 0, 1.4, 0));   // the tank band
  body.push(part(bellGeo(0.75, 1.9, 2.2, 10), C_HULL_DARK, 0, -1.1, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4;
    body.push(part(new THREE.BoxGeometry(0.9, 0.7, 0.2), C_GLASS, 2.35 * Math.cos(a), 4.2, 2.35 * Math.sin(a), 0, -a + Math.PI / 2, 0));
  }
  body.push(part(new THREE.CylinderGeometry(0.6, 0.8, 1.4, 8), C_HULL_DARK, 0, 6.7, 0));
  body.push(part(new THREE.CylinderGeometry(1.1, 1.1, 0.5, 8), C_LEG, 0, 7.5, 0));
  const m = poseMatrix([-3.5, 3.7, 0], [0, 0, -1.4]);   // on its side, the rim of the shield on the ground
  pose(body, m);
  const H = at(m, 0, 7.5, 0);
  const parts = [...body];
  const blade = (a, b) => strut(a, b, 0.4, 0.28, C_PANEL, 4);
  const tip = [H[0] - 0.5, 16.5, 0.6];
  parts.push(blade(H, tip));
  parts.push(blade(H, [H[0] + 0.4, 2.2, 5.6]), blade([H[0] + 0.4, 2.2, 5.6], [H[0] + 1.6, 0.3, 10.5]));
  parts.push(blade(H, [H[0] - 0.3, 0.4, -9.8]));
  parts.push(blade(H, [H[0] + 0.2, 1.4, -0.4]));
  parts.push(blade([7.5, 0.3, 4.5], [10.5, 0.3, -1.5]));   // the piece that broke off
  parts.push(strut([-3.2, 1.5, 2.8], [-6.2, 0.3, 4.8], 0.3, 0.25, C_LEG, 5));
  parts.push(strut([-3.2, 1.5, -2.8], [-6.0, 0.3, -5.0], 0.3, 0.25, C_LEG, 5));
  parts.push(part(new THREE.BoxGeometry(0.8, 0.6, 0.8), C_HULL_DARK, tip[0], tip[1] - 0.2, tip[2]));
  return { parts, lamp: [tip[0], tip[1] + 0.5, tip[2]], camp: [-4.5, -9] };
}

// A crew sphere on a ring tank, the bell under the sphere, three tall legs. The leg on the -z side
// buckled at the knee, so the ring leans toward it. The mast of the crew stands to one side.
function tripod() {
  const up = [];
  up.push(part(new THREE.IcosahedronGeometry(2.7, 1), C_PANEL, 0, 10.8, 0));
  up.push(part(new THREE.BoxGeometry(1.8, 0.7, 0.4), C_GLASS, 0, 11.4, 2.55, -0.2, 0, 0));
  up.push(part(new THREE.BoxGeometry(1.2, 1.6, 0.4), C_HULL_DARK, 2.3, 10.2, 1.2, 0, 1.1, 0));   // the hatch
  up.push(part(new THREE.TorusGeometry(3.7, 1.15, 6, 12), C_HULL, 0, 9.0, 0, Math.PI / 2, 0, 0));
  up.push(part(bellGeo(0.6, 1.7, 2.6, 10), C_HULL_DARK, 0, 6.6, 0));
  up.push(part(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8), C_BURN, 0, 8.2, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3 + Math.PI / 6;
    up.push(strut([3.7 * Math.cos(a), 9.0, 3.7 * Math.sin(a)], [0.8 * Math.cos(a), 8.6, 0.8 * Math.sin(a)], 0.22, 0.22, C_LEG, 4));
  }
  const m = poseMatrix([0, -1.1, 0], [-0.26, 0, 0]);   // the lean toward -z
  pose(up, m);
  const parts = [...up];
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
    const T = at(m, 3.7 * Math.cos(a), 9.0, 3.7 * Math.sin(a));
    const pad = [7.4 * Math.cos(a), 0.35, 7.4 * Math.sin(a)];
    if (i < 2) {
      parts.push(strut(T, pad, 0.5, 0.35, C_LEG, 6));
    } else {
      pad[0] -= 0.8; pad[2] -= 0.6;
      const knee = [T[0] * 1.35, 2.6, T[2] * 1.2];
      parts.push(strut(T, knee, 0.5, 0.45, C_LEG, 6), strut(knee, pad, 0.45, 0.35, C_BURN, 6));
    }
    parts.push(part(new THREE.CylinderGeometry(1.4, 1.6, 0.6, 8), C_LEG, pad[0], 0.3, pad[2]));
  }
  const mast = crewMast(-2.5, -9.2);
  parts.push(...mast.parts);
  return { parts, lamp: mast.lamp, camp: [7.4, 4.2] };
}
