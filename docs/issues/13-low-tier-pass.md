# 13 LOW tier pass

Type: AFK. Phase 1. Blocked by: 05, 06, 11, 12. Read `docs/issues/README.md` first.

## What to build

The probe works on a phone and on a weak laptop.

1. **Budgets.** Apply the LOW row of the budget table: 4 m grid, 6,000 flora, 100 fauna, no shadows, `lod.max` 250 m. Make the ground tier read the tier from one object, `Q.ground`, next to `Q` in `app.js`.
2. **Memory.** Dispose the patch geometry, the cards, and the render targets on ascent and on a new world. Check with `renderer.info.memory` that geometries and textures return to the orbit numbers after a descent and an ascent.
3. **Phone.** Verify in devtools with a Pixel 5 and an iPhone SE emulation, coarse pointer, 4x CPU throttle: descent, terrain, sea, flora, fauna, glide, recall. The sidebar sheet must not cover the probe buttons.
4. **Worker time.** A patch on LOW must finish under 1.5 s so the dive floor hides most of it. Profile the worker and reduce the patch noise cost if needed, for example by evaluating the rock octave only within 300 m of the site.

## Acceptance criteria

- [ ] Frame time on LOW emulation with 4x throttle settles within 20% of the target on a forest site with a herd.
- [ ] `renderer.info.memory` returns to orbit values after three descents and ascents.
- [ ] All gestures and buttons work in both phone emulations.
- [ ] Worker patch time under 1.5 s on LOW settings.
- [ ] `README.md` states what LOW devices get.

## Blocked by

- 05 Ground sea and shoreline
- 06 Ground camera: pan, clamps, glide
- 11 Adaptive LOD and the perf overlay
- 12 Sky continuity: sun, moons, rings, clouds
