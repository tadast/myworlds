# p2-00 The second signal: the plan of phase 2

Status: BUILT, 2026-09-28. The issues p2-35 to p2-44 built it; "What the build changed" at the foot
of this file says where the build went another way. `docs/issues/p2-REPORT.md` is the report of the
build.

Type: plan. Read `docs/issues/README.md`, `docs/issues/34-the-carrier.md`, and `docs/source.md`
first. Every issue of phase 2 reads this file for the terms, the decisions, and the contracts.

The decisions come from the design session of 2026-09-27 and its choice sheet. The shapes of the
ruins come from the prototypes of that session. p2-36 ported them into `ruin-geometry.js`, and
`tools/ruin-lab.html` shows them with the real builder. The prototype page and the choice sheet,
`tools/ruin-prototypes.html`, stand in the history at commit e2a1744 and no longer in the tree.

## The feature in one paragraph

Issue 34 ends the search at the wreck, and the log of the wreck is the whole reward. Phase 2 makes
the log a door. Through the log, the radio of the crew hears a click on a band that is not on the
band plan. The last entry states the frequency, and the crew says what they will do about it. The
reader types that frequency into the receiver. The probe then hears a second carrier, and the
search of issue 34 runs again: probe, wedge, cross. The second source is a ruin that no crew built.
Its makers were the ancestors of a species that still lives on the world. Its card shows what the
probe can read of it, what the crew left there if the crew got there, and a line of glyphs that
names another world, which the probe cannot read yet.

## The terms

Use these words and no other words for them, in the code, the comments, and the docs. The terms of
issue 34 stay: carrier, source, bearing, fix, wedge, wreck, motif, log.

| Term | Meaning | Avoid |
|---|---|---|
| ruin | The second kind of source: the thing the makers built. `kind: 'ruin'`. One per world at most. | structure, relic, artefact, alien base |
| proto | One of the eight shapes a ruin can take, such as `spires` or `hive`. `ruin-types.js` holds them. | model, type (a world has a type) |
| maker | The species that built the ruin: an ancestor of a species of this world, or a rolled body when the world has no fit species. | alien, builder |
| chapter | Chapter 1 is the search for the wreck. Chapter 2 is the search for the ruin. | phase (phase 2 is this issue set), stage (a stage is a step of the brief) |
| frequency | The band the ruin sends on, as the log and the overlay print it: `7.316 MHz`. `freq` in code. | channel, signal |
| tune | The reader types the frequency, and the receiver locks on the ruin. The store keeps `tuned`. | unlock |
| the call | The click the radio of the crew hears. The call thread of the log carries it. `kind: 'call'`. | signal (`tel.signal` is the uplink, see issue 34) |
| goers | The people of the crew who go toward the call, as the last entry states. `log.went` and `log.goers`. | party, team |
| the way on | The last row of the card of the ruin: glyphs that name another world, and a "Coming soon" chip. | portal (in the code and the copy of this phase) |

"Signal" stays in prose that the reader sees ("Unknown signal" in the brief), as issue 34 does with
"Distress signal". It is never a name in the code.

## The decisions

1. **The log leads up to the call, and every ending carries it.** Choice D1 C. A new thread kind,
   `call`, runs in every log of a world with a ruin, as the strand thread does: exactly one per log,
   3 to 5 beats, never shortened below 3. Every one of the 12 ending kinds gets wordings that state
   the frequency. The number prints in the last entry and in no other entry. p2-40.
2. **Five outcomes of the last entry.** Choice D2: the whole crew goes, a part goes, one person goes
   alone, nobody can go and the log hands the frequency to the reader, or the crew rides or follows
   the animal toward the call. The leads of the threads pick one, as they pick an ending now. The
   log records the outcome as `log.went`: `'all' | 'some' | 'one' | 'none'`, and the names in
   `log.goers`. p2-40.
3. **What the reader finds of the crew follows who went.** Choice D3 D. `all` or `some`: a camp at
   the ruin and a second short log. `one`: a cairn and one note. `none`: nothing, and the reader is
   the first to stand there. p2-43.
4. **The makers are the ancestors of a living species.** Choice D4 C. The ruin names one species of
   the world, and its carvings and its statue take that body plan: the limbs, the shape, the size.
   A world with no species that fits takes a rolled maker, choice D4 D: a small body of limbs and
   height, and the same numbers set the doors and the steps. p2-35 picks the maker, p2-36 draws it,
   p2-42 states it.
5. **Eight protos, a short list per world type.** Choices D5 and D6 C. The owner kept spires,
   dome, arches, well, floaters, colossus, and ring, and asked for the hive to come back as a
   colony: one mound of equal hex cells in terraces, three small hives around it, and paved paths
   between them. `tools/ruin-lab.html` shows the colony. Each world type allows the protos
   that fit it, and a hash of the seed picks one, as `hullOf()` picks a hull. See the table below.
6. **The ruin replies.** Choice D7 B. The call started on the day the crew put the beacon on the
   mast. The call thread states both days, and they are one day. The card states it again.
7. **The frequency is `N.NNN MHz`, and a near miss answers.** Choice D8 A. Three decimals in 3.000
   to 29.999 MHz, from a hash of the seed. The overlay shows `406.025 MHz` for the whole of chapter
   1, so the reader learns what a frequency looks like. A close number answers "A pattern under the
   static on 7.313 MHz." A wrong number answers "Static on 7.313 MHz." p2-38, p2-39.
8. **The field stands in two places.** Choice D9: under the last entry of the log card, and in the
   Carrier row of the sidebar. Both appear after the find of the wreck and not before. p2-39.
9. **The ruin stands 12 to 35 cells from the wreck.** Choice D10 B. That is about 900 to 2,600 km
   on a planet of 7,352 km, always inside `CARRIER_REACH` of the wreck, so the first tune at the
   wreck hears the ruin. The search of chapter 2 takes three or four landings. p2-35.
10. **The log gives a compass word.** Choice D11 B. "It comes from the north-east." The word is the
    true bearing from the wreck to the ruin, to eight points, so it is never false. p2-40.
11. **The ruin plays the motif of the wreck back.** Choice D12 C. The same steps, at half the
    speed, an octave lower, on a bus of its own. The song stays whole. p2-44.
12. **The search ends at the ruin, and the card teases the way on.** Choice D13 A and the owner's
    note. The globe carries both mini models and the Carrier row reads "Found 2 of 2". The card
    ends on a row of glyphs that names another world, "The probe cannot read this yet", and a chip
    "Coming soon". The glyphs spell a seed that `portalSeed()` rolls now, so the later issue that
    opens the way reads the same glyphs. p2-42.
    The find of the ruin by chance that the build read into this decision is superseded; see
    `docs/adr/0001-chapters-open-in-strict-order.md`.
13. **A log that stops mid-sentence says so.** The owner's note. The card prints
    "[log ends abruptly]" under an entry of the `cut` kind, in the style of a note and not of the
    log. This holds for the logs of today and for the new ones. p2-37.

## The protos

`ruin-types.js` holds this table. `disc` is the radius of the flat ground the patch lays, in units
of the box. `height` is the height of the tallest part, in units. The wreck mast stands 18.

| id | Name on the card | Fits | disc | height | The light |
|---|---|---|---|---|---|
| `spires` | Needle spires | ice, ocean, lava | 24 | 88 | the tip of the tallest spire, and a band on each spire |
| `dome` | Broken dome | desert, terran | 36 | 28 | a core on a plinth inside the ribs |
| `arches` | Arch causeway | ocean, terran | 52 | 30 | the keystone of the first arch |
| `well` | The deep well | ice, desert, lava | 30 | 25 | the floor of the shaft, and the cap of each pylon |
| `floaters` | Floating stones | exotic | 24 | 36 | a core that the slabs turn around |
| `colossus` | Fallen maker | terran, desert, ice | 38 | 22 | the eye, and the palm of the hand that stands |
| `ring` | The ring | exotic, lava, ocean | 30 | 38 | the inner edge of the ring |
| `hive` | Hive colony | exotic, ocean, terran | 55 | 30 | the doors at the foot of each mound, and a crown on the great mound |

Each world type then allows three or four protos:

| Type | Protos |
|---|---|
| terran | dome, arches, colossus, hive |
| ocean | spires, arches, ring, hive |
| desert | dome, well, colossus |
| ice | spires, well, colossus |
| lava | spires, well, ring |
| exotic | floaters, ring, hive |

A gas giant takes no source and no ruin. The prototypes that the owner did not keep are henge,
ziggurat, dishes, and monolith. They stay in `tools/ruin-prototypes.html` at commit e2a1744 of
the history and nowhere else.

## The shared contracts of phase 2

These are the planned contracts. The issue that builds a contract writes it into "Shared
contracts" in `docs/issues/README.md` in the same commit, and says so in its summary.

### The world

```js
world.ruin = {
  kind: 'ruin',
  proto: 'spires',                 // protoOf(world), a pure function of the seed and the type
  dir: [x, y, z],                  // unit direction in the local frame, at the middle of its cell
  freq: '7.316',                   // freqOf(seed): three decimals, 3.000 to 29.999, no unit
  maker: { species: 2, limbs: 6, height: 3.4, rolled: false },   // see decision 4
  from: 'north-east',              // the bearing from the wreck to the ruin, to eight points
  log: null,                       // the second log, p2-43; null when nobody went
} | null
```

- `world.ruin` is null when `world.source` is null, and on the rare world where no cell passes the
  tests of `makeRuin()`. A log of a world with a null ruin ends as it ends today. The audit counts
  those worlds, and the target is none in 200 seeds.
- `world.ruin` never shares a cell with `world.source` or with the activity.
- The page must not show `freq`, `from`, or `log` before the reader reads them in the log of the
  wreck or on the card of the ruin. The field of the tuner compares the typed number with `freq`
  and gives nothing else away.

### `ruin-types.js`

A new module with no three.js and no DOM, on the pattern of `world-types.js`, so the worker, the
page, and the tools import it.

- `RUIN_PROTOS`: the table above, as plain data.
- `protoOf(world)`: the FNV hash of `'ruin:' + seed` over the protos that fit `world.type`, in the
  order of the table. Null for a gas giant.
- `freqOf(seed)`: the FNV hash of `'freq:' + seed`, mapped to 3000 to 29999, as the string
  `'N.NNN'`.
- `parseFreq(text)`: a number of MHz, or null. It takes `7.316`, `7,316`, `7.316 MHz`, and `7316`:
  four digits or more with no separator take a decimal point before the last three.
- `portalSeed(world)`: the seed of the world the way on names. p2-42 uses it only to draw glyphs.
- `compass8(brg)`: `'north'`, `'north-east'`, and the six other words, for a bearing in degrees.

### The streams

No existing stream draws one number more. `tools/world-checksum.mjs` proves it for the terrain, the
plants, the animals, the activity, and the wreck. The hash of the log changes on purpose in p2-40,
and the baseline moves in that commit only.

| Stream | Rolls | Issue |
|---|---|---|
| `seed + '\|ruin'` | the cell of the ruin, then the maker | p2-35 |
| `seed + '\|source-lore'` | the log of the wreck, now with the call thread and the new endings | p2-40 |
| `seed + '\|ruin-lore'` | the second log, when somebody went | p2-43 |
| `pseed + '\|ruin'` | the place and the yaw of the ruin on its patch | p2-41 |
| FNV `'ruin:' + seed`, `'freq:' + seed`, `'portal:' + seed` | the proto, the frequency, the seed of the way on | p2-35 |
| music: the rhythm of `motifOf(world)` | the motif of the ruin, played back; no new stream | p2-44 |

### The patch

- The patch call finds the ruin by the rule of `kindIn()`: the cell of `world.ruin.dir`. It shows
  the ruin on its cell whether or not the reader has tuned, because a patch depends only on its
  arguments. A reader who lands on it by chance finds it.
- `patch.source = { kind: 'ruin', proto, x, y, z, yaw }` on that cell, in units of the box. The
  wreck keeps `{ kind: 'wreck', x, y, z, yaw }`. One cell never holds both.

### The store

The key stays `myworlds.carrier.v1`, and a record of an older build needs no migration.

```js
{ "Auralis": {
    fixes: [...], found: true, briefed: 3, ts: 1758240000000,   // chapter 1, as issue 34 keeps it
    tuned: true,                                                // the reader locked the receiver
    ruin: { fixes: [{ lat, lon, brg, err }], found: false, briefed: 0 },   // chapter 2
} }
```

- A record with no `tuned` reads as `false`, and a record with no `ruin` reads as an empty chapter
  2. `clearFixes()` of chapter 2 keeps the tune, the finds, and the briefs.
- The tuner of p2-39 offers the tune only after the find of the wreck. The store does not test the
  find, because a find of the ruin by chance tunes the world too (p2-42). `MAX_FIXES` holds for
  each chapter.

### The carrier

- `carrierAt(world, site, src = world.source)`, and the same third argument on `carrierDir()`,
  `carrierBox()`, and `sourceSite()`. The hash of the offset takes the kind:
  `` `${seed}|carrier|${kind}|${face}|${i}|${j}` `` for the ruin, and the key of today for the wreck,
  so no fix of chapter 1 moves.
- `activeSource(world, record)` in `site.js`: the ruin when the record is tuned and the world has a
  ruin, else the wreck. Every caller of the carrier reads it.
- `telemetry().carrier` gains `freq`: `'406.025'` in chapter 1, and `world.ruin.freq` in chapter 2.

### The log

- `world.source.log` gains `went` and `goers`, and the thread kind `call`. `slot` names the call
  thread as `call.<id>`.
- Two new tokens: `{freq}`, which prints `7.316 MHz`, and `{from}`, which prints the compass word.
  Only an ending may hold `{freq}`.
- `world.ruin.log` has the shape of `world.source.log`, with `crew` limited to the goers and the
  days counted on from the last day of the log of the wreck.

## The issues

| # | Issue | Type | Blocked by |
|---|---|---|---|
| p2-35 | No second source stands on the world, so the log has nothing to point at | AFK | none |
| p2-36 | The ruin has no body to draw | AFK | p2-35 |
| p2-37 | A log that stops mid-sentence reads as a defect of the card | AFK | none |
| p2-38 | The carrier can follow only the wreck | AFK | p2-35 |
| p2-39 | The reader has nowhere to type the frequency | AFK | p2-38 |
| p2-40 | The log ends without a way forward | AFK, then HITL read | p2-35, p2-37 |
| p2-41 | A landing on the cell of the ruin shows empty ground | AFK | p2-35, p2-36 |
| p2-42 | The ruin can be seen but not read, and a find leaves no mark | AFK | p2-38, p2-41 |
| p2-43 | The crew went to the call, and the ruin holds no trace of them | AFK, then HITL read | p2-40, p2-42 |
| p2-44 | The ruin is silent | AFK, then HITL listen | p2-38, p2-41 |

Waves: p2-35 and p2-37 first. Then p2-36, p2-38, and p2-40 at the same time. Then p2-39 and p2-41.
Then p2-42 and p2-44. Then p2-43. p2-36 and p2-41 both add to `ground-source.js`; p2-36 keeps the
geometry in `ruin-geometry.js`, so the two meet only at the import.

The first release is p2-35 to p2-42. A world then ends its log on the call, the reader tunes,
searches, finds the ruin, and reads its card. p2-43 and p2-44 add the payoff and the sound.

## The checks that need a person

- **The read of the logs.** p2-40 and p2-43: read 20 whole logs with
  `node tools/lore-audit/log-sample.mjs`, across every outcome of decision 2. The audit proves that
  a line is honest. Only a reader can tell that the call rises and that the ending pays it off.
- **The length of the search.** p2-38 and p2-42: walk five worlds by hand from the wreck. The median
  search of chapter 2 must take three or four landings. Change `RUIN_NEAR` and `RUIN_FAR` in
  `generate.js` if it does not.
- **The listen test.** p2-44: the motif of the ruin must stand in tune with the song on a terran, a
  desert, and an ice world, and it must read as the motif of the wreck played back.
- **The look of the protos.** p2-36: the owner looks at `tools/ruin-lab.html` on the six types
  before p2-41 puts the protos on the ground.

## Risks

- **A log can point at nothing.** If `makeRuin()` finds no cell, the ending must not print a
  frequency. The endings keep their wordings of today as the pool for a world with no ruin, and
  the audit fails a log that prints `{freq}` on such a world.
- **The number may leak.** The frequency must not show in the page before the reader reads it: not
  in the overlay, the sidebar, the URL, or a title. The field compares and gives back only the
  answers of decision 7.
- **The ending pool doubles.** Twelve kinds, three wordings each, gated on the goers and on the
  ways of moving. Write the wordings to the voice of `docs/source.md`, and run the audit after each
  kind, not at the end.
- **A big ruin on a small island.** A disc of 55 units may not fit on the dry ground of an ocean
  cell. `patchRuin()` takes the walk of `patchSource()` and its fallback, and the rim of the disc
  may reach the water.
- **The well needs a hole in the ground.** The terrain of a patch is one grid with no hole. p2-41
  opens it in the terrain shader and not in the grid.

## Left for later

- **The way on.** Built as chapter 3, `docs/issues/p3-00-the-way-on.md`: the glyphs decode to
  `portalSeed(world)`, the name of the twin on the same world, and the ruin carries the probe there.
  A way on across worlds is still left for later.
- A third band on the same world, which the card of the ruin states.
- The prototypes that the owner did not keep: henge, ziggurat, dishes, and monolith.
- A ruin on a gas giant, which needs a probe between the cloud decks first.

## What the build changed

The build followed the plan. Each issue file records its own deviations under "What the build
changed". These are the ones a reader of this plan must know.

- **The checksum keeps the ruin out of the facts.** A new key `world.ruin` would move the facts hash
  of every world. `splitWorld()` in `tools/world-checksum.mjs` leaves `world.ruin` out of the facts
  and puts `world.ruin.log` in the lore. `tools/ruin-check.mjs` proves the place, the maker, the
  patch of the ruin, the camp, and the glyphs instead. The baseline moved twice, in p2-40 and in
  p2-43, and both times only the lore column of the ten world lines of the five worlds with a
  surface moved.
- **`world.ruin` gains `band`**, the index of the band the place came from. Over 500 seeds 99.5 per
  cent of the ruins stand in the first band and none in the last. No world with a wreck lacks a ruin.
- **The search length.** The manager played eleven worlds with real landings. The median search of
  chapter 2 takes three landings after the wreck, inside the three or four of decision 9, so
  `RUIN_NEAR` and `RUIN_FAR` keep 12 and 35.
- **The colour of chapter 2 takes no orange and no yellow**, because the drawings of the brief mark
  the next landing in orange (`MARK_APART` in `carrier-globe.js`).
- **Superseded on 2026-09-29 by `docs/adr/0001-chapters-open-in-strict-order.md`:** the chapters open in
  strict order, and the card of the ruin opens only after the find of the wreck. The next bullet is the
  rule of the build.
- **A find of the ruin by chance** tunes the world, as decision 12 says, and the receiver then follows
  the wreck again until its find, so the search of chapter 1 can still end. The ruin keeps its voice
  in orbit after its find, whatever chapter runs.
- **The tuner** is `tuner.js`, one builder for the card and the sidebar. The field in the card does
  not take the focus when the card opens, because the keyboard of a phone would cover the log.
- **The log.** Three call threads of five beats in one fixed order; a trim keeps the last beat, so a
  call of three beats reads: heard, the reply, the direction. The first log gains `went`, `goers`,
  `beacon`, `by`, and `traits` on a world with a ruin. Over 200 worlds `went` reads none 40, some
  28, all 19, and one 12 per cent.
- **The ruin on the ground.** The flat part is the whole `disc`, and the soft edge lies outside it.
  The range of the overlay measures to the outline of the ruin, and the needle points at its middle.
- **The card of the ruin** takes its text from `ruinCard(world)` in `ruin-types.js`, a pure
  function the Node check reads. The Call row is two sentences, to keep the voice under 20 words a
  sentence. A maker whose living species has no legs says so in the Makers row.
- **The second log** is `ruin-lore.js`. It always runs the sight, the carvings, a person, and the
  reply, so it holds 6 to 8 entries. The trip runs at 40 km a day in the rover, 15 on foot, 30 on
  the raft, and 25 on an animal. A crew that counted its food down says how it ate on the way.
- **The voice of the ruin** plays on bars 3 and 4 of every 8 bars of the song, one bar after the call
  of the wreck, as an FM bell at `RUIN_LEVEL` 0.35. No song and no wreck motif changed.
- **Open:** the listen test of p2-44 still needs a person. See `docs/issues/p2-REPORT.md`.
