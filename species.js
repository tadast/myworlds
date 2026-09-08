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
      jointed: loco === 'quad' ? rng() < 0.35 : rng() < 0.75,
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

  // ---------------------------------------------------------------- lore: modular sentences keyed by what the animal actually has
  const NOUN = {
    monopod: ['hopper', 'bounder'], biped: ['strider', 'stilter'], tripod: ['stalker', 'tripod'], quad: ['grazer', 'walker'], hexapod: ['crawler', 'creeper'],
    serpent: ['ribbon', 'slither'], sac: ['drifter', 'float'], wings: ['flitter', 'darter'], fins: ['whale', 'sky whale'], arch: ['worm', 'loop'],
    periscope: ['watcher', 'reed'], plough: ['keel', 'mole'],
  };
  const ADJ = {
    sail: 'sail-backed', spikes: 'thorn-backed', beads: 'lamp-flanked', tendrils: 'tendril', garden: 'moss-backed', plates: 'shell', tail: 'long-tailed',
    flukes: 'twin-fluked', antennae: 'feeler', mounds: 'tide', shard: 'shard', smooth: 'smooth-backed', lure: 'lantern', stalks: 'stalk-eyed', mandibles: 'jawed', beak: 'beaked', crest: 'crested', tusks: 'tusked',
  };
  const GENUS = {
    monopod: 'Saltator', biped: 'Velatrix', tripod: 'Tripus', quad: 'Gravipes', hexapod: 'Sexipes', serpent: 'Serpula', sac: 'Aerocyst', wings: 'Volucris',
    fins: 'Cetus', arch: 'Lumbricus', periscope: 'Speculator', plough: 'Fossor',
  };
  const EPITHET = {
    sail: 'velifer', spikes: 'spinosus', beads: 'lucifer', tendrils: 'filamentosus', garden: 'hortulanus', plates: 'loricatus', tail: 'caudatus', flukes: 'bifurcus',
    antennae: 'antennatus', mounds: 'aestus', shard: 'vitreus', smooth: 'glaber', lure: 'lucernarius', stalks: 'oculatus', mandibles: 'mandibularis', beak: 'rostratus', crest: 'cristatus', tusks: 'dentatus',
  };
  const ORIGIN = {
    monopod: ['It has one leg and no need for a second. The whole body is a spring, and it lands where it looks.', 'The foot is a pad of cartilage the size of a door. Each hop leaves a print that fills with water and stays for a season.'],
    biped: ['It walks on two stilts and never sits. The knees lock, and it sleeps standing, swaying a little in the wind.', 'The legs grow all its life. An old one stands twice the height of a young one and walks the same paths, slower.'],
    tripod: ['Three legs, no front and no back. It turns by choosing a new leg to lead, and it never has to look behind.', 'It stands perfectly still for hours on three thin legs, then moves so fast that the eye keeps the empty place.'],
    quad: ['It is heavy, patient, and mostly stomach. It walks the same loop its mother walked, and its young walk behind it in single file.', 'Four thick legs, a low body, no hurry. Nothing has ever made it run.'],
    hexapod: ['Six legs, and it never lifts more than three at once. It crosses loose ground without leaving a mark.', 'It creeps. A day of walking takes it as far as a strong wind would.'],
    serpent: ['It has no legs and no need for them. The body throws a wave from head to tail and the ground does the rest.', 'It moves like poured water, and it rests in a coil with the head raised.'],
    sac: ['Born as a wet knot on a cliff face, it inflates over a single night with gas from its own fermenting gut and lets go. It never lands again.', 'It is a bladder of warm gas with a mind somewhere in the wall. The wind decides where it goes, and it does not seem to object.'],
    wings: ['Each wing is a single stiff blade. It does not flap so much as row, and it turns by tilting the whole body.', 'It flies in a loose wheel of a dozen or more, and the wheel has a leader only in the sense that a whirlpool does.'],
    fins: ['It is mostly bladder, lifted by a warm gas it brews in a gut the size of a house. It sings through the belly, which glows with the song.', 'It swims through air the way its ancestors swam through water, and it has forgotten the difference.'],
    arch: ['Only the arch is ever seen. The rest runs under the {ground} in a loop that can be a kilometre long, and one animal can raise a dozen arches to breathe.', 'What shows above the {ground} is a breathing loop. The body below has never seen daylight and does not need to.'],
    periscope: ['It lives buried and raises the head on a long neck to look. When something looks back, the head goes down and does not come up for a day.', 'The neck is a periscope. The body under the {ground} is broad and blind and has not moved in years.'],
    plough: ['It swims through the {ground} a hand’s width down, and only the back shows, like a boat keel turned over.', 'It pushes a mound of {ground} ahead of it as it goes and eats what the mound turns up.'],
  };
  const SWARM_ORIGIN = 'Each shard is a separate animal, blind and nearly mindless. The core is not. It grows the shards from its own body and pays them in sugar to carry it from one patch of sun to the next.';
  const FEATURE = {
    sail: 'The sail is not for display. It is a living membrane threaded with vessels; on cold mornings it turns the sail broadside to the sun and steams.',
    spikes: 'The spikes glow faintly at night: bacteria it farms in the hollow tips and feeds with its own heat.',
    beads: 'The lamps along its flank pulse in a rhythm that changes with the season, and no two animals pulse alike.',
    tendrils: 'The tendrils are sticky, patient, and slightly warm. Anything that touches them is drawn in, slowly.',
    garden: 'Nothing grows on a young one. The garden comes with age: spores caught in the ridges of the back, then moss, then the small trees whose roots reach down into the animal’s fat.',
    plates: 'The plates are stone. It eats rock, and what it cannot digest it presses into its back, layer on layer, so an old one carries the geology of everywhere it has been.',
    tail: 'The tail is a counterweight and a rudder. Take it away and the animal walks in circles until it grows back.',
    flukes: 'The flukes beat once a minute. Each stroke moves it the length of its own body, and it never needs more.',
    antennae: 'The feelers taste the air. It knows the weather three days out and moves to high ground before the rain.',
    mounds: 'The mounds at either end are its breath: it pushes {ground} up as it draws air in and lets it settle as it exhales.',
    lure: 'The lantern is the only warm thing for miles, and every small creature knows it. The light pulses in a rhythm that matches a sleeping heartbeat.',
    stalks: 'The eye stalks watch two horizons at once. It has never been surprised.',
    mandibles: 'The jaws close once. Whatever they close on stays closed on.',
    beak: 'The beak is a chisel. It cracks seed cases, bark, and, when it must, the shells of its own kind.',
    tusks: 'The tusks are for digging, not for fighting. It has never been in a fight.',
    crest: 'The crest is a heat sink. When it runs hot the crest flushes bright, and the others slow down to let it cool.',
  };
  const PLOUGH_MOUNDS = { plough: 'The mound ahead of it is not dug. It is pushed, and it has not stopped pushing since it hatched.', periscope: 'The ring of {ground} around the neck is what it breathes out. Step inside it and the neck goes down.' };
  const HABIT = {
    herd: 'A herd walks in silence for days, then, on some signal no one has recorded, every animal lies down until the wind changes.',
    ambush: 'It waits. When the {ground} shivers around its feet it bends, quickly, and the light goes out for a moment.',
    strike: 'It waits. The strike is over before the shadow moves.',
    restless: 'It never rests. A wheel of them can circle the same tree for a month and then be gone in an hour.',
    patient: 'It rises at dawn on the warm air and settles at dusk, and it has been doing that, alone, for longer than the trees.',
    serene: 'The young are born in the air and never touch the ground. The old ones rise too high one day and do not come down.',
    tide: 'It rises with the tide and sinks with it. Stand on the {ground} at the turn and you can feel it move.',
    buried: 'It moves with the ground water. In a dry year it does not surface at all.',
    armoured: 'Nothing eats it. Nothing has found a way in.',
    wary: 'It keeps a distance from anything larger than itself and a longer distance from anything smaller.',
  };
  const CLOSE = {
    terran: ['It is older than the forest, and it will outlast it.', 'At dusk on {world} it is the loudest thing for miles.'],
    ocean: ['It has never seen land larger than an island, and it does not know there is any.', 'The people who named {world}, if there were any, never saw one up close.'],
    desert: ['It drinks once a year, when the fog comes in from the coast of {world}.', 'By noon it is the only thing on {world} still moving.'],
    ice: ['In the long dark of {world} it is one of the few things that moves.', 'It has never been warm, and does not miss it.'],
    lava: ['On {world} the ground is warm, and it has never known otherwise.', 'It walks the cooler ridges and waits for the flows to pass.'],
    exotic: ['Nothing on {world} is quite what it looks like, and this is no exception.', 'It may not be an animal at all.'],
    gas: ['The ones in the clouds of {world} have never seen ground and have no word for down.', 'It has crossed the storm belts of {world} more times than there are stars in its sky.'],
  };
  const TEMPER = { herd: 'Placid', ambush: 'Still, then sudden', strike: 'Still, then sudden', restless: 'Restless', patient: 'Patient', serene: 'Serene', tide: 'Unaware', buried: 'Unaware', armoured: 'Indifferent', wary: 'Wary' };
  // the sociality half of the manner text, appended to TEMPER
  const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
  const socialTemper = (s) => (s.kind === 'herd' ? `herds of ${NUM[s.n]}` : s.kind === 'pair' ? 'in pairs' : 'solitary');
  // one story sentence about the sociality. An arch and a periscope never travel, so their herd stays in one place.
  function socialStory(rng, G, N) {
    const s = G.social, still = G.cls === 'sub' && G.loco !== 'plough';
    if (s.kind === 'herd') {
      const spread = Math.round(s.spread);
      if (still) return `A herd of ${NUM[s.n]} shares one stretch of ${N.ground} about ${spread} metres across. None of them ever moves.`;
      return pick(rng, [
        `It moves in herds of ${NUM[s.n]}. The herd holds a ring about ${spread} metres across, and the young keep to the middle of it.`,
        `A herd of ${NUM[s.n]} feeds together and moves together over about ${spread} metres of ${N.ground}. One animal alone is a lost animal.`,
      ]);
    }
    if (s.kind === 'pair') {
      if (G.head === 'mandibles' || G.head === 'lure') return 'It hunts in pairs, and a pair holds together until one of the two dies.';
      return pick(rng, [
        'It lives in pairs. The two feed apart and rest together, and a pair keeps the same ground for years.',
        'It comes in twos. Neither one strays further than a call.',
      ]);
    }
    if (still) return `It keeps to itself. No two of them have been found in one stretch of ${N.ground}.`;
    return pick(rng, [
      'It keeps to itself. Two in one place is a fight, or a season of young.',
      'It lives alone, and meets its own kind twice: once at birth, once to breed.',
    ]);
  }

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
  function dietText(G, N) {
    const sub = G.cls === 'sub', mineral = ['dune', 'ash', 'snow'].includes(G.niche);
    if (G.extras.includes('plates')) return 'Minerals licked from the rock';
    if (sub && G.head !== 'lure') return `Filters the wet ${N.ground}`;
    switch (G.head) {
      case 'lure': return 'Anything drawn to the light';
      case 'mandibles': return G.cls === 'air' ? 'Smaller flyers, taken on the wing' : 'Small creatures, taken at dusk';
      case 'beak': return mineral ? 'Seed cases and the odd shell' : 'Seed heads and hard fruit';
      case 'stalks': return mineral ? 'Lichen scraped from the rock' : G.niche === 'forest' ? 'Grazed from the low branches' : 'Grazed from the tops of the grass';
      case 'tusks': return 'Roots and leaf litter';
      case 'crest': return 'Airborne spores';
    }
    if (G.cls === 'air') return G.extras.includes('tendrils') ? 'Airborne spores and whatever the tendrils catch' : 'Cloud plankton and rain';
    return mineral ? 'Minerals licked from the rock' : 'Leaf litter and fallen fruit';
  }
  // The leading number of every one of these texts comes from bodyMetres(), so the ground scale matches the lore.
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
  function makeLore(rng, G, type, world, usedNames, usedLatin) {
    const N = NICHE[G.niche];
    const fill = (s) => s.replace(/\{ground\}/g, N.ground).replace(/\{world\}/g, world.designation);
    // name: [place] adjective noun, the adjective taken from a part the animal really has
    const adjKeys = [...G.extras.filter((e) => e !== 'mounds' && e !== 'flukes'), ...(G.head !== 'none' ? [G.head] : []), ...(G.extras.includes('flukes') ? ['flukes'] : [])];
    const adjKey = adjKeys.length ? pick(rng, adjKeys) : G.plan === 'swarm' ? 'shard' : 'smooth';
    let noun = G.plan === 'swarm' ? pick(rng, ['swarm', 'wheel']) : pick(rng, NOUN[G.loco]);
    let name, tries = 0;
    do {
      const place = tries === 0 ? pick(rng, N.place) : pick(rng, N.place.filter(Boolean));
      name = cap(`${place ? place + ' ' : ''}${ADJ[adjKey]} ${noun}`);
      if (++tries > 3) noun = pick(rng, NOUN[G.loco]);
    } while (usedNames.has(name) && tries < 8);
    usedNames.add(name);
    let latin = `${GENUS[G.loco]} ${EPITHET[adjKey]}`;
    if (usedLatin.has(latin)) latin = `${GENUS[G.loco]} ${N.epithet}`;
    usedLatin.add(latin);
    const habit = habitKey(G);
    const featureKeys = [...G.extras, ...(G.head !== 'none' ? [G.head] : [])].filter((k) => k !== adjKey && FEATURE[k]);
    const featureKey = featureKeys.length ? pick(rng, featureKeys) : adjKey;
    const feature = !FEATURE[featureKey] ? FEATURE.beads.replace('The lamps along its flank', 'Its skin').replace('pulse in a rhythm that changes', 'changes colour in a rhythm that shifts') : featureKey === 'mounds' && G.loco !== 'arch' ? PLOUGH_MOUNDS[G.loco] : FEATURE[featureKey];
    const origin = G.plan === 'swarm' ? SWARM_ORIGIN : pick(rng, ORIGIN[G.loco]);
    const story = [origin, feature, HABIT[habit], rng() < 0.65 ? pick(rng, CLOSE[type]) : ''].filter(Boolean).map(fill).join(' ');
    return { name, latin, habitat: N.habitat[G.cls], size: sizeText(G, N), diet: dietText(G, N), temperament: TEMPER[habit], story, plural: name.toLowerCase() + 's' };
  }

  // Write the sociality into the lore. This runs after every species has its lore, so it must not
  // roll anything that the earlier text depends on.
  // A solitary or paired species loses the herd manner, because the herd sentence would contradict the gene.
  function applySocial(rng, G, world) {
    const N = NICHE[G.niche];
    const fill = (s) => s.replace(/\{ground\}/g, N.ground).replace(/\{world\}/g, world.designation);
    const habit = habitKey(G);
    const key = habit === 'herd' && G.social.kind !== 'herd' ? 'wary' : habit;
    if (key !== habit) G.lore.story = G.lore.story.replace(fill(HABIT[habit]), fill(HABIT[key]));
    G.lore.temperament = `${TEMPER[key]}, ${socialTemper(G.social)}`;
    G.lore.story += ' ' + socialStory(rng, G, N);
  }

  // ---------------------------------------------------------------- the species set of one world
  function makeSpeciesSet(rng, type, world, P) {
    const W = WORLD_NICHES[type];
    const niches = W.niches.slice();
    const usedLoco = new Set(), usedNames = new Set(), usedLatin = new Set();
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
      G.lore = makeLore(rng, G, type, world, usedNames, usedLatin);
      list.push(G);
    }
    // The sociality rolls last, in a second pass. Nothing before it moves in the random stream,
    // so the names, the sizes, and the stories of a seed stay what they were.
    for (const G of list) { G.social = rollSocial(rng, G); applySocial(rng, G, world); }
    return list;
  }

  self.Species = { makeSpeciesSet, bodyMetres, NICHE };
})();
