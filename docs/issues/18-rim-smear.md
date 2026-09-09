# 18 The rim smears the patch edge into streaks

Status: CLOSED, 2026-09-09, merged as PENDING.

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

## What was built

The worker now returns a second grid, the rim, beside the patch. It reads the same globe field and
the same hill noise the patch reads, so the relief and the coast run on across the join. It reaches
3,150 units from the site, which is past the fog, and `ground.js` draws it as one mesh with the
material of the terrain. See "The rim" in `docs/issues/README.md` for the contract and "The rim
carries the ground past the fog" in `docs/probe.md` for the reasoning.

## Decisions taken for the reader

Issue 19 landed first and moved the ground under this issue, so every number here is a decision.

1. **The rim is a count of units, not a part of the span.** The fog, the camera ceiling, and the
   pan limit all measure in box units, so the rim must too. The reach follows from them: at the
   ceiling the camera stands at most `FOG_NEAR + CEILING * tan(POLAR_HIGH + POLAR_BAND)`, about
   1,420 units, from the site; the fog is solid at `FOG_MAX` of 2,100 units; a ray from 1,200 units
   up meets the ground `sqrt(FOG_MAX^2 - CEILING^2)`, about 1,723 units, out. So the ground must run
   to about 3,143 units, and `RIM` is 3,150. The old rim of 1,500 units was under half of that.
2. **`FOG_MAX` stays at 2,100.** Item 5 of the issue offered either a lower `FOG_MAX` or a fade of
   the last ring row. Neither is needed: the rim now reaches past the fog, so the outer edge is
   already solid fog colour, which is the colour of the dome at the horizon. A lower `FOG_MAX` would
   undo issue 06, because at the ceiling the camera stands about 1,543 units from its own target
   and a fog solid at 1,500 would paint the target itself flat.
3. **The rim is a second grid from the worker, not a wider sampling of `FIELD_N`.** The issue asked
   to widen the 65 by 65 field sampling instead of adding data. The field grid was widened in
   spirit but not in place: the rim covers about 18 times the area of the cell, so one grid at the
   density of the patch would need about 77,000 reads of `fieldAt`, and one read costs about 1.4 us.
   That is over 100 ms on a build of 115 ms. The rim therefore keeps its own field grid at one
   sample per two rim cells, which is 64 by 64 on HIGH and 32 by 32 on LOW. No second message was
   added: the rim rides on the `patch-done` reply.
4. **The rim uses the same `hPerU`.** Its field values divide by the same `V` the patch uses, so the
   two surfaces meet at the join instead of standing over or under one another.
5. **A rim cell is 25 patch steps.** That is 50 units on HIGH and 100 on LOW, and it divides the
   box, so the edge of the patch lands on a rim grid line and every rim node there sits on a patch
   vertex. The tier therefore scales the rim as it scales everything else.
6. **The patch fades its knolls and its rock over its last two rim cells.** Both waves are shorter
   than one rim cell, so the rim cannot carry them. Without the fade the patch ended on a texture
   line the reader could see from the ceiling, and the stitch strip combed that fine detail into
   50 unit streaks. The band is 100 units of a 1,500 unit box, at the far edge, where the fog is
   already 18% closed at the ceiling and solid at ground level.
7. **The sea reaches 2,700 units from the camera target, up from 1,128.** That is the camera offset
   at the ceiling, about 970 units, plus the 1,723 units a ray reaches, so the water fills the fog
   from anywhere the camera stands. It also stays inside the rim, so no water shows past the
   ground. A patch with no water now gets a sea when the rim holds water, because a cell often ends
   at a coast. `Sea.open` now needs `patch.hasSea` as well, so a land site with a coast out in the
   rim does not tint the fog with the ocean colour.
8. **The contract changed.** `opts.rim` was added to the patch message, and `patch.rim`,
   `rimHeights`, and `rimColors` to the reply. `docs/issues/README.md` carries both.

## Acceptance criteria

- [x] At the 1,200 m ceiling, no straight line runs out of the patch edge, and no square edge is
      visible against the sky or the sea. Measured at `#Auralis@1.27,12.30` from the ceiling, looking
      south, west, north, and east: the ground fills the frame and fades into the fog in every
      direction. The same view with the rim mesh hidden shows the old defect, a floating trapezoid
      of ground with two straight edges against the sea.
- [x] Looking straight down from the ceiling, the ground outside the patch carries relief that
      follows the relief inside it. The coast crosses the join without a step, and the fine detail
      of the patch fades into the rim over 100 units instead of ending on a line.
- [x] At a coastal site the shoreline runs to the fog and does not end in a straight cut. Checked
      at `#Auralis@1.27,12.30`, the site of the evidence, from the reveal at 800 units up and from
      the ceiling.
- [x] No crack, no hole, and no z-fight at the join between the fine patch and the outer ring.
      Measured, not judged by eye: over every rim node on the edge of the patch the height differs
      from the patch height by 0, and over all 751 vertices of a strip the height read on the first
      coarse line differs from the chord of the coarse cell by 0. Both hold on HIGH and on LOW. One
      mesh draws the rim, so nothing overlaps the patch and nothing can z-fight.
- [x] Frame time at the ceiling does not grow by more than 1 ms, on HIGH and on LOW. Read from
      `perf.avgWork` over 3 s, with the rim mesh drawn and hidden in turn in the same session.
      HIGH: ceiling 1.87 ms with the rim and 2.12 ms without, entry 2.26 with and 2.07 without, eye
      level 1.70 and 1.73 with and 1.81 without. LOW: ceiling 2.26 with and 2.52 without, eye level
      1.88 with and 1.79 without. Every reading sits inside the spread of the pair, so the rim adds
      well under 1 ms. `perf.avg`, the interval, held at 16.63 to 16.71 ms in all twelve runs, which
      is the 60 Hz refresh. The rim adds one draw call and 35,712 triangles to 1.37 M on HIGH, and
      10,368 to 499 k on LOW.
- [x] The patch build time grows by less than 10%. Measured in one worker, with the rim on and off
      in turn, 12 runs each: HIGH 118.6 ms with and 113.0 ms without, 5.0%; LOW 42.9 ms with and
      39.8 ms without, 7.8%. A second pair of runs gave 7.2% and 7.3%. The rim itself costs 6.4 ms
      on HIGH and 1.9 ms on LOW.

## How it was verified

For most of the work the display was locked, so the tab stayed hidden and `requestAnimationFrame`
never ran. A test-only wrapper on `requestAnimationFrame` collected the callbacks and a console loop
called them, which walked the dive to the ground and let the camera be posed. Every view in the
criteria above was rendered that way, read back from the canvas, and looked at. The wrapper was
removed before the commit.

The frame times in criterion 5 were taken later, with the tab in front and the loop running on its
own, so `perf.avg` and `perf.avgWork` are the app's own numbers and not a hand-driven loop.

The patch build was measured inside one worker, which built the patch with the rim and without it
in turn, so no drift between two page loads can enter the number.

Determinism: two builds of the same site return byte-identical `heights`, `colors`, `rimHeights`,
and `rimColors`. Two worlds were checked, the terran `Auralis` and the ice world `seed58`, and both
tiers, HIGH with a 2 unit grid and LOW with a 4 unit grid.

## Left for later

The shore of a wide cell draws a regular saw-tooth cliff where the ground drops under the water
line. It comes from the vertical scale of issue 19 and it shows with the rim hidden as well, so it
is not part of this issue. It is worth its own defect.

## Evidence

Top down from 1,850 m with the fog turned off, at `#Auralis@1.27,12.30`: the radiating stripes
in the lower left corner are the rim, and the two straight diagonals in the sea are the edge of
the patch and the edge of the rim.

## Blocked by

- 04 Patch terrain from the worker
- 05 Ground sea and shoreline
