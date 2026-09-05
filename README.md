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

- `worker.js` turns the seed into a hash, a PRNG, and seeded simplex noise. It builds an icosphere, raises terrain, paints biomes per face, places flora, and condenses clouds. It runs off the main thread and reports progress.
- `app.js` renders the result with three.js (flat-shaded vertex colours, instanced flora and clouds, atmosphere shaders, rings, moons). It saves each world's seed, type, and a thumbnail to `localStorage`.
- Worlds are stored as seeds, not meshes. A saved world regenerates in about a second and the store stays small.
- Small or coarse-pointer devices get a lower mesh detail, fewer plants, and no shadows.

## Controls

Drag to spin and tilt. Scroll or pinch to zoom. Zoom in close and the view tilts toward the horizon.
