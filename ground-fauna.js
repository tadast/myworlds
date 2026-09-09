// myworlds — the animals on the ground.
//
// From orbit an animal is a speck on a miniature. On the ground it is a body at its lore size,
// and it walks with the others of its kind. The sociality gene says how many walk together and how
// wide they spread; see docs/fauna.md, "Ground tier".
//
// The worker gives one anchor per group and one offset per member. This file gives each anchor a
// mover, and each member follows its anchor. The anchor is not drawn. One animal of the group can
// stop, but the group stops together, because the whole group reads the activity of the anchor.
//
// Ground frame: x east, y up, z south. One unit is one metre.
import * as THREE from 'three';
import { buildCreature, faunaMaterial, makeMover, stepMover, moverActivity, hopGait, hopBurst } from './fauna.js';

export const LEASH = [60, 200];        // metres: how far a group roams from its anchor
export const AIR_HOVER = [12, 40];     // metres above the ground for an air group
export const MPS_PER_UNIT = 200;       // metres per second for one unit of G.move.speed
export const SPEED_M = [0.5, 6];       // metres per second: a grazer, and a runner
const TURN_GAIN = 0.22;      // the globe turn rates are for a 0.03 unit leash; the ground leash is wider
const MEMBER_EASE = 1.2;     // 1/s: how fast a member closes on its place in the formation
const MEMBER_WOBBLE = 0.18;  // the wobble of a member, as a part of the formation radius
const TRAIL_LEN = 64;        // samples of the anchor path, for the species that follow it with a lag
const TRAIL_STEP = 0.1;      // seconds between two samples of the path
const WATER_MARGIN = 0.5;    // metres above sea level a walker keeps
const PICK_TOL = 34;         // pixels: how near a tap must come to a creature

const HALF_PI = Math.PI / 2;
const _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _rgt = new THREE.Vector3();
const _pos = new THREE.Vector3(), _mat = new THREE.Matrix4();
const _pw = new THREE.Vector3(), _pb = new THREE.Vector3();
const _pv = new THREE.Vector3(), _pt = new THREE.Vector3(), _pm = new THREE.Matrix4();
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// The same generator ground-sky.js uses. Every file that needs one keeps a copy.
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

// The scale that makes the geometry of a species as large as its lore says.
// bodyMetres() gives the number and the axis; the bounding box gives the extent the number must
// match. A height measures along y, a length along z, because a creature faces +z in its own frame.
export function metreScale(G, geo) {
  const B = self.Species ? self.Species.bodyMetres(G) : null;
  if (!B) { console.warn('[myworlds] species.js is not on the page: the ground cannot scale a creature'); return 1; }
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const extent = B.axis === 'height' ? b.max.y - b.min.y : b.max.z - b.min.z;
  return extent > 1e-6 ? B.metres / extent : 1;
}

// The steering numbers of a species in metres. The globe moves an animal in globe units over a
// leash of about 0.03 units. The ground leash is thousands of times wider, so the turn rate must
// come down with it, or the animal would wind in circles instead of crossing its range.
export function groundMove(G) {
  const mv = G.move;
  if (mv.leash <= 0) return { ...mv, leash: 0, speed: 0 };   // an arch and a periscope never travel
  return {
    leash: clamp(60 + mv.leash * 2200, LEASH[0], LEASH[1]),
    speed: clamp(mv.speed * MPS_PER_UNIT, SPEED_M[0], SPEED_M[1]),
    turn: mv.turn * TURN_GAIN,
    pause: mv.pause, flies: mv.flies, shadow: mv.shadow,
  };
}

export class GroundFauna {
  // heightAt(x, z) gives the elevation in metres. onInspect(kind) opens the inspector card.
  constructor({ result, world, tier, heightAt, camera, canvas, onInspect }) {
    this.world = world;
    this.tier = tier;
    this.heightAt = heightAt;
    this.camera = camera;
    this.canvas = canvas;
    this.onInspect = onInspect || null;
    this.group = new THREE.Group();
    this.kinds = [];        // one entry per species drawn: { G, inst, mat, scale }
    this.groups = [];       // one entry per anchor
    this.members = [];      // one entry per animal
    this.count = 0;
    this.stepMs = 0;
    this._down = null;

    const patch = result && result.patch;
    const gs = result && result.groups, ms = result && result.members;
    this.limit = (patch ? patch.size : 1500) / 2 - 30;
    if (!patch || !gs || !gs.length || !ms || !ms.length) return;

    const rng = mulberry32(hashSeed(`${patch.patchSeed}|ground-fauna`));
    this._build(patch, gs, ms, rng);
    // Issue 06 owns the ground click. ground.js reads pickHit() through its seam, so this file
    // binds no listener of its own: two listeners would open the card before the glide ran.
  }

  // ---------------------------------------------------------------- the build
  _build(patch, gs, ms, rng) {
    const species = this.world.species || [];
    const pal = this.world.palette;

    // one instanced mesh per species, with room for every member of every group of that species
    const perKind = new Map();
    for (let i = 0; i < ms.length; i += 4) {
      const k = gs[ms[i] * 6 + 2];
      perKind.set(k, (perKind.get(k) || 0) + 1);
    }
    const byKind = new Map();
    for (const [k, n] of perKind) {
      const G = species[k];
      if (!G) continue;
      const geo = buildCreature(G, pal, pal.flora);
      const scale = metreScale(G, geo);
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      geo.setAttribute('aMove', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1).setUsage(THREE.DynamicDrawUsage));
      const mat = faunaMaterial(G);
      const inst = new THREE.InstancedMesh(geo, mat, n);
      inst.userData.kind = k;
      inst.frustumCulled = false;     // the animals move every frame, so the bounding sphere is stale
      inst.castShadow = !!this.tier.shadows && G.move.shadow;
      inst.receiveShadow = !!this.tier.shadows;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const entry = { G, inst, mat, scale, next: 0 };
      byKind.set(k, entry);
      this.kinds.push(entry);
      this.group.add(inst);
    }

    // the anchors: one mover each, in metres
    for (let i = 0; i < gs.length; i += 6) {
      const o = i;
      const G = species[gs[o + 2]];
      const entry = G && byKind.get(gs[o + 2]);
      if (!entry) { this.groups.push(null); continue; }
      const flies = G.cls === 'air';
      const mv = groundMove(G);
      const st = makeMover(rng, mv);
      const g = {
        G, entry, flies, mover: st, phase: gs[o + 5],
        x0: gs[o], z0: gs[o + 1], x: gs[o], z: gs[o + 1],
        spread: gs[o + 4], heading: st.heading, act: flies ? 1 : 0,
        hover: flies ? AIR_HOVER[0] + rng() * (AIR_HOVER[1] - AIR_HOVER[0]) : 0,
        // a serpent and a plough read as a chain only when the body behind follows the way in front
        lag: G.loco === 'serpent' || G.loco === 'plough',
        trail: new Float32Array(TRAIL_LEN * 3), ti: 0, tAcc: 0, n: 0,
      };
      g.lagSteps = Math.max(1, Math.round((g.spread / Math.max(mv.speed, 0.3)) / TRAIL_STEP / Math.max(gs[o + 3], 2)));
      if (G.loco === 'monopod') g.hop = hopGait(G);   // a hopper covers ground only while it is in the air
      for (let k = 0; k < TRAIL_LEN; k++) { g.trail[k * 3] = g.x; g.trail[k * 3 + 1] = g.z; g.trail[k * 3 + 2] = g.heading; }
      this.groups.push(g);
    }

    // the members: a place in the formation, a phase, and a slot in the instanced mesh
    for (let i = 0; i < ms.length; i += 4) {
      const g = this.groups[ms[i]];
      if (!g) continue;
      const e = g.entry, j = e.next++;
      e.inst.geometry.attributes.aPhase.setX(j, ms[i + 3]);
      const m = {
        g, inst: e.inst, j, i: g.n++, scale: e.scale,
        dx: ms[i + 1], dz: ms[i + 2], phase: ms[i + 3],
        x: g.x + ms[i + 1], z: g.z + ms[i + 2], heading: g.heading,
        wob: Math.max(0.4, g.spread * MEMBER_WOBBLE),
        f1: 0.11 + rng() * 0.2, p1: rng() * 6.28, f2: 0.09 + rng() * 0.18, p2: rng() * 6.28,
      };
      this.members.push(m);
      this.count++;
    }
    for (const e of this.kinds) e.inst.geometry.attributes.aPhase.needsUpdate = true;
    this.update(0, 0);      // put every animal on the ground before the first frame is drawn
  }

  // ---------------------------------------------------------------- the step
  update(t, dt) {
    if (!this.members.length) return;
    const t0 = performance.now();
    for (const g of this.groups) if (g) this._stepGroup(g, t, dt);
    for (const m of this.members) this._stepMember(m, t, dt);
    for (const e of this.kinds) {
      e.inst.instanceMatrix.needsUpdate = true;
      e.inst.geometry.attributes.aMove.needsUpdate = true;
      if (e.mat.userData.shader) e.mat.userData.shader.uniforms.uTime.value = t;
    }
    const ms = performance.now() - t0;
    this.stepMs = this.stepMs ? this.stepMs * 0.9 + ms * 0.1 : ms;
  }

  // One anchor. It is not drawn: it carries the group and the activity of the group.
  _stepGroup(g, t, dt) {
    const st = g.mover;
    const pu = st.u, pv = st.v;
    stepMover(st, t, dt, g.hop ? hopBurst(g.hop, t, g.phase) : 1);
    let x = g.x0 + st.u, z = g.z0 + st.v;
    const lim = this.limit;
    // a walker turns away from the water and from the edge of the patch; a flyer only from the edge
    const blocked = Math.abs(x) > lim || Math.abs(z) > lim
      || (!g.flies && this.heightAt(x, z) < WATER_MARGIN);
    if (blocked) {
      st.u = pu; st.v = pv; st.heading += Math.PI * 0.75; st.spd = 0;
      x = g.x0 + st.u; z = g.z0 + st.v;
    }
    g.x = x; g.z = z; g.heading = st.heading;
    g.act = g.flies ? 1 : moverActivity(st);
    if (!g.lag) return;
    g.tAcc += dt;
    while (g.tAcc >= TRAIL_STEP) {
      g.tAcc -= TRAIL_STEP;
      g.ti = (g.ti + 1) % TRAIL_LEN;
      g.trail[g.ti * 3] = x; g.trail[g.ti * 3 + 1] = z; g.trail[g.ti * 3 + 2] = st.heading;
    }
  }

  // One animal. It holds its place in the formation, but on a short leash: it eases toward the
  // place instead of snapping to it, and it breathes on its own two oscillators.
  _stepMember(m, t, dt) {
    const g = m.g;
    let tx, tz;
    if (g.lag) {
      const back = Math.min(TRAIL_LEN - 1, m.i * g.lagSteps);
      const k = ((g.ti - back) % TRAIL_LEN + TRAIL_LEN) % TRAIL_LEN;
      const th = g.trail[k * 3 + 2];
      tx = g.trail[k * 3] + Math.cos(th + HALF_PI) * m.dx * 0.35;
      tz = g.trail[k * 3 + 1] + Math.sin(th + HALF_PI) * m.dx * 0.35;
    } else {
      // the formation turns with the anchor, so the herd keeps its shape through a turn
      const c = Math.cos(g.heading), s = Math.sin(g.heading);
      tx = g.x + m.dx * c - m.dz * s;
      tz = g.z + m.dx * s + m.dz * c;
      tx += Math.sin(t * m.f1 + m.p1) * m.wob;
      tz += Math.cos(t * m.f2 + m.p2) * m.wob;
    }
    const k = dt > 0 ? 1 - Math.exp(-MEMBER_EASE * dt) : 1;
    const nx = m.x + (tx - m.x) * k, nz = m.z + (tz - m.z) * k;
    const vx = nx - m.x, vz = nz - m.z;
    m.x = nx; m.z = nz;
    // it turns to face the way it travels, and it holds its heading while it stands still
    if (vx * vx + vz * vz > 1e-6) {
      const want = Math.atan2(vz, vx);
      m.heading += wrapAngle(want - m.heading) * (dt > 0 ? Math.min(1, dt * 3) : 1);
    }

    const gh = this.heightAt(nx, nz);
    // a flyer holds its height above the ground under it, so it clears a hill
    const y = g.flies ? Math.max(gh, 0) + g.hover : gh;
    if (g.flies) _up.set(0, 1, 0);
    else {
      // it stands on the slope: the up vector is the normal of the terrain under its feet
      const e = 2;
      _up.set(this.heightAt(nx - e, nz) - this.heightAt(nx + e, nz), 2 * e,
        this.heightAt(nx, nz - e) - this.heightAt(nx, nz + e)).normalize();
    }
    _fwd.set(Math.cos(m.heading), 0, Math.sin(m.heading));
    _fwd.addScaledVector(_up, -_fwd.dot(_up)).normalize();
    _rgt.crossVectors(_up, _fwd).normalize();
    const s = m.scale;
    _mat.makeBasis(_rgt.multiplyScalar(s), _up.multiplyScalar(s), _fwd.multiplyScalar(s));
    _mat.setPosition(_pos.set(nx, y, nz));
    m.inst.setMatrixAt(m.j, _mat);
    m.inst.geometry.attributes.aMove.setX(m.j, g.act);
  }

  // ---------------------------------------------------------------- the inspector click
  // Issue 06 owns the ground click. ground.js calls pickHit() through its seam, glides to the
  // animal, and then opens the card. This file binds no listener of its own.

  // The species under a screen point, or null. The same measure creatureAt() uses on the globe:
  // project the base and a point one body up, then take the distance to that segment. The globe
  // test drops an animal on the far side of the planet; on the ground the frustum does that.
  pickAt(px, py, tolerance = PICK_TOL) {
    const hit = this.pickHit(px, py, tolerance);
    return hit ? hit.kind : null;
  }

  // The creature under a screen point, with the world point to glide to, or null.
  pickHit(px, py, tolerance = PICK_TOL) {
    const cam = this.camera;
    if (!cam || !this.members.length) return null;
    const el = this.canvas, w = el ? el.clientWidth : 1, h = el ? el.clientHeight : 1;
    let best = null, bestD = tolerance;
    for (const e of this.kinds) e.inst.updateWorldMatrix(true, false);
    for (const m of this.members) {
      m.inst.getMatrixAt(m.j, _pm);
      _pv.setFromMatrixPosition(_pm).applyMatrix4(m.inst.matrixWorld);
      const up = Math.hypot(_pm.elements[4], _pm.elements[5], _pm.elements[6]);
      _pt.set(_pv.x, _pv.y + up * 1.1, _pv.z);
      _pw.copy(_pv);                       // the world point, before project() overwrites it
      _pv.project(cam); _pt.project(cam);
      if (_pv.z > 1) continue;
      const ax = (_pv.x + 1) / 2 * w, ay = (1 - _pv.y) / 2 * h;
      const bx = (_pt.x + 1) / 2 * w, by = (1 - _pt.y) / 2 * h;
      const lx = bx - ax, ly = by - ay, ll = lx * lx + ly * ly || 1;
      const u = clamp(((px - ax) * lx + (py - ay) * ly) / ll, 0, 1);
      const d = Math.hypot(ax + lx * u - px, ay + ly * u - py) - Math.sqrt(ll) * 0.25;
      if (d < bestD) { bestD = d; best = { kind: m.inst.userData.kind, point: _pb.copy(_pw).clone() }; }
    }
    return best;
  }

  dispose() {
    for (const e of this.kinds) { e.inst.geometry.dispose(); e.mat.dispose(); }
    this.group.clear();
    this.kinds = []; this.groups = []; this.members = []; this.count = 0;
  }
}
