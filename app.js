// myworlds — main thread: rendering, controls, UI, storage.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------- config
const isCoarse = matchMedia('(pointer: coarse)').matches;
const isSmall = Math.min(innerWidth, innerHeight) < 600;
const LOW = isCoarse || isSmall || (navigator.hardwareConcurrency || 4) <= 4;
const Q = {
  detail: LOW ? 64 : 100,
  maxFlora: LOW ? 2500 : 7000,
  shadows: !LOW,
  dpr: Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2),
};
const STORE_KEY = 'myworlds.v1';
const MAX_SAVED = 60;
const CAM_MIN = 1.28, CAM_MAX = 8, CAM_HOME = 3.3;

// ---------------------------------------------------------------- dom
const $ = (s) => document.querySelector(s);
const canvas = $('#c');
const form = $('#seed-form');
const input = $('#seed');
const diceBtn = $('#dice');
const worldsEl = $('#worlds');
const infoEl = $('#info');
const overlay = $('#overlay');
const overlayLabel = $('#overlay-label');
const overlayBar = $('#overlay-bar');
const toggleBtn = $('#toggle');
const panel = $('#panel');
const hint = $('#hint');
const shareBtn = $('#share');

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
controls.addEventListener('start', () => { userActive = true; lastInteract = performance.now(); hideHint(); });
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
function mergeGeos(parts) {
  // parts: [{geo, color, matrix}] → single non-indexed geometry with vertex colours
  const pos = [], nor = [], col = [];
  const n = new THREE.Vector3(), p = new THREE.Vector3();
  for (const { geo, color, matrix } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const pa = g.attributes.position, na = g.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const c = new THREE.Color(color);
    for (let i = 0; i < pa.count; i++) {
      p.fromBufferAttribute(pa, i).applyMatrix4(matrix);
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
const M4 = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz));

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
  const { world, terrain, flora, clouds } = res;
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

  // clouds
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
  }
  group.add(cloudGroup);

  // atmosphere
  if (world.hasAtmosphere) {
    const outer = new THREE.Mesh(new THREE.IcosahedronGeometry(1.17, 4), atmoOuterMat(world.palette.atmo, world.atmoStrength));
    outer.renderOrder = 3;
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.115, 4), atmoInnerMat(world.palette.atmo, world.atmoStrength));
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
  current = { group, planet, cloudGroup, oceanMat, moons, ringMesh, world, spin: world.spin };
}

// ---------------------------------------------------------------- render loop
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  if (current) {
    const dist = camera.position.length();
    const zoomFactor = THREE.MathUtils.clamp((dist - CAM_MIN) / 1.6, 0.06, 1);
    const spin = current.spin * zoomFactor * (userActive ? 0.15 : 1);
    current.planet.rotation.y += spin * dt;
    current.cloudGroup.rotation.y += spin * 1.25 * dt;
    if (current.oceanMat?.userData.shader) current.oceanMat.userData.shader.uniforms.uTime.value = t;
    for (const m of current.moons) {
      m.angle += m.speed * dt;
      m.mesh.position.set(Math.cos(m.angle) * m.dist, 0, Math.sin(m.angle) * m.dist);
      m.mesh.rotation.y += dt * 0.3;
    }
  }
  controls.update();
  // near the surface, tilt the view toward the horizon so relief reads in profile
  const d = camera.position.length();
  const pitch = (1 - THREE.MathUtils.smoothstep(d, CAM_MIN, 2.3)) * 0.8;
  if (pitch > 0) camera.rotateX(pitch);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

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
      if (save) saveWorld(msg.result.world);
      history.replaceState(null, '', '#' + encodeURIComponent(seed));
      input.value = seed;
      if (LOW) panel.classList.add("collapsed");
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
  w.postMessage({ type: 'generate', seed, opts: { detail: Q.detail, maxFlora: Q.maxFlora } });
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
  infoEl.innerHTML = `
    <div class="iname">${escapeHtml(w.seed)}</div>
    <div class="itype">${escapeHtml(w.designation)} · ${escapeHtml(w.typeLabel)}</div>
    <dl>
      <dt>Radius</dt><dd>${s.radius}</dd>
      <dt>Gravity</dt><dd>${s.gravity}</dd>
      <dt>Day</dt><dd>${s.day}</dd>
      <dt>Temp</dt><dd>${s.temp}</dd>
      <dt>Moons</dt><dd>${w.moons.length ? w.moons.map((m) => escapeHtml(m.name)).join(', ') : 'none'}</dd>
      <dt>Life</dt><dd>${escapeHtml(s.life)}</dd>
    </dl>`;
  infoEl.classList.add('show');
}

// ---------------------------------------------------------------- ui
const WORDS = ['Aurora', 'Pebble', 'Nimbus', 'Tadas', 'Juniper', 'Comet', 'Marble', 'Saffron', 'Willow', 'Quasar', 'Pumpkin', 'Zephyr', 'Lumen', 'Basil', 'Orchid', 'Tundra', 'Kepler', 'Mango', 'Fjord', 'Nova'];
form.addEventListener('submit', (e) => { e.preventDefault(); generate(input.value); input.blur(); });
diceBtn.addEventListener('click', () => {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)] + '-' + Math.floor(Math.random() * 900 + 100);
  input.value = w; generate(w);
});
toggleBtn.addEventListener('click', () => panel.classList.toggle('collapsed'));
shareBtn.addEventListener('click', async () => {
  if (!current) return;
  const url = location.origin + location.pathname + '#' + encodeURIComponent(current.world.seed);
  try { await navigator.clipboard.writeText(url); shareBtn.textContent = 'Copied!'; }
  catch { shareBtn.textContent = url; }
  setTimeout(() => (shareBtn.textContent = 'Share link'), 1500);
});
function hideHint() { hint.classList.add('hide'); }
setTimeout(hideHint, 9000);
addEventListener('hashchange', () => {
  const seed = decodeURIComponent(location.hash.slice(1));
  if (seed && (!current || current.world.seed !== seed)) generate(seed);
});
addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
});
if (LOW) panel.classList.add('collapsed');

// ---------------------------------------------------------------- boot
renderWorlds();
{
  const fromHash = decodeURIComponent(location.hash.slice(1));
  const saved = loadWorlds();
  const seed = fromHash || (saved.length ? saved[saved.length - 1].seed : WORDS[Math.floor(Math.random() * WORDS.length)]);
  generate(seed);
}
