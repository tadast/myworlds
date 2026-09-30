// The lifecycle of a landing, with no browser.
//
//   node tools/probe-check.mjs
//
// probe.js holds the state of a landing and every change of it, so this check walks every
// transition through its interface and nothing else: descend(), patchDone(), ascend(), hear(),
// step(), and abort(). The clock is a number the check moves by hand.
//
// 1. A landing. The descent closes the cover, waits for the patch, switches, and opens the cover on
//    the ground. The ascent closes the cover, switches, and opens it over the globe. The fix of the
//    landing waits for the end of the ascent.
// 2. The guard. A patch that never comes lets the probe land after PATCH_WAIT, on no patch.
// 3. The refusals. A descent while the probe is not in orbit, an ascent while it is not on the
//    ground with no dive, and a patch of an older descent change nothing.
// 4. The abort. From every mode the probe stands in orbit again, and the fix of the landing goes.
// 5. The jump of chapter 3. From the ground with no dive, the probe jumps to the twin: it stays on
//    the ground, the cover closes over JUMP_MS and waits for the patch, the switch gives `swap`, and
//    the cover opens over JUMP_OUT_MS to `landed`. The fix, the stage, and the key of the landing go.
import { root } from './three-hook.mjs';

const { Probe, DIVE_MS, FADE_MS, PATCH_WAIT, JUMP_MS, JUMP_OUT_MS } = await import(root + 'probe.js');

let fails = 0;
function ok(part, cond, msg) {
  if (cond) return;
  fails++;
  console.log(`FAIL ${part}: ${msg}`);
}
const SITE = { lat: 12.5, lon: -73.25, kind: -1 };
const FIX = { lat: 12.5, lon: -73.25, brg: 10, err: 4 };
const clean = (p) => p.mode === 'orbit' && p.site === null && p.dive === null && p.fix === null && p.stage === null && p.heard === null && p.view === null;

// Step the probe from `t` to `until` in frames of 16 ms, and give the events in order.
function run(p, t, until) {
  const events = [];
  for (; t <= until; t += 16) {
    const s = p.step(t);
    if (s && s.event) events.push([s.event, t, s]);
  }
  return events;
}

// ---------------------------------------------------------------- 1. a landing
let p = new Probe();
ok('start', clean(p) && p.step(0) === null, 'a new probe does not stand clean in orbit');
const path = { from: 1, to: 2 };
ok('descend', p.descend(SITE, 0, { view: { kind: 'ground' }, path }), 'the descent was refused in orbit');
ok('descend', p.mode === 'descending' && p.site.lat === SITE.lat && p.site !== SITE && p.patch.done === false, 'the descent did not fix a copy of the site');
let s = p.step(DIVE_MS / 2);
ok('cover', s.kind === 'descend' && s.phase === 'in' && s.path === path && Math.abs(s.cover - 0.5) < 1e-9 && s.event === null, `half the dive gives ${JSON.stringify(s)}`);
s = p.step(DIVE_MS + 100);
ok('wait', s.event === null && s.cover === 1 && p.mode === 'descending', 'the switch did not wait for the patch');
p.patchDone(p.job, { patch: 'P' });
s = p.step(DIVE_MS + 200);
ok('enter', s.event === 'enter' && s.patch.patch === 'P' && s.view.kind === 'ground' && p.mode === 'ground' && p.view === null, `the switch gives ${JSON.stringify(s)}`);
p.hear({ fix: FIX, stage: { n: 1 }, heard: 'wreck:open' });
ok('hear', p.fix === FIX && p.stage.n === 1 && p.heard === 'wreck:open', 'the probe on the ground did not keep what the landing heard');
ok('ascend', !p.ascend(DIVE_MS + 300), 'an ascent ran while the cover still opened');
let ev = run(p, DIVE_MS + 216, DIVE_MS + 200 + FADE_MS + 32);
ok('landed', ev.length === 1 && ev[0][0] === 'landed' && ev[0][2].cover === 0 && p.dive === null && p.mode === 'ground', `the opening of the cover gives ${JSON.stringify(ev.map((e) => e[0]))}`);
let t = 5000;
ok('ascend', p.ascend(t), 'the ascent was refused on the ground');
ev = run(p, t, t + FADE_MS + 32);
ok('leave', ev[0] && ev[0][0] === 'leave' && p.mode === 'ascending' && p.stage === null && p.heard === null && p.fix === FIX && p.site !== null,
  'the switch to the globe did not drop the stage and keep the fix');
ev = run(p, t + FADE_MS + 48, t + 2 * FADE_MS + 64);
ok('surfaced', ev.length === 1 && ev[0][0] === 'surfaced' && ev[0][2].fix === FIX && clean(p), 'the end of the ascent did not give the fix and stand the probe clean in orbit');
ok('surfaced', p.descend(SITE, 9000), 'the probe cannot go down again after an ascent');

// ---------------------------------------------------------------- 2. the guard
p = new Probe();
p.descend(SITE, 0);
ev = run(p, 0, PATCH_WAIT - 16);
ok('guard', ev.length === 0 && p.mode === 'descending', 'the probe landed before the guard with no patch');
ev = run(p, PATCH_WAIT, PATCH_WAIT + 16);
ok('guard', ev[0] && ev[0][0] === 'enter' && ev[0][2].patch === null && p.mode === 'ground', 'the guard did not land the probe on no patch');
p.patchDone(p.job, { patch: 'late' });
ok('guard', p.patch.result === null, 'a patch after the switch took the place of the ground');

// ---------------------------------------------------------------- 3. the refusals
p = new Probe();
p.descend(SITE, 0);
const job = p.job;
ok('refuse', !p.descend(SITE, 10) && p.job === job, 'a second descent ran during the dive');
ok('refuse', !p.ascend(10), 'an ascent ran during the descent');
p.hear({ fix: FIX });
ok('refuse', p.fix === null, 'a probe that is not on the ground heard the carrier');
p.abort();
p.descend(SITE, 100);
p.patchDone(job, { patch: 'old' });
ok('refuse', !p.patch.done, 'a patch of an older descent ended the wait');
p.patchDone(p.job, null);
ok('refuse', p.patch.done && p.patch.result === null, 'a failed patch did not end the wait');
ok('refuse', !new Probe().descend(null, 0), 'a descent with no site ran');

// ---------------------------------------------------------------- 4. the abort
const MODES = {
  orbit: () => new Probe(),
  descending: () => { const q = new Probe(); q.descend(SITE, 0, { view: { kind: 'ground' } }); return q; },
  ground: () => { const q = new Probe(); q.descend(SITE, 0); q.patchDone(q.job, {}); run(q, 0, DIVE_MS + FADE_MS + 64); q.hear({ fix: FIX, stage: { n: 2 }, heard: 'k' }); return q; },
  ascending: () => { const q = MODES.ground(); q.ascend(10000); run(q, 10000, 10000 + FADE_MS + 16); return q; },
};
for (const [name, make] of Object.entries(MODES)) {
  const q = make();
  ok('abort', q.mode === name, `the setup of ${name} stands in ${q.mode}`);
  const ran = q.abort();
  ok('abort', ran === (name !== 'orbit') && clean(q) && q.step(1e6) === null, `an abort from ${name} left ${JSON.stringify({ mode: q.mode, fix: q.fix, dive: q.dive })}`);
}

// ---------------------------------------------------------------- 5. the jump
{
  const TWIN = { lat: -40.5, lon: 101.25, kind: -1 };
  const q = MODES.ground();
  const job = q.job;
  ok('jump', !new Probe().jump(TWIN, 0), 'a probe in orbit jumped');
  ok('jump', q.jump(TWIN, 20000) && q.mode === 'ground' && q.site.lat === TWIN.lat && q.site !== TWIN && q.job === job + 1, 'the jump did not fix a copy of the site of the twin');
  ok('jump', q.fix === null && q.stage === null && q.heard === null && !q.patch.done, 'the jump kept what the landing at the ruin heard');
  ok('jump', !q.jump(TWIN, 20001) && !q.ascend(20001), 'a second jump or an ascent ran during the jump');
  let e = run(q, 20000, 20000 + JUMP_MS + 200);
  ok('jump', e.length === 0 && q.dive.phase === 'in' && q.mode === 'ground', 'the switch of the jump did not wait for the patch');
  q.patchDone(job, { patch: 'old' });
  ok('jump', !q.patch.done, 'a patch of the landing before the jump ended the wait');
  q.patchDone(q.job, { patch: 'T' });
  e = run(q, 20000 + JUMP_MS + 216, 20000 + JUMP_MS + 216 + JUMP_OUT_MS + 64);
  ok('jump', e.length === 2 && e[0][0] === 'swap' && e[0][2].patch.patch === 'T' && e[1][0] === 'landed' && q.dive === null && q.mode === 'ground',
    `the jump gives ${JSON.stringify(e.map((x) => x[0]))}`);
  const r = MODES.ground();
  r.jump(TWIN, 30000);
  ok('jump', r.abort() && clean(r), 'an abort during the jump did not return to a clean orbit');
}

console.log(`  landing   the descent waits for the patch, the ascent gives the fix at its end; ${DIVE_MS} ms dive, ${FADE_MS} ms cover`);
console.log(`  guard     no patch lands the probe after ${PATCH_WAIT} ms, on no patch`);
console.log('  refusals  a second descent, an early ascent, a hear off the ground, and an older patch change nothing');
console.log(`  jump      from the ground to the twin: the cover closes over ${JUMP_MS} ms, waits for the patch, swaps, and opens over ${JUMP_OUT_MS} ms`);
console.log(`  abort     every mode of ${Object.keys(MODES).join(', ')} returns to a clean orbit`);
console.log('');
if (fails) { console.log(`FAIL: ${fails} checks`); process.exit(1); }
console.log('PASS');
