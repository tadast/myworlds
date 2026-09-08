// myworlds — the sky over the ground: the sun, the dome, the moons, the ring, and the clouds.
//
// From orbit the globe says which world you are on. From the ground the sky must say it. The sky
// carries the same sun, the same moons, the same ring, and the same clouds as the globe, so the
// probe lands under a sky that belongs to the world it came from.
//
// Every part of the sky lives in the ground frame: x east, y up, z south. The app owns the turn
// from globe space into that frame, because only the app knows planet.rotation.y. It calls
// skyView() once at the start of a landing and gives the result to Ground.load().
//
// The sky ignores the fog. The fog colour is the horizon colour of the dome, so the far terrain and
// the dome end at the same colour and no seam shows.
import * as THREE from 'three';

const DEG = Math.PI / 180;

export const SUN_FLOOR = 8 * DEG;     // a sun below the horizon rises to here, so the ground stays lit
export const SUN_GLOW = 20 * DEG;     // the warm tint reaches this far from the sun
export const SUN_DISC = 1.2 * DEG;    // the disc is larger than the true sun, so it reads
export const NIGHT_ANGLE = 12 * DEG;  // the sun this far below the horizon gives full night
export const MOON_DIST = 4000;        // metres, the draw distance of a moon on the dome
export const MOON_GAIN = 3;           // the true angular size is too small to read, so it grows 3x
export const RING_REACH = 4250;       // metres, the far edge of the ring band
export const CLOUD_LOW = 900;         // metres, the floor of the cloud deck
export const CLOUD_HIGH = 1100;       // metres, the roof of the cloud deck
export const CLOUD_SPAN = 1800;       // metres, the half width of the field the clouds drift in

const NIGHT_COLOR = new THREE.Color('#070a16');   // the colour of the orbit sky, the darker end
const SUN_TINT = new THREE.Color('#fff2cf');
const SUN_LIGHT = new THREE.Color('#fff4e0');
const MOON_LIGHT = new THREE.Color('#b9c8e8');

// The same generator the globe uses for a moon. Every file that needs it keeps a copy.
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

// ---------------------------------------------------------------- the frame of the site

// The turn from globe space into the ground frame at a site.
//
// East is the direction the planet turns to. A positive planet.rotation.y takes +x toward -z, and
// lon counts from +x toward +z, so east is the direction of falling lon. South is east cross up.
// The three axes then make a right-handed frame, and the sky is not mirrored.
export function groundBasis(planet, site) {
  const lat = site.lat * DEG, lon = site.lon * DEG;
  const cl = Math.cos(lat), sl = Math.sin(lat), co = Math.cos(lon), so = Math.sin(lon);
  const up = new THREE.Vector3(cl * co, sl, cl * so);
  const east = new THREE.Vector3(so, 0, -co);
  const south = new THREE.Vector3().crossVectors(east, up).normalize();
  const b = new THREE.Matrix4().set(
    east.x, east.y, east.z, 0,
    up.x, up.y, up.z, 0,
    south.x, south.y, south.z, 0,
    0, 0, 0, 1,
  );
  if (!planet) return b;
  planet.updateWorldMatrix(true, false);
  const inv = new THREE.Matrix4().extractRotation(planet.matrixWorld).invert();
  return b.multiply(inv);   // globe space, then the planet frame, then the ground frame
}

// The sky of the globe, read in the frame of the site. The app calls this once per landing.
// current is the built world of app.js. sunDir is the globe sun in globe space.
export function skyView(current, site, sunDir) {
  const basis = groundBasis(current.planet, site);
  const view = {
    basis,
    sunDir: sunDir.clone().applyMatrix4(basis).normalize(),
    moons: [],
    ring: null,
  };
  for (const m of current.moons || []) {
    m.pivot.updateWorldMatrix(true, false);
    // the orbit plane of the moon, turned into the ground frame; the moon runs a circle in it
    const orbit = new THREE.Matrix4().extractRotation(m.pivot.matrixWorld).premultiply(basis);
    view.moons.push({ orbit, angle: m.angle, speed: m.speed, dist: m.dist, size: m.size, color: m.color, seed: m.seed });
  }
  const rm = current.ringMesh;
  if (rm && current.world.rings) {
    rm.updateWorldMatrix(true, false);
    view.ring = new THREE.Matrix4().extractRotation(rm.matrixWorld).premultiply(basis);
  }
  return view;
}

// ---------------------------------------------------------------- the sky

export class Sky {
  // view: the result of skyView(), or nothing for the plain sky of a test.
  constructor({ world, site, tier, view, sunDir, skyRadius, renderer }) {
    this.world = world;
    this.tier = tier || { shadows: true };
    this.radius = skyRadius;
    this.group = new THREE.Group();
    // The dome, the ring, and the moons stand at the distance of the sky, so the camera must not
    // walk up to them: the far group follows the camera and holds them at one distance. The clouds
    // stay behind, because they hang at a true height and the camera does climb toward them.
    this.far = new THREE.Group();
    this.group.add(this.far);
    // Everything under the eye line belongs to the ground, not to the sky. One clipping plane at
    // the height of the camera cuts the ring and the moons there, so a moon sets at the horizon.
    this.clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (renderer) renderer.localClippingEnabled = true;   // only materials with planes feel this
    this.moons = [];
    this.clouds = [];
    this.cloudMesh = null;
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();

    const pal = world.palette || {};
    this.sunDir = (view?.sunDir || sunDir || new THREE.Vector3(1, 0.55, 0.8)).clone().normalize();

    // A sun under the horizon leaves the ground black. Keep it 8 degrees up and darken the sky
    // instead, so the hills still read and the world still says the hour.
    const elev = Math.asin(THREE.MathUtils.clamp(this.sunDir.y, -1, 1));
    this.night = THREE.MathUtils.clamp(-elev / NIGHT_ANGLE, 0, 1);
    if (elev < SUN_FLOOR) {
      const flat = Math.hypot(this.sunDir.x, this.sunDir.z) || 1;
      const k = Math.cos(SUN_FLOOR) / flat;
      this.sunDir.set(this.sunDir.x * k, Math.sin(SUN_FLOOR), this.sunDir.z * k).normalize();
    }

    // the colours: the horizon takes the atmosphere colour, the zenith is 30% darker
    const atmo = new THREE.Color(pal.atmo || '#8fb7ff');
    this.horizon = atmo.clone().lerp(NIGHT_COLOR, this.night * 0.88);
    this.zenith = this.horizon.clone().multiplyScalar(0.7);
    this.sunColor = SUN_LIGHT.clone().lerp(MOON_LIGHT, this.night);
    this.sunIntensity = 2.6 - 2.0 * this.night;
    this.discColor = SUN_TINT.clone().lerp(MOON_LIGHT, this.night).multiplyScalar(1 - 0.5 * this.night);

    this._addDome();
    if (view) {
      for (const m of view.moons) this._addMoon(m);
      if (view.ring) this._addRing(view.ring);
    }
    if (world.hasClouds) this._addClouds(site);
  }

  // The dome: a vertical gradient from the horizon colour to the zenith colour, a warm tint within
  // 20 degrees of the sun, and a disc at the sun. The half under the eye line stays at the plain
  // horizon colour, so it reads as the haze the far terrain fades into.
  //
  // The gradient goes into a MeshBasicMaterial and not into a plain ShaderMaterial, because the
  // renderer must still apply the output colour space to it.
  //
  // The material takes no tone mapping, because it must match the fog. The renderer applies the fog
  // after the tone mapping and after the colour space, so far terrain ends at the plain fog colour.
  // A tone-mapped dome lands on another colour and the horizon then shows a hard step.
  _domeMaterial() {
    const mat = new THREE.MeshBasicMaterial({
      color: this.horizon, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    });
    const glow = 2 - 2 * Math.cos(SUN_GLOW), disc = 2 - 2 * Math.cos(SUN_DISC);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uZenith = { value: this.zenith };
      sh.uniforms.uSunColor = { value: this.discColor.clone().lerp(this.horizon, 0.35) };
      sh.uniforms.uDiscColor = { value: this.discColor };
      sh.uniforms.uSunDir = { value: this.sunDir };
      sh.uniforms.uGlowGain = { value: 0.55 * (1 - 0.7 * this.night) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSky;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSky = normalize(position);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vSky; uniform vec3 uZenith; uniform vec3 uSunColor; uniform vec3 uDiscColor;
          uniform vec3 uSunDir; uniform float uGlowGain;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 sky = normalize(vSky);
          diffuseColor.rgb = mix(diffuseColor.rgb, uZenith, pow(clamp(sky.y, 0.0, 1.0), 0.75));
          float a2 = 2.0 - 2.0 * dot(sky, uSunDir);
          // the tint fades out at the horizon, so the dome ends at the plain fog colour and the
          // horizon holds no step, even with the sun low over it
          float low = smoothstep(0.0, 0.2, sky.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSunColor, smoothstep(${glow.toFixed(6)}, 0.0, a2) * uGlowGain * low);
          diffuseColor.rgb = mix(diffuseColor.rgb, uDiscColor, smoothstep(${disc.toFixed(6)}, ${(disc * 0.35).toFixed(6)}, a2));`);
      mat.userData.shader = sh;
    };
    return mat;
  }

  _addDome() {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 48, 24), this._domeMaterial());
    dome.renderOrder = -1;
    this.far.add(dome);
  }

  // A moon on the dome, at the true angular size times three. The moon keeps its orbit speed, so it
  // moves across the sky and sets at the eye line.
  _addMoon(md) {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const rng = mulberry32(md.seed);
    const pa = geo.attributes.position;
    const seen = new Map();
    for (let i = 0; i < pa.count; i++) {
      const key = `${pa.getX(i).toFixed(4)},${pa.getY(i).toFixed(4)},${pa.getZ(i).toFixed(4)}`;
      let f = seen.get(key);
      if (f === undefined) { f = 0.9 + rng() * 0.2; seen.set(key, f); }
      pa.setXYZ(i, pa.getX(i) * f, pa.getY(i) * f, pa.getZ(i) * f);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: md.color, flatShading: true, roughness: 1, metalness: 0, fog: false,
      clippingPlanes: [this.clip],
    }));
    // the angular radius from the site, then the radius it needs at the draw distance
    mesh.scale.setScalar(Math.tan(Math.atan2(md.size, md.dist) * MOON_GAIN) * MOON_DIST);
    const moon = { ...md, mesh };
    this.moons.push(moon);
    this.far.add(mesh);
    this._placeMoon(moon);
  }

  _placeMoon(moon) {
    // the moon runs a circle in its orbit plane; the site sits one planet radius up from the centre
    this._v.set(Math.cos(moon.angle) * moon.dist, 0, Math.sin(moon.angle) * moon.dist)
      .applyMatrix4(moon.orbit);
    this._v.y -= 1;
    moon.mesh.position.copy(this._v.normalize()).multiplyScalar(MOON_DIST);
  }

  // The ring as a band across the sky. The ring of the globe is an annulus around the planet and
  // the site sits inside its hole, so the same annulus, moved to the site and grown, gives the band.
  // A site in the ring plane sees the band as a line through the zenith. A site away from that plane
  // sees it open into a wide arc. The plane is not the planet equator: the ring of the globe keeps
  // its normal near world +y, while the planet axis carries world.tilt. The band reads the world
  // matrix of the globe ring, so the ground always shows what orbit shows.
  //
  // The band takes the band colours and the band alpha of the globe ring, but not its lit material:
  // the sun can sit in the ring plane, and a lit ring then goes black. The sun angle sets one flat
  // brightness instead, so the ring always reads.
  _addRing(matrix) {
    const r = this.world.rings;
    const theta = 96;
    const geo = new THREE.RingGeometry(r.inner, r.outer, theta, r.bands).toNonIndexed();
    const cnt = geo.attributes.position.count;
    const col = new Float32Array(cnt * 4);
    // the ring plane lies in the xy plane of the geometry, so its normal is +z
    const lit = 0.6 + 0.4 * Math.abs(this._v.set(0, 0, 1).applyMatrix4(matrix).normalize().dot(this.sunDir));
    const dim = lit * (1 - 0.55 * this.night);
    for (let f = 0; f < cnt / 3; f++) {
      const band = Math.min(Math.floor(f / (2 * theta)), r.bands - 1) * 4;
      for (let k = 0; k < 3; k++) {
        const v = (f * 3 + k) * 4;
        col[v] = r.data[band] * dim; col[v + 1] = r.data[band + 1] * dim;
        col[v + 2] = r.data[band + 2] * dim; col[v + 3] = r.data[band + 3];
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
      clippingPlanes: [this.clip],
    }));
    // move the origin from the planet centre to the site, then grow the ring to sky size
    const k = RING_REACH / (r.outer + 1);
    mesh.applyMatrix4(matrix);
    mesh.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -1, 0));
    mesh.applyMatrix4(new THREE.Matrix4().makeScale(k, k, k));
    mesh.renderOrder = 1;
    this.far.add(mesh);
    this.ring = mesh;
  }

  // Six to twelve flat clouds near the ceiling, drifting on one wind. One instanced mesh, one draw
  // call. They carry no fog, because the whole deck sits past the fog and would go flat.
  _addClouds(site) {
    const rng = mulberry32(hashSeed(`${this.world.seed}|sky|${(site?.lat ?? 0).toFixed(2)}|${(site?.lon ?? 0).toFixed(2)}`));
    const n = this.tier.shadows ? 12 : 6;
    const geo = cloudGeometry(rng);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.world.palette?.cloud || '#ffffff').lerp(this.horizon, 0.15 + 0.6 * this.night),
      transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, fog: false,
    });
    const inst = new THREE.InstancedMesh(geo, mat, n);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.renderOrder = 2;
    inst.frustumCulled = false;
    const wind = rng() * Math.PI * 2, speed = 1.5 + rng() * 2;
    for (let i = 0; i < n; i++) {
      this.clouds.push({
        x: (rng() * 2 - 1) * CLOUD_SPAN,
        z: (rng() * 2 - 1) * CLOUD_SPAN,
        y: CLOUD_LOW + rng() * (CLOUD_HIGH - CLOUD_LOW),
        sx: 180 + rng() * 240, sz: 180 + rng() * 240, rot: rng() * Math.PI * 2,
        vx: Math.cos(wind) * speed * (0.8 + rng() * 0.4),
        vz: Math.sin(wind) * speed * (0.8 + rng() * 0.4),
      });
    }
    this.cloudMesh = inst;
    this.group.add(inst);
    this._placeClouds();
  }

  _placeClouds() {
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      this._q.setFromAxisAngle(this._v.set(0, 1, 0), c.rot);
      this._m.compose(this._v.set(c.x, c.y, c.z), this._q, this._s.set(c.sx, 1, c.sz));
      this.cloudMesh.setMatrixAt(i, this._m);
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
  }

  update(t, dt, camera) {
    if (camera) {
      this.far.position.copy(camera.position);
      this.clip.constant = -camera.position.y;   // the eye line is the horizon of the sky
    }
    for (const m of this.moons) {
      m.angle += m.speed * dt;
      m.mesh.rotation.y += dt * 0.3;
      this._placeMoon(m);
    }
    if (this.cloudMesh) {
      for (const c of this.clouds) {
        c.x += c.vx * dt; c.z += c.vz * dt;
        if (c.x > CLOUD_SPAN) c.x -= CLOUD_SPAN * 2; else if (c.x < -CLOUD_SPAN) c.x += CLOUD_SPAN * 2;
        if (c.z > CLOUD_SPAN) c.z -= CLOUD_SPAN * 2; else if (c.z < -CLOUD_SPAN) c.z += CLOUD_SPAN * 2;
      }
      this._placeClouds();
    }
  }
}

// A flat blob in the xz plane, radius near 1. Nine sides keep the low-poly look of the globe.
function cloudGeometry(rng) {
  const n = 9, pos = [0, 0, 0], idx = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = 0.6 + rng() * 0.55;
    pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
