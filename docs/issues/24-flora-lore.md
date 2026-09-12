# 24 The lore of the plants

Status: CLOSED, 2026-09-12, merged as 483db6b.

Type: HITL. Phase 2. Blocked by: 07, 21, 22. Read `docs/issues/README.md` first.

## The problem

Every animal of a world carries a name, a binomial, a habitat, a size, a diet, a manner, and a
story that reads the planet it lives on. A reader taps one and learns what it is.

The plants carried none of that. Issue 21 gave a patch sixteen kinds, issue 22 gave every world its
own shapes and its own list of kinds, and the reader who walked into a stand of towers taller than
anything on the planet had no way to ask what they were. The flora was the larger half of what the
ground shows and it was mute.

`lore.js` was written for this. Its own header says the engine holds no animal words and no plant
words, and that "the flora file will bring its own". This issue brings it.

## What to build

1. **A flora vocabulary**, `flora-lore.js`, beside `species.js` and reading the same engine.
2. **The text written per patch**, not per world, because a plant belongs to the ground it stands on.
3. **The same controls the animals have**, and only in probe view.
4. **A preview on the study card**: the subject centred, turning slowly.

## Decisions

**The lore is a fact of the patch, not of the world.** This is the one real difference from the
fauna and it decides the shape of everything else. Three things a plant story needs are facts of the
site: which kinds grow here, how many of each and how tall, and the biome under them. All three are
only known inside `patch()`. So `describePatchFlora()` runs there, `patch.plants` rides back with
the patch, and the plant card only opens while the probe is down. The page never loads
`flora-lore.js`; the text crosses as plain data.

**The numbers come off the plants the patch really placed.** The height row reads the median and the
tallest of the kind, and the stand line reads the count. A reader can walk out and check both. The
fauna does the opposite — `sizeText()` is the source of truth and the ground scales the animal to it
— because a species has one size and a stand of plants has many.

**Three tag sources meet in one set.** The world, the kind, and the biome. Two rules keep them
honest, and both came out of reading the first output:

- *The world flora tags are stripped.* `Lore.makeEnv()` puts `cactus` and `stoneflora` in the tag
  set of a desert world. Those words say what the planet grows somewhere; a gate on this card has to
  say what this plant is. Without the strip, a stack on a desert world matched a line written for a
  stone, and a colossus was told it spreads by breaking off a blade.
- *`wetground` and `moist` are two different claims.* A shore may say the roots stand in water. A
  forest floor may only say the ground holds water. The first draft used one tag for both and put a
  cactus under water on a forest patch.

**The flora reads the temperature of the site, not the mean of the planet.** The first draft printed
"At 58 °C the skin closes in daylight" under a snow field, because `biomeIndex()` paints snow above
the snow line whatever the planet mean is. `siteTempC()` turns `siteT` into degrees and the biome
caps it: a snow site is at or below freezing. Ice on the ground is the stronger fact. The fauna keeps
the planet mean, because an animal ranges over a world and a plant stands on one spot.

**The rows take no freshness rule, and food is exclusive.** Two plants that both live on light must
both say so, which is how the fauna diet row already works. But a fungus takes no light and a
crystal takes no light, so every `FOOD` line carries a `src` and the gates keep the sources apart.
The audit checks it, the same way it checks that no animal is offered two sources.

**The plants know each other, and they know the animals.** `RELATIONS` writes one sentence into two
stories, as the fauna does: a tall kind shades a low one, a colossus holds a court, a fungus takes
the dead wood of a tree, a whip climbs anything tall. `FAUNA_LINKS` is the other direction — one
optional line that names an animal of the world, gated on the genome, so a grazer never browses a
plant that is ankle high. It takes its own optional slot, so a plant can carry both and the story
still ends at six sentences.

**One card, two subjects, two canvases.** A `WebGLRenderer` owns the canvas it draws to, so the two
inspectors keep one canvas each and the card shows one of them. They share the card element and the
text nodes. Both `hide()` methods now test the `show` class before they hide the card, because a
swap of subject hides one inspector and shows the other in the same tick.

**The preview turns the plant, not the camera.** An animal walks, so its card lets it roam a disc
and turns the camera around it. A plant stands still. Turning the camera around a still body reads
as a camera move; turning the body reads as an offer to look at it. The body is centred in the
frame and makes one turn in about 24 seconds. It still sways and breathes, because the card builds
it with `nearFloraMaterial()`, the near material of the ground.

**One mark at a time.** A tap on a plant lays the same ring an animal gets, in the same accent
colour, and the same floating button offers the card. Opening either subject takes the mark off the
other, so the ring on the ground always names the card the reader is looking at.

**An animal beside a tree takes the tap.** Both can lie under one point. The animal wins unless it
stands more than `PICK_GRACE` behind the plant, because that is what the reader meant.

## What changed

| File | Change |
|---|---|
| `flora-lore.js` | New. The plant vocabulary and `describePatch()`. |
| `flora-card.js` | New. `PlantInspector`: the subject centred, turning on its own axis. |
| `worker.js` | Loads `flora-lore.js`. `siteTempC()`, `describePatchFlora()`, `patch.plants`. |
| `ground-flora.js` | `pickHit()`, `nearest()`, `mark()`, `unmark()`, the ring. `nearFloraMaterial()` is exported for the card. |
| `ground.js` | The `pickPlant` seam, `onSelectPlant`, `focusPlant()`, and the tap that chooses between an animal and a plant. |
| `app.js` | The plant card, the floating button, the sidebar Flora row, the marked-plant state. |
| `fauna.js` | `Inspector.hide()` no longer hides a card the other subject has just claimed. |
| `index.html`, `style.css` | The second canvas. |
| `tools/lore-audit/audit.mjs` | The flora pass: coverage, reachability, lexicon, food exclusivity, relations. |
| `tools/lore-audit/patch-sample.mjs` | New. Prints whole stories from real patches. |

## Acceptance criteria

- [x] Every plant kind of a patch carries a name, a binomial, four rows, and a story.
- [x] The text reads the world and the biome. The same kind on a snow field and on a forest floor
  gives different lines.
- [x] The height and the count on the card match the plants the patch placed.
- [x] The plants of one patch name each other, and some of them name an animal of the world.
- [x] The audit passes: no empty pool, no unreachable line, no lexicon conflict, no unfilled token,
  no relation issue, over 11,616 worlds and 3,280 skies times 16 kinds times 10 biomes.
  Seven honesty faults and three dead lines were found this way and fixed.
- [x] A tap on a plant marks it, the floating button offers its card, and the card arrows walk the
  plants of the patch and move the view.
- [x] The plant card only opens on the ground. Recalling the probe closes it and drops the row.
- [x] The preview holds the subject centred and turns it. Measured: 0.398 rad in 1.5 s, which is
  `SPIN`.
- [x] The frame holds. Measured on `Auralis@-38.00,18.00`, a forest site with 8,671 plants in 8
  kinds, in one browser and one window, against the build before this one:
  - at the reveal, 300 frames: this build 23.7 ms and 29.0 ms, the build before it 26.7 ms.
  - at one camera reached from the same URL, `/18.5,449.6,487.8,0.00,64.45`, 80 frames each,
    interleaved: this build 57.1 ms and 62.9 ms, the build before it 89.1 ms.

  The second camera is slow in both builds — it stands 749 m up with 4,825 plants on cards and the
  LOD knob at its floor — and this build is not the cause. The mark costs nothing: with the ring
  hidden and shown at one camera, 61.6, 70.8, and 71.4 ms.
- [x] The pick is paid once per tap, and its reach is the reach of the draw. Over the 4,019 plants
  drawn at the reveal it costs 0.92 ms; where the walk has culled most of them, 0.15 ms. A first
  draft capped the pick at 500 units and no tap at the landing height found anything, because every
  plant stands further out than that.
- [x] `README.md` "How it works" and `docs/flora.md` describe the system.
