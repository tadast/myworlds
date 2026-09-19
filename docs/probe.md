# The surface probe

Decision record from the design session on 2026-09-08. This document states the decisions and the reasons. It does not describe code that exists yet.

## The problem

The globe draws every moving thing at globe scale. The planet radius is 1 unit, and the stats card says 3,200 to 9,800 km. A tree is 0.011 units, about 70 km. A creature is 0.012 to 0.02 units, 80 to 130 km, and the lore says 4 m. An ocean wave is 740 km long and repeats every 4 s. The globe is a miniature about 100 creature lengths across.

## Decisions

1. **Two tiers with a hand-off.** The globe stays a stylised miniature for orbit. Past the minimum zoom, a probe descends to a ground patch at 1 unit = 1 m. A continuous true-scale zoom was rejected: it needs terrain LOD across six orders of magnitude and camera-relative rendering, because float32 runs out at about 1e-7 of the radius.
2. **Landing site.** The site is the point under the pointer while the reader aims. Changed by issue 20; it was the point under the screen centre. If a species home range lies within two patch widths, the target slides there during the descent. Since issue 14 the phenomenon of the world pulls in the same way, and it wins over a home: the world holds many homes and at most one phenomenon. Open sea and ice landings stay possible. The site goes in the URL as `#Seed@lat,lon`, and the ground camera follows it as `/x,z,dist,az,pol`. Since issue 30 the lat and the lon are the middle of a quad of the cube grid. The patch seed is the hash of the world seed and that lat and lon; since issue 30 it seeds the plants and the animals only, and no part of the terrain.
3. **Patch extent.** A fixed square patch 1.5 km across with a fog edge in the atmosphere colour. Fog starts at 60% of the patch radius. Streamed tiles were deferred.
4. **Frame budget.** Device tiers set counts and the grid step. One runtime knob, the LOD distance, follows a rolling frame time toward the display refresh rate capped at 60. Shadows stay a device-tier decision. Far flora are 2-triangle cards baked per kind and palette at patch load. Far fauna are coarse meshes, because a card flips on a moving animal.
5. **Population.** The unit is the group. Each species gets a sociality gene: solitary, pair, or herd of N. A solitary animal is a group of one. A group anchor runs the existing oscillator steering. Members hold a formation around the anchor with a short leash. Later herd behaviour attaches to the anchor. Budget: about 300 creatures on HIGH and 100 on LOW, in 10 to 30 groups. The species pulled to in decision 2 is always present. Other species appear when the patch biome matches their niche.
6. **Descent and return.** The button "Send a probe to the surface" starts the aim, and a tap on the planet then starts the descent. Changed by issue 20; a continued zoom past the minimum used to start the descent on its own. Zooming out past the patch ceiling, or "Recall the probe", starts the ascent. The worker generates the patch during the dive. The dive lasts as long as generation with a floor of 1.2 s, and the patch fades in from the fog colour. The globe scene stays in memory and paused. On the ground the globe is not drawn. A sky dome and fog take the atmosphere colour. The sun sits where the globe light falls at the site. Moons and rings are drawn far away in the sky. Clouds are a few flat sprites near the ceiling.
10. **Sky continuity, 2026-09-09.** `ground-sky.js` owns the sky. The app turns the globe sun, the moon orbits, and the ring plane into the frame of the site, because only the app knows `planet.rotation.y`. It passes them to `Ground.load(result, { sunDir, view })`.
    - **East and the right hand.** A positive `planet.rotation.y` takes +x toward -z, and lon counts from +x toward +z. East is therefore the direction of falling lon. With that east, the frame x east, y up, z south is right-handed and the sky is not mirrored.
    - **The dome carries no tone mapping.** The renderer applies the fog after the tone mapping and after the colour space, so far terrain ends at the plain fog colour. A tone-mapped dome lands on another colour and the horizon then shows a hard step. The dome takes `toneMapped: false` and the fog takes the horizon colour, so the two meet at one value. The sun tint also fades out at the horizon, because the fog cannot know about the sun.
    - **The sky follows the camera.** The dome, the ring, and the moons stand in a group at the camera position. A fixed sky at the site fails: the camera climbs to the ceiling, and the ring then swings against a sky that must not move. Measured at the ceiling of 1,200 m the swing was 16 degrees; issue 20 lowered the ceiling to 500 m, which makes the swing smaller but does not remove it. One clipping plane at the height of the camera cuts the ring and the moons at the eye line, which is the horizon of a flat plane, so a moon sets there. This turns on `renderer.localClippingEnabled`, which only touches materials that carry planes.
    - **The ring plane is not the planet equator.** `ringMesh.rotation` leaves the ring normal near world +y, while the planet axis carries `world.tilt`. The ground band reads the world matrix of the globe ring, so it always shows what the globe shows. The band is a line through the zenith at the ring plane, and it opens to about 25 degrees at 30 to 40 degrees of latitude from that plane. Past about 45 degrees it sinks toward the horizon.
    - **The ring takes no light.** The sun can sit in the ring plane, and a lit ring then goes black. The band keeps the band colours and the band alpha of the globe ring and takes one flat brightness from the sun angle.
    - **Clouds sit at 900 to 1,100 m.** They stood under the ceiling of 1,200 m, so the probe looked down on them from the ceiling. Since issue 20 the ceiling is 500 m and the reader always looks up at them, which also takes a near cloud out of the reveal.
7. **Ground terrain.** A square grid at 2 m per vertex on HIGH and 4 m on LOW, with a coarser rim that runs out to 4,000 units from the site. Height is the globe field read across the cell, plus a relief field that carries the shape from the cell down to the metre. Changed by issue 30; the height used to be the globe elevation at the site, a tilt from its gradient, and three noise octaves seeded from the site. Relief is real metres, not the globe exaggeration. Flat-shaded vertex colours from the globe biome and palette with per-face noise. Beach, snow line, and forest mask follow the globe rules. A site within a few metres of sea level gets a sea plane with a shoreline. Waves are 2 m long at a 6 s period. No rivers or lakes in phase one.
8. **Globe fixes.** Wave period from 3.9 s to about 14 s, spatial frequency halved, vertical wobble halved. Flora scaled down 40% and count raised 1.5x on HIGH. Fauna scaled down 30%, count unchanged. Minimum camera distance unchanged. The lore numbers stay, because they become true on the ground.
9. **Ground camera.** OrbitControls with pan. Target clamped to the fog start. Camera height clamped between 2 m above the terrain and a ceiling of 500 m. The ceiling was 1.2 km until issue 20. A click on a creature or the ground glides the target there. The creature inspector opens from the same click after the glide. LOW devices get the probe with 6,000 flora, 100 fauna, and no shadows.

11. **The probe overlay, 2026-09-18.** The probe carries an instrument, and the instrument states four facts: the temperature of the air at the camera, the height of the camera over the ground, the time to the next sunset or sunrise, and the strength of the uplink to the relay. The uplink is the reason the probe stops. The reach is a rule about the plants, and a reader cannot see a rule; a link that thins over the last 420 units and a picture that breaks up over the last 150 is a cause the reader can read. The noise stays inside that narrow band on purpose, because static away from the edge reads as a fault of the app. See `docs/issues/31-probe-overlay.md`.

12. **The sky turns, 2026-09-18.** A landing keeps a clock: one turn of the planet takes 1,800 s of real time, whatever the day of the world is. The star turns about the axis of the planet, so it rises and sets the way it does at that latitude, and the light, the colours of the sky, the fog, and the countdown of the overlay all follow it. The hours of the world therefore run about fifty times the hours of the reader, which is what makes a sunset something a reader can sit through. The moons keep the order the globe rolled and lose its speed: a moon crosses the sky in tens of minutes and no longer in tens of seconds. See `docs/issues/32-the-sky-turns.md`.

13. **The drone flight, 2026-09-18.** `W`, `A`, `S`, and `D` move the probe in the flat plane and no longer follow the tilt of the view. The arrows and `Q` and `E` turn and tilt the view about the eye. The velocity eases at `WALK_EASE` 2.2/s, so the probe keeps some momentum, and the speeds rose to 16 and 220 units a second. The reach now limits the camera and not the target. The old rule clamped the target, so a reader who backed into the edge stood outside the reach behind the target; a turn of the view then swung the target out, and the backstop pulled the whole pair toward the site. The target is now only the point the view looks at, and the backstop moves the camera alone. The keyboard tilt also holds inside the polar band of the controls, because a tilt past it made the controls swing the camera about the target.

14. **The carrier, 2026-09-19.** Every world with a surface carries one source, and the instrument of the probe reads a bearing to it. The reading has an error and no distance. The globe keeps a wedge per landing, and the source stands where two wedges cross. A landing on the cell of the source shows the thing itself: the wreck of an older survey probe, with a log of four entries that the lore engine writes from the facts of the world. The search takes three phases: hear, cross, and home. See `docs/issues/34-the-carrier.md` and `docs/source.md`.
    - **The carrier is always heard, and the error does the work.** A range limit was rejected: a landing with no reading costs the reader a dive and gives little back. The error runs from 3 degrees at the source to 25 degrees at its antipode, straight in the arc. The offset inside the error comes from a hash of the seed and the cell, so a cell states one bearing on every visit and the true bearing always lies inside the wedge. Two far fixes cross wide, and the reader then decides between a third far fix and a near one. That decision is the feature.
    - **A wedge, and not a line.** Two exact lines solve every world in two landings, and the search is dead by the third world. A wedge states the doubt honestly.
    - **A wedge covers half a great circle.** A bearing has a direction, so a wedge starts at the site and ends at the antipode of the site. Two wedges then cross in one region and not in two.
    - **The app draws no cross.** Two wedges read darker where they cross, and that is the whole display of the cross. The reader reads it by eye. A computed mark takes the only thought out of the search.
    - **No pull to the source.** `pullSite()` does not know the source. The reader has to aim.
    - **The song stays whole.** The first idea took the lead voice out of the song until the reader found the source. It makes every song worse for every reader who does not search, and the music starts muted, so it cannot carry a mechanic alone. The source gets a voice of its own instead, the motif, which adds to the song and takes nothing from it.

    The build changed nine things against the plan.

    - **The needle on the ground takes the frame of the patch box, and not `groundBasis()`.** The box runs x along the u axis of its cell and z along the v axis, and (u, up, v) is left-handed, so the box is the mirror of the sky frame in x. A needle that came through `groundBasis()` pointed at the mirror of the source and away from the wreck. `carrierBox()` in `site.js` reads the slope of the map of the box instead. The mirror of the sky against the terrain is an older defect, it is open, and `tools/carrier-check.mjs` prints it as a note and not as a check. The three digits stay the true bearing of the globe, because the wedge of a fix is drawn on the globe.
    - **The carrier block sits at the top left.** The plan gave the fifth block no place. The right edge of the overlay holds the altitude ladder, so the block took the left.
    - **The log names no pulsar and no giant star.** The plan lists both as troubles. `rollStar()` lives in `star.js`, a module of the main thread, and `app.js` rolls the star after the worker replies, so the worker cannot read it. Those two troubles need the star in the worker first.
    - **A polar night line needs the tag `polarnight`.** The plan names "the tilt and its polar night" as one trouble. A lean alone gives no polar night: the sun fails to rise only poleward of the polar circle, which stands at latitude `90 - lean`. So `sourceTags()` reads the latitude of the source against the lean of the axis, with a margin of 5 degrees. See `docs/source.md`.
    - **The motif keeps straight time while the song swings.** A machine transmits on a clock, so the swing of the song does not reach the motif. The motif rolls from `'music:' + seed + '|source-motif'` and not from the stream of the song, so no song of any world changed.
    - **The reach of `patchSource()` is the walk limit and not `FOG_NEAR`.** The reader has to reach the wreck on foot, and the walk stops at half the box less the band the plants thin out over. That is the rule `reachOf()` holds in `ground.js`, so the two cannot drift apart. The range the overlay states measures from the camera and not from the site, so it falls under 5 units at the hull.
    - **The ring of a find lies on the terrain, and the wedges stood at 1.07.** The plan puts every shape on the shell of 1.07. The ring marks one place, and at 1.07 it hung in the sky: the surface stands near 1.0 and the camera comes to 1.11. Every vertex of the ring now takes the ground under it, or the sea where the ground lies under the sea, plus a lift that clears the flora of the globe, the way `showMarker()` drapes the square of a cell.
    - **The wedges are painted on the terrain, and they are no longer geometry.** The shell of 1.07 failed the wedges for the same reason it failed the ring. From the aim camera at 1.11 a wedge stood as a sheet over the ground: the cross of two sheets held a large parallax against the relief, and the reader could not tell which cell lay under it. The terrain shader and the ocean shader now test each fragment against the fixes in their uniforms, so a wedge lies on the ground it marks at every camera and it needs no geometry at all. The cap is `MAX_WEDGES = 8`, and a world with more fixes paints the 8 newest. The dot of a fix drapes on the ground with the ring.
    - **The source does not read the vertices of the globe.** The plan selects a dry vertex. The detail of the globe follows the tier, so a phone and a desktop found two different sources on one seed. `makeSource()` now draws each candidate direction from the source stream and tests it on the globe field, with a sea level from a fixed grid of samples. `node tools/world-checksum.mjs --source` proves that the two tiers agree.

## Implementation notes

Added with issue 04, the patch terrain. These notes record the constants and the two decisions the issue text did not fix.

**The exaggeration.** `EXAGGERATION = 40` in `worker.js`. The globe draws its relief 40 times too tall, so the reader can see a mountain on a sphere of 1 unit. The ground divides by the same number. One globe elevation unit becomes `amp * radiusKm * 1000 / 40` metres, about 9 km on a world of 6,000 km with `amp = 0.06`. A globe peak of 0.06 units then reads as about 10 km, not 390 km.

**The noise.** Issue 30 replaced the three octaves this section held. They ran off the seed of the patch, so two patches side by side grew different hills and no stream could join them, and one smooth octave gave rounded blobs and no ridge. The relief below carries all of it now. Near sea level the whole relief field falls to a quarter over a band `SHORE_DAMP` of 45 units. The globe damps its fine relief at the coast for the same reason: a shore must not break into specks.

**The relief under the globe field.** Added with issue 30. The globe holds nothing below about 50 km, because an icosphere of 200,000 faces gives a face of about 50 km on a planet of 6,000 km. Measured over 300 land cells of `Auralis`, the globe field inside a cell stands within 7% of a plane. The field below it fills that gap, in units of the box and not in metres:

| Stack | Longest wave | Octaves | Amplitude | Shape |
|---|---|---|---|---|
| ridge | 1,800 units | 5 | 170 units | ridged multifractal, each octave hung on the crest of the one above |
| fine | 70 units | 3 | 10 units | plain fbm, the ground at the feet |

`ruggedAt()` scales the ridge stack: `RUG_BASE + RUG_RIDGE * rg + RUG_HIGH * h / hRef`, clamped to 0.5 to 1.7, where `rg` is the mountain term of the globe at that point and `h / hRef` is the height over the highest land of the world. So a range takes the whole stack and a plain takes a third of it. Measured on `Auralis`, a patch holds 403 units from its lowest vertex to its highest on a range and 51 on a plain.

The field reads the direction on the sphere and nothing else. Two patches that share an edge therefore read one height along it, which is what a stream would need to stitch them. Two rules protect that: the frequencies come from the nominal cell of the world and not from the true width of this cell, because a cube cell is a little wider in the middle of a face than at a corner; and the vertical scale is one number for the whole world. Measured over 751 vertices of a join, two neighbours differ by 0.0002 units against an edge 1,000 units up.

The rim carries the first `DETAIL_RIM_OCT` octaves of the ridge stack, which is every wave a rim cell of 50 or 100 units can hold. The patch fades the rest out over its last two rim cells, so the two meet on one shape.

**The vertical scale is the world, not the cell.** `V` used to divide the relief of each cell down to a fixed 240 units of the box. A range and a plain then read alike, and the two sides of a shared edge disagreed on how tall a unit is. `V` now comes from the world: the highest land stands `WORLD_RELIEF` of 800 units over the sea, and the quantile that finds that height is cached on the context, so it runs once a world.

**The moisture and the forest mask.** The colour rules of the globe read moisture, not the forest mask. The patch does the same. The relief field varies the moisture inside the patch, so a hollow reads wetter than a crest, and the forest mask at the site lifts the moisture a little, so a site inside a forest cluster reads green.

**The cell is a quad of a cube grid.** Added with issue 30. A cell was a square of a band of latitude, and the step of longitude changed at every band, so a cell in one band did not line up with a cell in the next. The grid is now six faces of `FACE_CELLS` by `FACE_CELLS` quads. A direction picks the face it points at most, and inside the face it has two gnomonic coordinates; the grid stores the tangent of those, `w = atan(a) * 4 / PI`, so a quad at a corner holds about the arc of a quad at the middle. A coordinate past the face is legal and the map stays true there, which is what the rim needs. The box of the patch lands on the quad, so the box is the cell, and the four corners of the marker are the four corners of that quad. The URL still carries a lat and a lon, and it is the middle of the cell: it stands half a cell from every edge, so two decimals of a degree cannot move it into the cell next door. `site.js` and `worker.js` each hold the map, because a Web Worker cannot import a module; keep the two in step.

The box therefore runs along the axes of the cell and no longer along east and south. `cellTwist()` gives the turn between the two, and `groundBasis()` takes it, so the sun, the moons, and the ring still stand in the right quarter of the sky.

**The box is right-handed.** The box runs x along the u axis of the cell and z against the v axis. For every face of the grid u cross v is the outward normal, so (u, up, v) is a left-handed set. Until 2026-09-19 the box ran z along v. three.js then drew the mirror of the cell: the coast turned the wrong way against the globe, and the sky of decision 10, which is right-handed, stood mirrored against the terrain. No turn about the up axis hides a mirror, so `cellTwist()` could not correct it. Measured on a coast cell of Auralis at 52.25, 67.32: the old patch agreed with the globe field on 39% of a 40 by 40 grid as built and on 75% after a mirror in x, and the new patch agrees on 92% as built. The rest is the relief the patch adds to the field at the shore. The patch with no cell had the same defect, with x toward rising lon, and it now takes the east of `groundBasis()`. On the four faces of the equator u runs east and v runs north, so the box there has x east and z south with no twist. `boxTanX()`, `boxTanZ()`, and `tangentFrame()` in `worker.js` hold the map, and `node tools/frame-check.mjs` fails on a mirror. The fix turned every patch over: a shared ground URL from before that date keeps its site and shows the mirror of its old camera pose.

**The sea level.** A patch needs the sea level of the globe, and the globe reads it as a quantile over its icosphere. The worker caches the context of the last world it built, so a patch for that world takes the exact value. A worker that never built the world falls back to the same quantile over 60,000 points of a Fibonacci sphere. That fallback is accurate to a few metres of elevation.

### What makes the terrain fast

The patch holds 1.13 million triangles. Two measurements set the shape of the mesh. Both come from a timer query of the graphics card around one `Ground.render`, at the camera the probe lands with, 60 samples.

**The mesh is indexed.** A grid vertex belongs to six triangles. The first build repeated every vertex, so it fed 3.39 million vertices to the card for 1.13 million triangles. The indexed mesh feeds 592,000. That took the terrain from 8.75 ms to 6.8 ms. The colour is now per vertex, and the reader sees it smoothed over one cell of 2 m. `flatShading` still takes the normal from the derivatives, so the facets read as before.

**The material is Lambert, not standard.** The terrain fills the frame, so its fragment shader sets the cost. A standard material runs a full reflection model for a surface that is rough and not metal. A Lambert material draws the same ground for about a third less time: 6.8 ms to 5.2 ms. `GROUND_GAIN` of 1.06 puts the mean pixel back where the standard material had it, because the sheen the Lambert model drops is nearly a constant over a rough surface. Measured against the standard material at the same camera and the same sun, the mean pixel moves by 1 part in 255 and no block of the frame moves by more than 6.

**The beach band of the globe is not a beach on the ground.** The globe paints its beach where the elevation field is below `beachW`, about 0.03 units. A globe unit is `amp * radiusKm * 1000 / 40` metres, so that band stands for about 270 m of ground. At 1 m per unit it paints a whole coastal patch as sand, and no beach strip can read. Added with issue 05: `biomeIndex()` takes the width of the beach band, and the patch passes `BEACH_M = 1.5` metres. Under the water line the patch also drops the slope rule for bare rock and mixes the bed from the shallow colour to the deep colour over `DEEP_M = 12` metres, so shallow water reads through the translucent sea. A low patch that read as one sand field now reads as grass, forest, or dry ground with a sand strip at the water.

**A coarser grid outside the fog does not help.** The obvious cut is to drop the resolution past the fog line. A test cut the drawn triangles from 727,000 to 323,000 and the frame time did not move: the card is not bound by triangles once the mesh is indexed. The cut would still show a seam at some camera positions, because the camera may stand anywhere over the patch. So the grid stays at one step everywhere, and a grid that follows the camera stays with issue 11.

### The ground camera

Added with issue 06. These notes record the decisions the issue text did not fix.

**The fog opens with the height.** The reveal puts the camera 450 m up and the ceiling is 500 m, but the fog is solid at 750 m. A fixed fog therefore paints one flat colour over the whole patch from both heights, and the reader sees nothing to zoom into. So the far distance of the fog grows with the height of the camera over the site, 1.15 m per metre, and it stops at 2,100 m. The near distance keeps the ratio of 0.6, so the depth of the fade holds. Since the ceiling of issue 20 the fog opens to 1,325 m at most, so the stop at 2,100 m no longer binds. At the ceiling the patch reads in full and the rim runs on to 3,150 units, well past the fog, so the ground never shows a cut. See "The rim carries the ground past the fog" below. `FOG_NEAR` and `FOG_FAR` keep their values and still set the pan limit and the fog at the ground.

**The tilt was a band, and it is now the reader's.** Issue 06 gave the height a say in the polar angle: the view wanted 1.10 rad at the ceiling and 1.40 rad at 60 m, and a band of 0.06 to 0.25 rad around that angle held the play the reader kept. The band turned the view from the patch below to the horizon as the reader came down, and it cost little while the keys only walked.

The flight keys retired it. A camera that flies up a straight line has its view turned under it by a band that follows the height, and the turn moves the eye as well, because the controls hold the angle by swinging the eye about the target. The reader reads that as a camera that fights the key. So the band is gone. The angle now runs from 0.05 rad, a hair off straight down, to the angle that keeps the horizon on the bottom edge of the frame, and the height sets only the speeds. The reveal still arrives at 1.10 rad, so the first frame reads as issue 20 asks. See "The ground view must not read as a rectangle" for what the retirement costs.

**The view turns over the horizon.** Added with issue 17. Until then the band ended 5 deg under the
horizon, so the reader could never look up, and an air species that hovers 12 to 40 m over the
ground was never seen. The cap was the floor of the camera: it held the eye 2 m over the terrain,
and it read as a limit on the polar angle, because OrbitControls puts the eye under the target to
point the view up. One number did two jobs, and the job it did well hid a whole class of animal.

The two jobs now split. The angle runs to 2.09 rad and the position clamp in `update()` holds the
eye. The clamp moves the camera and the target by one step, so the view direction and the distance
both hold. While the view points up the eye stops at the floor and the step carries the target up
instead: the pivot of an up-view stands in the sky, tens of metres over the reader. The reader
therefore turns the head and does not walk, and a climb over relief cannot tilt the view.

The frame sets the 2.09 rad. The view rises until the horizon reaches the bottom edge and no
further, which is half the field of view over the horizon, or 30 deg on the 60 deg camera. A wider
angle was rejected: it fills the frame with empty sky and the reader loses the ground. A flyer that
hovers 35 m up and 35 m out stands 45 deg over the eye, and it then sits high in the frame but
inside it.

A link carries an up-view as a polar angle over 90 deg, and `setView()` opens the band of the
controls for its one update. Without that the controls cut the angle of the link against the band
of the camera the link replaces, and every up-view came back at the horizon.

**The camera holds its own height.** Issue 06 pinned the target one metre over the ground under it
and let the eye keep its offset from the target, so the pair rode the terrain and a pan over relief
carried the whole view up and down with the hills. The flight keys made that read as a bounce, and
on a slope it fought the key that asked for height: the reader pressed `Space`, the climb opened
the offset between the eye and the target, and the ground under the target pulled the pair back.

The rule is now two limits and nothing else. The floor holds the eye 2 m over the terrain, or over
the water on a sea. The ceiling holds it 500 m over the site, or over the water when the site lies
under a sea, because the seabed of an ocean cell is kilometres down and a ceiling measured from it
would hold the reader on the surface. Each limit moves the camera and the target by one step, so
the view direction and the distance hold. Between the two the reader owns the height, and a
straight line stays a straight line. The camera follows the terrain only while it lies against the
floor, which is the one case where it must.

**The ground view must not read as a rectangle.** Added with issue 20. The patch holds a 2 m grid
with knolls and rock, and it holds every plant. The rim outside it holds a 50 m grid with neither,
and no plants at all. The two make one surface, but the detail stops at the edge of the box, 750
units from the site, and from the air that line reads as a square of fine ground inside a smooth
field.

The fog cannot hide the line at any height while the view looks down. The fog opens 1.15 m for each
metre of height, and the far edge of the box moves away only by the horizontal distance of the
camera from the site, so the edge is inside the fog when `tan(polar angle) < FOG_LIFT`. The old
`POLAR_HIGH` of 0.62 rad gives 0.71, under the limit at every height. Lowering the ceiling alone
therefore could not work, because the tilt reaches `POLAR_HIGH` at whatever the ceiling is.

So the ceiling comes down to 500 m and `POLAR_HIGH` goes up to 1.10 rad, which gives 1.97 and 1.74
at the far side of the band. The reveal takes the same tilt: 450 m up and 884 m south. The plants
take a second rule, because the fog does not hide a hard line of forest at 500 m either: the chance
of a plant falls to zero over the last 300 units of the box, so the forest thins out instead of
stopping. Measured on `Auralis@-38.00,18.00`, a flat inland cell: the square was plain at 1,200 m
and it still read at 800 m; at the new ceiling, panned to each of the four limits and tilted to the
foot of the band, nothing reads. The cost is the top-down view of the whole patch, which is the
view the rectangle was in.

The flight keys took the band away, and the ceiling now carries the rule alone. A reader who climbs
to 500 m and turns the view out at the horizon can find the edge again. That is the price of a
camera that flies where the reader points it, and it is a view the reader has to build on purpose:
the reveal, the dive, and every glide arrive tilted down on the patch, where the fog still hides
the line.

**The zoom stops at the limit, and the limit offers the journey.** Added after issue 23, from use.
Issue 03 gave the zoom a second job: half a second of zoom out at the ceiling of the ground recalled
the probe. It reads as a fault. A reader who pulls back to see more of the patch is thrown off the
world, and the gesture that framed the view also ended it. There is no way to sit at the ceiling and
look.

The zoom now stops at the ceiling and does nothing else. A button fades in at the foot of the screen
instead, half lit, and it says "Recall the probe". The globe takes the mirror of it: at the closest
zoom, where the reader is already down among the creatures, the button says "Send a probe to the
surface". Both call the one handler the sidebar button calls.

The button only shows at the limit. That is the moment the zoom has nothing left to give and the
reader who keeps pulling is asking for something the zoom cannot do, so the offer arrives exactly
when it answers a question the reader is already asking, and it covers no view that the reader is
still moving. It hides while the reader aims, because the aim banner already holds the screen.

**The tap marks, and the button opens the card.** The card used to open on a second tap on the
same animal within 0.45 s, and the gesture was hard to find. One tap now marks the animal: a ring
in the accent of the palette lies on the ground under it and follows it, and a floating button at
the foot of the screen offers the card — "Study the ‹name›". The button takes the spot of the
recall button while a mark is on, because the two share one place and the mark is the fresher ask.
The arrows of the card walk the species list, and on the ground they also point the view at the
nearest animal of the next species, with the same glide or turn the tap uses. A species the patch
does not host leaves the camera in place and takes the mark off. A tap on the ground, Escape, or
the recall of the probe takes the mark off too.

**The reader walks, and moving takes the first gesture.** Added with issue 23. Issue 06 gave the
ground the gesture map of the globe: one finger and the left button turned the view, and the pan sat
on the right button and on two fingers. On the globe that is right, because the reader turns a thing
and looks at it from outside. On the ground the reader stands inside the thing and wants to travel,
and every reader tries one finger first. They found the spin, they found the zoom, and they never
found the move. The tap of issue 06 was the only travel they could reach, and it only carries the
reader to a point that is already on the screen.

So the two gestures swap. One finger and the left button grab the ground and pull the reader over
it, as a map does. Two fingers and the right button turn the view, and a pinch still zooms, because
two fingers do both. The globe keeps its own map: the two places now read as two places, which is
what they are.

A drag carries the short distances and it needs a new one for every screen. Two things carry the
long ones. A press that **holds still** past 300 ms becomes a walk in the direction the pointer
points, and the reader steers with the thumb until the finger lifts. A press that moves is a drag,
and the walk never arms, so the two cannot be confused: the rule is already there, because a press
that moves more than `TAP_SLOP` stops being a tap.

The **keys** carry the rest, and the probe flies like a drone. `W`, `A`, `S`, and `D` move it in
the flat plane, parallel to the surface. The tilt of the view does not change the plane, and nothing
follows the terrain. `Space` lifts the camera, `Ctrl` drops it, `Shift` runs, and `+` and `-` zoom.
The side arrows turn the view, and the up and down arrows tilt it, and so do `Q` and `E`. The
velocity eases to the speed the keys ask for at `WALK_EASE`, so the probe gathers speed and coasts
to a stop over about half a second.

The look keys turn the target about the eye, and not the eye about the target: the reader turns the
head, and a camera swung about a target 15 m away would walk a 15 m circle instead. The walk moves
the pair, so the view direction and the distance both hold and only the place changes. The speed
follows the height, as the speed of a wheel step does: 16 units a second at eye height and 220 at
the ceiling, and `Shift` multiplies by 5. An editable element takes every key first, so a reader
who types a seed does not walk.

Every key moves the camera and the target by one step, on all three axes, so the view direction and
the distance hold and only the place changes. The drop stops at the floor, 2 m over the terrain or
over the water, and the lift stops at the ceiling. Both gates take the vertical part before the
ease reads it, so a key held against a limit winds up no speed that the clamp of `update()` then
throws away. `Space` also takes the focus off a button, because the browser presses a focused
button with the space key. `Enter` still presses it.

The walk meets the same 450 m limit the pan meets, and it slows over the last 80 m instead of
stopping dead. Only the outward part of the step slows, so a reader at the edge still walks along it
and back in at full speed.

**The pan limit stops the camera too.** The target cannot leave the fog start at 450 m. The first build clamped the target alone, so a pan that reached the limit slid the camera on over a target that could not follow, and the camera sank toward the ground. The clamp now moves the camera by the same step, so the whole view stops.

**The rim carries the ground past the fog.** The patch is one cell of the globe drawn into a box
1,500 units square. Outside that box the ground has to come from somewhere, and the first rim held
the height and the colour of the nearest point on the edge of the patch. That clamp dragged one
edge cell over a whole band: along a side the streaks ran parallel, at a corner they fanned out,
and the sea stayed flat, so a coast stopped in a straight line. Since a cell is tens of kilometres
wide, a coast crosses the edge often, so the cut was the common case and not the rare one.

The rim now comes from the worker as a second grid. It reads the same globe field and the same
hill noise the patch reads, so the relief and the coast run on across the join. Three numbers set
it. The reach is 3,150 units. The ceiling of 1,200 m put the camera at most 1,420 units from the site
with the fog solid at 2,100 units, so a ray from that height met the ground 1,723 units out. The
ceiling of issue 20 asks for 2,830 units, so the value keeps its margin. The reader can therefore
never see the outer edge. The cell is 25 patch steps, which is
50 units on HIGH and 100 on LOW; it divides the box, so the edge of the patch lands on a rim grid
line and every rim node there sits on a patch vertex. The globe field takes one sample per two rim
cells, because the rim covers about 18 times the area of the cell and a grid at the density of the
patch would cost more than the whole build.

Two rules keep the join clean. `ground.js` copies the height and the colour of the rim nodes on the
edge from the patch, and it draws four dense strips that carry one vertex per patch step on the
edge and the same count on the first coarse line of the rim. A height read along a grid line of
the rim lies on the straight edge of the coarse cell beyond it, so neither side of a strip leaves
a crack. The patch also fades its knolls and its rock out over the last two rim cells: both waves
are shorter than one rim cell, so the rim cannot carry them, and a patch that held them to its
last row would draw a line the reader sees from the ceiling.

The sea follows. It now reaches 2,700 units from the camera target, which covers the fog from any
height and still stays inside the rim, and a patch with no water gets a sea when the rim holds
water. The whole rim is one mesh with the material of the terrain, and it costs under 0.1 ms of
draw time.

**The tap marches the height field.** A tap needs the point of the ground under the pointer. A triangle test against the terrain runs over a million faces. A march along the ray over the height grid costs about 450 steps and a bisection, it reads the rim as well as the patch, and it does not care which meshes issues 05, 07, and 09 add later.

**The pivot follows the view to the ground, and a glide to a thing takes a band.** Added with the
flight keys. The camera always looks at its target, and the distance between the two sets what a
drag swings the camera about, what one wheel step is worth, and where a glide leaves the reader.
The old rig tied that distance to the height, because the reader came down by zooming in. The
flight keys carry the target along and never change the distance, so a reader who flew to the
ground still held the distance the probe landed with, 990 units, and a focus on an animal parked
them 660 units from it. The shadow box followed a target outside the frame for the same reason.

So `_seatTarget()` walks the pivot down the view ray to the ground the view points at, once the
camera is where the frame leaves it. It only ever comes in; the wheel and the zoom keys own the way
out, because a reader who wants to stand back asks for it. The target holds the same ray, so the
camera does not move and the reader sees nothing happen. The seat waits while a pointer is down: a
drag turns the camera about the pivot, and a pivot that moved under a held pointer would carry the
camera with it.

The pivot is now honest about what the reader looks at, and that is still the wrong number for a
glide to an animal: a reader standing on the patch holds a few units and would land inside it. So a
glide to a thing, an animal or a plant, ends between `GLIDE_NEAR` and `GLIDE_FAR`, 12 and 120
units. A tap on bare ground keeps the old rule and travels, because there the distance is the whole
point of the gesture.

**The seam for the fauna.** Issue 09 sets `ground.pickCreature(ndcX, ndcY, event)`. A tap asks `pickCreature` first. A hit marks the animal with a ring, glides to `hit.point`, and reports the species through `onSelect`; the app then offers the card on the floating button. A tap on the ground takes the mark off through `onDeselect`. Without issue 09 `pickCreature` is null and every tap is a ground tap.

**A tap on a flyer turns the view, it does not walk it.** Added with issue 17. The glide of issue 06
moves the target, and the target rides the ground, so a glide to a flyer aims the view at the ground
under it and the animal leaves the top of the frame. `turnTo()` swings the offset from the target to
the eye instead, until the view points at the flyer. The eye keeps its place, the clamp carries the
target up into the sky, and the reader looks up at the animal. A flyer under the eye takes the
ordinary glide, because the reader there stands over it and has to come down to it. The turn ends
inside `maxPolarAngle`, the reach the drag of the reader has at that height, or the controls would
pull the view back at the end of the glide.

A flyer also takes no occlusion test. The tap drops an animal that stands farther away than the
ground the ray meets, because that animal is behind the hill the reader tapped. A flyer hovers over
the ground, so the ray that passes under it always meets the ground nearer than the flyer stands,
and the test would drop every flyer the reader can see.

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

### What the sea costs

Added with issue 05, the ground sea. The numbers come from a timer query of the graphics card around one `Ground.render`, at the camera the probe lands with, on a coastal site, with a draw buffer of 3,024 by 1,572. 140 samples.

**The sea is bound by its triangles, not by its pixels.** A first build put 1 m cells over a square 1,120 m each way from the camera target: 449,000 triangles for 2.7 ms. A test at one fifth of the pixels cut that by 0.3 ms, so the pixels are not the cost. The terrain behaves the same way at this camera: 4.6 ms at full size and 4.2 ms at one fifth. The note above says the card is not bound by triangles; that holds for the terrain at 1.13 million triangles, but a second mesh of half a million pushes the frame past the budget.

Three cuts brought it back under the budget.

**Flat water needs no grid.** The waves fade to zero by 200 m from the camera target, so every cell past that draws a flat face. One large quad then takes the same colour, the same light, and the same fog as a thousand small ones: the light is constant over a flat face, and the fog depth is a varying, so the renderer reads it per pixel and a wide triangle fogs correctly. The sea is now a square of 1 m cells 200 m each way, an 8 m ring to 264 m, and a 108 m ring to 1,128 m: 324,000 triangles. The wave zone and the first ring meet on a line at y = 0, so the join needs no shared step and shows no crack.

**A block under land draws nothing.** The wave zone splits into 6 by 6 meshes. A mesh hides when the drawn ground stands more than 1 m over the water everywhere under it, read every 4 m. The test can only keep too much, and the terrain is opaque, so the reader loses no water. On the coast it drops 12 of the 36 meshes and takes the drawn sea to 217,000 triangles. The mask runs again when the plane follows the target to a new whole metre.

**The water keeps one side.** At a low eye the waves turn about half the facets away from the camera. A double-sided material draws them all; the front side alone saved 0.5 to 0.7 ms. The camera floor holds the eye 2 m over the water, so nothing is lost.

Measured on `Auralis@-4.25,15.95`, a coast with 52% of the patch under water: terrain alone p10 3.83, median 5.18, p90 7.85; with the sea p10 5.07, median 6.56, p90 9.46. The sea adds about 1.4 ms. Another browser tab shared the card during the run, which is what the wide p90 shows; a paired run that turned the sea on and off frame by frame put the cost at 1.8 ms.

### What the knob follows

Added with issue 11, the adaptive LOD. The numbers come from a timer query of the graphics card around one `Ground.render`, 40 samples per run, on an Apple M2 with a 60 Hz display and a draw buffer of 2,600 by 1,354.

**The frame interval cannot ask for a step out.** Decision 4 gives the knob one number: the rolling frame time against the target. The display holds that interval at the refresh, so on a machine with room to spare the average sits at 16.67 ms and never falls 30% under the target. The knob would then come down under load and stay down for the rest of the session. So the clock keeps a second number, the work the app does inside one frame callback, and the two steps read one number each. The knob comes down when the interval misses the target by 10%, and it goes out when the interval sits at the refresh and the work is under 70% of the target. On a machine that draws without a vertical sync the two rules agree, because the work is then a part of the interval.

**A step down buys three seconds of quiet.** At the height where the machine sits exactly at the refresh, a step out breaks the refresh and the next step comes back in. The cool time bounds that ring to one swing of 15% every few seconds instead of one every half second.

**The shadow gate needs a band.** The sun casts only while the camera is lower than the LOD distance over the ground, so the knob now moves the gate. One threshold rings: the shadow starts, the frame gets slower, the knob comes in, the gate goes over the camera, the shadow stops. The gate now turns off over 1.35 LOD distances and back on under 1.05, a band of 29% against a step of 15%, and it holds each state for 1.5 s. Measured at 56 m over the ground on `Vesper@10.00,150.00`, with the knob driven from 400 m to the 40 m floor and back: one switch off at 41 m and one switch on at 53 m, none between.

**The knob spends the room it finds.** On this machine the forest site settles at the 400 m ceiling at every camera height, and the frame holds the refresh. At 45 m over the ground that is 3,955 near plants and 122 near animals instead of about 500 and 16 at the 150 m start, for a median of 5.79 ms against 5.61 ms before the issue. The coast `Auralis@-4.25,15.95` at 27 m reads 7.51 ms at 400 m against 6.62 ms at 150 m. Under a load the knob walks from 400 m to the 40 m floor in 7.5 s, and it walks back in 12 s once the load goes.

### What the low tier gets

Added with issue 13. The numbers come from the same timer query of the graphics card around one `Ground.render`, on an Apple M2 with a 60 Hz display, at least 40 samples per run.

**One object holds the tier.** `Q.ground` in `app.js` carries the grid step, the plant cap, the animal cap, the shadow flag, and the LOD ceiling. The worker request, the `Ground` constructor, the flora, the fauna, the sky, and the knob all read that one object, so a change to the budget table is a change to one line.

**The knob takes a lower ceiling on LOW.** The ceiling is 400 m on HIGH and 250 m on LOW. A weak machine cannot hold the frame at 400 m, so a knob that walks out to 400 m only walks back down again, and the reader sees the plants swap twice for nothing. The `localStorage` key of issue 11 now carries the ceiling as well, so a value that settled at 400 m on HIGH cannot come back into a LOW session; the constructor also clamps whatever it reads, which repairs an entry that a build before this issue wrote.

**LOW costs about a third less than HIGH at the same pixels.** Measured on `Vesper@10.00,150.00` at 45 m over the ground, both tiers at a draw buffer of 2,600 by 1,354:

| Tier | p10 | median | p90 | app work |
|---|---|---|---|---|
| HIGH: 2 m grid, 20,000 plants, 299 animals, shadows | 5.01 ms | 5.84 ms | 8.62 ms | 2.72 ms |
| LOW: 4 m grid, 6,000 plants, 91 animals, no shadows | 1.64 ms | 3.73 ms | 3.98 ms | 1.83 ms |

At the pixel count a phone really asks for, 589 by 1,090, the same LOW site reads 1.19 / 1.31 / 1.43 ms, and the coast `Auralis@-4.25,15.95` with terrain, sea, plants, and animals reads 1.65 / 1.78 / 1.88 ms.

**No shadow costs nothing on LOW.** `renderer.shadowMap.enabled` never turns on, the light takes no shadow map, no ground mesh takes `receiveShadow`, and the gate of issue 11 returns at its first line. The shadow pass therefore does not exist on the low tier, rather than drawing an empty map.

**The worker is not the limit.** A LOW patch is a grid of 376 by 376 against 751 by 751 on HIGH, so it costs about a third of the time. In Chrome on this machine a LOW patch takes 74 to 407 ms, and outside the browser, in Node with a stub for `self`, the median is 281 ms against 930 ms on HIGH. The floor of the dive is 1,200 ms, so the build hides inside it with room to spare and the rock octave keeps its full reach. The three noise octaves cost about 45 ms each of the 281 ms; a cut of the rock octave to a circle of 500 m saves 27 ms, which is not worth a ring in the terrain where the octave stops.

**The overlay moved to the top right.** The sidebar owns the left of a wide screen from the top to the foot, and on a screen under 600 px it docks at the foot as a sheet. The overlay of `?perf` draws over the page, so at the lower left it covered the probe button of the sheet: measured on a viewport of 375 by 667, the old box stood at y 488 to 659 and the button at y 560 to 595. The top right is free in both layouts.

**The sheet hid the probe button as well.** The body of the sidebar is the one scroll region, and on a viewport of 375 by 667 it holds 386 px of a scroll height of 1,496 px. A world with a tall card then puts the probe button at y 629, under the footer at y 626 to 667, and the reader who opens the sheet sees no button at all. So an expand of the sheet, and a change of what the button says, bring it into view. The scroll only moves while the button stands outside the body, so the reader who scrolled somewhere else keeps that place, and a wide screen where the button already shows never moves.

### What the carrier holds

Added with issue 34. These notes record the constants and the reasons the issue text did not fix.

**The error, `CARRIER_ERR = [3, 25]` in `site.js`.** The error is 3 degrees on the cell of the
source and 25 degrees at its antipode, straight in the arc. Three degrees is tight enough that a
near fix reads as an answer, and 25 degrees is wide enough that two fixes from two continents cross
over a region and not over a point. The pair is a first value, and it stays open: the plan asks for
a tune by hand on five worlds, against a median search of three to five landings.

**The range, `CARRIER_RANGE = 6` cells in `site.js`.** The range says nothing further out than 6
cells of arc, which is 0.06 rad, or about 360 km on a world of 6,000 km. A range at every arc turns
the search into one landing and a walk of the number down. A range inside 6 cells turns the last
phase, home, into a phase the reader can finish.

**The strength, in `probe-hud.js`.** One word states the strength, so a reader with the sound off
loses no fact. `CARRIER_HERE` is 0.001 rad, a tenth of a cell: the fix snaps to the middle of its
cell, so the arc on the cell of the source is small but never zero. `CARRIER_STRONG` is 0.06 rad,
which is the 6 cells the range covers, so "strong" and a number arrive together. `CARRIER_CLEAR` is
0.6 rad, a fifth of the half circle, where the error stands under 8 degrees and two fixes cross
tight.

**The wedges are paint, `MAX_WEDGES = 8` in `carrier-globe.js`.** A wedge runs to the antipode of
its site, so the first build put it on a shell of 1.07, over the relief of 0.06 and under the inner
atmosphere shell of 1.115. The aim camera comes to 1.11, and from there the sheet held a large
parallax against the ground: the reader saw two sheets cross in the sky and could not say which
cell stood under the cross. `patchCarrierMaterial()` now paints the wedges into the terrain
material and the ocean material of the world, so a wedge lies on the ground it marks at every
camera and no shell stands anywhere.

A fragment takes its direction in the local frame of the planet, so the wedges turn with the world
for free. A wedge is three unit vectors: the site `s`, and the inward normals `nL` and `nR` of the
two edge great circle planes. The pair of tests `dot(d, nL) > 0` and `dot(d, nR) > 0` gives the lune
between the two planes, and a lune runs from the site to the antipode of the site and no further,
which is decision 5 with no further rule. The rule holds while the error stands under 90 degrees,
and `carrierAt()` states at most 25.

Eight slots hold 112 floats, which every driver carries, and eight fixes is already more of a cross
than a reader can read; a world with more fixes paints the 8 newest. Each wedge that covers a
fragment adds one step of the accent: `1 - pow(0.92, n)` of the way from the lit colour to the
accent, plus 0.06 of the accent as an emissive share, so a wedge on the night side of a planet is
not black on black. One wedge reads 0.08, two read 0.15, and three read 0.22. The first value was
0.18 a wedge, and three wide wedges then drowned the terrain in the accent. The wash is now light,
and a line 0.3 degrees wide on each edge, at 0.5 of the accent, carries the shape: the eye finds
the cross as the region the lines close. The sea is see-through, so the sea bed under it paints no
wedge; `uWedgeSea` holds the radius of the sea for that test. Each edge takes a soft
band of 0.15 degrees, measured on the angle to the edge plane and not on the plane distance, so the
band holds one width from the site to the antipode and the edge does not crawl on the facets of the
globe, which are 0.6 degrees of arc across. That is the whole display of the cross.

The cost: the loop runs on every fragment of the planet and of the sea, which is the disc of the
globe on the screen. A world with no fix reads one integer uniform and stops. A fix costs about
twenty arithmetic operations, so eight fixes add about 160 against the several hundred the lighting
of a `MeshStandardMaterial` already spends on the same fragment. No texture is read, and the branch
never diverges inside a draw, because every fragment runs the same count.

**The ring of a find and the dot of a fix lie on the terrain.** The ring is 72 steps of a circle 1.5
cells out, in a band 0.3 cells wide. The dot is a disc 0.35 of a cell across at the site of a fix.
Each vertex of both stands at the ground under it or at the sea over it, plus a lift of 0.014 globe
units. The flora of the globe stands 0.011 units tall, and a lift under that put the ring below the
trees of a forest, where the reader saw no ring. The lift also covers the gap between the smooth
height map and the facets of the globe: measured over 184,320 facets on each of five worlds, a
facet stands over the map by 0.0076 units at the 99.9th percentile on the worst world, and 0.014
therefore clears the facets as well as the trees. `depthTest` stays on, so the globe still hides
the part behind it. The dot stood at 0.006 units on the shell of the wedges before, where it read
as a large disc in the sky. `LIFT` in `site.js` holds the same measurement for the square of the
aim marker, which drapes the same way at 0.006.

**The disc of 14 units, `SOURCE_DISC` in `worker.js`.** The worker flattens a disc of radius 14
units under the wreck, holds the inner 55% of it flat, and carries a soft edge over the rest. It
also keeps the plants, the grass, and the group anchors off the disc, as `patchActivity()` does for
the phenomenon. The body of the wreck reaches 13.3 units from its own axis, so a radius of 14 holds
the whole of it and leaves a thin skirt of scorched ground. A wider disc reads as a hole in the
forest, and a narrower one lets a plant stand under the hull.

**The mast of 18 units, `MAST_H` in `ground-source.js`.** The reader walks to the wreck across the
cell, so the wreck has to read from far away. The hull is 13 units long and it leans 30 degrees, so
a forest can hide it. The mast carries the lamp to 18 units and it stands nearly upright, because a
mast that lay with the hull would say nothing at range. The lamp draws with the fog off: a lamp the
fog took would go out at the distance the reader first looks for it. The whole body is 400
triangles, well under the 1,500 the plan allows.

**The bounds of the store, `MAX_FIXES = 64` and `MAX_SEEDS = 200` in `carrier-store.js`.** A fix
writes about 46 characters of JSON, so 64 fixes take about 3 kB and 200 seeds take about 590 kB at
the very worst. That stands well inside the 5 MB most browsers hold. A reader who needs 64 landings
on one world has a broken instrument, and 200 seeds is over three times the 60 worlds the sidebar
keeps, so neither bound can bite a real search.

## Phases

- **Phase 0.** Globe fixes, decision 8.
- **Phase 1.** The probe: descent, ground terrain, sea plane, flora with cards, fauna in groups with coarse far meshes, adaptive LOD, ground camera, URL site.
- **Phase 2.** Ground-scale phenomena, sea species, herd behaviour on the group anchor. Until ground phenomena exist, the pull in decision 2 targets species homes only.
