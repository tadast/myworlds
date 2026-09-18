# 32 The sky of a landing holds one hour for ever, and the moons fly across it

Status: CLOSED, 2026-09-18.

Type: AFK. Phase 3. Blocked by: 12, 31. Read `docs/issues/README.md` first.

## The defect

**The sun does not move.** `Sky` reads the sun of the globe once and holds that direction for the
whole landing. Issue 31 then put a countdown to the next sunset on the overlay, which a reader can
wait out and find that nothing happens. The sky reads as a picture and not as a place.

**The moons fly.** The globe runs its moons fast on purpose: it is a miniature, and an orbit must
show while the reader looks at it. A moon there takes 21 to 52 s against 125 s for one turn of the
planet. The ground took that same angular speed, so a moon crossed the whole sky in under a minute,
which no world does.

## What was built

**One clock for the landing.** `GROUND_DAY` is 1,800 s: one turn of the planet takes half an hour
of real time, whatever the day of the world says. The sun, the moons, and the countdown of the
overlay all read that clock, so what the reader sees and what the overlay states cannot drift
apart. The hours of the world therefore run about 50 times the hours of the reader on a world with
a day of 24.8 h, which is what makes a sunset something a reader can sit through.

**The sky turns about the axis of the planet.** `skyView()` sends the axis of the turn in the frame
of the site, read from the world matrix of the globe planet, so it carries the tilt of the world.
The star runs its circle about that axis: straight up from the horizon at the equator, and along a
low slant near a pole. Measured on `Auralis@-38.00,18.00`, the sky turns 12 degrees a minute and
the star falls 4.55 degrees a minute, which is the slant of that latitude.

**Two suns, one star.** `sunTrue` is where the star stands and it turns. `sunDir` is where the light
comes from, which is `sunTrue` held at `SUN_FLOOR` when the star is down, because a sun under the
horizon leaves the ground black. The dome draws the disc at `sunTrue` and fades it out over the last
degrees, so the star sets into the haze and leaves no lit spot under the eye line. Everything that
lights the ground reads `sunDir`.

**The light of the hour.** `_relight()` holds the lines the constructor used to run once: the night
term, the horizon and zenith colours, the colour and the strength of the light, the disc, the glow,
and the cloud colour. It runs again whenever the star has moved a quarter of a degree, which is
about three seconds of the clock. `Ground._followSun()` then moves the sun light, the sky light, the
fog, the background, the card side of the plants, and the shadow slant of the flyers.

**The countdown is solved and no longer estimated.** `Sky.toHorizon()` solves the turn the star
still has to make before it meets the plane of the horizon, against the real path at that site. The
old countdown divided the elevation by the turn rate, which ignores the slant: at latitude -38 it
stated 2 h 03 m for a sunset that the same sky reached after 3 h 43 m of the world. A site where the
star never sets returns nothing, and the overlay then states nothing instead of a wrong hour.

**The moons keep their order and lose their speed.** The ground reads the pair the globe rolled, the
speed of the moon over the spin of the planet, and divides it by `MOON_SLOW` of 4, inside a band of
0.25 to 2 turns of the sky per day. A world with the faster moon still has the faster one.

## Acceptance criteria

- [x] **The star moves.** `Auralis@-38.00,18.00`: elevation 31.45 deg, and 4.55 deg a minute lower.
- [x] **A sunset arrives.** The same site, the star nine seconds from the horizon: the label ran
      "Sunset 6 m", the star set, the label turned to "Sunrise 14 h 04 m", and `night` went to 0.40
      with the light down from 2.6 to 1.8. The ground darkened with it.
- [x] **The countdown matches the sky.** The turn to the horizon is 0.943 rad, which is 270 s of
      real time and 3 h 43 m of the world, and the overlay stated 3 h 43 m.
- [x] **The moons are slow.** `Quasar-393@10.00,20.00`, one moon at 1.04 turns a day: 11.85 deg a
      minute, against 853 deg a minute before this issue. It crosses the sky in about 15 minutes.
- [x] **The frame holds.** The same site, 60.7 fps over 1.5 s, mean frame 16.62 ms, work 1.9 ms.

## What this issue does not do

- The terrain colours, the grass, and the pictures on the flora cards are baked at the landing. They
  darken with the light, because the light is what draws them, but the pictures keep the side they
  were baked on. A reader who sits through a whole night sees cards that hold a highlight the mesh
  beside them no longer has.
- The ring takes its brightness from the sun of the landing and holds it.
- A binary system draws one disc on the ground. The companion is a globe tier feature; see `star.js`.
