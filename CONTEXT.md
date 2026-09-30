# My Worlds

A seed word gives a small planet: a globe to orbit, and a ground where a probe can land. This file holds the words the code and the docs use for the parts of that world.

## Language

### The world

**World type**:
One of the seven kinds of planet a seed can roll: terran, ocean, desert, ice, lava, gas, or exotic. The type sets the ranges that the other numbers of the world roll in. `world-types.js` holds those ranges.
_Avoid_: archetype, planet type, planet kind

**Sea level**:
The terrain value that leaves the land fraction of the world dry. The world call sets it from the vertices of the globe, so it follows the device tier. A patch reads the sea level of the world call with the same options, so the ground and the globe meet the sea at the same height.
_Avoid_: water line, ocean level

**Ruin**:
The second kind of source: the thing the makers built. A world with a wreck holds one ruin at most, `world.ruin`, with `kind: 'ruin'`. It stands 12 to 35 cells from the wreck on nearly every world. `docs/ruin.md` holds the rules.
_Avoid_: structure, relic, artefact, alien base

**Proto**:
One of the eight shapes a ruin can take, such as `spires` or `hive`. `ruin-types.js` holds them, and each world type allows three or four of them.
_Avoid_: model, type (a world has a type)

**Maker**:
The species that built the ruin: an ancestor of a species of this world that can build, or a rolled body of limbs and height when the world holds no such species. `world.ruin.maker` holds it.
_Avoid_: alien, builder

**Frequency**:
The band the ruin sends on, in MHz with three decimals, from 3.000 to 29.999. The log and the overlay print it as `7.316 MHz`; the code keeps it as `freq`, the string `'7.316'`.
_Avoid_: channel, signal

**Tuner**:
The field the reader types the frequency into: under the last entry of the card of the wreck, and under the Carrier row of the sidebar. A lock tunes the world, and the store keeps `tuned`. `tuner.js` holds it.
_Avoid_: dial, unlock

### The story

**Chapter**:
One step of the story of a world: a goal for the reader. A search is one kind of chapter. Later kinds can have no carrier. The chapters of a world come from the world itself, in a fixed order, and they open in that order: the first chapter is open at the start, and each later chapter opens when the chapter before it ends. A chapter is closed, open, or done, and a closed chapter cannot end. A chapter belongs to one world.
_Avoid_: phase (a phase is a set of issues), stage (a stage is a step of the brief), quest, step

**Search**:
A chapter whose goal is a source, which the reader finds with the carrier: fixes, wedges, briefs, and a find. An open search is silent until the receiver holds its band. The band of the wreck is held from the start, and the reader tunes to hold each later band. The receiver follows the newest search whose band it holds. A tap on the source of a closed search marks it, but no card opens and no find is recorded. See `docs/adr/0001-chapters-open-in-strict-order.md`.
_Avoid_: hunt, quest, chapter 1 or chapter 2 as the name of a kind

**Progress**:
The state of the chapters of one world for the reader: the state of each chapter, the fixes and the briefs of each search, and the bands the receiver holds. The carrier store keeps it by seed.
_Avoid_: record (the record is the shape on disk), save

### The globe and the ground

**Cell grid**:
The map that divides the sphere into cells: six faces of a cube, each face cut into equal quads, with the gnomonic coordinate warped through a tangent. `cell-grid.js` holds the only copy, and the worker, the page, and the tools import it.
_Avoid_: band grid, lat/lon grid, tile grid

**Cell**:
One quad of the cell grid, named by a face and two indices. The reader picks a cell, and the whole cell becomes the ground of a landing. Two cells are the same cell when the face and the two indices agree. `sameCell()` in `cell-grid.js` is the only test.
_Avoid_: tile, square (the square is the marker that shows a cell on the globe)

**Site**:
A lat and a lon in degrees, to two decimals, in the local frame of the planet. The URL keeps one, a fix keeps one, and the patch call takes one. The site of record is the middle of its cell, and two decimals cannot move it into the cell next door. Many sites fall in one cell, so a site never names a cell by its numbers.
_Avoid_: location, position

**Landing**:
One visit of the probe to a cell: the descent, the time on the ground, and the ascent. The probe stands in orbit, descending, on the ground, or ascending, and it lands on one cell at a time. A landing hears the carrier and takes a fix, and the fix waits for the end of the ascent. `probe.js` holds the state of a landing.
_Avoid_: dive (the dive is the motion of the camera and the cover at one switch), trip, visit

**Patch**:
The ground of one landing at true scale: the terrain, the plants, the animals, the sea, and the rim of one cell.
_Avoid_: tile, chunk, ground patch

**Keep-out**:
The discs of a patch where no plant grows and no animal walks: the phenomenon, the wreck, the ruin with its soft edge, and each part of the camp. The patch call masks them and carries them as `patch.keepOut`, and `patch-terrain.js` gives them to the ground.
_Avoid_: footprint, blocked area, exclusion zone

### The device

**Device tier**:
One of two rows of budgets, HIGH or LOW: the detail of the globe, the counts of plants and animals, the grid and the size of the patch, the shadows, and the ceiling of the LOD knob. `tiers.js` holds the two rows. The page picks one from the device, and the tools read the same rows.
_Avoid_: quality level, preset, Q (the name of the chosen row in app.js)

### Generation

**Generation**:
The seeded build of a world and of a patch. `generate.js` holds it, and it has two calls: the world call and the patch call. Each call depends only on its arguments. The worker and the Node tools are two adapters over it.
_Avoid_: worldgen, the worker (the worker is only the adapter that runs generation off the main thread)

**World call**:
`generate.world()`: the seed and the device options in, the globe, the species, the source, the ruin, and the sea level out.
_Avoid_: generate message

**Patch call**:
`generate.patch()`: the seed, a site, and the options in, one patch out. The call finds the cell of the site and builds that whole cell, so every site of one cell gives the same patch. From its world it reads the width of the cell and whether the cell holds the phenomenon or the source. The options are the options of the world call as `world`, and the ground row of a device tier; `patchOpts()` in `tiers.js` builds them.
_Avoid_: patch message
