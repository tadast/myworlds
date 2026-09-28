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

## What the build changed

Built on 2026-09-28. Every deviation from the plan above, and the reason:

- **The flat disc is the disc of the table, and the soft edge lies outside it.** The plan says the
  disc is flat with a soft edge "as the disc of the wreck is". The wreck is flat over 0.55 of its
  14 units, and its parts stand near the middle. The parts of a ruin reach the disc of the table:
  the arches stand 47 units out on a disc of 52, and the small hives 49 on 55. With a soft edge
  inside the disc those parts stood on ground that eased back to the terrain, so they floated or
  sank on a slope. So the whole `disc` of `RUIN_PROTOS` is flat, and the ground eases back over
  `RUIN_EDGE`, 0.4 of the disc, outside it. The plants, the cover, and the groups keep off the whole
  of it, soft edge and all, as they keep off the whole disc of the wreck.
- **The walk takes two more tests for the ruin.** The rim test takes a point every 12 units of arc
  and not 8 points, because 8 points on a rim of 77 units leave gaps of 60. The ground at the edge
  of the flat disc must stand within 0.25 units per unit of radius of the middle, so a disc of 55
  does not cut a terrace of 30 units into a hill. The wreck takes neither test, and its patch did
  not move: `placeDisc()` gives the wreck its old walk exactly, and the checksum proves it.
- **The whole disc stands inside the reach.** The plan says that `reachOf()` bounds the place. The
  walk bounds the middle by the reach less the disc with its soft edge, so the reader can walk round
  the ruin and not only to its middle.
- **The range measures to the edge of the ruin, and the needle points at its middle.** The plan
  asks the range to fall under 5 units "at its edge". A range to the middle stated 50 units at the
  doors of the hive. `SourceRuin.rangeFrom()` gives the distance to the convex outline of the parts
  on the ground, and `Ground._carrier()` and `carrierLevel()` in `app.js` take it when the body has
  it. The wreck has none, so it keeps the distance to its middle, and its numbers did not move.
- **A group asks the mask with its spread.** The plan keeps the anchors off the disc, as for the
  wreck. A herd of 14 spreads over 30 units, so an anchor off the disc still put members on it. The
  anchor test of `patchFauna()` now passes the spread as a third argument, and only the mask of the
  ruin reads it; the masks of the phenomenon and of the wreck take two arguments, so no patch of
  theirs moved.
- **A herd that wanders turns away from the disc.** The worker places the groups, and the leash lets
  a herd roam 60 to 200 units from its anchor, so a herd walked onto the ruin after some seconds.
  `GroundFauna` takes `keepOut`, the disc with its soft edge, and a walker turns away from it with
  its spread as it turns from the water. `GroundCover` takes the same `keepOut` in place of the disc
  of 14 it gave every source; the wreck keeps its 14. The wreck takes no `keepOut`, so its herds
  roam as they did.
- **The floor is stone as well as colour.** The paint moves the colour toward the rock of the
  palette, 0.35 of the way at the middle. The surface of each node also takes a share of bare rock
  up to 0.8, so the fine pattern of `ground-detail.js` draws the floor as stone and not as the
  ripples of the sand or the ridges of the snow around it.
- **The glow draws with the fog off,** as the lamp of the wreck does, so the reader sees it from out
  of the mist. The body takes the fog.
- **The clock of the glow.** `music.barClock()` runs over one period of the motif of the wreck, and
  the glow blinks at half the speed. `SourceRuin._clock()` counts the wraps of that clock and moves
  to the other half of its own period at each one. `ruinRhythm(world)` in `ground-source.js` is the
  one function p2-44 swaps; it gives `motifOf(world)` with `stepDur`, `barSeconds`, and `period`
  doubled.
- **The slabs lift on the CPU.** `weld()` keeps no mark of the parts of the orbit, so
  `SourceRuin` finds them again from the triangles that share a corner: 9 slabs and 2 rings. Each
  frame writes the lift into the positions of the orbit, 1,476 vertices, in 0.004 ms. A lift in the
  vertex shader would need a depth material for the shadow.
- **The tap takes a grace of the size of the ruin.** `WRECK_GRACE` of 20 units let the ground of
  the mouth of the well, which the ray meets over the hole, win the tap over the far wall of the
  shaft. `SourceRuin.grace` is the height of the body or the depth of the shaft plus 10, and
  `_onUp()` reads it when the body states one.
- **The terrain discards a little more than the mouth,** the radius plus 0.2 units. The mouth of the
  shaft is a polygon of 18 sides inside the circle of 13, and the rim of the well covers the band
  from the polygon to the circle from above, so no skin shows at the corners.
- **The button of the ruin opens nothing yet.** It reads "Study the ruin", and its click calls
  `inspectRuin()` in `app.js`, which is empty until p2-42 builds the card. `inspectSource()` now
  opens only on the wreck, so the log of the wreck never opens on the cell of the ruin.
- **The motif on the cell of the ruin.** p2-38 kept the ruin silent because nothing stood on its
  cell. With the body there, `carrierLevel()` finds a body of the kind of the source that runs in
  chapter 2, so the level rises as the reader walks in. Until p2-44 gives the ruin a bus of its own,
  that level opens the bus of the motif of the wreck.
- **The camp hook for p2-43.** `patchRuin()` draws the angle, the distance, and the yaw of the ruin
  from `makeRng(pseed + '|ruin')`, three numbers, and then calls `ruinCamp(ctx, ruin, rng, at, s)`,
  which gives null now and draws nothing. p2-43 fills `ruinCamp()`: it draws the place of the camp
  from `rng`, after the yaw and in its own order, and gives back `{ info, blocked(x, z, pad) }`.
  `patchRuin()` then puts `info` on `patch.source.camp` and adds `blocked` to the mask of the
  plants and the groups. `at` holds the middle, its height, the yaw, and the radii of the flat disc
  and of the soft edge, and `ruin.dir` with `world.source.dir` gives the side the crew came from.
  Nothing else draws from that stream, so the camp moves no other patch, and the place of the ruin
  holds whatever the camp draws.

### The results

- All eight checks pass. `node tools/world-checksum.mjs --check` matches the baseline with no change.
  `node tools/ruin-check.mjs` part 5 built 70 patches of the ruin, 8 of them on HIGH and 8 again
  after another world, every proto among them: every disc flat to 0 units, the nearest plant 0.0
  units and the nearest group 1.1 units outside the soft edge, at least 194 units of the reach to
  spare, and the body at most 0.52 units past the flat disc.
- **One seed per proto,** landed in the browser on HIGH with `?ruin`, tuned so the needle reads the
  ruin, over the six world types:

  | Proto | Seed | Type |
  |---|---|---|
  | spires | `p241-5` | ice |
  | dome | `p241-10` | desert |
  | arches | `p241-v` | ocean |
  | well | `p241-21` | lava |
  | floaters | `p241-9` | exotic |
  | colossus | `p241-24` | ice |
  | ring | `p241-8` | lava |
  | hive | `p241-t` | terran |

  Each ruin stands on its disc and neither floats nor sinks, and no plant, blade, stone, or herd
  stands on the disc. From four camera azimuths, with the view turned 70 degrees off the ruin, the
  needle read 70 degrees each time, the true way to the middle of the ruin. Walked in from four
  more azimuths, the range read 4.0 to 4.5 units at the edge of the stones. The well shows its
  shaft, its steps, and its lit floor from above and from an oblique camera, with no skin over the
  mouth. The tap on the hive marked it with the ring on the edge of the disc.
- **Frame time,** on HIGH at the reveal camera in a hidden pane, 100 renders with a read of one
  pixel, eight rounds interleaved with the group of the ruin hidden: the hive 7.71 against 7.88 ms,
  the well 7.36 against 7.41 ms, the spires 7.77 against 7.82 ms, and the floaters 8.60 against
  8.61 ms. The ruin adds nothing the measure can see; the noise is about 0.15 ms. The discard of the
  well against the same program with no discard: +0.09 ms on the medians, -0.01 ms on the paired
  mean.
- **Memory.** `renderer.info.memory` of the orbit of `p241-21` read 16 geometries and 10 textures
  before a landing on the well and 16 and 10 after the recall.

### Open

- **The button of the ruin opens nothing** until p2-42.
- **The glow blinks a borrowed rhythm,** and the ruin sounds the motif of the wreck on its cell,
  until p2-44.
- **A texture stays after a landing with a low camera.** After a landing where the camera went
  low enough to draw the near plants and the shadow, `renderer.info.memory.textures` stands one
  higher after the recall, on the cell of the ruin and on a plain cell alike, and on main as well.
  It is older than this issue, and it is not the shadow map of the sun.
- **The floating button was not seen.** The pane was hidden, so the frame loop that writes the
  label did not run. The mark, the ring, and the flag of the app were read; the label follows from
  `updateCreatureFloat()`.
