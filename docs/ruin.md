# The ruin: architecture

This document describes how myworlds places and names the ruin, the second source of a world. Read
it before you change `ruin-types.js`, `makeRuin()` in `generate.js`, or `tools/ruin-check.mjs`.

Read `docs/source.md` and `docs/issues/p2-00-the-second-signal.md` first. The first holds the
wreck, which the ruin copies in many ways. The second holds the terms, the decisions, and the
contracts of phase 2. The later issues of phase 2 add to this file: the geometry (p2-36), the
carrier (p2-38), the patch (p2-41), the card (p2-42), the second log (p2-43), and the voice
(p2-44).

## What a ruin is

The wreck of issue 34 is a thing a crew built and flew. The ruin is a thing that no crew built. Its
makers were the ancestors of a species that still lives on the world, and the ruin sends on a band
that is not on the band plan. The last entry of the log of the wreck states that band (p2-40). The
reader then tunes the receiver to it, and the search of issue 34 runs again, from the wreck to the
ruin.

Use the words of p2-00: ruin, proto, maker, chapter, frequency, tune, the call, goers, and the way
on. `CONTEXT.md` holds the words to avoid.

## Where the ruin sits

| Stage | File | Runs in | Output |
|---|---|---|---|
| 1. Name the ruin | `ruin-types.js` | Web Worker, page, tools | the proto, the frequency, the seed of the way on |
| 2. Place the ruin | `generate.js`, `makeRuin()` | Web Worker | `world.ruin` |
| 3. Show the place | `app.js`, `?ruin` | Main thread | a cyan dot on the globe, for the eye check |

`world.ruin` rides back with the world as plain data, so `worker.js` clones it with the rest:

```js
world.ruin = {
  kind: 'ruin',
  proto: 'dome',                    // protoOf(world): a pure function of the seed and the type
  dir: [x, y, z],                   // unit direction in the local frame, at the middle of its cell
  freq: '20.128',                   // freqOf(seed): three decimals, 3.000 to 29.999, no unit
  maker: { species: 0, limbs: 2, height: 3.1, rolled: false },
  from: 'south-east',               // the bearing from the wreck to the ruin, to eight points
  band: 0,                          // the band the place came from: 0, 1, or 2. See "The bands"
  log: null,                        // the second log, p2-43; null when nobody went
} | null
```

That is the ruin of `Auralis`. `world.ruin` is null on a gas giant, on a world with no wreck, and on
a world where no cell of any band passes the tests. The page must not show `freq`, `from`, or `log`
before the reader reads them in the log of the wreck or on the card of the ruin. The `?ruin` dot
is a debug flag and it stays out of the interface.

## Where it stands, and why

The ruin stands 12 to 35 cells of arc from the wreck. That is decision 9 of p2-00: about 900 to
2,600 km on a planet of 7,352 km. The search of chapter 2 starts at the wreck, because the reader
tunes there, and a band of that width takes three or four landings from the wreck to the ruin. A
ruin next to the wreck would end the search on the first landing. A ruin on the far side would take
the search of chapter 1 again, from nothing.

The ruin takes the rules of `makeSource()`, and it reuses its helpers:

- It stands over the beach band, on the field of the globe, with the sea level of
  `testSeaLevel()`: a quantile over a fixed grid of 60,000 directions, which the tier does not touch.
- Its slope stays under `SOURCE_SLOPE`, read by `surfaceSlope()` over half a cell each way.
- It stays inside `SOURCE_LAT`, off the poles.
- Its cell is not the cell of the wreck, and it stands `SOURCE_KEEP` cells or more from the cell of
  the activity.
- The tests run on the middle of the cell, because the reader lands on the middle of a cell.
- The arc from the wreck to that middle lies inside the band. The snap to the middle moves a
  direction up to most of a cell, so a draw near the edge of the band can land just outside it.
  The test holds the place the page and the check read.

`groundFits()` holds the two tests of the field for the wreck and for the ruin, so the two cannot
part.

### The draw

Each try draws two numbers, first and always: the arc from the wreck, then the bearing from the
wreck. So a try that fails moves the stream by the same step as a try that passes. The arc is even
over the area of the band, not over the arc: the cosine of the arc is even between the cosines of
the two ends. The outer ring of a band holds more ground than the inner ring, and it takes more of
the tries.

The draw works in the tangent frame of `cell-grid.js` at the wreck: north is the part of `+y` in
the tangent plane, and east is the direction of falling lon. That is the frame `bearingTo()` in
`site.js` reads. `from` is `compass8()` of the bearing from the site of the wreck, which
`sourceSite()` gives, to the middle of the cell of the ruin. `bearingFrom()` in `generate.js` is
`bearingTo()` step for step, so the compass word of the log and the bearing of the page never part,
even on the line between two words.

### The bands

A band takes `RUIN_TRIES`, 900 tries. When none passes, the band widens and takes the same count
again. A band always draws its tries in full before the next band starts, so the stream stays in
step. After the last band the world takes no ruin.

| Band | Cells of arc | Over 500 seeds |
|---|---|---|
| 0 | 12 to 35 | 418 of 420 worlds with a wreck, 99.5% |
| 1 | 6 to 80 | 2, 0.5%: `ruin-151` (ice) and `ruin-189` (terran) |
| 2 | 2 to 120 | 0 |
| none | | 0 |

Every band stays inside `CARRIER_REACH` of `site.js`, a third of the circumference or 209 cells, so
a fix at the wreck always hears the ruin. The 500 seeds are `ruin-0` to `ruin-499` of
`tools/ruin-check.mjs`, and 80 of them are gas giants. On the two worlds of band 1, none of the 900
tries of band 0 passed the tests. The nearest ruin of the 500 seeds stands 12.05 cells from its
wreck, and the farthest, on a world of band 1, stands 78.25 cells from it.

Change `RUIN_NEAR` and `RUIN_FAR` in `generate.js` if the walk of five worlds by hand in p2-38 and
p2-42 shows a median search other than three or four landings.

## The stream

The place and the maker roll from `makeRng(seed + '|ruin')`, and from no other stream. No existing
stream draws one number more, so no world built before the ruin changes.
`tools/world-checksum.mjs` proves it for the terrain, the plants, the animals, the activity, the
wreck, and the log.

The checksum hashes the world object as JSON, and a new key would move that hash on every world.
So the facts of the checksum leave `world.ruin` out, and `tools/ruin-check.mjs` proves the ruin
instead. `node tools/world-checksum.mjs --source` prints the ruin of 25 seeds beside the wreck, on
both tiers, and fails when the two tiers disagree.

The proto, the frequency, and the seed of the way on draw from no stream. Each is the FNV hash that
`hullOf()` in `wreck-geometry.js` takes, over a string of its own:

| Hash of | Gives |
|---|---|
| `'ruin:' + seed` | the proto, among the protos the type allows |
| `'freq:' + seed` | the frequency |
| `'portal:' + seed` | the seed of the way on |

## The maker

Decision 4 of p2-00: the makers were the ancestors of a species that still lives on the world.
`makerOf()` takes the species whose way of moving can build. The ways of moving come from
`motionOf()` of `source-lore.js`, the tag the log reads, so the log and the ruin never disagree on
how an animal moves. The order is:

1. `mwalk`: legs on the ground. A monopod, a biped, a tripod, a quad, or a hexapod.
2. `mcrawl`: a serpent.
3. `msling`: a slinger.
4. `mdig`: a plough.
5. `mfly`: wings.

The maker takes the first way of moving that the world holds. Among the species of that way, the
largest body takes it, and the lower index wins a tie. A roller, a flow, a sac, a whale of the air,
a swarm, and an anchor build nothing.

| Locomotion | Limbs |
|---|---|
| monopod | 1 |
| biped | 2 |
| tripod | 3 |
| quad | 4 |
| hexapod | 6 |
| serpent | 0 |
| slinger | 2 |
| plough | 4 |
| wings | 4: two legs and two wings |

`height` is the size in metres that `Species.bodyMetres()` states, the number the gates `bigBody`
and `handBody` of `source-lore.js` read. For a hexapod, a serpent, a slinger, a plough, and wings
that number measures the length and not the height; p2-36 reads it as the size of the body.

A world with no species that can build rolls a maker: `limbs` from 2, 3, 4, and 6, `height` from
1.5 to 6 metres to one decimal, `species: -1`, and `rolled: true`. The maker draws its two numbers
always, after the place, whether it rolls or not, so a later draw of the stream does not hang on the
species of the world.

## The protos

`RUIN_PROTOS` in `ruin-types.js` holds this table, in this order. `protoOf()` picks among the rows
that fit the type of the world in the order of the table, so the order is part of the contract.
`disc` is the radius of the flat ground the patch lays, in units of the box. `height` is the height
of the tallest part, in units. The mast of the wreck stands 18.

| id | Name on the card | Fits | disc | height | The light |
|---|---|---|---|---|---|
| `spires` | Needle spires | ice, ocean, lava | 24 | 88 | the tip of the tallest spire, and a band on each spire |
| `dome` | Broken dome | desert, terran | 36 | 28 | a core on a plinth inside the ribs |
| `arches` | Arch causeway | ocean, terran | 52 | 30 | the keystone of the first arch |
| `well` | The deep well | ice, desert, lava | 30 | 25 | the floor of the shaft, and the cap of each pylon |
| `floaters` | Floating stones | exotic | 24 | 36 | a core that the slabs turn around |
| `colossus` | Fallen maker | terran, desert, ice | 38 | 22 | the eye, and the palm of the hand that stands |
| `ring` | The ring | exotic, lava, ocean | 30 | 38 | the inner edge of the ring |
| `hive` | Hive colony | exotic, ocean, terran | 55 | 30 | the doors at the foot of each mound, and a crown on the great mound |

| Type | Protos |
|---|---|
| terran | dome, arches, colossus, hive |
| ocean | spires, arches, ring, hive |
| desert | dome, well, colossus |
| ice | spires, well, colossus |
| lava | spires, well, ring |
| exotic | floaters, ring, hive |

A gas giant takes no proto. `protoRow(id)` gives the row of an id.

## The frequency, the compass word, and the way on

- `freqOf(seed)` gives the frequency as `'N.NNN'`, from 3.000 to 29.999 MHz. It always prints three
  digits after the point, so `'5.070'` and not `'5.07'`.
- `parseFreq(text)` reads what the reader types, as a number of MHz, or null. It trims the spaces,
  drops a trailing `MHz` in any case, and takes a comma as the point. A number of four digits or
  more with no point takes the point before its last three digits. So `'7.316'`, `'7,316'`,
  `'7316'`, and `' 7.316 mhz '` all give 7.316, and `'abc'`, `''`, and `'7.3.1'` give null. p2-39
  compares the number with `freq`.
- `compass8(brg)` gives one of eight words for a bearing in degrees, north 0 and east 90:
  `north`, `north-east`, `east`, `south-east`, `south`, `south-west`, `west`, `north-west`. A word
  covers 22.5 degrees each way, and a bearing on the line between two words takes the one clockwise.
- `portalSeed(world)` gives the seed of the world the way on names: two to four syllables from a
  fixed list of 16, capitalised, with no syllable twice in a row. p2-42 draws it as glyphs, and a
  later issue opens that world. It never equals the seed of its own world. No word of two to four
  of the syllables is a word of the word list of macOS (`/usr/share/dict/words` and
  `propernames`), so it reads as a name.

## The checks

- `node tools/ruin-check.mjs` runs 500 seeds through `worker.js` on LOW, every tenth of them on HIGH
  too, and every 25th again after another world. It tests the hashes of `ruin-types.js`, the place,
  the maker, the tiers, and the cache, and it prints the share of each band. `placeFacts()` of
  `generate.js` gives it the numbers of the field that the tests read; the page never calls it.
- `node tools/world-checksum.mjs --check` must match its baseline: the ruin moves no other stream.
- `node tools/world-checksum.mjs --source` prints the ruin of each seed on both tiers.
- Add `?ruin` to the address, with `?source`, to see the two dots on the globe, for example
  `http://localhost:5555/?ruin&source#Auralis`. The ruin is cyan and the wreck is pink.
