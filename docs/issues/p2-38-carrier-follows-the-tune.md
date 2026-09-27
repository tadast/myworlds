# p2-38 The carrier can follow only the wreck

Status: open.

Type: AFK. Phase 2. Blocked by: p2-35. Read `docs/issues/34-the-carrier.md`, "The carrier" and
"The store" in `docs/issues/README.md`, and `docs/issues/p2-00-the-second-signal.md`.

## The defect

Every part of the search of issue 34 reads `world.source`: the bearing, the needle, the fixes, the
wedges, the brief, the level of the motif, and the Carrier row. Chapter 2 needs the same search on
`world.ruin`, once the reader has tuned. Nothing can hold a second search today, and nothing knows
which source the receiver hears.

## What to build

This issue builds chapter 2 of the search with a debug hook in place of the tuner. p2-39 builds the
field the reader types into.

**The source is an argument.** `sourceSite()`, `carrierAt()`, `carrierDir()`, and `carrierBox()` in
`site.js` take the source as a third argument, which defaults to `world.source`. The hash of the
offset takes the kind for the ruin only, as p2-00 states, so every fix of chapter 1 keeps its
bearing and `tools/carrier-check.mjs` keeps passing. Extend the check: the five checks of today run
against a ruin as the source as well.

**`activeSource(world, record)`** in `site.js` gives the ruin when `record.tuned` is true and
`world.ruin` is not null, else the wreck. `app.js` reads it wherever it reads `world.source` for the
carrier: `stageAt()`, `freshFixes()`, the patch-done path that builds `carrier`, `carrierLevel()`,
`carrierState()`, and `aimAtSource()`.

**The store.** `carrier-store.js` gains the shape of p2-00: `tuned` and the chapter-2 record under
`ruin`. Every call that writes a chapter takes it as an option: `addFix(seed, fix, { chapter })`,
`markFound(seed, { chapter })`, `markBriefed(seed, stage, { chapter })`, and `clearFixes(seed, {
chapter })`, with chapter 1 the default, so no caller of today changes. `markTuned(seed)` sets
`tuned`. It does not test the find of the wreck: the tuner of p2-39 shows only after that find, and
a find of the ruin by chance tunes the world too (p2-42). `foundSeeds()` gives the count of finds
per seed, so the sidebar can mark a thumb with one find or two. A record of an older build reads as
chapter 1 with nothing in chapter 2, and the key does not move.

**The wedges of chapter 2.** After the find of the wreck the globe carries the mini wreck and no
wedge. After the tune, `makeCarrierGroup()` draws the fixes of chapter 2 in a second colour.
`pickCarrierColour()` picks it too: of the candidates that stand far from the surface, the one that
also stands farthest from the colour of chapter 1. The mini wreck stays on its cell and keeps the
colour of chapter 1. `goalCell()` fills the cell of the ruin when the wedges close on it, as it does
for the wreck.

**The overlay.** `telemetry().carrier` gains `freq`, as p2-00 states. The carrier block of
`probe-hud.js` prints it under the bearing in the same size as the error: `406.025 MHz` in chapter 1,
and the frequency of the ruin in chapter 2. The block shows the frequency on every landing that hears
a carrier, so a reader learns the look of a frequency long before a log states one.

**The brief of chapter 2.** `#carrier-brief` in `index.html` gains the three stages for the ruin,
beside the three of today: "Unknown signal", "Stronger signal", and "Carrier in reach". The text of
the first one says that the receiver holds the band of the log, that nothing of the crew sends on
it, and that the search runs as it did for the wreck. The block pulses on a landing of a stage the
reader has not read in this chapter, as it does now. Keep the drawings of issue 34; take the colour
of chapter 2 for the wedges in them.

**The sidebar.** The Carrier row reads "Found", then "Tuned", then "1 fix", "3 fixes", and "Found 2
of 2", and the Clear chip clears the fixes of the chapter that runs. After both finds the Aim chip
offers both: "Wreck" and "Ruin".

**`__mw.tune()`** is the debug hook: it calls `markTuned()` on the current world, even when the wreck
is not found, and rebuilds the carrier group. p2-39 replaces it as the way in for the reader and
keeps it for tests.

Out of scope: the field, which is p2-39; the body of the ruin on the ground, which is p2-41; the
card and the find of the ruin, which are p2-42. Until p2-41 lands, a landing on the cell of the ruin
shows the needle and the range and no body.

## Docs

- `docs/issues/README.md`, "The carrier" and "The store": the third argument, `activeSource()`, the
  shape of the store, and `freq` in the telemetry.
- `docs/ruin.md`: a section on chapter 2 of the search.
- `README.md`, "How it works": the second chapter of the search.

## Acceptance criteria

- `node tools/carrier-check.mjs` passes for the wreck and for the ruin.
- A store written by the build of today loads with no change of chapter 1, and a find of today stays
  a find.
- On a found world, `__mw.tune()` then a landing near the wreck gives a fix, a wedge in the second
  colour, and a bearing on the ruin. Three landings close the cell of the ruin, and a landing on it
  shows the range.
- Before the tune, no landing stores a fix of chapter 2, and the overlay shows `406.025 MHz`.
- The HITL check of p2-00: walk five worlds from the wreck, and state the landings each search took.
- Frame time: no change against the build of today at the reveal camera on HIGH.
