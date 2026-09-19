// myworlds — the source on the ground: the wreck of an older probe, at the scale of the patch.
//
// A world holds one source, in one cell. The instrument of the probe reads a bearing to it from
// every landing, and a landing on that cell shows the thing itself. The worker picked the place,
// flattened a disc under it, and scorched the ground; see patchSource() in worker.js. This module
// draws the wreck, blinks its lamp, answers a tap, and builds the body the study card turns.
//
// The frame is the frame of the patch: the origin at the site, y up, and x and z in units of the
// box. patch.source gives the place and the yaw in those units.
//
// The wreck reads from far away, because the reader walks to it across the cell. So the mast stands
// MAST_H units and the lamp draws with the fog off: a lamp that the fog took would go out at the
// distance the reader first looks for it.
//
// The lamp blinks the rhythm of the motif of the source. The clock is the bar clock of music.js
// when the sound runs, and the clock of the landing when it does not, so a reader with the sound off
// loses no fact. Decision 12 of issue 34.
import * as THREE from 'three';
import { motifOf } from './music.js';

const MAST_H = 18;           // units, the mast over the ground
const DISC_R = 12;           // units, the ring of the mark. The worker flattens 14.
const RING_BAND = 0.06;      // the part of the radius the band of the ring takes
const RING_LIFT = 0.12;      // units, the ring stands this far over the ground
const LAMP_R = 0.75;         // units, the lamp itself
const HALO_R = 2.1;          // units, the glow around it
const LAMP_FLOOR = 0.14;     // the lamp never goes fully out, so the reader can find it between beats
const LAMP_TAIL = 0.42;      // the decay of one beat, as a part of one step of the motif
const LIGHT_RANGE = 260;     // units, how far the lamp light reaches on HIGH
const LIGHT_CD = 900;        // candela at the lamp, in the light scale of ground.js
const PICK_PAD = 6;          // units: the tap box stands this far out from the body

// The metal of a machine. It takes no colour from the palette: a wreck must read as a made thing on
// a green world and on an ice world alike, and a hull in the colours of the biome would read as
// rock. Only the lamp takes the accent of the world.
const C_HULL = '#8f959d';
const C_HULL_DARK = '#5c626a';
const C_BURN = '#3b3a3c';
const C_DISH = '#c2c8d0';
const C_LEG = '#6d747c';

const _up = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

// One part of the body: a geometry, a colour, and where it stands. mergeParts() below welds them
// into one flat-shaded mesh, the way mergeGeos() in fauna.js welds a creature.
function part(geo, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(
    _a.set(x, y, z), _q.setFromEuler(new THREE.Euler(rx, ry, rz)), _one);
  return { geo, color, matrix: m };
}

// A strut between two points: a tapered cylinder that stands along the line from a to b.
function strut(a, b, r1, r2, color, sides = 5) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
  const d = _b.clone().sub(_a);
  const len = d.length() || 0.001;
  const m = new THREE.Matrix4().compose(
    _b.clone().add(_a).multiplyScalar(0.5),
    _q.setFromUnitVectors(_up, d.normalize()),
    _one);
  return { geo: new THREE.CylinderGeometry(r2, r1, len, sides, 1), color, matrix: m };
}

// The parts welded into one non-indexed geometry with a colour per vertex. The material takes
// flatShading, so the facets read like the ground and like every other body in this app.
function mergeParts(parts) {
  const pos = [], nor = [], col = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
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
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// The body of the wreck, in its own frame: y up, the origin on the ground under the hull.
//
// It came down on its legs, one leg failed, and the hull settled over the gap. So the hull leans,
// two legs of the three still stand, the third is a bare socket, and the dish that rode on top lies
// beside it. The mast held, and the lamp on it still answers the clock of the motif.
export function wreckGeometry() {
  const lean = 0.52;                       // radians the hull leans by, about 30 degrees
  const hullLen = 13, hullFoot = [-2.6, 0.9, 0.4];
  const sl = Math.sin(lean), cl = Math.cos(lean);
  const hullTop = [hullFoot[0] + sl * hullLen, hullFoot[1] + cl * hullLen, hullFoot[2]];
  const parts = [
    // the hull: a drum that tapers to the nose, and a burnt skirt where it met the ground
    strut(hullFoot, hullTop, 3.4, 2.5, C_HULL, 8),
    part(new THREE.ConeGeometry(2.5, 3.2, 8), C_HULL_DARK,
      hullTop[0] + sl * 1.6, hullTop[1] + cl * 1.6, hullTop[2], 0, 0, -lean),
    part(new THREE.CylinderGeometry(3.6, 3.9, 1.6, 8), C_BURN,
      hullFoot[0], hullFoot[1] + 0.2, hullFoot[2], 0, 0, -lean),
    // a hatch on the flank, so the hull reads as a thing with a front
    part(new THREE.BoxGeometry(2.6, 3.2, 0.5), C_HULL_DARK, 0.9, 5.4, 2.9, 0, 0, -lean),
    // the mast, and the arm the lamp sits on. It stands nearly upright: the mast is what the
    // reader picks out of the fog, and a mast that lay with the hull would say nothing at range.
    strut([-3.4, 0.4, 1.4], [-4.6, MAST_H, 1.4], 0.42, 0.22, C_LEG, 6),
    part(new THREE.BoxGeometry(2.4, 0.3, 0.3), C_LEG, -4.6, MAST_H - 1.6, 1.4),
    strut([-3.4, 0.6, 1.4], [-1.2, 4.2, 1.0], 0.3, 0.2, C_LEG, 4),
    // the dish, on its back beside the hull. A lathe of four points gives a shallow bowl.
    part(new THREE.LatheGeometry([
      new THREE.Vector2(0.15, 0), new THREE.Vector2(2.0, 0.28),
      new THREE.Vector2(3.6, 0.95), new THREE.Vector2(4.6, 1.9),
    ], 14), C_DISH, -7.0, 1.5, -4.6, -1.02, 0.4, 0),
    part(new THREE.CylinderGeometry(0.5, 0.5, 2.6, 6), C_HULL_DARK, -6.6, 0.8, -3.4, 1.0, 0, 0.3),
    // two legs of the three. Each one is a strut from the hull to a pad on the ground.
    strut([-0.6, 3.0, 2.4], [2.9, 0.35, 6.2], 0.55, 0.35, C_LEG, 5),
    part(new THREE.CylinderGeometry(1.5, 1.7, 0.7, 7), C_LEG, 2.9, 0.35, 6.2),
    strut([-0.6, 3.0, -2.4], [2.6, 0.35, -6.4], 0.55, 0.35, C_LEG, 5),
    part(new THREE.CylinderGeometry(1.5, 1.7, 0.7, 7), C_LEG, 2.6, 0.35, -6.4),
    // the socket of the leg that is gone, and the pad it left behind
    part(new THREE.CylinderGeometry(0.75, 0.75, 1.5, 6), C_BURN, -3.0, 2.4, 0.2, 0, 0, 1.15),
    part(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 7), C_BURN, -6.6, 0.25, 3.6, 0.2, 0, 0.12),
  ];
  const geo = mergeParts(parts);
  geo.userData.lamp = [-4.6, MAST_H + 0.4, 1.4];
  return geo;
}

// The lamp on the mast: a small solid core and a glow around it. Both draw with the fog off, so the
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

    const geo = wreckGeometry();
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

  // The level of the lamp, 0 to 1, at one point of the four-bar period of the motif. A step lights
  // it for about one step of the grid and it falls away fast, so the eye reads the rhythm the ear
  // hears. The floor keeps a dim lamp between the beats, which is what the reader walks toward.
  _level(clock) {
    const m = this.motif;
    let k = 0;
    for (const s of m.steps) {
      const age = clock - s * m.stepDur;
      if (age < 0 || age > m.stepDur * 4) continue;
      const v = Math.exp(-age / (m.stepDur * LAMP_TAIL));
      if (v > k) k = v;
    }
    return LAMP_FLOOR + (1 - LAMP_FLOOR) * k;
  }

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

  // log is world.source.log; see docs/source.md. `accent` is the colour of the lamp and `variant`
  // is the ground colour of the world, so the card and the patch agree.
  show(log, accent, groundColor, motif) {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.motif = motif || null;
    if (!this.mesh) {
      const geo = wreckGeometry();
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
      ? entries.map((e) => `<div class="clog-entry"><h3>Day ${e.day}${e.title ? ' · ' + esc(e.title) : ''}</h3><p>${esc(e.text)}</p></div>`).join('')
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
      let k = 0;
      for (const s of m.steps) {
        const age = clock - s * m.stepDur;
        if (age < 0 || age > m.stepDur * 4) continue;
        const v = Math.exp(-age / (m.stepDur * LAMP_TAIL));
        if (v > k) k = v;
      }
      this.lamp.material.color.copy(this.lampColor).multiplyScalar(0.3 + 0.7 * (LAMP_FLOOR + (1 - LAMP_FLOOR) * k));
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
