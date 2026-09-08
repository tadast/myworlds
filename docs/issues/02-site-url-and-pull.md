# 02 Site in the URL and the pull to life

Type: AFK. Phase 1. Blocked by: none. Read `docs/issues/README.md` first, in particular "The site and the URL".

## What to build

The landing site, its selection, and its URL, without any descent yet. This slice makes the site visible on the globe as a marker so it can be tested on its own.

1. **Site pick.** When the camera is within 0.1 units of `CAM_MIN`, compute the site: cast a ray from the screen centre onto the planet surface and convert the hit to lat and lon in the planet's local frame. The planet spins with `planet.rotation.y`, so transform the hit into the planet's local space first.
2. **The pull.** The worker already outputs each creature's home position in the `fauna` array. Build a per-species list of home positions on the main thread after `buildWorld()`. If a home of any species lies within two patch widths of the picked site, the site moves to that home. Two patch widths is 3,000 m, which in globe units is `3000 / (radiusKm * 1000)` where `radiusKm` is the number in `world.stats.radius`. Prefer the nearest home. Gas giants have no ground; the pull does nothing there and the marker never shows.
3. **Marker.** Draw a small ring on the surface at the site, in the accent colour of the palette, only while the camera is within the pick range. It shows where the probe would land. Keep it under 50 triangles.
4. **URL.** Add `@lat,lon` parsing to the hash reader and writing to the hash writer. On load with a site, generate the world and place the camera at `CAM_MIN` over the site, so the marker is under the crosshair. Reading a site does not descend in this issue. Keep the existing behaviour when there is no `@`.
5. **Share button.** The share button copies the current URL. When the camera is in the pick range, the copied URL includes the site.

Keep the marker and the site logic in a small module, `site.js`, so issue 03 can reuse it. Export `pickSite(camera, current)`, `pullSite(site, current)`, `siteToUrl`, `parseUrl`, and `showMarker(site)`.

## Acceptance criteria

- [ ] Zoom to `CAM_MIN` on a terran world. A ring marker appears on the surface at the screen centre. It follows the crosshair as you drag.
- [ ] When a creature home is within 3 km at world scale, the marker snaps to it and stays while the crosshair is within range.
- [ ] Reloading `#Auralis@12.50,-73.25` opens the world at `CAM_MIN` with the marker under the crosshair at that site, and `__mw.site` reports the same lat and lon to two decimals.
- [ ] The share button copies `#Seed@lat,lon` in the pick range and `#Seed` otherwise.
- [ ] A gas giant shows no marker and the hash never gets a site.
- [ ] Old URLs with no `@` behave exactly as before.
- [ ] `README.md` "Controls" mentions the site URL.

## Blocked by

None. Can start immediately.
