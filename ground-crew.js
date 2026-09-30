// myworlds — the crew at the twin, chapter 3: the people of the third log, on the ground.
//
// The crew went through the way before the reader, and the twin holds its tent. A person whose end
// is `home` lives there. That person stays inside the tent until the reader has read the third log,
// and then walks out of the door to a place in front of the tent. The page says when: release().
// A person of the chorus, the fate `change` on a world that takes the form `chorus`, stands in the
// herd, with no helmet, from the start. A tap on a person marks that person, and the page offers the
// talk on the floating button. See docs/issues/p3-00-the-way-on.md.
//
// The frame is the frame of the patch, in units of the box. A person stands 1.8 units, the person of
// tools/ruin-lab.html, beside a tent that TWIN_CAMP of way-types.js scales to 0.8.
import * as THREE from 'three';
import { tentPoint, TWIN_CAMP } from './way-types.js';

const TALL = 1.8;            // units, the height of a person
const WALK = 1.15;           // units per second
const STEP_HZ = 1.7;         // steps a second of the walk
const GAP = 1.4;             // seconds between two people at the door
const STAND_X = 5.6;         // the row in front of the tent, in the frame of the camp before the scale
const STAND_DZ = 1.5;        // the step between two people of the row
const PICK_R = 1.4;          // units: the ball a tap must meet, round the chest of a person
const RING_R = 0.95;         // units: the ring of the mark
const TURN = 2.2;            // radians per second: how fast a person turns to face the probe

const C_SUIT = '#dcdfe3';
const C_STRIPE = '#c0662e';  // the paint of a hatch, as the tent and the door of p2-43
const C_VISOR = '#1d2838';
const C_PACK = '#8f959d';
const C_BOOT = '#5c626a';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _v = new THREE.Vector3();
const _s = new THREE.Sphere();

// One person: a torso with a pack and a band of the paint of a hatch, a helmet with its visor, and
// arms and legs on pivots, so the walk can swing them. A person of the chorus takes no helmet and
// no pack, and the colour of the herd.
function personMesh(mats, chorus) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const body = chorus ? mats.herd : mats.suit;
  add(new THREE.BoxGeometry(0.46, 0.62, 0.3), body, 0, 1.18, 0);
  if (!chorus) {
    add(new THREE.BoxGeometry(0.47, 0.1, 0.31), mats.stripe, 0, 1.3, 0);
    add(new THREE.BoxGeometry(0.36, 0.5, 0.2), mats.pack, 0, 1.22, -0.24);
    add(new THREE.SphereGeometry(0.2, 10, 7), mats.suit, 0, 1.64, 0);
    add(new THREE.BoxGeometry(0.28, 0.14, 0.12), mats.visor, 0, 1.66, 0.14);
  } else {
    add(new THREE.SphereGeometry(0.16, 8, 6), mats.herd, 0, 1.62, 0);
  }
  const limb = (x, y, len, w, mat, foot) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    g.add(pivot);
    add(new THREE.BoxGeometry(w, len, w), mat, 0, -len / 2, 0, pivot);
    if (foot) add(new THREE.BoxGeometry(w + 0.02, 0.1, w + 0.12), mats.boot, 0, -len + 0.05, 0.05, pivot);
    return pivot;
  };
  const arms = [limb(-0.3, 1.45, 0.58, 0.13, body), limb(0.3, 1.45, 0.58, 0.13, body)];
  const legs = [limb(-0.12, 0.87, 0.82, 0.16, body, true), limb(0.12, 0.87, 0.82, 0.16, body, true)];
  g.userData.arms = arms;
  g.userData.legs = legs;
  const s = TALL / 1.84;
  g.scale.setScalar(s);
  return g;
}

export class GroundCrew {
  // The crew of this patch, or null: the patch of the twin, with a third log that leaves somebody
  // at the tent or in the herd.
  static create(opts) {
    const src = opts && opts.patch && opts.patch.source;
    const twin = opts && opts.world && opts.world.twin;
    if (!src || src.kind !== 'twin' || !src.tent || !twin || !twin.log) return null;
    const home = twin.log.crew.filter((c) => c.end === 'home');
    const chorus = twin.form === 'chorus' ? twin.log.crew.filter((c) => c.end === 'changed') : [];
    if (!home.length && !chorus.length) return null;
    return new GroundCrew(opts, home, chorus);
  }

  constructor({ world, patch, heightAt, tier }, home, chorus) {
    const src = patch.source;
    const tent = src.tent;
    this.heightAt = heightAt || (() => 0);
    this.group = new THREE.Group();
    this.shadows = !!(tier && tier.shadows);
    const herdG = world.species && world.species[world.twin.herd];
    const herdCol = herdG && herdG.colors ? herdG.colors.body || herdG.colors.accent : null;
    this.mats = {
      suit: new THREE.MeshLambertMaterial({ color: C_SUIT, flatShading: true }),
      stripe: new THREE.MeshLambertMaterial({ color: C_STRIPE, flatShading: true }),
      visor: new THREE.MeshLambertMaterial({ color: C_VISOR, flatShading: true }),
      pack: new THREE.MeshLambertMaterial({ color: C_PACK, flatShading: true }),
      boot: new THREE.MeshLambertMaterial({ color: C_BOOT, flatShading: true }),
      herd: new THREE.MeshLambertMaterial({ color: new THREE.Color(Array.isArray(herdCol) ? new THREE.Color().fromArray(herdCol) : herdCol || '#9fb0a0'), flatShading: true }),
    };
    this.people = [];
    this.released = false;
    this.marked = null;
    this.ring = null;
    this.t = 0;

    // The people of the tent. Each starts at the door and walks to a place of the row in front of
    // the tent, which faces the stones.
    const door = tentPoint(tent, TWIN_CAMP.door[0] + 0.6, TWIN_CAMP.door[1]);
    home.forEach((c, i) => {
      const dz = (i - (home.length - 1) / 2) * STAND_DZ;
      const to = tentPoint(tent, STAND_X + (i % 2) * 0.5, dz);
      const mesh = personMesh(this.mats, false);
      mesh.visible = false;
      this.group.add(mesh);
      this.people.push({ name: c.name, role: c.role, end: 'home', mesh, from: door, to, delay: i * GAP, walked: 0, state: 'inside' });
    });

    // The people of the chorus stand in the herd: at the anchor of a group of the herd, a little off
    // it, or near the tent when the patch holds no anchor.
    const anchors = (src.herd && src.herd.length) ? src.herd : [[tent.x, tent.z]];
    chorus.forEach((c, i) => {
      const a = anchors[i % anchors.length];
      const ang = i * 2.4;
      const at = { x: a[0] + Math.cos(ang) * 3, z: a[1] + Math.sin(ang) * 3 };
      const mesh = personMesh(this.mats, true);
      this.group.add(mesh);
      this.people.push({ name: c.name, role: c.role, end: 'changed', mesh, from: at, to: at, delay: 0, walked: 1, state: 'standing', sway: ang });
      this._place(this.people[this.people.length - 1], at, ang);
    });
  }

  // The reader has read the third log. The people of the tent come out: with `walk` each steps out
  // of the door in turn and walks to the row; without it each stands in the row at once, for a
  // landing after the read.
  release(walk = true) {
    if (this.released) return;
    this.released = true;
    this.t0 = null;
    for (const p of this.people) {
      if (p.end !== 'home') continue;
      p.mesh.visible = !walk;
      p.state = walk ? 'waiting' : 'standing';
      if (!walk) this._place(p, p.to, Math.atan2(p.to.x - p.from.x, p.to.z - p.from.z));
    }
  }

  // The people the page can talk to: the people who stand where the reader can see them.
  get standing() {
    return this.people.filter((p) => p.mesh.visible);
  }

  _place(p, at, yaw) {
    const y = this.heightAt(at.x, at.z);
    p.mesh.position.set(at.x, y, at.z);
    if (yaw != null) p.mesh.rotation.y = yaw;
    p.at = { x: at.x, z: at.z };
  }

  // One frame. `camera` turns a person who stands toward the probe, so the person looks at the reader.
  update(t, dt, camera) {
    this.t = t;
    if (this.released && this.t0 == null) this.t0 = t;
    for (const p of this.people) {
      const u = p.mesh.userData;
      if (p.state === 'waiting' && t - this.t0 >= p.delay) { p.state = 'walking'; p.mesh.visible = true; p.walked = 0; }
      if (p.state === 'walking') {
        const dx = p.to.x - p.from.x, dz = p.to.z - p.from.z;
        const len = Math.hypot(dx, dz) || 1;
        p.walked = Math.min(len, p.walked + WALK * dt);
        const k = p.walked / len;
        this._place(p, { x: p.from.x + dx * k, z: p.from.z + dz * k }, Math.atan2(dx, dz));
        const swing = Math.sin(t * STEP_HZ * Math.PI * 2) * 0.55;
        u.legs[0].rotation.x = swing; u.legs[1].rotation.x = -swing;
        u.arms[0].rotation.x = -swing * 0.8; u.arms[1].rotation.x = swing * 0.8;
        if (p.walked >= len) {
          p.state = 'standing';
          for (const l of [...u.legs, ...u.arms]) l.rotation.x = 0;
        }
        continue;
      }
      if (p.state !== 'standing' || !p.mesh.visible) continue;
      // Stand, breathe, and face the probe. A person of the chorus sways with the herd.
      if (camera) {
        const want = Math.atan2(camera.position.x - p.mesh.position.x, camera.position.z - p.mesh.position.z);
        let d = want - p.mesh.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        p.mesh.rotation.y += Math.max(-TURN * dt, Math.min(TURN * dt, d));
      }
      const breath = Math.sin(t * 1.3 + (p.sway || 0)) * 0.05;
      u.arms[0].rotation.z = -0.06 - breath; u.arms[1].rotation.z = 0.06 + breath;
      if (p.end === 'changed') p.mesh.rotation.z = Math.sin(t * 0.7 + p.sway) * 0.06;
    }
    if (this.ring && this.marked) {
      const p = this.people.find((q) => q.name === this.marked);
      if (p) this.ring.position.set(p.mesh.position.x, p.mesh.position.y + 0.08, p.mesh.position.z);
    }
  }

  // The person under a point of the screen, or null: a ray against a ball round the chest of each
  // person who stands in sight. A person is thin, so the ball is wider than the body.
  pickAt(nx, ny, camera) {
    _ndc.set(nx, ny);
    _ray.setFromCamera(_ndc, camera);
    let best = null;
    for (const p of this.standing) {
      _s.center.set(p.mesh.position.x, p.mesh.position.y + TALL * 0.55, p.mesh.position.z);
      _s.radius = PICK_R;
      const hit = _ray.ray.intersectSphere(_s, _v);
      if (!hit) continue;
      const dist = camera.position.distanceTo(hit);
      if (!best || dist < best.dist) best = { name: p.name, point: _s.center.clone(), dist };
    }
    return best;
  }

  // The mark: a ring on the ground under the person.
  mark(name, color = '#ffffff') {
    if (!this.ring) {
      const geo = new THREE.RingGeometry(RING_R * 0.82, RING_R, 32);
      geo.rotateX(-Math.PI / 2);
      this.ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: new THREE.Color(color), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
      }));
      this.ring.renderOrder = 2;
      this.ring.frustumCulled = false;
      this.group.add(this.ring);
    }
    this.marked = name;
    this.ring.visible = true;
  }

  unmark() {
    this.marked = null;
    if (this.ring) this.ring.visible = false;
  }

  // The way home, `k` from 0 to 1: the people of the tent rise in the light of the stones and grow
  // small, and at the end they are gone. The page drives it on the frames of the way home.
  lift(k) {
    this.unmark();
    for (const p of this.people) {
      if (p.end !== 'home' || !p.at) continue;
      p.state = 'lifting';
      const e = k * k;
      p.mesh.visible = k < 0.98;
      p.mesh.position.y = this.heightAt(p.at.x, p.at.z) + e * 26;
      p.mesh.rotation.y += 0.05;
      p.mesh.scale.setScalar((TALL / 1.84) * (1 - 0.7 * e));
    }
  }

  dispose() {
    const geos = new Set();
    this.group.traverse((o) => { if (o.geometry) geos.add(o.geometry); });
    geos.forEach((g) => g.dispose());
    Object.values(this.mats).forEach((m) => m.dispose());
    if (this.ring) this.ring.material.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group.clear();
    this.people = [];
  }
}
