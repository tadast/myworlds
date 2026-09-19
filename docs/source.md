# The log of the source: architecture

This document describes how myworlds writes the log of a source. Read it before you change
`source-lore.js`, the source parts of `worker.js`, or the source pass of `tools/lore-audit`.

Read `docs/fauna.md` and `docs/flora.md` first. The three systems share one engine, `lore.js`, and
the differences between them are the point of this file.

## What a source is

Issue 34 puts one source on every world with a surface. A source transmits, the probe reads a
bearing to it, and a landing in its cell shows it. The first kind of source is a wreck: an older
survey probe that came down, worked, failed, and stopped. The wreck holds a log of four entries.

The plan and the terms are in `docs/issues/34-the-carrier.md`. Use the words of that table:
carrier, source, bearing, fix, wedge, wreck, motif, log.

## Where the log sits

| Stage | File | Runs in | Output |
|---|---|---|---|
| 0. The lore engine | `lore.js` | Web Worker, page | `self.Lore`: tags, gated pools, story slots |
| 1. Place the source | `worker.js`, `makeSource()` | Web Worker | `world.source = { kind, dir }` |
| 2. Write the log | `source-lore.js` | Web Worker | `world.source.log` |
| 3. Show the log | slice 3 of issue 34 | Main thread | the card of the wreck |

`world.source.log` rides back with the world, as plain data:

```js
{
  probe: 'Tessera 5',          // the name of the old probe
  days: 142,                   // the day of the last entry, counted in turns of this planet
  species: 'Tendril whale',    // the animal the survey names, or null
  entries: [
    { slot: 'arrival', title: 'Arrival',    day: 1,   text: '…' },
    { slot: 'survey',  title: 'Survey',     day: 9,   text: '…' },
    { slot: 'trouble', title: 'Trouble',    day: 96,  text: '…' },
    { slot: 'last',    title: 'Last entry', day: 142, text: '…' },
  ],
}
```

The page must not show any of this before the reader finds the wreck. The log stands nowhere else
on the world: no other field of `world` holds the text.

## The one difference from the fauna and the flora

**An animal belongs to a world. A plant belongs to a patch. A log belongs to a find.**

`species.js` writes the lore of every animal in `generate()`. `flora-lore.js` writes the lore of
every plant in `patch()`. `source-lore.js` writes the log in `generate()`, because the log names a
species of the world and it reads the moons, the rings, and the activity of the world. It is the
last thing `generate()` writes, after `describeLife()` and after `makeStats()`, so every fact it
reads is settled.

## The stream

The log rolls from `makeRng(seed + '|source-lore')` and from no other stream. No existing stream
draws one number more, so no world built before this slice changes. `tools/world-checksum.mjs`
proves it: the hashes of `heightMap`, `flora`, and `fauna` must stay equal to the baseline file.

The place of the source, `world.source.dir`, comes from `makeRng(seed + '|source')`, which is a
different stream. The motif of the source takes a third one in `music.js`. The three never mix.

## The four slots

| Slot | Holds |
|---|---|
| `arrival` | how the probe came down, and on what ground |
| `survey` | what it found: one species of this world and one fact of that genome |
| `trouble` | what went wrong. It is always a real fact of the world |
| `last` | the last entry. It closes the log |

Every slot is core: the card shows four entries and the writer fills all four.

## The gates

Every line names the tags it needs and the tags it forbids, in the gate syntax of `lore.js`. A
line reads three tag sources at once:

| Source | Examples | Set by |
|---|---|---|
| the world | `frozen`, `crushgrav`, `longday`, `rainy`, `tides`, `volcanic`, `ringed` | `Lore.makeEnv()` |
| the axis | `upright`, `tilted`, `sidetilt`, `retrograde` | `sourceTags()` |
| the life | `beasts` | `sourceTags()` |

`Lore.makeEnv()` does not read the lean of the axis, so `sourceTags()` adds it. The lean the
climate feels is the smaller of the obliquity and its supplement: a world turned past 135 degrees
stands nearly upright again and turns the other way, as Venus does. The two limits, 54 degrees and
135 degrees, are the limits `makeStats()` states on the card of the world.

Three rules hold the text honest.

1. **The trouble is a fact of the world.** A gated trouble names a fault the world carries: the
   gravity, the cold, the heat, the length of the night, the lean of the axis and its polar night,
   the activity, a tide that a moon raises, the rain, or the sea. A trouble with no gate still
   names a fact, through a token that carries the real number of this planet: `{temp}`, `{grav}`,
   `{day}`, or `{night}`. The seven plain lines take a weight under 1, so a world with a named
   fault usually reports that fault.
2. **The survey names a real animal and a real fact of its genome.** Every survey line is gated
   on `beasts` or on `!beasts`. A line with an `if` reads the genome the way the fauna relations
   read it, so the log and the fauna card cannot contradict each other. A world with no species
   gets the `!beasts` lines, which report the absence and claim nothing more.
3. **A line that names the animal is gated on `beasts`.** The writer fills the animal tokens only
   when the world really carries a species, and the audit holds every such line to that gate.

The star of a world is **not** available here. `rollStar()` lives in `star.js`, which is a module
of the main thread, and `app.js` puts `world.star` on the world after the worker replies. A
`?star=` parameter can also force it. So no line of the log names a pulsar or a giant star. The
plan of issue 34 lists those two as troubles; they need the star in the worker first.

## The tokens

`TOKENS` in `source-lore.js` lists every token a line may use, and `tools/lore-audit` reads that
list. `BEAST_TOKENS` lists the ones that name the animal.

| Token | Holds |
|---|---|
| `{world}` | the designation of the planet |
| `{probe}` | the name of the old probe |
| `{lat}` | the latitude of the source, in words |
| `{day}`, `{night}` | the turn of the planet, and half of it |
| `{temp}`, `{grav}`, `{tilt}` | the temperature, the gravity, and the lean of the axis |
| `{days}` | the day of this entry |
| `{moon}`, `{moons}` | the first moon, and the count of them |
| `{plant}`, `{plants}` | the plant word of this world |
| `{other}`, `{Other}`, `{others}`, `{Others}` | the animal the survey names |
| `{size}`, `{n}`, `{diet}` | the size text, the group count, and the diet of that animal |

`{size}` and `{diet}` come straight off `G.lore`, so the log states the numbers the fauna card
states.

## The day count

The days are turns of this planet, counted from the landing. The arrival is day 1, and `DAY_GAP`
sets the three gaps that follow. The gaps rise, so the log reads as a mission and not as one week.
The card shows `days`, the day of the last entry.

## The voice

The log is the record of an older survey probe, or of its crew of machines. It is terse, it is in
the first person plural or in the voice of an instrument, and the last entry ends the story without
melodrama. The prose is normal literary English, because it is quoted material, as the species
lore is. Comments and documents stay in Simplified Technical English.

Do not name a place of the Earth or a species of the Earth. `PROBE_NAME` holds plain English nouns
and a mark number, and it must stay that way. `docs/flora.md` states the same rule for the plants.

## The audit

`node tools/lore-audit/audit.mjs` sweeps the four slots. The source pass runs five checks:

1. **Coverage.** No slot is empty, for any world the source can stand on and for any animal.
2. **Reachability**, in two halves. A line may carry a gate on the world and a test on the genome
   at once, and the two are independent, so the sweep asks them separately: one world in the sweep
   must pass the gate, and one genome shape must pass the test.
3. **The lexicon.** A word that claims a fact may only appear where the world has that fact. Issue
   34 adds five rules: `aurora` needs `auroral`, `geyser` needs `geysers`, `lightning` needs
   `stormy`, `polar night` needs `tilted`, and `the ring overhead` needs `ringed`.
4. **The tokens.** A line may only use a token the writer fills, and a line that names the animal
   must be gated on `beasts`.
5. **Variety.** Every slot needs at least six lines that fit any world it can reach, and every
   fault of the trouble needs at least two lines.

Two facts of the sweep live in the audit:

- `SOURCE_SKY_TAGS` collapses the 11,616 worlds to the skies a source gate can tell apart, the way
  `FLORA_SKY_TAGS` does for the plants. A new gate on a new tag widens the sweep on its own.
- `SOURCE_TILT` holds six leans, one per class `rollAxis()` draws: damped, ordered, tipped, and
  turned. The sweep runs every world through all six, and through both states of `beasts`.

`node tools/lore-audit/audit.mjs --seeds 40` runs real worlds through `generate()`. It reads the
log of every source and checks that the four slots are there in order, that no entry is empty, that
no token is left unfilled, that no entry claims a fact the world does not have, and that the
species the survey names is a species of that world.

## A tool that loads the worker by hand

`tools/world-checksum.mjs` evaluates `worker.js` in Node without `source-lore.js`. `generate()`
therefore tests `self.SourceLore` before it writes the log, and that tool gets a source with no
log. This is on purpose: the tool measures the terrain, the flora, and the fauna, and nothing in
the worker reads the log back. A tool that needs the log must require `source-lore.js`, as
`tools/lore-audit/audit.mjs` does.
