# p2-41 A landing on the cell of the ruin shows empty ground

Status: open.

Type: AFK. Phase 2. Blocked by: p2-35, p2-36. Read "The patch protocol" and "The carrier" in
`docs/issues/README.md`, and slice 3 of `docs/issues/34-the-carrier.md`.

## The defect

p2-35 puts the ruin in a cell, and p2-38 leads the reader there. The patch of that cell is plain
ground. The needle points at nothing and the range falls to nothing.

## What to build

**`patchRuin()` in `generate.js`**, beside `patchSource()`, on the same pattern and from
`makeRng(pseed + '|ruin')` only, so every other patch is byte for byte the patch of today.

- `patch()` asks `kindIn(ctx.world.ruin, cell)` after it asks for the source. A cell holds one or
  the other, never both, by the rules of p2-35.
- The disc takes the radius of the proto: `disc` of `RUIN_PROTOS`. Reuse the walk of
  `patchSource()` over the reach and its fallback, with the rim test on the disc of the proto, and
  keep the phenomenon out when the cell holds one. Share the code: one walk with the disc as an
  argument, and not two copies.
- The disc is flat with a soft edge, as the disc of the wreck is. It takes no scorch. It takes a
  worn paint instead: the ground colour lifted a little toward the rock of the palette, as stone
  that feet and weather wore flat. Plants, the blades and stones of `ground-cover.js`, and the
  anchors of the groups keep off the disc, as they keep off the disc of the wreck.
- The yaw comes from the stream. `arches` lays its line along the yaw, so the whole line must fit
  in the disc.
- Reply with `patch.source = { kind: 'ruin', proto, x, y, z, yaw }`.

**The ruin on the ground, in `ground-source.js`.** `SourceWreck` draws the wreck. Add `SourceRuin`
beside it with the same shape: `constructor`, `update(t)`, `pickAt()`, `mark()`, `unmark()`, and
`dispose()`. `Ground` takes the class by `patch.source.kind`, so the rest of `ground.js` reads
`ground.source` and does not care which kind stands there.

- The body is one mesh from `ruinGeometry()` of p2-36, with a flat-shaded standard material and
  vertex colours. It casts and takes shadows on HIGH.
- The glow is one mesh with one material in the colour of chapter 2 of p2-38. It blinks the rhythm
  of the ruin motif of p2-44 on `music.barClock()`, with the rules of `lampLevel()`: a floor that
  never goes out, a tail, and a breath. Until p2-44 lands, it blinks the rhythm of `motifOf(world)`
  at half the speed.
- HIGH gets one point light at the lamp point, and LOW the emissive glow only.
- `floaters` turns its orbit geometry about the core and lifts each slab on its own phase. No other
  proto moves.
- **The well opens the ground.** The terrain of a patch is one grid with no hole. Pass the centre and
  the radius of the mouth to the terrain material in a uniform, and let its fragment shader discard
  inside that circle. The shaft wall of the body hides the edge. The rim, the flora, and the cover
  do not reach the mouth, because the disc keeps them off.
- The tap marks the ruin with the ring the wreck takes, wide enough for the disc, and the floating
  button reads "Study the ruin". `onSelectSource()` fires as it does for the wreck. p2-42 builds the
  card.

**The carrier on the cell.** On the cell of the ruin, the needle and the range stop reading the
globe and read the ruin, measured from the camera, as they do for the wreck. The level of the motif
reads the same distance. `reachOf()` in `ground.js` bounds the place, so the reader can always walk
to it.

## Docs

- `docs/issues/README.md`, "The patch protocol": `patch.source` with the kind `ruin` and its fields.
- `docs/ruin.md`: the ruin on its patch: the disc, the paint, the light, the well.

## Acceptance criteria

- A landing on the cell of the ruin shows it, on each of the eight protos. Use `?ruin` and the six
  world types, and state one seed per proto in the summary.
- No plant, no blade, no stone of the cover, and no herd stands on the disc.
- The needle points at the ruin from every camera azimuth, and the range falls under 5 units at its
  edge.
- The well shows its shaft and its floor, and the terrain holds no skin over the mouth.
- Every patch that is not the cell of the ruin hashes as it did before, in
  `node tools/world-checksum.mjs`.
- Frame time: the ruin adds under 0.3 ms on HIGH at the reveal camera, and `renderer.info.memory`
  returns to its orbit numbers after a recall.
