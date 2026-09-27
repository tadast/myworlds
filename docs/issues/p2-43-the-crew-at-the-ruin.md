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
