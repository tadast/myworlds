// myworlds — the plants of the ground patch, near as meshes and far as cards.
//
// The worker places the plants and writes them in units. This module draws them at two levels of
// detail. A plant closer than ground.lod.distance is a full mesh. A plant beyond it is a card: one
// vertical quad that carries a small picture of the same mesh, baked once at patch load.
//
// Every frame the walk() step reads the distance of every plant and writes it to one of the two
// instanced meshes. The matrices are built once at load, so the walk only copies them.
//
// Issue 21 added three things a reader sees at once. Every plant now carries its own lean, its own
// width, and its own tint, so no two plants of one kind read the same. Every kind carries a style:
// how far the wind bends it, how far it breathes, how much it glows, and how far out it must stay
// a mesh, because a card of 64 pixels cannot carry a body that fills the screen. And the ground
// itself carries grass: GrassField grows a lattice of tufts around the camera from the cover mask
// of the worker, far past the plant cap, because a tuft is only useful within about 80 units.
import * as THREE from 'three';
import { floraGeometry, FLORA, FLORA_STYLE } from './flora-geometry.js';

const HYSTERESIS = 0.05;     // ±5% around the LOD distance: a band of 10%, so a plant cannot flicker
// the band as squared factors, because the walk compares squared distances
const IN_BAND = (1 - HYSTERESIS) * (1 - HYSTERESIS);
const OUT_BAND = (1 + HYSTERESIS) * (1 + HYSTERESIS);
const CARD_ALPHA = 0.4;      // the alpha test of the card. No blending, so the card writes depth.
const SUN_FACE = 0.6;        // the mean of the sun on the lit half of a plant, a rough ball
const TINT_HUE = 0.16;       // how far one plant may lean from the colour of its kind
const TINT_LIT = 0.22;       // how far one plant may lean from the brightness of its kind

// The grass lattice. A tuft is about one unit wide, so it only reads within about 80 units, and a
// field that wide holds far more tufts than the whole plant cap.
const GRASS_FADE = 22;       // units: the band the tufts shrink to nothing over at the edge
const GRASS_CEIL = 110;      // units: over this height above the ground the field is gone
const GRASS_STEP = 7;        // units: the camera moves this far before the lattice is rebuilt

const _size = new THREE.Vector2();   // scratch for the view size the card floor reads
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };

// the small integer hash the worker and the terrain both use, for the spin of one plant
function hash1(i) {
  i = Math.imul(i ^ (i >>> 16), 2246822507);
  i = Math.imul(i ^ (i >>> 13), 3266489909);
  return ((i ^ (i >>> 16)) >>> 0) / 4294967296;
}

// the same hash over a lattice cell, so a tuft keeps its place while the field scrolls under it
function hash2(i, j) {
  let h = (Math.imul(i, 374761393) ^ Math.imul(j, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// One instance matrix, from the source array at o into the destination array at d.
function copy16(src, o, dst, d) {
  dst[d] = src[o]; dst[d + 1] = src[o + 1]; dst[d + 2] = src[o + 2]; dst[d + 3] = src[o + 3];
  dst[d + 4] = src[o + 4]; dst[d + 5] = src[o + 5]; dst[d + 6] = src[o + 6]; dst[d + 7] = src[o + 7];
  dst[d + 8] = src[o + 8]; dst[d + 9] = src[o + 9]; dst[d + 10] = src[o + 10]; dst[d + 11] = src[o + 11];
  dst[d + 12] = src[o + 12]; dst[d + 13] = src[o + 13]; dst[d + 14] = src[o + 14]; dst[d + 15] = src[o + 15];
}

// The material of a plant. mergeGeos() returns a geometry that is not indexed and it computes the
// normals there, so every triangle already carries its own normal and the plant reads faceted
// without `flatShading`.
//
// `flatShading` must stay off. It makes three.js take the normal from the derivatives of the view
// position instead of the attribute, and a body only a few pixels wide gives derivatives near
// zero. The alien kinds carry parts that thin: a grass blade, a spindle whip, and a tendril under
// the colossus all turned black under derivative normals. Issue 21.
function floraMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false });
}

// The plants move. The wind bends a stalk about its own base, and a sac breathes in and out. Both
// run in the vertex shader on the geometry before the instance matrix, so both take the lean, the
// width, and the size of the instance for free.
//
// The normals hold their rest shape, because they come from the attribute. The bend is at most a
// tenth of the height of a plant and the breath is a seventh of its width, so the light on a body
// that moves is a little behind its shape and no reader can see it.
//
// The shadow pass runs the depth material, which carries none of this, so the shadow of a plant
// holds its rest shape too.
function animate(material, style) {
  const time = { value: 0 };
  const gate = { value: 1 };
  material.userData.time = time;
  material.userData.gate = gate;
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.uniforms.uGate = gate;
    sh.uniforms.uSway = { value: style.sway };
    sh.uniforms.uPulse = { value: style.pulse };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGate;\nuniform float uSway;\nuniform float uPulse;')
      .replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iAt = instanceMatrix[3].xyz;
        float ph = iAt.x * 0.11 + iAt.z * 0.17;
        // the bend grows with the square of the height, so the base holds still and the top moves
        float up = max(transformed.y, 0.0);
        float bend = up * up * 0.1 * uSway;
        transformed.x += bend * (sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 0.53 + ph * 2.3) * 0.4);
        transformed.z += bend * (cos(uTime * 1.27 + ph * 0.8) * 0.6 + cos(uTime * 0.41 + ph * 1.9) * 0.4);
        // the breath keeps the volume roughly even: wider is shorter
        float br = uPulse * 0.14 * sin(uTime * 1.05 + ph * 2.7);
        transformed.xz *= 1.0 + br;
        transformed.y *= 1.0 - br * 0.5;
        transformed *= uGate;
      #endif
      `);
  };
  material.customProgramCacheKey = () => 'flora-near';
  return material;
}

// The card turns toward the camera around the y axis only, so a plant never leans back. The
// billboard runs in the vertex shader: the walk on the main thread only copies matrices.
// The instance matrix of a card carries a position and one scale, and no rotation, so the scale
// is the length of its first column.
//
// One picture cannot hold every light. The bake lights the plant from one side, so a card would
// stay bright while the near mesh beside it turns dark against the sun. The shader therefore
// dims the card by the angle between the eye and the sun on the ground plane: the card is at its
// brightest when the sun stands behind the reader, and it falls to uBack against the sun. uBack
// is the share of the light the sky gives, so the two levels of detail meet at one brightness.
function billboard(material, sunXZ, back) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uSunXZ = { value: sunXZ };
    sh.uniforms.uBack = { value: back };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uSunXZ;\nvarying float vLit;')
      .replace('#include <project_vertex>', `
      vec4 instOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec3 anchor = (modelMatrix * instOrigin).xyz;
      float iScale = length(instanceMatrix[0].xyz);
      vec2 toEye = cameraPosition.xz - anchor.xz;
      float eyeLen = length(toEye);
      vec2 f = eyeLen > 0.0001 ? toEye / eyeLen : vec2(0.0, 1.0);
      vec3 right = vec3(f.y, 0.0, -f.x);
      vec3 worldPos = anchor + right * (transformed.x * iScale) + vec3(0.0, transformed.y * iScale, 0.0);
      vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      vLit = 0.5 + 0.5 * dot(f, uSunXZ);
    `);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uBack;\nvarying float vLit;')
      // the fog runs after the light, as it does on the near mesh
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb *= mix(uBack, 1.0, vLit);\n#include <fog_fragment>');
  };
  material.customProgramCacheKey = () => 'flora-card';
  return material;
}

// The light of the site, for a card bake and for the grass. Both need the same numbers.
function bakeLight(sky, groundColor) {
  const sunDir = sky ? sky.sunDir : new THREE.Vector3(1, 0.55, 0.8).normalize();
  const flat = Math.hypot(sunDir.x, sunDir.z);
  const night = sky ? sky.night : 0;
  const hemi = (0.7 - 0.35 * night) * 0.5;
  const direct = (sky ? sky.sunIntensity : 2.6) * flat * SUN_FACE;
  return {
    sunDir, flat, night,
    color: sky ? sky.sunColor : 0xffffff,
    intensity: sky ? sky.sunIntensity : 2.6,
    horizon: sky ? sky.horizon : 0xffffff,
    ground: groundColor || (sky ? sky.horizon : 0xffffff),
    back: flat < 0.05 ? 1 : Math.min(1, hemi / (hemi + direct)),
  };
}

export class Flora {
  // flora: the worker's Float32Array of x y z, nx ny nz, size in units, kind.
  // sky: the Sky of the ground, for the sun colour and the sun direction the card bakes with.
  constructor({ renderer, flora, palette, tier, sky, lod, cut, groundColor, variant = 0 }) {
    this.renderer = renderer;
    this.lod = lod;
    this.cut = cut || 900;             // units: past this a plant is deep inside the fog
    this.count = flora ? flora.length / 8 : 0;
    this.walkMs = 0;
    this.nearCount = 0;
    this.cardCount = 0;
    this.group = new THREE.Group();
    this.kinds = [];
    this.targets = [];
    this.materials = [];
    if (!this.count) return;

    // one bucket per kind, so each kind gets its own geometry, card, and pair of meshes
    const buckets = new Map();
    for (let i = 0; i < this.count; i++) {
      const k = flora[i * 8 + 7];
      let b = buckets.get(k);
      if (!b) { b = []; buckets.set(k, b); }
      b.push(i);
    }

    const light = bakeLight(sky, groundColor);
    const up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), pos = new THREE.Vector3();
    const q = new THREE.Quaternion(), spin = new THREE.Quaternion(), tip = new THREE.Quaternion();
    const axis = new THREE.Vector3(), scale = new THREE.Vector3();
    const mat4 = new THREE.Matrix4();
    for (const [kind, list] of buckets) {
      const geo = floraGeometry(kind, palette.flora, variant);
      if (!geo) continue;
      const style = FLORA_STYLE[kind] || FLORA_STYLE[0];
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const height = Math.max(bb.max.y, 0.001);
      const width = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z), 0.001);

      // The terrain runs a Lambert material for the same reason: the reader cannot tell a full
      // reflection model from it on a rough surface, and Lambert is about a third cheaper.
      const nearMat = animate(floraMaterial(), style);
      if (style.glow > 0) {
        nearMat.emissive = new THREE.Color(palette.flora.canopy);
        nearMat.emissiveIntensity = style.glow;
      }

      const card = this._bakeCard(geo, nearMat, light, width, bb.min.y, bb.max.y, style.card);
      const quad = new THREE.PlaneGeometry(width * 2, bb.max.y - bb.min.y);
      quad.translate(0, (bb.max.y + bb.min.y) / 2, 0);
      // The tint of a plant rides on instanceColor, and three.js only reads it into the fragment
      // when the material carries vertex colours. The card holds one picture, so its quad takes a
      // white colour attribute and the tint then multiplies the picture.
      quad.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 3));

      const n = list.length;
      const near = new THREE.InstancedMesh(geo, nearMat, n);
      const far = new THREE.InstancedMesh(quad, card.material, n);
      near.castShadow = !!tier.shadows;      // the near mesh casts a shadow on HIGH
      near.receiveShadow = !!tier.shadows;
      far.castShadow = false;                // a card never casts: it holds no real shape
      far.receiveShadow = false;
      // the walk rewrites the matrices every frame, so a bounding sphere is always one frame old
      near.frustumCulled = false;
      far.frustumCulled = false;
      near.count = 0;
      far.count = 0;
      near.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      near.instanceColor.setUsage(THREE.DynamicDrawUsage);
      far.instanceColor.setUsage(THREE.DynamicDrawUsage);

      // The near matrices, built once. A plant leans a little into the terrain normal; a boulder
      // leans the whole way, because a boulder lies on the ground and a tree grows up from it. On
      // top of that every plant takes a lean and a width of its own, from the style of its kind,
      // so a stand of one kind holds no two bodies of one shape.
      //
      // The card needs no matrix of its own: its slot holds a diagonal scale and a translation,
      // and the walk writes only those six numbers into the identity the InstancedMesh starts with.
      const nearM = new Float32Array(n * 16);
      const at = new Float32Array(n * 3);       // the position of every plant, for the distance walk
      const cards = new Float32Array(n * 2);    // the scale of the card and the height of its base
      const tints = new Float32Array(n * 3);    // the tint of every plant, for both meshes
      const sz2 = new Float32Array(n);          // the square of the height, for the card-size floor
      const rock = kind === FLORA.BOULDER;
      for (let j = 0; j < n; j++) {
        const o = list[j] * 8;
        const units = flora[o + 6], s = units / height;
        const h0 = hash1(list[j]), h1 = hash1(list[j] * 7 + 13), h2 = hash1(list[j] * 31 + 5);
        const h3 = hash1(list[j] * 61 + 97);
        pos.set(flora[o], flora[o + 1], flora[o + 2]);
        normal.set(flora[o + 3], flora[o + 4], flora[o + 5]).normalize();
        if (!rock) normal.lerp(up, 0.7).normalize();
        q.setFromUnitVectors(up, normal);
        spin.setFromAxisAngle(up, h0 * Math.PI * 2);
        q.multiply(spin);
        // the lean of this one plant, about an axis of its own
        if (style.lean > 0) {
          const a = h1 * Math.PI * 2;
          axis.set(Math.cos(a), 0, Math.sin(a));
          tip.setFromAxisAngle(axis, (h2 - 0.5) * 2 * style.lean);
          q.premultiply(tip);
        }
        // the width of this one plant against its height, so a stand holds fat and thin bodies
        const wide = 1 + (h3 - 0.5) * 2 * style.flat;
        scale.set(s * wide, s, s * wide);
        mat4.compose(pos, q, scale);
        nearM.set(mat4.elements, j * 16);
        at[j * 3] = pos.x; at[j * 3 + 1] = pos.y; at[j * 3 + 2] = pos.z;
        // The card carries no rotation, so its scale is the length of its first column and the
        // vertex shader can read it there. The card sits a little into the ground, so a plant on
        // a slope does not float.
        cards[j * 2] = s; cards[j * 2 + 1] = pos.y - units * 0.02;
        sz2[j] = units * units;
        // The tint. One plant leans warm and the next leans cool, and both lean light or dark, so
        // a hillside of one kind reads as many plants and not as one plant copied.
        const lit = 1 + (h1 - 0.5) * 2 * TINT_LIT;
        const warm = (h2 - 0.5) * 2 * TINT_HUE;
        tints[j * 3] = lit * (1 + warm);
        tints[j * 3 + 1] = lit * (1 - Math.abs(warm) * 0.35);
        tints[j * 3 + 2] = lit * (1 - warm);
      }

      this.kinds.push({
        kind, style, count: n, near, far, nearM, at, cards, tints, sz2, state: new Uint8Array(n),
      });
      this.group.add(near);
      this.group.add(far);
      this.targets.push(card.target);
      this.materials.push(nearMat);
    }
  }

  // One card: the near mesh rendered once with an orthographic camera into a small target, with
  // the flat colours and the sun of this site. A tall kind bakes at more pixels, because the reader
  // can stand under it and still see the card.
  _bakeCard(geo, material, light, width, y0, y1, px) {
    const renderer = this.renderer;
    const target = new THREE.WebGLRenderTarget(px, px, {
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
      depthBuffer: true, stencilBuffer: false,
      // No mipmaps: a mipmap averages the alpha of a thin trunk toward zero, and the far half of
      // the forest would then fade away. The card is small on the screen, so it stays sharp.
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });

    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geo, material));
    // The bake puts the sun behind the eye and keeps its true height, so the card holds the plant
    // at its brightest. billboard() then dims it toward uBack as the eye turns against the sun.
    const sun = new THREE.DirectionalLight(light.color, light.intensity);
    sun.position.set(0, light.sunDir.y, light.flat).multiplyScalar(50);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(light.horizon, light.ground, 0.7 - 0.35 * light.night));

    // the eye stands on +z, so camera x is world x and camera y is world y
    const cam = new THREE.OrthographicCamera(-width, width, y1, y0, 0.1, 100);
    cam.position.set(0, 0, 20);
    cam.lookAt(0, 0, 0);

    const prevTarget = renderer.getRenderTarget();
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    scene.clear();

    // The bake ran into a render target, so the renderer applied no tone mapping and the texture
    // holds plain light. The card goes through the same tone mapping as the near mesh at draw
    // time, so the two read as one plant. The alpha test writes depth, so a card sorts with the
    // terrain and needs no blending.
    const cardMat = billboard(new THREE.MeshBasicMaterial({
      map: target.texture, alphaTest: CARD_ALPHA, transparent: false,
      side: THREE.DoubleSide, fog: true, vertexColors: true,
    }), new THREE.Vector2(light.sunDir.x / (light.flat || 1), light.sunDir.z / (light.flat || 1)), light.back);
    return { material: cardMat, target };
  }

  // The walk: every plant goes to the near mesh or to the card mesh by its distance to the
  // camera. The hysteresis band keeps a plant on one side until it is clearly past the other, so
  // a plant at the boundary cannot flicker. The LOD distance of a kind is the knob times the style
  // of the kind, so a colossus stays a mesh out to the fog and a tuft turns into a card at once.
  update(camera, t) {
    if (!this.count) return;
    const t0 = performance.now();
    for (let i = 0; i < this.materials.length; i++) this.materials[i].userData.time.value = t;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    let nearTotal = 0, cardTotal = 0;

    // The focal length of the view in pixels: a plant `size` units tall and `d` units away covers
    // `size * focal / d` pixels of the screen. The card of its kind holds `style.card` pixels, so
    // past `size * focal / style.card` the picture is no longer magnified and the swap is
    // invisible. Nearer than that a card is a blown-up picture, and the reader sees a flat plant.
    // Issue 22: the LOD knob alone did that. On a 30 Hz display the knob fell to its floor of 40 m
    // and 8,018 of 8,126 plants stood as cards, some of them ten metres away.
    this.renderer.getSize(_size);
    const focal = _size.y / (2 * Math.tan(camera.fov * Math.PI / 360));

    for (let b = 0; b < this.kinds.length; b++) {
      const k = this.kinds[b];
      const d = this.lod.distance * k.style.lod;
      const knob2 = d * d;
      const cardK = focal / k.style.card, card2 = cardK * cardK;
      const cutK = this.cut * k.style.cut, cut2 = cutK * cutK;
      const src = k.nearM, at = k.at, cards = k.cards, tints = k.tints, sz2 = k.sz2, state = k.state, n = k.count;
      const nearArr = k.near.instanceMatrix.array, cardArr = k.far.instanceMatrix.array;
      const nearCol = k.near.instanceColor.array, cardCol = k.far.instanceColor.array;
      let a = 0, c = 0;
      for (let i = 0; i < n; i++) {
        const p = i * 3;
        const px = at[p], py = at[p + 1], pz = at[p + 2];
        const dx = px - cx, dy = py - cy, dz = pz - cz;
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd > cut2) { state[i] = 2; continue; }
        // the swap distance of this one plant: the knob of its kind, or the reach of its card if
        // that stands further out
        const floor2 = sz2[i] * card2;
        const lim2 = knob2 > floor2 ? knob2 : floor2;
        const in2 = lim2 * IN_BAND, out2 = lim2 * OUT_BAND;
        let s = state[i];
        if (s === 0) { if (dd > out2) s = 1; } else s = dd < in2 ? 0 : 1;
        state[i] = s;
        if (s === 0) {
          copy16(src, i * 16, nearArr, a);
          nearCol[a / 16 * 3] = tints[p]; nearCol[a / 16 * 3 + 1] = tints[p + 1]; nearCol[a / 16 * 3 + 2] = tints[p + 2];
          a += 16;
        } else {
          const q = i * 2, sc = cards[q];
          cardArr[c] = sc; cardArr[c + 5] = sc; cardArr[c + 10] = sc;
          cardArr[c + 12] = px; cardArr[c + 13] = cards[q + 1]; cardArr[c + 14] = pz;
          cardCol[c / 16 * 3] = tints[p]; cardCol[c / 16 * 3 + 1] = tints[p + 1]; cardCol[c / 16 * 3 + 2] = tints[p + 2];
          c += 16;
        }
      }
      k.near.count = a / 16;
      k.far.count = c / 16;
      nearTotal += a / 16;
      cardTotal += c / 16;
      // upload only the part the draw reads, not the whole buffer
      if (a > 0) {
        k.near.instanceMatrix.addUpdateRange(0, a); k.near.instanceMatrix.needsUpdate = true;
        k.near.instanceColor.addUpdateRange(0, a / 16 * 3); k.near.instanceColor.needsUpdate = true;
      }
      if (c > 0) {
        k.far.instanceMatrix.addUpdateRange(0, c); k.far.instanceMatrix.needsUpdate = true;
        k.far.instanceColor.addUpdateRange(0, c / 16 * 3); k.far.instanceColor.needsUpdate = true;
      }
    }
    this.nearCount = nearTotal;
    this.cardCount = cardTotal;
    this.walkMs = performance.now() - t0;
  }

  dispose() {
    for (const k of this.kinds) {
      k.near.geometry.dispose();
      k.near.material.dispose();
      k.far.geometry.dispose();
      k.far.material.dispose();
    }
    for (const t of this.targets) t.dispose();
    this.kinds.length = 0;
    this.targets.length = 0;
    this.materials.length = 0;
    this.group.clear();
  }
}

// ---------------------------------------------------------------- the ground cover
// The plants stand metres apart. Between them the ground was bare colour, so a patch read as
// painted card from close up. GrassField fills that gap.
//
// A tuft is about one unit wide, so it only reads within about 80 units of the reader. A field
// that wide over the whole box would hold a quarter of a million tufts, far past the plant cap.
// So the field is a lattice in world space that the camera carries: every cell of GRASS_CELL units
// holds at most one tuft, the tuft takes its place from the hash of its cell, and the field
// rebuilds when the camera has moved GRASS_STEP units. A tuft therefore never moves under the
// reader; the field only gains cells at one edge and loses them at the other, and the tufts shrink
// to nothing over the last GRASS_FADE units, so no ring shows.
//
// The cover mask of the worker says where a tuft may grow. The colour of the terrain under the
// tuft tints it, so the grass and the ground it stands on hold one hue.
export class GrassField {
  constructor({ palette, tier, sampler, variant = 0 }) {
    this.sampler = sampler;
    this.radius = tier.shadows ? 78 : 50;
    this.cell = tier.shadows ? 1.7 : 2.3;
    this.max = Math.ceil((2 * this.radius / this.cell + 2) ** 2);
    this.count = 0;
    this.buildMs = 0;
    this.atX = Infinity;
    this.atZ = Infinity;
    this.group = new THREE.Group();

    const geo = floraGeometry(FLORA.GRASS, palette.flora, variant);
    geo.computeBoundingBox();
    this.height = Math.max(geo.boundingBox.max.y, 0.001);
    const style = FLORA_STYLE[FLORA.GRASS];
    this.material = animate(floraMaterial(), style);
    this.mesh = new THREE.InstancedMesh(geo, this.material, this.max);
    this.mesh.castShadow = false;               // one tuft casts nothing a reader can see
    this.mesh.receiveShadow = !!tier.shadows;
    this.mesh.frustumCulled = false;            // the field follows the camera, so a sphere is stale
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);
  }

  update(camera, t) {
    this.material.userData.time.value = t;
    const x = camera.position.x, z = camera.position.z;
    // The field goes away as the reader climbs. A tuft one unit tall says nothing from 100 units
    // up, and the gate rides in the shader, so a climb costs no rebuild.
    const up = camera.position.y - this.sampler.heightAt(x, z);
    const gate = 1 - smoothstep(GRASS_CEIL * 0.55, GRASS_CEIL, up);
    this.material.userData.gate.value = gate;
    if (gate <= 0.01) { this.mesh.count = 0; this.count = 0; return; }
    const dx = x - this.atX, dz = z - this.atZ;
    if (this.count === 0 || dx * dx + dz * dz > GRASS_STEP * GRASS_STEP) this._build(x, z);
  }

  // One lattice, centred on the camera. The matrix carries a turn about y and a scale, and nothing
  // else, so the walk writes six numbers and leaves the rest of the identity alone.
  _build(cx, cz) {
    const t0 = performance.now();
    const S = this.sampler, cell = this.cell, R = this.radius, R2 = R * R;
    const m = this.mesh.instanceMatrix.array, col = this.mesh.instanceColor.array;
    const i0 = Math.floor((cx - R) / cell), i1 = Math.ceil((cx + R) / cell);
    const j0 = Math.floor((cz - R) / cell), j1 = Math.ceil((cz + R) / cell);
    const inner = R - GRASS_FADE;
    const rgb = [0, 0, 0];
    let o = 0;
    for (let j = j0; j <= j1 && o < this.max * 16; j++) {
      for (let i = i0; i <= i1 && o < this.max * 16; i++) {
        const hx = hash2(i, j), hz = hash2(i + 911, j - 37);
        const x = (i + hx) * cell, z = (j + hz) * cell;
        const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
        if (d2 > R2) continue;
        const cover = S.coverAt(x, z);
        if (cover <= 0.04) continue;
        // Thin cover must read thin. The share of the cells that grow follows the mask, so a
        // desert shows a tuft here and there and a meadow closes over.
        const hp = hash2(i + 57, j + 91);
        if (hp > cover * 1.5) continue;
        const y = S.heightAt(x, z);
        const hs = hash2(i - 313, j + 449);
        const fade = d2 <= inner * inner ? 1 : 1 - smoothstep(inner, R, Math.sqrt(d2));
        if (fade <= 0.02) continue;
        // A tuft is wider than it is tall, so a field of them reads as cover and not as a crop.
        const size = (0.45 + 0.85 * hs) * (0.5 + 0.6 * cover) * fade / this.height;
        const wide = size * 1.3;
        const a = hash2(i + 7, j - 7) * Math.PI * 2;
        const ca = Math.cos(a) * wide, sa = Math.sin(a) * wide;
        m[o] = ca; m[o + 1] = 0; m[o + 2] = -sa; m[o + 3] = 0;
        m[o + 4] = 0; m[o + 5] = size; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = sa; m[o + 9] = 0; m[o + 10] = ca; m[o + 11] = 0;
        m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
        // The tint carries the hue of the ground under the tuft, not its brightness, so the grass
        // holds its own colour and still belongs to the ground it stands on.
        S.colorAt(x, z, rgb);
        const mean = (rgb[0] + rgb[1] + rgb[2]) / 3 || 1;
        const lit = 0.9 + 0.55 * hp;
        const c = o / 16 * 3;
        col[c] = lit * (1 + (rgb[0] / mean - 1) * 0.5);
        col[c + 1] = lit * (1 + (rgb[1] / mean - 1) * 0.5);
        col[c + 2] = lit * (1 + (rgb[2] / mean - 1) * 0.5);
        o += 16;
      }
    }
    this.count = o / 16;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.atX = cx; this.atZ = cz;
    this.buildMs = performance.now() - t0;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.group.clear();
    this.count = 0;
  }
}
