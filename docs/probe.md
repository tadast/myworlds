# The surface probe

Decision record from the design session on 2026-09-08. This document states the decisions and the reasons. It does not describe code that exists yet.

## The problem

The globe draws every moving thing at globe scale. The planet radius is 1 unit, and the stats card says 3,200 to 9,800 km. A tree is 0.011 units, about 70 km. A creature is 0.012 to 0.02 units, 80 to 130 km, and the lore says 4 m. An ocean wave is 740 km long and repeats every 4 s. The globe is a miniature about 100 creature lengths across.

## Decisions

1. **Two tiers with a hand-off.** The globe stays a stylised miniature for orbit. Past the minimum zoom, a probe descends to a ground patch at 1 unit = 1 m. A continuous true-scale zoom was rejected: it needs terrain LOD across six orders of magnitude and camera-relative rendering, because float32 runs out at about 1e-7 of the radius.
2. **Landing site.** The site is the point under the pointer while the reader aims. Changed by issue 20; it was the point under the screen centre. If a species home range lies within two patch widths, the target slides there during the descent. Open sea and ice landings stay possible. The site goes in the URL as `#Seed@lat,lon`, and the ground camera follows it as `/x,z,dist,az,pol`. The patch seed is the hash of the world seed and the quantised lat and lon.
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
7. **Ground terrain.** A square grid at 2 m per vertex on HIGH and 4 m on LOW, with a coarser rim that runs out to 3,150 units from the site. Height is the globe elevation at the site, a tilt from its gradient, and three new noise octaves seeded from the site. Relief is real metres, not the globe exaggeration. Flat-shaded vertex colours from the globe biome and palette with per-face noise. Beach, snow line, and forest mask follow the globe rules. A site within a few metres of sea level gets a sea plane with a shoreline. Waves are 2 m long at a 6 s period. No rivers or lakes in phase one.
8. **Globe fixes.** Wave period from 3.9 s to about 14 s, spatial frequency halved, vertical wobble halved. Flora scaled down 40% and count raised 1.5x on HIGH. Fauna scaled down 30%, count unchanged. Minimum camera distance unchanged. The lore numbers stay, because they become true on the ground.
9. **Ground camera.** OrbitControls with pan. Target clamped to the fog start. Camera height clamped between 2 m above the terrain and a ceiling of 500 m. The ceiling was 1.2 km until issue 20. A click on a creature or the ground glides the target there. The creature inspector opens from the same click after the glide. LOW devices get the probe with 6,000 flora, 100 fauna, and no shadows.

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

**The beach band of the globe is not a beach on the ground.** The globe paints its beach where the elevation field is below `beachW`, about 0.03 units. A globe unit is `amp * radiusKm * 1000 / 40` metres, so that band stands for about 270 m of ground. At 1 m per unit it paints a whole coastal patch as sand, and no beach strip can read. Added with issue 05: `biomeIndex()` takes the width of the beach band, and the patch passes `BEACH_M = 1.5` metres. Under the water line the patch also drops the slope rule for bare rock and mixes the bed from the shallow colour to the deep colour over `DEEP_M = 12` metres, so shallow water reads through the translucent sea. A low patch that read as one sand field now reads as grass, forest, or dry ground with a sand strip at the water.

**A coarser grid outside the fog does not help.** The obvious cut is to drop the resolution past the fog line. A test cut the drawn triangles from 727,000 to 323,000 and the frame time did not move: the card is not bound by triangles once the mesh is indexed. The cut would still show a seam at some camera positions, because the camera may stand anywhere over the patch. So the grid stays at one step everywhere, and a grid that follows the camera stays with issue 11.

### The ground camera

Added with issue 06. These notes record the decisions the issue text did not fix.

**The fog opens with the height.** The reveal puts the camera 450 m up and the ceiling is 500 m, but the fog is solid at 750 m. A fixed fog therefore paints one flat colour over the whole patch from both heights, and the reader sees nothing to zoom into. So the far distance of the fog grows with the height of the camera over the site, 1.15 m per metre, and it stops at 2,100 m. The near distance keeps the ratio of 0.6, so the depth of the fade holds. Since the ceiling of issue 20 the fog opens to 1,325 m at most, so the stop at 2,100 m no longer binds. At the ceiling the patch reads in full and the rim runs on to 3,150 units, well past the fog, so the ground never shows a cut. See "The rim carries the ground past the fog" below. `FOG_NEAR` and `FOG_FAR` keep their values and still set the pan limit and the fog at the ground.

**The tilt is a band, not a lock.** The height sets the polar angle the view wants, from 1.10 rad at the ceiling to 1.40 rad at 60 m, and a band around that angle holds the play the reader keeps. The band is 0.06 rad at the ceiling and 0.25 rad at 60 m, so a zoom in turns the view from the patch below to the horizon on its own. Under 60 m the band opens to a half turn and the reader owns the angle. A hard lock was rejected: it takes the turn of the view away from the reader for the whole upper half of the range.

**The view turns over the horizon.** Added with issue 17. Until then the band ended 5 deg under the
horizon, so the reader could never look up, and an air species that hovers 12 to 40 m over the
ground was never seen. The cap was the floor of the camera: it held the eye 2 m over the terrain,
and it read as a limit on the polar angle, because OrbitControls puts the eye under the target to
point the view up. One number did two jobs, and the job it did well hid a whole class of animal.

The two jobs now split. The angle runs to 2.09 rad and the position clamp in `update()` holds the
eye. The clamp reads both rules in one pass. The target rides the terrain and the eye keeps its
floor, and either rule moves the pair of them by the same step, so the view direction and the
distance both hold. While the view points up the eye stops at the floor and the step carries the
target up instead: the pivot of an up-view stands in the sky, tens of metres over the reader. The
reader therefore turns the head and does not walk, and a pan over relief cannot tilt the view. A
view that points down or level keeps the behaviour of issue 06, because the eye sits over the
target there and the floor does not bind.

The frame sets the 2.09 rad. The view rises until the horizon reaches the bottom edge and no
further, which is half the field of view over the horizon, or 30 deg on the 60 deg camera. A wider
angle was rejected: it fills the frame with empty sky and the reader loses the ground. A flyer that
hovers 35 m up and 35 m out stands 45 deg over the eye, and it then sits high in the frame but
inside it.

A link carries an up-view as a polar angle over 90 deg, and `setView()` opens the band of the
controls for its one update. Without that the controls cut the angle of the link against the band
of the camera the link replaces, and every up-view came back at the horizon.

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
that moves more than `TAP_SLOP` stops being a tap. The window of the double tap arms no walk either,
or a reader who holds the second tap on an animal would walk away from it instead of opening its
card.

The **keys** carry the rest. `W A S D` and the arrow keys walk, `Shift` runs, `Q` and `E` turn,
`R` and `F` tilt, and `+` and `-` zoom. The look keys turn the target about the eye, and not the eye
about the target: the reader turns the head, and a camera swung about a target 15 m away would walk
a 15 m circle instead. The walk moves the pair, so the view direction and the distance both hold and
only the place changes. The speed follows the height, as the speed of a wheel step does: 11 units a
second at eye height and 150 at the ceiling, and `Shift` multiplies by 2.6. An editable element
takes every key first, so a reader who types a seed does not walk.

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

**The seam for the fauna.** Issue 09 sets `ground.pickCreature(ndcX, ndcY, event)` and `ground.onCreatureTap(hit)`. A tap asks `pickCreature` first. A hit glides to `hit.point` and calls `onCreatureTap` when the glide ends, so the inspector opens after the glide. Without issue 09 both are null and every tap is a ground tap.

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

## Phases

- **Phase 0.** Globe fixes, decision 8.
- **Phase 1.** The probe: descent, ground terrain, sea plane, flora with cards, fauna in groups with coarse far meshes, adaptive LOD, ground camera, URL site.
- **Phase 2.** Ground-scale phenomena, sea species, herd behaviour on the group anchor. Until ground phenomena exist, the pull in decision 2 targets species homes only.
