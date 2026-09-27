# p2-42 The ruin can be seen but not read, and a find leaves no mark

Status: open.

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
