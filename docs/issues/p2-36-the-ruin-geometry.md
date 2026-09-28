# p2-36 The ruin has no body to draw

Status: CLOSED, 2026-09-28. Merge commit aa53ecf.

Type: AFK. Phase 2. Blocked by: p2-35, for `ruin-types.js` only. An agent may start from the
table in p2-00 and rebase when p2-35 lands. Read `docs/issues/p2-00-the-second-signal.md` first.

## The defect

p2-35 puts a ruin on the world and names its proto. Nothing can draw it. The ground of p2-41, the
card of p2-42, and the mini model on the globe all need one builder, the way `wreckGeometry()` in
`wreck-geometry.js` serves the wreck in all three places.

## What to build

**`ruin-geometry.js`**, on the pattern of `wreck-geometry.js`. It takes no DOM and does nothing at
import.

```js
ruinGeometry(proto, world, { mini = false } = {})
// → { body, glow, orbit, lamp }
//   body   BufferGeometry, non-indexed, a colour per vertex, flat-shaded, in its own frame:
//          y up, the origin on the ground under the middle of the ruin
//   glow   BufferGeometry of the parts that hold the light, the same frame, no vertex colour
//   orbit  BufferGeometry of the parts that move, or null. Only `floaters` has one
//   lamp   [x, y, z] of the brightest point, for the point light of HIGH and the lamp of the globe
```

- **The shapes are the prototypes.** Port the eight builders of `tools/ruin-prototypes.html` for the
  kept protos: `spires`, `dome`, `arches`, `well`, `floaters`, `colossus`, `ring`, and `hive`. The
  prototype places meshes in a group; the port welds the parts with `mergeParts()`, as the wreck
  does, and keeps the proportions, the heights, and the discs of the table in p2-00.
- **The hive is the colony.** The owner rejected the first hive as a mess of cells. The reworked
  prototype is the target: one great mound of equal hex cells in terraces of one step height, three
  small hives around it, paved paths of hex pavers between them, lit doors at the foot of each
  mound, and a crown on the great mound. One cell size and one step height everywhere, so it reads
  as built and not as grown.
- **The colossus takes the maker.** `world.ruin.maker.limbs` sets the count of limbs the statue
  lies on, and the pairs lie along the body as the prototype lays three. A maker of 0 limbs lies as
  a long body in coils. A maker of 1 limb lies on one thick leg. The raised hand stays, because it is
  the landmark from across the cell. `maker.height` does not scale the statue; it scales the doors
  of the `dome` and the `hive` and the steps of the `well`, so a big maker leaves big doors.
- **The stone.** A fixed colour pair per world type, the stone and the dark, and an accent, from
  the `PAL` table of the prototype. The stone does not take the colours of the biome: a ruin must
  read as a made thing on every world, as the hull of the wreck does. On a lava world the accent is
  a seam that takes the glow, as the prototype shows.
- **The light** is the glow geometry. p2-41 gives it one material that blinks the motif, and the
  lamp point carries the point light on HIGH.
- **The budget.** At most 4,000 triangles for the body of any proto, and 1,500 for the mini model.
  Drop every face that stands under the ground or inside a merged part, such as the bottom cap of a
  hex cell. The prototype of the hive takes 6,392, so the hive needs this work most.
- **The mini model**, with `mini: true`: the body only, with one colour, no glow parts that are
  smaller than a globe pixel, and no camp. The globe draws it at the ruin after the find, beside
  the mini wreck. Its height follows `WRECK_H` of `carrier-globe.js`, scaled by the ratio of the
  heights in the table, so the spires stand taller than the wreck and the colossus lower.
- **`well`** needs a hole in the ground. The body holds the shaft wall and the floor, and
  `userData.hole` gives the radius of the mouth. p2-41 opens the terrain; this issue only states
  the radius.

**`tools/ruin-lab.html`**, on the pattern of `tools/fauna-lab.html`, built on `ruin-geometry.js`
itself and not on a copy. It draws every proto on every world type of its fits, states the
triangles of the body and of the mini model, and shows a person of 1.8 units and the mast of the
wreck for scale. When the lab works, delete `tools/ruin-prototypes.html` and point p2-00 at the lab.

## Docs

- `docs/ruin.md`: a section on the body: the eight protos, what each one holds, where the light
  stands, the budget, and the rule of the stone.
- `docs/issues/README.md`: the module row of `ruin-geometry.js`.

## Acceptance criteria

- `tools/ruin-lab.html` draws the eight protos on each type they fit, with no error in the console.
- Every body is under 4,000 triangles, and every mini model under 1,500.
- The colossus lies on the limbs of its maker for 0, 2, 3, 4, and 6 limbs.
- The owner looks at the lab on the six types before p2-41 merges. This is the HITL check of p2-00.

## What the build changed

Built 2026-09-28. Every deviation from the plan above, and the reason:

- **The hive mound is a hexagon of rings, not a rounded dome.** The prototype gave each cell a
  height from a rounded profile, so every cell stood at its own height and the mound read as basalt
  columns, not as built terraces. The port lays a mound as rings of hex cells, and each ring stands
  one step, 5 units, over the ring outside it, so the terraces are level. The cell size stays 2.6.
  The great mound has five rings and stands 30 at the crown; each small hive has one ring. A few
  cells inside a mound fell one step, so it still reads as a ruin. The crown gained six stone
  prongs around the lit stone. The three small hives are all one ring, because a two-ring hive did
  not fit the disc of 55 beside the great mound.
- **On a lava world the accent parts join the glow geometry.** The prototype gave the lava accent a
  steady glow of its own. The contract has three geometries and one blinking material, so the
  seams blink with the light there. A fourth geometry for a steady seam is a choice for p2-41.
- **The lamp of the well stands at the mouth, 2 units up,** not on the floor 45 units down: a point
  light on the floor lights nothing the reader sees, and the lamp of the globe must stand over the
  model. The floor and the pylon caps are the glow. **The lamp of the colossus is the palm,** not
  the eye, because the hand is the landmark from across the cell.
- **The dome gained a door.** The prototype had none, and the plan asks the maker to size it. The
  door is a gap in the base ring with two jambs and an accent lintel, sized from `maker.height`.
- **The rubble stays inside the disc.** The prototype scattered the rubble of the spires to 26 and
  of the well to 36 units, past discs of 24 and 30. The port keeps every part inside the disc, and
  the check holds it there.
- **The steps of the well scale in pitch and depth with the rise,** so a big maker takes fewer and
  longer steps, not the same steps farther apart.
- **The mini keeps the core of the floaters as stone.** It is the shape of that proto. Every other
  glow part leaves the mini.
- **`mergeParts()` is not shared.** `ruin-geometry.js` has its own `weld()`, with a no-colour mode
  for the glow, and its own face-masked primitives, because the budget needs boxes with no bottom,
  beams with no ends, cones with no base, hex cells with no covered side, and a shaft that faces
  in. `wreck-geometry.js` is untouched.
- **The scale in the lab is the whole wreck, not the mast alone.** `wreckGeometry('tripod', { camp:
  false })` carries the mast of 18 units, and the body beside it shows the true size relation.
- **The mini scale.** `carrier-globe.js` holds the height of the mini wreck as `MODEL_H = 0.012`
  globe radii; there is no `WRECK_H` in the code. `WRECK_MODEL_H` in `ruin-geometry.js` copies
  0.012, with a comment, because an import of `carrier-globe.js` would be a cycle once the globe
  imports the ruin. One unit of a ruin is 0.012 / 18 globe radii on the globe.
- **p2-35 merged during the build.** The branch rebased on it, and `ruin-geometry.js` imports
  `RUIN_PROTOS` and `protoRow` from `ruin-types.js`. The local table of the plan was never committed.
- **The colossus stations.** Six limbs take the three stations of the prototype, four and three
  take two, two and one take one; the second station keeps the foot box of the prototype. A pair
  is one leg on the up side and one crushed under the body on the far side.
- **The check is a Node script,** `tools/ruin-geometry-check.mjs`, through `tools/three-hook.mjs`,
  so the budget runs with no browser. The lab states the counts too.

### The look of the manager, 2026-09-28

The HITL look of p2-00 went to the manager in place of the owner. The manager looked at the lab
through the shot-sink: the grid of all 20 pairs of a proto and a type it fits, the colossus on 0 and
6 limbs, the hive colony up close, and the mini hive. Every body stands on its disc, the hive reads as
built, and the stone reads as a made thing on every type. The look changed nothing. The terran hive
takes a green cap on its cells: that is the fixed moss accent of the terran row of `RUIN_PAL`, not
the colour of the biome.
