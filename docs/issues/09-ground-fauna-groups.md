# 09 Ground fauna in groups

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

- [ ] Descend on a pulled site: the pulled species is there in a group of the size the lore states, and moves as a group. Members do not overlap or drift apart.
- [ ] A herd species stops and starts together. A pair stays together. A solitary animal roams alone.
- [ ] Creatures stand on the ground on slopes. Flyers clear hills.
- [ ] A creature of "4 m at the shoulder" measures 4 m against the 2 m grid, and a "17 m" flyer is visibly huge.
- [ ] Clicking a creature opens its inspector card.
- [ ] Same URL gives the same groups on reload.
- [ ] Frame time on a site with 300 creatures at 30 m above ground is under 12 ms on HIGH with terrain, sea, and flora present. Report the steering walk time.
- [ ] `docs/fauna.md` gets a section "Ground tier" with the group model.

## Blocked by

- 04 Patch terrain from the worker
- 08 Sociality gene
