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
//   entry 1        the landing. One real fact of this world.
//   entries 2..n-1 the beats of the threads, interleaved, rising in force.
//   entry n        the ending. It closes the story, and it follows what the threads did.
//
// A THREAD is an ordered list of 3 to 5 beats that intensify. A BEAT is a list of 3 wordings or
// more, and a log takes one of them, so two logs that run the same thread rarely read the same.
// There are three kinds of thread.
//
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
//   mdrift   a sac. A bladder of warm gas that never lands. The wind decides
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
// Short declarative sentences, most under 12 words and none over 20. Plain words a five year old
// can read aloud. Numbers are good. NO metaphor and NO simile: no "like a", no "as if", no
// "seemed", and nothing the planet or the machine does on purpose. Say what happened and let the
// facts carry the feeling.
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
    // the people
    'one', 'two', 'onejob', 'twojob', 'keeper', 'keeperjob', 'crew',
    // the counts a log rolls for itself
    'few', 'many', 'count',
    // the animal
    'other', 'Other', 'others', 'Others', 'size', 'n', 'diet', 'pet',
  ];
  // The tokens that name the animal. A line that uses one of them must sit under a gate on
  // `beasts`.
  const BEAST_TOKENS = ['other', 'Other', 'others', 'Others', 'size', 'n', 'diet', 'pet'];

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
  const LEADS = ['doom', 'split', 'walk', 'message', 'second', 'stay', 'ride', 'catch', 'follow'];
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
  // Fourteen wordings fit any world, and every gate carries two or three of its own, so a common
  // world still offers twenty and two logs in a row rarely open alike.
  const ARRIVAL = pool([
    'We are down at {lat}. The ground is flat and open. {one} says the ship is sound. We ate, and then we slept.',
    'We came down hard at {lat}. Two legs took the load and the third took the rest. Nobody is hurt. The ship will not fly again.',
    'The descent ran long and we landed at {lat} with dry tanks. Our {onejob} put us down by hand. We are all still here.',
    'We chose this ground from orbit and we were right. Flat, firm, open sky at {lat}. We raised the mast before dark.',
    'Landing at {lat}. Nothing broke. {one} walked the whole circle and found no crack in a leg. We started work the same hour.',
    'We were awake for the whole descent. {world} grew from a disc into a floor in nine minutes. Then we were standing on it at {lat}.',
    'Down at {lat}. The dust took an hour to settle. {one} opened the hatch first and stood there a long time.',
    'We are at {lat}. {two} was sick in the last minute of the fall. The ship is sound and the dish is up.',
    'The last hundred metres were ours to fly. We are at {lat}, level, with the mast raised. It is a good first day.',
    'We touched down at {lat} at first light. The legs sank two fingers and stopped. {one} and {two} were outside inside ten minutes.',
    'We are at {lat}. The hull is scored down one side and the paint is gone. Everything under the paint is fine.',
    'Landing at {lat}, four hundred metres off the mark. {one} calls that good. Our {twojob} calls it luck. Both are right.',
    'We came down at {lat} and sat in the seats for a minute without speaking. Then {one} laughed, and we got up and went out.',
    'We are down at {lat} and the count is three, four, five. Everybody signed the board. The survey starts in the morning.',
    { t: 'The last stage burned for twice the time the plan allowed. At {grav} it had to. We reached {lat} with dry tanks.', tags: 'highgrav|crushgrav' },
    { t: 'We came down at {lat} under {grav}. The legs took the shock and did not ring. Nothing here will move us again.', tags: 'crushgrav' },
    { t: 'At {grav} the fall was slow enough to choose by. We picked the flat at {lat} on the way down. {one} walked the last of it sideways.', tags: 'lowgrav|feathergrav' },
    { t: 'We are at {lat}. At {grav} the dust we raised on landing is still up at head height tonight.', tags: 'lowgrav|feathergrav' },
    { t: 'We came down at {lat} on ground that rang under the legs. {temp}. Not one leg sank a finger deep.', tags: 'frozen|subzero' },
    { t: 'We are at {lat}. It is {temp} outside and the hatch seal went stiff before we had it open.', tags: 'frozen|subzero' },
    { t: 'We came down at {lat} through air at {temp}. The radiators were at the limit before we touched. They have not come off it.', tags: 'hot|molten' },
    { t: 'We are at {lat}. Outside is {temp}. Our {onejob} read that off the gauge twice before saying it out loud.', tags: 'hot|molten' },
    { t: 'We are at {lat}. The sea is on the map somewhere east of us. Nobody has seen it from the ground yet.', tags: 'hasocean !mostlyland !lava' },
    { t: 'We are at {lat}. The map calls the red ground to the east a sea. It is rock, and it is moving.', tags: 'hasocean lava' },
    { t: 'We came down at {lat}, and the air here carries salt. {one} tasted it off a glove and told everybody.', tags: 'hasocean waterliquid !mostlyland' },
    { t: 'We are at {lat}. There is no sea on {world} and no horizon a different colour from the ground.', tags: 'dryworld' },
    { t: 'We are at {lat}. {world} is dry from pole to pole. Everything we will drink is in the tank behind me.', tags: 'dryworld' },
    { t: 'The island at {lat} is smaller than the map made it. We walked the whole of it today. It took half a turn of the planet.', tags: 'mostlysea' },
    { t: 'We are at {lat}, on the only land inside two hundred kilometres. Water on three sides. {one} has already been in it.', tags: 'mostlysea waterliquid' },
    { t: 'The ring overhead was the last thing the descent camera kept. We are under it, at {lat}. Nobody has stopped looking up.', tags: 'ringed' },
    { t: 'We are at {lat}. There is a ring overhead and it cuts the sky in two. Our {twojob} sat under it until the light went.', tags: 'ringed' },
    { t: '{moon} was up when we landed at {lat}. The light off it was enough to raise the mast by.', tags: 'moonlit' },
    { t: 'We came down at {lat} with {moon} low in the east. {one} put a camera on it before touching anything else.', tags: 'moonlit' },
    { t: 'We came down at {lat} between two cells of the storm. Lightning took an antenna on the way through. We let it go.', tags: 'stormy' },
    { t: 'We are at {lat}. There was lightning on three sides as we came in. {one} flew the last of it on instruments.', tags: 'stormy' },
    { t: 'We are at {lat}, upwind of the vents. The ash still reached us by the second hour. It has reached us every hour since.', tags: 'volcanic' },
    { t: 'We came down at {lat}. There is a glow to the south and the ground is warm through the boots.', tags: 'volcanic' },
    { t: 'We came down at {lat}, a safe distance from the geysers by the numbers the orbiter sent. The numbers were old.', tags: 'geysers' },
    { t: 'We are at {lat}. Three geysers went up while we were unloading. {two} counted the minutes between them.', tags: 'geysers' },
    { t: 'We landed at {lat} in the morning of a day {day} long. The shadow of the mast had not moved by supper.', tags: 'longday|slowspin' },
    { t: 'We are at {lat}. One turn of {world} is {day}, so this morning will last longer than our training did.', tags: 'longday|slowspin' },
    { t: 'We came down at {lat} into a stand of {plants} and flattened a circle of them. {one} counted the broken ones and apologised to nobody.', tags: 'flora' },
    { t: 'We are at {lat}. There are {plants} to the edge of sight. Our {twojob} was out among them before the dust had settled.', tags: 'flora' },
    { t: 'The sky at {lat} was green from end to end when we landed. The band was noise. We reported the landing eleven hours late.', tags: 'auroral' },
    { t: 'We came down at {lat} on a world that turns the other way. The sun rose behind us. Nothing in the flight plan had prepared us for that.', tags: 'retrograde' },
    { t: 'The axis of {world} stands very nearly straight. The sun will run the same arc over {lat} every day we are here. That made the power plan simple.', tags: 'upright' },
    { t: 'The axis of {world} lies over at {tilt}. At {lat} the sun runs a flat circle without climbing. We landed in that light and we work in it.', tags: 'polarnight' },
    { t: 'The axis of {world} lies over at {tilt}. We came down at {lat} in a season that will not hold. The whole survey plan is written around that.', tags: 'sidetilt' },
    { t: 'It was raining at {lat} when we came down. {one} stood out in it for ten minutes and would not come in.', tags: 'rainy' },
    { t: 'We are at {lat}. It rained on us while we raised the mast, and it has rained twice since.', tags: 'rainy' },
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
          'The cold here is the whole of the weather. {temp}, and no wind to speak of.',
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
          'The heaters take more than the panels make. We knew that on day {since}. We know it better now.',
          'Our {twojob} has cut the heat at night. Nobody argued and nobody slept.',
          'We sleep four to a room with the door taped. It is the only warm space left.',
          'Everything we own is on the beds now. There is nothing else in the ship that holds heat.'],
        ['The forward cell died in the night. We have light in one room. Nobody has been warm since day {since}.',
          'It is {temp} outside and the inner door is stiff with frost. We work one hour on and two off.',
          'There is ice inside the bay now, on the wall behind the bunks. We do not talk about it.',
          '{one} cannot feel two fingers. The {onejob} says it will pass. I do not think it will.',
          'The last heater runs on a timer of ten minutes in the hour. We set it there and we live with it.',
          'The cold is in the walls now. It comes back inside a quarter of an hour of the heat going off.'],
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
          'Nobody sleeps. We lie in the dark of the bay and wait for the ground to give the heat back.',
          'We work the two hours before dawn and nothing else. The rest of the turn we sit.',
          '{two} would not come in at the alarm today. {one} went out and brought {two} back.'],
        ['Two more cells failed in the heat. The cold store is gone. The food will not keep now.',
          'The radiators are cracked along the top rail. There is no part left to cut one from.',
          'We have an hour of work in us a day now. The rest is waiting for the sun to go.',
          'The pump for the cooling loop stopped at noon. {one} has been on it since and has not spoken.',
          'The bay does not cool at night any more. It holds at thirty-five and we hold with it.',
          'Our {onejob} has given the heat plan up. There is no hour of this turn that is safe.'],
      ],
    },
    {
      key: 'mild', tags: 'temperate', sal: () => 0.35, beats: [
        ['The air is {temp} and we can walk out with no suit. {one} stood at the hatch for an hour and just looked.',
          'It is {temp} outside. We ate on the step tonight, all of us, with the hatch open.',
          '{temp}, no wind, and a clear sky. Our {onejob} says it is better weather than home.'],
        ['Good weather every day since day {since}. The ground survey is finished early.',
          'We have had nine clear days. {two} has the whole east quarter mapped and drawn.',
          'The weather has given us everything. We are ahead of the plan for the first time.'],
        ['The wind turned this week and it has not turned back. It carries grit and it is in everything.',
          'The nights are colder now. We have started wearing the suits again by day.',
          'Three days of low cloud and no sun. The panels made a third of what they should.'],
        ['The weather was the one thing here that never fought us. It is fighting us now.',
          'The wind has not dropped in eleven days. We have stopped going out past the mast.',
          'It turned cold in one night. Whatever season this is, it is over.'],
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
          'The arm bent at the shoulder on the third dig. It has carried the fault ever since.'],
        ['The mast bearing has begun to grind. It carries {grav} through every hour of a {day} turn.',
          'The deck is over by four degrees now and everything we set down rolls. We have stopped setting things down.',
          '{one} fell on the step today and could not get up alone. At {grav} that is how it goes.'],
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
          'Power is down a third and the dust is the whole of the reason. There is no way to wash it off.',
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
        ['The sun has not moved since the last entry. We are waiting, and the waiting costs power.',
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
          'The rhythm here is easy and we have used it. The survey is ahead of the plan.'],
        ['The days are easy and the ground is not. We have broken two drills in the rock.',
          'We still keep the same hours. There is less to do in them now.',
          'Our {onejob} has stopped setting the alarm. There is no longer a reason to be up early.'],
      ],
    },
    {
      key: 'sea', tags: 'hasocean waterliquid !mostlyland !lava !ice', sal: (e) => (1 - e.land) * 1.7, beats: [
        ['The wind off the water carries salt and it reaches us here. {one} tasted it off the mast rail.',
          'There is open water on this world and the weather here comes off it. Cloud every afternoon.',
          'Our {onejob} put the sea on the map today from the orbit data. It is a long way and it is there.',
          'Every wind we get comes off the water. {two} has logged the direction for nine days and it holds.',
          'The air here is wet and it is salt. {one} tasted a glove and made a face about it.'],
        ['Salt is on every surface outside. {two} wiped the camera and the coating came off with it.',
          'Everything metal outside has a bloom on it now. The {twojob} calls it salt and is right.',
          'The damp gets into the bay whenever the hatch is open. Nothing dries indoors any more.',
          'There is a bloom on every bare metal face outside. Our {onejob} has photographs of it spreading.',
          '{one} sanded the mast rail down to bright metal. It was dull again inside four days.'],
        ['The salt is in the mast bearing. It turns, and it makes a sound it did not make.',
          'Two hatch seals have gone. We keep the inner door shut and we go out one at a time.',
          'The lower contacts are green. {one} has cleaned them twice and they come back.',
          'The aerial mount has gone through at the base. {two} has it strapped and it will not hold long.',
          'Two of the four panel clamps have failed. We have wired the panels down and that is all.'],
        ['The bus corroded through at the forward junction. We have one line to the panels now.',
          'The mast bearing has seized. The dish points where it points and we cannot move it.',
          'Everything outside is going the same way at the same speed. We have stopped cleaning it.',
          'The forward hatch will not open now. We use the aft one and we go out one at a time.',
          'Our {onejob} has written off the outside of this ship. Whatever it is doing, it will finish.'],
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
          'There is an ocean here and it runs red. At {temp} nothing else was ever likely.',
          'Our {onejob} calls the red on the map a sea. It is rock, and it is moving, and it is not water.'],
        ['The light off the molten ground reaches us at night. We can read the gauges outside by it.',
          'The wind that comes off the red side is the hottest air on this world. We have shut that hatch.',
          'The ground between us and the red is cracked in bands, and the cracks glow at the bottom.'],
        ['The edge of the red has moved two kilometres toward us since day {since}. {two} measured it.',
          'There is fresh black rock inside our survey square. It was not there last week.',
          'The ground under the forward leg reads eighty degrees now. It read forty on the day we landed.'],
        ['The red is inside the square. We can hear it from the bay and we cannot move the ship.',
          'The heat through the deck is the whole of the problem now. Nothing we have can move the ship.',
          'Our {twojob} has stopped taking the ground temperature. The number only goes one way.'],
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
        ['There are cracks in the flat where there were none. The {twojob} has marked them and forbidden the sledge.',
          'Something moved under the flat last night. We heard it through the hull and we have no answer for it.',
          'The surface dropped a hand in one place today. We have pulled the markers back.'],
        ['A crack opened inside our route and took the sledge. Nobody was on it. Nobody goes out there now.',
          'The flat is breaking up along the whole of the near edge. We have lost the road.',
          'We have stopped going east. Whatever the sea does here, it is doing it now.'],
      ],
    },
    {
      key: 'inland', tags: 'mostlyland !dryworld', sal: () => 1.5, beats: [
        ['There is water on {world} and none of it is near us. The nearest blue on the map is a thousand kilometres away.',
          'We are in the middle of the land. Our {onejob} measured the distance to water and then stopped saying it.',
          'Every direction from here is the same dry ground for further than the rover can go.'],
        ['The recycler is the whole of our water. {one} keeps the count and reads it out at supper.',
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
          'The {plants} have reached the legs. The {onejob} says they will not hold any weight. They do not have to.',
          'We cut a path to the mast every third day. By the fourth day there is no path.'],
        ['The {plants} are up against the forward leg. They have lifted the pad by a finger.',
          'Something in the {plants} has got into the lower seal. It is soft where it should be hard.',
          'The {plants} are over the dish mount. {two} cleared it and it was back inside a week.'],
        ['The {plants} are over the lower bay. We have stopped cutting. It is warmer under them.',
          'We cannot see the rover from the hatch any more. It has not moved. The {plants} have.',
          'The mast is standing in {plants} to half its height. We leave the record to them to keep.'],
      ],
    },
    {
      key: 'polarnight', tags: 'polarnight', sal: () => 2.7, lead: 'doom', beats: [
        ['The axis of {world} leans {tilt}. At {lat} the sun runs a flat circle now and does not climb.',
          'We are at {lat}, and this world leans {tilt}. The sun goes round the horizon and never gets above it.',
          'Our {onejob} plotted the sun today. It is a flat circle. That is the whole of the finding.',
          'The sun went round the whole horizon today without rising. {two} filmed the turn of it.',
          'At {lat} the light comes from every side of us in turn and never from above.'],
        ['The sun touched the horizon today and did not clear it. It will stop rising inside the week.',
          'Four hours of grey light today, and less tomorrow. The sun is going and it will stop rising.',
          '{one} has worked out the date the sun goes. It is eleven days from now.',
          'There is a date on the wall now. After it there is no sun at {lat} until the season turns.',
          'The panels made a fifth of the plan today. Tomorrow will be less and we know the shape of it.'],
        ['The polar night is here. We have the lamps and nothing else. {one} keeps one burning all day.',
          'It is dark and it will be dark for a season. The panels take nothing at all.',
          'The {twojob} has put a lamp in every room. We have the power for that and not much else.',
          'We work by lamp and we sleep by lamp. {one} has started calling the lamp hours morning.',
          'Our {twojob} keeps ship time out loud so the rest of us hold on to it.'],
        ['The dark has gone on and on. {one} has stopped reading the meter out loud.',
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
          'The seismometer has not been quiet since we set it down. {one} says that is the ground here.'],
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
        ['The geysers keep no interval we can find. The orbiter gave us numbers. The numbers were old.',
          'There are nine geysers inside the square. {two} has timed every one and no two agree.',
          'Our {onejob} sited us here for the heat. The first one went up ninety metres and changed the plan.'],
        ['One opened inside the landing circle today. It has coated the mast from the foot up.',
          'The fall from the near geyser reaches the panels. Whatever it carries is not clean.',
          '{one} was out when one opened at forty metres. {one} was not hurt and will not go out alone now.'],
        ['The mast is crusted to shoulder height. {two} chipped it off and it was back inside four days.',
          'A new one opened where the rover parks. We have moved the rover and there is nowhere good.',
          'The seals have paid for our arithmetic. Three are gone and we have two spares.'],
        ['One opened under the aft leg in the night. The ship is over by three degrees and it will not come back.',
          'The ground inside the circle is hollow. Our {twojob} sounded it and will not let anybody walk there.',
          'We have stopped going out on that side at all. The whole of it goes up without warning.'],
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
        ['The next strike takes the transmitter or it does not. That is the whole of the plan now.',
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
          'We cannot hear the orbiter while the sky is lit. Nine nights in ten it is lit.',
          '{two} has a camera on the sky every night now and will not take it down.'],
        ['Our clock drifts under the aurora and we cannot correct it from the ground.',
          'The band has been noise for eleven nights. {one} listens anyway, for an hour, every night.',
          'The compass is useless while the sky is lit. That is most of the time.'],
        ['Twenty days with nothing on the band. Our {onejob} sits with the receiver anyway.',
          'We have no way to know the time to better than a day. Everything we log is now approximate.',
          'The sky is lit again and nothing we send goes out through it.'],
      ],
    },
    {
      key: 'tide', tags: 'tides', sal: () => 1.1, beats: [
        ['{moon} raises a tide here. We set the ship above it and we were wrong by a little.',
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
          'The rain has taken the paint off the upper hull in patches. It is not water alone.',
          'Everything outside is wet all the time now. Nothing we leave out comes back dry.'],
        ['The rain has found a seam we cannot reach. The lower bay has been wet for six days.',
          'The wet is at the bus now. {one} has been lying under it for two days with a lamp.',
          'Water is standing under the aft leg and the ground there has gone to mud.'],
        ['It has rained for three turns without stopping. The panels take nothing at all.',
          'The bus is wet through and the forward line is dead. Our {onejob} has given up on it.',
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
        ['The shadow of the ring covers the whole of the middle of the day now. We charge at the edges.',
          'We are making half the power the plan promised, and the ring is the whole of the reason.',
          '{two} has stopped drawing the ring. {two} says it is not a friendly thing any more.'],
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
          'The cloud has hidden {moon} for nine nights. {two} has kept the book open anyway.'],
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
  // `coda` is one sentence the ending may add, so the last entry touches these people. `lead` says
  // which ending this thread points at, and writeLog() turns it into a tag the endings are gated
  // on. That is how a quarrel ends in a split and a hurt keeper ends in a second hand.
  const CREW_THREADS = pool([
    {
      key: 'injury', retires: true, lead: 'message',
      coda: ['Every name is on the board by the hatch, including the one that is not here.',
        'There is a cairn past the mast. Put a stone on it if you come this way.'],
      beats: [
        ['{one} fell off the mast this morning and landed badly. The leg is broken in two places. We have set it.',
          '{one} went through a crust that looked solid. The leg is broken. Our {twojob} set it on the ground.',
          'The arm came round on {one} at the bench today. Two ribs and a wrist. {one} did not make a sound.',
          '{one} was under the leg when it settled. The foot is crushed and the {twojob} has it bound.',
          'A cable parted under load and took {one} across the back. {two} carried {one} in.'],
        ['{one} is off the outside work for a month. {two} has taken the shifts and says nothing about it.',
          'We have {one} in the forward bunk with the leg up. {two} does two jobs now.',
          '{one} runs the radio from the bunk and does it better than any of us did.',
          'We have moved the bench next to the bunk so {one} can work sitting down.',
          '{one} does the log and the numbers now and lets the rest of us do the lifting.'],
        ['The leg is not knitting. {one} says it does not hurt. I have seen {one} at the hatch at night.',
          '{one} has a temperature every evening. The kit had four doses. We have one.',
          'Our {twojob} has looked at the leg twice today and not said anything either time.',
          '{one} cannot keep food down. We have tried three things and none of them holds.',
          '{one} asked {two} to sit up tonight. {two} has not left the bunk since.'],
        {
          out: 'dead',
          say: ['{one} did not wake up this morning. We buried {one} beyond the mast. Nobody has said much since.',
            '{one} died in the night. We put {one} under a cairn past the mast and {two} said the words.',
            '{one} went in the early hours with {two} sitting there. We buried {one} at noon by the marker.'],
        },
      ],
    },
    {
      key: 'keeperhurt', lead: 'second',
      coda: ['I have asked {one} to finish this if I cannot.',
        'My hand is worse tonight. {one} has offered to write the rest.'],
      beats: [
        ['I came off the ladder this morning. The arm is broken and {one} has set it.',
          'I put a hand through the cutter today. Two fingers are gone and {one} closed it up.',
          'I went down hard on the step outside and could not get up. {one} carried me in.',
          'The mast winch took my glove and the hand with it. {one} got the bleeding stopped.',
          'I was under the arm when it came down. Two ribs. {one} has me strapped up and sitting.'],
        ['I am writing left handed. {one} does the outside work now and has not complained once.',
          'I cannot hold a tool. Our {onejob} has taken everything I used to do.',
          '{one} has been doing my shifts and {one}’s own. I have stopped offering to help.',
          'I sit at the bench and hand tools over. It is what I am good for now.',
          'Our {onejob} has taken the outside roster entire. Nobody put it to a vote.'],
        ['The arm is not knitting. {one} says rest. There is no rest here and we both know it.',
          'The hand has gone bad. {one} has cleaned it twice a day for a week and it is no better.',
          'I have a fever every evening now. I write this entry in the morning, when I can.',
          'I slept through a whole turn and nobody woke me. {one} says there was no reason to.',
          'I cannot hold the pen for long. The writing in this book has changed and I know it.'],
        ['I have asked {one} to keep this log if it comes to that. {one} said yes and then went out.',
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
        ['{one} and {two} argued about the water count tonight. It was loud and then it was over.',
          '{one} and {two} went at each other over the work list. Nobody else said a word.',
          'There was a row at supper about who last checked the seals. It is not really about the seals.'],
        ['They are not speaking. {one} eats in the bay and {two} eats outside. It is not a big ship.',
          '{one} has stopped coming to supper. {two} sets a plate out anyway.',
          'Two days of silence between them. The rest of us talk twice as much to fill it.'],
        ['{one} has moved the cot into the store room. Nobody has asked {one} to move it back.',
          'Our {onejob} has taken every shift that the {twojob} does not. That is now the whole roster.',
          'They have split the tools. There are two of everything and there were never two of anything.'],
        ['{one} and {two} worked the same repair today and did not speak once. The repair held.',
          '{one} said tonight that we should not all stay here. Nobody argued and nobody agreed.',
          '{two} asked me to choose between them. I said no. I have been thinking about it since.'],
      ],
    },
    {
      key: 'walkout', retires: true, lead: 'walk',
      coda: ['We put a lamp on the mast again tonight, out of habit.',
        'The lamp is still on the mast. It costs us almost nothing to leave it.'],
      beats: [
        ['{one} walks out past the ridge every evening now, and goes further each time.',
          '{one} has taken to walking east after supper. Nobody goes with {one}.',
          'Our {onejob} was gone four hours tonight and would not say where.'],
        ['{one} asked me what we would do if nobody comes. I did not have an answer.',
          '{one} has been reading the orbit tables again. There is nothing in them that helps.',
          '{one} said tonight that waiting is not a plan. {one} is not wrong.'],
        ['{one} took a suit and a day of water and went east this morning before anybody was up.',
          '{one} left a note on the bench and went out at first light with the small pack.',
          '{one} went. {two} saw {one} go and did not stop {one}, and will not talk about it.'],
        {
          out: 'gone',
          say: ['{one} did not come back. {two} followed the track two kilometres and found nothing.',
            '{one} has been gone three days. We ran the rover out to the ridge and found the pack and no more.',
            'We have not found {one}. The track goes over hard ground and stops there.'],
        },
        ['We have kept a lamp on the mast every night since day {since}. Nobody has come to it.',
          'The lamp has been up for eleven nights. We will keep it up while there is power.',
          'Our {twojob} still sets a place at supper. None of us has said anything about it.'],
      ],
    },
    {
      key: 'food', lead: 'doom',
      coda: ['We ate the last good thing in the store tonight and left nothing for tomorrow.',
        'There is food for two more days. We have eaten it in our heads already.'],
      beats: [
        ['We counted the stores today. {many} days of food. {one} counted them twice to be sure.',
          'Full stock take. {many} days, if nothing spoils. Our {twojob} wrote it on the wall.',
          '{many} days of food on the shelf. That was the plan, and the plan had us picked up by then.',
          'The store came to {many} days. {one} read it out at supper and nobody looked up.',
          'We opened every crate and wrote the whole list up. {many} days. It was meant to be more.',
          '{many} days of food, our {onejob} says, and {one} is the one of us who is good with a number.'],
        ['The cold store failed and we lost a third of it. {one} counted again and did not say the number.',
          'Something got in and went through two bags before {two} found it. We lost a week.',
          'Our {onejob} found mould in the dry store. Half of that shelf went out past the mast.',
          'We lost the whole of one crate to the damp. Nobody has said whose job that was.',
          'We opened the second store today and half of it was already gone. Nobody can say when.',
          'The count is short by eleven days and {one} has been through it three times.'],
        ['We are on two meals a day. Nobody has said one word about the taste since.',
          'Half rations from this morning. {two} made the first one look bigger than it was.',
          'We eat once, late, together. It is the only part of the day that has not changed.',
          'The {twojob} has started putting the same thing on every plate. It is easier to count that way.',
          'We have gone to one meal a day. {one} made the call and nobody argued.',
          'Our {twojob} weighs every portion now, on the sample scale, to the gram.'],
        ['We have food for {few} days. Nobody talks about it.',
          '{few} days on the shelf. {one} has stopped writing the number on the wall.',
          'We have stopped counting the food out loud.',
          '{few} days. Our {onejob} gave half a ration back to the pot tonight and said nothing.',
          'The shelf is one crate deep. {two} counted it out loud once and will not do it again.',
          'We have {few} days on the shelf and all of us are pretending that is a long time.'],
      ],
    },
    {
      key: 'radio', lead: 'message',
      coda: ['{one} has the receiver on while I write this. There is nothing on it.',
        'The set is on beside me. It has been on every night since we came down.'],
      beats: [
        ['{one} has the receiver on for an hour every night. There is nothing on the band.',
          'Our {onejob} listens after supper, every night, and writes down what was heard. It is always nothing.',
          '{one} has rigged a second aerial along the ridge. It hears the same nothing, louder.'],
        ['{one} heard something on day {since}. We listened for four hours. It did not come again.',
          'There was a tone on the band last night, nine seconds of it. {two} heard it too.',
          '{one} has a recording of something that is not noise. None of us can say what it is.'],
        ['We have sent the same message every day for a month. Nothing has come back.',
          '{one} has taken the set apart and put it back together. It works. There is still nothing.',
          'The {twojob} has stopped coming to listen. {one} has not.'],
        ['{one} still sits with the receiver. The rest of us have stopped asking about it.',
          '{one} listens for three hours now instead of one. Nobody has suggested stopping.',
          'We sent the record in full tonight, all of it, on every band we have.'],
      ],
    },
    {
      key: 'repair', lead: 'doom',
      coda: ['The pump ran for nine minutes this evening. We all stood and watched it.',
        'The pump is dead and {one} has washed the tools and put them away.'],
      beats: [
        ['The pump failed today. {one} had it apart on the deck inside the hour and running by dark.',
          'The water pump went at noon. Our {onejob} fixed it with a washer cut from a boot sole.',
          'The pump stopped. {one} found the fault in twenty minutes and was proud of that for a day.',
          'The recycler pump seized this morning. Our {onejob} had it on the bench before breakfast.',
          'The pump packed up in the night. {one} was under it with a lamp when we got up.'],
        ['The pump ran six days and failed again. {one} has it apart again and is not talking.',
          'Same fault, same pump, ten days later. The {onejob} says the housing is out of true.',
          'The pump is going twice a week now. {one} can strip it in the dark and has had to.',
          'We have cut a gasket out of a boot and it has held four days. {one} calls that a result.',
          '{two} has drawn the whole pump out on paper so anybody can do it.'],
        ['{one} and {two} built one good pump out of two broken ones. It runs at half the rate.',
          'They have made a pump out of the spare and the wreck of the old one. It is ugly and it works.',
          'The new pump is a hand tool now. Somebody has to stand and work it. We take turns.',
          'The rebuilt pump runs eight hours and rests eight. That is the best {one} can get from it.',
          '{one} and {two} have a third pump half built out of scrap. It may never run.'],
        ['The pump is finished. There is nothing left on this ship to take a part from.',
          'The housing cracked through. {one} looked at it for a long time and then put it down.',
          'We are carrying water by hand from the tank to the bay. That is the pump now.',
          '{one} laid the tools out, cleaned them, and put them away. Nobody said anything.',
          'The housing is split end to end. {one} showed it to me and did not say a word about it.'],
      ],
    },
    {
      key: 'birthday',
      coda: ['We sang for {one} tonight, and we made it last.',
        'There is a mark on the wall for today. {one} put it there.'],
      beats: [
        ['It is {one}’s birthday. {two} made a cake out of ration flour. We sang and it was a good night.',
          'It is {one}’s birthday today. Our {twojob} made something sweet out of nothing and would not say how.',
          '{one} is a year older. We gave {one} the day off and did the shifts between us.',
          '{one} had a birthday today and had forgotten it. {two} had not.',
          'It is {one}’s birthday. We all wrote something on a piece of packing and gave it over at supper.',
          'It is {one}’s birthday and we made a thing of it. The {twojob} did a song and got the words wrong.'],
        ['{one} has kept a calendar on the bay wall since day {since}. There is a mark for every turn.',
          '{two} has been scratching the days into the hatch frame. There are a lot of them now.',
          'The calendar is on the wall by the cots and {one} owns it. Nobody else touches it.',
          'We keep two calendars, one by the sun and one by the clock. They parted company weeks ago.',
          '{one} counts the marks out loud every morning. It is the first sound in the ship.'],
        ['It is {two}’s birthday today. There was no flour left for a cake. We sang anyway.',
          '{two} turned a year older and we had nothing to give. {one} gave {two} the last sweet ration.',
          'Another birthday. We sang it through and then sat quiet for a while.',
          'It is {two}’s birthday and nobody had remembered. {two} told us, at supper, and laughed.',
          'Two birthdays in one week. {one} gave {two} a carved bit of packing and {two} has it on the bunk.'],
        ['The calendar has run off the end of the wall. {one} has started a second one on the hatch.',
          '{one} stopped marking the wall this week. Nobody has taken it up.',
          'The calendar fills the wall now. We stood and looked at the whole of it tonight.',
          'There are more marks on the wall than there are days of food. {two} counted both.',
          'The wall is full. {one} looked at the whole of it tonight and then went to bed.'],
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
        ['{two} has won eleven nights running. We think {two} is cheating. We cannot prove it.',
          'The {twojob} has taken every hand this week. {one} has started checking the dice.',
          'We play for chores now. {two} has not cleaned the filter in a fortnight.'],
        ['We played for the last of the sweet ration tonight. {one} won it and gave it back.',
          'The game ran until the third hour. Nobody wanted to be the one to stop it.',
          '{one} and {two} played for who walks out to the far marker. {one} lost and went in the morning.'],
        ['Nobody asked for the dice tonight. {one} put them away without a word.',
          'We have not played in nine days. The board is still out on the bench.',
          '{two} set the board up tonight and sat there. Nobody came.'],
      ],
    },
    {
      key: 'silence',
      coda: ['{one} spoke at supper tonight. {one} said we should go.',
        '{one} has not said anything tonight. I have written this where {one} can read it.'],
      beats: [
        ['{one} has not said much this week. We have all noticed and none of us has said so.',
          'Our {onejob} has gone quiet. {one} works, and answers, and that is the whole of it.',
          '{one} did not speak at supper tonight. That is three suppers.'],
        ['{one} works, eats, and goes to the cot. {one} answers when asked and no more than that.',
          '{one} has taken the far shifts, alone, and has asked for more of them.',
          '{one} sits outside after the work with the helmet off and looks at the ground.'],
        ['I asked {one} what was wrong. {one} said the quiet. Then {one} went back to work.',
          'I asked. {one} said there is nothing to say out here. I think that is the truth.',
          '{two} tried tonight and got further than I did. {one} talked for a minute about home.'],
        ['{one} talked at supper tonight for ten minutes. Nobody interrupted.',
          '{one} asked {two} for the dice tonight. That is the first thing {one} has asked for in a month.',
          '{one} has started leaving notes on the bench instead of speaking. They are good notes.'],
      ],
    },
    {
      key: 'cook',
      coda: ['{one} cooked tonight, with what is left, and made a job of it.',
        'There is one meal left in the store and {one} is saving it.'],
      beats: [
        ['{one} has taken over the food. It is better than it was and we have said so.',
          'Our {twojob} cooks now, whatever the roster says. Nobody has argued.',
          '{one} found spice in a personal kit and put it in the pot. The whole bay smelled of it.',
          '{one} has started cooking to a plan, a different thing each day of the week.',
          '{two} handed the pot over to {one} tonight and admitted defeat about it.'],
        ['{one} made something out of the last of the dried fruit tonight. We ate it slowly.',
          '{one} has been growing something in a tray for the pot. It went in tonight and it was good.',
          'We have a rule now: everybody sits down together. {one} made the rule and it has held.',
          '{one} baked something flat on the hot plate tonight. We ate the whole of it standing up.',
          '{one} asks what we want each week and writes it down. It changes nothing and we all answer.'],
        ['There is nothing left to work with. {one} still sets the table every night.',
          'It is the same meal every day now. {one} gives it a different name each time.',
          'Our {onejob} asked what was for supper tonight and then apologised for asking.',
          '{one} has started cutting the portions in the store room, alone, out of sight.',
          'The pot went on late tonight and nothing much went in it.'],
        ['{one} cooked the last good meal tonight. All of us knew it was the last one.',
          '{one} has stopped cooking. {one} hands out the packets and sits down with us anyway.',
          'We ate cold tonight to save the power. {one} laid it out on plates all the same.',
          '{one} put the last of the spice in tonight, all of it, and said it was the right night.',
          '{one} cooked for four and there was food left. Nobody wanted to be the one to say it.'],
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
          '{two} hums at work all day without knowing. {one} has started humming the same thing.',
          'We found a song all four of us knew tonight. Nobody expected that.'],
        ['{one} plays most nights now. {two} has started singing with it and has a fair voice.',
          'We have all learned the one song {one} knows the whole of. It is not a good song.',
          '{one} and {two} worked out a second part tonight. It took two hours and it was worth it.',
          'We sing at supper now, every night, whether anybody feels like it or not.',
          '{one} plays the last thing before the lamps go down. It is the shape of the day.'],
        ['We have songs now that nobody outside this ship knows the words to.',
          '{one} has written a verse about our {twojob}. It is unkind and it is funny.',
          'We recorded ourselves singing tonight and put it in the record. It will outlast us.',
          '{two} has written words for the tune {one} plays. They are about this ship.',
          'We played and sang for two hours and lost the whole evening to it. Nobody minded.'],
        ['{one} has not played for a week. I asked. {one} said it was not the night for it.',
          'The whistle has been on the shelf since the cold came. Nobody has mentioned it.',
          '{one} played one tune tonight and stopped in the middle of it.',
          'Nobody has sung at supper for a week. We eat and we go.',
          '{one} played tonight for the first time in a month. {two} came and sat down for it.'],
      ],
    },
    {
      key: 'home', lead: 'message',
      coda: ['We each said a few words into the record tonight, for whoever gets it.',
        'There are four messages in the store that will never be sent. They stay with the record.'],
      beats: [
        ['We each recorded a message home tonight. {one} took the longest by a long way.',
          'Message night. {two} did the whole of it in forty seconds and then sat outside for an hour.',
          'We sent the monthly messages today. Our {onejob} sent two and did not explain.',
          'We recorded for home after supper. {one} laughed all the way through and {two} did not.',
          'Message day. {two} did one for a sister and one for a dog, in that order.'],
        ['{one} has written the same letter four times and sent none of them.',
          '{two} asked me how long a message takes to get home. I did not answer.',
          '{one} keeps a photograph taped inside the locker door. All of us have seen it and nobody says.',
          '{one} reads the old messages back on the bad nights. We can hear them through the wall.',
          '{two} asked me to check whether a message had gone. It had. {two} asked again the next day.'],
        ['{one} has stopped recording messages. The rest of us still do it on the same night.',
          'We have had no reply to anything since the day we landed. We still send them.',
          '{two} recorded one tonight for a person who will be twelve years older when it lands.',
          'Our {onejob} has stopped saying when in the messages. {one} only says where.',
          'We have sent a great many and nothing has come the other way. We sent two more tonight.'],
        ['{one} recorded a long one tonight and asked me to keep it with the record.',
          'We recorded them together tonight, all of us, in one go. It went easier that way.',
          '{one} asked whether the messages are worth the power. Nobody answered. We sent them.',
          '{one} recorded the last one sitting on the step with the hatch open.',
          'We put all of them in the record tonight, and on the band too. Twice is better than once.'],
      ],
    },
    {
      key: 'garden', lead: 'stay',
      coda: ['There is one green thing in the tray tonight and {one} has watered it.',
        '{one} put the tray where the light falls longest. It is the last job {one} did today.'],
      beats: [
        ['{one} set a seed tray up in the bay today. It is not in the mission plan.',
          'Our {twojob} has planted the ration seed stock in a cut-down crate. Nobody stopped {two}.',
          '{one} has made a bed out of a spare panel and filled it with ground from outside.',
          '{two} has taken over the corner by the port with a row of cut-down bottles.',
          'There is a tray of soil on the bench and nobody will say who started it.'],
        ['The tray has taken a cup of water out of the ration every day since day {since}. Nobody has voted against it.',
          '{one} runs a lamp over the tray for two hours a night. That is real power and we let it go.',
          'The tray has a name now. {two} wrote it on the side in marker.',
          'We all stop at the tray on the way past. It has become a thing we do.',
          '{one} has the tray on a timer and checks it against the clock twice a turn.'],
        ['Two shoots came up this week. {one} showed them to each of us in turn.',
          'There is something green in the tray. We have all been to look at it more than once.',
          'The first one came up on the ninth day. {one} did not sleep that night and told us why.',
          'Four shoots now. {two} has measured every one of them and written the numbers up.',
          'We ate what came up tonight, cut in four. It tasted of nothing and it was the best thing here.'],
        ['The shoots died. {one} has cleared the tray out and set it again.',
          '{one} still checks the tray every morning. There is nothing in it. {one} still checks.',
          'The tray is under the lamp with the last of the seed in it. {one} gives it the water anyway.',
          'The lamp over the tray is the last thing we turn off at night. That was a decision.',
          '{one} has moved the tray twice looking for a better place. There is no better place.'],
      ],
    },
    {
      key: 'naming', lead: 'stay',
      coda: ['The names are all in the record, with the map {two} drew.',
        'We put the map in the record tonight, with every name on it.'],
      beats: [
        ['We have started naming things. {one} named the east ridge today and the name has stuck.',
          'Our {onejob} named the flat ground north of us after a street at home. We all use it now.',
          'The three rises west of the ship have names as of tonight. {two} chose two of them.',
          '{two} named the wide flat after a grandmother and told us the whole story with it.',
          'We argued for an hour about the name of one rock and settled it by throwing dice.'],
        ['Every rise inside a day of walking has a name now. {two} keeps the map of them.',
          'The map has forty names on it. {one} draws it again every month, larger.',
          'We have named the weather too. There is a wind here we all call the same thing.',
          'Every hollow inside the walk has a name and a number. The book is {two}’s.',
          'The map is on the bay wall now, a metre across, in four colours.'],
        ['{one} put a marker on the far hill today. We can see it from the hatch in good light.',
          'We walked out to the far hill together and back. It took the whole day and nobody minded.',
          '{two} carved the name of this place into the hull plate by the hatch.',
          '{one} has put a cairn on the highest point inside the walk, with a note under the top stone.',
          'We walked the boundary of the whole named ground in one turn. It took us all of it.'],
        ['Nobody has named anything new for a month. The map is where {two} left it.',
          'We named the last unnamed thing inside the walk today. There is nothing left to name.',
          '{one} has begun naming things twice, and getting the first name wrong.',
          'The map has not been opened in a fortnight. It is still on the wall.',
          '{two} added one more name today, for the ground past the mast, and did not explain it.'],
      ],
    },
    {
      key: 'count', lead: 'doom',
      coda: ['The numbers on the wall have not changed and we have stopped looking at them.',
        '{one} did the sum again tonight and got the same answer.'],
      beats: [
        ['{one} asked tonight how long a rescue would take. {two} did the sum out loud. We let it stand.',
          'We went through the orbit tables after supper. The next window is a long way off.',
          'Our {onejob} worked out what a ship would need to come here. Then {one} put the pad down.'],
        ['We have worked out what we can mend and what we cannot. The list of what we cannot is longer.',
          '{two} has made two lists on the wall. We look at the short one.',
          'Everything on this ship has a date on it now. {one} wrote them all up in one evening.'],
        ['{one} has written the whole plan on the bay wall. We look at it and we do not talk about it.',
          'The numbers say one thing. We have all read them and none of us has said it.',
          'Our {twojob} asked what happens at the end of the wall. Nobody answered {two}.'],
        ['{two} rubbed the plan off the wall this morning. Nobody asked why.',
          'We have stopped doing the arithmetic. It comes out the same every time.',
          '{one} put a line under the last number tonight and closed the pad.'],
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
          'There are animals here and they come in a band. {Others}, {size} each, {n} of them.',
          '{Others} crossed the flat at first light. {one} got the whole band on film.',
          'We have {others} on the record. {size}. They came past in a line of {n} and did not hurry.',
          '{Others} came through the landing circle at dawn. {one} did not move and they went round.',
          'A band of animals crossed the low ground this morning. {Others}, {size} each, {n} in the line.',
          '{Others} went past the mast at first light, {n} of them, one behind the other.'],
        ['{Others} came back today. There were {n} again. {one} counted them twice.',
          'The band came past again. Same count, same hour, same line across the flat.',
          '{Others} take the same route every morning. Our {onejob} has it on the map now.',
          '{Others} came through at dawn and one of them stopped to look at the rover.',
          '{Others} came again and the count held at {n}. {two} has the line of them on film.',
          'Same hour, same band, same {n}. Our {onejob} has started calling it the morning traffic.'],
        ['We can set the clock by {others}. They pass the mast within ten minutes of the same hour.',
          '{one} walked out with the band this morning and kept pace for two kilometres.',
          '{two} sat on the step at dawn and let them come. Three of them came inside twenty metres.',
          '{one} has named the one at the front of the band. The name is on the film and on the map.',
          'We put food at the edge of the circle and four of them came in for it.',
          '{one} has been out at dawn every day this week to meet them. Nobody else gets up for it.'],
        ['{Others} did not come this morning. It is the first day they have missed since day {since}.',
          '{Others} came back tonight and there were more of them. {one} stopped counting at thirty.',
          'The band came through at a run today and did not stop. Something moved them.',
          'There were {n} this morning and one of them would not get up when the rest went.',
          'The band came through the circle in the dark tonight, which they have not done before.',
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
          'One animal, one set of tracks. {Other}, {size}, and no second one anywhere on this ground.',
          '{Other} was at the top of the ridge at dusk. {size}. {two} saw it first and called us all out.'],
        ['{Other} came to twenty metres today. {one} sat still on the step and it stayed an hour.',
          '{Other} has taken the same line past the ship three days running.',
          'Our {onejob} left food out at the edge of the circle. {Other} came and took it.',
          '{Other} was at thirty metres this evening and stayed while {two} set the camera up.',
          'It came in close enough today that we could see the eye move. Nobody breathed.'],
        ['{one} has named it {pet}. {pet} has a torn edge on one side, so we can tell it from any other.',
          '{one} calls it {pet} now, and the rest of us have started calling it {pet} too.',
          'We have named it. {pet}, after the mark down one side. {one} chose and nobody argued.',
          '{two} named it {pet} this evening and wrote the name on the film case.',
          'It has a name as of tonight. {pet}. {one} said it out loud at supper and it stuck.'],
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
          'There is a large animal here. {Other}, {size}, on four legs and in no hurry.',
          'We have measured {other} against the mast. {size}. It walked past while we did it.',
          '{Other} came through the circle this morning. {size}. The ground took the weight and shook.',
          'The big ones came over the ridge at dawn. {Other}, {size}, and the head above the mast top.',
          'We heard it before we saw it. {Other}, {size}, and it came past at walking pace.'],
        ['{Other} takes the same road out at dawn and back at dusk. {one} has walked the road too.',
          'The big ones use one line across this ground and they have used it for a long time.',
          'Our {onejob} followed the road four kilometres today. It goes where the low ground goes.',
          'The road they use is worn a hand deep into the ground. {two} says it took years.',
          'They go out at dawn and come back when the light goes. We can set the day by them.'],
        ['{one} walked beside one for two kilometres today. It let {one} do it the whole way.',
          '{one} put a hand on the flank of one this morning. It stopped. Then it walked on.',
          '{two} walked out with them at dawn and came back at noon, on foot, grinning.',
          'One stopped beside {one} today and stood there while {one} measured the leg.',
          '{one} has been feeding one off the step. It comes to the hand now and takes it gently.'],
        ['{one} has been talking about getting on the back of one. Nobody has said no yet.',
          'They stand still while we are near them now. {one} has noticed that and has an idea.',
          '{one} has made a harness out of cargo strap and will not say what for.',
          'One knelt today, right down, beside {two}. Nobody has been able to talk about anything else.',
          '{one} got a hand on the back of one this morning and the animal did not move.'],
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
        ['The line it leaves runs past the forward leg every second day. {one} has traced it out to the ridge.',
          'We found it coiled by the warm ground under the bay. It stayed coiled while we looked.',
          'Our {onejob} timed it over a hundred metres. It is faster than any of us.',
          'The line it leaves goes under the rover and out the other side. {two} measured the width of it.',
          'It came to the warm ground by the bay at dusk and stayed an hour.'],
        ['{one} has named it {pet}. {pet} comes to the same warm spot most evenings.',
          'We call it {pet} now. {one} lay down beside the coil today and it did not move.',
          '{two} named it {pet} after the pale ring behind the head. The name is in the file.',
          'It is {pet} from tonight. {one} chose the name and the rest of us took it.'],
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
        ['They pick a line before they fold and they hold it to the end. Our {onejob} has proved that with the camera.',
          'One came through the landing circle in two throws today and missed the mast by a metre.',
          'They stand a long while between throws. {one} says it is choosing. {one} may be right.'],
        ['{one} has named one of them {pet}. {pet} has a chip out of the hull on one side.',
          'We call the one with the marked shell {pet}. {one} put the markers out to track its throws.',
          '{two} named it {pet} after a throw went clean over the rover. The name held.'],
        ['{pet} came to rest against the forward leg tonight and stayed there.',
          'Three of them went over the ridge in one line this morning, one after another.',
          '{pet} has stopped throwing. It has been in the same place two days and we do not know why.'],
      ],
    },
    {
      key: 'flow', tags: 'beasts mflow', lead: 'catch',
      beats: [
        ['{Other} has no shape. {size} when it gathers, and a sheet a few paces wide when it goes.',
          'There is an animal here that pours. {Other}, {size} when it is a body at all.',
          'We have {other} on the record and the record does not do it justice. {size}, and no two frames alike.'],
        ['It runs the fall of the ground and gathers at the foot of every slope. Our {onejob} has timed it.',
          'It sat on the high rock all day, gathered and still. {two} took it for a stone for an hour.',
          'It came down the west slope this morning in nine seconds. It took all afternoon to go back up.'],
        ['{one} calls it {pet}. {pet} is on the same rock most mornings.',
          'It has a name now. {pet}. {one} put a hand near it and it drew back and came forward again.',
          '{two} named it {pet} and drew it on the wall. It gathers on the warm plate most nights.'],
        ['{pet} came over the step and into the bay tonight. {one} sat with it until it left.',
          'It poured over the cable run and nothing was damaged. We have stopped worrying about that.',
          '{pet} has not been on the rock since the cold came. {one} goes and looks every morning.'],
      ],
    },
    {
      key: 'sling', tags: 'beasts msling flora',
      beats: [
        ['{Other} throws a cord at the {plants} and swings off the hold. {size}. It crosses the stand without touching the ground.',
          'There is an animal here that travels through the {plants} on a line it grows itself. {Other}, {size}.',
          'We have {other} on the record. {size}, and it has not touched open ground once.'],
        ['It works the thickest stand and never comes out of it. Our {onejob} has mapped the route.',
          'The cord takes hold, the body winds back, and it is gone. {two} has it at high speed on film.',
          'It came within four metres of the mast today and went back into the {plants} without stopping.'],
        ['{one} calls it {pet}. {pet} has a short cord and mends it in the open where we can watch.',
          'We have named the near one {pet}. {one} sat in the stand at dusk until it came to arm’s reach.',
          '{two} named it {pet} after finding its shed cord under a {plant}.'],
        ['{pet} threw a cord at the mast this morning and used it. Nothing broke.',
          'They have moved out of the near stand. {one} has walked two kilometres to find them.',
          '{pet} came back to the near stand tonight after nine days. {one} saw it first.'],
      ],
    },
    {
      key: 'fly', tags: 'beasts mfly', lead: 'follow',
      beats: [
        ['{Other} came over the ship this evening. {size}. It circled twice and went north.',
          'There are flying animals here. {Others}, {size} each, and they pass at the same hour every day.',
          'We have {other} on film at {size}. It beat once, opened the wings, and was gone.',
          '{Other} came down the ridge line at dusk, low and fast, and did not land.',
          'First flyer on the record. {Other}, {size}. It went over the mast and did not come back that night.',
          '{Other} is on the record at last. {size}, and it beats twice and then holds for a hundred metres.',
          'Two of them came over the circle at dusk, {size} each, and turned together without a sound.'],
        ['{one} put a lamp on the mast. {count} of them came and stayed until the lamp went out.',
          'They come to the warm air over the radiators. There were {count} of them above us at noon.',
          'One landed on the dish this morning. It sat there for an hour and then went.',
          'They cross the circle at the same hour every evening. {two} has the hour written down.',
          '{one} put food on the step and three came down for it inside the hour.'],
        ['{one} has named the one with the torn wing {pet}. {pet} comes to the lamp most nights.',
          'The one with the torn wing is {pet} from tonight. {one} named it and we all use it.',
          '{two} named one {pet} and can pick it out of six now, every time.',
          'We have a name for the bold one. {pet}. It came down to the step for food today.'],
        ['One came into the bay through the open hatch today. {one} got it out with a sheet. Nobody was hurt.',
          '{pet} has not come to the lamp for five nights. {one} keeps the lamp on.',
          'They all went south this morning, every one of them, and the sky has been empty since.',
          '{pet} came in through the hatch tonight and would not go out. {one} sat with it until dawn.',
          'The whole flock came over at midnight, which they have never done. We all went out for it.'],
      ],
    },
    {
      key: 'swarm', tags: 'beasts mswarm',
      beats: [
        ['{Others} are not one animal. {size}. They came over the ridge together and turned as one thing.',
          'There is a swarm on this world. {Others}. {size}. There is no one body to point at.',
          'We have the wheel on film. {size}. Our {onejob} has tried to count the parts and cannot.'],
        ['The wheel comes over the ship at the same hour and holds there for a minute.',
          '{one} walked into the wheel today. It opened round {one} and closed again behind.',
          'The wheel broke into three over the ridge this morning and was one thing again by the flat.'],
        ['{one} put a lamp out and the wheel came down to it and stood in the air over it.',
          '{two} has recorded the sound of it. It is a low note and it changes when the wheel turns.',
          'The wheel has started coming twice a day. It comes closer each time.'],
        ['The wheel came through the landing circle at head height. None of us moved and none of us was touched.',
          'The wheel has not come for three days. The air over the flat is empty and it is worse.',
          'The wheel went over at midnight, which it has never done. {one} woke all of us for it.'],
      ],
    },
    {
      key: 'drift', tags: 'beasts mdrift',
      beats: [
        ['{Other} came over on the wind this morning. {size}. It does not land and it cannot.',
          'There are bladders of gas that live in the air here. {Other}, {size}, and the wind decides.',
          'We have {other} on the record. {size} of sac, and it goes where the air goes.',
          'Something came over the ridge this morning with the wind behind it. {Other}, {size}.',
          '{Other} is on film at two hundred metres. {size}. It has no say in where it is going.',
          'There is one over the flat now and it has been there since dawn. {Other}, {size}.'],
        ['Three of them came over the flat today at fifty metres, all going the same way.',
          'They hang over the warm ground on the south side and turn slowly. Our {onejob} has film of it.',
          'One came down to twenty metres over the mast and hung there for most of an hour.',
          'They come with the evening wind, in ones and twos, and they go out with it.',
          '{two} has worked out the height they hold. It is the same height every day.',
          'One caught the warm air off the radiators today and rose the whole way out of sight.'],
        ['{one} has named it {pet}. {pet} has a dark band round the middle of the sac.',
          'It is {pet} from tonight. {one} named it off the dark band round the sac.',
          '{two} named it {pet} and has drawn it twice from underneath, and got the pattern right.',
          'We call the low one {pet}. It came over at ten metres tonight and {one} was under it.'],
        ['{pet} caught on the mast today. {one} freed it with a pole and it went on.',
          'The wind turned and took all of them east. There has been nothing over us for a week.',
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
          'One came over at dawn, {size} of it, and the shadow crossed the whole landing circle.'],
        ['It dips toward the ground and pulls up again, over and over, all the way across.',
          'Our {onejob} has the song on tape. It is very low and it carries a long way.',
          'Two of them crossed together today, one above the other, holding the same line.'],
        ['{one} calls the one with the pale belly {pet}. We can pick {pet} out at any height.',
          'It has a name now. {pet}, for the pale mark down the belly. {two} chose it.',
          'We have started calling one of them {pet}. {one} can pick it out at two hundred metres.'],
        ['{pet} has crossed at the same hour for thirty days. We have stopped calling it a coincidence.',
          'The sky has been empty for eleven days. {one} goes out at dusk anyway.',
          '{pet} sang over the ship last night and the hull carried it. Nobody slept after.'],
      ],
    },
    {
      key: 'dig', tags: 'beasts mdig', lead: 'catch',
      beats: [
        ['The seismometer finds {other} long before the camera does. {size}, and the camera has nothing.',
          'There is something moving under this ground. {Other}, {size}, and we have not seen it once.',
          'We have {other} on the record and not on film. {size}. It pushes a mound ahead of it as it goes.'],
        ['There is a raised line across the landing circle this morning. {one} traced the whole of it.',
          'The mound came past the forward leg in the night. Our {onejob} has it on the instrument.',
          '{two} followed the raised line to the ridge. It runs two kilometres and then turns back.'],
        ['{one} calls it {pet}. {pet} works the same square of ground most nights.',
          'We have named the one under the circle {pet}. {one} lay flat and felt it go under.',
          '{two} named it {pet} after it came to the plate we put down. That was an answer.'],
        ['{pet} came up at the edge of the circle tonight. We saw the back of it and nothing more.',
          'The ground under the aft leg has given a hand. We know what is doing it.',
          '{one} wants to dig one out and look at it. I have said no twice.'],
      ],
    },
    {
      key: 'anchor', tags: 'beasts manchor', lead: 'catch',
      beats: [
        ['{Other} does not travel at all. {size}. We have it marked and numbered where it stands.',
          'There is an animal here that stays in one place. {Other}, {size}.',
          'We have {other} on the record. {size}. Number four is forty metres from the hatch.'],
        ['There are nine of them inside the square. {one} has marked and numbered every one.',
          'It goes down when we come near and comes back up an hour after we have gone.',
          'Our {onejob} sat forty metres off with the long lens and got the whole of it on film.'],
        ['{one} calls number four {pet}. {pet} stays up now while {one} works within ten metres.',
          'Number four has a name. {pet}. {one} has been sitting near it for an hour a day.',
          '{two} named number four {pet} and put a marker beside it.'],
        ['{pet} has not come up in four days. {one} goes out and sits there anyway.',
          'Two of the nine have gone. The holes are open and there is nothing in them.',
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
  const ENDINGS = pool([
    // --- the known doom, faced calmly
    { kind: 'doom', t: 'The cells are down to the transmitter and the clock. We read the record back once tonight and closed it. Come and take it.' },
    { kind: 'doom', t: 'The scrubber failed this morning and we cannot mend it. We have about a day. {one} is making supper anyway.' },
    { kind: 'doom', t: 'The last of the food went today. {one} shared it out and made it look bigger than it was. Nobody said anything about tomorrow.' },
    { kind: 'doom', t: 'We have put everything that is left into the transmitter. It will run four days after we stop. That is the whole plan.' },
    { kind: 'doom', w: 2.5, tags: 'leaddoom', t: 'We have reached the end of the numbers on the wall. All of us knew the date. Tonight we sat down together and let it come.' },
    { kind: 'doom', w: 2.5, tags: 'leaddoom', t: 'There is nothing left to mend and nothing left to mend it with. We have stopped work. The record is closed and the carrier is up.' },
    { kind: 'doom', tags: 'harsh', t: 'This world was always going to win. We have known the date for a month and we have worked right up to it. Come and take the record.' },
    { kind: 'doom', w: 2.5, tags: 'harsh leaddoom', t: 'We shut the outer bay for the last time tonight. Nobody will open it again. The record is in the hardened store and the dish is pointed.' },
    { kind: 'doom', tags: 'frozen|subzero|cold', t: 'The heaters go off tonight. At {temp} the record will keep far better than we will. We have said what we wanted to say.' },
    { kind: 'doom', tags: 'hot|molten', t: 'The radiators are finished. At {temp} we have until noon. The record is in the hardened store and the dish is pointed.' },
    { kind: 'doom', tags: 'longday|slowspin', t: 'Dawn is {night} away and the cells will not reach it. We are writing this in the dark. There is nothing else to do.' },
    { kind: 'doom', tags: 'polarnight', t: 'The sun goes round the horizon once more and then it will stop rising. We have closed the log while there is light to close it in.' },
    // --- the reckless plan: ride it. Only an animal with legs, and a big one.
    { kind: 'ride', w: 4.5, tags: '!leadsecond beasts mwalk leadride', if: g(bigBody), t: 'Tomorrow {one} and I will try to ride {other}. They are {size} and they pass at dawn. {two} says it is a bad plan. {two} is right. We are going anyway.' },
    { kind: 'ride', w: 4.5, tags: '!leadsecond beasts mwalk leadride', if: g(bigBody), t: 'We are getting on the back of one in the morning. {two} has the harness finished. It is the only idea any of us has left.' },
    { kind: 'ride', w: 4.5, tags: '!leadsecond beasts mwalk leadride', if: g(bigBody), t: 'They walk the same road every dawn and we are going with them. {size} of animal and two of us. {one} has not stopped smiling since we decided.' },
    { kind: 'ride', w: 2, tags: '!leadsecond beasts mwalk', if: g(bigBody), t: 'Tomorrow we ride one of {others} until it puts us off. We have watched them for {days} days. Whatever comes of it, we are done sitting here.' },
    // --- the reckless plan: take hold of one
    { kind: 'catch', w: 2, tags: '!leadsecond beasts mwalk', if: g(handBody), t: 'Tomorrow we take one of {others} and hold it long enough to measure it properly. {size}. {one} has made a net out of the cargo webbing. We let it go after.' },
    { kind: 'catch', w: 2, tags: '!leadsecond beasts mwalk', if: g(handBody), t: 'We are catching one in the morning. {size}, and {one} says two of us can hold that. I do not think {one} is right. We are doing it anyway.' },
    { kind: 'catch', w: 4.5, tags: '!leadsecond beasts mdig leadcatch', t: 'Tomorrow {one} and I dig down beside the line and wait for it to come. I said no for {days} days. I have stopped saying no.' },
    { kind: 'catch', w: 2, tags: '!leadsecond beasts mdig', t: 'We start the trench at first light, right across the run, and we sit in it until something comes through. {one} has the camera and I have the lamp.' },
    { kind: 'catch', w: 2, tags: '!leadsecond beasts manchor', t: 'Tomorrow {one} and I sit down beside {pet} at dawn and stay there all day. We want to see the whole of it come up. That is the only reason.' },
    { kind: 'catch', w: 4.5, tags: '!leadsecond beasts mcrawl|mroll|mflow leadcatch', t: 'Tomorrow {one} and I put hands on one and hold it long enough to weigh it. {size}. We let it go straight after. {two} says we will not manage it.' },
    { kind: 'catch', w: 2, tags: '!leadsecond beasts mcrawl|mroll|mflow', t: 'We are going to take one in the morning and get the whole of it on the scale. {one} has the webbing ready. Nobody has done this before.' },
    { kind: 'catch', w: 2, tags: '!leadsecond beasts msling flora', t: 'Tomorrow we go into the {plants} and wait with the net. {one} has picked the hold they use most. We want one in the hand for an hour and then we let it go.' },
    { kind: 'catch', w: 2, tags: '!leadsecond beasts manchor', t: 'We are going to sit out the whole turn by the holes, both of us, and not move. {one} says it will come up. I think {one} is right.' },
    // --- the reckless plan: follow it
    { kind: 'follow', w: 4.5, tags: '!leadsecond beasts mfly leadfollow', t: 'Tomorrow we put the last of the power into the lamp and count how many come. {one} wants them all on film. It is not a plan. It is what we want to do.' },
    { kind: 'follow', w: 2, tags: '!leadsecond beasts mfly', t: 'We are following them to wherever they go at dusk. {one} has the rover charged. We will not be back before dark and we know it.' },
    { kind: 'follow', w: 2, tags: '!leadsecond beasts mfly', t: 'We are putting a line and a small camera on one in the morning. {one} has done the knot four times. Tomorrow we find out where they sleep.' },
    { kind: 'follow', w: 4.5, tags: '!leadsecond beasts mcruise leadfollow', t: 'Tomorrow we take the rover south under them and keep going while they are in the sky. {one} has the tape running. We want to hear the whole song once.' },
    { kind: 'follow', w: 2, tags: '!leadsecond beasts mcruise', t: 'They cross at the same hour. Tomorrow we will be out on the open ground under them. We are taking every camera we have.' },
    { kind: 'follow', w: 2, tags: '!leadsecond beasts mswarm|mdrift', t: 'Tomorrow {one} and I go out on to the open flat and let it come over us. We want to be inside it once. That is all.' },
    { kind: 'follow', w: 2, tags: '!leadsecond beasts mroll|mflow|msling|mcrawl', t: 'Tomorrow {one} and I follow {pet} until it stops, however far that is. We want to see where it lives. That is the only reason.' },
    // --- the walk out, on foot, toward something real
    { kind: 'walk', w: 2, t: 'We start walking north in the morning. {one} has the map and {two} has the water. We will send from the far ridge if we reach it.' },
    { kind: 'walk', w: 3.5, tags: 'leadwalk', t: 'We are going out to look for the one we lost. All of us, on foot, at first light, along the track and past the end of it.' },
    { kind: 'walk', tags: 'mostlysea waterliquid', t: 'We leave on foot at dawn and we follow the water round. It is nine days of walking and we have six days of it. {one} says we can do it.' },
    { kind: 'walk', tags: 'volcanic', t: 'We walk out in the morning, south toward the vents. There is heat there and there is none here. We are taking the record with us.' },
    { kind: 'walk', tags: 'geysers', t: 'We leave at first light and walk to the geyser field. The ground is warm there. We will build against a rock and wait.' },
    // --- the launch. The reader knows how it went, because the wreck is here.
    { kind: 'launch', w: 2, t: 'We lift at first light. {one} has run the numbers four times. They are thin and they are good enough. We leave the record here in case.' },
    { kind: 'launch', w: 2, t: 'The engine held at full for nine seconds today. That is enough to try. We go in the morning and we are all going.' },
    { kind: 'launch', w: 2, t: 'Everything we can take is aboard and everything else is on the ground. We lift at dawn. {two} has already said goodbye to the place out loud.' },
    { kind: 'launch', w: 2, t: 'Our {onejob} says the window is tomorrow or it is never. So it is tomorrow. Nobody slept and nobody is going to.' },
    // --- the split
    { kind: 'split', t: 'We have split the food and the water in two. {one} and {two} walk out at dawn. I am staying here with the transmitter.' },
    { kind: 'split', w: 6, tags: 'leadsplit', t: '{one} goes in the morning and I stay. We are both sure we are right. We have each written the other a letter and neither of us has read one.' },
    { kind: 'split', w: 6, tags: 'leadsplit', t: 'It was settled tonight without a row, which is the strange part. {one} and {two} leave at dawn. The rest of us keep the mast up.' },
    { kind: 'split', tags: 'mostlysea waterliquid', t: '{one} and {two} follow the shore east at dawn. The rest of us stay with the ship. We shook hands tonight and nobody made a speech.' },
    // --- the entry that stops
    { kind: 'cut', w: 2, t: 'The hatch alarm is going and {one} is shouting for me. I will finish this when I' },
    { kind: 'cut', w: 2, t: 'There is something at the forward leg and {one} has taken the lamp out to it. I am going out to' },
    { kind: 'cut', w: 2, t: '{one} says there is a light on the ridge and it is not ours. I am going up to the mast to' },
    { kind: 'cut', w: 2, t: 'The whole deck has just moved and I can hear water. {two} is at the hatch. I have to' },
    // --- the second hand
    { kind: 'second', w: 3.5, tags: 'leadsecond', t: 'This is {one}. {keeper} kept this log. {keeper} died three days ago. I do not write as well but somebody had to finish it.' },
    { kind: 'second', w: 3.5, tags: 'leadsecond', t: 'This is {one}, the {onejob}. {keeper} wrote everything above this line and asked me to write this one. I have read it all back. It is true.' },
    { kind: 'second', t: 'This is {two}. {keeper} kept the log to the end and then could not. There are two of us left and we are still working.' },
    { kind: 'second', t: 'This is {one}. I have added nothing to what {keeper} wrote. I have only closed it and set the carrier to repeat.' },
    // --- the quiet one: they stay
    { kind: 'stay', t: 'Nobody is coming for us. We have stopped waiting and started living here. Tomorrow we begin on a proper roof.' },
    { kind: 'stay', t: 'We took the seats out of the lander today and made a room of it. This is home now. That is the whole of the entry.' },
    { kind: 'stay', w: 3.5, tags: 'leadstay', t: 'We voted tonight and it was not close. We stay. In the morning we start on the ground beyond the mast, properly, for the long run.' },
    { kind: 'stay', w: 3.5, tags: 'leadstay flora', t: 'We have cleared ground beyond the mast and put the seed store in it. Some of it has come up. We are staying, and we have said so out loud.' },
    // --- the message to whoever finds the log
    { kind: 'message', tags: 'waterliquid', t: 'Whoever finds this: the ground is firm and the water is good. We were {crew}. We were here {days} days and we did the work.' },
    { kind: 'message', t: 'Whoever finds this: the record is complete and every number in it is ours. We were {crew}. We were here {days} days.' },
    { kind: 'message', w: 3.5, tags: 'leadmessage', t: 'To whoever comes: take the record, and take the names off the board by the hatch. That is the part that matters. The rest is only data.' },
    { kind: 'message', tags: 'beasts', t: 'Whoever finds this: {others} will not hurt you. Sit still and they will come. We were here {days} days and that was the best part of it.' },
    { kind: 'message', t: 'If you are reading this, you are standing where we stood. It is a better place than it looks. Keep the mast up if you can.' },
    // --- the last joke
    { kind: 'joke', w: 1.6, t: '{one} says we should charge the next crew rent. We laughed for a long time. We wanted that to be the last thing in the log.' },
    { kind: 'joke', w: 1.6, t: '{one} has written a sign and hung it on the hatch. It says: out, back never. We have left it up.' },
    { kind: 'joke', w: 1.6, t: '{two} wants it on the record that {two} was right about the pump. It is on the record now. That is the end of it.' },
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

  // ---------------------------------------------------------------- the people
  // Short given names from many languages, easy for a child to read aloud. A log never gives a
  // surname. No place of the Earth and no species of the Earth, the rule docs/flora.md states for
  // the plants; a given name is neither.
  const NAMES = [
    'Ana', 'Amir', 'Aila', 'Bo', 'Bram', 'Cato', 'Chen', 'Dara', 'Dev', 'Dilan',
    'Eda', 'Eero', 'Elif', 'Emil', 'Esi', 'Farid', 'Gil', 'Gita', 'Hana', 'Hedda',
    'Hugo', 'Ines', 'Isa', 'Ivo', 'Jana', 'Jonas', 'Juno', 'Kai', 'Kira', 'Kofi',
    'Lars', 'Lena', 'Leo', 'Lina', 'Liv', 'Luca', 'Mai', 'Marek', 'Mina', 'Mira',
    'Nadia', 'Nils', 'Noor', 'Nuri', 'Omar', 'Oskar', 'Otto', 'Pavel', 'Pia', 'Priya',
    'Raj', 'Rami', 'Rosa', 'Ruben', 'Sami', 'Sanne', 'Sara', 'Suri', 'Sven', 'Tam',
    'Tariq', 'Tilda', 'Tomas', 'Tova', 'Uma', 'Vera', 'Viktor', 'Wen', 'Yara', 'Yuki',
    'Yves', 'Zane', 'Zeno', 'Zoya',
  ];
  // One role each. A ship this small gives everybody one job and no second one. The log names the
  // job as often as the name, because no pronoun stands for a person here.
  const ROLES = ['pilot', 'engineer', 'medic', 'biologist', 'geologist', 'cook', 'radio operator',
    'navigator', 'mechanic', 'chemist', 'surveyor', 'quartermaster'];
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
  function beastTokens(G, pet) {
    const one = G.lore.name.toLowerCase(), many = G.lore.plural;
    return {
      other: 'the ' + one, Other: 'The ' + one, others: 'the ' + many, Others: 'The ' + many,
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
  function chooseThreads(rng, ctx, spare, want) {
    const used = new Set();
    const out = [];
    const beats = () => out.reduce((s, x) => s + x.take, 0);
    const add = (t) => { if (t) out.push({ t, take: t.beats.length }); };
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
        if (out[i].t.retires || out[i].take <= THREAD_MIN_BEATS) continue;
        if (pick < 0 || out[i].take > out[pick].take) pick = i;
      }
      if (pick < 0) break;
      out[pick].take--;
    }
    while (beats() > BEAT_MAX && out.length > 1) out.pop();
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

    // How long this log runs. The count varies from world to world, because a short log and a long
    // one read as two different missions.
    const wantBeats = BEAT_MIN + Math.floor(rng() * (BEAT_MAX - BEAT_MIN + 1));
    const threads = chooseThreads(rng, ctx, others.length, wantBeats);
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

    const base = worldTokens(world, env, probe, (world.env || {}).obliquityDeg);
    if (G) Object.assign(base, beastTokens(G, pet));
    base.keeper = keeper;
    base.keeperjob = jobOf.get(keeper);
    base.crew = L.num(crew.length);
    base.many = String(many); base.few = String(few); base.count = L.num(count);
    const people = (one, two) => ({ one, two, onejob: jobOf.get(one), twojob: jobOf.get(two) });

    const entries = [];
    const arrival = L.line(rng, ARRIVAL, ctx, new Set());
    const first = { ...base, days: '1', since: '1', ...people(others[0], others[1] || others[0]) };
    entries.push({
      slot: 'landing', title: 'Landing', day: days[0],
      text: arrival ? cap(L.fill(arrival.t, first)) : '',
    });

    // `lost` records the person a thread took out of the story, and the day of it.
    let lost = null;
    items.forEach((it, j) => {
      const day = days[j + 1];
      const [one, two] = cast.get(it.t);
      const tk = { ...base, days: String(day), since: String(firstDay.get(it.t)), ...people(one, two) };
      // A beat is a list of wordings, or an object that also takes a person out of the story.
      const say = Array.isArray(it.beat) ? it.beat : it.beat.say;
      if (!Array.isArray(it.beat) && it.beat.out) lost = { name: one, day, how: it.beat.out };
      entries.push({
        slot: it.t.kind + '.' + it.t.key, title: '', day,
        text: cap(L.fill(L.pick(rng, say), tk)),
      });
    });

    // The ending. It may only name a person who is still here, so it reads the alive list and not
    // the crew list. A gated ending outranks one that fits any world, by the weight of its gate,
    // and the lead tags above are what make it follow the threads.
    const end = L.line(rng, ENDINGS, ctx, new Set());
    const day = days[days.length - 1];
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
      if (nSent <= 5 && end.kind !== 'cut' && end.kind !== 'second' && !(lost && coda.includes(lost.name))) {
        endText += ' ' + coda;
      }
    }
    entries.push({
      slot: 'end.' + (end ? end.kind : 'doom'), title: 'Last entry', day, text: endText,
    });

    return {
      probe, days: day, species: G ? G.lore.name : null,
      crew, keeper, lost, entries,
    };
  }

  self.SourceLore = {
    writeLog, sourceTags, sourceLatDeg, motionOf, salienceOf,
    TOKENS, BEAST_TOKENS, ENDING_KINDS, MOTION, LEADS,
    NAMES, ROLES, PET_NAME,
    ARRIVAL, ENDINGS,
    THREADS: { world: WORLD_THREADS, crew: CREW_THREADS, fauna: FAUNA_THREADS },
    LIMITS: { CREW_MIN, CREW_MAX, ENTRY_MIN, ENTRY_MAX, THREAD_MIN_BEATS },
  };
})();
