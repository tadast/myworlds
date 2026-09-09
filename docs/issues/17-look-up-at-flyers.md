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

- [ ] At eye height on flat ground, a drag up turns the view at least 20 deg over the horizon.
- [ ] The camera never sinks under `FLOOR` metres over the terrain during that drag, and never
      enters the terrain over a hill.
- [ ] At `#Auralis@0.11,12.30` a reader can find and tap a Lamp-flanked drifter, and the
      inspector opens for it.
- [ ] A drifter at 150 m is more than 4 px across and reads as a body, not as a speck.
- [ ] The descent from 800 m still turns the view from the patch below to the horizon.
- [ ] Frame time at the entry camera does not grow by more than 1 ms.

## Not in scope

A sky whale is out of scope. It is the `fins` locomotion on the `cloud` niche, and
`species.js` gives `cloud` only to a gas giant. `patch()` throws `a gas giant has no ground`, and
`patchFauna()` skips every `sea` and `cloud` species. Issue 15 owns that work.

## Blocked by

- 06 Ground camera: pan, clamps, glide
- 09 Ground fauna in groups
