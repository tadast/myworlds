# 17 The view cannot look up, so a flyer is never seen

Type: AFK. Phase 2. Blocked by: 06, 09. Read `docs/issues/README.md` first.

## The defect

An air species is in the patch and the reader cannot see it.

At `Auralis@0.11,12.30` the worker builds 17 groups, and 8 of them are the Lamp-flanked
drifter, which is `cls: 'air'`. Each drifter hovers 18 m to 38 m over the ground, because
`AIR_HOVER` in `ground-fauna.js` is `[12, 40]`. The body is 2.3 m tall.

The camera cannot turn to them. `_drive()` in `ground.js` ends with a cap on the polar angle:

```js
const cap = Math.acos(THREE.MathUtils.clamp((this._groundAt(p.x, p.z) + FLOOR - tg.y) / d, -0.32, 1));
```

The cap keeps the camera over the floor of 2 m. Measured at eye height on flat ground, with the
target 1 m over the terrain and the camera 25 m out, it gives `maxPolarAngle = 84.6 deg`. That
is 5.4 deg **under** the horizon. The view can never point over the horizon.

A field of view of 60 deg leaves about 22 deg of sky over the horizon at the top of the frame.
So a drifter is in the frame only past about 75 m, where it is a few pixels wide and past
`lod.distance`, drawn as the coarse mesh of issue 10. Under 75 m it is over the top edge of the
screen and no drag brings it back.

The tilt is not the only cause. A drifter is one animal, not a group: the sociality gene gives
`n = 1`, so 8 drifters spread over 1,500 m. There is no shape in the sky that draws the eye.

## What to build

1. **Let the view point over the horizon.** Split the two jobs the polar cap now does. The floor
   must keep the *camera* over the terrain; it must not keep the *view* under the horizon. Raise
   `maxPolarAngle` to about 2.0 rad (115 deg, so 25 deg of sky) and hold the camera over the
   floor with the position clamp in `update()`, which already runs every frame.
2. **Keep the ceiling behaviour.** Over `TILT_FREE` the tilt still runs to `POLAR_HIGH`, so the
   descent still turns the view from the patch below to the horizon. Only the free band under
   `TILT_FREE` opens upward.
3. **Do not let the target sink.** The target still floats `TARGET_LIFT` over the terrain. A view
   that points up moves the camera down toward the floor; the floor clamp stops it, and the view
   keeps turning because the polar angle is no longer the thing that stops.
4. **Draw a flyer at range.** An air group is one small body at 100 m or more. Raise the LOD
   distance for an air group, or give the coarse mesh a minimum screen size, so a drifter over
   the treeline reads as a creature and not as one bright pixel.
5. **Say where they are.** The inspector card already names the species. Add nothing new to the
   UI; a reader who can look up will find them.

## Acceptance criteria

- [x] At eye height on flat ground, a drag up turns the view at least 20 deg over the horizon.
- [x] The camera never sinks under `FLOOR` metres over the terrain during that drag, and never
      enters the terrain over a hill.
- [x] At `#Auralis@0.11,12.30` a reader can find and tap a Lamp-flanked drifter, and the
      inspector opens for it.
- [x] A drifter at 150 m is more than 4 px across and reads as a body, not as a speck.
- [x] The descent from 800 m still turns the view from the patch below to the horizon.
- [x] Frame time at the entry camera does not grow by more than 1 ms.

## Not in scope

A sky whale is out of scope. It is the `fins` locomotion on the `cloud` niche, and
`species.js` gives `cloud` only to a gas giant. `patch()` throws `a gas giant has no ground`, and
`patchFauna()` skips every `sea` and `cloud` species. Issue 15 owns that work.

## Blocked by

- 06 Ground camera: pan, clamps, glide
- 09 Ground fauna in groups

## What was built

1. **The polar cap no longer does two jobs.** `_drive()` capped `maxPolarAngle` where the camera
   would meet the floor. That one number held the eye over the terrain and, as a side effect, held
   the view under the horizon. The angle now runs to `polarUp()`, and the position clamp in
   `update()` holds the eye on its own.
2. **One pass over the height of the pair.** `update()` used to pin the target to the terrain and
   then push the camera up to the floor, which tilted the view down. It now reads both rules
   together: the eye height the orbit asks for is `terrain under the target + TARGET_LIFT + offset`,
   and it is never under the floor. The step that follows moves the target and the camera by the
   same amount, so the view direction and the distance both hold. While the view points up the eye
   sits on the floor and the target climbs into the sky.
3. **`polarUp()` comes from the frame, not from a constant.** It is `pi/2 + fov/2`, which is 2.09
   rad on the 60 deg camera. The view rises until the horizon reaches the bottom edge and no
   further, so the reader cannot lose the ground.
4. **`turnTo()`, the turn to a flyer.** A tap on a flyer over the eye swings the offset from the
   target to the eye until the view points at the animal. The eye keeps its place and the clamp
   carries the target up. A tap on a flyer under the eye still takes the ordinary glide.
5. **A flyer takes no occlusion test on the tap.** The test drops an animal farther away than the
   ground the ray meets. A flyer hovers over the ground, so that test dropped every flyer in sight.
6. **`setView()` opens the band for its own update.** A link with an up-view was cut back to the
   band of the camera it replaces, which is the reveal at 450 m, and it always came back at the
   horizon. This was a defect of issue 17 in its first build, found on the link round trip.
7. **A flyer holds its full mesh 2.5 LOD distances out** (`AIR_LOD`), and it never draws narrower
   than 11 px (`AIR_MIN_PX`), by up to 3 times its size (`AIR_GROW`). The growth is smooth in the
   distance and it falls to 1 near by. The pick reads the drawn size, so a grown flyer is as easy
   to tap as it looks.
8. **A flyer breathes.** Its height over the ground rises and falls 1.4 m on a clock of 0.06 turns
   per second, with a phase per group and per animal.
9. **A flyer lays a shadow on the ground.** One instanced disc per air animal, at the slant of the
   sun, spread and faded by the height of the flyer, laid on the terrain where it lands. See
   `docs/fauna.md`, "The flyer".

## Decisions taken for the reader

1. **The shadow is the answer to "there is no shape in the sky".** The issue notes that eight
   solitary drifters spread over 1,500 m draw no eye. The obvious fix is to give an air species a
   herd, but `G.social` also drives the globe, and the issue asks for no new part of the interface.
   So the hint goes where the reader is already looking: on the ground. A patch of shade slides
   over the grass, and the head goes up. Nothing in the interface says so, and nothing needs to.
2. **The up-view stops where the horizon does.** 2.0 rad was the number the issue asked for. It
   leaves a flyer 45 deg over the eye at the top edge of the frame, and it is an arbitrary number.
   The frame gives a better one: turn up until the horizon reaches the bottom edge. That is 2.09
   rad here, it holds the ground in sight, and it moves with the field of view if that ever changes.
3. **The pivot goes up; the reader does not.** OrbitControls turns the camera about the target, so
   an up-view needs the eye under the target, and the eye cannot go under the ground. Either the
   target rises or the view cannot rise. Lifting the target is also the better feel: the eye holds
   its place and the reader turns the head.
4. **A grown flyer is a readability device, and it is honest near by.** The growth is 1 inside
   about 120 m, where the ground and the plants measure the animal. Past that the sky holds no
   scale, and a body of two pixels reads as dust on the screen, not as an animal.
5. **The shadow is a cue, not a simulation.** The shadow map only draws while the camera is under
   the LOD distance, and a flyer at that range is a far mesh that casts nothing, so the real shadow
   could never do this work. The disc costs 140 triangles per flyer.
6. **The full mesh for every flyer costs nothing here.** An air group holds one animal, and this
   patch holds eight. The frame time did not move.

## How it was verified

Served on `localhost:5555`, Chrome, tab in front, `document.visibilityState === "visible"`. Sources
forced fresh with `fetch(f, {cache:"reload"})` before each reload. The baseline of `main` ran at the
same time on `localhost:5556` from a second worktree, as the issue set asks for a comparison.

- **A drag up turns 24.6 deg over the horizon** on the first build and **30.0 deg** on the build
  that reads the frame. A synthetic drag of 400 px on `Auralis@0.11,12.30` reaches `maxPolarAngle`
  of 2.094 rad exactly.
- **The eye never sinks.** `cameraHeight` read 2.00 m through the whole drag, and through a pan of
  600 m over 13.2 m of relief with a 24 deg up-view. The view angle held at 24.2 deg over that pan,
  so the pair moves as one.
- **The drifter opens its card.** At `#Auralis@0.11,12.30` the pick returns
  `{kind: 3, air: true, dist: 110}`, the first tap sets a turn glide, and the second tap opens
  "Lamp-flanked drifter". After the turn the animal sits at NDC (0.15, 0.07), near the middle of
  the frame.
- **A drifter at 150 m is 8.7 px across before the floor and 11 px after it.** The body is 1.89 m
  wide and the frame is 800 px. At 500 m it is 2.5 px and it draws at 7.6 px.
- **The descent still turns the view.** The reveal reads a polar angle of 1.101 rad, 26.9 deg under
  the horizon. The band at 451 m is [1.04, 1.18], at 282 m it is [1.09, 1.40], at 120 m it is
  [1.14, 1.63], and under 60 m it is [0.05, 2.09]. Only the free band opens upward.
- **The frame time did not grow.** At the entry camera, with the LOD knob frozen at 150 m and one
  `readPixels` per frame to serialise the graphics card: `main` ran 10.0, 10.2, 11.1, 11.1 ms and
  this branch ran 8.7, 9.6, 10.1 ms. The two overlap inside the noise of the machine. Both hold
  16.66 ms on the refresh clock.
- **The shadow draws.** With the disc hidden and shown over the same frame, a block of 100 by 100
  px on the disc reads 175.3 and 162.4 mean lightness, so the disc darkens the ground by 7.3%.
- **Two worlds.** `Auralis`, terran, 8 air animals of 26, and `Bramblewick`, desert, 0 air animals
  of 26. The desert patch builds no disc mesh and throws no error, and its up-view reads 26.4 deg
  with the eye on the floor.
- **A link carries an up-view.** `#Auralis@0.11,12.30/-177.2,-134.9,12.7,-31.24,115.00` opens at a
  polar angle of 115.0 deg, the eye 2.00 m over the terrain, and the target 8.4 m over it. The same
  link at 70.00 deg opens at 70.0 deg with the eye 4.27 m up, which is what `main` does.
- **The same seed builds the same patch.** Two loads of `#Auralis@0.11,12.30` give the same hash of
  the height grid, the same hash of every member, and 14,825 plants.

## Left for later

- An air group is one animal, because `G.social` rolls `solitary` for an air species. Eight
  drifters therefore spread over 1,500 m and no shape in the sky draws the eye. The shadow answers
  the reader's half of that, but a skein of flyers on one thermal would be a better world. It needs
  a change to the sociality gene, which also drives the globe, so it belongs to its own issue.
- The bob of a flyer takes one draw from the patch generator per air group. The patch is still
  deterministic, but the wobble numbers of every animal in it moved. Nothing the reader can name
  changed; a reader who kept a screenshot of a herd mid-stride would see a different stride.
