# Surface probe: issue set

This directory holds the work items for the surface probe. Read this file first. Then read `docs/probe.md` for the decisions and `docs/fauna.md` for the fauna pipeline. Each issue file is self-contained enough for one agent to take it without the others.

## The project in one page

My Worlds is a static site: HTML, CSS, and JavaScript ES modules. No build step, no backend, no Node, no test framework. `vendor/` holds three.js and OrbitControls. Do not edit `vendor/`.

Run it with:

```sh
ruby -rwebrick -e 's=WEBrick::HTTPServer.new(:Port => 5555, :DocumentRoot => Dir.pwd).start'
```

Open `http://localhost:5555/#Auralis`. The hash is the world seed. `window.__mw` is the debug handle: `scene`, `camera`, `controls`, `renderer`, `current`, `generate`, `inspect`, `inspector`, `music`.

| File | Role |
|---|---|
| `worker.js` | Web Worker. Seed to hash, PRNG, simplex noise, icosphere, terrain, biomes, flora, fauna placement, clouds, height map. Loads `species.js` with `importScripts`. Protocol: `postMessage({type:'generate', seed, opts})`, replies `progress` then `done` or `error`. |
| `app.js` | Main thread. Renderer, scene, OrbitControls, `buildWorld()`, `frame()`, movers, worker client, `localStorage` store, sidebar, URL hash, inspector wiring. |
| `species.js` | Classic script. Rolls two to four genomes per world with lore. No three.js. |
| `fauna.js` | Creature geometry from a genome, rig shader, `makeMover`/`stepMover` steering, the inspector card. |
| `phenomena.js` | The one natural activity per world at globe scale. |
| `music.js` | Chip-tune per world. Not touched by this issue set. |
| `index.html`, `style.css` | The page and the sidebar. |

Conventions:

- Write prose, comments, commit messages, and docs in ASD-STE100 Simplified Technical English. Short sentences, active voice, one term per meaning.
- Branch names start with `tt/`. Commit inside this repository only.
- Keep the worker free of three.js. Keep `species.js` free of three.js.
- Flat-shaded vertex colours everywhere. No textures except baked impostor cards.
- Every issue updates `README.md` "How it works" and the relevant file in `docs/` when it changes behaviour a reader would notice.
- Every issue verifies the frame rate. See "Verification" below.

## Scale facts

Globe: radius 1 unit. Lore radius 3,200 to 9,800 km. Terrain relief 0.06 units. Terrain edge 0.0105 units. Flora 0.011 units. Fauna 0.012 to 0.02 units. Camera minimum `CAM_MIN = 1.11`, home 3.3, maximum 8.

Ground: the box is 1,500 units square. Since issue 19 one unit is not one metre: the reader picks
a cell of the globe 0.01 units of arc wide, about 74 km on a 7,352 km planet, and the whole cell
draws into that box. `patch.metresAcross` and `patch.metresUp` give the two scales, and
`patch.span` gives the width of the cell in metres. A plant and a creature keep their lore size
in units, so they read as normal against the ground and they are no longer the metres the lore
says. A patch built with no `span` keeps one unit to one metre. Since issue 18 the ground does not stop at the box: a coarse rim carries it out to 3,150 units from the site, past the fog. Fog starts at 450 m from the site and is solid at 750 m at ground level. Issue 06 opens the fog with the height of the camera, 1.15 m per metre up to 2,100 m, because a fog solid at 750 m paints one flat colour from the reveal and from the ceiling. `FOG_NEAR` keeps its value and still sets the 450 m limit on the pan. Since issue 20 the camera ceiling is 500 m and the reveal is 450 m up and 884 m south, so the detail of the patch never reads as a rectangle. Camera floor 2 m above the terrain. Since issue 17 the polar angle runs to 2.09 rad near the ground, which is 30 deg over the horizon, and the floor is a clamp on the position of the camera and no longer a cap on that angle. An up-view lifts the target into the sky and holds the eye on the floor.

Budgets:

| Tier | Grid step | Ground flora | Ground grass | Ground fauna | Shadows |
|---|---|---|---|---|---|
| HIGH | 2 m | 20,000 | ~8,800 over 78 units | 300 | yes |
| LOW | 4 m | 6,000 | ~2,000 over 50 units | 100 | no |

The grass of issue 21 is not part of the flora cap. It is a lattice that the camera carries; see
`GrassField` in `ground-flora.js`.

`LOW` is already defined in `app.js` from pointer type, screen size, and core count. Since issue 13 the whole row lives in one object, `Q.ground` in `app.js`, which also holds `lodMax`.

## Shared contracts

Independent agents must agree on these. Do not change them inside an issue. If a contract must change, say so in the issue's summary and update this file in the same commit.

### The patch cell

- `CELL = 0.01` globe units of arc, in `site.js`. It is the width of the square the reader picks
  and the width of the ground the probe brings back. It is the same size on the screen for every
  planet, about 62 px at `CAM_MIN`.
- `snapSite(site)` puts a site on the cell grid: latitude to steps of `CELL`, and longitude to a
  step that keeps the cell square in metres. It is idempotent and it keeps `kind`.
- `cellSpan(world)` gives the width of the cell in metres. `app.js` passes it as `opts.span` on
  the patch message.
- The pull to life runs before the snap and reaches half a cell, so a creature that lives in the
  cell claims the patch and the snap then puts the site back on the grid.
- The marker is the square of the cell, not a symbol: what the square holds is what the ground
  shows. It is therefore only a few pixels wide from far out, and the reader zooms in to see it.
- Since issue 20 the marker shows only while the reader aims, and it follows the pointer.

### The rim

- The rim is the ground outside the box. It reaches `RIM = 3150` units from the site, which is set by
  the fog: at the ceiling the camera stands at most 1,420 units from the site and the fog is solid
  at `FOG_MAX` of 2,100 units, so a ray from the ceiling meets the ground 1,723 units out. The reader
  therefore never sees the outer edge of the rim.
- The worker builds it. A rim cell is 25 patch steps, 50 units on HIGH and 100 on LOW, and it
  divides the box, so the edge of the patch lands on a rim grid line and every rim node there sits
  on a patch vertex. `ground.js` copies the height and the colour of those nodes from the patch.
- The rim reads the globe field on its own grid, one sample per two rim cells. It carries the
  hills of the patch but not the knolls and the rock, which are shorter than one rim cell. The
  patch fades its knolls and its rock out over the last two rim cells, so the two grids meet on
  one surface and the reader sees no line.
- The sea reaches 2,700 units from the camera target, which covers the fog and stays inside the
  rim. A patch with no water still gets a sea when the rim holds water.
- The rim carries no plant. Since issue 20 the patch thins its plants away over its last 300
  units, so the forest does not stop in a straight line at the edge of the box.

### The site and the URL

- A site is a lat and lon in degrees in the planet's local frame, the frame of the worker's `pos` arrays before `planet.rotation.y` is applied. Lat is `asin(y)`. Lon is `atan2(z, x)`. Both in degrees, two decimals. Lat in [-90, 90], lon in [-180, 180].
- URL format: `#Seed@lat,lon`, for example `#Auralis@12.50,-73.25`. Without `@` the URL means orbit. The seed part is URL-encoded as today; the site part is plain.
- Patch seed string: `` `${seed}|patch|${lat.toFixed(2)}|${lon.toFixed(2)}` ``. Pass it to `makeRng` and to a new `Noise` in the worker.
- Patch message options: `{ grid, size, span, rim, maxFlora, maxFauna, pulledKind }`. `size` is the box in units and `span` is the cell in metres. A patch with no `span` covers `size` metres, which is the behaviour before issue 19. `rim` is how far the ground outside the box must reach, in units; issue 18 added it and `ground.js` exports the value as `RIM`.

### The gestures of the ground

Since issue 23 the ground and the globe hold two maps, because the reader turns a planet in one and
stands on a world in the other:

| | Globe | Ground |
|---|---|---|
| One finger, left button | spin the planet | grab the ground and move; hold still to walk |
| Two fingers, right button | pan | turn the view |
| Pinch, wheel | zoom | zoom |
| Keys | none | `W A S D` and arrows walk, `Shift` runs, `Q E` turn, `R F` tilt, `+ -` zoom |

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

Ground frame: x east, y up, z south. Origin at the site at sea level, so `heightAt` is the elevation above sea level in metres. The sun direction comes from the app, not the worker: `load(result, { sunDir })`, because only the app knows `planet.rotation.y`. Until issue 12 lands, pass `(1, 0.55, 0.8)` normalised like the globe.

### The patch protocol

Request: `postMessage({ type: 'patch', seed, lat, lon, opts: { grid, size: 1500, span, rim, maxFlora, maxFauna, pulledKind } })`. `pulledKind` is the species id the site was pulled to, or `-1`.

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

- **The worker caches `species.js`.** After a merge or an edit, a plain reload can still run the old code, because the worker keeps its `importScripts` copy. Force fresh sources first, then reload:
  ```js
  for (const f of ["species.js","app.js","worker.js","fauna.js"]) await fetch("/"+f,{cache:"reload"}); location.reload();
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
14, 15, 16 are phase two and need design first. 17 and 18 are defects found after the
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
| 14 | Ground-scale phenomena | HITL | 04, design | open |
| 15 | Sea species | HITL | 05, 09, design | open |
| 16 | Herd behaviour on the anchor | HITL | 09, design | open |
| 17 | The view cannot look up, so a flyer is never seen | AFK | 06, 09 | CLOSED 65a87bc |
| 18 | The rim smears the patch edge into streaks | AFK | 04, 05 | CLOSED 603aa99 |
| 19 | The patch cell and the square marker | AFK | 02, 04, 05 | CLOSED f2daf0d |
| 20 | The reader aims the probe, and the ground view holds no rectangle | AFK | 02, 06, 18, 19 | CLOSED ecf59db |
| 21 | Alien flora and ground cover | HITL | 07, 11 | CLOSED 0ba4007 |
| 22 | The flora signature of a world, and the card floor | HITL | 21 | CLOSED a151100 |
| 23 | The reader cannot move on the ground | AFK | 06 | CLOSED fc43719 |
