// The checks of chapter 3, the way on, with no browser.
//
//   node tools/way-check.mjs [seeds]
//
// 1. The rules of way-types.js: the call sign in words, the key of a name, the answers of the send,
//    the fates a crew allows, the form of a world type, and the graves.
// 2. The twin on every world of the seeds (300 by default): a twin exactly where a ruin stands, the
//    proto of the ruin, the arc from the ruin inside the bands, the tests of the ground, off the cells
//    of the wreck and of the ruin, and TWIN_KEEP cells or more from the wreck. The herd is the species
//    of the maker, or the kin of a rolled maker, which lives nowhere else. The fate is null exactly
//    where nobody reached the ruin, and it is a fate the crew allows.
// 3. The third log: the crew of the second log with an end each, the ends by the table of the fate,
//    the days, and the voice. way-sample.mjs --check tests the words. The roll call: each person of the
//    crew of the wreck once, with the end of the third log where the person went through the way.
// 4. The patch of the twin on some worlds: the twin on its cell with the proto of the ruin, the tent
//    exactly where a crew came, what stands by the tent from the ends of the people, the tent inside
//    the soft edge and off the flat disc, no plant on its pad, and the herd around the stones.
// 5. The card of the twin: the rows in order, and the name the glyphs spell.
import { root } from './three-hook.mjs';

const { TIERS, patchOpts } = await import(root + 'tiers.js');
const { CELL, dirCell, cellDir, sameCell, dirSite } = await import(root + 'cell-grid.js');
const R = await import(root + 'ruin-types.js');
const W = await import(root + 'way-types.js');
const G = await import(root + 'generate.js');

const SEEDS = Number(process.argv[2]) || 300;
const PATCH_EVERY = 12;       // every 12th world with a twin builds the patch of the twin on LOW

let fails = 0;
const seen = new Set();
function ok(part, cond, msg) {
  if (cond) return;
  fails++;
  if (seen.size < 60 || !seen.has(part)) console.log(`FAIL ${part}: ${msg}`);
  seen.add(part);
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---------------------------------------------------------------- 1. the rules
ok('sign', W.callSign({ source: { log: { probe: 'Verge 10' } } }) === 'Verge ten', 'the call sign of Verge 10 is not "Verge ten"');
ok('sign', W.callSign({ source: { log: { probe: 'Plumb 17' } } }) === 'Plumb seventeen', 'the call sign of Plumb 17 is not "Plumb seventeen"');
ok('sign', W.callSign({ source: { log: { probe: 'Anvil 42' } } }) === 'Anvil forty two', 'the call sign of Anvil 42 is not "Anvil forty two"');
const name = 'Saeuunka';
ok('send', W.sendName('', name).kind === 'empty' && W.sendName('sae', name).kind === 'short', 'an empty or short name does not ask for every mark');
ok('send', W.sendName('SAEUUNKA', name).kind === 'open' && W.sendName(' s a e u u n k a ', name).kind === 'open', 'the right name in another case or with spaces does not open');
const some = W.sendName('taeuunka', name);
ok('send', some.kind === 'some' && some.n === 7 && some.lit[0] === false && some.lit[1] === true && some.text === '7 of 8 marks answer. The stones stay dark.', `a name with one wrong mark gives ${JSON.stringify(some)}`);
ok('send', W.sendName('bbbbbbbb', name).kind === 'dark', 'a name with no right mark lights a glyph');
ok('fates', JSON.stringify(W.fatesFor(1)) === JSON.stringify(['pact', 'trek', 'sour', 'mad', 'change']) && W.fatesFor(2).length === 6, 'the fates of a crew of one or two are wrong');
ok('form', W.formOf({ type: 'ice' }) === 'sleep' && W.formOf({ type: 'desert' }) === 'sleep' && W.formOf({ type: 'lava' }) === 'light' && W.formOf({ type: 'terran' }) === 'chorus', 'the form of a type is wrong');
ok('graves', W.gravesOf({ crew: [{ end: 'lost' }, { end: 'lost' }] }) === 1 && W.gravesOf({ crew: [{ end: 'lost' }, { end: 'home' }] }) === 1
  && W.gravesOf({ crew: [{ end: 'lost' }, { end: 'lost' }, { end: 'home' }] }) === 2, 'the graves do not follow who lived to dig them');

// ---------------------------------------------------------------- 2 to 5. the worlds
const OPTS = { detail: 24, maxFlora: 200, maxFauna: 40 };
const tier = TIERS.LOW;
const counts = { worlds: 0, ruins: 0, twins: 0, logs: 0, kin: 0, patches: 0, fates: {}, forms: {}, bands: {}, roll: {}, kmMin: Infinity, kmMax: 0 };
let twinCount = 0;
for (let i = 0; i < SEEDS; i++) {
  const seed = 'way-' + i;
  const w = G.world(seed, OPTS).world;
  counts.worlds++;
  const t = w.twin;
  ok('twin', !!t === !!w.ruin, `${seed}: a twin with no ruin, or a ruin with no twin`);
  if (!w.ruin) continue;
  counts.ruins++;
  if (!t) continue;
  counts.twins++;
  counts.bands[t.band] = (counts.bands[t.band] || 0) + 1;
  counts.kmMin = Math.min(counts.kmMin, t.km); counts.kmMax = Math.max(counts.kmMax, t.km);
  ok('twin', t.kind === 'twin' && t.proto === w.ruin.proto, `${seed}: the twin takes ${t.proto} and not the proto of the ruin`);
  const tc = dirCell(...t.dir), rc = dirCell(...w.ruin.dir), sc = dirCell(...w.source.dir);
  ok('twin', !sameCell(tc, rc) && !sameCell(tc, sc), `${seed}: the twin shares a cell with the ruin or the wreck`);
  const mid = cellDir(tc, 0.5, 0.5, [0, 0, 0]);
  ok('twin', Math.abs(dot(mid, t.dir) - 1) < 1e-9, `${seed}: the twin does not stand at the middle of its cell`);
  const arc = Math.acos(Math.min(1, dot(cellDir(rc, 0.5, 0.5, [0, 0, 0]), t.dir))) / CELL;
  ok('twin', arc >= 20 - 1e-6 && arc <= 300 + 1e-6, `${seed}: the twin stands ${arc.toFixed(1)} cells from the ruin`);
  if (t.band === 0) ok('twin', arc >= 60 - 1e-6 && arc <= 150 + 1e-6, `${seed}: a twin of band 0 stands ${arc.toFixed(1)} cells from the ruin`);
  ok('twin', Math.acos(Math.min(1, dot(w.source.dir, t.dir))) / CELL >= 20 - 1e-6, `${seed}: the twin stands under 20 cells from the wreck`);
  const facts = G.placeFacts(seed, OPTS, t.dir);
  ok('ground', facts.h > facts.beachW && facts.slope < facts.maxSlope, `${seed}: the ground of the twin fails the tests of the ruin`);
  ok('ground', Math.abs(Math.asin(t.dir[1]) * 180 / Math.PI) <= facts.maxLat + 1e-6, `${seed}: the twin stands past the latitude of the source`);

  // the herd
  const H = w.species[t.herd];
  const maker = w.ruin.maker;
  ok('herd', !!H, `${seed}: the herd is not a species of the world`);
  if (maker.rolled) {
    counts.kin++;
    ok('herd', t.kin && H && H.kin && t.herd === w.species.length - 1 && !(w.faunaKinds || []).includes(t.herd), `${seed}: a rolled maker takes no kin, or the kin lives on the globe`);
    ok('herd', H && H.lore && H.lore.name && ({ 1: 'monopod', 2: 'biped', 3: 'tripod', 4: 'quad', 6: 'hexapod' })[maker.limbs] === H.loco, `${seed}: the kin does not have the body of the carvings`);
  } else {
    ok('herd', !t.kin && t.herd === maker.species && !w.species.some((g) => g.kin), `${seed}: the herd of a maker of a species is not that species`);
  }

  // the fate and the third log
  const second = w.ruin.log;
  ok('fate', (t.fate === null) === !second, `${seed}: the fate is ${t.fate} and the second log is ${second ? 'there' : 'null'}`);
  ok('fate', !t.log === !second, `${seed}: the third log and the second log disagree`);
  if (second) {
    counts.logs++;
    counts.fates[t.fate] = (counts.fates[t.fate] || 0) + 1;
    ok('fate', W.fatesFor(second.crew.length).includes(t.fate), `${seed}: a crew of ${second.crew.length} took ${t.fate}`);
    ok('form', (t.form === null) === (t.fate !== 'change') && (!t.form || t.form === W.formOf(w)), `${seed}: the form ${t.form} does not follow the fate and the type`);
    if (t.form) counts.forms[t.form] = (counts.forms[t.form] || 0) + 1;
    const log = t.log;
    if (log) {
      ok('log', JSON.stringify(log.crew.map((c) => c.name)) === JSON.stringify(second.crew.map((c) => c.name)), `${seed}: the crew of the third log is not the crew of the second`);
      ok('log', log.crew.every((c) => W.ENDS.includes(c.end)), `${seed}: an end is not one of ${W.ENDS.join(', ')}`);
      ok('log', log.fate === t.fate && log.keeper === second.keeper && log.probe === w.source.log.probe, `${seed}: the fate, the keeper, or the ship of the third log is wrong`);
      ok('log', log.through >= second.days && log.days >= log.through && log.entries.length >= 3, `${seed}: the days of the third log do not follow the second`);
      ok('log', log.entries[0].day === log.through && log.entries.every((e, j) => j === 0 || e.day >= log.entries[j - 1].day), `${seed}: the days of the entries do not rise from the day through`);
      ok('log', log.entries[log.entries.length - 1].slot === 'end.' + t.fate, `${seed}: the last entry is ${log.entries[log.entries.length - 1].slot}`);
      const ends = log.crew.map((c) => c.end);
      const n = (e) => ends.filter((x) => x === e).length;
      const home = n('home'), crew = ends.length;
      switch (t.fate) {
        case 'pact': ok('ends', home === crew, `${seed}: a pact left ${ends}`); break;
        case 'trek': ok('ends', crew >= 3 ? home === crew - 1 && n('lost') === 1 : home === crew, `${seed}: a trek of ${crew} left ${ends}`); break;
        case 'split': ok('ends', home >= 1 && n('gone') >= 1 && home + n('gone') === crew && log.crew.find((c) => c.name === log.keeper).end === 'home', `${seed}: a split left ${ends}`); break;
        case 'sour': ok('ends', crew <= 2 ? n('lost') === crew : home === 1 && n('lost') === crew - 1 && log.crew.find((c) => c.name === log.keeper).end === 'lost', `${seed}: a broken pact of ${crew} left ${ends}`); break;
        case 'mad': ok('ends', n('gone') === crew, `${seed}: the echo left ${ends}`); break;
        case 'change': ok('ends', t.form === 'light' ? n('gone') === crew : n('changed') === crew, `${seed}: the change ${t.form} left ${ends}`); break;
      }
      const v = log.voice;
      if (home) {
        ok('voice', v && v.home && v.line.startsWith(`Thank god, it's been ${w.source.log.years} years, but they sent a rescue ship! I'm glad we kept going.`)
          && log.crew.some((c) => c.name === v.speaker && c.end === 'home'), `${seed}: the rescue line reads ${JSON.stringify(v)}`);
      } else if (t.form === 'chorus') {
        ok('voice', v && !v.home && v.speaker && v.line, `${seed}: the chorus says nothing`);
      } else {
        ok('voice', v === null, `${seed}: a crew with nobody to meet speaks: ${JSON.stringify(v)}`);
      }
    }
  }

  // the roll call: each person of the crew once, in the order of the crew, with an end that follows
  // the third log where the person went through the way, and the people at home where they live
  const roll = W.rollCall(w);
  const crew0 = w.source.log.crew;
  ok('roll', roll && roll.people.length === crew0.length && roll.people.every((x, j) => x.name === crew0[j].name && x.role === crew0[j].role),
    `${seed}: the roll call does not name the crew of the wreck`);
  ok('roll', roll.people.every((x) => W.ROLL_WORDS[x.status] === x.word && x.line && /[.]$/.test(x.line) && !/undefined|NaN|\{/.test(x.line)),
    `${seed}: a row of the roll call reads ${JSON.stringify(roll.people)}`);
  const alive = W.homeOf(t.log).map((c) => c.name);
  ok('roll', JSON.stringify(roll.people.filter((x) => x.status === 'alive').map((x) => x.name)) === JSON.stringify(alive)
    && (alive.length ? !roll.end.startsWith('Nobody') : roll.end === 'Nobody comes home.') && roll.text.endsWith(roll.end),
    `${seed}: the roll call does not follow the people at home: ${roll.text}`);
  if (t.log) {
    for (const c of t.log.crew) {
      const x = roll.people.find((r) => r.name === c.name);
      const want = { home: 'alive', lost: 'dead', gone: 'gone', changed: 'changed' }[c.end];
      ok('roll', x && x.status === want, `${seed}: ${c.name} ends ${c.end} in the third log and ${x && x.status} in the roll call`);
    }
  }
  if (alive.length) {
    const back = W.rollCall(w, { home: true });
    ok('roll', back.people.filter((x) => x.status === 'home').length === alive.length && !back.people.some((x) => x.status === 'alive'),
      `${seed}: the roll call after the way home reads ${JSON.stringify(back.people)}`);
  }
  for (const x of roll.people) counts.roll[x.status] = (counts.roll[x.status] || 0) + 1;

  // 5. the card of the twin
  const card = W.twinCard(w);
  ok('card', card && JSON.stringify(card.rows.slice(0, 4).map((r) => r.key)) === JSON.stringify(['size', 'name', 'herd', 'back'])
    && card.rows.find((r) => r.key === 'name').word === R.portalSeed(w)
    && (card.rows.length === 4) === !!t.log, `${seed}: the card of the twin reads ${JSON.stringify(card && card.rows.map((r) => r.key))}`);
  const key = W.wayKey(w);
  ok('key', key && key.glyphs.length === R.portalSeed(w).length && key.slots.every((k, j) => R.GLYPHS[k] === key.glyphs[j]) && key.reply && key.sounds.length === 16,
    `${seed}: the key of the name is wrong`);

  // 4. the patch of the twin
  if (twinCount++ % PATCH_EVERY) continue;
  counts.patches++;
  const at = dirSite(...t.dir);
  const opts = patchOpts(tier);
  opts.world = OPTS;
  const r = G.patch(seed, { lat: at.lat, lon: at.lon, kind: -1 }, opts);
  const src = r.patch.source;
  ok('patch', src && src.kind === 'twin' && src.proto === t.proto, `${seed}: the patch of the twin holds ${src && src.kind}`);
  if (!src) continue;
  ok('patch', !!src.tent === !!t.log, `${seed}: the tent and the third log disagree`);
  const row = R.protoRow(src.proto);
  if (src.tent) {
    const want = W.tentOf(t);
    ok('tent', ['up', 'graves', 'marks', 'suits'].every((k) => want[k] === src.tent[k]), `${seed}: the tent holds ${JSON.stringify(src.tent)} and not ${JSON.stringify(want)}`);
    for (const c of W.tentCircles(src.tent)) {
      const d = Math.hypot(c.x - src.x, c.z - src.z);
      ok('tent', d - c.r >= row.disc + W.TWIN_CAMP.gap - 1e-6, `${seed}: the ${c.part} of the tent reaches the flat disc`);
      ok('tent', d + c.r <= row.disc * 1.4 + 1e-6, `${seed}: the ${c.part} of the tent stands past the soft edge`);
    }
    const fl = r.flora, circles = W.tentCircles(src.tent);
    let on = 0;
    for (let k = 0; k < fl.length; k += 8) {
      const x = fl[k], z = fl[k + 2];
      if (circles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) on++;
    }
    ok('tent', on === 0, `${seed}: ${on} plants stand on the tent`);
  }
  const groups = r.groups;
  let herdGroups = 0;
  for (let k = 0; k < groups.length; k += 6) if (groups[k + 2] === t.herd) herdGroups++;
  ok('herd', herdGroups >= 1 && src.herd && src.herd.length >= 1, `${seed}: the twin holds ${herdGroups} groups of the herd`);
}

console.log(`  rules     the call sign, the send, the fates, the forms, and the graves`);
console.log(`  twins     ${counts.twins} twins on ${counts.ruins} worlds with a ruin of ${counts.worlds} seeds; bands ${JSON.stringify(counts.bands)}; ${counts.kmMin} to ${counts.kmMax} km from the ruin; ${counts.kin} kin`);
console.log(`  logs      ${counts.logs} third logs; fates ${JSON.stringify(counts.fates)}; forms ${JSON.stringify(counts.forms)}`);
console.log(`  roll      the ends of every person of the roll calls: ${JSON.stringify(counts.roll)}`);
console.log(`  patches   ${counts.patches} patches of the twin: the stones, the tent, and the herd`);
console.log('');
if (fails) { console.log(`FAIL: ${fails} checks`); process.exit(1); }
console.log('PASS');
