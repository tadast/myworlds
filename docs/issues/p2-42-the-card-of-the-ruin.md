# p2-42 The ruin can be seen but not read, and a find leaves no mark

Status: CLOSED, 2026-09-28. Merge commit d965fd2.

Type: AFK. Phase 2. Blocked by: p2-38, p2-41. Read `docs/issues/p2-00-the-second-signal.md`,
decisions 4, 6, and 12, and "The card" in `docs/source.md`.

## The defect

p2-41 stands the ruin on its cell, and a tap marks it. Nothing opens. The reader cannot learn who
made it, why it sends, or what it points at, and the search of chapter 2 never ends: the globe
keeps its wedges and the Carrier row never reads a second find.

## What to build

**The card of the ruin.** `RuinInspector` in `ground-source.js`, or a mode of `SourceInspector`,
in the same card shell as the wreck: the preview turns the body of `ruinGeometry()` on its own axis
at the left, and the text reads at the right. At 720 pixels and under, the card is one column.

- **The name** is the name of the proto from `RUIN_PROTOS`: "Needle spires". The line under it
  reads "Ruin · sends on 7.316 MHz".
- **The rows**, in this order, each a label and one or two plain sentences in the voice of the log:
  - *Size*: the height and the width, in metres of the lore, from the table.
  - *Age*: "Older than the rock it stands on." The probe cannot date it, and the card says so.
  - *Stone*: "A stone this world does not make." On a lava world: "A stone that takes the heat and
    holds it."
  - *Makers*, decision 4. For a maker of a species: "The carvings show a body with six legs. It is
    the body of the hardpan long-day hopper." Take the name and the limbs from the genome, and use
    the same words the fauna card uses. For a rolled maker: "The carvings show a body with four
    legs and a height of about 3 metres. No animal of this world has that body." The doors and the
    steps of the ruin fit that height, and the row says so where the proto has doors or steps.
  - *The call*, decision 6: "It began to send on day 3 of the log of Lantern 10, the day the crew put
    the beacon on the mast." Take the day and the name of the ship from the log of the wreck.
  - *The way on*, decision 12: a line of glyphs drawn from `portalSeed(world)`, one glyph per letter,
    from one fixed script of 26 glyphs that every world shares, drawn as inline SVG strokes. Under
    it: "The probe reads the name of another world here. It cannot read it yet." Beside it, a chip:
    "Coming soon". The chip is the only place the copy says so.
- **The crew** is a slot for p2-43. It stays empty in this issue.
- The first open of the card is the find of chapter 2, as the first open of the card of the wreck is
  the find of chapter 1.

**The find.** `onRuinFound()` in `app.js`, beside `onSourceFound()`:

- `markFound(seed, { chapter: 2 })` in the store. The fixes of chapter 2 go with it.
- The globe stands the mini model of the ruin at its cell, from `ruinGeometry(proto, world, { mini:
  true })`, with a lamp that blinks and holds a least size on the screen, as `makeWreckModel()` in
  `carrier-globe.js` does for the wreck. The mini wreck stays.
- The Carrier row reads "Found 2 of 2". The Aim chip offers "Wreck" and "Ruin".
- The thumb of a saved world carries two marks after both finds.
- A reader who reaches the ruin before the tune, by chance, finds it all the same: the find is a
  find. `onRuinFound()` then calls `markTuned()` as well, because the card states the band.

**The glyphs** are a small pure function, `glyphsOf(word)` in `ruin-types.js`, that gives the stroke
list of each letter, so the later issue that opens the way reads the same script.

## Docs

- `docs/ruin.md`: the card, its rows, the glyphs, and the tease of the way on.
- `README.md`, "How it works": the end of chapter 2.
- `docs/issues/README.md`: `onRuinFound()` and the second mini model.

## Acceptance criteria

- The first open of the card marks the find, survives a reload, and a clear of the fixes does not
  clear it.
- The Makers row names a species of the world on a world with one, and the fauna card of that species
  shows the same name and limb count.
- The Call row names the day and the ship of the log of that world.
- The glyphs of one seed are the same on every open, and two seeds with two portal seeds show two
  different lines.
- The globe carries both mini models after both finds, on a phone and on a desktop.
- The card reads at 390 pixels wide with no row cut off.

## What the build changed

Built on 2026-09-28. Every acceptance criterion holds in the browser and in the Node checks. The
deviations from the plan and the reasons:

- **The text of the card is a pure function, `ruinCard(world)` of `ruin-types.js`.** The plan puts
  the card in `ground-source.js`. The text reads the genome, the log, and the portal seed, and a
  check must read it on every world with no browser. So `ruinCard()` writes the name, the line under
  it, and the rows, and `RuinInspector` only draws them. `tools/ruin-check.mjs` part 6 reads the card
  of all 420 worlds with a ruin.
- **`RuinInspector` is a class of its own, with a canvas of its own, `#rcv`.** A mode of
  `SourceInspector` would share the renderer of the wreck, and the two cards hold different
  subjects and different text. The stage and the renderer of a card are now two small functions,
  `cardStage()` and `cardRenderer()`, and both inspectors use them.
- **The card fits the ball of the ruin, and the eye stands higher over a flat ruin.** The card of the
  wreck fits a height. The protos run from the spires, 88 units on a disc of 24, to the hive, 30 units
  on a disc of 55, so the ball holds the turning body and its disc.
- **The well opens the disc of the card.** The shaft goes 46 units into the ground, and it hung under
  the disc. The disc of the card is a ring with the mouth open, and `mouthTest()` keeps a fragment
  under the ground only when the ray from the eye crosses the ground inside the mouth.
- **The card takes the height of its text.** The card of the wreck holds a fixed height because the
  log is long. Six rows are short, so the card of the ruin takes the height of its text, never less
  than the preview, and the rows scroll only on a short screen.
- **The call row holds two sentences.** The sentence of the plan holds 23 words, and the log holds no
  sentence over 20. The row reads "It began to send on day 3 of the log of Lantern 10. That was the
  day the crew put the beacon on the mast." Every fact of the plan stays. The longest sentence of the
  card holds 15 words, and part 6 of the check fails a sentence over 20.
- **The size row** reads "It stands 88 metres high and 48 metres across.": the height of the table
  and twice its disc, in metres of the lore.
- **The makers row states the body in the words of the locomotion.** The limbs of p2-35 give a
  slinger two legs, a plough four, and a winged maker four, which are two legs and two wings. The
  fauna card of those three animals shows no leg: `legPlan()` of `fauna.js` draws none for them. So
  the row states the legs of the carvings and adds "The ones that live here now have no legs.", and
  the card never disagrees with the fauna card. On the other ways of moving, the count of the
  carvings is the count of the fauna card. Over 500 seeds: 311 walkers, 35 serpents, 22 winged, 18
  slingers, 13 ploughs, and 21 rolled makers.
- **The door and the steps.** The plan puts the sentence under the rolled maker. The geometry sizes
  the door of the dome, the doors of the hive, and the steps of the well from `maker.height` for both
  kinds of maker, so the row states it for both. It states it only where the part follows the body:
  where `k` times the height stays under the top of the range of the part. Where the top cuts the
  part, a big maker would not fit it, and the row says nothing. `MAKER_PARTS` in `ruin-types.js` now
  holds the three ranges, and `ruin-geometry.js` reads them there. The geometry did not move, and
  `tools/ruin-geometry-check.mjs` prints the same table. 104 of the 191 worlds with one of the three
  protos take the sentence.
- **A rolled height takes the nearest half metre**: "about 1.5 metres", "about 3 metres".
- **The glyphs.** `GLYPHS` holds 26 glyphs drawn by hand on one grid. Each hangs from a rule that the
  card draws across the whole word, so the line reads as one script, and no glyph is a Latin letter.
  A stroke of one point is a dot. The SVG holds no text, and no attribute holds the seed. On a line
  of 14 glyphs at 390 pixels, the chip "Coming soon" wraps under the glyphs.
- **A find by chance reads the carrier again.** The plan asks `onRuinFound()` to call `markTuned()`
  too. The receiver then holds the band of the ruin, so on the ground the landing reads the carrier
  again, as a tune there does, and the overlay prints the band of the ruin. The group of the carrier
  is built again from the record, because the chapter moves. The fix that the landing took for the
  wreck stays a fix of chapter 1.
- **The mini ruin floats on a pin, as the mini wreck does.** The plan says that the model stands at
  its cell with a lamp, "as `makeWreckModel()` does". `makeWreckModel()` floats its model on a pin,
  so the ruin takes a pin of its own in the colour of chapter 2, and the pin of the wreck stays. The
  model takes `MINI_UNIT` and the least size of the mini wreck, so the spires stand 4.9 times the mini
  wreck at every zoom. The lamp stands at the lamp of the body and holds a least radius of 0.0035 of
  the distance from the camera.
- **The lamp of the globe has a rhythm function of its own**, `ruinLampRhythm(world)` in
  `carrier-globe.js`: the motif of the wreck at half the speed. p2-44 swaps it with `ruinRhythm()`.
  `ground-source.js` imports `carrier-globe.js`, so an import the other way would be a cycle. The
  function and the level of the lamp therefore stand in `carrier-globe.js` as a copy of the rules.
- **The crew slot** is `<section class="cruin-crew">` under the rows in `index.html`. It is empty,
  and an empty slot takes no room.
- **`docs/issues/README.md`** described the mini wreck of the first build of issue 34, 0.06 globe
  radii with a lamp. That bullet now says that the model floats on a pin, and a new bullet holds the
  pin of the ruin.

### The checks

- All eight checks pass. `node tools/world-checksum.mjs --check` matches its baseline with no change.
  `tools/ruin-check.mjs` part 6: 26 glyphs, all apart; 1,482 lines of glyphs for 1,482 seeds of the
  way on; 420 cards, 399 makers of a species and 21 rolled. `tools/carrier-fix-check.mjs` part G: the
  pin of the ruin 0.030 radii tall beside the pin of the wreck, the mini spires 0.0587 tall with the
  lamp at the tip, and 12 levels of the lamp over one period.
- **Two worlds end to end,** in a hidden pane with the hooks of p2-38. `p242-2` (terran, a dome, a
  species maker): the landing on the wreck, the card of the wreck, the tune through the field of the
  card, then three landings, the last on the filled cell. The tap on the dome and the floating button
  opened the card. The find stood in the store, the fixes of chapter 2 went, the Carrier row read
  "Found 2 of 2" with "Wreck" and "Ruin", and the thumb read "✦✦". After a reload the globe carried
  both pins. `p242-20` (ocean, the spires, a rolled maker of six legs and 4.9 m): the tune through the
  field of the sidebar in orbit, four landings, the find, "Found 2 of 2", and both pins.
- **The card text of the two worlds.**
  - `p242-2`: "Broken dome", "Ruin · sends on 27.048 MHz". Size: "It stands 28 metres high and 72
    metres across." Makers: "The carvings show a body with four legs. It is the body of the
    long-tailed grazer. The door in the base ring fits that body." The call: "It began to send on
    day 2 of the log of Ledger 17. That was the day the crew put the beacon on the mast." The fauna
    card of species 1 reads "Long-tailed grazer", a quad, "3.7 m at the shoulder".
  - `p242-20`: "Needle spires", "Ruin · sends on 24.040 MHz". Size: "It stands 88 metres high and 48
    metres across." Makers: "The carvings show a body with six legs and a height of about 5 metres.
    No animal of this world has that body." The call: "It began to send on day 2 of the log of
    Margin 18. That was the day the crew put the beacon on the mast."
  - The Age, Stone, and way on rows read as the table of `docs/ruin.md`.
- **A find by chance.** `p242-24` (desert, the well) and `p242-22` (ocean, the ring, a plough maker):
  a landing on the ruin with no find and no tune. The card opened, the record read the ruin found and
  tuned, the overlay turned from `406.025` to the band of the ruin, the Carrier row read "Found 1 of
  2", the sidebar showed the locked band, and the globe stood the pin of the ruin alone.
- **The glyphs** of `p242-2` gave one SVG on two opens, and the line of `p242-20` differs from it.
- **A clear of both chapters** through the store kept both finds of `p242-2`, and a reload kept them.
- **390 by 844**, on `p242-22`, the longest text of the sample (a makers row of three sentences and a
  line of 14 glyphs): the card stands from x 12 to 378 and from y 22 to 822, the band of the ruin
  from y 37 to 214, and the rows from y 281 to 797. The last line ends at y 788. The rows take 344
  pixels in 344 with no scroll, and the page is 390 pixels wide. The line of glyphs takes x 27 to 335,
  and the chip wraps under it. At 1280 by 800 the card is 920 by 466 pixels, with no scroll.
- **The globe.** Rendered with both pins on `p242-2`, at 1280 by 800 and at 390 by 844: from the home
  zoom the lamp of the ruin reads as a dot of a few pixels, and near the surface the mini dome stands
  on its pin beside the pin of the wreck. 100 renders of the globe near the surface, eight rounds
  interleaved: 2.44 ms with the pin of the ruin and 2.41 ms without it, inside the noise.
  `renderer.info.memory` read 20 geometries on `p242-2`, 17 on `Auralis`, and 20 again on `p242-2`.

### Open

- **Real taps and real keys.** The pane stood hidden, so the taps on the ruin and on the floating
  button ran by script, and no frame time of a visible pane was read.
- **A find by chance ends the search of the wreck by the carrier.** After the tune the receiver holds
  the band of the ruin, so a reader who found the ruin first reaches the wreck only by a landing on
  its cell. The plan asks for this; the owner may want the wedges of chapter 1 back in that case.
- **The mini models are small from the home zoom.** The lamp reads there, and the models read when
  the reader zooms in, as the mini wreck of issue 34 does.

### The review of the manager, 2026-09-28

The open point "After a find by chance the world is tuned, so the wedges of chapter 1 stop painting"
is closed. Commit 472bfa2 makes `activeSource()` give the wreck while the ruin is found and the wreck
is not: the overlay prints `406.025 MHz`, the wedges of chapter 1 paint, and the Carrier row reads
"Found 1 of 2" until the next fix. After the find of the wreck the row reads "Found 2 of 2". Commit
4578eab keeps the voice of the ruin in orbit after its find, whatever chapter runs.
