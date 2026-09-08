# 07 Ground flora with card impostors

Type: AFK. Phase 1. Blocked by: 04. Read `docs/issues/README.md` first, in particular "The patch protocol" and "LOD".

## What to build

Plants on the ground at metre scale, dense enough to be a forest, with two levels of detail. Put the rendering in `ground-flora.js` and call it from `ground.js`, so issue 09 can add `ground-fauna.js` in parallel.

1. **Placement in the worker.** Fill `flora` in the patch result. Use the globe flora rules per grid cell: the biome flora kinds of the world, the forest mask for clusters, the density factor of the world type. Jitter each plant inside its cell. Skip cells below sea level, on steep slopes, and within 3 m of another plant. Cap at `opts.maxFlora` by stride sampling like `packFauna`. Scale per plant is in metres: trees 6 to 14 m, pines 8 to 18 m, palms 7 to 12 m, cactus 2 to 5 m, crystals 1.5 to 6 m, mushrooms 1 to 3 m, boulders 1 to 4 m. Rock and boulders may sit on slopes.
2. **Near mesh.** Reuse `floraGeometry()` from `app.js`. Move it into a shared module, `flora-geometry.js`, and import it from both places. One `InstancedMesh` per kind for near plants.
3. **Far cards.** At patch load, bake one card per kind and palette: render the near mesh once with an orthographic camera into a small render target, 64 by 64 pixels, with the flat colours and the sun light, and use that as a texture on a two-triangle vertical quad. One `InstancedMesh` per kind for far plants, with the quad turned toward the camera in the vertex shader around the y axis only. Alpha test, no blending, so the cards write depth and sort correctly with the terrain.
4. **Partition.** Each frame, walk all plants and write near ones to the near mesh and far ones to the card mesh by distance to the camera against `ground.lod.distance`, with a 10% hysteresis band so a plant does not flicker at the boundary. Set `instanceCount` on both. The walk must stay under 0.5 ms for 20,000 plants: keep positions in a flat typed array, precompute the instance matrices once, and only copy matrices.
5. **Shadows.** Near meshes cast shadows on HIGH. Cards do not.
6. **Fixed distance.** `ground.lod.distance` is 150 m in this issue. Issue 11 makes it adaptive.

## Acceptance criteria

- [ ] A forest site on a terran world shows a dense forest to the fog. Trees near the camera are full meshes, trees far away are cards, and the switch is not visible at normal zoom speeds.
- [ ] A desert site shows sparse cactus and boulders. A snow site shows crystals and pines. Gas giants are not a case here.
- [ ] Plant count for a forest site reaches the cap on HIGH. Log the count.
- [ ] Frame time on a forest site at 30 m above the ground is under 10 ms on HIGH with terrain, sea, and flora. Report the partition walk time from `performance.now()` around it.
- [ ] Same URL gives the same plants on reload.
- [ ] `README.md` "How it works" describes ground flora and the cards.

## Blocked by

- 04 Patch terrain from the worker
