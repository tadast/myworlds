# 12 Sky continuity: sun, moons, rings, clouds

Status: CLOSED, 2026-09-09, merged as acf2a18.

Type: AFK. Phase 1. Blocked by: 03. Read `docs/issues/README.md` first.

## What to build

The sky on the ground says which world you are on.

1. **Sun.** Compute the globe sun direction in the local frame of the site: rotate the globe `sunDir` into the planet frame with the current `planet.rotation.y`, then into the ground frame with the site's east, up, and south vectors. Pass it as `load(result, { sunDir })` from the app to the ground, since only the app knows the rotation. If the sun is below the horizon, keep it 8 degrees above so the ground is lit, and tint the sky toward the darker end of the palette.
2. **Sky dome.** Replace the flat dome colour with a vertical gradient: the atmosphere colour at the horizon, a 30% darker blend at the zenith, and a warm tint of the sun colour within 20 degrees of the sun. A shader on the dome, no texture.
3. **Moons.** For each moon in `world.moons`, draw its mesh far away on the dome at its current orbit angle, projected into the ground frame. Size it by its true angular size scaled up 3x so it reads. Moons keep moving at their orbit speed.
4. **Rings.** When `world.rings` exists, draw the ring mesh as a band across the sky in the ground frame: the ring plane is the planet equator, so the band's tilt on the sky depends on the site latitude. At the equator the ring is a thin line through the zenith; at 40 degrees it is a wide arc. Reuse the ring material.
5. **Clouds.** Draw 6 to 12 flat cloud sprites in the cloud colour at 900 to 1,100 m above the ground, drifting slowly. Skip when `world.hasClouds` is false.
6. **Fog.** Fog colour becomes the horizon colour of the sky gradient so the dome and the fog match.

## Acceptance criteria

- [x] A ringed world shows a ring arc in the sky from the ground, wider at higher latitude.
- [x] Moons are visible and move. A world with no moons shows none.
- [x] The lit side of hills matches the sun position in the sky.
  - Verified again after issue 04 merged, on real terrain. The first check used a proxy cone,
    because the ground was still a flat plane. The directional light that lights the terrain and
    the sun disc that the dome draws are the same vector: the dot product is exactly 1.
- [x] Clouds drift above the ceiling and are visible from the ground and from the ceiling.
  - Decision, 2026-09-09: this criterion and item 5 disagree. The criterion says the clouds are
    above the ceiling. Item 5 says 900 to 1,100 m, and `docs/probe.md` decision 6 says "near the
    ceiling", but the ceiling is 1,200 m. The numbered build items win, by the precedent of issue
    08, so the clouds sit under the ceiling. From the ceiling the reader looks a little down on the
    cloud deck. The clouds are visible from the ground and from the ceiling, which is the intent.
- [x] No seam between the dome and the fog at the horizon.
- [x] Frame time cost of the sky is under 0.5 ms on HIGH.
- [x] `README.md` "How it works" mentions the sky.

## Blocked by

- 03 Descent and ascent shell
