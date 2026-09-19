// myworlds — the log of the source. It turns the facts of a world into the four entries an older
// survey probe left behind in its wreck.
//
// The worker loads it with importScripts(), after lore.js and species.js. It exposes
// self.SourceLore. It holds no three.js, and it reads no geometry.
//
// lore.js holds the engine and no words. species.js brings the fauna vocabulary. flora-lore.js
// brings the plant vocabulary. This file brings the vocabulary of the wreck, and none of the four
// reads the words of another.
//
// Issue 34, slice 4. The story has four named slots, in this order:
//
//   arrival   how the old probe came down, and on what ground
//   survey    what it found. It names one species of this world and one fact of that genome.
//   trouble   what went wrong. It is always a real fact of the world.
//   last      the last entry. It closes the log.
//
// Three rules hold the text honest.
//
// 1. Every line names the tags it needs and the tags it forbids, as the fauna and the flora do.
//    A line about a tide never reaches a world with no moon and no sea.
// 2. The trouble is a fact of the world and never a fault of the machine alone. A line with no
//    gate still names one: the temperature, the gravity, or the length of the turn, through a
//    token that carries the real number of this planet.
// 3. A line that names the animal is gated on `beasts`, and the writer fills the animal tokens
//    only when the world really carries a species. A world with no species gets the `!beasts`
//    survey lines, which say so and claim nothing more.
//
// The stream is makeRng(seed + '|source-lore') and nothing else draws from it, so the log of a
// world is the same on every visit and no other part of the world moves when the text changes.
'use strict';

(function () {
  const L = self.Lore;
  const pool = L.pool;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

  // ---------------------------------------------------------------- the slots
  // The card shows the four in this order. `title` is the head of the entry.
  const SLOTS = [
    { key: 'arrival', title: 'Arrival' },
    { key: 'survey', title: 'Survey' },
    { key: 'trouble', title: 'Trouble' },
    { key: 'last', title: 'Last entry' },
  ];

  // ---------------------------------------------------------------- the tokens
  // Every token a line may use. tools/lore-audit reads this list, so a line that names a token the
  // writer does not fill is a fault the sweep reports.
  const TOKENS = ['world', 'probe', 'lat', 'day', 'night', 'temp', 'grav', 'tilt', 'days',
    'moon', 'moons', 'plant', 'plants',
    'other', 'Other', 'others', 'Others', 'size', 'n', 'diet'];
  // The tokens that name the animal. A line that uses one of them must be gated on `beasts`.
  const BEAST_TOKENS = ['other', 'Other', 'others', 'Others', 'size', 'n', 'diet'];

  // ---------------------------------------------------------------- the tags of the source
  // Lore.makeEnv() gives the tags of the planet. Three facts the log needs are not in that set.
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
  // The life. `beasts` says the world carries at least one species with lore.
  const TILT_UPRIGHT = 8, TILT_TILTED = 20, TILT_SIDE = 54, TILT_BACK = 135;
  const POLAR_MARGIN = 5;
  // The latitude of the source in degrees, from its unit direction. The y of a direction is the
  // sine of the latitude, as site.js states.
  function sourceLatDeg(dir) {
    if (!dir) return 0;
    return Math.asin(Math.max(-1, Math.min(1, dir[1]))) * 180 / Math.PI;
  }
  function sourceTags(env, obliquityDeg, hasBeasts, latDeg) {
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
    return tags;
  }

  // ---------------------------------------------------------------- slot 1: the arrival
  // How the probe came down, and what the ground under it was. Seven lines fit any world: each
  // one names the latitude, which every source carries.
  const ARRIVAL = pool([
    'We came down at {lat}, one burn short of the plan. The hull held, and {world} took us without comment.',
    'The descent ran long. We set down at {lat} with the mast bent and the dish still folded, and we counted that a landing.',
    'Contact at {lat}. Two legs took the load and the third took the rest of it. We have stayed where we stopped.',
    'We chose this ground from orbit and we were right about it: flat, open, and a clear line to the sky at {lat}.',
    'The last hundred metres were ours. We stand at {lat}, and the instruments woke one after another as the dust settled.',
    'We were awake for the whole descent. {world} grew from a disc into a floor in nine minutes, and then we were standing on it at {lat}.',
    'Landing at {lat}. Nothing broke. We raised the mast, opened the dish, and began the survey the same hour.',
    { t: 'The descent was heavy. At {grav} the last stage burned twice as long as the plan allowed, and we reached {lat} with nothing left in the tanks.', tags: 'highgrav|crushgrav' },
    { t: 'We came down at {lat} under {grav}, and the legs took the shock without a sound. Nothing here will ever move us again.', tags: 'crushgrav' },
    { t: 'At {grav} the fall was slow enough to choose by. We picked the flat at {lat} on the way down and walked the last of it sideways.', tags: 'lowgrav|feathergrav' },
    { t: 'We came down at {lat} onto ground that rang under the legs. {temp}, and not one of them sank a finger deep.', tags: 'frozen|subzero' },
    { t: 'We came down at {lat} through air at {temp}. The radiators were at the limit before the legs touched, and they have not come off it since.', tags: 'hot|molten' },
    { t: 'We came down at {lat} on the coast, with open water two ridges to the east. The dish went up inside the hour.', tags: 'hasocean waterliquid' },
    { t: 'We came down at {lat}. There is no sea on {world}, and no horizon that is a different colour from the ground.', tags: 'dryworld' },
    { t: 'The island at {lat} is smaller than the map made it. We have walked the whole of it, and the walk takes less than a turn of the planet.', tags: 'mostlysea' },
    { t: 'The ring overhead was the last thing the descent camera kept. We set down at {lat} under the shadow of it.', tags: 'ringed' },
    { t: '{moon} was up when we landed at {lat}, and the light off it was enough to raise the mast by.', tags: 'moonlit' },
    { t: 'We came down at {lat} between two cells of the storm. The lightning took one antenna on the way through and we let it go.', tags: 'stormy' },
    { t: 'We came down at {lat}, upwind of the vents. The ash still reached us by the second hour, and it has reached us every hour since.', tags: 'volcanic' },
    { t: 'We came down at {lat}, a safe distance from the geysers by the numbers the orbiter sent. The numbers were old.', tags: 'geysers' },
    { t: 'We landed at {lat} in the morning of a day {day} long. The shadow of the mast had not moved by the time the survey was finished.', tags: 'longday|slowspin' },
    { t: 'We came down at {lat} into a stand of {plants} and flattened a circle of them. They had straightened again within the week.', tags: 'flora' },
    { t: 'The sky at {lat} was burning when we landed, and the band was noise from end to end. We reported the landing eleven hours late.', tags: 'auroral' },
    { t: 'We came down at {lat} on a world that turns the other way. The sun rose behind us, and nothing in the flight plan had prepared the cameras for it.', tags: 'retrograde' },
    { t: 'The axis of {world} stands very nearly straight, so the sun will run the same arc over {lat} every day we are here. That made the power budget simple, and it is the only simple thing about this landing.', tags: 'upright' },
    { t: 'We came down at {lat} on a world with almost no lean at all. Whatever season {world} is in, it is the season it will be in for the whole of our stay.', tags: 'upright' },
    { t: 'The axis of {world} lies over at {tilt}, and at {lat} the sun runs a flat circle without climbing. We landed in that light and we have worked in it since.', tags: 'polarnight' },
    { t: 'The axis of {world} lies over at {tilt}. We came down at {lat} in a season that will not hold, and the whole survey plan is written around that.', tags: 'sidetilt' },
  ]);

  // ---------------------------------------------------------------- slot 2: the survey
  // One species of the world, and one fact of its genome. Every line is gated: `beasts` for a
  // world that carries life, `!beasts` for one that does not. A line with an `if` reads the
  // genome, and lore.js ranks it above a line that fits any animal.
  //
  // The predicates are the ones the fauna relations use, so the log and the fauna card cannot
  // contradict each other. `g()` keeps a predicate away from a null genome.
  const g = (fn) => (c) => !!c.G && fn(c.G);
  const walks = (G) => G.cls === 'land';
  const flies = (G) => G.cls === 'air';
  const buried = (G) => G.cls === 'sub';
  const grazes = (G) => G.head === 'beak' || G.head === 'stalks' || G.head === 'tusks';
  const hunts = (G) => G.head === 'mandibles' || G.head === 'lure';
  const carries = (G, part) => G.extras.indexOf(part) >= 0;
  const SURVEY = pool([
    { t: 'The first band is surveyed. {Other} is on the record at {size}, and it is the animal we will remember {world} by.', tags: 'beasts' },
    { t: 'We have {other} in full: {size}, and a track we can now read at a glance.', tags: 'beasts' },
    { t: '{Other} came to the lamp on the second night and stood in it. {size}. It left when the lamp did.', tags: 'beasts' },
    { t: 'Diet of {other}: {diet}. We watched one animal for a whole turn of the planet before we wrote that down.', tags: 'beasts' },
    { t: '{Others} pass the mast twice a day, {size} each, and they have stopped treating us as a thing that might move.', tags: 'beasts' },
    { t: 'We call it {other}. {size}. The name is ours; the world offered nothing to call it.', tags: 'beasts' },
    { t: '{Other} is our reference animal on {world}, at {size}. Every measurement of this ground has been taken against it.', tags: 'beasts' },
    { t: 'We met {other} on day {days}. {size}. It looked at the lander for a while and then went back to what it had been doing.', tags: 'beasts' },
    { t: '{Others} are the commonest body on this ground, {size} each, and we have logged one within sight of the mast on most days.', tags: 'beasts' },
    { t: 'The file on {other} is complete: {size}, the diet, the range, and a count we trust. One species of {world} is closed.', tags: 'beasts' },
    { t: '{Other} was the first animal we named here, at {size}, and the naming took less time than the measuring.', tags: 'beasts' },
    { t: 'We have {other} on film at {size}, feeding, resting, and moving between the two. Nothing in the file surprised us except how little it minds us.', tags: 'beasts' },
    { t: '{Others} keep a band of {n}, and the band has held that count on every one of the {days} days we have watched it.', tags: 'beasts', if: g((G) => G.social.kind === 'herd') },
    { t: '{Other} keeps no company at all. In {days} days we have not once had two of them in the same frame.', tags: 'beasts', if: g((G) => G.social.kind === 'solitary') },
    { t: '{Others} go in twos and never in threes. We have both of the pair on the record at {size}.', tags: 'beasts', if: g((G) => G.social.kind === 'pair') },
    { t: '{Other} does not touch the ground while we watch it. {size}, and it holds station over the mast for as long as the mast gives off heat.', tags: 'beasts', if: g(flies) },
    { t: '{Other} reaches the seismometer long before it reaches the camera. {size}, and most of that is under us.', tags: 'beasts', if: g(buried) },
    { t: '{Other} walks. {size}, and after our own the line it leaves is the clearest mark on this ground.', tags: 'beasts', if: g(walks) },
    { t: '{Other} works the low growth over and moves on. {size}. It has taken the same line past the lander for {days} days.', tags: 'beasts flora', if: g((G) => grazes(G) && walks(G)) },
    { t: '{Other} hunts. {size}. It waits longer than our patience holds, and then it does not miss.', tags: 'beasts', if: g(hunts) },
    { t: '{Other} carries its own light at the head of it. Whatever comes to that light does not leave again.', tags: 'beasts', if: g((G) => G.head === 'lure') },
    { t: '{Other} has no head we can point at. It takes the world in over the whole of its surface, and {size} is all we can honestly report.', tags: 'beasts', if: g((G) => G.head === 'none') },
    { t: '{Other} carries plate over the back and the flanks. Nothing we have recorded on {world} has opened one.', tags: 'beasts', if: g((G) => carries(G, 'plates')) },
    { t: '{Other} carries growth on its back and does not shed it. We have taken no sample: the sample would not survive the taking.', tags: 'beasts', if: g((G) => carries(G, 'garden')) },
    { t: '{Other} carries a sail along the back and turns it through the day. We believe that is for heat. We have no way to test the belief.', tags: 'beasts', if: g((G) => carries(G, 'sail')) },
    { t: '{Other} is spined over the whole of the back. Nothing has come near one while we watched, and we now think that is the point of the spines.', tags: 'beasts', if: g((G) => carries(G, 'spikes')) },
    { t: '{Other} reads the ground with a pair of antennae before it puts a foot down. It found the buried cable before we had finished covering it.', tags: 'beasts', if: g((G) => carries(G, 'antennae')) },
    { t: '{Other} feels ahead of itself with tendrils and takes nothing on sight alone. We have it on the record at {size}.', tags: 'beasts', if: g((G) => carries(G, 'tendrils')) },
    { t: '{Others} are not one animal but many. The wheel of them holds together at speed, and we have never been able to count the parts.', tags: 'beasts', if: g((G) => G.plan === 'swarm') },
    { t: '{Other} has no legs and it still crosses this ground faster than we could. {size} of it, and all of that against the ground.', tags: 'beasts', if: g((G) => G.loco === 'serpent') },
    { t: '{Other} stands on one foot and hops. At {grav} the hop carries it much further than it looks as if it should.', tags: 'beasts', if: g((G) => G.loco === 'monopod') },
    { t: '{Other} gathers itself and then spends the whole of it in one throw. We have {size} of it on the record and no idea at all how it aims.', tags: 'beasts', if: g((G) => G.loco === 'roller') },
    { t: '{Other} does not hold a shape. It pours down the slope, gathers at the foot of it, and is a body again.', tags: 'beasts', if: g((G) => G.loco === 'flow') },
    { t: '{Other} travels by taking hold of what grows here and throwing itself off that. It has never once used the mast.', tags: 'beasts flora', if: g((G) => G.loco === 'slinger') },
    { t: 'Survey of the first band is closed and it is empty. Nothing on {world} moves except the weather.', tags: '!beasts' },
    { t: 'We have run the cameras for {days} days and logged no animal. The instruments are working. There is simply nothing here to log.', tags: '!beasts' },
    { t: 'No life on the record. We have widened the search twice, and we are now reporting the absence itself, which is the finding.', tags: '!beasts' },
  ]);

  // ---------------------------------------------------------------- slot 3: the trouble
  // Always a real fact of the world. The seven lines with no gate name the temperature, the
  // gravity, or the length of the turn, and every one of those numbers is a number this planet
  // carries. Every gate below holds at least two lines, so two worlds under one fault do not
  // print one sentence.
  // The seven plain lines take a weight under 1, so a world that carries a named fault usually
  // reports that fault. Without it the plain lines outnumber the gated ones on most worlds and a
  // volcano goes unmentioned in the log of a volcanic world.
  const PLAIN_W = 0.7;
  const TROUBLE = pool([
    { t: 'The night is {night} long and the cells were sized for less. We lose the heaters before the dawn, and we lose a little more of the bay each time.', w: PLAIN_W },
    { t: '{temp} is where this world holds us, and the seals were rated for a narrower band. The bay has been open to the outside since the ninth reseal.', w: PLAIN_W },
    { t: 'At {grav} the legs stand square, but the mast bearing carries that load through every hour of a {day} turn. It has begun to grind.', w: PLAIN_W },
    { t: 'One turn of {world} is {day}. We charge on half of it and we spend the whole of it, and the arithmetic has only ever run the one way.', w: PLAIN_W },
    { t: 'The air at {temp} takes the grease out of every bearing we have. The arm stopped at the elbow and we have not moved it since.', w: PLAIN_W },
    { t: 'We were built for a shorter mission than a world with a {day} day. Everything on us that turns has turned too many times.', w: PLAIN_W },
    { t: 'The dust of this ground is under the panels now. At {grav} it settles and it does not lift again, and the upper face is out of reach of the brush.', w: PLAIN_W },
    { t: 'At {grav} nothing we drop is recoverable. The arm bent on the third sample and the shoulder has carried the fault ever since.', tags: 'highgrav|crushgrav' },
    { t: '{grav} is over the design load of the legs. The forward one has settled for {days} days and the deck is no longer level enough to work on.', tags: 'highgrav|crushgrav' },
    { t: 'At {grav} the drill walks instead of cutting. We have three holes and not one of them is straight.', tags: 'lowgrav|feathergrav' },
    { t: 'At {grav} what we raise does not come down. The upper panels have been under our own dust since the first sample and we cannot clear them.', tags: 'lowgrav|feathergrav' },
    { t: 'At {temp} the cable insulation has gone to glass. Two lines have cracked at the mast, and the third is the one that matters.', tags: 'frozen|subzero' },
    { t: 'The cold here is not weather, it is the state of {world}. {temp}. The heaters run against it and they are losing by a little every day.', tags: 'frozen|subzero' },
    { t: 'The frost gets under the panel seals in the night and lifts them by a hair. After {days} nights the hair is a gap.', tags: 'frozen|subzero' },
    { t: 'At {temp} the radiators do all the work, and at noon they cannot do it. We shut down for the middle of every day and the survey shuts down with us.', tags: 'hot|molten' },
    { t: 'The heat of {world} has taken the cameras. Two are white from end to end and the third reads {temp} on every pixel.', tags: 'hot|molten' },
    { t: 'A day of {day} makes a night of {night}, and the cells do not cross it. We wake cold and we spend the morning becoming useful.', tags: 'longday|slowspin' },
    { t: 'The sun has not moved since the last entry. At {day} to the turn, weather we could have outrun on a faster world simply arrives and stays.', tags: 'longday|slowspin' },
    { t: 'The axis of {world} leans {tilt}, and at {lat} the polar night is already on the map above us. It will not lift inside our power budget.', tags: 'polarnight' },
    { t: 'We are far enough toward the pole, on a world leaning {tilt}, that the sun here will stop rising. The power plan allowed for a season. It did not allow for this.', tags: 'polarnight' },
    { t: 'At a lean of {tilt} this hemisphere is turning away from the sun. It sets a little further along the horizon every day, and what we collect falls with it.', tags: 'tilted' },
    { t: 'On {world} the season is the whole of the weather. At a lean of {tilt}, the ground we surveyed in the warm is not the ground we are standing on now.', tags: 'tilted' },
    { t: 'On a world lying over at {tilt} the year moves the light far more than the day does. Nothing in the power plan was written for a sun that behaves like this.', tags: 'sidetilt' },
    { t: 'At {tilt} the poles of {world} take more light over a year than the equator does. Every rule of thumb we brought with us is the wrong way round here.', tags: 'sidetilt' },
    { t: 'The vents to the south have stayed open for {days} days. The ash is fine enough to pass the filters, and it is in the bearings now.', tags: 'volcanic' },
    { t: 'The ground breathes here. There is ash on the panels every morning, and what we wipe off is back by the evening.', tags: 'volcanic' },
    { t: 'The geysers do not keep the interval the orbiter recorded. One opened inside the landing circle on the ninth day, and it has coated the mast since.', tags: 'geysers' },
    { t: 'We sited ourselves by the geysers because the heat was useful. What they throw is not only steam, and the seals have paid for our arithmetic.', tags: 'geysers waterliquid' },
    { t: 'The storms of {world} come in from the same quarter every time. The charge has taken both antennas, and the second one took the receiver with it.', tags: 'stormy' },
    { t: 'Lightning again, the fourth strike inside {days} days. The mast is a better path to the ground than anything else standing here, and it will be struck again.', tags: 'stormy' },
    { t: 'The aurora is the reason we cannot hear the orbiter. Nine nights in ten the band is noise from one end to the other.', tags: 'auroral' },
    { t: 'When the sky over {world} burns, our clock drifts. We have no way to correct it from the ground, and the error only adds up.', tags: 'auroral' },
    { t: 'We set the lander above the tide {moon} raises, and we were wrong by a little. Twice a day the lowest leg stands in the sea.', tags: 'tides' },
    { t: 'The tide {moon} raises has taken the cable run twice. We have moved it twice. There is no higher ground inside the length of the cable.', tags: 'tides' },
    { t: 'It rains here, and what falls is not clean. There is a film on the upper panels that the brush only spreads.', tags: 'rainy' },
    { t: 'The rain of {world} has found the one seam we could not reach. The lower bay has been wet for {days} days and the wet is at the bus.', tags: 'rainy' },
    { t: 'There is no water on {world} to carry the heat away and none to wash the panels. Everything we have lost, we have lost to the dust and to {temp}.', tags: 'dryworld' },
    { t: 'A dry world gives the wind nothing to carry but grit. It has taken the coating off the dish in {days} days and it is working on the mirror now.', tags: 'dryworld' },
    { t: 'The sea reaches further up this island than the survey allowed for. We have moved twice and there is nowhere left to move to.', tags: 'mostlysea' },
    { t: 'Salt from the open water is in every joint we have. On an island this small there is no ground that is out of the wind off the sea.', tags: 'mostlysea waterliquid' },
  ]);

  // ---------------------------------------------------------------- slot 4: the last entry
  // It ends the story and it does not raise its voice. Seven lines fit any world.
  const LAST = pool([
    { t: 'We have moved the last of the power to the transmitter. On {world} there is nothing else worth keeping warm.', w: PLAIN_W },
    { t: 'The arm of the {probe} is stowed and the dish is pointed at the place the orbiter was. We will hold the carrier up while anything is left to hold it up with.', w: PLAIN_W },
    { t: 'Survey closed at {days} days. The record is complete to this line. We have set the carrier to repeat and we will not add to it.', w: PLAIN_W },
    { t: 'The last of the crew went off at the start of this entry. A transmitter and a clock are what is left of the {probe}, and the clock is only here to date this.', w: PLAIN_W },
    { t: 'We are writing while we can still write. Everything we learned about {world} is in the record above. Somebody should come and take it.', w: PLAIN_W },
    { t: 'Nothing more will be added to the log of the {probe}. The carrier runs until the cells do, and after that the mast is only a mast.', w: PLAIN_W },
    { t: 'We stop at {days} days. The instruments are off, the record is closed, and the transmitter has the rest of what we had.', w: PLAIN_W },
    { t: 'This is the end of the log of the {probe}. Nothing failed here that was not going to fail. Come and take the record.', w: PLAIN_W },
    { t: 'We have written this entry three times and kept the plain one. The survey of {world} is over, the carrier is up, and that is the whole of it.', w: PLAIN_W },
    { t: 'The mast still stands on {world} and the dish is still pointed. That is all we have to leave behind, and it will have to do.', w: PLAIN_W },
    { t: 'Power is down to the transmitter and the clock. We have read the record of {days} days back once, found it sound, and closed it.', w: PLAIN_W },
    { t: 'The heaters went off at the end of the last night and we did not restart them. At {temp} the record will keep far better than we did.', tags: 'frozen|subzero' },
    { t: 'The cold will hold everything on this deck exactly as it is, including this entry. We have counted on that.', tags: 'frozen|subzero' },
    { t: 'Nothing on a dry world takes a machine apart quickly. The record will sit here in the open, and it will still be readable when somebody comes.', tags: 'dryworld' },
    { t: 'What the geysers throw will cover the deck long before anything else finds it. The carrier runs off the mast, which stands above the fall.', tags: 'geysers' },
    { t: 'The sun will go round the horizon once more and then it will not come back up. We have closed the log while there is light to close it in.', tags: 'polarnight' },
    { t: 'The ring overhead will still be there when the mast is a line of rust. We have pointed the last camera up at it and left the shutter open.', tags: 'ringed' },
    { t: 'The ash on the deck is a finger deep and we have stopped measuring it. The record bay is sealed, and the carrier runs off the mast for as long as the mast is clear.', tags: 'volcanic' },
    { t: 'The sky over {world} is lit again and the band is useless. We have left the record where it lies and the carrier where it stands. We are finished talking to the orbiter.', tags: 'auroral' },
    { t: 'The weather off the water will take the rest of us apart within a season. The record is where the wet cannot reach it, and the carrier is up.', tags: 'hasocean waterliquid', w: 0.4 },
    { t: 'The last frame on the camera is {moon} coming up over the ridge. We left the shutter open and put everything after that into the transmitter.', tags: 'moonlit' },
    { t: 'We have earthed everything that can be earthed and accepted the rest. The record is written, the carrier is up, and the storm can have the mast.', tags: 'stormy' },
    { t: 'The {plants} are inside the landing circle now, and they will be over the deck within a season. We leave the record to them to keep.', tags: 'flora' },
    { t: 'We will not see this sun again. At {day} to the turn there is more night ahead than power, so the record is closed and the carrier is on.', tags: 'longday|slowspin' },
    { t: 'The light moves further along the horizon each day, and at {lat} it will not come back inside our budget. We have closed the log and set the carrier to repeat.', tags: 'polarnight' },
    { t: 'The wet is in everything we could not seal, and the bus will follow the arm within a day. We have set the carrier to repeat while it has something to repeat with.', tags: 'rainy' },
    { t: 'It has rained for the whole of the last three turns and the panels take nothing now. We have stopped waiting on the weather and closed the log.', tags: 'rainy' },
    { t: 'At {temp} nothing we leave behind stays soft for long. The record is in the hardened store, and the carrier is on the mast.', tags: 'hot|molten' },
    { t: 'The {plants} have grown up against the forward leg and they will have the whole of it in time. We leave the mast to them and the carrier to whoever hears it.', tags: 'flora' },
    { t: '{moon} is up. We have pointed the last camera at it and left the shutter open. The carrier stays on after the camera stops.', tags: 'moonlit' },
    // A sea and liquid water are a pair that most worlds carry, so these two lines take a weight
    // under 1. Without it the near-universal gate crowds the rest of the slot out.
    { t: 'We never reached the open water two ridges east. It is the one line of the plan we did not finish, and we note it here so the next one finishes it.', tags: 'hasocean waterliquid', w: 0.4 },
    { t: 'At {grav} we will not be blown over and we will not be buried. Whatever comes for this record will find us standing where we landed.', tags: 'highgrav|crushgrav' },
    { t: 'The ash will reach the deck before anything else does. We have sealed the record bay, pointed the dish, and stopped clearing the panels.', tags: 'volcanic' },
    { t: 'Dawn is {night} away and the cells will not reach it. We have put what is left into the transmitter and we are writing this in the dark.', tags: 'longday|slowspin' },
    { t: 'The sun will be under the horizon for longer than our power budget runs. We have set the carrier to repeat and closed the log.', tags: 'polarnight' },
    { t: 'The season is against us from here on, and at a lean of {tilt} the season is a long one. We have put the rest of the power into the transmitter.', tags: 'tilted' },
    { t: 'The next strike takes the transmitter or it does not. Either way, this is the last entry we will make.', tags: 'stormy' },
    { t: 'The sky is burning again and nothing we say goes out through it. We are writing this for the wreck to hold rather than for the orbiter to hear.', tags: 'auroral' },
    { t: 'The rain will be inside the bus by the morning. We have written the record to the hardened store, where the wet cannot reach it.', tags: 'rainy' },
    { t: '{Others} have come closer since the machines stopped moving. Two of them are on the deck now. We have no instruction for that, so we have left the camera running.', tags: 'beasts' },
    { t: '{Other} has been at the foot of the mast since the light went. We are not certain it is waiting for anything. We are not certain that it is not.', tags: 'beasts' },
  ]);

  // ---------------------------------------------------------------- the name of the old probe
  // Plain English nouns and a mark number. No place of the Earth and no species of the Earth, the
  // rule docs/flora.md states for the plants.
  const PROBE_NAME = ['Anvil', 'Bastion', 'Fathom', 'Harrow', 'Keystone', 'Lantern', 'Ledger',
    'Margin', 'Plumb', 'Quadrant', 'Sextant', 'Tessera', 'Trestle', 'Vantage', 'Verge', 'Warden'];

  // ---------------------------------------------------------------- the day count
  // The days are the turns of this planet, counted from the landing. The gaps rise, so the log
  // reads as a mission and not as one week. The card shows `days`, the day of the last entry.
  const DAY_GAP = { survey: [8, 38], trouble: [20, 180], last: [3, 120] };

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
  function tokensFor(world, env, probe, day, obl) {
    const hours = Math.max(1, Math.round(env.dayHours || 24));
    const plant = env.plantWord || 'growth';
    return {
      world: world.designation, probe, lat: latWord(world.source && world.source.dir),
      day: `${hours} hours`, night: `${Math.max(1, Math.round(hours / 2))} hours`,
      temp: `${env.tempC} °C`, grav: `${(env.gravity || 1).toFixed(2)} g`,
      tilt: obl == null ? 'an unmeasured angle' : `${Math.round(obl)} degrees`,
      days: String(day), moon: (env.moonNames && env.moonNames[0]) || 'the moon',
      moons: L.num(env.moons || 0), plant, plants: manyOf(plant),
    };
  }
  function beastTokens(G) {
    const one = G.lore.name.toLowerCase(), many = G.lore.plural;
    return {
      other: 'the ' + one, Other: 'The ' + one, others: 'the ' + many, Others: 'The ' + many,
      size: G.lore.size, n: L.num(G.social ? G.social.n : 0), diet: lower(G.lore.diet),
    };
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
  //   { probe, days, species, entries: [{ slot, title, day, text }, ...] }
  //
  // `species` is the name of the animal the survey names, or null. The page must not show any of
  // this before the reader finds the wreck.
  function writeLog({ world, rng }) {
    const env = L.makeEnv(world.env || { type: world.type });
    const beasts = (world.species || []).filter((G) => G.lore);
    const dir = world.source && world.source.dir;
    const tags = sourceTags(env, (world.env || {}).obliquityDeg, beasts.length > 0, sourceLatDeg(dir));
    const probe = `${L.pick(rng, PROBE_NAME)} ${1 + Math.floor(rng() * 19)}`;
    const G = beasts.length ? L.pick(rng, beasts) : null;
    const ctx = { env, tags, world, G };

    // The days, in the order the entries are written, so the same seed gives the same dates.
    const step = (from, [lo, hi]) => from + lo + Math.floor(rng() * (hi - lo));
    const days = { arrival: 1 };
    days.survey = step(days.arrival, DAY_GAP.survey);
    days.trouble = step(days.survey, DAY_GAP.trouble);
    days.last = step(days.trouble, DAY_GAP.last);

    const POOL = { arrival: ARRIVAL, survey: SURVEY, trouble: TROUBLE, last: LAST };
    const used = new Set();
    const entries = [];
    for (const slot of SLOTS) {
      const e = L.line(rng, POOL[slot.key], ctx, used);
      const day = days[slot.key];
      const tokens = tokensFor(world, env, probe, day, (world.env || {}).obliquityDeg);
      if (G) Object.assign(tokens, beastTokens(G));
      entries.push({ slot: slot.key, title: slot.title, day, text: e ? cap(L.fill(e.t, tokens)) : '' });
    }
    return { probe, days: days.last, species: G ? G.lore.name : null, entries };
  }

  self.SourceLore = {
    writeLog, sourceTags, sourceLatDeg, SLOTS, TOKENS, BEAST_TOKENS,
    POOLS: { ARRIVAL, SURVEY, TROUBLE, LAST },
  };
})();
