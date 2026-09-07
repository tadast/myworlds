# myworlds

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

## How it works

- `worker.js` turns the seed into a hash, a PRNG, and seeded simplex noise. It builds an icosphere, raises terrain, paints biomes per face, places flora and fauna, and condenses clouds. It runs off the main thread and reports progress.
- `app.js` renders the result with three.js (flat-shaded vertex colours, instanced flora, fauna and clouds, atmosphere shaders, rings, moons). It saves each world's seed, type, and a thumbnail to `localStorage`.
- `species.js` rolls a set of species per world: class, niche, body plan, limbs, head, extras, gait, movement, colours, and modular lore. It runs inside the worker.
- `fauna.js` builds a creature from a genome, rigs it for the vertex shader, steers it, and runs the inspector card.
- `music.js` plays a chip-tune for each world with the Web Audio API. The world type picks a mode, a chord progression, and the wind. A motif in chord-relative degrees repeats over each chord, and every phrase ends in a cadence. The day length and the gravity set the tempo and the root note. The temperature sets the tone. The song fades in, and a new world crossfades. The volume and the mute state persist in `localStorage`. Browsers start the sound after the first tap or key press.
- Worlds are stored as seeds, not meshes. A saved world regenerates in about a second and the store stays small.
- Small or coarse-pointer devices get a lower mesh detail, fewer plants, and no shadows.

## Controls

Drag to spin and tilt. Scroll or pinch to zoom. Zoom in close and the view tilts toward the horizon. Get close to the ground to find the wildlife. The speaker button mutes the music. The slider under the world list sets the volume.

## Fauna

Every world rolls its own species, two to four of them, from the seed. Each species is a genome:

- a class: land, air, or sub-surface, chosen to fit a niche (meadow, forest, beach, lowland, dune, snow, ash, open sea, cloud deck);
- a locomotion: monopod, biped, tripod, quadruped, hexapod, serpent; gas sac, wings, fins; or a breathing arch, a periscope neck, or a plough that swims under the ground;
- a body plan: blob, spindle, chain, dome, disc, or a swarm of shards around a core;
- a head: beak, mandibles, eye stalks, lure, crest, tusks, or none;
- extras: sail, spikes, lamp beads, tendrils, garden, plates, tail, flukes, antennae, mounds.

The geometry is built from those parts. Every vertex carries a rig record (mode, phase, amplitude, weight) and a pivot, and one shader animates all species: legs swing about the hip and fold at the knee on the forward stroke, wing sheets roll at the root and bend toward the tip, tendrils and tails sway, lures and beads pulse, heads nod, flukes lag the body. A per-species carriage moves the whole body: a walk bob, a hop, a wave, a float, an arch pulse, or a rise and sink. Legs only swing while the animal actually moves.

The lore is modular too. The name, the binomial, the habitat, the size, the diet, the manner, and the story are all assembled from the parts the animal really has, so a lantern-headed tripod waits in ambush and a plated hexapod licks minerals from the rock.

See `docs/fauna.md` for the architecture: the genome fields, the rig modes, the carriages, and the placement rules.

Creatures roam on procedural paths. Two slow oscillators with per-creature random frequencies steer each one, a leash pulls it back toward its home spot, and grazers stop and start on a third oscillator. Land creatures follow a coarse height map from the worker and turn back at the shoreline. Click a creature, or a species chip in the info card, to open the inspector: a live turntable with the path trace and the species backstory.
