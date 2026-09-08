# 11 Adaptive LOD and the perf overlay

Type: AFK. Phase 1. Blocked by: 07, 10. Read `docs/issues/README.md` first, in particular "LOD" and "Verification".

## What to build

One knob that keeps the frame rate, and a way to see it.

1. **Controller.** In `Ground.update()`, keep a rolling average of the last 30 frame times. Every 500 ms: if the average is over the target by 10%, multiply `lod.distance` by 0.85; if it is under the target by 30%, multiply by 1.1. Clamp to `[min, max]`. The target is `1000 / min(60, refreshRate)`; estimate the refresh rate from the first 60 frames after load. Ignore frames during the dive, the first second after load, and any frame over 100 ms, which is a tab switch.
2. **Consumers.** Flora cards and fauna coarse meshes both read `lod.distance`. Nothing else adapts. Shadows and pixel ratio stay tier decisions.
3. **Overlay.** With `?perf` in the query string, show a small fixed overlay: average frame time, target, `lod.distance`, near and far instance counts for flora and fauna, draw calls from `renderer.info`, and the mode. Update twice a second. The overlay also works in orbit mode with the globe numbers.
4. **Persistence.** Store the settled `lod.distance` per tier in `localStorage`, so the next landing starts near the right value.

## Acceptance criteria

- [ ] On a forest site with a herd, at any camera height, the average frame time settles within 10% of the target within 3 s, on a machine that can reach it. State the machine and the numbers.
- [ ] Throttling the CPU 4x in devtools lowers `lod.distance` and the frame time recovers toward the target. Removing the throttle raises it back.
- [ ] `?perf` shows the overlay in both modes and has no cost without the flag.
- [ ] The picture does not visibly change while the knob moves at a normal frame rate; only the far band shifts.
- [ ] `README.md` "How it works" describes the adaptive LOD and `?perf`.

## Blocked by

- 07 Ground flora with card impostors
- 10 Far fauna coarse mesh
