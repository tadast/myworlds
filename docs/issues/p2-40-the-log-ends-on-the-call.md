# p2-40 The log ends without a way forward

Status: open.

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
