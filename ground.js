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
import { GroundFauna } from './ground-fauna.js';

export const PATCH_SIZE = 1500;      // metres, the side of the patch
export const FOG_NEAR = 450;         // metres, where the fog starts
export const FOG_FAR = 750;          // metres, where the fog is solid
export const SKY_RADIUS = 5000;      // metres, the sky dome
export const CEILING = 1200;         // metres, the camera ceiling above the site
export const FLOOR = 2;              // metres, the camera floor above the terrain
export const CAM_START = 300;        // metres, the camera starts this far up and this far south
export const RIM = 1500;             // metres, how far the coarse rim reaches from the site

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
    this.tier = tier || { grid: 2, maxFlora: 20000, maxFauna: 300, shadows: true };
    this.result = null;
    this.sky = null;
    this.fauna = null;
    this.atCeiling = false;
    this.lod = { distance: 150, min: 40, max: 400 };   // metres, one knob for issue 11
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
    this.controls.enablePan = false;         // issue 06 adds the pan and the glide
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 5;
    this.controls.maxDistance = SKY_RADIUS * 0.5;   // the ceiling clamp stops the camera, not this
    this.controls.maxPolarAngle = Math.PI * 0.495;  // the camera stays above the ground plane
    this.controls.enabled = false;                  // the app turns the controls on after the dive

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

    if (p) this._buildTerrain();
    else {
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
    // beside them and neither issue touches the file of the other.
    this.fauna = new GroundFauna({
      result, world: this.world, tier: this.tier, camera: this.camera, canvas: this.canvas,
      heightAt: (x, z) => this.heightAt(x, z), onInspect: this.onInspect,
    });
    this.content.add(this.fauna.group);

    // A directional light takes its direction from the position and the target, not the distance,
    // so the height of the site must not move it. The colour and the strength come from the sky.
    const sun = new THREE.DirectionalLight(this.sky.sunColor, this.sky.sunIntensity);
    sun.position.copy(this.sunDir).multiplyScalar(SKY_RADIUS * 0.6);
    this.content.add(sun);
    this.content.add(new THREE.HemisphereLight(this.skyColor, this.groundColor, 0.7 - 0.35 * this.sky.night));

    // the camera starts 300 m up and 300 m south of the site, and it looks at the site
    this.controls.target.set(0, this.base, 0);
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
    this.controls.update();
    const p = this.camera.position, tg = this.controls.target;

    // the target stays inside the fog, so the view always holds ground the reader can see
    const tr = Math.hypot(tg.x, tg.z);
    if (tr > FOG_NEAR) {
      const k = FOG_NEAR / tr;
      tg.x *= k; tg.z *= k;
      this.controls.update();
    }

    // the ceiling: shorten the offset from the target, so the view direction holds
    const ceiling = this.base + CEILING;
    const dy = p.y - tg.y, room = ceiling - tg.y;
    if (dy > room && room > 0) {
      p.sub(tg).multiplyScalar(room / dy).add(tg);
      this.controls.update();
    }
    this.atCeiling = this.camera.position.y >= ceiling - 1;

    // the floor: the camera stays FLOOR metres above the terrain
    const floor = this._groundAt(p.x, p.z) + FLOOR;
    if (p.y < floor) { p.y = floor; this.controls.update(); }

    if (this.fauna) this.fauna.update(t, dt);
    // the sky follows the camera, so it must move after every clamp
    if (this.sky) this.sky.update(t, dt, this.camera);
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
    this.controls.dispose();
    this._clear();
    this.scene.clear();
    this.result = null;
    this.heights = null;
    this.sky = null;
  }

  _clear() {
    if (this.fauna) { this.fauna.dispose(); this.fauna = null; }
    this.content.traverse((o) => {
      if (o === this.content) return;
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.content.clear();
  }
}
