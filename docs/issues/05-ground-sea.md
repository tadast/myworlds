# 05 Ground sea and shoreline

Type: AFK. Phase 1. Blocked by: 04. Read `docs/issues/README.md` first.

## What to build

Water on the ground where the site is near or below sea level, with waves that read as water.

1. **Sea plane.** When `patch.hasSea` is true and the world has an ocean, add a plane at y = 0 across the patch and the rim, in the ocean colour with the ocean opacity of the palette. Lava seas glow as on the globe. Ice seas are still and opaque.
2. **Waves.** Displace the plane in the vertex shader: two crossed sine sets, 2 m and 5 m wavelength, 6 s and 9 s period, amplitude 0.12 m for water and 0.05 m for lava. Flat shading gives the facets. The plane grid step must be 1 m within 200 m of the camera target and can be 8 m beyond. A simple way is one plane at 2 m step across the patch; measure the cost first and only add a coarser far plane if the frame time needs it.
3. **Shore.** The terrain noise near sea level is already damped by issue 04. Vertices between 0 and 1.5 m get the sand colour so a beach strip appears. Below 0 the terrain colour darkens toward the ocean colour so shallow water reads through a translucent sea.
4. **Open sea sites.** When every grid vertex is below 0, the terrain mesh is still built, since the sea is translucent, and the fog is tinted 30% toward the ocean colour. The camera floor is 2 m above y = 0 over water.
5. **Sky.** No change. Issue 12 handles the sky.

## Acceptance criteria

- [ ] Descend on a coast: the shoreline follows the terrain, the beach strip is sand, and the water has slow facets that move. No swell crosses the whole patch in a few seconds.
- [ ] Descend on open sea: water to the fog in every direction, camera cannot go under the surface.
- [ ] Descend inland: no sea plane, no cost.
- [ ] Lava and ice worlds show their own sea look as on the globe.
- [ ] Frame time on a coastal site is under 7 ms on HIGH with the sea added.
- [ ] `README.md` "How it works" mentions the ground sea.

## Blocked by

- 04 Patch terrain from the worker
