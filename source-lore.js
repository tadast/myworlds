// myworlds — the log of the source. It turns the facts of a world into the log a small crewed
// survey ship left behind in its wreck.
//
// The worker loads it with importScripts(), after lore.js and species.js. It exposes
// self.SourceLore. It holds no three.js, and it reads no geometry.
//
// lore.js holds the engine and no words. species.js brings the fauna vocabulary. flora-lore.js
// brings the plant vocabulary. This file brings the vocabulary of the wreck, and none of the four
// reads the words of another.
//
// ---------------------------------------------------------------- what a log is
//
// A log is a short story of 8 to 20 entries, written by one person of a crew of 3 to 5.
//
//   entry 1        the landing. One real fact of this world, and the plan to get home.
//   entries 2..n-1 the beats of the threads, interleaved, rising in force.
//   entry n        the ending. It closes the story, and it follows what the threads did.
//
// A THREAD is an ordered list of 3 to 5 beats that intensify. A BEAT is a list of 3 wordings or
// more, and a log takes one of them, so two logs that run the same thread rarely read the same.
// There are four kinds of thread.
//
//   strand  why the crew cannot leave. Every log takes exactly one, whole. The landing states the
//           plan: an orbiter with no crew waits overhead until day {due}, and the lander climbs
//           back to it. The strand thread breaks one link of that plan and says which one. A log
//           that never says why the ship is here reads as a list of troubles, and not as a story.
//   world   a real fact of the world. Every world thread carries a SALIENCE, which reads the
//           numbers of the planet and says how loud that fact is. A world of -72 °C almost always
//           talks about the cold, because nothing else there is as loud.
//   crew    the people. A crew thread fits any world, and it carries a CODA, one sentence the
//           ending may pick up, so the last entry is about these people and not only the world.
//   fauna   the one species the log names. Gated on `beasts` AND on how the animal moves.
//
// ---------------------------------------------------------------- how the animal moves
//
// This is the rule the first build got wrong. The log used to have a 40 metre sky whale stand at
// the foot of the mast. `motionOf()` reads `G.cls`, `G.loco`, and `G.plan` and returns one tag,
// and every fauna thread and every reckless ending is gated on it:
//
//   mwalk    legs on the ground: monopod, biped, tripod, quad, hexapod
//   mcrawl   a serpent. No legs. It throws a wave down the body and the ground does the rest
//   mroll    a roller. It folds into its own hull and throws itself. It never walks
//   mflow    a flow. It holds no shape. It pours down a slope and gathers at the foot
//   msling   a slinger. It throws a cord at the standing growth and swings off the hold
//   mfly     wings. It flies, and it lands when it chooses
//   mswarm   wings in a swarm. A wheel of shards, and no single body to name
//   mdrift   a sac. A bladder of warm gas that never lands. It goes where the wind blows
//   mcruise  fins. A whale of the air. It cruises, it dips, and it never touches the ground
//   mdig     a plough. It travels a hand deep in the ground and pushes a mound ahead of it
//   manchor  an arch or a periscope. The body stays under the ground and never travels
//
// **There is no swimmer.** `LOCO` in species.js has no aquatic class: the `fins` locomotion is
// `cls: 'air'` and the `sea` niche reads "Open ocean air". A "sea whale" of this generator swims
// through air over the water, so it takes `mcruise` and never a boat.
//
// tools/lore-audit/audit.mjs holds MOTION_LEXICON, which fails a fauna line that says walk, stood,
// the road, or the flank of an animal that does none of those.
//
// ---------------------------------------------------------------- four rules that hold it honest
//
// 1. Every thread names the tags it needs and the tags it forbids, as the fauna and the flora do.
//    A thread about a tide never reaches a world with no moon and no sea.
// 2. Every world reaches at least three world threads, because the temperature, the day, the land,
//    and the plants each carry a thread of their own and every world has all four.
// 3. A beat that names the animal sits in a thread gated on `beasts`, and the writer fills the
//    animal tokens only when the world really carries a species.
// 4. A person who dies or walks out never acts again. The thread that retires a person owns that
//    person, and no other thread and no ending may name them.
//
// ---------------------------------------------------------------- the voice
//
// This is a ship log, and the only tool of its writer is subtraction. Short declarative
// sentences, most under 12 words and none over 20. Plain words a five year old can read aloud.
// Numbers are good. NO metaphor and NO simile: no "like a", no "as if", no "seemed", and nothing
// the planet or the machine does on purpose. NO adverb of manner: if the verb needs help, take a
// better verb. Say what happened and let the facts carry the feeling.
//
// **Every noun names a thing the reader can see.** "The quiet", "the wet", "the wind decides",
// and "the panels take nothing" each left a reader asking "the quiet what?". An entry is read
// cold, a month of log after the last entry of its thread, so it says the water pump and not the
// pump, the main power bus and not the bus, a geyser and not "one". What is left unsaid is the
// feeling, and never the fact.
//
// **A beat makes no claim about the days since the beat before it.** The writer lays the days
// after it takes the wordings, so "due back four days ago" can stand forty days after the entry
// it answers. A beat that needs a span states the whole span inside itself.
//
// **No pronoun stands for a member of the crew.** The log says the name, or the job: "{one}", "the
// {onejob}", "our {twojob}". A pronoun would need a gender, and the names come from many
// languages, so the log would have to invent one. Naming the job also keeps three sentences in a
// row from reading "Gil. Gil. Gil." See docs/source.md.
//
// The first beat of a thread may never look back. It is the first day the reader meets that
// thread, so "in all this time" and "we have never" are false there, and the audit fails them.
//
// The stream is makeRng(seed + '|source-lore') and nothing else draws from it, so the log of a
// world is the same on every visit and no other part of the world moves when the text changes.
'use strict';

(function () {
  const L = self.Lore;
  const pool = L.pool;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

  // ---------------------------------------------------------------- the tokens
  // Every token a line may use. tools/lore-audit reads this list, so a line that names a token the
  // writer does not fill is a fault the sweep reports.
  const TOKENS = [
    // the world
    'world', 'probe', 'lat', 'day', 'night', 'temp', 'grav', 'tilt', 'days', 'since',
    'moon', 'moons', 'plant', 'plants',
    // the frame of the mission: the day the orbiter leaves, the years a second ship needs, and
    // the kilometres to the supply drop. See "why the crew cannot leave".
    'due', 'years', 'far',
    // the people
    'one', 'two', 'onejob', 'twojob', 'keeper', 'keeperjob', 'crew',
    // the person an aside is about. See TRAITS.
    'who', 'whojob',
    // the counts a log rolls for itself
    'few', 'many', 'count',
    // the animal
    'other', 'Other', 'others', 'Others', 'kind', 'Kind', 'kinds', 'Kinds',
    'size', 'n', 'diet', 'pet',
  ];
  // The tokens that name the animal. A line that uses one of them must sit under a gate on
  // `beasts`, and one of them has to open any reference to the animal inside an entry. See
  // "Every entry stands on its own subject" below.
  const BEAST_TOKENS = ['other', 'Other', 'others', 'Others', 'kind', 'Kind', 'kinds', 'Kinds',
    'size', 'n', 'diet', 'pet'];
  // The tokens that NAME the animal, as against the ones that only measure or count it. A wording
  // may not use a pronoun for the animal before one of these has stood in the same entry.
  const NAMING_TOKENS = ['other', 'Other', 'others', 'Others', 'kind', 'Kind', 'kinds', 'Kinds', 'pet'];

  // ---------------------------------------------------------------- the tags of the source
  // Lore.makeEnv() gives the tags of the planet. Five facts the log needs are not in that set.
  //
  // The lean of the axis. A world turned past 135 degrees stands nearly upright again and turns
  // the other way, as Venus does, so the lean the climate feels is the smaller of the angle and
  // its supplement. makeStats() reads the same two limits, 54 degrees and 135 degrees.
  //
  // The polar night AT THE SOURCE. The lean alone does not give one: the sun fails to rise only
  // poleward of the polar circle, which stands at latitude 90 - lean. A wreck on the equator of a
  // world leaning 50 degrees still sees the sun every day of the year. So `polarnight` reads the
  // latitude of the source as well as the lean:
  //
  //     |lat| > 90 - lean + POLAR_MARGIN
  //
  // POLAR_MARGIN is 5 degrees, so the night is not one day at the edge of the circle but weeks of
  // it. makeSource() keeps the source inside SOURCE_LAT, 80 degrees, so the tag needs a lean over
  // 15 degrees before any source can carry it.
  //
  // The life. `beasts` says the world carries at least one species with lore, and the motion tag
  // says how the animal the log names gets about.
  //
  // The harshness. `harsh` marks a world that kills a crew on its own, and it raises the weight of
  // the endings that face a known doom.
  //
  // The lead. `lead<kind>` says what the threads of THIS log did, so the ending can follow from
  // them. See leadTags() and the ending pool.
  const TILT_UPRIGHT = 8, TILT_TILTED = 20, TILT_SIDE = 54, TILT_BACK = 135;
  const POLAR_MARGIN = 5;
  // The latitude of the source in degrees, from its unit direction. The y of a direction is the
  // sine of the latitude, as site.js states.
  function sourceLatDeg(dir) {
    if (!dir) return 0;
    return Math.asin(Math.max(-1, Math.min(1, dir[1]))) * 180 / Math.PI;
  }
  function sourceTags(env, obliquityDeg, hasBeasts, latDeg, motion) {
    const tags = new Set(env.tags);
    if (obliquityDeg != null) {
      const o = Math.abs(obliquityDeg);
      const lean = o > 90 ? 180 - o : o;
      if (lean < TILT_UPRIGHT) tags.add('upright');
      if (lean >= TILT_TILTED) tags.add('tilted');
      if (lean >= TILT_SIDE) tags.add('sidetilt');
      if (o > TILT_BACK) tags.add('retrograde');
      if (latDeg != null && Math.abs(latDeg) > 90 - lean + POLAR_MARGIN) tags.add('polarnight');
    }
    if (hasBeasts) tags.add('beasts');
    if (motion) tags.add(motion);
    // A world that kills the crew whatever they do.
    if (tags.has('frozen') || tags.has('molten') || tags.has('searing') || tags.has('crushgrav')
      || tags.has('lava') || tags.has('ice') || tags.has('polarnight')) tags.add('harsh');
    return tags;
  }

  // ---------------------------------------------------------------- how the animal moves
  // One tag per way of getting about. `motionOf()` reads the genome the same way fauna.js builds
  // the body, so the log and the animal on the ground cannot disagree.
  const MOTION = ['mwalk', 'mcrawl', 'mroll', 'mflow', 'msling', 'mfly', 'mswarm', 'mdrift',
    'mcruise', 'mdig', 'manchor'];
  // An ending that names a motion tag is the last beat of the fauna thread in all but name.
  const readsAnimal = (e) => {
    const g2 = L.parseGate(e.tags);
    for (const any of g2.need) for (const t of any) if (MOTION.includes(t)) return true;
    return false;
  };
  // Every lead a thread may set. The audit adds them to its sweep, or an ending gated on one of
  // them looks unreachable.
  const LEADS = ['doom', 'split', 'walk', 'message', 'second', 'stay', 'ride', 'catch', 'follow', 'launch'];
  function motionOf(G) {
    if (!G) return null;
    if (G.cls === 'air') {
      if (G.loco === 'sac') return 'mdrift';
      if (G.loco === 'fins') return 'mcruise';
      return G.plan === 'swarm' ? 'mswarm' : 'mfly';
    }
    if (G.cls === 'sub') return G.loco === 'plough' ? 'mdig' : 'manchor';
    if (G.loco === 'serpent') return 'mcrawl';
    if (G.loco === 'roller') return 'mroll';
    if (G.loco === 'flow') return 'mflow';
    if (G.loco === 'slinger') return 'msling';
    return 'mwalk';
  }
  // The size in metres, from species.js, so the log states the number the fauna card states. No
  // species of this generator is under about 1.7 metres, so "small" here means small enough for
  // two people to take hold of, and not small enough to fit in a hand.
  const metres = (G) => (self.Species ? self.Species.bodyMetres(G).metres : 1);
  const BIG_M = 3;
  const g = (fn) => (c) => !!c.G && fn(c.G);
  const bigBody = (G) => metres(G) >= BIG_M;
  const handBody = (G) => metres(G) < BIG_M;
  const herd = (G) => G.social.kind === 'herd';
  const fewOf = (G) => G.social.kind !== 'herd';

  // ---------------------------------------------------------------- entry 1: the landing
  // The first entry is two parts. The first part comes from ARRIVAL: the place, one real fact of
  // this world, and the people. The second part comes from the strand thread of this log, and it
  // states how the crew is to get home. See "why the crew cannot leave" below.
  //
  // An ARRIVAL line says NOTHING about the state of the lander. A strand thread may break the
  // lander on the landing, so a line here that calls the ship sound would contradict it.
  const ARRIVAL = pool([
    'We are down at {lat}. The ground is flat and open on every side. We ate, and then we slept.',
    'We are at {lat}. {world} grew from a disc into a floor in nine minutes. All of us were awake for the whole fall.',
    'Down at {lat}. The dust took an hour to settle. {one} opened the hatch first and stood in it a long time.',
    'We are at {lat}. {two} was sick in the last minute of the fall. {one} was out of the hatch inside ten minutes.',
    'We chose this ground from orbit. It is flat and firm, with open sky, at {lat}.',
    'Landing at {lat}, four hundred metres off the mark. {one} calls that good. Our {twojob} calls it luck.',
    'We came down at {lat} and sat in the seats for a minute without a word. Then {one} laughed, and we got up and went out.',
    'We are down at {lat}. The count is {crew}, and everybody signed the board by the hatch.',
    'We touched down at {lat} at first light. {one} and {two} were outside inside ten minutes.',
    'We are at {lat}. The last hundred metres were flown by hand. {two} kept both eyes shut and said so after.',
    'We landed at {lat}. {one} stepped off the ladder first and said nothing fit to log. {two} stepped off second and asked what was for supper.',
    'We are at {lat}. The first job was the mast, and we had it up before dark. The second job was supper.',
    { t: 'The last stage burned for twice the time the plan allowed. At {grav} it had to. We are at {lat}.', tags: 'highgrav|crushgrav' },
    { t: 'We came down at {lat} under {grav}. {one} stood up from the seat and sat down again.', tags: 'crushgrav' },
    { t: 'At {grav} the fall was slow enough to choose by. We picked the flat at {lat} on the way down.', tags: 'lowgrav|feathergrav' },
    { t: 'We are at {lat}. At {grav} the dust we raised on landing is up at head height tonight.', tags: 'lowgrav|feathergrav' },
    { t: 'We came down at {lat} on frozen ground. {temp}. The dust we raised was ice.', tags: 'frozen|subzero' },
    { t: 'We are at {lat}. It is {temp} outside and the hatch seal went stiff before we had it open.', tags: 'frozen|subzero' },
    { t: 'We came down at {lat} through air at {temp}. The radiators were at the limit before we touched.', tags: 'hot|molten' },
    { t: 'We are at {lat}. Outside is {temp}. Our {onejob} read that off the gauge twice before saying it out loud.', tags: 'hot|molten' },
    { t: 'We are at {lat}. The sea is on the map somewhere east of us. Nobody has seen it from the ground yet.', tags: 'hasocean !mostlyland !lava' },
    { t: 'We are at {lat}. The map calls the red ground to the east a sea. It is molten rock, and it moves.', tags: 'hasocean lava' },
    { t: 'We came down at {lat}, and the air here carries salt. {one} tasted it off a glove and told everybody.', tags: 'hasocean waterliquid !mostlyland' },
    { t: 'We are at {lat}. There is no sea on {world}. The horizon is the same colour as the ground all the way round.', tags: 'dryworld' },
    { t: 'We are at {lat}. {world} is dry from pole to pole. All the water we have is in the tank behind me.', tags: 'dryworld' },
    { t: 'The island at {lat} is smaller than the map made it. We walked the whole of it today. It took half a turn of the planet.', tags: 'mostlysea' },
    { t: 'We are at {lat}, on the only land inside two hundred kilometres. Water on three sides. {one} has been in it to the knees.', tags: 'mostlysea waterliquid' },
    { t: 'The ring overhead was the last thing the descent camera kept. We are under it, at {lat}. Nobody has stopped looking up.', tags: 'ringed' },
    { t: 'We are at {lat}. There is a ring overhead and it cuts the sky in two. Our {twojob} sat under it until the light went.', tags: 'ringed' },
    { t: '{moon} was up when we landed at {lat}. The light off it was enough to raise the mast by.', tags: 'moonlit' },
    { t: 'We came down at {lat} with {moon} low in the east. {one} put a camera on it before touching anything else.', tags: 'moonlit' },
    { t: 'We came down at {lat} between two cells of the storm. Lightning took an antenna on the way through.', tags: 'stormy' },
    { t: 'We are at {lat}. There was lightning on three sides as we came in. {one} flew the last of it on instruments.', tags: 'stormy' },
    { t: 'We are at {lat}, upwind of the vents. The ash reached us by the second hour. It has reached us every hour since.', tags: 'volcanic' },
    { t: 'We came down at {lat}. There is a glow to the south and the ground is warm through the boots.', tags: 'volcanic' },
    { t: 'We came down at {lat}, a safe distance from the geysers by the old numbers. A probe took those numbers forty years ago.', tags: 'geysers' },
    { t: 'We are at {lat}. Three geysers went up while we were unloading. {two} counted the minutes between them.', tags: 'geysers' },
    { t: 'We landed at {lat} in the morning of a day {day} long. The shadow of the mast had not moved by supper.', tags: 'longday|slowspin' },
    { t: 'We are at {lat}. One turn of {world} is {day}, so this morning will last longer than some of our training did.', tags: 'longday|slowspin' },
    { t: 'We came down at {lat} into a stand of {plants} and flattened a circle of them. {one} counted the broken ones.', tags: 'flora' },
    { t: 'We are at {lat}. There are {plants} to the edge of sight. Our {twojob} was out among them before the dust had settled.', tags: 'flora' },
    { t: 'The sky at {lat} was green from end to end when we landed. The radio gave noise. We reported the landing to the orbiter eleven hours late.', tags: 'auroral' },
    { t: 'We came down at {lat} on a world that turns the other way. The sun rose in the west. The flight plan said it would, and we stared at it.', tags: 'retrograde' },
    { t: 'The axis of {world} stands very near straight. The sun will run the same arc over {lat} every day we are here. That made the power plan simple.', tags: 'upright' },
    { t: 'The axis of {world} lies over at {tilt}. At {lat} the sun runs a flat circle without climbing. We landed in that light and we work in it.', tags: 'polarnight' },
    { t: 'The axis of {world} lies over at {tilt}. We came down at {lat} in the warm season. The season will change fast, and the survey plan is written round that.', tags: 'sidetilt' },
    { t: 'It was raining at {lat} when we came down. {one} stood out in it for ten minutes and would not come in.', tags: 'rainy' },
    { t: 'We are at {lat}. It rained on us while we raised the mast, and it has rained twice since.', tags: 'rainy' },
  ]);

  // ---------------------------------------------------------------- why the crew cannot leave
  //
  // Every log states, in plain words, why this crew did not go home. One frame holds for every
  // mission:
  //
  //   An ORBITER with no crew brings the lander to the world and waits overhead until day {due}.
  //   The LANDER can climb back to orbit once, and no further. The orbiter is the only ship that
  //   can make the trip home. A second ship from home needs {years} years to arrive.
  //
  // A STRAND thread breaks one link of that frame, and says which. A log takes exactly one, and
  // the thread is never shortened, because the last beat is the one that states the fact.
  //
  //   bell      the landing split the engine bell. The weld fails. The orbiter leaves on day {due}
  //   tank      the landing split the climb tank. The fuel is in the ground. The orbiter leaves
  //   fall      the ground gave way in the mission and the lander lies on its side
  //   orbiter   the orbiter broke up in orbit. The lander is sound and has nothing to climb to
  //   recall    a fault sent the orbiter home early, under its own rules, before the crew was ready
  //   patched   the feed line cracked and the patch is weak. The crew climbs on it. `end` forces
  //             the launch ending, and the wreck the reader stands at is how the climb went
  //
  // `landing` is the second part of entry 1. A thread that breaks the lander on the landing brings
  // its own; the rest take SOUND_LANDING. `due` says how the writer sets {due}: 'last' is the day
  // of the last beat, 'next' is the day after the ending, and 'never' is a day the log does not
  // reach.
  //
  // "The carrier" is the radio signal of the wreck, in the words of issue 34. The ship overhead is
  // therefore always "the orbiter".
  const SOUND_LANDING = [
    'The lander is sound and the climb tank is full. The orbiter waits overhead until day {due}. We finish the survey, climb back to it, and go home.',
    'The plan is simple. The orbiter holds overhead with no crew aboard. We work here until day {due}, and then the lander carries us back up to it.',
    'The orbiter that brought us stays in orbit until day {due}. It has no crew. The lander is our only way back up to it, and {one} checked it over twice today.',
    'Our ride home is the orbiter, and it leaves on day {due}. The lander can reach orbit and no further. {one} has the climb date in red on the wall.',
    'The orbiter crosses overhead every two hours and takes our data. It leaves for home on day {due}. We have to be aboard by then, and the lander is ready for the climb.',
    'Every system worked. The lander has the fuel for one climb to orbit, where the orbiter waits until day {due}. The orbiter is the only ship that can take us home.',
    'We are here for the survey, and the way home is fixed. The orbiter stays overhead until day {due}, with nobody aboard. The lander makes one climb to it, and we mean to be on that climb.',
    '{one} radioed the orbiter from the ground tonight and it answered in a second. It will keep station over us until day {due}. After that it goes home, and the lander must have us aboard it by then.',
    'The lander came down whole, with the climb fuel sealed in its tank. The orbiter is a bright point overhead at dusk. It waits for us until day {due}, and it cannot wait past that.',
    'The mission clock started today. On day {due} the orbiter starts for home, and no crew flies it, so no crew can hold it back. The lander climbs to it before then. {one} set two alarms.',
    'Two ships brought us here and one of them is on the ground. The other one, the orbiter, holds above us until day {due}. The lander can climb to it once. It cannot fly home alone.',
    'All the checks after landing came back good. The way home is one climb in the lander to the orbiter overhead. The orbiter starts for home on day {due}, and it runs on a schedule, not on orders.',
  ];
  const STRAND_THREADS = pool([
    {
      key: 'bell', due: 'last',
      landing: [
        'The landing broke the lander. It came down hard on the aft side and the engine bell struck rock. The bell is split, and the lander cannot lift with a split bell. The orbiter waits overhead until day {due}, and then it leaves for home.',
        'We hit hard. The engine bell struck a rock and split along one side. Nobody is hurt. The orbiter leaves for home on day {due}. We have to mend the bell and climb to it before then.',
        'The engine cut out forty metres up and we fell the rest. The engine bell is cracked from the rim to the throat. The lander cannot climb until it is mended. The orbiter holds overhead until day {due} and no longer.',
        'A gust caught us at twenty metres and the lander came down on its aft side. The engine bell hit the ground first and cracked. We cannot climb on a cracked bell. The orbiter holds station until day {due}, and then it starts for home.',
        'The landing was bad. {one} heard the engine bell strike rock and knew the sound. There is a split in it a hand wide at the rim. The orbiter goes home on day {due}, and the lander has to reach it before that.',
      ],
      beats: [
        ['{one} measured the crack in the engine bell today. It is sixty centimetres long. {one} says the flame would come out of the side and turn the lander over.',
          'Our {onejob} spent the day under the engine. The bell is split for the length of an arm. A lander with a split bell cannot fly straight, and we carry no spare.',
          '{one} and {two} looked at the engine bell for an hour. It needs a weld the whole length of the crack. We have the welder, and rod for half of it.',
          'We jacked up the aft side of the lander and looked at the engine bell in daylight. The split runs from the rim half way to the throat. {one} drew it, measured it, and said nothing for a while.',
          'Our {onejob} explained the engine bell to the rest of us with a cup. A whole cup pushes straight. A split cup pushes to the side. The lander would tip over in the first second of the climb.'],
        ['{one} welded the crack in the engine bell with all the rod we had. We test it when the weld has cooled and been ground. The orbiter leaves on day {due}. It is a machine and it keeps the schedule.',
          'The weld on the engine bell is done. {one} cut a plate from the cargo door to back it. We test it when the clamps come off. Day {due} is the last day the orbiter waits.',
          '{one} has closed half the crack in the engine bell with weld and the rest with a bolted strap. {two} does not trust the strap. The orbiter goes home on day {due}.',
          '{two} found more welding rod in the rover kit, enough for the whole crack in the engine bell. {one} has been under the engine for three days. The orbiter starts for home on day {due}.',
          'The crack in the engine bell is closed. {one} ground the weld smooth and tested it with dye. No dye came through. We fire the engine next. Day {due}, when the orbiter leaves, is on the wall in red.'],
        ['We test fired the engine today. The weld on the bell opened in four seconds. {one} shut the engine down and did not speak for the rest of the day.',
          'The engine test failed. The patch on the bell blew off at half thrust and took a piece of the bell with it. There is less bell now than before.',
          'We fired the engine for the test and the crack ran on past the weld. {one} says it cannot be welded a second time. The metal round it is burned thin.',
          'The weld on the engine bell held for eleven seconds of the test. Then the bell tore along a new line beside it. {one} says the landing made the whole bell brittle.',
          'We ran the engine test at dawn. The mended bell glowed white along the weld, and then the weld let go. {one} and {two} walked out to it after it cooled and came back without a word.'],
        ['Today is day {due}. The orbiter passed over at noon and lit its engine for home. We watched it from the step. A second ship would need {years} years to get here.',
          'The orbiter left today, day {due}, on schedule. It sent one line: departure confirmed. The lander cannot fly, and no ship can reach us in less than {years} years.',
          'Day {due}. The orbiter burned for home this morning and we heard it go on the radio. The engine bell is scrap and we cannot leave. A ship from home takes {years} years.',
          'This is day {due}. The orbiter called for our climb time at dawn and we had none to give it. It started for home at noon. The lander has no engine bell, and a new ship is {years} years away.',
          'The orbiter is gone. Today was day {due}, and it left at the minute on the schedule. {one} watched it with the long lens until it was too faint. No other ship can reach us for {years} years.'],
      ],
    },
    {
      key: 'tank', due: 'last',
      landing: [
        'We landed hard, and the climb tank split along a seam. The fuel for the trip back to orbit ran out on to the ground in ten minutes. The orbiter waits overhead until day {due}. We have no fuel to reach it.',
        'A leg folded when we touched, and the lander dropped on the climb tank. The tank is open along the bottom. All the fuel for the climb is in the ground under us. The orbiter leaves for home on day {due}.',
        'The landing tore the feed pipe out of the climb tank. We lost the fuel before {one} could reach the valve. Without it the lander cannot get back to the orbiter, and the orbiter leaves on day {due}.',
        'We came down too fast and a rock went through the wall of the climb tank. The fuel for the climb back to orbit drained out under us. The orbiter holds overhead until day {due}, and we cannot get to it.',
        'The landing cracked the climb tank. {one} smelled the fuel before the alarm went. It was all gone in a quarter of an hour. The lander needs that fuel to reach the orbiter, and the orbiter leaves on day {due}.',
      ],
      beats: [
        ['{one} has patched the climb tank. It holds pressure. It is empty, and the climb to the orbiter needs four thousand litres.',
          'Our {onejob} dug under the lander to see if any fuel had pooled. The ground drank all of it. The climb tank is dry and we carried no reserve.',
          'We read the manual for the fuel maker today. It is an emergency unit the size of a suitcase. It makes climb fuel out of the air, two litres a day. The climb needs four thousand.',
          '{one} checked every tank on the lander for fuel we could move to the climb tank. The landing tanks are dry, as designed. The climb needs four thousand litres and we have none.',
          'We told the orbiter about the climb tank. It has no fuel it can send down, and no way to send it. It logged the report and repeated its departure day.'],
        ['{one} has the fuel maker running. It gives two litres a day. The climb needs four thousand, and the orbiter leaves on day {due}. {two} did the division out loud at supper.',
          'The fuel maker ran all week and made eleven litres. The climb to the orbiter takes four thousand. {one} wrote both numbers on the wall, and under them day {due}, when the orbiter leaves.',
          'We have sixteen litres of climb fuel. {one} built a second fuel maker out of the spares, and the rate doubled. That is nine hundred days of work. We have until day {due}, when the orbiter goes.',
          'The fuel maker runs day and night on a third of our power. It has made nine litres. The climb needs four thousand, and the orbiter starts for home on day {due}.',
          '{one} reads the gauge on the fuel maker every morning and writes the total on the wall. Today it says twenty-two litres. Under it, in red, are the four thousand we need and day {due}.'],
        ['{one} asked the orbiter if it could wait for us. The orbiter is a machine. It answered with the schedule: departure on day {due}.',
          'Our {onejob} worked out a lighter climb: no cargo, no seats, two people. It needs nine hundred litres of fuel. We have thirty.',
          '{one} drained the fuel from the rover and the generator and tested it in the climb engine. It will not burn in there. The climb tank stays empty.',
          '{two} asked if the lander could climb part of the way, and the orbiter come down to meet it. {one} showed why not. The orbiter cannot fly that low, and the lander cannot stop half way up.',
          'We fed the fuel maker more power, to speed it up. It made more climb fuel for a day, and then a coil burned out. {one} mended the coil. It is back at two litres a day.'],
        ['Today is day {due}. The orbiter left for home at dawn. We have forty litres of fuel and a lander that needs four thousand. The next ship is {years} years away.',
          'The orbiter left on schedule today, day {due}. {one} turned the fuel maker off at noon. There is nothing to climb to now, and no ship can come in under {years} years.',
          'Day {due}, and the schedule held. We stood outside and watched the orbiter burn for home. It was a bright point for a minute and then it was gone. Nobody can come for {years} years.',
          'It is day {due}. The orbiter started for home today with nobody aboard. We had made fifty litres of the four thousand. {one} left the fuel maker running. Nobody can reach us for {years} years.',
          'The orbiter left today, day {due}, as its schedule said. The climb tank holds sixty litres of the four thousand. The next ship needs {years} years.'],
      ],
    },
    {
      key: 'fall', due: 'last',
      beats: [
        ['The ground under the aft leg gave way in the night. The lander went over on its side with all of us in it. Nobody is hurt. The hull is bent at the waist and the engine points at the ridge.',
          'The lander fell over today. The ground under two legs was a crust over a hollow, and it broke. {one} was outside and saw it go. The lander lies on its side and the climb tank is crushed.',
          'A leg of the lander sank a metre in one hour this morning. The lander tipped past the point of balance. It is on its side now. We got out through the top hatch, which is now a door.',
          'The lander is on its side. The ground under the legs broke at noon, from a tremor or from our own weight. {one} was in the galley and broke a wrist. The engine is bent against a rock.',
          'The lander fell today. We had drilled for samples twenty metres from the aft leg, and the ground there was hollow. The leg went through. The lander rolled on to its side and the engine took the weight.'],
        ['The lander weighs forty tonnes. We have one winch, rated for four. {one} rigged it to a rock and the cable parted on the first pull. The orbiter holds its place overhead until day {due}.',
          '{one} and {two} dug under the high side of the lander for six days to let it roll upright. It slid a metre and stopped. It has to stand before day {due}, when the orbiter leaves.',
          'Our {onejob} built a lever out of the mast sections to raise the lander. The mast bent. The lander did not move. We have until day {due} to stand it up and climb.',
          'We asked the orbiter for advice on a lander that lies on its side. It sent the manual page for a level landing. The orbiter starts for home on day {due}, and the lander must stand by then.',
          '{one} has jacks under the low side of the lander and lifts it a finger a day. At that rate it stands in four hundred days. On day {due} the orbiter starts for home.'],
        ['{one} went over the hull of the lander today. The frame is broken in three places. Upright or not, it would fold at ignition. {one} said so at supper and nobody argued.',
          'We have stopped work on the lander. The engine mount sheared in the fall, and {one} found the break today. A lander with no engine mount cannot climb, standing or lying.',
          '{two} found the climb tank empty this morning. It cracked in the fall and leaked for days under the hull where nobody could see. We live in the lander on its side. It will not fly.',
          '{one} got into the engine bay of the lander today, through the hull plate that split in the fall. The turbine shaft is bent. No tool we have can straighten it. The lander cannot climb.',
          'The jacks slipped today and the lander fell back the little way we had raised it. The hull split along a seam. {one} looked at the seam and said the lander is done.'],
        ['Today is day {due}. The orbiter left for home at the hour on the schedule. We watched from beside the lander, which lies where it fell. No ship can reach us in under {years} years.',
          'Day {due} has come. The orbiter asked for our climb time three times this morning, and then it left without us. It is a machine. The next ship would take {years} years.',
          'The orbiter burned for home today, day {due}. {one} listened to its signal until it faded. We have a lander on its side and nothing else that flies. Home is {years} years away.',
          'The orbiter has gone. Today was day {due}. It passed over the fallen lander at noon, lit its engine, and started for home. A new ship from home needs {years} years.',
          'The date on the wall was day {due}, and it is today. {one} sat on the side of the fallen lander and watched the orbiter leave. Then {one} climbed down and went back to work. No ship can reach us for {years} years.'],
      ],
    },
    {
      key: 'orbiter', due: 'never',
      beats: [
        ['The orbiter passed over at noon and took the data of the week. It answers every call inside a second. {one} says it is the best member of the crew.',
          '{one} talks to the orbiter on every pass. It has no crew and no voice. It sends one line of text: all systems good, departure day {due}.',
          'The orbiter crosses our sky every two hours. At dusk it is the brightest point up there. {two} waves at it, and knows it is a machine.',
          'The orbiter woke us this morning with the daily time signal. {one} sets the ship clock by it. It is the only other machine of ours in this system.',
          '{two} worked out when the orbiter crosses the sun. We watched it through the dark glass at noon, a black dot for two seconds. Its status line reads: departure day {due}.'],
        ['The orbiter did not answer on the noon pass. {one} called on every pass after it. There was no answer on any of them.',
          'We lost the signal from the orbiter in the middle of a data pass. It stopped in the middle of a line. {one} has called it every two hours since, and heard nothing.',
          'The orbiter missed a pass today. It has been on time to the second since we landed. {one} checked our radio against the hand set, and our radio is fine.',
          'The time signal from the orbiter did not come this morning. {one} waited for the next pass, and the next. The radio was silent on all of them.',
          'The orbiter sent half a status line at dusk: all systems. The rest did not come. {one} has called it on every pass after that one, and had no answer.'],
        ['{one} put the long lens on the sky at dusk, at the place where the orbiter crosses. There were five points of light on the track in place of one. They were tumbling.',
          'We found the orbiter with the long lens. It is in pieces, spread along its own track. {two} counted nine. Something hit it, or a tank burst. We will never know which.',
          '{one} watched for the orbiter at dusk for four nights. On the fourth there was a streak of fire across the east. {two} timed it against the orbit. It was the orbiter coming down.',
          '{one} found the place of the orbiter with the long lens. There is a cloud of bright pieces there now, and it grows longer with each pass. The orbiter has broken up.',
          'Pieces of the orbiter came down tonight. We counted eleven streaks of fire in the west inside one minute. {two} checked the track. It was the right place and the right hour.'],
        ['We said it out loud tonight. The lander can climb to orbit and no further, and there is nothing in orbit now. A ship from home needs {years} years to come.',
          'Our {onejob} went through it on the wall for all of us. The orbiter was the only ship that could take us home. It is gone. A new one needs {years} years to reach us.',
          'The lander is fuelled and sound, and it has nowhere to go. It reaches orbit and stops there. The orbiter was the ship for the long trip, and the orbiter burned up. Nobody comes for {years} years.',
          '{one} asked tonight what the lander is for now. It can climb to orbit once and stay there until the air ends. The ship for the trip home has burned up. A new one needs {years} years.',
          'We held a meeting. The orbiter is destroyed. The lander cannot fly between stars. Home expects no word from us until the orbiter is due back, and then a ship needs {years} years.'],
      ],
    },
    {
      key: 'recall', due: 'never',
      beats: [
        ['The orbiter sends a status line on every pass. Today it read: all good, departure day {due}. {one} reads every one of them aloud.',
          'The orbiter runs itself. It has rules in place of a crew, and {one} has read them all. Rule one is that it must get home, with us or without us.',
          '{two} asked what the orbiter does if something breaks up there. {one} looked it up. It goes home at once to save the ship, and it gives two days of notice.',
          'Our {onejob} read the rules of the orbiter to us at supper as a joke. Rule nine: if a fault puts the trip home at risk, leave early. We laughed at the voice {one} did.',
          'The orbiter reported a small fault today, a coolant valve, and cleared it inside the hour. {one} logged it. Departure is day {due}, the status line says.'],
        ['The orbiter sent a fault notice two days ago: a coolant leak, and an early departure in forty-eight hours. {one} asked it to wait. It sent the same notice back. The lander needs nine days to make ready for a climb. The orbiter left this morning.',
          'The orbiter left us today. It found a leak in its own fuel line, and its rules gave us two days of notice. The climb takes nine days to prepare. We got a third of the work done, and {one} watched the orbiter go from the mast.',
          'The orbiter left without us today. A reactor fault sent it home early, under its own rules, with forty-eight hours of notice. {one} and {two} were four days out at the far camp. They drove the rover back without a stop and got in eleven hours late.',
          'The coolant fault on the orbiter came back, and this time it did not clear. Its rules gave us forty-eight hours. The lander needs nine days to make ready. The orbiter started for home at noon, with nobody aboard.',
          'We lost the orbiter today, to its own rule book. A fault in its reactor, two days of notice, and then it left. {one} had the lander half ready. Half ready does not fly.'],
        ['The lander is ready to climb now. {one} finished the nine days of checks out of habit. It can reach orbit and no further, and the orbit is empty.',
          '{one} called the orbiter every hour until it passed out of range. It answered each time with its new schedule. It is a machine, and it cannot turn round, because it has the fuel for one trip.',
          'We sent the full story after the orbiter by radio. Home will read it when the orbiter arrives. Day {due} was to be our last day here. It is a date on the wall now.',
          '{one} has read the rules of the orbiter from end to end for a way to call it back. No rule lets it turn round. It has the fuel for one trip and it has started it.',
          'The orbiter answers our calls, fainter each day. It reports its speed and its course for home. {two} asked it to say it was sorry. It sent its speed and its course.'],
        ['Tonight {one} said what all of us knew. The orbiter will not come back, and no other ship can reach us for {years} years. We have food for a small part of that.',
          'Our {onejob} did the sum on the wall. Home learns we are here when the orbiter gets back. Then a ship needs {years} years to reach us. We have food for {many} days.',
          'Nobody says "when the ship comes" now. A ship from home needs {years} years. The orbiter was our only other way off this world, and it is gone.',
          'We talked it through tonight, all of us, to the end. The lander reaches orbit and no further. The orbiter will not turn back. A ship from home takes {years} years, and the food lasts {many} days.',
          '{one} took the climb date, day {due}, off the wall today. The orbiter left before it, and it is not coming back. No other ship can reach this world in less than {years} years.'],
      ],
    },
    {
      key: 'patched', due: 'next', end: 'launch', lead: 'launch', w: 0.7,
      beats: [
        ['We ran the engine check that the schedule asks for. The engine shut itself down in three seconds. {one} found a crack in the fuel feed line, a hand long.',
          '{one} found fuel on the ground under the engine this morning. The feed line has a crack in it. The climb needs full thrust for six minutes, and a cracked line cannot give it.',
          'The engine failed its check today. The fuel feed line has cracked, and {one} cannot say when. The lander cannot climb to the orbiter until the line holds.',
          'The lander failed its weekly engine check. Fuel pressure fell to half in two seconds. {one} traced it to the feed line, which has a crack {one} can put a thumbnail in.',
          '{two} smelled fuel in the engine bay today. The feed line is cracked at the second bend. {one} says the lander will not reach the orbiter on that line.'],
        ['{one} cut the cracked piece out of the fuel feed line and sleeved it with pipe from the water system. The water ration is a litre less. The orbiter will not wait past day {due}.',
          'Our {onejob} has wrapped the fuel feed line in patch tape and clamped a split pipe over it. No manual shows that repair. The orbiter leaves on day {due}.',
          '{one} and {two} have made a new piece of fuel feed line from a cabin pipe. It is the wrong metal. {one} says it may hold for one climb. We need one climb, before day {due}.',
          '{one} has tried three patches on the fuel feed line: tape, resin, and a welded sleeve. The sleeve is the best of them. The orbiter starts for home on day {due}.',
          'We have no spare fuel feed line. {one} asked the orbiter if it carries one. It carries one, and it has no way to send it down. {one} welded a sleeve over the crack.'],
        ['We test fired the engine. The patch on the feed line held for nine seconds, and then it sprayed fuel. {one} shut down in time. The climb takes six minutes.',
          'Engine test. The new feed line held at half thrust for a minute. At full thrust it leaked at the clamp. {one} has tightened it, and we have no fuel to spare for a second test.',
          'The patch on the feed line held for the whole engine test, twenty seconds. {one} was pleased for an hour. Then {two} found that the pipe had swollen to twice its width.',
          'We ran the engine at full thrust for the test. The sleeve on the feed line held for fourteen seconds and then wept fuel along the weld. The climb is six minutes.',
          '{one} pressure tested the mended feed line with water before the engine test. It held for an hour. Under fuel, in the engine test, it held for twelve seconds.'],
        ['The orbiter leaves on day {due}. If we stay, we die here when the food ends. If we climb, {one} gives the feed line one chance in three. All of us have said we will climb.',
          'We took a vote. Stay, and watch the orbiter leave on day {due}, or climb on a patched feed line. It was {crew} to none for the climb. {one} has gone to check the clamps once more.',
          '{one} told us the truth about the feed line tonight. It will hold, or it will burst in the first minute. No test can tell us which. Day {due} is the last day the orbiter waits.',
          '{one} laid it out for us. A feed line that bursts on the climb kills us in a second. No climb kills us in a season, when the food ends. We have until day {due}, when the orbiter goes. We climb.',
          'Nobody wants to grow old here, and nobody will, because the food ends first. So we will try the climb on the patched feed line. {one} has asked for every day before day {due} to work on it.'],
      ],
    },
  ]);

  // ---------------------------------------------------------------- the world threads
  //
  // SALIENCE. Every thread says how loud its fact is on this world, from the numbers of the
  // planet. `sal` returns roughly 0 for a fact a crew would barely mention and 3 or more for one
  // that decides the mission. writeLog() weights a thread by (0.15 + sal) cubed, so the loudest
  // fact wins nearly every time and the quieter ones still come up. A mild thread, an easy day or
  // a sea within reach, is therefore only ever picked on a world with nothing louder.
  //
  // The gates on the land are exact. `hasocean` alone does not say that the crew can walk to the
  // water, and on a lava world it is not water at all:
  //
  //   coast      mostlysea, and liquid. The wreck stands on an island and the tide line is near
  //   sea        an ocean world that is neither lava nor ice, and not mostly land
  //   lavasea    a lava world. The sea is molten rock. Nobody walks to it and nobody drinks it
  //   icesea     an ice world. The sea is a solid plain
  //   inland     mostly land. There is water somewhere and it is not here
  //   dry        no sea at all
  //
  // Each of the five is a different fact, so no log ever walks east to a sea that is not there.
  const WORLD_THREADS = pool([
    {
      key: 'cold', tags: 'frozen|subzero|cold', sal: (e) => (5 - e.tempC) / 25, lead: 'doom', beats: [
        ['It is colder than the orbiter said. {temp} at noon. We have moved the cots into the bay.',
          'Outside is {temp}. We went out in pairs today and came in after forty minutes.',
          'There is no wind and no cloud here, only cold. {temp} at the hatch all day.',
          '{one} read the outside gauge three times this morning. {temp}. The number does not move.',
          'The gauge says {temp} and the suits are rated for a warmer world than this one.',
          'Our {onejob} set a bottle of water outside to see. It was solid in eleven minutes.'],
        ['The water in the pipes froze in the night. {one} burned a hand on the heater. {one} says it is nothing.',
          'Two sample cases cracked in the cold and we lost what was in them. {one} did not speak at supper.',
          'The grease in the arm has gone hard. Our {onejob} worked on it until midnight and got one joint back.',
          'The outer hatch will not seal below a certain hour. We go out in the middle of the day or we do not go.',
          'A cable at the mast has gone brittle and snapped. {two} spliced it with bare hands and paid for that.',
          'Our {twojob} lost feeling in one hand for an hour today. Nobody outside works alone now.'],
        ['We run the heaters at half now. The bay holds ten degrees and no more. {two} sleeps in a suit.',
          'We have shut the forward rooms and we all live in the bay. It is warmer and it is very small.',
          'The heaters take more power than the panels make. We have known that since day {since}. The cells make up the rest, and the cells run down.',
          'Our {twojob} has cut the heat at night. Nobody argued and nobody slept.',
          'We sleep four to a room with the door taped. It is the only warm space left.',
          'Everything we own is on the beds now. There is nothing else in the ship that holds heat.'],
        ['The forward cell died in the night. We have light in one room. Nobody has been warm since day {since}.',
          'It is {temp} outside and the inner door is stiff with frost. We work one hour on and two off.',
          'There is ice inside the bay now, on the wall behind the bunks. We do not talk about it.',
          '{one} cannot feel two fingers. The {onejob} says it will pass. I do not think it will.',
          'The last heater runs on a timer of ten minutes in the hour. Ten minutes is what the cells can give.',
          'The walls of the bay are cold to the touch. The room is back at freezing a quarter of an hour after the heater stops.'],
      ],
    },
    {
      key: 'heat', tags: 'hot|molten', sal: (e) => (e.tempC - 32) / 30, lead: 'doom', beats: [
        ['The outside reads {temp}. We work in the early hours and sleep through the middle of the day.',
          'Outside is {temp}. The suits hold for ninety minutes and then they tell you to come in.',
          '{temp} at noon. We have moved every job on the list to the hours before dawn.',
          'Our {onejob} has written the heat plan on the wall. Out before dawn, in by the third hour.',
          'The suit alarm goes at ninety minutes and it has gone every time. {one} timed the first walk.',
          'It was {temp} at the hatch at noon. {two} read it out and nobody answered.'],
        ['The radiators cannot hold it at noon. {one} rigged a shade out of a panel. It buys two hours.',
          'We lost the forward camera today. The glass went white and will not come back.',
          '{two} strung a sheet over the hatch this morning. The bay dropped four degrees. We were pleased.',
          'The seals go soft in the afternoon and they do not go hard again. We reseal every third day.',
          'The paint has blistered off the sunward side. Our {onejob} scraped a hand of it off the hull.',
          'Two bottles burst in the store this afternoon. {two} found them and said one word.'],
        ['{one} went out at noon to fix the dish and came back grey. We put {one} on water and rest.',
          'The bay is at forty degrees and we cannot cool it. We have stopped the afternoon work.',
          'Our {twojob} fainted at the bench today. {two} was up an hour later and would not sit down.',
          'Nobody sleeps. We lie in the dark of the bay and wait for the ground to cool.',
          'We work the two hours before dawn and nothing else. The rest of the turn we sit.',
          '{two} would not come in at the alarm today. {one} went out and brought {two} back.'],
        ['Two more cells failed in the heat. The cold store is gone. The food will not keep now.',
          'The radiators are cracked along the top rail. There is no part left to cut one from.',
          'Each of us can work an hour a day in this heat. The rest of the day we sit and wait for the sun to set.',
          'The pump for the cooling loop stopped at noon. {one} has been on it since and has not spoken.',
          'The bay does not cool at night any more. It holds at thirty-five degrees until dawn.',
          'Our {onejob} has given the heat plan up. No hour of the day is cool enough to work in.'],
      ],
    },
    {
      key: 'mild', tags: 'temperate', sal: () => 0.35, beats: [
        ['The air is {temp} and we can walk out with no suit. {one} stood at the hatch for an hour and just looked.',
          'It is {temp} outside. We ate on the step tonight, all of us, with the hatch open.',
          '{temp}, no wind, and a clear sky. Our {onejob} says it is better weather than home.'],
        ['Good weather every day since day {since}. The ground survey is finished early.',
          'We have had nine clear days. {two} has the whole east quarter mapped and drawn.',
          'Every day has been clear. We are ahead of the plan for the first time.'],
        ['The wind turned this week and it has not turned back. It carries grit and it is in everything.',
          'The nights are colder now. We have started wearing the suits again by day.',
          'Three days of low cloud and no sun. The panels made a third of what they should.'],
        ['The warm days are over. The water bucket on the step had a skin on it at dawn, and the panels made half the power.',
          'The wind has not dropped in eleven days. We have stopped going out past the mast.',
          'The weather turned cold in one night. The warm season is over, and we do not know how long the cold one lasts.'],
      ],
    },
    {
      key: 'heavy', tags: 'highgrav|crushgrav', sal: (e) => (e.gravity - 1.35) / 0.45, beats: [
        ['Gravity here is {grav}. Everything we lift is heavier than it looks. {one} counted forty steps to the mast and had to rest.',
          '{grav}. We halved every load on the manifest this morning and it is too much.',
          'At {grav} a full case takes two people. Our {onejob} worked that out by dropping one.'],
        ['{one} has stopped going out. {one} says the legs hurt after an hour. We believe {one}.',
          'All of us are stiff in the back. The {twojob} has us doing ten minutes of stretching before the hatch.',
          'Nobody can stand a full shift. We work forty minutes and sit for twenty.'],
        ['The forward leg has sunk a hand deep. At {grav} it will keep sinking. The deck is no longer level.',
          'We dropped a sample case and it broke open. At {grav} nothing we drop survives. Three cases left.',
          'The sample arm bent at the shoulder on the third dig. It works at half its reach now.'],
        ['The mast bearing has begun to grind. It carries {grav} through every hour of a {day} turn.',
          'The deck is over by four degrees now and everything we set down rolls. We have stopped setting things down.',
          '{one} fell on the step today and could not get up alone. At {grav} a fall does real harm.'],
      ],
    },
    {
      key: 'light', tags: 'lowgrav|feathergrav', sal: (e) => (0.7 - e.gravity) / 0.28, beats: [
        ['Gravity is {grav}. {one} jumped clean over the rover on the first day and we all laughed.',
          '{grav}. Our {twojob} put a full case on the roof of the rover without a ladder.',
          'At {grav} we can carry everything at once. We have carried everything at once all week.'],
        ['The dust we raise does not come down. It hangs at head height for a whole day.',
          'Every footprint we make throws dust that stays up. The camera reads a haze by noon.',
          'At {grav} nothing settles. The air round the ship has not been clear since we landed.'],
        ['The panels are grey with our own dust. We brush them and we raise more. Power is down a fifth.',
          'At {grav} the drill walks instead of cutting. We have three holes and not one is straight.',
          'We move slower than we should, because a hard step lifts you off the ground.'],
        ['We have stopped walking near the panels. It is too late. The upper faces are out of reach.',
          'Power is down a third, and the dust on the panels is the cause. We have no water to spare to wash them.',
          '{one} went up to clear the top panel and could not hold on. Nothing broke. Nobody will try again.'],
      ],
    },
    {
      key: 'longnight', tags: 'longday|slowspin', sal: (e) => (e.dayHours - 36) / 22, lead: 'doom', beats: [
        ['One turn of {world} is {day}. The night is {night} long. None of us has done this before.',
          'A day here is {day}. We have set watches, because one of us has to be awake at all times.',
          '{day} to the turn. Our {onejob} has rewritten the power plan twice and does not trust it.'],
        ['The first long night is here. {one} has set the watches. We sleep in the bay with one heater.',
          'The sun went down eleven hours ago. It will be down for {night} more.',
          'We went into the dark with full cells. {two} reads the meter every hour and writes it down.'],
        ['We came out of the dark with two cells flat. {one} worked through the whole night to save the third.',
          'The sun is up and nothing is charging fast enough. We lost more in that night than the plan said.',
          'One night cost us a fifth of the store. There are more nights than that ahead.'],
        ['Dawn is slow here. The sun clears the ridge by a finger an hour, and the cells drain while we wait.',
          'Dawn is {night} away. We have counted what is left. It is not enough.',
          'We are in the dark again and the cells started low. Our {twojob} has stopped saying it will be fine.'],
      ],
    },
    {
      key: 'evenday', tags: 'evenday', sal: () => 0.3, beats: [
        ['A turn of {world} is {day}. That is near enough to home that we sleep. It is the one easy thing here.',
          '{day} to the turn. We kept our own clock and it has matched the sun all week.',
          'The day here is {day} long. Nobody has had to think about it once.'],
        ['We have kept the same hours since day {since}. The work goes fast and the days go faster.',
          'Sunrise, work, supper, sleep. We have done that {few} times now without a change.',
          'The day here fits our sleep, and we have used that. The survey is ahead of the plan.'],
        ['The days are easy and the ground is not. We have broken two drills in the rock.',
          'We still keep the same hours. There is less to do in them now.',
          'Our {onejob} has stopped setting the alarm. There is no longer a reason to be up early.'],
      ],
    },
    {
      key: 'sea', tags: 'hasocean waterliquid !mostlyland !lava !ice', sal: (e) => (1 - e.land) * 1.7, beats: [
        ['The wind off the water carries salt and it reaches us here. {one} tasted it off the mast rail.',
          'There is open water on this world and the weather here comes off it. Cloud every afternoon.',
          'Our {onejob} put the sea on the map today from the orbit data. It is too far to drive to.',
          'Every wind we get comes off the water. {two} has logged the direction for nine days and it holds.',
          'The air here is wet and it is salt. {one} tasted a glove and made a face about it.'],
        ['Salt is on every surface outside. {two} wiped the camera and the coating came off with it.',
          'Everything metal outside has a bloom on it now. The {twojob} calls it salt and is right.',
          'The damp gets into the bay whenever the hatch is open. Nothing dries indoors any more.',
          'There is a bloom on every bare metal face outside. Our {onejob} has photographs of it spreading.',
          '{one} sanded the mast rail down to bright metal. It was dull again inside four days.'],
        ['The salt is in the mast bearing. The mast turns, and it grinds.',
          'Two hatch seals have gone. We keep the inner door shut and we go out one at a time.',
          'The lower contacts are green. {one} has cleaned them twice and they come back.',
          'The aerial mount has gone through at the base. {two} has it strapped and it will not hold long.',
          'Two of the four panel clamps have failed. We have wired the panels down and that is all.'],
        ['The main power cable corroded through at the forward junction. We have one line to the panels now.',
          'The mast bearing has seized. The dish points where it points and we cannot move it.',
          'Every metal part outside is rusting at the same rate. We have stopped cleaning them.',
          'The forward hatch will not open now. We use the aft one and we go out one at a time.',
          'Our {onejob} has written off the outside of this ship. The salt will rust through every part of it.'],
      ],
    },
    {
      key: 'coast', tags: 'mostlysea waterliquid', sal: () => 2.1, beats: [
        ['We are on an island and the water is a ten minute walk in three directions. {one} went in up to the knees.',
          'The high water mark is four hundred metres from the forward leg. Our {onejob} put a stake in it.',
          'There is water on three sides of us. {two} swam today and came out saying it was warm.'],
        ['The stake is under water twice a day now. {one} moved it up the beach and set it deeper.',
          'We built a raft out of packing foam today. It floated. Nobody has taken it out far.',
          'The {twojob} has been fishing off the point with a line and a bent pin. Nothing yet.'],
        ['The water has taken six metres of beach since day {since}. The second stake is gone.',
          'The sand under the forward leg is going out with the water. We have packed rock under it twice.',
          'A storm off the water took the stakes and a metre of beach in one night.'],
        ['The water reached the landing circle this morning. There is nowhere on this island to move to.',
          'We have walked the whole island again looking for higher ground. There is none.',
          'The sea comes into the outer bay twice a day now. We have stopped drying it out.'],
      ],
    },
    {
      key: 'lavasea', tags: 'hasocean lava', sal: () => 2.0, lead: 'doom', beats: [
        ['The sea on {world} is molten rock. It is on the map and we will never go near it.',
          'There is an ocean here and it runs red. At {temp} no water could lie on this ground.',
          'Our {onejob} calls the red on the map a sea. It is molten rock, and it moves, and it is not water.'],
        ['The light off the molten ground reaches us at night. We can read the gauges outside by it.',
          'The wind that comes off the molten sea is the hottest air on this world. We have shut the hatch on that side.',
          'The ground between us and the molten sea is cracked in bands, and the cracks glow at the bottom.'],
        ['The edge of the molten sea has moved two kilometres toward us since day {since}. {two} measured it.',
          'There is fresh black rock inside our survey square. It was not there last week.',
          'The ground under the forward leg reads eighty degrees now. It read forty on the day we landed.'],
        ['The molten rock is inside the survey square. We can hear it from the bay, and the lander cannot move away from it.',
          'The deck is too hot to stand on in socks. The lander cannot move away from the molten rock, and the rock moves toward it.',
          'Our {twojob} has stopped taking the ground temperature. It rises every day.'],
      ],
    },
    {
      key: 'icesea', tags: 'hasocean ice', sal: () => 1.5, beats: [
        ['The sea here is solid. It is a white plain from the ridge to the horizon and it does not move.',
          'There is an ocean on {world} and every bit of it is frozen hard. {one} walked out on it today.',
          'The map calls the flat ground east of us a sea. At {temp} it is a floor.'],
        ['{one} walked two kilometres out on the frozen sea and came back with a core sample.',
          'Our {onejob} has the sledge running on the flat now. It is the fastest ground on this world.',
          'The white plain is smoother than anything else here. We have started using it as a road.'],
        ['There are cracks in the frozen sea where there were none. The {twojob} has marked them and forbidden the sledge.',
          'The ice of the frozen sea moved last night. We heard it through the hull, and we do not know what moved it.',
          'The surface of the frozen sea dropped a hand in one place today. We have pulled the markers back.'],
        ['A crack opened inside our route and took the sledge. Nobody was on it. Nobody goes out there now.',
          'The frozen sea is breaking up along the near edge. We have lost our road across it.',
          'We have stopped going east. The ice of the sea is breaking up, and we cannot say why.'],
      ],
    },
    {
      key: 'inland', tags: 'mostlyland !dryworld', sal: () => 1.5, beats: [
        ['There is water on {world} and none of it is near us. The nearest blue on the map is a thousand kilometres away.',
          'We are in the middle of the land. Our {onejob} measured the distance to water and then stopped saying it.',
          'Every direction from here is the same dry ground for further than the rover can go.'],
        ['All our water comes out of the recycler. {one} keeps the count and reads it out at supper.',
          'We are on five litres a person a day. Nobody has asked for more.',
          'The {twojob} has us washing in the same cup of water, one after another. It works.'],
        ['The recycler lost a seal and we lost eleven litres. {two} found it and fixed it in the dark.',
          'The ration is three litres now. Our {onejob} made the call alone and told us after.',
          'We have stopped washing anything but hands. Nobody minds and everybody has noticed.'],
        ['Two litres a person. {one} counted the tank twice and got the same number twice.',
          'The recycler runs at half now and we cannot find why. There is nowhere to go for more.',
          'We have {few} days of water. That is the only number on the wall.'],
      ],
    },
    {
      key: 'dry', tags: 'dryworld', sal: () => 2.3, lead: 'doom', beats: [
        ['There is no sea on {world}. The tank we landed with is all the water there is.',
          '{world} has no open water anywhere on it. We brought every drop we will ever have.',
          'Our {onejob} ran the survey for ground water on the first week. There is none.'],
        ['We are on four litres a person a day. {one} keeps the count and will not bend it for anybody.',
          'The {twojob} has written the water plan on the bay wall. It runs to day {many} and no further.',
          'Everything we drink has been through the recycler twice. Nobody says anything about the taste.'],
        ['The recycler lost a seal. We lost eleven litres before {two} found it.',
          'The ration is two litres now. Nobody argued about it.',
          'We have stopped washing anything but hands. The {onejob} shaved with the same cup all week.'],
        ['The tank reads low and the recycler is not keeping up. {few} days, by the count on the wall.',
          'One litre each today. {one} gave half of that back to the pot and said nothing.',
          'We have stopped reading the tank out loud. All of us go and look at it alone.'],
      ],
    },
    {
      key: 'overgrow', tags: 'flora', sal: (e) => 0.25 + (e.floraDensity || 0) * 0.28, beats: [
        ['The {plants} here grow fast. {one} measured one this week and it had put on a hand.',
          'There are {plants} all round the landing circle. Our {twojob} has tagged forty of them.',
          'The {plants} closed the gap we cut on the first day. It took them nine days.',
          '{one} put a mark on a {plant} by the mast. The mark is higher off the ground every time I look.'],
        ['There is a {plant} inside the landing circle now. {one} wanted to cut it. We let it stand.',
          'The {plants} have reached the legs of the lander and started up them. {one} cuts them back every morning.',
          'We cut a path to the mast every third day. By the fourth day there is no path.'],
        ['The {plants} are up against the forward leg. They have lifted the pad by a finger.',
          'Sap from the {plants} has got into the lower seal. The seal is soft where it should be hard.',
          'The {plants} are over the dish mount. {two} cleared it and it was back inside a week.'],
        ['The {plants} are over the lower bay. We have stopped cutting. It is warmer under them.',
          'We cannot see the rover from the hatch any more. It has not moved. The {plants} have.',
          'The mast stands in {plants} to half its height. In one more season they will cover it.'],
      ],
    },
    {
      key: 'polarnight', tags: 'polarnight', sal: () => 2.7, lead: 'doom', beats: [
        ['The axis of {world} leans {tilt}. At {lat} the sun runs a flat circle now and does not climb.',
          'We are at {lat}, and this world leans {tilt}. The sun goes round the horizon and never gets above it.',
          'Our {onejob} plotted the path of the sun today. It is a flat circle round the horizon.',
          'The sun went round the whole horizon today without rising. {two} filmed the turn of it.',
          'At {lat} the light comes from every side of us in turn and never from above.'],
        ['The sun touched the horizon today and did not clear it. It will stop rising inside the week.',
          'Four hours of grey light today, and less tomorrow. The sun is going and it will stop rising.',
          '{one} has worked out the date the sun goes. It is eleven days from now.',
          'There is a date on the wall now. After it there is no sun at {lat} until the season turns.',
          'The panels made a fifth of the plan today. Tomorrow they will make less, and the day after, less again.'],
        ['The polar night is here. We have the lamps and nothing else. {one} keeps one burning all day.',
          'It is dark and it will be dark for a season. The solar panels make no power without the sun.',
          'The {twojob} has put a lamp in every room. We have the power for that and not much else.',
          'We work by lamp and we sleep by lamp. {one} has started calling the lamp hours morning.',
          'Our {twojob} keeps ship time out loud so the rest of us hold on to it.'],
        ['We have had no sun for weeks. {one} has stopped reading the power meter out loud.',
          'We are burning the last of the store to stay warm in the dark. There is no sun to wait for.',
          'Our {onejob} counted the days of power left and then rubbed the number off the wall.',
          'We are down to one lamp and the heaters. There is no sun to wait for and no date that helps.',
          '{one} went out and stood in the dark for an hour tonight. {one} would not say why.'],
      ],
    },
    {
      key: 'volcano', tags: 'volcanic', sal: () => 2.1, beats: [
        ['There are vents to the south. We can see the glow of them from the hatch at night.',
          'The ground here is warm through the boots. Our {onejob} says there are vents under us, not far.',
          '{one} walked to the near vent field today and brought back a rock too hot to hold.',
          'There is a line of red on the southern horizon after dark. Our {twojob} has it on film.',
          'The seismometer has not been quiet since we set it down. {one} says the ground here never stops shaking.'],
        ['There is ash on the panels every morning. We wipe it off and it is back by evening.',
          'The ash comes in on the wind from the south. It is fine and it is grey and it is everywhere.',
          'The {twojob} has us wiping the panels twice a day. It gains us an hour of power.',
          'Everything outside is grey by evening. {one} has stopped brushing boots at the hatch.',
          'The ash gets past the outer seal. There is a film of it on the bench inside.'],
        ['The ash is fine enough to pass the filters. It is in the bearings now.',
          'The ground shook twice in the night. {one} went out to look and came back fast.',
          'The glow to the south is wider than it was on day {since}. {two} has photographs of both.',
          'The filters clog in a day now instead of a week. We have six left.',
          'The mast bearing has ash in it and it grinds. {one} has stripped it once and it came back.'],
        ['The ash on the deck is a finger deep. We have stopped measuring it.',
          'The air outside will not pass the filter any more. We go out on bottles or not at all.',
          'There is new ground to the south, black and steaming. It is inside the survey square.',
          'The deck is grey to the depth of a boot sole. We walk on our own footprints.',
          'Our {onejob} has sealed the record bay against the ash and will not open it again.'],
      ],
    },
    {
      key: 'geysers', tags: 'geysers', sal: () => 1.9, beats: [
        ['The geysers keep no interval we can find. The numbers we planned on came from a probe, forty years ago.',
          'There are nine geysers inside the square. {two} has timed every one and no two agree.',
          'Our {onejob} sited us here for the heat. The first geyser went up ninety metres and changed the plan.'],
        ['A geyser opened inside the landing circle today. The spray has coated the mast from the foot up.',
          'The fall from the near geyser reaches the panels. The water carries minerals, and it dries to a crust.',
          '{one} was out when a geyser opened at forty metres. {one} was not hurt and will not go out alone now.'],
        ['The mast is crusted to shoulder height. {two} chipped it off and it was back inside four days.',
          'A new geyser opened where the rover parks. We have moved the rover and there is nowhere good.',
          'The spray from the geysers eats the hatch seals. Three are gone and we have two spares.'],
        ['A geyser opened under the aft leg in the night. The ship is over by three degrees and it will not come back.',
          'The ground inside the circle is hollow. Our {twojob} sounded it and will not let anybody walk there.',
          'We have stopped going out on the south side at all. A geyser can open anywhere on it, without warning.'],
      ],
    },
    {
      key: 'storms', tags: 'stormy', sal: () => 2.0, lead: 'doom', beats: [
        ['The storms come in from the same quarter every time. We can see one an hour before it lands.',
          'There is lightning on this world every day. {one} counted forty strikes inside an hour.',
          'Our {onejob} has us inside the moment the cloud tops go flat. That has been right every time.'],
        ['Lightning took the first antenna last night. We have one left and we have moved it lower.',
          'A strike took the weather mast at the far marker. There is nothing left of it to find.',
          'The {twojob} has earthed everything that can be earthed. It has cost us two days.'],
        ['Four strikes in ten days. The mast is the tallest thing standing here and it will be hit again.',
          'The receiver is gone. {one} had it apart on the bench and there is nothing to mend.',
          'A strike ran down the cable run and took the forward bus with it.'],
        ['The next strike takes the transmitter or it does not. We have earthed it, and we can do no more.',
          'We have lost the charge controller. The panels make power and nothing holds it.',
          'The storm has not moved off in three days. We have been inside for all of them.'],
      ],
    },
    {
      key: 'aurora', tags: 'auroral', sal: () => 1.6, beats: [
        ['The sky was green from one side to the other last night. {one} woke everybody to see it.',
          'There is an aurora over {world} most nights. Our {twojob} has not gone to bed before it.',
          'Green and red across the whole sky tonight. We stood outside in the cold until it went.'],
        ['The aurora comes most nights now. {one} says it is the best thing on this world.',
          'The radio gives only noise while the sky is lit. Nine nights in ten it is lit.',
          '{two} has a camera on the sky every night now and will not take it down.'],
        ['Our clock drifts under the aurora and we cannot correct it from the ground.',
          'The radio has given only noise for eleven nights. {one} listens for an hour every night all the same.',
          'The compass is useless while the sky is lit. That is most of the time.'],
        ['Twenty days of noise on every radio band. Our {onejob} sits with the receiver every night.',
          'We have no way to know the time to better than a day. Everything we log is now approximate.',
          'The sky is lit again and nothing we send goes out through it.'],
      ],
    },
    {
      key: 'tide', tags: 'tides', sal: () => 1.1, beats: [
        ['{moon} raises a tide here. We set the ship above the high water line, and we set it a metre too low.',
          'The water comes up twice a day with {moon}, and further each time this week.',
          'Our {onejob} timed the tide against {moon}. The two agree and the numbers are large.'],
        ['Twice a day the lowest leg stands in water. {one} has measured it and it is coming up.',
          'The tide took the cable run. We moved it. It took it again on the third day.',
          '{two} drove a stake at the high water mark. It was under by the following week.'],
        ['There is no higher ground inside the length of the cable. We have stopped moving it.',
          'The ground under the ship is soft twice a day now. The forward leg has settled a hand.',
          'The tide reached the step this morning. It has never reached the step before.'],
        ['The water is in the lower bay at every high tide. We have moved the record up a deck.',
          'The ship is over by five degrees and the tide is doing it. There is nothing to be done.',
          'Our {twojob} has stopped pumping the bay out. It fills again in twelve hours.'],
      ],
    },
    {
      key: 'rain', tags: 'rainy', sal: () => 0.95, beats: [
        ['It rains most afternoons. The first one was a good day. We all stood out in it.',
          'It rained for six hours today. {one} left a cup out and measured what fell.',
          'It rained three times today. Our {twojob} brought the washing in twice and gave up.'],
        ['What falls here is not clean. There is a film on the panels and the brush only spreads it.',
          'The rain has taken the paint off the upper hull in patches. There is acid in it.',
          'Everything outside is wet all the time now. Nothing we leave out comes back dry.'],
        ['The rain has found a seam we cannot reach. The lower bay has been wet for six days.',
          'Rain water has reached the main power bus under the deck. {one} has been lying under the deck for two days with a lamp and a cloth.',
          'Water is standing under the aft leg and the ground there has gone to mud.'],
        ['It has rained for three days without a break. The solar panels make no power under that much cloud.',
          'The main power bus is wet through and the forward power line is dead. Our {onejob} cannot dry it out.',
          'There is water in the record bay. We have moved everything that matters up a deck.'],
      ],
    },
    {
      key: 'ring', tags: 'ringed', sal: () => 1.3, beats: [
        ['There is a ring overhead. {one} looked at it for an hour on the first night and said nothing.',
          'The ring cuts the sky of {world} in two. Our {twojob} has drawn it four times and is not done.',
          'We can read by the ring light at midnight. None of us expected that.'],
        ['The ring throws a shadow over the ground and it crosses us near noon. {two} timed it.',
          'The shadow of the ring passes over us every day. The temperature drops four degrees in it.',
          'The ring cuts the sun for an hour a day. {one} has put that in the power plan.'],
        ['We lose an hour of sun to the ring every day. The power plan did not allow for that.',
          'The shadow is wider this season. We are down to four hours of good light.',
          'Our {onejob} has rerun the power numbers with the ring in them. The answer is worse.'],
        ['The shadow of the ring covers the middle of the day now. We charge the cells in the morning and the evening.',
          'We are making half the power the plan promised, and the shadow of the ring is the cause.',
          '{two} has stopped drawing the ring. {two} called it the best sight here. Now it costs us half our power.'],
      ],
    },
    {
      key: 'moon', tags: 'moonlit', sal: () => 0.5, beats: [
        ['{moon} came up over the east ridge tonight. {one} named the ridge after it and it stuck.',
          '{moon} is bright enough to work by. We did an hour outside at midnight for the sake of it.',
          'Our {twojob} has {moon} on film, crossing, every night this week.'],
        ['{one} times {moon} every night and writes it down. It is the steadiest thing we have.',
          'We have {moon} on the clock now. Our own clock drifts and {moon} does not.',
          '{moon} crossed in front of the sun today. The light went brown for nine minutes.'],
        ['We set our clock by {moon} now. Our own clock has drifted too far to trust.',
          '{one} missed the crossing last night for the first time. Nobody said anything.',
          'The cloud has hidden {moon} for nine nights. {two} keeps the book open at the right page.'],
      ],
    },
  ]);

  // ---------------------------------------------------------------- the crew threads
  // These fit any world. A warm beat matters as much as a dark one: the reader has to like these
  // people before anything happens to them.
  //
  // `retires` marks a thread that takes a person out of the story. The beat that does it carries
  // `out`, and no beat after it in the same thread may name that person. writeLog() gives a
  // retiring thread a person of its own, so no other thread and no ending can name them again.
  //
  // **A person who walks out has a reason, and the log states it.** Three threads send a person
  // away, and each one names where the person goes and what for: the supply drop, the old lander,
  // and the food that grows here. Two facts of the frame hold in every log, so two threads never
  // disagree: the supply drop lies {far} kilometres north, and the old lander thirty kilometres
  // east.
  //
  // `coda` is one sentence the ending may add, so the last entry touches these people. `lead` says
  // which ending this thread points at, and writeLog() turns it into a tag the endings are gated
  // on. That is how a quarrel ends in a split and a hurt keeper ends in a second hand.
  const CREW_THREADS = pool([
    {
      key: 'injury', retires: true, lead: 'message',
      coda: ['Every name is on the board by the hatch, and one of them is under a cairn.',
        'There is a cairn past the mast. Put a stone on it if you come this way.'],
      beats: [
        ['{one} fell off the mast this morning. The leg is broken in two places. We have set it.',
          '{one} went through a crust of ground that looked solid. The leg is broken. Our {twojob} set it on the spot.',
          'The sample arm swung round and hit {one} at the bench today. Two ribs and a wrist. {one} did not make a sound.',
          '{one} was under the rover when the jack slipped. The foot is crushed and the {twojob} has it bound.',
          'A cable parted under load and hit {one} across the back. {two} carried {one} in.'],
        ['{one} is off the outside work for a month. {two} has taken the shifts and says nothing about it.',
          'We have {one} in the forward bunk with the leg up. {two} does two jobs now.',
          '{one} runs the radio from the bunk and does it better than any of us did.',
          'We have moved the bench next to the bunk so {one} can work sitting down.',
          '{one} does the numbers from the bunk now and lets the rest of us do the lifting.'],
        ['The break is not knitting. {one} says it does not hurt. I have seen {one} awake at night, holding it.',
          '{one} has a fever every evening. The medical kit had four doses for that. We have one.',
          'Our {twojob} has looked at the wound on {one} twice today and said nothing either time.',
          '{one} cannot keep food down. We have tried three kinds and none of them stays.',
          '{one} asked {two} to sit up tonight. {two} has not left the bunk since.'],
        {
          out: 'dead',
          say: ['{one} did not wake up this morning. We buried {one} beyond the mast. Nobody has said much since.',
            '{one} died in the night. We put {one} under a cairn past the mast and {two} said the words.',
            '{one} died in the early hours with {two} sitting there. We buried {one} at noon by the marker.'],
        },
      ],
    },
    {
      key: 'keeperhurt', lead: 'second',
      coda: ['I have asked {one} to finish this log if I cannot.',
        'My hand is worse tonight. {one} has offered to write the rest.'],
      beats: [
        ['I came off the ladder this morning. The arm is broken and {one} has set it.',
          'I put a hand through the cutter today. Two fingers are gone and {one} closed the wound.',
          'I went down hard on the step outside and could not get up. {one} carried me in.',
          'The mast winch took my glove and the hand with it. {one} got the bleeding stopped.',
          'I was under the sample arm when it came down. Two ribs. {one} has me strapped up and sitting.'],
        ['I am writing left handed. {one} does the outside work now and has not complained once.',
          'I cannot hold a tool. Our {onejob} has taken every job I used to do.',
          '{one} has been doing my shifts and {one}’s own. I have stopped offering to help.',
          'I sit at the bench and hand tools over. It is what I am good for now.',
          'Our {onejob} has taken the whole outside roster. Nobody put it to a vote.'],
        ['The arm is not knitting. {one} says rest. There is no rest here and we both know it.',
          'The wound has gone bad. {one} has cleaned it twice a day for a week and it is no better.',
          'I have a fever every evening now. I write this entry in the morning, when I can.',
          'I slept through a whole turn and nobody woke me. {one} says there was no reason to.',
          'I cannot hold the pen for long. The writing in this book has changed and I know it.'],
        ['I have asked {one} to keep this log if I cannot. {one} said yes and then went out.',
          'I showed {one} how the record store works tonight. Neither of us said why.',
          'I am slower every day. {one} has read the whole log back to me and knows it now.',
          '{one} sat by me and wrote what I said tonight. This entry is in two hands.',
          'I gave {one} the key to the record store this evening. Neither of us said anything after.'],
      ],
    },
    {
      key: 'quarrel', lead: 'split',
      coda: ['{one} and {two} shook hands before supper. It took long enough.',
        '{one} and {two} have not spoken today, and they both signed this entry.'],
      beats: [
        ['{one} and {two} argued tonight about the supply drop. It came down off target, {far} kilometres north. {one} wants to fetch it now, in case we need it. {two} says the walk could kill a person and the plan does not call for it.',
          '{one} laid the map on the table tonight with a route marked to the supply drop, {far} kilometres north. {one} says our food margin is too thin. {two} took the map off the table. It got loud.',
          '{one} said at supper that a crew with one store of food is one accident from hunger. {two} said that to walk {far} kilometres to the supply drop in a suit is the accident. Nobody else said a word.'],
        ['{one} and {two} have stopped speaking. {one} eats in the bay and {two} eats outside. It is not a big ship.',
          '{one} has stopped coming to supper. {two} sets a plate out for {one} all the same.',
          'Two days of silence between {one} and {two}. The rest of us talk twice as much to fill it.'],
        ['{one} has moved the cot into the store room. Nobody has asked {one} to move it back.',
          'Our {onejob} has taken every shift that the {twojob} does not. That is now the whole roster.',
          '{one} and {two} have split the tools. There are two sets now, and there was never more than one.'],
        ['{one} and {two} worked the same repair today and did not speak once. The repair held.',
          '{one} said tonight that we should not all stay here. Nobody argued and nobody agreed.',
          '{two} asked me to choose between the plan {one} has and the plan {two} has. I said no. I have been thinking about it since.'],
      ],
    },
    {
      key: 'cache', retires: true, lead: 'walk',
      coda: ['We put a lamp on the mast tonight, as we do every night.',
        'The lamp is on the mast. It costs us almost no power to leave it.'],
      beats: [
        ['{one} has marked the supply drop on the map. It came down off target, {far} kilometres north of us. It holds food for ninety days and a spare radio. The rover battery gives forty kilometres.',
          '{one} asked tonight why nobody has gone for the supply drop. It lies {far} kilometres north, with ninety days of food in it. {two} said no person can carry the air for that walk. {one} did the sum and says a person can.',
          'Our {onejob} has built a hand cart out of two rover wheels and a crate. It is for the walk to the supply drop, {far} kilometres north. {one} has not asked anybody to come.'],
        ['{one} said tonight that our food margin is thin, and that the supply drop fixes it. {one} would bring back the spare radio and all the food the cart can hold. I said no. {one} said it was not a question.',
          '{one} has packed the hand cart: air for thirty days, water, the small tent. The supply drop is {far} kilometres north. {one} plans on twelve kilometres a day and a call home to us every night.',
          '{two} offered to go with {one} to the supply drop. {one} said the air on the cart is enough for one person. {one} showed {two} the numbers, and the numbers were right.'],
        ['{one} left for the supply drop at first light with the hand cart. We all walked the first kilometre beside it. {one} called in at dusk from fourteen kilometres out, in good voice.',
          '{one} went north this morning, toward the supply drop. {two} helped the cart over the ridge and came back alone. The hand radio reached us tonight. {one} reports sore feet and good ground.',
          '{one} is six days out toward the supply drop and calls each night. Tonight {one} read us the distance, the air left, and a list of the rocks. {one} sounded tired.'],
        {
          out: 'gone',
          say: ['The last call from {one} came on the ninth night of the walk, from ninety kilometres north. We have called every hour since, and nothing comes back. {two} drove the rover to the end of its battery and saw cart tracks and nothing else.',
            '{one} stopped calling on the sixth night out. The last call said the cart had lost a wheel and the ground had gone soft. We call every hour on the hand radio. Nothing comes back.',
            'We have to write it down: {one} is lost. The calls stopped at ninety kilometres out, and no call has come since. {two} rubbed the route off the wall map.'],
        },
        ['We keep a lamp on the mast at night, in case. Nobody has come to it. The supply drop is where it was, and so are we.',
          'The lamp on the mast has burned for eleven nights. The hand radio sits on the table, turned up. Our {twojob} sets one place too many at supper and nobody says a word.',
          'Nobody talks about a walk to the supply drop now. The map with the route on it is on the wall, and nobody has taken it down.'],
      ],
    },
    {
      key: 'salvage', retires: true, lead: 'walk',
      coda: ['We put a lamp on the east side of the mast tonight. A person on the ridge would see it.',
        'The east lamp is lit. We light it every night and we do not talk about why.'],
      beats: [
        ['{one} found an old lander on the orbit photographs, thirty kilometres east. It is from the first survey, forty years back, and it carried no crew. {one} thinks it has parts and power cells we could use.',
          'There is a wreck on the orbit photographs, thirty kilometres east. It is an unmanned lander from the first survey, forty years old. {one} says the cells in it may hold a charge. We need cells.',
          '{one} showed us a bright point on the photographs, thirty kilometres east. The records say an unmanned lander came down there forty years ago. {one} wants to go and strip it for parts.'],
        ['The ground to the east is too broken for the rover. {one} proposes to walk to the old lander: three days out, a day to strip it, three days back. {two} says cells that are forty years old are dead cells.',
          '{one} has made a list of what the old lander might give us: cells, a pump, a radio, pipe. {two} made a list of what the walk will cost in air and water. The lists are the same length.',
          '{one} asked for seven days of air to walk to the old lander in the east and back. I gave it. If the cells out there are good, they double our power. {one} says that is worth one week of one person.'],
        ['{one} left at dawn for the old lander in the east, with a pack frame to carry cells home on. {two} walked with {one} to the first ridge. {one} called at dusk from eleven kilometres out.',
          '{one} went east this morning to strip the old lander. The hand radio reaches for the first day and no further, because of the ridge. {one} is due back in seven days.',
          '{one} is two days out toward the old lander. The last call said the ground was worse than the photographs showed. After the ridge we will hear nothing until {one} comes back over it.'],
        {
          out: 'gone',
          say: ['{one} has not come back from the old lander. Seven days of air went out with {one}, and the seven days are long gone. {two} looked east from the ridge with the long lens for a whole day. Nothing moved out there.',
            '{one} is lost. The air {one} carried for the walk to the old lander ran out many days ago. {two} went to the ridge and called on the hand radio until the battery died.',
            'We waited for {one} past the seventh day, and past the tenth, and then we stopped counting. {two} walks to the ridge and looks east, and comes back after dark.'],
        },
        ['We keep a lamp on the east side of the mast. Nobody has come over the ridge. We still do not know if the old lander had one good cell in it.',
          'Our {twojob} looks east from the hatch every morning before the work starts. Nobody has asked {two} to stop. Nothing has come over the ridge.',
          'Nobody has offered to walk to the old lander a second time. The photograph of it is on the wall, with the route marked in pencil.'],
      ],
    },
    {
      key: 'forage', tags: 'flora temperate waterliquid', w: 0.4, retires: true, lead: 'stay',
      coda: ['There was smoke to the east at dusk tonight, one thin line of it.',
        'We left a ration pack on the step tonight, the same as every night.'],
      beats: [
        ['{one} ate a small piece of {plant} today, and told us after. {one} is not sick. {one} says a crew could live off this ground if it had to, and wants to prove it.',
          '{one} has tested forty samples of the {plants} with the sample kit. Two parts in three are safe to eat, by the kit. {one} wants to go out and live on them for thirty days, to prove it.',
          'Our {onejob} said at supper that people could live here. The air is good, there is water, and the {plants} are food, {one} says. {two} said that a test kit is not a stomach.'],
        ['{one} went out this morning with a pack, a knife, and no rations. {one} will live off the {plants} for thirty days and come back to tell us. The medical rule is clear. Whoever eats the local growth waits ten days outside before coming in.',
          '{one} has gone to forage. {one} took the small tent and left a share of the food on the table for us. {two} read out the quarantine rule at the hatch: ten days outside on return. {one} laughed and agreed.',
          '{one} left at dawn to live off the land for a month. {one} said one of us had to find out if it can be done. I did not order {one} to stay. I am not sure I could have.'],
        ['{one} came back today, twelve kilos lighter, with green stains to the elbows. {one} would not put the helmet on and called the ship a tin. {two} held the hatch shut, by the rule. {one} shouted, and then sat down by the forward leg.',
          '{one} walked in at dusk today, off the land. {one} is thin and brown and talks fast. {one} says the {plants} feed a person well and that we are fools to sit in a hull. We kept the hatch shut. Ten days, the rule says.',
          '{one} is back, and is not the person who left. {one} did not know the day and did not ask about any of us. {one} asked for salt and for nothing else. {two} passed it out through the lock and shut it.'],
        {
          out: 'gone',
          say: ['{one} would not wait out the ten days of quarantine. {one} slept in the tent by the forward leg some nights and was gone for others. This morning the tent was gone too. The tracks go into the {plants}. {two} followed them for an hour and lost them.',
            '{one} would not come inside under the quarantine rule, and has left for good. There was a pile of cut {plants} on the step, cleaned and stacked. It would feed all of us for a day. We have not touched it.',
            '{one} lives out on the land now, and came to the hatch this morning to say we could come too. Nobody moved. {one} nodded, picked up the pack, and walked into the {plants}. {one} did not look back.'],
        },
        ['We leave a ration pack on the step each night. Some mornings it is gone. Some mornings there is a stack of cut {plants} in its place.',
          'There is smoke to the east some evenings, one thin line of it. Nobody here lit it. Our {twojob} watches it until dark.',
          'We tested the cut {plants} from the step with the kit. They are safe. None of us has eaten them yet. Our {twojob} says yet is the right word.'],
      ],
    },
    {
      key: 'food', lead: 'doom',
      coda: ['We ate the last good thing in the store tonight and left nothing for tomorrow.',
        'There is food for two more days. We have planned both of those meals out loud.'],
      beats: [
        ['We counted the stores today. {many} days of food. {one} counted them twice to be sure.',
          'Full stock take. {many} days, if nothing spoils. Our {twojob} wrote it on the wall.',
          '{many} days of food on the shelf. The plan called for that many, and a margin of ten.',
          'The store came to {many} days. {one} read it out at supper and nobody looked up.',
          'We opened every crate and wrote the whole list up. {many} days. It was meant to be more.',
          '{many} days of food, our {onejob} says. {one} is the one of us who is good with numbers.'],
        ['The cold store failed and we lost a third of the food. {one} counted what was left and did not say the number.',
          'Water got into two bags of meal before {two} found the leak. We lost a week of food.',
          'Our {onejob} found mould in the dry store. Half of that shelf went out past the mast.',
          'We lost the whole of one crate to the damp. Nobody has said whose job that was.',
          'We opened the second store today and half of the packs had burst their seals. They went bad some time ago.',
          'The food count is short by eleven days and {one} has been through it three times.'],
        ['We are on two meals a day. Nobody has said one word about the taste since.',
          'Half rations from this morning. {two} spread the first one out over the plate to make it look bigger.',
          'We eat once, late, together. It is the only part of the day that has not changed.',
          'The {twojob} puts the same food on every plate now. It is easier to count that way.',
          'We have gone to one meal a day. {one} made the call and nobody argued.',
          'Our {twojob} weighs every portion now, on the sample scale, to the gram.'],
        ['We have food for {few} days. Nobody talks about it.',
          '{few} days of food on the shelf. {one} has stopped writing the number on the wall.',
          'We have stopped counting the food out loud. There are {few} days of it.',
          '{few} days of food. Our {onejob} gave half a ration back to the pot tonight and said nothing.',
          'The food shelf is one crate deep. {two} counted it out loud once and will not do it a second time.',
          'We have {few} days of food on the shelf. All of us say that is a long time.'],
      ],
    },
    {
      key: 'radio', lead: 'message',
      coda: ['{one} has the receiver on while I write this. There is no voice on it.',
        'The receiver is on beside me. It has been on every night since we came down.'],
      beats: [
        ['{one} turns the receiver to the ship band for an hour every night. No ship is due in this system. {one} listens for one.',
          'Our {onejob} listens on the ship band after supper, every night, and writes down what was heard. So far the page says: static.',
          '{one} has rigged a second aerial along the ridge, to listen for ships. It picks up more static and no voice.'],
        ['{one} heard a tone on the ship band on day {since}. We listened for four hours. It did not come a second time.',
          'There was a tone on the ship band last night, nine seconds of it. {two} heard it too.',
          '{one} has a recording off the ship band that is not static. None of us can say what made it.'],
        ['We have sent the same distress call every day for a month. Nothing has come back.',
          '{one} has taken the radio apart and put it back together. It works. No ship answers it.',
          'The {twojob} has stopped coming to listen to the ship band. {one} has not.'],
        ['{one} sits with the receiver every night. The rest of us have stopped asking what it gave.',
          '{one} listens to the ship band for three hours now in place of one. Nobody has told {one} to stop.',
          'We sent the whole survey record out by radio tonight, on every band we have. If no ship hears it, home will, in time.'],
      ],
    },
    {
      key: 'repair', lead: 'doom',
      coda: ['The water pump ran for nine minutes this evening. We all stood and watched it.',
        'The water pump is dead and {one} has washed the tools and put them away.'],
      beats: [
        ['The water pump failed today. {one} had it apart on the deck inside the hour and running by dark.',
          'The water pump went at noon. Our {onejob} fixed it with a washer cut from a boot sole.',
          'The water pump stopped. {one} found the fault in twenty minutes and was proud of that for a day.',
          'The pump on the water recycler seized this morning. Our {onejob} had it on the bench before breakfast.',
          'The water pump stopped in the night. {one} was under it with a lamp when we got up.'],
        ['The water pump ran six days and failed again. {one} has it apart and is not talking.',
          'Same fault, same water pump, ten days later. The {onejob} says the housing is out of true.',
          'The water pump fails twice a week now. {one} can strip it in the dark and has had to.',
          'We cut a gasket for the water pump out of a boot and it has held four days. {one} calls that a result.',
          '{two} has drawn the whole water pump out on paper so that any of us can mend it.'],
        ['{one} and {two} built one good water pump out of two broken ones. It runs at half the rate.',
          '{one} and {two} have made a water pump out of the spare and the old one. It is ugly and it works.',
          'The rebuilt water pump is a hand tool now. Somebody has to stand and work it. We take turns.',
          'The rebuilt water pump runs eight hours and rests eight. That is the best {one} can get from it.',
          '{one} and {two} have a third water pump half built out of scrap. It may never run.'],
        ['The water pump is finished. There is nothing left on this ship to take a part from.',
          'The housing of the water pump cracked through. {one} looked at it for a long time and then put it down.',
          'We carry water by hand from the tank to the bay, a bucket at a time. The pump is dead.',
          'The water pump will not run. {one} laid the tools out, cleaned them, and put them away. Nobody said anything.',
          'The housing of the water pump is split end to end. {one} showed it to me and did not say a word.'],
      ],
    },
    {
      key: 'birthday',
      coda: ['We sang for {one} tonight, and we made it last.',
        'There is a mark on the wall for today. {one} put it there.'],
      beats: [
        ['It is {one}’s birthday. {two} made a cake out of ration flour. We sang and it was a good night.',
          'It is {one}’s birthday today. Our {twojob} made a sweet dish out of ration scraps and would not say how.',
          '{one} is a year older. We gave {one} the day off and did the shifts between us.',
          '{one} had a birthday today and had forgotten it. {two} had not.',
          'It is {one}’s birthday. Each of us wrote a few lines on a piece of packing and gave it over at supper.',
          'It is {one}’s birthday and we made a night of it. The {twojob} did a song and got the words wrong.'],
        ['{one} has kept a calendar on the bay wall since day {since}. There is a mark for every turn.',
          '{two} has been scratching the days into the hatch frame. There are a lot of them now.',
          'The calendar is on the wall by the cots and {one} owns it. Nobody else touches it.',
          'We keep two calendars, one by the sun and one by the clock. They stopped matching weeks ago.',
          '{one} counts the calendar marks out loud every morning. It is the first sound in the ship.'],
        ['It is {two}’s birthday today. There was no flour left for a cake. We sang all the same.',
          '{two} turned a year older and we had nothing to give. {one} gave {two} the last sweet ration.',
          'Another birthday, for {two} this time. We sang it through and then sat quiet for a while.',
          'It is {two}’s birthday and nobody had remembered. {two} told us, at supper, and laughed.',
          'Two birthdays in one week. {one} gave {two} a carved bit of packing and {two} has it on the bunk.'],
        ['The calendar has run off the end of the wall. {one} has started a second one on the hatch.',
          '{one} stopped marking the calendar this week. Nobody has taken it up.',
          'The calendar fills the wall now. We stood and looked at the whole of it tonight.',
          'There are more marks on the calendar than there are days of food. {two} counted both.',
          'The calendar wall is full. {one} looked at the whole of it tonight and then went to bed.'],
      ],
    },
    {
      key: 'game',
      coda: ['We played one last hand tonight and {one} won it.',
        'The dice are in the drawer by the hatch, for whoever comes.'],
      beats: [
        ['{one} made a set of dice out of the packing. We play every night after the work is done.',
          'Our {onejob} has cut a board and thirty counters out of a ration crate. We have a game.',
          '{one} taught us a game from home tonight. Nobody has won it yet and nobody has stopped.'],
        ['{two} has won eleven nights running. We think {two} cheats. We cannot prove it.',
          'The {twojob} has taken every hand this week. {one} has started checking the dice.',
          'We play for chores now. {two} has not cleaned the filter in a fortnight.'],
        ['We played for the last of the sweet ration tonight. {one} won it and gave it back.',
          'The game ran until the third hour. Nobody wanted to be the one to stop it.',
          '{one} and {two} played for who walks out to the far marker. {one} lost and went in the morning.'],
        ['Nobody asked for the dice tonight. {one} put them away without a word.',
          'We have not played in nine days. The board is out on the bench with the counters on it.',
          '{two} set the board up tonight and sat there. Nobody came.'],
      ],
    },
    {
      key: 'silence',
      coda: ['{one} spoke at supper tonight. {one} talked about home, and we let {one} talk.',
        '{one} has not said a word tonight. I have written this where {one} can read it.'],
      beats: [
        ['{one} has not said much this week. We have all noticed and none of us has said so.',
          'Our {onejob} has gone quiet. {one} works, and answers a direct question, and says no more.',
          '{one} did not speak at supper tonight. That is three suppers in a row.'],
        ['{one} works, eats, and goes to the cot. {one} answers when asked and no more than that.',
          '{one} has taken the far shifts, alone, and has asked for more of them.',
          '{one} sits outside after the work and looks at the ground until the light goes.'],
        ['I asked {one} what was wrong. {one} said no machine runs outside at night, and the silence keeps {one} awake. Then {one} went back to work.',
          'I asked {one} why the silence. {one} said every subject leads back to home, so it is easier not to start. I think that is the truth.',
          '{two} tried tonight and got further than I did. {one} talked for a minute about a house by a river, and who lives in it.'],
        ['{one} talked at supper tonight for ten minutes. Nobody interrupted.',
          '{one} asked {two} for the dice tonight. That is the first thing {one} has asked for in a month.',
          '{one} has started leaving notes on the bench in place of speech. They are good notes, and some of them are funny.'],
      ],
    },
    {
      key: 'cook',
      coda: ['{one} cooked tonight, with what is left, and it was good.',
        'There is one meal left in the store and {one} is saving it.'],
      beats: [
        ['{one} has taken over the food. It is better than it was and we have said so.',
          'Our {twojob} cooks now, and the roster says it is not {two}’s turn. Nobody has argued.',
          '{one} found spice in a personal kit and put it in the pot. The whole bay smelled of it.',
          '{one} has started cooking to a plan, a different dish each day of the week.',
          '{two} handed the pot over to {one} tonight and admitted defeat about it.'],
        ['{one} made a pudding out of the last of the dried fruit tonight. We ate it one spoon at a time.',
          '{one} has been growing greens in a tray for the pot. They went in tonight and they were good.',
          'We have a rule now: everybody sits down together. {one} made the rule and it has held.',
          '{one} baked a flat bread on the hot plate tonight. We ate the whole of it standing up.',
          '{one} asks what we want each week and writes it down. The store holds what it holds, and we all answer.'],
        ['There is no fresh food left to cook with. {one} sets the table every night all the same.',
          'It is the same meal every day now. {one} gives it a different name each time.',
          'Our {onejob} asked what was for supper tonight and then apologised for asking.',
          '{one} has started cutting the portions in the store room, alone, out of sight.',
          'The pot went on late tonight and not much went in it.'],
        ['{one} cooked the last good meal tonight. All of us knew it was the last one.',
          '{one} has stopped cooking. {one} hands out the packets and sits down with us.',
          'We ate cold tonight to save the power. {one} laid it out on plates all the same.',
          '{one} put the last of the spice in tonight, all of it, and said it was the right night.',
          '{one} cooked for the full crew and there was food left. Nobody wanted to be the one to say why.'],
      ],
    },
    {
      key: 'music',
      coda: ['{one} played for an hour tonight and none of us wanted it to stop.',
        'The whistle is on the shelf by the hatch. I hope somebody picks it up.'],
      beats: [
        ['{one} brought a whistle aboard and nobody knew. {one} played it tonight after supper.',
          'Our {twojob} sang while working today, without noticing, and then went red about it.',
          '{one} has made a drum out of a sample drum. It is a bad drum and we like it.',
          '{two} hums at work all day without knowing. {one} has started humming the same tune.',
          'We found a song tonight that every one of us knew. Nobody expected that.'],
        ['{one} plays most nights now. {two} has started singing with it and has a fair voice.',
          'We have all learned the one song {one} knows the whole of. It is not a good song.',
          '{one} and {two} worked out a second part tonight. It took two hours and it was worth it.',
          'We sing at supper now, every night, whether anybody feels up to it or not.',
          '{one} plays one tune before the lamps go down. We go to bed when it ends.'],
        ['We have songs now that nobody outside this ship knows the words to.',
          '{one} has written a verse about our {twojob}. It is unkind and it is funny.',
          'We recorded ourselves singing tonight and put it in the record. It will outlast us.',
          '{two} has written words for the tune {one} plays. They are about this ship.',
          'We played and sang for two hours and lost the whole evening to it. Nobody minded.'],
        ['{one} has not played for a week. I asked. {one} said it was not the night for it.',
          'The whistle has been on the shelf for nine days. Nobody has mentioned it.',
          '{one} played one tune tonight and stopped in the middle of it.',
          'Nobody has sung at supper for a week. We eat and we go.',
          '{one} played tonight for the first time in a month. {two} came and sat down for it.'],
      ],
    },
    {
      key: 'home', lead: 'message',
      coda: ['We each said a few words into the record tonight, for whoever gets it.',
        'There are messages in the store that will never be sent. They stay with the record.'],
      beats: [
        ['We each recorded a message home tonight. {one} took the longest by a long way.',
          'Message night. {two} did the whole of it in forty seconds and then sat outside for an hour.',
          'We sent the monthly messages today. Our {onejob} sent two and did not explain.',
          'We recorded for home after supper. {one} laughed all the way through and {two} did not.',
          'Message day. {two} did one for a sister and one for the baby the sister had after we left.'],
        ['{one} has written the same letter four times and sent none of them.',
          '{two} asked me how long a message takes to get home. I did not answer.',
          '{one} keeps a photograph taped inside the locker door. All of us have seen it and nobody asks.',
          '{one} reads the old messages back on the bad nights. We can hear them through the wall.',
          '{two} asked me to check whether a message had gone. It had. {two} asked again the next day.'],
        ['{one} has stopped recording messages. The rest of us still do it on the same night.',
          'We have had no reply to any message since the day we landed. We still send them.',
          '{two} recorded one tonight for a person who will be twelve years older when it arrives.',
          'Our {onejob} has stopped saying when in the messages. {one} only says where.',
          'We have sent forty messages home and none has come the other way. We sent two more tonight.'],
        ['{one} recorded a long one tonight and asked me to keep it with the record.',
          'We recorded our messages together tonight, all of us, in one go. It went easier that way.',
          '{one} asked whether the messages are worth the power. Nobody answered. We sent them.',
          '{one} recorded the last message sitting on the step with the hatch open.',
          'We put every message in the record tonight, and on the radio too. Twice is better than once.'],
      ],
    },
    {
      key: 'garden', lead: 'stay',
      coda: ['There is one green shoot in the tray tonight and {one} has watered it.',
        '{one} put the tray where the light falls longest. It is the last job {one} did today.'],
      beats: [
        ['{one} set a seed tray up in the bay today. It is not in the mission plan.',
          'Our {twojob} has planted the ration seed stock in a cut-down crate. Nobody stopped {two}.',
          '{one} has made a bed out of a spare panel and filled it with ground from outside.',
          '{two} has taken over the corner by the port with a row of cut-down bottles. Each has a seed in it.',
          'There is a tray of soil on the bench and nobody will say who started it.'],
        ['The seed tray has taken a cup of water out of the ration every day since day {since}. Nobody has voted against it.',
          '{one} runs a lamp over the seed tray for two hours a night. That is real power and we let it go.',
          'The seed tray has a name now. {two} wrote it on the side in marker.',
          'We all stop at the seed tray on the way past. It is a habit now.',
          '{one} has the seed tray on a timer and checks it against the clock twice a turn.'],
        ['Two shoots came up in the seed tray this week. {one} showed them to each of us in turn.',
          'There is a green shoot in the seed tray. We have all been to look at it more than once.',
          'The first shoot came up on the ninth day. {one} did not sleep that night and told us why.',
          'Four shoots in the tray now. {two} has measured every one of them and written the numbers up.',
          'We ate the first leaves from the seed tray tonight, cut in equal shares. They tasted of nothing and it was the best meal here.'],
        ['The shoots in the seed tray died. {one} has cleared the tray out and set it again.',
          '{one} checks the seed tray every morning. There is nothing in it. {one} checks.',
          'The seed tray is under the lamp with the last of the seed in it. {one} gives it the water.',
          'The lamp over the seed tray is the last one we turn off at night. We voted on that.',
          '{one} has moved the seed tray twice to find more light. There is no more light.'],
      ],
    },
    {
      key: 'naming', lead: 'stay',
      coda: ['The names are all in the record, with the map {two} drew.',
        'We put the map in the record tonight, with every name on it.'],
      beats: [
        ['We have started naming the ground. {one} named the east ridge today and the name has stuck.',
          'Our {onejob} named the flat ground north of us after a street at home. We all use it now.',
          'The three rises west of the ship have names as of tonight. {two} chose two of them.',
          '{two} named the wide flat after a grandmother and told us the whole story with it.',
          'We argued for an hour about the name of one rock and settled it by throwing dice.'],
        ['Every rise inside a day of walking has a name now. {two} keeps the map of them.',
          'The map has forty names on it. {one} draws it again every month, larger.',
          'We have named the weather too. There is a wind here we all call by the same name.',
          'Every hollow inside the walk has a name and a number. The book is {two}’s.',
          'The map of the named ground is on the bay wall now, a metre across.'],
        ['{one} put a marker on the far hill today. We can see it from the hatch in good light.',
          'We walked out to the far hill together and back. It took the whole day and nobody minded.',
          '{two} carved the name of this place into the hull plate by the hatch.',
          '{one} has put a cairn on the highest point inside the walk, with a note under the top stone.',
          'We walked the boundary of the whole named ground in one turn. It took us all of it.'],
        ['Nobody has named a place for a month. The map is where {two} left it.',
          'We named the last unnamed rise inside the walk today. There is no ground left to name.',
          '{one} gave the east ridge a second name today and could not recall the first.',
          'The map has not been opened in a fortnight. It is on the wall.',
          '{two} added one more name today, for the ground past the mast, and did not explain it.'],
      ],
    },
    {
      key: 'count', lead: 'doom',
      coda: ['The numbers on the wall have not changed and we have stopped looking at them.',
        '{one} did the sum again tonight and got the same answer.'],
      beats: [
        ['{one} asked tonight what happens if we miss the orbiter. {two} did the sum out loud. A second ship needs {years} years, and we have food for {many} days.',
          'We went through the flight tables after supper. No other ship is due in this system. One sent today would take {years} years.',
          'Our {onejob} worked out what a rescue would need: a ship, a crew, and {years} years of flight. Then {one} put the pad down.'],
        ['We have worked out what we can mend and what we cannot. The list of what we cannot is longer.',
          '{two} has made two lists on the wall: what we have, and how long it lasts. We look at the first one.',
          'Every system on this ship has a date on it now, the day it runs out. {one} wrote them all up in one evening.'],
        ['{one} has written the whole plan on the bay wall, with the day each store runs out. We look at it and we do not talk about it.',
          'The numbers on the wall say the food ends first. We have all read them and none of us has said it.',
          'Our {twojob} asked what happens on the last date on the wall. Nobody answered {two}.'],
        ['{two} rubbed the dates off the wall this morning. Nobody asked why.',
          'We have stopped doing the arithmetic. It comes out the same every time: the food ends first.',
          '{one} put a line under the last date tonight and closed the pad.'],
      ],
    },
  ]);

  // ---------------------------------------------------------------- the fauna threads
  //
  // One thread per way of moving, gated on the motion tag. A flyer flies, a burrower digs, a sky
  // whale never lands, a flow pours, a roller throws itself, and only an animal with legs walks a
  // road past the mast and lets a person walk beside it. The size is the size the fauna card
  // states, and a herd comes in a herd.
  const FAUNA_THREADS = pool([
    {
      key: 'walkherd', tags: 'beasts mwalk', if: g(herd),
      beats: [
        ['{Others} passed the mast this morning. {one} counted {n} of them and wrote it down.',
          'There is a band of animals here. {Others}, {size} each, {n} of them.',
          '{Others} crossed the flat at first light. {one} got the whole band on film.',
          'We have {others} on the record. {size}. They came past in a line of {n} and did not hurry.',
          '{Others} came through the landing circle at dawn. {one} did not move and they went round.',
          'A band of animals crossed the low ground this morning. {Others}, {size} each, {n} in the line.',
          '{Others} went past the mast at first light, {n} of them, one behind the other.'],
        ['{Others} came back today. There were {n} again. {one} counted them twice.',
          '{Kinds} came past again. Same count, same hour, same line across the flat.',
          '{Others} take the same route every morning. Our {onejob} has it on the map now.',
          '{Others} came through at dawn and one of them stopped to look at the rover.',
          '{Others} came again and the count held at {n}. {two} has the line of them on film.',
          'Same hour, same {n} {kinds}, same line. Our {onejob} calls it the morning traffic.'],
        ['We can set the clock by {others}. They pass the mast within ten minutes of the same hour.',
          '{one} walked out with the {kinds} this morning and kept pace for two kilometres.',
          '{two} sat on the step at dawn and let the {kinds} come. Three came inside twenty metres.',
          '{one} has named the {kind} at the front of the band. The name is on the film and on the map.',
          'We put food at the edge of the circle and four {kinds} came in for it.',
          '{one} has been out at dawn every day this week to meet the {kinds}. Nobody else gets up.'],
        ['{Others} did not come this morning. It is the first day they have missed since day {since}.',
          '{Others} came back tonight and there were more of them. {one} stopped counting at thirty.',
          'The {kinds} came through at a run today and did not stop. We did not see what they ran from.',
          'There were {n} {kinds} this morning and one would not get up when the rest went.',
          'The {kinds} came through the circle in the dark tonight. They have not done that before.',
          '{Others} passed within a metre of {one} this morning. {one} put a hand out and they let it happen.'],
      ],
    },
    {
      key: 'walkalone', tags: 'beasts mwalk', if: g(fewOf),
      beats: [
        ['{Other} came to the edge of the light last night. {size}. It stood there and then it went.',
          'One animal, on legs, {size}. {Other} crossed the flat at dusk and did not look at the ship.',
          'We have {other} on the record at {size}. It came out of the dark and stood at forty metres.',
          '{Other} walked past the forward leg this morning. {one} was outside and did not move.',
          '{Other} is on film at last. {size}, and it walks with the head low.',
          'One animal, one set of tracks. {Other}, {size}. No second one anywhere on this ground.',
          '{Other} was at the top of the ridge at dusk. {size}. {two} saw it first and called us all out.'],
        ['{Other} came to twenty metres today. {one} sat still on the step and it stayed an hour.',
          '{Other} has taken the same line past the ship three days running.',
          'Our {onejob} left food out at the edge of the circle. {Other} came and took it.',
          '{Other} was at thirty metres this evening and stayed while {two} set the camera up.',
          '{Other} came close enough today that we could see the eye move. Nobody breathed.'],
        ['{one} has named the {kind} {pet}. {pet} has a torn edge on one side, so we can tell it apart.',
          '{one} calls the {kind} {pet} now. The rest of us have started saying {pet} too.',
          'We have named the {kind}. {pet}, after the mark down one side. {one} chose and nobody argued.',
          '{two} named the {kind} {pet} this evening and wrote {pet} on the film case.',
          'The {kind} has a name as of tonight. {pet}. {one} said it out loud at supper and it stuck.'],
        ['{pet} comes every day now. It waits until we are outside, and then it comes in close.',
          '{pet} put its head against the hatch frame tonight. {one} put a hand on it.',
          '{pet} has not come for four days. {one} has been out to the ridge twice looking.',
          '{pet} came in through the landing circle tonight and lay down by the warm plate.',
          '{pet} brought a second one with it this morning. {one} had said there was only ever one.'],
      ],
    },
    {
      key: 'walkbig', tags: 'beasts mwalk', if: g((G) => bigBody(G)), lead: 'ride',
      beats: [
        ['{Other} walks past the ship each morning. {size}. It does not look at us at all.',
          'There is a large animal here. {Other}, {size}. Four legs, and in no hurry.',
          'We have measured {other} against the mast. {size}. It walked past while we did it.',
          '{Other} came through the circle this morning. {size}. The ground took the weight and shook.',
          '{Others} came over the ridge at dawn. {size} each, and the head above the mast top.',
          'We heard {other} before we saw it. {size}, and it came past at walking pace.'],
        ['{Other} takes the same road out at dawn and back at dusk. {one} has walked the road too.',
          'The {kinds} use one line across this ground, and they have used it for years.',
          'Our {onejob} followed the road the {kinds} use, four kilometres out. It goes where the low ground goes.',
          'The road the {kinds} use is worn a hand deep into the ground. {two} says it took years.',
          'The {kinds} go out at dawn and come back when the light goes. We set the day by them.'],
        ['{one} walked beside a {kind} for two kilometres today. It let {one} do it the whole way.',
          '{one} put a hand on the flank of a {kind} this morning. It stopped. Then it walked on.',
          '{two} walked out with the {kinds} at dawn and came back at noon, on foot, grinning.',
          'A {kind} stopped beside {one} today and stood there while {one} measured the leg.',
          '{one} has been feeding a {kind} off the step. It comes to the hand now and takes the food from it.'],
        ['{one} has been talking about getting on the back of a {kind}. Nobody has said no yet.',
          'The {kinds} stand still while we are near them now. {one} has noticed that and has an idea.',
          '{one} has made a harness out of cargo strap and will not say what for.',
          'A {kind} knelt today, right down, beside {two}. Nobody has talked about anything else since.',
          '{one} got a hand on the back of a {kind} this morning. The animal did not move.'],
      ],
    },
    {
      key: 'crawl', tags: 'beasts mcrawl', lead: 'catch',
      beats: [
        ['{Other} has no legs. {size} of body, and all of it against the ground. It crosses the flat faster than we walk.',
          'We have {other} on the record. {size}, and it moves by throwing a wave down the whole body.',
          'There is a long animal here. {Other}, {size}. It leaves one clean line in the dust and nothing else.',
          'Something crossed the circle in the night and left a single smooth track. {Other}, {size}.',
          '{Other} came out of the low ground at dusk. {size}, and the head was up the whole time.'],
        ['The line {other} leaves runs past the forward leg every second day. {one} has traced it to the ridge.',
          'We found {other} coiled by the warm ground under the bay. It stayed coiled while we looked.',
          'Our {onejob} timed the {kind} over a hundred metres. It is faster than any of us.',
          'The line the {kind} leaves goes under the rover and out the other side. {two} measured the width.',
          '{Other} came to the warm ground by the bay at dusk. It stayed an hour.'],
        ['{one} has named the {kind} {pet}. {pet} comes to the same warm spot most evenings.',
          'We call the {kind} {pet} now. {one} lay down beside {pet} today and it did not move.',
          '{two} named the {kind} {pet}, after the pale ring behind the head. The name is in the file.',
          'The {kind} is {pet} from tonight. {one} chose the name and the rest of us took it.'],
        ['{pet} was inside the bay this morning. {one} opened the hatch and it left in its own time.',
          'We found the whole track ends at a hole under the west ridge. Nobody has gone in.',
          '{pet} has not come to the warm plate in six days. {one} leaves it on anyway.',
          '{pet} was against the hull when we opened up this morning. It took its time going.',
          'There are two lines in the dust now. {one} says the second is smaller and newer.'],
      ],
    },
    {
      key: 'roll', tags: 'beasts mroll', lead: 'catch',
      beats: [
        ['{Other} folds itself into a ball and throws itself across the ground. {size}. It never walks.',
          'There is an animal here that travels in one long throw at a time. {Other}, {size}.',
          'We have {other} on film. {size}. It gathers, it folds, and then it is a hundred metres away.'],
        ['The {kinds} pick a line before they fold, and they hold it to the end. Our {onejob} has it on camera.',
          'A {kind} came through the landing circle in two throws today and missed the mast by a metre.',
          'The {kinds} stand a long while between throws. {one} says that is choosing. {one} may be right.'],
        ['{one} has named one {kind} {pet}. {pet} has a chip out of the hull on one side.',
          'We call the {kind} with the marked shell {pet}. {one} put markers out to track the throws.',
          '{two} named the {kind} {pet} after a throw went clean over the rover. The name held.'],
        ['{pet} came to rest against the forward leg tonight and stayed there.',
          'Three {kinds} went over the ridge in one line this morning, one after another.',
          '{pet} has stopped throwing. It has been in the same place two days and we do not know why.'],
      ],
    },
    {
      key: 'flow', tags: 'beasts mflow', lead: 'catch',
      beats: [
        ['{Other} has no shape. {size} when it gathers. It is a sheet a few paces wide when it goes.',
          'There is an animal here that pours. {Other}. {size} when it is a body at all.',
          'We have {other} on film. {size}, and no two frames show the same shape.'],
        ['{Other} runs the fall of the ground and gathers at the foot of each slope. Our {onejob} has timed it.',
          '{Other} sat on the high rock all day, gathered and still. {two} took it for a stone.',
          'The {kind} came down the west slope this morning in nine seconds. It took all afternoon to climb back.'],
        ['{one} calls the {kind} {pet}. {pet} is on the same rock most mornings.',
          'The {kind} has a name now. {pet}. {one} put a hand near {pet} and it drew back, then forward.',
          '{two} named the {kind} {pet} and drew {pet} on the wall. It gathers on the warm plate most nights.'],
        ['{pet} came over the step and into the bay tonight. {one} sat with it until it left.',
          '{pet} poured over the cable run and nothing was damaged. We have stopped worrying about it.',
          '{pet} has not been on the rock since the cold came. {one} goes and looks every morning.'],
      ],
    },
    {
      key: 'sling', tags: 'beasts msling flora',
      beats: [
        ['{Other} throws a cord at the {plants} and swings off the hold. {size}. It crosses the stand without touching the ground.',
          '{Other} travels through the {plants} on a line it grows itself. {size}.',
          'We have {other} on the record. {size}, and it has not touched open ground once.'],
        ['The {kind} works the thickest stand and never comes out of it. Our {onejob} has mapped the route.',
          'The cord takes hold, the {kind} winds back, and it is gone. {two} has that at high speed on film.',
          'The {kind} came within four metres of the mast today and went back into the {plants}.'],
        ['{one} calls the {kind} {pet}. {pet} has a short cord and mends it where we can watch.',
          'We have named the near {kind} {pet}. {one} sat in the stand at dusk until {pet} came close.',
          '{two} named the {kind} {pet} after finding a shed cord under a {plant}.'],
        ['{pet} threw a cord at the mast this morning and used it. Nothing broke.',
          'The {kinds} have moved out of the near stand. {one} walked two kilometres to find them.',
          '{pet} came back to the near stand tonight after nine days. {one} saw it first.'],
      ],
    },
    {
      key: 'fly', tags: 'beasts mfly', lead: 'follow',
      beats: [
        ['{Other} came over the ship this evening. {size}. It circled twice and went north.',
          'There are flying animals here. {Others}, {size} each. They pass at the same hour every day.',
          'We have {other} on film at {size}. It beat once, opened the wings, and was gone.',
          '{Other} came down the ridge line at dusk, low and fast, and did not land.',
          'First flyer on the record. {Other}, {size}. It went over the mast and did not come back that night.',
          '{Other} is on the record at last. {size}, and it beats twice and then holds for a hundred metres.',
          '{Others} came over the circle at dusk, two of them. {size} each, and they turned without a sound.'],
        ['{one} put a lamp on the mast. {count} {kinds} came and stayed until the lamp went out.',
          'The {kinds} come to the warm air over the radiators. There were {count} above us at noon.',
          'A {kind} landed on the dish this morning. It sat there for an hour and then went.',
          'The {kinds} cross the circle at the same hour every evening. {two} has the hour written down.',
          '{one} put food on the step and three {kinds} came down for it inside the hour.'],
        ['{one} has named the {kind} with the torn wing {pet}. {pet} comes to the lamp most nights.',
          'The {kind} with the torn wing is {pet} from tonight. {one} named it and we all use it.',
          '{two} named one {pet} and can pick it out of six now, every time.',
          'We have a name for the bold one. {pet}. It came down to the step for food today.'],
        ['A {kind} came into the bay through the open hatch today. {one} got it out with a sheet.',
          '{pet} has not come to the lamp for five nights. {one} keeps the lamp on.',
          'The {kinds} all went south this morning, every one of them. The sky has been empty since.',
          '{pet} came in through the hatch tonight and would not go out. {one} sat with it until dawn.',
          'The whole flock of {kinds} came over at midnight. They have never done that. We all went out.'],
      ],
    },
    {
      key: 'swarm', tags: 'beasts mswarm',
      beats: [
        ['{Others} are not one animal. {size}. They came over the ridge together and turned as one thing.',
          'There is a swarm on this world. {Others}. {size}. There is no one body to point at.',
          'We have {other} on film. {size}. Our {onejob} has tried to count the parts and cannot.'],
        ['The {kind} comes over the ship at the same hour and holds there for a minute.',
          '{one} walked into the {kind} today. It opened round {one} and closed again behind.',
          'The {kind} broke into three over the ridge this morning and was one thing again by the flat.'],
        ['{one} put a lamp out and the {kind} came down to it and stood in the air over it.',
          '{two} has recorded the sound of the {kind}. It is a low note that changes when the {kind} turns.',
          'The {kind} has started coming twice a day. It comes closer each time.'],
        ['The {kind} came through the landing circle at head height. None of us moved and none was touched.',
          'The {kind} has not come for three days. The air over the flat is empty, and we miss the {kind}.',
          'The {kind} went over at midnight, which it has never done. {one} woke all of us for it.'],
      ],
    },
    {
      key: 'drift', tags: 'beasts mdrift',
      beats: [
        ['{Other} came over on the wind this morning. {size}. It does not land and it cannot.',
          'There are bladders of gas that live in the air here. {Other}, {size}. It cannot steer, and it goes where the wind blows.',
          'We have {other} on the record. {size} of sac, and it goes where the air goes.',
          '{Other} came over the ridge this morning with the wind behind it. {size}.',
          '{Other} is on film at two hundred metres. {size}. It cannot steer, and the wind took it east.',
          '{Other} is over the flat now and has been there since dawn. {size}.'],
        ['Three {kinds} came over the flat today at fifty metres, all going the same way.',
          'The {kinds} hang over the warm ground on the south side and turn, one turn in a minute. Our {onejob} has film.',
          'A {kind} came down to twenty metres over the mast and hung there for most of an hour.',
          'The {kinds} come with the evening wind, in ones and twos, and go out with it.',
          '{two} has worked out the height the {kinds} hold. It is the same every day.',
          'One caught the warm air off the radiators today and rose the whole way out of sight.'],
        ['{one} has named the {kind} {pet}. {pet} has a dark band round the middle of the sac.',
          'The {kind} is {pet} from tonight. {one} named it off the dark band round the sac.',
          '{two} named the {kind} {pet} and has drawn {pet} twice from underneath, with the pattern right.',
          'We call the low one {pet}. It came over at ten metres tonight and {one} was under it.'],
        ['{pet} caught on the mast today. {one} freed it with a pole and it went on.',
          'The wind turned and took every {kind} east. There has been nothing over us for a week.',
          '{pet} came back on the turn of the wind tonight. {one} saw it first and shouted.',
          'The wind has blown one way for nine days and nothing has come over. {one} still goes out.',
          '{pet} came over at dusk with three others behind it, all at the same height.'],
      ],
    },
    {
      key: 'cruise', tags: 'beasts mcruise', lead: 'follow',
      beats: [
        ['{Other} crossed the sky this morning. {size}. It never comes down to the ground.',
          'There is a whale of the air on this world. {Other}, {size}, and it cruises all day.',
          'We have {other} on the record at {size}. It goes over at two hundred metres and does not stop.',
          '{Other} came over at dawn, {size} of it. The shadow crossed the whole landing circle.'],
        ['The {kind} dips toward the ground and pulls up again, over and over, all the way across.',
          'Our {onejob} has the song of the {kinds} on tape. It is very low and it carries.',
          'Two {kinds} crossed together today, one above the other, holding the same line.'],
        ['{one} calls the {kind} with the pale belly {pet}. We can pick {pet} out at any height.',
          'The {kind} has a name now. {pet}, for the pale mark down the belly. {two} chose it.',
          'We have started calling one {kind} {pet}. {one} can pick {pet} out at two hundred metres.'],
        ['{pet} has crossed at the same hour for thirty days. {two} says the {kind} keeps a schedule.',
          'The sky has been empty for eleven days. {one} goes out at dusk anyway.',
          '{pet} sang over the ship last night and the hull carried it. Nobody slept after.'],
      ],
    },
    {
      key: 'dig', tags: 'beasts mdig', lead: 'catch',
      beats: [
        ['The seismometer finds {other} long before the camera does. {size}, and the camera has nothing.',
          'There is something moving under this ground. {Other}, {size}. We have not seen it once.',
          'We have {other} on the record and not on film. {size}. It pushes a mound ahead of it as it goes.'],
        ['{Other} crossed the landing circle in the night and left a raised line. {one} traced the whole of it.',
          'The mound {other} pushes came past the forward leg in the night. Our {onejob} has it on the instrument.',
          '{two} followed the line the {kind} leaves out to the ridge. It runs two kilometres and turns back.'],
        ['{one} calls the {kind} {pet}. {pet} works the same square of ground most nights.',
          'We have named the one under the circle {pet}. {one} lay flat and felt it go under.',
          '{two} named the {kind} {pet} after {pet} came to the warm plate we put down. It came three nights in a row.'],
        ['{pet} came up at the edge of the circle tonight. We saw the back of it and nothing more.',
          'The ground under the aft leg has sunk a hand. The {kind} digs under there, and the seismometer shows it.',
          '{one} wants to dig a {kind} out and look at it. I have said no twice.'],
      ],
    },
    {
      key: 'anchor', tags: 'beasts manchor', lead: 'catch',
      beats: [
        ['{Other} does not travel at all. {size}. We have it marked and numbered where it stands.',
          'There is an animal here that stays in one place. {Other}, {size}.',
          'We have {other} on the record. {size}. Number four is forty metres from the hatch.'],
        ['There are nine {kinds} inside the square. {one} has marked and numbered every one.',
          'The {kind} goes down when we come near, and comes back up an hour after we have gone.',
          'Our {onejob} sat forty metres off with the long lens and got the whole {kind} on film.'],
        ['{one} calls number four {pet}. {pet} stays up now while {one} works within ten metres.',
          'Number four has a name. {pet}. {one} has been sitting near it for an hour a day.',
          '{two} named number four {pet} and put a marker beside it.'],
        ['{pet} has not come up in four days. {one} goes out and sits there anyway.',
          'Two of the nine {kinds} have gone. The holes are open and there is nothing in them.',
          '{pet} came up while {one} had a hand on the ground beside it. Neither of them moved.'],
      ],
    },
  ]);

  // ---------------------------------------------------------------- the endings
  //
  // The last entry. Twelve kinds, and every kind holds three wordings or more. Two things steer
  // the roll, and both are tags, so lore.js gives them the weight it gives any gate:
  //
  //   lead<kind>   the threads of this log point at this ending. A quarrel ends in a split, a
  //                hurt keeper ends in a second hand, a big walker ends in a ride.
  //   harsh        a world that kills a crew on its own. The doom faced calmly belongs there.
  //
  // A gated ending outranks one that fits any world, so the ending follows the story. An ending
  // that reads the genome takes the people of the fauna thread, because it is the last beat of
  // that thread in all but name.
  //
  // **An ending that sends people away says where they go and what for.** The walk goes to the
  // supply drop, to the heat of the vents, or round the shore. The crew that stays says why a
  // person can live here, and that ending is shut to a world where no person can.
  //
  // The launch is not rolled. The `patched` strand thread forces it with `end`, and every wording
  // is gated on `leadlaunch`, so no other log reaches it: a crew with a dead lander cannot lift.
  const ENDINGS = pool([
    // --- the known doom, faced calmly
    { kind: 'doom', t: 'The cells are down to the transmitter and the clock. We read the log back once tonight and closed it. Whoever comes, take it home.' },
    { kind: 'doom', t: 'The air scrubber failed this morning and we cannot mend it. We have about a day of air. {one} is making supper.' },
    { kind: 'doom', t: 'The last of the food went today. {one} shared it out in equal parts. Nobody said a word about tomorrow.' },
    { kind: 'doom', t: 'We have put all the power that is left into the transmitter. It will send this log for four days after we stop. We agreed on that tonight, all of us.' },
    { kind: 'doom', w: 2.5, tags: 'leaddoom', t: 'We have reached the last date on the wall. All of us knew it. Tonight we sat down together at the table and stayed there.' },
    { kind: 'doom', w: 2.5, tags: 'leaddoom', t: 'There is nothing left to mend and nothing left to mend it with. We have stopped work. The log is closed and the transmitter is on.' },
    { kind: 'doom', tags: 'harsh', t: 'No crew can last on this world without a ship to leave in. We have known the date for a month and we worked right up to it. Come and take the log.' },
    { kind: 'doom', w: 2.5, tags: 'harsh leaddoom', t: 'We shut the outer bay for the last time tonight. Nobody will open it from the inside. The log is in the hardened store and the dish points at home.' },
    { kind: 'doom', tags: 'frozen|subzero|cold', t: 'The heaters go off tonight, because the cells are empty. At {temp} the log will keep far better than we will. We have said what we wanted to say to each other.' },
    { kind: 'doom', tags: 'hot|molten', t: 'The radiators are finished. At {temp} we have until noon. The log goes in the hardened store, which can take the heat. We cannot.' },
    { kind: 'doom', tags: 'longday|slowspin', t: 'Dawn is {night} away and the cells will not reach it. We are writing this in the dark. When the heaters stop, we stop.' },
    { kind: 'doom', tags: 'polarnight', t: 'The sun goes round the horizon once more and then it will stop rising. The cells cannot last the dark season. We have closed the log while there is light to close it in.' },
    // --- the reckless plan: ride it. Only an animal with legs, and a big one.
    { kind: 'ride', w: 4.5, tags: '!leadsecond beasts mwalk leadride', if: g(bigBody), t: 'Tomorrow {one} and I will try to ride {other}. They are {size} and they pass at dawn. {two} says it is a bad plan. {two} is right. We are going all the same.' },
    { kind: 'ride', w: 4.5, tags: '!leadsecond beasts mwalk leadride', if: g(bigBody), t: 'We are getting on the back of a {kind} in the morning. {two} has the harness finished. The {kinds} walk to water and food every day, and we have neither.' },
    { kind: 'ride', w: 4.5, tags: '!leadsecond beasts mwalk leadride', if: g(bigBody), t: 'The {kinds} walk the same road every dawn and we are going with them. {size}, and two of us. {one} has not stopped smiling.' },
    { kind: 'ride', w: 2, tags: '!leadsecond beasts mwalk', if: g(bigBody), t: 'Tomorrow we ride one of {others} until it puts us off. We have watched them for {days} days. There is no food left here, and the {kinds} know where food is.' },
    // --- the reckless plan: take hold of one
    { kind: 'catch', w: 2, tags: '!leadsecond beasts mwalk', if: g(handBody), t: 'Tomorrow we take one of {others} and hold it long enough to measure. {size}. {one} has made a net out of the cargo webbing. We let it go after.' },
    { kind: 'catch', w: 2, tags: '!leadsecond beasts mwalk', if: g(handBody), t: 'We are catching a {kind} in the morning. {size}, and {one} says two of us can hold that. I do not think {one} is right. It is the last item on the survey list, and we will finish the list.' },
    { kind: 'catch', w: 4.5, tags: '!leadsecond beasts mdig leadcatch', t: 'Tomorrow {one} and I dig down beside the line the {kind} leaves, and wait. I said no for {days} days. I have stopped saying no.' },
    { kind: 'catch', w: 2, tags: '!leadsecond beasts mdig', t: 'We start the trench at first light, right across the run the {kind} uses. We sit in it until the {kind} comes through. {one} has the camera.' },
    { kind: 'catch', w: 2, tags: '!leadsecond beasts manchor', t: 'Tomorrow {one} and I sit down beside {pet} at dawn and stay there all day. We want to see the whole of it come up. No survey has that on film.' },
    { kind: 'catch', w: 4.5, tags: '!leadsecond beasts mcrawl|mroll|mflow leadcatch', t: 'Tomorrow {one} and I put hands on a {kind} and hold it long enough to weigh. {size}. We let it go straight after. {two} says we will not manage it.' },
    { kind: 'catch', w: 2, tags: '!leadsecond beasts mcrawl|mroll|mflow', t: 'We take a {kind} in the morning and get the whole of it on the scale. {one} has the webbing ready. Nobody has done this before.' },
    { kind: 'catch', w: 2, tags: '!leadsecond beasts msling flora', t: 'Tomorrow we go into the {plants} and wait with the net. {one} has picked the hold the {kinds} use most. We want one in the hand for an hour, and then we let it go.' },
    { kind: 'catch', w: 2, tags: '!leadsecond beasts manchor', t: 'We are going to sit by the holes the whole turn, both of us, and not move. {one} says the {kind} will come up. I think {one} is right.' },
    // --- the reckless plan: follow it
    { kind: 'follow', w: 4.5, tags: '!leadsecond beasts mfly leadfollow', t: 'Tomorrow we put the last of the power into the lamp and count the {kinds} that come. {one} wants them all on film. It will not save us. It is what we want to do with the power.' },
    { kind: 'follow', w: 2, tags: '!leadsecond beasts mfly', t: 'We are following the {kinds} to the place they go at dusk. {one} has the rover charged. The rover cannot make the trip back, and we know it.' },
    { kind: 'follow', w: 2, tags: '!leadsecond beasts mfly', t: 'We are putting a line and a small camera on a {kind} in the morning. {one} has tied the knot four times. Tomorrow we find out where they sleep.' },
    { kind: 'follow', w: 4.5, tags: '!leadsecond beasts mcruise leadfollow', t: 'Tomorrow we take the rover south under the {kinds} and keep going while they are up. {one} has the tape running. We want to hear the whole song once.' },
    { kind: 'follow', w: 2, tags: '!leadsecond beasts mcruise', t: 'The {kinds} cross at the same hour. Tomorrow we will be out on the open ground under them. We are taking every camera we have.' },
    { kind: 'follow', w: 2, tags: '!leadsecond beasts mswarm|mdrift', t: 'Tomorrow {one} and I go out on to the open flat and let the {kind} come over us. We want to stand under it once, close. We have no other work left.' },
    { kind: 'follow', w: 2, tags: '!leadsecond beasts mroll|mflow|msling|mcrawl', t: 'Tomorrow {one} and I follow {pet} until it stops, however far that is. We want to see where it lives. We have no other work left.' },
    // --- the walk out, on foot, toward something real
    { kind: 'walk', w: 2, t: 'We start walking north in the morning, all of us, to the supply drop. It is {far} kilometres and we have air for half of that. {one} has the map and {two} has the water. To stay is certain, and the walk is not.' },
    { kind: 'walk', w: 3.5, tags: 'leadwalk', t: 'We are going out to look for the one we lost. All of us, on foot, at first light, along the track and past the end of it. To stay here saves nobody.' },
    { kind: 'walk', tags: 'mostlysea waterliquid', t: 'We leave on foot at dawn and we follow the shore round to the far side. The map shows fresh water there. It is nine days of walking and we have food for six. {one} says we can do it.' },
    { kind: 'walk', tags: 'volcanic', t: 'We walk out in the morning, south toward the vents. The cells are dead, and there is heat at the vents and none here. We are taking the log with us.' },
    { kind: 'walk', tags: 'geysers', t: 'We leave at first light and walk to the geyser field. The ground is warm there and the heaters here are dead. We will build a shelter against a rock and wait.' },
    // --- the launch. The reader knows how it went, because the wreck is here.
    { kind: 'launch', tags: 'leadlaunch', t: 'We climb at first light. The orbiter leaves tomorrow, on day {due}. {one} gives the patched feed line one chance in three. We leave a copy of this log in the ground store, so somebody knows we tried.' },
    { kind: 'launch', tags: 'leadlaunch', t: 'We have put every loose item out on the ground, to save weight. We climb at dawn on the patched feed line. If you read this at the landing site, the line did not hold.' },
    { kind: 'launch', tags: 'leadlaunch', t: 'The engine held for nine seconds in the test, and the climb takes six minutes. We go in the morning, all of us, because the orbiter leaves on day {due}. {two} has said goodbye to the place out loud.' },
    { kind: 'launch', tags: 'leadlaunch', t: 'Our {onejob} says the climb is tomorrow or never. So it is tomorrow. We have copied the log to the ground store. If the feed line bursts, the log stays here and we do not.' },
    // --- the split
    { kind: 'split', t: 'We have split the food and the water in two. {one} and {two} walk north at dawn, to the supply drop, {far} kilometres off. I am staying here with the transmitter.' },
    { kind: 'split', w: 6, tags: 'leadsplit', t: '{one} goes north to the supply drop in the morning and I stay with the radio. We are both sure we are right. We have each written the other a letter and neither of us has read one.' },
    { kind: 'split', w: 6, tags: 'leadsplit', t: 'It was settled tonight without a row. {one} walks to the supply drop at dawn, and {two} stays with the radio. The rest of us keep the mast up.' },
    { kind: 'split', tags: 'mostlysea waterliquid', t: '{one} and {two} follow the shore east at dawn, to look for fresh water. The rest of us stay with the ship. We shook hands tonight and nobody made a speech.' },
    // --- the entry that stops
    { kind: 'cut', w: 2, t: 'The hatch alarm is going and {one} is shouting for me. I will finish this when I' },
    { kind: 'cut', w: 2, t: 'The forward leg has made a loud crack and {one} has taken the lamp out to it. I am going out to' },
    { kind: 'cut', w: 2, t: '{one} says there is a light on the ridge and it is not ours. I am going up to the mast to' },
    { kind: 'cut', w: 2, t: 'The whole deck has just moved and I can hear water in the lower bay. {two} is at the hatch. I have to' },
    // --- the second hand
    { kind: 'second', w: 3.5, tags: 'leadsecond', t: 'This is {one}. {keeper} kept this log. {keeper} died three days ago, of the fever from the wound. I do not write as well but somebody had to finish it.' },
    { kind: 'second', w: 3.5, tags: 'leadsecond', t: 'This is {one}, the {onejob}. {keeper} wrote every entry above this line and asked me to write this one. I have read it all back. It is true.' },
    { kind: 'second', t: 'This is {two}. {keeper} kept the log to the end. {keeper} died in the night, in the bunk. The rest of us are still working.' },
    { kind: 'second', t: 'This is {one}. {keeper} is dead and I have added nothing to what {keeper} wrote. I have closed the log and set the transmitter to repeat it.' },
    // --- the quiet one: they stay. Only where a person can live outside the hull.
    { kind: 'stay', tags: 'temperate waterliquid', t: 'Nobody is coming for us. {one} said we could try to live here, and no one had a better plan. The air is good and there is water. Tomorrow we begin on a proper roof.' },
    { kind: 'stay', tags: 'temperate waterliquid', t: 'We took the seats out of the lander today and made a room of it. The lander will not fly, so it is a house. {one} is cutting a window.' },
    { kind: 'stay', w: 3.5, tags: 'leadstay temperate waterliquid', t: 'We voted tonight and it was not close. We stay, and we make a life here. In the morning we break ground beyond the mast for a field.' },
    { kind: 'stay', w: 3.5, tags: 'leadstay flora temperate waterliquid', t: 'We have cleared ground beyond the mast and sown the seed store in it. Some of it has come up. {one} says a crew can live here for years, and we have said we will try.' },
    // --- the message to whoever finds the log
    { kind: 'message', tags: 'waterliquid', t: 'Whoever finds this: the ground is firm and the water is good. We were {crew}. We were here {days} days and we did the work.' },
    { kind: 'message', t: 'Whoever finds this: the record is complete and every number in it is ours. We were {crew}. We were here {days} days.' },
    { kind: 'message', w: 3.5, tags: 'leadmessage', t: 'To whoever comes: take the record, and take the names off the board by the hatch. Tell the families where we are. The rest is data.' },
    { kind: 'message', tags: 'beasts', t: 'Whoever finds this: {others} will not hurt you. Sit still and they will come. We were here {days} days and that was the best part of it.' },
    { kind: 'message', t: 'If you read this, you stand where we stood. Bring a second lander. We had one, and it was not enough. Keep the mast up if you can.' },
    // --- the last joke
    { kind: 'joke', w: 1.6, t: '{one} says we should charge the next crew rent. We laughed for a long time. We wanted that to be the last entry in the log.' },
    { kind: 'joke', w: 1.6, t: '{one} has written a sign and hung it on the hatch. It says: gone out, back late. We have left it up.' },
    { kind: 'joke', w: 1.6, t: '{two} wants it on the record that {two} never liked this planet. It is on the record now. {one} seconds it.' },
    { kind: 'joke', w: 1.6, t: 'We voted tonight on a name for this place. {one} won with one vote, which was {one}’s own. The name is on the hull.' },
    { kind: 'joke', w: 1.6, t: 'Our {onejob} asks that the next crew bring a better cook. Our {twojob} asks that the next crew bring a better {onejob}. Both requests are logged.' },
  ]);
  // Every kind an ending may carry. The audit reports the spread over 200 worlds against it.
  const ENDING_KINDS = [...new Set(ENDINGS.map((e) => e.kind))];

  // Each thread carries the kind of thread it is, so an entry can name the thread it came from in
  // its `slot` and the audit can report the spread of the kinds over many worlds.
  for (const t of WORLD_THREADS) t.kind = 'world';
  for (const t of CREW_THREADS) t.kind = 'crew';
  for (const t of FAUNA_THREADS) t.kind = 'fauna';
  for (const t of STRAND_THREADS) t.kind = 'strand';

  // ---------------------------------------------------------------- the people
  // Given names from many languages, short ones and long ones. A log never gives a surname. No
  // place of the Earth and no species of the Earth, the rule docs/flora.md states for the plants;
  // a given name is neither. No name here is also a plain English word a line may use, because
  // the audit reads a name in the text as a person.
  const NAMES = [
    'Ana', 'Amir', 'Aila', 'Bo', 'Bram', 'Cato', 'Chen', 'Dara', 'Dev', 'Dilan',
    'Eda', 'Eero', 'Elif', 'Emil', 'Esi', 'Farid', 'Gil', 'Gita', 'Hana', 'Hedda',
    'Hugo', 'Ines', 'Isa', 'Ivo', 'Jana', 'Jonas', 'Juno', 'Kai', 'Kira', 'Kofi',
    'Lars', 'Lena', 'Leo', 'Lina', 'Liv', 'Luca', 'Mai', 'Marek', 'Mina', 'Mira',
    'Nadia', 'Nils', 'Noor', 'Nuri', 'Omar', 'Oskar', 'Otto', 'Pavel', 'Pia', 'Priya',
    'Raj', 'Rami', 'Rosa', 'Ruben', 'Sami', 'Sanne', 'Sara', 'Suri', 'Sven', 'Tam',
    'Tariq', 'Tilda', 'Tomas', 'Tova', 'Uma', 'Vera', 'Viktor', 'Wen', 'Yara', 'Yuki',
    'Yves', 'Zane', 'Zeno', 'Zoya',
    'Abebe', 'Adaeze', 'Akira', 'Alinta', 'Anouk', 'Aroha', 'Bao', 'Benedikt', 'Birgit', 'Callum',
    'Chidi', 'Consuelo', 'Dagny', 'Dmitri', 'Emeka', 'Esperanza', 'Fatima', 'Feodor', 'Giulia', 'Goran',
    'Halima', 'Hamza', 'Ignacio', 'Ioana', 'Itzel', 'Jamila', 'Jarrah', 'Kalani', 'Kwame', 'Leilani',
    'Lorcan', 'Magnus', 'Mateo', 'Mbali', 'Mehmet', 'Nayeli', 'Ngozi', 'Nikolai', 'Oksana', 'Paulo',
    'Piotr', 'Quentin', 'Rangi', 'Rhiannon', 'Seung', 'Shirin', 'Tevita', 'Thandiwe', 'Ulrich', 'Umberto',
    'Valentina', 'Vikram', 'Winona', 'Wiremu', 'Yerlan', 'Zainab', 'Zoltan',
  ];
  // One role each. A ship this small gives everybody one job and no second one. The log names the
  // job as often as the name, because no pronoun stands for a person here.
  const ROLES = ['pilot', 'engineer', 'medic', 'biologist', 'geologist', 'cook', 'radio operator',
    'navigator', 'mechanic', 'chemist', 'surveyor', 'quartermaster'];

  // ---------------------------------------------------------------- who these people are
  // Every person but the keeper carries one TRAIT: a fact of the life before this flight, or a
  // habit the rest of the crew has to live with. A trait holds three ASIDES, and writeLog() adds
  // one of them to the end of an early entry that names that person. So the reader learns who
  // {who} is in the middle of the work, the way a crew learns it, and not from a list.
  //
  // An aside stands on its own: it opens on {who} or on "Our {whojob}", never on a pronoun, and it
  // claims no fact of the world and no event of a thread. It goes on an EARLY entry only, because
  // a line about a bag of sweets does not follow a death.
  const TRAITS = [
    { key: 'firstflight', say: [
      '{who} is the youngest of us, and this is the first flight {who} has made.',
      '{who} is twenty-four and had not left the home world before this.',
      '{who} asks a question about every job and writes the answer in a small book.'] },
    { key: 'veteran', say: [
      '{who} has made six landings. This is the first one {who} talks about at supper.',
      '{who} flew survey ships for twenty years and was due to retire after this flight.',
      '{who} has a scar across one palm from an older ship and will not tell the story.'] },
    { key: 'parent', say: [
      '{who} has two daughters at home. The drawings they made are taped over the bunk.',
      '{who} counts the days to a birthday at home, and not by the mission clock.',
      '{who} records a bedtime story every tenth day and stores it for the trip home.'] },
    { key: 'farm', say: [
      '{who} grew up on a farm and is awake before the rest of us.',
      '{who} picks up a handful of ground on every new site and smells it. The family farmed.',
      '{who} mends a broken part with wire first and asks for the proper spare after.'] },
    { key: 'money', say: [
      '{who} signed on for the pay. There is a house at home with a debt on it.',
      '{who} worked out the pay per day on the first night and told us the figure.',
      '{who} sends the whole wage home to a brother who is sick.'] },
    { key: 'reader', say: [
      '{who} brought one book and has read it four times. {who} reads it aloud if asked.',
      '{who} reads the repair manuals at supper, for pleasure, and quotes them.',
      '{who} can recite a long poem from school, and did, once, without being asked.'] },
    { key: 'talker', say: [
      '{who} talks through every job. We know the name of every person on the street {who} grew up on.',
      '{who} tells a story with every task, and most of the stories are true.',
      '{who} talks to the machines. The machines, {who} says, are better listeners than we are.'] },
    { key: 'tidy', say: [
      '{who} lays the tools out in one order and knows when one has been moved.',
      '{who} folds the blanket square every morning, here, where no officer will ever inspect it.',
      '{who} labels every box, shelf, and cable. The labels are in three colours and we obey them.'] },
    { key: 'faith', say: [
      '{who} says a short prayer before every meal and does not ask us to join.',
      '{who} keeps a day of rest, even here, and makes up the hours the day after.',
      '{who} wears a small medal on a cord, from a grandmother, and holds it on every descent.'] },
    { key: 'joker', say: [
      '{who} has told the same three jokes since launch. We laugh at the second one.',
      '{who} hid a joke note in every ration crate before launch. We are still finding them.',
      '{who} gives every tool a rude name. We all use the names now.'] },
    { key: 'sleepless', say: [
      '{who} sleeps four hours a night and spends the rest at the port with the lamp off.',
      '{who} is awake at all hours. {who} says a quiet ship is the best place to think.',
      '{who} takes every night watch that is offered and has never once been caught asleep.'] },
    { key: 'artist', say: [
      '{who} draws each of us at work. The drawings are good and nobody asked for them.',
      '{who} has filled half a notebook with drawings of the ground here, all in pencil.',
      '{who} drew the whole crew on the inside of the hatch, and gave everybody a better chin.'] },
    { key: 'runner', say: [
      '{who} runs the landing circle twenty times every morning, in the suit.',
      '{who} was a runner at school and hates to sit. {who} stands up to eat.',
      '{who} does pull-ups on the hatch frame before each shift and counts them out loud.'] },
    { key: 'standin', say: [
      '{who} joined the crew nine days before launch, in place of a person who fell sick.',
      '{who} was the reserve for this flight and did not expect to fly. {who} packed in one night.',
      '{who} met the rest of us nine days before launch and has worked twice as hard since.'] },
    { key: 'boat', say: [
      '{who} grew up on a boat and cannot sleep in silence. The air fan is enough.',
      '{who} ties every knot on this ship. {who} learned them on a boat, from a father.',
      '{who} walks the deck with the feet wide apart, from a childhood on boats.'] },
    { key: 'teacher', say: [
      '{who} taught school for ten years before this. {who} explains every point twice without being asked.',
      '{who} used to teach children, and marks our log sheets for spelling.',
      '{who} left a classroom for this flight. The class sent a card, and it is on the wall.'] },
    { key: 'twin', say: [
      '{who} has a twin at home who also applied. Only one place was open.',
      '{who} writes to a twin every week. The letters start in the middle of a sentence.',
      '{who} says a twin at home would have been the better choice for this crew. We do not agree.'] },
    { key: 'letters', say: [
      '{who} writes a letter on paper every week and keeps them all in a tin.',
      '{who} keeps a diary in a code. {who} says it is for the grandchildren.',
      '{who} has a tin of letters from home, read soft at the folds.'] },
    { key: 'sweets', say: [
      '{who} brought a bag of boiled sweets and hands out one each a week, on the same day.',
      '{who} has a jar of pickles from home and guards it. We each got one on landing day.',
      '{who} smuggled a bottle aboard. It is for the day we go home, {who} says, and for no other day.'] },
    { key: 'heights', say: [
      '{who} does not like heights and climbs the mast all the same when the turn comes.',
      '{who} is afraid of the dark and told us so on the first night. Nobody laughed.',
      '{who} gets sick in the rover and drives it all the same.'] },
    { key: 'wedding', say: [
      '{who} is to be married four days after we get home. The date is written inside the locker.',
      '{who} carries a ring in the suit pocket, for a question to be asked at home.',
      '{who} talks about one person at home, every day. We have all been invited to the wedding.'] },
    { key: 'unwilling', say: [
      '{who} did not want this flight. The first choice dropped out and {who} was next on the list.',
      '{who} said on day one that this was the last flight. {who} has a garden waiting at home.',
      '{who} turned this flight down twice. The third offer doubled the pay.'] },
    { key: 'stars', say: [
      '{who} knows the home constellations by heart and is drawing new ones for this sky.',
      '{who} goes out after every shift to look up. {who} has named eleven stars so far.',
      '{who} wanted to fly since the age of six, and says so about once a week.'] },
    { key: 'hands', say: [
      '{who} carves small figures out of packing foam. Each of us has one on the bunk shelf.',
      '{who} knits. {who} brought the wool in place of the personal allowance of books.',
      '{who} cuts hair, and cuts it well. We line up once a month.'] },
  ];
  const ASIDE_CHANCE = 0.45;     // an early entry that names a person takes an aside this often
  const ASIDE_FORCE = 0.7;      // and only while the story is this young
  const ASIDE_MAX = 2;          // asides about one person in one log

  // The names a crew gives one animal. Plain words, and never a name of the Earth. No word here
  // is also a given name in NAMES, so the audit can tell a crew name from an animal name.
  const PET_NAME = ['Pip', 'Nine', 'Grey', 'Boot', 'Rust', 'Patch', 'Cup', 'Pim', 'Stump', 'Spot',
    'Big One', 'Old One', 'Half Ear', 'Slow', 'Dot', 'Mo'];

  // ---------------------------------------------------------------- the name of the ship
  // Plain English nouns and a mark number. No place of the Earth and no species of the Earth.
  const PROBE_NAME = ['Anvil', 'Bastion', 'Fathom', 'Harrow', 'Keystone', 'Lantern', 'Ledger',
    'Margin', 'Plumb', 'Quadrant', 'Sextant', 'Tessera', 'Trestle', 'Vantage', 'Verge', 'Warden'];

  // ---------------------------------------------------------------- the shape of the log
  const CREW_MIN = 3, CREW_MAX = 5;
  const ENTRY_MIN = 8, ENTRY_MAX = 20;
  const BEAT_MIN = ENTRY_MIN - 2;       // the landing and the ending are not beats
  const BEAT_MAX = ENTRY_MAX - 2;
  const THREAD_MIN_BEATS = 3;
  const CODA_SENTENCES = 6;             // the ending and its coda together
  const MISSION_MIN = 42, MISSION_MAX = 240;   // turns of this planet, from the landing
  // The gaps between entries. They start short, open out in the middle, and close again at the
  // end, so the last days of the story crowd together. That is the shape a reader feels as speed.
  const GAP_FLOOR = 0.14;

  // The latitude of the source, in the words the log uses. A source stands inside SOURCE_LAT, 80
  // degrees, so the text never has to name a pole. EQUATOR_DEG is how near the line a source must
  // stand before the log calls it the equator: 3 degrees is about 330 km on a world the size of
  // the Earth, and the word is a place and not a measurement.
  const EQUATOR_DEG = 3;
  function latWord(dir) {
    if (!dir) return 'an unrecorded latitude';
    const deg = sourceLatDeg(dir);
    const a = Math.round(Math.abs(deg));
    if (a < EQUATOR_DEG) return 'the equator';
    return `${a} degrees ${deg > 0 ? 'north' : 'south'}`;
  }

  // The plural of the plant word. The worker offers seven words and only one of them is irregular.
  // See FLORA_LORE in worker.js. flora-lore.js holds its own copy of this rule, because the two
  // vocabulary files do not read each other.
  const PLANT_PLURAL = { cactus: 'cacti' };
  const manyOf = (w) => PLANT_PLURAL[w] || (/(s|x|sh|ch)$/.test(w) ? w + 'es' : w + 's');

  // `env` here is the result of Lore.makeEnv(), which keeps the planet numbers the tags come from
  // and drops the rest. The lean of the axis is one it drops, so writeLog() passes `obl` from
  // world.env. Read no other number of the axis off `env`.
  function worldTokens(world, env, probe, obl) {
    const hours = Math.max(1, Math.round(env.dayHours || 24));
    const plant = env.plantWord || 'growth';
    return {
      world: world.designation, probe, lat: latWord(world.source && world.source.dir),
      day: `${hours} hours`, night: `${Math.max(1, Math.round(hours / 2))} hours`,
      temp: `${env.tempC} °C`, grav: `${(env.gravity || 1).toFixed(2)} g`,
      tilt: obl == null ? 'an unmeasured angle' : `${Math.round(obl)} degrees`,
      moon: (env.moonNames && env.moonNames[0]) || 'the moon',
      moons: L.num(env.moons || 0), plant, plants: manyOf(plant),
    };
  }
  // The short form of the name. species.js builds a name as "[place] adjective NOUN", so the last
  // word is always the noun the generator picked for that locomotion: hopper, strider, whale,
  // ribbon, slick, keel, watcher, drifter, flitter, roller, wheel. It is therefore always a real
  // noun and it always takes an "s" in the plural, the way G.lore.plural does. A log needs it,
  // because "the hardpan long-day hopper" is four words and an entry may have to name the animal
  // twice. See "Every entry stands on its own subject".
  //
  // {kind} and {kinds} are BARE, with no article, so a line can write "the {kind}", "a {kind}",
  // "three {kinds}", or "{n} {kinds}". {Kind} and {Kinds} are the same words capitalised, for a
  // plural that opens a sentence: "{Kinds} came past the mast." A singular that opens a sentence
  // writes "The {kind}".
  const shortNoun = (name) => name.toLowerCase().split(' ').pop();
  function beastTokens(G, pet) {
    const one = G.lore.name.toLowerCase(), many = G.lore.plural;
    const k = shortNoun(G.lore.name);
    return {
      other: 'the ' + one, Other: 'The ' + one, others: 'the ' + many, Others: 'The ' + many,
      kind: k, Kind: cap(k), kinds: k + 's', Kinds: cap(k) + 's',
      size: G.lore.size, n: L.num(G.social ? G.social.n : 0), diet: lower(G.lore.diet), pet,
    };
  }

  // ---------------------------------------------------------------- the days
  // The days are turns of this planet, counted from the landing. The landing is day 1. The gaps
  // follow a hump: short at the start, widest in the middle of the mission, short again at the
  // end. Every day is a whole number and the days rise strictly.
  function layDays(rng, count, total) {
    if (count <= 1) return [1];
    const raw = [];
    let sum = 0;
    for (let i = 1; i < count; i++) {
      const u = (i - 0.5) / (count - 1);
      const w = GAP_FLOOR + Math.sin(Math.PI * u) * (0.8 + 0.5 * rng());
      raw.push(w); sum += w;
    }
    const scale = (total - 1) / sum;
    const days = [1];
    let at = 1;
    for (const w of raw) {
      at += Math.max(1, Math.round(w * scale));
      days.push(at);
    }
    return days;
  }

  // ---------------------------------------------------------------- the crew
  function rollCrew(rng) {
    // Three people is the small crew and five is the full one. Four is the commonest.
    const r = rng();
    const size = r < 0.25 ? CREW_MIN : r < 0.65 ? 4 : CREW_MAX;
    const names = [], taken = new Set();
    for (let i = 0; i < size; i++) {
      let name = '';
      for (let k = 0; k < 12; k++) { name = L.pick(rng, NAMES); if (!taken.has(name)) break; }
      taken.add(name); names.push(name);
    }
    // One role each. A pilot is always aboard, because somebody flew the ship down.
    const rest = ROLES.filter((x) => x !== 'pilot').slice();
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = rest[i]; rest[i] = rest[j]; rest[j] = t;
    }
    const roles = ['pilot', ...rest.slice(0, size - 1)];
    // The pilot is not always the first name on the list, so the keeper is not always the pilot.
    const order = roles.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    return names.map((name, i) => ({ name, role: order[i] }));
  }

  // ---------------------------------------------------------------- the world thread, by salience
  // The loudest true fact of this world wins. `sal` gives roughly 0 for a fact a crew would barely
  // mention and 3 or more for one that decides the mission, and the weight is the cube of it, so a
  // world of -72 °C opens on the cold nearly every time and a world with nothing loud still varies.
  const SAL_FLOOR = 0.15;
  function salienceOf(t, env) {
    const s = t.sal ? t.sal(env) : 0.3;
    return Math.max(0, s);
  }
  function pickWorldThread(rng, ctx, used) {
    let c = L.candidates(WORLD_THREADS, ctx).filter((t) => !used.has(t));
    if (!c.length) return null;
    const w = c.map((t) => Math.pow(SAL_FLOOR + salienceOf(t, ctx.env), 3));
    let total = 0;
    for (const x of w) total += x;
    let r = rng() * total;
    for (let i = 0; i < c.length; i++) { r -= w[i]; if (r <= 0) { used.add(c[i]); return c[i]; } }
    used.add(c[c.length - 1]);
    return c[c.length - 1];
  }

  // ---------------------------------------------------------------- the threads of one log
  // The loudest world thread, the fauna thread when the world carries beasts, and one or two crew
  // threads. The count of beats has to land between BEAT_MIN and BEAT_MAX, so the log holds 8 to
  // 20 entries.
  //
  // At most one thread may retire a person, and a retiring thread needs three people besides the
  // keeper: one to lose, and two the other threads and the ending can still name.
  //
  // A thread may run a prefix of its beats, never fewer than THREAD_MIN_BEATS, so a short log is a
  // shorter subplot and not a truncated one. A retiring thread is never shortened, because the
  // beat that takes the person out is its last.
  function chooseThreads(rng, ctx, spare, want, strand) {
    const used = new Set();
    const out = [];
    const beats = () => out.reduce((s, x) => s + x.take, 0);
    const add = (t) => { if (t) out.push({ t, take: t.beats.length }); };
    // The strand thread is never optional and never shortened: it is why the wreck is here.
    add(strand);
    add(pickWorldThread(rng, ctx, used));
    if (ctx.G) add(L.line(rng, FAUNA_THREADS, ctx, used, true));
    const crewPool = spare >= 3 ? CREW_THREADS : CREW_THREADS.filter((t) => !t.retires);
    const n = beats() + 2 * THREAD_MIN_BEATS <= want ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const left = out.some((x) => x.t.retires) ? crewPool.filter((t) => !t.retires) : crewPool;
      add(L.line(rng, left, ctx, used, true));
    }
    // Too long: take one beat at a time off whichever thread is longest, never below
    // THREAD_MIN_BEATS and never off a retiring thread. Shortening from the back instead would
    // always cut the crew threads, which are added last, and the ending would stop following them.
    for (let guard = 0; beats() > want && guard < 64; guard++) {
      let pick = -1;
      for (let i = 0; i < out.length; i++) {
        if (out[i].t.retires || out[i].t.kind === 'strand' || out[i].take <= THREAD_MIN_BEATS) continue;
        if (pick < 0 || out[i].take > out[pick].take) pick = i;
      }
      if (pick < 0) break;
      out[pick].take--;
    }
    while (beats() > BEAT_MAX && out.length > 2) out.pop();
    // Too short: take the next loudest world thread, which is another real fact of this world.
    while (beats() < BEAT_MIN) {
      const extra = pickWorldThread(rng, ctx, used)
        || L.line(rng, CREW_THREADS.filter((t) => !t.retires), ctx, used, true);
      if (!extra) break;
      out.push({ t: extra, take: extra.beats.length });
    }
    return out;
  }

  // The ending has to follow from the threads. Every thread that points at one kind of ending adds
  // a tag, and the endings gated on that tag then outrank the rest by the weight of the gate. A
  // thread whose beats were cut short does not count: the log never reached the beat that earns it.
  function leadTags(threads, tags) {
    for (const { t, take } of threads) {
      // The last beat of a thread is where the pressure is, so a thread that lost more than one
      // beat to the trim never earns its lead. One beat short still counts.
      if (t.lead && take >= t.beats.length - 1) tags.add('lead' + t.lead);
    }
    return tags;
  }

  // ---------------------------------------------------------------- the public entry point
  // writeLog() writes the whole log of one source.
  //
  //   world   the world object. It reads world.env, world.designation, world.species, and the
  //           direction of world.source, and it writes nothing back.
  //   rng     a stream of its own, makeRng(seed + '|source-lore') in the worker.
  //
  // It returns plain data, so the log crosses to the page by structured clone:
  //
  //   { probe, days, species, crew: [{ name, role }], keeper, lost, entries: [{ slot, title, day, text }] }
  //
  // `species` is the name of the animal the log names, or null. `keeper` is the person who writes
  // the log. `lost` is the person a thread took out of the story, or null; the card does not read
  // it and the audit does. The page must not show any of this before the reader finds the wreck.
  function writeLog({ world, rng }) {
    const env = L.makeEnv(world.env || { type: world.type });
    const beasts = (world.species || []).filter((G) => G.lore);
    const dir = world.source && world.source.dir;
    const probe = `${L.pick(rng, PROBE_NAME)} ${1 + Math.floor(rng() * 19)}`;
    const G = beasts.length ? L.pick(rng, beasts) : null;
    const tags = sourceTags(env, (world.env || {}).obliquityDeg, beasts.length > 0,
      sourceLatDeg(dir), motionOf(G));
    const ctx = { env, tags, world, G };

    const crew = rollCrew(rng);
    const keeper = crew[0].name;
    const jobOf = new Map(crew.map((c) => [c.name, c.role]));
    const others = crew.slice(1).map((c) => c.name);
    const pet = G ? L.pick(rng, PET_NAME) : '';

    // the rolled counts a beat may use
    const many = 30 + Math.floor(rng() * 61);
    const few = 4 + Math.floor(rng() * 12);
    const count = 4 + Math.floor(rng() * 11);
    // The frame of the mission. One roll per log, so two threads never disagree about them.
    const years = 9 + Math.floor(rng() * 8);
    const far = 180 + 10 * Math.floor(rng() * 25);
    // Why this crew cannot leave. One strand thread per log, by weight.
    const strand = L.line(rng, STRAND_THREADS, ctx, new Set());
    // One trait for every person but the keeper, and no trait twice in one crew.
    const traitDeck = TRAITS.slice();
    for (let i = traitDeck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = traitDeck[i]; traitDeck[i] = traitDeck[j]; traitDeck[j] = t;
    }
    const asides = new Map(others.map((name, i) => [name, { say: traitDeck[i].say.slice(), used: 0 }]));

    // How long this log runs. The count varies from world to world, because a short log and a long
    // one read as two different missions.
    const wantBeats = BEAT_MIN + Math.floor(rng() * (BEAT_MAX - BEAT_MIN + 1));
    const threads = chooseThreads(rng, ctx, others.length, wantBeats, strand);
    leadTags(threads, tags);

    // Who each thread may name. A retiring thread takes a person of its own, and nobody else may
    // name that person, so a dead or absent person never acts or speaks again.
    const alive = others.slice();
    const cast = new Map();
    const retiring = threads.find((x) => x.t.retires);
    if (retiring) {
      const gone = alive.shift();
      cast.set(retiring.t, [gone, alive[0]]);
    }
    let k = 0;
    for (const { t } of threads) {
      if (cast.has(t)) continue;
      cast.set(t, [alive[k % alive.length], alive[(k + 1) % alive.length]]);
      k++;
    }

    // The beats of every thread, interleaved. A beat carries the force of its place in its thread,
    // so the whole log rises from the landing to the ending even though the threads are separate.
    // The jitter is smaller than the step between two beats of one thread, so a thread never runs
    // out of order.
    const items = [];
    for (const { t, take } of threads) {
      for (let i = 0; i < take; i++) {
        items.push({ t, beat: t.beats[i], force: (i + 1) / take + (rng() - 0.5) * 0.12, i });
      }
    }
    items.sort((a, b) => a.force - b.force);

    const total = MISSION_MIN + Math.floor(rng() * (MISSION_MAX - MISSION_MIN));
    const days = layDays(rng, items.length + 2, total);
    // The day a thread first speaks, for a beat that refers back to it.
    const firstDay = new Map();
    items.forEach((it, j) => { if (!firstDay.has(it.t)) firstDay.set(it.t, days[j + 1]); });

    // The day the orbiter leaves. 'last' is the day of the last beat of the strand thread, which
    // is the beat that watches it go. 'next' is the day after the ending, for the crew that climbs
    // to it. 'never' is a day this log does not reach, because the orbiter is lost before it.
    const endDay = days[days.length - 1];
    let due = endDay + 6 + Math.floor(rng() * 30);
    if (strand.due === 'next') due = endDay + 1;
    if (strand.due === 'last') items.forEach((it, j) => { if (it.t === strand) due = days[j + 1]; });

    const base = worldTokens(world, env, probe, (world.env || {}).obliquityDeg);
    base.due = String(due); base.years = L.num(years); base.far = String(far);
    if (G) Object.assign(base, beastTokens(G, pet));
    base.keeper = keeper;
    base.keeperjob = jobOf.get(keeper);
    base.crew = L.num(crew.length);
    base.many = String(many); base.few = String(few); base.count = L.num(count);
    const people = (one, two) => ({ one, two, onejob: jobOf.get(one), twojob: jobOf.get(two) });

    const entries = [];
    const arrival = L.line(rng, ARRIVAL, ctx, new Set());
    const first = { ...base, days: '1', since: '1', ...people(others[0], others[1] || others[0]) };
    // The second part of the landing: how the crew is to get home, and what the landing did to
    // that plan. A strand thread that breaks the lander on the landing brings its own wording.
    const plan = L.fill(L.pick(rng, strand.landing || SOUND_LANDING), first);
    entries.push({
      slot: 'landing', title: 'Landing', day: days[0],
      text: (arrival ? cap(L.fill(arrival.t, first)) + ' ' : '') + plan,
    });

    // `lost` records the person a thread took out of the story, and the day of it.
    let lost = null, lastAside = -2;
    items.forEach((it, j) => {
      const day = days[j + 1];
      const [one, two] = cast.get(it.t);
      const tk = { ...base, days: String(day), since: String(firstDay.get(it.t)), ...people(one, two) };
      // A beat is a list of wordings, or an object that also takes a person out of the story.
      const say = Array.isArray(it.beat) ? it.beat : it.beat.say;
      const isOut = !Array.isArray(it.beat) && it.beat.out;
      let text = cap(L.fill(L.pick(rng, say), tk));
      // An aside: one line about who a person is, on an early entry that names that person. The
      // roll is drawn every time, so the stream does not depend on who the entry names.
      const roll = rng(), which = rng();
      // Two asides in a row read as a list, so an entry that follows one takes none.
      // A thread that takes a person out introduces that person on its first beat, and says no
      // more about the life before once the trouble has begun.
      const after = lastAside === j - 1;
      const opens = it.t.retires && it.i === 0;
      const late = it.t.retires ? it.i > 1 : it.force >= ASIDE_FORCE;
      if (!isOut && !lost && !late && (opens || (!after && roll < ASIDE_CHANCE))) {
        const who = [one, two].find((p) => asides.has(p) && asides.get(p).used < ASIDE_MAX
          && new RegExp('\\b' + p + '\\b').test(text));
        if (who) {
          const a = asides.get(who);
          const line = a.say.splice(Math.floor(which * a.say.length), 1)[0];
          a.used++; lastAside = j;
          text += ' ' + L.fill(line, { ...tk, who, whojob: jobOf.get(who) });
        }
      }
      if (isOut) lost = { name: one, day, how: it.beat.out };
      entries.push({ slot: it.t.kind + '.' + it.t.key, title: '', day, text });
    });

    // The ending. It may only name a person who is still here, so it reads the alive list and not
    // the crew list. A gated ending outranks one that fits any world, by the weight of its gate,
    // and the lead tags above are what make it follow the threads.
    // A strand thread may force the kind: the crew that climbs on a patched line ends on the climb.
    const endPool = strand.end ? ENDINGS.filter((e) => e.kind === strand.end) : ENDINGS;
    const end = L.line(rng, endPool, ctx, new Set());
    const day = endDay;
    // An ending that reads the genome is the last beat of the fauna thread in all but name, so it
    // takes the people of that thread. The rest take the first two people who are still here.
    const faunaRun = end && readsAnimal(end) ? threads.find((x) => x.t.kind === 'fauna') : null;
    const [eOne, eTwo] = faunaRun ? cast.get(faunaRun.t)
      : [alive[0], alive.length > 1 ? alive[1] : alive[0]];
    const endTk = { ...base, days: String(day), since: String(day), ...people(eOne, eTwo) };
    let endText = end ? cap(L.fill(end.t, endTk)) : '';
    // One sentence about the people, taken from a crew thread that ran the whole way. The card
    // holds five sentences at the most, so the coda only goes on when there is room for it.
    const crewRun = threads.filter((x) => x.t.coda && x.take >= THREAD_MIN_BEATS);
    if (endText && crewRun.length) {
      const pickRun = crewRun[Math.floor(rng() * crewRun.length)];
      const [cOne, cTwo] = cast.get(pickRun.t);
      const coda = L.fill(L.pick(rng, pickRun.t.coda),
        { ...base, days: String(day), since: String(day), ...people(cOne, cTwo) });
      const nSent = endText.split(/(?<=[.!?])\s+/).filter(Boolean).length
        + coda.split(/(?<=[.!?])\s+/).filter(Boolean).length;
      // A cut ending stops in the middle of a sentence, so nothing may follow it.
      // A cut ending stops in the middle of a sentence and a second hand is in another voice, so
      // neither of them takes a coda. A coda that names the person the crew lost is dropped too.
      if (nSent <= CODA_SENTENCES && end.kind !== 'cut' && end.kind !== 'second' && !(lost && coda.includes(lost.name))) {
        endText += ' ' + coda;
      }
    }
    entries.push({
      slot: 'end.' + (end ? end.kind : 'doom'), title: 'Last entry', day, text: endText,
    });

    return {
      probe, days: day, species: G ? G.lore.name : null,
      crew, keeper, lost, entries,
      // Why the crew could not leave, and the leads the threads set. The card reads neither; the
      // audit reads both, to prove that the ending fits the story.
      cause: strand.key, leads: LEADS.filter((x) => tags.has('lead' + x)),
    };
  }

  self.SourceLore = {
    writeLog, sourceTags, sourceLatDeg, motionOf, salienceOf,
    TOKENS, BEAST_TOKENS, NAMING_TOKENS, ENDING_KINDS, MOTION, LEADS, shortNoun,
    NAMES, ROLES, PET_NAME,
    ARRIVAL, ENDINGS, SOUND_LANDING, TRAITS,
    THREADS: { world: WORLD_THREADS, crew: CREW_THREADS, fauna: FAUNA_THREADS, strand: STRAND_THREADS },
    LIMITS: { CREW_MIN, CREW_MAX, ENTRY_MIN, ENTRY_MAX, THREAD_MIN_BEATS },
  };
})();
