# The log of the source: architecture

This document describes how myworlds writes the log of a source. Read it before you change
`source-lore.js`, the source parts of `worker.js`, or the source pass of `tools/lore-audit`.

Read `docs/fauna.md` and `docs/flora.md` first. The three systems share one engine, `lore.js`, and
the differences between them are the point of this file.

## What a source is

Issue 34 puts one source on every world with a surface. A source transmits, the probe reads a
bearing to it, and a landing in its cell shows it. The first kind of source is a wreck: a small
crewed survey ship that came down, worked, failed, and stopped. The wreck holds the log of that
crew.

The plan and the terms are in `docs/issues/34-the-carrier.md`. Use the words of that table:
carrier, source, bearing, fix, wedge, wreck, motif, log.

**The carrier does not reach the far side of the world.** `CARRIER_REACH` in `site.js` is a third of
the circumference, and `carrierAt()` gives null past it. A landing past the reach shows no carrier
block, stores no fix, and draws no wedge, and the reader who hears nothing learns a fact too. The
log does not read that bound: a source stands where `makeSource()` put it, whoever can hear it.

## Where the log sits

| Stage | File | Runs in | Output |
|---|---|---|---|
| 0. The lore engine | `lore.js` | Web Worker, page | `self.Lore`: tags, gated pools, weights |
| 1. Place the source | `worker.js`, `makeSource()` | Web Worker | `world.source = { kind, dir }` |
| 2. Write the log | `source-lore.js` | Web Worker | `world.source.log` |
| 3. Show the log | `ground-source.js`, `SourceInspector` | Main thread | the card of the wreck |

`world.source.log` rides back with the world, as plain data:

```js
{
  probe: 'Lantern 10',                  // the name of the ship
  days: 179,                            // the day of the last entry, in turns of this planet
  species: 'Rime beaked strider',       // the animal the log names, or null
  keeper: 'Bo',                         // the person who writes the log
  crew: [{ name: 'Bo', role: 'navigator' }, ...],     // 3 to 5 people, one role each
  lost: { name: 'Suri', how: 'gone', day: 173 },      // the person a thread took out, or null
  entries: [
    { slot: 'landing',        title: 'Landing',    day: 1,   text: '…' },
    { slot: 'world.cold',     title: '',           day: 12,  text: '…' },
    { slot: 'fauna.walkbig',  title: '',           day: 32,  text: '…' },
    …
    { slot: 'end.ride',       title: 'Last entry', day: 179, text: '…' },
  ],
}
```

A log holds 8 to 20 entries. `slot` names the thread the entry came from, or the act: `landing`
for the first entry and `end.<kind>` for the last one. A middle entry carries no title, and the
card then shows the day alone. `lost` is the one field the card does not read; the audit reads it,
to prove that no entry after that day names that person.

The page must not show any of this before the reader finds the wreck. The log stands nowhere else
on the world: no other field of `world` holds the text.

After the find the globe carries a mini model of the wreck at the source, and the wedges of the
search are gone. `carrier-globe.js` builds that model from `wreckGeometry()` of `ground-source.js`,
so the wreck of the patch and the wreck of the globe come from one builder.

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

## The shape of a log

A log is a story, and it has three parts.

| Part | Entries | Holds |
|---|---|---|
| The landing | 1 | how the ship came down, and one real fact of this world |
| The beats | 6 to 18 | the threads, interleaved, rising in force |
| The ending | 1 | the last entry. Its kind follows what the threads did |

### A thread, a beat, a wording

A thread is an ordered list of 3 to 6 beats that intensify. **A beat is a list of three wordings
or more**, and the writer takes one of them. That is what keeps two wrecks from reading alike: the
busiest beats carry five or six wordings, and a wording is a different small event with a different
detail, not the same sentence with one word changed. The audit fails a beat under three wordings.

`writeLog()` takes one world thread, one or two crew threads, and the fauna thread when the world
carries beasts. There are three kinds.

| Kind | Gate | Holds |
|---|---|---|
| `world` | tags, and a **salience** | a real fact of the world |
| `crew` | none | the people. It also carries a **coda** and a **lead** |
| `fauna` | `beasts` and a **motion tag** | the one species the log names |

A thread may run a prefix of its beats, never fewer than three, so a short log is a shorter subplot
and not a cut one. The trim takes one beat at a time off whichever thread is longest. It used to
shorten from the back, which always cut the crew threads, because they are chosen last, and the
ending then stopped following them. A thread that retires a person is never shortened, because the
beat that takes the person out is its last.

### Salience: the world thread is the loudest true fact

Every world thread carries `sal(env)`, which reads the numbers of the planet and returns roughly 0
for a fact a crew would barely mention and 3 or more for one that decides the mission. The weight
is `(0.15 + sal)` cubed, so the loudest fact wins nearly every time and the quieter facts still
come up.

```
cold        (5 - tempC) / 25          at -72 °C this is 3.1, and nothing on that world beats it
heat        (tempC - 32) / 30         at 437 °C it is 13
heavy       (gravity - 1.35) / 0.45
longnight   (dayHours - 36) / 22
sea         (1 - land) * 1.7          an ocean world talks about the ocean
volcano     2.1, geysers 1.9, storms 2.0, polarnight 2.7, dry 2.3
mild        0.35, evenday 0.3, moon 0.5
```

**A mild thread is for a mild world only.** An easy day and a pleasant sea sit near 0.3, so they
only win where nothing is loud. Before this rule a world of -72 °C opened on "the day is near
enough to home that we sleep", which is true and is not what that crew would write about.

### The land is five different facts

`hasocean` alone does not say that a crew can walk to the water, and on a lava world it is not
water at all. The five land threads partition the whole grid, so no log ever walks east to a sea
that is not there.

| Thread | Gate | The fact |
|---|---|---|
| `coast` | `mostlysea waterliquid` | the wreck stands on an island. The water line is a walk away |
| `sea` | `hasocean waterliquid !mostlyland !lava !ice` | an ocean world. The wind and the salt reach the site |
| `lavasea` | `hasocean lava` | the sea is molten rock. Nobody walks to it and nobody drinks it |
| `icesea` | `hasocean ice` | the sea is a solid plain, and the crew drives a sledge on it |
| `inland` | `mostlyland !dryworld` | there is water on this world and none of it is here |
| `dry` | `dryworld` | no sea at all. The tank is the whole supply |

A line that names a direction and a distance to the water sits under `mostlysea`, where the claim
is safe. Everywhere else the text says that the sea is on the map and says no more.

### How the animal moves

This is the rule the first build did not have, and a 40 metre whale of the air stood at the foot of
a mast. `motionOf(G)` reads `G.cls`, `G.loco`, and `G.plan` and returns one tag. Every fauna thread
and every reckless ending is gated on it.

| Tag | Genome | What the log may say |
|---|---|---|
| `mwalk` | land: monopod, biped, tripod, quad, hexapod | it walks a road past the mast, a person walks beside it, a flank, a back, a ride |
| `mcrawl` | serpent | no legs. One clean line in the dust, a coil, the warm plate |
| `mroll` | roller | it folds into its own hull and throws itself. It never walks |
| `mflow` | flow | it holds no shape. It pours down a slope and gathers at the foot |
| `msling` | slinger | a cord thrown at the standing growth, and a swing off the hold |
| `mfly` | wings | it flies, it circles, it lands when it chooses, it comes to a lamp |
| `mswarm` | wings, plan swarm | a wheel of shards, and no single body to name |
| `mdrift` | sac | a bladder of warm gas. It never lands. The wind decides |
| `mcruise` | fins | a whale of the air. It cruises, it dips, it sings, it never comes down |
| `mdig` | plough | it travels a hand deep and pushes a mound. A raised line across the circle |
| `manchor` | arch, periscope | it does not travel. The body stays under the ground |

**There is no swimmer.** `LOCO` in `species.js` has no aquatic class: `fins` is `cls: 'air'`, and
the `sea` niche reads "Open ocean air". A "sea whale" of this generator swims through air over the
water, so it takes `mcruise` and never a boat. A reckless ending therefore rides a walker, takes a
line from a flyer, walks under a cruiser, digs beside a burrower, or sits out a turn beside an
anchored one. It never rows out to anything.

`MOTION_LEXICON` in the audit fails a fauna line that claims a movement the body does not make. It
is **subject scoped**: a fauna entry carries the crew as well as the animal, and the crew walks and
stands on any world, so the rules only fire when the animal is the subject.

### The name a crew gives one animal

A fauna thread has one naming beat, and **every wording of that beat gives the name**. Before that
rule one wording in three introduced `{pet}` and the others used it, so a log could print a name
the reader had never met. The audit finds the first beat any wording of which holds `{pet}` and
fails any wording of it that does not name the animal, and any earlier wording that uses `{pet}`.

### Every entry stands on its own subject

The threads are interleaved, so an entry never follows the entry before it in its own thread. The
reader meets each entry cold, a month of log after the last time that thread spoke. **The first
reference to a subject inside an entry must therefore be a noun or a name, and never a pronoun.**
For the animal that means a naming token, `{Other}`, `{Others}`, `{kind}`, `{kinds}`, or `{pet}`
once the naming beat has run; for a person, the name or the job; for a thing, the noun. After the
first mention inside the same entry, "it" and "they" are free. A phrase that stands in for a
pronoun is the same defect: "one of them", "the big ones", "a second one", "the band", "the wheel",
and a bare "one" in "a hand on the back of one" all leave the reader with no subject. The
impersonal "it" is fine, because it stands for nothing: "It is colder.", "It rained for six hours."
The audit enforces both halves, with a tight list of impersonal openings that a writer must extend
by hand.

### How the beats interleave

Every beat carries the force of its place in its thread: beat `i` of `n` takes `(i + 1) / n`, plus
a small jitter. `writeLog()` sorts every beat of every thread by that force. So the whole log rises
from the landing to the ending, and a thread never runs out of order, because the jitter is smaller
than the step between two beats of one thread.

### The days

The days are turns of this planet, counted from the landing. The landing is day 1. `layDays()` lays
the gaps on a hump: short at the start, widest in the middle of the mission, short again at the
end. The last days of the story therefore crowd together, which a reader feels as speed. Every day
is a whole number and the days rise strictly. The card shows `days`, the day of the last entry.

A mission runs from 42 to 240 turns, so no beat may claim a span longer than the shortest mission.
The audit fails "a hundred days", "a year", and the rest, because a log of 65 days would otherwise
state that it had heard nothing for a hundred.

### The crew

`rollCrew()` draws 3 to 5 people from `NAMES`, which holds 74 short given names from many
languages. A log never gives a surname. Each person takes one role from `ROLES`, and a pilot is
always aboard. The first name on the list is the keeper, who writes the log as "I" and "we". The
other people are the cast of the threads: `{one}` and `{two}` inside a thread always name the same
two people, and `{onejob}` and `{twojob}` are their jobs.

**No pronoun stands for a member of the crew.** The log says the name, or the job: "{one}", "the
{onejob}", "our {twojob}". A pronoun would need a gender, and the names come from many languages,
so the log would have to invent one for every name. Naming the job is also what keeps three
sentences in a row from reading "Gil. Gil. Gil.": a wording alternates between the two.

**A dead or absent person never acts again.** A thread that retires a person carries `retires`, and
the beat that does it carries `out`. `writeLog()` gives that thread a person of its own, so no
other thread and no ending can name that person. A log takes at most one retiring thread, and only
when the crew holds three people besides the keeper.

### The ending

`ENDINGS` holds 12 kinds, and every kind holds three wordings or more.

| Kind | Holds |
|---|---|
| `doom` | the known doom, faced calmly: the power, the air, the food, the cold, the heat, the night |
| `ride` | the reckless plan: ride the animal. `mwalk` and 3 metres or more |
| `catch` | the reckless plan: take hold of one. `mwalk` under 3 metres, or `mdig`, `manchor`, `mcrawl`, `mroll`, `mflow`, `msling` |
| `follow` | the reckless plan: follow it to where it lives. `mfly`, `mcruise`, `mswarm`, `mdrift` |
| `walk` | the walk out on foot, toward the sea, the vents, the geysers, or the north |
| `launch` | the launch. The reader knows how it went, because the wreck is here |
| `split` | some stay and some go |
| `cut` | the entry that stops in the middle of a sentence |
| `second` | the entry by a second hand, after the keeper dies |
| `stay` | the quiet one: the crew decides to stay and live here |
| `message` | the message to whoever finds the log |
| `joke` | the last joke |

**The ending follows the threads.** A thread that points at one kind of ending carries `lead`, and
`leadTags()` turns it into a tag the endings are gated on. A quarrel gives `leadsplit`, a food count
and a cold world give `leaddoom`, a hurt keeper gives `leadsecond`, a big walker gives `leadride`.
A lead-gated ending carries a weight of 2 to 6, so it outranks a line that fits any world. A thread
that lost more than one beat to the trim never earns its lead: the log never reached the beat that
would have earned it.

Two more tags steer the roll. `harsh` marks a world that kills a crew on its own — lava, ice,
frozen, molten, searing, crushing gravity, a polar night — and the calm doom belongs there. And the
reckless endings are banned by `!leadsecond`: a keeper who cannot hold a tool does not lead an
expedition.

An ending that names a motion tag is the last beat of the fauna thread in all but name, so it takes
the people of that thread. Every other ending takes the first two people who are still here.

**The coda.** A crew thread that really ran contributes one sentence, which the ending adds when
there is room for it inside five sentences. So the last entry is about these people and not only
about the world. A `cut` ending takes no coda, because it stops in the middle of a sentence.

## The gates

Every thread and every line names the tags it needs and the tags it forbids, in the gate syntax of
`lore.js`. A gate reads five tag sources at once:

| Source | Examples | Set by |
|---|---|---|
| the world | `frozen`, `crushgrav`, `longday`, `rainy`, `tides`, `volcanic`, `ringed` | `Lore.makeEnv()` |
| the axis | `upright`, `tilted`, `sidetilt`, `retrograde` | `sourceTags()` |
| the site | `polarnight`, `harsh` | `sourceTags()` |
| the life | `beasts`, and one of the eleven motion tags | `sourceTags()`, `motionOf()` |
| the story | `leaddoom`, `leadride`, `leadsecond`, … | `leadTags()`, per log |

`Lore.makeEnv()` does not read the lean of the axis, so `sourceTags()` adds it. The lean the
climate feels is the smaller of the obliquity and its supplement: a world turned past 135 degrees
stands nearly upright again and turns the other way, as Venus does. The two limits, 54 degrees and
135 degrees, are the limits `makeStats()` states on the card of the world.

### The polar night is a fact of the site, not of the axis

**`tilted` does not give a polar night.** The sun fails to rise only poleward of the polar circle,
which stands at latitude `90 - lean`. A wreck on the equator of a world leaning 50 degrees sees the
sun every day of the year. So `polarnight` reads the latitude of the source as well as the lean:

```
|lat| > 90 - lean + POLAR_MARGIN        POLAR_MARGIN = 5 degrees
```

The margin keeps the tag off a site at the edge of the circle, where the night is one day. The
latitude comes from `world.source.dir`; `sourceLatDeg()` turns that direction into degrees, the way
`docs/issues/README.md` defines a site: the y of a unit direction is the sine of the latitude.

`makeSource()` keeps the source inside `SOURCE_LAT`, 80 degrees, so no source can carry
`polarnight` until the lean passes 15 degrees. `tilted` starts at a lean of 20, so the two tags are
not the same set and the sweep has to vary both the lean and the latitude.

### Two tags the log cannot reach

A source stands on a world with a surface, and two tags never appear there.

- **`shortday`.** `rollPlanet()` draws a day of 14 to 60 hours for a world with a surface, and
  `shortday` starts under 12 hours. Only a gas giant turns that fast, and a gas giant takes no
  source.
- **`noflora`.** Every type with a surface grows at least one plant kind, so `world.env.floraTags`
  is never empty. A thread gated on `noflora` is dead text, and the audit reports it.

### The star

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
| `{probe}` | the name of the ship |
| `{lat}` | the latitude of the source, in words. Under `EQUATOR_DEG`, 3 degrees, the word is "the equator" |
| `{day}`, `{night}` | the turn of the planet, and half of it |
| `{temp}`, `{grav}`, `{tilt}` | the temperature, the gravity, and the lean of the axis |
| `{days}` | the day of this entry |
| `{since}` | the day the thread this entry belongs to first spoke |
| `{moon}`, `{moons}` | the first moon, and the count of them |
| `{plant}`, `{plants}` | the plant word of this world |
| `{one}`, `{two}` | the two people of this thread. Never the keeper |
| `{onejob}`, `{twojob}` | their jobs, bare, so a line can write "our {onejob}" |
| `{keeper}`, `{keeperjob}` | the person who keeps the log, and their job |
| `{crew}` | the count of the crew, in words |
| `{few}`, `{many}` | two counts of days, rolled once per log |
| `{count}` | a count of animals, rolled once per log, in words |
| `{other}`, `{Other}`, `{others}`, `{Others}` | the animal the log names, in full: "the hardpan long-day hopper" |
| `{kind}`, `{kinds}`, `{Kind}`, `{Kinds}` | the short form: the last word of the name, bare. "hopper", "hoppers", "Hoppers" |
| `{size}`, `{n}`, `{diet}` | the size text, the group count, and the diet of that animal |
| `{pet}` | the name the crew gives one animal |

`{kind}` is the last word of the name. `species.js` builds a name as "[place] adjective NOUN", so
that word is always the noun it picked for the locomotion — hopper, strider, whale, ribbon, keel —
and it always takes an "s" in the plural. A log needs it, because the full name can be five words
and an entry may have to name the animal twice: "Lina put food on the step and three flappers came
down for it." It is bare, with no article, so a line writes "the {kind}", "a {kind}", or
"{n} {kinds}".

`{size}` and `{diet}` come straight off `G.lore`, so the log states the numbers the fauna card
states. **`{size}` already carries its unit and often its place** — "3.6 m, mostly under the sand",
"2.9 m across" — so a line that adds one repeats it. `{tilt}` comes from `world.env.obliquityDeg`
and **not** from the result of `Lore.makeEnv()`, which keeps only the numbers its tags come from and
drops the lean of the axis. A token that reads a dropped field prints "an unmeasured angle".

**The first beat of a thread may not look back.** It is the day the reader meets that thread, so
`{since}`, "in all this time", "we have never", and "every day since" are all false there. The audit
fails them.

## The voice

The log is the record of a small crewed survey ship. The prose is normal literary English, because
it is quoted material, as the species lore is. Comments and documents stay in Simplified Technical
English. Inside the log, these rules hold:

1. **Short declarative sentences.** Most are under 12 words and none is over 20. Plain concrete
   words a five year old can read aloud. Numbers are good: days, metres, degrees, counts.
2. **No metaphor and no simile.** No "like a", no "as if", no "as … as", no "seemed", and nothing
   the planet or the machine does on purpose. Say what happened. Let the facts carry the feeling,
   and do not name the feeling unless a person says it aloud.
3. **The devices that are allowed** are repetition, "and" chains, understatement, a person's exact
   words reported plainly, the thing left unsaid, and the small physical detail.
4. **Safe for a five year old and true for a ninety year old.** Death may happen and is stated in
   one plain sentence. No gore, no cruelty to an animal, and nothing frightening in detail. Sad is
   fine. Wonder is required.
5. **One entry holds 1 to 5 sentences.** The whole log reads in under two minutes.
6. **No pronoun for a member of the crew.** See "The crew" above.

Do not name a place of the Earth or a species of the Earth. `PROBE_NAME` holds plain English nouns
and a mark number, `NAMES` holds given names only, and `PET_NAME` holds plain words. No word of
`PET_NAME` is also a given name, so the audit can tell a crew name from an animal name.

## The card

`SourceInspector` in `ground-source.js` draws the card. The name of the ship takes `.cname`, the
day count takes `.clatin`, the crew takes `.ccrew`, and the entries take `.clog`.

A log may hold twenty entries, which is longer than a phone screen. So `.clog` scrolls inside the
card and nothing else does: `#creature[data-subject="source"] .ccard` takes `overflow: hidden` and
one grid row of `minmax(0, 1fr)`, and `.ctext` becomes a column that may shrink. The crew and the
close button therefore stay on screen at 375 by 812 with twenty entries. A grid row is `auto` by
default and grows to its content whatever the max height of the card says, which is why the row has
to be told that it may shrink.

## The audit

`node tools/lore-audit/audit.mjs` sweeps the landing pool, the threads, and the endings. The source
pass runs ten checks.

1. **Coverage.** Every world reaches the landing pool, at least three world threads, at least one
   crew thread, at least one fauna thread for **every one of the eleven ways of moving** when it
   carries beasts, and at least four endings.
2. **Reachability**, in two halves. A thread may carry a gate on the world and a test on the genome
   at once, and the two are independent, so the sweep asks them separately: one world in the sweep
   must pass the gate, and one genome shape must pass the test.
3. **The lexicon.** A word that claims a fact may only appear where the world has that fact. Issue
   34 adds six rules: `aurora` needs `auroral`, `geyser` needs `geysers`, `lightning` needs
   `stormy`, `the ring overhead` needs `ringed`, `the sea` and `the coast` need `hasocean`, and one
   rule for the sun that does not rise. That last rule names every phrasing the log gates on
   `polarnight`. Do not widen it to "the long dark": the fauna pool already holds that phrase.
4. **The motion lexicon.** A fauna line may only claim a movement the animal really makes, and a
   reckless ending may only propose a plan the animal allows. The rules are subject scoped, so the
   crew may still walk and stand in a fauna entry. A denial is honest anywhere: "It never walks" is
   a true line about a roller, and the rule steps over a `not` or a `never` on purpose.
5. **The tokens.** A line may only use a token the writer fills, and a line that names the animal
   must sit under a gate on `beasts`.
6. **The style.** No simile, no hedge, no entry over 5 sentences, and no sentence over 20 words
   **once the tokens are filled**. A token is not one word: `{Other}` can print "The sea
   lamp-flanked sky whale" and `{size}` can print "Each shard a hand wide, the swarm 9 m". `WORST`
   in the audit holds the longest fill each token can take, and the lint counts with those. Raise a
   number there when `species.js` grows a longer name or a longer size text.
7. **The subject.** Every entry stands on its own subject, as above. A fauna wording, and an ending
   that names a way of moving, may not let a pronoun or a stand-in phrase reach the reader before a
   naming token. Every other wording may not OPEN on a pronoun outside the impersonal list.
8. **The state.** A thread of 3 to 6 beats. A `retires` thread must carry an `out` beat, and no beat
   after it and no coda may name `{one}`. A first beat may not look back, with `{since}` or with a
   phrase. A beat may not claim a span longer than the shortest mission. The naming beat of a fauna
   thread must give the name in every one of its wordings.
9. **Salience.** Every world thread must carry `sal()`, or the loudest fact of a world can lose.
10. **Variety.** Three wordings per beat or more, no two wordings alike, no sentence in two pools,
   ten ending kinds, three wordings per ending kind, six threads of each kind, 60 given names.

Four facts of the sweep live in the audit:

- `SOURCE_SKY_TAGS` collapses the 11,616 worlds to the skies a source gate can tell apart, the way
  `FLORA_SKY_TAGS` does for the plants. A new gate on a new tag widens the sweep on its own.
- `SOURCE_TILT` holds seven leans, covering every class `rollAxis()` draws, and `SOURCE_LATS` holds
  five latitudes of the source, 0 to 79 degrees. 17 degrees is in the lean list because a source at
  79 degrees carries `polarnight` at that lean while `tilted` only starts at 20.
- `SIZES` holds three body sizes, one under a metre and one over six, and `SOURCE_COVER` keys the
  genome shapes by the way they move, so every fauna gate is swept against every motion, every
  sociality, and both sides of the size limit.
- `LEAD_SETS` holds three sets of lead tags: none of them, all of them, and all but one, for every
  lead some gate bans. Without the third set a line gated on `!leadsecond leadride` would look
  unreachable, because the sweep would never hold one lead without the other.

### The consistency check

`node tools/lore-audit/audit.mjs --seeds 200` runs 200 real worlds through `generate()` and reads
the log of every source. It checks that:

- the entry count lies between 8 and 20, the first entry is the landing on day 1, and the last one
  is an ending kind;
- the days rise strictly, and `log.days` is the day of the last entry;
- the crew holds 3 to 5 people, the names are distinct, the roles are distinct, and the keeper is
  one of them;
- every given name in an entry belongs to the crew, once the ship, the moons, the species, and the
  animal names are taken out of the text;
- no entry after `log.lost.day` names the person who died or left;
- no entry leaves a token unfilled, claims a fact the world does not have, or breaks the style lint
  on the filled text;
- the species the log names is a species of that world, and the genome test of the fauna thread and
  of the ending is true of that animal.

It then reports four spreads over the 200 worlds: the ending kinds, the threads, the ways of moving
with one sample line each, and the repetition. Both of the repetition numbers matter:

- **the share of logs that hold the commonest sentence.** Under 8 per cent.
- **the count of neighbour pairs in seed order that share any sentence.** This one cannot be driven
  to zero, because two wrecks in a row may honestly run the same thread on the same kind of world.
  Report what it reaches and widen the busiest beats when it climbs.

The motion lexicon does not run again here. The pool sweep already reads every wording against
every way of moving, which is complete, and the filled text has lost the tokens the subject-scoped
rules read.

## A tool that loads the worker by hand

`tools/world-checksum.mjs` evaluates `worker.js` in Node without `source-lore.js`. `generate()`
therefore tests `self.SourceLore` before it writes the log, and that tool gets a source with no
log. This is on purpose: the tool measures the terrain, the flora, and the fauna, and nothing in
the worker reads the log back. A tool that needs the log must require `source-lore.js`, as
`tools/lore-audit/audit.mjs` does.
