# The surface probe

Decision record from the design session on 2026-09-08. This document states the decisions and the reasons. It does not describe code that exists yet.

## The problem

The globe draws every moving thing at globe scale. The planet radius is 1 unit, and the stats card says 3,200 to 9,800 km. A tree is 0.011 units, about 70 km. A creature is 0.012 to 0.02 units, 80 to 130 km, and the lore says 4 m. An ocean wave is 740 km long and repeats every 4 s. The globe is a miniature about 100 creature lengths across.

## Decisions

1. **Two tiers with a hand-off.** The globe stays a stylised miniature for orbit. Past the minimum zoom, a probe descends to a ground patch at 1 unit = 1 m. A continuous true-scale zoom was rejected: it needs terrain LOD across six orders of magnitude and camera-relative rendering, because float32 runs out at about 1e-7 of the radius.
2. **Landing site.** The site is the point under the screen centre. If a species home range lies within two patch widths, the target slides there during the descent. Open sea and ice landings stay possible. The site goes in the URL as `#Seed@lat,lon`. The patch seed is the hash of the world seed and the quantised lat and lon.
3. **Patch extent.** A fixed square patch 1.5 km across with a fog edge in the atmosphere colour. Fog starts at 60% of the patch radius. Streamed tiles were deferred.
4. **Frame budget.** Device tiers set counts and the grid step. One runtime knob, the LOD distance, follows a rolling frame time toward the display refresh rate capped at 60. Shadows stay a device-tier decision. Far flora are 2-triangle cards baked per kind and palette at patch load. Far fauna are coarse meshes, because a card flips on a moving animal.
5. **Population.** The unit is the group. Each species gets a sociality gene: solitary, pair, or herd of N. A solitary animal is a group of one. A group anchor runs the existing oscillator steering. Members hold a formation around the anchor with a short leash. Later herd behaviour attaches to the anchor. Budget: about 300 creatures on HIGH and 100 on LOW, in 10 to 30 groups. The species pulled to in decision 2 is always present. Other species appear when the patch biome matches their niche.
6. **Descent and return.** A continued zoom past the minimum for about half a second starts the descent. A button "Send a probe to the surface" does the same. Zooming out past the patch ceiling, or "Recall the probe", starts the ascent. The worker generates the patch during the dive. The dive lasts as long as generation with a floor of 1.2 s, and the patch fades in from the fog colour. The globe scene stays in memory and paused. On the ground the globe is not drawn. A sky dome and fog take the atmosphere colour. The sun sits where the globe light falls at the site. Moons and rings are drawn far away in the sky. Clouds are a few flat sprites near the ceiling.
7. **Ground terrain.** A square grid at 2 m per vertex on HIGH and 4 m on LOW, with a coarser rim. Height is the globe elevation at the site, a tilt from its gradient, and three new noise octaves seeded from the site. Relief is real metres, not the globe exaggeration. Flat-shaded vertex colours from the globe biome and palette with per-face noise. Beach, snow line, and forest mask follow the globe rules. A site within a few metres of sea level gets a sea plane with a shoreline. Waves are 2 m long at a 6 s period. No rivers or lakes in phase one.
8. **Globe fixes.** Wave period from 3.9 s to about 14 s, spatial frequency halved, vertical wobble halved. Flora scaled down 40% and count raised 1.5x on HIGH. Fauna scaled down 30%, count unchanged. Minimum camera distance unchanged. The lore numbers stay, because they become true on the ground.
9. **Ground camera.** OrbitControls with pan. Target clamped to the fog start. Camera height clamped between 2 m above the terrain and a 1.2 km ceiling. A click on a creature or the ground glides the target there. The creature inspector opens from the same click after the glide. LOW devices get the probe with 6,000 flora, 100 fauna, and no shadows.

## Phases

- **Phase 0.** Globe fixes, decision 8.
- **Phase 1.** The probe: descent, ground terrain, sea plane, flora with cards, fauna in groups with coarse far meshes, adaptive LOD, ground camera, URL site.
- **Phase 2.** Ground-scale phenomena, sea species, herd behaviour on the group anchor. Until ground phenomena exist, the pull in decision 2 targets species homes only.
