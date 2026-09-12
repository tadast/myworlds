// myworlds — the plant vocabulary. It turns a plant kind, a world, and a biome into text.
// The worker loads it with importScripts(), after lore.js. It exposes self.FloraLore.
//
// lore.js holds the engine and no words. species.js brings the fauna vocabulary. This file brings
// the flora vocabulary, and the two never read each other.
//
// The difference from the fauna is where the text is written. An animal belongs to a world, so
// species.js writes its lore once, at generate time. A plant belongs to a patch: the ground the
// probe lands on decides which kinds grow there, how many of each, and how tall they stand, and
// the biome under them is a fact of the site and not of the planet. So describePatch() runs in
// patch(), and the story reads the biome as well as the planet.
//
// Three tag sources meet in one set for every plant:
//   the world   frozen, lowgrav, rainy, ringed, volcanic, …   from Lore.makeEnv()
//   the kind    woody, fungal, mineral, glows, sways, tall, … from KIND below
//   the biome   wetground, dryground, coldground, bare, …     from BIOME below
// Every line of text names the tags it needs, so a line about frost never reaches a hot world and
// a line about a cap never reaches a crystal.
'use strict';

(function () {
  const L = self.Lore;
  const pool = L.pool;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const round1 = (x) => Math.round(x * 10) / 10;

  // The kind codes. They must match FLORA in flora-geometry.js and in worker.js.
  const K = {
    TREE: 0, PINE: 1, CACTUS: 2, CRYSTAL: 3, MUSHROOM: 4, BOULDER: 5, PALM: 6,
    TOWER: 7, SPINDLE: 8, PUFF: 9, SHARD: 10, GRASS: 11, COLOSSUS: 12, FAN: 13, POD: 14, STACK: 15,
  };

  // ---------------------------------------------------------------- one row per plant kind
  // tags   what the kind is, in the words the gates test. The first word repeats the vocabulary of
  //        lore.js — woody, fungal, cactus, crystalflora, stoneflora — so a line that says "cap"
  //        or "bark" is honest about the plant even on a world whose globe grows neither.
  // parts  the features the plant really has. One of them names the plant and another writes the
  //        feature line, which is the rule the fauna follows.
  // nouns  the head word of a name. adjs: the body word of a name.
  const KIND = [
    { // 0 tree
      word: 'tree', tags: 'woody canopy tall rooted', genus: 'Arbor',
      parts: ['canopy', 'trunk', 'roots'], nouns: ['tree', 'crown', 'bole'],
      adjs: ['round', 'broad', 'shade', 'twin-crowned'],
    },
    { // 1 pine
      word: 'pine', tags: 'woody needled tall rooted', genus: 'Conifera',
      parts: ['needles', 'trunk', 'roots'], nouns: ['pine', 'cone', 'mast'],
      adjs: ['needled', 'narrow', 'tiered', 'dark'],
    },
    { // 2 cactus
      word: 'cactus', tags: 'cactus succulent spined rooted', genus: 'Spina',
      parts: ['arms', 'spines', 'bud'], nouns: ['cactus', 'column', 'arm'],
      adjs: ['armed', 'thorn', 'swollen', 'water'],
    },
    { // 3 growing crystal
      word: 'crystal', tags: 'crystalflora mineral glows seated', genus: 'Vitrum',
      parts: ['blades', 'glow', 'seat'], nouns: ['crystal', 'cluster', 'spire'],
      adjs: ['glass', 'cut', 'lit', 'clear'],
    },
    { // 4 mushroom
      word: 'mushroom', tags: 'fungal capped soft rooted', genus: 'Fungus',
      parts: ['cap', 'gills', 'stem'], nouns: ['mushroom', 'cap', 'stool'],
      adjs: ['broad-capped', 'gilled', 'pale', 'twin'],
    },
    { // 5 boulder growth
      word: 'stone', tags: 'stoneflora mineral squat seated', genus: 'Petra',
      parts: ['skin', 'chip'], nouns: ['stone', 'boulder', 'lump'],
      adjs: ['squat', 'split', 'grey', 'slow'],
    },
    { // 6 palm
      word: 'palm', tags: 'woody frond tall rooted sways', genus: 'Palma',
      parts: ['fronds', 'trunk', 'fruit'], nouns: ['palm', 'crown', 'mast'],
      adjs: ['frond', 'bent', 'high', 'fruited'],
    },
    { // 7 tower mushroom
      word: 'tower', tags: 'fungal capped tall glows rooted', genus: 'Turris',
      parts: ['cap', 'gills', 'ring', 'stem'], nouns: ['tower', 'column', 'stalk'],
      adjs: ['ring-stemmed', 'high-capped', 'pale', 'lamp'],
    },
    { // 8 spindle
      word: 'spindle', tags: 'whip sways glows seated', genus: 'Filum',
      parts: ['whips', 'bud'], nouns: ['spindle', 'whip', 'wire'],
      adjs: ['wire', 'thin', 'bud-tipped', 'loose'],
    },
    { // 9 puff
      word: 'puff', tags: 'sacs breathes glows soft rooted', genus: 'Vesica',
      parts: ['sacs', 'stem', 'glow'], nouns: ['puff', 'knot', 'sac'],
      adjs: ['breathing', 'soft', 'swollen', 'slack'],
    },
    { // 10 shard
      word: 'shard', tags: 'crystalflora mineral glows spined seated', genus: 'Acies',
      parts: ['blades', 'glow', 'seat'], nouns: ['shard', 'blade', 'comb'],
      adjs: ['growing', 'bright', 'split', 'keen'],
    },
    { // 11 tuft
      word: 'tuft', tags: 'turf low sways rooted', genus: 'Caespes',
      parts: ['blades', 'roots'], nouns: ['tuft', 'blade', 'sedge'],
      adjs: ['fine', 'low', 'open', 'wind'],
    },
    { // 12 colossus
      word: 'colossus', tags: 'woody giant tall glows canopy rooted', genus: 'Colossus',
      parts: ['crown', 'roots', 'tendrils', 'glow'], nouns: ['colossus', 'giant', 'mast'],
      adjs: ['hung', 'buttressed', 'vast', 'old'],
    },
    { // 13 fan
      word: 'fan', tags: 'blade sways rooted', genus: 'Flabellum',
      parts: ['blade', 'ribs', 'stem'], nouns: ['fan', 'vane', 'blade'],
      adjs: ['ribbed', 'turning', 'thin', 'flat'],
    },
    { // 14 pod
      word: 'pod', tags: 'sacs hung sways breathes rooted', genus: 'Siliqua',
      parts: ['pods', 'stalk', 'glow'], nouns: ['pod', 'hanger', 'string'],
      adjs: ['hung', 'leaning', 'heavy', 'strung'],
    },
    { // 15 stack
      word: 'stack', tags: 'plated mineral squat breathes seated', genus: 'Strues',
      parts: ['plates'], nouns: ['stack', 'cairn', 'pile'],
      adjs: ['plated', 'balanced', 'flat', 'stepped'],
    },
  ];
  const kindTags = (kind) => (KIND[kind] ? KIND[kind].tags.split(' ') : []);

  // Lore.makeEnv() puts the flora tags of the WORLD into the tag set: a desert world carries
  // "cactus" and "stoneflora" because those are the kinds its globe grows. Those words say what
  // the planet grows somewhere, and a gate on this card has to say what THIS plant is. A stack on
  // a desert world would otherwise match a line written for a stone, because the planet carried
  // the tag. So the tags below are stripped from the world set, and the kind puts its own back.
  // "flora" and "sparseflora" are facts of the planet and they stay.
  const WORLD_KIND_TAGS = ['woody', 'cactus', 'crystalflora', 'fungal', 'stoneflora'];

  // The plural of a name. A name ends in its noun, so only the noun has to be handled.
  const PLURAL = { cactus: 'cacti' };
  function plural(name) {
    const i = name.lastIndexOf(' ');
    const noun = i < 0 ? name : name.slice(i + 1);
    const many = PLURAL[noun] || (/(s|x|sh|ch)$/.test(noun) ? noun + 'es' : noun + 's');
    return (i < 0 ? '' : name.slice(0, i + 1)) + many;
  }

  // ---------------------------------------------------------------- the ground under the plant
  // One row per biome of the patch. The names match BIOME_NAME in worker.js.
  //   ground   the word a line uses for the surface
  //   tags     what the ground is, for the gates
  //   place    the place words a name may take
  //   habitat  the habitat row of the card
  //
  // `wetground` and `moist` are two different claims. A line gated on `wetground` may say that the
  // roots stand in water, because the site is a shore or a bed. A line gated on `moist` may only
  // say that the ground holds water. Every wet ground is also moist.
  const BIOME = {
    ocean: { ground: 'silt', tags: 'wetground moist soft', place: ['reef', 'tide', 'deep'],
      habitat: 'The bed under open water, where the light still reaches' },
    shallows: { ground: 'silt', tags: 'wetground moist soft', place: ['shoal', 'reef', 'tide'],
      habitat: 'The shoals, in water no deeper than a body' },
    beach: { ground: 'sand', tags: 'wetground moist sandy open', place: ['shore', 'salt', 'strand'],
      habitat: 'The sand above the tide line' },
    tundra: { ground: 'peat', tags: 'coldground moist open', place: ['rime', 'moor', 'heath'],
      habitat: 'Open tundra, over ground that never fully thaws' },
    snow: { ground: 'snow', tags: 'coldground bare', place: ['frost', 'ice', 'drift'],
      habitat: 'Snow fields, and the bare ground the wind clears' },
    rock: { ground: 'rock', tags: 'bare stony open', place: ['scree', 'crag', 'shelf'],
      habitat: 'Bare rock, scree slopes, and the cracks in them' },
    forest: { ground: 'loam', tags: 'moist shaded soft', place: ['grove', 'thicket', 'shade'],
      habitat: 'The floor of the deep growth, under the canopy' },
    grass: { ground: 'turf', tags: 'moist open soft', place: ['meadow', 'plain', 'sward'],
      habitat: 'Open ground, among the low cover' },
    dry: { ground: 'hardpan', tags: 'dryground open', place: ['dust', 'pan', 'flat'],
      habitat: 'Hardpan, and the dry flats above it' },
    desert: { ground: 'sand', tags: 'dryground bare sandy open', place: ['dune', 'dust', 'waste'],
      habitat: 'Dune fields, and the sand between the dunes' },
  };
  const biomeOf = (name) => BIOME[name] || BIOME.grass;

  // ---------------------------------------------------------------- the name
  // A second adjective, taken from the planet rather than from the body. One name in four uses it,
  // so a name usually still says what the plant is.
  const WORLD_ADJ = pool([
    { t: 'rime', tags: 'frozen' }, { t: 'frost', tags: 'frozen|subzero' }, { t: 'pale', tags: 'frozen|cold' },
    { t: 'ember', tags: 'molten|searing' }, { t: 'cinder', tags: 'molten' }, { t: 'kiln', tags: 'searing' },
    { t: 'sun', tags: 'hot dryworld' }, { t: 'thirst', tags: 'dryworld' }, { t: 'rain', tags: 'rainy' },
    { t: 'moonlit', tags: 'manymoons' }, { t: 'twin-moon', tags: 'twomoons' }, { t: 'dark', tags: 'moonless' },
    // No "shortday" line anywhere in this file. rollPlanet() gives a world with ground a day of
    // 14 to 60 hours, so only a gas giant is under the 12 hour mark, and a gas giant grows nothing.
    { t: 'ring', tags: 'ringed' }, { t: 'long-day', tags: 'slowspin' }, { t: 'even-day', tags: 'evenday' },
    { t: 'high', tags: 'lowgrav' }, { t: 'low', tags: 'highgrav' },
    { t: 'storm', tags: 'stormy' }, { t: 'vent', tags: 'volcanic|geysers' }, { t: 'aurora', tags: 'auroral' },
  ]);
  // The epithet of the binomial, from the part the name used.
  const EPITHET = {
    canopy: 'coronatus', trunk: 'caudicatus', roots: 'radicatus', needles: 'aciculatus',
    arms: 'brachiatus', spines: 'spinosus', bud: 'gemmatus', blades: 'ensifer', glow: 'lucens',
    seat: 'basalis', cap: 'pileatus', gills: 'lamellatus', stem: 'stipitatus', skin: 'nudus',
    chip: 'fractus', fronds: 'frondosus', fruit: 'baccatus', ring: 'anulatus', whips: 'filamentosus',
    sacs: 'vesicatus', crown: 'comatus', tendrils: 'cirratus', blade: 'ensatus', ribs: 'costatus',
    pods: 'siliquosus', stalk: 'scapifer', plates: 'tabulatus',
  };
  // A third source for the epithet, from the planet and from the ground. It breaks a tie when two
  // kinds of one patch would otherwise share a binomial.
  const WORLD_EPITHET = pool([
    { t: 'glacialis', tags: 'frozen' }, { t: 'frigidus', tags: 'cold' }, { t: 'ardens', tags: 'molten' },
    { t: 'aestuans', tags: 'searing' }, { t: 'siccus', tags: 'dryworld' }, { t: 'pluvialis', tags: 'rainy' },
    { t: 'lunaris', tags: 'moonlit' }, { t: 'sine luna', tags: 'moonless' }, { t: 'anulatus', tags: 'ringed' },
    { t: 'levis', tags: 'lowgrav' }, { t: 'ponderosus', tags: 'highgrav' }, { t: 'nocturnus', tags: 'longday' },
    { t: 'diurnus', tags: 'evenday' }, { t: 'fumarius', tags: 'volcanic' }, { t: 'tempestas', tags: 'stormy' },
    { t: 'saxatilis', tags: 'stony' }, { t: 'arenarius', tags: 'sandy' }, { t: 'umbrosus', tags: 'shaded' },
    { t: 'palustris', tags: 'moist' }, { t: 'campestris', tags: 'open' },
  ]);

  // ---------------------------------------------------------------- story slot 1: the form
  // How the body is built, keyed by the kind. The lines say what the geometry really draws, so a
  // reader who looks at the plant on the card can find every part the sentence names.
  const FORM = {
    [K.TREE]: pool([
      'It holds one round crown over a short trunk, and a second lump of growth leans out of the side of it.',
      'The crown is one body, not a spread of limbs. It grew outward in every direction at once and stopped when it met the light it needed.',
      { t: 'The trunk widens toward the ground, because at {grav} a narrow base would not hold the crown.', tags: 'highgrav' },
      { t: 'The trunk is thin for the crown it carries. At {grav} it never had to be thicker.', tags: 'lowgrav' },
      { t: 'The crown is darkest on the side that faces the weather, and the {ground} under that side stays bare.', tags: 'rainy|stormy' },
    ]),
    [K.PINE]: pool([
      'It stacks three cones on one mast, each narrower than the one below, and the top cone carries no growth at all.',
      'The whole body sheds what falls on it. Nothing collects on a slope this steep, which is the point of the shape.',
      { t: 'Snow slides off the tiers before it can settle. A flat crown here would break in one night.', tags: 'frozen|cold' },
      { t: 'The needles are waxed against the dry. It loses less in a day than a broad crown loses in an hour.', tags: 'dryworld|hot' },
      'The bare top shoot is last year growth. It is dead, and the plant keeps it as a mast for the next tier.',
    ]),
    [K.CACTUS]: pool([
      'One thick column and two arms, and every part of it is a tank. The body is mostly water and the skin is mostly wall.',
      'It carries no blade and no frond to lose. The green of the column does the work, and the spines do the defending.',
      { t: 'It fills in the wet and lives off the store for the rest of the year. A full body is a third heavier than an empty one.', tags: 'rainy' },
      { t: 'At {temp} the skin closes in daylight and opens at night, so nothing it holds leaves in the heat.', tags: 'hot|searing' },
      'A single bud sits at the top of the column. It opens once, for one night, and it is gone by the morning.',
    ]),
    [K.CRYSTAL]: pool([
      'It grows the way a crystal grows, face by face, out of a low seat in the {ground}. Nothing about it is soft.',
      'A cluster of blades leans out of one base, and no two blades are the same length, because no two started in the same season.',
      { t: 'It grows fastest in the cold, when the {ground} gives up what it holds. A warm season stops it entirely.', tags: 'frozen|cold' },
      { t: 'The vents feed it. It takes what the ground breathes out and lays it down as another face.', tags: 'volcanic|geysers' },
      'A third of the blades carry their own light. The reader who walks past at night sees the pattern and not the body.',
    ]),
    [K.MUSHROOM]: pool([
      'A stem, a ring of gills under the rim, and a cap that spreads wider than the plant is tall.',
      'It is one body with two caps: a large one and a small one on the same root, and the small one is this year work.',
      { t: 'The cap holds water and lets it go slowly, so the {ground} under it stays wet long after the weather turns.', tags: 'rainy' },
      { t: 'It needs no light at all. Everything it uses comes out of the {ground} it stands on.', tags: 'shaded|wetground' },
      'The gills are the whole purpose of the cap. Everything above them is a roof.',
    ]),
    [K.BOULDER]: pool([
      'It reads as a stone and it is not one. The skin is alive, a few fingers deep, and everything under that is the years it has laid down.',
      'One body and one chip beside it, and the two are a single plant over one seat in the {ground}.',
      { t: 'It grows about the width of a hand in a lifetime. On a world with a {day} day it has all the time it needs.', tags: 'slowspin' },
      { t: 'Frost splits it more often than anything else does, and every split becomes another body.', tags: 'frozen|subzero' },
      'Turn one over and the underside is pale and soft. That side has never seen the sun.',
    ]),
    [K.PALM]: pool([
      'One bent mast and a ring of fronds at the top of it. Nothing grows below the crown, and nothing needs to.',
      'The mast leans. It has leaned since it was a finger high, and the crown corrects for it every season.',
      { t: 'The fronds tear along their ribs in a storm. A torn frond still works, and a stiff one would take the mast down.', tags: 'stormy|rainy' },
      { t: 'The tide brings it in and the tide carries it out. Every one of these stands within a stone throw of the water.', tags: 'tides' },
      'A cluster of hard fruit sits where the fronds meet the mast. It falls whole, and it floats.',
    ]),
    [K.TOWER]: pool([
      'It is the tallest thing on this ground: one pale column, a ring where the cap once sat, and a cap the width of a boat above it.',
      'A second, shorter stalk leans out of the same base. A stand of these therefore holds two heights and never one.',
      { t: 'At {grav} a column this thin would fold. It holds because it is hollow, and the wall is thicker than it looks.', tags: 'highgrav' },
      { t: 'At {grav} it grows past anything else here, and the wind is the only thing that limits it.', tags: 'lowgrav' },
      'The ring on the stem is what is left of the skin the cap broke through. It never falls off.',
    ]),
    [K.SPINDLE]: pool([
      'Bare whips out of one knot in the {ground}, thin enough to read as wire, each with a single bud at the tip.',
      'It carries no blade and no crown. The whips themselves do all the work, which is why there are so many of them.',
      { t: 'The whips lie flat in a wind and stand again after it. Nothing on this ground bends further and breaks less.', tags: 'stormy' },
      { t: 'The buds are the only light on the ground after dark, and there are hundreds of them to one plant.', tags: 'moonless' },
      'The knot at the base is the oldest part and the only hard part. Everything above it is a season old.',
    ]),
    [K.PUFF]: pool([
      'A short stem and a knot of sacs on top of it, and every sac fills and empties on its own slow count.',
      'It breathes. The whole body swells and falls, and a stand of them is never still even in dead air.',
      { t: 'The sacs hold the warm of the day well into the night, and the {ground} around them thaws first.', tags: 'frozen|cold' },
      { t: 'In the heat it empties to nearly nothing and waits. It fills again after dark.', tags: 'hot|searing' },
      'Press one and it gives, and it takes the rest of the day to come back to its shape.',
    ]),
    [K.SHARD]: pool([
      'Blades of every length out of one seat, and the short ones are this season. It is a crystal that has not finished.',
      'The root end of every blade stays buried. What stands above the {ground} is the part that has already grown.',
      { t: 'It grows toward the vents, so a whole field of them leans one way and says where the heat is.', tags: 'volcanic|geysers' },
      { t: 'A blade that reaches too far snaps in the cold and starts again from the break.', tags: 'frozen|subzero' },
      'Every third blade carries its own light, so a field of them reads after dark as a scatter of points and not as bodies.',
    ]),
    [K.GRASS]: pool([
      'One tuft of open blades out of a knot of root, and the root holds more of the {ground} together than the blades ever show.',
      'It is the smallest plant here and the most of it. Where nothing else can stand, this stands.',
      { t: 'It lies down under a wind and gets up after. That is the whole of its defence.', tags: 'stormy|open' },
      { t: 'The blades go pale in the dry season and green again within a day of the weather turning.', tags: 'dryground|dryworld' },
      'A blade lives one season. The root under it is far older than that.',
    ]),
    [K.COLOSSUS]: pool([
      'One body stands over the whole of this ground: buttress roots, a trunk a house wide, and a crown hung with tendrils.',
      'There are never many. One of these takes the light of a field, and nothing of its own kind grows inside that field.',
      { t: 'At {grav} nothing else reaches this height, and the buttresses are what make it possible.', tags: 'highgrav' },
      { t: 'At {grav} it grew past every limit a heavier world would set, and the wind is its only enemy.', tags: 'lowgrav' },
      'The tendrils under the crown hang to half the height of the trunk and move all day, whatever the air is doing.',
    ]),
    [K.FAN]: pool([
      'One stem and one ribbed blade that turns through the day and faces the light at every hour of it.',
      'The blade is thin and it is not flat. A second blade crosses the first, so it holds a shape from every side.',
      { t: 'It folds along the ribs in a wind, and it opens again as soon as the air is still.', tags: 'stormy|open' },
      { t: 'A {day} day gives the blade a long turn, and it is worth watching over the whole of one.', tags: 'slowspin' },
      'The ribs are stiff and the skin between them is not. That is the whole design.',
    ]),
    [K.POD]: pool([
      'A leaning stalk with a row of sacs hung under it, each on its own short thread.',
      'The stalk leans because the load hangs on one side of it. An empty stalk stands nearly straight.',
      { t: 'The pods fill with water and the stalk bows further with every one of them.', tags: 'rainy|wetground' },
      { t: 'At {grav} the pods hang almost against the stalk, and the whole plant reads as a single column.', tags: 'lowgrav' },
      'A ripe pod drops with the thread still on it, and the thread is how it catches.',
    ]),
    [K.STACK]: pool([
      'Flat plates balanced one on another, each a little smaller than the one below, in the shape of a cairn that grew itself.',
      'Every plate is one season. Count them and you have the age of the plant, which nothing else here allows.',
      { t: 'At {grav} the stack leans within a few seasons and keeps growing at the lean.', tags: 'highgrav' },
      { t: 'At {grav} it goes far higher than it should, and the top plates are the width of a hand.', tags: 'lowgrav' },
      'The plates part a little and close again, slowly, all day. It is the only movement the plant makes.',
    ]),
  };

  // ---------------------------------------------------------------- story slot 2: the feature
  // One part of the body, keyed by the part. The name uses one part and the feature line uses
  // another, so the card never says the same thing twice.
  const FEATURE = {
    canopy: pool([
      'Nothing grows in the shade under the crown, and the edge of that shade is a clean circle on the {ground}.',
      { t: 'The crown sheds the rain to its rim, so the ground is dry at the trunk and soaked in a ring around it.', tags: 'rainy' },
      'The crown is thicker on one side. It has been thicker on that side since the plant was waist high.',
    ]),
    trunk: pool([
      'The trunk carries a spiral mark from the base to the crown. Every one of these carries it, and it always turns the same way.',
      { t: 'The bark splits in the cold and heals pale, so an old trunk reads as a record of the hard winters.', tags: 'frozen|subzero' },
      'Cut the trunk and it is not rings inside. It is one grain, all the way through.',
    ]),
    roots: pool([
      'The roots stand out of the {ground} as far as a body height before they go under it.',
      'The root plate is wider than the crown. Most of this plant is under the reader feet.',
      { t: 'The roots hold the slope together. Take one of these out and the {ground} goes with it.', tags: 'stony|sandy' },
    ]),
    needles: pool([
      'The needles point down and out, so nothing that lands on them stays.',
      { t: 'The needles hold the frost as a white shell until the sun reaches them.', tags: 'frozen|cold' },
      'A needle lives three seasons and falls in the fourth, and the ground under the plant is deep with them.',
    ]),
    arms: pool([
      'The two arms are not a pair. One is older, thicker, and set lower, and the other grew to balance it.',
      'An arm that breaks off roots where it lands, and the new plant is the same plant.',
    ]),
    spines: pool([
      'The spines are longest at the top, where the growth is, and nearly absent at the base.',
      { t: 'The spines gather the night wet and run it down the column to the roots.', tags: 'waterliquid' },
      'A spine is hollow. Break one and the plant loses a drop and seals it in a moment.',
    ]),
    bud: pool([
      'The bud at the top opens once and never again. The plant makes a new one the following season.',
      { t: 'The bud opens after dark and is closed by the first light.', tags: '!moonless' },
    ]),
    blades: pool([
      'The blades ring like glass when the wind crosses them, and a field of them holds one note.',
      'Every blade is a little out of line with the next. The pattern is fixed when the seat forms and it never moves.',
      { t: 'The blades take the low sun and throw it along the ground, so a field of them reads as a floor of light.', tags: 'open' },
    ]),
    glow: pool([
      'The light is in the body and not on it. It is steady, it is dim, and it never goes out.',
      { t: 'The light is the brightest thing on this ground after dark, which is a low bar on a world with no moon.', tags: 'moonless' },
      { t: 'The light dims when the moon is up and comes back when it sets. Nobody has explained it.', tags: 'moonlit' },
    ]),
    seat: pool([
      'The seat in the {ground} is a shallow plate, and it is the only part that has been there since the beginning.',
      'Lift one and the seat comes with it, with a cast of the ground it grew on.',
    ]),
    cap: pool([
      'The cap is one body, and the skin over it is thin enough to see the gills through from underneath.',
      { t: 'A cap holds a pool of water after the weather, and it holds it for days.', tags: 'rainy' },
      'The cap keeps growing after the stem has stopped, so an old one overhangs its own base.',
    ]),
    gills: pool([
      'The gills run from the stem to the rim without a break, and there are more of them than anyone has bothered to count.',
      'Brush the gills and the dust comes off on the hand and stays there for a day.',
    ]),
    stem: pool([
      'The stem is hollow and it holds its shape by pressure alone. A dry one folds flat.',
      'The stem is pale because it has never carried light. Everything it needs comes up from below.',
    ]),
    ring: pool([
      'The ring on the stem is the skin the cap broke through on its way up. It stays for the life of the plant.',
      'The ring sits at the height the cap stood two seasons ago, so the plant carries its own measure.',
    ]),
    fronds: pool([
      'The fronds droop in alternate pairs, one up and one down, all the way round the crown.',
      { t: 'A frond tears along the ribs in a storm and goes on working. A whole one would take the mast down.', tags: 'stormy|rainy' },
    ]),
    fruit: pool([
      'The fruit is hard, it is heavy, and it falls without warning. Nothing stands under one of these for long.',
      { t: 'The fruit floats. That is how this plant crossed the water to get here.', tags: 'wetground|hasocean' },
    ]),
    whips: pool([
      'The whips never touch one another. Each one holds its own space, and the gaps are even all the way round.',
      { t: 'In a wind the whips lie flat and the buds drag on the {ground}, and nothing breaks.', tags: 'stormy|open' },
    ]),
    sacs: pool([
      'The sacs fill and empty out of step, so the body is never one shape twice.',
      'A sac that is pressed stays pressed for an hour. The plant is in no hurry about anything.',
      { t: 'The sacs are warm to the hand, warmer than the air, all through the night.', tags: 'frozen|cold' },
    ]),
    crown: pool([
      'The crown holds three separate lumps of growth at three heights, and each one shades the one under it.',
      'The crown is a country of its own. Whatever lives up there is not seen from the {ground}.',
    ]),
    tendrils: pool([
      'The tendrils hang from under the crown and move all day, whatever the air is doing.',
      'A tendril that reaches the {ground} thickens, roots, and becomes a second trunk.',
    ]),
    blade: pool([
      'The blade turns through the day and faces the light at every hour of it, and it turns back overnight.',
      { t: 'A {day} day gives it one long turn, and the shadow on the {ground} walks the whole way round.', tags: 'slowspin' },
    ]),
    ribs: pool([
      'The ribs run the length of the blade and stand a little proud of it, so the plant reads as a hand held open.',
      'The blade folds along the ribs and opens again, and the fold marks stay for the life of the plant.',
    ]),
    pods: pool([
      'The pods hang in order of age, the oldest nearest the tip, and they drop in that order too.',
      { t: 'A pod holds water and gives it back slowly, so the {ground} under the stalk is the wettest on this site.', tags: 'waterliquid' },
    ]),
    stalk: pool([
      'The stalk leans further every season and never falls. Nobody has found one lying down.',
      'The stalk is round at the base and flat at the tip, and the flat part carries the load.',
    ]),
    plates: pool([
      'The plates part a little and close again through the day, and a field of them ticks like settling ground.',
      'Each plate overhangs the one below by a finger, so anything that lands on the stack runs to the outside.',
      { t: 'The lowest plates are buried by the drifting {ground}, and the plant grows on over them.', tags: 'sandy' },
    ]),
    skin: pool([
      'The skin is a few fingers deep and it is the only living part. Everything under it is what the plant has laid down.',
      'Scratch the skin and it goes pale, then dark, then back to its colour over about a season.',
    ]),
    chip: pool([
      'The chip beside it is the same plant. It broke off, it settled where it fell, and it went on growing.',
      'A chip takes a lifetime to reach the size of the body it came off.',
    ]),
  };
  // A plant whose only part is already in its name still needs a feature line.
  const PLAIN_FEATURE = pool([
    'It is the same shape at every size. A young one is a small copy, down to the proportions.',
    'Two of them side by side are never quite the same body, and nobody has found the rule that decides it.',
    { t: 'It leans away from the weather, so the whole stand points one way.', tags: 'stormy|open' },
    { t: 'It is warm to the hand, which is more than the air here manages.', tags: 'frozen|cold' },
  ]);

  // ---------------------------------------------------------------- story slot 3: the habit
  // How the plant lives on this ground. It is gated on the biome, so the same kind reads
  // differently on a shore and on a snow field.
  const HABIT = pool([
    { t: 'It takes the open ground and nothing else. Put one in shade and it is gone within a season.', tags: 'open' },
    { t: 'It grows in the shade and it grows slowly, and it never reaches the height an open one reaches.', tags: 'shaded' },
    { t: 'It stands in the wet and it does not mind it. The roots are under water for part of every day.', tags: 'wetground waterliquid' },
    { t: 'It stands on ground that gives nothing. Whatever it needs, it takes from the air and from the light.', tags: 'dryground' },
    { t: 'It grows out of a crack in the rock, and the crack is a little wider every year for it.', tags: 'stony' },
    { t: 'The drifting {ground} buries the base of it every season, and it grows on over the burial.', tags: 'sandy' },
    { t: 'It stops for the cold and starts again in the thaw, and it spends most of the year stopped.', tags: 'coldground' },
    { t: 'It stands where the {ground} is soft, and it leans a little more every year for it.', tags: 'soft' },
    { t: 'It takes the bare ground, because nothing else will, and it is never crowded.', tags: 'bare' },
    { t: 'It crowds out anything slower. A stretch of this ground is either full of them or empty of them.', tags: 'moist' },
    { t: 'The wind decides where it stands. A seed that lands in the lee of anything lives, and the rest do not.', tags: 'stormy|open' },
    { t: 'It starts on the bare {ground} and it makes soil where it stands. Everything that follows it needs that soil.', tags: 'bare|stony' },
    { t: 'It stands clear of everything its own size. Two of them within a body length is a thing nobody has seen.', tags: 'tall|giant' },
    { t: 'It fills the gaps between the larger plants and it never competes with them for light.', tags: 'low|soft' },
    { t: 'It grows where it is put and it never spreads far. A stand here is a stand that started here.', tags: 'mineral' },
    'It holds its ground and asks for very little. That is the whole of how it has come this far.',
    'It grows where the last one of its kind fell, and that is most of how this ground was settled.',
  ]);

  // ---------------------------------------------------------------- the optional slots
  const CLIMATE = pool([
    { t: 'At {temp} nothing here grows fast, and this one grows slower than most.', tags: 'frozen' },
    { t: 'At {temp} it works for the short warm hours and stands shut for the rest.', tags: 'cold' },
    { t: 'At {temp} the season is long enough that it never really stops.', tags: 'temperate' },
    { t: 'At {temp} it does its growing at night and shuts down through the day.', tags: 'hot|searing' },
    { t: 'It stands within reach of the heat and it takes what the ground gives out.', tags: 'volcanic|geysers' },
    { t: 'The weather comes in over the open ground and this one takes the whole of it.', tags: 'stormy' },
    { t: 'It fills in the wet season and lives off the store through the dry one.', tags: 'rainy' },
    { t: 'A {day} day and a {night} night set the pace of everything it does.', tags: 'slowspin' },
    { t: 'A {day} day and a {night} night suit it, and it grows a little on every one of them.', tags: 'evenday' },
    { t: 'At {grav} it puts nothing into holding itself up, and everything into reach.', tags: 'lowgrav' },
    { t: 'At {grav} half of what it grows is structure, and the reader can see it in the thickness of every part.', tags: 'highgrav' },
  ]);
  const SKY = pool([
    { t: 'Under {moons} moons it never has a truly dark night, and it never stops.', tags: 'manymoons' },
    { t: '{moon} crosses over it twice in a night, and the shadow of it walks across the stand.', tags: 'onemoon|twomoons' },
    { t: 'There is no moon over it. The night here is the darkest thing on the planet.', tags: 'moonless' },
    { t: 'The ring stands over it from the first light to the last, and the shadow of the ring crosses the ground at noon.', tags: 'ringed' },
    { t: 'The light folds over it on most nights, and the whole stand reads a different colour under it.', tags: 'auroral' },
  ]);
  const CLOSE = {
    terran: pool([
      'It is the common plant of this ground. A reader who walks a hundred paces here walks past twenty of them.',
      'Nothing about it is remarkable on this world. It is only remarkable that it is here at all.',
    ]),
    ocean: pool([
      'It grows within reach of the water and nowhere else. The whole of this world is within reach of the water.',
      'Every one of these arrived from somewhere else. Nothing here started here.',
    ]),
    desert: pool([
      'It is one of about four things that live on this ground, and it is the one that lives longest.',
      'It spends most of a year doing nothing at all, and the year it spends doing nothing is how it lasts.',
    ]),
    ice: pool([
      'It grows for a few weeks of the year and stands still for the rest of it.',
      'A plant this size on this world is a century of work.',
    ]),
    lava: pool([
      'It grows where the ground is still warm, and it dies when the ground goes cold.',
      'Everything here is temporary, and this one is the least temporary of them.',
    ]),
    exotic: pool([
      'No one has decided whether it is one plant or a colony, and both readings fit what is there.',
      'Two observers have described it and the two descriptions do not agree.',
      'It does one thing every day that nothing on this list explains.',
    ]),
  };

  // ---------------------------------------------------------------- the stand
  // The parallel of the sociality line of an animal. The numbers are real: the worker counts the
  // plants of the kind it actually put on the patch, so the sentence and the ground agree.
  const STAND_ONE = pool([
    'There is one of these on this ground and there will never be two. It holds the light of a field.',
    'One body, and a clear ring around it that nothing else has managed to take.',
  ]);
  const STAND_FEW = pool([
    'There are {n} of them on this ground, no two of them within sight of each other.',
    '{n} stand here. They are scattered, and the gaps between them are the point.',
    '{n} of them hold this ground, and every one is a landmark to whatever walks here.',
    { t: '{n} of them hold this ground, each in its own break in the cover.', tags: 'shaded|moist' },
  ]);
  const STAND_MANY = pool([
    'About {n} of them stand on this ground, in knots of a dozen with open ground between the knots.',
    'There are about {n} here. They grow in company, and a single one is a plant that has lost its stand.',
    'About {n} stand here, evenly spaced, as if the ground had been set out for them.',
    'About {n} of them hold this ground, thickest at the edges of it and thin in the middle.',
    { t: 'About {n} cover this ground, thickest in the low places where the water sits.', tags: 'moist' },
    { t: 'About {n} hold this ground, and the wind has combed them all one way.', tags: 'open stormy' },
    { t: 'About {n} stand here, in the lee of every rise and nowhere else.', tags: 'bare|dryground' },
  ]);

  // ---------------------------------------------------------------- the card rows
  // What it lives on. Every plant gets exactly one answer, and one plant must have one source, so
  // every line carries `src` and the gates keep the sources apart: a fungus takes no light, and a
  // crystal takes no light either. tools/lore-audit checks that no plant is ever offered two.
  // The last line is ungated past the two bans, so every plant has an answer on every world.
  const FOOD = pool([
    { t: 'Light, and the water it holds in the body', tags: 'succulent', src: 'light', w: 4 },
    { t: 'Dead growth in the {ground}, and no light at all', tags: 'fungal', src: 'rot', w: 4 },
    { t: 'Vent heat, and the minerals the ground breathes out', tags: 'mineral volcanic|geysers', src: 'mineral', w: 3 },
    { t: 'Minerals out of the rock, laid down face by face', tags: 'mineral', src: 'mineral', w: 4 },
    { t: 'Light, and the salt the tide leaves', tags: 'wetground tides !fungal !mineral', src: 'light', w: 3 },
    { t: 'Light, and ground water within a body length of the surface', tags: 'waterliquid moist !fungal !mineral', src: 'light', w: 2 },
    { t: 'Light, and whatever the wind drops on it', tags: 'dryground !fungal !mineral', src: 'light', w: 2 },
    { t: 'The low sun, for the few hours it is up', tags: 'frozen|cold|coldground !fungal !mineral', src: 'light', w: 2 },
    { t: 'Light, and the {ground} it stands in', tags: '!fungal !mineral', src: 'light' },
  ]);
  // How it spreads. Same rule: gated lines, and a plain one that always fits.
  const SPREAD = pool([
    { t: 'Spores, on the wind', tags: 'fungal', w: 4 },
    { t: 'Seed in a hard case', tags: 'woody', w: 3 },
    { t: 'A blade that breaks off and seats itself', tags: 'crystalflora|stoneflora', w: 3 },
    { t: 'Runners under the {ground}', tags: 'turf', w: 3 },
    { t: 'Pods that drop with the thread on', tags: 'hung', w: 3 },
    { t: 'A cutting, when a limb comes off', tags: 'whip|blade', w: 2 },
    { t: 'Seed that floats, and lands on another shore', tags: 'wetground', w: 2 },
    { t: 'A plate that falls and starts a new stack', tags: 'plated', w: 3 },
    'Fragments, carried by the wind',
  ]);

  // ---------------------------------------------------------------- the plants know each other
  // A relation names a second plant of the same patch. The rules read an ordered pair. `t` is the
  // line the first plant gets and `mirror` is the line the second one gets, so the two agree.
  //
  // RELATION_CONTRACT states what each rule needs of each side, in the words the text uses, so
  // tools/lore-audit can sweep every rule against every pair of kinds.
  const has = (p, t) => p.tagList.includes(t);
  const tall = (p) => has(p, 'tall') || has(p, 'giant');
  const low = (p) => has(p, 'low') || has(p, 'squat') || has(p, 'soft');
  const RELATION_CONTRACT = {
    shade: { a: ['tall'], b: [] },
    court: { a: ['giant'], b: [] },
    crust: { a: ['mineral'], b: [] },
    rot: { a: ['fungal'], b: ['woody'] },
    lee: { a: ['tall'], b: [] },
    climb: { a: ['whip'], b: ['tall'] },
    seedbed: { a: ['soft'], b: ['rooted'] },
    light: { a: ['glows'], b: ['breathes'] },
    crowd: { a: [], b: [] },
  };
  const RELATIONS = [
    { key: 'court', w: 4,
      when: ({ a, b }) => has(a, 'giant') && !has(b, 'giant'),
      t: 'A court of {others} stands under it, close in around the roots, and nothing of its own kind grows inside that ring.',
      mirror: 'It grows in the ring of ground around {other}, where the light comes in under the crown and nothing taller can start.' },
    { key: 'shade', w: 3,
      when: ({ a, b }) => tall(a) && !tall(b) && !has(b, 'mineral'),
      t: 'Nothing seeds in its shade but {others}, and they seed there thickly.',
      mirror: 'It seeds in the shade of {other} and almost nowhere else on this ground.' },
    { key: 'rot', w: 3,
      when: ({ a, b }) => has(a, 'fungal') && has(b, 'woody'),
      t: 'It takes the dead wood of {other}, and a stand of {others} that has begun to fail is where it is thickest.',
      mirror: 'When one of them fails, {others} take it down to the {ground} within a season.' },
    { key: 'climb', w: 3,
      when: ({ a, b }) => has(a, 'whip') && tall(b),
      t: 'Its whips find {other} and run up it, and neither one is the worse for it.',
      mirror: 'The whips of {other} run up it from the base to the crown, and it carries them without comment.' },
    { key: 'crust', w: 2,
      when: ({ a, b }) => has(a, 'mineral') && !has(b, 'mineral') && low(b),
      t: 'The ground at its foot is bare except for {others}, which take the little that it spares.',
      mirror: 'It grows at the foot of {other}, in the strip of ground the larger body keeps clear of everything else.' },
    { key: 'lee', w: 2,
      when: ({ a, b }) => tall(a) && has(b, 'sways') && !tall(b),
      t: 'A line of {others} stands in its lee, out of the wind, and there are none at all on the other side.',
      mirror: 'It stands in the lee of {other}. On the open side of the same ground there are none of them.' },
    { key: 'light', w: 2,
      when: ({ a, b }) => has(a, 'glows') && !has(b, 'glows') && has(b, 'breathes'),
      t: '{Others} open at its light and close again when it dims, and the two keep the same hours.',
      mirror: 'It opens at the light of {other} and closes when that light dims. Nothing else sets its hours.' },
    { key: 'seedbed', w: 2,
      when: ({ a, b }) => has(a, 'soft') && has(b, 'rooted') && !has(b, 'soft'),
      t: 'A young {other} starts in the wet under it more often than anywhere else on this ground.',
      mirror: 'It starts in the wet under {other}, and it outgrows the shelter within two seasons.' },
    { key: 'crowd', w: 1,
      when: ({ a, b }) => a.count > 40 && b.count > 40 && !tall(a) && !tall(b),
      t: 'Where it meets {others} the two grow into one another, and no line can be drawn between them.',
      mirror: 'Where it meets {other} the two mix, and the boundary moves a little every season.' },
  ];

  // ---------------------------------------------------------------- the plants know the animals
  // One optional line that names an animal of this world. It reads the genome the same way the
  // fauna relations do, so the sentence cannot contradict the animal own story.
  const hunts = (G) => G.head === 'mandibles' || G.head === 'lure';
  const grazes = (G) => G.head === 'stalks' || G.head === 'tusks' || G.head === 'beak';
  const FAUNA_LINKS = [
    { key: 'graze', w: 3,
      when: ({ p, G }) => grazes(G) && G.cls === 'land' && (has(p, 'low') || has(p, 'soft')),
      t: '{Others} feed on it, and a stand they have worked over takes two seasons to come back.' },
    { key: 'browse', w: 3,
      when: ({ p, G }) => grazes(G) && G.cls === 'land' && tall(p),
      t: '{Others} reach the lower growth and nothing reaches the rest, so every one of them is bare to the same height.' },
    { key: 'spines', w: 3,
      when: ({ p, G }) => has(p, 'spined') && G.cls === 'land',
      t: '{Others} walk around it. Nothing on this ground has worked out how to eat it.' },
    { key: 'carry', w: 3,
      when: ({ p, G }) => G.cls === 'air' && (has(p, 'fungal') || has(p, 'sacs')),
      t: '{Others} pass through the stand and carry the spores to the next one, which is the only way it crosses open ground.' },
    { key: 'perch', w: 2,
      when: ({ p, G }) => G.cls === 'air' && tall(p),
      t: '{Others} rest in the crown of it, and they use the same plants every day.' },
    { key: 'root', w: 2,
      when: ({ p, G }) => G.cls === 'sub' && has(p, 'rooted'),
      t: 'The runs of {other} pass under it, and the roots grow along them because the ground there is loose.' },
    { key: 'shelter', w: 2,
      when: ({ p, G }) => G.cls === 'land' && (has(p, 'giant') || has(p, 'canopy')),
      t: '{Others} shelter under it when the weather turns, and the {ground} there is worn bare by them.' },
    { key: 'hunt', w: 2,
      when: ({ p, G }) => hunts(G) && (has(p, 'tall') || has(p, 'whip')),
      t: '{Others} wait in the cover of it, and they are hard to see until they move.' },
    { key: 'lamp', w: 2,
      when: ({ p, G }) => has(p, 'glows') && G.cls === 'air',
      t: '{Others} gather at its light after dark, and they are gone by the first grey of the morning.' },
  ];

  // ---------------------------------------------------------------- assembly
  const STORY_ORDER = ['form', 'feature', 'habit', 'stand', 'climate', 'sky', 'beast', 'synergy', 'close'];
  const EXTRA_SLOTS = 2;   // how many of the optional parts a story keeps, past the four core ones

  // The height row of the card. The numbers come off the plants the patch really placed, so the
  // card and the ground cannot drift apart. A kind whose bodies are all one size says one number.
  function heightText(p) {
    const top = round1(p.tallest), mid = round1(p.median);
    if (p.count <= 1 || top <= mid * 1.15) return `${top} m`;
    return `${mid} m, the tallest here ${top} m`;
  }

  function tokensFor(p, B, env, world) {
    const day = Math.max(1, Math.round(env.dayHours || 24));
    return {
      ground: B.ground, world: world.designation,
      day: `${day} hours`, night: `${Math.max(1, Math.round(day / 2))} hours`,
      temp: `${env.tempC} °C`, grav: `${(env.gravity || 1).toFixed(2)} g`,
      moon: env.moonNames[0] || 'the moon', moons: L.num(env.moons || 0),
      // A small count is a word and an exact number. A large one is rounded, because "253 of them"
      // claims a precision the reader cannot check and does not want.
      n: p.count <= 16 ? L.num(p.count) : String(Math.round(p.count / 10) * 10),
      tall: `${round1(p.tallest)} m`,
    };
  }

  // One plant kind, everything except the relations. `used` carries the names already taken on
  // this patch, so two kinds never share a name or a binomial.
  function describeOne(rng, p, B, env, world, used) {
    const seen = used.lines;
    const kind = KIND[p.kind];
    const tokens = tokensFor(p, B, env, world);
    const ctx = { p, env, tags: p.tags, world, biome: B };
    const say = (list, strict) => { const e = L.line(rng, list, ctx, seen, strict); return e ? L.fill(e.t, tokens) : ''; };
    const row = (list) => { const e = L.line(rng, list, ctx, null); return e ? L.fill(e.t, tokens) : ''; };

    // name: an optional place word from the biome, an adjective, and a noun of the kind. One name
    // in four takes its adjective from the planet instead of from the body.
    const freshAdj = kind.adjs.filter((a) => !used.words.has(a));
    const bodyAdj = L.pick(rng, freshAdj.length ? freshAdj : kind.adjs);
    const worldAdjs = L.candidates(WORLD_ADJ, ctx).filter((e) => !used.words.has(e.t));
    const adj = worldAdjs.length && rng() < 0.25 ? L.pick(rng, worldAdjs).t : bodyAdj;
    used.words.add(adj);
    // The place word must not echo the adjective: "Frost frost tuft" is not a name.
    const places = B.place.concat(['', '']).filter((q) => !q || (q !== adj && !adj.includes(q) && !q.includes(adj)));
    const freshNouns = kind.nouns.filter((x) => !used.words.has(x));
    const name = L.unique((i) => {
      const place = i === 0 ? L.pick(rng, places) : i < 4 ? L.pick(rng, places.filter(Boolean).concat('')) : '';
      const noun = i < 2 && freshNouns.length ? freshNouns[0] : L.pick(rng, kind.nouns);
      if (i < 2) used.words.add(noun);
      return cap(`${place ? place + ' ' : ''}${adj} ${noun}`);
    }, used.names, 8);
    // the binomial. The epithet comes from a part the plant has, then from the niche of the kind,
    // then from the planet, so two kinds of one patch cannot collide.
    const partKey = L.pick(rng, kind.parts);
    const wEpi = L.choose(rng, WORLD_EPITHET, ctx);
    const latin = L.unique((i) => {
      if (i === 0) return `${kind.genus} ${EPITHET[partKey] || 'vulgaris'}`;
      if (i === 1) return `${kind.genus} ${EPITHET[kind.parts[0]] || 'vulgaris'}`;
      return `${kind.genus} ${wEpi ? wEpi.t : 'vulgaris'}`;
    }, used.latin, 3);

    // the feature: a part the name did not already use
    const featureKeys = kind.parts.filter((k) => k !== partKey && FEATURE[k]);
    const featureKey = featureKeys.length ? L.pick(rng, featureKeys) : null;

    const standPool = p.count <= 1 ? STAND_ONE : p.count <= 12 ? STAND_FEW : STAND_MANY;
    const parts = {
      form: say(FORM[p.kind] || PLAIN_FEATURE),
      feature: say(featureKey ? FEATURE[featureKey] : PLAIN_FEATURE),
      habit: say(HABIT),
      stand: say(standPool),
      climate: say(CLIMATE, true),
      sky: say(SKY, true),
      beast: '',
      synergy: '',
      close: say(CLOSE[env.type] || CLOSE.terran, true),
    };

    p.lore = {
      name, latin, habitat: B.habitat, size: heightText(p),
      // The two rows take no freshness rule. A row is an answer and not a sentence: two plants that
      // both live on light must both say so, and the fauna diet row works the same way.
      food: row(FOOD) || 'Light',
      spread: row(SPREAD) || 'Fragments, carried by the wind',
      parts, tokens, story: '', plural: plural(name.toLowerCase()),
    };
  }

  function trimStory(rng, p) {
    const parts = p.lore.parts;
    const keep = new Set(['form', 'feature', 'habit', 'stand']);
    const rest = ['climate', 'sky', 'close', 'beast', 'synergy'].filter((k) => parts[k]);
    // A relation with another plant always takes one of the two optional slots, because it is the
    // only line that ties this plant to the rest of the patch.
    if (parts.synergy) { keep.add('synergy'); rest.splice(rest.indexOf('synergy'), 1); }
    while (keep.size - 4 < EXTRA_SLOTS && rest.length) {
      keep.add(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
    }
    for (const k of STORY_ORDER) if (!keep.has(k)) parts[k] = '';
    // A filled token can land at the head of a part, so every part is capitalised here rather than
    // written capitalised, and a line stays usable in any slot.
    for (const k of STORY_ORDER) if (parts[k]) parts[k] = cap(parts[k]);
    p.lore.story = L.assemble(parts, STORY_ORDER);
  }

  function nameTokens(p) {
    const one = p.lore.name.toLowerCase(), many = p.lore.plural;
    return { other: 'the ' + one, Other: 'The ' + one, others: 'the ' + many, Others: 'The ' + many };
  }
  function beastTokens(G) {
    const one = G.lore.name.toLowerCase(), many = G.lore.plural;
    return { other: 'the ' + one, Other: 'The ' + one, others: 'the ' + many, Others: 'The ' + many };
  }

  // ---------------------------------------------------------------- the public entry point
  // describePatch() writes the lore of every plant kind the patch grows.
  //
  //   world    the world object, for the designation and for the species list
  //   env      the tag set of the planet, from Lore.makeEnv()
  //   biome    the biome name at the site, from BIOME_NAME in worker.js
  //   kinds    [{ kind, count, median, tallest }], counted off the plants the patch really placed
  //   rng      a stream of its own, so the text never moves a body
  //
  // It returns the same array, sorted by size, with a `lore` on every entry. The result is plain
  // data: it crosses to the main thread by structured clone.
  function describePatch({ world, env, biome, kinds, rng }) {
    const B = biomeOf(biome);
    const biomeTags = B.tags.split(' ');
    const list = [];
    for (const k of kinds) {
      if (!KIND[k.kind]) continue;
      const tagList = kindTags(k.kind);
      const tags = new Set(env.tags);
      for (const t of WORLD_KIND_TAGS) tags.delete(t);
      for (const t of tagList) tags.add(t);
      for (const t of biomeTags) tags.add(t);
      tags.add('flora');
      list.push({ ...k, tagList, tags });
    }
    if (!list.length) return [];
    // The tallest kind leads, so the card opens on the plant the reader is most likely to look up at.
    list.sort((a, b) => b.tallest - a.tallest || a.kind - b.kind);

    const used = { names: new Set(), latin: new Set(), words: new Set(), lines: new Set() };
    for (const p of list) describeOne(rng, p, B, env, world, used);

    // the relations between the plants. Every pair is read once, in a fixed order.
    const links = L.relate(rng, list, RELATIONS, { maxPer: 1, chance: 0.8, ctxOf: (a, b) => ({ a, b, env }) });
    for (const { a, b, rule } of links) {
      a.lore.parts.synergy = L.fill(rule.t, { ...a.lore.tokens, ...nameTokens(b) });
      if (rule.mirror) b.lore.parts.synergy = L.fill(rule.mirror, { ...b.lore.tokens, ...nameTokens(a) });
    }

    // the line that names an animal. It takes an optional slot, so a plant may carry both this and
    // a relation with another plant, and the story still ends at six sentences.
    const beasts = (world.species || []).filter((G) => G.lore);
    for (const p of list) {
      const fits = [];
      for (const G of beasts) for (const r of FAUNA_LINKS) if (r.when({ p, G })) fits.push({ r, G });
      if (!fits.length) continue;
      let total = 0;
      for (const f of fits) total += f.r.w == null ? 1 : f.r.w;
      let x = rng() * total, hit = fits[fits.length - 1];
      for (const f of fits) { x -= f.r.w == null ? 1 : f.r.w; if (x <= 0) { hit = f; break; } }
      p.lore.parts.beast = L.fill(hit.r.t, { ...p.lore.tokens, ...beastTokens(hit.G) });
    }

    for (const p of list) trimStory(rng, p);
    // The tag sets are Sets, which do not survive a structured clone in a useful form, and nothing
    // past this point reads them.
    return list.map((p) => ({ kind: p.kind, count: p.count, lore: p.lore }));
  }

  self.FloraLore = {
    describePatch, kindTags, plural, BIOME, KIND, FLORA: K,
    RELATIONS, RELATION_CONTRACT, FAUNA_LINKS,
    POOLS: { FORM, FEATURE, PLAIN_FEATURE, HABIT, CLIMATE, SKY, CLOSE, FOOD, SPREAD, STAND_ONE, STAND_FEW, STAND_MANY, WORLD_ADJ, WORLD_EPITHET },
  };
})();
