// myworlds — the ground cover: blades of grass and small stones around the camera.
//
// The terrain is a grid of 2 m facets, and ground-detail.js paints the detail a facet cannot hold.
// Close to the camera the ground still reads flat, because nothing stands on it between the
// plants. This file stands real geometry there: blades where the pattern paints cover, and stones
// where it paints loose ground, rock, or snow.
//
// The graphics card places every blade and every stone. The ground around the camera splits into
// tiles of TILE metres. One draw holds one copy of a set of blades for each tile in view, and the
// vertex shader finds the place of each blade from a hash of its tile and its index. It reads the
// height from a texture of the heights and the colour and the density from a texture of the
// ground. A blade therefore never moves under the reader, the CPU writes only the list of tiles,
// and no blade holds a matrix of its own.
//
// A blade reads the triangle of the terrain it stands on, the same two triangles per cell that
// the terrain mesh draws, so its root sits on the facet and never floats over a ridge.
//
// The cover thins with distance. Blade k of a tile grows while k / BLADES stays under the density,
// so the far ground keeps a quarter of the blades, each one wider, and those are the same blades
// the near set holds. A tile draws the smallest set that holds every blade its nearest point can
// grow: all of them, the first half, or the first quarter. Past the thinning, the blades shrink
// and take the colour of the ground, so the edge of the field never shows. The distance is the
// distance in three dimensions, so the cover goes as the camera climbs.
//
// The cost is in the vertex shader. With tiles of 4 m and one set for the far ground, the blades
// took about 1.8 ms of vertex work and 0.8 ms of pixels at 1280 by 800 and a pixel ratio of 2. So a
// tile is now 2 m, its ball for the frustum test is tight, a tile draws the smallest set it can,
// and a blade that does not grow stops before it reads the heights. That halved the triangles, and
// the cover now adds 0.7 to 2 ms to the frame on the development Mac, and 0.2 ms on the low tier.
import * as THREE from 'three';
import { detailShared } from './ground-detail.js';

const TILE = 2;              // metres: the side of one tile
const THIN = 0.25;           // the share of the blades the far cover keeps
const SETS = [1, 0.5, THIN]; // the share of the blades each set holds, near to far
const SOURCE_DISC = 14;      // metres: the disc the wreck flattens, SOURCE_DISC in generate.js
const GAIN = 1.06;           // GROUND_GAIN of ground.js: the terrain multiplies its colours by this
const COLOR_MAX = 1.25;      // the colour textures store colour / COLOR_MAX, so a bright vertex fits
const WALK_MS = 4;           // ms of the frame the walk over the nodes may take, see _start()
const REACH_UP = 0.8;        // metres: how far a blade or a stone stands over the ground

// The cover of each tier. `density` is blades per square metre at full cover. The thinning starts
// at `near` and reaches THIN at `thin`, and a blade shrinks to nothing between `shrink` and
// `radius`. `levels` are the heights of the pairs of vertices along a blade under its tip, in
// the nearest set, and `farLevels` in the other two. `stones` is the most stones one tile holds,
// and they shrink out between `stoneShrink` and `stoneRadius`.
const TIERS = {
  high: {
    density: 150, near: 5, thin: 12, shrink: 20, radius: 32, levels: [0, 0.3, 0.62], farLevels: [0, 0.45],
    stones: 16, stoneShrink: 16, stoneRadius: 26,
  },
  low: {
    density: 90, near: 4, thin: 10, shrink: 14, radius: 24, levels: [0, 0.45], farLevels: [0, 0.45],
    stones: 8, stoneShrink: 10, stoneRadius: 16,
  },
};

// The cover of each world type: the height of a blade at full cover in metres, the width at its
// root, the share of the cover family that grows blades, and how many stones the loose ground
// sheds and how large they grow. An ice world and a lava world paint no cover, so they grow no
// blades. The ash of a lava world lies thick with cinders.
const TYPES = {
  terran: { height: 0.38, width: 0.075, share: 1, loose: 1, size: 1 },
  ocean: { height: 0.38, width: 0.075, share: 1, loose: 1, size: 1 },
  exotic: { height: 0.46, width: 0.08, share: 1, loose: 1, size: 1 },
  desert: { height: 0.26, width: 0.06, share: 0.5, loose: 1.4, size: 1.1 },
  ice: { height: 0.2, width: 0.05, share: 0, loose: 1, size: 1 },
  lava: { height: 0.2, width: 0.05, share: 0, loose: 2.4, size: 1.3 },
};
// The stones of each family, as a share of the most a tile holds, and the size of the largest
// stone in metres. Bare rock sheds the most and the largest.
const STONES = { cover: 0.02, loose: 0.25, rock: 0.8, snow: 0.1 };
const STONE_SIZE = 0.3;
const CLUMP = 0.6;           // metres: the cell of one tuft, which pulls its blades together
const PULL = 0.15;           // how far a blade moves toward the middle of its tuft

const _pm = new THREE.Matrix4();
const _fr = new THREE.Frustum();
const _ball = new THREE.Sphere();
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function hash3(a, b, c) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// One set of blades. Every vertex holds the index of its blade, its height along the blade from 0
// to 1, and its side: -1 or 1, and 0 at the tip. The shader builds the blade from these three.
function bladeGeometry(blades, levels) {
  const per = levels.length * 2 + 1;
  const pos = new Float32Array(blades * per * 3);
  const idx = [];
  for (let b = 0; b < blades; b++) {
    const v0 = b * per;
    let o = v0 * 3;
    for (const t of levels) {
      pos[o] = b; pos[o + 1] = t; pos[o + 2] = -1; o += 3;
      pos[o] = b; pos[o + 1] = t; pos[o + 2] = 1; o += 3;
    }
    pos[o] = b; pos[o + 1] = 1; pos[o + 2] = 0;
    for (let l = 0; l < levels.length - 1; l++) {
      const a = v0 + l * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    const a = v0 + (levels.length - 1) * 2;
    idx.push(a, a + 1, v0 + per - 1);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

// One set of stones. A stone is one of four shapes: an icosahedron with its corners pushed in and
// out and its body flattened, so it reads as a broken stone with flat faces and not as a ball.
// The same corner takes the same push in every face, so the faces stay joined. `aStone` holds
// the index of the stone.
const SHAPES = [[1.3, 0.55, 0.9], [1.0, 0.7, 1.1], [1.5, 0.45, 0.8], [1.1, 0.8, 1.2]];
function stoneGeometry(stones) {
  const shapes = SHAPES.map(([sx, sy, sz], s) => {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 0.72 + 0.5 * hash3(Math.round(x * 1000), Math.round(y * 1000), Math.round(z * 1000) + s * 7919);
      p.setXYZ(i, x * k * sx, y * k * sy, z * k * sz);
    }
    g.computeVertexNormals();
    return g;
  });
  const per = shapes[0].attributes.position.count;
  const pos = new Float32Array(stones * per * 3), nrm = new Float32Array(stones * per * 3);
  const id = new Float32Array(stones * per);
  for (let i = 0; i < stones; i++) {
    const g = shapes[i % shapes.length];
    pos.set(g.attributes.position.array, i * per * 3);
    nrm.set(g.attributes.normal.array, i * per * 3);
    id.fill(i, i * per, (i + 1) * per);
  }
  shapes.forEach((g) => g.dispose());
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aStone', new THREE.BufferAttribute(id, 1));
  return geo;
}

// ---------------------------------------------------------------- the shaders
const f3 = (x) => x.toFixed(3);

// What the blades and the stones share: the hash, the ground, and the textures.
const COMMON = (macro, macroBig) => `
attribute vec2 aTile;
uniform sampler2D uCovH;
uniform sampler2D uCovG;
uniform sampler2D uCovS;
uniform highp sampler2DArray uCovLayers;
uniform vec4 uCovBox;      // half, grid, nodes on a side, 1 / nodes
uniform float uCovTime;
uniform vec2 uCovWind;
varying vec3 vCovCol;
#define COV_TILE ${f3(TILE)}
#define COV_MACRO ${macro}.0
#define COV_BIG ${f3(macroBig)}

// the hash of Jarzynski and Olano, "Hash Functions for GPU Rendering" (pcg3d)
uvec3 covPcg(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
// three values from 0 to 1 for thing k of a tile; salt picks an independent set
vec3 covRand(vec2 tile, float k, uint salt) {
  uvec3 v = covPcg(uvec3(uvec2(ivec2(tile) + 32768), uint(k) * 4u + salt));
  return vec3(v >> 8u) * (1.0 / 16777216.0);
}
// The height of the terrain at p, on the triangle the mesh draws there, and the normal of that
// facet. The mesh splits a cell from its node (i, j) to its node (i + 1, j + 1). inside is 0 off
// the patch.
float covGround(vec2 p, out vec3 nrm, out float inside) {
  vec2 u = (p + uCovBox.x) / uCovBox.y;
  float top = uCovBox.z - 1.0;
  inside = step(0.0, u.x) * step(0.0, u.y) * step(u.x, top - 0.001) * step(u.y, top - 0.001);
  u = clamp(u, vec2(0.0), vec2(top - 0.001));
  ivec2 i = ivec2(u);
  vec2 f = u - vec2(i);
  float a = texelFetch(uCovH, i, 0).r;
  float b = texelFetch(uCovH, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uCovH, i + ivec2(0, 1), 0).r;
  float e = texelFetch(uCovH, i + ivec2(1, 1), 0).r;
  vec2 d = f.y > f.x ? vec2(e - c, c - a) : vec2(b - a, e - b);
  nrm = normalize(vec3(-d.x, uCovBox.y, -d.y));
  return a + d.x * f.x + d.y * f.y;
}
vec2 covUv(vec2 p) { return ((p + uCovBox.x) / uCovBox.y + 0.5) * uCovBox.w; }
float covMacro(vec2 uv, int ch) { return textureLod(uCovLayers, vec3(uv, COV_MACRO), 0.0)[ch]; }
float covLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// a hue turn about the grey axis, which keeps the lightness; the same turn ground-detail.js makes
vec3 covHue(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
`;

// One blade. It stands on the facet, leans away from its face, and bends with the gusts, which
// run across the field with the wind. The normal leans toward the normal of the facet, so the
// field takes the light the ground under it takes, and it rounds off across the width of the
// blade. The root is dark with the shade of the other blades, and the tip is lighter and warmer.
const BLADE = `
uniform vec4 uCovFade;     // the start of the thinning, its end, the start of the shrink, the radius
uniform vec4 uCovBlade;    // blades per tile, height, width, the dry hue
uniform float uCovShare;   // the share of the cover that grows blades
void covPlace(out vec3 pos, out vec3 nrm) {
  float k = position.x, t = position.y, side = position.z;
  vec3 r1 = covRand(aTile, k, 0u);
  // A blade belongs to the tuft of the cell it falls in. It moves toward the middle of the tuft
  // and leans out from it, so the field holds tufts and not an even stubble.
  vec2 p = (aTile + r1.xy) * COV_TILE;
  vec2 cell = floor(p / ${f3(CLUMP)});
  vec3 cr = covRand(cell, 0.0, 3u);
  vec2 mid = (cell + 0.2 + 0.6 * cr.xy) * ${f3(CLUMP)};
  vec2 out2 = p - mid;
  p = mid + out2 * ${f3(1 - PULL)};
  // Every vertex of a blade that does not grow takes one point, so its triangles cover nothing.
  pos = vec3(p.x, 0.0, p.y);
  nrm = vec3(0.0, 1.0, 0.0);
  vCovCol = vec3(0.0);
  vec4 g = textureLod(uCovG, covUv(p), 0.0);
  // clumps a few metres wide: thinner and shorter in some, thicker and taller in others
  float clump = covMacro(p / 7.0, 1);
  float dens = g.a * mix(0.6, 1.0, smoothstep(0.32, 0.56, clump));
  float key = (k + 0.5) / uCovBlade.x;
  // The distance on the plane is never more than the true distance, so this test drops only the
  // blades the full test below drops too. It drops most of them before the reads of the heights.
  float onPlane = distance(cameraPosition.xz, p);
  if (onPlane >= uCovFade.w || key >= dens * mix(1.0, ${f3(THIN)}, smoothstep(uCovFade.x, uCovFade.y, onPlane))) return;
  vec3 gn;
  float inside;
  float gy = covGround(p, gn, inside);
  vec3 root = vec3(p.x, gy, p.y);
  float dist = distance(cameraPosition, root);
  float lod = mix(1.0, ${f3(THIN)}, smoothstep(uCovFade.x, uCovFade.y, dist));
  float shrink = 1.0 - smoothstep(uCovFade.z, uCovFade.w, dist);
  if (inside < 0.5 || shrink <= 0.0 || key >= dens * lod) return;
  pos = root;
  nrm = gn;
  vec3 r2 = covRand(aTile, k, 1u);

  float h = uCovBlade.y * (0.6 + 0.5 * r1.z) * (0.55 + 0.7 * cr.z) * (0.5 + 0.5 * g.a) * (0.7 + 1.2 * (clump - 0.5)) * shrink;
  float w = uCovBlade.z * (0.7 + 0.6 * r2.z) * inversesqrt(lod) * sqrt(shrink);
  // the face turns out from the middle of the tuft, give or take a random turn
  float yaw = atan(out2.y, out2.x) + (r2.x - 0.5) * 2.2;
  vec2 face = vec2(cos(yaw), sin(yaw));
  vec2 across = vec2(-face.y, face.x);
  // the lean of the blade, the gust that runs over the field, and a flutter of its own
  float gust = smoothstep(0.36, 0.66, covMacro((p - uCovWind * uCovTime * 2.6) / 23.0, 0));
  vec2 bend = face * (0.12 + 0.45 * r2.y) + uCovWind * (0.05 + 0.42 * gust)
    + face * sin(uCovTime * 2.7 + r1.x * 40.0) * 0.03;
  float y = h * t * (1.0 - 0.3 * dot(bend, bend) * t);
  vec2 xz = p + across * (side * 0.5 * w * (1.0 - pow(t, 1.4))) + bend * (h * t * t);
  // the root sinks by the slope over its half width, so no corner of it floats over the facet
  float sink = t < 0.001 ? 0.015 + 0.5 * w * length(gn.xz) / gn.y : 0.0;
  pos = vec3(xz.x, gy + y - sink, xz.y);

  // The normal of the facet, rounded across the width of the blade, so the field takes the light
  // the ground under it takes and each blade shows one lit edge. The normal of the face itself
  // made a blade turned to the sun brighter than the ground and a blade turned from it dark with
  // the hue of the sky, so a field seen toward the sun went dark and one seen away from it glared.
  nrm = normalize(gn + vec3(across.x, 0.0, across.y) * (side * 0.3));

  // the colour of the ground under the blade, with the dry patches and the light of the pattern
  float big = covMacro(mat2(0.8, 0.6, -0.6, 0.8) * p / COV_BIG, 0);
  vec3 base = g.rgb * ${f3(COLOR_MAX * GAIN)};
  // The ground turns dry only on its share of cover, so a blade on mixed ground turns with it.
  float dry = max(smoothstep(0.55, 0.8, big) * 0.55, step(0.88, fract(r1.z * 7.31)) * 0.5) * min(g.a / uCovShare, 1.0);
  base = mix(base, covHue(base, uCovBlade.w) * 1.06, dry);
  base *= 1.0 + (big - 0.5) * 0.12;
  float tone = 0.88 + 0.26 * fract(r2.y * 13.7);
  // the shade at the root deepens where the blades stand thick
  vec3 col = mix(base * mix(1.0, 0.5, dens), base * vec3(1.18, 1.15, 1.0) * tone, t);
  // a blade that shrinks takes the colour of the ground, so it never reads as a dark speck
  vCovCol = mix(base, col, smoothstep(0.0, 0.6, shrink));
}
`;

// One stone. It sinks by a quarter of its size, it tilts with the facet, and it gathers in beds.
// Most stones are small and a few are large.
const STONE = `
attribute float aStone;
uniform vec4 uCovStone;    // stones per tile, the largest size, the start of the shrink, the radius
void covPlace(out vec3 pos, out vec3 nrm) {
  vec3 r1 = covRand(aTile, aStone, 2u);
  vec2 p = (aTile + r1.xy) * COV_TILE;
  pos = vec3(p.x, 0.0, p.y);
  nrm = vec3(0.0, 1.0, 0.0);
  vCovCol = vec3(0.0);
  vec2 s = textureLod(uCovS, covUv(p), 0.0).rg;
  float bed = covMacro(p / 9.0 + 0.37, 0);
  float dens = s.r * smoothstep(0.3, 0.6, bed) * 1.4;
  if ((aStone + 0.5) / uCovStone.x >= dens || distance(cameraPosition.xz, p) >= uCovStone.w) return;
  vec3 gn;
  float inside;
  float gy = covGround(p, gn, inside);
  float shrink = 1.0 - smoothstep(uCovStone.z, uCovStone.w, distance(cameraPosition, vec3(p.x, gy, p.y)));
  if (inside < 0.5 || shrink <= 0.0) return;
  vec3 r2 = covRand(aTile, aStone, 3u);

  float size = uCovStone.y * (0.1 + 0.9 * r1.z * r1.z * r1.z) * (0.4 + 0.6 * s.r) * shrink;
  float yaw = r2.x * 6.2831853;
  float c = cos(yaw), sn = sin(yaw);
  vec3 l = position * size;
  vec3 w = vec3(c * l.x - sn * l.z, l.y, sn * l.x + c * l.z);
  vec2 slope = -gn.xz / gn.y;
  pos = vec3(p.x + w.x, gy - size * 0.25 + w.y + dot(slope, w.xz), p.y + w.z);
  // the normal of the turn and of the tilt, which is a shear of y by the slope
  vec3 rn = vec3(c * normal.x - sn * normal.z, normal.y, sn * normal.x + c * normal.z);
  nrm = normalize(vec3(rn.x - slope.x * rn.y, rn.y, rn.z - slope.y * rn.y));
  // A stone is the ground, greyer and darker, and on snow it is the dark rock under the snow. It
  // is darker at its foot, where it meets the ground.
  vec3 c0 = textureLod(uCovG, covUv(p), 0.0).rgb * ${f3(COLOR_MAX * GAIN)};
  c0 = mix(c0, vec3(covLum(c0)), 0.4) * (0.72 - 0.34 * s.g);
  float foot = mix(0.62, 1.0, smoothstep(-0.2, 0.45, position.y));
  vCovCol = c0 * (0.78 + 0.4 * r2.y) * foot;
}
`;

// The Lambert material of the blades or the stones: the placement runs before the normal, and the
// colour replaces the vertex colour. The blades draw both faces and keep the normal the vertex
// shader gave them, which already faces the reader: the flip of a double sided material would
// turn it into the ground.
function coverMaterial(kind, uniforms, macro, macroBig, low) {
  const blade = kind === 'blade';
  const m = new THREE.MeshLambertMaterial({ side: blade ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON(macro, macroBig)}\n${blade ? BLADE : STONE}`)
      .replace('#include <beginnormal_vertex>', 'vec3 covPos, covNrm;\ncovPlace(covPos, covNrm);\nvec3 objectNormal = covNrm;')
      .replace('#include <begin_vertex>', 'vec3 transformed = covPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCovCol;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vCovCol;');
    if (blade) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;');
    }
  };
  m.customProgramCacheKey = () => `cover-${kind}-${low ? 'low' : 'high'}`;
  return m;
}

// ---------------------------------------------------------------- the cover
export class GroundCover {
  // heights, colors, surface: the arrays of the patch, and patch its description. tone(k): the
  // lightness noise the terrain gives node k. heightAt(x, z): the ground.
  constructor({ renderer, type, tier, patch, heights, colors, surface, seaLevel = null,
    wind = 0, tone = () => 1, heightAt }) {
    const { n, grid } = patch, half = patch.size / 2;
    // The disc of the phenomenon and the disc of the wreck grow nothing, as the worker keeps the
    // plants off them.
    const blocks = [];
    if (patch.activity && patch.activity.radius) blocks.push([0, 0, patch.activity.radius]);
    if (patch.source) blocks.push([patch.source.x, patch.source.z, SOURCE_DISC]);
    const low = !tier.shadows;
    this.cfg = TIERS[low ? 'low' : 'high'];
    this.heightAt = heightAt;
    this.group = new THREE.Group();
    this.count = { tiles: 0, sets: [0, 0, 0], stones: 0 };
    const shared = detailShared(renderer, type, low);
    const grass = TYPES[type] || TYPES.terran;

    this.buildMs = 0;
    this._start({ heights, colors, surface, n, grid, half, seaLevel, blocks, tone, shared, grass });

    const c = this.cfg;
    const blades = Math.round(c.density * TILE * TILE);
    this.uniforms = {
      uCovH: { value: this.textures.h },
      uCovG: { value: this.textures.g },
      uCovS: { value: this.textures.s },
      uCovLayers: { value: shared.texture },
      uCovBox: { value: new THREE.Vector4(half, grid, n, 1 / n) },
      uCovTime: { value: 0 },
      uCovWind: { value: new THREE.Vector2(Math.cos(wind), Math.sin(wind)) },
      uCovFade: { value: new THREE.Vector4(c.near, c.thin, c.shrink, c.radius) },
      uCovBlade: { value: new THREE.Vector4(blades, grass.height, grass.width, shared.dryHue) },
      uCovStone: { value: new THREE.Vector4(c.stones, STONE_SIZE * grass.size, c.stoneShrink, c.stoneRadius) },
      uCovShare: { value: Math.max(grass.share, 1e-3) },
    };
    const bladeMat = coverMaterial('blade', this.uniforms, shared.macro, shared.macroBig, low);
    const stoneMat = coverMaterial('stone', this.uniforms, shared.macro, shared.macroBig, low);
    this.materials = [bladeMat, stoneMat];

    const maxTiles = (2 * Math.ceil(c.radius / TILE) + 2) ** 2;
    // the three sets of blades, near to far, and the stones
    this.sets = grass.share > 0 ? SETS.map((share, k) => this._mesh(
      bladeGeometry(Math.round(blades * share), k === 0 ? c.levels : c.farLevels), bladeMat, maxTiles, k - 3, tier)) : [];
    this.stones = this._mesh(stoneGeometry(c.stones), stoneMat, maxTiles, -4, tier);
    this._list = [];
    this._corner = new Float32Array(0);
  }

  // The three textures: the heights, exact, for the triangle a blade stands on; the colour of the
  // ground and the density of the blades; and the density of the stones with the share of snow.
  // The walk over the nodes takes about 80 ms on the high tier, so it runs a few rows at a time
  // in update() while the probe comes down, and the cover shows once it is done. The probe lands
  // hundreds of metres up, so the walk is over long before a blade could show.
  _start({ heights, colors, surface, n, grid, half, seaLevel, blocks, tone, shared, grass }) {
    const N = n * n;
    const h = new THREE.DataTexture(heights instanceof Float32Array ? heights : Float32Array.from(heights),
      n, n, THREE.RedFormat, THREE.FloatType);
    const tex = (data, format) => {
      const d = new THREE.DataTexture(data, n, n, format, THREE.UnsignedByteType);
      d.magFilter = THREE.LinearFilter;
      d.minFilter = THREE.LinearFilter;
      d.unpackAlignment = 1;       // a row of RG bytes is not a whole number of words
      return d;
    };
    this.textures = { h, g: tex(new Uint8Array(N * 4), THREE.RGBAFormat), s: tex(new Uint8Array(N * 2), THREE.RGFormat) };
    this._walk = { j: 0, heights, colors, surface, n, grid, half, seaLevel, blocks, tone, shared, grass, ms: 0 };
  }

  // Walk rows for about `budget` ms. Returns true once every row is done and the textures are sent.
  _step(budget) {
    const W = this._walk;
    if (!W) return true;
    const t0 = performance.now();
    const { heights, colors, surface, n, grid, half, seaLevel, blocks, tone, grass } = W;
    const F = W.shared.families, gd = this.textures.g.image.data, sd = this.textures.s.image.data;
    const to8 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));
    const inv = 1 / COLOR_MAX, looseStones = STONES.loose * grass.loose;
    let j = W.j;
    for (; j < n; j++) {
      if ((j & 15) === 0 && j > W.j && performance.now() - t0 > budget) break;
      const z = -half + j * grid;
      for (let i = 0, k = j * n; i < n; i++, k++) {
        const f = (surface ? surface[k] : 0) * 4;
        const cover = F[f], loose = F[f + 1], rock = F[f + 2], snow = F[f + 3];
        let blade = cover * grass.share;
        let stone = cover * STONES.cover + loose * looseStones + rock * STONES.rock + snow * STONES.snow;
        if (seaLevel != null && heights[k] < seaLevel + 0.1) blade = 0;
        for (let b = 0; b < blocks.length; b++) {
          const x = -half + i * grid, B = blocks[b];
          if ((x - B[0]) * (x - B[0]) + (z - B[1]) * (z - B[1]) < B[2] * B[2]) { blade = 0; stone = 0; }
        }
        const t = tone(k) * inv, o = k * 4, c = k * 3;
        gd[o] = to8(colors[c] * t); gd[o + 1] = to8(colors[c + 1] * t); gd[o + 2] = to8(colors[c + 2] * t);
        gd[o + 3] = to8(blade);
        sd[k * 2] = to8(stone); sd[k * 2 + 1] = to8(snow);
      }
    }
    W.j = j;
    W.ms += performance.now() - t0;
    if (j < n) return false;
    for (const tx of Object.values(this.textures)) tx.needsUpdate = true;
    this.buildMs = W.ms;
    this._walk = null;
    return true;
  }

  // One draw: a set of blades or stones for each tile in the list. The frustum test runs on the
  // tiles, so the mesh itself is never culled, and a vertex shader cannot be picked.
  _mesh(geo, mat, maxTiles, order, tier) {
    const tiles = new THREE.InstancedBufferAttribute(new Float32Array(maxTiles * 2), 2);
    tiles.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aTile', tiles);
    geo.instanceCount = 0;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = !!tier.shadows;
    // Drawn before the terrain, and near tiles first, so the depth test skips the ground and the
    // far blades a near blade already covers.
    mesh.renderOrder = order;
    mesh.raycast = () => {};
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  update(camera, t) {
    this.uniforms.uCovTime.value = t;
    const c = this.cfg, e = camera.position;
    const up = e.y - this.heightAt(e.x, e.z);
    if (!this._step(WALK_MS) || !(up < c.radius)) {
      for (const m of this.sets) m.visible = false;
      this.stones.visible = false;
      this.count.tiles = 0;
      return;
    }
    camera.updateMatrixWorld();
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_pm);
    // the reach on the ground where the distance in three dimensions meets the radius
    const reach = Math.sqrt(c.radius * c.radius - up * up);
    const i0 = Math.floor((e.x - reach) / TILE), i1 = Math.floor((e.x + reach) / TILE);
    const j0 = Math.floor((e.z - reach) / TILE), j1 = Math.floor((e.z + reach) / TILE);
    // The ground at every corner of the tiles in reach. A tile lies inside one cell of the terrain,
    // so its highest and lowest points stand at its corners, and its ball holds only the ground
    // it covers and what stands on it.
    const w = i1 - i0 + 2, d = j1 - j0 + 2;
    if (this._corner.length < w * d) this._corner = new Float32Array(w * d);
    const H = this._corner;
    for (let j = 0; j < d; j++) {
      for (let i = 0; i < w; i++) H[j * w + i] = this.heightAt((i0 + i) * TILE, (j0 + j) * TILE);
    }
    const half = TILE / 2, list = this._list;
    list.length = 0;
    for (let j = j0; j <= j1; j++) {
      const z0 = j * TILE, dz = Math.max(z0 - e.z, 0, e.z - z0 - TILE);
      for (let i = i0; i <= i1; i++) {
        const x0 = i * TILE, dx = Math.max(x0 - e.x, 0, e.x - x0 - TILE);
        const dist = Math.hypot(dx, dz);
        if (dist > reach) continue;
        const q = (j - j0) * w + (i - i0);
        const a = H[q], b = H[q + 1], cc = H[q + w], dd = H[q + w + 1];
        const lo = Math.min(a, b, cc, dd), hi = Math.max(a, b, cc, dd) + REACH_UP;
        _ball.center.set(x0 + half, (lo + hi) / 2, z0 + half);
        _ball.radius = Math.hypot(half * Math.SQRT2 + REACH_UP, (hi - lo) / 2);
        if (!_fr.intersectsSphere(_ball)) continue;
        // the distance rounds down, so a set is never too small for the tile
        list.push(Math.floor(dist * 10) * 1e6 + (j - j0) * 1e3 + (i - i0));
      }
    }
    // Nearest first. The key packs the distance in tenths of a metre and the tile, so the sort
    // needs no objects.
    list.sort((a, b) => a - b);
    const arrays = this.sets.map((m) => m.geometry.attributes.aTile.array);
    const counts = this.count.sets;
    counts[0] = counts[1] = counts[2] = 0;
    const st = this.stones.geometry.attributes.aTile.array;
    let ns = 0;
    for (const key of list) {
      const dq = Math.floor(key / 1e6), rest = key - dq * 1e6, dist = dq / 10;
      const tj = Math.floor(rest / 1e3) + j0, ti = (rest % 1e3) + i0;
      if (arrays.length) {
        // the most blades the nearest point of the tile grows, and the smallest set that holds them
        const lod = 1 - (1 - THIN) * smoothstep(c.near, c.thin, dist);
        const k = lod > SETS[1] ? 0 : lod > SETS[2] + 1e-6 ? 1 : 2;
        const o = counts[k]++ * 2;
        arrays[k][o] = ti; arrays[k][o + 1] = tj;
      }
      if (dist < c.stoneRadius) { st[ns * 2] = ti; st[ns * 2 + 1] = tj; ns++; }
    }
    this.sets.forEach((m, k) => this._show(m, counts[k]));
    this._show(this.stones, ns);
    this.count.tiles = list.length;
    this.count.stones = ns;
  }

  _show(mesh, count) {
    if (!mesh) return;
    mesh.geometry.instanceCount = count;
    mesh.visible = count > 0;
    if (count > 0) {
      const a = mesh.geometry.attributes.aTile;
      a.clearUpdateRanges();
      a.addUpdateRange(0, count * 2);
      a.needsUpdate = true;
    }
  }

  dispose() {
    for (const m of [...this.sets, this.stones]) m.geometry.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of Object.values(this.textures)) t.dispose();
    this.group.clear();
  }
}
