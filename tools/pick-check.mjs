// The tap on a creature of the globe, with no browser.
//
//   node tools/pick-check.mjs
//
// creatureAt() in app.js opens the card of the creature under a tap. It skips each creature that
// the ground hides, and groundHides() of site.js makes that test. The test once took a sphere at
// the height of the animal: a whale that flew over the horizon stood against the sky, the test hid
// it, and the tap opened the card of a small animal near it. Saffron-213, the sail-backed whale and
// the feeler ribbon. The test now takes the sphere of the ground under the animal.
//
// 1. The whale over the horizon. The eye stands 0.11 over a ground of radius 1, and the whale
//    flies 0.033 over the ground, 0.5 radians away. The old test hides it, and the line of sight
//    clears the ground, so groundHides() must show it.
// 2. A flyer behind the planet stays hidden.
// 3. An animal on the ground. When the ground stands at the animal, the new test gives the old
//    answer, on 2000 random points and eyes.
import { root } from './three-hook.mjs';

const THREE = await import('three');
const { groundHides } = await import(root + 'site.js');

let fails = 0;
function ok(part, cond, msg) {
  if (cond) return;
  fails++;
  console.log(`FAIL ${part}: ${msg}`);
}

// The old test: hidden when the tangent plane of a sphere at the height of the point faces away.
const oldHides = (eye, p) => p.x * (p.x - eye.x) + p.y * (p.y - eye.y) + p.z * (p.z - eye.z) > 0;
const at = (r, a) => new THREE.Vector3(Math.sin(a), Math.cos(a), 0).multiplyScalar(r);

// 1. The whale over the horizon.
{
  const eye = at(1.11, 0), whale = at(1.033, 0.5);
  ok('whale', oldHides(eye, whale), 'the case no longer shows the old fault');
  ok('whale', !groundHides(eye, whale, 1), 'the ground hides a whale that stands against the sky');
}

// 2. A flyer behind the planet.
{
  const eye = at(1.11, 0), whale = at(1.033, 2.5);
  ok('behind', groundHides(eye, whale, 1), 'a flyer behind the planet shows');
}

// 3. An animal on the ground: the same answer as the old test.
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dir = () => new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
  let diff = 0;
  for (let i = 0; i < 2000; i++) {
    const p = dir().multiplyScalar(0.95 + rnd() * 0.1);
    const eye = dir().multiplyScalar(1.05 + rnd() * 3);
    // a point on the horizon itself falls inside the margin of groundHides(), and either answer holds
    if (Math.abs(p.dot(p.clone().sub(eye))) < 1e-6) continue;
    if (groundHides(eye, p, p.length()) !== oldHides(eye, p)) diff++;
  }
  ok('ground', diff === 0, `${diff} of 2000 points differ from the old test`);
}

console.log(fails ? `pick-check: ${fails} failed` : 'pick-check: PASS');
process.exit(fails ? 1 : 0);
