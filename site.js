// myworlds — the landing site: the pick under the screen centre, the pull to life, the marker, and the URL.
//
// A site is a lat and a lon in degrees in the planet's local frame, the frame of the worker's
// arrays before planet.rotation.y turns them. Lat is asin(y). Lon is atan2(z, x). Two decimals.
import * as THREE from 'three';

export const PATCH_SIZE = 1500;      // units, the side of the ground box a patch draws into
export const PULL_REACH = 0.5;       // parts of a cell: how far the pull to life looks

// The patch cell. The reader picks a square of the globe and the whole square becomes the
// ground. CELL is the arc of that square in globe units, so it is the same size on the screen
// for every planet: about 62 px at the closest zoom, which the reader can see and aim at.
// A finer square would be false precision. The globe draws its surface from an icosphere at
// detail 100, which puts about 0.011 units between two vertices, so a square under CELL would
// sit inside one facet and the coast the reader aims at would not be where the field puts it.
//
// The cell is far wider than the 1,500 unit box it draws into, so the ground holds an
// artificial scale. worker.js gives the two numbers back as patch.metresAcross and
// patch.metresUp. A plant and a creature keep their lore size in units, so they read as normal
// against the ground and they are no longer the metres the lore text says.
export const CELL = 0.01;

const CENTRE = new THREE.Vector2(0, 0);
const _ray = new THREE.Raycaster();
const _centre = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _local = new THREE.Vector3();
const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _corner = new THREE.Vector3();

const round2 = (v) => Math.round(v * 100) / 100;

// The cell that holds a site. The cells tile the globe: a band of latitude CELL wide, and inside
// the band a step of longitude that keeps the cell square in metres. Near a pole that step would
// pass a half turn, so it stops there and the top cell is the whole cap.
export function snapSite(site) {
  if (!site) return site;
  const latStep = THREE.MathUtils.radToDeg(CELL);
  const lat = THREE.MathUtils.clamp(Math.round(site.lat / latStep) * latStep, -90, 90);
  const lonStep = Math.min(180, latStep / Math.max(Math.cos(THREE.MathUtils.degToRad(lat)), 1e-3));
  let lon = Math.round(site.lon / lonStep) * lonStep;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat: round2(lat), lon: round2(lon), kind: site.kind };
}

// The metres of the globe one cell covers. The worker takes this as patch.span.
export function cellSpan(world) {
  return CELL * radiusKm(world) * 1000;
}

// The ground radius under a unit direction in planet space, from the worker's lat/lon height map.
export function groundRadius(world, hm, dir) {
  if (!hm || !world.heightMapSize) return 1;
  const [W, H] = world.heightMapSize;
  const u = (Math.atan2(dir.z, dir.x) / (Math.PI * 2) + 0.5) * W - 0.5;
  const v = (Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) / Math.PI + 0.5) * H - 0.5;
  const x0 = Math.floor(u), y0 = THREE.MathUtils.clamp(Math.floor(v), 0, H - 2);
  const fx = u - x0, fy = THREE.MathUtils.clamp(v - y0, 0, 1);
  const xa = ((x0 % W) + W) % W, xb = (xa + 1) % W;
  const a = hm[xa + y0 * W], b = hm[xb + y0 * W], c = hm[xa + (y0 + 1) * W], d = hm[xb + (y0 + 1) * W];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

// A unit direction in planet space from a site.
export function siteDir(lat, lon, out = new THREE.Vector3()) {
  const a = THREE.MathUtils.degToRad(lat), o = THREE.MathUtils.degToRad(lon);
  const r = Math.cos(a);
  return out.set(r * Math.cos(o), Math.sin(a), r * Math.sin(o));
}

// The site under a unit direction in planet space.
export function dirToSite(dir, kind = -1) {
  const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x));
  return { lat: round2(lat), lon: round2(lon), kind };
}

// The planet radius in kilometres, from the stats line.
export function radiusKm(world) {
  const km = parseFloat(String(world?.stats?.radius || '').replace(/,/g, ''));
  return km > 0 ? km : 6000;
}

// The ray from the screen centre, down onto the surface. Returns the hit direction in the
// planet's local frame and in world space, or null when the centre misses the planet.
export function pickDirs(camera, current) {
  if (!current || current.world.type === 'gas') return null;
  camera.updateMatrixWorld();
  current.planet.updateWorldMatrix(true, false);
  _centre.setFromMatrixPosition(current.planet.matrixWorld);
  _ray.setFromCamera(CENTRE, camera);
  const o = _ray.ray.origin, d = _ray.ray.direction;
  const ox = o.x - _centre.x, oy = o.y - _centre.y, oz = o.z - _centre.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz;
  let r = 1;
  for (let i = 0; i < 2; i++) {
    const disc = b * b - (cc - r * r);
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t <= 0) return null;
    _hit.copy(d).multiplyScalar(t).add(o);
    _local.copy(_hit);
    current.planet.worldToLocal(_local).normalize();
    r = groundRadius(current.world, current.heightMap, _local);
  }
  _dir.copy(_hit).sub(_centre).normalize();
  return { local: _local.clone(), world: _dir.clone() };
}

// The site under the screen centre, or null.
export function pickSite(camera, current) {
  const hit = pickDirs(camera, current);
  return hit ? dirToSite(hit.local) : null;
}

// The pull to life. A creature home inside the cell under the pick takes the site. The nearest
// home wins. The site keeps the species id it was pulled to, or -1. The pull runs before the
// snap, so a home anywhere in the cell puts its species on the patch, and the snap then returns
// the site to the grid.
export function pullSite(site, current) {
  if (!site || !current || !current.homes || !current.homes.length) return site;
  const limit = CELL * PULL_REACH;                              // globe units, the radius is 1
  const dir = siteDir(site.lat, site.lon, _local);
  const homes = current.homes;
  let best = -1, bestD = limit;
  for (let i = 0; i < homes.length; i += 4) {
    const dx = homes[i] - dir.x, dy = homes[i + 1] - dir.y, dz = homes[i + 2] - dir.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best < 0) return site;
  return dirToSite(_dir.set(homes[best], homes[best + 1], homes[best + 2]), homes[best + 3]);
}

// The home direction of every creature, four floats each: x y z kind. The worker gives the home
// position of each creature in the fauna array, nine floats each.
export function faunaHomes(fauna, count) {
  if (!fauna || !count) return new Float32Array(0);
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const o = i * 9;
    const x = fauna[o], y = fauna[o + 1], z = fauna[o + 2];
    const len = Math.hypot(x, y, z) || 1;
    out[i * 4] = x / len; out[i * 4 + 1] = y / len; out[i * 4 + 2] = z / len;
    out[i * 4 + 3] = fauna[o + 7];
  }
  return out;
}

// ---------------------------------------------------------------- the URL
// #Seed for orbit. #Seed@lat,lon for a site. The seed is URL-encoded, the site is plain.
export function parseUrl(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (!h) return { seed: '', site: null };
  const i = h.lastIndexOf('@');
  if (i < 1) return { seed: decodeURIComponent(h), site: null };
  const parts = h.slice(i + 1).split(',');
  const lat = parseFloat(parts[0]), lon = parseFloat(parts[1]);
  const good = parts.length === 2 && Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  if (!good) return { seed: decodeURIComponent(h), site: null };
  return { seed: decodeURIComponent(h.slice(0, i)), site: { lat: round2(lat), lon: round2(lon), kind: -1 } };
}

export function siteToUrl(seed, site) {
  const base = '#' + encodeURIComponent(seed);
  return site ? `${base}@${site.lat.toFixed(2)},${site.lon.toFixed(2)}` : base;
}

// ---------------------------------------------------------------- the marker
// The square of the cell the probe would land on. It is the true footprint of the patch, not a
// symbol: what the square holds is what the ground shows. Eight vertices and eight triangles
// draw the outline, and each vertex sits at the ground radius under it, so the square follows
// the relief instead of floating over a hill.
const RING_IN = 0.9;                 // the inner edge of the outline, as a part of the cell
const LIFT = 0.0008;                 // globe units the outline floats, so it clears the surface
// the four corners of the cell, in the order they go round it
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

let marker = null;

function makeMarker() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  // two triangles per side: the outer corner, the next outer corner, and the two inner ones
  const idx = [];
  for (let i = 0; i < 4; i++) {
    const a = i, b = (i + 1) % 4, c = 4 + b, d = 4 + i;
    idx.push(a, b, c, a, c, d);
  }
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'site-marker';
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return mesh;
}

// Show the square of the cell on the planet. A null site takes it off the scene.
export function showMarker(site, current) {
  if (!site || !current) {
    if (marker && marker.parent) marker.parent.remove(marker);
    return marker;
  }
  if (!marker) marker = makeMarker();
  if (marker.parent !== current.planet) {
    if (marker.parent) marker.parent.remove(marker);
    current.planet.add(marker);
  }
  const pal = current.world.palette;
  marker.material.color.set(pal.fauna?.accent || '#ffffff');

  // the frame of the site: up, east, and north
  const la = THREE.MathUtils.degToRad(site.lat), lo = THREE.MathUtils.degToRad(site.lon);
  const cla = Math.cos(la), sla = Math.sin(la), clo = Math.cos(lo), slo = Math.sin(lo);
  const dir = _local.set(cla * clo, sla, cla * slo);
  _east.set(-slo, 0, clo);
  _north.set(-sla * clo, cla, -sla * slo);

  const sea = current.world.seaRadius || 0;
  const pos = marker.geometry.attributes.position;
  const half = CELL / 2;
  for (let ring = 0; ring < 2; ring++) {
    const w = ring === 0 ? half : half * RING_IN;
    for (let c = 0; c < 4; c++) {
      _corner.copy(dir)
        .addScaledVector(_east, CORNERS[c][0] * w)
        .addScaledVector(_north, CORNERS[c][1] * w)
        .normalize();
      const r = Math.max(groundRadius(current.world, current.heightMap, _corner), sea) + LIFT;
      pos.setXYZ(ring * 4 + c, _corner.x * r, _corner.y * r, _corner.z * r);
    }
  }
  pos.needsUpdate = true;
  marker.position.set(0, 0, 0);
  marker.quaternion.identity();
  return marker;
}
