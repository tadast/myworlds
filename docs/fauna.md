# Fauna generation: architecture and topology

This document describes how myworlds makes its fauna. Read it before you change `species.js`, `fauna.js`, the fauna parts of `worker.js`, or the fauna parts of `app.js`.

## What "fauna" means here

**Fauna is anything alive that moves under its own power. It is not necessarily an animal.**

The word is a container, not a claim. A body counts as fauna when it travels, and nothing more
follows from that. It does not have to hold blood, bone, a spine, a face, or a mouth, and it does
not have to descend from anything on Earth.

The roll says so. A body plan may be a `swarm`, which is one creature made of many small bodies, or
a `disc`, or a `blob`. A locomotion may be a `monopod` on one leg, a `tripod` on three, a `sac` that
floats and never lands, a `periscope` or a `plough` that travels under the surface, or `fins` on a
whale that swims in air. A head may be a `lure`, a pair of `stalks`, or `none`. An extra may be a
`garden`, which is flora that lives on the back of the creature. A gas giant always holds a whale,
because a gas giant holds no ground to stand on.

The code says "animal" and "creature", because a short word is necessary for one body in an array.
Read "animal" as "one body that travels".

### The rule for new text and new species

The reader stands on an alien world. Every line the inspector card shows must hold on an alien
world.

- **Write the alien reading first.** The words `beak`, `tusks`, and `quad` name a shape the builder
  makes, and not a family of Earth animals. A quad with a lure and a sail is not a dog.
- **Do not name an Earth species, an Earth genus, or an Earth place.** `GENUS`, `EPITHET`, `NOUN`,
  and `PLACE` in `species.js` are invented words, and they must stay that way.
- **Do not assume a life process.** Lungs, a heart, warm blood, milk, eggs, a nest, a herd instinct,
  and a year of seasons are Earth facts. The genome states what the body has. `DIET` states what it
  eats and where the food comes from, and the sociality gene states whether it keeps company at all.
- **Gate every claim on a part or a tag.** Do not add a sentence that names a part unless the code
  checks that the part is present. The gate table below lists every predicate a line may test.
- **Keep the strange thing strange.** A sac that never lands, a swarm that acts as one body, and a
  whale in the sky of a gas giant are the reasons the reader looks up. Text that makes them
  ordinary throws that away.

`docs/flora.md` states the same rule for the stationary bodies. The two must agree, because
`FAUNA_LINKS` writes one line that names a body from each side.

## Overview

The fauna pipeline has four stages. Each stage lives in one file.

| Stage | File | Runs in | Output |
|---|---|---|---|
| 0. The lore engine | `lore.js` | Web Worker, page | `self.Lore`: tags, gated text pools, story slots, relations |
| 1. Roll the species | `species.js` | Web Worker | `world.species`: an array of genomes with lore |
| 2. Place the creatures | `worker.js` | Web Worker | `fauna`: a `Float32Array`, 9 floats per creature |
| 3. Build and animate | `fauna.js` | Main thread | One `InstancedMesh` per species on the globe, two on the ground, one rig shader |
| 4. Steer and inspect | `app.js`, `fauna.js` | Main thread | Roaming on the height map, the inspector card |

The same seed always gives the same species, the same names, and the same placement. All randomness comes from the seeded `makeRng()` streams in the worker.

## Stage 1: genomes (`species.js`)

`species.js` is a classic script. The worker loads it with `importScripts('./species.js')`, after `lore.js`. It sets `self.Species = { makeSpeciesSet, describe, bodyMetres, NICHE, RELATIONS, POOLS }`. It does not use three.js. Keep it that way, so the worker stays free of rendering code.

`makeSpeciesSet(rng, type, world, P)` returns two to four genomes for one world, with their sociality, and no text. `P` is the raw palette from `makePalette()` in the worker.

`describe(world, rng)` writes the lore of every species. It runs later, and it runs from its own stream, so text changes never move a body.

### Niches

A niche is a place on the planet. Each niche lists which classes can live there, a ground word for the lore, place words for names, and a habitat text per class. The niches are:

- `beach`, `meadow`, `forest`, `lowland`, `dune`, `snow`, `ash`, `sea`, `cloud`.

`WORLD_NICHES` maps each world type to a niche list and a species count. The first two niches in the list always get a species. The rest are picked at random. The first species of a world with ground is always a land walker.

### Classes and locomotions

A class says where the animal lives. A locomotion says how its body moves.

| Class | Locomotions |
|---|---|
| `land` | `monopod`, `biped`, `tripod`, `quad`, `hexapod`, `serpent`, `roller`, `flow`, `slinger` |
| `air` | `sac`, `wings`, `fins` |
| `sub` | `arch`, `periscope`, `plough` |

**Four of the land locomotions travel in bursts.** A `monopod`, a `roller`, a `flow`, and a
`slinger` store the ground they owe and let it go in one throw. They are not a class of their own:
`cls` stays `land`, and the group is a steering model, `G.move.mode === 'impulse'`. The lore names
each body and never the group. See "The impulse mover".

| Locomotion | Charge | Discharge | Terrain rule |
|---|---|---|---|
| `monopod` | Crouches on its one foot | Hops | None. It holds the heading it crouched on |
| `roller` | Folds its legs and its head into its hull | Rolls ahead as a ball for several seconds, spun by the ground it covers | Longer downhill, shorter uphill, and no launch up a rise over `ROLL_MAX_UP` |
| `flow` | Lets go of its shape and runs downhill as a flat slick | Gathers, then jets uphill as a column, and lands as a body | Follows the fall line down and the rise line up |
| `slinger` | Hooks a cord on a plant and hauls its body back | Lets go and flies a ballistic arc past the plant | Real plants only. It crawls when none is in reach |

`LOCO_GATE` in `species.js` holds what a niche and a world must give a locomotion before the roll
may pick it. A `flow` needs a slope with soil under it and liquid water, or a molten world, where
it is a body of hot rock on the ash plain. A `slinger` needs `forest`, `meadow`, or `lowland` and
a world that grows plants: with nothing to hook it could only ever crawl. A `roller` needs nothing,
so it has no row. A gate reads only facts that exist before the roll, and it draws no number of its
own, so a species no gate touches keeps the numbers it drew before.

Rules that limit the roll:

- `fins` (a sky whale) is only rolled for the `sea` and `cloud` niches.
- A gas giant always gets a whale as its first species.
- Two species of one world do not share a locomotion when a different one is available.

### Body parts

Each locomotion has its own lists in `PLAN`, `HEAD`, `EXTRAS`, and `ALWAYS`.

- **Plan** (body shape): `blob`, `spindle`, `chain`, `dome`, `disc`, `swarm`.
- **Head**: `beak`, `mandibles`, `stalks`, `lure`, `crest`, `tusks`, `none`.
- **Extras**: `sail`, `spikes`, `beads`, `tendrils`, `garden`, `plates`, `tail`, `flukes`, `antennae`, `mounds`.
- **Always**: parts that a locomotion must have. A sac has tendrils. Fins have flukes. All sub-surface locomotions have mounds.

The roll adds one to three extras from the list. A `garden` needs a world with flora.

### Genome fields

A genome `G` is plain data. `fauna.js` reads these fields:

| Field | Meaning |
|---|---|
| `id` | Index in `world.species`. The creature `kind` in the fauna array is this index. |
| `cls`, `niche`, `loco`, `plan`, `head`, `extras` | The parts described above |
| `segs` | Segment count for a `chain` plan (4 to 7) |
| `bodyR` | Body radius in creature units |
| `stretch` | Length factor for a `spindle` on land |
| `legLen` | Hip height. Zero for animals without legs |
| `jointed` | Legs have a knee |
| `gait`, `flap`, `slow` | Frequencies for the walk cycle, the wing beat, and slow rhythms. The wing beat is slower for a large body |
| `size` | Scale factor used at placement |
| `hover` | Height above the ground in world units (air only) |
| `move` | `{ leash, speed, turn, pause, flies, shadow }` for the steering model |
| `social` | `{ kind, n, spread }`. `kind` is `solitary`, `pair`, or `herd`. `n` is 1, 2, or 4 to 14. `spread` is the formation radius in metres |
| `density`, `fsign`, `fcut` | Placement rules (see stage 2) |
| `gravity` | The world gravity in g. `makeStats()` in the worker writes it on every species after the roll |
| `colors` | `{ body, body2, accent, glow }` as hex strings |
| `lore` | `{ name, latin, habitat, size, diet, temperament, story, plural }` |

### Size in metres

`Species.bodyMetres(G)` returns `{ metres, axis }`. `metres` is how large the animal is in the real world. `axis` is `height` or `length`, and it tells the ground code which extent of the geometry to match to `metres`. The `BODY` table holds a factor on `G.size` and the axis for each locomotion. A swarm is measured across the whole wheel. A hexapod measures along `length`, because its lore text says "long"; see the decision in `docs/issues/README.md`.

`sizeText()` formats the same number, so the lore text and the ground scale cannot drift apart. The leading number of `lore.size` is always `bodyMetres(G).metres`.

Since issue 19 the ground box holds an artificial scale, because it draws a cell of the globe tens
of kilometres wide. `bodyMetres` still gives the number the lore states, and the ground still
scales the geometry to it, so an animal reads as normal against a plant and against the terrain
texture. It is no longer that many metres of the planet. `patch.metresAcross` and
`patch.metresUp` give the two scales of the box.

### The sociality gene

`G.social` says how the species groups: `{ kind, n, spread }`. The weights come from the locomotion. A quad or a hexapod is usually a herd animal. A serpent, a sac, and a sky whale are usually alone. A swarm is always a herd. Herd `n` is 4 to 14, a pair is 2, and a solitary animal is 1. `spread` is `n` times the body metres times 0.8, so a herd of large animals has room.

`makeSpeciesSet()` rolls `social` in a second pass, after every body exists, because a relation between two species reads the sociality of both.

`describe()` then writes the sociality into the lore. It adds one story sentence, and it sets the manner text from the habit and the sociality together, for example `Placid, herds of nine` or `Wary, solitary`. A species that is not a herd never gets the `herd` habit, because that sentence would contradict the gene. A line that says "alone" is gated on `solo`, and a line that says "the others" on `grouped`, for the same reason.

### The lore engine (`lore.js`)

`lore.js` holds the machinery and no vocabulary. It exposes `self.Lore`. The flora will use the same engine, so never put an animal word in it.

**Tags.** `Lore.makeEnv(facts)` turns the raw numbers of a planet into `env.tags`, a `Set` of short words. The bands are:

| Axis | Tags |
|---|---|
| Temperature °C | `frozen` < -40, `cold` -40 to 5, `temperate` 5 to 32, `hot` 32 to 120, `molten` >= 120; plus `subzero` below 0, `searing` at 60 and up, `waterliquid` between 0 and 100 |
| Gravity g | `lowgrav` < 0.7, `fairgrav`, `highgrav` > 1.35; plus `feathergrav` < 0.5, `crushgrav` > 1.8 |
| Day hours | `shortday` < 12, `evenday`, `longday` >= 36; plus `slowspin` >= 48 |
| Moons | `moonless`, `onemoon`, `twomoons`, `manymoons`, `moonlit`, `tides` |
| Surface | `noground`, `hasocean`, `dryworld`, `mostlysea`, `mostlyland`, `rainy` |
| Plants | `noflora`, `flora`, `sparseflora`, plus whatever the caller passes in `floraTags`: `woody`, `cactus`, `crystalflora`, `fungal`, `stoneflora` |
| Other | `ringed`, `volcanic`, `geysers`, `auroral`, `stormy`, and the world type itself |

A tide needs a moon, a sea, and liquid water. Rain needs liquid water and a sea. A fact the caller does not know adds no tag, so no line can claim it.

The engine does not know what a plant kind is. `makeEnv` takes `floraTags` already resolved, and `plantWord` for the lines that name one plant. `FLORA_LORE` in `worker.js` is the one table that maps a kind code to both, and it sits next to `FLORA` so the two cannot drift. The flora file will read the same table.

**Gates.** A line is `{ t, tags, if, w }`. `tags` is a string of terms tested against the tag set: `cold` requires, `!gas` forbids, `woody|fungal` takes either. `if(ctx)` tests the organism, where `ctx` holds `G`, `env`, `tags`, and `world`. `w` is the weight.

**Specificity.** The engine multiplies a line's weight by `1 + 0.9 * conditions`. A line with one condition is about twice as likely as a plain line, and a line with three about four times. The planet therefore shows through without shutting the general lines out. When two lines must not compete at all, make the tests exclusive rather than leaning on the weights; see `DIET`.

**Slots.** A story is `lore.parts`, a named set, assembled in `STORY_ORDER`. A later pass fills or replaces a part and the story is joined again. Nothing rewrites text by searching it.

**Relations.** `Lore.relate(rng, members, rules, opts)` walks every ordered pair once, in a fixed order, and rolls at most one relation per member. A rule has `when(ctx)`, `t` for the first member, and `mirror` for the second, so both stories agree.

Because `relate()` takes the first rule that fits a pair, a rule with a loose `when` starves the rest. The audit reports any rule that fits more than a quarter of all genome pairs.

### Lore vocabulary (`species.js`)

`describe(world, rng)` assembles all text from the parts the animal has and the tags the world has. Do not add a sentence that names a part unless the code checks that the part is present, or a condition unless the line is gated on it.

- **Name**: an optional place word from `PLACE` (gated: "tide" needs a tide), an adjective from `ADJ` keyed by one extra or the head, or, one name in four, a word from `WORLD_ADJ` keyed by the planet, and a noun from `NOUN` keyed by the locomotion. No two species of one world repeat a word.
- **Latin**: a genus from `GENUS` keyed by the locomotion, and an epithet from `EPITHET` keyed by the same adjective. On a collision the niche epithet is used, then `WORLD_EPITHET`.
- **Diet**: one `DIET` pool. Every line carries a `src`, the source the food comes from, and the tests are exclusive: plates beat a head, a head beats the general lines, and a burrower feeds below. All the lines that fit one animal must name one `src`; the audit tool checks it.
- **Manner**: `habitKey()` derives it from the locomotion, the head, and the `move` values, then the sociality gene. A species that is not a herd cannot carry the herd manner.
- **Story**: four lines always — `origin` (locomotion), `feature` (a part the name did not use), `habit` (the manner), `social` (the sociality gene) — and two of the four optional ones: `synergy` (a relation, which always takes a place when there is one), `climate` (the planet), `sky` (moons, rings, activity), `close` (the world type). A core slot repeats a line rather than go empty; an optional slot asks `Lore.line` for fresh text only (`strict`) and is dropped when it has none, because `trimStory` will reach for a different one. Two species of one world repeating a sentence word for word reads as one species. `{ground}`, `{world}`, `{day}`, `{night}`, `{temp}`, `{grav}`, `{moon}`, `{moons}`, `{plant}`, and `{other}` are replaced in the text. Every part is capitalised on assembly, so a line stays usable in any slot.

### The gates a line may test

Every predicate a line can carry is defined once, at the top of the lore section, and the relation rules read the same ones. That is what stops a synergy sentence contradicting the origin sentence three clauses earlier.

| Gate | True when | Keeps out |
|---|---|---|
| `onFoot` | `cls === 'land'` | a line that names feet, or standing, reaching a flyer or a burrower |
| `grounded` | `cls !== 'air'` | a line about the ground reaching a sac, which never lands |
| `roams` | not a burrower other than a plough | a line that has the animal travel reaching one whose own sociality line says "None of them ever moves" |
| `solo` / `grouped` / `herded` | the sociality gene | "alone" reaching a herd, "the others" reaching a solitary animal |
| `bursts` | `G.move.mode === 'impulse'` | a line about a throw reaching a body that walks. It reads the steering model, so all four impulse locomotions pass it at once |
| `flows` | `loco === 'flow'` | a line about a body with no shape reaching one that has a shape |
| `tethers` | `loco === 'slinger'` | a line about a cord reaching a body that carries none |

### Relations

`RELATIONS` holds the rules and `RELATION_CONTRACT` holds what each rule needs of each side, in the same words: `mobile`, `walks`, `flies`, `tunnels`, `notburied`. The contract is not used at run time — it is the statement the audit checks the predicates against. Adding a rule means adding its row; a rule with a `mirror` line must state a `b` list, and an empty list is the deliberate way to say the mirror fits anything.

### The environment

`world.env` carries the facts the lore reads. It fills up as the world is built:

1. `worldContext()` calls `rollPlanet()`, which draws the radius, the gravity, the day length, and the temperature from the flavour stream, in the order `makeStats()` used to draw them. It then rolls the species and writes a first draft of the lore, so a patch that runs without a globe build still finds a name on every animal.
2. `generate()` learns the moons, the rings, and the activity only after the globe exists. `describeLife()` copies them into `world.env` and writes the lore again. Same stream, same seed, same text.
3. `makeStats()` formats the numbers `rollPlanet()` drew and adds only the life text, so the flavour stream keeps its order: designation, radius, gravity, day, temperature, life.

The lore draws from `seed + '|lore'`, its own stream. Adding or removing a line never moves a body, a colour, or a placement.

### Reviewing the permutations

`node tools/lore-audit/audit.mjs` runs without a browser and exits non-zero on a finding.

- **Coverage.** It sweeps every world type against every value it can reach — 11,616 worlds — times every class, every sociality, every locomotion, every head, and every part, and asserts that no pool is ever empty. A slot that is full on one planet and empty on the next is a dropped sentence. The grid is not written in the tool: `worker.js` exports `PLANET_RANGES`, so the sweep cannot drift from the ranges the generator rolls.
- **Reachability.** The other side of coverage: a line no world in the sweep can reach is dead text, usually a gate naming two tags no planet carries together.
- **Relations.** Every rule is run against every pair of genome shapes, under a sky with moons and one without, and each pair it accepts must satisfy `RELATION_CONTRACT`. This is the check that catches a blind burrower gathering at a light, or a flyer whose feet turn up food. It also reports a rule no pair can reach, and a rule that fits more than a quarter of all pairs.
- **The lexicon.** A word that claims a fact may only appear where the world has that fact: "rain" needs `rainy`, "tide" needs `tides`, "bark" needs `woody`, "drinks" needs `waterliquid`. Add a rule to `LEXICON` whenever you write a line that leans on the world.
- **Diet exclusivity.** Two `src` values in one candidate set is a finding, because a weighted roll could then hand a predator leaf litter.
- **The lexicon exemptions** are scoped to one rule each. `LEX_SKIP` used to be matched against the whole sentence, so a line that happened to contain "sky whale" skipped every rule; an entry now names the gate it relaxes.
- `--seeds N` runs N real worlds through `worker.js` and checks the finished stories for unfilled tokens, repeated sentences, sociality claims that contradict `G.social`, and mobility claims on an animal that never moves.
- `--show N` prints N sample stories with their planet.

## Stage 2: placement (`worker.js`)

`makeFauna()` visits every terrain vertex. It computes which niches the vertex belongs to from height, temperature, moisture, and the flora noise. For each species whose niche matches, it places a creature when:

- `f * G.fsign >= G.fcut`, where `f` is the flora noise. This splits species into patches.
- `rng() < G.density`.

The home point is the ground radius plus `G.hover`. The scale is `G.size` with a small random spread. `makeGasFauna()` places creatures at random directions above a gas giant.

`packFauna()` keeps at most `maxFauna` creatures with an even stride, and records the species present in `world.faunaKinds`.

Output layout, 9 floats per creature: `x y z` home point, `nx ny nz` surface normal, `scale`, `kind`, `phase`.

A coarse height map (384 by 192, lat/lon) is also sent, so the main thread can follow the terrain.

`site.js` reads the same home points on the main thread. It keeps one unit direction and one species id per creature, and the landing site snaps to the nearest home within two patch widths. See `docs/probe.md`.

## Stage 3: geometry and rig (`fauna.js`)

### Coordinate frame

A creature is built in its own units. The base is at `y = 0`. `+y` is up. The animal faces `+z`. `BASE_SCALE` (0.0077) times the creature scale converts to world units. The hover heights in `species.js` are in the same world units, so they follow every change to `BASE_SCALE`.

### `buildCreature(G, palette, flora, detail)`

`detail` is `'full'` by default, or `'coarse'` for a creature past the LOD distance of the ground.
The globe and the inspector card always take the full build. See "Two levels of detail" below.

The builder makes a list of parts. Each part is `{ geo, color, matrix, glow, rig, pivot }`. `mergeGeos()` merges them into one non-indexed `BufferGeometry` with these attributes:

- `position`, `normal`, `color`
- `glow` (float): gates the emissive term per vertex
- `aRig` (vec4): `[mode, phase, amplitude, weight]`
- `aPivot` (vec3): the point a part rotates or scales about
- `aPivot2` (vec3): the second joint of a leg (the knee). For other parts it equals `aPivot`.

The build order is:

1. **Body**: `bodySections(G)` returns sections and the extents `front`, `back`, `top`, `bot`. `arch`, `periscope`, and `swarm` build their own bodies. `arch` and `periscope` also fill `secs`, so the probe below works for them.
2. **Probe**: `bodyProbe(secs, yc)` treats each section as an ellipsoid. It gives the half-width of the body at a `(y, z)`, and the top or bottom surface at an `(x, z)`. Every part that touches the body gets its root from the probe. Do not place a part with a fixed multiple of `bodyR`; the body is not that wide everywhere.
3. **Legs**: `legPlan(G, len)` returns the hip `z`, an outward direction, and a gait phase per leg. The hip `x` comes from the probe, and the hip sits inside the belly, so the thigh never shows a gap. Each leg is a thigh (hip to knee), a shin (knee to foot), a knee ball when `jointed`, and a foot pad. A leg without a knee has its knee point on the straight line, and a smaller fold.
4. **Head**: attached at `front`. Tall walkers get a neck. Head parts use the `NOD` mode with the neck base as pivot.
5. **Locomotion parts**: wing sheets from `wingGeo()` with a bone on the leading edge, pectoral fins and a belly glow, or the sac's vent and core. A spindle flyer gets a second, smaller pair of wings with a phase offset.
6. **Extras**: placed on the body surface with the probe. A bead or a spike is skipped when the probe finds no body at its place.

Add a new extra by adding a `case` in the extras loop and its name to `EXTRAS`, `ADJ`, `EPITHET`, and `FEATURE` in `species.js`. Use the probe for its root.

### Rig modes

The rig record tells the shader what a part does. The modes are in `RIG`:

| Mode | Value | Motion |
|---|---|---|
| `NONE` | 0 | Only the carriage |
| `LEG` | 1 | Two bones and a duty cycle. Through `DUTY` of the cycle the foot is on the ground and the leg sweeps back about the hip (`aPivot`) at a constant rate. Through the rest the shin folds about the knee (`aPivot2`) by `weight` radians and a cubic carries the foot forward again. The leg also extends, so the arc of the pitch cannot lift the planted foot. `amplitude` is the swing in radians, and the activity scales it. See "The gait clock" |
| `WING` | 2 | Roll about the root at the flap rate. `weight` is the side sign times the span. The angle grows with the distance from the root, and the tip lags the root, so the sheet bends. When `GLIDE` is 0 the wing holds still on a slow cycle |
| `SWAY` | 3 | Lateral drift that grows with the distance from the pivot. A walker (`SWAYG` is 1) sways on the gait clock instead, with a lag along the part, so its tail swings with the stride |
| `PULSE` | 4 | Scale about the pivot on a slow rhythm |
| `NOD` | 5 | Slow pitch about the pivot, plus a yaw of `HEADYAW` times `aTurn`, so the head leads a turn |
| `SPIN` | 6 | Rotate about the pivot's vertical axis (swarm shards) |
| `STATIC` | 7 | No motion at all. Used for mounds |
| `FLUKE` | 8 | Pitch at the flap rate with a lag |
| `TENDON` | 9 | Stretch one tube from `aPivot` to `aAnchor`, in the frame of the instance. The part collapses on to its pivot when `aAnchor` is the zero vector, so an animal with no hold shows no cord |

### Carriages

A carriage moves the whole body. `rigConstants(G)` picks it from the locomotion and writes it as `#define` lines into the shader, with the gait constants.

| Carriage | Locomotions | Motion |
|---|---|---|
| `WALK` | biped, tripod, quad, hexapod | The body rises once over every footfall (`BOBN` times a cycle), rocks sideways once a cycle (`ROCK`), and rolls into a turn by `LEAN` times `aTurn` about the hip line (`ROLLY`). None of it reaches the legs, because their feet are on the ground. The activity scales the bob and the rock |
| `HOP` | monopod | A crouch on the ground for `CHARGE` of the throw, then a parabola of height `HOPH`. `HOPH` is `0.45 / gravity`, clamped to 0.15 to 0.9, and the hop rate is `hopGait(G)`, which grows with the square root of the gravity. The bellows leg stretches by `EXT` (a quarter of its length) at take-off, then the foot leaves the ground and the leg tucks under the body at the apex. It reads `aBurst` and not a clock of its own, so the crouch and the parabola always land on the ground the steering covers. A monopod at rest holds `aBurst` at 0 and stands still |
| `WAVE` | serpent | A lateral wave runs from the head to the tail. Its amplitude grows toward the tail, and the head end moves as one piece. `FRONT` and `LEN` give the body extents |
| `FLOAT` | sac, wings, fins | Slow vertical drift, plus a heave on each wing beat (`HEAVE`) and a tail wave for fins. The whole body also banks into a turn by `LEAN` times `aTurn`, wings and all |
| `ARCH` | arch | The loop rises and sinks in place |
| `RISE` | periscope, plough | The body sinks below the ground on a slow cycle. `SINK` sets how often |
| `ROLL` | roller | `aBurst` is the clock of the fold. The legs and the head fold to the hull over the charge, and the hull then drops `ROLLDROP` on to the ground and turns about the right axis of the animal by `aGait`. The recovery runs the same numbers backwards, so the unfold is the fold played in reverse. The hull is a body of revolution about that axis, so a ball that stops at any angle still stands right |
| `FLOW` | flow | A stack of rings on one pivot at the ground point. The charge scales them down in y and out in xz into a slick `FLOWW` widths across, `CHARGE` gathers them back to the blob, and the discharge scales them up into a column `FLOWH` tall, the top ring leading. The slick holds its `glow` at full, so the reader can find a bright slick in the grass |
| `SLING` | slinger | The charge hauls the body back along `-aim` by `SLINGB`, the discharge pitches it nose first along a ballistic arc of height `SLINGH`, which the gravity sets, and with no hold at all the body crawls low and slow. `RIG.TENDON` lays the cord from the nose to `aAnchor` |

### Shader

`faunaMaterial(G)` makes a `MeshStandardMaterial` with `onBeforeCompile`. The vertex shader gets the constants, the attributes, and `RIG_GLSL`. `customProgramCacheKey` returns the constants, so each species gets its own program.

The shader has two sets of clocks. `g`, `f`, and `s` include the part phase from `aRig.y`, and drive the part modes. `gb`, `fb`, and `sb` include only the instance phase, and drive the carriages. Use the body-wide clocks for anything that must move every part of one animal together. If a carriage used a part clock, the parts would drift apart.

The gait clock `gc` has two sources. A species with `LOCK` 1 reads `aGait`, which the steering advances by the ground the animal covers. Every other species reads `uTime * GAIT`, a fixed rate. `gaitLocked(G)` decides, and `LOCK` is one of the constants, so it belongs to the program key.

Uniforms and instance attributes:

- `uTime`: seconds, set every frame in `app.js` for all fauna materials.
- `aPhase` (per instance): a random offset so no two animals are in step.
- `aAnim` (per instance, dynamic, `vec4`): the four numbers the steering writes every frame, in the
  order `[aMove, aGait, aTurn, aBurst]`. The shader reads them back by name at the head of the rig
  block, so every line of `RIG_GLSL` still spells them `aMove`, `aGait`, `aTurn`, and `aBurst`.
  **They travel together because a creature program had run out of room.** The hardware promises 16
  attribute slots, `instanceMatrix` alone takes 4, and a locked species already used all 16.
  `aBurst` and `aAnchor` as two more attributes would have broken every locked species. A caller
  writes `at.aAnim.array[j * 4 + k] = v` and sets `at.aAnim.needsUpdate` once.
  - `aMove`: activity from 0 to 1. It is the amplitude of the leg swing. `moverActivity()` holds it at 0 until the animal really moves and reaches 1 at a third of the top speed, so a nearly still animal stands on straight legs. The walk bob and the rock scale with it too. Flyers keep 1.
  - `aGait`: the gait cycle in radians, for a `LOCK` species. `stepGait()` advances it; see below.
  - `aTurn`: how hard the animal turns, -1 to its right and 1 to its left. The body leans by it, the head yaws by it, and the inside legs shorten their stride by it. `turnLean()` writes it.
  - `aBurst`: the throw of an impulse animal, 0 to 1. 0 is at rest, the charge runs 0 to `CHARGE_END`, and the discharge runs from there to 1. Only the four impulse carriages read it, and a wander species leaves it at 0 for the life of the mesh. See "The impulse mover".
- `aAnchor` (per instance, dynamic, `vec3`): the point a tendon holds, in the frame of the instance. `RIG.TENDON` stretches its part from the part pivot to this point, and hides the part when the vector is zero. Only the slinger writes it.

### The gait clock

A leg that swings at a fixed rate while the body slides over the ground skids, and the fixed `GAIT`
rate did exactly that: the leg cycle and the speed of the animal had nothing to do with each other.
A quad of 4.5 m used to slide its planted foot 2.4 m every cycle. It now slides 4 cm.

The rate follows the ground. A foot holds the ground for `DUTY` of one cycle and sweeps back by
`sweep` while it does. To hold its place the sweep must equal the ground the body covers in that
time, so one cycle carries the body `sweep / DUTY`. That length is the stride:

| Term | Where | Meaning |
|---|---|---|
| `LEG_SWING` | `fauna.js` | The swing of one leg about the hip, in radians, per locomotion |
| `LEG_DUTY` | `fauna.js` | The part of one cycle a foot stays on the ground. A quad keeps 0.65, an insect 0.55 |
| `strideUnits(G, hipY)` | `fauna.js` | The stride in creature units: `2 * hipY * sin(swing) / duty` |
| `makeGait(G, scale, top, hipY)` | `fauna.js` | The clock of one animal. `scale` turns creature units into world units |
| `stepGait(gt, spd, act, dt)` | `fauna.js` | Advances the clock by `2 pi * spd / (stride * act)` times `dt` |

The hip height is the one number the builder alone knows: it starts from `G.legLen` and then lifts
the hip into the body hull. `buildCreature()` therefore writes the mean of its hips to
`geo.userData.hipY`, and every caller of `makeGait()` passes it. Without it the sweep comes out a
third short and the feet slide backwards.

The rate is capped at 2.5 times the rate at the top speed. As the animal stops, both `act` and the
speed fall to zero and the ratio of the two is what sets the rate, so the cap is what holds it
finite. The visible sweep there is under one percent of the full one, so no slide shows.

A serpent has no legs, but its wave carries it along the ground, so it takes the same clock with a
stride of half a body length. A roller has no swing at all, and one turn of its hull covers one
circumference, so `strideUnits()` gives it `2 pi` times the radius of the hull and the ball cannot
skid. A monopod keeps the fixed clock: its carriage reads `aBurst`, and the mover gives it all of
its ground while its foot is in the air and none while the foot is down.

**The clock reads the ground the animal really covered, and not the speed the wander asked for.**
For a wander species the two are one number. For an impulse animal they are not: it covers the
whole of its ground in one throw, so a ball driven by the wander speed would turn while it stood
still. `updateMovers()` in `app.js` and `Inspector.loop()` both measure the step instead. A step
the water branch took back gives no ground at all, which is right.

A coarse creature keeps `COARSE_SWING` of the swing and the same clock, so its feet slide by half.
That is deliberate: it only draws past the LOD distance, where a foot is under a pixel.

### Footfall order

The gait phase of a leg (`aRig.y`) is the footfall order. A leg touches down when its cycle wraps,
so a larger phase touches down earlier, and `footPhase()` takes the complement.

| Locomotion | Order |
|---|---|
| biped | The two legs half a cycle apart |
| tripod | The three legs a third of a cycle apart |
| quad | The lateral sequence: left hind, left fore, right hind, right fore, a quarter of a cycle apart. With a duty of 0.65 three feet always carry the body. The two-beat diagonal pair it ran before is a trot, and a trot at a walking speed reads as a hobble |
| hexapod | The alternating tripod: the front and the rear of one side with the middle of the other |

### Turning

A body cannot pivot on the spot and slide sideways out of the turn. Four rules hold a turn together:

- **The circle.** `turnRadius(G)` in `ground-fauna.js` gives the tightest circle the animal can
  walk, 1.3 body lengths, and three times that for a flyer. `turnCap()` turns it into a limit on the
  turn rate at the current speed, and `stepMover()` clamps the rate to it. A standing animal keeps
  an eighth of the cap, because an animal can shuffle round on the spot, slowly.
- **The wander.** The wander rates in `species.js` were set before a turn had a radius, and most of
  them ask a body to spin. `makeMover()` caps the wander at `WANDER_TURN` (0.55) of the cap at the
  cruise speed, so the animal keeps some turn in hand and the way home is what uses all of it.
- **The lean.** `turnLean()` measures the sideways pull of the turn, the speed times the turn rate,
  against the pull at the cruise speed on the tightest circle. A slow animal leans little and one at
  its limit leans all the way. `aTurn` carries it.
- **The stride.** The inside of the body covers less ground than the outside, so the inside legs
  take a stride shorter by `SKEW` times `aTurn`. `aPivot.x` gives the side: the local `+x` axis is
  the left of the animal, because the frame is right handed and the animal faces `+z`.

## Stage 4: steering and the inspector

### Steering (`fauna.js`, `app.js`)

`makeMover(rng, G.move)` makes a state per creature. `stepMover(st, t, dt)` moves it on the tangent plane of its home point:

- Two slow sine oscillators with random frequencies give the target turn rate. `mv.turnR` caps how much of it the animal uses; see "Turning" above.
- A leash pulls the animal home once it is past 50 percent of its range. The pull is capped near the species turn rate, or at what a fast animal needs to turn round inside its leash, and the sum of the wander and the pull is capped too. The way home is an arc, not a snap.
- The real turn rate eases toward the target with a time constant of half a second, so the heading has no kinks. The turn circle then clamps it, and `st.turnN` holds the lean the shader reads.
- The speed breathes on a third oscillator. Grazers stop on a fourth one. A monopod moves only while it is in the air (`hopBurst()`).

### The impulse mover (`fauna.js`)

An impulse animal stores energy and lets it go in one throw. It picks a heading while it charges
and it holds that heading through the whole discharge: **it never turns in flight.** The world is
what moves it, so the slope under it, the gravity, and whatever stands near it all shape the throw.

`G.move.mode` says which model carries a species: `'wander'` for the steady model above, `'impulse'`
for this one. The three callers — `app.js` for the globe, `ground-fauna.js` for the ground, and
`Inspector` for the card — read that one field and nothing else. `makeAnyMover(rng, G, mv, hooks)`
and `stepAny(st, t, dt)` pick the model, so no caller names a locomotion.

```js
export function makeImpulseMover(rng, mv, hooks = {});
//   hooks.slope(x, z, st)     -> { gx, gz }, the gradient of the ground, or absent on a tier with none
//   hooks.nearAnchor(x, z, r) -> { x, z } or null. Only the slinger reads it.
export function stepImpulse(st, t, dt);
export function impulseMove(G, mv);      // the move record the mover needs, from the genome
export function impulseBlocked(st);      // the caller met water or an edge: end the throw
```

The state carries every field of `makeMover()` (`u`, `v`, `heading`, `spd`, `turnN`, and the rest,
so `moverActivity()`, `turnCap()`, and `turnLean()` still read it) plus:

| Field | Meaning |
|---|---|
| `phase` | `'rest'`, `'charge'`, `'fly'`, or `'recover'` |
| `burst` | 0 to 1, what `aBurst` takes |
| `aim` | the heading, locked at the end of the charge and held through the flight |
| `range` | the ground this throw will cover, set at launch from the slope and the gravity |
| `owed` | the ground the cruise speed has asked for and no throw has yet given |
| `anchor` | `{ x, z }` or null, the slinger only, with `ax`, `ay`, `az` for `aAnchor` |
| `stagger` | seconds, once, so a herd does not fire as one body |

`stepMover()` runs in every phase, so the speed keeps breathing, the pause habit still stops the
animal, and the leash still knows where home is. It covers ground only where the rule of the
locomotion lets it, through `hold(st)`.

**The cruise speed holds because the mover keeps books.** Every frame it adds the ground the cruise
asked for to `owed`, and one throw pays the whole debt at once. A throw the terrain refuses banks
the debt instead, so the next throw that goes carries the ground this one did not. A monopod
therefore covers the ground it covered before the impulse mover existed, within 2 percent.

`IMPULSE` in `fauna.js` holds one row per impulse locomotion, and that row is the only place a
locomotion rule lives:

| Key | Meaning |
|---|---|
| `rest`, `recover` | parts of the throw cycle the animal spends waiting and settling |
| `fly` | stretches the discharge alone. `aBurst` still runs `CHARGE_END` to 1 over it, so the body reads the same and only the seconds change. A roller takes 5, because a ball that stops after a second reads as a ball that fell over. A row that stretches its discharge accepts a cap: every phase comes down together until one throw fits inside `LEASH_THROW` of the leash, so a long roll fills a ground leash of a hundred metres and stays short on a globe leash of a few seconds of travel. A row with no stretch is never capped, so the hop of a monopod keeps the rate `hopGait(G)` always gave it |
| `ready(st)` | may it charge now? The slinger asks for a plant here |
| `hold(st)` | the part of its speed it covers while it waits and charges. A crawl, or a run down a slope |
| `launch(st, owed)` | the ground the throw covers, or 0 to refuse it and pick a new heading |

`impulseCycle(G)` gives the seconds of one throw. A monopod takes `2 pi / hopGait(G)`, so its hop
rate is the rate it always had. A roller and a slinger take a cycle the gravity sets, as the hop
does. A flow takes five seconds: it needs a long charge to spread and run, and a long throw to
rise, stand as a column, and fall back.

A row may also carry `steer(st, dt)`, which runs while the animal waits and charges, and
`track(st, dt)`, which runs at the end of every step. The flow steers its charge down the fall
line with the first, because `stepMover()` carries the animal along `st.heading` and the wander is
what picks that heading. The slinger keeps its hold in the frame of the instance with the second.
A `launch()` may also write `st.aim`, and it then wins: the mover reads `st.aim` after the call.

**`nearAnchor`.** A locomotion that needs a real point of the world asks for one:

```js
nearAnchor(x, z, reach, st) -> { x, z, y? } | null
```

`x` and `z` are a plain point of the tier, in its own units, and the mover adds its own origin
(`st.ox`, `st.oz`) before it asks. Every tier tests its candidates with `anchorFits()`, so the
three agree on what counts as a hold: inside the reach, and inside `ANCHOR_ARC` of the heading the
body already faces. That arc is what keeps the leash, because the wander has already turned the
body toward home.

| Tier | Where the holds come from |
|---|---|
| Ground | `ground-fauna.js` buckets the `flora` array of the patch on a grid of 50 m. A plant under 1.2 m is ground cover and is left out; a landmark of issue 27 is an ordinary tall row |
| Globe | `app.js` reads `floraGrid`, which the worker builds once over the globe flora and returns with the world |
| Card | `Inspector` grows three or four stub posts on its disc from `flora-geometry.js`. Only a slinger gets them; every other species keeps a bare disc |

A tier may add a key of its own to the point it hands back. The ground adds `i`, the index of the
plant, so `GroundFauna` can hold a claim on it; see "Impulse herds". A caller reads only the keys
it knows.

### Impulse herds

An impulse group breaks the group model of the ground tier, because the whole point of these
bodies is that each one waits, charges, and throws on its own clock. A herd that went off as one
body would read as one animal drawn many times.

- **Every member of an impulse group carries its own mover.** The anchor of such a group keeps a
  plain wander mover, so the group still holds one range and still stops together. `g.mover.burst`
  and `g.mover.anchor` are therefore meaningless on an impulse group: `_stepMember()` reads them
  from `m.mover`.
- **The formation holds by the aim, not by the ease.** A member swings the heading of its own mover
  toward its slot while it waits and charges, harder the further out it stands, so the throw
  carries it home. The ease of the wander model could not do this work: the `rest` of a monopod has
  no length at all, and a roller covers no ground while it waits.
- **`MEMBER_RUSH` does not apply in `fly`**: the throw sets the speed. The ease runs in `rest` only,
  past a slack of the formation radius, and it is charged against `owed`, so a member that closes
  on its slot does not thereby travel further than its cruise speed allows. A member lands past or
  short of its slot and does not slide to it: over 21,879 throws the gap to the slot came out at a
  median of 26.9 m, and only twice under half a metre.
- **One plant carries one body.** Two slingers that stand close would otherwise hook the same
  plant. `GroundFauna.claims` maps a plant index to the mover that holds it, `nearAnchor` skips a
  plant another mover has claimed, and the claim goes when the throw ends. The map is site wide,
  because two slingers of two groups can stand as close as two of one group.
- Member movers draw from a stream of their own, `patchSeed + '|impulse-members'`, so the one
  generator that builds every group and every member keeps its exact order and a wander species
  lands on the same metre it landed on before.
- `lag`, the chain of a serpent and a plough, is untouched. Neither is an impulse species.

`anchorLocal()` turns a hold into `aAnchor`. The animal faces its own `+z` and its own `+x` is its
left, so the offset turns by the heading, and `st.hand` carries the sign: the `(u, v)` plane of the
globe and the `(x, z)` plane of the ground have opposite hands. `st.unit` is one creature unit in
the units of the tier, so the offset lands in the units the geometry is built in.

**The throw may run ahead of the cruise speed.** The plant says how long a slinger's throw is, not
the mover, so a throw can cover more ground than the cruise has yet asked for. The extra is
borrowed into `st.over`, every step pays back as much of it as the wander has banked, and the
animal may not charge again until the debt is clear. It crawls while it waits. That one rule is
what holds the mean speed on any density of plants: a stand far apart makes both the waits and the
throws long, and the mean of the two does not move.

**A caller must call `impulseBlocked(st)` wherever it refuses a step.** A flight holds one heading,
so an animal the caller pushed back out of the water would drive into the same water for the rest
of the throw. Both ground callers do this in their water and edge branch.

`updateMovers()` in `app.js` samples the height map under the new position, keeps walkers out of the sea, builds the instance matrix from the surface normal and the heading, and writes `aMove`, `aGait`, and `aTurn`. Far from the camera it steps every fourth frame. The turn circle of a globe creature is 1.5 times its scale, because a creature is about one unit long in its own frame.

### Inspector card (`fauna.js`)

`Inspector.show(G, palette, groundColor, seed)` builds the creature again as an `InstancedMesh` with one instance, so the same shader and the same `aMove`, `aGait`, and `aTurn` attributes apply. The card is where the reader watches the walk closest, so it takes the gait clock and the turn circle too, both in the units the card mover runs in: `fit / pathScale` turns creature units into them. It runs the same steering model with time sped up by 2.5 and the turn rate halved. The leash maps to `walkR` (3.0 units) of the ground disc (`groundR`, 3.6 units), and the position is clamped just inside the disc edge, so the animal walks long arcs over the whole disc. It draws a trail of the last 160 points and fills the card from `G.lore`. `cardHover(G)` lifts flyers off the ground disc.

## Ground tier

The globe scatters single animals over a whole world. The ground shows a few animals close up, so
it places them as groups. The group model has three parts: the worker rolls the groups, the app
scales each species to its lore size, and one mover carries the whole group.

### The group model

`patchFauna()` in `worker.js` fills two arrays of the patch result:

| Array | Floats per row | Fields |
|---|---|---|
| `groups` | 6 | anchor `x`, anchor `z`, `kind`, `count`, `spread`, `phase` |
| `members` | 4 | group index, offset `x`, offset `z`, `phase` |

The anchor is the point the group holds. It is never drawn. The offsets place the members of the
group around the anchor on a jittered ring inside `spread`, so no two animals stand in one place.

**Which species are present.** The species the site was pulled to is always present; the app sends
its id as `opts.pulledKind`, or -1. Any other species is present when its niche is on the patch.
`patchNiches()` samples the patch grid within 300 m of the site and runs the tests `makeFauna()`
runs on the globe, with the temperature and the moisture of the colour pass. A `sea` species and a
`cloud` flyer are not placed; issue 15 gives them their water and their cloud deck.

**How many.** Each patch holds 10 to 30 groups, round robin over the present species, and the total
member count stays under `opts.maxFauna` (300 on HIGH, 100 on LOW). An anchor starts within 600 m
of the site, so no group is born in the fog. Two anchors sit at least `spread * 2` apart. A land
anchor and a sub anchor stand on land above sea level.

Everything above comes from `makeRng(patchSeed + '|fauna')`, so one URL always gives one set of
groups.

### Scale in metres

`GroundFauna` builds each species with `buildCreature()` and measures the bounding box of the full
geometry. `Species.bodyMetres(G)` gives the number the lore states and the axis it measures: a
height measures along y, a length along z, because a creature faces +z in its own frame. The scale
makes that extent equal the number. A "4.5 m at the shoulder" quad is then 4.5 m tall against the
2 m terrain grid, and a "3.1 m long" hexapod is 3.1 m from nose to tail. The two levels of detail
below share that one scale, so a swap cannot change the size of an animal.

### Two levels of detail

A patch holds up to 300 animals, and a full creature is 100 to 980 triangles. Three hundred full
rigs would cost the graphics card more than the terrain does, and past 150 m an animal is about a
dozen pixels tall. So each species draws from two instanced meshes, as the flora does in
`ground-flora.js`: a near mesh of full creatures, and a far mesh of coarse ones.

`buildCreature(G, palette, flora, detail)` takes `'full'` or `'coarse'`. The coarse build keeps the
outline and every rig record, and it drops what the reader cannot resolve at that size:

- A ball is an octahedron of 8 triangles, not an icosahedron of 20 or a dodecahedron of 36. The
  octahedron shrinks by 0.8507 or by 0.9342, because neither of the other two solids has a vertex
  on an axis, so the coarse part reaches exactly as far as the part it replaces.
- A tube is a three-sided open cylinder. A cone is a three-sided open cone.
- A leg is one tapered bone from the hip to the foot, with no knee, no pad, and no bellows. The
  knee point sits on the hip, so the shader folds nothing and the whole leg pitches about the hip.
- The head keeps its ball and its nod. The beak, the mandibles, the stalks, the lure, the crest,
  the tusks, and the eyes go: each measures a fraction of a metre.
- A chain body is one tapered tube, not a string of balls. The two end joints reach out by the end
  radius, so the body holds the length of the full build.
- Of the extras only the sail and the plates stay, because only those two break the outline. The
  sail loses its ribs and the plates become one shell.
- A wing sheet takes one panel and loses its leading-edge bone. A swarm keeps its nine shards and
  loses their beads. A sky whale loses its gill beads and its belly glow.
- The leg swing runs at half the amplitude (`COARSE_SWING`), so a leg of a few pixels does not
  shimmer.

The coarse build is 16 to 70 triangles over every species the roll can make, against a target of
80. A biped spindle is 55, a quad dome 52, and a tripod blob 31.

The walk that places the animals also sorts them. An animal nearer to the camera than
`ground.lod.distance` goes to the near mesh, and an animal past it goes to the far mesh. A band of
10% around the distance holds an animal on the side it is on until it is clearly past the other
side, so an animal at the boundary cannot flicker. Both meshes take one material, so the graphics
card compiles one program and one `uTime` drives both. The far mesh casts no shadow: it holds no
real shape, and the sun casts only while the camera is under the LOD distance, where every animal
near the reader is a near mesh anyway.

### The flyer

A flyer needs four rules of its own. It hangs in an empty sky with no ground, no plant, and no herd
beside it, so nothing there tells the reader how large it is or how far away it stands. Added with
issue 17.

- **It keeps its full mesh 2.5 LOD distances out** (`AIR_LOD`). The coarse body drops the head
  parts and folds the legs to one bone each, which reads as a fault on the one animal the reader
  looks at up there. An air group holds one or two animals, so the triangles cost nothing.
- **It never draws narrower than 11 px** (`AIR_MIN_PX`). The walk measures the width of the body in
  pixels, and under that width it grows the animal until it reaches it, by 3 times at the most
  (`AIR_GROW`). The growth is smooth in the distance, so nothing pops, and it falls to 1 near by,
  where the ground and the plants are there to measure the animal against. A drifter of 1.9 m
  covers 9 px at 150 m on a 800 px frame; it covers 2.5 px at 500 m, and it draws at 7.6 px.
- **It breathes.** The height over the ground rises and falls 1.4 m on a clock of 0.06 turns per
  second, with a phase per group and per animal. A body that holds one height reads as a sprite
  pinned to the sky.
- **It lays a shadow on the ground.** See below.

**The shadow is the cue.** A reader who never looks up never finds a flyer, and the issue asks for
no new part of the interface. So the animal writes its own hint on the ground the reader is already
watching: a soft disc slides over the grass, and the head goes up. The shadow map cannot do this
work. It draws only while the camera is under the LOD distance, and a flyer at that range is a far
mesh that casts nothing.

The disc is one instanced mesh, one instance per air animal, and a fan of 4 rings in the xz plane.
The alpha of the vertex falls off over the rings, which is a soft edge for the price of 140
triangles. One float per instance carries the strength of the disc, so a flyer high up throws a
weak shadow and one over the treetops throws a hard one. It falls opposite the sun and reaches 2.6
heights of the flyer at the most, so a low sun cannot throw it out of sight. It reads the terrain
where it lands and not where the flyer flies, so it lies on the slope it falls on. It takes the
ground colour of the palette at a quarter of its lightness, because a black disc reads as a sticker
on any ground but grey rock, and it goes out with the sun: a night world shows none.

### Steering

`ground-fauna.js` gives each anchor one mover from `makeMover()`, in metres:

- Leash 60 to 200 m, from `G.move.leash`. An arch and a periscope keep a leash of 0, so they never
  travel.
- Speed 0.5 to 6 m/s, from `G.move.speed` times `MPS_PER_UNIT`.
- Turn rate `G.move.turn * TURN_GAIN`. The globe turns an animal about a leash of 0.03 units. The
  ground leash is thousands of times wider, so the turn rate comes down with it. Without this the
  animal would wind in tight circles instead of crossing its range.
- Turn circle `turnRadius(G)`, 1.3 body lengths in metres, and three times that for a flyer.

A walker turns away from the water and from the edge of the patch, as `updateMovers()` does on the
globe. Each member then eases toward its place in the formation, which turns with the anchor, and
adds a small wobble of its own. A serpent and a plough follow the anchor path from a ring buffer
with a lag per member, so the chain reads. A land animal and a sub animal stand on `heightAt` and
tilt to the normal of the terrain under their feet. A flyer holds its height above the ground under
it, 12 to 40 m, so it clears a hill.

**Every animal keeps its own speed, gait clock, and turn.** The anchor still holds the group
together, and the group still stops together, because every speed in the group comes from the one
anchor. But a member closing on its place in the formation, or drifting on its wobble, does not
travel at the speed of the anchor, and a leg that swings at the speed of the anchor slides. So
`_stepMember()` measures the ground each member covers, low passes it over `SPEED_EASE`, and reads
`aMove`, `aGait`, and `aTurn` from that one number.

Three limits keep those speeds honest:

- `MEMBER_RUSH` (1.35 of the cruise speed) caps the step of a member. The formation turns with the
  anchor, and a member out on the rim of a wide formation would be swung round at several times its
  cruise speed, faster than its legs could ever carry it. It falls behind instead, so the formation
  stretches through a turn and closes again after it.
- `WOBBLE_SPEED` (0.35 of the cruise speed) caps the wobble amplitude against its own frequency. A
  wide formation used to give a member a wobble that carried it sideways as fast as it walks.
- The wobble also fades out with the activity of the anchor, so a herd at rest stands still.

The turn of a member follows the same rules as the turn of a mover: it faces the way it travels, no
faster than `turnCap()` allows, and `turnLean()` gives the lean.

### Cost

Two `InstancedMesh` per species, near and far. `Ground.update()` calls `GroundFauna.update()`,
which walks the groups, then the members, and writes each member into the near mesh or the far one
in the same step, so no matrix is written twice. On a site with 299 creatures the walk costs about
0.10 ms, and about a third more on a site where every animal is an impulse animal, because each
one then carries a mover of its own instead of one per group. The gait clock, the measured speed, and the turn of each animal come out of the noise of
that measure: a site of 198 creatures costs 0.08 ms with them and 0.08 ms without them. At the 1,200 m ceiling all 299 are coarse, which takes 200,000 triangles out of the frame
and about 1 ms off the graphics card. `window.__mw.ground.fauna` holds the live state: `count`,
`nearCount`, `farCount`, `groups`, `members`, `kinds`, `claims`, and `stepMs`. A member of an
impulse group carries `mover`; a member of a wander group carries null. Each entry of `kinds` carries
`tris`, the triangle count of both builds, and the build logs the same numbers per species.

### The inspector on the ground

`GroundFauna.pickAt()` uses the measure `creatureAt()` uses on the globe: project the base of the
animal and a point one body up, then take the distance from the tap to that segment. The globe test
also drops an animal on the far side of the planet; on the ground the frustum does that. A tap
marks the animal: `pickHit()` returns the member, `markMember()` lays a ring on the ground under
it, and the app offers the card of the species on a floating button through the `onSelect`
callback of `Ground`. The arrows of the card call `Ground.focusKind()`, which marks the nearest
member of the next species and points the view at it, or leaves the view still when the patch
holds none of it.

## Checklist for changes

- Add a locomotion: add it to `LOCO`, `PLAN`, `HEAD`, `EXTRAS`, `MOVE`, and `NOUN`, `GENUS`, `ORIGIN` in `species.js`. Add its legs or body in `buildCreature()`, and a carriage in `rigConstants()` if it moves in a new way. Its `ORIGIN` pool needs at least one line with no gate, or a world will find it empty.
- Add a line of lore: put it in the pool it belongs to, gate it on the tags it needs, and run `node tools/lore-audit/audit.mjs --seeds 200`. If the line leans on a fact of the world, add the word to `LEXICON` in the audit tool as well, so the next line that uses it is checked too.
- Add a world fact: add the tag in `makeEnv()` in `lore.js`, the raw value in `world.env` in `worker.js`, and the axis to the grid in the audit tool.
- Add a legged locomotion: add it to `LEG_SWING`, `LEG_DUTY`, `BOB_BEATS`, and `ROCK_K` in `fauna.js`, and give its legs a footfall order in `legPlan()`. Without an entry in `LEG_SWING` the gait clock does not lock and the feet slide.
- Add an impulse locomotion: set `mode: 'impulse'` on its `MOVE` row, add its row to `IMPULSE`, its carriage to `IMPULSE_CARRY`, and its case to `impulseCycle()` in `fauna.js`, and write a carriage that reads `aBurst`. Push every constant the carriage needs on to the `rows` array in `rigConstants()`, so they sit in the program key. A niche or a world that must shut it out takes one row in `LOCO_GATE` in `species.js`. Change no caller: the three of them read `G.move.mode` and nothing else.
- Add a locomotion of any kind: add it to `LOCOS` and `CLASSES` in `tools/lore-audit/audit.mjs` as well. Without those two rows the sweep never asks its pools a question and never runs a relation rule that names it.
- Draw a number for one locomotion only: put the draw in a branch of its own in `rollGenome()`, and never as a row in one of the `{...}[loco]` tables there. Each of those tables is one object literal, so every entry in it draws from the generator for every species of every world, and one more row would move every animal of every seed.
- Change how far a leg swings, or how long its foot stays down: the gait clock reads both, so the stride and the rate follow on their own. Check the new stride against the body size before you keep it.
- Add a niche: add it to `NICHE` and `WORLD_NICHES` in `species.js`, and a test in `makeFauna()` in `worker.js`.
- Test the worker without a browser: run `node tools/lore-audit/audit.mjs --seeds 200 --show 8`. It loads `worker.js` in Node with a fake `self` and reports every finding with an example world.
- Test the geometry in Chrome: open the page, then call `__mw.inspect(k)` for each species index and look at the card.
