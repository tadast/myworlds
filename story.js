// myworlds — the words of the story, as the Story window and the objective show them.
//
// chapters.js holds the rules of the story and the progress of the reader. This file turns one view
// of that progress into the words of the interface: the record that brought the reader here, the
// chapters with their state, and the objective with its next step. It holds no three.js and no DOM,
// so tools/story-check.mjs reads every line in Node.
//
// Two rules hold for every word here. See docs/ui.md.
//
//   no spoilers   A closed chapter tells nothing of itself: no title, no goal, and no band. It says
//                 "Locked" and the number of the chapter it waits for. The reader learns of the ruin
//                 when the log of the wreck names it, and not from a list of chapters.
//   no wreck      Before the find of the first source, no word names it a wreck. The reader knows
//                 only that a carrier called for help: the words say "the source of the signal".
//
//   storyOf(world, view, here)   the story of the world on the screen; see below
//   numWord(n)                   a count under a hundred in words: 'sixteen', 'forty-two'
import { WRECK_FREQ } from './carrier.js';
import { rollCall } from './way-types.js';

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export const numWord = (n) => (n < 20 ? NUM[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + NUM[n % 10] : '') : String(n));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fixes = (n) => (n === 1 ? '1 fix' : `${n} fixes`);
const bearing = (b) => `${String(Math.round(b) % 360).padStart(3, '0')}°`;

// The story of the world on the screen.
//
//   world   the world, with its source and its log
//   view    the view of the progress, from view() of chapters.js, or null
//   here    `{ mode, stage }`: the mode of the probe, and the stage of the landing from land() of
//           chapters.js, or null where the landing heard nothing
//
// Gives `{ has, intro, chapters, objective, done, of, complete, roll }`. `has` is false on a world
// with no story, which is every gas giant and every world with no source: then only `objective`
// holds words.
//
//   intro       `{ years, ship, crew, band, text }`: the distress signal that brought the reader here
//   chapters    `{ id, n, state, locked, title, goal, status, band, fixes, actions }` for each chapter.
//               An action is `{ id, label, chapter, orbitOnly }`: 'aim' turns the globe to a found
//               source, 'clear' drops the wedges, 'brief' opens the brief, 'lost' opens the record,
//               and 'log' opens the card of the chapter again after the end of the story
//   objective   `{ kicker, title, line, chapter, tune }`: the next step of the reader. `tune` is true
//               while the band of the open chapter waits for the tuner
//   complete    the story is over; see view() of chapters.js
//   roll        the roll call of rollCall() of way-types.js once the story is over on a world with a
//               twin, or null
export function storyOf(world, view, here = {}) {
  const log = world && world.source && world.source.log;
  if (!view || !log || !view.chapters.length) {
    return {
      has: false, intro: null, chapters: [], done: 0, of: 0,
      objective: world && world.type === 'gas'
        ? { kicker: 'Gas giant', title: 'A world of storms', line: 'No ground to land on. Zoom in and find what swims in its sky.' }
        : { kicker: 'Uncharted', title: 'First light', line: 'Nobody has been here. Land the probe anywhere and meet the locals.' },
    };
  }
  const intro = {
    years: log.years, ship: log.probe, crew: log.crew.length, band: `${WRECK_FREQ} MHz`,
    text: `${cap(numWord(log.years))} years ago a distress signal reached us from ${world.designation}. `
      + `It came from the carrier ${log.probe}, with a crew of ${numWord(log.crew.length)} aboard. `
      + 'Nobody came back. You came to find out what happened.',
  };
  const ground = here.mode === 'ground';
  const stage = ground ? here.stage || null : null;
  const byId = Object.fromEntries(view.chapters.map((c) => [c.id, c]));
  const wr = byId.wreck, ru = byId.ruin, way = byId.way;

  // The next step of a search, from the landing on the ground and from the fixes in orbit. `thing`
  // names the source without a word the reader has not earned.
  const searchLine = (ch, thing) => {
    if (ground) {
      if (!stage) return `Silence here. The ${thing} is more than a third of the way round. Land somewhere else.`;
      if (stage.n === 3) return `The ${thing} is in reach. Follow the needle.`;
      if (stage.n === 2) {
        if (stage.next === 'goal') return 'Go back to orbit. The globe marks the cell. Land on it.';
        if (stage.next === 'near') return `Go back to orbit. Land ${stage.cells === 1 ? '1 cell' : `${stage.cells} cells`} out, on the bearing ${bearing(stage.brg)}.`;
        return 'Go back to orbit. Land to one side of the strip.';
      }
      return 'The probe hears it. Go back to orbit and land again, far to one side.';
    }
    const n = ch.fixes.length;
    if (n === 0) return `Land the probe anywhere to listen for the ${ch.id === 'wreck' ? 'beacon' : 'signal'}.`;
    if (n === 1) return 'One wedge on the globe. Land again, far to one side of it.';
    return 'The wedges cross. Land where they meet.';
  };
  // After the end of the story the reader can read the card of each chapter again, from anywhere.
  const logLabel = {
    wreck: 'Read the log of the wreck',
    ruin: world.ruin && world.ruin.log ? 'Read the log at the ruin' : 'Read the card of the ruin',
    way: world.twin && world.twin.log ? 'Read the log at the twin' : 'Read the card of the twin',
  };
  const actions = (ch) => {
    const a = [];
    if (ch.state === 'done') a.push({ id: 'aim', label: `Find the ${ch.id === 'way' ? 'twin' : ch.id} on the globe`, chapter: ch.id, orbitOnly: true });
    if (ch.state === 'done' && view.complete) a.push({ id: 'log', label: logLabel[ch.id], chapter: ch.id });
    if (ch.state === 'open' && ch.kind === 'search' && ch.fixes.length) a.push({ id: 'clear', label: 'Clear the wedges' });
    if (ch.state === 'open' && ch.kind === 'search') a.push({ id: 'brief', label: 'How the search works' });
    if (ch.id === 'wreck' && view.row && view.row.lost) a.push({ id: 'lost', label: 'Read the incident record' });
    return a;
  };

  const chapters = [{
    id: 'wreck', n: 1, title: 'The distress signal', state: wr.state,
    goal: wr.state === 'done' ? `The wreck of the ${log.probe} is found.` : `Find where the signal of the ${log.probe} comes from.`,
    status: wr.state === 'done' ? 'Found. The log is read.' : wr.fixes.length ? `${fixes(wr.fixes.length)} on the globe` : 'Not heard yet',
    band: `${WRECK_FREQ} MHz`, fixes: wr.fixes, actions: actions(wr),
  }];
  const tuneRuin = !!(ru && ru.state === 'open' && view.tuner && view.tuner.id === 'ruin' && !view.tuner.held);
  if (ru) {
    chapters.push({
      id: 'ruin', n: 2, title: 'The second signal', state: ru.state,
      goal: 'Find what sends on the band the log ends on.',
      status: ru.state === 'done' ? 'Found. The ruin is read.' : !ru.held ? 'The receiver is not tuned'
        : ru.fixes.length ? `${fixes(ru.fixes.length)} on the globe` : 'Tuned. Not heard yet',
      band: ru.held ? `${world.ruin.freq} MHz` : '—.— MHz',
      fixes: ru.fixes, actions: ru.held || ru.state !== 'open' ? actions(ru) : [],
    });
  }
  if (way) {
    chapters.push({
      id: 'way', n: 3, title: 'The way on', state: way.state,
      goal: 'Read the name on the ruin, and send it.',
      status: (view.way && view.way.text) || '', band: null, fixes: [], actions: actions(way),
    });
  }
  // A closed chapter tells nothing of itself.
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if (ch.state !== 'closed') { ch.locked = false; continue; }
    chapters[i] = {
      id: ch.id, n: ch.n, state: 'closed', locked: true, title: 'Locked',
      goal: `Opens when chapter ${ch.n - 1} ends.`, status: '', band: null, fixes: [], actions: [],
    };
  }

  // The objective: the first chapter that is open, or the end of the story.
  const roll = view.complete && world.twin ? rollCall(world, { home: !!(view.way && view.way.home) }) : null;
  const names = (list) => (list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
  const open = chapters.find((ch) => ch.state === 'open');
  const of = chapters.length;
  const kicker = (n) => `Chapter ${n} of ${of}`;
  let objective;
  if (open && open.id === 'wreck') {
    objective = { kicker: kicker(1), title: 'The distress signal', line: searchLine(wr, 'source of the signal'), chapter: 'wreck' };
  } else if (open && open.id === 'ruin') {
    objective = tuneRuin
      ? { kicker: kicker(2), title: 'The second signal', line: 'The log ends on a frequency. Tune the receiver to it.', chapter: 'ruin', tune: true }
      : { kicker: kicker(2), title: 'The second signal', line: searchLine(ru, 'source'), chapter: 'ruin' };
  } else if (open && open.id === 'way') {
    objective = { kicker: kicker(3), title: 'The way on', line: 'Land at the ruin. Read the name on it, and send it.', chapter: 'way' };
  } else if (view.way && view.way.state === 'done' && !view.complete) {
    objective = { kicker: kicker(3), title: 'At the twin', line: 'Open the card of the twin, and read what waits there.', chapter: 'way' };
  } else if (view.way) {
    // The read of the card of the twin ends the story. A person who lived waits to go home.
    const waits = roll.people.filter((p) => p.status === 'alive').map((p) => p.name);
    objective = view.way.home
      ? { kicker: 'Story complete', title: 'The crew is home', line: 'Every chapter of this world is done. Share it with a friend, or find another world.' }
      : waits.length
        ? { kicker: 'Story complete', title: 'Somebody waits', line: `${names(waits)} ${waits.length === 1 ? 'waits' : 'wait'} at the twin. Take the crew home.`, chapter: 'way' }
        : { kicker: 'Story complete', title: roll.title, line: `${roll.end} Read every log again in the Story window.`, chapter: 'way' };
  } else {
    objective = { kicker: 'Story complete', title: ru ? 'The ruin is found' : 'The wreck is found', line: 'Read the log again any time.', chapter: ru ? 'ruin' : 'wreck' };
  }
  const done = chapters.filter((ch) => ch.state === 'done').length;
  return { has: true, intro, chapters, objective, done, of, complete: !!view.complete, roll };
}
