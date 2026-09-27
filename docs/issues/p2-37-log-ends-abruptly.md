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
