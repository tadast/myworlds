# My Worlds

A seed word gives a small planet: a globe to orbit, and a ground where a probe can land. This file holds the words the code and the docs use for the parts of that world.

## Language

### The world

**World type**:
One of the seven kinds of planet a seed can roll: terran, ocean, desert, ice, lava, gas, or exotic. The type sets the ranges that the other numbers of the world roll in. `world-types.js` holds those ranges.
_Avoid_: archetype, planet type, planet kind

**Sea level**:
The terrain value that leaves the land fraction of the world dry. The world call sets it from the globe, and the page passes it to the patch call, so the ground and the globe meet the sea at the same height.
_Avoid_: water line, ocean level

### The globe and the ground

**Cell grid**:
The map that divides the sphere into cells: six faces of a cube, each face cut into equal quads, with the gnomonic coordinate warped through a tangent. `cell-grid.js` holds the only copy, and the worker, the page, and the tools import it.
_Avoid_: band grid, lat/lon grid, tile grid

**Cell**:
One quad of the cell grid, named by a face and two indices. The reader picks a cell, and the whole cell becomes the ground of a landing.
_Avoid_: tile, square (the square is the marker that shows a cell on the globe)

**Patch**:
The ground of one landing at true scale: the terrain, the plants, the animals, the sea, and the rim of one cell.
_Avoid_: tile, chunk, ground patch

### The device

**Device tier**:
One of two rows of budgets, HIGH or LOW: the detail of the globe, the counts of plants and animals, the grid and the size of the patch, the shadows, and the ceiling of the LOD knob. `tiers.js` holds the two rows. The page picks one from the device, and the tools read the same rows.
_Avoid_: quality level, preset, Q (the name of the chosen row in app.js)

### Generation

**Generation**:
The seeded build of a world and of a patch. `generate.js` holds it, and it has two calls: the world call and the patch call. Each call depends only on its arguments. The worker and the Node tools are two adapters over it.
_Avoid_: worldgen, the worker (the worker is only the adapter that runs generation off the main thread)

**World call**:
`generate.world()`: the seed and the device options in, the globe, the species, the source, and the sea level out.
_Avoid_: generate message

**Patch call**:
`generate.patch()`: the seed, a site, the sea level, and the options in, one patch out.
_Avoid_: patch message
