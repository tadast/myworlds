# p2-43 The crew went to the call, and the ruin holds no trace of them

Status: open.

Type: AFK, then a HITL read. Phase 2. Blocked by: p2-40, p2-42. Read `docs/source.md` whole, and
`docs/issues/p2-00-the-second-signal.md`, decisions 2 and 3.

## The defect

The last entry of p2-40 sends people toward the call: all of the crew, a part of it, or one person.
The reader follows the same call and finds the ruin, and the crew is not there. The story drops the
people at the moment the reader catches up with them.

## What to build

**The traces follow `log.went`, decision 3.**

| `went` | At the ruin | On the card |
|---|---|---|
| `all`, `some` | a camp: the dome, the flag, and the crates of `campParts()` in `wreck-geometry.js`, and the rover | the second log, 5 to 8 entries |
| `one` | a cairn of stones and a small case on top of it | one note, one entry |
| `none` | nothing | no crew section, and the reader is the first to stand there |

- The camp stands at the edge of the disc of the ruin, off the body, on the side the crew came from:
  the bearing from the ruin back to the wreck. `patchRuin()` of p2-41 gives it a place from its own
  stream, and keeps plants off it. `SourceRuin` draws it with the body.
- The camp takes the colours of the camp of the wreck, so the reader knows it at once.

**The second log**, `world.ruin.log`, written in `generate()` from `makeRng(seed + '|ruin-lore')`
and no other stream, after the log of the wreck. `source-lore.js` holds the writer, or a new
`ruin-lore.js` beside it that imports `lore.js`. It takes the shape of `world.source.log` and every
rule of `docs/source.md`.

- **The people** are the goers, and only the goers. The keeper of the second log is the first goer.
  When the keeper of the wreck did not go, the second log has a new keeper, and its first entry
  says so: "This is Suri. Bo kept the log at the ship. I keep this one."
- **The days** go on from the last day of the log of the wreck. The first entry is the arrival, on a
  day that the trip takes: the arc to the ruin over a speed of 40 km a day with the rover and 15 on
  foot.
- **The story** has three parts, as the first log does: the arrival at the ruin, three to six beats
  at the ruin, and an end. The beats are about the ruin and the people: what the crew sees of the
  proto, what the makers' carvings show, what the call does now that the crew stands at it, and the
  people themselves, with the traits of the first log. The proto, the maker, and the reply are
  facts the beats may read; gate each wording on them.
- **The call answers the crew**, decision 6. One beat of every second log states that the ruin sends
  the beacon of the crew back to them, slower. That is the motif of p2-44, so the ear and the log
  agree.
- **The end** is one of four kinds: the crew stays at the ruin, the crew starts back to the ship, the
  crew waits for the reader, or the entry stops, which takes the note of p2-37. It never states what
  the ruin is, and it never names another world: the way on belongs to the card.
- **One note** for `one`: a single entry of 2 to 5 sentences by that person, on the day of arrival.
- The voice rules hold in full. Nothing frightening in detail, sad is fine, and wonder is required.

**The card.** The crew slot of p2-42 shows the goers, one to a row, and the second log under the
rows, on the rail and the dots of the log of the wreck.

**The audit.** `tools/lore-audit/audit.mjs` sweeps the pools of the second log with the ten checks of
`docs/source.md`, and `--seeds 200` checks that the crew of every second log is the goers of the first,
that no person of `log.lost` appears, that the days rise from the last day of the first log, and that
a world with `went: 'none'` holds `world.ruin.log === null`.

**The checksum.** The second log is new text, so the hash of the log moves again. Move the baseline in
the same commit, and state that nothing but the log moved.

## Docs

- `docs/ruin.md`: the traces, the second log, its threads, and its checks.
- `docs/source.md`: a pointer to the second log, and the rule that it takes the goers.

## Acceptance criteria

- On a world of each value of `went`, the ruin shows the traces of the table and the card shows the
  crew section of the table. State the four seeds in the summary.
- `node tools/lore-audit/audit.mjs` and `--seeds 200` pass with the new checks.
- `node tools/world-checksum.mjs` shows that only the log hashes moved.
- **The HITL read.** Read the first log and the second log together on ten worlds, with at least two
  of each of `all`, `some`, and `one`. The second log must read as what happened to those people
  next. State in the summary what the read changed.

## What the build changed

Built on 2026-09-28, on main at d965fd2 and then rebased on 4578eab after the merge of p2-44. Every
deviation from the plan above, and the reason:

- **The writer is a new file, `ruin-lore.js`.** The plan allows it. It imports `lore.js` and the
  helpers and the traits of `source-lore.js`, which now exports `worldTokens()`, `beastTokens()`,
  `layDays()`, and `travelOf()`, so the two logs share one voice and one engine.
- **The log of the wreck carries two more keys on a world with a ruin: `by` and `traits`.** The
  second log has to know how the goers travelled and which trait each person carries. The call
  endings of p2-40 now carry `by` (`rover`, `foot`, `raft`, `ride`); a wording that states no way
  takes the raft on an island with a liquid sea and goes on foot elsewhere (`travelOf()`). Two walk
  wordings start in the rover and walk when the battery is flat, or spend its last charge; they go
  on foot, so the camp at the ruin holds no rover. No text of those endings changed.
- **The speeds of the raft and of the animal.** The plan gives the rover 40 km a day and a person
  on foot 15. The raft takes 30, a raft of packing foam that the crew paddles and lets drift, and
  the back of a big walker takes 25, an animal that stops to feed and to drink. The arrival is the
  last day of the log of the wreck plus the whole days the arc takes at that speed; over the audit
  seeds that is 15 to 221 turns, 60 at the median.
- **Four beats always run, so a second log holds 6 to 8 entries and not 5 to 8.** The plan asks
  for three to six beats about the ruin and the people, with one reply. The sight, the carvings, a
  person with a trait, and the reply always run, and up to two of the work, the door or the steps,
  the sky, the light, and a second person join them. A log with no person in it did not read as a
  log of these people.
- **The reply stands in every note too.** The plan asks it of every second log. The note of one
  person states it as well, so the ear and the page agree on every world that has a trace. Every
  note also names the case it lies in, which the cairn carries.
- **The camp.** The plan names the dome, the flag, the crates of `campParts()`, and the rover. The
  camp takes the shelter and the crates of the camp of the wreck, in its colours; the flag is new
  (the wreck has none); the rover stands only when the goers came in it; and the solar array and the
  tank of the fuel maker stay at the ship. `shelterParts()` and `crateParts()` in
  `wreck-geometry.js` now build both camps, and the wreck is byte-equal to main on all four hulls,
  with and without the camp. The camp stands at 0.8 and not 0.85, so it fits the band of 9.6 units
  between the flat disc and the soft edge of the spires and the floaters, with 1.72 units to spare.
- **The place is inside the soft edge, on a pad.** The plan says "at the edge of the disc, off the
  body". The camp stands 1 unit past the flat disc, where no part of the body touches the ground,
  and inside the disc with its soft edge, where the plants, the cover, and the herds keep off
  already, so `ground.js` needed no change. The soft edge slopes, so `ruinCamp()` lays a pad at the
  height of the floor under the camp, and the ground eases back over 3 units. The side is the way to
  the wreck in the box, `boxHeading()`, turned by one draw of up to 0.5 radians.
- **The cairn** is a pile of the loose stones of the ruin, in the stone of `ruinPalette()`, with the
  case in the orange of a hatch on top.
- **A tap on the camp marks the ruin.** The camp is a part of the find. The range still measures
  to the stones.
- **The end names no compass word for the way back.** The read found "the click comes from the
  north-east" at the ship and "we start back to the west" at the ruin. On a sphere that is true: the
  way back from the ruin is not the word opposite `{from}` when the arc runs near a pole. It reads
  as a fault, so the end says "the way we came" and `generate.js` passes no such word.
- **A person who stayed at the ship may stand in an end that goes back to that person,**
  `{stayer}`, and the keeper of the wreck stands in the first entry when the log has a new keeper,
  as the example of the plan has it. Neither is a person of the second log: its crew is the goers.
- **The food on the trip.** The read found a log of the wreck that closes on "There is food for two
  more days", and then a trip of 58 days. A log whose wreck ran the thread `crew.food` (8 of the
  107 traces over the audit seeds) now says in one sentence how the crew ate on the way: the seed
  store of the ship, or a plant a person can eat on a temperate world with liquid water.
- **The fix of `fauna.fly`.** "{one} put a lamp on the mast. {count} {kinds} came" printed "five
  flitters came" after a full stop. The wording is now one sentence. The audit fails any sentence
  after the first that opens on a token whose fill starts with a small letter, and the first
  sentence of an aside, a coda, and the plan of the landing, which join an entry with no capital.
  No other wording of the two logs broke the rule.
- **The card.** The crew section takes a label, "The crew at the ruin", the goers one to a row with
  the keeper marked "keeps this log" or, for one person, "left this note", and the entries on the
  rail and the dots of the log of the wreck. It takes classes of its own, `.cruin-goers` and
  `.cruin-log`, because the card of the ruin hides `.ccrew` and `.clog`. `SourceInspector` did not
  change, so the markup of an entry has a copy in `ruinCrewHtml()`.
- **The audit.** Pass 8 sweeps the pools of the second log over 3,960 skies, every proto of the
  type, every maker, and every story. The pools of the story and the pools of the ruin are swept
  apart, so the sweep does not walk the product of the two. The whole audit runs in about 90 s.

### The checks

- All nine checks pass: `world-checksum --check` against the new baseline, `carrier-check`,
  `carrier-fix-check`, `cell-grid-check`, `frame-check`, `ruin-geometry-check`, `ruin-check`, and
  the audit with and without `--seeds 200`.
- **The checksum.** Against the baseline of main, which had not moved since p2-40: 42 lines, 32
  equal (all 30 patch lines and both lines of Mire), and 10 world lines moved (Auralis, Vesper,
  Meridian, Tessaly, and Orin on both tiers), each in the last column only. The baseline moved by
  those 10 hashes in the same commit. The camp lives on the patch of the ruin only, which the
  checksum does not build; `tools/ruin-check.mjs` part 5 proves it.
- **A world with no ruin.** Every audit seed has a ruin, so the proof is by hand, as p2-40 did it:
  the writer of main and the writer of this build on the same 180 worlds with the ruin set to null.
  178 logs were byte-equal, and the other 2 differed only in the fixed sentence of `fauna.fly`.
- **`ruin-check`.** 420 worlds with a ruin: `none` 198, `some` 102, `all` 79, `one` 41, and the log
  null exactly on `none`. The patch check built 28 camps (6 with the rover) and 7 cairns: the
  nearest vertex of a body 0.57 units off a camp, 1.72 units inside the soft edge at the least, and
  at most 28.3 degrees off the way to the wreck; the pad flat and no plant or group on it.
- **The audit over 200 seeds.** 87 second logs, 20 notes, and 73 worlds with no trace. Entries per
  second log 6, 7, 8 (min, median, max). The ways: foot 46, rover 29, ride 19, raft 13. The ends:
  back and stay 25 each, wait 20, cut 17.

### The four worlds in the browser

On HIGH in the pane of the app, with `__mw.landAt()` on the cell of the ruin and `__mw.inspectRuin()`:

| `went` | Seed | The ruin | The card |
|---|---|---|---|
| `all` | `p243-1` (exotic, hive, on foot) | the camp, no rover, 316 triangles | five goers, Quentin keeps the log, 7 entries |
| `some` | `p243-13` (ice, spires, rover) | the camp with the rover, 704 triangles | two goers, Rhiannon keeps the log, 6 entries |
| `one` | `p243-18` (terran, colossus, on foot) | the cairn with the case, 312 triangles | Leo, "left this note", one note |
| `none` | `p243-12` (terran, dome) | nothing | no crew section; the slot is empty and hidden |

The door of the shelter faces the stones, the flag and the crates stand by it, and the pad sits
level with the floor while the ground behind it eases back to the hill. Over 8 rounds of 100
renders on `p243-13`, the scene takes 12.00 ms with the camp and 11.98 ms without it.
`renderer.info.memory` read 16 geometries and 2 textures after two recalls, before and after a
second landing. At 390 by 844 the card holds the page width, and the last entry ends 24 pixels
inside the scroll, clear of the fade.

### The read

Twelve worlds read whole, both logs together: `all` audit-6, 9, 20; `some` audit-0, 1, 2, 8; `one`
audit-5, 12, 13, 24. The read changed:

- the food on the trip for a crew that counted its food down, and the end with no compass word, as
  above;
- "the rest of us" out of the wordings a crew of two takes ("{one} said the name of {other} before
  I could"), "the click led us" out of the trip, and "said {who} is glad of it" out of the trait
  `unwilling`;
- the note of one person names the case in every wording;
- the busiest pools, the reply, the end, the first sight, and the carvings of a maker the crew
  never saw, took more wordings and a name, a day, or the name of the ruin in nearly every sentence,
  so the commonest sentence at the ruin fell from 14 to under 6 per cent of the traces;
- the dish of the rover, which stood over the rover as wide as the rover.

### Open

- **The log of the wreck makes promises that a long trip strains.** A strand thread may say "the
  food lasts 60 days", a second-hand ending sends one person on foot across a world at 675 °C, and
  a ride takes 42 turns on the back of a grazer at 700 °C. The second log states only the trip and,
  after `crew.food`, how the crew ate; the manager may gate those endings of p2-40.
- **`{world}` prints the designation**, for example "PXX-7022 d", in six wordings of the second
  log, most of them about the carvings; it reads stiff in a sentence, as it does in the first log.
