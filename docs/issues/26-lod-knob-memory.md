# 26 The LOD knob rings, so the plants pop and the ceiling had to be nailed down

Status: CLOSED, 2026-09-12.

Type: AFK. Phase 2. Blocked by: 11, 25. Read `docs/issues/README.md` first.

## The defect

Reported from use on `Quasar-579@48.13,60.09`:

> Is there too much vegetation? I can see the draw/LOD distance change as the FPS fluctuates. The
> low LOD is very close, so something feels off.

Two faults, and the second caused the first.

**The knob rings.** `_driveLod()` of issue 11 steps down on one late reading and steps back out on
`LOD_UP_HOLD` good ones after `LOD_COOL`. Neither of those remembers anything. A knob that steps
down from a distance it cannot hold waits its three seconds, reads two good frames at the lower
distance, and climbs straight back into the distance that already failed. Measured on
`Aurora@18.91,129.00`, walking at eye level: 400, 340, 374, 400, 340, 400 over 30 s, with 40 frames
of 300 over 20 ms. The reader sees the plants pop in and out.

**The ceiling was nailed down to hide it.** Issue 25 took `lodMax` on HIGH from 400 to 220, on one
measurement on one world, and called it free to the eye. It is not free. It pays the worst case of
the worst world on every world, and on `Quasar-579` it threw away most of the geometry of the view
for no frame at all.

## What was built

A step down now marks the distance it came from, and the knob may not climb back over the mark. The
search converges instead of swinging between two values. The mark thaws after `LOD_FORGET` of quiet,
because a reader who walks out of a forest or rises over it has earned the distance back, and one
hitch from something else on the machine must not cap the view for the whole landing. The thaw is
`LOD_THAW` once per decision, which is a climb the eye does not read as a pop.

`lodMax` on HIGH goes back to 400.

## Acceptance criteria

- [x] **The knob converges instead of ringing.** `Aurora@18.91,129.00`, eye level, walking and
      turning, knob free from 400: 389, 281, 239, 239, 263, 263, 263, 263, 263, 263, 263, 263. The
      mark ran 400, 321, 273 and then held. Zero swing over the last six readings.
- [x] **The frame holds where it used to ring.** Aurora at the settled distance, 300 frames walking
      and turning: eye level mean 16.66 ms, p95 17.1, max 17.6, none over 20. Ceiling 16.67, 17.4,
      17.7, none over 20. Before this issue the same walk at `lodMax` 400 left 40 of 300 over 20 ms.
- [x] **A world with head room keeps it.** `Quasar-579@48.13,60.09` settles at 389 and holds it over
      eight readings, with 0 of 300 frames over 20 ms at eye level. It never needed 220.
- [x] **The reader gets the geometry back.** At the reported view, 2,696 plants as meshes and 2,015k
      triangles at 60 fps, against 724 and 252k at `lodMax` 220. The tall stalks and the crystal
      forms of the middle ground are solid again.
- [x] **The knob still earns distance back.** Aurora settled at 263 while the reader stood in the
      forest, and reached 306 after `LOD_FORGET` of quiet, holding 0 of 300 over 20 ms at both eye
      level and the ceiling.

## Decisions taken for the reader

1. **The mark sits just under what failed, not at it.** `LOD_MARK` of 0.97. A mark at the failing
   value lets the knob return to the exact distance that was late, because `LOD_UP` would land on
   it.
2. **The mark thaws on quiet, not on a timer from the last step.** It reads `_lodDown`, so a knob
   that is holding its level keeps holding it. Only a spell with nothing failing opens the view.
3. **`LOD_FORGET` is 30 s and `LOD_THAW` is 1.05.** The climb from 220 to 400 then takes about 6 s
   of decisions once the quiet is earned. Fast enough that a reader who rises over the trees is not
   left with cards, slow enough that no single step reads as a pop.
4. **The ceiling belongs to the tier, and the mark belongs to the landing.** `_lodCeil` starts at
   `lod.max` and a new landing builds a new `Ground`, so nothing carries between worlds. The store
   keeps the distance, as before, and not the mark.
5. **What binds is the plant count, not the distance.** About 2,300 plants on the near mesh is free
   on this machine and about 5,900 is not. That number is a property of the world, so no constant
   distance can express it and the knob has to find it. This is why the fix is in the controller
   and not in the table.

## How it was verified

Served on `127.0.0.1:8777`, Chrome, `document.visibilityState === "visible"`, `?perf=1`,
`myworlds.lod.v1` cleared between runs.

The A and B runs are interleaved, 220, 400, 220, 400, and not run in one sweep. A first sweep of
220, 300, 400 in order gave 165 of 250 frames over 20 ms at 300 and 101 at 400, which put 300 worse
than 400 and was plainly the drift of the machine and not the setting. `README.md` warns about this
and the warning is right. Interleaved, the same two settings gave 0 and 0 on `Quasar-579`, and 0 and
0 against 21 and 48 on `Aurora`, twice each, in the same minute.

## Left for later

- The knob still controls a distance while the cost follows a count. Two worlds of the same plant
  density can want distances that differ by two to one, and the knob has to walk there every
  landing. A knob that read `flora.nearCount` against a budget would land on the answer at once.
- `LOD_MIN` is 40 and the mark can drive the knob to it on a machine that cannot hold anything. The
  floor holds, but the view at 40 is all cards and nothing says so.
