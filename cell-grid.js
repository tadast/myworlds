// myworlds — the cell grid: the map that divides the sphere into cells, the map of the ground box
// a patch draws a cell into, and the frame of a site. generate.js, site.js, ground-sky.js,
// carrier-globe.js, and the Node tools import it, and none of them holds a copy. It holds no
// three.js and no DOM, because the module worker imports it. A direction is an array [x, y, z] of
// unit length in the planet's local frame; site.js turns the arrays into THREE.Vector3.
//
// ---------------------------------------------------------------- the grid, issue 30
// A cell is a quad of a cube grid and no longer a square of a band of latitude. A band grid
// changes its step of longitude at every band, so two cells in two bands do not share an edge,
// and their two patches could never be stitched. A cube grid tiles the whole globe with quads
// that share their edges exactly, and it holds no pole.
//
// Each face carries FACE_CELLS by FACE_CELLS cells. The grid coordinate w runs -1 to 1 across a
// face, and the gnomonic coordinate of the cube is tan(w * PI / 4). The tangent holds the arc of
// a cell nearly equal from the middle of a face to its corner; a plain gnomonic grid would leave
// a corner cell at about half the arc of a middle one. A coordinate past the face is legal and
// the map stays true there, which is what the rim of a patch needs.
//
// A cell is { face, i, j, n }: the face, the column and the row on it, and the cells a face side
// carries.
//
// Each row is the face normal, then the u axis, then the v axis, and u cross v is the normal.
const FACES = [
  [1, 0, 0, 0, 0, -1, 0, 1, 0],
  [-1, 0, 0, 0, 0, 1, 0, 1, 0],
  [0, 1, 0, 1, 0, 0, 0, 0, -1],
  [0, -1, 0, 1, 0, 0, 0, 0, 1],
  [0, 0, 1, 1, 0, 0, 0, 1, 0],
  [0, 0, -1, -1, 0, 0, 0, 1, 0],
];

// The patch cell. The reader picks a square of the globe and the whole square becomes the
// ground. CELL is the arc of that square in globe units, so it is the same size on the screen
// for every planet: about 62 px at the closest zoom, which the reader can see and aim at.
// A finer square would be false precision. The globe draws its surface from an icosphere at
// detail 100, which puts about 0.011 units between two vertices, so a square under CELL would
// sit inside one facet and the coast the reader aims at would not be where the field puts it.
//
// CELL is the nominal arc. The grid divides a face of a cube into whole cells, so a cell across its
// middle spans 0.71 to 1.00 of CELL: the narrowest stand at the corners of a face, and a cell in
// the middle spans a little over CELL. tools/cell-grid-check.mjs measures it.
export const CELL = 0.01;
// The arc of a face is PI / 2, so this many cells hold the arc of CELL each. The reader sees the
// same square at the same size on every planet, which is what issue 19 asked for.
export const FACE_CELLS = Math.round(Math.PI / 2 / CELL);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// The cell a unit direction falls in. The mirror of cellDir().
export function dirCell(x, y, z) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  const face = ax >= ay && ax >= az ? (x >= 0 ? 0 : 1) : ay >= az ? (y >= 0 ? 2 : 3) : (z >= 0 ? 4 : 5);
  const F = FACES[face];
  const d = x * F[0] + y * F[1] + z * F[2];
  const wa = Math.atan((x * F[3] + y * F[4] + z * F[5]) / d) * 4 / Math.PI;
  const wb = Math.atan((x * F[6] + y * F[7] + z * F[8]) / d) * 4 / Math.PI;
  const n = FACE_CELLS;
  const q = (w) => clamp(Math.floor((w + 1) * 0.5 * n), 0, n - 1);
  return { face, i: q(wa), j: q(wb), n };
}

// The unit direction at (u, v) inside a cell. u and v run 0 to 1 across the cell and may run past
// it. Writes x, y, z into out.
export function cellDir(cell, u, v, out = [0, 0, 0]) {
  return cellDirT(cell, cellTan(cell.i, u, cell.n), cellTan(cell.j, v, cell.n), out);
}

// The gnomonic coordinate of a cell coordinate. A row of the patch grid holds one of these for
// every column and one for the whole row, so the build takes two tangents a row and not two a
// vertex. A tangent costs more than the rest of the map together.
export function cellTan(ci, u, n) {
  return Math.tan(((ci + u) * 2 / n - 1) * Math.PI / 4);
}

// The unit direction at two gnomonic coordinates of the face of a cell. Writes x, y, z into out.
export function cellDirT(cell, a, b, out = [0, 0, 0]) {
  const F = FACES[cell.face];
  const x = F[0] + F[3] * a + F[6] * b;
  const y = F[1] + F[4] * a + F[7] * b;
  const z = F[2] + F[5] * a + F[8] * b;
  const l = Math.sqrt(x * x + y * y + z * z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}

// ---------------------------------------------------------------- the ground box
// A patch draws its cell into a square box, `size` units on a side, with the origin at the middle.
//
// The box runs x along the u axis of the cell and z against the v axis. For every face u cross v
// is the outward normal, so (u, up, v) is a left-handed set and (u, up, -v) is a right-handed
// one. A box with z along v drew the mirror of the cell: the coast turned the wrong way against
// the globe, and the sky of groundBasis() in ground-sky.js stood mirrored against the terrain. On
// the four faces of the equator u runs east and v runs north, so the box there has x east and z
// south with no twist. cellTwist() in site.js reads the same axes, and tools/frame-check.mjs
// fails on a mirror.

// The two gnomonic coordinates under a point of the ground box. xu and zu are units of the box from
// its middle. cellDirT() of the two gives the direction of the globe under the point.
export function boxTanX(cell, xu, size) { return cellTan(cell.i, 0.5 + xu / size, cell.n); }
export function boxTanZ(cell, zu, size) { return cellTan(cell.j, 0.5 - zu / size, cell.n); }

// A direction more than 80 degrees from the face of the cell has no point on the box. The map runs
// to infinity at a quarter turn from the face.
const BOX_FACE_MIN = Math.cos(80 * Math.PI / 180);

// The point of the ground box under a direction of the globe, in units of the box, or null.
//
// It is the exact inverse of boxTanX() and boxTanZ(): that map reads the two gnomonic coordinates
// of the cell at a point of the box and takes the direction, and this reads the two coordinates of
// a direction and takes the point. The box runs x along u and z against v, so z takes the sign the
// other way. So a direction inside the cell comes back as the place on the ground the reader can
// walk to. A direction outside that cell is legal: the gnomonic map stays true past the edge of a
// face, which is what the rim of a patch already needs. Gives null for a direction more than 80
// degrees from the face of the cell.
export function boxPoint(cell, dir, size) {
  const F = FACES[cell.face];
  const [x, y, z] = dir;
  const n = x * F[0] + y * F[1] + z * F[2];
  if (n <= BOX_FACE_MIN) return null;
  const a = (x * F[3] + y * F[4] + z * F[5]) / n;
  const b = (x * F[6] + y * F[7] + z * F[8]) / n;
  const u = (Math.atan(a) * 4 / Math.PI + 1) * 0.5 * cell.n - cell.i;
  const v = (Math.atan(b) * 4 / Math.PI + 1) * 0.5 * cell.n - cell.j;
  return { x: (u - 0.5) * size, z: (0.5 - v) * size };
}

// The way a step from the middle of a cell toward a direction runs in the box, as a unit vector
// (x, z), or null when the direction stands under the middle or at its antipode.
//
// It is the slope of boxPoint() at the middle of the cell. A plain projection on two axes of the
// cell will not do, because the map of the box holds no angle. It is a gnomonic map of a face of
// the cube with a tangent over it, and both stretch one way more than the other away from the
// middle of the face. Measured on the six faces, a projection stood up to 22 degrees off the true
// way.
//
// The slope, for a step from the middle along a tangent t:
//
//   n = d . N, a = (d . U) / n, b = (d . V) / n      the gnomonic coordinates of boxPoint()
//   x runs with atan(a), so dx/da is 1 / (1 + a * a), and z runs against atan(b) the same way
//   da for a step t is ((t . U) - a * (t . N)) / n, and db is ((t . V) - b * (t . N)) / n
//
// Every factor the two share falls out when the pair is made a unit vector, and the part of the
// direction that stands along the middle falls out on its own: it gives da and db of nothing. So a
// direction at any arc goes in whole, and the way holds even where boxPoint() gives null.
const _mid = [0, 0, 0];
export function boxHeading(cell, dir, out = { x: 0, z: 0 }) {
  const F = FACES[cell.face];
  const [mx, my, mz] = cellDir(cell, 0.5, 0.5, _mid);
  const n = mx * F[0] + my * F[1] + mz * F[2];
  const a = (mx * F[3] + my * F[4] + mz * F[5]) / n;
  const b = (mx * F[6] + my * F[7] + mz * F[8]) / n;
  const [x, y, z] = dir;
  const vn = x * F[0] + y * F[1] + z * F[2];
  const hx = (x * F[3] + y * F[4] + z * F[5] - a * vn) / (1 + a * a);
  const hz = -(x * F[6] + y * F[7] + z * F[8] - b * vn) / (1 + b * b);   // z runs against v
  const l = Math.hypot(hx, hz);
  if (l < 1e-12) return null;
  out.x = hx / l; out.z = hz / l;
  return out;
}

// ---------------------------------------------------------------- the frame of a site
// The frame of a site in degrees: up, then east, then south. East is the direction the planet
// turns to. A positive planet.rotation.y takes +x toward -z, and lon counts from +x toward +z, so
// east is the direction of falling lon. South is east cross up, so (east, up, south) is a
// right-handed set and the sky is not mirrored. North is the opposite of south: the part of +y in
// the tangent plane.
export function tangentFrame(lat, lon) {
  const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  const cla = Math.cos(la), sla = Math.sin(la), clo = Math.cos(lo), slo = Math.sin(lo);
  return {
    up: [cla * clo, sla, cla * slo],
    east: [slo, 0, -clo],                    // east has no y part
    south: [sla * clo, -cla, sla * slo],
  };
}
