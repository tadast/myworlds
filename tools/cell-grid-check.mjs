// The properties of cell-grid.js, with no browser and no three.js.
//
//   node tools/cell-grid-check.mjs
//
// cell-grid.js is the one copy of the cell grid, the map of the ground box, and the frame of a
// site. generate.js builds every patch on it and site.js aims every landing with it, so a fault
// here moves the ground under the reader. The checks read the interface of cell-grid.js only:
//
// 1. The round trip. A direction inside a cell goes back to that cell through dirCell().
// 2. The edges. Two cells side by side on a face share their edge to the bit, and a step across
//    any edge, the edges of the faces too, lands in a cell next door and not far away.
// 3. The arc. Every cell of the grid is nearly the same size: CELL or a little under it.
// 4. The box. boxPoint() is the inverse of boxTanX() and boxTanZ(), over the box and the rim.
// 5. The hand. The box is right-handed: x cross up is z. A mirror of the cell fails here.
// 6. The heading. boxHeading() points the way a short step toward a direction moves on the box.
// 7. The frame. tangentFrame() gives three unit axes at right angles, east has no y part, and
//    east cross up is south.
// 8. The site. The middle of every cell of the grid, at two decimals of a degree, falls back in
//    that cell, so the site of record carries its cell and the patch call builds the cell the
//    reader aimed at. siteDir() is the up axis of tangentFrame(), and cellArc() is the arc of 3.
import {
  CELL, FACE_CELLS, dirCell, cellDir, cellDirT, boxTanX, boxTanZ, boxPoint, boxHeading, tangentFrame,
  siteDir, dirSite, siteCell, cellSite, sameCell, cellArc,
} from '../cell-grid.js';

const SIZE = 3000;          // units: the side of the box on HIGH
const RIM = 4000;           // units: how far the rim reaches, RIM of tiers.js
const BOX_TOL = 1e-6;       // parts of the box: how far boxPoint() may miss
const HEAD_TOL = 1e-5;      // radians: how far boxHeading() may stand off the true step
const FRAME_TOL = 1e-12;
const ARC_MIN = 0.7, ARC_MAX = 1.01;   // parts of CELL a cell may span, across its middle

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(34);
const randDir = () => {
  const y = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
  return [r * Math.cos(a), y, r * Math.sin(a)];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const arc = (a, b) => Math.acos(Math.min(1, Math.max(-1, dot(a, b))));
const same = (a, b) => a.face === b.face && a.i === b.i && a.j === b.j;
const name = (c) => `face ${c.face} cell ${c.i},${c.j}`;

const fails = [];
const fail = (what, text) => { if (fails.length < 12) fails.push(`${what}: ${text}`); };
const report = [];

// ---------------------------------------------------------------- 1: the round trip
{
  let n = 0;
  for (let k = 0; k < 20000; k++) {
    const d = randDir();
    const c = dirCell(...d);
    const u = 0.001 + rnd() * 0.998, v = 0.001 + rnd() * 0.998;
    const back = dirCell(...cellDir(c, u, v));
    if (!same(back, c)) fail('round trip', `${name(c)} at ${u.toFixed(3)},${v.toFixed(3)} fell in ${name(back)}`);
    n++;
  }
  report.push(`  round trip  ${n} points inside a cell went back to that cell`);
}

// ---------------------------------------------------------------- 2: the edges
{
  let inner = 0, worstStep = 0;
  for (let k = 0; k < 5000; k++) {
    const c = dirCell(...randDir());
    if (c.i < c.n - 1) {
      const v = rnd();
      const a = cellDir(c, 1, v), b = cellDir({ ...c, i: c.i + 1 }, 0, v);
      if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) fail('edge', `${name(c)}: the u edge differs from the cell next door`);
      inner++;
    }
    // A step across an edge, the edges of the faces included: the far side must be a neighbour.
    const edge = [[1, rnd()], [0, rnd()], [rnd(), 1], [rnd(), 0]][k % 4];
    const out = [edge[0] === 1 ? 1.0001 : edge[0] === 0 ? -0.0001 : edge[0], edge[1] === 1 ? 1.0001 : edge[1] === 0 ? -0.0001 : edge[1]];
    const far = dirCell(...cellDir(c, out[0], out[1]));
    const gap = arc(cellDir(c, 0.5, 0.5), cellDir(far, 0.5, 0.5)) / CELL;
    worstStep = Math.max(worstStep, gap);
    if (same(far, c) || gap > 1.6) fail('step', `${name(c)}: a step across an edge landed in ${name(far)}, ${gap.toFixed(2)} cells away`);
  }
  report.push(`  edges       ${inner} inner edges shared to the bit; a step across an edge landed at most ${worstStep.toFixed(2)} cells away`);
}

// ---------------------------------------------------------------- 3: the arc
{
  let lo = Infinity, hi = 0;
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < FACE_CELLS; i++) {
      for (let j = 0; j < FACE_CELLS; j += 4) {
        const c = { face, i, j, n: FACE_CELLS };
        const w = arc(cellDir(c, 0, 0.5), cellDir(c, 1, 0.5)) / CELL;
        const h = arc(cellDir(c, 0.5, 0), cellDir(c, 0.5, 1)) / CELL;
        lo = Math.min(lo, w, h); hi = Math.max(hi, w, h);
      }
    }
  }
  if (lo < ARC_MIN || hi > ARC_MAX) fail('arc', `a cell spans ${lo.toFixed(3)} to ${hi.toFixed(3)} of CELL, not ${ARC_MIN} to ${ARC_MAX}`);
  report.push(`  arc         every cell spans ${lo.toFixed(3)} to ${hi.toFixed(3)} of CELL across its middle`);
}

// ---------------------------------------------------------------- 4 and 5: the box and its hand
{
  let worst = 0, n = 0;
  for (let k = 0; k < 400; k++) {
    const c = dirCell(...randDir());
    for (let s = 0; s < 20; s++) {
      const x = (rnd() * 2 - 1) * RIM, z = (rnd() * 2 - 1) * RIM;
      const d = cellDirT(c, boxTanX(c, x, SIZE), boxTanZ(c, z, SIZE));
      const p = boxPoint(c, d, SIZE);
      if (!p) { fail('box', `${name(c)}: the point ${x.toFixed(0)},${z.toFixed(0)} of the rim has no point back`); continue; }
      const off = Math.hypot(p.x - x, p.z - z) / SIZE;
      worst = Math.max(worst, off);
      if (off > BOX_TOL) fail('box', `${name(c)}: ${x.toFixed(1)},${z.toFixed(1)} came back at ${p.x.toFixed(4)},${p.z.toFixed(4)}`);
      n++;
    }
    const up = cellDir(c, 0.5, 0.5);
    const at = cellDirT(c, boxTanX(c, 0, SIZE), boxTanZ(c, 0, SIZE));
    const dx = sub(cellDirT(c, boxTanX(c, 1, SIZE), boxTanZ(c, 0, SIZE)), at);
    const dz = sub(cellDirT(c, boxTanX(c, 0, SIZE), boxTanZ(c, 1, SIZE)), at);
    if (dot(cross(dx, up), dz) <= 0) fail('hand', `${name(c)}: box x cross up does not point along box z: the box is a mirror`);
  }
  report.push(`  box         ${n} points of the box and the rim came back within ${(worst * SIZE).toExponential(1)} units`);
  report.push(`  hand        x cross up is z on every cell tried`);
}

// ---------------------------------------------------------------- 6: the heading
{
  let worst = 0;
  for (let k = 0; k < 2000; k++) {
    const c = dirCell(...randDir());
    const mid = cellDir(c, 0.5, 0.5);
    const far = randDir();
    const h = boxHeading(c, far);
    if (!h) continue;
    // a step of 1e-7 rad from the middle toward the far direction, along the great circle
    const t = norm(sub(far, mid.map((m) => m * dot(far, mid))));
    const step = norm(mid.map((m, i) => m + t[i] * 1e-7));
    const p0 = boxPoint(c, mid, SIZE), p1 = boxPoint(c, step, SIZE);
    const want = Math.atan2(p1.z - p0.z, p1.x - p0.x), got = Math.atan2(h.z, h.x);
    const off = Math.abs(Math.atan2(Math.sin(got - want), Math.cos(got - want)));
    worst = Math.max(worst, off);
    if (off > HEAD_TOL) fail('heading', `${name(c)}: boxHeading() stands ${off.toExponential(1)} rad off the step`);
  }
  report.push(`  heading     boxHeading() stood ${worst.toExponential(1)} rad off a short step at worst`);
}

// ---------------------------------------------------------------- 7: the frame
{
  let worst = 0;
  for (let k = 0; k < 2000; k++) {
    const lat = rnd() * 180 - 90, lon = rnd() * 360 - 180;
    const { up, east, south } = tangentFrame(lat, lon);
    const errs = [
      Math.abs(Math.hypot(...up) - 1), Math.abs(Math.hypot(...east) - 1), Math.abs(Math.hypot(...south) - 1),
      Math.abs(dot(up, east)), Math.abs(dot(up, south)), Math.abs(dot(east, south)),
      Math.abs(east[1]), Math.hypot(...sub(cross(east, up), south)),
    ];
    const e = Math.max(...errs);
    worst = Math.max(worst, e);
    if (e > FRAME_TOL) fail('frame', `lat ${lat.toFixed(2)} lon ${lon.toFixed(2)}: the frame is off by ${e.toExponential(1)}`);
  }
  report.push(`  frame       tangentFrame() stood ${worst.toExponential(1)} off a right-handed unit frame at worst`);
}

// ---------------------------------------------------------------- 8: the site
{
  let cells = 0, worstUp = 0, worstArc = 0;
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < FACE_CELLS; i++) {
      for (let j = 0; j < FACE_CELLS; j++) {
        const c = { face, i, j, n: FACE_CELLS };
        const at = cellSite(c);
        if (!sameCell(siteCell(at.lat, at.lon), c)) fail('site', `${name(c)}: its site ${at.lat},${at.lon} fell in another cell`);
        const d = cellDir(c, 0.5, 0.5), back = dirSite(...d);
        if (back.lat !== at.lat || back.lon !== at.lon) fail('site', `${name(c)}: dirSite() and cellSite() disagree`);
        if (j % 8 === 0) {
          worstArc = Math.max(worstArc, Math.abs(cellArc(c) - arc(cellDir(c, 0, 0.5), cellDir(c, 1, 0.5))));
          const { up } = tangentFrame(at.lat, at.lon);
          worstUp = Math.max(worstUp, arc(siteDir(at.lat, at.lon), up));
        }
        cells++;
      }
    }
  }
  if (worstUp > 1e-7) fail('site', `siteDir() stands ${worstUp.toExponential(1)} rad off the up axis of tangentFrame()`);
  if (worstArc > 1e-9) fail('site', `cellArc() differs from the arc across the middle by ${worstArc.toExponential(1)} rad`);
  if (sameCell({ face: 0, i: 1, j: 2 }, { face: 1, i: 1, j: 2 }) || !sameCell({ face: 3, i: 4, j: 5, n: 1 }, { face: 3, i: 4, j: 5, n: 2 })) {
    fail('site', 'sameCell() reads more or less than the face and the two indices');
  }
  report.push(`  site        the sites of all ${cells} cells fell back in their cells; siteDir() and cellArc() agree`);
}

console.log('cell-grid-check: the properties of cell-grid.js');
for (const r of report) console.log(r);
if (fails.length) {
  console.error('\nFAIL');
  for (const f of fails) console.error('  ' + f);
  process.exitCode = 1;
} else {
  console.log('\nPASS');
}
