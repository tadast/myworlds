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
- `fauna.js` holds the creature geometry, their vertex-shader animation, the steering model, the species lore, and the inspector card.
- Worlds are stored as seeds, not meshes. A saved world regenerates in about a second and the store stays small.
- Small or coarse-pointer devices get a lower mesh detail, fewer plants, and no shadows.

## Controls

Drag to spin and tilt. Scroll or pinch to zoom. Zoom in close and the view tilts toward the horizon. Get close to the ground to find the wildlife.

## Fauna

Eight creature kinds, placed by biome: sail-backed stilt-striders on meadows, moss-backed grazers in forests, bladder drifters over open land, shell crawlers on deserts and cooled lava, lantern stalkers on ice, shard swarms and tide worms on coasts, and sky whales over oceans and in gas giant clouds.

Creatures roam on procedural paths. Two slow oscillators with per-creature random frequencies steer each one, a leash pulls it back toward its home spot, and grazers stop and start on a third oscillator. Land creatures follow a coarse height map from the worker and turn back at the shoreline. Click a creature, or a species chip in the info card, to open the inspector: a live turntable with the path trace and the species backstory.
