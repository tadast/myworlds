# p2-35 No second source stands on the world, so the log has nothing to point at

Status: open.

Type: AFK. Phase 2. Blocked by: none. Read `docs/issues/README.md` and
`docs/issues/p2-00-the-second-signal.md` first.

## The defect

Every world with a surface holds one source, the wreck, and the search ends there. Phase 2 needs a
second source: the ruin. The log of p2-40 must state its frequency and the direction to it, the
carrier of p2-38 must bear on it, and the patch of p2-41 must stand it on its cell. None of that
can start until the world knows where the ruin is, what shape it takes, who made it, and what band
it sends on.

## What to build

**`ruin-types.js`**, a new module with no three.js and no DOM. It holds the contract of p2-00:
`RUIN_PROTOS` with the eight rows of the proto table (`id`, `name`, `fits`, `disc`, `height`),
`protoOf(world)`, `freqOf(seed)`, `parseFreq(text)`, `portalSeed(world)`, and `compass8(brg)`. The
hashes are the FNV hash that `hullOf()` in `wreck-geometry.js` uses, over the strings of p2-00, so
the pick draws no number from any stream of `generate.js`.

- `protoOf(world)` picks among the rows that fit `world.type`, in the order of the table. Every
  type of a world with a surface has three or four rows. A gas giant gives null.
- `freqOf(seed)` gives `'N.NNN'` from 3.000 to 29.999. Three digits after the point, always, so
  `'5.070'` and not `'5.07'`.
- `parseFreq(text)` gives a number of MHz or null. It trims spaces, drops a trailing `MHz` in any
  case, takes a comma as the point, and puts the point before the last three digits of a number of
  four digits or more with no separator. `'7.316'`, `'7,316'`, `'7316'`, and `' 7.316 mhz '` all
  give 7.316. `'abc'`, `''`, and `'7.3.1'` give null.
- `portalSeed(world)` gives a seed word from the hash of `'portal:' + seed`: two to four syllables
  from a fixed list of plain syllables, capitalised, so it reads as a name and never as a word of
  English. p2-42 draws it as glyphs and a later issue opens it. It must never equal the seed.
- `compass8(brg)` gives one of eight words for a bearing in degrees, with north at 0 and east at 90:
  `north`, `north-east`, `east`, `south-east`, `south`, `south-west`, `west`, `north-west`.

**`makeRuin()` in `generate.js`**, after `makeSource()`, from `makeRng(seed + '|ruin')` and no
other stream. It follows the rules of `makeSource()` and reuses its helpers: `fieldAt()`,
`surfaceSlope()`, `sampledSeaLevel()`, `cellDir()`, and `dirCell()`.

- It gives null when `world.source` is null.
- Each try draws two numbers, first and always: an arc from the wreck and a bearing from the wreck.
  The arc runs from `RUIN_NEAR` to `RUIN_FAR` cells, 12 and 35 (decision 9 of p2-00), with the draw
  even over the area of that band and not over the arc. The candidate is the direction at that arc
  and bearing from the direction of the wreck, snapped to the middle of its cell.
- A candidate passes when it stands over the beach band, its slope is under `SOURCE_SLOPE`, it lies
  inside `SOURCE_LAT`, its cell is not the cell of the wreck, and it stands `SOURCE_KEEP` cells or
  more from the cell of the activity. Test the middle of the cell, as `makeSource()` does.
- **The fallback bands.** After `RUIN_TRIES` tries, 900, the band widens to 6 to 80 cells for the
  same count of tries, then to 2 to 120. Every band stays inside `CARRIER_REACH` of the wreck, so a
  fix at the wreck always hears the ruin. After the last band the world takes no ruin. The draws of
  a band are always drawn in full order, so the stream stays in step.
- The maker, after the place, from the same stream (decision 4 of p2-00). Take the species of the
  world whose way of moving can build: `mwalk` first, then `mcrawl`, `msling`, `mdig`, and `mfly`,
  from `motionOf()` in `source-lore.js`. Among those, take the one with the largest body. Write
  `{ species: <index>, limbs, height, rolled: false }`, where `limbs` comes from the locomotion
  (monopod 1, biped 2, tripod 3, quad 4, hexapod 6, serpent 0, slinger 2, plough 4, and wings 4:
  two legs and two wings) and `height` from the body size in metres, as the gates `bigBody` and
  `handBody` of `source-lore.js` read it. A world with no fit species rolls a maker:
  `limbs` from 2, 3, 4, and 6, and `height` from 1.5 to 6 metres, with `rolled: true` and `species:
  -1`.
- `from` is `compass8()` of the bearing from the wreck to the ruin, in the frame `bearingTo()` in
  `site.js` uses: north is the part of +y in the tangent plane, and east is the direction of
  falling lon. Do not derive east again. Read the note in `docs/probe.md`, decision 10.
- Write `world.ruin` in the shape of p2-00, with `log: null`.

**`?ruin`**, a debug flag in `app.js` on the pattern of `?source`: a dot on the globe at the ruin.
It is the eye check for the placement and it stays out of the UI.

**The tools.**

- `node tools/world-checksum.mjs` must match the baseline with no change: this issue moves no
  number of any stream and writes no text into the log.
- `node tools/world-checksum.mjs --source` prints the ruin of each seed on both tiers beside the
  wreck: the cell, the proto, the frequency, and the maker. The two tiers must agree.
- A new check in `tools/carrier-check.mjs`, or a new `tools/ruin-check.mjs`: over 500 seeds, every
  world with a wreck has a ruin; the arc from the wreck lies inside the band the world took; the
  ruin cell passes the tests; `from` agrees with `bearingTo()` from the wreck; and `parseFreq()`
  takes every form above. Report how many worlds fell back to each band.

## Docs

- `CONTEXT.md`: add **ruin**, **proto**, **maker**, and **frequency** under "The world", with the
  words to avoid from p2-00.
- `docs/ruin.md`, a new document on the pattern of `docs/source.md`: what a ruin is, where it
  stands and why, the bands, the maker, and the table of protos. Later issues of phase 2 add to it.
- `docs/issues/README.md`: the world contract `world.ruin` and the module row of `ruin-types.js`.

## Acceptance criteria

- The same seed gives the same ruin on two reloads, and on HIGH and on LOW.
- `node tools/world-checksum.mjs` passes against the baseline of today.
- Over 500 seeds, no world with a wreck lacks a ruin, or the few that do are named in the report
  with the reason. The share that needs a fallback band is in the summary of the issue.
- With `?ruin` and `?source` on, the dot of the ruin stands 12 to 35 cells from the dot of the
  wreck on a terran, an ocean, and an ice world.
- `parseFreq()` and `compass8()` pass their cases in the check.
- `world.ruin` rides back from the worker. `worker.js` can clone it, because it is plain data.

## What the build changed

The build follows the plan, with these deviations and additions.

1. **`world.ruin.band`.** The shape of p2-00 has no band. The check must test "the arc from the
   wreck lies inside the band the world took", and the arc alone cannot name the band: a world of
   band 1 can stand 20 cells out. So `world.ruin` carries `band`, 0, 1, or 2. The contract in
   `docs/issues/README.md` states it.
2. **The band holds the middle of the cell.** The plan lists the tests and not the band. The snap to
   the middle of a cell moves a direction up to most of a cell, so a draw at 12.1 cells can land at
   11.5. `makeRuin()` therefore tests the arc of the middle against the band too, and the ruin
   stands 12 to 35 cells from the wreck on every world of band 0.
3. **`placeFacts()`, a third export of `generate.js`.** The check must prove that the cell of the
   ruin passes the tests of the field, and only `generate.js` holds the field. `placeFacts(seed,
   opts, dir)` gives the height, the beach band, the slope, and the limits at one direction, on the
   sea level of every tier. `worker.js` does not send it and the page never calls it. The README
   and the module table say so.
4. **Two shared helpers in `generate.js`.** `groundFits()` holds the test of the beach band and of
   the slope for the wreck and for the ruin. `testSeaLevel()` keeps the sea level of every tier on
   the context, so `makeRuin()` does not read 60,000 directions a second time. `makeSource()` now
   calls both; the checksum proves that no world moved. A world builds in 112.7 ms against 114.5 ms
   on main on LOW, over 60 builds interleaved, so the ruin costs nothing a reader can measure.
5. **The maker draws two numbers always.** After the place, the maker draws the numbers of a rolled
   body whether it rolls or not, so a later draw of `seed + '|ruin'` does not hang on the species of
   the world.
6. **The order of the maker.** "`mwalk` first, then `mcrawl`, `msling`, `mdig`, and `mfly`" reads
   as a priority: the maker takes the first way of moving the world holds, and the largest body of
   that way. A lower index wins a tie. A rolled height takes one decimal, as `bodyMetres()` does.
7. **More exports of `ruin-types.js`.** Each row of `RUIN_PROTOS` carries `light`, the column "The
   light" of p2-00, because p2-36 and p2-42 read it. The module also exports `protoRow(id)`,
   `COMPASS`, `FREQ_MIN`, and `FREQ_MAX`. The names p2-00 fixes are unchanged.
8. **`parseFreq()` at the edges.** `'7'` gives 7, `'7.'` gives 7, and `'.316'` gives 0.316. A sign,
   an exponent, a space inside the number, two points, and a unit other than MHz give null.
9. **`portalSeed()`.** It takes 2 to 4 of 16 syllables, with no syllable twice in a row. No word of
   2 to 4 of them is a word of `/usr/share/dict/words` or `propernames` on macOS. On a match with
   its own seed the last syllable moves on one place. The check also asks the way on of every way
   on, and none names itself.
10. **The checksum.** `splitWorld()` in `tools/world-checksum.mjs` sets `ruin: undefined` in the
    facts, so the baseline of today still holds, and a comment says that `tools/ruin-check.mjs` and
    `--source` prove the ruin. The baseline file did not move.
11. **The check samples the tiers.** `tools/ruin-check.mjs` builds all 500 seeds on LOW through
    `worker.js`. Every tenth seed builds on HIGH too (42 worlds with a ruin), and every 25th builds
    again after another world (16), because a HIGH build of all 500 takes several minutes more.
    `world-checksum.mjs --source` compares both tiers on its 25 seeds.
12. **The dot of `?ruin` is cyan**, `#2ee6ff`, against the pink of the wreck.

### The results

- `node tools/ruin-check.mjs`: every test passes. Of 500 seeds, 420 have a surface, 420 a wreck,
  and 420 a ruin. Band 0 (12 to 35 cells): 418, 99.5%. Band 1 (6 to 80): 2, 0.5%, `ruin-151` (ice)
  and `ruin-189` (terran). Band 2 (2 to 120): 0. No ruin: 0. The arc runs from 12.05 to 78.25
  cells. The makers: `mwalk` 311, `mcrawl` 35, `mfly` 22, `msling` 18, `mdig` 13, and 21 rolled
  (5.0%).
- `node tools/world-checksum.mjs --check`: every hash matches the baseline.
- `node tools/world-checksum.mjs --source`: 25 seeds, the wreck and the ruin the same on both tiers,
  and every world with a wreck holds a ruin, all of band 0.
- `carrier-check`, `carrier-fix-check`, `cell-grid-check`, `frame-check`, and
  `lore-audit/audit.mjs`: all pass.
- In the browser, with `?ruin&source`, the cyan dot stands from the pink dot: 20.40 cells on
  `Auralis` (terran, a dome, south-east), 30.56 cells on `Vesper` (ocean, a ring, north), and 18.61
  cells on `Meridian` (ice, a colossus, west). The ruin on the page is the ruin of Node, and a reload
  of `Meridian` gives it again. The console holds no error. The change adds no work to a frame, and
  the pane was hidden, so no frame time was read.
