// Prints the third log of chapter 3 for real worlds, and checks the words of every fate.
//
//   node tools/lore-audit/way-sample.mjs [first] [count] [--fate <id>|all] [--seed <name>]
//   node tools/lore-audit/way-sample.mjs --check 300 [--wide]
//
// The print mode walks the seeds audit-<first>, audit-<first+1>, and so on, the seeds of
// log-sample.mjs, and prints each world where a crew reached the ruin: a header, the last entry of
// the log of the wreck and of the second log for context, and then the third log. `--fate all`
// prints every fate the crew allows, and `--fate <id>` prints one fate. With no --fate the tool
// prints the fate the seed takes. `--seed <name>` prints one named seed.
//
// The check mode sweeps the seeds and every fate the crew allows, and fails (exit 1) on:
//
//   - a token left unfilled, an empty entry, an entry of more than nine sentences
//   - a sentence over 20 words, an -ly word outside the allow list of audit.mjs, a simile, a hedge
//   - a sentence that opens on a small letter, a pronoun for a member of the crew
//   - a pronoun, "the herd", or "the young" before the entry names the animal
//   - a word that claims a fact the world does not have (the lexicon of audit.mjs)
//   - a word that says what the ruin is
//   - fewer than 7 or more than 10 entries, days that do not rise, a first entry before the last
//     day of the second log
//   - crew ends that break the table of the plan, a voice that breaks the contract
//   - one sentence twice in one log
//   - a pick whose bucket held fewer than three wordings
//   - a log of the fate the seed takes that is not world.twin.log
//
// `--wide` also runs each world again with the herd set to other species of the world that can
// build, and to a kin, so every way of moving meets every fate. It prints the fates, the forms,
// the types, the motions, the crew sizes, the ends of the second log, and the needs it covered,
// and the ten commonest sentences.
import * as generate from '../../generate.js';
import { WayLore } from '../../way-lore.js';
import { SourceLore } from '../../source-lore.js';
import { Lore } from '../../lore.js';
import { fatesFor, FATE_IDS } from '../../way-types.js';

// ---------------------------------------------------------------- the stream of generate.js
// generate.js does not export makeRng(), so this is the same code: cyrb128, sfc32, and 20 draws.
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function makeRng(seedStr) {
  const h = cyrb128(seedStr);
  const r = sfc32(h[0], h[1], h[2], h[3]);
  for (let i = 0; i < 20; i++) r();
  return r;
}

// ---------------------------------------------------------------- the arguments
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf('--' + name);
  return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true);
};
const plain = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && argv[i - 1] !== '--wide'));
const OPTS = { detail: 24, maxFlora: 200, maxFauna: 40 };
const worldOf = (seed) => generate.world(seed, OPTS).world;
const crewAt = (w) => !!(w && w.ruin && w.ruin.log && w.twin && w.twin.fate);
const write = (w, fate, trace) => WayLore.writeWayLog({ world: w, rng: makeRng(w.seed + '|way-lore'), fate, trace });
const motionOf = (G) => SourceLore.motionOf(G);
const BUILDERS = ['mwalk', 'mcrawl', 'msling', 'mdig', 'mfly'];

// ---------------------------------------------------------------- the checks
// The style rules of audit.mjs, copied: audit.mjs runs its sweep when it is imported.
const ADVERB_OK = new Set(['only', 'early', 'family', 'supply', 'reply', 'belly', 'fly', 'ugly',
  'monthly', 'weekly', 'daily', 'assembly', 'unfriendly', 'mostly']);
const STYLE_BAD = [
  [/\b(?:is|was) the whole of the\b|\bthat is the whole\b/i, 'a filler'],
  [/\bwhatever (?:it|this|that|the)\b/i, 'a vague reference'],
  [/\bthe wind decides\b|\bthe quiet\b|\bthe wet\b/i, 'a vague reference'],
  [/ like an? /i, 'a simile'],
  [/ as if /i, 'a simile'],
  [/ as though /i, 'a simile'],
  [/\bseem(s|ed|ing)?\b/i, 'a hedge'],
  [/ as \w+ as /i, 'a comparison'],
];
const LEXICON = [
  [/\brain(s|ed|ing)?\b/i, 'rainy'],
  [/\btides?\b|\btidal\b/i, 'tides'],
  [/\bmoons?\b/i, 'moonlit'],
  [/\btrees?\b|\bbark\b|\bbranch(es)?\b|\bleaf\b|\bthe leaves\b|\bforest\b|\bwood\b/i, 'woody'],
  [/\bgrass\b/i, 'woody|fungal|cactus|turf'],
  [/\bspores?\b/i, 'flora'],
  [/\bcrystals?\b|\bspires?\b/i, 'crystalflora'],
  [/\bcactus\b|\bcacti\b/i, 'cactus'],
  [/\bcaps?\b|\bmushrooms?\b/i, 'fungal'],
  [/\bsnow\b|\bfrost\b|\bthaw\b|\bthe ice\b|\bfrozen crust\b/i, 'frozen|cold|coldground'],
  [/\bdrinks?\b|\bthe shallows\b|\bfog\b|\bground water\b|\bopen water\b|\bstanding water\b|\bsteams\b|\bthe wet\b/i, 'waterliquid'],
  [/\bcliffs?\b|\bthe plain\b|\bhigh ground\b/i, '!noground'],
  [/\bthe vents?\b|\bthe flows?\b|\bash\b/i, 'volcanic|geysers|molten|lava'],
  [/\bbolt\b|\bthe charge\b|\bstorm belts?\b/i, 'stormy|gas'],
  [/\baurorae?\b/i, 'auroral'],
  [/\bgeysers?\b/i, 'geysers'],
  [/\blightning\b/i, 'stormy'],
  [/\bthe ring overhead\b/i, 'ringed'],
  [/\bthe sea\b|\bthe coast\b/i, 'hasocean'],
  [/\bpolar night\b|\bstop rising\b|\bwill not come back up\b|\bunder the horizon for\b|\bflat circle\b|\bround the horizon\b|\bnot come back inside\b|\bdoes not rise\b|\bno sun rises\b/i, 'polarnight'],
  // Water a person drinks or a river runs with needs liquid water on the world.
  [/\briver\b|\bspring\b|\bpool\b|\blake\b|\bstream\b/i, 'waterliquid|desert'],
];
const RUIN_WHAT = /\b(?:ruins?|temples?|tombs?|shrines?|city|cities|portals?|gateways?|aliens?|machines?|built by|builders?|makers?|teleport\w*)\b/i;
const CREW_PRONOUN = /\b(?:he|she|him|her|his|hers|himself|herself)\b/i;
const IMPERSONAL = /^(It is|It was|It has been|It took|It rained|It has rained|It rains)\b/;

const sentencesOf = (text) => String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const wordsIn = (s) => s.split(/\s+/).filter(Boolean).length;

// The names the text of a log may print for the animal: the short noun, its plural, the full name,
// and the pet name of the young one.
function animalWords(G) {
  const name = G.lore.name.toLowerCase();
  const k = SourceLore.shortNoun(G.lore.name);
  return [k, k + 's', name, G.lore.plural.toLowerCase()];
}
// The first place in the text that names the animal, or -1.
function firstNaming(text, G) {
  const low = text.toLowerCase();
  let at = -1;
  for (const w of animalWords(G)) {
    const re = new RegExp('\\b' + w.replace(/[-]/g, '\\-') + '\\b');
    const m = re.exec(low);
    if (m && (at < 0 || m.index < at)) at = m.index;
  }
  return at;
}
function subjectIssue(text, G) {
  const at = firstNaming(text, G);
  if (at < 0) return null;
  // A naming that the words right before it lead into, 'a herd of' or 'the young', is one phrase.
  const head = text.slice(0, at).replace(/(?:\b(?:a|the) herd of|\b(?:a |the )?young|\bold)\s*$/i, '');
  // Each sentence of the head: a pronoun that is not the impersonal "it" of an opening.
  for (const s of sentencesOf(head)) {
    const body = IMPERSONAL.test(s) ? s.replace(IMPERSONAL, '') : s;
    const m = /\b(it|its|they|them|their|herd)\b/i.exec(body);
    if (m) return `"${m[0]}" before the entry names the animal`;
  }
  const young = /\bthe young\b(?!\s+\w+s?\b)/i.exec(head);
  if (young) return '"the young" before the entry names the animal';
  return null;
}
// ---------------------------------------------------------------- the lint of the pools
// Each wording of WayLore.POOLS, once, with every token at its longest fill. WORST holds the words
// a token can print at most, the way audit.mjs counts the tokens of the first two logs.
const WORST = {
  other: 5, Other: 5, others: 5, Others: 5, kind: 1, Kind: 1, kinds: 1, Kinds: 1, calf: 2, count: 1, young: 1,
  makerbody: 5, site: 3, Site: 3, name: 1, sign: 3, far: 1, farfrom: 1, sent: 2, phase: 5, wait: 1, newname: 1,
  keeper: 1, keeperjob: 2, shipkeeper: 1, stayer: 1, one: 1, onejob: 2, two: 1, twojob: 2, who: 1, whojob: 2,
  we: 1, We: 1, us: 1, our: 1, Our: 1, lost: 1, lostjob: 2, gone: 4, gonethe: 2, Gonethe: 2, goneone: 1, last: 1, lastjob: 2, first: 1, deadlist: 7,
  rest: 4, crewlist: 9, crewleft: 1, probe: 2, world: 2, temp: 2, day: 2, night: 2, moon: 1, plant: 1,
  plants: 1, Plants: 1, years: 1, days: 1, prevday: 1, keeperday: 1, replyday: 1, food: 1, cells: 1, pace: 1, walk: 1, signs: 1,
};
// A token whose fill starts with a small letter may not open a sentence after the first.
const LOWER_START = new Set(['other', 'others', 'kind', 'kinds', 'count', 'young', 'plant', 'plants', 'site',
  'makerbody', 'phase', 'sent', 'farfrom', 'we', 'us', 'our', 'onejob', 'twojob', 'keeperjob', 'whojob',
  'lostjob', 'lastjob', 'crewleft', 'gonethe', 'pace', 'signs', 'wait']);
const NAMING = new Set(['other', 'Other', 'others', 'Others', 'kind', 'Kind', 'kinds', 'Kinds', 'calf']);
function lintPools() {
  const bad = [];
  const known = new Set(WayLore.TOKENS);
  for (const [name, list] of Object.entries(WayLore.POOLS)) {
    list.forEach((e, i) => {
      const at = `${name}[${i}]`;
      const t = e.t;
      for (const m of t.matchAll(/\{(\w+)\}/g)) if (!known.has(m[1])) bad.push(`${at}: the token {${m[1]}} is not in TOKENS`);
      const wide = t.replace(/\{(\w+)\}/g, (m, k) => 'x '.repeat(WORST[k] || 1).trim());
      for (const s of sentencesOf(wide)) if (wordsIn(s) > 20) bad.push(`${at}: a sentence of ${wordsIn(s)} words at the longest fill: ${t}`);
      if (sentencesOf(t).length > 5 && name !== 'MAD_HEAD') bad.push(`${at}: ${sentencesOf(t).length} sentences in one wording`);
      for (const m of t.matchAll(/(^|[.!?]\s+)\{(\w+)\}/g)) {
        if (m.index === 0 && m[1] === '') continue;
        if (LOWER_START.has(m[2])) bad.push(`${at}: a sentence opens on {${m[2]}}, which prints a small letter: ${t}`);
      }
      for (const w of t.match(/\b[a-z]+ly\b/gi) || []) if (!ADVERB_OK.has(w.toLowerCase())) bad.push(`${at}: the -ly word "${w}"`);
      for (const [re, what] of STYLE_BAD) if (re.test(t)) bad.push(`${at}: ${what}: ${t}`);
      if (CREW_PRONOUN.test(t)) bad.push(`${at}: a pronoun for a person: ${t}`);
      if (RUIN_WHAT.test(t)) bad.push(`${at}: says what the ruin is: ${t}`);
      // A wording that names the animal names it before any pronoun or stand-in.
      const marked = t.replace(/\{(\w+)\}/g, (m, k) => (NAMING.has(k) ? ' ANIMALNAME ' : ' TOKEN '));
      const first = marked.indexOf('ANIMALNAME');
      if (first >= 0) {
        const head = marked.slice(0, first).replace(/(?:\b(?:a|the) herd of|\b(?:a |the )?young|\bold)\s*$/i, '');
        for (const s of sentencesOf(head)) {
          const body = IMPERSONAL.test(s) ? s.replace(IMPERSONAL, '') : s;
          const m = /\b(it|its|they|them|their|herd)\b/i.exec(body);
          if (m) { bad.push(`${at}: "${m[0]}" before the wording names the animal: ${t}`); break; }
        }
        if (/\bthe young\b\s*$/i.test(head) === false && /\bthe young\b(?!\s+ANIMALNAME)/i.test(head)) bad.push(`${at}: "the young" before the wording names the animal: ${t}`);
      }
      // "we" and "I" agree in the past tense and in most present verbs, never in "are" or "were".
      if (/\{we\} (?:are|were)\b|\{We\} (?:are|were)\b/.test(t)) bad.push(`${at}: {we} before are or were: ${t}`);
      if (/\{(?:we|We|us)\}[^.]*\b(?:all of us|both of us|each of us|each other)\b/.test(t)) bad.push(`${at}: {we} with a plural phrase: ${t}`);
    });
  }
  return bad;
}

function lexIssues(text, tags) {
  const bad = [];
  for (const [re, gate] of LEXICON) {
    if (!re.test(text)) continue;
    if (/moon/.test(gate) && /\bno moon\b/i.test(text)) continue;
    if (!Lore.matchTags(Lore.parseGate(gate), tags)) bad.push(`${re.source.slice(0, 40)} needs ${gate}`);
  }
  return bad;
}

// The ends of the people, by the table of the plan.
function endsIssue(log, second, form) {
  const ends = log.crew.map((c) => c.end);
  const n = (e) => ends.filter((x) => x === e).length;
  const crew = ends.length, home = n('home');
  const keeperEnd = (log.crew.find((c) => c.name === log.keeper) || {}).end;
  if (JSON.stringify(log.crew.map((c) => c.name)) !== JSON.stringify(second.crew.map((c) => c.name))) return 'the crew is not the crew of the second log';
  switch (log.fate) {
    case 'pact': return home === crew ? null : `pact ends ${ends}`;
    case 'trek': return (crew >= 3 ? home === crew - 1 && n('lost') === 1 && keeperEnd === 'home' : home === crew) ? null : `trek ends ${ends}`;
    case 'split': return (crew >= 2 && keeperEnd === 'home' && n('gone') >= 1 && home + n('gone') === crew && (crew < 3 || home >= 2)) ? null : `split ends ${ends}`;
    case 'sour': return (crew <= 2 ? n('lost') === crew : home === 1 && n('lost') === crew - 1 && keeperEnd === 'lost') ? null : `sour ends ${ends}`;
    case 'mad': return n('gone') === crew ? null : `mad ends ${ends}`;
    case 'change': return (form === 'light' ? n('gone') === crew : n('changed') === crew) ? null : `change ${form} ends ${ends}`;
    default: return `unknown fate ${log.fate}`;
  }
}
function voiceIssue(log, years) {
  const v = log.voice;
  const home = log.crew.filter((c) => c.end === 'home');
  const line = `Thank god, it's been ${years} years, but they sent a rescue ship! I'm glad we kept going.`;
  if (home.length) {
    if (!v || v.home !== true) return 'a crew with a person home has no rescue voice';
    const speaker = home.find((c) => c.name === log.keeper) || home[0];
    if (v.speaker !== speaker.name) return `the voice speaker ${v.speaker} is not ${speaker.name}`;
    if (log.fate === 'split' || log.fate === 'sour') {
      if (!v.line.startsWith(line)) return `the rescue line reads ${v.line}`;
      const tail = v.line.slice(line.length);
      if (tail && (!/^ \S/.test(tail) || sentencesOf(tail).length > 2 || /\{\w+\}/.test(tail))) return `the tail of the rescue line reads ${tail}`;
    } else if (v.line !== line) return `the rescue line reads ${v.line}`;
    return null;
  }
  if (log.form === 'chorus') {
    if (!v || v.home !== false || v.speaker !== log.keeper || !v.line) return `the chorus voice reads ${JSON.stringify(v)}`;
    return null;
  }
  return v === null ? null : `a crew with nobody home speaks: ${JSON.stringify(v)}`;
}

// Every check on one log. `real` is the log of the fate the seed takes, or null.
function checkLog(w, log, trace, G, fails, label) {
  const second = w.ruin.log;
  const years = w.source.log.years || 12;
  const tags = new Set(trace.tags || []);
  const bad = (what) => fails.push(`${label}: ${what}`);
  if (!log) { bad('no log'); return; }
  if (log.entries.length < 7 || log.entries.length > 10) bad(`${log.entries.length} entries`);
  if (log.through < second.days) bad(`through day ${log.through} before the second log ends on ${second.days}`);
  if (log.entries[0].day !== log.through || log.entries[0].slot !== 'way.through') bad('the first entry is not the day through');
  if (log.days !== log.entries[log.entries.length - 1].day) bad('log.days is not the last day');
  if (log.entries[log.entries.length - 1].slot !== 'end.' + log.fate) bad(`the last slot is ${log.entries[log.entries.length - 1].slot}`);
  log.entries.forEach((e, j) => { if (j && e.day <= log.entries[j - 1].day) bad(`day ${e.day} after day ${log.entries[j - 1].day}`); });
  if (log.years !== years) bad(`years ${log.years}, not ${years}`);
  const ends = endsIssue(log, second, log.form);
  if (ends) bad(ends);
  const voice = voiceIssue(log, years);
  if (voice) bad(voice);
  const seen = new Map();
  for (const e of log.entries) {
    const at = `${e.slot} day ${e.day}`;
    if (!e.text || !e.text.trim()) { bad(`${at}: empty`); continue; }
    if (/\{\w+\}/.test(e.text)) bad(`${at}: unfilled ${e.text.match(/\{\w+\}/)[0]}`);
    if (/ {2}|\s[,.]|\bthe the\b|\ba a\b/i.test(e.text)) bad(`${at}: a gap or a doubled word: ${e.text}`);
    const sents = sentencesOf(e.text);
    if (sents.length > 9) bad(`${at}: ${sents.length} sentences`);
    sents.forEach((s, k) => {
      if (wordsIn(s) > 20) bad(`${at}: a sentence of ${wordsIn(s)} words: ${s}`);
      const last = e.slot === 'end.mad' && k === sents.length - 1;
      if (!last && /^[a-z]/.test(s)) bad(`${at}: a sentence opens on a small letter: ${s}`);
      if (seen.has(s)) bad(`${at}: the sentence "${s}" stands twice in one log`);
      seen.set(s, true);
    });
    for (const w of e.text.match(/\b[a-z]+ly\b/gi) || []) if (!ADVERB_OK.has(w.toLowerCase())) bad(`${at}: the -ly word "${w}"`);
    for (const [re, what] of STYLE_BAD) if (re.test(e.text)) bad(`${at}: ${what}: ${e.text}`);
    if (CREW_PRONOUN.test(e.text)) bad(`${at}: a pronoun for a person: ${e.text}`);
    const what = e.text.match(RUIN_WHAT);
    if (what) bad(`${at}: "${what[0]}" says what the ruin is`);
    const subj = subjectIssue(e.text, G);
    if (subj) bad(`${at}: ${subj}: ${e.text}`);
    // The name of an animal is a name and not a claim: 'the river tendril sailer' needs no river.
    const named = [G.lore.name, G.lore.plural].reduce((x, nm) => x.split(new RegExp(nm, 'gi')).join('ANIMAL'), e.text);
    for (const x of lexIssues(named, tags)) bad(`${at}: the lexicon: ${x}: ${e.text}`);
  }
  for (const p of trace.picks) if (p.n < 3) fails.push(`bucket ${p.label} holds ${p.n} wording(s) for [${p.tags.join(' ')}]`);
}

// ---------------------------------------------------------------- printing
function header(w, i) {
  const first = w.source.log, second = w.ruin.log, t = w.twin;
  const G = w.species[t.herd];
  const endSlot = second.entries[second.entries.length - 1].slot;
  return `\n=== ${w.seed} · ${w.type} · ${w.stats ? w.stats.temp : w.env.tempC + ' °C'} · ruin ${w.ruin.proto}`
    + ` · herd ${G.lore.name} (${motionOf(G)}${G.kin ? ', kin' : ''}${first.species === G.lore.name ? ', known' : ''})`
    + `\ncrew ${second.crew.map((c) => `${c.name} (${c.role})`).join(', ')} · went ${second.went} by ${second.by}`
    + ` · second log ends ${endSlot} on day ${second.days} · twin ${t.km} km ${t.from} · fate ${t.fate}${t.form ? '/' + t.form : ''}`;
}
function printLog(w, log, fate) {
  const second = w.ruin.log;
  const own = fate === w.twin.fate ? (JSON.stringify(log) === JSON.stringify(w.twin.log) ? ' · the fate of this seed' : ' · THE FATE OF THIS SEED, AND NOT world.twin.log') : '';
  console.log(`\n--- third log · ${fate}${log.form ? '/' + log.form : ''} · through day ${log.through} · ${log.entries.length} entries · last day ${log.days}${own}`);
  for (const e of log.entries) console.log(`\n[day ${e.day} · ${e.slot}] ${e.text}`);
  console.log(`\n    ends: ${log.crew.map((c) => `${c.name} ${c.end}`).join(', ')}`);
  console.log(`    voice: ${log.voice ? `${log.voice.speaker} (${log.voice.home ? 'home' : 'stays'}): "${log.voice.line}"` : 'none'}`);
  void second;
}
function printWorld(w) {
  const first = w.source.log, second = w.ruin.log;
  console.log(header(w));
  const a = first.entries[first.entries.length - 1], b = second.entries[second.entries.length - 1];
  console.log(`\n  [log of the wreck, day ${a.day} · ${a.slot}] ${a.text}`);
  console.log(`\n  [second log, day ${b.day} · ${b.slot}] ${b.text}`);
}

// ---------------------------------------------------------------- the check sweep
function check(N, wide) {
  const fails = lintPools();
  const cover = { fate: {}, form: {}, type: {}, motion: {}, crew: {}, from: {}, need: {}, cond: {} };
  const bump = (k, v) => { cover[k][v] = (cover[k][v] || 0) + 1; };
  const sentenceLogs = new Map();
  let logs = 0, worlds = 0;
  for (let i = 0; i < N; i++) {
    const w = worldOf('audit-' + i);
    if (!crewAt(w)) continue;
    worlds++;
    const n = w.ruin.log.crew.length;
    // The fate the seed takes must be world.twin.log, and the writer must not touch the world.
    const before = JSON.stringify(w.twin) + JSON.stringify(w.ruin.log) + JSON.stringify(w.source.log) + w.species.length;
    const again = write(w, w.twin.fate, null);
    if (JSON.stringify(again) !== JSON.stringify(w.twin.log)) fails.push(`${w.seed}: the log of fate ${w.twin.fate} is not world.twin.log`);
    // The herds to run: the real one, and with --wide the other builders of the world and a kin.
    const herds = [{ w, label: '' }];
    if (wide) {
      const have = new Set([motionOf(w.species[w.twin.herd]) + (w.species[w.twin.herd].kin ? 'kin' : '')]);
      w.species.forEach((S, j) => {
        const m = motionOf(S);
        if (!S.lore || !BUILDERS.includes(m) || have.has(m)) return;
        have.add(m);
        herds.push({ w: { ...w, twin: { ...w.twin, herd: j } }, label: ' herd ' + m });
      });
      if (!have.has('mwalkkin')) {
        const G = w.species[w.twin.herd];
        const species = w.species.slice();
        species[w.twin.herd] = { ...G, kin: true, loco: 'quad', cls: 'land', plan: 'blob' };
        herds.push({ w: { ...w, species }, label: ' herd kin' });
      }
    }
    for (const h of herds) {
      for (const fate of fatesFor(n)) {
        const trace = { picks: [], tags: null };
        const log = write(h.w, fate, trace);
        logs++;
        const G = h.w.species[h.w.twin.herd];
        checkLog(h.w, log, trace, G, fails, `${w.seed} ${fate}${h.label}`);
        if (!log) continue;
        bump('fate', fate);
        if (log.form) bump('form', log.form);
        bump('type', w.type);
        bump('motion', motionOf(G) + (G.kin ? '.kin' : ''));
        bump('crew', n);
        const tags = new Set(trace.tags);
        bump('from', [...tags].find((t) => t.startsWith('from')));
        bump('need', ([...tags].find((t) => t.startsWith('need')) || 'none').slice(4));
        bump('cond', ['openair', 'coldsuit', 'hotsuit', 'lava'].find((t) => tags.has(t)));
        const here = new Set();
        for (const e of log.entries) for (const s of sentencesOf(e.text)) here.add(s);
        for (const s of here) sentenceLogs.set(s, (sentenceLogs.get(s) || 0) + 1);
      }
    }
    const after = JSON.stringify(w.twin) + JSON.stringify(w.ruin.log) + JSON.stringify(w.source.log) + w.species.length;
    if (before !== after) fails.push(`${w.seed}: the writer changed the world`);
  }
  const line = (k) => Object.entries(cover[k]).sort().map(([a, b]) => `${a} ${b}`).join(', ');
  console.log(`way-sample --check ${N}${wide ? ' --wide' : ''}: ${worlds} worlds with a crew at the ruin, ${logs} logs`);
  for (const k of Object.keys(cover)) console.log(`  ${k.padEnd(7)} ${line(k)}`);
  const top = [...sentenceLogs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('  the ten commonest sentences, in logs:');
  for (const [s, c] of top) console.log(`    ${String(c).padStart(4)} (${(100 * c / logs).toFixed(1)}%)  ${s}`);
  const unique = [...new Set(fails)];
  if (unique.length) {
    console.log(`\nFAIL: ${unique.length} problems`);
    for (const f of unique.slice(0, Number(flag("show") || 60))) console.log('  ' + f);
    if (unique.length > 60) console.log(`  ... and ${unique.length - 60} more`);
    process.exit(1);
  }
  console.log('\nOK: every check passes');
}

// ---------------------------------------------------------------- main
const checkN = flag('check');
if (flag('lint')) {
  const bad = lintPools();
  for (const b of bad) console.log('  ' + b);
  console.log(bad.length ? `FAIL: ${bad.length} problems in the pools` : 'OK: every wording passes the lint');
  process.exit(bad.length ? 1 : 0);
} else if (checkN) {
  check(Number(checkN === true ? 300 : checkN), !!flag('wide'));
} else {
  const fateArg = flag('fate');
  const seedArg = flag('seed');
  const start = Number(plain[0] || 0), count = Number(plain[1] || 3);
  const seeds = seedArg ? [seedArg] : null;
  let shown = 0;
  for (let i = start; seeds ? shown < 1 : (shown < count && i < start + 2000); i++) {
    const w = worldOf(seeds ? seeds[0] : 'audit-' + i);
    if (!crewAt(w)) {
      if (seeds) console.log(`${w.seed}: nobody reached the ruin, so the twin holds no third log.`);
      if (seeds) break;
      continue;
    }
    const fates = fateArg === 'all' ? fatesFor(w.ruin.log.crew.length)
      : fateArg && fateArg !== true ? [fateArg] : [w.twin.fate];
    if (fateArg && fateArg !== 'all' && !fatesFor(w.ruin.log.crew.length).includes(fateArg)) continue;
    shown++;
    printWorld(w);
    for (const fate of fates) {
      if (!FATE_IDS.includes(fate)) { console.log(`unknown fate ${fate}`); continue; }
      printLog(w, write(w, fate, null), fate);
    }
    if (seeds) break;
  }
}
