// myworlds — the fixes of the carrier in localStorage. Issue 34, slice 2, and p2-38.
//
// One landing gives one fix: the site it stood on, the bearing the instrument stated there, and the
// error of that bearing. The globe draws a wedge per fix, and the source stands where two wedges
// cross. The search therefore has to survive a reload, and it has to survive the store of the saved
// worlds: persist() in app.js drops its oldest worlds on a quota error, and a search must not go
// with them. So the fixes live under a key of their own. Decision 10 of issue 34.
//
// The shape under the key is one object keyed by seed:
//
//   { "Auralis": {
//       fixes: [{ lat, lon, brg, err }], found: true, briefed: 3, ts: 1758240000000,   // chapter 1
//       tuned: true,                                                // the reader locked the receiver
//       ruin: { fixes: [{ lat, lon, brg, err }], found: false, briefed: 0 },           // chapter 2
//   } }
//
// Chapter 1 is the search for the wreck of issue 34, and its keys stand at the top of the record as
// issue 34 wrote them. Chapter 2 is the search for the ruin of phase 2, and it stands under `ruin`.
// `tuned` says that the reader has tuned the receiver to the frequency of the ruin; see
// activeSource() in site.js. A record with no `tuned` reads as false, and a record with no `ruin`
// reads as an empty chapter 2, so a record of an older build needs no migration and the key does
// not move. The write keeps the two new keys out of a record that holds nothing in them, so the
// record of a reader who never tunes stays the record of issue 34. p2-38.
//
// `briefed` is the highest stage of the search whose brief the reader has opened on this world, 0
// to BRIEF_STAGES, one for each chapter. The block of the overlay pulses on a landing of a higher
// stage. A record with no flag reads as 0, and a record of an older build holds `true`, which reads
// as 1: that reader has read the first brief, and the brief of each later stage is still new.
//
// Every call that writes one chapter takes it as an option, `{ chapter }`, 1 or 2, and chapter 1 is
// the default. So every call of issue 34 writes chapter 1 as it did.
//
// A shared URL carries no fix. The reader who opens a link starts the search with nothing.
//
// Every call of localStorage sits in try and catch, as persist() does: a private window, a full
// quota, and a browser with the store switched off all give a throw, and the page keeps running.
// The search of one world is cheap to repeat; risk 5 of issue 34 accepts the loss.
import { siteCell, cellSite, sameCell as oneCell } from './cell-grid.js';

export const CARRIER_KEY = 'myworlds.carrier.v1';

// The bounds. The globe paints MAX_WEDGES wedges and no more, so the store keeps the same four: a
// fifth landing drops the oldest fix of that seed. The first build kept 64, and a reader who
// landed eight times then stood before eight wide wedges with no cross in them. Four fixes give a
// cross and one check of that cross. The bound holds for each chapter.
//
// A fix writes about 46 characters of JSON, so one chapter takes about 240 bytes, and 200 seeds of
// two full chapters take about 100 kB at the very worst, well inside the 5 MB most browsers hold.
// 200 seeds is over three times the 60 worlds the sidebar keeps, so that bound cannot bite a real
// search. The oldest goes first in both: the oldest fix of a chapter, and the seed with the oldest
// write.
export const MAX_FIXES = 4;
export const MAX_SEEDS = 200;
// The stages of the search, as app.js names them: 1 the probe hears the carrier, 2 the wedges cross
// over the landing, 3 the landing is the cell of the carrier. Both chapters take the same three.
export const BRIEF_STAGES = 3;

const emptyChapter = () => ({ fixes: [], found: false, briefed: 0 });
const empty = () => ({ fixes: [], found: false, briefed: 0, ts: 0, tuned: false, ruin: emptyChapter() });

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// A chapter as the store keeps it: 2 names the ruin, and everything else names the wreck.
const asChapter = (v) => (v === 2 ? 2 : 1);

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

// One fix per cell. The test reads the cells of the two sites and not their numbers, so a record
// written by an older build with a site off the grid still finds its cell.
function sameCell(a, b) {
  return oneCell(siteCell(a.lat, a.lon), siteCell(b.lat, b.lon));
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

// Chapter 2 of a record, cleaned. A record with no `ruin` gives an empty chapter.
function chapterOf(r) {
  if (!r || typeof r !== 'object') return emptyChapter();
  return { fixes: asFixes(r.fixes), found: !!r.found, briefed: asStage(r.briefed) };
}

// The record of one seed, cleaned. Every caller gets a copy of its own, so nothing the page holds
// can write the store by the side door.
function recordOf(all, seed) {
  const r = all[seed];
  if (!r || typeof r !== 'object') return empty();
  return {
    fixes: asFixes(r.fixes), found: !!r.found, briefed: asStage(r.briefed), ts: num(r.ts) || 0,
    tuned: !!r.tuned, ruin: chapterOf(r.ruin),
  };
}

// The part of a record one chapter writes: the record itself for chapter 1, as issue 34 keeps it,
// and `ruin` for chapter 2.
const partOf = (rec, chapter) => (asChapter(chapter) === 2 ? rec.ruin : rec);

// A record as it goes into the store. Chapter 1 stands as issue 34 wrote it, and `tuned` and `ruin`
// go in only when they hold something.
function stored(rec) {
  const out = { fixes: rec.fixes, found: rec.found, briefed: rec.briefed, ts: rec.ts };
  if (rec.tuned) out.tuned = true;
  const r = rec.ruin;
  if (r.fixes.length || r.found || r.briefed) out.ruin = { fixes: r.fixes, found: r.found, briefed: r.briefed };
  return out;
}

// Write one record back, with the time of this write.
function put(all, seed, rec) {
  rec.ts = Date.now();
  all[seed] = stored(rec);
  writeAll(all);
  return rec;
}

// The fixes of one world: the whole record, both chapters. A seed with no record gives an empty
// one, so no caller tests for null.
export function loadFixes(seed) {
  return seed ? recordOf(readAll(), seed) : empty();
}

// Add one fix to one chapter, and give the record back. A landing on a cell that already holds a
// fix of that chapter replaces it: the instrument states the same bearing on every visit, so a
// second fix of one cell says nothing new and a second wedge would only draw over the first.
// Decision 9 of issue 34.
//
// A chapter whose source is found takes no fix. The search of that chapter is over, and a wedge
// after the find would only ask a question the reader has answered.
export function addFix(seed, fix, { chapter = 1 } = {}) {
  const keep = asFix(fix);
  if (!seed || !keep) return loadFixes(seed);
  const at = cellSite(siteCell(keep.lat, keep.lon));
  keep.lat = at.lat; keep.lon = at.lon;
  const all = readAll();
  const rec = recordOf(all, seed);
  const part = partOf(rec, chapter);
  if (part.found) return rec;
  part.fixes = part.fixes.filter((f) => !sameCell(f, keep));
  part.fixes.push(keep);
  if (part.fixes.length > MAX_FIXES) part.fixes.splice(0, part.fixes.length - MAX_FIXES);
  return put(all, seed, rec);
}

// The reader has found the source of one chapter. Slice 3 of issue 34 calls this for the wreck
// when the log card first opens, and p2-42 calls it for the ruin. The find drops the fixes of that
// chapter with it: the globe then carries the model of the source and no wedge of that chapter, so
// the answer stands where the question stood.
export function markFound(seed, { chapter = 1 } = {}) {
  if (!seed) return empty();
  const all = readAll();
  const rec = recordOf(all, seed);
  const part = partOf(rec, chapter);
  part.found = true;
  part.fixes = [];
  return put(all, seed, rec);
}

// The reader has opened the brief of one stage of one chapter on this world. The block of the
// overlay pulses on a landing of a higher stage only, and the block is a control on every landing,
// so the reader can read the brief again. The mark never falls: a reader who read the brief of the
// cell of the carrier and lands far out again knows the search.
export function markBriefed(seed, stage = 1, { chapter = 1 } = {}) {
  if (!seed) return empty();
  const all = readAll();
  const rec = recordOf(all, seed);
  const part = partOf(rec, chapter);
  const k = asStage(stage);
  if (part.briefed >= k) return rec;
  part.briefed = k;
  return put(all, seed, rec);
}

// Drop the fixes of one chapter and keep the finds, the briefs, and the tune. A reader who wants a
// clean globe asks for the wedges to go; a reader who has found a source has earned the mark, and
// no button takes it back. The brief stays read for the same reason: the pulse must not come back.
export function clearFixes(seed, { chapter = 1 } = {}) {
  if (!seed) return empty();
  const all = readAll();
  const rec = recordOf(all, seed);
  partOf(rec, chapter).fixes = [];
  return put(all, seed, rec);
}

// The reader has tuned the receiver to the frequency of the ruin. The search of chapter 2 starts,
// and activeSource() in site.js gives the ruin from here on. The store does not test the find of
// the wreck: the tuner of p2-39 shows only after that find, and a find of the ruin by chance tunes
// the world too (p2-42). The fixes of chapter 1 stay as they are.
export function markTuned(seed) {
  if (!seed) return empty();
  const all = readAll();
  const rec = recordOf(all, seed);
  if (rec.tuned) return rec;
  rec.tuned = true;
  return put(all, seed, rec);
}

// The count of finds per seed, as a Map of seed to 1 or 2, for the seeds with a find. The sidebar
// marks the thumb of every saved world in it with one mark for each find, and one read of the store
// answers the whole list. A Map answers has() as the Set of issue 34 did.
export function foundSeeds() {
  const all = readAll();
  const out = new Map();
  for (const seed of Object.keys(all)) {
    const r = all[seed];
    if (!r || typeof r !== 'object') continue;
    const n = (r.found ? 1 : 0) + (r.ruin && typeof r.ruin === 'object' && r.ruin.found ? 1 : 0);
    if (n) out.set(seed, n);
  }
  return out;
}
