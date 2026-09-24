// myworlds — the two device tiers. A tier is one row of budgets: the detail of the globe, the
// counts of plants and animals, the grid and the size of the patch, the shadows, and the ceiling
// of the LOD knob. app.js picks the row from the device, and the Node tools read the same rows, so
// a check measures the worlds a reader gets. This file holds no three.js and no DOM.
//
// `TIERS.X` is the globe, and `TIERS.X.ground` is the probe. Every part that must know the tier
// reads it from the row app.js picks: the worker request, the Ground constructor, and through the
// Ground the flora, the fauna, the sky, and the LOD knob.
//
// The LOW row of the budget table: a 4 m grid, 8,400 plants, 100 animals, and no shadows. It
// also caps the LOD knob at 250 m, because a weak machine cannot spend the room a fast one
// finds, and a knob that walks to 400 m only walks back down again.
//
// Issue 25 raised the flora caps, because the patch now grows plants over a wider dense square:
// FLORA_EDGE in generate.js fell from 300 to 100. On LOW, where the box stays 1,500, the densest
// cell measured went from 18,100 plants to 23,004, so 8,400 carries the same head room as 6,000
// did. The LOD walk of ground-flora.js reads about 6 to 11 ns per plant, so even 120,000 plants
// cost under 0.7 ms of a 16.7 ms frame; the walk was never the thing to fear.
//
// `size` is the side of the ground box, and the two tiers hold different ones. HIGH draws 3,000
// units, which gives the reader a walk of 1,400 units from the site in every direction. LOW keeps
// 1,500. The box costs area: the terrain build is O(area) and the plants are O(area), so 3,000 on
// a phone would be four times the work and four times the plants for a reader who is holding the
// thing in one hand. LOW keeps the patch of issue 20 with the wider walk of this issue, which is
// already 2.1 times the ground it had.
//
// `lodMax` stays at 400. Issue 25 took it to 220 for a while, because a wider box puts the reader
// inside the forest instead of near the edge of it and the LOD sphere then fills with plants the
// old box could not hold. That was tuned on one world and it was wrong as a rule. What binds is the
// number of plants the walk sends to the near mesh, and that is a property of the world, not of the
// distance. Measured walking at eye level, interleaved so the load of the machine cannot colour the
// order:
//
//     Quasar-579@48.13,60.09   lod 220: 741 near, 0 of 200 frames over 20 ms
//                              lod 400: 2,377 near, 0 of 200 over 20 ms   <- free, and much better
//     Aurora@18.91,129.00      lod 220: 2,259 near, 0 of 200 over 20 ms
//                              lod 400: 5,926 near, 21 and 48 of 200 over 20 ms
//
// So about 2,300 plants as meshes is free and about 5,900 is not, on the same machine and the same
// frame. A ceiling of 220 pays that worst case on every world, and on Quasar it drew 252k triangles
// where 400 drew 2,011k for the same 60 fps. The knob is the right place to answer this, and issue
// 26 gave it the memory it needed to settle instead of ring. See _driveLod() in ground.js.
//
// `dprMax` caps the pixel ratio of the renderer. app.js takes the smaller of it and the ratio of
// the display.
export const TIERS = {
  HIGH: {
    detail: 100, maxFlora: 10500, maxFauna: 160, shadows: true, dprMax: 2,
    ground: { grid: 2, size: 3000, maxFlora: 120000, maxFauna: 300, shadows: true, lodMax: 400 },
  },
  LOW: {
    detail: 64, maxFlora: 2500, maxFauna: 70, shadows: false, dprMax: 1.5,
    ground: { grid: 4, size: 1500, maxFlora: 8400, maxFauna: 100, shadows: false, lodMax: 250 },
  },
};

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
// 50 cells. The narrow tier asks for less and the same number covers it. The names in capitals
// are the constants of ground.js; see _rimGeometry() there.
export const RIM = 4000;             // units, how far the rim reaches from the site

// The options of a generate message for one tier.
export function worldOpts(tier) {
  return { detail: tier.detail, maxFlora: tier.maxFlora, maxFauna: tier.maxFauna };
}
