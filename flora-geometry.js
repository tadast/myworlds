// myworlds — the shape of one plant.
//
// The globe and the ground draw the same plants. The globe scales them to a fraction of the
// planet radius. The ground scales them to metres. So the shape lives here, and app.js and
// ground-flora.js both import it.
//
// A plant stands about one unit tall with its base at the origin and y up. The exact extent
// differs a little per kind, so a caller that needs true metres reads the bounding box.
import * as THREE from 'three';
import { mergeGeos, M4 } from './fauna.js';

// the kind codes the worker writes into the flora array
export const FLORA = { TREE: 0, PINE: 1, CACTUS: 2, CRYSTAL: 3, MUSHROOM: 4, BOULDER: 5, PALM: 6 };

export function floraGeometry(kind, fc) {
  const { canopy, canopy2, trunk } = fc;
  switch (kind) {
    case 0: // round tree
      return mergeGeos([
        { geo: new THREE.CylinderGeometry(0.1, 0.14, 0.45, 5), color: trunk, matrix: M4(0, 0.22, 0) },
        { geo: new THREE.IcosahedronGeometry(0.5, 0), color: canopy, matrix: M4(0, 0.75, 0, 1, 0.9, 1, 0.3, 0.2) },
      ]);
    case 1: // pine
      return mergeGeos([
        { geo: new THREE.CylinderGeometry(0.08, 0.12, 0.35, 5), color: trunk, matrix: M4(0, 0.17, 0) },
        { geo: new THREE.ConeGeometry(0.42, 0.6, 6), color: canopy, matrix: M4(0, 0.5, 0) },
        { geo: new THREE.ConeGeometry(0.3, 0.5, 6), color: canopy, matrix: M4(0, 0.85, 0) },
      ]);
    case 2: // cactus
      return mergeGeos([
        { geo: new THREE.CylinderGeometry(0.16, 0.18, 1, 6), color: canopy, matrix: M4(0, 0.5, 0) },
        { geo: new THREE.CylinderGeometry(0.1, 0.1, 0.45, 5), color: canopy, matrix: M4(0.22, 0.6, 0, 1, 1, 1, 0, 0.9) },
      ]);
    case 3: // crystal
      return mergeGeos([
        { geo: new THREE.OctahedronGeometry(0.28, 0), color: canopy, matrix: M4(0, 0.55, 0, 1, 2.2, 1, 0.15, 0.1) },
        { geo: new THREE.OctahedronGeometry(0.18, 0), color: canopy, matrix: M4(0.2, 0.3, 0.1, 1, 1.8, 1, 0.2, -0.5) },
      ]);
    case 4: // mushroom
      return mergeGeos([
        { geo: new THREE.CylinderGeometry(0.12, 0.16, 0.6, 5), color: trunk, matrix: M4(0, 0.3, 0) },
        { geo: new THREE.IcosahedronGeometry(0.5, 1), color: canopy2, matrix: M4(0, 0.7, 0, 1, 0.55, 1) },
      ]);
    case 5: // boulder
      return mergeGeos([
        { geo: new THREE.DodecahedronGeometry(0.4, 0), color: canopy2, matrix: M4(0, 0.25, 0, 1.2, 0.8, 1, 0.4, 0.3) },
      ]);
    case 6: // palm
      return mergeGeos([
        { geo: new THREE.CylinderGeometry(0.07, 0.11, 0.8, 5), color: trunk, matrix: M4(0.05, 0.4, 0, 1, 1, 1, 0, -0.12) },
        { geo: new THREE.ConeGeometry(0.45, 0.25, 5), color: canopy, matrix: M4(0.12, 0.72, 0, 1, 1, 1, Math.PI, 0) },
        { geo: new THREE.ConeGeometry(0.35, 0.2, 5), color: canopy, matrix: M4(0.12, 0.85, 0, 1, 1, 1, 0, 0.4) },
      ]);
  }
}
