# 23 The reader cannot move on the ground

Type: AFK. Phase 2. Blocked by: 06. Read `docs/issues/README.md` first.

## The defect

A reader lands on the patch and cannot travel over it. Reported from use:

> How do I move when in probe mode? I can't figure out the controls. I can try to zoom, but it
> prevents me from going to different locations - I used to be able to tap/click, but this was not
> ideal.

Issue 06 gave the ground the gesture map of the globe. One finger and the left button turn the
view. The pan, which is the only way to travel over the patch, sits on the right button and on two
fingers, where a reader on a phone never finds it. There is no keyboard control of any kind.

So the reader has three things and needs a fourth. The spin turns the view but goes nowhere. The
zoom comes in and out along one line. The tap of issue 06 glides the target to a point, but only to
a point that is already on the screen, and it moves the view as well, so it cannot carry the reader
in a chosen direction. The patch is 900 units wide inside the fog limit, and none of the three
crosses it.

The cause is that the ground took the verbs of the globe. On the globe the reader turns a thing and
looks at it from outside, and one finger to spin is right. On the ground the reader stands inside
the thing.

## What to build

1. **Give moving the first gesture.** One finger and the left button grab the ground and pull the
   reader over it, as a map does. Two fingers and the right button turn the view. A pinch still
   zooms. The globe keeps its own map.
2. **Carry the long distances.** A drag needs a new one for every screen. A press that holds still
   becomes a walk in the direction the pointer points, and it holds until the finger lifts.
3. **Give the keyboard every part of the view.** Walk, run, turn, tilt, and zoom.
4. **Move the pair.** A walk moves the camera and the target by one step, so the view direction and
   the distance hold and only the place changes. The clamps of issue 06 and issue 17 run over it.
5. **Slow at the limit, do not stop at it.** The walk meets the 450 m limit of the pan and tapers
   into it.
6. **Say so.** The help line of the sidebar names the gestures of the globe. It has to name the
   gestures of the place the reader stands in.

## Acceptance criteria

- [x] On a phone, one finger drags the ground and the reader moves over it.
- [x] A press held still past 300 ms walks, and it steers with the pointer.
- [x] A press that moves never walks, so a slow drag cannot lurch the reader forward.
- [x] `W A S D`, the arrow keys, `Shift`, `Q`, `E`, `R`, `F`, `+`, and `-` all work, and none of
      them fires while the reader types a seed.
- [x] Two fingers and the right button turn the view. A pinch zooms.
- [x] The tap of issue 06 still glides, and the second tap on an animal still opens its card.
- [x] The walk stops at the fog limit without a wall, and it runs at full speed along the limit and
      back in.
- [x] Frame time does not grow.

## Not in scope

The globe. Its gesture map does not change, and the reader who spins a planet keeps the finger they
already use.

## Blocked by

- 06 Ground camera: pan, clamps, glide

## What was built

1. **The gesture map swaps.** `mouseButtons` is now `{ LEFT: PAN, MIDDLE: DOLLY, RIGHT: ROTATE }` and
   `touches` is `{ ONE: PAN, TWO: DOLLY_ROTATE }`. Two fingers therefore zoom and turn together, so
   nothing is lost. `panSpeed` goes to 1, because the pan now has to move the ground by about the
   distance the pointer moves over it; under 1 the ground slips under the finger.
2. **A press that holds still walks.** `_onDown()` stamps the time. `update()` turns the press into a
   walk after `WALK_HOLD` of 300 ms, and only while the press has never moved past `TAP_SLOP` and no
   double tap is pending. `_onUp()` fires no glide for a press that walked.
3. **`_stepMove(dt)`.** One pass for the look keys, the zoom keys, and the walk. It runs after
   `controls.update()` and before every clamp, so the fog limit, the floor, the ceiling, and the
   up-view of issue 17 all hold over it.
4. **The keys.** `KEY_JOB` maps two keys to each job, so `W` and the up arrow are one thing. The
   walk takes the keys first and the held pointer second. `Shift` multiplies by `WALK_RUN`.
5. **The look keys turn the target about the eye.** `Q E R F` rotate the offset about the camera,
   not the camera about the target.
6. **The speed follows the height,** as the speed of a wheel step does: `WALK_SLOW` of 11 units a
   second at eye height, `WALK_FAST` of 150 at the ceiling. The velocity eases in and out over
   `WALK_EASE`, so no step starts or stops on one frame.
7. **The taper at the limit.** Only the outward part of the step slows, over `WALK_EDGE` of 80 units.
8. **The help line follows the reader.** `updateHelp()` in `app.js` swaps the text with the mode.

## Decisions taken for the reader

1. **One finger moves, and it is the biggest change in the issue.** It costs the reader who already
   knew the old map one habit. It buys every reader who lands for the first time the one verb they
   were missing, with no instruction and no new control. A map and a globe read as two things
   because they are two things, and the app now says so with its verbs.
2. **The hold is the same press as the drag.** A separate control would need a thumbstick or a
   button, which is a part of the interface this app does not have. Holding still is free: the rule
   that tells a tap from a drag already exists, and a press that holds still is the one state that
   rule leaves unused.
3. **The walk steers with the pointer, and it does not walk to a point.** A walk that stops on
   arrival needs the reader to press again for every step. A walk that follows the pointer holds
   until the finger lifts, and the reader steers it like a stick.
4. **The look keys turn the head.** Turning the eye about the target is what an orbit control does,
   and at a target 15 m away it walks the reader round a 15 m circle. A reader who presses `Q`
   expects to look left and to stay put.
5. **Speed follows height, not the zoom.** One rule, and it is the rule the wheel already follows.
   The reader who is near the ground walks, and the reader at the ceiling covers a third of the
   patch in a second.
6. **The edge slows instead of stopping.** A hard limit at 450 m reads as a fault in the world. A
   taper reads as the reader running out of the ground the probe brought back, which is the truth.

## How it was verified

Served on `localhost:5555`, Chrome, tab in front, `document.visibilityState === "visible"`. Sources
forced fresh with `fetch(f, {cache:"reload"})` before each reload. Site `#Auralis@0.11,12.30`.
Synthetic pointer events need `setPointerCapture` stubbed, or OrbitControls never adds its move
listener and no drag arrives.

- **The keys walk.** `W` held for 1.5 s moved the pair 18.2 units, with the direction exactly along
  the way the view faced (dot 1.000), and the camera followed the target to within 0.2 units.
- **`D` strafes.** 11.9 units, 0.000 along the forward direction and 1.000 to the right of it.
- **`Q` turns the head.** The view turned 68.8 deg left and the eye moved 0.33 units.
- **`R` tilts up.** The polar angle went from 65.3 to 104.1 deg, which is 25 deg under the horizon
  to 14 deg over it. `-` took the distance from 5.0 to 7.8 units.
- **One finger drags the ground.** A drag of 150 px down at a target 20.7 units away moved the pair
  4.4 units forward. The frustum covers 23.9 units over the height of the frame there, so 19% of
  the frame moved 18% of that: the ground holds under the finger.
- **A held press walks.** Armed after 300 ms, 10.4 units forward in 1.2 s, exactly along the view.
- **Two fingers turn and pinch.** Two fingers moved together turned the view 19.6 deg and moved the
  target 0.0 units. A pinch apart took the distance from 20.7 to 6.0 units.
- **The tap survives.** A tap on ground under the pointer started a glide and moved the view 6.1
  units. A tap over the horizon starts nothing, because no ground is there. The first tap on a
  drifter turned the view to it and the second opened its card.
- **The limit tapers.** A run straight out settled at radius 435.1 of the 450 limit with the
  velocity at 0 and no jitter. At the edge, a strafe ran at 13.5 units a second and a walk back
  inward at 13.1, both full speed.
- **Nothing sticks.** The pointer count returned to 0 after every gesture, and the key set is empty
  after every release and on `blur`.
- **Frame time.** 16.66 ms standing still and 16.66 ms running, both at the refresh.

## Left for later

- The reader cannot leave the 450 m circle. That limit is the fog and the edge of the fine grid, not
  the walk. A patch that follows the reader is a much larger piece of work.
- There is no way to look up or down with one finger on a phone other than two fingers. It works,
  but a reader who wants to watch a flyer while walking has to stop.
