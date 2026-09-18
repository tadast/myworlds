# 31 The probe carries no instrument, and the edge of its reach reads as a fault

Status: CLOSED, 2026-09-18.

Type: AFK. Phase 3. Blocked by: 23, 25, 30. Read `docs/issues/README.md` first.

## The defect

Two faults, reported from use.

**The ground says nothing about itself.** The reader stands on another world and the frame holds no
number. The stats card in the sidebar states the mean of the planet, which is not the site: on
`Auralis@-38.00,18.00` the card says 4 °C and the site stands at 2,231 m, where the air is under
freezing. Nothing states the height of the camera, and nothing states the hour of the star.

**The probe stops and the reader is not told why.** The target of the camera may not leave the
reach, which is the square the plants grow dense over. The ground runs on past it and the fog holds
the far edge out of sight, so the reader sees ground they cannot walk to and meets a wall with no
cause. Worse, the wall shook:

> Reduce the jittering I experience if I try to back away from the site at the edge. It should be a
> smooth stop. Is it terrain affecting the camera position?

Three rules met at the reach and each one fought the other two.

1. The drag of `OrbitControls` carries the pair outward and holds no limit of its own. The backstop
   in `update()` answered it by putting the pair back where it stood. Measured at the reach on
   `Auralis@-38.00,18.00`, dragging outward: the camera moved 0.000 units per frame while the
   pointer kept moving. A dead wall, and every frame of it a snap.
2. The cut of issue 23 took the flat part of a walk step and left the vertical part. The step of the
   flight keys follows the view, so a key held at the edge flew the camera straight up: the same
   measurement gave 0.009 units per frame of ground and 0.070 of height, for 4.5 units per second
   of climb that the reader never asked for.
3. `_seatTarget()` seats the pivot on the ground the view meets, every frame. A camera outside the
   reach seats its target outward, toward itself; the backstop read that as a reader pushing at the
   edge and pulled the whole view in. The terrain therefore did move the camera, which is what the
   report guessed.

## What was built

**`probe-hud.js`, the instrument of the probe.** Four facts over the ground: the temperature of the
air, the height of the camera over the ground under it, the time to the next sunset or sunrise, and
the strength of the uplink. The markup is in `index.html` and the style is in `style.css`, as every
other panel of this app is. `Ground.telemetry()` builds the numbers and the module writes them.

- **Temperature.** The worker already knew the temperature of the site, because the flora lore reads
  it; `siteTempC()` now goes out with the patch as `patch.tempC`. The overlay drops it by the height
  of the camera at 6.5 °C per 1,000 units, the lapse rate of the standard atmosphere of Earth. The
  height it reads is the height the ladder states, and not the height through the vertical scale of
  the box, so the two numbers agree.
- **The countdown.** The sun of a landing does not move. So the countdown is geometry: `Sky` keeps
  the true elevation of the star before it lifts a low sun for the light, the planet turns once in
  `dayHours`, and the angle over the turn is the time that is left. A site far from the equator holds
  its light a little longer than that, and the overlay states hours and minutes.
- **The uplink.** It falls over the last `SIGNAL_BAND` of 420 units of the reach and it reaches 6% at
  the reach, so the reader watches the link thin for 420 units before anything stops.

**The noise.** The picture breaks up over the last `NOISE_BAND` of 150 units only. Grey grain at
half the frame resolution scaled up with no smoothing, one dark scanline every three, and a vignette
that closes in, all on one canvas. The vignette is four bands, one per edge of the screen, and not a
circle around the middle: a circle wide enough to clear a wide frame darkens the corners and leaves
the middle of the long edges open, which reads as four dark corners instead of a view that closes.
Each band falls off over six stops and not over one straight ramp, because a ramp holds one slope
and then stops, and the eye finds the line where it stops.

The two washes that carry the readings follow the same rule. They ran from the frame and held a
straight top edge with clear sky over it, which reads as a panel laid on the picture. They now run
from the top and the bottom edges of the screen, the whole width, under the noise and under every
reading. A new grain field every 45 ms, so the flicker reads as a signal
and the cost stays flat. Under the band the canvas is cleared once and nothing runs. Static that
arrives early reads as a fault of the app and not as a fact of the world, which is why the band is
narrow.

**The stop.** The three rules above now agree.

- `_brakeEdge()` takes the outward part of the step the controls just made and fades it out over the
  same 80 units the walk uses. A drag along the edge, or back toward the site, keeps its full speed.
- The cut in `_stepMove()` takes the whole step and not only its flat part, so a key held at the edge
  slows to a stop on every axis. The lift keys go in after the cut, because a reader who asks for
  height by name owns it at the edge as well.
- A seat that would put the pivot outside the reach is dropped.
- The backstop stays for a link or a glide that lands outside the reach in one jump. Nothing else
  reaches it.
- The floor of the camera eases: a lift under 1 unit is spread over about a tenth of a second, so the
  ridges of issue 30 no longer shiver under a moving camera, and a real step in the ground still
  arrives at once. The eye stands 2 units over the ground, so the lag never shows the surface.

**The sidebar.** `app.js` writes `--panel-w` beside `--panel-h`, and the frame of the overlay starts
to the right of the sidebar on a wide screen and lifts over the sheet on a phone. A folded sidebar on
a wide screen is a strip along the top and it holds nothing under it, so `setCollapsed()` puts
`panel-folded` on the root element and the frame then takes the whole width and starts under the
strip.

## Acceptance criteria

- [x] **The overlay states four facts.** `Auralis@-38.00,18.00`, eye level: −4.6 °C, 4 m above
      ground, sunset in 2 h 15 m, link 100%.
- [x] **The temperature follows the height.** The same site at 882 units up reads 4.6 °C colder than
      at the ground.
- [x] **No noise away from the edge.** At 600 units from the site the canvas is clear and `near` is
      0. The first grain arrives 150 units from the reach.
- [x] **The noise explains the stop.** At the reach the link reads 6%, one bar is red, the uplink
      line says "Uplink failing", and the pill says the relay cannot reach further.
- [x] **The stop is smooth.** `Auralis@-38.00,18.00`, walking outward from 1,300 units with the back
      key held for 9 s: the step per frame fell from the full walk to 0.032 units of ground and
      0.005 of height, with no reversal and no snap on any frame. Before this issue the same walk
      gave 0.009 of ground and 0.070 of height, and the height never stopped.
- [x] **The drag eases out.** Dragging outward at 1,370 units: 0.117, 0.116, 0.115 … 0.109 units per
      frame. Before this issue the same drag gave exactly 0.000 at the reach.
- [x] **The frame holds.** 800 by 600, forest site, full noise at the reach: 60.7 fps over 1.5 s,
      mean frame 16.68 ms.
- [x] **The overlay clears the sidebar.** Wide screen, sidebar open and folded, and a phone sheet
      open and folded: no reading of the overlay stands under the panel. A folded sidebar on a wide
      screen gives the frame the whole width, under the strip.
- [x] **The vignette closes from the screen.** At the reach the four edges of the frame darken by
      the same amount, and the depth of a band is 42% of the short side on every aspect.
- [x] **The overlay goes with the probe.** A recall hides it and clears its canvas.
