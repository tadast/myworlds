// myworlds — natural activity on the main thread: the moving parts of the one phenomenon a world can have.
// The worker picked the kind and the site, shaped and painted the ground (world.activity).
// This module adds glow, smoke, jets, curtains, and bolts, and animates them each frame.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// a tangent frame at a unit direction
function frame(dir) {
  const n = new THREE.Vector3().fromArray(dir).normalize();
  const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
  return { n, t1, t2 };
}
function quatTo(n) { return new THREE.Quaternion().setFromUnitVectors(UP, n); }

// ---------------------------------------------------------------- point sprites
// One vertex shader per particle kind, one soft-disc fragment shader.
const DISC_FRAG = `
  uniform vec3 uColor; varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.12, d) * vA;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }`;
const POINT_HEAD = `
  attribute float aPhase; attribute vec3 aSeed;
  uniform float uTime; uniform float uScale; uniform vec3 uN; uniform vec3 uT1; uniform vec3 uT2;
  varying float vA;
  void emit(vec3 p, float size, float a) {
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uScale / max(-mv.z, 0.02);
    vA = a;
  }`;
// smoke: rises, spreads, drifts downwind, fades
const SMOKE_VERT = POINT_HEAD + `
  uniform float uRise;
  void main() {
    float life = 7.0;
    float age = mod(uTime * 0.3 + aPhase * life, life) / life;
    vec3 side = uT1 * (aSeed.x - 0.5) + uT2 * (aSeed.y - 0.5);
    vec3 p = position + uN * (age * uRise) + side * age * 0.06 + uT1 * age * age * 0.05;
    float s = (0.014 + age * 0.045) * (0.7 + aSeed.z * 0.6);
    float a = smoothstep(0.0, 0.08, age) * pow(1.0 - age, 1.4) * 0.5;
    emit(p, s, a);
  }`;
// embers: short ballistic sparks
const EMBER_VERT = POINT_HEAD + `
  void main() {
    float life = 1.8;
    float age = mod(uTime * 0.9 + aPhase * life, life);
    vec3 side = uT1 * (aSeed.x - 0.5) + uT2 * (aSeed.y - 0.5);
    vec3 p = position + uN * (0.06 * age - 0.03 * age * age) + side * age * 0.05;
    float a = (1.0 - age / life) * 0.9;
    emit(p, 0.004 + aSeed.z * 0.003, a);
  }`;
// geyser: a jet in bursts, water rises and falls back, steam drifts up
const JET_VERT = POINT_HEAD + `
  uniform float uCycle; uniform float uActive; uniform float uV0; uniform float uG;
  void main() {
    float steam = step(0.5, aSeed.z);
    float life = mix(2.4, 5.0, steam);
    float t = mod(uTime, uCycle);
    float born = aPhase * uActive;
    float age = t - born;
    vec3 side = uT1 * (aSeed.x - 0.5) + uT2 * (aSeed.y - 0.5);
    float up = mix(uV0 * age - 0.5 * uG * age * age, 0.03 * age, steam);
    vec3 p = position + uN * up + side * age * mix(0.012, 0.018, steam);
    float on = step(0.0, age) * step(age, life);
    float a = on * (1.0 - age / life) * mix(0.9, 0.18, steam) * smoothstep(0.0, 0.05, age);
    float s = mix(0.0035 + aSeed.y * 0.002, 0.006 + age * 0.005, steam);
    emit(p, s * on, a);
  }`;

function points(n, rng, origin, vert, color, extra, blending) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), ph = new Float32Array(n), sd = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
    ph[i] = rng(); sd[i * 3] = rng(); sd[i * 3 + 1] = rng(); sd[i * 3 + 2] = rng();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 3));
  g.boundingSphere = new THREE.Sphere(origin.clone(), 0.4); // the shader moves the points; keep them in view
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uColor: { value: new THREE.Color(color) }, uN: { value: new THREE.Vector3() }, uT1: { value: new THREE.Vector3() }, uT2: { value: new THREE.Vector3() }, ...extra },
    vertexShader: vert, fragmentShader: DISC_FRAG,
    transparent: true, depthWrite: false, blending: blending || THREE.NormalBlending,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 2;
  return p;
}
function setFrame(mat, f) { mat.uniforms.uN.value.copy(f.n); mat.uniforms.uT1.value.copy(f.t1); mat.uniforms.uT2.value.copy(f.t2); }

// ---------------------------------------------------------------- ribbons
// A flat strip along a polyline of unit directions with radii, lifted a hair off the ground.
function ribbon(pts, halfW, lift, rng) {
  const n = pts.length / 4;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
  const p = new THREE.Vector3(), q = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.set(pts[i * 4], pts[i * 4 + 1], pts[i * 4 + 2]);
    const j = i < n - 1 ? i + 1 : i - 1;
    q.set(pts[j * 4], pts[j * 4 + 1], pts[j * 4 + 2]);
    tan.subVectors(q, p); if (i === n - 1) tan.negate();
    side.crossVectors(p, tan).normalize().multiplyScalar(halfW * (rng ? 0.5 + rng() * 1.1 : 1)); // ragged edges
    const r = pts[i * 4 + 3] + lift;
    pos[i * 6] = p.x * r - side.x; pos[i * 6 + 1] = p.y * r - side.y; pos[i * 6 + 2] = p.z * r - side.z;
    pos[i * 6 + 3] = p.x * r + side.x; pos[i * 6 + 4] = p.y * r + side.y; pos[i * 6 + 5] = p.z * r + side.z;
    uv[i * 4] = i / (n - 1); uv[i * 4 + 1] = 0; uv[i * 4 + 2] = i / (n - 1); uv[i * 4 + 3] = 1;
    if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const GLOW_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FISSURE_FRAG = `
  uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
  void main() {
    float pulse = 0.7 + 0.3 * sin(uTime * 1.8 + vUv.x * 11.0) * sin(uTime * 0.7 - vUv.x * 5.0);
    float edge = 1.0 - pow(abs(vUv.y * 2.0 - 1.0), 1.6);
    gl_FragColor = vec4(uColor * pulse * 1.4, edge * pulse);
  }`;
const AURORA_FRAG = `
  uniform float uTime; uniform vec3 uA; uniform vec3 uB; varying vec2 vUv;
  void main() {
    float u = vUv.x, v = vUv.y;
    float fold = 0.5 + 0.5 * sin(u * 43.98 + uTime * 0.7) * sin(u * 18.85 - uTime * 0.4 + 1.3);
    float band = 0.5 + 0.5 * sin(u * 6.283 * 2.0 + uTime * 0.15);
    float c = mix(0.25, 1.0, fold) * mix(0.6, 1.0, band);
    float vert = pow(1.0 - v, 1.7) * smoothstep(0.0, 0.1, v);
    vec3 col = mix(uA, uB, pow(v, 1.2));
    gl_FragColor = vec4(col * c * vert * 2.4, c * vert);
  }`;

// ---------------------------------------------------------------- builders
function buildVolcano(act, world, planet, rng) {
  const f = frame(act.dir);
  const vent = f.n.clone().multiplyScalar(act.r);
  const out = [];
  // the glowing vent
  const disc = new THREE.Mesh(new THREE.CircleGeometry(act.rho * 0.11, 12), new THREE.MeshBasicMaterial({ color: act.glow }));
  disc.position.copy(f.n).multiplyScalar(act.r + 0.001);
  disc.quaternion.copy(quatTo(f.n)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
  planet.add(disc);
  const light = new THREE.PointLight(act.glow, 0.003, 0.16, 2); // candela: a small pool of light on the cone
  light.position.copy(f.n).multiplyScalar(act.r + 0.025);
  planet.add(light);
  const smokeColor = world.type === 'ice' ? '#dfeeff' : '#4a4644';
  const smoke = points(90, rng, vent, SMOKE_VERT, smokeColor, { uRise: { value: 0.2 } });
  const embers = points(50, rng, vent, EMBER_VERT, act.glow, {}, THREE.AdditiveBlending);
  setFrame(smoke.material, f); setFrame(embers.material, f);
  planet.add(smoke, embers);
  out.push(smoke.material, embers.material);
  return {
    mats: out,
    update(t) { light.intensity = 0.003 + 0.0015 * Math.sin(t * 5.1) * Math.sin(t * 2.3) + 0.0006 * Math.sin(t * 13.0); disc.material.color.set(act.glow).multiplyScalar(0.8 + 0.2 * Math.sin(t * 3.0)); },
  };
}

function buildGeyser(act, world, planet, rng) {
  const f = frame(act.dir);
  const base = f.n.clone().multiplyScalar(act.r + 0.001);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(act.rho * 0.28, 14), new THREE.MeshBasicMaterial({ color: world.type === 'exotic' ? act.glow : '#9fd8ff', transparent: true, opacity: 0.85 }));
  pool.position.copy(base);
  pool.quaternion.copy(quatTo(f.n)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
  planet.add(pool);
  const cycle = 9 + rng() * 5;
  const color = world.type === 'exotic' ? act.glow : '#eaf6ff';
  const jet = points(260, rng, base, JET_VERT, color, {
    uCycle: { value: cycle }, uActive: { value: 3.2 }, uV0: { value: 0.085 }, uG: { value: 0.042 },
  });
  setFrame(jet.material, f);
  planet.add(jet);
  return { mats: [jet.material], update() {} };
}

function buildFissure(act, world, planet, rng) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(act.glow) } },
    vertexShader: GLOW_VERT, fragmentShader: FISSURE_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  for (const [pts, w] of [[act.points, 0.0034], ...(act.branches || []).map((b) => [b, 0.0022])]) {
    const mesh = new THREE.Mesh(ribbon(pts, w, 0.0025, rng), m);
    mesh.renderOrder = 2;
    planet.add(mesh);
  }
  const light = new THREE.PointLight(act.glow, 0.0015, 0.12, 2);
  light.position.fromArray(act.dir).multiplyScalar(act.r + 0.02);
  planet.add(light);
  return { mats: [m], update(t) { light.intensity = 0.0012 + 0.0006 * Math.sin(t * 1.8); } };
}

function buildAurora(act, world, planet) {
  const colors = world.type === 'exotic' ? [act.glow, world.palette.fauna.accent]
    : world.type === 'gas' ? ['#7cf0ff', '#ff7ce0'] : ['#5cff9a', '#a86bff'];
  const group = new THREE.Group();
  const rings = [[0.27, 1.04, 0.16, 128], [0.36, 1.045, 0.11, 128]];
  const mats = [];
  for (const [rho, alt, height, seg] of rings) {
    const pos = new Float32Array((seg + 1) * 2 * 3), uv = new Float32Array((seg + 1) * 2 * 2), idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = Math.sin(rho) * Math.cos(a), y = Math.cos(rho) * act.pole, z = Math.sin(rho) * Math.sin(a);
      for (let k = 0; k < 2; k++) {
        const r = alt + k * height, o = (i * 2 + k) * 3;
        pos[o] = x * r; pos[o + 1] = y * r; pos[o + 2] = z * r;
        uv[(i * 2 + k) * 2] = i / seg; uv[(i * 2 + k) * 2 + 1] = k;
      }
      if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(colors[0]) }, uB: { value: new THREE.Color(colors[1]) } },
      vertexShader: GLOW_VERT, fragmentShader: AURORA_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 3;
    group.add(mesh);
    mats.push(m);
  }
  planet.add(group);
  return { mats, update(t) { group.rotation.y = -t * 0.02; } };
}

// A zigzag bolt as two crossed strips from `from` down to `to`. reshape() rolls a new zigzag
// on the same path, so each stroke of a flash looks a little different.
function makeBolt(from, to, rng, width) {
  const n = 9;
  const d = new THREE.Vector3().subVectors(to, from), len = d.length();
  const f = frame(d.clone().normalize().toArray());
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(2 * (n + 1) * 2 * 3);
  const idx = [];
  for (let k = 0; k < 2; k++) {
    const base = k * (n + 1) * 2;
    for (let i = 0; i < n; i++) idx.push(base + i * 2, base + i * 2 + 1, base + i * 2 + 2, base + i * 2 + 1, base + i * 2 + 3, base + i * 2 + 2);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#e6f4ff', transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  mesh.visible = false;
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  const p = new THREE.Vector3();
  const reshape = () => {
    // a wandering offset that returns to zero at both ends
    const pts = [];
    let ox = 0, oy = 0;
    for (let i = 0; i <= n; i++) {
      const u = i / n, pinch = 1 - Math.abs(u * 2 - 1);
      ox += (rng() - 0.5) * len * 0.22; oy += (rng() - 0.5) * len * 0.22;
      const k = pinch * 0.9;
      pts.push(p.copy(from).addScaledVector(d, u).addScaledVector(f.t1, ox * k).addScaledVector(f.t2, oy * k).clone());
    }
    let o = 0;
    for (const s of [f.t1, f.t2]) {
      for (let i = 0; i <= n; i++) {
        const q = pts[i], w = width * (i === 0 ? 0.4 : 1) * (0.7 + rng() * 0.6);
        pos[o++] = q.x - s.x * w; pos[o++] = q.y - s.y * w; pos[o++] = q.z - s.z * w;
        pos[o++] = q.x + s.x * w; pos[o++] = q.y + s.y * w; pos[o++] = q.z + s.z * w;
      }
    }
    g.attributes.position.needsUpdate = true;
  };
  reshape();
  return { mesh, reshape };
}

function buildLightning(act, world, planet, cloudGroup, cloudInst, rng, heightAt) {
  const f = frame(act.dir);
  const gas = world.type === 'gas';
  const bolts = [];
  const holder = gas ? planet : cloudGroup; // rocky storms ride with the clouds
  if (!gas && cloudInst && act.puffStart !== undefined) {
    // darken the storm cell
    const white = new THREE.Color(1, 1, 1), grey = new THREE.Color(0.5, 0.52, 0.58);
    for (let i = 0; i < cloudInst.count; i++) cloudInst.setColorAt(i, i >= act.puffStart && i < act.puffStart + act.puffCount ? grey : white);
    cloudInst.instanceColor.needsUpdate = true;
  }
  // every bolt strikes straight down: from high in the atmosphere to the ground, or into the cloud deck of a gas giant
  const spread = gas ? world.storm.size * 0.5 : 0.05;
  for (let i = 0; i < 3; i++) {
    const c = f.n.clone().addScaledVector(f.t1, (rng() - 0.5) * spread).addScaledVector(f.t2, (rng() - 0.5) * spread).normalize();
    const from = c.clone().multiplyScalar(gas ? 1.1 : 1.11);
    const to = c.clone().multiplyScalar(gas ? 0.998 : Math.max(heightAt(c), world.seaRadius || 0) + 0.001); // the sea surface, not the sea floor
    bolts.push(makeBolt(from, to, rng, gas ? 0.0028 : 0.0026));
  }
  for (const b of bolts) holder.add(b.mesh);
  const light = new THREE.PointLight('#d6e9ff', 0, 0.3, 2);
  light.position.copy(f.n).multiplyScalar(gas ? 1.03 : 1.06);
  holder.add(light);
  // a flash is two or three strokes on one bolt, each with a fresh zigzag and a short dark gap between
  let next = 1.5 + rng() * 2, cur = null, strokesLeft = 0, until = 0, lit = false;
  return {
    mats: [],
    update(t) {
      if (cur) {
        if (t < until) { if (lit) { light.intensity = 0.006 * (0.5 + 0.5 * rng()); cur.mesh.material.opacity = 0.6 + 0.4 * rng(); } return; }
        if (lit) { // stroke over: a gap, or the end of the flash
          lit = false; cur.mesh.visible = false; light.intensity = 0;
          if (--strokesLeft > 0) { until = t + 0.05 + rng() * 0.09; return; }
          cur = null; next = t + 1.2 + rng() * 5; return;
        }
        lit = true; cur.reshape(); cur.mesh.visible = true; until = t + 0.05 + rng() * 0.07; // the next stroke
      } else if (t > next) {
        cur = bolts[Math.floor(rng() * bolts.length)];
        strokesLeft = rng() < 0.65 ? 3 : 2;
        lit = true; cur.reshape(); cur.mesh.visible = true; until = t + 0.06 + rng() * 0.08;
      }
    },
  };
}

// ---------------------------------------------------------------- entry
// Returns { update(t, pointScale) } or null. All objects go into the planet or cloud group,
// so the normal world disposal removes them.
export function buildActivity(world, planet, cloudGroup, cloudInst, heightAt) {
  const act = world.activity;
  if (!act) return null;
  const rng = mulberry32(hashSeed(world.seed + '|phenomena'));
  let part = null;
  switch (act.kind) {
    case 'volcano': part = buildVolcano(act, world, planet, rng); break;
    case 'geyser': part = buildGeyser(act, world, planet, rng); break;
    case 'fissure': part = buildFissure(act, world, planet, rng); break;
    case 'aurora': part = buildAurora(act, world, planet); break;
    case 'lightning': part = buildLightning(act, world, planet, cloudGroup, cloudInst, rng, heightAt); break;
  }
  if (!part) return null;
  return {
    update(t, pointScale) {
      for (const m of part.mats) { m.uniforms.uTime.value = t; if (m.uniforms.uScale) m.uniforms.uScale.value = pointScale; }
      part.update(t);
    },
  };
}
