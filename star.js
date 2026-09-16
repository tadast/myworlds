// The star of a world, and its companion when the system is a binary.
//
// rollStar() draws the system from the seed on a hash of its own, so the draw order of the worker
// stays as it is and no world changes. The odds follow the census of the stars near the Sun: seven
// stars in ten are red dwarfs, one in fourteen is a yellow dwarf like the Sun, and a giant, a blue
// star, or a pulsar is rare. The chance of a companion rises with the mass of the primary, from
// about one in four for a red dwarf to nine in ten for an O star.
//
// StarSystem draws the system on the globe. It stands far out along the sun direction of the
// scene, so the light of the planet and the star the reader sees agree. Each star is one billboard
// with a disc, a corona, and rays. A pulsar adds two beams that sweep round its spin axis, and the
// core flares when a beam points at the camera. A binary pair runs a Kepler orbit round the centre
// of mass, and a star that passes behind its partner goes dark.
//
// `?star=pulsar` (or O B A F G K M giant dwarf brown) forces the primary kind, and `&binary=1` or
// `&binary=0` forces the companion, so a reader can see a rare system without a thousand names.
import * as THREE from 'three';

// The census. weight: the share of systems in parts per thousand. mass: in solar masses, for the
// companion roll and the binary odds. temp: the range of the surface temperature in kelvin, from
// subclass 0 to subclass 9. core: the radius of the disc in scene units at DIST. glow: how far the
// corona reaches, in radii of the disc. bin: the chance of a companion.
const KINDS = {
  O: { weight: 0.001, mass: 30, temp: [50000, 31000], core: 1.0, glow: 12, bin: 0.9, word: 'blue star', lum: 'V' },
  B: { weight: 1.2, mass: 6, temp: [30000, 10500], core: 0.9, glow: 11, bin: 0.8, word: 'blue-white star', lum: 'V' },
  A: { weight: 6, mass: 2, temp: [10000, 7600], core: 0.78, glow: 10, bin: 0.65, word: 'white star', lum: 'V' },
  F: { weight: 30, mass: 1.3, temp: [7500, 6050], core: 0.72, glow: 9, bin: 0.5, word: 'yellow-white star', lum: 'V' },
  G: { weight: 76, mass: 1, temp: [6000, 5300], core: 0.66, glow: 8.5, bin: 0.46, word: 'yellow dwarf', lum: 'V' },
  K: { weight: 121, mass: 0.7, temp: [5250, 3900], core: 0.6, glow: 8, bin: 0.4, word: 'orange dwarf', lum: 'V' },
  M: { weight: 700, mass: 0.3, temp: [3850, 2400], core: 0.5, glow: 7, bin: 0.27, word: 'red dwarf', lum: 'V' },
  brown: { weight: 0, mass: 0.05, temp: [2200, 700], core: 0.42, glow: 5, bin: 0.2, word: 'brown dwarf' },
  dwarf: { weight: 60, mass: 0.6, temp: [30000, 6000], core: 0.16, glow: 16, bin: 0.25, word: 'white dwarf' },
  giant: { weight: 5, mass: 1.2, temp: [4800, 3200], core: 3.2, glow: 3.2, bin: 0.35, word: 'red giant', lum: 'III' },
  pulsar: { weight: 1.5, mass: 1.4, temp: [1e6, 1e6], core: 0.12, glow: 24, bin: 0.3, word: 'pulsar' },
};
// A brown dwarf is not a star, so the census of the primary leaves it out (weight 0). It turns up as a
// companion too light to burn hydrogen.

const DIST = 80;   // inside the star field at 90, inside the far plane at 200

function hashStr(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}
function rngFrom(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const range = (rng, a, b) => a + rng() * (b - a);

// The colour of a black body, in sRGB from 0 to 1 (the fit of Tanner Helland, good from 1,000 K
// to 40,000 K). A brown dwarf reads magenta, because its sodium and potassium eat the yellow.
export function kelvinColor(T, kind) {
  const t = Math.min(Math.max(T, 1000), 40000) / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = new THREE.Color().setRGB(
    Math.min(Math.max(r, 0), 255) / 255, Math.min(Math.max(g, 0), 255) / 255, Math.min(Math.max(b, 0), 255) / 255,
    THREE.SRGBColorSpace);
  if (kind === 'brown') c.lerp(new THREE.Color().setRGB(0.75, 0.2, 0.45, THREE.SRGBColorSpace), 0.45);
  if (kind === 'pulsar') c.setRGB(0.75, 0.85, 1, THREE.SRGBColorSpace);
  return c;   // linear, as three.js keeps it
}

function kindFromMass(m) {
  if (m > 16) return 'O';
  if (m > 2.1) return 'B';
  if (m > 1.4) return 'A';
  if (m > 1.04) return 'F';
  if (m > 0.8) return 'G';
  if (m > 0.45) return 'K';
  if (m > 0.08) return 'M';
  return 'brown';
}

function makeStar(rng, kind) {
  const K = KINDS[kind];
  const sub = Math.floor(rng() * 10);
  const temp = Math.round(K.temp[0] + (K.temp[1] - K.temp[0]) * (sub + rng()) / 10);
  const star = { kind, sub, temp, core: K.core * range(rng, 0.9, 1.1), glow: K.glow, seed: rng() * 100 };
  if (kind === 'pulsar') {
    // real pulsars spin from 1.4 ms to 24 s. Two flashes per turn, so a turn under 1 s would flash
    // more than twice a second, which is not safe for a reader with photosensitive epilepsy.
    star.period = range(rng, 1.1, 3.6);
    star.tilt = range(rng, 0.35, 1.05);   // the angle between the magnetic axis and the spin axis
    const z = range(rng, -1, 1), a = rng() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    star.spinAxis = [s * Math.cos(a), z, s * Math.sin(a)];
  }
  star.label = starLabel(star);
  return star;
}

function starLabel(s) {
  const K = KINDS[s.kind];
  if (s.kind === 'pulsar') return `Pulsar, ${s.period.toFixed(2)} s`;
  if (s.kind === 'dwarf') return `DA${Math.min(9, Math.max(1, Math.round(50400 / s.temp)))} ${K.word}, ${s.temp.toLocaleString()} K`;
  if (s.kind === 'brown') return `${s.temp < 1300 ? 'T' : 'L'}${s.sub} ${K.word}, ${s.temp.toLocaleString()} K`;
  const cls = s.kind === 'giant' ? (s.temp < 3700 ? 'M' : 'K') : s.kind;
  return `${cls}${s.sub} ${K.lum} ${K.word}, ${s.temp.toLocaleString()} K`;
}

function forced() {
  try {
    const q = new URLSearchParams(location.search);
    return { star: q.get('star'), binary: q.get('binary') };
  } catch { return {}; }
}

export function rollStar(seed) {
  const rng = rngFrom(hashStr(`${seed}|star`));
  const force = forced();
  let kind = null;
  const total = Object.values(KINDS).reduce((a, k) => a + k.weight, 0);
  let r = rng() * total;
  for (const [k, K] of Object.entries(KINDS)) { if ((r -= K.weight) < 0) { kind = k; break; } }
  if (force.star && KINDS[force.star]) kind = force.star;
  const primary = makeStar(rng, kind);
  let binary = rng() < KINDS[kind].bin;
  if (force.binary === '1') binary = true;
  if (force.binary === '0') binary = false;
  const sys = { primary, companion: null };
  if (binary) {
    // The mass ratio of a binary is close to flat from 0.1 to 1. One companion in ten is a white
    // dwarf, the core of a star that burned out first.
    let ck;
    if (rng() < 0.1 && kind !== 'O') ck = 'dwarf';
    else ck = kindFromMass(KINDS[kind].mass * range(rng, 0.1, 1));
    const companion = makeStar(rng, ck);
    const mp = KINDS[kind].mass, mc = KINDS[ck].mass;
    sys.companion = companion;
    sys.orbit = {
      // a giant needs room, or its partner would orbit inside it
      a: range(rng, 4, 8) + primary.core + companion.core,
      e: range(rng, 0, 0.45),
      period: range(rng, 90, 240),     // s: slow enough to watch, quick enough to see it move
      phase: rng() * Math.PI * 2,
      q: mc / (mp + mc),               // the share of the separation the primary covers
      incl: range(rng, 0.15, 1.4),     // radians from face-on; near 1.57 the pair eclipses
      node: rng() * Math.PI * 2,
      peri: rng() * Math.PI * 2,
    };
  }
  sys.label = sys.companion ? `Binary: ${primary.label} + ${sys.companion.label}` : primary.label;
  return sys;
}

// ---------------------------------------------------------------- the drawing

const starVert = `varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const starFrag = `varying vec2 vUv;
  uniform vec3 uColor; uniform float uCore; uniform float uTime; uniform float uSeed;
  uniform float uKind; uniform float uFlash; uniform float uDim; uniform float uRay; uniform float uHot;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p), a = atan(p.y, p.x);
    float rc = r / uCore;
    float edge = 1.0 - smoothstep(0.3, 1.0, r);          // the light fades to zero before the plane ends
    edge *= edge;
    vec3 sat = pow(uColor, vec3(2.6));
    vec3 tint = sat / max(max(sat.r, sat.g), sat.b);   // the corona is more saturated than the disc
    // the disc: white hot at the centre, the star colour at the limb, darker at the limb
    float disc = 1.0 - smoothstep(0.97, 1.0, rc);
    float mu = sqrt(max(0.0, 1.0 - rc * rc));
    float surf = 0.45 + 0.55 * pow(mu, 0.6);
    if (uKind > 0.5 && uKind < 1.5) {                    // a giant: slow convection cells
      vec2 q = p / uCore * 2.2;
      float cells = noise(q * 2.0 + vec2(uSeed, uTime * 0.03)) * 0.6 + noise(q * 5.0 - vec2(uTime * 0.05, uSeed)) * 0.4;
      surf *= 0.65 + 0.6 * cells;
    } else {
      surf *= 0.9 + 0.1 * noise(p / uCore * 8.0 + uTime * 0.2);
    }
    vec3 base = mix(tint, uColor, uHot);
    vec3 col = mix(base, vec3(1.0), uHot * pow(mu, 1.5)) * surf * disc * mix(1.2, 1.6, uHot);
    // the corona: an inverse-square fall off the limb, with a soft ruffle
    float rr = max(rc, 1.0);
    float ruff = 0.8 + 0.4 * noise(vec2(a * 6.0 + uSeed, uTime * 0.1 + rr));
    float glow = pow(1.0 / rr, 1.7) * ruff * (1.0 - disc) * 0.9;
    float halo = exp(-rc * 0.9) * 0.25;
    // the rays: a slow shimmer of fine streaks, and six long spikes of the lens
    float streak = pow(noise(vec2(a * 14.0 + uSeed, uTime * 0.12)), 4.0) * pow(1.0 / rr, 0.9) * 0.9 * (1.0 - disc);
    float spike = pow(abs(cos(a * 3.0 + uSeed)), 180.0) * pow(1.0 / rr, 0.55) * 1.2 * uRay * (1.0 - 0.8 * disc);
    float flash = uFlash * (pow(1.0 / rr, 1.2) * 1.5 + pow(abs(cos(a * 2.0)), 300.0) * pow(1.0 / rr, 0.4));
    vec3 light = tint * (glow + halo + streak) + mix(tint, vec3(1.0), 0.5) * (spike + flash);
    gl_FragColor = vec4((col + light) * edge * uDim, 1.0);
  }`;

const beamVert = `varying float vAlong; varying float vFacing;
  void main(){
    vAlong = uv.y;
    vec3 n = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }`;
const beamFrag = `varying float vAlong; varying float vFacing;
  uniform vec3 uColor; uniform float uDim;
  void main(){
    float i = pow(vAlong, 2.2) * pow(vFacing, 1.4) * 0.55;
    gl_FragColor = vec4(uColor * i * uDim, 1.0);
  }`;

function srgbArray(c) {
  const s = c.clone().convertLinearToSRGB();
  return new THREE.Vector3(s.r, s.g, s.b);
}

export class StarSystem {
  // scene: the globe scene. sunDir: the direction of the system from the planet, in scene space.
  constructor(scene, sunDir) {
    this.scene = scene;
    this.dir = sunDir.clone().normalize();
    this.group = new THREE.Group();
    this.group.position.copy(this.dir).multiplyScalar(DIST);
    scene.add(this.group);
    this.stars = [];
    this.sys = null;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
  }

  set(sys) {
    this.clear();
    this.sys = sys;
    // The orbit plane: a frame of two axes, turned by the node and the inclination about the line
    // of sight from the planet, so an inclination near 90 degrees puts the pair edge-on.
    const view = this.dir;
    const up = Math.abs(view.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const ex = new THREE.Vector3().crossVectors(up, view).normalize();
    const ey = new THREE.Vector3().crossVectors(view, ex).normalize();
    if (sys.orbit) {
      const o = sys.orbit;
      const node = new THREE.Quaternion().setFromAxisAngle(view, o.node);
      const u = ex.clone().applyQuaternion(node);
      const w0 = ey.clone().applyQuaternion(node);
      // tilt the plane about u: the second axis leans from the sky plane toward the line of sight
      const w = w0.multiplyScalar(Math.cos(o.incl)).addScaledVector(view, Math.sin(o.incl));
      this.orbitAxes = [u, w];
    }
    for (const s of [sys.primary, sys.companion]) if (s) this.stars.push(this._build(s));
  }

  _build(s) {
    const color = kelvinColor(s.temp, s.kind);
    const half = s.core * s.glow;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: srgbArray(color) }, uCore: { value: s.core / half }, uTime: { value: 0 },
        uSeed: { value: s.seed }, uKind: { value: s.kind === 'giant' ? 1 : s.kind === 'pulsar' ? 2 : 0 },
        uFlash: { value: 0 }, uDim: { value: 1 }, uRay: { value: s.kind === 'giant' ? 0.3 : 1 },
        // how far the centre of the disc burns to white: a cool giant keeps its colour
        uHot: { value: { giant: 0.12, M: 0.35, brown: 0.2 }[s.kind] ?? 0.6 },
      },
      vertexShader: starVert, fragmentShader: starFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), mat);
    mesh.renderOrder = -1;
    const pivot = new THREE.Group();
    pivot.add(mesh);
    this.group.add(pivot);
    const out = { star: s, pivot, mesh, mat, color };
    if (s.kind === 'pulsar') {
      const len = 26, geo = new THREE.ConeGeometry(1.1, len, 24, 1, true);
      geo.translate(0, -len / 2, 0);   // apex at the star, the mouth out along -y
      const bm = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: srgbArray(color) }, uDim: { value: 1 } },
        vertexShader: beamVert, fragmentShader: beamFrag,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const spin = new THREE.Group();
      const mag = new THREE.Group();
      const b1 = new THREE.Mesh(geo, bm), b2 = new THREE.Mesh(geo, bm);
      b2.rotation.z = Math.PI;
      mag.add(b1, b2);
      mag.rotation.z = s.tilt;
      spin.add(mag);
      // turn the spin frame so its y axis is the spin axis of the star
      spin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...s.spinAxis));
      pivot.add(spin);
      Object.assign(out, { spin, mag, beamMat: bm, beamGeo: geo, spinBase: spin.quaternion.clone() });
    }
    return out;
  }

  // The share of the white light a star gives the planet, for the light colour of the scene.
  lightColor() {
    if (!this.sys) return new THREE.Color('#fff4e0');
    const weight = (s) => ({ O: 3, B: 2.5, A: 2, F: 1.5, G: 1.2, K: 1, M: 0.8, brown: 0.3, dwarf: 0.6, giant: 2.5, pulsar: 0.3 }[s.kind]);
    const c = new THREE.Color(0, 0, 0);
    let total = 0;
    for (const e of this.stars) {
      const k = weight(e.star);
      c.add(e.color.clone().multiplyScalar(k));
      total += k;
    }
    c.multiplyScalar(1 / total);
    // the eye adapts to its star, so the planet keeps most of its own colours
    const m = Math.max(c.r, c.g, c.b) || 1;
    return new THREE.Color(1, 0.97, 0.92).lerp(c.multiplyScalar(1 / m), 0.45);
  }

  // How bright the light of the system is, from 0.55 for a lone pulsar to 1.15 for a blue star.
  // The brighter star of a pair sets it.
  lightScale() {
    const scale = { O: 1.15, B: 1.12, A: 1.08, F: 1.04, G: 1, K: 0.96, M: 0.9, brown: 0.6, dwarf: 0.8, giant: 1.05, pulsar: 0.55 };
    return this.stars.length ? Math.max(...this.stars.map((e) => scale[e.star.kind])) : 1;
  }

  update(t, camera) {
    if (!this.sys) return;
    // the pair on its orbit: solve Kepler for the eccentric anomaly, then place both about the
    // centre of mass
    if (this.sys.orbit) {
      const o = this.sys.orbit;
      const M = o.phase + (t / o.period) * Math.PI * 2;
      let E = M;
      for (let i = 0; i < 5; i++) E -= (E - o.e * Math.sin(E) - M) / (1 - o.e * Math.cos(E));
      const x = o.a * (Math.cos(E) - o.e), y = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
      const c = Math.cos(o.peri), s = Math.sin(o.peri);
      const [u, w] = this.orbitAxes;
      const rel = this._v.set(0, 0, 0).addScaledVector(u, x * c - y * s).addScaledVector(w, x * s + y * c);
      this.stars[0].pivot.position.copy(rel).multiplyScalar(-o.q);
      this.stars[1].pivot.position.copy(rel).multiplyScalar(1 - o.q);
      // an eclipse, as the planet sees it: the star further out loses what the nearer one covers
      const [a, b] = this.stars;
      const da = a.pivot.position.dot(this.dir), db = b.pivot.position.dot(this.dir);
      const [back, front] = da > db ? [a, b] : [b, a];
      const sep = this._w.copy(back.pivot.position).sub(front.pivot.position);
      sep.addScaledVector(this.dir, -sep.dot(this.dir));
      const rb = back.star.core, rf = front.star.core;
      const cover = THREE.MathUtils.clamp((rb + rf - sep.length()) / (2 * Math.min(rb, rf)), 0, 1);
      back.mat.uniforms.uDim.value = 1 - cover * Math.min(1, (rf * rf) / (rb * rb)) * 0.85;
      front.mat.uniforms.uDim.value = 1;
    }
    for (const e of this.stars) {
      e.mesh.quaternion.copy(camera.quaternion);   // the billboard faces the camera
      e.mat.uniforms.uTime.value = t;
      if (e.spin) {
        const ang = (t / e.star.period) * Math.PI * 2;
        e.spin.quaternion.copy(e.spinBase).multiply(this._q.setFromAxisAngle(this._w.set(0, 1, 0), ang));
        // the flare: how close a beam points at the camera
        e.spin.updateWorldMatrix(true, true);
        const beam = this._w.set(0, 1, 0).transformDirection(e.mag.matrixWorld);
        const to = this._v.copy(camera.position).sub(e.pivot.getWorldPosition(this._p)).normalize();
        const d = Math.abs(beam.dot(to));
        e.mat.uniforms.uFlash.value = Math.pow(d, 30) * 1.4 + 0.05;
        e.beamMat.uniforms.uDim.value = e.mat.uniforms.uDim.value;
      }
    }
  }

  clear() {
    for (const e of this.stars) {
      e.mesh.geometry.dispose(); e.mat.dispose();
      if (e.beamGeo) { e.beamGeo.dispose(); e.beamMat.dispose(); }
      this.group.remove(e.pivot);
    }
    this.stars = [];
    this.sys = null;
  }
}
