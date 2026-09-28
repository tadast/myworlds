# p2-44 The ruin is silent

Status: open.

Type: AFK, then a HITL listen. Phase 2. Blocked by: p2-38, p2-41. Read slice 5 of
`docs/issues/34-the-carrier.md`, and `docs/issues/p2-00-the-second-signal.md`, decision 11.

## The defect

The wreck has a voice: the motif plays on its own bus, its level follows the distance on the
ground, and it joins the song of the world after the find. The ruin has none. The reader who follows
the needle of chapter 2 hears nothing grow, and the lamp of p2-41 blinks a borrowed rhythm.

## What to build

**The motif played back**, decision 11. The ruin sends the beacon of the crew back, slower. So its
motif takes the steps of `motifOf(world)` and no new stream: every step at twice its length, so one
call fills two bars, an octave lower, in the mode and on the root of the song, so it is always in
tune.

- `motifOf()` in `music.js` gains a sibling, `ruinMotifOf(world)`, with the same fields: `steps`,
  `stepsPerBar`, `bars`, `stepDur`, `barSeconds`, and `period`. `stepDur` is twice the step of the
  wreck. The period stays four bars of the ruin motif, so it is eight bars of the song.
- `compose()` writes the notes of the ruin motif after the notes of the wreck motif, from the same
  pitches, so no song and no wreck motif of any world changes.
- A timbre of its own: a soft bell or a low sine with a long release, not the square of the wreck,
  so a listener can tell the two apart when both play.
- `_start()` adds `song.ruinBus`, a gain at 0 that feeds `out` and the reverb, with more reverb than
  the wreck bus.
- `Music.setRuin(k)` ramps `ruinBus` to `k * 0.5` over 0.4 s, on the pattern of `setCarrier()`.
- `barClock()` serves both lamps. Add `ruinClock()` if the period of the ruin needs its own phase.

**The levels.** `app.js` calls `setRuin()` twice a second, beside `setCarrierLevel()`:

| Where | Level |
|---|---|
| chapter 1, or not tuned | 0 |
| tuned, off the cell of the ruin | 0 |
| on the cell of the ruin | a smoothstep from 0.15 at the edge of the reach to 1 at 40 units, as the wreck does |
| in orbit, after the find of the ruin | 0.6 |

After both finds, both motifs play in orbit and the song stays whole.

**The lamp.** The glow of `SourceRuin` and the lamp of the mini model on the globe read the rhythm
of `ruinMotifOf()` on the music clock, or on the clock of the landing when no sound runs, so the eye
and the ear agree and a reader with the sound off loses no fact.

## Docs

- `docs/ruin.md`: the voice, the levels, and why it takes no stream.
- `docs/issues/README.md`: the `music.js` row gains `ruinMotifOf()` and `setRuin()`.

## Acceptance criteria

- The song and the wreck motif of every world are unchanged: compare the note events of five seeds
  before and after, in `tools/music-lab`.
- On the cell of the ruin the motif grows as the reader walks in, and it stops on the recall.
- The lamp of the ruin blinks the same rhythm the ear hears, with the sound on and with it off.
- **The HITL listen.** With the sound on, on a terran, a desert, and an ice world: the ruin motif
  stands in tune with the song, and it reads as the motif of the wreck played back. State in the
  summary what the listen changed.

## What the build changed

Built on 2026-09-28. Every deviation from the plan above, and the reason:

- **The call of the ruin plays on bars 3 and 4 of each eight, and not on bars 1 and 2.** The plan
  does not say where the call stands in its period. The wreck calls on bars 1 and 5. On bars 3 and
  4 the ruin answers one bar after the call of the wreck and ends before the next one, so after both
  finds the ear hears the call and then the same call played back, and no call of the ruin starts
  on a bar of a call of the wreck. `RUIN_AT` in `music.js` holds the bar. So the ruin needs a clock
  with a phase of its own, and `Music.ruinClock()` gives it, as the plan allows: the seconds since
  the start of the last call, inside the period of eight bars.
- **The bell is FM with a whole ratio, and not a low sine.** An octave under the wreck the motif
  stands at about 80 to 330 Hz, where a small speaker gives little. `Synth.bell()` bends a sine with a
  second sine at three times the pitch, strong at the strike and weak after 0.35 s, and rings out
  over 1.4 s. The ratio is a whole number, so every partial stands on the harmonic series of the
  note, the bell stays in tune, and the partials carry the low note on a small speaker.
- **More hall is a larger send into the one hall.** `song.ruinBus` sends 2.5 times as much into the
  hall of the song as the source bus does, `RUIN_VERB`. A second hall would add a second convolver
  to the audio thread for one voice.
- **The ruin notes take 0.35 of the level of the wreck notes.** The plan sets no loudness. At the
  level of the wreck the bell measured 8 dB louder (A-weighted, windows of 85 ms) and 11 dB louder
  (windows of 0.34 s), because it rings on where the sine stops. With `RUIN_LEVEL` at 0.35, over
  five worlds of the music lab, a call of the ruin measures 1 dB under a call of the wreck in the
  short windows and 1 to 4 dB over it in the long ones.
- **`setCarrierLevel()` sets both buses, and `carrierLevel(kind)` holds one rule for both.** The plan
  asks for `setRuin()` beside `setCarrierLevel()`, twice a second. `setCarrierLevel()` already runs
  on every landing, recall, tune, and find as well, so it now calls `setCarrier()` and `setRuin()`
  together, and no call site can set one bus and forget the other. `carrierLevel()` takes the kind
  of the source: a bus opens on the ground only when the body on the cell is its kind and is the
  source that runs, and in orbit at 0.6 after the find of its kind. So the cell of the ruin no
  longer opens the bus of the wreck, and the wreck follows its own rule of issue 34 and p2-38.
- **`ruinRhythm()` is gone.** p2-41 made it the one function to swap. `SourceRuin` now reads
  `ruinMotifOf()` of `music.js` and `ruinClock()`, and the count of the wraps of `barClock()` of
  p2-41 went with it. `Music.ruinMotif(world)` gives the same rhythm, as `Music.motif()` does for the
  wreck. After the rebase onto p2-42 the glow of the card of the ruin, `RuinInspector`, reads
  `ruinMotifOf()` too, on the clock of the card, as the lamp of the card of the wreck does.
- **The lamp of the mini ruin takes the music as an argument.** p2-42 gave the lamp on the globe a
  rhythm function of its own, `ruinLampRhythm()` in `carrier-globe.js`, and a copy of the rules of
  `lampLevel()`, because `ground-source.js` imports `carrier-globe.js`. The function is gone: the lamp
  reads `ruinMotifOf()`, and `updateCarrierGroup(group, dt, music)` takes the `Music` of the app as
  an optional third argument, so the lamp reads `music.ruinClock()` while the sound runs and the
  clock of the group when it does not. The copy of the rules stays, for the same cycle.
  `tools/carrier-fix-check.mjs` part "ruin" now tests that the lamp takes `ruinMotifOf()`, stands
  full on each step of `ruinClock()` and on its floor off them. `onRuinFound()` of p2-42 already
  called `setCarrierLevel()`, so the ruin joins the song in orbit at 0.6 from the find.
- **Eight worlds and not five.** The music check compares the song and the motif of the wreck on
  the seven worlds of `tools/music-lab/worlds.js` (one of each type) and `Vesper`. The check now also
  compares the note events of the motif of the wreck, and not only the song, and it takes the file
  under test from `MUSIC`. "The music check" in `docs/ruin.md` states how to run it.

### The results

- The seven checks pass: `node tools/world-checksum.mjs --check` matches the baseline with no change,
  and `carrier-check`, `carrier-fix-check`, `cell-grid-check`, `frame-check`, `ruin-check`, and the
  lore audit pass.
- **The music check.** `MUSIC=<this music.js> node check-motif.mjs <music.js of main>` passes on
  the eight worlds. The song and the motif of the wreck of each world are byte-equal to main. On
  each world the ruin holds the steps of the wreck at twice the step, every note is in the mode and
  an octave under the note of the wreck, the scheduler plays each note on the clock of
  `ruinMotifOf()`, and the calls stand on bars 3 and 4 of the eight (bar 3 alone on `Voss`, whose
  motif ends inside half a bar). Three mutations fail it as they must: the ruin a semitone off the
  octave, the call on bar 1, and one weight of a pitch of the wreck.
- **In the browser,** in a hidden pane with `?ruin`, on `p244-c` (terran, arches), `p244-k`
  (desert, colossus), and `p244-j` (ice, spires):
  - Chapter 1: a landing on the cell of the wreck set the wreck bus to 0.25 to 0.37 and the ruin bus
    to 0. A landing on the cell of the ruin set both to 0.
  - A tune on the cell of the ruin opened the ruin bus at 0.15 to 0.59, by the place of the
    landing, and a walk in along the needle raised it to 1 at 40 units from the stones, for example
    0.15, 0.57, 0.95, and 1 at 718, 348, 126, and 16 units on `p244-j`. The wreck bus stayed at 0.
    With the sound on, the gains of the buses read 0.5 and 0.
  - The recall set the ruin bus back to 0. With the find of the ruin in the store it read 0.6 in
    orbit, and with both finds both buses read 0.6. A landing on the wreck in chapter 2 set both
    to 0.
  - **The lamp and the ear.** With the sound on, over one period of the ruin, each bell note the
    ruin bus took had one onset of the glow 0.3 to 2.8 ms after it (one render quantum), with no
    onset between the notes: 6 of 6 on `p244-c`, 4 of 4 on `p244-k`, and 5 of 5 on `p244-j`. With
    the sound off, the glow lit on the steps of `ruinMotifOf()` in the clock of the landing, within
    1 ms. The glow never fell under the floor of 0.14.
- **After the rebase onto p2-42,** on `p244-c`: a landing on the cell of the ruin in chapter 1 set
  both buses to 0. The card of the ruin opened, its glow took `ruinMotifOf()`, and the find by
  chance tuned the world and opened the ruin bus at the level of its range, 0.15 at the reveal
  camera. After the recall the ruin bus read 0.6 at once and the mini ruin stood on the globe. With
  the sound on, over one period, the lamp of the mini ruin had one onset 0.1 to 2.5 ms after each of
  the 6 bell notes and no other onset, and the ruin bus read a gain of 0.3. With the sound off it lit
  on the 6 steps of `ruinMotifOf()` in the clock of the group, within 1 ms. On `p244-k` a find
  through `__mw.onRuinFound()` in orbit set the ruin bus from 0 to 0.6 in the same call.
- **Frame time.** `SourceRuin.update()` costs 0.0003 ms with the sound off and 0.0004 ms with it
  on. The clock of p2-41 counted wraps; the new one reads one number.

### Open

- **The HITL listen test.** No agent can do it, and the manager cannot either. A person must
  listen with the sound on, on a terran, a desert, and an ice world (`p244-c`, `p244-k`, and
  `p244-j` serve): the motif of the ruin must stand in tune with the song, it must read as the
  motif of the wreck played back, and after both finds the two must stay apart. The listen may move
  `RUIN_LEVEL`, `RUIN_VERB`, the bend and the release of `Synth.bell()`, and `RUIN_AT`.
