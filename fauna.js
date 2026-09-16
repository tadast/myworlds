// myworlds — fauna: builds a creature from a genome (see species.js), rigs it for the vertex shader,
// steers it on the ground, and runs the inspector card.
//
// A genome says what the animal is made of: class (air / land / sub-surface), body plan, legs, head, extras.
// buildCreature() turns that into one merged low-poly geometry. Every vertex carries a rig record
// (mode, phase, amplitude, weight) and a pivot, and the shader animates each part by its mode on top of
// a whole-body "carriage" (walk bob, hop, wave, float, arch, rise). Nothing here is hand-placed per species.
import * as THREE from 'three';
// The inspector card grows real plants for a species that hooks one; see Inspector.buildPosts().
// flora-geometry.js imports mergeGeos and M4 from this file, so the two modules form a cycle. It
// holds: neither one reads a name of the other while its own body runs.
import { floraGeometry, FLORA } from './flora-geometry.js';

export const BASE_SCALE = 0.0077; // 30% smaller than the first pass, so the globe reads as a miniature

// part modes. TENDON stretches one part from its pivot to aAnchor; the slinger hooks a plant with it.
const RIG = { NONE: 0, LEG: 1, WING: 2, SWAY: 3, PULSE: 4, NOD: 5, SPIN: 6, STATIC: 7, FLUKE: 8, TENDON: 9 };
// Whole-body carriages. HOP, ROLL, FLOW, and SLING are the four impulse carriages: each one reads
// aBurst, which the impulse mover writes, so the body and the steering cannot drift apart.
const CARRY = { WALK: 0, HOP: 1, WAVE: 2, FLOAT: 3, ARCH: 4, RISE: 5, ROLL: 6, FLOW: 7, SLING: 8 };

// ---------------------------------------------------------------- geometry helpers
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const oct = (r) => new THREE.OctahedronGeometry(r, 0);
// An icosahedron of radius r reaches 0.8507 r along an axis, and a dodecahedron reaches 0.9342 r,
// because neither one has a vertex on the axis. An octahedron has one, so it reaches r. The coarse
// build shrinks its octahedra by these factors, so a coarse part reaches as far as the part it
// replaces and the outline holds through the swap.
const ICO_REACH = 0.8507, DODECA_REACH = 0.9342;
const cyl = (rt, rb, h, s = 5, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const cone = (r, h, s = 5, open = false) => new THREE.ConeGeometry(r, h, s, 1, open);
const dodeca = (r) => new THREE.DodecahedronGeometry(r, 0);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const M4 = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, ry = 0) =>
  new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz));
const _up = V3(0, 1, 0);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
// a cylinder between two points. r is the radius at a, r2 the radius at b.
function seg(a, b, r, color, r2 = r, sides = 4, glow = 0, open = false) {
  const d = V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize());
  const m = new THREE.Matrix4().compose(V3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, V3(1, 1, 1));
  return { geo: cyl(r2, r, len, sides, open), color, matrix: m, glow };
}

export function mergeGeos(parts) {
  // parts: [{geo, color, matrix, glow?, rig?, pivot?, pivot2?}] → one non-indexed geometry with colour, glow, rig, pivot attributes
  // pivot2 is the second joint of a leg (the knee); it defaults to the pivot
  const pos = [], nor = [], col = [], glo = [], rig = [], piv = [], piv2 = [];
  const n = V3(), p = V3();
  for (const { geo, color, matrix, glow = 0, rig: rg = [0, 0, 0, 1], pivot = [0, 0, 0], pivot2 = pivot } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const pa = g.attributes.position, na = g.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const c = new THREE.Color(color);
    for (let i = 0; i < pa.count; i++) {
      p.fromBufferAttribute(pa, i).applyMatrix4(matrix);
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b); glo.push(glow);
      rig.push(rg[0], rg[1], rg[2], rg[3]); piv.push(pivot[0], pivot[1], pivot[2]); piv2.push(pivot2[0], pivot2[1], pivot2[2]);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('glow', new THREE.Float32BufferAttribute(glo, 1));
  out.setAttribute('aRig', new THREE.Float32BufferAttribute(rig, 4));
  out.setAttribute('aPivot', new THREE.Float32BufferAttribute(piv, 3));
  out.setAttribute('aPivot2', new THREE.Float32BufferAttribute(piv2, 3));
  return out;
}

const geoOf = (pos) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
};
// A two-sided sheet through a list of stations. A station is [x, y, zLead, zTrail]: one chord of
// the sheet. The sheet runs from each station to the next, so a station list is a planform.
function sheetGeo(st) {
  const pos = [];
  for (let i = 0; i < st.length - 1; i++) {
    const [x0, y0, l0, t0] = st[i], [x1, y1, l1, t1] = st[i + 1];
    const a = [x0, y0, l0], b = [x1, y1, l1], c = [x1, y1, t1], d = [x0, y0, t0];
    pos.push(...a, ...b, ...c, ...a, ...c, ...d); // top face
    pos.push(...a, ...c, ...b, ...a, ...d, ...c); // bottom face
  }
  return geoOf(pos);
}
// A two-sided sheet from a list of triangles, for a panel that a station list cannot describe.
function trisGeo(tris) {
  const pos = [];
  for (const [a, b, c] of tris) pos.push(...a, ...b, ...c, ...a, ...c, ...b);
  return geoOf(pos);
}
// A lofted hull along z. A ring is [z, y, rx, ry]. Only the faces whose angle lies in [a0, a1)
// are built, so one hull can take two colours: a back and a belly. The angle 0 points up.
// A ring with a radius of zero closes that end of the hull.
function loftGeo(rings, sides, a0 = 0, a1 = 1) {
  const pos = [];
  const at = (r, k) => {
    const a = (k / sides) * Math.PI * 2;
    return [Math.sin(a) * r[2], r[1] + Math.cos(a) * r[3], r[0]];
  };
  for (let k = 0; k < sides; k++) {
    const m = (k + 0.5) / sides;
    if (m < a0 || m >= a1) continue;
    for (let i = 0; i < rings.length - 1; i++) {
      const p = at(rings[i], k), q = at(rings[i], k + 1), r = at(rings[i + 1], k + 1), s = at(rings[i + 1], k);
      pos.push(...p, ...r, ...q, ...p, ...s, ...r);
    }
  }
  return geoOf(pos);
}

// ---------------------------------------------------------------- wing forms
// A wing is a planform of stations in parts of the span (x) and of the chord (z), plus the bones
// that hold it. The form comes from the genome (G.wingStyle, set in species.js). A genome built
// before the form existed takes the old paddle.
export const wingStyle = (G) => (G.loco !== 'wings' || G.plan === 'swarm' ? null : G.wingStyle || 'flit');
// The shape of each form, and the numbers the rig reads for it:
//   span, chord: in body radii. amp: the beat. lag: how far the tip trails the root.
//   elb: the wrist, as a part of the span. fold: how far the outer wing folds on the upstroke.
//   glo: the gate of the glide clock. A high gate holds the wing out for most of the cycle.
//   hold: the dihedral of a held wing at the root and at the tip. rate: a factor on the beat rate.
const WING_FORM = {
  flit: { span: 3.4, chord: 1.4, amp: 0.6, lag: 1.1, elb: 0.5, fold: 0, glo: 0, hold: [0.2, 0.25], rate: 1.5 },
  flap: { span: 3.8, chord: 1.9, amp: 0.8, lag: 0.5, elb: 0.42, fold: 0.9, glo: -0.6, hold: [0.25, 0.2], rate: 0.85 },
  glide: { span: 5.4, chord: 1.25, amp: 0.4, lag: 1.6, elb: 0.55, fold: 0.35, glo: 0.7, hold: [0.05, 0.12], rate: 0.55 },
};
// The planform of a form, as [u, lead, trail] in parts of the span and the chord.
function wingPlan(style, coarse) {
  if (style === 'flap') {
    // The arm runs to the wrist at 0.42 along the leading edge. Three fingers run from the wrist
    // to the trailing edge, and the membrane between two fingers sags into a scallop.
    const st = [[0, 0.25, -0.85], [0.2, 0.3, -0.62], [0.42, 0.32, -0.42], [0.56, 0.22, -1.0],
      [0.68, 0.12, -0.46], [0.8, 0.0, -0.78], [0.9, -0.14, -0.38], [1.0, -0.32, -0.34]];
    return coarse ? [st[0], st[3], st[7]] : st;
  }
  if (style === 'glide') {
    // Long and narrow. The trailing edge is a row of feather tips, so it alternates by a little.
    // The tip is left open: the slotted primaries finish it. See wingFeathers().
    if (coarse) return [[0, 0.35, -0.75], [0.6, 0.35, -0.5], [1.0, 0.1, -0.1]];
    const st = [];
    for (let i = 0; i <= 10; i++) {
      const u = (i / 10) * 0.8;
      st.push([u, 0.35 + 0.08 * Math.sin(u * 3.2) - 0.15 * u * u, -0.75 + 0.35 * u + (i % 2 ? 0.07 : 0)]);
    }
    return st;
  }
  // flit: a paddle with a narrow root and a round tip
  const n = coarse ? 2 : 7, st = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, c = Math.sqrt(Math.max(0, 1 - u ** 4)) * (0.35 + 0.65 * Math.min(1, u * 3));
    const lead = 0.3 * c - 0.15 * u;
    st.push([u, lead, lead - c]);
  }
  return st;
}

// the body as a set of ellipsoids: half-width at (y, z), and the top or bottom surface at (x, z)
function bodyProbe(secs, yc) {
  const els = secs.map((s) => ({ cy: yc + s.y, cz: s.z, rx: s.r * s.s[0], ry: s.r * s.s[1], rz: s.r * s.s[2] }));
  const hw = (y, z) => {
    let m = 0;
    for (const e of els) { const q = 1 - ((y - e.cy) / e.ry) ** 2 - ((z - e.cz) / e.rz) ** 2; if (q > 0) m = Math.max(m, e.rx * Math.sqrt(q)); }
    return m;
  };
  const yAt = (x, z, sign) => {
    let m = null;
    for (const e of els) {
      const q = 1 - (x / e.rx) ** 2 - ((z - e.cz) / e.rz) ** 2;
      if (q > 0) { const y = e.cy + sign * e.ry * Math.sqrt(q); m = m === null ? y : sign > 0 ? Math.max(m, y) : Math.min(m, y); }
    }
    return m;
  };
  return { hw, top: (x, z) => yAt(x, z, 1), bot: (x, z) => yAt(x, z, -1) };
}

// ---------------------------------------------------------------- body plans (sections relative to the body centre; +z is forward)
function bodySections(G) {
  const R = G.bodyR, S = G.stretch;
  // ---- roller (issue 28) ----
  if (G.loco === 'roller') return rollerSections(G);
  if (G.loco === 'fins') return whaleSections(G);
  switch (G.plan) {
    case 'blob':
      return { secs: [{ z: 0, y: 0, r: R, s: [1, 0.8, 1.35 * S] }], front: 1.3 * R * S, back: -1.3 * R * S, top: 0.8 * R, bot: -0.8 * R };
    case 'disc':
      return { secs: [{ z: 0, y: 0, r: R, s: [1.3, 0.45, 1.3], d: 1 }], front: 1.25 * R, back: -1.25 * R, top: 0.45 * R, bot: -0.45 * R };
    case 'spindle': {
      const k = R / 0.3;
      return {
        secs: [
          { z: 0.1 * k * S, y: 0, r: 0.3 * k, s: [0.9, 0.75, 2.0 * S], d: 1 },
          { z: 0.85 * k * S, y: -0.02 * k, r: 0.24 * k, s: [0.9, 0.7, 1.1 * S], d: 1 },
          { z: -0.62 * k * S, y: 0.02 * k, r: 0.2 * k, s: [0.75, 0.6, 1.5 * S], d: 1 },
          { z: -1.0 * k * S, y: 0.05 * k, r: 0.13 * k, s: [0.6, 0.45, 1.4 * S], d: 1 },
        ],
        front: 1.1 * k * S, back: -1.18 * k * S, top: 0.225 * k, bot: -0.225 * k,
      };
    }
    case 'dome': {
      const k = R / 0.36;
      return {
        secs: [
          { z: 0.14 * k, y: 0, r: 0.36 * k, s: [1.1, 0.55, 1.0], shape: 'dodeca' },
          { z: -0.14 * k, y: -0.03 * k, r: 0.33 * k, s: [1.0, 0.5, 0.9], shape: 'dodeca' },
          { z: -0.4 * k, y: -0.07 * k, r: 0.28 * k, s: [0.85, 0.45, 0.8], shape: 'dodeca' },
          { z: -0.05 * k, y: -0.19 * k, r: 0.28 * k, s: [1, 0.4, 1.35], second: true },
        ],
        front: 0.5 * k, back: -0.62 * k, top: 0.2 * k, bot: -0.3 * k,
      };
    }
    case 'chain': {
      const n = G.segs, secs = [];
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        secs.push({ z: (0.5 - u) * (n - 1) * 1.3 * R, y: 0, r: R * (0.7 + 0.3 * Math.sin(u * Math.PI)), s: [1, 0.9, 1.1], alt: i % 2 === 1, u });
      }
      return { secs, front: secs[0].z + secs[0].r, back: secs[n - 1].z - secs[n - 1].r, top: R * 0.9, bot: -R * 0.9 };
    }
  }
  return { secs: [], front: R, back: -R, top: R, bot: -R };
}

// ---------------------------------------------------------------- the sky whale
// A whale is one smooth hull, not a string of balls. The profile is a table of stations from the
// nose (t = 0) to the root of the flukes (t = 1): the radius as a part of the widest radius, and
// the lift of the centre line. The hull is widest a third of the way back and runs out into a thin
// stock that carries the flukes. It is a little flatter than it is wide.
const WHALE_PROFILE = [
  [0, 0.3, -0.03], [0.03, 0.62, -0.02], [0.08, 0.8, -0.01], [0.16, 0.9, 0], [0.28, 1, 0], [0.42, 0.97, 0],
  [0.56, 0.84, 0.01], [0.68, 0.64, 0.03], [0.78, 0.44, 0.05], [0.87, 0.27, 0.07], [0.94, 0.17, 0.08], [1, 0.12, 0.08],
];
const WHALE_FLAT = 0.82;          // the height of the hull against its width
// the head of a whale: 'hull' or 'bladder'. A genome built before the form existed takes the hull.
export const whaleHead = (G) => (G.loco === 'fins' ? G.whaleHead || 'hull' : null);
function whaleSections(G) {
  const k = G.bodyR / 0.3, front = 1.15 * k, back = -1.35 * k, rmax = 0.3 * k;
  const zAt = (t) => front + (back - front) * t;
  const rings = WHALE_PROFILE.map(([t, r, y]) => [zAt(t), y * k, r * rmax, r * rmax * WHALE_FLAT]);
  // Ellipsoids that follow the hull. The builder does not draw them: bodyProbe() reads them to put
  // the fins, the lamps, and the spines on the skin.
  const secs = [0.1, 0.26, 0.42, 0.58, 0.74, 0.88].map((t) => {
    const i = WHALE_PROFILE.findIndex((p) => p[0] >= t);
    const [t0, r0, y0] = WHALE_PROFILE[i - 1], [t1, r1, y1] = WHALE_PROFILE[i], f = (t - t0) / (t1 - t0);
    const r = (r0 + (r1 - r0) * f) * rmax;
    return { z: zAt(t), y: (y0 + (y1 - y0) * f) * k, r, s: [1, WHALE_FLAT, (0.3 * k) / r] };
  });
  return { secs, rings, zAt, k, front, back, top: rmax * WHALE_FLAT, bot: -rmax * WHALE_FLAT };
}

// ---- roller (issue 28) ----
// The hull of a roller turns about the right axis of the animal, so it has to be round about that
// axis: every section sits on the axis and holds one radius in the y and the z. A hull longer than
// it is tall would lift the animal and drop it once a turn, and the reader would read a hop. It
// also means a hull that stops at any angle stands right, so the fold and the roll need no clock
// of their own to bring the body back upright.
//
// A solid of flat faces does not rest at one height, though: an icosahedron of one subdivision
// rests at 0.93 to 1.00 of its radius as it turns, and ROLL_REACH is the mean of that. It is the
// radius the hull really rolls on. strideUnits() and the ROLL carriage both read it, so the ball
// on the screen and the clock that turns it cannot drift apart, and the drop puts it on the
// ground. See the hull in buildCreature().
const ROLL_REACH = 0.9757;
export const rollRadius = (G) => G.bodyR * ROLL_REACH;
function rollerSections(G) {
  const R = G.bodyR;
  // The hull is drawn in buildCreature(), which holds the two levels of detail. The two sections
  // give the reader the axis the hull turns about: a `dome` is a wheel on a wide hub, and a `blob`
  // is a ball with the hub showing at each pole. Without a mark of some kind on the axis a turning
  // ball of one colour would give the reader nothing to watch.
  const secs = G.plan === 'dome'
    ? [{ z: 0, y: 0, r: R, s: [0.62, 1, 1] }, { z: 0, y: 0, r: R * 0.55, s: [1.7, 1, 1], second: true }]
    : [{ z: 0, y: 0, r: R, s: [1, 1, 1] }, { z: 0, y: 0, r: R * 0.5, s: [2.8, 1, 1], second: true }];
  return { secs, front: R, back: -R, top: R, bot: -R };
}

// How far a leg swings, and how much of one cycle its foot stays on the ground (the duty factor).
// A walking quadruped keeps a foot down for about two thirds of a cycle, so three feet carry it at
// every moment; an insect runs an alternating tripod, so its duty is nearer a half. The shader
// reads the duty factor and the gait clock reads the swing; see "the gait clock" below.
export const LEG_SWING = { monopod: 0, biped: 0.5, tripod: 0.45, quad: 0.4, hexapod: 0.35 };
export const LEG_DUTY = { monopod: 0.5, biped: 0.6, tripod: 0.6, quad: 0.65, hexapod: 0.55 };
// ---- roller (issue 28) ----
// A roller does not walk. The legs stand the hull up and aim the throw, so they swing by nothing
// at all, and the ground comes from the hull. The gait clock still locks, because the hull turns
// by the ground the animal covers; strideUnits() gives it one turn per circumference.
LEG_SWING.roller = 0;
LEG_DUTY.roller = 0.5;

// A footfall order, as a part of the cycle. A leg touches down when its cycle wraps, and a larger
// phase touches down earlier, so the phase is the complement of the footfall.
const footPhase = (f) => ((1 - f) % 1) * Math.PI * 2;

// legs: hip z, outward direction (x, z), and gait phase per locomotion; the hip x comes from the body width
// The local +x axis is the left of the animal: the frame is right handed and the animal faces +z,
// so up cross forward is +x.
function legPlan(G, len) {
  const out = [];
  switch (G.loco) {
    case 'monopod': out.push({ z: 0, dir: [0, 0], phase: 0 }); break;
    case 'biped': for (const sx of [-1, 1]) out.push({ z: 0, dir: [sx, 0], phase: sx < 0 ? 0 : Math.PI }); break;
    case 'tripod': for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; out.push({ z: Math.sin(a) * len * 0.22, dir: [Math.cos(a), Math.sin(a)], phase: i * 2.09 }); } break;
    // A quad walks the lateral sequence every four-legged animal on Earth walks: left hind, left
    // fore, right hind, right fore, a quarter of a cycle apart. The two-beat diagonal pair it ran
    // before is a trot, and a trot at a walking speed reads as a hobble, because only two feet ever
    // carry the body. With four beats and a duty of 0.65 the body always has three feet on the ground.
    case 'quad': for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const f = sx > 0 ? (sz > 0 ? 0.25 : 0) : (sz > 0 ? 0.75 : 0.5);
      out.push({ z: sz * len * 0.3, dir: [sx, 0], phase: footPhase(f) });
    } break;
    // ---- roller (issue 28) ----
    // Three to five stubby legs on one ring about the hull, as a tripod stands, so the hull sits
    // level on them and no side of the animal is the front. The count comes from the genome and
    // not from a new draw: the tables in species.js build every entry before they pick one, so a
    // draw here would move every species rolled after a roller.
    case 'roller': {
      const n = 3 + (G.plan === 'dome' ? 1 : 0) + (G.jointed ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.5;
        out.push({ z: Math.sin(a) * len * 0.2, dir: [Math.cos(a), Math.sin(a)], phase: (i / n) * Math.PI * 2 });
      }
      break;
    }
    // an insect keeps the alternating tripod: the front and the rear of one side with the middle of the other
    case 'hexapod': { let i = 0; for (const sz of [0.32, 0, -0.32]) for (const sx of [-1, 1]) out.push({ z: sz * len, dir: [sx, 0], phase: (i++ % 2) * Math.PI + (sz === 0 ? Math.PI : 0) }); break; }
  }
  return out;
}

// ---------------------------------------------------------------- flow (issue 28)
// The body of a flow is a stack of open rings on one pivot at the ground point. It holds no shape
// of its own: the carriage alone says whether the stack is a slick, a gathered blob, or a column.
// The builder and rigConstants() both read the rest shape from flowBody(), so the geometry and the
// shader cannot disagree about how tall the body stands.
const FLOW_COARSE = 3;         // rings in a coarse build. The outline is a stack, not a ring count
const FLOW_W = 2.8;            // how many body widths across the slick spreads
const FLOW_H = 2.6;            // how many body heights tall the column stands
const FLOW_SLICK = 0.16;       // the height of the slick, as a part of the rest height
const FLOW_NARROW = 0.5;       // the width of the column, as a part of the rest width
const FLOW_SQUASH = 0.25;      // how much the body spreads as it lands
// ---- flow (issue 29) ----
// The clock of the charge, as parts of it. The body melts by FLOW_MELT, runs as a sheet until
// FLOW_SET, and stands as a column by FLOW_RISE. The shader reads the three to shape the stack and
// flowHold() reads the same three to say when the animal covers ground, so every metre a flow
// travels downhill it travels as a sheet, and it is still whenever it holds a shape. The window is
// narrow on purpose: the ground one run covers is set by the bank and not by these three, so a
// narrow window spends the same ground in less time and the sheet reads as a liquid and not as a
// walk.
const FLOW_MELT = 0.10;
const FLOW_SET = 0.34;
const FLOW_RISE = 0.52;
function flowBody(G) {
  return { n: G.rings || 6, h: G.bodyR * 1.7, r: G.bodyR };
}
// The radius of the stack at height u, 0 at the ground and 1 at the top: a drop sitting on the
// ground, widest where it touches. The floor of 0.04 keeps the top ring a ring and not a point.
const flowR = (r, u) => r * Math.sqrt(Math.max(0.04, 1 - u * u));

// ---------------------------------------------------------------- creature geometry (base at y = 0, +y up, faces +z)
// detail: 'full' for a creature the reader can walk up to, 'coarse' for one past the LOD distance.
// A coarse creature is a dozen pixels tall, so it keeps the silhouette and the rig and drops
// everything the reader cannot resolve at that size:
//   - a ball is an octahedron (8 triangles), not an icosahedron (20) or a dodecahedron (36);
//   - a tube is a three-sided open cylinder, and a cone is a three-sided open cone;
//   - a leg is one tapered bone from the hip to the foot, with no knee, no pad, and no bellows;
//   - the head keeps its ball and its nod, and loses the beak, the tusks, the eyes, and the rest;
//   - a chain body is one tapered tube, not a string of balls;
//   - of the extras only the sail and the plates stay, because only those two break the outline.
// Every part keeps its rig record, so one shader animates both levels of detail. The leg swing
// runs at half the amplitude, so the silhouette does not shimmer at a small pixel size.
// The build stays under 80 triangles for every species. See docs/fauna.md, "Ground tier".
export const COARSE_SWING = 0.5;   // the part of the full leg swing a coarse creature keeps
// ---- slinger (issue 28) ----
// The tendon is built as a short stub that runs back from its pivot into the body hull, and the
// shader lays it along the line from the pivot to the hold. The stub has to stay inside the hull:
// the ground scales a creature by the extent of its geometry along one axis, and a tendon of any
// real length would make every slinger the size of the gap between two plants. The length of the
// stub is only the parameter of the tube, so the shader divides the offset along it by TENDON_STUB
// to get the part of the way along the tendon a vertex sits at.
const TENDON_STUB = 0.05;
const SLING_SWAY = 0.05;           // how far the body of a slinger ripples as it crawls
export function buildCreature(G, pal, flora, detail = 'full') {
  const coarse = detail === 'coarse';
  const { body, body2, accent, glow } = G.colors;
  const sand = (pal && pal.fauna && pal.fauna.sand) || body2;
  const moss = flora ? flora.canopy : accent, trunk = flora ? flora.trunk : body2;
  const parts = [];
  const P = (geo, color, matrix, o = {}) => parts.push({ geo, color, matrix, glow: o.glow || 0, rig: o.rig || [RIG.NONE, 0, 0, 1], pivot: o.pivot || [0, 0, 0], pivot2: o.pivot2 || o.pivot || [0, 0, 0] });
  const PS = (sg, o) => P(sg.geo, sg.color, sg.matrix, o);
  // the primitives of this build: the full set, or the cheapest shape that holds the same outline
  const ball = coarse ? (r) => oct(r * ICO_REACH) : (r, d = 0) => ico(r, d);
  const block = coarse ? (r) => oct(r * DODECA_REACH) : dodeca;
  const spike = coarse ? (r, h) => cone(r, h, 3, true) : cone;
  const bone = (a, b, r, color, r2 = r, sides = 4, glowV = 0) =>
    seg(a, b, r, color, r2, coarse ? 3 : sides, glowV, coarse);
  const R = G.bodyR, land = G.cls === 'land', air = G.cls === 'air', sub = G.cls === 'sub';
  const B = bodySections(G);
  const len = B.front - B.back;
  const heavy = G.loco === 'quad' || G.loco === 'hexapod';

  // ---- body centre height (walkers: the belly sits at the hip height, the hips are inside the belly)
  let yc;
  if (land) yc = G.legLen > 0 ? G.legLen - B.bot : -B.bot * 0.95;
  else if (air) yc = 0.5;
  else yc = G.loco === 'plough' ? -B.bot * 0.55 : 0;

  // ---- body
  if (G.plan === 'swarm') {
    // a glowing core and nine two-winged shards wheeling around it
    const core = [0, yc, 0];
    P(ball(0.05 + R * 0.15), glow, M4(...core), { glow: 1, rig: [RIG.PULSE, 0, 0.15, 1], pivot: core });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, r = R * 1.3 + (i % 2) * R * 0.6, y = yc - 0.18 + (i % 3) * 0.17;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, rig = [RIG.SPIN, 0, 1.4, 1];
      // the wheel reads from the nine shards; the coarse build keeps all nine and drops their beads
      if (!coarse) P(ball(0.028), body2, M4(x, y, z, 1, 1, 1.6, 0, 0, -a), { rig, pivot: core });
      P(new THREE.TetrahedronGeometry(0.08), accent, M4(x, y, z, 1.7, 0.25, 0.6, 0, 0, -a), { glow: 0.3, rig, pivot: core });
    }
    return mergeGeos(parts);
  }
  if (G.loco === 'arch') {
    // a chain bent into a breathing loop; the ends dive into the ground
    const n = G.segs, span = (n - 1) * 1.3 * R, peak = Math.min(0.6, span * 0.55);
    B.secs = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), z = (0.5 - u) * span, y = Math.sin(u * Math.PI) * peak, r = R * (0.75 + 0.25 * Math.sin(u * Math.PI));
      P(ball(r), i % 2 ? accent : body, M4(0, y, z), { glow: i % 2 ? 0.15 : 0 });
      B.secs.push({ z, y, r, s: [1, 1, 1] });
    }
    B.front = span / 2 + R; B.back = -span / 2 - R; B.top = R; yc = 0;
  } else if (G.loco === 'periscope') {
    // a neck rising out of the ground; the carriage sinks it out of sight now and then
    const n = G.segs, step = R * 1.15;
    yc = 0.05 + (n - 1) * step; B.secs = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), y = 0.05 + i * step, r = R * (0.85 - 0.3 * u);
      P(ball(r), i % 2 ? body2 : body, M4(0, y, 0, 1, 1.1, 1));
      B.secs.push({ z: 0, y: y - yc, r, s: [1, 1.1, 1] });
    }
    B.front = R * 0.5; B.back = -R * 0.5; B.top = R * 0.55; B.bot = -R * 0.55;
  } else if (G.loco === 'flow') {
    // ---- flow (issue 28) ----
    // A stack of open rings, every one of them about the ground point. Nothing closes a ring, so
    // the reader can see the body has no skin to hold, which is the strange thing about it. The cap
    // at the top is the one closed piece: without it the reader looks straight down the stack.
    // A coarse build keeps three rings; the outline of a stack does not need more at that size.
    const F = flowBody(G), n = coarse ? FLOW_COARSE : F.n, sides = coarse ? 4 : 8;
    yc = 0; B.secs = [];
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, um = (u0 + u1) * 0.5;
      const r0 = flowR(F.r, u0), r1 = flowR(F.r, u1), hr = F.h / n, rm = (r0 + r1) * 0.5;
      // The rings overlap a little, so the slick shows no gap between them when it flattens.
      P(cyl(r1, r0, hr * 1.08, sides, true), i % 2 ? accent : body, M4(0, um * F.h, 0), { glow: i % 2 ? 0.35 : 0.1 });
      B.secs.push({ z: 0, y: um * F.h, r: rm, s: [1, (hr * 0.5) / rm, 1] });
    }
    P(ball(flowR(F.r, 1) * 1.15), body2, M4(0, F.h, 0, 1, 0.55, 1));
    B.front = F.r * 0.5; B.back = -F.r * 0.5; B.top = F.h; B.bot = 0;
  } else if (G.loco === 'fins') {
    // The sky whale: one lofted hull with a darker back and a lighter belly. A bladder head starts
    // the hull behind the head and hides the blunt front in a cluster of gas bladders.
    const bladder = whaleHead(G) === 'bladder', k = B.k;
    const keep = coarse ? (bladder ? [3, 6, 8, 11] : [0, 2, 4, 8, 11]) : WHALE_PROFILE.map((p, i) => i).filter((i) => !bladder || i >= 3);
    const kept = keep.map((i) => B.rings[i]);
    const first = kept[0], last = kept[kept.length - 1];
    const rings = [[first[0] + first[2] * 0.35, first[1], 0, 0], ...kept, [last[0] - 0.01 * k, last[1], 0, 0]];
    const sides = coarse ? 4 : 10;
    const hull = (a0, a1, color) => P(loftGeo(rings.map((r) => [r[0], yc + r[1], r[2], r[3]]), sides, a0, a1), color, M4(0, 0, 0));
    hull(0, 0.3, body); hull(0.7, 1, body); hull(0.3, 0.7, body2);
    if (bladder) {
      // A cluster of bladders on the front of the hull. Each one breathes on its own phase, so
      // the head never holds one shape. The coarse build keeps two of them.
      const c = [0, yc + 0.02 * k, B.zAt(0.1)], cr = 0.3 * k;
      const n = coarse ? 2 : 9;
      for (let i = 0; i < n; i++) {
        const v = 1 - ((i + 0.5) / n) * 2, rad = Math.sqrt(1 - v * v), a = i * 2.39996;
        const p = [Math.cos(a) * rad * cr * 0.62, c[1] + v * cr * 0.5, c[2] + (Math.sin(a) * rad * 0.5 + 0.35) * cr];
        const br = cr * (coarse ? 0.62 : 0.4 + 0.2 * ((i * 0.618) % 1));
        P(ball(br, i < 2 ? 1 : 0), i % 3 === 0 ? glow : accent, M4(...p, 1, 0.92, 1.05),
          { glow: i % 3 === 0 ? 0.55 : 0.2, rig: [RIG.PULSE, i * 0.9, 0.07, 1], pivot: p });
      }
      if (!coarse) {
        // a row of smaller bladders down the back, as if the head ran on under the skin
        for (const [t, s] of [[0.3, 0.1], [0.42, 0.08], [0.54, 0.06]]) {
          const z = B.zAt(t), p = [0, yc + B.top * 0.92 + WHALE_PROFILE[4][2] * k, z];
          P(ico(s * k), accent, M4(...p, 1, 0.8, 1.2), { glow: 0.25, rig: [RIG.PULSE, t * 9, 0.08, 1], pivot: p });
        }
      }
    }
  } else if (coarse && G.plan === 'chain') {
    // A chain of seven balls is the widest body in the set. The coarse build joins the section
    // centres with tapered tubes instead: one tube per joint, and the two end tubes reach out by
    // the end radius, so the body holds the length the full build has.
    const n = B.secs.length, sz = B.secs[0].s[2], k = ICO_REACH;
    for (let i = 0; i < n - 1; i++) {
      const a = B.secs[i], b = B.secs[i + 1];
      const za = a.z + (i === 0 ? a.r * k * sz : 0), zb = b.z - (i === n - 2 ? b.r * k * sz : 0);
      PS(bone([0, yc + a.y, za], [0, yc + b.y, zb], a.r * k, i % 2 ? body2 : body, b.r * k));
    }
  } else if (G.loco === 'roller') {
    // ---- roller (issue 28) ----
    // The hull of a roller is the one body in the set that turns on the ground, so it is the one
    // body that has to be round. A plain icosahedron of radius r rests on a plane at 0.80 r on a
    // face and at r on a vertex, so a hull of twenty faces would sink a tenth of its radius into
    // the ground and lift out again every sixth of a turn. One subdivision holds 0.93 to 1, which
    // no reader can see. The coarse octahedron takes the radius the full hull rolls on, so the two
    // builds hold one outline through the LOD swap. It bounces, but it only draws past the LOD
    // distance, where the whole animal is a dozen pixels, as COARSE_SWING does for a leg.
    for (const s of B.secs) {
      const geo = coarse ? oct(s.r * ROLL_REACH) : ico(s.r, 1);
      P(geo, s.second ? body2 : body, M4(0, yc + s.y, s.z, ...s.s));
    }
  } else {
    for (const s of B.secs) {
      const color = s.second || s.alt ? body2 : (G.loco === 'sac' ? accent : body);
      const geo = s.shape === 'dodeca' ? block(s.r) : ball(s.r, s.d || 0);
      // A slinger has no legs. With nothing in reach it crawls, and a rigid body dragged over the
      // ground reads as a sledge, so its sections take SWAY about the tail: the tail end holds its
      // place and the front ripples, which is the end that reaches for a hold. See CARRY.SLING.
      const o = G.loco === 'sac' ? { glow: 0.35, rig: [RIG.PULSE, 0, 0.05, 1], pivot: [0, yc, 0] }
        : G.loco === 'slinger' ? { rig: [RIG.SWAY, 0, SLING_SWAY, 1], pivot: [0, yc, B.back] }
          : {};
      P(geo, color, M4(0, yc + s.y, s.z, ...s.s), o);
    }
  }

  // the body as ellipsoids, so parts can be put on its surface
  const probe = bodyProbe(B.secs, yc);

  // ---- legs: two bones per leg. LEG mode swings the leg about the hip and folds the shin about the knee
  // while the foot is in the air. The hip is inside the belly, so the thigh never leaves the body.
  const legs = legPlan(G, len);
  const th = clamp(0.02 + R * 0.1, 0.02, 0.07) * (G.loco === 'quad' ? 1.6 : 1) * (G.loco === 'monopod' ? 2.4 : 1);
  const stride = LEG_SWING[G.loco] || 0;
  const knees = G.jointed && G.loco !== 'monopod';
  const bend = G.loco === 'monopod' ? 0 : knees ? 1.0 : 0.55; // knee fold in radians at the top of the swing
  const insect = G.loco === 'hexapod';
  // The gait clock needs the height the hips really sit at, and the builder is the only place that
  // knows it: it starts from the leg length and then lifts the hip into the hull. The mean of them
  // goes on the geometry, and makeGait() reads it. See "the gait clock".
  let hipSum = 0, hipN = 0;
  for (const L of legs) {
    const h = G.legLen, [dx, dz] = L.dir;
    let hy = yc + B.bot * 0.55;
    let hw = 0;
    for (let k = 0; k <= 4; k++) hw = Math.max(hw, probe.hw(hy + (yc - hy) * k * 0.25, L.z));
    const hx = dx * Math.max(hw * 0.75, th);
    const hb = probe.bot(hx, L.z), ht = probe.top(hx, L.z);
    if (hb !== null && hb > hy) hy = hb + (ht - hb) * 0.35; // the hull is thin here: lift the hip into it
    const hip = [hx, hy, L.z];
    hipSum += hy; hipN++;
    // ---- roller (issue 28) ----
    // One stubby bone per leg, thick at the hip and blunt at the foot. It never swings: the swing
    // is 0, so the LEG mode holds it still, and the knee sits on the hip, so nothing folds about a
    // joint the animal has not got. The ROLL carriage is what moves it: it folds the whole leg
    // into the hull on the charge and lets it out again on the recover.
    if (G.loco === 'roller') {
      const foot = [hip[0] + dx * h * 0.55, 0, hip[2] + dz * h * 0.55];
      const rigR = { rig: [RIG.LEG, L.phase, 0, 0], pivot: hip, pivot2: hip };
      PS(bone(hip, foot, th * 2.2, body2, th * 1.4), rigR);
      if (!coarse) P(ico(th * 1.9), body2, M4(foot[0], th * 0.5, foot[2], 1.3, 0.5, 1.3), rigR);
      continue;
    }
    const splay = { hexapod: 1.0, tripod: 0.7, quad: 0.25, biped: 0.2, monopod: 0 }[G.loco];
    const foot = [hip[0] + dx * h * splay, 0, hip[2] + dz * h * splay + h * 0.05];
    let knee;
    if (knees) {
      const kOut = insect ? 0.8 : G.loco === 'tripod' ? 0.5 : 0.35;
      knee = [hip[0] + dx * h * kOut, insect ? hy + h * 0.15 : h * 0.55, hip[2] + dz * h * kOut + h * (insect ? 0.05 : 0.22)];
    } else knee = [(hip[0] + foot[0]) / 2, (hip[1] + foot[1]) / 2, (hip[2] + foot[2]) / 2];
    const rig = (w) => ({ rig: [RIG.LEG, L.phase, stride, w * bend], pivot: hip, pivot2: knee });
    if (coarse) {
      // one tapered bone from the hip to the foot. The knee point sits on the hip, so the shader
      // folds nothing and the whole leg pitches about the hip. The swing runs at half the
      // amplitude, so a leg a few pixels long does not shimmer.
      PS(bone(hip, foot, th * 1.1, body2, 0), { rig: [RIG.LEG, L.phase, stride * COARSE_SWING, 0], pivot: hip, pivot2: hip });
      continue;
    }
    if (G.loco === 'monopod') {
      // a bellows spring: a thin core and a stack of tapered rings. The hop carriage stretches it from the foot.
      PS(seg(hip, foot, th * 0.3, body2, th * 0.3, 5), rig(0));
      const n = 7, y0 = th * 0.45, hgt = (h - y0) / n;
      for (let i = 0; i < n; i++) {
        const big = th * 1.05, small = th * 0.55, flip = i % 2 === 1;
        P(cyl(flip ? small : big, flip ? big : small, hgt * 0.98, 6), flip ? accent : body2, M4(hip[0], y0 + (i + 0.5) * hgt, hip[2]), rig(0));
      }
      P(ico(th * 1.3), body2, M4(foot[0], th * 0.35, foot[2], 1.4, 0.4, 1.6), rig(0));
      continue;
    }
    PS(seg(hip, knee, th, body2, th * 1.15, heavy ? 5 : 4), rig(0));
    PS(seg(knee, foot, th * 0.75, body2, th * (knees ? 0.95 : 1.0), heavy ? 5 : 4), rig(1));
    if (knees) P(ico(th * 1.3), body2, M4(...knee), rig(1));
    P(ico(th * 1.15), body2, M4(foot[0], th * 0.4, foot[2], 1.2, 0.45, 1.4), rig(1));
  }

  // ---- head
  const headR = G.plan === 'chain' ? B.secs[0].r * 1.05 : clamp(R * 0.45, 0.06, 0.16);
  // A tall walker carries its head on a neck above the body. A flow carries its head on the top of
  // the stack for the same reason, so the throw takes the head up the column with it. A flow with
  // no head grows no neck: a bare stub above an empty stack reads as a fault. Issue 28.
  const tall = G.loco === 'biped' || G.loco === 'monopod' || G.loco === 'tripod'
    || (G.loco === 'flow' && G.head !== 'none');
  let H, neckBase;
  if (G.loco === 'periscope') { H = [0, yc + R * 0.9, R * 0.3]; neckBase = [0, yc, 0]; }
  else if (tall) {
    neckBase = [0, yc + B.top * 0.4, B.front * 0.85];
    H = [0, yc + B.top + headR * 0.6, B.front + headR * 0.6];
    const s = bone(neckBase, H, headR * 0.35, body2, headR * 0.45);
    P(s.geo, s.color, s.matrix, { rig: [RIG.NOD, 0, 0.12, 1], pivot: neckBase });
  } else if (G.loco === 'fins') {
    // The head of a whale is the front of the hull, so the furniture sits on the hull and no ball
    // is drawn for it. A beak runs forward out of the nose and a crest stands on the brow.
    neckBase = [0, yc, B.front * 0.6]; H = [0, yc + B.top * 0.55, B.front - headR * 1.2];
  } else { neckBase = [0, yc, B.front * 0.8]; H = [0, yc + B.top * 0.2, B.front + headR * 0.7]; }
  const nod = { rig: [RIG.NOD, 0, G.head === 'lure' ? 0.04 : G.loco === 'periscope' ? 0.08 : 0.12, 1], pivot: neckBase };
  const nodG = (g) => ({ ...nod, glow: g });
  const eyeR = clamp(headR * 0.25, 0.02, 0.05);
  const eyes = () => { if (G.loco !== 'fins') for (const sx of [-1, 1]) P(ico(eyeR), glow, M4(H[0] + sx * headR * 0.55, H[1] + headR * 0.25, H[2] + headR * 0.8), nodG(0.6)); };
  if ((G.head !== 'none' || G.loco === 'periscope') && G.loco !== 'fins') P(ball(headR), G.plan === 'chain' ? body : body2, M4(H[0], H[1], H[2], 0.85, 0.85, 1.25), nod);
  // the head furniture and the eyes measure a fraction of a metre: past the LOD distance the head
  // is a ball of a few pixels and none of them can be told apart from it
  switch (coarse ? 'coarse' : G.head) {
    case 'beak':
      P(cone(headR * 0.35, headR * 1.4, 4), body2, M4(H[0], H[1] - headR * 0.1, H[2] + headR * 1.2, 1, 1, 1, Math.PI / 2, 0), nod); eyes(); break;
    case 'mandibles':
      for (const sx of [-1, 1]) P(cone(headR * 0.22, headR * 1.3, 4), body2, M4(H[0] + sx * headR * 0.45, H[1] - headR * 0.3, H[2] + headR * 1.0, 1, 1, 1, 1.5, 0, -sx * 0.3), nod);
      eyes(); break;
    case 'stalks':
      for (const sx of [-1, 1]) {
        const a = add(H, [sx * headR * 0.3, headR * 0.5, 0]), b = add(H, [sx * headR * 1.2, headR * 2.0, headR * 0.3]);
        const s = seg(a, b, 0.012, body2); P(s.geo, s.color, s.matrix, nod);
        P(ico(eyeR * 1.2), glow, M4(...b), nodG(0.7));
      }
      break;
    case 'lure': {
      const a = add(H, [0, headR * 0.6, headR * 0.3]), L = add(H, [0, headR * 2.6, headR * 1.2]);
      const s = seg(a, L, 0.014, body2, 0.018); P(s.geo, s.color, s.matrix, nod);
      P(ico(headR * 0.9), glow, M4(L[0], L[1], L[2], 1, 1.3, 1), { glow: 1, rig: [RIG.PULSE, 0, 0.12, 1], pivot: L });
      for (let i = 0; i < 3; i++) { const a2 = (i / 3) * Math.PI * 2; P(ico(0.02), glow, M4(H[0] + Math.cos(a2) * headR * 0.8, H[1] + headR * 0.6, H[2] + Math.sin(a2) * headR * 0.8), nodG(0.7)); }
      break;
    }
    case 'crest':
      for (let i = 0; i < 3; i++) P(cone(headR * 0.35, headR * 1.1, 4), accent, M4(H[0], H[1] + headR * 0.9, H[2] + headR * (0.3 - i * 0.45), 1, 1, 1, -0.4, 0), nodG(0.35));
      eyes(); break;
    case 'tusks':
      for (const sx of [-1, 1]) P(cone(headR * 0.22, headR * 1.5, 4), glow, M4(H[0] + sx * headR * 0.55, H[1] - headR * 0.5, H[2] + headR * 1.0, 1, 1, 1, 1.3, 0), nodG(0.3));
      eyes(); break;
    default:
      if (!coarse && (land || sub)) eyes();
  }

  // ---- slinger (issue 28): the tendon
  // One thin tube on RIG.TENDON, with its pivot at the front of the body. The shader stretches it
  // from that pivot to aAnchor, the hold in the frame of the instance, and collapses it onto the
  // pivot while aAnchor is the zero vector, which is what a slinger with nothing to hold shows.
  // The stub runs back into the hull, so it adds nothing to the extent the ground scale measures.
  if (G.loco === 'slinger') {
    const tp = [0, yc + B.top * 0.45, B.front * 0.9];
    const tr = clamp(R * 0.07, 0.008, 0.025);
    P(cyl(tr, tr, TENDON_STUB, coarse ? 3 : 4, true), accent,
      M4(tp[0], tp[1], tp[2] - TENDON_STUB * 0.5, 1, 1, 1, -Math.PI / 2, 0),
      { glow: 0.5, rig: [RIG.TENDON, 0, 0, 1], pivot: tp });
  }

  // ---- locomotion extras: wings, fins, the sac's vent
  const style = wingStyle(G);
  if (style) {
    // Wing sheets rooted in the flank. The form gives the planform and the bones; see WING_FORM.
    // A flitter on a spindle carries a second, smaller pair on a later phase.
    const F = WING_FORM[style], plan = wingPlan(style, coarse);
    const zw = style === 'glide' && G.plan === 'spindle' ? B.front * 0.25 : B.front * 0.05;
    const pairs = style === 'flit' && G.plan === 'spindle' ? [[B.front * 0.3, 1, 0], [B.back * 0.3, 0.72, 1.4]] : [[zw, 1, 0]];
    for (const [z, kw, ph] of pairs) for (const sx of [-1, 1]) {
      const yw = yc + B.top * 0.35, span = R * F.span * kw, chord = R * F.chord * kw;
      const root = [sx * Math.max(probe.hw(yw, z) * 0.8, R * 0.3), yw, z];
      const m = M4(root[0], root[1], root[2], sx, 1, 1, 0, sx * 0.12);
      const o = { glow: 0.3, rig: [RIG.WING, ph, F.amp, sx * span], pivot: root };
      const pt = (u, c, y = 0) => [u * span, y, c * chord];   // a point of the planform, in the frame of the wing
      const inWing = (geo, color, oo) => P(geo, color, m.clone(), oo);
      inWing(sheetGeo(plan.map(([u, l, t]) => [u * span, 0, l * chord, t * chord])), accent, o);
      // one sheet per wing at distance: the sheet is the silhouette
      if (coarse) continue;
      const bone = (a, b, r0, r1) => { const s = seg(a, b, r0, body2, r1, 4); P(s.geo, s.color, s.matrix.premultiply(m), { ...o, glow: 0 }); };
      if (style === 'flap') {
        // an arm along the leading edge to the wrist, three fingers from the wrist, and a claw
        const wrist = pt(0.42, 0.32, 0.006);
        bone(pt(0, 0.25, 0.006), wrist, R * 0.075, R * 0.05);
        for (const [u, c] of [[0.56, -1.0], [0.8, -0.78], [1.0, -0.33]]) bone(wrist, pt(u, c, 0.004), R * 0.035, R * 0.01);
        P(cone(R * 0.04, R * 0.22, 4), body2, M4(...add(wrist, [0.02 * span, 0, R * 0.1]), 1, 1, 1, Math.PI / 2, 0).premultiply(m), { ...o, glow: 0 });
      } else if (style === 'glide') {
        // an arm to the wrist, a lighter band of coverts over the front of the wing, and five
        // primaries that stand apart at the tip, each one curled up a little
        bone(pt(0, 0.3, 0.005), pt(0.55, 0.36, 0.005), R * 0.05, R * 0.035);
        bone(pt(0.55, 0.36, 0.005), pt(0.8, 0.26, 0.005), R * 0.035, R * 0.02);
        inWing(sheetGeo(plan.map(([u, l]) => [u * span, 0.004, l * chord, (l - 0.4) * chord])), body2, { ...o, glow: 0.1 });
        for (let i = 0; i < 5; i++) {
          const f = i / 4, a = 0.12 - 0.75 * f, L = span * (0.26 - 0.07 * f), w = chord * (0.11 - 0.02 * f);
          const bx = 0.77 * span, bz = (0.26 - 0.66 * f) * chord, ca = Math.cos(a), sa = Math.sin(a);
          const st = [[0, 0.5], [0.55, 0.55], [0.85, 0.35], [1, 0]].map(([s, wk]) =>
            [bx + ca * L * s, 0.05 * L * s * s, bz + sa * L * s + w * wk, bz + sa * L * s - w * wk]);
          inWing(sheetGeo(st), i % 2 ? accent : body2, o);
        }
      } else {
        // flit: three veins fan out from the root, and a dark mark sits near the tip
        const cw = (u) => Math.sqrt(Math.max(0, 1 - u ** 4)) * (0.35 + 0.65 * Math.min(1, u * 3));
        const lead = (u) => 0.3 * cw(u) - 0.15 * u;
        const r0 = pt(0, lead(0) - cw(0) * 0.5, 0.004);
        for (const [u, s] of [[0.96, 0.15], [0.86, 0.5], [0.64, 0.9]]) bone(r0, pt(u, lead(u) - cw(u) * s, 0.004), R * 0.022, R * 0.008);
        inWing(sheetGeo([[0.74 * span, 0.005, lead(0.74) * chord, (lead(0.74) - 0.2) * chord], [0.84 * span, 0.005, lead(0.84) * chord, (lead(0.84) - 0.18) * chord]]), body2, { ...o, glow: 0.6 });
      }
    }
  }
  if (G.loco === 'fins') {
    const k = B.k, bladder = whaleHead(G) === 'bladder';
    // Pectoral flippers: long, narrow, and swept back, with knobs along the leading edge. They
    // droop below the flank and row slowly.
    const zf = B.zAt(0.26), yf = yc - B.top * 0.5, span = 0.72 * k, chord = 0.24 * k;
    const fl = coarse ? [[0, 0.5, -0.5], [1, -0.4, -0.5]]
      : [[0, 0.5, -0.5], [0.15, 0.62, -0.46], [0.3, 0.5, -0.42], [0.45, 0.56, -0.36], [0.6, 0.38, -0.3],
        [0.72, 0.4, -0.28], [0.84, 0.18, -0.3], [0.94, -0.1, -0.4], [1, -0.4, -0.5]];
    const sweep = (u) => -0.3 * u * span;
    for (const sx of [-1, 1]) {
      const root = [sx * probe.hw(yf, zf) * 0.85, yf, zf];
      const m = M4(...root, sx, 1, 1, 0, -sx * 0.5);
      const o = { glow: 0.2, rig: [RIG.WING, 0, 0.22, sx * span], pivot: root };
      P(sheetGeo(fl.map(([u, l, t]) => [u * span, 0, l * chord + sweep(u), t * chord + sweep(u)])), accent, m, o);
      if (coarse) continue;
      const s = seg([0, 0.004, 0.4 * chord], [0.85 * span, 0.004, 0.1 * chord + sweep(0.85)], 0.035 * k, body, 0.012 * k, 4);
      P(s.geo, s.color, s.matrix.premultiply(m), { ...o, glow: 0 });
    }
    // A small swept dorsal fin two thirds of the way back, unless a sail or the bladders stand there.
    if (!bladder && !G.extras.includes('sail')) {
      const zd = B.zAt(0.64), yd = (probe.top(0, zd) ?? yc + B.top) - 0.02 * k, h = 0.2 * k, c = 0.32 * k;
      const st = coarse ? [[0, 0, 0.5 * c, -0.5 * c], [h, 0, -0.5 * c, -0.6 * c]]
        : [[0, 0, 0.5 * c, -0.5 * c], [0.4 * h, 0, 0.15 * c, -0.45 * c], [0.75 * h, 0, -0.15 * c, -0.42 * c], [h, 0, -0.5 * c, -0.56 * c]];
      P(sheetGeo(st), body, M4(0, yd, zd, 1, 1, 1, 0, Math.PI / 2), { rig: [RIG.SWAY, 0, 0.02, 1], pivot: [0, yd, zd] });
    }
    // the eyes, the throat grooves, and a row of lamps down each flank of the belly: decoration
    // that does not carry the outline
    if (!coarse) {
      const onHull = (t, a, lift = 1) => {
        const z = B.zAt(t), i = WHALE_PROFILE.findIndex((p) => p[0] >= t);
        const [t0, r0, y0] = WHALE_PROFILE[Math.max(0, i - 1)], [t1, r1, y1] = WHALE_PROFILE[i];
        const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0, r = (r0 + (r1 - r0) * f) * 0.3 * k * lift;
        return [Math.sin(a) * r, yc + (y0 + (y1 - y0) * f) * k + Math.cos(a) * r * WHALE_FLAT, z];
      };
      for (const sx of [-1, 1]) {
        P(ico(0.03 * k), glow, M4(...onHull(bladder ? 0.2 : 0.1, sx * 1.75)), { glow: 0.8 });
        for (let i = 0; i < 5; i++) {
          const p = onHull(0.2 + i * 0.1, sx * 2.25, 0.98);
          P(oct(0.022 * k), glow, M4(...p), { glow: 0.9, rig: [RIG.PULSE, i * 0.7 + sx, 0.3, 1], pivot: p });
        }
        if (bladder) continue;
        for (const a of [2.75, 2.95]) {
          const pts = [0.04, 0.2, 0.38].map((t) => onHull(t, sx * a, 1.01));
          for (let j = 0; j < 2; j++) PS(seg(pts[j], pts[j + 1], 0.008 * k, body, 0.008 * k, 3));
        }
      }
    }
  }
  if (G.loco === 'sac') {
    const base = [0, yc + B.bot - 0.02, 0];
    P(cyl(R * 0.33, R * 0.2, 0.09, coarse ? 3 : 6, coarse), body2, M4(base[0], base[1] - 0.02, base[2]));
    P(ball(R * 0.18), glow, M4(base[0], base[1] - 0.07, base[2]), { glow: 1, rig: [RIG.PULSE, 1, 0.2, 1], pivot: [base[0], base[1] - 0.07, base[2]] });
    P(ball(R * 0.17), body2, M4(0, yc + B.top + 0.02, 0.02));
    for (const [sx, dz] of [[-1, 0.04], [1, -0.05]]) P(ball(R * 0.4), accent, M4(sx * R * 0.9, yc + R * 0.2, dz, 1, 1.2, 1), { glow: 0.25, rig: [RIG.PULSE, 2, 0.05, 1], pivot: [0, yc, 0] });
  }

  // ---- extras
  const top = yc + B.top;
  for (const e of G.extras) {
    // A coarse creature keeps only the sail and the plates. Every other extra is a bead, a spike,
    // a feeler, or a mound of a few centimetres, and none of them reaches the outline at distance.
    if (coarse && e !== 'sail' && e !== 'plates' && e !== 'flukes') continue;
    // ---- roller (issue 28) ----
    // Anything the hull carries rides the tread, so it rings the body about the spin axis. Placed
    // along the body, as every other locomotion places it, one of these would stand on the ground
    // at one stop of the ball and point at the sky at the next. The feelers are the exception:
    // they grow on the head, and the head folds away before the hull turns.
    if (G.loco === 'roller' && e !== 'antennae') {
      // The hull rolls on RR, so nothing here may reach past it: a stud that stood proud of the
      // tread would cut into the ground every time it came round to the bottom of the turn.
      const n = e === 'plates' ? 3 : 5, RR = rollRadius(G);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.4;    // one place on the rolling circle
        const cy = Math.cos(a), cz = Math.sin(a); // and the way out of the hull there
        if (e === 'spikes') {
          const hs = R * 0.3, rr = RR - hs * 0.5;
          P(spike(R * 0.16, hs, 4), accent, M4(0, yc + cy * rr, cz * rr, 1, 1, 1, a, 0), { glow: 0.4 });
        } else if (e === 'beads') {
          // A lamp on the tread holds still and rides the hull round. It takes no part mode at
          // all: a mode that moves about a pivot is a limb to the ROLL carriage, and a limb folds
          // into the hull instead of turning with it.
          const br = clamp(R * 0.12, 0.02, 0.045), rr = RR - br * 0.7;
          P(ico(br), glow, M4(0, yc + cy * rr, cz * rr), { glow: 0.9 });
        } else if (e === 'plates') {
          const pr = R * 0.5, rr = RR - pr * 0.45 * DODECA_REACH;
          P(block(pr), body, M4(0, yc + cy * rr, cz * rr, 1.3, 0.45, 1.0, a, 0));
        }
      }
      continue;
    }
    switch (e) {
      case 'sail': {
        // A membrane on a row of spines along the back. The spines rake back, the tallest stands
        // ahead of the middle, and the membrane sags between two spines. It shows three bands:
        // the accent near the back, the second body colour above it, and a lit rim at the edge.
        const n = coarse ? 3 : 7, zA = B.front * 0.45, zB = B.back * 0.6, sh = 0.15 + R * 1.2;
        const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
        const sp = [];
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), z = zA + (zB - zA) * u;
          const h = sh * (0.3 + 0.7 * Math.sin(Math.PI * u ** 0.75) ** 0.8);
          const yb = (probe.top(0, z) ?? top) - 0.015;
          sp.push({ b: [0, yb, z], t: [0, yb + h, z - h * 0.25], h });
        }
        const rig = { rig: [RIG.SWAY, 0, 0.04, 1], pivot: [0, top, (zA + zB) / 2] };
        // one band of the membrane, from f0 to f1 of the way from the back to the edge
        const band = (f0, f1) => {
          const tris = [];
          for (let i = 0; i < n - 1; i++) {
            const A = sp[i], C = sp[i + 1], bm = lerp(A.b, C.b, 0.5), mid = lerp(A.t, C.t, 0.5);
            mid[1] -= coarse ? 0 : 0.28 * (A.h + C.h) * 0.5;
            const a0 = lerp(A.b, A.t, f0), a1 = lerp(A.b, A.t, f1), m0 = lerp(bm, mid, f0), m1 = lerp(bm, mid, f1);
            const c0 = lerp(C.b, C.t, f0), c1 = lerp(C.b, C.t, f1);
            if (coarse) tris.push([a0, a1, c1], [a0, c1, c0]);
            else tris.push([a0, a1, m1], [a0, m1, m0], [m0, m1, c1], [m0, c1, c0]);
          }
          return trisGeo(tris);
        };
        if (coarse) { P(band(0, 1), accent, M4(0, 0, 0), { glow: 0.35, ...rig }); break; }
        P(band(0, 0.55), accent, M4(0, 0, 0), { glow: 0.3, ...rig });
        P(band(0.55, 0.9), body2, M4(0, 0, 0), { glow: 0.1, ...rig });
        P(band(0.9, 1), glow, M4(0, 0, 0), { glow: 0.7, ...rig });
        for (const S of sp) PS(seg(S.b, lerp(S.b, S.t, 1.06), 0.014, body2, 0.004, 4), rig);
        break;
      }
      case 'spikes': {
        const n = 3 + (G.segs > 4 ? 2 : (R > 0.24 ? 1 : 0));
        for (let i = 0; i < n; i++) {
          const u = i / Math.max(1, n - 1), z = B.front * 0.5 + (B.back * 0.7 - B.front * 0.5) * u;
          const yb = probe.top(0, z); if (yb === null) continue;
          P(cone(R * 0.18, R * 0.7, 4), accent, M4(0, yb + R * 0.27, z, 1, 1, 1, z * 0.6, 0), { glow: 0.4 });
        }
        break;
      }
      case 'beads': {
        const r = clamp(R * 0.12, 0.02, 0.045);
        for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
          const z = B.front * 0.45 + (B.back * 0.45 - B.front * 0.45) * (i / 2), y = yc + B.top * 0.1, hw = probe.hw(y, z);
          if (hw < r) continue;
          const p = [sx * hw * 0.92, y, z];
          P(ico(r), glow, M4(...p), { glow: 0.9, rig: [RIG.PULSE, i * 1.1 + (sx > 0 ? 0.5 : 0), 0.35, 1], pivot: p });
        }
        break;
      }
      case 'tendrils': {
        if (G.loco === 'flow') {
          // ---- flow (issue 28) ----
          // A fringe round the foot of the stack, and not the trailing pair a walker carries. The
          // carriage scales the whole body about the ground point, so a feeler that reached a body
          // length behind would be thrown that much further out again every time the slick spread.
          const F = flowBody(G), r0 = flowR(R, 0.12) * 0.9, rl = R * 0.9;
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 + 0.4;
            const t0 = [Math.cos(a) * r0, F.h * 0.12, Math.sin(a) * r0];
            const t1 = [Math.cos(a) * (r0 + rl), 0.012, Math.sin(a) * (r0 + rl)];
            const s = seg(t0, t1, 0.01, body2, 0.014, 3);
            P(s.geo, s.color, s.matrix, { rig: [RIG.SWAY, i, 0.1, 1], pivot: t0 });
            P(ico(0.016), glow, M4(...t1), { glow: 0.8, rig: [RIG.SWAY, i, 0.1, 1], pivot: t0 });
          }
          break;
        }
        if (air) {
          const n = G.loco === 'sac' ? 6 : 4, lenT = (G.loco === 'sac' ? 0.5 : 0.25) + R;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + 0.3, zoff = G.loco === 'sac' ? 0 : B.back * 0.6;
            const tx = Math.cos(a) * R * 0.3, tz = Math.sin(a) * R * 0.3 + zoff;
            const t0 = [tx, (probe.bot(tx, tz) ?? yc + B.bot * 0.9) + 0.02, tz], t1 = [Math.cos(a) * R * 0.6, t0[1] - lenT - (i % 3) * 0.08, Math.sin(a) * R * 0.6 + zoff];
            const s = seg(t0, t1, 0.009, body, 0.014, 3);
            P(s.geo, s.color, s.matrix, { rig: [RIG.SWAY, i, 0.14, 1], pivot: t0 });
            if (i % 2 === 0) P(ico(0.022), body2, M4((t0[0] + t1[0]) / 2, (t0[1] + t1[1]) / 2, (t0[2] + t1[2]) / 2), { rig: [RIG.SWAY, i, 0.14, 1], pivot: t0 });
            P(ico(0.016), glow, M4(...t1), { glow: 0.8, rig: [RIG.SWAY, i, 0.14, 1], pivot: t0 });
          }
        } else {
          // trailing feelers from the rear, or from the neck of a periscope
          const from = G.loco === 'periscope' ? [0, yc, 0] : [0, yc, B.back * 0.85];
          for (const sx of [-1, 0, 1]) {
            const t0 = add(from, [sx * 0.05, 0, 0]), t1 = add(from, [sx * 0.2, G.loco === 'periscope' ? 0.25 : -yc * 0.6, -0.3 - R]);
            const s = seg(t0, t1, 0.01, body2, 0.014, 3);
            P(s.geo, s.color, s.matrix, { rig: [RIG.SWAY, sx + 1, 0.12, 1], pivot: t0 });
            P(ico(0.016), glow, M4(...t1), { glow: 0.8, rig: [RIG.SWAY, sx + 1, 0.12, 1], pivot: t0 });
          }
        }
        break;
      }
      case 'garden': {
        const at = (x, z) => (probe.top(x, z) ?? top) - R * 0.05;
        for (const [x, z, r] of [[-0.3, -0.2, 0.4], [0.35, 0.3, 0.32], [0.1, -0.8, 0.28]]) P(ico(R * r), moss, M4(x * R, at(x * R, z * R), z * R, 1, 0.7, 1));
        const tz = -0.35 * R, tb = at(-0.12 * R, tz), th2 = 0.2 + R * 0.3;
        P(cyl(0.02, 0.025, th2, 4), trunk, M4(-0.12 * R, tb + th2 * 0.5, tz));
        P(ico(0.1 + R * 0.15), moss, M4(-0.12 * R, tb + th2, tz));
        P(cone(R * 0.15, R * 0.6, 4), accent, M4(0.45 * R, at(0.45 * R, 0.1 * R) + R * 0.25, 0.1 * R), { glow: 0.35 });
        break;
      }
      case 'plates':
        if (coarse) {   // one shell over the back holds the same raised outline as the two plates
          P(block(R * 0.7), body, M4(0, yc + B.top * 0.5, 0, 1.1, 0.45, 1.6));
          break;
        }
        P(dodeca(R * 0.7), body, M4(0, yc + B.top * 0.5, B.front * 0.3, 1.1, 0.45, 0.9));
        P(dodeca(R * 0.65), body, M4(0, yc + B.top * 0.55, B.back * 0.3, 1, 0.4, 0.85));
        break;
      case 'tail': {
        const root = [0, yc + B.top * 0.2, B.back * 0.8];
        const rig = { rig: [RIG.SWAY, 0, 0.1, 1.5], pivot: root };
        const tl = 0.45 + R * 1.6;
        if (air) {
          if (style === 'glide') {
            // a fan of feathers, flat to the ground, on a short stock
            PS(seg(root, add(root, [0, 0, -tl * 0.18]), R * 0.16, body2, R * 0.1, 4), rig);
            for (let i = 0; i < 7; i++) {
              const a = (i / 6 - 0.5) * 1.1, L = tl * (0.55 - 0.08 * Math.abs(i / 6 - 0.5) * 2), w = R * 0.14;
              const b = add(root, [0, 0.004 * i, -tl * 0.12]), sa = Math.sin(a), ca = Math.cos(a);
              const tip = add(b, [sa * L, 0, -ca * L]), mid = add(b, [sa * L * 0.6, 0, -ca * L * 0.6]);
              const side = [ca * w, 0, sa * w];
              P(trisGeo([[b, add(mid, side), tip], [b, tip, add(mid, side.map((v) => -v))]]), i % 2 ? accent : body2, M4(0, 0, 0), { glow: 0.2, ...rig });
            }
            break;
          }
          // a whip that ends in a vane (a flapper), or two streamers that end in paddles
          const whips = style === 'flap' ? [0] : [-1, 1];
          for (const sx of whips) {
            const pts = [];
            for (let i = 0; i <= 4; i++) {
              const u = i / 4;
              pts.push(add(root, [sx * R * 0.25 * u, -0.1 * tl * Math.sin(u * 2.4), -tl * 1.2 * u]));
            }
            for (let i = 0; i < 4; i++) PS(seg(pts[i], pts[i + 1], R * 0.09 * (1 - i / 5), i % 2 ? body : body2, R * 0.09 * (1 - (i + 1) / 5), 4), rig);
            const e = pts[4], vw = R * (style === 'flap' ? 0.34 : 0.2), vl = R * (style === 'flap' ? 0.6 : 0.45);
            const v = [e, add(e, [vw, 0, -vl * 0.45]), add(e, [0, 0, -vl]), add(e, [-vw, 0, -vl * 0.45])];
            P(trisGeo([[v[0], v[1], v[2]], [v[0], v[2], v[3]]]), accent, M4(0, 0, 0), { glow: 0.45, ...rig });
          }
          break;
        }
        // A walker's tail: a banded taper of six bones that droops from the hip and lifts at the tip,
        // with a club of spikes on a spiked animal and a tuft on the rest.
        const hr = root[1], drop = Math.min(hr * 0.45, tl * 0.35), n = 6;
        const pts = [], rs = [];
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          pts.push([0, hr - drop * Math.sin(u * Math.PI * 0.6) + tl * 0.18 * u ** 3, root[2] - tl * u]);
          rs.push(R * 0.3 * (1 - u) ** 0.9 + 0.012);
        }
        for (let i = 0; i < n; i++) {
          PS(seg(pts[i], pts[i + 1], rs[i], i % 2 ? body : body2, rs[i + 1], 5), rig);
          if (i > 0) P(ico(rs[i]), i % 2 ? body2 : body, M4(...pts[i]), rig);
        }
        const tip = pts[n];
        if (G.extras.includes('spikes')) {
          for (const [dx, dy] of [[1, 0.4], [-1, 0.4], [0.7, -0.3], [-0.7, -0.3]]) {
            const s = seg(tip, add(tip, [dx * R * 0.35, dy * R * 0.35, -R * 0.12]), R * 0.06, accent, 0.002, 4);
            P(s.geo, s.color, s.matrix, { ...rig, glow: 0.4 });
          }
        } else {
          for (const [dx, dy] of [[0, 0.3], [0.25, -0.1], [-0.25, -0.1]]) {
            const s = seg(add(pts[n - 1], [0, 0, -0.01]), add(tip, [dx * R * 0.4, dy * R * 0.4, -R * 0.5]), R * 0.05, accent, 0.004, 3);
            P(s.geo, s.color, s.matrix, { ...rig, glow: 0.3 });
          }
        }
        break;
      }
      case 'flukes': {
        // A crescent flat to the ground on the end of the stock, with a notch in the middle of the
        // trailing edge. It pitches on the beat.
        const k = B.k || R / 0.3, end = B.rings ? B.rings[B.rings.length - 1] : [B.back * 0.85, 0];
        const root = [0, yc + end[1], end[0] + 0.02 * k], hs = 0.45 * k;
        const st = coarse ? [[0, 0, -0.3], [1, -0.64, -0.65]]
          : [[0, 0, -0.3], [0.25, -0.08, -0.4], [0.5, -0.2, -0.46], [0.75, -0.36, -0.52], [0.92, -0.52, -0.58], [1, -0.64, -0.65]];
        const geo = () => sheetGeo(st.map(([x, l, t]) => [x * hs, 0, l * hs, t * hs]));
        for (const sx of [-1, 1]) P(geo(), accent, M4(...root, sx, 1, 1), { glow: 0.3, rig: [RIG.FLUKE, 0, 0.25, 1], pivot: root });
        break;
      }
      case 'antennae':
        for (const sx of [-1, 1]) {
          const a = add(H, [sx * headR * 0.3, headR * 0.7, 0]), b = add(H, [sx * headR * 0.9, headR * 2.4, -headR * 0.8]);
          const s = seg(a, b, 0.008, body2); P(s.geo, s.color, s.matrix, { rig: [RIG.SWAY, sx, 0.12, 1.5], pivot: a });
          P(ico(0.018), glow, M4(...b), { glow: 0.9, rig: [RIG.SWAY, sx, 0.12, 1.5], pivot: a });
        }
        break;
      case 'mounds': {
        const st = { rig: [RIG.STATIC, 0, 0, 1] };
        if (G.loco === 'arch') { P(ico(R * 1.4), sand, M4(0, -0.02, B.front * 0.95, 1.2, 0.25, 1), st); P(ico(R * 1.3), sand, M4(0, -0.02, B.back * 0.95, 1.2, 0.25, 1), st); }
        else if (G.loco === 'periscope') P(ico(R * 1.6), sand, M4(0, -0.02, 0, 1.3, 0.25, 1.3), st);
        else { P(ico(R * 1.2), sand, M4(0, -0.02, B.front + R * 0.5, 1.2, 0.3, 0.9), st); P(ico(R * 0.9), sand, M4(0, -0.02, B.back - R * 0.4, 1, 0.2, 1.4), st); }
        break;
      }
    }
  }
  const geo = mergeGeos(parts);
  if (hipN) geo.userData.hipY = hipSum / hipN;
  return geo;
}

// ---------------------------------------------------------------- the rig shader
// Part modes move a part relative to its pivot; the carriage then moves the whole body.
const RIG_GLSL = `
  // The four dynamic per-instance floats travel in one vec4. A creature program already sat at the
  // 16 attribute slots the hardware promises, and aBurst and aAnchor would have overflowed it, so
  // the four ride together and the shader reads them back by name here.
  float aMove = aAnim.x, aGait = aAnim.y, aTurn = aAnim.z, aBurst = aAnim.w;
  float mode = aRig.x, ph = aRig.y + aPhase * 7.0, amp = aRig.z, w = aRig.w;
  // The gait clock. LOCK species read aGait, which the steering advances by the ground the animal
  // covers, so a foot on the ground cannot slide. Everything else runs off a fixed rate.
  #if LOCK
    float gc = aGait;
  #else
    float gc = uTime * GAIT;
  #endif
  float g = gc + ph, f = uTime * FLAP + ph, s = uTime * SLOW + ph;
  // body-wide clocks (no part phase), so the carriage moves every part of one animal together
  float gb = gc + aPhase * 7.0, fb = uTime * FLAP + aPhase * 7.0, sb = uTime * SLOW + aPhase * 7.0;
  float mv = aMove;
  // 1 = wings beat, 0 = wings held out. GLO is the gate: a glider holds its wings out for most of
  // the cycle, and a flapper holds them out only now and then.
  float gl = max(GLIDE, smoothstep(GLO - 0.25, GLO + 0.25, sin(sb * 0.33 + 1.0)));
  vec3 d = transformed - aPivot;
  float c, sn, th;
  // ---- slinger (issue 28) ----
  // How far along the tendon this vertex sits: 0 at the body and 1 at the hold. The carriage reads
  // it, so the root of the tendon rides with the body while its far end stays on the plant.
  float tendT = 0.0;
  if (mode == 1.0) {            // LEG: a stance with the foot planted, then a swing that lifts it and carries it forward
    // One cycle is a stance of DUTY and a swing of the rest. Through the stance the leg sweeps back
    // at a constant rate, and the gait clock runs at the rate that makes that sweep match the
    // ground the body covers, so the foot holds its place. Through the swing the foot leaves the
    // ground and a cubic carries it forward again, with the same speed at both ends as the stance,
    // so the leg never kinks. The sine this replaced moved the foot forward for half of every
    // cycle while it was still on the ground, which is what read as a skid.
    float p = fract(g * 0.15915494);
    float a, lift;
    if (p < DUTY) {
      a = -1.0 + 2.0 * (p / DUTY);            // -1 foot forward at touchdown, +1 foot back at lift-off
      lift = 0.0;
    } else {
      float q = (p - DUTY) / (1.0 - DUTY), m = 2.0 * (1.0 - DUTY) / DUTY;
      a = 4.0 * q * q * q - 6.0 * q * q + 1.0 + m * (2.0 * q * q * q - 3.0 * q * q + q);
      lift = sin(3.1416 * q);
    }
    // Through a turn the inside of the body covers less ground than the outside, so the inside legs
    // take the shorter stride. aPivot.x is the side of the animal the hip sits on.
    float side = aPivot.x > 0.0 ? 1.0 : (aPivot.x < 0.0 ? -1.0 : 0.0);
    float sk = 1.0 - aTurn * side * SKEW;
    float hipY = max(aPivot.y, 0.001);
    vec3 d2 = transformed - aPivot2;
    th = lift * w * mv; c = cos(th); sn = sin(th);       // the shin folds about the knee, only in the air
    d2.yz = vec2(d2.y * c - d2.z * sn, d2.y * sn + d2.z * c);
    d = aPivot2 + d2 - aPivot;
    float u = clamp(-d.y / hipY, 0.0, 1.0);              // 0 at the hip, 1 at the foot
    float dy0 = d.y, dz0 = d.z;
    th = a * amp * mv * sk; c = cos(th); sn = sin(th);
    d.yz = vec2(d.y * c - d.z * sn, d.y * sn + d.z * c);
    // A pitch about the hip carries the foot up an arc, so the foot would rise at both ends of the
    // stance and the animal would walk on tiptoe. The leg extends by the height the arc lost, so
    // the foot holds one height through the whole stance.
    d.y -= (dy0 * (c - 1.0) - dz0 * sn) * u;
    transformed = aPivot + d;
  } else if (mode == 2.0) {     // WING: roll about the root; the tip trails the root and bends further
    float span = abs(w), side = w < 0.0 ? -1.0 : 1.0;
    float u = clamp(length(d.xz) / span, 0.0, 1.0);
    float beat = sin(f - u * LAG) * amp * (0.5 + 0.9 * u);
    // The outer wing folds about the wrist on the upstroke: it droops and sweeps back, so the
    // downstroke pushes with the whole wing and the upstroke drags only the arm.
    float wk = smoothstep(ELB - 0.08, ELB + 0.08, abs(d.x) / span) * max(0.0, cos(f)) * gl * FOLD;
    if (wk > 0.0) {
      float ex = side * ELB * span;
      vec2 fq = vec2(d.x - ex, d.y);
      th = -wk * side; c = cos(th); sn = sin(th);
      fq = vec2(fq.x * c - fq.y * sn, fq.x * sn + fq.y * c);
      th = 0.8 * wk * side; c = cos(th); sn = sin(th);
      vec2 fz = vec2(fq.x * c + d.z * sn, -fq.x * sn + d.z * c);
      d = vec3(ex + fz.x, fq.y, fz.y);
    }
    th = mix(HOLDA + HOLDB * u, beat, gl) * side; c = cos(th); sn = sin(th);
    d.xy = vec2(d.x * c - d.y * sn, d.x * sn + d.y * c);
    transformed = aPivot + d;
  } else if (mode == 3.0) {     // SWAY: drift that grows with distance from the root
    // A walker's tail swings with the stride and lags behind the root, so it reads as one body with
    // the legs. A tail on its own slow rhythm looked pinned on.
    float L = length(d) * w;
    transformed.x += mix(sin(s * 1.6 + L * 3.0), sin(gb - L * 2.5) * (0.35 + 0.65 * mv), SWAYG) * amp * L;
    transformed.z += cos(s * 1.2 + L * 2.0) * amp * 0.6 * L;
  } else if (mode == 4.0) {     // PULSE: breathe about the pivot
    transformed = aPivot + d * (1.0 + amp * pow(0.5 + 0.5 * sin(s * 1.5), 3.0));
  } else if (mode == 5.0) {     // NOD: slow pitch about the neck, and the head leads a turn
    th = sin(s * 0.7) * amp; c = cos(th); sn = sin(th);
    d.yz = vec2(d.y * c - d.z * sn, d.y * sn + d.z * c);
    // An animal looks where it turns before its body follows. A positive aTurn turns to the left,
    // and +x is the left of the animal, so the head yaws with the sign of aTurn.
    th = aTurn * HEADYAW; c = cos(th); sn = sin(th);
    d.xz = vec2(d.x * c + d.z * sn, d.z * c - d.x * sn);
    transformed = aPivot + d;
  } else if (mode == 6.0) {     // SPIN: wheel about the pivot, each shard bobs and beats
    float a = uTime * amp + aPhase; c = cos(a); sn = sin(a);
    d.xz = vec2(d.x * c - d.z * sn, d.x * sn + d.z * c);
    transformed = aPivot + d;
    transformed.y += sin(f + d.x * 7.0) * 0.03 * w + sin(s + d.z * 5.0) * 0.05;
  } else if (mode == 8.0) {     // FLUKE: pitch at the beat, lagging the body
    th = sin(f - 1.2) * amp; c = cos(th); sn = sin(th);
    d.yz = vec2(d.y * c - d.z * sn, d.y * sn + d.z * c);
    transformed = aPivot + d;
  } else if (mode == 9.0) {     // TENDON: one tube laid from its pivot to the hold on the plant
    // The part is built as a stub running back from the pivot along -z, so d.z gives the place of
    // this vertex along the tube and d.xy gives its offset from the axis. The tube is then laid
    // along the line from the pivot to aAnchor, and the two offsets ride on a frame of that line.
    // aAnchor is the zero vector while the animal holds nothing, and the tube collapses onto its
    // own pivot: a part of no size, and no pixels. See RIG.TENDON and TENDON_STUB.
    tendT = clamp(-d.z / TENDL, 0.0, 1.0);
    vec3 ta = aAnchor - aPivot;
    float tl = length(ta);
    if (tl < 0.0001) { transformed = aPivot; }
    else {
      vec3 tdir = ta / tl;
      vec3 tref = abs(tdir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      vec3 t1v = normalize(cross(tref, tdir));
      vec3 t2v = cross(tdir, t1v);
      transformed = aPivot + tdir * (tendT * tl) + t1v * d.x + t2v * d.y;
    }
  }
  if (mode != 7.0) {
  #if CARRY == 0
    // The body rises over each supporting leg and rocks from side to side once a stride, and it
    // leans into a turn about the hip line. The legs take none of it: their feet are on the ground.
    if (mode != 1.0) {
      transformed.y += BOB * (0.5 - 0.5 * cos(gb * BOBN)) * mv + 0.01 * sin(sb);
      transformed.x += ROCK * sin(gb) * mv;
      th = -aTurn * LEAN; c = cos(th); sn = sin(th);
      vec2 r = vec2(transformed.x, transformed.y - ROLLY);
      transformed.xy = vec2(r.x * c - r.y * sn, r.x * sn + r.y * c + ROLLY);
    }
  #elif CARRY == 1
    // a hop: a crouch on the ground (HOPG of the cycle), then a parabola of height HOPH set by the gravity.
    // The spring leg follows the body up to EXT, then the foot leaves the ground.
    // Any movement gives a full hop; the spring extends by EXT at take-off, then tucks under the body at the apex.
    // aBurst is the clock now: the impulse mover writes it, so the crouch and the parabola always
    // land on the ground the steering covers. It runs 0 to CHARGE through the crouch and CHARGE to
    // 1 through the flight, and it holds at 0 while the animal stands still.
    float hp = aBurst, act = smoothstep(0.0, 0.3, mv), yb, stx;
    if (hp < CHARGE) { yb = -CROUCH * sin(hp / CHARGE * 3.1416) * act; stx = yb; }
    else {
      float a = (hp - CHARGE) / (1.0 - CHARGE), arc = sin(a * 3.1416);
      yb = HOPH * 4.0 * a * (1.0 - a) * act;
      stx = min(yb, EXT) - (EXT + CROUCH * 0.6) * arc * arc * act;
    }
    if (mode == 1.0) transformed.y += stx * clamp(position.y / max(aPivot.y, 0.01), 0.0, 1.0) + (yb - stx);
    else transformed.y += yb;
  #elif CARRY == 2
    // a lateral wave runs from the head to the tail and grows on the way; the head end stays rigid
    float u = clamp((FRONT - transformed.z) / LEN, 0.0, 1.0), zc = min(transformed.z, FRONT * 0.9);
    transformed.x += BOB * (0.2 + 0.8 * u) * sin(gb + zc * WAVEK) * mv;
    transformed.y += BOB * 0.2 * max(0.0, sin(gb + zc * WAVEK + 1.2)) * u * mv;
  #elif CARRY == 3
    transformed.y += BOB * sin(sb * 0.8) + HEAVE * sin(fb - 1.0) * gl;
    // A whale swims with an up-and-down wave, as a whale on Earth does; any other flyer sways.
    float wv = WAVE * sin(fb - transformed.z * WAVEK) * clamp(-transformed.z, 0.0, 2.0);
    if (WAVEV > 0.5) transformed.y += wv; else transformed.x += wv;
    // a flyer banks into its turn: the whole body rolls, wings and all
    th = -aTurn * LEAN; c = cos(th); sn = sin(th);
    vec2 rb = vec2(transformed.x, transformed.y - ROLLY);
    transformed.xy = vec2(rb.x * c - rb.y * sn, rb.x * sn + rb.y * c + ROLLY);
  #elif CARRY == 4
    transformed.y *= 0.85 + 0.15 * sin(sb);
    transformed.x += 0.05 * sin(sb * 0.6) * clamp(transformed.y, 0.0, 1.0);
  #elif CARRY == 5
    transformed.y -= RISE * (1.0 - smoothstep(SINK, SINK + 0.4, sin(sb * 0.35)));
  #elif CARRY == 7
    // ---- flow (issue 28, reshaped by issue 29) ----
    // A flow holds no shape of its own, so the carriage is the whole of its body. aBurst says what
    // the stack is now, and the animal covers ground in exactly two of the four states: it melts
    // into a sheet FLOWW widths across and runs the fall of the ground as a sheet, it stands back
    // up as a column FLOWH tall where the sheet stopped, and the discharge is one hop that carries
    // the column back up the rise. Every other moment it is a gathered blob and it is still.
    // Every part scales about the ground point, so the stack stays one body however far it
    // spreads, and the head on top goes with it.
    float spread = 0.0, sy = 1.0, sxz = 1.0, lift = 0.0;
    if (aBurst <= CHARGE) {
      float q = aBurst / CHARGE;
      spread = smoothstep(0.0, FLOWMELT, q) * (1.0 - smoothstep(FLOWSET, FLOWRISE, q));
      float rise = smoothstep(FLOWSET, FLOWRISE, q);   // the column, standing where the sheet ran out
      sy = mix(mix(1.0, FLOWS, spread), FLOWH, rise);
      sxz = mix(mix(1.0, FLOWW, spread), FLOWN, rise);
    } else {
      // The hop. It leaves the ground as the column it stood as, is a ball again by the top of the
      // arc, and spreads as it lands. Every part is back at the rest shape at the end of it, so
      // the step into the next rest costs the body nothing.
      float a = (aBurst - CHARGE) / (1.0 - CHARGE);
      float fall = smoothstep(0.0, 0.45, a);
      float land = sin(smoothstep(0.72, 1.0, a) * 3.1416);
      lift = FLOWHOP * 4.0 * a * (1.0 - a);
      sy = mix(FLOWH, 1.0, fall) - FLOWSQ * land;
      sxz = mix(FLOWN, 1.0, fall) + FLOWSQ * land;
    }
    transformed.y *= sy;
    transformed.xz *= sxz;
    transformed.y += lift;
    // The sheet is the one moment the reader can pick the animal out of the grass from a distance,
    // so it carries its glow at full while it is spread and gives it back as it gathers.
    vGlow = max(vGlow, spread);
  #elif CARRY == 6
    // ---- roller (issue 28) ----
    // A roll: it folds the legs and the head into the hull, drops on to the ball of its own body,
    // and goes straight ahead. aBurst is the clock of the fold. It runs 0 to CHARGE while the
    // animal folds, holds over CHARGE through the whole roll, and the recover runs it back down
    // through the same numbers, so the unfold is the fold played backwards and costs no code.
    float tk = smoothstep(0.0, CHARGE, aBurst);
    vec3 hub = vec3(0.0, ROLLC, 0.0);           // the centre of the ball, with the animal standing
    if (mode == 1.0 || mode == 3.0 || mode == 4.0 || mode == 5.0) {
      // A limb: a leg, the head, a lantern, or a feeler. Each one folds about its own pivot. The
      // reach away from the hull goes first, then the pivot itself comes home to ROLLTUCK of the
      // hull radius and what is left of the part shrinks with it, so at the end of the fold the
      // outline is the hull and nothing else. A limb never turns with the hull: it is inside the
      // hull by the time the hull turns, so the legs of a standing animal point at the ground
      // whatever angle the last roll left the hull at.
      vec3 rad = aPivot - hub;
      float rl = length(rad);
      vec3 nrm = rl > 0.00001 ? rad / rl : vec3(0.0, -1.0, 0.0);
      vec3 pin = hub + nrm * min(rl, ROLLR * ROLLTUCK);
      vec3 dl = transformed - aPivot;
      dl -= nrm * dot(dl, nrm) * tk;
      transformed = mix(aPivot, pin, tk) + dl * (1.0 - 0.7 * tk);
    } else {
      // The hull, and everything that rides the tread. It turns about the right axis of the
      // animal, which is the local x axis, by the gait clock. The steering advances that clock by
      // the ground the animal covers, and strideUnits() gives it one turn for one circumference,
      // so the ball cannot skid. The hull is round about the axis, so a ball that stops at any
      // angle still stands right.
      vec3 dr = transformed - hub;
      c = cos(gb); sn = sin(gb);
      dr.yz = vec2(dr.y * c - dr.z * sn, dr.y * sn + dr.z * c);
      transformed = hub + dr;
    }
    // The legs hold the hull up. As they go in, the hull comes down on to the ground it rolls on.
    transformed.y -= ROLLDROP * tk;
  #elif CARRY == 8
    // ---- slinger (issue 28): the throw ----
    // aBurst is the clock, as it is for every impulse carriage. It holds at 0 while the animal has
    // nothing to hold, runs 0 to CHARGE while the body hauls back against the tendon, and CHARGE to
    // 1 through the throw. The mover covers the ground, so the carriage adds no travel of its own:
    // it adds the haul, the arc over the ground, and the pitch that puts the nose down the arc.
    //
    // The throw ends level, with no arc and no pitch left, so the body needs no phase to settle in:
    // aBurst falls back through the same band in a recovery, which would replay the arc backwards.
    // The slinger therefore takes no recovery, and it settles by lying still and crawling. See
    // IMPULSE.slinger.
    vec3 off = vec3(0.0);
    float pit = 0.0, acti = smoothstep(0.0, 0.3, mv);
    if (aBurst < 0.0001) {
      // Nothing in reach: it crawls. The body keeps low and creeps forward and back on the slow
      // clock, and the sections sway, so a slinger with nothing to hold still reads as alive.
      off.z += CRAWLZ * sin(sb * 0.6) * acti;
      off.y -= CRAWLY * (0.5 + 0.5 * sin(sb * 1.2)) * acti;
    } else if (aBurst < CHARGE) {
      float q = aBurst / CHARGE;
      off.z -= SLINGB * sin(q * 1.5708);            // it hauls back along -aim against the tendon
      off.y -= SLINGB * 0.35 * sin(q * 3.1416);     // and it sinks a little as it winds
      pit = -SLINGP * 0.4 * sin(q * 1.5708);        // a negative pitch lifts the nose
    } else {
      float a = (aBurst - CHARGE) / (1.0 - CHARGE);
      off.y += SLINGH * 4.0 * a * (1.0 - a);        // the arc, whose height comes from the gravity
      pit = -SLINGP * (1.0 - 2.0 * a) * sin(a * 3.1416);   // nose up out of the throw, nose down into the landing
    }
    // The pitch turns the body about its own left axis, so the nose goes down and the tail goes up.
    // The tendon takes neither the pitch nor the offset at its far end: that end is on the plant,
    // and a carriage that moved the whole tube would take the tip off the hold.
    vec3 pre = transformed;
    c = cos(pit); sn = sin(pit);
    transformed.yz = vec2(transformed.y * c - transformed.z * sn, transformed.y * sn + transformed.z * c);
    float hold = mode == 9.0 ? tendT : 0.0;
    transformed = mix(transformed, pre, hold) + off * (1.0 - hold);
  #endif
  }
`;

// the hop rate of a monopod: quick short hops in high gravity, slow long ones in low gravity
export const hopGait = (G) => G.gait * clamp(Math.sqrt(G.gravity || 1), 0.6, 1.6);

// How many times the body rises in one gait cycle: once over every footfall. A quad in the lateral
// sequence takes four steps a cycle, a biped two, an insect two, because its tripods alternate.
const BOB_BEATS = { biped: 2, tripod: 3, quad: 4, hexapod: 2 };
// The side-to-side rock of the body, once a cycle, as a part of the body radius. A biped rolls its
// hips over the standing leg; an insect on six legs hardly rocks at all.
const ROCK_K = { biped: 0.15, tripod: 0.08, quad: 0.09, hexapod: 0.03 };
// How far the body leans into its tightest turn, in radians. A flyer banks; a walker leans a little.
const LEAN_K = { wings: 0.55, fins: 0.35, sac: 0.15 };
// ---- roller (issue 28) ----
// The carriage of every impulse locomotion sits in a table of its own, so the three packages of
// issue 28 each add one row and the merge keeps all three.
const IMPULSE_CARRY = { roller: CARRY.ROLL, flow: CARRY.FLOW, slinger: CARRY.SLING };
// Where the pivot of a folded part sits at the end of the fold, as a part of the hull radius.
// It is well inside the hull, so nothing a roller grows can break the outline of the ball.
const ROLL_TUCK = 0.7;

function rigConstants(G) {
  // An impulse locomotion has no walk to fall back on: its carriage is the whole of its body, and
  // IMPULSE_CARRY holds one row per locomotion.
  const carry = { monopod: CARRY.HOP, serpent: CARRY.WAVE, sac: CARRY.FLOAT, wings: CARRY.FLOAT, fins: CARRY.FLOAT, arch: CARRY.ARCH, periscope: CARRY.RISE, plough: CARRY.RISE }[G.loco] ?? IMPULSE_CARRY[G.loco] ?? CARRY.WALK;
  // ---- flow (issue 28) ----
  // The rest height of the ring stack. The shader divides by it to find where a vertex sits in the
  // body, so the top of the stack can lead the throw. Every other carriage leaves it alone.
  const flowY = G.loco === 'flow' ? flowBody(G).h : 1;
  const B = bodySections(G), len = B.front - B.back;
  const grav = G.gravity || 1;
  const gait = G.loco === 'monopod' ? hopGait(G) : G.gait;
  const hopH = clamp(0.45 / grav, 0.15, 0.9), crouch = G.legLen * 0.25, ext = G.legLen * 0.25;
  const bob = { biped: 0.03, tripod: 0.02, quad: 0.02, hexapod: 0.008, serpent: G.bodyR * 0.9, sac: 0.1, wings: 0.05, fins: 0.06 }[G.loco] || 0;
  const wave = G.loco === 'fins' ? 0.08 : 0;
  const wavek = G.loco === 'fins' ? 2.0 : G.loco === 'serpent' ? (2 * Math.PI) / (len * 1.1) : 5.0;
  const rise = G.loco === 'periscope' ? 0.05 + (G.segs - 1) * G.bodyR * 1.15 + G.bodyR * 2.4 : G.loco === 'plough' ? G.bodyR * 1.1 : 0;
  const sink = G.loco === 'plough' ? -0.97 : -0.3; // the plough dives only now and then; the periscope hides half the time
  const heave = G.loco === 'wings' ? 0.03 : 0; // body lift on each wing beat
  const glide = G.loco === 'wings' ? 0 : 1; // only true wings hold still and glide now and then
  // the form of the wing; a swarm and every other flyer take the numbers of the old paddle
  const WF = WING_FORM[wingStyle(G) || 'flit'];
  const legged = (LEG_SWING[G.loco] || 0) > 0;
  const duty = LEG_DUTY[G.loco] || 0.6;
  // the roll axis: the hip line of a walker, the body centre of a flyer
  const rolly = G.cls === 'air' ? 0.5 : G.legLen;
  // ---- slinger (issue 28) ----
  // The haul back against the tendon, the height of the arc, the pitch that carries the nose down
  // it, and the two amplitudes of the crawl. The arc reads the gravity the way the hop does: a
  // light world throws the body high and a heavy one keeps it flat. Every one of them sits in the
  // program key, so a change here compiles a new program instead of moving a live body.
  const slingB = len * 0.22, slingH = clamp(0.5 / grav, 0.18, 1.0), slingP = 0.55;
  const crawlZ = len * 0.05, crawlY = Math.max(0.01, G.bodyR * 0.12);
  const fx = (v) => Number(v).toFixed(4);
  const ints = new Set(['CARRY', 'LOCK']);
  const rows = [['CARRY', carry], ['LOCK', gaitLocked(G) ? 1 : 0], ['GAIT', gait], ['FLAP', G.flap * (wingStyle(G) ? WF.rate : 1)], ['SLOW', G.slow],
    ['BOB', bob], ['BOBN', BOB_BEATS[G.loco] || 2], ['ROCK', (ROCK_K[G.loco] || 0) * G.bodyR], ['DUTY', duty],
    ['SKEW', legged ? 0.35 : 0], ['LEAN', LEAN_K[G.loco] ?? (legged ? 0.1 : 0)], ['ROLLY', rolly],
    ['HEADYAW', legged || G.loco === 'serpent' ? 0.3 : G.cls === 'air' ? 0.15 : 0], ['SWAYG', legged ? 1 : 0],
    ['WAVE', wave], ['WAVEK', wavek], ['RISE', rise], ['SINK', sink],
    ['HEAVE', heave], ['GLIDE', glide], ['GLO', WF.glo], ['LAG', WF.lag], ['ELB', WF.elb], ['FOLD', WF.fold],
    ['HOLDA', WF.hold[0]], ['HOLDB', WF.hold[1]], ['WAVEV', G.loco === 'fins' ? 1 : 0], ['FRONT', B.front], ['LEN', len], ['HOPH', hopH], ['CHARGE', CHARGE_END], ['CROUCH', crouch], ['EXT', ext]];
  // ---- roller (issue 28) ----
  // The ball the animal rolls on: its radius, the height of its centre while the animal stands on
  // its legs, and the drop that puts it on the ground when the legs go in. The radius is the one
  // strideUnits() takes the circumference of, so the shape and the clock cannot drift apart.
  const rollC = G.legLen > 0 ? G.legLen - B.bot : -B.bot * 0.95, rollR = rollRadius(G);
  rows.push(['ROLLR', rollR], ['ROLLC', rollC], ['ROLLDROP', Math.max(0, rollC - rollR)], ['ROLLTUCK', ROLL_TUCK]);
  // ---- flow (issue 28) ---- the shape of the slick and of the column; see CARRY == 7
  rows.push(['FLOWY', flowY], ['FLOWW', FLOW_W], ['FLOWH', FLOW_H], ['FLOWS', FLOW_SLICK], ['FLOWN', FLOW_NARROW]);
  // The hop clears the ground the way the hop of a monopod does, and it takes its height from the
  // gravity for the same reason. It is the taller of the two: a flow throws the whole of its body,
  // and it carries no legs to hide the arc behind. Issue 29.
  rows.push(['FLOWMELT', FLOW_MELT], ['FLOWSET', FLOW_SET], ['FLOWRISE', FLOW_RISE], ['FLOWSQ', FLOW_SQUASH],
    ['FLOWHOP', clamp(0.75 / grav, 0.25, 1.5)]);
  // ---- slinger (issue 28) ---- the haul, the arc, the pitch, the tendon stub, and the crawl
  rows.push(['SLINGB', slingB], ['SLINGH', slingH], ['SLINGP', slingP], ['TENDL', TENDON_STUB], ['CRAWLZ', crawlZ], ['CRAWLY', crawlY]);
  return rows.map(([k, v]) => `#define ${k} ${ints.has(k) ? v : fx(v)}\n`).join('');
}

export function faunaMaterial(G) {
  const glowy = G.cls === 'air' || G.head === 'lure' || G.extras.includes('beads');
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: G.loco === 'sac' ? 0.5 : 0.85, metalness: 0,
    emissive: G.colors.glow, emissiveIntensity: glowy ? 0.9 : 0.5,
  });
  const consts = rigConstants(G);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${consts}uniform float uTime; attribute float aPhase; attribute vec4 aAnim; attribute vec3 aAnchor; attribute float glow; attribute vec4 aRig; attribute vec3 aPivot; attribute vec3 aPivot2; varying float vGlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n vGlow = glow;\n{${RIG_GLSL}}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vGlow;');
    mat.userData.shader = sh;
  };
  mat.customProgramCacheKey = () => consts;
  return mat;
}

// height of the creature above its home point on the inspector card
export function cardHover(G) {
  if (G.cls !== 'air') return 0;
  return G.loco === 'sac' ? 0.75 : G.loco === 'fins' ? 1.1 : G.plan === 'swarm' ? 0.45 : 0.55;
}

// ---------------------------------------------------------------- the gait clock
// A leg that swings at a fixed rate while the body slides over the ground skids, and that is what
// the fixed GAIT rate did: the leg cycle and the speed of the animal had nothing to do with each
// other. The clock now runs off the ground the animal covers.
//
// A foot holds the ground for DUTY of one cycle and sweeps back by `sweep` while it does. To hold
// its place the sweep must equal the ground the body covers in that time, so one cycle carries the
// body sweep / DUTY. That length is the stride, strideUnits() returns it, and the rate is
//   rate = speed / stride      cycles per second.
// The amplitude of the swing follows the speed too, through aMove, so the sweep shrinks with the
// speed and the rate holds through it.
const TAU = Math.PI * 2;
const smoothstep01 = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// The ground one gait cycle covers, in creature units, at full amplitude. A leg sweeps twice the
// sine of its swing about the hip. A serpent has no legs: its wave carries it about half a body
// length a cycle, so the same clock keeps its body from sliding sideways over the ground.
export function strideUnits(G, hipY = 0) {
  const swing = LEG_SWING[G.loco] || 0;
  // ---- roller (issue 28) ----
  // One turn of the ball carries it one circumference, and that is the whole reason the ball
  // cannot skid: the clock gives the hull 2 pi of aGait over exactly that much ground, and the
  // ROLL carriage turns the hull by aGait. The legs of a roller swing by nothing, so the branch
  // has to come before the swing test, or the clock would not lock at all.
  if (G.loco === 'roller') return TAU * rollRadius(G);
  if (swing > 0) {
    // The hip sits above the leg length, because the builder puts it inside the belly. Without the
    // real height the sweep of the foot comes out a third short and the feet slide backwards.
    const h = hipY > 0 ? hipY : G.legLen - 0.45 * bodySections(G).bot;
    return h > 0 ? (2 * h * Math.sin(swing)) / (LEG_DUTY[G.loco] || 0.6) : 0;
  }
  if (G.loco === 'serpent') { const B = bodySections(G); return (B.front - B.back) * 0.55; }
  return 0;
}
// A species whose cycle the steering drives, instead of the clock.
export function gaitLocked(G) { return strideUnits(G) > 1e-4; }

// The clock of one animal. `scale` turns creature units into world units, `top` is its top speed
// in the same units per second, and `hipY` is the hip height the builder put on the geometry. The
// rate is capped, because a nearly still animal has a nearly still amplitude and the rate that
// would hold its feet grows without bound.
export function makeGait(G, scale, top, hipY = 0) {
  const stride = strideUnits(G, hipY) * scale;
  // ---- roller (issue 28) ----
  // A leg sweeps less at a low speed, so the stride of a walker shrinks with the activity and the
  // clock reads that. A ball has no amplitude: one turn is one circumference at any speed. `amp`
  // says which of the two this animal is, and a roller holds its stride.
  const amp = G.loco !== 'roller';
  // The cap is what holds the clock of a walker finite: its amplitude falls to zero as it stops,
  // and the rate that would hold its feet in place grows without bound. A ball has no amplitude,
  // so its rate is the ground over the stride and nothing more. A cap there would only turn the
  // hull short through the fast part of a throw, which is the skid this clock exists to stop.
  return { phase: 0, stride, rate: 0, amp, max: stride > 0 ? (amp ? (TAU * 2.5 * top) / stride : Infinity) : 0 };
}
// Advance the clock by the ground the animal covered. `act` is the amplitude of the swing, 0 to 1.
export function stepGait(gt, spd, act, dt) {
  if (!gt || gt.stride <= 0) return 0;
  const s = gt.stride * (gt.amp === false ? 1 : act);
  gt.rate = s > 1e-4 ? Math.min((TAU * spd) / s, gt.max) : 0;
  gt.phase = (gt.phase + gt.rate * dt) % TAU;
  return gt.phase;
}

// ---------------------------------------------------------------- steering
// A creature roams on its tangent plane: (u, v) is its offset from home, `heading` its direction.
// Turning is driven by two slow oscillators with per-creature random frequencies, a leash pulls it
// back toward home, and grazers stop and start on a third oscillator. No two creatures share a rhythm.
// mv.turnR is the tightest circle the animal can walk, in the same units as the leash. It caps the
// turn rate by the speed, so an animal cannot pivot on the spot while it slides sideways.
export function makeMover(rng, mv) {
  // The wander rates were set before a turn had a radius, and most of them ask a body to spin on
  // the spot. The wander takes part of the tightest turn the animal can hold at its cruise, so the
  // animal keeps a little of its turn in hand and the way home is what uses the whole of it.
  const wander = mv.turnR > 0 && mv.speed > 0 ? Math.min(mv.turn, (WANDER_TURN * mv.speed) / mv.turnR) : mv.turn;
  return {
    u: 0, v: 0, heading: rng() * Math.PI * 2, spd: 0, rate: 0, turnN: 0,
    f1: 0.15 + rng() * 0.25, p1: rng() * 6.28, f2: 0.25 + rng() * 0.3, p2: rng() * 6.28, f3: 0.08 + rng() * 0.12, p3: rng() * 6.28,
    fp: 0.05 + rng() * 0.08, pp: rng() * 6.28,
    leash: mv.leash * (0.7 + rng() * 0.6), speed: mv.speed * (0.75 + rng() * 0.5), turn: wander, pause: mv.pause, flies: mv.flies,
    turnR: mv.turnR || 0,
  };
}
const WANDER_TURN = 0.55;   // the part of its tightest turn an animal spends on wandering
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// The tightest turn the animal can hold at its current speed, in radians per second. A standing
// animal keeps a little of it, because an animal can shuffle round on the spot, slowly.
export function turnCap(spd, top, turnR) {
  if (!(turnR > 0)) return Infinity;
  return (spd + 0.12 * top) / turnR;
}
// How hard the animal is turning, from -1 (its right) to 1 (its left). The shader leans the body,
// yaws the head, and shortens the stride of the inside legs by it. `rate` is in radians per second
// and its sign follows the heading, which rises to the right, so the sign flips here.
export function turnLean(spd, rate, top, turnR) {
  if (!(turnR > 0) || !(top > 0)) return 0;
  return -clamp((spd * rate) / ((top * top) / turnR), -1, 1);
}
export function stepMover(st, t, dt, burst = 1) {
  // burst: speed factor for this step (a hopper moves in the air, not on the ground)
  if (st.leash <= 0) return false;
  // wander: a slow drift plus a slower, smaller second drift
  let turn = Math.sin(t * st.f1 + st.p1) * 0.9 + Math.sin(t * st.f2 + st.p2) * 0.25;
  turn *= st.turn;
  // leash: the further out, the harder it steers home, in a wide arc
  const d = Math.hypot(st.u, st.v);
  if (d > st.leash * 0.5) {
    const home = Math.atan2(-st.v, -st.u);
    const k = Math.min(2, (d - st.leash * 0.5) / (st.leash * 0.5));
    // the pull is capped near the species' own turn rate, so the way home is an arc, not a snap;
    // a fast animal gets a cap that still turns it round inside its leash
    const cap = Math.max(st.turn * 1.2, 2.5 * st.speed / st.leash);
    turn += clamp(wrapAngle(home - st.heading), -1.2, 1.2) * cap * k;
    turn = clamp(turn, -cap * 1.3, cap * 1.3); // the wander and the pull together stay a smooth arc
  }
  // the turn rate eases toward its target, so the heading has no kinks
  st.rate += (turn - st.rate) * Math.min(1, dt * 2.0);
  // a turn is a circle the feet have to carry the body round, so the speed caps how tight it is
  const cap = turnCap(st.spd, st.speed, st.turnR);
  if (st.rate > cap) st.rate = cap; else if (st.rate < -cap) st.rate = -cap;
  // turnN is what the shader reads: 1 is the hardest turn to the animal's left, -1 to its right.
  // A rising heading turns the animal to its right, because the local +x axis is its left. The
  // measure is the sideways pull of the turn, the speed times the turn rate, against the pull at
  // the cruise speed on the tightest circle. A slow animal therefore leans little, and one at its
  // limit leans all the way. See turnLean().
  st.turnN = turnLean(st.spd, st.rate, st.speed, st.turnR);
  st.heading += st.rate * dt;
  // speed: breathes slowly; grazers stop for a while when the pause oscillator dips
  let target = st.speed * (0.65 + 0.35 * Math.sin(t * st.f3 + st.p3));
  if (st.pause > 0 && Math.sin(t * st.fp + st.pp) < -1 + st.pause * 0.9) target = 0;
  st.spd += (target - st.spd) * Math.min(1, dt * 1.5);
  st.u += Math.cos(st.heading) * st.spd * burst * dt;
  st.v += Math.sin(st.heading) * st.spd * burst * dt;
  return st.spd > st.speed * 0.05;
}
// ---------------------------------------------------------------- the impulse mover
// An impulse animal stores energy and lets it go in one throw. It picks a heading while it charges
// and holds that heading through the whole discharge: it never turns in flight. The world is what
// moves it, so the slope under it, the gravity, and whatever stands near it all shape the throw.
//
// One mover carries every impulse locomotion, and `aBurst` is the one number the shader reads: 0
// at rest, 0 to CHARGE_END through the charge, CHARGE_END to 1 through the discharge. The mover
// owns the timing, so it can wait for a slope, a plant, or the rest of its herd. The body and the
// steering therefore cannot drift apart, which is what the old hop speed factor could not promise.
//
// The mean speed over one whole cycle equals the cruise speed of the species, so the leash and the
// numbers in MOVE keep their meaning: the throw covers `range` of ground, and `range` is that
// cruise speed times the length of the whole cycle, times whatever the terrain rule allows.
export const CHARGE_END = 0.4;   // the part of aBurst the charge covers; the discharge takes the rest
const BURST_RAMP = 0.1;          // the part of the flight the throw takes to load and to unload
const REST_MOVING = 0.05;        // it charges only once it wants to travel at this part of its cruise
const LEASH_THROW = 0.8;         // the part of its leash one stretched throw may cover
const OWED_CAP = 2.5;            // the most ground one throw may bank, in whole cycles of the cruise
// The speed through the flight, as a part of the mean. The two ramps hold the ends, so the body
// does not jump from a stand to full speed, and each ramp gives half of its width, so the mean of
// the profile over the whole flight is 1.
function burstSpeed(q) {
  return (clamp(q / BURST_RAMP, 0, 1) * clamp((1 - q) / BURST_RAMP, 0, 1)) / (1 - BURST_RAMP);
}

// One row per impulse locomotion. `rest` and `recover` are parts of the throw cycle the animal
// spends waiting and settling. `ready(st)` says whether it may charge now, `hold(st)` gives the
// part of its speed it covers while it waits and charges, and `launch(st, want)` gives the ground
// the throw will cover, or 0 to refuse the throw and pick a new heading next time.
//
// A monopod has no rest and no recovery, so its hop reads exactly as it read before: a crouch of
// CHARGE_END of the cycle, then a parabola. Each new locomotion adds its own row below.
//
// ---- flow (issue 28, renumbered by issue 29) ---- the numbers of the flow row and of its rule
export const FLOW_UP = 1.0;            // the least a hop covers, as a multiple of the run down
const FLOW_REST = 2.0;                 // the part of one cycle it lurks, gathered and still
const FLOW_RECOVER = 0.15;             // the part of one cycle it settles in where it lands
const FLOW_FLY = 0.4;                  // the discharge is one hop, so it is shorter than a full one
const FLOW_GRAD = 4.0;                 // the gradient, rise over run, that gives it the whole of FLOW_RUN
const FLOW_LEVEL = 0.02;               // under this gradient the ground is flat and the wander steers
const FLOW_TURN = 3.0;                 // how quickly it swings onto the fall line, in radians a second
const FLOW_MARGIN = 0.9;               // how much of the cap it really takes, so the bank never runs dry
// The part of the charge the animal really runs for. flowHold() and the shader both read the same
// window, so the sheet is spread for every metre the animal covers, and the mean of the window
// over the whole charge is what the cap below has to divide by.
const flowWindow = (q) => smoothstep01(q, 0, FLOW_MELT) * (1 - smoothstep01(q, FLOW_SET, FLOW_RISE));
const FLOW_WIN = (() => { let a = 0; const n = 256; for (let i = 0; i < n; i++) a += flowWindow((i + 0.5) / n); return a / n; })();
// The most of its speed the fall line may give the run down. The mover pays every hop out of the
// ground the cruise banked, and the animal banks the whole cycle except the run, so the cap is
// what holds the hop longer than the run. Set the hop to FLOW_UP times the run and this is the
// answer. Above it the run would cover more than the hop can pay back, and the animal would work
// its way downhill instead of ending each cycle above where it began.
const FLOW_PARTS = CHARGE_END + (1 - CHARGE_END) * FLOW_FLY + FLOW_REST + FLOW_RECOVER;
const FLOW_RUN = (FLOW_MARGIN * FLOW_PARTS) / (FLOW_WIN * CHARGE_END * (1 + FLOW_UP));

// A row may also carry `track(st)`, which runs at the end of every step. A row that holds a point
// in the world uses it to keep that point in the frame of the instance while the body moves.
//
// A row may also carry `still: true`. It tells a tier that the animal holds its own ground between
// throws, so nothing may slide the body one metre it did not throw itself. A tier that carries its
// animals in a formation reads it and leaves such an animal where it stands. See st.still.

// ---------------------------------------------------------------- slinger (issue 28)
// The slinger travels on real holds. It looks for a plant inside its reach, throws a cord at it,
// hauls the body back against the cord, and lets go: the throw carries the body past the plant, so
// the cord comes off on its own. With nothing in reach it crawls and asks again.
//
// The plant says how long the throw is, not the mover, so a throw can carry the body further than
// the cruise speed has yet asked for. The extra is borrowed: `over` holds it, and every step pays
// as much of it back as the wander has banked, so the ground covered over many throws is still the
// ground the cruise asks for. The animal may not charge again until the debt is clear, and it
// crawls while it waits. That one rule is what holds the mean speed on any ground: a stand far
// apart makes the waits long and the throws long, and the mean of the two does not move.
//
// The reach widens while the asks come back empty and drops to the nominal one on a hold, so the
// animal reads the stand it is really in instead of a number set here.
const CRAWL = 0.2;            // the part of its speed it covers while it waits, charges, and crawls
const SLING_REST = 0.65;      // the part of the cycle it spends looking before it may charge
const SLING_PAST = 1.2;       // a throw carries the body this many times the distance to the hold
const SLING_LOOK = 1;         // seconds between two asks while it crawls
const SLING_WIDEN = 1.4;      // how much wider it asks after an ask that found nothing
const SLING_WIDE = 3;         // the widest it may ask, in nominal reaches
// How far either side of its heading a hold may stand. This is what keeps the leash: the wander
// has already turned the body toward home, so the only holds it will take are on the way home.
// A narrower arc leaves too few plants to choose from, and the animal then crawls most of its life
// on ground that really does carry a stand it could use.
export const ANCHOR_ARC = 1.9;

// True when a point (dx, dz) from the animal is a hold it can use: inside the reach, and inside
// the arc the body already faces. Every tier tests its own candidates with this, so the three
// nearAnchor hooks agree on what counts as a hold.
export function anchorFits(dx, dz, reach, st) {
  const d2 = dx * dx + dz * dz;
  if (d2 > reach * reach || d2 < 1e-12) return false;
  return Math.abs(wrapAngle(Math.atan2(dz, dx) - st.heading)) <= ANCHOR_ARC;
}

// The nominal reach of one animal: the ground its cruise speed covers in one whole throw cycle.
// Every tier gets the same rule, because both numbers are already in the units of that tier.
const slingReach = (st) => st.speed * st.total;

// It asks for a hold once a second while it waits. A hold it finds is kept on the state, and the
// charge then begins. Without one it stays at rest, where `hold` keeps it crawling on the wander,
// and it asks again a second later with a wider reach.
function slingerReady(st) {
  const find = st.hooks && st.hooks.nearAnchor;
  if (!find) { st.anchor = null; return false; }
  // The last throw ran ahead of the cruise speed. It pays that back before it throws again, and
  // the crawl is what it does while it waits.
  if (st.over > 0) return false;
  if (st.look > 0) return !!st.anchor;
  st.look = SLING_LOOK;
  const p = find(st.ox + st.u, st.oz + st.v, st.reach, st);
  if (p) { st.anchor = { x: p.x, z: p.z, y: p.y || 0 }; st.reach = slingReach(st); return true; }
  st.anchor = null;
  st.reach = Math.min(st.reach * SLING_WIDEN, st.reachMax);
  return false;
}

// The throw. It aims at the hold, not at the heading the wander left the body on, and it carries
// the body SLING_PAST times the distance to the hold, so the body passes it and the cord comes
// off. Whatever of that the cruise speed has not yet asked for is borrowed, and slingerTrack()
// pays it back out of the next few seconds of banking.
function slingerLaunch(st, owed) {
  const a = st.anchor;
  if (!a) return 0;
  const dx = a.x - (st.ox + st.u), dz = a.z - (st.oz + st.v);
  const d = Math.hypot(dx, dz);
  if (d < 1e-9) { st.anchor = null; return 0; }
  st.aim = Math.atan2(dz, dx);
  st.heading = st.aim;
  const range = Math.max(owed, d * SLING_PAST);
  st.over = range - owed;      // zero when the debt already covered the throw
  return range;
}

// The hold is a point in the world and the body moves, so the offset to it is measured again every
// step. aAnchor is in the frame of the instance: the animal faces its own +z and its own +x is its
// left, and the instance matrix is built from the heading, so +z lies along (cos hd, sin hd) over
// the ground the mover runs on and +x lies a quarter turn from it. Which quarter turn depends on
// the tier: the (u, v) plane of the globe and the (x, z) plane of the ground have opposite hands,
// so `st.hand` carries the sign and each caller sets it. `st.unit` is the size of one creature
// unit in the units the mover runs in, so the offset lands in the units the geometry is built in.
// The offset from an animal at (px, pz) facing `heading` to the hold `p`, in the frame of its
// instance. A tier whose drawn body stands a little away from its own mover — a member of a group
// beside the anchor of that group — measures from where the body really stands, and takes `unit`
// and `hand` from the same tier. `out` is a three-float array the caller owns.
export function anchorLocal(out, p, px, pz, heading, unit, hand) {
  const dx = p.x - px, dz = p.z - pz;
  const c = Math.cos(heading), s = Math.sin(heading);
  const u = unit > 0 ? unit : 1;
  out[0] = (hand * (dx * s - dz * c)) / u;
  out[1] = (p.y || 0) / u;
  out[2] = (dx * c + dz * s) / u;
  return out;
}
const _a3 = [0, 0, 0];

function slingerTrack(st, dt) {
  if (st.look > 0) st.look -= dt;
  // Pay back whatever the last throw ran ahead by, out of the ground the wander has banked since.
  // Both sides fall together, so the two never count one metre twice and the mean speed holds.
  if (st.over > 0 && st.owed > 0) {
    const pay = Math.min(st.over, st.owed);
    st.over -= pay; st.owed -= pay;
  }
  if (!st.anchor) { st.ax = 0; st.ay = 0; st.az = 0; return; }
  // The cord comes off when the throw is over: the body has passed the hold.
  if (st.phase === 'rest') { st.anchor = null; st.ax = 0; st.ay = 0; st.az = 0; return; }
  anchorLocal(_a3, st.anchor, st.ox + st.u, st.oz + st.v, st.heading, st.unit, st.hand);
  st.ax = _a3[0]; st.ay = _a3[1]; st.az = _a3[2];
}

const IMPULSE = {
  monopod: { rest: 0, recover: 0 },
  // ---- flow (issue 28) ----
  // A flow has nothing to push against, so the ground under it is what moves it. It lurks where it
  // stands for most of a cycle, melts into a sheet, runs the fall line as a sheet, stands back up
  // as a column where the sheet ran out, and hops the whole of itself back up the rise. It covers
  // ground in two states only, the sheet and the hop, and it is still in every other one. The hop
  // always covers more ground than the run did, so the animal ends a little above where it started
  // and never pours itself into the sea; FLOW_RUN is the cap that holds that. See CARRY == 7 for
  // the body the same numbers shape.
  flow: {
    rest: FLOW_REST, recover: FLOW_RECOVER, fly: FLOW_FLY, still: true,
    steer: flowSteer, hold: flowHold, launch: flowLaunch,
  },
  // ---- slinger (issue 28) ----
  // It waits for a plant it can hold, hauls back against the cord, and throws itself past the
  // plant. With nothing in reach it crawls on the wander at CRAWL of its speed and asks again
  // every SLING_LOOK seconds. It takes no recovery: see the comment on CARRY.SLING in RIG_GLSL.
  slinger: {
    rest: SLING_REST, recover: 0,
    hold: () => CRAWL,
    ready: slingerReady,
    launch: slingerLaunch,
    track: slingerTrack,
  },
};
const IMPULSE_DEFAULT = { rest: 0, recover: 0 };

// ---- flow (issue 28) ----
// The gradient under the animal and the way the ground falls. The hook answers in the units of its
// own tier, and a tier with no terrain under it, the inspector card, answers with nothing at all.
function flowSlope(st) {
  const g = st.hooks.slope && st.hooks.slope(st.ox + st.u, st.oz + st.v, st);
  if (!g) { st.grad = 0; return null; }
  st.grad = Math.hypot(g.gx, g.gz);
  return g;
}
// It faces down the fall line while it waits and while it charges. stepMover() carries the animal
// along st.heading and the wander is what picks that heading, so the heading is what has to point
// downhill. On flat ground it leaves the heading alone and the wander and the leash work as usual.
function flowSteer(st, dt) {
  const g = flowSlope(st);
  if (!g || st.grad < FLOW_LEVEL) return;
  const down = Math.atan2(-g.gz, -g.gx);
  st.heading += wrapAngle(down - st.heading) * Math.min(1, dt * FLOW_TURN);
}
// The part of its speed it covers in this step. It is zero in every phase but the charge, and zero
// through the head and the tail of the charge as well, so the animal moves only while the sheet is
// spread. A steep fall line carries the sheet at FLOW_RUN of the cruise; flat ground carries it
// nowhere, because a flow on the flat has nothing to run down. The cap is what matters: the mover
// pays every hop out of the ground the cruise banked, so a run that took more than FLOW_RUN would
// leave the hop shorter than the run, and the animal would work its way downhill cycle by cycle.
function flowHold(st) {
  if (st.phase !== 'charge') return 0;
  const q = clamp(st.tPhase / st.chargeT, 0, 1);
  return FLOW_RUN * flowWindow(q) * clamp(st.grad * FLOW_GRAD, 0, 1);
}
// The hop goes up the rise the run came down, which puts the animal back on the high ground it
// lurks from. Past half of its leash it goes home instead: an animal that only ever went up would
// climb out of its range and never come back, because the ground it charges over always falls away
// from it. The range is the whole of the banked ground, so the mean speed over many hops is the
// cruise speed the species carries.
function flowLaunch(st, owed) {
  const g = flowSlope(st);
  let aim = g && st.grad >= FLOW_LEVEL ? Math.atan2(g.gz, g.gx) : st.heading;
  const d = Math.hypot(st.u, st.v);
  if (d > st.leash * 0.5) {
    const home = Math.atan2(-st.v, -st.u);
    aim += wrapAngle(home - aim) * clamp((d - st.leash * 0.5) / (st.leash * 0.5), 0, 1);
  }
  st.aim = aim;   // the mover reads st.aim after this call, so the rule sets the heading of the throw here
  // A refusal costs nothing: the wander picks a new heading and the bank fills again. It only
  // happens when a long charge down a steep fall line has already covered the ground the cruise
  // asked for, and there is then nothing left for a throw to carry.
  return Math.max(0, owed);
}

// ---- roller (issue 28) ----
// ---- roller (issue 28) ----
// The rise of the ground along one heading, as a rise over a run. A positive value is uphill. Both
// ground tiers hand the mover the gradient of the terrain under the animal; the card has no
// terrain at all, so a tier with no slope hook reads as flat ground.
export function slopeAlong(st, aim) {
  const hook = st.hooks && st.hooks.slope;
  if (!hook) return 0;
  const g = hook(st.ox + st.u, st.oz + st.v, st);
  return g ? g.gx * Math.cos(aim) + g.gz * Math.sin(aim) : 0;
}
const ROLL_MAX_UP = 0.35;    // the steepest rise a ball will start up: about 19 degrees
const ROLL_SLOPE = 1.6;      // the part of one throw that one unit of slope gives, or takes away
const ROLL_SHORT = 0.45;     // the shortest a rise may leave a throw
const ROLL_LONG = 2.2;       // the longest a fall may carry one
// A roller folds its legs and its head into its hull, drops on to the ball of its own body, and
// rolls straight ahead. The world is what carries it, so the throw is longer down a slope and
// shorter up one, and a rise over ROLL_MAX_UP it will not start at all. It waits for a while
// before it folds and it settles for longer after it stops, because the fold, the roll, and the
// unfold each have to be read.
IMPULSE.roller = {
  // The roll is the whole point of the body, and a ball that stops after a second reads as a ball
  // that fell over. The discharge runs five times the plain one, and the wait grows with it, so
  // the throw still covers the ground the cruise speed asks for and the ball still rolls briskly.
  // A short wait and a long roll would make a ball that trundles; a long wait and a long roll make
  // one that stands, folds, goes, and stands again, which is what the manner text already says.
  rest: 2.5, recover: 0.45, fly: 5,
  launch(st, owed) {
    const s = slopeAlong(st, st.aim);
    // It refuses a rise it cannot hold. The debt stays on the books, and the wander picks another
    // heading before the animal asks again.
    if (s > ROLL_MAX_UP) return 0;
    return owed * clamp(1 - ROLL_SLOPE * s, ROLL_SHORT, ROLL_LONG);
  },
};

// The length of one throw of a species, in seconds.
export function impulseCycle(G) {
  if (G.loco === 'monopod') return TAU / hopGait(G);
  // ---- flow (issue 28, reshaped by issue 29) ----
  // A flow is slow. The charge alone has to read as three things, a melt, a run, and a column that
  // stands back up, and the lurk before it is longer than all three. One whole cycle runs about
  // nine seconds, of which five are the lurk.
  if (G.loco === 'flow') return 5;
  // ---- roller (issue 28) ----
  // A ball this size cannot flick. The fold, the roll, and the unfold each have to be read, so the
  // throw is slow, and G.gait gives the species its own tempo as it does for every locomotion. The
  // gravity sets the rest, as it sets the rate of a hop: a heavy world gives short quick throws and
  // a light one long slow ones. The ground one throw covers follows, because a throw pays whatever
  // the cruise has banked over the whole cycle, so the lore of a light world holds: one throw there
  // does carry the animal a long way.
  if (G.loco === 'roller') return clamp(3.6 / ((G.gait || 1.5) * clamp(Math.sqrt(G.gravity || 1), 0.6, 1.6)), 1.6, 3.2);
  // A slinger hangs on its arc, so a light world gives it a long throw and a heavy one a short.
  // The cycle is long for a reason as well as for the look of it: the reach the animal asks for is
  // the ground it owes, and the ground it owes is the cruise speed times the cycle. A short cycle
  // would give a reach of a few metres, and a slinger would then crawl past every stand it met.
  if (G.loco === 'slinger') return clamp(3.0 / Math.sqrt(G.gravity || 1), 2.0, 4.2);
  return 2;
}
// The steering record an impulse mover needs, built from the genome and the move record of a tier.
export function impulseMove(G, mv) {
  return { ...mv, loco: G.loco, cycle: impulseCycle(G), gravity: G.gravity || 1 };
}

// hooks.slope(x, z, st)         -> { gx, gz }, the gradient of the ground, or null on a tier with none
// hooks.nearAnchor(x, z, r, st) -> { x, z, y } or null. Only the slinger reads it. The point comes
//   back in the coordinates the tier passed in, with `y` its height over the ground. It must be
//   the nearest hold that anchorFits() accepts, so the arc that keeps the leash holds on every
//   tier. `st` is passed as `slope` already takes it, and a tier free to ignore it.
export function makeImpulseMover(rng, mv, hooks = {}) {
  const st = makeMover(rng, mv);
  const rule = IMPULSE[mv.loco] || IMPULSE_DEFAULT;
  st.impulse = true;
  st.loco = mv.loco;
  st.rule = rule;
  st.hooks = hooks;
  st.gravity = mv.gravity || 1;
  st.cycle = mv.cycle > 0 ? mv.cycle : 2;
  // `fly` stretches the discharge alone. aBurst still runs CHARGE_END to 1 over it, so the body
  // reads the same; only the seconds change. A roller takes it, because a ball that stops after a
  // second reads as a ball that fell over.
  const fly = rule.fly > 0 ? rule.fly : 1;
  st.chargeT = st.cycle * CHARGE_END;
  st.flyT = st.cycle * (1 - CHARGE_END) * fly;
  st.restT = st.cycle * (rule.rest || 0);
  st.recoverT = st.cycle * (rule.recover || 0);
  st.total = st.chargeT + st.flyT + st.restT + st.recoverT;
  // One throw covers the ground the cruise speed banked over the whole cycle, so a stretched
  // discharge asks for a long throw. A leash the throw would fly straight past is no leash at all:
  // the animal would spend its life at the end of its rope. A row that stretches its discharge
  // therefore accepts a cap: every phase comes down together until one throw fits inside
  // LEASH_THROW of the leash. The three tiers then keep their own character, because the leash of
  // a tier is what says how much room there is. The ground gives an animal a leash of a hundred
  // metres and the whole long roll fits; the globe gives it a leash of a few seconds of travel,
  // and the roll there stays short, where a creature is two pixels across and nobody counts it.
  //
  // A row with no stretch is left alone. The hop of a monopod is its own rate, hopGait(G), and a
  // cap on it would change a body that has read the same way since before this mover existed.
  if (fly > 1 && st.speed > 0) {
    const room = st.leash * LEASH_THROW;
    if (st.total * st.speed > room) {
      const k = room / (st.total * st.speed);
      st.chargeT *= k; st.flyT *= k; st.restT *= k; st.recoverT *= k;
      st.cycle *= k; st.total *= k;
    }
  }
  st.phase = 'rest';
  st.tPhase = 0;
  st.burst = 0;
  st.aim = st.heading;
  st.range = 0;
  st.anchor = null;
  st.ax = 0; st.ay = 0; st.az = 0;      // aAnchor, in the frame of the instance
  // ---- slinger (issue 28) ----
  // What a row that holds a point in the world needs of its tier. The caller sets all four after
  // it builds the mover; the defaults are the ones a tier with no frame of its own would use.
  //   ox, oz  the point (u, v) is measured from, in the coordinates the hooks understand
  //   unit    the size of one creature unit there, so aAnchor lands in the units of the geometry
  //   hand    +1 where the (u, v) plane turns to the left of the heading, -1 where it turns right
  st.ox = 0; st.oz = 0;
  st.unit = 1;
  st.hand = 1;
  st.look = 0;                          // seconds left before it may ask for a hold again
  st.over = 0;                          // the ground the last throw ran ahead of the cruise by
  // The reach it asks with, and the widest it may ask. The nominal reach is one cycle of cruise,
  // and it may widen to SLING_WIDE of them on ground that carries nothing nearer. The bound is a
  // multiple of the cycle and not a part of the leash, because the globe gives an animal a leash
  // of about one cycle: a bound off the leash there would hold the reach at the nominal one, and
  // a slinger on a globe would crawl its whole life past plants it could have held. The leash is
  // kept by the arc instead: the pull home turns the body, and the arc only takes a hold it faces.
  st.reach = slingReach(st);
  st.reachMax = st.reach * SLING_WIDE;
  st.holds = !!rule.track;              // it carries a point in the world, so the caller writes aAnchor
  // It is still between throws, so no tier may shuffle it on to a place in a formation. Issue 29.
  st.still = !!rule.still;
  // A herd of them would go off as one body without this. Every member takes its own offset, so a
  // herd of rollers reads as a burst of seeds. It is spent on the first throw and never returns.
  // The offset comes from a phase the wander already drew, and not from a fresh draw: the three
  // callers share one generator over every creature they build, so one more draw here would move
  // every animal built after an impulse animal.
  st.stagger = (st.pp / TAU) * st.total;
  st.owed = 0;          // the ground the cruise has asked for and no throw has yet given
  return st;
}

export function stepImpulse(st, t, dt) {
  if (st.leash <= 0) return false;
  st.tPhase += dt;
  // ---- flow (issue 28) ----
  // An optional hook on the rule, called while the animal waits and while it charges. stepMover()
  // carries the animal along st.heading, and the wander is what picks that heading, so a rule whose
  // charge has to follow the ground sets the heading here, before the step. A rule with no steer()
  // is untouched, so the monopod, the roller, and the slinger read as they read before.
  if (st.rule.steer && (st.phase === 'rest' || st.phase === 'charge')) st.rule.steer(st, dt);
  // The wander runs in every phase, so the speed keeps breathing, the pause habit still stops the
  // animal, and the leash still knows where home is. It covers ground only where `hold` lets it.
  const hold = st.phase === 'fly' ? 0 : (st.rule.hold ? st.rule.hold(st) : 0);
  const hd = st.heading;
  stepMover(st, t, dt, hold);
  // The ground the wander asked for and the throw has not yet given. A throw pays the whole debt
  // at once, so the ground covered over many cycles is the ground the cruise speed asks for, and
  // the leash and the numbers in MOVE keep their meaning. A refused throw banks the debt instead.
  st.owed = Math.min(st.owed + st.spd * (1 - hold) * dt, st.speed * st.total * OWED_CAP);

  if (st.phase === 'rest') {
    st.burst = 0;
    const wait = st.restT + st.stagger;
    const willing = st.spd > st.speed * REST_MOVING;
    const ready = st.rule.ready ? st.rule.ready(st) : true;
    if (st.tPhase >= wait && willing && ready) { st.stagger = 0; st.phase = 'charge'; st.tPhase = 0; }
  } else if (st.phase === 'charge') {
    st.burst = clamp(st.tPhase / st.chargeT, 0, 1) * CHARGE_END;
    if (st.tPhase >= st.chargeT) {
      // The heading is locked here, and it holds through the whole flight.
      st.aim = st.heading;
      st.range = st.rule.launch ? st.rule.launch(st, st.owed) : st.owed;
      if (st.range > 0) { st.owed = 0; st.phase = 'fly'; st.tPhase = 0; }
      // A refused throw drops it back to rest, where the wander picks a new heading. The debt
      // stays on the books, so the next throw that goes carries the ground this one did not.
      else { st.phase = 'rest'; st.tPhase = 0; st.burst = 0; }
    }
  } else if (st.phase === 'fly') {
    const q = clamp(st.tPhase / st.flyT, 0, 1);
    st.burst = CHARGE_END + q * (1 - CHARGE_END);
    const v = (st.range / st.flyT) * burstSpeed(q);
    st.u += Math.cos(st.aim) * v * dt;
    st.v += Math.sin(st.aim) * v * dt;
    st.heading = st.aim;      // it never turns in flight
    st.rate = 0;
    st.turnN = 0;
    if (st.tPhase >= st.flyT) {
      st.phase = st.recoverT > 0 ? 'recover' : 'rest';
      st.tPhase = 0;
      if (st.recoverT <= 0) st.burst = 0;
    }
  } else {
    // recover: the body settles and the burst eases out of the shape the throw left it in
    st.burst = 1 - clamp(st.tPhase / st.recoverT, 0, 1);
    st.heading = hd;
    st.rate = 0;
    st.turnN = 0;
    if (st.tPhase >= st.recoverT) { st.phase = 'rest'; st.tPhase = 0; st.burst = 0; }
  }
  // A row that holds a point in the world keeps it in the frame of the instance here, because the
  // body has moved this step and the point has not. See IMPULSE.slinger and slingerTrack().
  if (st.rule.track) st.rule.track(st, dt);
  return st.spd > st.speed * 0.05;
}
// The caller met water, or the edge of the patch, and put the animal back where it was. A throw
// in flight has to end there: the flight holds one heading and would otherwise drive the body into
// the same edge for the rest of the throw. The ground the throw had left to cover goes back on the
// books, so the cruise speed of the species still holds over the next few throws.
export function impulseBlocked(st) {
  if (!st.impulse) return;
  if (st.phase === 'fly') st.owed += st.range * (1 - clamp(st.tPhase / st.flyT, 0, 1));
  st.phase = 'rest';
  st.tPhase = 0;
  st.burst = 0;
}

// One step of whichever model carries this animal. The three callers hold movers of both kinds in
// one list, so they ask for the step and never test the mode again.
export function stepAny(st, t, dt) {
  return st.impulse ? stepImpulse(st, t, dt) : stepMover(st, t, dt);
}
// The mover of one animal, from its genome and the move record of the tier it lives on.
export function makeAnyMover(rng, G, mv, hooks) {
  return G.move.mode === 'impulse' ? makeImpulseMover(rng, impulseMove(G, mv), hooks) : makeMover(rng, mv);
}

// 0..1 activity for the rig: the amplitude of the leg swing. It holds at zero until the animal
// really moves and reaches full swing at a third of the top speed, so a nearly still animal stands
// on straight legs instead of shuffling. Below that the gait clock caps its own rate; see stepGait.
export const moverActivity = (st) => (st.speed > 0 ? smoothstep01(st.spd / st.speed, 0.05, 0.3) : 1);
// The same measure for one animal of a group, which moves at its own speed inside the formation.
export const speedActivity = (spd, top) => (top > 0 ? smoothstep01(spd / top, 0.05, 0.3) : 1);

// ---------------------------------------------------------------- inspector card
// ---- slinger (issue 28) ----
// The posts the card grows for a species that hooks a plant. They stand in a ring between these
// two radii of the ground disc, so the animal reaches them from most of its walk and none of them
// stands where it lands. See Inspector.buildPosts().
const POST_RING = [1.5, 2.6];   // card units from the centre of the disc
const POST_H = 1.0;             // card units: the height of one post
const POST_HOLD = 0.7;          // the part of the way up a post the cord takes hold

export class Inspector {
  constructor({ card, canvas, onClose }) {
    this.card = card; this.canvas = canvas;
    this.nameEl = card.querySelector('.cname'); this.latinEl = card.querySelector('.clatin');
    this.tagsEl = card.querySelector('.ctags'); this.storyEl = card.querySelector('.cstory');
    this.onClose = onClose;
    this.renderer = null; this.open = false; this.species = null;
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    this.camera.position.set(0, 3.3, 7.6);
    this.camera.lookAt(0, 0.55, 0);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.6); sun.position.set(2.5, 4, 3);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005;
    const sc = sun.shadow.camera; sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 14;
    this.scene.add(sun, new THREE.HemisphereLight('#9fbfff', '#3a2a1a', 0.7));
    this.fill = new THREE.DirectionalLight('#6a86d8', 0.5); this.fill.position.set(-3, 1, -2); this.scene.add(this.fill);
    this.groundR = 3.6; this.walkR = 3.0; // the leash reaches walkR; the animal is clamped just inside the disc edge
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(this.groundR, 28), new THREE.MeshStandardMaterial({ color: '#6fa85a', roughness: 1, flatShading: true }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.trailN = 160;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trailN * 3), 3));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this.mesh = null; this.mover = null; this.trailPts = [];
    this.pathScale = 1; this.fit = 1;
    this.posts = null; this.postAt = [];   // slinger (issue 28): the holds the card grows
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  // ---- slinger (issue 28) ----
  // The holds the card grows, and the hooks the impulse mover reads on this tier. The card is a
  // flat disc, so it has no slope. A species that hooks a real plant needs real plants to hook, so
  // the card seats three or four posts on the disc and the mover throws between them; every other
  // species keeps a bare disc. The card seed places them, so one species always gets one card.
  //
  // The posts are laid out in the units the mover runs in, because that is what nearAnchor is
  // asked in: the drawn positions are those times pathScale. So show() must know pathScale before
  // it calls this.
  buildPosts(G, palette, rngSeed) {
    if (this.posts) { this.scene.remove(this.posts); this.posts.geometry.dispose(); this.posts.material.dispose(); this.posts = null; }
    this.postAt = [];
    if (G.loco !== 'slinger' || !(this.pathScale > 0)) return;
    let s = rngSeed * 2654435761 >>> 0;
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const n = 3 + Math.floor(r() * 2);
    const geo = floraGeometry(FLORA.PINE, palette.flora, 0);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 });
    const inst = new THREE.InstancedMesh(geo, mat, n);
    inst.castShadow = true; inst.receiveShadow = true;
    const a0 = r() * TAU;
    for (let i = 0; i < n; i++) {
      // one post per sector of the disc, so no two stand together and none stands at the centre
      const a = a0 + ((i + 0.15 + r() * 0.7) / n) * TAU;
      const rad = POST_RING[0] + r() * (POST_RING[1] - POST_RING[0]);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad, h = POST_H * (0.8 + r() * 0.5);
      this._m.compose(this._p.set(x, 0, z), this._q.setFromAxisAngle(_up, r() * TAU), this._s.set(h, h, h));
      inst.setMatrixAt(i, this._m);
      // the hold is partway up the post, in mover units
      this.postAt.push({ x: x / this.pathScale, z: z / this.pathScale, y: (h * POST_HOLD) / this.pathScale });
    }
    inst.instanceMatrix.needsUpdate = true;
    this.posts = inst;
    this.scene.add(inst);
  }
  hooks() {
    if (!this.postAt.length) return {};
    // The nearest post the arc accepts. The card holds four of them, so the walk is the whole list.
    const nearAnchor = (x, z, reach, st) => {
      let best = null, bd = Infinity;
      for (const p of this.postAt) {
        const dx = p.x - x, dz = p.z - z;
        if (!anchorFits(dx, dz, reach, st)) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    };
    return { nearAnchor };
  }
  show(G, palette, groundColor, rngSeed = 3) {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.species = G;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
    const geo = buildCreature(G, palette, palette.flora);
    // aAnim carries the four dynamic floats: the activity, the gait clock, the turn, and the burst.
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
    geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array([1, 0, 0, 0]), 4));
    geo.setAttribute('aAnchor', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 0]), 3));
    this.mesh = new THREE.InstancedMesh(geo, faunaMaterial(G), 1);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    const size = new THREE.Box3().setFromBufferAttribute(geo.attributes.position).getSize(new THREE.Vector3());
    this.fit = 1.25 / Math.max(size.y, size.x * 0.7, size.z * 0.7);
    this.hover = cardHover(G) * this.fit;
    this.scene.add(this.mesh);
    this.ground.material.color.set(groundColor);
    this.trail.material.color.set(G.colors.glow);
    // steering in card units: the leash maps to the whole ground disc, and the animal turns less than on the planet,
    // so it walks long arcs instead of wheeling on the spot
    let s = rngSeed; const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    // The path scale and the posts come before the mover, because the mover asks the hooks for a
    // hold in the units the path scale sets. Slinger, issue 28.
    this.pathScale = G.move.leash > 0 ? this.walkR / G.move.leash : 0;
    this.buildPosts(G, palette, rngSeed);
    // The card runs the same two models the planet runs, and it picks between them on G.move.mode.
    // The card has no terrain, so the impulse mover gets no slope hook and takes its plain throw.
    this.mover = makeAnyMover(rng, G, G.move, this.hooks());
    this.mover.leash = G.move.leash * 0.8; // no per-creature leash jitter on the card; the wide arcs of the pull home still fit the disc
    this.mover.turn = G.move.turn * 0.5;
    // time factor: every species crosses the card at about 1.2 units per second, whatever its planet speed
    this.timeK = G.move.speed > 0 ? clamp(1.2 / (G.move.speed * this.pathScale), 0.5, 2.5) : 1;
    // The tightest circle it walks, in the units the mover runs in: a body and a half of the card,
    // divided back through the path scale. The card is where the reader watches the walk closest,
    // so the same rule holds here as on the ground.
    this.mover.turnR = this.pathScale > 0 ? (this.fit * 1.5) / this.pathScale : 0;
    // One creature unit, in the units the mover runs in: the card draws the creature at `fit` card
    // units and the mover runs pathScale card units to one of its own. The frame of the card turns
    // to the left of the heading, as the ground does, so the hand is +1. Slinger, issue 28.
    this.mover.unit = this.pathScale > 0 ? this.fit / this.pathScale : 1;
    this.mover.hand = 1;
    // the gait clock, in card units: the card scales the creature by `fit` and its own time factor
    this.gait = gaitLocked(G) && this.pathScale > 0 ? makeGait(G, this.fit / this.pathScale, this.mover.speed, geo.userData.hipY) : null;
    this.trailPts = [];
    this.trail.geometry.attributes.position.array.fill(0);
    this.trail.geometry.attributes.position.needsUpdate = true;
    const lore = G.lore;
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
    // The card element is shared with the plant inspector, so a swap of subject hides this one and
    // shows the other in the same tick. The `show` class says whether anybody wants the card on
    // screen, and only a card nobody wants is really hidden. Without the test this timer would
    // hide the card 250 ms after the reader opened the other subject.
    setTimeout(() => { if (!this.open && !this.card.classList.contains('show')) this.card.hidden = true; }, 250);
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
    let x = 0, z = 0, yaw = t * 0.4;
    if (mv.leash > 0) {
      // run the same steering as on the planet, with time scaled so the walk reads well on the card
      // ---- roller (issue 28) ----
      // The gait clock reads the ground the animal really covered, and not the speed the wander
      // asked for. An impulse animal covers the whole of its ground in one throw, so the two are
      // not one number: a ball driven by the wander speed would turn while it stood still. A
      // wander species covers speed times the step, so the measure gives it what it had before.
      const pu = mv.u, pv = mv.v, dtK = dt * this.timeK;
      stepAny(mv, t * this.timeK, dtK);
      const gspd = dtK > 0 ? Math.hypot(mv.u - pu, mv.v - pv) / dtK : 0;
      x = mv.u * this.pathScale; z = mv.v * this.pathScale;
      const rr = Math.hypot(x, z), rMax = this.groundR - 0.35;
      if (rr > rMax) { x *= rMax / rr; z *= rMax / rr; }
      yaw = Math.atan2(Math.cos(mv.heading), Math.sin(mv.heading)); // model faces +z
      this.trailPts.push(x, this.hover * 0.02 + 0.01, z);
      if (this.trailPts.length > this.trailN * 3) this.trailPts.splice(0, 3);
      const arr = this.trail.geometry.attributes.position.array;
      arr.set(this.trailPts);
      for (let i = this.trailPts.length; i < arr.length; i += 3) { arr[i] = x; arr[i + 1] = 0.01; arr[i + 2] = z; }
      this.trail.geometry.attributes.position.needsUpdate = true;
      const at = this.mesh.geometry.attributes;
      const act = moverActivity(mv);
      const a = at.aAnim.array;
      a[0] = act;
      a[1] = this.gait ? stepGait(this.gait, gspd, act, dtK) : 0;
      a[2] = mv.turnN;
      a[3] = mv.burst || 0;
      at.aAnim.needsUpdate = true;
      // The hold the tendon is on, in the frame of the instance. A species that holds nothing
      // never writes here, so its three floats stay zero and its tendon, if it had one, would
      // collapse onto its own pivot. Slinger, issue 28.
      if (mv.holds) {
        const an = at.aAnchor.array;
        an[0] = mv.ax; an[1] = mv.ay; an[2] = mv.az;
        at.aAnchor.needsUpdate = true;
      }
    }
    this._q.setFromAxisAngle(_up, yaw);
    this._m.compose(this._p.set(x, this.hover, z), this._q, this._s.setScalar(this.fit));
    this.mesh.setMatrixAt(0, this._m);
    this.mesh.instanceMatrix.needsUpdate = true;
    // slow orbit so the geometry can be read from all sides
    const a = t * 0.12;
    this.camera.position.set(Math.sin(a) * 7.6, 3.3, Math.cos(a) * 7.6);
    this.camera.lookAt(0, 0.55 + this.hover * 0.5, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
