// myworlds — the third log: what the crew wrote at the twin. Chapter 3. See
// docs/issues/p3-00-the-way-on.md for the plan and the contract of the result.
//
// It is an ES module that exports WayLore. generate.js calls writeWayLog() last, from
// makeRng(seed + '|way-lore'), when somebody reached the ruin. The page calls it again on the main
// thread, and tools/story-lab.html and tools/lore-audit/way-sample.mjs call it once per fate on one
// world. So the writer is pure: it reads plain data, it writes nothing back to the world, and it
// draws only from `rng`. It holds no three.js and no DOM.
//
// ---------------------------------------------------------------- what the third log is
//
// The crew of the second log worked out the name of the twin, sent it on the hand beacon, and
// stood in the same stones in a different land. The stones there do not answer the name, so the
// crew cannot go back. A herd of the animal of the carvings lives at the twin. The herd needs
// something the crew can give, and the crew needs something the herd can give. The fate says how
// that ends.
//
//   entry 1        'way.through': how the second log ended, how the crew read the name, the jump,
//                  the noon sight that gives the arc and the bearing, and the dark stones behind
//   entry 2        'way.herd': the land, the herd of the carvings alive, and what the crew knew of
//                  that body
//   entries 3..n-1 the beats of the fate, in a fixed order per fate. Some beats are optional
//   entry n        'end.<fate>', the last entry
//
// The log holds 7 to 10 entries. The days rise from the day the crew went through.
//
// ---------------------------------------------------------------- the trouble of the herd
//
// Each world gives the herd one trouble, the need. It follows the world: water under the stones on
// a desert world, the long night on an ice world, the rising sea on an ocean world, the ground that
// breaks on a lava world, a sickness or a flood or the cold on a terran world, and the dark stones
// on an exotic world. NEEDS below holds the gate of each. What the herd gives back follows the
// condition of the crew: open air and food on a temperate world, the warmth of the herd in the cold,
// shade and a cave in the heat, a cool cave on a lava world.
//
// ---------------------------------------------------------------- the rules of the voice
//
// Every rule of the voice of docs/source.md holds here: short declarative sentences, none over 20
// words, no metaphor and no simile, no adverb of manner, every noun a thing the reader can see, no
// pronoun for a member of the crew, and each entry names the animal before a pronoun stands for it.
// Death is one plain sentence. Nothing is frightening in detail. Wonder is required.
//
// The log names the ruin as {site}, and the twin as "the stones". No wording says what the stones
// are, and no wording names another world.
//
// A crew of one writes "I". The tokens {we}, {We}, {us}, {our}, and {Our} print "I", "me", and
// "my" for one person, so one wording serves both. Such a wording never puts "are" or "were" after
// {we}. A wording that names {one} is gated on `hasone`, and a wording that names {two} on `hastwo`:
// the writer sets those two tags for each entry from the people still at the twin.
import { Lore } from './lore.js';
import { SourceLore } from './source-lore.js';
import { RuinLore } from './ruin-lore.js';
import { nameOf, callSign, formOf, fatesFor } from './way-types.js';
import { SYLLABLES, makerBody } from './ruin-types.js';

const L = Lore;
const pool = L.pool;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ---------------------------------------------------------------- the tokens
// Every token a wording may use. tools/lore-audit/way-sample.mjs reads this list.
const TOKENS = [
  // the ship, the world, and the ruin
  'probe', 'world', 'site', 'Site', 'temp', 'day', 'night', 'moon', 'plant', 'plants', 'Plants', 'years',
  // the name, the call sign, and the jump
  'name', 'sign', 'far', 'farfrom', 'sent', 'phase', 'wait', 'newname',
  // the people
  'keeper', 'keeperjob', 'shipkeeper', 'stayer', 'one', 'onejob', 'two', 'twojob', 'who', 'whojob',
  'we', 'We', 'us', 'our', 'Our',
  'lost', 'lostjob', 'gone', 'gonethe', 'Gonethe', 'goneone', 'last', 'lastjob', 'first', 'deadlist', 'rest', 'crewlist', 'crewleft',
  // the herd
  'other', 'Other', 'others', 'Others', 'kind', 'Kind', 'kinds', 'Kinds', 'count', 'young', 'calf', 'makerbody',
  // the counts of the log
  'days', 'prevday', 'keeperday', 'replyday', 'food', 'cells', 'pace', 'walk', 'signs',
];
const BEAST_TOKENS = ['other', 'Other', 'others', 'Others', 'kind', 'Kind', 'kinds', 'Kinds', 'calf'];

// ---------------------------------------------------------------- the tags of the story
// The world tags come from SourceLore.sourceTags(), with the latitude of the twin and the way the
// herd moves. RuinLore.storyTags() adds the tags of the second log: at<proto>, the maker, by<way>,
// went<value>, crewsolo, crewpair, crewgroup, samekeeper, newkeeper, deadkeeper, shipcrew, hungry.
// This writer adds:
//
//   from<kind>          how the second log ended: fromstay, fromback, fromwait, fromcut, fromnote
//   cut<kind>           which cut entry stopped the second log: cutclick, cutmoving, cutground,
//                       cutfoot, cutdark, or cutother
//   herdknown           the herd is the animal the log of the wreck names
//   herdcarved          the herd is a species of the world that the crew never saw alive
//   herdkin             the herd is the kin of a rolled maker: no animal the crew knew has its body
//   herdlegless         the carvings give legs to an animal that has none now
//   herdbig, herdsmall  the body is 3 metres or more, or less: bigBody() of source-lore.js
//   openair             a temperate world: the crew breathes the air and eats what a person can
//   coldsuit, hotsuit   the crew lives in the suits, in the cold or in the heat. A lava world has
//                       its own tag, `lava`
//   need<id>            the trouble of the herd, from NEEDS
//   fate<id>, form<id>  the fate, and the form of the change
//   hasone, hastwo      one or two people besides the keeper are at the twin for this entry
//   calfnamed           the crew gave a young animal a name in an earlier entry
//   trekloss            a person died on the long walk
//   gonesolo            one person went on with the herd in the split
//   sourone, sourpairkeeper, sourpairother, sourlast   who writes the last entry of the broken pact
const NEED_IDS = ['seep', 'den', 'night', 'crust', 'sea', 'ground', 'flow', 'sick', 'flood', 'cold', 'dark', 'heat'];
const FATE_IDS = ['pact', 'trek', 'split', 'sour', 'mad', 'change'];
const STORY_TAGS = [
  'fromstay', 'fromback', 'fromwait', 'fromcut', 'fromnote',
  'cutclick', 'cutmoving', 'cutground', 'cutfoot', 'cutdark', 'cutother',
  'herdknown', 'herdcarved', 'herdkin', 'herdlegless', 'herdbig', 'herdsmall', 'openair', 'coldsuit', 'hotsuit',
  ...NEED_IDS.map((n) => 'need' + n), ...FATE_IDS.map((f) => 'fate' + f),
  'formchorus', 'formsleep', 'formlight', 'hasone', 'hastwo', 'calfnamed', 'trekloss', 'gonesolo',
  'sourone', 'sourpairkeeper', 'sourpairother', 'sourlast', 'leftnote',
];

// The trouble of the herd, by the world. The writer takes one of the needs whose gate the world
// passes. Every world passes at least one gate.
const NEEDS = pool([
  { id: 'seep', tags: 'desert' },
  { id: 'den', tags: 'desert' },
  { id: 'night', tags: 'ice' },
  { id: 'crust', tags: 'ice' },
  { id: 'sea', tags: 'ocean', w: 1.4 },
  { id: 'ground', tags: 'lava' },
  { id: 'flow', tags: 'lava' },
  { id: 'sick', tags: 'temperate terran|ocean|exotic' },
  { id: 'flood', tags: 'terran rainy' },
  { id: 'cold', tags: 'cold terran|exotic' },
  { id: 'dark', tags: 'exotic', w: 1.3 },
  { id: 'heat', tags: 'hot ocean|exotic' },
]);

// The words of the second log for the ruin, from ruin-lore.js, so the two logs agree.
const SITE = RuinLore.SITE;

// ---------------------------------------------------------------- entry 1: through
// The first part picks up the second log where it stopped. The second log ended in one of four
// ways, or it was the note of one person. Each part holds two sentences at most, the name three,
// the jump two, and the place two, so the first entry holds nine sentences at most.
const OPEN = pool([
  { tags: 'fromstay', t: 'We stayed at {site}, as we said we would. {one} spent the days after that at the carvings, with the lamp and the notebook.' },
  { tags: 'fromstay', t: 'Nobody wanted to leave {site}, so nobody did. {one} went on with the marks on the stones, night after night.' },
  { tags: 'fromstay', t: 'We stayed, and the work went on. The shelter and the flag still stand at {site}, where we put them.' },
  { tags: 'fromstay', t: 'We never left {site}. The second notebook of the carvings filled up, and {one} started a third.' },
  { tags: 'fromstay', t: 'We stayed at {site} after the last entry. {one} gave every evening to the marks on the stones.' },
  { tags: 'fromwait', t: 'We waited at {site} for whoever came next. Nobody came, and {one} went back to the marks on the stones.' },
  { tags: 'fromwait', t: 'We kept the beacon on at {site} and waited. While we waited, {one} learned to read the stones.' },
  { tags: 'fromwait', t: 'Nobody came to {site}. We kept the flag up and the beacon on, and {one} worked on the marks.' },
  { tags: 'fromwait', t: 'We waited at {site}, as we said. {one} used the days on the marks, and filled a notebook with them.' },
  { tags: 'fromback shipcrew', w: 1.5, t: 'We never started back to {probe}. On the last night {one} went out to tape the reply of the stones for {stayer}, and I went too.' },
  { tags: 'fromback shipcrew', w: 1.5, t: '{stayer} is still waiting for us at {probe}. We meant to go back, and on the last night {one} went out to the stones to say goodbye.' },
  { tags: 'fromback', t: 'The packs stood at the door of the shelter, ready for the way back to {probe}. {one} wanted one more night at the stones.' },
  { tags: 'fromback', t: 'We were packed for {probe}. At dusk on the last day {one} went out to the stones one more time, and I went after.' },
  { tags: 'fromback', t: 'We were to start back to {probe} in the morning. {one} said there was one more thing to try at the stones.' },
  { tags: 'fromnote newkeeper', w: 1.5, t: 'I left the note in the case on the cairn, for {shipkeeper} or for whoever came. Then I stayed by the stones and watched the marks.' },
  { tags: 'fromnote deadkeeper', w: 1.5, t: 'I left my note in the case on the cairn. {shipkeeper} would have wanted to see what came next, so I stayed.' },
  { tags: 'fromnote', t: 'The note on the cairn at {site} says I will not be far. I kept my word, and stayed by the stones.' },
  { tags: 'fromnote', t: 'I built the cairn at {site} and put my note in the case on top. Then I sat with the stones for {wait} days.' },
  { tags: 'fromnote', t: 'After I left the note in the case, I stayed by {site}. There was nowhere else to go, and the marks kept me busy.' },
]);

// The second log stopped in the middle of a sentence. The third log says so first, then how the
// name was read, and then what the cut entry was about: the stones answered the name.
const CUT_OPEN = pool([
  { t: 'My last entry at {site} stops in the middle of a line, and here is the rest.' },
  { t: 'I never finished the last line I wrote at {site}.' },
  { t: 'The last line I wrote at {site} breaks off, because I had to go.' },
]);
const CUT = pool([
  { tags: 'cutclick', t: 'The click stopped that night because {one} had the name and was sending it on the hand beacon.' },
  { tags: 'cutclick', t: 'The click stopped that night, and I found {one} out at the stones, sending the name.' },
  { tags: 'cutclick', t: 'When the click stopped, {one} was at the stones with the hand beacon, halfway through the name.' },
  { tags: 'cutmoving', t: 'The new light that moved on the stones that night was the name, lighting one mark at a time.' },
  { tags: 'cutmoving', t: 'The moving light was a row of marks, lighting one by one, while {one} sent the name.' },
  { tags: 'cutmoving', t: 'I went out to the moving light and found {one} under it, sending the name mark by mark.' },
  { tags: 'cutground', t: 'The ground moved and the stones rang because {one} had sent the name, and the name was right.' },
  { tags: 'cutground', t: 'The stones were ringing when I got to the door, and {one} was out on the flat with the beacon.' },
  { tags: 'cutground', t: 'I got outside as the ground moved again, and {one} stood in a white light at the stones.' },
  { tags: 'cutfoot', t: 'The new light at the foot of {site} was a row of marks, with {one} under it.' },
  { tags: 'cutfoot', t: 'I went down after {one} and found the new light: every mark of the name, lit.' },
  { tags: 'cutfoot', t: 'The light at the foot of {site} came on because {one} had sent the name.' },
  { tags: 'cutdark', t: 'The lights of {site} went out because {one} was sending the name, mark by mark.' },
  { tags: 'cutdark', t: 'I took the second lamp out and found {one} at the stones in the dark, sending the name.' },
  { tags: 'cutdark', t: 'After the lights went out, every mark on the stones came on at once, in white.' },
  { tags: 'cutother', t: 'That night {one} sent the name on the hand beacon, and the stones answered.' },
  { tags: 'cutother', t: 'The stones answered the name that night, and I had to go.' },
  { tags: 'cutother', t: 'I stopped writing because {one} had sent the name, and the stones had answered.' },
]);

// How the crew read the name: the stones send the call sign of the ship back in their own marks,
// a person matches the marks to the letters, and the sounds of the call give the rest. It is the
// puzzle the reader solved on the card.
const NAME = pool([
  { tags: 'hasone', t: 'The stones send our call sign back in marks of their own. {one} matched each mark to a letter of {sign}. With the sounds of the call, the long line of marks reads {name}.' },
  { tags: 'hasone', t: 'When the beacon sends {sign}, a row of marks lights on the stones. {one} wrote a letter under each mark, and the sounds of the call filled the gaps: {name}.' },
  { tags: 'hasone', t: '{one} found the key: the marks the stones light for our beacon are the letters of {sign}. With those letters and the sixteen sounds, the long line spells {name}.' },
  { tags: 'hastwo', t: '{one} and {two} sat up three nights with the marks and the letters of {sign}. The sounds of the call filled the last gaps. The line on the stones spells {name}.' },
  { tags: 'hasone', t: 'Our call sign comes back from the stones in marks, one mark to a letter of {sign}. {one} put the letters under the marks and read the long line out loud: {name}.' },
  { tags: 'hasone', t: '{one} saw it on the tape. The stones answer {sign} with a row of marks, one mark to a letter. With those letters and the sounds of the call, the long line reads {name}.' },
  { tags: 'hasone !fromcut', t: 'For {wait} nights {one} copied the marks the stones light for our call sign. The marks are the letters of {sign}, and with the sixteen sounds they give a name: {name}.' },
  { tags: 'hasone', t: 'Every time the beacon sends {sign}, the stones light the same row of marks. {one} learned the row by heart. Read with those letters and the sounds of the call, the long line says {name}.' },
  { tags: 'hasone', t: '{one} spread the drawings of the marks on the floor of the shelter. Under the row that answers the beacon, {one} wrote {sign}. By morning the long line had letters too: {name}.' },
  { tags: 'hasone', t: 'The key was our own call sign. The stones answer {sign} in marks, and {one} gave each mark its letter. The sounds of the call did the rest: {name}.' },
  { tags: 'hastwo', t: '{two} heard the sixteen sounds in the call, and {one} matched the marks to the letters of {sign}. Between the two of them the long line came out: {name}.' },
  { tags: 'hasone', t: '{one} had it in the end from the tape of the reply. The marks for {sign} are one to a letter, and the long line uses the same marks. {one} read it out: {name}.' },
  { tags: 'hasone', t: 'It was {one} who saw that the row of marks for our beacon spells {sign}. After that the long line took two nights. The line reads {name}.' },
  { tags: '!hasone', t: 'The stones send my call sign back in marks of their own. I matched each mark to a letter of {sign}. The sounds of the call gave me the rest: {name}.' },
  { tags: '!hasone', t: 'I wrote the letters of {sign} under the marks the stones light for the beacon. With those letters and the sounds of the call, the long line of marks reads {name}.' },
  { tags: '!hasone', t: 'It took me {wait} nights to find the key. The marks the stones light for my beacon are the letters of {sign}. The sounds of the call filled the rest: {name}.' },
  { tags: '!hasone', t: 'On the third night I saw it. The stones answer {sign} with a row of marks, one to a letter. I read the long line out loud: {name}.' },
]);

// The jump. {sent} is when the name went: at dusk, that night, or at midnight. {phase} is the hour
// at the twin, from the longitudes of the two places, so a crew that went east lands later in the
// day. A cut log comes in after the moment the cut entry stopped on.
const JUMP = pool([
  { tags: 'hasone !fromcut', t: '{one} sent {name} on the hand beacon {sent}, and a white light came down over the flat. When the light went, we stood in the same stones, and it was {phase}.' },
  { tags: 'hasone !fromcut', t: 'We keyed {name} on the hand beacon {sent}, and every mark lit at once. When we could see again, the land round the stones was new, and it was {phase}.' },
  { tags: 'hasone !fromcut', t: 'At dusk {one} keyed the name, mark by mark, and the last mark lit. The light filled the flat, and then it was {phase}, in a new land.' },
  { tags: 'hasone !fromcut', t: 'We stood in the middle of the stones, and {one} sent {name}. A white light came, with no sound, and then it was {phase} somewhere else.' },
  { tags: 'hasone !fromcut', t: '{one} held the key down for the last mark {sent}. The light came white over all of us, and when it went, it was {phase}.' },
  { tags: 'hasone !fromcut', t: '{one} keyed the last mark of {name} {sent}. The stones went white from top to foot, and then it was {phase}.' },
  { tags: 'hasone !fromcut', t: 'We held hands in the middle of the stones while {one} sent the name. The light came, and went, and it was {phase}.' },
  { tags: 'hasone !fromcut', t: '{one} sent {name} one mark at a time, {sent}. With the last mark the stones went white, and then it was {phase}.' },
  { tags: 'hasone !fromcut', t: 'The name went out on the hand beacon {sent}. Every mark answered at once, and the flat went white, and then it was {phase}.' },
  { tags: 'hasone !fromcut', t: '{one} counted down from three and keyed {name}. There was a flash with no sound, and then it was {phase}.' },
  { tags: '!hasone !fromcut', t: 'I sent {name} on the hand beacon at dusk. A white light came down over the stones, and then it was {phase}.' },
  { tags: '!hasone !fromcut', t: 'I keyed {name} and held my breath. Every mark lit at once, and then the land round the stones was new.' },
  { tags: '!hasone !fromcut', t: 'At dusk I sent the name, mark by mark. The light filled the flat, and then it was {phase}, in a new land.' },
  { tags: '!hasone !fromcut', t: 'I stood in the middle of the stones with my pack on and sent the name. When the white light went, it was {phase}.' },
  { tags: 'fromcut', t: 'Every mark lit at once, and the light came down over us, white and with no heat. When the light went, we stood in the same stones, and it was {phase}.' },
  { tags: 'fromcut', t: 'The light filled the flat, and I lost sight of the shelter and the flag. When it went, we stood in the same stones, and it was {phase}.' },
  { tags: 'fromcut', t: 'The white light lasted one breath. After it, the stones were the same stones, and everything round the stones was new.' },
  { tags: 'fromcut', t: 'I reached {one}, and the light came down white over both of us. Then it was {phase}, and we stood in a land none of us knew.' },
]);

// Where the crew stands, and why it cannot go back. The sun gives the place, or the stars where the
// sun does not rise at the twin.
const FARDARK = pool([
  { tags: 'hasone !polarnight', t: 'At the next noon {one} took a sight on the sun: {far} kilometres to the {farfrom} of {site}. The stones here do not answer the name.' },
  { tags: 'hasone !polarnight', t: 'By the noon sun, {one} puts us {far} kilometres to the {farfrom} of {site}. We cannot go back: the name does nothing from this side.' },
  { tags: 'hasone !polarnight', t: '{one} worked out the place from the noon sun and the ship clock: {far} kilometres to the {farfrom}. We sent the name forty times more, and nothing answered.' },
  { tags: 'hasone !polarnight', t: '{one} did the sums on the back of a ration pack: {far} kilometres, to the {farfrom}. The stones behind us went dark, and the name does nothing.' },
  { tags: 'hasone !polarnight', t: 'The sun at noon put us {far} kilometres to the {farfrom} of the camp. {one} keyed the name until the beacon was hot, and the stones gave nothing back.' },
  { tags: 'hasone !polarnight', t: '{one} measured the sun at noon, twice. {far} kilometres, to the {farfrom}, and the name does not carry us back from here.' },
  { tags: 'hasone !polarnight', t: '{one} fixed our place with the noon sun: {far} kilometres to the {farfrom}. We tried the name again at dusk, and the stones stayed dark.' },
  { tags: 'hasone !polarnight', t: 'At noon {one} took the height of the sun and worked the sums twice. {far} kilometres, to the {farfrom}, with no way back through the stones.' },
  { tags: 'hasone !polarnight', t: 'By the sun at noon, {one} put the shelter and the flag {far} kilometres behind us. We are to the {farfrom} of {site}, and the name does not carry us back.' },
  { tags: 'hasone !polarnight', t: '{one} measured the noon sun with the lens and a string: {far} kilometres to the {farfrom}. The name opens nothing from this side.' },
  { tags: 'hasone !polarnight', t: 'The noon sight put us {far} kilometres to the {farfrom} of the old camp. {one} keyed the name all afternoon, and the stones here did not light for it.' },
  { tags: '!hasone !polarnight', t: 'By the noon sun I am {far} kilometres to the {farfrom} of {site}. The stones here do not answer the name, and I cannot go back.' },
  { tags: '!hasone !polarnight', t: 'I took a noon sight on the sun: {far} kilometres, to the {farfrom}. I keyed the name until dark, and the stones here stayed quiet.' },
  { tags: '!hasone !polarnight', t: 'The noon sun puts me {far} kilometres to the {farfrom} of the cairn. The stones behind me went dark, and the name does nothing from this side.' },
  { tags: '!hasone !polarnight', t: 'I did the sums twice on the back of a ration pack: {far} kilometres to the {farfrom}. The name does not carry me back from here.' },
  { tags: 'hasone polarnight', t: '{one} fixed our place by the stars: {far} kilometres to the {farfrom} of {site}. No sun rises here, and the name does nothing from this side.' },
  { tags: 'hasone polarnight', t: 'In the dark {one} took star sights and did the sums: {far} kilometres to the {farfrom}. The stones behind us went dark and stayed dark.' },
  { tags: 'hasone polarnight', t: 'The sun does not rise here, so {one} took the place from three stars: {far} kilometres to the {farfrom}. The name opens nothing on this side.' },
  { tags: '!hasone polarnight', t: 'I fixed my place by the stars: {far} kilometres to the {farfrom} of {site}. No sun rises here, and the name does nothing from this side.' },
  { tags: '!hasone polarnight', t: 'In the dark I took star sights and did the sums: {far} kilometres to the {farfrom}. The stones behind me went dark and stayed dark.' },
  { tags: '!hasone polarnight', t: 'The sun does not rise here, so I took the place from three stars: {far} kilometres to the {farfrom}. From this side the name opens nothing.' },
]);

// ---------------------------------------------------------------- entry 2: the herd
// The land at the twin, by the type of the world.
const LAND = pool([
  { tags: 'terran', t: 'Here the stones stand in a clearing, with {plants} on every side.' },
  { tags: 'terran', t: 'Hills run away from the stones on every side, dark with {plants}.' },
  { tags: 'terran', t: 'Here the stones stand at the top of a long slope of {plants}, with the sea far below.' },
  { tags: 'terran waterliquid', t: 'The flat here looks down on a river, and {plants} run up the far bank.' },
  { tags: 'terran waterliquid', t: 'The stones here stand on a knoll above a valley of {plants}. Mist lies in the valley at dawn.' },
  { tags: 'terran subzero', t: 'The ground here is hard with cold, and frost stands on the {plants} round the flat.' },
  { tags: 'ocean', t: 'Here the stones stand on a headland, with the sea on three sides.' },
  { tags: 'ocean', t: 'The flat here ends in a beach, and the sea comes up to the foot of the beach.' },
  { tags: 'ocean', t: 'From the stones there is water in every direction but one.' },
  { tags: 'ocean', t: '{Plants} lean over the flat here, and past the {plants} is the sea.' },
  { tags: 'desert', t: 'Here the stones stand on a floor of bare rock, with sand to the horizon.' },
  { tags: 'desert', t: 'The land here is dunes and bare rock, and {plants} in the hollows.' },
  { tags: 'desert', t: 'Nothing moves on the sand round the stones but the wind.' },
  { tags: 'desert dryworld', t: 'No sea, no cloud, and no shade. There is sand, bare rock, and the stones.' },
  { tags: 'ice', t: 'Here the stones stand on a ridge of dark rock, over a white plain of ice.' },
  { tags: 'ice', t: 'Ice runs to the horizon on every side, broken by ridges of rock.' },
  { tags: 'ice', t: 'The wind here comes off the ice and does not stop.' },
  { tags: 'ice', t: 'The stones here stand in a hollow of the ice, out of the worst of the wind.' },
  { tags: 'lava', t: 'Here the stones stand on a ridge of old black rock. Below the ridge, the land glows at night.' },
  { tags: 'lava', t: 'The flat here is cracked black rock, and red light comes up out of the cracks.' },
  { tags: 'lava', t: 'Smoke stands over the land on every side of the stones, and the ground is warm through the boots.' },
  { tags: 'lava', t: 'The stones here stand on an island of old rock in a field of new flows. The new rock glows at night.' },
  { tags: 'exotic', t: 'Here the stones stand among {plants} that grow higher than the tent.' },
  { tags: 'exotic', t: '{Plants} crowd round the flat here, and some of the {plants} give a faint light at dusk.' },
  { tags: 'exotic', t: 'The land here is stranger than the land at {site}: {plants} taller than a person, in rings.' },
  { tags: 'exotic', t: 'The {plants} here stand in rings round the flat, each ring taller than the last.' },
]);

// The herd comes to the stones, by the way the animal moves. Every wording names the animal and
// counts the herd: the page stands five to eight groups of six to twelve animals round the twin.
const SIGHT = pool([
  { tags: 'mwalk', t: 'At dawn {kinds} walked up out of the land to the stones, about {count} of them, with young among them.' },
  { tags: 'mwalk', t: '{Kinds} stood at the edge of the flat at first light, about {count}, with the young in the middle.' },
  { tags: 'mwalk', t: '{Kinds} came round the stones in a wide ring, about {count} of them, and stopped at the tent.' },
  { tags: 'mwalk', t: 'The {kinds} came at noon, about {count}, and walked round the stones twice before they came near {us}.' },
  { tags: 'mwalk', t: 'The first {kind} came out of the dusk alone and walked up to the tent. By dark there were {count} {kinds} round the stones.' },
  { tags: 'mwalk', t: 'Late on the first day {kinds} came over the rise in a long line, about {count} of them. The young walked between the old ones.' },
  { tags: 'mwalk', t: 'The {kinds} came down to the stones at dusk, about {count}. The {kinds} stopped at the edge of the flat and looked at the tent.' },
  { tags: 'mwalk', t: 'On the second morning {kinds} walked out of the haze, about {count}, and lay down by the stones.' },
  { tags: 'mcrawl', t: 'The {kinds} came to the stones at dusk, about {count}, each in a clean line across the flat.' },
  { tags: 'mcrawl', t: 'In the morning the flat round the tent was crossed with the lines of {kinds}. About {count} of them lay coiled at the foot of the stones.' },
  { tags: 'mcrawl', t: '{Kinds} lay coiled all round the stones, about {count} of them, with the young inside the coils.' },
  { tags: 'mcrawl', t: 'At dusk the first {kind} came across the flat in one clean line and lay down by the stones. By morning there were {count}.' },
  { tags: 'msling', t: '{Kinds} swung in to the stones at dawn, from hold to hold, about {count} of them.' },
  { tags: 'msling', t: 'About {count} {kinds} came in over the flat at dusk, off the high stones and down to the ground.' },
  { tags: 'msling', t: 'The {kinds} throw a cord and swing. That is how about {count} of them came to the stones, young and old.' },
  { tags: 'msling', t: 'A {kind} came in over the tent at dawn, off the top of the stones and down. After it came {count} more.' },
  { tags: 'mdig', t: 'The flat round the stones is crossed with raised lines, and a mound stands at the end of each line. At dusk {kinds} came up out of the mounds, about {count} of them.' },
  { tags: 'mdig', t: 'At dawn there were fresh mounds all round the tent. {Kinds} came up out of the mounds, about {count}, and looked at {us}.' },
  { tags: 'mdig', t: 'The ground round the stones is soft and turned. {Kinds} came up through it at dusk, one after another, about {count} of them.' },
  { tags: 'mdig', t: 'On the second morning a {kind} came up out of the ground beside the tent. By dusk there were mounds all round the stones, and about {count} {kinds}.' },
  { tags: 'mfly', t: 'At dusk {kinds} came in over the stones, about {count} of them, and landed on the flat round {us}.' },
  { tags: 'mfly', t: '{Kinds} circled the stones all morning, about {count} of them, and came down round the tent one by one.' },
  { tags: 'mfly', t: 'At dawn the sky over the stones was full of {kinds}, about {count}. The young flew lowest.' },
  { tags: 'mfly', t: 'A {kind} landed on the top of the stones at dawn, and then another, and another. By noon there were about {count}.' },
  { t: 'The {kinds} came to the stones on the first morning, about {count} of them, with their young.' },
  { t: 'By noon there were {kinds} all round the stones, about {count}, young and old, and more came at dusk.' },
  { t: 'The {kinds} came before the tent was up, about {count} of them, and did not go away.' },
  { t: 'On the first night {we} heard {kinds} round the tent in the dark. At dawn {we} counted {count}.' },
  { t: 'At dusk the flat round the stones filled with {kinds}, about {count}, young and old.' },
  { t: '{Kinds} came to the stones on the third day, about {count} of them, and stayed.' },
  { tags: 'hotsuit|openair', t: '{Kinds} were at the stones before {us}: about {count} of them, lying in the shade of the stones.' },
  { tags: 'coldsuit|lava', t: '{Kinds} were at the stones before {us}: about {count} of them, lying close against the stones.' },
]);

// What the crew knew of that body. The first log may name the animal, and the second log saw its
// body on the carvings. A kin is an animal no person of the crew had seen, nor any living thing
// with its body: the carvings were not of the past.
const STATUS = pool([
  { tags: 'herdknown', t: 'These are {others}, the animal of the carvings, and the animal {we} watched from {probe}.' },
  { tags: 'herdknown', t: '{Others} were the animal we knew at the ship. Here there are more of them than we ever saw there.' },
  { tags: 'herdknown hasone', t: '{one} knew the {kinds} first, from the ship: the body of the carvings at {site}, alive.' },
  { tags: 'herdknown byride', w: 2, t: 'A {kind} carried {us} to {site}. Here there are {count} of them, and none of them knows {us}.' },
  { tags: 'herdknown', t: '{We} watched {others} from {probe} every day. Here the {kinds} have young, and {we} never saw young near the ship.' },
  { tags: 'herdknown', t: 'The same {kinds} {we} watched at {probe}, and the same body as the carvings. These ones come close.' },
  { tags: 'herdknown', t: '{We} knew the {kinds} from the ship, one or two at a time. Here there are {count}.' },
  { tags: 'herdknown', t: 'The {kinds} are the animal {we} watched from {probe}, and the body of the carvings. Here the {kinds} are not afraid of {us}.' },
  { tags: 'herdcarved', t: 'At {site} the carvings showed a body {we} had never seen alive. Here it is, many times over.' },
  { tags: 'herdcarved', t: '{We} call these animals {kinds}. The bodies of the carvings at {site} are here, alive.' },
  { tags: 'herdcarved', t: 'Nobody at {probe} ever saw this animal. The carvings at {site} showed it, and here it is, with young.' },
  { tags: 'herdcarved hasone', t: '{one} held up the drawing of the carvings from {site}. The drawing and the {kinds} match, line for line.' },
  { tags: 'herdcarved', t: '{We} drew this body from the carvings at {site} and never saw it move. Now {we} watch it move all day.' },
  { tags: 'herdcarved !hasone', t: 'I held up my drawing of the carvings from {site}. The drawing and the {kinds} match, line for line.' },
  { tags: 'herdcarved', t: '{We} knew this body only from the carvings at {site}. Here it moves, and eats, and has young.' },
  { tags: 'herdcarved', t: 'The survey of the ship has no record of this animal. The carvings at {site} were the only record, until now.' },
  { tags: 'herdcarved hasone', t: 'The {kinds} are the animal of the carvings at {site}, alive. None of us saw one near the ship.' },
  { tags: 'herdcarved !hasone', t: 'The {kinds} are the animal of the carvings at {site}, alive. I never saw one near the ship.' },
  { tags: 'herdcarved', t: 'The carvings at {site} were a picture of the {kinds}. Here the {kinds} are, breathing.' },
  { tags: 'herdkin !fromnote', w: 1.5, t: 'The log we kept at {site} says no animal of {world} has the body of the carvings. That log was wrong by {far} kilometres.' },
  { tags: 'herdkin', t: 'At {site} {we} said the carvings were of animals long dead. The {kinds} are not dead. The carvings were not of the past.' },
  { tags: 'herdkin hasone', t: '{one} held the drawing of the carvings up beside a {kind}. The body is the same: {makerbody}, and alive.' },
  { tags: 'herdkin !hasone', t: 'I held my drawing of the carvings up beside a {kind}. The body is the same: {makerbody}, and alive.' },
  { tags: 'herdkin', t: 'No animal on the survey of {world} has this body. The {kinds} have it, and the carvings at {site} have it, and nothing else does.' },
  { tags: 'herdkin', t: 'The body of the carvings is here, alive, and nowhere else {we} have been. {We} call the animals {kinds}.' },
  { tags: 'herdkin', t: 'Every {kind} here has the body of the carvings at {site}. {We} thought the carvings were of animals long dead. The carvings were of this place.' },
]);
// The carvings give the maker legs, and the living animal has none.
const LEGLESS = pool([
  { tags: 'herdlegless', t: 'The carvings give the {kinds} legs. The {kinds} here have none.' },
  { tags: 'herdlegless', t: 'In the carvings the {kinds} have legs. Here, alive, the {kinds} have none.' },
  { tags: 'herdlegless', t: 'The {kinds} here have no legs that {we} can find, and the carvings still give them legs.' },
]);
// How the herd takes the crew.
const REACT = pool([
  { t: 'The {kinds} did not run from {us}, and the young came closest of all.' },
  { tags: 'hasone', t: 'When {one} keyed the hand beacon, every {kind} turned toward the stones.' },
  { tags: '!hasone', t: 'When I keyed the hand beacon, every {kind} turned toward the stones.' },
  { t: 'A young {kind} came up to the tent and stayed by the door until dark.' },
  { tags: '!needdark', t: 'At dusk the stones lit, and the {kinds} lay down in the light.' },
  { t: 'The {kinds} keep to the edge of the flat, and watch {us}.' },
  { tags: '!openair hasone', t: 'A young {kind} touched the glove of {one}, and then went back to the others.' },
  { tags: '!openair !hasone', t: 'A young {kind} touched my glove, and then went back to the others.' },
  { tags: 'openair hasone', t: 'A young {kind} touched the hand of {one}, and then went back to the others.' },
  { tags: 'openair !hasone', t: 'A young {kind} touched my hand, and then went back to the others.' },
  { t: 'The old {kinds} watch {us} from the edge of the flat. The young do not wait to be sure.' },
  { t: 'The {kinds} let {us} walk among them on the first day.' },
  { t: 'An old {kind} came to the tent at dusk, looked in at the door, and went back to the others.' },
  { t: 'The young {kinds} followed {us} round the stones all afternoon, at a distance.' },
  { tags: 'hasone', t: '{one} sat down on the flat, and a young {kind} came and lay down beside {one}.' },
  { tags: '!hasone', t: 'I sat down on the flat, and a young {kind} came and lay down beside me.' },
  { t: 'At night {we} heard the {kinds} breathe all round the tent.' },
]);

// ---------------------------------------------------------------- the optional beats
// The stones at the twin. A generic wording, or a new carving that the fate bears out.
const STONES = pool([
  { tags: 'hasone', t: 'The stones here are the stones of {site}, face for face. {one} laid the drawings from {site} on the flat, and nothing differs.' },
  { t: 'Every carving at {site} is here too, cut in the same places. The {kinds} are on every face.' },
  { tags: '!needdark', t: 'At dusk the light of the stones came back, bright and dim, the same as at {site}. The name still does nothing.' },
  { tags: '!hasone', t: 'I laid my drawings from {site} beside the stones here. Face for face, nothing differs.' },
  { t: 'The carvings here are sharper than at {site}, with less wear. The {kinds} rub against the stones, and the rubbing keeps the carvings clean.' },
  { tags: 'fatepact', w: 2, t: 'On the far side of the stones there is a carving that {site} does not have. The carving shows the {kinds} round a small body on two legs, with its hands out.' },
  { tags: 'fatepact', w: 2, t: 'The carvings here show the {kinds} with young, and one body among them that is not a {kind}. That body has two legs and a round head.' },
  { tags: 'fatepact', w: 2, t: 'A low carving shows the {kinds} and small bodies on two legs, side by side, facing the same way.' },
  { tags: 'fatetrek', w: 2, t: 'One carving here is a long line that leaves the stones, goes round, and comes back to the stones. Small {kinds} are cut all along the line.' },
  { tags: 'fatetrek', w: 2, t: 'A carving runs round the foot of the stones: {kinds}, one behind another, all the way round.' },
  { tags: 'fatetrek', w: 2, t: 'The carvings here show the {kinds} going away from the stones, and on the next face, coming back.' },
  { tags: 'fatesplit', w: 2, t: 'One carving here shows the {kinds} going away from the stones, and one small body on two legs left behind.' },
  { tags: 'fatesplit', w: 2, t: 'The carvings here show the {kinds} in two parts: one at the stones, and one going over a hill.' },
  { tags: 'fatesplit', w: 2, t: 'A new carving: {kinds} going over a hill, and one small figure at the stones, watching the {kinds} go.' },
  { tags: 'fatesour', w: 2, t: 'One carving here is broken across the middle. On one side are the {kinds}. On the other are small bodies on two legs.' },
  { tags: 'fatesour', w: 2, t: 'The carvings here show the {kinds} at the stones, over and over. On the last face the {kinds} are turned away.' },
  { tags: 'fatesour', w: 2, t: 'On the back of the stones a carving shows the {kinds} going away from small figures on two legs.' },
  { tags: 'fatemad', w: 2, t: 'One carving here shows a {kind} going into the light of the stones. There is no carving of the {kind} coming out.' },
  { tags: 'fatemad', w: 2, t: 'On the inside of the stones a carving shows {kinds} and small figures going into the light, one behind another.' },
  { tags: 'fatemad', w: 2, t: 'The carvings here are cut deeper than at {site}. The deepest shows the light of the stones, and a {kind} at its edge.' },
  { tags: 'formchorus', w: 2, t: 'On the far side of the stones there is a carving {site} does not have. The carving shows the {kinds}, and small bodies on two legs in the middle.' },
  { tags: 'formchorus', w: 2, t: 'A new carving shows a ring of {kinds} from above, and in the middle three small figures with round heads.' },
  { tags: 'formchorus', w: 2, t: 'One carving shows the {kinds} and small figures with round heads, mixed together, with no line between them.' },
  { tags: 'formsleep', w: 2, t: 'One carving shows the {kinds} asleep in a den, and small figures on two legs asleep among them.' },
  { tags: 'formsleep', w: 2, t: 'A low carving shows a den full of {kinds}, and over the den the sun and the stars, many times.' },
  { tags: 'formsleep', w: 2, t: 'The carvings here show the {kinds} asleep, under a row of suns that runs the whole face.' },
  { tags: 'formlight', w: 2, t: 'One carving shows the {kinds} going into the light, old ones first, and small figures on two legs behind them.' },
  { tags: 'formlight', w: 2, t: 'The deepest carving here shows the light of the stones, and bodies of every shape going into it, calm.' },
  { tags: 'formlight', w: 2, t: 'Inside the stones a carving shows {kinds} going into the light. At the end of the line walk small figures with round heads.' },
]);

// What the crew brought through, and the clock the world sets.
const CAMP = pool([
  { tags: 'openair', t: 'We came through with our packs, the small tent, the hand beacon, and this log. At {temp} there is no need for the suits. The need is food.' },
  { tags: 'openair', t: 'The small tent is up at the edge of the flat. The seed store lasts {food} days. After that {we} eat what this land gives.' },
  { tags: 'openair', t: 'Everything {we} have came through in the packs: the tent, the med kit, the seed store, and the beacon. The air is good, and there is water.' },
  { tags: 'coldsuit', t: 'It is {temp} here. {We} came through in the suits, with the small tent and the packs. The tent heater runs on the cells, and the cells run down.' },
  { tags: 'coldsuit', t: 'Everything {we} have is in the packs: the tent, the beacon, the seed store, and cells for {cells} days. At {temp}, the cells are the clock.' },
  { tags: 'coldsuit', t: '{We} sleep in the suits inside the tent. On a full cell the heater holds the tent at four degrees, and there are {cells} days of cells.' },
  { tags: 'hotsuit', t: 'It is {temp} here. The suits hold for ninety minutes in the sun, and the tent is no cooler at noon.' },
  { tags: 'hotsuit', t: '{We} came through with the small tent, the seed store, and the beacon. At {temp}, {we} work at dawn and at dusk and lie still at noon.' },
  { tags: 'hotsuit', t: 'The suit cells last {cells} days out of the sun. At {temp}, there is no way to keep out of the sun.' },
  { tags: 'lava', t: 'It is {temp} on the flat. The suits and the cooler of the tent hold, for now. The cells are the clock.' },
  { tags: 'lava', t: 'The small tent has a cooler, and the cooler runs on the cells. {We} have {cells} days of cells. The ground outside is {temp}.' },
  { tags: 'lava', t: 'At {temp}, the boots of a suit last a week on this rock. There is one spare pair in the packs.' },
]);
// What the crew left at the ruin. The reader saw it there.
const LEFT = pool([
  { tags: 'byrover !fromnote', w: 2, t: 'The shelter, the flag, and the rover stand at {site} with nobody in them.' },
  { tags: '!fromnote', t: 'The shelter and the flag stand at {site}, {far} kilometres away, with nobody in them.' },
  { tags: '!fromnote', t: 'The shelter at {site} still holds our cots, the crates, and the drawings we did not carry.' },
  { tags: '!fromnote', t: 'Back at {site} the flag is still up over the empty shelter.' },
  { tags: 'fromnote', t: 'My cairn stands at {site}, with the note in the case, and nobody to read it.' },
  { tags: 'fromnote', t: 'The note is still in the case on the cairn at {site}. It says I will not be far.' },
  { tags: 'fromnote', t: 'The cairn at {site} is {far} kilometres away now, with my note on top.' },
]);

// The sky at the twin: one fact of the world, with the herd in it.
const SKY = pool([
  { tags: 'rainy', t: 'It rained on the stones tonight. The {kinds} did not move out of the rain.' },
  { tags: 'subzero', t: 'At {temp} the frost stands on the {kinds} at dawn, and on the tent, and not on the stones.' },
  { tags: 'hot|molten', t: 'At {temp} the air over the flat shakes at noon. The {kinds} lie still until dusk, and so do {we}.' },
  { tags: 'moonlit', t: '{moon} came up over the stones tonight. The {kinds} turned to it, all of them, and so did {we}.' },
  { tags: 'ringed', t: 'The ring overhead lit the flat all night. The young {kinds} did not sleep.' },
  { tags: 'longday|slowspin', t: 'The day here is {day} long. The {kinds} sleep through the middle of it, and so do {we}.' },
  { tags: 'stormy', t: 'Lightning struck the hills all night. The {kinds} crowded in round the tent until dawn.' },
  { tags: 'auroral', t: 'The sky went green from end to end tonight. The {kinds} watched it, and so did {we}.' },
  { tags: 'volcanic', t: 'Ash came down on the stones in the night. By morning the {kinds} were grey with it.' },
  { tags: 'geysers', t: 'A geyser went up at dusk on the far side of the flat. The young {kinds} went to the edge to look, every time.' },
  { tags: 'polarnight', t: 'The sun has not come up for nine days. The {kinds} sleep through most of the dark.' },
  { t: 'The stars here are the stars of {site}, turned a little. The {kinds} sleep under them in rows.' },
  { t: 'At dusk the shadow of the stones reaches the tent. The {kinds} come in when the shadow does.' },
  { t: 'The wind here comes from one side only, and the {kinds} sleep with their backs to it.' },
  { t: 'At dawn the light comes over the stones and reaches the {kinds} last. The young wake first.' },
]);

// A person of the crew, with the trait of the log of the wreck, at the twin. `trait` is the key of
// TRAITS in source-lore.js. The keeper writes "I", so no beat is about the keeper.
const PEOPLE = pool([
  { trait: 'firstflight', t: '{who} has named every {kind} of the herd. The names are in the small book, with a question under each.' },
  { trait: 'firstflight', t: '{who} is the youngest of us, and the first person the young {kinds} came to.' },
  { trait: 'firstflight', t: '{who} asked me today if we will ever see home. I said yes. {who} wrote the answer in the small book, and showed the page to a young {kind}.' },
  { trait: 'veteran', t: '{who} has made six landings, and says no landing was this. {who} sat with the {kinds} all afternoon.' },
  { trait: 'veteran', t: '{who} put the hand with the scar flat on a {kind} today. The {kind} let the hand stay.' },
  { trait: 'veteran', t: '{who} flew survey ships for twenty years. Tonight {who} said the {kinds} are the best survey of the twenty years.' },
  { trait: 'parent', t: '{who} recorded a bedtime story about the {kinds} tonight, for the two daughters at home.' },
  { trait: 'parent', t: '{who} counts the days to the birthday at home. The count is long. A young {kind} sleeps close by while {who} counts.' },
  { trait: 'parent', t: '{who} carried a young {kind} back to the herd today, and did not speak for an hour after.' },
  { trait: 'farm', t: '{who} grew up on a farm and knows herds. {who} can tell the old {kinds} from the young by the way they eat.' },
  { trait: 'farm', t: '{who} is up before the rest of us, and out with the {kinds} at first light.' },
  { trait: 'farm', t: '{who} mended a tear in the tent with wire from the beacon case. The proper part can come later, {who} says. A young {kind} watched.' },
  { trait: 'money', t: '{who} signed on for the pay. Tonight {who} said there is no pay out here, and laughed with the {kinds} round the tent.' },
  { trait: 'money', t: '{who} sends the whole wage home to a sick brother. {who} talks to the {kinds} about the brother every night.' },
  { trait: 'money', t: '{who} worked out the pay owed for the days at the stones. The figure is on the tent wall, and a young {kind} sleeps under it.' },
  { trait: 'reader', t: '{who} brought one book through the stones. Tonight {who} read the book aloud to the {kinds}, at the door of the tent.' },
  { trait: 'reader', t: '{who} is writing a manual for life with the {kinds}. It has nine pages so far.' },
  { trait: 'reader', t: '{who} recited the long poem from school at dusk. The {kinds} came closer while {who} spoke.' },
  { trait: 'talker', t: '{who} talks to the {kinds} all day. {who} says the {kinds} listen better than {we} do.' },
  { trait: 'talker', t: '{who} talks through every job, and today the young {kinds} followed the talk from job to job.' },
  { trait: 'talker', t: '{who} has given every {kind} of the herd a voice and a story. {We} know all the stories now.' },
  { trait: 'tidy', t: '{who} labels everything. Today {who} tied a strip of orange tape to the youngest {kind}, so {we} can find it.' },
  { trait: 'tidy', t: '{who} folds the blanket square every morning, here, at the foot of the stones, among the {kinds}.' },
  { trait: 'tidy', t: '{who} laid the tools out on a flat stone in one order. A young {kind} moved one, and {who} put it back.' },
  { trait: 'faith', t: '{who} said the short prayer before supper, and the {kinds} were still for it.' },
  { trait: 'faith', t: '{who} holds the medal from the grandmother at the stones every dusk, and the {kinds} come to watch.' },
  { trait: 'faith', t: '{who} kept the day of rest today, and sat with the {kinds} from dawn to dark.' },
  { trait: 'joker', t: '{who} found a joke note at the bottom of the pack today, the last one. {We} read the note out to the {kinds}.' },
  { trait: 'joker', t: '{who} has given every {kind} of the herd a rude name. The young one by the tent is called Trouble.' },
  { trait: 'joker', t: '{who} told the second of the three jokes tonight, the good one, and a {kind} called out at the end.' },
  { trait: 'sleepless', t: '{who} sleeps four hours a night. The rest of the night {who} sits with the {kinds} at the edge of the flat.' },
  { trait: 'sleepless', t: '{who} takes every night watch. {who} says the {kinds} keep watch too, in turns.' },
  { trait: 'sleepless', t: '{who} is awake at all hours, and the young {kinds} know it. {who} is never alone at night.' },
  { trait: 'artist', t: '{who} has drawn every {kind} of the herd. The drawings cover the inside wall of the tent.' },
  { trait: 'artist', t: '{who} drew each of us with the {kinds}, very small, with the stones behind.' },
  { trait: 'artist', t: '{who} copied the carvings here and laid the copies beside the drawings from {site}. The {kinds} are the same in both.' },
  { trait: 'runner', t: '{who} runs with the young {kinds} at dawn, round the stones and back.' },
  { trait: 'runner', t: '{who} was a runner at school. Today {who} ran beside the {kinds} for an hour and came back laughing.' },
  { trait: 'runner', t: '{who} did pull-ups on the edge of the stones this morning, and the young {kinds} watched every one.' },
  { trait: 'standin', t: '{who} joined the crew nine days before launch. Tonight {who} said the sick person at home would give anything to see the {kinds}.' },
  { trait: 'standin', t: '{who} was the reserve for this flight. {who} says a reserve does not get to choose, and would choose the {kinds}.' },
  { trait: 'standin', t: '{who} met the rest of us nine days before launch. Today {who} fed a young {kind} and said this is the crew {who} would pick.' },
  { trait: 'boat', t: '{who} grew up on a boat and ties every line twice. The tent has held in every wind, and the {kinds} sleep against it.' },
  { trait: 'boat', t: '{who} cannot sleep in silence. The breath of the {kinds} round the tent is enough.' },
  { trait: 'boat', t: '{who} taught {us} the knots from the boat, and {we} tied a line from the tent to the stones. The {kinds} step over it.' },
  { trait: 'teacher', t: '{who} taught school for ten years. Today {who} gave a lesson to the young {kinds}, and the young came.' },
  { trait: 'teacher', t: '{who} wrote a lesson about the {kinds} in the back of the log, for a class at home.' },
  { trait: 'teacher', t: '{who} explained the {kinds} to {us} twice tonight, and then said {we} know nothing about them yet.' },
  { trait: 'twin', t: '{who} writes to a twin at home every week, all the same. The letter tonight is about the {kinds}.' },
  { trait: 'twin', t: '{who} says the twin at home would love the {kinds}. {We} agree.' },
  { trait: 'twin', t: '{who} wrote to the twin at home tonight: you should see the {kinds}. There is no post, and {who} wrote it all the same.' },
  { trait: 'letters', t: '{who} wrote a letter on paper tonight, about the {kinds}, and put it in the tin with the other letters.' },
  { trait: 'letters', t: '{who} read a letter from home aloud tonight, to {us} and to the {kinds}.' },
  { trait: 'letters', t: '{who} keeps a diary in a code. The entry of tonight is about the {kinds}, and {who} read it out in plain words.' },
  { trait: 'sweets', t: '{who} gave the last boiled sweet to a young {kind}. The {kind} spat it out, and {we} laughed until {we} cried.' },
  { trait: 'sweets', t: '{who} took the bottle out tonight and put the bottle back. The {kinds} watched. The bottle is for the day we go home.' },
  { trait: 'sweets', t: '{who} opened the last jar of pickles from home tonight and shared the pickles out at the stones. The {kinds} came to smell the jar.' },
  { trait: 'heights', tags: '!needdark', t: '{who} is afraid of the dark, and sleeps among the {kinds}, in the light of the stones.' },
  { trait: 'heights', t: '{who} does not like heights and climbed the stones all the same, to count the {kinds}.' },
  { trait: 'heights', t: '{who} is afraid of the dark. Tonight {who} walked out to the {kinds} in the dark with no lamp.' },
  { trait: 'wedding', t: '{who} is to be married four days after we get home. {who} still says after, and not if. The {kinds} were there to hear it.' },
  { trait: 'wedding', t: '{who} carries a ring in a pocket, for a question to be asked at home. Tonight {who} showed the ring to the {kinds}.' },
  { trait: 'wedding', t: '{who} talked about the one person at home tonight, and how that person would laugh at the {kinds}.' },
  { trait: 'unwilling', t: '{who} did not want this flight and says so every night. Tonight {who} fed the {kinds} and said it the other way round.' },
  { trait: 'unwilling', t: '{who} says this is the last flight, and the garden at home can wait one more season. The {kinds} are the garden now.' },
  { trait: 'unwilling', t: '{who} turned this flight down twice. Tonight {who} fed a young {kind} from one hand and said nothing about it.' },
  { trait: 'stars', t: '{who} has drawn a new constellation over the stones, in the shape of a {kind}.' },
  { trait: 'stars', t: '{who} goes out after dark to look up, and the {kinds} look up too. The sky here is new, and {who} has named nine stars in it.' },
  { trait: 'stars', t: '{who} wanted to fly from the age of six. Tonight {who} said the child of six would not believe the {kinds}.' },
  { trait: 'hands', t: '{who} carved a small {kind} out of packing foam. It stands on the crate by the door of the tent.' },
  { trait: 'hands', t: '{who} knitted a band in orange and white, and tied the band round the youngest {kind}.' },
  { trait: 'hands', t: '{who} cut the hair of everybody here tonight, outside, with the {kinds} watching.' },
]);

// ---------------------------------------------------------------- the trouble of the herd
// Every need holds three wordings or more that fit a crew of any size.
const NEED = pool([
  { tags: 'needseep hasone', t: 'Every dawn the {kinds} go to a dry hollow at the foot of the stones and dig in the sand. {one} found the old line of water on the rock. There was a spring here once.' },
  { tags: 'needseep', t: 'The {kinds} are thin, and the young are thinner. The only water in a day of walking is a damp patch under the stones. The patch is smaller each day. {We} watched the young lick the damp sand.' },
  { tags: 'needseep', t: 'At noon the {kinds} lick the shaded side of the stones, where the rock is damp. The spring at the foot of the stones is sand now. The young cry at it all day.' },
  { tags: 'needseep', t: 'The {kinds} come to the stones for water, and the water is going. {We} measured the damp patch under the stones each morning. It is half the size it was.' },
  { tags: 'needseep atwell', w: 2, t: 'The {kinds} come to the rim of the shaft at dusk and look down. Water lies on the floor of the shaft, and the young cannot get down to it.' },
  { tags: 'needden', t: 'The {kinds} sleep out the noon heat in a den under a shelf of rock. A storm filled the den with sand in the night, and the young have no shade.' },
  { tags: 'needden', t: 'Part of the rock over the den of the {kinds} came down in the night. The young lie in the sun at noon now, and pant. The old ones stand over the young, and it is not enough.' },
  { tags: 'needden', t: 'The {kinds} dig at the mouth of their den every morning and cannot clear it. The sand comes back faster than the {kinds} can dig.' },
  { tags: 'neednight', t: 'Every night here is {night} long. The young {kinds} cannot hold their heat that long, and they shake until dawn.' },
  { tags: 'neednight', t: 'The wind comes off the ice at dusk and does not stop until dawn. The {kinds} lie in a heap with the young in the middle. The young at the edge are stiff with cold by morning.' },
  { tags: 'neednight', t: 'The young {kinds} are born into the cold season, and the cold season here is long. Two young did not get up this morning. The old ones stayed by those two until noon.' },
  { tags: 'neednight', t: 'At dusk the {kinds} crowd into a hollow in the ice by the stones. The hollow is too small for all of them, and the young end up outside.' },
  { tags: 'neednight polarnight', t: 'The sun set on day {days} and will not come back up for weeks. The young {kinds} are cold, and they have stopped feeding.' },
  { tags: 'neednight mdig', w: 2, t: 'The {kinds} sleep under the ground, but the ground here is frozen hard. The young cannot dig deep enough to get out of the cold.' },
  { tags: 'needcrust', t: 'The {kinds} feed on the {plants} that grow under a crust of ice. The old ones break the crust. The young cannot, and the young are thin.' },
  { tags: 'needcrust', t: 'Every night the crust over the {plants} grows thicker. By dawn even the old {kinds} cannot break it, and the young go without.' },
  { tags: 'needcrust', t: 'The young {kinds} scrape at the ice over the {plants} all day and get nothing. Young that thin will not last the cold.' },
  { tags: 'needsea', t: 'The sea is higher every day. The flat where the {kinds} keep their young is an island at high water now, and the young cannot cross.' },
  { tags: 'needsea', t: 'The storms push the sea further up the beach each night. The {kinds} keep their young on a sand bank below the stones, and the sand bank is going.' },
  { tags: 'needsea', t: 'The {kinds} keep their young on a spit of land below the stones. This week the sea cut the spit in two, and the young are on the far half.' },
  { tags: 'needsea tides', t: 'At the top of each tide the sea comes over the low neck of land below the stones. The young {kinds} are on the wrong side of it, and the neck is under water longer each day.' },
  { tags: 'needsea mfly', w: 2, t: 'The young {kinds} cannot fly yet. The sea is rising round the sand bar with the young on it. The old {kinds} circle over the bar and call.' },
  { tags: 'needground', t: 'The ground here moves every few days. Last night a crack opened across the flat, and three young {kinds} were on the far side of it.' },
  { tags: 'needground', t: 'The flat round the stones cracks in the night, and hot rock comes up through the cracks. The {kinds} sleep on the flat all the same, because the stones are here.' },
  { tags: 'needground', t: 'The {kinds} sleep on the flat by the stones. Every few nights the ground under the {kinds} breaks, and the herd scatters in the dark. In the morning the old ones call for the young.' },
  { tags: 'needflow', t: 'A new flow came down the slope in the night. The flow cut the {kinds} off from the ground where the herd feeds.' },
  { tags: 'needflow', t: 'The crust of the new flow looks cold, but under the crust the rock is still molten. The young {kinds} do not know the difference.' },
  { tags: 'needflow', t: 'The {kinds} have to cross the new flow to feed. The old ones find the cool rock. Twice now a young {kind} has come back hurt.' },
  { tags: 'needsick', t: 'The young {kinds} are sick. The young lie down at noon and do not get up to feed. The old ones wait by them and call.' },
  { tags: 'needsick', t: 'A grey crust has grown on the skin of the young {kinds}. The young rub against the stones all day and do not feed.' },
  { tags: 'needsick', t: 'The young {kinds} are thin and slow, and at night the young cough. The old ones bring the young to the stones, and nothing changes.' },
  { tags: 'needflood', t: 'It has rained for nine days. The river below the stones is over the banks. The young {kinds} are on the far side.' },
  { tags: 'needflood', t: 'The rain has not stopped since {we} came. The {kinds} keep their young on low ground by the river, and the low ground is a lake now.' },
  { tags: 'needflood', t: 'The river came up in the night and cut the flat in two. The {kinds} are on one side, and the young are on the other.' },
  { tags: 'needcold', t: 'The nights are colder every week. The young {kinds} shake at dawn and do not feed until noon.' },
  { tags: 'needcold', t: 'Frost stands on the {kinds} at dawn now. The old ones shake it off. The young do not get up.' },
  { tags: 'needcold', t: 'The wind turned cold this week and has not turned back. The young {kinds} huddle against the stones, and the stones are cold too.' },
  { tags: 'needdark', t: 'The stones here have given no light since {we} came through. Every night the {kinds} lie in a ring round the dark stones and wait. The young are thin.' },
  { tags: 'needdark', t: 'The {kinds} feed at night, in the light of the stones. The stones have been dark since {we} came, and the young have not fed.' },
  { tags: 'needdark', t: 'The {plants} round the stones gave light when {we} came. The {plants} went dark with the stones, and the {kinds} feed on them, and the young are hungry.' },
  { tags: 'needdark hasone', t: '{one} worked out the pattern. The {kinds} feed in the light of the stones and sleep by day. With the stones dark, the herd does not feed.' },
  { tags: 'needheat', t: 'The heat at noon is {temp}. The young {kinds} lie flat in the open and pant. The shade of the stones holds only a few of them.' },
  { tags: 'needheat', t: 'The heat comes up off the rock by mid-morning. The {kinds} crowd into the shadow of the stones, and the young get pushed out into the sun.' },
  { tags: 'needheat', t: 'Two young {kinds} did not get up after noon today. The old ones lay over the young to make shade.' },
]);

// What the crew feels about the trouble, in the same entry as the trouble.
const NEED_CODA = pool([
  { tags: 'hasone', t: '{one} watched the young {kinds} all afternoon and did not say a word.' },
  { tags: '!hasone', t: 'I sat with the young {kinds} all afternoon, and could do nothing.' },
  { t: 'The old {kinds} look at the tent, and then at the young.' },
  { t: '{We} could not watch that and do nothing.' },
  { t: 'That night {we} made a plan on the back of a ration pack.' },
  { tags: 'hasone', t: '{one} said what the rest of us were thinking: {we} have tools, and the {kinds} have none.' },
  { t: 'At the ship {we} could only watch the animals. Here {we} can do something.' },
  { tags: 'needseep|needden|needheat', t: '{We} have shade and water in the tent. The young {kinds} have neither.' },
  { tags: 'neednight|needcold|needcrust', t: '{We} have a heater and a tent. The young {kinds} have each other, and it is not enough.' },
  { tags: 'needsea|needflood', t: 'The water came up another hand today, and the young {kinds} watched it come.' },
  { tags: 'needground|needflow', t: 'Twice tonight {we} felt the ground move through the floor of the tent. The {kinds} felt it too.' },
  { tags: 'needsick', t: 'The med kit is in the pack. Nobody has opened it for an animal before.' },
  { tags: 'needdark', t: 'The stones went dark when {we} came through. {We} did this to the {kinds}.' },
  { t: 'Nobody slept much. The young {kinds} called all night.' },
  { tags: 'hasone', t: '{one} was up before dawn with the tools laid out on the flat, and a young {kind} watching.' },
  { t: '{We} talked it over at supper, and the talk was short.' },
]);

// What the crew does for the herd. Every need holds three wordings or more for a crew of one and
// for a larger crew.
const HELP = pool([
  { tags: 'needseep', t: '{We} dug at the foot of the stones for four days, at dawn and at dusk. At three metres the sand went dark and wet. By morning there was a pool the width of the tent, and the {kinds} came to it.' },
  { tags: 'needseep', t: '{We} dug where the old spring came out of the rock. The water was there, a spade deep under the sand. The {kinds} watched {us} dig, and then the {kinds} dug too.' },
  { tags: 'needseep', t: 'Each night {we} stretch the tent fly over the damp patch to catch what the air gives. By dawn there are two bottles of water under the fly. The young {kinds} drink first.' },
  { tags: 'needseep hasone', t: '{one} ran the hand drill down at the foot of the stones. The bit came up wet at nine metres. {We} rigged the hand pump, and the young {kinds} drank before {we} had finished.' },
  { tags: 'needseep atwell hasone', w: 2, t: '{one} went down the stair of the shaft with a bucket on a line, again and again. {We} filled a trough of stones at the rim, and the young {kinds} drank from it all night.' },
  { tags: 'needden', t: '{We} dug the den out with the spades, at dawn and at dusk, for six days. The poles of the tent hold up the rock now. On the seventh day the young {kinds} went back in.' },
  { tags: 'needden', t: '{We} cut a new den into the bank below the stones, deeper than the old one. The {kinds} watched from the edge, and on the third day the young went in.' },
  { tags: 'needden', t: 'The fly of the tent hangs from the stones on four poles now. At noon the young {kinds} lie under the fly, out of the sun.' },
  { tags: 'neednight', t: '{We} cut blocks of ice and built a wall on the side of the wind, three blocks high. The {kinds} brought the young in behind the wall that same night.' },
  { tags: 'neednight', t: '{We} take the young {kinds} into the tent at night, four at a time, under the heater. The heater runs on {our} cells, and {we} count the cells every morning.' },
  { tags: 'neednight', t: '{We} run the lamp and the heater at the mouth of the hollow all night. The young {kinds} sleep in the warm air, and in the morning all the young get up.' },
  { tags: 'needcrust', t: 'Every dawn {we} go out with the spades and break the crust over the {plants} for the young {kinds}. The young eat while {we} work.' },
  { tags: 'needcrust', t: '{We} rigged the heat cutter from the tent to a long pole. The cutter melts a line through the crust, and the young {kinds} feed along the line.' },
  { tags: 'needcrust', t: '{We} chip holes in the ice over the {plants}, one hole for each young {kind}. By the tenth day the young were fat again.' },
  { tags: 'needsea', t: '{We} built a causeway of stones across the low neck, a hand above the water. The young {kinds} crossed it at dawn, and the old ones came after.' },
  { tags: 'needsea', t: 'At the lowest water of the day {we} carried the young {kinds} over, one at a time, in {our} arms. The old ones waited on the high ground and called.' },
  { tags: 'needsea', t: '{We} tied the tent lines into one long rope from the stones to the high ground. The young {kinds} came across along the rope, and {we} held it taut.' },
  { tags: 'needsea woody', t: '{We} cut the trunks of {plants} and lashed a raft with the tent lines. {We} carried the young {kinds} over to the high ground, two at a time.' },
  { tags: 'needsea tides hasone !mfly', t: '{one} timed the tides for nine days and found the lowest. At that hour a ridge of rock stands out of the water, all the way to the high ground. {We} led the young {kinds} across it in the dark.' },
  { tags: 'needsea mfly', w: 2, t: 'The old {kinds} flew over {us} the whole way while {we} carried the young across in {our} arms.' },
  { tags: 'needground', t: '{We} sit up in turns with the ground sensor from the packs. On day {days} the needle jumped at midnight. {We} ran out with the lamp, and the {kinds} followed the lamp off the flat. An hour later the ground broke where the {kinds} had slept.' },
  { tags: 'needground', t: '{We} set the ground sensor on the flat. The sensor picks up a quake an hour before the ground moves. When the needle jumps, {we} key the beacon three times, and the {kinds} have learned what the clicks mean.' },
  { tags: 'needground', t: '{We} marked every part of the flat that rings under a spade. The {kinds} learned the marks in a week, and sleep on the solid rock now.' },
  { tags: 'needflow', t: '{We} walked the new crust with the heat camera and marked a cool path across the crust with stones. The old {kinds} learned the path first, and the young followed.' },
  { tags: 'needflow', t: '{We} laid a line of pale stones across the new flow, on rock the heat camera says is cool. The {kinds} cross on the line now.' },
  { tags: 'needflow', t: '{We} broke a way through the edge of the old crust with the spades, onto cool ground. The young {kinds} went through first.' },
  { tags: 'needsick', t: '{We} ran the water of the pool through the sample kit, and found a rot from the {plants} upstream. {We} led the {kinds} to the spring above the pool. In nine days the young fed again.' },
  { tags: 'needsick', t: 'The kit found the cause in a red weed at the edge of the water. {We} pulled every stem of the weed, for a week, and the young {kinds} got up.' },
  { tags: 'needsick', t: '{We} scraped the grey crust off a young {kind} and looked at it under the lens: a mould. {We} washed the young in the powder from the med kit, one by one, for a week.' },
  { tags: 'needflood', t: '{We} built a causeway of stones across the flood at the shallow end. The young {kinds} came across the causeway at dusk.' },
  { tags: 'needflood', t: '{We} lashed a raft of {plants} and poled the young {kinds} over, two at a time.' },
  { tags: 'needflood', t: '{We} took a line across the river and tied the line to a {plant} on the far bank. {We} carried the young {kinds} across on the line, one at a time, all day.' },
  { tags: 'needcold', t: '{We} built a wall of stones on the side of the wind. The {kinds} brought the young in behind the wall that night.' },
  { tags: 'needcold', t: '{We} gave the young {kinds} the tent at night, and slept outside in the suits with the old ones.' },
  { tags: 'needcold', t: 'The lamp and the heater run at the mouth of a hollow under the stones now. The young {kinds} sleep there, and {we} sit up with the cells.' },
  { tags: 'needdark', t: '{We} keyed the call sign on the beacon at dusk, and the marks on the stones lit. The light came back for an hour. The {kinds} came into it at once.' },
  { tags: 'needdark', t: '{We} tried every sound on the tape of the call. The stones give light while the beacon plays the sounds. The beacon plays the tape all night now, and the {kinds} feed in the light.' },
  { tags: 'needdark', t: '{We} set the beacon on the stones to send the call sign all night. The stones lit, bright and dim. At midnight the young {kinds} began to feed.' },
  { tags: 'needheat', t: '{We} rigged the fly of the tent and the blankets on poles at the foot of the stones. At noon the young {kinds} lie under the fly.' },
  { tags: 'needheat', t: '{We} dug a trench on the shaded side of the stones, an arm deep. The young {kinds} lie in the trench through the heat of the day.' },
  { tags: 'needheat', t: '{We} strung the tent lines between the stones and hung every sheet {we} have on the lines. The shade holds the young {kinds} now.' },
]);
// What the herd did next, in the same entry: the first sign that the herd takes the crew in.
const HELP_CODA = pool([
  { t: 'That night the {kinds} lay down closer to the tent than before.' },
  { t: 'At dusk an old {kind} came to the door of the tent and stayed there until dark.' },
  { t: 'The young {kinds} follow {us} now, wherever {we} go on the flat.' },
  { tags: 'hasone', t: '{one} sat up all night with the young {kinds}, and came in at dawn grinning.' },
  { t: 'Nobody asked the {kinds} for anything. {We} did it because the young were cold, or thirsty, or scared.' },
  { t: 'The young {kinds} sleep closer to the tent every night.' },
  { t: 'An old {kind} watched the whole job from the edge of the flat.' },
  { t: '{We} did not ask the {kinds} for anything in return.' },
  { t: 'After that, the {kinds} did not keep to the edge of the flat.' },
  { t: 'At dusk a young {kind} came and lay down against the tent wall.' },
  { t: 'The {kinds} watched {us} work, and then came closer.' },
  { tags: 'hasone', t: '{one} came in at dark, tired and smiling, with a young {kind} close behind.' },
]);

// What the herd gives back, by the condition of the crew.
const GIFT = pool([
  { tags: 'openair woody !fungal', t: 'The {kinds} eat a fruit that grows low on the {plants}. {We} ran it through the kit, and a person can eat it. {We} have eaten little else since.' },
  { tags: 'openair fungal', t: 'The {kinds} crop the soft caps of the {plants}. The kit says a person can eat the caps. They taste of smoke, and they fill {us}.' },
  { tags: 'openair cactus', t: 'The {kinds} split the {plants} open for the water inside. {We} do it too now, with a knife. It tastes bitter, and it keeps {us} alive.' },
  { tags: 'openair', t: 'The {kinds} dig a pale root at the edge of the flat. {We} dig it too now. The root tastes of nothing, and it keeps {us} alive.' },
  { tags: 'openair', t: 'Where the {kinds} graze, {we} dig. The kit says half of what {we} find is food, and {we} eat that half.' },
  { tags: 'openair', t: 'The {kinds} drink at a spring behind the stones that {we} would never have found. The water is sweet, and there is a lot of it.' },
  { tags: 'openair hasone', t: 'A young {kind} took {one} to a hollow where the {kinds} feed. The pods there are safe, by the kit. That is what {we} eat now.' },
  { tags: 'coldsuit', t: 'When {our} cells ran low, the {kinds} lay down round the tent, close against the walls. The tent held nine degrees all night with the heater off.' },
  { tags: 'coldsuit', t: 'The {kinds} showed {us} a hollow under the stones where the rock is warm. {We} moved the tent into it, and the young sleep round the tent.' },
  { tags: 'coldsuit', t: 'Each dusk the {kinds} lie down in a ring round the tent, the old ones outside and the young inside. The heater has been off for nine nights.' },
  { tags: 'coldsuit mdig', w: 2, t: 'The {kinds} opened their den under the ground to {us}. It is warm down there from the bodies, and the cells last three times as long.' },
  { tags: 'hotsuit', t: 'At noon the {kinds} go into a deep cave on the far side of the stones. On day {days} the {kinds} let {us} follow them in. In the cave the suits hold all day.' },
  { tags: 'hotsuit', t: 'The {kinds} lie in the shadow of a rock shelf through the heat of the day. {We} sleep there now, between the young, out of the sun.' },
  { tags: 'hotsuit', t: 'The {kinds} led {us} to a spring in a crack of the rock, an hour from the stones. The water is cool. {We} fill the suit loops there every day.' },
  { tags: 'lava', t: 'The {kinds} took {us} down a crack to a cave where the rock is cool enough to touch. The suits rest there, and so do {we}.' },
  { tags: 'lava', t: 'In the day the {kinds} lie in a deep cave under the flat. At the floor the air is under a hundred degrees, and the cells last four times as long.' },
  { tags: 'lava', t: 'The {kinds} know every cool place under the flat. {We} follow them from one to the next, and the suits have not run hot since.' },
]);

// What the gift means to the crew, in the same entry as the gift.
const GIFT_CODA = pool([
  { t: 'For the first time since {site}, {we} slept a whole night.' },
  { tags: '!openair', t: '{We} have stopped counting the days of the cells.' },
  { tags: 'openair', t: '{We} have stopped counting the days of the seed store.' },
  { t: 'Every dusk an old {kind} lies down at the door of the tent and stays until dawn.' },
  { t: 'The young {kinds} learn the tent, and {we} learn the {kinds}.' },
  { t: 'The {kinds} gave that without being asked.' },
  { tags: 'hasone', t: '{one} wrote it all down, and then sat a long time with the notebook shut.' },
  { tags: 'coldsuit', t: 'The frost stays outside the ring of {kinds} now.' },
  { tags: 'hotsuit', t: 'At noon {we} sleep now, and the suits rest.' },
  { tags: 'lava', t: 'The suit alarms have not gone off since.' },
  { tags: 'openair', t: 'The seed store is shut, and {we} mean to keep it shut.' },
  { t: 'A young {kind} watched {us} settle in, and then lay down across the door.' },
]);

// ---------------------------------------------------------------- the pact
// The turn of the pact: the crew came to help the herd, and the herd saves the crew.
const SAVE = pool([
  { tags: 'coldsuit', t: 'On day {days} the heater died, and the spare cells were flat. That night the {kinds} came into the lee of the tent and lay down against it, all of them. At dawn the tent was warm.' },
  { tags: 'coldsuit', t: 'The storm on day {days} tore the fly off the tent. The {kinds} made a ring round {us}, three deep, until the wind dropped.' },
  { tags: 'coldsuit herdsmall', t: 'On day {days} {we} woke with frost inside the tent and no power in the cells. The {kinds} had come in through the door in the night and lay across {our} feet. Nobody froze.' },
  { tags: 'coldsuit', t: 'On day {days} the heater broke for good. Since that night the old {kinds} sleep pressed against the tent, on every side. The frost stays on the outside of the {kinds}.' },
  { tags: 'coldsuit mdig', w: 2, t: 'On day {days} the tent split in the cold. The {kinds} dug a hollow under the tent before dark, and {we} slept in the warm ground among the young.' },
  { tags: 'hotsuit', t: 'On day {days} the water ran out. At dusk the old {kinds} went out into the dunes, and {we} followed. At midnight the {kinds} stopped and dug, and there was water.' },
  { tags: 'hotsuit', t: 'The dust storm on day {days} buried the tent. The {kinds} found {us} under the sand and dug until {we} could get out.' },
  { tags: 'hotsuit', t: 'On day {days} {our} suit cooling failed on the flat at noon. The {kinds} came out of the shade and lay round {us} in a ring, and made shade until dusk.' },
  { tags: 'lava', t: 'On day {days} a {kind} would not let {us} sleep. The {kind} pushed at the tent until {we} came out. An hour later the ground broke where the tent stood.' },
  { tags: 'lava', t: 'On day {days} the cooler of the tent failed. The {kinds} took {us} down into their cave, and waited at the mouth until dusk.' },
  { tags: 'lava', t: 'On day {days} {our} cells ran out on the flat, an hour from the cave. The {kinds} came out into the heat and kept beside {us} all the way in.' },
  { tags: 'openair', t: 'On day {days} the food ran out. A young {kind} came to the door of the tent at dawn and would not leave until {we} followed it. It led {us} to a hollow full of pods.' },
  { tags: 'openair', t: 'On day {days} a fever put {us} flat in the tent for four days. Each morning there were pods at the door. Nobody saw the {kinds} bring them.' },
  { tags: 'openair', t: 'On day {days} {we} lost the way in the {plants} after dark. A {kind} came out of the dark and went ahead of {us}, all the way back to the stones.' },
  { tags: 'openair hasocean', t: 'A storm came in off the sea on day {days}. The {kinds} made a ring round the tent with the young inside it, and {us} too.' },
]);
// The last sentence of the turn, in the same entry.
const SAVE_CODA = pool([
  { t: '{We} came here to help the {kinds}. {We} did not think the {kinds} would help back.' },
  { t: 'Nobody taught the {kinds} to do that. {We} did not ask.' },
  { t: 'Every day since, {we} have looked at the {kinds} in a new way.' },
  { tags: 'hasone', t: '{one} cried, and then laughed, and then went out to sit with the {kinds}.' },
  { t: '{We} came to help the {kinds}, and the {kinds} came back for {us}.' },
  { t: 'Since that day the {kinds} lie down round the tent every night.' },
  { t: 'Nobody at home will believe this. It is in the log all the same.' },
  { t: 'In the end the {kinds} were the ones who helped.' },
]);
// A young animal with a name.
const CALF = pool([
  { tags: 'hasone', t: 'A young {kind} follows {one} everywhere. {one} calls it {calf}, and {calf} comes to the name.' },
  { t: 'The smallest young {kind} sleeps at the door of the tent now. {We} call it {calf}.' },
  { t: '{calf} is the smallest {kind} of the herd, and the boldest. {calf} eats from {our} hands.' },
  { tags: 'hasone', t: '{one} named a young {kind} {calf} today. {calf} follows {one} to the stones and back.' },
  { tags: '!hasone', t: 'A young {kind} follows me everywhere. I call it {calf}, and {calf} comes to the name.' },
]);
const END_PACT = pool([
  { tags: 'hasone', t: 'Day {days}. The {kinds} sleep round the tent, and the beacon is on at the stones, day and night. A ship from home needs {years} years to reach {world}. We have the herd and each other. We keep going.' },
  { tags: 'hasone', t: 'The hand beacon is on at the stones and will stay on. If a ship comes, the ship will pick up the beacon here. Until then we live with the {kinds}, and we keep going.' },
  { tags: 'hasone calfnamed', w: 2, t: '{calf} is asleep at the door of the tent, and the beacon is on. A ship from home needs {years} years. We have a herd, a tent, and each other, and we keep going.' },
  { tags: 'hasone', t: '{one} cut the days into the stones today, in a long row, and left room for many more. The {kinds} watched. The beacon is on, day and night, and we keep going.' },
  { tags: '!hasone', t: 'Day {days}. The {kinds} sleep round the tent, and the beacon is on at the stones. A ship from home needs {years} years to reach {world}. I have the herd. I keep going.' },
  { tags: '!hasone', t: 'I keep the hand beacon on at the stones, day and night. If a ship comes, the ship will pick up the beacon here. Until then I live with the {kinds}, and I keep going.' },
  { tags: '!hasone calfnamed', w: 2, t: '{calf} sleeps at the door of the tent, and the beacon is on. A ship from home needs {years} years. I have a herd and a tent, and I keep going.' },
  { tags: '!hasone', t: 'I cut the days into the stones today, in a long row, and left room for many more. The {kinds} watched. The beacon is on, day and night, and I keep going.' },
]);

// ---------------------------------------------------------------- the long walk
// The herd leaves the stones, and the crew goes with it.
const GO = pool([
  { t: 'On day {days} the {kinds} left the stones, all of them, young and old. {We} could stay at the stones alone, or go. {We} packed the tent in an hour.' },
  { note: true, w: 1.5, t: 'The {kinds} left at dawn on day {days}. {We} left a note in a case on the stones: gone with the herd, back with the herd. Then {we} went after the {kinds}.' },
  { note: true, t: 'On day {days} the {kinds} went, and {we} went with them. The note {we} left in a case on the stones says: back with the herd.' },
  { t: 'The {kinds} will not stay at the stones through the season. On day {days} the herd went, and {we} went with it, with the tent, the beacon, and this log.' },
  { tags: 'hasone', t: '{one} saw the {kinds} going before I did, a long line away from the stones. {one} had the tent down before the last young were out of sight.' },
  { tags: 'needseep', w: 2, t: 'The pool at the stones went dry in the heat of the season. On day {days} the {kinds} left for water, and {we} went with them.' },
  { tags: 'needden', w: 2, t: 'The den is too hot now, even the new one. On day {days} the {kinds} left the stones for cooler ground, and {we} followed.' },
  { tags: 'neednight', w: 2, t: 'The nights grew longer than the young {kinds} could bear. On day {days} the herd turned toward the sun and left the stones. {We} went with the herd.' },
  { tags: 'needcrust', w: 2, t: 'The crust closed over the last of the {plants}. On day {days} the {kinds} left to find thinner ice, and {we} went too.' },
  { tags: 'needsea', w: 2, t: 'At the lowest water on day {days} the {kinds} crossed to the young. Then the whole herd went up the shore, and {we} went with it.' },
  { tags: 'needground', w: 2, t: 'On day {days} the ground under the stones broke three times before noon. The {kinds} left for older rock, and {we} followed with the tent on {our} backs.' },
  { tags: 'needflow', w: 2, t: 'The new flows closed the last way to the feeding ground. On day {days} the {kinds} left the stones by the high ridge, and {we} followed.' },
  { tags: 'needsick', w: 2, t: 'On day {days} the {kinds} left the bad water behind for good. The herd went to new ground, and {we} went with it.' },
  { tags: 'needflood', w: 2, t: 'When the river went down on day {days}, the {kinds} crossed to the young. The herd did not come back, and {we} crossed after it.' },
  { tags: 'needcold', w: 2, t: 'The cold came down hard in one night. On day {days} the {kinds} turned their backs on the wind and left the stones. {We} went with the herd.' },
  { tags: 'needdark', w: 2, t: 'The stones stayed dark. On day {days} the {kinds} left to find {plants} that give light, and {we} went with them.' },
  { tags: 'needheat', w: 2, t: 'The shade of the stones was not enough. On day {days} the {kinds} left for the hills, where the nights are cool, and {we} went too.' },
]);
// How the herd travels, by the way it moves.
const WALK = pool([
  { tags: 'mwalk', t: 'The {kinds} walk {pace} kilometres a day, with a long stop at noon. {We} walk in the middle of the herd, where the wind is least.' },
  { tags: 'mwalk', t: 'Each day the {kinds} walk from first light until dusk, {pace} kilometres or so. The young walk in the middle, and so do {we}.' },
  { tags: 'mcrawl', t: 'The {kinds} travel in long lines, each in the track of the one ahead, {pace} kilometres a day. {We} walk beside the lines.' },
  { tags: 'msling', t: 'The {kinds} go from hold to hold, and wait for {us} where the ground is open. {We} make {pace} kilometres on a good day.' },
  { tags: 'mdig', t: 'The {kinds} travel under the ground. By day {we} follow the raised lines, and at dusk {we} find the mounds, {pace} kilometres on.' },
  { tags: 'mfly', t: 'The {kinds} fly ahead in the morning and come down to wait for {us} at dusk, {pace} kilometres on.' },
  { t: 'The {kinds} cover {pace} kilometres a day, and {we} keep up.' },
  { t: 'The {kinds} set the pace, {pace} kilometres a day, and never more.' },
  { t: 'The {kinds} rest at noon and travel until dark, {pace} kilometres a day. {We} carry the tent in turns.' },
]);
// The crew helps the herd on the way.
const WAYHELP = pool([
  { tags: 'waterliquid !desert', t: 'At a river on day {days}, {we} carried the young over, one at a time.' },
  { tags: 'desert', t: 'On the dry stretch {we} carried water for the young in every bottle {we} had.' },
  { tags: 'ice', t: 'At the pass {we} cut steps in the ice for the young.' },
  { tags: 'coldsuit', t: 'When the young could not keep warm, {we} put the smallest in the tent with {us}.' },
  { t: 'At night {we} keep a lamp lit at the back of the herd for the slow ones.' },
  { tags: 'lava|ice', t: 'At the wide cracks {we} lay the tent poles across for the young.' },
  { tags: 'hasone', t: 'When a young {kind} fell behind, {one} carried it until dusk.' },
  { t: 'Each night {we} count the young. Every night the count is right.' },
  { t: '{We} keep the young out of the rough ground, and the old ones let {us}.' },
  { t: 'When the young tire, {we} carry the smallest in the empty packs.' },
]);
// The herd keeps the crew alive on the way, by the condition of the crew.
const WAYGIFT = pool([
  { tags: 'coldsuit', t: 'At night {we} sleep in the middle of the herd, and the cells last.' },
  { tags: 'coldsuit', t: 'The herd lies round the tent at every stop. The heater has not run since the stones.' },
  { tags: 'coldsuit', t: 'In the wind the old ones keep on the side of the wind, and {we} keep behind them.' },
  { tags: 'hotsuit', t: '{We} travel at night with the herd, and sleep in the day under the fly, with the young.' },
  { tags: 'hotsuit', t: 'The herd knows every spring on the way. {We} fill the suit loops at each one.' },
  { tags: 'hotsuit', t: 'At noon the herd stops in any shade there is, and {we} stop with it.' },
  { tags: 'lava', t: 'The herd knows the cool rock, and {we} go where the herd goes.' },
  { tags: 'lava', t: 'Each day the herd rests in a cave, and {we} rest with it and let the suits cool.' },
  { tags: 'lava', t: 'Where the herd crosses, the crust holds. {We} cross nowhere else.' },
  { tags: 'openair', t: '{We} eat what the herd eats, and drink where the herd drinks.' },
  { tags: 'openair', t: 'The herd finds food at every stop, and some of it a person can eat.' },
  { tags: 'openair', t: 'The herd knows where the water is, and {we} have not gone thirsty once.' },
]);
// The far end of the walk: a wonder, by the world. The herd piles stones there: the makers were the
// ancestors of this animal, and a little of the building is left.
const FAR = pool([
  { t: 'At the far end of the walk there is a ridge with dozens of old cairns. Each {kind} that passes puts one more stone on a cairn. {We} never saw the {kinds} carry anything before.' },
  { t: 'On day {days} {we} saw the {kinds} build. At the far end of the walk each {kind} brought a stone to a ring of stones. The ring grew, and {we} stood and watched it grow.' },
  { tags: 'desert rainy', t: 'On day {days} the {kinds} reached the edge of the rains. Water stood in every hollow, and the {plants} opened overnight.' },
  { tags: 'desert', t: 'On day {days} the {kinds} came down into a basin where water comes up out of the sand at night. The young drank until dawn.' },
  { tags: 'desert', t: 'The far end of the walk is a canyon with a stream at the bottom. The {kinds} have their young there, in the shade of the walls.' },
  { tags: 'desert', t: 'On day {days} the {kinds} climbed to a high plain where the nights are cool. The young were born there, {young} of them.' },
  { tags: 'ice polarnight', w: 2, t: 'On day {days} the sun came up over the ice for the first time in weeks. Every {kind} stopped and faced the sun.' },
  { tags: 'ice', t: 'The far end of the walk is warm ground, where the ice melts from below. The young {kinds} were born there, {young} of them in one night.' },
  { tags: 'ice geysers', w: 2, t: 'The {kinds} brought {us} to the geysers. The ground there is warm, and the young of the year were born on it.' },
  { tags: 'ice', t: 'On day {days} the {kinds} climbed out of the wind into a valley of dark rock. The rock holds the heat of the sun, and the young were born there.' },
  { tags: 'ocean tides', t: 'At the lowest tide of the season the {kinds} crossed a sand bar to a high island. {We} crossed with them. The young were born on the sand there, {young} of them.' },
  { tags: 'ocean', t: 'The far end of the walk is a high island of {plants}, above every storm. The {kinds} have their young there.' },
  { tags: 'ocean', t: 'The {kinds} led {us} along the coast to a bay where the sea is calm. The young {kinds} were born on the beach, {young} in three nights.' },
  { tags: 'ocean', t: 'On day {days} the {kinds} reached a headland of black rock above the sea. The herd stayed there nine days while the young were born.' },
  { tags: 'lava', t: 'On day {days} the {kinds} came out onto a plain of old rock, cool and grey, where nothing breaks. The young were born there.' },
  { tags: 'lava', t: 'The far end of the walk is a high ridge above the smoke. For a day the suits ran cool, and the young {kinds} were born.' },
  { tags: 'lava crystalflora', t: 'The {kinds} brought {us} to a field of crystals that ring in the wind. The young were born in the ringing, {young} of them.' },
  { tags: 'terran', t: 'The far end of the walk is high ground above the {plants}, open to the sky. The young {kinds} were born there, {young} in three nights.' },
  { tags: 'terran', t: 'On day {days} the {kinds} came into a valley out of the wind. The young were born there, {young} of them.' },
  { tags: 'terran', t: 'At the far end of the walk the {plants} stop, and there is a wide bowl of bare rock. The {kinds} have their young in the middle of it.' },
  { tags: 'terran waterliquid', t: 'On day {days} the {kinds} came to a lake in the hills and stopped. {We} stopped too. It is the best place {we} have seen on {world}.' },
  { tags: 'exotic', t: 'On day {days} the {kinds} came to a field of {plants} that give light all night. The young fed in the light until dawn.' },
  { tags: 'exotic', t: 'The far end of the walk is a ring of {plants} taller than the stones. The {kinds} went into the ring, and {we} followed. The young were born in the middle, where it is warm.' },
  { tags: 'exotic', t: 'On day {days} the {kinds} reached a hollow where the {plants} ring when the wind blows. The young were born there, {young} of them.' },
]);
// The death on the walk, or at the tent in the broken pact.
const LOSS_CAUSE = pool([
  { tags: 'coldsuit', t: '{lost} died on day {days}, in the cold of the pass, in the middle of the {kinds}.' },
  { tags: 'hotsuit', t: '{lost} died on day {days}, in the heat of the afternoon, in the shade of the {kinds}.' },
  { tags: 'lava', t: '{lost} died on day {days}, when a suit failed an hour from the cool rock.' },
  { tags: 'openair', t: '{lost} died on day {days}, of a fever the med kit could not stop.' },
  { t: '{lost} fell on day {days} and did not get up again. {lost} died that night.' },
  { t: '{lost} died in the night on day {days}. {lost} was asleep, and did not wake.' },
]);
const LOSS_SOUR = pool([
  { tags: 'coldsuit', t: '{lost} died on day {days}, in the tent, with the lamp on.' },
  { tags: 'hotsuit', t: '{lost} died on day {days}, in the shade of the stones, in the heat of the afternoon.' },
  { tags: 'lava', t: '{lost} died on day {days}, when the cooler stopped in the heat of the afternoon.' },
  { tags: 'openair', t: '{lost} died on day {days}, of the fever, in the tent.' },
  { t: '{lost} died in the night on day {days}. {lost} was asleep, and did not wake.' },
  { t: '{lost} did not wake on the morning of day {days}.' },
]);
const BURIAL = pool([
  { tags: '!fatetrek', t: '{We} buried {lost} under a cairn by the stones.' },
  { tags: '!fatetrek', t: '{We} laid {lost} under flat stones at the edge of the flat, facing the stones.' },
  { tags: '!fatetrek', t: '{We} built a cairn for {lost} out of the rubble at the foot of the stones.' },
  { tags: '!polarnight !fatetrek', t: '{We} built a cairn for {lost} on the side of the stones where the sun comes up.' },
  { tags: 'fatetrek', w: 2, t: '{We} buried {lost} under a cairn on a ridge, facing the way back to the stones.' },
  { tags: 'fatetrek', w: 2, t: 'The {kinds} waited while {we} built a cairn for {lost}. Then each {kind} brought one stone to it.' },
  { tags: 'fatetrek', w: 2, t: '{We} built a cairn for {lost} where the {kinds} turned for home. The {kinds} added stones to the cairn.' },
]);
// What the crew keeps of the person who died, by the trait of that person.
const KEEPSAKE = pool([
  { trait: 'firstflight', w: 4, t: '{We} put the small book of questions under the top stone.' },
  { trait: 'veteran', w: 4, t: '{We} left the old flight badge of {lost} on the top stone.' },
  { trait: 'parent', w: 4, t: 'The bedtime stories {lost} recorded are in the pack. They go home to the two daughters.' },
  { trait: 'farm', w: 4, t: '{We} put a handful of the ground on the cairn, for {lost}.' },
  { trait: 'money', w: 4, t: 'The last pay of {lost} goes to a sick brother at home. The name of the brother is in this log.' },
  { trait: 'reader', w: 4, t: 'The one book of {lost} is under the top stone of the cairn.' },
  { trait: 'talker', w: 4, t: 'Nobody talks to the {kinds} now. {lost} did all the talking.' },
  { trait: 'tidy', w: 4, t: 'The labels {lost} made are still on every box. {We} have left the labels on.' },
  { trait: 'faith', w: 4, t: 'The medal from the grandmother hangs on the top stone of the cairn.' },
  { trait: 'joker', w: 4, t: 'There was one joke note left in the pack of {lost}. {We} read it out at the cairn and laughed.' },
  { trait: 'sleepless', w: 4, t: 'Nobody takes the night watch of {lost}. {We} leave a lamp at the door.' },
  { trait: 'artist', w: 4, t: 'The last drawing {lost} made is of the {kinds} at the stones. It is folded into this log.' },
  { trait: 'runner', w: 4, t: '{We} walked one lap of the cairn for {lost}, and then one more.' },
  { trait: 'standin', w: 4, t: '{lost} joined this crew nine days before launch, and said it was the crew {lost} would pick. {We} picked {lost} too.' },
  { trait: 'boat', w: 4, t: 'The cairn of {lost} is tied down with a line, in the knot from the boat.' },
  { trait: 'teacher', w: 4, t: 'The lesson {lost} wrote for the class at home is in the back of this log.' },
  { trait: 'twin', w: 4, t: 'The letters of {lost} to the twin at home are in the case. The twin will get them.' },
  { trait: 'letters', w: 4, t: 'The tin of letters of {lost} goes home with {us}, unopened.' },
  { trait: 'sweets', w: 4, t: '{We} opened the bottle of {lost} at the cairn. It was for the day we go home. {We} drank to that day.' },
  { trait: 'heights', w: 4, t: '{lost} was afraid of the dark. {We} left a lamp burning on the cairn.' },
  { trait: 'wedding', w: 4, t: 'The ring of {lost} is in my pocket. It goes home to the one person at home.' },
  { trait: 'unwilling', w: 4, t: '{lost} never wanted this flight, and stayed with it to the end.' },
  { trait: 'stars', w: 4, t: '{We} gave the new constellation over the cairn the name of {lost}.' },
  { trait: 'hands', w: 4, t: '{We} set the small figure of foam that {lost} carved on the top stone.' },
  { t: '{We} said the names of the people at home who loved {lost}, every name {we} knew.' },
  { t: 'The {kinds} came to the cairn at dusk and stayed until dark.' },
  { t: 'The log keeps the name of {lost} here, and the day.' },
]);
// A crew of one or two loses nobody on the walk. The herd waits for it.
const HARD = pool([
  { t: 'On day {days} a storm stopped {us} for three days. The {kinds} stayed round the tent until the storm was over.' },
  { t: 'On day {days} {we} lost the {kinds} in the dark. At dawn two old {kinds} were waiting where {we} had camped. The two led {us} back.' },
  { t: 'On day {days} {we} could not go on, and sat down. The {kinds} came back, all of them, and waited two days until {we} could.' },
  { tags: 'hasone', t: 'On day {days} {one} fell on the rocks and could not walk for four days. The {kinds} waited. On the fifth day the herd went on, and so did {we}.' },
  { tags: '!hasone', t: 'On day {days} I fell and hurt a knee, and could not walk. The {kinds} waited three days, until I could.' },
  { tags: 'waterliquid', t: 'On day {days} {our} water ran low, and {we} could not go on. The {kinds} came back for {us} at dusk and led {us} to a spring.' },
]);
const END_TREK = pool([
  { tags: 'leftnote', t: 'Day {days}. The {kinds} came round in a long circle, and from the last ridge {we} saw the stones. The note was still in the case. The beacon is on at the stones again, and {we} keep going.' },
  { tags: 'leftnote trekloss', w: 2, t: 'Day {days}. Back at the stones, {crewleft} of us, with the {kinds}. We added the name of {lost} to the note in the case. The beacon clicks on the stones, and we keep going.' },
  { tags: 'leftnote !hasone', t: 'The {kinds} brought me back to the stones on day {days}. The note was still in the case, and I added a line to it. I switched the beacon on again, and I keep going.' },
  { t: 'The {kinds} brought {us} back to the stones on day {days}, the long way round, {walk} kilometres. {We} put the tent up where it stood before, and switched the beacon on. {We} keep going.' },
  { t: 'Day {days}, and the stones are in sight again, lit. The {kinds} made a circle {walk} kilometres long and came home to the stones. So did {we}. The beacon clicks again at the stones, and {we} keep going.' },
  { t: 'Day {days}. At the far end the {kinds} turned for home, and today {we} saw the stones from the last ridge. The beacon is back on the stones, and {we} keep going.' },
  { tags: 'trekloss', w: 2, t: 'We are {crewleft} now. The {kinds} brought us back to the stones, and {lost} is on the ridge, facing the stones. The beacon is on. We keep going, for {lost} too.' },
  { tags: 'trekloss', w: 2, t: 'Day {days}. We came back to the stones with the {kinds}, {crewleft} of us. {lost} stays on the ridge where the herd turned. The beacon is on again, and we keep going.' },
]);


// ---------------------------------------------------------------- the split
// The quarrel: what draws some of the crew to the herd, and what is said.
const RIFT = pool([
  { t: 'The {kinds} are restless, and the herd will leave the stones soon. {gone} will go with it. I will stay by the beacon, where a ship could find us.' },
  { t: 'We argued at supper for the fourth night. For {gone}, the {kinds} are the only way to live here. For me, the beacon is the only way home.' },
  { t: 'Every day {gone} went out with the {kinds} a little further, and came back a little later. Tonight {gonethe} came back after dark and said nothing.' },
  { t: 'The {kinds} will leave the stones before the season turns. {gone} said at supper: we should go with the {kinds}. Nobody spoke for a long time.' },
]);
const RIFT_TALK = pool([
  { t: 'I said the ship will come to the beacon, and the beacon is here. {Gonethe} said a ship needs {years} years, and the herd is now.' },
  { t: 'Nobody shouted. That was the worst of it.' },
  { t: 'I asked {gone} to stay one more season. {Gonethe} asked me to come.' },
  { t: 'The {kinds} watched from the edge of the flat while we talked.' },
]);
const PART = pool([
  { tags: 'gonesolo', t: 'On day {days} the {kinds} left the stones, and {gone} went with them. {gone} took a pack, the spare lamp, and half the seed store.' },
  { tags: '!gonesolo', t: 'On day {days} the {kinds} left the stones, and {gone} went with them. {Gonethe} took packs, the spare lamp, and half the seed store.' },
  { t: '{gone} went with the {kinds} at dawn on day {days}. We held each other at the door of the tent. Nobody said stay again.' },
  { t: 'At first light on day {days} the {kinds} moved off, and {gone} went too. I stood at the tent until the herd was over the rise.' },
  { t: 'The {kinds} went at dusk on day {days}, and {gone} went with them. The young {kinds} looked back. {gone} did not.' },
]);
// What the person who went left behind, by the trait of that person. Only one person.
const PARTING = pool([
  { trait: 'firstflight', w: 4, t: '{gone} left the small book of questions on my pack. The last page asks when we meet again.' },
  { trait: 'veteran', w: 4, t: '{gone} left the old flight badge on the tent pole.' },
  { trait: 'parent', w: 4, t: '{gone} left the bedtime stories with me, for the two daughters at home.' },
  { trait: 'farm', w: 4, t: '{gone} left me a handful of seed from the store, and said to plant it.' },
  { trait: 'money', w: 4, t: '{gone} left a letter for the sick brother at home, for the ship to carry.' },
  { trait: 'reader', w: 4, t: '{gone} left me the one book.' },
  { trait: 'talker', w: 4, t: '{gone} talked all the way to the edge of the flat, and then stopped, and waved.' },
  { trait: 'tidy', w: 4, t: '{gone} folded the blanket square and left it on the bunk.' },
  { trait: 'faith', w: 4, t: '{gone} left the medal from the grandmother hanging on the stones.' },
  { trait: 'joker', w: 4, t: '{gone} left one last joke note in my pack. I have not read it yet.' },
  { trait: 'sleepless', w: 4, t: '{gone} took the last night watch, and was gone before I woke.' },
  { trait: 'artist', w: 4, t: '{gone} left a drawing of all of us on the tent wall, with the {kinds} behind us.' },
  { trait: 'runner', w: 4, t: '{gone} ran the first kilometre beside the herd, and did not look back.' },
  { trait: 'standin', w: 4, t: '{gone} said the {kinds} are part of the crew {gone} would pick.' },
  { trait: 'boat', w: 4, t: '{gone} tied the tent down one last time, every line twice, before going.' },
  { trait: 'teacher', w: 4, t: '{gone} left a lesson in the back of the log, for whoever reads it.' },
  { trait: 'twin', w: 4, t: '{gone} left a letter for the twin at home, for the ship to carry.' },
  { trait: 'letters', w: 4, t: '{gone} left the tin of letters with me, for the ship to carry home.' },
  { trait: 'sweets', w: 4, t: '{gone} left the bottle with me. It is still for the day we go home.' },
  { trait: 'heights', w: 4, t: '{gone} was afraid of the dark, and went into the dark with the {kinds}.' },
  { trait: 'wedding', w: 4, t: '{gone} gave me the ring, for the one person at home.' },
  { trait: 'unwilling', w: 4, t: '{gone} never wanted this flight. {gone} wanted this.' },
  { trait: 'stars', w: 4, t: '{gone} named a star for each of us before going.' },
  { trait: 'hands', w: 4, t: '{gone} left a small {kind} carved from foam on my pack.' },
  { t: '{gone} took nothing from the tent but a pack and a lamp.' },
  { t: '{gone} left a note in the log case: do not wait.' },
  { t: 'At the edge of the flat {gone} turned and lifted a hand. Then the {kinds} were over the rise.' },
]);
const SIGN = pool([
  { t: 'The sign was a lamp at dusk. For {signs} nights a lamp showed on the far hills. On the next night the hills stayed dark.' },
  { t: 'On day {days} a young {kind} came back to the stones alone. A strip of orange tape was tied round it, in the knot {goneone} always uses.' },
  { t: 'On day {days} {we} found a cairn on the ridge. Under the top stone was a drawing by {goneone}: {kinds}, and small figures with them.' },
  { t: 'Every night at dusk {we} flash the lamp at the hills, three times. Some nights three flashes come back.' },
]);
const END_SPLIT = pool([
  { t: 'Day {days}. {We} keep the beacon on at the stones, day and night. {gone} went on with the {kinds}. {We} keep going, for {gone} too.' },
  { t: 'The tent has room in it now. {We} keep the beacon on, and a lamp at the door for {gone}. {We} keep going.' },
  { t: '{We} will be here at the stones when the ship comes. {gone} will be wherever the {kinds} are. The beacon is on, and {we} keep going, however long it takes.' },
]);

// ---------------------------------------------------------------- the broken pact
// The help of the crew goes wrong, or the herd leaves, by the trouble of the herd. Every need
// holds three wordings or more for any crew.
const WRONG = pool([
  { tags: 'needseep', t: 'On day {days} the water in the well turned salt. The salt came up from under the stones, and the old damp patch is salt too. The {kinds} left at dusk and did not come back.' },
  { tags: 'needseep', t: 'The well ran dry on day {days}. {We} dug deeper and found only rock. The {kinds} waited at the dry pool for two days, and then the herd went.' },
  { tags: 'needseep', t: 'The pump drew the water down, and the old spring under the stones went dry. On day {days} the {kinds} left. {We} had taken their water.' },
  { tags: 'needden', t: 'The poles held the roof of the den for a month. On day {days} the roof came down in the night. The {kinds} got out, all of them, and will not go near the stones now.' },
  { tags: 'needden', t: 'The new den was too deep. On day {days} the air in the den went bad, and the {kinds} came out and left the stones.' },
  { tags: 'needden', t: '{We} dug the den too close to the stones. On day {days} the ground over the den cracked, and the {kinds} went, and did not come back.' },
  { tags: 'neednight', t: 'Every night the heater ran on {our} cells for the young {kinds}. On day {days} the last cell went flat. In the morning the herd was gone over the ice.' },
  { tags: 'neednight', t: 'The wall of ice held for twenty nights. On day {days} the wall came down in the wind, on the tent. The {kinds} left at first light.' },
  { tags: 'neednight', t: 'On day {days} the {kinds} went out onto the ice in the dark and did not come back. {We} do not know why. The heater is on the last cells.' },
  { tags: 'needcrust', t: 'On day {days} a young {kind} went through the ice where {we} had broken it. The herd got the young one out, and then the herd left the flat, and {us}.' },
  { tags: 'needcrust', t: 'The {kinds} stopped coming to the holes on day {days}. {We} found the herd a day away, at new {plants}, and the herd would not come back.' },
  { tags: 'needcrust', t: 'The ice {we} broke froze again thicker every night. On day {days} the {kinds} went to find {plants} under thinner ice, and left {us}.' },
  { tags: 'needsea', t: 'The crossing broke up on day {days}, halfway over. The young {kinds} reached the high ground. The seed store and the spare cells did not.' },
  { tags: 'needsea', t: 'The causeway went under the sea on day {days}. The {kinds} crossed on the last of it. {We} did not, and the herd did not come back.' },
  { tags: 'needsea', t: 'On day {days} a storm pushed the sea over the flat. The {kinds} went up the shore to the high ground. {We} lost the tent and the seed store to the water.' },
  { tags: 'needsea tides', t: 'On day {days} the {kinds} crossed to the high ground without {us}, at a low tide {we} missed. The sea came up behind the herd. Now the sea is between {us} and the {kinds}.' },
  { tags: 'needground', t: 'On day {days} the sensor jumped, and {we} keyed the beacon. The {kinds} moved off the flat onto the slope, and the slope broke. The herd got clear, and never came back to the beacon.' },
  { tags: 'needground', t: 'The sensor was wrong on day {days}. {We} woke the {kinds} for nothing, three times in one night. After that the herd kept away from the beacon, and from {us}.' },
  { tags: 'needground', t: 'On day {days} the ground broke under the tent, and not under the {kinds}. {We} lost the cooler and half the cells. The herd did not come near {us} after that.' },
  { tags: 'needflow', t: 'The cool path broke under a young {kind} on day {days}. The herd got the young one out, and then the herd went away from the path, and from {us}.' },
  { tags: 'needflow', t: 'On day {days} a second flow came down over the path {we} had marked. The {kinds} went round it, a long way round, and did not come back.' },
  { tags: 'needflow', t: 'The stones {we} laid on the flow held the heat. On day {days} a young {kind} came back hurt from the path. The herd has kept away from {us} since.' },
  { tags: 'needsick', t: 'The young {kinds} got well, and on day {days} the herd left for new ground. The cough stayed with {us}.' },
  { tags: 'needsick', t: 'On day {days} the kit ran out, and the spring above the pool went bad too. The {kinds} left in the night.' },
  { tags: 'needsick', t: 'The young {kinds} got well. On day {days} {we} woke with the same grey crust on {our} arms, and the med kit is empty. The herd keeps away from the tent.' },
  { tags: 'needflood', t: 'The flood took the causeway on day {days}, and the tent too. The {kinds} went up into the hills, and {we} could not follow.' },
  { tags: 'needflood', t: 'The river came up again on day {days}. The {kinds} crossed to the hills in the night and left {us} on the wrong bank.' },
  { tags: 'needflood', t: 'On day {days} the line broke in the middle of the river. {We} got out a kilometre down the bank. The seed store did not, and the herd was gone.' },
  { tags: 'needcold', t: 'On day {days} the wall of stones fell in the wind. The young {kinds} scattered into the dark, and the herd went after the young, and did not come back.' },
  { tags: 'needcold', t: 'The heater ran for the young {kinds} every night, and on day {days} the cells were gone. The herd left the stones the next day.' },
  { tags: 'needcold', t: 'On day {days} {we} woke to an empty flat. The {kinds} had gone in the night. {We} do not know why.' },
  { tags: 'needdark', t: 'On day {days} the stones answered the tape with a white light that did not stop. The {kinds} ran from the light and did not come back.' },
  { tags: 'needdark', t: 'The young {kinds} fed in the light for thirty nights. On day {days} the beacon failed, the stones went dark, and the herd left.' },
  { tags: 'needdark', t: 'The light at the stones brought {kinds} from far away, too many for the ground. On day {days} the {plants} were gone, and every {kind} went on.' },
  { tags: 'needheat', t: 'A storm tore the shade down on day {days}. The {kinds} went to find shade somewhere else, and did not come back.' },
  { tags: 'needheat', t: 'The trench filled with sand in one night. On day {days} the {kinds} left the stones for the hills.' },
  { tags: 'needheat', t: 'On day {days} the {kinds} moved on to cooler ground. {We} could not follow at noon, and at dusk the herd was gone.' },
]);
// The crew alone, after the herd has gone.
const ALONE = pool([
  { tags: 'coldsuit', t: 'Without the {kinds} round the tent, the heater is all {we} have, and the cells are going. {We} sleep in the suits.' },
  { tags: 'coldsuit', t: 'The tent is cold with no {kinds} round it. {We} run the heater ten minutes in the hour.' },
  { tags: 'coldsuit', t: '{We} sit in the tent with the lamp. It is {temp} outside, and there are no {kinds} to lie round {us}.' },
  { tags: 'hotsuit', t: 'Without the {kinds}, the suits run hot by mid-morning. {We} lie in the tent at noon and count the water.' },
  { tags: 'hotsuit', t: 'The {kinds} knew where the water was, and the {kinds} are gone. {We} have water for nine days.' },
  { tags: 'hotsuit', t: 'The heat comes into the tent at noon now, and {we} have no shade but the stones. The {kinds} do not come back.' },
  { tags: 'lava', t: 'Without the {kinds}, {we} do not know the cool places under the flat. The cells run down in the heat of every day.' },
  { tags: 'lava', t: 'The {kinds} keep away from {us} now, and the cool rock is wherever the {kinds} are.' },
  { tags: 'lava', t: 'The cooler of the tent runs on the last cells. {We} count the cells every night. The {kinds} do not come.' },
  { tags: 'openair', t: 'The {kinds} were {our} way to the food. Without the herd {we} cannot find the roots, and the seed store is gone.' },
  { tags: 'openair', t: '{We} eat the seed store a handful a day. The {kinds} are on the far hills, and the pods are with them.' },
  { tags: 'openair', t: 'The {plants} here do not feed a person. The {kinds} knew which parts did, and the {kinds} are gone.' },
]);
const END_SOUR = pool([
  { tags: 'sourone', t: 'Day {days}. The cells have a few hours left. I have put this log in the case on the stones, with the tape. I am not afraid. At dusk I will sit by the stones and watch for the {kinds}.' },
  { tags: 'sourone', t: 'This is the last page. I have cut my name in the stones, under the carvings. If anyone comes, this log is in the case. The {kinds} came to the edge of the flat tonight, and I am going out to them.' },
  { tags: 'sourone', t: 'Day {days}. The {kinds} came to the edge of the flat at dusk and looked at me for a long time. Then the herd went on. The log is in the case on the stones. I am not afraid.' },
  { tags: 'sourpairkeeper', t: 'Day {days}. I am alone at the stones. The cells are low, and the lamp is off. I have put this log in the case, with the drawings. I am not afraid.' },
  { tags: 'sourpairkeeper', t: 'I put a new stone on the cairn of {lost} every morning. This morning I put the last one. The log goes in the case on the stones, for whoever comes.' },
  { tags: 'sourpairkeeper', t: 'Day {days}. The {kinds} came back to the stones tonight, a few of them, and lay down by the cairn of {lost}. I am going out to sit with the {kinds}. The log is in the case.' },
  { tags: 'sourpairother', t: 'This is {last}. {keeper} kept this log until day {prevday}. {keeper} died that night, and I built a cairn by the stones. The cells have a day in them. The log goes in the case on the stones.' },
  { tags: 'sourpairother', t: 'This is {last}, the {lastjob}. {keeper} died in the night on day {prevday}, asleep. I have buried {keeper} by the stones, and I am writing the last page. I am not afraid.' },
  { tags: 'sourpairother', t: 'This is {last}. {keeper} is under the cairn by the stones. The {kinds} came to the cairn at dusk, all of them, and lay down round it. I am going out to the {kinds} now.' },
  { tags: 'sourlast', t: 'This is {last}. {keeper} kept this log until day {prevday}. {deadlist} are under the cairns by the stones. I am the last of us. I keep the beacon on at the stones, and I keep going.' },
  { tags: 'sourlast', t: 'This is {last}, the {lastjob}. {keeper} died on day {keeperday}. On the night I buried {keeper}, the {kinds} came back to the stones. I keep the beacon on, and I keep going.' },
  { tags: 'sourlast', t: 'This is {last}. {deadlist} are under the cairns by the stones. The {kinds} came back at the end of the season, and let me sleep among them again. The beacon is on, and I keep going.' },
]);

// ---------------------------------------------------------------- the echo
const PULL = pool([
  { t: 'The {kinds} keep their young away from the stones after dark. The old ones make a ring between the young and the light.' },
  { t: 'At dusk every {kind} turns away from the stones and faces out into the dark. The {kinds} stay that way until dawn.' },
  { t: 'On day {days} a young {kind} got past the old ones at dusk and went into the light. The light went white. The young {kind} was not there when the light came back.' },
  { t: 'The {kinds} will not sleep within a hundred paces of the stones. {We} put the tent up at the foot of the stones all the same.' },
]);
const CALL = pool([
  { t: 'The click here is louder than it was at {site}. It comes through the tent wall, and through sleep.' },
  { t: 'Nobody sleeps more than an hour now. The sixteen sounds of the call run through the tent all night, and {we} say them back.' },
  { t: 'The call never stops here. {We} have stopped the beacon, and the stones go on sending {our} own clicks back to {us}, slower every night.' },
  { tags: 'hasone', t: 'The stones call all night now, the sixteen sounds, over and over. {one} says the sounds in sleep, and has stopped eating.' },
  { tags: 'hasone', t: '{one} keys the beacon every night now, back to the stones. I asked why. {one} said the stones asked first.' },
  { tags: '!hasone', t: 'I key the beacon every night now, back to the stones. I do not know why. The stones answer every time.' },
]);
const VOICE = pool([
  { t: 'Tonight the stones played back the beacon of day {replyday} from {site}, click for click. Then the stones played every word {we} said at {site} that night.' },
  { t: 'Tonight the stones called a name that is not {name}. {We} wrote it down in the sounds of the call: {newname}.' },
  { t: 'At midnight the stones played the name, {name}, in {our} own voice, the way {we} sent it. {We} listened until dawn.' },
  { tags: 'hasone', t: 'At midnight the stones played the voice of {one}, sending the name on the night {we} came through. {one} listened and smiled.' },
]);
const HOLD = pool([
  { t: 'The {kinds} sleep across the door of the tent now, every night. When {we} get up in the night, a {kind} gets up too and waits in the way.' },
  { t: 'The young {kinds} lie against {us} at night, heavy and warm. The old ones watch the door.' },
  { t: 'At dusk the {kinds} make a ring round the tent, between {us} and the light of the stones. The ring is there until dawn.' },
  { tags: 'hasone', t: '{one} went to the stones at midnight. Three {kinds} came out of the dark and waited between {one} and the light until dawn.' },
  { tags: 'openair', t: 'The {kinds} bring pods to the door of the tent each dusk. {We} do not eat much now.' },
]);
const FIRST = pool([
  { t: '{first} went into the light of the stones at dusk on day {days}. The light went white, and then {first} was not there. The {kinds} faced away.' },
  { t: 'On day {days} {first} did not come back from the stones. The tracks of {first} go to the light and stop.' },
  { t: '{first} sat at the foot of the stones all day on day {days}, saying the sounds. At dusk {first} stood up and walked into the light.' },
]);
// The last entry of the echo: a few plain sentences, and then the sounds of the call.
const MAD_REST = pool([
  { t: 'Day {days}. {rest} went into the light at dusk.' },
  { t: 'At dusk {rest} went to the stones, saying the sounds. The light went white, and I was alone.' },
  { t: '{rest} went in this morning, singing the sounds of the call. I heard the singing stop.' },
]);
const MAD_HEAD = pool([
  { t: 'I have not slept. The stones say the name slower now.' },
  { t: 'The {kinds} wait at the edge of the light and do not come in.' },
  { t: 'The light is warm. The light does not hurt.' },
  { t: 'I have written the name on the wall of the tent forty times.' },
  { t: 'The lamp is off. The stones are enough.' },
]);

// ---------------------------------------------------------------- the change
// The chorus: the herd takes the crew in, and the log slides from "I" to "we".
const DREAM = pool([
  { tags: 'hastwo', t: 'Last night all of us had the same dream of the {kinds}. We were in the middle of the herd, in the dark, and warm. {one} woke first and told the dream before anybody else could.' },
  { tags: 'hasone', t: '{one} and I woke at the same minute last night, from the same dream of the {kinds}. In the dream we were in the middle of the herd, warm.' },
  { tags: '!hasone', t: 'Last night I dreamed of the {kinds}. I was in the middle of the herd, in the dark, and warm. When I woke, the {kinds} lay round the tent in the same ring.' },
  { t: '{We} dream of the {kinds} every night now, and wake at the same minute the {kinds} wake.' },
  { t: 'In the dream the {kinds} were all round {us}, and nobody was cold. When {we} woke, the {kinds} were all round the tent.' },
  { t: 'Every night the same dream: the herd of {kinds}, the dark, and a warmth with no edge to it. Every morning the {kinds} are closer to the tent.' },
]);
const KNOW = pool([
  { t: '{We} wake when the {kinds} wake now, and sleep when the {kinds} sleep.' },
  { tags: 'hasone', t: '{one} knows where the {kinds} are without looking. Today {one} pointed at a hill, and an hour later the herd came over it.' },
  { tags: '!hasone', t: 'I know where the {kinds} are without looking. Today I turned to a hill, and an hour later the herd came over it.' },
  { tags: 'openair', t: '{We} eat what the {kinds} eat now. The kit says a person cannot live on that. Nobody is sick.' },
  { tags: '!openair hasone', t: '{one} went out to the {kinds} at dawn without the helmet. {one} came back at dusk, well, and did not put the helmet on again.' },
  { tags: '!openair !hasone', t: 'I went out to the {kinds} at dawn without the helmet. The air did not hurt. I have not put the helmet on since.' },
]);
const WE = pool([
  { t: 'We fed on the slope all morning. The young {kinds} stayed in the middle of us. At noon we lay down together, and nobody went back to the tent.' },
  { t: 'We heard a young {kind} fall on the far slope before we saw it, all of us at once. We went to it together.' },
  { t: 'It is hard to write I now. We write we. We are {count} {kinds} and more, and we are warm.' },
  { t: 'At dawn we went to the water, the old {kinds} first and the young in the middle. The rest of us came after. Nobody counted who was a {kind} and who was not.' },
]);
const END_CHORUS = pool([
  { t: 'This log was the log of {keeper}. We finish it. We are well, and we are many now. The tent is empty. If a ship comes, we will hear it, and we will not go.' },
  { tags: 'hasone', t: 'We are the {kinds} now, and the {kinds} are us. {crewlist} are here, in the warm middle of the herd. Whoever comes: we are well. Do not look for us in the tent.' },
  { tags: '!hasone', t: 'We are the {kinds} now, and the {kinds} are us. {keeper} is here, in the warm middle of the herd. Whoever comes: we are well. Do not look for us in the tent.' },
  { t: 'Day {days}, the way {keeper} counted. We do not count days now. We count the young {kinds}, and there are {young}. We are well. Tell them at home that we stayed.' },
]);
// The sleep: the herd sleeps through the killing season in its den, and the crew sleeps with it.
const SEASON = pool([
  { tags: 'ice', t: 'The dark is coming, the long dark of the year. The {kinds} have eaten for weeks and are fat, and they dig at the ice under the stones.' },
  { tags: 'ice', t: 'Every night is longer than the last. The {kinds} have stopped feeding. The old ones go down into the den at dusk and come up later each day.' },
  { tags: 'desert', t: 'The dry season has come. The {plants} are brown, and the {kinds} are going down into the den to sleep until the season turns.' },
  { tags: 'desert', t: 'The {kinds} have stopped going out to feed. Each day more of the herd stays down in the den.' },
  { t: 'The {kinds} are getting ready to sleep through the season. The den under the stones fills up a few more each day.' },
]);
const DEN = pool([
  { t: 'On day {days} the last of the {kinds} went into the den and lay down, one against another, and slept. The young sleep in the middle. {Our} cells will not last the season in the tent.' },
  { t: '{We} went down into the den with a lamp. The {kinds} lie in rows, warm, and their hearts beat four times a minute. There is a space in the middle, the size of a person.' },
  { tags: 'hasone', t: 'The {kinds} sleep in the den now, all of them. Each one breathes once a minute. {one} counted it with a watch.' },
  { tags: '!hasone', t: 'The {kinds} sleep in the den now, all of them. Each one breathes once a minute. I counted it with a watch.' },
]);
const SLOW = pool([
  { t: '{We} sleep more each day, and eat less, and the cells last. The {kinds} do not wake.' },
  { tags: 'hasone', t: '{first} lay down in the den with the {kinds} three days ago and has not woken. {first} breathes four times a minute, and is warm, and smiling.' },
  { tags: 'hasone', t: '{first} went down to the den on day {days} to sit with the young {kinds}, and fell asleep there. {first} has not woken, and the heart of {first} beats four times a minute.' },
  { tags: '!hasone', t: 'Each time I go down into the den, I sleep longer. Yesterday I slept a whole day among the {kinds}, and woke warm.' },
  { tags: '!hasone', t: 'I slept in the den last night, between two old {kinds}. I woke at noon, two days later, and I was not hungry.' },
]);
const END_SLEEP = pool([
  { t: 'The {kinds} made room in the middle of the den. {We} lay the log in the case and go down. Wake {us} when the {kinds} wake.' },
  { tags: 'hasone', t: 'Day {days}. We are going down into the den to sleep with the {kinds} until the season turns. {first} is asleep there already. The log stays in the case. We will wake when the {kinds} wake.' },
  { tags: 'hasone', t: 'The last cell is in the lamp by this log. We are going down to the {kinds} now. If you read this before the season turns, let us sleep.' },
  { tags: '!hasone', t: 'Day {days}. I am going down into the den with the {kinds}, into the space the {kinds} left for me. The lamp is off to save the cells. I will wake when the {kinds} wake.' },
  { tags: '!hasone', t: 'The last cell is in the lamp by this log. I am going down to the {kinds} now. If you read this before the season turns, let me sleep.' },
]);
// The light: the old of the herd go into the light of the stones, and the crew follows.
const OLD = pool([
  { t: 'At dusk the oldest {kinds} go into the light of the stones, one at a time. The light goes white round each one, and then the {kind} is not there. The herd watches and does not follow.' },
  { t: 'On day {days} {we} saw an old {kind} go into the light at dusk. It went without a sound, and the light was brighter after.' },
  { t: 'The {kinds} bring the old ones to the stones at dusk. The old ones go into the light, and the rest of the herd lies down and waits for dark.' },
]);
const FAIL = pool([
  { tags: '!openair', t: 'The cooler of the tent failed on day {days}. {We} live in the suits now, and the suits need the cells.' },
  { tags: '!openair', t: 'The last spare cell went into the suits on day {days}. When the suits stop, there is nothing else.' },
  { tags: 'hasone !openair', t: 'The cells are going. {one} worked it out on the tent wall: forty days, and then the suits stop.' },
  { tags: '!hasone !openair', t: 'I have worked out the cells on the tent wall: thirty days. After that the suit stops.' },
  { tags: 'openair', t: 'The seed store is gone, and the {plants} here do not feed a person. {We} have eaten nothing for three days.' },
  { tags: 'openair', t: 'A fever came in the night, and the med kit is empty. {We} have water, and nothing else.' },
  { tags: 'openair', t: 'The pods the {kinds} eat make {us} sick now. {We} grow thinner, and the seed store is gone.' },
]);
const HAND = pool([
  { t: '{We} sat at the edge of the light all night. The {kinds} lay beside {us}. Nobody was afraid.' },
  { tags: 'hasone', t: '{one} put a hand into the light at dusk. The light did not burn. {one} said it was warm, and that it did not hurt at all.' },
  { tags: 'hasone', t: '{one} walked round the light at dusk, close enough to touch it, and came back smiling. The light is warm, {one} says, and does not burn.' },
  { tags: '!hasone', t: 'I put a hand into the light at dusk. It did not burn. It was warm, and the hand shone for an hour after.' },
  { tags: '!hasone', t: 'I walked round the light at dusk, close enough to touch it. It is warm, and it does not burn.' },
]);
const END_LIGHT = pool([
  { t: 'Day {days}. The {kinds} are at the stones, the old ones in front. {We} go in after them tonight. Look for {us} in the light at dusk.' },
  { tags: 'hasone', t: 'Day {days}. We go into the light together at dusk, after the old {kinds}. We are not afraid. This log goes in the case on the stones. If you read it, look at the light at dusk.' },
  { tags: 'hasone !openair', t: 'The cells have one day left. At dusk we walk into the light of the stones, all of us, with the {kinds} that go tonight. The light is warm. Goodbye.' },
  { tags: 'hasone', t: 'Tonight the old {kinds} go into the light, and we go with them, all of us, hand in hand. The light is warm. Goodbye.' },
  { tags: 'hasone', t: 'We have said the names of everybody at home, one by one. At dusk we follow the {kinds} into the light. We are not afraid.' },
  { tags: '!hasone !openair', t: 'Day {days}. The cells have a day left. At dusk I will go into the light, after the old {kinds}. It does not burn. Whoever reads this: I was not afraid.' },
  { tags: '!hasone', t: 'Day {days}. At dusk I will go into the light, after the old {kinds}. The light does not burn. Whoever reads this: I was not afraid.' },
  { tags: '!hasone', t: 'The log goes in the case on the stones. At dusk I walk into the light with the {kinds} that go tonight. The light is warm. Goodbye.' },
]);

// ---------------------------------------------------------------- the voice at the tent
// The rescue line is the line of the user, and its first two sentences never change.
const RESCUE = (years) => `Thank god, it's been ${years} years, but they sent a rescue ship! I'm glad we kept going.`;
const SPLIT_TAIL = ['{gone} went on with the herd.', 'Tell them {gone} went with the herd.', 'Leave a lamp at the stones for {gone}.'];
const SOUR_TAIL = ['I wish {keeper} had seen it.', 'I only wish {keeper} were here.', 'The others are by the stones. Say their names at home.'];
const CHORUS_LINES = [
  'We are well. We are many now. Go home, and tell them we stayed.',
  'Do not be sad for us. We are warm, and we are many. Go home and tell them we stayed.',
  'We heard your ship before it landed. We are well here. Go home without us.',
];

// ---------------------------------------------------------------- the shape of the log
const ENTRY_MIN = 7, ENTRY_MAX = 10;
const SENTENCE_MAX = 9;            // sentences in one printed entry
// The span of the log in turns of the planet, from the day through to the last entry, per fate.
const SPAN = {
  pact: [80, 260], trek: [150, 340], split: [70, 220], sour: [50, 180], mad: [30, 110], change: [80, 240],
};
// The beats of each fate, in order. A name with '?' is optional. The writer runs every beat that is
// not optional, and enough optional beats that the log holds 7 to 10 entries.
const ORDER = {
  pact: ['herd', 'stones?', 'camp?', 'need', 'help', 'calf?', 'people?', 'gift', 'sky?', 'save'],
  // The trek leaves the stones at 'go', so the beats that stand at the stones come before it.
  trek: ['herd', 'stones?', 'camp?', 'need', 'people?', 'sky?', 'go', 'walk', 'far', 'loss'],
  split: ['herd', 'stones?', 'camp?', 'need', 'help', 'gift?', 'people?', 'sky?', 'rift', 'part', 'sign?'],
  sour: ['herd', 'stones?', 'camp?', 'need', 'help', 'people?', 'gift', 'sky?', 'wrong', 'alone', 'loss'],
  mad: ['herd', 'camp?', 'pull', 'stones?', 'people?', 'call', 'sky?', 'voice', 'hold', 'first'],
  chorus: ['herd', 'stones?', 'camp?', 'need', 'help', 'gift?', 'people?', 'sky?', 'dream', 'know', 'we'],
  sleep: ['herd', 'stones?', 'camp?', 'need', 'help', 'gift?', 'people?', 'sky?', 'season', 'den', 'slow'],
  light: ['herd', 'stones?', 'camp?', 'need', 'help', 'gift?', 'people?', 'sky?', 'old', 'fail', 'hand'],
};
const BEAT_POOL = {
  stones: STONES, camp: CAMP, need: NEED, help: HELP, gift: GIFT, sky: SKY, save: SAVE, calf: CALF,
  go: GO, far: FAR, rift: RIFT, sign: SIGN, wrong: WRONG, alone: ALONE, pull: PULL, call: CALL,
  voice: VOICE, hold: HOLD, first: FIRST, dream: DREAM, know: KNOW, we: WE, season: SEASON, den: DEN,
  slow: SLOW, old: OLD, fail: FAIL, hand: HAND,
};

// ---------------------------------------------------------------- small helpers
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function words(n) {
  const v = Math.max(0, Math.min(99, Math.round(n)));
  if (v < 20) return ONES[v];
  return TENS[Math.floor(v / 10)] + (v % 10 ? '-' + ONES[v % 10] : '');
}
const grouped = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// "Mira", "Mira and Omar", "Mira, Omar, and Abebe".
function nameList(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
const pickOf = (rng, a) => a[Math.floor(rng() * a.length)];
function shuffled(rng, a) {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The syllables of a name of portalSeed(). Each syllable of SYLLABLES starts with a pair of letters
// no other syllable starts with, so a greedy read from the left is exact.
function syllablesOf(name) {
  const out = [];
  let s = String(name || '').toLowerCase();
  while (s.length) {
    const hit = SYLLABLES.find((x) => s.startsWith(x));
    if (!hit) break;
    out.push(hit);
    s = s.slice(hit.length);
  }
  return out;
}

// The hour at the twin when the crew arrives, as a word. `leave` is the hour at the ruin as a part
// of the turn: 0 is midnight, 0.5 is noon, 0.75 is dusk. The east vector of cell-grid.js points to
// a smaller longitude, and the sun rises in the east unless the world turns backward.
function phaseWord(world, twin, leave, retro) {
  const lon = (d) => Math.atan2(d[2], d[0]);
  const a = world.ruin && world.ruin.dir, b = twin.dir;
  if (!a || !b) return 'dusk';
  let dl = lon(b) - lon(a);
  while (dl > Math.PI) dl -= Math.PI * 2;
  while (dl < -Math.PI) dl += Math.PI * 2;
  const east = -dl;
  let p = leave + (retro ? -east : east) / (Math.PI * 2);
  p = ((p % 1) + 1) % 1;
  if (p < 0.06 || p >= 0.94) return 'the middle of the night';
  if (p < 0.2) return 'the dark before dawn';
  if (p < 0.3) return 'dawn';
  if (p < 0.44) return 'morning';
  if (p < 0.56) return 'noon';
  if (p < 0.7) return 'afternoon';
  if (p < 0.8) return 'dusk';
  return 'night';
}

// Which cut entry stopped the second log. The patterns read the wordings of END in ruin-lore.js.
function cutKind(text) {
  const t = String(text || '');
  if (/click has stopped/.test(t)) return 'cutclick';
  if (/light is moving/.test(t)) return 'cutmoving';
  if (/ground under the shelter just moved/.test(t)) return 'cutground';
  if (/has come on at the foot of/.test(t)) return 'cutfoot';
  if (/went out at midnight/.test(t)) return 'cutdark';
  return 'cutother';
}

// ---------------------------------------------------------------- the tags of one world
// The tags every entry of the third log reads, before the fate: the world at the twin, the second
// log, the herd, the condition of the crew, and the need. `need` is the id of NEEDS, or null for a
// caller that only wants the world (tools/lore-audit reads it for the lexicon).
function tagsOf(world, need) {
  const first = world.source.log, second = world.ruin.log, twin = world.twin;
  const G = (world.species || [])[twin.herd];
  const env = L.makeEnv(world.env || { type: world.type });
  const tags = SourceLore.sourceTags(env, (world.env || {}).obliquityDeg, true,
    SourceLore.sourceLatDeg(twin.dir), SourceLore.motionOf(G));
  RuinLore.storyTags(world, first, tags);
  const last = second.entries[second.entries.length - 1];
  const kind = last.slot === 'note' ? 'note' : last.slot.slice(4);
  tags.add('from' + kind);
  if (kind === 'cut') tags.add(cutKind(last.text));
  if (G && G.kin) tags.add('herdkin');
  else if (G && first.species && G.lore && G.lore.name === first.species) tags.add('herdknown');
  else tags.add('herdcarved');
  const body = makerBody(world);
  if (!(G && G.kin) && body && body.legless) tags.add('herdlegless');
  if (G) tags.add(SourceLore.bigBody(G) ? 'herdbig' : 'herdsmall');
  if (tags.has('temperate')) tags.add('openair');
  else if (!tags.has('lava')) tags.add(tags.has('hot') || tags.has('molten') ? 'hotsuit' : 'coldsuit');
  if (need) tags.add('need' + need);
  return { tags, env, G };
}

// ---------------------------------------------------------------- the public entry point
// writeWayLog() writes the third log of one world for one fate, or null when nobody reached the
// ruin. It reads world.source.log, world.ruin.log, world.twin, world.species, and world.env, and it
// writes nothing back. It draws only from `rng`. `trace`, when a tool passes an object, collects
// the count of wordings that fit each pick: { picks: [{ label, n }], tags }.
function writeWayLog({ world, rng, fate, trace = null }) {
  const second = world && world.ruin && world.ruin.log;
  const first = world && world.source && world.source.log;
  const twin = world && world.twin;
  if (!second || !first || !twin || !fate || !second.crew || !second.crew.length) return null;
  // A fate the crew does not allow, a split of one person, has no log.
  if (!fatesFor(second.crew.length).includes(fate)) return null;
  const G0 = (world.species || [])[twin.herd];
  if (!G0 || !G0.lore) return null;
  const form = fate === 'change' ? formOf(world) : null;

  // The need of the herd, from the world tags.
  const world0 = tagsOf(world, null);
  const needRow = L.line(rng, NEEDS, { env: world0.env, tags: world0.tags, world, G: G0 }, null);
  const need = needRow ? needRow.id : null;
  const { tags, env, G } = tagsOf(world, need);
  tags.add('fate' + fate);
  if (form) tags.add('form' + form);
  if (trace) trace.tags = [...tags];

  // ---- the people and their ends
  const crew = second.crew.map((c) => ({ name: c.name, role: c.role, end: 'home' }));
  const keeper = second.keeper;
  const jobOf = new Map(crew.map((c) => [c.name, c.role]));
  const traits = first.traits || {};
  const others = crew.slice(1).map((c) => c.name);
  const n = crew.length;
  const setEnd = (name, end) => { crew.find((c) => c.name === name).end = end; };
  let lost = null, firstGone = null, survivor = null, sourKind = null;
  let gone = [];
  // The beat after which each person leaves the story: { name: slot }.
  const outAfter = new Map();
  switch (fate) {
    case 'trek':
      if (n >= 3) { lost = pickOf(rng, others); setEnd(lost, 'lost'); outAfter.set(lost, 'loss'); tags.add('trekloss'); }
      break;
    case 'split': {
      const k = n <= 2 ? 1 : 1 + Math.floor(rng() * (n - 2));
      gone = shuffled(rng, others).slice(0, k);
      gone = others.filter((x) => gone.includes(x));
      for (const x of gone) { setEnd(x, 'gone'); outAfter.set(x, 'part'); }
      if (gone.length === 1) tags.add('gonesolo');
      break;
    }
    case 'sour':
      for (const c of crew) c.end = 'lost';
      if (n === 1) sourKind = 'sourone';
      else if (n === 2) {
        if (rng() < 0.5) { sourKind = 'sourpairkeeper'; lost = others[0]; outAfter.set(lost, 'loss'); }
        else { sourKind = 'sourpairother'; survivor = others[0]; }
      } else {
        sourKind = 'sourlast';
        survivor = pickOf(rng, others);
        setEnd(survivor, 'home');
        lost = pickOf(rng, others.filter((x) => x !== survivor));
        outAfter.set(lost, 'loss');
      }
      tags.add(sourKind);
      break;
    case 'mad':
      for (const c of crew) c.end = 'gone';
      if (n >= 2) { firstGone = pickOf(rng, others); outAfter.set(firstGone, 'first'); }
      break;
    case 'change':
      for (const c of crew) c.end = form === 'light' ? 'gone' : 'changed';
      if (form === 'sleep' && n >= 2) { firstGone = pickOf(rng, others); outAfter.set(firstGone, 'slow'); }
      break;
    default:
      break;
  }

  // ---- the beats
  const orderKey = fate === 'change' ? form : fate;
  const order = ORDER[orderKey].slice();
  // Beats a crew of this size does not run.
  const drop = new Set();
  if (fate === 'trek' && n < 3) { /* the loss beat becomes the hard beat */ }
  if (fate === 'sour' && !(lost)) drop.add('loss');
  if (fate === 'mad' && !firstGone) drop.add('first');
  const required = order.filter((k) => !k.endsWith('?') && !drop.has(k));
  const optional = order.filter((k) => k.endsWith('?')).map((k) => k.slice(0, -1));
  // Entries: through, the required beats, the optional ones, and the end.
  const base = 2 + required.length;
  const lo = Math.max(0, ENTRY_MIN - base), hi = Math.max(lo, ENTRY_MAX - base);
  // The log leans long: most logs take all the optional beats they can, and some take one fewer.
  const want = Math.max(lo, hi - Math.floor(rng() * 2));
  const peopleOk = others.some((x) => traits[x]);
  const openOpt = optional.filter((k) => {
    if (k === 'people') return peopleOk;
    if (k === 'calf') return true;
    return L.candidates(BEAT_POOL[k], { env, tags, world, G }).length > 0;
  });
  const chosenOpt = new Set(shuffled(rng, openOpt).slice(0, want));
  const beats = order.map((k) => k.replace('?', '')).filter((k) => !drop.has(k) && (required.includes(k) || chosenOpt.has(k)));
  // A log short of seven entries takes the optional beats it skipped, in order.
  for (const k of optional) {
    if (beats.length + 2 >= ENTRY_MIN) break;
    if (!beats.includes(k) && openOpt.includes(k)) {
      const at = order.findIndex((x) => x.replace('?', '') === k);
      const after = order.slice(0, at).map((x) => x.replace('?', '')).filter((x) => beats.includes(x)).pop();
      beats.splice(after ? beats.indexOf(after) + 1 : 0, 0, k);
    }
  }

  // ---- the tokens of the whole log
  const cells = 30 + Math.floor(rng() * 50);
  const food = 40 + Math.floor(rng() * 50);
  const pace = 8 + Math.floor(rng() * 11);
  // The span of the log in turns, from the day through to the last entry.
  const [s0, s1] = SPAN[fate];
  const span = s0 + Math.floor(rng() * (s1 - s0 + 1));
  const count = pickOf(rng, ['forty', 'fifty', 'sixty', 'seventy', 'eighty']);
  const young = words(7 + Math.floor(rng() * 14));
  const calf = pickOf(rng, SourceLore.PET_NAME);
  const signs = words(5 + Math.floor(rng() * 20));
  const sylls = syllablesOf(nameOf(world));
  let newname = '';
  for (let i = 0; i < 6; i++) {
    const k = 2 + Math.floor(rng() * 2);
    const w = [];
    for (let j = 0; j < k; j++) {
      let s = pickOf(rng, SYLLABLES);
      if (w.length && s === w[w.length - 1]) s = SYLLABLES[(SYLLABLES.indexOf(s) + 1) % SYLLABLES.length];
      w.push(s);
    }
    newname = cap(w.join(''));
    if (newname.toLowerCase() !== String(nameOf(world)).toLowerCase()) break;
  }
  const lastKind = [...tags].find((t) => t.startsWith('from'));
  const cutTag = [...tags].find((t) => t.startsWith('cut'));
  const leave = lastKind === 'fromcut' ? (cutTag === 'cutdark' ? 0.0 : 0.9) : 0.75;
  const sent = lastKind === 'fromcut' ? (cutTag === 'cutdark' ? 'at midnight' : 'that night') : 'at dusk';
  // The day through: the same day as a cut entry, the next days after a stop to go back, and a few
  // turns later after the rest.
  const lastDay = second.days;
  const gap = lastKind === 'fromcut' ? 0 : lastKind === 'fromback' ? 1 + Math.floor(rng() * 3)
    : lastKind === 'fromnote' ? 2 + Math.floor(rng() * 9) : 3 + Math.floor(rng() * 16);
  const through = lastDay + gap;
  const reply = second.entries.find((e) => e.slot === 'ruin.reply');
  const lostName = first.lost && first.lost.name;
  const stayers = first.crew.map((c) => c.name).filter((x) => !first.goers.includes(x) && x !== lostName
    && !(x === first.keeper && tags.has('deadkeeper')));
  const plant = env.plantWord || 'growth';
  const base0 = SourceLore.worldTokens(world, env, first.probe, (world.env || {}).obliquityDeg);
  const body = makerBody(world);
  const tokens = {
    ...base0, ...SourceLore.beastTokens(G, ''),
    Plants: cap(base0.plants),
    site: SITE[twin.proto] || 'the stones', Site: cap(SITE[twin.proto] || 'the stones'),
    name: nameOf(world), sign: callSign(world) || first.probe, far: grouped(twin.km), farfrom: twin.from,
    sent, phase: phaseWord(world, twin, leave, tags.has('retrograde')), wait: words(gap), newname,
    keeper, keeperjob: jobOf.get(keeper), shipkeeper: first.keeper, stayer: stayers[0] || first.keeper,
    years: String(first.years || 12), count, young, calf, cells: String(cells), food: String(food),
    pace: words(pace), signs, replyday: String(reply ? reply.day : second.arrived),
    makerbody: body ? body.words : 'legs', plant,
    lost: lost || '', lostjob: lost ? jobOf.get(lost) : '', gone: nameList(gone), goneone: gone[0] || '',
    gonethe: gone.length > 1 ? 'the ' + words(gone.length) : gone[0] || '', Gonethe: gone.length > 1 ? 'The ' + words(gone.length) : gone[0] || '',
    last: survivor || '', lastjob: survivor ? jobOf.get(survivor) : '', first: firstGone || '',
    deadlist: nameList(crew.filter((c) => c.end === 'lost').map((c) => c.name)),
    crewlist: nameList(crew.map((c) => c.name)),
    crewleft: words(crew.filter((c) => c.end === 'home').length),
    walk: grouped(Math.round(pace * span * 0.6 / 10) * 10),
  };

  // ---- the picks
  const used = new Set();
  const ctxOf = (t) => ({ env, tags: t, world, G });
  function pick(label, list, t, strict) {
    if (trace) trace.picks.push({ label, n: L.candidates(list, ctxOf(t)).length, tags: [...t].filter((x) => STORY_TAGS.includes(x) || /^m[a-z]+$/.test(x)) });
    return L.line(rng, list, ctxOf(t), used, strict);
  }
  // The people at the twin for a beat, and the tags and tokens they give.
  const out = new Set();
  function people(b, prefer) {
    const here = others.filter((x) => !out.has(x));
    const t = new Set(tags);
    if (here.length) t.add('hasone');
    if (here.length > 1) t.add('hastwo');
    let one = here.length ? here[b % here.length] : keeper;
    if (prefer && here.includes(prefer)) one = prefer;
    const rest = here.filter((x) => x !== one);
    const two = rest.length ? rest[b % rest.length] : one;
    const solo = here.length === 0;
    return {
      t, here,
      tk: {
        one, two, onejob: jobOf.get(one), twojob: jobOf.get(two),
        we: solo ? 'I' : 'we', We: solo ? 'I' : 'We', us: solo ? 'me' : 'us', our: solo ? 'my' : 'our', Our: solo ? 'My' : 'Our',
        rest: nameList(here.filter((x) => x !== firstGone)),
      },
    };
  }
  const parts = [];   // one per entry: { slot, title, pieces: [{ e, tk }] }

  // Entry 1: through.
  {
    const p = people(0);
    const pieces = [];
    if (lastKind === 'fromcut') {
      pieces.push(pick('cutopen', CUT_OPEN, p.t));
      pieces.push(pick('name', NAME, p.t));
      pieces.push(pick('cut', CUT, p.t));
    } else {
      pieces.push(pick('open', OPEN, p.t));
      pieces.push(pick('name', NAME, p.t));
    }
    pieces.push(pick('jump', JUMP, p.t));
    pieces.push(pick('fardark', FARDARK, p.t));
    parts.push({ slot: 'way.through', title: 'Through', pieces: pieces.map((e) => ({ e, tk: p.tk })) });
  }

  // The middle beats.
  let calfNamed = false;
  const spoken = [];
  beats.forEach((k, i) => {
    const b = i + 1;
    let prefer = null;
    if (k === 'wrong' && lost) prefer = lost;
    if (k === 'hard' || k === 'loss') prefer = lost;
    const p = people(b, prefer);
    const t = p.t;
    if (calfNamed) t.add('calfnamed');
    const pieces = [];
    let slot = 'way.' + k;
    if (k === 'herd') {
      pieces.push(pick('land', LAND, t));
      pieces.push(pick('sight', SIGHT, t));
      pieces.push(pick('status', STATUS, t));
      if (t.has('herdlegless')) pieces.push(pick('legless', LEGLESS, t));
      else pieces.push(pick('react', REACT, t));
    } else if (k === 'camp') {
      pieces.push(pick('camp', CAMP, t));
      pieces.push(pick('left', LEFT, t));
    } else if (k === 'people') {
      const who = p.here.find((x) => traits[x] && !spoken.includes(x)) || p.here.find((x) => traits[x]);
      if (!who) return;
      spoken.push(who);
      const list = PEOPLE.filter((e) => e.trait === traits[who]);
      pieces.push({ e: pick('people.' + traits[who], list, t), tk: { who, whojob: jobOf.get(who) } });
    } else if (k === 'calf') {
      pieces.push(pick('calf', CALF, t));
      calfNamed = true;
    } else if (k === 'walk') {
      pieces.push(pick('walk', WALK, t));
      pieces.push(pick('wayhelp', WAYHELP, t));
      pieces.push(pick('waygift', WAYGIFT, t));
    } else if (k === 'loss' && fate === 'trek') {
      if (lost) {
        pieces.push(pick('losscause', LOSS_CAUSE, t));
        pieces.push(pick('burial', BURIAL, t));
        const list = KEEPSAKE.filter((e) => !e.trait || e.trait === traits[lost]);
        pieces.push(pick('keepsake', list, t));
      } else {
        slot = 'way.hard';
        pieces.push(pick('hard', HARD, t));
      }
    } else if (k === 'loss') {
      pieces.push(pick('losssour', LOSS_SOUR, t));
      pieces.push(pick('burial', BURIAL, t));
      const list = KEEPSAKE.filter((e) => !e.trait || e.trait === traits[lost]);
      pieces.push(pick('keepsake', list, t));
    } else if (k === 'rift') {
      pieces.push(pick('rift', RIFT, t));
      pieces.push(pick('rifttalk', RIFT_TALK, t));
    } else if (k === 'need') {
      pieces.push(pick('need', NEED, t));
      pieces.push(pick('needcoda', NEED_CODA, t));
    } else if (k === 'gift') {
      pieces.push(pick('gift', GIFT, t));
      pieces.push(pick('giftcoda', GIFT_CODA, t));
    } else if (k === 'help') {
      pieces.push(pick('help', HELP, t));
      pieces.push(pick('helpcoda', HELP_CODA, t));
    } else if (k === 'save') {
      pieces.push(pick('save', SAVE, t));
      pieces.push(pick('savecoda', SAVE_CODA, t));
    } else if (k === 'part') {
      pieces.push(pick('part', PART, t));
      if (gone.length === 1) {
        const list = PARTING.filter((e) => !e.trait || e.trait === traits[gone[0]]);
        pieces.push(pick('parting', list, t));
      }
    } else if (k === 'go') {
      const e = pick('go', GO, t);
      if (e && e.note) tags.add('leftnote');
      pieces.push(e);
    } else {
      pieces.push(pick(k, BEAT_POOL[k], t));
    }
    let tk = { ...p.tk };
    if ((k === 'loss') && lost && p.here.filter((x) => x !== lost).length === 0) {
      tk = { ...tk, we: 'I', We: 'I', us: 'me', our: 'my', Our: 'My' };
    }
    parts.push({ slot, title: '', pieces: pieces.map((x) => (x && x.e ? { e: x.e, tk: { ...tk, ...x.tk } } : { e: x, tk })) });
    for (const [name, at] of outAfter) if (at === k) out.add(name);
  });

  // The last entry.
  {
    const p = people(beats.length + 1);
    const t = p.t;
    if (calfNamed) t.add('calfnamed');
    const pieces = [];
    const slot = 'end.' + fate;
    let tk = { ...p.tk };
    if (fate === 'pact') pieces.push(pick('end.pact', END_PACT, t));
    else if (fate === 'trek') pieces.push(pick('end.trek', END_TREK, t));
    else if (fate === 'split') pieces.push(pick('end.split', END_SPLIT, t));
    else if (fate === 'sour') {
      // The survivor of a larger crew, or the other person of a pair, writes the last entry.
      if (survivor) { t.delete('hasone'); t.delete('hastwo'); tk = { ...tk, we: 'I', We: 'I', us: 'me', our: 'my', Our: 'My' }; }
      pieces.push(pick('end.sour', END_SOUR, t));
    } else if (fate === 'mad') {
      // The people still at the tent went into the light before the last entry, and it says so.
      if (p.here.length) pieces.push(pick('madrest', MAD_REST, t));
      pieces.push(pick('madhead', MAD_HEAD, t));
      if (!p.here.length) pieces.push(pick('madhead', MAD_HEAD, t, true));
    } else if (form === 'chorus') pieces.push(pick('end.chorus', END_CHORUS, t));
    else if (form === 'sleep') {
      if (firstGone) t.add('hasone');
      pieces.push(pick('end.sleep', END_SLEEP, t));
    } else pieces.push(pick('end.light', END_LIGHT, t));
    parts.push({ slot, title: 'Last entry', pieces: pieces.filter(Boolean).map((e) => ({ e, tk })) });
  }

  // The sounds of the call, for the last entry of the echo. The name once, the name in its
  // syllables once, and runs of the sixteen sounds, and the last run has no stop.
  // The head sentences of the entry come first, and the sounds fill the room that is left.
  const sounds = { lead: [], runs: [], tail: '' };
  if (fate === 'mad') {
    const run = (k) => {
      const w = [];
      for (let j = 0; j < k; j++) w.push(pickOf(rng, SYLLABLES));
      return w.join(' ');
    };
    sounds.lead = [tokens.name + '.', cap(sylls.join(' ')) + '.'];
    const seen = new Set(sounds.lead);
    for (let i = 0; sounds.runs.length < 3 && i < 20; i++) {
      const r = cap(run(1 + Math.floor(rng() * 3))) + '.';
      if (!seen.has(r)) { seen.add(r); sounds.runs.push(r); }
    }
    sounds.tail = run(3 + Math.floor(rng() * 3));
  }

  // ---- the days
  const laid = SourceLore.layDays(rng, parts.length, span + 1);
  const days = laid.map((d) => through - 1 + d);

  // ---- the text
  const entries = parts.map((part, j) => {
    const day = days[j];
    const prevday = j > 0 ? days[j - 1] : day;
    // The day the keeper of a broken pact died: after the entry before the last, and before the last.
    const keeperday = day - prevday > 1 ? prevday + Math.max(1, Math.floor((day - prevday) / 2)) : prevday;
    const dayTk = { days: String(day), prevday: String(prevday), keeperday: String(keeperday) };
    let texts = part.pieces.filter((x) => x.e).map((x) => cap(L.fill(x.e.t, { ...tokens, ...x.tk, ...dayTk })));
    // An entry holds nine sentences at most: the parts at the end give way first.
    const sentencesIn = (a) => a.join(' ').split(/(?<=[.!?])\s+/).length;
    if (part.slot === 'end.mad') {
      const room = Math.max(2, SENTENCE_MAX - sentencesIn(texts));
      texts = texts.concat(sounds.lead.slice(0, room - 1), sounds.runs.slice(0, Math.max(0, room - 3)), [sounds.tail]);
    }
    while (texts.length > 1 && sentencesIn(texts) > SENTENCE_MAX && part.slot !== 'end.mad') texts.pop();
    return { slot: part.slot, title: part.title, day, text: texts.join(' ') };
  });

  // ---- the voice
  const home = crew.filter((c) => c.end === 'home');
  const years = first.years || 12;
  let voice = null;
  if (home.length) {
    const speaker = home.find((c) => c.name === keeper) || home[0];
    let line = RESCUE(years);
    if (fate === 'split') line += ' ' + L.fill(pickOf(rng, SPLIT_TAIL), tokens);
    if (fate === 'sour') line += ' ' + L.fill(pickOf(rng, SOUR_TAIL), tokens);
    voice = { speaker: speaker.name, line, home: true };
  } else if (form === 'chorus') {
    voice = { speaker: keeper, line: pickOf(rng, CHORUS_LINES), home: false };
  }

  return {
    probe: first.probe, fate, form, through, days: entries[entries.length - 1].day, keeper, crew,
    went: second.went, years, entries, voice,
  };
}

export const WayLore = {
  writeWayLog, tagsOf, syllablesOf, cutKind,
  TOKENS, BEAST_TOKENS, STORY_TAGS, NEED_IDS, FATE_IDS,
  POOLS: {
    OPEN, CUT_OPEN, CUT, NAME, JUMP, FARDARK, LAND, SIGHT, STATUS, LEGLESS, REACT, STONES, CAMP, LEFT, SKY,
    PEOPLE, NEED, NEED_CODA, HELP, HELP_CODA, GIFT, GIFT_CODA, SAVE, SAVE_CODA, CALF, END_PACT, GO, WALK, WAYHELP, WAYGIFT, FAR, LOSS_CAUSE, BURIAL,
    KEEPSAKE, HARD, END_TREK, RIFT, RIFT_TALK, PART, PARTING, SIGN, END_SPLIT, WRONG, ALONE, LOSS_SOUR, END_SOUR,
    PULL, CALL, VOICE, HOLD, FIRST, MAD_REST, MAD_HEAD, DREAM, KNOW, WE, END_CHORUS, SEASON, DEN, SLOW, END_SLEEP,
    OLD, FAIL, HAND, END_LIGHT,
  },
  LIMITS: { ENTRY_MIN, ENTRY_MAX, SENTENCE_MAX, SPAN },
  ORDER, NEEDS,
  SourceLore,
};
