# p3-00 The way on: the plan of chapter 3

Status: BUILT, 2026-09-30. One branch, `tt/chapter-3-the-way-on`, built the whole chapter. "What the build
changed" at the foot of this file says where the build went another way.

Type: plan. Read `docs/issues/p2-00-the-second-signal.md`, `docs/ruin.md`, and `docs/source.md`
first. Chapter 3 continues the story of the survivors after the ruin.

## The feature in one paragraph

Chapter 2 ends at the ruin, and its card ends on a line of glyphs: "The way on". Chapter 3 makes the
line a puzzle. The ruin sends the beacon of the crew back, and the beacon carries the call sign of
the ship, so the card shows the call sign in the script of the makers above letters the reader knows.
The probe also hears the sixteen sounds of the call. The reader matches glyphs to letters and sends
the name. The ruin lights each glyph that is right. The right name carries the probe, in a burst of
light, to the twin: a ruin of the same proto, far across the same world. A herd of the animal of the
carvings lives at the twin. When the crew went to the call, the crew went through the way before
the reader, and the twin holds their tent and the third log. The log tells how the crew and the herd
helped each other, in one of six fates. Where people lived through it unchanged, they walk out of the
tent after the reader reads the log. A tap on one of them gives the line "Thank god, it's been 12
years, but they sent a rescue ship! I'm glad we kept going." and the button "Take the crew home". The
press ends the mission.

## The terms

Use these words and no other words for them. The terms of phase 2 stay.

| Term | Meaning | Avoid |
|---|---|---|
| the way on | Chapter 3, and the last row of the card of the ruin: the name, the key, and the send. `id: 'way'`. | portal (except the old `portalSeed()`), teleport (in the code) |
| twin | The ruin of the same proto, far across the same world, that the name leads to. `world.twin`, `kind: 'twin'`. | second ruin, far ruin |
| name | The word the glyphs of the way on spell: `portalSeed(world)`, the name the makers gave the twin. | password, code, answer |
| key | The call sign of the ship in the script of the makers, with its letters, and the sixteen sounds. | hint, cipher |
| send | The reader sends a name to the ruin. The ruin lights each glyph that is right. | guess, submit |
| codex | The letters the reader has given the glyphs, on every world. The script is one script. | dictionary |
| jump | The move of the probe from the ruin to the twin. `probe.jump()`. | teleport, warp |
| herd | The animals of the maker at the twin: the species of the maker, or the kin. | flock |
| kin | The species that `rollKin()` rolls for a rolled maker. It lives only at the twin. | new species |
| third log | `world.twin.log`: what the crew wrote at the twin. | log 3 |
| fate | One of the six ways the third log ends. `world.twin.fate`. | ending (an ending is the last entry of the first log) |
| home | The end of the mission: the reader takes the crew home. | rescue (in the code) |

## The decisions

1. **The twin stands far.** 60 to 150 cells of arc from the ruin (about 4,400 to 11,000 km on a
   planet of 7,352 km), with the fallback bands 40 to 200 and 20 to 300. It passes the tests of the
   ruin, and it keeps 20 cells or more from the wreck. Stream `seed + '|twin'`. It takes the proto
   of the ruin.
2. **The name is `portalSeed(world)`.** The glyphs of p2-42 do not change. The card no longer says
   "another world": the probe reads a name. The "Coming soon" chip goes.
3. **The key.** The call sign is the name of the ship with its mark in words: "Lantern ten". The
   card shows it as glyphs with the letters under them. The sixteen syllables of `portalSeed()` are
   the sounds of the call, and the card shows them as chips.
4. **The send answers per glyph.** Each right glyph lights. The name with every glyph right carries
   the probe. There is no limit on the sends.
5. **The codex outlives the world.** The script is one script on every world, so the letters the
   reader gave the glyphs fill the fields of the next world. A glyph that lit in a send is proven.
   `localStorage` key `myworlds.codex.v1`.
6. **The jump.** The ruin flares, a beam of light stands over it, and the cover goes white. Under
   the cover the page drops the ground of the ruin and lands on the cell of the twin. The twin flares
   and fades as the cover opens. The arrival at the twin ends chapter 3.
7. **The herd.** Five to eight groups of the species of the maker stand around the twin. A rolled
   maker has no species on the world: the kin rolls for it from `seed + '|kin'`, and the twin is the
   one place it lives. The card of the ruin was right that no animal of the world it knew had that
   body.
8. **The third log.** When somebody reached the ruin (`went` is `all`, `some`, or `one`), that crew
   went through the way before the reader, and the twin holds its tent and its third log. When
   nobody went, the twin holds the herd alone, and the reader is the first person to stand there.
9. **Six fates.** `fateOf()` of `way-types.js` picks one by the FNV hash of `'fate:' + seed` among
   the fates the crew allows. See "The fates" below.
10. **The rescue.** A person whose end is `home` walks out of the tent once the reader has read the
    third log. A tap on that person gives the line and the button "Take the crew home". The press
    carries the crew up with the probe, and a card says that the mission is complete.
11. **The chapter.** Chapter 3, `{ id: 'way', kind: 'way' }`, opens when the ruin is found. It is
    done when the probe reaches the twin. The store keeps `read` and `home` beside the find.
12. **Tools.** `?fate=<id>` forces the fate of the third log (a world option). `?chapter=3` gives
    the reader the finds of chapters 1 and 2. `window.__mw.way` holds hooks for the tests.
    `tools/story-lab.html` shows every fate of a seed side by side, and
    `node tools/lore-audit/way-sample.mjs` prints them.

## The fates

The herd needs something the crew can give, and the crew needs something the herd can give. What
the herd needs follows the world: water under the stones on a desert world, warmth for the young in
the long night of an ice world, a way off a shrinking island on an ocean world, a warning before the
ground breaks on a lava world, a sickness of the young on a terran world, the light of the stones on
an exotic world. What the herd gives follows the world too: shade, a den, food a person can eat, a
cool cave, a spring, the warmth of bodies.

| Fate | Title | What happens | Ends of the people |
|---|---|---|---|
| `pact` | The pact | The crew helps the herd, and the herd keeps the crew alive. | every person `home` |
| `trek` | The long walk | The herd walks a long circle over the land, and the crew goes with it and comes back to the stones with it. | every person `home`; in a crew of three or more, one person `lost` on the way |
| `split` | The split | The crew cannot agree. Some go on with the herd. The rest stay at the tent. | the keeper and at least one more of a larger crew `home`; the others `gone`. Needs two people |
| `sour` | The broken pact | The pact breaks. | a crew of one or two: every person `lost`. A larger crew: one person `home`, the rest `lost`, and the last entry is in the hand of that person |
| `mad` | The echo | The stones never stop calling. The crew answers them, and at the end walks into their light. The last entry falls apart into the sounds of the call. | every person `gone` |
| `change` | The change | The world takes the crew in, by its form: `chorus` (terran, ocean, and some exotic worlds), `sleep` (ice, desert), or `light` (lava, and the other exotic worlds). | `chorus`, `sleep`: every person `changed`; `light`: every person `gone` |

`home`, `lost`, `gone`, and `changed` are the ends of `way-types.js`. The page reads them: a person
`home` walks out of the tent, a person `changed` of the chorus stands in the herd, and a person
`lost` has a grave by the tent when a person lived to dig it.

## The shared contracts

### The world

```js
world.twin = {
  kind: 'twin',
  proto: 'spires',          // the proto of the ruin
  dir: [x, y, z],           // unit direction, at the middle of its cell
  km: 7750,                 // the arc from the ruin, to ten kilometres
  from: 'east',             // the bearing from the ruin to the twin, to eight points
  band: 0,
  herd: 0,                  // the index in world.species of the animal of the herd
  kin: false,               // true when the herd is the kin of a rolled maker, pushed onto world.species
  fate: 'pact',             // the fate, or null when nobody reached the ruin
  form: null,               // 'chorus', 'sleep', or 'light' for the fate `change`
  log: { ... } | null,      // the third log
} | null
```

The page must not show `km`, `from`, the name, or `log` before the reader reaches the twin.

### The third log

`WayLore.writeWayLog({ world, rng, fate })` in `way-lore.js`, from `makeRng(seed + '|way-lore')`.
It reads `world.source.log`, `world.ruin.log` (the second log), and `world.twin`, and it returns:

```js
{
  probe: 'Verge 10',
  fate: 'pact', form: null,
  through: 283,             // the day the crew went through the way: the first entry
  days: 402,                // the day of the last entry
  keeper: 'Sara',           // the keeper of the second log, who keeps this one
  crew: [{ name: 'Sara', role: 'mechanic', end: 'home' }, ...],   // the crew of the second log
  went: 'some',
  years: 12,                // years from the landing of the wreck to the rescue: world.source.log.years
  entries: [
    { slot: 'way.through', title: 'Through', day: 283, text: '…' },
    …
    { slot: 'end.pact', title: 'Last entry', day: 402, text: '…' },
  ],
  voice: { speaker: 'Sara', line: '…', home: true } | { speaker: 'Mira', line: '…', home: false } | null,
}
```

`voice` is what a person at the twin says to the reader: the rescue line for a crew with a person
`home`, a line of refusal for the chorus of `change`, and null otherwise.

### The progress

The store keeps chapter 3 under `way` in the record of a seed:
`way: { found: false, read: false, home: false }`. `found` is the arrival at the twin.

### The streams

| Stream | Rolls |
|---|---|
| `seed + '\|twin'` | the cell of the twin |
| `seed + '\|kin'` | the kin of a rolled maker |
| `seed + '\|way-lore'` | the third log |
| `pseed + '\|twin'` | the place and the yaw of the twin on its patch, the tent, and the herd |
| FNV `'fate:' + seed`, `'form:' + seed` | the fate, and the form of an exotic world |

No existing stream draws one number more. The first log gains the key `years` on a world with a ruin,
which moves the lore column of the checksum.

## The third log as built

`way-lore.js` writes 7 to 10 entries, about 560 wordings. Every fate shares this shape:

- **Through.** The first entry picks up the end of the second log: `stay`, `wait`, `back` (one
  person went to the stones one more time), `note`, or `cut`, where it says which of the five cut
  sentences stopped the log and what that event was. It tells how the crew read the name, the same
  puzzle the reader solves: the stones sent the call sign back in their own marks, and the sixteen
  sounds filled the gaps. It gives the hour at the twin from the two longitudes, the noon sight of
  `{far}` kilometres, and the name that does nothing from this side.
- **The herd.** The land, the herd as it arrives, by the way the animal moves, and what the crew
  knew of the body. The kin takes the strongest wording: the second log was wrong by `{far}`
  kilometres.
- **The need of the herd**, one of twelve, by the world type: a dry seep or a den under sand on a
  desert world, the long night or an ice crust on an ice world, a rising sea on an ocean world, a
  breaking slope or a new flow on a lava world, a sickness of the young, a flood, the cold, the heat,
  and the dark stones of an exotic world. What the herd gives back follows the crew: food on an open
  world, warmth for a crew in cold suits, shade and a spring for a crew in hot suits, cool caves on
  a lava world.
- **The fate** then runs its own beats and its own last entry. The pact ends on a reversal: the
  herd saves the crew unasked. The long walk ends at a ridge of old cairns that the herd builds, the
  proof that this animal made the ruin, and nobody says it. The split keeps the words of the argument
  and a keepsake of the person who goes. The broken pact breaks through the help of the crew itself.
  The echo takes a young animal first, and the last entry falls apart into the sounds of the call.
  The change takes the voice of the log from "I" to "we", or into the den, or into the light.

`node tools/lore-audit/way-sample.mjs --check 300` lints every wording at the longest fill of each
token and sweeps every fate on every seed: 871 logs, every check passes. `--wide` runs every
species of each world, and a kin, as the herd: 2,284 logs.

## Where it sits

| Part | File | What it holds |
|---|---|---|
| The rules | `way-types.js` | the name, the call sign, the key, the send, the fates, the forms, the ends, the tent, the card of the twin |
| The twin | `generate.js`, `makeTwin()` and `finishTwin()` | the place, the herd, the kin, the fate, the third log |
| The kin | `species.js`, `rollKin()` | the herd of a rolled maker |
| The third log | `way-lore.js` | `WayLore.writeWayLog()` |
| The patch | `generate.js`, `patchRuin(…, 'twin')`, `twinCamp()`, `patchFauna()` | the stones, the tent on its pad, and the herd around the stones |
| The chapter | `chapters.js`, `carrier-store.js` | the way on, `arrive()`, `readLog()`, `goHome()`, the codex |
| The jump | `probe.js`, `jump()`; `app.js`, `stepJump()` | the flare, the white cover, the switch, the arrival |
| The ground | `ground-source.js`, `SourceRuin` and `flare()`; `wreck-geometry.js`, `twinCampGeometry()`; `ground-crew.js` | the twin, the beam and the points of light, the tent, the people |
| The page | `decoder.js`; `app.js`; `index.html` | the decoder, the card of the twin, the talk, the way home, the Way row |
| The globe | `carrier-globe.js` | the pin of the twin |
| The tools | `tools/way-check.mjs`, `tools/story-lab.html`, `tools/lore-audit/way-sample.mjs` | the checks, and the lab of the timelines |

## What the build changed

- **The twin stands in band 0 on every world.** Over 120 seeds of `way-check`, 101 worlds with a ruin
  took a twin, all in the first band, 2,280 to 13,490 km from the ruin: the band is in cells, and the
  planets run from 3,200 to 9,800 km.
- **The kin.** About 5 per cent of the worlds roll their maker. The kin is a walker of the limbs of the
  maker, at the size of the maker, and it always walks in a herd. It stands last in `world.species`
  with `kin: true`; the globe never places it, the niches of a patch skip it, and the sidebar lists it
  nowhere. `tools/ruin-check.mjs` reads the rule of the maker without it.
- **The checksum.** `world.twin` and the kin stay out of the facts, as `world.ruin` does, and the third
  log and the lore of the kin stand in the lore column. The baseline moved once, in the lore column of
  the ten world lines of the five worlds with a surface; every patch line stayed equal.
- **The card.** The row of the way on lost the chip "Coming soon". Its sentence reads "The probe reads
  a name here, in the script of the makers. The stones answer when the name is sent back." In chapter 3
  the page puts a longer sentence and the decoder under it, and after the arrival the name in letters.
- **The decoder** moves the focus to the next mark after each letter, filled or not, so a reader who
  types the whole name from the first mark puts each letter under its own glyph.
- **A landing on the twin by chance** while the chapter is open counts as the arrival when the reader
  opens the card of the twin, as the first open of a card is the find of a search.
- **The voice of the ruin** swells with the flare of the jump, through `setCarrierLevel()`.
- **The writer takes the form from `formOf(world)`** and not from `world.twin.form`, so the lab can ask
  for the change on a world whose own fate is another. It gives null for a fate the crew does not
  allow. The first log gains `years` on a world with a ruin, and the rescue line states it.
- **Open:** `tools/lore-audit/audit.mjs` does not sweep the pools of the third log yet; the lint of
  `way-sample.mjs` holds the same rules. A crew that stayed at the wreck (`went: 'none'`, about 40 per
  cent of the worlds) leaves no third log, and the twin then holds the herd alone.
- **The end of the story**, 2026-10-04. The read of the card of the twin ends the story, on a twin with a
  third log and on a twin with none. Before, a twin with no third log never took the read, and the
  objective said "Read the third log at the twin" for ever. The roll call of `way-types.js` is the last
  entry of the card of the twin: the end of each person of the crew of the wreck. After the end the
  Story window opens the card of each chapter again and offers the share. The way home follows the
  end of the story where a person lives at the twin.
- **The frame.** On HIGH at 1280 by 800, 60 renders at the twin of `audit-2` with the tent and two
  people shown and hidden in turn, six rounds: 6.00 ms against 5.94 ms, inside the noise.
