# 06 Ground camera: pan, clamps, glide

Type: AFK. Phase 1. Blocked by: 04. Read `docs/issues/README.md` first.

## What to build

The camera on the ground becomes a way to explore, not just to look.

1. **Pan.** Enable OrbitControls pan with `screenSpacePanning = false`, so pan slides the target along the ground. Right-drag and two-finger drag pan. The target follows the terrain: after each update set the target y to `heightAt(target.x, target.z)` plus 1 m. The target stays within 450 m of the site.
2. **Speeds.** Scale rotate, pan, and zoom speeds with the camera height, the way `frame()` does on the globe with `near`. Near the ground a wheel step moves a metre or two, at the ceiling it moves a hundred.
3. **Tilt.** From the ceiling down to about 60 m the view tilts toward the horizon, as on the globe with `pitch`. Below 60 m the user has full control of the polar angle within `minPolarAngle` and a `maxPolarAngle` that keeps the camera above the terrain floor.
4. **Glide.** A click or tap on the ground that is not a drag moves the target to the hit point over 0.8 s with ease-out, and shortens the camera distance by a third if it is above 200 m. A click on a creature does the same, then opens the inspector, which issue 09 wires. Until issue 09 lands, only ground clicks glide.
5. **Reveal.** Entering the ground from the dive puts the camera at 800 m up and 800 m south of the site, looking at the site. The first thing the user does is zoom in.
6. **Phone.** One-finger drag orbits, two-finger drag pans, pinch zooms, tap glides. Test with devtools device emulation.

## Acceptance criteria

- [ ] From the ceiling you can zoom to 2 m above the ground in a smooth series of wheel steps without overshoot into the terrain.
- [ ] Pan moves across the patch and stops at the fog start. The target never sinks under a hill.
- [ ] A click on the ground glides the view there. A drag does not.
- [ ] On a phone emulation all four gestures work and the sidebar sheet still folds on a tap.
- [ ] No change to the globe controls.
- [ ] `README.md` "Controls" describes the ground controls.

## Blocked by

- 04 Patch terrain from the worker
