# p2-39 The reader has nowhere to type the frequency

Status: CLOSED, 2026-09-28. Merge commit 149d202.

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

## What the build changed

Built on 2026-09-28. Every acceptance criterion holds in the browser and in `node
tools/carrier-fix-check.mjs`. The deviations from the plan and the reasons:

- **The tuner is a module of its own.** `tuner.js` holds `makeTuner()`, the one function that builds
  the form for both places, and `tuneAnswer()`, the five answers with no DOM. `ground-source.js`
  changes in one place only: `SourceInspector.show()` takes the element as a last argument, `tail`,
  and puts it under the last entry. The rest of the tuner stays out of that file, because p2-41
  works in it at the same time.
- **The field of the card takes no focus when the card opens.** The Tune chip of the sidebar puts
  the focus in its field, as the plan asks. The card holds the log, and the reader reads it first:
  a field that took the focus at once would raise the keyboard of a phone over the log. The field of
  the card takes the focus on a tap, as any field does.
- **The sidebar shows the locked band for good.** After the tune the Tune chip goes away, and the
  locked band ("Receiver 8.578 MHz locked") stands under the Carrier row on every render and after
  a reload. The plan says both places show the locked band; a band that showed only while a form
  stood open would need a chip that opens nothing.
- **The labels are this build's words.** The plan names a label, a field, a unit, a button, and a
  line of answer, and no words for the label and the button. The label reads "Tune the receiver",
  the button "Tune", and the locked view "Receiver", the band, and "locked".
- **The lock prints the band the receiver holds.** The answer of the lock prints `world.ruin.freq`,
  and the near miss and the static print the typed number to three decimals. The two agree for
  every lock but the one on the edge of the band: `7.3165` locks 7.316, and `toFixed(3)` would print
  7.317.
- **Both bands include their edge.** "Within 0.0005" and "within 0.050" take `<=`, with a slack of
  1e-9 for the error of a float, so `7.3155`, `7.3165`, `7.266`, and `7.366` lock or give the near
  miss against 7.316, and `7.265` gives static. The distress band takes the band of the lock.
- **The field takes 12 characters at most.** A number of 22 digits prints as `1e+21` in the answer,
  and the answer must print a number. Twelve characters hold every band a reader can mean.
- **A tuned world shows the locked band even when the wreck is not found.** The rule of the plan is
  "only after the find", and the field keeps it: a world whose wreck is not found shows no field.
  Only the debug hook, and the find of the ruin by chance of p2-42, tune a world before the find of
  the wreck, and such a world has nothing to type.
- **The carrier block takes the colour of chapter 2 through a new call.** p2-38 left the block blue.
  `ProbeHud.setTint(col)` writes `--hud-tint`, and `setBriefPulse()` calls it on every landing and on
  the tune, so the block changes colour at the moment of the tune. The colour is the colour of the
  drawings of the brief: `carrierColour(world, 2)` lightened to a luminance of 0.3. The needle, the
  bearing, the ring of the dial, and the pulse take it. The hint stays grey, as it is in chapter 1:
  `#probe-hud .k` outranks `.hud-hint`.
- **The slash key of the page.** `/` jumped to the seed input from any element but that input, so a
  slash typed into the tuner moved the focus. It now leaves every text field alone.
- **Escape.** In the field of the sidebar, Escape closes the form and gives the focus back to the
  chip. In the field of the card, Escape closes the card, as it does everywhere on the card.
- **The rail of the log ends at the last entry.** The tuner is now the last child of `.clog`, so the
  rule `.clog-entry:last-child` no longer ended the rail. `.clog-entry:has(+ .tuner)` ends it.
- **The check of the answers is part F of `tools/carrier-fix-check.mjs`,** not a new tool, so the
  list of checks stays the same. It keeps its own copy of the words of the table.
- **`window.__mw.tuners`** gives the two tuners, `{ card, side }`, for the tests.

### The checks

- All seven checks pass: `world-checksum --check` (the baseline does not move), `carrier-check`,
  `carrier-fix-check` (with part F), `cell-grid-check`, `frame-check`, `ruin-check`, and the lore
  audit.
- In the browser, on `p239-delta` (terran, 8.578), `p239-echo` (ice, 22.917), `p239-foxtrot`
  (desert, 20.604), `p239-golf` (exotic, 17.068), and `p239-alpha` (a gas giant, no row). The pane
  stood hidden, so the browser took no real key or click: each test set the value of the field and
  called `requestSubmit()`, which is the path Enter takes, and dispatched the key events by script.
- **The rows of the table.** From the card of `p239-delta`: `abc` and an empty field gave "The
  receiver takes a number in MHz, for example 406.025."; `406.025` and `406025` gave "The receiver
  holds the distress band."; `8.575` and `8.628` gave "A pattern under the static on 8.575 MHz." and
  "... on 8.628 MHz."; `8.629` gave "Static on 8.629 MHz."; `12` gave "Static on 12.000 MHz."; and
  `8,578` gave "Locked on 8.578 MHz. The probe hears a second source." From the sidebar of
  `p239-echo` in orbit: `abc`, `406.025`, and `406,025 MHz` gave the first two answers; `22.870`,
  `22.867`, and `22.967` gave the near miss; `22.968` and `3` gave static; and `22917` locked. From
  the sidebar of `p239-foxtrot` on the ground, `20.604 MHz` locked.
- **No leak.** Before the find and after it, up to the lock, no element, attribute, value of a
  field, title, or address held the frequency, on `p239-delta`, `p239-echo`, and `p239-golf`.
- **Only after the find, and only with a ruin.** Before the find of `p239-delta` the row read "Not
  heard" with no chip, and the card tuner stood hidden. With `world.ruin` set to null on
  `p239-golf`, the find showed no chip and no field.
- **The keys.** With the focus in the field on the ground, a keydown of W, A, S, D, the four arrows,
  Space, Q, E, R, F, C, =, -, and the + and - of the number pad set no job of the ground, none was
  prevented, and 30 steps of `Ground.update()` moved the camera 0 units and turned it 3e-8 rad. The
  same W on the page with no focus in a field set the job `fwd` and moved the camera 108.7 units. A
  slash typed into the field kept the focus there.
- **The moment of the tune.** On the cell of the wreck of `p239-delta` the lock turned the carrier
  from 152.0° at `406.025` to 127.4° ± 3.1° at `8.578`, stored the first fix of chapter 2 at once,
  set the block to chapter 2 in `#ff7b1c`, and pulsed it with "Unknown signal · tap". After the
  recall the group painted chapter 2. On `p239-foxtrot` the sidebar did the same: 216.4° to 189.6°
  ± 3.3°, and the compass word of the ruin is "south". A lock in orbit on `p239-echo` took no fix,
  and the row read "Tuned".
- **The reload and the second world.** After a reload `p239-delta` stood in chapter 2 with the
  locked band in the sidebar, and a landing on its wreck showed the locked band in the card with no
  field. `p239-echo`, `p239-foxtrot`, and `p239-golf` each showed an empty field of their own while
  `p239-delta` stood tuned. A render of the sidebar during the ascent kept the text, the focus, and
  the last answer of the field.
- **390 px.** At 390 by 844, in the card of `p239-golf` scrolled to its end: the log runs from x 27
  to 371, the tuner from 53 to 361 and y 696 to 791, and the last entry ends at y 676. The field
  stands at x 53 to 189, the unit at 197 to 224, and the button at 232 to 290, on one line. The
  answer "Static on 999999999.999 MHz." ends at y 791, over the fade of the log at 795. The log
  scrolls 344 px wide in 344 px, and the page is 390 px wide. In the sidebar sheet, the form takes
  the whole line of the grid, x 15 to 384 and y 558 to 638, under the Carrier row (y 534 to 553) and
  over the Star row (y 647). The body of the sheet scrolls 388 px wide in 388 px. At 1280 by 800 the
  tuner stands at x 529 to 1069, and its last line ends at y 705, over the fade at 713.

### Open

- **The log does not state the frequency yet.** p2-40 writes the call and the ending that prints
  `{freq}`. Until it lands, the field works and nothing on the page tells the reader the number.
- **Real keys and the keyboard of a phone.** The pane stood hidden, so no real key, click, or
  virtual keyboard reached the page. Enter as a real key, and the keyboard of iOS over the card,
  need a check by hand.
- **Frame time is not measured.** The tuner adds no work to a frame: the tint changes on a landing
  and on the tune only.
