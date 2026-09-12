# 14 Ground-scale phenomena

Type: AFK. Phase 2. Blocked by: 04. Read `docs/probe.md` decision 6.

Design session held 2026-09-12. The decisions below replace the open questions.

## What to build

The one phenomenon of the world at metre scale. This slice builds the volcano and the geyser,
because they reuse the most from `phenomena.js`. The fissure, the aurora, and the storm wait for
a later slice; the question whether the sky kinds play everywhere or only near the site waits
with them.

1. **Presence.** `app.js` computes the cell of the phenomenon: `snapSite(dirToSite(world.activity.dir))`.
   When the landing cell is that cell, the patch request carries `opts.activity = { kind }`.
   The rule is the cell, not the pull: a landing that reaches the cell without the pull still
   shows the phenomenon, and one phenomenon can never stand in two patches. Without
   `opts.activity` the worker builds the patch as today.
2. **The pull.** `pullSite` takes the phenomenon direction as a target for the volcano and the
   geyser. When a creature home and the phenomenon both lie within reach, the phenomenon wins:
   the world holds many homes and at most one phenomenon, and the pulled cell can still hold
   homes. This extends the pull contract in `docs/issues/README.md`; update that file in the
   same commit.
3. **Terrain.** The worker adds a shape term to the heights at the patch origin, as `makeActivity`
   does on the globe. The scale is the set piece, not the truth: a true cone would fill the cell
   with one flank, so the ground shows a cone the reader can walk to and see whole, the way a
   creature keeps its readable size. Start values, tune at build time: cone radius 250 units,
   peak about 110 units over the local ground, crater radius 50 with a floor drop of a third of
   the peak; geyser pool radius 10 units with a mineral ring out to 35. The worker paints rock
   on the cone and the mineral colours on the ring, and it blocks flora and grass on the
   footprint, as the globe paint does.
4. **Effects.** A new module `ground-phenomena.js` follows the `Sea` shape:
   `Phenomena.create({ world, patch, tier, sky, heightAt })` returns `null` when the patch
   carries no phenomenon, else `{ group, update(t, dt, camera), dispose() }`. `ground.js` builds
   it in `load()`, steps it in `update()` after the sky, and disposes it with the rest. The
   module ports the `phenomena.js` parts at ground scale: the smoke and the ember point clouds
   and the vent glow for the volcano; the pool and the ballistic jet shader for the geyser, with
   the burst cycle of 9 to 14 s. The cycle and the point streams seed from `patch.patchSeed`,
   so a reload replays the same eruption.
5. **Tiers.** HIGH gets the full point counts and one `PointLight` at the vent. LOW gets half
   the points and no light, as the shadow rule already works. Verify the frame time on both
   tiers with the README method.
6. **Docs.** Update `README.md` "How it works" and `docs/probe.md`: decision 2 of the probe
   drops the note that the pull targets species homes only.

## Decisions from the design session

- First slice: the volcano and the geyser.
- The app passes the phenomenon to the worker in `opts`; the patch path never runs `makeActivity`.
- The ground shows a set piece, not the true scale.
- The phenomenon stands at the patch origin.
- Presence follows the cell, not the pull.
- The pull prefers the phenomenon over a creature home.
- The effects port from `phenomena.js` with tier caps.

## Acceptance criteria

- [x] On a volcano world, aim inside the phenomenon cell. The pull moves the site, and the
      ground shows the cone with the crater at the origin. Smoke and embers rise from the vent.
- [x] On a geyser world, the ground shows the pool and the mineral ring at the origin, and the
      jet erupts on a 9 to 14 s cycle.
- [x] A landing in any other cell of the same world shows no phenomenon.
- [x] A landing that hits the phenomenon cell without the pull still shows the phenomenon.
- [x] With a creature home and the phenomenon both in reach, the site goes to the phenomenon.
- [x] No flora and no grass stand on the cone footprint or the mineral ring.
- [x] LOW shows half the points and no `PointLight`.
- [ ] The frame time holds on HIGH and LOW per the README method. The counts and the draw calls
      are verified; the interval is not. The test harness throttles the frames. See below.
- [x] A reload of the same URL replays the same cone, the same colours, and the same eruption
      times.
- [x] A world with no activity, and a gas giant, behave exactly as before.
- [x] `README.md` and `docs/probe.md` record the change.

## Blocked by

- 04 Patch terrain from the worker — CLOSED
- Design session — held 2026-09-12; this file records the outcome

## What it built

- `site.js` gained `activityDir(world)` and `activitySite(world)`. `GROUND_ACTIVITY` lists the two
  kinds the ground draws. `pullSite` takes the phenomenon first and a creature home second.
- `app.js` gained `activityHere(target)`. It compares the snapped landing site against the cell of
  the phenomenon and puts `{ kind }` in `opts.activity` when the two are the same.
- `worker.js` gained `patchActivity(ctx, kind, s)`. It rewrites the heights at the origin, gives
  back the paint pass, the mask, and `patch.activity` for the main thread. `patchFlora` and
  `patchFauna` take that mask, so no plant, no tuft of grass, and no herd stands on the footprint.
- `ground-phenomena.js` is new. `Phenomena.create()` follows the `Sea` shape and takes one more
  option than the issue text named, `renderer`: the point sizes need the height of the frame
  buffer, as the globe point sizes do.
- `ground.js` builds it in `load()`, steps it after the sky, and disposes it in `_clear()`.

## How it was verified

Served on `localhost:5556`, Chrome. Seeds: `Auralis` (terran volcano), `Ember` (ice geyser),
`Tamsin` (exotic geyser), `Lumen` (aurora), `Mireth` (gas giant). The activity site of a world
comes from the icosphere, so a LOW device at detail 64 puts the volcano of `Auralis` in another
cell than a HIGH device at detail 100. That is the behaviour of `makeActivity` and not of this
issue.

- **The cone.** `#Auralis@-13.18,12.36` shows the cone with the crater at the origin, smoke, and
  embers. The ground at the origin went from 310.0 to 383.4 units, the crater rim at 40 units out
  stands at 390.5, and the ground at 250 units out is untouched at 320.8. The vent paints
  `1.00,0.42,0.08`, the flank at 60 units `0.19,0.18,0.16`, and the ground at 240 units the biome
  colour.
- **The geyser.** `#Ember@-34.95,-169.86` shows the pool and the mineral ring at the origin and the
  jet on a cycle of 13.31 s. `#Tamsin@40.11,16.48` shows the exotic pool in the glow colour.
- **The cell rules.** `#Auralis@-13.75,12.36`, one cell south, gives `patch.activity` null and no
  phenomenon. A landing straight from the URL, with no aim and no pull, still shows the cone.
- **The pull.** A pick 0.003 units from the phenomenon snaps to its cell; one 0.06 units away does
  not. With a creature home planted 0.001 units from the phenomenon, the pull gives `kind -1`, the
  phenomenon; the same pick on a world with no phenomenon gives `kind 3`, the home.
- **The footprint.** 0 of 1,170 plants, 0 cover cells, and 0 fauna anchors stand inside the 250
  unit cone. The same holds for the 35 unit ring of both geysers.
- **The tiers.** A 900 by 560 viewport takes the LOW row: 80 smoke points and 45 embers against 160
  and 90, and no `PointLight`.
- **Determinism.** Two reloads of `#Ember@-34.95,-169.86` gave the same height hash, the same
  colour hash, the same base height of 435.079, and the same cycle of 13.3148615 s.
- **The worlds that must not change.** `Lumen`, an aurora world, gives a null cell and an untouched
  patch. `Mireth`, a gas giant, keeps its hidden probe button. A patch built with no `opts.activity`
  gives the same heights and colours as before.
- **The frame.** The phenomenon adds 3 draw calls and no measurable work: 1.19 ms of frame work with
  the group in the scene and 1.19 ms with it out, at the same viewpoint. The browser of the test
  harness throttles `requestAnimationFrame` to about 24 Hz, so the frame interval of that machine
  says nothing; the work number is the one to read. Run the README frame-time method in a real
  window before the next issue builds on this one.

## Left for later

- The fissure, the aurora, and the storm. The fissure needs a line that walks over the patch, and
  the two sky kinds need the question the design session left open: do they play everywhere, or
  only near the site?
- The pool of a geyser is a flat disc. It takes no wave and it does not read the sea shader.
- The pull carries no species id when it goes to the phenomenon, so `pulledKind` is -1 there. The
  patch still holds the animals its niches ask for.
