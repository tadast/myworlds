# p2-39 The reader has nowhere to type the frequency

Status: open.

Type: AFK. Phase 2. Blocked by: p2-38. Read `docs/issues/p2-00-the-second-signal.md`, decisions 7
and 8.

## The defect

p2-38 can hold chapter 2, and only a debug hook starts it. The last entry of the log states a
frequency, and the reader has no field to type it into. The design asks for a field and not for a
button: the reader reads the number and types it, and that act is the door.

## What to build

**One tuner, two places.** A small form of a label, a field, a unit, a button, and a line of answer.
It stands in two places, both from one function, so the two cannot drift:

1. Under the last entry of the card of the wreck, in `SourceInspector`, so the number is in sight
   while the reader types it. It shows only on a world with a ruin.
2. In the Carrier row of the sidebar, as a Tune chip that opens the form in place, in orbit and on
   the ground, so a reader who closed the card can still tune.

Both show only after the find of the wreck. After the tune, the form in both places shows the
locked band and no field.

**The field.** `inputmode="decimal"`, `autocomplete="off"`, a placeholder of `406.025`, and the unit
`MHz` beside it. Enter submits. The field takes the focus when the reader opens it, and the ground
stops its keys while the field holds the focus, so W, A, S, and D type letters and do not fly the
probe.

**The answer.** `parseFreq()` of `ruin-types.js` reads the text. The answers are these, word for
word, with the typed number printed to three decimals:

| Typed | Answer | Result |
|---|---|---|
| not a number | "The receiver takes a number in MHz, for example 406.025." | nothing |
| 406.025 | "The receiver holds the distress band." | nothing |
| within 0.0005 of the frequency | "Locked on 7.316 MHz. The probe hears a second source." | `markTuned()`, then chapter 2 starts |
| within 0.050 of it | "A pattern under the static on 7.313 MHz." | nothing |
| anything else | "Static on 7.313 MHz." | nothing |

The answer line is `aria-live="polite"`. Nothing else gives away the frequency: no autocomplete, no
list, no hint of how near the number is beyond the near miss, and nothing in the URL.

**The moment of the tune.** On the ground, the carrier block swings to the new bearing, takes the
colour of chapter 2, and pulses for the brief of "Unknown signal". The landing that tuned takes the
first fix of chapter 2 at once, as a landing does now, so the reader who tunes at the wreck sees the
first wedge on the ascent. In orbit, the tune takes no fix until the next landing.

**Remove `__mw.tune()` from the way in of the reader.** The hook stays for tests.

## Docs

- `README.md`, "Controls" and "How it works": the tuner and the answers.
- `docs/ruin.md`: the rules of the field, and why it takes typing and not a button.

## Acceptance criteria

- Every row of the table answers as written, from the card and from the sidebar.
- `7,316`, `7316`, and `7.316 MHz` lock a world whose frequency is 7.316.
- The field shows on no world whose wreck is not found, and on no world with no ruin.
- A reload after the tune keeps chapter 2. A second world keeps its own tune.
- While the field holds the focus, no key moves the probe.
- The form reads at 390 pixels wide in both places, with no overlap of the sheet or of the log.
