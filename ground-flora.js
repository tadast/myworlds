// myworlds — the plants of the ground patch, near as meshes and far as cards.
//
// The worker places the plants and writes them in units. This module draws them at two levels of
// detail. A plant closer than ground.lod.distance is a full mesh. A plant beyond it is a card: one
// vertical quad that carries a small picture of the same mesh, baked once at patch load.
//
// Every frame the walk() step reads the distance of every plant and writes it to one of the two
// instanced meshes. The matrices are built once at load, so the walk only copies them.
//
// Issue 21 added three things a reader sees at once. Every plant now carries its own lean, its own
// width, and its own tint, so no two plants of one kind read the same. Every kind carries a style:
// how far the wind bends it, how far it breathes, how much it glows, and how far out it must stay
// a mesh, because a card of 64 pixels cannot carry a body that fills the screen. And the ground
// itself carries grass: GrassField grows a lattice of tufts around the camera from the cover mask
// of the worker, far past the plant cap, because a tuft is only useful within about 80 units.
import * as THREE from 'three';
import { floraGeometry, FLORA, FLORA_STYLE } from './flora-geometry.js';

// The two levels of detail cross over a band, and inside it both draw. The mesh keeps a share of
// the pixels of a plant and the card takes the rest, by one 4 by 4 dither on the screen, so the two
// never cover the same pixel and never leave a hole. The swap used to happen in one frame, with a
// band of ±5% so a plant could not flicker; a card and a mesh differ most when the camera looks
// down, and the reader saw every swap as a plant that turned from flat to solid.
const BLEND = 0.12;          // ±12% around the swap distance
const CARD_ALPHA = 0.4;      // the alpha test of the card. No blending, so the card writes depth.
const CUT_FADE = 0.2;        // the share of the cut distance a card shrinks to nothing over
// A card holds the plant seen from CARD_GRID by CARD_GRID directions over the upper half of the
// sphere, one tile each in two textures. See billboard(). An odd grid holds the view straight down.
const CARD_GRID = 5;
const CARD_PAD = 1.03;       // the frame of a view against the box of the plant as the view sees it
// pixels: the widest tile a kind may take. A card holds two textures of CARD_GRID squared tiles,
// 6 bytes a pixel, so a kind takes 1.9 MB at 112 and 0.6 MB at 64.
const CARD_MAX = { high: 112, low: 64 };
// Units a plant keeps outside the four side planes of the view before the walk drops it. The ball
// of the plant already carries its own body, so this is only a margin. See update().
const EDGE_SLACK = 2;
// A plant outside the frame can still lay a shadow inside it, so the walk tests the ground where
// the shadow of the plant falls as well. The offset of that ground runs as 1 / sunDir.y, which a
// sun on the horizon takes to infinity, so it stops at this many plant heights. The shadow box of
// the sun is 200 m wide, and 8 heights carries the tallest plant past the edge of that box, so a
// shadow the cap cuts off is a shadow the sun never draws.
const SHADOW_REACH = 8;
const TINT_HUE = 0.16;       // how far one plant may lean from the colour of its kind
const TINT_LIT = 0.22;       // how far one plant may lean from the brightness of its kind

// The grass lattice. A tuft is about one unit wide, so it only reads within about 80 units, and a
// field that wide holds far more tufts than the whole plant cap.
//
// The fade runs in the vertex shader on the distance from the eye to the tuft, every frame. It used
// to be baked into the scale of a tuft when the lattice was built, and the lattice is only built
// once the camera has moved GRASS_STEP. A tuft in the band at the edge then changed its size by up
// to half in one frame, at every rebuild, so the edge of the field breathed. The distance is also
// the distance in three dimensions, so a camera that climbs sees the field shrink toward the ground
// under it, and a camera that comes down sees the grass rise from the ground nearest to it. The
// field used to swell in over all of its width at once, at 60 to 110 units of height.
//
// A tuft also takes the colour of the ground under it as it goes out, before it shrinks. A tuft on
// a world where the grass and the ground differ in hue used to arrive as a spot of a new colour.
const GRASS_NEAR = 0.5;      // the share of the radius where a tuft starts to shrink
const GRASS_HUE = [0.3, 0.85];   // the shares of the radius where the colour turns to the ground
const GRASS_STEP = 7;        // units: the camera moves this far before the lattice is rebuilt

// The mark. A tap on a plant lays a ring on the ground around it, the way a tap on an animal lays
// one under the animal. Issue 24. The numbers match ground-fauna.js, so the two marks read alike.
const PICK_TOL = 34;         // pixels: how far off the body a tap may land and still find it
const RING_BAND = 0.14;      // the width of the band, as a share of its radius
const RING_SIZE = 1.5;       // the radius of the ring against the width of the plant
const RING_MIN = 0.6;        // units: a ring never falls under this, so a tuft still shows one
const RING_LIFT = 0.05;      // units: the ring sits this far over the ground, clear of z-fighting

const _size = new THREE.Vector2();   // scratch for the view size the card floor reads
// scratch for the four side planes of the view, which the walk tests every plant against
const _pmat = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _pv = new THREE.Vector3(), _pt = new THREE.Vector3(), _pw = new THREE.Vector3();
const _up2 = new THREE.Vector3(), _fwd2 = new THREE.Vector3(), _rgt2 = new THREE.Vector3();
const _pos2 = new THREE.Vector3(), _mat2 = new THREE.Matrix4();
const _camF = new THREE.Vector3();   // scratch for the way the camera points, which the pick reads
const _vd = new THREE.Vector3(), _vr = new THREE.Vector3(), _vu = new THREE.Vector3();   // one view of a card
const _clear = new THREE.Color();    // scratch for the clear colour of a normal tile
const HALF_PI = Math.PI / 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// the small integer hash the worker and the terrain both use, for the spin of one plant
function hash1(i) {
  i = Math.imul(i ^ (i >>> 16), 2246822507);
  i = Math.imul(i ^ (i >>> 13), 3266489909);
  return ((i ^ (i >>> 16)) >>> 0) / 4294967296;
}

// the same hash over a lattice cell, so a tuft keeps its place while the field scrolls under it
function hash2(i, j) {
  let h = (Math.imul(i, 374761393) ^ Math.imul(j, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// One instance matrix, from the source array at o into the destination array at d.
function copy16(src, o, dst, d) {
  dst[d] = src[o]; dst[d + 1] = src[o + 1]; dst[d + 2] = src[o + 2]; dst[d + 3] = src[o + 3];
  dst[d + 4] = src[o + 4]; dst[d + 5] = src[o + 5]; dst[d + 6] = src[o + 6]; dst[d + 7] = src[o + 7];
  dst[d + 8] = src[o + 8]; dst[d + 9] = src[o + 9]; dst[d + 10] = src[o + 10]; dst[d + 11] = src[o + 11];
  dst[d + 12] = src[o + 12]; dst[d + 13] = src[o + 13]; dst[d + 14] = src[o + 14]; dst[d + 15] = src[o + 15];
}

// The material of a plant. mergeGeos() returns a geometry that is not indexed and it computes the
// normals there, so every triangle already carries its own normal and the plant reads faceted
// without `flatShading`.
//
// `flatShading` must stay off. It makes three.js take the normal from the derivatives of the view
// position instead of the attribute, and a body only a few pixels wide gives derivatives near
// zero. The alien kinds carry parts that thin: a grass blade, a spindle whip, and a tendril under
// the colossus all turned black under derivative normals. Issue 21.
function floraMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false });
}

// The plants move. The wind bends a stalk about its own base, and a sac breathes in and out. Both
// run in the vertex shader on the geometry before the instance matrix, so both take the lean, the
// width, and the size of the instance for free.
//
// The normals hold their rest shape, because they come from the attribute. The bend is at most a
// tenth of the height of a plant and the breath is a seventh of its width, so the light on a body
// that moves is a little behind its shape and no reader can see it.
//
// The shadow pass runs the depth material, which carries none of this, so the shadow of a plant
// holds its rest shape too.
function animate(material, style) {
  const time = { value: 0 };
  const gate = { value: 1 };
  material.userData.time = time;
  material.userData.gate = gate;
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.uniforms.uGate = gate;
    sh.uniforms.uSway = { value: style.sway };
    sh.uniforms.uPulse = { value: style.pulse };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGate;\nuniform float uSway;\nuniform float uPulse;')
      .replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iAt = instanceMatrix[3].xyz;
        float ph = iAt.x * 0.11 + iAt.z * 0.17;
        // the bend grows with the square of the height, so the base holds still and the top moves
        float up = max(transformed.y, 0.0);
        float bend = up * up * 0.1 * uSway;
        transformed.x += bend * (sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 0.53 + ph * 2.3) * 0.4);
        transformed.z += bend * (cos(uTime * 1.27 + ph * 0.8) * 0.6 + cos(uTime * 0.41 + ph * 1.9) * 0.4);
        // the breath keeps the volume roughly even: wider is shorter
        float br = uPulse * 0.14 * sin(uTime * 1.05 + ph * 2.7);
        transformed.xz *= 1.0 + br;
        transformed.y *= 1.0 - br * 0.5;
        transformed *= uGate;
      #endif
      `);
  };
  material.customProgramCacheKey = () => 'flora-near';
  return material;
}

// The near material of one kind, built for a caller outside this file. flora-card.js gives the
// preview of a plant the same material the ground gives it, so the plant sways and breathes on the
// card exactly as it does on the patch. The shader only runs under USE_INSTANCING, so the caller
// has to draw with an InstancedMesh, as the ground does.
export function nearFloraMaterial(style) {
  return animate(floraMaterial(), style);
}

// The dither of the band. aFade is the share of the pixels a level keeps: the mesh keeps the pixels
// whose threshold stands under it, and the card keeps the rest, so the two always add up to one
// whole plant. A 4 by 4 Bayer matrix gives 16 steps.
const DITHER = `
float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
`;

// Put the dither of the band on a material that onBeforeCompile already changes. `card` picks the
// side: the mesh keeps the pixels under its fade, the card keeps the pixels over one minus its fade.
function fading(material, card) {
  const first = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (sh, r) => {
    if (first) first.call(material, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;' + DITHER)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n'
        + (card ? 'if (bayer4(gl_FragCoord.xy) < 1.0 - vFade) discard;' : 'if (bayer4(gl_FragCoord.xy) >= vFade) discard;'));
  };
  material.customProgramCacheKey = () => key + (card ? '-card-fade' : '-fade');
  return material;
}

// The shadow of a mesh fades with the mesh. The depth pass keeps the same share of the texels of
// the map, and the soft filter of the shadow reads a share of them as a lighter shadow.
function fadingDepth() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;' + DITHER)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (bayer4(gl_FragCoord.xy) >= vFade) discard;');
  };
  m.customProgramCacheKey = () => 'flora-depth-fade';
  return m;
}

// The card is an impostor: a picture of the plant from every direction it can be seen from. A
// card used to hold one picture of the side, and later one per height of the eye, and it turned
// to face the eye. Turning shows the same side of the plant from every bearing, so the plant turns
// with the reader. From the ground that is slow and it reads as a tree. From above it is not: the
// bearing of a plant under the camera sweeps through half a turn as the camera passes over it, and
// every crown under a camera that looks straight down spun in place.
//
// The bake draws the plant from CARD_GRID by CARD_GRID directions. The directions come from the
// hemi-octahedral map, which lays the upper half of the sphere on a square: the corners and edges
// of the square are the horizon, and its middle is straight down. On a grid of 5 that is 16
// bearings on the horizon, 8 at about 50 degrees, and one straight down. Each view frames the box
// of the plant as that view sees it, with its own right and up, and the shader builds the same
// frame for the same direction.
//
// The card is a rectangle about the middle of the plant that faces the eye, as wide and as tall
// as the box of the plant seen from the eye, so few of its pixels are empty. The shader finds the
// three views nearest the direction of the eye, in the frame of the plant, and weighs them by the
// place of that direction inside their triangle on the grid. For each view it carries the point of
// the card along the eye onto the picture plane of the view and reads the picture there, so the
// three pictures line up on the plant and the blend holds no double image of a trunk.
//
// The card takes the spin of its plant. The walk writes the turn about y into the instance matrix,
// so the directions are read in the frame of that one plant, and a card shows the side of the
// plant that its mesh shows. The mesh also leans and widens, and the card does not.
//
// The card holds no light. The bake draws two pictures per view: the colour of the plant, and the
// direction its surface faces, in the frame of the plant. The card is a Lambert material, and the
// shader hands it that direction, turned by the spin of the plant, in place of the normal of the
// flat rectangle. The sun and the sky of the ground then light the card as they light the mesh,
// from every side, at every hour, and for every spin. A card used to carry the light of the bake
// and to dim by the angle between the eye and the sun; from above that split the view in two, the
// plants on one side of the camera dark and on the other bright.
const CARD_SHADER = `
#define CARD_GRID ${CARD_GRID}.0
uniform vec3 uHalf;
// the hemi-octahedral map: a direction over the horizon to the unit square, and back
vec2 octUv(vec3 d) {
  vec2 p = d.xz / (abs(d.x) + abs(d.y) + abs(d.z));
  return vec2(p.x + p.y, p.x - p.y) * 0.5 + 0.5;
}
vec3 octDir(vec2 uv) {
  vec2 xy = uv * 2.0 - 1.0;
  vec2 p = vec2(xy.x + xy.y, xy.x - xy.y) * 0.5;
  return normalize(vec3(p.x, 1.0 - abs(p.x) - abs(p.y), p.y));
}
`;

// One view: the point q of the card, in the frame of the plant, carried along the eye e onto the
// picture plane of the view at the grid point c, as a place on that picture. The right and the up of
// the picture and the half size of its frame are the numbers viewFrame() and frameOf() build for
// the bake.
const CARD_VERTEX = `
vec4 cardView(vec2 c, vec3 q, vec3 e) {
  vec3 d = octDir(c / (CARD_GRID - 1.0));
  vec3 r = abs(d.y) > 0.9999 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), d));
  vec3 u = cross(d, r);
  vec2 ext = vec2(dot(abs(r), uHalf), dot(abs(u), uHalf));
  vec3 qk = q - e * (dot(q, d) / max(dot(e, d), 0.05));
  return vec4(vec2(dot(qk, r), dot(qk, u)) / (2.0 * ext) + 0.5, c);
}
`;

// The direction of a surface in two bytes, in the octahedral map of the whole sphere, and back.
const OCT_NORMAL = `
vec2 normalPack(vec3 n) {
  n /= abs(n.x) + abs(n.y) + abs(n.z);
  vec2 p = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  return p * 0.5 + 0.5;
}
vec3 normalUnpack(vec2 f) {
  f = f * 2.0 - 1.0;
  vec3 n = vec3(f, 1.0 - abs(f.x) - abs(f.y));
  float t = clamp(-n.z, 0.0, 1.0);
  n.xy += vec2(n.x >= 0.0 ? -t : t, n.y >= 0.0 ? -t : t);
  return normalize(n);
}
`;

function billboard(material, pivot, half, normals) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uPivot = { value: pivot };
    sh.uniforms.uHalf = { value: half };
    sh.uniforms.uNormals = { value: normals };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + CARD_SHADER + CARD_VERTEX
        + 'uniform vec3 uPivot;\n'
        + 'varying vec2 vTurn;\nvarying vec4 vView0;\nvarying vec4 vView1;\nvarying vec4 vView2;\nvarying vec3 vWeight;')
      .replace('#include <project_vertex>', `
      vec4 instOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float iScale = length(instanceMatrix[0].xyz);
      mat3 turn = mat3(instanceMatrix) / iScale;
      mat3 unturn = transpose(turn);
      vec3 pivot = (modelMatrix * instOrigin).xyz + turn * uPivot * iScale;
      vec3 toEye = cameraPosition - pivot;
      vec3 eye = normalize(toEye);
      // the rectangle faces the eye and frames the box of the plant as the eye sees it
      vec3 qr = abs(eye.y) > 0.9999 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), eye));
      vec3 qu = cross(eye, qr);
      vec3 rl = unturn * qr, ul = unturn * qu;
      vec2 local = transformed.xy * vec2(dot(abs(rl), uHalf), dot(abs(ul), uHalf));
      vec3 worldPos = pivot + (qr * local.x + qu * local.y) * iScale;
      vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      // the eye in the frame of the plant; an eye under the middle of the plant takes the horizon
      vec3 e = unturn * eye;
      e.y = max(e.y, 0.0);
      e = dot(e, e) > 1e-8 ? normalize(e) : vec3(0.0, 1.0, 0.0);
      vec2 g = octUv(e) * (CARD_GRID - 1.0);
      vec2 cell = clamp(floor(g), 0.0, CARD_GRID - 2.0);
      vec2 fr = g - cell;
      vec2 c0 = cell;
      vec3 w = vec3(1.0 - fr.x - fr.y, fr.x, fr.y);
      if (fr.x + fr.y > 1.0) { c0 = cell + 1.0; w = vec3(fr.x + fr.y - 1.0, 1.0 - fr.y, 1.0 - fr.x); }
      vec3 q = rl * local.x + ul * local.y;
      vView0 = cardView(c0, q, e);
      vView1 = cardView(cell + vec2(1.0, 0.0), q, e);
      vView2 = cardView(cell + vec2(0.0, 1.0), q, e);
      vWeight = w;
      vTurn = vec2(turn[0].x, -turn[0].z);
    `);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + CARD_SHADER + OCT_NORMAL + `
      uniform sampler2D uNormals;
      varying vec2 vTurn;
      varying vec4 vView0;
      varying vec4 vView1;
      varying vec4 vView2;
      varying vec3 vWeight;
      `)
      // One view: its place on the picture, or nothing outside the frame, because the texture
      // beside it holds the next view.
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>
      vec2 cardAt(vec4 t, float w) {
        if (w < 0.001 || t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return vec2(-1.0);
        return (t.zw + t.xy) / CARD_GRID;
      }
      vec4 cardColour(vec2 at) { return at.x < 0.0 ? vec4(0.0) : texture2D(map, at); }
      vec3 cardNormal(vec2 at) { return at.x < 0.0 ? vec3(0.0) : normalUnpack(texture2D(uNormals, at).xy); }
      `)
      // The three views, blended by their alpha, so a pixel that one view leaves empty does not
      // pull the colour of the others toward black. The normal takes the same weights, and it
      // turns from the frame of the plant into the frame of the eye.
      .replace('#include <map_fragment>', `
        vec2 at0 = cardAt(vView0, vWeight.x), at1 = cardAt(vView1, vWeight.y), at2 = cardAt(vView2, vWeight.z);
        vec4 a0 = cardColour(at0), a1 = cardColour(at1), a2 = cardColour(at2);
        vec3 wa = vWeight * vec3(a0.a, a1.a, a2.a);
        float alpha = wa.x + wa.y + wa.z;
        diffuseColor *= vec4((a0.rgb * wa.x + a1.rgb * wa.y + a2.rgb * wa.z) / max(alpha, 0.0001), alpha);
        vec3 nl = cardNormal(at0) * wa.x + cardNormal(at1) * wa.y + cardNormal(at2) * wa.z;
        nl = dot(nl, nl) > 1e-8 ? normalize(nl) : vec3(0.0, 1.0, 0.0);
        vec3 nw = vec3(vTurn.x * nl.x + vTurn.y * nl.z, nl.y, -vTurn.y * nl.x + vTurn.x * nl.z);
        vec3 cardN = normalize(mat3(viewMatrix) * nw);
      `)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = cardN;');
  };
  material.customProgramCacheKey = () => 'flora-card';
  return material;
}

// The direction of the view at the grid point (u, v), each in 0 to 1, as octDir() builds it.
function octDir(u, v, out) {
  const x = u * 2 - 1, y = v * 2 - 1;
  const px = (x + y) / 2, pz = (x - y) / 2;
  return out.set(px, 1 - Math.abs(px) - Math.abs(pz), pz).normalize();
}

// A direction in two numbers of 0 to 1, as normalPack() in OCT_NORMAL builds them.
function normalPack(n) {
  const l = Math.abs(n.x) + Math.abs(n.y) + Math.abs(n.z);
  let x = n.x / l, y = n.y / l;
  if (n.z < 0) {
    const ox = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1), oy = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1);
    x = ox; y = oy;
  }
  return [x * 0.5 + 0.5, y * 0.5 + 0.5];
}

// The right and the up of the picture of a view along d, as cardView() builds them.
function viewFrame(d, right, up) {
  if (Math.abs(d.y) > 0.9999) right.set(1, 0, 0);
  else right.set(0, 1, 0).cross(d).normalize();
  up.copy(d).cross(right);
}

// The half size of the frame of a view: the box of the plant, half as wide as `half`, seen along the
// right and the up of the view.
function frameOf(right, up, half) {
  return [
    Math.abs(right.x) * half.x + Math.abs(right.y) * half.y + Math.abs(right.z) * half.z,
    Math.abs(up.x) * half.x + Math.abs(up.y) * half.y + Math.abs(up.z) * half.z,
  ];
}

export class Flora {
  // flora: the worker's Float32Array of x y z, nx ny nz, size in units, kind.
  // sky: the Sky of the ground, for the sun colour and the sun direction the card bakes with.
  constructor({ renderer, flora, palette, tier, sky, lod, cut, variant = 0, camera, canvas }) {
    this.renderer = renderer;
    this.camera = camera || null;      // the pick projects with it; the walk takes its own camera
    this.canvas = canvas || null;      // the pick measures in the CSS pixels of this view
    this.palette = palette;
    this.marked = null;                // { kind, index } while a plant carries the ring
    this.ring = null;
    this.lod = lod;
    this.cut = cut || 900;             // units: past this a plant is deep inside the fog
    this.count = flora ? flora.length / 8 : 0;
    this.walkMs = 0;
    this.nearCount = 0;
    this.cardCount = 0;
    this.group = new THREE.Group();
    // Where the tip of a plant lays its shadow, per unit of plant height, as a step over the
    // ground. The frustum test of the walk reads it, so a caster outside the frame whose shadow
    // falls inside it still draws. ground.js writes `casts` from the shadow gate of the sun: with
    // the sun off nothing casts, and the walk then keeps only what the reader can see directly.
    const sd = sky ? sky.sunDir : null;
    const reach = sd ? Math.min(SHADOW_REACH, 1 / Math.max(Math.abs(sd.y), 1e-3)) : 0;
    this.shadowX = sd ? -sd.x * reach : 0;
    this.shadowZ = sd ? -sd.z * reach : 0;
    if (sd) this.setSun(sd);
    this.casts = !!tier.shadows;
    this.blend = BLEND;
    this.kinds = [];
    this.targets = [];
    this.materials = [];
    if (!this.count) return;

    // one bucket per kind, so each kind gets its own geometry, card, and pair of meshes
    const buckets = new Map();
    for (let i = 0; i < this.count; i++) {
      const k = flora[i * 8 + 7];
      let b = buckets.get(k);
      if (!b) { b = []; buckets.set(k, b); }
      b.push(i);
    }

    const up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), pos = new THREE.Vector3();
    const q = new THREE.Quaternion(), spin = new THREE.Quaternion(), tip = new THREE.Quaternion();
    const axis = new THREE.Vector3(), scale = new THREE.Vector3();
    const mat4 = new THREE.Matrix4();
    for (const [kind, list] of buckets) {
      const geo = floraGeometry(kind, palette.flora, variant);
      if (!geo) continue;
      const style = FLORA_STYLE[kind] || FLORA_STYLE[0];
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const height = Math.max(bb.max.y, 0.001);
      const width = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z), 0.001);

      // The terrain runs a Lambert material for the same reason: the reader cannot tell a full
      // reflection model from it on a rough surface, and Lambert is about a third cheaper.
      const nearMat = fading(animate(floraMaterial(), style), false);

      // The views frame the box of the plant, each as it sees it. See billboard(). `frame` is the
      // longest side of any frame against the height of the plant, and a tile takes that many more
      // pixels than the style asks for, so a unit of the plant holds at least as many pixels as the
      // one picture of the side did, up to CARD_MAX.
      const center = bb.getCenter(new THREE.Vector3());
      const half = bb.getSize(new THREE.Vector3()).multiplyScalar(CARD_PAD / 2);
      let longest = 0;
      for (let j = 0; j < CARD_GRID; j++) {
        for (let i = 0; i < CARD_GRID; i++) {
          viewFrame(octDir(i / (CARD_GRID - 1), j / (CARD_GRID - 1), _vd), _vr, _vu);
          longest = Math.max(longest, ...frameOf(_vr, _vu, half));
        }
      }
      const frame = (2 * longest) / height;
      const px = Math.min(tier.shadows ? CARD_MAX.high : CARD_MAX.low, Math.round(style.card * frame));
      const card = this._bakeCard(geo, center, half, px);
      // A kind that glows glows on both levels. The card is a Lambert material as the mesh is, so
      // the glow is the same number on both.
      for (const m of style.glow > 0 ? [nearMat, card.material] : []) {
        m.emissive = new THREE.Color(palette.flora.canopy);
        m.emissiveIntensity = style.glow;
      }
      // a unit square: the shader scales it to the frame of the views it blends
      const quad = new THREE.PlaneGeometry(2, 2);
      // The tint of a plant rides on instanceColor, and three.js only reads it into the fragment
      // when the material carries vertex colours. The card holds one picture, so its quad takes a
      // white colour attribute and the tint then multiplies the picture.
      quad.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 3));

      const n = list.length;
      const near = new THREE.InstancedMesh(geo, nearMat, n);
      const far = new THREE.InstancedMesh(quad, card.material, n);
      near.castShadow = !!tier.shadows;      // the near mesh casts a shadow on HIGH
      near.receiveShadow = !!tier.shadows;
      far.castShadow = false;                // a card never casts: it holds no real shape
      far.receiveShadow = false;
      // the walk rewrites the matrices every frame, so a bounding sphere is always one frame old
      near.frustumCulled = false;
      far.frustumCulled = false;
      near.count = 0;
      far.count = 0;
      near.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      near.instanceColor.setUsage(THREE.DynamicDrawUsage);
      far.instanceColor.setUsage(THREE.DynamicDrawUsage);
      // the share of the pixels each level keeps inside the band. See BLEND.
      const nearFade = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
      const cardFade = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
      nearFade.setUsage(THREE.DynamicDrawUsage);
      cardFade.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFade', nearFade);
      quad.setAttribute('aFade', cardFade);
      if (tier.shadows) near.customDepthMaterial = fadingDepth();

      // The near matrices, built once. A plant leans a little into the terrain normal; a boulder
      // leans the whole way, because a boulder lies on the ground and a tree grows up from it. On
      // top of that every plant takes a lean and a width of its own, from the style of its kind,
      // so a stand of one kind holds no two bodies of one shape.
      //
      // The card needs no matrix of its own: its slot holds a turn about y, one scale, and a
      // translation, and the walk writes only those eight numbers into the identity the
      // InstancedMesh starts with.
      const nearM = new Float32Array(n * 16);
      const at = new Float32Array(n * 3);       // the position of every plant, for the distance walk
      const cards = new Float32Array(n * 2);    // the scale of the card and the height of its base
      const turns = new Float32Array(n * 2);    // the cosine and the sine of the spin of the plant
      const tints = new Float32Array(n * 3);    // the tint of every plant, for both meshes
      const sz2 = new Float32Array(n);          // the square of the height, for the card-size floor
      const rad = new Float32Array(n);          // the radius of the body, for the frustum test
      const rock = kind === FLORA.BOULDER;
      // The radius of a ball at the base of a plant that holds the whole body, as a share of the
      // height of the plant. The frustum test of the walk reads it, so a plant whose base falls
      // outside the frame and whose crown falls inside it still draws. The lateral reach takes the
      // widest body the style allows, because the test must hold for every plant of the kind.
      const radK = Math.hypot(Math.max(Math.abs(bb.min.y), bb.max.y) / height,
        (width / height) * (1 + style.flat));
      for (let j = 0; j < n; j++) {
        const o = list[j] * 8;
        const units = flora[o + 6], s = units / height;
        const h0 = hash1(list[j]), h1 = hash1(list[j] * 7 + 13), h2 = hash1(list[j] * 31 + 5);
        const h3 = hash1(list[j] * 61 + 97);
        pos.set(flora[o], flora[o + 1], flora[o + 2]);
        normal.set(flora[o + 3], flora[o + 4], flora[o + 5]).normalize();
        if (!rock) normal.lerp(up, 0.7).normalize();
        q.setFromUnitVectors(up, normal);
        spin.setFromAxisAngle(up, h0 * Math.PI * 2);
        turns[j * 2] = Math.cos(h0 * Math.PI * 2); turns[j * 2 + 1] = Math.sin(h0 * Math.PI * 2);
        q.multiply(spin);
        // the lean of this one plant, about an axis of its own
        if (style.lean > 0) {
          const a = h1 * Math.PI * 2;
          axis.set(Math.cos(a), 0, Math.sin(a));
          tip.setFromAxisAngle(axis, (h2 - 0.5) * 2 * style.lean);
          q.premultiply(tip);
        }
        // the width of this one plant against its height, so a stand holds fat and thin bodies
        const wide = 1 + (h3 - 0.5) * 2 * style.flat;
        scale.set(s * wide, s, s * wide);
        mat4.compose(pos, q, scale);
        nearM.set(mat4.elements, j * 16);
        at[j * 3] = pos.x; at[j * 3 + 1] = pos.y; at[j * 3 + 2] = pos.z;
        // The card carries no rotation, so its scale is the length of its first column and the
        // vertex shader can read it there. The card sits a little into the ground, so a plant on
        // a slope does not float.
        cards[j * 2] = s; cards[j * 2 + 1] = pos.y - units * 0.02;
        sz2[j] = units * units;
        rad[j] = units * radK;
        // The tint. One plant leans warm and the next leans cool, and both lean light or dark, so
        // a hillside of one kind reads as many plants and not as one plant copied.
        const lit = 1 + (h1 - 0.5) * 2 * TINT_LIT;
        const warm = (h2 - 0.5) * 2 * TINT_HUE;
        tints[j * 3] = lit * (1 + warm);
        tints[j * 3 + 1] = lit * (1 - Math.abs(warm) * 0.35);
        tints[j * 3 + 2] = lit * (1 - warm);
      }

      this.kinds.push({
        kind, style, count: n, near, far, nearM, at, cards, turns, tints, sz2, rad, state: new Uint8Array(n),
        nearFade, cardFade,
        // the geometry of one plant of this kind, at one unit of instance scale. The pick puts the
        // top of a body from it, and the mark sizes its ring from it.
        height, wRatio: width / height,
        // the card: the side of its frame against the height of the plant, and its pixels a tile
        frame, px,
      });
      this.group.add(near);
      this.group.add(far);
      this.targets.push(...card.targets);
      this.materials.push(nearMat);
    }
  }

  // One card: the near mesh rendered once per view with an orthographic camera, into one tile of two
  // small targets each: the colour of the plant, and the direction of its surface in the frame of
  // the plant. No light takes part in the bake; the card is lit when it draws. A tall kind bakes at
  // more pixels, because the reader can stand under it and still see the card.
  _bakeCard(geo, center, half, px) {
    const renderer = this.renderer;
    const size = px * CARD_GRID;
    // No mipmaps: a mipmap averages the alpha of a thin trunk toward zero, and the far half of the
    // forest would then fade away. The card is small on the screen, so it stays sharp.
    const opts = {
      type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    };
    const colour = new THREE.WebGLRenderTarget(size, size, { ...opts, format: THREE.RGBAFormat });
    // The normals take the nearest texel: a face of a plant holds one direction, and a blend of two
    // texels across the fold of the octahedral map is a third direction that no face holds.
    const normals = new THREE.WebGLRenderTarget(size, size, {
      ...opts, format: THREE.RGFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });

    const mesh = new THREE.Mesh(geo);
    const scene = new THREE.Scene();
    scene.add(mesh);
    // The colour is the vertex colour and nothing else. The bake ran into a render target, so it
    // holds plain values, and the card goes through the same tone mapping as the mesh.
    const colourMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const normalMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vN;\nvoid main() { vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: OCT_NORMAL + 'varying vec3 vN;\nvoid main() { gl_FragColor = vec4(normalPack(normalize(vN)), 0.0, 1.0); }',
    });

    const reach = half.length();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, reach * 6);
    const d = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3();

    const prevTarget = renderer.getRenderTarget();
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (let j = 0; j < CARD_GRID; j++) {
      for (let i = 0; i < CARD_GRID; i++) {
        octDir(i / (CARD_GRID - 1), j / (CARD_GRID - 1), d);
        viewFrame(d, r, u);
        const [ex, ey] = frameOf(r, u, half);
        cam.left = -ex; cam.right = ex; cam.top = ey; cam.bottom = -ey;
        cam.updateProjectionMatrix();
        cam.position.copy(d).multiplyScalar(reach * 3).add(center);
        cam.up.copy(u);
        cam.lookAt(center);
        // The empty texels of a normal tile face the eye of that view, so a pixel at the edge of a
        // plant that reads past the plant still takes a direction the eye can see, and no dark rim.
        const [nx, ny] = normalPack(d);
        for (const [target, mat] of [[colour, colourMat], [normals, normalMat]]) {
          mesh.material = mat;
          if (target === normals) renderer.setClearColor(_clear.setRGB(nx, ny, 0, THREE.NoColorSpace), 1);
          else renderer.setClearColor(0x000000, 0);
          target.viewport.set(i * px, j * px, px, px);
          target.scissor.set(i * px, j * px, px, px);
          target.scissorTest = true;
          renderer.setRenderTarget(target);
          renderer.render(scene, cam);
        }
      }
    }
    colour.scissorTest = false;
    normals.scissorTest = false;
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    scene.clear();
    colourMat.dispose();
    normalMat.dispose();

    // The alpha test writes depth, so a card sorts with the terrain and needs no blending.
    const cardMat = fading(billboard(new THREE.MeshLambertMaterial({
      map: colour.texture, alphaTest: CARD_ALPHA, transparent: false,
      side: THREE.DoubleSide, fog: true, vertexColors: true,
    }), center.clone(), half.clone(), normals.texture), true);
    return { material: cardMat, targets: [colour, normals] };
  }

  // The sun of the hour. ground.js calls it while the sky turns. It writes the step the shadow of a
  // plant takes over the ground. The cards need nothing: the lights of the scene light them.
  setSun(sunDir) {
    const reach = Math.min(SHADOW_REACH, 1 / Math.max(Math.abs(sunDir.y), 1e-3));
    this.shadowX = -sunDir.x * reach;
    this.shadowZ = -sunDir.z * reach;
  }

  // The walk: every plant goes to the near mesh or to the card mesh by its distance to the
  // camera. Inside the band of BLEND it goes to both, and the dither of the two materials shares its
  // pixels between them, so a plant crosses from one level to the other over a distance and never
  // in one frame. A plant at the boundary cannot flicker, because a step back only moves the share
  // back by the same small amount. The LOD distance of a kind is the knob times the style
  // of the kind, so a colossus stays a mesh out to the fog and a tuft turns into a card at once.
  //
  // The walk also drops every plant outside the frame. The four side planes of the view cut the
  // ring around the camera down to the part the reader looks at, which is about a third of it.
  update(camera, t) {
    if (!this.count) return;
    const t0 = performance.now();
    for (let i = 0; i < this.materials.length; i++) this.materials[i].userData.time.value = t;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    let nearTotal = 0, cardTotal = 0;

    // The focal length of the view in pixels: a plant `size` units tall and `d` units away covers
    // `size * focal / d` pixels of the screen. A tile of its card holds `px` pixels over `frame`
    // plant heights, so past `size * frame * focal / px` the picture is no longer magnified and the
    // swap is invisible. Nearer than that a card is a blown-up picture, and the reader sees a flat
    // plant.
    // Issue 22: the LOD knob alone did that. On a 30 Hz display the knob fell to its floor of 40 m
    // and 8,018 of 8,126 plants stood as cards, some of them ten metres away.
    this.renderer.getSize(_size);
    const focal = _size.y / (2 * Math.tan(camera.fov * Math.PI / 360));

    // The four side planes of the view. A plant behind the reader used to go into the mesh all the
    // same: the walk read the distance and nothing else, so a camera that sees about a third of the
    // ring around it still carried the whole ring. The planes cut the rest.
    //
    // Every plane holds a normal and a constant, and nx*x + ny*y + nz*z + c is the distance of a
    // point to it, positive on the side the reader sees. A plant is out when its ball lies wholly
    // outside any one plane, so the test reads the four planes and stops at the first one that
    // clears the ball. The near plane and the far plane stay out of it: the cut distance above
    // holds the far end, and the reach of the ball holds the near end.
    //
    // The camera moves in ground.update() after the last frame drew, so its inverse is a frame old
    // until the renderer writes it again. One call brings it up to date, and a fast turn then
    // cannot drop a plant that has already come into the frame.
    camera.updateMatrixWorld();
    _pmat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pmat);
    const pl = _frustum.planes;
    const n0 = pl[0].normal, c0 = pl[0].constant, n1 = pl[1].normal, c1 = pl[1].constant;
    const n2 = pl[2].normal, c2 = pl[2].constant, n3 = pl[3].normal, c3 = pl[3].constant;
    const a0x = n0.x, a0y = n0.y, a0z = n0.z, a1x = n1.x, a1y = n1.y, a1z = n1.z;
    const a2x = n2.x, a2y = n2.y, a2z = n2.z, a3x = n3.x, a3y = n3.y, a3z = n3.z;
    // The shadow of a plant runs from its base to the step above. The walk tests the middle of that
    // run with a ball wide enough to hold the whole of it, which is one test instead of two and
    // never drops a shadow the reader can see.
    const casts = this.casts;
    const shX = this.shadowX * 0.5, shZ = this.shadowZ * 0.5;
    const shR = Math.hypot(shX, shZ);
    // the band as squared factors, because the walk compares squared distances
    const blend = this.blend;
    const IN_BAND = (1 - blend) * (1 - blend), OUT_BAND = (1 + blend) * (1 + blend);

    for (let b = 0; b < this.kinds.length; b++) {
      const k = this.kinds[b];
      const d = this.lod.distance * k.style.lod;
      const knob2 = d * d;
      const cardK = focal * k.frame / k.px, card2 = cardK * cardK;
      const cutK = this.cut * k.style.cut, cut2 = cutK * cutK;
      // A kind whose cut stands inside the fog would stop in clear air, so its cards shrink to
      // nothing over the last CUT_FADE of the cut. For the other kinds the band lies in solid fog.
      const fadeK = cutK * (1 - CUT_FADE), fade2 = fadeK * fadeK;
      const src = k.nearM, at = k.at, cards = k.cards, turns = k.turns, tints = k.tints, sz2 = k.sz2, state = k.state, n = k.count;
      const rad = k.rad;
      const nearArr = k.near.instanceMatrix.array, cardArr = k.far.instanceMatrix.array;
      const nearCol = k.near.instanceColor.array, cardCol = k.far.instanceColor.array;
      const nearF = k.nearFade.array, cardF = k.cardFade.array;
      let a = 0, c = 0;
      for (let i = 0; i < n; i++) {
        const p = i * 3;
        const px = at[p], py = at[p + 1], pz = at[p + 2];
        const dx = px - cx, dy = py - cy, dz = pz - cz;
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd > cut2) { state[i] = 2; continue; }
        // the swap distance of this one plant: the knob of its kind, or the reach of its card if
        // that stands further out
        const floor2 = sz2[i] * card2;
        const lim2 = knob2 > floor2 ? knob2 : floor2;
        const in2 = lim2 * IN_BAND, out2 = lim2 * OUT_BAND;
        // the share of the mesh: 1 inside the band, 0 outside it, and a smooth step across it
        let f = 1;
        if (dd >= out2) f = 0;
        else if (dd > in2) {
          const lim = Math.sqrt(lim2), u = (Math.sqrt(dd) - lim * (1 - blend)) / (lim * 2 * blend);
          f = 1 - u * u * (3 - 2 * u);
        }
        state[i] = f === 1 ? 0 : f === 0 ? 1 : 3;
        // Out of the frame, so out of the draw. A card casts nothing and a sun that is off casts
        // nothing, so both go. A mesh under a sun stays if its shadow is in the frame.
        const rd = rad[i], r = rd + EDGE_SLACK;
        let seen = true;
        if (a0x * px + a0y * py + a0z * pz + c0 < -r
          || a1x * px + a1y * py + a1z * pz + c1 < -r
          || a2x * px + a2y * py + a2z * pz + c2 < -r
          || a3x * px + a3y * py + a3z * pz + c3 < -r) {
          if (f === 0 || !casts) continue;
          const qx = px + shX * rd, qz = pz + shZ * rd, qr = r + shR * rd;
          if (a0x * qx + a0y * py + a0z * qz + c0 < -qr
            || a1x * qx + a1y * py + a1z * qz + c1 < -qr
            || a2x * qx + a2y * py + a2z * qz + c2 < -qr
            || a3x * qx + a3y * py + a3z * qz + c3 < -qr) continue;
          seen = false;
        }
        if (f > 0) {
          copy16(src, i * 16, nearArr, a);
          nearCol[a / 16 * 3] = tints[p]; nearCol[a / 16 * 3 + 1] = tints[p + 1]; nearCol[a / 16 * 3 + 2] = tints[p + 2];
          nearF[a / 16] = f;
          a += 16;
        }
        if (f < 1 && seen) {
          const q = i * 2;
          const sc = dd > fade2 ? cards[q] * (cutK - Math.sqrt(dd)) / (cutK - fadeK) : cards[q];
          const tc = turns[q] * sc, ts = turns[q + 1] * sc;
          cardArr[c] = tc; cardArr[c + 2] = -ts; cardArr[c + 5] = sc; cardArr[c + 8] = ts; cardArr[c + 10] = tc;
          cardArr[c + 12] = px; cardArr[c + 13] = cards[q + 1]; cardArr[c + 14] = pz;
          cardCol[c / 16 * 3] = tints[p]; cardCol[c / 16 * 3 + 1] = tints[p + 1]; cardCol[c / 16 * 3 + 2] = tints[p + 2];
          cardF[c / 16] = 1 - f;
          c += 16;
        }
      }
      k.near.count = a / 16;
      k.far.count = c / 16;
      nearTotal += a / 16;
      cardTotal += c / 16;
      // upload only the part the draw reads, not the whole buffer
      if (a > 0) {
        k.near.instanceMatrix.addUpdateRange(0, a); k.near.instanceMatrix.needsUpdate = true;
        k.near.instanceColor.addUpdateRange(0, a / 16 * 3); k.near.instanceColor.needsUpdate = true;
        k.nearFade.addUpdateRange(0, a / 16); k.nearFade.needsUpdate = true;
      }
      if (c > 0) {
        k.far.instanceMatrix.addUpdateRange(0, c); k.far.instanceMatrix.needsUpdate = true;
        k.far.instanceColor.addUpdateRange(0, c / 16 * 3); k.far.instanceColor.needsUpdate = true;
        k.cardFade.addUpdateRange(0, c / 16); k.cardFade.needsUpdate = true;
      }
    }
    this.nearCount = nearTotal;
    this.cardCount = cardTotal;
    this.walkMs = performance.now() - t0;
  }

  // ---------------------------------------------------------------- the pick and the mark
  // Issue 24. A tap on a plant marks it and the app offers its card, exactly as a tap on an animal
  // does. ground.js owns the tap and calls in through a seam; this file binds no listener.

  // The plant under a screen point, or null. The measure is the one ground-fauna.js uses: project
  // the base and the top of the body, then take the distance from the point to that segment. A
  // body that holds the point beats a body the point only grazes, and of two bodies that hold it
  // the nearer one wins.
  //
  // The reach of the pick is the reach of the draw. The walk marks every plant past the draw
  // distance, so the loop skips those and never projects a plant the reader cannot see. There is
  // no second, nearer limit: a colossus 900 units out is a landmark the reader looks at from the
  // moment the probe lands, and a tap on it has to find it.
  //
  // A plant the reader cannot see must take no tap. Two rules hold that, and both answer the same
  // failure: a plant beside the camera, out of the frame, whose base and top project to two wild
  // points far off the screen. Measured on `Pumpkin-215@41.25,99.84`, a plant 18 units to the side
  // and 6 units deep put its base at 2731,2364 and its top at 8730,3406 on a screen 1280 wide. The
  // segment between them ran 6,089 px, the body width read off that length came to 2,908 px, and
  // that circle covered the whole frame. The plant was the nearest body under every tap, so it won
  // every tap, and a reader who tapped the plant in front of them was carried off to one behind.
  //
  // So the body takes its width from its own size and its depth, `size * focal / depth`, which is
  // the rule the walk uses for the cards; and a body whose whole axis lies outside one edge of the
  // frame takes no tap at all.
  pickHit(px, py, tolerance = PICK_TOL) {
    const cam = this.camera;
    if (!cam || !this.count) return null;
    const el = this.canvas, w = el ? el.clientWidth : 1, h = el ? el.clientHeight : 1;
    // The focal length of the view in pixels, as update() reads it, and the way the camera points,
    // which turns a world point into a depth.
    const focal = h / (2 * Math.tan(cam.fov * Math.PI / 360));
    cam.getWorldDirection(_camF);
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    // the frame in normalised coordinates, with the tolerance of the tap on every edge
    const mx = 1 + 2 * tolerance / w, my = 1 + 2 * tolerance / h;
    this.group.updateWorldMatrix(true, false);
    const root = this.group.matrixWorld;
    let best = null, bestHit = false, bestKey = Infinity;
    for (const k of this.kinds) {
      const at = k.at, m = k.nearM, state = k.state;
      for (let i = 0; i < k.count; i++) {
        if (state[i] === 2) continue;           // culled by the walk: it is deep inside the fog
        const p = i * 3, o = i * 16;
        _pv.set(at[p], at[p + 1], at[p + 2]).applyMatrix4(root);
        _pw.copy(_pv);                          // the world point, before project() overwrites it
        const dist2 = _pw.distanceToSquared(cam.position);
        // How far down the view the plant stands. A plant level with the camera or behind it has
        // no width on the screen, so it goes before anything is projected.
        const depth = (_pw.x - cx) * _camF.x + (_pw.y - cy) * _camF.y + (_pw.z - cz) * _camF.z;
        if (depth <= cam.near) continue;
        // the top of the body: the up column of the instance matrix carries the lean and the
        // scale, so one multiply by the geometry height puts the point where the plant really ends
        _pt.set(at[p] + m[o + 4] * k.height, at[p + 1] + m[o + 5] * k.height, at[p + 2] + m[o + 6] * k.height)
          .applyMatrix4(root);
        _pv.project(cam); _pt.project(cam);
        if (_pv.z > 1 || _pv.z < -1 || _pt.z > 1 || _pt.z < -1) continue;
        if ((_pv.x < -mx && _pt.x < -mx) || (_pv.x > mx && _pt.x > mx)) continue;
        if ((_pv.y < -my && _pt.y < -my) || (_pv.y > my && _pt.y > my)) continue;
        const ax = (_pv.x + 1) / 2 * w, ay = (1 - _pv.y) / 2 * h;
        const bx = (_pt.x + 1) / 2 * w, by = (1 - _pt.y) / 2 * h;
        const lx = bx - ax, ly = by - ay, ll = lx * lx + ly * ly || 1;
        const u = clamp01(((px - ax) * lx + (py - ay) * ly) / ll);
        const gap = Math.hypot(ax + lx * u - px, ay + ly * u - py);
        // pixels: the body stands about this far off its axis. The height of this plant times the
        // width the kind holds per unit of height is its half width in units, which is the number
        // the mark sizes its ring from.
        const half = Math.sqrt(k.sz2[i]) * k.wRatio * focal / depth;
        const reach = Math.max(tolerance, half);
        if (gap > reach) continue;
        const hit = gap <= half;                // the point is on the body, not beside it
        const key = hit ? dist2 : gap / reach;
        if (best) {
          if (bestHit && !hit) continue;
          if (bestHit === hit && key >= bestKey) continue;
        }
        bestHit = hit; bestKey = key;
        best = { kind: k.kind, index: i, dist: Math.sqrt(dist2), point: _pw.clone() };
      }
    }
    return best;
  }

  // The plant of a kind nearest a point on the ground, or null. The card arrows read it, so the
  // camera goes to the plant of that kind the reader can reach first.
  nearest(kind, x, z) {
    const k = this.kinds.find((e) => e.kind === kind);
    if (!k) return null;
    let best = -1, bd = Infinity;
    for (let i = 0; i < k.count; i++) {
      const p = i * 3, dx = k.at[p] - x, dz = k.at[p + 2] - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return null;
    this.group.updateWorldMatrix(true, false);
    const p = best * 3;
    const point = new THREE.Vector3(k.at[p], k.at[p + 1], k.at[p + 2]).applyMatrix4(this.group.matrixWorld);
    return { kind, index: best, dist: 0, point };
  }

  // Lay the ring around one plant. A plant does not move, so the ring is placed once and never
  // stepped, which is the one way this mark differs from the mark on an animal.
  mark(hit) {
    if (!hit) return;
    const k = this.kinds.find((e) => e.kind === hit.kind);
    if (!k) return;
    this.marked = { kind: hit.kind, index: hit.index };
    if (!this.ring) this._buildRing();
    const i = hit.index, p = i * 3, o = i * 16;
    // the axis of the plant, from the up column of its instance matrix, so the ring lies on the
    // slope the plant stands on
    _up2.set(k.nearM[o + 4], k.nearM[o + 5], k.nearM[o + 6]).normalize();
    _fwd2.set(0, 0, 1);
    _fwd2.addScaledVector(_up2, -_fwd2.dot(_up2)).normalize();
    _rgt2.crossVectors(_up2, _fwd2).normalize();
    const r = Math.max(RING_MIN, Math.sqrt(k.sz2[i]) * k.wRatio * RING_SIZE);
    _mat2.makeBasis(_rgt2.multiplyScalar(r), _up2.multiplyScalar(r), _fwd2.multiplyScalar(r));
    _mat2.setPosition(_pos2.set(k.at[p], k.at[p + 1] + RING_LIFT, k.at[p + 2]));
    this.ring.matrix.copy(_mat2);
    this.ring.matrixWorldNeedsUpdate = true;
    this.ring.visible = true;
  }

  unmark() {
    this.marked = null;
    if (this.ring) this.ring.visible = false;
  }

  // The band of the mark, flat in the xz plane, so the instance basis can lay it on the slope. It
  // takes the accent of the fauna palette, which is the colour the animal ring and the site square
  // both take, so every mark in this app reads as one voice.
  _buildRing() {
    const geo = new THREE.RingGeometry(1 - RING_BAND, 1, 48);
    geo.rotateX(-HALF_PI);
    const pal = this.palette || {};
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color((pal.fauna && pal.fauna.accent) || '#ffffff'),
      transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.renderOrder = 2;
    ring.frustumCulled = false;
    ring.matrixAutoUpdate = false;
    this.ring = ring;
    this.ringMat = mat;
    this.group.add(ring);
  }

  dispose() {
    for (const k of this.kinds) {
      k.near.geometry.dispose();
      k.near.material.dispose();
      if (k.near.customDepthMaterial) k.near.customDepthMaterial.dispose();
      k.far.geometry.dispose();
      k.far.material.dispose();
    }
    if (this.ring) { this.ring.geometry.dispose(); this.ringMat.dispose(); this.ring = null; this.marked = null; }
    for (const t of this.targets) t.dispose();
    this.kinds.length = 0;
    this.targets.length = 0;
    this.materials.length = 0;
    this.group.clear();
  }
}

// ---------------------------------------------------------------- the ground cover
// The plants stand metres apart. Between them the ground was bare colour, so a patch read as
// painted card from close up. GrassField fills that gap.
//
// A tuft is about one unit wide, so it only reads within about 80 units of the reader. A field
// that wide over the whole box would hold a quarter of a million tufts, far past the plant cap.
// So the field is a lattice in world space that the camera carries: every cell of GRASS_CELL units
// holds at most one tuft, the tuft takes its place from the hash of its cell, and the field
// rebuilds when the camera has moved GRASS_STEP units. A tuft therefore never moves under the
// reader; the field only gains cells at one edge and loses them at the other. The lattice reaches
// GRASS_STEP past the radius, so every tuft the fade can show already stands in it.
//
// The cover mask of the worker says where a tuft may grow. The colour of the terrain under the
// tuft tints it, so the grass and the ground it stands on hold one hue.

// The material of the tufts: the near material of a plant, and the fade of the field on top. See
// GRASS_NEAR. The fade reads the eye from cameraPosition, which three.js gives every vertex shader.
function grassMaterial(style, radius) {
  const material = animate(floraMaterial(), style);
  const first = material.onBeforeCompile;
  const fade = { value: new THREE.Vector4(radius * GRASS_NEAR, radius, radius * GRASS_HUE[0], radius * GRASS_HUE[1]) };
  material.userData.fade = fade;
  material.onBeforeCompile = (sh, r) => {
    first.call(material, sh, r);
    sh.uniforms.uFade = fade;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uFade;\nattribute vec3 aGround;\nvarying vec3 vGround;\nvarying float vHue;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 gAt = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
        float gEye = distance(cameraPosition, gAt);
        transformed *= 1.0 - smoothstep(uFade.x, uFade.y, gEye);
        vHue = 1.0 - smoothstep(uFade.z, uFade.w, gEye);
        vGround = aGround;
      #endif
      `);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;\nvarying float vHue;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(vGround, diffuseColor.rgb, vHue);');
  };
  material.customProgramCacheKey = () => 'flora-grass';
  return material;
}

export class GrassField {
  constructor({ palette, tier, sampler, variant = 0 }) {
    this.sampler = sampler;
    this.radius = tier.shadows ? 78 : 50;
    this.cell = tier.shadows ? 1.7 : 2.3;
    this.reach = this.radius + GRASS_STEP;      // the lattice reaches past the fade, see above
    this.max = Math.ceil((2 * this.reach / this.cell + 2) ** 2);
    this.count = 0;
    this.buildMs = 0;
    this.atX = Infinity;
    this.atZ = Infinity;
    this.group = new THREE.Group();

    const geo = floraGeometry(FLORA.GRASS, palette.flora, variant);
    geo.computeBoundingBox();
    this.height = Math.max(geo.boundingBox.max.y, 0.001);
    // the colour of the ground under every tuft, which the tuft turns to as it goes out
    this.ground = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.ground.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aGround', this.ground);
    const style = FLORA_STYLE[FLORA.GRASS];
    this.material = grassMaterial(style, this.radius);
    this.mesh = new THREE.InstancedMesh(geo, this.material, this.max);
    this.mesh.castShadow = false;               // one tuft casts nothing a reader can see
    this.mesh.receiveShadow = !!tier.shadows;
    this.mesh.frustumCulled = false;            // the field follows the camera, so a sphere is stale
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);
  }

  update(camera, t) {
    this.material.userData.time.value = t;
    const x = camera.position.x, z = camera.position.z;
    // A camera higher than the radius over the ground sees no tuft, because the fade reads the
    // distance in three dimensions. The field then draws nothing and builds nothing.
    const up = camera.position.y - this.sampler.heightAt(x, z);
    if (up >= this.radius) { this.mesh.count = 0; this.count = 0; return; }
    const dx = x - this.atX, dz = z - this.atZ;
    if (this.count === 0 || dx * dx + dz * dz > GRASS_STEP * GRASS_STEP) this._build(x, z);
  }

  // One lattice, centred on the camera. The matrix carries a turn about y and a scale, and nothing
  // else, so the walk writes six numbers and leaves the rest of the identity alone.
  _build(cx, cz) {
    const t0 = performance.now();
    const S = this.sampler, cell = this.cell, R = this.reach, R2 = R * R;
    const gain = S.gain || 1;
    const m = this.mesh.instanceMatrix.array, col = this.mesh.instanceColor.array;
    const gr = this.ground.array;
    const i0 = Math.floor((cx - R) / cell), i1 = Math.ceil((cx + R) / cell);
    const j0 = Math.floor((cz - R) / cell), j1 = Math.ceil((cz + R) / cell);
    const rgb = [0, 0, 0];
    let o = 0;
    for (let j = j0; j <= j1 && o < this.max * 16; j++) {
      for (let i = i0; i <= i1 && o < this.max * 16; i++) {
        const hx = hash2(i, j), hz = hash2(i + 911, j - 37);
        const x = (i + hx) * cell, z = (j + hz) * cell;
        const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
        if (d2 > R2) continue;
        const cover = S.coverAt(x, z);
        if (cover <= 0.04) continue;
        // Thin cover must read thin. The share of the cells that grow follows the mask, so a
        // desert shows a tuft here and there and a meadow closes over.
        const hp = hash2(i + 57, j + 91);
        if (hp > cover * 1.5) continue;
        const y = S.heightAt(x, z);
        const hs = hash2(i - 313, j + 449);
        // A tuft is wider than it is tall, so a field of them reads as cover and not as a crop.
        const size = (0.45 + 0.85 * hs) * (0.5 + 0.6 * cover) / this.height;
        const wide = size * 1.3;
        const a = hash2(i + 7, j - 7) * Math.PI * 2;
        const ca = Math.cos(a) * wide, sa = Math.sin(a) * wide;
        m[o] = ca; m[o + 1] = 0; m[o + 2] = -sa; m[o + 3] = 0;
        m[o + 4] = 0; m[o + 5] = size; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = sa; m[o + 9] = 0; m[o + 10] = ca; m[o + 11] = 0;
        m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
        // The tint carries the hue of the ground under the tuft, not its brightness, so the grass
        // holds its own colour and still belongs to the ground it stands on.
        S.colorAt(x, z, rgb);
        const mean = (rgb[0] + rgb[1] + rgb[2]) / 3 || 1;
        const lit = 0.9 + 0.55 * hp;
        const c = o / 16 * 3;
        col[c] = lit * (1 + (rgb[0] / mean - 1) * 0.5);
        col[c + 1] = lit * (1 + (rgb[1] / mean - 1) * 0.5);
        col[c + 2] = lit * (1 + (rgb[2] / mean - 1) * 0.5);
        gr[c] = rgb[0] * gain; gr[c + 1] = rgb[1] * gain; gr[c + 2] = rgb[2] * gain;
        o += 16;
      }
    }
    this.count = o / 16;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.ground.needsUpdate = true;
    this.atX = cx; this.atZ = cz;
    this.buildMs = performance.now() - t0;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.group.clear();
    this.count = 0;
  }
}
