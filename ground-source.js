// myworlds — the source on the ground: the wreck of an older probe, at the scale of the patch.
//
// A world holds one source, in one cell. The instrument of the probe reads a bearing to it from
// every landing, and a landing on that cell shows the thing itself. The worker picked the place,
// flattened a disc under it, and scorched the ground; see patchSource() in generate.js. This module
// draws the wreck, blinks its lamp, answers a tap, and builds the body the study card turns.
//
// The frame is the frame of the patch: the origin at the site, y up, and x and z in units of the
// box. patch.source gives the place and the yaw in those units.
//
// The wreck reads from far away, because the reader walks to it across the cell. So the lamp stands
// on the highest point of the hull, 17 units or more over the ground, and it draws with the fog off:
// a lamp that the fog took would go out at the distance the reader first looks for it. The seed of
// the world picks one of four hulls; see wreck-geometry.js.
//
// The lamp blinks the rhythm of the motif of the source. The clock is the bar clock of music.js
// when the sound runs, and the clock of the landing when it does not, so a reader with the sound off
// loses no fact. Decision 12 of issue 34.
//
// The ruin of phase 2 stands here too: SourceRuin has the shape of SourceWreck, and Ground takes the
// class by patch.source.kind. See "The ruin on its patch" in docs/ruin.md. p2-41.
import * as THREE from 'three';
import { motifOf } from './music.js';
import { wreckGeometry, hullOf } from './wreck-geometry.js';
import { ruinGeometry } from './ruin-geometry.js';
import { protoRow } from './ruin-types.js';
import { carrierColour } from './carrier-globe.js';

const DISC_R = 12;           // units, the ring of the mark. The worker flattens 14.
const RING_BAND = 0.06;      // the part of the radius the band of the ring takes
const RING_LIFT = 0.12;      // units, the ring stands this far over the ground
const LAMP_R = 0.75;         // units, the lamp itself
const HALO_R = 2.1;          // units, the glow around it
const LAMP_FLOOR = 0.14;     // the lamp never goes fully out, so the reader can find it between beats
const LAMP_TAIL = 0.42;      // the decay of one beat, as a part of one step of the motif
const LAMP_BREATH = 0.3;     // the swell of the floor over one bar, so the lamp pulses on a motif with few steps too
const LIGHT_RANGE = 260;     // units, how far the lamp light reaches on HIGH
const LIGHT_CD = 900;        // candela at the lamp, in the light scale of ground.js
const PICK_PAD = 6;          // units: the tap box stands this far out from the body

const _a = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

// The lamp: a small solid core and a glow around it. Both draw with the fog off, so the
// lamp holds its colour past FOG_NEAR and the reader can walk to it out of the mist.
function lampParts(color) {
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(LAMP_R, 0),
    new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false }));
  const halo = new THREE.Mesh(
    new THREE.OctahedronGeometry(HALO_R, 0),
    new THREE.MeshBasicMaterial({
      color, fog: false, toneMapped: false, transparent: true, opacity: 0.35,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  core.renderOrder = 3; halo.renderOrder = 3;
  core.frustumCulled = false; halo.frustumCulled = false;
  return { core, halo };
}

// The level of the lamp, 0 to 1, at one point of the four-bar period of the motif. A step lights
// it for about one step of the grid and it falls away fast, so the eye reads the rhythm the ear
// hears. Between the beats the floor swells and falls once a bar, so the lamp never holds still: a
// motif with few steps would otherwise leave a flat dim lamp for most of a bar.
function lampLevel(m, clock) {
  let k = 0;
  for (const s of m.steps) {
    const age = clock - s * m.stepDur;
    if (age < 0 || age > m.stepDur * 4) continue;
    const v = Math.exp(-age / (m.stepDur * LAMP_TAIL));
    if (v > k) k = v;
  }
  const bar = m.period / 4;
  const floor = LAMP_FLOOR + LAMP_BREATH * (0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / bar));
  return floor + (1 - floor) * k;
}

export class SourceWreck {
  // The wreck of this patch, or null when the patch carries none. Every cell but one gives null and
  // costs nothing, the way Phenomena.create() does.
  static create(opts) {
    const src = opts && opts.patch && opts.patch.source;
    if (!src || src.kind !== 'wreck') return null;
    return new SourceWreck(opts);
  }

  constructor({ world, patch, tier, heightAt, music }) {
    const src = patch.source;
    this.kind = src.kind;
    this.world = world;
    this.music = music || null;
    this.full = tier ? tier.shadows !== false : true;   // HIGH keeps the light; LOW keeps the lamp
    this.at = { x: src.x, z: src.z };
    this.motif = motifOf(world);
    this.t0 = -1;
    this.marked = false;
    this.ring = null;
    this.light = null;

    // The ground the worker flattened. The drawn height is read here and not taken from src.y,
    // because the mesh of the terrain is what the reader sees the wreck stand on.
    const y = heightAt ? heightAt(src.x, src.z) : src.y;
    this.group = new THREE.Group();
    this.group.position.set(src.x, y, src.z);
    this.group.rotation.y = src.yaw || 0;

    const geo = wreckGeometry(hullOf(world));
    this.body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true,
    }));
    this.body.castShadow = !!(tier && tier.shadows);
    this.body.receiveShadow = !!(tier && tier.shadows);
    this.group.add(this.body);
    this.tris = geo.attributes.position.count / 3;

    const pal = (world && world.palette) || {};
    this.lampColor = new THREE.Color((pal.fauna && pal.fauna.accent) || '#ffd27f');
    const { core, halo } = lampParts(this.lampColor);
    const L = geo.userData.lamp;
    core.position.set(L[0], L[1], L[2]);
    halo.position.copy(core.position);
    this.lamp = core; this.halo = halo;
    this.group.add(core, halo);
    if (this.full) {
      // One light at the lamp, on HIGH only. It is the second light the ground adds after the sun,
      // so LOW drops it and keeps the frame time, as the vent of a phenomenon does.
      this.light = new THREE.PointLight(this.lampColor, LIGHT_CD, LIGHT_RANGE, 2);
      this.light.position.copy(core.position);
      this.group.add(this.light);
    }
  }

  _level(clock) { return lampLevel(this.motif, clock); }

  update(t) {
    // The bar clock of the song when the sound runs, so the eye and the ear agree. With no sound the
    // lamp takes the clock of the landing over the same period, so the rhythm is the same rhythm.
    let clock = this.music && this.music.barClock ? this.music.barClock() : null;
    if (clock == null) {
      if (this.t0 < 0) this.t0 = t;
      const p = this.motif.period;
      clock = ((t - this.t0) % p + p) % p;
    }
    const k = this._level(clock);
    this.lamp.material.color.copy(this.lampColor).multiplyScalar(0.35 + 0.65 * k);
    this.halo.material.opacity = 0.1 + 0.42 * k;
    this.halo.scale.setScalar(0.8 + 0.35 * k);
    if (this.light) this.light.intensity = LIGHT_CD * k;
  }

  // The wreck under a point of the screen, or null. The body holds a few hundred triangles, so one
  // ray against it is exact and costs less than the projected measure the plants need. The box of
  // the geometry takes a pad, because a tap that lands beside the mast still means the wreck.
  pickAt(nx, ny, camera) {
    if (!this.body) return null;
    _ndc.set(nx, ny);
    _ray.setFromCamera(_ndc, camera);
    const hit = _ray.intersectObject(this.body, false)[0];
    if (hit) return { point: hit.point.clone(), dist: hit.distance };
    // The mast is two units wide at 300 units out, which is under one pixel, so a ray alone would
    // make the wreck untappable from the distance the reader first sees it. The box of the body,
    // grown by PICK_PAD, answers that tap; the ring then says what the button means.
    this.group.updateWorldMatrix(true, false);
    const box = this.body.geometry.boundingBox.clone().expandByScalar(PICK_PAD)
      .applyMatrix4(this.group.matrixWorld);
    const p = _ray.ray.intersectBox(box, _a);
    if (!p) return null;
    return { point: p.clone(), dist: camera.position.distanceTo(p) };
  }

  // The mark: the ring the plants and the animals use, laid flat on the disc the worker flattened.
  mark() {
    if (!this.ring) this._buildRing();
    this.marked = true;
    this.ring.visible = true;
  }

  unmark() {
    this.marked = false;
    if (this.ring) this.ring.visible = false;
  }

  _buildRing() {
    const geo = new THREE.RingGeometry(DISC_R * (1 - RING_BAND), DISC_R, 48);
    geo.rotateX(-Math.PI / 2);
    const pal = (this.world && this.world.palette) || {};
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color((pal.fauna && pal.fauna.accent) || '#ffffff'),
      transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.y = RING_LIFT;
    ring.renderOrder = 2;
    ring.frustumCulled = false;
    this.ring = ring;
    this.group.add(ring);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group.clear();
    this.body = null;
    this.lamp = null;
    this.halo = null;
    this.ring = null;
    this.light = null;
  }
}

// ---------------------------------------------------------------- the ruin on the ground, p2-41
// The second source. The worker placed the ruin, flattened the disc of its proto, and wore the
// floor; see patchRuin() in generate.js. This class draws the body of ruinGeometry(), blinks the
// glow, turns the slabs of the floaters, opens the ground over the well, and answers a tap. It has
// the shape of SourceWreck, so ground.js reads ground.source and does not care which kind it is.
//
// The glow takes the colour of chapter 2 from carrierColour(), so the ruin, its wedges, and its
// card read in one colour. It draws with the fog off, as the lamp of the wreck does: the reader
// walks to it out of the mist on the needle.
const RUIN_EDGE = 0.4;          // RUIN_EDGE of generate.js: the soft edge outside the flat disc
const RUIN_RING_BAND = 0.035;   // the part of the radius the band of the ring of the ruin takes
const RUIN_LIGHT_CD = 1400;     // candela at the lamp, in the light scale of ground.js
const RUIN_LIGHT_RANGE = 320;   // units, how far the lamp light reaches on HIGH
const RUIN_PICK_PAD = 2;        // units: the tap box of the ruin stands this far out from the body
const RUIN_GRACE = 20;          // units: the least grace of the tap, the WRECK_GRACE of ground.js
const FLOAT_TURN = 0.06;        // rad/s: the orbit of the floaters turns once in about 105 s
const FLOAT_LIFT = 1.4;         // units: how far a slab of the floaters rises and falls
const FLOAT_RATE = [0.3, 0.55]; // rad/s: the range of the rate of the lift of one slab
const GOLDEN = 2.399963;        // rad: the golden angle, so no two slabs lift in step

// The rhythm the glow of the ruin blinks: the motif of the wreck at half the speed. p2-44 gives the
// ruin a motif of its own and swaps this function for it; the glow reads only the fields of
// motifOf() and its period, so nothing else changes then.
export function ruinRhythm(world) {
  const m = motifOf(world);
  return { ...m, stepDur: m.stepDur * 2, barSeconds: m.barSeconds * 2, period: m.period * 2 };
}

// The parts of a welded geometry: a label per vertex, one for each group of triangles that share
// a corner. weld() in ruin-geometry.js keeps no mark of its parts, and the slabs of the floaters
// must lift one by one. A part is a closed box or ring, so its triangles all share corners.
function partsOf(geo) {
  const p = geo.attributes.position, n = p.count;
  const up = new Int32Array(n);
  for (let i = 0; i < n; i++) up[i] = i;
  const root = (i) => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  const join = (a, b) => { a = root(a); b = root(b); if (a !== b) up[b] = a; };
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(p.getX(i) * 1e3)},${Math.round(p.getY(i) * 1e3)},${Math.round(p.getZ(i) * 1e3)}`;
    const k = seen.get(key);
    if (k === undefined) seen.set(key, i); else join(k, i);
    if (i % 3 === 2) { join(i - 2, i - 1); join(i - 2, i); }
  }
  const label = new Uint16Array(n), ids = new Map();
  for (let i = 0; i < n; i++) {
    const r = root(i);
    if (!ids.has(r)) ids.set(r, ids.size);
    label[i] = ids.get(r);
  }
  return { label, count: ids.size };
}

// The outline of the footprint of the ruin on the ground: the convex hull of the parts, in the
// frame of the patch. The range of the overlay measures to it, so the range falls to nothing at the
// edge of the ruin and not at its middle.
function footprint(geos, matrix) {
  const pts = [], v = new THREE.Vector3(), seen = new Set();
  for (const g of geos) {
    if (!g) continue;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      const key = `${Math.round(v.x * 4)},${Math.round(v.z * 4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pts.push([v.x, v.z]);
    }
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of pts) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pts[i];
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  lo.pop(); hi.pop();
  return lo.concat(hi);   // counter-clockwise in (x, z)
}

// The distance from a point to a convex outline, 0 inside it.
function hullDistance(hull, x, z) {
  let inside = true, best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], px = x - a[0], pz = z - a[1];
    if (ex * pz - ez * px < 0) inside = false;
    const t = Math.max(0, Math.min(1, (px * ex + pz * ez) / (ex * ex + ez * ez || 1)));
    best = Math.min(best, Math.hypot(px - ex * t, pz - ez * t));
  }
  return inside ? 0 : best;
}

export class SourceRuin {
  // The ruin of this patch, or null when the patch carries none.
  static create(opts) {
    const src = opts && opts.patch && opts.patch.source;
    if (!src || src.kind !== 'ruin') return null;
    return new SourceRuin(opts);
  }

  constructor({ world, patch, tier, heightAt, music }) {
    const src = patch.source;
    const row = protoRow(src.proto);
    this.kind = src.kind;
    this.proto = src.proto;
    this.world = world;
    this.music = music || null;
    this.full = tier ? tier.shadows !== false : true;   // HIGH keeps the light; LOW keeps the glow
    this.at = { x: src.x, z: src.z };
    // The radius of the flat disc, and of the disc with its soft edge. The worker keeps the plants
    // and the groups off `outer`, and ground.js keeps the cover and the wandering herds off it.
    this.disc = row ? row.disc : 24;
    this.outer = this.disc * (1 + RUIN_EDGE);
    this.rhythm = ruinRhythm(world);
    this.wreckPeriod = motifOf(world).period;
    this.t0 = -1;
    this._bar = null;
    this._half = 0;
    this.marked = false;
    this.ring = null;
    this.light = null;
    this.hole = null;

    // The ground the worker flattened. The drawn height is read here and not taken from src.y,
    // because the mesh of the terrain is what the reader sees the ruin stand on.
    const y = heightAt ? heightAt(src.x, src.z) : src.y;
    this.group = new THREE.Group();
    this.group.position.set(src.x, y, src.z);
    this.group.rotation.y = src.yaw || 0;
    this.group.updateMatrixWorld(true);

    const g = ruinGeometry(src.proto, world);
    const shadows = !!(tier && tier.shadows);
    this.stone = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0,
    });
    this.body = new THREE.Mesh(g.body, this.stone);
    this.body.castShadow = shadows;
    this.body.receiveShadow = shadows;
    this.group.add(this.body);

    this.glowColor = new THREE.Color(carrierColour(world, 2));
    this.glowMat = new THREE.MeshBasicMaterial({ color: this.glowColor.clone(), fog: false, toneMapped: false });
    this.glow = g.glow ? new THREE.Mesh(g.glow, this.glowMat) : null;
    if (this.glow) this.group.add(this.glow);

    // The floaters: the slabs and the rings turn about the core, and each part lifts on its own
    // phase. The lift moves the vertices of a part, so the shadow follows it.
    this.orbit = null;
    if (g.orbit) {
      this.orbit = new THREE.Mesh(g.orbit, this.stone);
      this.orbit.castShadow = shadows;
      this.orbit.receiveShadow = shadows;
      const pos = g.orbit.attributes.position;
      const parts = partsOf(g.orbit);
      this.orbitPart = parts.label;
      this.orbitY = Float32Array.from({ length: pos.count }, (_, i) => pos.getY(i));
      this.lift = new Float32Array(parts.count);
      this.liftRate = Float32Array.from({ length: parts.count }, (_, k) =>
        FLOAT_RATE[0] + (FLOAT_RATE[1] - FLOAT_RATE[0]) * ((k * 0.618034) % 1));
      pos.setUsage(THREE.DynamicDrawUsage);
      g.orbit.boundingSphere.radius += FLOAT_LIFT;
      this.group.add(this.orbit);
    }

    const L = g.lamp;
    if (this.full) {
      // One light at the lamp, on HIGH only, as the wreck has. LOW keeps the glow alone.
      this.light = new THREE.PointLight(this.glowColor, RUIN_LIGHT_CD, RUIN_LIGHT_RANGE, 2);
      this.light.position.set(L[0], L[1], L[2]);
      this.group.add(this.light);
    }

    // The well opens the ground. The terrain of a patch is one grid with no hole, so ground.js
    // passes this circle to the terrain material and its fragment shader discards inside it. The
    // circle takes a little more than the mouth: the rim of the well covers that band from above.
    if (g.body.userData.hole) this.hole = { x: src.x, z: src.z, r: g.body.userData.hole + 0.2 };

    // The tap: a thing this big takes the grace of its size, so a hit on the far wall of the well
    // or on a spire over a ridge still marks it. See _onUp() in ground.js.
    const bb = g.body.boundingBox;
    this.grace = Math.max(RUIN_GRACE, bb.max.y, -bb.min.y + 10);
    this.hull = footprint([g.body, g.glow, g.orbit], this.group.matrixWorld);
    this.tris = (g.body.attributes.position.count + (g.glow ? g.glow.attributes.position.count : 0)
      + (g.orbit ? g.orbit.attributes.position.count : 0)) / 3;
  }

  // The clock of the glow: the seconds inside the period of ruinRhythm(). The bar clock of the song
  // runs over one period of the motif of the wreck, and the ruin plays it at half the speed, so each
  // wrap of that clock moves the glow to the other half of its own period. With no sound the glow
  // takes the clock of the landing.
  _clock(t) {
    const bar = this.music && this.music.barClock ? this.music.barClock() : null;
    if (bar != null) {
      if (this._bar != null && bar < this._bar) this._half ^= 1;
      this._bar = bar;
      return bar + this._half * this.wreckPeriod;
    }
    this._bar = null;
    if (this.t0 < 0) this.t0 = t;
    const p = this.rhythm.period;
    return ((t - this.t0) % p + p) % p;
  }

  update(t) {
    // The rules of the lamp of the wreck: a floor that never goes out, a tail, and a breath.
    const k = lampLevel(this.rhythm, this._clock(t));
    this.glowMat.color.copy(this.glowColor).multiplyScalar(0.35 + 0.65 * k);
    if (this.light) this.light.intensity = RUIN_LIGHT_CD * k;
    if (this.orbit) this._turn(t);
  }

  _turn(t) {
    this.orbit.rotation.y = t * FLOAT_TURN;
    const lift = this.lift, rate = this.liftRate;
    for (let k = 0; k < lift.length; k++) lift[k] = FLOAT_LIFT * Math.sin(t * rate[k] + k * GOLDEN);
    const attr = this.orbit.geometry.attributes.position, a = attr.array;
    const part = this.orbitPart, y0 = this.orbitY;
    for (let i = 0; i < part.length; i++) a[i * 3 + 1] = y0[i] + lift[part[i]];
    attr.needsUpdate = true;
  }

  // Units over the ground from a point to the edge of the ruin, 0 on it. The needle points at the
  // middle, and the range falls to nothing as the reader reaches the stones.
  rangeFrom(x, z) {
    return hullDistance(this.hull, x, z);
  }

  // The ruin under a point of the screen, or null. A ray against the parts is exact. The box of the
  // parts answers a tap that misses a thin spire from far out.
  pickAt(nx, ny, camera) {
    if (!this.body) return null;
    _ndc.set(nx, ny);
    _ray.setFromCamera(_ndc, camera);
    const hit = _ray.intersectObjects([this.body, this.glow, this.orbit].filter(Boolean), false)[0];
    if (hit) return { point: hit.point.clone(), dist: hit.distance };
    this.group.updateWorldMatrix(true, false);
    const box = this.body.geometry.boundingBox.clone().expandByScalar(RUIN_PICK_PAD)
      .applyMatrix4(this.group.matrixWorld);
    const p = _ray.ray.intersectBox(box, _a);
    if (!p) return null;
    return { point: p.clone(), dist: camera.position.distanceTo(p) };
  }

  // The mark: the ring of the wreck, on the edge of the flat disc.
  mark() {
    if (!this.ring) {
      const geo = new THREE.RingGeometry(this.disc * (1 - RUIN_RING_BAND), this.disc, 96);
      geo.rotateX(-Math.PI / 2);
      const pal = (this.world && this.world.palette) || {};
      const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: new THREE.Color((pal.fauna && pal.fauna.accent) || '#ffffff'),
        transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: true,
      }));
      ring.position.y = RING_LIFT;
      ring.renderOrder = 2;
      ring.frustumCulled = false;
      this.ring = ring;
      this.group.add(ring);
    }
    this.marked = true;
    this.ring.visible = true;
  }

  unmark() {
    this.marked = false;
    if (this.ring) this.ring.visible = false;
  }

  dispose() {
    const mats = new Set();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) mats.add(o.material);
    });
    mats.forEach((m) => m.dispose());
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group.clear();
    this.body = null;
    this.glow = null;
    this.orbit = null;
    this.ring = null;
    this.light = null;
  }
}

// ---------------------------------------------------------------- the preview on the study card
// The card of the log shows the wreck itself, turning on its own axis, the way the plant card shows
// the plant. The two work the same way and for the same reason: the subject stands still on the
// ground, so the camera holds still and the body turns, and the reader reads every side of it
// without touching anything. See PlantInspector in flora-card.js.
const SPIN = 0.22;           // radians per second: one turn in about 28 seconds
const FRAME_H = 2.6;         // units: the height the body is scaled to on the card
const CAM_DIST = 5.6;        // units: set from FRAME_H and the 36 degree field of view
const CARD_DISC = 2.2;       // units: the ground disc under the wreck
// An ending of the kind `cut` stops in the middle of a sentence on purpose. Without a note, the
// reader takes the open line for text that did not load. The card therefore prints this note under
// that entry. The note is a part of the card and not of the log: it is not in log.entries, and the
// audit never reads it. The rule reads the slot and not the text, so every ending of the kind `cut`
// gets the note. See "The card" in docs/source.md.
const ABRUPT_SLOT = 'end.cut';
const ABRUPT = '[log ends abruptly]';

export class SourceInspector {
  constructor({ card, canvas }) {
    this.card = card; this.canvas = canvas;
    this.nameEl = card.querySelector('.cname');
    this.latinEl = card.querySelector('.clatin');
    this.crewEl = card.querySelector('.ccrew');
    this.logEl = card.querySelector('.clog');
    this.renderer = null; this.open = false;
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.4); sun.position.set(2.5, 4, 3);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005;
    const sc = sun.shadow.camera; sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -3; sc.near = 1; sc.far = 14;
    this.scene.add(sun, new THREE.HemisphereLight('#9fbfff', '#3a2a1a', 0.75));
    this.fill = new THREE.DirectionalLight('#6a86d8', 0.5); this.fill.position.set(-3, 1, -2);
    this.scene.add(this.fill);
    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(CARD_DISC, 28),
      new THREE.MeshStandardMaterial({ color: '#6fa85a', roughness: 1, flatShading: true }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    // The wreck turns and the disc under it does not, so the pivot carries the body alone.
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.mesh = null;
    this.lamp = null;
  }

  // log is world.source.log; see docs/source.md. `accent` is the colour of the lamp, `groundColor`
  // is the ground colour of the world, and `hull` is hullOf(world), so the card and the patch agree.
  // `tail` is an element the page puts under the last entry, or null: the tuner of p2-39.
  show(log, accent, groundColor, motif, hull, tail = null) {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.motif = motif || null;
    // The card outlives a world, and the next world may carry another hull.
    if (this.mesh && this.hull !== hull) {
      this.pivot.remove(this.mesh, this.lamp);
      this.mesh.geometry.dispose(); this.mesh.material.dispose();
      this.lamp.geometry.dispose(); this.lamp.material.dispose();
      this.mesh = null; this.lamp = null;
    }
    this.hull = hull;
    if (!this.mesh) {
      const geo = wreckGeometry(hull);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0.15,
      }));
      mesh.castShadow = true; mesh.receiveShadow = true;
      const bb = geo.boundingBox;
      const h = Math.max(bb.max.y - Math.min(bb.min.y, 0), 0.001);
      mesh.scale.setScalar(FRAME_H / h);
      this.fit = FRAME_H / h;
      this.mesh = mesh;
      this.pivot.add(mesh);
      const lamp = new THREE.Mesh(
        new THREE.OctahedronGeometry(LAMP_R * this.fit * 1.6, 0),
        new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }));
      const L = geo.userData.lamp;
      lamp.position.set(L[0] * this.fit, L[1] * this.fit, L[2] * this.fit);
      this.lamp = lamp;
      this.pivot.add(lamp);
    }
    this.lampColor = new THREE.Color(accent);
    this.lamp.material.color.copy(this.lampColor);
    // The eye stands level with the middle of the body and looks at that middle.
    const mid = FRAME_H * 0.5;
    this.camera.position.set(0, mid + FRAME_H * 0.18, CAM_DIST);
    this.camera.lookAt(0, mid, 0);
    this.ground.material.color.set(groundColor);

    this.nameEl.textContent = log && log.probe ? log.probe : 'Unknown probe';
    this.latinEl.textContent = log && log.days
      ? `Survey wreck · ${log.days} days of log` : 'Survey wreck';
    // The crew stands under the name of the ship, above the log, and it does not scroll with the
    // entries. The person who kept the log is marked, because the log is written in that voice.
    const crew = (log && log.crew) || [];
    this.crewEl.innerHTML = crew.length
      ? crew.map((c) => `<span${c.name === log.keeper ? ' class="ckeeper"' : ''}>${esc(c.name)}<i>${esc(c.role)}</i></span>`).join('')
      : '';
    // The log itself. A middle entry carries no title, and the header is then the day alone. An
    // ending of the kind `cut` also gets the note of the card under its text. See ABRUPT.
    const entries = (log && log.entries) || [];
    this.logEl.innerHTML = entries.length
      ? entries.map((e) => `<div class="clog-entry${e.title ? ' ctitled' : ''}"><h3>Day ${e.day}${e.title ? ' · ' + esc(e.title) : ''}</h3><p>${esc(e.text)}</p>${e.slot === ABRUPT_SLOT ? `<p class="cabrupt">${ABRUPT}</p>` : ''}</div>`).join('')
      : '<div class="clog-entry"><p>The recorder is dead. Nothing can be read from it.</p></div>';
    if (tail) this.logEl.appendChild(tail);
    this.logEl.scrollTop = 0;
    this.card.hidden = false;
    requestAnimationFrame(() => this.card.classList.add('show'));
    if (!this.open) { this.open = true; this.clock.start(); this.loop(); }
    this.resize();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.card.classList.remove('show');
    // The card is shared with the animal and the plant. See PlantInspector.hide(): only a card that
    // nobody has asked back on screen is really hidden.
    setTimeout(() => { if (!this.open && !this.card.classList.contains('show')) this.card.hidden = true; }, 250);
  }

  resize() {
    if (!this.renderer) return;
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  loop() {
    if (!this.open) return;
    requestAnimationFrame(() => this.loop());
    const t = this.clock.getElapsedTime();
    this.pivot.rotation.y = t * SPIN;
    // the lamp keeps the rhythm of the motif on the card too, so the card and the ground agree
    if (this.lamp && this.motif) {
      const m = this.motif;
      const clock = ((t % m.period) + m.period) % m.period;
      this.lamp.material.color.copy(this.lampColor).multiplyScalar(0.3 + 0.7 * lampLevel(m, clock));
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh = null; }
    if (this.lamp) { this.lamp.geometry.dispose(); this.lamp.material.dispose(); this.lamp = null; }
    if (this.renderer) { this.renderer.dispose(); this.renderer = null; }
  }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
