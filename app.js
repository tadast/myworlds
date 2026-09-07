// myworlds — main thread: rendering, controls, UI, storage.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Music } from './music.js';
import { buildActivity } from './phenomena.js';
import { BASE_SCALE, buildCreature, faunaMaterial, mergeGeos, M4, makeMover, stepMover, moverActivity, hopGait, hopBurst, Inspector } from './fauna.js';

// ---------------------------------------------------------------- config
const isCoarse = matchMedia('(pointer: coarse)').matches;
const isSmall = Math.min(innerWidth, innerHeight) < 600;
const LOW = isCoarse || isSmall || (navigator.hardwareConcurrency || 4) <= 4;
const COMPACT = isCoarse || isSmall; // the sidebar folds away so the planet stays visible
const Q = {
  detail: LOW ? 64 : 100,
  maxFlora: LOW ? 2500 : 7000,
  maxFauna: LOW ? 70 : 160,
  shadows: !LOW,
  dpr: Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2),
};
const STORE_KEY = 'myworlds.v1';
const MAX_SAVED = 60;
const CAM_MIN = 1.11, CAM_MAX = 8, CAM_HOME = 3.3;

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

// ---------------------------------------------------------------- geometry helpers

// unit-height flora, base at origin, y up
function floraGeometry(kind, fc) {
  const { canopy, canopy2, trunk } = fc;
  switch (kind) {
    case 0: // round tree
      return mergeGeos([
        { geo: new THREE.CylinderGeometry(0.1, 0.14, 0.45, 5), color: trunk, matrix: M4(0, 0.22, 0) },
        { geo: new THREE.IcosahedronGeometry(0.5, 0), color: canopy, matrix: M4(0, 0.75, 0, 1, 0.9, 1, 0.3, 0.2) },
      ]);
    case 1: // pine
      return mergeGeos([
        { geo: new THREE.CylinderGeometry(0.08, 0.12, 0.35, 5), color: trunk, matrix: M4(0, 0.17, 0) },
        { geo: new THREE.ConeGeometry(0.42, 0.6, 6), color: canopy, matrix: M4(0, 0.5, 0) },
        { geo: new THREE.ConeGeometry(0.3, 0.5, 6), color: canopy, matrix: M4(0, 0.85, 0) },
      ]);
    case 2: // cactus
      return mergeGeos([
        { geo: new THREE.CylinderGeometry(0.16, 0.18, 1, 6), color: canopy, matrix: M4(0, 0.5, 0) },
        { geo: new THREE.CylinderGeometry(0.1, 0.1, 0.45, 5), color: canopy, matrix: M4(0.22, 0.6, 0, 1, 1, 1, 0, 0.9) },
      ]);
    case 3: // crystal
      return mergeGeos([
        { geo: new THREE.OctahedronGeometry(0.28, 0), color: canopy, matrix: M4(0, 0.55, 0, 1, 2.2, 1, 0.15, 0.1) },
        { geo: new THREE.OctahedronGeometry(0.18, 0), color: canopy, matrix: M4(0.2, 0.3, 0.1, 1, 1.8, 1, 0.2, -0.5) },
      ]);
    case 4: // mushroom
      return mergeGeos([
        { geo: new THREE.CylinderGeometry(0.12, 0.16, 0.6, 5), color: trunk, matrix: M4(0, 0.3, 0) },
        { geo: new THREE.IcosahedronGeometry(0.5, 1), color: canopy2, matrix: M4(0, 0.7, 0, 1, 0.55, 1) },
      ]);
    case 5: // boulder
      return mergeGeos([
        { geo: new THREE.DodecahedronGeometry(0.4, 0), color: canopy2, matrix: M4(0, 0.25, 0, 1.2, 0.8, 1, 0.4, 0.3) },
      ]);
    case 6: // palm
      return mergeGeos([
        { geo: new THREE.CylinderGeometry(0.07, 0.11, 0.8, 5), color: trunk, matrix: M4(0.05, 0.4, 0, 1, 1, 1, 0, -0.12) },
        { geo: new THREE.ConeGeometry(0.45, 0.25, 5), color: canopy, matrix: M4(0.12, 0.72, 0, 1, 1, 1, Math.PI, 0) },
        { geo: new THREE.ConeGeometry(0.35, 0.2, 5), color: canopy, matrix: M4(0.12, 0.85, 0, 1, 1, 1, 0, 0.4) },
      ]);
  }
}

// ---------------------------------------------------------------- world building
let current = null; // { group, spin, oceanMat, cloudGroup, moons, ringMesh, data }

function disposeWorld() {
  if (!current) return;
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
    const wobble = pal.oceanIce ? 0 : pal.oceanLava ? 0.0025 : 0.0012;
    oceanMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float w = sin(uTime * 1.6 + position.x * 55.0 + position.z * 31.0) * sin(uTime * 1.1 + position.y * 47.0);
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
    const baseScale = 0.011;
    const rng = mulberry32(7);
    for (const [kind, list] of kinds) {
      const geo = floraGeometry(kind, world.palette.flora);
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
          const st = makeMover(rng, G.move);
          st.inst = inst; st.j = j; st.home = pos.clone(); st.n = nrm.clone(); st.t1 = t1; st.t2 = t2; st.sc = sc;
          if (G.loco === 'monopod') { st.hop = hopGait(G); st.phase = phases[j]; } // a hopper moves in bursts, in step with its shader hop
          const g0 = sampleGround(world, heightMap, nrm);
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
  const activity = buildActivity(world, planet, cloudGroup, cloudInst, (dir) => sampleGround(world, heightMap, dir));

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
  current = { group, planet, cloudGroup, oceanMat, moons, ringMesh, world, spin: world.spin, faunaMats, movers, cloudMat, faunaMeshes, heightMap, activity };
}

// ---------------------------------------------------------------- render loop
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  if (current) {
    const dist = camera.position.length();
    const zoomFactor = THREE.MathUtils.clamp((dist - CAM_MIN) / 1.6, 0.015, 1); // near the ground the world must hold still
    const spin = current.spin * zoomFactor * (userActive ? 0.15 : 1);
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
  // near the surface, drags and wheel steps must move the camera much less
  const near = THREE.MathUtils.clamp((camera.position.length() - 1) / 2.3, 0.08, 1);
  controls.rotateSpeed = 0.7 * near;
  controls.zoomSpeed = 0.9 * Math.max(near, 0.2);
  controls.update();
  // near the surface, tilt the view toward the horizon so relief reads in profile
  const d = camera.position.length();
  const pitch = (1 - THREE.MathUtils.smoothstep(d, CAM_MIN, 2.3)) * 0.95;
  if (pitch > 0) camera.rotateX(pitch);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ground radius under a unit direction (planet space), from the worker's lat/lon height map
function sampleGround(world, hm, dir) {
  if (!hm || !world.heightMapSize) return 1;
  const [W, H] = world.heightMapSize;
  const u = (Math.atan2(dir.z, dir.x) / (Math.PI * 2) + 0.5) * W - 0.5;
  const v = (Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) / Math.PI + 0.5) * H - 0.5;
  const x0 = Math.floor(u), y0 = THREE.MathUtils.clamp(Math.floor(v), 0, H - 2);
  const fx = u - x0, fy = THREE.MathUtils.clamp(v - y0, 0, 1);
  const xa = ((x0 % W) + W) % W, xb = (xa + 1) % W;
  const a = hm[xa + y0 * W], b = hm[xb + y0 * W], c = hm[xa + (y0 + 1) * W], d = hm[xb + (y0 + 1) * W];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
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
    let ground = sampleGround(world, heightMap, _u);
    if (!mv.flies && mv.dry && ground < seaR + 0.0005) {
      // water ahead: step back and turn around
      mv.u = pu; mv.v = pv; mv.heading += Math.PI * 0.75; mv.spd = 0;
      _u.copy(mv.n).addScaledVector(mv.t1, mv.u).addScaledVector(mv.t2, mv.v).normalize();
      ground = sampleGround(world, heightMap, _u);
    }
    if (mv.flies) ground = Math.max(ground, seaR);
    _p.copy(_u).multiplyScalar(ground + mv.hover);
    _f.copy(mv.t1).multiplyScalar(Math.cos(mv.heading)).addScaledVector(mv.t2, Math.sin(mv.heading));
    _f.addScaledVector(_u, -_f.dot(_u)).normalize();
    _r.crossVectors(_u, _f).normalize();
    _m.makeBasis(_r.multiplyScalar(mv.sc), _u.multiplyScalar(mv.sc), _f.multiplyScalar(mv.sc));
    _m.setPosition(_p);
    mv.inst.setMatrixAt(mv.j, _m);
    if (!mv.flies) mv.inst.geometry.attributes.aMove.setX(mv.j, moverActivity(mv)); // legs only swing while it walks
    dirty.add(mv.inst);
  }
  for (const inst of dirty) { inst.instanceMatrix.needsUpdate = true; inst.geometry.attributes.aMove.needsUpdate = true; }
}
// ---------------------------------------------------------------- worker / generation
let worker = null;
let busy = false;
function getWorker() {
  if (worker) return worker;
  worker = new Worker('./worker.js');
  return worker;
}

function generate(seed, { save = true } = {}) {
  seed = seed.trim();
  if (!seed || busy) return;
  busy = true;
  const genStart = performance.now();
  overlay.classList.add("show");
  overlayBar.style.width = '2%';
  overlayLabel.textContent = 'Seeding the void';
  const w = getWorker();
  w.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === 'progress') {
      overlayBar.style.width = `${msg.pct.toFixed(0)}%`;
      overlayLabel.textContent = msg.label;
    } else if (msg.type === 'done') {
      overlayBar.style.width = "100%";
      const t0 = performance.now();
      buildWorld(msg.result);
      resetCamera();
      console.info(`[myworlds] "${seed}" ${msg.result.world.type} built in ${Math.round(performance.now() - t0)} ms, worker ${Math.round(t0 - genStart)} ms`);
      renderInfo(msg.result.world);
      music.play(msg.result.world);
      if (save) saveWorld(msg.result.world);
      history.replaceState(null, '', '#' + encodeURIComponent(seed));
      input.value = seed;
      if (COMPACT) setCollapsed(true);
      setTimeout(() => { overlay.classList.remove("show"); busy = false; }, 250);
    } else if (msg.type === 'error') {
      overlayLabel.textContent = 'Generation failed. See console.';
      console.error(msg.message);
      setTimeout(() => { overlay.classList.remove('show'); busy = false; }, 1500);
    }
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
    </dl>`;
  infoBody.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => inspect(+b.dataset.kind)));
  infoEl.hidden = false;
  hworld.textContent = `${w.seed} · ${w.typeLabel}`;
}

// ---------------------------------------------------------------- creature inspector
const creatureCard = $('#creature');
const inspector = new Inspector({ card: creatureCard, canvas: $('#ccv') });
function inspect(kind) {
  if (!current) return;
  const pal = current.world.palette;
  const ground = current.world.type === 'gas' ? pal.atmo : (pal.ground || '#7fa860');
  inspector.show(current.world.species[kind], pal, ground, 3 + kind);
  creatureCard.dataset.kind = kind;
}
creatureCard.querySelector('.cclose').addEventListener('click', () => inspector.hide());
creatureCard.addEventListener('click', (e) => { if (e.target === creatureCard) inspector.hide(); });
creatureCard.querySelector('.cprev').addEventListener('click', () => cycleInspect(-1));
creatureCard.querySelector('.cnext').addEventListener('click', () => cycleInspect(1));
function cycleInspect(dir) {
  const kinds = current?.world.faunaKinds || [];
  if (!kinds.length) return;
  const i = kinds.indexOf(+creatureCard.dataset.kind);
  inspect(kinds[(i + dir + kinds.length) % kinds.length]);
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && inspector.open) inspector.hide(); });
addEventListener('resize', () => { if (inspector.open) inspector.resize(); });

// pick a creature under a screen point: nearest projected instance on the visible hemisphere
const _pv = new THREE.Vector3(), _pt = new THREE.Vector3(), _pn = new THREE.Vector3(), _pm = new THREE.Matrix4();
function creatureAt(px, py, tolerance = 26) {
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
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 6 || busy) return;
  const kind = creatureAt(e.clientX, e.clientY, e.pointerType === 'touch' ? 36 : 26);
  if (kind !== null) inspect(kind);
});
let hoverTick = 0;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || downAt || (++hoverTick & 3)) return;
  canvas.style.cursor = creatureAt(e.clientX, e.clientY) !== null ? 'pointer' : '';
});

// ---------------------------------------------------------------- ui
const WORDS = ['Aurora', 'Pebble', 'Nimbus', 'Tadas', 'Juniper', 'Comet', 'Marble', 'Saffron', 'Willow', 'Quasar', 'Pumpkin', 'Zephyr', 'Lumen', 'Basil', 'Orchid', 'Tundra', 'Kepler', 'Mango', 'Fjord', 'Nova'];
form.addEventListener('submit', (e) => { e.preventDefault(); generate(input.value); input.blur(); });
diceBtn.addEventListener('click', () => {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)] + '-' + Math.floor(Math.random() * 900 + 100);
  input.value = w; generate(w);
});
function setCollapsed(on) {
  panel.classList.toggle('collapsed', on);
  toggleBtn.setAttribute('aria-expanded', String(!on));
  toggleBtn.setAttribute('aria-label', on ? 'Expand sidebar' : 'Collapse sidebar');
}
toggleBtn.addEventListener('click', () => setCollapsed(!panel.classList.contains('collapsed')));
panel.querySelector('header').addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  setCollapsed(!panel.classList.contains('collapsed'));
});
// On a phone the sheet covers the planet: a touch on the canvas folds it away.
if (COMPACT) canvas.addEventListener('pointerdown', () => setCollapsed(true));
shareBtn.addEventListener('click', async () => {
  if (!current) return;
  const url = location.origin + location.pathname + '#' + encodeURIComponent(current.world.seed);
  try { await navigator.clipboard.writeText(url); shareBtn.textContent = 'Copied!'; }
  catch { shareBtn.textContent = url; }
  setTimeout(() => (shareBtn.textContent = 'Share link'), 1500);
});
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
  const seed = decodeURIComponent(location.hash.slice(1));
  if (seed && (!current || current.world.seed !== seed)) generate(seed);
});
addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  if (e.key === 'Escape' && !creatureCard.hidden) inspector.hide();
});
if (COMPACT) setCollapsed(true);

// ---------------------------------------------------------------- boot
renderWorlds();
{
  const fromHash = decodeURIComponent(location.hash.slice(1));
  const saved = loadWorlds();
  const seed = fromHash || (saved.length ? saved[saved.length - 1].seed : WORDS[Math.floor(Math.random() * WORDS.length)]);
  generate(seed);
}

// debug handle (harmless in production)
window.__mw = { scene, camera, controls, renderer, get current() { return current; }, generate, inspect, inspector, music };
