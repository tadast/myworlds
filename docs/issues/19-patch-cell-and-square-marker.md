# 19 The patch cell and the square marker

Status: CLOSED, 2026-09-09, merged as PENDING.

Type: AFK. Phase 2. Blocked by: 02, 04, 05. Read `docs/issues/README.md` first.

## The defect

The reader cannot choose the ground the probe brings back.

The marker was a ring of 0.023 globe units, which is 338 km across on a 7,352 km planet. The
patch was 1,500 m. So the ring covered about 50,000 times the area of the ground it stood for,
and water inside the ring said nothing about water inside the patch. A sweep of 594 sites on a
10 degree grid of Auralis found no patch at all that held both land and sea: a window 1,500 m
wide must fall within 750 m of the waterline.

## What was built

1. **The cell.** `CELL = 0.01` globe units of arc in `site.js`. The reader picks a square of that
   size and the whole square becomes the ground.
2. **The snap.** `snapSite()` puts the site on the cell grid: latitude to steps of `CELL`, and
   longitude to a step that keeps the cell square in metres. It is idempotent and it keeps the
   species id of the pull.
3. **The square marker.** Eight vertices and eight triangles draw the outline of the cell. Each
   vertex takes the ground radius under it, so the square follows the relief instead of floating
   over a hill. The old ring floated 0.005 units, which is 37 km, and at the 54 degree view tilt
   of `CAM_MIN` that would have thrown a 62 px square off its ground by 25 px.
4. **The span.** `patch` takes `opts.span`, the metres of the globe the cell covers. `K` is the
   metres across one unit of the box; `V` is the metres up one unit.
5. **The field per cell.** The globe field is read on a grid of 65 by 65 across the cell and
   interpolated. The height, the temperature, the moisture, and the forest mask all bend with it.
6. **The pull.** The pull to life reaches half a cell instead of 3,000 m, and it runs before the
   snap, so a creature that lives in the cell claims the patch.

## Decisions taken without the reader

- **The cell is 0.01 globe units, not the true patch footprint.** A patch of 1,500 true metres is
  1.8 px at `CAM_MIN`: 670 km of surface fall on 787 px there. Snapping alone would have given a
  reproducible cell that the reader still could not see or aim at. 0.01 units is about 62 px, and
  it is near the limit of what the globe can honestly show: the icosphere at detail 100 puts
  about 0.011 units between two vertices, so a smaller square would sit inside one facet and the
  coast the reader aims at would not be where the field puts it.
- **The scale of the ground box is artificial, and the vertical scale is not the horizontal one.**
  A uniform squeeze by `K` would drown the coast: on Auralis a cell holds about 660 m of globe
  relief, which at `K = 49` is 13 units, while the metre-scale hills of the patch are 25 units.
  The large shape would sit under its own texture. So `V` is set from the relief of the cell,
  `V = max(1, relief / TARGET_RELIEF)` with `TARGET_RELIEF = 120` units. Every patch then shows
  about 120 units of large-scale shape with the hills as the texture on it, and a cell flatter
  than that keeps true height. Measured: a 20 km cell and a 73.5 km cell at the same site both
  come back with 130 units of relief.
- **A plant and a creature keep their lore size in units.** They read as normal against the ground
  and against each other, which is what the reader asked for, and they are no longer the metres
  the lore text says. `docs/fauna.md` says so.
- **The field grid is 65 by 65, not per cell.** A read per cell is 564,000 calls to `fieldAt`,
  which is five times the work the whole globe does. 65 by 65 is 4,225 calls, about 1% of the
  globe, and 1.1 km per sample on a 73.5 km cell. The globe field holds nothing below about
  50 km, so the interpolation loses nothing.
- **The temperature and the moisture bend with the field.** They used to be read once at the site.
  Over a cell tens of kilometres wide that is wrong, and it was cheap to fix: `patchNiches` now
  finds several niches in one cell, so a patch holds three species where it used to hold one.
- **A patch with no `span` keeps one unit to one metre.** The old path is the default, and it is
  byte-identical: the same site returns the same biome, the same elevation, the same 20,000
  plants, and the same 17 groups.
- **The lapse rate folds into the per-cell temperature.** It used to compare the ground height
  against the site elevation. Over a wide cell the site is the wrong reference, so the comparison
  is now against the globe height at that cell.

## Acceptance criteria

- [x] The marker is a square, it snaps to the cell grid, and the snap is idempotent and keeps the
      pulled species.
- [x] The square follows the relief: each corner sits at the ground radius under it.
- [x] A patch built with no `span` returns exactly what it returned before: `Auralis@0.11,12.30`
      gives biome `grass`, elevation 1,355 m, 20,000 plants, and 17 groups of meadow and air.
- [x] A cell that crosses a coast returns `shore: true` and draws water. Four latitudes on the
      12.30 meridian return 7.7%, 25.4%, 50.4%, and 75.4% sea cells.
- [x] A coastal cell holds more than one species: `Auralis@1.15,12.03` returns meadow, beach, and
      air where the 1,500 m patch returned one.
- [x] No console error on the globe, on the descent, or on the ground.
- [x] The globe is untouched: `Auralis` still builds flora 7,788 and fauna 160.
- [x] Frame time holds. Globe at `CAM_MIN` 1.8 ms of frame work. Ground at the entry camera
      1.87 ms and at eye level 1.71 ms, with the interval at 16.7 ms and the adaptive LOD walked
      out to its 400 m ceiling.
- [x] The patch build is not slower: 182 ms in the browser for a 751 by 751 grid.

## Not in scope

The rim still smears the edge of the box outward; that is issue 18, and a wide cell makes it more
visible because the box now ends at a coast more often.

## Blocked by

- 02 Site in the URL and the pull to life
- 04 Patch terrain from the worker
- 05 Ground sea and shoreline
