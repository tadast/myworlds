# The log of the source: architecture

This document describes how myworlds writes the log of a source. Read it before you change
`source-lore.js`, the source parts of `generate.js`, or the source pass of `tools/lore-audit`.

Read `docs/fauna.md` and `docs/flora.md` first. The three systems share one engine, `lore.js`, and
the differences between them are the point of this file.

## What a source is

Issue 34 puts one source on every world with a surface. A source transmits, the probe reads a
bearing to it, and a landing in its cell shows it. The first kind of source is a wreck: a small
crewed survey ship that came down, worked, failed, and stopped. The wreck holds the log of that
crew.

The ship is a lander that can climb to the orbiter once, so every hull has an engine bell, a climb
tank, and a mast of the crew: the parts the log names. `hullOf(world)` in `wreck-geometry.js` picks
one of four hulls from the seed: a rocket, a spaceplane, a rotor-rocket, or a ring-tank tripod. A
world with no air takes the rocket or the tripod. The pick is a pure function of the seed, as the
motif is, so no stream of `generate.js` draws one number more. The log does not read the hull.
The crew lived beside the ship, in a camp: a half-sphere dome with an airlock, crates, a solar
array, and the water tank of the fuel maker. Each hull names a free spot for it on the flattened
disc. `wreckGeometry(hull, { camp: false })` leaves it off, and the mini wreck on the globe does so.

The plan and the terms are in `docs/issues/34-the-carrier.md`. Use the words of that table:
carrier, source, bearing, fix, wedge, wreck, motif, log.

Phase 2 adds a second kind of source, the ruin, as `world.ruin` beside `world.source`. It stands
12 to 35 cells from the wreck, and `makeRuin()` places it with the tests of `makeSource()` and a
stream of its own, `seed + '|ruin'`. The log of the wreck reads it: on a world with a ruin the log
runs a call thread, and its last entry names the frequency of the ruin and its compass word. See
"The call" below and `docs/ruin.md`.

**The carrier does not reach the far side of the world.** `CARRIER_REACH` in `site.js` is a third of
the circumference, and `carrierAt()` gives null past it. A landing past the reach shows no carrier
block, stores no fix, and draws no wedge, and the reader who hears nothing learns a fact too. The
log does not read that bound: a source stands where `makeSource()` put it, whoever can hear it.

## Where the log sits

| Stage | File | Runs in | Output |
|---|---|---|---|
| 0. The lore engine | `lore.js` | Web Worker, page | `Lore`: tags, gated pools, weights |
| 1. Place the source | `generate.js`, `makeSource()` | Web Worker | `world.source = { kind, dir }` |
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
  cause: 'tank',                        // the strand thread: why the crew could not leave
  leads: ['doom', 'ride', 'call'],      // the leads the threads set, for the audit
  went: 'some',                         // who goes toward the call: 'all', 'some', 'one', or 'none'
  goers: ['Bo', 'Tam'],                 // the names of the people who go
  beacon: 3,                            // the day the crew put the beacon on the mast, 2 to 6
  entries: [
    { slot: 'landing',        title: 'Landing',    day: 1,   text: '…' },
    { slot: 'world.cold',     title: '',           day: 12,  text: '…' },
    { slot: 'call.click',     title: '',           day: 20,  text: '…' },
    { slot: 'fauna.walkbig',  title: '',           day: 32,  text: '…' },
    …
    { slot: 'end.ride',       title: 'Last entry', day: 179, text: '…' },
  ],
}
```

A log holds 8 to 20 entries. Since the strand thread most hold 15 or more, and since the call
thread a log of a world with a ruin holds 18 or more. `slot` names the thread the entry came from,
or the act: `landing` for the first entry and `end.<kind>` for the last one. A middle entry carries
no title, and the card then shows the day alone. The card does not read `lost`, `cause`, `leads`,
`went`, `goers`, or `beacon`; the audit reads them, to prove that no entry after that day names that
person, that the strand thread ran to its last beat, that the ending fits the story, and that the
call holds. `went`, `goers`, and `beacon` stand on a world with a ruin only. A log of a world with
no ruin carries none of the three keys, so it is the log it was before the ruin, byte for byte.

The page must not show any of this before the reader finds the wreck. The log stands nowhere else
on the world: no other field of `world` holds the text.

After the find the globe carries a mini model of the wreck at the source, and the wedges of the
search are gone. `carrier-globe.js` builds that model from `wreckGeometry(hullOf(world))` of `wreck-geometry.js`,
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
proves it: the hashes of the worlds and the patches must stay equal to the baseline file.

The place of the source, `world.source.dir`, comes from `makeRng(seed + '|source')`, which is a
different stream. The motif of the source takes a third one in `music.js`. The three never mix.
The ruin of phase 2 takes a fourth, `makeRng(seed + '|ruin')`, and it mixes with none of them.

On a world with a ruin the writer draws two numbers more from its own stream: the call thread, and
the day of the beacon. Both draws stand behind the test `world.ruin`, so a world with no ruin draws
nothing more and its log does not move. p2-40 moved the hash of the log on every world with a ruin,
on purpose, and on no other world; the baseline of `tools/world-checksum.mjs` moved in that commit
and in no other column.

## The shape of a log

A log is a story, and it has three parts.

| Part | Entries | Holds |
|---|---|---|
| The landing | 1 | one real fact of this world, and the plan to get home |
| The beats | 6 to 18 | the threads, interleaved, rising in force. On a world with a ruin, the call among them |
| The ending | 1 | the last entry. Its kind follows what the threads did. On a world with a ruin it names the band of the ruin and says who goes toward it |

### A thread, a beat, a wording

A thread is an ordered list of 3 to 6 beats that intensify. **A beat is a list of three wordings
or more**, and the writer takes one of them. That is what keeps two wrecks from reading alike: the
busiest beats carry five or six wordings, and a wording is a different small event with a different
detail, not the same sentence with one word changed. The audit fails a beat under three wordings.

`writeLog()` takes one strand thread, one call thread when the world holds a ruin, one world
thread, one or two crew threads, and the fauna thread when the world carries beasts. There are
five kinds.

| Kind | Gate | Holds |
|---|---|---|
| `strand` | none | why the crew cannot leave. Exactly one per log, never shortened |
| `call` | a ruin on the world | the click of the ruin. Exactly one per log of a world with a ruin, none without. See "The call" |
| `world` | tags, and a **salience** | a real fact of the world |
| `crew` | none | the people. It also carries a **coda** and a **lead** |
| `fauna` | `beasts` and a **motion tag** | the one species the log names |

A thread may run a prefix of its beats, never fewer than three, so a short log is a shorter subplot
and not a cut one. The trim takes one beat at a time off whichever thread is longest. It used to
shorten from the back, which always cut the crew threads, because they are chosen last, and the
ending then stopped following them. A thread that retires a person is never shortened, because the
beat that takes the person out is its last. The call thread is the one thread that does not run a
prefix: the trim drops its middle beats and keeps its last one, because the last beat gives the
direction the ending pays off. `callBeats()` holds the rule.

### Why the crew cannot leave

The first build took the stranding for granted. A log spoke of a pump, a food count, and the cold,
and never said why the ship did not lift and go home. Every log now states it, in plain words.

One frame holds for every mission, and the second part of the landing entry states it:

- An **orbiter** with no crew brings the lander to the world and waits overhead until day `{due}`.
- The **lander** can climb back to orbit once, and no further.
- A second ship from home needs `{years}` years to arrive.

A strand thread breaks one link of that frame and says which one.

| Thread | The fact | `due` |
|---|---|---|
| `bell` | the landing split the engine bell. The weld fails the test. The orbiter leaves | `last` |
| `tank` | the landing split the climb tank. The fuel maker gives two litres a day of four thousand | `last` |
| `fall` | the ground gave way in the mission. The lander lies on its side | `last` |
| `orbiter` | the orbiter broke up in orbit. The lander is sound and has nothing to climb to | `never` |
| `recall` | a fault sent the orbiter home early, under its own rules, with two days of notice | `never` |
| `patched` | the feed line cracked and the patch is weak. The crew climbs on it | `next` |

`due` says how the writer sets `{due}`. `last` is the day of the last beat of the thread, which is
the beat that watches the orbiter go. `next` is the day after the ending. `never` is a day the log
does not reach. A thread that breaks the lander on the landing brings its own `landing` wordings;
the rest take `SOUND_LANDING`. So **no `ARRIVAL` line may state that the lander is sound or
broken**: the strand thread owns that fact.

`patched` carries `end: 'launch'`, which forces the launch ending. Every launch wording is gated
on `leadlaunch`, so no other log reaches it: a crew with a dead lander cannot lift. The wreck the
reader stands at is how the climb went, and one wording says so.

"The carrier" is the radio signal of the wreck, in the words of issue 34. The ship overhead is
therefore always "the orbiter".

### A beat makes no claim about the days since the beat before it

`writeLog()` takes the wordings first and lays the days after. Two beats of one thread can stand
eight days apart or sixty. "Due back four days ago" and "the orbiter leaves in two days" are
therefore false more often than true. A beat that needs a span states the whole span inside
itself: "The orbiter sent a fault notice two days ago. It left this morning."

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
| `mdrift` | sac | a bladder of warm gas. It never lands. It goes where the wind blows |
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

### The call

Phase 2, p2-40, decisions 1, 2, 6, and 10 of `docs/issues/p2-00-the-second-signal.md`. The ruin
of a world sends on a band that is not on the band plan, and the radio of the crew hears it as a
click. A log of a world with a ruin takes exactly one thread of `CALL_THREADS`, and a log of a
world with no ruin takes none. `CALL_THREADS` holds three threads, `click`, `tape`, and `answer`:
a click heard under the static at night, a click found on the night tapes, and a second click that
comes back after every click of the beacon. Every one of them holds five beats in one order,
because the trim keeps the first beats and the last one and drops the middle:

| Beat | Holds | Runs |
|---|---|---|
| 0 | the click is heard, and logged as a fault | always |
| 1 | **the reply**, decision 6: the click began on day `{beacon}`, the day the crew put the beacon on the mast. Every wording states both days, and they are one day | always |
| 2 | the click is not a fault of this ship | with four beats or more |
| 3 | the click is on a band the plan leaves empty | with five beats |
| 4 | **the direction**: every wording names `{from}`, the compass word of the ruin | always |

So a call thread of three beats reads: heard, the reply, the direction. **The number of the band
never prints in a thread.** A beat says "the band", "a band the plan leaves empty", or "the click",
and the last entry is the one place the number stands. `{from}` stands in the last beat and nowhere
else in the thread. The busiest beats, the three that always run, carry six wordings each, and
nearly every sentence of them carries a name or a day, so a sentence differs from world to world.
The thread carries the lead `call`, and it earns it always, because its last beat always runs.
Every call ending is gated on `leadcall`, so no log without the thread can reach one.

**The day of the beacon.** `{beacon}` is a day from 2 to 6, drawn after `layDays()`, and it always
falls before the day of the first beat of the call thread. The entry after the landing can be day
2, so the first beat of the call thread never stands first: when the sort by force puts it there,
it changes places with the beat after it, which is the first beat of another thread, and no thread
runs out of order. The jitter is smaller than the step between two beats of one thread, so the
beat after it can be no other beat. The reply beat then falls after `{beacon}`, because the days
rise.

The job of the radio is the natural subject, and a crew may hold no radio role, so a wording
names the job only as "our {onejob}", as every thread does.

### How the beats interleave

Every beat carries the force of its place in its thread: beat `i` of `n` takes `(i + 1) / n`, plus
a small jitter. `writeLog()` sorts every beat of every thread by that force. So the whole log rises
from the landing to the ending, and a thread never runs out of order, because the jitter is smaller
than the step between two beats of one thread. The one exception is the first beat of the call
thread, which never stands first; see "The call".

### The days

The days are turns of this planet, counted from the landing. The landing is day 1. `layDays()` lays
the gaps on a hump: short at the start, widest in the middle of the mission, short again at the
end. The last days of the story therefore crowd together, which a reader feels as speed. Every day
is a whole number and the days rise strictly. The card shows `days`, the day of the last entry.

A mission runs from 42 to 240 turns, so no beat may claim a span longer than the shortest mission.
The audit fails "a hundred days", "a year", and the rest, because a log of 65 days would otherwise
state that it had heard nothing for a hundred.

### The crew

`rollCrew()` draws 3 to 5 people from `NAMES`, which holds 131 given names from many languages,
short ones and long ones. No name is also a plain English word a line may use. A log never gives a surname. Each person takes one role from `ROLES`, and a pilot is
always aboard. The first name on the list is the keeper, who writes the log as "I" and "we". The
other people are the cast of the threads: `{one}` and `{two}` inside a thread always name the same
two people, and `{onejob}` and `{twojob}` are their jobs.

**No pronoun stands for a member of the crew.** The log says the name, or the job: "{one}", "the
{onejob}", "our {twojob}". A pronoun would need a gender, and the names come from many languages,
so the log would have to invent one for every name. Naming the job is also what keeps three
sentences in a row from reading "Gil. Gil. Gil.": a wording alternates between the two.

**Every person but the keeper carries a trait.** `TRAITS` holds 24 of them: a fact of the life
before this flight, or a habit the crew has to live with. A trait holds three asides, and
`writeLog()` adds one to the end of an early entry that names that person, at most two per person
and never two entries in a row. A thread that takes a person out gives that person an aside on
its first beat, so the reader knows who walks away. An aside opens on `{who}` or "Our
`{whojob}`", claims no fact of the world, and never follows a death.

**A person who walks out has a reason, and the log states it.** Three threads send a person away.
`cache` walks to the supply drop, `{far}` kilometres north, for ninety days of food and a spare
radio. `salvage` walks to an old unmanned lander, thirty kilometres east, for power cells.
`forage` goes to live off the land, comes back changed, is held outside by the quarantine rule,
and leaves for good; it is shut to a world where a person cannot open a helmet. The first beats of
all three hold whether or not the crew is stranded yet, because a first beat often comes before
the strand thread has said so.

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
| `walk` | the walk out on foot, and what for: the supply drop, the heat of the vents, fresh water round the shore |
| `launch` | the climb on a patched feed line. Forced by the `patched` strand thread, and reached by no other log |
| `split` | some stay and some go |
| `cut` | the entry that stops in the middle of a sentence. The card prints a note under it; see "The card" |
| `second` | the entry by a second hand, after the keeper dies |
| `stay` | the quiet one: a person says the crew could live here, and the crew tries. `temperate waterliquid` only |
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

**The call endings.** On a world with a ruin the last entry comes from `CALL_ENDINGS` and from no
other pool. It holds the same 12 kinds, three wordings per kind or more, and every wording prints
`{freq}`, the band of the ruin, exactly once: `7.316 MHz`. The number stands in the last entry and
nowhere else in the log. Every wording is gated on `leadcall`, and the leads of the threads pick
the kind as they pick it on a world with no ruin, so a quarrel still gives a split, a hurt keeper
the second hand, and a harsh world the calm doom. A wording carries the outcome of decision 2 of
p2-00 as `went`, and the roles of the people who go as `goers`; `writeLog()` writes `log.went` and
`log.goers`, the names of those people.

| Kind | `went` | The call wording |
|---|---|---|
| `walk` | `all` | everybody still here walks or drives toward the click, with the rover and the spare radio; on an island, on the raft |
| `joke` | `all` | the last joke is about the click, and then everybody goes to look |
| `ride`, `catch`, `follow` | `some` | the reckless plan points at the click: the animal walks, runs, or flies that way. The two people of the fauna thread go |
| `split` | `some`, `one` | two go toward the click and the keeper stays with the beacon; or one person goes alone |
| `second` | `one`, `none` | the second hand writes the band the keeper wrote on the hatch, and goes alone, or cannot |
| `doom` | `none` | the crew cannot reach it, points the aerial at it, and hands the band to the reader |
| `message` | `none` | "Whoever finds this:" and the band, and the direction |
| `cut` | `none` | the entry stops after the number. The card prints the note under it |
| `stay` | `none` | the crew stays and makes a life, and leaves the click to whoever comes |
| `launch` | `none` | the crew climbs on the patched line and leaves the band behind for the reader |

`all` takes every person still here, the keeper and the crew less the person a thread took out,
and lists no roles. `some` always holds two people and never everybody, because a crew holds three
people or more and a thread retires one only when the crew holds four or more, so two people
besides the keeper are always here. A wording that walks or drives is shut to an island,
`!mostlysea`, where the click comes from over the water. The weights of the call wordings are set
so that the spread of the kinds over 200 worlds stays near the spread of the endings of today, and
no value of `went` passes half of the logs: over the audit seeds `none` takes about 43 per cent,
`some` 28, `all` 22, and `one` 6.

## The gates

Every thread and every line names the tags it needs and the tags it forbids, in the gate syntax of
`lore.js`. A gate reads five tag sources at once:

| Source | Examples | Set by |
|---|---|---|
| the world | `frozen`, `crushgrav`, `longday`, `rainy`, `tides`, `volcanic`, `ringed` | `Lore.makeEnv()` |
| the axis | `upright`, `tilted`, `sidetilt`, `retrograde` | `sourceTags()` |
| the site | `polarnight`, `harsh` | `sourceTags()` |
| the life | `beasts`, and one of the eleven motion tags | `sourceTags()`, `motionOf()` |
| the story | `leaddoom`, `leadride`, `leadsecond`, `leadcall`, … | `leadTags()`, per log |

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
| `{due}`, `{years}`, `{far}` | the day the orbiter leaves, the years a second ship needs, the kilometres to the supply drop |
| `{who}`, `{whojob}` | the person an aside is about |
| `{count}` | a count of animals, rolled once per log, in words |
| `{other}`, `{Other}`, `{others}`, `{Others}` | the animal the log names, in full: "the hardpan long-day hopper" |
| `{kind}`, `{kinds}`, `{Kind}`, `{Kinds}` | the short form: the last word of the name, bare. "hopper", "hoppers", "Hoppers" |
| `{size}`, `{n}`, `{diet}` | the size text, the group count, and the diet of that animal |
| `{pet}` | the name the crew gives one animal |
| `{freq}` | the band of the ruin with its unit, `7.316 MHz`: `world.ruin.freq` and ` MHz`. A call ending only, once |
| `{from}` | the compass word of the ruin, `world.ruin.from`. The last beat of a call thread, and a call ending |
| `{beacon}` | the day the crew put the beacon on the mast, 2 to 6. The reply beat of a call thread only |

The three tokens of the call are filled on a world with a ruin only, so `CALL_TOKENS` lists them
and the audit confines each to its place. A line that used one elsewhere would print the token
itself on a world with no ruin.

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
   words a five year old can read aloud. Numbers are good: days, metres, degrees, counts. The
   only tool of the writer is subtraction.
2. **No metaphor and no simile.** No "like a", no "as if", no "as … as", no "seemed", and nothing
   the planet or the machine does on purpose. Say what happened. Let the facts carry the feeling,
   and do not name the feeling unless a person says it aloud.
3. **No adverb of manner.** If the verb needs help, take a better verb. The audit fails an -ly
   word outside a short list.
4. **Every noun names a thing the reader can see.** "Tova said the quiet", "the wet is at the bus",
   "the wind decides", and "the panels take nothing" each left a reader asking "the quiet what?".
   An entry is read cold, so it says the water pump and not the pump, a geyser and not "one". What
   is left unsaid is the feeling, and never the fact.
5. **The devices that are allowed** are repetition, "and" chains, understatement, a person's exact
   words reported plainly, the thing left unsaid, and the small physical detail.
6. **Safe for a five year old and true for a ninety year old.** Death may happen and is stated in
   one plain sentence. No gore, no cruelty to an animal, and nothing frightening in detail. Sad is
   fine. Wonder is required.
7. **One wording holds 1 to 5 sentences.** A printed entry may hold 9: the landing is two parts,
   an early beat may take an aside, and the ending may take a coda.
8. **No pronoun for a member of the crew.** See "The crew" above.

Do not name a place of the Earth or a species of the Earth. `PROBE_NAME` holds plain English nouns
and a mark number, `NAMES` holds given names only, and `PET_NAME` holds plain words. No word of
`PET_NAME` is also a given name, so the audit can tell a crew name from an animal name.

## The card

`SourceInspector` in `ground-source.js` draws the card. The name of the ship takes `.cname`, the
day count takes `.clatin`, the crew takes `.ccrew`, and the entries take `.clog`.

The wreck card is a reader, and it has two columns. The left one says whose log this is: the
wreck, and under it the crew, one person to a row, with the keeper marked. The right one is the
name of the ship and the log. The left column is set by position and not by the grid, because
`.ccrew` stands inside `.ctext` in the markup and has to stand under the preview on the screen. At
720 pixels and under, the card is one column: the wreck as a band, the crew in a line, the log.

An entry hangs off a rail with a dot at its day. The day is quiet and the text is what reads: a
measure of 62 characters and open leading. The landing and the last entry carry a title, take the
class `ctitled`, and take the accent.

**An ending of the kind `cut` gets a note of the card.** That ending stops in the middle of a
sentence on purpose, and without a note the reader takes the open line for text that did not load.
So `SourceInspector.show()` prints "[log ends abruptly]" under the text of an entry whose `slot` is
`end.cut`, in its own element, `.cabrupt`. The note is a part of the card and not of the log, so it
takes the quiet colour of the day label and italics, and not the accent. It is not in
`log.entries`: the text of the log does not change, the audit never reads the brackets, and the
hash of `tools/world-checksum.mjs` does not move. The rule reads the slot and not the text, so
every ending of the kind `cut` gets the note, the endings of p2-40 too. The note stands inside the
entry, so it scrolls with the log and clears the fade. A screen reader reads it after the text.

`.clog` scrolls inside the card and nothing else does, so the card holds a fixed height. Three
rules keep the last line in sight:

- The height reads `100dvh`, with `100vh` as the fallback. `100vh` is the large viewport on a
  phone: it runs under the address bar, and the foot of a card that tall cannot be reached.
- `.clog` fades at both ends with a mask, so a line at the edge reads as more text and not as a
  cut line.
- `.clog` carries 40 pixels of padding under the last entry, which is more than the fade. The
  last line therefore scrolls clear of it.

## The audit

`node tools/lore-audit/log-sample.mjs 0 3 forage` prints whole logs of real worlds, filtered by a
cause, a slot, the outcome of the call as `went.one`, or `ruin` / `^noruin$`. The header prints
`went`, the goers, and the day of the beacon. Read a log whole after every change to the text: the
audit proves that a line is honest, and only a reader can tell that a log holds together.

`node tools/lore-audit/audit.mjs` sweeps the landing pool, the threads, the asides, and the endings. The source
pass runs twelve checks.

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
6. **The style.** No simile, no hedge, no adverb of manner, no filler ("that is the whole of the
   plan"), no wording over 5 sentences, no printed entry over 9, and no sentence over 20 words
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
   ten ending kinds, three wordings per ending kind, six threads of each kind, 60 given names. The
   call keeps a floor of three threads, because one runs per log.
11. **The call in the pools.** `{freq}` stands in a call ending only, once per wording. `{beacon}`
   stands in the reply beat of a call thread, in every wording of it, and nowhere else. `{from}`
   stands in the last beat of a call thread, in every wording of it, and in a call ending, and
   nowhere else. No call thread states a number of MHz. Every call thread holds five beats and the
   lead `call`. Every call ending is gated on `leadcall`, carries one of the four values of `went`
   with goers to match, and a `second` wording never sends the keeper. Every kind holds three call
   wordings or more, and every value of `went` is reachable. Under `leadcall` every sky, every way
   of moving, and every set of leads reaches a call thread and four call endings or more.
12. **The call on a real world**, with `--seeds`; see the consistency check below.

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
- the log names a cause, the strand thread of that cause ran to its last beat, the landing names
  the orbiter and the day it leaves, and a cause that forces an ending got that ending;
- the days rise strictly, and `log.days` is the day of the last entry;
- the crew holds 3 to 5 people, the names are distinct, the roles are distinct, and the keeper is
  one of them;
- every given name in an entry belongs to the crew, once the ship, the moons, the species, and the
  animal names are taken out of the text;
- no entry after `log.lost.day` names the person who died or left;
- no entry leaves a token unfilled, claims a fact the world does not have, or breaks the style lint
  on the filled text;
- the species the log names is a species of that world, and the genome test of the fauna thread and
  of the ending is true of that animal;
- on a world with a ruin: the log runs exactly one call thread, to three beats or more; the last
  entry prints `world.ruin.freq` with its unit exactly once and no other entry prints a band; the
  ending is a call wording of its kind that fits this world and sends `log.went`; `log.went` is one
  of the four values, the goers are people of the crew who are still here, `all` holds every one
  of them, `one` holds one, `some` two or more and not all, `none` nobody, and the keeper never
  goes in a `second` ending; `log.beacon` is 2 to 6 and falls before the first call beat, exactly
  one call entry states that day, and it falls after it; `world.ruin.from` is `compass8()` of the
  bearing from the wreck to the ruin, computed again from `cell-grid.js`, and the last beat of the
  call names it and no earlier call beat does;
- on a world with no ruin: no call thread, no `went`, `goers`, or `beacon` key, no band in any
  entry, and an ending of the pool of today.

It then reports five spreads over the 200 worlds: the ending kinds, the threads, the ways of moving
with one sample line each, the values of `went` over the logs with a ruin, and the repetition. No
value of `went` may pass half of the logs with a ruin, and the check fails when one does. Both of
the repetition numbers matter:

- **the share of logs that hold the commonest sentence.** Under 8 per cent. The report prints the
  three commonest, and the commonest sentence of the call alone: the entries of the call thread and
  the ending on a world with a ruin. Since p2-40 the three commonest sentences are lines of
  `SOUND_LANDING`, at about 9 per cent, and the commonest sentence of the call stands under 8.
- **the count of neighbour pairs in seed order that share any sentence.** This one cannot be driven
  to zero, because two wrecks in a row may honestly run the same thread on the same kind of world.
  Report what it reaches and widen the busiest beats when it climbs.

No audit seed lacks a ruin, so the case of a world with no ruin is proved by hand: wrap
`SourceLore.writeLog` on the shared module object so that it passes `{ ...world, ruin: null }` to
the real writer, build the seeds again, and compare the logs with the logs of the build before the
call. p2-40 did that over 200 seeds, and every log was byte-equal.

The motion lexicon does not run again here. The pool sweep already reads every wording against
every way of moving, which is complete, and the filled text has lost the tokens the subject-scoped
rules read.

## A tool that runs the worker in Node

`generate.js` imports `source-lore.js`, so every world call writes the log, in the browser and in
Node alike. `tools/world-checksum.mjs` runs `worker.js` itself with a stub of `self`, so its hash of
the world covers the log, and a result that `worker.js` cannot clone or transfer fails the check.
