# p2-40 The log ends without a way forward

Status: CLOSED, 2026-09-28. Merge commit 5a95868.

Type: AFK, then a HITL read. Phase 2. Blocked by: p2-35, and p2-37 for the note under a cut. Read
`docs/source.md` whole before a line of this issue, then `docs/issues/p2-00-the-second-signal.md`,
decisions 1, 2, 6, and 10.

## The defect

The log of the wreck is a closed story. Its last entry faces a doom, rides an animal, walks to the
supply drop, or tells a joke, and then nothing follows. Phase 2 needs every log of a world with a
ruin to end on the call: the band the crew heard, the direction it comes from, and what the crew
does about it. The reader must meet the call before the end, so the ending pays off a thread and
does not drop a number out of the sky.

## What to build

All of it in `source-lore.js`, with the rules of `docs/source.md`: the voice, the gates, the
tokens, the subject rule, and no pronoun for a member of the crew.

### The call thread

A fifth kind of thread, `call`, in `CALL_THREADS`. `writeLog()` takes exactly one on every world
with a ruin, as it takes one strand thread, and never trims it under three beats. A world with no
ruin takes none. The thread rises by force like every thread, so its beats interleave with the rest.

- It holds 3 to 5 beats, and every beat three wordings or more. The busiest beats take five.
- **The number of the band never prints in the thread.** The last entry is the one place it
  prints. A beat may name "the band", "a band that is not on the plan", or "the click", and nothing
  more exact.
- **The reply, decision 6.** One beat states that the click began on day `{beacon}`, the day the
  crew put the beacon on the mast, and that the two days are one day. `{beacon}` is a new token: a
  day rolled after `layDays()`, from 2 to 6, and always before the day of the first beat of the call
  thread. The beat that states it must fall after that day, which it does, because the days rise.
- The first beat may not look back, as the rule of `docs/source.md` states for every thread.
- The job of the radio is the natural subject, but a crew may hold no radio role. The thread takes
  `{one}` and `{two}` as every thread does, and a wording names the job only as "our {onejob}".
- The thread carries a lead, `leadcall`, and no ending may run without it on a world with a ruin.
- The direction, `{from}`, may appear in the last beat of the thread and in the ending, and nowhere
  else. It prints the compass word of `world.ruin.from`.

Sample wordings, to set the voice. They are samples and not the pool.

> Tamsin hears a click under the static at night. It comes every eleven seconds. Tamsin logged it
> as a fault in the radio.
>
> The click is back, on the same eleven seconds. Tamsin swapped the radio for the spare. The spare
> hears it too.
>
> Tamsin checked the click against the band plan. Nothing we brought sends on that band.
>
> The click started on day 3. That is the day we put the beacon on the mast.
>
> Tamsin walked the aerial round the mast all night. The click is loudest from the north-east.

### The endings

Every one of the 12 kinds gets a pool of **call wordings**, three or more per kind, and every call
wording prints `{freq}` once. On a world with a ruin the writer takes the ending from the call
wordings only. On a world with no ruin it takes the wordings of today, which stay as they are. A
call wording carries the outcome of decision 2 and the people who go:

```js
{ kind: 'split', went: 'some', goers: ['one', 'two'], tags: '...', t: '...' }
```

`went` is `'all'`, `'some'`, `'one'`, or `'none'`. `goers` names the roles of the wording, `keeper`,
`one`, or `two`; `'all'` takes every person still here and needs no list. `writeLog()` writes
`log.went` and `log.goers`, the names of those people, from the wording it took.

| Kind | Outcome | What the call wording does |
|---|---|---|
| `walk` | all | the whole crew walks or drives toward the call, with the rover and the spare radio |
| `split` | some, one | a part goes toward the call and a part stays with the beacon; or one person goes alone |
| `ride`, `catch`, `follow` | some | the reckless plan points at the call: the animal walks or flies that way. Gated on the motion tags as today |
| `doom` | none | the crew cannot reach it, points the dish at it, and hands the band to the reader |
| `message` | none | "Whoever finds this:" and the band, and the direction |
| `second` | one, none | the second hand writes the band that the keeper wrote on the hatch, and goes, or cannot |
| `cut` | none | the entry stops after the number. p2-37 prints the note under it |
| `stay` | none | the crew stays and makes a life, and leaves the call to whoever comes |
| `launch` | none | the crew climbs on the patched line and leaves the band behind for the reader |
| `joke` | all | the last joke is about the call, and then the crew goes to look |

The leads of the threads pick the kind as they pick it now. A quarrel still gives a split, a hurt
keeper still gives the second hand, and a harsh world still gives the calm doom. So the spread of the
outcomes follows the spread of the kinds, and no outcome needs a weight of its own.

Samples, to set the voice:

> We leave at first light, all four of us, with the rover and the spare radio. The click is on
> 7.316 MHz, and it comes from the north-east. If you hear it too, come after us.
>
> Suri and Tamsin go after the click in the morning, with the rover. It is on 7.316 MHz. I stay
> with the beacon, so one of our two signals stays on the air.
>
> We cannot reach it. The click is on 7.316 MHz and it comes from the north-east. We have listened to
> it for nine days. You have a probe. Go and see what sends it.
>
> Tamsin has the click on the speaker. 7.316 MHz. It answers our beacon, click for click. I am going
> up to the mast to

### The tokens

`{freq}` prints `7.316 MHz`: `world.ruin.freq` and the unit. `{from}` prints the compass word.
`{beacon}` prints a day. Add all three to `TOKENS`, and to `WORST` in the audit with their longest
fill: `29.999 MHz`, `north-west`, and `6`.

### The audit

`tools/lore-audit/audit.mjs` gains these checks. Add them to the list of ten in `docs/source.md`.

1. **The band prints once.** On every world with a ruin, the last entry holds `world.ruin.freq`
   with its unit exactly once, and no other entry holds any number of MHz. On a world with no ruin,
   no entry holds one. A pool check fails any thread wording and any aside that holds `{freq}`.
2. **The call ran.** Every log of a world with a ruin holds exactly one call thread, run to at least
   three beats, and its ending is a call wording.
3. **The reply holds.** The beat that prints `{beacon}` falls on a later day than `{beacon}`, and
   `{beacon}` falls before the first beat of the call thread.
4. **The goers are real.** `log.went` is one of the four values. The goers are people of the crew
   who are still here on the last day: no one in `log.lost`. `all` holds every person still here,
   `one` holds one, `some` holds two or more and not all, and `none` holds nobody.
5. **The direction is true.** `{from}` prints `compass8()` of the bearing from the wreck to the ruin,
   and it appears only in the last beat of the call thread and in the ending.
6. **Variety.** Three wordings per beat of the call, three call wordings per ending kind, each value
   of `went` reachable, and the spread of `went` over 200 worlds in the report. No value may pass
   half of the logs.

### The checksum

The hash of the log changes on every world with a ruin, on purpose. Run
`node tools/world-checksum.mjs` before the change and after it: every hash that is not the hash of
the log must stay equal. Then write the new baseline in the same commit, and state in the summary
that only the log hashes moved and how many.

## Docs

- `docs/source.md`: the call thread, the call wordings, `went` and `goers`, the three tokens, and the
  new checks. Update "The shape of a log" and "The ending".
- `docs/issues/README.md`, "The carrier": the fields of the log.

## Acceptance criteria

- `node tools/lore-audit/audit.mjs` and `node tools/lore-audit/audit.mjs --seeds 200` pass, with the
  new checks.
- `node tools/world-checksum.mjs` shows that only the log hashes moved, and the new baseline is in the
  commit.
- The report of 200 worlds states the spread of `went` and of the call wordings, and the share of
  logs that hold the commonest sentence of the call stays under 8 per cent.
- **The HITL read.** Read 20 whole logs with `node tools/lore-audit/log-sample.mjs`: at least three of
  each value of `went`, one of each ending kind, and two worlds with no ruin. The call must rise,
  and the ending must read as the end of that thread. State in the summary what the read changed.

## What the build changed

The build follows the plan, with these deviations and additions.

1. **The trim of the call thread keeps its last beat.** The plan trims the call thread to three
   beats like every thread, and puts `{from}` in its last beat. A thread that runs a prefix loses
   that beat under the trim, and most logs trim it: a log with a fauna thread stands at 16 beats
   before the call, under a cap of 18. So `callBeats()` in `source-lore.js` drops the middle beats
   of a call thread and keeps the beats up to the reply beat and the last one. Every call thread
   therefore holds five beats in one order: heard, the reply, not a fault, not on the plan, the
   direction. A thread of three beats reads heard, reply, direction. The reply beat is always beat
   1, so a trim to three keeps it, and the audit holds every thread to that order. The thread
   earns its lead `call` always, because its last beat always runs.
2. **The first beat of the call never stands first after the landing.** The plan rolls `{beacon}`
   from 2 to 6 and before the first beat of the call thread. The entry after the landing can be day
   2, so no such day exists when the call stands first. When the sort by force puts it first, it
   changes places with the beat after it. That beat is the first beat of another thread, because
   the jitter is smaller than the step between two beats of one thread, so no thread runs out of
   order. `{beacon}` is then `2 + floor(rng() * min(5, firstCall - 2))`, which is 2 to 6 and under
   the first call beat. No number is drawn for the swap.
3. **`log.beacon`.** The plan names `went` and `goers` as the fields of the log. The audit has to
   find the reply beat, so the log also carries `beacon`, the day the crew put the beacon on the
   mast. A world with no ruin carries none of the three keys, so its log object does not move.
4. **Three call threads, six wordings in the beats that always run.** The plan asks for three
   wordings per beat and five in the busiest. One call thread runs per log, so with 180 logs a
   sentence with no token in it stands in 180 / (threads × wordings) logs. Five wordings over three
   threads put the commonest sentence of the call at 10 per cent. The beats that always run, 0, 1,
   and 4, carry six wordings each, and nearly every sentence of them carries a name or a day, so
   the commonest sentence of the call over the audit seeds is 7.8 per cent (14/180). The audit
   gives the call a floor of three threads in place of six, and reports the commonest sentence of
   the call on its own.
5. **The weights of the call endings.** The plan says no outcome needs a weight of its own. The
   spread of today's kinds gives `none` 53 per cent, past half, because the doom, the cut, the
   message, the stay, the launch, and half of the second hand all send nobody. The call wordings
   take weights near the ones of today (`cut` 1.2, `joke` 1.2, `walk` 1.2 and 3.5 on `leadwalk`,
   the ungated doom 1.5) so that the spread over the audit seeds is `none` 43, `some` 28, `all`
   22, and `one` 6 per cent, and the ending kinds keep the doom on top: doom 24, joke 23, ride 19,
   launch 18, walk 17, cut 17, follow 16, split 14, catch 10, stay 8, second 7, message 7 of 180.
6. **An island takes the raft.** A walk or a drive toward the click over 900 kilometres of sea is
   false, so the walking and driving wordings of `walk` and `split` are gated `!mostlysea`, and one
   wording of each takes the raft the coast thread built, gated `mostlysea waterliquid`. The `walk`
   endings of today are ungated, and they stay so.
7. **The entry count.** A log of a world with a ruin now holds 18 to 20 entries (min 18, median
   18, max 20 over the audit seeds; 15, 16, 20 before). The call adds 3 to 5 beats to logs that
   already stood near the cap of 20, and the cap holds. `docs/source.md` says so. With every world
   of the sweep carrying beasts, a second crew thread now fits only when the log has no room for
   it, so most logs with a ruin run one crew thread.
8. **The checks.** `tools/lore-audit/audit.mjs` gains the checks of the plan and three more: every
   call thread holds five beats in the fixed order and states no number of MHz; the compass word is
   computed again from `cell-grid.js` and compared with `world.ruin.from`; and no value of `went`
   may pass half of the logs with a ruin, which fails the run. `tools/lore-audit/log-sample.mjs`
   filters on `went.<value>`, `ruin`, and `noruin`, and prints `went`, the goers, and the beacon
   day in the header.
9. **No audit seed lacks a ruin.** All 180 logs of the 200 audit seeds have a ruin, so the case of
   a world with no ruin was proved by hand: `SourceLore.writeLog` wrapped on the shared module
   object to pass `{ ...world, ruin: null }` to the real writer, over the same 200 seeds, against
   the logs of `main`. 180 of 180 logs were byte-equal; with the ruin kept, 180 of 180 differed.
10. **The checksum.** `node tools/world-checksum.mjs` before and after: 42 lines, 32 equal, 10
    moved in the last column of a world line only (Auralis, Vesper, Meridian, Tessaly, and Orin on
    both tiers), 0 moved elsewhere, and every patch line equal. Mire, the gas giant, did not move.
    The baseline moved by those 10 hashes in the same commit.
11. **The read.** 20 logs read whole: audit-0, 1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 15, 18, 20, 21, 30,
    49, and 52 (three or more of every value of `went`, one of every ending kind) and audit-3 and
    audit-4 with the ruin forced to null, which are the logs of main. The read changed one wording
    of `split`, "one person can walk it", to "one person can make the walk". The three commonest
    sentences over the 200 worlds are lines of `SOUND_LANDING`, at 8.9, 8.9, and 8.3 per cent; that
    pool is the text of today and the issue leaves it alone. On main the commonest sentence was
    "The plan is simple." of the same pool, at 8.3 per cent.
12. **The docs.** `docs/source.md` gains "The call" and "The call endings", the five thread kinds,
    the three tokens, the two extra draws of the stream, the checks 11 and 12, and the proof by
    hand. `docs/issues/README.md` states the fields of the log as they are, not as the first build
    had them. `README.md` "How it works" gets two sentences.
13. **The read of the manager, 2026-09-28.** The manager read 20 more logs whole: audit-0, 1, 3, 5,
    6, 7, 8, 11, 12, 13, 15, 18, 20, 21, 28, 30, 45, 49, 52, and 70. That is five of `all`, five of
    `some`, four of `one`, six of `none`, and every ending kind. The call rises in every log, and
    every ending reads as the end of that thread. The read changed these wordings:
    - Three of the four logs of `one` printed one wording: "leaves at dawn for the {from}, alone,
      on foot". Two new `split` wordings of `one` go in the rover, and the wording on foot is now
      `!harsh`, so nobody walks alone at 807 °C. The share of `one` rose from 6 to 11 per cent.
    - Two of the three logs of `all` with the lead `walk` printed the same wording. Two new
      wordings of `walk` take the lead: one in the rover, one on a route drawn on the wall map. The
      wording on foot is now `!harsh`.
    - The joke "all of us walk toward the {from}" is now `!mostlysea`, and the island takes a new
      joke with the raft.
    - A new `follow` wording takes the lead `follow`, because two of two logs with that lead printed
      "The rover cannot make the trip back".
    - The first beat of the thread `click` named the same person twice and mixed the tenses. It now
      reads "{one} heard a click … Our {onejob} logged it as a fault in the radio."
    - The split of the lead `split` read "walk toward the click at first light, on {freq}, to the
      {from}". The band now takes a sentence of its own.
    After the read: the audit passes, `--seeds 200` gives `went` none 41, some 29, all 19, and one
    11 per cent, and the commonest sentence of the call stays at 7.8 per cent. The checksum moved the
    same 10 log hashes against main and nothing else, and the baseline holds the new values.
