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
import { Flora, GrassField } from './ground-flora.js';
import { GroundFauna } from './ground-fauna.js';
import { Sea } from './ground-sea.js';
import { Phenomena } from './ground-phenomena.js';
import { perf } from './perf.js';

// metres, the side of the ground box. The tier picks the real one and sends it with the patch
// request, so this is only the fallback for the moments before a patch arrives. See Q.ground in
// app.js: HIGH draws 3,000 and LOW draws 1,500.
export const PATCH_SIZE = 3000;
export const FOG_NEAR = 450;         // metres, where the fog starts
export const FOG_FAR = 750;          // metres, where the fog is solid
export const SKY_RADIUS = 5000;      // metres, the sky dome
// ---------------------------------------------------------------- the reach, issue 25
// How far from the site the target of the camera may go. This was FOG_NEAR until issue 25, on the
// rule that a target inside the fog always holds ground the reader can see. The rule cost the
// reader most of the box: a clamp of 450 in a box of 1,500 gave a walk of 900 units across, which
// is 28% of the area.
//
// The plants, and not the fog, set the true limit. The terrain is already seamless past the box,
// because the rim carries it and the patch fades its knolls into the rim. The plants stop:
// worker.js thins them to nothing over the last FLORA_EDGE units of the box, so dense flora ends
// at a square of half width half - FLORA_EDGE. The reach stands on that line. The reader stops
// where the plants begin to thin, and the band that is left carries the fade. Measured on
// Aurora@18.91,129.00 at a half width of 750, the plant count in a disc of radius 90 at the four
// limits was 72 to 134 per 10,000 square units, against 114 at the site.
//
// The reach is a rule and not a number, because the two tiers hold different boxes. HIGH draws
// 3,000 units and LOW draws 1,500, so one constant would be wrong for one of them. The worker
// reports its own FLORA_EDGE with the patch, so the two cannot drift apart. REACH_FADE is only
// the fallback for the moments before a patch arrives.
//
// The two numbers had to split here. FOG_NEAR also sets the depth of the fade, because update()
// holds the ratio FOG_NEAR / FOG_FAR as the fog opens. At 650 the fade at the ceiling falls from
// 530 units to 176, and the far ground then reads as a hard band with a straight edge against the
// sky. So the fog keeps 450 and the reader gets his own number.
const REACH_FADE = 100;              // units, the fallback for the plant fade of the worker
const reachOf = (half, fade) => half - (fade >= 0 ? fade : REACH_FADE);
// The ceiling and the tilt hold the edge of the box out of sight. See "the rectangle" below.
export const CEILING = 500;          // metres, the camera ceiling above the site
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
// A step up is asymmetric against a step down, because the two carry different risks. A step down
// that comes late costs the reader late frames; a step up that comes early costs nothing but a
// step down after it. So the knob comes down on one bad reading and it goes out on LOD_UP_HOLD
// good ones in a row, and it reads nothing at all for LOD_SETTLE after a step either way.
//
// LOD_SETTLE exists because the step itself is the slowest frame of the window. A step up builds
// the plants it just let in, and that one frame sat inside the rolling average of 30 frames when
// the next decision came 500 ms later. The knob read its own rebuild as a machine that cannot
// hold the refresh, came back down, and rang: I measured 209, 306, 314, 227, 250, 333 over 26 s
// with nothing else on the machine. LOD_SETTLE holds off the next decision until the rebuild
// frame has left the window.
const LOD_UP_HOLD = 2;      // good readings in a row before the knob goes out
const LOD_SETTLE = 800;     // ms after a step: no decision, so no step reads its own rebuild
// Issue 26: the knob remembers the distance that was too slow. LOD_COOL and LOD_UP_HOLD were meant
// to stop the knob ringing, and they are not enough, because neither of them remembers anything. A
// knob that steps down from a distance it cannot hold waits its three seconds, reads two good
// frames at the lower distance, and climbs straight back into the distance that failed. Measured on
// Aurora@18.91,129.00 walking at eye level, the knob ran 400, 340, 374, 400, 340, 400 over 30 s and
// left 40 frames of 300 over 20 ms. The reader sees that as the plants popping in and out.
//
// So a step down marks the distance it came from, and the knob may not climb back over that mark.
// The search then converges instead of swinging between two values. The mark thaws after
// LOD_FORGET of quiet, because a reader who walks out of a forest or rises over it has earned the
// distance back, and a single hitch from something else on the machine must not cap the view for
// the whole landing. The thaw is slow on purpose: LOD_THAW over LOD_PERIOD is a climb the eye does
// not read as a pop.
const LOD_MARK = 0.97;      // the mark sits just under the distance that could not hold
const LOD_FORGET = 30000;   // ms of no step down before the mark starts to thaw
const LOD_THAW = 1.05;      // what the mark grows by, once per decision, after LOD_FORGET
const LOD_STORE = 'myworlds.lod.v1';
const LOD_START = 150;      // metres, where the knob starts before the store says otherwise
const LOD_MIN = 40;         // metres, the floor of the knob
// metres, the ceiling of the knob. The tier lowers it: HIGH asks 220 and LOW asks 250. Issue 25
// took HIGH down from 400, because a wider box puts the reader inside the forest and the sphere of
// the knob then fills with plants the old box could not hold. See the Q table in app.js.
const LOD_MAX = 400;

export const CAM_START = 450;        // metres, the height the camera starts at over the site
// The rim: the ground outside the patch. It must reach past the fog, or its outer edge shows.
// At the ceiling the camera stands at most the reach + CEILING * tan(1.16),
// and the fog is solid at FOG_FAR + FOG_LIFT * CEILING. A ray from the ceiling meets the ground
// sqrt(fog^2 - CEILING^2) further out, and the sum is the reach the ground needs:
//
//     1400 + 500 * tan(1.16)          = 1400 + 1148 = 2548 units, the stand-off of the camera
//     750 + 1.15 * 500                = 1325 units, where the fog is solid
//     sqrt(1325^2 - 500^2)            = 1227 units, where that fog meets the ground
//     2548 + 1227                     = 3775 units, what the rim must cover
//
// Issue 25 took the reach of the wide tier to 1,400, which took the sum from 3,025 to 3,775 and
// left the old RIM of 3,150 short. RIM is now 4,000, which keeps 225 units of margin and lands on
// a whole rim cell: at size 3000 and grid 2 the rim step is 50, and (4000 - 1500) / 50 is exactly
// 50 cells. The narrow tier asks for less and the same number covers it. See _rimGeometry().
export const RIM = 4000;             // units, how far the rim reaches from the site

// ---------------------------------------------------------------- the rectangle, issue 20
// The patch holds a 2 m grid with knolls and rock. The rim outside it holds a 50 m grid with
// neither. The two make one surface, but the detail stops at the edge of the box, 750 units from
// the site. The fog must hide that edge.
//
// The fog opens FOG_LIFT metres for each metre of height, and the far edge of the box moves away
// only by the horizontal distance of the camera from the site. So the edge shows when
//
//     tan(polar angle) < FOG_LIFT
//
// A camera that looks straight down therefore always shows the box, at any height. Issue 20 held
// the tilt over that limit with a band that followed the height, and the flight keys replaced it:
// a camera that flies in a straight line must not have its view turned under it. The reveal still
// arrives at POLAR_HIGH, where tan(1.10) is 1.97 and the box stays hidden, and the ceiling still
// holds the camera at 500 m. A reader who climbs to the ceiling and then looks out at the horizon
// can see the edge. Measured on Auralis at -38.00,18.00, a flat inland cell: the square reads at
// 1,200 m, it still reads at 800 m, and nothing reads at 500 m.

// ---------------------------------------------------------------- the camera, issue 06
const TARGET_LIFT = 1;      // metres, the target floats this far over the terrain
const POLAR_DOWN = 0.05;    // rad, the steepest view down: a hair off straight down
const POLAR_HIGH = 1.10;    // rad, the tilt of the reveal, which looks out and down over the patch
// Issue 17: how far over the horizon the view may turn. The frame sets the limit. The view rises
// until the horizon reaches the bottom edge and no further, so the reader always keeps the ground
// in sight and cannot get lost in an empty sky. That is half the field of view over the horizon,
// which is 30 deg on this camera, and a polar angle of 2.09 rad. A flyer that hovers 35 m up and
// 35 m out stands 45 deg over the eye; it then sits high in the frame, but inside it.
//
// The floor of the camera is not the cap on this angle. OrbitControls puts the eye under the
// target to point the view up, so a cap that keeps the eye over the terrain also keeps the view
// under the horizon. The two jobs split here: the position clamp in update() holds the eye, and
// this holds the angle.
const polarUp = (camera) => Math.PI / 2 + THREE.MathUtils.degToRad(camera.fov) / 2;
const SPEED_SPAN = 400;     // metres, the height where a wheel step reaches its full size
// ---------------------------------------------------------------- the walk, issue 23
// The reader stands on a world 900 units wide and has to be able to cross it. A drag of the ground
// carries the short distances and the keys carry the long ones. Both move the pair, the camera and
// its target, so the view direction and the distance hold and only the place changes.
const WALK_SLOW = 11;       // units per second at eye height
const WALK_FAST = 150;      // units per second at the ceiling
const WALK_RUN = 5;         // what a held Shift multiplies the speed by
const WALK_EASE = 6;        // 1/s: how fast the walk reaches its speed, and how fast it stops
const WALK_HOLD = 300;      // ms a press must hold still before it becomes a walk
const WALK_EDGE = 80;       // units: the walk slows to nothing over this band at the limit of the pan
const KEY_YAW = 1.2;        // rad/s, the turn of the side arrows, Q, and E
const KEY_TILT = 0.9;       // rad/s, the tilt of R and F
const KEY_ZOOM = 1.8;       // the part of the distance + and - take each second
// One name per job, so the reader may press either of two keys for it. A key with one letter comes
// in lower case; a named key comes as the browser writes it.
//
// The arrows fly the camera, because the arrows are the keys every reader finds first. Up and down
// go the way the view points, so a view that looks down flies down. The side arrows turn the view
// instead of stepping sideways, so one hand on the arrows owns the whole ground; A and D keep the
// step sideways for the reader who walks with the left hand. Space lifts the camera, Ctrl drops
// it, and Shift runs.
const KEY_JOB = {
  w: 'fwd', arrowup: 'fwd', s: 'back', arrowdown: 'back',
  a: 'left', d: 'right',
  q: 'yawl', arrowleft: 'yawl', e: 'yawr', arrowright: 'yawr',
  r: 'tiltu', f: 'tiltd',
  ' ': 'up', control: 'down',
  '+': 'in', '=': 'in', '-': 'out', _: 'out', shift: 'run',
};
const SEAT_STEPS = 64;      // how many samples the pivot walks down the view ray. See _seatTarget()
const GLIDE_S = 0.8;        // seconds, the glide to a tapped point
const GLIDE_HIGH = 200;     // metres, a distance over this one shortens on a glide
const GLIDE_PULL = 1 / 3;   // the part of the distance the glide takes off
// units, the band a glide to a thing ends in. See glideTo().
const GLIDE_NEAR = 12;
const GLIDE_FAR = 120;
const TAP_SLOP = 6;         // px, a pointer that moves more than this is a drag, not a tap
const RAY_FAR = 3600;       // metres, how far the tap ray looks for the ground
// units: how far behind a plant an animal may stand and still take the tap. A reader who taps an
// animal beside a tree means the animal, so the animal wins unless it is clearly further back.
const PICK_GRACE = 2;
// The fog opens with the height of the camera. The reader lands 450 m up, and a fog that is solid
// at 750 m would show one flat colour there. FOG_MAX holds well under the reach of the rim, so
// the ground fades out before the rim ends and the reader never sees a cut edge. See RIM. The
// ceiling of issue 20 keeps the fog under 1,325 m, so FOG_MAX no longer binds.
const FOG_LIFT = 1.15;      // metres of fog distance per metre of height
const FOG_MAX = 2100;       // metres, the widest the fog opens

const CHUNKS = 10;           // the fine terrain splits into 10 by 10 meshes, so the frustum culls it
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
const _sph = new THREE.Spherical();
const _fw = new THREE.Vector3(), _rt = new THREE.Vector3();   // the walk basis of the frame
const _UP = new THREE.Vector3(0, 1, 0);
const _tint = [0, 0, 0];   // scratch colour for the rim rows

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
  constructor({ renderer, canvas, world, site, tier, onSelect, onSelectPlant, onDeselect }) {
    this.renderer = renderer;
    this.onSelect = onSelect || null;       // (kind) => void, a tap marked an animal of this species
    this.onSelectPlant = onSelectPlant || null; // (kind) => void, a tap marked a plant of this kind
    this.onDeselect = onDeselect || null;   // () => void, a tap on the ground took both marks off
    this.canvas = canvas;
    this.world = world;
    this.site = site;
    this.tier = tier || { grid: 2, maxFlora: 20000, maxFauna: 300, shadows: true, lodMax: LOD_MAX };
    this.result = null;
    this.sky = null;
    this.flora = null;
    this.grass = null;
    this.fauna = null;
    this.sea = null;
    this.phenomena = null;
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
    this._lodStep = 0;      // the time of the last step either way, for LOD_SETTLE
    this._lodGood = 0;      // good readings in a row, for LOD_UP_HOLD
    // The distance the knob may not climb back over, because it already failed there. It starts at
    // the ceiling of the tier, which is the same as no mark, and a new landing builds a new Ground
    // and so starts clean. See _driveLod().
    this._lodCeil = this.lod.max;
    this._lodPrev = this.lod.distance;
    this._shadowOn = false;
    this._shadowAt = 0;
    // the height grid of the patch, the coarse grid of the rim, and the ground height at the site
    this.heights = null;
    this.rim = null;
    this.n = 0; this.grid = 0; this.half = PATCH_SIZE / 2;
    this.reach = reachOf(this.half, -1);
    this.base = 0;
    this.ceiling = CEILING;

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
    // The pan slides the target over the ground, not over the screen, so a drag carries the reader
    // across the patch. Issue 23 gives the pan the first gesture, because on the ground the reader
    // wants to travel and the first thing every reader tries is one finger. One finger and the left
    // button therefore grab the ground, and two fingers and the right button turn the view. A pinch
    // still zooms, because two fingers do both. The globe keeps its own map, where one finger spins
    // the planet: there the reader turns a thing, and here the reader stands in a place.
    // _drive() sets the three speeds from the height every frame.
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    // the glide of a tap, and the pointer state that tells a tap from a drag
    this.glide = null;
    this._tap = null;
    this._pointers = 0;
    // Issue 23: the keys the reader holds, by job, and the walk velocity of the pair in units per
    // second. The velocity eases in and out, so no step starts or stops on one frame.
    this.keys = new Set();
    this._vx = 0;
    this._vy = 0;
    this._vz = 0;
    // The seam for issue 09. It sets pickCreature to a function that returns the creature under
    // the pointer, { point, kind, scale, dist, member } or null. One tap on a creature marks it
    // and glides to it; the app then offers the card of the marked animal on the floating button.
    // A tap on the ground takes the mark off and glides there.
    this.pickCreature = null;    // (ndcX, ndcY, event) => { point, kind, scale, dist, member } | null
    // The same seam for the plants, issue 24. It is set in load(), beside the flora.
    this.pickPlant = null;       // (ndcX, ndcY, event) => { point, kind, index, dist } | null
    this._bound = {
      down: (e) => this._onDown(e),
      move: (e) => this._onMove(e),
      up: (e) => this._onUp(e),
      wheel: () => { this.glide = null; },   // a wheel step takes the camera back from the glide
      keydown: (e) => this._onKey(e, true),
      keyup: (e) => this._onKey(e, false),
      // A key held while the tab goes away never sends its keyup, so the reader would come back to
      // a camera that walks on its own.
      blur: () => this.keys.clear(),
    };
    canvas.addEventListener('pointerdown', this._bound.down, { passive: true });
    canvas.addEventListener('pointermove', this._bound.move, { passive: true });
    canvas.addEventListener('pointerup', this._bound.up, { passive: true });
    canvas.addEventListener('pointercancel', this._bound.up, { passive: true });
    canvas.addEventListener('wheel', this._bound.wheel, { passive: true });
    // The keys go on the window, not on the canvas: the canvas takes no focus, and the reader who
    // just pressed a button in the sidebar must still be able to walk.
    addEventListener('keydown', this._bound.keydown);
    addEventListener('keyup', this._bound.keyup);
    addEventListener('blur', this._bound.blur);

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
    // the ground cover mask of issue 21, on its own grid at twice the terrain step
    this.cover = p && result.grass && result.grass.length ? result.grass : null;
    this.coverN = this.cover && p.cover ? p.cover.n : 0;
    this.coverStep = this.cover && p.cover ? p.cover.step : 1;
    this.n = p ? p.n : 0;
    this.grid = p ? p.grid : 0;
    this.half = p ? p.size / 2 : PATCH_SIZE / 2;
    // the clamp of the target follows the box this patch actually drew, not a constant
    this.reach = reachOf(this.half, p && p.floraEdge >= 0 ? p.floraEdge : -1);
    this.rim = null;
    if (p) this._loadRim(result);
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
    // The ceiling stands CEILING over the site, and over the water when the site lies under a sea.
    // The seabed of an ocean cell is kilometres down, and a ceiling measured from it would sit
    // under the waves and hold the reader on the surface.
    this.ceiling = Math.max(this.base, this.sea ? this.sea.level : -Infinity) + CEILING;

    if (p) {
      this._buildTerrain();
      this._buildFlora(result);
      this._buildGrass(result);
      // The phenomenon of the world, when this cell is the cell that holds it. The worker raised
      // the cone or the pool at the origin; this adds the smoke, the embers, and the jet. It comes
      // after the terrain, because it reads the drawn height at the origin. See ground-phenomena.js.
      this.phenomena = Phenomena.create({
        world: this.world, patch: p, tier: this.tier, sky: this.sky,
        heightAt: (x, z) => this.heightAt(x, z), renderer: this.renderer,
      });
      if (this.phenomena) this.content.add(this.phenomena.group);
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
      heightAt: (x, z) => this.heightAt(x, z), lod: this.lod,
      // Issue 17: the shadow of a flyer falls opposite the sun, and it goes out after sundown.
      sunDir: this.sunDir, night: this.sky.night,
    });
    this.content.add(this.fauna.group);

    // Fill the seam of issue 06: a tap on an animal marks it and glides to it. The app hears of
    // the mark through onSelect and offers the card of that animal on the floating button.
    this.pickCreature = (nx, ny, e) => {
      const r = this.canvas.getBoundingClientRect();
      const px = (nx + 1) / 2 * r.width, py = (1 - ny) / 2 * r.height;
      return this.fauna.pickHit(px, py, e && e.pointerType === 'touch' ? 52 : 34);
    };
    // The same seam for the plants. A plant does not move, so it needs no member and no scale.
    this.pickPlant = (nx, ny, e) => {
      if (!this.flora) return null;
      const r = this.canvas.getBoundingClientRect();
      const px = (nx + 1) / 2 * r.width, py = (1 - ny) / 2 * r.height;
      return this.flora.pickHit(px, py, e && e.pointerType === 'touch' ? 52 : 34);
    };

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

    // The reveal: the camera starts CAM_START up and south of the site by the same tilt the
    // ceiling holds, and it looks at the site. The reader sees the patch from over the fog and
    // zooms in. The tilt keeps the edge of the box in the fog. See "the rectangle" above.
    this.glide = null;
    this.controls.target.set(0, this.base + TARGET_LIFT, 0);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(0, this.base + CAM_START, CAM_START * Math.tan(POLAR_HIGH));
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
    // The rim carries the ground out past the fog, in one mesh with the same material.
    if (this.rim) this.content.add(this._mesh(this._rimGeometry(), mat));
  }

  // The plants of the patch. ground-flora.js owns the meshes, the cards, and the LOD walk.
  _buildFlora(result) {
    if (!result.flora || result.flora.length === 0) return;
    this.flora = new Flora({
      renderer: this.renderer, flora: result.flora, palette: result.patch.palette,
      tier: this.tier, sky: this.sky, lod: this.lod, cut: FOG_FAR * 1.2,
      groundColor: this.groundColor, variant: result.patch.floraVariant || 0,
      // Issue 24: the pick projects with the ground camera and measures in the pixels of this view.
      camera: this.camera, canvas: this.canvas,
    });
    this.content.add(this.flora.group);
    const m = result.patch.marks;
    console.info(`[myworlds] ground flora ${this.flora.count} plants in ${this.flora.kinds.length} kinds`
      + (m ? `, ${m.placed} of them in ${m.tried} arrangements, ${m.colossus} colossus courts`
        + `, and ${m.mega} mega plants` : ''));
  }

  // The ground cover of the patch. The worker says where a tuft may grow; GrassField grows a
  // lattice of them around the camera and carries it as the reader walks. See ground-flora.js.
  _buildGrass(result) {
    if (!this.cover) return;
    this.grass = new GrassField({
      palette: result.patch.palette, tier: this.tier, variant: result.patch.floraVariant || 0,
      sampler: {
        heightAt: (x, z) => this.heightAt(x, z),
        coverAt: (x, z) => this.coverAt(x, z),
        colorAt: (x, z, out) => this.colorAt(x, z, out),
      },
    });
    this.content.add(this.grass.group);
  }

  // The cover mask at one point, 0 to 1. The mask runs on its own grid at twice the terrain step,
  // so it reads the nearest node: one tuft is about one unit wide and the reader cannot see the
  // difference between the nearest node and a smooth one.
  coverAt(x, z) {
    const C = this.cover;
    if (!C) return 0;
    const N = this.coverN, s = this.coverStep;
    const i = Math.round((x + this.half) / s), j = Math.round((z + this.half) / s);
    if (i < 0 || j < 0 || i >= N || j >= N) return 0;
    return C[j * N + i] / 255;
  }

  // The colour of the terrain at one point, from the vertex colours the worker painted.
  colorAt(x, z, out) {
    const C = this.result && this.result.colors;
    out[0] = out[1] = out[2] = 1;
    if (!C) return out;
    const n = this.n;
    const i = Math.round((x + this.half) / this.grid), j = Math.round((z + this.half) / this.grid);
    if (i < 0 || j < 0 || i >= n || j >= n) return out;
    const o = (j * n + i) * 3;
    out[0] = C[o]; out[1] = C[o + 1]; out[2] = C[o + 2];
    return out;
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

  // ---------------------------------------------------------------- the rim, issue 18
  // The worker sends a coarse grid that reaches RIM units from the site. Its cell is a whole
  // number of patch steps and it divides the box, so every rim node on the edge of the patch sits
  // on a patch vertex. The rim takes the height and the colour of those nodes from the patch, and
  // the two grids then hold one value at the join.
  _loadRim(result) {
    this.rim = null;
    const r = result.patch && result.patch.rim;
    if (!r || !result.rimHeights || !result.rimColors) return;
    const rim = {
      h: result.rimHeights, c: result.rimColors, n: r.n, step: r.step, out: r.out,
      d: Math.round((r.out - this.half) / r.step),   // rim cells from the outer edge to the patch
      cols: Math.round(this.half * 2 / r.step),      // rim cells across the patch
      m: Math.round(r.step / this.grid),             // patch steps per rim cell
    };
    this.rim = rim;

    const n = this.n, rn = rim.n, d = rim.d, m = rim.m;
    const H = this.heights, C = result.colors, RH = rim.h, RC = rim.c;
    const take = (ri, rj, pi, pj) => {
      const q = rj * rn + ri, s = pj * n + pi;
      RH[q] = H[s];
      RC[q * 3] = C[s * 3]; RC[q * 3 + 1] = C[s * 3 + 1]; RC[q * 3 + 2] = C[s * 3 + 2];
    };
    for (let a = 0; a <= rim.cols; a++) {
      const p = a * m;
      take(d + a, d, p, 0);                 // the north edge of the patch
      take(d + a, rn - 1 - d, p, n - 1);    // the south edge
      take(d, d + a, 0, p);                 // the west edge
      take(rn - 1 - d, d + a, n - 1, p);    // the east edge
    }
  }

  // One mesh and one material for the whole rim. It holds the coarse cells outside the patch and
  // four dense strips that tie the coarse grid to the patch.
  //
  // A strip carries one vertex per patch step on the edge of the patch, and the same count on the
  // first coarse line of the rim. A height read along a grid line of the rim lies on the straight
  // edge of the coarse cell beyond it. So the outer side of a strip lies on that cell, the inner
  // side lies on the patch, and neither side leaves a crack where the two steps meet.
  _rimGeometry() {
    const rim = this.rim, rn = rim.n, s = rim.step, out = rim.out;
    const n = this.n, half = this.half, grid = this.grid, C = this.result.colors;
    const lo = rim.d, hi = rn - 1 - rim.d;           // the rim lines on the edge of the patch
    const across = (k) => k >= lo && k < hi;         // a cell inside the width of the patch
    const strip = (i, j) => (across(i) && (j === lo - 1 || j === hi))
      || (across(j) && (i === lo - 1 || i === hi));  // a cell a dense strip draws

    let cells = 0;
    for (let j = 0; j < rn - 1; j++) {
      for (let i = 0; i < rn - 1; i++) {
        if (across(i) && across(j)) continue;        // the patch draws it
        if (strip(i, j)) continue;
        cells++;
      }
    }
    const vCount = rn * rn + 8 * n;                  // the coarse nodes, and two rows per strip
    const pos = new Float32Array(vCount * 3), col = new Float32Array(vCount * 3);
    const tris = cells * 2 + 4 * (n - 1) * 2;
    const idx = vCount > 65536 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);

    let o = 0;
    for (let j = 0; j < rn; j++) {
      const z = -out + j * s;
      for (let i = 0; i < rn; i++) {
        const k = j * rn + i, c3 = k * 3;
        pos[o] = -out + i * s; pos[o + 1] = rim.h[k]; pos[o + 2] = z;
        col[o] = rim.c[c3]; col[o + 1] = rim.c[c3 + 1]; col[o + 2] = rim.c[c3 + 2];
        o += 3;
      }
    }
    let m = 0;
    for (let j = 0; j < rn - 1; j++) {
      for (let i = 0; i < rn - 1; i++) {
        if (across(i) && across(j)) continue;
        if (strip(i, j)) continue;
        const a = j * rn + i, b = a + 1, c = a + rn, e = c + 1;
        idx[m] = a; idx[m + 1] = c; idx[m + 2] = e;
        idx[m + 3] = a; idx[m + 4] = e; idx[m + 5] = b;
        m += 6;
      }
    }

    // One row of a strip on the edge of the patch. It repeats the patch vertex, jitter included,
    // so the two meshes hold one colour as well as one height.
    let v = rn * rn;
    const patchRow = (pi, pj, di, dj) => {
      const first = v;
      for (let a = 0; a < n; a++) {
        const k = (pj + dj * a) * n + (pi + di * a), c3 = k * 3;
        pos[o] = -half + (pi + di * a) * grid;
        pos[o + 1] = this.heights[k];
        pos[o + 2] = -half + (pj + dj * a) * grid;
        const t = 1 + (hash1(k) - 0.5) * 2 * JITTER;
        col[o] = C[c3] * t; col[o + 1] = C[c3 + 1] * t; col[o + 2] = C[c3 + 2] * t;
        o += 3; v++;
      }
      return first;
    };
    // One row of a strip on the first coarse line, read at the step of the patch.
    const rimRow = (x0, z0, dx, dz) => {
      const first = v;
      for (let a = 0; a < n; a++) {
        const x = x0 + dx * a, z = z0 + dz * a;
        pos[o] = x; pos[o + 1] = this._rimAt(x, z); pos[o + 2] = z;
        this._rimColorAt(x, z, _tint);
        col[o] = _tint[0]; col[o + 1] = _tint[1]; col[o + 2] = _tint[2];
        o += 3; v++;
      }
      return first;
    };
    // Two rows into triangles. Row A lies at the smaller z, or at the larger x, so the normal
    // points up, as it does over the patch.
    const bind = (A, B) => {
      for (let a = 0; a < n - 1; a++) {
        idx[m] = A + a; idx[m + 1] = B + a; idx[m + 2] = B + a + 1;
        idx[m + 3] = A + a; idx[m + 4] = B + a + 1; idx[m + 5] = A + a + 1;
        m += 6;
      }
    };
    bind(rimRow(-half, -half - s, grid, 0), patchRow(0, 0, 1, 0));          // north
    bind(patchRow(0, n - 1, 1, 0), rimRow(-half, half + s, grid, 0));       // south
    bind(patchRow(0, 0, 0, 1), rimRow(-half - s, -half, 0, grid));          // west
    bind(rimRow(half + s, -half, 0, grid), patchRow(n - 1, 0, 0, 1));       // east
    return makeGeometry(pos, col, idx);
  }

  // The height of the rim at a point, bilinear on the coarse grid and clamped to its edge.
  _rimAt(x, z) {
    const r = this.rim;
    if (!r) return 0;
    const n = r.n, s = r.step, out = r.out, H = r.h;
    const u = Math.min(n - 1, Math.max(0, (x + out) / s)), w = Math.min(n - 1, Math.max(0, (z + out) / s));
    const i0 = Math.min(n - 2, Math.floor(u)), j0 = Math.min(n - 2, Math.floor(w));
    const fx = u - i0, fz = w - j0;
    const a = H[j0 * n + i0], b = H[j0 * n + i0 + 1];
    const c = H[(j0 + 1) * n + i0], d = H[(j0 + 1) * n + i0 + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  _rimColorAt(x, z, out3) {
    const r = this.rim, n = r.n, s = r.step, out = r.out, C = r.c;
    const u = Math.min(n - 1, Math.max(0, (x + out) / s)), w = Math.min(n - 1, Math.max(0, (z + out) / s));
    const i0 = Math.min(n - 2, Math.floor(u)), j0 = Math.min(n - 2, Math.floor(w));
    const fx = u - i0, fz = w - j0;
    const a = (j0 * n + i0) * 3, b = a + 3, c = ((j0 + 1) * n + i0) * 3, d = c + 3;
    for (let k = 0; k < 3; k++) {
      out3[k] = (C[a + k] * (1 - fx) + C[b + k] * fx) * (1 - fz)
        + (C[c + k] * (1 - fx) + C[d + k] * fx) * fz;
    }
    return out3;
  }

  update(t, dt) {
    this._drive();               // the speeds and the tilt, both from the height of the camera
    this.controls.update();
    if (this.glide) this._stepGlide(dt);
    // Issue 23: a press that holds still, and does not move, becomes a walk.
    const tap = this._tap;
    if (tap && !tap.walk && performance.now() - tap.t > WALK_HOLD) tap.walk = true;
    this._stepMove(dt);
    const p = this.camera.position, tg = this.controls.target;

    // The target stays inside the reach, so the view always holds ground that carries plants. The
    // camera takes the same step, so a pan that reaches the limit stops the whole view there
    // instead of sliding the camera on over a target that cannot follow.
    const tr = Math.hypot(tg.x, tg.z);
    if (tr > this.reach) {
      const k = this.reach / tr - 1;
      const dx = tg.x * k, dz = tg.z * k;
      tg.x += dx; tg.z += dz;
      p.x += dx; p.z += dz;
    }

    // The height of the pair. The reader owns it. The camera used to ride the terrain: the target
    // sat one metre over the ground under it and the eye kept its offset from the target, so the
    // whole view rose and fell with every hill the target crossed. That reads as a bounce under a
    // flight in a straight line, and over a slope it fights the key that asks for height. The rule
    // is now two limits and nothing else, the floor over the terrain or the water and the ceiling
    // over the site. Each moves the camera and the target by one step, so the view direction and
    // the distance hold and only the height changes.
    const floor = this._floorAt(p.x, p.z);
    const ceiling = this.ceiling;
    const step = THREE.MathUtils.clamp(p.y, floor, Math.max(floor, ceiling)) - p.y;
    if (step !== 0) { p.y += step; tg.y += step; }
    this.atCeiling = p.y >= ceiling - 1;

    // The pivot follows the view to the ground, once the camera is where the frame leaves it. A
    // drag turns the camera about the pivot, so a pivot that moved under a held pointer would
    // move the camera with it; the seat therefore waits until the reader lets go.
    if (!this.glide && !this._pointers) this._seatTarget();

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
    // the phenomenon reads the field of view of the camera for its point sizes
    if (this.phenomena) this.phenomena.update(t, dt, this.camera);
    // the sea follows the target, so it must move after the target clamp
    if (this.sea) this.sea.update(t, tg);

    // the LOD walk reads the camera, so it runs after the clamps too
    if (this.flora) this.flora.update(this.camera, t);
    if (this.grass) this.grass.update(this.camera, t);
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
  //
  // The two steps are also asymmetric in time. A step down runs on one bad reading, because a late
  // frame is a cost the reader pays now. A step up waits for LOD_UP_HOLD good readings. And neither
  // step reads anything for LOD_SETTLE after it, because the rebuild it carries is the slowest
  // frame of the window and it is not a verdict on the step.
  _driveLod() {
    const now = performance.now();
    if (now - this._lodAt < LOD_PERIOD) return;
    this._lodAt = now;
    if (!perf.ready) return;
    // The frame that carried the last step is the slowest frame of the window, and it says nothing
    // about the step. Wait until it has left the window.
    if (now - this._lodStep < LOD_SETTLE) return;
    const lod = this.lod, avg = perf.avg, work = perf.avgWork, target = perf.target;
    let d = lod.distance;
    // The mark thaws only while nothing has failed for a long time, so a knob that is holding its
    // level keeps holding it, and a reader who has left the dense ground wins the distance back.
    if (now - this._lodDown > LOD_FORGET) this._lodCeil = Math.min(lod.max, this._lodCeil * LOD_THAW);
    if (avg > target * LOD_OVER) {
      // This distance could not hold, so the knob marks it and may not climb back over the mark.
      this._lodCeil = Math.min(this._lodCeil, d * LOD_MARK);
      d *= LOD_DOWN; this._lodDown = now; this._lodStep = now; this._lodGood = 0;
    } else if (avg < target * LOD_STEADY && work < target * LOD_UNDER && now - this._lodDown > LOD_COOL) {
      // A good reading on its own is not a verdict, so the knob counts them and goes out on the
      // LOD_UP_HOLD-th one. The count drops on any reading that is not good. A step out that the
      // mark forbids is not a step, so the count holds and the knob tries again on the next one.
      if (++this._lodGood >= LOD_UP_HOLD && d * LOD_UP <= this._lodCeil) {
        d *= LOD_UP; this._lodStep = now; this._lodGood = 0;
      }
    } else this._lodGood = 0;
    lod.distance = Math.min(lod.max, this._lodCeil, Math.max(lod.min, d));
    // the mark must never push the knob under its floor, which the tier owns
    if (lod.distance < lod.min) lod.distance = lod.min;
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
    // The walk of the plants keeps a caster outside the frame only while the sun draws a shadow.
    if (this.flora) this.flora.casts = this._shadowOn;
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

  // ---------------------------------------------------------------- the view in the URL
  // The camera in the frame of the patch: the target on the ground, and the offset of the camera
  // from it as a distance and two angles. The site is the origin of that frame and the patch comes
  // from the seed and the site, so the numbers hold for every reader who opens the link.
  get view() {
    const tg = this.controls.target;
    _off.copy(this.camera.position).sub(tg);
    const dist = _off.length() || 1;
    return {
      kind: 'ground',
      x: tg.x, z: tg.z, dist,
      az: Math.atan2(_off.x, _off.z),
      pol: Math.acos(THREE.MathUtils.clamp(_off.y / dist, -1, 1)),
    };
  }

  // Put the camera where a link asks, in place of the reveal position of load(). The clamps of
  // update() run over it on the next frame, so a number from an old link cannot push the view
  // under the ground or over the ceiling.
  setView(v) {
    if (!v || v.kind !== 'ground') return false;
    const r = Math.hypot(v.x, v.z);
    const k = r > this.reach ? this.reach / r : 1;
    const x = v.x * k, z = v.z * k;
    // The offset can be longer than controls.maxDistance: the clamps of update() move the camera
    // after the controls aimed it, and over a deep sea the target sits on the bed far below. So the
    // guard here is the sky dome, the widest the ground scene ever is.
    const dist = THREE.MathUtils.clamp(v.dist, 1, SKY_RADIUS);
    // Issue 17 opened the angle over the horizon, so a link may hold an up-view. The clamps of
    // update() put the eye back over the terrain on the next frame, and the target goes up.
    const pol = THREE.MathUtils.clamp(v.pol, 0.05, polarUp(this.camera));
    this.glide = null;
    this.controls.target.set(x, this._groundAt(x, z) + TARGET_LIFT, z);
    this.camera.up.set(0, 1, 0);
    const tg = this.controls.target, s = Math.sin(pol);
    this.camera.position.set(
      tg.x + dist * s * Math.sin(v.az),
      tg.y + dist * Math.cos(pol),
      tg.z + dist * s * Math.cos(v.az),
    );
    // The band the controls hold is the band of the camera this call replaces, so it belongs to a
    // height the link does not use. It would cut the angle of the link, and an up-view would come
    // back at the horizon. Open the band for this one update; _drive() sets it from the new height
    // on the next frame, and it pulls the view back if the link asks for more than that height gives.
    this.controls.minPolarAngle = Math.min(this.controls.minPolarAngle, pol);
    this.controls.maxPolarAngle = Math.max(this.controls.maxPolarAngle, pol);
    this.controls.update();
    return true;
  }

  // ---------------------------------------------------------------- the feel of the controls
  // The height of the camera sets the speeds. Near the ground a wheel step moves a metre or two;
  // at the ceiling a step moves about a hundred metres. The tilt is no longer one of them.
  _drive() {
    const p = this.camera.position;
    const h = Math.max(0, p.y - this._floorAt(p.x, p.z));
    const near = THREE.MathUtils.clamp(h / SPEED_SPAN, 0.06, 1);
    this.controls.rotateSpeed = 0.35 + 0.35 * near;
    this.controls.zoomSpeed = 0.9 + 1.6 * near;
    // The pan carries the first gesture since issue 23, so a drag has to move the ground by about
    // the distance the pointer moves over it. Under 1 the ground slips under the finger.
    this.controls.panSpeed = 1 + 0.4 * near;

    // The tilt is the reader's at every height. It runs from a hair off straight down to the
    // angle that keeps the horizon on the bottom edge of the frame, so the reader can look up at
    // the canopy and the sky and still never lose the ground. The height used to steer the tilt,
    // and it no longer does: a camera that flies in a straight line must not have its view turned
    // under it. See "the rectangle" above for what that costs.
    this.controls.minPolarAngle = POLAR_DOWN;
    this.controls.maxPolarAngle = polarUp(this.camera);
  }

  // ---------------------------------------------------------------- the walk, issue 23
  // A key goes in by its job, so W and the up arrow are one thing. The reader who types a seed in
  // the sidebar must not walk, so an editable element takes every key. A keyup always comes off,
  // even while the controls are off, or a key held through the dive would stay down for ever.
  _onKey(e, down) {
    const job = KEY_JOB[e.key.toLowerCase()];
    if (!job) return;
    if (!down) { this.keys.delete(job); return; }
    // Ctrl drops the camera, so a held Ctrl now rides on every other key of the flight and the
    // guard can no longer read it as a shortcut. Cmd and Alt still take their keys away.
    if (!this.controls.enabled || e.metaKey || e.altKey || e.repeat) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    // Space presses the button that holds the focus, and the reader who just clicked the probe
    // button would find the lift key dead. So the ground takes the space key and the button gives
    // up the focus. Enter still presses a button, so the keyboard reader keeps every control.
    if (job === 'up' && el && el.matches && el.matches('button, a, select, summary')) el.blur();
    this.keys.add(job);
    if (e.cancelable) e.preventDefault();   // an arrow key scrolls the page, and a space would too
  }

  // The lowest the eye may go over a point, which is the terrain or the water, whichever is
  // higher. The clamp of update() holds the eye here, and the drop key stops here, so the two read
  // one rule. Over a sea the seabed lies far under the water and only the water counts.
  _floorAt(x, z) {
    return this._surfaceAt(x, z) + FLOOR;
  }

  // The top of the world at a point: the terrain, or the water over it on a sea. The seabed of an
  // ocean cell is kilometres down and the reader stands on the waves, so only the water counts.
  _surfaceAt(x, z) {
    const under = this._groundAt(x, z);
    return this.sea ? Math.max(under, this.sea.level) : under;
  }

  // The pivot walks in to the ground the view points at.
  //
  // The camera always looks at its target, and the distance between the two sets three things:
  // what a drag swings the camera about, what one wheel step is worth, and how far from an animal
  // a glide leaves the reader. The old rig tied that distance to the height, because the reader
  // came down by zooming in. The flight keys carry the target along instead and never change the
  // distance, so after a flight to the ground the pivot still sat where the probe landed, 990
  // units out. A focus on an animal then read the stale number and parked the reader 660 units
  // from it, the shadow box followed a target far outside the frame, and one wheel step moved a
  // hundred metres at eye height.
  //
  // So the pivot follows the view down to the ground. It only ever comes in: the wheel and the
  // zoom keys own the way out, because a reader who wants to stand back asks for it. The target
  // holds the same ray, so the camera does not move and the reader sees nothing happen.
  _seatTarget() {
    const p = this.camera.position, tg = this.controls.target;
    _dir.copy(tg).sub(p);
    const d0 = _dir.length();
    if (d0 < 1e-4) return;
    _dir.divideScalar(d0);
    if (_dir.y >= 0) return;            // a view over the horizon meets no ground
    const step = Math.max(1, d0 / SEAT_STEPS);
    for (let t = step; t <= d0; t += step) {
      const y = p.y + _dir.y * t;
      if (y <= this._surfaceAt(p.x + _dir.x * t, p.z + _dir.z * t)) {
        const d = Math.max(this.controls.minDistance, t);
        if (d < d0) tg.copy(p).addScaledVector(_dir, d);
        return;
      }
    }
  }

  // The way the view points, in three dimensions. The forward keys follow this, so a view that
  // looks down flies down and a view that looks up climbs. The target travels with the camera, so
  // the direction holds over the whole flight: a straight line stays a straight line.
  _look(out) {
    out.copy(this.controls.target).sub(this.camera.position);
    if (out.lengthSq() > 1e-8) return out.normalize();
    return this._forward(out);
  }

  // The way the view faces, flat on the ground. A view that points straight down has no such way,
  // so it takes the way the top of the screen faces instead.
  _forward(out) {
    out.copy(this.controls.target).sub(this.camera.position);
    out.y = 0;
    if (out.lengthSq() > 1e-8) return out.normalize();
    out.copy(_UP).applyQuaternion(this.camera.quaternion);
    out.y = 0;
    return out.lengthSq() > 1e-8 ? out.normalize() : null;
  }

  // The way a held pointer points, flat on the ground. The reader steers with the thumb: a press
  // in the middle of the frame walks straight on, and a press near an edge walks that way.
  _pointerWay(out) {
    const t = this._tap;
    if (!t) return null;
    const r = this.canvas.getBoundingClientRect();
    const nx = ((t.x - r.left) / r.width) * 2 - 1;
    const ny = -((t.y - r.top) / r.height) * 2 + 1;
    out.set(nx, ny, 0.5).unproject(this.camera).sub(this.camera.position);
    out.y = 0;
    return out.lengthSq() > 1e-8 ? out.normalize() : this._forward(out);
  }

  // One step of the walk and of the look keys. It runs after the controls and before every clamp,
  // so the fog limit, the floor, and the ceiling all hold over it.
  //
  // The look keys turn the target about the eye, and not the eye about the target. The reader
  // turns the head: a camera swung about a target 15 m away would walk a 15 m circle instead.
  _stepMove(dt) {
    if (dt <= 0 || !this.controls.enabled) return;
    const p = this.camera.position, tg = this.controls.target, K = this.keys;
    const yaw = (K.has('yawl') ? 1 : 0) - (K.has('yawr') ? 1 : 0);
    const tilt = (K.has('tiltu') ? 1 : 0) - (K.has('tiltd') ? 1 : 0);
    if (yaw || tilt) {
      _dir.copy(tg).sub(p);
      if (yaw) _dir.applyAxisAngle(_UP, yaw * KEY_YAW * dt);
      if (tilt) {
        _rt.crossVectors(_dir, _UP);
        if (_rt.lengthSq() > 1e-8) _dir.applyAxisAngle(_rt.normalize(), tilt * KEY_TILT * dt);
      }
      tg.copy(p).add(_dir);
      this.glide = null;
    }
    // The zoom keys take the reader up over the trees and back down, so a reader with no wheel and
    // no pinch still owns the height. The clamps of update() hold the floor and the ceiling.
    const zoom = (K.has('in') ? 1 : 0) - (K.has('out') ? 1 : 0);
    if (zoom) {
      const d0 = p.distanceTo(tg);
      const d1 = THREE.MathUtils.clamp(d0 * Math.pow(KEY_ZOOM, -zoom * dt),
        this.controls.minDistance, this.controls.maxDistance);
      if (d0 > 1e-4) p.sub(tg).setLength(d1).add(tg);
      this.glide = null;
    }

    // The direction the reader asks for, in three dimensions. The keys come first; a press that
    // holds still steers with the pointer instead. A press that moves is a drag of the ground, and
    // the controls own it.
    let wx = 0, wy = 0, wz = 0;
    const f = (K.has('fwd') ? 1 : 0) - (K.has('back') ? 1 : 0);
    const r = (K.has('right') ? 1 : 0) - (K.has('left') ? 1 : 0);
    const lift = (K.has('up') ? 1 : 0) - (K.has('down') ? 1 : 0);
    const look = this._look(_fw);
    if (look && (f || r)) {
      wx = look.x * f; wy = look.y * f; wz = look.z * f;
      if (r) {
        // The step sideways stays flat: a reader who steps aside means the ground, not the sky.
        _rt.crossVectors(look, _UP);
        if (_rt.lengthSq() > 1e-8) { _rt.normalize(); wx += _rt.x * r; wz += _rt.z * r; }
      }
    } else if (!f && !r && !lift && this._tap && this._tap.walk) {
      const way = this._pointerWay(_rt);
      if (way) { wx = way.x; wz = way.z; }
    }
    wy += lift;
    // The floor and the ceiling take the vertical part before the ease reads it, so a key held
    // against a limit winds up no speed that the clamp of update() then throws away.
    const h = Math.max(0, p.y - this._floorAt(p.x, p.z));
    if (wy < 0 && h <= 0.05) wy = 0;
    if (wy > 0 && p.y >= this.ceiling - 0.05) wy = 0;
    const len = Math.hypot(wx, wy, wz);
    if (len > 1e-6) {
      wx /= len; wy /= len; wz /= len;
      this.glide = null;
      // The pan of the reader stops at the fog and so does the walk. It slows over the last
      // WALK_EDGE units instead of meeting a wall, and only the part of the step that goes outward
      // slows, so the reader still walks along the edge and back in at full speed.
      const tr = Math.hypot(tg.x, tg.z);
      const out = tr > 1e-6 ? (wx * tg.x + wz * tg.z) / tr : 0;
      if (out > 0 && tr > this.reach - WALK_EDGE) {
        const cut = THREE.MathUtils.smoothstep(tr, this.reach - WALK_EDGE, this.reach) * out;
        wx -= (tg.x / tr) * cut; wz -= (tg.z / tr) * cut;
      }
    } else { wx = 0; wy = 0; wz = 0; }

    // The height sets the speed, as it sets the speed of a wheel step: a walk near the ground is a
    // walk, and at the ceiling one second carries the reader over a third of the patch.
    const speed = THREE.MathUtils.lerp(WALK_SLOW, WALK_FAST, THREE.MathUtils.clamp(h / SPEED_SPAN, 0, 1))
      * (K.has('run') ? WALK_RUN : 1);
    const k = 1 - Math.exp(-WALK_EASE * dt);
    this._vx += (wx * speed - this._vx) * k;
    this._vy += (wy * speed - this._vy) * k;
    this._vz += (wz * speed - this._vz) * k;
    // The camera and the target take one step on all three axes, so the view direction and the
    // distance hold and only the place changes.
    const dx = this._vx * dt, dy = this._vy * dt, dz = this._vz * dt;
    if (dx * dx + dy * dy + dz * dz > 1e-10) {
      p.x += dx; p.y += dy; p.z += dz;
      tg.x += dx; tg.y += dy; tg.z += dz;
    }
  }

  // ---------------------------------------------------------------- the glide
  // A tap moves the target to the point under the pointer over GLIDE_S seconds with an ease-out.
  // A camera over GLIDE_HIGH metres from its target also comes a third of the way in, so a tap
  // from high up both aims and closes. The reader keeps the view direction: only the offset
  // length changes, so a turn during the glide still works.
  //
  // `frame` marks a destination the reader means to look at, an animal or a plant, and it ends the
  // glide inside the band that shows one. The distance the reader kept is the distance to the
  // ground the view points at, which says nothing about how far away the animal is: a reader who
  // stands on the patch holds a few units and would land inside the animal, and a reader who has
  // just arrived holds nine hundred and would watch it from the next hill. A tap on bare ground
  // takes no band and travels, because there the distance is the whole point of the gesture.
  glideTo(point, done, frame) {
    const to = point.clone();
    const r = Math.hypot(to.x, to.z);
    if (r > this.reach) { const k = this.reach / r; to.x *= k; to.z *= k; }
    to.y = this._groundAt(to.x, to.z) + TARGET_LIFT;
    const d0 = this.camera.position.distanceTo(this.controls.target);
    let d1 = d0 > GLIDE_HIGH ? d0 * (1 - GLIDE_PULL) : d0;
    if (frame) d1 = THREE.MathUtils.clamp(d1, GLIDE_NEAR, GLIDE_FAR);
    // A glide only ever closes. The band would otherwise push a reader who already stands beside
    // a plant back out to GLIDE_NEAR, and a tap that walks the reader backwards reads as a fault.
    d1 = Math.max(this.controls.minDistance, Math.min(d1, this.camera.position.distanceTo(to)));
    this.glide = { k: 0, from: this.controls.target.clone(), to, d0, d1, done: done || null };
    return this.glide;
  }

  // Issue 17: the turn to a flyer. A flyer hovers tens of metres over the ground and the target
  // rides the ground, so no glide of the target can reach it. The view turns instead: the offset
  // from the target to the eye swings until the view points at the flyer, and the clamps of
  // update() then carry the target up into the sky and hold the eye over the terrain. The eye
  // keeps its place, so the reader turns the head and does not walk.
  //
  // The turn ends inside maxPolarAngle, the reach the reader's own drag has at this height. A turn
  // past it would hold for the glide and then snap back, because the controls clamp the angle on
  // every frame.
  turnTo(point, done) {
    const p = this.camera.position, tg = this.controls.target;
    const d = Math.max(this.controls.minDistance, p.distanceTo(tg));
    const to = _dir.copy(p).sub(point).setLength(d);
    _sph.setFromVector3(to);
    _sph.phi = Math.min(_sph.phi, this.controls.maxPolarAngle);
    _sph.makeSafe();
    this.glide = { k: 0, turn: true, from: _off.copy(p).sub(tg).clone(), to: to.setFromSpherical(_sph).clone(), done: done || null };
    return this.glide;
  }

  // The arrows of the card ask for the next species. When the patch holds an animal of it, this
  // marks the nearest one and points the view at it, with the same choice the tap makes: a flyer
  // over the eye takes a turn, every other animal takes a glide. When the patch holds none, the
  // view stays where it is and the mark comes off, so the ring cannot sit under one species while
  // the card shows another. Returns true when an animal took the mark.
  focusKind(kind) {
    if (!this.fauna) return false;
    const tg = this.controls.target;
    const m = this.fauna.nearestMember(kind, tg.x, tg.z);
    if (this.flora) this.flora.unmark();   // one mark at a time: the ring must name the open card
    if (!m) { this.fauna.unmark(); return false; }
    this.fauna.markMember(m);
    this.fauna.group.updateWorldMatrix(true, false);
    const point = new THREE.Vector3(m.px, m.py, m.pz).applyMatrix4(this.fauna.group.matrixWorld);
    if (m.g.flies && point.y > this.camera.position.y + 1) this.turnTo(point);
    else this.glideTo(point, null, true);
    return true;
  }

  // The same for the arrows of a plant card: mark the nearest plant of the kind and point the view
  // at it. A plant stands on the ground, so it always takes a glide and never a turn. Returns true
  // when a plant took the mark; a kind this patch does not grow leaves the view where it is.
  focusPlant(kind) {
    if (!this.flora) return false;
    if (this.fauna) this.fauna.unmark();
    const tg = this.controls.target;
    const hit = this.flora.nearest(kind, tg.x, tg.z);
    if (!hit) { this.flora.unmark(); return false; }
    this.flora.mark(hit);
    this.glideTo(hit.point, null, true);
    return true;
  }

  _stepGlide(dt) {
    const g = this.glide;
    g.k = Math.min(1, g.k + dt / GLIDE_S);
    const e = 1 - Math.pow(1 - g.k, 3);
    const p = this.camera.position, tg = this.controls.target;
    if (g.turn) {
      // The offset turns and its length holds. A lerp of two offsets of one length, set back to
      // that length, walks the same arc a slerp walks over the angle a turn of the view covers.
      p.copy(tg).add(_off.copy(g.from).lerp(g.to, e).setLength(g.to.length()));
    } else {
      const off = _off.copy(p).sub(tg);
      tg.lerpVectors(g.from, g.to, e);
      p.copy(tg).add(off.setLength(THREE.MathUtils.lerp(g.d0, g.d1, e)));
    }
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
    this._tap = (!mouse || e.button === 0)
      ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), walk: false } : null;
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
    if (tap.walk) return;        // the press walked the reader, so it asks for no glide as well
    const r = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    // One tap on an animal marks it and glides to it, so every tap moves the view and the reader
    // keeps walking. The card does not open here: a card that opens on a tap covers the screen
    // the reader is trying to cross. The app offers it on the floating button instead, and the
    // ring under the animal says which animal the button means. A tap on the ground takes the
    // mark off.
    const hit = this.groundAtPointer(nx, ny);
    let creature = this.pickCreature ? this.pickCreature(nx, ny, e) : null;   // the seam of issue 09
    // The ray meets the ground at hit. An animal farther away than that stands behind the hill the
    // reader tapped, so it is not the animal under the pointer, however near its body came to it.
    // The margin holds an animal that stands on the skyline, where the ground behind it is nearer.
    // Issue 17: a flyer takes no such test. It hovers over the ground, so the ray that passes
    // under it meets the ground nearer than the flyer stands, and the test would drop every flyer
    // the reader can see.
    if (creature && !creature.air && hit && creature.dist > this.camera.position.distanceTo(hit) + Math.max(4, (creature.scale || 1) * 3)) creature = null;
    // Issue 24: a tap on a plant marks it the same way, and the app offers its card on the same
    // button. An animal and a plant can both lie under one point. The animal wins unless it stands
    // clearly further back, because a reader who taps an animal beside a tree means the animal.
    let plant = this.pickPlant ? this.pickPlant(nx, ny, e) : null;
    if (plant && creature) {
      if (creature.dist <= plant.dist + PICK_GRACE) plant = null;
      else creature = null;
    }
    if (plant) {
      this.flora.mark(plant);
      if (this.fauna) this.fauna.unmark();
      this.glideTo(plant.point, null, true);
      if (this.onSelectPlant) this.onSelectPlant(plant.kind);
      return;
    }
    if (creature && creature.point) {
      if (this.flora) this.flora.unmark();
      if (this.fauna && creature.member) this.fauna.markMember(creature.member);
      // A flyer over the eye needs a turn of the view. A glide of the target cannot reach it, and
      // it would point the view at the ground under it instead.
      if (creature.air && creature.point.y > this.camera.position.y + 1) this.turnTo(creature.point);
      else this.glideTo(creature.point, null, true);
      if (this.onSelect) this.onSelect(creature.kind);
      return;
    }
    if ((this.fauna && this.fauna.marked) || (this.flora && this.flora.marked)) {
      if (this.fauna) this.fauna.unmark();
      if (this.flora) this.flora.unmark();
      if (this.onDeselect) this.onDeselect();
    }
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

  // The drawn ground height, the rim included. Inside the patch it reads the fine grid, and
  // outside it reads the coarse grid of the rim, which is what the reader sees there.
  _groundAt(x, z) {
    if (!this.heights) return 0;
    const h = this.half;
    if (x > -h && x < h && z > -h && z < h) return this.heightAt(x, z);
    if (this.rim) return this._rimAt(x, z);
    const e = h - this.grid * 0.5;
    return this.heightAt(Math.min(e, Math.max(-e, x)), Math.min(e, Math.max(-e, z)));
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._bound.down);
    this.canvas.removeEventListener('pointermove', this._bound.move);
    this.canvas.removeEventListener('pointerup', this._bound.up);
    this.canvas.removeEventListener('pointercancel', this._bound.up);
    this.canvas.removeEventListener('wheel', this._bound.wheel);
    removeEventListener('keydown', this._bound.keydown);
    removeEventListener('keyup', this._bound.keyup);
    removeEventListener('blur', this._bound.blur);
    this.keys.clear();
    this.glide = null;
    this.controls.dispose();
    this._clear();
    this.scene.clear();
    this.result = null;
    this.heights = null;
    this.cover = null;
    this.rim = null;
    this.sky = null;
    this.sea = null;
  }

  _clear() {
    if (this.phenomena) { this.phenomena.dispose(); this.phenomena = null; }
    if (this.flora) { this.flora.dispose(); this.flora = null; }
    if (this.grass) { this.grass.dispose(); this.grass = null; }
    if (this.fauna) { this.fauna.dispose(); this.fauna = null; }
    this.content.traverse((o) => {
      if (o === this.content) return;
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.content.clear();
  }
}
