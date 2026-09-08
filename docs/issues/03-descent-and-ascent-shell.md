# 03 Descent and ascent shell

Status: CLOSED, 2026-09-09, merged as 2ca24b1.

Type: AFK. Phase 1. Blocked by: 02. Read `docs/issues/README.md` first, in particular "App mode" and "The ground module".

## What to build

The probe descends to a placeholder ground and comes back. This is the tracer bullet through the mode state, the scene switch, the buttons, the URL, and the transition. The ground here is a flat plane in the ground colour of the palette with fog and a sky dome. No terrain, no life.

1. **Mode state.** Add `mode` to `app.js` with the four values. `frame()` renders the globe in `orbit`, `descending`, and `ascending`, and the ground in `ground`. The globe's per-frame work is skipped in `ground` mode.
2. **Ground module.** Create `ground.js` with the `Ground` class from the contract. In this issue `load()` accepts `null` and builds: a 1,500 m plane at y = 0 in `world.palette.ground` or the atmosphere colour when there is no ground colour, a sky dome sphere of radius 5,000 m with the atmosphere colour, `scene.fog` as `THREE.Fog` in the atmosphere colour from 450 m to 750 m, a directional sun, and an OrbitControls with target at the origin, camera at 300 m up and 300 m south. `heightAt()` returns 0.
3. **Triggers.** A continued zoom in at `CAM_MIN` for half a second starts the descent. Measure with the wheel and pinch events, not with camera distance, since the camera cannot pass `CAM_MIN`. A button labelled "Send a probe to the surface" appears in the sidebar when the camera is in the pick range of issue 02 and does the same. In `ground` mode, zooming out past the 1,200 m ceiling for half a second, or a sidebar button "Recall the probe", starts the ascent. On a gas giant nothing triggers.
4. **The dive.** On descent: fix the site from issue 02, write `#Seed@lat,lon`, then animate the globe camera from its position toward the site along the surface normal for at least 1.2 s while a full-screen overlay fades to the fog colour. When the overlay is opaque, switch to `ground`, `load(null)`, and fade the overlay out over 0.6 s. The ascent is the mirror: fade to fog colour, switch to `orbit`, place the globe camera at `CAM_MIN` over the site, fade in, and remove `@lat,lon` from the hash. The dive floor of 1.2 s exists so that later issues can hide worker time inside it.
5. **Inputs.** OrbitControls on the globe must be disabled during the transitions. Escape does nothing new. The seed form, the dice, and the saved worlds still work in `ground` mode and return to `orbit` on a new world.
6. **Load with a site.** A URL with `@lat,lon` opens the world and descends at once after generation, so a shared link lands the reader on the ground.

## Acceptance criteria

- [x] Zoom to the limit and keep zooming for half a second: the view dives, fades to the atmosphere colour, and a flat plane with a sky and fog appears.
- [x] The "Send a probe to the surface" button does the same. The "Recall the probe" button returns to orbit at `CAM_MIN` over the same site, with the marker under the crosshair.
- [x] Zooming out on the ground past 1,200 m returns to orbit.
- [x] The URL carries `@lat,lon` on the ground and not in orbit. Reloading a ground URL lands on the ground after generation.
- [x] Typing a new seed on the ground returns to orbit and generates the new world. Saved worlds and the dice work the same.
- [x] A gas giant never descends and shows no probe button.
- [x] Frame time on the placeholder ground is under 4 ms on HIGH.
- [x] `README.md` "Controls" and "How it works" describe the probe. Add `docs/probe.md` to the reading list in `README.md`.

## Result

Verified by hand on 2026-09-09 in Chrome, HIGH tier, an 8-core Mac, a 60 Hz display.

- Frame time on the placeholder ground: the average interval of the README snippet is 16.59 ms over
  300 frames, which is the 60 Hz cap. The interval cannot show the budget, so the work inside the
  frame callback was measured over the same 300 frames: 0.351 ms average, 1.400 ms maximum, against
  a budget of 4 ms. Two draw calls, 722 triangles.
- Determinism: `#Auralis@12.50,-73.25` was opened twice. Both runs land on the ground with the same
  world type, the same flora and fauna counts, and the same sky and ground colours.
- Two world types: `Auralis` is terran and `Pelagia` is desert. Both descend, and each ground takes
  the colours of its own palette.
- The round trip is exact. The probe went down at 25.25, 86.02 and came back to orbit at a camera
  distance of 1.1100, which is `CAM_MIN`, with the site again at 25.25, 86.02.
- `Quasar-42` is a gas giant. It shows no marker, no probe button, and neither the zoom hold nor a
  direct call to `descend()` starts a dive. The hash never gets a site.

Two notes for the reader of the next issue:

1. **The URL rule moved.** Issue 02 wrote `@lat,lon` into the hash whenever the camera was in the
   pick range. The contract in `docs/issues/README.md` says a URL without `@` means orbit, and this
   issue makes the hash carry the site only while the probe is down. So the third acceptance
   criterion of issue 02 now ends on the ground instead of in orbit, which is what item 6 of this
   issue asks for. The share button still copies the site in the pick range, as issue 02 states.
2. **The damping rest.** `placeCameraOverSite` now drops the damped rest of a drag or a zoom before
   it places the camera. Without that the camera came back from the ground at 1.1224 units and about
   1.5 degrees off the site, because `OrbitControls` kept the deltas of the zoom that started the
   dive and applied them on the next update.

## Blocked by

- 02 Site in the URL and the pull to life
