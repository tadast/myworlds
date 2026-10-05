// myworlds — the progress of the reader in localStorage. Issue 34, slice 2, p2-38, and chapters.js.
//
// One landing gives one fix: the site it stood on, the bearing the instrument stated there, and the
// error of that bearing. The globe draws a wedge per fix, and the source stands where two wedges
// cross. The search therefore has to survive a reload, and it has to survive the store of the saved
// worlds: persist() in app.js drops its oldest worlds on a quota error, and a search must not go
// with them. So the progress lives under a key of its own. Decision 10 of issue 34.
//
// chapters.js holds every rule of the story: one fix per cell, the bound of a search, the find, the
// brief, and the tune. This file holds none of them. It reads the shape on disk into the progress of
// chapters.js and writes it back, and it cleans what an older build or a hand left there.
//
// The shape under the key is one object keyed by seed:
//
//   { "Auralis": {
//       fixes: [{ lat, lon, brg, err }], found: true, briefed: 3, ts: 1758240000000,   // the wreck
//       tuned: true,                                   // the receiver holds the band of the ruin
//       ruin: { fixes: [{ lat, lon, brg, err }], found: false, briefed: 0 },           // the ruin
//   } }
//
// The search for the wreck stands at the top of the record as issue 34 wrote it, and the search for
// the ruin stands under `ruin`, as p2-38 wrote it. A later search stands under its own id. A record
// with no `tuned` reads as false, and a record with no `ruin` reads as an empty search, so a record
// of an older build needs no migration and the key does not move.
//
// `briefed` is the highest stage of the search whose brief the reader has opened on this world, 0
// to BRIEF_STAGES, one for each search. A record with no flag reads as 0, and a record of an older
// build holds `true`, which reads as 1.
//
// A shared URL carries no fix. The reader who opens a link starts the search with nothing.
//
// Every call of localStorage sits in try and catch, as persist() does: a private window, a full
// quota, and a browser with the store switched off all give a throw, and the page keeps running.
// The search of one world is cheap to repeat; risk 5 of issue 34 accepts the loss.

export const CARRIER_KEY = 'myworlds.carrier.v1';

// The bounds. The globe paints MAX_WEDGES wedges and no more, so the store keeps the same four: a
// fifth landing drops the oldest fix of that seed. The first build kept 64, and a reader who
// landed eight times then stood before eight wide wedges with no cross in them. Four fixes give a
// cross and one check of that cross. The bound holds for each chapter.
//
// A fix writes about 46 characters of JSON, so one chapter takes about 240 bytes, and 200 seeds of
// two full chapters take about 100 kB at the very worst, well inside the 5 MB most browsers hold.
// 200 seeds is over three times the 60 worlds the Worlds window keeps, so that bound cannot bite a real
// search. The oldest goes first in both: the oldest fix of a chapter, and the seed with the oldest
// write.
export const MAX_FIXES = 4;
export const MAX_SEEDS = 200;
// The stages of the search, as app.js names them: 1 the probe hears the carrier, 2 the wedges cross
// over the landing, 3 the landing is the cell of the carrier. Both chapters take the same three.
export const BRIEF_STAGES = 3;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// A stage as the store keeps it: a whole number in 0 to BRIEF_STAGES. `true` is the flag of an
// older build.
const asStage = (v) => (v === true ? 1 : Number.isInteger(v) ? Math.min(BRIEF_STAGES, Math.max(0, v)) : 0);

// A fix holds four numbers and nothing else. A record from an older build, or from a hand that
// edited the store, gives null here and the reader loses that one line and no more.
function asFix(f) {
  if (!f || typeof f !== 'object') return null;
  const lat = num(f.lat), lon = num(f.lon), brg = num(f.brg), err = num(f.err);
  if (lat == null || lon == null || brg == null || err == null) return null;
  return { lat, lon, brg, err };
}

// The fixes of one chapter, cleaned and bounded.
function asFixes(list) {
  const fixes = [];
  if (Array.isArray(list)) for (const f of list) { const fix = asFix(f); if (fix) fixes.push(fix); }
  return fixes.slice(-MAX_FIXES);
}

function readAll() {
  try {
    const raw = localStorage.getItem(CARRIER_KEY);
    const all = raw ? JSON.parse(raw) : null;
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch { return {}; }
}

function writeAll(all) {
  const byAge = () => Object.keys(all).sort((a, b) => (all[a] && all[a].ts || 0) - (all[b] && all[b].ts || 0));
  const seeds = byAge();
  for (const s of seeds.slice(0, Math.max(0, seeds.length - MAX_SEEDS))) delete all[s];
  try { localStorage.setItem(CARRIER_KEY, JSON.stringify(all)); return true; }
  catch {
    // quota: drop the oldest quarter of the seeds and write once more, as persist() does. This key
    // holds nothing else, so nothing of the saved worlds can go here.
    const left = byAge();
    for (const s of left.slice(0, Math.ceil(left.length / 4))) delete all[s];
    try { localStorage.setItem(CARRIER_KEY, JSON.stringify(all)); return true; } catch { return false; }
  }
}

// ---------------------------------------------------------------- the progress, for chapters.js
// chapters.js holds the rules of the chapters and of the search. These three calls map its
// progress to the shape on disk and back, and they hold no rule of the story.
//
// The progress of a world is one part per chapter, keyed by the id of the chapter, in the order of
// chaptersOf() in chapters.js: `{ fixes, found, briefed, held }`. `held` says that the receiver
// holds the band of that chapter. On disk:
//
//   the first chapter (the wreck)   the top of the record, as issue 34 wrote it. Its band is the
//                                   distress band, which the receiver always holds.
//   the ruin                        `ruin: { fixes, found, briefed }`, with its band held in the
//                                   `tuned` at the top, as p2-38 wrote it
//   a later chapter                 `<id>: { fixes, found, briefed, tuned }`
//   the way on, chapter 3           `way: { found, read, home }`: the arrival at the twin, the
//                                   read of the third log, and the end of the mission. See
//                                   docs/issues/p3-00-the-way-on.md
//
// A part that holds nothing stays off the disk, so the record of a reader who never tunes stays the
// record of issue 34. A key this build does not know stays as it is.

// The progress of one seed, for the chapter ids of its world. A seed with no record gives empty
// parts, so no caller tests for null.
export function readProgress(seed, ids) {
  const all = seed ? readAll() : {};
  return partsOf(all[seed], ids);
}

// The progress of every seed in the store, for the chapter ids `ids`, as a Map of seed to parts.
// One read of the store answers the whole list of saved worlds.
export function readAllProgress(ids) {
  const all = readAll();
  const out = new Map();
  for (const seed of Object.keys(all)) out.set(seed, partsOf(all[seed], ids));
  return out;
}

// The parts of one record on disk.
function partsOf(rec, ids) {
  const r = rec && typeof rec === 'object' ? rec : null;
  const out = {};
  ids.forEach((id, i) => {
    const o = (i === 0 ? r : r && r[id]) || {};
    const part = typeof o === 'object' ? o : {};
    out[id] = {
      fixes: asFixes(part.fixes),
      found: !!part.found,
      briefed: asStage(part.briefed),
      held: i === 0 ? true : id === 'ruin' ? !!(r && r.tuned) : !!part.tuned,
      read: !!part.read,      // chapter 3: the reader read the third log at the twin
      home: !!part.home,      // chapter 3: the reader took the crew home
    };
  });
  return out;
}

// Write the progress of one seed back, with the time of this write.
export function writeProgress(seed, ids, parts) {
  if (!seed || !ids.length) return false;
  const all = readAll();
  const old = all[seed] && typeof all[seed] === 'object' ? all[seed] : {};
  const first = parts[ids[0]];
  const out = { ...old, fixes: first.fixes, found: first.found, briefed: first.briefed, ts: Date.now() };
  delete out.tuned;
  for (const id of ids.slice(1)) {
    const p = parts[id];
    const ruin = id === 'ruin';
    if (ruin && p.held) out.tuned = true;
    if (p.fixes.length || p.found || p.briefed || (p.held && !ruin) || p.read || p.home) {
      out[id] = { fixes: p.fixes, found: p.found, briefed: p.briefed };
      if (p.held && !ruin) out[id].tuned = true;
      if (p.read) out[id].read = true;
      if (p.home) out[id].home = true;
    } else {
      delete out[id];
    }
  }
  all[seed] = out;
  return writeAll(all);
}


// ---------------------------------------------------------------- the codex, chapter 3
// The letters the reader gives the glyphs of one world. Each world keeps its own codex, so the name
// of a new world starts with empty fields: the language of the makers is not the same on two worlds,
// and the puzzle is for the reader to solve on each world. The codex of a seed holds, for each glyph
// of the script by its index 0 to 25, the letter the reader typed, and whether a send proved it.
// See docs/issues/p3-00-the-way-on.md.
//
//   { "<seed>": { letters: { "10": "k", ... }, proven: { "10": true, ... } }, ... }
export const CODEX_KEY = 'myworlds.codex.v2';
// The codex of v1 was one codex for every world. It goes, because its letters belong to no world.
const CODEX_V1 = 'myworlds.codex.v1';

function readCodexAll() {
  try {
    localStorage.removeItem(CODEX_V1);
    const raw = localStorage.getItem(CODEX_KEY);
    const all = raw ? JSON.parse(raw) : null;
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch { return {}; }   // a private window or a store that is switched off: every codex starts empty
}

export function readCodex(seed) {
  const out = { letters: {}, proven: {} };
  const c = readCodexAll()[seed];
  if (!c || typeof c !== 'object') return out;
  for (let k = 0; k < 26; k++) {
    const v = c.letters && c.letters[k];
    if (typeof v === 'string' && /^[a-z]$/.test(v)) out.letters[k] = v;
    if (c.proven && c.proven[k] === true && out.letters[k]) out.proven[k] = true;
  }
  return out;
}

export function writeCodex(seed, codex) {
  const all = readCodexAll();
  all[seed] = codex;
  try { localStorage.setItem(CODEX_KEY, JSON.stringify(all)); return true; } catch { return false; }
}
