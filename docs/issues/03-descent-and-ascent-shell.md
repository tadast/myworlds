# 03 Descent and ascent shell

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

- [ ] Zoom to the limit and keep zooming for half a second: the view dives, fades to the atmosphere colour, and a flat plane with a sky and fog appears.
- [ ] The "Send a probe to the surface" button does the same. The "Recall the probe" button returns to orbit at `CAM_MIN` over the same site, with the marker under the crosshair.
- [ ] Zooming out on the ground past 1,200 m returns to orbit.
- [ ] The URL carries `@lat,lon` on the ground and not in orbit. Reloading a ground URL lands on the ground after generation.
- [ ] Typing a new seed on the ground returns to orbit and generates the new world. Saved worlds and the dice work the same.
- [ ] A gas giant never descends and shows no probe button.
- [ ] Frame time on the placeholder ground is under 4 ms on HIGH.
- [ ] `README.md` "Controls" and "How it works" describe the probe. Add `docs/probe.md` to the reading list in `README.md`.

## Blocked by

- 02 Site in the URL and the pull to life
