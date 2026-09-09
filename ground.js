// myworlds — the ground: the second scene the probe lands in.
//
// The globe is a miniature at 1 unit for the planet radius. The ground is true scale: 1 unit is
// 1 metre. The ground keeps its own scene, camera, and controls, and it draws with the renderer
// of the app. The app keeps the globe scene in memory and does not draw it while the probe is down.
//
// Ground frame: x east, y up, z south. The origin is the site at sea level, so heightAt() gives
// the elevation above sea level in metres.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from './ground-sky.js';
import { Flora } from './ground-flora.js';
import { GroundFauna } from './ground-fauna.js';
import { Sea } from './ground-sea.js';
import { perf } from './perf.js';

export const PATCH_SIZE = 1500;      // metres, the side of the patch
export const FOG_NEAR = 450;         // metres, where the fog starts
export const FOG_FAR = 750;          // metres, where the fog is solid
export const SKY_RADIUS = 5000;      // metres, the sky dome
export const CEILING = 1200;         // metres, the camera ceiling above the site
export const FLOOR = 2;              // metres, the camera floor above the terrain
const SHADOW_BOX = 200;     // metres, the half width of the shadow box around the target
// The shadow gate follows the LOD distance, so it must not switch on and off while the knob
// moves. It turns off over SHADOW_OFF LOD distances of height and back on under SHADOW_ON, and it
// holds each state for SHADOW_DWELL. See _driveShadow().
const SHADOW_OFF = 1.35;
const SHADOW_ON = 1.05;
const SHADOW_DWELL = 1500;  // ms

// ---------------------------------------------------------------- the LOD controller, issue 11
const LOD_PERIOD = 500;     // ms between two decisions
const LOD_OVER = 1.1;       // over the target by this much: come down
const LOD_UNDER = 0.7;      // under the target by this much: go out
const LOD_STEADY = 1.02;    // the interval sits at the refresh, so no frame is late
const LOD_DOWN = 0.85;      // the step down
const LOD_UP = 1.1;         // the step up
const LOD_COOL = 3000;      // ms, the quiet time a step down buys before a step up
const LOD_STORE = 'myworlds.lod.v1';
const LOD_START = 150;      // metres, where the knob starts before the store says otherwise
const LOD_MIN = 40;         // metres, the floor of the knob
const LOD_MAX = 400;        // metres, the ceiling of the knob. The tier may lower it; LOW asks 250.

export const CAM_START = 800;        // metres, the camera starts this far up and this far south
export const RIM = 1500;             // metres, how far the coarse rim reaches from the site

// ---------------------------------------------------------------- the camera, issue 06
const TARGET_LIFT = 1;      // metres, the target floats this far over the terrain
const TILT_FREE = 60;       // metres, under this height the reader owns the polar angle
const POLAR_HIGH = 0.62;    // rad, the polar angle at the ceiling: the view looks down
const POLAR_LOW = 1.40;     // rad, the polar angle at TILT_FREE: the view looks out
const POLAR_BAND = 0.06;    // rad, the play the reader keeps at the ceiling
const POLAR_WIDE = 0.25;    // rad, the play the reader keeps at TILT_FREE
const SPEED_SPAN = 400;     // metres, the height where a wheel step reaches its full size
const GLIDE_S = 0.8;        // seconds, the glide to a tapped point
const GLIDE_HIGH = 200;     // metres, a distance over this one shortens on a glide
const GLIDE_PULL = 1 / 3;   // the part of the distance the glide takes off
const TAP_SLOP = 6;         // px, a pointer that moves more than this is a drag, not a tap
const RAY_FAR = 3600;       // metres, how far the tap ray looks for the ground
// The fog opens with the height of the camera. The reader lands 800 m up, and a fog that is solid
// at 750 m would show one flat colour there. The far distance holds under the rim edge, so the
// ground still fades out and the rim never shows a cut edge.
const FOG_LIFT = 1.15;      // metres of fog distance per metre of height
const FOG_MAX = 2100;       // metres, the widest the fog opens

const CHUNKS = 10;           // the fine terrain splits into 10 by 10 meshes, so the frustum culls it
const RIM_STEP = 4;          // the rim uses this many grid steps per cell
const RIM_DEPTH = 2;         // cells outward. The rim is flat, so it needs no more.
const JITTER = 0.055;        // the lightness noise per vertex, so the ground is not one flat swatch
const TILE = 16;             // cells per tile in the index order, to keep the vertex cache warm
// The terrain fills the frame, so its fragment shader sets the cost. A standard material runs a
// full reflection model for a surface that is rough and not metal, and the reader cannot see the
// difference. A Lambert material draws the same ground for about a third less time. The gain puts
// the mean pixel back where the standard material had it: the sheen the Lambert model drops is a
// small constant over a rough surface.
const GROUND_GAIN = 1.06;

const DEFAULT_SUN = new THREE.Vector3(1, 0.55, 0.8).normalize();

// scratch vectors for the camera work, so no frame allocates
const _off = new THREE.Vector3(), _dir = new THREE.Vector3(), _hit = new THREE.Vector3();

// The settled LOD distance per tier. A tier is its own entry, because a low tier holds a
// different value and the reader can move between the two on one machine. The ceiling is part
// of the key, so a value that settled at 400 m on HIGH cannot come back into a LOW session. The
// constructor also clamps what it reads, so an old entry from before this issue is safe too.
function lodKey(tier) {
  return `${tier.grid}|${tier.maxFlora}|${tier.maxFauna}|${tier.shadows ? 1 : 0}|${tier.lodMax || LOD_MAX}`;
}
function readLod(key) {
  try {
    const all = JSON.parse(localStorage.getItem(LOD_STORE) || '{}');
    const v = all[key];
    return typeof v === 'number' && isFinite(v) ? v : null;
  } catch { return null; }
}
function writeLod(key, value) {
  try {
    const all = JSON.parse(localStorage.getItem(LOD_STORE) || '{}');
    all[key] = Math.round(value);
    localStorage.setItem(LOD_STORE, JSON.stringify(all));
  } catch { /* a full or blocked store is not worth a broken frame */ }
}

// small integer hash, the one the worker jitters its faces with
function hash1(i) {
  i = Math.imul(i ^ (i >>> 16), 2246822507);
  i = Math.imul(i ^ (i >>> 13), 3266489909);
  return ((i ^ (i >>> 16)) >>> 0) / 4294967296;
}

// One triangle into a non-indexed position buffer. Returns the next write offset.
function writeTri(pos, o, ax, ay, az, bx, by, bz, cx, cy, cz) {
  pos[o] = ax; pos[o + 1] = ay; pos[o + 2] = az;
  pos[o + 3] = bx; pos[o + 4] = by; pos[o + 5] = bz;
  pos[o + 6] = cx; pos[o + 7] = cy; pos[o + 8] = cz;
  return o + 9;
}

function writeFlat(col, o, tint) {
  for (let k = 0; k < 3; k++) { col[o + k] = tint[k]; col[o + 3 + k] = tint[k]; col[o + 6 + k] = tint[k]; }
  return o + 9;
}

// flatShading takes the normal from the derivatives, so the mesh carries no normal attribute
function makeGeometry(pos, col, idx) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (idx) geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

export class Ground {
  // tier: { grid, maxFlora, maxFauna, shadows }
  constructor({ renderer, canvas, world, site, tier, onInspect }) {
    this.renderer = renderer;
    this.onInspect = onInspect || null;   // the app opens the inspector card for a tapped creature
    this.canvas = canvas;
    this.world = world;
    this.site = site;
    this.tier = tier || { grid: 2, maxFlora: 20000, maxFauna: 300, shadows: true, lodMax: LOD_MAX };
    this.result = null;
    this.sky = null;
    this.flora = null;
    this.fauna = null;
    this.sea = null;
    this.atCeiling = false;
    // The one knob of issue 11, in metres. The flora cards and the coarse fauna meshes both read
    // it. _driveLod() moves it from the frame time; the last settled value comes from the store,
    // so the next landing on this machine starts near the right value. The tier sets the ceiling:
    // 400 m on HIGH and 250 m on LOW.
    const max = this.tier.lodMax || LOD_MAX;
    this.lod = { distance: Math.min(LOD_START, max), min: LOD_MIN, max };
    this._lodKey = lodKey(this.tier);
    this._stored = readLod(this._lodKey);
    if (this._stored !== null) {
      this.lod.distance = Math.min(this.lod.max, Math.max(this.lod.min, this._stored));
    }
    this._lodAt = performance.now();
    this._lodDown = 0;
    this._lodPrev = this.lod.distance;
    this._shadowOn = false;
    this._shadowAt = 0;
    // the height grid of the patch, and the ground height at the site
    this.heights = null;
    this.n = 0; this.grid = 0; this.half = PATCH_SIZE / 2;
    this.base = 0;

    const pal = world.palette || {};
    this.skyColor = new THREE.Color(pal.atmo || '#8fb7ff');
    this.groundColor = new THREE.Color(pal.ground || pal.atmo || '#7fa860');
    this.sunDir = DEFAULT_SUN.clone();

    this.scene = new THREE.Scene();
    this.scene.background = this.skyColor.clone();
    this.scene.fog = new THREE.Fog(this.skyColor.getHex(), FOG_NEAR, FOG_FAR);

    const w = renderer.domElement.clientWidth || 1, h = renderer.domElement.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.5, SKY_RADIUS * 2.2);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 5;
    this.controls.maxDistance = SKY_RADIUS * 0.5;   // the ceiling clamp stops the camera, not this
    this.controls.maxPolarAngle = Math.PI * 0.495;  // the start value; _drive() sets it per frame
    this.controls.enabled = false;                  // the app turns the controls on after the dive
    // The pan slides the target over the ground, not over the screen, so a drag walks the reader
    // across the patch. The right button and two fingers pan. One finger turns the view, and a
    // pinch zooms. _drive() sets the three speeds from the height every frame.
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    // the glide of a tap, and the pointer state that tells a tap from a drag
    this.glide = null;
    this._tap = null;
    this._pointers = 0;
    // The seam for issue 09. It sets pickCreature to a function that returns the creature under
    // the pointer, { point, kind } or null. A tap on a creature glides to it, and the app then
    // opens the inspector through onCreatureTap. A tap on the ground needs neither of them.
    this.pickCreature = null;    // (ndcX, ndcY, event) => { point, kind } | null
    this.onCreatureTap = null;   // (hit) => void, called when the glide ends
    this._bound = {
      down: (e) => this._onDown(e),
      move: (e) => this._onMove(e),
      up: (e) => this._onUp(e),
      wheel: () => { this.glide = null; },   // a wheel step takes the camera back from the glide
    };
    canvas.addEventListener('pointerdown', this._bound.down, { passive: true });
    canvas.addEventListener('pointermove', this._bound.move, { passive: true });
    canvas.addEventListener('pointerup', this._bound.up, { passive: true });
    canvas.addEventListener('pointercancel', this._bound.up, { passive: true });
    canvas.addEventListener('wheel', this._bound.wheel, { passive: true });

    this.content = new THREE.Group();
    this.scene.add(this.content);
  }

  // The worker's patch result, or null for the placeholder ground of issue 03.
  // The sun direction comes from the app, because only the app knows planet.rotation.y. The view
  // comes from the app for the same reason: it holds the sun, the moons, and the ring of the globe
  // in the frame of the site. See ground-sky.js.
  load(result, { sunDir, view } = {}) {
    this.result = result;
    if (sunDir) this.sunDir.copy(sunDir).normalize();
    this._clear();
    this._shadowOn = false;      // the camera arrives 800 m up, where nothing casts
    this._shadowAt = 0;

    const p = result && result.patch;
    this.heights = p ? result.heights : null;
    this.n = p ? p.n : 0;
    this.grid = p ? p.grid : 0;
    this.half = p ? p.size / 2 : PATCH_SIZE / 2;
    this.base = this.heightAt(0, 0);

    // The sky: a gradient dome, the moons, the ring, and the clouds of this world. The fog takes
    // the horizon colour of the dome, so the far terrain and the dome end at one colour and the
    // horizon holds no seam.
    this.sky = new Sky({
      world: this.world, site: this.site, tier: this.tier, renderer: this.renderer,
      view, sunDir: this.sunDir, skyRadius: SKY_RADIUS,
    });
    this.sunDir.copy(this.sky.sunDir);
    this.skyColor.copy(this.sky.horizon);
    this.scene.fog.color.copy(this.sky.horizon);
    this.scene.background = this.sky.horizon.clone();
    this.content.add(this.sky.group);

    // The sea: a plane at sea level with waves, when the world owns an ocean and the patch dips
    // below the water line. See ground-sea.js. Over open sea it also tints the fog.
    this.sea = Sea.create({ world: this.world, patch: p, heightAt: (x, z) => this._groundAt(x, z) });
    if (this.sea) {
      this.content.add(this.sea.group);
      this.sea.tintFog(this.scene);
    }

    if (p) {
      this._buildTerrain();
      this._buildFlora(result);
    } else {
      // the placeholder ground of issue 03: one flat plane in the ground colour of the palette
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(PATCH_SIZE, PATCH_SIZE, 1, 1),
        new THREE.MeshStandardMaterial({ color: this.groundColor, flatShading: true, roughness: 0.95, metalness: 0 }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.receiveShadow = !!this.tier.shadows;
      this.content.add(plane);
    }

    // The animals of this site, in groups. They keep their own file, so issue 07 can add the flora
    // beside them and neither issue touches the file of the other. The animals take the same LOD
    // knob the plants take: a near mesh under lod.distance, a coarse mesh past it.
    this.fauna = new GroundFauna({
      result, world: this.world, tier: this.tier, camera: this.camera, canvas: this.canvas,
      heightAt: (x, z) => this.heightAt(x, z), onInspect: this.onInspect, lod: this.lod,
    });
    this.content.add(this.fauna.group);

    // Fill the seam of issue 06: a tap on an animal glides to it first, then opens its card.
    this.pickCreature = (nx, ny, e) => {
      const r = this.canvas.getBoundingClientRect();
      const px = (nx + 1) / 2 * r.width, py = (1 - ny) / 2 * r.height;
      return this.fauna.pickHit(px, py, e && e.pointerType === 'touch' ? 52 : 34);
    };
    this.onCreatureTap = (hit) => { if (this.onInspect) this.onInspect(hit.kind); };

    // A directional light takes its direction from the position and the target, not the distance,
    // so the height of the site must not move it. The colour and the strength come from the sky.
    const sun = new THREE.DirectionalLight(this.sky.sunColor, this.sky.sunIntensity);
    sun.position.copy(this.sunDir).multiplyScalar(SKY_RADIUS * 0.6);
    // The sun casts on HIGH, which is what the budget table promises. A shadow box of 200 m
    // around the target holds the plants the reader can see; _driveShadow() moves it every frame.
    // The map costs about 2.2 ms, so the sun only casts when the camera is low enough that a near
    // mesh exists at all. Above the LOD distance every plant is a card, no card casts, and the map
    // would draw nothing. That is why the reader pays for the shadow at the water line and not at
    // the ceiling.
    sun.castShadow = !!this.tier.shadows;
    if (sun.castShadow) {
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera;
      c.left = -SHADOW_BOX; c.right = SHADOW_BOX; c.top = SHADOW_BOX; c.bottom = -SHADOW_BOX;
      c.near = SKY_RADIUS * 0.6 - SHADOW_BOX * 4;
      c.far = SKY_RADIUS * 0.6 + SHADOW_BOX * 4;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.6;
      c.updateProjectionMatrix();
    }
    this.sun = sun;
    this.content.add(sun);
    this.content.add(sun.target);
    this.content.add(new THREE.HemisphereLight(this.skyColor, this.groundColor, 0.7 - 0.35 * this.sky.night));

    // The reveal: the camera starts 800 m up and 800 m south of the site, and it looks at the
    // site. The reader sees the patch from over the fog and zooms in.
    this.glide = null;
    this.controls.target.set(0, this.base + TARGET_LIFT, 0);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(0, this.base + CAM_START, CAM_START);
    this.controls.update();
    return this;
  }

  // ---------------------------------------------------------------- the terrain mesh
  // The patch is a square height grid. The mesh is indexed and flat-shaded, so it reads like the
  // globe. The grid splits into chunks, because one mesh of a million triangles cannot be culled
  // and the camera sees only a part of it.
  _buildTerrain() {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    mat.color.setScalar(GROUND_GAIN);
    this.terrainMat = mat;
    this._addBlocks(0, this.n - 1, 0, this.n - 1, mat);

    // The rim fills the fog out to RIM metres. It holds the height of the patch edge, so it needs
    // cells only along the edge and two cells outward.
    const h = this.half, r = RIM;
    this.content.add(this._mesh(this._bandGeometry(-r, r, -r, -h), mat));
    this.content.add(this._mesh(this._bandGeometry(-r, r, h, r), mat));
    this.content.add(this._mesh(this._bandGeometry(-r, -h, -h, h), mat));
    this.content.add(this._mesh(this._bandGeometry(h, r, -h, h), mat));
  }

  // The plants of the patch. ground-flora.js owns the meshes, the cards, and the LOD walk.
  _buildFlora(result) {
    if (!result.flora || result.flora.length === 0) return;
    this.flora = new Flora({
      renderer: this.renderer, flora: result.flora, palette: result.patch.palette,
      tier: this.tier, sky: this.sky, lod: this.lod, cut: FOG_FAR * 1.2,
      groundColor: this.groundColor,
    });
    this.content.add(this.flora.group);
    console.info(`[myworlds] ground flora ${this.flora.count} plants in ${this.flora.kinds.length} kinds`);
  }

  // Split a cell range into blocks of about one tenth of the patch, so the frustum can cull them.
  _addBlocks(i0, i1, j0, j1, mat) {
    const b = Math.ceil((this.n - 1) / CHUNKS);
    for (let j = j0; j < j1; j += b) {
      const je = Math.min(j + b, j1);
      for (let i = i0; i < i1; i += b) {
        this.content.add(this._mesh(this._gridGeometry(i, Math.min(i + b, i1), j, je), mat));
      }
    }
  }

  _mesh(geo, mat) {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = !!this.tier.shadows;
    return m;
  }

  // One block of the terrain, from cell i0 to i1 and j0 to j1.
  // The mesh is indexed: a grid vertex belongs to six triangles, so an indexed block runs the
  // vertex shader about six times less than a block that repeats every vertex. flatShading still
  // takes the normal from the derivatives, so the facets stay. The colour is per vertex and the
  // reader sees it smoothed over one cell, which the eye cannot separate from a colour per face.
  // The index runs in tiles of TILE cells, so a vertex stays in the cache of the graphics card
  // between the two rows that use it.
  _gridGeometry(i0, i1, j0, j1) {
    const n = this.n, g = this.grid, half = this.half, H = this.heights, C = this.result.colors;
    const w = i1 - i0 + 1, d = j1 - j0 + 1;
    const pos = new Float32Array(w * d * 3), col = new Float32Array(w * d * 3);
    let o = 0;
    for (let j = j0; j <= j1; j++) {
      const z = -half + j * g, jn = j * n;
      for (let i = i0; i <= i1; i++) {
        const k = jn + i, c3 = k * 3;
        pos[o] = -half + i * g; pos[o + 1] = H[k]; pos[o + 2] = z;
        const t = 1 + (hash1(k) - 0.5) * 2 * JITTER;
        col[o] = C[c3] * t; col[o + 1] = C[c3 + 1] * t; col[o + 2] = C[c3 + 2] * t;
        o += 3;
      }
    }
    const idx = w * d > 65536 ? new Uint32Array((w - 1) * (d - 1) * 6) : new Uint16Array((w - 1) * (d - 1) * 6);
    let m = 0;
    for (let js = 0; js < d - 1; js += TILE) {
      const je = Math.min(js + TILE, d - 1);
      for (let is = 0; is < w - 1; is += TILE) {
        const ie = Math.min(is + TILE, w - 1);
        for (let j = js; j < je; j++) {
          for (let i = is; i < ie; i++) {
            const a = j * w + i, b = a + 1, c = a + w, e = c + 1;
            // two triangles per cell, wound so the normal points up
            idx[m] = a; idx[m + 1] = c; idx[m + 2] = e;
            idx[m + 3] = a; idx[m + 4] = e; idx[m + 5] = b;
            m += 6;
          }
        }
      }
    }
    return makeGeometry(pos, col, idx);
  }

  // One band of the rim. The heights and the colours come from the nearest point of the patch,
  // so the band joins the edge and stays flat outward. The band keeps the step along the edge of
  // the patch and takes only RIM_DEPTH cells outward, because it is flat that way.
  _bandGeometry(x0, x1, z0, z1) {
    const step = this.grid * RIM_STEP;
    let nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step));
    if (x1 - x0 < z1 - z0) nx = Math.min(nx, RIM_DEPTH); else nz = Math.min(nz, RIM_DEPTH);
    const pos = new Float32Array(nx * nz * 2 * 9), col = new Float32Array(nx * nz * 2 * 9);
    const xs = new Float32Array(nx + 1), zs = new Float32Array(nz + 1);
    for (let i = 0; i <= nx; i++) xs[i] = x0 + (x1 - x0) * i / nx;
    for (let j = 0; j <= nz; j++) zs[j] = z0 + (z1 - z0) * j / nz;
    const tint = [0, 0, 0];
    let o = 0, f = 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const xa = xs[i], xb = xs[i + 1], za = zs[j], zb = zs[j + 1];
        const ya = this._edgeHeight(xa, za), yb = this._edgeHeight(xb, za);
        const yc = this._edgeHeight(xa, zb), yd = this._edgeHeight(xb, zb);
        o = writeTri(pos, o, xa, ya, za, xa, yc, zb, xb, yd, zb);
        this._edgeColor((xa + xb) / 2, (za + zb) / 2, tint);
        f = writeFlat(col, f, tint);
        o = writeTri(pos, o, xa, ya, za, xb, yd, zb, xb, yb, za);
        f = writeFlat(col, f, tint);
      }
    }
    return makeGeometry(pos, col);
  }

  // The nearest grid index of the patch to a point, clamped into the grid.
  _edgeIndex(x, z) {
    const n = this.n, g = this.grid, half = this.half;
    const i = Math.min(n - 1, Math.max(0, Math.round((x + half) / g)));
    const j = Math.min(n - 1, Math.max(0, Math.round((z + half) / g)));
    return j * n + i;
  }

  _edgeHeight(x, z) {
    return this.heights ? this.heights[this._edgeIndex(x, z)] : 0;
  }

  _edgeColor(x, z, out) {
    const k = this._edgeIndex(x, z) * 3, C = this.result.colors;
    out[0] = C[k]; out[1] = C[k + 1]; out[2] = C[k + 2];
    return out;
  }

  update(t, dt) {
    this._drive();               // the speeds and the tilt, both from the height of the camera
    this.controls.update();
    if (this.glide) this._stepGlide(dt);
    const p = this.camera.position, tg = this.controls.target;

    // The target stays inside the fog, so the view always holds ground the reader can see. The
    // camera takes the same step, so a pan that reaches the limit stops the whole view there
    // instead of sliding the camera on over a target that cannot follow.
    const tr = Math.hypot(tg.x, tg.z);
    if (tr > FOG_NEAR) {
      const k = FOG_NEAR / tr - 1;
      const dx = tg.x * k, dz = tg.z * k;
      tg.x += dx; tg.z += dz;
      p.x += dx; p.z += dz;
    }

    // The target rides the terrain, so it never sinks under a hill. The camera takes the same
    // step, which holds the view direction and the distance while the reader pans over relief.
    const lift = this._groundAt(tg.x, tg.z) + TARGET_LIFT - tg.y;
    if (Math.abs(lift) > 1e-4) { tg.y += lift; p.y += lift; }

    // the ceiling: shorten the offset from the target, so the view direction holds
    const ceiling = this.base + CEILING;
    const dy = p.y - tg.y, room = ceiling - tg.y;
    if (dy > room && room > 0) p.sub(tg).multiplyScalar(room / dy).add(tg);
    this.atCeiling = p.y >= ceiling - 1;

    // the floor: the camera stays FLOOR metres above the terrain, and above the sea over water.
    // Issue 06 ends the clamp block with one lookAt, so no controls.update() runs here.
    const under = this._groundAt(p.x, p.z);
    const floor = (this.sea ? Math.max(under, this.sea.level) : under) + FLOOR;
    if (p.y < floor) p.y = floor;

    // The clamps move the camera after controls.update() aimed it, so it must aim again. One
    // lookAt costs far less than a second controls.update(), and a second update would apply
    // the damping twice and make every drag run faster than the reader asked for.
    this.camera.lookAt(tg);

    // The fog opens with the height, so the patch reads from the ceiling and closes in at the
    // ground. The ratio of the near to the far distance holds, so the depth of the fade holds.
    const fog = this.scene.fog;
    if (fog) {
      fog.far = Math.min(FOG_FAR + FOG_LIFT * Math.max(0, p.y - this.base), FOG_MAX);
      fog.near = fog.far * (FOG_NEAR / FOG_FAR);
    }

    // the knob moves before the three parts that read it: the shadow gate, the animals, the plants
    this._driveLod();
    this._driveShadow();
    if (this.fauna) this.fauna.update(t, dt);
    // the sky follows the camera, so it must move after every clamp
    if (this.sky) this.sky.update(t, dt, this.camera);
    // the sea follows the target, so it must move after the target clamp
    if (this.sea) this.sea.update(t, tg);

    // the LOD walk reads the camera, so it runs after the clamps too
    if (this.flora) this.flora.update(this.camera);
  }

  // The LOD controller: one knob, from the frame time. Every LOD_PERIOD it reads the rolling
  // averages of perf.js. Over the target it pulls the distance in, and with room to spare it
  // pushes the distance out. The value stays inside [min, max]. The clock drops the dive, the
  // first second after load, and any frame over 100 ms, so a tab switch cannot move the knob.
  //
  // The two steps read two numbers, because one number cannot answer both questions. The frame
  // interval says the machine is late, but the display holds it at the refresh, so it can never
  // fall 30% under the target and it can never ask for a step out. The work of the frame can. So
  // the knob comes down when the interval misses the target, and it goes out when the interval
  // sits at the refresh and the app uses less than 70% of the frame. A step down also buys
  // LOD_COOL of quiet, so the knob cannot ring around the value where the machine is exactly at
  // the refresh.
  _driveLod() {
    const now = performance.now();
    if (now - this._lodAt < LOD_PERIOD) return;
    this._lodAt = now;
    if (!perf.ready) return;
    const lod = this.lod, avg = perf.avg, work = perf.avgWork, target = perf.target;
    let d = lod.distance;
    if (avg > target * LOD_OVER) { d *= LOD_DOWN; this._lodDown = now; }
    else if (avg < target * LOD_STEADY && work < target * LOD_UNDER && now - this._lodDown > LOD_COOL) d *= LOD_UP;
    lod.distance = Math.min(lod.max, Math.max(lod.min, d));
    // A value that holds over two decisions is settled. It goes to the store, but only when it
    // has moved away from the value that is already there, so a settled site writes once.
    if (lod.distance === this._lodPrev
      && (this._stored === null || Math.abs(lod.distance - this._stored) > lod.distance * 0.02)) {
      this._stored = lod.distance;
      writeLod(this._lodKey, lod.distance);
    }
    this._lodPrev = lod.distance;
  }

  // The shadow box follows the target and only lives near the ground. A plant and an animal cast
  // only while they are near meshes, and both are near meshes only within lod.distance of the
  // camera. So a camera higher than that distance has no caster under it, and the map would cost
  // 2.2 ms to draw an empty frame.
  //
  // The gate now moves with the knob, and the knob moves with the frame time the shadow itself
  // sets. A single threshold would therefore ring: the shadow starts, the frame gets slower, the
  // knob comes in, the gate goes over the camera, the shadow stops. So the gate takes two
  // thresholds and a dwell. It turns off over SHADOW_OFF distances of height and back on under
  // SHADOW_ON, which is a band of 29%, wider than one step of the knob at 15%. It also holds each
  // state for SHADOW_DWELL, which is three decisions of the controller.
  _driveShadow() {
    const sun = this.sun;
    if (!sun || !this.tier.shadows) return;
    const tg = this.controls.target;
    const h = this.cameraHeight;
    const now = performance.now();
    const want = h < this.lod.distance * (this._shadowOn ? SHADOW_OFF : SHADOW_ON);
    if (want !== this._shadowOn && now - this._shadowAt > SHADOW_DWELL) {
      this._shadowOn = want;
      this._shadowAt = now;
    }
    sun.castShadow = this._shadowOn;
    if (!this._shadowOn) return;
    sun.target.position.set(tg.x, tg.y, tg.z);
    sun.position.copy(this.sunDir).multiplyScalar(SKY_RADIUS * 0.6).add(sun.target.position);
    sun.target.updateMatrixWorld();
  }

  // The height of the camera over the ground under it, in metres. The shadow gate reads it, and
  // the overlay of `?perf` shows it. It follows the rim, so it holds outside the patch as well.
  get cameraHeight() {
    const p = this.camera.position;
    return p.y - this._groundAt(p.x, p.z);
  }

  // ---------------------------------------------------------------- the feel of the controls
  // The height of the camera sets the speeds and the tilt. Near the ground a wheel step moves a
  // metre or two and the view looks out at the horizon. At the ceiling a step moves about a
  // hundred metres and the view looks down on the patch, as the globe does with its pitch.
  _drive() {
    const p = this.camera.position, tg = this.controls.target;
    const h = Math.max(0, p.y - this._groundAt(p.x, p.z));
    const near = THREE.MathUtils.clamp(h / SPEED_SPAN, 0.06, 1);
    this.controls.rotateSpeed = 0.35 + 0.35 * near;
    this.controls.zoomSpeed = 0.9 + 1.6 * near;
    this.controls.panSpeed = 0.5 + 0.5 * near;

    // The tilt runs from the ceiling down to TILT_FREE. The height sets the polar angle the view
    // wants, and a band around it holds the play the reader keeps. The band is narrow high up, so
    // the view turns from the patch below to the horizon as the reader comes down. Under
    // TILT_FREE the band opens to a half turn and the reader owns the polar angle.
    const k = THREE.MathUtils.smoothstep(h, TILT_FREE, CEILING);
    const free = 1 - THREE.MathUtils.smoothstep(h, TILT_FREE, TILT_FREE * 2);
    const want = THREE.MathUtils.lerp(POLAR_LOW, POLAR_HIGH, k);
    const band = THREE.MathUtils.lerp(THREE.MathUtils.lerp(POLAR_WIDE, POLAR_BAND, k), Math.PI, free);
    // At this distance the camera meets the floor at this polar angle, and it cannot pass it.
    const d = Math.max(1e-3, p.distanceTo(tg));
    const cap = Math.acos(THREE.MathUtils.clamp((this._groundAt(p.x, p.z) + FLOOR - tg.y) / d, -0.32, 1));
    const min = Math.max(0.05, want - band);
    this.controls.minPolarAngle = min;
    this.controls.maxPolarAngle = Math.max(min + 0.01, Math.min(cap, want + band));
  }

  // ---------------------------------------------------------------- the glide
  // A tap moves the target to the point under the pointer over GLIDE_S seconds with an ease-out.
  // A camera over GLIDE_HIGH metres from its target also comes a third of the way in, so a tap
  // from high up both aims and closes. The reader keeps the view direction: only the offset
  // length changes, so a turn during the glide still works.
  glideTo(point, done) {
    const to = point.clone();
    const r = Math.hypot(to.x, to.z);
    if (r > FOG_NEAR) { const k = FOG_NEAR / r; to.x *= k; to.z *= k; }
    to.y = this._groundAt(to.x, to.z) + TARGET_LIFT;
    const d0 = this.camera.position.distanceTo(this.controls.target);
    const d1 = d0 > GLIDE_HIGH ? d0 * (1 - GLIDE_PULL) : d0;
    this.glide = { k: 0, from: this.controls.target.clone(), to, d0, d1, done: done || null };
    return this.glide;
  }

  _stepGlide(dt) {
    const g = this.glide;
    g.k = Math.min(1, g.k + dt / GLIDE_S);
    const e = 1 - Math.pow(1 - g.k, 3);
    const p = this.camera.position, tg = this.controls.target;
    const off = _off.copy(p).sub(tg);
    tg.lerpVectors(g.from, g.to, e);
    p.copy(tg).add(off.setLength(THREE.MathUtils.lerp(g.d0, g.d1, e)));
    if (g.k >= 1) { this.glide = null; if (g.done) g.done(); }
  }

  // Where the ray from a point on the screen meets the ground, or null. The terrain is a height
  // field, so a march over the field costs less than a triangle test over a million faces, and it
  // reads the rim as well. The step grows with the distance, because a far cell covers few pixels.
  groundAtPointer(nx, ny) {
    const o = this.camera.position;
    const d = _dir.set(nx, ny, 0.5).unproject(this.camera).sub(o).normalize();
    let t = 0.5;
    if (o.y + d.y * t <= this._groundAt(o.x + d.x * t, o.z + d.z * t)) return _hit.copy(o).addScaledVector(d, t).clone();
    while (t < RAY_FAR) {
      const t1 = Math.min(RAY_FAR, t + Math.max(1, t * 0.02));
      if (o.y + d.y * t1 <= this._groundAt(o.x + d.x * t1, o.z + d.z * t1)) {
        let lo = t, hi = t1;
        for (let i = 0; i < 24; i++) {
          const m = (lo + hi) / 2;
          if (o.y + d.y * m <= this._groundAt(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m;
        }
        return _hit.copy(o).addScaledVector(d, hi).clone();
      }
      if (t1 >= RAY_FAR) break;
      t = t1;
    }
    return null;
  }

  // ---------------------------------------------------------------- the pointer
  // A tap glides. A drag does not, so a turn, a pan, and a pinch stay free of the glide. The
  // handlers never call preventDefault, so the sheet of the sidebar still folds on a tap.
  _onDown(e) {
    this._pointers++;
    if (this._pointers > 1) { this._tap = null; return; }   // two fingers pan or pinch
    const mouse = e.pointerType === 'mouse';
    this._tap = (!mouse || e.button === 0) ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
  }

  _onMove(e) {
    const tap = this._tap;
    if (!tap || e.pointerId !== tap.id) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) { this._tap = null; this.glide = null; }
  }

  _onUp(e) {
    this._pointers = Math.max(0, this._pointers - 1);
    const tap = this._tap;
    this._tap = null;
    if (!tap || tap.id !== e.pointerId || e.type === 'pointercancel' || !this.controls.enabled) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) return;
    const r = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    const creature = this.pickCreature ? this.pickCreature(nx, ny, e) : null;   // the seam of issue 09
    if (creature && creature.point) {
      this.glideTo(creature.point, () => { if (this.onCreatureTap) this.onCreatureTap(creature); });
      return;
    }
    const hit = this.groundAtPointer(nx, ny);
    if (hit) this.glideTo(hit);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // The elevation above sea level in metres, bilinear on the grid. Outside the patch it reads 0,
  // as the contract asks. Use _groundAt() for a camera clamp, because that one follows the rim.
  heightAt(x, z) {
    const H = this.heights;
    if (!H) return 0;
    const n = this.n, half = this.half;
    const u = (x + half) / this.grid, v = (z + half) / this.grid;
    if (!(u >= 0 && v >= 0 && u <= n - 1 && v <= n - 1)) return 0;
    const i0 = Math.min(n - 2, Math.floor(u)), j0 = Math.min(n - 2, Math.floor(v));
    const fx = u - i0, fz = v - j0;
    const a = H[j0 * n + i0], b = H[j0 * n + i0 + 1];
    const c = H[(j0 + 1) * n + i0], d = H[(j0 + 1) * n + i0 + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  // The drawn ground height, the rim included. The rim holds the height of the patch edge, so a
  // point outside the patch reads the height of the nearest edge point.
  _groundAt(x, z) {
    if (!this.heights) return 0;
    const h = this.half - this.grid * 0.5;
    return this.heightAt(Math.min(h, Math.max(-h, x)), Math.min(h, Math.max(-h, z)));
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._bound.down);
    this.canvas.removeEventListener('pointermove', this._bound.move);
    this.canvas.removeEventListener('pointerup', this._bound.up);
    this.canvas.removeEventListener('pointercancel', this._bound.up);
    this.canvas.removeEventListener('wheel', this._bound.wheel);
    this.glide = null;
    this.controls.dispose();
    this._clear();
    this.scene.clear();
    this.result = null;
    this.heights = null;
    this.sky = null;
    this.sea = null;
  }

  _clear() {
    if (this.flora) { this.flora.dispose(); this.flora = null; }
    if (this.fauna) { this.fauna.dispose(); this.fauna = null; }
    this.content.traverse((o) => {
      if (o === this.content) return;
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.content.clear();
  }
}
