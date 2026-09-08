# Fauna generation: architecture and topology

This document describes how myworlds makes its creatures. Read it before you change `species.js`, `fauna.js`, the fauna parts of `worker.js`, or the fauna parts of `app.js`.

## Overview

The fauna pipeline has four stages. Each stage lives in one file.

| Stage | File | Runs in | Output |
|---|---|---|---|
| 1. Roll the species | `species.js` | Web Worker | `world.species`: an array of genomes with lore |
| 2. Place the creatures | `worker.js` | Web Worker | `fauna`: a `Float32Array`, 9 floats per creature |
| 3. Build and animate | `fauna.js` | Main thread | One `InstancedMesh` per species, one rig shader |
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
| `density`, `fsign`, `fcut` | Placement rules (see stage 2) |
| `gravity` | The world gravity in g. `makeStats()` in the worker writes it on every species after the roll |
| `colors` | `{ body, body2, accent, glow }` as hex strings |
| `lore` | `{ name, latin, habitat, size, diet, temperament, story, plural }` |

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

A creature is built in its own units. The base is at `y = 0`. `+y` is up. The animal faces `+z`. `BASE_SCALE` (0.011) times the creature scale converts to world units.

### `buildCreature(G, palette, flora)`

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

## Checklist for changes

- Add a locomotion: add it to `LOCO`, `PLAN`, `HEAD`, `EXTRAS`, `MOVE`, and `NOUN`, `GENUS`, `ORIGIN` in `species.js`. Add its legs or body in `buildCreature()`, and a carriage in `rigConstants()` if it moves in a new way.
- Add a niche: add it to `NICHE` and `WORLD_NICHES` in `species.js`, and a test in `makeFauna()` in `worker.js`.
- Test the worker without a browser: run `worker.js` in Node with a fake `self` that has `postMessage` and `importScripts`. Print `world.species` for several seeds and read the lore for sentences that contradict the parts.
- Test the geometry in Chrome: open the page, then call `__mw.inspect(k)` for each species index and look at the card.
