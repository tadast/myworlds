# The interface

The interface over the planet: the title, the dock, the window, and the chrome of the planet. `deck.js` draws it, `story.js` writes the words of the story, and `field-guide.js` keeps the field guide. `index.html` holds the shell under `#ui`, and `style.css` styles it under "the interface, deck.js".

The interface replaced the sidebar. Three concepts were built as a throwaway prototype, and the first one, the flight deck, won. It takes the distress signal of the third concept and the windows of the second. The prototype is gone; its question and its verdicts stand in the commits of the branch `tt/ui-concepts`.

## The topology

```
Title ──name / dice / a saved world──▶ Arrival ──▶ the planet
                                                      │
   dock:  [Worlds] [Story] (● probe) [Planet] [Menu]
              └───────┴───────┬────────┴───────┘
                       one window, four pages
                    the middle button: Close
   in orbit: Send probe ▸ aim ▸ land       on the ground: Recall probe
```

- **The title** shows when the address holds no world. It has a field for a name, the dice, up to four saved worlds, three steps, and links to the controls, About, and the sound. The page builds the last saved world behind it, so the planet turns on the right. The loading card hides while the title stands.
- **The arrival** follows each new world in orbit. A world with a story and no fix gets the distress signal: the card unfolds, the wave moves, and two buttons say "Follow the signal" and "Just explore". A world with progress gets "Welcome back" and the objective. A world with no story gets one card for a gas giant, and one for every other world.
- **The planet** shows the world chip at the top left, the objective at the top right, the sound button at the top right corner, and the dock at the foot. On the ground the objective moves over the dock and wraps, so its whole line shows, and the study chip stands over it.
- **The dock** is the only navigation. Its four tabs open one window. The probe button stands raised in its middle: "Send probe" in orbit, "Cancel" while the reader aims, "Recall probe" on the ground, "No surface" on a gas giant, and "Close" while the window stands open.
- **The window** fills the screen above the dock, over a veil of the planet. Its pages:
  - **Worlds**: a field for a new name with the dice, and every saved world as a card, with its marks.
  - **Story**: the distress signal, the Now panel with the next step and its button, and the chapters. The tuner stands in the Now panel while the band waits for it.
  - **Planet**: the globe, a line about the world, the facts, and the field guide. On the ground the field guide comes first.
  - **Menu**: the sound and the volume, About, the title screen, and the controls.

## One layer at a time

Only one layer shows, from the top:

1. the study card or a dialog of `app.js`
2. the window
3. the title
4. the arrival
5. the chrome of the planet

A card opened from the window hides the window, and the window comes back when the card closes. So two layers never stand over each other. While the window stands open on the ground, it holds the controls of the ground, so the keys scroll the page and do not fly the probe behind it.

## The story without spoilers

Two rules hold for every word of `story.js`, and `tools/story-check.mjs` reads them at each step of a whole story.

- **A closed chapter tells nothing of itself.** It shows "Locked" and the number of the chapter it waits for: no title, no goal, no band, no status, and no action. The reader learns of the ruin when the log of the wreck names it, and not from a list of chapters.
- **No word names the wreck before the find.** The reader knows only that a carrier called for help. The intro, chapter 1, the objective, and the record of the incident say "the source of the signal" until the first open of the card of the wreck.

Every story surface also offers the other way to play: meet the creatures, land and look around.

## The field guide

A creature or a plant is undiscovered until the reader finds it on the planet and opens its card. The open is the find.

- The Planet window shows an undiscovered creature or plant as a locked card that says "Undiscovered". A press on it says where to look.
- The study chip says "Study this creature" or "Study this plant" before the find, and "Study the ‹name›" after it.
- The line over the name of the card counts the guide: "Creature · 2 of 5 in your field guide".
- When the card closes, a short message announces the find, and the Planet tab takes a dot until the reader opens the page.

The guide keeps a creature by its species in `world.species`, and a plant by the name its card showed, because the name of a plant reads the biome of its patch. The store is `myworlds.guide.v1`, with the bound of 200 seeds that the carrier store keeps.

## The sound

The sound button stands on the planet, top right. Until the reader first uses the sound, it is a warm button that says "Turn on the music". While the music plays, it shows a moving equaliser, and a hover gives the volume. When the browser has not let the sound start, a press starts it. The Menu window holds the same control and the volume.

## The signal block

On the ground, the probe overlay shows the signal block under the top strip, on the left. It takes the look of the window: a glass panel, and a label in mono with a dot.

- The label says "Signal source" in every chapter. The source is the wreck in chapter 1 and the ruin in chapter 2, and the block names neither.
- The needle, the bearing, and the band stand under the label. The strength, the error, and the range stand at the foot.
- The wave of the arrival runs between them. It grows with the strength: Faint, Clear, Strong, and Here.
- The colour of the chapter marks the dot, the needle, the bearing, the wave, and the pulse. It is blue in chapter 1, and the colour of the wedges of the ruin in chapter 2.
- While the block pulses, the dot blinks, and the foot shows the stage and "Brief ›". The stages are the same for each source: "Stronger signal" and "Source in reach".
- In a short window, as a phone on its side, the block stands in the middle of the top strip, with no wave.

A press on the block opens the brief. The brief also says "the source", and never "the carrier", because the same words serve the wreck and the ruin.

## The cards and the dialogs

The study card and the dialogs take the size and the type of the window: almost the whole screen, Fraunces for names and prose, and IBM Plex Mono for labels. A creature and a plant take the preview as the left half and the text as the right; on a phone the preview is a band across the top. The card of the wreck and the card of the ruin keep the layout of a reader. The card has no arrows, because an arrow would step to a creature the reader has not found yet.
