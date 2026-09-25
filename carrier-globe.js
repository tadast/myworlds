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
// docs/probe.md. The planes below walk the same east bearingTo() measures against in site.js,
// (sin lon, 0, -cos lon), the direction of falling lon. The copy is not trusted: tools/
// carrier-fix-check.mjs builds the planes with wedgePlanes(), the one function the uniforms come
// from, and reads them back through bearingTo() and carrierAt() of site.js.
import * as THREE from 'three';
import { CELL, cellDir, groundRadius, siteCell, siteDir, sourceSite } from './site.js';
import { tangentFrame } from './cell-grid.js';
// The mini wreck of a find is the wreck of the ground, at the scale of the globe. wreck-geometry.js
// builds that body in wreckGeometry(hullOf(world)), which takes no DOM and does nothing at import, so the two
// models come from one builder and they cannot drift apart.
import { wreckGeometry, hullOf, WRECK_HULL } from './wreck-geometry.js';

// The number of wedges the shader holds. Four uniform slots of three vec3 and two floats cost 44
// floats, which every driver carries with room to spare. The first build held eight, and after
// eight landings the globe stood in wide wedges of the accent with lines everywhere: the reader
// could read no cross out of it. Four fixes give a cross and one check of that cross, which is the
// three to five landings the plan asks for. A world that holds more fixes draws the 4 newest;
// carrier-store.js keeps up to MAX_FIXES of them, and MAX_FIXES is 4 as well, so the store and the
// shader hold one set and a fifth landing drops the oldest.
export const MAX_WEDGES = 4;

// The tint of one wedge, as a part of the way from the lit colour to the accent of the palette.
// n wedges give 1 - pow(1 - WEDGE_STEP, n * n), so one wedge reads 0.06, two read 0.22, three read
// 0.43, and four read 0.63. The square of the count is the point: the wash grows faster than the
// count, so one wedge alone is almost only its two lines, and the ground two or more wedges cover
// stands out as the answer. The first build stepped by 1 - pow(1 - 0.08, n), and one wedge then
// washed as much ground as a crossing did. The line on each edge of a wedge carries the shape of
// one wedge; see WEDGE_EDGE.
const WEDGE_STEP = 0.06;
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
// degrees: the soft band on each edge of a wedge. The facets of the globe are 0.0105 units across,
// which is 0.6 degrees of arc, so a hard edge crawled from facet to facet as the world turned. The
// band is measured on the angle to the edge plane and not on the plane distance, so it holds the
// same width from the site to the antipode. sin of 0.15 degrees is the number the shader tests.
const WEDGE_SOFT = Math.sin(THREE.MathUtils.degToRad(0.15));
// degrees: the widest error a wedge may carry. The two half plane tests give the lune between the
// two edge great circles, and that lune is the wedge only while the wedge is narrower than a half
// plane. carrierAt() tops the error at 10 degrees today, so the clamp never bites.
const MAX_ERR = 89.5;

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
export const GOAL_WEDGES = 3;
export const GOAL_CELLS = 4;
const GOAL_LO = 0.35;
const GOAL_HI = 0.7;
const GOAL_PERIOD = 1.6;
// The step of the grid goalCell() fills the overlap on, as a part of a cell, and how far out it
// looks, in cells. An overlap that reaches the edge of the grid is far wider than GOAL_CELLS.
const GOAL_STEP = 1 / 4;
const GOAL_REACH = 12;
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

const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _up = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _yUp = new THREE.Vector3(0, 1, 0);   // the up axis of wreckGeometry(), in its own frame

// The three axes of a bearing at a site: east, north, and up.
//
// This is the frame of bearingTo() in site.js and not the frame of the box of a landing. The wedge
// is drawn on the globe, so it keeps the bearing of the globe. The needle of the overlay keeps the
// frame of the box instead, because the reader walks the terrain. See "the carrier" in site.js.
function frameAt(site) {
  const f = tangentFrame(site.lat, site.lon);
  _east.fromArray(f.east);                        // the east of groundBasis(): falling lon
  _north.fromArray(f.south).negate();             // the part of +y in the tangent plane
  _up.fromArray(f.up);                            // siteDir(lat, lon)
}

// The unit tangent at the site along a bearing in degrees. North is 0 and east is 90.
function tangentAt(brg, out = _tan) {
  const b = THREE.MathUtils.degToRad(brg);
  return out.copy(_north).multiplyScalar(Math.cos(b)).addScaledVector(_east, Math.sin(b));
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

// ---------------------------------------------------------------- the cell, as numbers
// A cell of the cube grid is bounded by four great circles: a line of one gnomonic coordinate on a
// face is a plane through the centre. So a cell is four inward plane normals, and a direction lies
// in the cell when all four dots are positive. The dot is the sine of the angle to that edge, so
// the shader draws one line width along all four edges.
const _ca = new THREE.Vector3(), _cb = new THREE.Vector3(), _cm = new THREE.Vector3();
const CELL_EDGES = [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]];
export function cellPlanes(site, out = [0, 1, 2, 3].map(() => new THREE.Vector3())) {
  const cell = siteCell(site);
  cellDir(cell, 0.5, 0.5, _cm);
  CELL_EDGES.forEach(([u0, v0, u1, v1], k) => {
    cellDir(cell, u0, v0, _ca);
    cellDir(cell, u1, v1, _cb);
    out[k].crossVectors(_ca, _cb).normalize();
    if (out[k].dot(_cm) < 0) out[k].negate();
  });
  return out;
}

// The dot of a direction with the four planes of a cell: the least of them, positive inside.
export function inCell(planes, dir) {
  return Math.min(...planes.map((n) => n.dot(dir)));
}

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

// ---------------------------------------------------------------- the goal
// The cell of the source, or null. It takes the wedges of the globe and fills their overlap on a
// grid of GOAL_STEP of a cell around the source, from the source out. The source always stands
// inside every wedge, because carrierAt() states a bearing inside its error, so the fill starts
// there. When the overlap holds less than GOAL_CELLS cells of area, the reader cannot miss the
// cell any more, and the globe fills it.
//
// The grid is the tangent plane at the source, and a direction on it takes a normalize. The
// overlap stands at most GOAL_REACH cells out, where the plane and the sphere part by under 0.1%.
const _gE = new THREE.Vector3(), _gN = new THREE.Vector3(), _gD = new THREE.Vector3();
export function goalCell(world, fixes) {
  if (!fixes || fixes.length < GOAL_WEDGES) return null;
  const at = sourceSite(world);
  if (!at) return null;
  const src = world.source.dir;
  const s = new THREE.Vector3(src[0], src[1], src[2]).normalize();
  const planes = fixes.map(wedgePlanes);
  _gE.set(0, 1, 0).cross(s);
  if (_gE.lengthSq() < 1e-8) _gE.set(1, 0, 0).cross(s);
  _gE.normalize();
  _gN.crossVectors(s, _gE);
  const h = GOAL_STEP * CELL;
  const R = Math.round(GOAL_REACH / GOAL_STEP);
  const dirAt = (i, j) => _gD.copy(s).addScaledVector(_gE, i * h).addScaledVector(_gN, j * h).normalize();
  const inAll = (d) => planes.every((p) => inWedge(p, d));
  if (!inAll(dirAt(0, 0))) return null;
  // the true area of a cell of the source, off its corners, in the units of the grid
  const cell = siteCell(at);
  const c00 = cellDir(cell, 0, 0), c10 = cellDir(cell, 1, 0), c01 = cellDir(cell, 0, 1);
  const cellArea = c10.sub(c00).cross(c01.sub(c00)).length();
  const most = GOAL_CELLS * cellArea / (h * h);
  const seen = new Set(['0,0']);
  const open = [[0, 0]];
  let count = 0;
  while (open.length) {
    const [i, j] = open.pop();
    if (++count >= most) return null;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj, key = a + ',' + b;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!inAll(dirAt(a, b))) continue;
      if (Math.abs(a) >= R || Math.abs(b) >= R) return null;   // the overlap runs off the grid
      open.push([a, b]);
    }
  }
  return at;
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
    cellPlanes(drawn[i], uniforms.uVisitN.value.slice(i * 4, i * 4 + 4));
  }
  u.goal = u.found ? sourceSite(u.world) : goalCell(u.world, drawn);
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

  const geo = wreckGeometry(hullOf(world));
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

// The colour of the carrier on one world: the wedges, the visited cells, and the pin of a find.
//
// The first build took the accent of the fauna palette, which a world can also hold in its terrain,
// and a wash of a colour on the same colour shows nothing. pickCarrierColour() reads the colours
// the globe draws and takes the candidate that stands farthest from them. The candidates are all
// saturated, because a wash of white on a green hill reads as a lighter green hill. The last three
// are dark, because a bright wash on an ice sheet shows nothing.
//
// It draws no random number, so the same world gets the same colour on each visit.
const CARRIER_COLOURS = ['#ff2fa0', '#19e3ff', '#ffe433', '#ff7b1c', '#8dff2e', '#a066ff', '#ff3b30', '#1f4bff', '#c4007a', '#7a1fd6'];
const CARRIER_SAMPLES = 3000;   // the most vertices one pick reads
const CARRIER_PCT = 0.1;        // a candidate is as good as its distance to the nearest tenth of the surface
const carrierColours = new WeakMap();

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
export function pickCarrierColour(world, col, pos = null) {
  if (!world || !col || col.length < 3) return accentOf(world);
  const n = col.length / 3;
  const step = Math.max(1, Math.floor(n / CARRIER_SAMPLES));
  const sea = world.hasOcean && world.seaRadius ? world.seaRadius : 0;
  const pal = world.palette || {};
  const ocean = sea && pal.ocean ? toYCC(..._c.set(pal.ocean).toArray(), [0, 0, 0]) : null;
  const samples = [];
  const v = [0, 0, 0];
  for (let i = 0; i < n; i += step) {
    const k = i * 3;
    if (sea && pos && Math.hypot(pos[k], pos[k + 1], pos[k + 2]) < sea) {
      if (ocean) samples.push(ocean);
      continue;
    }
    samples.push(toYCC(col[k], col[k + 1], col[k + 2], [0, 0, 0]));
  }
  if (!samples.length) return accentOf(world);
  let best = CARRIER_COLOURS[0], bestScore = -1;
  for (const hex of CARRIER_COLOURS) {
    toYCC(..._c.set(hex).toArray(), v);
    const d = samples.map((s) => Math.hypot(s[0] - v[0], s[1] - v[1], s[2] - v[2])).sort((a, b) => a - b);
    const score = d[Math.floor((d.length - 1) * CARRIER_PCT)];
    if (score > bestScore) { bestScore = score; best = hex; }
  }
  carrierColours.set(world, best);
  return best;
}
const _c = new THREE.Color();

const accentOf = (world) => (world && carrierColours.get(world))
  || (world && world.palette && world.palette.fauna && world.palette.fauna.accent) || '#ffffff';

// The group of one world, or null for a world with no source. `record` is the record of
// carrier-store.js: the fixes of this world and whether the reader has found the source.
//
// `heightMap` is the height map the worker sent with the world, which buildWorld() in app.js reads
// off the same reply. The mini wreck stands on the terrain and needs it.
//
// The group holds no mesh during the search: the wedges, the visited cells, and the goal cell all
// ride in the uniforms of the terrain and of the sea. A found world paints none of them, and
// carries the mini wreck at the source instead.
export function makeCarrierGroup(world, record, heightMap = null) {
  if (!world || !world.source || !world.source.dir) return null;
  const group = new THREE.Group();
  group.name = 'carrier';
  group.userData = {
    world, hm: heightMap,
    fixes: (record && Array.isArray(record.fixes) ? record.fixes : []).slice(),
    found: !!(record && record.found),
    fade: null,       // { fix, t, k } while one wedge fades in
    wreck: null,      // the mini wreck of a find. makeWreckModel() builds it.
    goal: null,       // the site of the goal cell, or null. goalCell() finds it.
    goalT: 0,         // seconds: the clock of the pulse of the goal
  };
  rebuild(group);
  return group;
}

// Stand the mini wreck at the source, or take it away, and state the paint in the uniforms. It
// runs on every change and not on every frame.
function rebuild(group) {
  const u = group.userData;
  if (u.found) {
    // The find takes the place of the search: no paint, and the wreck at the source.
    if (!u.wreck) u.wreck = makeWreckModel(u.world, u.hm);
    if (u.wreck && u.wreck.obj.parent !== group) group.add(u.wreck.obj);
  } else {
    dropWreck(u);
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
  u.fixes = u.fixes.filter((f) => f.lat !== fix.lat || f.lon !== fix.lon);
  if (!fade) { u.fixes.push(fix); rebuild(group); return; }
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
  u.found = true;
  rebuild(group);
}

// The model on the pin of a find, the pulse of the goal, and the fade of a new wedge, in seconds. The fading
// fix stands last in the uniforms, so the fade writes one float.
export function updateCarrierGroup(group, dt) {
  if (!group) return;
  const u = group.userData;
  if (u.wreck) floatWreck(u.wreck, dt);
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
  if (group.parent) group.parent.remove(group);
  group.clear();
  group.userData = {};
}
