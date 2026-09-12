# 27 The flora of a wet world is one continuous thicket, and the ground holds no landmark

Status: CLOSED, 2026-09-12.

Type: HITL. Phase 2. Blocked by: 21, 25, 26. Read `docs/issues/README.md` first.

## The defect

Reported from use:

> Reduce the vegetation density in worlds that are currently very dense, draw them in dense clusters
> instead, but never continuously thick. Also do 1 or 2 mega flora samples in each square where it
> makes sense.

**The chance of a plant saturates.** A world type carries a density of its own. Terran holds 2.0,
ocean 1.6, and exotic 1.4, and a community multiplies that by 0.45 to 1.5. The scan then tested
`rng() >= FLORA_FLOOR + (lush - FLORA_FLOOR) * smoothstep(-0.35, 0.35, mask)`, so a lush over 1 held
the chance at 1 over most of the range of the mask. Nearly every land cell of the grid took a plant,
and the reader walked through a wall of trunks with no glade and no line of sight.

Measured on `Aurora@18.91,129.00`, in bins of 24 units over the middle 2.4 km of the box. A bin
holds 16 cells, so 16 is solid ground cover. The median bin held 9 plants and the 99th percentile
held 15. The spread is narrow, which is the number that says "continuous": the ground was equally
thick nearly everywhere, not thick in some places and open in others.

**The box holds one to three landmarks.** The colossus pass of issue 21 seats one to three bodies in
the whole patch. Issue 25 took the box to 3,000 units, and the reader sees about 900 of it, so most
of a walk crosses ground with nothing on it to steer by.

## What was built

**The excess density now buys contrast instead of more plants.** A ceiling holds the chance short of
solid, and a thicket field keeps its crests full and gives up its troughs. The depth of the shaping
follows the lush of the community, so a dry world does not change at all and a wet one gathers into
stands and glades.

**Every square of 400 units seats one or two mega plants.** A mega plant is a plant of the community
that owns the ground, grown two to three and a half times past the top of the range of its kind and
held between 22 and 58 units. It stands over the canopy and under the colossus, which starts at 70,
so the three steps of scale still read: canopy, mega, colossus. It sits at the crest of the thicket
field, so a stand carries the landmark and the glades stay open.

Both new things draw from streams of their own, keyed off the patch seed. A change to either cannot
move a plant the scan already placed, so a patch keeps the communities, the kinds, and the sizes it
grew before this issue. `describePatchFlora()` states the same rule for the lore.

## Acceptance criteria

- [x] **A dense world thins, and thins where it was thickest.** `Aurora@18.91,129.00`, plants in the
      patch 98,660 to 48,805. In bins of 24 units over the middle 2.4 km: median 9 to 2, mean 6.62
      to 3.30, empty bins 12.5% to 21.9%.
- [x] **The stands stay dense.** On `Quasar-579@48.13,60.09` the 99th percentile bin went up, 12 to
      13 of 16 cells, while the median fell 9 to 4 and the mean 8.15 to 4.61. The thickest ground is
      as thick as it was; the even carpet between the thickets is gone. On Aurora the 99th
      percentile fell 15 to 12, because the ceiling binds hardest on the wettest world.
- [x] **No ground is continuously thick.** `FLORA_CEIL` is 0.7, so the crest of a thicket fills at
      most 70% of the cell grid. Before this issue the crest filled 94%.
- [x] **A sparse world does not change.** `Glacier-77@-35.00,150.00`, an ice world, 21,180 plants to
      21,256. The difference is exactly the 76 mega plants of that patch. The scatter is untouched,
      because `lush` there is at most 0.27 and the shaping starts at 0.5.
- [x] **The landmarks arrive.** 83 mega plants on Quasar-579, 83 on Aurora, 76 on Glacier-77, from
      64 squares. A square of water, of rock, or of open ground seats none.
- [x] **The frame holds.** `Quasar-579`, 300 frames walking and turning at eye level: mean 16.66 ms,
      p95 18.7, max 20.7, 1 over 20 ms. `Aurora`, the same walk: mean 16.67, p95 18.4, max 30.4,
      2 over 20 ms. Both at 60 fps.
- [x] **The reader sees further.** On Aurora the LOD knob had to fall to 209 m to hold the frame
      before this issue. It now holds 389 m on the same walk, with the same 2 frames of 300 over
      20 ms. Fewer plants in the box buy nearly twice the distance in solid geometry.
- [x] **The worker does not slow down.** `Glacier-77` patch time 652 ms to 669 ms, `Aurora` 682 ms to
      717 ms. The mega pass costs about 400 probes of the height field, which is under the drift of
      this machine.

## Decisions taken for the reader

1. **The ceiling is 0.7 and not 1.** A cell grid of 6 units at 0.7 still reads as a thicket from
      inside it, and it leaves the gaps that let the reader see through. At 1 the scan draws a wall.
2. **The shaping fades in with the density of the community, not of the world.** A patch of a wet
   world holds four to eight communities, and their densities run 0.45 to 1.5. The dense ones now
   gather into stands while the sparse ones keep the even scatter they always had, so one box shows
   both. A rule keyed to the world type could not do that.
3. **The thicket field is a field of its own.** The grove field of issue 21 was the obvious one to
   reuse, but it also picks the kind: the companion plant of a community lives in its low band. A
   shaping that emptied the low band would have deleted the companion from every dense world.
4. **`CLUST_WAVE` is 72 units.** A crest is then about 35 units across, which is a stand of eight to
   twelve plants: big enough to stand in, small enough that a walk crosses several of them.
5. **The mega plants sit on a grid of squares, not on a random scatter.** A scatter of the same count
   clusters and leaves gaps, so some ground still has no landmark. A grid of 400 units guarantees the
   reader meets one about every 400 units of walking, and the search inside each square is free to
   find the right seat or to give up.
6. **A mega plant is the local kind, not a new kind.** The reader has to read it as the same plant
   grown huge. A new geometry would read as a different species and would say nothing about the
   ground it stands on.
7. **58 units is the ceiling of a mega plant.** The colossus starts at 70. A mega plant that reached
   70 would take the scale reference away from the colossus, which is the one thing in the box that
   gives everything else its size.
8. **The new fields run off the patch seed, not off the main stream.** A patch keeps its
   communities, its kinds, and its sizes. This also makes the before and after of this issue a
   matched pair, which is what the screenshots below compare.
9. **The ground cover is left alone.** Grass is a texture of the ground and not a mass of
   vegetation, and it costs nothing the frame notices. The bare field of issue 21 already opens the
   ground under both.

## How it was verified

Served on `127.0.0.1:8777`, Chrome, `document.visibilityState === "visible"`, `?perf=1`,
`myworlds.lod.v1` cleared between runs. Every before and after pair ran within two minutes of the
other, on the same machine, at the same view, with the before taken from a stash of the same branch.

The distribution is the measurement that matters, not the count. A count alone cannot tell a world
that thinned everywhere from a world that gathered into stands. Bins of 24 units hold 16 cells of
the scan, so the bin histogram reads directly as ground cover: a narrow histogram is a carpet and a
wide one is a landscape.

The tab went hidden once during the run and every frame reading came back at 27 ms. `README.md`
warns about this and the warning is right.

## Left for later

- The ceiling is one number for every world. On the wettest world it binds hard enough to take the
  99th percentile bin from 15 to 12, which is a little more than this issue set out to do. A ceiling
  that followed the plant kind, so a field of puffs may stand thicker than a wood of pines, would be
  the better rule.
- The mega plants stand past the cap, as the arrangements and the colossus do. At 83 per patch they
  are a rounding error against `maxFlora`, but nothing enforces that, and a smaller `MEGA_CELL`
  would eat the budget of a LOW tier patch before anything warned about it.
- A mega plant may land inside an arrangement of issue 21, because only the colossus keeps it away.
  It reads well by accident, and it is not a decision anything took.
