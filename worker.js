// myworlds — procedural planet generator (runs in a Web Worker).
// Self-contained: hashing, PRNG, simplex noise, icosphere, biomes, flora, clouds.
// The same seed string always produces the same world.

'use strict';
importScripts('./species.js'); // species genomes and lore (self.Species)

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

// ---------------------------------------------------------------- planet archetypes
const TYPES = [
  ['terran', 28], ['ocean', 12], ['desert', 12], ['ice', 12], ['lava', 8], ['gas', 14], ['exotic', 14],
];
const TYPE_LABEL = {
  terran: 'Temperate Terran', ocean: 'Ocean World', desert: 'Arid Desert', ice: 'Frozen Ice World',
  lava: 'Volcanic Hellscape', gas: 'Gas Giant', exotic: 'Exotic Alien World',
};
const FLORA = { TREE: 0, PINE: 1, CACTUS: 2, CRYSTAL: 3, MUSHROOM: 4, BOULDER: 5, PALM: 6 };
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
      P.flora = type === 'ocean' ? [FLORA.PALM, FLORA.TREE] : [FLORA.TREE, FLORA.PINE];
      P.floraColor = { canopy: mix(hex('#4f9f42'), hex('#2e7d32'), lush), canopy2: hex('#7fbf4a'), trunk: hex('#6b4a2e') };
      P.faunaColor = { body: hex(pick(rng, ['#b9a58a', '#8f9aa6', '#a48c7a'])), body2: hex('#5a4a3e'), accent: hex(pick(rng, ['#ff7b5c', '#ffc857', '#7ee0d0'])), glow: hex('#ffe9a8') };
      break;
    }
    case 'desert': {
      P.deep = hex('#3f6f8a'); P.shallow = hex('#8bb8a6'); P.beach = hex('#e8d59a');
      P.grass = hex('#e3c07c'); P.grass2 = hex('#d8ab5e'); P.forest = hex('#b5c66a'); P.dry = hex('#d3a75a');
      P.desert = hex('#e7c98a'); P.rock = hex('#a86a43'); P.rock2 = hex('#7f4d35'); P.snow = hex('#f1e6cf'); P.tundra = hex('#c8b389');
      P.ocean = hex('#2f8fbf'); P.oceanOpacity = 0.85; P.atmo = hex('#ffb066'); P.cloud = hex('#fff2e0');
      P.flora = [FLORA.CACTUS, FLORA.BOULDER];
      P.floraColor = { canopy: hex('#4f8a4a'), canopy2: hex('#8b6d55'), trunk: hex('#4f8a4a') };
      P.faunaColor = { body: hex('#c9a46a'), body2: hex('#6e4a32'), accent: hex(pick(rng, ['#e0503a', '#3fb8c4'])), glow: hex('#ffd9a0') };
      break;
    }
    case 'ice': {
      P.deep = hex('#5a7fa6'); P.shallow = hex('#9fc3df'); P.beach = hex('#dbe7f2');
      P.grass = hex('#eef4fa'); P.grass2 = hex('#dfeaf5'); P.forest = hex('#cfe0f0'); P.dry = hex('#e6eef7');
      P.desert = hex('#d6e3ef'); P.rock = hex('#6a7686'); P.rock2 = hex('#46505c'); P.snow = hex('#ffffff'); P.tundra = hex('#c2d2e2');
      P.ocean = hex('#bcd6ee'); P.oceanOpacity = 1; P.oceanIce = true; P.atmo = hex('#a9d4ff'); P.cloud = hex('#ffffff');
      P.flora = [FLORA.CRYSTAL, FLORA.PINE];
      P.floraColor = { canopy: hex('#8fe0ff'), canopy2: hex('#3e6b5a'), trunk: hex('#3f4c58') };
      P.faunaColor = { body: hex('#8fa3b8'), body2: hex('#3e4a58'), accent: hex('#6fd6ff'), glow: hex('#bff3ff') };
      break;
    }
    case 'lava': {
      P.deep = hex('#3a1e12'); P.shallow = hex('#5e2a17'); P.beach = hex('#5a3a2c');
      P.grass = hex('#3a3231'); P.grass2 = hex('#4a3f3c'); P.forest = hex('#2d2726'); P.dry = hex('#5a4a44');
      P.desert = hex('#6a5148'); P.rock = hex('#4b423e'); P.rock2 = hex('#2f2a28'); P.snow = hex('#8b8078'); P.tundra = hex('#5b514c');
      P.ocean = hex('#ff5a1f'); P.oceanOpacity = 1; P.oceanLava = true; P.atmo = hex('#ff6a3a'); P.cloud = hex('#5b5257');
      P.flora = [FLORA.BOULDER, FLORA.CRYSTAL];
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
      P.flora = [FLORA.MUSHROOM, FLORA.CRYSTAL, FLORA.TREE];
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
      P.flora = []; P.jitter = 0.035;
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

// ---------------------------------------------------------------- generation
function generate(seed, opts) {
  const detail = opts.detail || 96;
  const maxFlora = opts.maxFlora || 6000;
  const maxFauna = opts.maxFauna || 140;
  const post = (pct, label) => self.postMessage({ type: 'progress', pct, label });

  const rng = makeRng(seed);
  const type = chooseType(rng);
  const noise = new Noise(makeRng(seed + '|noise'));
  const P = makePalette(type, makeRng(seed + '|palette'));
  const frng = makeRng(seed + '|flavour');

  const world = {
    seed, type, typeLabel: TYPE_LABEL[type],
    designation: designation(frng, seed),
    tilt: rrange(rng, -0.45, 0.45),
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
  };
  world.species = Species.makeSpeciesSet(makeRng(seed + '|species'), type, world, P);

  if (type === 'gas') return generateGas(world, rng, noise, P, detail, post, frng, maxFauna);

  // ---- terrain parameters per type
  // land: the fraction of the surface above the sea. Earth is 0.29.
  // contFreq: the size of the continents. A lower value gives fewer and larger continents.
  // islands: the weight of the volcanic arcs that make small islands in the open sea.
  let land, amp, mountain, contFreq, islands, tempBias, snowLine, beachW, floraDensity, cloudCount;
  switch (type) {
    case 'terran': land = rrange(rng, 0.22, 0.42); amp = 0.06; mountain = rrange(rng, 0.5, 0.9); contFreq = rrange(rng, 0.55, 0.85); islands = 0.2; tempBias = rrange(rng, -0.1, 0.15); snowLine = 0.6; beachW = 0.03; floraDensity = 0.6; cloudCount = Math.round(rrange(rng, 40, 70)); break;
    case 'ocean': land = rrange(rng, 0.03, 0.12); amp = 0.06; mountain = rrange(rng, 0.4, 0.8); contFreq = rrange(rng, 0.8, 1.3); islands = 0.6; tempBias = 0.15; snowLine = 0.5; beachW = 0.04; floraDensity = 0.7; cloudCount = Math.round(rrange(rng, 55, 85)); break;
    case 'desert': land = rng() < 0.6 ? rrange(rng, 0.75, 0.92) : 1; amp = 0.055; mountain = rrange(rng, 0.5, 0.9); contFreq = rrange(rng, 0.5, 0.8); islands = 0.1; tempBias = 0.5; snowLine = 0.9; beachW = 0.02; floraDensity = 0.15; cloudCount = Math.round(rrange(rng, 6, 18)); break;
    case 'ice': land = rrange(rng, 0.3, 0.55); amp = 0.06; mountain = rrange(rng, 0.6, 1.0); contFreq = rrange(rng, 0.55, 0.9); islands = 0.15; tempBias = -0.8; snowLine = 0.1; beachW = 0.02; floraDensity = 0.12; cloudCount = Math.round(rrange(rng, 15, 30)); break;
    case 'lava': land = rrange(rng, 0.35, 0.6); amp = 0.065; mountain = rrange(rng, 0.8, 1.2); contFreq = rrange(rng, 0.6, 1.0); islands = 0.3; tempBias = 1.2; snowLine = 9; beachW = 0.02; floraDensity = 0.1; cloudCount = Math.round(rrange(rng, 12, 28)); break;
    case 'exotic': land = rrange(rng, 0.2, 0.6); amp = 0.065; mountain = rrange(rng, 0.5, 1.1); contFreq = rrange(rng, 0.5, 1.0); islands = 0.25; tempBias = rrange(rng, -0.2, 0.3); snowLine = rrange(rng, 0.55, 0.9); beachW = 0.03; floraDensity = 0.55; cloudCount = Math.round(rrange(rng, 25, 60)); break;
  }
  world.amp = amp; world.land = land;
  world.hasOcean = land < 1;
  world.hasClouds = cloudCount > 0;
  world.atmoStrength = type === 'lava' ? 0.6 : type === 'desert' ? 0.7 : 1;

  const o1 = randDir(rng).map((v) => v * 10), o2 = randDir(rng).map((v) => v * 10), o3 = randDir(rng).map((v) => v * 10);
  const o4 = randDir(rng).map((v) => v * 10), o5 = randDir(rng).map((v) => v * 10), o6 = randDir(rng).map((v) => v * 10);
  const mFreq = rrange(rng, 2.6, 4.2);
  const warp = rrange(rng, 0.15, 0.45);

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
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    // domain warp for organic coastlines
    const wx = noise.fbm(x * 0.9 + o4[0], y * 0.9 + o4[1], z * 0.9 + o4[2], 2) * warp;
    const wy = noise.fbm(x * 0.9 + o5[0], y * 0.9 + o5[1], z * 0.9 + o5[2], 2) * warp;
    const px = x + wx, py = y + wy, pz = z + (wx - wy) * 0.5;
    PX[v * 3] = px; PX[v * 3 + 1] = py; PX[v * 3 + 2] = pz;
    const cont = noise.fbm(px * contFreq + o1[0], py * contFreq + o1[1], pz * contFreq + o1[2], 3, 2.0, 0.5);
    const coast = noise.fbm(px * 3.5 + o6[0], py * 3.5 + o6[1], pz * 3.5 + o6[2], 3, 2.0, 0.5) * 0.1;
    // a low-frequency mask limits the arcs to a few chains, as on Earth
    const arc = noise.ridged(px * 6 + o2[0], py * 6 + o2[1], pz * 6 + o2[2], 2);
    const arcMask = smoothstep(0.25, 0.55, noise.fbm(px * 1.2 + o3[0], py * 1.2 + o3[1], pz * 1.2 + o3[2], 2));
    C[v] = (cont + coast + arc * arc * arc * arc * arcMask * islands) * 1.35;
    if ((v & 16383) === 0) post(15 + (v / vCount) * 20, 'Raising continents');
  }
  // The sea level is the quantile of the field that leaves the wanted land fraction dry.
  // Without an ocean the whole field sits high above a sea level that no vertex reaches.
  let seaLevel = -2;
  if (land < 1) {
    const sorted = C.slice().sort();
    seaLevel = sorted[Math.min(vCount - 1, Math.floor((1 - land) * vCount))];
  }
  world.seaLevel = seaLevel;

  // Pass 2: elevation, temperature, moisture
  for (let v = 0; v < vCount; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const px = PX[v * 3], py = PX[v * 3 + 1], pz = PX[v * 3 + 2];
    const c = C[v];
    const onLand = smoothstep(seaLevel - 0.15, seaLevel + 0.25, c);
    const m = noise.ridged(px * mFreq + o2[0], py * mFreq + o2[1], pz * mFreq + o2[2], 5);
    const d = noise.fbm(x * 9 + o3[0], y * 9 + o3[1], z * 9 + o3[2], 3) * 0.12;
    const hl = c - seaLevel;
    // compress continent interiors into gentle lowlands; ridges carry the mountains.
    // The fine relief fades out at the coast, so it does not cut the shore into specks
    // and does not lift the sea floor into islands. Islands come from the arc term only.
    const ridge = m * m * mountain * onLand * 0.75;
    let h;
    if (hl >= 0) h = Math.pow(hl, 0.75) * 0.3 + ridge + d * smoothstep(0, 0.08, hl);
    else h = hl + (ridge + d * 0.5) * smoothstep(0, -0.2, hl);
    H[v] = h;
    const lat = Math.abs(y);
    const tnoise = noise.fbm(x * 2.2 + o5[0], y * 2.2 + o5[1], z * 2.2 + o5[2], 2) * 0.12;
    T[v] = clamp(1 - Math.pow(lat, 1.6) * 1.1 + tempBias + tnoise - Math.max(h, 0) * 0.55, -0.3, 1.3);
    M[v] = noise.fbm(x * 1.7 + o4[0] * 0.7, y * 1.7 + o4[1] * 0.7, z * 1.7 + o4[2] * 0.7, 3);
    FM[v] = noise.fbm(x * 6 + o2[0], y * 6 + o2[1], z * 6 + o2[2], 2);
    // displacement: land pushed up, sea floor gently down and clamped
    const disp = h >= 0 ? Math.min(h, 1.0) : Math.max(h, -0.5) * 0.55;
    R[v] = 1 + amp * disp;
    if ((v & 16383) === 0) post(35 + (v / vCount) * 25, 'Raising continents');
  }

  post(60, 'Stirring the crust');
  const act = makeActivity(makeRng(seed + '|activity'), type, world, P, pos, vCount, H, T, R, amp, beachW);
  const paintAct = act ? act.paint : null;
  const blockV = act ? act.block : null;

  post(62, 'Painting biomes');
  // per-face colouring, expanded to non-indexed triangles
  const outPos = new Float32Array(triCount * 9);
  const outCol = new Float32Array(triCount * 9);
  const faceBiome = new Uint8Array(triCount); // 1 = forestable land
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
    faceBiome[f] = h > beachW && t > 0.12 && h < snowLine - 0.2 + (t - 0.5) * 0.25 ? 1 : 0;
    if ((f & 32767) === 0) post(62 + (f / triCount) * 18, 'Painting biomes');
  }

  post(82, 'Growing forests');
  // flora candidates from unique vertices on habitable land, clustered by FM mask
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
        if (FM[v] + m * 0.5 > 0.05) { kind = t < 0.45 ? FLORA.PINE : (type === 'ocean' && h < 0.12 && t > 0.6 ? FLORA.PALM : FLORA.TREE); p = floraDensity * smoothstep(0.05, 0.4, FM[v] + m * 0.5); }
        break;
      case 'desert':
        if (m > 0.35 && FM[v] > 0.1) { kind = FLORA.CACTUS; p = 0.35; }
        else if (FM[v] > 0.4) { kind = FLORA.BOULDER; p = 0.12; }
        break;
      case 'ice':
        if (FM[v] > 0.3) { kind = FLORA.CRYSTAL; p = 0.25; }
        else if (t > 0.15 && FM[v] + m * 0.5 > 0.1 && h < 0.3) { kind = FLORA.PINE; p = 0.3; }
        break;
      case 'lava':
        if (FM[v] > 0.35) { kind = FLORA.CRYSTAL; p = 0.2; }
        else if (FM[v] > 0.15 && h < 0.2) { kind = FLORA.BOULDER; p = 0.15; }
        break;
      case 'exotic':
        if (t < 0.1) break;
        if (FM[v] + m * 0.5 > 0.05) { kind = FM[v] > 0.35 ? FLORA.CRYSTAL : (m > 0.1 ? FLORA.MUSHROOM : FLORA.TREE); p = floraDensity * smoothstep(0.05, 0.4, FM[v] + m * 0.5); }
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

  post(86, 'Surveying the ground');
  // coarse lat/lon height map (radius factors) so creatures can follow the terrain on the main thread
  const { heightMap, HM_W, HM_H } = buildHeightMap(pos, R, vCount);
  world.heightMapSize = [HM_W, HM_H];
  world.seaRadius = world.hasOcean ? 1 + amp * 0.004 : 0;

  post(88, 'Waking the wildlife');
  const fauna = makeFauna(makeRng(seed + '|fauna'), type, pos, vCount, H, T, M, FM, R, beachW, snowLine, maxFauna, world, blockV);

  post(90, 'Condensing clouds');
  const clouds = makeClouds(makeRng(seed + '|clouds'), noise, cloudCount, type, world.activity && world.activity.kind === 'lightning' ? world.activity : null);

  post(94, 'Catching moons');
  world.rings = rng() < (type === 'ice' ? 0.2 : 0.08) ? makeRings(rng, P.rock ? mix(P.rock, [1, 1, 1], 0.4) : [0.8, 0.8, 0.8], 1.5) : null;
  world.moons = makeMoons(rng, type, !!world.rings);
  world.stats = makeStats(frng, type, world, fc);

  post(98, 'Almost there');
  const result = { world, terrain: { pos: outPos, col: outCol }, flora, clouds, fauna, heightMap };
  self.postMessage({ type: 'done', result }, [outPos.buffer, outCol.buffer, flora.buffer, clouds.buffer, fauna.buffer, heightMap.buffer]);
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

function makeStats(rng, type, world, floraCount) {
  const km = type === 'gas' ? Math.round(rrange(rng, 24000, 75000)) : Math.round(rrange(rng, 3200, 9800));
  const g = type === 'gas' ? rrange(rng, 0.9, 2.6) : (km / 6371) * rrange(rng, 0.8, 1.2);
  world.gravity = g; for (const s of world.species) s.gravity = g; // the hop of a monopod depends on it
  const day = type === 'gas' ? rrange(rng, 8, 16) : rrange(rng, 14, 60);
  const tempByType = { terran: [-5, 28], ocean: [5, 32], desert: [30, 75], ice: [-120, -40], lava: [420, 900], gas: [-190, -90], exotic: [-30, 60] };
  const [tLo, tHi] = tempByType[type];
  const temp = Math.round(rrange(rng, tLo, tHi));
  let life;
  switch (type) {
    case 'terran': life = pick(rng, ['Forests and grazing herds', 'Dense woodland, birdsong', 'Rolling meadows, shy fauna', 'Old forests, quiet rivers']); break;
    case 'ocean': life = pick(rng, ['Reefs and palm islands', 'Kelp forests, seabirds', 'Coral atolls, gentle tides']); break;
    case 'desert': life = pick(rng, ['Cacti in hidden oases', 'Hardy scrub, sand lizards', 'Dust storms, stubborn cactus']); break;
    case 'ice': life = pick(rng, ['Crystal fields, lantern light at dusk', 'Frozen seas, slow shelled crawlers', 'Snow pines cling to the equator']); break;
    case 'lava': life = pick(rng, ['Armoured crawlers on the cooler ridges', 'Molten oceans, ash plains', 'Glowing crystal spires']); break;
    case 'gas': life = pick(rng, ['Endless storms', 'Ammonia cloud bands', 'Winds of 1,400 km/h']); break;
    case 'exotic': life = pick(rng, ['Glowing mushroom groves', 'Singing crystals', 'Luminous alien flora']); break;
  }
  const fauna = (world.faunaKinds || []).map((k) => world.species[k].lore.plural);
  const faunaText = fauna.length ? fauna.slice(0, 3).join(", ") : "none seen";
  return {
    radius: `${km.toLocaleString()} km`, gravity: `${g.toFixed(2)} g`, day: `${day.toFixed(1)} h`,
    land: type === 'gas' ? null : `${Math.round(world.land * 100)}%`,
    activity: world.activity ? world.activity.label : null,
    temp: `${temp} °C`, moons: world.moons.length, life, fauna: faunaText[0].toUpperCase() + faunaText.slice(1), floraCount,
  };
}

// ---------------------------------------------------------------- natural activity
// At most one phenomenon per world, and most worlds have none.
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

function makeActivity(rng, type, world, P, pos, vCount, H, T, R, amp, beachW) {
  world.activity = null;
  if (rng() >= (type === 'lava' ? 0.45 : 0.3)) return null;
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
    const { heightMap, HM_W, HM_H } = buildHeightMap(pos, R, vCount);
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

// ---------------------------------------------------------------- gas giant
function generateGas(world, rng, noise, P, detail, post, frng, maxFauna) {
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
  makeActivity(makeRng(world.seed + '|activity'), 'gas', world, P);
  world.rings = rng() < 0.65 ? makeRings(rng, mix(bands[0], [1, 1, 1], 0.2), 1) : null;
  world.moons = makeMoons(rng, "gas", !!world.rings);
  const fauna = makeGasFauna(makeRng(world.seed + '|fauna'), maxFauna, world);
  world.stats = makeStats(frng, 'gas', world, 0);
  post(96, 'Almost there');
  const flora = new Float32Array(0), clouds = new Float32Array(0);
  self.postMessage({ type: 'done', result: { world, terrain: { pos: outPos, col: outCol }, flora, clouds, fauna } }, [outPos.buffer, outCol.buffer, fauna.buffer]);
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type !== 'generate') return;
  try {
    generate(msg.seed, msg.opts || {});
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.stack || err) });
  }
};
