# 29 The flow slides where it should be still, and its run reads as a walk

Type: HITL. Phase 2. Blocked by: 28.
Read `docs/issues/README.md` first, then the "The impulse mover" section of `docs/fauna.md`.

## The report

The reader watched a `flow` on a volcanic world and said the movement made no sense. Three faults,
in the order the reader named them:

1. The animal slides over the ground while it holds its gathered shape. A blob with no legs that
   travels is the one thing a body with no shape may not do.
2. The run down the fall line is too slow and too short. It has to read as a liquid.
3. The return up the rise is a slide. It has to leave the ground, the way the hop of a `monopod`
   leaves it.

The reader also gave the behaviour the animal should carry, and asked for it in the lore: it lurks
on the high ground, melts to feed, takes what the ground gives while it is a sheet, and goes back
up to wait. Little else moves it.

## What the measurement found

One flow on the ground tier, seed `#Quasar-393@24.06,171.93`, over 29 seconds:

| Phase | Ground covered | Shape while it covered it |
|---|---|---|
| rest | 1.9 m | a gathered blob, sliding |
| charge | 4.6 m | a sheet |
| fly | 6.4 m | a blob with one column pulse in it, sliding |

So 64 percent of the travel happened while the body held a shape. Two causes, and both are in the
code and not in the design:

- `flowHold()` gave the rest phase `FLOW_CREEP`, a tenth of the cruise speed.
- `MEMBER_RUSH` in `ground-fauna.js` capped every step of a member at 1.35 of its cruise speed.
  The cap is there so a formation cannot drag a walker faster than its legs go. It also held the
  sheet of a flow to a walk, which is the whole of fault 2.

A third cause sat in the shader: the discharge scaled the stack into a column and back, and the
mover carried the body along the ground for the whole of it, so the column read as a body sliding.

## What it built

**One rule, restated.** A flow covers ground in two states and is still in every other one:

| Phase | Seconds | What it does | Ground |
|---|---|---|---|
| rest | 10.0 | lurks on the high ground, gathered | none |
| charge | 2.0 | melts, runs the fall line as a sheet, stands up as a column where the sheet stopped | the run |
| fly | 1.2 | hops the whole body back up the rise | the hop |
| recover | 0.75 | settles where it landed | none |

**The charge carries a clock of its own.** `FLOW_MELT`, `FLOW_SET`, and `FLOW_RISE` say when the
sheet spreads, when the run ends, and when the column has risen. The shader shapes the stack on
those three and `flowHold()` gives speed on the same three, so every metre a flow covers downhill
it covers as a sheet. The window is narrow on purpose: the ground one run covers comes from the
bank and not from the window, so a narrow window spends the same ground in less time.

**`still`.** A new optional key on an `IMPULSE` row. It says the animal holds its own ground
between two throws. `ground-fauna.js` reads `st.still` and gives such a member its own place as its
slot, so neither the swing on to the slot nor the shuffle after a throw may move it, and it lifts
`MEMBER_RUSH` from it, because nothing drags a still animal. Only a solitary species may ask for
it, and `flow` is the only row that does.

**The hop.** The discharge lifts the whole body on a parabola of height `FLOWHOP`, which the
gravity sets the way it sets `HOPH` for a monopod. The column eases back to the rest shape by the
top of the arc and spreads by `FLOWSQ` as it lands, and every part is back at the rest shape at the
end, so the step into the next rest costs the body nothing.

**Numbers.** `FLOW_UP` went 1.2 to 1.0 and `FLOW_MARGIN` 0.8 to 0.9, which widens the run. The
cruise speed of a flow in `MOVE` went 0.005 to 0.007: the animal now stands still for three
quarters of its life, so the ground it owes has to come out of a quarter of the seconds.

Measured after, same seed, three whole cycles:

| Phase | Ground covered | Top speed | Cruise |
|---|---|---|---|
| rest | 0.00 m | 0.00 m/s | 1.15 m/s |
| charge | 2.1 to 4.8 m | 2.6 to 6.4 m/s | |
| fly | 2.5 to 6.9 m | | |
| recover | 0.00 m | | |

The hop covered 1.2 times the run over the three cycles, so the animal ends each one above where it
began, which is what `FLOW_UP` promises.

**Lore.** Four lines: one on the lurk in the body pool, and three in the `pour` manner pool on
feeding spread, on going down to eat and up to wait, and on a mate as the one thing that moves it
off its point. The diet line names the sheet. `TEMPER.pour` went "Unhurried" to "Still, then
sudden", which is the word the ambush habits already use. The audit is clean at `--seeds 200`.

## What it did not build

Nothing was dropped. The reader asked whether the current system could carry the behaviour; it
could, and no new mechanism was needed beyond the `still` key.
