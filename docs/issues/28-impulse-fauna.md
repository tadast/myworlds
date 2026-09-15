# 28 Impulse fauna: the roller, the flow, and the slinger

Type: HITL, run by a manager agent that spins off sub-agents. Phase 2. Blocked by: 09, 10, 27.
Read `docs/issues/README.md` first, then `docs/fauna.md` in full, then this file.

Design session held 2026-09-15. The decisions below are final. Do not reopen them. Ask the
reader only when a decision here contradicts the code you find.

## What to build

Three new land locomotions that move in bursts, and one steering model that carries all of them
and the monopod too. Each stores energy and lets it go in one throw. The world is what moves them,
so gravity and slope shape each one.

| Locomotion | Charge | Discharge | Terrain rule |
|---|---|---|---|
| `roller` | Folds its legs and its head into its hull on the spot | Rolls straight ahead as a ball, spun by the ground it covers | Longer downhill, shorter uphill, no launch up a steep slope |
| `flow` | Lets go of its shape and runs downhill as a flat slick | Gathers at the bottom and jets uphill as a column, lands as a body | Follows the fall line down, the rise line up. Slope and liquid only |
| `slinger` | Hooks a tendon on a plant, hauls its body back | Lets go and flies a ballistic arc past the plant | Real anchors only. It crawls when no plant is in reach |
| `monopod` | Crouches on its one foot | Hops, as today | Unchanged, but it no longer turns in the air |

**The unifying rule:** an impulse animal picks a heading while it charges and holds it through the
discharge. It never turns in flight. The monopod breaks this rule today, because `hopBurst()` is
only a speed factor on the wander model, and the wander keeps turning the heading mid-hop. That is
the first thing this issue fixes.

## Decisions from the design session

1. **Not a new class.** `cls` stays `land`. The group is a mover type, `G.move.mode = 'impulse'`,
   beside the wander model. The lore names the group nowhere; it names each body.
2. **Three new locomotions:** `roller`, `flow`, `slinger`. A coiler and a kiter were considered and
   dropped. The kiter needs a wind field the ground does not have.
3. **One new mover, same interface.** `makeImpulseMover(rng, mv)` and `stepImpulse(st, t, dt)`
   in `fauna.js`, with the state shape of `makeMover()` plus the impulse fields. The three callers
   (`app.js` for the globe, `ground-fauna.js` for the ground, `Inspector` for the card) switch on
   `G.move.mode`. No per-creature code anywhere.
4. **The monopod moves onto the impulse mover.** `hopGait()` stays as the rate. `hopBurst()` is
   deleted, and the `hop` special case leaves all three callers.
5. **A new instance attribute `aBurst`**, a float from 0 to 1, written by the mover every frame.
   0 is at rest, the charge runs 0 to `CHARGE_END`, the discharge runs from there to 1. The shader
   shapes the body from it. The mover owns the timing, so it can wait for a slope, a plant, or a
   herd. `aMove` stays the amplitude gate as today.
6. **The roller locks a gait clock.** `CARRY.ROLL` spins the body about its right axis by `aGait`,
   which the steering advances by the ground covered, so the ball never skids. The body is a `dome`
   or a `blob` with 3 to 5 stubby legs on a ring and a head from the tripod list. The legs and the
   head fold to the hull on the charge. The tuck is the strange thing; keep it visible.
7. **The flow is a stack of rings** with `CARRY.FLOW`. The charge scales the rings down and out
   about the ground point into a slick a few widths wide. The discharge shoots them up into a
   column, then they fall back into a blob. The slick keeps its `glow` accent on, so the reader can
   find a bright slick in the grass. Its mean position holds the leash: the uphill jet is longer
   than the downhill run, so it does not end in the sea.
8. **The slinger uses real anchors on every tier.** `nearAnchor(x, z, reach)` returns a point or
   `null`. On the ground it reads the flora and the landmarks of the patch. On the globe it reads
   the flora points over a grid the worker builds once. On the card the disc grows three or four
   stub posts from `flora-geometry.js`, placed by the card seed; every other species keeps a bare
   disc. The tendon is one tube part on a new mode `RIG.TENDON`, stretched from its body pivot to
   `aAnchor`, a three-float instance attribute. With no anchor in reach it crawls on `SWAY`.
9. **Niche gates.** `slinger` rolls only on `forest`, `meadow`, `lowland`. `flow` rolls only on
   `lowland`, `meadow`, `forest`, `beach`, and only on a world with `waterliquid`, or on a `molten`
   world as a lava variant. `roller` rolls on any land niche.
10. **Herds.** Every member of an impulse group runs its own impulse mover. The anchor runs a plain
    wander mover and sets the heading and the range. Each member launches toward its slot on its
    own clock with a stagger per member, so a herd of rollers goes off like a burst of seeds. The
    `lag` chain of the serpent and the plough is untouched.
11. **Sociality weights.** Roller: herd or pair. Slinger: solitary or pair. Flow: solitary. Monopod
    unchanged.
12. **Lore gates.** Add `bursts` (all four impulse locomotions), `flows` (the flow), `tethers` (the
    slinger). Diet `src`: roller `ground`, flow `ground`, slinger `plant` gated on `flora`. Size
    axis: roller `height`, slinger `length` with the tendon excluded, flow `height` in the gathered
    blob. One new relation: a slinger that holds the plant a `garden` species grows on, mirrored,
    with a row in `RELATION_CONTRACT`. No "muscle", "water", "spring" as an Earth mechanism.
    `LEXICON` gets "downhill" gated on a land niche.

## Shared contracts

These are the seams between the work packages. A sub-agent changes one only by saying so in its
summary, and the manager then updates every other package before it starts.

### `G.move.mode`

`MOVE` in `species.js` gains `mode: 'wander' | 'impulse'` on every row. `monopod`, `roller`,
`flow`, and `slinger` are `impulse`. Every other row is `wander`. Callers read `G.move.mode` and
nothing else to choose the mover.

### The impulse mover

```js
// fauna.js
export function makeImpulseMover(rng, mv, hooks = {});
//   hooks.slope(x, z)         -> { gx, gz } the gradient of the ground, or null on a tier with none
//   hooks.nearAnchor(x, z, r) -> { x, z } or null. Only the slinger reads it
export function stepImpulse(st, t, dt);
```

The state carries the fields of `makeMover()` (`x`, `z`, `hd`, `spd`, `turnN`, and the rest, so
`moverActivity()`, `turnCap()`, and `turnLean()` still read it) plus:

| Field | Meaning |
|---|---|
| `phase` | `'rest' | 'charge' | 'fly' | 'recover'` |
| `burst` | 0 to 1, what `aBurst` takes |
| `aim` | the heading held through the flight |
| `range` | the ground this throw will cover, set at launch from the slope and the gravity |
| `anchor` | `{ x, z }` or null, the slinger only |
| `stagger` | seconds, per member, so a herd does not fire as one |

`stepImpulse()` runs the wander only in `rest` and `charge`, to pick `aim`. In `fly` it holds
`aim`, moves at the burst speed, and writes `turnN` as 0. In `recover` it eases `spd` to 0. The
mean speed over one full cycle equals `mv.speed` scaled by the tier, so the leash and the cruise
numbers in `MOVE` keep their meaning.

### Instance attributes

**Changed by P1, 2026-09-15.** A creature program already used all 16 attribute slots the hardware
promises, and `aBurst` and `aAnchor` as two more would have overflowed it. The four dynamic floats
now travel in one `vec4`:

| Attribute | Floats | Holds | Writer |
|---|---|---|---|
| `aAnim` | 4 | `[aMove, aGait, aTurn, aBurst]` | the mover, every frame |
| `aAnchor` | 3 | the point the tendon holds, in the frame of the instance | the impulse mover, at launch, on the slinger only |

`aMove`, `aGait`, `aTurn`, and `aBurst` are no longer attributes. The shader reads them back by
name from `aAnim` at the head of the rig block, so every line of `RIG_GLSL` still uses the old
names. A caller that used to write `at.aMove.setX(j, v)` now writes `at.aAnim.array[j * 4] = v`.
`aBurst` is index 3, and a wander species leaves it at 0 for the life of the mesh.

Both attributes go on every fauna mesh, including the coarse mesh and the card mesh, so one
material serves all. A program now uses 14 of the 16 slots.

### The mover state, in the names the code uses

The table above writes `x`, `z`, and `hd`. `makeMover()` calls them `u`, `v`, and `heading`, and
the impulse mover keeps those names. The impulse fields are as the table says, plus `owed`: the
ground the cruise speed has asked for and no throw has yet given. A throw pays the whole debt at
once, so the ground covered over many throws is the ground the cruise asks for.

`impulseBlocked(st)` ends a throw the caller refused, because a flight holds one heading and would
otherwise drive the body into the same water for the rest of the throw. Both ground callers call it
in their water and edge branch.

### New carriages and modes

`CARRY.ROLL = 6`, `CARRY.FLOW = 7`, `CARRY.SLING = 8`. `RIG.TENDON = 9`. `CARRY.HOP` reads
`aBurst` in place of its own clock. Add the constants each carriage needs to `rigConstants()`, so
they sit in the program key.

### `nearAnchor`

```js
nearAnchor(x, z, reach) -> { x, z } | null
```

Ground: `ground-fauna.js` receives it from `Ground`, built over the `flora` array of the patch and
the landmarks of issue 27 on a grid of 50 units. Globe: `app.js` builds it over the globe `flora`
positions, in globe units, on a grid the worker returns as `floraGrid`. Card: `Inspector` builds it
over its own posts.

## Work packages

The manager runs these as sub-agents. Each package is one branch and one commit set on
`tt/28-<package>`. The manager merges in the order below and verifies after every merge.

```
P1 mover ──► P2 roller ──┬──► P5 herds
             P3 flow   ──┤
             P4 slinger ─┘
P6 docs runs last, on the merged result
```

P2, P3, and P4 run in parallel once P1 is merged. P5 starts once P2 is merged and may run beside
P3 and P4. P6 runs alone at the end.

### P1 The impulse mover and `aBurst`

Files: `fauna.js`, `species.js`, `app.js`, `ground-fauna.js`.

1. Add `mode` to every `MOVE` row. Monopod is `impulse`.
2. Add `makeImpulseMover()` and `stepImpulse()` per the contract. Port the hop timing from
   `hopBurst()`: the foot holds the ground `HOP_GROUND` of the cycle, the ramps are `HOP_RAMP`.
3. Add `aBurst` and `aAnchor` to every fauna mesh: `buildCreature()` output, the globe meshes in
   `app.js`, the near and far meshes in `ground-fauna.js`, the card mesh in `Inspector`.
4. `CARRY.HOP` reads `aBurst` in place of its clock. Delete `hopBurst()`. Keep `hopGait()` for the
   rate the mover uses.
5. Switch the three callers on `G.move.mode`. Remove every `hop` field and branch from them.
6. Pass `hooks.slope` on the ground and the globe from `heightAt` and the globe height map, by
   central difference. Pass nothing on the card.

Acceptance:

- [ ] A monopod holds one heading from take-off to landing on the globe, on the ground, and on the
      card. Watch three hops of one animal on each tier.
- [ ] The mean speed of a monopod over 20 s matches the value before the change within 10 percent.
      Measure with `window.__mw.ground.fauna` on the same URL, before and after.
- [ ] Every wander species is unchanged: same path on a reload of the same URL, before and after.
- [ ] `grep -n hopBurst *.js` returns nothing.
- [ ] Frame time holds on HIGH and LOW per the README method, on a site with 299 creatures.

### P2 The roller

Files: `species.js`, `fauna.js`, `ground-fauna.js`.

1. `species.js`: add `roller` to `LOCO.land`, `PLAN` (`dome`, `blob`), `HEAD` (the tripod list),
   `EXTRAS` (`spikes`, `beads`, `plates`, `antennae`), `MOVE` (`impulse`, speed near the quad,
   leash near the biped), `BODY` (`height`), `SOCIAL` (herd 0.5, pair 0.3, solitary 0.2), `legLen`
   0.12 to 0.2, `gait`, `size`, `NOUN`, `GENUS`, `ORIGIN`, `DIET` with `src: 'ground'`,
   `habitKey()`, and the `bursts` gate.
2. `fauna.js`: `legPlan()` seats 3 to 5 stubby legs on a ring about the hull. `LEG_SWING.roller`
   is 0 and `LEG_DUTY.roller` 0.5, and the gait locks (`gaitLocked` true), so `aGait` advances by
   the ground covered. `CARRY.ROLL`: on the charge (`aBurst` 0 to `CHARGE_END`) the legs and the
   head fold to the hull about their pivots; on the discharge the whole body spins about its right
   axis by `aGait / bodyR`; on recover the parts unfold. Add `ROLLR` to `rigConstants()`.
3. Coarse build: the ball is an octahedron, the legs are one bone each, as for every other
   locomotion. The spin still reads at a dozen pixels, so keep it.
4. Mover rule: at launch `range = base * (1 - k * slopeAlongAim)` clamped, and no launch when the
   slope along `aim` is over `ROLL_MAX_UP`. On a refusal the wander picks a new heading next frame.
5. Slope on the globe: the same rule with the globe height map.

Acceptance:

- [ ] `__mw.inspect(k)` on a roller shows the tuck, the roll, and the unfold. The ball does not skid:
      one spin covers about one circumference.
- [ ] On a ground slope the roller rolls farther downhill than uphill. Count throws on one animal.
- [ ] On the flattest ground the roll reads the same in any direction.
- [ ] `node tools/lore-audit/audit.mjs --seeds 200` runs clean. A roller world prints a story that
      names the tuck or the roll and never a leg walk.
- [ ] Coarse and full builds share the outline through the LOD swap.

### P3 The flow

Files: `species.js`, `fauna.js`, `ground-fauna.js`, `app.js`.

1. `species.js`: add `flow` with `PLAN` (`blob` only), `HEAD` (`none`, `stalks`, `lure`),
   `EXTRAS` (`beads`, `tendrils`), `MOVE` (`impulse`, slow), `BODY` (`height`), `SOCIAL`
   (solitary 1.0), `NOUN`, `GENUS`, `ORIGIN`, `DIET` with `src: 'ground'`, `habitKey()`, the
   `flows` gate, and the niche gate of decision 9. The lava variant on a `molten` world takes its
   `glow` from the accent and its `ORIGIN` line names heat, not water.
2. `fauna.js`: the body is a stack of 5 to 8 rings (open cylinders) on one pivot at the ground
   point, plus the head. `CARRY.FLOW`: on the charge the rings scale down in y and out in xz to a
   slick `FLOWW` widths wide; at `CHARGE_END` they gather to the blob; on the discharge they scale
   up in y into a column `FLOWH` tall, the top ring first, then fall back. The `glow` of the slick
   stays at full. Coarse build: three rings.
3. Mover rule: in the charge the animal moves down the gradient at a speed set by the slope and
   creeps on flat ground. At launch `aim` is up the gradient and `range` is `FLOW_UP` times the
   ground the run covered, so the mean holds the leash. Keep the walker sea margin.
4. The globe uses the same rule on its height map.

Acceptance:

- [ ] `__mw.inspect(k)` on a flow shows the slick, the gather, the column, and the fall.
- [ ] On the ground the flow runs down a slope and jets up it. Over one minute it ends within its
      leash and never enters the sea.
- [ ] The slick is visible in grass at 30 m by its glow.
- [ ] A dry world never rolls a flow. A `molten` world rolls the lava variant with heat lore.
- [ ] `node tools/lore-audit/audit.mjs --seeds 200` runs clean.

### P4 The slinger

Files: `species.js`, `fauna.js`, `ground-fauna.js`, `ground.js`, `app.js`, `worker.js`,
`flora-geometry.js` (read only), `flora-card.js` (read only).

1. `species.js`: add `slinger` with `PLAN` (`spindle`, `blob`), `HEAD` (`beak`, `mandibles`,
   `stalks`), `EXTRAS` (`tail`, `spikes`, `antennae`), `MOVE` (`impulse`), `BODY` (`length`,
   tendon excluded from the measure), `SOCIAL` (solitary 0.6, pair 0.4), `NOUN`, `GENUS`,
   `ORIGIN`, `DIET` with `src: 'plant'` gated on `flora`, `habitKey()`, the `tethers` gate, the
   niche gate of decision 9, and the relation with a `garden` species plus its
   `RELATION_CONTRACT` row.
2. `fauna.js`: the tendon is one thin tube on `RIG.TENDON`, pivot at the front of the body. The
   shader stretches it from the pivot to `aAnchor` in the frame of the instance, and hides it by
   scale 0 when `aAnchor` is the zero vector. `CARRY.SLING`: on the charge the body hauls back
   along `-aim` by `SLINGB`; on the discharge it pitches nose-first along a ballistic arc of height
   from the gravity; on recover it settles. With no anchor the carriage is `SWAY` at a crawl.
3. `nearAnchor` on three tiers per the contract. The worker returns `floraGrid` for the globe.
   The card seats three or four posts on its disc from `flora-geometry.js` for a slinger only.
4. Mover rule: in `rest` it asks `nearAnchor(x, z, reach)`. With a point it aims past it, sets
   `anchor`, and charges. Without one it crawls on the wander at `CRAWL` of its speed and asks
   again every second.

Acceptance:

- [ ] On the ground a slinger throws between real plants. The tendon ends on a plant, never in
      the air. Watch five throws.
- [ ] With every plant out of reach it crawls and never throws.
- [ ] On the card it throws between the posts.
- [ ] On the globe it hops between flora points; the tendon may be under a pixel.
- [ ] A `dune`, `snow`, or `ash` niche never rolls a slinger.
- [ ] The relation with a `garden` species appears on a world with both, mirrored on both cards.
- [ ] `node tools/lore-audit/audit.mjs --seeds 200` runs clean.

### P5 Impulse herds

Files: `ground-fauna.js`.

1. A group whose species is `impulse` gives every member its own impulse mover with the hooks of
   the group. The anchor keeps a wander mover.
2. A member aims at its slot, not at the anchor heading, and launches on its own clock with a
   `stagger` from its phase. `MEMBER_RUSH` does not apply in `fly`; the throw sets the speed.
3. The formation stays loose: a member lands past or short of its slot and does not slide to it.
   `MEMBER_EASE` applies only in `rest`.
4. `_stepMember()` reads `aMove`, `aGait`, `aTurn`, and `aBurst` from the member mover.

Acceptance:

- [ ] A herd of rollers goes off in a stagger, not as one. No member slides to its slot.
- [ ] A pair of slingers never hooks one plant at the same time. Add the rule if it happens.
- [ ] `window.__mw.ground.fauna.stepMs` stays under 0.15 ms on a site of 299 creatures.
- [ ] Frame time holds on HIGH and LOW.

### P6 Docs

Files: `docs/fauna.md`, `README.md`, `docs/issues/README.md`, this file.

1. `docs/fauna.md`: add the four locomotions to the class table, `aBurst` and `aAnchor` to the
   attributes, the three carriages and `RIG.TENDON`, the impulse mover to stage 4 with its state
   table, the `nearAnchor` contract, the herd rule, the new gates, and the checklist line "Add an
   impulse locomotion".
2. `README.md` "How it works": one paragraph on the impulse animals.
3. `docs/issues/README.md`: close this row.
4. This file: fill "What it built" with the numbers measured.

## Manager protocol

1. Read every file named in "Work packages" before you start a sub-agent. Confirm the contracts
   match the code at `HEAD`. Stop and report if `stepMover()`, `rigConstants()`, or the fauna
   attribute list moved.
2. Start P1 alone, in a worktree, on `tt/28-mover`. Review its diff against the P1 acceptance list.
   Merge to `main` only when every box is checked and the audit runs clean.
3. Start P2, P3, and P4 in parallel, each in its own worktree from the merged `main`, on
   `tt/28-roller`, `tt/28-flow`, `tt/28-slinger`. Each sub-agent gets this file, `docs/fauna.md`,
   and `docs/issues/README.md`, and the instruction to change only its own files. `species.js` and
   `fauna.js` are shared; tell each sub-agent to add its rows and branches under a comment header
   with its locomotion name, so the merges stay clean.
4. Merge P2 first. Start P5 from that `main`. Merge P3 and P4 as they pass. Resolve conflicts in
   `species.js` and `fauna.js` by keeping every branch; the locomotions do not overlap.
5. After every merge: force fresh sources per the README trap, reload two seeds, run the audit
   with `--seeds 200`, and measure the frame time on HIGH and LOW. Record the numbers.
6. Run P6 on the merged result. Commit each package on its own, with the attribution line the
   session gives you. Do not commit at the parent `code/` level.
7. Report to the reader with: the seeds that show each locomotion (`#Seed@lat,lon`), the frame
   times, the audit result, and every box left open with its reason.

## What to verify by hand

The reader will look at the four cards and at one ground site per locomotion. Find a seed for each
with a loop over `__mw.generate` and record the URL in "What it built". A locomotion with no seed
found in 300 tries has a niche gate that is too tight; report it.

## Blocked by

- 09 Ground fauna in groups — CLOSED
- 10 Far fauna coarse mesh — CLOSED
- 27 Clumped flora and mega plants — CLOSED, the landmarks the slinger anchors to
- Design session — held 2026-09-15; this file records the outcome

## What it built

Closed 2026-09-15. Six packages, merged in the order the plan set, and verified in Chrome after
every merge.

### Seeds

| Locomotion | Seed | What it shows |
|---|---|---|
| `roller` | `#s3@0.00,-45.00` | Ice world, "Lantern roller". Stands, folds, rolls, unfolds |
| `roller`, a herd | `#herd-13@24.59,168.84` | A herd of 14 and 294 rollers on one patch. The worst case for the frame rate |
| `flow` | `#gate-2@10.81,-143.19` | Terran, "Pale slick". 10 of 20 groups are the flow |
| `flow`, the lava variant | `#gate-70@57.7,176.85` | Lava world, glow from the accent, heat lore |
| `slinger` | `#s6@-25.00,-45.00` | Terran, "Beaked slinger". 15 groups |
| `monopod` | `#Auralis@11.61,150.94` | The body that moved on to the new mover |

### The numbers

| Measure | Result |
|---|---|
| Monopod heading through a hop | 0 rad of drift over four flights, on the globe, the ground, and the card |
| Monopod mean speed | +2 percent against the model before the change, over three runs of 18 s. Offline the two models agree to 0.4 percent |
| Wander species | Every mover of every species byte identical against `main`, on the same URL |
| Frame time, HIGH | 16.6 ms at 294 rollers, all of them impulse animals. 16.6 ms at 299 wander animals, before and after |
| Frame time, LOW | 16.6 ms at 98 rollers |
| `stepMs`, HIGH | 0.766 ms at 294 impulse animals, against 0.572 ms at 299 wander animals on `main`. The walk costs about a third more where every animal carries a mover of its own |
| Roller, the roll | 5.6 s and 8.7 m per throw on the ground, against 1.2 s before. One turn of the hull covers 5.96 m of stride against a 6.11 m circumference: no skid |
| Roller, the slope | A throw of 10 m becomes 5.2 m up a slope of 0.30 and 14.8 m down it. A rise over `ROLL_MAX_UP` is refused |
| Flow, the leash | 10 groups over 60 s: the furthest reached 35 m of a leash of 72 to 120 m, and none went below 197 m of elevation |
| Flow, throw over run | A floor of 1.27 against a target of 1.20, over gradients of 0.05 to 2.0 |
| Slinger, the holds | 26 of 26 live holds on the ground were a real plant of the patch. Headless: 127 throws over 900 s, 106 distinct holds, none outside the field |
| Slinger, no plant | With every plant out of reach it never leaves `rest` and crawls at `CRAWL` of its speed |
| Herd stagger | A herd of 14 rollers spreads its first launches over 0.77 of a cycle. A live herd held four phases at once |
| Herd, no slide | 21,879 throws: the gap to the slot came out at a median of 26.9 m, and only twice under half a metre |
| One plant, one body | 0 frames where two movers held one plant. With the rule taken out, 1,954 frames of 36,000 on a thin stand |
| Gate sweeps | 400 worlds: no flow on a dry world, none in a `dune`, `snow`, `sea`, or `cloud` niche. 300 worlds: no slinger on `dune`, `snow`, or `ash`, and none on a world with no flora |
| `node tools/lore-audit/audit.mjs --seeds 200` | Clean after every merge |

### The boxes that stayed open

- **`window.__mw.ground.fauna.stepMs` stays under 0.15 ms on a site of 299 creatures.** It does
  not, and it did not before this issue either: `main` measures 0.572 ms on this machine for 299
  wander animals. The 0.10 ms in `docs/fauna.md` is a number from another machine. This issue adds
  a third of that on a site where every animal is an impulse animal, because the herd rule of P5
  asks for one mover per member instead of one per group. The frame rate holds at 60 fps on both
  tiers, which is the check the README really states.

### Decisions changed from the design session

1. **The lava variant of the flow takes the `ash` niche.** Decision 9 forbids `ash`, but `molten`
   is only reachable on a `lava` world, and `WORLD_NICHES.lava` holds `ash` alone. The two clauses
   together make the lava variant unreachable. It is now allowed on `ash`, and only on a molten
   world. Every other niche gate of decision 9 holds.
2. **`FLOW_UP` is a floor, not a multiplier on the throw.** The mover pays every throw out of the
   ground the cruise speed banked. A multiplier on top of that would make the species faster than
   `MOVE` says it is. The ratio is held from the other end, by a cap on the run down.
3. **The flow and the slinger take no recovery phase.** The recovery runs `aBurst` from 1 back to
   0, which would play the column and then the slick backwards. Both settle inside the discharge
   and wait in a long rest instead.
4. **`aBurst` and `aAnchor` are not two attributes.** A creature program already used all 16
   attribute slots the hardware promises. The four dynamic floats now travel in one `vec4`,
   `aAnim`, and `aAnchor` rides beside it. See "Instance attributes" above.
5. **A roller rolls five times as long as one throw cycle would give it.** Asked for by the reader
   after the merge: a ball that stops after a second reads as a ball that fell over. An `IMPULSE`
   row may now stretch its discharge alone, and a stretched throw takes a cap against the leash, so
   the long roll fills a ground leash and stays short on the globe.

### Found on the way, and fixed

- A `SKY` line about a ring had the animal move and carried no `roams` gate, so it could reach a
  burrower whose own sociality line says that none of them ever moves. The hole was there before
  this issue; a new land locomotion only changed which seed found it.
- `tools/lore-audit/audit.mjs` holds its own list of locomotions. Without a row there the sweep
  never asks a pool of a new locomotion a question and never runs a relation rule against it. All
  three new rows are added, and `docs/fauna.md` now says so in the checklist.
- A row in one of the four `{...}[loco]` tables of `rollGenome()` draws a number for every species
  of every world, not only for its own. All three packages found it. Each locomotion now draws its
  numbers in a branch of its own.
- A group mover holds its place as an offset from its anchor, so a hook that read `(u, v)` directly
  sampled the landing site. The mover now carries its own origin, and every hook takes a plain
  point of its tier.
- The gait clock read the speed the wander asked for. An impulse animal covers the whole of its
  ground in one throw, so a ball driven by that speed would turn while it stood still. The clock
  now reads the ground the animal really covered.
