# PROTOTYPE — the UI of My Worlds, three concepts

Throwaway. Delete this folder and `tools/ui-prototype.html` when a concept wins.

## The question

The sidebar does too many things, the probe call to action is buried, and "Generate" only submits the name
that the dice writes. What shape should the whole UI take, on a phone and on a desktop, so that the app feels
like a game: a start screen, your worlds, the story, the facts, and the probe as the main action?

## How to run it

Serve the repo (see the README) and open:

    http://localhost:5555/tools/ui-prototype.html?variant=A
    http://localhost:5555/tools/ui-prototype.html?variant=B
    http://localhost:5555/tools/ui-prototype.html?variant=C

- `[` and `]` cycle the concepts. The arrow keys stay with the probe.
- `?seed=Auralis` skips the start screen. `?start=1` shows it again; the ↺ button does the same.
- The ⓘ button shows the topology and the hierarchy of the concept on screen.

The real app runs in the iframe with its sidebar and floating buttons hidden. Each concept drives it through
`window.__mw` (`bridge.js`): the real worlds, the real progress, the real probe. The probe overlay, the study
cards, and the dialogs are the app's own.

Caution: the prototype writes the real progress. A tune, a landing, or a forget changes the saved state of
that world, as the app does.

## The concepts

- **A — Flight deck.** A flat hub. One dock: Worlds, Story, the raised probe button, Planet, Menu. Each tab
  opens one sheet (a right panel on a desktop, a bottom sheet on a phone).
- **B — Field journal.** A narrative spine. On the planet: the objective, the journal button, and one gold
  call to action. A chapter card opens each world. Everything else is a page of the journal.
- **C — Constellation.** Spatial. Your worlds orbit an unnamed star in a cosmos. A depth rail (Cosmos, Orbit,
  Surface) ends in the big Land / Recall button. Scan pins the facts onto the globe; the story is a set of
  radio signals with a dial and a tuner.

## Verdict

Round 1 (2026-10-03): A wins, with the distress-signal animation of C and the windows of B.

Round 2 changed A:

- The four tabs of the dock open one window that fills the screen above the dock. The middle button of
  the dock closes it. The window takes the layout and the type of the journal of B.
- One layer shows at a time: a card or a dialog of the app, then the window, the title, and the arrival.
  A card opened from the window hides the window, and the window comes back when the card closes.
- The arrival of a new world with a wreck is the distress signal of C: it unfolds, and the wave moves.
- A locked chapter shows "Locked" and nothing else. The story model in `bridge.js` drops its title, its
  goal, and its band, so no concept can spoil the ruin.
- Every story surface also offers the other way to play: meet the creatures, land and look around.
