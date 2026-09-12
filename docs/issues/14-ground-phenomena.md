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

- [ ] On a volcano world, aim inside the phenomenon cell. The pull moves the site, and the
      ground shows the cone with the crater at the origin. Smoke and embers rise from the vent.
- [ ] On a geyser world, the ground shows the pool and the mineral ring at the origin, and the
      jet erupts on a 9 to 14 s cycle.
- [ ] A landing in any other cell of the same world shows no phenomenon.
- [ ] A landing that hits the phenomenon cell without the pull still shows the phenomenon.
- [ ] With a creature home and the phenomenon both in reach, the site goes to the phenomenon.
- [ ] No flora and no grass stand on the cone footprint or the mineral ring.
- [ ] LOW shows half the points and no `PointLight`. The frame time holds on HIGH and LOW per
      the README method.
- [ ] A reload of the same URL replays the same cone, the same colours, and the same eruption
      times.
- [ ] A world with no activity, and a gas giant, behave exactly as before.
- [ ] `README.md` and `docs/probe.md` record the change.

## Blocked by

- 04 Patch terrain from the worker — CLOSED
- Design session — held 2026-09-12; this file records the outcome
