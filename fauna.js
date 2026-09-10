// myworlds — fauna: builds a creature from a genome (see species.js), rigs it for the vertex shader,
// steers it on the ground, and runs the inspector card.
//
// A genome says what the animal is made of: class (air / land / sub-surface), body plan, legs, head, extras.
// buildCreature() turns that into one merged low-poly geometry. Every vertex carries a rig record
// (mode, phase, amplitude, weight) and a pivot, and the shader animates each part by its mode on top of
// a whole-body "carriage" (walk bob, hop, wave, float, arch, rise). Nothing here is hand-placed per species.
import * as THREE from 'three';

export const BASE_SCALE = 0.0077; // 30% smaller than the first pass, so the globe reads as a miniature

// part modes
const RIG = { NONE: 0, LEG: 1, WING: 2, SWAY: 3, PULSE: 4, NOD: 5, SPIN: 6, STATIC: 7, FLUKE: 8 };
// whole-body carriages
const CARRY = { WALK: 0, HOP: 1, WAVE: 2, FLOAT: 3, ARCH: 4, RISE: 5 };

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

// a tapered two-sided wing sheet along +x with the root at the origin; the tip sweeps back
function wingGeo(span, chord, n = 5, sweep = 0.4) {
  const pos = [];
  const edge = (u) => {
    const c = chord * Math.sqrt(Math.max(0, 1 - u * u)) * (0.7 + 0.3 * Math.min(1, u * 4)), zc = -sweep * chord * u * u;
    return [zc + c * 0.5, zc - c * 0.5];
  };
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n, x0 = u0 * span, x1 = u1 * span;
    const [l0, t0] = edge(u0), [l1, t1] = edge(u1);
    const a = [x0, 0, l0], b = [x1, 0, l1], c = [x1, 0, t1], d = [x0, 0, t0];
    pos.push(...a, ...b, ...c, ...a, ...c, ...d); // top face
    pos.push(...a, ...c, ...b, ...a, ...d, ...c); // bottom face
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
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

// How far a leg swings, and how much of one cycle its foot stays on the ground (the duty factor).
// A walking quadruped keeps a foot down for about two thirds of a cycle, so three feet carry it at
// every moment; an insect runs an alternating tripod, so its duty is nearer a half. The shader
// reads the duty factor and the gait clock reads the swing; see "the gait clock" below.
export const LEG_SWING = { monopod: 0, biped: 0.5, tripod: 0.45, quad: 0.4, hexapod: 0.35 };
export const LEG_DUTY = { monopod: 0.5, biped: 0.6, tripod: 0.6, quad: 0.65, hexapod: 0.55 };

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
    // an insect keeps the alternating tripod: the front and the rear of one side with the middle of the other
    case 'hexapod': { let i = 0; for (const sz of [0.32, 0, -0.32]) for (const sx of [-1, 1]) out.push({ z: sz * len, dir: [sx, 0], phase: (i++ % 2) * Math.PI + (sz === 0 ? Math.PI : 0) }); break; }
  }
  return out;
}

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
  } else {
    for (const s of B.secs) {
      const color = s.second || s.alt ? body2 : (G.loco === 'sac' ? accent : body);
      const geo = s.shape === 'dodeca' ? block(s.r) : ball(s.r, s.d || 0);
      const o = G.loco === 'sac' ? { glow: 0.35, rig: [RIG.PULSE, 0, 0.05, 1], pivot: [0, yc, 0] } : {};
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
  const tall = G.loco === 'biped' || G.loco === 'monopod' || G.loco === 'tripod';
  let H, neckBase;
  if (G.loco === 'periscope') { H = [0, yc + R * 0.9, R * 0.3]; neckBase = [0, yc, 0]; }
  else if (tall) {
    neckBase = [0, yc + B.top * 0.4, B.front * 0.85];
    H = [0, yc + B.top + headR * 0.6, B.front + headR * 0.6];
    const s = bone(neckBase, H, headR * 0.35, body2, headR * 0.45);
    P(s.geo, s.color, s.matrix, { rig: [RIG.NOD, 0, 0.12, 1], pivot: neckBase });
  } else { neckBase = [0, yc, B.front * 0.8]; H = [0, yc + B.top * 0.2, B.front + headR * 0.7]; }
  const nod = { rig: [RIG.NOD, 0, G.head === 'lure' ? 0.04 : G.loco === 'periscope' ? 0.08 : 0.12, 1], pivot: neckBase };
  const nodG = (g) => ({ ...nod, glow: g });
  const eyeR = clamp(headR * 0.25, 0.02, 0.05);
  const eyes = () => { for (const sx of [-1, 1]) P(ico(eyeR), glow, M4(H[0] + sx * headR * 0.55, H[1] + headR * 0.25, H[2] + headR * 0.8), nodG(0.6)); };
  if (G.head !== 'none' || G.loco === 'periscope') P(ball(headR), G.plan === 'chain' ? body : body2, M4(H[0], H[1], H[2], 0.85, 0.85, 1.25), nod);
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

  // ---- locomotion extras: wings, fins, the sac's vent
  if (G.loco === 'wings') {
    // wing sheets rooted in the flank, with a bone along the leading edge. A spindle gets a second, smaller pair.
    const pairs = G.plan === 'spindle' ? [[B.front * 0.3, 1, 0], [B.back * 0.3, 0.72, 1.4]] : [[B.front * 0.05, 1, 0]];
    for (const [z, k, ph] of pairs) for (const sx of [-1, 1]) {
      const yw = yc + B.top * 0.35, span = R * 3.6 * k, chord = R * 1.5 * k;
      const root = [sx * Math.max(probe.hw(yw, z) * 0.8, R * 0.3), yw, z];
      const m = M4(root[0], root[1], root[2], sx, 1, 1, 0, sx * 0.12);
      const o = { glow: 0.3, rig: [RIG.WING, ph, 0.55, sx * span], pivot: root };
      // one panel per sheet at distance, and no leading-edge bone: the sheet is the silhouette
      P(wingGeo(span, chord, coarse ? 1 : 5), accent, m, o);
      if (coarse) continue;
      const rib = seg([0, 0.004, 0], [span * 0.95, 0.004, -chord * 0.2], 0.012, body2, 0.02, 4);
      P(rib.geo, rib.color, rib.matrix.premultiply(m), { ...o, glow: 0 });
    }
  }
  if (G.loco === 'fins') {
    for (const sx of [-1, 1]) {
      const root = [sx * R * 0.7, yc, B.front * 0.15];
      P(spike(R * 0.9, R * 2, 4), accent, M4(sx * R * 1.8, yc, B.front * 0.15, 0.14, 1, 1, 0, -sx * 1.4), { glow: 0.3, rig: [RIG.WING, 0, 0.2, sx * R * 2.2], pivot: root });
    }
    // the gill beads and the belly glow are decoration on the flank: they do not carry the outline
    if (!coarse) {
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
        const y = yc - R * 0.15, z = B.front * 0.55 + i * R * 0.3;
        P(ico(R * 0.1), body2, M4(sx * probe.hw(y, z) * 0.97, y, z, 0.6, 1, 1));
      }
      P(ico(R * 0.65, 1), glow, M4(0, yc - R * 0.65, B.front * 0.2, 0.7, 0.35, 1.9), { glow: 0.8 });
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
    if (coarse && e !== 'sail' && e !== 'plates') continue;
    switch (e) {
      case 'sail': {
        const bz = B.back * 0.15 + B.front * 0.1, base = [0, (probe.top(0, bz) ?? top) - 0.02, bz], sh = 0.35 + R;
        P(spike(R * 1.1, sh, 4), accent, M4(base[0], base[1] + sh * 0.45, base[2], 0.1, 1, 1.5, -0.25, 0), { glow: 0.45, rig: [RIG.SWAY, 0, 0.04, 1], pivot: base });
        if (coarse) break;      // the ribs sit inside the sheet of the sail
        for (const zk of [0.3, -0.05, -0.4]) {
          const z = base[2] + zk * R * 1.5, s = seg([0, base[1], z], [0, base[1] + sh * 0.85 * (1 - Math.abs(zk) * 0.5), z * 1.2 - 0.05], 0.008, body2, 0.006);
          P(s.geo, s.color, s.matrix, { rig: [RIG.SWAY, 0, 0.04, 1], pivot: base });
        }
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
        const tl = 0.35 + R * 1.2, tz = B.back * 0.8, root = [0, yc + B.top * 0.2, tz];
        P(cone(R * 0.25, tl, 4), air ? accent : body2, M4(0, root[1], tz - tl * 0.45, 1, 1, 1, -1.5, 0), { glow: air ? 0.3 : 0, rig: [RIG.SWAY, 0, 0.1, 1.5], pivot: root });
        break;
      }
      case 'flukes': {
        const root = [0, yc, B.back * 0.85];
        for (const sx of [-1, 1]) P(cone(R * 0.75, R * 1.7, 4), accent, M4(sx * R * 0.6, yc + B.top * 0.2, B.back * 0.85 - R * 0.45, 1, 1, 0.12, 1.2, sx * 0.7), { glow: 0.3, rig: [RIG.FLUKE, 0, 0.25, 1], pivot: root });
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
  float gl = max(GLIDE, smoothstep(-0.25, 0.25, sin(sb * 0.33 + 1.0))); // 1 = wings beat, 0 = wings held out
  vec3 d = transformed - aPivot;
  float c, sn, th;
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
    float beat = sin(f - u * 1.1) * amp * (0.5 + 0.9 * u);
    th = mix(0.2 + 0.25 * u, beat, gl) * side; c = cos(th); sn = sin(th);
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
    float hp = fract(gb / 6.2832), act = smoothstep(0.0, 0.3, mv), yb, stx;
    if (hp < HOPG) { yb = -CROUCH * sin(hp / HOPG * 3.1416) * act; stx = yb; }
    else {
      float a = (hp - HOPG) / (1.0 - HOPG), arc = sin(a * 3.1416);
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
    transformed.x += WAVE * sin(fb - transformed.z * WAVEK) * clamp(-transformed.z, 0.0, 2.0);
    // a flyer banks into its turn: the whole body rolls, wings and all
    th = -aTurn * LEAN; c = cos(th); sn = sin(th);
    vec2 rb = vec2(transformed.x, transformed.y - ROLLY);
    transformed.xy = vec2(rb.x * c - rb.y * sn, rb.x * sn + rb.y * c + ROLLY);
  #elif CARRY == 4
    transformed.y *= 0.85 + 0.15 * sin(sb);
    transformed.x += 0.05 * sin(sb * 0.6) * clamp(transformed.y, 0.0, 1.0);
  #elif CARRY == 5
    transformed.y -= RISE * (1.0 - smoothstep(SINK, SINK + 0.4, sin(sb * 0.35)));
  #endif
  }
`;

// the hop rate of a monopod: quick short hops in high gravity, slow long ones in low gravity
export const hopGait = (G) => G.gait * clamp(Math.sqrt(G.gravity || 1), 0.6, 1.6);
// speed factor for a hopper at real time t: it covers ground in the air and not on the ground. The mean is 1.
export function hopBurst(gait, t, phase) {
  const hp = ((t * gait + phase * 7) / (2 * Math.PI)) % 1;
  const air = clamp((hp - HOP_GROUND) / HOP_RAMP, 0, 1) * clamp((1 - hp) / HOP_RAMP, 0, 1);
  // The foot is on the ground for HOP_GROUND of the cycle and has to hold its place, so the animal
  // covers all of its ground in the air. The two ramps each give half of their width, so the mean
  // of `air` over one cycle is the width of the air window less one ramp. Dividing by it keeps the
  // mean of the burst at 1, and the cruise speed of the species holds.
  return air / (1 - HOP_GROUND - HOP_RAMP);
}
const HOP_GROUND = 0.4;   // the part of the hop cycle the foot spends on the ground
const HOP_RAMP = 0.06;    // how quickly the foot loads and unloads at the two ends of the flight

// How many times the body rises in one gait cycle: once over every footfall. A quad in the lateral
// sequence takes four steps a cycle, a biped two, an insect two, because its tripods alternate.
const BOB_BEATS = { biped: 2, tripod: 3, quad: 4, hexapod: 2 };
// The side-to-side rock of the body, once a cycle, as a part of the body radius. A biped rolls its
// hips over the standing leg; an insect on six legs hardly rocks at all.
const ROCK_K = { biped: 0.15, tripod: 0.08, quad: 0.09, hexapod: 0.03 };
// How far the body leans into its tightest turn, in radians. A flyer banks; a walker leans a little.
const LEAN_K = { wings: 0.55, fins: 0.35, sac: 0.15 };

function rigConstants(G) {
  const carry = { monopod: CARRY.HOP, serpent: CARRY.WAVE, sac: CARRY.FLOAT, wings: CARRY.FLOAT, fins: CARRY.FLOAT, arch: CARRY.ARCH, periscope: CARRY.RISE, plough: CARRY.RISE }[G.loco] ?? CARRY.WALK;
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
  const legged = (LEG_SWING[G.loco] || 0) > 0;
  const duty = LEG_DUTY[G.loco] || 0.6;
  // the roll axis: the hip line of a walker, the body centre of a flyer
  const rolly = G.cls === 'air' ? 0.5 : G.legLen;
  const fx = (v) => Number(v).toFixed(4);
  const ints = new Set(['CARRY', 'LOCK']);
  return [['CARRY', carry], ['LOCK', gaitLocked(G) ? 1 : 0], ['GAIT', gait], ['FLAP', G.flap], ['SLOW', G.slow],
    ['BOB', bob], ['BOBN', BOB_BEATS[G.loco] || 2], ['ROCK', (ROCK_K[G.loco] || 0) * G.bodyR], ['DUTY', duty],
    ['SKEW', legged ? 0.35 : 0], ['LEAN', LEAN_K[G.loco] ?? (legged ? 0.1 : 0)], ['ROLLY', rolly],
    ['HEADYAW', legged || G.loco === 'serpent' ? 0.3 : G.cls === 'air' ? 0.15 : 0], ['SWAYG', legged ? 1 : 0],
    ['WAVE', wave], ['WAVEK', wavek], ['RISE', rise], ['SINK', sink],
    ['HEAVE', heave], ['GLIDE', glide], ['FRONT', B.front], ['LEN', len], ['HOPH', hopH], ['HOPG', HOP_GROUND], ['CROUCH', crouch], ['EXT', ext]]
    .map(([k, v]) => `#define ${k} ${ints.has(k) ? v : fx(v)}\n`).join('');
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
      .replace('#include <common>', `#include <common>\n${consts}uniform float uTime; attribute float aPhase; attribute float aMove; attribute float aGait; attribute float aTurn; attribute float glow; attribute vec4 aRig; attribute vec3 aPivot; attribute vec3 aPivot2; varying float vGlow;`)
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
  return { phase: 0, stride, rate: 0, max: stride > 0 ? (TAU * 2.5 * top) / stride : 0 };
}
// Advance the clock by the ground the animal covered. `act` is the amplitude of the swing, 0 to 1.
export function stepGait(gt, spd, act, dt) {
  if (!gt || gt.stride <= 0) return 0;
  const s = gt.stride * act;
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
// 0..1 activity for the rig: the amplitude of the leg swing. It holds at zero until the animal
// really moves and reaches full swing at a third of the top speed, so a nearly still animal stands
// on straight legs instead of shuffling. Below that the gait clock caps its own rate; see stepGait.
export const moverActivity = (st) => (st.speed > 0 ? smoothstep01(st.spd / st.speed, 0.05, 0.3) : 1);
// The same measure for one animal of a group, which moves at its own speed inside the formation.
export const speedActivity = (spd, top) => (top > 0 ? smoothstep01(spd / top, 0.05, 0.3) : 1);

// ---------------------------------------------------------------- inspector card
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
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
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
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
    geo.setAttribute('aMove', new THREE.InstancedBufferAttribute(new Float32Array([1]), 1));
    geo.setAttribute('aGait', new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
    geo.setAttribute('aTurn', new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
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
    this.mover = makeMover(rng, G.move);
    this.mover.leash = G.move.leash * 0.8; // no per-creature leash jitter on the card; the wide arcs of the pull home still fit the disc
    this.mover.turn = G.move.turn * 0.5;
    this.pathScale = G.move.leash > 0 ? this.walkR / G.move.leash : 0;
    // time factor: every species crosses the card at about 1.2 units per second, whatever its planet speed
    this.timeK = G.move.speed > 0 ? clamp(1.2 / (G.move.speed * this.pathScale), 0.5, 2.5) : 1;
    // The tightest circle it walks, in the units the mover runs in: a body and a half of the card,
    // divided back through the path scale. The card is where the reader watches the walk closest,
    // so the same rule holds here as on the ground.
    this.mover.turnR = this.pathScale > 0 ? (this.fit * 1.5) / this.pathScale : 0;
    // the gait clock, in card units: the card scales the creature by `fit` and its own time factor
    this.gait = gaitLocked(G) && this.pathScale > 0 ? makeGait(G, this.fit / this.pathScale, this.mover.speed, geo.userData.hipY) : null;
    this.hop = G.loco === 'monopod' ? hopGait(G) : 0; // the hop clock runs on real time, like the shader
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
    let x = 0, z = 0, yaw = t * 0.4;
    if (mv.leash > 0) {
      // run the same steering as on the planet, with time scaled so the walk reads well on the card
      stepMover(mv, t * this.timeK, dt * this.timeK, this.hop ? hopBurst(this.hop, t, 0) : 1);
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
      at.aMove.setX(0, act); at.aMove.needsUpdate = true;
      if (this.gait) { at.aGait.setX(0, stepGait(this.gait, mv.spd, act, dt * this.timeK)); at.aGait.needsUpdate = true; }
      at.aTurn.setX(0, mv.turnN); at.aTurn.needsUpdate = true;
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
