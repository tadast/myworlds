# 01 Globe scale fixes

Status: CLOSED, 2026-09-08, merged as 6d232a6.

Type: AFK. Phase 0. Blocked by: none. Read `docs/issues/README.md` first.

## What to build

Make the globe read as a stylised miniature with the right cues. Four changes, all in the globe tier:

1. **Waves.** In the ocean vertex shader in `app.js`, the wave is `sin(uTime * 1.6 + position.x * 55.0 + position.z * 31.0) * sin(uTime * 1.1 + position.y * 47.0)` scaled by `wobble`. Change it so the period is about 14 s, the spatial frequencies are half of today, and the vertical wobble is half of today. Lava oceans keep twice the wobble of water as today. Ice oceans stay still.
2. **Flora.** Scale down by 40%. Raise `Q.maxFlora` by 1.5x on HIGH, so 10,500. Keep the LOW count. The worker already caps at `maxFlora`, so the worker density rules may need a matching raise so that the cap is reached on lush worlds. Check `floraDensity` and the sampling in `worker.js` so the extra budget is used.
3. **Fauna.** Scale down by 30%. Keep the counts. Creature hover heights for `sac`, `wings`, and `fins` are in globe units in `species.js` (`HOVER`) and must scale by the same 30% so flyers do not float high above a smaller body. The click tolerance in `creatureAt()` must stay usable on a phone after the change; raise it if a coarse pointer misses.
4. **Camera.** No change to `CAM_MIN`, `CAM_HOME`, or `CAM_MAX`.

Do not change the lore numbers. They become true on the ground in later issues.

## Acceptance criteria

- [x] The ocean from the home camera distance reads as a slow shimmer, with no visible travelling swell.
- [x] Trees on a terran world are 40% smaller and visibly denser in forests. The console line `built in ... ms` shows the flora count near 10,500 on HIGH for a lush terran seed.
- [x] Creatures are 30% smaller and flyers hover proportionally. A creature is still clickable at `CAM_MIN` with a mouse and with a coarse pointer emulation in devtools.
- [x] The average frame time on the globe at `CAM_MIN` is not worse than before the change by more than 1 ms. State both numbers in the summary.
- [x] Same seed gives the same world before and after, apart from the scale and count changes. Check `Auralis`.
- [x] `README.md` "How it works" mentions the flora count change if the number appears there.

## Blocked by

None. Can start immediately.
