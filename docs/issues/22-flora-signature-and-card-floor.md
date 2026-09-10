# 22 The flora signature of a world, and the card floor

Status: CLOSED, 2026-09-10, merged as PENDING.

Type: HITL. Phase 2. Blocked by: 21. Read `docs/issues/README.md` first.

## The problem

Two faults the reader found after issue 21 shipped.

**Every planet grew the same plants.** Issue 21 gave a patch sixteen kinds and four fields to lay
them out, but the shape of one kind was fixed: `floraGeometry` seeded its own PRNG with the kind
code and nothing else. A tower mushroom on one world was the same body as a tower mushroom on the
next, down to the vertex. The kind pools were fixed per world type too, so every temperate world
drew from one list of ten. Only the palette changed, and a palette cannot carry a planet.

**Some plants read as flat even close up.** The near mesh swaps to a baked card past
`lod.distance * style.lod`. The knob follows the frame time and its floor is 40 m. On a 30 Hz
display it sat at its floor, so a plant ten metres away was a card of 64 pixels blown up to 139
pixels on the screen. Measured on `Auralis@-38.00,18.00`: 85 plants near, 8,018 on cards.

## What to build

1. **A flora signature per world.** A hash of the seed, carried to `floraGeometry` and used before
   the shape is laid out.
2. **A per-world kind list.** Every world borrows kinds from the whole alien set and drops some of
   the ones its type usually grows.
3. **A card floor.** A plant stays a mesh until its picture would be magnified.

## Decisions

**The signature moves proportions, not shapes.** Seven numbers: `stout`, `crown`, `squat`, `many`,
`splay`, `lit`, and `turn`. They scale the parts a kind already builds and set how many parts a
kind of many parts carries. A kind therefore keeps its silhouette — a tower mushroom is always a
tower mushroom — and still reads as another species. Measured over four signatures: a tower is
0.67 to 0.99 wide against a height of about 1.2, a spindle carries 100 to 200 triangles, and a sac
carries 280 to 520.

**The signature takes its own hash, not a draw from `rng`.** `worldContext` warns that the draw
order of the seed stream must not move, or every world changes. `cyrb128(seed + '|flora-shape')[0]`
touches nothing.

**The kind list runs off the world, not the patch.** `floraCommunities` takes a second PRNG seeded
with the world seed. Every patch of one planet therefore agrees on which kinds live there, and the
reader who walks two sites of one world sees one flora. Measured: `Auralis` grows tree, mushroom,
tower, spindle, sac, colossus, pod, and stack; `Linden`, also temperate, grows tree, pine,
mushroom, palm, tower, growing crystal, colossus, fan, and pod.

**The card floor is the resolution of the card.** A plant `s` units tall at `d` units covers
`s * focal / d` pixels. The card holds `style.card` pixels. So the floor is `s * focal / card`, and
past it the swap cannot be seen. It is per plant and not per kind, because one kind holds sizes
from 5 units to 40. The walk keeps the square of the size per plant and multiplies by
`(focal / card)^2` once per kind, so the floor costs one multiply and one compare.

**The floor reads the CSS size of the view, not the drawing buffer.** On a display at two device
pixels per CSS pixel the card is then magnified by two at the swap, which is what every texture on
that display does. Reading the drawing buffer would double the near count for a gain no reader
would name.

**The cards are baked larger.** 96 pixels by default instead of 64, 160 for the tower, 192 for the
colossus, 48 for a tuft of grass. A bigger card lowers the floor of its kind, so the two decisions
pull against each other and the near count stays sane. The whole set costs about 400 KB of texture.

**The fan is thin, not flat.** Its blade was 0.09 of its own width, which is paper from the side.
It now takes a body of 0.2 to 0.42 and a second blade across the first, so it holds a shape from
every angle.

## Acceptance criteria

- [x] The same kind builds a visibly different plant on two worlds.
- [x] Two worlds of one type grow different lists of kinds.
- [x] No card is magnified past its own texture. Measured at the LOD floor of 40 m on a forest
  site: the widest card of each kind was 64 px against a texture of 96, 140 against 160, 94
  against 96, 56 against 96, and 52 against 96.
- [x] The partition walk stays under its budget of 0.5 ms. Measured 0.2 to 0.3 ms for 8,671 plants.
- [ ] The frame holds the refresh rate of the display on a forest site on HIGH. The floor puts more
  plants on the near mesh, so the adaptive knob has less room. Needs a measurement on real
  hardware.
- [x] `README.md` "How it works" describes the signature and the card floor.
