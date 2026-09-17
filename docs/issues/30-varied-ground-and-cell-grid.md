# 30 The ground reads flat on a peak and on a plain, and no two cells share an edge

Status: CLOSED, 2026-09-17.

Type: AFK. Phase 2. Blocked by: 19, 25. Read `docs/issues/README.md` first.

## The defect

Two faults, one cause. Both sat in the way of a stream that joins one patch to the next.

**The ground held one shape.** A patch took the globe field over its cell, divided the relief down
to a fixed 240 units, and added three octaves of noise from the seed of the patch. Measured over
300 land cells of `Auralis`, the globe field inside a cell stands within 7% of a plane: its finest
octave runs at 36 turns over the sphere, so a cell of 60 km carries a third of one wave. What the
reader saw was therefore a tilted sheet with 25 m of smooth blobs on it, and the sheet was the same
height on a peak and on a plain, because the fixed 240 units erased the difference. A reader who
aimed at a mountain range landed on the same ground as a reader who aimed at a meadow.

**No two cells shared an edge.** A cell was a square of a band of latitude, and the step of
longitude changed at every band, so a cell in one band did not line up with a cell in the next. The
three noise octaves ran off the seed of the patch, so two patches side by side grew different
hills. Each patch also set its own vertical scale from the relief of its own cell, so the two sides
of a shared edge would not even have agreed on how tall a metre is.

## What to build

1. **A cell grid on the cube.** Six faces, `FACE_CELLS` by `FACE_CELLS` cells each, and the
   gnomonic coordinate warped through a tangent so a corner cell holds about the arc of a middle
   one. Cells tile the whole globe, they share their edges exactly, and the grid holds no pole. The
   worker lays the box of a patch on the quad of its cell, so the box is the cell.
2. **One vertical scale per world.** The highest land of the world stands `WORLD_RELIEF` units over
   the sea, and every patch of that world divides by the same number.
3. **A relief field under the globe field.** A ridged multifractal plus a fine stack, read at the
   direction on the sphere and nothing else, with its height set by how mountainous the globe is
   there. No seed of a patch enters it.

## Acceptance criteria

- [x] **A peak and a plain no longer read alike.** `Auralis`, five cells, box relief in units from
      the lowest vertex to the highest: a range 403, forested hills 309, tundra 204, lowland 101, a
      plain 51. Every patch held 240 before this issue. Nothing reaches the camera ceiling of 500.
- [x] **Two patches agree along the edge they share.** `Auralis` at 19.09,-162.28 and its east and
      its south neighbour, 751 vertices along each join. East: mean 0.00018 units, worst 0.00037.
      South: mean 0.00020, worst 0.00049. The edge stands about 1,000 units up, so the error is the
      rounding of a `Float32Array` and nothing else.
- [x] **The quads tile across a face boundary.** Face 4 cell (156, 70) and face 0 cell (0, 70):
      three points of the shared edge, taken from each side at the same parameter, stand
      1.6e-16 apart.
- [x] **The frame holds.** `Auralis@-6.49,157.22`, wide tier, 60 Hz display: 16.64 ms a frame, 1.38
      ms of frame work, the LOD knob settled at 394 of 400.
- [x] **The build still fits the dive.** Wide tier, 1,501 by 1,501: about 1.32 s against 0.77 s
      before, measured over three builds on one warm worker. The dive holds the screen until the
      reply lands and its floor is 1.2 s, so the reader waits about 120 ms longer than the floor.
      Narrow tier, 376 by 376: 412 ms.
- [x] **The rim still joins without a line.** `Auralis@-6.49,157.22` from the ceiling, looking out:
      the relief runs on past the box and fades into the fog. The rim carries the first
      `DETAIL_RIM_OCT` octaves, and the patch fades the rest out over its last two rim cells.
- [x] **A shore still reads.** `Auralis@13.08,126.11` holds sea and land, with the coast bending
      through the box and the hills running down to it.

## What it cost

The relief field reads nine octaves of noise a vertex where the old three octaves read three, so
the wide build went from about 0.77 s to about 1.32 s. Two savings paid part of that back: the map
from the box to the cell takes two tangents a row and not two a vertex, and it takes a square root
in place of `Math.hypot`.

## What is left

A stream would still have to resample across a boundary between two faces of the cube. The edge
curve is the same from both sides, but the two cells may not walk it in the same order, so the
index of a vertex on one side does not always name the same vertex on the other. Inside one face
the indices line up row for row.
