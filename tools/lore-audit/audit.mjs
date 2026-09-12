// Reviews every lore permutation without a browser.
//
//   node tools/lore-audit/audit.mjs            every permutation, report only
//   node tools/lore-audit/audit.mjs --show 12  also print 12 sample stories
//   node tools/lore-audit/audit.mjs --seeds 40 also run 40 real worlds through worker.js
//
// Five checks run over the text.
//
// 1. Coverage. Every pool must offer at least one line for every world it can be reached from.
//    An empty pool would drop a sentence, and a slot that is empty on one planet and full on the
//    next is the kind of hole this catches.
// 2. Reachability. The other side of the same coin: a line that no world in the sweep can reach is
//    dead text, usually a gate that names two tags no planet carries together.
// 3. The lexicon. A word that claims a fact about the world may only appear where the world has
//    that fact. "rain" needs liquid water, "tide" needs a moon and a sea, "bark" needs a tree.
//    Every rule below is a claim the text makes; the gate on the line has to back it up.
// 4. Relations. A relation names a second animal, so its sentence has to fit that animal's body
//    and its habits. A line about gathering at a light must not reach a blind burrower, and a line
//    about following the feet of a herd must not reach a flyer. RELATION_CONTRACT states what each
//    rule needs of each side, and the sweep runs every rule against every pair of genome shapes.
// 5. Diet exclusivity, and, with --seeds, whole stories from real generated worlds.
//
// The world grid is not written here. worker.js exports self.PLANET_RANGES, so the sweep cannot
// drift from the ranges the generator actually rolls.
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.self = globalThis;
require(path.join(root, 'lore.js'));
require(path.join(root, 'species.js'));
// worker.js is a classic worker script, not a module. It is evaluated here in this scope so the
// sweep can read PLANET_RANGES and FLORA_LORE, and so --seeds can call generate(). Nothing runs
// until it is called; the file is definitions down to the onmessage handler at the end.
globalThis.importScripts = () => {};
globalThis.postMessage = () => {};
new Function('self', readFileSync(path.join(root, 'worker.js'), 'utf8') + '\n;self.__generate = generate;')(globalThis);
const { Lore, Species, PLANET_RANGES, FLORA_LORE } = globalThis;

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? dflt : Number(process.argv[i + 1]);
};
const SHOW = arg('show', 0);
const SEEDS = arg('seeds', 0);

// ---------------------------------------------------------------- the worlds to test
// Every value a world can reach, from worker.js. The grid is the product of them, so a line gated
// on "frozen highgrav longday" is reached if any world can reach it.
const { TEMP_BY_TYPE: TYPE_TEMP, LAND_BY_TYPE: LAND, FLORA_BY_TYPE: TYPE_FLORA, FLORA_DENSITY_BY_TYPE: FLORA_DENSITY } = PLANET_RANGES;
const ACTIVITY = [null, 'volcano', 'geyser', 'fissure', 'aurora', 'lightning'];
const floraTagsOf = (kinds) => kinds.map((k) => FLORA_LORE[k].tag);
const plantWordOf = (kinds) => (kinds.length ? FLORA_LORE[kinds[0]].word : null);

function* worlds() {
  for (const type of Object.keys(TYPE_TEMP)) {
    const gas = type === 'gas';
    for (const tempC of TYPE_TEMP[type]) {
      for (const gravity of gas ? [0.9, 2.6] : [0.4, 1.0, 1.85]) {
        for (const dayHours of gas ? [8, 16] : [14, 30, 60]) {
          for (const moons of [0, 1, 2, 4]) {
            for (const rings of [false, true]) {
              for (const land of LAND[type]) {
                for (const activity of ACTIVITY) {
                  yield {
                    type, tempC, gravity, dayHours, moons, rings, land, activity,
                    radiusKm: gas ? 50000 : 6000, moonNames: ['Kaeri', 'Tovel', 'Miqua', 'Ysdra'].slice(0, moons),
                    floraTags: floraTagsOf(TYPE_FLORA[type]), plantWord: plantWordOf(TYPE_FLORA[type]),
                    floraDensity: FLORA_DENSITY[type],
                  };
                }
              }
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------- the lexicon
// word -> the gate the world must satisfy for the word to be honest.
const LEXICON = [
  [/\brain(s|ed|ing)?\b/i, 'rainy'],
  [/\btides?\b|\btidal\b/i, 'tides'],
  [/\bmoons?\b/i, 'moonlit'],
  [/\bring light\b|\bthe ring throws\b|\bthe ring cuts\b/i, 'ringed'],
  [/\btrees?\b|\bbark\b|\bbranch(es)?\b|\bleaf\b|\bthe leaves\b|\bforest\b|\bwood\b/i, 'woody'],
  [/\bgrass\b/i, 'woody|fungal|cactus'],
  [/\bspores?\b/i, 'flora'],
  [/\bcrystals?\b|\bspires?\b/i, 'crystalflora'],
  [/\bcactus\b|\bcacti\b/i, 'cactus'],
  [/\bcaps?\b|\bmushrooms?\b/i, 'fungal'],
  [/\bsnow\b|\bfrost\b|\bthaw\b|\bthe ice\b|\bfrozen crust\b/i, 'frozen|cold'],
  // Water the world supplies, not water the animal is made of. A simile ("like poured water") and
  // an animal's own wet tissue are true anywhere; a drink, a fog, and a shallows are not.
  [/\bdrinks?\b|\bthe shallows\b|\bfog\b|\bground water\b|\bopen water\b|\bstanding water\b|\bsteams\b|\bthe wet\b/i, 'waterliquid'],
  [/\bcliffs?\b|\bthe plain\b|\bhigh ground\b/i, '!noground'],
  [/\bthe vents?\b|\bthe flows?\b|\bash\b/i, 'volcanic|geysers|molten|lava'],
  [/\bbolt\b|\bthe charge\b|\bstorm belts?\b/i, 'stormy|gas'],
];
// An exemption relaxes ONE lexicon rule, not the whole sentence. A skip that applied to the whole
// text let any line that happened to contain a creature name past every rule. Each entry names the
// gate it relaxes and the phrase that earns the exemption: "sky whale" is a name, not a claim about
// water, and a sentence that denies a moon is allowed to say the word.
const LEX_SKIP = [
  { gate: 'waterliquid', when: /sky whale/i },
  { gate: 'moonlit', when: /\bno moon\b|\bnothing crosses the sky\b/i },
];

function lexCheck(text, tags) {
  const bad = [];
  for (const [re, gate] of LEXICON) {
    if (!re.test(text)) continue;
    if (LEX_SKIP.some((s) => s.gate === gate && s.when.test(text))) continue;
    if (!Lore.matchTags(Lore.parseGate(gate), tags)) bad.push({ word: re.source, gate });
  }
  return bad;
}

// ---------------------------------------------------------------- pass 1: pool coverage
// Every pool is asked, for every world and every genome shape that can reach it, whether it has
// at least one line. `reach` says which genomes may read the pool at all.
const P = Species.POOLS;
const LOCOS = ['monopod', 'biped', 'tripod', 'quad', 'hexapod', 'serpent', 'sac', 'wings', 'fins', 'arch', 'periscope', 'plough'];
const HEADS = ['beak', 'stalks', 'crest', 'mandibles', 'tusks', 'lure', 'none'];
const CLASSES = { monopod: 'land', biped: 'land', tripod: 'land', quad: 'land', hexapod: 'land', serpent: 'land', sac: 'air', wings: 'air', fins: 'air', arch: 'sub', periscope: 'sub', plough: 'sub' };
const EXTRAS = ['sail', 'spikes', 'beads', 'tendrils', 'garden', 'plates', 'tail', 'flukes', 'antennae', 'mounds'];
const NICHES = Object.keys(Species.NICHE);

let checked = 0;
// Each map is keyed by the problem itself, so the same line on ten thousand worlds is one entry.
// The value keeps one example world and the count.
const holeMap = new Map(), lexMap = new Map(), tokenMap = new Map();
const note = (map, key, example) => {
  const e = map.get(key);
  if (e) e.n++;
  else map.set(key, { n: 1, example });
};
const holes = { push: (x) => note(holeMap, String(x).split(' — ')[0], String(x)) };
const lexHits = { push: (x) => note(lexMap, String(x).split('\n')[0].split(' — ')[0] + '\n' + String(x).split('\n')[1], String(x)) };
const tokenHits = { push: (x) => note(tokenMap, String(x), String(x)) };
const sampleStories = [];
const seenLine = new Set();

function fakeWorld(f) {
  return { designation: 'AUD-1234 Prime', type: f.type, env: f };
}
function genome(loco, head, extra, niche, plan, social) {
  return {
    cls: CLASSES[loco], niche, loco, plan: plan || 'blob', head, extras: extra ? [extra] : [],
    size: 1.4, move: { turn: 1, pause: 0.5 },
    social: { kind: social || 'herd', n: 6, spread: 20 },
    id: 0, colors: {},
  };
}
// A line may test the class, the head, the parts, and the sociality gene. Coverage has to hold for
// every one of those, so the sweep below walks them rather than testing one representative animal.
const SOC = ['solitary', 'pair', 'herd'];
const CLS_LOCO = { land: 'quad', air: 'wings', sub: 'arch' };

function auditPools(env, f) {
  const tags = env.tags;
  const base = { env, tags, world: fakeWorld(f) };
  const need = (pool, ctx, label) => {
    checked++;
    const c = Lore.candidates(pool, ctx);
    if (!c.length) holes.push(`${label} — ${f.type} [${[...tags].join(' ')}]`);
    return c;
  };
  for (const social of SOC) {
    for (const [cls, loco] of Object.entries(CLS_LOCO)) {
      const G = genome(loco, 'beak', '', NICHES[0], null, social);
      const ctx = { ...base, G, still: cls === 'sub' };
      need(P.CLIMATE, ctx, `CLIMATE.${cls}.${social}`);
      need(P.CLOSE[f.type], ctx, 'CLOSE.' + f.type);
      need(P.PLAIN_FEATURE, ctx, 'PLAIN_FEATURE');
      for (const k of Object.keys(P.FEATURE)) need(P.FEATURE[k], ctx, `FEATURE.${k}.${social}`);
      for (const k of Object.keys(P.HABIT)) need(P.HABIT[k], ctx, `HABIT.${k}.${social}`);
      for (const k of Object.keys(P.PLOUGH_MOUNDS)) need(P.PLOUGH_MOUNDS[k], ctx, 'PLOUGH_MOUNDS.' + k);
    }
    for (const loco of LOCOS) {
      const ctx = { ...base, G: genome(loco, 'beak', '', NICHES[0], null, social) };
      need(P.ORIGIN[loco], ctx, `ORIGIN.${loco}.${social}`);
    }
    need(P.SWARM_ORIGIN, { ...base, G: genome('wings', 'beak', '', 'meadow', 'swarm', social) }, 'SWARM_ORIGIN');
  }
  // the sociality lines, each against the gene it belongs to
  need(P.HERD_STORY, { ...base, G: genome('quad', 'beak', '', 'meadow', null, 'herd'), still: false }, 'HERD_STORY');
  need(P.HERD_STILL, { ...base, G: genome('arch', 'none', '', 'meadow', null, 'herd'), still: true }, 'HERD_STILL');
  need(P.PAIR_STORY, { ...base, G: genome('quad', 'beak', '', 'meadow', null, 'pair') }, 'PAIR_STORY');
  for (const still of [false, true]) {
    need(P.ALONE_STORY, { ...base, G: genome('quad', 'beak', '', 'meadow', null, 'solitary'), still }, 'ALONE_STORY');
  }
  // the diet pool must answer for every head, every class, and every plates state
  for (const loco of LOCOS) {
    for (const head of HEADS) {
      for (const extra of ['', 'plates', 'tendrils']) {
        const c = need(P.DIET, { ...base, G: genome(loco, head, extra, NICHES[0]) }, `DIET ${loco}/${head}/${extra || '-'}`);
        // One animal, one source of food. Two sources in the candidate set means a weighted roll
        // could hand a predator leaf litter.
        const srcs = [...new Set(c.map((e) => e.src))];
        if (srcs.length > 1) holes.push(`DIET ${loco}/${head}/${extra || '-'} offers ${srcs.join(' and ')} — ${f.type}`);
      }
    }
  }
}

// ---------------------------------------------------------------- pass 2: every line against every world
// reachable holds every line some world in the sweep let through. A line in allLines and not in
// reachable is dead text: a gate that names a pair of tags no planet carries together.
const reachable = new Set(), allLines = new Map();
function auditLines(env, f) {
  const tags = env.tags;
  const all = [];
  const add = (pool, label) => { for (const e of pool) all.push([e, label]); };
  add(P.CLIMATE, 'CLIMATE'); add(P.SKY, 'SKY'); add(P.PLAIN_FEATURE, 'PLAIN_FEATURE');
  add(P.SWARM_ORIGIN, 'SWARM_ORIGIN'); add(P.HERD_STORY, 'HERD_STORY'); add(P.HERD_STILL, 'HERD_STILL');
  add(P.PAIR_STORY, 'PAIR_STORY'); add(P.ALONE_STORY, 'ALONE_STORY');
  add(P.WORLD_ADJ, 'WORLD_ADJ'); add(P.WORLD_EPITHET, 'WORLD_EPITHET');
  for (const k of Object.keys(P.ORIGIN)) add(P.ORIGIN[k], 'ORIGIN.' + k);
  for (const k of Object.keys(P.FEATURE)) add(P.FEATURE[k], 'FEATURE.' + k);
  for (const k of Object.keys(P.HABIT)) add(P.HABIT[k], 'HABIT.' + k);
  for (const k of Object.keys(P.CLOSE)) add(P.CLOSE[k], 'CLOSE.' + k);
  for (const k of Object.keys(P.PLOUGH_MOUNDS)) add(P.PLOUGH_MOUNDS[k], 'PLOUGH_MOUNDS.' + k);
  add(P.DIET, 'DIET');
  for (const [e, label] of all) {
    if (!allLines.has(e)) allLines.set(e, label);
    if (e.tags && !Lore.matchTags(Lore.gateOf(e), tags)) continue;
    if (label.startsWith('CLOSE.') && label !== 'CLOSE.' + f.type) continue;
    reachable.add(e);
    const key = label + '|' + e.t + '|' + [...tags].sort().join(',');
    if (seenLine.has(key)) continue;
    seenLine.add(key);
    for (const bad of lexCheck(e.t, tags)) lexHits.push(`${label}: /${bad.word}/ needs "${bad.gate}" — ${f.type} [${[...tags].join(' ')}]\n    ${e.t}`);
  }
}

// ---------------------------------------------------------------- pass 4: relations
// A relation writes a sentence into two stories, so its predicate has to keep the rule away from
// an animal the sentence does not fit. Every rule is run against every pair of genome shapes, and
// a pair the predicate accepts must satisfy RELATION_CONTRACT. This is the check that catches a
// blind burrower gathering at a light, or a flyer whose feet turn up food.
const CONTRACT_TEST = {
  mobile: (G) => !(G.cls === 'sub' && G.loco !== 'plough'),
  walks: (G) => G.cls === 'land',
  flies: (G) => G.cls === 'air',
  tunnels: (G) => G.loco === 'plough' || G.loco === 'arch',
  notburied: (G) => G.cls !== 'sub',
};
// One genome per shape that can differ to a relation: the locomotion, the head, the one part the
// rules read, and the sociality. The product is the population a rule has to survive.
function* relationShapes() {
  for (const loco of LOCOS) {
    for (const head of ['beak', 'stalks', 'mandibles', 'crest', 'none']) {
      for (const extra of ['', 'beads', 'garden', 'plates']) {
        for (const social of SOC) {
          // Two niches, because a rule may ask for the same ground or for different ground.
          for (const niche of [NICHES[0], NICHES[1]]) yield genome(loco, head, extra, niche, null, social);
        }
      }
    }
  }
}
function auditRelations(envs) {
  const out = [];
  for (const r of Species.RELATIONS) {
    for (const t of [r.t, r.mirror].filter(Boolean)) {
      for (const tok of Lore.tokensIn(t)) {
        if (!['other', 'Other', 'others', 'Others', 'ground', 'world'].includes(tok)) {
          out.push(`${r.key}: line uses {${tok}}, which relations do not fill:\n    ${t}`);
        }
      }
    }
    const contract = Species.RELATION_CONTRACT[r.key];
    if (!contract) { out.push(`${r.key}: no row in RELATION_CONTRACT`); continue; }
    // A mirror line writes into the second animal's story, so the row has to say what that animal
    // must be — an empty list is the way to say "the mirror line fits anything", on purpose.
    if (r.mirror && !contract.b) out.push(`${r.key}: has a mirror line but its contract row has no b`);
  }
  const shapes = [...relationShapes()];
  const pairs = shapes.length * (shapes.length - 1);
  for (const r of Species.RELATIONS) {
    const contract = Species.RELATION_CONTRACT[r.key] || {};
    let best = 0;
    // Every sky, because a rule may be switched off by the tag set. It is only unreachable when
    // no sky and no pair can reach it.
    for (const env of envs) {
      let fired = 0;
      for (const a of shapes) {
        for (const b of shapes) {
          if (a === b) continue;
          let ok;
          try { ok = r.when({ a, b, env }); } catch (e) { out.push(`${r.key}: when() threw — ${e.message}`); return out; }
          if (!ok) continue;
          fired++;
          for (const [side, G] of [['a', a], ['b', b]]) {
            for (const need of contract[side] || []) {
              if (!CONTRACT_TEST[need](G)) {
                out.push(`${r.key}: accepts ${side}=${G.cls}/${G.loco}/${G.head}, which is not "${need}"`);
              }
            }
          }
        }
      }
      best = Math.max(best, fired);
    }
    // A rule no pair can reach is dead. A rule that almost every pair reaches crowds the others
    // out: relate() takes the first rule that fits a pair, so a permissive rule starves the rest.
    const share = best / pairs;
    if (best === 0) out.push(`${r.key}: no pair of genome shapes can reach it under any sky`);
    else if (share > 0.25) out.push(`${r.key}: fits ${(share * 100).toFixed(0)}% of all pairs, which will crowd the rarer rules out`);
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------- pass 5: whole stories

let n = 0;
const tagsSeen = new Set();
for (const f of worlds()) {
  const env = Lore.makeEnv(f);
  for (const t of env.tags) tagsSeen.add(t);
  auditPools(env, f);
  auditLines(env, f);
  n++;
}

// ---------------------------------------------------------------- pass 4: real worlds through the worker
let storyStats = null;
if (SEEDS > 0) {
  const lens = [];
  for (let i = 0; i < SEEDS; i++) {
    const seed = 'audit-' + i;
    let world = null;
    globalThis.postMessage = (m) => { if (m.type === 'done') world = m.result.world; };
    try { globalThis.__generate(seed, { detail: 24, maxFlora: 200, maxFauna: 40 }); } catch (e) { holes.push(`seed ${seed}: ${e.message}`); continue; }
    if (!world) continue;
    const env = Lore.makeEnv(world.env);
    for (const G of world.species) {
      const s = G.lore.story;
      lens.push(s.length);
      for (const tok of Lore.tokensIn(s)) tokenHits.push(`seed ${seed} ${G.lore.name}: unfilled {${tok}}`);
      for (const bad of lexCheck(s, env.tags)) lexHits.push(`seed ${seed} ${G.lore.name}: /${bad.word}/ needs "${bad.gate}" [${[...env.tags].join(' ')}]\n    ${s}`);
      // A mobility claim must match the body. A burrower that is not a plough never travels, and
      // its own sociality line says so, so a sentence that has it walking contradicts the story it
      // sits in. This is the check that catches a new line written without a roams() gate.
      if (G.cls === 'sub' && G.loco !== 'plough'
        && /\bit walks away\b|\bit is moving\b|\bit travels\b|\bmoves to high ground\b|\bit follows\b|\bit crosses\b|\bcannot walk away\b/.test(s)) {
        holes.push(`seed ${seed} ${G.lore.name}: claims it travels, but it is a ${G.loco} that never moves`);
      }
      // A sociality claim in the prose must match G.social, the gene the ground groups run on.
      const kind = G.social.kind;
      if (/\balone\b/.test(s) && !/One animal alone is a lost animal/.test(s) && kind !== 'solitary') {
        holes.push(`seed ${seed} ${G.lore.name}: says "alone" but lives in a ${kind}`);
      }
      if (/\bthe others\b|\bwheel of them\b|\bwhole line of them\b|\bloose wheel\b/.test(s) && kind === 'solitary') {
        holes.push(`seed ${seed} ${G.lore.name}: claims a group but is solitary`);
      }
      const sentences = s.split(/(?<=[.!?]) /).map((x) => x.trim()).filter(Boolean);
      const dup = sentences.filter((x, j) => sentences.indexOf(x) !== j);
      if (dup.length) holes.push(`seed ${seed} ${G.lore.name}: repeated sentence — ${dup[0]}`);
      if (sampleStories.length < SHOW) sampleStories.push({ seed, world, G });
    }
  }
  lens.sort((a, b) => a - b);
  storyStats = lens.length ? { n: lens.length, min: lens[0], median: lens[lens.length >> 1], max: lens[lens.length - 1] } : null;
}

// ---------------------------------------------------------------- report
// Two skies, because one rule reads the tag set: run it with moons and without.
const sky = (moons) => Lore.makeEnv({ type: 'terran', tempC: 12, gravity: 1, dayHours: 24, moons, land: 0.3, floraTags: ['woody'], floraDensity: 2 });
const relIssues = auditRelations([sky(0), sky(4)]);
console.log(`worlds tested        ${n}`);
console.log(`pool lookups         ${checked}`);
console.log(`distinct world tags  ${[...tagsSeen].sort().join(' ')}`);
console.log('');
const report = (title, map) => {
  console.log(`${title}: ${map.size} distinct`);
  for (const [, v] of map) console.log('  - ' + v.example + `\n      (${v.n} worlds)`);
};
const dead = [...allLines].filter(([e]) => !reachable.has(e));
report('empty pools', holeMap);
console.log(`unreachable lines: ${dead.length}`);
for (const [e, label] of dead) console.log(`  - ${label} [${e.tags || ''}]\n    ${e.t}`);
report('lexicon conflicts', lexMap);
report('unfilled tokens', tokenMap);
console.log(`relation issues: ${relIssues.length}`);
for (const x of relIssues) console.log('  - ' + x);
if (storyStats) console.log(`\nstory length (characters): min ${storyStats.min}, median ${storyStats.median}, max ${storyStats.max}, over ${storyStats.n} species`);

for (const { seed, world, G } of sampleStories) {
  const l = G.lore;
  console.log(`\n--- ${seed} · ${world.type} · ${world.designation} · ${world.stats.temp} · ${world.stats.gravity} · ${world.stats.day} · ${world.moons.length} moons${world.rings ? ' · ring' : ''}${world.activity ? ' · ' + world.activity.kind : ''}`);
  console.log(`${l.name} (${l.latin})`);
  console.log(`${l.habitat} · ${l.size} · ${l.diet} · ${l.temperament}`);
  console.log(l.story);
}
const fail = holeMap.size + lexMap.size + tokenMap.size + relIssues.length + dead.length;
process.exit(fail ? 1 : 0);
