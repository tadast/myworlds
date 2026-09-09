# 10 Far fauna coarse mesh

Status: CLOSED, 2026-09-09, merged as be45f37.

Type: AFK. Phase 1. Blocked by: 09. Read `docs/issues/README.md` first, in particular "LOD".

## What to build

A cheap version of each creature for distance, so 300 animals do not cost 300 full rigs.

1. **Coarse geometry.** Add a `detail` argument to `buildCreature()` with values `'full'` and `'coarse'`. Coarse drops extras except sails and plates, uses the lowest segment counts for every primitive, merges legs to a single segment with no knee, and keeps the rig records so the same shader animates it. Target under 80 triangles per creature.
2. **Partition.** As issue 07 does for flora: two `InstancedMesh` per species, near and far, split by distance to the camera against `ground.lod.distance` with 10% hysteresis. The far mesh casts no shadow.
3. **Rig at distance.** The coarse mesh runs the same vertex shader. Halve the amplitude of the leg swing in the coarse rig records so the silhouette does not shimmer at small pixel sizes.

## Acceptance criteria

- [x] From the ceiling all creatures render as coarse meshes and still move and animate. Descending to a group swaps them to full meshes without a visible pop at normal zoom speeds.
- [x] Triangle count per coarse creature is under 80. Log the counts per species at build.
- [x] Frame time at the ceiling on a site with 300 creatures and a forest is under 10 ms on HIGH.
- [x] The inspector still opens from a click on a far creature.
- [x] `docs/fauna.md` "Ground tier" describes the two detail levels.

## Decisions

**The coarse build also drops the head furniture and the eyes.** Item 1 lists the extras, the segment
counts, and the legs. The agent went one step further, because those parts measure a fraction of a
metre and the hexapod chain needed the room to stay under 80 triangles. Recorded in `docs/fauna.md`.

**Verified beyond the criterion.** The triangle cap was checked offline over 1,012 distinct builds,
600 seeds by 7 world types: 16 to 70 triangles, none at or over 80. The full build is bit-identical
to the build before this issue over 601 creatures and every attribute, so the globe and the
inspector card cannot have moved.

## Blocked by

- 09 Ground fauna in groups
