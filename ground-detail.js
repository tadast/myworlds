// myworlds — the fine pattern of the ground: blades on the cover, ripples on the sand and the ash,
// faceted plates on the rock, and wind drifts on the snow.
//
// The terrain is a grid of 2 m facets, one colour per vertex. Close to the camera a facet fills a
// large part of the screen and reads as one flat swatch. This file adds the detail a facet cannot
// hold. It draws no geometry: it changes the colour of each pixel and bends the normal the light
// reads, so a ripple of 2 cm shows its lit side and its shaded side.
//
// The patterns are drawn once, at load, on the graphics card: one tile per surface in a stack of
// textures (a 2D texture array). A pixel of the ground then reads its tile once, or twice where
// two offsets of the grass blend, and does a few sums. The first version computed every pattern for
// every pixel, up to ten samples each, and drew a noise that repeated in plain squares.
//
// A tile repeats. On the cover the shader hides that the way Inigo Quilez describes in
// "Texture repetition": a slow noise picks one of eight offsets of the tile for each area of
// ground, and the pixel blends two neighbour offsets where the pick changes. Ripples and drifts
// repeat by nature, and a tile of rock is 8 m wide, so those take one sample and no offsets. The mipmaps of the stack fade every pattern once a
// pixel covers more ground than its detail, so the far ground never shimmers.
//
// A tile stores the slope of its height (R, G), its brightness (B), and a mask (A). The slope
// bends the normal directly. A bump taken from the screen derivatives of a height breaks into
// blocks of 2 by 2 pixels, and a slope blends and filters as a straight sum.
//
// The worker writes the biome of every vertex and the share of bare rock its slope gives it
// (generate.js, `surface`). The vertex shader turns the biome into the weights of four families:
// cover, loose ground, rock, and snow, and the rock share moves weight to the rock. The weights blend
// across a facet, so two biomes meet in a soft band and not along the edge of a triangle. The world
// type decides which family a biome takes: the grass of an ice world is frost, and the lowland of a
// lava world is ash, which reads the ash tile in place of the sand tile.
import * as THREE from 'three';

// The layers of the stack.
const COVER = 0, SAND = 1, ROCK = 2, SNOW = 3, ASH = 4, MACRO = 5, LAYERS = 6;
// metres of ground one tile covers, by layer. The macro tile is read at two scales of its own.
const TILE = [2.4, 4, 8, 12, 6];
const MACRO_BIG = 64;      // metres: the tile of the slow noise, whose features are about 16 m wide
const MACRO_PICK = 11;     // metres: the tile of the noise that picks the offset of a tile
const SLOPE_MAX = 2;       // the steepest slope a tile stores; 8 bits then step at 0.016
// The mean brightness of each tile, measured on the baked stack. The shader divides by it, so a
// patterned ground and a far, fully filtered ground keep the colour of the vertex.
const MEAN = [0.98, 1.0, 0.99, 1.0, 0.99];
const BAKE = { high: 512, low: 256 };   // texels on a side of one tile
// metres: the size of the detail of each tile. Once one pixel covers it, the tile reads as its
// mean, so the shader stops sampling it: the dabs of the cover, the ripples of the sand, the
// grain of the rock, the drifts of the snow, and the ripples and seams of the ash.
const DETAIL_SIZE = [0.25, 0.4, 1.0, 1.5, 0.5];

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

// Per style: how far a dry patch of cover turns its hue (radians), and the colour of the lichen on
// the rock, or null for none.
const DRY_HUE = { 0: -0.6, 1: -0.1, 2: 0, 3: 0, 4: 0.5 };
const LICHEN = { 0: '#a9ae63', 1: '#b3864f', 2: null, 3: null, 4: null };

// ---------------------------------------------------------------- the bake
// One full-screen pass per layer. Every function here wraps at the edge of the tile: the lattices
// of the noise and of the cells repeat with a whole number of cells, and the ripples take a whole
// number of waves, so the tile repeats without a seam.
const BAKE_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const tileOf = (layer) => TILE[layer].toFixed(2);

const BAKE_FRAG = `
precision highp float;
uniform int uLayer;
uniform float uSize;
varying vec2 vUv;
#define PI2 6.28318531

// the hashes of Dave Hoskins, "Hash without Sine", which hold on every GPU
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// gradient noise on a lattice that repeats every P cells; about -0.7 to 0.7
float pnoise(vec2 x, float P) {
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(mod(i, P)) * 2.0 - 1.0, f);
  float b = dot(hash22(mod(i + vec2(1.0, 0.0), P)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash22(mod(i + vec2(0.0, 1.0), P)) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hash22(mod(i + vec2(1.0, 1.0), P)) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// octaves of it over the tile, the first with P cells across; about -0.5 to 0.5
float pfbm(vec2 uv, float P, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int k = 0; k < 5; k++) {
    if (k >= oct) break;
    s += a * pnoise(uv * P, P);
    n += a;
    P *= 2.0;
    a *= 0.5;
  }
  return s / n;
}
// Worley cells, N across the tile. x: the distance to the point of the cell, y: the distance to the
// nearest wall (the two passes of Inigo Quilez), z: a random value of the cell. toPoint is the
// vector from the pixel to the point, in cells.
vec3 pvoronoi(vec2 uv, float N, float jit, out vec2 toPoint) {
  vec2 x = uv * N, n = floor(x), f = fract(x);
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + 0.5 + jit * (hash22(mod(n + g, N)) - 0.5) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float bd = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 r = g + 0.5 + jit * (hash22(mod(n + g, N)) - 0.5) - f;
    if (dot(mr - r, mr - r) > 1e-5) bd = min(bd, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  toPoint = mr;
  return vec3(sqrt(md), bd, hash12(mod(n + mg, N) + 0.5));
}
vec2 warp(vec2 uv, float P, float amp) {
  return uv + vec2(pfbm(uv, P, 2), pfbm(uv + 0.37, P, 2)) * amp;
}

// Each layer writes the height in metres, the brightness (1 is the colour of the vertex), and the
// mask. In the tile, v runs along the wind; the shader turns the tile to the wind of the site.

// A stroke of the cover: a tapered, soft-edged dash from its base along d, len long and w wide at
// the base. Returns the cover of the pixel, 0 to 1, and writes how far along the stroke it is.
float stroke(vec2 r, vec2 d, float len, float w, out float along) {
  float t = dot(r, d);
  along = t / len;
  if (t <= 0.0 || t >= len) return 0.0;
  float s = abs(r.x * d.y - r.y * d.x);
  // round at the base, a blunt point at the tip, and a soft rim
  float ww = w * sqrt(max(1.0 - along * along * 0.8, 0.0)) * smoothstep(0.0, 0.12, along) + 1e-4;
  return 1.0 - smoothstep(0.35, 1.0, s / ww);
}

// Cover: painted dabs 14 to 30 cm long in four tones, lying roughly with the wind, one on top of
// the other; about one dab in eight is dry, and the mask carries it. Fine blades 3 to 7 cm long
// add a colour grain under the eye. The relief stays low, because grass is soft and a low sun
// turns any real relief into crumpled paper: a dab stands under 2 mm proud of the next.
void cover(vec2 uv, out float h, out float a, out float m) {
  // the dabs, 14 cells across the tile, two to a cell
  const float N = 14.0;
  vec2 x = uv * N, n = floor(x), f = fract(x);
  float top = -1.0, tone = 1.0, dry = 0.0, cov = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 c = mod(n + g, N);
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      vec2 r0 = hash22(c * 1.31 + fk * 17.7);
      vec2 hh = hash22(c * 2.17 + fk * 5.3);
      float ang = 1.5708 + (hh.x - 0.5) * 1.6;
      vec2 d = vec2(cos(ang), sin(ang));
      float along;
      float cv = stroke(f - (g + r0), d, 0.9 + 0.9 * hh.y, 0.3 + 0.16 * hh.x, along);
      float pri = hash12(c * 0.37 + fk * 3.1);
      if (cv > 0.0 && pri > top) {
        top = pri; cov = cv;
        float tsel = hash12(c * 5.7 + fk * 9.9);
        tone = tsel < 0.25 ? 0.88 : tsel < 0.55 ? 0.97 : tsel < 0.85 ? 1.06 : 1.14;
        tone *= 0.96 + 0.08 * along;
        dry = step(0.88, hash12(c * 3.3 + fk * 1.7));
      }
    }
  }
  // the fine blades, 40 cells across, colour only
  const float M = 40.0;
  vec2 y = uv * M, ny = floor(y), fy = fract(y);
  float blade = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 c = mod(ny + g, M);
    vec2 r0 = hash22(c * 0.91 + 3.3);
    vec2 hh = hash22(c * 1.73 + 8.1);
    float ang = 1.5708 + (hh.x - 0.5) * 1.2;
    float along;
    blade = max(blade, stroke(fy - (g + r0), vec2(cos(ang), sin(ang)), 0.5 + 0.6 * hh.y, 0.16, along) * (0.5 + 0.5 * along));
  }
  float clump = pfbm(uv, 5.0, 3);
  a = mix(1.0, tone, cov) * (1.0 + (blade - 0.3) * 0.12) * (1.0 + clump * 0.3);
  h = cov * 0.0016 * (top + 0.5) + clump * 0.012;
  m = dry * cov;
}

// Sand: ripples 40 cm apart that meander and die out in patches, and a grain.
void sand(vec2 uv, out float h, out float a, out float m) {
  float ph = uv.y * 10.0 * PI2 + pfbm(uv, 3.0, 3) * 7.0 + pfbm(uv + 0.5, 6.0, 2) * 2.0;
  float r = sin(ph) - 0.3 * sin(2.0 * ph);
  float amp = smoothstep(-0.15, 0.2, pfbm(uv + 0.21, 2.0, 2));
  float grain = pnoise(uv * 160.0, 160.0);
  h = r * 0.018 * (0.25 + 0.75 * amp) + grain * 0.002;
  a = 1.0 + r * 0.03 * amp + grain * 0.12 + pfbm(uv + 0.7, 12.0, 3) * 0.1;
  m = 0.0;
}

// Rock: slabs about 2 m wide, each tilted a little its own way and bevelled at its rim, so the
// height stays whole across a wall and no line of the slab breaks into steps. A soft grain lies
// over the slabs, and broken cracks split some of the walls. The mask holds lichen.
void rock(vec2 uv, out float h, out float a, out float m) {
  vec2 tp;
  vec3 v = pvoronoi(warp(uv, 4.0, 0.1), 4.0, 0.85, tp);
  vec2 tilt = (hash22(vec2(v.z * 97.0, v.z * 13.0)) - 0.5) * 0.24;
  float bevel = smoothstep(0.0, 0.14, v.y);
  float grain = pfbm(uv + 0.5, 16.0, 4);
  float open = smoothstep(-0.1, 0.1, pfbm(uv + 0.77, 6.0, 2));
  float crack = (1.0 - smoothstep(0.004, 0.012, v.y)) * open;
  h = (-dot(tp, tilt) * 2.0 + 0.008) * bevel + grain * 0.04;
  float sp = pnoise(uv * 256.0, 256.0);
  a = (0.92 + 0.16 * fract(v.z * 13.7)) * (1.0 + grain * 0.25 + sp * 0.12) * (1.0 - crack * 0.45);
  m = smoothstep(0.08, 0.22, pfbm(uv + 0.13, 10.0, 3)) * bevel;
}

// Snow: drifts with sharp crests 1.7 m apart, and soft lumps. The mask holds the hollows, which
// take a blue shade.
void snow(vec2 uv, out float h, out float a, out float m) {
  float ph = uv.y * 7.0 * PI2 + pfbm(uv, 2.0, 3) * 7.0;
  float crest = 1.0 - abs(sin(ph));
  crest *= crest;
  float amp = smoothstep(-0.3, 0.15, pfbm(uv + 0.5, 2.0, 2));
  float lump = pfbm(uv + 0.25, 12.0, 3);
  h = crest * 0.11 * amp + lump * 0.06;
  a = 1.0 + lump * 0.04;
  m = clamp((1.0 - crest) * amp - lump * 1.5, 0.0, 1.0);
}

// Ash: low ripples 43 cm apart over a crust cracked into plates 3 m wide. The mask holds the
// crack lines, which glow where the slow noise of the shader runs hot.
void ash(vec2 uv, out float h, out float a, out float m) {
  float ph = uv.y * 14.0 * PI2 + pfbm(uv, 3.0, 3) * 8.0;
  float r = sin(ph) - 0.3 * sin(2.0 * ph);
  float amp = smoothstep(-0.2, 0.25, pfbm(uv + 0.41, 2.0, 2));
  vec2 tp;
  vec3 v = pvoronoi(warp(uv, 5.0, 0.18), 2.0, 0.9, tp);
  // most of the walls crack, so a seam runs for metres and rarely stops; a short, deep seam read
  // as a worm
  float open = smoothstep(-0.3, -0.1, pfbm(uv + 0.63, 3.0, 2));
  float crack = (1.0 - smoothstep(0.003, 0.008, v.y)) * open;
  float groove = (1.0 - smoothstep(0.0, 0.05, v.y)) * open;
  float cinder = pnoise(uv * 200.0, 200.0);
  h = r * 0.018 * (0.3 + 0.7 * amp) - groove * groove * 0.012 + cinder * 0.003;
  a = (1.0 + r * 0.03 * amp + cinder * 0.15) * (1.0 - crack * 0.55);
  m = crack;
}

void surface(vec2 uv, out float h, out float a, out float m) {
  if (uLayer == ${COVER}) cover(uv, h, a, m);
  else if (uLayer == ${SAND}) sand(uv, h, a, m);
  else if (uLayer == ${ROCK}) rock(uv, h, a, m);
  else if (uLayer == ${SNOW}) snow(uv, h, a, m);
  else ash(uv, h, a, m);
}

void main() {
  vec2 uv = vUv;
  if (uLayer == ${MACRO}) {
    gl_FragColor = vec4(clamp(0.5 + pfbm(uv, 4.0, 5) * 1.6, 0.0, 1.0),
      clamp(0.5 + pfbm(uv + 0.5, 4.0, 4) * 1.6, 0.0, 1.0), 0.5, 1.0);
    return;
  }
  float h, a, m, hx0, hx1, hy0, hy1, t0, t1;
  surface(uv, h, a, m);
  float e = 1.0 / uSize;
  surface(uv + vec2(e, 0.0), hx1, t0, t1);
  surface(uv - vec2(e, 0.0), hx0, t0, t1);
  surface(uv + vec2(0.0, e), hy1, t0, t1);
  surface(uv - vec2(0.0, e), hy0, t0, t1);
  float T = uLayer == ${COVER} ? ${tileOf(COVER)} : uLayer == ${SAND} ? ${tileOf(SAND)}
    : uLayer == ${ROCK} ? ${tileOf(ROCK)} : uLayer == ${SNOW} ? ${tileOf(SNOW)} : ${tileOf(ASH)};
  vec2 s = vec2(hx1 - hx0, hy1 - hy0) / (2.0 * e * T);
  gl_FragColor = vec4(clamp(s / ${SLOPE_MAX.toFixed(1)}, -1.0, 1.0) * 0.5 + 0.5,
    clamp(a * 0.5, 0.0, 1.0), clamp(m, 0.0, 1.0));
}
`;

const bakes = new WeakMap();   // one stack per renderer and size

// The stack, baked on first use and kept for the life of the renderer. A bake takes a few
// milliseconds of the graphics card.
export function bakeDetail(renderer, size) {
  let per = bakes.get(renderer);
  if (!per) { per = {}; bakes.set(renderer, per); }
  if (per[size]) return per[size];
  const rt = new THREE.WebGLArrayRenderTarget(size, size, LAYERS, { depthBuffer: false });
  // The array target makes its own texture and drops the options, so they go on here, before the
  // first bind allocates the storage and its mip levels.
  const tex = rt.texture;
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const mat = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG,
    uniforms: { uLayer: { value: 0 }, uSize: { value: size } },
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  const prevAuto = renderer.autoClear;
  renderer.autoClear = false;
  for (let layer = 0; layer < LAYERS; layer++) {
    mat.uniforms.uLayer.value = layer;
    renderer.setRenderTarget(rt, layer);
    renderer.render(scene, cam);
  }
  renderer.setRenderTarget(prev);
  renderer.autoClear = prevAuto;
  mat.dispose();
  quad.geometry.dispose();
  per[size] = rt;
  return rt;
}

// What the 3D ground cover of ground-cover.js shares with the pattern: the stack, the macro layer,
// the dry hue, and the weights of the four families for every surface byte. A blade then grows
// where the pattern paints cover, and it takes the dry patches the pattern paints.
export function detailShared(renderer, type, low = false) {
  const style = STYLE[type] ?? 0;
  const fam = FAMILIES[style];
  // the vertex shader above, run once for each of the 256 bytes
  const families = new Float32Array(256 * 4);
  for (let s = 0; s < 256; s++) {
    const f = fam[Math.min(s & 15, 10)];
    const rock = f[0] + f[1] + f[3] > 0.001 ? (s >> 4) / 15 : 0;
    for (let k = 0; k < 4; k++) families[s * 4 + k] = f[k] * (1 - rock) + (k === 2 ? rock : 0);
  }
  return {
    texture: bakeDetail(renderer, low ? BAKE.low : BAKE.high).texture,
    macro: MACRO, macroBig: MACRO_BIG, dryHue: DRY_HUE[style], families,
  };
}

// ---------------------------------------------------------------- the terrain shader
const glVec4 = (w) => `vec4(${w.map((x) => x.toFixed(2)).join(', ')})`;
const f4 = (x) => x.toFixed(4);
const f1 = (x) => x.toFixed(1);

const VERTEX_PARS = (style) => `
attribute float aSurface;
uniform sampler2DArray uDetLayers;
varying vec4 vSurf;
varying vec3 vDetW;
varying float vDetBig;
varying float vDetPick;
const vec4 DET_FAMILY[11] = vec4[11](${FAMILIES[style].map(glVec4).join(', ')});
`;

// Per vertex: the families, the bare rock the worker found on the slope (packSurface() in
// generate.js), and the two slow noises. A test of the slope in every pixel cost the frame more
// than the tiles did. The noises have features of 16 m and 3 m, and a vertex stands every 2 m
// (4 m on the LOW tier), so the facets carry them as well as the pixels would.
const VERTEX_MAIN = `
vDetW = (modelMatrix * vec4(transformed, 1.0)).xyz;
float detS = aSurface + 0.5;
vec4 detFam = DET_FAMILY[clamp(int(mod(detS, 16.0)), 0, 10)];
float detRock = floor(detS / 16.0) / 15.0 * step(0.001, detFam.x + detFam.y + detFam.w);
vSurf = mix(detFam, vec4(0.0, 0.0, 1.0, 0.0), detRock);
vDetBig = textureLod(uDetLayers, vec3(mat2(0.8, 0.6, -0.6, 0.8) * vDetW.xz / ${f1(MACRO_BIG)}, ${MACRO}.0), 0.0).r;
vDetPick = textureLod(uDetLayers, vec3(vDetW.xz / ${f1(MACRO_PICK)}, ${MACRO}.0), 0.0).g * 8.0;
`;

const FRAGMENT_PARS = (style) => {
  const loose = style === 3 ? ASH : SAND;
  return `
uniform sampler2DArray uDetLayers;
uniform float uDetOn;
uniform float uDetBump;
uniform vec2 uDetWind;
uniform float uDetDryHue;
uniform vec3 uDetLichen;
varying vec4 vSurf;
varying vec3 vDetW;
varying float vDetBig;
varying float vDetPick;

// 1 over the metres of a tile, and the mean brightness, for cover, loose ground, rock, and snow
const vec4 DET_TI = vec4(${f4(1 / TILE[COVER])}, ${f4(1 / TILE[loose])}, ${f4(1 / TILE[ROCK])}, ${f4(1 / TILE[SNOW])});
const vec4 DET_MEAN = vec4(${f4(MEAN[COVER])}, ${f4(MEAN[loose])}, ${f4(MEAN[ROCK])}, ${f4(MEAN[SNOW])});
// metres: the size of the detail of each tile, past which a pixel sees only its mean
const vec4 DET_SIZE = vec4(${f4(DETAIL_SIZE[COVER])}, ${f4(DETAIL_SIZE[loose])}, ${f4(DETAIL_SIZE[ROCK])}, ${f4(DETAIL_SIZE[SNOW])});

// One tile at uv, with the anti-repetition of Inigo Quilez: k picks one of eight offsets of the
// tile, and the pixel blends two neighbour offsets over the step of k. The blend leans on the
// brightness of the two, so the seam follows the pattern and does not read as a smear.
vec4 detTile(float layer, vec2 uv, vec2 gx, vec2 gy, float k) {
  #ifdef DETAIL_LOW
  return textureGrad(uDetLayers, vec3(uv, layer), gx, gy);
  #else
  float i = floor(k), f = fract(k);
  // outside the band of the blend one offset is enough; the lean of the blend moves the band by
  // at most 0.09, so the cut stands clear of it
  if (f < 0.34) return textureGrad(uDetLayers, vec3(uv + sin(vec2(3.0, 7.0) * i), layer), gx, gy);
  if (f > 0.66) return textureGrad(uDetLayers, vec3(uv + sin(vec2(3.0, 7.0) * (i + 1.0)), layer), gx, gy);
  vec2 oa = sin(vec2(3.0, 7.0) * i), ob = sin(vec2(3.0, 7.0) * (i + 1.0));
  vec4 a = textureGrad(uDetLayers, vec3(uv + oa, layer), gx, gy);
  vec4 b = textureGrad(uDetLayers, vec3(uv + ob, layer), gx, gy);
  return mix(a, b, smoothstep(0.44, 0.56, f + (b.b - a.b) * 0.3));
  #endif
}
// One tile at uv, with no offsets. The ripples and the drifts take this: an offset cuts a ripple
// where two offsets meet, and a field of ripples repeats by nature, so its tile does not show. The
// rock takes it too, because its tile is wider than most of the rock a view holds.
vec4 detTile1(float layer, vec2 uv, vec2 gx, vec2 gy) {
  return textureGrad(uDetLayers, vec3(uv, layer), gx, gy);
}
// 1 while the detail of a tile, s metres across, still shows, and 0 once one pixel covers s. A
// tile at 0 has filtered down to its mean, so the shader skips the samples and takes the mean.
float detFade(float s, float fp) { return 1.0 - smoothstep(0.35 * s, s, fp); }
vec2 detSlope(vec4 t) { return (t.rg * 2.0 - 1.0) * ${f1(SLOPE_MAX)}; }
float detLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// a hue turn about the grey axis, which keeps the lightness
vec3 detHue(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
// a colour with the lightness of the base, so a patch changes its hue and keeps its light
vec3 detTint(vec3 base, vec3 t) { return t * (detLum(base) / max(detLum(t), 1e-3)); }
`;
};

// After the vertex colour: the tile of each family, blended by the weights. The derivatives are
// taken here, before any branch, because a derivative inside a branch that differs between two
// neighbour pixels is undefined. The samples inside the branches read them through textureGrad.
const FRAGMENT_COLOR = (style) => {
  const loose = style === 3 ? ASH : SAND;
  return `
vec3 detGrad = vec3(0.0);
vec3 detEmit = vec3(0.0);
{
  vec3 wp = vDetW;
  vec2 p = wp.xz;
  vec3 wdx = dFdx(wp), wdy = dFdy(wp);
  vec2 gx = wdx.xz, gy = wdy.xz;
  float fp = max(length(wdx), length(wdy));   // metres one pixel covers
  vec4 w = vSurf;
  float wsum = w.x + w.y + w.z + w.w;
  if (wsum > 0.001 && uDetOn > 0.0) {
    w /= wsum;
    vec3 base = diffuseColor.rgb;
    // the slow noise of the vertex, for the dry patches and the light
    float big = vDetBig;
    vec4 fade = vec4(detFade(DET_SIZE.x, fp), detFade(DET_SIZE.y, fp), detFade(DET_SIZE.z, fp), detFade(DET_SIZE.w, fp));
    float pick = vDetPick;
    // the frame of the wind: u across it, v along it
    vec2 wd = uDetWind, wn = vec2(-wd.y, wd.x);
    vec2 q = vec2(dot(p, wn), dot(p, wd));
    vec2 qx = vec2(dot(gx, wn), dot(gx, wd)), qy = vec2(dot(gy, wn), dot(gy, wd));
    vec3 col = vec3(0.0);
    vec2 grad = vec2(0.0);
    // a texel of a tile at its mean: no slope, the mean brightness, no mask
    if (w.x > 0.01) {
      vec4 t = vec4(0.5, 0.5, DET_MEAN.x * 0.5, 0.0);
      if (fade.x > 0.0) t = mix(t, detTile(${COVER}.0, q * DET_TI.x, qx * DET_TI.x, qy * DET_TI.x, pick), fade.x);
      vec2 s = detSlope(t);
      grad += w.x * (wn * s.x + wd * s.y);
      vec3 c = base * (t.b * 2.0 / DET_MEAN.x);
      // dry patches tens of metres wide, and single dry dabs
      c = mix(c, detHue(c, uDetDryHue) * 1.06, max(smoothstep(0.55, 0.8, big) * 0.55, t.a * 0.5));
      col += w.x * c;
    }
    if (w.y > 0.01) {
      vec4 t = vec4(0.5, 0.5, DET_MEAN.y * 0.5, 0.0);
      if (fade.y > 0.0) t = mix(t, detTile1(${loose}.0, q * DET_TI.y, qx * DET_TI.y, qy * DET_TI.y), fade.y);
      vec2 s = detSlope(t);
      grad += w.y * (wn * s.x + wd * s.y);
      col += w.y * base * (t.b * 2.0 / DET_MEAN.y) * (1.0 + (big - 0.5) * 0.2);
      #if DETAIL_STYLE == 3
      detEmit += w.y * vec3(1.0, 0.32, 0.06) * t.a * smoothstep(0.55, 0.8, big) * 0.9;
      #endif
    }
    if (w.z > 0.01) {
      // turned, so the plates never line up with the grid of the terrain
      const mat2 RR = mat2(0.92, 0.39, -0.39, 0.92);
      vec4 t = vec4(0.5, 0.5, DET_MEAN.z * 0.5, 0.0);
      if (fade.z > 0.0) t = mix(t, detTile1(${ROCK}.0, RR * p * DET_TI.z, RR * gx * DET_TI.z, RR * gy * DET_TI.z), fade.z);
      grad += w.z * (detSlope(t) * RR);
      vec3 c = base * (t.b * 2.0 / DET_MEAN.z);
      #ifdef DETAIL_LICHEN
      c = mix(c, detTint(c, uDetLichen), t.a * 0.6);
      #endif
      col += w.z * c;
    }
    if (w.w > 0.01) {
      vec4 t = vec4(0.5, 0.5, DET_MEAN.w * 0.5, 0.0);
      if (fade.w > 0.0) t = mix(t, detTile1(${SNOW}.0, q * DET_TI.w, qx * DET_TI.w, qy * DET_TI.w), fade.w);
      vec2 s = detSlope(t);
      grad += w.w * (wn * s.x + wd * s.y);
      vec3 c = base * (t.b * 2.0 / DET_MEAN.w) * (1.0 + (big - 0.5) * 0.08);
      col += w.w * mix(c, c * vec3(0.84, 0.91, 1.05), t.a * 0.6);
    }
    col *= 1.0 + (big - 0.5) * 0.12;
    diffuseColor.rgb = mix(base, col, uDetOn);
    detGrad = vec3(grad.x, 0.0, grad.y) * uDetOn;
    detEmit *= uDetOn;
  }
}
`;
};

// After the flat normal: tilt it by the slope of the tile. For a height field over the facet the
// normal is the facet normal less the part of the slope that lies in the facet.
const FRAGMENT_NORMAL = `
{
  vec3 gv = mat3(viewMatrix) * detGrad * uDetBump;
  normal = normalize(normal - (gv - dot(gv, normal) * normal));
}
`;

// Add the pattern to the terrain material. The material must already carry vertex colours and
// flatShading. `renderer` bakes the stack, `type` is the world type, `wind` the angle the wind
// blows at, in radians, and `low` reads each tile once and bakes it at half the size, for the LOW
// tier. Chains to the onBeforeCompile the material already holds.
export function applyDetail(material, { renderer, type, wind = 0, low = false }) {
  const style = STYLE[type] ?? 0;
  const layers = bakeDetail(renderer, low ? BAKE.low : BAKE.high).texture;
  const lichen = LICHEN[style];
  const uniforms = {
    uDetLayers: { value: layers },
    uDetOn: { value: 1 },
    uDetBump: { value: 1 },
    uDetWind: { value: new THREE.Vector2(Math.cos(wind), Math.sin(wind)) },
    uDetDryHue: { value: DRY_HUE[style] },
    uDetLichen: { value: new THREE.Color(lichen || '#ffffff') },
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
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS(style)}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOR(style)}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAGMENT_NORMAL}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += detEmit;');
  };
  const key = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
  material.customProgramCacheKey = () => `${key}|detail2-${style}-${low ? 'low' : 'high'}`;
  material.userData.detail = uniforms;
  return uniforms;
}
