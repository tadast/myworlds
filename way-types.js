// myworlds — chapter 3, the way on: the pure rules of the twin, the name, the key, the send, and the
// fates of the crew. See docs/issues/p3-00-the-way-on.md.
//
// The last row of the card of the ruin holds a line of glyphs: a name in the script of the makers.
// In chapter 3 the reader reads it. The ruin sends the beacon of the crew back, and the beacon
// carries the call sign of the ship, so the card shows the call sign in the script of the makers
// under the letters the reader knows. That is the key. The probe also hears sixteen sounds in the
// call. The reader matches the glyphs to letters, sends the name, and the ruin lights each glyph
// that is right. The right name carries the probe to the twin: the ruin of the same proto, far
// across the same world.
//
// It holds no three.js and no DOM, on the pattern of ruin-types.js, so the worker, the page, and
// the tools import it. Every pick here is a hash of the seed and not a draw from a stream.
import { portalSeed, glyphsOf, SYLLABLES, protoRow, RUIN_PROTOS } from './ruin-types.js';

// FNV-1a over the characters of a string, as ruin-types.js has it.
function fnv(s) {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const seedOf = (world) => String((world && world.seed) || '');

// ---------------------------------------------------------------- the name and the key
// The name the glyphs of the way on spell: the name the makers gave the twin. It is the word that
// portalSeed() rolls, so the glyphs that p2-42 drew are the glyphs the reader reads now.
export function nameOf(world) {
  return world && world.ruin ? portalSeed(world) : null;
}

// The words of a number from 0 to 99, as a call sign says it.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function numberWords(n) {
  const v = Math.max(0, Math.min(99, Math.round(n)));
  if (v < 20) return ONES[v];
  return TENS[Math.floor(v / 10)] + (v % 10 ? ' ' + ONES[v % 10] : '');
}

// The call sign of the ship in words: 'Verge 10' gives 'Verge ten'. The beacon sends it, and the
// ruin sends it back in its own script. That is the key of the decoding.
export function callSign(world) {
  const probe = world && world.source && world.source.log && world.source.log.probe;
  if (!probe) return null;
  return String(probe).replace(/\d+/g, (d) => numberWords(Number(d)));
}

// The key of one world: the name as glyphs, the call sign as glyphs with its letters, and the
// sounds the probe hears in the call. The name itself stays out: the page must not hold it before
// the reader sends it. `slots` gives, for each glyph of the name, the index of the glyph in the
// script, so two equal glyphs share one field on the card.
export function wayKey(world) {
  const name = nameOf(world);
  const sign = callSign(world);
  if (!name) return null;
  const letters = name.toLowerCase();
  return {
    glyphs: glyphsOf(letters),
    slots: Array.from(letters, (ch) => ch.charCodeAt(0) - 97),
    reply: sign ? { glyphs: glyphsOf(sign), text: sign.toUpperCase() } : null,
    sounds: SYLLABLES.slice(),
  };
}

// ---------------------------------------------------------------- the send
// The reader sends a name to the ruin. The ruin lights each glyph whose letter is right, and a name
// with every glyph right carries the probe. The case does not count, and any character that is not
// a letter goes before the test. `lit` holds one flag for each glyph of the name.
//
//   kind   'empty', 'short', 'dark', 'some', or 'open'
//   text   the answer line of the card
export function sendName(text, name) {
  const want = String(name || '').toLowerCase();
  const got = String(text == null ? '' : text).toLowerCase().replace(/[^a-z]/g, '');
  const lit = Array.from(want, (ch, i) => got[i] === ch);
  const n = lit.filter(Boolean).length;
  if (!got) return { kind: 'empty', lit, n, of: want.length, text: 'The stones take a name. Give every mark a letter first.' };
  if (got.length < want.length) {
    return { kind: 'short', lit: lit.map(() => false), n: 0, of: want.length,
      text: `The name has ${want.length} marks. Give every mark a letter first.` };
  }
  if (got === want) return { kind: 'open', lit, n, of: want.length, text: 'The stones answer the name.' };
  if (!n) return { kind: 'dark', lit, n, of: want.length, text: 'No mark answers. The stones stay dark.' };
  return { kind: 'some', lit, n, of: want.length, text: `${n} of ${want.length} marks answer. The stones stay dark.` };
}

// ---------------------------------------------------------------- the fates
// The six ways the story of the crew at the twin can end. The crew that went through the way meets
// the herd, and the herd needs something the crew can give. What happens next is the fate:
//
//   pact     the crew helps the herd, and the herd keeps the crew alive. Everybody lives
//   trek     the herd walks a long circle over the land, and the crew goes with it. The crew comes
//            back to the stones with the herd. One person of a crew of three or more dies on the way
//   split    the crew cannot agree. Some go on with the herd and do not come back. The rest stay
//   sour     the pact breaks. A crew of one or two dies. A larger crew loses all but one person
//   mad      the stones never stop calling. The crew stops eating, answers the stones, and at the
//            end walks into the light of the stones
//   change   the world takes the crew in, by the form of its type: the chorus of the herd, the long
//            sleep in the den, or the light of the stones
//
// `home` says whether a fate can leave a person who lives, unchanged, at the tent: that person meets
// the reader, and the reader takes the crew home. `min` is the least crew a fate needs.
export const FATES = Object.freeze([
  Object.freeze({ id: 'pact', title: 'The pact', home: true, min: 1 }),
  Object.freeze({ id: 'trek', title: 'The long walk', home: true, min: 1 }),
  Object.freeze({ id: 'split', title: 'The split', home: true, min: 2 }),
  Object.freeze({ id: 'sour', title: 'The broken pact', home: true, min: 1 }),
  Object.freeze({ id: 'mad', title: 'The echo', home: false, min: 1 }),
  Object.freeze({ id: 'change', title: 'The change', home: false, min: 1 }),
]);
export const FATE_IDS = FATES.map((f) => f.id);
export const fateRow = (id) => FATES.find((f) => f.id === id) || null;

// The fates a crew of `n` people allows, in the order of the table.
export function fatesFor(n) {
  return FATES.filter((f) => n >= f.min).map((f) => f.id);
}

// The fate of the crew of one world, or null where nobody reached the ruin. The FNV hash of
// 'fate:' + seed picks among the fates the crew allows. `force` is a fate id of the debug option
// `?fate=`, and it wins when the crew allows it.
export function fateOf(world, force = null) {
  const log = world && world.ruin && world.ruin.log;
  if (!log || !log.crew || !log.crew.length) return null;
  const list = fatesFor(log.crew.length);
  if (force && list.includes(force)) return force;
  return list[fnv('fate:' + seedOf(world)) % list.length];
}

// The form the change takes on a world of each type: what the planet lets a person become to live
// there. The chorus is the mind of the herd, the sleep is the long sleep in the den of the herd,
// and the light is the light of the stones. An exotic world takes the chorus or the light by a hash.
export const FORMS = Object.freeze(['chorus', 'sleep', 'light']);
export function formOf(world) {
  switch (world && world.type) {
    case 'ice': case 'desert': return 'sleep';
    case 'lava': return 'light';
    case 'exotic': return fnv('form:' + seedOf(world)) % 2 ? 'light' : 'chorus';
    default: return 'chorus';
  }
}

// ---------------------------------------------------------------- the tent at the twin
// The crew went through the way with what it carried: packs, the hand beacon, and a tent. The tent
// stands at the edge of the disc of the twin, with its door toward the stones, as the camp of p2-43
// stands at the ruin. What stands around it follows the fate:
//
//   up      the tent stands when a person lives there, and for the chorus, which left it standing.
//           Otherwise it lies flat
//   graves  a small cairn for each person a living person buried. See gravesOf()
//   marks   a ring of stones with the marks of the makers cut into them: the fate `mad`
//   suits   the suits of the crew, laid in a row by the door: the chorus of the fate `change`
//
// patchRuin() in generate.js places the tent and keeps the plants off it, and wreck-geometry.js
// builds it, so both read the layout here. The frame is the frame of the camp of p2-43: x points at
// the middle of the twin, z runs along the edge of the disc, y is up, in units before the scale.
export const TWIN_CAMP = Object.freeze({
  scale: 0.8,
  gap: 1.5,        // units of clear ground between the flat disc and the nearest part
  ease: 3,         // units over which the pad eases back to the ground
  tent: Object.freeze([0, 0, 2.4]),
  fire: Object.freeze([3.2, -2.4, 0.9]),
  packs: Object.freeze([3.0, 2.3, 0.8]),
  flag: Object.freeze([-1.6, -2.9, 0.4]),
  suits: Object.freeze([3.4, 0, 1.2]),
  graves: 4,       // the most cairns the row holds
  marks: 9,        // the stones of the ring of marks
  ring: 4.9,       // units: the radius of the ring of marks
  door: Object.freeze([2.6, 0]),   // the door of the tent, where a person steps out
});
const graveAt = (i) => [-3.6, -2.4 + i * 1.6, 0.7];
const markAt = (i) => {
  const a = (i + 0.5) / TWIN_CAMP.marks * Math.PI * 2;
  return [Math.cos(a) * TWIN_CAMP.ring, Math.sin(a) * TWIN_CAMP.ring, 0.45];
};

// The parts of one tent, `info` = { up, graves, marks, suits }, as circles [x, z, r] in the frame of
// the camp and after the scale, each with the name of its part.
export function tentParts(info) {
  const k = TWIN_CAMP.scale;
  const out = [['tent', ...TWIN_CAMP.tent], ['fire', ...TWIN_CAMP.fire], ['packs', ...TWIN_CAMP.packs], ['flag', ...TWIN_CAMP.flag]];
  if (info && info.suits) out.push(['suits', ...TWIN_CAMP.suits]);
  const g = Math.min(TWIN_CAMP.graves, (info && info.graves) || 0);
  for (let i = 0; i < g; i++) out.push(['grave', ...graveAt(i)]);
  if (info && info.marks) for (let i = 0; i < TWIN_CAMP.marks; i++) out.push(['mark', ...markAt(i)]);
  return out.map(([part, x, z, r]) => ({ part, x: x * k, z: z * k, r: r * k }));
}

// The same circles in the frame of the patch. `info` is patch.source.tent, with x, z, and yaw. The
// yaw turns the camp about y as three.js turns a group, as campCircles() of ruin-types.js has it.
export function tentCircles(info) {
  if (!info) return [];
  const c = Math.cos(info.yaw || 0), s = Math.sin(info.yaw || 0);
  return tentParts(info).map((p) => ({ part: p.part, x: info.x + c * p.x + s * p.z, z: info.z - s * p.x + c * p.z, r: p.r }));
}

// A point of the frame of the camp, before the scale, in the frame of the patch.
export function tentPoint(info, x, z) {
  const k = TWIN_CAMP.scale, c = Math.cos(info.yaw || 0), s = Math.sin(info.yaw || 0);
  return { x: info.x + c * x * k + s * z * k, z: info.z - s * x * k + c * z * k };
}

// The tent of the third log `log` at the twin `twin`, before the place: what stands, from the ends of
// the people. Null when nobody came.
export function tentOf(twin) {
  const log = twin && twin.log;
  if (!log) return null;
  const home = homeOf(log).length;
  const chorus = twin.form === 'chorus';
  return {
    kind: 'tent',
    up: home > 0 || chorus,
    graves: Math.min(TWIN_CAMP.graves, gravesOf(log)),
    marks: log.fate === 'mad',
    suits: chorus ? log.crew.filter((c) => c.end === 'changed').length : 0,
  };
}

// ---------------------------------------------------------------- the ends of the people
// Each person of the crew at the twin ends one way:
//
//   home      alive and unchanged, at the tent. The reader meets this person
//   lost      dead. A person who lived buried this person, and a small cairn marks the grave
//   gone      went on with the herd, or into the light of the stones, and is not at the twin
//   changed   alive, and part of the herd or asleep in its den
//
// The third log sets the end of each person in its `crew`. These helpers read it.
export const ENDS = Object.freeze(['home', 'lost', 'gone', 'changed']);
export const homeOf = (log) => (log && log.crew ? log.crew.filter((c) => c.end === 'home') : []);

// The graves at the tent: a person who died where another person lived to bury that person. When
// nobody lived, the last person to die has no grave.
export function gravesOf(log) {
  if (!log || !log.crew) return 0;
  const lost = log.crew.filter((c) => c.end === 'lost').length;
  return homeOf(log).length || log.crew.some((c) => c.end === 'changed') ? lost : Math.max(0, lost - 1);
}

// ---------------------------------------------------------------- the roll call
// The last entry of the story: the end of each person of the crew, in plain words. Each log tells
// its part in the voice of the crew, and a log can stop in the middle of a sentence or fall apart
// into the sounds of the call. So the story ends on one entry that states what happened to each
// person. The card of the twin shows it under the third log, and the Story window shows it again.
//
// The end of a person comes from the last log that names that person:
//
//   the third log   a person who went through the way: the end of that person in the third log
//   the first log   the person a thread took out (`lost`): dead, or gone from the wreck for good.
//                   A person who stayed at the wreck ends by the kind of the last entry: dead under
//                   the doom, in the failed climb, or as the keeper of a log in a second hand; else
//                   missing, because the probe found nobody at the wreck
//
// `home` says that the reader took the crew home. Gives `{ title, text, end, people }`, or null for a
// world with no log. A person is `{ name, role, status, word, line }`. `status` is 'alive', 'home',
// 'dead', 'missing', 'gone', or 'changed', and `word` is the status as the card prints it.
export const ROLL_WORDS = Object.freeze({
  alive: 'Alive', home: 'Going home', dead: 'Dead', missing: 'Missing', gone: 'Gone', changed: 'Changed',
});

export function rollCall(world, { home = false } = {}) {
  const first = world && world.source && world.source.log;
  if (!first || !first.crew || !first.crew.length) return null;
  const third = world.twin && world.twin.log;
  const form = third && third.fate === 'change' ? (third.form || formOf(world)) : null;
  const last = first.entries && first.entries.length ? first.entries[first.entries.length - 1].slot : '';
  const ending = String(last).replace(/^end\./, '');
  const years = first.years || 0;

  const endOf = (c) => {
    const t = third && third.crew.find((x) => x.name === c.name);
    if (t) {
      switch (t.end) {
        case 'home': return home
          ? ['home', `Waited ${numberWords(years)} years at the twin. Goes home with the probe.`]
          : ['alive', 'Went through the way. Waits at the twin to go home.'];
        case 'lost': return ['dead', 'Went through the way, and died at the twin.'];
        case 'changed': return ['changed', form === 'sleep'
          ? 'Sleeps in the den of the herd at the twin.'
          : 'Lives in the herd at the twin now, and will not leave it.'];
        default: return ['gone', third.fate === 'split' ? 'Went on with the herd from the twin, and did not come back.'
          : third.fate === 'mad' ? 'Answered the call of the stones at the twin, and walked into their light.'
            : 'Went into the light of the stones at the twin.'];
      }
    }
    if (first.lost && first.lost.name === c.name) {
      return first.lost.how === 'dead'
        ? ['dead', `Died at the wreck on day ${first.lost.day}.`]
        : ['missing', `Left the wreck and did not come back after day ${first.lost.day}. Presumed dead.`];
    }
    if (ending === 'second' && c.name === first.keeper) return ['dead', 'Died at the wreck. Another hand wrote the last entry.'];
    if (ending === 'doom') return ['dead', 'Stayed with the wreck to the end, and died there.'];
    if (ending === 'launch') return ['dead', 'Died in the climb on the patched feed line.'];
    if (ending === 'stay') return ['missing', 'Stayed to make a life by the wreck. Not found.'];
    return ['missing', 'Stayed at the wreck. Not found, and presumed dead.'];
  };

  const people = first.crew.map((c) => {
    const [status, line] = endOf(c);
    return { name: c.name, role: c.role, status, word: ROLL_WORDS[status], line };
  });
  const live = people.filter((p) => p.status === 'alive' || p.status === 'home').length;
  const n = people.length;
  const count = (k) => (k === n && n > 1 ? `All ${numberWords(k)}` : cap(numberWords(k)));
  const end = !live ? 'Nobody comes home.'
    : home ? `${count(live)} ${live === 1 ? 'goes' : 'go'} home with the probe.`
      : `${count(live)} ${live === 1 ? 'is' : 'are'} alive at the twin.`;
  return {
    title: 'The fate of the crew',
    text: `The ${first.probe} came down on ${world.designation} with ${numberWords(n)} people aboard. ${end}`,
    end,
    people,
  };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- the card of the twin
// The card the reader opens at the twin: the name of the proto, a line under it, and the rows, as
// ruinCard() of ruin-types.js writes the card of the ruin. It holds no DOM, so the Node checks read
// it. Null for a world with no twin.
//
//   name   the name of the proto on the card
//   sub    'Twin · 7,750 km to the east of the ruin'
//   rows   [{ key, label, text }]; the row `name` also holds `glyphs` and `word`
export function twinCard(world) {
  const twin = world && world.twin;
  if (!twin) return null;
  const row = protoRow(twin.proto) || RUIN_PROTOS[0];
  const word = nameOf(world);
  const G = world.species && world.species[twin.herd];
  const herdName = G && G.lore ? G.lore.plural : null;
  const herd = !herdName ? 'Animals of this world gather at the stones.'
    : twin.kin ? `A herd of ${herdName} lives at the stones. Theirs is the body of the carvings, and no other place on this world holds it.`
      : `A herd of ${herdName} lives at the stones. Theirs is the body of the carvings.`;
  const log = twin.log;
  const rows = [
    { key: 'size', label: 'Size', text: `It stands ${row.height} metres high and ${row.disc * 2} metres across, as the ruin does.` },
    { key: 'name', label: 'The name', text: `The makers named this place ${word}.`, glyphs: glyphsOf(word), word },
    { key: 'herd', label: 'The herd', text: herd },
    { key: 'back', label: 'The way back', text: 'The stones here do not answer the name. The way runs one way only.' },
  ];
  if (!log) rows.push({ key: 'crew', label: 'The crew', text: 'Nobody of the crew stood here. The probe is the first.' });
  return {
    name: row.name,
    sub: `Twin · ${twin.km.toLocaleString('en-GB')} km to the ${twin.from} of the ruin`,
    rows,
  };
}
