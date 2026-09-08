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

export const PATCH_SIZE = 1500;      // metres, the side of the patch
export const FOG_NEAR = 450;         // metres, where the fog starts
export const FOG_FAR = 750;          // metres, where the fog is solid
export const SKY_RADIUS = 5000;      // metres, the sky dome
export const CEILING = 1200;         // metres, the camera ceiling
export const FLOOR = 2;              // metres, the camera floor above the terrain
export const CAM_START = 300;        // metres, the camera starts this far up and this far south

const DEFAULT_SUN = new THREE.Vector3(1, 0.55, 0.8).normalize();

export class Ground {
  // tier: { grid, maxFlora, maxFauna, shadows }
  constructor({ renderer, canvas, world, site, tier }) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.world = world;
    this.site = site;
    this.tier = tier || { grid: 2, maxFlora: 20000, maxFauna: 300, shadows: true };
    this.result = null;
    this.atCeiling = false;
    this.lod = { distance: 150, min: 40, max: 400 };   // metres, one knob for issue 11

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
  // The sun direction comes from the app, because only the app knows planet.rotation.y.
  load(result, { sunDir } = {}) {
    this.result = result;
    if (sunDir) this.sunDir.copy(sunDir).normalize();
    this._clear();

    // The sky dome takes the atmosphere colour. The dome is far past the fog, so the fog paints it
    // in the fog colour, exactly like the far ground. That hides the edge of the patch: a dome
    // outside the fog reads as a paler sky, because the renderer applies the fog after the tone
    // mapping, and the edge of the plane then shows as a hard line.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_RADIUS, 24, 16),
      new THREE.MeshBasicMaterial({ color: this.skyColor, side: THREE.BackSide, depthWrite: false }),
    );
    sky.renderOrder = -1;
    this.content.add(sky);

    // the placeholder ground: one flat plane in the ground colour of the palette
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(PATCH_SIZE, PATCH_SIZE, 1, 1),
      new THREE.MeshStandardMaterial({ color: this.groundColor, flatShading: true, roughness: 0.95, metalness: 0 }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = !!this.tier.shadows;
    this.content.add(plane);

    const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
    sun.position.copy(this.sunDir).multiplyScalar(SKY_RADIUS * 0.6);
    this.content.add(sun);
    this.content.add(new THREE.HemisphereLight(this.skyColor, this.groundColor, 0.7));

    // the camera starts 300 m up and 300 m south of the site, and it looks at the site
    this.controls.target.set(0, 0, 0);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(0, CAM_START, CAM_START);
    this.controls.update();
    return this;
  }

  update(t, dt) {
    this.controls.update();
    const p = this.camera.position, tg = this.controls.target;

    // the ceiling: shorten the offset from the target, so the view direction holds
    const dy = p.y - tg.y, top = CEILING - tg.y;
    if (dy > top && top > 0) {
      p.sub(tg).multiplyScalar(top / dy).add(tg);
      this.controls.update();
    }
    this.atCeiling = this.camera.position.y >= CEILING - 1;

    // the floor: the camera stays FLOOR metres above the terrain
    const floor = this.heightAt(p.x, p.z) + FLOOR;
    if (p.y < floor) { p.y = floor; this.controls.update(); }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // The elevation above sea level in metres. The placeholder ground is flat, so it reads 0.
  heightAt(x, z) {
    return 0;
  }

  dispose() {
    this.controls.dispose();
    this._clear();
    this.scene.clear();
    this.result = null;
  }

  _clear() {
    this.content.traverse((o) => {
      if (o === this.content) return;
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.content.clear();
  }
}
