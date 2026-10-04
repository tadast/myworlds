// The words of the story and the field guide, with no browser.
//
//   node tools/story-check.mjs
//
// story.js turns a view of the progress into the words of the Story window and the objective. This
// check walks a whole story through chapters.js and reads storyOf() at each step, in orbit and on the
// ground. Two rules of docs/ui.md hold at every step:
//
//   no spoilers   a closed chapter shows "Locked" and the number of the chapter it waits for, and no
//                 title, goal, band, status, fix, or action
//   no wreck      before the find of the first source, no word of the story names a wreck
//
// It also reads the objective of each stage of a landing, a gas giant, the counts in words, and the
// store of field-guide.js: a find, a second find, a bad record, and the bound of the seeds.
import { root } from './three-hook.mjs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};

const { progressOf } = await import(root + 'chapters.js');
const { sourceSite, WRECK_FREQ } = await import(root + 'carrier.js');
const { storyOf, numWord } = await import(root + 'story.js');
const G = await import(root + 'field-guide.js');
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

// Every word of a story the reader can see, as one text.
const words = (st) => JSON.stringify([st.intro && st.intro.text, st.objective.kicker, st.objective.title, st.objective.line,
  st.chapters.map((c) => [c.title, c.goal, c.status, c.band, c.actions.map((a) => a.label)])]);

// The two rules, on one story.
function rules(st, step, { found }) {
  for (const c of st.chapters) {
    if (c.state !== 'closed') { ok('spoiler', !c.locked && c.title !== 'Locked', `${step}: the open chapter ${c.n} reads as locked`); continue; }
    ok('spoiler', c.locked && c.title === 'Locked' && c.goal === `Opens when chapter ${c.n - 1} ends.`,
      `${step}: the closed chapter ${c.n} reads "${c.title}: ${c.goal}"`);
    ok('spoiler', !c.status && c.band === null && !c.fixes.length && !c.actions.length,
      `${step}: the closed chapter ${c.n} gives ${JSON.stringify({ status: c.status, band: c.band, fixes: c.fixes.length, actions: c.actions.length })}`);
  }
  const text = words(st);
  for (const word of ['ruin', 'twin', 'makers', 'the way on']) {
    const open = st.chapters.some((c) => c.state !== 'closed' && c.id === (word === 'ruin' ? 'ruin' : 'way'));
    if (!open) ok('spoiler', !new RegExp(word, 'i').test(text), `${step}: a word of the story names "${word}" while its chapter is closed: ${text}`);
  }
  if (!found) ok('wreck', !/wreck/i.test(text), `${step}: a word names the wreck before the find: ${text}`);
}

// ---------------------------------------------------------------- a whole story
let w = null;
for (let i = 0; i < 20 && !w; i++) { const t = world(`chapters-${i}`); if (t.source && t.ruin && t.twin) w = t; }
if (!w) throw new Error('no world with a twin in 20 seeds');
const log = w.source.log;
const p = progressOf(w);
const orbit = { mode: 'orbit' };
const on = (h) => ({ mode: 'ground', stage: h ? h.stage : null });

let st = storyOf(w, p.view(), orbit);
rules(st, 'start', { found: false });
ok('intro', st.has && st.of === 3 && st.done === 0, `a new world tells ${st.done} of ${st.of} chapters`);
ok('intro', st.intro.text === `${numWord(log.years).replace(/^./, (c) => c.toUpperCase())} years ago a distress signal reached us from ${w.designation}. It came from the carrier ${log.probe}, with a crew of ${numWord(log.crew.length)} aboard. Nobody came back. You came to find out what happened.`,
  `the intro reads ${st.intro.text}`);
ok('intro', !/\d/.test(st.intro.text.replace(w.designation, '').replace(log.probe, '')), `the intro holds a digit: ${st.intro.text}`);
ok('intro', st.intro.band === `${WRECK_FREQ} MHz`, `the intro holds the band ${st.intro.band}`);
ok('start', st.chapters.map((c) => c.state).join(' ') === 'open closed closed', 'the chapters do not start open, closed, closed');
ok('start', st.chapters[0].goal === `Find where the signal of the ${log.probe} comes from.`, `chapter 1 reads ${st.chapters[0].goal}`);
ok('start', st.chapters[0].status === 'Not heard yet', `chapter 1 states ${st.chapters[0].status}`);
ok('start', st.chapters[0].actions.map((a) => a.id).join(' ') === 'brief lost', `chapter 1 offers ${st.chapters[0].actions.map((a) => a.id)}`);
ok('start', st.objective.chapter === 'wreck' && st.objective.kicker === 'Chapter 1 of 3' && st.objective.line === 'Land the probe anywhere to listen for the beacon.',
  `the objective reads ${JSON.stringify(st.objective)}`);

// A landing past the reach hears nothing.
const silent = siteFrom(w.source, Math.round((0.9 * Math.PI) / W.CELL), 90);   // near the far side, past the reach
let h = p.land(silent);
st = storyOf(w, p.view(), on(h));
rules(st, 'silence', { found: false });
ok('silence', !(h && h.stage) && st.objective.line === 'Silence here. The source of the signal is more than a third of the way round. Land somewhere else.',
  `a landing past the reach reads ${st.objective.line}`);

// The first fix.
h = p.land(siteFrom(w.source, 30, 0));
st = storyOf(w, p.view(), on(h));
rules(st, 'fix 1', { found: false });
ok('fix', h.stage.n === 1 && st.objective.line === 'The probe hears it. Go back to orbit and land again, far to one side.', `the first fix reads ${st.objective.line}`);
st = storyOf(w, p.view(), orbit);
ok('fix', st.objective.line === 'One wedge on the globe. Land again, far to one side of it.', `one wedge reads ${st.objective.line}`);
ok('fix', st.chapters[0].status === '1 fix on the globe' && st.chapters[0].actions.map((a) => a.id).join(' ') === 'clear brief',
  `chapter 1 with a fix reads ${st.chapters[0].status}, ${st.chapters[0].actions.map((a) => a.id)}`);
p.land(siteFrom(w.source, 30, 120));
st = storyOf(w, p.view(), orbit);
ok('fix', st.objective.line === 'The wedges cross. Land where they meet.' && st.chapters[0].status === '2 fixes on the globe', `two wedges read ${st.objective.line}`);

// Near the source, and on its cell.
h = p.land(siteFrom(w.source, 4, 60));
st = storyOf(w, p.view(), on(h));
rules(st, 'near', { found: false });
const want = h.stage.next === 'goal' ? 'Go back to orbit. The globe marks the cell. Land on it.'
  : h.stage.next === 'near' ? /^Go back to orbit\. Land \d+ cells? out, on the bearing \d{3}°\.$/ : 'Go back to orbit. Land to one side of the strip.';
ok('near', typeof want === 'string' ? st.objective.line === want : want.test(st.objective.line), `stage 2 (${h.stage.next}) reads ${st.objective.line}`);
h = p.land(sourceCell(w.source));
st = storyOf(w, p.view(), on(h));
rules(st, 'reach', { found: false });
ok('reach', h.stage.n === 3 && st.objective.line === 'The source of the signal is in reach. Follow the needle.', `stage 3 reads ${st.objective.line}`);

// The find of the wreck: from here the word is earned, and chapter 2 opens with the tuner.
p.read('wreck');
st = storyOf(w, p.view(), on(h));
rules(st, 'find', { found: true });
ok('find', st.done === 1 && st.chapters[0].goal === `The wreck of the ${log.probe} is found.` && st.chapters[0].status === 'Found. The log is read.',
  `after the find chapter 1 reads ${st.chapters[0].goal} ${st.chapters[0].status}`);
ok('find', st.chapters[1].state === 'open' && st.chapters[1].title === 'The second signal' && st.chapters[1].band === '—.— MHz' && !st.chapters[1].actions.length,
  `after the find chapter 2 reads ${JSON.stringify(st.chapters[1])}`);
ok('find', st.objective.tune === true && st.objective.line === 'The log ends on a frequency. Tune the receiver to it.', `the objective after the find reads ${st.objective.line}`);
ok('find', !words(st).includes(w.ruin.freq), 'the story holds the band of the ruin before the tune');
st = storyOf(w, p.view(), orbit);
ok('find', st.chapters[0].actions.some((a) => a.id === 'aim' && a.orbitOnly && a.label === 'Find the wreck on the globe'), 'chapter 1 offers no way back to the wreck');

// The tune, and the search for the ruin.
p.tune(w.ruin.freq);
st = storyOf(w, p.view(), orbit);
rules(st, 'tune', { found: true });
ok('tune', !st.objective.tune && st.chapters[1].band === `${w.ruin.freq} MHz` && st.chapters[1].status === 'Tuned. Not heard yet', `after the tune chapter 2 reads ${JSON.stringify(st.chapters[1])}`);
ok('tune', st.objective.line === 'Land the probe anywhere to listen for the signal.', `after the tune the objective reads ${st.objective.line}`);
h = p.land(sourceCell(w.ruin));
st = storyOf(w, p.view(), on(h));
ok('tune', st.objective.line === 'The source is in reach. Follow the needle.', `stage 3 of chapter 2 reads ${st.objective.line}`);

// The find of the ruin opens the way on.
p.read('ruin');
st = storyOf(w, p.view(), orbit);
rules(st, 'ruin', { found: true });
ok('way', st.chapters[2].state === 'open' && st.chapters[2].title === 'The way on' && st.objective.line === 'Land at the ruin. Read the name on it, and send it.',
  `after the ruin the objective reads ${st.objective.line}`);
p.arrive();
st = storyOf(w, p.view(), orbit);
ok('way', st.done === 3 && st.objective.title === 'At the twin', `after the arrival the objective reads ${JSON.stringify(st.objective)}`);
ok('way', st.chapters[2].actions.some((a) => a.label === 'Find the twin on the globe'), 'the twin offers no way back');
ok('way', !st.complete && !st.roll && st.objective.line === 'Open the card of the twin, and read what waits there.'
  && !st.chapters.some((c) => c.actions.some((a) => a.id === 'log')), `before the read of the card of the twin the story reads ${JSON.stringify(st.objective)}`);
// The read of the card of the twin ends the story: the objective says so, every chapter offers its
// card again, and the roll call names each person of the crew once.
p.readLog();
st = storyOf(w, p.view(), orbit);
ok('end', st.complete && st.objective.kicker === 'Story complete', `after the read the objective reads ${JSON.stringify(st.objective)}`);
ok('end', st.chapters.every((c) => c.actions.some((a) => a.id === 'log' && a.chapter === c.id && !a.orbitOnly)), 'a chapter offers no way to read its card again');
ok('end', st.roll && JSON.stringify(st.roll.people.map((x) => x.name)) === JSON.stringify(log.crew.map((c) => c.name)), `the roll call reads ${JSON.stringify(st.roll)}`);
const waits = st.roll.people.filter((x) => x.status === 'alive');
ok('end', waits.length ? st.objective.title === 'Somebody waits' && st.objective.line.endsWith('Take the crew home.')
  : st.objective.title === 'The fate of the crew' && st.objective.line.startsWith(st.roll.end), `the end reads ${JSON.stringify(st.objective)}`);
if (p.view().way.crew && p.goHome()) {
  st = storyOf(w, p.view(), orbit);
  ok('home', st.objective.kicker === 'Story complete' && st.objective.title === 'The crew is home', `the end reads ${JSON.stringify(st.objective)}`);
  ok('home', st.roll.people.every((x) => x.status !== 'alive') && st.roll.people.some((x) => x.status === 'home'), `the roll call after the way home reads ${JSON.stringify(st.roll)}`);
}
rows.push(`  story     ${w.seed} (${w.type}): ${log.probe}, ${log.years} years; no spoiler and no wreck before the find, at every step`);

// ---------------------------------------------------------------- a world with no story
let gas = null;
for (let i = 0; i < 80 && !gas; i++) { const t = world(`gas-${i}`); if (t.type === 'gas') gas = t; }
if (gas) {
  st = storyOf(gas, progressOf(gas).view(), orbit);
  ok('gas', !st.has && st.objective.kicker === 'Gas giant' && !st.chapters.length, `a gas giant tells ${JSON.stringify(st)}`);
  rows.push(`  gas       ${gas.seed}: no story, the objective of a gas giant`);
} else ok('gas', false, 'no gas giant in 80 seeds');
st = storyOf({ type: 'terran' }, null, orbit);
ok('none', !st.has && st.objective.kicker === 'Uncharted', `a world with no source tells ${JSON.stringify(st.objective)}`);

// ---------------------------------------------------------------- the counts in words
const n = [0, 1, 7, 13, 16, 20, 21, 42, 99, 140].map(numWord).join(' ');
ok('words', n === 'zero one seven thirteen sixteen twenty twenty-one forty-two ninety-nine 140', `the counts read ${n}`);

// ---------------------------------------------------------------- the field guide
store.clear();
ok('guide', JSON.stringify(G.guideOf('a')) === '{"fauna":[],"flora":[]}', 'a world with no find holds a guide');
ok('guide', G.noteAnimal('a', 2) && !G.noteAnimal('a', 2) && G.noteAnimal('a', 0), 'a creature joins the guide twice, or not at all');
ok('guide', G.notePlant('a', 'Glass reed') && !G.notePlant('a', 'Glass reed') && !G.notePlant('a', ''), 'a plant joins the guide twice, or with no name');
ok('guide', JSON.stringify(G.guideOf('a')) === '{"fauna":[2,0],"flora":["Glass reed"]}', `the guide reads ${JSON.stringify(G.guideOf('a'))}`);
ok('guide', JSON.parse(store.get(G.GUIDE_KEY)).a.fauna.length === 2, 'the guide is not on disk');
store.set(G.GUIDE_KEY, JSON.stringify({ b: { fauna: [1, -1, 'x', 2.5], flora: [3, 'Moss'] } }));
globalThis.dispatchEvent?.(new Event('storage'));
for (let i = 0; i < G.MAX_SEEDS + 5; i++) G.noteAnimal(`s${i}`, 1);
const all = JSON.parse(store.get(G.GUIDE_KEY));
ok('guide', Object.keys(all).length === G.MAX_SEEDS && !all.s0 && all[`s${G.MAX_SEEDS + 4}`], `the store keeps ${Object.keys(all).length} seeds`);
rows.push(`  guide     a find, a second find, a bad record, and the bound of ${G.MAX_SEEDS} seeds`);

console.log(rows.join('\n'));
if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log('\nstory-check: ok');
