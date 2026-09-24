// Reviews every lore permutation without a browser.
//
//   node tools/lore-audit/audit.mjs            every permutation, report only
//   node tools/lore-audit/audit.mjs --show 12  also print 12 sample stories
//   node tools/lore-audit/audit.mjs --seeds 40 also run 40 real worlds through generate.js
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
// The world grid is not written here. world-types.js holds the ranges generate.js rolls in, so the
// sweep cannot drift from the ranges the generator actually rolls.
import { Lore } from '../../lore.js';
import { Species } from '../../species.js';
import { FloraLore, FLORA_LORE } from '../../flora-lore.js';
import { SourceLore } from '../../source-lore.js';
import * as generate from '../../generate.js';
import {
  TEMP_BY_TYPE as TYPE_TEMP, LAND_BY_TYPE as LAND, FLORA_BY_TYPE as TYPE_FLORA, FLORA_DENSITY_BY_TYPE as FLORA_DENSITY,
} from '../../world-types.js';

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? dflt : Number(process.argv[i + 1]);
};
const SHOW = arg('show', 0);
const SEEDS = arg('seeds', 0);

// ---------------------------------------------------------------- the worlds to test
// Every value a world can reach, from world-types.js. The grid is the product of them, so a line
// gated on "frozen highgrav longday" is reached if any world can reach it.
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
  // `turf` is the flora tag of the tuft kind, which is the ground cover of a patch. Issue 24.
  [/\bgrass\b/i, 'woody|fungal|cactus|turf'],
  [/\bspores?\b/i, 'flora'],
  [/\bcrystals?\b|\bspires?\b/i, 'crystalflora'],
  [/\bcactus\b|\bcacti\b/i, 'cactus'],
  [/\bcaps?\b|\bmushrooms?\b/i, 'fungal'],
  // `coldground` is the flora tag of a snow or tundra biome. It is the claim that the ground at
  // this site freezes, which is what a thaw needs, so it stands beside the two world tags. A warm
  // planet can hold a frozen site; the site is the fact the plant lives with. Issue 24.
  [/\bsnow\b|\bfrost\b|\bthaw\b|\bthe ice\b|\bfrozen crust\b/i, 'frozen|cold|coldground'],
  // Water the world supplies, not water the animal is made of. A simile ("like poured water") and
  // an animal's own wet tissue are true anywhere; a drink, a fog, and a shallows are not.
  [/\bdrinks?\b|\bthe shallows\b|\bfog\b|\bground water\b|\bopen water\b|\bstanding water\b|\bsteams\b|\bthe wet\b/i, 'waterliquid'],
  [/\bcliffs?\b|\bthe plain\b|\bhigh ground\b/i, '!noground'],
  [/\bthe vents?\b|\bthe flows?\b|\bash\b/i, 'volcanic|geysers|molten|lava'],
  [/\bbolt\b|\bthe charge\b|\bstorm belts?\b/i, 'stormy|gas'],
  // Issue 34. The log of the source makes five claims the rules above do not name. No fauna line
  // and no flora line holds any of these words today, so the five rules only bind the new text.
  // `polarnight` is a tag of the source and not of the planet; see sourceTags() in source-lore.js.
  [/\baurorae?\b/i, 'auroral'],
  [/\bgeysers?\b/i, 'geysers'],
  [/\blightning\b/i, 'stormy'],
  [/\bthe ring overhead\b/i, 'ringed'],
  // A sea. The log of the source walks to one, watches a tide in one, and tastes the salt of one,
  // so the word has to mean that this world really carries an ocean. `hasocean` says nothing about
  // the state of that ocean, which is why a line about a liquid sea also takes `waterliquid`.
  [/\bthe sea\b|\bthe coast\b/i, 'hasocean'],
  // A sun that does not rise. The lean of the axis is not enough on its own: the claim also needs
  // the latitude of the source, which is what `polarnight` carries. Every phrasing the log gates
  // on that tag is named here, so a new line cannot state the claim behind a weaker gate. The
  // species pool says "cannot come back up" of a fall, and \bnot come back up\b does not match it.
  [/\bpolar night\b|\bstop rising\b|\bwill not come back up\b|\bunder the horizon for\b|\bflat circle\b|\bround the horizon\b|\bnot come back inside\b/i, 'polarnight'],
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
// A locomotion added to species.js belongs in both lists below, or the sweep never asks its pools
// a question, and never runs a relation rule that names it against a pair.
const LOCOS = ['monopod', 'biped', 'tripod', 'quad', 'hexapod', 'serpent', 'sac', 'wings', 'fins', 'arch', 'periscope', 'plough',
  'roller', 'flow', 'slinger'];   // issue 28
const HEADS = ['beak', 'stalks', 'crest', 'mandibles', 'tusks', 'lure', 'none'];
const CLASSES = { monopod: 'land', biped: 'land', tripod: 'land', quad: 'land', hexapod: 'land', serpent: 'land', sac: 'air', wings: 'air', fins: 'air', arch: 'sub', periscope: 'sub', plough: 'sub',
  roller: 'land', flow: 'land', slinger: 'land' };   // issue 28
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
// One entry per distinct sky the FLORA can tell apart. The flora sweep is already the sky times
// sixteen kinds times ten biomes, so it cannot run over all 11,616 worlds. It does not have to:
// two worlds that agree on every tag a flora gate or a lexicon rule names are the same world to
// this pass. FLORA_SKY_TAGS below is that list, taken from the pools themselves, so a new gate on
// a new tag widens the sweep on its own.
const FLORA_SKY_TAGS = floraSkyTags();
// The same collapse for the log of the source. The source reads three facts the planet tag set
// does not carry: the lean of the axis, the latitude of the source, and whether the world holds
// life. So the sweep runs every world through seven leans, five latitudes, and both states of the
// life, and it keeps one world per distinct tag set.
//
// The seven leans cover every class rollAxis() draws: damped, ordered, tipped, and turned. 17 is
// there because a source at 79 degrees carries `polarnight` at that lean while `tilted` starts at
// 20, so the two tags must be swept apart. The latitudes stop at 79, because makeSource() keeps
// the source inside SOURCE_LAT, which is 80 degrees.
const SOURCE_SKY_TAGS = sourceSkyTags();
const SOURCE_TILT = [0, 12, 17, 23.4, 60, 140, 177];
const SOURCE_LATS = [0, 25, 45, 65, 79];
const skies = new Map(), sourceSkies = new Map();
for (const f of worlds()) {
  const env = Lore.makeEnv(f);
  for (const t of env.tags) tagsSeen.add(t);
  auditPools(env, f);
  auditLines(env, f);
  const key = f.type + '|' + [...env.tags].filter((t) => FLORA_SKY_TAGS.has(t)).sort().join(',');
  if (!skies.has(key)) skies.set(key, { env, f });
  // A gas giant takes no probe, so it carries no source and no log. See makeSource() in generate.js.
  if (f.type !== 'gas') {
    for (const obliquityDeg of SOURCE_TILT) {
      for (const latDeg of SOURCE_LATS) {
        for (const beasts of [true, false]) {
          const tags = SourceLore.sourceTags(env, obliquityDeg, beasts, latDeg);
          const sKey = f.type + '|' + [...tags].filter((t) => SOURCE_SKY_TAGS.has(t)).sort().join(',');
          if (!sourceSkies.has(sKey)) sourceSkies.set(sKey, { env, f, tags, beasts });
        }
      }
    }
  }
  n++;
}

// ---------------------------------------------------------------- pass 6: the flora
// The same five checks, over the flora pools. A plant reads three tag sources at once — the world,
// the kind, and the biome of the patch — so the sweep is the product of the three. See
// describePatch() in flora-lore.js and docs/flora.md.
const FP = FloraLore.POOLS;
const KIND_COUNT = FloraLore.KIND.length;
const BIOMES = Object.keys(FloraLore.BIOME);
// The tags Lore.makeEnv() takes from the flora of the WORLD. describePatch() strips them, because
// a gate on a card has to say what this plant is and not what the planet grows somewhere.
const WORLD_KIND_TAGS = ['woody', 'cactus', 'crystalflora', 'fungal', 'stoneflora'];
const FLORA_TOKENS = ['ground', 'world', 'day', 'night', 'temp', 'grav', 'moon', 'moons', 'n', 'tall'];
let floraChecked = 0;
const floraReach = new Set(), floraLines = new Map();
// line -> the lexicon contexts it has already been read in
const seenFlora = new Map();
// the tags the lexicon rules name, in a fixed order, so one context gives one key
const LEX_TAGS = lexiconTags();
function lexiconTags() {
  const out = new Set();
  for (const [, gate] of LEXICON) {
    const g = Lore.parseGate(gate);
    for (const any of g.need) for (const t of any) out.add(t);
    for (const t of g.ban) out.add(t);
  }
  return [...out].sort();
}

// Every tag a flora gate names, plus every tag a lexicon rule names. A world outside this list is
// the same world to the flora, whatever else it carries.
function floraSkyTags() {
  const out = new Set();
  const eat = (list) => {
    for (const e of list) {
      if (!e.tags) continue;
      const g = Lore.parseGate(e.tags);
      for (const any of g.need) for (const t of any) out.add(t);
      for (const t of g.ban) out.add(t);
    }
  };
  for (const list of Object.values(FloraLore.POOLS.FORM)) eat(list);
  for (const list of Object.values(FloraLore.POOLS.FEATURE)) eat(list);
  for (const list of Object.values(FloraLore.POOLS.CLOSE)) eat(list);
  for (const k of ['PLAIN_FEATURE', 'HABIT', 'CLIMATE', 'SKY', 'FOOD', 'SPREAD',
    'STAND_ONE', 'STAND_FEW', 'STAND_MANY', 'WORLD_ADJ', 'WORLD_EPITHET']) eat(FloraLore.POOLS[k]);
  for (const [, gate] of LEXICON) {
    const g = Lore.parseGate(gate);
    for (const any of g.need) for (const t of any) out.add(t);
    for (const t of g.ban) out.add(t);
  }
  return out;
}

// Every tag a gate of the source names, plus every tag a lexicon rule names. A world outside this
// list is the same world to the log, whatever else it carries.
function sourceSkyTags() {
  const out = new Set();
  const eat = (list) => {
    for (const e of list) {
      if (!e.tags) continue;
      const g = Lore.parseGate(e.tags);
      for (const any of g.need) for (const t of any) out.add(t);
      for (const t of g.ban) out.add(t);
    }
  };
  eat(SourceLore.ARRIVAL);
  eat(SourceLore.ENDINGS);
  for (const list of Object.values(SourceLore.THREADS)) eat(list);
  for (const [, gate] of LEXICON) {
    const g = Lore.parseGate(gate);
    for (const any of g.need) for (const t of any) out.add(t);
    for (const t of g.ban) out.add(t);
  }
  return out;
}

function plantTags(env, kind, biome) {
  const tags = new Set(env.tags);
  for (const t of WORLD_KIND_TAGS) tags.delete(t);
  for (const t of FloraLore.kindTags(kind)) tags.add(t);
  for (const t of FloraLore.BIOME[biome].tags.split(' ')) tags.add(t);
  tags.add('flora');
  return tags;
}

function auditFlora(env, f, kind, biome, skyKey) {
  const K = FloraLore.KIND[kind];
  const tags = plantTags(env, kind, biome);
  const ctx = { env, tags, world: fakeWorld(f), p: { count: 40, tagList: FloraLore.kindTags(kind) } };
  const label = `${K.word}/${biome}`;
  // The lexicon reads a small part of the tag set: the tags its own rules name. Two contexts that
  // agree on those give one line the same verdict, so one line is only read once per such context.
  // Without this the sweep held tens of millions of keys and ran out of Set.
  let lexKey = '';
  for (const t of LEX_TAGS) if (tags.has(t)) lexKey += t + ',';
  const need = (list, what) => {
    floraChecked++;
    const c = Lore.candidates(list, ctx);
    if (!c.length) holes.push(`FLORA ${what} — ${label} ${f.type} [${[...tags].join(' ')}]`);
    return c;
  };
  need(FP.FORM[kind], 'FORM');
  need(FP.HABIT, 'HABIT');
  need(FP.PLAIN_FEATURE, 'PLAIN_FEATURE');
  need(FP.STAND_ONE, 'STAND_ONE'); need(FP.STAND_FEW, 'STAND_FEW'); need(FP.STAND_MANY, 'STAND_MANY');
  need(FP.CLOSE[f.type] || FP.CLOSE.terran, 'CLOSE.' + f.type);
  need(FP.SPREAD, 'SPREAD');
  for (const part of K.parts) if (FP.FEATURE[part]) need(FP.FEATURE[part], 'FEATURE.' + part);
  // One plant, one source of food. Two sources in the candidate set means a weighted roll could
  // tell the reader that a fungus lives on light.
  const food = need(FP.FOOD, 'FOOD');
  const srcs = [...new Set(food.map((e) => e.src))];
  if (srcs.length > 1) holes.push(`FLORA FOOD ${label} offers ${srcs.join(' and ')} — ${f.type}`);

  // every line of every flora pool against this tag set
  const all = [];
  const add = (list, name) => { for (const e of list) all.push([e, name]); };
  add(FP.FORM[kind], 'FORM.' + K.word);
  add(FP.HABIT, 'HABIT'); add(FP.CLIMATE, 'CLIMATE'); add(FP.SKY, 'SKY');
  add(FP.PLAIN_FEATURE, 'PLAIN_FEATURE'); add(FP.FOOD, 'FOOD'); add(FP.SPREAD, 'SPREAD');
  add(FP.STAND_ONE, 'STAND_ONE'); add(FP.STAND_FEW, 'STAND_FEW'); add(FP.STAND_MANY, 'STAND_MANY');
  add(FP.WORLD_ADJ, 'WORLD_ADJ'); add(FP.WORLD_EPITHET, 'WORLD_EPITHET');
  add(FP.CLOSE[f.type] || FP.CLOSE.terran, 'CLOSE.' + f.type);
  for (const part of K.parts) if (FP.FEATURE[part]) add(FP.FEATURE[part], 'FEATURE.' + part);
  for (const [e, name] of all) {
    if (!floraLines.has(e)) floraLines.set(e, name);
    if (e.tags && !Lore.matchTags(Lore.gateOf(e), tags)) continue;
    floraReach.add(e);
    let seen = seenFlora.get(e);
    if (!seen) { seen = new Set(); seenFlora.set(e, seen); }
    if (seen.has(lexKey)) continue;
    seen.add(lexKey);
    for (const bad of lexCheck(e.t, tags)) {
      lexHits.push(`FLORA ${name}: /${bad.word}/ needs "${bad.gate}" — ${label} [${[...tags].join(' ')}]\n    ${e.t}`);
    }
  }
}

// Every flora pool must also cover every kind the FEATURE table is asked for, and every relation
// must fit the pair of kinds it accepts. RELATION_CONTRACT names what each side must be.
function auditFloraRelations() {
  const out = [];
  const shapes = [];
  for (let k = 0; k < KIND_COUNT; k++) {
    for (const count of [2, 100]) shapes.push({ kind: k, count, tagList: FloraLore.kindTags(k) });
  }
  for (const r of FloraLore.RELATIONS) {
    for (const t of [r.t, r.mirror].filter(Boolean)) {
      for (const tok of Lore.tokensIn(t)) {
        if (!FLORA_TOKENS.includes(tok) && !['other', 'Other', 'others', 'Others'].includes(tok)) {
          out.push(`FLORA ${r.key}: line uses {${tok}}, which relations do not fill:\n    ${t}`);
        }
      }
    }
    const contract = FloraLore.RELATION_CONTRACT[r.key];
    if (!contract) { out.push(`FLORA ${r.key}: no row in RELATION_CONTRACT`); continue; }
    if (r.mirror && !contract.b) out.push(`FLORA ${r.key}: has a mirror line but its contract row has no b`);
    let fired = 0;
    for (const a of shapes) {
      for (const b of shapes) {
        if (a === b || a.kind === b.kind) continue;
        let ok;
        try { ok = r.when({ a, b }); } catch (e) { out.push(`FLORA ${r.key}: when() threw — ${e.message}`); return out; }
        if (!ok) continue;
        fired++;
        for (const [side, p] of [['a', a], ['b', b]]) {
          for (const nd of contract[side] || []) {
            if (!p.tagList.includes(nd)) {
              out.push(`FLORA ${r.key}: accepts ${side}=${FloraLore.KIND[p.kind].word}, which is not "${nd}"`);
            }
          }
        }
      }
    }
    const pairs = shapes.length * (shapes.length - 2);
    if (!fired) out.push(`FLORA ${r.key}: no pair of kinds can reach it`);
    else if (fired / pairs > 0.3) out.push(`FLORA ${r.key}: fits ${(fired / pairs * 100).toFixed(0)}% of all pairs, which will crowd the rarer rules out`);
  }
  // the line that names an animal: it may only use the tokens the flora fills
  for (const r of FloraLore.FAUNA_LINKS) {
    for (const tok of Lore.tokensIn(r.t)) {
      if (!FLORA_TOKENS.includes(tok) && !['other', 'Other', 'others', 'Others'].includes(tok)) {
        out.push(`FLORA LINK ${r.key}: uses {${tok}}, which the link does not fill:\n    ${r.t}`);
      }
    }
  }
  return [...new Set(out)];
}

// The tokens a line uses do not depend on the world, so every flora line is read for them once.
function auditFloraTokens() {
  const each = (list, name) => {
    for (const e of list) {
      for (const tok of Lore.tokensIn(e.t)) {
        if (!FLORA_TOKENS.includes(tok)) tokenHits.push(`FLORA ${name}: uses {${tok}}, which the flora does not fill\n    ${e.t}`);
      }
    }
  };
  for (const [k, list] of Object.entries(FP.FORM)) each(list, 'FORM.' + FloraLore.KIND[k].word);
  for (const [k, list] of Object.entries(FP.FEATURE)) each(list, 'FEATURE.' + k);
  for (const [k, list] of Object.entries(FP.CLOSE)) each(list, 'CLOSE.' + k);
  for (const k of ['PLAIN_FEATURE', 'HABIT', 'CLIMATE', 'SKY', 'FOOD', 'SPREAD',
    'STAND_ONE', 'STAND_FEW', 'STAND_MANY', 'WORLD_ADJ', 'WORLD_EPITHET']) each(FP[k], k);
}
auditFloraTokens();
for (const [skyKey, { env, f }] of skies) {
  if (f.type === 'gas') continue;      // a gas giant grows no plant
  for (let kind = 0; kind < KIND_COUNT; kind++) {
    for (const biome of BIOMES) auditFlora(env, f, kind, biome, skyKey);
  }
}
const floraRelIssues = auditFloraRelations();

// ---------------------------------------------------------------- pass 7: the log of the source
// Issue 34, slice 4, rewritten on 2026-09-19. A log is a landing, the beats of two to four threads
// interleaved, and an ending, and it holds 8 to 20 entries. A beat is a list of wordings, and the
// writer takes one of them. See docs/source.md.
//
// Nine checks run over the landing pool, the threads and the endings.
//
//  1. Coverage. Every world reaches the landing pool, at least THREAD_MIN world threads, at least
//     one fauna thread for EVERY way of moving when it carries beasts, and at least END_MIN
//     endings.
//  2. Reachability, in two halves. A thread may carry a gate on the world and a test on the genome
//     at once, and the two are independent, so the sweep asks them separately.
//  3. The lexicon. A line may only claim a fact the world has.
//  4. The motion lexicon. A fauna line may only claim a movement the animal really makes. This is
//     the check that keeps a whale of the air from standing at the foot of the mast.
//  5. The tokens. A line may only use a token the writer fills, and a line that names the animal
//     must sit under a gate on `beasts`.
//  6. The style. No simile, no hedge, no adverb of manner, no filler, no sentence over 20 words,
//     no wording over 5 sentences, and no printed entry over 9.
//  7. The state. A thread that retires a person may not name that person again after it, and a
//     first beat may never look back at a day the reader has not read.
//  8. Salience. Every world thread must say how loud its fact is, from the numbers of the planet.
//  9. Variety. Three wordings per beat or more, ten ending kinds, six threads of each kind.
const SOURCE_TILT_ANCHOR = 0;   // (the sweep constants stand above, with the flora)

// Every genome shape a test of the log can tell apart: the locomotion, the head, the one part the
// tests read, and the sociality, plus the swarm, which is a plan and not a locomotion.
//
// The body size matters too, because a thread about riding an animal reads bodyMetres(). SIZES
// holds one gene under a metre for every locomotion, one near the middle, and one well over three
// metres, so a test on the size of the body is swept on both sides of every limit the log names.
const SIZES = [0.12, 1.4, 6];
function* sourceShapes() {
  for (const loco of LOCOS) {
    for (const head of HEADS) {
      for (const extra of ['', ...EXTRAS]) {
        for (const social of SOC) {
          for (const size of SIZES) yield { ...genome(loco, head, extra, NICHES[0], null, social), size };
        }
      }
    }
  }
  for (const size of SIZES) yield { ...genome('wings', 'beak', '', NICHES[0], 'swarm', 'herd'), size };
}
// The shapes the coverage sweep carries, keyed by the way the animal moves. Coverage asks whether
// a pool is empty, and no pool may be empty for any animal, so every way of moving is swept under
// every sociality and on both sides of the size limit.
const ST = SourceLore.THREADS;
const MOTION = SourceLore.MOTION;
const LEADS = SourceLore.LEADS;
const SOURCE_COVER = new Map();      // motion tag -> the genomes that move that way
for (const G of sourceShapes()) {
  const m = SourceLore.motionOf(G);
  if (!SOURCE_COVER.has(m)) SOURCE_COVER.set(m, []);
  const list = SOURCE_COVER.get(m);
  // one per (sociality, size) pair is enough: no thread reads the head or the parts
  const key = G.social.kind + '|' + G.size;
  if (!list.some((x) => x.social.kind + '|' + x.size === key)) list.push(G);
}
const sourceIssues = [];
for (const m of MOTION) {
  if (!SOURCE_COVER.has(m)) sourceIssues.push(`SOURCE motion "${m}": no genome shape in the sweep moves that way`);
}

const SOURCE_TOKENS = SourceLore.TOKENS;
const BEAST_TOKENS = SourceLore.BEAST_TOKENS;
const THREAD_LISTS = [['world', ST.world], ['crew', ST.crew], ['fauna', ST.fauna], ['strand', ST.strand]];
const THREAD_MIN = 3;        // world threads every world must reach
const END_MIN = 4;           // endings every world must reach
const WORDING_MIN = 3;       // wordings every beat must hold
const SENTENCE_MAX = 20;     // words
const ENTRY_SENTENCES = 5;   // one wording of a pool
// A printed entry may be longer than one wording. The landing is an ARRIVAL line and the plan of
// the strand thread, an early beat may take an aside, and the ending may take a coda.
const PRINTED_SENTENCES = 9;

// A beat is a list of wordings, or an object with `say` and the person it takes out of the story.
const sayOf = (b) => (Array.isArray(b) ? b : b.say);

// Every text of the log, with the pool entry it sits under. A wording inherits the gate of its
// thread, because the thread is what the writer picks.
function sourceTexts() {
  const out = [];
  for (const e of SourceLore.ARRIVAL) out.push({ label: 'ARRIVAL', e, t: e.t, kind: 'arrival' });
  for (const [kind, list] of THREAD_LISTS) {
    for (const th of list) {
      th.beats.forEach((b, i) => {
        sayOf(b).forEach((t, j) => out.push({ label: `${kind.toUpperCase()}.${th.key}[${i}.${j}]`, e: th, t, kind }));
      });
      for (const t of th.coda || []) out.push({ label: `${kind.toUpperCase()}.${th.key}.coda`, e: th, t, kind });
      // The second part of the landing, which a strand thread may bring with it.
      for (const t of th.landing || []) out.push({ label: `${kind.toUpperCase()}.${th.key}.landing`, e: th, t, kind });
    }
  }
  // The plan of a crew whose lander came down whole, and the asides about the people. Neither
  // carries a gate, so each rides on an entry of its own with no tags.
  const PLAIN = {};
  for (const t of SourceLore.SOUND_LANDING) out.push({ label: 'SOUND_LANDING', e: PLAIN, t, kind: 'strand' });
  for (const tr of SourceLore.TRAITS) for (const t of tr.say) out.push({ label: 'TRAIT.' + tr.key, e: PLAIN, t, kind: 'trait' });
  for (const e of SourceLore.ENDINGS) out.push({ label: 'END.' + e.kind, e, t: e.t, kind: 'end' });
  return out;
}
const SOURCE_TEXTS = sourceTexts();
// Every pool entry the sweep has to reach: the landing lines, the threads, and the endings.
const SOURCE_ENTRIES = [];
for (const e of SourceLore.ARRIVAL) SOURCE_ENTRIES.push(['ARRIVAL', e]);
for (const [kind, list] of THREAD_LISTS) for (const th of list) SOURCE_ENTRIES.push([kind.toUpperCase() + '.' + th.key, th]);
for (const e of SourceLore.ENDINGS) SOURCE_ENTRIES.push(['END.' + e.kind, e]);

// ---- the style lint
// The voice of the log is short, plain, and literal. These five patterns are the ones a writer
// reaches for without noticing, and every one of them breaks the voice.
// The log is a ship log, and its only tool is subtraction. An adverb of manner is the first word
// to go: if the verb needs help, the line takes a better verb. ADVERB_OK holds the -ly words that
// are not adverbs of manner, and a new one has to be read by hand before it is added.
const ADVERB_OK = new Set(['only', 'early', 'family', 'supply', 'reply', 'belly', 'fly', 'ugly',
  'monthly', 'weekly', 'daily', 'assembly', 'unfriendly',
  // "3.6 m, mostly under the sand" is a size text of species.js, which a log prints through {size}.
  'mostly']);
const STYLE_BAD = [
  [{ test: (t) => (String(t).match(/\b[a-z]+ly\b/gi) || []).some((w) => !ADVERB_OK.has(w.toLowerCase())), source: 'an -ly word' }, 'an adverb'],
  // The filler a writer reaches for in place of the fact. Each of these left a reader asking
  // "the whole of what?", "decides what?", "whatever what?".
  [/\b(?:is|was) the whole of the\b|\bthat is the whole\b/i, 'a filler'],
  [/\bwhatever (?:it|this|that|the)\b/i, 'a vague reference'],
  [/\bthe wind decides\b|\bthe quiet\b|\bthe wet\b/i, 'a vague reference'],
  [/ like an? /i, 'a simile'],
  [/ as if /i, 'a simile'],
  [/ as though /i, 'a simile'],
  [/\bseem(s|ed|ing)?\b/i, 'a hedge'],
  [/ as \w+ as /i, 'a comparison'],
];
function sentencesOf(text) {
  return String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}
// A token is not one word. "{Other}" can print "The sea lamp-flanked sky whale" and "{size}" can
// print "Each shard a hand wide, the swarm 9 m". A sentence of eleven tokens-and-words can
// therefore run to twenty-five words on a real world, which is how two swarm wordings and a polar
// night line got past a lint that counted every token as one. WORST holds the longest fill each
// token can take, in words, and the lint counts with those. Raise a number here when species.js
// grows a longer name or a longer size text.
const WORST = {
  Other: 5, other: 5, Others: 5, others: 5,   // "The sea lamp-flanked sky whale"
  size: 9,                                     // "Each shard a hand wide, the swarm 9 m"
  diet: 6, lat: 3, tilt: 3,
  day: 2, night: 2, temp: 2, grav: 2, world: 2, probe: 2, pet: 2,
  onejob: 2, twojob: 2, keeperjob: 2,
  kind: 1, kinds: 1, Kind: 1, Kinds: 1,        // the last word of the name: "whale", "hopper"
  one: 1, two: 1, keeper: 1, crew: 1, n: 1, count: 1,
  few: 1, many: 1, days: 1, since: 1, moon: 1, moons: 1, plant: 1, plants: 1,
  due: 1, years: 1, far: 1, who: 1, whojob: 2,
};
const expandWorst = (text) => String(text).replace(/\{(\w+)\}/g, (m, k) => 'x '.repeat(WORST[k] == null ? 1 : WORST[k]).trim());
function styleCheck(text, maxSentences = ENTRY_SENTENCES) {
  const bad = [];
  for (const [re, what] of STYLE_BAD) if (re.test(text)) bad.push(`${what}: /${re.source}/`);
  const sents = sentencesOf(text);
  if (sents.length > maxSentences) bad.push(`${sents.length} sentences, over ${maxSentences}`);
  for (const s of sentencesOf(expandWorst(text))) {
    const n = s.split(/\s+/).filter(Boolean).length;
    if (n > SENTENCE_MAX) bad.push(`a sentence of ${n} words once the tokens are filled`);
  }
  return bad;
}

// ---- every entry stands on its own subject
// The threads are interleaved, so an entry never follows the entry before it in its own thread.
// The reader meets each entry cold. The FIRST reference to a subject inside an entry must
// therefore be a noun or a name, and never a pronoun.
//
// For the animal the naming tokens are {Other}, {Others}, {other}, {others}, {kind}, {kinds},
// {Kind}, {Kinds}, and {pet}. A stand-in phrase is the same defect as a pronoun: "one of them",
// "the big ones", "two of them", "the band" and "the wheel" tell the reader nothing on their own.
const NAMING_TOKENS = SourceLore.NAMING_TOKENS;
// A bare "one" is the commonest stand-in of all: "a hand on the back of one". The scan marks the
// tokens first, so the crew token {one} is never read as the word "one", and then it looks for the
// shapes a bare "one" takes when it means the animal. "one of us" and "one hour" are left alone.
const STANDIN = new RegExp([
  '\\b(?:it|its|they|them|their|theirs)\\b',
  '\\bone of them\\b', '\\btwo of them\\b', '\\bthree of them\\b',
  '\\bthe big ones\\b', '\\bthe band\\b', '\\bthe wheel\\b', '\\bthe flock\\b',
  '\\bsecond one\\b', '\\bthe one (?:with|at|in|that)\\b',
  '\\b(?:beside|behind|on|of|at|with|to|for|near|past|under) (?:a |an |the )?one\\b',
  '\\bone (?:came|landed|stopped|went|has|had|was|is|sat|opened|folded|knelt|got|would|will)\\b',
].join('|'), 'gi');
function subjectCheck(text) {
  // ANIMAL for a naming token, WORD for every other token, so a token is never read as prose.
  const marked = String(text).replace(/\{(\w+)\}/g,
    (m, k) => (NAMING_TOKENS.includes(k) ? ' ANIMALNAME ' : ' CREWWORD '));
  const at = marked.indexOf('ANIMALNAME');
  const first = at < 0 ? Infinity : at;
  STANDIN.lastIndex = 0;
  let x;
  while ((x = STANDIN.exec(marked))) {
    if (x.index < first) return `"${x[0].trim()}" stands for the animal before the entry has named it`;
  }
  return null;
}
// A world, crew or landing wording may not OPEN on a pronoun either, because the subject of the
// first sentence is the one the reader has no way to guess. The list below is tight on purpose:
// every one of these is the impersonal "it" of the weather, the clock or a state of affairs, and
// every new hit has to be read by hand before it is added.
const IMPERSONAL_OPEN = /^(It is|It was|It has been|It has rained|It rains|It rained|It took|It gains|It costs|It buys|It helps)\b/;
const PRONOUN_OPEN = /^(It|Its|They|Them|Their|He|She|Both|One of them)\b/;
function openCheck(text) {
  if (!PRONOUN_OPEN.test(text)) return null;
  if (IMPERSONAL_OPEN.test(text)) return null;
  return `opens on a pronoun, and the reader has no subject for it`;
}

// ---- the motion lexicon
// A fauna line claims how the animal gets about, and the claim has to match the body. This is the
// rule the first build did not have, and a 40 metre whale of the air stood at the foot of a mast.
//
// Every rule is SUBJECT SCOPED. A fauna entry carries the crew as well as the animal, and the crew
// walks and stands on any world, so a bare /walk/ would fail every honest line. SUBJ below is the
// animal, in the words a pool line uses, and a verb only counts when the animal is what does it.
// The rules run over the fauna threads and over the endings that carry a motion gate, and never
// over the crew or the world threads. They run on the POOL text, where the animal is still a
// token; the --seeds pass does not repeat them, because the pool sweep already reads every wording
// against every way of moving.
const SUBJ = '(?:\\{Other\\}|\\{Others\\}|\\{other\\}|\\{others\\}|\\{Kind\\}|\\{Kinds\\}|\\{kind\\}|\\{kinds\\}|\\{pet\\}|[Ii]t|[Tt]hey|[Oo]ne of them|[Tt]hree of them|[Tt]wo of them)';
// A denial is honest anywhere: "It never walks" is a true line about a roller. So the prefix
// allows only the tenses, and a 'not' or a 'never' between the subject and the verb breaks the
// match on purpose.
const verb = (v) => new RegExp('\\b' + SUBJ + '\\s+(?:has |have |had )?(?:' + v + ')\\b');
const MOTION_LEXICON = [
  [verb('walks?|walked|walking'), 'mwalk'],
  [/\bwalk(?:s|ed)? (?:past|beside|with) (?:the mast|the ship|us|one|them)\b|\bwalked beside one\b/i, 'mwalk'],
  [/\bits legs\b|\bits feet\b|\bon (?:four |six |three |two )?legs\b|\bthe same road\b|\bthe road\b/i, 'mwalk|mcrawl|mdig'],
  [/\bflanks?\b|\bshoulder\b|\bon the back of\b|\bthe back of one\b|\bharness\b|\brid(?:e|ing)\b/i, 'mwalk'],
  [verb('stood|stands?|standing'), 'mwalk|mcrawl|manchor|mroll|mflow'],
  [/\bunder the ship\b|\bagainst the hull\b|\bagainst the legs\b|\bat the foot of the mast\b/i, 'mwalk|mcrawl|mroll|mflow|msling|mdig|manchor'],
  [verb('flies|flew|flying|circled|beats?'), 'mfly|mdrift|mcruise|mswarm'],
  [/\bwings?\b|\bcrossed the sky\b|\bin the sky\b|\bover the ship\b|\bover the mast\b|\bon the wind\b/i, 'mfly|mdrift|mcruise|mswarm'],
  [verb('landed|lands?'), 'mfly|mdrift|mcruise|mswarm'],
  [/\bnever lands\b|\bdoes not land\b|\bnever comes down\b|\blanded on the\b/i, 'mfly|mdrift|mcruise|mswarm'],
  [verb('hangs?|hung|drifts?|hovers?'), 'mdrift|mcruise|mfly|mswarm'],
  [/\bburrows?\b|\bunder the ground\b|\bunder the surface\b|\bthe mound\b|\ba mound\b|\bthe raised line\b/i, 'mdig|manchor'],
  [verb('comes? up|came up'), 'mdig|manchor'],
  [/\bpours?\b|\bpoured\b|\bno shape\b/i, 'mflow'],
  [verb('gathers?|gathered'), 'mflow|mroll'],
  [verb('folds?|folded'), 'mroll'],
  [/\bthrows itself\b|\bone long throw\b|\bbetween throws\b/i, 'mroll'],
  [/\ba cord\b|\bthe cord\b/i, 'msling'],
  [verb('swings?|swung'), 'msling'],
  [/\bthe wheel\b|\bthe swarm\b/i, 'mswarm'],
  [/\bthe coil\b|\bcoiled\b|\bno legs\b/i, 'mcrawl'],
];
// True when a gate of this line names a way of moving. Only such a line is about the animal.
function namesMotion(e) {
  const gt = Lore.parseGate(e.tags);
  for (const any of gt.need) for (const t of any) if (MOTION.includes(t)) return true;
  return false;
}
function motionCheck(text, tags) {
  const bad = [];
  for (const [re, gate] of MOTION_LEXICON) {
    if (!re.test(text)) continue;
    if (!Lore.matchTags(Lore.parseGate(gate), tags)) bad.push({ word: re.source, gate });
  }
  return bad;
}

// ---- a first beat may never look back
// The first beat of a thread is the day the reader meets it, so "in all this time" is false there.
const BACKREF = /\bin all this time\b|\bsince day\b|\bwe have never\b|\bhas never\b|\bhave never\b|\bnever once\b|\bevery day since\b|\bby now\b|\bas always\b|\bany more\b|\bagain\b|\bfor a month\b|\bfor a week\b|\bstill\b/i;

// The lead tags are not facts of the planet. A log sets them from its own threads, so the sweep
// carries three sets: none of them, all of them, and all but one, for every lead some gate BANS.
// Without the third set a line gated on "!leadsecond leadride" looks unreachable, because the
// sweep would never hold one lead without the other.
const BANNED_LEADS = new Set();
for (const [, e] of SOURCE_ENTRIES) {
  for (const t of Lore.parseGate(e.tags).ban) if (t.startsWith('lead')) BANNED_LEADS.add(t.slice(4));
}
const LEAD_SETS = [[], LEADS, ...[...BANNED_LEADS].map((L) => LEADS.filter((x) => x !== L))];

const srcReach = new Map();      // pool entry -> { gate, cond }: the two halves of reachability
const seenSource = new Map();    // pool entry -> the lexicon contexts it has been read in
let sourceChecked = 0;
for (const [, e] of SOURCE_ENTRIES) srcReach.set(e, { gate: false, cond: false });
for (const [label, e] of SOURCE_ENTRIES) {
  if (!e.if) { srcReach.get(e).cond = true; continue; }
  for (const G of sourceShapes()) {
    let ok;
    try { ok = e.if({ G, env: null, tags: new Set(), world: null }); }
    catch (err) { sourceIssues.push(`SOURCE ${label}: if() threw — ${err.message}`); ok = true; }
    if (ok) { srcReach.get(e).cond = true; break; }
  }
}

for (const [, sky] of sourceSkies) {
  const { env, f, tags: skyTags, beasts } = sky;
  // Every way of moving, and every lead a thread can set. Neither is a fact of the planet, so the
  // sweep adds them here rather than widening the sky key by a factor of a hundred.
  const motions = beasts ? MOTION : [null];
  for (const motion of motions) {
  for (const leadSet of LEAD_SETS) {
    const tags = new Set(skyTags);
    if (motion) tags.add(motion);
    for (const lead of leadSet) tags.add('lead' + lead);
    let lexKey = '';
    for (const t of LEX_TAGS) if (tags.has(t)) lexKey += t + ',';
    lexKey += '|' + (motion || '');
    const base = { env, tags, world: fakeWorld(f) };
    const ctxs = beasts ? SOURCE_COVER.get(motion).map((G) => ({ ...base, G })) : [{ ...base, G: null }];
    for (const ctx of ctxs) {
      sourceChecked += 4;
      if (!Lore.candidates(SourceLore.ARRIVAL, ctx).length) holes.push(`SOURCE ARRIVAL — ${f.type} [${[...tags].join(' ')}]`);
      const w = Lore.candidates(ST.world, ctx).length;
      if (w < THREAD_MIN) holes.push(`SOURCE world threads: only ${w} — ${f.type} [${[...skyTags].join(' ')}]`);
      if (!Lore.candidates(ST.crew, ctx).length) holes.push(`SOURCE crew threads — ${f.type}`);
      // Every log has to say why the crew could not leave, so no world may be shut out of them.
      if (!Lore.candidates(ST.strand, ctx).length) holes.push(`SOURCE strand threads — ${f.type}`);
      const fa = Lore.candidates(ST.fauna, ctx).length;
      if (beasts && !fa) holes.push(`SOURCE fauna threads — ${motion} ${ctx.G.social.kind} ${ctx.G.size} m — ${f.type}`);
      if (!beasts && fa) holes.push(`SOURCE fauna thread reaches a world with no beasts — ${f.type}`);
      const en = Lore.candidates(SourceLore.ENDINGS, ctx).length;
      if (en < END_MIN) holes.push(`SOURCE endings: only ${en} — ${f.type} [${[...tags].join(' ')}]`);
    }
    for (const [, e] of SOURCE_ENTRIES) {
      if (e.tags && !Lore.matchTags(Lore.gateOf(e), tags)) continue;
      srcReach.get(e).gate = true;
      let seen = seenSource.get(e);
      if (!seen) { seen = new Set(); seenSource.set(e, seen); }
      if (seen.has(lexKey)) continue;
      seen.add(lexKey);
      for (const x of SOURCE_TEXTS) {
        if (x.e !== e) continue;
        for (const bad of lexCheck(x.t, tags)) {
          lexHits.push(`SOURCE ${x.label}: /${bad.word}/ needs "${bad.gate}" — ${f.type} [${[...tags].join(' ')}]\n    ${x.t}`);
        }
        // The motion rules bind the fauna threads and the endings that name a way of moving.
        if (x.kind !== 'fauna' && !(x.kind === 'end' && namesMotion(e))) continue;
        for (const bad of motionCheck(x.t, tags)) {
          lexHits.push(`SOURCE MOTION ${x.label}: /${bad.word}/ needs "${bad.gate}" — [${motion}]\n    ${x.t}`);
        }
      }
    }
  }
  }
}

// the tokens and the style of every text, which do not depend on the world
for (const x of SOURCE_TEXTS) {
  const toks = Lore.tokensIn(x.t);
  for (const tok of toks) {
    if (!SOURCE_TOKENS.includes(tok)) tokenHits.push(`SOURCE ${x.label}: uses {${tok}}, which the log does not fill\n    ${x.t}`);
  }
  // A line that names the animal may only reach a world that carries one.
  if (toks.some((t) => BEAST_TOKENS.includes(t))) {
    const need = Lore.parseGate(x.e.tags).need;
    if (!need.some((any) => any.length === 1 && any[0] === 'beasts')) {
      sourceIssues.push(`SOURCE ${x.label}: names the animal but is not gated on "beasts"\n    ${x.t}`);
    }
  }
  for (const bad of styleCheck(x.t)) sourceIssues.push(`SOURCE ${x.label}: ${bad}\n    ${x.t}`);
  // Every entry stands on its own subject. A fauna wording, and an ending that names a way of
  // moving, has to name the animal before any word stands in for it. Every other wording only has
  // to open on a subject the reader can see.
  const aboutAnimal = x.kind === 'fauna' || (x.kind === 'end' && namesMotion(x.e));
  const bad = aboutAnimal ? subjectCheck(x.t) : openCheck(x.t);
  if (bad) sourceIssues.push(`SOURCE ${x.label}: ${bad}\n    ${x.t}`);
}
for (const [label, e] of SOURCE_ENTRIES) {
  const r = srcReach.get(e);
  const what = e.beats ? 'thread' : 'line';
  if (!r.gate) sourceIssues.push(`SOURCE ${label}: no world in the sweep passes the gate of this ${what} [${e.tags || ''}]`);
  else if (!r.cond) sourceIssues.push(`SOURCE ${label}: no genome shape passes the if() of this ${what}`);
}

// ---- the shape of a thread, and the state it carries
for (const [kind, list] of THREAD_LISTS) {
  for (const th of list) {
    const n = th.beats.length;
    if (n < 3 || n > 6) sourceIssues.push(`SOURCE ${kind}.${th.key}: ${n} beats, outside 3 to 6`);
    // Every beat needs enough wordings that two logs on the same thread do not read alike.
    th.beats.forEach((b, i) => {
      const say = sayOf(b);
      if (!say || say.length < WORDING_MIN) {
        sourceIssues.push(`SOURCE ${kind}.${th.key}[${i}]: only ${say ? say.length : 0} wordings, and ${WORDING_MIN} is the floor`);
      }
      if (say && new Set(say).size !== say.length) sourceIssues.push(`SOURCE ${kind}.${th.key}[${i}]: two wordings are the same sentence`);
    });
    // A world thread has to say how loud its fact is, or the loudest fact of a world loses.
    if (kind === 'world' && typeof th.sal !== 'function') {
      sourceIssues.push(`SOURCE world.${th.key}: no sal(), so it cannot win on the world it belongs to`);
    }
    // The name of an animal has to be given before it is used. The first beat any wording of
    // which names {pet} is the naming beat, and EVERY wording of it must give the name, or a log
    // that rolls one of the others prints a name the reader has never met.
    let petAt = -1;
    th.beats.forEach((b, i) => { if (petAt < 0 && sayOf(b).some((t) => /\{pet\}/.test(t))) petAt = i; });
    if (petAt >= 0) {
      for (const t of sayOf(th.beats[petAt])) {
        if (!(/\b(calls?|called|calling|names?|named|naming)\b/.test(t) && /\{pet\}/.test(t))) {
          sourceIssues.push(`SOURCE ${kind}.${th.key}[${petAt}]: uses {pet} without giving the name, and it is the naming beat\n    ${t}`);
        }
      }
      for (let i = 0; i < petAt; i++) {
        for (const t of sayOf(th.beats[i])) {
          if (/\{pet\}/.test(t)) sourceIssues.push(`SOURCE ${kind}.${th.key}[${i}]: names {pet} before the naming beat\n    ${t}`);
        }
      }
    }
    // A span longer than the shortest mission. A log may run 42 turns, so a beat that claims a
    // hundred days or a year can stand in a log that is not that old.
    for (const b of th.beats) {
      for (const t of sayOf(b)) {
        // "a year older" is an age and not a span of the mission, so the rule steps over it.
        const m = t.match(/\b(?:a|two|three) hundred (?:days|nights|turns)\b|\b(?:a|two|three) years?\b(?! older)|\ba thousand (?:days|nights|turns)\b/i);
        if (m) sourceIssues.push(`SOURCE ${kind}.${th.key}: claims "${m[0]}", which is longer than the shortest mission\n    ${t}`);
      }
    }
    // The first beat is the day the reader meets this thread. It may not look back.
    for (const t of sayOf(th.beats[0])) {
      if (/\{since\}/.test(t)) sourceIssues.push(`SOURCE ${kind}.${th.key}[0]: refers back to {since}, which is its own day\n    ${t}`);
      const m = t.match(BACKREF);
      if (m) sourceIssues.push(`SOURCE ${kind}.${th.key}[0]: looks back with "${m[0]}" on the first day of the thread\n    ${t}`);
    }
    let out = -1;
    th.beats.forEach((b, i) => { if (!Array.isArray(b) && b.out && out < 0) out = i; });
    if (out < 0) {
      if (th.retires) sourceIssues.push(`SOURCE ${kind}.${th.key}: marked retires but no beat carries out`);
      continue;
    }
    if (!th.retires) sourceIssues.push(`SOURCE ${kind}.${th.key}: a beat carries out but the thread is not marked retires`);
    for (let i = out + 1; i < n; i++) {
      for (const t of sayOf(th.beats[i])) {
        if (/\{one\}/.test(t)) sourceIssues.push(`SOURCE ${kind}.${th.key}[${i}]: names {one} after the person is gone\n    ${t}`);
      }
    }
    for (const t of th.coda || []) {
      if (/\{one\}/.test(t)) sourceIssues.push(`SOURCE ${kind}.${th.key}.coda: names {one}, who does not survive this thread\n    ${t}`);
    }
  }
}

// ---- variety
// A reader who finds ten wrecks must meet at least six kinds of ending and at least six threads.
if (SourceLore.ENDING_KINDS.length < 10) sourceIssues.push(`SOURCE endings: only ${SourceLore.ENDING_KINDS.length} kinds, and the plan asks for ten`);
for (const [kind, list] of THREAD_LISTS) {
  if (list.length < 6) sourceIssues.push(`SOURCE ${kind} threads: only ${list.length}, and ten wrecks will repeat one`);
}
const endByKind = new Map();
for (const e of SourceLore.ENDINGS) endByKind.set(e.kind, (endByKind.get(e.kind) || 0) + 1);
for (const [k, c] of endByKind) if (c < 3) sourceIssues.push(`SOURCE endings: the kind "${k}" carries only ${c} wordings`);
if (SourceLore.NAMES.length < 60) sourceIssues.push(`SOURCE names: only ${SourceLore.NAMES.length}, and the plan asks for 60`);
const nameSet = new Set(SourceLore.NAMES);
for (const p of SourceLore.PET_NAME) if (nameSet.has(p)) sourceIssues.push(`SOURCE pet name "${p}" is also a crew name`);
// Every wording of the whole log, once. A sentence that stands in two pools is a sentence a reader
// will meet twice under two headings.
const allSaid = new Map();
for (const x of SOURCE_TEXTS) {
  if (allSaid.has(x.t)) sourceIssues.push(`SOURCE ${x.label}: the same sentence stands in ${allSaid.get(x.t)}\n    ${x.t}`);
  else allSaid.set(x.t, x.label);
}

// ---------------------------------------------------------------- pass 4: real worlds through the worker
let storyStats = null;
// What the consistency check counts over the real worlds, for the report at the end.
let logsSeen = 0;
const entryCounts = [], crewSizes = [];
const endSpread = new Map(), threadSpread = new Map(), motionSpread = new Map();
// One sample line per way of moving, so the report shows what a reader really gets.
const motionSample = new Map();
// The repetition report. Every sentence of every log, and the sentences of the log before it in
// seed order, so the sweep can say how often two wrecks in a row read alike.
const sentenceCount = new Map();
let prevSentences = null, neighbourPairs = 0, neighbourShared = 0, sharedExample = '';
if (SEEDS > 0) {
  const lens = [];
  for (let i = 0; i < SEEDS; i++) {
    const seed = 'audit-' + i;
    let world = null;
    try { world = generate.world(seed, { detail: 24, maxFlora: 200, maxFauna: 40 }).world; } catch (e) { holes.push(`seed ${seed}: ${e.message}`); continue; }
    const env = Lore.makeEnv(world.env);
    // The log of the source, issue 34 slice 4. A world with no source carries no log, which is
    // the right answer for a gas giant and for a world where no vertex passed the tests.
    //
    // This is the CONSISTENCY check of the log. The pool sweep above proves that the words are
    // honest; this one proves that the story holds together on a real world: the entry count, the
    // days, the crew, the dead, and the ending.
    if (world.source) {
      const log = world.source.log;
      const live = (world.species || []).filter((G) => G.lore);
      if (!log) holes.push(`seed ${seed}: the source carries no log`);
      else {
        logsSeen++;
        const E = log.entries || [];
        const { ENTRY_MIN, ENTRY_MAX, CREW_MIN, CREW_MAX } = SourceLore.LIMITS;
        if (E.length < ENTRY_MIN || E.length > ENTRY_MAX) {
          holes.push(`seed ${seed}: the log holds ${E.length} entries, outside ${ENTRY_MIN} to ${ENTRY_MAX}`);
        }
        entryCounts.push(E.length);
        if (E[0].slot !== 'landing') holes.push(`seed ${seed}: the log opens on "${E[0].slot}" and not on the landing`);
        const last = E[E.length - 1];
        if (!/^end\./.test(last.slot) || !SourceLore.ENDING_KINDS.includes(last.slot.slice(4))) {
          holes.push(`seed ${seed}: the log closes on "${last.slot}", which is not an ending kind`);
        } else endSpread.set(last.slot.slice(4), (endSpread.get(last.slot.slice(4)) || 0) + 1);
        for (const e of E) if (/^(world|crew|fauna|strand)\./.test(e.slot)) threadSpread.set(e.slot, (threadSpread.get(e.slot) || 0) + 1);
        // Every log states why the crew could not leave: one strand thread, run to its last beat,
        // and a landing that names the orbiter and the day it leaves.
        const strand = ST.strand.find((x) => x.key === log.cause);
        if (!strand) holes.push(`seed ${seed}: the log names no cause the crew is stranded by`);
        else if (E.filter((e) => e.slot === 'strand.' + strand.key).length !== strand.beats.length) {
          holes.push(`seed ${seed}: the strand thread "${strand.key}" did not run to its last beat`);
        }
        if (!/\borbiter\b/.test(E[0].text) || !/\bday \d+\b/.test(E[0].text)) {
          holes.push(`seed ${seed}: the landing does not state the orbiter and the day it leaves\n    ${E[0].text}`);
        }
        if (strand && strand.end && last.slot !== 'end.' + strand.end) {
          holes.push(`seed ${seed}: the cause "${strand.key}" asks for the ending "${strand.end}" and the log closes on "${last.slot}"`);
        }
        // The crew, and the keeper who writes the log.
        const crew = log.crew || [];
        if (crew.length < CREW_MIN || crew.length > CREW_MAX) holes.push(`seed ${seed}: a crew of ${crew.length}`);
        if (!crew.some((c) => c.name === log.keeper)) holes.push(`seed ${seed}: the keeper "${log.keeper}" is not of the crew`);
        if (new Set(crew.map((c) => c.name)).size !== crew.length) holes.push(`seed ${seed}: two people of the crew share a name`);
        if (new Set(crew.map((c) => c.role)).size !== crew.length) holes.push(`seed ${seed}: two people of the crew share a role`);
        crewSizes.push(crew.length);
        // The days rise strictly, and the first one is the landing.
        if (E[0].day !== 1) holes.push(`seed ${seed}: the log opens on day ${E[0].day} and not on day 1`);
        for (let j = 1; j < E.length; j++) {
          if (E[j].day <= E[j - 1].day) holes.push(`seed ${seed}: day ${E[j].day} does not follow day ${E[j - 1].day}`);
        }
        if (log.days !== last.day) holes.push(`seed ${seed}: the log states ${log.days} days and its last entry is day ${last.day}`);
        const named = live.find((G) => G.lore.name === log.species) || null;
        const motion = SourceLore.motionOf(named);
        const stags = SourceLore.sourceTags(env, world.env.obliquityDeg, live.length > 0,
          SourceLore.sourceLatDeg(world.source.dir), motion);
        if (motion) {
          motionSpread.set(motion, (motionSpread.get(motion) || 0) + 1);
          const line = E.find((e) => /^fauna\./.test(e.slot));
          if (line && !motionSample.has(motion)) motionSample.set(motion, line.text);
        }
        // The names that are not crew names: the ship, the moons, the animal, the animal's own
        // name. The check below strips them before it looks for a person.
        const strip = [log.probe, log.species || '', ...(world.env.moonNames || []), ...SourceLore.PET_NAME];
        const crewNames = new Set(crew.map((c) => c.name));
        const lost = log.lost;
        E.forEach((e, j) => {
          if (!e.text) { holes.push(`seed ${seed}: the ${e.slot} entry of the log is empty`); return; }
          for (const tok of Lore.tokensIn(e.text)) tokenHits.push(`seed ${seed} log ${e.slot}: unfilled {${tok}}`);
          for (const bad of lexCheck(e.text, stags)) {
            lexHits.push(`seed ${seed} log ${e.slot}: /${bad.word}/ needs "${bad.gate}" [${[...stags].join(' ')}]\n    ${e.text}`);
          }
          // The style, on the filled text, where a token has become a real phrase.
          for (const bad of styleCheck(e.text, PRINTED_SENTENCES)) holes.push(`seed ${seed} log ${e.slot}: ${bad}\n    ${e.text}`);
          let bare = e.text;
          for (const s of strip) if (s) bare = bare.split(s).join(' ');
          for (const name of SourceLore.NAMES) {
            if (!new RegExp(`\\b${name}\\b`).test(bare)) continue;
            if (!crewNames.has(name)) holes.push(`seed ${seed} log ${e.slot}: names "${name}", who is not of the crew\n    ${e.text}`);
            // A dead or absent person never acts or speaks again.
            else if (lost && name === lost.name && e.day > lost.day) {
              holes.push(`seed ${seed} log ${e.slot}: names "${name}", who was ${lost.how} on day ${lost.day}\n    ${e.text}`);
            }
          }
        });
        // The log names one animal of this world, so the log and the fauna card agree.
        if (log.species && !live.some((G) => G.lore.name === log.species)) {
          holes.push(`seed ${seed}: the log names "${log.species}", which is not a species of this world`);
        }
        if (!log.species && live.length) holes.push(`seed ${seed}: the world carries species and the log names none`);
        if (!live.length && E.some((e) => /^fauna\./.test(e.slot))) {
          holes.push(`seed ${seed}: the log runs a fauna thread on a world with no species`);
        }
        // The genome fact the fauna thread reports has to be true of the animal the log names. The
        // thread carries the test; the sweep runs it against the real genome.
        for (const e of E) {
          if (!/^fauna\./.test(e.slot)) continue;
          const th = ST.fauna.find((x) => x.key === e.slot.slice(6));
          if (!th) { holes.push(`seed ${seed}: the log runs the unknown fauna thread "${e.slot}"`); continue; }
          if (th.if && !th.if({ G: named, env, tags: stags, world })) {
            holes.push(`seed ${seed}: the thread "${e.slot}" is not true of ${log.species}`);
          }
        }
        // The same for the ending, which may also read the genome. One wording of that kind must
        // pass both the gate of this world and the test on this animal.
        // The leads are tags of the story and not of the planet, so the log carries them.
        const endTags = new Set(stags);
        for (const lead of log.leads || []) endTags.add('lead' + lead);
        const endCtx = { env, tags: endTags, world, G: named };
        const endKind = last.slot.slice(4);
        if (!Lore.candidates(SourceLore.ENDINGS, endCtx).some((x) => x.kind === endKind)) {
          holes.push(`seed ${seed}: the ending "${endKind}" does not fit this world`);
        }
        // The repetition report. A sentence is counted once per log, and a neighbour pair is two
        // wrecks the reader could find one after the other.
        const mine = new Set();
        for (const e of E) for (const sent of sentencesOf(e.text)) mine.add(sent);
        for (const sent of mine) sentenceCount.set(sent, (sentenceCount.get(sent) || 0) + 1);
        if (prevSentences) {
          neighbourPairs++;
          let hit = '';
          for (const sent of mine) if (prevSentences.has(sent)) { hit = sent; break; }
          if (hit) { neighbourShared++; if (!sharedExample) sharedExample = hit; }
        }
        prevSentences = mine;
      }
    }
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
console.log(`flora lookups        ${floraChecked} over ${skies.size} skies x ${KIND_COUNT} kinds x ${BIOMES.length} biomes`);
console.log(`source lookups       ${sourceChecked} over ${sourceSkies.size} skies`);
console.log(`source text          ${SOURCE_TEXTS.length} lines in ${SOURCE_ENTRIES.length} pool entries, ${SourceLore.ENDING_KINDS.length} ending kinds`);
console.log(`distinct world tags  ${[...tagsSeen].sort().join(' ')}`);
console.log('');
const report = (title, map) => {
  console.log(`${title}: ${map.size} distinct`);
  for (const [, v] of map) console.log('  - ' + v.example + `\n      (${v.n} worlds)`);
};
const dead = [...allLines].filter(([e]) => !reachable.has(e));
const floraDead = [...floraLines].filter(([e]) => !floraReach.has(e));
report('empty pools', holeMap);
console.log(`unreachable lines: ${dead.length}`);
for (const [e, label] of dead) console.log(`  - ${label} [${e.tags || ''}]\n    ${e.t}`);
console.log(`unreachable flora lines: ${floraDead.length}`);
for (const [e, label] of floraDead) console.log(`  - ${label} [${e.tags || ''}]\n    ${e.t}`);
report('lexicon conflicts', lexMap);
report('unfilled tokens', tokenMap);
console.log(`relation issues: ${relIssues.length}`);
for (const x of relIssues) console.log('  - ' + x);
console.log(`flora relation issues: ${floraRelIssues.length}`);
for (const x of floraRelIssues) console.log('  - ' + x);
console.log(`source log issues: ${sourceIssues.length}`);
for (const x of sourceIssues) console.log('  - ' + x);
if (storyStats) console.log(`\nstory length (characters): min ${storyStats.min}, median ${storyStats.median}, max ${storyStats.max}, over ${storyStats.n} species`);
// The spread of the log over the real worlds. A reader who finds ten wrecks has to meet at least
// six kinds of ending and at least six threads, so these two lists are the acceptance of issue 34
// slice 4 in numbers.
if (logsSeen) {
  const stat = (a) => { const b = a.slice().sort((x, y) => x - y); return `min ${b[0]}, median ${b[b.length >> 1]}, max ${b[b.length - 1]}`; };
  console.log(`\nlogs read            ${logsSeen}`);
  console.log(`entries per log      ${stat(entryCounts)}`);
  console.log(`crew per log         ${stat(crewSizes)}`);
  const byN = (m) => [...m].sort((a, b) => b[1] - a[1]);
  console.log(`ending kinds         ${endSpread.size} of ${SourceLore.ENDING_KINDS.length}`);
  for (const [k, c] of byN(endSpread)) console.log(`  ${String(c).padStart(4)}  ${k}`);
  console.log(`threads              ${threadSpread.size} distinct`);
  for (const [k, c] of byN(threadSpread)) console.log(`  ${String(c).padStart(4)}  ${k}`);
  // How the animal of each log gets about, with one line of that log, so the reader of the report
  // can see that a whale of the air never stands at the foot of the mast.
  console.log(`ways of moving       ${motionSpread.size} of ${SourceLore.MOTION.length}`);
  for (const [k, c] of byN(motionSpread)) {
    console.log(`  ${String(c).padStart(4)}  ${k}`);
    if (motionSample.has(k)) console.log(`        ${motionSample.get(k)}`);
  }
  for (const m of SourceLore.MOTION) if (!motionSpread.has(m)) console.log(`     0  ${m}  (no world in this sweep rolled one)`);
  // Repetition. Two wrecks in a row must not share a sentence, and no sentence should stand in
  // many logs. Both numbers are reported, because neither can be driven to zero by a gate.
  const top = [...sentenceCount].sort((a, b) => b[1] - a[1])[0];
  console.log(`\nrepetition`);
  console.log(`  distinct sentences  ${sentenceCount.size}`);
  if (top) console.log(`  commonest sentence  ${(top[1] / logsSeen * 100).toFixed(1)}% of logs (${top[1]}/${logsSeen})\n    ${top[0]}`);
  console.log(`  neighbour pairs that share a sentence  ${neighbourShared} of ${neighbourPairs}`);
  if (sharedExample) console.log(`    ${sharedExample}`);
}

for (const { seed, world, G } of sampleStories) {
  const l = G.lore;
  console.log(`\n--- ${seed} · ${world.type} · ${world.designation} · ${world.stats.temp} · ${world.stats.gravity} · ${world.stats.day} · ${world.moons.length} moons${world.rings ? ' · ring' : ''}${world.activity ? ' · ' + world.activity.kind : ''}`);
  console.log(`${l.name} (${l.latin})`);
  console.log(`${l.habitat} · ${l.size} · ${l.diet} · ${l.temperament}`);
  console.log(l.story);
}
const fail = holeMap.size + lexMap.size + tokenMap.size + relIssues.length + dead.length
  + floraRelIssues.length + floraDead.length + sourceIssues.length;
process.exit(fail ? 1 : 0);
