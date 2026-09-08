# 04 Patch terrain from the worker

Type: AFK. Phase 1. Blocked by: 03. Read `docs/issues/README.md` first, in particular "The patch protocol" and "The ground module".

## What to build

Real ground under the probe. The worker generates a height grid and vertex colours for the site and the ground module draws it with flat shading, fog, and camera clamps. Flora, fauna, and sea come in later issues; this issue only fills `heights`, `colors`, and `patch` in the result and sends empty arrays for the rest.

1. **Worker request.** Handle `{ type: 'patch', seed, lat, lon, opts }`. Rebuild the globe context the patch needs without rebuilding the mesh: the type, the palette, the noise, and the world fields that the biome rules use. The cheapest route is to refactor `generate()` in `worker.js` so that the part before `icosphere()` is a function `worldContext(seed)` that both `generate` and `patch` call. Do not regenerate the icosphere for a patch.
2. **Globe elevation at the site.** Evaluate the same terrain field the globe uses, at the unit direction of the site, to get the relative elevation `H`, the temperature `T`, the moisture `M`, and the forest mask `FM` at the site. The globe's terrain code runs per vertex inside loops; extract a function `fieldAt(dir)` that returns those values for one direction, and use it for both the globe vertices and the patch. The globe result must not change: verify `Auralis` looks the same before and after.
3. **Heights.** For each grid vertex at metres `(x, z)` from the site: the globe elevation at the site in metres, plus the tilt from the globe field gradient over the patch, plus three octaves of patch noise for hills, knolls, and rock. Metres for the globe elevation: `H * amp * radiusKm * 1000 / EXAGGERATION` where `EXAGGERATION = 40`, so a globe peak of 0.06 units becomes roughly 10 km, not 390 km. The tilt uses the same conversion. Patch noise amplitudes: hills 25 m at 400 m wavelength, knolls 6 m at 90 m, rock 1.2 m at 14 m. Scale hills by the globe `mountain` factor of the world. Damp the noise near sea level as the globe does at the coast, so issue 05 gets a clean shore.
4. **Colours.** Apply the biome rules of `worker.js` per vertex with the patch values: sand within the beach band, snow above the snow line, forest colour where the forest mask is positive, ground colour elsewhere, rock on steep slopes. Add per-face noise of a few percent in lightness so the surface is not one flat swatch. Colours are linear RGB like the globe.
5. **Mesh.** In `ground.js`, build a non-indexed `BufferGeometry` with per-face colours, so the flat shading matches the globe. Add a coarser rim from 750 m to 1,500 m from the site at 4x the grid step, flat at the edge height, fully inside the fog. Use `MeshStandardMaterial` with `flatShading`. Shadows only on HIGH.
6. **Camera clamps.** After `controls.update()` each frame, keep the camera at least 2 m above `heightAt(camera.x, camera.z)` and at most 1,200 m above the site. Keep the controls target within 450 m of the site. Pan stays off in this issue; issue 06 adds it.
7. **Progress.** The dive overlay of issue 03 shows the worker progress labels during the descent, and the switch to `ground` waits for `patch-done` or the 1.2 s floor, whichever is later.

## Acceptance criteria

- [ ] Descend on a terran site: a flat-shaded landscape with hills, in the biome colours seen from orbit, fades in from the fog colour. The horizon is fog, not a hard edge.
- [ ] A mountain site is visibly steeper than a lowland site. A snow site is white. A desert site is sand and rock.
- [ ] The same URL gives the same terrain on reload.
- [ ] The globe for `Auralis` is unchanged by the `fieldAt` refactor. Compare a screenshot from `CAM_HOME` before and after.
- [ ] The camera never goes under the terrain and cannot orbit the target outside the fog start.
- [ ] Worker time for a patch is under 800 ms on HIGH. Log it like the globe build line.
- [ ] Frame time on the ground is under 6 ms on HIGH with the terrain alone.
- [ ] `README.md` "How it works" describes the patch. `docs/probe.md` gets a short "Implementation notes" section with the `EXAGGERATION` constant and the noise amplitudes.

## Blocked by

- 03 Descent and ascent shell
