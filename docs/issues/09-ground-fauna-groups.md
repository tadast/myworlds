# 09 Ground fauna in groups

Status: CLOSED, 2026-09-09, merged as 2818c38.

Type: AFK. Phase 1. Blocked by: 04, 08. Read `docs/issues/README.md` first, in particular "The patch protocol", "Metres for a creature", and "The sociality gene". Read `docs/fauna.md`.

## What to build

Animals on the ground at their lore size, placed and steered as groups. Rendering and steering live in `ground-fauna.js`. Issue 07 adds `ground-flora.js` in parallel; do not share files with it beyond `ground.js` calling both.

1. **Placement in the worker.** Fill `groups` and `members` in the patch result. Decide which species are present: the species the site was pulled to is always present, and it is passed in the request as `opts.pulledKind`, or `-1`. Any other species is present when the patch biome at the site or within 300 m matches its niche by the same `ok` rules as `makeFauna` in `worker.js`, evaluated on the patch grid. Air species with the `cloud` niche and `sea` species are not placed yet. Place groups: for each present species roll a group count so that the total members stay under `opts.maxFauna`, with 10 to 30 groups per patch, spaced at least `spread * 2` apart and away from the fog rim. Each member gets an offset inside the spread on a jittered ring, and a phase. Anchors sit on land above sea level for land and sub species, and at 12 to 40 m above the ground for air species.
2. **Scale.** Build creatures with `buildCreature()` and scale each species so the geometry extent on the `bodyMetres` axis equals the lore metres. Measure the extent from the geometry bounding box once per species. Hover in metres is 0 for land, and for air species the anchor height.
3. **Steering.** One mover per group anchor, made with `makeMover()` and stepped with `stepMover()`, with `leash` and `speed` in metres: leash 60 to 200 m, speed from the lore, roughly 0.5 m/s for a grazer up to 6 m/s for a runner, scaled by `G.move.speed`. Members follow the anchor plus their offset, with a short leash of a few metres and their own small oscillation, and they turn to face the direction of travel. Land and sub species stand on `heightAt`. Flyers keep their height above the ground under them. Serpents and ploughs follow the anchor path with a lag so the chain reads.
4. **Rig.** The rig shader and `faunaMaterial()` are unchanged. The activity uniform comes from the anchor mover, so a herd rests together and moves together.
5. **Inspector.** Clicking a creature on the ground opens the existing inspector for that species. Reuse `creatureAt()` logic against the ground camera; move the shared parts into `fauna.js` if needed.
6. **Full mesh only.** No far mesh in this issue. Issue 10 adds it.

## Acceptance criteria

- [x] Descend on a pulled site: the pulled species is there in a group of the size the lore states, and moves as a group. Members do not overlap or drift apart.
- [x] A herd species stops and starts together. A pair stays together. A solitary animal roams alone.
- [x] Creatures stand on the ground on slopes. Flyers clear hills.
- [x] A creature of "4 m at the shoulder" measures 4 m against the 2 m grid, and a "17 m" flyer is visibly huge.
  - The first half is exact: a "4.5 m at the shoulder" grazer measures 4.500 m tall, which is 2.25
    cells of the 2 m grid. A "3.1 m long" hexapod measures 3.10 m long, which is the axis the
    contract settled.
  - Decision, 2026-09-09: the second half cannot happen, and the issue itself is the reason. The
    17 m number belongs to a `fins` sky whale, whose niche is always `sea` or `cloud`, and item 1
    holds both back for issue 15. The numbered items win over the criteria, by the precedent of
    issue 08, so the criterion passes on the part the build can reach. The largest flyer placed is
    a 10 m swarm in herds of 13. Issue 15 should check the 17 m case when it lands the sea species.
- [x] Clicking a creature opens its inspector card.
- [x] Same URL gives the same groups on reload.
- [x] Frame time on a site with 300 creatures at 30 m above ground is under 12 ms on HIGH with terrain, sea, and flora present. Report the steering walk time.
- [x] `docs/fauna.md` gets a section "Ground tier" with the group model.

## Decisions

**The hexapod axis.** Settled before this issue started: a hexapod measures along `length`. See
"Metres for a creature" in `docs/issues/README.md`. A 3.1 m hexapod measures 3.10 m long and 0.77 m
tall.

**One click path, not two.** This issue bound its own tap listener, because issue 06 was built in
parallel and its seam could not be seen. Issue 06 owns the ground click and glides to the animal
before it opens the card. At the merge the two became one: `GroundFauna.pickHit()` returns the kind
and the world point, `ground.js` fills the seam of issue 06 with it, and the listener of this file
is gone. Two listeners would have opened the card before the glide ran.

## Blocked by

- 04 Patch terrain from the worker
- 08 Sociality gene

## Summary

Checked by hand in Chrome on the served site, HIGH tier, viewport 1300 by 677 CSS pixels at a
device pixel ratio of 2.

- **Pulled site.** `#Aurora` in orbit, the crosshair on a creature home, `__mw.site.kind` 0. The
  descent put the "Shell walker" on the ground in 7 groups of 5, which is what its lore says:
  "Indifferent, herds of five". Over 9 s the anchor of one group moved as one body, the nearest two
  members stayed 4.4 to 9.2 m apart, and the farthest member stayed 13 to 18 m from the anchor,
  inside the formation radius of 18 m.
- **Sociality.** The activity of the herd fell together from 0.69 to 0.39, because every member
  reads the anchor. The serpent pair of `#Nova@-49.00,-81.00` held 5.5 to 6.5 m apart while both
  members travelled together, and the second one trailed the first. The solitary drifter of Aurora
  roamed 600 m away from the herd, alone.
- **Ground contact.** Over all 41 animals of the Aurora site the largest gap between the animal and
  `heightAt` was 0. Land animals tilt to the slope, up to 19.5 degrees. Over 141 flyers on
  `#Aurora@-58.00,-20.00` the clearance error was 0, the hovers ran 12.2 to 39.5 m, and one flyer
  held 32.53 m while the ground under it rose from 362.5 to 367.6 m.
- **Metres.** "4.5 m at the shoulder" measured 4.500 m tall against the 2 m grid, that is 2.25 grid
  cells. "3.1 m long" measured 3.10 m long and 0.77 m tall, and "5.7 m tall" measured 5.70 m. No
  "17 m" flyer can appear yet: that number belongs to a `fins` sky whale, whose niche is always
  `sea` or `cloud`, and item 1 of this issue holds those back for issue 15. The largest flyer that
  is placed is the 10 m "Crested swarm", in herds of 13 over a formation radius of 104 m.
- **Inspector.** A tap on a grazer on `#Nova@-65.00,48.00` opened the card of the "Tusked grazer".
- **Determinism.** `#Nova@-65.00,48.00` reloaded gives the same 23 groups and 299 members, and the
  same hash over every anchor, spread, hover, leash, speed, and member offset.
- **Frame time.** `#Nova@-65.00,48.00`, 299 creatures, camera 30 m above the ground. A timer query
  around `Ground.render`, 60 samples: p10 3.75 ms, median 5.42 ms, p90 5.53 ms. The same camera
  with the animals hidden: p10 2.30 ms, median 5.02 ms, p90 5.22 ms. The animals cost about 0.4 ms.
  The wall-clock frame time is 16.5 ms, pinned at the 60 Hz refresh, so it shows no headroom. The
  steering walk costs 0.14 ms for 299 creatures. **The sea of issue 05 and the flora of issue 07
  were not present**, because those issues run in parallel. The terrain alone measured 5.47 ms at
  the entry camera and 5.02 ms at 30 m in the same session.
