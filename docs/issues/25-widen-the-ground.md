# 25 The ground is penned in, so the reader walks a fifth of what the patch draws

Status: CLOSED, 2026-09-12.

Type: AFK. Phase 2. Blocked by: 20, 23. Read `docs/issues/README.md` first.

## The defect

The ground drew a box of 1,500 units and let the reader walk a disc of 900. `Ground.update()`
clamped the camera target to `FOG_NEAR`, 450 units from the site, so the reader moved over 28% of
the area the patch built. Issue 23 gave the reader legs, and the legs met a wall well inside the
world.

The 450 was not a terrain limit. Issue 18 carries the terrain past the box on the rim, and the
patch fades its knolls and its rock into it, so nothing reads at the join. The plants were the
limit. `FLORA_EDGE` in `worker.js` thinned them to nothing over the last 300 units of the box, so
dense flora ended at a square of half width 450 — exactly the clamp. The clamp was the right number
for the wrong reason: it was written as a fog rule and it was really a plant rule.

## What to build

Two steps, each measured on its own.

1. **Push the plants out and raise the clamp.** Cut `FLORA_EDGE` to 100 and take the clamp to the
   new edge of the dense square. About 2.1 times the walkable area, no new architecture.
2. **Enlarge the box.** `PATCH_SIZE` 1500 to 3000, the clamp to 1,400, `TARGET_RELIEF` in step with
   the size, and a new `RIM`. About 4.6 times the area of step 1 again.

## Acceptance criteria

- [x] **Step 1, the frame holds.** `Aurora@18.91,129.00`, 1470x835 at dpr 2, 60 Hz, walking and
      turning for 300 frames. Eye level: mean 16.67 ms, p95 18.4, max 18.7, none over 20 ms.
      Ceiling: 16.66, 18.2, 18.7, none over 20. Frame work 2.36 to 2.40 ms against 2.01 to 2.13
      before. The same walk before the change gave the same intervals, so nothing was spent.
- [x] **Step 1, the plants are dense at the clamp.** Plants per 10,000 square units in a disc of
      radius 90: site 114.4; at the four limits 89.2 north, 72.3 south, 94.7 east, 133.6 west. The
      spread is the community field of issue 21 and not the fade: the same measure at the old clamp
      of 450 gave 84.1 to 170.6. Past the clamp the fade does its work — 53.1 at 700, 24.4 at 750,
      and 1.2 at 800, which is the rim.
- [x] **Step 1, no edge and no ring from the ceiling.** Checked at the four limits, looking out, at
      both ends of the tilt band the controls allow, 1.04 and 1.16 rad. The forest runs to the
      horizon and fades into the fog in every one.
- [x] **Step 1, the walk stops where it should.** A run from the site north stopped at r = 646.8
      against a reach of 650, tapered by `WALK_EDGE`.
- [x] **Step 2, the frame holds at the new clamp.** Same cell and same machine, knob free, 300
      frames walking and turning. Eye level: mean 16.66 ms, p95 18.0, max 18.7, none over 20 ms.
      Ceiling: 16.67, 18.2, 18.6, none over 20. The knob settled at its ceiling of 220 and did not
      ring.
- [x] **Step 2, the plants are dense at the clamp.** Site 117.9. At the four limits of 1,400:
      98.2 north, 113.2 south, 51.5 east, 100.2 west; on the diagonals 121.4 and 135.6. Past it,
      55.4 at 1,450, 19.3 at 1,500, and 0 at 1,600.
- [x] **Step 2, no edge and no ring from the ceiling.** Checked at the limits, looking out, at both
      ends of the tilt band. The walk stopped at r = 1393.1 against a reach of 1,400.
- [x] **Step 2, the worker and the main thread are reported.** Worker patch 1,072 to 1,216 ms
      against 219 ms, on 1501x1501 against 751x751. The peak main-thread block of a landing is one
      frame of 233.3 ms, and the second longest gap of the same landing is 17.7 ms, so the cost is
      the mesh build and nothing else. `ground mesh built in 185 ms` against 78 ms.
- [x] **Step 2, the height field is reported.** 8.59 MB of Float32 against 2.15 MB on HIGH. LOW
      keeps the small box and holds at 0.54 MB.
- [x] **Step 2, the relief did not flatten.** `metresAcross` fell from 38 to 19 and `metresUp` fell
      from 7.0 to 3.5, so the vertical exaggeration K / V holds at 5.43 exactly. The same seed and
      site from the ceiling, before and after, show the same gradient and the same rhythm of hills.
- [x] **Step 2, the overlay does not sit dead.** Through the 1,072 ms build the message ran
      "Raising the ground", "Growing the plants", "Almost there", and cleared.
- [x] **Step 2, LOW is unharmed.** Forced LOW gives half 750, reach 650, 376x376, grid 4, and
      0.54 MB — the patch of issue 20 with the wider walk of step 1.

## What was built

**The reach split from the fog.** `FOG_NEAR` did two jobs. It set the clamp on the target, and it
set the depth of the fog fade, because `update()` holds the ratio `FOG_NEAR / FOG_FAR` as the fog
opens with height. Raising the one number to 650 raised both. The fade at the ceiling then fell
from 530 units to 176, and the far ground read as a hard khaki band with a straight edge against
the sky. The two are now separate: the fog keeps 450, and the reach is its own rule.

**The reach is a rule and not a number.** `ground.js` computes it as `half - floraEdge` from the
patch it was given, and `worker.js` reports its own `FLORA_EDGE` with the patch. The two tiers draw
different boxes, so one constant would be wrong for one of them, and a mirrored constant would
drift. The reader stops exactly where the plants begin to thin.

**The box is per tier.** `Q.ground.size` is 3,000 on HIGH and 1,500 on LOW. `app.js` used to send a
hard-coded `size: 1500` beside `PATCH_SIZE` in `ground.js`; the two could have drifted apart and
nothing would have said so.

**The LOD ceiling fell from 400 to 220 on HIGH.** This is the one cost the issue did not predict,
and it is the interesting one. See the decisions below.

## Decisions taken for the reader

1. **The fog keeps 450 and the reach is its own number.** Measured, not assumed: at the ceiling the
   fade band is 530 units wide at 450 and 176 units wide at 650, and the narrow one shows the far
   ground as a band with an edge.
2. **The clamp stands on the line where the plants thin, and does not stop short of it.** Step 1
   proved the reader may stand there: the plant count at the four limits matched the site inside
   the spread of the community field. A margin would cost walking distance and buy nothing.
3. **LOW keeps the box of 1,500.** The terrain build is O(area) and the plants are O(area). A box
   of 3,000 on a phone is four times the work and four times the plants for the weakest machine in
   the set. LOW takes step 1 only, which already gives it 2.1 times the ground it had.
4. **`TARGET_RELIEF` doubled with the size.** The relief a patch shows is `TARGET_RELIEF` units
   from its lowest point to its highest, whatever the cell holds, because `V` divides the true
   relief down to it. The gradient the reader walks is therefore `TARGET_RELIEF / size`, and it
   must move with the size or a wider box gives a flatter world per step.
5. **`RIM` grew from 3,150 to 4,000.** The old value was derived from a reach of 450. A reach of
   1,400 puts the camera 2,548 units from the site at the ceiling, and it sees 1,227 units past
   that, so the ground must run to 3,775. 4,000 keeps 225 units of margin and lands on a whole rim
   cell. `RIM_CELL` of 25 survives at size 3000 on both tiers: 3000 / 50 is 60 and 3000 / 100 is 30.
6. **The sea `REACH` did not move.** It is measured from the camera target and not from the site,
   so it follows the reader and the wider box does not reach it.
7. **The LOD ceiling fell from 400 to 220 on HIGH.** A wider box puts the reader inside the forest
   instead of near the edge of it. At half 750 the sphere of the knob, 900 units, was clipped by
   the patch; at half 1500 it fills. Measured at the same view, the same density, and the same
   knob, step 2 drew 6,914 plants as meshes where step 1 drew 3,227, and the frame fell to 45 fps.
   The fix costs nothing to the eye, because issue 22 gives every plant a floor under its own swap
   distance: a plant turns into a card only once the card is no longer a magnified picture. Two
   frames at knob 400 and knob 200 are the same picture at 3,655k and 2,415k triangles. The knob
   had been paying for meshes that a card already drew correctly.
8. **The flora caps rose to 120,000 on HIGH and 8,400 on LOW.** The cap must not thin the forest,
   because a cap spread over four times the area is a forest a quarter as dense. The densest cell
   measured grows 98,660 plants at size 3000 and 23,004 at 1,500.
9. **The flora walk was never the thing to fear.** The issue budgeted 38 ns per plant. It is 4.6 to
   11 ns, because the cut at `FOG_FAR * 1.2` rejects a far plant on one distance test, and at size
   3000 most plants are far. 98,660 plants walk in 0.45 ms. No spatial grid was needed and none was
   written.

## How it was verified

Served on `127.0.0.1:8777`, Chrome, `document.visibilityState === "visible"` checked before every
run, `?perf=1` on, `myworlds.lod.v1` cleared between runs. Sources forced fresh with
`location.reload(true)`.

The cell is `Aurora@18.91,129.00`, found with the aim of issue 20 over the densest woodland the
globe showed. It grows more plants than any other cell tried, so it is the worst case for the flora
work. `Auralis@-38.00,18.00`, the flat inland cell of issue 20, carried the early baseline.

Every before-and-after pair ran within a few minutes of the other on an otherwise idle machine, by
copying the three files aside and checking the tree out at the previous commit, so the two builds
saw the same load.

The head room test wraps `ground.render` and calls it K times per frame. It only means anything
with the knob frozen: the first run let the knob work, it stepped down inside the K=3 sample, and
K=4 then read as faster than K=3.

## Left for later

- `CHUNKS` is 10, so the fine terrain splits into 10 by 10 meshes whatever the size. At 3,000 units
  a chunk is 300 units wide against 150 before, so the frustum cull of the branch this built on is
  half as sharp. It did not bind here, because at eye level the terrain draws about 104k triangles
  and the plants set the cost. It would be worth scaling `CHUNKS` with the size.
- The knob ceiling of 400 was too high on HIGH before this issue as well, by the same argument. It
  cost nothing visible then either. A pass over `LOD_MAX` and the per-kind `style.lod` against the
  card floor of issue 22 would probably find more.
- `PATCH_SIZE` does not say how much of the planet the patch covers. `span` does, and it is
  `cellSpan(world)`, about 57 km, fixed per world. Doubling the size draws the same cell at 19 m to
  the unit instead of 38. The reader walks twice as far in metres over the same ground. A reader
  who wants to see more of the planet needs a second probe, not a wider box.
