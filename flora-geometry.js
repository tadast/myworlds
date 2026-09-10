// myworlds — the shape of one plant.
//
// The globe and the ground draw the same plants. The globe scales them to a fraction of the
// planet radius. The ground scales them to metres. So the shape lives here, and app.js and
// ground-flora.js both import it.
//
// A plant stands about one unit tall with its base at the origin and y up. The exact extent
// differs a little per kind, so a caller that needs true metres reads the bounding box.
//
// Issue 21 added the alien kinds. A patch used to grow two kinds of one shape each, so a ground
// view read as a field of copies. The kinds below give a patch a tower taller than any tree, a
// spindle, a breathing sac, a crystal that grows, a tuft of grass, a fan, a pod, a stack, and one
// colossus that stands over the whole patch. See docs/issues/21-alien-flora.md.
import * as THREE from 'three';
import { mergeGeos, M4 } from './fauna.js';

// the kind codes the worker writes into the flora array
export const FLORA = {
  TREE: 0, PINE: 1, CACTUS: 2, CRYSTAL: 3, MUSHROOM: 4, BOULDER: 5, PALM: 6,
  TOWER: 7, SPINDLE: 8, PUFF: 9, SHARD: 10, GRASS: 11, COLOSSUS: 12, FAN: 13, POD: 14, STACK: 15,
};
export const FLORA_KINDS = 16;

// How one kind behaves past its shape. ground-flora.js reads this table.
//   glow  the emissive share of the near material
//   sway  how far the wind bends the top of the plant
//   pulse how far the body breathes in and out
//   lod   the multiplier on the LOD distance. A tall plant must stay a mesh much further out,
//         because a card cannot carry a body that fills the screen.
//   cut   the multiplier on the draw distance
//   card  the pixels of the baked card. It also sets the nearest a card of this kind may come:
//         ground-flora.js keeps a plant a mesh until its picture would be magnified. Issue 22.
//   lean  how far one plant may lean away from the ground normal, in radians
//   flat  how far the width of one plant may differ from its height
const D = { glow: 0, sway: 0.3, pulse: 0, lod: 1, cut: 1, card: 96, lean: 0.08, flat: 0.14 };
const S = (o) => Object.assign({}, D, o);
export const FLORA_STYLE = [
  S({ sway: 0.35, lean: 0.12, flat: 0.18 }),                                   // 0 tree
  S({ sway: 0.22, lean: 0.07, flat: 0.12 }),                                   // 1 pine
  S({ sway: 0.05, lean: 0.05, flat: 0.16 }),                                   // 2 cactus
  S({ glow: 0.35, sway: 0, pulse: 0.3, lean: 0.22, flat: 0.3 }),               // 3 crystal
  S({ sway: 0.14, lean: 0.18, flat: 0.26 }),                                   // 4 mushroom
  S({ sway: 0, lean: 0.5, flat: 0.35 }),                                       // 5 boulder
  S({ sway: 0.6, lean: 0.2, flat: 0.14 }),                                     // 6 palm
  S({ glow: 0.14, sway: 0.28, pulse: 0.1, lod: 3, cut: 1.4, card: 160, lean: 0.1, flat: 0.22 }),  // 7 tower
  S({ glow: 0.2, sway: 1, lean: 0.3, flat: 0.3, lod: 1.4 }),                   // 8 spindle
  S({ glow: 0.22, sway: 0.25, pulse: 1, lean: 0.12, flat: 0.28 }),             // 9 puff
  S({ glow: 0.55, sway: 0, pulse: 0.45, lod: 1.3, lean: 0.3, flat: 0.3 }),     // 10 shard
  S({ sway: 0.9, lod: 0.3, cut: 0.25, card: 48, lean: 0.25, flat: 0.3 }),                // 11 grass
  S({ glow: 0.18, sway: 0.14, pulse: 0.12, lod: 14, cut: 3, card: 192, lean: 0.03, flat: 0.16 }), // 12 colossus
  S({ sway: 0.85, lean: 0.35, flat: 0.3 }),                                    // 13 fan
  S({ glow: 0.12, sway: 0.7, pulse: 0.55, lean: 0.28, flat: 0.24 }),           // 14 pod
  S({ sway: 0.1, pulse: 0.18, lean: 0.14, flat: 0.2 }),                        // 15 stack
];

// ---------------------------------------------------------------- shape helpers
const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

// The direction of a part that leans `tilt` radians from up and turns `turn` radians about y.
function dirOf(tilt, turn) {
  return _dir.set(Math.sin(tilt) * Math.cos(turn), Math.cos(tilt), Math.sin(tilt) * Math.sin(turn));
}

// The matrix of a part of length `len` that stands on (x, y0, z) and leans away from up. Three.js
// builds a cylinder and a cone on the y axis with the centre at the origin, so the matrix puts
// the centre half a length along the direction.
function tilted(len, tilt, turn, x = 0, y0 = 0, z = 0) {
  const d = dirOf(tilt, turn);
  _q.setFromUnitVectors(UP, d);
  _p.set(x + d.x * len / 2, y0 + d.y * len / 2, z + d.z * len / 2);
  return new THREE.Matrix4().compose(_p, _q, _one);
}

// The far end of the same part.
function tipOf(len, tilt, turn, x = 0, y0 = 0, z = 0) {
  const d = dirOf(tilt, turn);
  return [x + d.x * len, y0 + d.y * len, z + d.z * len];
}

// One shape per kind, so a kind always builds the same plant. The instance carries the variety:
// ground-flora.js gives every plant its own size, lean, width, and tint.
function seeded(k) {
  let s = ((k + 1) * 2654435761) >>> 0;
  return () => {
    s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0;
    return s / 4294967296;
  };
}
const rr = (r, a, b) => a + (b - a) * r();

// A world hands three colours: canopy, canopy2, trunk. An alien plant needs more, so the module
// turns those three into a small palette. The hue turn keeps the world colour and adds a colour
// the reader did not see on the globe.
//
// All three calls name sRGB. `getHSL` reads the working space by default, which is linear, while
// `setHSL` and `getHex` write sRGB by default. The default pair therefore treats a linear number
// as an sRGB one and every derived colour came back nearly black. Issue 21.
const _col = new THREE.Color(), _hsl = { h: 0, s: 0, l: 0 };
function shift(base, dh, ds, dl) {
  _col.set(base).getHSL(_hsl, THREE.SRGBColorSpace);
  _col.setHSL(
    (_hsl.h + dh + 1) % 1,
    Math.min(1, Math.max(0, _hsl.s + ds)),
    Math.min(0.96, Math.max(0.04, _hsl.l + dl)),
    THREE.SRGBColorSpace);
  return _col.getHex(THREE.SRGBColorSpace);
}

// One plant. `variant` is the flora signature of the world: two planets with the same kind build
// two different plants from it, because the signature moves the proportions and the hues before
// the shape is laid out. A kind on one world always builds the same plant, because the signature
// is drawn from the seed of the world and nothing else. Issue 22.
export function floraGeometry(kind, fc, variant = 0) {
  const { canopy, canopy2, trunk } = fc;
  const r = seeded(((kind + 1) * 2654435761) ^ variant);

  // The signature of this world. Drawn first, so the shape below always reads the same numbers.
  const stout = rr(r, 0.65, 1.5);    // how thick a stalk, a stem, and a trunk stand
  const crown = rr(r, 0.72, 1.4);    // how wide a cap, a crown, and a blade spread
  const squat = rr(r, 0.6, 1.45);    // how flat a cap and a plate sit
  const many = rr(r, 0.7, 1.55);     // how many parts a plant of many parts carries
  const splay = rr(r, 0.55, 1.55);   // how far the parts lean away from the axis
  const lit = r() < 0.6;             // whether the plant carries a node that glows
  const turn = rr(r, -0.14, 0.14);   // how far the derived hues turn from the palette of the world
  const count = (n) => Math.max(2, Math.round(n * many));

  const accent = shift(canopy, 0.42 + turn, 0.2, 0.06);   // the alien complement of the leaf colour
  const glow = shift(canopy2, -0.1 + turn, 0.32, 0.2);    // the colour a body lights itself with
  const pale = shift(trunk, 0.02 + turn * 0.4, -0.12, 0.24);  // a bleached stalk
  const deep = shift(canopy, 0.07 + turn * 0.5, 0.14, -0.2);  // the shade under the crown

  const parts = [];
  const add = (geo, color, matrix) => parts.push({ geo, color, matrix });
  // a node of light on the crown, on the worlds whose signature carries one
  const node = (x, y, z, rad) => { if (lit) add(new THREE.IcosahedronGeometry(rad, 0), glow, M4(x, y, z)); };

  switch (kind) {
    case 0: // round tree, with a second lump so no two crowns read the same
      add(new THREE.CylinderGeometry(0.1 * stout, 0.14 * stout, 0.45, 5), trunk, M4(0, 0.22, 0));
      add(new THREE.IcosahedronGeometry(0.5 * crown, 0), canopy, M4(0, 0.75, 0, 1, 0.9 * squat, 1, 0.3, 0.2));
      add(new THREE.IcosahedronGeometry(0.26 * crown, 0), deep, M4(0.24 * splay, 0.54, -0.15 * splay, 1, 0.85, 1, 0.5, -0.4));
      break;

    case 1: // pine, with a bare spire on top
      add(new THREE.CylinderGeometry(0.08 * stout, 0.12 * stout, 0.35, 5), trunk, M4(0, 0.17, 0));
      add(new THREE.ConeGeometry(0.42 * crown, 0.6, 6), canopy, M4(0, 0.5, 0));
      add(new THREE.ConeGeometry(0.3 * crown, 0.5, 6), canopy, M4(0, 0.85, 0));
      add(new THREE.ConeGeometry(0.11 * crown, 0.3, 5), deep, M4(0, 1.18, 0));
      break;

    case 2: // cactus, two arms and a bud
      add(new THREE.CylinderGeometry(0.16 * stout, 0.18 * stout, 1, 6), canopy, M4(0, 0.5, 0));
      add(new THREE.CylinderGeometry(0.1 * stout, 0.1 * stout, 0.45, 5), canopy, M4(0.22 * splay, 0.6, 0, 1, 1, 1, 0, 0.9));
      add(new THREE.CylinderGeometry(0.08 * stout, 0.08 * stout, 0.34, 5), canopy, M4(-0.19 * splay, 0.4, 0.05, 1, 1, 1, 0, -0.95));
      add(new THREE.IcosahedronGeometry(0.09 * crown, 0), accent, M4(0, 1.02, 0));
      break;

    case 3: { // crystal, a cluster of shards on a low base
      add(new THREE.DodecahedronGeometry(0.2 * crown, 0), deep, M4(0, 0.05, 0, 1.3, 0.4, 1.3));
      const n = count(3);
      for (let i = 0; i < n; i++) {
        const h = rr(r, 1.6, 2.6), w = rr(r, 0.11, 0.3) * crown;
        const a = (i / n) * Math.PI * 2 + rr(r, -0.5, 0.5);
        const rd = i === 0 ? 0 : rr(r, 0.12, 0.26) * splay;
        add(new THREE.OctahedronGeometry(w, 0), i % 3 === 0 ? glow : canopy,
          M4(Math.cos(a) * rd, 0.24 + w * h * 0.5, Math.sin(a) * rd, 1, h, 1, rr(r, -0.3, 0.3), rr(r, -0.5, 0.5)));
      }
      break;
    }

    case 4: // mushroom, with gills and a smaller neighbour on the same root
      add(new THREE.CylinderGeometry(0.12 * stout, 0.16 * stout, 0.6, 5), trunk, M4(0, 0.3, 0));
      add(new THREE.ConeGeometry(0.42 * crown, 0.16, 9), deep, M4(0, 0.64, 0, 1, 1, 1, Math.PI));
      add(new THREE.IcosahedronGeometry(0.5 * crown, 1), canopy2, M4(0, 0.7, 0, 1, 0.55 * squat, 1));
      add(new THREE.CylinderGeometry(0.06 * stout, 0.08 * stout, 0.28, 5), trunk, M4(0.3 * splay, 0.14, 0.16 * splay));
      add(new THREE.IcosahedronGeometry(0.22 * crown, 1), canopy2, M4(0.3 * splay, 0.32, 0.16 * splay, 1, 0.55 * squat, 1));
      break;

    case 5: // boulder, with a chip beside it
      add(new THREE.DodecahedronGeometry(0.4 * crown, 0), canopy2, M4(0, 0.25, 0, 1.2, 0.8 * squat, 1, 0.4, 0.3));
      add(new THREE.DodecahedronGeometry(0.16 * crown, 0), deep, M4(0.36 * splay, 0.09, -0.2 * splay, 1.1, 0.7, 1, 0.2, -0.6));
      break;

    case 6: { // palm, a ring of fronds and a fruit cluster
      add(new THREE.CylinderGeometry(0.07 * stout, 0.11 * stout, 0.8, 5), trunk, M4(0.05, 0.4, 0, 1, 1, 1, 0, -0.12));
      const n = count(4);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rr(r, -0.2, 0.2);
        const droop = i % 2 ? Math.PI : 0;
        add(new THREE.ConeGeometry(rr(r, 0.32, 0.46) * crown, rr(r, 0.18, 0.26), 5), i % 3 === 0 ? deep : canopy,
          M4(0.12, 0.72 + rr(r, 0, 0.14), 0, 1, 1, 1, droop, a));
      }
      add(new THREE.IcosahedronGeometry(0.07 * crown, 0), accent, M4(0.16, 0.69, 0.06));
      break;
    }

    case 7: { // tower mushroom: the tallest plant of a patch, over the crown of any tree
      add(new THREE.CylinderGeometry(0.045 * stout, 0.1 * stout, 0.92, 7), pale, M4(0, 0.46, 0));
      add(new THREE.CylinderGeometry(0.15 * crown, 0.055 * stout, 0.05, 9), pale, M4(0, 0.6, 0));   // the ring
      add(new THREE.ConeGeometry(0.4 * crown, 0.24, 11), deep, M4(0, 0.94, 0, 1, 1, 1, Math.PI));   // the gills
      add(new THREE.IcosahedronGeometry(0.44 * crown, 1), canopy2, M4(0, 1, 0, 1, 0.42 * squat, 1));
      node(0, 1.16, 0, 0.06);
      // one shorter stalk beside it, so a stand of towers holds two heights
      const L = 0.52, tilt = 0.42 * splay, tn = 1.1;
      add(new THREE.CylinderGeometry(0.028 * stout, 0.05 * stout, L, 5), pale, tilted(L, tilt, tn, 0, 0.03, 0));
      const t = tipOf(L, tilt, tn, 0, 0.03, 0);
      add(new THREE.ConeGeometry(0.16 * crown, 0.09, 8), deep, M4(t[0], t[1] - 0.01, t[2], 1, 1, 1, Math.PI));
      add(new THREE.IcosahedronGeometry(0.17 * crown, 1), canopy2, M4(t[0], t[1] + 0.02, t[2], 1, 0.45 * squat, 1));
      break;
    }

    case 8: { // spindle: bare whips with a bud at the tip, thin enough to read as wire
      add(new THREE.IcosahedronGeometry(0.07 * crown, 0), deep, M4(0, 0.04, 0, 1.4, 0.6, 1.4));
      const n = count(6);
      for (let i = 0; i < n; i++) {
        const L = rr(r, 0.55, 1);
        const tilt = rr(r, 0.04, 0.34) * splay;
        const tn = (i / n) * Math.PI * 2 + rr(r, -0.3, 0.3);
        add(new THREE.CylinderGeometry(0.004 * stout, 0.016 * stout, L, 3), pale, tilted(L, tilt, tn, 0, 0.03, 0));
        const t = tipOf(L, tilt, tn, 0, 0.03, 0);
        add(new THREE.OctahedronGeometry(rr(r, 0.02, 0.045) * crown, 0), glow, M4(t[0], t[1], t[2]));
      }
      break;
    }

    case 9: { // puff: a stem and a knot of sacs that breathe. FLORA_STYLE gives it the pulse.
      add(new THREE.CylinderGeometry(0.05 * stout, 0.08 * stout, 0.32, 5), trunk, M4(0, 0.16, 0));
      const n = count(4);
      for (let i = 0; i < n; i++) {
        const rad = rr(r, 0.15, 0.32) * crown;
        const a = (i / n) * Math.PI * 2 + rr(r, -0.6, 0.6);
        const rd = i === 0 ? 0 : rr(r, 0.08, 0.22) * splay;
        add(new THREE.IcosahedronGeometry(rad, 1), canopy2,
          M4(Math.cos(a) * rd, 0.5 + rr(r, 0, 0.4), Math.sin(a) * rd, 1, 0.86 * squat, 1));
      }
      node(0.02, 1.02, -0.02, 0.08 * crown);
      break;
    }

    case 10: { // shard: a crystal that is still growing, blades of every length out of one seat
      add(new THREE.DodecahedronGeometry(0.22 * crown, 0), deep, M4(0, 0.05, 0, 1.3, 0.35, 1.3));
      const n = count(8);
      for (let i = 0; i < n; i++) {
        // The blade is an octahedron of radius 0.5 stretched on its own axis, so it reaches L from
        // its centre. The centre stands 0.85 L along the blade, so the root end stays buried and
        // the crystal reads as a body that pushes out of the ground.
        const L = rr(r, 0.14, 0.5);
        const w = (0.05 + L * 0.16) * crown;
        const tilt = rr(r, 0.05, 0.55) * splay;
        const tn = (i / n) * Math.PI * 2 + rr(r, -0.4, 0.4);
        const d = dirOf(tilt, tn);
        _q.setFromUnitVectors(UP, d);
        _p.set(d.x * L * 0.85, 0.04 + d.y * L * 0.85, d.z * L * 0.85);
        const m = new THREE.Matrix4().compose(_p, _q, new THREE.Vector3(w, L / 0.5, w));
        add(new THREE.OctahedronGeometry(0.5, 0), i % 3 === 0 ? glow : canopy, m);
      }
      break;
    }

    case 11: { // grass: one tuft of open blades. The cheapest kind, because a patch holds many.
      // The blades take the lit end of the palette. The tuft stands on the ground colour and it
      // must read against it, and `deep` sank into the ground on every green world.
      const blade = shift(canopy, -0.02 + turn * 0.3, -0.05, 0.12);
      const n = count(5);
      for (let i = 0; i < n; i++) {
        const L = rr(r, 0.5, 1);
        const tilt = rr(r, 0.1, 0.5) * splay;
        const tn = (i / n) * Math.PI * 2 + rr(r, -0.5, 0.5);
        add(new THREE.ConeGeometry(0.035 * stout, L, 3, 1, true), i % 3 === 0 ? canopy : blade, tilted(L, tilt, tn));
      }
      break;
    }

    case 12: { // colossus: one body per patch, taller than the fog, with roots and a hung crown
      add(new THREE.CylinderGeometry(0.07 * stout, 0.2 * stout, 0.74, 8), trunk, M4(0, 0.37, 0));
      const roots = count(5);
      for (let i = 0; i < roots; i++) {                 // the buttress roots
        const tn = (i / roots) * Math.PI * 2 + 0.4;
        const L = rr(r, 0.24, 0.4);
        add(new THREE.CylinderGeometry(0.03 * stout, 0.1 * stout, L, 5), trunk, tilted(L, 2.1, tn, 0, 0.22, 0));
      }
      add(new THREE.IcosahedronGeometry(0.4 * crown, 1), canopy, M4(0, 0.82, 0, 1, 0.5 * squat, 1));
      add(new THREE.IcosahedronGeometry(0.3 * crown, 1), deep, M4(0.22 * splay, 0.92, 0.12 * splay, 1, 0.55 * squat, 1));
      add(new THREE.IcosahedronGeometry(0.24 * crown, 1), canopy, M4(-0.2 * splay, 0.95, -0.14 * splay, 1, 0.6 * squat, 1));
      add(new THREE.IcosahedronGeometry(0.1 * crown, 1), glow, M4(0, 1.02, 0));
      const tend = count(7);
      for (let i = 0; i < tend; i++) {                  // the tendrils under the crown
        const tn = (i / tend) * Math.PI * 2;
        const L = rr(r, 0.2, 0.42);
        const x = Math.cos(tn) * 0.3 * crown, z = Math.sin(tn) * 0.3 * crown;
        add(new THREE.CylinderGeometry(0.004, 0.018 * stout, L, 3), accent, M4(x, 0.78 - L / 2, z));
      }
      break;
    }

    case 13: { // fan: a stem and one ribbed blade that turns to the sky
      // The blade is thin, not flat. A blade of 0.09 of its width read as paper from the side, and
      // the reader called the plant two-dimensional. Issue 22 gives it a body and a second blade
      // across the first, so it holds a shape from every angle.
      add(new THREE.CylinderGeometry(0.025 * stout, 0.05 * stout, 0.4, 5), trunk, M4(0, 0.2, 0));
      const thick = rr(r, 0.2, 0.42);
      add(new THREE.ConeGeometry(0.42 * crown, 0.7, 7), canopy, M4(0, 0.68, 0, 1, 1, thick, -0.2));
      add(new THREE.ConeGeometry(0.3 * crown, 0.5, 7), deep, M4(0.05, 0.6, 0.03, 1, 1, thick * 0.8, -0.2, 0.5));
      add(new THREE.ConeGeometry(0.26 * crown, 0.44, 7), canopy, M4(-0.04, 0.58, -0.02, thick * 0.8, 1, 1, 0.18, -0.4));
      const ribs = count(3);
      for (let i = 0; i < ribs; i++) {                  // the ribs across the blade
        add(new THREE.CylinderGeometry(0.008 * stout, 0.012 * stout, 0.55, 3), pale,
          M4(-0.16 + i * (0.32 / Math.max(ribs - 1, 1)), 0.66, 0.01, 1, 1, 1, -0.2, (i - (ribs - 1) / 2) * 0.22));
      }
      break;
    }

    case 14: { // pod: a leaning stalk with sacs hung under it
      const L = 0.86, tilt = 0.22 * splay, tn = 0.7;
      add(new THREE.CylinderGeometry(0.022 * stout, 0.05 * stout, L, 5), trunk, tilted(L, tilt, tn));
      const n = count(5);
      for (let i = 0; i < n; i++) {
        const f = 0.35 + i * (0.8 / n);
        const a = tipOf(L * f, tilt, tn);
        const drop = rr(r, 0.08, 0.2);
        add(new THREE.CylinderGeometry(0.005, 0.008 * stout, drop, 3), pale, M4(a[0], a[1] - drop / 2, a[2]));
        add(new THREE.IcosahedronGeometry(rr(r, 0.07, 0.13) * crown, 1), canopy2,
          M4(a[0], a[1] - drop - 0.06, a[2], 1, 1.5, 1));
      }
      const end = tipOf(L, tilt, tn);
      node(end[0], end[1], end[2], 0.05 * crown);
      break;
    }

    case 15: { // stack: flat plates balanced on one another, the shape of a cairn that grew
      let y = 0, rad = 0.34 * crown;
      const n = count(6);
      for (let i = 0; i < n; i++) {
        const th = rr(r, 0.05, 0.11) * squat;
        add(new THREE.CylinderGeometry(rad, rad * 1.06, th, 7), i % 2 ? canopy2 : deep,
          M4(rr(r, -0.05, 0.05) * splay, y + th / 2, rr(r, -0.05, 0.05) * splay, 1, 1, 1,
            rr(r, -0.1, 0.1) * splay, rr(r, -0.1, 0.1) * splay));
        y += th + rr(r, 0.06, 0.12);
        rad *= rr(r, 0.78, 0.94);
      }
      node(0, y + 0.05, 0, 0.07 * crown);
      break;
    }

    default:
      return null;
  }
  return mergeGeos(parts);
}
