# 34 No cell is worth more than another, so the reader has no reason to pick a site

Type: HITL for the design decisions below, then AFK per slice. Status: PLAN. No code exists yet.

Plan from the design session on 2026-09-19.

## The defect

The app is a viewer. A world holds 147,894 cells, and every cell has the same value to the reader. After about ten minutes the reader knows the generator, and no landing asks a question. The reader has no reason to select one site and not the next.

## The feature in one paragraph

Something on the world transmits. The instrument of the probe gets a fifth reading, the carrier: a bearing to the source, with an error, and no distance. After the recall, the globe keeps a wedge from that site along the bearing. A second landing gives a second wedge, and the source is where the wedges cross. A landing near the cross gives the range, and a landing in the cell of the source shows the source: the wreck of an older probe, with a log of four entries that the lore engine writes from the facts of the world. The search has three phases: hear, cross, and home.

## The terms

Use these words and no other words for them, in the code, the comments, and the docs.

| Term | Meaning |
|---|---|
| carrier | The reading on the overlay. `signal` is not free: `tel.signal` and `#hud-sig` are the strength of the uplink. |
| source | The thing that transmits. One per world, in one cell. |
| bearing | The angle from north at the site to the source, 0 to 360 degrees, east positive. |
| fix | One stored bearing: the site, the bearing, and the error. One landing gives one fix. |
| wedge | The shape of a fix on the globe: the bearing plus and minus the error. |
| wreck | The first kind of source. Later kinds take the same search. |
| motif | The short tune of the source in `music.js`. |

## Decisions

1. **One source per world with a surface.** A gas giant gets none in this issue, because it gets no probe. A world with no dry cell gets none. The overlay then hides the carrier row.
2. **The source has its own hash streams.** `makeRng(seed + '|source')` rolls the cell and the motif, and `makeRng(seed + '|source-lore')` rolls the log. No existing stream draws one number more, so no world changes. Verify this with a checksum of `heights`, `flora`, and `fauna` for five seeds before and after.
3. **The carrier is always heard. The error does the work.** A range limit was rejected: a landing with no reading costs the reader a dive and gives little. The error is 3 degrees at zero distance and 25 degrees at the antipode, linear in the arc. The offset inside the error comes from a hash of the seed and the cell, so a fix is the same on every visit and the true bearing always lies inside the wedge. Two far fixes give a wide cross, and the reader then decides between a third far fix and a near one. That decision is the feature.
4. **A wedge, not a line.** Two exact lines solve every world in two landings, and the search is dead by the third world. A wedge states the doubt honestly.
5. **A wedge covers half a great circle.** A bearing has a direction, so the wedge starts at the site and ends at the antipode of the site. Two wedges then cross in one region and not in two.
6. **The app draws no cross.** The reader reads the cross by eye. A computed mark takes the only thought out of the search.
7. **The range appears only near the source.** Inside 6 cells of arc the carrier row states the range in kilometres. In the cell of the source it states the range in units and the arrow points at the wreck.
8. **No pull to the source.** `pullSite()` does not know the source. The reader must aim.
9. **A landing takes the fix on its own.** No button. One landing, one fix. A second landing in the same cell replaces the fix of that cell.
10. **The fixes live in `localStorage`, under a key of their own.** `myworlds.carrier.v1`, keyed by seed: `{ fixes: [{ lat, lon, brg, err }], found, ts }`. The store of the saved worlds drops old entries on a quota error, and that must not drop a search. A shared URL carries no fix.
11. **The song stays whole.** The first idea was to take the lead voice out of the song until the reader finds the source. Rejected: it makes every song worse for every reader who does not search, and the music starts muted, so it cannot carry a mechanic alone. The source gets a voice of its own instead: the motif, four to seven notes in the mode and the root of the song, on the step grid of the song, so it is always in tune. On the ground its level follows the distance to the source. After the find, the motif joins the song of that world in orbit for good. The reward adds to the song and takes nothing from it.
12. **Everything works with the sound off.** The lamp of the wreck blinks the rhythm of the motif, and the carrier row carries every fact the ear gets.
13. **The source is a parameter from the first commit.** `world.source.kind` is `'wreck'` now. The bones of an extinct species and the stones of the makers are later kinds, and they take the search, the fixes, and the wedges with no change.

## What to build

### Slice 1: the source and the carrier row (small)

- `worker.js`, in `generate()`: `makeSource(rng, world, pos, vCount, H, ...)`. Select a dry vertex: over the beach band, slope under 0.5, latitude inside 80 degrees, and at least 4 cells from the cell of the activity. Snap its direction to the middle of its cell with the cube map the worker already holds. Write `world.source = { kind: 'wreck', dir: [x, y, z] }`. Give null when no vertex passes.
- `site.js`: `sourceSite(world)`, `bearingTo(site, dir)`, `arcTo(site, dir)`, and `carrierAt(world, site)`, which returns `{ brg, err, arc, rangeKm }` with the hash offset of decision 3. North at a site is the part of the axis `+y` that lies in the tangent plane. East is the direction of falling lon; `groundBasis()` in `ground-sky.js` states why. Take the east of that function and do not derive it again.
- `app.js`: on `patch-done`, compute `carrierAt()` and pass it in `Ground.load(result, { ..., carrier })`. For the arrow, turn the direction of the source through `groundBasis(planet, site, twist)`, as `skyView()` does for the sun. The arrow is then right under the twist of the cell with no new math.
- `ground.js`: `telemetry()` adds `carrier: { brg, err, rel, rangeKm, range }`, where `rel` is the bearing less the azimuth of the camera, so the needle turns with the view.
- `index.html`, `style.css`, `probe-hud.js`: a fifth block. A needle, the bearing as three digits, the error as `±n°`, and one word for the strength: faint, clear, strong, or here. The range shows under decision 7. The block is hidden when `tel.carrier` is null.
- A debug flag `?source` draws a dot on the globe at the source. It is the check for the bearing math, and it stays out of the UI.

### Slice 2: the fixes and the wedges (medium)

- `carrier-store.js`, a new module: `loadFixes(seed)`, `addFix(seed, fix)`, `markFound(seed)`, `clearFixes(seed)`. Every `localStorage` call sits in try and catch, as `persist()` does.
- `carrier-globe.js`, a new module: one group under `current.planet`, so it turns with the planet. A fix is a dot at its site and a wedge: a triangle fan of 48 steps along the half circle, at radius 1.07, which clears the relief of 0.06. `depthTest` stays on, so the far side of the globe hides its part. One `MeshBasicMaterial` in the accent of the palette, alpha 0.16, `depthWrite` off, `toneMapped` false. Two wedges read darker where they cross, and that is the whole display of the cross.
- `app.js`: build the group in `buildWorld()` from the store, add the fix on `patch-done`, and dispose the group with the world. The ascent ends over the site, so the reader sees the new wedge arrive: fade it in over 1.2 s.
- The sidebar: a Carrier row in the stats card. "Not heard", "1 fix", "3 fixes", or "Found". A small button clears the fixes of this world. A saved world that is found gets a mark on its thumb.

### Slice 3: the wreck on the ground (large)

- The patch protocol takes `opts.source: { kind }` when the landing cell is the cell of the source, by the rule `activityHere()` uses: the cell and not the pull. Add `sourceHere(target)` beside it.
- `worker.js`, `patchSource()`: pick a place from `makeRng(pseed + '|source')` inside 60% of the reach, then walk to the nearest node that is dry and under slope 0.35. Flatten a disc of 14 units with a soft edge, scorch its colour toward the dark end of the palette, and keep plants, grass, and group anchors off it, as `patchActivity()` does. Reply with `patch.source = { kind, x, y, z, yaw }`.
- `ground-source.js`, a new module on the pattern of `ground-phenomena.js`. The wreck is flat-shaded vertex colour, under 1,500 triangles: a hull that leans, a dish that lies beside it, two legs of three, a mast, and a lamp. The lamp blinks the rhythm of the motif on the clock of the landing. HIGH gets one point light; LOW gets the emissive lamp only. A colossus reads from far away, so the mast stands 18 units and the lamp shows through the fog start.
- The pick: a tap on the wreck marks it with the ring the plants use, and the floating button reads "Read the log". Reuse the flow of the flora card in `ground.js` and `flora-card.js`; the preview turns the wreck on its own axis.
- The first time the card opens, `markFound(seed)` runs, the Carrier row reads "Found", and the wedges on the globe give way to one ring at the source.

### Slice 4: the log (medium)

- `source-lore.js`, a classic script the worker loads with `importScripts`, on the pattern of `flora-lore.js`. It holds no three.js. It feeds `lore.js` a story of four named slots: the arrival, the survey, the trouble, and the last entry.
- Every line names the tags it needs and the tags it forbids. The trouble is always a real fact of the world: the gravity, the cold, the length of the night, the tilt and its polar night, the activity, a pulsar or a giant star, a tide that a moon raises. The survey names one real species of the world and one fact of its genome, so the log and the fauna card agree. A gated line outranks a line that fits any world.
- The log is written in `generate()` and rides on `world.source.log`. The page does not show it before the find.
- `tools/lore-audit/audit.mjs` sweeps the four slots against every world it already builds: no slot is empty, no line is unreachable, no line claims a fact the world does not have, and the species the log names exists.

### Slice 5: the motif (small)

- `music.js`, in `compose()`: roll the motif from `makeRng(seed + '|source')` after the song, from its own stream: four to seven notes of the mode, inside one octave over the root, one bar long. `_start()` adds `song.srcBus`, a gain at 0 that feeds `out` and the reverb. The scheduler plays the motif on bar 1 of every four bars.
- `Music.setCarrier(k)` ramps `srcBus` to `k * 0.5` over 0.4 s. `app.js` calls it twice a second on the ground with `k` from the distance to the wreck: 0 outside the cell of the source, then a smoothstep from 0.15 at the edge of the reach to 1 at 40 units. In orbit `k` is 0 before the find and 0.6 after it.
- The lamp of the wreck reads the same bar clock, so the eye and the ear agree.

## Shared contracts to update in `docs/issues/README.md`

- The world: `world.source = { kind, dir: [x, y, z], log } | null`.
- The patch options: `source: { kind } | null`. The patch result: `patch.source = { kind, x, y, z, yaw } | null`.
- `Ground.load(result, { sunDir, view, carrier })` and the `carrier` member of `telemetry()`.
- The store key `myworlds.carrier.v1`.
- Strike "Not touched by this issue set" from the `music.js` row.

## Acceptance criteria

- The same seed gives the same source, the same log, the same motif, and the same fix per cell, on two reloads.
- The checksum of decision 2 holds for `Auralis`, `Vesper`, and three more seeds, one of them ice.
- `tools/carrier-check.mjs` takes 1,000 random pairs of a site and a source. For each pair the true bearing lies inside the wedge, and a walk of the great circle along the true bearing passes within 0.001 rad of the source. It also checks one site in each of the six faces of the cube grid with a twist, against `groundBasis()`.
- With `?source` on, three fixes from three continents cross over the dot.
- A landing in the cell of the source shows the wreck, the needle points at it from every camera azimuth, and the range falls to under 5 units at the hull.
- The wreck stands on dry ground on a coast cell, and no plant, no tuft, and no herd stands on its disc.
- The find survives a reload. A clear of the fixes does not clear the find.
- The audit passes with the four new slots.
- With the sound off, no fact is lost. With the sound on, the motif is in tune with the song on a terran, a desert, and an ice world.
- Frame time: the carrier row, the wedges, and the wreck add under 0.3 ms on HIGH at the reveal camera. `renderer.info.memory` returns to its orbit numbers after a recall.
- A phone viewport shows the fifth block with no overlap of the sheet, and a wedge reads at the home zoom.
- `README.md` "How it works" and "Controls", and `docs/probe.md` decision 14, state the behaviour.

## Risks

- **The search may be the same on every world.** The wedge error is the first defence. The later kinds of source are the second. If the third world still bores the reader, add terrain that blocks the carrier before you add content.
- **East is easy to mirror.** The sky had this defect once; see decision 10 of `docs/probe.md`. The check script is not optional.
- **The box changed hand on 2026-09-19.** The ground box was the mirror of its cell, with z along the v axis of the cell. It now runs z against v; see "The box is right-handed" in `docs/probe.md`. Slices 1 and 2 were written against the old box and were not yet committed at that date. `boxPoint()` and `carrierBox()` in `site.js` must take z against v, or the needle points at the mirror of the wreck. Apply `docs/issues/34-frame-follow-up.patch` on the tree of slices 1 and 2: `git apply docs/issues/34-frame-follow-up.patch`. It corrects the two functions and the comments that name the mirror, and it turns the mirror note of `tools/carrier-check.mjs` into check 5, which takes the box map from `worker.js` itself. Then run `node tools/carrier-check.mjs`, `node tools/carrier-fix-check.mjs`, and `node tools/frame-check.mjs`, and delete the patch file.
- **The error may be wrong for the feel.** 3 to 25 degrees is a first value. Tune it on five worlds by hand: the median search must take three to five landings.
- **A reader may never look at the fifth block.** The first landing on each world flashes the carrier row once, and the first wedge fades in while the reader watches the ascent. Add no tutorial text.
- **`localStorage` can go away.** The search of one world is cheap to repeat. Accept it.

## Left for later

- The bones of an extinct species as a source kind: a skeleton mode of `buildCreature()`, and a card whose rows fill per find.
- The stones of the makers as a source kind, aimed with the real axis of the world.
- A log that points to a second site, so one find starts the next search.
- A needle that settles only while the probe holds still.
- A source on a gas giant, which needs a probe between the cloud decks first.

## Blocked by

Nothing. Slices 1 and 2 need each other to be of use. Slice 3 needs slice 1. Slices 4 and 5 need slice 3. Ship 1 to 3 together as the first release; 4 and 5 can follow in any order.
