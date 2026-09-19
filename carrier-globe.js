// myworlds — the fixes of the carrier on the globe. Issue 34, slice 2.
//
// One landing gives one fix, and a fix draws two things: a dot on the cell the probe stood on, and
// a wedge that runs out from that cell along the bearing the instrument stated, plus and minus its
// error. A wedge covers half a great circle, from the site to the antipode of the site, because a
// bearing has a direction. Two wedges then cross in one region and not in two.
//
// The app draws no cross and computes none. Two wedges read darker where they cross, because the
// second one blends over the first, and that is the whole display of the cross. Decision 6 of issue
// 34: the reader reads the cross by eye, and a computed mark would take the only thought out of the
// search.
//
// The group rides under current.planet, so it turns with the world. depthTest stays on, so the
// globe hides the part of a wedge that runs over its far side.
//
// **East is easy to mirror**, and the sky of this app had that defect once; see decision 10 of
// docs/probe.md. The edges below walk the same east bearingTo() measures against in site.js,
// (sin lon, 0, -cos lon), the direction of falling lon. The copy is not trusted: tools/
// carrier-fix-check.mjs reads the built geometry back through bearingTo() and fails when the two
// files disagree by more than a millionth of a degree.
import * as THREE from 'three';
import { CELL, groundRadius, sourceSite } from './site.js';

// globe units: over the relief of 0.06 and under the inner atmosphere shell of 1.115, so a wedge
// clears every mountain and never stands outside the air of the world.
//
// A wedge runs to the antipode of its site, so it has to clear the whole world and it stands on
// this shell. The ring of a find covers 1.5 cells and it marks one place, so it lies on the terrain
// instead: see drapeR() below.
export const WEDGE_R = 1.07;
const WEDGE_STEPS = 48;         // steps of the walk from the site to the antipode of the site
const WEDGE_ALPHA = 0.16;       // one wedge is faint, and two that cross read twice as strong
const MARK_ALPHA = 0.5;         // the dot of a fix and the ring of a find, which must read alone
const DOT_R = 0.006;            // globe units: the radius of the dot at a site
const RING_CELLS = 1.5;         // cells of arc: the radius of the ring a find leaves at the source
const RING_WIDTH = 0.3;         // cells of arc: the width of the band of that ring
// The ring carries 72 steps, so one step is 0.0013 globe units of arc against a height map texel of
// 0.016. The band therefore reads every value the height map holds under it and the chord between
// two steps sags by nothing the reader can see.
const RING_SEGS = 72;
// globe units: the lift of the ring over the terrain. The ring must clear the flora of the globe,
// which stands 0.011 units tall: a lift of 0.0012 put the ring under the trees of a forest, and
// the reader saw no ring. The height map is also smoother than the facets of the globe, and the
// lift covers that too. It stays far under the 0.11 globe units the camera keeps over the surface
// at its nearest, so the ring still reads as a mark on the ground and not as a thing in the sky.
// depthTest stays on, so the far side of the globe still hides the part behind it.
export const DRAPE_LIFT = 0.014;
const FADE_S = 1.2;             // seconds: a new wedge fades in over the end of the ascent
const RENDER_ORDER = 2;         // after the terrain and before the atmosphere shells of app.js

const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _up = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _p = new THREE.Vector3();

// The three axes of a bearing at a site: east, north, and up.
//
// This is the frame of bearingTo() in site.js and not the frame of the box of a landing. The wedge
// is drawn on the globe, so it keeps the bearing of the globe. The needle of the overlay keeps the
// frame of the box instead, because the reader walks the terrain. See "the carrier" in site.js.
function frameAt(site) {
  const la = THREE.MathUtils.degToRad(site.lat), lo = THREE.MathUtils.degToRad(site.lon);
  const cla = Math.cos(la), sla = Math.sin(la), clo = Math.cos(lo), slo = Math.sin(lo);
  _east.set(slo, 0, -clo);                        // the east of groundBasis(): falling lon
  _north.set(-sla * clo, cla, -sla * slo);        // the part of +y in the tangent plane
  _up.set(cla * clo, sla, cla * slo);             // siteDir(lat, lon)
}

// The unit tangent at the site along a bearing in degrees. North is 0 and east is 90.
function tangentAt(brg, out = _tan) {
  const b = THREE.MathUtils.degToRad(brg);
  return out.copy(_north).multiplyScalar(Math.cos(b)).addScaledVector(_east, Math.sin(b));
}

// The point at arc t along the great circle that leaves the site on a tangent.
function walk(t, tan, out = _p) {
  return out.copy(_up).multiplyScalar(Math.cos(t)).addScaledVector(tan, Math.sin(t));
}

// A shape under construction. Every fix of a group writes into one of these, so the whole set of
// wedges draws in one call and the whole set of dots in one more.
const newPart = () => ({ pos: [], idx: [] });

function push(part, v, r = WEDGE_R) {
  part.pos.push(v.x * r, v.y * r, v.z * r);
}

// The radius the ring of a find takes under one direction: the ground there, or the sea when the
// ground lies under it, plus the lift. It is the rule showMarker() in site.js drapes the square of
// a cell with, and it needs the height map the worker sent with the world.
//
// A ring at a fixed radius floats. The surface stands near 1.0, the camera comes to 1.11, and a
// ring at the 1.07 of the wedges then hangs in the sky a long way from the source. The wedges keep
// that shell, because a wedge runs to the antipode and has to clear every mountain on the way.
function drapeR(world, hm, dir) {
  return Math.max(groundRadius(world, hm, dir), (world && world.seaRadius) || 0) + DRAPE_LIFT;
}

function toGeometry(part) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(part.pos), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(part.idx), 1));
  if (part.pos.length) g.computeBoundingSphere();   // an empty shape holds no middle
  return g;
}

// The wedge of one fix: the band between the two edge great circles, from the site to the antipode
// of the site. Each edge carries WEDGE_STEPS steps, and the two ends of the band close on a point.
function addWedgeShape(part, fix) {
  const base = part.pos.length / 3;
  frameAt(fix);
  const left = tangentAt(fix.brg - fix.err, new THREE.Vector3());
  const right = tangentAt(fix.brg + fix.err, new THREE.Vector3());
  for (let k = 0; k <= WEDGE_STEPS; k++) {
    const t = k * Math.PI / WEDGE_STEPS;
    push(part, walk(t, left));
    push(part, walk(t, right));
  }
  for (let k = 0; k < WEDGE_STEPS; k++) {
    const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
    part.idx.push(a, b, c, b, d, c);
  }
}

// The dot at the site of a fix: a small disc that lies flat on the sphere of the wedges.
function addDotShape(part, site, segs = 12) {
  const base = part.pos.length / 3;
  frameAt(site);
  push(part, _up);
  for (let i = 0; i < segs; i++) {
    const a = i * Math.PI * 2 / segs;
    _p.copy(_up).addScaledVector(_east, Math.cos(a) * DOT_R).addScaledVector(_north, Math.sin(a) * DOT_R);
    push(part, _p.normalize());
  }
  for (let i = 0; i < segs; i++) part.idx.push(base, base + 1 + i, base + 1 + (i + 1) % segs);
}

// The ring a find leaves at the source: a thin band about 1.5 cells of arc out from the cell.
//
// Every vertex takes the radius of the terrain under it, so the band lies on the relief and rises
// and falls with it. The steps are close enough that the two vertices of one step read the same
// hill, and the reader sees a mark painted on the ground.
function addRingShape(part, site, world, hm) {
  const base = part.pos.length / 3;
  frameAt(site);
  const inner = (RING_CELLS - RING_WIDTH * 0.5) * CELL;
  const outer = (RING_CELLS + RING_WIDTH * 0.5) * CELL;
  const tan = new THREE.Vector3(), at = new THREE.Vector3();
  for (let i = 0; i <= RING_SEGS; i++) {
    tangentAt(i * 360 / RING_SEGS, tan);
    for (const arc of [inner, outer]) {
      walk(arc, tan, at);
      push(part, at, drapeR(world, hm, at));
    }
  }
  for (let i = 0; i < RING_SEGS; i++) {
    const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
    part.idx.push(a, b, c, b, d, c);
  }
}

function mesh(mat) {
  const m = new THREE.Mesh(toGeometry(newPart()), mat);
  m.renderOrder = RENDER_ORDER;
  m.visible = false;
  m.frustumCulled = false;      // a wedge reaches the antipode, so its bounds cover the globe
  return m;
}

// Put a fresh shape on a mesh and drop the one it held.
function setShape(m, part) {
  m.geometry.dispose();
  m.geometry = toGeometry(part);
  m.visible = part.idx.length > 0;
}

function material(accent, opacity) {
  return new THREE.MeshBasicMaterial({
    color: accent, transparent: true, opacity,
    depthWrite: false,            // a wedge must not hide the wedge that crosses it
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

// The accent of the palette, as showMarker() reads it in site.js.
const accentOf = (world) => (world && world.palette && world.palette.fauna && world.palette.fauna.accent) || '#ffffff';

// The group of one world, or null for a world with no source. `record` is the record of
// carrier-store.js: the fixes of this world and whether the reader has found the source.
//
// `heightMap` is the height map the worker sent with the world, which buildWorld() in app.js reads
// off the same reply. The ring of a find lies on the terrain and needs it; the wedges and the dots
// do not. A caller that gives none gets a ring on the sphere of radius 1, which is what a world
// with no height map draws anyway.
//
// Four meshes and four materials, whatever the number of fixes: the settled wedges in one, their
// dots in one more, and the wedge and the dot that fade in on the last landing in the other two.
// A found world draws one ring instead and nothing else.
export function makeCarrierGroup(world, record, heightMap = null) {
  if (!world || !world.source || !world.source.dir) return null;
  const accent = accentOf(world);
  const mats = {
    wedge: material(accent, WEDGE_ALPHA),
    mark: material(accent, MARK_ALPHA),
    fadeWedge: material(accent, 0),
    fadeMark: material(accent, 0),
  };
  const group = new THREE.Group();
  group.name = 'carrier';
  const meshes = {
    wedges: mesh(mats.wedge),
    marks: mesh(mats.mark),
    fadeWedge: mesh(mats.fadeWedge),
    fadeMark: mesh(mats.fadeMark),
  };
  for (const m of Object.values(meshes)) group.add(m);
  group.userData = {
    mats, meshes, world, hm: heightMap,
    fixes: (record && Array.isArray(record.fixes) ? record.fixes : []).slice(),
    found: !!(record && record.found),
    fade: null,       // { fix, t } while one wedge fades in
  };
  rebuild(group);
  return group;
}

// Draw the settled fixes, or the ring of a find. It runs on every change and not on every frame.
function rebuild(group) {
  const u = group.userData;
  const wedges = newPart(), marks = newPart();
  if (u.found) {
    // The find takes the place of the search: no wedge and no dot, and one ring at the source.
    const at = sourceSite(u.world);
    if (at) addRingShape(marks, at, u.world, u.hm);
  } else {
    for (const fix of u.fixes) { addWedgeShape(wedges, fix); addDotShape(marks, fix); }
  }
  setShape(u.meshes.wedges, wedges);
  setShape(u.meshes.marks, marks);
}

// Take the fading fix into the settled set.
function settle(group) {
  const u = group.userData;
  if (!u.fade) return;
  u.fixes.push(u.fade.fix);
  u.fade = null;
  u.mats.fadeWedge.opacity = 0;
  u.mats.fadeMark.opacity = 0;
  u.meshes.fadeWedge.visible = false;
  u.meshes.fadeMark.visible = false;
  rebuild(group);
}

// Add the fix of a landing. `fade` fades the new wedge in over 1.2 s: the ascent ends over the
// site, so the reader watches the wedge arrive. Without it the wedge stands there at once, which
// is what a world built from the store needs.
//
// A fix on a cell that already holds one replaces it, as the store does: the instrument states the
// same bearing on every visit, so the second wedge would only draw over the first.
export function addWedge(group, fix, { fade = false } = {}) {
  if (!group || !fix) return;
  const u = group.userData;
  if (u.found) return;                 // the wedges of a found world are gone for good
  if (u.fade) settle(group);
  u.fixes = u.fixes.filter((f) => f.lat !== fix.lat || f.lon !== fix.lon);
  if (!fade) { u.fixes.push(fix); rebuild(group); return; }
  const wedge = newPart(), mark = newPart();
  addWedgeShape(wedge, fix);
  addDotShape(mark, fix);
  setShape(u.meshes.fadeWedge, wedge);
  setShape(u.meshes.fadeMark, mark);
  u.mats.fadeWedge.opacity = 0;
  u.mats.fadeMark.opacity = 0;
  u.fade = { fix, t: 0 };
  rebuild(group);
}

// The reader has found the source. Slice 3 calls onSourceFound() in app.js, which calls this.
// The ring the rebuild draws lies on the terrain, so a caller that gives a new world gives its
// height map with it.
export function setFound(group, world, heightMap) {
  if (!group) return;
  const u = group.userData;
  if (world) u.world = world;
  if (heightMap) u.hm = heightMap;
  u.fade = null;
  u.mats.fadeWedge.opacity = 0;
  u.mats.fadeMark.opacity = 0;
  u.meshes.fadeWedge.visible = false;
  u.meshes.fadeMark.visible = false;
  u.found = true;
  rebuild(group);
}

// The fade, in seconds. Nothing else on the group moves, so a group with no fade costs one test.
export function updateCarrierGroup(group, dt) {
  if (!group) return;
  const u = group.userData;
  if (!u.fade) return;
  u.fade.t += dt;
  const k = THREE.MathUtils.clamp(u.fade.t / FADE_S, 0, 1);
  const e = THREE.MathUtils.smoothstep(k, 0, 1);
  u.mats.fadeWedge.opacity = WEDGE_ALPHA * e;
  u.mats.fadeMark.opacity = MARK_ALPHA * e;
  if (k >= 1) settle(group);
}

// Give every buffer and every material back. disposeWorld() in app.js calls this before it walks
// the world group, so renderer.info.memory returns to the numbers it held before the landing.
export function disposeCarrierGroup(group) {
  if (!group) return;
  const u = group.userData;
  for (const m of Object.values(u.meshes || {})) m.geometry.dispose();
  for (const m of Object.values(u.mats || {})) m.dispose();
  if (group.parent) group.parent.remove(group);
  group.clear();
  group.userData = {};
}
