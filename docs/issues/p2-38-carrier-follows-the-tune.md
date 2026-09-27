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

## What the build changed

Built on 2026-09-28. Every acceptance criterion but the frame time holds; see the last bullets.

- **The source is the last argument on two calls, not the third.** `carrierDir(world, site,
  carrier, out)` and `carrierBox(world, site, carrier, out)` already take four arguments, and a
  source in third place moves every call of issue 34. So the source stands last on both, after
  `out`: `carrierDir(world, site, carrier, out, src)`. `sourceSite(world, src)` takes it second,
  because it takes one argument before it. `carrierAt(world, site, src)` takes it third, as planned.
  Each defaults to `world.source`, and `tools/carrier-check.mjs` prints the wreck part of its report
  byte for byte as the build of p2-35 did.
- **The hash takes the kind of every source but the wreck.** The plan says the ruin only. The two
  rules agree for the two kinds of today, and a later kind then reads offsets of its own with no
  change. The wreck keeps the key of issue 34.
- **More in `site.js`.** `activeChapter(world, record)` gives 1 or 2, `sourceFreq(src)` gives the
  band the receiver holds, and `WRECK_FREQ` is `'406.025'`. The app names the chapter in many places,
  and one function keeps the rule in one place.
- **A tune on the ground reads the landing again.** The plan has `__mw.tune()` build the group
  again and nothing more. The reader tunes at the wreck, so the landing that tunes must hear the
  ruin. `hearCarrier()` in `app.js` holds the patch-done path of the carrier; a tune on the ground
  calls it again, `Ground.setCarrier()` swaps the reading of the overlay, and that landing takes the
  first fix of chapter 2. A tune in orbit takes no fix, and the row reads "Tuned".
- **The store keeps the new keys out of an empty record.** A write leaves `tuned` and `ruin` out of
  a record that holds nothing in them, so the record of a reader who never tunes stays the record of
  issue 34, byte for byte. A read gives both keys on every record.
- **`foundSeeds()` gives a Map, not a Set.** The plan asks for the count of finds per seed. A `Map`
  of seed to 1 or 2 gives it and still answers `has()`, so the check of issue 34 passes unchanged. A
  thumb with both finds shows "✦✦".
- **One goal slot.** The shader holds one goal cell. In chapter 2 it holds the goal of the ruin, so
  the cell of the wreck gives up the white fill of its find. The pin and the model of the wreck still
  stand on it, in the colour of chapter 1. `setFound()` takes `{ chapter }`: a find of the chapter
  that runs takes its wedges away, and a find of the wreck in chapter 2 stands the pin only.
- **The second colour needs a threshold.** "Far from the surface" is a score of `CARRIER_FAR`, 0.7,
  of the best score, on the score of issue 34 (the tenth percentile of the distance to the surface).
  If no other candidate reaches it, all nine others compete. `carrierColour(world, chapter)` is the
  export p2-41 and p2-42 read. On the ice worlds of the walk the second colour is a saturated blue,
  `#1f4bff`, against the red of chapter 1: the score rates it far from white ice, and it reads on the
  lit side, but thinner than the red.
- **The brief shares stages 2 and 3.** "Stronger signal" and "Carrier in reach" read the same for
  the wreck and for the ruin, so only stage 1 takes a text of its own. A block with `data-chapter`
  shows in its chapter only. In chapter 2 the style sheet gives the wedges, their lines, the cells of
  the fixes, and the numbers of the fixes of the drawings the colour of chapter 2; the globe, the
  probe, and the next landing keep theirs. A dark colour of chapter 2 gets lighter, with its hue,
  until its luminance reaches 0.3, because the card is dark. The label of the block for a screen
  reader now reads "Read the brief of the signal".
- **The unit keeps its case.** The labels of the overlay print in capitals, and `MHZ` is not the
  unit, so `#hud-freq` takes no capitals.
- **The Carrier row.** The link to the record of the missing carrier stands in chapter 1 only. In
  chapter 2 before the find of the ruin, the Aim chip still aims at the wreck, because the tune
  happens there. After both finds the row offers "Wreck" and "Ruin". A find of the ruin alone,
  which p2-42 allows, offers "Aim" at the ruin. `aimAtSource(src)` takes the source; with no
  argument it aims at the source of the chapter that runs, which the tests use.
- **The motif of the wreck stays silent on its cell in chapter 2.** `carrierLevel()` reads the body
  on the patch only when it is the source that runs. The receiver holds the band of the ruin, and
  the ruin has no voice until p2-44. In orbit the motif of the wreck stays in the song after its find.
- **The needle on the cell of the wreck in chapter 2.** `Ground._carrier()` lets the body on the
  patch take the needle and the range only when its kind is `carrier.kind`, so the needle there
  keeps the bearing of the ruin.
- **Hooks for the tests.** `__mw.tune()`, `__mw.landAt(lat, lon)`, and `__mw.recall()`. `landAt()`
  takes the pull and the snap a tap takes, turns the camera over the cell, sends the probe, and
  gives a promise of `{ site, chapter, carrier, stage }` once the ground stands. `recall()` gives a
  promise of `{ chapter, record }` once the probe is back in orbit. A hidden tab stops
  `requestAnimationFrame`, so while the page is hidden both hooks step the frame on a timer of
  50 ms, and a script in a hidden tab still lands. A walk of one search:
  ```js
  const w = __mw.current.world, at = (d) => [Math.asin(d[1]) * 180 / Math.PI, Math.atan2(d[2], d[0]) * 180 / Math.PI];
  await __mw.landAt(...at(w.source.dir));   // the wreck
  __mw.onSourceFound(); __mw.tune();        // the find, then the tune: this landing takes fix 1
  await __mw.recall();
  const r = await __mw.landAt(lat, lon);    // r.carrier.brg, r.stage.n, r.stage.next
  await __mw.recall();                      // __mw.carrier.group.userData.goal is the filled cell
  ```
- **`tools/carrier-fix-check.mjs` gains part E**, the two chapters: a record of issue 34 reads and
  writes back as it was, each call touches its own chapter, the tune keeps the fixes, `foundSeeds()`
  counts, the group of a tuned record paints chapter 2 in the second colour and fills the cell of the
  ruin, and the pin of the wreck keeps the first colour.

### The checks

- All seven checks pass: `world-checksum --check` (the baseline does not move), `carrier-check`
  (the wreck and the ruin), `carrier-fix-check`, `cell-grid-check`, `frame-check`, `ruin-check`, and
  the lore audit.
- In the browser, on `p238-alpha` (terran): a landing 8 cells from the wreck before the tune stored
  a fix of chapter 1 only, and the overlay read `406.025 MHz`. A landing on the wreck, the find, and
  `__mw.tune()` on the ground gave a fix of chapter 2 at 44.6° ± 2.6°, with the true bearing to the
  ruin at 46.6°, and the overlay read `6.967 MHz`. After the recall the globe painted that wedge in
  the second colour, `#ff7b1c`, beside the pin of the wreck in `#c4007a`. Three landings closed the
  cell of the ruin, and the landing on it read "Here" and `0.7 km`, with no body. The Carrier row
  read "Found", then "1 fix" to "4 fixes", and, after a find of the ruin through the store, "Found 2
  of 2" with the chips "Wreck" and "Ruin". A tune in orbit on a found world, `p238-india`, read
  "Tuned" with the Aim chip, and the next landing pulsed the block with "Unknown signal · tap". A
  tune before the find, on `p238-lima`, kept the fix of chapter 1 in the store and painted nothing.

### The walk of five worlds (the HITL check of p2-00)

Walked by script with `__mw.landAt()`, not by hand. The reader tunes on the wreck, which gives
fix 1 of chapter 2, lands 15 cells from the wreck 70° to one side of the first wedge, lands on the
cross of the wedges, and then lands on the filled cell, or a count of cells along the bearing when
the brief gives one. The count is the landings after the landing on the wreck, up to and with the
landing on the cell of the ruin.

| World | Type | Ruin from the wreck | Landings |
|---|---|---|---|
| `p238-alpha` | terran | 15.2 cells | 3 |
| `p238-bravo` | terran | 21.8 cells | 3 |
| `p238-charlie` | exotic | 22.4 cells | 2 |
| `p238-delta` | exotic | 14.9 cells | 3 |
| `p238-echo` | ice | 24.0 cells | 3 |
| `p238-foxtrot` | ice | 17.8 cells | 3 |

Five more worlds, `p238-w1` to `p238-w5`, landed 1.5 cells off the cross on purpose, as an eye does.
Each took 3. The median is 3, inside the three or four of decision 9. The scripted reader reads
the cross better than a person: on `p238-charlie` the cross of two wedges stood on the cell of the
ruin. `RUIN_NEAR` and `RUIN_FAR` do not change here; the walk by hand of the manager decides them.

### Open

- **Frame time is not measured.** The browser pane stood hidden for the whole session, so
  `requestAnimationFrame` did not run. The build adds no work to the frame of the globe: the shader
  and its uniforms do not change, and the overlay writes one more text node when it writes the rest.
- **An orange second colour meets the orange of the drawings.** The drawings of issue 34 mark the
  next landing in `#ffb86b`. On a world whose colour of chapter 2 is orange, `#ff7b1c` on
  `p238-alpha`, the wedges and the next landing take two near colours. The eye check of the owner
  decides if the drawings need another colour for the next landing.
- The walk by hand, and the frame time on HIGH at the reveal camera.
