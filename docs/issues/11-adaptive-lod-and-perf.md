# 11 Adaptive LOD and the perf overlay

Type: AFK. Phase 1. Blocked by: 07, 10. Read `docs/issues/README.md` first, in particular "LOD" and "Verification".

## What to build

One knob that keeps the frame rate, and a way to see it.

1. **Controller.** In `Ground.update()`, keep a rolling average of the last 30 frame times. Every 500 ms: if the average is over the target by 10%, multiply `lod.distance` by 0.85; if it is under the target by 30%, multiply by 1.1. Clamp to `[min, max]`. The target is `1000 / min(60, refreshRate)`; estimate the refresh rate from the first 60 frames after load. Ignore frames during the dive, the first second after load, and any frame over 100 ms, which is a tab switch.
2. **Consumers.** Flora cards and fauna coarse meshes both read `lod.distance`. Nothing else adapts. Shadows and pixel ratio stay tier decisions.
3. **Overlay.** With `?perf` in the query string, show a small fixed overlay: average frame time, target, `lod.distance`, near and far instance counts for flora and fauna, draw calls from `renderer.info`, and the mode. Update twice a second. The overlay also works in orbit mode with the globe numbers.
4. **Persistence.** Store the settled `lod.distance` per tier in `localStorage`, so the next landing starts near the right value.

## Acceptance criteria

- [x] On a forest site with a herd, at any camera height, the average frame time settles within 10% of the target within 3 s, on a machine that can reach it. State the machine and the numbers.
- [x] Throttling the CPU 4x in devtools lowers `lod.distance` and the frame time recovers toward the target. Removing the throttle raises it back.
- [x] `?perf` shows the overlay in both modes and has no cost without the flag.
- [x] The picture does not visibly change while the knob moves at a normal frame rate; only the far band shifts.
- [x] `README.md` "How it works" describes the adaptive LOD and `?perf`.

## Decisions

**The step out reads a second number.** Item 1 gives the controller one number, the rolling frame
time. The display holds that number at the refresh rate, so on a machine with room to spare it can
never fall 30% under the target and the knob can only come down. The clock of `perf.js` therefore
keeps a second rolling average, the work the app does inside one frame callback, and the two steps
read one number each: the knob comes down when the interval misses the target by 10%, and it goes
out when the interval sits at the refresh and the work is under 70% of the target. Every other
number of item 1 stands: 30 frames, 500 ms, 0.85 and 1.1, the clamp, and the three kinds of frame
that do not count. A step down also stops a step up for 3 s, so the knob cannot ring at the height
where the machine sits exactly at the refresh. Recorded in `docs/probe.md`.

**The shadow gate takes a band.** `ground.js` casts only while the camera is lower than
`lod.distance` over the ground, so the knob now moves the gate. The gate turns off over 1.35 LOD
distances and back on under 1.05, and it holds each state for 1.5 s. The band of 29% is wider than
the step of the knob at 15%, so one step cannot switch it.

## Verification

Apple M2, 8 cores, Chrome 152, a 60 Hz display, a window of 1,300 by 677 at a pixel ratio of 2.
Frame times from `?perf`; times of the graphics card from a timer query around `Ground.render`, 40
samples, with the tab in front and `document.visibilityState === "visible"` in every run.

- `Vesper@10.00,150.00`, a forest of 20,000 plants and 299 animals. At 1,144, 342, 142, 66, 35, and
  10 m over the ground the average frame time reads 16.61 to 16.74 ms against a target of 16.67 ms,
  inside 10% at the first read after each move. The knob settles at its 400 m ceiling everywhere.
  Times of the graphics card: 5.82 ms median at the ceiling (p10 4.47, p90 8.21) and 5.79 ms at 45 m
  with the shadow on (p10 3.70, p90 9.14).
- `Auralis@-4.25,15.95`, the four-layer coast: 6.65 ms median at 797 m and 7.51 ms at 27 m, both at
  the 400 m knob.
- The browser tools reach no devtools throttle. Two substitutes stand in for it, and both are stated
  as substitutes. A load on the graphics card, a pixel ratio of 7: the average frame time goes to
  33 ms, the knob walks 400 to 40 m in 7.5 s, and the frame time comes back to 30.7 ms. With the
  load off the knob walks back to 400 m in 12 s. A load on the main thread, a busy wait of 20 ms
  inside the frame: the knob walks 400 to 40 m in 7.5 s and back in 12 s once the load goes, but the
  frame time holds at 20.4 ms, because that load does not depend on the scene and the knob buys
  time on the graphics card. A faithful 4x of the app's own main-thread work still holds the
  refresh on this machine, so it does not move the knob.
- `?perf` shows the overlay on the ground and in orbit, with the globe numbers in orbit. Without the
  flag the page holds no `#perf-hud` element and runs no overlay work. The clock itself still runs,
  because the controller needs it: two ring writes and one subtraction per frame.
- One step of the knob, 400 m to 340 m at 37 m over the ground, moves 456 plants from mesh to card
  and the two screenshots read the same. The whole range, 400 m to the 40 m floor, does change the
  picture, which is what the floor is for.
- The shadow gate at 56 m over the ground, with the knob driven from 400 m to 40 m and back: one
  switch off at a knob of 41 m, one switch on at 53 m, none between.

## Blocked by

- 07 Ground flora with card impostors
- 10 Far fauna coarse mesh
