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
10. **Sky continuity, 2026-09-09.** `ground-sky.js` owns the sky. The app turns the globe sun, the moon orbits, and the ring plane into the frame of the site, because only the app knows `planet.rotation.y`. It passes them to `Ground.load(result, { sunDir, view })`.
    - **East and the right hand.** A positive `planet.rotation.y` takes +x toward -z, and lon counts from +x toward +z. East is therefore the direction of falling lon. With that east, the frame x east, y up, z south is right-handed and the sky is not mirrored.
    - **The dome carries no tone mapping.** The renderer applies the fog after the tone mapping and after the colour space, so far terrain ends at the plain fog colour. A tone-mapped dome lands on another colour and the horizon then shows a hard step. The dome takes `toneMapped: false` and the fog takes the horizon colour, so the two meet at one value. The sun tint also fades out at the horizon, because the fog cannot know about the sun.
    - **The sky follows the camera.** The dome, the ring, and the moons stand in a group at the camera position. A fixed sky at the site fails: the camera climbs 1,200 m to the ceiling, and the ring then swings 16 degrees against a sky that must not move. One clipping plane at the height of the camera cuts the ring and the moons at the eye line, which is the horizon of a flat plane, so a moon sets there. This turns on `renderer.localClippingEnabled`, which only touches materials that carry planes.
    - **The ring plane is not the planet equator.** `ringMesh.rotation` leaves the ring normal near world +y, while the planet axis carries `world.tilt`. The ground band reads the world matrix of the globe ring, so it always shows what the globe shows. The band is a line through the zenith at the ring plane, and it opens to about 25 degrees at 30 to 40 degrees of latitude from that plane. Past about 45 degrees it sinks toward the horizon.
    - **The ring takes no light.** The sun can sit in the ring plane, and a lit ring then goes black. The band keeps the band colours and the band alpha of the globe ring and takes one flat brightness from the sun angle.
    - **Clouds sit at 900 to 1,100 m**, under the 1,200 m ceiling, so the probe looks down on them from the ceiling and up at them from the ground.
7. **Ground terrain.** A square grid at 2 m per vertex on HIGH and 4 m on LOW, with a coarser rim. Height is the globe elevation at the site, a tilt from its gradient, and three new noise octaves seeded from the site. Relief is real metres, not the globe exaggeration. Flat-shaded vertex colours from the globe biome and palette with per-face noise. Beach, snow line, and forest mask follow the globe rules. A site within a few metres of sea level gets a sea plane with a shoreline. Waves are 2 m long at a 6 s period. No rivers or lakes in phase one.
8. **Globe fixes.** Wave period from 3.9 s to about 14 s, spatial frequency halved, vertical wobble halved. Flora scaled down 40% and count raised 1.5x on HIGH. Fauna scaled down 30%, count unchanged. Minimum camera distance unchanged. The lore numbers stay, because they become true on the ground.
9. **Ground camera.** OrbitControls with pan. Target clamped to the fog start. Camera height clamped between 2 m above the terrain and a 1.2 km ceiling. A click on a creature or the ground glides the target there. The creature inspector opens from the same click after the glide. LOW devices get the probe with 6,000 flora, 100 fauna, and no shadows.

## Implementation notes

Added with issue 04, the patch terrain. These notes record the constants and the two decisions the issue text did not fix.

**The exaggeration.** `EXAGGERATION = 40` in `worker.js`. The globe draws its relief 40 times too tall, so the reader can see a mountain on a sphere of 1 unit. The ground divides by the same number. One globe elevation unit becomes `amp * radiusKm * 1000 / 40` metres, about 9 km on a world of 6,000 km with `amp = 0.06`. A globe peak of 0.06 units then reads as about 10 km, not 390 km.

**The noise.** Three octaves, all in metres, all from a noise seeded with `` `${seed}|patch|${lat}|${lon}` ``:

| Octave | Amplitude | Wavelength |
|---|---|---|
| hills | 25 m | 400 m |
| knolls | 6 m | 90 m |
| rock | 1.2 m | 14 m |

Near sea level the hills and the knolls fall to a quarter and the rock to 40%, over a band `SHORE_DAMP` of 45 m. The globe damps its fine relief at the coast for the same reason: a shore must not break into specks.

**The hills carry the site, not the globe.** The globe holds nothing below about 50 km, because an icosphere of 200,000 faces gives a face of about 50 km on a planet of 6,000 km. Divided by the exaggeration, the globe tilt across a patch of 1,500 m is a few tens of centimetres. It is still applied, because it is the true slope, but it cannot make a mountain look like a mountain. So the hill amplitude also scales with the height of the site: `HILL_M * mountain * clamp(0.35 + 1.25 * relief, 0.2, 1.8)`, where `relief` is the globe elevation at the site over the snow line. A lowland patch then gets about 9 m of relief and a peak patch about 100 m.

**The moisture and the forest mask.** The colour rules of the globe read moisture, not the forest mask. The patch does the same. The hill field varies the moisture inside the patch, so a hollow reads wetter than a crest, and the forest mask at the site lifts the moisture a little, so a site inside a forest cluster reads green.

**The sea level.** A patch needs the sea level of the globe, and the globe reads it as a quantile over its icosphere. The worker caches the context of the last world it built, so a patch for that world takes the exact value. A worker that never built the world falls back to the same quantile over 60,000 points of a Fibonacci sphere. That fallback is accurate to a few metres of elevation.

### What makes the terrain fast

The patch holds 1.13 million triangles. Two measurements set the shape of the mesh. Both come from a timer query of the graphics card around one `Ground.render`, at the camera the probe lands with, 60 samples.

**The mesh is indexed.** A grid vertex belongs to six triangles. The first build repeated every vertex, so it fed 3.39 million vertices to the card for 1.13 million triangles. The indexed mesh feeds 592,000. That took the terrain from 8.75 ms to 6.8 ms. The colour is now per vertex, and the reader sees it smoothed over one cell of 2 m. `flatShading` still takes the normal from the derivatives, so the facets read as before.

**The material is Lambert, not standard.** The terrain fills the frame, so its fragment shader sets the cost. A standard material runs a full reflection model for a surface that is rough and not metal. A Lambert material draws the same ground for about a third less time: 6.8 ms to 5.2 ms. `GROUND_GAIN` of 1.06 puts the mean pixel back where the standard material had it, because the sheen the Lambert model drops is nearly a constant over a rough surface. Measured against the standard material at the same camera and the same sun, the mean pixel moves by 1 part in 255 and no block of the frame moves by more than 6.

**A coarser grid outside the fog does not help.** The obvious cut is to drop the resolution past the fog line. A test cut the drawn triangles from 727,000 to 323,000 and the frame time did not move: the card is not bound by triangles once the mesh is indexed. The cut would still show a seam at some camera positions, because the camera may stand anywhere over the patch. So the grid stays at one step everywhere, and a grid that follows the camera stays with issue 11.

### What the flora costs

Added with issue 07. Measured with a timer query of the graphics card around one `Ground.render`, at a
forest site of 20,000 plants on HIGH, over about 1,300 samples. The sea of issue 05 was not built yet.

| Camera | p10 | median | p90 |
|---|---|---|---|
| Entry, 300 m over the site | 3.93 ms | 5.21 ms | 6.99 ms |
| Eye level, 30 m over the ground | 2.76 ms | 4.37 ms | 5.53 ms |

**The flora is nearly free at eye level.** The terrain alone measures 4.43 ms at the same camera, so
20,000 plants cost about 0 ms there. A card holds few pixels, and the canopy stands in front of the
terrain, so the depth test drops the terrain fragments the canopy hides. The gain and the cost cancel.

**The card holds one light, so the shader adds the rest.** A card is baked once per kind with the sun
behind the eye, at the true height of the sun. That one picture cannot follow the eye: a reader who
turns to face the sun sees a lit mesh beside a card that holds the same light it always held. So the
card shader dims the whole card by the angle between the eye and the sun on the ground plane, down to
the share of the light the sky gives. The two levels of detail then meet at one brightness at every
camera angle, and the switch at 150 m does not show.

**The card carries no mipmaps.** A mipmap averages the alpha of a thin trunk toward zero, and the far
half of the forest fades away under an alpha test. A card is small on the screen, so it stays sharp.

**The walk copies six numbers for a card, not sixteen.** A card slot holds a diagonal scale and a
translation, and the instanced mesh starts every slot at the identity, so the nine zeros and the one
never change. The first build copied the whole matrix and the walk took 0.6 ms; it now takes 0.4 ms
for 20,000 plants, and 0.15 ms when the arrays are already in the cache of the processor.

**The sun does not cast yet.** The near plants already carry `castShadow` on HIGH and the terrain
already carries `receiveShadow`, so the ground needs one flag on the light and a shadow box. Measured:
a 2,048 map over a box of 200 m costs 2.2 ms at eye level and 2.3 ms at the entry camera, because
every terrain fragment then runs the nine taps of the soft filter. That takes the frame to 7.5 ms
before the sea exists, and it buys nothing at the entry camera, where no plant stands near enough to
cast. The decision therefore belongs with the one runtime knob of issue 11.

## Phases

- **Phase 0.** Globe fixes, decision 8.
- **Phase 1.** The probe: descent, ground terrain, sea plane, flora with cards, fauna in groups with coarse far meshes, adaptive LOD, ground camera, URL site.
- **Phase 2.** Ground-scale phenomena, sea species, herd behaviour on the group anchor. Until ground phenomena exist, the pull in decision 2 targets species homes only.
