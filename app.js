// myworlds — main thread: rendering, controls, UI, storage.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Music } from './music.js';
import { buildActivity } from './phenomena.js';
import { BASE_SCALE, buildCreature, faunaMaterial, makeAnyMover, stepAny, impulseBlocked, moverActivity, makeGait, stepGait, gaitLocked, anchorFits, Inspector } from './fauna.js';
import { floraGeometry } from './flora-geometry.js';
import { groundRadius, faunaHomes, pickSite, pickDirs, pullSite, siteDir, dirToSite, viewToUrl, parseUrl, snapSite, cellTwist, sourceSite } from './site.js';
import { progressOf, marksOf, briefWords, motifLevel, CLOSED_LINE } from './chapters.js';
import { makeCarrierGroup, addWedge, updateCarrierGroup, disposeCarrierGroup, patchCarrierMaterial, pickCarrierColour, carrierColour, showMarker } from './carrier-globe.js';
import { sameCell, siteCell } from './cell-grid.js';
import { PlantInspector } from './flora-card.js';
import { SourceInspector, RuinInspector } from './ground-source.js';
import { makeTuner } from './tuner.js';
import { Probe } from './probe.js';
import { wayKey, sendName, nameOf, homeOf, FATE_IDS } from './way-types.js';   // chapter 3
import { readCodex, writeCodex } from './carrier-store.js';
import { makeDecoder } from './decoder.js';
import { protoRow } from './ruin-types.js';
import { hullOf } from './wreck-geometry.js';
import { Ground } from './ground.js';
import { TIERS, worldOpts, patchOpts } from './tiers.js';
import { skyView } from './ground-sky.js';
import { ProbeHud } from './probe-hud.js';
import { perf, Hud } from './perf.js';
import { rollStar, StarSystem } from './star.js';

// ---------------------------------------------------------------- config
const isCoarse = matchMedia('(pointer: coarse)').matches;
const isSmall = Math.min(innerWidth, innerHeight) < 600;
const LOW = isCoarse || isSmall || (navigator.hardwareConcurrency || 4) <= 4;
const COMPACT = isCoarse || isSmall; // the sidebar folds away so the planet stays visible
// One object holds the whole device tier: the row of tiers.js this device takes, and the pixel ratio
// of the display under the cap of that row. `Q` is the globe, and `Q.ground` is the probe. See
// tiers.js for the numbers and the reasons behind them.
const Q = { ...(LOW ? TIERS.LOW : TIERS.HIGH) };
Q.dpr = Math.min(devicePixelRatio || 1, Q.dprMax);
const STORE_KEY = 'myworlds.v1';
const MAX_SAVED = 60;
const CAM_MIN = 1.11, CAM_MAX = 8, CAM_HOME = 3.3;
const PICK_RANGE = CAM_MIN + 0.1;   // the globe holds still inside this camera distance
// `?perf` shows the frame time, the LOD knob, and the counts of the frame. Without the flag the
// page builds no element and does no work for it.
const PERF = new URLSearchParams(location.search).has('perf');
// `?source` puts a dot on the globe where the source of issue 34 stands. It is the eye check on
// the bearing math: three wedges from three continents must cross over it. It stays out of the UI.
const SOURCE_DOT = new URLSearchParams(location.search).has('source');
// `?ruin` puts a dot on the globe where the ruin of p2-35 stands, in another colour. It is the eye
// check on the place: with `?source` on too, the ruin stands 12 to 35 cells from the wreck on
// nearly every world. It stays out of the UI.
const RUIN_DOT = new URLSearchParams(location.search).has('ruin');
// Chapter 3, for the tests and for the tools of the story. `?fate=<id>` gives the third log the fate
// `<id>` of way-types.js in place of the fate of the seed, when the crew allows it: a debug option of
// the world call, so the worker and the patch read the same log. `?chapter=3` gives the reader the
// finds of chapters 1 and 2 on each world that loads, so chapter 3 opens at once. Neither stands
// in the interface. See docs/issues/p3-00-the-way-on.md and tools/story-lab.html.
const FATE = (() => { const f = new URLSearchParams(location.search).get('fate'); return FATE_IDS.includes(f) ? f : null; })();
const SKIP_TO = Number(new URLSearchParams(location.search).get('chapter')) || 0;
const wOpts = () => (FATE ? { ...worldOpts(Q), fate: FATE } : worldOpts(Q));
const pOpts = () => { const o = patchOpts(Q); if (FATE) o.world = { ...o.world, fate: FATE }; return o; };
// Chapter 3: the level of the voice of the ruin during the jump, 0 to 1. setCarrierLevel() reads it.
let jumpVoice = 0, lastJumpVoice = 0;
const HUD_MS = 500;       // ms, the overlay reads twice a second

// ---------------------------------------------------------------- dom
const $ = (s) => document.querySelector(s);
const canvas = $('#c');
const form = $('#seed-form');
const input = $('#seed');
const diceBtn = $('#dice');
const worldsEl = $('#worlds');
const infoEl = $('#info');
const infoBody = $('#info-body');
const hworld = $('#hworld');
const overlay = $('#overlay');
const overlayLabel = $('#overlay-label');
const overlayBar = $('#overlay-bar');
const toggleBtn = $('#toggle');
const panel = $('#panel');
const shareBtn = $('#share');
const probeBtn = $('#probe');
const probeIconBtn = $('#probe-icon');
const probeFloat = $('#probe-float');
// The instrument of the probe, issue 31. It shows while the probe is down and it reads one
// telemetry object per frame from the ground. See probe-hud.js. The carrier block of it is a
// control, and a press on it opens the brief of the distress signal; see openBrief() below.
const probeHud = new ProbeHud($('#probe-hud'), { onCarrier: () => openBrief() });
const creatureFloat = $('#creature-float');
const aimEl = $('#aim');
const helpEl = $('#help');
// The two lines of help, one per place the reader stands. The globe turns under the pointer and the
// ground carries the reader over it, so the first gesture does a different thing in each, and the
// line has to say which. See updateHelp().
const HELP_ORBIT = 'Drag to spin and tilt · scroll or pinch to zoom · get close to find the wildlife';
// A touch screen gets the help of the fingers, and every other screen gets the help of the keys.
const HELP_GROUND = isCoarse
  ? 'Drag or hold to move · two fingers: slide to look, pinch to zoom, twist to turn'
  : 'Drag or hold to move · WASD fly level, Space or E up, C or Q down, Shift runs · arrows, R F, or right-drag to look';
const diveEl = $('#dive');
const diveLabel = $('#dive-label');
const muteBtn = $('#mute');
const volInput = $('#vol');

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
if (Q.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }

const scene = new THREE.Scene();
scene.background = new THREE.Color('#070a16');
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 200);
camera.position.set(0, 0.9, CAM_HOME);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = CAM_MIN;
controls.maxDistance = CAM_MAX;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.9;
let userActive = false, lastInteract = 0;
controls.addEventListener('start', () => { userActive = true; lastInteract = performance.now(); });
controls.addEventListener('end', () => { userActive = false; lastInteract = performance.now(); });

const sunDir = new THREE.Vector3(1, 0.55, 0.8).normalize();
// ---------------------------------------------------------------- the axis of a world, issue 33
// The star of the scene stands in one place, so the world turns to meet it. The worker rolled the
// obliquity of the axis and the season the world stands in, and the two give the declination: the
// latitude the star stands over. The axis must therefore make an angle of 90 degrees less the
// declination with the direction of the star, and that one rule fixes the light:
//
//   * an upright world at an equinox takes the star over its equator, and both poles stand at the
//     terminator, half lit;
//   * a world on its side at a solstice takes the star over a pole, and one whole hemisphere is
//     lit while the other stands in the dark;
//   * the same world half a year later shows the other pole.
//
// The turn about the star is free, and it goes to the axis that leans in the plane of the screen,
// so the reader sees the tilt as a lean and not as a planet pointing away. The spin of the world
// runs about that axis, so the terminator, the tilt, and the climate the worker painted all agree.
const _axisUp = new THREE.Vector3(0, 1, 0);
const _axisE1 = new THREE.Vector3();
const _axisV = new THREE.Vector3();
function axisQuat(world) {
  const decl = world.axis ? world.axis.decl : 0;
  _axisE1.copy(_axisUp).addScaledVector(sunDir, -sunDir.dot(_axisUp));
  if (_axisE1.lengthSq() < 1e-8) _axisE1.set(1, 0, 0).cross(sunDir);
  _axisE1.normalize();
  _axisV.copy(sunDir).multiplyScalar(Math.sin(decl)).addScaledVector(_axisE1, Math.cos(decl)).normalize();
  return new THREE.Quaternion().setFromUnitVectors(_axisUp, _axisV);
}
const sun = new THREE.DirectionalLight('#fff4e0', 3.2);
sun.position.copy(sunDir).multiplyScalar(6);
if (Q.shadows) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -1.3; sc.right = 1.3; sc.top = 1.3; sc.bottom = -1.3; sc.near = 3; sc.far = 9;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.02;
}
scene.add(sun);
scene.add(new THREE.HemisphereLight('#8fb7ff', '#2b1d12', 0.55));
const fill = new THREE.DirectionalLight('#5a78c8', 0.35);
fill.position.set(-4, -2, -3);
scene.add(fill);
// The star of the world stands far out along sunDir, so the light and the star the reader sees
// agree. See star.js.
const SUN_INTENSITY = 3.2;
const stars = new StarSystem(scene, sunDir);

// stars
{
  const rng = mulberry32(1234);
  const n = 2500, p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n);
  const tints = [[1, 1, 1], [0.8, 0.88, 1], [1, 0.92, 0.75], [0.95, 0.8, 0.9]];
  for (let i = 0; i < n; i++) {
    const z = rng() * 2 - 1, t = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    p[i * 3] = r * Math.cos(t) * 90; p[i * 3 + 1] = r * Math.sin(t) * 90; p[i * 3 + 2] = z * 90;
    const tint = tints[Math.floor(rng() * tints.length)], b = 0.5 + rng() * 0.5;
    c[i * 3] = tint[0] * b; c[i * 3 + 1] = tint[1] * b; c[i * 3 + 2] = tint[2] * b;
    s[i] = rng() < 0.08 ? 3 : 1.4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('size', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { dpr: { value: Q.dpr } },
    vertexShader: `attribute float size; varying vec3 vC; uniform float dpr;
      void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = size * dpr; }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d,d) > 0.25) discard; gl_FragColor = vec4(vC, 1.0); }`,
    vertexColors: true, depthWrite: false,
  });
  scene.add(new THREE.Points(g, m));
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- shaders
const atmoOuterMat = (color, strength) => new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength } },
  vertexShader: `varying vec3 vN; varying vec3 vW;
    void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 color; uniform float strength; varying vec3 vN; varying vec3 vW;
    void main(){ vec3 v = normalize(cameraPosition - vW); float d = dot(vN, v);
      float i = pow(clamp(0.55 - d, 0.0, 1.0), 4.0) * 0.7 * strength; gl_FragColor = vec4(color * i, i); }`,
  side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const atmoInnerMat = (color, strength) => new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength } },
  vertexShader: `varying vec3 vN; varying vec3 vW;
    void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 color; uniform float strength; varying vec3 vN; varying vec3 vW;
    void main(){ vec3 v = normalize(cameraPosition - vW); float rim = 1.0 - max(dot(vN, v), 0.0);
      float i = pow(rim, 3.5) * 0.55 * strength; gl_FragColor = vec4(color, i); }`,
  side: THREE.FrontSide, transparent: true, depthWrite: false,
});

// ---------------------------------------------------------------- world building
let current = null; // { group, spin, oceanMat, cloudGroup, moons, ringMesh, data }

// The chapters of the world on the screen, and the group of wedges under current.planet. The
// progress holds every rule of the story; see chapters.js. A world with no source, which is every
// gas giant, holds a progress with no chapter and no group.
let progress = null;
let carrierGroup = null;

// The view of the progress of the world on the screen, or null. See view() in chapters.js.
function carrierView() {
  return progress ? progress.view() : null;
}

// The number of the search the receiver follows: 1 for the wreck, 2 for the ruin. carrierColour()
// of carrier-globe.js keeps one colour for each.
function carrierChapter() {
  const v = carrierView();
  return v && v.follow ? v.follow.n : 1;
}

// Build the group of the carrier again from a view of the progress, for the world on the screen. A
// world with no search gets no group. See showProgress().
function rebuildCarrierGroup(v = carrierView()) {
  if (!current) return;
  disposeCarrierGroup(carrierGroup);
  carrierGroup = makeCarrierGroup(current.world, v, current.heightMap);
  if (carrierGroup) current.planet.add(carrierGroup);
}

function disposeWorld() {
  if (!current) return;
  showMarker(null);                 // the aim square is paint in the shared uniforms
  site = null;
  // The marks of the carrier go first, because they own their buffers and the walk below would
  // only reach the geometry. The same call takes the wedges out of the uniforms of the shaders, so
  // the next world starts with none. See disposeCarrierGroup() in carrier-globe.js.
  disposeCarrierGroup(carrierGroup);
  carrierGroup = null; progress = null;   // generate() aborted the probe first, so no landing waits
  current.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
  scene.remove(current.group);
  current = null;
}

function buildWorld(res) {
  disposeWorld();
  const { world, terrain, flora, clouds, fauna, heightMap, floraGrid } = res;
  const group = new THREE.Group();
  world.star = rollStar(world.seed);
  stars.set(world.star);
  sun.color.copy(stars.lightColor());
  sun.intensity = SUN_INTENSITY * stars.lightScale();
  // The axis of the world holds the planet, the cloud deck, and the ring, and the planet spins
  // inside it. The two jobs must not share one object: a spin written into the y of an Euler that
  // already carries the tilt turns the world about the vertical of the scene and not about its own
  // axis, which walks the pole around the sky and moves the light on the ground under it. The
  // parent carries the tilt and the child carries the turn.
  const axisGroup = new THREE.Group();
  axisGroup.setRotationFromQuaternion(axisQuat(world));
  group.add(axisGroup);
  const planet = new THREE.Group();          // spins about the axis of its parent
  axisGroup.add(planet);

  // terrain
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(terrain.pos, 3));
  tg.setAttribute('color', new THREE.BufferAttribute(terrain.col, 3));
  tg.computeVertexNormals();
  const tm = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
  if (world.type === 'gas') { tm.roughness = 0.7; }
  const terrainMesh = new THREE.Mesh(tg, tm);
  terrainMesh.castShadow = Q.shadows; terrainMesh.receiveShadow = Q.shadows;
  planet.add(terrainMesh);

  // ocean
  let oceanMat = null;
  if (world.hasOcean) {
    const seaR = 1 + world.amp * 0.004; // a hair above zero elevation so beaches read
    const og = new THREE.IcosahedronGeometry(seaR, LOW ? 40 : 64);
    const pal = world.palette;
    oceanMat = new THREE.MeshStandardMaterial({
      color: pal.ocean, flatShading: true, transparent: pal.oceanOpacity < 1, opacity: pal.oceanOpacity,
      roughness: pal.oceanIce ? 0.55 : 0.42, metalness: 0,
      emissive: pal.oceanLava ? pal.ocean : '#000000', emissiveIntensity: pal.oceanLava ? 0.9 : 0,
    });
    // a miniature ocean must shimmer, not swell: half the wobble, half the spatial frequency, a period near 14 s
    const wobble = pal.oceanIce ? 0 : pal.oceanLava ? 0.0012 : 0.0006;
    oceanMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float w = sin(uTime * 0.45 + position.x * 27.5 + position.z * 15.5) * sin(uTime * 0.31 + position.y * 23.5);
          transformed += normal * w * ${wobble.toFixed(5)};`);
      oceanMat.userData.shader = sh;
    };
    // three.js keys a program on customProgramCacheKey(), which is the text of onBeforeCompile by
    // default. The wobble above is a literal in that text, so every ocean of every world read one
    // key and two worlds shared one program. The key states the number instead.
    oceanMat.customProgramCacheKey = () => `ocean|${wobble.toFixed(5)}`;
    const ocean = new THREE.Mesh(og, oceanMat);
    ocean.receiveShadow = false;
    ocean.renderOrder = 1;
    planet.add(ocean);
  }

  // flora (instanced per kind)
  if (world.floraCount > 0) {
    const kinds = new Map();
    for (let i = 0; i < world.floraCount; i++) {
      const k = flora[i * 8 + 7];
      if (!kinds.has(k)) kinds.set(k, []);
      kinds.get(k).push(i);
    }
    const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), pos = new THREE.Vector3();
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s = new THREE.Vector3(), m = new THREE.Matrix4();
    const baseScale = 0.0066; // 40% smaller than the first pass, so a forest reads as a forest
    const rng = mulberry32(7);
    for (const [kind, list] of kinds) {
      // the flora signature of the world, so the globe grows the plants the ground will show
      const geo = floraGeometry(kind, world.palette.flora, world.floraVariant || 0);
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, flatShading: true, roughness: kind === 3 ? 0.35 : 0.9, metalness: 0,
        emissive: kind === 3 ? world.palette.flora.canopy : '#000000', emissiveIntensity: kind === 3 ? 0.35 : 0,
      });
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      inst.castShadow = Q.shadows; inst.receiveShadow = Q.shadows;
      const col = new THREE.Color();
      list.forEach((i, j) => {
        const o = i * 8;
        pos.set(flora[o], flora[o + 1], flora[o + 2]);
        nrm.set(flora[o + 3], flora[o + 4], flora[o + 5]);
        q.setFromUnitVectors(up, nrm);
        q2.setFromAxisAngle(up, rng() * Math.PI * 2);
        q.multiply(q2);
        const sc = baseScale * flora[o + 6] * (kind === 5 ? 0.8 : 1);
        s.set(sc, sc, sc);
        m.compose(pos, q, s);
        inst.setMatrixAt(j, m);
        const b = 0.85 + rng() * 0.3;
        col.setRGB(b, b * (0.97 + rng() * 0.06), b);
        inst.setColorAt(j, col);
      });
      planet.add(inst);
    }
  }

// The step the globe reads a slope over, in globe units. The height map is 384 by 192, so one
// texel is about 0.016 units of arc; a shorter step would read the same texel twice.
const SLOPE_STEP = 0.02;
  // ---- slinger (issue 28) ----
  // The height the cord takes hold at on a globe plant, in globe units. `baseScale` above is the
  // scale the flora is drawn at and the seventh float of a flora row is its own size factor, so
  // the two together give the height of that one plant. The tendon is under a pixel out here; the
  // number is there so the cord leaves the body at the right slant, and no more.
  const GLOBE_FLORA_SCALE = 0.0066;
  const GLOBE_HOLD = 0.7;
  // A plant more than this far round the curve of the planet is behind the horizon of the animal.
  const GLOBE_FACING = 0.2;

  // fauna (one instanced mesh per species, animated in the vertex shader, roaming on the CPU)
  const faunaMats = [], movers = [], faunaMeshes = [];
  // The hooks an impulse animal reads on the globe. The slope is the gradient of the height map in
  // the tangent frame of that one animal, by central difference over a step of SLOPE_STEP units.
  // The gradient is a rise over a run, so it means the same thing here and on the ground.
  const _sd = new THREE.Vector3();
  const globeSlope = (x, z, st) => {
    if (!heightMap) return null;
    const h = (du, dv) => {
      _sd.copy(st.n).addScaledVector(st.t1, x + du).addScaledVector(st.t2, z + dv).normalize();
      return groundRadius(world, heightMap, _sd);
    };
    const e = SLOPE_STEP;
    return { gx: (h(e, 0) - h(-e, 0)) / (2 * e), gz: (h(0, e) - h(0, -e)) / (2 * e) };
  };
  // ---- slinger (issue 28) ----
  // The nearest plant this animal can hold, in the tangent coordinates its own mover roams in.
  // The mover reads (u, v) through normalize(n + t1 * u + t2 * v), so the way back from a plant on
  // the sphere to those two numbers is the ratio below: the plant seen from the centre, over how
  // far it lies round the curve. It reads only the cells of floraGrid the reach covers; see
  // buildFloraGrid() in generate.js.
  const _af = new THREE.Vector3();
  const globeNearAnchor = (x, z, reach, st) => {
    if (!floraGrid || !flora || !(reach > 0)) return null;
    const W = floraGrid[0], H = floraGrid[1], n = floraGrid[2], head = 3;
    if (!n) return null;
    const idx = head + W * H + 1;
    _af.copy(st.n).addScaledVector(st.t1, x).addScaledVector(st.t2, z).normalize();
    const lat = Math.asin(Math.min(1, Math.max(-1, _af.y))), lon = Math.atan2(_af.z, _af.x);
    const band = (a) => Math.min(H - 1, Math.max(0, Math.floor(((a + Math.PI / 2) / Math.PI) * H)));
    const j0 = band(lat - reach), j1 = band(lat + reach);
    // The rings of longitude close up toward a pole, so the reach covers more of them there. Over
    // a pole it covers all of them, and the whole band is read.
    const cl = Math.cos(lat);
    const dlon = cl > 1e-3 ? Math.min(Math.PI, reach / cl) : Math.PI;
    const ic = Math.floor(((lon + Math.PI) / (2 * Math.PI)) * W);
    const iw = Math.min(W >> 1, Math.ceil((dlon / (2 * Math.PI)) * W) + 1);
    let best = -1, bu = 0, bv = 0, bd = Infinity;
    for (let j = j0; j <= j1; j++) {
      for (let k = -iw; k <= iw; k++) {
        const c = j * W + (((ic + k) % W) + W) % W;
        for (let m = floraGrid[head + c]; m < floraGrid[head + c + 1]; m++) {
          const o = floraGrid[idx + m] * 8;
          const qx = flora[o + 3], qy = flora[o + 4], qz = flora[o + 5];
          const dn = qx * st.n.x + qy * st.n.y + qz * st.n.z;
          if (dn <= GLOBE_FACING) continue;
          const u = (qx * st.t1.x + qy * st.t1.y + qz * st.t1.z) / dn;
          const v = (qx * st.t2.x + qy * st.t2.y + qz * st.t2.z) / dn;
          const dx = u - x, dz = v - z;
          if (!anchorFits(dx, dz, reach, st)) continue;
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = o; bu = u; bv = v; }
        }
      }
    }
    if (best < 0) return null;
    return { x: bu, z: bv, y: GLOBE_FLORA_SCALE * flora[best + 6] * GLOBE_HOLD };
  };
  const globeHooks = { slope: globeSlope, nearAnchor: globeNearAnchor };
  if (world.faunaCount > 0 && fauna) {
    const kinds = new Map();
    for (let i = 0; i < world.faunaCount; i++) {
      const k = fauna[i * 9 + 7];
      if (!kinds.has(k)) kinds.set(k, []);
      kinds.get(k).push(i);
    }
    const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), pos = new THREE.Vector3();
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s = new THREE.Vector3(), m = new THREE.Matrix4();
    const rng = mulberry32(11);
    for (const [kind, list] of kinds) {
      const G = world.species[kind];
      const geo = buildCreature(G, world.palette, world.palette.flora);
      const phases = new Float32Array(list.length);
      list.forEach((i, j) => { phases[j] = fauna[i * 9 + 8]; });
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
      // aAnim carries the four dynamic floats of one creature: the activity, the gait clock, the
      // turn, and the burst of an impulse animal. updateMovers() writes all four as it steers.
      const anim = new Float32Array(list.length * 4);
      for (let j = 0; j < list.length; j++) anim[j * 4] = 1;
      geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(anim, 4).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aAnchor', new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const mat = faunaMaterial(G);
      faunaMats.push(mat);
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      inst.userData.kind = kind;
      inst.castShadow = Q.shadows && G.move.shadow; inst.receiveShadow = Q.shadows;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      list.forEach((i, j) => {
        const o = i * 9;
        pos.set(fauna[o], fauna[o + 1], fauna[o + 2]);
        nrm.set(fauna[o + 3], fauna[o + 4], fauna[o + 5]);
        q.setFromUnitVectors(up, nrm);
        q2.setFromAxisAngle(up, rng() * Math.PI * 2);
        q.multiply(q2);
        const sc = BASE_SCALE * fauna[o + 6];
        s.set(sc, sc, sc);
        m.compose(pos, q, s);
        inst.setMatrixAt(j, m);
        if (G.move.leash > 0) {
          // tangent basis for roaming; hover is the gap between the home point and the ground under it
          const t1 = new THREE.Vector3().crossVectors(nrm, Math.abs(nrm.y) < 0.9 ? up : new THREE.Vector3(1, 0, 0)).normalize();
          const t2 = new THREE.Vector3().crossVectors(nrm, t1).normalize();
          // The tightest circle it can walk, in globe units. A creature is about one unit long in
          // its own frame, so its scale is its length, and a body turns about a body and a half.
          // The mover of this animal: the steady wander, or the impulse model that charges and
          // throws. G.move.mode picks between them, and nothing else here tests the locomotion.
          const st = makeAnyMover(rng, G, { ...G.move, turnR: sc * (G.cls === 'air' ? 4 : 1.5) }, globeHooks);
          st.inst = inst; st.j = j; st.home = pos.clone(); st.n = nrm.clone(); st.t1 = t1; st.t2 = t2; st.sc = sc;
          // What a mover that holds a point in the world needs of this tier. Its (u, v) are already
          // the coordinates the globe hooks take, so the origin stays at zero. One creature unit is
          // `sc` globe units. The hand is -1: the instance takes its left from n cross forward, and
          // t1 cross t2 is n, so the (u, v) plane of the globe turns the other way from the (x, z)
          // plane of the ground, which takes its up from +y. See slingerTrack(). Slinger, issue 28.
          st.unit = sc;
          st.hand = -1;
          // the gait clock: the leg cycle runs off the ground it covers, so its feet do not slide
          st.gait = gaitLocked(G) ? makeGait(G, sc, st.speed, geo.userData.hipY) : null;
          const g0 = groundRadius(world, heightMap, nrm);
          st.hover = pos.length() - g0;
          // A flyer on a gas giant swims between the decks and dives through the upper one. The
          // clock comes from its phase and draws no numbers, so the wander of every animal stays.
          if (world.type === 'gas' && st.flies) {
            const ph = fauna[o + 8], fr = (x) => x - Math.floor(x);
            st.dip = { ph, w: (Math.PI * 2) / (55 + 55 * fr(ph * 7.13)), base: DECK_LOW - 1 + 0.01 * fr(ph * 3.71) };
          }
          st.dry = !world.seaRadius || g0 > world.seaRadius + 0.0005;
          movers.push(st);
        }
      });
      faunaMeshes.push(inst);
      planet.add(inst);
    }
  }

  // clouds
  let cloudMat = null, cloudInst = null;
  const cloudGroup = new THREE.Group();
  if (world.hasClouds && clouds.length) {
    const n = clouds.length / 6;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: world.palette.cloud, flatShading: true, roughness: 1, transparent: true, opacity: 0.92, emissive: world.palette.cloud, emissiveIntensity: 0.22 });
    const inst = new THREE.InstancedMesh(geo, mat, n);
    inst.castShadow = Q.shadows;
    const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), pos = new THREE.Vector3();
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      pos.set(clouds[o], clouds[o + 1], clouds[o + 2]);
      nrm.copy(pos).normalize();
      q.setFromUnitVectors(up, nrm);
      s.set(clouds[o + 3], clouds[o + 4], clouds[o + 5]);
      m.compose(pos, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.renderOrder = 2;
    cloudGroup.add(inst);
    cloudMat = mat; cloudInst = inst;
  }
  axisGroup.add(cloudGroup);

  // natural activity: at most one per world
  const activity = buildActivity(world, planet, cloudGroup, cloudInst, (dir) => groundRadius(world, heightMap, dir));

  // `?source`: the dot of issue 34. `?ruin`: the dot of p2-35, cyan against the pink of the
  // wreck. Each rides under the planet, so it turns with the world, and it goes away with the
  // world, because the whole group is disposed.
  const debugDot = (dir, color) => {
    const d = new THREE.Vector3(...dir);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 12, 8),
      new THREE.MeshBasicMaterial({ color, toneMapped: false, depthTest: false }),
    );
    dot.position.copy(d).multiplyScalar(Math.max(groundRadius(world, heightMap, d), world.seaRadius || 0) + 0.01);
    dot.renderOrder = 4;
    planet.add(dot);
  };
  if (SOURCE_DOT && world.source) debugDot(world.source.dir, '#ff3ba7');
  if (RUIN_DOT && world.ruin) debugDot(world.ruin.dir, '#2ee6ff');

  // The wedges of the search, from the store. They ride under the planet too, so they turn with
  // the world, and the far side of the globe hides the part of a wedge that runs behind it. A gas
  // giant gets no probe and a world where makeSource() found no cell has nothing to hear, so both
  // give null here and the sidebar hides the Carrier row. Issue 34, slice 2.
  //
  // The height map goes in because the pin of a find stands on the terrain. It comes off the same
  // reply as `world`, so it stands here already; `current` does not, and it is written further
  // down this function.
  // The colour of the carrier comes off the colours of this terrain, so a wedge stands out on it.
  if (world.type !== 'gas') pickCarrierColour(world, terrain.col, terrain.pos);
  progress = progressOf(world);
  if (SKIP_TO >= 3) skipToWay(progress, world);
  carrierGroup = makeCarrierGroup(world, progress.view(), heightMap);
  if (carrierGroup) planet.add(carrierGroup);

  // The wedges themselves are paint and not geometry: the terrain shader and the ocean shader test
  // every fragment against the fixes in the uniforms, so a wedge lies on the ground it marks and it
  // holds no parallax against the relief at any camera. The patch extends the wobble patch of the
  // ocean above; it must run before gasWeather() below, which takes the whole onBeforeCompile of
  // the terrain material for itself, and a gas giant takes no patch here, so the two never meet.
  // Every world with a surface takes the patch, because the aim square is paint too.
  if (world.type !== 'gas') {
    patchCarrierMaterial(tm);
    patchCarrierMaterial(oceanMat);
  }

  // the upper cloud deck of a gas giant
  const deckMat = world.type === 'gas' && world.deck ? gasDeck(world, planet) : null;
  if (deckMat) {
    tm.color.setScalar(0.72);   // the banded body is the lower deck, so it lies in shade
    gasWeather(world, tm);
  }

  // atmosphere
  if (deckMat) {
    const haze = new THREE.Mesh(new THREE.SphereGeometry(HAZE_R, 96, 64), gasHazeMat(world.palette.atmo));
    haze.renderOrder = 3;
    group.add(haze);
  } else if (world.hasAtmosphere) {
    const outer = new THREE.Mesh(new THREE.IcosahedronGeometry(1.17, 5), atmoOuterMat(world.palette.atmo, world.atmoStrength));
    outer.renderOrder = 3;
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.115, 5), atmoInnerMat(world.palette.atmo, world.atmoStrength));
    inner.renderOrder = 3;
    group.add(outer, inner);
  }

  // rings
  let ringMesh = null;
  if (world.rings) {
    const r = world.rings;
    const theta = 128;
    const rg = new THREE.RingGeometry(r.inner, r.outer, theta, r.bands).toNonIndexed();
    const cnt = rg.attributes.position.count;
    const col = new Float32Array(cnt * 4);
    for (let f = 0; f < cnt / 3; f++) {
      const band = Math.floor(f / (2 * theta));
      const bi = Math.min(band, r.bands - 1) * 4;
      for (let k = 0; k < 3; k++) {
        const v = (f * 3 + k) * 4;
        col[v] = r.data[bi]; col[v + 1] = r.data[bi + 1]; col[v + 2] = r.data[bi + 2]; col[v + 3] = r.data[bi + 3];
      }
    }
    rg.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const rm = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, roughness: 0.9, flatShading: true, depthWrite: false });
    ringMesh = new THREE.Mesh(rg, rm);
    // A ring lies in the plane of the equator, so it rides the axis of the world and holds its own
    // small lean inside it. The lean keeps world.tilt, which is what that number is now for.
    ringMesh.rotation.x = -Math.PI / 2 + r.tilt;
    ringMesh.rotation.z = world.tilt * 0.4;
    ringMesh.receiveShadow = Q.shadows;
    ringMesh.renderOrder = 2;
    axisGroup.add(ringMesh);
  }

  // moons
  const moons = [];
  for (const md of world.moons) {
    const mg = new THREE.IcosahedronGeometry(1, 2);
    const rng = mulberry32(md.seed);
    const pa = mg.attributes.position;
    // simple bumpy moon: per-vertex radial jitter (vertices are duplicated → use position hash)
    const seen = new Map();
    for (let i = 0; i < pa.count; i++) {
      const key = `${pa.getX(i).toFixed(4)},${pa.getY(i).toFixed(4)},${pa.getZ(i).toFixed(4)}`;
      let f = seen.get(key);
      if (f === undefined) { f = 0.9 + rng() * 0.2; seen.set(key, f); }
      pa.setXYZ(i, pa.getX(i) * f, pa.getY(i) * f, pa.getZ(i) * f);
    }
    mg.computeVertexNormals();
    const mm = new THREE.MeshStandardMaterial({ color: md.color, flatShading: true, roughness: 1 });
    const mesh = new THREE.Mesh(mg, mm);
    mesh.scale.setScalar(md.size);
    mesh.castShadow = Q.shadows; mesh.receiveShadow = Q.shadows;
    const pivot = new THREE.Group();
    pivot.rotation.x = md.incl; pivot.rotation.z = md.incl * 0.5;
    pivot.add(mesh);
    group.add(pivot);
    moons.push({ pivot, mesh, ...md, angle: md.phase });
  }

  scene.add(group);
  const homes = faunaHomes(fauna, world.faunaCount || 0);   // the pull to life reads these every frame
  current = { group, planet, terrainMesh: world.type === 'gas' ? null : terrainMesh, cloudGroup, oceanMat, deckMat, bodyMat: deckMat ? tm : null, moons, ringMesh, world, spin: world.spin, faunaMats, movers, cloudMat, faunaMeshes, heightMap, activity, homes };
}

// ---------------------------------------------------------------- the decks of a gas giant
// A gas giant has no surface. The gas gets thicker with depth, and the clouds condense in decks at
// fixed pressures. The banded body at radius 1 is the lower deck. This shell is the upper deck: a
// thin, streaked layer with gaps, so the reader sees down to the lower deck through it. The whales
// live in the clear gas between the two decks and rise through the upper deck from time to time.
// See whaleDip().
const DECK_R = 1.036;            // the radius of the upper deck
const DECK_LOW = 1.012;          // the lowest hover of a whale, over the lower deck
const DECK_HIGH = 1.058;         // the highest hover of a whale, over the upper deck
// The noise both decks share: a value noise, streaks that run along the bands, and a turn about
// the axis of the world.
const DECK_GLSL = `
  float dHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float dNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // streaks: slow along the bands, fast across them
  float dStreak(vec3 p) {
    vec3 q = p * vec3(2.6, 24.0, 2.6);
    return dNoise(q) * 0.55 + dNoise(q * 2.1 + 7.3) * 0.3 + dNoise(q * 4.3 + 1.7) * 0.15;
  }
  vec3 dTurn(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c); }`;

// The weather of the lower deck. The worker paints the bands once, and this shader moves over
// them. Every pattern turns as a whole, and no pattern turns faster at one latitude than at the
// next, because a flow that shears a pattern tears it into noise in a few minutes.
// - The jets: the bands streak east and west, and a fast jet runs along the equator.
// - The poles: the jet round each pole bends into a polygon, as the hexagon on Saturn does, and a
//   spiral turns in its eye.
// - The storms: the great storm and a few small ones turn their spiral arms, each the way its
//   hemisphere turns it.
const MAX_VORTICES = 6;
function gasWeather(world, mat) {
  const d = world.deck;
  if (!d.vortices) return;
  const vort = [];
  for (let i = 0; i < MAX_VORTICES; i++) vort.push(new THREE.Vector4(...(d.vortices[i] || [0, 1, 0, 0])));
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uTime: { value: 0 }, uLight: { value: new THREE.Color(d.top) }, uDark: { value: new THREE.Color(d.dark) },
      uStormCol: { value: new THREE.Color(d.storm) }, uStorm: { value: new THREE.Vector4(...world.storm.dir, world.storm.size) },
      uVort: { value: vort },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBody;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBody = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vBody;
        uniform float uTime; uniform vec3 uLight, uDark, uStormCol; uniform vec4 uStorm; uniform vec4 uVort[${MAX_VORTICES}];
        ${DECK_GLSL}
        // The polygon jet round one pole: a bright line where the polygon runs, a darker eye inside
        // it, and a spiral that turns in the eye.
        vec3 dPole(vec3 p, vec3 col, float s, float sides, float t) {
          float r = acos(clamp(p.y * s, -1.0, 1.0));
          if (r > 0.55) return col;
          float th = atan(p.z, p.x) * s + t * 0.012;
          float seg = 6.28318 / sides;
          float hx = r * cos(3.14159 / sides) / cos(mod(th, seg) - seg * 0.5);
          float wob = (dNoise(p * 18.0 + t * 0.03) - 0.5) * 0.01;
          float line = exp(-pow((hx + wob - 0.3) / 0.02, 2.0));
          float eye = 1.0 - smoothstep(0.27, 0.31, hx);
          float spiral = 0.5 + 0.5 * sin(3.0 * th - 26.0 * r - t * 0.06 * s);
          col = mix(col, uDark, eye * (0.3 + 0.25 * spiral * smoothstep(0.3, 0.02, r)));
          col = mix(col, uLight, line * 0.85);
          return mix(col, uLight, smoothstep(0.03, 0.0, r) * 0.5);
        }
        // One storm: an oval, wide along the bands, with arms that wind in to a dark eye.
        vec3 dStorm(vec3 p, vec3 col, vec4 c, vec3 tint, float t) {
          if (c.w <= 0.0 || dot(p, c.xyz) < cos(c.w * 2.0)) return col;
          vec3 e = normalize(cross(vec3(0.0, 1.0, 0.0), c.xyz)), nn = cross(c.xyz, e);
          vec3 q = p - c.xyz;
          vec2 o = vec2(dot(q, e) * 0.6, dot(q, nn) * 1.4) / c.w;
          float dd = length(o), phi = atan(o.y, o.x), spin = c.y >= 0.0 ? 1.0 : -1.0;
          float arms = 0.5 + 0.5 * sin(2.0 * phi - 11.0 * dd * spin + t * 0.15 * spin);
          float body = smoothstep(1.0, 0.45, dd);
          // light crests and dark troughs, so the arms read against bands of any colour
          col = mix(col, mix(uDark, uLight, arms), body * 0.55);
          col = mix(col, tint, smoothstep(0.7, 0.2, dd) * 0.45);
          return mix(col, uDark, smoothstep(0.14, 0.04, dd) * 0.6);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 p = normalize(vBody);
        float t = uTime;
        vec3 col = diffuseColor.rgb;
        // the bands streak, and the streaks drift. Two layers turn the opposite ways.
        float band = smoothstep(-0.3, 0.3, sin(p.y * ${(d.freq * 0.5).toFixed(3)} * 3.14159));
        float sk = mix(dStreak(dTurn(p, t * 0.006) * 1.3 + 5.0), dStreak(dTurn(p, -t * 0.005) * 1.3 + 9.0), band);
        col *= 0.82 + 0.36 * sk;
        // the equatorial jet: thin light streaks that run fast along the equator
        float jet = smoothstep(0.62, 0.9, dNoise(dTurn(p, t * 0.025) * vec3(5.0, 70.0, 5.0)));
        col = mix(col, uLight, jet * exp(-p.y * p.y * 60.0) * 0.55);
        col = dPole(p, col, 1.0, ${d.sides[0].toFixed(1)}, t);
        col = dPole(p, col, -1.0, ${d.sides[1].toFixed(1)}, t);
        col = dStorm(p, col, uStorm, uStormCol, t);
        for (int i = 0; i < ${MAX_VORTICES}; i++) col = dStorm(p, col, uVort[i], uLight, t);
        diffuseColor.rgb = col;`);
    mat.userData.shader = sh;
  };
}

function gasDeck(world, planet) {
  const d = world.deck;
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.95, metalness: 0, transparent: true, depthWrite: false,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    sh.uniforms.uTop = { value: new THREE.Color(d.top) };
    sh.uniforms.uGap = { value: new THREE.Color(d.gap) };
    sh.uniforms.uStorm = { value: new THREE.Vector3(...world.storm.dir) };
    sh.uniforms.uStormSize = { value: world.storm.size };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDeck;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDeck = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDeck;
        uniform float uTime, uStormSize; uniform vec3 uTop, uGap, uStorm;
        ${DECK_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 p = normalize(vDeck);
        // Alternate bands flow east and west. Two layers turn the opposite ways, and the band
        // picks between them, so the flow never shears the pattern into noise.
        float east = dStreak(dTurn(p, uTime * 0.004)), west = dStreak(dTurn(p, -uTime * 0.003) + 3.1);
        float z = sin(p.y * ${(d.freq * 0.5).toFixed(3)} * 3.14159 + (east - 0.5) * 2.4);
        float n = mix(east, west, smoothstep(-0.35, 0.35, z));
        // The zones hold the clouds and the belts between them are clear, so the lower deck shows
        // through a belt. The streaks tear the edge of each zone.
        float cover = smoothstep(-0.15, 0.55, z + (n - 0.5) * 0.9);
        // A belt is not empty: it keeps a thin haze, so a whale under the deck is veiled.
        float a = 0.3 + cover * (0.2 + 0.45 * smoothstep(0.35, 0.7, n));
        // the great storm stands up through the deck, so the deck opens over it
        float st = acos(clamp(dot(p, uStorm), -1.0, 1.0)) / uStormSize;
        a *= smoothstep(0.55, 1.25, st);
        diffuseColor.rgb = mix(uGap, uTop, smoothstep(0.3, 0.8, n));
        diffuseColor.a = a;`)
      // A shell seen edge on draws a hard ring around the planet. The deck thins to nothing at the
      // limb, so the edge of the world is soft, as the edge of a gas is.
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        diffuseColor.a *= smoothstep(0.05, 0.45, abs(dot(normal, normalize(vViewPosition))));`);
    mat.userData.shader = sh;
  };
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(DECK_R, LOW ? 24 : 40), mat);
  mesh.renderOrder = 1;
  planet.add(mesh);
  return mat;
}

// The air over the upper deck. A shell with a hard edge reads as a skin, so this one has none: each
// pixel takes the height the view ray passes closest to the centre, and the haze thins by e for
// each HAZE_H of that height. Over the disc the body hides the back of the shell, so the haze only
// shows past the edge of the world, and at the horizon when the camera is low.
const HAZE_R = 1.16, HAZE_H = 0.03;
const gasHazeMat = (color) => new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(color) }, uSun: { value: sunDir.clone().normalize() } },
  vertexShader: `varying vec3 vW;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 color; uniform vec3 uSun; varying vec3 vW;
    void main(){
      vec3 d = normalize(vW - cameraPosition);
      float s = max(-dot(cameraPosition, d), 0.0);
      vec3 c = cameraPosition + d * s;          // the point of the ray closest to the centre
      float b = length(c);
      float i = exp(-max(b - 1.0, 0.0) / ${HAZE_H.toFixed(3)}) * (1.0 - smoothstep(${(HAZE_R - 0.03).toFixed(3)}, ${HAZE_R.toFixed(3)}, b));
      float lit = 0.2 + 0.8 * smoothstep(-0.35, 0.45, dot(c / max(b, 1e-4), uSun));
      i *= lit;
      gl_FragColor = vec4(color * i, i); }`,
  side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

// The dive of a whale on a gas giant: most of the time it swims in the clear gas between the
// decks, and now and then it rises through the upper deck and sinks back. Each whale keeps its own
// slow clock, so the herd does not rise as one.
function whaleDip(mv, t) {
  const s = Math.sin(t * mv.dip.w + mv.dip.ph);
  return mv.dip.base + (DECK_HIGH - 1 - mv.dip.base) * THREE.MathUtils.smoothstep(s, 0.2, 1);
}

// ---------------------------------------------------------------- render loop
const clock = new THREE.Clock();
// The clock counts the frame first, so the LOD controller of the ground reads this frame. A frame
// during the dive or during a world build says nothing about the scene the reader is in. The work
// of the frame is measured around step(), because the frame interval alone cannot show the
// headroom the machine has left. See perf.js.
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  perf.frame(now, !!probe.dive || busy);
  if (hud && now - hudAt >= HUD_MS) { hudAt = now; hud.update(perfRows()); }
  step(now);
  updateCreatureFloat();
  updateProbeFloat();
  perf.work(performance.now() - now);
}

function step(now) {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  if (probe.dive) stepDive(now);
  if (probe.mode === 'ground') {          // the globe stays in memory, but none of its work runs
    if (homeRun) stepHome(now);
    ground.update(t, dt);
    ground.render();
    probeHud.update(ground.telemetry(), now);
    // Twice a second: the address bar follows the ground camera, and the motif of the source that
    // runs follows the distance to it: the wreck in chapter 1, the ruin in chapter 2 (p2-44). Both
    // are cheap and neither needs a frame of its own.
    if (t - hashAt > 0.5) { hashAt = t; writeHash(); setCarrierLevel(); }
    return;
  }
  if (current) {
    const dist = camera.position.length();
    const zoomFactor = THREE.MathUtils.clamp((dist - CAM_MIN) / 1.6, 0.015, 1); // near the ground the world must hold still
    const hold = THREE.MathUtils.smoothstep(dist, PICK_RANGE, PICK_RANGE + 0.4);   // in the pick range it stops, so the site stays put
    // the planet holds still through a transition, so the fixed site cannot drift under the probe
    // the planet also holds still while the reader aims, so the square cannot drift off the ground
    const spin = probe.mode === 'orbit' && !aiming ? current.spin * zoomFactor * hold * (userActive ? 0.15 : 1) : 0;
    current.planet.rotation.y += spin * dt;
    current.cloudGroup.rotation.y += spin * 1.25 * dt;
    if (current.oceanMat?.userData.shader) current.oceanMat.userData.shader.uniforms.uTime.value = t;
    if (current.deckMat?.userData.shader) current.deckMat.userData.shader.uniforms.uTime.value = t;
    if (current.bodyMat?.userData.shader) current.bodyMat.userData.shader.uniforms.uTime.value = t;
    for (const fm of current.faunaMats) if (fm.userData.shader) fm.userData.shader.uniforms.uTime.value = t;
    updateMovers(t, dt);
    if (current.activity) current.activity.update(t, innerHeight * Q.dpr * 0.5 / Math.tan(camera.fov * Math.PI / 360));
    // the camera can sit inside the cloud layer when close: fade the puffs out
    if (current.cloudMat) {
      const op = 0.92 * THREE.MathUtils.smoothstep(camera.position.length(), 1.14, 1.32);
      current.cloudMat.opacity = op;
      current.cloudMat.depthWrite = op > 0.9; // faded puffs must not punch holes in the atmosphere
      current.cloudGroup.visible = op > 0.02;
    }
    stars.update(t, camera);
    // the fade of a new wedge, the models of the finds, and the lamp of the mini ruin, which blinks
    // the motif of the ruin on the clock of the song (p2-44)
    updateCarrierGroup(carrierGroup, dt, music);
    for (const m of current.moons) {
      m.angle += m.speed * dt;
      m.mesh.position.set(Math.cos(m.angle) * m.dist, 0, Math.sin(m.angle) * m.dist);
      m.mesh.rotation.y += dt * 0.3;
    }
  }
  if (probe.mode === 'orbit') {
    // near the surface, drags and wheel steps must move the camera much less
    const near = THREE.MathUtils.clamp((camera.position.length() - 1) / 2.3, 0.08, 1);
    controls.rotateSpeed = 0.7 * near;
    controls.zoomSpeed = 0.9 * Math.max(near, 0.2);
    controls.update();
    // near the surface, tilt the view toward the horizon so relief reads in profile
    const d = camera.position.length();
    const pitch = pitchFor(d);
    if (pitch > 0) camera.rotateX(pitch);
    updateSite(t);                  // the square follows the pointer while the reader aims
  } else {
    showMarker(probe.site, current); // the square stays on the fixed site through the transition
  }
  if (!warming) renderer.render(scene, camera);   // see warmShaders()
}
function pitchFor(d) { return (1 - THREE.MathUtils.smoothstep(d, CAM_MIN, 2.3)) * 0.95; }
requestAnimationFrame(frame);

// ---------------------------------------------------------------- the shader warm-up
// three.js builds the program of a material on the first draw that needs it, and the build blocks
// the frame it lands in. A world of a type the reader has not opened yet brings a whole set of new
// materials, so that one frame froze for 545 ms on an M2. A world of a type the page already holds
// costs 77 ms, which is the geometry and not the programs.
//
// compileAsync hands the build to the driver through KHR_parallel_shader_compile and resolves once
// the driver is done, so the wait sits under the overlay of the build and not in a frame. The frame
// loop draws nothing while it runs, because the first draw would build the programs itself and the
// warm-up would then save nothing. The canvas holds the last frame of the world before this one,
// and the overlay is over it, so the reader sees the same picture either way.
let warming = false;

// ms: the warm-up waits on a driver, so it takes a limit. A driver that never reports back would
// otherwise hold the frame loop for ever, and the reader would sit in front of a still picture.
// The first draw then pays for the programs, which is what the page did before the warm-up.
const WARM_MS = 4000;

async function warmShaders() {
  if (!renderer.compileAsync) return;     // an older three.js: the first draw pays, as before
  warming = true;
  try {
    await Promise.race([
      renderer.compileAsync(scene, camera),
      new Promise((r) => setTimeout(r, WARM_MS)),
    ]);
  } catch (e) {
    console.warn('[myworlds] the shader warm-up failed; the first frame pays for it', e);
  } finally { warming = false; }
}

// ---------------------------------------------------------------- the perf overlay
// The rows of `?perf`, read twice a second at the top of the frame. renderer.info holds the
// numbers of the last frame the renderer drew, because the renderer clears them inside render().
const hud = PERF ? new Hud() : null;
let hudAt = 0;
function perfRows() {
  const r = renderer.info.render;
  const fps = perf.avg > 0 ? 1000 / perf.avg : 0;
  const rows = [
    ['mode', probe.mode],
    ['frame', `${perf.avg.toFixed(2)} ms   ${fps.toFixed(0)} fps`],
    ['work', `${perf.avgWork.toFixed(2)} ms`],
    ['target', `${perf.target.toFixed(2)} ms   ${perf.hz} Hz${perf.hzDone ? '' : ' (estimating)'}`],
  ];
  if (probe.mode === 'ground' && ground) {
    const f = ground.flora, a = ground.fauna, c = ground.cover;
    rows.push(['lod', `${ground.lod.distance.toFixed(0)} m   [${ground.lod.min}, ${ground.lod.max}]`]);
    rows.push(['flora', f ? `${f.nearCount} near / ${f.cardCount} cards` : 'none']);
    rows.push(['cover', c ? `${c.count.sets.join(' / ')} blade tiles   ${c.count.stones} stone tiles` : 'none']);
    rows.push(['fauna', a ? `${a.nearCount} near / ${a.farCount} coarse` : 'none']);
    rows.push(['shadow', ground.sun && ground.sun.castShadow ? 'on' : 'off']);
    rows.push(['height', `${ground.cameraHeight.toFixed(0)} m over the ground`]);
  } else if (current) {
    rows.push(['world', `${current.world.seed}  ${current.world.type}`]);
    rows.push(['flora', `${current.world.floraCount || 0} plants`]);
    rows.push(['fauna', `${current.world.faunaCount || 0} animals`]);
  }
  rows.push(['draws', `${r.calls} calls   ${(r.triangles / 1000).toFixed(0)}k tris`]);
  return rows;
}

// ---------------------------------------------------------------- the landing site
// The probe lands where the reader taps. The site follows the pointer while the aim is on, it
// snaps to the cell under it, and it goes in the URL as #Seed@lat,lon. The pull runs first, so a
// creature that lives in the cell claims the patch; the snap then puts the site back on the grid,
// and the square marker shows the reader the exact ground the probe would bring back.
let site = null;          // { lat, lon, kind } or null while the aim is off
let pendingSite = null;   // a site read from the URL, used once the world is built
let pendingView = null;   // a camera read from the URL, used once the world is built: the orbit one on build, the ground one for the landing
let hashAt = 0;

function updateSite(t) {
  site = aiming ? snapSite(pullSite(pickSite(camera, current, aimNdc), current)) : null;
  showMarker(site, current);
  updateProbeBtn();
  if (t - hashAt > 0.5) { hashAt = t; writeHash(); }   // the address bar follows, but not every frame
}

// The whole view as a hash: the seed, the site while the probe is down, and the camera. The site
// goes in only while the probe is down, because a site in the URL means the ground.
function viewHash() {
  if (!current) return '';
  const onGround = probe.mode === 'ground' || probe.mode === 'descending';
  const view = onGround ? (probe.mode === 'ground' && ground ? ground.view : null) : orbitView();
  return viewToUrl(current.world.seed, onGround ? probe.site : null, view);
}

// The address bar follows the view, so the reader can copy it as well as press the share button.
// replaceState writes no history entry and fires no hashchange, and the write only runs when the
// text changed, so a camera at rest writes nothing.
function writeHash() {
  if (!current) return;
  const url = viewHash();
  if (url !== location.hash) history.replaceState(null, '', url);
}

// The orbit camera in the frame of the planet: the point of the globe under it and how far out it
// stands, in globe radii. The planet spins, so a direction in world space would not point at the
// same ground a minute later. The frame loop adds the pitch, and the pitch follows the distance,
// so these three numbers hold the whole view.
function orbitView() {
  if (!current) return null;
  const dist = camera.position.length();
  if (!(dist > 0)) return null;
  current.planet.updateWorldMatrix(true, false);
  const s = dirToSite(current.planet.worldToLocal(_view.copy(camera.position)).normalize());
  return { kind: 'orbit', lat: s.lat, lon: s.lon, dist };
}

// Drop the damped rest of a drag or a zoom. One update with the damping off clears the deltas.
function flushControls() {
  const damp = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = damp;
}

const _want = new THREE.Vector3(), _rotM = new THREE.Matrix4(), _turn = new THREE.Quaternion();
const _view = new THREE.Vector3();

// Put the orbit camera where a link asks: over the point of the globe it names, at the distance it
// names. The mirror of orbitView(). Returns false when there is no camera in the URL, and the
// caller then falls back to the camera a new world gets.
function placeCameraAtView(v) {
  if (!current || !v || v.kind !== 'orbit') return false;
  flushControls();
  current.planet.updateWorldMatrix(true, false);
  _rotM.extractRotation(current.planet.matrixWorld);
  siteDir(v.lat, v.lon, _want).applyMatrix4(_rotM).normalize();
  controls.target.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  camera.position.copy(_want).multiplyScalar(THREE.MathUtils.clamp(v.dist, CAM_MIN, CAM_MAX));
  controls.update();
  return true;
}

// Put the camera at the minimum distance and turn it until the screen centre lands on the site.
// The view pitches toward the horizon near the surface, so the answer needs a few steps.
function placeCameraOverSite(target) {
  if (!current || current.world.type === 'gas') return false;
  flushControls();       // a damped drag or zoom must not pull the camera off the site
  current.planet.updateWorldMatrix(true, false);
  _rotM.extractRotation(current.planet.matrixWorld);
  siteDir(target.lat, target.lon, _want).applyMatrix4(_rotM).normalize();
  controls.target.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  camera.position.copy(_want).multiplyScalar(CAM_MIN);
  controls.update();
  for (let i = 0; i < 24; i++) {
    controls.update();
    const p = pitchFor(camera.position.length());
    if (p > 0) camera.rotateX(p);
    const hit = pickDirs(camera, current);
    if (!hit) break;
    if (hit.world.angleTo(_want) < 1e-6) break;
    _turn.setFromUnitVectors(hit.world, _want);
    camera.position.applyQuaternion(_turn);
  }
  controls.update();
  return true;
}

// ---------------------------------------------------------------- the aim
// The reader presses the button, the app shows the message, and the next tap on the planet sends
// the probe to the cell under the tap. The square follows the pointer while the aim is on, so the
// reader sees the ground before the tap. A drag turns the planet and sends nothing.
let aiming = false;
const aimNdc = new THREE.Vector2(0, 0);

// The pointer in normalised device coordinates, the frame the raycaster reads.
function setAimNdc(x, y) {
  const r = canvas.getBoundingClientRect();
  aimNdc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
}

function startAim() {
  if (aiming || !canDescend()) return;
  aiming = true;
  aimEl.hidden = false;
  canvas.style.cursor = 'crosshair';
  if (COMPACT) setCollapsed(true);   // the sheet covers the planet the reader must tap
  updateProbeBtn();
}

function stopAim() {
  if (!aiming) return;
  aiming = false;
  aimEl.hidden = true;
  canvas.style.cursor = '';
  site = null;
  showMarker(null, current);
  updateProbeBtn();
}

// The tap that sends the probe. A tap that misses the planet keeps the aim on.
function aimAt(x, y) {
  setAimNdc(x, y);
  const target = snapSite(pullSite(pickSite(camera, current, aimNdc), current));
  if (target) descend(target);
}

// ---------------------------------------------------------------- the probe: descent and ascent
// probe.js holds the state of a landing: the mode (orbit, descending, ground, or ascending), the
// site, the dive, the patch, and the fix, the stage, and the key of what the landing heard. It
// changes them only through its own calls. This section builds and drops the ground scene, moves
// the camera, and draws the cover, on the events of probe.step(). The globe scene stays in memory
// in every mode. In ground mode the globe is not drawn and none of its per-frame work runs.
const probe = new Probe();
let ground = null;        // the Ground instance while the probe is down

// The patch for the site the probe dives to. The dive holds the screen until the reply lands, so the
// reader never sees the ground build. The reply goes to the descent that asked for it.
function requestPatch(label = null) {
  const t0 = performance.now();
  const job = probe.job, target = probe.site;
  if (diveLabel) diveLabel.textContent = label || 'Sending the probe';
  patchJob = {
    progress: (msg) => { if (diveLabel && !label) diveLabel.textContent = msg.label; },
    done: (result) => {
      patchJob = null;
      probe.patchDone(job, result);
      const p = result.patch;
      console.info(`[myworlds] patch "${p.patchSeed}" ${p.biome} at ${p.elevation.toFixed(0)} m, cell ${(p.span / 1000).toFixed(1)} km, ${p.metresAcross.toFixed(0)} m/unit across and ${p.metresUp.toFixed(1)} up, ${p.n}x${p.n}, worker ${Math.round(performance.now() - t0)} ms`);
    },
    fail: (message) => {
      patchJob = null;
      probe.patchDone(job, null);
      console.error('[myworlds] patch failed:', message);
    },
  };
  getWorker().postMessage({
    type: 'patch', seed: current.world.seed,
    site: { lat: target.lat, lon: target.lon, kind: target.kind ?? -1 }, opts: pOpts(),
  });
}

// The point over the site in world space, at the ground radius plus an extra height.
function siteWorldPoint(target, extra, out = new THREE.Vector3()) {
  current.planet.updateWorldMatrix(true, false);
  _rotM.extractRotation(current.planet.matrixWorld);
  siteDir(target.lat, target.lon, out);
  const r = Math.max(groundRadius(current.world, current.heightMap, out), current.world.seaRadius || 0);
  return out.applyMatrix4(_rotM).normalize().multiplyScalar(r + extra);
}

function canDescend() {
  return probe.mode === 'orbit' && !busy && !!current && current.world.type !== 'gas';
}

// Send the probe down. The site is fixed here, so nothing moves under the probe on the way. `view`
// is the ground camera of a shared link, for this landing.
function descend(target = site, view = null) {
  if (!canDescend() || !target) return;
  stopAim();
  const path = {
    from: camera.position.clone(),
    to: siteWorldPoint(target, 0.004),
    look: siteWorldPoint(target, -0.4),   // a point under the site holds the aim steady
  };
  probe.descend(target, performance.now(), { view, path });
  controls.enabled = false;
  writeHash();
  updateProbeBtn();
  diveEl.style.background = current.world.palette.atmo || '#8fb7ff';
  requestPatch();
}

// Recall the probe. The mirror of the descent: close the cover, switch, and open it over the site.
function ascend() {
  if (!probe.ascend(performance.now())) return;
  ground.controls.enabled = false;
  updateProbeBtn();
}

// One frame of the dive: the camera of the descent, the cover, and the event of the probe.
function stepDive(now) {
  const s = probe.step(now);
  if (!s) return;
  if (s.kind === 'jump') { stepJump(s); return; }
  if (s.path && s.phase === 'in') {
    camera.position.lerpVectors(s.path.from, s.path.to, s.k);
    camera.lookAt(s.path.look);
  }
  diveEl.style.opacity = String(s.cover);
  if (s.event === 'enter') enterGround(s.patch, s.view);
  else if (s.event === 'leave') leaveGround();
  else if (s.event === 'landed') { if (ground) ground.controls.enabled = true; updateProbeBtn(); }
  else if (s.event === 'surfaced') surface(s.fix);
  if ((s.event === 'enter' || s.event === 'leave') && diveLabel) diveLabel.textContent = '';
}

// The carrier of the landing on the site of the probe, for the search the receiver follows, and the
// fix that landing takes. enterGround() calls it, and showProgress() calls it again after a tune or
// a find while the probe stands on the ground, so the landing that tunes takes the first fix of the
// new search.
//
// land() of chapters.js holds the rules: the bearing, the needle in the frame of the box, the kind
// and the band of the source, the fix, and the stage of the brief. Decision 9 of issue 34: a
// landing takes the fix on its own, and no button asks for it. A landing that comes from a URL with
// a site takes one too, because the probe stood on that cell and heard the carrier there.
//
// The wedge waits for the ascent: the reader is on the ground now and the globe is not drawn. See
// surface().
function hearCarrier() {
  const heard = progress && probe.site ? progress.land(probe.site) : null;
  probe.hear({
    fix: heard && carrierGroup ? heard.fix : null,
    stage: heard ? heard.stage : null,
    heard: heard ? heardOf(progress.view()) : null,
  });
  return heard ? heard.carrier : null;
}

// The search the receiver follows and its state, as one key. A landing keeps the key of the search
// it heard, and showProgress() reads the carrier again when the key changes.
function heardOf(v) {
  return v && v.follow ? `${v.follow.id}:${v.chapters[v.follow.index].state}` : null;
}

// The search the receiver follows holds `fix`: a clear, a find, and a tune drop the fix of a landing.
function followHolds(fix) {
  const v = carrierView();
  const c = v && v.follow && v.chapters[v.follow.index];
  if (!c) return false;
  const cell = siteCell(fix.lat, fix.lon);
  return c.fixes.some((f) => sameCell(siteCell(f.lat, f.lon), cell));
}

// The switch into the ground scene, under the closed cover. `result` is the patch, or null when it
// failed, and `view` is the ground camera of a shared link, or null.
function enterGround(result, view) {
  const at = probe.site;
  ground = new Ground({
    renderer, canvas, world: current.world, site: at, tier: Q.ground,
    // The lamp of the wreck blinks the rhythm of the motif on the bar clock of the song, so the
    // eye and the ear agree. Issue 34, slice 3.
    music,
    onSelect: (kind) => { markedKind = kind; markedPlant = null; markedSource = false; markedPerson = null; },
    onSelectPlant: (kind) => { markedPlant = kind; markedKind = null; markedSource = false; markedPerson = null; },
    onSelectSource: () => { markedSource = true; markedKind = null; markedPlant = null; markedPerson = null; },
    // Chapter 3: a person of the crew at the twin. The floating button offers the talk.
    onSelectPerson: (name) => { markedPerson = name; markedKind = null; markedPlant = null; markedSource = false; },
    onDeselect: () => { markedKind = null; markedPlant = null; markedSource = false; markedPerson = null; },
  });
  // The plant lore of this patch. It arrives with the patch, because it reads the biome of the
  // site, and it goes away with the patch. See describePatchFlora() in generate.js.
  groundPlants = (result && result.patch.plants) || [];
  groundVariant = (result && result.patch.floraVariant) || 0;
  // the sun, the moons, and the ring of the globe, read in the frame of the site: only the app
  // knows planet.rotation.y, so the app turns them and the ground draws them
  const sky = skyView(current, at, sunDir, cellTwist(at));
  sky.starLight = stars.lightColor();   // the ground sun takes the colour of the star
  const carrier = hearCarrier();
  const t0 = performance.now();
  ground.load(result, { sunDir: sky.sunDir, view: sky, carrier });
  if (result) console.info(`[myworlds] ground mesh built in ${Math.round(performance.now() - t0)} ms`);
  if (view) ground.setView(view);   // a shared link brings its own camera
  // Chapter 3: on a landing at the twin after the read of the third log, the people of the tent
  // stand outside already.
  const wv = progress && progress.view().way;
  // After the way home the tent stands empty.
  if (ground.crew && wv && wv.read && !wv.home) ground.crew.release(false);
  ground.resize(innerWidth, innerHeight);
  probeHud.resize(innerWidth, innerHeight, Q.dpr);
  probeHud.show();
  // The landing took a fix, so the progress changed. The sidebar gains its flora row, the Carrier
  // row counts the fix, and the fifth block pulses. Risk 4 of issue 34: a reader may never look at
  // the fifth block. The block pulses on every landing that hears the carrier until the reader
  // opens the brief of this stage of the search, and it stands quiet after the find as well,
  // because a reader who has read the log knows what the block is.
  showProgress();
  perf.reset();       // the orbit frames say nothing about the ground
  showMarker(null, current);
  writeHash();
}

// The ground scene and everything that belongs to the patch: the plant card, the overlay, the
// marks, and the plant lore. The switch back to the globe and an abort both drop it.
function dropGround() {
  if (plantInspector.open) closeCard();   // the plant of a patch cannot be studied from orbit
  probeHud.hide();
  if (ground) { ground.dispose(); ground = null; }
  markedKind = null; markedPlant = null; markedSource = false; markedPerson = null;
  crewWaits = false;
  groundPlants = []; groundVariant = 0;
  perf.reset();       // the ground frames say nothing about the globe
}

// The switch back to the globe, under the closed cover. The probe has dropped the stage of the
// landing, and it keeps the fix for the end of the ascent.
function leaveGround() {
  dropGround();
  setCarrierLevel();  // the probe has left the cell, so the motif takes its orbit level
  if (current) renderInfo(current.world);  // the sidebar loses its flora row
  if (probe.site) placeCameraOverSite(probe.site);
  writeHash();
}

// The cover is open over the globe, and the probe is in orbit. The ascent ends over the site, so the
// new wedge arrives where the reader is already looking. It fades in over 1.2 s. Risk 4 of issue
// 34: a reader who never reads the fifth block still sees the globe answer the landing. A clear, a
// find, or a tune on the ground can drop the fix first, so the wedge fades in only while the search
// still holds it.
function surface(fix) {
  controls.enabled = true;
  if (fix && carrierGroup && followHolds(fix)) addWedge(carrierGroup, fix, { fade: true });
  // The sidebar is back in orbit, so the Carrier row shows its Aim chips again.
  if (current) renderInfo(current.world);
  updateProbeBtn();
}

// A new world always returns to orbit, whatever the probe was doing. The fix of a landing goes with
// it, because the ascent it waited for will not come.
function abortProbe() {
  stopAim();
  if (!probe.abort()) return;
  dropGround();
  controls.enabled = true;
  setCarrierLevel();       // the probe is off the ground, so the motif takes its orbit level
  diveEl.style.opacity = '0';
  if (diveLabel) diveLabel.textContent = '';
  updateProbeBtn();
}

let probeLabel = '';
// The help line follows the reader. The ground gets its own gestures since issue 23, and a line
// that still said "drag to spin" would send the reader looking for a control that is not there.
function updateHelp() {
  if (!helpEl) return;
  const text = probe.mode === 'ground' ? HELP_GROUND : HELP_ORBIT;
  if (helpEl.textContent !== text) helpEl.textContent = text;
}

function updateProbeBtn() {
  if (!probeBtn) return;
  updateHelp();
  const down = probe.mode === 'ground';
  const show = !probe.dive && !busy && (down || canDescend());
  const label = down ? 'Recall the probe' : aiming ? 'Cancel the probe' : 'Send a probe to the surface';
  const changed = probeBtn.hidden === show || probeLabel !== label;
  probeBtn.hidden = !show;
  probeBtn.textContent = label;
  probeLabel = label;
  // The header carries the same probe as an icon. It shows and says the same thing, and it stays
  // on screen while the sidebar is folded away, where the text button cannot go.
  if (probeIconBtn) {
    probeIconBtn.hidden = !show;
    probeIconBtn.setAttribute('aria-label', label);
    probeIconBtn.title = label;
    probeIconBtn.setAttribute('aria-pressed', String(down || aiming));
  }
  // The button only moves into view when it appears or when it changes what it says. A call on
  // every frame of the dive would fight the scroll of the reader.
  if (show && changed) showProbeBtn();
}

// ---------------------------------------------------------------- the floating probe button
// The zoom used to carry the reader between the two places: half a second of zoom out at the
// ceiling of the ground recalled the probe. That reads as a fault. A reader who pulls back to see
// more of the patch is thrown off the world, and the gesture that framed the view also ended it.
//
// The zoom now stops at the limit and does nothing else, and the limit offers the journey instead.
// At the ceiling of the ground the button recalls the probe. At the closest zoom of the globe it
// sends one. It only shows at the limit, where the zoom has nothing left to give and the reader who
// keeps pulling is asking to travel, so it never covers a view the reader is still moving.
const FLOAT_NEAR = CAM_MIN + 0.005;   // globe radii: the camera counts as fully zoomed in here
let floatLabel = '';
function updateProbeFloat() {
  if (!probeFloat) return;
  let label = '';
  if (!probe.dive && !busy && !aiming) {
    // The two floating buttons share one place on the screen. At the ceiling the recall takes it,
    // because the reader who pulls back to the limit asks to travel; the mark stays on the ground.
    if (probe.mode === 'ground' && ground && ground.atCeiling) label = 'Recall the probe';
    else if (canDescend() && camera.position.length() <= FLOAT_NEAR) label = 'Send a probe to the surface';
  }
  if (label === floatLabel) return;
  floatLabel = label;
  // The text holds through the fade out, so the reader never reads a label change on a button
  // that is going away.
  if (label) probeFloat.textContent = label;
  probeFloat.classList.toggle('show', !!label);
}
if (probeFloat) probeFloat.addEventListener('click', onProbeClick);

// ---------------------------------------------------------------- the marked animal button
// One tap on an animal marks it: a ring lies on the ground under it, and this button offers its
// card, the way the floating probe button offers the journey. The card then opens from the
// button, so no tap ever covers the view the reader is crossing with a card. The button hides
// while the card is open, and it comes back when the card closes, so the reader can reopen it.
// A tap on the ground, the Escape key, or the recall of the probe takes the mark off.
//
// Issue 24 gives the plants the same button. A tap on a plant marks it the same way and this
// button offers its card, so the reader learns one gesture and it works on everything that grows
// or walks. Only one thing is marked at a time, so the button always names what the ring is under.
let markedKind = null;    // the species of the marked animal, or null while nothing is marked
let markedPlant = null;   // the kind of the marked plant, or null while nothing is marked
// Issue 34: the wreck takes the same button. One patch holds at most one wreck, so a flag says all
// there is to say. The button then reads "Download the log" and it opens the card of the source.
let markedSource = false;
// Chapter 3: the name of the marked person of the crew at the twin, or null. The button offers the talk.
let markedPerson = null;
let creatureLabel = '';
// The plants of the patch the probe is standing on, tallest first, and the flora signature the
// card builds a preview with. Both are empty in orbit, because a plant belongs to a patch.
let groundPlants = [];
let groundVariant = 0;
const plantOf = (kind) => groundPlants.find((p) => p.kind === kind) || null;

function updateCreatureFloat() {
  if (!creatureFloat) return;
  let label = '';
  // At the ceiling the recall of the probe takes the spot. See updateProbeFloat().
  if (probe.mode === 'ground' && !probe.dive && !busy && creatureCard.hidden && !(ground && ground.atCeiling)) {
    if (markedKind !== null) {
      const G = current && current.world.species[markedKind];
      if (G) label = `Study the ${G.lore.name}`;
    } else if (markedPlant !== null) {
      const p = plantOf(markedPlant);
      if (p) label = `Study the ${p.lore.name}`;   // the same form the animal takes, so one button reads one way
    } else if (markedSource) {
      // The wreck is not a subject to study. The probe pulls the log off its recorder, so the button says that.
      // The ruin is a subject, and the button takes the form the animal and the plant take. p2-41.
      // The source of a closed chapter has no card, and the button says so. ADR-0001.
      const kind = ground && ground.source && ground.source.kind;
      label = progress && progress.state(chapterOfKind(kind)) === 'closed' ? CLOSED_LINE
        : kind === 'ruin' ? 'Study the ruin'
          : kind === 'twin' ? (current && current.world.twin && current.world.twin.log ? 'Read the log of the crew' : 'Study the twin')
            : 'Download the log';
    } else if (markedPerson) {
      label = `Talk to ${markedPerson}`;
    }
  }
  if (label === creatureLabel) return;
  creatureLabel = label;
  if (label) creatureFloat.textContent = label;
  creatureFloat.classList.toggle('show', !!label);
}
if (creatureFloat) {
  creatureFloat.addEventListener('click', () => {
    if (markedKind !== null) inspect(markedKind);
    else if (markedPlant !== null) inspectPlant(markedPlant);
    else if (markedSource) (ground && ground.source && ground.source.kind !== 'wreck' ? inspectRuin : inspectSource)();
    else if (markedPerson) openTalk(markedPerson);
  });
}

// creatures roam around their home spot on procedural paths, follow the ground, and stay out of the sea
const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _up = new THREE.Vector3(), _m = new THREE.Matrix4();
let moverFrame = 0;
function updateMovers(t, dt) {
  const { movers, world, heightMap } = current;
  if (!movers.length) return;
  moverFrame++;
  const far = camera.position.length() > 2.6; // sub-pixel from far away: step at ~15 Hz
  if (far && moverFrame % 4) return;
  if (far) dt *= 4;
  const dirty = new Set();
  const anchored = new Set();   // the meshes whose tendon moved this frame. Slinger, issue 28.
  const seaR = world.seaRadius || 0;
  for (const mv of movers) {
    const pu = mv.u, pv = mv.v;
    stepAny(mv, t, dt);
    _u.copy(mv.n).addScaledVector(mv.t1, mv.u).addScaledVector(mv.t2, mv.v).normalize();
    let ground = groundRadius(world, heightMap, _u);
    if (!mv.flies && mv.dry && ground < seaR + 0.0005) {
      // water ahead: step back and turn around. A throw in flight ends here, because it holds one
      // heading and would drive the body into the same water for the rest of the throw.
      mv.u = pu; mv.v = pv; mv.heading += Math.PI * 0.75; mv.spd = 0;
      impulseBlocked(mv);
      _u.copy(mv.n).addScaledVector(mv.t1, mv.u).addScaledVector(mv.t2, mv.v).normalize();
      ground = groundRadius(world, heightMap, _u);
    }
    if (mv.flies) ground = Math.max(ground, seaR);
    let pitch = 0;
    if (mv.dip) {
      // The nose follows the dive: the pitch is the climb against the ground the whale covers.
      const h = whaleDip(mv, t), run = Math.hypot(mv.u - pu, mv.v - pv);
      if (mv.hover !== undefined && dt > 0) pitch = THREE.MathUtils.clamp(Math.atan2(h - mv.hover, run + 1e-6), -0.5, 0.5);
      mv.pitch = THREE.MathUtils.lerp(mv.pitch || 0, pitch, Math.min(1, dt * 1.5));
      pitch = mv.pitch;
      mv.hover = h;
    }
    _p.copy(_u).multiplyScalar(ground + mv.hover);
    _f.copy(mv.t1).multiplyScalar(Math.cos(mv.heading)).addScaledVector(mv.t2, Math.sin(mv.heading));
    _f.addScaledVector(_u, -_f.dot(_u)).normalize();
    _r.crossVectors(_u, _f).normalize();
    if (pitch) {
      // turn the forward and the up about the right axis, so the body tips into the dive
      const c = Math.cos(pitch), s = Math.sin(pitch);
      _up.copy(_u).multiplyScalar(c).addScaledVector(_f, -s);
      _f.multiplyScalar(c).addScaledVector(_u, s);
      _u.copy(_up);
    }
    _m.makeBasis(_r.multiplyScalar(mv.sc), _u.multiplyScalar(mv.sc), _f.multiplyScalar(mv.sc));
    _m.setPosition(_p);
    mv.inst.setMatrixAt(mv.j, _m);
    const at = mv.inst.geometry.attributes;
    const act = mv.flies ? 1 : moverActivity(mv);
    const a = at.aAnim.array, o = mv.j * 4;
    if (!mv.flies) a[o] = act;                 // legs only swing while it walks
    // ---- roller (issue 28) ----
    // The gait clock reads the ground the animal really covered, and not the speed the wander
    // asked for. An impulse animal covers the whole of its ground in one throw, so the two are not
    // one number: a ball driven by the wander speed would turn while it stood still. A wander
    // species covers its speed times the step, so the measure gives it what it had before, and a
    // step the water branch took back gives no ground at all.
    if (mv.gait) a[o + 1] = stepGait(mv.gait, Math.hypot(mv.u - pu, mv.v - pv) / dt, act, dt);
    a[o + 2] = mv.turnN;             // turnN already falls to zero as the animal slows
    if (mv.impulse) a[o + 3] = mv.burst;
    // The hold the tendon is on, in the frame of this instance. Only a species that holds a point
    // in the world writes here; every other one leaves the three floats at zero. Slinger, issue 28.
    if (mv.holds) {
      const an = at.aAnchor.array, no = mv.j * 3;
      an[no] = mv.ax; an[no + 1] = mv.ay; an[no + 2] = mv.az;
      anchored.add(mv.inst);
    }
    dirty.add(mv.inst);
  }
  for (const inst of dirty) {
    const at = inst.geometry.attributes;
    inst.instanceMatrix.needsUpdate = true;
    at.aAnim.needsUpdate = true;
  }
  for (const inst of anchored) inst.geometry.attributes.aAnchor.needsUpdate = true;
}
// ---------------------------------------------------------------- worker / generation
// One worker serves two jobs: the globe and the ground patch. Only one of them runs at a time,
// because a new world always recalls the probe first, so progress and error belong to the job
// that is open.
let worker = null;
let busy = false;
let genJob = null, patchJob = null;
function getWorker() {
  if (worker) return worker;
  worker = new Worker('./worker.js', { type: 'module' });
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === 'done') { if (genJob) genJob.done(msg.result); return; }
    if (msg.type === 'patch-done') { if (patchJob) patchJob.done(msg.result); return; }
    const job = genJob || patchJob;
    if (!job) return;
    if (msg.type === 'progress') job.progress(msg);
    else if (msg.type === 'error') job.fail(msg.message);
  };
  return worker;
}

function generate(seed, { save = true } = {}) {
  seed = seed.trim();
  if (!seed || busy) return;
  busy = true;
  abortProbe();               // a new world always comes back to orbit and drops the aim
  updateProbeBtn();
  const genStart = performance.now();
  overlay.classList.add("show");
  overlayBar.style.width = '2%';
  overlayLabel.textContent = 'Seeding the void';
  const w = getWorker();
  patchJob = null;              // a new world drops the patch the probe was waiting for
  genJob = {
    progress: (msg) => {
      overlayBar.style.width = `${msg.pct.toFixed(0)}%`;
      overlayLabel.textContent = msg.label;
    },
    done: async (result) => {
      const msg = { result };
      genJob = null;
      overlayBar.style.width = "100%";
      const t0 = performance.now();
      buildWorld(msg.result);
      const wanted = pendingSite;
      const view = pendingView;
      pendingSite = null; pendingView = null;
      const orbit = view && view.kind === 'orbit' ? view : null;
      if (!(wanted && placeCameraOverSite(wanted)) && !placeCameraAtView(orbit)) resetCamera();
      console.info(`[myworlds] "${seed}" ${msg.result.world.type} built in ${Math.round(performance.now() - t0)} ms, worker ${Math.round(t0 - genStart)} ms, flora ${msg.result.world.floraCount}, fauna ${msg.result.world.faunaCount}`);
      // The programs of the new materials build here, under the overlay, and not in the first draw
      // that needs them. This has to stand before saveWorld(), because the thumbnail of a world is
      // a frame of it: makeThumb() draws the scene, and that draw would build the programs itself.
      // See warmShaders().
      await warmShaders();
      renderInfo(msg.result.world);
      music.play(msg.result.world);
      // The motif of the new world starts where its search stands: silent on a world with no find,
      // and under the song on a world the reader has already solved. Issue 34, slice 5.
      setCarrierLevel();
      if (save) saveWorld(msg.result.world);
      // A shared link with a site lands the reader on the ground, with the ground camera of the link.
      const landing = wanted && current.world.type !== 'gas' ? wanted : null;
      const landView = view && view.kind === 'ground' ? view : null;
      writeHash();
      input.value = seed;
      if (COMPACT) setCollapsed(true);
      setTimeout(() => {
        overlay.classList.remove("show"); busy = false;
        if (landing) descend(landing, landView); else updateProbeBtn();
      }, 250);
    },
    fail: (message) => {
      genJob = null;
      overlayLabel.textContent = 'Generation failed. See console.';
      console.error(message);
      setTimeout(() => { overlay.classList.remove('show'); busy = false; }, 1500);
    },
  };
  w.onerror = (err) => {
    console.error(err);
    overlayLabel.textContent = 'Worker failed to load. Serve over http, not file://.';
    setTimeout(() => { overlay.classList.remove('show'); busy = false; }, 2500);
  };
  w.postMessage({ type: 'generate', seed, opts: wOpts() });
}

function resetCamera() {
  const hasRings = !!current?.world.rings;
  camera.position.set(0, hasRings ? 1.8 : 0.9, hasRings ? 4.6 : CAM_HOME);
  controls.target.set(0, 0, 0);
  controls.update();
}

// ---------------------------------------------------------------- thumbnails & storage
function makeThumb() {
  renderer.render(scene, camera);
  const src = renderer.domElement;
    const size = 96;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const s = Math.min(src.width, src.height) * 0.62;
  ctx.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.75);
}

function loadWorlds() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
}
// The saved worlds. This writes STORE_KEY and nothing else, so the quota fallback below can never
// drop the search of a world: the fixes of the carrier live under a key of their own. Decision 10
// of issue 34, and carrier-store.js.
function persist(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); }
  catch (e) {
    // quota: drop oldest and retry once
    list.splice(0, Math.ceil(list.length / 4));
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* give up quietly */ }
  }
}
function saveWorld(world) {
  let thumb = '';
  try { thumb = makeThumb(); } catch (e) { console.warn('thumb failed', e); }
  const list = loadWorlds().filter((w) => w.seed !== world.seed);
  list.push({ seed: world.seed, type: world.type, typeLabel: world.typeLabel, designation: world.designation, ts: Date.now(), thumb });
  while (list.length > MAX_SAVED) list.shift();
  persist(list);
  renderWorlds();
}
function deleteWorld(seed) {
  persist(loadWorlds().filter((w) => w.seed !== seed));
  renderWorlds();
}

function renderWorlds() {
  const list = loadWorlds().slice().reverse();
  const marks = marksOf();      // one read of the carrier store answers the whole list
  worldsEl.innerHTML = '';
  if (!list.length) {
    worldsEl.innerHTML = '<p class="empty">No worlds yet. Type a name above.</p>';
    return;
  }
  for (const w of list) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'world' + (current && current.world.seed === w.seed ? ' active' : '');
    el.title = `${w.seed} · ${w.typeLabel}`;
    // A world whose source the reader has found carries a mark on its thumb, one for each find: the
    // wreck, and then the ruin of phase 2. Issue 34, slice 2, and p2-38. See marksOf() in chapters.js.
    const m = marks.get(w.seed);
    const mark = m ? `<i class="found" title="${m.title}">${m.text}</i>` : '';
    el.innerHTML = `<img alt="" src="${w.thumb || ''}"><span class="wname">${escapeHtml(w.seed)}</span><span class="wtype">${escapeHtml(w.typeLabel || w.type)}</span>${mark}<i class="del" title="Forget this world">×</i>`;
    el.querySelector('img').addEventListener('error', (e) => { e.target.style.visibility = 'hidden'; });
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('del')) { e.stopPropagation(); deleteWorld(w.seed); return; }
      generate(w.seed);
    });
    worldsEl.appendChild(el);
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------------------------------------------------------- the Carrier row, issue 34
// The row states the search of this world: nothing heard, the fixes it holds, or the find. A gas
// giant gets no probe and a world where makeSource() found no cell has nothing to hear, so both
// hide the row. The button drops the wedges and keeps the find, because a reader who has found the
// wreck has earned the mark and no button takes it back.
//
// The row follows the search the receiver follows. rowOf() in chapters.js writes its words; see
// view() there. The view of the world on the screen, or null where the world takes no row.
function carrierState(w) {
  if (!w || !progress || progress.seed !== w.seed) return null;
  const v = progress.view();
  return v.row ? v : null;
}

// ---------------------------------------------------------------- the brief of the carrier
// The reader lands, the fifth block pulses, and a press on it opens this. The brief follows the
// landing, and it names no control the reader has to find. Three stages:
//
//   1  far      the probe hears the carrier. The brief says how the wedges find the cell from orbit.
//   2  cross    the cell lies inside two or more of the earlier wedges, or the range of decision 7
//               shows, but it is not the cell of the carrier. The brief says what to do in orbit.
//   3  landing  the cell of the carrier. The wreck stands inside the reach of the probe, and the
//               brief says to follow the needle.
//
// A press on the block marks the stage read, and the pulse stops. A landing of a later stage pulses
// again, because its brief is new. The block stays a control on every landing, so the reader can
// read the brief of that landing again.
//
// The ground takes no pointer lock, so nothing has to be released here. The overlay itself takes no
// pointer event except on that one block, so the press never starts a look drag and never picks.
//
// Every search after the first reads an unknown signal, and takes the second sheet of the drawings,
// with the wedges in the colour of that search. The progress keeps a brief mark for each search, so
// the block pulses again on the first landing after the tune. The words live in briefWords() of
// chapters.js, and the stage of a landing comes from land() there. p2-38.
const briefDlg = $('#carrier-brief');

// The pulse of the fifth block, from the stage of this landing and the stage the reader has read
// in the chapter that runs. The block also takes the colour of the chapter: the blue of the
// overlay in chapter 1, and in chapter 2 the colour of the wedges of the ruin, lightened as the
// drawings of the brief take it. A landing and a tune on the ground both call this, so the block
// changes colour at the moment of the tune. p2-39.
function setBriefPulse() {
  const st = probe.stage;
  const chapter = carrierChapter();
  probeHud.setTint(chapter > 1 && current ? briefColour(current.world, chapter) : null);
  probeHud.setPulse(!!(st && st.pulse), st ? st.hint : null);
}

// The colour the wedges of the drawings take in chapter 2: the colour of chapter 2 on this world.
// The card of the brief is dark, so a dark candidate of pickCarrierColour() gets lighter, and keeps
// its hue, until its luminance reaches BRIEF_LUMA and it reads on the card. The lightness of HSL is
// no test for this: a saturated blue stands at a lightness of 0.56 and a luminance of 0.13. The
// blue of the drawings of issue 34, #7cc4ff, stands at 0.51.
const BRIEF_LUMA = 0.3;
const _briefCol = new THREE.Color();
const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;   // THREE.Color holds linear RGB
function briefColour(world, chapter = 2) {
  _briefCol.set(carrierColour(world, chapter));
  const hsl = { h: 0, s: 0, l: 0 };
  _briefCol.getHSL(hsl);
  for (let l = hsl.l; luma(_briefCol) < BRIEF_LUMA && l < 0.9; l += 0.02) _briefCol.setHSL(hsl.h, hsl.s, l);
  return '#' + _briefCol.getHexString();
}

// Show the part of the brief for one stage of the chapter that runs. A landing with no stage,
// which only the debug hook can open, gets stage 1.
function fillBrief(st) {
  const n = st ? st.n : 1;
  const chapter = carrierChapter();
  const words = st || briefWords(chapter - 1, n);
  briefDlg.dataset.chapter = String(words.sheet);
  if (words.sheet === 2 && current) briefDlg.style.setProperty('--brief-wedge', briefColour(current.world, chapter));
  briefDlg.querySelector('#carrier-brief-title').textContent = words.title;
  briefDlg.querySelectorAll('[data-chapter]').forEach((el) => { el.hidden = +el.dataset.chapter !== words.sheet; });
  briefDlg.querySelectorAll('[data-stage]').forEach((el) => { el.hidden = +el.dataset.stage !== n; });
  briefDlg.querySelectorAll('[data-next]').forEach((el) => { el.hidden = !st || el.dataset.next !== st.next; });
  if (st && st.next === 'near') {
    briefDlg.querySelector('[data-cells]').textContent = st.cells === 1 ? '1 cell' : `${st.cells} cells`;
    briefDlg.querySelector('[data-brg]').textContent = `${String(Math.round(st.brg) % 360).padStart(3, '0')}°`;
  }
}

function openBrief() {
  if (!briefDlg || briefDlg.open) return;
  fillBrief(probe.stage);
  // The ground listens for the flight keys on the window, and the keys of a modal dialog still
  // reach it. So the controls of the ground stop while the brief stands open, and the close gives
  // them back. A drag stops with them, which is what a modal asks for.
  if (ground) ground.controls.enabled = false;
  briefDlg.showModal();
  probeHud.setPulse(false);
  if (progress) progress.briefed(probe.stage ? probe.stage.n : 1);
}

briefDlg.addEventListener('click', (e) => { if (e.target === briefDlg) briefDlg.close(); });

// The record of the missing carrier. The Carrier row states "Not heard" until the first landing
// catches the beacon, and the words are a link to this: a reader who has never landed reads why the
// row stands there and what a landing would catch. It marks nothing in the store, because the
// reader has heard nothing yet, and it opens from the sidebar, which stands in orbit and on the
// ground alike.
const lostDlg = $('#carrier-lost');

function openLost() {
  if (!lostDlg || lostDlg.open) return;
  if (ground) ground.controls.enabled = false;
  lostDlg.showModal();
}

lostDlg.addEventListener('click', (e) => { if (e.target === lostDlg) lostDlg.close(); });
lostDlg.addEventListener('close', () => {
  if (probe.mode === 'ground' && ground && !probe.dive) ground.controls.enabled = true;
});
briefDlg.addEventListener('close', () => {
  if (probe.mode === 'ground' && ground && !probe.dive) ground.controls.enabled = true;
});

// The return path to the wreck. A reader who found the source a week ago has to find its cell
// again, and the mini wreck on the globe is 0.06 radii tall. So the Carrier row carries an Aim chip
// once the world is found: it turns the camera onto the cell of the source and starts the aim, so
// the reader stands in the state a tap on that cell of the globe gives. The next tap sends the
// probe. The chip only shows in orbit, because the aim means nothing on the ground.
//
// The pick reads the screen centre, and placeCameraOverSite() puts the site there, so the square
// marker lands on the cell of the source with no new math.
//
// `src` is the source to aim at. The chips of the Carrier row give the wreck or the ruin, and each
// shows only after the find of its source, so no chip gives a search away. With no argument the
// debug handle aims at the source of the search the receiver follows, which the tests of a search
// use. p2-38.
function aimAtSource(src = carrierView() && carrierView().follow && carrierView().follow.source) {
  if (!current || !canDescend()) return;
  const at = sourceSite(current.world, src || null);
  if (!at) return;
  placeCameraOverSite(at);
  aimNdc.set(0, 0);
  startAim();
}

// ---------------------------------------------------------------- a change of the progress
// A landing, a find, a tune, and a clear each change the progress, and each then calls this. It
// shows the new view everywhere the page shows the story: the wedges and the pins on the globe, the
// carrier block of the overlay, the Carrier row and the two tuners, the marks on the thumbs, and the
// levels of the motifs. chapters.js holds every rule, and this function only shows its view.
//
// A find or a tune changes the search the receiver follows, or its state. A probe on the ground then
// reads the carrier of its landing again. The overlay turns to the new band at once, and after a
// tune the landing takes the first fix of the new search. So a reader who tunes at the wreck starts
// the search for the ruin there, as decision 9 of p2-00 plans. A clear changes neither, so the
// landing keeps its carrier and takes no fix back.
function showProgress() {
  if (!progress || !current) return;
  if (probe.mode === 'ground' && ground && heardOf(progress.view()) !== probe.heard) {
    ground.setCarrier(hearCarrier());
  }
  const v = progress.view();
  rebuildCarrierGroup(v);
  setBriefPulse();
  renderInfo(current.world);
  renderWorlds();
  setCarrierLevel(v);
}

// Drop the fixes of the search the receiver follows on the world on the screen. The globe loses its
// wedges in the same breath. The finds, the briefs, and the bands stay.
function clearCarrier() {
  if (!progress || !current) return;
  progress.clear();
  showProgress();
}

// One text the reader typed into a tuner. tune() of chapters.js gives the answer, and a lock makes
// the receiver hold the band of the next search. p2-39.
function tuneText(text) {
  if (!progress) return { kind: 'static', text: '' };
  const a = progress.tune(text);
  if (a.kind === 'lock') showProgress();
  return a;
}

// The debug hook __mw.tune() of p2-38: it locks the tuner on its band, as a reader who types it.
// The tuner stands only after the find of the search before it, so the hook does nothing before
// that. docs/adr/0001-chapters-open-in-strict-order.md.
function tune() {
  const t = carrierView() && carrierView().tuner;
  if (!t || t.held) return null;
  tuneText(progress.chapters.find((c) => c.id === t.id).freq);
  return carrierView();
}

// The reader opens the card of the source of chapter `id`: 'wreck' or 'ruin'. read() of
// chapters.js says whether the card opens, and whether this read is the find. A closed chapter
// cannot end, so its card does not open. docs/adr/0001-chapters-open-in-strict-order.md.
//
// A find stands in the store, and the store drops the fixes of that search with it. The globe is
// built again from the progress: the wedges give way to the pin and the mini model at the source.
// The sidebar states the find in two places, the Carrier row of this world and the thumb of the
// saved one, and the motif of the source joins the song of this world for good. The reader is on
// the ground when this runs, so the model arrives while the globe is not drawn, and it stands there
// at the end of the ascent. The landing reads the carrier again: the found search pulses no more.
// window.__mw.onSourceFound and window.__mw.onRuinFound are the other ways in.
function readSource(id) {
  if (!progress || !current) return { open: false, found: false };
  const r = progress.read(id);
  if (r.found) showProgress();
  return r;
}

// ---------------------------------------------------------------- the motif in the song, slice 5
// The source has a voice of its own, and the wreck and the ruin each play on a bus of music.js.
// motifLevel() of chapters.js holds the rule for each bus. The page gives it the source on the cell
// of the probe: its kind, the range the overlay states, and the reach of the ground. The range runs
// to the edge of a ruin and to the middle of the wreck, p2-41. The reach is the walk limit of the
// ground, the same reach the worker placed the source inside. See reachOf() in ground.js.

// Both levels, twice a second and after every change of the mode and of the progress.
function setCarrierLevel(v = carrierView()) {
  let here = null;
  if (probe.mode === 'ground' && ground) {
    const s = ground.source, p = ground.camera.position;
    here = { kind: s ? s.kind : null, range: s ? s.rangeFrom(p.x, p.z) : Infinity, reach: ground.reach };
  }
  music.setCarrier(motifLevel(v, 'wreck', here));
  // Chapter 3: the voice of the ruin swells with the flare of the jump.
  music.setRuin(Math.max(motifLevel(v, 'ruin', here), jumpVoice));
}

// The value of the Carrier row: the words of the row, the Clear chip while the search holds a fix,
// the Tune chip, and the Aim chips in orbit. "Not heard" is a link to the record of the missing
// carrier, on the first search only. An Aim chip stands for each found source: one found source
// takes the chip "Aim", and more finds take one chip each, named for the source. p2-38. The Tune
// chip opens the tuner under the row, in orbit and on the ground. p2-39.
function carrierRow(row) {
  const words = row.lost
    ? `<button type="button" class="carrier-lost" title="Read the record of the incident">${row.text}</button>` : row.text;
  const clear = row.clear ? '<button type="button" class="chip carrier-clear" title="Drop the wedges of this search">Clear</button>' : '';
  const tune = row.tune
    ? `<button type="button" class="chip carrier-tune" aria-expanded="${sideTunerOpen}" title="Type a frequency into the receiver">Tune</button>` : '';
  const aims = probe.mode !== 'orbit' ? '' : row.aims.map((a) =>
    `<button type="button" class="chip carrier-aim" data-aim="${a.id}" title="Aim the probe at the ${a.id}">${a.label}</button>`).join('');
  return words + clear + tune + aims;
}

// ---------------------------------------------------------------- the tuner, p2-39
// The field the reader types the frequency of the log into. tuner.js builds it, and the page stands
// it in two places: under the last entry of the card of the wreck, and under the Carrier row of the
// sidebar, where the Tune chip opens it. Each place keeps its own tuner, so the text of one field
// and its last answer outlive a render of the sidebar.
//
// Both places show only on a world with a ruin, and only after the find of the wreck: the card of
// the wreck opens only on its cell, and that first open is the find. After the tune both places
// show the locked band and no field. The sidebar then shows the band under the row for good, and
// the Tune chip goes away. The view of chapters.js gives the tuner, and it gives the band only
// after the lock. docs/adr/0001-chapters-open-in-strict-order.md.
//
// A lock calls showProgress(). On the ground the landing reads the carrier again and takes the
// first fix of chapter 2, and the carrier block turns to the ruin and takes the colour of chapter
// 2. In orbit the next landing takes the first fix.
let sideTunerOpen = false;      // the reader pressed the Tune chip of the sidebar
let sideTunerSeed = null;       // the world the sidebar tuner last showed
const cardTuner = makeTuner({ onTune: tuneText });
const sideTuner = makeTuner({
  onTune: tuneText,
  // Escape closes the form of the sidebar and gives the focus back to the chip.
  onEscape: () => {
    sideTunerOpen = false;
    if (current) renderInfo(current.world);
    const chip = infoBody.querySelector('.carrier-tune');
    if (chip) chip.focus();
  },
});

// Both tuners show the tuner of a view of chapters.js, or hide where the world takes none.
function syncTuners(st) {
  for (const t of [cardTuner, sideTuner]) {
    t.el.hidden = !st;
    t.set(st);
  }
}

// The Tune chip opens the form under the row and puts the focus in the field. A second press
// closes it. The body of the sidebar is the one scroll region, so the form scrolls into view when
// it stands under the edge.
function toggleSideTuner() {
  if (!current) return;
  sideTunerOpen = !sideTunerOpen;
  renderInfo(current.world);
  if (!sideTunerOpen) {
    const chip = infoBody.querySelector('.carrier-tune');
    if (chip) chip.focus();
    return;
  }
  sideTuner.focus();
  const body = panel.querySelector('.body');
  if (!body) return;
  const b = body.getBoundingClientRect(), t = sideTuner.el.getBoundingClientRect();
  if (t.top < b.top || t.bottom > b.bottom) sideTuner.el.scrollIntoView({ block: 'nearest' });
}

function renderInfo(w) {
  const s = w.stats;
  const carrier = carrierState(w);
  if (sideTunerSeed !== w.seed) { sideTunerOpen = false; sideTunerSeed = w.seed; }
  const tuner = carrier && carrier.tuner;
  if (!tuner || tuner.held) sideTunerOpen = false;
  // The form stands under the row while the chip holds it open, and the locked band stands there
  // for good after the tune. It takes a whole line of the grid, because on a phone the grid holds
  // two rows side by side and a quarter of the sheet is too narrow for a field.
  const slot = tuner && (tuner.held || sideTunerOpen) ? '<dd class="tuner-slot"></dd>' : '';
  // A render builds the rows again, and the field loses the focus when its old row goes. So the
  // focus comes back to the field after the render.
  const typing = sideTuner.el.contains(document.activeElement);
  infoBody.innerHTML = `
    <div class="iname">${escapeHtml(w.seed)}</div>
    <div class="itype">${escapeHtml(w.designation)} · ${escapeHtml(w.typeLabel)}</div>
    <dl>
      <dt>Radius</dt><dd>${s.radius}</dd>
      <dt>Gravity</dt><dd>${s.gravity}</dd>
      <dt>Day</dt><dd>${s.day}</dd>
      ${s.tilt ? `<dt>Tilt</dt><dd>${s.tilt}</dd>` : ''}
      <dt>Temp</dt><dd>${s.temp}</dd>
      ${s.land ? `<dt>Land</dt><dd>${s.land}</dd>` : ''}
      ${s.activity ? `<dt>Activity</dt><dd>${escapeHtml(s.activity)}</dd>` : ''}
      ${carrier ? `<dt>Carrier</dt><dd class="carrier">${carrierRow(carrier.row)}</dd>${slot}` : ''}
      ${carrier && carrier.way && carrier.way.text ? `<dt>Way on</dt><dd class="carrier way-row">${escapeHtml(carrier.way.text)}</dd>` : ''}
      ${w.star ? `<dt>Star</dt><dd>${escapeHtml(w.star.label)}</dd>` : ''}
      <dt>Moons</dt><dd>${w.moons.length ? w.moons.map((m) => escapeHtml(m.name)).join(', ') : 'none'}</dd>
      <dt>Fauna</dt><dd class="chips">${(w.faunaKinds || []).length ? w.faunaKinds.map((k) => `<button type="button" class="chip" data-kind="${k}">${escapeHtml(w.species[k].lore.name)}</button>`).join('') : 'none seen'}</dd>
      ${groundPlants.length ? `<dt>Flora</dt><dd class="chips">${groundPlants.map((p) => `<button type="button" class="chip" data-plant="${p.kind}">${escapeHtml(p.lore.name)}</button>`).join('')}</dd>` : ''}
    </dl>`;
  const lostBtn = infoBody.querySelector('.carrier-lost');
  if (lostBtn) lostBtn.addEventListener('click', openLost);
  const clearBtn = infoBody.querySelector('.carrier-clear');
  if (clearBtn) clearBtn.addEventListener('click', clearCarrier);
  const tuneBtn = infoBody.querySelector('.carrier-tune');
  if (tuneBtn) tuneBtn.addEventListener('click', toggleSideTuner);
  // The card holds the other tuner, and it follows the same record. See syncTuners().
  syncTuners(tuner);
  const slotEl = infoBody.querySelector('.tuner-slot');
  if (slotEl) {
    slotEl.appendChild(sideTuner.el);
    if (typing) sideTuner.focus();
  }
  infoBody.querySelectorAll('.carrier-aim').forEach((b) => b.addEventListener('click', () => {
    const c = carrier && carrier.chapters.find((ch) => ch.id === b.dataset.aim);
    if (c) aimAtSource(c.source);
  }));
  // The flora row only exists while the probe is down, because the plants belong to the patch.
  infoBody.querySelectorAll('.chip[data-kind]').forEach((b) => b.addEventListener('click', () => inspect(+b.dataset.kind)));
  infoBody.querySelectorAll('.chip[data-plant]').forEach((b) => b.addEventListener('click', () => {
    const kind = +b.dataset.plant;
    inspectPlant(kind);
    if (probe.mode === 'ground' && ground) markedPlant = ground.focusPlant(kind) ? kind : null;
  }));
  infoEl.hidden = false;
  hworld.textContent = `${w.seed} · ${w.typeLabel}`;
}

// ---------------------------------------------------------------- the study card
// One card element carries four subjects. An animal is a subject of the world, so its card opens
// from orbit and from the ground. A plant is a subject of a patch: the lore of a plant reads the
// biome it stands on, and the patch is the only place that biome is known, so the plant card only
// opens while the probe is down. See docs/flora.md. The wreck of issue 34 is a subject of one cell
// of one world, and its card holds the log and no preview text. The ruin of p2-42 is a subject of
// one cell too, and its card holds the rows of what the probe reads of it.
//
// Each inspector owns its own canvas, because a WebGLRenderer owns the canvas it draws to. The
// card shows one of the four and hides the others.
const creatureCard = $('#creature');
const creatureCanvas = $('#ccv'), plantCanvas = $('#pcv'), sourceCanvas = $('#scv'), ruinCanvas = $('#rcv');
const inspector = new Inspector({ card: creatureCard, canvas: creatureCanvas });
const plantInspector = new PlantInspector({ card: creatureCard, canvas: plantCanvas });
const sourceInspector = new SourceInspector({ card: creatureCard, canvas: sourceCanvas });
const ruinInspector = new RuinInspector({ card: creatureCard, canvas: ruinCanvas });   // p2-42
// What the card shows: 'animal', 'plant', 'source', or 'ruin'. The arrows and the close read it.
const cardOpen = () => inspector.open || plantInspector.open || sourceInspector.open || ruinInspector.open;
function closeCard() {
  inspector.hide(); plantInspector.hide(); sourceInspector.hide(); ruinInspector.hide();
  // Chapter 3: the reader has read the third log, and the people of the tent come out.
  if (crewWaits && ground && ground.crew) ground.crew.release(true);
  crewWaits = false;
}
function discColor() {
  const pal = current.world.palette;
  return current.world.type === 'gas' ? pal.atmo : (pal.ground || '#7fa860');
}
// Opening one subject takes the mark off the other, so the ring on the ground always names the
// card the reader is looking at. The mark of the subject being opened is set by the caller, which
// is the only one that knows whether the patch really holds it.
function inspect(kind) {
  if (!current) return;
  markedPlant = null; markedSource = false;
  if (ground && ground.flora) ground.flora.unmark();
  if (ground && ground.source) ground.source.unmark();
  plantInspector.hide(); sourceInspector.hide(); ruinInspector.hide();
  creatureCard.classList.add('show');    // the subjects share the card, so a swap must not fade it out
  creatureCard.hidden = false;
  plantCanvas.hidden = true; sourceCanvas.hidden = true; ruinCanvas.hidden = true; creatureCanvas.hidden = false;
  inspector.show(current.world.species[kind], current.world.palette, discColor(), 3 + kind);
  creatureCard.dataset.kind = kind;
  creatureCard.dataset.subject = 'animal';
}
function inspectPlant(kind) {
  const p = plantOf(kind);
  if (!current || !p) return;
  markedKind = null; markedSource = false;
  if (ground && ground.fauna) ground.fauna.unmark();
  if (ground && ground.source) ground.source.unmark();
  inspector.hide(); sourceInspector.hide(); ruinInspector.hide();
  creatureCard.classList.add('show');
  creatureCard.hidden = false;
  creatureCanvas.hidden = true; sourceCanvas.hidden = true; ruinCanvas.hidden = true; plantCanvas.hidden = false;
  plantInspector.show(p, current.world.palette, discColor(), groundVariant);
  creatureCard.dataset.kind = kind;
  creatureCard.dataset.subject = 'plant';
}

// The log of the wreck. It opens from the floating button, and it is the only place the page ever
// shows the log: the reader must stand on the cell and tap the thing itself. The first open is the
// find, so readSource() runs here and the Carrier row of the sidebar then reads "Found".
//
// The card holds no arrows: a world has one source, so there is nothing to step to. See
// SourceInspector in ground-source.js for the preview, which turns the wreck on its own axis.
function inspectSource() {
  const src = current && current.world.source;
  // The log belongs to the wreck. On the cell of the ruin the page must not show it. p2-41.
  if (!src || !ground || !ground.source || ground.source.kind !== 'wreck') return;
  if (!readSource('wreck').open) return;
  markedKind = null; markedPlant = null;
  if (ground.fauna) ground.fauna.unmark();
  if (ground.flora) ground.flora.unmark();
  inspector.hide(); plantInspector.hide(); ruinInspector.hide();
  creatureCard.classList.add('show');
  creatureCard.hidden = false;
  creatureCanvas.hidden = true; plantCanvas.hidden = true; ruinCanvas.hidden = true; sourceCanvas.hidden = false;
  const pal = current.world.palette || {};
  // The tuner of p2-39 stands under the last entry, so the frequency of the log is in sight while
  // the reader types it. The first open is the find, and the tuner shows from the find on.
  sourceInspector.show(src.log, (pal.fauna && pal.fauna.accent) || '#ffd27f', discColor(),
    music.motif(current.world), hullOf(current.world), cardTuner.el);
  creatureCard.dataset.subject = 'source';
  const v = carrierView();
  syncTuners(v && v.tuner);
}

// The card of the ruin, p2-42. The button reads "Study the ruin" on a marked ruin, and this is where
// it leads. The reader must stand on the cell and tap the thing itself, as for the wreck, and the
// first open is the find of the ruin, so readSource() runs here.
//
// The card states the frequency, the day of the beacon, and the maker, so it opens only on the
// cell of the ruin, and only after the find of the wreck: a closed chapter has no card (ADR-0001).
// RuinInspector in ground-source.js draws it, and ruinCard() of ruin-types.js writes its text. The glow and the text take the colour of chapter 2, as the wedges of the ruin
// do; the text takes it lightened, as the drawings of the brief do, because the card is dark.
function inspectRuin() {
  if (ground && ground.source && ground.source.kind === 'twin') { inspectTwin(); return; }
  const ruin = current && current.world.ruin;
  if (!ruin || !ground || !ground.source || ground.source.kind !== 'ruin') return;
  if (!readSource('ruin').open) return;
  markedKind = null; markedPlant = null;
  if (ground.fauna) ground.fauna.unmark();
  if (ground.flora) ground.flora.unmark();
  inspector.hide(); plantInspector.hide(); sourceInspector.hide();
  creatureCard.classList.add('show');
  creatureCard.hidden = false;
  creatureCanvas.hidden = true; plantCanvas.hidden = true; sourceCanvas.hidden = true; ruinCanvas.hidden = false;
  creatureCard.dataset.subject = 'ruin';
  ruinInspector.show(current.world, {
    glow: carrierColour(current.world, 2), accent: briefColour(current.world), groundColor: discColor(),
    way: wayRow(current.world),
  });
}
creatureCard.querySelector('.cclose').addEventListener('click', closeCard);
creatureCard.addEventListener('click', (e) => { if (e.target === creatureCard) closeCard(); });
creatureCard.querySelector('.cprev').addEventListener('click', () => cycleInspect(-1));
creatureCard.querySelector('.cnext').addEventListener('click', () => cycleInspect(1));
function cycleInspect(dir) {
  // a world holds one wreck and one ruin, and each card stands alone
  if (creatureCard.dataset.subject === 'source' || creatureCard.dataset.subject === 'ruin') return;
  if (creatureCard.dataset.subject === 'plant') return cyclePlant(dir);
  // On the ground the list also carries the species of the patch: the pull and the niches can
  // put an animal on the ground that the globe sample never drew, and the arrows must reach it.
  const kinds = (current?.world.faunaKinds || []).slice();
  if (probe.mode === 'ground' && ground && ground.fauna) {
    for (const e of ground.fauna.kinds) if (!kinds.includes(e.kind)) kinds.push(e.kind);
  }
  if (!kinds.length) return;
  const i = kinds.indexOf(+creatureCard.dataset.kind);
  const kind = kinds[(i + dir + kinds.length) % kinds.length];
  inspect(kind);
  // The arrows also point the camera at the nearest animal of the species, behind the card. A
  // species the patch does not host leaves the camera where it is, and takes the mark off.
  if (probe.mode === 'ground' && ground) markedKind = ground.focusKind(kind) ? kind : null;
}
// The arrows walk the plants of this patch, in the order the worker wrote them: tallest first.
function cyclePlant(dir) {
  if (!groundPlants.length) return;
  const i = groundPlants.findIndex((p) => p.kind === +creatureCard.dataset.kind);
  const kind = groundPlants[(i + dir + groundPlants.length) % groundPlants.length].kind;
  inspectPlant(kind);
  if (probe.mode === 'ground' && ground) markedPlant = ground.focusPlant(kind) ? kind : null;
}
// True while a modal dialog stands open: the about card, the brief, or the lost record. A modal
// dialog owns the keyboard. On Escape the browser closes the dialog, and the card and the mark
// behind it must stay. The test reads the page and holds no list, so a new dialog needs no edit.
const modalOpen = () => !!document.querySelector('dialog:modal');

// Escape closes the study card, but a modal dialog owns the key while it stands open.
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && cardOpen() && !modalOpen()) closeCard();
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (ground) ground.resize(innerWidth, innerHeight);
  probeHud.resize(innerWidth, innerHeight, Q.dpr);
});
// The preview of the card follows the box of its canvas, not the window. Each subject lays the card
// out in its own way, and the box of the canvas changes after show() measured it: the subject flips
// the layout, a media query moves it, or the card grows. The observer measures again each time, so
// the camera keeps the aspect of the box and the preview never stretches.
if (window.ResizeObserver) {
  const previews = new Map([[creatureCanvas, inspector], [plantCanvas, plantInspector], [sourceCanvas, sourceInspector], [ruinCanvas, ruinInspector]]);
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const ins = previews.get(e.target);
      if (ins.open && e.contentRect.width > 0) ins.resize();
    }
  });
  for (const cv of previews.keys()) ro.observe(cv);
}

// pick a creature under a screen point: nearest projected instance on the visible hemisphere
const _pv = new THREE.Vector3(), _pt = new THREE.Vector3(), _pn = new THREE.Vector3(), _pm = new THREE.Matrix4();
// tolerance grew with the 30% smaller creatures, so a finger still finds one
function creatureAt(px, py, tolerance = 34) {
  if (!current) return null;
  let best = null, bestD = tolerance;
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  for (const inst of current.faunaMeshes) {
    inst.updateWorldMatrix(true, false);
    for (let j = 0; j < inst.count; j++) {
      inst.getMatrixAt(j, _pm);
      _pv.setFromMatrixPosition(_pm).applyMatrix4(inst.matrixWorld);
      // hidden behind the planet if the surface normal there faces away from the camera
      if (_pv.x * (_pv.x - camera.position.x) + _pv.y * (_pv.y - camera.position.y) + _pv.z * (_pv.z - camera.position.z) > 0) continue;
      // project the base and a point one body-height up, then measure to that segment
      const sc = Math.hypot(_pm.elements[0], _pm.elements[1], _pm.elements[2]);
      _pt.copy(_pv).addScaledVector(_pn.copy(_pv).normalize(), sc * 1.1);
      _pv.project(camera); _pt.project(camera);
      if (_pv.z > 1) continue;
      const ax = (_pv.x + 1) / 2 * w, ay = (1 - _pv.y) / 2 * h, bx = (_pt.x + 1) / 2 * w, by = (1 - _pt.y) / 2 * h;
      const lx = bx - ax, ly = by - ay, ll = lx * lx + ly * ly || 1;
      const u = THREE.MathUtils.clamp(((px - ax) * lx + (py - ay) * ly) / ll, 0, 1);
      const d = Math.hypot(ax + lx * u - px, ay + ly * u - py) - Math.sqrt(ll) * 0.25;
      if (d < bestD) { bestD = d; best = inst.userData.kind; }
    }
  }
  return best;
}
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; if (aiming) setAimNdc(e.clientX, e.clientY); });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 6 || busy || probe.mode !== 'orbit') return;   // the globe creatures are not on the screen on the ground
  if (aiming) { aimAt(e.clientX, e.clientY); return; }  // the tap sends the probe, it does not open a card
  const kind = creatureAt(e.clientX, e.clientY, e.pointerType === 'touch' ? 52 : 34);
  if (kind !== null) inspect(kind);
});
let hoverTick = 0;
canvas.addEventListener('pointermove', (e) => {
  if (aiming) { setAimNdc(e.clientX, e.clientY); return; }
  if (e.pointerType === 'touch' || downAt || probe.mode !== 'orbit' || (++hoverTick & 3)) return;
  canvas.style.cursor = creatureAt(e.clientX, e.clientY) !== null ? 'pointer' : '';
});

// ---------------------------------------------------------------- ui
const WORDS = ['Aurora', 'Pebble', 'Nimbus', 'Tadas', 'Juniper', 'Comet', 'Marble', 'Saffron', 'Willow', 'Quasar', 'Pumpkin', 'Zephyr', 'Lumen', 'Basil', 'Orchid', 'Tundra', 'Kepler', 'Mango', 'Fjord', 'Nova'];
form.addEventListener('submit', (e) => { e.preventDefault(); generate(input.value); input.blur(); });
diceBtn.addEventListener('click', () => {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)] + '-' + Math.floor(Math.random() * 900 + 100);
  input.value = w; generate(w);
});
// The body of the sidebar is the one scroll region. On a phone the sheet holds about 390 px of
// it, and a world with a tall card pushes the probe button under the footer, where the reader
// cannot see it. So an expand brings the button into view. Measured on a 375 by 667 viewport
// with `Auralis`: the button stood at y 629 with the footer over it, and the scroll of 214 px
// brings it to y 415.
function showProbeBtn() {
  if (!probeBtn || probeBtn.hidden || panel.classList.contains('collapsed')) return;
  const body = panel.querySelector('.body');
  if (!body) return;
  const b = body.getBoundingClientRect(), p = probeBtn.getBoundingClientRect();
  if (p.top >= b.top && p.bottom <= b.bottom) return;   // it already shows: do not move the scroll
  probeBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function setCollapsed(on) {
  panel.classList.toggle('collapsed', on);
  // The probe overlay reads this: a folded sidebar on a wide screen leaves the whole width, so
  // the frame starts at the left edge and drops under the strip. See #probe-hud in style.css.
  document.documentElement.classList.toggle('panel-folded', on);
  toggleBtn.setAttribute('aria-expanded', String(!on));
  toggleBtn.setAttribute('aria-label', on ? 'Expand sidebar' : 'Collapse sidebar');
  if (!on) showProbeBtn();
}
toggleBtn.addEventListener('click', () => setCollapsed(!panel.classList.contains('collapsed')));
// On a phone the sidebar docks at the bottom, where the floating buttons live. The observer
// writes the height of the panel to a variable, and the phone media query lifts the buttons
// over the sheet, folded or open. On a wide screen the variable sits unused.
if (window.ResizeObserver) {
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--panel-h', `${panel.offsetHeight}px`);
    // The probe overlay starts right of the sidebar, so the frame of issue 31 holds no text
    // under the panel. A folded panel is narrow and the frame follows it out.
    document.documentElement.style.setProperty('--panel-w', `${panel.offsetWidth}px`);
  }).observe(panel);
}
panel.querySelector('header').addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  setCollapsed(!panel.classList.contains('collapsed'));
});
// On a phone the sheet covers the planet: a touch on the canvas folds it away.
if (COMPACT) canvas.addEventListener('pointerdown', () => setCollapsed(true));
shareBtn.addEventListener('click', async () => {
  if (!current) return;
  const url = location.origin + location.pathname + viewHash();
  try { await navigator.clipboard.writeText(url); shareBtn.textContent = 'Copied!'; }
  catch { shareBtn.textContent = url; }
  setTimeout(() => (shareBtn.textContent = 'Share link'), 1500);
});
function onProbeClick() {
  if (probe.mode === 'ground') ascend();
  else if (aiming) stopAim();
  else startAim();
}
probeBtn.addEventListener('click', onProbeClick);
if (probeIconBtn) probeIconBtn.addEventListener('click', onProbeClick);
// ---------------------------------------------------------------- music
const music = new Music();
function renderMusic() {
  const { vol, muted } = music.settings;
  muteBtn.textContent = muted ? '🔇' : vol < 0.01 ? '🔈' : '🔊';
  muteBtn.setAttribute('aria-pressed', String(muted));
  muteBtn.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
  volInput.value = Math.round(vol * 100);
  volInput.disabled = muted;
}
music.onchange = renderMusic;
renderMusic();
muteBtn.addEventListener('click', () => music.setMuted(!music.settings.muted));
volInput.addEventListener('input', () => music.setVolume(volInput.value / 100));

addEventListener('hashchange', () => {
  const { seed, site: fromHash, view } = parseUrl(location.hash);
  if (!seed) return;
  if (!current || current.world.seed !== seed) { pendingSite = fromHash; pendingView = view; generate(seed); }
  else if (probe.mode !== 'orbit') return;
  else if (fromHash) { pendingSite = null; pendingView = null; placeCameraOverSite(fromHash); descend(fromHash, view); }
  else { pendingSite = null; pendingView = null; placeCameraAtView(view); }
});
// The about dialog. It is modal, so the page keys wait while it is open.
const aboutDlg = $('#about');
$('#about-open').addEventListener('click', () => aboutDlg.showModal());
aboutDlg.addEventListener('click', (e) => { if (e.target === aboutDlg) aboutDlg.close(); });
aboutDlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') aboutDlg.close(); });

// A field that takes text. The slider of the volume is an input too, and it takes no slash.
const isField = (el) => !!el && ((el.tagName === 'INPUT' && /^(text|search|number)$/.test(el.type))
  || el.tagName === 'TEXTAREA' || el.isContentEditable);
addEventListener('keydown', (e) => {
  if (modalOpen()) return;   // a modal dialog owns the keyboard while it is open
  // A slash typed into a field is a character of that field: the seed input, or the tuner of p2-39.
  if (e.key === '/' && !isField(document.activeElement)) { e.preventDefault(); input.focus(); }
  if (e.key !== 'Escape') return;
  if (!creatureCard.hidden) closeCard();
  else if (markedKind !== null) { if (ground && ground.fauna) ground.fauna.unmark(); markedKind = null; }
  else if (markedPlant !== null) { if (ground && ground.flora) ground.flora.unmark(); markedPlant = null; }
  else if (markedSource) { if (ground && ground.source) ground.source.unmark(); markedSource = false; }
  else stopAim();
});
if (COMPACT) setCollapsed(true);

// ---------------------------------------------------------------- boot
renderWorlds();
{
  const fromHash = parseUrl(location.hash);
  const saved = loadWorlds();
  const seed = fromHash.seed || (saved.length ? saved[saved.length - 1].seed : WORDS[Math.floor(Math.random() * WORDS.length)]);
  pendingSite = fromHash.site;
  pendingView = fromHash.view;
  generate(seed);
}

// ---------------------------------------------------------------- chapter 3, the way on
// The card of the ruin holds the name of the twin in the script of the makers. While chapter 3 is
// open, the row of the way on holds the decoder of decoder.js: the key, the sounds, and a field for
// each glyph. The right name opens the way: the ruin flares, the cover goes white, and the probe
// jumps to the twin. The arrival ends the chapter. At the twin the card holds the third log, and
// the people of the tent come out once the reader has read it. A tap on one of them offers the talk,
// and a person who lived through it unchanged asks to go home. See docs/issues/p3-00-the-way-on.md.

// The chapter of the source of a kind: the wreck, the ruin, or the twin, whose chapter is the way on.
const chapterOfKind = (kind) => (kind === 'twin' ? 'way' : kind);

// The reader read the third log, and the people of the tent wait for the close of the card.
let crewWaits = false;

// The row of the way on of the card of the ruin: the decoder while the chapter is open, and the
// name the glyphs spell after the arrival. Null while the chapter is closed.
function wayRow(world) {
  const st = progress && progress.state('way');
  if (!st || st === 'closed' || !world.twin) return null;
  if (st === 'done') {
    return { word: nameOf(world), text: `The name carries the probe to the twin, ${world.twin.km.toLocaleString('en-GB')} km to the ${world.twin.from}.` };
  }
  const key = wayKey(world);
  const dec = makeDecoder({
    key, codex: readCodex(), probe: world.source && world.source.log && world.source.log.probe,
    onChange: (codex) => writeCodex(codex),
    onSend: (text) => {
      const a = sendName(text, nameOf(world));
      if (a.kind === 'open') setTimeout(() => startJump(), 1100);
      return a;
    },
  });
  return { el: dec.el, text: 'The probe reads a name here, in the script of the makers. The stones sent the call sign of the ship back in the same script. Send the name, and the stones answer.' };
}

// The site of the twin: the middle of its cell, as a landing takes it.
function twinSite(world) {
  const at = world && world.twin ? sourceSite(world, world.twin) : null;
  return at ? snapSite({ lat: at.lat, lon: at.lon, kind: -1 }) : null;
}

// The jump. The probe stands at the ruin, and the right name opens the way. The worker builds the
// patch of the twin while the ruin flares.
function startJump() {
  if (!current || !current.world.twin || !ground || probe.mode !== 'ground' || probe.dive) return false;
  const site = twinSite(current.world);
  if (!site || !probe.jump(site, performance.now())) return false;
  closeCard();
  markedKind = null; markedPlant = null; markedSource = false; markedPerson = null;
  if (ground.source) ground.source.unmark();
  ground.controls.enabled = false;
  diveEl.style.background = jumpWhite(current.world);
  requestPatch('The stones answer the name');
  updateProbeBtn();
  return true;
}

// The white of the cover of the jump: white with a little of the colour of the glow of the ruin.
function jumpWhite(world) {
  const c = new THREE.Color(carrierColour(world, 2)).lerp(new THREE.Color(1, 1, 1), 0.82);
  return '#' + c.getHexString();
}

// One frame of the jump. The ruin flares through the whole first phase, and the cover goes white
// over its second half. Under the white the ground switches to the twin, and the twin flares and
// fades as the cover opens.
function stepJump(s) {
  const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
  if (s.phase === 'in') {
    if (ground && ground.source) ground.source.flare(s.k);
    if (ground) {
      // The probe rises a little and looks at the light.
      const c = ground.camera, tg = ground.controls.target;
      c.position.y += 0.08 * s.k;
      if (ground.source) {
        const g = ground.source.group.position;
        tg.lerp(_jumpAim.set(g.x, tg.y, g.z), 0.02);
      }
    }
    diveEl.style.opacity = String(smooth(0.45, 1, s.k));
    jumpVoice = s.k;
  } else {
    if (ground && ground.source) ground.source.flare(1 - s.k);
    diveEl.style.opacity = String(1 - s.k);
    jumpVoice = 1 - s.k;
  }
  if (s.event === 'swap' || s.event === 'landed' || Math.abs(jumpVoice - lastJumpVoice) > 0.08) { lastJumpVoice = jumpVoice; setCarrierLevel(); }
  if (s.event === 'swap') arriveTwin(s.patch);
  else if (s.event === 'landed') {
    jumpVoice = 0; setCarrierLevel();
    if (ground) { ground.controls.enabled = true; if (ground.source) ground.source.flare(0); }
    if (diveLabel) diveLabel.textContent = '';
    updateProbeBtn();
  }
}
const _jumpAim = new THREE.Vector3();


// The switch to the twin under the white cover: the ground of the ruin goes, the ground of the twin
// comes, and the arrival ends the way on.
function arriveTwin(result) {
  dropGround();
  enterGround(result, twinView(result));
  if (ground) { ground.controls.enabled = false; if (ground.source) ground.source.flare(1); }
  if (progress && progress.arrive().found) showProgress();
  if (diveLabel) diveLabel.textContent = current && current.world.twin
    ? `${current.world.twin.km.toLocaleString('en-GB')} km to the ${current.world.twin.from}` : '';
}

// The camera of the arrival: over the tent, when the crew left one, and looking at the stones.
function twinView(result) {
  const src = result && result.patch && result.patch.source;
  if (!src || src.kind !== 'twin') return null;
  const tent = src.tent;
  const row = protoRow(src.proto);
  const disc = row ? row.disc : 36;
  const az = tent ? Math.atan2(tent.x - src.x, tent.z - src.z) : (src.yaw || 0) + 0.6;
  return { kind: 'ground', x: src.x, z: src.z, dist: disc * 2.1 + 26, az, pol: 1.2 };
}

// The card of the twin: the rows of twinCard() of way-types.js, and the third log. A landing by
// chance on the twin while the chapter is open counts as the arrival. The first open with a log is
// the read: the people of the tent come out when the card closes.
function inspectTwin() {
  const twin = current && current.world.twin;
  if (!twin || !ground || !ground.source || ground.source.kind !== 'twin' || !progress) return;
  const st = progress.state('way');
  if (st === 'closed') return;
  if (st === 'open' && progress.arrive().found) showProgress();
  markedKind = null; markedPlant = null; markedPerson = null;
  if (ground.fauna) ground.fauna.unmark();
  if (ground.flora) ground.flora.unmark();
  if (ground.crew) ground.crew.unmark();
  inspector.hide(); plantInspector.hide(); sourceInspector.hide();
  creatureCard.classList.add('show');
  creatureCard.hidden = false;
  creatureCanvas.hidden = true; plantCanvas.hidden = true; sourceCanvas.hidden = true; ruinCanvas.hidden = false;
  creatureCard.dataset.subject = 'ruin';
  ruinInspector.show(current.world, {
    glow: carrierColour(current.world, 2), accent: briefColour(current.world), groundColor: discColor(), twin: true,
  });
  if (twin.log && progress.readLog()) {
    crewWaits = !!(ground.crew && homeOf(twin.log).length);
    showProgress();
  }
}

// ---------------------------------------------------------------- the talk, and the way home
const talkDlg = $('#talk');
const homeDlg = $('#home');
let talkName = null;

// A person of the crew at the twin speaks: the line of `voice` of the third log. A person who lived
// through it unchanged asks to go home, and the button takes the crew home.
function openTalk(name) {
  const log = current && current.world.twin && current.world.twin.log;
  const c = log && log.crew.find((x) => x.name === name);
  if (!c || !talkDlg) return;
  talkName = name;
  const voice = log.voice || null;
  const line = voice ? voice.line : '…';
  talkDlg.querySelector('#talk-name').textContent = c.name;
  talkDlg.querySelector('.talk-role').textContent = c.role ? `${c.role} of ${log.probe}` : log.probe;
  talkDlg.querySelector('.talk-line').textContent = line;
  const v = progress && progress.view().way;
  const btn = talkDlg.querySelector('.talk-home');
  btn.hidden = !(c.end === 'home' && voice && voice.home && v && !v.home);
  if (ground) ground.controls.enabled = false;
  talkDlg.showModal();
}
if (talkDlg) {
  talkDlg.addEventListener('click', (e) => { if (e.target === talkDlg) talkDlg.close(); });
  talkDlg.addEventListener('close', () => { if (probe.mode === 'ground' && ground && !probe.dive && !homeRun) ground.controls.enabled = true; });
  talkDlg.querySelector('.talk-home').addEventListener('click', () => { talkDlg.close(); takeHome(); });
}
if (homeDlg) homeDlg.addEventListener('click', (e) => { if (e.target === homeDlg) homeDlg.close(); });

// The way home: the mission ends. The twin flares, the people of the tent rise in its light, and the
// probe climbs to orbit with them. The card of the end stands over the globe.
let homeRun = null;
const HOME_MS = 3600;
function takeHome() {
  if (!progress || !progress.goHome() || !ground) return;
  showProgress();
  markedPerson = null;
  if (ground.crew) ground.crew.unmark();
  ground.controls.enabled = false;
  homeRun = { t0: performance.now(), log: current.world.twin.log, world: current.world };
}

// One frame of the way home, from step() while the probe stands on the ground.
function stepHome(now) {
  if (!homeRun || !ground) return;
  const k = Math.min(1, (now - homeRun.t0) / HOME_MS);
  if (ground.source) ground.source.flare(Math.sin(Math.PI * Math.min(1, k * 1.2)) * 0.9);
  if (ground.crew) ground.crew.lift(k);
  if (k < 1) return;
  const run = homeRun;
  homeRun = null;
  ascend();
  showHome(run);
}

function showHome(run) {
  if (!homeDlg) return;
  const log = run.log;
  const home = homeOf(log).map((c) => c.name);
  const names = home.length === 1 ? home[0] : `${home.slice(0, -1).join(', ')} and ${home[home.length - 1]}`;
  homeDlg.querySelector('#home-title').textContent = `The crew of ${log.probe} is going home`;
  homeDlg.querySelector('.home-text').textContent = `${names} waited ${log.years} years on ${run.world.designation}. The probe carries ${home.length === 1 ? 'that person' : 'them'} up to the ship.`;
  const lost = log.crew.filter((c) => c.end !== 'home');
  homeDlg.querySelector('.home-lost').textContent = lost.length
    ? `${lost.map((c) => c.name).join(', ')} did not come home.` : '';
  setTimeout(() => { if (!homeDlg.open) homeDlg.showModal(); }, 1400);
}

// Give the reader the finds of chapters 1 and 2 of `world`, so chapter 3 opens: the debug option
// `?chapter=3` and the hook below.
function skipToWay(p, world) {
  if (!p || !world || !world.ruin) return false;
  p.read('wreck');
  p.tune(world.ruin.freq);
  p.read('ruin');
  return p.state('way') !== 'closed';
}

// The hooks of chapter 3 for the tests and the tools, on window.__mw.way:
//
//   skip()        the finds of chapters 1 and 2 on the world on the screen
//   name()        the name the glyphs spell, which the page never shows before the arrival
//   send(text)    the answer of the ruin to a name, as the decoder sends it
//   landRuin()    a landing on the cell of the ruin, as a promise
//   jump()        the jump from the ruin to the twin, as a promise; it needs the probe at the ruin
//   landTwin()    a landing on the cell of the twin, as a promise
//   read()        opens the card of the twin, which reads the third log
//   release()     the people of the tent come out now
//   talk(name)    opens the talk with a person
//   home()        takes the crew home
//   log()         the third log of the world on the screen
const wayHooks = {
  skip() { const ok = skipToWay(progress, current && current.world); showProgress(); return ok ? carrierView().way : null; },
  name() { return current ? nameOf(current.world) : null; },
  send(text) { return current ? sendName(text, nameOf(current.world)) : null; },
  async landRuin() {
    const at = current && current.world.ruin && sourceSite(current.world, current.world.ruin);
    if (!at) throw new Error('the world holds no ruin');
    return landAt(at.lat, at.lon);
  },
  async landTwin() {
    const at = twinSite(current && current.world);
    if (!at) throw new Error('the world holds no twin');
    return landAt(at.lat, at.lon);
  },
  async jump() {
    if (!startJump()) throw new Error('the probe cannot jump now: it must stand on the ground with no dive');
    await untilMode('ground');
    const t0 = performance.now();
    while (probe.dive) {
      if (performance.now() - t0 > HOOK_LIMIT) throw new Error('the jump did not end');
      if (document.visibilityState !== 'visible') step(performance.now());
      await new Promise((r) => setTimeout(r, HOOK_TICK));
    }
    return { site: probe.site, source: ground && ground.source ? ground.source.kind : null, way: carrierView().way };
  },
  read() { if (ground && ground.source && ground.source.kind === 'twin') { markedSource = true; inspectTwin(); } return carrierView().way; },
  release() { if (ground && ground.crew) ground.crew.release(true); crewWaits = false; },
  talk(name) { openTalk(name || (homeOf(current.world.twin.log)[0] || {}).name); },
  home() { takeHome(); return !!homeRun; },
  log() { return current && current.world.twin ? current.world.twin.log : null; },
  // Wait for the dive and the way home that run, and step the frames of a hidden page meanwhile.
  async settle() {
    const t0 = performance.now();
    while (probe.dive || homeRun || probe.mode === 'descending' || probe.mode === 'ascending') {
      if (performance.now() - t0 > HOOK_LIMIT) throw new Error('the probe did not settle');
      if (document.visibilityState !== 'visible') step(performance.now());
      await new Promise((r) => setTimeout(r, HOOK_TICK));
    }
    return probe.mode;
  },
};

// ---------------------------------------------------------------- scripted landings, p2-38
// Two debug hooks for the tests of a search. landAt() sends the probe to the cell of a site, as a
// tap on that cell does, and recall() brings it back. Each gives a promise, so a test can walk a
// whole search in a loop:
//
//   const r = await __mw.landAt(12.5, -73.25);   // r.carrier is the carrier block of the overlay
//   __mw.tune();                                 // on the ground: this landing takes a fix of chapter 2
//   await __mw.recall();                         // the wedge of the landing now stands on the globe
//
// A hidden tab stops requestAnimationFrame, and the dive steps on the frame. So while the page is
// hidden, the hooks step the frame themselves on a timer, and the landing still ends.
const HOOK_TICK = 50;           // ms between two steps of a hidden page
const HOOK_LIMIT = 60000;       // ms: a landing or a recall that takes longer fails

function untilMode(want) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const tick = () => {
      if (probe.mode === want && !probe.dive) { resolve(); return; }
      if (performance.now() - t0 > HOOK_LIMIT) { reject(new Error(`the probe did not reach ${want}`)); return; }
      if (document.visibilityState !== 'visible') step(performance.now());
      setTimeout(tick, HOOK_TICK);
    };
    tick();
  });
}

// The probe goes down on the cell of (lat, lon). The site takes the pull and the snap a tap takes.
// The promise gives the site, the chapter, the carrier block the overlay reads, and the stage of
// the brief, once the ground stands.
async function landAt(lat, lon) {
  if (!canDescend()) throw new Error('the probe cannot go down now');
  const target = snapSite(pullSite({ lat, lon, kind: -1 }, current));
  placeCameraOverSite(target);
  descend(target);
  await untilMode('ground');
  return { site: target, chapter: carrierChapter(), carrier: ground ? ground.telemetry().carrier : null, stage: probe.stage };
}

// The probe comes back to orbit. The promise gives the chapter and the view of the progress.
async function recall() {
  if (probe.mode !== 'ground') throw new Error('the probe is not on the ground');
  ascend();
  await untilMode('orbit');
  return { chapter: carrierChapter(), view: carrierView() };
}

// debug handle (harmless in production)
window.__mw = {
  scene, camera, controls, renderer, generate, inspect, inspector, music, descend, ascend, perf,
  inspectPlant, plantInspector, inspectSource, sourceInspector, inspectRuin, ruinInspector,
  get current() { return current; },
  get site() { return site; },
  get mode() { return probe.mode; },
  probe,                         // the state of the landing; see probe.js
  get ground() { return ground; },
  get plants() { return groundPlants; },
  get marked() { return { animal: markedKind, plant: markedPlant, source: markedSource }; },
  // the search of this world: the view of the progress and the group of wedges under the planet
  get carrier() { return { view: carrierView(), group: carrierGroup, pending: probe.fix, stage: probe.stage, chapter: carrierChapter() }; },
  get progress() { return progress; },   // the progress of chapters.js for the world on the screen
  onSourceFound: () => readSource('wreck'),
  onRuinFound: () => readSource('ruin'),   // p2-42: the find of the ruin, as the first open of its card makes it
  briefCarrier: openBrief,       // opens the brief of the distress signal, as the block does
  aimAtSource,
  tune,                          // p2-38: locks the tuner on its band, for the tests. The reader tunes in the field, p2-39
  get tuners() { return { card: cardTuner, side: sideTuner }; },   // p2-39: the two tuners
  landAt,                        // p2-38: a scripted landing, as a promise
  recall,                        // p2-38: a scripted recall, as a promise
  way: wayHooks,                 // chapter 3: see wayHooks
};
