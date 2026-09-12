// myworlds — the phenomenon on the ground: the moving parts of the one natural activity a world
// can have, at the scale of the patch.
//
// The globe draws the same phenomenon in phenomena.js, on a miniature where the planet radius is
// one unit. The ground draws it in the patch frame: x east, y up, z south, the origin at the site.
// The worker already raised the cone or the pool at that origin and painted it. This module adds
// what moves: the smoke and the embers of a volcano, and the jet of a geyser.
//
// The first slice of issue 14 builds those two kinds. The fissure, the aurora, and the storm wait
// for a later slice, so a patch that carries one of them gets no phenomenon here.
//
// Every stream seeds from patch.patchSeed and the clock starts at the landing, so a reload of the
// same URL replays the same plume and the same eruption times.
import * as THREE from 'three';

// The point counts. LOW halves them and drops the light, as the shadow rule already does.
const SMOKE_N = 160;
const EMBER_N = 90;
const JET_N = 260;

// The volcano, in units of the patch. The worker gives the radius of the cone and the crater.
const SMOKE_RISE = 450;      // units the plume climbs over its life
const SMOKE_LIFE = 9;        // seconds one puff lives
const SMOKE_SPREAD = 120;    // units the plume widens by at the top
const SMOKE_DRIFT = 90;      // units the plume leans east by at the top
const EMBER_V0 = 110;        // units per second, the throw of an ember
const EMBER_G = 55;          // units per second squared, what pulls it back
const EMBER_LIFE = 2.8;      // seconds
// The geyser. The jet reaches about EMBER-free height V0^2 / 2G, which is 147 units, so it stands
// well over the mound and inside the fog. The burst cycle is the one the globe uses.
const JET_V0 = 100;
const JET_G = 34;
const JET_BIRTH = 3.2;       // seconds the vent throws water for, at the start of a cycle
const CYCLE_MIN = 9, CYCLE_MAX = 14;   // seconds between two bursts

const LIGHT_RANGE = 420;     // units, how far the vent light reaches
const LIGHT_CD = 4200;       // candela at the vent, in the light scale of ground.js

// The same generator the globe uses. Every file that needs it keeps a copy.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------- the point clouds
// One vertex shader per kind, one soft-disc fragment shader. Up is +y here, so the shaders need no
// tangent frame: the globe carries one because its up is a different direction at every site.
//
// The fog fades the points out. It takes the alpha and not the colour, because the embers and the
// jet draw with additive blending and a fog colour would only make them brighter in the distance.
const DISC_FRAG = `
  uniform vec3 uColor; varying float vA;
  #ifdef USE_FOG
    uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; varying float vFogDepth;
  #endif
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.12, d) * vA;
    #ifdef USE_FOG
      a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }`;
const POINT_HEAD = `
  attribute float aPhase; attribute vec3 aSeed;
  uniform float uTime; uniform float uScale;
  varying float vA;
  #ifdef USE_FOG
    varying float vFogDepth;
  #endif
  void emit(vec3 p, float size, float a) {
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uScale / max(-mv.z, 0.02);
    vA = a;
    #ifdef USE_FOG
      vFogDepth = -mv.z;
    #endif
  }`;
// smoke: rises out of the crater, spreads, leans downwind, fades
const SMOKE_VERT = POINT_HEAD + `
  uniform float uRise; uniform float uSpread; uniform float uDrift; uniform float uSize;
  void main() {
    float life = ${SMOKE_LIFE.toFixed(1)};
    float age = mod(uTime * 0.3 + aPhase * life, life) / life;
    vec3 side = vec3(aSeed.x - 0.5, 0.0, aSeed.y - 0.5);
    vec3 p = position + vec3(0.0, age * uRise, 0.0) + side * age * uSpread
      + vec3(age * age * uDrift, 0.0, 0.0);
    float s = uSize * (0.25 + age) * (0.7 + aSeed.z * 0.6);
    float a = smoothstep(0.0, 0.08, age) * pow(1.0 - age, 1.4) * 0.5;
    emit(p, s, a);
  }`;
// embers: short ballistic sparks over the vent
const EMBER_VERT = POINT_HEAD + `
  uniform float uV0; uniform float uG; uniform float uSpread; uniform float uSize;
  void main() {
    float life = ${EMBER_LIFE.toFixed(1)};
    float age = mod(uTime * 0.9 + aPhase * life, life);
    vec3 side = vec3(aSeed.x - 0.5, 0.0, aSeed.y - 0.5);
    vec3 p = position + vec3(0.0, uV0 * age - 0.5 * uG * age * age, 0.0) + side * age * uSpread;
    float a = (1.0 - age / life) * 0.9;
    emit(p, uSize * (0.6 + aSeed.z * 0.8), a);
  }`;
// the geyser: a jet in bursts. Water rises and falls back, steam drifts up and lasts longer.
const JET_VERT = POINT_HEAD + `
  uniform float uCycle; uniform float uActive; uniform float uV0; uniform float uG;
  uniform float uSpread; uniform float uSize;
  void main() {
    float steam = step(0.5, aSeed.z);
    float life = mix(3.4, 6.0, steam);
    float t = mod(uTime, uCycle);
    float age = t - aPhase * uActive;
    vec3 side = vec3(aSeed.x - 0.5, 0.0, aSeed.y - 0.5);
    float up = mix(uV0 * age - 0.5 * uG * age * age, 20.0 * age, steam);
    vec3 p = position + vec3(0.0, up, 0.0) + side * age * uSpread * mix(1.0, 1.8, steam);
    float on = step(0.0, age) * step(age, life);
    float a = on * (1.0 - age / life) * mix(0.9, 0.18, steam) * smoothstep(0.0, 0.05, age);
    float s = uSize * mix(0.5 + aSeed.y * 0.3, 1.2 + age * 1.1, steam);
    emit(p, s * on, a);
  }`;

// A point cloud of n points that all start at origin, inside a disc of radius spread.
function points(n, rng, origin, spread, vert, color, extra, blending) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), ph = new Float32Array(n), sd = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * spread;
    pos[i * 3] = origin.x + Math.cos(a) * r;
    pos[i * 3 + 1] = origin.y;
    pos[i * 3 + 2] = origin.z + Math.sin(a) * r;
    ph[i] = rng(); sd[i * 3] = rng(); sd[i * 3 + 1] = rng(); sd[i * 3 + 2] = rng();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uScale: { value: 700 }, uColor: { value: new THREE.Color(color) },
      fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 },
      ...extra,
    },
    vertexShader: vert, fragmentShader: DISC_FRAG,
    transparent: true, depthWrite: false, fog: true,
    blending: blending || THREE.NormalBlending,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;    // the shader moves the points, so the bounds of the buffer are wrong
  p.renderOrder = 2;
  return p;
}

// A flat disc on the ground: the glow of the vent, and the water of the pool.
function disc(radius, y, color, opacity) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 24),
    new THREE.MeshBasicMaterial({
      color, fog: true,
      transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = 1;
  return mesh;
}

export class Phenomena {
  // Returns the phenomenon of this patch, or null when the patch carries none. The worker puts
  // patch.activity on a patch whose cell holds the phenomenon of the world; every other patch,
  // and every world with no phenomenon, gives null and costs nothing.
  static create(opts) {
    const act = opts && opts.patch && opts.patch.activity;
    if (!act || (act.kind !== 'volcano' && act.kind !== 'geyser')) return null;
    return new Phenomena(opts);
  }

  constructor({ world, patch, tier, sky, heightAt, renderer }) {
    const act = patch.activity;
    this.kind = act.kind;
    this.renderer = renderer || null;
    this.full = tier ? tier.shadows !== false : true;   // HIGH keeps the full counts and the light
    this.night = sky ? sky.night : 0;
    this.group = new THREE.Group();
    this.mats = [];
    this.light = null;
    this.t0 = -1;
    this._size = new THREE.Vector2();

    const rng = mulberry32(hashSeed(`${patch.patchSeed}|phenomena`));
    const glow = (world.activity && world.activity.glow) || '#ff6a1e';
    const half = this.full ? 1 : 0.5;
    // the ground the worker left at the origin: the crater floor, or the floor of the pool
    const base = new THREE.Vector3(0, heightAt(0, 0), 0);

    if (this.kind === 'volcano') this._volcano(act, world, rng, glow, half, base);
    else this._geyser(act, world, rng, glow, half, base);
  }

  // The volcano: a glowing vent on the crater floor, a smoke plume, and a shower of embers.
  _volcano(act, world, rng, glow, half, base) {
    const ventR = act.crater * 0.4;
    this.vent = disc(ventR, base.y + 0.4, glow, 1);
    this.glow = new THREE.Color(glow);
    this.group.add(this.vent);
    const smokeColor = world.type === 'ice' ? '#dfeeff' : '#4a4644';
    const smoke = points(Math.round(SMOKE_N * half), rng, base, ventR, SMOKE_VERT, smokeColor, {
      uRise: { value: SMOKE_RISE }, uSpread: { value: SMOKE_SPREAD },
      uDrift: { value: SMOKE_DRIFT }, uSize: { value: 55 },
    });
    const embers = points(Math.round(EMBER_N * half), rng, base, ventR * 0.7, EMBER_VERT, glow, {
      uV0: { value: EMBER_V0 }, uG: { value: EMBER_G },
      uSpread: { value: 95 }, uSize: { value: 4.5 },
    }, THREE.AdditiveBlending);
    this.group.add(smoke, embers);
    this.mats.push(smoke.material, embers.material);
    if (this.full) {
      // One light, at the vent. It is the only light the ground adds after the sun, so LOW drops
      // it and keeps the frame time it costs.
      this.light = new THREE.PointLight(glow, LIGHT_CD, LIGHT_RANGE, 2);
      this.light.position.set(0, base.y + 12, 0);
      this.group.add(this.light);
    }
  }

  // The geyser: a pool in the mound, and a jet that bursts every 9 to 14 seconds.
  _geyser(act, world, rng, glow, half, base) {
    const poolColor = world.type === 'exotic' ? glow : '#9fd8ff';
    this.group.add(disc(act.pool, base.y + 0.8, poolColor, 0.85));
    this.cycle = CYCLE_MIN + rng() * (CYCLE_MAX - CYCLE_MIN);
    const jet = points(Math.round(JET_N * half), rng, base, act.pool * 0.5, JET_VERT,
      world.type === 'exotic' ? glow : '#eaf6ff', {
        uCycle: { value: this.cycle }, uActive: { value: JET_BIRTH },
        uV0: { value: JET_V0 }, uG: { value: JET_G },
        uSpread: { value: 8 }, uSize: { value: 4 },
      });
    jet.position.y = 0.8;
    this.group.add(jet);
    this.mats.push(jet.material);
  }

  // The clock starts at the first frame of the landing, so the same URL replays the same eruption.
  // The point scale turns a size in units into pixels, as the globe does: the height of the frame
  // buffer over the field of view.
  update(t, dt, camera) {
    if (this.t0 < 0) this.t0 = t;
    const age = t - this.t0;
    let scale = 700;
    if (this.renderer && camera) {
      this.renderer.getDrawingBufferSize(this._size);
      scale = this._size.y * 0.5 / Math.tan(camera.fov * Math.PI / 360);
    }
    for (const m of this.mats) {
      m.uniforms.uTime.value = age;
      m.uniforms.uScale.value = scale;
    }
    if (this.light) {
      // the vent breathes: two slow beats and one fast one, as the globe light does
      const k = 1 + 0.5 * Math.sin(age * 5.1) * Math.sin(age * 2.3) + 0.2 * Math.sin(age * 13.0);
      this.light.intensity = LIGHT_CD * k;
    }
    if (this.vent) this.vent.material.color.copy(this.glow).multiplyScalar(0.8 + 0.2 * Math.sin(age * 3.0));
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group.clear();
    this.mats.length = 0;
    this.light = null;
    this.vent = null;
  }
}
