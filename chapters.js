// myworlds — the chapters of a world, and the progress of the reader through them.
//
// A chapter is one step of the story of a world: a goal for the reader. A search is one kind of
// chapter. Its goal is a source, which the reader finds with the carrier: fixes, wedges, briefs, and
// a find. See "The story" in CONTEXT.md.
//
// The chapters open in a fixed order. The first chapter is open at the start, and each later
// chapter opens when the chapter before it ends. A closed chapter cannot end: the reader can see its
// source on the ground, but its card does not open and no find is recorded. See
// docs/adr/0001-chapters-open-in-strict-order.md.
//
// The receiver holds the distress band of the wreck from the start, and the reader tunes to hold
// each later band. It follows the newest search whose band it holds. The order makes that search
// the one the reader has not finished, when there is one: every search before an open search is
// done.
//
// This file holds every rule of the story, and the words the page shows for them. It holds no
// three.js and no DOM, so tools/chapters-check.mjs walks a whole story in Node. carrier-store.js
// keeps the progress by seed in localStorage.
//
// The page asks the view of the progress every question of the story: the search the receiver
// follows, the sources that are found, what the tuner shows, the state of the search, and how loud
// each motif plays. story.js turns the view into the words of the Story window. After each change of the progress the page shows one new view, so no rule of the
// story stands in the page.
//
//   chaptersOf(world)   the chapters of a world, in order
//   progressOf(world)   the progress of the reader on a world: view(), land(), read(), tune(),
//                       briefed(), and clear()
//   motifLevel()        the level of the motif of one kind of source, from a view
//   marksOf()           the marks of the finds on the thumbs of the saved worlds
//   briefWords()        the title and the hint of a brief
//   CLOSED_LINE         the line of the study chip over the source of a closed search
//
// Chapter 3, the way on, is not a search: the reader reads a name on the card of the ruin, sends it,
// and the ruin carries the probe to the twin. The arrival is its find. See
// docs/issues/p3-00-the-way-on.md.
import { carrierAt, carrierBox, sourceSite, snapSite, WRECK_FREQ } from './carrier.js';
import { CELL, siteCell, siteDir, sameCell } from './cell-grid.js';
import { wedgePlanes, inWedge, goalCell } from './wedge.js';
import { tuneAnswer } from './tuner.js';
import { homeOf } from './way-types.js';
import { readProgress, readAllProgress, writeProgress, MAX_FIXES, BRIEF_STAGES } from './carrier-store.js';

// The study chip over the source of a closed search. The card of the way on already says "The
// probe cannot read this yet", so this line takes other words.
export const CLOSED_LINE = 'Silent · nothing to read yet';

// ---------------------------------------------------------------- the chapters of a world
// The chapters come from the world itself, in a fixed order: the search for the wreck, then the
// search for the ruin. A world with no source, which is every gas giant, has none.
//
// Each chapter is `{ id, kind, name, source, freq }`. `id` names the chapter in the store and in
// the page, `kind` is 'search', `source` is the source the search looks for, and `freq` is the band
// it sends on, with no unit. The id of a search is the kind of its source.
//
// ORDER holds the id of every chapter a world can hold, in the order of the story.
//
// Chapter 3 is `{ id: 'way', kind: 'way' }`: the way on, from the ruin to the twin. Its source is the
// twin. It holds no band and takes no fix, so the receiver never follows it.
const ORDER = ['wreck', 'ruin', 'way'];

export function chaptersOf(world) {
  if (!world || !world.source || !world.source.dir) return [];
  const list = [{ id: 'wreck', kind: 'search', name: 'Wreck', source: world.source, freq: WRECK_FREQ }];
  if (world.ruin && world.ruin.dir) {
    list.push({ id: 'ruin', kind: 'search', name: 'Ruin', source: world.ruin, freq: world.ruin.freq });
    if (world.twin && world.twin.dir) list.push({ id: 'way', kind: 'way', name: 'Twin', source: world.twin, freq: null });
  }
  return list;
}

// ---------------------------------------------------------------- the words of the brief
// The brief follows the landing, in three stages:
//
//   1  far      the probe hears the carrier. The brief says how the wedges find the cell from orbit.
//   2  cross    the cell lies inside two or more of the earlier wedges, or the range of decision 7
//               of issue 34 shows, but it is not the cell of the carrier.
//   3  landing  the cell of the carrier. The source stands inside the reach of the probe.
//
// The first search reads a distress signal. Every later search reads an unknown signal, and it
// takes the second sheet of the drawings of the brief in index.html.
const BRIEF_TITLE = {
  1: ['', 'Distress signal', 'Stronger signal', 'Carrier in reach'],
  2: ['', 'Unknown signal', 'Stronger signal', 'Carrier in reach'],
};
const BRIEF_HINT = {
  1: ['', 'New signal · tap', 'Stronger signal · tap', 'Carrier in reach · tap'],
  2: ['', 'Unknown signal · tap', 'Stronger signal · tap', 'Carrier in reach · tap'],
};

// The words of the brief of one stage `n` of the chapter at `index`: `{ sheet, title, hint }`.
export function briefWords(index, n) {
  const sheet = index > 0 ? 2 : 1;
  const k = Math.min(BRIEF_STAGES, Math.max(1, n | 0));
  return { sheet, title: BRIEF_TITLE[sheet][k], hint: BRIEF_HINT[sheet][k] };
}

// ---------------------------------------------------------------- the state of the chapters
// 'closed', 'open', or 'done' for each chapter, from the find of each chapter, in order. A chapter
// opens when the chapter before it ends. A record of an older build can hold a find on a closed
// chapter. The store keeps that find, and the chapter shows as done when it opens.
function statesOf(found) {
  const out = [];
  let open = true;
  for (const f of found) {
    const s = !open ? 'closed' : f ? 'done' : 'open';
    out.push(s);
    open = s === 'done';
  }
  return out;
}

// ---------------------------------------------------------------- the marks of the saved worlds
// One mark for each chapter that is done, from one read of the store for the whole list of saved
// worlds. The order holds here too: a find on a closed chapter makes no mark.
export function marksOf() {
  const out = new Map();
  for (const [seed, parts] of readAllProgress(ORDER)) {
    const finds = statesOf(ORDER.map((id) => parts[id].found)).filter((s) => s === 'done').length;
    if (!finds) continue;
    // Chapter 3: the arrival at the twin makes the third mark, and the end of the mission a house.
    const home = finds === ORDER.length && parts.way.home;
    out.set(seed, {
      finds, home,
      text: '✦'.repeat(finds) + (home ? ' ⌂' : ''),
      title: home ? 'The crew of this world went home'
        : finds === 1 ? 'A source of this world is found' : `${finds} sources of this world are found`,
    });
  }
  return out;
}

// ---------------------------------------------------------------- the progress of a world
export function progressOf(world) {
  return new Progress(world);
}

class Progress {
  constructor(world) {
    this.world = world;
    this.seed = world ? world.seed : null;
    this.chapters = chaptersOf(world);
    this.ids = this.chapters.map((c) => c.id);
    this.parts = {};
    this._reload();
  }

  // Every event reads the store again first, so a second tab on the same world does not lose the
  // writes of the first.
  _reload() {
    if (this.ids.length) this.parts = readProgress(this.seed, this.ids);
  }

  _save() {
    writeProgress(this.seed, this.ids, this.parts);
  }

  // 'closed', 'open', or 'done' for each chapter, in order. See statesOf().
  _states() {
    return statesOf(this.ids.map((id) => this.parts[id].found));
  }

  // The index of the search the receiver follows, or null for a world with no chapter: the newest
  // search that is not closed and whose band the receiver holds.
  _follow(states) {
    for (let i = this.chapters.length - 1; i >= 0; i--) {
      const c = this.chapters[i];
      if (c.kind === 'search' && states[i] !== 'closed' && this.parts[c.id].held) return i;
    }
    return null;
  }

  // The index of the search the tuner stands for, or -1: the newest search after the first that is
  // not closed. The tuner shows its field until the receiver holds that band, and the locked band
  // after it.
  _tuner(states) {
    for (let i = this.chapters.length - 1; i >= 1; i--) {
      if (this.chapters[i].kind === 'search' && states[i] !== 'closed') return i;
    }
    return -1;
  }

  // The fixes of one search with the bearing and the error of every fix computed again.
  //
  // carrierAt() is a pure function of the seed and the cell, so a stored fix needs no number of its
  // own: the store keeps `{ lat, lon, brg, err }` as the record of a landing, and the page takes the
  // numbers the instrument states today. A fix the carrier no longer reaches is dropped, because
  // the instrument would not state its wedge. Issue 34.
  _fresh(i) {
    const c = this.chapters[i];
    const out = [];
    for (const f of this.parts[c.id].fixes) {
      const r = carrierAt(this.world, f, c.source);
      if (r) out.push({ ...f, brg: r.brg, err: r.err });
    }
    return out;
  }

  // What the page shows of the progress, as one value.
  //
  //   chapters  every chapter: `{ id, kind, name, index, state, held, fixes, briefed, source }`
  //   follow    the search the receiver follows: `{ id, index, n, name, source, freq }`, or null.
  //             `n` counts the chapter from 1. The search takes the colour of chapter `n`.
  //   found     `{ [id]: true }` for each chapter that is done
  //   tuner     `{ seed, id, held, band }` for the tuner, or null where the world takes none.
  //             `band` is the band of the tuner after the lock, and null before it. So the page
  //             never holds the band before the reader types it. See tuner.js.
  //   finds     the count of searches that are done, of `of` searches
  //   row       the Carrier row: the state of the search in a few words, or null; see rowOf()
  view() {
    const states = this._states();
    const chapters = this.chapters.map((c, i) => {
      const p = this.parts[c.id];
      return {
        id: c.id, kind: c.kind, name: c.name, index: i, state: states[i], held: p.held,
        fixes: this._fresh(i), briefed: p.briefed, source: c.source,
      };
    });
    const f = this._follow(states);
    const follow = f == null ? null : {
      id: this.chapters[f].id, index: f, n: f + 1, name: this.chapters[f].name,
      source: this.chapters[f].source, freq: this.chapters[f].freq,
    };
    const found = {};
    for (const c of chapters) if (c.state === 'done') found[c.id] = true;
    const t = this._tuner(states);
    const held = t >= 0 && this.parts[this.ids[t]].held;
    const tuner = t < 0 ? null : {
      seed: this.seed, id: this.chapters[t].id, held, band: held ? this.chapters[t].freq : null,
    };
    const searches = chapters.filter((c) => c.kind === 'search');
    const v = {
      seed: this.seed, chapters, follow, found, tuner,
      finds: searches.filter((c) => c.state === 'done').length, of: searches.length,
      way: this._way(states),
    };
    v.row = rowOf(v);
    return v;
  }

  // Chapter 3, the way on, as the page reads it, or null on a world with no twin:
  //
  //   state   'closed', 'open', or 'done'. It opens with the find of the ruin, and the arrival at
  //           the twin ends it
  //   read    the reader opened the card of the twin, which holds the third log
  //   home    the reader took the crew home. The mission is over
  //   crew    the third log holds a person whose end is `home`, so the tent has somebody to take
  //   text    the status of chapter 3 in the Story window
  _way(states) {
    const i = this.ids.indexOf('way');
    if (i < 0) return null;
    const p = this.parts.way;
    const log = this.world.twin && this.world.twin.log;
    const crew = homeOf(log).length > 0;
    const state = states[i];
    const text = state === 'closed' ? null
      : state === 'open' ? 'A name to read'
        : p.home ? 'The crew is home'
          : !p.read ? 'At the twin'
            : crew ? 'Somebody waits' : log ? 'Log read' : 'Nobody came';
    return { state, read: p.read, home: p.home, crew, text };
  }

  // A landing at a site. The receiver reads the carrier of the search it follows, the fix of the
  // landing goes into that search, and the stage of the brief comes back. Gives
  // `{ carrier, stage, fix }`, or null for a world with no chapter.
  //
  //   carrier  carrierAt() with `dir`, the needle in the frame of the box, `kind`, the kind of the
  //            source, and `freq`, the band the receiver holds; or null past the reach
  //   stage    the stage of the brief: `{ n, sheet, title, hint, pulse }`, and on stage 2 also
  //            `next` ('goal', 'near', or 'far'), `cells`, and `brg`; or null with no carrier
  //   fix      the fix the landing stored, or null. The globe fades its wedge in at the end of the
  //            ascent.
  //
  // A search whose source is found takes no fix: that search is over, and a wedge would ask a
  // question the reader has answered. One cell holds one fix of a search, and a second landing on
  // it replaces the first. A search keeps MAX_FIXES fixes, and the oldest goes first.
  //
  // A second land() on the same site after a tune reads the carrier of the new band, and the landing
  // takes the first fix of that search.
  land(site) {
    this._reload();
    const i = this._follow(this._states());
    if (i == null || !site) return null;
    const c = this.chapters[i];
    const p = this.parts[c.id];
    const carrier = carrierAt(this.world, site, c.source);
    if (carrier) {
      const v = carrierBox(this.world, site, carrier, undefined, c.source);
      carrier.dir = v ? [v.x, v.z] : null;
      carrier.kind = c.source.kind;
      carrier.freq = c.freq;
    }
    const before = this._fresh(i);      // the wedge of this cell is not part of the cross it stands in
    let fix = null;
    if (carrier && !p.found) {
      const at = snapSite(site);
      fix = { lat: at.lat, lon: at.lon, brg: carrier.brg, err: carrier.err };
      const here = siteCell(at.lat, at.lon);
      p.fixes = p.fixes.filter((g) => !sameCell(siteCell(g.lat, g.lon), here));
      p.fixes.push(fix);
      if (p.fixes.length > MAX_FIXES) p.fixes.splice(0, p.fixes.length - MAX_FIXES);
      this._save();
    }
    const stage = carrier ? this._stage(i, site, carrier, before) : null;
    return { carrier, stage, fix };
  }

  // The stage of the search on one landing. `before` holds the fixes of the earlier landings of the
  // search. The next step of stage 2 reads the fixes after this landing, which is what the globe
  // draws at the end of the ascent: the filled cell of the source when the wedges close on it, else
  // the count of cells along the bearing when the range shows, else one more wedge.
  //
  // `pulse` says that the brief of this stage is new to the reader. A press on the block of the
  // overlay marks it read; see briefed().
  _stage(i, site, carrier, before) {
    const c = this.chapters[i];
    const p = this.parts[c.id];
    const words = (n) => ({ n, ...briefWords(i, n), pulse: !p.found && p.briefed < n });
    const at = snapSite(site);
    const here = siteCell(at.lat, at.lon);
    const src = sourceSite(this.world, c.source);
    if (src && sameCell(here, siteCell(src.lat, src.lon))) return words(3);
    const d = siteDir(at.lat, at.lon);
    const dir = { x: d[0], y: d[1], z: d[2] };
    const crossed = before.filter((f) => !sameCell(siteCell(f.lat, f.lon), here) && inWedge(wedgePlanes(f), dir)).length;
    const near = carrier.rangeKm != null;
    if (crossed < 2 && !near) return words(1);
    const goal = !p.found && goalCell(this.world, this._fresh(i), c.source);
    const next = goal ? 'goal' : near ? 'near' : 'far';
    return { ...words(2), next, cells: Math.max(1, Math.round(carrier.arc / CELL)), brg: carrier.brg };
  }

  // The state of chapter `id`: 'closed', 'open', 'done', or null for a chapter the world does not
  // hold. It reads no fix, so the page may ask it on every frame.
  state(id) {
    const i = this.ids.indexOf(id);
    return i < 0 ? null : this._states()[i];
  }

  // The card of the source of chapter `id` asks to open. Gives `{ open, found }`: the card opens
  // only on a chapter that is not closed, and `found` says that this read is the find. The find
  // ends the chapter, drops its fixes, and holds its band, because the card states the band. The
  // next chapter opens with it.
  read(id) {
    this._reload();
    const i = this.ids.indexOf(id);
    if (i < 0) return { open: false, found: false };
    const s = this._states()[i];
    if (s === 'closed') return { open: false, found: false };
    if (s === 'done') return { open: true, found: false };
    const p = this.parts[id];
    p.found = true;
    p.fixes = [];
    p.held = true;
    this._save();
    return { open: true, found: true };
  }

  // Chapter 3. The probe stands at the twin: the arrival ends the way on. It counts only while the
  // chapter is open, and it gives `{ found }`, true when this arrival is the find.
  arrive() {
    this._reload();
    const i = this.ids.indexOf('way');
    if (i < 0 || this._states()[i] !== 'open') return { found: false };
    this.parts.way.found = true;
    this._save();
    return { found: true };
  }

  // Chapter 3. The reader read the third log on the card of the twin. The people of the tent walk
  // out after it. Gives true when this read is new.
  readLog() {
    this._reload();
    const i = this.ids.indexOf('way');
    if (i < 0 || this._states()[i] !== 'done' || this.parts.way.read) return false;
    this.parts.way.read = true;
    this._save();
    return true;
  }

  // Chapter 3. The reader takes the crew home: the end of the mission. It needs the read of the log
  // and a person to take. Gives true when this press is the end.
  goHome() {
    this._reload();
    const i = this.ids.indexOf('way');
    if (i < 0 || this._states()[i] !== 'done' || this.parts.way.home || !this.parts.way.read) return false;
    if (!homeOf(this.world.twin && this.world.twin.log).length) return false;
    this.parts.way.home = true;
    this._save();
    return true;
  }

  // One text the reader typed into the tuner: the answer of tuneAnswer() in tuner.js against the
  // band of the tuner. A lock makes the receiver hold that band, and the search starts.
  tune(text) {
    this._reload();
    const t = this._tuner(this._states());
    if (t < 0) return tuneAnswer(text, null);
    const c = this.chapters[t];
    const a = tuneAnswer(text, c.freq, t + 1);
    if (a.kind === 'lock' && !this.parts[c.id].held) {
      this.parts[c.id].held = true;
      this._save();
    }
    return a;
  }

  // The reader has opened the brief of stage `n` of the search the receiver follows. The mark never
  // falls: a reader who read the brief of the cell of the carrier and lands far out again knows the
  // search.
  briefed(n) {
    this._reload();
    const i = this._follow(this._states());
    if (i == null) return;
    const p = this.parts[this.ids[i]];
    const k = Math.min(BRIEF_STAGES, Math.max(0, n | 0));
    if (p.briefed >= k) return;
    p.briefed = k;
    this._save();
  }

  // Drop the fixes of the search the receiver follows. The finds, the briefs, and the bands stay: a
  // reader who has found a source has earned the mark, and no button takes it back.
  clear() {
    this._reload();
    const i = this._follow(this._states());
    if (i == null) return;
    this.parts[this.ids[i]].fixes = [];
    this._save();
  }
}

// ---------------------------------------------------------------- the motif in the song
// The source has a voice of its own, and its level tells how near the probe stands. The song itself
// never changes, so a reader who does not search loses nothing. Decision 11 of issue 34. The ruin
// has a voice of its own too, on the ruin bus of music.js, p2-44. Each bus follows one rule for its
// own kind of source:
//
//   on the ground   the source on this cell sounds only when it is the source of the search the
//                   receiver follows: CARRIER_EDGE at the edge of the reach, and 1 at CARRIER_NEAR
//                   units. The receiver holds one band, so after the tune the wreck is silent.
//   in orbit        CARRIER_ORBIT after the find of that source, whatever search runs, and 0 before.
//
// So after both finds both motifs play in orbit, over a song that stays whole. p2-38 and p2-41.
const CARRIER_NEAR = 40;      // units from the source where the motif stands full
const CARRIER_EDGE = 0.15;    // the level at the edge of the reach
const CARRIER_ORBIT = 0.6;    // the level in orbit after the find

// The level of the motif of one kind of source, 'wreck' or 'ruin', 0 to 1. `v` is a view of the
// progress, or null. `here` is null in orbit. On the ground it is `{ kind, range, reach }`: the kind
// of the source on this cell or null, the units from the probe to that source as the overlay states
// them, and the reach of the ground.
export function motifLevel(v, kind, here = null) {
  const src = v && v.follow && v.follow.source;
  if (!src) return 0;
  if (here) {
    if (src.kind !== kind || here.kind !== kind) return 0;
    const far = Math.max(CARRIER_NEAR + 1, here.reach);
    const x = Math.min(1, Math.max(0, (here.range - CARRIER_NEAR) / (far - CARRIER_NEAR)));
    const k = 1 - x * x * (3 - 2 * x);   // the smoothstep of three.js
    return CARRIER_EDGE + (1 - CARRIER_EDGE) * k;
  }
  return v.found[kind] ? CARRIER_ORBIT : 0;
}

// ---------------------------------------------------------------- the Carrier row
// The row states the search the receiver follows, so the story of a world reads, in order: "Not
// heard", "1 fix", "3 fixes", "Found", then after the tune "Tuned", "1 fix", "3 fixes", and "Found 2
// of 2". The count takes the fixes of that search only. The Story window offers the record of the
// incident while `lost` holds; story.js writes the words of each chapter. See docs/ui.md.
//
//   text   the words of the row
//   n      the fixes of the search the receiver follows
//   lost   the record of the missing carrier has something to tell: the first search, no fix yet
//   clear  the search holds a fix, so its wedges can go
//   tune   a band waits for the tuner
//   aims   one entry for each found source: "Aim" for one, and the name of each for more
function rowOf(v) {
  if (!v.follow) return null;
  const c = v.chapters[v.follow.index];
  const n = c.fixes.length;
  const found = c.state === 'done';
  const count = n === 1 ? '1 fix' : `${n} fixes`;
  const text = v.follow.index > 0
    ? (found ? `Found ${v.finds} of ${v.of}` : n === 0 ? 'Tuned' : count)
    : (found ? 'Found' : n === 0 ? 'Not heard' : count);
  // The twin of chapter 3 takes an Aim chip of its own after the arrival.
  const done = v.chapters.filter((ch) => (ch.kind === 'search' || ch.kind === 'way') && ch.state === 'done');
  const aims = done.length === 1 ? [{ id: done[0].id, label: 'Aim' }] : done.map((ch) => ({ id: ch.id, label: ch.name }));
  return {
    text, n,
    lost: v.follow.index === 0 && n === 0 && !found,
    clear: n > 0,
    tune: !!(v.tuner && !v.tuner.held),
    aims,
  };
}
