# 33 Every world stands upright, and the light of a latitude never says otherwise

Status: CLOSED, 2026-09-18.

Type: AFK. Phase 3. Blocked by: 32. Read `docs/issues/README.md` first.

## The defect

`world.tilt` was a lean of the mesh, drawn from `[-0.45, 0.45]` rad, and nothing read it but the
renderer. Three faults followed.

**The light did not follow it.** The star of the scene stands in one place and the planet took the
lean, so the latitude the star stood over was whatever the two happened to make: from 2 degrees to
41 across the range of the lean. No world knew that number and nothing used it.

**The spin walked the pole.** The lean went into `planet.rotation.z` and the spin into
`planet.rotation.y` of the same Euler. Three.js reads an XYZ Euler as one turn about z, then one
about y, then one about x, so the spin ran about the vertical of the scene and not about the axis
of the world. The pole therefore walked a circle around the sky as the world turned. Measured on
`Ember` before the fix, the latitude the star stood over drifted from 35.8 degrees to 40.8 in the
first minute.

**The climate knew one rule.** The temperature field read `1 - |sin(lat)|^1.6 * 1.1`. Every world
was upright, every equator was the warm band, both poles were cold, and no season existed. A world
on its side is a different world: one pole holds a summer that never sets while the other stands in
the dark for a season, and over a year the poles take more light than the equator.

## What was built

**The axis is a parameter.** `rollAxis()` draws an obliquity and a season from a stream of its own,
so no world built before this issue moves a coastline. The roll follows what is known of real
planets: accretion from a swarm leaves an axis that points anywhere, and tides and an ordered disc
pull it back toward the normal, so the four classes are

| class | share | obliquity | the planet it reads as |
|---|---|---|---|
| damped | 18% | under 4 deg | Mercury, Jupiter |
| ordered | 52% | a half normal of 14 deg, cut at 45 | Earth, Mars, Saturn, Neptune |
| tipped | 23% | 45 to 135 deg, the cosine flat in the band | Uranus |
| turned | 7% | 135 to 180 deg | Venus |

Measured over 4,000 seeds: 68% stand under 30 degrees, against 6 of the 8 planets of the Sun; the
median is 12 degrees and the mean is 37. The season is where the world stands in its orbit, and
`sin(declination) = sin(obliquity) * sin(season)` gives the latitude the star stands over. A visit
lasts minutes and a year does not, so the season holds.

**The light follows the axis.** `axisQuat()` in app.js turns the world so that the angle between
its axis and the star is 90 degrees less the declination, which is the one rule that fixes the
terminator. The free turn about the star goes to the axis that leans in the plane of the screen, so
the reader sees the tilt. A new group carries the axis and the planet spins inside it, so the spin
runs about the axis of the world and the pole holds still. A world tipped past 90 degrees turns the
other way, and the globe shows it.

**The climate is the light of a latitude.** `dayLight()` is the standard mean over one turn, which
holds the polar day and the polar night: a latitude where the hour angle has no solution either
stands in the light for the whole turn or never sees the star. `yearLight()` averages that over the
orbit. The field takes 0.6 of the year and 0.4 of the day, because rock and water hold the heat of
the season before, and the sum goes on one scale for every world: the equator of a world with the
axis of the Earth at an equinox reads 1, and its poles read -0.1, which is where the old term ran
from and to. A per-world stretch was the other way to do it and it is wrong, because the light over
a world on its side is nearly even over a year and a stretch would paint a season as a climate.

`siteTempC()` used a constant for the mean of the field over the globe. The mean now comes from the
world, because the field is no longer the same on every world, and `ctx.climateMean` carries it.

**The card states the tilt.** "Tilt 23°", and "on its side" past 54 degrees, where a pole takes more
light over a year than the equator, or "retrograde" past 135.

## Acceptance criteria

- [x] **The star stands where the declination says.** `Ember`, obliquity 103.6 deg, declination
      -35.78: the angle between the axis and the star gives a sub-solar latitude of -35.78, and it
      holds to the same two decimals a minute later while the world turns.
- [x] **The climate holds the old worlds.** A world with the axis of the Earth at an equinox reads
      1.00 at the equator and -0.10 at the poles, which is what the old latitude term gave.
- [x] **The dark ground is cold and the lit ground is warm.** `Vesper`, obliquity 138 deg,
      declination -41.4, a world with a mean of 28 °C: the site at 62 N stands in the polar night
      and reads -8.7 °C, and the site at 62 S holds the midnight sun and reads 38.9 °C. The overlay
      states no sunset at either of them, because the star neither sets nor rises there.
- [x] **An extreme world says nothing new.** `Ember` is a frozen world at -114 °C: the tilt moves
      the light and every part of it stays ice.
- [x] **The sky turns the way the world does.** `Auralis` turns the other way, so its star climbed
      from 29.93 to 30.35 degrees over eight seconds and the overlay counted down to the sunset
      past the noon of it.
