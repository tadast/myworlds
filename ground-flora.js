// myworlds — the plants of the ground patch, near as meshes and far as cards.
//
// The worker places the plants and writes them in metres. This module draws them at two levels
// of detail. A plant closer than ground.lod.distance is a full mesh. A plant beyond it is a card:
// one vertical quad that carries a small picture of the same mesh, baked once at patch load.
//
// Every frame the walk() step reads the distance of every plant and writes it to one of the two
// instanced meshes. The matrices are built once at load, so the walk only copies them.
import * as THREE from 'three';
import { floraGeometry, FLORA } from './flora-geometry.js';

const CARD_PX = 64;          // the card is baked at 64 by 64 pixels
const HYSTERESIS = 0.05;     // ±5% around the LOD distance: a band of 10%, so a plant cannot flicker
const CARD_ALPHA = 0.4;      // the alpha test of the card. No blending, so the card writes depth.
const SUN_FACE = 0.6;        // the mean of the sun on the lit half of a plant, a rough ball

// the small integer hash the worker and the terrain both use, for the spin of one plant
function hash1(i) {
  i = Math.imul(i ^ (i >>> 16), 2246822507);
  i = Math.imul(i ^ (i >>> 13), 3266489909);
  return ((i ^ (i >>> 16)) >>> 0) / 4294967296;
}

// One instance matrix, from the source array at o into the destination array at d.
function copy16(src, o, dst, d) {
  dst[d] = src[o]; dst[d + 1] = src[o + 1]; dst[d + 2] = src[o + 2]; dst[d + 3] = src[o + 3];
  dst[d + 4] = src[o + 4]; dst[d + 5] = src[o + 5]; dst[d + 6] = src[o + 6]; dst[d + 7] = src[o + 7];
  dst[d + 8] = src[o + 8]; dst[d + 9] = src[o + 9]; dst[d + 10] = src[o + 10]; dst[d + 11] = src[o + 11];
  dst[d + 12] = src[o + 12]; dst[d + 13] = src[o + 13]; dst[d + 14] = src[o + 14]; dst[d + 15] = src[o + 15];
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

export class Flora {
  // flora: the worker's Float32Array of x y z, nx ny nz, scale in metres, kind.
  // sky: the Sky of the ground, for the sun colour and the sun direction the card bakes with.
  constructor({ renderer, flora, palette, tier, sky, lod, cut, groundColor }) {
    this.renderer = renderer;
    this.lod = lod;
    this.cut = cut || 900;             // metres: past this a plant is deep inside the fog
    this.count = flora ? flora.length / 8 : 0;
    this.walkMs = 0;
    this.nearCount = 0;
    this.cardCount = 0;
    this.group = new THREE.Group();
    this.kinds = [];
    this.targets = [];
    if (!this.count) return;

    // one bucket per kind, so each kind gets its own geometry, card, and pair of meshes
    const buckets = new Map();
    for (let i = 0; i < this.count; i++) {
      const k = flora[i * 8 + 7];
      let b = buckets.get(k);
      if (!b) { b = []; buckets.set(k, b); }
      b.push(i);
    }

    const up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), pos = new THREE.Vector3();
    const q = new THREE.Quaternion(), spin = new THREE.Quaternion(), scale = new THREE.Vector3();
    const mat4 = new THREE.Matrix4();
    for (const [kind, list] of buckets) {
      const geo = floraGeometry(kind, palette.flora);
      if (!geo) continue;
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const height = Math.max(bb.max.y, 0.001);
      const width = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z), 0.001);

      // The terrain runs a Lambert material for the same reason: the reader cannot tell a full
      // reflection model from it on a rough surface, and Lambert is about a third cheaper.
      const nearMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      if (kind === FLORA.CRYSTAL) {
        nearMat.emissive = new THREE.Color(palette.flora.canopy);
        nearMat.emissiveIntensity = 0.35;
      }

      const card = this._bakeCard(geo, nearMat, sky, groundColor, width, bb.min.y, bb.max.y);
      const quad = new THREE.PlaneGeometry(width * 2, bb.max.y - bb.min.y);
      quad.translate(0, (bb.max.y + bb.min.y) / 2, 0);

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

      // The near matrices, built once. A plant leans a little into the terrain normal; a boulder
      // leans the whole way, because a boulder lies on the ground and a tree grows up from it.
      // The card needs no matrix of its own: its slot holds a diagonal scale and a translation,
      // and the walk writes only those six numbers into the identity the InstancedMesh starts with.
      const nearM = new Float32Array(n * 16);
      const at = new Float32Array(n * 3);       // the position of every plant, for the distance walk
      const cards = new Float32Array(n * 2);    // the scale of the card and the height of its base
      const rock = kind === FLORA.BOULDER;
      for (let j = 0; j < n; j++) {
        const o = list[j] * 8;
        const metres = flora[o + 6], s = metres / height;
        pos.set(flora[o], flora[o + 1], flora[o + 2]);
        normal.set(flora[o + 3], flora[o + 4], flora[o + 5]).normalize();
        if (!rock) normal.lerp(up, 0.7).normalize();
        q.setFromUnitVectors(up, normal);
        spin.setFromAxisAngle(up, hash1(list[j]) * Math.PI * 2);
        q.multiply(spin);
        scale.set(s, s, s);
        mat4.compose(pos, q, scale);
        nearM.set(mat4.elements, j * 16);
        at[j * 3] = pos.x; at[j * 3 + 1] = pos.y; at[j * 3 + 2] = pos.z;
        // The card carries no rotation, so its scale is the length of its first column and the
        // vertex shader can read it there. The card sits a little into the ground, so a plant on
        // a slope does not float.
        cards[j * 2] = s; cards[j * 2 + 1] = pos.y - metres * 0.02;
      }

      const bucket = { kind, count: n, near, far, nearM, at, cards, state: new Uint8Array(n) };
      this.kinds.push(bucket);
      this.group.add(near);
      this.group.add(far);
      this.targets.push(card.target);
    }
  }

  // One card: the near mesh rendered once with an orthographic camera into a 64 by 64 target,
  // with the flat colours and the sun of this site.
  _bakeCard(geo, material, sky, groundColor, width, y0, y1) {
    const renderer = this.renderer;
    const target = new THREE.WebGLRenderTarget(CARD_PX, CARD_PX, {
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
      depthBuffer: true, stencilBuffer: false,
      // No mipmaps: a mipmap averages the alpha of a thin trunk toward zero, and the far half of
      // the forest would then fade away. The card is small on the screen, so it stays sharp.
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });

    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geo, material));
    const sunDir = sky ? sky.sunDir : new THREE.Vector3(1, 0.55, 0.8).normalize();
    const flat = Math.hypot(sunDir.x, sunDir.z);
    // The bake puts the sun behind the eye and keeps its true height, so the card holds the plant
    // at its brightest. billboard() then dims it toward uBack as the eye turns against the sun.
    const sun = new THREE.DirectionalLight(sky ? sky.sunColor : 0xffffff, sky ? sky.sunIntensity : 2.6);
    sun.position.set(0, sunDir.y, flat).multiplyScalar(50);
    scene.add(sun);
    if (sky) scene.add(new THREE.HemisphereLight(sky.horizon, groundColor || sky.horizon, 0.7 - 0.35 * sky.night));

    // The share of the light that comes from the sky and not from the sun. A card that turns its
    // back to the sun falls to this share, which is where the near mesh sits at the same angle.
    const hemi = (0.7 - 0.35 * (sky ? sky.night : 0)) * 0.5;
    const direct = (sky ? sky.sunIntensity : 2.6) * flat * SUN_FACE;
    const back = flat < 0.05 ? 1 : Math.min(1, hemi / (hemi + direct));

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
      side: THREE.DoubleSide, fog: true,
    }), new THREE.Vector2(sunDir.x / (flat || 1), sunDir.z / (flat || 1)), back);
    return { material: cardMat, target };
  }

  // The walk: every plant goes to the near mesh or to the card mesh by its distance to the
  // camera. The hysteresis band keeps a plant on one side until it is clearly past the other, so
  // a plant at the boundary cannot flicker.
  update(camera) {
    if (!this.count) return;
    const t0 = performance.now();
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const d = this.lod.distance;
    const inner = d * (1 - HYSTERESIS), outer = d * (1 + HYSTERESIS);
    const in2 = inner * inner, out2 = outer * outer, cut2 = this.cut * this.cut;
    let nearTotal = 0, cardTotal = 0;

    for (let b = 0; b < this.kinds.length; b++) {
      const k = this.kinds[b];
      const src = k.nearM, at = k.at, cards = k.cards, state = k.state, n = k.count;
      const nearArr = k.near.instanceMatrix.array, cardArr = k.far.instanceMatrix.array;
      let a = 0, c = 0;
      for (let i = 0; i < n; i++) {
        const p = i * 3;
        const px = at[p], py = at[p + 1], pz = at[p + 2];
        const dx = px - cx, dy = py - cy, dz = pz - cz;
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd > cut2) { state[i] = 2; continue; }
        let s = state[i];
        if (s === 0) { if (dd > out2) s = 1; } else s = dd < in2 ? 0 : 1;
        state[i] = s;
        if (s === 0) { copy16(src, i * 16, nearArr, a); a += 16; }
        else {
          const q = i * 2, sc = cards[q];
          cardArr[c] = sc; cardArr[c + 5] = sc; cardArr[c + 10] = sc;
          cardArr[c + 12] = px; cardArr[c + 13] = cards[q + 1]; cardArr[c + 14] = pz;
          c += 16;
        }
      }
      k.near.count = a / 16;
      k.far.count = c / 16;
      nearTotal += a / 16;
      cardTotal += c / 16;
      // upload only the part the draw reads, not the whole buffer
      if (a > 0) { k.near.instanceMatrix.addUpdateRange(0, a); k.near.instanceMatrix.needsUpdate = true; }
      if (c > 0) { k.far.instanceMatrix.addUpdateRange(0, c); k.far.instanceMatrix.needsUpdate = true; }
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
    this.group.clear();
  }
}
