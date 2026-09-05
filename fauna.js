// myworlds — fauna: builds a creature from a genome (see species.js), rigs it for the vertex shader,
// steers it on the ground, and runs the inspector card.
//
// A genome says what the animal is made of: class (air / land / sub-surface), body plan, legs, head, extras.
// buildCreature() turns that into one merged low-poly geometry. Every vertex carries a rig record
// (mode, phase, amplitude, weight) and a pivot, and the shader animates each part by its mode on top of
// a whole-body "carriage" (walk bob, hop, wave, float, arch, rise). Nothing here is hand-placed per species.
import * as THREE from 'three';

export const BASE_SCALE = 0.011;

// part modes
const RIG = { NONE: 0, LEG: 1, WING: 2, SWAY: 3, PULSE: 4, NOD: 5, SPIN: 6, STATIC: 7, FLUKE: 8 };
// whole-body carriages
const CARRY = { WALK: 0, HOP: 1, WAVE: 2, FLOAT: 3, ARCH: 4, RISE: 5 };

// ---------------------------------------------------------------- geometry helpers
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const cyl = (rt, rb, h, s = 5) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 5) => new THREE.ConeGeometry(r, h, s);
const dodeca = (r) => new THREE.DodecahedronGeometry(r, 0);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const M4 = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, ry = 0) =>
  new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz));
const _up = V3(0, 1, 0);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
// a cylinder between two points
function seg(a, b, r, color, r2 = r, sides = 4, glow = 0) {
  const d = V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize());
  const m = new THREE.Matrix4().compose(V3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, V3(1, 1, 1));
  return { geo: cyl(r2, r, len, sides), color, matrix: m, glow };
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

// legs: hip z, outward direction (x, z), and gait phase per locomotion; the hip x comes from the body width
function legPlan(G, len) {
  const out = [];
  switch (G.loco) {
    case 'monopod': out.push({ z: 0, dir: [0, 0], phase: 0 }); break;
    case 'biped': for (const sx of [-1, 1]) out.push({ z: 0, dir: [sx, 0], phase: sx < 0 ? 0 : Math.PI }); break;
    case 'tripod': for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; out.push({ z: Math.sin(a) * len * 0.22, dir: [Math.cos(a), Math.sin(a)], phase: i * 2.09 }); } break;
    case 'quad': for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) out.push({ z: sz * len * 0.3, dir: [sx, 0], phase: sx * sz > 0 ? 0 : Math.PI }); break;
    case 'hexapod': { let i = 0; for (const sz of [0.32, 0, -0.32]) for (const sx of [-1, 1]) out.push({ z: sz * len, dir: [sx, 0], phase: (i++ % 2) * Math.PI + (sz === 0 ? Math.PI : 0) }); break; }
  }
  return out;
}

// ---------------------------------------------------------------- creature geometry (base at y = 0, +y up, faces +z)
export function buildCreature(G, pal, flora) {
  const { body, body2, accent, glow } = G.colors;
  const sand = (pal && pal.fauna && pal.fauna.sand) || body2;
  const moss = flora ? flora.canopy : accent, trunk = flora ? flora.trunk : body2;
  const parts = [];
  const P = (geo, color, matrix, o = {}) => parts.push({ geo, color, matrix, glow: o.glow || 0, rig: o.rig || [RIG.NONE, 0, 0, 1], pivot: o.pivot || [0, 0, 0], pivot2: o.pivot2 || o.pivot || [0, 0, 0] });
  const PS = (sg, o) => P(sg.geo, sg.color, sg.matrix, o);
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
    P(ico(0.05 + R * 0.15), glow, M4(...core), { glow: 1, rig: [RIG.PULSE, 0, 0.15, 1], pivot: core });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, r = R * 1.3 + (i % 2) * R * 0.6, y = yc - 0.18 + (i % 3) * 0.17;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, rig = [RIG.SPIN, 0, 1.4, 1];
      P(ico(0.028), body2, M4(x, y, z, 1, 1, 1.6, 0, 0, -a), { rig, pivot: core });
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
      P(ico(r), i % 2 ? accent : body, M4(0, y, z), { glow: i % 2 ? 0.15 : 0 });
      B.secs.push({ z, y, r, s: [1, 1, 1] });
    }
    B.front = span / 2 + R; B.back = -span / 2 - R; B.top = R; yc = 0;
  } else if (G.loco === 'periscope') {
    // a neck rising out of the ground; the carriage sinks it out of sight now and then
    const n = G.segs, step = R * 1.15;
    yc = 0.05 + (n - 1) * step; B.secs = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), y = 0.05 + i * step, r = R * (0.85 - 0.3 * u);
      P(ico(r), i % 2 ? body2 : body, M4(0, y, 0, 1, 1.1, 1));
      B.secs.push({ z: 0, y: y - yc, r, s: [1, 1.1, 1] });
    }
    B.front = R * 0.5; B.back = -R * 0.5; B.top = R * 0.55; B.bot = -R * 0.55;
  } else {
    for (const s of B.secs) {
      const color = s.second || s.alt ? body2 : (G.loco === 'sac' ? accent : body);
      const geo = s.shape === 'dodeca' ? dodeca(s.r) : ico(s.r, s.d || 0);
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
  const stride = { biped: 0.5, quad: 0.4, tripod: 0.45, hexapod: 0.35, monopod: 0 }[G.loco] || 0;
  const knees = G.jointed && G.loco !== 'monopod';
  const bend = G.loco === 'monopod' ? 0 : knees ? 1.0 : 0.55; // knee fold in radians at the top of the swing
  const insect = G.loco === 'hexapod';
  for (const L of legs) {
    const h = G.legLen, [dx, dz] = L.dir;
    let hy = yc + B.bot * 0.55;
    let hw = 0;
    for (let k = 0; k <= 4; k++) hw = Math.max(hw, probe.hw(hy + (yc - hy) * k * 0.25, L.z));
    const hx = dx * Math.max(hw * 0.75, th);
    const hb = probe.bot(hx, L.z), ht = probe.top(hx, L.z);
    if (hb !== null && hb > hy) hy = hb + (ht - hb) * 0.35; // the hull is thin here: lift the hip into it
    const hip = [hx, hy, L.z];
    const splay = { hexapod: 1.0, tripod: 0.7, quad: 0.25, biped: 0.2, monopod: 0 }[G.loco];
    const foot = [hip[0] + dx * h * splay, 0, hip[2] + dz * h * splay + h * 0.05];
    let knee;
    if (knees) {
      const kOut = insect ? 0.8 : G.loco === 'tripod' ? 0.5 : 0.35;
      knee = [hip[0] + dx * h * kOut, insect ? hy + h * 0.15 : h * 0.55, hip[2] + dz * h * kOut + h * (insect ? 0.05 : 0.22)];
    } else knee = [(hip[0] + foot[0]) / 2, (hip[1] + foot[1]) / 2, (hip[2] + foot[2]) / 2];
    const rig = (w) => ({ rig: [RIG.LEG, L.phase, stride, w * bend], pivot: hip, pivot2: knee });
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
    const s = seg(neckBase, H, headR * 0.35, body2, headR * 0.45);
    P(s.geo, s.color, s.matrix, { rig: [RIG.NOD, 0, 0.12, 1], pivot: neckBase });
  } else { neckBase = [0, yc, B.front * 0.8]; H = [0, yc + B.top * 0.2, B.front + headR * 0.7]; }
  const nod = { rig: [RIG.NOD, 0, G.head === 'lure' ? 0.04 : G.loco === 'periscope' ? 0.08 : 0.12, 1], pivot: neckBase };
  const nodG = (g) => ({ ...nod, glow: g });
  const eyeR = clamp(headR * 0.25, 0.02, 0.05);
  const eyes = () => { for (const sx of [-1, 1]) P(ico(eyeR), glow, M4(H[0] + sx * headR * 0.55, H[1] + headR * 0.25, H[2] + headR * 0.8), nodG(0.6)); };
  if (G.head !== 'none' || G.loco === 'periscope') P(ico(headR), G.plan === 'chain' ? body : body2, M4(H[0], H[1], H[2], 0.85, 0.85, 1.25), nod);
  switch (G.head) {
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
      if (land || sub) eyes();
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
      P(wingGeo(span, chord), accent, m, o);
      const bone = seg([0, 0.004, 0], [span * 0.95, 0.004, -chord * 0.2], 0.012, body2, 0.02, 4);
      P(bone.geo, bone.color, bone.matrix.premultiply(m), { ...o, glow: 0 });
    }
  }
  if (G.loco === 'fins') {
    for (const sx of [-1, 1]) {
      const root = [sx * R * 0.7, yc, B.front * 0.15];
      P(cone(R * 0.9, R * 2, 4), accent, M4(sx * R * 1.8, yc, B.front * 0.15, 0.14, 1, 1, 0, -sx * 1.4), { glow: 0.3, rig: [RIG.WING, 0, 0.2, sx * R * 2.2], pivot: root });
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
      const y = yc - R * 0.15, z = B.front * 0.55 + i * R * 0.3;
      P(ico(R * 0.1), body2, M4(sx * probe.hw(y, z) * 0.97, y, z, 0.6, 1, 1));
    }
    P(ico(R * 0.65, 1), glow, M4(0, yc - R * 0.65, B.front * 0.2, 0.7, 0.35, 1.9), { glow: 0.8 });
  }
  if (G.loco === 'sac') {
    const base = [0, yc + B.bot - 0.02, 0];
    P(cyl(R * 0.33, R * 0.2, 0.09, 6), body2, M4(base[0], base[1] - 0.02, base[2]));
    P(ico(R * 0.18), glow, M4(base[0], base[1] - 0.07, base[2]), { glow: 1, rig: [RIG.PULSE, 1, 0.2, 1], pivot: [base[0], base[1] - 0.07, base[2]] });
    P(ico(R * 0.17), body2, M4(0, yc + B.top + 0.02, 0.02));
    for (const [sx, dz] of [[-1, 0.04], [1, -0.05]]) P(ico(R * 0.4), accent, M4(sx * R * 0.9, yc + R * 0.2, dz, 1, 1.2, 1), { glow: 0.25, rig: [RIG.PULSE, 2, 0.05, 1], pivot: [0, yc, 0] });
  }

  // ---- extras
  const top = yc + B.top;
  for (const e of G.extras) {
    switch (e) {
      case 'sail': {
        const bz = B.back * 0.15 + B.front * 0.1, base = [0, (probe.top(0, bz) ?? top) - 0.02, bz], sh = 0.35 + R;
        P(cone(R * 1.1, sh, 4), accent, M4(base[0], base[1] + sh * 0.45, base[2], 0.1, 1, 1.5, -0.25, 0), { glow: 0.45, rig: [RIG.SWAY, 0, 0.04, 1], pivot: base });
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
  return mergeGeos(parts);
}

// ---------------------------------------------------------------- the rig shader
// Part modes move a part relative to its pivot; the carriage then moves the whole body.
const RIG_GLSL = `
  float mode = aRig.x, ph = aRig.y + aPhase * 7.0, amp = aRig.z, w = aRig.w;
  float g = uTime * GAIT + ph, f = uTime * FLAP + ph, s = uTime * SLOW + ph;
  // body-wide clocks (no part phase), so the carriage moves every part of one animal together
  float gb = uTime * GAIT + aPhase * 7.0, fb = uTime * FLAP + aPhase * 7.0, sb = uTime * SLOW + aPhase * 7.0;
  float mv = aMove;
  float gl = max(GLIDE, smoothstep(-0.25, 0.25, sin(sb * 0.33 + 1.0))); // 1 = wings beat, 0 = wings held out
  vec3 d = transformed - aPivot;
  float c, sn, th;
  if (mode == 1.0) {            // LEG: fold the shin about the knee while the foot is in the air, then swing about the hip
    float sw = max(-cos(g), 0.0);
    vec3 d2 = transformed - aPivot2;
    th = sw * sw * w * mv; c = cos(th); sn = sin(th);
    d2.yz = vec2(d2.y * c - d2.z * sn, d2.y * sn + d2.z * c);
    d = aPivot2 + d2 - aPivot;
    th = sin(g) * amp * mv; c = cos(th); sn = sin(th);
    d.yz = vec2(d.y * c - d.z * sn, d.y * sn + d.z * c);
    transformed = aPivot + d;
  } else if (mode == 2.0) {     // WING: roll about the root; the tip trails the root and bends further
    float span = abs(w), side = w < 0.0 ? -1.0 : 1.0;
    float u = clamp(length(d.xz) / span, 0.0, 1.0);
    float beat = sin(f - u * 1.1) * amp * (0.5 + 0.9 * u);
    th = mix(0.2 + 0.25 * u, beat, gl) * side; c = cos(th); sn = sin(th);
    d.xy = vec2(d.x * c - d.y * sn, d.x * sn + d.y * c);
    transformed = aPivot + d;
  } else if (mode == 3.0) {     // SWAY: drift that grows with distance from the root
    float L = length(d) * w;
    transformed.x += sin(s * 1.6 + L * 3.0) * amp * L;
    transformed.z += cos(s * 1.2 + L * 2.0) * amp * 0.6 * L;
  } else if (mode == 4.0) {     // PULSE: breathe about the pivot
    transformed = aPivot + d * (1.0 + amp * pow(0.5 + 0.5 * sin(s * 1.5), 3.0));
  } else if (mode == 5.0) {     // NOD: slow pitch about the neck
    th = sin(s * 0.7) * amp; c = cos(th); sn = sin(th);
    d.yz = vec2(d.y * c - d.z * sn, d.y * sn + d.z * c);
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
    if (mode != 1.0) transformed.y += BOB * abs(sin(gb)) * mv + 0.01 * sin(sb);
  #elif CARRY == 1
    float lift = mode == 1.0 ? clamp(position.y / max(aPivot.y, 0.01), 0.0, 1.0) : 1.0;
    transformed.y += BOB * max(sin(gb), 0.0) * lift * mv;
  #elif CARRY == 2
    // a lateral wave runs from the head to the tail and grows on the way; the head end stays rigid
    float u = clamp((FRONT - transformed.z) / LEN, 0.0, 1.0), zc = min(transformed.z, FRONT * 0.9);
    transformed.x += BOB * (0.2 + 0.8 * u) * sin(gb + zc * WAVEK) * mv;
    transformed.y += BOB * 0.2 * max(0.0, sin(gb + zc * WAVEK + 1.2)) * u * mv;
  #elif CARRY == 3
    transformed.y += BOB * sin(sb * 0.8) + HEAVE * sin(fb - 1.0) * gl;
    transformed.x += WAVE * sin(fb - transformed.z * WAVEK) * clamp(-transformed.z, 0.0, 2.0);
  #elif CARRY == 4
    transformed.y *= 0.85 + 0.15 * sin(sb);
    transformed.x += 0.05 * sin(sb * 0.6) * clamp(transformed.y, 0.0, 1.0);
  #elif CARRY == 5
    transformed.y -= RISE * (1.0 - smoothstep(SINK, SINK + 0.4, sin(sb * 0.35)));
  #endif
  }
`;

function rigConstants(G) {
  const carry = { monopod: CARRY.HOP, serpent: CARRY.WAVE, sac: CARRY.FLOAT, wings: CARRY.FLOAT, fins: CARRY.FLOAT, arch: CARRY.ARCH, periscope: CARRY.RISE, plough: CARRY.RISE }[G.loco] ?? CARRY.WALK;
  const B = bodySections(G), len = B.front - B.back;
  const bob = { biped: 0.03, tripod: 0.02, quad: 0.02, hexapod: 0.008, monopod: 0.12, serpent: G.bodyR * 0.9, sac: 0.1, wings: 0.05, fins: 0.06 }[G.loco] || 0;
  const wave = G.loco === 'fins' ? 0.08 : 0;
  const wavek = G.loco === 'fins' ? 2.0 : G.loco === 'serpent' ? (2 * Math.PI) / (len * 1.1) : 5.0;
  const rise = G.loco === 'periscope' ? 0.05 + (G.segs - 1) * G.bodyR * 1.15 + G.bodyR * 2.4 : G.loco === 'plough' ? G.bodyR * 1.1 : 0;
  const sink = G.loco === 'plough' ? -0.97 : -0.3; // the plough dives only now and then; the periscope hides half the time
  const heave = G.loco === 'wings' ? 0.03 : 0; // body lift on each wing beat
  const glide = G.loco === 'wings' ? 0 : 1; // only true wings hold still and glide now and then
  const fx = (v) => Number(v).toFixed(4);
  return [['CARRY', carry], ['GAIT', G.gait], ['FLAP', G.flap], ['SLOW', G.slow], ['BOB', bob], ['WAVE', wave], ['WAVEK', wavek], ['RISE', rise], ['SINK', sink],
    ['HEAVE', heave], ['GLIDE', glide], ['FRONT', B.front], ['LEN', len]].map(([k, v]) => `#define ${k} ${k === 'CARRY' ? v : fx(v)}\n`).join('');
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
      .replace('#include <common>', `#include <common>\n${consts}uniform float uTime; attribute float aPhase; attribute float aMove; attribute float glow; attribute vec4 aRig; attribute vec3 aPivot; attribute vec3 aPivot2; varying float vGlow;`)
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

// ---------------------------------------------------------------- steering
// A creature roams on its tangent plane: (u, v) is its offset from home, `heading` its direction.
// Turning is driven by two slow oscillators with per-creature random frequencies, a leash pulls it
// back toward home, and grazers stop and start on a third oscillator. No two creatures share a rhythm.
export function makeMover(rng, mv) {
  return {
    u: 0, v: 0, heading: rng() * Math.PI * 2, spd: 0,
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
// 0..1 activity for the rig: legs swing only while the animal actually moves
export const moverActivity = (st) => (st.speed > 0 ? clamp(st.spd / st.speed, 0, 1) : 1);

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
    this.mover.leash = G.move.leash * 1.4; // no per-creature leash jitter on the card; the pull home starts near the disc edge
    this.mover.turn = G.move.turn * 0.5;
    this.pathScale = G.move.leash > 0 ? this.walkR / G.move.leash : 0;
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
      // run the same steering as on the planet, with time sped up a little so a lap fits on the card
      stepMover(mv, t * 2.5, dt * 2.5);
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
      const am = this.mesh.geometry.attributes.aMove;
      am.setX(0, moverActivity(mv)); am.needsUpdate = true;
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
