// The body of the ruin, with no browser. Phase 2, p2-36.
//
//   node tools/ruin-geometry-check.mjs            the table and the checks
//   node tools/ruin-geometry-check.mjs --table    the table only, one row per proto
//
// It builds every proto of ruin-types.js on every world type that fits it, with a maker of every
// limb count the world can give (0, 1, 2, 3, 4, and 6) and of a small, a middle, and a big body,
// and it holds each build to the contract of ruinGeometry():
//
// 1. The budget. The body stands under BODY_BUDGET triangles and the mini under MINI_BUDGET.
// 2. The shape. The geometry is non-indexed and carries a position, a normal, and a colour per
//    vertex. The glow carries no colour. Only the floaters have an orbit. The lamp stands inside
//    the box of the body and the glow, or over the mouth of the well.
// 3. The frame. The tallest part stands within 15% of the height of the table, and no part stands
//    outside the disc of the table. Every proto but the well stands on the ground: the lowest
//    vertex lies between 3.5 units under the ground and the ground, or 8 for the ring, which stands
//    with a part of it under the ground. The well reaches its depth and states its hole.
// 4. The maker. The legs of the colossus grow from 1 limb to 6, and the coils of 0 limbs are a body
//    of their own. The steps of the well grow with the size of the maker, so a big maker takes fewer.
//
// ruin-geometry.js takes three.js by a bare name; three-hook.mjs resolves it in Node.
import { root } from './three-hook.mjs';

const R = await import(root + 'ruin-geometry.js');
const { RUIN_PROTOS } = await import(root + 'ruin-types.js');

const TABLE_ONLY = process.argv.includes('--table');
const LIMBS = [0, 1, 2, 3, 4, 6];
const HEIGHTS = [0.4, 1.8, 6, 24];
let fails = 0;
const fail = (msg) => { fails++; console.log('FAIL ' + msg); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

function extent(geo) {
  const p = geo.attributes.position;
  let r = 0;
  for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
  return r;
}
function boxOf(...geos) {
  const b = { minY: Infinity, maxY: -Infinity, r: 0 };
  for (const g of geos) {
    if (!g) continue;
    b.minY = Math.min(b.minY, g.boundingBox.min.y);
    b.maxY = Math.max(b.maxY, g.boundingBox.max.y);
    b.r = Math.max(b.r, extent(g));
  }
  return b;
}

const rows = [];
for (const row of RUIN_PROTOS) {
  let bodyMax = 0, miniMax = 0, glowMax = 0, orbitMax = 0;
  const legTris = {};
  const doorSpan = {};
  for (const type of row.fits) {
    const limbsList = row.id === 'colossus' ? LIMBS : [6];
    for (const limbs of limbsList) for (const height of HEIGHTS) {
      const world = { type, ruin: { maker: { species: -1, limbs, height, rolled: true } } };
      const tag = `${row.id} on ${type}, limbs ${limbs}, height ${height}`;
      const g = R.ruinGeometry(row.id, world);
      const m = R.ruinGeometry(row.id, world, { mini: true });
      const tb = R.triangles(g.body), tm = R.triangles(m.body), tg = R.triangles(g.glow), to = R.triangles(g.orbit);
      bodyMax = Math.max(bodyMax, tb); miniMax = Math.max(miniMax, tm); glowMax = Math.max(glowMax, tg); orbitMax = Math.max(orbitMax, to);
      if (TABLE_ONLY) continue;
      // 1. the budget
      if (tb >= R.BODY_BUDGET) fail(`${tag}: body ${tb} triangles, budget ${R.BODY_BUDGET}`);
      if (tm >= R.MINI_BUDGET) fail(`${tag}: mini ${tm} triangles, budget ${R.MINI_BUDGET}`);
      // 2. the shape
      for (const [name, geo] of [['body', g.body], ['mini', m.body], ['glow', g.glow], ['orbit', g.orbit]]) {
        if (!geo) continue;
        if (geo.index) fail(`${tag}: ${name} is indexed`);
        if (!geo.attributes.position || !geo.attributes.normal) fail(`${tag}: ${name} lacks a position or a normal`);
        if (name === 'glow' && geo.attributes.color) fail(`${tag}: the glow carries a colour`);
        if (name !== 'glow' && !geo.attributes.color) fail(`${tag}: ${name} carries no colour`);
        if (geo.attributes.position.count % 3) fail(`${tag}: ${name} is not whole triangles`);
      }
      if (!g.glow) fail(`${tag}: no glow`);
      if ((row.id === 'floaters') !== !!g.orbit) fail(`${tag}: orbit ${g.orbit ? 'present' : 'missing'}`);
      if (m.glow || m.orbit) fail(`${tag}: the mini carries a glow or an orbit`);
      if (!Array.isArray(g.lamp) || g.lamp.length !== 3) fail(`${tag}: lamp is not [x, y, z]`);
      if (g.body.userData.lamp !== g.lamp) fail(`${tag}: userData.lamp differs from lamp`);
      const lit = boxOf(g.body, g.glow, g.orbit);
      const lampIn = g.lamp[1] <= lit.maxY + 0.5 && g.lamp[1] >= lit.minY - 0.5 && Math.hypot(g.lamp[0], g.lamp[2]) <= lit.r + 0.5;
      if (!lampIn) fail(`${tag}: the lamp ${g.lamp.map((v) => v.toFixed(1))} stands outside the body`);
      // 3. the frame
      const b = boxOf(g.body, g.glow, g.orbit);
      if (!near(b.maxY, row.height, row.height * 0.15)) fail(`${tag}: height ${b.maxY.toFixed(1)}, table ${row.height}`);
      if (b.r > row.disc + 1) fail(`${tag}: reach ${b.r.toFixed(1)}, disc ${row.disc}`);
      const mb = boxOf(m.body);
      if (!near(mb.maxY, row.height, row.height * 0.2)) fail(`${tag}: mini height ${mb.maxY.toFixed(1)}, table ${row.height}`);
      if (mb.r > row.disc + 1) fail(`${tag}: mini reach ${mb.r.toFixed(1)}, disc ${row.disc}`);
      if (row.id === 'well') {
        if (!(g.body.boundingBox.min.y < -40)) fail(`${tag}: the shaft is not deep`);
        if (!(g.body.userData.hole > 0) || !(m.body.userData.hole > 0)) fail(`${tag}: no userData.hole`);
        if (!(mb.minY > -1.6)) fail(`${tag}: the mini well reaches under the ground`);
      } else {
        const sink = row.id === 'ring' ? -8 : -3.5;   // the ring stands with a part of it under the ground
        if (b.minY < sink || b.minY > 0.2) fail(`${tag}: the lowest point stands at ${b.minY.toFixed(2)}`);
        if (g.body.userData.hole) fail(`${tag}: a hole on a proto that is not the well`);
      }
      // 4. the maker
      if (row.id === 'colossus' && height === 1.8) legTris[limbs] = tb;
      if (height === HEIGHTS[0] || height === HEIGHTS[HEIGHTS.length - 1]) doorSpan[`${type}:${height}`] = tb + tg;
      for (const geo of [g.body, g.glow, g.orbit, m.body]) geo && geo.dispose();
    }
  }
  if (!TABLE_ONLY) {
    if (row.id === 'colossus') {
      if (!(legTris[1] < legTris[2] && legTris[2] < legTris[3] && legTris[3] < legTris[4] && legTris[4] < legTris[6])) fail(`colossus: the legs do not grow with the limbs: ${JSON.stringify(legTris)}`);
      if (legTris[0] === legTris[1] || legTris[0] === legTris[2]) fail(`colossus: the coils of 0 limbs read as a legged body: ${JSON.stringify(legTris)}`);
    }
    if (row.id === 'well') {
      const type = row.fits[0];
      if (!(doorSpan[`${type}:${HEIGHTS[0]}`] > doorSpan[`${type}:${HEIGHTS[HEIGHTS.length - 1]}`])) fail('well: a big maker does not take fewer steps');
    }
  }
  rows.push({ id: row.id, fits: row.fits.join(' '), body: bodyMax, glow: glowMax, orbit: orbitMax, mini: miniMax, height: row.height, disc: row.disc });
}

console.log('proto     fits                  body   glow  orbit   mini   height  disc');
for (const r of rows) {
  console.log(`${r.id.padEnd(9)} ${r.fits.padEnd(21)} ${String(r.body).padStart(5)} ${String(r.glow).padStart(6)} ${String(r.orbit).padStart(6)} ${String(r.mini).padStart(6)}   ${String(r.height).padStart(4)}   ${String(r.disc).padStart(3)}`);
}
console.log(`budget: body under ${R.BODY_BUDGET}, mini under ${R.MINI_BUDGET}. The body column counts the body only; the glow and the orbit stand beside it.`);
if (!TABLE_ONLY) {
  console.log(fails ? `${fails} checks failed` : 'ok: every proto on every type, every limb count, every maker size');
  process.exit(fails ? 1 : 0);
}
