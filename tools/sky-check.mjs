// The horizon of the sky over the ground, with no browser.
//
//   node tools/sky-check.mjs
//
// The ring and the moons of ground-sky.js stood at 4,000 and 4,250 m, inside the rim of the ground,
// so a plane at the eye line cut them. From a probe high over the ground the edge of the ground
// stands well under the eye line: on Saffron-213 the ring ended 14 degrees over the ground, in open
// haze, in a hard line. They now stand behind the rim, and the depth test lets the ground hide them.
//
// 1. Behind the rim. A moon and the far edge of the ring stand past the corner of the rim, RIM of
//    tiers.js times the root of two, with MARGIN for the radius of a moon and the hills of the rim.
// 2. In front of the far plane of the ground camera, 2.2 times SKY_RADIUS of ground.js, with the
//    same margin.
// 3. The sky cuts nothing: no part of the sky carries a clipping plane.
import { root } from './three-hook.mjs';

const { Sky, RING_REACH, MOON_DIST } = await import(root + 'ground-sky.js');
const { RIM } = await import(root + 'tiers.js');
const { SKY_RADIUS } = await import(root + 'ground.js');

let fails = 0;
function ok(part, cond, msg) {
  if (cond) return;
  fails++;
  console.log(`FAIL ${part}: ${msg}`);
}

const MARGIN = 800;      // metres
const corner = RIM * Math.SQRT2;
const far = SKY_RADIUS * 2.2;

// 1. Behind the rim.
ok('rim', MOON_DIST > corner + MARGIN, `a moon at ${MOON_DIST} m stands too near the rim corner at ${Math.round(corner)} m`);
ok('rim', RING_REACH > corner + MARGIN, `the ring at ${RING_REACH} m stands too near the rim corner at ${Math.round(corner)} m`);

// 2. In front of the far plane.
ok('far', MOON_DIST < far - MARGIN, `a moon at ${MOON_DIST} m stands too near the far plane at ${far} m`);
ok('far', RING_REACH < far - MARGIN, `the ring at ${RING_REACH} m stands too near the far plane at ${far} m`);

// 3. No clipping plane.
const sky = new Sky({ world: { seed: 'sky-check', palette: {} }, skyRadius: SKY_RADIUS });
let clipped = 0;
sky.group.traverse((o) => { if (o.material && o.material.clippingPlanes && o.material.clippingPlanes.length) clipped++; });
ok('clip', clipped === 0, `${clipped} parts of the sky carry a clipping plane`);

console.log(fails ? `sky-check: ${fails} failed` : 'sky-check: PASS');
process.exit(fails ? 1 : 0);
