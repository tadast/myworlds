// myworlds — the fixes of the carrier on the globe. Issue 34, slice 2.
//
// One landing gives one fix, and a fix draws two things: a dot on the cell the probe stood on, and
// a wedge that runs out from that cell along the bearing the instrument stated, plus and minus its
// error. A wedge covers half a great circle, from the site to the antipode of the site, because a
// bearing has a direction. Two wedges then cross in one region and not in two.
//
// The app draws no cross and computes none. Two wedges read stronger where they cross, and that is
// the whole display of the cross. Decision 6 of issue 34: the reader reads the cross by eye, and a
// computed mark would take the only thought out of the search.
//
// **The wedge is paint on the terrain and not a shape in the sky.** The first build put every
// wedge on a shell of radius 1.07. The aim camera comes to 1.11, and from there a wedge stood as a
// sheet over the ground: the cross of two sheets held a large parallax against the relief, and the
// reader could not tell which cell lay under it. The wedge is now a tint the terrain shader and the
// ocean shader add to their own fragments, so it lies exactly on the ground it marks and it holds
// no parallax at any camera. patchCarrierMaterial() below installs it.
//
// The dot of a fix and the mini wreck of a find stay as geometry, because each one marks one cell.
// Both stand on the terrain: see drapeR().
//
// The group rides under current.planet, so the dots turn with the world. The wedges turn with the
// world for free, because the shader reads the direction of a fragment in the LOCAL frame of the
// planet and the fixes stand in that same frame.
//
// **East is easy to mirror**, and the sky of this app had that defect once; see decision 10 of
// docs/probe.md. The planes below walk the same east bearingTo() measures against in site.js,
// (sin lon, 0, -cos lon), the direction of falling lon. The copy is not trusted: tools/
// carrier-fix-check.mjs builds the planes with wedgePlanes(), the one function the uniforms come
// from, and reads them back through bearingTo() and carrierAt() of site.js.
import * as THREE from 'three';
import { CELL, groundRadius, siteDir, sourceSite } from './site.js';
// The mini wreck of a find is the wreck of the ground, at the scale of the globe. ground-source.js
// builds that body in wreckGeometry(), which takes no DOM and does nothing at import, so the two
// models come from one builder and they cannot drift apart.
import { wreckGeometry, WRECK_HULL } from './ground-source.js';

// The number of wedges the shader holds. Four uniform slots of three vec3 and two floats cost 44
// floats, which every driver carries with room to spare. The first build held eight, and after
// eight landings the globe stood in wide wedges of the accent with lines everywhere: the reader
// could read no cross out of it. Four fixes give a cross and one check of that cross, which is the
// three to five landings the plan asks for. A world that holds more fixes draws the 4 newest;
// carrier-store.js keeps up to MAX_FIXES of them, and MAX_FIXES is 4 as well, so the store and the
// shader hold one set and a fifth landing drops the oldest.
export const MAX_WEDGES = 4;

// The tint of one wedge, as a part of the way from the lit colour to the accent of the palette.
// n wedges give 1 - pow(1 - WEDGE_STEP, n * n), so one wedge reads 0.04, two read 0.15, three read
// 0.31, and four read 0.48. The square of the count is the point: the wash grows faster than the
// count, so one wedge alone is almost only its two lines, and the ground two or more wedges cover
// stands out as the answer. The first build stepped by 1 - pow(1 - 0.08, n), and one wedge then
// washed as much ground as a crossing did. The line on each edge of a wedge carries the shape of
// one wedge; see WEDGE_EDGE.
const WEDGE_STEP = 0.04;
// The line on each edge of a wedge, as a part of the way to the accent, and its width in degrees.
// The eye finds the cross as the region the lines close, so the lines must read and the wash must
// not hide the ground. 0.3 degrees is about 1.5 px at the home zoom and half a facet of the globe.
const WEDGE_EDGE = 0.5;
const WEDGE_LINE = Math.sin(THREE.MathUtils.degToRad(0.3));
// The share of WEDGE_EDGE the line of a wedge takes, by age: the newest wedge first and the oldest
// last. Four lines of one strength read as a net, and the reader cannot tell which pair to trust.
// The newest wedge draws its line full and each older one draws weaker, so the eye starts at the
// last landing and works back. The wash does not age: an overlap is the answer whatever its age.
// A wedge that fades in is the newest one, because drawnFixes() puts it last.
export const WEDGE_AGE = [1, 0.75, 0.55, 0.4];
// The share of the accent a wedge adds on top of the mix. The night side of a planet is near black,
// and a mix alone would leave a wedge there at 0.18 of the accent, which the eye loses against the
// terminator. This adds a small emissive share, so a wedge on the dark side still reads.
const WEDGE_EMIS = 0.06;
// degrees: the soft band on each edge of a wedge. The facets of the globe are 0.0105 units across,
// which is 0.6 degrees of arc, so a hard edge crawled from facet to facet as the world turned. The
// band is measured on the angle to the edge plane and not on the plane distance, so it holds the
// same width from the site to the antipode. sin of 0.15 degrees is the number the shader tests.
const WEDGE_SOFT = Math.sin(THREE.MathUtils.degToRad(0.15));
// degrees: the widest error a wedge may carry. The two half plane tests give the lune between the
// two edge great circles, and that lune is the wedge only while the wedge is narrower than a half
// plane. carrierAt() tops the error at 10 degrees today, so the clamp never bites.
const MAX_ERR = 89.5;

const MARK_ALPHA = 0.5;         // the dot of a fix, which must read alone
const DOT_CELLS = 0.35;         // cells of arc: the radius of the dot at a site
const DOT_SEGS = 16;
// globe units: the lift of the dot and of the mini wreck over the terrain. Both must clear the
// flora of the globe, which stands 0.011 units tall: a lift of 0.0012 put a mark under the trees of
// a forest, and the reader saw nothing. The height map is also smoother than the facets of the
// globe, and the lift covers that too. It stays far under the 0.11 globe units the camera keeps
// over the surface at its nearest, so a mark still reads as a thing on the ground and not as a
// thing in the sky. depthTest stays on, so the far side of the globe still hides the part behind it.
export const DRAPE_LIFT = 0.014;

// ---------------------------------------------------------------- the mini wreck of a find
// The first build left one ring at the source after the find. A ring is the mark of a search and
// the search is over, so the ring said nothing the reader did not know. The globe now carries the
// wreck itself: the same body ground-source.js puts on the patch, at the scale of the globe, on the
// terrain of its own cell, with a lamp that blinks. A reader who comes back to the world a month
// later reads the answer off the globe with no card and no row.
export const WRECK_H = 0.06;    // globe radii: the height of the whole model, the lamp included
// parts of WRECK_H: the size of the lamp over the mast. The lamp of the ground wreck is 0.04 of the
// body, which is under a pixel from orbit, so this one stands wider. Past about 0.1 the lamp reads
// as a shape of its own and the model stops reading as a machine.
const WRECK_LAMP = 0.07;
// The least size of the lamp, as a part of its distance from the camera. The grey model is a few
// pixels from the home zoom, so the lamp holds about 10 pixels there and the reader can find it.
// Near the model the lamp keeps its own size.
const WRECK_LAMP_MIN = 0.007;
// The hull stands on the lit globe and on the night side alike, so the body gives a little of its
// own colour back. Without it the model is a black chip over the dark half of the world.
const WRECK_EMIS = 0.22;
const WRECK_PERIOD = 2.4;       // seconds: one blink of the lamp
const WRECK_FLOOR = 0.25;       // the lamp never goes fully out, so the model reads between beats
// The fall of one blink, over the period. A sharp rise and a slow fall read as a machine that
// answers a clock; a plain sine reads as a thing that breathes.
const WRECK_FALL = 4.5;
const FADE_S = 1.2;             // seconds: a new wedge fades in over the end of the ascent
const RENDER_ORDER = 2;         // after the terrain and before the atmosphere shells of app.js

const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _up = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _p = new THREE.Vector3();
const _yUp = new THREE.Vector3(0, 1, 0);   // the up axis of wreckGeometry(), in its own frame

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

// ---------------------------------------------------------------- the wedge, as numbers
// A wedge is three unit vectors: the direction of the site `s`, and the inward normals `nL` and
// `nR` of the two edge great circle planes. Each plane runs through the centre, through the site,
// and along the tangent at one edge bearing, so both planes hold the axis through s and -s. The two
// planes cut the sphere into four lunes, and the pair of tests `dot(d, nL) > 0` and
// `dot(d, nR) > 0` selects one of them: the lune that leaves the site along the bearing and closes
// at the antipode of the site. That is decision 5 of issue 34 with no further rule, because a lune
// runs from one pole of its axis to the other and it cannot reach round the back.
//
// The rule holds while the wedge is narrower than a half plane. At an error of exactly 90 degrees
// the two planes fall together and the lune is a hemisphere, which is still right. Past 90 degrees
// the intersection flips to the narrow lune on the far side, so the error takes the clamp of
// MAX_ERR. carrierAt() states at most 10 degrees, so the clamp never bites.
//
// The shader runs this same arithmetic per fragment, and the uniforms come from this function, so
// tools/carrier-fix-check.mjs tests the numbers the shader gets.
export function wedgePlanes(fix) {
  frameAt(fix);
  const err = THREE.MathUtils.clamp(Math.abs(fix.err), 0, MAX_ERR);
  const s = _up.clone();
  const tL = tangentAt(fix.brg - err, new THREE.Vector3());
  const tR = tangentAt(fix.brg + err, new THREE.Vector3());
  return {
    s,
    nL: tL.cross(s).normalize(),
    nR: s.clone().cross(tR).normalize(),
  };
}

// How far a direction stands inside each edge of a wedge, as the sine of the angle to that plane.
//
// The raw dot product with a plane normal falls to nothing at the site and at the antipode, because
// the direction lies along the axis of the two planes there. The divide by sin of the arc takes
// that out, so the two numbers read the true angle to the edge at every arc and one soft band of
// 0.15 degrees holds the same width along the whole wedge. Both numbers are positive inside the
// wedge. This is the arithmetic of the shader, line for line.
export function wedgeEdges(planes, dir, out = { l: 0, r: 0 }) {
  const c = dir.dot(planes.s);
  const inv = 1 / Math.max(Math.sqrt(Math.max(1 - c * c, 0)), 1e-4);
  out.l = dir.dot(planes.nL) * inv;
  out.r = dir.dot(planes.nR) * inv;
  return out;
}

// The hard test: does a direction lie in the wedge?
export function inWedge(planes, dir) {
  const e = wedgeEdges(planes, dir);
  return e.l > 0 && e.r > 0;
}

// The soft test the shader paints with: 0 outside the wedge, 1 inside it, and a band of 0.15
// degrees on each edge.
export function wedgeCoverage(planes, dir) {
  const e = wedgeEdges(planes, dir);
  return THREE.MathUtils.smoothstep(e.l, 0, WEDGE_SOFT) * THREE.MathUtils.smoothstep(e.r, 0, WEDGE_SOFT);
}

// The wash n wedges lay on one fragment, as a part of the way from the lit colour to the accent.
// This is the formula of the GLSL below, and both read WEDGE_STEP, so the two cannot drift apart
// and tools/carrier-fix-check.mjs tests the numbers the shader paints.
export function wedgeWash(n) { return 1 - Math.pow(1 - WEDGE_STEP, n * n); }

// ---------------------------------------------------------------- the wedge, as a shader
// One set of uniforms for the page. The terrain material and the ocean material of the world on the
// screen hold the same uniform objects, so a write here reaches both with no copy, and a group that
// is built again after a clear of the fixes reaches the materials that were compiled before it.
// Only one world stands on the screen at a time, so one set is enough.
const uniforms = {
  uWedgeCount: { value: 0 },
  uWedgeS: { value: Array.from({ length: MAX_WEDGES }, () => new THREE.Vector3(0, 1, 0)) },
  uWedgeL: { value: Array.from({ length: MAX_WEDGES }, () => new THREE.Vector3()) },
  uWedgeR: { value: Array.from({ length: MAX_WEDGES }, () => new THREE.Vector3()) },
  uWedgeFade: { value: new Float32Array(MAX_WEDGES) },
  // the share of the line each wedge draws, by age: WEDGE_AGE, newest last as the fixes stand
  uWedgeAge: { value: new Float32Array(MAX_WEDGES) },
  uWedgeCol: { value: new THREE.Color('#ffffff') },
  // The radius of the sea, or 0. The sea is see-through, so the sea bed under it must paint no
  // wedge, or a wedge over shallow water reads twice as strong as one over land.
  uWedgeSea: { value: 0 },
};

// The uniforms the patched materials read. A caller needs this only to look at the numbers; the
// group writes them on its own.
export function carrierUniforms() { return uniforms; }

let uniformOwner = null;        // the group that last wrote the uniforms

const WEDGE_DECL = `
  varying vec3 vCarrierDir;
  uniform int uWedgeCount;
  uniform vec3 uWedgeS[${MAX_WEDGES}];
  uniform vec3 uWedgeL[${MAX_WEDGES}];
  uniform vec3 uWedgeR[${MAX_WEDGES}];
  uniform float uWedgeFade[${MAX_WEDGES}];
  uniform float uWedgeAge[${MAX_WEDGES}];
  uniform vec3 uWedgeCol;
  uniform float uWedgeSea;`;

// The paint, in the fragment shader of the terrain and of the sea.
//
// The cost: this runs on every fragment of the planet and of the sea, which is the disc of the
// globe on the screen and no more. A world with no fix reads one integer uniform and stops, so it
// costs one compare per fragment and the varying that carries the direction. A fix costs three dot
// products, one inverse square root, two smoothsteps, and a multiply and add: about twenty
// arithmetic operations. Four fixes therefore add about 80 operations against the several hundred
// the lighting of a MeshStandardMaterial already spends on the same fragment. No texture is read
// and no branch diverges inside a wedge, because the loop runs the same count for every fragment.
const WEDGE_TINT = `
  if (uWedgeCount > 0 && length(vCarrierDir) > uWedgeSea - 0.002) {
    vec3 wDir = normalize(vCarrierDir);
    float wN = 0.0;
    float wE = 0.0;
    for (int i = 0; i < ${MAX_WEDGES}; i++) {
      if (i >= uWedgeCount) break;
      float wC = dot(wDir, uWedgeS[i]);
      // the sine of the arc from the site: it turns the plane distance into the angle to the edge,
      // so one soft band holds the same width from the site to the antipode
      float wInv = 1.0 / max(sqrt(max(1.0 - wC * wC, 0.0)), 1e-4);
      float wL = dot(wDir, uWedgeL[i]) * wInv;
      float wR = dot(wDir, uWedgeR[i]) * wInv;
      float wIn = smoothstep(0.0, ${WEDGE_SOFT.toFixed(7)}, wL) * smoothstep(0.0, ${WEDGE_SOFT.toFixed(7)}, wR) * uWedgeFade[i];
      wN += wIn;
      // the line on the two edges: full at the edge plane, gone one line width inside it, and
      // weaker on an older wedge, so the eye starts at the last landing. uWedgeAge[i] holds it.
      wE = max(wE, uWedgeAge[i] * wIn * (1.0 - smoothstep(${(WEDGE_LINE * 0.5).toFixed(7)}, ${WEDGE_LINE.toFixed(7)}, min(wL, wR))));
    }
    // the wash grows on the square of the count, so one wedge is almost only its lines and the
    // ground under two or more wedges stands out. wedgeWash() above is the same formula in JS.
    float wK = max(1.0 - pow(${(1 - WEDGE_STEP).toFixed(3)}, wN * wN), wE * ${WEDGE_EDGE.toFixed(3)});
    outgoingLight = mix(outgoingLight, uWedgeCol, wK) + uWedgeCol * (wK * ${WEDGE_EMIS.toFixed(3)});
  }`;

// Paint the wedges into one material of the globe. app.js calls it for the terrain material and for
// the ocean material of a world that holds a source.
//
// A world with no source gives no group, and the material then keeps the stock program of three.js:
// a gas giant and a world where makeSource() found no cell both take that path, and they pay
// nothing at all. A world that holds a group but no fix pays the one compare of WEDGE_TINT.
//
// The patch **extends** whatever the material already carries. The ocean material of app.js holds
// an onBeforeCompile of its own for the wobble of the sea, and this runs it first and then adds its
// own lines. Both injection points keep the include they replace, so the two patches do not care
// which one runs first.
//
// The cache key: three.js keys a program on customProgramCacheKey(), which is the text of
// onBeforeCompile by default. Two worlds of one type would then share a program, and the wobble of
// the sea is a literal in the text of the ocean patch, so app.js states a key of its own for that
// material. This appends its own mark to whatever key stands, so a patched material and a plain one
// of the same type never share a program.
export function patchCarrierMaterial(material, group) {
  if (!material || !group) return material;
  if (material.userData && material.userData.carrierPatched) return material;
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (sh, renderer) {
    if (prev) prev.call(material, sh, renderer);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCarrierDir;')
      // the local frame of the planet, so the wedges turn with the world and hold no matrix
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarrierDir = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>${WEDGE_DECL}`)
      // after the lighting and before gl_FragColor, so a wedge reads on the night side too
      .replace('#include <opaque_fragment>', `${WEDGE_TINT}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${prevKey()}|carrier${MAX_WEDGES}`;
  material.userData = material.userData || {};
  material.userData.carrierPatched = true;
  material.needsUpdate = true;
  return material;
}

// The wedges of a group, newest last and at most MAX_WEDGES of them. The fix that fades in stands
// at the end, so updateCarrierGroup() writes one float and touches nothing else.
function drawnFixes(u) {
  if (u.found) return [];
  const all = u.fade ? u.fixes.concat([u.fade.fix]) : u.fixes;
  return all.length > MAX_WEDGES ? all.slice(all.length - MAX_WEDGES) : all;
}

// Put the fixes of a group into the uniforms. It runs on every change and not on every frame.
function writeUniforms(group) {
  const u = group.userData;
  uniformOwner = group;
  uniforms.uWedgeCol.value.set(accentOf(u.world));
  uniforms.uWedgeSea.value = (u.world && u.world.seaRadius) || 0;
  const drawn = drawnFixes(u);
  uniforms.uWedgeCount.value = drawn.length;
  for (let i = 0; i < drawn.length; i++) {
    const p = wedgePlanes(drawn[i]);
    uniforms.uWedgeS.value[i].copy(p.s);
    uniforms.uWedgeL.value[i].copy(p.nL);
    uniforms.uWedgeR.value[i].copy(p.nR);
    uniforms.uWedgeFade.value[i] = u.fade && drawn[i] === u.fade.fix ? u.fade.k : 1;
    // the newest fix stands last, so the age runs back from the end of the set
    uniforms.uWedgeAge.value[i] = WEDGE_AGE[drawn.length - 1 - i] || WEDGE_AGE[WEDGE_AGE.length - 1];
  }
}

// The count goes to nothing, so a material that outlives its group paints no wedge.
function clearUniforms(group) {
  if (group && uniformOwner !== group) return;
  uniforms.uWedgeCount.value = 0;
  uniformOwner = null;
}

// ---------------------------------------------------------------- the marks on the ground
// A shape under construction. Every mark of a group writes into one of these, so the whole set of
// dots draws in one call.
const newPart = () => ({ pos: [], idx: [] });

function push(part, v, r) {
  part.pos.push(v.x * r, v.y * r, v.z * r);
}

// The radius a mark takes under one direction: the ground there, or the sea when the ground lies
// under it, plus the lift. It is the rule showMarker() in site.js drapes the square of a cell with,
// and it needs the height map the worker sent with the world.
//
// A mark at a fixed radius floats. The surface stands near 1.0 and the camera comes to 1.11, so a
// dot on a shell of 1.07 read as a disc in the sky a long way from the cell it marked.
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

// The dot at the site of a fix: a small disc that lies on the terrain of its cell.
//
// It reaches 0.35 of a cell from the middle, so it stands well inside the square the marker draws
// and the reader reads it as a mark on one cell. The first build drew it at 0.006 globe units on
// the shell of the wedges, which read as a large disc in the sky.
function addDotShape(part, site, world, hm, segs = DOT_SEGS) {
  const base = part.pos.length / 3;
  frameAt(site);
  const tan = new THREE.Vector3(), at = new THREE.Vector3();
  push(part, _up, drapeR(world, hm, _up));
  for (let i = 0; i < segs; i++) {
    walk(DOT_CELLS * CELL, tangentAt(i * 360 / segs, tan), at);
    push(part, at, drapeR(world, hm, at));
  }
  for (let i = 0; i < segs; i++) part.idx.push(base, base + 1 + i, base + 1 + (i + 1) % segs);
}

// The mini wreck a find leaves at the source, or null for a world with no source.
//
// The body is wreckGeometry() of ground-source.js, which stands about 18 units tall in the units of
// a patch. The whole model is scaled to WRECK_H globe radii, so the reader reads it as a thing on
// the globe and not as a second planet. It stands on the terrain of its cell, its up axis along the
// surface normal there, and it turns by the yaw of the source when the world states one.
//
// Neither mesh answers a ray. The pick of the globe in site.js takes the sphere and not the scene,
// so nothing here can catch a tap today; the empty raycast states the rule all the same, so a later
// pick that walks the scene still aims at the cell under the model and not at the model.
const _lampAt = new THREE.Vector3();
function makeWreckModel(world, hm) {
  const at = sourceSite(world);
  if (!at) return null;
  const geo = wreckGeometry();
  const bb = geo.boundingBox;
  const lamp = geo.userData.lamp || [0, bb.max.y, 0];
  const foot = Math.min(bb.min.y, 0);                   // the ground under the hull, in patch units
  const top = Math.max(bb.max.y, lamp[1]);
  const k = WRECK_H / Math.max(top - foot, 1e-6);       // globe radii per unit of the patch

  const obj = new THREE.Group();
  obj.name = 'carrier-wreck';
  const dir = siteDir(at.lat, at.lon, new THREE.Vector3());
  obj.position.copy(dir).multiplyScalar(drapeR(world, hm, dir));
  obj.quaternion.setFromUnitVectors(_yUp, dir);         // the up axis follows the surface normal
  obj.rotateY((world.source && world.source.yaw) || 0);
  obj.scale.setScalar(k);

  const hull = new THREE.Color(WRECK_HULL);
  const mat = new THREE.MeshStandardMaterial({
    color: hull, emissive: hull.clone().multiplyScalar(WRECK_EMIS),
    roughness: 0.6, metalness: 0.1, flatShading: true,
  });
  const body = new THREE.Mesh(geo, mat);
  body.position.y = -foot;
  body.renderOrder = RENDER_ORDER;
  body.raycast = () => {};
  obj.add(body);

  // The lamp: one additive shape over the mast, in the accent the wedges took. It blinks on the
  // clock of updateCarrierGroup() and it needs no light of its own, because additive paint reads on
  // the night side as well as on the lit side.
  const lampGeo = new THREE.OctahedronGeometry(WRECK_LAMP * (top - foot), 0);
  const lampMat = new THREE.MeshBasicMaterial({
    color: accentOf(world), transparent: true, opacity: 0.8,
    depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
  });
  const lampMesh = new THREE.Mesh(lampGeo, lampMat);
  lampMesh.position.set(lamp[0], lamp[1] - foot, lamp[2]);
  lampMesh.renderOrder = RENDER_ORDER + 1;
  lampMesh.raycast = () => {};
  // The scale takes the distance of the camera, which updateCarrierGroup() does not know. The
  // matrix takes the new scale on the next frame, and one frame of lag does not show.
  const lampR = WRECK_LAMP * WRECK_H;                   // globe radii: the lamp at its own size
  lampMesh.userData.blink = 1;
  lampMesh.onBeforeRender = (renderer, scene, camera) => {
    const d = _lampAt.setFromMatrixPosition(lampMesh.matrixWorld).distanceTo(camera.position);
    lampMesh.scale.setScalar(Math.max(1, d * WRECK_LAMP_MIN / lampR) * lampMesh.userData.blink);
  };
  obj.add(lampMesh);

  return { obj, geo, mat, lampGeo, lampMat, lamp: lampMesh, t: 0 };
}

// One blink. The lamp rises at once and falls away over the period, so the eye reads a machine that
// answers a clock. Nothing else of the model moves.
function blinkWreck(w, dt) {
  w.t = (w.t + dt) % WRECK_PERIOD;
  const k = WRECK_FLOOR + (1 - WRECK_FLOOR) * Math.exp(-(w.t / WRECK_PERIOD) * WRECK_FALL);
  w.lampMat.opacity = 0.3 + 0.6 * k;
  w.lamp.userData.blink = 0.7 + 0.5 * k;
}

// Take the mini wreck off a group and give its buffers back.
function dropWreck(u) {
  if (!u.wreck) return;
  u.wreck.obj.removeFromParent();
  u.wreck.geo.dispose();
  u.wreck.lampGeo.dispose();
  u.wreck.mat.dispose();
  u.wreck.lampMat.dispose();
  u.wreck = null;
}

function mesh(mat) {
  const m = new THREE.Mesh(toGeometry(newPart()), mat);
  m.renderOrder = RENDER_ORDER;
  m.visible = false;
  m.frustumCulled = false;      // the dots of one mesh stand all over the globe
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
    depthWrite: false,
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
// off the same reply. Every mark lies on the terrain and needs it. A caller that gives none gets
// the marks on the sphere of radius 1, which is what a world with no height map draws anyway.
//
// Two meshes and two materials, whatever the number of fixes: the dots of the settled fixes in one
// and the dot that fades in on the last landing in the other. The wedges themselves cost no mesh at
// all; they ride in the uniforms of the terrain and of the sea. A found world draws no dot and no
// wedge at all, and carries the mini wreck at the source instead.
export function makeCarrierGroup(world, record, heightMap = null) {
  if (!world || !world.source || !world.source.dir) return null;
  const accent = accentOf(world);
  const mats = {
    mark: material(accent, MARK_ALPHA),
    fadeMark: material(accent, 0),
  };
  const group = new THREE.Group();
  group.name = 'carrier';
  const meshes = {
    marks: mesh(mats.mark),
    fadeMark: mesh(mats.fadeMark),
  };
  for (const m of Object.values(meshes)) group.add(m);
  group.userData = {
    mats, meshes, world, hm: heightMap,
    fixes: (record && Array.isArray(record.fixes) ? record.fixes : []).slice(),
    found: !!(record && record.found),
    fade: null,       // { fix, t, k } while one wedge fades in
    wreck: null,      // the mini wreck of a find. makeWreckModel() builds it.
  };
  rebuild(group);
  return group;
}

// Draw the dots of the settled fixes, or stand the mini wreck at the source, and state the wedges
// in the uniforms. It runs on every change and not on every frame.
function rebuild(group) {
  const u = group.userData;
  const marks = newPart();
  if (u.found) {
    // The find takes the place of the search: no wedge and no dot, and the wreck at the source.
    if (!u.wreck) u.wreck = makeWreckModel(u.world, u.hm);
    if (u.wreck && u.wreck.obj.parent !== group) group.add(u.wreck.obj);
  } else {
    dropWreck(u);
    for (const fix of u.fixes) addDotShape(marks, fix, u.world, u.hm);
  }
  setShape(u.meshes.marks, marks);
  writeUniforms(group);
}

// Take the fading fix into the settled set.
function settle(group) {
  const u = group.userData;
  if (!u.fade) return;
  u.fixes.push(u.fade.fix);
  u.fade = null;
  u.mats.fadeMark.opacity = 0;
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
  const mark = newPart();
  addDotShape(mark, fix, u.world, u.hm);
  setShape(u.meshes.fadeMark, mark);
  u.mats.fadeMark.opacity = 0;
  u.fade = { fix, t: 0, k: 0 };
  rebuild(group);
}

// The reader has found the source. Slice 3 calls onSourceFound() in app.js, which calls this.
// The mini wreck the rebuild stands at the source sits on the terrain, so a caller that gives a new
// world gives its height map with it.
export function setFound(group, world, heightMap) {
  if (!group) return;
  const u = group.userData;
  if (world) u.world = world;
  if (heightMap) u.hm = heightMap;
  u.fade = null;
  u.mats.fadeMark.opacity = 0;
  u.meshes.fadeMark.visible = false;
  u.found = true;
  rebuild(group);
}

// The lamp of a find and the fade of a new wedge, in seconds. Nothing else on the group moves, so a
// group with neither costs two tests. The fading fix stands last in the uniforms, so the fade
// writes one float and one opacity.
export function updateCarrierGroup(group, dt) {
  if (!group) return;
  const u = group.userData;
  if (u.wreck) blinkWreck(u.wreck, dt);
  if (!u.fade) return;
  u.fade.t += dt;
  const k = THREE.MathUtils.clamp(u.fade.t / FADE_S, 0, 1);
  u.fade.k = THREE.MathUtils.smoothstep(k, 0, 1);
  u.mats.fadeMark.opacity = MARK_ALPHA * u.fade.k;
  if (uniformOwner === group && uniforms.uWedgeCount.value > 0) {
    uniforms.uWedgeFade.value[uniforms.uWedgeCount.value - 1] = u.fade.k;
  }
  if (k >= 1) settle(group);
}

// Give every buffer and every material back, and take the wedges out of the uniforms.
// disposeWorld() in app.js calls this before it walks the world group, so renderer.info.memory
// returns to the numbers it held before the landing.
export function disposeCarrierGroup(group) {
  if (!group) return;
  const u = group.userData;
  clearUniforms(group);
  dropWreck(u);
  for (const m of Object.values(u.meshes || {})) m.geometry.dispose();
  for (const m of Object.values(u.mats || {})) m.dispose();
  if (group.parent) group.parent.remove(group);
  group.clear();
  group.userData = {};
}
