// myworlds — fauna: creature geometry, shader animation, steering, lore, and the inspector card.
import * as THREE from 'three';

// Kinds match FAUNA in worker.js.
export const KIND = { STILTER: 0, DRIFTER: 1, SHELLBACK: 2, LANTERN: 3, MOSSBACK: 4, SWARM: 5, TIDEWORM: 6, SKYWHALE: 7 };
export const BASE_SCALE = 0.011;

// Per kind: leash radius (world units), cruise speed, turn amplitude, pause habit, flies, casts shadow
export const MOVE = [
  { leash: 0.03, speed: 0.011, turn: 1.4, pause: 0.55, flies: false, shadow: true },   // stilter: walks, stops to graze
  { leash: 0.045, speed: 0.006, turn: 0.6, pause: 0, flies: true, shadow: true },      // drifter: slow meander on the wind
  { leash: 0.018, speed: 0.0035, turn: 1.0, pause: 0.4, flies: false, shadow: true },  // shellback: creeps, long rests
  { leash: 0.02, speed: 0.007, turn: 0.9, pause: 0.7, flies: false, shadow: true },    // lantern: stands still, then stalks
  { leash: 0.022, speed: 0.005, turn: 0.8, pause: 0.6, flies: false, shadow: true },   // mossback: ambles, grazes
  { leash: 0.035, speed: 0.02, turn: 2.6, pause: 0, flies: true, shadow: false },      // swarm: loops and darts
  { leash: 0, speed: 0, turn: 0, pause: 0, flies: false, shadow: true },               // tideworm: rooted
  { leash: 0.16, speed: 0.03, turn: 0.35, pause: 0, flies: true, shadow: true },       // skywhale: long slow arcs
];

export const LORE = [
  {
    name: 'Sail-backed stilt-strider', latin: 'Velatrix altipes',
    habitat: 'Open meadows and dune flats', size: '5 m at the shoulder', diet: 'Seed heads, grazed from the tops of the grass', temperament: 'Placid, herd-bound',
    story: 'The sail is not for display. It is a living membrane threaded with vessels; on cold mornings the strider turns it broadside to the sun and steams. The eye stalks watch two horizons at once. A herd walks in silence for days, then, on some signal no one has recorded, every sail folds and the animals lie down in the grass until the wind changes.',
  },
  {
    name: 'Bladder drifter', latin: 'Aerocyst vagans',
    habitat: 'Lowland air, under thirty metres', size: '2 m sac, 4 m of tendril', diet: 'Airborne spores and whatever the tendrils catch', temperament: 'Patient',
    story: 'Born as a wet knot on a cliff face, a drifter inflates over a single night with gas from its own fermenting gut and lets go. It never lands again. The tendrils are sticky, patient, and slightly warm; anything that touches them is drawn up, slowly, into the vent. Old drifters rise too high, freeze, and come down as seed.',
  },
  {
    name: 'Shell crawler', latin: 'Testudo lithophaga',
    habitat: 'Dunes, cooled lava fields, tundra', size: '3 m', diet: 'Minerals licked from the rock', temperament: 'Indifferent',
    story: 'The plates are stone. The crawler eats rock, and what it cannot digest it presses into its back, layer on layer, so that an old crawler carries the geology of everywhere it has been. The spikes glow faintly at night: bacteria the crawler farms and feeds with its own heat. Nothing eats a crawler. Nothing has found a way in.',
  },
  {
    name: 'Lantern stalker', latin: 'Lucifer gracilis',
    habitat: 'Ice plains and ash fields', size: '6 m tall', diet: 'Anything drawn to the light', temperament: 'Still, then sudden',
    story: 'In the long dark the lantern is the only warm thing for miles, and every small creature knows it. The stalker stands perfectly still for hours. The light pulses in a rhythm that matches a sleeping heartbeat. When the snow shivers around its feet it bends, quickly, and the light goes out for a moment.',
  },
  {
    name: 'Moss-backed grazer', latin: 'Hortulus gravis',
    habitat: 'Forest floors', size: '8 m long', diet: 'Leaf litter and fallen fruit', temperament: 'Slow, tolerant',
    story: 'Nothing grows on a young mossback. The garden comes with age: spores caught in the ridges of the back, then moss, then the small trees whose roots reach down into the animal’s fat. The grazer feels the trees like fingers. When they wilt it walks to water. When they seed it stands in the wind and waits.',
  },
  {
    name: 'Shard swarm', latin: 'Coetus vitreus',
    habitat: 'Coasts and forest edges', size: 'Each shard a hand wide, the swarm ten metres', diet: 'Sugar from the core, which feeds on light', temperament: 'Restless',
    story: 'Each shard is a separate animal, blind and nearly mindless. The core is not. It is a single ancient organism that grows the shards from its own body and pays them in sugar to carry it from one patch of sun to the next. A swarm that loses its core scatters within the hour, and the shards lie down wherever they land.',
  },
  {
    name: 'Tide worm', latin: 'Lumbricus aestus',
    habitat: 'Beaches', size: '4 m exposed, far more below', diet: 'Filters the wet sand', temperament: 'Unaware',
    story: 'Only the arch is ever seen. The rest of the worm runs under the beach in a loop that can be a kilometre long, and one worm can raise a dozen arches to breathe. They rise with the tide and sink with it. Stand on the sand at the turn and you can feel it move.',
  },
  {
    name: 'Sky whale', latin: 'Cetus aetherius',
    habitat: 'Open ocean air and gas giant cloud decks', size: '40 m', diet: 'Cloud plankton and rain', temperament: 'Serene',
    story: 'The whale is mostly bladder, lifted by a warm gas it brews in a gut the size of a house. It sings through the belly, which glows with the song. Whales born over an ocean can never leave the planet. The ones in the clouds of a gas giant have never seen ground and have no word for down.',
  },
];

// ---------------------------------------------------------------- geometry helpers
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const cyl = (rt, rb, h, s = 5) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 5) => new THREE.ConeGeometry(r, h, s);
const dodeca = (r) => new THREE.DodecahedronGeometry(r, 0);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const M4 = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, ry = 0) =>
  new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz));
const _up = V3(0, 1, 0);
// a cylinder between two points
function seg(a, b, r, color, r2 = r, sides = 4, glow = 0) {
  const d = V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize());
  const m = new THREE.Matrix4().compose(V3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, V3(1, 1, 1));
  return { geo: cyl(r2, r, len, sides), color, matrix: m, glow };
}
const eye = (x, y, z, c, r = 0.035) => ({ geo: ico(r), color: c, matrix: M4(x, y, z), glow: 0.6 });

export function mergeGeos(parts) {
  // parts: [{geo, color, matrix, glow?}] → single non-indexed geometry with vertex colours + glow attribute
  const pos = [], nor = [], col = [], glo = [];
  const n = V3(), p = V3();
  for (const { geo, color, matrix, glow = 0 } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const pa = g.attributes.position, na = g.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const c = new THREE.Color(color);
    for (let i = 0; i < pa.count; i++) {
      p.fromBufferAttribute(pa, i).applyMatrix4(matrix);
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b); glo.push(glow);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('glow', new THREE.Float32BufferAttribute(glo, 1));
  return out;
}

// ---------------------------------------------------------------- creature geometry (unit height, base at origin, y up, faces +z)
export function faunaGeometry(kind, fc, flora) {
  const { body, body2, accent, glow } = fc;
  const moss = flora ? flora.canopy : accent;
  const trunk = flora ? flora.trunk : body2;
  const sand = fc.sand || body2;
  switch (kind) {
    case 0: { // stilt-strider: keeled body, jointed stilts with feet, neck, mandibles, ribbed sail
      const parts = [
        { geo: ico(0.2), color: body, matrix: M4(0, 0.82, 0, 1, 0.72, 1.5, 0.12, 0) },
        { geo: ico(0.1), color: body2, matrix: M4(0, 0.7, 0.05, 1, 0.5, 1.2) },              // keel
        seg([0, 0.86, 0.26], [0, 0.94, 0.42], 0.035, body2, 0.045),                        // neck
        { geo: ico(0.085), color: body2, matrix: M4(0, 0.95, 0.47, 0.8, 0.85, 1.3) },      // head
        { geo: cone(0.018, 0.12, 4), color: body2, matrix: M4(-0.035, 0.9, 0.56, 1, 1, 1, 1.5, 0) },
        { geo: cone(0.018, 0.12, 4), color: body2, matrix: M4(0.035, 0.9, 0.56, 1, 1, 1, 1.5, 0) },
        seg([-0.03, 1.0, 0.47], [-0.11, 1.15, 0.5], 0.012, body2),                          // eye stalks
        seg([0.03, 1.0, 0.47], [0.11, 1.15, 0.5], 0.012, body2),
        eye(-0.11, 1.16, 0.5, glow, 0.03), eye(0.11, 1.16, 0.5, glow, 0.03),
        { geo: cone(0.2, 0.42, 4), color: accent, matrix: M4(0, 1.1, -0.05, 0.1, 1, 1.4, -0.25, 0), glow: 0.45 },
        seg([0, 0.95, 0.18], [0, 1.28, 0.06], 0.008, body2, 0.006),                         // sail ribs
        seg([0, 0.96, -0.02], [0, 1.31, -0.1], 0.008, body2, 0.006),
        seg([0, 0.94, -0.2], [0, 1.22, -0.26], 0.008, body2, 0.006),
      ];
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
        const hip = [sx * 0.12, 0.74, sz * 0.16], knee = [sx * 0.24, 0.42, sz * 0.24], foot = [sx * 0.2, 0.02, sz * 0.2];
        parts.push(seg(hip, knee, 0.024, body2, 0.03), seg(knee, foot, 0.018, body2, 0.024));
        parts.push({ geo: ico(0.032), color: body2, matrix: M4(...knee) });
        parts.push({ geo: ico(0.04), color: body2, matrix: M4(foot[0], 0.015, foot[2], 1.2, 0.4, 1.4) });
      }
      return mergeGeos(parts);
    }
    case 1: { // drifter: main sac, two side sacs, vent, warm core, knotted tendrils
      const parts = [
        { geo: ico(0.3, 1), color: accent, matrix: M4(0, 0.46, 0, 1, 1.3, 1), glow: 0.35 },
        { geo: ico(0.12), color: accent, matrix: M4(-0.27, 0.52, 0.04, 1, 1.2, 1), glow: 0.25 },
        { geo: ico(0.1), color: accent, matrix: M4(0.26, 0.58, -0.05, 1, 1.2, 1), glow: 0.25 },
        { geo: cyl(0.1, 0.06, 0.09, 6), color: body2, matrix: M4(0, 0.07, 0) },
        { geo: ico(0.055), color: glow, matrix: M4(0, 0.02, 0), glow: 1 },
        { geo: ico(0.05), color: body2, matrix: M4(0, 0.85, 0.02) },                       // apex node
      ];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3, r0 = 0.08, r1 = 0.15 + (i % 2) * 0.05, len = 0.6 + (i % 3) * 0.08;
        const top = [Math.cos(a) * r0, 0.03, Math.sin(a) * r0], bot = [Math.cos(a) * r1, -len, Math.sin(a) * r1];
        parts.push(seg(top, bot, 0.009, body, 0.014, 3));
        if (i % 2 === 0) parts.push({ geo: ico(0.022), color: body2, matrix: M4((top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2) });
        parts.push({ geo: ico(0.016), color: glow, matrix: M4(...bot), glow: 0.8 });
      }
      return mergeGeos(parts);
    }
    case 2: { // shell crawler: three overlapping stone plates, glowing spikes, six feet, antennae
      const parts = [
        { geo: dodeca(0.36), color: body, matrix: M4(0, 0.33, 0.14, 1.1, 0.55, 1.0) },
        { geo: dodeca(0.33), color: body, matrix: M4(0, 0.3, -0.14, 1.0, 0.5, 0.9) },
        { geo: dodeca(0.28), color: body, matrix: M4(0, 0.26, -0.4, 0.85, 0.45, 0.8) },
        { geo: ico(0.28), color: body2, matrix: M4(0, 0.14, -0.05, 1, 0.4, 1.35) },
        { geo: ico(0.09), color: body2, matrix: M4(0, 0.2, 0.55, 1, 0.8, 1.3) },
        seg([-0.04, 0.26, 0.6], [-0.13, 0.44, 0.75], 0.008, body2), seg([0.04, 0.26, 0.6], [0.13, 0.44, 0.75], 0.008, body2),
        { geo: ico(0.02), color: glow, matrix: M4(-0.13, 0.45, 0.75), glow: 0.9 }, { geo: ico(0.02), color: glow, matrix: M4(0.13, 0.45, 0.75), glow: 0.9 },
        eye(-0.06, 0.26, 0.63, glow, 0.028), eye(0.06, 0.26, 0.63, glow, 0.028),
      ];
      for (const [z, h] of [[0.2, 0.62], [-0.05, 0.6], [-0.3, 0.52]]) parts.push({ geo: cone(0.06, 0.24, 4), color: accent, matrix: M4(0, h, z, 1, 1, 1, z * 0.6, 0), glow: 0.4 });
      for (const z of [0.3, 0, -0.3]) for (const sx of [-1, 1]) parts.push({ geo: cyl(0.03, 0.045, 0.14, 4), color: body2, matrix: M4(sx * 0.3, 0.07, z, 1, 1, 1, 0, sx * -0.3) });
      return mergeGeos(parts);
    }
    case 3: { // lantern stalker: spidery tripod with knees, segmented stalk, collar, glowing lure
      const parts = [
        { geo: ico(0.07), color: body2, matrix: M4(0, 0.5, 0) },
        seg([0, 0.5, 0], [0, 0.82, 0], 0.03, body, 0.04), seg([0, 0.82, 0], [0, 1.1, 0], 0.022, body, 0.03),
        { geo: ico(0.035), color: body2, matrix: M4(0, 0.82, 0) },
        { geo: cyl(0.09, 0.055, 0.07, 6), color: body2, matrix: M4(0, 1.11, 0) },
        { geo: ico(0.13), color: glow, matrix: M4(0, 1.28, 0, 1, 1.4, 1), glow: 1 },
      ];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5, c = Math.cos(a), s = Math.sin(a);
        const hip = [c * 0.05, 0.48, s * 0.05], knee = [c * 0.22, 0.36, s * 0.22], foot = [c * 0.2, 0.01, s * 0.2];
        parts.push(seg(hip, knee, 0.014, body2, 0.018), seg(knee, foot, 0.011, body2, 0.014), { geo: ico(0.022), color: body2, matrix: M4(...knee) });
        parts.push({ geo: ico(0.02), color: glow, matrix: M4(c * 0.1, 1.12, s * 0.1), glow: 0.7 });
      }
      return mergeGeos(parts);
    }
    case 4: { // moss-backed grazer: heavy body, belly, thick legs with feet, tusked head, tail, garden on the back
      const parts = [
        { geo: dodeca(0.42), color: body, matrix: M4(0, 0.56, 0, 1, 0.7, 1.35, 0.05, 0) },
        { geo: ico(0.32), color: body2, matrix: M4(0, 0.42, 0.02, 1.1, 0.5, 1.2) },
        { geo: ico(0.16), color: body2, matrix: M4(0, 0.5, 0.72, 0.9, 0.8, 1.3) },
        { geo: cone(0.03, 0.2, 4), color: glow, matrix: M4(-0.1, 0.4, 0.9, 1, 1, 1, 1.3, 0), glow: 0.3 },
        { geo: cone(0.03, 0.2, 4), color: glow, matrix: M4(0.1, 0.4, 0.9, 1, 1, 1, 1.3, 0), glow: 0.3 },
        eye(-0.09, 0.58, 0.83, glow), eye(0.09, 0.58, 0.83, glow),
        { geo: cone(0.05, 0.28, 4), color: body2, matrix: M4(0, 0.58, -0.72, 1, 1, 1, -1.5, 0) },
        { geo: ico(0.16), color: moss, matrix: M4(-0.12, 0.86, -0.1, 1, 0.7, 1) },
        { geo: ico(0.13), color: moss, matrix: M4(0.15, 0.84, 0.14, 1, 0.7, 1) },
        { geo: ico(0.11), color: moss, matrix: M4(0.05, 0.86, -0.34, 1, 0.7, 1) },
        { geo: cyl(0.02, 0.025, 0.2, 4), color: trunk, matrix: M4(-0.05, 1.0, -0.15) },
        { geo: ico(0.1), color: moss, matrix: M4(-0.05, 1.14, -0.15) },
        { geo: cone(0.05, 0.22, 4), color: accent, matrix: M4(0.2, 1.0, 0.05), glow: 0.35 },
        { geo: cone(0.04, 0.16, 4), color: accent, matrix: M4(-0.2, 0.95, 0.12), glow: 0.35 },
      ];
      for (const [x, z] of [[-0.25, 0.38], [0.25, 0.38], [-0.27, -0.36], [0.27, -0.36]]) {
        parts.push({ geo: cyl(0.07, 0.09, 0.4, 5), color: body2, matrix: M4(x, 0.22, z) });
        parts.push({ geo: ico(0.09), color: body2, matrix: M4(x, 0.03, z + 0.02, 1.1, 0.35, 1.3) });
      }
      return mergeGeos(parts);
    }
    case 5: { // shard swarm: glowing core, nine two-winged flyers on three tiers
      const parts = [{ geo: ico(0.06), color: glow, matrix: M4(0, 0.6, 0), glow: 1 }];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, r = 0.26 + (i % 2) * 0.12, y = 0.42 + (i % 3) * 0.17;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        parts.push({ geo: ico(0.028), color: body2, matrix: M4(x, y, z, 1, 1, 1.6, 0, 0, -a) });
        parts.push({ geo: new THREE.TetrahedronGeometry(0.08), color: accent, matrix: M4(x, y, z, 1.7, 0.25, 0.6, 0, 0, -a), glow: 0.3 });
      }
      return mergeGeos(parts);
    }
    case 6: { // tide worm: tapered banded arch, mandibled head, sand mounds where it enters the beach
      const parts = [];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const z = (u - 0.5) * 0.95, y = Math.sin(u * Math.PI) * 0.5;
        parts.push({ geo: ico(0.14 - Math.abs(u - 0.75) * 0.07), color: i % 2 ? accent : body, matrix: M4(0, y, z), glow: i % 2 ? 0.15 : 0 });
      }
      parts.push({ geo: ico(0.13), color: body, matrix: M4(0, 0.14, 0.52, 1, 0.9, 1.15) });
      parts.push({ geo: cone(0.03, 0.14, 4), color: body2, matrix: M4(-0.05, 0.1, 0.65, 1, 1, 1, 1.3, 0) }, { geo: cone(0.03, 0.14, 4), color: body2, matrix: M4(0.05, 0.1, 0.65, 1, 1, 1, 1.3, 0) });
      parts.push(eye(-0.07, 0.22, 0.6, glow, 0.03), eye(0.07, 0.22, 0.6, glow, 0.03));
      parts.push({ geo: ico(0.2), color: sand, matrix: M4(0, -0.02, 0.5, 1.2, 0.25, 1) }, { geo: ico(0.18), color: sand, matrix: M4(0, -0.02, -0.48, 1.2, 0.25, 1) });
      return mergeGeos(parts);
    }
    case 7: { // sky whale: tapered three-part body, singing belly, pectoral fins, dorsal ridge, twin flukes, gill beads
      const parts = [
        { geo: ico(0.3, 1), color: body, matrix: M4(0, 0.5, 0.1, 0.9, 0.75, 2.0) },
        { geo: ico(0.24, 1), color: body, matrix: M4(0, 0.48, 0.85, 0.9, 0.7, 1.1) },
        { geo: ico(0.2, 1), color: body, matrix: M4(0, 0.52, -0.62, 0.75, 0.6, 1.5) },
        { geo: ico(0.13, 1), color: body, matrix: M4(0, 0.55, -1.0, 0.6, 0.45, 1.4) },
        { geo: ico(0.2, 1), color: glow, matrix: M4(0, 0.3, 0.25, 0.7, 0.35, 1.9), glow: 0.8 },
        { geo: cone(0.28, 0.6, 4), color: accent, matrix: M4(-0.55, 0.48, 0.15, 1, 1, 0.14, 0, 1.4), glow: 0.3 },
        { geo: cone(0.28, 0.6, 4), color: accent, matrix: M4(0.55, 0.48, 0.15, 1, 1, 0.14, 0, -1.4), glow: 0.3 },
        { geo: cone(0.22, 0.5, 4), color: accent, matrix: M4(-0.2, 0.56, -1.2, 1, 1, 0.12, 1.2, 0.7), glow: 0.3 },
        { geo: cone(0.22, 0.5, 4), color: accent, matrix: M4(0.2, 0.56, -1.2, 1, 1, 0.12, 1.2, -0.7), glow: 0.3 },
        eye(-0.2, 0.6, 1.05, glow, 0.05), eye(0.2, 0.6, 1.05, glow, 0.05),
      ];
      for (const z of [0.2, -0.05, -0.3]) parts.push({ geo: cone(0.05, 0.16, 4), color: body2, matrix: M4(0, 0.78 - Math.abs(z) * 0.1, z, 1, 1, 0.5, -0.5, 0) });
      for (const sx of [-1, 1]) for (const z of [0.62, 0.72, 0.82]) parts.push({ geo: ico(0.03), color: body2, matrix: M4(sx * 0.32, 0.45, z, 0.6, 1, 1) });
      return mergeGeos(parts);
    }
  }
}

// ---------------------------------------------------------------- per-kind vertex animation (object space, before the instance matrix)
export const ANIM = [
  // stilter: alternate leg swing with a knee lift, body bob, sail flex
  `float g = sin(uTime * 2.6 + aPhase + sign(position.x) * 1.57 + step(0.0, position.z) * 3.14);
   float leg = 1.0 - clamp(position.y / 0.74, 0.0, 1.0);
   transformed.z += g * 0.1 * leg;
   transformed.y += max(g, 0.0) * 0.05 * leg * step(0.02, position.y);
   transformed.y += abs(cos(uTime * 2.6 + aPhase)) * 0.025 * step(0.6, position.y);
   transformed.x += sin(uTime * 1.1 + aPhase) * 0.04 * clamp((position.y - 0.95) / 0.35, 0.0, 1.0);`,
  // drifter: bob, sac breathing, tendril sway
  `float tl = clamp(-position.y / 0.75, 0.0, 1.0);
   float br = 1.0 + sin(uTime * 0.9 + aPhase) * 0.04;
   transformed.xz *= mix(1.0, br, step(0.1, position.y));
   transformed.y += sin(uTime * 1.1 + aPhase) * 0.1;
   transformed.x += sin(uTime * 1.7 + aPhase + position.y * 4.0) * 0.14 * tl;
   transformed.z += cos(uTime * 1.3 + aPhase + position.y * 4.0) * 0.1 * tl;`,
  // shellback: breathing shell, feet shuffle, antennae wave
  `transformed.y += sin(uTime * 1.5 + aPhase) * 0.015 * step(0.25, position.y);
   transformed.z += sin(uTime * 5.0 + aPhase + position.x * 6.0) * 0.03 * (1.0 - step(0.16, position.y));
   transformed.x += sin(uTime * 2.2 + aPhase + position.x * 3.0) * 0.04 * step(0.3, position.y) * step(0.58, position.z);`,
  // lantern: sway from the head, lure pulse
  `float k = pow(clamp(position.y, 0.0, 1.4) / 1.4, 2.0);
   transformed.x += sin(uTime * 1.3 + aPhase) * 0.14 * k;
   transformed.z += cos(uTime * 0.9 + aPhase) * 0.09 * k;
   float pulse = 1.0 + 0.08 * pow(0.5 + 0.5 * sin(uTime * 1.6 + aPhase), 4.0);
   transformed.xyz = mix(transformed.xyz, vec3(transformed.x * pulse, 1.28 + (transformed.y - 1.28) * pulse, transformed.z * pulse), step(1.15, position.y));`,
  // mossback: slow breathing, head nod, tail sway, legs shuffle
  `float br = 1.0 + sin(uTime * 0.8 + aPhase) * 0.03;
   transformed.xz *= mix(1.0, br, step(0.3, position.y));
   transformed.y += sin(uTime * 0.8 + aPhase) * 0.03 * step(0.6, position.z);
   transformed.x += sin(uTime * 1.4 + aPhase) * 0.06 * step(0.5, -position.z);
   float lg = sin(uTime * 2.0 + aPhase + sign(position.x) * 1.57 + step(0.0, position.z) * 3.14);
   transformed.z += lg * 0.04 * (1.0 - clamp(position.y / 0.4, 0.0, 1.0));`,
  // swarm: the wheel turns, each flyer bobs and beats its wings
  `float a = uTime * 1.4 + aPhase; float c = cos(a), s = sin(a);
   transformed.xz = mat2(c, -s, s, c) * position.xz;
   transformed.y += sin(uTime * 3.0 + aPhase + position.x * 7.0) * 0.06;
   transformed.y += sin(uTime * 14.0 + aPhase + position.z * 9.0) * 0.025 * step(0.35, length(position.xz));`,
  // tideworm: the arch pulses and sways
  `transformed.y *= 0.85 + sin(uTime * 1.2 + aPhase) * 0.15;
   transformed.x += sin(uTime * 0.7 + aPhase) * 0.05 * clamp(position.y / 0.5, 0.0, 1.0);`,
  // skywhale: slow undulation, fins beat, flukes lag
  `float tail = clamp(-position.z / 1.4, 0.0, 1.0);
   transformed.y += sin(uTime * 0.7 + aPhase) * 0.06;
   transformed.x += sin(uTime * 1.5 + aPhase - position.z * 2.0) * 0.12 * tail * tail;
   transformed.y += sin(uTime * 1.5 + aPhase) * 0.1 * step(0.4, abs(position.x)) * step(-0.6, position.z);
   transformed.y += sin(uTime * 1.5 + aPhase - 1.2) * 0.12 * step(1.0, -position.z);`,
];

export function faunaMaterial(kind, fc) {
  const glowy = kind === 1 || kind === 3 || kind === 5 || kind === 7;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: kind === 1 ? 0.5 : 0.85, metalness: 0,
    emissive: fc.glow, emissiveIntensity: glowy ? 0.9 : 0.5,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aPhase; attribute float glow; varying float vGlow;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n vGlow = glow;\n ${ANIM[kind]}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vGlow;');
    mat.userData.shader = sh;
  };
  return mat;
}

// ---------------------------------------------------------------- steering
// A creature roams on its tangent plane: (u, v) is its offset from home, `heading` its direction.
// Turning is driven by two slow oscillators with per-creature random frequencies, a leash pulls it
// back toward home, and grazers stop and start on a third oscillator. No two creatures share a rhythm.
export function makeMover(rng, kind) {
  const mv = MOVE[kind];
  return {
    kind, u: 0, v: 0, heading: rng() * Math.PI * 2, spd: 0,
    f1: 0.15 + rng() * 0.25, p1: rng() * 6.28, f2: 0.5 + rng() * 0.6, p2: rng() * 6.28, f3: 0.08 + rng() * 0.12, p3: rng() * 6.28,
    fp: 0.05 + rng() * 0.08, pp: rng() * 6.28,
    leash: mv.leash * (0.7 + rng() * 0.6), speed: mv.speed * (0.75 + rng() * 0.5), turn: mv.turn, pause: mv.pause, flies: mv.flies,
  };
}
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function stepMover(st, t, dt) {
  if (st.leash <= 0) return false;
  // wander: slow drift plus a quicker jitter
  let turn = Math.sin(t * st.f1 + st.p1) * 0.9 + Math.sin(t * st.f2 + st.p2) * 0.35;
  turn *= st.turn;
  // leash: the further out, the harder it steers home
  const d = Math.hypot(st.u, st.v);
  if (d > st.leash * 0.6) {
    const home = Math.atan2(-st.v, -st.u);
    const k = Math.min(1, (d - st.leash * 0.6) / (st.leash * 0.4));
    turn += wrapAngle(home - st.heading) * k * 3.0;
  }
  st.heading += turn * dt;
  // speed: breathes slowly; grazers stop for a while when the pause oscillator dips
  let target = st.speed * (0.65 + 0.35 * Math.sin(t * st.f3 + st.p3));
  if (st.pause > 0 && Math.sin(t * st.fp + st.pp) < -1 + st.pause * 0.9) target = 0;
  st.spd += (target - st.spd) * Math.min(1, dt * 1.5);
  st.u += Math.cos(st.heading) * st.spd * dt;
  st.v += Math.sin(st.heading) * st.spd * dt;
  return st.spd > st.speed * 0.05;
}

// ---------------------------------------------------------------- inspector card
export class Inspector {
  constructor({ card, canvas, onClose }) {
    this.card = card; this.canvas = canvas;
    this.nameEl = card.querySelector('.cname'); this.latinEl = card.querySelector('.clatin');
    this.tagsEl = card.querySelector('.ctags'); this.storyEl = card.querySelector('.cstory');
    this.onClose = onClose;
    this.renderer = null; this.open = false; this.kind = -1;
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    this.camera.position.set(0, 2.6, 5.6);
    this.camera.lookAt(0, 0.55, 0);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.6); sun.position.set(2.5, 4, 3);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005;
    const sc = sun.shadow.camera; sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -3; sc.near = 1; sc.far = 12;
    this.scene.add(sun, new THREE.HemisphereLight('#9fbfff', '#3a2a1a', 0.7));
    this.fill = new THREE.DirectionalLight('#6a86d8', 0.5); this.fill.position.set(-3, 1, -2); this.scene.add(this.fill);
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshStandardMaterial({ color: '#6fa85a', roughness: 1, flatShading: true }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.trailN = 160;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trailN * 3), 3));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this.mesh = null; this.mover = null; this.trailPts = [];
    this.pathScale = 1;
  }
  show(kind, palette, groundColor, rngSeed = 3) {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.kind = kind;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
    const geo = faunaGeometry(kind, palette.fauna, palette.flora);
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
    this.mesh = new THREE.Mesh(geo, faunaMaterial(kind, palette.fauna));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    const size = new THREE.Box3().setFromBufferAttribute(geo.attributes.position).getSize(new THREE.Vector3());
    const fit = 1.35 / Math.max(size.y, size.x * 0.7, size.z * 0.7);
    this.mesh.scale.setScalar(fit);
    const hover = (kind === 1 ? 0.75 : kind === 5 ? 0.45 : kind === 7 ? 1.1 : 0) * fit;
    this.mesh.position.y = hover;
    this.hover = hover;
    this.scene.add(this.mesh);
    this.ground.material.color.set(groundColor);
    this.trail.material.color.set(palette.fauna.glow);
    // steering in card units: the leash maps to ~1.8 units of ground
    let s = rngSeed; const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    this.mover = makeMover(rng, kind);
    const mv = MOVE[kind];
    this.mover.leash = mv.leash; // no per-creature leash jitter on the card, so the path stays in frame
    this.pathScale = mv.leash > 0 ? 1.15 / mv.leash : 0;
    this.trailPts = [];
    this.trail.geometry.attributes.position.array.fill(0);
    this.trail.geometry.attributes.position.needsUpdate = true;
    const lore = LORE[kind];
    this.nameEl.textContent = lore.name; this.latinEl.textContent = lore.latin;
    this.tagsEl.innerHTML = [['Habitat', lore.habitat], ['Size', lore.size], ['Diet', lore.diet], ['Manner', lore.temperament]]
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    this.storyEl.textContent = lore.story;
    this.card.hidden = false;
    requestAnimationFrame(() => this.card.classList.add('show'));
    if (!this.open) { this.open = true; this.clock.start(); this.loop(); }
    this.resize();
  }
  hide() {
    if (!this.open) return;
    this.open = false;
    this.card.classList.remove('show');
    setTimeout(() => { if (!this.open) this.card.hidden = true; }, 250);
    if (this.onClose) this.onClose();
  }
  resize() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  loop() {
    if (!this.open) return;
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.1), t = this.clock.elapsedTime;
    const sh = this.mesh.material.userData.shader;
    if (sh) sh.uniforms.uTime.value = t;
    const mv = this.mover;
    if (mv.leash > 0) {
      // run the same steering as on the planet, with time sped up so a lap fits on the card
      stepMover(mv, t * 6, dt * 6);
      const x = mv.u * this.pathScale, z = mv.v * this.pathScale;
      this.mesh.position.set(x, this.hover, z);
      this.mesh.rotation.y = Math.atan2(Math.cos(mv.heading), Math.sin(mv.heading)) ; // model faces +z
      this.trailPts.push(x, this.hover * 0.02 + 0.01, z);
      if (this.trailPts.length > this.trailN * 3) this.trailPts.splice(0, 3);
      const arr = this.trail.geometry.attributes.position.array;
      arr.set(this.trailPts);
      for (let i = this.trailPts.length; i < arr.length; i += 3) { arr[i] = x; arr[i + 1] = 0.01; arr[i + 2] = z; }
      this.trail.geometry.attributes.position.needsUpdate = true;
    } else {
      this.mesh.rotation.y = t * 0.4;
    }
    // slow orbit so the geometry can be read from all sides
    const a = t * 0.18;
    this.camera.position.set(Math.sin(a) * 5.6, 2.6, Math.cos(a) * 5.6);
    this.camera.lookAt(0, 0.55 + this.hover * 0.5, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
