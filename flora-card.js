// myworlds — the preview of one plant on the study card.
//
// The animal card and the plant card share one card element and one set of text nodes. They do not
// share a canvas: a WebGLRenderer owns its canvas, so each inspector keeps its own and the card
// shows one of the two. See Inspector in fauna.js for the animal side.
//
// The two previews move differently, because the two subjects do. An animal walks, so the animal
// card lets it roam a disc and turns the camera around it. A plant stands still, so the plant card
// holds the camera still and turns the plant: the body is centred in the view and it rotates on its
// own axis, slowly, and the reader reads every side of it without touching anything.
//
// The body itself still moves. The card builds the plant with the near material of the ground, so
// the wind bends it and a sac breathes on the card exactly as it does on the patch.
import * as THREE from 'three';
import { floraGeometry, FLORA_STYLE } from './flora-geometry.js';
import { nearFloraMaterial } from './ground-flora.js';

const SPIN = 0.26;        // radians per second: one turn in about 24 seconds
const FRAME_H = 2.4;      // units: the height the body is scaled to, whatever its real size
const WIDE = 1.4;         // a body wider than it is tall is framed on its width instead
const CAM_DIST = 5.2;     // units: set from FRAME_H and the 36 degree field of view, with a margin
const DISC_R = 2.0;       // units: the ground disc under the plant

export class PlantInspector {
  constructor({ card, canvas }) {
    this.card = card; this.canvas = canvas;
    this.nameEl = card.querySelector('.cname'); this.latinEl = card.querySelector('.clatin');
    this.tagsEl = card.querySelector('.ctags'); this.storyEl = card.querySelector('.cstory');
    this.renderer = null; this.open = false; this.plant = null;
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.6); sun.position.set(2.5, 4, 3);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005;
    const sc = sun.shadow.camera; sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -3; sc.near = 1; sc.far = 14;
    this.scene.add(sun, new THREE.HemisphereLight('#9fbfff', '#3a2a1a', 0.7));
    this.fill = new THREE.DirectionalLight('#6a86d8', 0.5); this.fill.position.set(-3, 1, -2);
    this.scene.add(this.fill);
    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(DISC_R, 28),
      new THREE.MeshStandardMaterial({ color: '#6fa85a', roughness: 1, flatShading: true }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    // The plant turns, and the disc under it does not, so the pivot carries the body alone.
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.mesh = null;
    this._m = new THREE.Matrix4();
  }

  // p is one entry of patch.plants: { kind, count, lore }. `palette` is the world palette, and
  // `variant` is the flora signature, so the plant on the card is the plant on the ground.
  show(p, palette, groundColor, variant = 0) {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.plant = p;
    if (this.mesh) {
      this.pivot.remove(this.mesh);
      this.mesh.geometry.dispose(); this.mesh.material.dispose();
      this.mesh = null;
    }
    const geo = floraGeometry(p.kind, palette.flora, variant);
    if (geo) {
      const style = FLORA_STYLE[p.kind] || FLORA_STYLE[0];
      const mat = nearFloraMaterial(style);
      if (style.glow > 0) {
        mat.emissive = new THREE.Color(palette.flora.canopy);
        mat.emissiveIntensity = style.glow;
      }
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const h = Math.max(bb.max.y - Math.min(bb.min.y, 0), 0.001);
      const w = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z), 0.001);
      // The frame takes the taller of the two measures, so a wide low body fills the card as well
      // as a narrow high one and neither one runs off the edge.
      this.fit = FRAME_H / Math.max(h, w * WIDE);
      // The shader only runs under USE_INSTANCING, so the body is one instance and the scale and
      // the turn ride on the node above it.
      const mesh = new THREE.InstancedMesh(geo, mat, 1);
      mesh.setMatrixAt(0, this._m.identity());
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.scale.setScalar(this.fit);
      this.mesh = mesh;
      this.pivot.add(mesh);
      this.top = h * this.fit;
    } else {
      this.fit = 1; this.top = FRAME_H;
    }
    // The eye stands level with the middle of the body and looks at that middle, so the subject is
    // centred in the frame whatever its proportions are.
    const mid = this.top * 0.5;
    this.camera.position.set(0, mid + this.top * 0.12, CAM_DIST);
    this.camera.lookAt(0, mid, 0);
    this.ground.material.color.set(groundColor);

    const lore = p.lore;
    this.nameEl.textContent = lore.name;
    this.latinEl.textContent = lore.latin;
    this.tagsEl.innerHTML = [['Habitat', lore.habitat], ['Height', lore.size], ['Food', lore.food], ['Spread', lore.spread]]
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    this.storyEl.textContent = lore.story;
    this.card.hidden = false;
    requestAnimationFrame(() => this.card.classList.add('show'));
    if (!this.open) { this.open = true; this.clock.start(); this.loop(); }
    this.resize();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.card.classList.remove('show');
    // The card is shared with the animal inspector. See Inspector.hide() in fauna.js: only a card
    // that nobody has asked back on screen is really hidden.
    setTimeout(() => { if (!this.open && !this.card.classList.contains('show')) this.card.hidden = true; }, 250);
    if (this.onClose) this.onClose();
  }

  resize() {
    if (!this.renderer) return;
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  loop() {
    if (!this.open) return;
    requestAnimationFrame(() => this.loop());
    const t = this.clock.getElapsedTime();
    if (this.mesh) {
      this.mesh.material.userData.time.value = t;
      this.pivot.rotation.y = t * SPIN;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh = null; }
    if (this.renderer) { this.renderer.dispose(); this.renderer = null; }
  }
}
