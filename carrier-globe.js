// myworlds — the fixes of the carrier on the globe. Issue 34, slice 2.
//
// One landing gives one fix, and a fix draws two things: the outline of the cell the probe stood
// on, and a wedge that runs out from that cell along the bearing the instrument stated, plus and minus its
// error. A wedge covers half a great circle, from the site to the antipode of the site, because a
// bearing has a direction. Two wedges then cross in one region and not in two.
//
// Two wedges read stronger where they cross, and the reader reads that cross by eye. Decision 6 of
// issue 34 said the app computes no cross. The reader then found that three wedges can close on a
// region of a few cells that the eye still cannot split into one square to tap. So the app computes
// one thing: when three or more wedges overlap in less than GOAL_CELLS cells, it fills the cell of
// the source. See goalCell().
//
// **The wedge is paint on the terrain and not a shape in the sky.** The first build put every
// wedge on a shell of radius 1.07. The aim camera comes to 1.11, and from there a wedge stood as a
// sheet over the ground: the cross of two sheets held a large parallax against the relief, and the
// reader could not tell which cell lay under it. The wedge is now a tint the terrain shader and the
// ocean shader add to their own fragments, so it lies exactly on the ground it marks and it holds
// no parallax at any camera. patchCarrierMaterial() below installs it.
//
// The outline of a visited cell and the fill of the goal cell are paint too. The first build drew a
// dot of geometry on each visited cell, lifted over the flora. From the aim camera the lift read as
// a disc that flew over the ground, and the reader could not tell which cell it marked. The mini
// wreck of a find stays as geometry on the terrain: see drapeR().
//
// The group rides under current.planet, so the wreck turns with the world. The paint turns with the
// world for free, because the shader reads the direction of a fragment in the LOCAL frame of the
// planet and the fixes stand in that same frame.
//
// **East is easy to mirror**, and the sky of this app had that defect once; see decision 10 of
// docs/probe.md. The planes of wedge.js walk the same east bearingTo() of carrier.js measures
// against, (sin lon, 0, -cos lon), the direction of falling lon. The copy is not trusted: tools/
// carrier-fix-check.mjs builds the planes with wedgePlanes(), the one function the uniforms come
// from, and reads them back through bearingTo() and carrierAt().
//
// **Two searches.** The receiver follows one search at a time: the wreck, and the ruin of phase 2
// after the reader tunes. The view of the progress of chapters.js says which. The group paints the
// fixes of the search the receiver follows, in the colour of that search: the second colour
// of pickCarrierColour() stands far from the surface and far from the first colour, so the reader
// never takes a wedge of chapter 2 for a wedge of chapter 1. The pin and the mini wreck of the find
// of chapter 1 stand on their cell in both chapters, in the colour of chapter 1. p2-38. The find of
// chapter 2 stands a second pin at the ruin, with the mini ruin and a lamp that blinks, in the
// colour of chapter 2, and the pin of the wreck stays. p2-42.
import * as THREE from 'three';
import { groundRadius, siteDir, sourceSite } from './site.js';
import { WEDGE_STEP, WEDGE_SOFT, wedgePlanes, cellPlanes, goalCell } from './wedge.js';
// The mini wreck of a find is the wreck of the ground, at the scale of the globe. wreck-geometry.js
// builds that body in wreckGeometry(hullOf(world)), which takes no DOM and does nothing at import, so the two
// models come from one builder and they cannot drift apart.
import { wreckGeometry, hullOf, WRECK_HULL } from './wreck-geometry.js';
// The mini ruin of the find of chapter 2 is the ruin of the ground too, with the big parts only, at
// MINI_UNIT globe radii per unit of the box. ruin-geometry.js takes no DOM and imports no file of
// the page but ruin-types.js, so this import makes no cycle. p2-42.
import { ruinGeometry, ruinPalette, MINI_UNIT } from './ruin-geometry.js';
import { ruinMotifOf } from './music.js';
import { siteCell, sameCell } from './cell-grid.js';
import { MAX_FIXES } from './carrier-store.js';

// The number of wedges the shader holds. Four uniform slots of three vec3 and two floats cost 44
// floats, which every driver carries with room to spare. The first build held eight, and after
// eight landings the globe stood in wide wedges of the accent with lines everywhere: the reader
// could read no cross out of it. Four fixes give a cross and one check of that cross, which is the
// three to five landings the plan asks for. The store keeps MAX_FIXES fixes of a search, so the
// shader takes that number: the store and the shader hold one set, and a fifth landing drops the
// oldest.
export const MAX_WEDGES = MAX_FIXES;

// The tint of one wedge is WEDGE_STEP of wedge.js; see wedgeWash() there.
//
// The line on each edge of a wedge, as a part of the way to the accent, and its width in degrees.
// The eye finds the cross as the region the lines close, so the lines must read and the wash must
// not hide the ground. 0.45 degrees is about 2 px at the home zoom. The second build drew the line at
// 0.5 of the colour and 0.3 degrees wide, and one wedge alone was hard to find on a bright world.
const WEDGE_EDGE = 0.85;
const WEDGE_LINE = Math.sin(THREE.MathUtils.degToRad(0.45));
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
// The soft band on each edge of a wedge is WEDGE_SOFT of wedge.js.

// The outline of a visited cell: its width as the sine of the angle in from the edge, and its
// share of the way to the accent. A cell is about 0.01 of arc across, so the line takes a fifth of
// the half width. The fill inside the outline is faint, so the wedges under it still read.
const VISIT_LINE = 0.001;
const VISIT_EDGE = 0.9;
const VISIT_FILL = 0.2;
// The aim square: the width of its outline, and the fill inside it. It draws wider than the
// outline of a visited cell, so the reader tells the two apart.
const HOVER_LINE = 0.0014;
const HOVER_FILL = 0.12;
// The goal: the cell of the source, filled when GOAL_WEDGES or more wedges overlap in a region under
// GOAL_CELLS cells. The fill is white, because the ground under the cross already carries most of the
// accent, and it pulses over GOAL_PERIOD seconds between GOAL_LO and GOAL_HI.
const GOAL_LO = 0.35;
const GOAL_HI = 0.7;
const GOAL_PERIOD = 1.6;
// globe units: the lift of the mini wreck over the terrain. It must clear the
// flora of the globe, which stands 0.011 units tall: a lift of 0.0012 put a mark under the trees of
// a forest, and the reader saw nothing. The height map is also smoother than the facets of the
// globe, and the lift covers that too. It stays far under the 0.11 globe units the camera keeps
// over the surface at its nearest, so a mark still reads as a thing on the ground and not as a
// thing in the sky. depthTest stays on, so the far side of the globe still hides the part behind it.
export const DRAPE_LIFT = 0.014;

// ---------------------------------------------------------------- the pin of a find
// After the find the globe keeps the goal cell filled and stands a pin on it, with a small model of
// the wreck that floats at the top of the pin. The first build stood the wreck itself on the cell
// at 0.06 globe radii, which is about 290 km on a planet of 4,879 km: it read as the size of a
// country. The pin is thin, and the model is a sign of what the pin marks, not a thing to scale.
export const PIN_H = 0.03;      // globe radii: the pin, from the ground to the foot of the model
const PIN_R = 0.0006;           // globe radii: the pin at its top; it narrows to a point
// The least width of the pin and the least height of the model, as parts of the distance from the
// camera, so the two stay a few pixels wide from the home zoom and keep their own size near them.
const PIN_MIN = 0.0012;
export const MODEL_H = 0.012;   // globe radii: the floating model at its own size
const MODEL_MIN = 0.006;
const MODEL_ALPHA = 0.6;
// The hull stands on the lit globe and on the night side alike, so the body gives a little of its
// own colour back. Without it the model is a black chip over the dark half of the world.
const WRECK_EMIS = 0.35;
const MODEL_SPIN = 14;          // seconds: one turn of the model about the pin
const MODEL_BOB = 0.08;         // parts of MODEL_H: how far the model rises and falls
const MODEL_BOB_S = 3.2;        // seconds: one rise and fall
// The fill of the goal cell after the find. It does not pulse: the search is over.
const FOUND_K = 0.45;
const FADE_S = 1.2;             // seconds: a new wedge fades in over the end of the ascent
const RENDER_ORDER = 2;         // after the terrain and before the atmosphere shells of app.js

const _yUp = new THREE.Vector3(0, 1, 0);   // the up axis of wreckGeometry(), in its own frame

// ---------------------------------------------------------------- the wedge and the cell, as numbers
// wedge.js holds the arithmetic with no three.js: the planes of a wedge, the planes of a cell, and
// the goal. This file builds the uniforms from it, and gives the calls on to the page and the checks.
export { wedgePlanes, wedgeEdges, inWedge, wedgeCoverage, wedgeWash, cellPlanes, inCell, goalCell, GOAL_WEDGES, GOAL_CELLS } from './wedge.js';

// ---------------------------------------------------------------- the aim square
// The square of the cell the probe would land on, painted on the terrain and the sea like the
// wedges. A null site takes it off. The colour is the accent of the fauna palette, as before.
export function showMarker(site, current) {
  if (!site || !current) { uniforms.uHoverK.value = 0; return; }
  cellPlanes(site, uniforms.uHoverN.value);
  uniforms.uHoverCol.value.set(current.world.palette?.fauna?.accent || '#ffffff');
  uniforms.uWedgeSea.value = current.world.seaRadius || 0;
  uniforms.uHoverK.value = 0.9;
}


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
  // The four inward edge normals of each visited cell, four slots per wedge in the order of the
  // wedges, so a visited cell fades in with its wedge through uWedgeFade.
  uVisitN: { value: Array.from({ length: MAX_WEDGES * 4 }, () => new THREE.Vector3()) },
  // The four inward edge normals of the goal cell, and its fill. 0 draws no goal.
  uGoalN: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) },
  uGoalK: { value: 0 },
  // The aim square: the four inward edge normals of the cell under the pointer, its colour, and its
  // strength. 0 draws no square. showMarker() writes them.
  uHoverN: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) },
  uHoverCol: { value: new THREE.Color('#ffffff') },
  uHoverK: { value: 0 },
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
  uniform float uWedgeSea;
  uniform vec3 uVisitN[${MAX_WEDGES * 4}];
  uniform vec3 uGoalN[4];
  uniform float uGoalK;
  uniform vec3 uHoverN[4];
  uniform vec3 uHoverCol;
  uniform float uHoverK;`;

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
  if ((uWedgeCount > 0 || uGoalK > 0.0 || uHoverK > 0.0) && length(vCarrierDir) > uWedgeSea - 0.002) {
    vec3 wDir = normalize(vCarrierDir);
    float wN = 0.0;
    float wE = 0.0;
    float wV = 0.0;
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
      // the visited cell: the least distance in from its four edges, positive inside the cell
      float vM = min(min(dot(wDir, uVisitN[i * 4]), dot(wDir, uVisitN[i * 4 + 1])),
                     min(dot(wDir, uVisitN[i * 4 + 2]), dot(wDir, uVisitN[i * 4 + 3])));
      float vIn = smoothstep(0.0, ${WEDGE_SOFT.toFixed(7)}, vM);
      float vLine = 1.0 - smoothstep(${(VISIT_LINE * 0.6).toFixed(7)}, ${VISIT_LINE.toFixed(7)}, vM);
      wV = max(wV, uWedgeFade[i] * vIn * mix(${VISIT_FILL.toFixed(3)}, ${VISIT_EDGE.toFixed(3)}, vLine));
    }
    // the wash grows on the square of the count, so one wedge is almost only its lines and the
    // ground under two or more wedges stands out. wedgeWash() above is the same formula in JS.
    float wK = max(1.0 - pow(${(1 - WEDGE_STEP).toFixed(3)}, wN * wN), wE * ${WEDGE_EDGE.toFixed(3)});
    wK = max(wK, wV);
    outgoingLight = mix(outgoingLight, uWedgeCol, wK) + uWedgeCol * (wK * ${WEDGE_EMIS.toFixed(3)});
    if (uGoalK > 0.0) {
      float gM = min(min(dot(wDir, uGoalN[0]), dot(wDir, uGoalN[1])), min(dot(wDir, uGoalN[2]), dot(wDir, uGoalN[3])));
      float gIn = smoothstep(0.0, ${WEDGE_SOFT.toFixed(7)}, gM);
      outgoingLight = mix(outgoingLight, vec3(1.0), gIn * uGoalK);
    }
    if (uHoverK > 0.0) {
      float hM = min(min(dot(wDir, uHoverN[0]), dot(wDir, uHoverN[1])), min(dot(wDir, uHoverN[2]), dot(wDir, uHoverN[3])));
      float hIn = smoothstep(0.0, ${WEDGE_SOFT.toFixed(7)}, hM);
      float hLine = 1.0 - smoothstep(${(HOVER_LINE * 0.6).toFixed(7)}, ${HOVER_LINE.toFixed(7)}, hM);
      outgoingLight = mix(outgoingLight, uHoverCol, hIn * mix(${HOVER_FILL.toFixed(3)}, 1.0, hLine) * uHoverK);
    }
  }`;

// Paint the wedges and the aim square into one material of the globe. app.js calls it for the
// terrain material and the ocean material of every world with a surface, because every such world
// takes the aim square. A gas giant takes no patch and pays nothing. A world with no fix and no aim
// pays the three compares of WEDGE_TINT.
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
export function patchCarrierMaterial(material) {
  if (!material) return material;
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

// Put the fixes of a group into the uniforms. It runs on every change and not on every frame. The
// wedges, the visited cells, and the goal take the colour of the chapter that runs.
function writeUniforms(group) {
  const u = group.userData;
  uniformOwner = group;
  uniforms.uWedgeCol.value.set(carrierColour(u.world, u.chapter));
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
    cellPlanes(drawn[i], uniforms.uVisitN.value.slice(i * 4, i * 4 + 4));
  }
  // The goal is the cell of the source of this chapter: filled for good after its find, and
  // filled when the wedges close on it before that. One slot holds one cell, so in chapter 2 the
  // cell of the wreck gives up its fill, and the pin of its find still marks it.
  u.goal = u.found ? sourceSite(u.world, u.src) : goalCell(u.world, drawn, u.src);
  if (u.goal) cellPlanes(u.goal, uniforms.uGoalN.value);
  uniforms.uGoalK.value = goalK(u);
}

// The fill of the goal cell on this frame: it pulses, and it fades in with the wedge that closed it.
function goalK(u) {
  if (!u.goal) return 0;
  if (u.found) return FOUND_K;
  const beat = 0.5 - 0.5 * Math.cos(2 * Math.PI * u.goalT / GOAL_PERIOD);
  return (GOAL_LO + (GOAL_HI - GOAL_LO) * beat) * (u.fade ? u.fade.k : 1);
}

// The count goes to nothing, so a material that outlives its group paints no wedge.
function clearUniforms(group) {
  if (group && uniformOwner !== group) return;
  uniforms.uWedgeCount.value = 0;
  uniforms.uGoalK.value = 0;
  uniformOwner = null;
}

// ---------------------------------------------------------------- the marks on the ground
// The radius the mini wreck stands at under one direction: the ground there, or the sea when the
// ground lies under it, plus the lift. It needs the height map the worker sent with the world.
function drapeR(world, hm, dir) {
  return Math.max(groundRadius(world, hm, dir), (world && world.seaRadius) || 0) + DRAPE_LIFT;
}

// The pin a find leaves at the source, or null for a world with no source.
//
// The pin stands on the ground of the cell, its axis along the surface normal. The model on top is
// wreckGeometry() of ground-source.js, the body the reader walked up to on the patch, scaled to
// MODEL_H and see-through, and it turns slowly about the pin.
//
// Neither mesh answers a ray, so the pick of the globe in site.js still names the cell under them.
const _camAt = new THREE.Vector3();
function makeWreckModel(world, hm) {
  const at = sourceSite(world);
  if (!at) return null;
  const accent = accentOf(world);

  const obj = new THREE.Group();
  obj.name = 'carrier-wreck';
  const dir = siteDir(at.lat, at.lon, new THREE.Vector3());
  obj.position.copy(dir).multiplyScalar(drapeR(world, hm, dir) - DRAPE_LIFT);
  obj.quaternion.setFromUnitVectors(_yUp, dir);         // the up axis follows the surface normal

  const pinGeo = new THREE.CylinderGeometry(PIN_R, PIN_R * 0.25, PIN_H, 6, 1);
  pinGeo.translate(0, PIN_H / 2, 0);
  const pinMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9, toneMapped: false });
  const pin = new THREE.Mesh(pinGeo, pinMat);
  pin.renderOrder = RENDER_ORDER;
  pin.raycast = () => {};
  // The width takes the distance of the camera, which updateCarrierGroup() does not know. The
  // matrix takes the new scale on the next frame, and one frame of lag does not show.
  pin.onBeforeRender = (renderer, scene, camera) => {
    const d = _camAt.setFromMatrixPosition(obj.matrixWorld).distanceTo(camera.position);
    const k = Math.max(1, d * PIN_MIN / PIN_R);
    pin.scale.set(k, 1, k);
  };
  obj.add(pin);

  const geo = wreckGeometry(hullOf(world), { camp: false });
  const bb = geo.boundingBox;
  const foot = Math.min(bb.min.y, 0);                   // the ground under the hull, in patch units
  const unit = MODEL_H / Math.max(bb.max.y - foot, 1e-6); // globe radii per unit of the patch
  const hull = new THREE.Color(WRECK_HULL);
  const mat = new THREE.MeshStandardMaterial({
    color: hull, emissive: hull.clone().lerp(new THREE.Color(accent), 0.5).multiplyScalar(WRECK_EMIS),
    roughness: 0.6, metalness: 0.1, flatShading: true,
    transparent: true, opacity: MODEL_ALPHA, depthWrite: false,
  });
  const float = new THREE.Group();
  float.position.y = PIN_H;
  obj.add(float);
  const body = new THREE.Mesh(geo, mat);
  body.position.y = -foot * unit;
  body.scale.setScalar(unit);
  body.renderOrder = RENDER_ORDER + 1;
  body.raycast = () => {};
  body.onBeforeRender = (renderer, scene, camera) => {
    const d = _camAt.setFromMatrixPosition(obj.matrixWorld).distanceTo(camera.position);
    float.scale.setScalar(Math.max(1, d * MODEL_MIN / MODEL_H));
  };
  float.add(body);
  obj.rotateY((world.source && world.source.yaw) || 0);

  return { obj, geo, mat, pinGeo, pinMat, pin, float, body, t: 0 };
}

// The model turns about the pin and rises and falls a little over it. The pin stands still.
function floatWreck(w, dt) {
  w.t += dt;
  w.float.rotation.y = (w.t / MODEL_SPIN) * Math.PI * 2;
  w.float.position.y = PIN_H + MODEL_H * MODEL_BOB * Math.sin((w.t / MODEL_BOB_S) * Math.PI * 2);
}

// Take the pin off a group and give its buffers back.
function dropWreck(u) {
  if (!u.wreck) return;
  u.wreck.obj.removeFromParent();
  u.wreck.geo.dispose();
  u.wreck.pinGeo.dispose();
  u.wreck.mat.dispose();
  u.wreck.pinMat.dispose();
  u.wreck = null;
}

// ---------------------------------------------------------------- the pin of the find of the ruin
// The find of chapter 2 stands a second pin, at the cell of the ruin, in the colour of chapter 2.
// The model on top is the mini body of ruinGeometry(), in the stone of the world type, at MINI_UNIT
// globe radii per unit: the spires stand 4.9 times the mini wreck and the colossus 1.2 times, and
// the model takes the least size of the mini wreck, so the two keep their ratio at every zoom. The
// pin of the wreck stays. p2-42.
//
// The model carries a lamp at the lamp of the ruin: a small point in the colour of chapter 2 that
// blinks and holds a least size on the screen, so the reader finds the ruin from the home zoom.
const RUIN_LAMP_R = 0.0012;     // globe radii: the lamp at its own size
const RUIN_LAMP_MIN = 0.0035;   // the least radius of the lamp, as a part of the distance from the camera
const RUIN_EMIS = 0.3;          // the share of its own colour the stone gives back on the night side

// The lamp of the mini ruin blinks ruinMotifOf() of music.js, the motif of the ruin, as the glow on
// the ground does: on music.ruinClock() when the sound runs, so the eye and the ear agree, and on the
// clock of the group when it does not. updateCarrierGroup() takes the music for that clock. p2-44.

// The level of the lamp, 0 to 1, at one point of the period of the rhythm: a floor that never goes
// out, a fast tail on each step, and a breath once a bar. These are the rules of lampLevel() in
// ground-source.js. That file imports this one, so the rules stand here as a copy and not an import.
function ruinLampLevel(m, clock) {
  let k = 0;
  for (const st of m.steps) {
    const age = clock - st * m.stepDur;
    if (age < 0 || age > m.stepDur * 4) continue;
    k = Math.max(k, Math.exp(-age / (m.stepDur * 0.42)));
  }
  const floor = 0.14 + 0.3 * (0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / (m.period / 4)));
  return floor + (1 - floor) * k;
}

// Chapter 3: the twin takes the same pin after the arrival, with `src` the twin: the same proto,
// the same stone, and the same colour, so the two pins read as one thing in two places.
function makeRuinModel(world, hm, src = world && world.ruin) {
  const ruin = src;
  const at = ruin && ruin.proto && sourceSite(world, ruin);
  if (!at) return null;
  const colour = new THREE.Color(carrierColour(world, 2));

  const obj = new THREE.Group();
  obj.name = ruin.kind === 'twin' ? 'carrier-twin' : 'carrier-ruin';
  const dir = siteDir(at.lat, at.lon, new THREE.Vector3());
  obj.position.copy(dir).multiplyScalar(drapeR(world, hm, dir) - DRAPE_LIFT);
  obj.quaternion.setFromUnitVectors(_yUp, dir);

  const pinGeo = new THREE.CylinderGeometry(PIN_R, PIN_R * 0.25, PIN_H, 6, 1);
  pinGeo.translate(0, PIN_H / 2, 0);
  const pinMat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9, toneMapped: false });
  const pin = new THREE.Mesh(pinGeo, pinMat);
  pin.renderOrder = RENDER_ORDER;
  pin.raycast = () => {};
  pin.onBeforeRender = (renderer, scene, camera) => {
    const d = _camAt.setFromMatrixPosition(obj.matrixWorld).distanceTo(camera.position);
    const k = Math.max(1, d * PIN_MIN / PIN_R);
    pin.scale.set(k, 1, k);
  };
  obj.add(pin);

  const { body: geo, lamp: L } = ruinGeometry(ruin.proto, world, { mini: true });
  geo.computeBoundingBox();
  const foot = Math.min(geo.boundingBox.min.y, 0);
  const stone = new THREE.Color(ruinPalette(world.type).stone);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0,
    emissive: stone.clone().lerp(colour, 0.35).multiplyScalar(RUIN_EMIS),
    transparent: true, opacity: MODEL_ALPHA, depthWrite: false,
  });
  const float = new THREE.Group();
  float.position.y = PIN_H;
  obj.add(float);
  const body = new THREE.Mesh(geo, mat);
  body.position.y = -foot * MINI_UNIT;
  body.scale.setScalar(MINI_UNIT);
  body.renderOrder = RENDER_ORDER + 1;
  body.raycast = () => {};
  // The least size of the mini wreck, so the ruin keeps its ratio to the wreck at every zoom.
  const least = (camera) => Math.max(1, _camAt.setFromMatrixPosition(obj.matrixWorld).distanceTo(camera.position) * MODEL_MIN / MODEL_H);
  body.onBeforeRender = (renderer, scene, camera) => { float.scale.setScalar(least(camera)); };
  float.add(body);

  // The lamp stands on the lamp of the body, inside the float, so it turns and bobs with the model.
  // The stone writes no depth, so the lamp draws over it: the lamp of the well stands in the mouth,
  // and the reader must see it. The globe still hides the lamp on its far side.
  const lampGeo = new THREE.OctahedronGeometry(RUIN_LAMP_R, 0);
  const lampMat = new THREE.MeshBasicMaterial({
    color: colour, transparent: true, opacity: 0.95, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.position.set(L[0] * MINI_UNIT, (L[1] - foot) * MINI_UNIT, L[2] * MINI_UNIT);
  lamp.renderOrder = RENDER_ORDER + 2;
  lamp.raycast = () => {};
  lamp.onBeforeRender = (renderer, scene, camera) => {
    const d = _camAt.setFromMatrixPosition(obj.matrixWorld).distanceTo(camera.position);
    lamp.scale.setScalar(Math.max(1, (d * RUIN_LAMP_MIN) / (RUIN_LAMP_R * least(camera))));
  };
  float.add(lamp);

  return {
    obj, geo, mat, pinGeo, pinMat, pin, float, body, lamp, lampGeo, lampMat, colour,
    rhythm: ruinMotifOf(world), t: 0,
  };
}

// The model of the ruin turns and bobs as the model of the wreck does, and its lamp blinks.
function floatRuin(r, dt, music) {
  floatWreck(r, dt);
  const p = r.rhythm.period;
  const c = music && music.ruinClock ? music.ruinClock() : null;
  r.level = ruinLampLevel(r.rhythm, c != null ? c : ((r.t % p) + p) % p);
  r.lampMat.color.copy(r.colour).multiplyScalar(0.3 + 0.7 * r.level);
}

// Take the pin of the ruin, or of the twin with `key` 'twin', off a group and give its buffers back.
function dropRuin(u, key = 'ruin') {
  if (!u[key]) return;
  const r = u[key];
  r.obj.removeFromParent();
  for (const x of [r.geo, r.pinGeo, r.lampGeo, r.mat, r.pinMat, r.lampMat]) x.dispose();
  u[key] = null;
}

// The colour of the carrier on one world: the wedges, the visited cells, and the pin of a find.
//
// The first build took the accent of the fauna palette, which a world can also hold in its terrain,
// and a wash of a colour on the same colour shows nothing. pickCarrierColour() reads the colours
// the globe draws and takes the candidate that stands farthest from them. The candidates are all
// saturated, because a wash of white on a green hill reads as a lighter green hill. The last three
// are dark, because a bright wash on an ice sheet shows nothing.
//
// It draws no random number, so the same world gets the same colour on each visit.
//
// **The second colour.** Chapter 2 of the search paints its wedges in a colour of its own, so the
// reader never takes a wedge of the ruin for a wedge of the wreck. The pick keeps the rule of the
// first colour and adds one: of the candidates that stand far from the surface, the one that also
// stands farthest from the first colour. A candidate stands far from the surface when its score
// reaches CARRIER_FAR of the best score. p2-38.
//
// The drawings of the brief mark the next landing in BRIEF_MARK, the second accent of the page, and
// in chapter 2 they paint the wedges in the colour of chapter 2. So chapter 2 takes no candidate
// nearer to BRIEF_MARK than MARK_APART: an orange wedge beside the orange mark of the next landing
// did not read as two things. That drops the orange and the yellow. The manager, after p2-39.
const CARRIER_COLOURS = ['#ff2fa0', '#19e3ff', '#ffe433', '#ff7b1c', '#8dff2e', '#a066ff', '#ff3b30', '#1f4bff', '#c4007a', '#7a1fd6'];
const CARRIER_SAMPLES = 3000;   // the most vertices one pick reads
const CARRIER_PCT = 0.1;        // a candidate is as good as its distance to the nearest tenth of the surface
const CARRIER_FAR = 0.7;        // the share of the best score a candidate for chapter 2 must reach
const BRIEF_MARK = '#ffb86b';    // the mark of the next landing in the drawings of the brief
const MARK_APART = 0.35;         // the least distance of a colour of chapter 2 from BRIEF_MARK, in toYCC()
const carrierColours = new WeakMap();   // world to [the colour of chapter 1, the colour of chapter 2]

// A colour as luma and two chroma parts, from linear RGB, with a square root for the gamma.
function toYCC(r, g, b, out) {
  r = Math.sqrt(Math.max(r, 0)); g = Math.sqrt(Math.max(g, 0)); b = Math.sqrt(Math.max(b, 0));
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  out[0] = y; out[1] = b - y; out[2] = r - y;
  return out;
}

// col is the colour attribute of the terrain (linear RGB, 3 floats a vertex). pos is its position
// attribute, which lets the pick skip the sea bed; a world with a sea counts the colour of the sea
// one time for each vertex it skips. Without col the pick keeps the accent of the palette.
//
// It gives the colour of chapter 1 and keeps both colours for the world. carrierColour() below
// reads either one.
export function pickCarrierColour(world, col, pos = null) {
  if (!world || !col || col.length < 3) return accentOf(world);
  const n = col.length / 3;
  const step = Math.max(1, Math.floor(n / CARRIER_SAMPLES));
  const sea = world.hasOcean && world.seaRadius ? world.seaRadius : 0;
  const pal = world.palette || {};
  const ocean = sea && pal.ocean ? toYCC(..._c.set(pal.ocean).toArray(), [0, 0, 0]) : null;
  const samples = [];
  for (let i = 0; i < n; i += step) {
    const k = i * 3;
    if (sea && pos && Math.hypot(pos[k], pos[k + 1], pos[k + 2]) < sea) {
      if (ocean) samples.push(ocean);
      continue;
    }
    samples.push(toYCC(col[k], col[k + 1], col[k + 2], [0, 0, 0]));
  }
  if (!samples.length) return accentOf(world);
  const rows = CARRIER_COLOURS.map((hex) => {
    const at = toYCC(..._c.set(hex).toArray(), [0, 0, 0]);
    const d = samples.map((s) => Math.hypot(s[0] - at[0], s[1] - at[1], s[2] - at[2])).sort((a, b) => a - b);
    return { hex, at, score: d[Math.floor((d.length - 1) * CARRIER_PCT)] };
  });
  let best = rows[0];
  for (const r of rows) if (r.score > best.score) best = r;
  // chapter 2: far from the surface first, then as far as it can stand from the first colour
  const mark = toYCC(..._c.set(BRIEF_MARK).toArray(), [0, 0, 0]);
  const clear = (r) => Math.hypot(r.at[0] - mark[0], r.at[1] - mark[1], r.at[2] - mark[2]) >= MARK_APART;
  const others = rows.filter((r) => r !== best && clear(r));
  const far = others.filter((r) => r.score >= best.score * CARRIER_FAR);
  const apart = (r) => Math.hypot(r.at[0] - best.at[0], r.at[1] - best.at[1], r.at[2] - best.at[2]);
  let second = null;
  for (const r of far.length ? far : others) if (!second || apart(r) > apart(second)) second = r;
  carrierColours.set(world, [best.hex, second ? second.hex : best.hex]);
  return best.hex;
}
const _c = new THREE.Color();

const accentOf = (world) => (world && carrierColours.get(world) && carrierColours.get(world)[0])
  || (world && world.palette && world.palette.fauna && world.palette.fauna.accent) || '#ffffff';

// The colour of one chapter of the search on a world, as a hex string: 1 is the wreck and 2 the
// ruin. pickCarrierColour() sets both when app.js builds the world; before that, and on a world it
// never read, both chapters take the accent of the palette. The glow of the ruin (p2-41) and its
// card (p2-42) take the colour of chapter 2 from here, so the ruin reads in one colour everywhere.
export function carrierColour(world, chapter = 1) {
  const pair = world && carrierColours.get(world);
  if (!pair) return accentOf(world);
  return chapter === 2 ? pair[1] : pair[0];
}

// The group of one world, or null for a world with no source. `view` is view() of the progress of
// chapters.js: the group paints the fixes of the search the receiver follows, `view.follow`, and
// stands a pin at the source of every search that is done. The group takes the fixes of the view as
// they are: the view computes their bearings again. A find, a tune, and a clear build the group
// again from the new view.
//
// `heightMap` is the height map the worker sent with the world, which buildWorld() in app.js reads
// off the same reply. The mini wreck and the mini ruin stand on the terrain and need it.
//
// The group holds no mesh during the search: the wedges, the visited cells, and the goal cell all
// ride in the uniforms of the terrain and of the sea. A chapter whose source is found paints none
// of them. The find of the wreck stands the mini wreck at the wreck, whatever search runs, and the
// find of the ruin stands the mini ruin at the ruin. p2-42.
export function makeCarrierGroup(world, view, heightMap = null) {
  if (!world || !world.source || !world.source.dir || !view || !view.follow) return null;
  const part = view.chapters[view.follow.index];
  const group = new THREE.Group();
  group.name = 'carrier';
  group.userData = {
    world, hm: heightMap,
    chapter: view.follow.n,                   // the colour of the search: 1 the wreck, 2 the ruin
    src: view.follow.source,                  // the source of the search the receiver follows
    fixes: part.fixes.slice(),
    found: part.state === 'done',             // the source of this search is found
    wreckFound: !!view.found.wreck,           // the wreck is found, whatever search runs
    ruinFound: !!view.found.ruin,             // the ruin is found
    twinFound: !!view.found.way,              // chapter 3: the probe has stood at the twin
    fade: null,       // { fix, t, k } while one wedge fades in
    wreck: null,      // the mini wreck of a find. makeWreckModel() builds it.
    ruin: null,       // the mini ruin of the find of chapter 2. makeRuinModel() builds it. p2-42
    twin: null,       // the mini twin of chapter 3, on the same pattern
    goal: null,       // the site of the goal cell, or null. goalCell() finds it.
    goalT: 0,         // seconds: the clock of the pulse of the goal
  };
  rebuild(group);
  return group;
}

// Stand the mini wreck at the wreck, or take it away, and state the paint in the uniforms. It
// runs on every change and not on every frame.
function rebuild(group) {
  const u = group.userData;
  if (u.wreckFound) {
    // The find takes the place of the search of chapter 1: the wreck at the source, in the colour
    // of chapter 1, whichever chapter runs now.
    if (!u.wreck) u.wreck = makeWreckModel(u.world, u.hm);
    if (u.wreck && u.wreck.obj.parent !== group) group.add(u.wreck.obj);
  } else {
    dropWreck(u);
  }
  // The find of the ruin stands its own pin at the ruin, in the colour of chapter 2. p2-42.
  if (u.ruinFound) {
    if (!u.ruin) u.ruin = makeRuinModel(u.world, u.hm);
    if (u.ruin && u.ruin.obj.parent !== group) group.add(u.ruin.obj);
  } else {
    dropRuin(u);
  }
  // Chapter 3: the arrival at the twin stands a pin of its own at the twin.
  if (u.twinFound && u.world.twin) {
    if (!u.twin) u.twin = makeRuinModel(u.world, u.hm, u.world.twin);
    if (u.twin && u.twin.obj.parent !== group) group.add(u.twin.obj);
  } else {
    dropRuin(u, 'twin');
  }
  writeUniforms(group);
}

// Take the fading fix into the settled set.
function settle(group) {
  const u = group.userData;
  if (!u.fade) return;
  u.fixes.push(u.fade.fix);
  u.fade = null;
  rebuild(group);
}

// Add the fix of a landing. `fade` fades the new wedge and its cell in over 1.2 s: the ascent ends
// over the site, so the reader watches the wedge arrive. Without it the wedge stands there at once,
// which is what a world built from the store needs.
//
// A fix on a cell that already holds one replaces it, as the store does: the instrument states the
// same bearing on every visit, so the second wedge would only draw over the first.
export function addWedge(group, fix, { fade = false } = {}) {
  if (!group || !fix) return;
  const u = group.userData;
  if (u.found) return;                 // the wedges of a found world are gone for good
  if (u.fade) settle(group);
  const here = siteCell(fix.lat, fix.lon);
  u.fixes = u.fixes.filter((f) => !sameCell(siteCell(f.lat, f.lon), here));
  if (!fade) { u.fixes.push(fix); rebuild(group); return; }
  u.fade = { fix, t: 0, k: 0 };
  rebuild(group);
}

// The model on the pin of a find, the pulse of the goal, and the fade of a new wedge, in seconds. The fading
// fix stands last in the uniforms, so the fade writes one float. `music` is the Music of the app, or
// null: the lamp of the mini ruin reads its ruinClock(). p2-44.
export function updateCarrierGroup(group, dt, music = null) {
  if (!group) return;
  const u = group.userData;
  if (u.wreck) floatWreck(u.wreck, dt);
  if (u.ruin) floatRuin(u.ruin, dt, music);
  if (u.twin) floatRuin(u.twin, dt, music);
  if (u.fade) {
    u.fade.t += dt;
    const k = THREE.MathUtils.clamp(u.fade.t / FADE_S, 0, 1);
    u.fade.k = THREE.MathUtils.smoothstep(k, 0, 1);
    if (uniformOwner === group && uniforms.uWedgeCount.value > 0) {
      uniforms.uWedgeFade.value[uniforms.uWedgeCount.value - 1] = u.fade.k;
    }
    if (k >= 1) settle(group);
  }
  if (u.goal && !u.found) {
    u.goalT = (u.goalT + dt) % GOAL_PERIOD;
    if (uniformOwner === group) uniforms.uGoalK.value = goalK(u);
  }
}

// Give every buffer and every material back, and take the wedges out of the uniforms.
// disposeWorld() in app.js calls this before it walks the world group, so renderer.info.memory
// returns to the numbers it held before the landing.
export function disposeCarrierGroup(group) {
  if (!group) return;
  const u = group.userData;
  clearUniforms(group);
  dropWreck(u);
  dropRuin(u);
  dropRuin(u, 'twin');
  if (group.parent) group.parent.remove(group);
  group.clear();
  group.userData = {};
}
