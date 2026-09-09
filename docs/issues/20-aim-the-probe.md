# 20 The reader aims the probe, and the ground view holds no rectangle

Status: CLOSED, 2026-09-10, merged as PENDING.

Type: AFK. Phase 2. Blocked by: 02, 06, 18, 19. Read `docs/issues/README.md` first.

## The defect

Two faults, both in the way the reader sends the probe.

**The zoom sends the probe.** `checkZoomHold()` in `app.js` reads half a second of continued
zoom at `CAM_MIN` and calls `descend()`. The reader who only wants a close look at the globe
gets a dive. The site is whatever the screen centre points at, so the reader cannot choose a
different square without a drag, and the drag turns the planet under the crosshair.

**The ground view shows the box.** The patch is a square of 1,500 units with a 2 m grid, and
the rim outside it is a 50 m grid with no knolls and no rock. Issue 18 joined the two on one
surface, so there is no crack and no cliff. The *detail* still stops at the box edge. From the
ceiling of 1,200 m the fog opens to `FOG_MAX`, 2,100 m, and the reader looks down on a square of
fine ground inside a smooth pale field. The patch reads as a diorama and not as a planet.

The cause is the fog and the tilt together. The fog opens `FOG_LIFT`, 1.15 m, for each metre of
height, but the far edge of the box moves away only by the horizontal distance of the camera
from the site. So the edge is inside the fog when

```
tan(polar angle) < FOG_LIFT
```

`POLAR_HIGH` is 0.62 rad, and `tan(0.62)` is 0.71. At the ceiling the camera therefore always
stands too near the site for its height, and no value of the ceiling can hide the edge.
Measured on `Auralis@-38.00,18.00`, a flat inland cell: at 1,200 m the square is plain, at 800 m
the north edge and the east edge still read, and at 500 m, where the tilt gives 1.14 rad and
`tan` is 2.16, nothing reads.

## What to build

1. **Take the probe off the zoom.** A zoom in at `CAM_MIN` does nothing. A zoom out at the
   ground ceiling still recalls the probe.
2. **Keep the button.** It sits in the sidebar as it does now. It appears whenever the app can
   send a probe, at any camera distance, and no longer only inside `PICK_RANGE`.
3. **The button starts the aim.** A press shows the message "Select the area to send a probe"
   over the scene. A second press cancels the aim, and so does Escape.
4. **The square follows the pointer.** While the reader aims, the site is the cell under the
   pointer, not the cell under the screen centre. The planet holds still, so the square cannot
   drift away from the ground the reader chose.
5. **A tap sends the probe.** A tap or a click on the planet sends the probe to that cell. A
   drag turns the planet and sends nothing. A tap that misses the planet does nothing.
6. **Zoom the ground view in.** The camera must not reach a height where the edge of the box
   reads. Lower the ceiling and start the reveal under it.

## Acceptance criteria

- [x] A continued zoom in at `CAM_MIN` sends no probe. 40 wheel steps of -120 over 2.4 s took the
      camera to 1.110 and left `mode` at `orbit` with the button unchanged.
- [x] The button shows at `CAM_HOME` and sends nothing by itself. At 3.42 the button read "Send a
      probe to the surface" and `#aim` stayed hidden. `canDescend()` now gates it.
- [x] The message shows on the press and goes on the cancel, on Escape, and on the dive. Measured
      in turn: press gives `aim shown, "Cancel the probe"`; a second press and Escape both give
      `aim hidden, "Send a probe to the surface", site null`; after the dive the aim is hidden and
      the button reads "Recall the probe".
- [x] The square marker follows the pointer while the reader aims, and the planet does not spin.
      The marker under the pointer at 1,460 by 717 on `Auralis` gave `site {lat 2.29, lon 130.17}`,
      and it moved with each pointer move. `step()` takes the spin to 0 while the aim is on.
- [x] A click on the planet lands the probe on the cell the square showed. A click at (860, 640)
      gave `#Auralis@-0.57,124.91` and the ground of that cell, open sea, at 421 m up.
- [x] A drag of more than 6 px turns the planet and sends no probe. A drag of 162 px left
      `mode` at `orbit` with the aim still on.
- [x] No edge of the box reads in the ground view, at the reveal and at the ceiling, panned to each
      of the four limits, on two worlds. Checked on `Auralis@-38.00,18.00` and
      `Glacier-77@-35.00,150.00`, at the reveal and at the ceiling with the tilt at 1.04 rad, with
      the target at the site and at each of the four pan limits of 450 m. Before the change the
      same cell showed the square plainly at 1,200 m and still showed the north and the east edge
      at 800 m. The one line that survived the camera change was the edge of the forest, at the
      west limit: the plants of the patch stopped on the box line, which the projection put at
      (618, 238) to (430, 623) on the screen. The plant fade of 300 units took it away.
- [x] The frame time holds. Ground frame work, HIGH, `Auralis@1.27,12.30`, the cell of issue 18:
      reveal 1.93 ms against 2.26 before, eye level 1.52 against 1.70, ceiling 1.70 against 1.87.
      LOW on the same cell: reveal 1.80 ms, eye level 1.29, ceiling 1.98 against 2.52 before.
      Globe frame work at `CAM_MIN`: 1.27 ms with the aim off and 1.57 ms with it on, against 1.80
      before, because the pick and the marker now run only while the reader aims. `perf.avg`, the
      interval, held at 16.61 to 16.71 ms in every run. The patch build does not move: paired in
      one page against the worker of `main`, ten runs each, HIGH gave +3.1% and then -2.5%, LOW
      +0.5%. The patch is byte-for-byte the same over two runs, in `heights`, `colors`, `flora`,
      `groups`, `members`, `rimHeights`, and `rimColors`.

## What was built

**The aim.** `app.js` holds one flag, `aiming`. The button starts it, a second press or Escape
ends it, and the dive ends it. While the aim is on, `#aim` shows the message, the square marker
follows the pointer, and the planet holds still. `checkZoomHold()` lost its descend branch; it
now only recalls the probe.

**The pick takes a point.** `pickDirs(camera, current, ndc)` and `pickSite(camera, current, ndc)`
in `site.js` take a point of the screen in normalised device coordinates. The default is the
screen centre, so no other caller changes.

**The ground camera.** `CEILING` falls from 1,200 m to 500 m, `POLAR_HIGH` rises from 0.62 rad to
1.10 rad, and the reveal starts at 450 m up and `450 * tan(POLAR_HIGH)`, 884 m, south. The rule
behind the two numbers is in `ground.js` under "the rectangle".

**The plants.** `worker.js` fades the chance of a plant to zero over the last `FLORA_EDGE`, 300,
units of the box, so the forest thins out instead of stopping in a straight line.

## Decisions taken for the reader

1. **The rim is not the fix; the camera is.** The rim of issue 18 joins the patch on one surface,
   so the ground shows no cliff. What reads is the detail: the knolls, the rock, and the plants
   stop at the box. Carrying them into the rim would need a fine grid over 18 times the area,
   which the patch build cannot pay for. So the reader is held under the height where the line
   reads.
2. **The ceiling falls to 500 m, and the tilt opens to 1.10 rad.** The two go together. Lowering
   the ceiling alone cannot work, because the tilt reaches `POLAR_HIGH` at whatever the ceiling
   is, and at 0.62 rad the line reads at every height. The cost is the top-down view of the whole
   patch, which is the view that showed the rectangle.
3. **The zoom out still recalls the probe.** The issue asks only that the zoom stops sending the
   probe. The recall at the ceiling is the mirror of "Recall the probe" and it takes nothing away.
4. **The button shows at every camera distance.** It used to show only inside `PICK_RANGE`,
   because the site came from the crosshair. The site now comes from the tap, so the reader can
   start the aim from anywhere. `PICK_RANGE` keeps its other job: it holds the globe still near
   the surface.
5. **The square stays the true footprint.** Issue 19 makes the square what the ground shows, so
   it is not scaled up to be easy to hit. One cell is about 3 px at `CAM_HOME` and about 62 px at
   `CAM_MIN`. The reader who wants a exact cell zooms in first. The `README.md` says so.
6. **A drag of more than 6 px sends nothing.** The value is `TAP_SLOP` of the ground, and the
   creature pick of the globe already used it.
7. **The aim folds the sheet on a phone.** The sheet covers the planet the reader must tap.
8. **The plants fade over 300 units, the terrain keeps its 100.** Issue 18 fades the knolls and
   the rock over two rim cells, and that band is still enough for the terrain, which shows no line
   in the test. The plants need a wider band, because a tree is a hard shape and the eye joins a
   row of them into a line.
9. **`RIM` and the sea `REACH` keep their values.** The lower ceiling asks for 2,830 units of rim
   and 2,400 units of sea, and both hold more. Cutting them would save build time; that is a
   separate issue.
10. **`FOG_MAX` is now dead weight.** At the ceiling the fog opens to 1,325 m, so the stop at
    2,100 m never binds. The constant stays, because it still guards the fog if the ceiling rises.

## How it was verified

Served on `localhost:5555`, Chrome, tab in front, `document.visibilityState === "visible"`,
`?perf` on. Sources forced fresh with `fetch(f, {cache:"reload"})` before each reload.

Two worlds: `Auralis` (terran) and `Glacier-77` (ice). Two cells: `Auralis@-38.00,18.00`, the
flattest inland cell of the world, and `Auralis@1.27,12.30`, the coastal cell of issue 18. The
ground camera was placed by hand at the ceiling, at the four pan limits, and at the foot of the
tilt band, because the pan limit is on the target and the camera reaches further than a drag can
take it in one measurement.

## Left for later

- `RIM` of 3,150 units and the sea `REACH` of 2,700 units are both wider than the ceiling of 500 m
  needs. A cut to about 2,850 and 2,450 would take work off every patch build.
- The plant fade takes about a third of the plants off a patch that does not reach `maxFlora`.
  On `Glacier-77` the count fell from 10,348 to 6,738. The plants that go are all in the outer
  band, which the reader sees through fog, and the count inside the fog does not change. A patch
  that reaches the cap loses nothing at all, because the cap thins the list anyway.
