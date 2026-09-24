// myworlds — the world types: the seven kinds of planet a seed can roll, and the ranges each type
// rolls its numbers in. generate.js rolls from these tables, and tools/lore-audit sweeps the same
// ones, so the sweep cannot test a world the generator never builds. It holds no three.js and no
// DOM, because the module worker imports it.
import { FloraLore } from './flora-lore.js';

const FLORA = FloraLore.FLORA;

// The types and their weights. A seed picks a type with the chance of its weight over the sum.
export const TYPES = [
  ['terran', 28], ['ocean', 12], ['desert', 12], ['ice', 12], ['lava', 8], ['gas', 14], ['exotic', 14],
];
export const TYPE_LABEL = {
  terran: 'Temperate Terran', ocean: 'Ocean World', desert: 'Arid Desert', ice: 'Frozen Ice World',
  lava: 'Volcanic Hellscape', gas: 'Gas Giant', exotic: 'Exotic Alien World',
};

// The mean temperature of each type in degrees Celsius. rollPlanet() in generate.js rolls in it.
export const TEMP_BY_TYPE = { terran: [-5, 28], ocean: [5, 32], desert: [30, 75], ice: [-120, -40], lava: [420, 900], gas: [-190, -90], exotic: [-30, 60] };

// The land fraction of each type: the two ends of the range worldContext() in generate.js rolls in,
// and a third value the roll can jump to. A desert is 0.75 to 0.92 land, or 1 outright. A gas giant
// has no land.
export const LAND_BY_TYPE = { terran: [0.22, 0.42], ocean: [0.03, 0.12], desert: [0.75, 0.92, 1], ice: [0.3, 0.55], lava: [0.35, 0.6], exotic: [0.2, 0.6], gas: [null] };

// The plant kinds each type grows on the globe. makePalette() in generate.js assigns these lists.
export const FLORA_BY_TYPE = {
  terran: [FLORA.TREE, FLORA.PINE], ocean: [FLORA.PALM, FLORA.TREE], desert: [FLORA.CACTUS, FLORA.BOULDER],
  ice: [FLORA.CRYSTAL, FLORA.PINE], lava: [FLORA.BOULDER, FLORA.CRYSTAL],
  exotic: [FLORA.MUSHROOM, FLORA.CRYSTAL, FLORA.TREE], gas: [],
};

// How dense the flora of the globe stands on each type.
export const FLORA_DENSITY_BY_TYPE = { terran: 2.0, ocean: 1.6, desert: 0.22, ice: 0.18, lava: 0.15, exotic: 1.4, gas: 0 };
