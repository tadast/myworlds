// myworlds — generation: the seeded build of a world and of a patch. Hashing, PRNG, simplex
// noise, icosphere, terrain, biomes, flora, fauna, clouds, the source, and the ground of a landing.
// The same seed string always produces the same world.
//
// Two calls make the interface, and they are exported at the end of this file:
//
//   world(seed, opts, onProgress)         the globe, the species, the source, and the sea level
//   patch(seed, site, opts, onProgress)   the ground of the cell of a site { lat, lon, kind }
//
// Each call returns its result and throws on a failure. onProgress(pct, label) reports the build,
// and a caller may leave it out. A patch takes the options of its world call as opts.world, and it
// depends only on its arguments: see contextFor(). The patch finds the cell of the site itself, and
// reads from its world whether that cell holds the phenomenon or the source. The other options are
// the ground row of a device tier: grid, size, rim, maxFlora, maxFauna. patchOpts() in tiers.js
// builds them. Every typed array in a result is new and belongs to the caller, so worker.js can
// transfer them all. The world object of a result is the one a later patch of that world reads, so
// a caller in the same thread must not change it. worker.js runs the two calls off the main
// thread, and the Node tools import this file and call them.
//
// This file holds no three.js and no DOM, because a module worker has no import map.
import { Species } from './species.js';           // species genomes and lore
import { FloraLore, FLORA_LORE } from './flora-lore.js';   // the plant vocabulary, written per patch
import { SourceLore } from './source-lore.js';     // the log of the source, written per world
import { Lore } from './lore.js';                 // the lore engine, shared with the flora
import { CELL, dirCell, cellDir, cellDirT, boxTanX, boxTanZ, siteCell, cellSite, sameCell, cellArc } from './cell-grid.js';
import { TYPES, TYPE_LABEL, TEMP_BY_TYPE, LAND_BY_TYPE, FLORA_BY_TYPE, FLORA_DENSITY_BY_TYPE } from './world-types.js';

// ---------------------------------------------------------------- hashing / rng
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function makeRng(seedStr) {
  const h = cyrb128(seedStr);
  const r = sfc32(h[0], h[1], h[2], h[3]);
  for (let i = 0; i < 20; i++) r();
  return r;
}

// small integer hash for per-face jitter
function hash1(i) {
  i = Math.imul(i ^ (i >>> 16), 2246822507);
  i = Math.imul(i ^ (i >>> 13), 3266489909);
  return ((i ^ (i >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- simplex noise 3D
const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);
const F3 = 1 / 3, G3 = 1 / 6;

class Noise {
  constructor(rng) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }
  n3(xin, yin, zin) {
    const perm = this.perm, pm12 = this.permMod12;
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0; else {
      const gi = pm12[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0; n0 = t0 * t0 * (GRAD3[gi] * x0 + GRAD3[gi + 1] * y0 + GRAD3[gi + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0; else {
      const gi = pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1; n1 = t1 * t1 * (GRAD3[gi] * x1 + GRAD3[gi + 1] * y1 + GRAD3[gi + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0; else {
      const gi = pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2; n2 = t2 * t2 * (GRAD3[gi] * x2 + GRAD3[gi + 1] * y2 + GRAD3[gi + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0; else {
      const gi = pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3; n3 = t3 * t3 * (GRAD3[gi] * x3 + GRAD3[gi + 1] * y3 + GRAD3[gi + 2] * z3);
    }
    return 32 * (n0 + n1 + n2 + n3);
  }
  // fractal brownian motion, roughly -1..1
  fbm(x, y, z, oct, lac = 2, gain = 0.5) {
    let a = 1, s = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.n3(x, y, z);
      norm += a;
      a *= gain; x *= lac; y *= lac; z *= lac;
    }
    return s / norm;
  }
  // ridged multifractal, 0..1
  ridged(x, y, z, oct, lac = 2.1, gain = 0.5) {
    let a = 1, s = 0, norm = 0, w = 1;
    for (let i = 0; i < oct; i++) {
      let n = 1 - Math.abs(this.n3(x, y, z));
      n = n * n * w;
      w = Math.min(1, Math.max(0, n * 2));
      s += n * a;
      norm += a;
      a *= gain; x *= lac; y *= lac; z *= lac;
    }
    return s / norm;
  }
}

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DEG_RAD = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
function toHex(c) {
  const b = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
  return '#' + b(c[0]) + b(c[1]) + b(c[2]);
}
function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function scale(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function rrange(rng, a, b) { return a + rng() * (b - a); }
function randDir(rng) {
  const z = rng() * 2 - 1, t = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(t), r * Math.sin(t), z];
}

// ---------------------------------------------------------------- icosphere (indexed, no duplicate vertices)
function icosphere(n) {
  const t = (1 + Math.sqrt(5)) / 2;
  const base = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const vCount = 12 + 30 * (n - 1) + 20 * ((n - 1) * (n - 2)) / 2;
  const pos = new Float32Array(vCount * 3);
  let vc = 0;
  const addV = (x, y, z) => {
    const l = Math.hypot(x, y, z);
    pos[vc * 3] = x / l; pos[vc * 3 + 1] = y / l; pos[vc * 3 + 2] = z / l;
    return vc++;
  };
  const corner = base.map((v) => addV(v[0], v[1], v[2]));
  const edges = new Map();
  const edgeVert = (a, b, tIdx) => {
    // tIdx measured from a towards b (0..n)
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const key = lo * 64 + hi;
    let arr = edges.get(key);
    if (!arr) { arr = new Int32Array(n + 1).fill(-1); edges.set(key, arr); }
    const slot = a === lo ? tIdx : n - tIdx;
    if (arr[slot] === -1) {
      const s = slot / n, A = base[lo], B = base[hi];
      arr[slot] = addV(A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s, A[2] + (B[2] - A[2]) * s);
    }
    return arr[slot];
  };
  const triCount = 20 * n * n;
  const idx = new Uint32Array(triCount * 3);
  let ic = 0;
  const grid = new Int32Array((n + 1) * (n + 1));
  for (const [a, b, c] of faces) {
    const A = base[a], B = base[b], C = base[c];
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        let v;
        if (i === 0 && j === 0) v = corner[a];
        else if (i === n) v = corner[b];
        else if (j === n) v = corner[c];
        else if (j === 0) v = edgeVert(a, b, i);
        else if (i === 0) v = edgeVert(a, c, j);
        else if (i + j === n) v = edgeVert(b, c, j);
        else {
          const wa = (n - i - j) / n, wb = i / n, wc = j / n;
          v = addV(A[0] * wa + B[0] * wb + C[0] * wc, A[1] * wa + B[1] * wb + C[1] * wc, A[2] * wa + B[2] * wb + C[2] * wc);
        }
        grid[i * (n + 1) + j] = v;
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        const g = (ii, jj) => grid[ii * (n + 1) + jj];
        idx[ic++] = g(i, j); idx[ic++] = g(i + 1, j); idx[ic++] = g(i, j + 1);
        if (i + j < n - 1) { idx[ic++] = g(i + 1, j); idx[ic++] = g(i + 1, j + 1); idx[ic++] = g(i, j + 1); }
      }
    }
  }
  return { pos, idx, vCount: vc, triCount };
}

// ---------------------------------------------------------------- the world types
// world-types.js holds the types, their weights, and the ranges each type rolls in. The kind codes
// come from flora-lore.js. The globe grows the first seven kinds. The ground patch grows all of
// them; see patchFlora() and docs/issues/21-alien-flora.md.
const FLORA = FloraLore.FLORA;
const floraLore = (kinds) => (kinds || []).map((k) => FLORA_LORE[k]).filter(Boolean);
// fauna: each world rolls its own species set (species.js); a creature's kind is its species index

function chooseType(rng) {
  const total = TYPES.reduce((s, t) => s + t[1], 0);
  let r = rng() * total;
  for (const [name, w] of TYPES) { r -= w; if (r <= 0) return name; }
  return 'terran';
}

function makePalette(type, rng) {
  const P = {};
  P.jitter = 0.05;
  switch (type) {
    case 'terran':
    case 'ocean': {
      const lush = rng();
      P.deep = hex('#2c4a70'); P.shallow = hex('#7fb7a8'); P.beach = hex(pick(rng, ['#ecdca6', '#e9d5a1', '#f0e2b0']));
      P.grass = mix(hex('#8ccc60'), hex('#5faa4c'), lush); P.grass2 = mix(hex('#a8d466'), hex('#7cbc50'), lush);
      P.forest = mix(hex('#4c9a44'), hex('#2f7d3a'), lush); P.dry = hex('#c9b86e'); P.desert = hex('#e0c58a');
      P.rock = hex('#8d8378'); P.rock2 = hex('#6e655d'); P.snow = hex('#f5f8fc'); P.tundra = hex('#a3aa8c');
      P.ocean = hex(pick(rng, ['#2f7be0', '#2a6fd6', '#2b86e8', '#3a8fd9']));
      P.oceanOpacity = 0.84; P.atmo = hex('#6fb4ff'); P.cloud = hex('#ffffff');
      P.flora = FLORA_BY_TYPE[type].slice();
      P.floraColor = { canopy: mix(hex('#4f9f42'), hex('#2e7d32'), lush), canopy2: hex('#7fbf4a'), trunk: hex('#6b4a2e') };
      P.faunaColor = { body: hex(pick(rng, ['#b9a58a', '#8f9aa6', '#a48c7a'])), body2: hex('#5a4a3e'), accent: hex(pick(rng, ['#ff7b5c', '#ffc857', '#7ee0d0'])), glow: hex('#ffe9a8') };
      break;
    }
    case 'desert': {
      P.deep = hex('#3f6f8a'); P.shallow = hex('#8bb8a6'); P.beach = hex('#e8d59a');
      P.grass = hex('#e3c07c'); P.grass2 = hex('#d8ab5e'); P.forest = hex('#b5c66a'); P.dry = hex('#d3a75a');
      P.desert = hex('#e7c98a'); P.rock = hex('#a86a43'); P.rock2 = hex('#7f4d35'); P.snow = hex('#f1e6cf'); P.tundra = hex('#c8b389');
      P.ocean = hex('#2f8fbf'); P.oceanOpacity = 0.85; P.atmo = hex('#ffb066'); P.cloud = hex('#fff2e0');
      P.flora = FLORA_BY_TYPE.desert.slice();
      P.floraColor = { canopy: hex('#4f8a4a'), canopy2: hex('#8b6d55'), trunk: hex('#4f8a4a') };
      P.faunaColor = { body: hex('#c9a46a'), body2: hex('#6e4a32'), accent: hex(pick(rng, ['#e0503a', '#3fb8c4'])), glow: hex('#ffd9a0') };
      break;
    }
    case 'ice': {
      P.deep = hex('#5a7fa6'); P.shallow = hex('#9fc3df'); P.beach = hex('#dbe7f2');
      P.grass = hex('#eef4fa'); P.grass2 = hex('#dfeaf5'); P.forest = hex('#cfe0f0'); P.dry = hex('#e6eef7');
      P.desert = hex('#d6e3ef'); P.rock = hex('#6a7686'); P.rock2 = hex('#46505c'); P.snow = hex('#ffffff'); P.tundra = hex('#c2d2e2');
      P.ocean = hex('#bcd6ee'); P.oceanOpacity = 1; P.oceanIce = true; P.atmo = hex('#a9d4ff'); P.cloud = hex('#ffffff');
      P.flora = FLORA_BY_TYPE.ice.slice();
      P.floraColor = { canopy: hex('#8fe0ff'), canopy2: hex('#3e6b5a'), trunk: hex('#3f4c58') };
      P.faunaColor = { body: hex('#8fa3b8'), body2: hex('#3e4a58'), accent: hex('#6fd6ff'), glow: hex('#bff3ff') };
      break;
    }
    case 'lava': {
      P.deep = hex('#3a1e12'); P.shallow = hex('#5e2a17'); P.beach = hex('#5a3a2c');
      P.grass = hex('#3a3231'); P.grass2 = hex('#4a3f3c'); P.forest = hex('#2d2726'); P.dry = hex('#5a4a44');
      P.desert = hex('#6a5148'); P.rock = hex('#4b423e'); P.rock2 = hex('#2f2a28'); P.snow = hex('#8b8078'); P.tundra = hex('#5b514c');
      P.ocean = hex('#ff5a1f'); P.oceanOpacity = 1; P.oceanLava = true; P.atmo = hex('#ff6a3a'); P.cloud = hex('#5b5257');
      P.flora = FLORA_BY_TYPE.lava.slice();
      P.floraColor = { canopy: hex('#ff8c3a'), canopy2: hex('#3a3331'), trunk: hex('#2a2422') };
      P.faunaColor = { body: hex('#3b3432'), body2: hex('#211c1a'), accent: hex('#ff6a2a'), glow: hex('#ffb347') };
      break;
    }
    case 'exotic': {
      const H = rng() * 360;
      P.deep = hsl(H + 180, 0.5, 0.25); P.shallow = hsl(H + 160, 0.5, 0.55); P.beach = hsl(H + 40, 0.5, 0.8);
      P.grass = hsl(H, 0.55, 0.55); P.grass2 = hsl(H + 15, 0.6, 0.62); P.forest = hsl(H - 10, 0.55, 0.38); P.dry = hsl(H + 30, 0.45, 0.6);
      P.desert = hsl(H + 40, 0.45, 0.7); P.rock = hsl(H + 200, 0.2, 0.45); P.rock2 = hsl(H + 200, 0.2, 0.3); P.snow = hsl(H, 0.3, 0.92); P.tundra = hsl(H + 20, 0.3, 0.6);
      P.ocean = hsl(H + 180, 0.75, 0.5); P.oceanOpacity = 0.85; P.atmo = hsl(H + 200, 0.85, 0.65); P.cloud = hsl(H + 60, 0.5, 0.9);
      P.flora = FLORA_BY_TYPE.exotic.slice();
      P.floraColor = { canopy: hsl(H + 120, 0.7, 0.55), canopy2: hsl(H + 300, 0.7, 0.65), trunk: hsl(H + 20, 0.3, 0.85) };
      P.faunaColor = { body: hsl(H + 240, 0.35, 0.6), body2: hsl(H + 260, 0.4, 0.3), accent: hsl(H + 60, 0.9, 0.6), glow: hsl(H + 90, 0.9, 0.75) };
      break;
    }
    case 'gas': {
      const schemes = [
        ['#e9d8b5', '#c9a577', '#a4693f', '#f3ead6', '#b7794f'],
        ['#7fb2ff', '#3e6fd6', '#2b4aa8', '#a9cbff', '#5b8ae8'],
        ['#f4e2b6', '#e2c48c', '#d5a86b', '#fff3d6', '#c99a5e'],
        ['#e8b7e6', '#c890d4', '#9a6bc2', '#f6d9f3', '#b783d0'],
        ['#a6e6d1', '#5fc2a8', '#3a8f80', '#d7f5ea', '#4aa88f'],
        ['#ffd08a', '#f0a256', '#c86a3a', '#ffe7bf', '#e08a4a'],
      ];
      P.bands = pick(rng, schemes).map(hex);
      P.storm = mix(P.bands[2], hex('#ffffff'), 0.15);
      P.atmo = mix(P.bands[0], hex('#ffffff'), 0.3); P.cloud = hex('#ffffff');
      P.flora = FLORA_BY_TYPE.gas.slice(); P.jitter = 0.035;
      P.faunaColor = { body: mix(P.bands[3], hex('#ffffff'), 0.25), body2: mix(P.bands[2], hex('#000000'), 0.2), accent: mix(P.bands[1], hex('#ffffff'), 0.2), glow: hex('#fff2c8') };
      break;
    }
  }
  return P;
}

// ---------------------------------------------------------------- name / stats flavour
const SYLL = ['ka', 'ri', 'to', 'ne', 'va', 'lu', 'mi', 'so', 'ra', 'thi', 'on', 'ae', 'ul', 'ix', 'ora', 'ys', 'en', 'dra', 'vel', 'qua'];
function designation(rng, seed) {
  const letters = seed.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
  const num = Math.floor(rng() * 9000 + 1000);
  const suffix = pick(rng, ['b', 'c', 'd', 'e', 'Prime', 'II', 'IV', 'Minor', 'Major']);
  return `${letters}-${num} ${suffix}`;
}
function moonName(rng) {
  const n = 2 + Math.floor(rng() * 2);
  let s = '';
  for (let i = 0; i < n; i++) s += pick(rng, SYLL);
  return s[0].toUpperCase() + s.slice(1);
}

// The numbers that describe the planet itself. They are drawn from the flavour stream, straight
// after the designation, because three readers need them before the globe exists: the ground turns
// globe units into metres with the radius, the creature rig uses the gravity, and the lore reads
// all four. makeStats() formats the same values later and draws nothing.
function rollPlanet(frng, type) {
  const radiusKm = type === 'gas' ? Math.round(rrange(frng, 24000, 75000)) : Math.round(rrange(frng, 3200, 9800));
  const gravity = type === 'gas' ? rrange(frng, 0.9, 2.6) : (radiusKm / 6371) * rrange(frng, 0.8, 1.2);
  const dayHours = type === 'gas' ? rrange(frng, 8, 16) : rrange(frng, 14, 60);
  const [tLo, tHi] = TEMP_BY_TYPE[type];
  return { type, radiusKm, gravity, dayHours, tempC: Math.round(rrange(frng, tLo, tHi)) };
}

// ---------------------------------------------------------------- the axis of a world, issue 33
// The angle between the spin axis of a planet and the normal of its orbit. It decides where the
// star stands over the world through the year, so it decides the climate: a world with no tilt
// holds one season for ever, and a world tipped past 54 degrees gives its poles more light over a
// year than its equator.
//
// The roll follows what is known of real planets. Accretion from a swarm of bodies leaves an axis
// that points anywhere, which gives a chance that runs with the sine of the angle and a mean near
// 90 degrees. Tides, and accretion from an ordered disc, pull an axis back toward the normal. The
// eight planets of the Sun show both: six of them stand under 30 degrees, Uranus lies on its side
// at 98, and Venus is turned over at 177. So the roll holds four classes:
//
//   damped    18%   under 4 degrees. Mercury and Jupiter.
//   ordered   52%   a half normal of 14 degrees, cut at 45. Earth, Mars, Saturn, Neptune.
//   tipped    23%   45 to 135 degrees, drawn so the axis points anywhere in that band. Uranus.
//   turned     7%   135 to 180 degrees. The world turns the other way. Venus.
//
// The season is where the world stands in its orbit, and it does not move during a visit: a year
// is long and a landing is minutes. The star stands over the latitude the declination names:
//
//     sin(declination) = sin(obliquity) * sin(season)
//
// The draw takes its own stream, as the flora signature does, so no world that existed before this
// issue changes its terrain. See worldContext().
function rollAxis(seed) {
  const rng = makeRng(seed + '|axis');
  const u = rng();
  let obliquity;
  if (u < 0.18) obliquity = rrange(rng, 0, 4) * DEG_RAD;
  else if (u < 0.70) {
    // a half normal of 14 degrees, from two draws, cut at 45
    const g = Math.abs(Math.sqrt(-2 * Math.log(1 - rng() * 0.9999)) * Math.cos(Math.PI * 2 * rng()));
    obliquity = Math.min(45, g * 14) * DEG_RAD;
  } else if (u < 0.93) {
    // an axis that points anywhere inside the band: the cosine is flat, not the angle
    const lo = Math.cos(135 * DEG_RAD), hi = Math.cos(45 * DEG_RAD);
    obliquity = Math.acos(rrange(rng, lo, hi));
  } else {
    const lo = Math.cos(180 * DEG_RAD), hi = Math.cos(135 * DEG_RAD);
    obliquity = Math.acos(rrange(rng, lo, hi));
  }
  const season = rng() * Math.PI * 2;
  const decl = Math.asin(clamp(Math.sin(obliquity) * Math.sin(season), -1, 1));
  return { obliquity, season, decl };
}

// ---------------------------------------------------------------- the light of a latitude
// How much light a latitude takes over one turn of the planet, from 0 in the dark to 1 at the
// most any latitude takes. The formula is the standard one for the mean of a day:
//
//     cos(H0) = -tan(latitude) * tan(declination)      the hour angle the star sets at
//     Q = (H0 sin(lat) sin(decl) + cos(lat) cos(decl) sin(H0)) / pi
//
// A latitude where cos(H0) falls under -1 stands in the light for the whole turn, and one where it
// climbs over 1 never sees the star at all. That second case is what the reader asked for: ground
// that stays in the dark through the day, and is cold because of it.
function dayLight(sinLat, decl) {
  const lat = Math.asin(clamp(sinLat, -1, 1));
  const cosLat = Math.cos(lat), sinD = Math.sin(decl), cosD = Math.cos(decl);
  const c = cosLat < 1e-6 || Math.abs(cosD) < 1e-6 ? -sinLat * sinD * 1e6 : -(sinLat / cosLat) * (sinD / cosD);
  const h0 = c <= -1 ? Math.PI : c >= 1 ? 0 : Math.acos(c);
  return Math.max(0, (h0 * sinLat * sinD + cosLat * cosD * Math.sin(h0)) / Math.PI) * Math.PI;
}

// The same over a whole year, at one obliquity. The declination walks the orbit and the samples
// take the mean. This is the number the biomes stand on: ice sits where the year is cold, and one
// season cannot build or melt a cap.
function yearLight(sinLat, obliquity) {
  let sum = 0;
  const N = 24;
  for (let i = 0; i < N; i++) {
    const lam = (i + 0.5) / N * Math.PI * 2;
    sum += dayLight(sinLat, Math.asin(clamp(Math.sin(obliquity) * Math.sin(lam), -1, 1)));
  }
  return sum / N;
}

// The table the field reads: one entry per step of the sine of the latitude, which is also one
// entry per equal band of area, so the mean of the table is the mean over the globe.
//
// SEASON_W is how much of the day the ground shows against the year. Rock and water hold the heat
// of the season before, so a hemisphere in its winter does not fall to the light it takes today.
// The field is scaled to the range the old latitude term held, so the biome rules of every other
// part of the worker still mean what they meant.
const CLIMATE_N = 129;
const SEASON_W = 0.4;
// The two ends of the scale: the equator and the pole of a world with the axis of the Earth,
// 23.4 degrees, standing at an equinox. The same blend of the year and the day runs on them as on
// every other world, so a world that holds that axis and that season reads 1 at the equator and
// -0.1 at the poles, which is where the old latitude term ran from and to. See climateTable().
const REF_OBL = 23.4 * DEG_RAD;
const refMix = (sinLat) => yearLight(sinLat, REF_OBL) * (1 - SEASON_W) + dayLight(sinLat, 0) * SEASON_W;
const REF_HI = refMix(0), REF_LO = refMix(1);
function climateTable(obliquity, decl) {
  const t = new Float32Array(CLIMATE_N);
  for (let i = 0; i < CLIMATE_N; i++) {
    const sinLat = (i / (CLIMATE_N - 1)) * 2 - 1;
    t[i] = yearLight(sinLat, obliquity) * (1 - SEASON_W) + dayLight(sinLat, decl) * SEASON_W;
  }
  // One scale for every world, and not the span this world happens to hold. A per-world stretch
  // was the other way to do it and it is wrong: the light over a world on its side is nearly even
  // over a year, and a stretch would pull that even light apart and paint a season as a climate.
  //
  // The scale stands on a world with the axis of the Earth: the light its equator takes over a
  // year goes to 1, and the light its pole takes goes to -0.1, which is where the old latitude
  // term ran from and to. So every world that holds that axis reads as it always did, a world with
  // no tilt holds poles colder than that, and a pole that carries a summer of its own runs hotter
  // than any equator. The field clamps what runs past its ends.
  let mean = 0;
  for (let i = 0; i < CLIMATE_N; i++) {
    t[i] = 1.1 * (t[i] - REF_LO) / (REF_HI - REF_LO) - 0.1;
    mean += t[i];
  }
  return { t, mean: mean / CLIMATE_N };
}

// The climate term at a direction: the y of the direction is the sine of the latitude.
function climateAt(ctx, y) {
  const u = (clamp(y, -1, 1) + 1) * 0.5 * (CLIMATE_N - 1);
  const i = Math.min(CLIMATE_N - 2, Math.floor(u)), f = u - i;
  const T = ctx.climate;
  return T[i] * (1 - f) + T[i + 1] * f;
}

// ---------------------------------------------------------------- the world context
// The last context generation built, and the key of the world call that built it. A patch of the
// same world reuses it, so no globe work runs twice. It is only a cache: see contextFor().
let cachedCtx = null, cachedKey = null;

// The options of a world call, with the defaults for a caller that passes none.
function worldOptions(opts = {}) {
  return { detail: opts.detail || 96, maxFlora: opts.maxFlora || 6000, maxFauna: opts.maxFauna || 140 };
}
const worldKey = (seed, opts) => {
  const o = worldOptions(opts);
  return `${seed}|${o.detail}|${o.maxFlora}|${o.maxFauna}`;
};

// Everything a world needs before its mesh: the type, the palette, the noise, and the terrain
// parameters. generate() builds the globe from it. patch() builds a ground patch from it without
// a mesh. The draw order of the seed stream must stay as it is, or every world changes.
function worldContext(seed) {
  const rng = makeRng(seed);
  const type = chooseType(rng);
  const noise = new Noise(makeRng(seed + '|noise'));
  const P = makePalette(type, makeRng(seed + '|palette'));
  const frng = makeRng(seed + '|flavour');

  const world = {
    seed, type, typeLabel: TYPE_LABEL[type],
    // The flora signature of this world. flora-geometry.js turns it into the proportions and the
    // hues of every plant, so two planets never build the same body from one kind. It takes its
    // own hash and not a draw from `rng`, because the draw order of the seed stream must not move.
    floraVariant: cyrb128(seed + '|flora-shape')[0] >>> 0,
    designation: designation(frng, seed),
    // The lean of the ring and of the cloud deck. It is not the axis of the world: see `axis` below.
    tilt: rrange(rng, -0.45, 0.45),
    // The spin axis of this world, issue 33: the obliquity, the season it stands in, and the
    // latitude the star stands over. It takes a stream of its own, so no world built before this
    // issue moves a coastline. app.js turns the planet by it and worldContext() builds the climate
    // of the world from it.
    axis: rollAxis(seed),
    spin: (type === 'gas' ? 0.12 : 0.05) * rrange(rng, 0.7, 1.4),
    palette: {
      ocean: P.ocean ? toHex(P.ocean) : null, oceanOpacity: P.oceanOpacity || 0,
      oceanIce: !!P.oceanIce, oceanLava: !!P.oceanLava,
      atmo: toHex(P.atmo), cloud: toHex(P.cloud),
      flora: P.floraColor ? { canopy: toHex(P.floraColor.canopy), canopy2: toHex(P.floraColor.canopy2), trunk: toHex(P.floraColor.trunk) } : null,
      fauna: { body: toHex(P.faunaColor.body), body2: toHex(P.faunaColor.body2), accent: toHex(P.faunaColor.accent), glow: toHex(P.faunaColor.glow), sand: P.beach ? toHex(P.beach) : null },
      ground: P.grass ? toHex(P.grass) : null,
    },
    hasAtmosphere: true, atmoStrength: 1, seaLevel: 0, hasOcean: false, amp: 0,
    rings: null, moons: [], stats: {},
    // Issue 34: the thing that transmits, one per world with a surface. makeSource() fills it in
    // generate(). A gas giant keeps the null, because it takes no probe.
    source: null,
  };
  // The planet numbers, and the facts the lore reads. `env` fills up as the world is built: the
  // moons, the rings, and the activity are added in generate(), which then writes the lore again.
  // See "The environment" in docs/fauna.md.
  // A world tipped past 90 degrees turns the other way, and the globe shows it: the spin runs
  // back. The ground reads its own turn from the sky, so a landing there still holds together.
  if (world.axis.obliquity > Math.PI / 2) world.spin = -world.spin;
  const planet = rollPlanet(frng, type);
  world.gravity = planet.gravity;
  world.env = {
    type, tempC: planet.tempC, gravity: planet.gravity, dayHours: planet.dayHours,
    obliquityDeg: world.axis.obliquity * 180 / Math.PI,
    radiusKm: planet.radiusKm, land: type === 'gas' ? null : 1,
    floraTags: floraLore(P.flora).map((f) => f.tag),
    plantWord: (floraLore(P.flora)[0] || {}).word || null,
    floraDensity: 0,
    moons: null, moonNames: [], rings: false, activity: null,
  };

  // seaLevel stays at -2 until the globe build. A world with no ocean keeps -2, because no vertex
  // ever reaches it.
  const ctx = { seed, type, rng, noise, P, world, radiusKm: planet.radiusKm, seaLevel: -2 };
  if (type === 'gas') { initLife(ctx); return ctx; }

  // ---- terrain parameters per type
  // land: the fraction of the surface above the sea. Earth is 0.29. It rolls in LAND_BY_TYPE of
  //   world-types.js, which the lore audit sweeps.
  // contFreq: the size of the continents. A lower value gives fewer and larger continents.
  // islands: the weight of the volcanic arcs that make small islands in the open sea.
  let land, amp, mountain, contFreq, islands, tempBias, snowLine, beachW, floraDensity, cloudCount;
  switch (type) {
    case 'terran': land = rrange(rng, ...LAND_BY_TYPE.terran); amp = 0.06; mountain = rrange(rng, 0.5, 0.9); contFreq = rrange(rng, 0.55, 0.85); islands = 0.2; tempBias = rrange(rng, -0.1, 0.15); snowLine = 0.6; beachW = 0.03; floraDensity = FLORA_DENSITY_BY_TYPE.terran; cloudCount = Math.round(rrange(rng, 40, 70)); break;
    case 'ocean': land = rrange(rng, ...LAND_BY_TYPE.ocean); amp = 0.06; mountain = rrange(rng, 0.4, 0.8); contFreq = rrange(rng, 0.8, 1.3); islands = 0.6; tempBias = 0.15; snowLine = 0.5; beachW = 0.04; floraDensity = FLORA_DENSITY_BY_TYPE.ocean; cloudCount = Math.round(rrange(rng, 55, 85)); break;
    case 'desert': land = rng() < 0.6 ? rrange(rng, LAND_BY_TYPE.desert[0], LAND_BY_TYPE.desert[1]) : LAND_BY_TYPE.desert[2]; amp = 0.055; mountain = rrange(rng, 0.5, 0.9); contFreq = rrange(rng, 0.5, 0.8); islands = 0.1; tempBias = 0.5; snowLine = 0.9; beachW = 0.02; floraDensity = FLORA_DENSITY_BY_TYPE.desert; cloudCount = Math.round(rrange(rng, 6, 18)); break;
    case 'ice': land = rrange(rng, ...LAND_BY_TYPE.ice); amp = 0.06; mountain = rrange(rng, 0.6, 1.0); contFreq = rrange(rng, 0.55, 0.9); islands = 0.15; tempBias = -0.8; snowLine = 0.1; beachW = 0.02; floraDensity = FLORA_DENSITY_BY_TYPE.ice; cloudCount = Math.round(rrange(rng, 15, 30)); break;
    case 'lava': land = rrange(rng, ...LAND_BY_TYPE.lava); amp = 0.065; mountain = rrange(rng, 0.8, 1.2); contFreq = rrange(rng, 0.6, 1.0); islands = 0.3; tempBias = 1.2; snowLine = 9; beachW = 0.02; floraDensity = FLORA_DENSITY_BY_TYPE.lava; cloudCount = Math.round(rrange(rng, 12, 28)); break;
    case 'exotic': land = rrange(rng, ...LAND_BY_TYPE.exotic); amp = 0.065; mountain = rrange(rng, 0.5, 1.1); contFreq = rrange(rng, 0.5, 1.0); islands = 0.25; tempBias = rrange(rng, -0.2, 0.3); snowLine = rrange(rng, 0.55, 0.9); beachW = 0.03; floraDensity = FLORA_DENSITY_BY_TYPE.exotic; cloudCount = Math.round(rrange(rng, 25, 60)); break;
  }
  world.amp = amp; world.land = land;
  world.hasOcean = land < 1;
  world.hasClouds = cloudCount > 0;
  world.atmoStrength = type === 'lava' ? 0.6 : type === 'desert' ? 0.7 : 1;

  const o1 = randDir(rng).map((v) => v * 10), o2 = randDir(rng).map((v) => v * 10), o3 = randDir(rng).map((v) => v * 10);
  const o4 = randDir(rng).map((v) => v * 10), o5 = randDir(rng).map((v) => v * 10), o6 = randDir(rng).map((v) => v * 10);
  const mFreq = rrange(rng, 2.6, 4.2);
  const warp = rrange(rng, 0.15, 0.45);

  // The climate of this world, from its axis: one term per band of equal area. The field reads it
  // for every direction, and siteTempC() reads its mean. See climateTable().
  const climate = climateTable(world.axis.obliquity, world.axis.decl);
  Object.assign(ctx, {
    land, amp, mountain, contFreq, islands, tempBias, snowLine, beachW, floraDensity, cloudCount,
    o1, o2, o3, o4, o5, o6, mFreq, warp,
    climate: climate.t, climateMean: climate.mean,
  });
  world.env.land = land;
  world.env.floraDensity = floraDensity;
  initLife(ctx);
  return ctx;
}

// Rolls the species of a world and writes a first draft of their lore. The bodies come from the
// species stream, so they do not move when the text changes. The text comes from its own stream,
// and generate() writes it again once the moons, the rings, and the activity are known. A patch
// that runs without a globe build therefore still finds a name on every animal.
function initLife(ctx) {
  const { seed, type, world, P } = ctx;
  world.species = Species.makeSpeciesSet(makeRng(seed + '|species'), type, world, P);
  for (const s of world.species) s.gravity = world.gravity; // the hop of a monopod depends on it
  describeLife(ctx);
}

// Copies what the world now knows into world.env and writes the lore from it. Safe to call more
// than once: it draws from its own stream and it replaces the text it wrote before.
function describeLife(ctx) {
  const { seed, world } = ctx;
  world.env.moons = world.moons ? world.moons.length : null;
  world.env.moonNames = (world.moons || []).map((m) => m.name);
  world.env.rings = !!world.rings;
  world.env.activity = world.activity ? world.activity.kind : null;
  Species.describe(world, makeRng(seed + '|lore'));
}

// ---------------------------------------------------------------- the terrain field
// The globe paints itself from two passes over the icosphere. contAt() is pass 1 for one
// direction and fieldFrom() is pass 2 for one direction. The patch calls fieldAt(), which runs
// both. The globe keeps its two passes, because pass 2 needs the sea level of pass 1.
const _warped = new Float32Array(3);   // float32, exactly as the globe stores its warped positions

// The continent field at one unit direction. Writes the warped position into out.
function contAt(ctx, x, y, z, out) {
  const noise = ctx.noise, o1 = ctx.o1, o2 = ctx.o2, o3 = ctx.o3, o4 = ctx.o4, o5 = ctx.o5, o6 = ctx.o6;
  // domain warp for organic coastlines
  const wx = noise.fbm(x * 0.9 + o4[0], y * 0.9 + o4[1], z * 0.9 + o4[2], 2) * ctx.warp;
  const wy = noise.fbm(x * 0.9 + o5[0], y * 0.9 + o5[1], z * 0.9 + o5[2], 2) * ctx.warp;
  const px = x + wx, py = y + wy, pz = z + (wx - wy) * 0.5;
  out[0] = px; out[1] = py; out[2] = pz;
  const cont = noise.fbm(px * ctx.contFreq + o1[0], py * ctx.contFreq + o1[1], pz * ctx.contFreq + o1[2], 3, 2.0, 0.5);
  const coast = noise.fbm(px * 3.5 + o6[0], py * 3.5 + o6[1], pz * 3.5 + o6[2], 3, 2.0, 0.5) * 0.1;
  // a low-frequency mask limits the arcs to a few chains, as on Earth
  const arc = noise.ridged(px * 6 + o2[0], py * 6 + o2[1], pz * 6 + o2[2], 2);
  const arcMask = smoothstep(0.25, 0.55, noise.fbm(px * 1.2 + o3[0], py * 1.2 + o3[1], pz * 1.2 + o3[2], 2));
  return (cont + coast + arc * arc * arc * arc * arcMask * ctx.islands) * 1.35;
}

// Elevation, temperature, moisture, forest mask, and radius factor for one direction, from the
// continent value c and the warped position of pass 1. Writes h, t, m, fm, and r into out.
function fieldFrom(ctx, x, y, z, c, px, py, pz, out) {
  const noise = ctx.noise, o2 = ctx.o2, o3 = ctx.o3, o4 = ctx.o4, o5 = ctx.o5;
  const onLand = smoothstep(ctx.seaLevel - 0.15, ctx.seaLevel + 0.25, c);
  const m = noise.ridged(px * ctx.mFreq + o2[0], py * ctx.mFreq + o2[1], pz * ctx.mFreq + o2[2], 5);
  const d = noise.fbm(x * 9 + o3[0], y * 9 + o3[1], z * 9 + o3[2], 3) * 0.12;
  const hl = c - ctx.seaLevel;
  // compress continent interiors into gentle lowlands; ridges carry the mountains.
  // The fine relief fades out at the coast, so it does not cut the shore into specks
  // and does not lift the sea floor into islands. Islands come from the arc term only.
  const ridge = m * m * ctx.mountain * onLand * 0.75;
  let h;
  if (hl >= 0) h = Math.pow(hl, 0.75) * 0.3 + ridge + d * smoothstep(0, 0.08, hl);
  else h = hl + (ridge + d * 0.5) * smoothstep(0, -0.2, hl);
  const tnoise = noise.fbm(x * 2.2 + o5[0], y * 2.2 + o5[1], z * 2.2 + o5[2], 2) * 0.12;
  out.h = h;
  // How mountainous the ground is here, 0 to 1. It is the ridge term of the globe without the
  // height that term earns, so a patch can ask for rough ground where the globe builds a range
  // and for smooth ground on a plain. See detailAt().
  out.rg = m * m * onLand;
  // The climate of the latitude, which since issue 33 is the light the axis of this world gives
  // it: the mean over the year, plus a part of the day of the season it stands in. The term used
  // to be the latitude alone, which held every world upright and every pole cold.
  out.t = clamp(climateAt(ctx, y) + ctx.tempBias + tnoise - Math.max(h, 0) * 0.55, -0.3, 1.3);
  out.m = noise.fbm(x * 1.7 + o4[0] * 0.7, y * 1.7 + o4[1] * 0.7, z * 1.7 + o4[2] * 0.7, 3);
  out.fm = noise.fbm(x * 6 + o2[0], y * 6 + o2[1], z * 6 + o2[2], 2);
  // displacement: land pushed up, sea floor gently down and clamped
  const disp = h >= 0 ? Math.min(h, 1.0) : Math.max(h, -0.5) * 0.55;
  out.r = 1 + ctx.amp * disp;
  return out;
}

// The whole terrain field for one direction. The patch uses it; the globe does not, because the
// globe already holds the pass-1 values in arrays.
function fieldAt(ctx, x, y, z, out) {
  const c = contAt(ctx, x, y, z, _warped);
  return fieldFrom(ctx, x, y, z, c, _warped[0], _warped[1], _warped[2], out);
}

// ---------------------------------------------------------------- the relief under the globe
// Issue 30. The globe field holds nothing under about a fortieth of the radius: its finest octave
// runs at 36 turns over the sphere, so a cell of 60 km carries a third of one wave. Measured over
// 300 land cells of Auralis, the field inside a cell stands within 7% of a plane. A patch that
// took only that field therefore read as a tilted sheet, and it read the same on a peak and on a
// plain. This field carries the relief on down from the cell to the metre.
//
// It reads the direction on the sphere and nothing else. Two patches that share an edge read one
// height along it, so a stream could stitch them. Nothing here comes from the seed of the patch.
const DETAIL_WAVE = 1800;     // units of the box: the longest wave, the range itself
const DETAIL_OCT = 5;         // octaves; the last runs at about 97 units
// A rim cell is 50 units wide on the wide tier and 100 on the narrow one, so it can carry a wave
// of about 400 units and no shorter one. The patch fades every octave past this one out at its
// edge and the rim leaves them out, so the two meet on one shape instead of on a line the reader
// sees from the ceiling.
const DETAIL_RIM_OCT = 3;     // octaves the rim carries; the third runs at about 420 units
const DETAIL_LAC = 2.07;      // the step between two octaves, off a whole number so no wave lines up
const DETAIL_GAIN = 0.52;     // what each octave takes of the one above
const DETAIL_AMP = 170;       // units: the height of the ridged stack at full ruggedness
const DETAIL_FLOOR = 0.28;    // the value of the stack that reads as the floor of a valley
const DETAIL_HANG = 2.6;      // how hard an octave hangs on the crest of the one above
const FINE_WAVE = 70;         // units: the longest wave of the fine stack, the ground at the feet
const FINE_OCT = 3;           // octaves; the last runs at about 17 units
const FINE_AMP = 10;           // units
const FINE_BASE = 0.35;       // the part of the fine stack a flat plain still keeps
// Ruggedness: how much of the ridged stack the ground takes. It comes from the mountain term of
// the globe and from the height over the sea. Over land of Auralis the mountain term reads 0.13
// at the median and 0.42 at the ninth decile, so these numbers put an ordinary plain near 0.5 and
// a range at the cap.
const RUG_BASE = 0.15, RUG_RIDGE = 1.9, RUG_HIGH = 0.45;
const RUG_MIN = 0.5, RUG_MAX = 1.7;

// A ridged multifractal at one direction, 0 at the floor of a valley and 1 at a crest. Each
// octave hangs on the crest of the one above, so a range grows spurs and a valley floor stays
// smooth. One octave of plain noise gives rounded blobs instead, which is what the patch drew
// before this issue.
// `fade` scales the octaves a rim cell is too wide to carry. The patch runs it from 1 in the
// middle to 0 at its edge, and the rim runs it at 0, so the two hold one shape at the join.
function ridgeMF(noise, x, y, z, f0, off, fade) {
  let f = f0, a = 1, w = 1, sum = 0, norm = 0;
  for (let o = 0; o < DETAIL_OCT; o++) {
    let v = 1 - Math.abs(noise.n3(x * f + off[0], y * f + off[1], z * f + off[2]));
    v *= v * w;
    w = clamp(v * DETAIL_HANG, 0, 1);
    sum += v * a * (o < DETAIL_RIM_OCT ? 1 : fade); norm += a;
    f *= DETAIL_LAC; a *= DETAIL_GAIN;
  }
  return sum / norm;
}

// The constants of the detail field for one world and one box. `perUnit` is the metres of the
// globe across one unit of the box, so a wave named in units of the box lands on the sphere at
// the right size whatever the radius of the planet.
function detailFor(ctx, perUnit) {
  const radiusM = ctx.radiusKm * 1000;
  return {
    f0: radiusM / (DETAIL_WAVE * perUnit),
    ff: radiusM / (FINE_WAVE * perUnit),
    off: [ctx.o2[0] * 1.7 + 31, ctx.o2[1] * 1.7 + 17, ctx.o2[2] * 1.7 + 53],
    off2: [ctx.o3[0] * 2.3 + 71, ctx.o3[1] * 2.3 + 11, ctx.o3[2] * 2.3 + 97],
  };
}

// The relief under the globe field at one direction, in units of the box. `rug` is the ruggedness
// of the ground there and ruggedAt() rolls it from the globe. `fade` is 1 inside the patch and 0
// on the rim.
function detailAt(ctx, d, x, y, z, rug, fade) {
  const r = ridgeMF(ctx.noise, x, y, z, d.f0, d.off, fade);
  const fine = ctx.noise.fbm(x * d.ff + d.off2[0], y * d.ff + d.off2[1], z * d.ff + d.off2[2], FINE_OCT);
  return (r - DETAIL_FLOOR) * DETAIL_AMP * rug
    + fine * FINE_AMP * (FINE_BASE + (1 - FINE_BASE) * Math.min(rug, 1)) * fade;
}

// The ruggedness at one point of the globe field, from the mountain term and the height.
function ruggedAt(rg, h, hRef) {
  return clamp(RUG_BASE + RUG_RIDGE * rg + RUG_HIGH * clamp(h / hRef, 0, 1), RUG_MIN, RUG_MAX);
}

// The height of the highest land of a world, in globe elevation units. One vertical scale comes
// from it, and every patch of the world shares that scale, so two patches that share an edge hold
// one height along it. A patch used to set its own scale from the relief of its own cell, which
// flattened a range and lifted a plain until the two read alike, and which made the two sides of
// a shared edge disagree. A quantile and not the maximum, because one freak point must not
// flatten every patch of the world. The value is cached on the context, so it runs once a world.
function worldReliefH(ctx) {
  if (ctx.reliefRefH > 0) return ctx.reliefRefH;
  const N = 16000, ga = Math.PI * (3 - Math.sqrt(5)), fld = { h: 0 }, hs = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i + 0.5) * (2 / N), r = Math.sqrt(Math.max(0, 1 - y * y)), a = ga * i;
    fieldAt(ctx, Math.cos(a) * r, y, Math.sin(a) * r, fld);
    if (fld.h > 0) hs.push(fld.h);
  }
  hs.sort((p, q) => p - q);
  const h = hs.length ? hs[Math.min(hs.length - 1, Math.floor(0.995 * hs.length))] : 0.2;
  ctx.reliefRefH = Math.max(h, 0.05);
  return ctx.reliefRefH;
}

// ---------------------------------------------------------------- generation
function generate(seed, opts = {}, post = () => {}) {
  const { detail, maxFlora, maxFauna } = worldOptions(opts);
  cachedCtx = null; cachedKey = null;   // a world call that fails leaves no context behind

  const ctx = worldContext(seed);
  const { type, rng, noise, P, world } = ctx;
  if (type === 'gas') {
    const result = generateGas(world, rng, noise, P, detail, post, maxFauna);
    cachedCtx = ctx; cachedKey = worldKey(seed, opts);
    return result;
  }
  const { amp, mountain, snowLine, beachW, floraDensity, cloudCount } = ctx;

  post(5, 'Shaping the sphere');
  const geo = icosphere(detail);
  const { pos, idx, vCount, triCount } = geo;

  post(15, 'Raising continents');
  const H = new Float32Array(vCount);   // elevation relative to sea level
  const T = new Float32Array(vCount);   // temperature 0..1
  const M = new Float32Array(vCount);   // moisture -1..1
  const R = new Float32Array(vCount);   // radius factor
  const FM = new Float32Array(vCount);  // forest cluster mask
  const C = new Float32Array(vCount);   // continent field
  const PX = new Float32Array(vCount * 3); // warped positions
  // Pass 1: the continent field. Few low-frequency octaves give a few large continents,
  // as buoyant continental crust does on Earth. A fine octave shapes bays and peninsulas.
  // Volcanic arcs add small islands in the open sea.
  for (let v = 0; v < vCount; v++) {
    C[v] = contAt(ctx, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], _warped);
    PX[v * 3] = _warped[0]; PX[v * 3 + 1] = _warped[1]; PX[v * 3 + 2] = _warped[2];
    if ((v & 16383) === 0) post(15 + (v / vCount) * 20, 'Raising continents');
  }
  // The sea level is the quantile of the field that leaves the wanted land fraction dry.
  // Without an ocean the whole field sits high above a sea level that no vertex reaches.
  let seaLevel = -2;
  if (ctx.land < 1) {
    const sorted = C.slice().sort();
    seaLevel = sorted[Math.min(vCount - 1, Math.floor((1 - ctx.land) * vCount))];
  }
  ctx.seaLevel = seaLevel;
  world.seaLevel = seaLevel;

  // Pass 2: elevation, temperature, moisture
  const fld = { h: 0, t: 0, m: 0, fm: 0, r: 0 };
  for (let v = 0; v < vCount; v++) {
    fieldFrom(ctx, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], C[v], PX[v * 3], PX[v * 3 + 1], PX[v * 3 + 2], fld);
    H[v] = fld.h; T[v] = fld.t; M[v] = fld.m; FM[v] = fld.fm; R[v] = fld.r;
    if ((v & 16383) === 0) post(35 + (v / vCount) * 25, 'Raising continents');
  }

  post(60, 'Stirring the crust');
  // The height map of the globe, built once. A fissure reads it inside makeActivity(), and nothing
  // writes R after the activity, so the world takes the same map. A volcano raises its cone into R
  // and reads no map, so on its world the map is built after the cone.
  let survey = null;
  const surveyed = () => survey || (survey = buildHeightMap(pos, R, vCount));
  const act = makeActivity(makeRng(seed + '|activity'), type, world, P, pos, vCount, H, T, R, amp, beachW, surveyed);
  const paintAct = act ? act.paint : null;
  const blockV = act ? act.block : null;
  // Issue 34. The source stands after the activity, because a volcano raises the ground it must
  // keep away from. Its stream is its own, so no world built before this issue changes.
  makeSource(makeRng(seed + '|source'), ctx, world, beachW);

  post(62, 'Painting biomes');
  // per-face colouring, expanded to non-indexed triangles
  const outPos = new Float32Array(triCount * 9);
  const outCol = new Float32Array(triCount * 9);
  const tmp = [0, 0, 0];
  const biomeColor = (h, t, m, fi, out) => {
    let c;
    if (h < -0.12) c = P.deep;
    else if (h < 0) c = mix(P.deep, P.shallow, smoothstep(-0.12, 0, h));
    else if (h < beachW) c = t < 0.25 ? P.tundra : P.beach;
    else if (t < 0.12 || h > snowLine + (t - 0.5) * 0.4) c = P.snow;
    else if (h > snowLine - 0.2 + (t - 0.5) * 0.25) c = mix(P.rock, P.rock2, hash1(fi * 7 + 3));
    else if (t < 0.28) c = P.tundra;
    else if (m > 0.22) c = P.forest;
    else if (m > -0.15) c = mix(P.grass, P.grass2, hash1(fi * 3 + 1));
    else if (m > -0.45 || t < 0.6) c = P.dry;
    else c = P.desert;
    const j = 1 + (hash1(fi) - 0.5) * 2 * P.jitter;
    out[0] = c[0] * j; out[1] = c[1] * j; out[2] = c[2] * j;
    return c;
  };
  for (let f = 0; f < triCount; f++) {
    const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
    const h = (H[a] + H[b] + H[c]) / 3, t = (T[a] + T[b] + T[c]) / 3, m = (M[a] + M[b] + M[c]) / 3;
    biomeColor(h, t, m, f, tmp);
    if (paintAct) paintAct((pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3, (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3, tmp);
    const o = f * 9;
    outPos[o] = pos[a * 3] * R[a]; outPos[o + 1] = pos[a * 3 + 1] * R[a]; outPos[o + 2] = pos[a * 3 + 2] * R[a];
    outPos[o + 3] = pos[b * 3] * R[b]; outPos[o + 4] = pos[b * 3 + 1] * R[b]; outPos[o + 5] = pos[b * 3 + 2] * R[b];
    outPos[o + 6] = pos[c * 3] * R[c]; outPos[o + 7] = pos[c * 3 + 1] * R[c]; outPos[o + 8] = pos[c * 3 + 2] * R[c];
    for (let k = 0; k < 3; k++) { outCol[o + k] = tmp[k]; outCol[o + 3 + k] = tmp[k]; outCol[o + 6 + k] = tmp[k]; }
    if ((f & 32767) === 0) post(62 + (f / triCount) * 18, 'Painting biomes');
  }

  post(82, 'Growing forests');
  // flora candidates from unique vertices on habitable land, clustered by FM mask.
  // The densities above are high enough that a forest core saturates, so a lush world fills the maxFlora budget.
  const candidates = [];
  const frng2 = makeRng(seed + '|flora');
  for (let v = 0; v < vCount; v++) {
    const h = H[v], t = T[v], m = M[v];
    if (h <= beachW || h > snowLine - 0.3) continue;
    if (blockV && blockV[v]) continue;
    let kind = -1, p = 0;
    switch (type) {
      case 'terran': case 'ocean':
        if (t < 0.12) break;
        if (FM[v] + m * 0.5 > 0.02) { kind = t < 0.45 ? FLORA.PINE : (type === 'ocean' && h < 0.12 && t > 0.6 ? FLORA.PALM : FLORA.TREE); p = floraDensity * smoothstep(0.02, 0.35, FM[v] + m * 0.5); }
        break;
      case 'desert':
        if (m > 0.35 && FM[v] > 0.1) { kind = FLORA.CACTUS; p = 0.53; }
        else if (FM[v] > 0.4) { kind = FLORA.BOULDER; p = 0.18; }
        break;
      case 'ice':
        if (FM[v] > 0.3) { kind = FLORA.CRYSTAL; p = 0.38; }
        else if (t > 0.15 && FM[v] + m * 0.5 > 0.1 && h < 0.3) { kind = FLORA.PINE; p = 0.45; }
        break;
      case 'lava':
        if (FM[v] > 0.35) { kind = FLORA.CRYSTAL; p = 0.3; }
        else if (FM[v] > 0.15 && h < 0.2) { kind = FLORA.BOULDER; p = 0.22; }
        break;
      case 'exotic':
        if (t < 0.1) break;
        if (FM[v] + m * 0.5 > 0.02) { kind = FM[v] > 0.35 ? FLORA.CRYSTAL : (m > 0.1 ? FLORA.MUSHROOM : FLORA.TREE); p = floraDensity * smoothstep(0.02, 0.35, FM[v] + m * 0.5); }
        break;
    }
    if (kind >= 0 && frng2() < p) candidates.push(v, kind);
  }
  let floraCount = candidates.length / 2;
  const keep = Math.min(floraCount, maxFlora);
  const stride = floraCount / Math.max(keep, 1);
  const flora = new Float32Array(keep * 8); // x y z, nx ny nz, scale, kind
  let fc = 0;
  for (let i = 0; i < keep; i++) {
    const ci = Math.floor(i * stride) * 2;
    const v = candidates[ci], kind = candidates[ci + 1];
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const r = R[v] - 0.0015;
    const o = fc * 8;
    flora[o] = x * r; flora[o + 1] = y * r; flora[o + 2] = z * r;
    flora[o + 3] = x; flora[o + 4] = y; flora[o + 5] = z;
    flora[o + 6] = rrange(frng2, 0.7, 1.3) * (kind === FLORA.CRYSTAL ? rrange(frng2, 0.8, 1.8) : 1);
    flora[o + 7] = kind;
    fc++;
  }
  world.floraCount = fc;
  world.floraKinds = P.flora;
  // ---- slinger (issue 28) ----
  // One index of the flora of the globe, so an animal that travels by holding a plant can find the
  // nearest one without reading every plant of the world. See buildFloraGrid().
  const floraGrid = buildFloraGrid(flora, fc);

  post(86, 'Surveying the ground');
  // coarse lat/lon height map (radius factors) so creatures can follow the terrain on the main thread
  const { heightMap, HM_W, HM_H } = surveyed();
  world.heightMapSize = [HM_W, HM_H];
  world.seaRadius = world.hasOcean ? 1 + amp * 0.004 : 0;

  post(88, 'Waking the wildlife');
  const fauna = makeFauna(makeRng(seed + '|fauna'), type, pos, vCount, H, T, M, FM, R, beachW, snowLine, maxFauna, world, blockV);

  post(90, 'Condensing clouds');
  const clouds = makeClouds(makeRng(seed + '|clouds'), noise, cloudCount, type, world.activity && world.activity.kind === 'lightning' ? world.activity : null);

  post(94, 'Catching moons');
  world.rings = rng() < (type === 'ice' ? 0.2 : 0.08) ? makeRings(rng, P.rock ? mix(P.rock, [1, 1, 1], 0.4) : [0.8, 0.8, 0.8], 1.5) : null;
  world.moons = makeMoons(rng, type, !!world.rings);
  // The sky is the last thing the world learns about itself, so the lore is written again here,
  // with the moons, the rings, and the activity in hand. Same stream, same seed, same text.
  describeLife(ctx);
  world.stats = makeStats(type, world, fc);
  // Issue 34, slice 4. The log of the source stands last, because it names a species of this world
  // and it reads the moons, the rings, and the activity that the lines above have only now settled.
  // It rolls from a stream of its own, so no other stream draws one number more.
  if (world.source) {
    world.source.log = SourceLore.writeLog({ world, rng: makeRng(seed + '|source-lore') });
  }

  post(98, 'Almost there');
  const result = { world, terrain: { pos: outPos, col: outCol }, flora, clouds, fauna, heightMap, floraGrid };
  cachedCtx = ctx; cachedKey = worldKey(seed, opts);   // a patch of this world reuses the context
  return result;
}

// ---------------------------------------------------------------- slinger (issue 28)
// A bucket sort of the flora of the globe into cells of latitude and longitude, packed into one
// array so it can be transferred with the rest of the result. An animal that holds a plant asks
// "what stands within a degree of me?" several times a second, and a world carries thousands of
// plants, so it may not read them all.
//
// The cells are FLORA_GRID_W by FLORA_GRID_H, which is about a cell to the reach of a throw. The
// layout is: the two sizes and the count, then one start offset per cell and one past the last,
// then the flora indices, cell by cell. app.js reads it; see nearAnchor() there.
const FLORA_GRID_W = 256, FLORA_GRID_H = 128;
function floraCellOf(x, y, z, W, H) {
  const lat = Math.asin(Math.min(1, Math.max(-1, y)));
  const lon = Math.atan2(z, x);
  let j = Math.floor(((lat + Math.PI / 2) / Math.PI) * H);
  let i = Math.floor(((lon + Math.PI) / (2 * Math.PI)) * W);
  if (j < 0) j = 0; else if (j >= H) j = H - 1;
  if (i < 0) i = 0; else if (i >= W) i = W - 1;
  return j * W + i;
}
function buildFloraGrid(flora, count) {
  const W = FLORA_GRID_W, H = FLORA_GRID_H, cells = W * H, head = 3;
  const out = new Int32Array(head + cells + 1 + count);
  out[0] = W; out[1] = H; out[2] = count;
  // the unit direction of a plant is the surface normal the placement wrote beside its position
  const cellAt = (i) => floraCellOf(flora[i * 8 + 3], flora[i * 8 + 4], flora[i * 8 + 5], W, H);
  for (let i = 0; i < count; i++) out[head + cellAt(i) + 1]++;
  for (let c = 0; c < cells; c++) out[head + c + 1] += out[head + c];
  const fill = new Int32Array(cells), idx = head + cells + 1;
  for (let i = 0; i < count; i++) { const c = cellAt(i); out[idx + out[head + c] + fill[c]++] = i; }
  return out;
}

function makeClouds(rng, noise, count, type, storm) {
  // clusters of puffs: x y z altitude-scaled, sx sy sz
  const puffs = [];
  // the last cluster is the storm cell of a lightning activity: bigger, denser, lower
  const total = storm ? count + 1 : count;
  for (let c = 0; c < total; c++) {
    const isStorm = storm && c === count;
    if (isStorm) { storm.puffStart = puffs.length / 6; storm.puffCount = 16; }
    const dir = isStorm ? storm.dir : randDir(rng);
    const n = isStorm ? 16 : 3 + Math.floor(rng() * 5);
    const alt = isStorm ? 1.08 : rrange(rng, 1.085, 1.105);
    const spread = isStorm ? 0.05 : rrange(rng, 0.018, 0.04);
    // tangent frame
    const up = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const tx = [up[1] * dir[2] - up[2] * dir[1], up[2] * dir[0] - up[0] * dir[2], up[0] * dir[1] - up[1] * dir[0]];
    const tl = Math.hypot(tx[0], tx[1], tx[2]); tx[0] /= tl; tx[1] /= tl; tx[2] /= tl;
    const ty = [dir[1] * tx[2] - dir[2] * tx[1], dir[2] * tx[0] - dir[0] * tx[2], dir[0] * tx[1] - dir[1] * tx[0]];
    const elong = rrange(rng, 1, 2.2);
    for (let i = 0; i < n; i++) {
      const u = (rng() - 0.5) * 2 * spread * elong, v = (rng() - 0.5) * 2 * spread;
      const px = dir[0] + tx[0] * u + ty[0] * v, py = dir[1] + tx[1] * u + ty[1] * v, pz = dir[2] + tx[2] * u + ty[2] * v;
      const l = Math.hypot(px, py, pz);
      const s = rrange(rng, 0.011, 0.022) * (i === 0 ? 1.3 : 1) * (isStorm ? 1.5 : 1);
      puffs.push(px / l * alt, py / l * alt, pz / l * alt, s * rrange(rng, 1, 1.6), s * 0.45, s * rrange(rng, 1, 1.6));
    }
  }
  return new Float32Array(puffs);
}

function makeMoons(rng, type, hasRings) {
  const max = type === 'gas' ? 4 : 2;
  const roll = rng();
  const n = Math.min(roll < 0.3 ? 0 : roll < 0.7 ? 1 : 1 + Math.floor(rng() * max), hasRings ? 2 : 4);
  const moons = [];
  const tints = ['#cfd3da', '#d9c9b2', '#b9c4d6', '#e0d6c4', '#c9b8c8', '#b5c9b2'];
  for (let i = 0; i < n; i++) {
    moons.push({
      name: moonName(rng),
      dist: (hasRings ? 3.5 : 1.95) + i * 0.55 + rng() * 0.3,
      size: rrange(rng, 0.05, 0.12),
      speed: rrange(rng, 0.12, 0.3) / (1 + i * 0.6) * (rng() < 0.2 ? -1 : 1),
      incl: rrange(rng, -0.35, 0.35),
      phase: rng() * Math.PI * 2,
      color: pick(rng, tints),
      seed: Math.floor(rng() * 1e9),
    });
  }
  return moons;
}

function makeRings(rng, baseColor, saturation) {
  const bands = 40;
  const data = new Float32Array(bands * 4);
  const inner = rrange(rng, 1.45, 1.75), outer = inner + rrange(rng, 0.7, 1.3);
  const gapAt = rrange(rng, 0.3, 0.7), gapW = rrange(rng, 0.03, 0.08);
  const tint = rng() * 0.25;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const shade = 0.75 + rng() * 0.35;
    const inGap = Math.abs(t - gapAt) < gapW;
    const edge = smoothstep(0, 0.08, t) * (1 - smoothstep(0.9, 1, t));
    data[i * 4] = clamp(baseColor[0] * shade + tint * 0.3, 0, 1);
    data[i * 4 + 1] = clamp(baseColor[1] * shade + tint * 0.1, 0, 1);
    data[i * 4 + 2] = clamp(baseColor[2] * shade, 0, 1);
    data[i * 4 + 3] = inGap ? 0.05 : (0.45 + rng() * 0.5) * edge;
  }
  return { inner, outer, bands, data: Array.from(data), tilt: rrange(rng, -0.3, 0.3) };
}

// ---------------------------------------------------------------- fauna
// Output layout (9 floats per creature): x y z (home, at surface radius + hover), nx ny nz, scale, kind, phase.
function packFauna(list, maxFauna) {
  const keep = Math.min(list.length, maxFauna);
  const stride = list.length / Math.max(keep, 1);
  const out = new Float32Array(keep * 9);
  const kinds = new Set();
  for (let i = 0; i < keep; i++) {
    const c = list[Math.floor(i * stride)];
    out.set(c, i * 9);
    kinds.add(c[7]);
  }
  return { fauna: out, count: keep, kinds: [...kinds].sort((a, b) => a - b) };
}

function makeFauna(rng, type, pos, vCount, H, T, M, FM, R, beachW, snowLine, maxFauna, world, blockV) {
  const list = [];
  const seaR = 1 + world.amp * 0.004;
  for (let v = 0; v < vCount; v++) {
    if (blockV && blockV[v]) continue;
    const h = H[v], t = T[v], m = M[v], f = FM[v];
    const beach = h > 0 && h < beachW;
    const lowland = h > beachW && h < 0.3;
    // which niches this vertex belongs to
    const ok = {
      beach: beach && t > 0.1,
      meadow: lowland && m > -0.2 && m < 0.22 && f < 0.1 && t > 0.35,
      forest: lowland && m > 0.22 && f > 0.05,
      lowland: lowland && t > 0.15,
      dune: h > beachW && h < 0.6,
      snow: h > beachW && h < 0.35 && t > -0.05,
      ash: h > 0.15 && h < 0.6,
      sea: h < -0.08,
    };
    for (const G of world.species) {
      if (!ok[G.niche] || f * G.fsign < G.fcut || rng() >= G.density) continue;
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const r = (h < 0 ? seaR : R[v]) + G.hover;
      list.push([x * r, y * r, z * r, x, y, z, G.size * rrange(rng, 0.85, 1.2), G.id, rng() * Math.PI * 2]);
    }
  }
  const packed = packFauna(list, maxFauna);
  world.faunaCount = packed.count;
  world.faunaKinds = packed.kinds;
  return packed.fauna;
}

function makeGasFauna(rng, maxFauna, world) {
  const list = [];
  const n = Math.round(rrange(rng, 18, 34));
  for (let i = 0; i < n; i++) {
    const [x, y, z] = randDir(rng);
    const G = rng() < 0.55 ? world.species[0] : world.species[world.species.length - 1];
    const r = 1 + rrange(rng, 0.03, 0.07);
    list.push([x * r, y * r, z * r, x, y, z, G.size * rrange(rng, 0.9, 1.2), G.id, rng() * Math.PI * 2]);
  }
  const packed = packFauna(list, maxFauna);
  world.faunaCount = packed.count;
  world.faunaKinds = packed.kinds;
  return packed.fauna;
}

// The four planet numbers were drawn in worldContext(), by rollPlanet(), so the lore could read
// them. makeStats() formats them and draws nothing.
function makeStats(type, world, floraCount) {
  const { radiusKm: km, gravity: g, dayHours: day, tempC: temp } = world.env;
  const obl = world.axis ? world.axis.obliquity * 180 / Math.PI : null;
  const fauna = (world.faunaKinds || []).map((k) => world.species[k].lore.plural);
  const faunaText = fauna.length ? fauna.slice(0, 3).join(", ") : "none seen";
  return {
    radius: `${km.toLocaleString()} km`, gravity: `${g.toFixed(2)} g`, day: `${day.toFixed(1)} h`,
    // The tilt of the axis, and what it does to the world. Over 54 degrees a pole takes more light
    // over a year than the equator, and past 90 the world turns the other way.
    tilt: obl == null ? null : `${obl.toFixed(0)}°${obl > 135 ? ' retrograde' : obl > 54 ? ' on its side' : ''}`,
    land: type === 'gas' ? null : `${Math.round(world.land * 100)}%`,
    activity: world.activity ? world.activity.label : null,
    temp: `${temp} °C`, moons: world.moons.length, fauna: faunaText[0].toUpperCase() + faunaText.slice(1), floraCount,
  };
}

// ---------------------------------------------------------------- natural activity
// At most one phenomenon per world, and about two worlds in three have one.
// The worker picks the kind and the site, deforms and paints the ground, and blocks flora and fauna there.
// The main thread (phenomena.js) draws the moving parts: glow, smoke, jets, curtains, bolts.
const ACTIVITY = {
  terran: [['volcano', 3], ['geyser', 3], ['fissure', 1], ['aurora', 3], ['lightning', 3]],
  ocean: [['volcano', 2], ['geyser', 1], ['aurora', 3], ['lightning', 3]],
  desert: [['volcano', 3], ['fissure', 3], ['aurora', 1], ['lightning', 1]],
  ice: [['volcano', 1], ['geyser', 4], ['fissure', 3], ['aurora', 4]],
  lava: [['volcano', 5], ['fissure', 4], ['lightning', 1]],
  exotic: [['volcano', 2], ['geyser', 2], ['fissure', 2], ['aurora', 2], ['lightning', 2]],
  gas: [['lightning', 4], ['aurora', 3]],
};
const ACTIVITY_LABEL = {
  volcano: { default: 'Active volcano', ice: 'Cryovolcano' },
  geyser: { default: 'Geyser field', ice: 'Cryogeyser', exotic: 'Glowing geyser' },
  fissure: { default: 'Glowing fissure', ice: 'Deep crevasse', exotic: 'Luminous rift' },
  aurora: { default: 'Aurora' },
  lightning: { default: 'Thunderstorm', gas: 'Storm lightning', lava: 'Ash lightning' },
};

function buildHeightMap(pos, R, vCount) {
  const HM_W = 384, HM_H = 192;
  const heightMap = new Float32Array(HM_W * HM_H), hmCount = new Uint16Array(HM_W * HM_H);
  for (let v = 0; v < vCount; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const u = (Math.atan2(z, x) / (Math.PI * 2) + 0.5) * HM_W, w = (Math.asin(clamp(y, -1, 1)) / Math.PI + 0.5) * HM_H;
    const i = Math.min(HM_W - 1, Math.floor(u)) + Math.min(HM_H - 1, Math.floor(w)) * HM_W;
    heightMap[i] += R[v]; hmCount[i]++;
  }
  for (let i = 0; i < heightMap.length; i++) if (hmCount[i]) heightMap[i] /= hmCount[i];
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < heightMap.length; i++) {
      if (hmCount[i]) continue;
      const xI = i % HM_W, yI = (i / HM_W) | 0;
      let s = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = (xI + dx + HM_W) % HM_W, yy = yI + dy;
        if (yy < 0 || yy >= HM_H) continue;
        const j = xx + yy * HM_W;
        if (hmCount[j]) { s += heightMap[j]; n++; }
      }
      if (n) { heightMap[i] = s / n; hmCount[i] = 255; }
    }
  }
  return { heightMap, HM_W, HM_H };
}
function sampleHeightMap(hm, W, Hh, x, y, z) {
  const u = (Math.atan2(z, x) / (Math.PI * 2) + 0.5) * W, w = (Math.asin(clamp(y, -1, 1)) / Math.PI + 0.5) * Hh;
  return hm[Math.min(W - 1, Math.floor(u)) + Math.min(Hh - 1, Math.floor(w)) * W];
}

function makeActivity(rng, type, world, P, pos, vCount, H, T, R, amp, beachW, surveyed) {
  world.activity = null;
  if (rng() >= (type === 'lava' ? 0.8 : 0.667)) return null;
  const table = ACTIVITY[type];
  const total = table.reduce((s, t) => s + t[1], 0);
  let roll = rng() * total, kind = table[0][0];
  for (const [k, w] of table) { roll -= w; if (roll <= 0) { kind = k; break; } }
  const label = ACTIVITY_LABEL[kind][type] || ACTIVITY_LABEL[kind].default;
  const act = { kind, label, dir: null, r: 1, glow: '#ff6a1e' };
  if (type === 'ice') act.glow = '#8fe0ff';
  if (type === 'exotic') act.glow = toHex(P.faunaColor.glow);

  if (type === 'gas') {
    act.dir = kind === 'lightning' ? world.storm.dir : null;
    if (kind === 'aurora') act.pole = rng() < 0.5 ? 1 : -1;
    world.activity = act;
    return act;
  }

  // a site: a vertex that fits the kind, or null if the world has none
  const pickSite = (ok) => {
    const list = [];
    for (let v = 0; v < vCount; v += 3) if (ok(v)) list.push(v);
    return list.length ? list[Math.floor(rng() * list.length)] : -1;
  };
  const dirOf = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const block = new Uint8Array(vCount);
  const blockAround = (dir, rho) => {
    const c = Math.cos(rho);
    for (let v = 0; v < vCount; v++) if (pos[v * 3] * dir[0] + pos[v * 3 + 1] * dir[1] + pos[v * 3 + 2] * dir[2] > c) block[v] = 1;
  };
  const dark = scale(P.rock2, 0.45);

  if (kind === 'aurora') {
    act.pole = rng() < 0.5 ? 1 : -1;
  } else if (kind === 'lightning') {
    act.dir = randDir(rng);
  } else if (kind === 'volcano') {
    // a cone with a crater on a hill; the cone replaces the ground near the vent and blends at the rim
    const v = pickSite((i) => H[i] > 0.12 && H[i] < 0.35);
    if (v < 0) return null;
    const dir = dirOf(v), rho = rrange(rng, 0.07, 0.11), peak = rrange(rng, 0.45, 0.65), hs = H[v];
    const cr = Math.cos(rho);
    for (let i = 0; i < vCount; i++) {
      const d0 = dot3(dirOf(i), dir);
      if (d0 < cr) continue;
      const d = Math.acos(Math.min(1, d0)) / rho;
      const cone = peak * Math.pow(1 - d, 1.3);
      const crater = smoothstep(0.22, 0.06, d) * peak * 0.3;
      const w = smoothstep(1.0, 0.5, d);
      const h = H[i] + cone * (1 - w) + (hs + cone - crater - H[i]) * w;
      H[i] = h;
      R[i] = 1 + amp * Math.min(h, 1.0);
    }
    blockAround(dir, rho * 1.05);
    act.dir = dir; act.rho = rho;
    act.r = 1 + amp * Math.min(hs + peak * 0.7, 1.0); // the crater floor
    act.peakR = 1 + amp * Math.min(hs + peak, 1.0);
    const vent = type === 'ice' ? mix(P.shallow, [1, 1, 1], 0.3) : [1.0, 0.42, 0.08];
    act.paint = (x, y, z, out) => {
      const d0 = x * dir[0] + y * dir[1] + z * dir[2];
      if (d0 < cr) return;
      const d = Math.acos(Math.min(1, d0)) / rho;
      const k = smoothstep(0.25, 1.0, d);
      let c = mix(dark, [out[0], out[1], out[2]], k);
      if (d < 0.16) c = mix(vent, c, smoothstep(0.09, 0.16, d));
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    };
  } else if (kind === 'geyser') {
    const v = pickSite((i) => H[i] > beachW + 0.01 && H[i] < 0.22 && (type === 'ice' || T[i] > 0.3));
    if (v < 0) return null;
    const dir = dirOf(v), rho = 0.02, cr = Math.cos(rho);
    blockAround(dir, rho);
    act.dir = dir; act.rho = rho; act.r = R[v];
    const mineral = type === 'ice' ? mix(P.shallow, [1, 1, 1], 0.4) : type === 'exotic' ? mix(P.beach, P.faunaColor.glow, 0.5) : mix(P.beach, [0.95, 0.9, 0.8], 0.5);
    const pool = type === 'exotic' ? P.faunaColor.glow : P.shallow;
    act.paint = (x, y, z, out) => {
      const d0 = x * dir[0] + y * dir[1] + z * dir[2];
      if (d0 < cr) return;
      const d = Math.acos(Math.min(1, d0)) / rho;
      let c = mix(mineral, [out[0], out[1], out[2]], smoothstep(0.5, 1.0, d));
      if (d < 0.35) c = mix(pool, c, smoothstep(0.2, 0.35, d));
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    };
  } else if (kind === 'fissure') {
    // a long ragged crack walks across the land with a wandering heading, sideways jitter,
    // and a few short branches; every line stops at the shore. The longest of six tries wins.
    const { heightMap, HM_W, HM_H } = surveyed();
    const seaR = world.hasOcean ? 1 + amp * 0.004 : 0;
    const rot = (vec, axis, ang) => {
      const c = Math.cos(ang), s = Math.sin(ang), k = axis, d = dot3(k, vec);
      return [vec[0] * c + (k[1] * vec[2] - k[2] * vec[1]) * s + k[0] * d * (1 - c),
        vec[1] * c + (k[2] * vec[0] - k[0] * vec[2]) * s + k[1] * d * (1 - c),
        vec[2] * c + (k[0] * vec[1] - k[1] * vec[0]) * s + k[2] * d * (1 - c)];
    };
    const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
    const tangentAt = (p) => {
      const up = Math.abs(p[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      return norm([up[1] * p[2] - up[2] * p[1], up[2] * p[0] - up[0] * p[2], up[0] * p[1] - up[1] * p[0]]);
    };
    // walk from p along t; returns the flat point list and the heading at each step for branches
    const walk = (p, t, steps, step, bend, onStep) => {
      const out = [];
      for (let i = 0; i <= steps; i++) {
        const side = norm([p[1] * t[2] - p[2] * t[1], p[2] * t[0] - p[0] * t[2], p[0] * t[1] - p[1] * t[0]]);
        const jit = (rng() - 0.5) * 0.007;
        const q = norm([p[0] + side[0] * jit, p[1] + side[1] * jit, p[2] + side[2] * jit]);
        const r = sampleHeightMap(heightMap, HM_W, HM_H, q[0], q[1], q[2]);
        if (r < seaR + 0.0008) break;
        out.push(q[0], q[1], q[2], r);
        if (onStep) onStep(i, p, t);
        const c = Math.cos(step), sn = Math.sin(step);
        p = norm([p[0] * c + t[0] * sn, p[1] * c + t[1] * sn, p[2] * c + t[2] * sn]);
        const dt = dot3(t, p); t = norm(t.map((v, k) => v - p[k] * dt));
        t = rot(t, p, bend + (rng() - 0.5) * 0.5 + (rng() < 0.08 ? (rng() - 0.5) * 1.4 : 0)); // a jitter and a rare kink
      }
      return out;
    };
    let best = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const v = pickSite((i) => H[i] > 0.08 && H[i] < 0.6);
      if (v < 0) break;
      const p0 = dirOf(v);
      const t0 = rot(tangentAt(p0), p0, rng() * Math.PI * 2);
      const steps = 40 + Math.floor(rng() * 30), step = 0.012, bend = rrange(rng, -0.04, 0.04);
      const branches = [];
      const main = walk(p0, t0, steps, step, bend, (i, p, t) => {
        if (i > 3 && branches.length < 3 && rng() < 0.07) {
          const bt = rot(t, p, (rng() < 0.5 ? 1 : -1) * rrange(rng, 0.5, 1.1));
          const b = walk(p, bt, 5 + Math.floor(rng() * 6), step * 0.9, rrange(rng, -0.1, 0.1), null);
          if (b.length >= 3 * 4) branches.push(b);
        }
      });
      if (!best || main.length > best.main.length) best = { main, branches };
    }
    if (!best || best.main.length < 12 * 4) return null;
    const lines = [best.main, ...best.branches];
    const n = best.main.length / 4;
    let mid = [0, 0, 0];
    for (const line of lines) for (let i = 0; i < line.length; i += 4) { mid[0] += line[i]; mid[1] += line[i + 1]; mid[2] += line[i + 2]; }
    mid = norm(mid);
    let minDot = 1;
    for (const line of lines) for (let i = 0; i < line.length; i += 4) minDot = Math.min(minDot, line[i] * mid[0] + line[i + 1] * mid[1] + line[i + 2] * mid[2]);
    const reach = Math.cos(Math.acos(Math.min(1, minDot)) + 0.03);
    act.dir = mid; act.points = best.main; act.branches = best.branches; act.r = best.main[3];
    const glow = type === 'ice' ? mix(P.shallow, [1, 1, 1], 0.2) : type === 'exotic' ? P.faunaColor.glow : [1.0, 0.45, 0.1];
    // distance from a point to the nearest crack, in chord units
    const distTo = (x, y, z) => {
      let best = 1;
      for (const pts of lines) {
        const m = pts.length / 4;
        for (let i = 0; i < m - 1; i++) {
          const ax = pts[i * 4], ay = pts[i * 4 + 1], az = pts[i * 4 + 2];
          const bx = pts[i * 4 + 4] - ax, by = pts[i * 4 + 5] - ay, bz = pts[i * 4 + 6] - az;
          const px = x - ax, py = y - ay, pz = z - az;
          const u = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
          const dx = px - bx * u, dy = py - by * u, dz = pz - bz * u;
          const d = dx * dx + dy * dy + dz * dz;
          if (d < best) best = d;
        }
      }
      return Math.sqrt(best);
    };
    act.paint = (x, y, z, out) => {
      if (x * mid[0] + y * mid[1] + z * mid[2] < reach) return;
      const d = distTo(x, y, z);
      if (d > 0.014) return;
      let c = mix(dark, [out[0], out[1], out[2]], smoothstep(0.005, 0.014, d));
      if (d < 0.004) c = mix(glow, c, smoothstep(0.002, 0.004, d));
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    };
  }
  // the world object crosses to the main thread: functions and the block mask stay here
  act.block = block;
  const data = { ...act }; delete data.paint; delete data.block;
  world.activity = data;
  return act;
}

// ---------------------------------------------------------------- the source, issue 34
// One thing on every world with a surface transmits, and the instrument of the probe reads a
// bearing to it. The reader hears the carrier on one landing, takes a second bearing from another
// site, and crosses the two. So the source has to stand where a probe can reach it and where the
// reader can believe it: on dry ground over the beach band, off a cliff, off the poles, and clear
// of the cell of the activity, which already owns its landing.
//
// The stream is makeRng(seed + '|source') and no other stream draws one number more, so every
// world the app built before this issue is unchanged. tools/world-checksum.mjs proves it. The
// motif of the source is not rolled here: music.js rolls it from a stream of its own, so the
// worker takes no number that the tune needs. See slice 5 of issue 34.
//
// The source may not read one vertex of the globe. The icosphere follows the tier, 100 on HIGH and
// 64 on LOW, so a phone and a desktop hold two different sets of vertices and the walk of the
// stream over them parted: one seed gave two wrecks and two readers searched two worlds. The
// candidates now come out of the stream itself, as directions on the sphere, and every test reads
// the field of the globe, which the tier does not touch. Each try draws two numbers whether it
// passes or fails, so the stream stays in step.
//
// One input of the tests does follow the tier, and that is the sea level: generate() takes it as a
// quantile of the continent field over the vertices. sampledSeaLevel() reads a fixed grid of
// 60,000 directions instead and gives one number for every tier, so the tests take that one.
// The patch takes the sea level of the globe the reader looked at, so near a coast the ground and
// these tests can read two sea levels a little apart.
//
// The activity still reads the vertices, so it may differ between the two tiers. That is older
// than this issue and it stays. On the rare candidate that stands near the activity, the rule of
// SOURCE_KEEP cells can therefore fall one way on a phone and the other way on a desktop.
const SOURCE_SLOPE = 0.5;      // the steepest ground the source takes: the rise of the globe over the arc
const SOURCE_LAT = 80;         // degrees: the source stays inside this latitude, off the poles
const SOURCE_KEEP = 4;         // cells the source stands away from the cell of the activity
const SOURCE_TRIES = 600;      // draws before the world gives up and takes no source
const _srcDir = [0, 0, 0], _srcAct = [0, 0, 0];
const _srcE = [0, 0, 0], _srcN = [0, 0, 0], _srcP = [0, 0, 0];
const _srcFld = { h: 0, t: 0, m: 0, fm: 0, r: 0, rg: 0 };

// Two tangent axes at a unit direction. Any pair does: the slope below is the length of the
// gradient and it does not change with the pair.
function tangentsAt(d, e, n) {
  if (Math.abs(d[1]) < 0.9) { e[0] = d[2]; e[1] = 0; e[2] = -d[0]; }   // (0, 1, 0) cross d
  else { e[0] = 0; e[1] = -d[2]; e[2] = d[1]; }                        // (1, 0, 0) cross d
  const l = Math.hypot(e[0], e[1], e[2]) || 1;
  e[0] /= l; e[1] /= l; e[2] /= l;
  n[0] = d[1] * e[2] - d[2] * e[1];
  n[1] = d[2] * e[0] - d[0] * e[2];
  n[2] = d[0] * e[1] - d[1] * e[0];
}

// The elevation a step of s radians from d along the tangent t.
function heightStep(ctx, d, t, s) {
  const c = Math.cos(s), k = Math.sin(s);
  _srcP[0] = d[0] * c + t[0] * k; _srcP[1] = d[1] * c + t[1] * k; _srcP[2] = d[2] * c + t[2] * k;
  return fieldAt(ctx, _srcP[0], _srcP[1], _srcP[2], _srcFld).h;
}

// The slope of the globe at one direction: the rise of the drawn radius over the arc, read over
// half a cell each way. The globe draws its relief EXAGGERATION times too tall, so this is the
// slope the reader sees and not the true one. Over the dry land of five worlds the median stands
// near 0.3 and the tenth part near 0.09, so SOURCE_SLOPE keeps two thirds of the land and drops
// every cliff.
function surfaceSlope(ctx, d) {
  tangentsAt(d, _srcE, _srcN);
  const s = CELL * 0.5;
  const dx = heightStep(ctx, d, _srcE, s) - heightStep(ctx, d, _srcE, -s);
  const dz = heightStep(ctx, d, _srcN, s) - heightStep(ctx, d, _srcN, -s);
  return ctx.amp * Math.hypot(dx, dz) / (2 * s);
}

function makeSource(rng, ctx, world, beachW) {
  world.source = null;
  const act = world.activity && world.activity.dir;
  const actMid = act ? cellDir(dirCell(act[0], act[1], act[2]), 0.5, 0.5, _srcAct) : null;
  const keep = Math.cos(SOURCE_KEEP * CELL);
  const sinLat = Math.sin(SOURCE_LAT * Math.PI / 180);
  const near = (d) => !!actMid && d[0] * actMid[0] + d[1] * actMid[1] + d[2] * actMid[2] > keep;

  // The sea level of every tier. A world with no ocean keeps the one it has, which is already free
  // of the tier. The swap is put back before this function returns, because the patch path reads
  // the same context later; see cachedCtx in generate().
  const seaWas = ctx.seaLevel;
  if (ctx.land < 1) ctx.seaLevel = sampledSeaLevel(ctx);
  try {
    for (let t = 0; t < SOURCE_TRIES; t++) {
      // Two numbers a try, drawn first and drawn always, so a candidate that fails takes the
      // stream on by the same step a candidate that passes does. y runs inside the band of
      // latitude: the area of a sphere is even in y, so the draw is even over that band and no try
      // is thrown away on a pole.
      const y = (rng() * 2 - 1) * sinLat, a = rng() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      // The middle of the cell carries the cell, as cellSite() in cell-grid.js has it: the reader
      // lands on the middle of a cell, so the source stands there too or no landing could hold it. The
      // tests run on the middle and not on the draw, because the snap moves a direction most of a
      // cell and that is far enough to reach the sea, a cliff, or the cell of the activity.
      const d = cellDir(dirCell(Math.cos(a) * r, y, Math.sin(a) * r), 0.5, 0.5, _srcDir);
      if (d[1] > sinLat || d[1] < -sinLat) continue;
      if (near(d)) continue;
      // The field holds no activity: makeActivity() writes its cone into the height array and not
      // into the field, so the slope below never sees one. The rule of SOURCE_KEEP cells is what
      // holds the source off the activity.
      if (fieldAt(ctx, d[0], d[1], d[2], _srcFld).h <= beachW) continue;
      if (surfaceSlope(ctx, d) >= SOURCE_SLOPE) continue;
      world.source = { kind: 'wreck', dir: [d[0], d[1], d[2]] };
      return world.source;
    }
  } finally {
    ctx.seaLevel = seaWas;
  }
  return null;
}

// ---------------------------------------------------------------- gas giant
function generateGas(world, rng, noise, P, detail, post, maxFauna) {
  const gdetail = Math.max(24, Math.round(detail * 0.6));
  post(10, 'Stirring the storms');
  const { pos, idx, vCount, triCount } = icosphere(gdetail);
  const bandFreq = rrange(rng, 5, 11);
  const turb = rrange(rng, 0.25, 0.5);
  const o1 = randDir(rng).map((v) => v * 10), o2 = randDir(rng).map((v) => v * 10);
  const stormLat = rrange(rng, -0.6, 0.6), stormLon = rng() * Math.PI * 2, stormSize = rrange(rng, 0.12, 0.25);
  const bands = P.bands;
  const outPos = new Float32Array(triCount * 9);
  const outCol = new Float32Array(triCount * 9);
  const colorAt = (x, y, z, fi) => {
    const t = noise.fbm(x * 2.5 + o1[0], y * 2.5 + o1[1], z * 2.5 + o1[2], 3) * turb + noise.fbm(x * 7 + o2[0], y * 7 + o2[1], z * 7 + o2[2], 2) * 0.08;
    const b = y * bandFreq + t * 2.2 + 100;
    const k = Math.floor(b), fr = b - k;
    const order = [0, 3, 1, 4, 2, 3, 0, 4];
    const c0 = bands[order[((k % 8) + 8) % 8]], c1 = bands[order[(((k + 1) % 8) + 8) % 8]];
    let c = mix(c0, c1, smoothstep(0.72, 1.0, fr));
    // great storm
    const lon = Math.atan2(z, x);
    const dLon = Math.atan2(Math.sin(lon - stormLon), Math.cos(lon - stormLon));
    const dd = Math.hypot(dLon * 0.6, (y - stormLat) * 2.2) / stormSize;
    if (dd < 1) c = mix(P.storm, c, smoothstep(0.55, 1, dd));
    const j = 1 + (hash1(fi) - 0.5) * 2 * P.jitter;
    return [c[0] * j, c[1] * j, c[2] * j];
  };
  for (let f = 0; f < triCount; f++) {
    const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
    const cx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3, cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
    const col = colorAt(cx, cy, cz, f);
    const o = f * 9;
    const r = 1;
    for (const [k, v] of [[0, a], [3, b], [6, c]]) {
      outPos[o + k] = pos[v * 3] * r; outPos[o + k + 1] = pos[v * 3 + 1] * r; outPos[o + k + 2] = pos[v * 3 + 2] * r;
      outCol[o + k] = col[0]; outCol[o + k + 1] = col[1]; outCol[o + k + 2] = col[2];
    }
    if ((f & 16383) === 0) post(10 + (f / triCount) * 75, 'Stirring the storms');
  }
  world.hasOcean = false; world.hasClouds = false; world.floraCount = 0; world.floraKinds = [];
  world.atmoStrength = 0.9;
  const sr = Math.sqrt(1 - stormLat * stormLat);
  world.storm = { dir: [sr * Math.cos(stormLon), stormLat, sr * Math.sin(stormLon)], size: stormSize };
  // The upper cloud deck, which app.js lays over the banded body. It draws no numbers, so no world
  // changes: it takes the light bands for its tops and a dark band for its gaps.
  world.deck = { top: toHex(mix(bands[3], [1, 1, 1], 0.2)), gap: toHex(mix(bands[1], bands[0], 0.5)), freq: bandFreq };
  // The weather of the lower deck, which app.js turns in a shader: the small storms, and the
  // polygon the jet at each pole draws. It takes a stream of its own, so no world changes.
  const vr = makeRng(world.seed + '|vortices');
  const vortices = [], nv = 3 + Math.floor(vr() * 4), sd = world.storm.dir;
  for (let tries = 0; vortices.length < nv && tries < 40; tries++) {
    const y = rrange(vr, -0.7, 0.7), lon = vr() * Math.PI * 2, s = Math.sqrt(1 - y * y);
    const dir = [s * Math.cos(lon), y, s * Math.sin(lon)], size = rrange(vr, 0.03, 0.065);
    const far = (a, r) => Math.acos(Math.min(1, dir[0] * a[0] + dir[1] * a[1] + dir[2] * a[2])) > r + size * 1.5;
    if (far(sd, stormSize * 1.3) && vortices.every((v) => far(v, v[3]))) vortices.push([...dir, size]);
  }
  Object.assign(world.deck, {
    vortices, storm: toHex(P.storm), dark: toHex(mix(bands[2], [0, 0, 0], 0.3)),
    sides: [pick(vr, [5, 6, 6, 7, 8]), pick(vr, [5, 6, 7, 8, 9])],
  });
  makeActivity(makeRng(world.seed + '|activity'), 'gas', world, P);
  world.rings = rng() < 0.65 ? makeRings(rng, mix(bands[0], [1, 1, 1], 0.2), 1) : null;
  world.moons = makeMoons(rng, "gas", !!world.rings);
  describeLife({ seed: world.seed, world });
  const fauna = makeGasFauna(makeRng(world.seed + '|fauna'), maxFauna, world);
  world.stats = makeStats('gas', world, 0);
  post(96, 'Almost there');
  const flora = new Float32Array(0), clouds = new Float32Array(0);
  return { world, terrain: { pos: outPos, col: outCol }, flora, clouds, fauna };
}

// ---------------------------------------------------------------- the ground patch
// The globe draws its relief 40 times too tall, so a peak of 0.06 units reads as 10 km and not
// as 390 km. The ground divides by the same number, and it works in metres.
const EXAGGERATION = 40;
// Issue 30 took the three noise octaves of the patch out. They ran off the seed of the patch, so
// two patches side by side grew different hills and no stream could join them, and one smooth
// octave gave rounded blobs and no ridge. detailAt() carries all of that relief now, from the
// direction on the sphere alone.
const SHORE_DAMP = 45;                 // units: the band where the patch relief fades at the shore
// The patch covers a square of the globe that the reader can see and aim at. That square is far
// wider than the ground box it draws into, so the ground box holds an artificial scale: one unit
// is K metres across and V metres up. See "The patch cell" in docs/issues/README.md.
const FIELD_N = 65;                    // samples of the globe field across the patch, per side
// The rim, issue 18. The rim is the ground the patch stands in: it runs from the edge of the box
// out past the fog, so the reader at the ceiling sees relief in every direction and no square
// edge. RIM_REACH is the default reach in units; RIM in tiers.js is the value the page sends. A
// rim cell is RIM_CELL patch steps, so a low tier draws a coarser rim, and the rim reads the globe
// field once per RIM_FIELD_CELLS rim cells.
const RIM_REACH = 4000;                // units from the site to the outer edge of the rim
const RIM_CELL = 25;                   // patch grid steps per rim cell
const RIM_FIELD_CELLS = 2;             // rim cells per sample of the globe field over the rim
const RIM_FIELD_MAX = 65;              // the most samples the rim field takes, per side
const EDGE_CELLS = 2;                  // rim cells the patch fades its knolls and its rock over
// The vertical scale of the box, issue 30. The highest land of the world stands WORLD_RELIEF units
// over the sea, and every patch of that world divides its true metres by the same number. So a
// cell that holds a range reads tall, a cell on a plain reads flat, and two patches that share an
// edge hold one height along it. Until issue 30 each patch scaled its own cell to a fixed 240
// units, which made a peak and a plain read alike and made a shared edge disagree.
const WORLD_RELIEF = 800;              // units: the box height of the highest land of a world
const SLOPE_ROCK = [0.55, 1.15];       // the slope band where the ground turns to bare rock
const BIOME_NAME = ['ocean', 'shallows', 'beach', 'tundra', 'snow', 'rock', 'forest', 'grass', 'dry', 'desert'];
// The shore, in metres. The globe paints its beach over a band of the elevation field that stands
// for hundreds of metres on the ground, because a globe face is about 50 km wide. At 1 m per unit
// that band would paint the whole patch as sand, so the patch reads the shore in metres: the sand
// strip is 1.5 m of elevation, and the sea bed reaches the deep colour 12 m under the water line.
const BEACH_M = 1.5;
const DEEP_M = 12;

// ---------------------------------------------------------------- the cell grid, issue 30
// cell-grid.js holds the grid, the cell of a site, the map of the ground box, and the frame of a
// site. patch() takes the cell of the site it is given; the source of issue 34 picks a cell of its
// own.

// The biome of one point, by the rules the globe paints with. beachW carries the width of the
// beach band, so the patch can ask for a strip in metres where the globe asks for its own band.
function biomeIndex(ctx, h, t, m, beachW = ctx.beachW) {
  if (h < -0.12) return 0;
  if (h < 0) return 1;
  if (h < beachW) return t < 0.25 ? 3 : 2;
  if (t < 0.12 || h > ctx.snowLine + (t - 0.5) * 0.4) return 4;
  if (h > ctx.snowLine - 0.2 + (t - 0.5) * 0.25) return 5;
  if (t < 0.28) return 3;
  if (m > 0.22) return 6;
  if (m > -0.15) return 7;
  if (m > -0.45 || t < 0.6) return 8;
  return 9;
}

// The surface byte of one node for ground-detail.js: the biome plus one in the low four bits, and
// the share of bare rock in fifteenths in the high four. The shader reads the rock share per
// vertex, so it needs no slope of its own.
function packSurface(bi, rk) {
  return (bi + 1) | (Math.round(rk * 15) << 4);
}

// The colour of one biome, written into out. The two mixed biomes take the same hash the globe
// takes, so a patch and the face above it draw from one rule.
function biomeTint(ctx, bi, h, i, out) {
  const P = ctx.P;
  let a, b = null, k = 0;
  switch (bi) {
    case 0: a = P.deep; break;
    case 1: a = P.deep; b = P.shallow; k = smoothstep(-0.12, 0, h); break;
    case 2: a = P.beach || P.dry; break;
    case 3: a = P.tundra; break;
    case 4: a = P.snow; break;
    case 5: a = P.rock; b = P.rock2; k = hash1(i * 7 + 3); break;
    case 6: a = P.forest; break;
    case 7: a = P.grass; b = P.grass2; k = hash1(i * 3 + 1); break;
    case 8: a = P.dry; break;
    default: a = P.desert;
  }
  if (b) { out[0] = lerp(a[0], b[0], k); out[1] = lerp(a[1], b[1], k); out[2] = lerp(a[2], b[2], k); }
  else { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; }
  return out;
}

// The sea level without a globe build: the land quantile of the continent field over a Fibonacci
// sphere. generate() fills the exact value, so this runs only on a worker that never built the
// globe of this seed.
function sampledSeaLevel(ctx) {
  const N = 60000, c = new Float32Array(N), w = new Float32Array(3);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i + 0.5) * (2 / N), r = Math.sqrt(Math.max(0, 1 - y * y)), a = ga * i;
    c[i] = contAt(ctx, Math.cos(a) * r, y, Math.sin(a) * r, w);
  }
  c.sort();
  return c[Math.min(N - 1, Math.floor((1 - ctx.land) * N))];
}

// The context of a patch: the one the world call of the same seed and the same world options
// built. It is a cache. When it holds another world, the world call runs again first, so the sea
// level and the facts of the world are the ones of the globe the reader looked at, and a patch
// depends only on the arguments of the call.
function contextFor(seed, worldOpts) {
  if (cachedKey !== worldKey(seed, worldOpts)) generate(seed, worldOpts);
  return cachedCtx;
}

// ---------------------------------------------------------------- the flora of the patch
// The globe reads the moisture and the forest mask at continent scale, so both hold nearly one
// value over 1,500 m. The patch keeps the kind rules of the globe and adds a clump field of its
// own, so a forest site shows glades and a desert site shows cactus in the hollows.
const FLORA_CELL = 6;        // metres: one plant to a cell, and the cap thins the rest away
const FLORA_GAP = 3;         // metres: the least distance between two plants
const FLORA_SLOPE = 0.9;     // rise over run: a steeper cell takes only rock and boulders
const CLUMP_WAVE = 130;      // metres: the wavelength of the clumps inside the patch
const CLUMP_AMP = 0.35;      // how far the clumps move the mask
const FLORA_FLOOR = 0.02;    // the chance of a plant where the mask is at its lowest
// The rim outside the box holds no plants. A hard line of forest at the edge of the box reads as
// a rectangle from the air, so the chance of a plant falls to zero over the last FLORA_EDGE units
// of the box. See "the rectangle" in ground.js. Issue 20.
//
// This band also sets how far the reader may walk, because dense flora ends at a square of half
// width half - FLORA_EDGE and TARGET_REACH in ground.js must stay inside it. At 300 the dense
// square was 900 units across, so the reader walked 28% of the area the patch draws. Issue 25 cut
// the band to 100, which takes the dense square to 1,300 units and about 2.1 times the area. The
// band is still wide enough to hide the line: the plants that go are the ones the reader sees
// through the fog, and a fade of 100 units is two rim cells, the same band the terrain uses.
const FLORA_EDGE = 100;      // units, the band the plants thin out over at the edge of the box
// the four cells the scan writes before the current one: west, north-west, north, north-east
const GAP_DI = [-1, -1, 0, 1], GAP_DJ = [0, -1, -1, -1];

// Issue 21. The patch used to grow two kinds, both at one size range, over an even carpet. Four
// more fields break that carpet up.
const COMM_WAVE = 330;       // units: the wavelength of one plant community
const GROVE_WAVE = 46;       // units: the wavelength of a thicket inside a community
const BARE_WAVE = 195;       // units: the wavelength of the open ground between the communities
const VIGOUR_WAVE = 165;     // units: the wavelength of the field that says how big a plant grows
const GIANT_CHANCE = 0.035;  // the chance that one plant grows far past the range of its kind
const SIZE_CURVE = 1.9;      // over 1 the sizes bunch at the small end, so a big plant stands out
const MARK_MARGIN = 220;     // units: an arrangement stays this far inside the edge of the box
const BIG_GAP = 340;         // units: the least distance between two colossus bodies

// Issue 27. A world type carries a density of its own, and terran, ocean, and exotic all hold more
// than 1. The chance of a plant then saturated over most of the range of the mask, so nearly every
// land cell of the grid took a plant and the reader walked through one continuous thicket. The
// excess density now buys contrast instead of more plants. The ceiling holds the chance short of
// solid, and the thicket field keeps its crests full and gives up its troughs. A sparse world does
// not change, because the shaping fades in with the density of the community that owns the ground.
const FLORA_CEIL = 0.7;      // the most of the cell grid one thicket may fill
const CLUST_WAVE = 72;       // units: the wavelength of one thicket
const CLUST_DEPTH = 0.85;    // the share of the chance the trough of the thicket field takes away
const CLUST_FROM = 0.5;      // the density of a community where the shaping starts
const CLUST_FULL = 1.3;      // the density where the shaping cuts as deep as it can

// Issue 27. The colossus stands one to three times in the whole box, so most of the ground carries
// no landmark at all. The box is 3,000 units across and the reader sees about 900 of it, so the
// patch also seats one or two mega plants in every square of MEGA_CELL. A mega plant is a plant of
// the community that owns the ground, grown far past its kind. It stands over the canopy and under
// the colossus, so the three steps of scale still read: canopy, mega, colossus.
const MEGA_CELL = 400;       // units: the side of the square that seats the mega plants
const MEGA_LOW = 2.0;        // the least a mega plant grows past the top of the range of its kind
const MEGA_HIGH = 3.4;       // the most it grows past it
const MEGA_MIN = 22;         // units: under this a plant does not stand over the canopy
const MEGA_MAX = 58;         // units: over this it competes with the colossus, which starts at 70
const MEGA_CLEAR = 150;      // units: a mega plant keeps this far from a colossus body
const MEGA_GAP = 90;         // units: the least distance between two mega plants
const MEGA_SEAT = 0.15;      // the least thicket value a square needs to seat a mega plant

// units, the size of one plant, by kind. A tower mushroom is over the tallest pine of the same
// patch, and the colossus stands over everything.
const FLORA_M = [
  [5, 16],     // 0 tree
  [7, 22],     // 1 pine
  [2, 6],      // 2 cactus
  [1.5, 8],    // 3 crystal
  [1, 4],      // 4 mushroom
  [0.8, 5],    // 5 boulder
  [6, 14],     // 6 palm
  [19, 42],    // 7 tower mushroom
  [4, 26],     // 8 spindle
  [1.5, 7],    // 9 puff
  [2, 12],     // 10 shard
  [0.6, 1.8],  // 11 grass, which no patch grows
  [70, 150],   // 12 colossus
  [3, 10],     // 13 fan
  [2, 9],      // 14 pod
  [3, 15],     // 15 stack
];

// The plants one world type may grow. `core` holds the kinds the reader knows from orbit, and
// `odd` holds the alien kinds. A patch picks a few communities from both lists, so one patch can
// show a wood, a field of spindles, and a stand of towers instead of one kind everywhere.
const FLORA_POOL = {
  terran: { core: [FLORA.TREE, FLORA.PINE, FLORA.PALM], odd: [FLORA.TOWER, FLORA.PUFF, FLORA.SPINDLE, FLORA.FAN, FLORA.POD, FLORA.MUSHROOM, FLORA.STACK] },
  ocean: { core: [FLORA.PALM, FLORA.TREE], odd: [FLORA.FAN, FLORA.POD, FLORA.PUFF, FLORA.SPINDLE, FLORA.TOWER] },
  desert: { core: [FLORA.CACTUS, FLORA.BOULDER], odd: [FLORA.SPINDLE, FLORA.STACK, FLORA.SHARD, FLORA.POD, FLORA.FAN] },
  ice: { core: [FLORA.CRYSTAL, FLORA.PINE], odd: [FLORA.SHARD, FLORA.SPINDLE, FLORA.PUFF, FLORA.STACK, FLORA.TOWER] },
  lava: { core: [FLORA.CRYSTAL, FLORA.BOULDER], odd: [FLORA.SHARD, FLORA.SPINDLE, FLORA.STACK, FLORA.PUFF] },
  exotic: { core: [FLORA.MUSHROOM, FLORA.TREE, FLORA.CRYSTAL], odd: [FLORA.TOWER, FLORA.PUFF, FLORA.SPINDLE, FLORA.SHARD, FLORA.FAN, FLORA.POD, FLORA.STACK] },
};
// a kind that may stand on a slope steeper than FLORA_SLOPE
const FLORA_ROCK = new Set([FLORA.BOULDER, FLORA.CRYSTAL, FLORA.SHARD, FLORA.STACK]);
// every alien kind a world may borrow, whatever its type. See floraCommunities().
const FLORA_ALIEN = [
  FLORA.TOWER, FLORA.SPINDLE, FLORA.PUFF, FLORA.SHARD, FLORA.FAN, FLORA.POD, FLORA.STACK,
  FLORA.MUSHROOM, FLORA.CRYSTAL,
];

// The communities of one patch. Each one takes a band of the community field, so it holds a part
// of the box, and it carries a lead kind, a companion, and a density of its own.
function floraCommunities(type, rng, wrng) {
  const base = FLORA_POOL[type] || FLORA_POOL.terran;
  // The flora of the world, not of the patch. Every planet borrows one to three kinds from the
  // whole alien set and drops up to two the type usually grows, so two terran worlds do not hold
  // the same list. `wrng` runs off the seed of the world, so every patch of one planet agrees.
  // Issue 22: without this a reader who moved between planets saw the same plants.
  const guests = [];
  const gn = 1 + Math.floor(wrng() * 3);
  for (let i = 0; i < gn; i++) guests.push(FLORA_ALIEN[Math.floor(wrng() * FLORA_ALIEN.length)]);
  let odd = base.odd.concat(guests);
  const drop = Math.floor(wrng() * 3);
  for (let i = 0; i < drop && odd.length > 3; i++) odd.splice(Math.floor(wrng() * odd.length), 1);
  const pool = { core: base.core, odd };
  // how much of the patch the alien kinds take. An exotic world is strange nearly everywhere.
  const strange = type === 'exotic' ? rrange(rng, 0.55, 0.92) : rrange(rng, 0.3, 0.7);
  const count = 4 + Math.floor(rng() * 4);
  // Each community leads with a kind of its own. A pool that draws with replacement gave one kind
  // over half the plants of a patch, which is the carpet this issue set out to break.
  const used = new Set();
  const draw = (list) => {
    for (let t = 0; t < 8; t++) {
      const k = list[Math.floor(rng() * list.length)];
      if (!used.has(k)) { used.add(k); return k; }
    }
    return list[Math.floor(rng() * list.length)];
  };
  const out = [];
  for (let i = 0; i < count; i++) {
    const lead = draw(rng() < strange ? pool.odd : pool.core);
    const mates = rng() < 0.55 ? pool.odd : pool.core;
    out.push({
      lead,
      mate: mates[Math.floor(rng() * mates.length)],
      mix: rrange(rng, 0.14, 0.45),        // the share of the community the companion takes
      density: rrange(rng, 0.45, 1.5),     // how full the community stands
      vigour: rrange(rng, 0.85, 1.2),      // how big it grows its plants
    });
  }
  return out;
}

// The size of one plant. The curve bunches the sizes at the small end, so most plants are small
// and the few large ones read as landmarks. The vigour field of the patch scales the whole range,
// so one part of the box grows stunted and another grows tall.
//
// The ceiling matters. The vigour of the field, the vigour of the community, and the giant roll
// all multiply, and the first build grew a tower mushroom of 114 units against a colossus of 105.
// Nothing but the colossus may reach the size of a colossus, so a plant stops at 1.9 of the top of
// its own range.
function floraSize(rng, kind, vigour) {
  const mm = FLORA_M[kind] || FLORA_M[0];
  let s = mm[0] + (mm[1] - mm[0]) * Math.pow(rng(), SIZE_CURVE);
  if (rng() < GIANT_CHANCE) s *= rrange(rng, 1.4, 2.2);
  return clamp(s * vigour, mm[0] * 0.5, mm[1] * 1.9);
}

// The plants of one patch. One cell of FLORA_CELL units holds at most one plant, the plant jitters
// inside its cell, and a plant closer than FLORA_GAP to a neighbour is dropped. The stride
// sampling at the end is the one packFauna uses.
//
// Issue 21 put four more fields over that scan. The community field says which plants live where,
// the grove field knots them into thickets, the bare field opens ground that holds nothing, and
// the vigour field says how big they grow. Two passes then run after the scan. The arrangements
// stand plants in a ring, an arc, a row, or a spiral. The colossus pass drops one to three bodies
// that stand over the fog, each with a court of smaller plants. Both passes keep their plants past
// the cap, because the cap must not drop a landmark.
function patchFlora(ctx, s) {
  const { heights, vary, n, grid, half, size, hPerM, hPerU, cellT, cellM, cellF, noise, rng } = s;
  const blocked = s.blocked || null;      // the footprint of the phenomenon takes no plant
  const maxFlora = s.maxFlora | 0;
  const none = { flora: new Float32Array(0) };
  if (maxFlora <= 0 || !ctx.P.flora || ctx.P.flora.length === 0) return none;

  const type = ctx.type, density = ctx.floraDensity;
  const beachH = BEACH_M * hPerM;
  const cells = Math.max(1, Math.floor(size / FLORA_CELL)), cw = size / cells;
  const oc0 = rng() * 90, oc1 = rng() * 90, fq = 1 / CLUMP_WAVE;
  const om0 = rng() * 90, om1 = rng() * 90;     // the community field
  const og0 = rng() * 90, og1 = rng() * 90;     // the grove field
  const ob0 = rng() * 90, ob1 = rng() * 90;     // the bare field
  const ov0 = rng() * 90, ov1 = rng() * 90;     // the vigour field
  // Two draws for the field of the grass tufts, which the ground no longer grows. The stream keeps
  // them, so every later draw and every plant stays where it was.
  rng(); rng();
  // Issue 27 draws its two fields from streams of their own, so the thicket field and the mega
  // plants cannot move a plant that the scan already placed. The patch keeps the communities, the
  // kinds, and the sizes it grew before this issue. See describePatchFlora() for the same rule.
  const krng = makeRng(s.pseed + '|thicket'), mrng = makeRng(s.pseed + '|mega');
  const ok0 = krng() * 90, ok1 = krng() * 90;   // the thicket field
  const comms = floraCommunities(type, rng, makeRng(ctx.world.seed + '|flora-kinds'));
  const bareShare = rrange(rng, 0.12, 0.5);     // how much open ground this patch holds

  // The ground under one point: the grid vertex, the height, the slope, the normal, and whether a
  // plant may stand there at all. The beach band must be the metre-scale one of issue 05.
  const probe = { h: 0, slope: 0, nx: 0, ny: 1, nz: 0, t: 0, m: 0, fm: 0, land: false };
  function ground(x, z) {
    const gi = clamp(Math.round((x + half) / grid), 1, n - 2);
    const gj = clamp(Math.round((z + half) / grid), 1, n - 2);
    const gk = gj * n + gi, h = heights[gk];
    const dhx = (heights[gk + 1] - heights[gk - 1]) / (2 * grid);
    const dhz = (heights[gk + n] - heights[gk - n]) / (2 * grid);
    const inv = 1 / Math.hypot(dhx, 1, dhz);
    probe.h = h;
    probe.slope = Math.hypot(dhx, dhz);
    probe.nx = -dhx * inv; probe.ny = inv; probe.nz = -dhz * inv;
    probe.t = cellT[gk];
    probe.m = cellM[gk] - vary[gk] * 0.1 + Math.max(cellF[gk], 0) * 0.06;
    probe.fm = cellF[gk];
    probe.land = h >= 0 && biomeIndex(ctx, h * hPerU, probe.t, probe.m, beachH) > 2
      && !(blocked && blocked(x, z));
    return probe;
  }

  // The share of the open ground at one point. 1 is bare: no plant grows there.
  const bareAt = (x, z) => {
    const b = noise.n3(x / BARE_WAVE + ob0, z / BARE_WAVE + ob1, 7.5) * 0.5 + 0.5;
    return smoothstep(1 - bareShare - 0.16, 1 - bareShare + 0.06, b);
  };
  const vigourAt = (x, z) => 0.7 + 0.6 * (noise.n3(x / VIGOUR_WAVE + ov0, z / VIGOUR_WAVE + ov1, 13.5) * 0.5 + 0.5);
  // The thickets of a dense community, 0 in a glade and 1 in a stand. It is a field of its own and
  // not the grove field, because the grove field also picks the kind: a shaping that emptied the
  // low band of the grove field would take the companion plant of every dense community with it.
  const clustAt = (x, z) =>
    smoothstep(-0.25, 0.3, noise.n3(x / CLUST_WAVE + ok0, z / CLUST_WAVE + ok1, 27.5));
  const groveAt = (x, z) => noise.n3(x / GROVE_WAVE + og0, z / GROVE_WAVE + og1, 19.5);
  // Two fields, not one. Simplex noise bunches around the middle of its range, so one field cut
  // into bands gave the middle community most of the box. Two fields at two wavelengths make a
  // patchwork of nine zones, and a community may hold more than one of them.
  const commAt = (x, z) => {
    const a = noise.n3(x / COMM_WAVE + om0, z / COMM_WAVE + om1, 3.5) * 0.5 + 0.5;
    const b = noise.n3(x / (COMM_WAVE * 0.55) + om1, z / (COMM_WAVE * 0.55) + om0, 9.5) * 0.5 + 0.5;
    const i = clamp(Math.floor(a * 3), 0, 2), j = clamp(Math.floor(b * 3), 0, 2);
    return comms[(i * 3 + j) % comms.length];
  };

  // The kind of one cell. The temperature gate is the one the globe applies.
  function kindAt(comm, grove, slope, t) {
    if ((type === 'terran' || type === 'ocean') && t < 0.12) return -1;
    if (type === 'exotic' && t < 0.1) return -1;
    const kind = (grove * 0.5 + 0.5) < comm.mix ? comm.mate : comm.lead;
    if (slope > FLORA_SLOPE && !FLORA_ROCK.has(kind)) return -1;
    return kind;
  }

  // ---------------------------------------------------------------- the scatter
  const gap2 = FLORA_GAP * FLORA_GAP, N = cells * cells;
  const cX = new Float32Array(N), cY = new Float32Array(N), cZ = new Float32Array(N);
  const nX = new Float32Array(N), nY = new Float32Array(N), nZ = new Float32Array(N);
  const cS = new Float32Array(N), cK = new Int8Array(N).fill(-1);
  let found = 0;

  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const x = -half + (i + rng()) * cw, z = -half + (j + rng()) * cw;
      const g = ground(x, z);
      if (!g.land) continue;

      const comm = commAt(x, z);
      const grove = groveAt(x, z);
      const kind = kindAt(comm, grove, g.slope, g.t);
      if (kind < 0) continue;

      // The clump field of issue 07 still runs, because the globe reads its moisture and its
      // forest mask at continent scale and both hold one value over the whole box. The grove field
      // rides on top of it, so a community shows thickets and glades inside its own ground.
      const clump = noise.n3(x * fq + oc0, z * fq + oc1, 31.5) * CLUMP_AMP;
      const mask = g.fm + clump + (g.m + clump * 0.5) * 0.5 + grove * 0.3;

      // The rim outside the box holds no plants, so the chance falls to zero over the last
      // FLORA_EDGE units. See "the rectangle" in ground.js. Issue 20.
      const ed = Math.min(half - Math.abs(x), half - Math.abs(z));
      const edge = ed >= FLORA_EDGE ? 1 : smoothstep(0, FLORA_EDGE, ed);
      const open = 1 - bareAt(x, z);
      const lush = density * comm.density;
      // Issue 27. A community of a lush over 1 used to saturate this chance and stand as one
      // continuous thicket. The ceiling holds it short of solid, and the depth of the shaping
      // follows the lush, so the ground of a dense community gathers into stands and glades while
      // a sparse community keeps the even scatter it always had.
      const thick = Math.min(FLORA_CEIL,
        FLORA_FLOOR + (lush - FLORA_FLOOR) * smoothstep(-0.35, 0.35, mask));
      const heavy = smoothstep(CLUST_FROM, CLUST_FULL, lush);
      const stand = 1 - heavy * CLUST_DEPTH * (1 - clustAt(x, z));
      if (rng() >= thick * stand * edge * open) continue;

      // The gap test reads the four neighbours the scan already wrote, so it reads every pair
      // once. A cell two steps away is at least 6 units off, which is over the gap already.
      let close = false;
      for (let d = 0; d < 4 && !close; d++) {
        const ni = i + GAP_DI[d], nj = j + GAP_DJ[d];
        if (ni < 0 || nj < 0 || ni >= cells) continue;
        const nk = nj * cells + ni;
        if (cK[nk] < 0) continue;
        const ddx = cX[nk] - x, ddz = cZ[nk] - z;
        close = ddx * ddx + ddz * ddz < gap2;
      }
      if (close) continue;

      const ci = j * cells + i;
      cX[ci] = x; cY[ci] = g.h; cZ[ci] = z;
      nX[ci] = g.nx; nY[ci] = g.ny; nZ[ci] = g.nz;
      cS[ci] = floraSize(rng, kind, vigourAt(x, z) * comm.vigour);
      cK[ci] = kind;
      found++;
    }
  }

  // ---------------------------------------------------------------- the arrangements
  // A ring, an arc, a row, and a spiral read as made things, so the reader asks who made them.
  // These plants stand outside the cell grid and past the cap.
  const fixed = [];               // x y z, nx ny nz, size, kind — the layout of the flora array
  const place = (x, z, kind, sz) => {
    if (Math.abs(x) > half - 8 || Math.abs(z) > half - 8) return;
    const g = ground(x, z);
    if (!g.land) return;
    if (g.slope > FLORA_SLOPE && !FLORA_ROCK.has(kind)) return;
    fixed.push(x, g.h, z, g.nx, g.ny, g.nz, sz, kind);
  };

  const markCount = 2 + Math.floor(rng() * 5);
  for (let mi = 0; mi < markCount; mi++) {
    let cx = 0, cz = 0, seat = false;
    for (let tries = 0; tries < 20 && !seat; tries++) {
      cx = rrange(rng, -half + MARK_MARGIN, half - MARK_MARGIN);
      cz = rrange(rng, -half + MARK_MARGIN, half - MARK_MARGIN);
      const g = ground(cx, cz);
      seat = g.land && g.slope < 0.55;
    }
    if (!seat) continue;
    const comm = commAt(cx, cz);
    const kind = rng() < 0.5 ? comm.lead : comm.mate;
    const base = floraSize(rng, kind, rrange(rng, 0.85, 1.45));
    const count = 7 + Math.floor(rng() * 13);
    const turn0 = rng() * Math.PI * 2;
    const form = rng();
    if (form < 0.42) {                                   // a ring
      const rad = rrange(rng, 8, 34);
      for (let k = 0; k < count; k++) {
        const a = turn0 + (k / count) * Math.PI * 2 + rrange(rng, -0.05, 0.05);
        const rd = rad * rrange(rng, 0.94, 1.06);
        place(cx + Math.cos(a) * rd, cz + Math.sin(a) * rd, kind, base * rrange(rng, 0.85, 1.15));
      }
    } else if (form < 0.72) {                            // an arc
      const rad = rrange(rng, 14, 48), span = rrange(rng, 1.2, 3.4);
      for (let k = 0; k < count; k++) {
        const a = turn0 + (k / Math.max(count - 1, 1) - 0.5) * span;
        place(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad, kind, base * rrange(rng, 0.8, 1.2));
      }
    } else if (form < 0.9) {                             // a row
      const step = rrange(rng, 6, 18), dx = Math.cos(turn0), dz = Math.sin(turn0);
      for (let k = 0; k < count; k++) {
        const d = (k - (count - 1) / 2) * step;
        place(cx + dx * d + rrange(rng, -1.5, 1.5), cz + dz * d + rrange(rng, -1.5, 1.5),
          kind, base * rrange(rng, 0.85, 1.15));
      }
    } else {                                             // a spiral that grows outward
      const grow = rrange(rng, 1.6, 2.6);
      for (let k = 0; k < count + 8; k++) {
        const a = turn0 + k * 0.9, rd = 3 + k * grow;
        place(cx + Math.cos(a) * rd, cz + Math.sin(a) * rd, kind, base * (0.55 + k * 0.05));
      }
    }
    // one body of the other kind in the middle, so an arrangement is not one plant repeated
    if (rng() < 0.5) {
      const inner = kind === comm.lead ? comm.mate : comm.lead;
      place(cx, cz, inner, floraSize(rng, inner, 1.5));
    }
  }

  // ---------------------------------------------------------------- the colossus
  // One to three bodies per patch. Nothing else on the ground comes near its size, so it gives the
  // reader the scale of everything around it.
  const bigCount = 1 + (rng() < 0.35 ? 1 : 0) + (rng() < 0.12 ? 1 : 0);
  const bigAt = [];
  for (let b = 0; b < bigCount; b++) {
    for (let tries = 0; tries < 40; tries++) {
      const x = rrange(rng, -half + MARK_MARGIN, half - MARK_MARGIN);
      const z = rrange(rng, -half + MARK_MARGIN, half - MARK_MARGIN);
      const g = ground(x, z);
      if (!g.land || g.slope > 0.4) continue;
      let far = true;
      for (let q = 0; q < bigAt.length; q += 2) {
        if (Math.hypot(x - bigAt[q], z - bigAt[q + 1]) < BIG_GAP) far = false;
      }
      if (!far) continue;
      bigAt.push(x, z);
      fixed.push(x, g.h, z, g.nx, g.ny, g.nz,
        floraSize(rng, FLORA.COLOSSUS, rrange(rng, 0.85, 1.3)), FLORA.COLOSSUS);
      // a court of smaller plants under it, so the body does not stand on empty ground
      const court = commAt(x, z);
      const cn = 10 + Math.floor(rng() * 14);
      for (let k = 0; k < cn; k++) {
        const a = rng() * Math.PI * 2, rd = rrange(rng, 12, 70);
        place(x + Math.cos(a) * rd, z + Math.sin(a) * rd, court.mate, floraSize(rng, court.mate, 1.1));
      }
      break;
    }
  }

  // ---------------------------------------------------------------- the mega plants
  // One or two oversize plants in every square of MEGA_CELL, wherever the ground takes them. Each
  // one sits at the crest of the thicket field, so a stand carries the landmark and the glades
  // between the stands stay open. A square of water, of rock, or of open ground seats none, which
  // is why the search scores its tries instead of taking the first one that holds. These plants
  // stand past the cap, as the arrangements and the colossus do, because the cap must not drop a
  // landmark.
  const megaAt = [];
  const megaCells = Math.max(1, Math.round(size / MEGA_CELL)), mw = size / megaCells;
  const megaInner = half - FLORA_EDGE;
  for (let mj = 0; mj < megaCells; mj++) {
    for (let mi = 0; mi < megaCells; mi++) {
      const want = 1 + (mrng() < 0.35 ? 1 : 0);
      for (let k = 0; k < want; k++) {
        let bx = 0, bz = 0, best = MEGA_SEAT;
        for (let tries = 0; tries < 6; tries++) {
          const x = -half + (mi + mrng()) * mw, z = -half + (mj + mrng()) * mw;
          if (Math.abs(x) > megaInner || Math.abs(z) > megaInner) continue;
          const g = ground(x, z);
          if (!g.land || g.slope > 0.5) continue;
          let far = true;
          for (let q = 0; q < bigAt.length && far; q += 2) {
            if (Math.hypot(x - bigAt[q], z - bigAt[q + 1]) < MEGA_CLEAR) far = false;
          }
          for (let q = 0; q < megaAt.length && far; q += 2) {
            if (Math.hypot(x - megaAt[q], z - megaAt[q + 1]) < MEGA_GAP) far = false;
          }
          if (!far) continue;
          const score = clustAt(x, z) * (1 - bareAt(x, z));
          if (score > best) { best = score; bx = x; bz = z; }
        }
        if (best <= MEGA_SEAT) continue;
        const comm = commAt(bx, bz);
        const kind = mrng() < 0.7 ? comm.lead : comm.mate;
        const g = ground(bx, bz);
        if (g.slope > FLORA_SLOPE && !FLORA_ROCK.has(kind)) continue;
        const mm = FLORA_M[kind] || FLORA_M[0];
        const sz = clamp(mm[1] * rrange(mrng, MEGA_LOW, MEGA_HIGH), MEGA_MIN, MEGA_MAX);
        fixed.push(bx, g.h, bz, g.nx, g.ny, g.nz, sz, kind);
        megaAt.push(bx, bz);
      }
    }
  }

  // ---------------------------------------------------------------- the output
  const fixedCount = fixed.length / 8;
  const budget = Math.max(0, maxFlora - fixedCount);
  const keep = Math.min(found, budget);
  const stride = found / Math.max(keep, 1);
  const idx = new Int32Array(found);
  let f = 0;
  for (let ci = 0; ci < N; ci++) if (cK[ci] >= 0) idx[f++] = ci;
  const flora = new Float32Array((keep + fixedCount) * 8);   // x y z, nx ny nz, scale, kind
  for (let i = 0; i < keep; i++) {
    const ci = idx[Math.floor(i * stride)], o = i * 8;
    flora[o] = cX[ci]; flora[o + 1] = cY[ci]; flora[o + 2] = cZ[ci];
    flora[o + 3] = nX[ci]; flora[o + 4] = nY[ci]; flora[o + 5] = nZ[ci];
    flora[o + 6] = cS[ci]; flora[o + 7] = cK[ci];
  }
  flora.set(fixed, keep * 8);

  return { flora, marks: markCount, fixed: fixedCount,
    big: bigAt.length / 2, mega: megaAt.length / 2 };
}

// ---------------------------------------------------------------- the lore of the plants
// The temperature at the site, in degrees Celsius. The stats card states the mean of the planet,
// and a patch is not the mean: `siteT` is the temperature field of fieldFrom(), which falls with
// the latitude and with the height of the ground. A flora story that read the mean put a 58 °C
// line under a snow field, so the flora lore reads the site instead.
//
// T_REF is the mean of that field over a sphere: the latitude term averages 0.42, and the height
// term is small enough to drop. T_SPAN turns one unit of the field into degrees; it is set so the
// equator of an Earth-like world stands about 25 °C over its poles.
//
// The biome then caps it. biomeIndex() paints snow above the snow line whatever the temperature
// field says, so a very high site on a hot world comes back as a snow field at 34 °C. Ice on the
// ground is the stronger fact, so a snow site is at or below freezing and a tundra site is cool.
// T_SPAN turns one unit of the temperature field into degrees. The mean of the field over the
// globe used to be a constant, because the latitude term was the same on every world. Since issue
// 33 the term follows the axis, so the mean comes from the world: ctx.climateMean.
const T_SPAN = 55;
const BIOME_TEMP_CAP = { snow: 0, tundra: 8 };
function siteTempC(ctx, siteT, biome) {
  const mean = ctx.world.env.tempC;
  if (mean == null) return mean;
  const t = Math.round(mean + (siteT - (ctx.climateMean + ctx.tempBias)) * T_SPAN);
  const capC = BIOME_TEMP_CAP[biome];
  return capC == null ? t : Math.min(t, capC);
}

// The fauna lore is written once per world, because an animal belongs to a planet. The flora lore
// is written once per patch, because a plant belongs to the ground it stands on: the patch decides
// which kinds grow here, how many of each, and how tall they stand, and the biome under them is a
// fact of the site. flora-lore.js holds the words; this function only counts what the patch placed
// and hands the numbers over. See docs/flora.md.
//
// It draws from a stream of its own, so a change to the text can never move a plant.
function describePatchFlora(ctx, flora, biome, siteT, pseed) {
  if (!flora || !flora.length) return [];
  const stats = new Map();
  for (let i = 0; i < flora.length; i += 8) {
    const k = flora[i + 7];
    let s = stats.get(k);
    if (!s) { s = []; stats.set(k, s); }
    s.push(flora[i + 6]);
  }
  const kinds = [];
  for (const [kind, sizes] of stats) {
    sizes.sort((a, b) => a - b);
    kinds.push({
      kind, count: sizes.length,
      median: sizes[sizes.length >> 1],
      tallest: sizes[sizes.length - 1],
    });
  }
  const facts = { ...(ctx.world.env || { type: ctx.type }), tempC: siteTempC(ctx, siteT, biome) };
  return FloraLore.describePatch({
    world: ctx.world, env: Lore.makeEnv(facts),
    biome, kinds, rng: makeRng(pseed + '|flora-lore'),
  });
}

// ---------------------------------------------------------------- the fauna of a patch
// The globe scatters single animals over a whole world. The ground shows a few animals close up,
// so it places them as groups: one anchor per group, and the members of the group around it. The
// sociality gene gives the count and the formation radius. See docs/fauna.md, "Ground tier".
const GROUP_REACH = 600;      // metres: an anchor starts this close to the site, inside the fog rim
const GROUPS_MIN = 10, GROUPS_MAX = 30;   // groups per patch
const NICHE_REACH = 300;      // metres: a niche this close to the site puts its species on the patch
const NICHE_STEP = 30;        // metres between the samples of the niche test
const ANCHOR_TRIES = 48;      // how many places one group tries before it gives up

// The niches the patch holds at the site and within NICHE_REACH metres of it. The tests are the
// ones makeFauna() runs on the globe, so a species that lives on this ground from orbit also lives
// on this patch. Temperature and moisture come from the same rules the colour pass uses.
function patchNiches(ctx, g) {
  const out = new Set();
  const step = Math.max(1, Math.round(NICHE_STEP / g.grid));
  const beachW = ctx.beachW;
  for (let j = 0; j < g.n; j += step) {
    const zm = -g.half + j * g.grid;
    if (Math.abs(zm) > NICHE_REACH) continue;
    for (let i = 0; i < g.n; i += step) {
      const xm = -g.half + i * g.grid;
      if (xm * xm + zm * zm > NICHE_REACH * NICHE_REACH) continue;
      const k = j * g.n + i, hm = g.heights[k], h = hm * g.hPerU;
      const t = g.cellT[k];
      const f = g.cellF[k];
      const m = g.cellM[k] - g.vary[k] * 0.1 + Math.max(f, 0) * 0.06;
      const beach = h > 0 && h < beachW;
      const lowland = h > beachW && h < 0.3;
      if (beach && t > 0.1) out.add('beach');
      if (lowland && m > -0.2 && m < 0.22 && f < 0.1 && t > 0.35) out.add('meadow');
      if (lowland && m > 0.22 && f > 0.05) out.add('forest');
      if (lowland && t > 0.15) out.add('lowland');
      if (h > beachW && h < 0.6) out.add('dune');
      if (h > beachW && h < 0.35 && t > -0.05) out.add('snow');
      if (h > 0.15 && h < 0.6) out.add('ash');
      if (h < -0.08) out.add('sea');
    }
  }
  return out;
}

// The groups of one patch.
//   groups:  x z, kind, count, spread, phase        (6 floats per group)
//   members: group index, offset x, offset z, phase (4 floats per member)
// A member offset is the place of the animal in the formation, in metres from the anchor.
function patchFauna(ctx, maxFauna = 0, pulled, g) {
  const empty = { groups: new Float32Array(0), members: new Float32Array(0) };
  const species = ctx.world.species || [];
  if (!species.length || !(maxFauna > 0)) return empty;

  // Which species live here. The site was pulled to one species, so that one is always present.
  // A sea species and a cloud flyer wait for issue 15; this patch has no water and no cloud deck
  // to put them in.
  const niches = patchNiches(ctx, g);
  const present = [];
  for (const G of species) {
    if (G.niche === 'sea' || G.niche === 'cloud') continue;
    if (G.id === pulled) present.unshift(G);           // the pulled species leads, so it gets a group
    else if (niches.has(G.niche)) present.push(G);
  }
  if (!present.length) return empty;

  const rng = makeRng(`${g.pseed}|fauna`);
  const hAt = (x, z) => {
    const i = clamp(Math.round((x + g.half) / g.grid), 0, g.n - 1);
    const j = clamp(Math.round((z + g.half) / g.grid), 0, g.n - 1);
    return g.heights[j * g.n + i];
  };

  const target = Math.round(rrange(rng, GROUPS_MIN, GROUPS_MAX));
  const anchors = [], rows = [];
  let total = 0;
  for (let k = 0; k < target; k++) {
    const G = present[k % present.length];
    const s = G.social || { n: 1, spread: 4 };
    const count = s.n;
    if (total + count > maxFauna) break;
    const spread = Math.max(3, s.spread);
    const reach = Math.max(60, Math.min(GROUP_REACH, g.half - spread - 40));
    let x = 0, z = 0, placed = false;
    for (let a = 0; a < ANCHOR_TRIES; a++) {
      const ang = rng() * Math.PI * 2, r = Math.sqrt(rng()) * reach;
      x = Math.cos(ang) * r; z = Math.sin(ang) * r;
      if (G.cls !== 'air' && hAt(x, z) <= 0) continue;   // a walker and a burrower stand on land
      if (g.blocked && g.blocked(x, z)) continue;        // and none of them stands in the crater
      let clear = true;
      for (const p of anchors) {
        const need = Math.max(spread, p.spread) * 2;     // groups sit at least spread * 2 apart
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < need * need) { clear = false; break; }
      }
      if (clear) { placed = true; break; }
    }
    if (!placed) continue;
    anchors.push({ x, z, kind: G.id, count, spread, phase: rng() * Math.PI * 2 });
    // the formation: a jittered ring, so the members share the space and do not stand on one another
    const gi = anchors.length - 1, turn = rng();
    for (let i = 0; i < count; i++) {
      const ang = ((i + turn) / count + rrange(rng, -0.14, 0.14)) * Math.PI * 2;
      const r = count === 1 ? 0 : spread * rrange(rng, 0.45, 1);
      rows.push([gi, Math.cos(ang) * r, Math.sin(ang) * r, rng() * Math.PI * 2]);
    }
    total += count;
  }
  if (!anchors.length) return empty;

  const groups = new Float32Array(anchors.length * 6);
  anchors.forEach((a, i) => {
    groups.set([a.x, a.z, a.kind, a.count, a.spread, a.phase], i * 6);
  });
  const members = new Float32Array(rows.length * 4);
  rows.forEach((r, i) => members.set(r, i * 4));
  return { groups, members };
}

// ---------------------------------------------------------------- the phenomenon of a patch
// A world holds at most one phenomenon. When the landing cell is the cell that holds it, the patch
// raises the shape at the origin, paints it, and keeps the plants and the animals off it.
// ground-phenomena.js draws the moving parts. The patch path never runs makeActivity: that function
// works on the globe mesh, and the patch has no globe mesh. Issue 14.

// The kind of a thing of the world that stands in a cell, or null. The phenomenon and the source
// each keep a direction, and the cell of that direction is the one cell that holds the thing. So
// one thing never stands in two patches, and a landing that reaches the cell without the pull
// shows it too.
function kindIn(thing, cell) {
  const d = thing && thing.dir;
  return d && sameCell(dirCell(d[0], d[1], d[2]), cell) ? thing.kind : null;
}
//
// The ground shows a set piece and not the true scale. A cone at true scale is tens of kilometres
// wide, so one flank would fill the whole cell and the reader would never see a volcano. The cone
// therefore keeps a size the reader can walk to and see whole, the way a creature keeps its
// readable size. See "Scale facts" in docs/issues/README.md.
const CONE_R = 250;          // units, the foot of the cone
const CONE_PEAK = 110;       // units, the peak over the ground at the site
const CRATER_R = 50;         // units, the crater at the top
const CRATER_DROP = 1 / 3;   // the part of the peak the crater floor drops
const POOL_R = 10;           // units, the pool of the geyser
const RING_R = 35;           // units, the mineral ring around the pool
const MOUND_H = 2.5;         // units, the sinter mound the ring stands on
const POOL_DROP = 1.2;       // units, how far the pool sits under the rim of the mound

// The shape and the paint of the phenomenon at the origin of the patch. It rewrites the heights in
// place and gives back the paint pass, the mask the plants read, and the numbers the main thread
// needs. A kind the ground cannot draw yet gives null, and the patch then builds as before. The
// pull to life in site.js keeps the same two kinds in GROUND_ACTIVITY.
function patchActivity(ctx, kind, s) {
  if (kind !== 'volcano' && kind !== 'geyser') return null;
  const { heights, n, grid, half } = s;
  const P = ctx.P, type = ctx.type;
  const reach = kind === 'volcano' ? CONE_R : RING_R;
  // the ground at the site, before the shape. The cone and the mound stand on it, so the flank
  // does not carry the knolls of the patch up with it.
  const ci = clamp(Math.round(half / grid), 0, n - 1);
  const hs = heights[ci * n + ci];
  const i0 = Math.max(0, Math.floor((half - reach) / grid));
  const i1 = Math.min(n - 1, Math.ceil((half + reach) / grid));
  const craterD = CRATER_R / CONE_R, poolD = POOL_R / RING_R;
  for (let j = i0; j <= i1; j++) {
    const zm = -half + j * grid;
    for (let i = i0; i <= i1; i++) {
      const xm = -half + i * grid;
      const d = Math.hypot(xm, zm) / reach;
      if (d >= 1) continue;
      const k = j * n + i, h = heights[k];
      const w = smoothstep(1, 0.5, d);     // the shape owns the middle and lets the patch back in
      if (kind === 'volcano') {
        const cone = CONE_PEAK * Math.pow(1 - d, 1.3);
        const crater = smoothstep(craterD, craterD * 0.3, d) * CONE_PEAK * CRATER_DROP;
        heights[k] = h + cone * (1 - w) + (hs + cone - crater - h) * w;
      } else {
        const mound = MOUND_H * smoothstep(1, 0.3, d);
        const bowl = POOL_DROP * smoothstep(poolD * 1.3, poolD * 0.4, d);
        heights[k] = h + (hs + mound - bowl - h) * w;
      }
    }
  }

  // The colours of the globe, at the scale of the ground. The rock of the cone darkens toward the
  // vent, and the vent itself glows. The ring of the geyser takes the mineral colour and the pool
  // takes the water colour, or the glow colour on an exotic world.
  const dark = scale(P.rock2 || P.rock || P.deep, 0.45);
  const vent = type === 'ice' ? mix(P.shallow, [1, 1, 1], 0.3) : [1.0, 0.42, 0.08];
  const mineral = type === 'ice' ? mix(P.shallow, [1, 1, 1], 0.4)
    : type === 'exotic' ? mix(P.beach, P.faunaColor.glow, 0.5) : mix(P.beach, [0.95, 0.9, 0.8], 0.5);
  const pool = type === 'exotic' ? P.faunaColor.glow : P.shallow;
  const paint = (xm, zm, out, o) => {
    const d = Math.hypot(xm, zm) / reach;
    if (d >= 1) return;
    let c;
    if (kind === 'volcano') {
      c = mix(dark, [out[o], out[o + 1], out[o + 2]], smoothstep(0.25, 1.0, d));
      if (d < 0.16) c = mix(vent, c, smoothstep(0.09, 0.16, d));
    } else {
      c = mix(mineral, [out[o], out[o + 1], out[o + 2]], smoothstep(0.5, 1.0, d));
      if (d < 0.35) c = mix(pool, c, smoothstep(0.2, 0.35, d));
    }
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
  };

  const info = kind === 'volcano'
    ? { kind, radius: CONE_R, peak: CONE_PEAK, crater: CRATER_R }
    : { kind, radius: RING_R, pool: POOL_R };
  return {
    info, paint, i0, i1,
    blocked: (x, z) => x * x + z * z < reach * reach,
  };
}

// ---------------------------------------------------------------- the source of a patch, issue 34
// A world holds at most one source. When the landing cell is the cell that holds it (see kindIn()),
// the patch picks a place for the wreck, flattens a disc under it, scorches the ground, and keeps
// the plants and the animals off that disc, the way patchActivity() does for the phenomenon.
// ground-source.js draws the wreck itself.
//
// The wreck does not stand at the origin, and the phenomenon does. A volcano is the reason the
// reader picked the cell, so it stands where the probe lands; a wreck is a thing to find on the
// cell, so it stands off the site and the reader walks to it on the needle of the carrier.
//
// The reach here is the walk limit of the ground and not FOG_NEAR: the reader has to reach the
// wreck on foot, and the walk stops at half the box less the band the plants thin out over. That is
// the rule reachOf() holds in ground.js, so the two cannot drift apart. The place is drawn inside
// SOURCE_PLACE of it, which leaves the last part of the walk for the search.
//
// The wreck rolls from makeRng(pseed + '|source') and from no other stream, so a patch outside the
// cell of the source is byte for byte the patch it was before issue 34.
const SOURCE_DISC = 14;        // units, the radius of the disc the wreck flattens
const SOURCE_SOFT = 0.55;      // the part of the disc that is flat; the rest carries the soft edge
const SOURCE_PLACE = 0.6;      // the part of the reach the place is drawn inside
const SOURCE_STAND = 0.35;     // the steepest ground the wreck stands on, in units up per unit across
const SOURCE_RIM = 8;          // the points of the rim of the disc the walk tests, after the middle

// The slope at one node of the patch, in units up over units across. It is the measure the colour
// pass reads for its bare rock, so the wreck stands on ground the reader sees as flat.
function patchSlope(heights, n, grid, i, j) {
  const i1 = i > 0 ? i - 1 : i, i2 = i < n - 1 ? i + 1 : i;
  const j1 = j > 0 ? j - 1 : j, j2 = j < n - 1 ? j + 1 : j;
  const dhx = (heights[j * n + i2] - heights[j * n + i1]) / ((i2 - i1) * grid);
  const dhz = (heights[j2 * n + i] - heights[j1 * n + i]) / ((j2 - j1) * grid);
  return Math.hypot(dhx, dhz);
}

// The place and the paint of the wreck. It rewrites the heights in place and gives back the paint
// pass, the mask the plants read, the window of the grid the paint covers, and the numbers the main
// thread needs. A kind the ground cannot draw yet gives null, and the patch then builds as before.
function patchSource(ctx, kind, s) {
  if (kind !== 'wreck') return null;
  const { heights, n, grid, half, pseed, avoid } = s;
  const P = ctx.P;
  const rng = makeRng(`${pseed}|source`);
  const reach = Math.max(grid * 4, half - FLORA_EDGE);
  const ang = rng() * Math.PI * 2;
  const rad = Math.sqrt(rng()) * reach * SOURCE_PLACE;
  const yaw = rng() * Math.PI * 2;
  const toI = (m) => clamp(Math.round((m + half) / grid), 0, n - 1);
  const toM = (i) => -half + i * grid;

  // The walk: the nearest node to the draw that is dry, flat enough, and clear of the phenomenon
  // when the cell holds one. The test runs on the rim of the disc as well as at the middle, because
  // a middle that stands a metre over the water still gives a disc that reaches the sea.
  const ok = (i, j) => {
    const x = toM(i), z = toM(j);
    if (Math.hypot(x, z) > reach) return false;
    if (patchSlope(heights, n, grid, i, j) >= SOURCE_STAND) return false;
    if (heights[j * n + i] <= 0) return false;
    for (let k = 0; k < SOURCE_RIM; k++) {
      const t = k * Math.PI * 2 / SOURCE_RIM;
      const px = x + Math.cos(t) * SOURCE_DISC, pz = z + Math.sin(t) * SOURCE_DISC;
      if (heights[toI(pz) * n + toI(px)] <= 0) return false;
      if (avoid && avoid(px, pz)) return false;
    }
    return !(avoid && avoid(x, z));
  };

  let bi = -1, bj = -1;
  const take = (i, j) => {
    if (bi >= 0 || i < 0 || j < 0 || i >= n || j >= n || !ok(i, j)) return false;
    bi = i; bj = j;
    return true;
  };
  const si = toI(Math.cos(ang) * rad), sj = toI(Math.sin(ang) * rad);
  take(si, sj);
  const maxD = Math.ceil(reach / grid);
  // The search runs out in rings, so the first node it takes is the nearest one that passes.
  for (let d = 1; bi < 0 && d <= maxD; d++) {
    for (let t = -d; t <= d; t++) {
      if (take(si + t, sj - d) || take(si + t, sj + d) || take(si - d, sj + t) || take(si + d, sj + t)) break;
    }
  }
  if (bi < 0) {
    // No node passed. The cell is all water, or every dry part of it is a cliff. The wreck still
    // stands, because a landing on the cell of the source must always show the source: it takes the
    // driest and flattest node inside the reach, and the disc may then reach the water at its rim.
    let best = -Infinity;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = toM(i), z = toM(j);
        if (Math.hypot(x, z) > reach) continue;
        const v = heights[j * n + i] - patchSlope(heights, n, grid, i, j) * SOURCE_DISC;
        if (v > best) { best = v; bi = i; bj = j; }
      }
    }
    if (bi < 0) { bi = toI(0); bj = toI(0); }
  }

  // The disc. The middle takes the height of the node the walk found, and the rim eases back into
  // the ground the patch raised, so the wreck stands on a flat floor with no step around it.
  const sx = toM(bi), sz = toM(bj);
  const hs = heights[bj * n + bi];
  const i0 = Math.max(0, Math.floor((sx + half - SOURCE_DISC) / grid));
  const i1 = Math.min(n - 1, Math.ceil((sx + half + SOURCE_DISC) / grid));
  const j0 = Math.max(0, Math.floor((sz + half - SOURCE_DISC) / grid));
  const j1 = Math.min(n - 1, Math.ceil((sz + half + SOURCE_DISC) / grid));
  for (let j = j0; j <= j1; j++) {
    const zm = -half + j * grid;
    for (let i = i0; i <= i1; i++) {
      const xm = -half + i * grid;
      const d = Math.hypot(xm - sx, zm - sz) / SOURCE_DISC;
      if (d >= 1) continue;
      const k = j * n + i;
      heights[k] += (hs - heights[k]) * smoothstep(1, SOURCE_SOFT, d);
    }
  }

  // The scorch. The ground under the wreck reads as burnt, so the disc darkens toward the dark end
  // of the palette and lets the biome back in over the last part of its radius.
  const scorch = scale(P.rock2 || P.rock || P.deep, 0.4);
  const paint = (xm, zm, out, o) => {
    const d = Math.hypot(xm - sx, zm - sz) / SOURCE_DISC;
    if (d >= 1) return;
    const c = mix(scorch, [out[o], out[o + 1], out[o + 2]], smoothstep(0.3, 1.0, d));
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
  };

  return {
    info: { kind, x: sx, y: hs, z: sz, yaw },
    paint, i0, i1, j0, j1,
    blocked: (x, z) => (x - sx) * (x - sx) + (z - sz) * (z - sz) < SOURCE_DISC * SOURCE_DISC,
  };
}

// The ground of one landing: a square height grid and a colour per vertex, in the frame of the box
// of the cell, with the origin at the middle of the cell at sea level.
//
// The patch belongs to the cell and not to the site. The call takes the cell the site falls in and
// builds that whole cell from its middle, so every site of one cell gives the same patch. It reads
// the rest from the world of its own context: the width of the cell, and whether the cell holds the
// phenomenon or the source of the world. site.kind is the species the pull took the site to, or -1.
function patch(seed, site, opts = {}, post = () => {}) {
  if (!opts.world) throw new Error('patch: opts.world is required; pass the options of the world call');
  post(4, 'Reading the site');
  const ctx = contextFor(seed, opts.world);
  if (ctx.type === 'gas') throw new Error('a gas giant has no ground');
  const P = ctx.P;
  const cell = siteCell(site.lat, site.lon);
  const { lat, lon } = cellSite(cell);
  const pulled = site.kind ?? -1;

  const size = opts.size || 1500;
  const grid = opts.grid || 2;
  const n = Math.round(size / grid) + 1;
  const half = size / 2;
  const radiusM = ctx.radiusKm * 1000;
  const M_PER_H = ctx.amp * radiusM / EXAGGERATION;   // globe elevation units to metres
  const H_PER_M = 1 / M_PER_H;
  // span: the metres of the globe across the middle of the cell. K: metres of the globe across one
  // unit of the ground box. The whole cell lands in the box, so K is the width of the cell over the
  // width of the box.
  const span = cellArc(cell) * ctx.radiusKm * 1000;
  const K = span / size;
  // The metres of the globe across one unit of the box that the detail field works in. It is the
  // nominal cell of the world and not the true width of this cell: a cube cell is a little wider
  // in the middle of a face than at a corner, and a frequency that followed that width would put
  // the fine waves of two neighbours out of phase and no stream could join them.
  const detailK = (Math.PI / 2 / cell.n * radiusM) / size;

  // The direction on the globe under a point of the box, in units of the box from the middle. The
  // box lands exactly on the quad of the cube grid, so the patch next door reads the same direction
  // along the edge the two share.
  const _d = [0, 0, 0];
  // The two gnomonic coordinates of a point of the box, one per axis. A loop that walks a row
  // takes the second one once for the whole row. See boxTanX().
  const tanX = (xu) => boxTanX(cell, xu, size);
  const tanZ = (zu) => boxTanZ(cell, zu, size);
  const dirOn = (xu, zu) => cellDirT(cell, tanX(xu), tanZ(zu), _d);

  const fld = { h: 0, t: 0, m: 0, fm: 0, r: 0, rg: 0 };
  // The globe field at a point of the patch, in units of the box from the site.
  const fieldOn = (xu, zu) => {
    const d = dirOn(xu, zu);
    return fieldAt(ctx, d[0], d[1], d[2], fld);
  };

  fieldOn(0, 0);
  const siteH = fld.h, siteT = fld.t, siteM = fld.m;
  const elevation = siteH * M_PER_H;

  // The globe field across the patch. The patch used to take one linear tilt, because over
  // 1,500 m the globe field is a plane. A cell is tens of kilometres wide, so the field bends
  // inside it and a coast can cross it. The field is read on a coarse grid and interpolated:
  // FIELD_N squared reads cost about 1% of the reads the globe itself makes.
  const FN = FIELD_N, FN1 = FN - 1;
  const fH = new Float32Array(FN * FN);    // globe elevation in metres
  const fT = new Float32Array(FN * FN);
  const fM = new Float32Array(FN * FN);
  const fF = new Float32Array(FN * FN);
  const fR = new Float32Array(FN * FN);    // the mountain term, which drives the ruggedness
  let reliefLo = Infinity, reliefHi = -Infinity;
  for (let b = 0; b < FN; b++) {
    const zc = -half + b * (size / FN1);
    for (let a = 0; a < FN; a++) {
      fieldOn(-half + a * (size / FN1), zc);
      const q = b * FN + a, hm = fld.h * M_PER_H;
      fH[q] = hm; fT[q] = fld.t; fM[q] = fld.m; fF[q] = fld.fm; fR[q] = fld.rg;
      if (hm < reliefLo) reliefLo = hm;
      if (hm > reliefHi) reliefHi = hm;
    }
    if ((b & 7) === 0) post(8 + (b / FN) * 10, 'Reading the site');
  }

  // V: metres of the globe up one unit of the ground box. One number for the whole world, so the
  // cell the reader picks decides how tall the patch reads and the patch next door agrees with it
  // along the edge the two share. The highest land of the world stands WORLD_RELIEF units up.
  const reliefM = Math.max(0, reliefHi - reliefLo);
  const hRef = worldReliefH(ctx);
  const V = Math.max(1, hRef * M_PER_H / WORLD_RELIEF);
  const hPerU = H_PER_M * V;       // one unit of the ground box in globe elevation units
  const detail = detailFor(ctx, detailK);

  // The globe field at a point of the ground box, bilinear over the coarse grid.
  const fInv = FN1 / size;
  const gf = { h: 0, t: 0, m: 0, fm: 0, rg: 0 };
  const fieldUnit = (xm, zm) => {
    const u = clamp((xm + half) * fInv, 0, FN1 - 1e-4), w = clamp((zm + half) * fInv, 0, FN1 - 1e-4);
    const a = u | 0, b = w | 0, du = u - a, dw = w - b;
    const q = b * FN + a, q2 = q + FN;
    const w00 = (1 - du) * (1 - dw), w10 = du * (1 - dw), w01 = (1 - du) * dw, w11 = du * dw;
    gf.h = (fH[q] * w00 + fH[q + 1] * w10 + fH[q2] * w01 + fH[q2 + 1] * w11) / V;
    gf.t = fT[q] * w00 + fT[q + 1] * w10 + fT[q2] * w01 + fT[q2 + 1] * w11;
    gf.m = fM[q] * w00 + fM[q + 1] * w10 + fM[q2] * w01 + fM[q2 + 1] * w11;
    gf.fm = fF[q] * w00 + fF[q + 1] * w10 + fF[q2] * w01 + fF[q2 + 1] * w11;
    gf.rg = fR[q] * w00 + fR[q + 1] * w10 + fR[q2] * w01 + fR[q2 + 1] * w11;
    return gf;
  };

  // The frame of the rim. The patch reads it too, because it fades its own fine noise out over
  // the last EDGE_CELLS rim cells: the rim cannot carry the knolls and the rock, so a patch that
  // held them to its last row would end on a line the reader can see from the ceiling.
  const rimReach = opts.rim > 0 ? opts.rim : RIM_REACH;
  let rimCell = RIM_CELL;
  while (rimCell > 1 && (size / (grid * rimCell)) % 1 !== 0) rimCell--;
  const rimStep = grid * rimCell;
  const rimCols = size / rimStep;                  // rim cells across the patch
  const rimD = Math.max(1, Math.ceil((rimReach - half) / rimStep));
  const rimOut = half + rimD * rimStep;
  const rimN = 2 * rimD + rimCols + 1;
  const edgeFade = EDGE_CELLS * rimStep;

  const pseed = `${seed}|patch|${lat.toFixed(2)}|${lon.toFixed(2)}`;
  const prng = makeRng(pseed);
  const pnoise = new Noise(makeRng(pseed));

  post(20, 'Raising the ground');
  const heights = new Float32Array(n * n);
  const vary = new Float32Array(n * n);
  const cellT = new Float32Array(n * n);    // the globe temperature and moisture bend across a
  const cellM = new Float32Array(n * n);    // cell too, so the colour and the plants read them
  const cellF = new Float32Array(n * n);    // per cell and not once at the site
  let hasSea = false, hasLand = false;
  // Far from the sea the damping is 1 everywhere, so the whole patch skips the test.
  const inland = Math.min(Math.abs(reliefLo), Math.abs(reliefHi)) / V > SHORE_DAMP
    && (reliefLo > 0 || reliefHi < 0);
  // the gnomonic coordinate of every column, so a row takes one tangent and not n of them
  const colTan = new Float64Array(n);
  for (let i = 0; i < n; i++) colTan[i] = tanX(-half + i * grid);
  for (let j = 0; j < n; j++) {
    const zm = -half + j * grid;
    const ez = half - Math.abs(zm);
    const rowTan = tanZ(zm);
    for (let i = 0; i < n; i++) {
      const xm = -half + i * grid;
      const f = fieldUnit(xm, zm);
      const base = f.h;
      // The short octaves fade out over the last cells of the rim, where the rim takes the ground
      // over. A rim cell cannot carry them, and a patch that held them to its last row would draw
      // a line the reader sees from the ceiling.
      const e = Math.min(ez, half - Math.abs(xm));
      const fade = e >= edgeFade ? 1 : smoothstep(0, edgeFade, e);
      const d = cellDirT(cell, colTan[i], rowTan, _d);
      const rug = ruggedAt(f.rg, f.h * hPerU, hRef);
      const det = detailAt(ctx, detail, d[0], d[1], d[2], rug, fade);
      // The globe flattens its fine relief at the coast. The patch does the same, so the shore
      // of issue 05 meets the water on a gentle slope and not on a field of specks.
      const damp = inland ? 1 : smoothstep(0, SHORE_DAMP, Math.abs(base));
      const h = base + det * (0.25 + 0.75 * damp);
      const k = j * n + i;
      heights[k] = h;
      // the relief also varies the moisture: a hollow is wetter than a crest
      vary[k] = clamp(det / DETAIL_AMP, -1, 1);
      // the globe lapse rate: cellT holds the temperature the patch height earns, not the
      // temperature of the globe surface the field read
      cellT[k] = f.t + (Math.max(base, 0) - Math.max(h, 0)) * hPerU * 0.55;
      cellM[k] = f.m; cellF[k] = f.fm;
      if (h < 0) hasSea = true; else hasLand = true;
    }
    if ((j & 31) === 0) post(20 + (j / n) * 45, 'Raising the ground');
  }

  // The phenomenon stands at the origin, after the field and the noise and before the colours, so
  // the slope of the cone earns its rock and the paint of the vent goes over it. Issue 14.
  const actKind = kindIn(ctx.world.activity, cell);
  const act = actKind ? patchActivity(ctx, actKind, { heights, n, grid, half }) : null;

  // The source of the world, when this cell is the cell that holds it. It runs after the
  // phenomenon, so the wreck can stand clear of a cone the same cell might hold. By the 4-cell rule
  // of makeSource() the two never meet, and the guard costs nothing on the cells where they do not.
  // Issue 34, slice 3.
  const srcKind = kindIn(ctx.world.source, cell);
  const src = srcKind
    ? patchSource(ctx, srcKind, {
      heights, n, grid, half, pseed, avoid: act ? act.blocked : null,
    }) : null;
  // The plants and the group anchors keep off both footprints.
  const blockAct = act ? act.blocked : null, blockSrc = src ? src.blocked : null;
  const blocked = blockAct && blockSrc
    ? (x, z) => blockAct(x, z) || blockSrc(x, z) : (blockAct || blockSrc);

  post(66, 'Painting the ground');
  const colors = new Float32Array(n * n * 3);
  // The surface of every node, for the fine pattern of ground-detail.js. The low four bits hold the
  // biome plus one, so 0 stays free for a node that carries no surface, and the high four bits hold
  // the share of bare rock the slope gives it, in fifteenths. See packSurface().
  const surface = new Uint8Array(n * n);
  const tint = [0, 0, 0];
  const invZ = 1 / (2 * grid);
  const beachH = BEACH_M * H_PER_M;   // the sand strip, in the elevation units biomeIndex reads
  for (let j = 0; j < n; j++) {
    const jn = j * n;
    const j1 = j > 0 ? jn - n : jn, j2 = j < n - 1 ? jn + n : jn;
    const iz = j > 0 && j < n - 1 ? invZ : 1 / grid;
    for (let i = 0; i < n; i++) {
      const k = jn + i;
      const h = heights[k], hg = h * hPerU;
      const i1 = i > 0 ? i - 1 : i, i2 = i < n - 1 ? i + 1 : i;
      const ix = i > 0 && i < n - 1 ? invZ : 1 / grid;
      const dhx = (heights[jn + i2] - heights[jn + i1]) * ix;
      const dhz = (heights[j2 + i] - heights[j1 + i]) * iz;
      // the lapse rate is already in cellT, so a hilltop inside the patch can hold snow the
      // valley cannot
      const t = cellT[k];
      // the forest mask lifts the moisture a little, so a cell inside a forest cluster reads green
      const m = cellM[k] - vary[k] * 0.1 + Math.max(cellF[k], 0) * 0.06;
      const bi = biomeIndex(ctx, hg, t, m, beachH);
      biomeTint(ctx, bi, hg, k, tint);
      // Under the water line the bed darkens from the shallow tint to the deep tint over DEEP_M
      // metres, so shallow water reads through the translucent sea plane of ground-sea.js.
      if (h < 0) {
        const dp = smoothstep(0, DEEP_M, -h);
        tint[0] = lerp(P.shallow[0], P.deep[0], dp);
        tint[1] = lerp(P.shallow[1], P.deep[1], dp);
        tint[2] = lerp(P.shallow[2], P.deep[2], dp);
      }
      // bare rock reads on a dry slope. Under the water the depth carries the colour instead.
      const rk = P.rock && h > 0 ? smoothstep(SLOPE_ROCK[0], SLOPE_ROCK[1], Math.sqrt(dhx * dhx + dhz * dhz)) : 0;
      surface[k] = packSurface(bi, rk);
      const o = k * 3;
      if (rk > 0) {
        colors[o] = lerp(tint[0], P.rock[0], rk);
        colors[o + 1] = lerp(tint[1], P.rock[1], rk);
        colors[o + 2] = lerp(tint[2], P.rock[2], rk);
      } else {
        colors[o] = tint[0]; colors[o + 1] = tint[1]; colors[o + 2] = tint[2];
      }
    }
    if ((j & 31) === 0) post(66 + (j / n) * 30, 'Painting the ground');
  }

  // The phenomenon paints over the biome, on its own window of the grid. It runs as a second pass
  // and not as a test inside the loop above, because the window covers a small part of the patch
  // and the loop above runs over every vertex of it.
  if (act) {
    for (let j = act.i0; j <= act.i1; j++) {
      const zm = -half + j * grid, jn = j * n;
      for (let i = act.i0; i <= act.i1; i++) act.paint(-half + i * grid, zm, colors, (jn + i) * 3);
    }
  }
  // The scorch of the wreck, on its own window of the grid, for the same reason. Issue 34.
  if (src) {
    for (let j = src.j0; j <= src.j1; j++) {
      const zm = -half + j * grid, jn = j * n;
      for (let i = src.i0; i <= src.i1; i++) src.paint(-half + i * grid, zm, colors, (jn + i) * 3);
    }
  }

  // ---------------------------------------------------------------- the rim, issue 18
  // The rim carries the ground from the edge of the patch out past the fog. It reads the same
  // globe field and the same hill noise the patch reads, so the relief and the coast run on
  // across the join instead of stopping at a square edge.
  //
  // The rim cell is a whole number of patch steps and it divides the box, so the edge of the
  // patch lands on a rim grid line and every rim node there sits on a patch vertex. The rim leaves
  // out the knolls and the rock of the patch, because both are shorter than one rim cell and a
  // coarse grid would only sample them as noise. It keeps the hills, which run over several cells.
  //
  // The rim covers about 18 times the area of the cell, so it reads the globe field on its own
  // grid: one sample per RIM_FIELD_CELLS rim cells. A grid at the density of the patch would cost
  // more than the whole build.
  post(93, 'Widening the view');
  const RN = Math.max(17, Math.min(RIM_FIELD_MAX, Math.round(rimN / RIM_FIELD_CELLS))), RN1 = RN - 1;
  const rHf = new Float32Array(RN * RN);   // globe elevation in metres
  const rTf = new Float32Array(RN * RN);
  const rMf = new Float32Array(RN * RN);
  const rFf = new Float32Array(RN * RN);
  const rRf = new Float32Array(RN * RN);
  const rimFieldStep = 2 * rimOut / RN1;
  for (let b = 0; b < RN; b++) {
    const zc = -rimOut + b * rimFieldStep;
    for (let a = 0; a < RN; a++) {
      fieldOn(-rimOut + a * rimFieldStep, zc);
      const q = b * RN + a;
      rHf[q] = fld.h * M_PER_H; rTf[q] = fld.t; rMf[q] = fld.m; rFf[q] = fld.fm; rRf[q] = fld.rg;
    }
  }

  // The globe field at a point of the rim, bilinear over the coarse grid. It divides by the same
  // V the patch uses, so the rim meets the patch at the join instead of standing over or under it.
  const rInv = RN1 / (2 * rimOut);
  const rf = { h: 0, t: 0, m: 0, fm: 0, rg: 0 };
  const rimFieldAt = (xm, zm) => {
    const u = clamp((xm + rimOut) * rInv, 0, RN1 - 1e-4), w = clamp((zm + rimOut) * rInv, 0, RN1 - 1e-4);
    const a = u | 0, b = w | 0, du = u - a, dw = w - b;
    const q = b * RN + a, q2 = q + RN;
    const w00 = (1 - du) * (1 - dw), w10 = du * (1 - dw), w01 = (1 - du) * dw, w11 = du * dw;
    rf.h = (rHf[q] * w00 + rHf[q + 1] * w10 + rHf[q2] * w01 + rHf[q2 + 1] * w11) / V;
    rf.t = rTf[q] * w00 + rTf[q + 1] * w10 + rTf[q2] * w01 + rTf[q2 + 1] * w11;
    rf.m = rMf[q] * w00 + rMf[q + 1] * w10 + rMf[q2] * w01 + rMf[q2 + 1] * w11;
    rf.fm = rFf[q] * w00 + rFf[q + 1] * w10 + rFf[q2] * w01 + rFf[q2 + 1] * w11;
    rf.rg = rRf[q] * w00 + rRf[q + 1] * w10 + rRf[q2] * w01 + rRf[q2 + 1] * w11;
    return rf;
  };

  const rimHeights = new Float32Array(rimN * rimN);
  const rimVary = new Float32Array(rimN * rimN);
  const rimT = new Float32Array(rimN * rimN);
  const rimMo = new Float32Array(rimN * rimN);
  const rimFm = new Float32Array(rimN * rimN);
  let rimSea = false;
  const rimColTan = new Float64Array(rimN);
  for (let i = 0; i < rimN; i++) rimColTan[i] = tanX(-rimOut + i * rimStep);
  for (let j = 0; j < rimN; j++) {
    const zm = -rimOut + j * rimStep;
    const rowTan = tanZ(zm);
    for (let i = 0; i < rimN; i++) {
      const xm = -rimOut + i * rimStep;
      const f = rimFieldAt(xm, zm);
      const base = f.h;
      const d = cellDirT(cell, rimColTan[i], rowTan, _d);
      const rug = ruggedAt(f.rg, f.h * hPerU, hRef);
      const det = detailAt(ctx, detail, d[0], d[1], d[2], rug, 0);
      const damp = smoothstep(0, SHORE_DAMP, Math.abs(base));
      const h = base + det * (0.25 + 0.75 * damp);
      const k = j * rimN + i;
      rimHeights[k] = h;
      rimVary[k] = clamp(det / DETAIL_AMP, -1, 1);
      rimT[k] = f.t + (Math.max(base, 0) - Math.max(h, 0)) * hPerU * 0.55;
      rimMo[k] = f.m; rimFm[k] = f.fm;
      if (h < 0) rimSea = true;
    }
  }

  const rimColors = new Float32Array(rimN * rimN * 3);
  const rimSurface = new Uint8Array(rimN * rimN);
  const rimInvZ = 1 / (2 * rimStep);
  for (let j = 0; j < rimN; j++) {
    const jn = j * rimN;
    const j1 = j > 0 ? jn - rimN : jn, j2 = j < rimN - 1 ? jn + rimN : jn;
    const iz = j > 0 && j < rimN - 1 ? rimInvZ : 1 / rimStep;
    for (let i = 0; i < rimN; i++) {
      const k = jn + i;
      const h = rimHeights[k], hg = h * hPerU;
      const i1 = i > 0 ? i - 1 : i, i2 = i < rimN - 1 ? i + 1 : i;
      const ix = i > 0 && i < rimN - 1 ? rimInvZ : 1 / rimStep;
      const dhx = (rimHeights[jn + i2] - rimHeights[jn + i1]) * ix;
      const dhz = (rimHeights[j2 + i] - rimHeights[j1 + i]) * iz;
      const t = rimT[k];
      const m = rimMo[k] - rimVary[k] * 0.1 + Math.max(rimFm[k], 0) * 0.06;
      const bi = biomeIndex(ctx, hg, t, m, beachH);
      biomeTint(ctx, bi, hg, k, tint);
      if (h < 0) {
        const dp = smoothstep(0, DEEP_M, -h);
        tint[0] = lerp(P.shallow[0], P.deep[0], dp);
        tint[1] = lerp(P.shallow[1], P.deep[1], dp);
        tint[2] = lerp(P.shallow[2], P.deep[2], dp);
      }
      const rk = P.rock && h > 0 ? smoothstep(SLOPE_ROCK[0], SLOPE_ROCK[1], Math.sqrt(dhx * dhx + dhz * dhz)) : 0;
      rimSurface[k] = packSurface(bi, rk);
      const o = k * 3;
      if (rk > 0) {
        rimColors[o] = lerp(tint[0], P.rock[0], rk);
        rimColors[o + 1] = lerp(tint[1], P.rock[1], rk);
        rimColors[o + 2] = lerp(tint[2], P.rock[2], rk);
      } else {
        rimColors[o] = tint[0]; rimColors[o + 1] = tint[1]; rimColors[o + 2] = tint[2];
      }
    }
  }

  post(94, 'Growing the plants');
  const grown = patchFlora(ctx, {
    heights, vary, n, grid, half, size, hPerM: H_PER_M, hPerU,
    cellT, cellM, cellF, noise: pnoise, rng: prng, maxFlora: opts.maxFlora || 6000, pseed,
    blocked,
  });
  const flora = grown.flora;

  post(96, 'Calling the animals');
  const { groups, members } = patchFauna(ctx, opts.maxFauna, pulled, {
    pseed, heights, vary, n, grid, half, hPerU, cellT, cellM, cellF,
    blocked,
  });

  post(98, 'Almost there');
  const biome = BIOME_NAME[biomeIndex(ctx, siteH, siteT, siteM, BEACH_M * H_PER_M)];
  const plants = describePatchFlora(ctx, flora, biome, siteT, pseed);
  const result = {
    patch: {
      seed, patchSeed: pseed, lat, lon, size, grid, n,
      span, metresAcross: K, metresUp: V, cell, reliefM,
      // the band the plants thin out over at the edge of the box. ground.js reads it to place the
      // clamp of the camera target, so the two cannot drift apart. See TARGET_REACH there.
      floraEdge: FLORA_EDGE,
      floraVariant: ctx.world.floraVariant,
      rim: { out: rimOut, step: rimStep, n: rimN, hasSea: rimSea },
      // what the two passes after the scan put on the patch, for the load log
      marks: { tried: grown.marks, placed: grown.fixed, colossus: grown.big, mega: grown.mega },
      activity: act ? act.info : null,
      // Issue 34: the wreck of the source at its place on this patch, in units of the box, or null
      // on every cell but one. See patchSource() and ground-source.js.
      source: src ? src.info : null,
      biome,
      // The temperature at the site, in degrees Celsius. The stats card of the world states the
      // mean of the planet, and a patch is not the mean. The probe overlay reads this one and
      // drops it with the height of the camera. See siteTempC().
      tempC: siteTempC(ctx, siteT, biome),
      // The lore of every plant kind this patch grows, tallest first. See describePatchFlora().
      plants,
      palette: ctx.world.palette,
      elevation, radiusKm: ctx.radiusKm,
      seaLevel: 0, hasSea, shore: hasSea && hasLand,
    },
    heights, colors, flora, groups, members, rimHeights, rimColors, surface, rimSurface,
  };
  return result;
}

// ---------------------------------------------------------------- the interface
export { generate as world, patch };
