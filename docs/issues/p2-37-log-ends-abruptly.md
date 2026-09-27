# p2-37 A log that stops mid-sentence reads as a defect of the card

Status: open.

Type: AFK. Phase 2. Blocked by: none. Small. Read `docs/source.md`, "The ending" and "The card".

## The defect

The `cut` ending stops in the middle of a sentence: "The forward leg has made a loud crack and Oke
has taken the lamp out to it. I am going out to". The story means it. The reader sees a line with
no full stop at the foot of the card and takes it for text that failed to load or a card that cut
it off.

## What to build

- `SourceInspector.show()` in `ground-source.js` prints a note under the text of an entry whose
  `slot` is `end.cut`: **[log ends abruptly]**. It is a note of the card and not a part of the log,
  so it takes its own element, `.cabrupt`, in the quiet colour of the day label, in italics, and not
  in the accent. It stays inside `.clog`, so it scrolls with the entry and clears the fade at the
  foot, as the last line does now.
- The text of the log does not change, and the note is not in `log.entries`. The audit of
  `tools/lore-audit` reads the log and must not see brackets, and `world-checksum` must not move.
- The rule reads the slot and not the text. A future ending that stops in the middle of a sentence
  takes the kind `cut`, and the note comes with it. p2-40 adds cut endings that print the
  frequency, and they take the note too.
- A screen reader reads the note after the text. Do not hide it with `aria-hidden`.

## Docs

- `docs/source.md`, "The card": one paragraph on the note and why it is not part of the log.

## Acceptance criteria

- A world whose log ends on `cut` shows the note under the last entry. Find one with
  `node tools/lore-audit/log-sample.mjs 0 20 end.cut`, and state its seed in the summary.
- A world whose log ends on any other kind shows no note.
- The note reads at a phone width of 390 pixels and scrolls clear of the fade.
- `node tools/world-checksum.mjs` passes against the baseline, and `node tools/lore-audit/audit.mjs`
  passes.

## What the build changed

- The note is a `<p class="cabrupt">` inside the `.clog-entry` of the ending, after the `<p>` of the
  text. So it hangs off the rail of the entry, a screen reader reads it after the text, and the
  padding of `.clog` still clears it of the fade. `ABRUPT_SLOT` and `ABRUPT` in `ground-source.js`
  hold the slot and the words.
- The plan gave no size. The note takes 13 px, a top margin of 6 px, and a letter spacing of
  0.02 em, so it reads as smaller than the text and larger than the day label. It takes
  `var(--muted)`, the colour of a day label with no title. The day label of the last entry takes the
  accent, because that entry carries a title, and the note does not follow it there.
- The docs go past the one paragraph of the plan by two lines. The ending table of
  `docs/source.md` points the `cut` row at "The card", and `README.md` "How it works" gets one
  sentence, because the conventions ask for it when a reader sees a change.
- The verification did not land on the cell of the wreck. It called `__mw.sourceInspector.show()`
  in orbit with `data-subject="source"`, the steps of `inspectSource()` less `onSourceFound()`, so
  the store of the shared origin records no find.
- Verified on `audit-15` (terran, `Bastion 19`, "The hatch alarm is going and Vikram is shouting
  for me. I will finish this when I") and on `audit-21`: one note, in the last entry, in italics and
  in `rgb(154, 163, 199)`, with no `aria-hidden`, and the tree of the page holds it. `audit-0` and
  `audit-1` end on `doom` and `audit-2` ends on `ride`: no note. With the log scrolled to its end,
  the note stands 7.8 px over the fade at 1280 by 800 and 4.1 px over it at 390 by 844, on one line,
  and the page does not scroll across.
