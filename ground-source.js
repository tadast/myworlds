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
import * as THREE from 'three';
import { motifOf } from './music.js';
import { wreckGeometry, hullOf } from './wreck-geometry.js';

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

// ---------------------------------------------------------------- the preview on the study card
// The card of the log shows the wreck itself, turning on its own axis, the way the plant card shows
// the plant. The two work the same way and for the same reason: the subject stands still on the
// ground, so the camera holds still and the body turns, and the reader reads every side of it
// without touching anything. See PlantInspector in flora-card.js.
const SPIN = 0.22;           // radians per second: one turn in about 28 seconds
const FRAME_H = 2.6;         // units: the height the body is scaled to on the card
const CAM_DIST = 5.6;        // units: set from FRAME_H and the 36 degree field of view
const CARD_DISC = 2.2;       // units: the ground disc under the wreck

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
  show(log, accent, groundColor, motif, hull) {
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
    // The log itself. A middle entry carries no title, and the header is then the day alone.
    const entries = (log && log.entries) || [];
    this.logEl.innerHTML = entries.length
      ? entries.map((e) => `<div class="clog-entry${e.title ? ' ctitled' : ''}"><h3>Day ${e.day}${e.title ? ' · ' + esc(e.title) : ''}</h3><p>${esc(e.text)}</p></div>`).join('')
      : '<div class="clog-entry"><p>The recorder is dead. Nothing can be read from it.</p></div>';
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
