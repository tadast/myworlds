# Phase 2, the second signal: the report of the build

Status: all ten issues are built, merged into `main`, and pushed. One check still needs a person:
the listen test of p2-44. Date: 2026-09-28.

A manager agent ran the phase. It gave one issue to one subagent in a git worktree, reviewed each
report and diff, merged each branch into `main` with `--no-ff`, ran every check after each merge,
and did the checks of `p2-00` that need a person, except the listen test.

## What shipped

A world with a surface now holds two sources. The log of the wreck ends on a click that the radio
of the crew heard. The last entry states the band, the compass word, and what the crew did about
it. The reader types the band into the receiver. The search of issue 34 then runs again to a ruin
that the ancestors of a living species built. The ruin stands on its cell and blinks the motif of
the wreck played back, slower and lower. Its card states what the probe can read. When the crew
went to the call, the ruin holds their camp or their cairn, and the card holds their second log.

| Issue | Title | Merge |
|---|---|---|
| p2-35 | No second source stands on the world, so the log has nothing to point at | 668001c |
| p2-36 | The ruin has no body to draw | aa53ecf |
| p2-37 | A log that stops mid-sentence reads as a defect of the card | 6e5ba0d |
| p2-38 | The carrier can follow only the wreck | f47cf83 |
| p2-39 | The reader has nowhere to type the frequency | 149d202 |
| p2-40 | The log ends without a way forward | 5a95868 |
| p2-41 | A landing on the cell of the ruin shows empty ground | 291cdc5 |
| p2-42 | The ruin can be seen but not read, and a find leaves no mark | d965fd2 |
| p2-43 | The crew went to the call, and the ruin holds no trace of them | af255ae |
| p2-44 | The ruin is silent | ee666f5 |

New modules: `ruin-types.js`, `ruin-geometry.js`, `ruin-lore.js`, and `tuner.js`. New tools:
`tools/ruin-check.mjs`, `tools/ruin-geometry-check.mjs`, and `tools/ruin-lab.html`. The lab
replaced `tools/ruin-prototypes.html`, which stands in the history at e2a1744.

Commits of the manager on `main`, beside the merges:

| Commit | What |
|---|---|
| 62358bf | Chapter 2 takes no orange, so a wedge never looks like the mark of the next landing |
| 472bfa2 | After a find of the ruin by chance, the carrier follows the wreck until its find |
| 4578eab | The ruin keeps its voice in orbit after its find, whatever chapter runs |
| 4cacb2a | Nine issues of phase 2 are closed, with the checks of the manager |

Commits of the manager on the branches, from the HITL reads: abe27c5 on p2-40 ("The read of the
logs varies the lone walk, the walk out, and the island joke") and 080e1b9 on p2-43 ("The read of
the second logs varies the notes and the rafts, and feeds the lone goer").

## The waves and the pushes

| Wave | Issues | Pushed |
|---|---|---|
| 1 | p2-35, p2-37 (and p2-36 started early, as its issue allows) | yes, e2a1744..668001c |
| 2 | p2-36, p2-38, p2-40 | yes, 668001c..5a95868 |
| 3 | p2-39, p2-41, and the colour fix 62358bf | yes, 5a95868..291cdc5 |
| 4 | p2-42, p2-44, and the fixes 472bfa2 and 4578eab | yes, 291cdc5..4578eab |
| 5 | p2-43, the closures, and this report | yes, with this commit |

Every wave passed every check and the browser verification before its push. p2-43 started when its
two blockers had merged, while p2-44 still ran.

## The checks

The final run on `main` after the merge of p2-43, and again after this report:

| Check | Result |
|---|---|
| `node tools/world-checksum.mjs --check` | every hash matches the baseline |
| `node tools/carrier-check.mjs` | PASS, for the wreck and the ruin |
| `node tools/carrier-fix-check.mjs` | PASS, parts A to G |
| `node tools/cell-grid-check.mjs` | PASS |
| `node tools/frame-check.mjs` | PASS |
| `node tools/ruin-check.mjs` | every test passes, 500 seeds |
| `node tools/ruin-geometry-check.mjs` | every proto on every type, limb count, and maker size |
| `node tools/lore-audit/audit.mjs` | 0 issues in every pool, first log and second log |
| `node tools/lore-audit/audit.mjs --seeds 200` | 0 issues; `went` none 40, some 28, all 19, one 12 per cent |
| `tools/music-lab/check-motif.mjs` against `music.js` of 291cdc5 | all checks pass on 8 worlds |

The baseline of the checksum moved twice, in p2-40 and in p2-43. Both times the comparison with the
baseline before the change gave 42 lines: 32 equal, and 10 that moved in the last column of a world
line only (the lore). Every patch line stayed equal.

The music check is a local tool: `tools/music-lab/` is in `.gitignore`. The extended
`check-motif.mjs` is in that folder on this machine. Run it with
`MUSIC=<path to music.js> node tools/music-lab/check-motif.mjs <path to the baseline music.js>`.

## The checks that need a person, done by the manager

- **p2-36, the look of the protos.** The grid of all 20 pairs of a proto and a type, the colossus on
  0 and 6 limbs, the hive colony, and the mini hive, through the shot-sink. Accepted with no change.
- **p2-38 and p2-42, the length of the search.** Five worlds with two reader styles, then six worlds
  through the tuner to the card, with real landings through `__mw.landAt()`. The landings after the
  wreck: 3, 3, 3, 3, 3; 2, 3, 2, 3, 3; and 3, 2, 3, 3, 3, 3. The median is 3, inside the target of
  three or four. `RUIN_NEAR` and `RUIN_FAR` keep 12 and 35.
- **p2-40, the read of the logs.** 20 whole logs across every value of `went` and every ending kind.
  The read changed six wordings or gates; see the foot of the issue file.
- **p2-43, the read of the second logs.** 20 worlds with both logs: six of `all`, seven of `some`,
  and seven of `one`. The read changed the notes, the rafts, the food, one phrase, and the lone walk
  of the second hand; see the foot of the issue file.
- **p2-44, the music.** Every note of the ruin motif is the note of the wreck motif on the same step,
  one octave down, so it is in the mode and on the root of the song. The song and the wreck motif
  of all 8 worlds of the lab are byte-equal to the build before p2-44. **Nobody listened.**
- **The last run, end to end,** on audit-9 (exotic, floating stones, `all` by rover) and audit-14
  (lava, the deep well, `some` on an animal): the wreck and its log; the near miss ("A pattern under
  the static on 7.976 MHz.") and the lock; three landings to the ruin; the card with the way-on
  glyphs, the "Coming soon" chip, and the crew section with the second log; both mini models on the
  globe; and "Found 2 of 2". A render showed the camp at the edge of the well: the shelter with its
  door toward the stones, the crates, and the flag, and no plant on its pad.

## The creative and technical decisions of the manager

1. `world.ruin` stays out of the facts hash of the checksum, and `tools/ruin-check.mjs` proves the ruin.
2. p2-36 started early, from the table of p2-00, because its issue allows it and the geometry was
   the longest task. p2-43 started as soon as p2-40 and p2-42 had merged.
3. `RUIN_NEAR` and `RUIN_FAR` keep 12 and 35 after the play of the search.
4. The colour of chapter 2 keeps `MARK_APART` from `#ffb86b`, the mark of the next landing in the
   drawings of the brief. On one world the wedges of chapter 2 were the same orange as that mark.
5. A find of the ruin by chance tunes the world, as decision 12 says, but the receiver follows the
   wreck again until its find. Without that, the search of chapter 1 could not end.
6. The ruin keeps its voice in orbit after its find, in either chapter.
7. The read of p2-40 gave the lone goer two wordings in the rover, kept the lone walk and the walk of
   the whole crew off harsh worlds (`!harsh`), gave the lead `walk` two new wordings, kept the joke
   that walks off an island, added a wording for the lead `follow`, and fixed a first beat that named
   one person twice.
8. The read of p2-43 added three notes and a food note for each kind of keeper, made a hungry lone
   goer always say how that person ate, let `crew.cook` count as hunger, added two raft arrivals,
   changed "Close to," to "Up close,", and sent the second hand in the rover on a harsh world.
9. Accepted deviations of the agents that change what a reader sees: the range to the outline of the
   ruin (p2-41), the Call row in two sentences (p2-42), the ruin motif on bars 3 and 4 of 8 as an FM
   bell at `RUIN_LEVEL` 0.35 (p2-44), and the field of the card that does not take the focus (p2-39).
10. Models: p2-36 and p2-40 ran on Fable 5.1, the most capable model. After the owner asked for Opus
    5.5, every later agent ran on Opus 5.5.

## Open items for the owner

- **The listen test of p2-44.** With the sound on, on a terran, a desert, and an ice world
  (`p244-c`, `p244-k`, and `p244-j` work): does the motif of the ruin stand in tune with the song, and
  does it read as the motif of the wreck played back? The listen may change `RUIN_LEVEL`,
  `RUIN_VERB`, the bell envelope, or `RUIN_AT` in `music.js`.
- **A visible pane.** The browser pane stayed hidden for the whole build, so no check used real taps,
  real keys, or `requestAnimationFrame`. Frame time was measured as a loop of renders, and the ruin
  and the camp add no time that the noise does not hide. A person should try Enter in the tuner, the
  keyboard of a phone over the card, and the frame time at the reveal camera on HIGH.
- **A hidden pane makes the globe camera NaN.** In a pane of 0×0 pixels the globe camera took NaN
  after a landing, and the next landing lit the ground with NaN. With a real viewport, three landings
  in a row stayed sane. No reader has a viewport of 0×0, but a test tool that lands twice in a hidden
  pane must set a viewport size first.
- **A texture leaks after a recall from a low camera.** p2-41 found it on plain cells too, and on main
  before phase 2. Fixed after the phase: two textures stayed. The stack of the fine pattern stayed
  after the first landing, and on HIGH the shadow map of the sun stayed after every landing where
  the sun cast. `Ground.dispose()` now frees both.
- **Long trips in the first log.** A ride can last 42 turns at 700 °C, and a strand thread can promise
  food for many days while the trip takes more. The read fixed the worst cases (the lone walks, the
  hungry notes), and the rest stays.
- **`{world}` prints the designation**, such as "AUD-8350 Prime", in six wordings of the second log.
  It reads stiffly, as it does in the first log.
- **The colour of chapter 2 on an ice world** is often a saturated blue. It reads on the lit side, and
  it is thinner than the red of chapter 1.
- **The way on.** The glyphs on the card spell `portalSeed(world)`. A later issue opens that world.
