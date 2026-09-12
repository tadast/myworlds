# Flora lore: architecture

This document describes how myworlds writes the text of its plants. Read it before you change
`flora-lore.js`, `flora-card.js`, the flora parts of `worker.js`, or the plant parts of
`ground-flora.js` and `app.js`.

Read `docs/fauna.md` first. The two systems share one engine and one card, and the differences
between them are the whole point of this file.

## Overview

| Stage | File | Runs in | Output |
|---|---|---|---|
| 0. The lore engine | `lore.js` | Web Worker, page | `self.Lore`: tags, gated text pools, story slots, relations |
| 1. Grow the plants | `worker.js` | Web Worker | `flora`: a `Float32Array`, 8 floats per plant |
| 2. Write the lore | `flora-lore.js` | Web Worker | `patch.plants`: one entry per kind, with its lore |
| 3. Build the shape | `flora-geometry.js` | Main thread | one geometry per kind, from the flora signature |
| 4. Draw and inspect | `ground-flora.js`, `flora-card.js` | Main thread | the plants of the patch, the mark, the study card |

The same seed and the same site always give the same plants and the same text. All randomness comes
from the seeded `makeRng()` streams in the worker.

## The one difference from the fauna

**An animal belongs to a world. A plant belongs to a patch.**

`species.js` writes the lore of every animal once, in `generate()`, because a species lives on the
whole planet. `flora-lore.js` writes the lore of every plant in `patch()`, because three of the
facts a plant story needs are facts of the site and not of the planet:

- **Which kinds grow here.** `floraCommunities()` picks them per patch, out of a pool the world seed
  fixes. Two patches of one planet agree on the pool and differ in what they grew from it.
- **How many, and how tall.** `describePatchFlora()` counts the plants the patch really placed and
  takes the median and the tallest of each kind. The card therefore states numbers the reader can
  walk out and check.
- **The biome.** A tower on a shore and a tower on a snow field are not the same plant to the
  reader, and the story says so.

So `patch.plants` rides back with the patch, and it goes away when the probe is recalled. The plant
card only opens on the ground. The page never loads `flora-lore.js`: the text crosses as plain data.

## The three tag sources

Every line of text names the tags it needs and the tags it forbids, the same gate syntax
`lore.js` gives the fauna. A plant carries tags from three places at once:

| Source | Examples | Set by |
|---|---|---|
| the world | `frozen`, `lowgrav`, `rainy`, `ringed`, `volcanic`, `moonless` | `Lore.makeEnv()` |
| the kind | `woody`, `fungal`, `mineral`, `glows`, `sways`, `tall`, `spined` | `KIND` in `flora-lore.js` |
| the biome | `wetground`, `moist`, `dryground`, `coldground`, `bare`, `stony`, `shaded`, `open` | `BIOME` in `flora-lore.js` |

Two rules keep the three honest.

**The world flora tags are stripped.** `Lore.makeEnv()` puts `cactus` and `stoneflora` in the tag
set of a desert world, because those are the kinds its globe grows. Those words say what the planet
grows *somewhere*. A gate on this card has to say what *this* plant is, so `WORLD_KIND_TAGS` is
removed from the world set and the kind puts its own tags back. Without this a stack on a desert
world matched a line written for a stone.

**`wetground` and `moist` are two different claims.** A line gated on `wetground` may say that the
roots stand in water, because the site is a shore or a bed. A line gated on `moist` may only say
that the ground holds water. Every wet ground is also moist.

## The temperature of the site

The stats card states the mean temperature of the planet. A patch is not the mean. `siteTempC()` in
`worker.js` reads `siteT`, the temperature field of `fieldFrom()`, which falls with the latitude and
with the height of the ground, and turns it into degrees:

```
siteTempC = tempC + (siteT - (1 - T_LAT_MEAN + tempBias)) * T_SPAN
```

`T_LAT_MEAN = 0.42` is the mean of the latitude term over a sphere, and `T_SPAN = 55` turns one unit
of the field into degrees. The biome then caps it: `biomeIndex()` paints snow above the snow line
whatever the temperature says, so a snow site is at or below freezing and a tundra site is cool. Ice
on the ground is the stronger fact.

The flora lore reads that number. The fauna lore still reads the planet mean, because an animal
ranges over a world and a plant stands on one spot.

## The story

Eight named slots, in this order:

| Slot | Holds | Core |
|---|---|---|
| `form` | how the body is built, keyed by the kind | yes |
| `feature` | one part the name did not use | yes |
| `habit` | how it lives on this ground, gated on the biome | yes |
| `stand` | how many stand here and how they are spread | yes |
| `climate` | the weather it takes | no |
| `sky` | the moons, the ring, the aurora over it | no |
| `beast` | one line that names an animal of this world | no |
| `synergy` | one relation with another plant of this patch | no |
| `close` | a closing line, keyed by the world type | no |

`trimStory()` keeps the four core slots and two of the rest, so a story is six sentences. A relation
with another plant always takes one of the two, because it is the only line that ties this plant to
the rest of the patch.

The card also carries four rows: **Habitat** from the biome, **Height** from the plants the patch
placed, **Food**, and **Spread**. The rows take no freshness rule — two plants that both live on
light must both say so — and every `FOOD` line carries a `src`, so one plant is never offered two
sources of food.

## The relations

`RELATIONS` walks every ordered pair of kinds on the patch through `Lore.relate()`, in a fixed
order, and writes one sentence into both stories. A tall kind shades a low one; a colossus holds a
court; a fungus takes the dead wood of a tree; a whip climbs anything tall. `RELATION_CONTRACT`
states what each rule needs of each side, in the words the text uses, and `tools/lore-audit` sweeps
every rule against every pair of kinds.

`FAUNA_LINKS` is the other direction: one optional line that names an animal of the world. It reads
the genome the same way the fauna relations do, so a grazer never browses a plant that is ankle
high and a burrower never nests in a crown. It takes the `beast` slot, so a plant can carry both a
plant relation and an animal line and the story still ends at six sentences.

## The controls

The plants use the controls the animals use, and only on the ground:

- **A tap marks one plant.** `Flora.pickHit()` projects the base and the top of every plant the walk
  has not culled and takes the nearest body under the pointer. A body that holds the point beats a
  body the point only grazes. `ground.js` owns the tap: an animal and a plant can both lie under one
  point, and the animal wins unless it stands clearly further back, because a reader who taps an
  animal beside a tree means the animal.
- **A ring lies on the ground around it**, in the accent colour the animal ring and the site square
  both take. A plant does not move, so the ring is placed once and never stepped.
- **The floating button offers the card**: "Study the ‹name›". Only one thing is marked at a time,
  so the button always names what the ring is under.
- **The arrows of the card walk the plants of the patch**, tallest first, and point the view at the
  nearest plant of the kind.
- **The sidebar grows a Flora row** while the probe is down, beside the Fauna row.

## The preview

`flora-card.js` holds `PlantInspector`. The animal card and the plant card share one card element
and one set of text nodes, and they keep one canvas each, because a `WebGLRenderer` owns the canvas
it draws to. The card shows one canvas and hides the other.

The two previews move differently, because the two subjects do. An animal walks, so the animal card
lets it roam a disc and turns the camera around it. A plant stands still, so **the plant card holds
the camera still and turns the plant**: the body is centred in the frame and it rotates on its own
axis, one turn in about 24 seconds.

The body itself still moves. The card builds the plant with `nearFloraMaterial()`, the near material
of the ground, so the wind bends it and a sac breathes on the card exactly as it does on the patch.
That shader only runs under `USE_INSTANCING`, so the card draws one instance and puts the scale and
the turn on the nodes above it.

## The audit

`node tools/lore-audit/audit.mjs` sweeps the flora as well as the fauna. The flora pass is the
product of every sky the flora can tell apart, every kind, and every biome, and it runs the same
five checks: no empty pool, no unreachable line, no word that claims a fact the world does not have,
no plant offered two sources of food, and no relation that fits a pair it does not suit.

Two flora facts live in the audit:

- `FLORA_SKY_TAGS` collapses the 11,616 worlds to the skies a flora gate can tell apart. A new gate
  on a new tag widens the sweep on its own, because the list is read out of the pools.
- The lexicon rule for a thaw accepts `coldground` beside `frozen` and `cold`, because a warm planet
  can hold a frozen site and the site is the fact the plant lives with.

`node tools/lore-audit/patch-sample.mjs --seeds 6` prints whole stories from real patches. Use it to
read the text after a change.
