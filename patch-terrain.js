// myworlds — the terrain of a patch: where a thing on the ground stands.
//
// Every part of the ground asks the same three questions: how high the ground is at a point, whether
// the point lies under the water, and whether it lies on a disc that keeps the animals and the
// plants off. This module answers all three for one patch, from the result of the patch call, so no
// part keeps a copy of a rule or of a constant of generate.js.
//
//   heightAt(x, z)          the height of the ground as the mesh draws it, 0 off the patch
//   wet(x, z, margin)       the ground lies under the sea level plus `margin`
//   topAt(x, z)             the height of the ground, or of the sea where the sea stands higher
//   keptOut(x, z, pad)      the point with a pad reaches a disc of patch.keepOut
//   discs                   the discs `[x, z, r]` of patch.keepOut
//
// The mesh of ground.js splits each cell of the grid from its node (i, j) to its node (i + 1, j + 1)
// into two triangles, and the cover of ground-cover.js reads the same two. heightAt() gives the
// height on those triangles, so a thing that stands on it stands on the ground the reader sees. A
// bilinear read sinks or lifts it by up to a quarter of the twist of the cell.
//
// It holds no three.js and no DOM, so tools/patch-terrain-check.mjs tests it on patches the worker
// builds.

export class PatchTerrain {
  // `result` is the result of the patch call, or null for the flat ground of a failed patch.
  constructor(result) {
    const p = result && result.patch;
    this.heights = p ? result.heights : null;
    this.n = p ? p.n : 0;
    this.grid = p ? p.grid : 0;
    this.half = p ? p.size / 2 : 0;
    this.seaLevel = p && p.seaLevel ? p.seaLevel : 0;
    this.discs = (p && p.keepOut) || [];
  }

  // The height of the ground in units at (x, z) in the frame of the box, on the triangle the mesh
  // draws there. Off the patch it reads 0.
  heightAt(x, z) {
    const H = this.heights;
    if (!H) return 0;
    const n = this.n;
    const u = (x + this.half) / this.grid, v = (z + this.half) / this.grid;
    if (!(u >= 0 && v >= 0 && u <= n - 1 && v <= n - 1)) return 0;
    const i = Math.min(n - 2, Math.floor(u)), j = Math.min(n - 2, Math.floor(v));
    const fx = u - i, fz = v - j;
    const k = j * n + i;
    const a = H[k], b = H[k + 1], c = H[k + n], e = H[k + n + 1];
    return fz > fx ? a + (e - c) * fx + (c - a) * fz : a + (b - a) * fx + (e - b) * fz;
  }

  // The ground at (x, z) lies under the sea level plus `margin`.
  wet(x, z, margin = 0) {
    return this.heightAt(x, z) < this.seaLevel + margin;
  }

  // The height a thing on the surface takes: the ground, or the sea where the sea stands higher.
  topAt(x, z) {
    return Math.max(this.heightAt(x, z), this.seaLevel);
  }

  // The point (x, z) with a pad round it reaches a disc of the keep-out.
  keptOut(x, z, pad = 0) {
    for (const d of this.discs) {
      const r = d[2] + pad;
      if ((x - d[0]) * (x - d[0]) + (z - d[1]) * (z - d[1]) < r * r) return true;
    }
    return false;
  }
}
