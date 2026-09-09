# 13 LOW tier pass

Status: CLOSED, 2026-09-09, merged as 4f861c1.

Type: AFK. Phase 1. Blocked by: 05, 06, 11, 12. Read `docs/issues/README.md` first.

## What to build

The probe works on a phone and on a weak laptop.

1. **Budgets.** Apply the LOW row of the budget table: 4 m grid, 6,000 flora, 100 fauna, no shadows, `lod.max` 250 m. Make the ground tier read the tier from one object, `Q.ground`, next to `Q` in `app.js`.
2. **Memory.** Dispose the patch geometry, the cards, and the render targets on ascent and on a new world. Check with `renderer.info.memory` that geometries and textures return to the orbit numbers after a descent and an ascent.
3. **Phone.** Verify in devtools with a Pixel 5 and an iPhone SE emulation, coarse pointer, 4x CPU throttle: descent, terrain, sea, flora, fauna, glide, recall. The sidebar sheet must not cover the probe buttons.
4. **Worker time.** A patch on LOW must finish under 1.5 s so the dive floor hides most of it. Profile the worker and reduce the patch noise cost if needed, for example by evaluating the rock octave only within 300 m of the site.

## Acceptance criteria

- [x] Frame time on LOW emulation with 4x throttle settles within 20% of the target on a forest site with a herd.
- [x] `renderer.info.memory` returns to orbit values after three descents and ascents.
- [x] All gestures and buttons work in both phone emulations.
- [x] Worker patch time under 1.5 s on LOW settings.
- [x] `README.md` states what LOW devices get.

## Decisions

**The devtools throttle and the device emulation are out of reach.** The browser tools expose
neither. The agent used a coarse-pointer copy of the page in an iframe at the phone's CSS size, and
loaded the machine with a busy wait inside the frame and with a raised pixel ratio. Criteria 1 and 3
pass against those substitutes, not against the devtools controls the issue names. An earlier issue
met the same wall for the phone case.

**The rock octave keeps its full reach.** Item 4 offers to cut it to a circle of 300 m if the worker
is slow. It is not: a patch takes 281 ms median on LOW against a dive floor of 1,200 ms. The cut
would save 27 ms and risk a ring in the terrain, so it was not made.

**One shared contract changed, as the issue mandates.** `ground.lod.max` is a tier value now, 400 on
HIGH and 250 on LOW. The LOD contract in `docs/issues/README.md` was updated in the same commit, as
the rule for a contract change requires.

## Verified at merge

The manager re-ran criterion 2 on `main`. Three descents and ascents on `Vesper@10.00,150.00`:
orbit 14 geometries and 1 texture, ground 125 and 2, back to 14 and 1, the same on every pass, and
`__mw.ground` null in orbit. No leak. The console holds no error or warning across a full session.

## Blocked by

- 05 Ground sea and shoreline
- 06 Ground camera: pan, clamps, glide
- 11 Adaptive LOD and the perf overlay
- 12 Sky continuity: sun, moons, rings, clouds
