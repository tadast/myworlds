// myworlds — main thread: rendering, controls, UI, storage.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Music } from './music.js';
import { buildActivity } from './phenomena.js';
import { BASE_SCALE, buildCreature, faunaMaterial, makeMover, stepMover, moverActivity, makeGait, stepGait, gaitLocked, hopGait, hopBurst, Inspector } from './fauna.js';
import { floraGeometry } from './flora-geometry.js';
import { groundRadius, faunaHomes, pickSite, pickDirs, pullSite, siteDir, dirToSite, viewToUrl, parseUrl, showMarker, snapSite, cellSpan, activitySite } from './site.js';
import { PlantInspector } from './flora-card.js';
import { Ground, RIM } from './ground.js';
import { skyView } from './ground-sky.js';
import { perf, Hud } from './perf.js';

// ---------------------------------------------------------------- config
const isCoarse = matchMedia('(pointer: coarse)').matches;
const isSmall = Math.min(innerWidth, innerHeight) < 600;
const LOW = isCoarse || isSmall || (navigator.hardwareConcurrency || 4) <= 4;
const COMPACT = isCoarse || isSmall; // the sidebar folds away so the planet stays visible
// One object holds the whole device tier. `Q` is the globe, and `Q.ground` is the probe. Every
// part that must know the tier reads it from here: the worker request, the Ground constructor,
// and through the Ground the flora, the fauna, the sky, and the LOD knob.
//
// The LOW row of the budget table: a 4 m grid, 6,000 plants, 100 animals, and no shadows. It
// also caps the LOD knob at 250 m, because a weak machine cannot spend the room a fast one
// finds, and a knob that walks to 400 m only walks back down again.
const Q = {
  detail: LOW ? 64 : 100,
  maxFlora: LOW ? 2500 : 10500,
  maxFauna: LOW ? 70 : 160,
  shadows: !LOW,
  dpr: Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2),
  ground: LOW
    ? { grid: 4, maxFlora: 6000, maxFauna: 100, shadows: false, lodMax: 250 }
    : { grid: 2, maxFlora: 20000, maxFauna: 300, shadows: true, lodMax: 400 },
};
const STORE_KEY = 'myworlds.v1';
const MAX_SAVED = 60;
const CAM_MIN = 1.11, CAM_MAX = 8, CAM_HOME = 3.3;
const PICK_RANGE = CAM_MIN + 0.1;   // the globe holds still inside this camera distance
// `?perf` shows the frame time, the LOD knob, and the counts of the frame. Without the flag the
// page builds no element and does no work for it.
const PERF = new URLSearchParams(location.search).has('perf');
const HUD_MS = 500;       // ms, the overlay reads twice a second
const DIVE_MS = 1200;     // ms, the floor of the dive. The patch build hides inside it.
const PATCH_WAIT = 12000; // ms, the guard on the patch. Past it the probe lands on flat ground.
const FADE_MS = 600;      // ms, the fade out of the overlay after the switch

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
const creatureFloat = $('#creature-float');
const aimEl = $('#aim');
const helpEl = $('#help');
// The two lines of help, one per place the reader stands. The globe turns under the pointer and the
// ground carries the reader over it, so the first gesture does a different thing in each, and the
// line has to say which. See updateHelp().
const HELP_ORBIT = 'Drag to spin and tilt · scroll or pinch to zoom · get close to find the wildlife';
const HELP_GROUND = 'Drag or hold to move · WASD and arrows walk, Shift runs · two fingers or right-drag to look · Q E R F turn and tilt';
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

function disposeWorld() {
  if (!current) return;
  showMarker(null);                 // the ring is shared between worlds, so it must not be disposed
  site = null;
  current.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
  scene.remove(current.group);
  current = null;
}

function buildWorld(res) {
  disposeWorld();
  const { world, terrain, flora, clouds, fauna, heightMap } = res;
  const group = new THREE.Group();
  const planet = new THREE.Group();          // spins
  planet.rotation.z = world.tilt;
  group.add(planet);

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

  // fauna (one instanced mesh per species, animated in the vertex shader, roaming on the CPU)
  const faunaMats = [], movers = [], faunaMeshes = [];
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
      geo.setAttribute('aMove', new THREE.InstancedBufferAttribute(new Float32Array(list.length).fill(1), 1).setUsage(THREE.DynamicDrawUsage));
      // the gait clock and the turn of each creature; updateMovers() writes both as it steers
      geo.setAttribute('aGait', new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aTurn', new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1).setUsage(THREE.DynamicDrawUsage));
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
          const st = makeMover(rng, { ...G.move, turnR: sc * (G.cls === 'air' ? 4 : 1.5) });
          st.inst = inst; st.j = j; st.home = pos.clone(); st.n = nrm.clone(); st.t1 = t1; st.t2 = t2; st.sc = sc;
          // the gait clock: the leg cycle runs off the ground it covers, so its feet do not slide
          st.gait = gaitLocked(G) ? makeGait(G, sc, st.speed, geo.userData.hipY) : null;
          if (G.loco === 'monopod') { st.hop = hopGait(G); st.phase = phases[j]; } // a hopper moves in bursts, in step with its shader hop
          const g0 = groundRadius(world, heightMap, nrm);
          st.hover = pos.length() - g0;
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
  cloudGroup.rotation.z = world.tilt;
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
  group.add(cloudGroup);

  // natural activity: at most one per world
  const activity = buildActivity(world, planet, cloudGroup, cloudInst, (dir) => groundRadius(world, heightMap, dir));

  // atmosphere
  if (world.hasAtmosphere) {
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
    ringMesh.rotation.x = -Math.PI / 2 + r.tilt;
    ringMesh.rotation.z = world.tilt;
    ringMesh.receiveShadow = Q.shadows;
    ringMesh.renderOrder = 2;
    group.add(ringMesh);
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
  current = { group, planet, cloudGroup, oceanMat, moons, ringMesh, world, spin: world.spin, faunaMats, movers, cloudMat, faunaMeshes, heightMap, activity, homes };
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
  perf.frame(now, !!dive || busy);
  if (hud && now - hudAt >= HUD_MS) { hudAt = now; hud.update(perfRows()); }
  step(now);
  updateCreatureFloat();
  updateProbeFloat();   // after the creature button, because the probe takes the spot it leaves
  perf.work(performance.now() - now);
}

function step(now) {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  if (dive) stepDive(now);
  if (mode === 'ground') {          // the globe stays in memory, but none of its work runs
    ground.update(t, dt);
    ground.render();
    if (t - hashAt > 0.5) { hashAt = t; writeHash(); }   // the address bar follows the ground camera
    return;
  }
  if (current) {
    const dist = camera.position.length();
    const zoomFactor = THREE.MathUtils.clamp((dist - CAM_MIN) / 1.6, 0.015, 1); // near the ground the world must hold still
    const hold = THREE.MathUtils.smoothstep(dist, PICK_RANGE, PICK_RANGE + 0.4);   // in the pick range it stops, so the site stays put
    // the planet holds still through a transition, so the fixed site cannot drift under the probe
    // the planet also holds still while the reader aims, so the square cannot drift off the ground
    const spin = mode === 'orbit' && !aiming ? current.spin * zoomFactor * hold * (userActive ? 0.15 : 1) : 0;
    current.planet.rotation.y += spin * dt;
    current.cloudGroup.rotation.y += spin * 1.25 * dt;
    if (current.oceanMat?.userData.shader) current.oceanMat.userData.shader.uniforms.uTime.value = t;
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
    for (const m of current.moons) {
      m.angle += m.speed * dt;
      m.mesh.position.set(Math.cos(m.angle) * m.dist, 0, Math.sin(m.angle) * m.dist);
      m.mesh.rotation.y += dt * 0.3;
    }
  }
  if (mode === 'orbit') {
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
    showMarker(lockedSite, current); // the ring stays on the fixed site through the transition
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
    ['mode', mode],
    ['frame', `${perf.avg.toFixed(2)} ms   ${fps.toFixed(0)} fps`],
    ['work', `${perf.avgWork.toFixed(2)} ms`],
    ['target', `${perf.target.toFixed(2)} ms   ${perf.hz} Hz${perf.hzDone ? '' : ' (estimating)'}`],
  ];
  if (mode === 'ground' && ground) {
    const f = ground.flora, a = ground.fauna, g = ground.grass;
    rows.push(['lod', `${ground.lod.distance.toFixed(0)} m   [${ground.lod.min}, ${ground.lod.max}]`]);
    rows.push(['flora', f ? `${f.nearCount} near / ${f.cardCount} cards` : 'none']);
    rows.push(['grass', g ? `${g.count} tufts   ${g.buildMs.toFixed(2)} ms build` : 'none']);
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
let pendingView = null;   // a camera read from the URL: the orbit one on build, the ground one on landing
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
  const onGround = mode === 'ground' || mode === 'descending';
  const view = onGround ? (mode === 'ground' && ground ? ground.view : null) : orbitView();
  return viewToUrl(current.world.seed, onGround ? lockedSite : null, view);
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
// The app holds one mode: orbit, descending, ground, or ascending. The globe scene stays in memory
// in every mode. In ground mode the globe is not drawn and none of its per-frame work runs.
let mode = 'orbit';
let ground = null;        // the Ground instance while the probe is down
let lockedSite = null;    // the site the probe dives to, fixed at the start of the descent
let dive = null;          // { kind, phase, t0, dur, from, to, look }
let patchState = { done: true, result: null };   // the patch the worker builds during the dive

// The patch for the site the probe dives to. The dive holds the screen until the reply lands,
// so the reader never sees the ground build.
function requestPatch(target) {
  const t0 = performance.now();
  patchState = { done: false, result: null };
  if (diveLabel) diveLabel.textContent = 'Sending the probe';
  patchJob = {
    progress: (msg) => { if (diveLabel) diveLabel.textContent = msg.label; },
    done: (result) => {
      patchJob = null;
      patchState = { done: true, result };
      const p = result.patch;
      console.info(`[myworlds] patch "${p.patchSeed}" ${p.biome} at ${p.elevation.toFixed(0)} m, cell ${(p.span / 1000).toFixed(1)} km, ${p.metresAcross.toFixed(0)} m/unit across and ${p.metresUp.toFixed(1)} up, ${p.n}x${p.n}, worker ${Math.round(performance.now() - t0)} ms`);
    },
    fail: (message) => {
      patchJob = null;
      patchState = { done: true, result: null };
      console.error('[myworlds] patch failed:', message);
    },
  };
  getWorker().postMessage({
    type: 'patch', seed: current.world.seed, lat: target.lat, lon: target.lon,
    opts: {
      grid: Q.ground.grid, size: 1500, span: cellSpan(current.world), rim: RIM,
      maxFlora: Q.ground.maxFlora, maxFauna: Q.ground.maxFauna, pulledKind: target.kind ?? -1,
      activity: activityHere(target),
    },
  });
}

// The phenomenon this landing brings, or null. The rule is the cell and not the pull: a landing
// that reaches the cell of the phenomenon without the pull shows it too, and one phenomenon can
// never stand in two patches. The worker builds the patch as before when this gives null. Issue 14.
function activityHere(target) {
  const cell = activitySite(current.world);
  if (!cell) return null;
  const here = snapSite(target);
  return here.lat === cell.lat && here.lon === cell.lon ? { kind: current.world.activity.kind } : null;
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
  return mode === 'orbit' && !dive && !busy && !!current && current.world.type !== 'gas';
}

// Send the probe down. The site is fixed here, so nothing moves under the probe on the way.
function descend(target = site) {
  if (!canDescend() || !target) return;
  stopAim();
  lockedSite = { ...target };
  mode = 'descending';
  controls.enabled = false;
  writeHash();
  updateProbeBtn();
  diveEl.style.background = current.world.palette.atmo || '#8fb7ff';
  requestPatch(lockedSite);
  dive = {
    kind: 'descend', phase: 'in', t0: performance.now(), dur: DIVE_MS,
    from: camera.position.clone(),
    to: siteWorldPoint(lockedSite, 0.004),
    look: siteWorldPoint(lockedSite, -0.4),   // a point under the site holds the aim steady
  };
}

// Recall the probe. The mirror of the descent: fade out, switch, place the camera over the site.
function ascend() {
  if (mode !== 'ground' || dive) return;
  ground.controls.enabled = false;
  updateProbeBtn();
  dive = { kind: 'ascend', phase: 'in', t0: performance.now(), dur: FADE_MS };
}

function stepDive(now) {
  const k = THREE.MathUtils.clamp((now - dive.t0) / dive.dur, 0, 1);
  const e = THREE.MathUtils.smoothstep(k, 0, 1);
  if (dive.phase === 'in') {
    if (dive.kind === 'descend') {
      camera.position.lerpVectors(dive.from, dive.to, e);
      camera.lookAt(dive.look);
    }
    diveEl.style.opacity = String(e);
    if (k < 1) return;
    // the switch waits for the patch, or for the guard, whichever comes first after the floor
    if (dive.kind === 'descend' && !patchState.done && now - dive.t0 < PATCH_WAIT) return;
    if (dive.kind === 'descend') enterGround(); else leaveGround();
    if (diveLabel) diveLabel.textContent = '';
    dive.phase = 'out'; dive.t0 = now; dive.dur = FADE_MS;
    return;
  }
  diveEl.style.opacity = String(1 - e);
  if (k < 1) return;
  diveEl.style.opacity = '0';
  if (dive.kind === 'ascend') { mode = 'orbit'; controls.enabled = true; }
  else if (ground) ground.controls.enabled = true;
  dive = null;
  updateProbeBtn();
}

// The switch into the ground scene, under an opaque overlay.
function enterGround() {
  mode = 'ground';
  ground = new Ground({
    renderer, canvas, world: current.world, site: lockedSite, tier: Q.ground,
    onSelect: (kind) => { markedKind = kind; markedPlant = null; },
    onSelectPlant: (kind) => { markedPlant = kind; markedKind = null; },
    onDeselect: () => { markedKind = null; markedPlant = null; },
  });
  // The plant lore of this patch. It arrives with the patch, because it reads the biome of the
  // site, and it goes away with the patch. See describePatchFlora() in worker.js.
  groundPlants = (patchState.result && patchState.result.patch.plants) || [];
  groundVariant = (patchState.result && patchState.result.patch.floraVariant) || 0;
  renderInfo(current.world);   // the sidebar gains its flora row
  // the sun, the moons, and the ring of the globe, read in the frame of the site: only the app
  // knows planet.rotation.y, so the app turns them and the ground draws them
  const view = skyView(current, lockedSite, sunDir);
  const t0 = performance.now();
  ground.load(patchState.result, { sunDir: view.sunDir, view });
  if (patchState.result) console.info(`[myworlds] ground mesh built in ${Math.round(performance.now() - t0)} ms`);
  if (pendingView) ground.setView(pendingView);   // a shared link brings its own camera
  pendingView = null;
  ground.resize(innerWidth, innerHeight);
  perf.reset();       // the orbit frames say nothing about the ground
  showMarker(null, current);
  writeHash();
}

// The switch back to the globe, under an opaque overlay. Also the straight cut for a new world.
function leaveGround() {
  if (plantInspector.open) closeCard();   // the plant of a patch cannot be studied from orbit
  if (ground) { ground.dispose(); ground = null; }
  markedKind = null; markedPlant = null;  // the marks belong to the patch, and the patch is gone
  perf.reset();       // the ground frames say nothing about the globe
  groundPlants = []; groundVariant = 0;   // the plant lore belongs to the patch too
  if (current) renderInfo(current.world);  // the sidebar loses its flora row
  if (mode === 'ground') mode = 'ascending';
  if (lockedSite) placeCameraOverSite(lockedSite);
  writeHash();
}

// A new world always returns to orbit, whatever the probe was doing.
function abortProbe() {
  stopAim();
  if (mode === 'orbit' && !dive) return;
  if (plantInspector.open) closeCard();
  if (ground) { ground.dispose(); ground = null; }
  markedKind = null; markedPlant = null;
  groundPlants = []; groundVariant = 0;
  perf.reset();
  dive = null;
  lockedSite = null;
  pendingView = null;
  patchJob = null;
  patchState = { done: true, result: null };
  mode = 'orbit';
  controls.enabled = true;
  diveEl.style.opacity = '0';
  if (diveLabel) diveLabel.textContent = '';
  updateProbeBtn();
}

let probeLabel = '';
// The help line follows the reader. The ground gets its own gestures since issue 23, and a line
// that still said "drag to spin" would send the reader looking for a control that is not there.
function updateHelp() {
  if (!helpEl) return;
  const text = mode === 'ground' ? HELP_GROUND : HELP_ORBIT;
  if (helpEl.textContent !== text) helpEl.textContent = text;
}

function updateProbeBtn() {
  if (!probeBtn) return;
  updateHelp();
  const down = mode === 'ground';
  const show = !dive && !busy && (down || canDescend());
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
  if (!dive && !busy && !aiming) {
    // the two floating buttons share one place on the screen, and the creature button says here
    // whether it wants it. See updateCreatureFloat().
    if (mode === 'ground' && ground && ground.atCeiling && !creatureLabel) label = 'Recall the probe';
    else if (mode === 'orbit' && canDescend() && camera.position.length() <= FLOAT_NEAR) label = 'Send a probe to the surface';
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
let creatureLabel = '';
// The plants of the patch the probe is standing on, tallest first, and the flora signature the
// card builds a preview with. Both are empty in orbit, because a plant belongs to a patch.
let groundPlants = [];
let groundVariant = 0;
const plantOf = (kind) => groundPlants.find((p) => p.kind === kind) || null;

// At the ceiling of the ground the marked plant or animal and the probe want the same place on
// the screen. The last thing the reader asked for wins. A reader who keeps pulling back at the
// ceiling asks to leave, so the probe takes the spot even while a ring lies on the ground. A tap
// on a plant or an animal is a question about it, so the card button takes the spot back.
const cardKeepsFloat = () => !ground || !ground.atCeiling || ground.lastGesture !== 'zoom-out';

function updateCreatureFloat() {
  if (!creatureFloat) return;
  let label = '';
  if (mode === 'ground' && !dive && !busy && creatureCard.hidden && cardKeepsFloat()) {
    if (markedKind !== null) {
      const G = current && current.world.species[markedKind];
      if (G) label = `Study the ${G.lore.name}`;
    } else if (markedPlant !== null) {
      const p = plantOf(markedPlant);
      if (p) label = `Study the ${p.lore.name}`;   // the same form the animal takes, so one button reads one way
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
  });
}

// creatures roam around their home spot on procedural paths, follow the ground, and stay out of the sea
const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Matrix4();
let moverFrame = 0;
function updateMovers(t, dt) {
  const { movers, world, heightMap } = current;
  if (!movers.length) return;
  moverFrame++;
  const far = camera.position.length() > 2.6; // sub-pixel from far away: step at ~15 Hz
  if (far && moverFrame % 4) return;
  if (far) dt *= 4;
  const dirty = new Set();
  const seaR = world.seaRadius || 0;
  for (const mv of movers) {
    const pu = mv.u, pv = mv.v;
    stepMover(mv, t, dt, mv.hop ? hopBurst(mv.hop, t, mv.phase) : 1);
    _u.copy(mv.n).addScaledVector(mv.t1, mv.u).addScaledVector(mv.t2, mv.v).normalize();
    let ground = groundRadius(world, heightMap, _u);
    if (!mv.flies && mv.dry && ground < seaR + 0.0005) {
      // water ahead: step back and turn around
      mv.u = pu; mv.v = pv; mv.heading += Math.PI * 0.75; mv.spd = 0;
      _u.copy(mv.n).addScaledVector(mv.t1, mv.u).addScaledVector(mv.t2, mv.v).normalize();
      ground = groundRadius(world, heightMap, _u);
    }
    if (mv.flies) ground = Math.max(ground, seaR);
    _p.copy(_u).multiplyScalar(ground + mv.hover);
    _f.copy(mv.t1).multiplyScalar(Math.cos(mv.heading)).addScaledVector(mv.t2, Math.sin(mv.heading));
    _f.addScaledVector(_u, -_f.dot(_u)).normalize();
    _r.crossVectors(_u, _f).normalize();
    _m.makeBasis(_r.multiplyScalar(mv.sc), _u.multiplyScalar(mv.sc), _f.multiplyScalar(mv.sc));
    _m.setPosition(_p);
    mv.inst.setMatrixAt(mv.j, _m);
    const at = mv.inst.geometry.attributes;
    const act = mv.flies ? 1 : moverActivity(mv);
    if (!mv.flies) at.aMove.setX(mv.j, act);   // legs only swing while it walks
    if (mv.gait) at.aGait.setX(mv.j, stepGait(mv.gait, mv.spd, act, dt));
    at.aTurn.setX(mv.j, mv.turnN);   // turnN already falls to zero as the animal slows
    dirty.add(mv.inst);
  }
  for (const inst of dirty) {
    const at = inst.geometry.attributes;
    inst.instanceMatrix.needsUpdate = true;
    at.aMove.needsUpdate = true; at.aGait.needsUpdate = true; at.aTurn.needsUpdate = true;
  }
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
  worker = new Worker('./worker.js');
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
      pendingSite = null;
      const orbit = pendingView && pendingView.kind === 'orbit' ? pendingView : null;
      if (orbit) pendingView = null;
      if (!(wanted && placeCameraOverSite(wanted)) && !placeCameraAtView(orbit)) resetCamera();
      console.info(`[myworlds] "${seed}" ${msg.result.world.type} built in ${Math.round(performance.now() - t0)} ms, worker ${Math.round(t0 - genStart)} ms, flora ${msg.result.world.floraCount}, fauna ${msg.result.world.faunaCount}`);
      // The programs of the new materials build here, under the overlay, and not in the first draw
      // that needs them. This has to stand before saveWorld(), because the thumbnail of a world is
      // a frame of it: makeThumb() draws the scene, and that draw would build the programs itself.
      // See warmShaders().
      await warmShaders();
      renderInfo(msg.result.world);
      music.play(msg.result.world);
      if (save) saveWorld(msg.result.world);
      const landing = wanted && current.world.type !== 'gas' ? wanted : null;
      if (!landing) pendingView = null;   // no landing, so a ground camera in the URL has no ground
      writeHash();
      input.value = seed;
      if (COMPACT) setCollapsed(true);
      setTimeout(() => {
        overlay.classList.remove("show"); busy = false;
        // a shared link with a site lands the reader on the ground
        if (landing) descend(landing); else updateProbeBtn();
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
  w.postMessage({ type: 'generate', seed, opts: { detail: Q.detail, maxFlora: Q.maxFlora, maxFauna: Q.maxFauna } });
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
    el.innerHTML = `<img alt="" src="${w.thumb || ''}"><span class="wname">${escapeHtml(w.seed)}</span><span class="wtype">${escapeHtml(w.typeLabel || w.type)}</span><i class="del" title="Forget this world">×</i>`;
    el.querySelector('img').addEventListener('error', (e) => { e.target.style.visibility = 'hidden'; });
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('del')) { e.stopPropagation(); deleteWorld(w.seed); return; }
      generate(w.seed);
    });
    worldsEl.appendChild(el);
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function renderInfo(w) {
  const s = w.stats;
  infoBody.innerHTML = `
    <div class="iname">${escapeHtml(w.seed)}</div>
    <div class="itype">${escapeHtml(w.designation)} · ${escapeHtml(w.typeLabel)}</div>
    <dl>
      <dt>Radius</dt><dd>${s.radius}</dd>
      <dt>Gravity</dt><dd>${s.gravity}</dd>
      <dt>Day</dt><dd>${s.day}</dd>
      <dt>Temp</dt><dd>${s.temp}</dd>
      ${s.land ? `<dt>Land</dt><dd>${s.land}</dd>` : ''}
      ${s.activity ? `<dt>Activity</dt><dd>${escapeHtml(s.activity)}</dd>` : ''}
      <dt>Moons</dt><dd>${w.moons.length ? w.moons.map((m) => escapeHtml(m.name)).join(', ') : 'none'}</dd>
      <dt>Life</dt><dd>${escapeHtml(s.life)}</dd>
      <dt>Fauna</dt><dd class="chips">${(w.faunaKinds || []).length ? w.faunaKinds.map((k) => `<button type="button" class="chip" data-kind="${k}">${escapeHtml(w.species[k].lore.name)}</button>`).join('') : 'none seen'}</dd>
      ${groundPlants.length ? `<dt>Flora</dt><dd class="chips">${groundPlants.map((p) => `<button type="button" class="chip" data-plant="${p.kind}">${escapeHtml(p.lore.name)}</button>`).join('')}</dd>` : ''}
    </dl>`;
  // The flora row only exists while the probe is down, because the plants belong to the patch.
  infoBody.querySelectorAll('.chip[data-kind]').forEach((b) => b.addEventListener('click', () => inspect(+b.dataset.kind)));
  infoBody.querySelectorAll('.chip[data-plant]').forEach((b) => b.addEventListener('click', () => {
    const kind = +b.dataset.plant;
    inspectPlant(kind);
    if (mode === 'ground' && ground) markedPlant = ground.focusPlant(kind) ? kind : null;
  }));
  infoEl.hidden = false;
  hworld.textContent = `${w.seed} · ${w.typeLabel}`;
}

// ---------------------------------------------------------------- the study card
// One card element carries two subjects. An animal is a subject of the world, so its card opens
// from orbit and from the ground. A plant is a subject of a patch: the lore of a plant reads the
// biome it stands on, and the patch is the only place that biome is known, so the plant card only
// opens while the probe is down. See docs/flora.md.
//
// Each inspector owns its own canvas, because a WebGLRenderer owns the canvas it draws to. The
// card shows one of the two and hides the other.
const creatureCard = $('#creature');
const creatureCanvas = $('#ccv'), plantCanvas = $('#pcv');
const inspector = new Inspector({ card: creatureCard, canvas: creatureCanvas });
const plantInspector = new PlantInspector({ card: creatureCard, canvas: plantCanvas });
// What the card shows: 'animal' or 'plant'. The arrows and the close read it.
const cardOpen = () => inspector.open || plantInspector.open;
function closeCard() { inspector.hide(); plantInspector.hide(); }
function discColor() {
  const pal = current.world.palette;
  return current.world.type === 'gas' ? pal.atmo : (pal.ground || '#7fa860');
}
// Opening one subject takes the mark off the other, so the ring on the ground always names the
// card the reader is looking at. The mark of the subject being opened is set by the caller, which
// is the only one that knows whether the patch really holds it.
function inspect(kind) {
  if (!current) return;
  markedPlant = null;
  if (ground && ground.flora) ground.flora.unmark();
  plantInspector.hide();
  creatureCard.classList.add('show');    // the two share the card, so a swap must not fade it out
  creatureCard.hidden = false;
  plantCanvas.hidden = true; creatureCanvas.hidden = false;
  inspector.show(current.world.species[kind], current.world.palette, discColor(), 3 + kind);
  creatureCard.dataset.kind = kind;
  creatureCard.dataset.subject = 'animal';
}
function inspectPlant(kind) {
  const p = plantOf(kind);
  if (!current || !p) return;
  markedKind = null;
  if (ground && ground.fauna) ground.fauna.unmark();
  inspector.hide();
  creatureCard.classList.add('show');
  creatureCard.hidden = false;
  creatureCanvas.hidden = true; plantCanvas.hidden = false;
  plantInspector.show(p, current.world.palette, discColor(), groundVariant);
  creatureCard.dataset.kind = kind;
  creatureCard.dataset.subject = 'plant';
}
creatureCard.querySelector('.cclose').addEventListener('click', closeCard);
creatureCard.addEventListener('click', (e) => { if (e.target === creatureCard) closeCard(); });
creatureCard.querySelector('.cprev').addEventListener('click', () => cycleInspect(-1));
creatureCard.querySelector('.cnext').addEventListener('click', () => cycleInspect(1));
function cycleInspect(dir) {
  if (creatureCard.dataset.subject === 'plant') return cyclePlant(dir);
  // On the ground the list also carries the species of the patch: the pull and the niches can
  // put an animal on the ground that the globe sample never drew, and the arrows must reach it.
  const kinds = (current?.world.faunaKinds || []).slice();
  if (mode === 'ground' && ground && ground.fauna) {
    for (const e of ground.fauna.kinds) if (!kinds.includes(e.kind)) kinds.push(e.kind);
  }
  if (!kinds.length) return;
  const i = kinds.indexOf(+creatureCard.dataset.kind);
  const kind = kinds[(i + dir + kinds.length) % kinds.length];
  inspect(kind);
  // The arrows also point the camera at the nearest animal of the species, behind the card. A
  // species the patch does not host leaves the camera where it is, and takes the mark off.
  if (mode === 'ground' && ground) markedKind = ground.focusKind(kind) ? kind : null;
}
// The arrows walk the plants of this patch, in the order the worker wrote them: tallest first.
function cyclePlant(dir) {
  if (!groundPlants.length) return;
  const i = groundPlants.findIndex((p) => p.kind === +creatureCard.dataset.kind);
  const kind = groundPlants[(i + dir + groundPlants.length) % groundPlants.length].kind;
  inspectPlant(kind);
  if (mode === 'ground' && ground) markedPlant = ground.focusPlant(kind) ? kind : null;
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && cardOpen()) closeCard(); });
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (ground) ground.resize(innerWidth, innerHeight);
  if (inspector.open) inspector.resize();
  if (plantInspector.open) plantInspector.resize();
});

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
  if (moved > 6 || busy || mode !== 'orbit') return;   // the globe creatures are not on the screen on the ground
  if (aiming) { aimAt(e.clientX, e.clientY); return; }  // the tap sends the probe, it does not open a card
  const kind = creatureAt(e.clientX, e.clientY, e.pointerType === 'touch' ? 52 : 34);
  if (kind !== null) inspect(kind);
});
let hoverTick = 0;
canvas.addEventListener('pointermove', (e) => {
  if (aiming) { setAimNdc(e.clientX, e.clientY); return; }
  if (e.pointerType === 'touch' || downAt || mode !== 'orbit' || (++hoverTick & 3)) return;
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
  if (mode === 'ground') ascend();
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
  else if (mode !== 'orbit') return;
  else if (fromHash) { pendingSite = null; pendingView = view; placeCameraOverSite(fromHash); descend(fromHash); }
  else { pendingSite = null; pendingView = null; placeCameraAtView(view); }
});
addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  if (e.key !== 'Escape') return;
  if (!creatureCard.hidden) closeCard();
  else if (markedKind !== null) { if (ground && ground.fauna) ground.fauna.unmark(); markedKind = null; }
  else if (markedPlant !== null) { if (ground && ground.flora) ground.flora.unmark(); markedPlant = null; }
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

// debug handle (harmless in production)
window.__mw = {
  scene, camera, controls, renderer, generate, inspect, inspector, music, descend, ascend, perf,
  inspectPlant, plantInspector,
  get current() { return current; },
  get site() { return site; },
  get mode() { return mode; },
  get ground() { return ground; },
  get plants() { return groundPlants; },
  get marked() { return { animal: markedKind, plant: markedPlant }; },
};
