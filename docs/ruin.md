# The ruin: architecture

This document describes how myworlds places and names the ruin, the second source of a world. Read
it before you change `ruin-types.js`, `makeRuin()` in `generate.js`, or `tools/ruin-check.mjs`.

Read `docs/source.md` and `docs/issues/p2-00-the-second-signal.md` first. The first holds the
wreck, which the ruin copies in many ways. The second holds the terms, the decisions, and the
contracts of phase 2. The later issues of phase 2 add to this file: the geometry (p2-36), the
carrier (p2-38), the tuner (p2-39), the patch (p2-41), the card (p2-42), the second log (p2-43),
and the voice (p2-44).

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
| 4. Build the body | `ruin-geometry.js`, `ruinGeometry()` | Main thread, tools | the body, the glow, the orbit, and the lamp. See "The body" |
| 5. Follow the ruin | `site.js`, `carrier-store.js`, `carrier-globe.js`, `app.js` | Main thread | chapter 2 of the search, after the tune (p2-38) |
| 6. Tune the receiver | `tuner.js`, `app.js`, `ground-source.js` | Main thread | the field the reader types the frequency into (p2-39) |
| 7. Stand the ruin on its cell | `generate.js`, `patchRuin()`; `ground-source.js`, `SourceRuin` | Web Worker; main thread | the disc and `patch.source`; the body, the glow, the light, the well (p2-41). See "The ruin on its patch" |
| 8. Read the ruin | `ruin-types.js`, `ruinCard()` and `glyphsOf()`; `ground-source.js`, `RuinInspector`; `app.js`, `inspectRuin()` and `onRuinFound()`; `carrier-globe.js` | Main thread, tools | the card, the find of chapter 2, and the mini ruin on the globe (p2-42). See "The card of the ruin" |

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

## The body

`ruinGeometry(proto, world, { mini })` in `ruin-geometry.js` builds the body of a ruin, on the
pattern of `wreckGeometry()` in `wreck-geometry.js`. It takes no DOM and does nothing at import, so
the ground (p2-41), the card (p2-42), the globe, and the tools build their ruin here. It reads
`world.type` for the stone and `world.ruin.maker` for the limbs and the size of the maker, and
nothing else of the world, so a plain stub `{ type, ruin: { maker } }` builds a ruin in the lab.

It gives `{ body, glow, orbit, lamp }`:

- `body` is one non-indexed `BufferGeometry` with a colour per vertex, flat-shaded, in its own
  frame: y up, the origin on the ground under the middle of the ruin, in units of the box.
  `body.userData.lamp` repeats `lamp`, and the well sets `body.userData.hole`, the radius of its
  mouth, so p2-41 can open the terrain over the shaft.
- `glow` holds the parts that carry the light, in the same frame, with no vertex colour. p2-41
  gives it one material in the `glow` colour of the type, and blinks it on the motif.
- `orbit` holds the parts that move, or null. Only the floaters have one: the nine slabs and the
  two rings, which p2-41 turns about y.
- `lamp` is `[x, y, z]` of the brightest point: the point light of HIGH and the lamp of the globe.

### The eight protos

The shapes are the prototypes of the design session of 2026-09-27, ported part for part, with the
proportions, the heights, and the discs of the table above.

| Proto | What the body holds | Where the light stands | Lamp |
|---|---|---|---|
| `spires` | seven five-sided spires on dark plinths, six bridges, rubble | the tip of the tallest spire, and a band at 0.62 of each spire | the tip, at 88 |
| `dome` | a base ring with a door, 14 ribs of beams, six of them broken, fallen pieces, an accent band, a stone ring near the top, a plinth | a core on the plinth | the core |
| `arches` | six arches of legs and nine blocks each, lower along z, the fifth broken, the sixth without its arch, paving, a fallen block | the keystone of the first arch | the keystone |
| `well` | a shaft 46 deep with the wall facing in, a rim, eight pylons that lean out, a stair down the wall, rubble | the floor of the shaft, and the cap of each pylon | the middle of the mouth, 2 up, because the light of the floor comes out of it |
| `floaters` | a ring of ten stones and a plinth; in the orbit, nine slabs and two rings | a core over the plinth | the core |
| `colossus` | the statue of the maker on its side, the head to -x, and the hand that stands out of the ground | the eye, and the palm of the hand | the palm, because the hand is the landmark |
| `ring` | 26 stones on a ring on its edge, one missing, the part under the ground left out, accent blocks on every third stone, two fallen stones | a torus along the inner edge, over the ground only | the top of the inner edge |
| `hive` | the colony: see below | a door on every third cell of the rim of each mound, and a crown on the great mound | the crown |

**The hive is a colony.** One great mound and three small hives, each a hexagon of rings of equal
hex cells, `rc` 2.6 units, with each ring one step, `STEP` 5 units, over the ring outside it, so the
terraces are level and the mound reads as built and not as grown. The great mound has five rings
and stands 30 units at the crown; each small hive has one ring. A few cells inside a mound fell one
step: it is a ruin. Two rows of hex pavers pave the way from the great mound to each small hive.
Every cell wears an accent cap. A face of a cell that a neighbour of the same height or higher
covers is left out, and a face over a lower neighbour starts at the top of that neighbour, so a
terrace costs its top and its outer wall and nothing more.

**The colossus takes the maker.** `maker.limbs` sets the legs: pairs lie along the body at
stations, one leg on the up side, bent at the knee, and one crushed under the body, as the
prototype lays three. Six limbs take three stations, four and three take two, two and one take
one. A maker of one limb lies on one thick leg. A maker of no limbs, a serpent, lies as a long body
in coils: a chain of rods on a wave, thick at the head and thin at the tail. The raised hand stays
on every count, with the palm lit, because it is the landmark from across the cell.

**The maker sizes the doors and the steps.** `maker.height` is the body size in metres, a length
for a hexapod, a serpent, a slinger, a plough, or a winged maker. It does not scale the statue. It
sets the door of the dome, a gap in the base ring with two jambs and a lintel, the doors of the
hive, and the rise of the steps of the well, each inside a range the part can hold: a door of the
hive stays under the height of the cell it stands in, and a big maker takes fewer, taller steps.

### The stone

The stone is fixed per world type in `RUIN_PAL`: the stone, the dark, an accent, and the colour
of the glow. It does not take the colours of the biome, so a ruin reads as a made thing on every
world, as the hull of the wreck does. On a lava world the accent is a seam that takes the glow: the
accent parts join the glow geometry there, so the seams blink with the light. `ruinPalette(type)`
gives the row of a type.

### The mini model

`mini: true` gives the body only, in one colour, the stone of the type, with the big parts alone: no
rubble, no pavers, no bands, no doors, no steps, and no glow, except the core of the floaters,
which the mini keeps as stone because it is the shape. The slabs of the floaters go into the body.
`glow` and `orbit` are null. The globe draws that body on a pin of its own after the find of the
ruin, beside the pin of the mini wreck, at `MINI_UNIT` globe radii per unit (p2-42; see "The mini
ruin on the globe"): `WRECK_MODEL_H` of 0.012, the `MODEL_H` of `carrier-globe.js`,
over the mast of the wreck of 18 units, so the spires stand 4.9 times the mini wreck and the
colossus 1.2 times. `miniHeight(proto)` gives the height of a mini in globe radii. The constant is
a copy, because `carrier-globe.js` imports this file for the mini ruin.

### The budget

At most `BODY_BUDGET`, 4,000 triangles, for the body of any proto, and `MINI_BUDGET`, 1,500, for
the mini model. Every face that stands under the ground or inside another part is left off: a
box on the ground has no bottom, a beam has no ends, a cone has no base, a hex cell has no bottom
and no covered side. The counts on 2026-09-28, the largest over every type, limb count, and maker
size:

| Proto | Body | Glow | Orbit | Mini |
|---|---|---|---|---|
| spires | 366 | 192 | – | 126 |
| dome | 1,940 | 20 | – | 700 |
| arches | 654 | 8 | – | 472 |
| well | 992 | 244 | – | 188 |
| floaters | 116 | 8 | 492 | 232 |
| colossus | 448 | 20 | – | 328 |
| ring | 336 | 404 | – | 228 |
| hive | 3,152 | 200 | – | 1,012 |

`node tools/ruin-geometry-check.mjs` holds every build to the budget, the frame, the disc, the
height, and the maker, and prints this table. `tools/ruin-lab.html` shows every proto on every
type it fits, with the counts, a person of 1.8 units, and the wreck of chapter 1 for scale.

## The ruin on its patch

p2-41. A landing on the cell of the ruin shows the ruin, whether the reader has tuned or not,
because a patch depends only on its arguments. A reader who lands on it by chance finds it.

### The disc

`patchRuin()` in `generate.js` runs when the cell of the patch is the cell of `world.ruin`, by
the rule of `kindIn()`. The patch asks for the ruin after the source, and a cell holds one of the
two and never both, because `makeRuin()` keeps the ruin off the cell of the wreck. It gives
`patch.source = { kind: 'ruin', proto, x, y, z, yaw }` in units of the box: the middle of the
disc, its height, and the turn of the body.

- **The stream.** The place and the yaw roll from `makeRng(pseed + '|ruin')` and from no other
  stream, so every other patch is byte for byte the patch it was, and `tools/world-checksum.mjs`
  proves it. The stream draws three numbers: the angle and the distance of the draw, then the yaw.
  The camp of p2-43 draws after them from the same stream, in `ruinCamp()`, and nothing else
  draws from it.
- **The walk.** `placeDisc()` holds the walk of the wreck, and `patchSource()` and `patchRuin()`
  share it with the disc as an argument. From the draw it takes the nearest node that is dry, under
  `SOURCE_STAND`, clear of the phenomenon, and dry at the rim of the disc. The ruin adds two tests:
  the rim takes a point every 12 units of arc and not 8 points, and the ground at the edge of the
  flat disc stands within 0.25 units per unit of radius of the middle, so a big disc does not cut a
  deep terrace into a hill. When no node passes, the source takes the driest and flattest node,
  as the wreck does, and the rim may then reach the water.
- **The reach.** The middle stands inside the walk limit, `reachOf()` of `ground.js`, less the
  whole disc with its soft edge. So the reader can walk round the ruin, and the needle leads to a
  place the walk reaches. The draw takes `SOURCE_PLACE` of that bound, as the wreck does.
- **The flat part and the soft edge.** The `disc` of `RUIN_PROTOS` is the flat part, and the
  ground eases back over `RUIN_EDGE`, 0.4 of the disc, outside it. The wreck keeps its soft edge
  inside its 14 units, because its parts stand near the middle. The parts of a ruin reach the edge
  of the disc of the table, so a soft edge inside it would lift or sink the ends of the arches and
  the small hives. The yaw turns the body about the middle of the disc and keeps every distance, so
  the line of the arches fits the disc at every yaw.
- **The floor.** The disc takes no scorch, because nothing burnt here. Its colour moves toward the
  rock of the palette, 0.35 of the way at the middle and none at the outer edge, as stone that feet
  and weather wore flat. The surface of each node takes a share of bare rock of up to 0.8, so the
  fine pattern of `ground-detail.js` draws the floor as stone.
- **The mask.** The plants and the group anchors keep off the whole disc with its soft edge. A
  group asks the mask with its spread, so no member starts on the disc either; the masks of the
  phenomenon and of the wreck read the point alone, so no patch of theirs moved.

| Proto | Flat disc | With the soft edge |
|---|---|---|
| spires, floaters | 24 | 33.6 |
| well, ring | 30 | 42 |
| dome | 36 | 50.4 |
| colossus | 38 | 53.2 |
| arches | 52 | 72.8 |
| hive | 55 | 77 |

### The body, the light, and the well

`SourceRuin` in `ground-source.js` has the shape of `SourceWreck`: `create()`, `update(t)`,
`pickAt()`, `mark()`, `unmark()`, and `dispose()`. `Ground` takes the class by
`patch.source.kind`, so the rest of `ground.js` reads `ground.source` and does not care which kind
stands there.

- **The body** is one mesh of the body of `ruinGeometry()`, in a flat-shaded standard material with
  the colours of the vertices. It stands on the height the terrain mesh draws at the middle, and it
  casts and takes shadows on HIGH.
- **The glow** is one mesh with one material in the colour of chapter 2, `carrierColour(world, 2)`,
  so the ruin, its wedges, and its card read in one colour. It draws with the fog off, as the lamp
  of the wreck does, so the reader walks to it out of the mist. It blinks with the rules of
  `lampLevel()`: a floor that never goes out, a tail, and a breath. The rhythm is
  `ruinMotifOf(world)` of `music.js`, the motif the ear hears, on `music.ruinClock()`. With no
  sound the glow takes the clock of the landing over the same period. See "The voice" below.
- **The light.** HIGH adds one point light at the lamp, in the colour of the glow, which blinks
  with it. LOW keeps the glow alone.
- **The floaters** turn their orbit about the core, once in about 105 seconds, and each slab and
  each ring rises and falls 1.4 units on its own phase. `weld()` keeps no mark of the parts, so
  `SourceRuin` finds them again: the triangles that share a corner are one part. The lift moves the
  vertices, so the shadow follows the slab. No other proto moves.
- **The well opens the ground.** The terrain of a patch is one grid with no hole. `SourceRuin`
  gives `hole`, the middle and the radius of the mouth plus 0.2 units, and `Ground._openHole()`
  passes it to the terrain material in a uniform. Its fragment shader discards inside that circle.
  The shaft wall of the body hides the edge from inside, and the rim of the well covers the band
  from the mouth out to the circle from above. The rim, the flora, and the cover do not reach the
  mouth, because the disc keeps them off. Only the patch of the well compiles this program. The
  terrain casts no shadow, so no depth material needs the hole.
- **The mark.** A tap on the ruin marks it with the ring the wreck takes, on the edge of the flat
  disc, and the floating button reads "Study the ruin". `onSelectSource()` fires as it does for
  the wreck. A thing this big takes a grace of its size in the tap: the far wall of the well and a
  spire over a ridge stand further past the ground than the hull does. The button calls
  `inspectRuin()` in `app.js`, which opens the card of p2-42; see "The card of the ruin".
- **The herds.** `Ground` passes the disc with its soft edge to `GroundCover`, which grows no blade
  and no stone on it, and to `GroundFauna`, where a walker that wanders turns away from it with its
  spread, as it turns from the water.

### The carrier on the cell

On the cell of the ruin in chapter 2 the needle and the range stop reading the globe and read the
ruin, measured from the camera, as they do for the wreck. The needle points at the middle of the
ruin. The range measures to the edge of the ruin: `rangeFrom(x, z)` gives the distance to the
convex outline of its parts on the ground, and 0 inside it. The hive is 110 units across, so a
range to its middle would state 50 units to a reader who stands at its doors. The level of the
motif of the ruin in `carrierLevel('ruin')` reads the same range, on the ruin bus; see "The voice"
below. In chapter 1 the ruin stands on its cell, the needle keeps the bearing of the wreck, and
the ruin is silent.

### The frame and the memory

Measured on 2026-09-28 in a hidden pane at 1280 by 800 and a pixel ratio of 1, on HIGH at the
reveal camera: 100 calls of `renderer.render()` with a read of one pixel at the end, eight rounds,
with the group of the ruin shown and hidden in turn. The ruin adds no time the measure can see:

| Proto | Seed | With the ruin | Hidden | Difference of the medians |
|---|---|---|---|---|
| hive | `p241-t` | 7.71 ms | 7.88 ms | -0.17 ms |
| well | `p241-21` | 7.36 ms | 7.41 ms | -0.05 ms |
| spires | `p241-5` | 7.77 ms | 7.82 ms | -0.05 ms |
| floaters | `p241-9` | 8.60 ms | 8.61 ms | -0.01 ms |

The noise between two rounds is about 0.15 ms. The discard of the well, against the same terrain
program with no discard, measured +0.09 ms on the medians and -0.01 ms on the mean of the paired
rounds. `update()` of the floaters costs 0.004 ms. `renderer.info.memory` of the orbit of
`p241-21` read 16 geometries and 10 textures before a landing on the well and after the recall.

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
  `propernames`), so it reads as a name. The card of p2-42 draws it in the script of the makers;
  see "The glyphs".

## Chapter 2 of the search

p2-38. The search of issue 34 follows the wreck. After the reader tunes the receiver to the
frequency of the ruin, the same search follows the ruin: the same bearing, the same error, the same
reach, the same wedges, and the same brief. The reader tunes at the wreck, because the log states
the frequency there, and the landing that tunes takes the first fix of chapter 2.

- **The receiver hears one source.** `activeSource(world, record)` in `site.js` gives the ruin when
  the record of the store is tuned and the world holds a ruin, else the wreck. `sourceSite()`,
  `carrierAt()`, `carrierDir()`, `carrierBox()`, and `goalCell()` take the source as an argument,
  and every caller in `app.js` reads it from `activeSource()`. A world with no ruin stays on the
  wreck, tuned or not.
- **The ruin reads offsets of its own.** The hash of the offset of a wedge takes the kind of the
  source for the ruin, `` `${seed}|carrier|ruin|${face}|${i}|${j}` ``, and keeps the key of issue 34
  for the wreck. So no fix of chapter 1 moves, and a cell does not state the same offset for the
  two sources. `tools/carrier-check.mjs` runs every check of the carrier for the ruin as well.
- **The store keeps two chapters.** `myworlds.carrier.v1` keeps chapter 1 at the top of the record
  of a seed and chapter 2 under `ruin`, with `tuned` beside them. A record of issue 34 reads as
  chapter 1 with nothing in chapter 2. Each call that writes a chapter takes `{ chapter }`, and
  `markTuned()` sets the tune. See "The store" in `docs/issues/README.md`.
- **Two colours.** The wedges of chapter 2 take a second colour: of the candidates of
  `pickCarrierColour()` that stand far from the surface, the one that stands farthest from the
  colour of chapter 1. `carrierColour(world, 2)` gives it. The pin and the mini wreck of the find
  of the wreck keep the colour of chapter 1. Chapter 2 takes no orange and no yellow: the drawings
  of the brief mark the next landing in `#ffb86b`, and an orange wedge beside that mark read as one
  thing. `MARK_APART` in `carrier-globe.js` holds the rule.
- **The overlay prints the band.** The carrier block prints the frequency the receiver holds under
  the bearing: `406.025 MHz` for the whole of chapter 1, and the frequency of the ruin in chapter 2.
  So the reader learns the look of a frequency on the first landing. The page prints the frequency
  of the ruin only after the tune, and the tune needs the number from the log.
- **The brief.** Chapter 2 takes three stages: "Unknown signal", "Stronger signal", and "Carrier in
  reach". The first says that the receiver holds the band of the log, that nothing of the crew
  sends on it, and that the search runs as it did for the wreck. The drawings of issue 34 stay, and
  their wedges take the colour of chapter 2.
- **The Carrier row** reads "Found", then "Tuned", then "1 fix", "3 fixes", and "Found 2 of 2".
  The Clear chip drops the fixes of the chapter that runs. After both finds the Aim chip offers
  both sources, "Wreck" and "Ruin". A saved world with both finds carries two marks on its thumb.
- **The ground.** p2-41 puts the body of the ruin on its cell; see "The ruin on its patch". In
  chapter 2 the needle there points at the ruin and the range falls to its edge. On the cell of the
  wreck in chapter 2 the needle keeps the bearing of the ruin, and the motif of the wreck stays
  silent: the receiver holds the other band.

The reader tunes through the field of the tuner; see "The tuner" below. `window.__mw.tune()` stays
for the tests: it tunes the world on the screen, even when the wreck is not found.
`__mw.landAt(lat, lon)` and `__mw.recall()` land and recall the probe by script, so a test can
walk a whole search.

### The length of the search

p2-38 walked 11 worlds by script from the wreck, on the build of 2026-09-28. The reader tunes on
the cell of the wreck, lands 15 cells to one side of the first wedge, lands on the cross of the two
wedges, and then lands on the filled cell or a count of cells along the bearing. The table counts
the landings after the landing on the wreck, up to and with the landing on the cell of the ruin.

| World | Type | Cells from the wreck | Landings |
|---|---|---|---|
| `p238-alpha` | terran | 15.2 | 3 |
| `p238-bravo` | terran | 21.8 | 3 |
| `p238-charlie` | exotic | 22.4 | 2 |
| `p238-delta` | exotic | 14.9 | 3 |
| `p238-echo` | ice | 24.0 | 3 |
| `p238-foxtrot` | ice | 17.8 | 3 |
| `p238-w1` to `p238-w5` | | | 3 each |

The five worlds `p238-w1` to `p238-w5` land 1.5 cells off the cross on purpose, as a hand that
aims by eye does. The third wedge then closes the goal, and the next landing is the ruin. The
median is 3, inside the three or four of decision 9. On `p238-charlie` the cross of two wedges
stood on the cell of the ruin itself. The walk by hand of the manager is still open, and it
decides `RUIN_NEAR` and `RUIN_FAR`.

## The tuner

p2-39. The last entry of the log of the wreck states the frequency of the ruin, and the reader types
it into the receiver. The lock tunes the world, and chapter 2 of the search starts.

### Why a field and not a button

The design asks the reader to read the number and type it. A button would start chapter 2 for a
reader who never read the last entry, and the call of the log would then mean nothing. A field
also keeps the secret: the page gives the reader no list and no hint, so only the log tells the
number. The overlay shows `406.025 MHz` for the whole of chapter 1, so the reader knows the look of
a frequency before the log states one.

### Where it stands

`makeTuner()` of `tuner.js` builds the form: a label, the field, the unit `MHz`, a Tune button, and
a line of answer, plus a locked view for after the tune. The page calls it once for each place, so
the two places cannot drift:

1. **Under the last entry of the card of the wreck.** `SourceInspector.show()` of
   `ground-source.js` takes the element as its last argument and puts it under the entries, inside
   the scroll of the log, so the number stays in sight while the reader types.
2. **Under the Carrier row of the sidebar.** A Tune chip in the row opens the form under the row, in
   orbit and on the ground, so a reader who closed the card can still tune. The form takes a whole
   line of the grid, because on a phone the grid holds two rows side by side. A second press of the
   chip, or Escape in the field, closes it.

Both places show only on a world with a ruin, and only after the find of the wreck. The card of the
wreck opens only on its cell, and that first open is the find. After the tune both places show the
locked band and no field: the card under the last entry, and the sidebar under the row, for good.
The Tune chip then goes away. A world with no ruin shows neither place. The store does not test the
find, because a find of the ruin by chance tunes the world too (p2-42), so a tuned world shows the
locked band even when the wreck is not found.

Each place keeps its own tuner, so the text in the field and the last answer survive a render of
the sidebar, and the focus comes back to the field after the render. A new world clears both.

### The field

- `type="text"` with `inputmode="decimal"`, so a phone shows the keys of numbers, and
  `autocomplete="off"`, so the browser offers no earlier entry. The placeholder is `406.025`, the
  band the reader knows. The field takes 12 characters at most, so the longest number still prints
  as a number.
- Enter submits, as the Tune button does.
- The Tune chip puts the focus in the field. The field of the card takes no focus when the card
  opens: the reader reads the log first, and a phone would raise its keyboard over the log.
- While the field holds the focus the ground takes no key. `Ground._onKey()` leaves every key to an
  editable element, so W, A, S, D, the arrows, Space, Q, E, R, F, C, and + and - type into the field
  and do not move the probe. The `/` key of the page types a slash into a field and does not jump to
  the seed input.

### The answers

`parseFreq()` of `ruin-types.js` reads the text, so `7.316`, `7,316`, `7316`, and `7.316 MHz` are one
number. `tuneAnswer(text, freq)` of `tuner.js` gives one of five answers, word for word. The near
miss and the static print the typed number to three decimals. The lock prints the band the receiver
now holds.

| Typed | Answer | Result |
|---|---|---|
| not a number | "The receiver takes a number in MHz, for example 406.025." | nothing |
| 406.025 | "The receiver holds the distress band." | nothing |
| within 0.0005 of the frequency | "Locked on 7.316 MHz. The probe hears a second source." | `markTuned()`, then chapter 2 starts |
| within 0.050 of it | "A pattern under the static on 7.313 MHz." | nothing |
| anything else | "Static on 7.313 MHz." | nothing |

- The rows are tested in that order, and both bands include their edge: `LOCK_BAND` is 0.0005 and
  `NEAR_BAND` is 0.050, each with a slack of 1e-9 for the error of a float. The distress band takes
  the band of the lock.
- The answer line has `aria-live="polite"`, so a screen reader reads each answer.
- **Nothing else gives the frequency away.** Before the lock the frequency stays in the closure of
  `makeTuner()`: no attribute, no list, no title, no pattern, and no address holds it, and no
  answer but the lock prints it. The near miss prints the typed number and not the frequency, so it
  says only that the number is within 0.050.

### The moment of the tune

The lock calls `tune()` in `app.js`, the path of the debug hook of p2-38. `markTuned()` sets the
tune in the store, and the globe builds the group of the carrier again for chapter 2.

- **On the ground** the landing reads the carrier again, for the ruin. The carrier block turns to
  the bearing of the ruin, prints its frequency, takes the colour of chapter 2, and pulses for the
  brief "Unknown signal". The landing takes the first fix of chapter 2 at once, so a reader who
  tunes at the wreck sees the first wedge of the ruin at the end of the ascent.
- **In orbit** the tune takes no fix. The Carrier row reads "Tuned", and the next landing takes the
  first fix.

The colour of the carrier block is the colour of the wedges of chapter 2, `carrierColour(world, 2)`,
lightened until its luminance reaches 0.3, as the drawings of the brief take it. `ProbeHud.setTint()`
writes it to `--hud-tint`: the needle, the bearing, the ring of the dial, and the pulse take it.
The labels keep their grey, and the rest of the overlay keeps its blue.

## The card of the ruin

p2-42. The ruin can be read. A tap on the ruin marks it, and the floating button "Study the ruin"
opens its card. The card opens only on the cell of the ruin, as the card of the wreck opens only on
its cell, because it states the frequency, the day of the beacon, and the maker. The first open is
the find of chapter 2.

### The shell

`RuinInspector` in `ground-source.js` draws the card in the shell of the card of the wreck, on the
same element, with a canvas of its own, `#rcv`. The preview at the left turns the body of
`ruinGeometry()` on its own axis, with its glow and, for the floaters, its orbit, over a disc in the
ground colour of the world. The text reads at the right. At 720 pixels and under, the card is one
column: the ruin as a band, the name, and the rows, each label over its text.

- **The fit.** The protos differ in shape: the spires stand 88 units on a disc of 24, and the hive
  stands 30 on a disc of 55. So the card fits the ball that holds the turning body and its disc into
  the view, and the eye stands higher over a flat ruin than over a tall one.
- **The well.** The shaft goes 46 units into the ground. The disc of the card is a ring with the
  mouth open, and a fragment of the body under the ground shows only when the ray from the eye to it
  crosses the ground inside the mouth. `mouthTest()` patches the fragment shader of the stone and of
  the glow with that rule, so the shaft shows through the mouth and never hangs under the disc.
- **The glow** takes the colour of chapter 2, as on the ground, and blinks `ruinMotifOf()` on the
  clock of the card (p2-44). The text takes the same colour, made lighter until it reads on the dark card, as the
  drawings of the brief take it.
- **The height.** The card takes the height of its text, and never less than the preview. The rows
  scroll inside the card only on a short screen.

### The rows

`ruinCard(world)` of `ruin-types.js` writes the text, with no DOM, so `tools/ruin-check.mjs` reads
it on every world. The name is the name of the proto in `RUIN_PROTOS`, and the line under it reads
"Ruin · sends on 7.316 MHz". The rows follow, in this order, each a label and one to four plain
sentences in the voice of the log:

| Row | Text |
|---|---|
| Size | "It stands 88 metres high and 48 metres across.": the height and twice the disc of the table, in metres of the lore |
| Age | "Older than the rock it stands on. The probe cannot date it." |
| Stone | "A stone this world does not make." On a lava world: "A stone that takes the heat and holds it." |
| Makers | decision 4; see below |
| The call | decision 6: "It began to send on day 3 of the log of Lantern 10. That was the day the crew put the beacon on the mast." The day is `log.beacon` and the ship is `log.probe` of the log of the wreck |
| The way on | decision 12: the line of glyphs of `portalSeed(world)`, the chip "Coming soon" beside it, and under it "The probe reads the name of another world here. It cannot read it yet." |

**The makers.** A maker of a species: "The carvings show a body with six legs. It is the body of the
hardpan long-day hopper." The name is the name of the fauna card, in the case of a sentence, as the
log writes it. The body takes the words of the locomotion of the genome: one leg, two, three, four,
or six legs, no legs for a serpent, two legs for a slinger, four for a plough, and two legs and two
wings for a winged maker, which is `limbs` 4 of p2-35. A slinger, a plough, and a winged animal carry
no leg on the fauna card, so for those three the row adds "The ones that live here now have no
legs.", and the card never disagrees with the fauna card. A rolled maker: "The carvings show a body
with four legs and a height of about 3 metres. No animal of this world has that body." The height
takes the nearest half metre.

Three protos have a part the maker sizes: the door of the dome, the doors of the hive, and the steps
of the well. `MAKER_PARTS` of `ruin-types.js` holds the numbers that `ruin-geometry.js` builds them
with: `k` times the height of the maker, inside `[lo, hi]` units. Where `k` times the height stays
under `hi`, the part follows the body, and the row adds "The door in the base ring fits that body.",
"The doors of the mounds fit that body.", or "The steps down the shaft fit that body." Where `hi`
cuts the part, the row says nothing of it. Over 500 seeds, 104 of the 191 worlds with a dome, a hive,
or a well take the sentence.

**The voice.** The log holds no sentence over 20 words, and the card holds none either: the longest
has 15. So the call row states the day and the ship in one sentence and the beacon in a second.
"Coming soon" stands in the chip and in no sentence.

### The glyphs

The makers write in one script of 26 glyphs, one for each letter from a to z, and every world shares
it. `GLYPHS` of `ruin-types.js` holds the strokes, and `glyphsOf(word)` gives the glyph of each
letter of a word, in either case, and an empty glyph for a character that is not a letter. A glyph is
a list of strokes in a box of 1 by 1, x to the right and y down, and a stroke of one point is a dot.
Every glyph hangs from a rule at y = 0, which the card draws across the whole word, so the line reads
as one script, and no glyph reads as a letter of the Latin alphabet.

The card draws the line as inline SVG in the colour of the ruin, one glyph per letter of
`portalSeed(world)`. The SVG holds no text, and no attribute holds the seed, so the page does not
print the name the glyphs spell. One seed gives one line on every open, and two seeds of the way on
give two lines: over the 1,482 seeds of the way on of `tools/ruin-check.mjs`, no two share a line.
The later issue that opens the way reads the same script. Do not change a glyph.

### The find of chapter 2

`inspectRuin()` in `app.js` opens the card and calls `onRuinFound()` the first time:

- `markFound(seed, { chapter: 2 })` in the store. The store drops the fixes of chapter 2 with it, and
  a clear of the fixes keeps the find.
- **A find by chance.** A reader can land on the cell of the ruin before the tune, and a patch shows
  the ruin whether or not the reader tuned. That find is a find all the same, and the card states the
  band, so `onRuinFound()` calls `markTuned()` too. The receiver then holds the band of the ruin: a
  probe on the ground reads the carrier again, as a tune there does, and the overlay prints the band
  of the ruin. The fix that landing took for the wreck stays a fix of chapter 1. The Carrier row reads
  "Found 1 of 2", and the locked band takes the place of the Tune chip.
- The group of the carrier is built again from the record, because a find by chance moves the
  search to chapter 2. After both finds the Carrier row reads "Found 2 of 2" and offers "Wreck" and
  "Ruin", and the thumb of the saved world carries two marks.
- `setCarrierLevel()` sets the buses of the motifs again, so after the recall the motif of the ruin
  plays in the song of the world at 0.6. See "The voice". p2-44.

### The mini ruin on the globe

The find stands a second pin at the cell of the ruin, on the pattern of the pin of the wreck:
`makeRuinModel()` in `carrier-globe.js`. The pin of the wreck stays.

- The pin takes the colour of chapter 2 and drapes on the terrain of the cell, its axis along the
  surface normal, `PIN_H` tall, with the least width of the pin of the wreck.
- The model on top is `ruinGeometry(proto, world, { mini: true })` at `MINI_UNIT` globe radii per
  unit, see-through, in the stone of the type with a little of the colour of chapter 2 as emissive,
  so it reads on the night side. It takes the least size of the mini wreck, so the two keep their
  ratio at every zoom: the spires stand 4.9 times the mini wreck. It turns and bobs as the mini wreck
  does. No part answers a ray, so a pick still names the cell under it.
- **The lamp.** A small point in the colour of chapter 2 stands at the lamp of the body: the tip of
  the spires, the palm of the colossus, the mouth of the well. It holds a least radius of 0.0035 of
  the distance from the camera, a few pixels at the home zoom, and it blinks with the rules of the
  lamp of the wreck: a floor, a tail, and a breath. Its rhythm is `ruinMotifOf(world)`, the motif
  of the ruin, on `music.ruinClock()` when the sound runs and on the clock of the group when it does
  not, as the glow on the ground takes it. `app.js` passes `music` to `updateCarrierGroup()` for
  that clock. p2-44; see "The voice".
- `setFound(group, world, heightMap, { chapter: 2 })` stands it on a group that exists, and
  `makeCarrierGroup()` stands it for a record with `ruin.found`. A world with no ruin never stands it.
  `disposeCarrierGroup()` gives its three geometries and its three materials back.

## The voice

p2-44. The wreck has a voice in `music.js`, the motif of issue 34. The ruin has a voice too: it
sends the beacon of the crew back, slower. Decision 11 of p2-00.

### The motif played back

- `ruinMotifOf(world)` gives the rhythm with the fields of `motifOf()`: `seed`, `steps`,
  `stepsPerBar`, `bars`, `stepDur`, `barSeconds`, and `period`. The steps are the steps of
  `motifOf()`, and `stepDur` is twice the step of the wreck. So one call fills two bars of the song,
  and the period, four bars of the ruin motif, is eight bars of the song.
- `compose()` writes the notes of the ruin after the notes of the wreck, from the same pitches, an
  octave lower. The notes of the wreck stand in the mode and inside the octave over the root, so the
  notes of the ruin stand in the mode and inside the octave under the root. The ruin is always in
  tune.
- **Why no stream.** The ruin reads the notes of the wreck and draws no number. So no song, no
  motif of the wreck, and no stream of `generate.js` moves. A reader who knows the call of the wreck
  hears the same call come back, and this is the fact the voice states: the ruin replies to the
  beacon. "The streams" in p2-00 lists it.
- **The place in the period.** The call of the ruin starts on bar 3 of each eight, `RUIN_AT` = 2
  from 0, and it ends with bar 4. The wreck calls on bars 1 and 5. So after both finds the ruin
  answers one bar after the call of the wreck, and no call of the ruin starts on a bar of a call of
  the wreck. The ruin keeps the straight time of the motif of the wreck, and its period of eight bars
  divides the loop of 32.
- **The timbre.** A soft bell: a sine, and a second sine at three times the pitch that bends its
  frequency (FM). The bend is strong at the strike and falls to 0.12 of it in 0.35 s, and the bell
  rings out over a release of 1.4 s. The ratio is a whole number, so every partial stands on the
  harmonic series of the note. The wreck is a short plain sine an octave higher, so a listener tells
  the two apart when both play.
- **The bus.** `_start()` adds `song.ruinBus`, a gain at 0 that feeds `out` and the hall. It passes
  the lowpass of the world by, as the source bus does, and it sends 2.5 times as much into the hall,
  `RUIN_VERB`, so the bell sounds far off. `setRuin(k)` ramps it to `k * 0.5` over 0.4 s, on the
  pattern of `setCarrier()`. The level waits while no song plays.
- **The loudness.** At the level of the wreck the bell measured 8 dB louder in windows of 85 ms and
  11 dB louder in windows of 0.34 s, A-weighted, because it rings on where the sine of the wreck
  stops. `RUIN_LEVEL`, 0.35, takes 9 dB off. Over five worlds a call of the ruin then measures 1 dB
  under a call of the wreck in the short windows and 1 to 4 dB over it in the long ones. The listen
  test can move it.

### The levels

`setCarrierLevel()` in `app.js` sets both buses twice a second on the ground, and on each landing,
recall, tune, and find. `carrierLevel(kind)` gives each bus the rule of its own source. The
smoothstep goes from 0.15 at the edge of the reach to 1 at 40 units, as issue 34 set it for the
wreck.

| Where | Wreck bus | Ruin bus |
|---|---|---|
| Ground, chapter 1, the cell of the wreck | the smoothstep of the range | 0 |
| Ground, chapter 2, the cell of the ruin | 0 | the smoothstep of the range |
| Ground, any other cell | 0 | 0 |
| Orbit | 0.6 after the find of the wreck, else 0 | 0.6 after the find of the ruin in chapter 2, else 0 |

The range on the cell of the ruin is the range the overlay states, to the edge of its stones. The
receiver holds one band, so on the cell of the wreck in chapter 2 both buses stay at 0, and a
landing on the cell of the ruin in chapter 1 is silent. The motif of the ruin stops on the recall
until the find. After both finds both motifs play in orbit, and the song stays whole.

### The lamp

The glow of `SourceRuin` blinks `ruinMotifOf()` with the rules of `lampLevel()`. When the sound
runs its clock is `music.ruinClock()`: the seconds since the start of the last call of the ruin,
inside its period. The call does not start on bar 1, so the ruin needs this clock and not
`barClock()`. With no sound the glow takes the clock of the landing over the same period. So the
eye and the ear agree, and a reader with the sound off loses no fact.

The lamp of the mini ruin on the globe takes the same pair: `updateCarrierGroup(group, dt, music)`
in `carrier-globe.js` reads `music.ruinClock()`, and with no sound the clock of the group. It keeps
a copy of the rules of `lampLevel()`, because `ground-source.js` imports `carrier-globe.js` and an
import the other way would close a cycle. The glow of the card of the ruin blinks `ruinMotifOf()` on
the clock of the card, as the lamp of the card of the wreck blinks `motifOf()`.

### The music check

`tools/music-lab/` is a local tool, and git ignores it. Its `check-motif.mjs` tests the motifs of
the two sources against the song, with no audio rendered. Run it from the directory of the lab,
where `node_modules` holds `node-web-audio-api`:

```sh
cd tools/music-lab
MUSIC=/path/to/music.js node check-motif.mjs /path/to/baseline/music.js
```

`MUSIC` chooses the `music.js` under test, and the default is `../../music.js`. The argument is a
baseline and it is optional. The check proves:

- The motif of the wreck: it is deterministic, it holds four to seven notes in the mode inside the
  octave over the root, and `motifOf()` and the scheduler agree with `compose()`.
- The motif of the ruin: `ruinMotifOf()` is deterministic and holds the steps of `motifOf()` at
  twice the step length, its period is eight bars of the song, and `compose()` agrees with it. Every
  note is a member of the mode and stands an octave under the note of the wreck on the same step.
  The scheduler plays each note on the ruin bus on the clock of `ruinMotifOf()`, `ruinClock()` stands
  on the step of each note, and no call of the ruin starts on a bar of a call of the wreck.
- `setCarrier()` and `setRuin()` wait with no audio, open their bus from 0, and clamp to 0 to 1.
- With a baseline: the song data and the note events of the motif of the wreck of every world of
  `worlds.js` are byte-equal to the baseline.

## The checks

- `node tools/ruin-check.mjs` runs 500 seeds through `worker.js` on LOW, every tenth of them on HIGH
  too, and every 25th again after another world. It tests the hashes of `ruin-types.js`, the place,
  the maker, the tiers, and the cache, and it prints the share of each band. `placeFacts()` of
  `generate.js` gives it the numbers of the field that the tests read; the page never calls it.
  Part 5 builds the patch of the ruin on 70 of those worlds, every proto among them, 8 of them on
  HIGH too: the shape of `patch.source`, the flat and dry disc, the whole disc inside the reach, no
  plant, no group, and no member on it, the body on the flat disc, the stone of the floor, the same
  patch after another world, and no ruin on the cell next door. p2-41.
- `node tools/ruin-check.mjs` part 6 tests the card of p2-42: the script of 26 glyphs, two seeds of
  the way on against two lines, and on every world with a ruin the text of `ruinCard()`: the name,
  the rows in order, the makers row against the species and its fauna card or against the rolled
  body, the door or the steps, the day and the ship of the call, the glyphs of the way on, and no
  sentence over 20 words.
- `node tools/carrier-fix-check.mjs` part G tests the pin of the ruin: both pins after both finds,
  in the colour of each chapter, the mini ruin on its pin at `MINI_UNIT`, the lamp at the lamp of the
  body and its blink, a find by chance, and a world with no ruin. p2-42.
- `node tools/world-checksum.mjs --check` must match its baseline: the ruin moves no other stream,
  and every patch off the cell of the ruin hashes as it did before p2-41.
- `node tools/world-checksum.mjs --source` prints the ruin of each seed on both tiers.
- `tools/music-lab/check-motif.mjs` tests the voice of the ruin against the song and the motif of
  the wreck. It is a local tool; see "The music check" above. p2-44.
- `node tools/carrier-check.mjs` runs every check of the carrier with the wreck and with the ruin
  as the source, and `node tools/carrier-fix-check.mjs` tests the two chapters of the store and of
  the group. p2-38.
- `node tools/carrier-fix-check.mjs` part F tests the answers of the tuner: every row of the table
  above, the other spellings of the frequency, and the frequency of 500 seeds against numbers 0.001,
  0.050, and 0.051 off it. p2-39. The page part of the tuner needs a browser, and p2-39 tested it
  there; see its "What the build changed".
- Add `?ruin` to the address, with `?source`, to see the two dots on the globe, for example
  `http://localhost:5555/?ruin&source#Auralis`. The ruin is cyan and the wreck is pink.
- `node tools/ruin-geometry-check.mjs` builds every proto on every type it fits, with every limb
  count and four maker sizes, and holds each build to the budget and the frame. See "The body".
- `tools/ruin-lab.html` draws the protos with the real `ruinGeometry()`. The address takes the
  view, for example `tools/ruin-lab.html?proto=hive&type=terran&limbs=6&mini=1`, and the grid
  under the view shows every proto on every type it fits. From the console, `lab.render()` draws
  one frame, `lab.shot('name')` posts a PNG of it to the shot-sink, and `lab.shotGrid('name')`
  posts the grid; `?shot=name` in the address takes the first shot at load.
