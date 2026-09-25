// myworlds — the fine pattern of the ground: dry patches and a leafy speckle on the cover, ripples
// on the sand, blocks and cracks on the rock, and wind drifts on the snow.
//
// The terrain is a grid of 2 m facets, one colour per vertex. Close to the camera a facet fills a
// large part of the screen, and it reads as one flat swatch. This file adds the detail a facet
// cannot hold. It draws no geometry. It changes the colour of each pixel and bends the normal the
// light reads, so a ripple of 2 cm shows its lit side and its shaded side.
//
// The worker writes the biome of every vertex (generate.js, `surface`). The vertex shader turns the
// biome into the weights of four families: cover, loose ground, rock, and snow. The weights blend
// across a facet, so two biomes meet in a soft band and not along the edge of a triangle. The world
// type decides which family a biome takes: the grass of an ice world is frost, and the grass of a
// lava world is ash.
//
// The patterns read one small texture of noise that this file builds at load, so the page loads no
// image. The texture carries mipmaps, and every feature also fades out once a pixel covers more
// ground than about half of its width. A ripple 40 cm apart therefore shows near the camera and
// goes out further away, and the ground never shimmers.
import * as THREE from 'three';

const TEX = 256;           // texels on a side of the noise tile
const CELLS = 16;          // the Worley cells on a side of the tile

// The world types, as the number the shader branches on at compile time.
const STYLE = { terran: 0, ocean: 0, desert: 1, ice: 2, lava: 3, exotic: 4 };

// The weights of the four families (cover, loose, rock, snow) for each surface value. The value
// is the biome plus one, so row 0 is a vertex with no surface. The biomes are the ones of
// BIOME_NAME in generate.js: ocean, shallows, beach, tundra, snow, rock, forest, grass, dry, desert.
const FAMILIES = {
  // cover grows on the green biomes. Tundra is moss over stone, and dry ground is half bare.
  0: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0.6, 0, 0.4, 0], [0, 0, 0, 1],
    [0, 0, 1, 0], [1, 0, 0, 0], [1, 0, 0, 0], [0.5, 0.5, 0, 0], [0, 1, 0, 0]],
  // the ice world paints its lowlands in frost, so every soft biome takes the snow family
  2: [[0, 0, 0, 0], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0.4, 0.6], [0, 0, 0, 1],
    [0, 0, 1, 0], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1]],
  // the lava world grows nothing: its lowlands are ash, and its peaks are pumice
  3: [[0, 0, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 0.6, 0.4, 0], [0, 1, 0, 0],
    [0, 0, 1, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
};
FAMILIES[1] = FAMILIES[0];
FAMILIES[4] = FAMILIES[0];

// Per style: how far a dry patch of cover turns its hue (radians), the colour of the lichen on the
// rock, or null for none.
const DRY_HUE = { 0: -0.6, 1: -0.1, 2: 0, 3: 0, 4: 0.5 };
const LICHEN = { 0: '#a9ae63', 1: '#b3864f', 2: null, 3: null, 4: null };

let texture = null;

// A seeded stream for the tile, so every load builds the same one.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The tile. R holds fractal value noise, G the distance to the nearest Worley point, B the distance
// to the edge between two Worley cells, and A a random value for each cell. All four wrap, so the
// tile repeats without a seam.
function buildTexture() {
  const rng = mulberry32(0x5eed);
  const data = new Uint8Array(TEX * TEX * 4);

  // R: four octaves of value noise, each on a lattice that divides the tile
  const fbm = new Float32Array(TEX * TEX);
  let amp = 1;
  for (const L of [8, 16, 32, 64]) {
    const lat = new Float32Array(L * L);
    for (let i = 0; i < lat.length; i++) lat[i] = rng();
    const s = TEX / L;
    for (let y = 0; y < TEX; y++) {
      const fy = y / s, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % L) * L, r1 = ((y0 + 1) % L) * L;
      for (let x = 0; x < TEX; x++) {
        const fx = x / s, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % L, c1 = (x0 + 1) % L;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx;
        const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        fbm[y * TEX + x] += (a + (b - a) * sy) * amp;
      }
    }
    amp *= 0.5;
  }
  let lo = Infinity, hi = -Infinity;
  for (const v of fbm) { if (v < lo) lo = v; if (v > hi) hi = v; }

  // G, B, A: one jittered point per Worley cell
  const px = new Float32Array(CELLS * CELLS), py = new Float32Array(CELLS * CELLS);
  const id = new Float32Array(CELLS * CELLS);
  for (let i = 0; i < CELLS * CELLS; i++) {
    px[i] = 0.1 + 0.8 * rng(); py[i] = 0.1 + 0.8 * rng(); id[i] = rng();
  }
  const cs = TEX / CELLS;
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const u = (x + 0.5) / cs, v = (y + 0.5) / cs;
      const cx = Math.floor(u), cy = Math.floor(v);
      let f1 = 9, f2 = 9, near = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const gx = cx + dx, gy = cy + dy;
          const k = ((gy + CELLS) % CELLS) * CELLS + ((gx + CELLS) % CELLS);
          const ex = gx + px[k] - u, ey = gy + py[k] - v;
          const d = Math.sqrt(ex * ex + ey * ey);
          if (d < f1) { f2 = f1; f1 = d; near = k; } else if (d < f2) f2 = d;
        }
      }
      const o = (y * TEX + x) * 4;
      data[o] = Math.round((fbm[y * TEX + x] - lo) / (hi - lo) * 255);
      data[o + 1] = Math.round(Math.min(f1, 1) * 255);
      data[o + 2] = Math.round(Math.min(f2 - f1, 1) * 255);
      data[o + 3] = Math.round(id[near] * 255);
    }
  }
  const tex = new THREE.DataTexture(data, TEX, TEX, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const glVec4 = (w) => `vec4(${w.map((x) => x.toFixed(2)).join(', ')})`;

const VERTEX_PARS = (style) => `
attribute float aSurface;
varying vec4 vSurf;
varying vec3 vDetW;
const vec4 DET_FAMILY[11] = vec4[11](${FAMILIES[style].map(glVec4).join(', ')});
`;

const VERTEX_MAIN = `
vDetW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vSurf = DET_FAMILY[clamp(int(aSurface + 0.5), 0, 10)];
`;

// The patterns. Every function takes the ground position p in metres, the same position turned
// into the frame of the wind (q: x along the wind, y across it), the screen derivatives of p, and
// fp, the metres one pixel covers. Each returns the colour and writes the height in metres.
//
// A layer samples only while its fade is above zero. Most of the pixels of a view near the ground
// lie tens of metres out, where every fine layer has faded, so this skips most of the samples. The
// branches are safe for the samples, because every sample reads its derivatives through
// textureGrad from values taken before the first branch.
const FRAGMENT_PARS = `
uniform sampler2D uDetTex;
uniform float uDetOn;
uniform float uDetBump;
uniform vec2 uDetWind;
uniform float uDetDryHue;
uniform vec3 uDetLichen;
uniform vec3 uDetSpot;
varying vec4 vSurf;
varying vec3 vDetW;

vec4 detTex(vec2 p, vec2 period, vec2 gx, vec2 gy) {
  return textureGrad(uDetTex, p / period, gx / period, gy / period);
}
// 1 while a feature s metres wide still spans a few pixels, 0 once one pixel covers half of it
float detFade(float s, float fp) { return 1.0 - smoothstep(0.15 * s, 0.5 * s, fp); }
// fractal noise with features of about s metres
float detNoise(vec2 p, float s, vec2 gx, vec2 gy) { return detTex(p, vec2(8.0 * s), gx, gy).r; }
// Worley cells about c metres wide, turned by a, so two scales never line up
vec4 detCell(vec2 p, float c, float a, vec2 gx, vec2 gy) {
  mat2 r = mat2(cos(a), sin(a), -sin(a), cos(a));
  return detTex(r * p, vec2(${CELLS}.0 * c), r * gx, r * gy);
}
// The same cells with their walls bent by noise, so no two cells share a shape. Each cell also
// takes a size of its own from its random value, through the caller.
vec4 detCellWarp(vec2 p, float c, float a, vec2 gx, vec2 gy) {
  vec2 wv = vec2(detTex(p, vec2(8.0 * c), gx, gy).r, detTex(p + 31.7, vec2(8.0 * c), gx, gy).r) - 0.5;
  return detCell(p + wv * c * 0.9, c, a, gx, gy);
}
// A crack along the wall between two cells. Only the walls where the noise lets them open crack,
// so the network runs in broken lines and not in a closed mesh. The colour takes a thin line and
// the height takes a wider groove, because a bump on a line one pixel wide breaks into steps.
vec2 detCrack(vec2 p, vec4 k, float c, float fp, vec2 gx, vec2 gy) {
  float open = smoothstep(0.38, 0.58, detTex(p + 97.0, vec2(12.0 * c), gx, gy).r);
  float line = (1.0 - smoothstep(0.012, 0.05, k.b)) * open * detFade(0.08 * c, fp);
  float groove = (1.0 - smoothstep(0.0, 0.16, k.b)) * open * detFade(0.3 * c, fp);
  return vec2(line, groove);
}
float detLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// a hue turn about the grey axis, which keeps the lightness
vec3 detHue(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
// a colour with the lightness of the base, so a patch changes its hue and keeps its light
vec3 detTint(vec3 base, vec3 t) { return t * (detLum(base) / max(detLum(t), 1e-3)); }

vec3 detCover(vec2 p, vec2 q, vec2 gx, vec2 gy, float fp, float big, vec3 base, out float h) {
  vec3 c = base;
  h = 0.0;
  // dry patches tens of metres wide, which still read from the ceiling
  c = mix(c, detHue(c, uDetDryHue) * 1.06, smoothstep(0.5, 0.78, big) * 0.55);
  // lighter and darker swathes a few metres wide
  float fs = detFade(3.0, fp);
  if (fs > 0.0) c *= 1.0 + (detNoise(p + 60.0, 3.0, gx, gy) - 0.5) * 0.22 * fs;
  // soft lumps about 0.6 m wide
  float fl = detFade(0.6, fp);
  if (fl > 0.0) {
    float lump = detNoise(p - 23.0, 0.6, gx, gy);
    c *= 1.0 + (lump - 0.5) * 0.16 * fl;
    h = lump * 0.03 * fl;
  }
  #ifndef DETAIL_LOW
  // leaves: a fine speckle about 6 cm across
  float fb = detFade(0.06, fp);
  if (fb > 0.0) {
    float lf = detNoise(p + 91.0, 0.06, gx, gy);
    c *= 1.0 + (lf - 0.5) * 0.36 * fb;
    h += lf * 0.012 * fb;
  }
  #endif
  #if DETAIL_STYLE == 4
  // rosettes of another colour, from 0.3 to 1.5 m wide, with ragged rims
  float fr = detFade(0.4, fp);
  if (fr > 0.0) {
    vec4 s = detCellWarp(p, 2.6, 2.1, gx, gy);
    float rag = (detNoise(p + 5.0, 0.12, gx, gy) - 0.5) * 0.12;
    float r0 = 0.08 + 0.22 * fract(s.a * 7.13);
    float spot = (1.0 - smoothstep(r0 - 0.02, r0 + 0.03, s.g + rag)) * step(0.62, s.a) * fr;
    float rim = spot * smoothstep(r0 - 0.08, r0, s.g + rag);
    c = mix(c, detTint(c, uDetSpot) * (1.05 - rim * 0.25), spot * 0.65);
    h += spot * 0.04;
  }
  #endif
  return c;
}

vec3 detLoose(vec2 p, vec2 q, vec2 gx, vec2 gy, float fp, float big, vec3 base, out float h, inout vec3 emit) {
  vec3 c = base * (1.0 + (big - 0.5) * 0.2);
  h = 0.0;
  // ripples across the wind, 42 cm apart, that meander and die out in patches
  const float LAM = 0.42;
  float fr = detFade(LAM, fp);
  if (fr > 0.0) {
    float warp = detNoise(p + 17.0, 1.6, gx, gy) - 0.5;
    float ph = q.x / LAM * 6.2831 + warp * 9.0;
    float amp = smoothstep(0.3, 0.55, detNoise(p - 71.0, 7.0, gx, gy)) * fr;
    float r = sin(ph) - 0.3 * sin(2.0 * ph);
    h = r * 0.022 * amp;
    c *= 1.0 + r * 0.05 * amp;
  }
  #ifndef DETAIL_LOW
  // grains
  float fg = detFade(0.03, fp);
  if (fg > 0.0) c *= 1.0 + (detNoise(p + 29.0, 0.03, gx, gy) - 0.5) * 0.3 * fg;
  // pebbles
  float fb = detFade(0.1, fp);
  if (fb > 0.0) {
    vec4 pb = detCell(p, 0.3, 1.9, gx, gy);
    float peb = (1.0 - smoothstep(0.16, 0.28, pb.g)) * step(0.78, pb.a) * fb;
    c = mix(c, c * 0.72, peb);
    h += peb * 0.03;
  }
  #endif
  #if DETAIL_STYLE == 3
  // a crust of ash, cracked into plates 3 m wide, and a few of the seams still glow. The groove is
  // the widest part of a crack, so it decides where the crack is worth a sample.
  if (detFade(0.3 * 3.2, fp) > 0.0) {
    vec4 k = detCellWarp(p, 3.2, 0.4, gx, gy);
    vec2 cr = detCrack(p, k, 3.2, fp, gx, gy);
    c *= 1.0 - cr.x * 0.6;
    h -= cr.y * 0.04;
    if (cr.x > 0.0) {
      float heat = smoothstep(0.6, 0.85, detNoise(p + 211.0, 11.0, gx, gy));
      emit += vec3(1.0, 0.32, 0.06) * cr.x * heat * 0.8;
    }
  }
  #endif
  return c;
}

vec3 detRock(vec2 p, vec3 wp, vec2 gx, vec2 gy, float fp, vec3 base, out float h) {
  vec3 c = base;
  h = 0.0;
  float edge = 0.0;
  // blocks about 1.6 m wide, each a shade of its own, split by broken cracks
  float fpl = detFade(1.6, fp);
  if (fpl > 0.0) {
    vec4 pl = detCellWarp(p, 1.6, 0.9, gx, gy);
    vec2 cr = detCrack(p, pl, 1.6, fp, gx, gy);
    edge = cr.x;
    c *= (1.0 + (pl.a - 0.5) * 0.22 * fpl) * (1.0 - cr.x * 0.45);
    h = -cr.y * 0.05;
  }
  // rough relief
  float fro = detFade(0.5, fp);
  if (fro > 0.0) {
    float ro = detNoise(p + 44.0, 0.5, gx, gy);
    c *= 1.0 + (ro - 0.5) * 0.18 * fro;
    h += ro * 0.07 * fro;
  }
  #ifndef DETAIL_LOW
  // strata along the height, and a fine speckle
  float fst = detFade(0.55, fp);
  if (fst > 0.0) c *= 1.0 + sin(wp.y / 0.55 * 6.2831 + (detNoise(p, 3.0, gx, gy) - 0.5) * 5.0) * 0.07 * fst;
  float fsp = detFade(0.04, fp);
  if (fsp > 0.0) c *= 1.0 + (detNoise(p + 7.0, 0.04, gx, gy) - 0.5) * 0.3 * fsp;
  #endif
  #ifdef DETAIL_LICHEN
  float fli = detFade(0.15, fp);
  if (fli > 0.0) {
    float li = smoothstep(0.6, 0.72, detNoise(p + 300.0, 0.35, gx, gy)) * (1.0 - edge) * fli;
    c = mix(c, detTint(c, uDetLichen), li * 0.6);
  }
  #endif
  return c;
}

vec3 detSnow(vec2 p, vec2 q, vec2 gx, vec2 gy, float fp, float big, vec3 base, out float h) {
  vec3 c = base * (1.0 + (big - 0.5) * 0.08);
  h = 0.0;
  float hollow = 0.0;
  // drifts: crests 1.6 m apart that the wind sharpens, bent and broken by noise
  const float LAM = 1.6;
  float fr = detFade(LAM, fp);
  if (fr > 0.0) {
    float warp = detNoise(p + 3.0, 3.5, gx, gy) - 0.5;
    float ph = q.x / LAM * 6.2831 + warp * 10.0;
    float amp = smoothstep(0.25, 0.6, detNoise(p - 13.0, 9.0, gx, gy)) * fr;
    float crest = 1.0 - abs(sin(ph));
    crest = crest * crest;
    h = crest * 0.07 * amp;
    hollow = (1.0 - crest) * amp * 0.6;
  }
  // soft lumps 1 m wide
  float fl = detFade(1.0, fp);
  if (fl > 0.0) {
    float lump = detNoise(p + 71.0, 1.0, gx, gy);
    h += lump * 0.05 * fl;
    hollow += (0.5 - lump) * fl * 0.8;
  }
  // the hollows hold a blue shade
  c = mix(c, c * vec3(0.84, 0.91, 1.05), clamp(hollow, 0.0, 1.0) * 0.6);
  #ifndef DETAIL_LOW
  float fg = detFade(0.025, fp);
  if (fg > 0.0) c *= 1.0 + (detNoise(p + 13.0, 0.025, gx, gy) - 0.5) * 0.14 * fg;
  #endif
  return c;
}
`;

// After the vertex colour: the pattern of each family, blended by the weights. The derivatives are
// taken here, before any branch, because a derivative inside a branch that differs between two
// neighbour pixels is undefined. The samples inside the branches read them through textureGrad.
const FRAGMENT_COLOR = `
float detH = 0.0;
vec3 detEmit = vec3(0.0);
{
  vec3 wp = vDetW;
  vec2 p = wp.xz;
  vec3 wdx = dFdx(wp), wdy = dFdy(wp);
  vec2 gx = wdx.xz, gy = wdy.xz;
  float fp = max(length(wdx), length(wdy));
  vec2 wd = uDetWind, wn = vec2(-wd.y, wd.x);
  vec2 q = vec2(dot(p, wd), dot(p, wn));
  vec4 w = vSurf;
  // a steep facet is bare rock, as the worker paints it (SLOPE_ROCK in generate.js)
  float up = abs(normalize(cross(wdx, wdy)).y);
  float rk = (1.0 - smoothstep(0.66, 0.88, up)) * step(0.001, w.x + w.y + w.w);
  w = mix(w, vec4(0.0, 0.0, 1.0, 0.0), rk);
  float wsum = w.x + w.y + w.z + w.w;
  if (wsum > 0.001 && uDetOn > 0.0) {
    vec3 base = diffuseColor.rgb;
    float big = detNoise(p + 400.0, 16.0, gx, gy);
    vec3 col = vec3(0.0);
    float h = 0.0, hh;
    if (w.x > 0.01) { col += w.x * detCover(p, q, gx, gy, fp, big, base, hh); h += w.x * hh; }
    if (w.y > 0.01) { col += w.y * detLoose(p, q, gx, gy, fp, big, base, hh, detEmit); h += w.y * hh; }
    if (w.z > 0.01) { col += w.z * detRock(p, wp, gx, gy, fp, base, hh); h += w.z * hh; }
    if (w.w > 0.01) { col += w.w * detSnow(p, q, gx, gy, fp, big, base, hh); h += w.w * hh; }
    float used = w.x * step(0.01, w.x) + w.y * step(0.01, w.y) + w.z * step(0.01, w.z) + w.w * step(0.01, w.w);
    col /= max(used, 1e-3);
    h /= max(used, 1e-3);
    float k = uDetOn * min(wsum, 1.0);
    diffuseColor.rgb = mix(base, col, k);
    detH = h * k;
    detEmit *= k;
  }
}
`;

// After the flat normal: bend it by the slope of the pattern height. This is the bump of
// perturbNormalArb in three.js, without the normalised sigmas, so the height stays in metres and a
// ripple of 2 cm over 21 cm tilts the light by the slope it really has.
const FRAGMENT_NORMAL = `
{
  vec3 sp = -vViewPosition;
  vec3 sx = dFdx(sp), sy = dFdy(sp);
  vec2 dh = vec2(dFdx(detH), dFdy(detH)) * uDetBump;
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  normal = normalize(abs(det) * normal - grad);
}
`;

// Add the pattern to the terrain material. The material must already carry vertex colours and
// flatShading. `type` is the world type, `palette` the palette of the world, `wind` the angle the
// wind blows at, in radians, and `low` drops the finest layers for the LOW tier. Chains to the
// onBeforeCompile the material already holds.
export function applyDetail(material, { type, palette, wind = 0, low = false, anisotropy = 1 }) {
  const style = STYLE[type] ?? 0;
  if (!texture) texture = buildTexture();
  texture.anisotropy = Math.max(texture.anisotropy, anisotropy);
  const lichen = LICHEN[style];
  const spot = new THREE.Color(palette?.flora?.canopy2 || '#ff66cc');
  const uniforms = {
    uDetTex: { value: texture },
    uDetOn: { value: 1 },
    uDetBump: { value: 1 },
    uDetWind: { value: new THREE.Vector2(Math.cos(wind), Math.sin(wind)) },
    uDetDryHue: { value: DRY_HUE[style] },
    uDetLichen: { value: new THREE.Color(lichen || '#ffffff') },
    uDetSpot: { value: spot },
  };
  material.defines = { ...(material.defines || {}), DETAIL_STYLE: style };
  if (low) material.defines.DETAIL_LOW = '';
  if (lichen) material.defines.DETAIL_LICHEN = '';
  const first = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    if (first) first.call(material, sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS(style)}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_MAIN}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOR}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAGMENT_NORMAL}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += detEmit;');
  };
  const key = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
  material.customProgramCacheKey = () => `${key}|detail-${style}-${low ? 'low' : 'high'}`;
  material.userData.detail = uniforms;
  return uniforms;
}
