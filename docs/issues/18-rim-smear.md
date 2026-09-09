# 18 The rim smears the patch edge into streaks

Type: AFK. Phase 2. Blocked by: 04, 05. Read `docs/issues/README.md` first.

## The defect

High over the patch the ground shows a square with straight lines dragged out of its sides.

`_buildTerrain()` in `ground.js` adds four bands out to `RIM = 1500` metres from the site. Every
vertex of a band takes its height and its colour from the nearest point on the edge of the patch:

```js
_edgeIndex(x, z) {
  const i = Math.min(n - 1, Math.max(0, Math.round((x + half) / g)));
  const j = Math.min(n - 1, Math.max(0, Math.round((z + half) / g)));
  return j * n + i;
}
```

The clamp is the whole defect. Outside the patch one edge cell paints a whole line of the band,
so the edge row extrudes outward as a streak. Along a side the streaks are parallel; at a corner
they fan out. The result reads as a square with combed hair.

The fog does not cover it. At the ceiling of 1,200 m the fog closes at
`FOG_FAR + FOG_LIFT * 1200 = 1350` metres, and the patch edge is at 750 metres. So 600 metres of
streaks sit inside the fog at the height the reader reaches most often. The band also holds the
sea flat, so a coastal site shows the shoreline cut off in a straight line at the patch edge.

## What to build

1. **Fill the rim from the field, not from the edge.** The globe height map is on the world
   already: `world.heightMap` at 384 by 192, which is about 120 km per texel on a 7,352 km
   planet. That is far too coarse for a 1,500 m rim. Ask the worker instead: extend the `patch`
   message with a coarse outer ring, or add a second message that returns a low-resolution grid
   over a 4,000 m square at, say, 32 m steps. The worker already has `fieldAt`; the ring costs
   about 1.5% of the cells of the fine patch.
2. **Keep one mesh and one material.** The ring is a second grid at a coarser step, drawn with
   the same `MeshLambertMaterial` and the same vertex colours. Add no draw call per band.
3. **Join the two grids.** The outer ring shares the boundary row with the fine patch, so no
   crack shows. A small step in the normal is acceptable; a hole is not.
4. **Carry the sea outward.** `ground-sea.js` already draws a plane. Make its extent match the
   new ring, so a coast runs out to the fog and does not stop in a straight line.
5. **Match the fog to the ring.** After the ring reaches 2,000 metres, `FOG_MAX` of 2,100 metres
   still lets the outer edge show at the ceiling. Either hold `FOG_MAX` under the ring radius or
   fade the last ring row into the fog colour.

## Alternative, if the worker round trip is too costly

Keep the extruded band but hide it: hold `FOG_MAX` at `FOG_FAR + (RIM - half) = 1500` metres so
the fog is solid before the streaks start. That costs no worker work and no geometry, and it
closes the view in at the ceiling. Take this only if item 1 measures over 1 ms.

## Acceptance criteria

- [ ] At the 1,200 m ceiling, no straight line runs out of the patch edge, and no square edge is
      visible against the sky or the sea.
- [ ] Looking straight down from the ceiling, the ground outside the patch carries relief that
      follows the relief inside it.
- [ ] At a coastal site the shoreline runs to the fog and does not end in a straight cut.
- [ ] No crack, no hole, and no z-fight at the join between the fine patch and the outer ring.
- [ ] Frame time at the ceiling does not grow by more than 1 ms, on HIGH and on LOW.
- [ ] The patch build time grows by less than 10%.

## Evidence

Top down from 1,850 m with the fog turned off, at `#Auralis@1.27,12.30`: the radiating stripes
in the lower left corner are the rim, and the two straight diagonals in the sea are the edge of
the patch and the edge of the rim.

## Blocked by

- 04 Patch terrain from the worker
- 05 Ground sea and shoreline
