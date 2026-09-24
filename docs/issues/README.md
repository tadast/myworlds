# Surface probe: issue set

This directory holds the work items for the surface probe. Read this file first. Then read `docs/probe.md` for the decisions, `docs/fauna.md` for the fauna pipeline, and `docs/flora.md` for the flora lore. Each issue file is self-contained enough for one agent to take it without the others.

## The project in one page

My Worlds is a static site: HTML, CSS, and JavaScript ES modules. No build step, no backend, no Node, no test framework. `vendor/` holds three.js and OrbitControls. Do not edit `vendor/`.

Run it with:

```sh
ruby -rwebrick -e 's=WEBrick::HTTPServer.new(:Port => 5555, :DocumentRoot => Dir.pwd).start'
```

Open `http://localhost:5555/#Auralis`. The hash is the world seed. `window.__mw` is the debug handle: `scene`, `camera`, `controls`, `renderer`, `current`, `generate`, `inspect`, `inspector`, `music`.

| File | Role |
|---|---|
| `generate.js` | Generation. Seed to hash, PRNG, simplex noise, icosphere, terrain, biomes, flora, fauna placement, clouds, height map, the source, and the patch. Two exported calls: `world(seed, opts, onProgress)` and `patch(seed, site, opts, onProgress)`. Each returns its result. No three.js and no DOM. Imports the lore files. |
| `cell-grid.js` | The cell grid, the map of the ground box and its inverse, and the frame of a site, as plain arrays. The one copy: `generate.js`, `site.js`, `ground-sky.js`, `carrier-globe.js`, and the tools import it. No three.js and no DOM. `tools/cell-grid-check.mjs` tests it. |
| `worker.js` | The module worker, a small adapter over `generate.js`. Protocol: `postMessage({type:'generate', seed, opts})` or `{type:'patch', seed, lat, lon, opts}`, replies `progress` then `done`, `patch-done`, or `error`. It transfers every buffer of a result. |
| `app.js` | Main thread. Renderer, scene, OrbitControls, `buildWorld()`, `frame()`, movers, worker client, `localStorage` store, sidebar, URL hash, inspector wiring. |
| `tiers.js` | The two device tiers, HIGH and LOW, and `RIM`. No three.js and no DOM. `app.js` picks a row into `Q`, and the Node tools read the same rows. |
| `species.js` | ES module. Rolls two to four genomes per world with lore. No three.js. |
| `flora-lore.js` | ES module. The plant vocabulary. Writes the lore of every plant kind of a patch. No three.js. See `docs/flora.md`. |
| `source-lore.js` | ES module. The vocabulary of the wreck. Writes the crew, the threads, and the 8 to 20 entries of `world.source.log`. Every world thread carries a salience and every fauna thread a way of moving. No three.js. See `docs/source.md`. |
| `fauna.js` | Creature geometry from a genome, rig shader, `makeMover`/`stepMover` steering, the inspector card. |
| `flora-card.js` | The plant preview on the study card: the subject centred, turning on its own axis. |
| `phenomena.js` | The one natural activity per world at globe scale. |
| `music.js` | Chip-tune per world, and the motif of the source. `motifOf()` gives the rhythm of that motif with no audio, `setCarrier()` sets its level, and `barClock()` gives the clock the lamp of the wreck blinks on. |
| `ground-source.js` | The source on the ground: the wreck of the older probe, its lamp, its mark, the tap that finds it, and the preview the log card turns. `wreckGeometry()` and `WRECK_HULL` also build the mini wreck of the globe. Issue 34. |
| `carrier-store.js` | The fixes of the search in `localStorage`, under `myworlds.carrier.v1`. `loadFixes()`, `addFix()`, `markFound()`, `markBriefed()`, `clearFixes()`, `foundSeeds()`. No three.js. Issue 34. |
| `carrier-globe.js` | The fixes on the globe: a wedge per fix, which the terrain shader and the ocean shader paint, a dot per fix, and the mini wreck a find stands at the source. One group under `current.planet` for the marks, and one set of uniforms for the paint. Issue 34. |
| `probe-hud.js` | The instrument of the probe over the ground: the air, the height, the hour of the star, the uplink, and the noise at the edge of the reach. Reads `Ground.telemetry()`. |
| `index.html`, `style.css` | The page and the sidebar. |

Conventions:

- Write prose, comments, commit messages, and docs in ASD-STE100 Simplified Technical English. Short sentences, active voice, one term per meaning.
- Branch names start with `tt/`. Commit inside this repository only.
- Keep `generate.js`, `worker.js`, `tiers.js`, and the four lore files free of three.js and of the DOM. A module worker has no import map, so a bare `three` import fails there, and the Node tools import these files with no browser.
- Flat-shaded vertex colours everywhere. No textures except baked impostor cards.
- Every issue updates `README.md` "How it works" and the relevant file in `docs/` when it changes behaviour a reader would notice.
- Every issue verifies the frame rate. See "Verification" below.

## Scale facts

Globe: radius 1 unit. Lore radius 3,200 to 9,800 km. Terrain relief 0.06 units. Terrain edge 0.0105 units. Flora 0.011 units. Fauna 0.012 to 0.02 units. Camera minimum `CAM_MIN = 1.11`, home 3.3, maximum 8.

Ground: the box is 3,000 units square on the wide tier and 1,500 on the narrow one. Since issue 19
one unit is not one metre: the reader picks a cell of the globe about 0.01 units of arc wide, about
74 km on a 7,352 km planet, and the whole cell draws into that box. Since issue 30 the cell is a
quad of a cube grid, `patch.cell` names it, and the box lands on the quad, so the cells tile the
globe and share their edges. `patch.metresAcross` and `patch.metresUp` give the two scales, and
`patch.span` gives the width of the cell in metres. `metresUp` is one number for the whole world,
so the highest land of the world stands 800 units up and a flat cell reads flat. A plant and a
creature keep their lore size in units, so they read as normal against the ground and they are no
longer the metres the lore says. A patch built with no `cell` keeps the tangent frame of the site,
and one built with no `span` keeps one unit to one metre. Since issue 18 the ground does not stop at the box: a coarse rim carries it out to 4,000 units from the site, past the fog. Fog starts at 450 m from the site and is solid at 750 m at ground level. Issue 06 opens the fog with the height of the camera, 1.15 m per metre up to 2,100 m, because a fog solid at 750 m paints one flat colour from the reveal and from the ceiling. `FOG_NEAR` keeps its value and still sets the 450 m limit on the pan. Since issue 20 the camera ceiling is 500 m and the reveal is 450 m up and 884 m south, so the detail of the patch never reads as a rectangle. Camera floor 2 m above the terrain. Since issue 17 the polar angle runs to 2.09 rad near the ground, which is 30 deg over the horizon, and the floor is a clamp on the position of the camera and no longer a cap on that angle. An up-view lifts the target into the sky and holds the eye on the floor.

Budgets:

| Tier | Grid step | Ground flora | Ground grass | Ground fauna | Shadows |
|---|---|---|---|---|---|
| HIGH | 2 m | 20,000 | ~8,800 over 78 units | 300 | yes |
| LOW | 4 m | 6,000 | ~2,000 over 50 units | 100 | no |

The grass of issue 21 is not part of the flora cap. It is a lattice that the camera carries; see
`GrassField` in `ground-flora.js`.

`LOW` is defined in `app.js` from pointer type, screen size, and core count. The two rows live in `tiers.js`, and `app.js` puts the row it picks in `Q`. `Q.ground` also holds `lodMax`.

## Shared contracts

Independent agents must agree on these. Do not change them inside an issue. If a contract must change, say so in the issue's summary and update this file in the same commit.

### The patch cell

- `CELL = 0.01` globe units of arc, in `cell-grid.js`. It is the nominal width of the square the reader
  picks and of the ground the probe brings back. It is the same size on the screen for every
  planet, about 62 px at `CAM_MIN`.
- Since issue 30 the cells are the quads of a cube grid: six faces of `FACE_CELLS` by `FACE_CELLS`,
  where `FACE_CELLS = round(PI / 2 / CELL)`, with the gnomonic coordinate warped through a tangent
  so a corner quad holds about the arc of a middle one: across its middle a cell spans 0.71 to 1.00 of
  `CELL`. The cells tile the whole globe, they share
  their edges exactly, and the grid holds no pole. A band of latitude carried the cells before, and
  its step of longitude changed at every band, so no two bands lined up.
- `siteCell(site)` gives that quad as `{face, i, j, n}`. `cellDir(cell, u, v)` gives the unit
  direction at `(u, v)` inside it; `u` and `v` run 0 to 1 and may run past the cell, which is what
  the rim needs. `app.js` passes the quad as `opts.cell` on the patch message. `cell-grid.js` holds the
  map as arrays, and `generate.js`, `site.js`, `ground-sky.js`, and `carrier-globe.js` import it;
  `site.js` is the adapter of the page and gives `THREE.Vector3`.
- `snapSite(site)` puts a site on the cell grid: it takes the middle of the quad the site falls in.
  It is idempotent and it keeps `kind`. The middle stands half a cell from every edge, so two
  decimals of a degree cannot move it into the cell next door.
- `cellSpan(world, site)` gives the width of that cell in metres. `app.js` passes it as `opts.span`
  on the patch message. The worker uses it for the scale it reports and not for the frequencies of
  the relief field; those come from the nominal cell, so two neighbours stay in phase.
- The box runs x along the u axis of the cell and z against the v axis, so (x, up, z) is a
  right-handed set and the terrain is the true image of the cell, not its mirror. East is the east
  of `groundBasis()`: the direction of falling lon. `boxTanX()` and `boxTanZ()` in `cell-grid.js` hold
  the map, and `boxPoint()` its inverse. Run `node tools/cell-grid-check.mjs` and
  `node tools/frame-check.mjs` after a change to the map, to `cellTwist()`, or to `groundBasis()`;
  both fail on a mirror.
- `cellTwist(site)` gives the turn from the frame of the site, x east and z south, to the axes of
  the box. The box runs along the axes of the cell, so `groundBasis()` takes the same turn and the
  sky stands in the right quarter.
- The pull to life runs before the snap and reaches half a cell, so a creature that lives in the
  cell claims the patch and the snap then puts the site back on the grid.
- Since issue 14 the phenomenon of the world pulls over the same reach, and it wins over a creature
  home: the world holds many homes and at most one phenomenon, and the pulled cell can still hold
  homes. The patch shows the phenomenon by the cell and not by the pull, so a landing that reaches
  the cell without the pull shows it too, and one phenomenon can never stand in two patches.
  `activitySite(world)` in `site.js` gives that cell, or null for a world with no phenomenon and for
  a kind the ground cannot draw yet.
- The marker is the square of the cell, not a symbol: what the square holds is what the ground
  shows. It is therefore only a few pixels wide from far out, and the reader zooms in to see it.
- Since issue 20 the marker shows only while the reader aims, and it follows the pointer.
- Each side of the square carries 8 steps, so the outline holds 32 outer and 32 inner vertices, and
  each one drapes on the ground under it plus a lift of 0.006 globe units. Four corners alone let a
  ridge inside the cell cut through the middle of a side, and a lift of 0.0008 let the facets of
  the globe rise through the outline in the mountains. See `LIFT` in `site.js` for the measurement.
- `showMarker()` gives a group of two meshes that share one geometry. The ghost pass draws first
  with `depthTest` off at opacity 0.25, so the outline still reads where a ridge stands in front of
  it, and the solid pass draws after it with `depthTest` on at opacity 0.9. The far side of the
  globe never shows the ghost, because `pickSite()` takes the near hit of the ray and the pull stays
  inside the cell, so the square always stands on the half of the globe that faces the camera.

### The rim

- The rim is the ground outside the box. It reaches `RIM = 4000` units from the site, which is set by
  the fog: at the ceiling the camera stands at most 1,420 units from the site and the fog is solid
  at `FOG_MAX` of 2,100 units, so a ray from the ceiling meets the ground 1,723 units out. The reader
  therefore never sees the outer edge of the rim.
- The worker builds it. A rim cell is 25 patch steps, 50 units on HIGH and 100 on LOW, and it
  divides the box, so the edge of the patch lands on a rim grid line and every rim node there sits
  on a patch vertex. `ground.js` copies the height and the colour of those nodes from the patch.
- The rim reads the globe field on its own grid, one sample per two rim cells. Since issue 30 it
  carries the first `DETAIL_RIM_OCT` octaves of the relief field, which is every wave a rim cell
  can hold, and none of the fine stack. The patch fades the rest out over the last two rim cells,
  so the two grids meet on one surface and the reader sees no line.
- The sea reaches 2,700 units from the camera target, which covers the fog and stays inside the
  rim. A patch with no water still gets a sea when the rim holds water.
- The rim carries no plant. Since issue 20 the patch thins its plants away over its last 300
  units, so the forest does not stop in a straight line at the edge of the box.

### The site and the URL

- A site is a lat and lon in degrees in the planet's local frame, the frame of the worker's `pos` arrays before `planet.rotation.y` is applied. Lat is `asin(y)`. Lon is `atan2(z, x)`. Both in degrees, two decimals. Lat in [-90, 90], lon in [-180, 180].
- URL format: `#Seed@lat,lon`, for example `#Auralis@12.50,-73.25`. Without `@` the URL means orbit. The seed part is URL-encoded as today; the site part is plain.
- Patch seed string: `` `${seed}|patch|${lat.toFixed(2)}|${lon.toFixed(2)}` ``. Pass it to `makeRng` and to a new `Noise` in the worker.
- Patch message options: `{ world, grid, size, span, rim, cell, maxFlora, maxFauna, pulledKind, activity, source }`. `patchOpts()` in `site.js` builds them for `app.js` and for the Node tools. `world` is the options of the world call; a patch reads the world that call builds, and `generate.js` builds it again when its cache holds another world, so a patch depends only on its arguments.
  `activity` is `{ kind }` when the landing cell holds the phenomenon of the world, else null. `source` is `{ kind }` when the landing cell holds the source of the world, else null; issue 34 added it and the rule is the cell and not the pull, as it is for `activity`. `size` is the box in units and `span` is the cell in metres. A patch with no `span` covers `size` metres, which is the behaviour before issue 19. `rim` is how far the ground outside the box must reach, in units; issue 18 added it and `tiers.js` exports the value as `RIM`.

### The gestures of the ground

Since issue 23 the ground and the globe hold two maps, because the reader turns a planet in one and
stands on a world in the other:

| | Globe | Ground |
|---|---|---|
| One finger, left button | spin the planet | grab the ground and move; hold still to walk |
| Two fingers, right button | pan | turn the view |
| Pinch, wheel | zoom | zoom |
| Keys | none | arrows and `W S` fly the way the view points, `A D` step aside, `Space` up, `Ctrl` down, `Shift` runs, side arrows and `Q E` turn, `R F` tilt, `+ -` zoom |

The walk and the pan both move the pair, the camera and its target, so the view direction and the
distance hold. Both stop at `FOG_NEAR`, and the walk tapers into that limit over its last 80 units.

### App mode

`app.js` holds one state: `mode` in `'orbit' | 'descending' | 'ground' | 'ascending'`. Orbit is today's behaviour. Issue 20 adds one flag inside orbit, `aiming`: the reader has pressed the button and the next tap on the planet sends the probe. The globe scene and `current` stay in memory in every mode. In `ground` mode the globe is not rendered and its `frame()` work is skipped.

### The ground module

`ground.js` is a new ES module on the main thread. It owns a second `THREE.Scene`, a second `PerspectiveCamera`, and a second `OrbitControls`, and it renders with the shared renderer. Shape:

```js
export class Ground {
  constructor({ renderer, canvas, world, site, tier });  // tier: { grid, maxFlora, maxFauna, shadows }
  load(result);       // the worker's patch-done result
  update(t, dt);      // steering, LOD, camera clamps
  render();           // renderer.render(this.scene, this.camera)
  heightAt(x, z);     // metres, bilinear on the grid, 0 outside
  dispose();
}
```

Ground frame: x east, y up, z south. Origin at the site at sea level, so `heightAt` is the elevation above sea level in metres. The sun direction comes from the app, not the worker: `load(result, { sunDir, view, carrier })`, because only the app knows `planet.rotation.y`. Until issue 12 lands, pass `(1, 0.55, 0.8)` normalised like the globe. `carrier` arrived with issue 34; see "The carrier" above.

### The patch protocol

Request: `postMessage({ type: 'patch', seed, lat, lon, opts: { grid, size: 1500, span, rim, maxFlora, maxFauna, pulledKind, activity, source } })`. `pulledKind` is the species id the site was pulled to, or `-1`. `activity` is `{ kind }` on the one cell that holds the phenomenon of the world, else null; the worker then raises the shape at the origin of the patch. Issue 14. `source` is `{ kind }` on the one cell that holds the source of the world, else null; the worker then picks a place for the wreck, flattens a disc of 14 units under it, scorches that disc, and keeps the plants, the grass, and the group anchors off it. Issue 34.

Replies: `progress` messages as today, then `{ type: 'patch-done', result }` or `{ type: 'error', message }`. Transfer the buffers.

`result`:

```js
{
  patch: {
    seed, lat, lon, size: 1500, grid, n,          // n = size / grid + 1 vertices per side
    patchSeed, radiusKm,                          // the patch seed string, and the planet radius in km
    biome, palette,                               // the globe palette object and the biome name at the site
    elevation,                                    // globe elevation at the site in metres above sea level
    seaLevel: 0, hasSea, shore,                   // hasSea: any grid vertex below 0; shore: true when hasSea and any vertex above 0
    rim: { out, step, n, hasSea },                // issue 18: the coarse grid outside the box. out and step in units
    activity,                                     // issue 14: the phenomenon at the origin, or null.
                                                  // volcano: { kind, radius, peak, crater }. geyser: { kind, radius, pool }. units
    source,                                       // issue 34: the wreck of the source, or null.
                                                  // { kind, x, y, z, yaw } in units of the box, yaw in radians
  },
  heights: Float32Array(n * n),                   // row-major, row = z from north (-) to south (+), col = x from west to east
  colors:  Float32Array(n * n * 3),               // per vertex, linear RGB 0..1
  flora:   Float32Array(count * 8),               // x y z, nx ny nz, scale, kind  (same as the globe layout, metres)
  groups:  Float32Array(groupCount * 6),          // x z, kind, count, spread, phase
  members: Float32Array(memberCount * 4),         // group index, offset x, offset z, phase
  rimHeights: Float32Array(rim.n * rim.n),        // issue 18: the rim, row-major as heights, in the same units
  rimColors:  Float32Array(rim.n * rim.n * 3),
}
```

Terrain colours use the globe rules for beach, snow line, and forest mask, evaluated at the site with the patch noise for local variation.

### The carrier

Issue 34. One thing on a world with a surface transmits, and the probe reads a bearing to it.

- The world: `world.source = { kind, dir: [x, y, z], log } | null`. `kind` is `'wreck'` now; later kinds take the same search. `dir` is a unit direction in the planet's local frame, snapped to the middle of its cell of the cube grid. A gas giant and a world where no vertex passed the tests both give null. `makeSource()` in `generate.js` rolls it from `makeRng(seed + '|source')`, and no other stream draws one number more; `tools/world-checksum.mjs` holds the proof.
- The log: `world.source.log = { probe, days, species, entries: [{ slot, title, day, text }, ...] }`. The four slots are `arrival`, `survey`, `trouble`, and `last`, in that order. `probe` is the name of the old probe, `days` is the day of the last entry, and `species` is the animal the survey names, or null. `source-lore.js` writes it in `generate()` from `makeRng(seed + '|source-lore')`. The page must not show the log before the reader finds the wreck. See `docs/source.md`.
- `site.js` gives `sourceSite(world)`, `sourceHere(world, site)`, `bearingTo(site, dir)`, `arcTo(site, dir)`, `carrierAt(world, site)`, `carrierDir(world, site, carrier)`, `carrierBox(world, site, carrier)`, and `boxPoint(site, dir, size)`. `carrierAt` returns `{ brg, err, arc, rangeKm }`: the bearing in degrees from north with east positive, its error in degrees, the arc in radians, and the kilometres to the source inside `CARRIER_RANGE` cells of arc, else null.
- **The carrier has a reach.** `CARRIER_REACH` in `site.js` is `2 * PI / 3`, a third of the circumference, and `carrierAt()` gives **null** for an arc past it. The landing then shows no carrier block, stores no fix, and draws no wedge, and a silent landing states a fact of its own. Every caller already tests for null. `freshFixes()` in `app.js` drops a stored fix the carrier no longer reaches, so a store from an older build needs no migration.
- The bearing is 2 degrees wrong at the source and 10 degrees wrong at the edge of the reach, straight in the arc. `CARRIER_ERR` in `site.js` holds the pair. The offset inside that band comes from a hash of the seed and the cell, so one cell always gives one fix and the true bearing always lies inside the wedge. `carrierAt()` is a pure function of the seed and the cell, so a stored fix takes its bearing and its error again on every load; see **The store**.
- **Two frames, two jobs.** The bearing of the globe uses the east of `groundBasis()` in `ground-sky.js`: `(sin lon, 0, -cos lon)`, the direction of falling lon, with north the part of `+y` in the tangent plane. The three digits and the wedge of a fix keep that bearing, because the wedge is drawn on the globe. The needle on the ground keeps the frame of the box instead, because the reader walks the terrain and the wreck of slice 3 stands on it. `patch()` in `generate.js` lays the box on the axes of the cell of the cube grid, x along u and z against v, which is a right-handed set as the frame of `groundBasis()` is. The box was the mirror of that frame until 2026-09-19; see "The box is right-handed" in `docs/probe.md`. The map of the box still holds no angle, so the needle comes from the slope of that map and not from the bearing less a twist.
- `boxPoint(site, dir, size)` is the exact inverse of the map `patch()` builds the box with. It gives `{ x, z }` in units of the box, or null for a direction more than 80 degrees from the face of the cell. Slice 3 takes the range in units from it. `carrierBox()` gives the needle as a unit `{ x, z }` in the same frame, from the slope of that map at the site, so it holds at every arc.
- `Ground.load(result, { sunDir, view, carrier })`. The app builds `carrier` from `carrierAt()` and adds `carrier.dir`, the `[x, z]` of `carrierBox()` **in the frame of the box**. `telemetry()` then returns `carrier: { brg, err, arc, rel, rangeKm, range } | null`. `rel` runs -180 to 180 degrees from the way the view points to the way the needle points, and a positive `rel` puts the needle to the right of the screen. Do not build `rel` from the digits less an azimuth: the box turns the sense of a bearing over. `range` is the units to the wreck on this patch, or null off its cell.
- On the cell of the source the needle and `range` stop reading the globe and read the wreck itself: `patch.source` gives its place in the units of the box, and both numbers are measured from the **camera position**, the point the height of the overlay is measured from. So the needle turns and the range falls as the reader walks. Off that cell nothing changes. Issue 34, slice 3.
- `new Ground({ ..., music, onSelectSource })`. `music` is the `Music` instance of the app; the lamp of the wreck blinks the rhythm of `motifOf(world)` on `music.barClock()`, or on the clock of the landing when no sound runs. `onSelectSource()` fires when a tap marks the wreck, and the app then offers "Read the log" on the floating button. The find itself is not a job of `Ground`: `inspectSource()` in `app.js` calls `onSourceFound()` the first time the card opens.

**The store.** The fixes live under a key of their own, `myworlds.carrier.v1`, and never under `myworlds.v1`. `persist()` drops its oldest worlds on a quota error, and a search must not go with them.

- The shape is one object keyed by seed: `{ "Auralis": { fixes: [{ lat, lon, brg, err }], found, briefed, ts } }`. The site of a fix is snapped to the cell grid on the way in, so one cell holds one fix and a second landing on it replaces the first.
- `briefed` says that the reader has opened the brief of the carrier on this world. The carrier block of the overlay pulses until then. A record written before the flag reads as not briefed, so the key does not move.
- `carrier-store.js` gives `loadFixes(seed)`, `addFix(seed, fix)`, `markFound(seed)`, `markBriefed(seed)`, `clearFixes(seed)`, and `foundSeeds()`. `loadFixes()` gives an empty record for an unknown seed, so no caller tests for null. `clearFixes()` drops the fixes and keeps the find and the brief. Every call of `localStorage` sits in try and catch, as `persist()` does.
- **A find drops the fixes.** `markFound()` empties `fixes`, and `addFix()` takes nothing on a found world. The search is over, the globe carries the mini wreck at the source, and a new wedge would only ask a question the reader has answered.
- The bounds are `MAX_FIXES = 4` per seed and `MAX_SEEDS = 200`. The oldest goes first in both, so a fifth landing on one world drops the oldest fix of that world. `MAX_FIXES` and `MAX_WEDGES` are one number: the globe paints every fix the store keeps.
- **A stored fix keeps its cell, and the globe computes its numbers again.** The store holds `brg` and `err` as the record of the landing, and `buildWorld()` in `app.js` passes every loaded fix through `carrierAt(world, site)` before it hands the record to `makeCarrierGroup()`. So a reader who holds fixes from an older build sees them narrow with no clear of the search, and a tune of `CARRIER_ERR` needs no migration and no key bump. `carrier-store.js` takes no three.js and no `site.js`, so the refresh stands in `app.js`.
- A shared URL carries no fix. A reader who opens a link starts the search with nothing.

**The wedge.** `carrier-globe.js` gives `makeCarrierGroup(world, record, heightMap)`, `addWedge(group, fix, { fade })`, `setFound(group, world, heightMap)`, `updateCarrierGroup(group, dt)`, `disposeCarrierGroup(group)`, `patchCarrierMaterial(material, group)`, `carrierUniforms()`, `wedgePlanes(fix)`, `wedgeEdges(planes, dir)`, `inWedge(planes, dir)`, `wedgeCoverage(planes, dir)`, `wedgeWash(n)`, and `WEDGE_AGE`.

- **A wedge is paint on the terrain and not a shape in the sky.** The terrain material and the ocean material of the world carry the wedges in their own fragment shader, so a wedge lies exactly on the ground it marks and it holds no parallax at any camera. `buildWorld()` in `app.js` calls `patchCarrierMaterial()` on both. The patch **extends** whatever `onBeforeCompile` the material already holds, it appends its own mark to `customProgramCacheKey()`, and it does nothing at all for a world with no group.
- A fragment takes its direction in the **local frame of the planet**, a varying of `normalize(position)` from the vertex shader, so the wedges turn with the world and need no matrix.
- A wedge in the uniforms is three unit vectors, a fade, and an age: the site `s`, the inward normals `nL` and `nR` of the two edge great circle planes, `uWedgeFade[i]`, and `uWedgeAge[i]`. `dot(d, nL) > 0` and `dot(d, nR) > 0` give the lune between the two planes, which runs from the site to the antipode of the site and no further. That is the half circle of decision 5 with no further rule. The rule holds while the error stands under 90 degrees, and `carrierAt()` states at most 10.
- `wedgePlanes(fix)` builds both the uniforms and the numbers of the check, and `wedgeEdges()` holds the arithmetic of the GLSL line for line.
- The cap is `MAX_WEDGES = 4`, the `MAX_FIXES` of the store. A world with more fixes paints the 4 newest; every fix still keeps its dot.
- **The wash shows the overlap.** Every wedge that covers a fragment adds to a count `n`, and the wash is `1 - pow(0.94, n * n)` of the way from the lit colour to the accent, plus 0.06 of the accent as an emissive share, so a wedge on the night side still reads. The square of the count makes the wash grow faster than the count: one wedge reads 0.06, two read 0.22, three read 0.43, and four read 0.63. So one wedge alone is almost only its two lines, and the ground two or more wedges cover stands out. `wedgeWash(n)` in `carrier-globe.js` is the same formula in JS, and the check tests it.
- **An older line is dimmer.** A line 0.45 degrees wide on each edge carries the shape of one wedge, at `WEDGE_AGE[k]` of 0.85 of the accent: 1, 0.75, 0.55, and 0.4 from the newest wedge to the oldest. The eye then starts at the last landing and works back. The wash does not age. A wedge that fades in counts as the newest one.
- The sea bed under the sea paints no wedge. Each edge takes a soft band of 0.15 degrees, so the edge does not crawl on the facets of the globe. The app draws no other mark of the cross.
- The group rides under `current.planet` and holds the marks. `depthTest` stays on, so the globe hides the part of a mark that runs over its far side. Every dot of a world merges into one mesh, whatever the number of fixes.
- A new fix fades in over 1.2 s through its own slot of the fade uniform, because the ascent ends over the site and the reader watches the wedge arrive.
- **A find takes the wedges and the dots away and stands a mini wreck at the source.** The model is the body of `wreckGeometry()` of `ground-source.js`, scaled to `WRECK_H` of 0.06 globe radii, standing on the terrain of the cell of the source, its up axis along the surface normal and its yaw from `world.source.yaw` or 0. It carries a `MeshStandardMaterial` in `WRECK_HULL`, the hull colour of the ground wreck, with a little emissive so it reads on the night side, and an additive lamp over the mast that blinks on the clock of `updateCarrierGroup()`. Neither mesh answers a ray, so a pick still names the cell under the model. `disposeCarrierGroup()` gives both geometries and both materials back.
- The dot of a fix and the foot of the mini wreck both **lie on the terrain**: each takes `max(groundRadius(world, heightMap, dir), world.seaRadius) + DRAPE_LIFT`, the rule `showMarker()` in `site.js` drapes the square of a cell with. The dot reaches 0.35 of a cell. So `makeCarrierGroup()` and `setFound()` both take the height map of the world.
- `tools/carrier-fix-check.mjs` holds the store, the wedge, the cap, the age, the wash, the fade, the drape, and the mini wreck. It builds every test direction with its own copy of the east of the globe and reads it back through `bearingTo()` of `site.js`, so a mirrored east in either file fails the run.

### Metres for a creature

The lore size text in `species.js` is the source of truth. Add `Species.bodyMetres(G)` that returns the leading number of `sizeText` and the axis it measures, `'height'` or `'length'`. On the ground a creature is scaled so its geometry extent along that axis equals that number.

Decision, 2026-09-08: a hexapod measures along `length`. Issue 08 item 2 lists `hexapod` under `axis: 'height'`, but `sizeText` writes "2.2 m long", and the first line of this section makes the lore text the source of truth. The geometry agrees: a hexapod has short legs, a wide body, and its six legs sit along the body, so it reads as a long low crawler. A scale to height would make a 2.2 m hexapod about 7 m long. `BODY.hexapod.axis` in `species.js` is now `'length'`. The number and every lore text stay the same, so the globe does not change.

### The sociality gene

`G.social = { kind: 'solitary' | 'pair' | 'herd', n: 1 | 2 | 4..14, spread: metres }`. `spread` is the formation radius. Rolled in `species.js`, deterministic per seed.

### LOD

`ground.lod = { distance: 150, min: 40, max: 400 }` in metres. Near instances are full mesh; far instances are cards for flora and coarse meshes for fauna. One controller in `Ground.update()` moves `distance` from frame time. Expose it as `window.__mw.ground`.

Changed by issue 13, 2026-09-09: `max` is a tier value, not a constant. The tier passes `lodMax`, which is 400 on HIGH and 250 on LOW, and `Ground` puts it in `lod.max`. `min` and the start of 150 do not change. The `localStorage` key of issue 11 now carries `lodMax` too, so a value that settled on HIGH cannot come back into a LOW session, and the constructor clamps whatever it reads.

## Verification

There is no test runner. Each issue verifies by hand in the served site and states the result in its summary. Use these checks:

- Frame time: open with `?perf` once issue 11 exists, or before that, run in the console:
  ```js
  let n=0,s=0,l=performance.now();(function f(){const t=performance.now();s+=t-l;l=t;if(++n===300){console.log('avg ms',(s/n).toFixed(2));return}requestAnimationFrame(f)})()
  ```
  Target: the average frame time at or below `1000 / min(60, refreshRate)`.
- Determinism: reload the same URL twice and confirm the same terrain, flora, and creatures.
- Two seeds at least: one terran and one desert or ice. Check `__mw.current.world.type`.

Three traps that make a good build look broken, or a bad one look good:

- **The worker caches its modules.** After a merge or an edit, a plain reload can still run the old code, because the worker and its imports come from the HTTP cache. A stale `worker.js` from before the module worker fails with "Module scripts don't support importScripts()". Force fresh sources first, then reload:
  ```js
  for (const f of ["worker.js","generate.js","lore.js","species.js","flora-lore.js","source-lore.js","app.js","fauna.js"]) await fetch("/"+f,{cache:"reload"}); location.reload();
  ```
- **A hidden tab stops `requestAnimationFrame`.** The frame-time snippet returns nothing, or a wrong number, when the tab is not in front. Confirm `document.visibilityState === "visible"` in the same run. On macOS, bring the tab to the front with:
  ```sh
  osascript -e 'tell application "Google Chrome" to activate' -e 'tell application "Google Chrome" to set active tab index of window 1 to N'
  ```
  A shell command steals the focus back, so start the measurement immediately after, and keep one run under 45 s.
- **Frame time is capped at the refresh rate.** A pass at 16.6 ms only proves the build holds 60 fps. It cannot show the headroom that is left. To compare two builds, serve the baseline on a second port and interleave the runs.

## Sequence and dependencies

```
01 globe-scale-fixes ─────────────────────────────────────────────┐
02 site-url-and-pull ──► 03 descent-and-ascent-shell ──► 04 patch-terrain ──► 05 ground-sea ──┐
                                        │                        ├──► 06 ground-camera ─────┤
                                        │                        ├──► 07 ground-flora-lod ──┤
                                        └──► 12 sky-continuity   │                          ├──► 11 adaptive-lod-and-perf ──► 13 low-tier-pass
08 sociality-gene ───────────────────────────────────────────────►├──► 09 ground-fauna-groups ──► 10 far-fauna-coarse-mesh ──┘
15 and 16 are phase two and need design first. 14 held its design session on 2026-09-12,
and its file records the decisions. 17 and 18 are defects found after the
phase one merge; they need no design and can run at any time.
```

Parallel lanes once 04 is merged: 05, 06, 07, 09 can run at the same time. 07 and 09 both add to `ground.js`; keep flora and fauna in separate files, `ground-flora.js` and `ground-fauna.js`, to avoid merge pain.

| # | Issue | Type | Blocked by | Status |
|---|---|---|---|---|
| 01 | Globe scale fixes | AFK | none | CLOSED 6d232a6 |
| 02 | Site in the URL and the pull to life | AFK | none | CLOSED 2e6ee86 |
| 03 | Descent and ascent shell | AFK | 02 | CLOSED 2ca24b1 |
| 04 | Patch terrain from the worker | AFK | 03 | CLOSED f61a39a |
| 05 | Ground sea and shoreline | AFK | 04 | CLOSED 5367a1b |
| 06 | Ground camera: pan, clamps, glide | AFK | 04 | CLOSED e2839d4 |
| 07 | Ground flora with card impostors | AFK | 04 | CLOSED 71cc6d5 |
| 08 | Sociality gene | AFK | none | CLOSED d223dee |
| 09 | Ground fauna in groups | AFK | 04, 08 | CLOSED 2818c38 |
| 10 | Far fauna coarse mesh | AFK | 09 | CLOSED be45f37 |
| 11 | Adaptive LOD and the perf overlay | AFK | 07, 10 | CLOSED 54563e6 |
| 12 | Sky continuity: sun, moons, rings, clouds | AFK | 03 | CLOSED acf2a18 |
| 13 | LOW tier pass | AFK | 05, 06, 11, 12 | CLOSED 4f861c1 |
| 14 | Ground-scale phenomena | AFK | 04 | CLOSED 6443729 |
| 15 | Sea species | HITL | 05, 09, design | open |
| 16 | Herd behaviour on the anchor | HITL | 09, design | open |
| 17 | The view cannot look up, so a flyer is never seen | AFK | 06, 09 | CLOSED 65a87bc |
| 18 | The rim smears the patch edge into streaks | AFK | 04, 05 | CLOSED 603aa99 |
| 19 | The patch cell and the square marker | AFK | 02, 04, 05 | CLOSED f2daf0d |
| 20 | The reader aims the probe, and the ground view holds no rectangle | AFK | 02, 06, 18, 19 | CLOSED ecf59db |
| 21 | Alien flora and ground cover | HITL | 07, 11 | CLOSED 0ba4007 |
| 22 | The flora signature of a world, and the card floor | HITL | 21 | CLOSED a151100 |
| 23 | The reader cannot move on the ground | AFK | 06 | CLOSED fc43719 |
| 24 | The lore of the plants | HITL | 07, 21, 22 | CLOSED 483db6b |
| 25 | The ground is penned in, so the reader walks a fifth of the patch | AFK | 20, 23 | CLOSED |
| 26 | The LOD knob rings, so the plants pop | AFK | 11, 25 | CLOSED |
| 27 | The flora of a wet world is one continuous thicket, and the ground holds no landmark | HITL | 21, 25, 26 | CLOSED |
| 28 | Impulse fauna: the roller, the flow, and the slinger | HITL, manager agent | 09, 10, 27 | CLOSED |
| 29 | The flow slides where it should be still, and its run reads as a walk | HITL | 28 | CLOSED |
| 30 | The ground reads flat on a peak and on a plain, and no two cells share an edge | AFK | 19, 25 | CLOSED |
| 31 | The probe carries no instrument, and the edge of its reach reads as a fault | AFK | 23, 25, 30 | CLOSED |
| 32 | The sky of a landing holds one hour for ever, and the moons fly across it | AFK | 12, 31 | CLOSED |
| 33 | Every world stands upright, and the light of a latitude never says otherwise | AFK | 32 | CLOSED |
| 34 | No cell is worth more than another, so the reader has no reason to pick a site | HITL | 14, 31, design | CLOSED |
