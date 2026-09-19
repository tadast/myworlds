// myworlds — the fixes of the carrier in localStorage. Issue 34, slice 2.
//
// One landing gives one fix: the site it stood on, the bearing the instrument stated there, and the
// error of that bearing. The globe draws a wedge per fix, and the source stands where two wedges
// cross. The search therefore has to survive a reload, and it has to survive the store of the saved
// worlds: persist() in app.js drops its oldest worlds on a quota error, and a search must not go
// with them. So the fixes live under a key of their own. Decision 10 of issue 34.
//
// The shape under the key is one object keyed by seed:
//
//   { "Auralis": { fixes: [{ lat, lon, brg, err }], found: false, ts: 1758240000000 } }
//
// A shared URL carries no fix. The reader who opens a link starts the search with nothing.
//
// Every call of localStorage sits in try and catch, as persist() does: a private window, a full
// quota, and a browser with the store switched off all give a throw, and the page keeps running.
// The search of one world is cheap to repeat; risk 5 of issue 34 accepts the loss.
import { snapSite } from './site.js';

export const CARRIER_KEY = 'myworlds.carrier.v1';

// The bounds. The globe paints MAX_WEDGES wedges and no more, so the store keeps the same four: a
// fifth landing drops the oldest fix of that seed. The first build kept 64, and a reader who
// landed eight times then stood before eight wide wedges with no cross in them. Four fixes give a
// cross and one check of that cross.
//
// A fix writes about 46 characters of JSON, so one seed takes about 240 bytes and 200 seeds take
// about 50 kB at the very worst, well inside the 5 MB most browsers hold. 200 seeds is over three
// times the 60 worlds the sidebar keeps, so that bound cannot bite a real search. The oldest goes
// first in both: the oldest fix of a seed, and the seed with the oldest write.
export const MAX_FIXES = 4;
export const MAX_SEEDS = 200;

const empty = () => ({ fixes: [], found: false, ts: 0 });

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// A fix holds four numbers and nothing else. A record from an older build, or from a hand that
// edited the store, gives null here and the reader loses that one line and no more.
function asFix(f) {
  if (!f || typeof f !== 'object') return null;
  const lat = num(f.lat), lon = num(f.lon), brg = num(f.brg), err = num(f.err);
  if (lat == null || lon == null || brg == null || err == null) return null;
  return { lat, lon, brg, err };
}

// One fix per cell. The site of a fix is snapped on the way in, so two numbers are enough here;
// the snap runs again because a record written by an older build may carry a site off the grid.
function sameCell(a, b) {
  const x = snapSite(a), y = snapSite(b);
  return x.lat === y.lat && x.lon === y.lon;
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

// The record of one seed, cleaned. Every caller gets a copy of its own, so nothing the page holds
// can write the store by the side door.
function recordOf(all, seed) {
  const r = all[seed];
  if (!r || typeof r !== 'object') return empty();
  const fixes = [];
  if (Array.isArray(r.fixes)) for (const f of r.fixes) { const fix = asFix(f); if (fix) fixes.push(fix); }
  return { fixes: fixes.slice(-MAX_FIXES), found: !!r.found, ts: num(r.ts) || 0 };
}

// The fixes of one world. A seed with no record gives an empty one, so no caller tests for null.
export function loadFixes(seed) {
  return seed ? recordOf(readAll(), seed) : empty();
}

// Add one fix, and give the record back. A landing on a cell that already holds a fix replaces it:
// the instrument states the same bearing on every visit, so a second fix of one cell says nothing
// new and a second wedge would only draw over the first. Decision 9 of issue 34.
export function addFix(seed, fix) {
  const keep = asFix(fix);
  if (!seed || !keep) return loadFixes(seed);
  const at = snapSite(keep);
  keep.lat = at.lat; keep.lon = at.lon;
  const all = readAll();
  const rec = recordOf(all, seed);
  rec.fixes = rec.fixes.filter((f) => !sameCell(f, keep));
  rec.fixes.push(keep);
  if (rec.fixes.length > MAX_FIXES) rec.fixes.splice(0, rec.fixes.length - MAX_FIXES);
  rec.ts = Date.now();
  all[seed] = rec;
  writeAll(all);
  return rec;
}

// The reader has found the source of this world. Slice 3 calls this when the log card first opens.
export function markFound(seed) {
  if (!seed) return empty();
  const all = readAll();
  const rec = recordOf(all, seed);
  rec.found = true;
  rec.ts = Date.now();
  all[seed] = rec;
  writeAll(all);
  return rec;
}

// Drop the fixes of one world and keep the find. A reader who wants a clean globe asks for the
// wedges to go; a reader who has found the wreck has earned the mark, and no button takes it back.
export function clearFixes(seed) {
  if (!seed) return empty();
  const all = readAll();
  const rec = recordOf(all, seed);
  rec.fixes = [];
  rec.ts = Date.now();
  all[seed] = rec;
  writeAll(all);
  return rec;
}

// The seeds whose source is found, as a Set. The sidebar marks the thumb of every saved world in
// it, and one read of the store answers the whole list.
export function foundSeeds() {
  const all = readAll();
  const out = new Set();
  for (const seed of Object.keys(all)) if (all[seed] && all[seed].found) out.add(seed);
  return out;
}
