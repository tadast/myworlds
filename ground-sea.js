// myworlds — the sea on the ground: a plane at sea level with waves that read as water.
//
// The globe draws its ocean as a shell over a miniature, so it may only shimmer. The ground draws
// the same water at 1 unit per metre, so the reader stands at the water line and must see facets a
// few metres across that move at a walking pace.
//
// The sea is one plane at y = 0. It is translucent on a water world, so the sea bed of the patch
// reads through it, and the worker darkens that bed with the depth. A lava sea glows and an ice
// sea is still and opaque, as on the globe.
//
// The grid follows the camera target: 1 m cells within 200 m of the target, then an 8 m ring, then
// large cells to the far edge. The waves fade out over the last 50 m of the wave zone, so the water
// past 200 m is flat. A flat sheet needs no grid: one large quad takes the same colour, the same
// light, and the same fog as a thousand small ones, because the fog depth is a varying and the
// renderer reads it per pixel. That cut takes the sea from 449,000 triangles to 324,000, and a
// mask that drops the blocks standing under land takes about a quarter more off a coast.
import * as THREE from 'three';

export const FINE = 200;        // metres, the reach of the 1 m cells from the camera target
export const FINE_STEP = 1;
export const MID = 264;         // metres, the reach of the 8 m ring
export const MID_STEP = 8;
export const REACH = 1128;      // metres, the far edge of the sea from the camera target
export const FAR_STEP = 108;    // metres, the cell of the flat water past MID
export const BLOCKS = 6;        // the wave zone splits into 6 by 6 meshes, to cull and to mask them
export const MASK_STEP = 4;     // metres, the stride the mask reads the terrain at
export const MASK_MARGIN = 1;   // metres, a block hides only when the ground stands this far up

export const WAVE_A = 0.12;     // metres, the wave amplitude on water
export const LAVA_A = 0.05;     // metres, the wave amplitude on lava. Lava is thick, so it moves less.
export const TAPER = [150, 200];  // metres, the band the waves fade out over

// Two crossed sine sets. The first is 2 m long with a period of 6 s, the second is 5 m with a
// period of 9 s. A crest of the first then travels 0.33 m/s and a crest of the second 0.56 m/s, so
// no swell crosses the patch in a few seconds. Neither direction lies along the grid, so the 2 m
// set does not land on the 1 m cells at the same phase every time.
const WAVES = [
  { len: 2, period: 6, dir: [1, 0.28], weight: 0.55 },
  { len: 5, period: 9, dir: [-0.42, 1], weight: 0.45 },
];

function num(v) { return v.toFixed(6); }

// The sample coordinates from a to b at about one step per cell.
function samples(a, b, step) {
  const n = Math.max(1, Math.round((b - a) / step));
  const out = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) out[i] = a + (b - a) * i / n;
  return out;
}

export class Sea {
  // Returns a sea, or null when the site needs none. The world must own an ocean and the patch
  // must hold at least one vertex below sea level. An inland patch then costs nothing.
  static create(opts) {
    const { world, patch } = opts;
    if (!world || !patch || !world.hasOcean || !patch.hasSea) return null;
    if (!(world.palette && world.palette.ocean)) return null;
    return new Sea(opts);
  }

  constructor({ world, patch, heightAt }) {
    const pal = world.palette;
    // the drawn ground height, so the sea can drop the blocks that stand under land
    this.heightAt = heightAt || null;
    this.waveBlocks = [];
    this._cx = NaN; this._cz = NaN;
    this.level = patch.seaLevel || 0;
    // open sea: every vertex of the patch lies below the water line
    this.open = !patch.shore;
    this.color = new THREE.Color(pal.ocean);
    this.lava = !!pal.oceanLava;
    this.ice = !!pal.oceanIce;
    this.amp = this.ice ? 0 : this.lava ? LAVA_A : WAVE_A;

    this.group = new THREE.Group();
    this.group.position.y = this.level;
    this.material = this._material(pal);
    this._build();
  }

  // The material follows the globe: the ocean colour, the ocean opacity, and an emissive lava sea.
  // It is Lambert and not standard for the reason the terrain is: the water fills a large part of
  // the frame, and a full reflection model buys nothing on a surface the reader reads as flat
  // facets. flatShading takes the normal from the derivatives, so the facets follow the waves.
  _material(pal) {
    const mat = new THREE.MeshLambertMaterial({
      color: this.color,
      transparent: pal.oceanOpacity < 1,
      opacity: pal.oceanOpacity || 1,
      flatShading: true,
      emissive: this.lava ? this.color : new THREE.Color(0x000000),
      emissiveIntensity: this.lava ? 0.9 : 0,
      // The material keeps the front side only. At a low eye the waves turn about half the facets
      // away from the camera, and a double-sided material draws every one of them. The camera floor
      // holds the eye 2 m over the water, so the reader never looks at the back of the surface.
      side: THREE.FrontSide,
    });
    if (this.amp > 0) this._addWaves(mat);
    return mat;
  }

  // The waves live in the vertex shader. The phase reads the world position, so the pattern stays
  // on the water while the plane follows the camera target.
  _addWaves(mat) {
    let sum = '';
    for (const w of WAVES) {
      const d = Math.hypot(w.dir[0], w.dir[1]);
      const k = 2 * Math.PI / w.len, s = 2 * Math.PI / w.period;
      sum += `+ sin(dot(wp, vec2(${num(w.dir[0] / d * k)}, ${num(w.dir[1] / d * k)})) + uTime * ${num(s)}) * ${num(w.weight)}`;
    }
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec2 wp = (modelMatrix * vec4(transformed, 1.0)).xz;
          float fade = 1.0 - smoothstep(${num(TAPER[0])}, ${num(TAPER[1])}, max(abs(position.x), abs(position.z)));
          transformed.y += (0.0 ${sum}) * ${num(this.amp)} * fade;`);
      mat.userData.shader = sh;
    };
  }

  // The wave zone is a square of 1 m cells FINE metres each way from the centre. Two flat rings
  // carry the water from there to the far edge. The rings hold no waves, so a large cell draws the
  // same water as a small one: the colour and the light are constant over a flat face, and the fog
  // depth is a varying, so the renderer reads it per pixel. The wave zone and the first ring meet
  // on a line at y = 0, because the waves fade to zero by FINE, so the join shows no step.
  _build() {
    this.cells = 0;
    if (this.amp > 0) {
      this._addGrid(-FINE, FINE, -FINE, FINE, FINE_STEP, BLOCKS, this.waveBlocks);
      this._addRing(FINE, MID, MID_STEP);
      this._addRing(MID, REACH, FAR_STEP);
    } else {
      // a still sea is flat everywhere, so it takes one coarse grid
      this._addGrid(-REACH, REACH, -REACH, REACH, FAR_STEP, 1);
    }
  }

  // A square of cells, split into a grid of meshes so the frustum can cull it. out collects the
  // meshes with the bounds the mask reads.
  _addGrid(x0, x1, z0, z1, step, blocks, out) {
    const xs = samples(x0, x1, step), zs = samples(z0, z1, step);
    const bx = Math.ceil((xs.length - 1) / blocks), bz = Math.ceil((zs.length - 1) / blocks);
    for (let j = 0; j + 1 < zs.length; j += bz) {
      const je = Math.min(j + bz, zs.length - 1);
      for (let i = 0; i + 1 < xs.length; i += bx) {
        const ie = Math.min(i + bx, xs.length - 1);
        const mesh = this._add(this._block(xs, zs, i, ie, j, je));
        if (out) out.push({ mesh, x0: xs[i], x1: xs[ie], z0: zs[j], z1: zs[je] });
      }
    }
  }

  // A flat ring from a to b, as four bands. The bands meet the wave zone and each other on lines
  // at y = 0, so no band needs the step of its neighbour.
  _addRing(a, b, step) {
    const xs = samples(-b, b, step), zn = samples(-b, -a, step), zf = samples(a, b, step);
    const xw = samples(-b, -a, step), xe = samples(a, b, step), zm = samples(-a, a, step);
    this._add(this._block(xs, zn, 0, xs.length - 1, 0, zn.length - 1));
    this._add(this._block(xs, zf, 0, xs.length - 1, 0, zf.length - 1));
    this._add(this._block(xw, zm, 0, xw.length - 1, 0, zm.length - 1));
    this._add(this._block(xe, zm, 0, xe.length - 1, 0, zm.length - 1));
  }

  _add(geo) {
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    this.group.add(mesh);
    this.cells += geo.index.count / 6;
    return mesh;
  }

  // The mask: a block of the wave zone that stands under land draws nothing the reader can see,
  // because the terrain is opaque and the camera stays above it. On a coast that drops about a
  // quarter of the sea. The mask reads the drawn ground height every MASK_STEP metres and keeps a
  // block as soon as one sample lies at or under the water line, so it can only keep too much.
  _mask() {
    if (!this.heightAt) return;
    const ox = this.group.position.x, oz = this.group.position.z;
    for (const b of this.waveBlocks) {
      let wet = false;
      for (let x = b.x0; x <= b.x1 && !wet; x += MASK_STEP) {
        for (let z = b.z0; z <= b.z1; z += MASK_STEP) {
          if (this.heightAt(x + ox, z + oz) <= MASK_MARGIN) { wet = true; break; }
        }
      }
      b.mesh.visible = wet;
    }
  }

  // One block of the plane, from sample i0 to i1 across and j0 to j1 along. The mesh is indexed and
  // wound so the normal points up, as the terrain is.
  _block(xs, zs, i0, i1, j0, j1) {
    const w = i1 - i0 + 1, d = j1 - j0 + 1;
    const pos = new Float32Array(w * d * 3);
    let o = 0;
    for (let j = j0; j <= j1; j++) {
      const z = zs[j];
      for (let i = i0; i <= i1; i++) { pos[o] = xs[i]; pos[o + 1] = 0; pos[o + 2] = z; o += 3; }
    }
    const cells = (w - 1) * (d - 1) * 6;
    const idx = w * d > 65536 ? new Uint32Array(cells) : new Uint16Array(cells);
    let m = 0;
    for (let j = 0; j < d - 1; j++) {
      for (let i = 0; i < w - 1; i++) {
        const a = j * w + i, b = a + 1, c = a + w, e = c + 1;
        idx[m] = a; idx[m + 1] = c; idx[m + 2] = e;
        idx[m + 3] = a; idx[m + 4] = e; idx[m + 5] = b;
        m += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    // the waves lift the surface, so the sphere must hold them or the frustum culls a near block
    geo.boundingSphere.radius += this.amp;
    return geo;
  }

  // Over open sea the fog takes 30% of the ocean colour, so the far water does not fade into a
  // band of sky. The dome keeps its own colour, so the horizon reads as a water line.
  tintFog(scene) {
    if (this.open && scene.fog) scene.fog.color.lerp(this.color, 0.3);
    return this;
  }

  // The plane follows the camera target, so the fine cells stay where the reader looks. It snaps to
  // a whole metre, because the wave phase reads the world position and a smooth slide would drag
  // the fine cells across the pattern.
  update(t, target) {
    const sh = this.material.userData.shader;
    if (sh) sh.uniforms.uTime.value = t;
    if (!target) return;
    const x = Math.round(target.x), z = Math.round(target.z);
    if (x === this._cx && z === this._cz) return;
    this._cx = x; this._cz = z;
    this.group.position.set(x, this.level, z);
    this._mask();   // the land under the plane moved, so the mask must run again
  }
}
