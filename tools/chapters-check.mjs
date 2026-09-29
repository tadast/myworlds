// The chapters of a world and the progress of the reader, with no browser.
//
//   node tools/chapters-check.mjs
//
// chapters.js holds every rule of the story, so this check walks whole stories through its
// interface and nothing else: progressOf(world) and the view, land(), read(), tune(), briefed(),
// and clear() of the progress. The worlds come from worker.js, as the page receives them.
//
// 1. The story. A scripted reader walks a world from the first landing to the find of the ruin:
//    fixes, the bound of a search, the brief, the find of the wreck, the tuner, the tune, the
//    search for the ruin, and its find. The words of the Carrier row, the marks of the saved
//    worlds, and the shape on disk are tested at each step.
// 2. The strict order. A closed chapter cannot end: the card of the ruin does not open before the
//    find of the wreck, and nothing is written. docs/adr/0001-chapters-open-in-strict-order.md.
// 3. The follow rule. Over every record of the two searches, the receiver follows the newest search
//    that is not closed and whose band it holds. The table below states the rule a second time, by
//    hand.
// 4. The records of older builds, a record a hand edited, a full store, a world with no ruin, and a
//    gas giant.
//
// The rules are copied from CONTEXT.md, the ADR, and "The carrier" in docs/issues/README.md, and
// not from chapters.js, so a slip there fails here.
import { root } from './three-hook.mjs';

const store = new Map();
let quota = false;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { if (quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};

const { progressOf, chaptersOf, marksOf, briefWords, CLOSED_LINE } = await import(root + 'chapters.js');
const { carrierAt, carrierBox, sourceSite, WRECK_FREQ } = await import(root + 'carrier.js');
const { CARRIER_KEY, MAX_FIXES } = await import(root + 'carrier-store.js');
const W = await import(root + 'cell-grid.js');
const { TIERS, worldOpts } = await import(root + 'tiers.js');

let reply = null;
globalThis.self = {
  postMessage(msg, transfer) { if (msg.type !== 'progress') reply = structuredClone(msg, { transfer }); },
};
await import(root + 'worker.js');
function world(seed) {
  reply = null;
  globalThis.self.onmessage({ data: { type: 'generate', seed, opts: worldOpts(TIERS.LOW) } });
  if (!reply || reply.type !== 'done') throw new Error(`"${seed}" gave no world`);
  return reply.result.world;
}

let fails = 0;
const rows = [];
function ok(part, cond, msg) {
  if (cond) return;
  fails++;
  if (fails <= 40) console.log(`FAIL ${part}: ${msg}`);
}
const disk = (seed) => (JSON.parse(store.get(CARRIER_KEY) || '{}'))[seed];
const states = (v) => v.chapters.map((c) => c.state).join(' ');

// A site `k` cells of arc from a source, on the bearing `brg` from it.
function siteFrom(src, k, brg) {
  const at = sourceSite({ source: src }, src);
  const f = W.tangentFrame(at.lat, at.lon);
  const a = k * W.CELL, b = brg * Math.PI / 180;
  const d = [0, 1, 2].map((i) => f.up[i] * Math.cos(a) + (-f.south[i] * Math.cos(b) + f.east[i] * Math.sin(b)) * Math.sin(a));
  const s = W.dirSite(d[0], d[1], d[2]);
  return { lat: s.lat, lon: s.lon };
}
const sourceCell = (src) => sourceSite({ source: src }, src);

// ---------------------------------------------------------------- 1 and 2. the story
let w = null;
for (let i = 0; i < 20 && !w; i++) { const t = world(`chapters-${i}`); if (t.source && t.ruin) w = t; }
if (!w) throw new Error('no world with a ruin in 20 seeds');
const seed = w.seed;
const ruinFreq = w.ruin.freq;

ok('list', JSON.stringify(chaptersOf(w).map((c) => [c.id, c.kind, c.freq])) === JSON.stringify([['wreck', 'search', WRECK_FREQ], ['ruin', 'search', ruinFreq]]),
  'the chapters are not the search for the wreck and then the search for the ruin');

let p = progressOf(w);
let v = p.view();
ok('start', states(v) === 'open closed', `the chapters start ${states(v)}`);
ok('start', v.follow.id === 'wreck' && v.row.text === 'Not heard' && v.row.lost && !v.row.clear && !v.row.tune && !v.row.aims.length,
  `the row of a new world reads ${JSON.stringify(v.row)}`);
ok('start', v.tuner === null, 'a world with no find takes a tuner');

// The strict order: the card of the ruin does not open before the find of the wreck.
let r = p.read('ruin');
ok('order', !r.open && !r.found, 'the card of the ruin opens while its chapter is closed');
ok('order', disk(seed) === undefined, 'a read of a closed chapter wrote the store');
ok('order', typeof CLOSED_LINE === 'string' && CLOSED_LINE.length && !/cannot read this yet/.test(CLOSED_LINE), 'the line of a closed source repeats the line of the way on');

// Fixes, one per cell, and the bound of a search.
const far = [siteFrom(w.source, 30, 0), siteFrom(w.source, 30, 120), siteFrom(w.source, 25, 240)];
let h = p.land(far[0]);
const direct = carrierAt(w, far[0], w.source);
const box = carrierBox(w, far[0], direct, undefined, w.source);
ok('land', h && h.carrier && h.carrier.brg === direct.brg && h.carrier.err === direct.err, 'the carrier of a landing is not carrierAt() of the wreck');
ok('land', h.carrier.freq === WRECK_FREQ && h.carrier.kind === 'wreck' && h.carrier.dir[0] === box.x && h.carrier.dir[1] === box.z, 'the carrier holds the wrong band, kind, or needle');
ok('land', h.fix && h.stage.n === 1 && h.stage.pulse && h.stage.sheet === 1 && h.stage.title === 'Distress signal', `the first landing gives the stage ${JSON.stringify(h.stage)}`);
ok('land', p.view().row.text === '1 fix' && p.view().row.clear, 'the row does not count the first fix');
p.land(far[0]);
ok('cell', p.view().chapters[0].fixes.length === 1, 'a second landing on one cell stored a second fix');
p.land(far[1]); p.land(far[2]);
ok('fixes', p.view().row.text === '3 fixes', `three landings read ${p.view().row.text}`);
h = p.land(siteFrom(w.source, 4, 60));
ok('near', h.stage.n === 2 && (h.stage.next === 'goal' || h.stage.next === 'near') && h.stage.title === 'Stronger signal', `a landing in range gives ${JSON.stringify(h.stage)}`);
p.land(siteFrom(w.source, 20, 300));
v = p.view();
ok('bound', v.chapters[0].fixes.length === MAX_FIXES && disk(seed).fixes.length === MAX_FIXES, `a search keeps ${v.chapters[0].fixes.length} fixes and not ${MAX_FIXES}`);
ok('bound', !v.chapters[0].fixes.some((f) => f.lat === W.cellSite(W.siteCell(far[0].lat, far[0].lon)).lat && f.lon === W.cellSite(W.siteCell(far[0].lat, far[0].lon)).lon),
  'the oldest fix did not go first');

// The brief.
p.briefed(2); p.briefed(1);
ok('brief', p.view().chapters[0].briefed === 2, 'the mark of the brief fell');
h = p.land(sourceCell(w.source));
ok('brief', h.stage.n === 3 && h.stage.pulse && h.stage.title === 'Carrier in reach', 'the cell of the wreck is not stage 3');
p.briefed(3);
ok('brief', !p.land(sourceCell(w.source)).stage.pulse, 'a read brief still pulses');

// Clear.
p.clear();
v = p.view();
ok('clear', v.chapters[0].fixes.length === 0 && v.chapters[0].briefed === 3 && v.row.text === 'Not heard', 'a clear did not drop the fixes, or it dropped the brief');

// The find of the wreck.
p.land(sourceCell(w.source));
r = p.read('wreck');
v = p.view();
ok('find', r.open && r.found, 'the first read of the wreck is not its find');
ok('find', states(v) === 'done open' && v.follow.id === 'wreck' && v.row.text === 'Found', `after the find the chapters are ${states(v)} and the row reads ${v.row.text}`);
ok('find', v.chapters[0].fixes.length === 0 && disk(seed).fixes.length === 0 && disk(seed).found === true, 'the find did not drop the fixes');
ok('find', v.tuner && v.tuner.freq === ruinFreq && !v.tuner.held && v.row.tune, 'the tuner does not stand for the ruin after the find');
ok('find', JSON.stringify(v.row.aims) === JSON.stringify([{ id: 'wreck', label: 'Aim' }]), `the aims read ${JSON.stringify(v.row.aims)}`);
ok('find', marksOf().get(seed).text === '✦', 'the thumb does not carry one mark');
ok('find', !p.read('wreck').found && p.read('wreck').open, 'a second read of the wreck is a second find');
h = p.land(sourceCell(w.source));
ok('find', h.carrier.kind === 'wreck' && h.fix === null, 'a found search took a fix');

// The tuner.
const near = (Number(ruinFreq) + 0.02).toFixed(3), wrong = (Number(ruinFreq) + 1).toFixed(3);
const kinds = ['abc', WRECK_FREQ, near, wrong].map((t) => p.tune(t).kind).join(' ');
ok('tune', kinds === 'nan distress near static', `the answers read ${kinds}`);
ok('tune', p.view().follow.id === 'wreck', 'a wrong number tuned the receiver');
const lock = p.tune(ruinFreq);
v = p.view();
ok('tune', lock.kind === 'lock' && /second source/.test(lock.text), `the lock reads ${lock.text}`);
ok('tune', v.follow.id === 'ruin' && v.row.text === 'Tuned' && v.tuner.held && !v.row.tune, `after the lock the row reads ${v.row.text}`);
ok('tune', disk(seed).tuned === true && disk(seed).ruin === undefined, `the tune stands on disk as ${JSON.stringify(disk(seed))}`);

// The search for the ruin: the landing that tunes takes its first fix.
h = p.land(sourceCell(w.source));
ok('ruin', h.carrier && h.carrier.kind === 'ruin' && h.carrier.freq === ruinFreq, 'the landing after the tune does not hear the ruin');
ok('ruin', h.stage.sheet === 2 && h.stage.pulse && h.stage.title === briefWords(1, h.stage.n).title, 'the brief of the ruin takes the wrong sheet');
ok('ruin', disk(seed).ruin && disk(seed).ruin.fixes.length === 1 && disk(seed).fixes.length === 0, 'the fix went into the wrong search');
ok('ruin', p.view().row.text === '1 fix', 'the row does not count the fix of the ruin');
h = p.land(sourceCell(w.ruin));
ok('ruin', h.stage.n === 3, 'the cell of the ruin is not stage 3');
r = p.read('ruin');
v = p.view();
ok('ruin', r.open && r.found && states(v) === 'done done', 'the read of the ruin is not its find');
ok('ruin', v.row.text === 'Found 2 of 2' && v.finds === 2 && v.of === 2, `the row reads ${v.row.text}`);
ok('ruin', JSON.stringify(v.row.aims) === JSON.stringify([{ id: 'wreck', label: 'Wreck' }, { id: 'ruin', label: 'Ruin' }]), `the aims read ${JSON.stringify(v.row.aims)}`);
ok('ruin', marksOf().get(seed).text === '✦✦', 'the thumb does not carry two marks');
ok('ruin', JSON.stringify(progressOf(w).view()) === JSON.stringify(v), 'a second progress of the world reads another view');
rows.push(`  story     ${seed} (${w.type}): the wreck, the tune of ${ruinFreq} MHz, and the ruin, found in order; the ruin stayed shut before the wreck`);

// ---------------------------------------------------------------- 3. the follow rule
// Every record of the two searches: the find of the wreck, the band of the ruin, and the find of the
// ruin. The table is the rule by hand.
//   wreck found  ruin held  ruin found   chapters      follows   row
const TABLE = [
  [false, false, false, 'open closed', 'wreck', 'Not heard', null],
  [false, true,  false, 'open closed', 'wreck', 'Not heard', null],
  [false, true,  true,  'open closed', 'wreck', 'Not heard', null],
  [false, false, true,  'open closed', 'wreck', 'Not heard', null],
  [true,  false, false, 'done open',   'wreck', 'Found',     false],
  [true,  true,  false, 'done open',   'ruin',  'Tuned',     true],
  [true,  true,  true,  'done done',   'ruin',  'Found 2 of 2', true],
];
for (const [wf, rh, rf, st, fol, text, held] of TABLE) {
  store.clear();
  const rec = { fixes: [], found: wf, briefed: 0, ts: 1 };
  if (rh) rec.tuned = true;
  if (rf) rec.ruin = { fixes: [], found: true, briefed: 0 };
  store.set(CARRIER_KEY, JSON.stringify({ [seed]: rec }));
  const tv = progressOf(w).view();
  const key = `wreck ${wf ? 'found' : '-'}, ruin ${rh ? 'held' : '-'}, ${rf ? 'found' : '-'}`;
  ok('follow', states(tv) === st, `${key}: the chapters are ${states(tv)} and not ${st}`);
  ok('follow', tv.follow.id === fol, `${key}: the receiver follows the ${tv.follow.id} and not the ${fol}`);
  ok('follow', tv.row.text === text, `${key}: the row reads ${tv.row.text} and not ${text}`);
  ok('follow', (tv.tuner ? tv.tuner.held : null) === held, `${key}: the tuner is ${JSON.stringify(tv.tuner)}`);
  ok('follow', (marksOf().get(seed) || { finds: 0 }).finds === (wf ? 1 + (rf ? 1 : 0) : 0), `${key}: the thumb counts ${(marksOf().get(seed) || { finds: 0 }).finds} finds`);
}
rows.push(`  follow    the receiver followed the rule on all ${TABLE.length} records of the two searches`);

// ---------------------------------------------------------------- 4. older records, a bad hand, a full store
// A record of issue 34: `briefed: true` reads as stage 1, and a site off the grid finds its cell.
store.clear();
const old = siteFrom(w.source, 10, 45);
store.set(CARRIER_KEY, JSON.stringify({ [seed]: { fixes: [{ lat: old.lat + 0.001, lon: old.lon, brg: 1, err: 2 }], found: false, briefed: true } }));
p = progressOf(w);
v = p.view();
ok('old', v.chapters[0].briefed === 1 && v.chapters[0].fixes.length === 1, 'a record of issue 34 lost its brief or its fix');
ok('old', v.chapters[0].fixes[0].brg === carrierAt(w, v.chapters[0].fixes[0], w.source).brg, 'a stored fix did not take the bearing of today');
p.land(old);
ok('old', p.view().chapters[0].fixes.length === 1, 'a fix of an older build off the grid did not find its cell');

// The find by chance of an older build: it waits until the wreck is found.
store.clear();
store.set(CARRIER_KEY, JSON.stringify({ [seed]: { fixes: [], found: false, briefed: 0, tuned: true, ruin: { fixes: [], found: true, briefed: 0 } } }));
p = progressOf(w);
ok('chance', states(p.view()) === 'open closed' && !p.read('ruin').open, 'the ruin of an older find by chance opens before the wreck');
p.read('wreck');
v = p.view();
ok('chance', states(v) === 'done done' && v.follow.id === 'ruin' && v.row.text === 'Found 2 of 2', 'the older find of the ruin does not count after the find of the wreck');

// A record a hand edited.
store.clear();
store.set(CARRIER_KEY, JSON.stringify({ [seed]: { fixes: ['x', { lat: 'a' }, null], found: 'yes', briefed: 99, ruin: 'x' } }));
v = progressOf(w).view();
ok('hand', v.chapters[0].fixes.length === 0 && v.chapters[0].briefed === 3 && states(v) === 'done open', `a bad record reads ${states(v)}`);
store.set(CARRIER_KEY, 'not json');
ok('hand', states(progressOf(w).view()) === 'open closed', 'a store that is not JSON did not read as empty');

// A full store: every write throws, and the page keeps running.
store.clear();
quota = true;
let threw = false;
try { p = progressOf(w); p.land(far[0]); p.read('wreck'); p.tune(ruinFreq); p.briefed(1); p.clear(); } catch { threw = true; }
quota = false;
ok('quota', !threw, 'a full store made a call throw');

// A world with no ruin: one search, no tuner, and the find reads "Found".
store.clear();
const lone = { ...w, ruin: null };
p = progressOf(lone);
p.land(sourceCell(w.source));
p.read('wreck');
v = p.view();
ok('lone', v.chapters.length === 1 && v.tuner === null && v.row.text === 'Found' && !v.row.tune, `a world with no ruin reads ${JSON.stringify(v.row)}`);
ok('lone', p.tune(ruinFreq).kind === 'static' && p.view().follow.id === 'wreck', 'a world with no ruin took a tune');

// A gas giant: no chapter, no row, no landing.
const gas = { seed: 'gas', type: 'gas', source: null, ruin: null };
p = progressOf(gas);
ok('gas', chaptersOf(gas).length === 0 && p.view().row === null && p.land({ lat: 0, lon: 0 }) === null && !p.read('wreck').open, 'a gas giant takes a search');
rows.push('  records   the records of older builds, a bad hand, a full store, a world with no ruin, and a gas giant');

for (const row of rows) console.log(row);
console.log('');
if (fails) { console.log(`FAIL: ${fails} checks`); process.exit(1); }
console.log('PASS');
