# Fauna generation: architecture and topology

This document describes how myworlds makes its creatures. Read it before you change `species.js`, `fauna.js`, the fauna parts of `worker.js`, or the fauna parts of `app.js`.

## Overview

The fauna pipeline has four stages. Each stage lives in one file.

| Stage | File | Runs in | Output |
|---|---|---|---|
| 1. Roll the species | `species.js` | Web Worker | `world.species`: an array of genomes with lore |
| 2. Place the creatures | `worker.js` | Web Worker | `fauna`: a `Float32Array`, 9 floats per creature |
| 3. Build and animate | `fauna.js` | Main thread | One `InstancedMesh` per species on the globe, two on the ground, one rig shader |
| 4. Steer and inspect | `app.js`, `fauna.js` | Main thread | Roaming on the height map, the inspector card |

The same seed always gives the same species, the same names, and the same placement. All randomness comes from the seeded `makeRng()` streams in the worker.

## Stage 1: genomes (`species.js`)

`species.js` is a classic script. The worker loads it with `importScripts('./species.js')`. It sets `self.Species = { makeSpeciesSet, NICHE }`. It does not use three.js. Keep it that way, so the worker stays free of rendering code.

`makeSpeciesSet(rng, type, world, P)` returns two to four genomes for one world. `P` is the raw palette from `makePalette()` in the worker.

### Niches

A niche is a place on the planet. Each niche lists which classes can live there, a ground word for the lore, place words for names, and a habitat text per class. The niches are:

- `beach`, `meadow`, `forest`, `lowland`, `dune`, `snow`, `ash`, `sea`, `cloud`.

`WORLD_NICHES` maps each world type to a niche list and a species count. The first two niches in the list always get a species. The rest are picked at random. The first species of a world with ground is always a land walker.

### Classes and locomotions

A class says where the animal lives. A locomotion says how its body moves.

| Class | Locomotions |
|---|---|
| `land` | `monopod`, `biped`, `tripod`, `quad`, `hexapod`, `serpent` |
| `air` | `sac`, `wings`, `fins` |
| `sub` | `arch`, `periscope`, `plough` |

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

`makeSpeciesSet()` rolls `social` in a second pass, after every species has its lore. Nothing before it moves in the random stream, so a seed keeps its names and its sizes.

`applySocial()` then writes the sociality into the lore. It adds one story sentence, and it sets the manner text from the habit and the sociality together, for example `Placid, herds of nine` or `Wary, solitary`. A species that is not a herd loses the `herd` habit sentence, because that sentence would contradict the gene.

### Lore

`makeLore()` assembles all text from the parts the animal has. Do not add a sentence that names a part unless the code checks that the part is present.

- **Name**: an optional place word from the niche, an adjective from `ADJ` keyed by one extra or the head, and a noun from `NOUN` keyed by the locomotion.
- **Latin**: a genus from `GENUS` keyed by the locomotion, and an epithet from `EPITHET` keyed by the same adjective. On a collision the niche epithet is used.
- **Diet**: from the head, then the niche. Plates always give a mineral diet. Sub-surface animals filter the ground.
- **Manner**: `habitKey()` derives it from the locomotion, the head, and the `move` values.
- **Story**: one origin sentence (locomotion), one feature sentence (a different part than the name adjective), one habit sentence (the manner), and, in 65 percent of cases, one closing sentence (the world type). `{ground}` and `{world}` are replaced in the text.

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
| `LEG` | 1 | Two bones. While the foot is in the air, the shin folds about the knee (`aPivot2`) by `weight` radians. Then the whole leg pitches about the hip (`aPivot`) by `amplitude` at the gait rate. Scaled by the activity |
| `WING` | 2 | Roll about the root at the flap rate. `weight` is the side sign times the span. The angle grows with the distance from the root, and the tip lags the root, so the sheet bends. When `GLIDE` is 0 the wing holds still on a slow cycle |
| `SWAY` | 3 | Lateral drift that grows with the distance from the pivot |
| `PULSE` | 4 | Scale about the pivot on a slow rhythm |
| `NOD` | 5 | Slow pitch about the pivot |
| `SPIN` | 6 | Rotate about the pivot's vertical axis (swarm shards) |
| `STATIC` | 7 | No motion at all. Used for mounds |
| `FLUKE` | 8 | Pitch at the flap rate with a lag |

### Carriages

A carriage moves the whole body. `rigConstants(G)` picks it from the locomotion and writes it as `#define` lines into the shader, with the gait constants.

| Carriage | Locomotions | Motion |
|---|---|---|
| `WALK` | biped, tripod, quad, hexapod | Body bob at the gait rate, not applied to legs. Scaled by the activity |
| `HOP` | monopod | A crouch on the ground for `HOPG` of the cycle, then a parabola of height `HOPH`. `HOPH` is `0.45 / gravity`, clamped to 0.15 to 0.9, and the hop rate is `hopGait(G)`, which grows with the square root of the gravity. The bellows leg stretches by `EXT` (a quarter of its length) at take-off, then the foot leaves the ground and the leg tucks under the body at the apex. Any movement gives a full hop. `hopBurst()` makes the mover cover ground only in the air, in step with the shader |
| `WAVE` | serpent | A lateral wave runs from the head to the tail. Its amplitude grows toward the tail, and the head end moves as one piece. `FRONT` and `LEN` give the body extents |
| `FLOAT` | sac, wings, fins | Slow vertical drift, plus a heave on each wing beat (`HEAVE`) and a tail wave for fins |
| `ARCH` | arch | The loop rises and sinks in place |
| `RISE` | periscope, plough | The body sinks below the ground on a slow cycle. `SINK` sets how often |

### Shader

`faunaMaterial(G)` makes a `MeshStandardMaterial` with `onBeforeCompile`. The vertex shader gets the constants, the attributes, and `RIG_GLSL`. `customProgramCacheKey` returns the constants, so each species gets its own program.

The shader has two sets of clocks. `g`, `f`, and `s` include the part phase from `aRig.y`, and drive the part modes. `gb`, `fb`, and `sb` include only the instance phase, and drive the carriages. Use the body-wide clocks for anything that must move every part of one animal together. If a carriage used a part clock, the parts would drift apart.

Uniforms and instance attributes:

- `uTime`: seconds, set every frame in `app.js` for all fauna materials.
- `aPhase` (per instance): a random offset so no two animals are in step.
- `aMove` (per instance, dynamic): activity from 0 to 1. Legs and the walk bob scale with it. `updateMovers()` writes it from the steering speed. Flyers keep 1.

## Stage 4: steering and the inspector

### Steering (`fauna.js`, `app.js`)

`makeMover(rng, G.move)` makes a state per creature. `stepMover(st, t, dt)` moves it on the tangent plane of its home point:

- Two slow sine oscillators with random frequencies give the target turn rate.
- A leash pulls the animal home once it is past 50 percent of its range. The pull is capped near the species turn rate, or at what a fast animal needs to turn round inside its leash, and the sum of the wander and the pull is capped too. The way home is an arc, not a snap.
- The real turn rate eases toward the target with a time constant of half a second, so the heading has no kinks.
- The speed breathes on a third oscillator. Grazers stop on a fourth one. A monopod moves only while it is in the air (`hopBurst()`).

`updateMovers()` in `app.js` samples the height map under the new position, keeps walkers out of the sea, builds the instance matrix from the surface normal and the heading, and writes `aMove`. Far from the camera it steps every fourth frame.

### Inspector card (`fauna.js`)

`Inspector.show(G, palette, groundColor, seed)` builds the creature again as an `InstancedMesh` with one instance, so the same shader and the same `aMove` attribute apply. It runs the same steering model with time sped up by 2.5 and the turn rate halved. The leash maps to `walkR` (3.0 units) of the ground disc (`groundR`, 3.6 units), and the position is clamped just inside the disc edge, so the animal walks long arcs over the whole disc. It draws a trail of the last 160 points and fills the card from `G.lore`. `cardHover(G)` lifts flyers off the ground disc.

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

### Steering

`ground-fauna.js` gives each anchor one mover from `makeMover()`, in metres:

- Leash 60 to 200 m, from `G.move.leash`. An arch and a periscope keep a leash of 0, so they never
  travel.
- Speed 0.5 to 6 m/s, from `G.move.speed` times `MPS_PER_UNIT`.
- Turn rate `G.move.turn * TURN_GAIN`. The globe turns an animal about a leash of 0.03 units. The
  ground leash is thousands of times wider, so the turn rate comes down with it. Without this the
  animal would wind in tight circles instead of crossing its range.

A walker turns away from the water and from the edge of the patch, as `updateMovers()` does on the
globe. Each member then eases toward its place in the formation, which turns with the anchor, and
adds a small wobble of its own. A serpent and a plough follow the anchor path from a ring buffer
with a lag per member, so the chain reads. A land animal and a sub animal stand on `heightAt` and
tilt to the normal of the terrain under their feet. A flyer holds its height above the ground under
it, 12 to 40 m, so it clears a hill.

The activity uniform `aMove` comes from the anchor, so a whole herd stops and starts together.

### Cost

Two `InstancedMesh` per species, near and far. `Ground.update()` calls `GroundFauna.update()`,
which walks the groups, then the members, and writes each member into the near mesh or the far one
in the same step, so no matrix is written twice. On a site with 299 creatures the walk costs about
0.10 ms. At the 1,200 m ceiling all 299 are coarse, which takes 200,000 triangles out of the frame
and about 1 ms off the graphics card. `window.__mw.ground.fauna` holds the live state: `count`,
`nearCount`, `farCount`, `groups`, `members`, `kinds`, and `stepMs`. Each entry of `kinds` carries
`tris`, the triangle count of both builds, and the build logs the same numbers per species.

### The inspector on the ground

`GroundFauna.pickAt()` uses the measure `creatureAt()` uses on the globe: project the base of the
animal and a point one body up, then take the distance from the tap to that segment. The globe test
also drops an animal on the far side of the planet; on the ground the frustum does that. A tap
opens the card of the species through the `onInspect` callback of `Ground`.

## Checklist for changes

- Add a locomotion: add it to `LOCO`, `PLAN`, `HEAD`, `EXTRAS`, `MOVE`, and `NOUN`, `GENUS`, `ORIGIN` in `species.js`. Add its legs or body in `buildCreature()`, and a carriage in `rigConstants()` if it moves in a new way.
- Add a niche: add it to `NICHE` and `WORLD_NICHES` in `species.js`, and a test in `makeFauna()` in `worker.js`.
- Test the worker without a browser: run `worker.js` in Node with a fake `self` that has `postMessage` and `importScripts`. Print `world.species` for several seeds and read the lore for sentences that contradict the parts.
- Test the geometry in Chrome: open the page, then call `__mw.inspect(k)` for each species index and look at the card.
