# My Worlds

Type a name or a word. Get a small low-poly planet. The same word always gives the same world.

Static site: HTML, CSS, and JavaScript modules. No build step, no backend, no Node.

## Run locally

Serve the directory over HTTP. Web Workers do not run from `file://`.

```sh
ruby -rwebrick -e 's=WEBrick::HTTPServer.new(:Port => 5555, :DocumentRoot => Dir.pwd).start'
```

Open <http://localhost:5555/>. Add `#YourName` to the URL to open a specific world.

## Deploy to GitHub Pages

Push the repository and enable Pages for the branch root. `.nojekyll` keeps Jekyll away from `vendor/`.

## Icons and the share image

`icon.svg` draws the planet mark. `favicon.ico` (16, 32, 48) and `assets/apple-touch-icon.png` (180) come from it:

```sh
rsvg-convert -w 16 -h 16 icon.svg -o /tmp/i16.png
rsvg-convert -w 32 -h 32 icon.svg -o /tmp/i32.png
rsvg-convert -w 48 -h 48 icon.svg -o /tmp/i48.png
magick /tmp/i16.png /tmp/i32.png /tmp/i48.png favicon.ico
rsvg-convert -w 180 -h 180 icon.svg | magick png:- -background '#070a16' -alpha remove assets/apple-touch-icon.png
```

`assets/share.png` (1200x630) is the Open Graph card. `tools/share-image.html` composes it: the real app in an iframe for the planet, the title over it. Serve the directory, open the page at 1200x630, wait for the world, and save the frame. The seed is `Auralis`, so the planet is always the same one.

## How it works

- `worker.js` turns the seed into a hash, a PRNG, and seeded simplex noise. It builds an icosphere, raises terrain, paints biomes per face, places flora and fauna, and condenses clouds. It runs off the main thread and reports progress.
- `app.js` renders the result with three.js (flat-shaded vertex colours, instanced flora, fauna and clouds, atmosphere shaders, rings, moons). It saves each world's seed, type, and a thumbnail to `localStorage`.
- `site.js` picks the landing site for the probe: a ray from the screen centre onto the surface, a pull to a creature home within two patch widths, a ring marker on the ground, and the site in the URL.
- `ground.js` holds the ground the probe lands on. The globe is a miniature at 1 unit for the planet radius. The ground is true scale: 1 unit is 1 metre. It keeps a second scene, a second camera, and second controls, and it draws with the same renderer. A sky dome of 5,000 m takes the atmosphere colour, and fog in the same colour runs from 450 m to 750 m, so the horizon fades and the patch shows no hard edge. Later issues put the flora and the fauna in it.
- The ground patch is a square of terrain 1,500 m across around the site. The worker builds it while the probe falls, and the dive holds the screen until the reply lands. A height grid with a vertex every 2 m, or every 4 m on a low tier, carries the globe elevation at the site, the tilt of the globe field, and three octaves of new noise: hills, knolls, and rock. The colours follow the biome rules of the globe, so the ground reads in the colours the reader saw from orbit, with rock on the steep slopes and a lightness jitter per vertex. `ground.js` turns the grid into indexed flat-shaded meshes, and adds a coarser rim out to 1,500 m from the site that holds the height of the patch edge and sits inside the fog. The camera stays 2 m above the terrain and at most 1,200 m above the site, and its target stays inside the fog start.
- `ground-sea.js` puts water on that ground when the world owns an ocean and the patch dips below the water line. The sea is one plane at sea level in the ocean colour and the ocean opacity of the world, so the sea bed reads through it. The bed carries the shore: a sand strip over the first 1.5 m of land, and a colour that darkens with the depth over the first 12 m of water. Two crossed sine sets in the vertex shader lift the plane by 0.12 m, one 2 m long with a period of 6 s and one 5 m long with a period of 9 s, so the water shows facets a few metres across that move at a walking pace and no swell crosses the patch. A lava sea glows and moves less; an ice sea is still and opaque. The grid holds 1 m cells within 200 m of the camera target and follows it, the flat water past that takes two coarse rings, and a block that stands under land is not drawn. Over open sea the fog takes 30% of the ocean colour and the camera floor is 2 m above the water. The sea costs about 1.4 ms of the frame.
- `ground-sky.js` draws the sky over that ground, so the sky says which world you stand on. The app turns the sun, the moons, and the ring of the globe into the frame of the site, because only the app knows how far the planet has turned. The dome carries a gradient: the atmosphere colour at the horizon, a 30% darker blend at the zenith, a warm tint within 20 degrees of the sun, and a disc at the sun. A sun under the horizon rises to 8 degrees, so the ground stays lit, and the sky goes to the dark end of the palette. Each moon runs its own orbit and sets at the horizon. A ringed world gets the ring as a band: at the ring plane it is a line through the zenith, and it opens into a wide arc at a higher latitude. Six to twelve flat clouds drift near the ceiling. The fog takes the horizon colour of the dome, so the far terrain and the sky end at one colour and the horizon holds no seam. The sky costs about 0.4 ms of the frame.
- The app holds one mode: orbit, descending, ground, or ascending. The globe scene stays in memory in every mode. In ground mode the globe is not drawn and none of its per-frame work runs, so the ground gets the whole frame. See `docs/probe.md` for the decisions behind the probe: the two scales, the landing site, the patch, the frame budget, and the ground camera.
- `species.js` rolls a set of species per world: class, niche, body plan, limbs, head, extras, gait, movement, colours, and modular lore. It runs inside the worker.
- `fauna.js` builds a creature from a genome, rigs it for the vertex shader, steers it, and runs the inspector card.
- `phenomena.js` draws the one natural activity a world can have: the glow, smoke, and embers of a volcano, the jet of a geyser, the light of a fissure, the curtains of an aurora, or the bolts of a thunderstorm. The worker picks the kind and the site, shapes and paints the ground, and keeps flora and fauna away from it.
- `music.js` plays a chip-tune for each world with the Web Audio API. The world type picks a mode, a chord progression, the tempo range, the swing, the lead timbre, and the wind. The day length and the gravity set the tempo and the root note. The temperature sets the tone. The song is a 32-bar loop: an intro, a question and answer phrase, a bridge, the phrase again with variation, and a short outro. The melody follows a 1/f noise contour, so it wanders like a tune, and it snaps to the chord on strong beats. The bass moves against the lead and approaches each new chord by a step. A pad holds the chords, and light percussion keeps the beat. Small timing jitter, accents by beat, a crescendo into each phrase, legato and staccato notes, a small reverb, and an echo keep it from a machine feel. The song fades in, and a new world crossfades. The music starts muted, so a new visitor gets silence until they press the speaker button. The volume and the mute state persist in `localStorage`. Browsers start the sound after the first tap or key press. On iOS a looping silent audio element starts with the same tap, so the music also plays with the ring switch on silent.
- Continents come from three low-frequency noise octaves, so each world gets a few large landmasses with bays and peninsulas, not a spray of islands. Each type has a target land fraction, Earth has 29%, and the sea level is the quantile of the terrain field that leaves that fraction dry. Fine relief fades out at the coast so it cannot cut the shore into specks. A masked ridge term adds a few volcanic island chains. Ocean worlds keep their archipelagos.
- Worlds are stored as seeds, not meshes. A saved world regenerates in about a second and the store stays small.
- Small or coarse-pointer devices get a lower mesh detail, fewer plants, and no shadows.
- The globe is a stylised miniature. A plant and a creature are small against the sphere, so a forest reads as a forest and not as a row of towers. A high-tier world places up to 10,500 plants, and a lush terran world fills that budget. The ocean shimmers on a period of about 14 seconds, so no swell travels across the water.

## Controls

Drag to spin and tilt. Scroll or pinch to zoom. Zoom in close and the view tilts toward the horizon. Get close to the ground to find the wildlife.

At the closest zoom a ring marks the landing site under the screen centre. The ring snaps to a creature home within 3 km, and the planet holds still so the site stays put. The share button copies the URL with the site. A gas giant has no ground, so it gets no marker and no site.

Send a probe to that site to see the world from the ground. Keep the zoom in for half a second at the closest zoom, or press "Send a probe to the surface" in the sidebar. The view dives at the site, fades to the colour of the atmosphere, and the ground appears. Zoom out for half a second at the ceiling of 1,200 m, or press "Recall the probe", to come back to orbit over the same site. The URL reads `#Seed@lat,lon` while the probe is down, for example `#Auralis@12.50,-73.25`, and `#Seed` in orbit. Open a link with a site and the world lands the reader on the ground. A new seed, the dice, and a saved world always return to orbit. A gas giant never gets a probe.

All controls live in one sidebar: the seed input, the current world with its stats and fauna, the share button, the saved worlds, and the music volume. The speaker button in the sidebar header mutes the music. The header button folds the sidebar to one line that shows the current world. On a phone the sidebar docks at the bottom as a sheet, and a tap on the planet folds it away. Press `/` to focus the seed input and `Escape` to close the creature inspector.

## Natural activity

About two worlds in three have one phenomenon, never more. The world type sets the odds of each kind: a volcano with a cone, a crater, smoke and embers; a geyser that erupts every ten seconds or so; a long ragged fissure with side branches that walks across the land and stops at the shore; an aurora that folds around one pole; or a thunderstorm cell where bolts strike down from the atmosphere in two or three strokes, each with a new shape. Ice worlds get cryovolcanoes, cryogeysers, and crevasses. Gas giants get lightning in the great storm or an aurora. The info panel shows the activity of the world.

## Fauna

Every world rolls its own species, two to four of them, from the seed. Each species is a genome:

- a class: land, air, or sub-surface, chosen to fit a niche (meadow, forest, beach, lowland, dune, snow, ash, open sea, cloud deck);
- a locomotion: monopod, biped, tripod, quadruped, hexapod, serpent; gas sac, wings, fins; or a breathing arch, a periscope neck, or a plough that swims under the ground;
- a body plan: blob, spindle, chain, dome, disc, or a swarm of shards around a core;
- a head: beak, mandibles, eye stalks, lure, crest, tusks, or none;
- extras: sail, spikes, lamp beads, tendrils, garden, plates, tail, flukes, antennae, mounds;
- a sociality: solitary, a pair, or a herd of four to fourteen, with the size of the formation in metres.

The geometry is built from those parts. Every vertex carries a rig record (mode, phase, amplitude, weight) and a pivot, and one shader animates all species: legs swing about the hip and fold at the knee on the forward stroke, wing sheets roll at the root and bend toward the tip, tendrils and tails sway, lures and beads pulse, heads nod, flukes lag the body. A per-species carriage moves the whole body: a walk bob, a hop, a wave, a float, an arch pulse, or a rise and sink. Legs only swing while the animal actually moves.

The lore is modular too. The name, the binomial, the habitat, the size, the diet, the manner, and the story are all assembled from the parts the animal really has, so a lantern-headed tripod waits in ambush and a plated hexapod licks minerals from the rock. The manner and the story also say how the animal groups: a grazer moves in herds of twelve, a jawed strider hunts in pairs, and a serpent keeps to itself. The size text gives the real size of the animal in metres, and the ground scale uses the same number.

See `docs/fauna.md` for the architecture: the genome fields, the rig modes, the carriages, and the placement rules.

Creatures roam on procedural paths. Two slow oscillators with per-creature random frequencies steer each one, a leash pulls it back toward its home spot, and grazers stop and start on a third oscillator. Land creatures follow a coarse height map from the worker and turn back at the shoreline. Click a creature, or a species chip in the info card, to open the inspector: a live turntable with the path trace and the species backstory.
