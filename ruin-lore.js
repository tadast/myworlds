// myworlds — the second log: what the crew that went to the call wrote at the ruin. Phase 2, p2-43.
//
// It is an ES module that exports RuinLore. generate.js imports it and writes world.ruin.log after
// the log of the wreck, from makeRng(seed + '|ruin-lore') and from no other stream. It holds no
// three.js and no DOM, and it reads no geometry.
//
// The last entry of the log of the wreck sends people toward the call: everybody, two people, one
// person alone, or nobody (log.went, decision 2 of p2-00). The reader follows the same call to the
// ruin, and this file writes what those people left there, by decision 3:
//
//   all, some   a second log of 5 to 8 entries, in the shape of world.source.log
//   one         one note of 2 to 5 sentences, on the day that person arrived
//   none        no log: world.ruin.log is null, and the reader is the first to stand there
//
// ---------------------------------------------------------------- what a second log is
//
//   entry 1        the arrival: the trip, from the way the last entry of the wreck named, how the
//                  crew ate on the way when the ship ran short, and the first sight of the ruin. A
//                  new keeper says so first
//   entries 2..n-1 four to six beats at the ruin, in a fixed order: what the crew sees close to,
//                  the work, the carvings, the door or the steps, the sky, a person, the light, the
//                  reply, and a second person. The sight, the carvings, a person, and the reply
//                  always run
//   entry n        the end: the crew stays, starts back to the ship, waits for the reader, or the
//                  entry stops in the middle of a sentence, which the card marks as p2-37 does
//
// **The people are the goers, and only the goers.** The keeper of the second log is the first goer.
// When the keeper of the wreck did not go, the first entry says who keeps this log now. A person of
// the log of the wreck who did not go is named only there, and the person a thread of that log took
// out is named nowhere.
//
// **The days go on from the last day of the log of the wreck.** The goers leave the morning after
// it, and the trip takes the arc from the wreck to the ruin over the speed of the way they travel:
// TRAVEL below. The arrival is the day the trip ends.
//
// **The call answers the crew.** One beat of every second log, and every note, states that the ruin
// sends the beacon of the crew back to them, slower. That is the motif of p2-44, the motif of the
// wreck an octave lower at half the speed, so the ear and the log agree.
//
// **The log never states what the ruin is, and it never names another world.** The crew sees
// stones, carvings, and a light, and says what it sees. The way on belongs to the card.
//
// Every rule of the voice of docs/source.md holds here: short declarative sentences, no metaphor
// and no simile, no adverb of manner, every noun a thing the reader can see, no pronoun for a
// member of the crew, and each entry stands on its own subject. The ruin is a thing of wonder, and
// nothing here is frightening in detail.
//
// **The name of the ruin is a plural or a singular by the proto**, so {site} never stands as the
// subject of a verb in the present tense, and no pronoun stands for it. A wording writes "the
// stones" when it needs a subject for every proto.
import { Lore } from './lore.js';
import { SourceLore } from './source-lore.js';
import { protoRow, makerBody, makerFits } from './ruin-types.js';

  const L = Lore;
  const pool = L.pool;
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  // ---------------------------------------------------------------- the tokens
  // Every token a wording may use. tools/lore-audit reads this list.
  const TOKENS = [
    // the ship, the world, and the trip
    'probe', 'world', 'days', 'left', 'trip', 'km', 'how', 'from',
    // the ruin: the name of what the crew sees, and the numbers of the card
    'site', 'Site', 'height', 'across',
    // the people: the keeper of this log, the other goers, the keeper of the log of the wreck, a
    // person who stayed at the ship, and the person a beat about the people is about
    'keeper', 'keeperjob', 'one', 'onejob', 'two', 'twojob', 'shipkeeper', 'stayer', 'crew', 'who', 'whojob',
    // the body the carvings show
    'makerbody', 'makerheight',
    // the world
    'temp', 'day', 'moon', 'plants',
    // the animal the log of the wreck names
    'other', 'Other', 'others', 'Others', 'kind', 'Kind', 'kinds', 'Kinds',
  ];
  const BEAST_TOKENS = ['other', 'Other', 'others', 'Others', 'kind', 'Kind', 'kinds', 'Kinds'];

  // ---------------------------------------------------------------- the trip
  // Kilometres a day, a turn of this planet, for each way the goers travel. p2-43 sets the rover
  // at 40 and a person on foot at 15. A raft of packing foam that a crew paddles and lets drift
  // makes about 30, and a big walker that stops to feed and to drink makes about 25.
  const TRAVEL = { rover: 40, foot: 15, raft: 30, ride: 25 };
  // The way of the trip, in the words of a sentence: "I came {how}".
  const HOW = { rover: 'in the rover', foot: 'on foot', raft: 'on the raft', ride: 'on the back of a {kind}' };

  // The kilometres from the wreck to the ruin: the arc between the two directions on the sphere of
  // the planet. And the turns the trip takes at the speed of `by`, at least one.
  function tripKm(world) {
    const a = world.source.dir, b = world.ruin.dir;
    const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    return Math.acos(d) * ((world.env && world.env.radiusKm) || 6000);
  }
  function tripDays(km, by) {
    return Math.max(1, Math.ceil(km / (TRAVEL[by] || TRAVEL.foot)));
  }

  // ---------------------------------------------------------------- the name of the ruin
  // What the crew calls the ruin, by the proto: what it sees, and not what the ruin is. The spires
  // are needles, because the lexicon of the audit ties the word "spire" to the crystal plants.
  const SITE = {
    spires: 'the stone needles', dome: 'the broken dome', arches: 'the arches', well: 'the shaft',
    floaters: 'the floating stones', colossus: 'the stone figure', ring: 'the stone ring', hive: 'the mounds',
  };
  const PROTOS = Object.keys(SITE);

  // ---------------------------------------------------------------- the tags of the story
  // The world tags come from SourceLore.sourceTags(), with the latitude of the ruin. The writer adds
  // these, so a wording can follow what happened:
  //
  //   at<proto>           the proto of the ruin: atspires, atdome, and the rest
  //   makerspecies        the carvings show a species of this world
  //   makerrolled         the carvings show a body no animal of this world has
  //   makerknown          the species is the animal the log of the wreck names
  //   makerlegless        the carvings give legs to an animal that has none now
  //   makerlimbless       the carvings show a body with no legs
  //   makerfits           the door or the steps of the ruin fit the body; see makerFits()
  //   by<way>             how the goers came: byrover, byfoot, byraft, byride
  //   went<value>         wentall, wentsome, wentone
  //   crewsolo, crewpair, crewgroup   one goer, two, or three and more
  //   samekeeper          the keeper of the wreck keeps this log
  //   newkeeper           the keeper of the wreck stayed at the ship
  //   deadkeeper          the keeper of the wreck died, and this person wrote its last entry
  //   shipcrew            people of the crew stayed at the ship
  //   hungry              the log of the wreck counted its food down, so the trip ran out of it
  //   after<kind>         the kind of the last entry of the wreck: afterwalk, afterfollow, and so on
  const STORY_TAGS = [
    ...PROTOS.map((p) => 'at' + p),
    'makerspecies', 'makerrolled', 'makerknown', 'makerlegless', 'makerlimbless', 'makerfits',
    'byrover', 'byfoot', 'byraft', 'byride', 'wentall', 'wentsome', 'wentone',
    'crewsolo', 'crewpair', 'crewgroup', 'samekeeper', 'newkeeper', 'deadkeeper', 'shipcrew', 'hungry',
    ...SourceLore.ENDING_KINDS.map((k) => 'after' + k),
  ];

  // ---------------------------------------------------------------- the first entry: the arrival
  // The arrival is up to three parts: who keeps this log, when the keeper changed; the trip; and the
  // first sight of the ruin.
  //
  // A new keeper. The keeper of the wreck stayed with the beacon, and the first goer keeps this log.
  const INTRO = pool([
    { tags: 'newkeeper', t: 'This is {keeper}. {shipkeeper} kept the log at the ship. I keep this one.' },
    { tags: 'newkeeper crewpair', t: 'This is {keeper}, the {keeperjob}. {shipkeeper} keeps the log of {probe} at the ship. This is the log of the two of us who went.' },
    { tags: 'newkeeper', t: 'This is {keeper}. The log of {probe} stayed at the ship with {shipkeeper}. This one is new, and I keep it.' },
    { tags: 'newkeeper', t: '{keeper} writes this, the {keeperjob} of {probe}. {shipkeeper} has the old log at the ship, with the beacon.' },
  ]);

  // The trip, by the way the last entry of the wreck named. Every wording states the day of the
  // arrival or the length of the trip, from the arc and the speed of TRAVEL.
  const TRIP = pool([
    // the rover
    { tags: 'byrover', t: 'The rover brought us in on day {days}, {trip} days and {km} kilometres out from {probe}.' },
    { tags: 'byrover', t: 'We drove {trip} days to reach the click, {km} kilometres to the {from}. The rover stands with its nose to the stones.' },
    { tags: 'byrover', t: 'Day {days}. {trip} days in the rover, {km} kilometres, and the click louder every day. {one} drove the last of it.' },
    { tags: 'byrover', t: 'We left the ship on day {left} and got here on day {days}. The rover did forty kilometres a day and not one more.' },
    { tags: 'byrover', t: '{one} stopped the rover on a rise this morning and turned off the motor. The click filled the cab. We had driven {km} kilometres in {trip} days.' },
    // on foot
    { tags: 'byfoot', t: 'We walked in on day {days}, {trip} days and {km} kilometres from {probe}.' },
    { tags: 'byfoot', t: 'We left the ship on day {left} with packs and the hand radio. We came in on foot on day {days}.' },
    { tags: 'byfoot', t: '{trip} days on foot, {km} kilometres to the {from}. Every day the click on the hand radio was a little louder.' },
    { tags: 'byfoot', t: 'Our boots are finished after {km} kilometres. We came in {trip} days, and {one} carried the hand radio the whole way.' },
    { tags: 'byfoot', t: '{one} saw the stones first, from the top of a long rise, on the morning of day {days}. We had walked for {trip} days.' },
    { tags: 'byfoot wentall crewgroup', t: 'All {crew} of us walked in on day {days}, {trip} days out from {probe}. Nobody fell behind.' },
    // the raft
    { tags: 'byraft mostlysea waterliquid', t: 'The raft came ashore on day {days}, after {trip} days on the water.' },
    { tags: 'byraft mostlysea waterliquid', t: 'We pulled the raft up on the shore on day {days}. {trip} days of water, {km} kilometres, and the click louder every night.' },
    { tags: 'byraft mostlysea waterliquid', t: '{trip} days on the raft. {one} steered by the hand radio, toward the click, and the click brought us to land.' },
    { tags: 'byraft mostlysea waterliquid', t: 'We crossed the water to the {from} for {trip} days. On day {days} the raft touched land, and we walked the last of the way.' },
    { tags: 'byraft mostlysea waterliquid', t: '{trip} days on the water, and {one} kept the hand radio dry the whole way. On day {days} the raft ran up on a beach below the stones.' },
    { tags: 'byraft mostlysea waterliquid', t: 'The raft carried us {km} kilometres in {trip} days. {one} saw land on the morning of day {days}, and the click came from it.' },
    // on the back of the animal
    { tags: 'byride beasts mwalk', t: 'The {kind} carried us for {trip} days and put us down on day {days}. We walked the last of the way.' },
    { tags: 'byride beasts mwalk', t: 'We rode the {kind} to the {from} for {trip} days. The {kind} went where the click came from, and we went with it.' },
    { tags: 'byride beasts mwalk', t: 'Day {days}. {trip} days on the back of the {kind}, {km} kilometres. The {kind} stopped at the edge of the flat ground and would go no further.' },
    // after the animal the crew followed, on foot or in the rover
    { w: 1.5, tags: 'afterfollow beasts', t: 'We followed the {kinds} to the {from} for {trip} days. On day {days} the {kinds} went on, and we stopped at the stones.' },
    { w: 1.5, tags: 'afterfollow beasts', t: 'The {kinds} went our way for {trip} days, {km} kilometres. On day {days} the {kinds} turned away, and we went on to the click.' },
    // after the last joke
    { w: 1.5, tags: 'afterjoke', t: 'We left the ship laughing, {trip} days ago. It is day {days}, and at the stones nobody is laughing.' },
    { w: 1.5, tags: 'afterjoke', t: 'Day {days}. We came {km} kilometres on a joke, and nobody here is joking now.' },
  ]);

  // The food on the trip. A log of the wreck that ran the thread crew.food counted the food down
  // to a few days, and the trip takes weeks. So a crew that was hungry at the ship says how it ate
  // on the way: the seed store of the ship, or a plant of this world where a person can live
  // outside the hull. One sentence, so the arrival stays inside nine.
  const HUNGER = pool([
    { tags: 'hungry', t: 'The food ran out on the way, and we live on the seed store now, a handful a day.' },
    { tags: 'hungry', t: '{one} shared out the last ration on the trip, and after that we ate the seed store.' },
    { tags: 'hungry', t: 'We came in thin, on the last of the seed store, with the rations long gone.' },
    { w: 2, tags: 'hungry flora temperate waterliquid', t: '{one} found out on the trip which {plants} a person can eat, and that is what we eat now.' },
  ]);

  // The first sight of the ruin, by the proto. What the crew sees as it comes in.
  const FIRST_SIGHT = pool([
    { tags: 'atspires', t: 'Seven needles of stone stand up out of the plain, taller than anything we have seen on {world}.' },
    { tags: 'atspires', t: 'From a day out we saw a line on the sky and took it for a mast. The line is a needle of stone, and there are seven of them.' },
    { tags: 'atspires', t: 'The click comes from seven stone needles on a flat of bare rock. The tallest is five times the height of our mast.' },
    { tags: 'atspires', t: 'On day {days} the needles came up over the horizon one at a time. {one} counted seven.' },
    { tags: 'atspires', t: '{one} saw the tallest needle first, a line on the sky at noon. Up close, there are seven of them on a flat of bare rock.' },
    { tags: 'atdome', t: 'The click comes from a dome of stone ribs on a flat of bare rock. Some of the ribs are down.' },
    { tags: 'atdome', t: 'A broken dome stands on the flat ahead of us, a ring of stone ribs with gaps in it. There is a light inside.' },
    { tags: 'atdome', t: 'We saw the ribs of the dome from a long way off, against the sky. Up close, six of the ribs are broken.' },
    { tags: 'atdome', t: 'On day {days} a dome of stone ribs came up out of the flat ahead. {one} counted the gaps where ribs are down.' },
    { tags: 'atdome', t: '{one} walked ahead to the dome and stood in the door of the base ring, small under the ribs.' },
    { tags: 'atarches', t: 'A line of stone arches crosses the flat, each one lower than the one before. The click comes from the first arch.' },
    { tags: 'atarches', t: 'Six arches of stone stand in a row on bare rock. The last one has no top.' },
    { tags: 'atarches', t: 'The arches came up out of the ground in the afternoon, one behind the other. The fifth arch is broken.' },
    { tags: 'atarches', t: 'On day {days} we saw the first arch against the sky, and then the next, and the next.' },
    { tags: 'atarches', t: '{one} walked the line of the arches ahead of us, from the tallest to the one with no top.' },
    { tags: 'atwell', t: 'The click comes out of a hole in the ground: a round shaft with a stone rim. Eight stone posts lean out around it.' },
    { tags: 'atwell', t: 'There is a round shaft in the flat ground ahead, with a light at the bottom of it.' },
    { tags: 'atwell', t: 'Eight stone posts stand in a ring on the flat and lean out. Between the posts the ground falls away into a shaft.' },
    { tags: 'atwell', t: 'On day {days} {one} stopped at the rim of a shaft in the flat ground. Light comes up out of the shaft.' },
    { tags: 'atwell', t: 'The posts came first, eight of them, leaning out. {one} reached the rim of the shaft between the posts and called me over.' },
    { tags: 'atfloaters', t: 'Slabs of stone hang in the air over a ring of standing stones. Nothing holds the slabs up.' },
    { tags: 'atfloaters', t: 'The click comes from a ring of standing stones. Over the ring, slabs of stone turn in the air around a light.' },
    { tags: 'atfloaters', t: 'We saw the floating stones from a day out, against the sky. Up close, there are nine slabs and two rings, and they turn.' },
    { tags: 'atfloaters', t: 'On day {days} we saw stones in the sky over the flat. Up close, the stones turn round a light.' },
    { tags: 'atfloaters', t: '{one} stopped and pointed. Ahead, slabs of stone turn in the air over a ring of standing stones.' },
    { tags: 'atcolossus', t: 'A figure of stone lies on its side on the flat. One hand stands up out of the ground, open.' },
    { tags: 'atcolossus', t: 'The first thing we saw was a hand of stone, standing up out of the plain with the palm open.' },
    { tags: 'atcolossus', t: 'The click comes from a stone figure that lies on its side. The eye of the head is lit.' },
    { tags: 'atcolossus', t: 'On day {days} we came over a rise and saw a stone figure on its side. A stone hand stands up out of the flat beside it.' },
    { tags: 'atcolossus', t: '{one} saw the stone hand first, open, from a day out. The figure the hand belongs to lies on its side on the flat.' },
    { tags: 'atring', t: 'A ring of stone blocks stands on its edge on the flat, taller than the mast. The sky shows through the middle.' },
    { tags: 'atring', t: 'The click comes from a great ring of stone blocks that stands on its edge. One block of the ring is missing.' },
    { tags: 'atring', t: 'We saw the stone ring from a long way off, a circle on the sky. The inner edge of the ring gives light.' },
    { tags: 'atring', t: 'On day {days} a circle stood up on the horizon. Up close, it is a ring of stone blocks on its edge, taller than the mast.' },
    { tags: 'atring', t: '{one} walked under the ring first and looked up through the middle at the sky.' },
    { tags: 'athive', t: 'Mounds of stone cells stand on the flat, one great mound and three small ones, with paths between them.' },
    { tags: 'athive', t: 'On day {days} we reached a great mound of stone cells, with three small mounds around it.' },
    { tags: 'athive', t: '{one} walked the paved path from the edge of the flat to the great mound. Every stone of the path has six sides.' },
    { tags: 'athive', t: 'The great mound rises in steps of six-sided cells, and three small mounds stand around it. Paved paths run between the mounds.' },
    { tags: 'athive', t: 'The click comes from a mound of six-sided stone cells, in steps. There are doors at the foot, and light in the doors.' },
  ]);

  // ---------------------------------------------------------------- the beats at the ruin
  // What the crew sees close to, by the proto.
  const SIGHT = pool([
    { tags: 'atspires', t: '{one} walked round the base of the tallest needle and counted the faces. Five. Each needle has five flat sides.' },
    { tags: 'atspires', t: 'Stone bridges run between the needles, high up. {one} tried to follow a bridge to its far end with the long lens.' },
    { tags: 'atspires', t: '{one} put a hand on the dark block under the smallest needle. The block is warm, and the air is not.' },
    { tags: 'atspires', t: 'Rubble lies around the feet of the needles, in pieces the size of a crate. Nothing grows on any of the rubble.' },
    { tags: 'atdome', t: 'The dome has fourteen ribs, and six of them are down. {one} walked in under the ribs that stand and looked up for a long time.' },
    { tags: 'atdome', t: 'Pieces of fallen rib lie across the floor inside the dome. Nothing lies on that floor but stone.' },
    { tags: 'atdome', t: 'Near the top of the dome a ring of stone holds the ribs together. Where the ribs are down, the ring hangs over the gap.' },
    { tags: 'atdome', t: '{one} found one door in the low ring at the base of the dome, and went through it first.' },
    { tags: 'atdome', t: '{one} lay in the middle of the dome and looked up at the sky through the broken ribs.' },
    { tags: 'atarches', t: 'We walked the line of the arches from the first to the last. The fifth arch is broken, and its stones lie in the path.' },
    { tags: 'atarches', t: 'The stones under the arches make a paved road. {one} swept one paving stone clean and found it fits the next with no gap.' },
    { tags: 'atarches', t: 'Each arch stands on two legs of stacked blocks. {one} counted nine blocks in every leg.' },
    { tags: 'atarches', t: 'The sixth arch has its two legs and nothing across the top. {one} stood between the two legs and looked back down the line.' },
    { tags: 'atarches', t: '{one} sat on the fallen block by the fifth arch and made a drawing of the whole line.' },
    { tags: 'atwell', t: 'The shaft is forty-six metres deep. {one} lowered the lamp on a line and found the floor.' },
    { tags: 'atwell', t: 'A stair goes down the wall of the shaft, round and round. {one} went down ten steps and came back up.' },
    { tags: 'atwell', t: 'The eight posts round the shaft all lean out, away from the hole. Each post has a top of a lighter stone.' },
    { tags: 'atwell', t: 'The rim of the shaft is a wide ring of dark stone. {one} walked all the way round the rim in two minutes.' },
    { tags: 'atfloaters', t: '{one} stood under a slab that hangs in the air and reached up. The slab is out of reach, and it moves.' },
    { tags: 'atfloaters', t: 'The slabs go once round the light in about two minutes. {one} timed ten turns to be sure.' },
    { tags: 'atfloaters', t: 'Each slab rises and falls on its own time as it goes round. {one} timed three of the slabs and got three numbers.' },
    { tags: 'atfloaters', t: 'Ten stones stand in a ring on the ground under the slabs. The standing stones do not move. Only the stones in the air move.' },
    { tags: 'atcolossus', t: 'The stone figure lies on its side, a body with {makerbody}. {one} walked from one end of it to the other and counted the paces.' },
    { tags: 'atcolossus', t: 'The hand of the stone figure stands up out of the ground with the palm open to the sky. {one} stood in its shadow at noon.' },
    { tags: 'atcolossus', t: '{one} climbed on to the side of the stone figure and walked along it from one end to the other.' },
    { tags: 'atcolossus', t: 'The eye of the stone figure is a round stone set into the head. The eye is not the same stone as the rest.' },
    { tags: 'atcolossus', t: '{one} climbed the stone hand up to the wrist and came down with the palm still out of reach.' },
    { tags: 'atring', t: 'The ring stands on its edge on the flat. {one} counted the blocks: twenty-five, and a gap where one more should be.' },
    { tags: 'atring', t: 'Two blocks have fallen from the ring and lie on the ground beside it. {one} could not move either of them.' },
    { tags: 'atring', t: 'The lower part of the ring goes into the ground. {one} dug at the foot of the ring and found more ring.' },
    { tags: 'atring', t: 'Every third block of the ring carries a band of a different stone. {one} counted the bands twice.' },
    { tags: 'athive', t: 'Every cell of the great mound has six sides, and every cell is the same size. {one} measured nine of the cells to be sure.' },
    { tags: 'athive', t: '{one} climbed the five steps of the great mound to the top. From there the three small mounds and the paths between them are in sight.' },
    { tags: 'athive', t: '{one} looked for a window or a stair on the great mound and found only the doors at the foot. {one} measured a door and wrote the number down.' },
    { tags: 'athive', t: 'Paths of six-sided stones run from the great mound to each small mound. The stones fit with no gap.' },
    { tags: 'athive', t: 'A few cells near the middle of the great mound have fallen one step. {one} looked down into the gap and saw more cells.' },
  ]);

  // The work of the survey. It fits every proto, so it names the ruin as {site} or as "the stones".
  // The numbers are the numbers of the card: the height, and twice the disc.
  const WORK = pool([
    { t: '{one} measured {site} with the laser. {height} metres at the top, and {across} metres from side to side.' },
    { t: '{one} put the rock drill to the stone. The bit went blunt in a minute, and the stone took no mark.' },
    { tags: '!lava', t: '{one} ran a chip of the rubble through the analyser. No stone of {world} comes near it, and nothing in the store of samples does.' },
    { tags: 'lava', t: '{one} put a hand near the stones at noon and pulled it back. The stones hold the heat of the day long after dark.' },
    { t: '{one} tried to date the stone and could not. The rock under the stones is younger than the stones.' },
    { t: 'We have mapped {site} from four sides and taken a photograph of every face. {one} did the drawings.' },
    { t: 'We set the shelter at the edge of the flat ground and put up the flag. {one} took the first samples of the dust.' },
  ]);

  // The carvings. They show the body of the maker, in the words the card uses, so the log and the
  // card agree. A crew that watched that animal from the ship knows it; a crew that did not knows
  // only the body.
  const CARVING = pool([
    { tags: 'makerknown beasts', t: 'The stones carry carvings of a body with {makerbody}. {one} knew the body before anybody spoke: {others}, the animal we watched from the ship.' },
    { tags: 'makerknown beasts', t: 'There are carvings on the stones, and every carving shows {other}. {one} held a photograph from the ship up beside a carving, and the two bodies match.' },
    { tags: 'makerknown beasts', t: 'The carvings show {others}, over and over. {one} laughed out loud when we saw the carvings, and then stopped.' },
    { tags: 'makerknown beasts', t: '{one} traced a carving with a finger: a body with {makerbody}. {one} said the name of {other} before I could.' },
    { w: 3, tags: 'makerknown makerlegless beasts', t: 'The carvings show {others}, but on legs. The {kinds} we know have none. {one} drew both bodies side by side in the notebook.' },
    { w: 3, tags: 'makerknown makerlegless beasts', t: '{one} found a carving of {other} with {makerbody}. The {kinds} near the ship have no legs at all.' },
    { w: 3, tags: 'makerknown makerlegless beasts', t: 'Every carving here gives {others} legs. {one} looked at the carvings for an hour and then said the {kinds} lost the legs.' },
    { tags: 'makerspecies !makerknown', t: 'The stones carry carvings of a body with {makerbody}. None of us has seen that animal on {world}.' },
    { tags: 'makerspecies !makerknown', t: 'Every carving on {site} shows a body with {makerbody}. {one} has the survey of the animals open on the floor and cannot find that body.' },
    { tags: 'makerspecies !makerknown', t: '{one} rubbed a carving on to paper: a body with {makerbody}. The animal lives here, {one} says, somewhere we did not walk.' },
    { tags: 'makerspecies !makerknown', t: '{one} found a carving on the inside of the stones: a body with {makerbody}, cut deep. {one} drew the carving and put the drawing with the survey.' },
    { tags: 'makerspecies !makerknown', t: 'The carvings show one body, again and again: a body with {makerbody}. {one} says an animal with that body lives on {world}, and we missed it.' },
    { tags: 'makerrolled', t: 'The carvings show a body with {makerbody}, about {makerheight} tall. No animal we have seen on {world} has that body.' },
    { tags: 'makerrolled', t: '{one} stood beside a carving of a body with {makerbody}. The body in the carving is about {makerheight} tall.' },
    { tags: 'makerrolled', t: 'Every carving shows the same body, with {makerbody}. {one} has looked at every animal on this world through the long lens, and no animal has that body.' },
  ]);

  // The door or the steps fit the body of the carvings: the door of the dome, the doors of the hive,
  // and the steps of the well. makerFits() of ruin-types.js decides, as it decides for the card.
  const FIT = pool([
    { tags: 'makerfits atdome', t: '{one} stood in the door of the base ring. The door is cut for a body the height of the carvings.' },
    { tags: 'makerfits atdome', t: 'The door in the base ring fits the body in the carvings, and not us.' },
    { tags: 'makerfits atdome', t: '{one} measured the door of the dome against a drawing of the carvings. The two heights are the same.' },
    { tags: 'makerfits athive', t: 'The doors at the foot of the mounds are cut to one height. {one} held a drawing of the carvings up to a door, and the body fits it.' },
    { tags: 'makerfits athive', t: '{one} put a lamp into a door of the great mound. The door fits the body in the carvings.' },
    { tags: 'makerfits athive', t: 'Every door in the mounds is the same height, and the height is the height of the carvings.' },
    { tags: 'makerfits atwell', t: 'The steps down the shaft fit the body in the carvings. {one} went down twenty of the steps with the lamp and came back up.' },
    { tags: 'makerfits atwell', t: '{one} laid the drawing of the carvings beside a step of the stair. The step fits that body.' },
    { tags: 'makerfits atwell', t: 'The steps down the shaft are cut for the body in the carvings. {one} measured three of the steps.' },
  ]);

  // The light of the ruin at night, by the proto. It blinks the motif of the ruin, so the log says it
  // goes bright and dim and never out, as the glow of SourceRuin does.
  const LIGHT = pool([
    { tags: 'atspires', t: 'At dusk the tip of the tallest needle lit up. The light went bright and dim in the time of the click, all night.' },
    { tags: 'atspires', t: 'There is a band of light on every needle, a little over halfway up. The bands come on together after dark.' },
    { tags: 'atspires', t: '{one} watched the light at the top of the tallest needle through the long lens until dawn. The light never went out.' },
    { tags: 'atdome', t: 'Inside the dome a stone on a block gives light. The stone is brighter at night, and it keeps time with the click.' },
    { tags: 'atdome', t: '{one} walked in under the ribs at night to the stone that gives light. The stone is warm to the hand.' },
    { tags: 'atdome', t: 'The light inside the dome throws the shadows of the ribs across the flat all night.' },
    { tags: 'atarches', t: 'The top stone of the first arch gives light. At night it is the brightest thing on the flat.' },
    { tags: 'atarches', t: 'After dark the top stone of the first arch lit up. The shadows of the arches ran down the line.' },
    { tags: 'atarches', t: '{one} sat under the first arch at night. The light in the top stone goes bright and dim, and never out.' },
    { tags: 'atwell', t: 'After dark the floor of the shaft gives light, and the light comes up out of the hole.' },
    { tags: 'atwell', t: 'The tops of the eight posts light up at dusk. From the rim, the light on the floor of the shaft looks a long way down.' },
    { tags: 'atwell', t: '{one} lay at the rim at night and watched the floor of the shaft. The light down there goes bright and dim, and never out.' },
    { tags: 'atfloaters', t: 'The light the slabs turn around is brighter at night. The slabs cross in front of the light, one after another.' },
    { tags: 'atfloaters', t: 'At night the stone in the middle gives light. The slabs throw long shadows over the ring as they pass.' },
    { tags: 'atfloaters', t: '{one} lay on the ground under the slabs after dark and watched the slabs cross the light.' },
    { tags: 'atcolossus', t: 'After dark the eye of the stone figure lit up, and so did the palm of the hand.' },
    { tags: 'atcolossus', t: 'The light in the palm of the stone hand shows from far out on the flat. {one} walked a kilometre out to check.' },
    { tags: 'atcolossus', t: 'At night the eye of the stone figure gives light. {one} sat by the head and said nothing for an hour.' },
    { tags: 'atring', t: 'After dark the inner edge of the ring gives light, all the way round above the ground.' },
    { tags: 'atring', t: 'The whole inner edge of the ring goes bright and dim at once, in the time of the click.' },
    { tags: 'atring', t: '{one} stood under the ring at night, in the light of its inner edge. {one} did not want to come in.' },
    { tags: 'athive', t: 'At dusk the doors at the foot of every mound lit up. A crown of light came on at the top of the great mound.' },
    { tags: 'athive', t: 'The light in the doors of the mounds goes bright and dim together. {one} counted the doors that give light: every third door.' },
    { tags: 'athive', t: 'From our shelter we can see the crown of light on the great mound all night.' },
  ]);

  // The sky over the ruin: one fact of the world, gated on it.
  const SKY = pool([
    { tags: 'rainy', t: 'It rained on {site} tonight. The water ran off the stones and left them dark.' },
    { tags: 'subzero', t: 'At {temp} the frost stands on everything but the stones. The stones stay clear.' },
    { tags: 'hot|molten', t: 'At {temp} the air over the flat shakes at noon. We work at the stones at dawn and at dusk.' },
    { tags: 'moonlit', t: '{moon} came up behind {site} tonight. {one} took a photograph and then put the camera away and watched.' },
    { tags: 'ringed !atring', t: 'The ring overhead stood over {site} at dusk, and {one} said nothing for a while.' },
    { tags: 'longday|slowspin', t: 'The day here is {day} long. We work through the light and sleep through the dark, in the shelter by the stones.' },
    { tags: 'stormy', t: 'A storm went over in the night. Lightning struck the flat twice and never the stones.' },
    { tags: 'auroral', t: 'The sky over {site} went green last night, from end to end. The click did not change.' },
    { tags: 'flora', t: '{plants} grow up to the edge of the flat ground and stop. Nothing grows on the stone.' },
    { tags: 'volcanic', t: 'Ash came down on {site} in the night. By morning the stones were clean and the flat was grey.' },
  ]);

  // The people, with the traits of the log of the wreck. A person of that log carries one trait,
  // and a beat here tells what that person did at the ruin, with the trait in it. `trait` is the key
  // of TRAITS in source-lore.js. The keeper of this log writes "I", so no beat is about the keeper.
  const PEOPLE = pool([
    { trait: 'firstflight', t: '{who} asked what {site} is for. Nobody had an answer, and {who} wrote the question in the small book with no answer under it.' },
    { trait: 'firstflight', t: '{who} has walked round {site} three times today. This is the first flight {who} has made.' },
    { trait: 'firstflight', t: '{who} is the youngest of us and was the first to put a hand on the stones.' },
    { trait: 'veteran', t: '{who} has made six landings and says none of them was this.' },
    { trait: 'veteran', t: '{who} flew survey ships for twenty years. {who} sat down on the flat in front of {site} and did not get up until dark.' },
    { trait: 'veteran', t: '{who} has a scar across one palm from an older ship. {who} put that hand flat on the stone today and held it there.' },
    { trait: 'parent', t: '{who} recorded a bedtime story tonight, about {site}, for the two daughters at home.' },
    { trait: 'parent', t: '{who} took a photograph of the carvings for the daughters at home, and then one more.' },
    { trait: 'parent', t: '{who} counted the days to the birthday at home tonight. The count is still a long one.' },
    { trait: 'farm', tags: '!harsh', t: '{who} picked up a handful of the dust by the stones and smelled it. {who} says the dust smells of nothing at all.' },
    { trait: 'farm', t: '{who} grew up on a farm and is up before the rest of us. This morning {who} was out on the flat before dawn, to see the stones in the first light.' },
    { trait: 'farm', t: '{who} mended the shelter with wire tonight and said the proper part can come later.' },
    { trait: 'money', t: '{who} signed on for the pay. Tonight {who} said no pay was worth this, and then that this was worth more than the pay.' },
    { trait: 'money', t: '{who} worked out the pay for the trip here on the first night out and told us the figure. Tonight {who} tore the page out.' },
    { trait: 'money', t: '{who} sends the whole wage home to a sick brother. {who} took a photograph of {site} to send with the next wage.' },
    { trait: 'reader', t: '{who} brought one book and has read it five times now. Tonight {who} read the last page aloud, at the foot of {site}.' },
    { trait: 'reader', t: '{who} reads the repair manuals for pleasure. There is no manual for {site}, and {who} has started one.' },
    { trait: 'reader', t: '{who} recited the long poem from school tonight, out on the flat, to nobody.' },
    { trait: 'talker', t: '{who} talks through every job, and today {who} talked to {site} for an hour. The click went on.' },
    { trait: 'talker', t: '{who} has not said a word since we got here. Nobody has known {who} to be quiet this long.' },
    { trait: 'talker', t: '{who} talks to the pumps and the engines, and now to the stones. {who} says the stones listen better.' },
    { trait: 'tidy', t: '{who} laid the tools out on a crate in one order and labelled the stones we sampled, in three colours.' },
    { trait: 'tidy', t: '{who} folded the blanket square this morning, here, at the foot of {site}.' },
    { trait: 'tidy', t: '{who} has labelled every box in the shelter. There is no label for {site}, and {who} left that label blank.' },
    { trait: 'faith', t: '{who} said the short prayer before supper tonight, and this time we all joined.' },
    { trait: 'faith', t: '{who} kept the day of rest today, on the flat in front of {site} from dawn to dark.' },
    { trait: 'faith', t: '{who} held the medal from the grandmother at the foot of {site} and did not say what for.' },
    { trait: 'joker', t: '{who} told the second of the three jokes tonight, the good one. We laughed until the click was the only sound left.' },
    { trait: 'joker', t: '{who} found the last joke note in the last ration crate today, here. We read the note out by the stones.' },
    { trait: 'joker', t: '{who} has not given {site} a rude name. It is the first thing {who} has not named.' },
    { trait: 'sleepless', t: '{who} sleeps four hours a night. Here {who} spends the rest at the door of the shelter, in the light of the stones.' },
    { trait: 'sleepless', t: '{who} takes every night watch. Tonight {who} sat up with the long lens on {site} until dawn.' },
    { trait: 'sleepless', t: '{who} is awake at all hours and says the flat at night is the best place to think.' },
    { trait: 'artist', t: '{who} has drawn {site} from every side, in pencil, and given the drawings to nobody.' },
    { trait: 'artist', t: '{who} drew each of us in front of {site}, very small.' },
    { trait: 'artist', t: '{who} copied the carvings into the notebook, line for line. The copy took three days.' },
    { trait: 'runner', t: '{who} ran round {site} twenty times this morning, in the suit, and counted each lap out loud.' },
    { trait: 'runner', t: '{who} was a runner at school. Today {who} ran the length of the flat and back and would not say why.' },
    { trait: 'runner', t: '{who} did pull-ups on the frame of the shelter door this morning, facing {site}.' },
    { trait: 'standin', t: '{who} joined the crew nine days before launch, in place of a sick person. {who} says that person would give anything to stand here.' },
    { trait: 'standin', t: '{who} was the reserve for this flight and did not expect to fly. {who} stood in front of {site} this morning and laughed.' },
    { trait: 'standin', t: '{who} met the rest of us nine days before launch. Tonight {who} said this is the crew {who} would pick.' },
    { trait: 'boat', t: '{who} grew up on a boat and cannot sleep in silence. The click is enough.' },
    { trait: 'boat', t: '{who} tied the shelter down with the knots from the boat, every line, twice.' },
    { trait: 'boat', t: '{who} walks with the feet wide apart, from the boats. {who} walked the whole of {site} that way this morning.' },
    { trait: 'teacher', t: '{who} taught school for ten years. Tonight {who} explained {site} to us twice, and then said we know nothing about it.' },
    { trait: 'teacher', t: '{who} used to teach children. {who} wrote a lesson about {site} in the back of the log book, for a class at home.' },
    { trait: 'teacher', t: '{who} left a classroom for this flight. The card from the class is in the shelter now, on a crate by the door.' },
    { trait: 'twin', t: '{who} has a twin at home who also applied. Tonight {who} wrote to that twin: you should see this.' },
    { trait: 'twin', t: '{who} writes to a twin every week. The letter tonight starts in the middle of a sentence about {site}.' },
    { trait: 'twin', t: '{who} says a twin at home would understand {site} better. We do not agree.' },
    { trait: 'letters', t: '{who} wrote a letter on paper tonight and put it in the tin with the other letters.' },
    { trait: 'letters', t: '{who} keeps a diary in a code. The entry of tonight is one line long, and {who} would not tell us the code.' },
    { trait: 'letters', t: '{who} read a letter from home out loud tonight, at the foot of {site}.' },
    { trait: 'sweets', t: '{who} handed out the last of the boiled sweets tonight, one each, on the flat by the stones.' },
    { trait: 'sweets', t: '{who} opened the jar of pickles from home tonight and shared it out. That jar was for a day worth marking.' },
    { trait: 'sweets', t: '{who} took the bottle out tonight and looked at it, and put it away. {who} says the bottle is still for the day we go home.' },
    { trait: 'heights', t: '{who} does not like heights and climbed on to the stones all the same.' },
    { trait: 'heights', tags: '!harsh', t: '{who} is afraid of the dark and slept outside the shelter tonight, in the light of the stones.' },
    { trait: 'heights', tags: 'byrover', t: '{who} gets sick in the rover and drove it all the same, the whole way here.' },
    { trait: 'heights', t: '{who} is afraid of heights. Today {who} lay at the edge of the flat and looked up at {site} for a long time.' },
    { trait: 'wedding', t: '{who} is to be married four days after we get home. {who} wants a photograph of {site} for the wall of the new house.' },
    { trait: 'wedding', t: '{who} carries a ring in the suit pocket, for a question to be asked at home. Tonight {who} took it out and looked at it in the light of the stones.' },
    { trait: 'wedding', t: '{who} talked about the one person at home tonight. This time the talk was about bringing that person here.' },
    { trait: 'unwilling', t: '{who} did not want this flight, and said so again tonight. Then {who} said this was worth the flight.' },
    { trait: 'unwilling', t: '{who} says this is the last flight, and that the garden at home can wait one more season.' },
    { trait: 'unwilling', t: '{who} turned this flight down twice. {who} came to {site} with the rest of us and has not said one word against it.' },
    { trait: 'stars', t: '{who} is drawing new constellations for this sky. Tonight there is one over {site}, and {who} has not named it yet.' },
    { trait: 'stars', t: '{who} goes out after every shift to look up. Tonight {who} stayed out to look at {site}.' },
    { trait: 'stars', t: '{who} wanted to fly from the age of six. Tonight {who} said the child of six would not believe this.' },
    { trait: 'hands', t: '{who} carved a small copy of {site} out of packing foam. The copy stands on the crate by the door.' },
    { trait: 'hands', t: '{who} knitted a band in the colours of the stones tonight and tied it round the flag pole.' },
    { trait: 'hands', t: '{who} cut the hair of everybody here tonight, outside, with {site} behind us.' },
  ]);

  // The reply, decision 6 of p2-00 and the motif of p2-44: the ruin sends the beacon of the crew
  // back to them, slower and lower. Every second log holds exactly one of these beats.
  //
  // One of these beats runs in every second log, so the pool is wide, and nearly every sentence
  // carries a name, a day, or the name of the ruin, so two logs do not share it.
  const REPLY = pool([
    { t: '{one} keyed the hand beacon at the foot of {site}. The stones sent every click back to the headset, lower, and at half the speed.' },
    { t: 'We set the hand beacon on the flat by {site} and let it run. {one} heard every click come back, slower, and a note lower.' },
    { t: '{one} sent our call sign on the hand beacon, click by click. {Site} sent the whole pattern back, at half the speed.' },
    { t: 'At {site} the click is loud enough to hear with no radio. When {one} keys the beacon, the stones answer with the same clicks, lower and slower.' },
    { t: 'At {site} the answer is not a click. {one} heard our own beacon played back at half the speed, with a ring on each note.' },
    { tags: 'crewgroup', t: '{one} and {two} took turns on the beacon key all evening. Every pattern the two of them sent, {site} sent back, slower.' },
    { t: '{one} played the tape of the beacon of {probe} on the speaker. {Site} played the tape back at half the speed, and lower.' },
    { t: '{one} keyed the beacon three times and waited. Three clicks came back from {site}, lower, and each click took twice the time.' },
    { t: 'On day {days} {one} left the hand beacon on all night by {site}. By dawn the tape held two tracks: our clicks, and the clicks of {site}, slower.' },
    { t: '{one} tapped the beacon key in the rhythm of a song from home. {Site} gave the song back a note lower and at half the speed.' },
    { t: '{one} asked for quiet and keyed one long pattern on the hand beacon. The pattern came back out of {site}, slower and lower, and nobody spoke.' },
    { tags: 'crewgroup', t: '{two} held the microphone to {site} while {one} keyed the beacon. The tape of day {days} holds every click twice: ours, and a slower one from the stones.' },
  ]);

  // ---------------------------------------------------------------- the end
  // Four kinds: the crew stays at the ruin, starts back to the ship, waits for the reader, or the
  // entry stops in the middle of a sentence. The card prints the note of p2-37 under the last kind,
  // because it reads the slot `end.cut` and not the text. No end states what the ruin is, and none
  // names another world. {stayer} is a person of the crew who stayed at the ship, alive, so an end
  // that names one is gated on `shipcrew`.
  const END = pool([
    { kind: 'stay', t: 'We are staying here. {one} has moved the shelter nearer the stones, and the flag with it.' },
    { kind: 'stay', t: 'We voted on day {days}, and we stay. Every night the beacon comes back from {site}, and every night we listen.' },
    { kind: 'stay', t: 'Nobody here wants to leave {site}. {one} will keep the beacon on, and I will keep the log.' },
    { kind: 'stay', t: '{one} asked tonight if we should start back to {probe}, and nobody answered. In the morning we go on with the drawings of {site}.' },
    { kind: 'stay', w: 1.5, tags: 'wentall', t: 'We stay at {site}. Nobody waits at {probe} for us, and there is more on these stones than one crew can read.' },
    { kind: 'stay', t: 'Day {days}. We are not going back. {one} has started a second notebook of the carvings.' },
    { kind: 'back', t: 'We start back to {probe} in the morning, the way we came. We carry the drawings, the samples, and the tape of {site}.' },
    { kind: 'back', t: 'Tomorrow we go back to {probe}, {km} kilometres the way we came. {one} has packed the drawings of the carvings on top.' },
    { kind: 'back', w: 1.2, tags: 'shipcrew', t: 'We leave for {probe} at first light, with the samples and the tape. {stayer} will want to hear the tape first.' },
    { kind: 'back', t: '{one} says we have what we came for. We start back at dawn, and the flag stays at {site}.' },
    { kind: 'back', w: 1.2, tags: 'shipcrew', t: 'We go back tomorrow, to the beacon and to {stayer}. The shelter and the flag stay up at {site}, so the next crew knows where to stand.' },
    { kind: 'back', w: 1.2, tags: 'shipcrew', t: 'Day {days}. {stayer} keeps the beacon at {probe}, and we said we would come back. {one} packed tonight, and we start back in the morning.' },
    { kind: 'wait', t: 'We wait here at {site}. The click carries past {probe} and farther. Whoever hears the click will come, and we will be here.' },
    { kind: 'wait', t: 'We are going to wait at {site} for whoever comes next. {one} keeps the beacon on, and the stones send it back.' },
    { kind: 'wait', t: 'Whoever reads this on {world}: we are in the shelter by the flag, or near it. {one} says to knock on the door.' },
    { kind: 'wait', t: 'We wait at the edge of the flat. {one} keeps the hand beacon on through the night, so anyone who comes can find the stones in the dark.' },
    { kind: 'wait', t: 'If you are reading this, you heard the click too. We waited for you here, by {site}.' },
    { kind: 'wait', t: 'Day {days}. The flag is up, the beacon is on, and we are at {site}. Come and find us.' },
    { kind: 'cut', w: 0.8, t: 'The click has stopped for the first time since we came. {one} is at the door of the shelter with the lamp. I am going out to' },
    { kind: 'cut', w: 0.8, t: '{one} says there is a new light on the stones tonight, low down, and the light is moving. I am going to' },
    { kind: 'cut', w: 0.8, t: 'The ground under the shelter just moved, and the stones are ringing. {one} is calling me from the door. I have to' },
    { kind: 'cut', w: 0.8, t: 'A light has come on at the foot of {site} that was not there before. {one} has gone down with the lamp, and I am going after' },
    { kind: 'cut', w: 0.8, t: 'Every light on {site} went out at midnight, all at once, for the first time. {one} has the lamp and is at the door of the shelter. I am taking the second lamp and' },
  ]);
  const END_KINDS = ['stay', 'back', 'wait', 'cut'];

  // ---------------------------------------------------------------- the note of one person
  // One person went alone. The note is the whole of what that person left: who writes it, the trip,
  // the reply of the ruin, and the case on the cairn the note lies in. It stands on the day of the
  // arrival. The keeper of the wreck stayed at the ship (`newkeeper`), or died, and this person
  // wrote its last entry (`deadkeeper`).
  const NOTE = pool([
    { tags: 'newkeeper !hungry', t: 'This is {keeper}, the {keeperjob} of {probe}. I came {how}, {trip} days from the ship. When I key the hand beacon, every click comes back from {site}, slower. I leave this note in the case on the stones, for {shipkeeper} or for whoever comes.' },
    { tags: 'newkeeper !hungry', t: 'This is {keeper}. I got here on day {days}, {how}, alone. The stones answer the hand beacon, click for click, at half the speed. This case holds the note and the tape. {shipkeeper} has the rest of the log at the ship.' },
    { tags: 'newkeeper !hungry', t: 'This is {keeper}, from {probe}. I came {how} in {trip} days, and I am here. The click is so loud here that the radio is not needed. I keyed the beacon, and the stones sent it back to me, lower and slower. The note goes in the case on the stones.' },
    { tags: 'newkeeper !hungry', t: 'This is {keeper}. I stand at the stones the click comes from. When I send a click, a slower click comes back. I am leaving this case on the stones, and I will not be far.' },
    { tags: 'newkeeper !hungry', t: '{keeper} writes this, the {keeperjob} of {probe}, on day {days}. I came {how}. Every click I send, the stones send back at half the speed. I have piled stones under this case so the next person finds it.' },
    { tags: 'deadkeeper !hungry', t: 'This is {keeper}. I wrote the last entry of the log at the ship, after {shipkeeper} died. I came here {how}, in {trip} days. Every click of the hand beacon comes back from {site}, slower. I leave this note in the case, because {shipkeeper} wanted to see this.' },
    { tags: 'deadkeeper !hungry', t: 'This is {keeper}, the last to write in the log of {probe}. I came {how}. When I key the beacon, the stones answer with the same clicks, lower and slower. This note goes in the case, on the stones.' },
    { tags: 'deadkeeper !hungry', t: 'This is {keeper}. {shipkeeper} kept the log of {probe} and did not live to come here. I did. The stones send our beacon back to me, at half the speed. I leave the note in the case on this pile of stones.' },
    { tags: 'deadkeeper !hungry', t: 'This is {keeper}, alone at {site}. {shipkeeper} heard the click first and never saw where it came from. I have. The stones send the beacon back to me, lower and slower. I leave this note in the case on the stones.' },
    { tags: 'newkeeper !hungry', t: '{keeper} writes this, alone, on day {days}. The trip took {trip} days, {how}. I keyed the hand beacon three times, and three answers came back from {site}, slower. The note and the tape go in the case, under a pile of stones.' },
    { tags: 'newkeeper !hungry', t: 'This is {keeper}. The click led me {km} kilometres, to {site}. When I send the beacon, {site} sends it back at half the speed, a note lower. {shipkeeper}, if you read this, I made it. The note is in the case on the stones.' },
    { w: 3, tags: 'newkeeper hungry', t: 'This is {keeper}. I came {how} in {trip} days, and the food ran out on the way. I ate the seed store a handful at a time. The stones send the hand beacon back to me, slower. This note goes in the case on the stones.' },
    { tags: 'newkeeper hungry', t: '{keeper} writes this, the {keeperjob} of {probe}, on day {days}. I came {how}, in {trip} days. I ate the last of the seed store on the way. Every click I send, {site} sends back at half the speed. This note goes in the case on the stones.' },
    { w: 3, tags: 'deadkeeper hungry', t: 'This is {keeper}. After {shipkeeper} died I came {how}, {trip} days, on the last of the seed store. The stones answer the hand beacon, click for click, at half the speed. The note goes in the case, for whoever comes.' },
  ]);

  // ---------------------------------------------------------------- the shape of the log
  const BEAT_MIN = 4, BEAT_MAX = 6;          // the sight, the carvings, a person, and the reply always run
  const ENTRY_MIN = BEAT_MIN + 2, ENTRY_MAX = BEAT_MAX + 2;
  const NOTE_MIN = 2, NOTE_MAX = 5;          // sentences in the note of one person
  const STAY_MIN = 6, STAY_MAX = 40;         // turns of the planet from the arrival to the end
  // The optional beats, and the order every beat takes in the log. The sight, the carvings, the
  // first person, and the reply always run; up to two of the rest join them.
  const ORDER = ['sight', 'work', 'carving', 'fit', 'sky', 'people', 'light', 'reply', 'people2'];
  const OPTIONAL = ['work', 'fit', 'sky', 'light', 'people2'];
  const BEAT_POOL = { sight: SIGHT, work: WORK, carving: CARVING, fit: FIT, sky: SKY, light: LIGHT, reply: REPLY };

  // ---------------------------------------------------------------- the tags of one second log
  // The story tags of a world whose log of the wreck is `first`. tools/lore-audit sweeps the same
  // tags by hand, so a new tag here goes into STORY_TAGS too.
  function storyTags(world, first, tags) {
    const ruin = world.ruin;
    tags.add('at' + ruin.proto);
    const body = makerBody(world);
    if (body && body.G) {
      tags.add('makerspecies');
      if (first.species && body.G.lore.name === first.species) tags.add('makerknown');
      if (body.legless) tags.add('makerlegless');
    } else tags.add('makerrolled');
    if (body && body.limbs === 0) tags.add('makerlimbless');
    if (makerFits(ruin.proto, ruin.maker)) tags.add('makerfits');
    tags.add('by' + first.by);
    tags.add('went' + first.went);
    const n = first.goers.length;
    tags.add(n === 1 ? 'crewsolo' : n === 2 ? 'crewpair' : 'crewgroup');
    const endKind = first.entries[first.entries.length - 1].slot.slice(4);
    tags.add('after' + endKind);
    if (endKind === 'second') tags.add('deadkeeper');
    else tags.add(first.goers[0] === first.keeper ? 'samekeeper' : 'newkeeper');
    if (first.went !== 'all') tags.add('shipcrew');
    if (first.entries.some((e) => e.slot === 'crew.food' || e.slot === 'crew.cook')) tags.add('hungry');
    return tags;
  }

  // ---------------------------------------------------------------- the public entry point
  // writeRuinLog() writes the second log of one world, or null when nobody went.
  //
  //   world   the world object, with world.source.log written. It reads world.ruin, world.env,
  //           world.species, and the two directions, and it writes nothing back.
  //   rng     a stream of its own, makeRng(seed + '|ruin-lore') in the worker.
  //
  // It draws from `rng` only when somebody went, so a world with `went: 'none'` draws nothing. The
  // draws run in this order: the note (one), or the count of beats, the optional beats, the parts
  // of the arrival, each beat, the end, the length of the stay, and the days (all, some).
  //
  // The log names no compass word for the way back to the ship. On a sphere the way back from the
  // ruin is not the word opposite {from}: a crew that came north-east goes back west on a world
  // where the arc runs near a pole. That is true, and it reads as a fault, so the log says "the way
  // we came".
  //
  // It returns plain data in the shape of world.source.log:
  //
  //   { probe, days, arrived, species, keeper, crew: [{ name, role }], lost: null, went, by,
  //     entries: [{ slot, title, day, text }] }
  function writeRuinLog({ world, rng }) {
    const ruin = world && world.ruin;
    const first = world && world.source && world.source.log;
    if (!ruin || !first || !first.went || first.went === 'none' || !first.goers || !first.goers.length) return null;

    const env = L.makeEnv(world.env || { type: world.type });
    const beasts = (world.species || []).filter((G) => G.lore);
    const G = first.species ? beasts.find((x) => x.lore.name === first.species) || null : null;
    const tags = SourceLore.sourceTags(env, (world.env || {}).obliquityDeg, beasts.length > 0,
      SourceLore.sourceLatDeg(ruin.dir), SourceLore.motionOf(G));
    storyTags(world, first, tags);
    const ctx = { env, tags, world, G };

    // The people: the goers of the log of the wreck, with their jobs, and the first goer keeps
    // this log. The traits come from the same log.
    const jobOf = new Map(first.crew.map((c) => [c.name, c.role]));
    const goers = first.goers.slice();
    const keeper = goers[0];
    const others = goers.slice(1);
    const traits = first.traits || {};
    const crew = goers.map((name) => ({ name, role: jobOf.get(name) }));
    // A person who stayed at the ship, alive: the keeper of the wreck first, when that person did
    // not go. The person a thread of that log took out never stands here.
    const lostName = first.lost && first.lost.name;
    const stayers = first.crew.map((c) => c.name).filter((n) => !goers.includes(n) && n !== lostName
      && !(n === first.keeper && tags.has('deadkeeper')));

    // The trip. The goers leave the morning after the last entry of the wreck.
    const km = tripKm(world);
    const trip = tripDays(km, first.by);
    const arrived = first.days + trip;

    const row = protoRow(ruin.proto) || { height: 30, disc: 30 };
    const body = makerBody(world);
    const base = SourceLore.worldTokens(world, env, first.probe, (world.env || {}).obliquityDeg);
    if (G) Object.assign(base, SourceLore.beastTokens(G, ''));
    Object.assign(base, {
      left: String(first.days + 1), trip: String(trip), km: String(Math.max(10, Math.round(km / 10) * 10)),
      from: ruin.from,
      site: SITE[ruin.proto] || 'the stones', Site: cap(SITE[ruin.proto] || 'the stones'),
      height: String(row.height), across: String(row.disc * 2),
      keeper, keeperjob: jobOf.get(keeper), shipkeeper: first.keeper, stayer: stayers[0] || first.keeper,
      crew: L.num(goers.length),
      makerbody: body ? body.words : 'legs', makerheight: `${body ? body.height : '2'} metres`,
    });
    base.how = L.fill(HOW[first.by] || HOW.foot, base);
    const people = (one, two) => ({ one, two, onejob: jobOf.get(one), twojob: jobOf.get(two) });
    const fill = (e, tk) => (e ? cap(L.fill(e.t, tk)) : '');

    // One person went alone: one note, on the day of the arrival.
    if (first.went === 'one') {
      const note = L.line(rng, NOTE, ctx, new Set());
      const tk = { ...base, days: String(arrived), ...people(keeper, keeper) };
      return {
        probe: first.probe, days: arrived, arrived, species: first.species, keeper, crew, lost: null,
        went: first.went, by: first.by,
        entries: [{ slot: 'note', title: 'Note', day: arrived, text: fill(note, tk) }],
      };
    }

    // The beats. The sight, the carvings, a person, and the reply always run, and up to two of the
    // optional beats join them. A beat whose pool holds nothing for this world does not run.
    const extra = Math.floor(rng() * (BEAT_MAX - BEAT_MIN + 1));
    const trait = (name) => traits[name] || null;
    const withTrait = others.filter((name) => trait(name));
    const open = OPTIONAL.filter((k) => {
      if (k === 'people2') return withTrait.length > 1;
      return L.candidates(BEAT_POOL[k], ctx).length > 0;
    });
    const deck = open.slice();
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const chosen = new Set(['sight', 'carving', 'people', 'reply', ...deck.slice(0, extra)]);
    const beats = ORDER.filter((k) => chosen.has(k));

    // The arrival: a new keeper says so first, then the trip, then the first sight of the ruin.
    const at = { ...base, days: String(arrived), ...people(others[0], others[1] || others[0]) };
    const intro = tags.has('newkeeper') ? L.line(rng, INTRO, ctx, new Set()) : null;
    const tripLine = L.line(rng, TRIP, ctx, new Set());
    const hunger = tags.has('hungry') ? L.line(rng, HUNGER, ctx, new Set()) : null;
    const sight = L.line(rng, FIRST_SIGHT, ctx, new Set());
    const arrival = [intro, tripLine, hunger, sight].map((e) => fill(e, at)).filter(Boolean).join(' ');

    // Each beat takes its wording now and its day after, as the log of the wreck does. The other
    // goers take turns as {one}, so a crew of four is not one person in every entry. A beat about
    // the people takes a goer with a trait, and never the keeper, who writes "I".
    const texts = [];
    const used = new Set();
    const spoken = [];
    beats.forEach((k, b) => {
      const one = others[b % others.length], two = others[(b + 1) % others.length];
      const tk = { ...base, ...people(one, two) };
      if (k === 'people' || k === 'people2') {
        const who = withTrait.find((n) => !spoken.includes(n)) || withTrait[0] || others[0];
        spoken.push(who);
        const list = PEOPLE.filter((e) => e.trait === trait(who));
        const e = L.line(rng, list.length ? list : PEOPLE, ctx, used);
        texts.push({ k, e, tk: { ...tk, who, whojob: jobOf.get(who) } });
        return;
      }
      texts.push({ k, e: L.line(rng, BEAT_POOL[k], ctx, used), tk });
    });
    const end = L.line(rng, END, ctx, new Set());
    const endTk = { ...base, ...people(others[0], others[1] || others[0]) };

    // The days: the arrival, the beats, and the end, over a stay of STAY_MIN to STAY_MAX turns, on
    // the hump of the log of the wreck. The first day is the day of the arrival.
    const stay = STAY_MIN + Math.floor(rng() * (STAY_MAX - STAY_MIN + 1));
    const laid = SourceLore.layDays(rng, texts.length + 2, stay + 1);
    const days = laid.map((d) => arrived - 1 + d);

    const entries = [{ slot: 'arrival', title: 'Arrival', day: days[0], text: arrival }];
    texts.forEach(({ k, e, tk }, j) => {
      const day = days[j + 1];
      entries.push({ slot: 'ruin.' + (k === 'people2' ? 'people' : k), title: '', day, text: fill(e, { ...tk, days: String(day) }) });
    });
    const last = days[days.length - 1];
    entries.push({
      slot: 'end.' + (end ? end.kind : 'stay'), title: 'Last entry', day: last,
      text: fill(end, { ...endTk, days: String(last) }),
    });

    return {
      probe: first.probe, days: last, arrived, species: first.species, keeper, crew, lost: null,
      went: first.went, by: first.by, entries,
    };
  }

  export const RuinLore = {
    writeRuinLog, storyTags, tripKm, tripDays,
    TOKENS, BEAST_TOKENS, STORY_TAGS, TRAVEL, HOW, SITE, END_KINDS, ORDER,
    POOLS: { INTRO, TRIP, HUNGER, FIRST_SIGHT, SIGHT, WORK, CARVING, FIT, LIGHT, SKY, PEOPLE, REPLY, END, NOTE },
    LIMITS: { BEAT_MIN, BEAT_MAX, ENTRY_MIN, ENTRY_MAX, NOTE_MIN, NOTE_MAX, STAY_MIN, STAY_MAX },
  };
