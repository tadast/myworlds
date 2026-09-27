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
