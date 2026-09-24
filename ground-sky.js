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
import { tangentFrame } from './cell-grid.js';

const DEG = Math.PI / 180;

export const SUN_FLOOR = 8 * DEG;     // a sun below the horizon rises to here, so the ground stays lit
export const SUN_GLOW = 20 * DEG;     // the warm tint reaches this far from the sun
export const SUN_DISC = 1.2 * DEG;    // the disc is larger than the true sun, so it reads
export const NIGHT_ANGLE = 12 * DEG;  // the sun this far below the horizon gives full night
// Under this elevation the day light thins: the light of a low star goes through more air, so it
// is weaker and redder. Over it the light is the full light of the star.
export const DAY_ANGLE = 30 * DEG;
// ---------------------------------------------------------------- the clock of a landing
// The sky of a landing used to hold one hour for ever. It reads as a picture, and a reader who
// waits for the sunset the overlay states waits for nothing.
//
// So the ground keeps a clock. One turn of the planet takes GROUND_DAY seconds of real time,
// whatever the day of the world is, and the sun, the moons, and the countdown of the overlay all
// read that one clock. At 1,800 s the sun turns 12 degrees a minute: it covers its own disc in
// about twelve seconds, which a reader who watches sees and a reader who walks does not, and a sun
// 30 degrees up sets in about two minutes and a half.
export const GROUND_DAY = 1800;       // seconds of real time for one turn of the planet
// How many turns of the sky a moon makes over one of those days. The globe runs its moons fast,
// because a miniature must show an orbit while the reader looks at it: a moon there takes 21 to
// 52 s against 125 s for the turn of the planet, which on the ground threw the moon across the sky
// in under a minute. The ground keeps the order the globe rolled and divides it by MOON_SLOW, so a
// world with a fast moon still has the faster one and no moon crosses the sky in a hurry.
const MOON_SLOW = 4;
const MOON_TURNS = [0.25, 2];         // the band a moon must stay inside, in turns per day
export const MOON_DIST = 4000;        // metres, the draw distance of a moon on the dome
export const MOON_GAIN = 3;           // the true angular size is too small to read, so it grows 3x
export const RING_REACH = 4250;       // metres, the far edge of the ring band
export const CLOUD_LOW = 900;         // metres, the floor of the cloud deck
export const CLOUD_HIGH = 1100;       // metres, the roof of the cloud deck
export const CLOUD_SPAN = 1800;       // metres, the half width of the field the clouds drift in

// How far the star must move before the colours of the sky are built again. A degree of the sky
// takes under a second of the clock, and the colours cost more than the turn does.
const RELIGHT_STEP = 0.25 * DEG;
const RELIGHT_COS = Math.cos(RELIGHT_STEP);
const _turn = new THREE.Vector3();   // scratch for the turn of the sky

const NIGHT_COLOR = new THREE.Color('#070a16');   // the colour of the orbit sky, the darker end
const SUN_TINT = new THREE.Color('#fff2cf');
const SUN_LIGHT = new THREE.Color('#fff4e0');
const MOON_LIGHT = new THREE.Color('#b9c8e8');
const LOW_LIGHT = new THREE.Color('#ff9a58');     // the light of a star on the horizon
const DUSK_TINT = new THREE.Color('#e08a64');     // the warm part of a dusk horizon

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
// The frame of the site comes from tangentFrame() in cell-grid.js: east is the direction of falling
// lon, and south is east cross up. The three axes make a right-handed frame, and the sky is not
// mirrored.
// `twist` turns the frame about the up axis. Since issue 30 the box of the patch runs along the
// axes of its cell of the cube grid and not along east and south, so the sky takes the same turn
// or the sun stands in the wrong quarter of it. See cellTwist() in site.js. The box is a
// right-handed set too, x along the u axis of the cell and z against the v axis, so a turn is all
// the sky needs. tools/frame-check.mjs fails when either side becomes a mirror.
export function groundBasis(planet, site, twist = 0) {
  const f = tangentFrame(site.lat, site.lon);
  const up = new THREE.Vector3().fromArray(f.up);
  const east0 = new THREE.Vector3().fromArray(f.east);
  const south0 = new THREE.Vector3().fromArray(f.south);
  const ct = Math.cos(twist), st = Math.sin(twist);
  const east = east0.clone().multiplyScalar(ct).addScaledVector(south0, st).normalize();
  const south = south0.clone().multiplyScalar(ct).addScaledVector(east0, -st).normalize();
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
export function skyView(current, site, sunDir, twist = 0) {
  const basis = groundBasis(current.planet, site, twist);
  // The axis the planet turns about, in the ground frame. The sky of the site turns about it, so
  // the sun rises and sets the way it does at that latitude: straight up at the equator, and along
  // a low slant near a pole. The axis of the globe carries the tilt of the world, because it is
  // read from the world matrix of the planet.
  const north = new THREE.Vector3(0, 1, 0)
    .applyMatrix4(new THREE.Matrix4().extractRotation(current.planet.matrixWorld))
    .applyMatrix4(basis).normalize();
  const spin = Math.abs(current.spin) || 0.05;
  const view = {
    basis,
    axis: north,
    // Which way the sky turns over the site. The planet turns about its own north, so the sky
    // turns the other way, and a world tipped past 90 degrees turns back and its star rises where
    // another star sets. See Sky.turnSign.
    turnSign: current.spin < 0 ? 1 : -1,
    sunDir: sunDir.clone().applyMatrix4(basis).normalize(),
    moons: [],
    ring: null,
  };
  for (const m of current.moons || []) {
    m.pivot.updateWorldMatrix(true, false);
    // the orbit plane of the moon, turned into the ground frame; the moon runs a circle in it
    const orbit = new THREE.Matrix4().extractRotation(m.pivot.matrixWorld).premultiply(basis);
    // the turns of the sky this moon makes over one turn of the planet, from the pair the globe
    // rolled, held inside the band the ground can show
    const turns = Math.min(MOON_TURNS[1], Math.max(MOON_TURNS[0], Math.abs(m.speed) / spin / MOON_SLOW))
      * (m.speed < 0 ? -1 : 1);
    view.moons.push({ orbit, angle: m.angle, turns, dist: m.dist, size: m.size, color: m.color, seed: m.seed });
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
    // Two suns, and only one of them is a star. sunTrue is where the star stands, and it turns
    // with the clock. sunDir is where the light comes from, which is sunTrue held at SUN_FLOOR
    // when the star is down: a sun under the horizon leaves the ground black, so it keeps 8
    // degrees and the sky darkens instead. Every part that lights the ground reads sunDir, and
    // every part that draws the star reads sunTrue.
    this.sunTrue = (view?.sunDir || sunDir || new THREE.Vector3(1, 0.55, 0.8)).clone().normalize();
    this.sunDir = this.sunTrue.clone();
    this.atmo = new THREE.Color(pal.atmo || '#8fb7ff');
    this.starLight = (view?.starLight || SUN_LIGHT).clone();
    this.starTint = view?.starLight ? SUN_TINT.clone().multiply(view.starLight) : SUN_TINT.clone();
    this.horizon = new THREE.Color();
    this.zenith = new THREE.Color();
    this.sunColor = new THREE.Color();
    this.discColor = new THREE.Color();
    this.glowColor = new THREE.Color();
    this.sunIntensity = 2.6;
    this.hemiIntensity = 0.7;
    this.night = 0;
    this.low = 0;               // 0 over DAY_ANGLE, 1 with the star on the horizon
    this._dusk = new THREE.Color();
    this.sunElev = 0;
    // The axis of the turn, and how fast and which way the sky turns about it. The sign is the
    // turn of the planet, reversed: the ground stands on the planet, so the sky runs the other way.
    // A landing can therefore begin in the morning as easily as in the afternoon, and toHorizon()
    // answers for the star that is climbing as well as for the one that is falling.
    this.axis = (view?.axis || new THREE.Vector3(0, 1, 0)).clone().normalize();
    this.rate = (Math.PI * 2) / GROUND_DAY;
    this.turnSign = view?.turnSign || -1;
    this._litDir = new THREE.Vector3(0, -2, 0);   // where the star stood at the last build
    this._relight(true);

    this._addDome();
    if (view) {
      for (const m of view.moons) this._addMoon(m);
      if (view.ring) this._addRing(view.ring);
    }
    if (world.hasClouds) this._addClouds(site);
  }

  // How far the sky must turn before the star meets the horizon, in radians, or null when it
  // never does. The overlay states the time that turn takes.
  //
  // The star runs a circle about the axis, and the circle meets the plane of the horizon twice or
  // not at all. Write the height of the star after a turn of theta with the rotation formula:
  //
  //     y(theta) = A cos(theta) + B sin(theta) + C
  //     A = s.y - a.y * k,   B = (a cross s).y,   C = a.y * k,   k = a dot s
  //
  // Set y to zero and the solution is theta = phi +/- acos(-C / R), with R the length of (A, B)
  // and phi the angle of it. The turn goes one way, so the answer is the first of the two the sky
  // reaches. A circle that holds no solution is a star that never sets or never rises, which a
  // high latitude really has, and the overlay then states nothing instead of a wrong hour.
  toHorizon() {
    const s0 = this.sunTrue, a = this.axis;
    const k = a.dot(s0);
    _turn.crossVectors(a, s0);
    const A = s0.y - a.y * k, B = _turn.y, C = a.y * k;
    const R = Math.hypot(A, B);
    if (R < 1e-6) return null;
    const c = -C / R;
    if (c < -1 || c > 1) return null;          // the star never meets the horizon at this site
    const phi = Math.atan2(B, A), d = Math.acos(c);
    const TAU = Math.PI * 2;
    let best = null;
    for (const raw of [phi + d, phi - d]) {
      // the turn runs one way, so read every solution in the direction it goes
      let th = (raw * this.turnSign) % TAU;
      if (th < 0) th += TAU;
      if (th < 1e-4) th += TAU;                // the star stands on the horizon now: take the next
      if (best === null || th < best) best = th;
    }
    return best;
  }

  // The light of the hour, from the elevation of the star. The constructor and every step of the
  // clock run the same lines, so a sky built at dusk and a sky that walked into dusk hold the same
  // colours. `force` builds them whatever the elevation says, which the constructor needs.
  //
  // The direction of the light follows the star every frame, because a shadow that moves in steps
  // jumps: at 10 degrees a step of 0.25 degrees moves the tip of the shadow of a 20 m tree by 3 m.
  // Only the colours wait for RELIGHT_STEP, and they measure the whole turn of the star, not only
  // its height. Near noon the star moves along the horizon and its height hardly changes.
  _relight(force) {
    const elev = Math.asin(THREE.MathUtils.clamp(this.sunTrue.y, -1, 1));
    this.sunElev = elev;
    this.sunDir.copy(this.sunTrue);
    if (elev < SUN_FLOOR) {
      const flat = Math.hypot(this.sunDir.x, this.sunDir.z) || 1;
      const k = Math.cos(SUN_FLOOR) / flat;
      this.sunDir.set(this.sunDir.x * k, Math.sin(SUN_FLOOR), this.sunDir.z * k).normalize();
    }
    // A degree of the sky is under a second of the clock, and the colours cost more than the turn.
    if (!force && this._litDir.dot(this.sunTrue) > RELIGHT_COS) { this.lightMoved = false; return; }
    this._litDir.copy(this.sunTrue);
    this.lightMoved = true;
    this.night = THREE.MathUtils.clamp(-elev / NIGHT_ANGLE, 0, 1);
    const day = THREE.MathUtils.clamp(elev / DAY_ANGLE, 0, 1);
    this.low = (1 - day) * (1 - day);
    const dusk = this.low * (1 - this.night);
    // the colours: the horizon takes the atmosphere colour, warms at dusk, and goes dark at night.
    // The zenith is 30% darker.
    this._dusk.copy(this.atmo).multiplyScalar(0.75).lerp(DUSK_TINT, 0.4);
    this.horizon.copy(this.atmo).lerp(this._dusk, 0.45 * dusk).lerp(NIGHT_COLOR, this.night * 0.88);
    this.zenith.copy(this.horizon).multiplyScalar(0.7);
    // The light of a low star is weaker and redder. It then fades to the light of the night.
    this.sunColor.copy(this.starLight).lerp(this._dusk.copy(this.starLight).multiply(LOW_LIGHT), 0.8 * dusk)
      .lerp(MOON_LIGHT, this.night);
    this.sunIntensity = (2.6 - 1.4 * this.low) * (1 - this.night) + 0.6 * this.night;
    this.hemiIntensity = 0.7 - 0.15 * dusk - 0.35 * this.night;
    this.discColor.copy(this.starTint).lerp(MOON_LIGHT, this.night).multiplyScalar(1 - 0.5 * this.night);
    this.glowColor.copy(this.discColor).lerp(this.horizon, 0.35);
    this.glowGain = 0.55 * (1 - 0.7 * this.night);
    const sh = this.domeMat && this.domeMat.userData.shader;
    if (sh) sh.uniforms.uGlowGain.value = this.glowGain;
    if (this.domeMat) this.domeMat.color.copy(this.horizon);
    if (this.cloudMat) {
      this.cloudMat.color.copy(this.cloudColor).lerp(this.horizon, 0.15 + 0.6 * this.night);
    }
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
      sh.uniforms.uSunColor = { value: this.glowColor };
      sh.uniforms.uDiscColor = { value: this.discColor };
      // the disc stands where the star stands, and not where the light comes from: the star sets
      // and the light stays at the floor, so the two part company at dusk
      sh.uniforms.uSunDir = { value: this.sunTrue };
      sh.uniforms.uGlowGain = { value: this.glowGain };
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
          // the disc fades out over the last degrees, so the star sets into the haze and leaves
          // no lit spot hanging under the eye line
          diffuseColor.rgb = mix(diffuseColor.rgb, uDiscColor, smoothstep(${disc.toFixed(6)}, ${(disc * 0.35).toFixed(6)}, a2) * low);`);
      mat.userData.shader = sh;
    };
    return mat;
  }

  _addDome() {
    this.domeMat = this._domeMaterial();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 48, 24), this.domeMat);
    dome.renderOrder = -1;
    this.domeMat.color.copy(this.horizon);
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
  // its normal near world +y, while the planet axis carries the obliquity of the world. The band
  // reads the world
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
    this.cloudColor = new THREE.Color(this.world.palette?.cloud || '#ffffff');
    const mat = new THREE.MeshBasicMaterial({
      color: this.cloudColor.clone().lerp(this.horizon, 0.15 + 0.6 * this.night),
      transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, fog: false,
    });
    this.cloudMat = mat;
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
    // The sky turns. The star moves first, because the colours of the hour come from where it
    // stands, and every other part of the sky and of the ground reads those colours.
    const step = this.rate * this.turnSign * dt;
    if (step) this.sunTrue.applyAxisAngle(this.axis, step).normalize();
    this._relight(false);
    // A moon keeps the turns of the sky per day the globe gave it, so it crosses the sky in tens
    // of minutes and no longer in tens of seconds.
    for (const m of this.moons) {
      m.angle += (m.turns || 0) * this.rate * dt;
      m.mesh.rotation.y += dt * 0.02;
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
