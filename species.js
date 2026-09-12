// myworlds — species genomes. Rolls a set of creature species per world and their lore.
// Loaded into the worker with importScripts(); exposes self.Species.
// A genome is plain data: class, niche, body plan, limbs, head, extras, gait, movement, colours.
// fauna.js turns a genome into geometry and a rig; this file never touches three.js.
'use strict';

(function () {
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const rr = (rng, a, b) => a + rng() * (b - a);
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const round1 = (x) => Math.round(x * 10) / 10;

  // ---------------------------------------------------------------- colour helpers (rgb 0..1 arrays)
  function rgb2hsl([r, g, b]) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hsl2rgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  const toHex = (c) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  function shift(c, dh, ds, dl) { const [h, s, l] = rgb2hsl(c); return hsl2rgb(h + dh, clamp01(s + ds), Math.min(0.92, Math.max(0.1, l + dl))); }

  // ---------------------------------------------------------------- niches: where a species lives, and which classes fit there
  // cls: weighted class options; habitat text per class; ground word for the lore
  const NICHE = {
    beach: { cls: ['land', 'sub', 'sub', 'air'], ground: 'sand', place: ['tide', 'shore', 'salt'], epithet: 'litoralis',
      habitat: { land: 'Beaches and tide flats', sub: 'Under the beach, between the tide lines', air: 'The wind along the shoreline' } },
    meadow: { cls: ['land', 'land', 'land', 'air'], ground: 'grass', place: ['meadow', 'plains', ''], epithet: 'pratensis',
      habitat: { land: 'Open meadows and grassland', sub: 'Burrows under the meadows', air: 'Low over the grassland' } },
    forest: { cls: ['land', 'land', 'air'], ground: 'leaf litter', place: ['wood', 'forest', ''], epithet: 'silvae',
      habitat: { land: 'Forest floors', sub: 'Under the forest floor', air: 'The gaps in the canopy' } },
    lowland: { cls: ['air', 'air', 'land'], ground: 'soil', place: ['valley', 'lowland', ''], epithet: 'vagans',
      habitat: { land: 'Low hills and river flats', sub: 'The soft ground of the river flats', air: 'Lowland air, under thirty metres' } },
    dune: { cls: ['land', 'land', 'sub', 'air'], ground: 'sand', place: ['dune', 'dust', ''], epithet: 'arenarius',
      habitat: { land: 'Dune fields and hardpan', sub: 'Under the dunes', air: 'The hot air over the flats' } },
    snow: { cls: ['land', 'land', 'sub', 'air'], ground: 'snow', place: ['frost', 'ice', ''], epithet: 'nivalis',
      habitat: { land: 'Ice plains and snow fields', sub: 'Under the snow crust', air: 'The still air over the ice' } },
    ash: { cls: ['land', 'land', 'sub'], ground: 'ash', place: ['ash', 'cinder', ''], epithet: 'cinereus',
      habitat: { land: 'Cooled lava fields', sub: 'Under the ash plains', air: 'The updrafts over the lava' } },
    sea: { cls: ['air'], ground: 'water', place: ['sea', 'storm', ''], epithet: 'pelagicus',
      habitat: { air: 'Open ocean air' } },
    cloud: { cls: ['air'], ground: 'cloud', place: ['cloud', 'storm', ''], epithet: 'aetherius',
      habitat: { air: 'Gas giant cloud decks' } },
  };
  // niches available per world type, in order of preference; count = species per world
  const WORLD_NICHES = {
    terran: { count: 4, niches: ['meadow', 'forest', 'beach', 'lowland', 'sea'] },
    ocean: { count: 3, niches: ['sea', 'beach', 'lowland', 'forest'] },
    desert: { count: 3, niches: ['dune', 'dune', 'lowland'] },
    ice: { count: 3, niches: ['snow', 'snow', 'lowland'] },
    lava: { count: 2, niches: ['ash', 'ash'] },
    exotic: { count: 4, niches: ['meadow', 'forest', 'beach', 'lowland', 'sea'] },
    gas: { count: 2, niches: ['cloud', 'cloud'] },
  };

  // ---------------------------------------------------------------- body catalogue
  const LOCO = { land: ['monopod', 'biped', 'tripod', 'quad', 'hexapod', 'serpent'], air: ['sac', 'wings', 'fins'], sub: ['arch', 'periscope', 'plough'] };
  const PLAN = {
    monopod: ['blob', 'dome'], biped: ['blob', 'spindle'], tripod: ['blob'], quad: ['blob', 'dome', 'spindle'], hexapod: ['dome', 'chain'], serpent: ['chain'],
    sac: ['blob', 'disc'], wings: ['blob', 'spindle', 'swarm'], fins: ['spindle'],
    arch: ['chain'], periscope: ['chain'], plough: ['dome'],
  };
  const HEAD = {
    monopod: ['beak', 'stalks', 'crest', 'mandibles'], biped: ['mandibles', 'stalks', 'beak', 'crest'], tripod: ['lure', 'lure', 'mandibles', 'stalks'],
    quad: ['tusks', 'tusks', 'beak', 'stalks'], hexapod: ['mandibles', 'stalks', 'none', 'beak'], serpent: ['mandibles', 'none', 'lure', 'crest'],
    sac: ['none', 'none', 'lure', 'crest'], wings: ['beak', 'mandibles', 'crest', 'none'], fins: ['none', 'none', 'beak', 'crest'],
    arch: ['mandibles', 'none', 'stalks'], periscope: ['lure', 'stalks', 'beak', 'crest'], plough: ['tusks', 'mandibles', 'none'],
  };
  const EXTRAS = {
    monopod: ['tail', 'spikes', 'antennae', 'beads', 'sail'], biped: ['sail', 'spikes', 'beads', 'tail', 'antennae', 'tendrils'], tripod: ['beads', 'antennae', 'spikes'],
    quad: ['garden', 'plates', 'spikes', 'tail', 'beads', 'sail'], hexapod: ['plates', 'spikes', 'antennae', 'beads'], serpent: ['spikes', 'beads', 'sail', 'antennae'],
    sac: ['beads', 'tail'], wings: ['tail', 'beads', 'sail', 'tendrils', 'spikes'], fins: ['beads', 'spikes', 'sail', 'tendrils'],
    arch: ['beads', 'spikes', 'antennae'], periscope: ['beads', 'antennae', 'tendrils'], plough: ['spikes', 'plates', 'antennae'],
  };
  // parts that a locomotion always has
  const ALWAYS = { sac: ['tendrils'], fins: ['flukes'], arch: ['mounds'], periscope: ['mounds'], plough: ['mounds'] };
  // leash (world units), cruise speed, turn amplitude, pause habit, flies, casts a shadow
  const MOVE = {
    monopod: { leash: 0.03, speed: 0.012, turn: 1.6, pause: 0.5, flies: false, shadow: true },
    biped: { leash: 0.03, speed: 0.011, turn: 1.4, pause: 0.55, flies: false, shadow: true },
    tripod: { leash: 0.02, speed: 0.007, turn: 0.9, pause: 0.7, flies: false, shadow: true },
    quad: { leash: 0.025, speed: 0.006, turn: 0.8, pause: 0.6, flies: false, shadow: true },
    hexapod: { leash: 0.018, speed: 0.0035, turn: 1.0, pause: 0.4, flies: false, shadow: true },
    serpent: { leash: 0.025, speed: 0.006, turn: 0.7, pause: 0.3, flies: false, shadow: true },
    sac: { leash: 0.045, speed: 0.006, turn: 0.45, pause: 0, flies: true, shadow: true },
    wings: { leash: 0.035, speed: 0.02, turn: 1.0, pause: 0, flies: true, shadow: false },
    fins: { leash: 0.16, speed: 0.03, turn: 0.35, pause: 0, flies: true, shadow: true },
    arch: { leash: 0, speed: 0, turn: 0, pause: 0, flies: false, shadow: true },
    periscope: { leash: 0, speed: 0, turn: 0, pause: 0, flies: false, shadow: true },
    plough: { leash: 0.012, speed: 0.002, turn: 1.0, pause: 0.5, flies: false, shadow: false },
  };
  // globe units. They follow the 30% cut in BASE_SCALE, so a flyer keeps the same gap in body lengths.
  const HOVER = { sac: 0.0098, wings: 0.014, fins: 0.021 };
  const DENSITY = { land: 0.016, air: 0.007, sub: 0.045 };

  // ---------------------------------------------------------------- body size in metres
  // The lore size text is the source of truth for how large an animal is.
  // BODY gives the factor on G.size, the axis the number measures, and how the number is rounded.
  // bodyMetres() returns that number, and sizeText() formats the same number, so the lore and the
  // ground scale cannot drift apart.
  const BODY = {
    monopod: { k: 3.6, axis: 'height' }, biped: { k: 3.6, axis: 'height' }, tripod: { k: 3.6, axis: 'height' },
    quad: { k: 2.6, axis: 'height' }, hexapod: { k: 2.2, axis: 'length' }, serpent: { k: 6, axis: 'length' },
    sac: { k: 1.6, axis: 'height' }, wings: { k: 2.4, axis: 'length' }, fins: { k: 17, axis: 'length', whole: true },
    arch: { k: 2.8, axis: 'length' }, periscope: { k: 2.4, axis: 'height' }, plough: { k: 3, axis: 'length' },
  };
  const SWARM_BODY = { k: 7, axis: 'length', whole: true }; // a swarm is measured across the whole wheel

  function bodyMetres(G) {
    const B = G.loco === 'wings' && G.plan === 'swarm' ? SWARM_BODY : BODY[G.loco];
    return { metres: B.whole ? Math.round(G.size * B.k) : round1(G.size * B.k), axis: B.axis };
  }

  // ---------------------------------------------------------------- the sociality gene
  // kind: how the species groups. n: how many animals in one group. spread: the formation radius in metres.
  // The weights come from the locomotion, so a grazer walks in a herd and a serpent walks alone.
  const SOCIAL = {
    quad: [['herd', 0.6], ['pair', 0.15], ['solitary', 0.25]],
    hexapod: [['herd', 0.6], ['pair', 0.15], ['solitary', 0.25]],
    biped: [['herd', 0.3], ['pair', 0.3], ['solitary', 0.4]],
    tripod: [['herd', 0.3], ['pair', 0.3], ['solitary', 0.4]],
    monopod: [['herd', 0.3], ['pair', 0.3], ['solitary', 0.4]],
    serpent: [['solitary', 0.8], ['pair', 0.2]],
    wings: [['herd', 0.5], ['pair', 0.2], ['solitary', 0.3]],
    sac: [['solitary', 0.7], ['pair', 0.3]],
    fins: [['solitary', 0.7], ['pair', 0.3]],
    arch: [['solitary', 0.6], ['pair', 0.2], ['herd', 0.2]],
    periscope: [['solitary', 0.6], ['pair', 0.2], ['herd', 0.2]],
    plough: [['solitary', 0.6], ['pair', 0.2], ['herd', 0.2]],
  };

  function rollSocial(rng, G) {
    let kind;
    if (G.plan === 'swarm') kind = 'herd'; // a swarm is a group by definition
    else {
      let r = rng();
      const table = SOCIAL[G.loco];
      kind = table[table.length - 1][0];
      for (const [k, w] of table) { if (r < w) { kind = k; break; } r -= w; }
    }
    const n = kind === 'herd' ? 4 + Math.floor(rng() * 11) : kind === 'pair' ? 2 : 1;
    return { kind, n, spread: n * bodyMetres(G).metres * 0.8 };
  }

  function rollGenome(rng, type, niche, cls, usedLoco, hasFlora, forceLoco) {
    const options = cls === 'air' && niche !== 'sea' && niche !== 'cloud' ? LOCO.air.filter((l) => l !== 'fins') : LOCO[cls]; // whales need open air
    let loco = forceLoco || pick(rng, options);
    for (let i = 0; i < 4 && !forceLoco && usedLoco.has(loco); i++) loco = pick(rng, options);
    usedLoco.add(loco);
    const plan = pick(rng, PLAN[loco]);
    const head = pick(rng, HEAD[loco]);
    const pool = EXTRAS[loco].filter((e) => e !== 'garden' || (hasFlora && plan !== 'spindle'));
    const extras = new Set(ALWAYS[loco] || []);
    const nExtra = 1 + Math.floor(rng() * 2.4);
    for (let i = 0; i < nExtra && pool.length; i++) extras.add(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    if (plan === 'swarm') { extras.delete('tail'); extras.delete('sail'); extras.delete('tendrils'); }
    const G = {
      cls, niche, loco, plan, head, extras: [...extras],
      segs: plan === 'chain' ? 4 + Math.floor(rng() * 4) : 1,
      bodyR: loco === 'fins' ? rr(rng, 0.26, 0.34) : loco === 'tripod' ? rr(rng, 0.08, 0.13) : loco === 'hexapod' ? rr(rng, 0.24, 0.34) : rr(rng, 0.16, 0.3),
      stretch: plan === 'spindle' && cls === 'land' ? 0.6 : 1,
      legLen: { monopod: rr(rng, 0.35, 0.6), biped: rr(rng, 0.45, 0.8), tripod: rr(rng, 0.4, 0.65), quad: rr(rng, 0.25, 0.5), hexapod: rr(rng, 0.14, 0.26) }[loco] || 0,
      // A leg with a knee folds in the swing, and the fold is the strongest sign that the animal
      // walks and does not slide. A quad used to get a knee only a third of the time, so most
      // four-legged animals walked on straight columns. It keeps one roll, so a seed keeps its set.
      jointed: loco === 'quad' ? rng() < 0.7 : rng() < 0.75,
      gait: 1, flap: 1, slow: rr(rng, 0.8, 1.3),
      size: 1, hover: HOVER[loco] || 0,
      move: { ...MOVE[loco] },
      density: DENSITY[cls] * rr(rng, 0.7, 1.3),
      fsign: rng() < 0.5 ? -1 : 1, fcut: rr(rng, -0.35, 0.05),
    };
    G.gait = { monopod: rr(rng, 1.4, 2.2), biped: rr(rng, 2.2, 3.2), tripod: rr(rng, 2.0, 2.8), quad: rr(rng, 1.6, 2.4), hexapod: rr(rng, 4, 5.5), serpent: rr(rng, 2.5, 3.5) }[loco] || 1.5;
    G.flap = { wings: rr(rng, 3.6, 5.2) * Math.sqrt(0.3 / G.bodyR), fins: rr(rng, 1.1, 1.7), sac: 1 }[loco] || 2; // big wings beat slowly
    G.size = { monopod: rr(rng, 1.2, 1.6), biped: rr(rng, 1.3, 1.7), tripod: rr(rng, 1.3, 1.6), quad: rr(rng, 1.4, 1.8), hexapod: rr(rng, 1.1, 1.4), serpent: rr(rng, 1.3, 1.7),
      sac: rr(rng, 1.2, 1.5), wings: plan === 'swarm' ? rr(rng, 1.3, 1.6) : rr(rng, 1.0, 1.4), fins: type === 'gas' ? rr(rng, 2.6, 3.6) : rr(rng, 2.0, 2.5),
      arch: rr(rng, 1.4, 1.7), periscope: rr(rng, 1.3, 1.6), plough: rr(rng, 1.1, 1.4) }[loco];
    if (type === 'gas' && loco !== 'fins') G.size *= 1.5;
    if (loco === 'fins') { G.density = niche === 'cloud' ? 0.02 : 0.0025; G.fsign = 1; G.fcut = 0.3; }
    if (plan === 'swarm') G.move.shadow = false;
    if (niche === 'forest') G.fsign = 1; // the forest test already needs positive flora noise
    if (cls === 'sub' && niche !== 'beach') G.density *= 0.3; // beaches are thin strips; plains are not
    // heavier animals walk slower and wander less
    const heavy = loco === 'quad' || loco === 'hexapod';
    G.move.speed *= heavy ? rr(rng, 0.8, 1) : rr(rng, 0.85, 1.2);
    G.move.turn *= rr(rng, 0.8, 1.25);
    return G;
  }

  // ---------------------------------------------------------------- colours: each species drifts from the world palette
  function rollColors(rng, P, i) {
    const body = shift(P.body, rr(rng, -25, 25) + i * 12, rr(rng, -0.1, 0.1), rr(rng, -0.08, 0.08));
    const body2 = rng() < 0.6 ? shift(body, rr(rng, -10, 10), 0.05, -0.22) : shift(P.body2, rr(rng, -15, 15), 0, rr(rng, -0.05, 0.05));
    const accent = rng() < 0.3 ? P.glow : shift(P.accent, rr(rng, -40, 40), 0, rr(rng, -0.06, 0.06));
    return { body: toHex(body), body2: toHex(body2), accent: toHex(accent), glow: toHex(P.glow) };
  }


  // ================================================================ lore
  // Every line below is a fauna word. The machinery that picks a line lives in lore.js, so the
  // flora file can reuse it without copying anything from here.
  //
  // A line may carry a gate: `tags` names the world conditions it needs, `if` tests the genome.
  // A gated line outranks a plain line, so the planet shows through. Never write a line that
  // names a part the animal may not have, or a condition the world may not meet. See docs/fauna.md.
  const L = self.Lore;
  const pool = L.pool;

  // ---------------------------------------------------------------- name parts
  const NOUN = {
    monopod: ['hopper', 'bounder', 'springer'], biped: ['strider', 'stilter', 'walker'], tripod: ['stalker', 'tripod', 'trine'],
    quad: ['grazer', 'walker', 'plodder'], hexapod: ['crawler', 'creeper', 'scuttler'],
    serpent: ['ribbon', 'slither', 'coil'], sac: ['drifter', 'float', 'bell'], wings: ['flitter', 'darter', 'sailer'],
    fins: ['whale', 'sky whale', 'leviathan'], arch: ['worm', 'loop', 'bow'],
    periscope: ['watcher', 'reed', 'sentinel'], plough: ['keel', 'mole', 'furrow'],
  };
  const ADJ = {
    sail: 'sail-backed', spikes: 'thorn-backed', beads: 'lamp-flanked', tendrils: 'tendril', garden: 'moss-backed', plates: 'shell', tail: 'long-tailed',
    flukes: 'twin-fluked', antennae: 'feeler', mounds: 'tide', shard: 'shard', smooth: 'smooth-backed', lure: 'lantern', stalks: 'stalk-eyed',
    mandibles: 'jawed', beak: 'beaked', crest: 'crested', tusks: 'tusked',
  };
  // A second adjective, chosen from the world rather than from the body. It only replaces the
  // body adjective when the roll asks for it, so a name still usually says what the animal has.
  const WORLD_ADJ = pool([
    { t: 'rime', tags: 'frozen' }, { t: 'frost', tags: 'frozen|subzero' }, { t: 'pale', tags: 'frozen|cold' },
    { t: 'ember', tags: 'molten|searing' }, { t: 'cinder', tags: 'molten' }, { t: 'kiln', tags: 'searing' },
    { t: 'sun', tags: 'hot dryworld' }, { t: 'thirst', tags: 'dryworld' },
    { t: 'moonlit', tags: 'manymoons' }, { t: 'twin-moon', tags: 'twomoons' }, { t: 'dark', tags: 'moonless' },
    { t: 'ring', tags: 'ringed' }, { t: 'long-day', tags: 'slowspin' }, { t: 'quick', tags: 'shortday' },
    { t: 'high', tags: 'lowgrav' }, { t: 'low', tags: 'highgrav' },
    { t: 'storm', tags: 'stormy|gas' }, { t: 'vent', tags: 'volcanic|geysers' }, { t: 'aurora', tags: 'auroral' },
  ]);
  // The place word at the head of a name. NICHE.place holds the plain list; this pool holds the
  // gated one, because a word like "tide" claims a fact the world may not have. An empty string is
  // a name with no place word at all.
  const PLACE = {
    beach: pool([{ t: 'tide', tags: 'tides' }, { t: 'surf', tags: 'hasocean' }, 'shore', 'salt', 'strand']),
    meadow: pool(['meadow', 'plains', 'grass', '', '']),
    forest: pool(['wood', 'forest', 'canopy', '', '']),
    lowland: pool(['valley', 'lowland', 'river', '', '']),
    dune: pool(['dune', 'dust', 'hardpan', '', '']),
    snow: pool(['frost', 'ice', 'rime', '', '']),
    ash: pool(['ash', 'cinder', 'slag', '', '']),
    sea: pool(['sea', 'storm', 'open', '', '']),
    cloud: pool(['cloud', 'storm', 'band', '', '']),
  };
  const GENUS = {
    monopod: 'Saltator', biped: 'Velatrix', tripod: 'Tripus', quad: 'Gravipes', hexapod: 'Sexipes', serpent: 'Serpula', sac: 'Aerocyst', wings: 'Volucris',
    fins: 'Cetus', arch: 'Lumbricus', periscope: 'Speculator', plough: 'Fossor',
  };
  const EPITHET = {
    sail: 'velifer', spikes: 'spinosus', beads: 'lucifer', tendrils: 'filamentosus', garden: 'hortulanus', plates: 'loricatus', tail: 'caudatus', flukes: 'bifurcus',
    antennae: 'antennatus', mounds: 'aestus', shard: 'vitreus', smooth: 'glaber', lure: 'lucernarius', stalks: 'oculatus', mandibles: 'mandibularis',
    beak: 'rostratus', crest: 'cristatus', tusks: 'dentatus',
  };
  // A third source for the epithet, from the world. It breaks a tie when two species of one world
  // would otherwise share a binomial.
  const WORLD_EPITHET = pool([
    { t: 'glacialis', tags: 'frozen' }, { t: 'frigidus', tags: 'cold' }, { t: 'ardens', tags: 'molten' }, { t: 'aestuans', tags: 'searing' },
    { t: 'siccus', tags: 'dryworld' }, { t: 'pluvialis', tags: 'rainy' }, { t: 'lunaris', tags: 'moonlit' }, { t: 'sine luna', tags: 'moonless' },
    { t: 'anulatus', tags: 'ringed' }, { t: 'levis', tags: 'lowgrav' }, { t: 'ponderosus', tags: 'highgrav' },
    { t: 'nocturnus', tags: 'longday' }, { t: 'celer', tags: 'shortday' }, { t: 'fumarius', tags: 'volcanic' }, { t: 'tempestas', tags: 'stormy' },
  ]);

  // ---------------------------------------------------------------- story slot 1: origin, keyed by the locomotion
  // ---------------------------------------------------------------- the gates a line may test
  // Every one of these is a claim the text can make about the animal. A line that names feet is
  // gated on onFoot, a line that has the animal travel on roams, a line that says "alone" on solo.
  // The relation rules read the same predicates, so a synergy sentence cannot contradict the
  // origin sentence three clauses earlier.
  //
  // An animal that lives under the ground and does not plough never travels: its own sociality
  // line says "None of them ever moves".
  const still = (G) => G.cls === 'sub' && G.loco !== 'plough';
  const onFoot = (c) => c.G.cls === 'land';      // it has feet, and it stands on them
  const grounded = (c) => c.G.cls !== 'air';     // it touches the ground; a sac never does
  const roams = (c) => !still(c.G);              // it goes somewhere
  // The sociality gene is rolled before any text, so a line may test it too.
  const solo = (c) => c.G.social.kind === 'solitary';
  const grouped = (c) => c.G.social.kind !== 'solitary';
  const herded = (c) => c.G.social.kind === 'herd';
  const ORIGIN = {
    monopod: pool([
      'It has one leg and no need for a second. The whole body is a spring, and it lands where it looks.',
      'It grew one leg because one leg was enough here. A second would only have to be fed.',
      { t: 'The foot is a pad of cartilage the size of a door. Each hop leaves a print that fills with water and stays for a season.', tags: 'rainy' },
      { t: 'The foot is a pad of cartilage the size of a door. Each print it leaves in the {ground} takes a season for the wind to fill.', tags: '!rainy' },
      { t: 'One hop carries it a hundred paces. At {grav} it comes down slowly enough to pick the spot on the way.', tags: 'lowgrav' },
      { t: 'At {grav} a hop costs it dearly. It takes three, stands, and takes three more.', tags: 'highgrav' },
    ]),
    biped: pool([
      'It walks on two stilts and never sits. The knees lock, and it sleeps standing, swaying a little in the wind.',
      'The legs grow all its life. An old one stands twice the height of a young one, walks the same paths, and takes longer.',
      'It walks with the head low and the body level. From any distance the body seems to float.',
      { t: 'The legs are absurd: thin as reeds and twice the height of a person. At {grav} they hold easily.', tags: 'lowgrav' },
      { t: 'At {grav} the legs are columns, not stilts, and the stride is short and flat.', tags: 'highgrav' },
      { t: 'The day on {world} runs {day}, and it walks through all of it. It sleeps standing, once, in the dark.', tags: 'longday' },
    ]),
    tripod: pool([
      'Three legs, no front and no back. It turns by choosing a new leg to lead, and it never has to look behind.',
      'It stands perfectly still for hours on three thin legs, then moves so fast that the eye keeps the empty place.',
      'Three legs, three eyes, three of everything inside. Its young come in threes as well.',
      { t: 'Three legs carry a heavy world better than four. Three always meet the {ground}, whatever the {ground} does.', tags: 'highgrav' },
    ]),
    quad: pool([
      'It is heavy, patient, and mostly stomach. It walks the loop its mother walked, and its young walk behind it in single file.',
      'Four thick legs, a low body, no hurry. Nothing here has ever made it run.',
      'It has two stomachs and uses both. What the first cannot break down it passes to the second and waits a day.',
      { t: 'At {grav} nothing tall lasts. It is built low, wide, and slow, and that is the whole of the design.', tags: 'highgrav' },
      { t: 'It feeds through the whole long light and lies down for the whole long dark, and it has never varied by an hour.', tags: 'longday' },
    ]),
    hexapod: pool([
      'Six legs, and it never lifts more than three at once. It crosses loose ground without leaving a mark.',
      'It creeps. A day of walking takes it as far as a strong wind would.',
      'The six legs run on their own. The head only says which way, and not often.',
      { t: 'In the cold it locks its legs and stops. A week later, when the air lifts, it goes on from the same step.', tags: 'frozen|cold' },
      { t: 'Six short legs spread its weight over ground that will not hold a heavier animal.', tags: 'highgrav' },
    ]),
    serpent: pool([
      'It has no legs and no need for them. The body throws a wave from head to tail and the {ground} does the rest.',
      'It moves like poured water, and it rests in a coil with the head raised.',
      'It has one lung down the whole length of the body, and it fills it slowly, once a minute.',
      { t: 'It runs the seams where the {ground} is hottest and will not cross cold ground if there is any way around.', tags: 'hot|molten' },
      { t: 'It lies in the sun until the blood runs, then moves, and it can only do this for a few hours of the day.', tags: 'frozen|cold' },
    ]),
    sac: pool([
      { t: 'Born as a wet knot on a cliff face, it inflates over a single night on gas from its own fermenting gut, and lets go. It never lands again.', tags: '!noground' },
      { t: 'It is born in the cloud deck and it dies in the cloud deck. Nothing in its line has ever touched a solid surface.', tags: 'noground' },
      'It is a bladder of warm gas with a mind somewhere in the wall. The wind decides where it goes, and it does not seem to object.',
      'The sac is one cell. It is the largest single cell anyone has measured.',
      { t: 'At {grav} it hardly needs the gas at all. It fills the sac out of habit, and habit is what it has instead of a brain.', tags: 'lowgrav' },
      { t: 'At {grav} it must brew gas all day to stay up, and a sick one sinks within the hour.', tags: 'highgrav' },
    ]),
    wings: pool([
      'Each wing is a single stiff blade. It does not flap so much as row, and it turns by tilting the whole body.',
      { t: 'It flies in a loose wheel of a dozen or more, and the wheel has a leader only in the sense that a whirlpool does.', if: herded },
      'It sleeps on the wing, one half of the brain at a time.',
      { t: 'At {grav} flight is work. The wings are short, the beat is fast, and it lands more often than it would like.', tags: 'highgrav' },
      { t: 'At {grav} it barely beats at all. It opens the wings, leans, and is gone.', tags: 'lowgrav' },
      { t: 'The air here is thick and slow. It swims through it more than it flies.', tags: 'gas' },
    ]),
    fins: pool([
      'It is mostly bladder, lifted by a warm gas it brews in a gut the size of a house. It sings through the belly, which glows with the song.',
      'It swims through air the way its ancestors swam through water, and it has forgotten the difference.',
      'It was a swimmer once. The bones of the fins still carry the joints of a fin that pushed water.',
      { t: 'It has never been near a surface. Up and down, for it, mean warm and cold, and nothing else.', tags: 'noground' },
      { t: 'It crosses the whole of {world} in a season and comes back to the same band of air to calve.', tags: 'gas' },
    ]),
    arch: pool([
      'Only the arch is ever seen. The rest runs under the {ground} in a loop that can be a kilometre long, and one animal can raise a dozen arches to breathe.',
      'What shows above the {ground} is a breathing loop. The body below has never seen daylight and does not need to.',
      'It has two of everything and no front. Either end can lead, and the loop decides at the turn.',
      { t: 'The {ground} above it is frozen hard. It works the soft layer underneath and comes up only where the crust is thin.', tags: 'frozen' },
    ]),
    periscope: pool([
      'It lives buried and raises the head on a long neck to look. When something looks back, the head goes down and does not come up for a day.',
      'The neck is a periscope. The body under the {ground} is broad and blind and has not moved in years.',
      'The eye at the top of the neck is larger than the head that carries it.',
      { t: 'It raises the neck only in the dark. In the light of {world} the neck is a target and it knows it.', tags: 'hot|searing' },
    ]),
    plough: pool([
      'It swims through the {ground} a hand’s width down, and only the back shows, like a boat keel turned over.',
      'It pushes a mound of {ground} ahead of it as it goes and eats what the mound turns up.',
      'It has no eyes. The whole skin reads pressure, and pressure is all it has ever needed.',
      { t: 'It works the thin warm layer under the frozen crust and never breaks through to the air.', tags: 'frozen' },
    ]),
  };
  const SWARM_ORIGIN = pool([
    'Each shard is a separate animal, blind and nearly mindless. The core is not. It grows the shards from its own body and pays them in sugar to carry it from one patch of sun to the next.',
    'It is one animal or a hundred, depending on how you count. The shards share no nerve, only a chemical the core releases, and the chemical is enough.',
    { t: 'The shards fly apart in the dark and find the core again at first light. On a night of {night} some never do.', tags: 'longday' },
  ]);

  // ---------------------------------------------------------------- story slot 2: one feature, keyed by a part the animal has
  const FEATURE = {
    sail: pool([
      { t: 'The sail is not for display. It is a living membrane threaded with vessels; on cold mornings it turns the sail broadside to the sun and steams.', tags: 'waterliquid !searing' },
      { t: 'The sail is a radiator. At {temp} it holds the sail edge-on to the sun and dumps its heat into the wind.', tags: 'hot|molten' },
      { t: 'The sail stays folded most of the year. It opens on the warmest hour of the warmest day, and then only halfway.', tags: 'frozen|cold' },
      'The sail carries a pattern no two of them share, and it is the only part of the animal another one looks at.',
    ]),
    spikes: pool([
      'The spikes glow faintly at night: bacteria it farms in the hollow tips and feeds with its own heat.',
      'The spikes are hollow and they hum in the wind. A field of them makes a sound you feel before you hear it.',
      'It sheds the spikes once a year, all of them at once, and stays soft and hidden for a week after.',
      { t: 'The dark here runs {night} at a stretch. The spikes are the only light it carries, and it keeps them lit through all of it.', tags: 'longday moonless' },
    ]),
    beads: pool([
      'The lamps along its flank pulse in a rhythm that changes with the season, and no two animals pulse alike.',
      'It can put every lamp out at once, and it does, when something it cannot name comes close.',
      { t: 'Nothing crosses the night sky of {world}. The lamps are the only way one of them finds another.', tags: 'moonless' },
      { t: 'Its lamps are dim for a reason. With {moons} moons up the night is rarely dark, and a bright animal is a seen animal.', tags: 'manymoons' },
    ]),
    tendrils: pool([
      'The tendrils are sticky, patient, and slightly warm. Anything that touches them is drawn in, slowly.',
      'It trails the tendrils below it and reads the air with them. They are the closest thing it has to eyes.',
      { t: 'The tendrils comb the cloud for anything solid. On a good day that is half its weight in dust.', tags: 'noground' },
    ]),
    garden: pool([
      { t: 'Nothing grows on a young one. The garden comes with age: spores caught in the ridges of the back, then moss, then the small trees whose roots reach down into the animal’s fat.', tags: 'woody' },
      { t: 'Nothing grows on a young one. The garden comes with age: crystal seed caught in the ridges of the back, then a fringe of spires that draw their minerals straight out of its blood.', tags: 'crystalflora' },
      { t: 'Nothing grows on a young one. The garden comes with age: spores in the ridges of the back, then caps, then a standing crop that the animal never eats.', tags: 'fungal' },
      { t: 'Nothing grows on a young one. The garden comes with age, and an old one carries a patch of every ground it has walked.', w: 0.6 },
    ]),
    plates: pool([
      'The plates are stone. It eats rock, and what it cannot digest it presses into its back, layer on layer, so an old one carries the geology of everywhere it has been.',
      'It grows the plates rather than collecting them. It lays down one a year, and you can read its age off its back.',
      { t: 'The plates are glazed. It walks close enough to the flows that the outer layer has been fired.', tags: 'volcanic|molten' },
    ]),
    tail: pool([
      'The tail is a counterweight and a rudder. Take it away and the animal walks in circles until it grows back.',
      'The tail stores a season of fat. By the end of the lean months it hangs loose and drags.',
      { t: 'At {grav} the tail does most of the balancing. It swings it against every turn, and the turn is the smoother for it.', tags: 'lowgrav' },
    ]),
    flukes: pool([
      'The flukes beat once a minute. Each stroke moves it the length of its own body, and it never needs more.',
      'The flukes are the only hard parts in the animal. Everything else is bladder, gut, and skin.',
    ]),
    antennae: pool([
      { t: 'The feelers taste the air. It knows the weather three days out and moves to high ground before the rain.', tags: 'rainy', if: roams },
      { t: 'The feelers taste the air. It knows the rain is coming three days out, and it is sealed and under by the time it arrives.', tags: 'rainy', if: (c) => !roams(c) },
      { t: 'The feelers taste the air for water. Twice a year they find it, and the whole species walks that way.', tags: 'dryworld|desert' },
      { t: 'The feelers read the charge before a storm. It is flat on the {ground} before the first bolt lands.', tags: 'stormy' },
      'The feelers taste the air. It knows what walked past hours ago and which way it went.',
    ]),
    mounds: pool([
      'The mounds at either end are its breath: it pushes {ground} up as it draws air in and lets it settle as it exhales.',
      'The two mounds are always the same distance apart, and the distance tells you the length of the animal under them.',
    ]),
    lure: pool([
      'The lantern is the only warm thing for miles, and every small creature knows it. The light pulses in a rhythm that matches a sleeping heartbeat.',
      'The light is tuned to the one colour the small things here cannot ignore. Nothing has worked out how it found the colour.',
      { t: 'It burns the lantern through the whole of a {night} night. Nothing here can afford to ignore a light that lasts that long.', tags: 'longday' },
    ]),
    stalks: pool([
      'The eye stalks watch two horizons at once. It has never been surprised.',
      'The eyes never both close. One sleeps while the other keeps watch, and they trade at the turn of the night.',
      { t: 'The eyes are enormous and take in the little light there is. In full sun it keeps them shut and feeds by feel.', tags: 'frozen|longday' },
    ]),
    mandibles: pool([
      'The jaws close once. Whatever they close on stays closed on.',
      'The jaws are driven by a stored spring, not by muscle. It winds them over an hour and spends them in a tenth of a second.',
    ]),
    beak: pool([
      { t: 'The beak is a chisel. It cracks seed cases, bark, and, when it must, the shells of its own kind.', tags: 'woody' },
      { t: 'The beak is a chisel. It works past the spines, opens the pulp, and drinks what is inside.', tags: 'cactus' },
      { t: 'The beak is a chisel. It opens a cap at the stem and takes what has been living in it.', tags: 'fungal' },
      { t: 'The beak is a chisel. It splits crystal along the grain and licks out what has grown inside.', tags: 'crystalflora' },
      'The beak grows all its life and would curl over if it did not wear it down daily on the {ground}.',
    ]),
    tusks: pool([
      'The tusks are for digging, not for fighting. It has never been in a fight.',
      'The tusks wear flat on one side, and the side tells you which way it prefers to turn.',
      { t: 'It breaks the frozen crust with the tusks and works the soft layer below. Nothing else here can get through the crust.', tags: 'frozen' },
    ]),
    crest: pool([
      { t: 'The crest is a heat sink. When it runs hot the crest flushes bright, and the others slow down to let it cool.', tags: '!frozen !cold', if: grouped },
      { t: 'The crest is a heat sink. When it runs hot it flushes bright, and it will not move again until the colour has gone out of it.', tags: '!frozen !cold', if: solo },
      { t: 'The crest is a heat trap. It stands with the crest square to the sun and bleeds the warmth back into the blood.', tags: 'frozen|cold' },
      'The crest is hollow and it sounds through it. A call carries further than the animal can see.',
    ]),
  };
  // What a burrower pushes up, when the mounds are not the arch of an arch.
  const PLOUGH_MOUNDS = {
    plough: pool(['The mound ahead of it is not dug. It is pushed, and it has not stopped pushing since it hatched.']),
    periscope: pool(['The ring of {ground} around the neck is what it breathes out. Step inside the ring and the neck goes down.']),
  };
  // The line for an animal with no nameable part left over.
  const PLAIN_FEATURE = pool([
    'Its skin changes colour in a rhythm that shifts with the season, and no two animals shift alike.',
    'It has no marking, no horn, and no ornament. Whatever it spends its food on, it is not display.',
    { t: 'The skin is white on white and it is invisible at twenty paces.', tags: 'frozen' },
    { t: 'The skin is matt black and sheds heat all night. At {temp} that is the whole trick.', tags: 'searing|molten' },
  ]);

  // ---------------------------------------------------------------- story slot 3: manner
  const HABIT = {
    herd: pool([
      'A herd walks in silence for days, then, on some signal no one has recorded, every animal lies down until the wind changes.',
      'It feeds facing the same way as the animal beside it, and the whole herd turns together, without a sound.',
      { t: 'The herd walks through the light and stands through the {night} dark, packed close, in one body of heat.', tags: 'longday frozen|cold' },
    ]),
    ambush: pool([
      'It waits. When the {ground} shivers around its feet it bends, quickly, and the light goes out for a moment.',
      'It has been in the same place for eleven days. It will be there tomorrow, and the day after, and then it will not.',
      'It chooses a spot and commits to it for the season. A bad spot is a dead animal, and it cannot tell in advance.',
    ]),
    strike: pool([
      'It waits. The strike is over before the shadow moves.',
      'It spends nothing at all until it spends everything. Two strikes in a day is a bad day.',
      'It misses perhaps one strike in twenty, and a miss costs it the rest of the day.',
    ]),
    restless: pool([
      { t: 'It never rests. A wheel of them can circle the same tree for a month and then be gone in an hour.', tags: 'woody', if: grouped },
      { t: 'It never rests. A wheel of them can work the same stretch of {ground} for a month and then be gone in an hour.', if: grouped },
      { t: 'It never rests. It works the same stretch of {ground} for a month and is gone from it in an hour.', if: solo },
      'It stops only to feed, and it feeds without stopping, which amounts to never stopping at all.',
    ]),
    patient: pool([
      { t: 'It rises at dawn on the warm air and settles at dusk, and it has been doing that, alone, for longer than the trees.', tags: 'woody', if: solo },
      { t: 'It rises on the warm air of the morning and settles when the air cools, and it has kept to that, alone, longer than anything here that can be counted.', if: solo },
      'It rises on the warm air of the morning and settles when the air cools, and it has never once been seen to hurry either half of that.',
      { t: 'There is no dawn to rise on for {night} at a time. It holds its height through the dark and waits for the air to lift.', tags: 'longday' },
    ]),
    serene: pool([
      'The young are born in the air and never touch the ground. The old ones rise too high one day and do not come down.',
      'It has no enemy, no rival, and no hurry, and it shows in every part of how it moves.',
      { t: 'It has never been down as far as the deck. Nothing that has gone down that far has come back up.', tags: 'noground' },
    ]),
    tide: pool([
      { t: 'It rises with the tide and sinks with it. Stand on the {ground} at the turn and you can feel it move.', tags: 'tides' },
      { t: 'It rises and sinks twice a day on a clock of its own. There is no moon over {world} to set that clock, and nobody has found what does.', tags: 'moonless' },
      'It rises and sinks twice a day, and the {ground} lifts a hand’s width each time it does.',
    ]),
    buried: pool([
      { t: 'It moves with the ground water. In a dry year it does not surface at all.', tags: 'rainy' },
      { t: 'It moves with the thaw line, down in the warm months and up in the cold. In a hard year it does not surface at all.', tags: 'frozen|cold' },
      { t: 'There is no water under the {ground} here. It follows the last of the damp and surfaces perhaps twice a year.', tags: 'dryworld|hot' },
      'It follows a layer, not a place. Where the layer goes down, it goes down, and it may not surface for a season.',
    ]),
    armoured: pool([
      'Nothing eats it. Nothing has found a way in.',
      'It has no flight response of any kind. It stops, and that has always been enough.',
      'It has outlived everything that ever evolved to open it.',
    ]),
    wary: pool([
      'It keeps a distance from anything larger than itself and a longer distance from anything smaller.',
      'It feeds with the head up more often than down, and it has never finished a meal in one place.',
      'It has two speeds: the one it feeds at, and the one it leaves at. Nothing has seen the second twice.',
      'It will abandon good feeding over a sound it cannot place, and it does that most days.',
      { t: 'It works the open ground only in the dark, and in the light it is somewhere you cannot see it.', tags: 'longday|moonlit' },
    ]),
  };

  // ---------------------------------------------------------------- story slot 4: the planet
  // One sentence about living on this particular world. Every line here is gated, so a line only
  // appears where its condition holds.
  const CLIMATE = pool([
    { t: 'At {temp} its blood carries its own antifreeze, and it runs slow and thick all year.', tags: 'frozen' },
    { t: 'The {ground} here never thaws. It walks on it, feeds off it, and has no use for the idea of soft ground.', tags: 'frozen !noground', if: onFoot },
    { t: 'The {ground} below never thaws, and nothing it needs is down there. It has no reason to go low and it never does.', tags: 'frozen !noground', if: (c) => c.G.cls === 'air' },
    { t: 'It runs a few degrees warmer than the air and pays for every one of them.', tags: 'cold' },
    { t: 'At {temp} nothing here is built out of protein. Whatever holds this animal together holds at the heat of a furnace.', tags: 'molten' },
    { t: 'It moves at dawn and at dusk. Through the middle of the day it does not move at all, because at {temp} moving is dying.', tags: 'searing' },
    { t: 'It carries its water in a sac under the skin and can cross a season on one filling.', tags: 'hot dryworld' },
    { t: 'There is no standing water anywhere on {world}. It takes what it needs out of what it eats and passes almost nothing.', tags: 'dryworld' },
    { t: 'It is wet for its whole life and has no behaviour at all for being dry.', tags: 'rainy mostlysea' },
    { t: 'It drinks standing in the shallows, and it watches the horizon the whole time it drinks.', tags: 'rainy !mostlysea', if: onFoot },
    { t: 'It takes water on the wing, off the surface, and it has never once stopped to do it.', tags: 'rainy !mostlysea', if: (c) => c.G.cls === 'air' },
    { t: 'There is little land on {world}, and it shares every metre of it with everything else alive.', tags: 'mostlysea !noground' },
    { t: 'At {grav} it is built of long thin bones that would snap on a heavier world.', tags: 'lowgrav' },
    { t: 'At {grav} it has never lifted anything, itself included, any higher than it had to.', tags: 'highgrav' },
    { t: 'At {grav} a fall of its own height would kill it. It has never fallen.', tags: 'crushgrav' },
    { t: 'At {grav} it can leave the {ground} by accident, and the young often do.', tags: 'feathergrav !noground', if: onFoot },
    { t: 'The day on {world} runs {day}. It sleeps twice through the light and once through the dark.', tags: 'longday' },
    { t: 'A day here is {day} long. It moves with the shadow line and never lets the sun get overhead.', tags: 'slowspin' },
    { t: 'The sun crosses in {day}. It feeds and sleeps four times over in what another world would call one day.', tags: 'shortday' },
    { t: 'The dark lasts {night}, and the cold at the end of it is the worst thing it meets. It digs in and waits the last hours out.', tags: 'longday frozen|cold', if: grounded },
    { t: 'The dark lasts {night}, and the cold at the end of it is the worst thing it meets. It drops into the warmer air below and holds there until the light.', tags: 'longday frozen|cold', if: (c) => c.G.cls === 'air' },
    { t: 'It has no word for down. Warm is up, cold is down, and that is the whole of its geography.', tags: 'noground' },
    { t: 'It reads the heat of the {ground} through its feet. A flow it cannot see from a day away turns the whole line of them aside.', tags: 'volcanic', if: (c) => onFoot(c) && grouped(c) },
    { t: 'It reads the heat of the {ground} through its feet. A flow it cannot see from a day away sends it a week out of its way.', tags: 'volcanic', if: (c) => onFoot(c) && solo(c) },
    { t: 'It reads the heat rising off a flow from a long way up, and it will not cross one at any height.', tags: 'volcanic', if: (c) => c.G.cls === 'air' },
    { t: 'It drinks at the vents, and it knows the interval of every one it uses to within a minute.', tags: 'geysers waterliquid', if: grounded },
    { t: 'The vents throw up warmth as well as ice. It feeds at the edge of one and knows that vent’s interval to the minute.', tags: 'geysers !waterliquid' },
    { t: 'It lies flat when the charge builds. It is never the tallest thing on the plain, and that is not an accident.', tags: 'stormy !noground', if: grounded },
    { t: 'It drops a band when the charge builds and rides out the strike below the worst of it.', tags: 'stormy noground|gas', if: (c) => c.G.cls === 'air' },
    { t: 'On the nights the sky over {world} burns, it will not feed. Nobody has worked out why.', tags: 'auroral' },
    { t: 'Food here is thin and far apart. It travels a long way between meals and wastes none of one.', tags: 'sparseflora' },
    { t: 'Where it feeds the ground rings. It has learned which note means the growth is old enough to take.', tags: 'crystalflora' },
    { t: 'The spores are in everything here. It breathes them from birth, and something of the {plant} grows in its gut that it cannot live without.', tags: 'fungal' },
    { t: 'It knows every standing {plant} in its range, and it knows which ones are worth the trip.', tags: 'woody|cactus' },
    { t: 'The air over {world} is thick and it holds the heat. It has never had to work to stay warm.', tags: 'gas' },
  ]);

  // ---------------------------------------------------------------- story slot 5: the sky
  // Moons, rings, and the one natural activity of the world. These facts are only known after the
  // globe is built, so this pool must never be reached before then. describe() runs late for that
  // reason. Every line is gated, and a world with a plain sky simply has no line here.
  const SKY = pool([
    { t: 'Nothing crosses the sky of {world} after dark but stars. It hunts by touch once the light goes.', tags: 'moonless' },
    { t: '{moon} rises once a night, and it feeds while the moon is up and rests when it is down.', tags: 'onemoon' },
    { t: 'Two moons cross the sky of {world}. It breeds in the week the two rise together, and at no other time.', tags: 'twomoons' },
    { t: 'There are {moons} moons over {world}. The night light is never the same twice, and it has given up using light to tell the time.', tags: 'manymoons' },
    { t: '{moon} pulls the water up the shore and lets it down twice a day, and its whole life runs on that clock.', tags: 'tides' },
    { t: 'The ring cuts the sky of {world} in half. It keeps to the shadow the ring throws, and it is moving by the time the shadow is.', tags: 'ringed' },
    { t: 'Ring light and {moon} together make a night here brighter than a dull day, and it feeds straight through.', tags: 'ringed moonlit' },
    { t: 'When the sky over {world} lights up it raises its head, and so does every other one, at the same moment.', tags: 'auroral' },
    { t: 'The ash out of the vents blanks the sun for days at a time. It goes quiet and waits that out.', tags: 'volcanic' },
    { t: 'It counts the gap between the flash and the sound. So, as far as anyone can tell, do its young.', tags: 'stormy' },
    { t: 'It times its day by a vent rather than by the sun. The vent is the more reliable of the two.', tags: 'geysers' },
    // Lines for a plain sky. Without them a world with no moon, no ring, and no activity has a
    // one-line pool, and every species of it closes on the same sentence.
    { t: 'It reads the sky better than anything else here, and it is moving before the weather arrives.', if: roams },
    { t: 'The sky over {world} is the one thing in its range it cannot walk away from, and it watches it constantly.', if: onFoot },
    'It knows the hour from the colour of the light and has never been caught out by dusk.',
    'Whatever it uses to tell the season by, it is not the sky, and nobody has found what it is.',
  ]);

  // ---------------------------------------------------------------- story slot 7: the closing line, keyed by the world type
  const CLOSE = {
    terran: pool([
      { t: 'It is older than the forest, and it will outlast it.', tags: 'woody' },
      'At dusk on {world} it is the loudest thing for miles.',
      'It was here before the ground took its present shape, and it did not notice the change.',
      'Of everything alive on {world}, this is the one a visitor would remember.',
    ]),
    ocean: pool([
      'It has never seen land larger than an island, and it does not know there is any.',
      'The people who named {world}, if there were any, never saw one up close.',
      { t: 'It crosses open water for days without a mark to steer by and arrives where it meant to.', if: (c) => c.G.cls !== 'sub' },
      { t: 'Every island here holds its own kind, and no two islands hold quite the same one.', tags: 'mostlysea' },
      { t: 'Half the coast of {world} is its range, and the other half is somebody else’s.', tags: 'mostlysea' },
    ]),
    desert: pool([
      { t: 'It drinks once a year, when the fog comes in off the coast of {world}.', tags: 'hasocean' },
      'By noon it is the only thing on {world} still moving.',
      'It can lose a third of its own weight in water and walk it back in a night.',
      'Everything on {world} is waiting for something. This one waits better than most.',
    ]),
    ice: pool([
      'In the long dark of {world} it is one of the few things that moves.',
      'It has never been warm, and it does not miss it.',
      'The cold is not its problem. The wind is, and it has spent its whole line solving the wind.',
      { t: 'Under the ice of {world} there is more of it than anyone has counted.', tags: 'hasocean' },
    ]),
    lava: pool([
      'On {world} the ground is warm, and it has never known otherwise.',
      'It walks the cooler ridges and waits for the flows to pass.',
      'Its whole line has lived between two flows, and both are older than the species.',
      'Nothing about {world} is safe, and it has made a living out of the margin.',
    ]),
    exotic: pool([
      'Nothing on {world} is quite what it looks like, and this is no exception.',
      'It may not be an animal at all.',
      'Two observers have described it and the two descriptions do not agree.',
      'It behaves as though it knows it is being watched, which it cannot.',
    ]),
    gas: pool([
      'The ones in the clouds of {world} have never seen ground and have no word for down.',
      'It has crossed the storm belts of {world} more times than there are stars in its sky.',
      'It lives its whole life inside one band of air and treats the next band as another world.',
      'Nothing here has ever landed. Landing is not a thing that happens on {world}.',
    ]),
  };
  const TEMPER = { herd: 'Placid', ambush: 'Still, then sudden', strike: 'Still, then sudden', restless: 'Restless', patient: 'Patient', serene: 'Serene', tide: 'Unaware', buried: 'Unaware', armoured: 'Indifferent', wary: 'Wary' };

  // ---------------------------------------------------------------- diet
  // The head decides what it eats; the world decides what there is to eat. Every line is gated on
  // both, and the last line has no gate at all, so a diet is never empty.
  // A diet has one source, not several. The tests below are exclusive on purpose: an animal that
  // eats rock is not also grazing, a burrower does not feed on the surface, and a head that names
  // a food beats the general lines. Without that, a weighted roll can hand a predator leaf litter.
  const HEAD_FED = new Set(['lure', 'mandibles', 'beak', 'stalks', 'tusks', 'crest']);
  const plated = (c) => c.G.extras.includes('plates');
  const filters = (c) => c.G.cls === 'sub' && c.G.head !== 'lure' && !plated(c);
  const byHead = (h) => (c) => c.G.head === h && !plated(c) && !filters(c);
  const noHeadFood = (c) => !plated(c) && !filters(c) && !HEAD_FED.has(c.G.head);
  // Every line carries the source its food comes from. All the lines that fit one animal must
  // name the same source: an animal has one diet, not a choice of four. tools/lore-audit checks it.
  const DIET = pool([
    { t: 'Minerals licked from the rock', if: plated, w: 6, src: 'mineral' },
    { t: 'Filters the wet {ground}', if: filters, tags: 'rainy', w: 4, src: 'filter' },
    { t: 'Sifts the frozen {ground}', if: filters, tags: 'frozen|subzero', w: 4, src: 'filter' },
    { t: 'Sifts the dry {ground}', if: filters, tags: 'dryworld|hot', w: 4, src: 'filter' },
    { t: 'Works the {ground} and takes what is in it', if: filters, w: 2, src: 'filter' },
    { t: 'Anything drawn to the light', if: byHead('lure'), w: 4, src: 'lure' },
    { t: 'Smaller flyers, taken on the wing', if: (c) => byHead('mandibles')(c) && c.G.cls === 'air', w: 4, src: 'prey' },
    { t: 'Small creatures, taken at dusk', if: (c) => byHead('mandibles')(c) && c.G.cls !== 'air', w: 4, src: 'prey' },
    { t: 'Seed heads and hard fruit', if: byHead('beak'), tags: 'woody', w: 4, src: 'beak' },
    { t: 'Cactus pulp, reached past the spines', if: byHead('beak'), tags: 'cactus', w: 4, src: 'beak' },
    { t: 'Caps, and the grubs inside them', if: byHead('beak'), tags: 'fungal', w: 4, src: 'beak' },
    { t: 'Crystal buds, cracked along the grain', if: byHead('beak'), tags: 'crystalflora', w: 4, src: 'beak' },
    { t: 'Seed cases and the odd shell', if: byHead('beak'), w: 2, src: 'beak' },
    { t: 'Grazed from the low branches', if: (c) => byHead('stalks')(c) && c.G.niche === 'forest', tags: 'woody', w: 5, src: 'graze' },
    { t: 'Grazed from the tops of the grass', if: byHead('stalks'), tags: 'woody|fungal', w: 3, src: 'graze' },
    { t: 'Lichen scraped off the rock', if: byHead('stalks'), w: 2, src: 'graze' },
    { t: 'Roots and leaf litter', if: byHead('tusks'), tags: 'woody|fungal', w: 4, src: 'root' },
    { t: 'Roots prised out of the {ground}', if: byHead('tusks'), w: 2, src: 'root' },
    { t: 'Airborne spores', if: byHead('crest'), tags: 'flora', w: 4, src: 'spore' },
    { t: 'Whatever the wind carries', if: byHead('crest'), w: 2, src: 'spore' },
    { t: 'Airborne spores, and whatever the tendrils catch', if: (c) => noHeadFood(c) && c.G.cls === 'air' && c.G.extras.includes('tendrils'), tags: 'flora', w: 4, src: 'air' },
    { t: 'Cloud plankton and rain', if: (c) => noHeadFood(c) && c.G.cls === 'air', tags: 'rainy', w: 3, src: 'air' },
    { t: 'Cloud plankton', if: (c) => noHeadFood(c) && c.G.cls === 'air', w: 2, src: 'air' },
    { t: 'Leaf litter and fallen fruit', if: (c) => noHeadFood(c) && c.G.cls === 'land', tags: 'woody !subzero', w: 3, src: 'ground' },
    { t: 'Frozen litter, and whatever is under the crust', if: (c) => noHeadFood(c) && c.G.cls === 'land', tags: 'woody|fungal subzero', w: 3, src: 'ground' },
    { t: 'Caps and the litter under them', if: (c) => noHeadFood(c) && c.G.cls === 'land', tags: 'fungal', w: 2, src: 'ground' },
    { t: 'Minerals licked from the rock', if: (c) => noHeadFood(c) && c.G.cls !== 'air', w: 1, src: 'ground' },
  ]);

  // ---------------------------------------------------------------- sociality text
  const socialTemper = (s) => (s.kind === 'herd' ? `herds of ${L.num(s.n)}` : s.kind === 'pair' ? 'in pairs' : 'solitary');
  const HERD_STORY = pool([
    'A herd of {n} moves at the pace of its slowest member and has never once left one behind.',
    { t: '{n} wheels work one stretch of {ground} about {spread} metres across. They drift apart and rejoin all day, and nobody has seen one wheel join another.', if: (c) => c.G.plan === 'swarm', w: 6 },
    'It moves in herds of {n}. The herd holds a ring about {spread} metres across, and the young keep to the middle of it.',
    'A herd of {n} feeds together and moves together over about {spread} metres of {ground}. One animal alone is a lost animal.',
    { t: 'A herd of {n} spreads over about {spread} metres and closes up at dusk, every animal touching the next.', tags: 'moonless|longday' },
    { t: 'A herd of {n} covers about {spread} metres of {ground}, and it moves as slowly as its heaviest member, which at {grav} is very slowly indeed.', tags: 'highgrav' },
  ]);
  const HERD_STILL = pool([
    'A herd of {n} shares one stretch of {ground} about {spread} metres across. None of them ever moves.',
    'Wherever one is found, {n} are found, over about {spread} metres of {ground}. Not one of them has changed place in living memory.',
  ]);
  const PAIR_STORY = pool([
    'Two travel together and neither leads. When they disagree about a direction they stand still until one gives way.',
    'A pair holds one range between them and works opposite ends of it, meeting at the middle at dusk.',
    { t: 'It hunts in pairs, and a pair holds together until one of the two dies.', if: (c) => c.G.head === 'mandibles' || c.G.head === 'lure', w: 4 },
    'It lives in pairs. The two feed apart and rest together, and a pair keeps the same ground for years.',
    'It comes in twos. Neither one strays further than a call.',
    { t: 'A pair share one burrow and take turns at the surface, one up while the other is down.', if: (c) => c.G.cls === 'sub' },
  ]);
  const ALONE_STORY = pool([
    'It keeps to itself. Two in one place is a fight, or a season of young.',
    'It lives alone, and meets its own kind twice: once at birth, once to breed.',
    'It holds a range it never leaves and never shares, and it walks the boundary of it every few days.',
    'It has no call, no display, and no interest. Another of its kind is an obstacle, not a prospect.',
    { t: 'It keeps to itself. No two of them have been found in one stretch of {ground}.', if: (c) => c.still, w: 3 },
    { t: 'It is alone because there is not enough here for two. Its range is enormous and almost empty.', tags: 'sparseflora|dryworld' },
  ]);

  // ---------------------------------------------------------------- relations with the other species of the world
  // A relation names another animal of the same world. The rules read a pair and say which
  // relations fit. Lore.relate() walks the pairs in a fixed order, so a seed keeps its relations.
  // `t` is the line the first animal gets and `mirror` is the line the second one gets, so the two
  // stories agree with each other.
  const metresOf = (G) => bodyMetres(G).metres;
  const hunts = (G) => G.head === 'mandibles' || G.head === 'lure';
  const grazes = (G) => G.head === 'stalks' || G.head === 'tusks' || G.head === 'beak';
  const buried = (G) => G.cls === 'sub';
  const flies = (G) => G.cls === 'air';
  const walks = (G) => G.cls === 'land';
  const sameGround = (a, b) => a.niche === b.niche;
  // What each relation needs of each side, for tools/lore-audit. The words match the text:
  // mobile for a line that has the animal travel, walks for a line that names feet,
  // flies for one that names flight, tunnels for one that names a run or a pushed mound,
  // and notburied for one that happens on the surface.
  const RELATION_CONTRACT = {
    hunt: { a: ['mobile'], b: [] },
    scavenge: { a: ['mobile'], b: ['walks'] },
    ride: { a: ['flies'], b: ['mobile'] },
    lee: { a: ['flies'], b: ['flies'] },
    burrow: { a: ['tunnels'], b: ['walks'] },
    lamp: { a: [], b: ['mobile'] },
    compete: { a: [], b: [] },
    sentry: { a: [], b: ['mobile'] },
    garden: { a: [], b: ['notburied'] },
    spore: { a: ['mobile'], b: [] },
    mound: { a: ['tunnels'], b: ['notburied'] },
    shelter: { a: [], b: ['mobile'] },
    mingle: { a: ['mobile'], b: ['mobile'] },
  };
  const RELATIONS = [
    { key: 'hunt', w: 3,
      when: ({ a, b }) => hunts(a) && !hunts(b) && sameGround(a, b) && metresOf(a) >= metresOf(b) * 0.7 && !buried(a),
      t: 'It hunts {other}, and it takes the young of the year first.',
      mirror: 'It is what {other} hunts. Everything about how it feeds is arranged around that one fact.' },
    { key: 'scavenge', w: 2,
      when: ({ a, b }) => a.head === 'beak' && !buried(a) && walks(b) && b.social && b.social.kind === 'herd' && metresOf(b) > metresOf(a) * 1.5,
      t: 'It follows {others} and lives off what their feet turn up.',
      mirror: '{Others} follow it and take what its feet turn up. It has never once looked at them.' },
    { key: 'ride', w: 2,
      when: ({ a, b }) => flies(a) && !flies(b) && !still(b) && metresOf(b) > metresOf(a) * 3,
      t: 'It rides the back of {other} and picks the parasites out of the hide. Neither one can remember starting.',
      mirror: '{Others} ride its back and keep the hide clean. It tilts to let them settle.' },
    { key: 'lee', w: 2,
      when: ({ a, b }) => a.loco === 'fins' && flies(b) && b.loco !== 'fins',
      t: '{Others} fly in its lee for hours at a time, out of the wind, and it has never shaken them off.',
      mirror: 'It flies in the lee of {other}, out of the wind, and it has done so since before it could fly well.' },
    { key: 'burrow', w: 2,
      when: ({ a, b }) => (a.loco === 'plough' || a.loco === 'arch') && walks(b) && metresOf(b) < metresOf(a) * 2,
      t: 'The runs it leaves behind are the only shelter on this ground, and {others} use every one of them.',
      mirror: 'It shelters in the runs {other} leaves and has never dug a metre of its own.' },
    { key: 'lamp', w: 2,
      when: ({ a, b, env }) => (a.extras.includes('beads') || a.head === 'lure') && !still(b) && !hunts(b)
        && sameGround(a, b) && metresOf(b) < metresOf(a) * 0.6 && !env.tags.has('manymoons'),
      t: '{Others} gather at its lights after dark. It eats a few and lets the rest stay.',
      mirror: 'After dark it gathers at the lights of {other}, and most of them live through the night.' },
    { key: 'compete', w: 2,
      when: ({ a, b }) => grazes(a) && grazes(b) && sameGround(a, b) && a.head !== b.head,
      t: 'It feeds on the same ground as {other}. The two have never mixed, and neither has ever won.',
      mirror: 'It shares its ground with {other} and takes the shorter growth, because it must.' },
    { key: 'sentry', w: 2,
      when: ({ a, b }) => a.head === 'stalks' && !still(b) && b.social && b.social.kind === 'herd' && sameGround(a, b) && !hunts(b),
      t: '{Others} feed close to it and lift their heads whenever it lifts its own.',
      mirror: 'It feeds close to {other} and trusts those eyes further than it trusts its own.' },
    { key: 'garden', w: 3,
      when: ({ a, b }) => a.extras.includes('garden') && grazes(b) && !buried(b) && (flies(b) || metresOf(b) > metresOf(a) * 0.4),
      t: 'The garden on its back is grazed by {others}, and it neither helps them nor stops them.',
      mirror: 'It grazes the garden on the back of {other}. It is the best feeding anywhere on this world.' },
    { key: 'spore', w: 2,
      when: ({ a, b }) => a.head === 'crest' && !still(a) && b.extras.includes('garden'),
      t: 'It carries the spores of the garden of {other} from one back to the next, and neither species could manage without the other.',
      mirror: 'The garden on its back is seeded by {other}, which carries the spores from one animal to the next.' },
    { key: 'mound', w: 2,
      when: ({ a, b }) => (a.loco === 'plough' || a.loco === 'arch') && b.head === 'beak' && !buried(b),
      t: 'The mound it pushes up is worked over by {others} before the {ground} has settled.',
      mirror: 'It works the mound {other} pushes up, and it gets there before the {ground} has settled.' },
    { key: 'shelter', w: 2,
      when: ({ a, b }) => a.extras.includes('plates') && metresOf(b) < metresOf(a) * 0.5 && !flies(b) && !still(b),
      t: '{Others} shelter under its plates when the weather turns, and it carries them without comment.',
      mirror: 'When the weather turns it gets in under the plates of {other} and waits it out.' },
    { key: 'mingle', w: 1,
      when: ({ a, b }) => a.social && b.social && a.social.kind === 'herd' && b.social.kind === 'herd' && !sameGround(a, b) && !still(a) && !still(b) && !flies(a) && !flies(b),
      t: 'Where its range meets the range of {other} the two herds move as one body, and split again at the edge of it.',
      mirror: 'Where its range meets the range of {other} the two herds mix, and every animal goes back to its own at the boundary.' },
  ];

  // ---------------------------------------------------------------- assembly
  function habitKey(G) {
    const m = G.move;
    if (G.loco === 'arch') return G.niche === 'beach' ? 'tide' : 'buried';
    if (G.loco === 'periscope' || G.loco === 'plough') return 'buried';
    if (G.loco === 'fins') return 'serene';
    if (G.loco === 'sac') return 'patient';
    if (m.turn > 2) return 'restless';
    if (G.head === 'lure' && m.pause >= 0.6) return 'ambush';
    if (G.head === 'mandibles' && m.pause >= 0.6) return 'strike';
    if (G.extras.includes('plates')) return 'armoured';
    if (m.pause >= 0.5 && G.loco !== 'serpent') return 'herd';
    return 'wary';
  }
  // The leading number of every one of these texts comes from bodyMetres(), so the ground scale
  // matches the lore.
  function sizeText(G, N) {
    const m = bodyMetres(G).metres;
    switch (G.loco) {
      case 'quad': return `${m} m at the shoulder`;
      case 'serpent': return `${m} m long`;
      case 'hexapod': return `${m} m long`;
      case 'sac': return `${m} m sac, ${round1(G.size * 3)} m of tendril`;
      case 'wings': return G.plan === 'swarm' ? `Each shard a hand wide, the swarm ${m} m` : `${m} m across`;
      case 'fins': return `${m} m`;
      case 'arch': return `${m} m exposed, far more below`;
      case 'periscope': return `${m} m of neck above the ${N.ground}`;
      case 'plough': return `${m} m, mostly under the ${N.ground}`;
      default: return `${m} m tall`;
    }
  }
  function tokensFor(G, N, env, world) {
    const day = Math.max(1, Math.round(env.dayHours || 24));
    const plant = env.plantWord || 'growth';
    return {
      ground: N.ground, world: world.designation,
      day: `${day} hours`, night: `${Math.max(1, Math.round(day / 2))} hours`,
      temp: `${env.tempC} °C`, grav: `${(env.gravity || 1).toFixed(2)} g`,
      moon: env.moonNames[0] || 'the moon', moons: L.num(env.moons || 0),
      plant, plants: plant + 's',
    };
  }

  // One species, everything except the relations. `used` carries the names already taken by this
  // world, so two species never share a name or a binomial.
  function describeOne(rng, G, env, world, used) {
    const seen = used.lines;
    const N = NICHE[G.niche];
    const tokens = tokensFor(G, N, env, world);
    const ctx = { G, env, tags: env.tags, world, still: still(G) };
    const say = (p, seen, strict) => { const e = L.line(rng, p, ctx, seen, strict); return e ? L.fill(e.t, tokens) : ''; };

    // name: an optional place word, an adjective, and a noun. The adjective is normally a part the
    // animal really has. One name in four takes its adjective from the world instead.
    const adjKeys = [...G.extras.filter((e) => e !== 'mounds' && e !== 'flukes'),
      ...(G.head !== 'none' ? [G.head] : []), ...(G.extras.includes('flukes') ? ['flukes'] : [])];
    const adjPool = adjKeys.length ? adjKeys : [G.plan === 'swarm' ? 'shard' : 'smooth'];
    // Prefer a word this world has not used. Two species called "lamp-flanked" read as one species.
    const freshAdj = adjPool.filter((k) => !used.words.has(ADJ[k]));
    const adjKey = L.pick(rng, freshAdj.length ? freshAdj : adjPool);
    const worldAdjs = L.candidates(WORLD_ADJ, ctx).filter((e) => !used.words.has(e.t));
    const useWorldAdj = worldAdjs.length && rng() < 0.25;
    const adj = useWorldAdj ? L.pick(rng, worldAdjs).t : ADJ[adjKey];
    used.words.add(adj);
    // The place word must not echo the adjective: "Cinder cinder worm" is not a name.
    const places = L.candidates(PLACE[G.niche], ctx).map((e) => e.t)
      .filter((p) => !p || (p !== adj && !adj.includes(p) && !p.includes(adj)));
    const nouns = G.plan === 'swarm' ? ['swarm', 'wheel'] : NOUN[G.loco];
    const freshNouns = nouns.filter((x) => !used.words.has(x));
    const name = L.unique((i) => {
      const place = i === 0 ? L.pick(rng, places) : i < 4 ? L.pick(rng, places.filter(Boolean).concat('')) : '';
      const noun = i < 2 && freshNouns.length ? freshNouns[0] : L.pick(rng, nouns);
      if (i < 2) used.words.add(noun);
      return cap(`${place ? place + ' ' : ''}${adj} ${noun}`);
    }, used.names, 8);
    const wEpi = L.choose(rng, WORLD_EPITHET, ctx);
    const latin = L.unique((i) => {
      if (i === 0) return `${GENUS[G.loco]} ${EPITHET[adjKey]}`;
      if (i === 1) return `${GENUS[G.loco]} ${N.epithet}`;
      return `${GENUS[G.loco]} ${wEpi ? wEpi.t : EPITHET[adjKey]}`;
    }, used.latin, 3);

    // the manner. A species that does not live in a herd cannot carry the herd line.
    let habit = habitKey(G);
    if (habit === 'herd' && G.social.kind !== 'herd') habit = 'wary';

    // the feature: a part that the name did not already use.
    const featureKeys = [...G.extras, ...(G.head !== 'none' ? [G.head] : [])]
      .filter((k) => k !== adjKey && FEATURE[k]);
    const featureKey = featureKeys.length ? L.pick(rng, featureKeys) : null;
    let featurePool = PLAIN_FEATURE;
    if (featureKey === 'mounds' && G.loco !== 'arch') featurePool = PLOUGH_MOUNDS[G.loco] || PLAIN_FEATURE;
    else if (featureKey) featurePool = FEATURE[featureKey];

    const parts = {
      origin: say(G.plan === 'swarm' ? SWARM_ORIGIN : ORIGIN[G.loco], seen),
      feature: say(featurePool, seen),
      habit: say(HABIT[habit], seen),
      // The three optional slots take a fresh line or nothing. trimStory() keeps two of them, so a
      // world with a plain sky reaches for the climate or the closing line instead of repeating.
      climate: say(CLIMATE, seen, true),
      sky: say(SKY, seen, true),
      social: '',
      synergy: '',
      close: say(CLOSE[env.type] || CLOSE.terran, seen, true),
    };

    // the sociality line
    const s = G.social;
    const sTokens = { ...tokens, n: L.num(s.n), spread: String(Math.round(s.spread)) };
    const sPool = s.kind === 'herd' ? (ctx.still ? HERD_STILL : HERD_STORY) : s.kind === 'pair' ? PAIR_STORY : ALONE_STORY;
    const sLine = L.line(rng, sPool, ctx, seen);
    parts.social = sLine ? L.fill(sLine.t, sTokens) : '';

    G.lore = {
      name, latin, habitat: N.habitat[G.cls], size: sizeText(G, N), diet: say(DIET, null) || 'Unknown',
      temperament: `${TEMPER[habit]}, ${socialTemper(s)}`,
      parts, tokens, story: '', plural: name.toLowerCase() + 's',
    };
  }

  // The order the parts are read in. assemble() drops the empty ones.
  const STORY_ORDER = ['origin', 'feature', 'habit', 'climate', 'sky', 'social', 'synergy', 'close'];
  // How many of the four optional parts a story keeps. Four core lines plus two optional ones give
  // a card that is read in one breath. A relation with another animal always takes one of the two.
  const EXTRA_SLOTS = 2;
  function trimStory(rng, G) {
    const parts = G.lore.parts;
    const keep = new Set(['origin', 'feature', 'habit', 'social']);
    if (parts.synergy) keep.add('synergy');
    const rest = ['climate', 'sky', 'close'].filter((k) => parts[k]);
    while (keep.size - 4 < EXTRA_SLOTS && rest.length) {
      keep.add(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
    }
    for (const k of STORY_ORDER) if (!keep.has(k)) parts[k] = '';
    // A filled token can land at the head of a part, so every part is capitalised here rather than
    // written capitalised, and a line stays usable in any slot.
    for (const k of STORY_ORDER) if (parts[k]) parts[k] = cap(parts[k]);
    G.lore.story = L.assemble(parts, STORY_ORDER);
  }

  // ---------------------------------------------------------------- the public entry points
  // describe() writes the lore of every species of a world. It runs late, after the globe build,
  // because the moons, the rings, and the natural activity are only known then. It reads no state
  // of its own: call it twice and the second call gives the same text for the same facts.
  // A relation names the other animal. {other} is the singular with its article, {others} the
  // plural, and the capitals are for the head of a sentence.
  function nameTokens(G) {
    const one = G.lore.name.toLowerCase(), many = G.lore.plural;
    return { other: 'the ' + one, Other: 'The ' + one, others: 'the ' + many, Others: 'The ' + many };
  }
  function describe(world, rng) {
    const env = L.makeEnv(world.env || { type: world.type });
    const list = world.species || [];
    const used = { names: new Set(), latin: new Set(), words: new Set(), lines: new Set() };
    for (const G of list) describeOne(rng, G, env, world, used);

    // the relations. Every pair is read once, in a fixed order.
    const links = L.relate(rng, list, RELATIONS, {
      maxPer: 1, chance: 0.75, ctxOf: (a, b) => ({ a, b, env }),
    });
    for (const { a, b, rule } of links) {
      a.lore.parts.synergy = L.fill(rule.t, { ...a.lore.tokens, ...nameTokens(b) });
      if (rule.mirror) b.lore.parts.synergy = L.fill(rule.mirror, { ...b.lore.tokens, ...nameTokens(a) });
    }
    for (const G of list) trimStory(rng, G);
    return list;
  }

  // ---------------------------------------------------------------- the species set of one world
  // This rolls the bodies only. The text comes later, from describe().
  function makeSpeciesSet(rng, type, world, P) {
    const W = WORLD_NICHES[type];
    const niches = W.niches.slice();
    const usedLoco = new Set();
    const list = [];
    for (let i = 0; i < W.count && niches.length; i++) {
      // keep the first two niches (the world's signature biomes), then pick the rest at random
      const niche = i < 2 ? niches.shift() : niches.splice(Math.floor(rng() * niches.length), 1)[0];
      const N = NICHE[niche];
      let cls = pick(rng, N.cls);
      if (type === 'gas') cls = 'air';
      if (i === 0 && type !== 'gas' && N.cls.includes('land')) cls = 'land'; // every world with ground gets at least one walker
      const force = type === 'gas' && i === 0 ? 'fins' : null; // a gas giant always has a whale
      const G = rollGenome(rng, type, niche, cls, usedLoco, !!P.floraColor, force);
      G.id = i;
      G.colors = rollColors(rng, P.faunaColor, i);
      list.push(G);
    }
    // The sociality rolls in a second pass, after every body exists, because a relation between
    // two species reads the sociality of both.
    for (const G of list) G.social = rollSocial(rng, G);
    return list;
  }

  self.Species = { makeSpeciesSet, describe, bodyMetres, NICHE, RELATIONS, RELATION_CONTRACT, POOLS: { ORIGIN, FEATURE, HABIT, CLIMATE, SKY, CLOSE, DIET, PLAIN_FEATURE, PLOUGH_MOUNDS, SWARM_ORIGIN, HERD_STORY, HERD_STILL, PAIR_STORY, ALONE_STORY, WORLD_ADJ, WORLD_EPITHET } };
})();
