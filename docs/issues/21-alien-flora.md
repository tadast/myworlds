# 21 Alien flora and ground cover

Status: CLOSED, 2026-09-10, merged as PENDING.

Type: interactive. Phase 2. Blocked by: 07, 11. Read `docs/issues/README.md` first, in particular
"The patch protocol" and "LOD".

## The problem

The ground patch grew two kinds of plant. Each kind had one shape, one colour, and one size range,
and the placement scan gave every cell of the box the same chance. So a reader who zoomed in on
land saw a field of copies: the same tree at the same size every six units, over ground that held
no cover between them. Nothing said "another planet".

## What to build

1. **More kinds, and stranger ones.** Nine new kinds in `flora-geometry.js`: a tower mushroom that
   stands over any tree, a spindle of bare whips, a sac that breathes, a crystal that grows out of
   the ground, a tuft of grass, a colossus, a fan, a pod, and a stack of plates.
2. **Variety inside one kind.** Every plant takes its own lean, its own width against its height,
   its own tint, and a size from a curve that bunches at the small end with a rare giant.
3. **Communities, groves, and bare ground.** Four noise fields over the placement scan: which kinds
   live where, where they knot into thickets, where the ground stays open, and how big they grow.
4. **Arrangements.** A ring, an arc, a row, and a spiral of one kind, so the reader asks who made
   them. One to three colossus bodies per patch, each with a court of smaller plants.
5. **Ground cover.** Grass between the plants, from a mask the worker writes.
6. **Motion.** The wind bends a stalk and a sac breathes, both in the vertex shader.

## Decisions

**A style table per kind, not per plant.** `FLORA_STYLE` in `flora-geometry.js` holds the glow, the
sway, the pulse, the LOD multiplier, the draw distance, the card size, the lean, and the width
spread of one kind. `ground-flora.js` reads it and nothing else needs to know about a kind.

**A colossus is never a card.** A card is 64 pixels. A body 120 units tall fills the screen from
100 units away, so a card would be a smear. The style of a kind multiplies the LOD knob: the
colossus takes 14, the tower mushroom 3, and grass 0.3. The colossus and the tower also bake at 128
pixels, and the colossus draws three times as far out, because it must still stand on the horizon.

**A size ceiling.** The vigour field of the patch, the vigour of the community, and the giant roll
all multiply. The first build grew a tower mushroom of 114 units against a colossus of 105, which
took the whole point out of the colossus. `floraSize()` now stops a plant at 1.9 of the top of its
own range, so only a colossus reaches the size of a colossus.

**Two community fields, not one.** Simplex noise bunches around the middle of its range. One field
cut into bands gave the middle community over half the plants of a patch, which is the carpet this
issue set out to break. Two fields at two wavelengths make a patchwork of nine zones, and the leads
of the communities are drawn without replacement.

**Grass is not one of the plants.** A tuft is about one unit wide, so it only reads within about 80
units. A field that wide over the whole box holds a quarter of a million tufts, far past the plant
cap of 20,000. So the worker writes a cover mask, one byte per node of a grid at twice the terrain
step, and `GrassField` grows a lattice around the camera from it. The lattice lives in world space
and the tuft takes its place from the hash of its cell, so a tuft never moves under the reader: the
field only gains cells at one edge and loses them at the other. The tufts shrink to nothing over the
last 22 units, so no ring shows, and a `uGate` uniform fades the whole field out as the reader
climbs past 60 units, which costs no rebuild.

**The tint rides on `instanceColor`.** The walk already rewrites the instance matrices every frame,
because it compacts the near plants and the cards into two meshes. It now copies three more floats
per plant. The card quad takes a white colour attribute so `USE_COLOR` is defined and the tint
multiplies the baked picture too, and the two levels of detail hold one colour.

**`flatShading` is off.** `mergeGeos()` returns a geometry that is not indexed and computes the
normals there, so every triangle already carries its own normal and a plant reads faceted without
it. `flatShading` makes three.js take the normal from the derivatives of the view position instead,
and a body a few pixels wide gives derivatives near zero. A grass blade, a spindle whip, and a
tendril under the colossus all drew black under derivative normals.

**The colour helper must name its colour space.** `Color.getHSL` reads the working space, which is
linear. `Color.setHSL` and `Color.getHex` write sRGB. The default pair therefore treats a linear
number as an sRGB one, and every derived colour came back nearly black. All three calls now name
`THREE.SRGBColorSpace`.

**The motion carries no normals.** The bend and the breath move the vertices and leave the normals
at their rest shape. The bend is at most a tenth of the height of a plant and the breath a seventh
of its width, so the light on a body that moves is a little behind its shape. The shadow pass runs
the depth material, which carries neither, so a shadow holds the rest shape too.

## Acceptance criteria

- [x] A terran site shows several kinds in bands across the patch, with open ground between them.
  - `Auralis@-38.00,18.00`: 8,126 plants in 9 kinds. Fan 2,253, stack 1,660, spindle 1,245,
    mushroom 1,078, tower 1,031, pod 468, sac 349, tree 41, colossus 1. The first build put 3,572
    of 6,253 into one kind; the two community fields and the draw without replacement fixed it.
- [x] A mushroom stands taller than the tallest tree of the same patch. Tower 79.8 units against
  tree 27.2 on the same patch.
- [x] One to three colossus bodies stand on the patch, and nothing else comes near their size. One
  body of 120.1 units on Auralis, against 79.8 for the next tallest plant.
- [x] At least one ring, arc, row, or spiral of one kind stands somewhere on the patch. `Auralis@-38.00,18.00` places 41 plants from two arrangements and one colossus court. The load log
  reports the three counts.
- [x] Grass fills the ground between the plants and holds the hue of the ground under it. A forest
  site grows 4,866 tufts and an arid site 1,212, from a cover mask that means 145 and 34 of 255.
  A snow site grows none.
- [x] No plant draws black at any distance, on any world type. Two causes, both fixed: derivative
  normals on geometry a few pixels wide, and the colour space of the palette helper.
- [ ] The frame holds 60 fps on a forest site at 30 units over the ground on HIGH. Measured 16.8 ms
  at 60 fps on the forest site with the LOD knob at 299 m, and the partition walk at 0.20 ms for
  8,126 plants against its budget of 0.5 ms. The arid site of Xothis ran 19.7 ms while the knob was
  still coming in. Needs a measurement on real hardware, not the automation browser.
- [x] The same URL gives the same plants on reload. 8,126 plants in 9 kinds over four loads.
- [x] `renderer.info.memory` returns to its orbit numbers after a recall. Textures 1 to 10 to 1 and
  geometries 15 to 134 to 16, over three landings.
- [x] `README.md` "How it works" describes the kinds, the communities, and the ground cover.
