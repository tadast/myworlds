// myworlds — the animals on the ground.
//
// From orbit an animal is a speck on a miniature. On the ground it is a body at its lore size,
// and it walks with the others of its kind. The sociality gene says how many walk together and how
// wide they spread; see docs/fauna.md, "Ground tier".
//
// The worker gives one anchor per group and one offset per member. This file gives each anchor a
// mover, and each member follows its anchor. The anchor is not drawn. One animal of the group can
// stop, but the group stops together, because every speed in the group comes from the one anchor.
//
// Each animal keeps its own gait clock, and the clock runs off the ground the animal covers, not
// off the wall clock. A foot on the ground then holds its place while the body passes over it, so
// no animal skids. Each animal also keeps its own turn, so it leans into a curve, shortens the
// stride of its inside legs, and never turns tighter than the circle its body can walk.
//
// A flyer is a special case, because nothing in the sky gives it a size. Issue 17 keeps its full
// mesh AIR_LOD times farther out than a walker, holds it at AIR_MIN_PX pixels across so it reads as
// a body and not as a speck, and lays a soft shadow of it on the ground. The shadow is the cue: the
// reader watches the grass, a patch of shade slides over it, and the head goes up.
//
// A species draws at two levels of detail, as the flora does in ground-flora.js. An animal closer
// to the camera than ground.lod.distance goes to the near mesh, which is the full creature. An
// animal past it goes to the far mesh, which is the coarse creature of under 80 triangles. One
// walk per frame reads the distance of every animal and writes it to one of the two meshes, with
// a band of 10% around the LOD distance, so an animal at the boundary cannot flicker. Both meshes
// share one material, so one shader animates both and the graphics card compiles one program.
//
// Ground frame: x east, y up, z south. One unit is one metre.
import * as THREE from 'three';
import { buildCreature, faunaMaterial, makeMover, stepMover, moverActivity, speedActivity, turnCap, turnLean, makeGait, stepGait, gaitLocked, hopGait, hopBurst } from './fauna.js';

export const LEASH = [60, 200];        // metres: how far a group roams from its anchor
export const AIR_HOVER = [12, 40];     // metres above the ground for an air group
export const MPS_PER_UNIT = 200;       // metres per second for one unit of G.move.speed
export const SPEED_M = [0.5, 6];       // metres per second: a grazer, and a runner
const TURN_GAIN = 0.22;      // the globe turn rates are for a 0.03 unit leash; the ground leash is wider
const MEMBER_EASE = 1.2;     // 1/s: how fast a member closes on its place in the formation
const MEMBER_WOBBLE = 0.18;  // the wobble of a member, as a part of the formation radius
const WOBBLE_SPEED = 0.35;   // the wobble may not carry a member faster than this part of its cruise
const MEMBER_RUSH = 1.35;    // the fastest a member may travel, as a part of its cruise speed
const HEADING_EASE = 3;      // 1/s: how fast a member turns toward the way it travels
const SPEED_EASE = 6;        // 1/s: the low pass on the measured speed of a member
const TURN_RADIUS = 1.3;     // the tightest circle an animal can walk, in body lengths
const TRAIL_LEN = 64;        // samples of the anchor path, for the species that follow it with a lag
const TRAIL_STEP = 0.1;      // seconds between two samples of the path
const WATER_MARGIN = 0.5;    // metres above sea level a walker keeps
// ---------------------------------------------------------------- the flyer, issue 17
// A walker has the ground, a plant, and its own herd beside it, so the reader reads its size from
// them. A flyer hangs in an empty sky 100 m away and it is the one thing up there the reader looks
// at, so a coarse body of 80 triangles reads as a fault and a body of two pixels reads as dust.
// An air group holds one animal, so both rules cost almost nothing.
const AIR_LOD = 2.5;         // a flyer keeps its full mesh this many LOD distances out
const AIR_MIN_PX = 11;       // pixels: the narrowest a flyer may draw across its body
const AIR_GROW = 3;          // the most a flyer may grow to reach that width
const AIR_BOB = 1.4;         // metres: the rise and fall of a flyer on its own slow breath
const AIR_BOB_HZ = 0.06;     // turns per second of that breath
// The shadow of a flyer: one soft disc on the ground under it, at the slant of the sun. It spreads
// and it fades as the flyer climbs, as a real shadow does.
const SHADE_LIFT = 0.3;      // metres: the disc floats this far over the terrain, to clear it
const SHADE_SPREAD = 1.9;    // how wide the disc grows over the body, at the top of AIR_HOVER
const SHADE_CAST = 2.6;      // the longest the sun may throw the disc, in heights of the flyer
const SHADE_MIN = 1.3;       // metres: the smallest radius a disc takes, so a small flyer marks too
const SHADE_DARK = 0.55;     // the alpha of the disc at the bottom of AIR_HOVER
const SHADE_FADE = 0.45;     // the part of that alpha the disc keeps at the top of AIR_HOVER
const SHADE_RINGS = 4;       // rings of the disc: more rings make a softer edge
const SHADE_SEG = 20;        // segments around the disc
const PICK_TOL = 34;         // pixels: how near a tap must come to a creature
// The mark: one ring on the ground under the animal the reader tapped. The tap no longer opens
// the card. It marks the animal, the app offers the card on the floating button, and the ring
// says which animal the button means. The ring follows the animal, so a herd that walks on
// cannot carry the mark away from the reader unseen. Under a flyer it lies on the ground, beside
// the shadow disc, so it floats a little higher than SHADE_LIFT and draws after it.
const RING_LIFT = 0.4;       // metres: the ring floats this far over the terrain
const RING_MIN = 1.4;        // metres: the smallest radius the ring takes, so a small animal marks too
const RING_BAND = 0.16;      // the part of the radius the band of the ring covers
const RING_SIZE = 0.75;      // the radius of the ring, in body widths of the animal
const HYSTERESIS = 0.05;     // ±5% around the LOD distance: a band of 10%, as ground-flora.js uses
const DEFAULT_LOD = { distance: 150 };   // the fallback when no owner passes its lod knob

const HALF_PI = Math.PI / 2;
const _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _rgt = new THREE.Vector3();
const _pos = new THREE.Vector3(), _mat = new THREE.Matrix4();
const _pw = new THREE.Vector3(), _pb = new THREE.Vector3();
const _pv = new THREE.Vector3(), _pt = new THREE.Vector3();
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
  if (mv.leash <= 0) return { ...mv, leash: 0, speed: 0, turnR: 0 };   // an arch and a periscope never travel
  return {
    leash: clamp(60 + mv.leash * 2200, LEASH[0], LEASH[1]),
    speed: clamp(mv.speed * MPS_PER_UNIT, SPEED_M[0], SPEED_M[1]),
    turn: mv.turn * TURN_GAIN,
    turnR: turnRadius(G),
    pause: mv.pause, flies: mv.flies, shadow: mv.shadow,
  };
}

// The tightest circle an animal can walk, in metres. A body cannot pivot on the spot and slide
// sideways out of it: a long animal turns wide, and a turn tighter than this asks it to slow down.
// A flyer banks round a wider circle still, because it cannot stop in the air.
export function turnRadius(G) {
  const B = self.Species ? self.Species.bodyMetres(G) : null;
  const m = B ? B.metres : 3;
  return Math.max(2, m * TURN_RADIUS * (G.cls === 'air' ? 3 : 1));
}

export class GroundFauna {
  // heightAt(x, z) gives the elevation in metres.
  // lod is the shared LOD knob of the ground: { distance, min, max } in metres.
  // sunDir is the direction of the sun in the ground frame, and night is 0 by day and 1 at night.
  // The shadow of a flyer reads both: it falls opposite the sun, and it fades out after sundown.
  constructor({ result, world, tier, heightAt, camera, canvas, lod, sunDir, night }) {
    this.world = world;
    this.tier = tier;
    this.heightAt = heightAt;
    this.camera = camera;
    this.canvas = canvas;
    this.lod = lod || DEFAULT_LOD;
    this.group = new THREE.Group();
    this.kinds = [];        // one entry per species drawn: { G, kind, near, far, mat, scale }
    this.groups = [];       // one entry per anchor
    this.members = [];      // one entry per animal
    this.count = 0;
    this.nearCount = 0;     // animals drawn as full meshes this frame
    this.farCount = 0;      // animals drawn as coarse meshes this frame
    this.stepMs = 0;
    this._down = null;
    // the mark: the member under the ring, or null, and the ring mesh once one animal was marked
    this.marked = null;
    this.ring = null;
    // the shadow of a flyer: one instanced disc, one instance per air animal. See _buildShade().
    this.shade = null;
    this.shadeCount = 0;
    this._sun = (sunDir ? sunDir.clone() : new THREE.Vector3(1, 0.55, 0.8)).normalize();
    this._night = night || 0;
    this._pxPerM = 0;

    const patch = result && result.patch;
    const gs = result && result.groups, ms = result && result.members;
    this.limit = (patch ? patch.size : 1500) / 2 - 30;
    if (!patch || !gs || !gs.length || !ms || !ms.length) return;

    const rng = mulberry32(hashSeed(`${patch.patchSeed}|ground-fauna`));
    this._build(patch, gs, ms, rng);
    // Issue 06 owns the ground click. ground.js reads pickHit() through its seam, so this file
    // binds no listener of its own: two listeners would open the card before the glide ran.
  }

  // One instanced mesh with room for every member of a species. The walk sets count every frame.
  _mesh(geo, mat, n, casts) {
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aMove', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1).setUsage(THREE.DynamicDrawUsage));
    // the gait clock and the turn of each animal; the walk writes both every frame
    geo.setAttribute('aGait', new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aTurn', new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    const inst = new THREE.InstancedMesh(geo, mat, n);
    inst.frustumCulled = false;     // the animals move every frame, so the bounding sphere is stale
    inst.castShadow = casts;
    inst.receiveShadow = !!this.tier.shadows;
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.count = 0;
    return inst;
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
      const full = buildCreature(G, pal, pal.flora);
      const coarse = buildCreature(G, pal, pal.flora, 'coarse');
      // One scale for both levels of detail, measured on the full creature. The lore size is the
      // size of the near mesh, and the far mesh must match it or the swap would jump.
      const scale = metreScale(G, full);
      // Both meshes share the material, so the shader compiles once and one uTime drives both.
      const mat = faunaMaterial(G);
      const near = this._mesh(full, mat, n, !!this.tier.shadows && G.move.shadow);
      // A far mesh never casts. It holds no real shape, and the sun only casts at all while the
      // camera is under the LOD distance, where every animal near the reader is a near mesh.
      const far = this._mesh(coarse, mat, n, false);
      // The width of the body in metres. The screen test of a flyer and the disc of its shadow both
      // read it. metreScale() left the bounding box on the geometry, so this costs nothing.
      const b = full.boundingBox;
      const widthM = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * scale;
      const entry = {
        G, kind: k, near, far, mat, scale, widthM,
        nearN: 0, farN: 0, phaseDirty: true,
        // the gait clock of this species, and the tightest circle it walks
        locked: gaitLocked(G), turnR: turnRadius(G), hipY: full.userData.hipY || 0,
        tris: { full: full.attributes.position.count / 3, coarse: coarse.attributes.position.count / 3 },
      };
      byKind.set(k, entry);
      this.kinds.push(entry);
      this.group.add(near);
      this.group.add(far);
    }
    // the triangle budget of the coarse build, per species, as the issue asks
    if (this.kinds.length) {
      console.info('[myworlds] ground fauna triangles per creature: '
        + this.kinds.map((e) => `${e.G.lore.name} ${e.tris.coarse} coarse / ${e.tris.full} full`).join(', '));
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
        bob: flies ? rng() * 6.28 : 0,      // the phase of its breath, so no two flyers rise together
        // a serpent and a plough read as a chain only when the body behind follows the way in front
        lag: G.loco === 'serpent' || G.loco === 'plough',
        trail: new Float32Array(TRAIL_LEN * 3), ti: 0, tAcc: 0, n: 0,
      };
      g.lagSteps = Math.max(1, Math.round((g.spread / Math.max(mv.speed, 0.3)) / TRAIL_STEP / Math.max(gs[o + 3], 2)));
      if (G.loco === 'monopod') g.hop = hopGait(G);   // a hopper covers ground only while it is in the air
      for (let k = 0; k < TRAIL_LEN; k++) { g.trail[k * 3] = g.x; g.trail[k * 3 + 1] = g.z; g.trail[k * 3 + 2] = g.heading; }
      this.groups.push(g);
    }

    // the members: a place in the formation, a phase, and a level of detail
    for (let i = 0; i < ms.length; i += 4) {
      const g = this.groups[ms[i]];
      if (!g) continue;
      const e = g.entry;
      const top = Math.max(g.mover.speed, 0.01);
      const f1 = 0.11 + rng() * 0.2, f2 = 0.09 + rng() * 0.18;
      // The wobble is a real drift over the ground, and the legs have to carry the animal through
      // it, so it may not run faster than a part of the cruise speed. A wide formation used to give
      // a wobble that carried a member as fast as it walks, and it walked its whole range sideways.
      const wob = Math.min(Math.max(0.4, g.spread * MEMBER_WOBBLE), (WOBBLE_SPEED * top) / Math.max(f1, f2));
      const m = {
        g, e, i: g.n++, scale: e.scale, top,
        dx: ms[i + 1], dz: ms[i + 2], phase: ms[i + 3],
        x: g.x + ms[i + 1], z: g.z + ms[i + 2], heading: g.heading,
        wob, f1, p1: rng() * 6.28, f2, p2: rng() * 6.28,
        // its own speed, its own gait clock, and its own turn: a member does not travel at the
        // speed of the anchor, and a leg that swings at the speed of the anchor slides.
        spd: 0, turn: 0, gait: e.locked ? makeGait(g.G, e.scale, top * MEMBER_RUSH, e.hipY) : null,
        // the level of detail: 0 near, 1 far. The slot in that mesh is set by the walk.
        far: 1, mesh: null, slot: -1, px: 0, py: 0, pz: 0,
        // Issue 17: the scale the walk drew it at, which a far flyer grows, and its slot in the
        // shade mesh. The pick reads the drawn scale, so a grown flyer is as easy to tap as it
        // looks. A walker keeps its own scale and takes no shadow disc.
        drawScale: e.scale, shade: g.flies ? this.shadeCount++ : -1,
      };
      this.members.push(m);
      this.count++;
    }
    if (this.shadeCount) this._buildShade();
    this.update(0, 0);      // put every animal on the ground before the first frame is drawn
  }

  // ---------------------------------------------------------------- the shadow of a flyer
  // A soft disc on the ground under each flyer, at the slant of the sun. It is a cue, not a
  // simulation: a reader who watches the grass sees a patch of shade cross it, and looks up. The
  // real shadow map cannot do this work. It only draws while the camera is under the LOD distance,
  // and a flyer at that range is a far mesh that casts nothing.
  //
  // The disc is a fan of rings in the xz plane, so the instance basis lays it on the terrain. The
  // alpha falls off over the rings, which is a soft edge for the price of 140 triangles.
  _buildShade() {
    const seg = SHADE_SEG, rings = SHADE_RINGS;
    const pos = [], col = [], idx = [];
    const push = (x, z, a) => { pos.push(x, 0, z); col.push(1, 1, 1, a); };
    push(0, 0, 1);
    for (let r = 1; r <= rings; r++) {
      const rad = r / rings;
      const a = Math.pow(1 - rad, 1.6);
      for (let i = 0; i < seg; i++) {
        const th = (i / seg) * Math.PI * 2;
        push(Math.cos(th) * rad, Math.sin(th) * rad, a);
      }
    }
    for (let i = 0; i < seg; i++) idx.push(0, 1 + i, 1 + ((i + 1) % seg));
    for (let r = 1; r < rings; r++) {
      const a0 = 1 + (r - 1) * seg, b0 = 1 + r * seg;
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        idx.push(a0 + i, b0 + i, b0 + j, a0 + i, b0 + j, a0 + j);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // four components, so three.js reads the fourth as the alpha of the vertex
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.setIndex(idx);
    // The disc darkens the ground it lies on, so it takes the ground colour of the palette at a
    // quarter of its lightness. A black disc reads as a sticker on any ground but grey rock.
    const pal = this.world.palette || {};
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(pal.ground || '#6f8a52').multiplyScalar(0.26),
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    // One float per disc for its strength, so a flyer high up throws a weak shadow and one near
    // the treetops throws a hard one. The alpha of the vertex gives the soft edge, and this gives
    // the depth of the shade, so the two multiply.
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aShade; varying float vShade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vShade = aShade;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vShade;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vShade;');
    };
    geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(new Float32Array(this.shadeCount), 1).setUsage(THREE.DynamicDrawUsage));
    const inst = new THREE.InstancedMesh(geo, mat, this.shadeCount);
    inst.frustumCulled = false;     // the discs move every frame, so the bounding sphere is stale
    inst.renderOrder = 1;           // after the ground and the grass, so it lies on both
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.count = this.shadeCount;
    this.shade = inst;
    this.shadeMat = mat;
    this.group.add(inst);
  }

  // ---------------------------------------------------------------- the step
  // One pass over the anchors, then one over the animals. The second pass places an animal and
  // sorts it into the near mesh or the far mesh in the same step, so no matrix is written twice.
  update(t, dt) {
    if (!this.members.length) return;
    const t0 = performance.now();
    const c = this.camera ? this.camera.position : null;
    this._cx = c ? c.x : 0; this._cy = c ? c.y : 0; this._cz = c ? c.z : 0;
    const d = this.lod.distance;
    this._in2 = (d * (1 - HYSTERESIS)) ** 2;
    this._out2 = (d * (1 + HYSTERESIS)) ** 2;
    // A flyer holds its full mesh AIR_LOD times farther out than a walker. See AIR_LOD.
    this._airIn2 = this._in2 * AIR_LOD * AIR_LOD;
    this._airOut2 = this._out2 * AIR_LOD * AIR_LOD;
    // Pixels per metre at one metre of distance: the height of the frame over the height the
    // frustum covers there. The width of a body at distance r is then widthM * this / r.
    const el = this.canvas, hPx = el ? el.clientHeight : 0;
    this._pxPerM = hPx && this.camera ? hPx / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) : 0;
    for (const e of this.kinds) { e.nearN = 0; e.farN = 0; }
    for (const g of this.groups) if (g) this._stepGroup(g, t, dt);
    for (const m of this.members) this._stepMember(m, t, dt);
    if (this.marked) this._stepRing();   // the ring follows the animal it marks
    let near = 0, far = 0;
    for (const e of this.kinds) {
      e.near.count = e.nearN; e.far.count = e.farN;
      near += e.nearN; far += e.farN;
      e.near.instanceMatrix.needsUpdate = true;
      e.far.instanceMatrix.needsUpdate = true;
      e.near.geometry.attributes.aMove.needsUpdate = true;
      e.far.geometry.attributes.aMove.needsUpdate = true;
      e.near.geometry.attributes.aGait.needsUpdate = true;
      e.far.geometry.attributes.aGait.needsUpdate = true;
      e.near.geometry.attributes.aTurn.needsUpdate = true;
      e.far.geometry.attributes.aTurn.needsUpdate = true;
      // the phase of an animal only moves when the animal changes its slot, which is rare
      if (e.phaseDirty) {
        e.near.geometry.attributes.aPhase.needsUpdate = true;
        e.far.geometry.attributes.aPhase.needsUpdate = true;
        e.phaseDirty = false;
      }
      if (e.mat.userData.shader) e.mat.userData.shader.uniforms.uTime.value = t;
    }
    if (this.shade) {
      this.shade.instanceMatrix.needsUpdate = true;
      this.shade.geometry.attributes.aShade.needsUpdate = true;
    }
    this.nearCount = near;
    this.farCount = far;
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
  //
  // Its legs read the ground it covers, not the ground its anchor covers. A member closing on the
  // formation, or drifting on its wobble, travels at its own speed, so it keeps its own gait clock
  // and its own turn. The group still stops together, because every speed here comes from the one
  // anchor, and the wobble stops with it.
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
      // the wobble fades out with the activity of the anchor, so a herd at rest stands still
      const wob = m.wob * g.act;
      tx += Math.sin(t * m.f1 + m.p1) * wob;
      tz += Math.cos(t * m.f2 + m.p2) * wob;
    }
    const k = dt > 0 ? 1 - Math.exp(-MEMBER_EASE * dt) : 1;
    let vx = (tx - m.x) * k, vz = (tz - m.z) * k;
    // No animal may travel faster than it can run. The formation turns with the anchor, and a
    // member out on the rim of a wide formation would be swung round at several times its cruise
    // speed, faster than its legs could ever carry it. It falls behind instead, and the formation
    // stretches through the turn and closes again after it.
    let step = Math.sqrt(vx * vx + vz * vz);
    const maxStep = m.top * MEMBER_RUSH * (dt > 0 ? dt : 1);
    if (step > maxStep && step > 1e-9) { const f = maxStep / step; vx *= f; vz *= f; step = maxStep; }
    const nx = m.x + vx, nz = m.z + vz;
    m.x = nx; m.z = nz;
    // the ground it covered this frame, low passed: the gait clock and the leg swing both read it
    const spd = dt > 0 ? step / dt : 0;
    m.spd += (spd - m.spd) * (dt > 0 ? Math.min(1, dt * SPEED_EASE) : 1);
    const act = g.flies ? 1 : speedActivity(m.spd, m.top);
    // It turns to face the way it travels, and it holds its heading while it stands still. The turn
    // is no tighter than the circle its body can walk, so it cannot spin on the spot and slide.
    let rate = 0;
    if (vx * vx + vz * vz > 1e-10) {
      const want = Math.atan2(vz, vx);
      let turn = wrapAngle(want - m.heading) * (dt > 0 ? Math.min(1, dt * HEADING_EASE) : 1);
      const cap = turnCap(m.spd, m.top, m.e.turnR) * (dt > 0 ? dt : 1);
      turn = clamp(turn, -cap, cap);
      m.heading = wrapAngle(m.heading + turn);
      rate = dt > 0 ? turn / dt : 0;
    }
    // the lean, the head, and the stride of the inside legs all read this one number
    const lean = turnLean(m.spd, rate, m.top, m.e.turnR);
    m.turn += (lean - m.turn) * (dt > 0 ? Math.min(1, dt * HEADING_EASE) : 1);
    if (m.gait) stepGait(m.gait, m.spd, act, dt);

    const gh = this.heightAt(nx, nz);
    // A flyer holds its height above the ground under it, so it clears a hill, and it breathes:
    // it rises and falls AIR_BOB metres on its own slow clock. Nothing else moves up there, and a
    // body that holds one height reads as a sprite pinned to the sky.
    const lift = g.flies ? g.hover + Math.sin(t * AIR_BOB_HZ * 6.2832 + g.bob + m.p1) * AIR_BOB : 0;
    const y = g.flies ? Math.max(gh, 0) + lift : gh;
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
    const ex = nx - this._cx, ey = y - this._cy, ez = nz - this._cz;
    const dd = ex * ex + ey * ey + ez * ez;
    // Issue 17: a flyer never draws narrower than AIR_MIN_PX pixels. At 150 m a 2 m body covers
    // about 8 px and the sky around it gives the reader nothing to read that width against, so it
    // reads as dust on the screen. It grows until it reads as a body, and no more than AIR_GROW.
    // The growth is smooth in the distance, so nothing pops, and it holds the lore size near by,
    // where the ground and the plants are there to measure it against.
    let s = m.scale;
    if (g.flies && this._pxPerM && m.e.widthM > 0) {
      const px = (m.e.widthM * this._pxPerM) / Math.max(1, Math.sqrt(dd));
      if (px < AIR_MIN_PX) s *= Math.min(AIR_GROW, AIR_MIN_PX / px);
    }
    m.drawScale = s;
    _mat.makeBasis(_rgt.multiplyScalar(s), _up.multiplyScalar(s), _fwd.multiplyScalar(s));
    _mat.setPosition(_pos.set(nx, y, nz));
    m.px = nx; m.py = y; m.pz = nz;      // the pick reads these, so it needs no matrix read back

    // The level of detail. The band around the LOD distance holds an animal on the side it is on
    // until it is clearly past the other side, so an animal at the boundary cannot flicker.
    const in2 = g.flies ? this._airIn2 : this._in2, out2 = g.flies ? this._airOut2 : this._out2;
    m.far = m.far === 0 ? (dd > out2 ? 1 : 0) : (dd < in2 ? 0 : 1);
    const e = m.e;
    const inst = m.far ? e.far : e.near;
    const slot = m.far ? e.farN++ : e.nearN++;
    if (m.mesh !== inst || m.slot !== slot) {
      m.mesh = inst; m.slot = slot;
      inst.geometry.attributes.aPhase.setX(slot, m.phase);
      e.phaseDirty = true;
    }
    inst.setMatrixAt(slot, _mat);
    const at = inst.geometry.attributes;
    at.aMove.setX(slot, act);
    at.aGait.setX(slot, m.gait ? m.gait.phase : 0);
    at.aTurn.setX(slot, m.turn);
    // The shadow of a flyer comes last. It writes the same basis and the same matrix this step
    // used, so it must run after the animal takes its own copy of them.
    if (m.shade >= 0 && this.shade) this._stepShade(m, nx, nz, lift);
  }

  // One shadow disc. The flyer is `lift` metres over the ground at (nx, nz), and the sun stands at
  // this._sun, so the shadow falls that far the other way. A low sun throws it a long way out, and
  // the cap holds it near enough that the reader can still tie the two together.
  //
  // The disc reads the terrain where it lands, not where the flyer flies: it takes the height and
  // the normal there, so it lies on the slope it falls on and not in the air over a valley.
  _stepShade(m, nx, nz, lift) {
    const h = Math.max(0, lift);
    const sun = this._sun;
    const f = Math.min(h / Math.max(0.18, sun.y), h * SHADE_CAST);
    const sx = nx - sun.x * f, sz = nz - sun.z * f;
    const e = 2;
    _up.set(this.heightAt(sx - e, sz) - this.heightAt(sx + e, sz), 2 * e,
      this.heightAt(sx, sz - e) - this.heightAt(sx, sz + e)).normalize();
    _fwd.set(0, 0, 1);
    _fwd.addScaledVector(_up, -_fwd.dot(_up)).normalize();
    _rgt.crossVectors(_up, _fwd).normalize();
    // it spreads as the flyer climbs, as a real shadow does, and never under a size the reader sees
    const k = clamp((h - AIR_HOVER[0]) / (AIR_HOVER[1] - AIR_HOVER[0]), 0, 1);
    const r = Math.max(SHADE_MIN, m.e.widthM * 0.5 * (1 + k * (SHADE_SPREAD - 1)));
    _mat.makeBasis(_rgt.multiplyScalar(r), _up.multiplyScalar(r), _fwd.multiplyScalar(r));
    _mat.setPosition(_pos.set(sx, Math.max(this.heightAt(sx, sz), 0) + SHADE_LIFT, sz));
    this.shade.setMatrixAt(m.shade, _mat);
    // It fades as it spreads, and it goes out with the sun. A night world shows no shadow at all.
    this.shade.geometry.attributes.aShade.setX(m.shade,
      SHADE_DARK * (1 - k * (1 - SHADE_FADE)) * (1 - this._night));
  }

  // ---------------------------------------------------------------- the mark
  // A tap marks one animal. The ring lies on the ground under it and follows it, and the app
  // offers the card of that animal on the floating button. See ground.js for the tap itself.
  markMember(m) {
    if (!m) return;
    this.marked = m;
    if (!this.ring) this._buildRing();
    this.ring.visible = true;
    this._stepRing();
  }

  unmark() {
    this.marked = null;
    if (this.ring) this.ring.visible = false;
  }

  // The member of a species nearest a point on the ground, or null. The arrows of the card read
  // it, so the camera goes to the animal of that species the reader can reach first.
  nearestMember(kind, x, z) {
    let best = null, bd = Infinity;
    for (const m of this.members) {
      if (m.e.kind !== kind) continue;
      const d = (m.x - x) * (m.x - x) + (m.z - z) * (m.z - z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  // The band of the mark, flat in the xz plane as the shadow disc is, so the instance basis can
  // lay it on the slope. It takes the accent of the fauna palette, the colour the site marker
  // uses, so the mark and the square read as one voice.
  _buildRing() {
    const geo = new THREE.RingGeometry(1 - RING_BAND, 1, 48);
    geo.rotateX(-HALF_PI);
    const pal = this.world.palette || {};
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(pal.fauna?.accent || '#ffffff'),
      transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.renderOrder = 2;           // after the shadow disc, so the mark lies on it and not under
    ring.frustumCulled = false;
    ring.matrixAutoUpdate = false;  // the step writes the matrix, as it writes every instance
    this.ring = ring;
    this.ringMat = mat;
    this.group.add(ring);
  }

  // Place the ring on the terrain under the marked animal, tilted to the slope, at the size the
  // animal draws at. A far flyer grows on the screen, and the ring grows with it.
  _stepRing() {
    const m = this.marked;
    if (!m || !this.ring) return;
    const e = 2;
    _up.set(this.heightAt(m.x - e, m.z) - this.heightAt(m.x + e, m.z), 2 * e,
      this.heightAt(m.x, m.z - e) - this.heightAt(m.x, m.z + e)).normalize();
    _fwd.set(0, 0, 1);
    _fwd.addScaledVector(_up, -_fwd.dot(_up)).normalize();
    _rgt.crossVectors(_up, _fwd).normalize();
    const grow = m.scale > 1e-6 ? m.drawScale / m.scale : 1;
    const r = Math.max(RING_MIN, m.e.widthM * RING_SIZE * grow);
    _mat.makeBasis(_rgt.multiplyScalar(r), _up.multiplyScalar(r), _fwd.multiplyScalar(r));
    _mat.setPosition(_pos.set(m.x, Math.max(this.heightAt(m.x, m.z), 0) + RING_LIFT, m.z));
    this.ring.matrix.copy(_mat);
    this.ring.matrixWorldNeedsUpdate = true;
  }

  // ---------------------------------------------------------------- the inspector click
  // Issue 06 owns the ground click. ground.js calls pickHit() through its seam, marks the
  // animal, and glides to it. This file binds no listener of its own.

  // The species under a screen point, or null. The same measure creatureAt() uses on the globe:
  // project the base and a point one body up, then take the distance to that segment. The globe
  // test drops an animal on the far side of the planet; on the ground the frustum does that.
  pickAt(px, py, tolerance = PICK_TOL) {
    const hit = this.pickHit(px, py, tolerance);
    return hit ? hit.kind : null;
  }

  // The creature under a screen point, with the world point to glide to, or null. The walk keeps
  // the base point and the scale of every animal, so the test reads the same numbers whether the
  // animal draws as a near mesh or as a far one. The hit carries the distance from the camera and
  // the size of the animal, so the caller can drop an animal that stands behind a hill.
  //
  // Two animals often cover one point on the screen. The test runs in two tiers. An animal whose
  // body holds the point is a hit, and of the hits the nearest to the camera wins, because that is
  // the animal the reader sees there. If no body holds the point, the animal with the smallest gap
  // wins, and the gap counts against the width of that animal on the screen. A far animal of four
  // pixels can therefore no longer take a tap that grazed a near one.
  pickHit(px, py, tolerance = PICK_TOL) {
    const cam = this.camera;
    if (!cam || !this.members.length) return null;
    const el = this.canvas, w = el ? el.clientWidth : 1, h = el ? el.clientHeight : 1;
    let best = null, bestHit = false, bestKey = Infinity;
    this.group.updateWorldMatrix(true, false);
    const root = this.group.matrixWorld;
    for (const m of this.members) {
      _pv.set(m.px, m.py, m.pz).applyMatrix4(root);
      _pt.set(m.px, m.py + m.drawScale * 1.1, m.pz).applyMatrix4(root);
      _pw.copy(_pv);                       // the world point, before project() overwrites it
      const dist = _pw.distanceTo(cam.position);
      _pv.project(cam); _pt.project(cam);
      // Both ends of the body must sit between the near plane and the far plane. A test on the far
      // end alone let through an animal level with the camera and off to the side: its depth runs
      // to nothing, project() blows its two points thousands of pixels apart, and the huge body it
      // draws on the screen then took every tap and carried the reader away to it.
      if (_pv.z > 1 || _pv.z < -1 || _pt.z > 1 || _pt.z < -1) continue;
      const ax = (_pv.x + 1) / 2 * w, ay = (1 - _pv.y) / 2 * h;
      const bx = (_pt.x + 1) / 2 * w, by = (1 - _pt.y) / 2 * h;
      const lx = bx - ax, ly = by - ay, ll = lx * lx + ly * ly || 1;
      const u = clamp(((px - ax) * lx + (py - ay) * ly) / ll, 0, 1);
      const gap = Math.hypot(ax + lx * u - px, ay + ly * u - py);
      const half = Math.sqrt(ll) * 0.35;   // pixels: the body stands about this far out from its axis
      const reach = Math.max(tolerance, half);
      if (gap > reach) continue;
      const hit = gap <= half;             // the point is on the body, not beside it
      const key = hit ? dist : gap / reach;
      if (best) {
        if (bestHit && !hit) continue;                    // a body under the point beats a graze
        if (bestHit === hit && key >= bestKey) continue;
      }
      bestHit = hit; bestKey = key;
      best = { kind: m.e.kind, scale: m.drawScale, air: m.g.flies, dist, point: _pb.copy(_pw).clone(), member: m };
    }
    return best;
  }

  dispose() {
    if (this.shade) { this.shade.geometry.dispose(); this.shadeMat.dispose(); }
    if (this.ring) { this.ring.geometry.dispose(); this.ringMat.dispose(); this.ring = null; this.marked = null; }
    for (const e of this.kinds) { e.near.geometry.dispose(); e.far.geometry.dispose(); e.mat.dispose(); }
    this.group.clear();
    this.kinds = []; this.groups = []; this.members = []; this.count = 0;
    this.nearCount = 0; this.farCount = 0;
  }
}
