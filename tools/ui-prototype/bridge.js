// PROTOTYPE — the bridge between a concept and the real app in the iframe. It holds data and
// actions, and no layout: each concept renders all of its own UI. See NOTES.md.
import { marksOf } from '../../chapters.js';

const STORE_KEY = 'myworlds.v1';
const WORDS = ['Aurora', 'Pebble', 'Nimbus', 'Tadas', 'Juniper', 'Comet', 'Marble', 'Saffron', 'Willow', 'Quasar', 'Pumpkin', 'Zephyr', 'Lumen', 'Basil', 'Orchid', 'Tundra', 'Kepler', 'Mango', 'Fjord', 'Nova'];
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export const numWord = (n) => (n < 20 ? NUM[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + NUM[n % 10] : '') : String(n));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The cards and the dialogs of the app take the size and the type of the windows of the concepts:
// almost the whole screen, a serif for names and prose, and a mono for labels. The arrows of the card
// go, because they would step to a creature the reader has not found yet.
const CARDS = `
  #creature { padding: 16px !important; background: rgba(4, 6, 16, .62) !important;
    backdrop-filter: blur(12px) saturate(1.1) !important; -webkit-backdrop-filter: blur(12px) saturate(1.1) !important; }
  #creature .cnav { display: none !important; }
  #creature .ccard { border-radius: 28px; border: 1px solid rgba(140, 200, 255, .16);
    background: linear-gradient(180deg, #11162d, #0a0d1d) !important; box-shadow: 0 40px 120px rgba(0, 0, 0, .6); }
  #creature .cclose { top: 16px; right: 16px; width: 44px; height: 44px; border-radius: 14px; font-size: 22px;
    background: rgba(10, 14, 30, .7); z-index: 3; }
  #creature .cname { font-family: Fraunces, Georgia, serif; font-weight: 400; letter-spacing: -.01em; }

  /* a creature and a plant: the preview is the left half, the text the right */
  #creature:is([data-subject="animal"], [data-subject="plant"]) .ccard {
    width: min(1180px, 100%); height: min(820px, calc(100dvh - 32px)); max-height: none; overflow: hidden;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 0; padding: 0; }
  #creature:is([data-subject="animal"], [data-subject="plant"]) .cview { width: 100%; height: 100%; border-radius: 0;
    background: radial-gradient(circle at 50% 58%, rgba(124, 196, 255, .14), rgba(4, 6, 16, .2) 55%, rgba(4, 6, 16, .7)); }
  #creature:is([data-subject="animal"], [data-subject="plant"]) .ctext { overflow: auto; padding: 64px 48px 40px; overscroll-behavior: contain; }
  #creature:is([data-subject="animal"], [data-subject="plant"]) .ctext::before { content: attr(data-kicker); display: block; margin-bottom: 12px;
    font: 10.5px 'IBM Plex Mono', monospace; letter-spacing: .16em; text-transform: uppercase; color: #9fd6ff; }
  #creature:is([data-subject="animal"], [data-subject="plant"]) .cname { font-size: 46px; line-height: 1.04; margin: 0 40px 8px 0; }
  #creature:is([data-subject="animal"], [data-subject="plant"]) .clatin { font-family: Fraunces, Georgia, serif; font-size: 19px; color: #ffb86b; margin: 0 0 28px; }
  #creature:is([data-subject="animal"], [data-subject="plant"]) .ctags { grid-template-columns: 120px minmax(0, 1fr); gap: 0; margin: 0 0 30px;
    border-top: 1px solid rgba(140, 200, 255, .16); font-size: 16px; }
  #creature:is([data-subject="animal"], [data-subject="plant"]) .ctags dt,
  #creature:is([data-subject="animal"], [data-subject="plant"]) .ctags dd { padding: 12px 0; border-bottom: 1px solid rgba(140, 200, 255, .16); }
  #creature:is([data-subject="animal"], [data-subject="plant"]) .ctags dt { font: 10.5px 'IBM Plex Mono', monospace; letter-spacing: .16em; text-transform: uppercase; padding-top: 15px; }
  #creature:is([data-subject="animal"], [data-subject="plant"]) .cstory { font-family: Fraunces, Georgia, serif; font-weight: 300; font-size: 19px; line-height: 1.65; color: #e9e3f2; }
  #creature:is([data-subject="animal"], [data-subject="plant"]) .cstory::first-letter { float: left; font-size: 3.3em; line-height: .86; padding: 6px 10px 0 0; color: #ffb86b; font-weight: 400; }

  /* the log of the wreck and the card of the ruin keep their layout, at the size of the window */
  #creature:is([data-subject="source"], [data-subject="ruin"]) .ccard {
    --side: 340px; width: min(1180px, 100%); height: min(820px, calc(100dvh - 32px)); max-height: none; min-height: 0;
    padding: 44px 12px 0 calc(var(--side) + 72px); }
  #creature:is([data-subject="source"], [data-subject="ruin"]) .cview { left: 36px; top: 36px; border-radius: 20px; }
  #creature[data-subject="source"] .ccrew { left: 36px; top: calc(var(--side) + 56px); font-size: 14px; }
  #creature:is([data-subject="source"], [data-subject="ruin"]) .cname { font-size: 42px; line-height: 1.05; margin: 0 56px 4px 0; }
  #creature:is([data-subject="source"], [data-subject="ruin"]) .clatin { font-family: 'IBM Plex Mono', monospace; font-style: normal; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 18px; }
  #creature .clog-entry p, #creature .crow dd { font-family: Fraunces, Georgia, serif; font-weight: 300; font-size: 17.5px; line-height: 1.7; color: #ece6d8; }
  #creature .clog-entry h3, #creature .crow dt { font-family: 'IBM Plex Mono', monospace; font-weight: 400; letter-spacing: .14em; }
  #creature .crow { grid-template-columns: 120px minmax(0, 1fr); padding: 14px 0; }

  /* the dialogs */
  #about, #carrier-brief, #carrier-lost, #talk, #home { width: min(640px, calc(100vw - 32px)); }
  #carrier-brief { width: min(720px, calc(100vw - 32px)); }
  dialog::backdrop { background: rgba(4, 6, 16, .62) !important; backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important; }
  .about-card { padding: 44px 44px 34px; border-radius: 28px; text-align: left;
    background: linear-gradient(180deg, rgba(17, 22, 45, .97), rgba(10, 13, 29, .97)); border: 1px solid rgba(140, 200, 255, .16); }
  #about .about-card { text-align: center; }
  .about-card h2, #about h2, #carrier-brief h2, #carrier-lost h2, #home h2 { font-family: Fraunces, Georgia, serif; font-weight: 400; font-size: 38px; letter-spacing: -.01em; margin-bottom: 18px; }
  .about-card p, .brief-steps { font-size: 16px; line-height: 1.6; }
  .about-card .cclose { top: 16px; right: 16px; width: 44px; height: 44px; border-radius: 14px; font-size: 22px; }
  .talk-line { font-family: Fraunces, Georgia, serif; font-weight: 300; font-size: 21px; line-height: 1.6; }

  @media (max-width: 720px) {
    #creature { padding: 0 !important; }
    #creature .ccard { border-radius: 0; border: 0; }
    #creature:is([data-subject="animal"], [data-subject="plant"]) .ccard { width: 100%; height: 100dvh; grid-template-columns: minmax(0, 1fr); grid-template-rows: 42dvh minmax(0, 1fr); }
    #creature:is([data-subject="animal"], [data-subject="plant"]) .ctext { padding: 22px 20px 48px; }
    #creature:is([data-subject="animal"], [data-subject="plant"]) .cname { font-size: 32px; margin-right: 0; }
    #creature:is([data-subject="animal"], [data-subject="plant"]) .clatin { font-size: 16px; margin-bottom: 18px; }
    #creature:is([data-subject="animal"], [data-subject="plant"]) .cstory { font-size: 17px; }
    #creature:is([data-subject="source"], [data-subject="ruin"]) .ccard { width: 100%; height: 100dvh; max-height: none; padding: calc(16px + env(safe-area-inset-top)) 6px 0 16px; }
    #creature:is([data-subject="source"], [data-subject="ruin"]) .cview { left: auto; top: auto; height: clamp(110px, 22vh, 190px); border-radius: 16px; }
    #creature[data-subject="source"] .ccrew { left: auto; top: auto; }
    #creature:is([data-subject="source"], [data-subject="ruin"]) .cname { font-size: 30px; margin-right: 52px; }
    #creature .clog-entry p, #creature .crow dd { font-size: 16px; }
    #creature .crow { grid-template-columns: minmax(0, 1fr); }
    #about, #carrier-brief, #carrier-lost, #talk, #home { width: calc(100vw - 16px); }
    .about-card { padding: 34px 22px 24px; }
    .about-card h2, #about h2, #carrier-brief h2, #carrier-lost h2, #home h2 { font-size: 30px; }
  }
`;
const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..500;1,9..144,300..500&family=IBM+Plex+Mono:wght@400;500&display=swap';

// The chrome of the app that every concept replaces. The probe overlay, the cards, the dialogs, the
// loading orb, and the dive stay: they are content, and the brief says the probe view is fine.
const HIDE = `
  #panel, #probe-float, #creature-float, #aim { display: none !important; }
  html.proto-noloader #overlay { visibility: hidden !important; }
  #probe-hud {
    --hud-left: var(--proto-hud-left, 22px) !important;
    --hud-top: var(--proto-hud-top, 22px) !important;
    --hud-bottom: var(--proto-hud-bottom, 22px) !important;
  }
  #probe-hud .hud-frame { right: var(--proto-hud-right, 22px) !important; }
  #probe-hud .hud-bar { right: calc(var(--proto-hud-right, 22px) + 16px) !important; }
  #probe-hud .hud-ladder { right: calc(var(--proto-hud-right, 22px) + 18px) !important; }
` + CARDS;

export const CONTROLS = {
  orbit: [
    ['Drag', 'Spin and tilt the planet', 'One finger'],
    ['Scroll', 'Zoom in and out', 'Pinch'],
    ['Zoom close', 'See the creatures and the clouds move', 'Pinch in'],
  ],
  ground: [
    ['Drag', 'Move over the ground', 'One finger'],
    ['Right-drag', 'Look around', 'Two fingers'],
    ['Scroll', 'Climb and sink', 'Pinch'],
    ['W A S D', 'Fly', null],
    ['← →  ↑ ↓', 'Turn and tilt the view', null],
    ['E / Q', 'Up and down', null],
    ['Tap', 'Mark a creature or a plant, then study it', 'Tap'],
  ],
};

export function makeBridge(frame, { seed, showStart }) {
  let mw = null, doc = null, win = null;
  const subs = new Set();
  const keySubs = new Set();
  let last = '';
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));

  const shots = new Map();
  // The field guide: the creatures and the plants the reader has studied, by world. A creature or a
  // plant is undiscovered until the reader finds it on the planet and opens its card.
  const FOUND_KEY = 'myworlds.proto.found.v1';
  const guide = () => { try { return JSON.parse(localStorage.getItem(FOUND_KEY) || '{}'); } catch { return {}; } };
  const foundOf = (seedNow) => { const g = guide()[seedNow] || {}; return { fauna: g.fauna || [], flora: g.flora || {} }; };
  const fresh = [];   // the finds the concept has not announced yet
  function noteFind() {
    const card = doc.getElementById('creature');
    if (!card || card.hidden) return;
    const subject = card.dataset.subject, kind = +card.dataset.kind;
    if (subject !== 'animal' && subject !== 'plant') return;
    const w = mw.current.world;
    const all = guide();
    const g = all[w.seed] || (all[w.seed] = { fauna: [], flora: {} });
    g.fauna = g.fauna || []; g.flora = g.flora || {};
    if (subject === 'animal' && !g.fauna.includes(kind)) {
      g.fauna.push(kind);
      fresh.push({ type: 'creature', name: w.species[kind].lore.name, n: g.fauna.length, of: (w.faunaKinds || []).length });
    } else if (subject === 'plant' && !(kind in g.flora)) {
      const p = (mw.plants || []).find((x) => x.kind === kind);
      if (!p) return;
      g.flora[kind] = p.lore.name;
      fresh.push({ type: 'plant', name: p.lore.name, n: Object.keys(g.flora).length });
    } else return;
    try { localStorage.setItem(FOUND_KEY, JSON.stringify(all)); } catch { /* prototype */ }
  }
  // The line over the name of the card: what kind of subject, and where it stands in the guide.
  function kickCard() {
    const card = doc.getElementById('creature');
    if (!card || card.hidden) return;
    const text = card.querySelector('.ctext');
    const f = foundOf(mw.current.world.seed);
    const k = card.dataset.subject === 'animal'
      ? `Creature · ${f.fauna.length} of ${(mw.current.world.faunaKinds || []).length} in your field guide`
      : card.dataset.subject === 'plant' ? `Plant · ${Object.keys(f.flora).length} in your field guide` : '';
    if (text && text.dataset.kicker !== k) text.dataset.kicker = k;
  }
  const saved = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; } };
  const first = seed || (saved().length ? saved()[saved().length - 1].seed : 'Auralis');
  frame.src = `../index.html#${encodeURIComponent(first)}`;

  frame.addEventListener('load', () => {
    win = frame.contentWindow; doc = frame.contentDocument;
    const s = doc.createElement('style');
    s.textContent = HIDE;
    doc.head.appendChild(s);
    if (api._loader === false) doc.documentElement.classList.add('proto-noloader');
    const font = doc.createElement('link');
    font.rel = 'stylesheet'; font.href = FONTS;
    doc.head.appendChild(font);
    // The record of the incident speaks before the find, so it names no wreck: nobody knows yet
    // what sends the signal. Prototype only; app.js keeps its own words.
    const lost = doc.querySelector('#carrier-lost .about-card');
    if (lost) {
      lost.querySelectorAll('p').forEach((p) => p.remove());
      lost.insertAdjacentHTML('beforeend', `
        <p>The registry holds one open incident for this world. A carrier called for help from here, and no crew came back. Nobody knows what became of it.</p>
        <p>The beacon still transmits. It is weak, and it reaches about a third of the way round the planet, so most of this world hears nothing at all.</p>
        <p>Send a probe to the surface. A landing inside that reach catches the beacon, and the instrument reads a bearing to it, never a distance. A landing that hears nothing states a fact of its own: the source lies more than a third of the way round from there.</p>
        <p>Each bearing the probe catches stands on the globe as a wedge from the cell it was read from. Land again far to one side, and the second wedge crosses the first over the source.</p>`);
    }
    win.addEventListener('keydown', (e) => keySubs.forEach((f) => f(e)));
    const wait = () => {
      mw = win.__mw;
      if (mw && mw.current) { resolveReady(); tick(); setInterval(tick, 180); return; }
      setTimeout(wait, 60);
    };
    wait();
  });

  // ------------------------------------------------------------ the state, polled
  function state() {
    if (!mw || !mw.current) return { loading: true };
    const w = mw.current.world;
    const overlay = doc.getElementById('overlay');
    const aimEl = doc.getElementById('aim');
    const cf = doc.getElementById('creature-float');
    const pf = doc.getElementById('probe-float');
    const card = doc.getElementById('creature');
    const anyDialog = [...doc.querySelectorAll('dialog')].some((d) => d.open);
    const mode = mw.mode;
    // The button of the app names the marked creature or plant. Before the find it names nothing.
    let ctx = cf && cf.classList.contains('show') ? cf.textContent : '';
    const m = mw.marked, f = foundOf(w.seed);
    if (ctx && m.animal !== null && !f.fauna.includes(m.animal)) ctx = 'Study this creature';
    else if (ctx && m.plant !== null && !(m.plant in f.flora)) ctx = 'Study this plant';
    return {
      loading: false,
      busy: !!(overlay && overlay.classList.contains('show')),
      seed: w.seed,
      type: w.type,
      gas: w.type === 'gas',
      mode,                                   // orbit, descending, ground, ascending
      dive: !!mw.probe.dive,
      aiming: !!(aimEl && !aimEl.hidden),
      ctx,
      found: f.fauna.length + Object.keys(f.flora).length,
      ceiling: !!(pf && pf.classList.contains('show') && mode === 'ground'),
      card: !!(card && !card.hidden),
      dialog: anyDialog,
      plants: mw.plants ? mw.plants.length : 0,
      storyKey: storyKey(),
    };
  }
  function storyKey() {
    const c = mw.carrier;
    if (!c || !c.view) return '';
    const v = c.view;
    return JSON.stringify([v.row, v.chapters.map((ch) => [ch.state, ch.fixes.length, ch.held]), v.tuner, v.way, c.stage && [c.stage.n, c.stage.next, c.stage.cells]]);
  }
  function tick() {
    if (mw && mw.current) { noteFind(); kickCard(); }
    const s = state();
    const k = JSON.stringify(s);
    if (k === last) return;
    last = k;
    subs.forEach((f) => f(s));
  }

  // ------------------------------------------------------------ the world
  function world() {
    const w = mw.current.world, s = w.stats;
    const found = foundOf(w.seed);
    const facts = [
      { k: 'radius', label: 'Radius', value: s.radius },
      { k: 'gravity', label: 'Gravity', value: s.gravity },
      { k: 'day', label: 'Day', value: s.day },
      s.tilt && { k: 'tilt', label: 'Tilt', value: s.tilt },
      { k: 'temp', label: 'Temperature', value: s.temp },
      s.land && { k: 'land', label: 'Land', value: s.land },
      s.activity && { k: 'activity', label: 'Activity', value: s.activity },
      w.star && { k: 'star', label: 'Star', value: w.star.label },
      { k: 'moons', label: 'Moons', value: w.moons.length ? w.moons.map((m) => m.name).join(', ') : 'None' },
    ].filter(Boolean);
    return {
      seed: w.seed, designation: w.designation, typeLabel: w.typeLabel, type: w.type, gas: w.type === 'gas',
      tiltDeg: parseFloat(s.tilt) || 0,
      facts,
      fauna: (w.faunaKinds || []).map((k) => ({ kind: k, name: w.species[k].lore.name, found: found.fauna.includes(k) })),
      flora: (mw.plants || []).map((p) => ({ kind: p.kind, name: p.lore.name, found: p.kind in found.flora })),
      floraKnown: Object.entries(found.flora).map(([kind, name]) => ({ kind: +kind, name })),
      thumb: (saved().find((x) => x.seed === w.seed) || {}).thumb || '',
      palette: w.palette,
    };
  }

  // ------------------------------------------------------------ the story
  // The story of the world on the screen, in the words a concept needs: the record that brought us
  // here, the three chapters with their state and their actions, and the objective with its next step.
  function story() {
    const w = mw.current.world;
    const c = mw.carrier;
    const v = c && c.view;
    const log = w.source && w.source.log;
    if (!v || !log) {
      return {
        has: false,
        objective: w.type === 'gas'
          ? { kicker: 'Gas giant', title: 'A world of storms', line: 'No ground to land on. Zoom in and find what swims in its sky.' }
          : { kicker: 'Uncharted', title: 'First light', line: 'Nobody has been here. Land the probe anywhere and meet the locals.' },
        chapters: [],
      };
    }
    const intro = {
      years: log.years, ship: log.probe, crew: log.crew.length, band: '406.025 MHz',
      text: `${cap(numWord(log.years))} years ago a distress signal reached us from ${w.designation}. It came from the carrier ${log.probe}, with a crew of ${numWord(log.crew.length)} aboard. Nobody came back. You came to find out what happened.`,
    };
    const [wr, ru, way] = v.chapters;
    const stage = mw.mode === 'ground' ? c.stage : null;
    const onGround = mw.mode === 'ground';
    const searchLine = (ch, thing) => {
      if (onGround) {
        if (!stage) return `Silence here. The ${thing} is more than a third of the way round. Land somewhere else.`;
        if (stage.n === 3) return `The ${thing} is in reach. Follow the needle.`;
        if (stage.n === 2) {
          if (stage.next === 'goal') return 'Go back to orbit. The globe marks the cell. Land on it.';
          if (stage.next === 'near') return `Go back to orbit. Land ${stage.cells === 1 ? '1 cell' : stage.cells + ' cells'} out, on the bearing ${String(Math.round(stage.brg) % 360).padStart(3, '0')}°.`;
          return 'Go back to orbit. Land to one side of the strip.';
        }
        return 'The probe hears it. Go back to orbit and land again, far to one side.';
      }
      const n = ch.fixes.length;
      if (n === 0) return `Land the probe anywhere to listen for the ${ch.id === 'wreck' ? 'beacon' : 'signal'}.`;
      if (n === 1) return 'One wedge on the globe. Land again, far to one side of it.';
      return 'The wedges cross. Land where they meet.';
    };
    const actions = (ch) => {
      const a = [];
      if (ch.state === 'done') a.push({ id: 'aim', label: `Find the ${ch.id === 'way' ? 'twin' : ch.id} on the globe`, chapter: ch.id, orbitOnly: true });
      if (ch.state === 'open' && ch.kind === 'search' && ch.fixes.length) a.push({ id: 'clear', label: 'Clear the wedges' });
      if (ch.state === 'open' && ch.kind === 'search') a.push({ id: 'brief', label: 'How the search works' });
      if (ch.id === 'wreck' && v.row && v.row.lost) a.push({ id: 'lost', label: 'Read the incident record' });
      return a;
    };
    const chapters = [];
    chapters.push({
      id: 'wreck', n: 1, title: 'The distress signal', state: wr.state,
      goal: wr.state === 'done' ? `The wreck of the ${log.probe} is found.` : `Find where the signal of the ${log.probe} comes from.`,
      status: wr.state === 'done' ? 'Found. The log is read.' : wr.fixes.length ? `${wr.fixes.length === 1 ? '1 fix' : wr.fixes.length + ' fixes'} on the globe` : 'Not heard yet',
      fixes: wr.fixes, actions: actions(wr), band: '406.025 MHz',
    });
    if (ru) {
      const tuner = v.tuner && v.tuner.id === 'ruin' ? v.tuner : null;
      chapters.push({
        id: 'ruin', n: 2, title: 'The second signal', state: ru.state,
        goal: ru.state === 'closed' ? 'Find the wreck first.' : 'Find what sends on the band the log ends on.',
        status: ru.state === 'closed' ? 'Locked' : ru.state === 'done' ? 'Found. The ruin is read.' : !ru.held ? 'The receiver is not tuned' : ru.fixes.length ? `${ru.fixes.length === 1 ? '1 fix' : ru.fixes.length + ' fixes'} on the globe` : 'Tuned. Not heard yet',
        tune: ru.state === 'open' && tuner && !tuner.held,
        band: ru.held ? `${w.ruin.freq} MHz` : '—.— MHz',
        fixes: ru.fixes, actions: ru.held || ru.state !== 'open' ? actions(ru) : [],
      });
    }
    if (way) {
      chapters.push({
        id: 'way', n: 3, title: 'The way on', state: way.state,
        goal: way.state === 'closed' ? 'Find the ruin first.' : 'Read the name on the ruin, and send it.',
        status: way.state === 'closed' ? 'Locked' : (v.way && v.way.text) || '',
        fixes: [], actions: actions(way),
      });
    }
    // A closed chapter tells nothing of itself: no title, no goal, no band. The reader learns of the
    // ruin when the log of the wreck names it, not from a list of chapters.
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      if (ch.state !== 'closed') continue;
      chapters[i] = { id: ch.id, n: ch.n, state: 'closed', locked: true, title: 'Locked',
        goal: `Opens when chapter ${ch.n - 1} ends.`, status: '', band: null, fixes: [], actions: [] };
    }
    // the objective: the first chapter that is not done
    const open = chapters.find((ch) => ch.state === 'open');
    let objective;
    if (open && open.id === 'wreck') objective = { kicker: 'Chapter 1 of ' + chapters.length, title: 'The distress signal', line: searchLine(wr, 'source of the signal'), chapter: 'wreck' };
    else if (open && open.id === 'ruin') objective = open.tune
      ? { kicker: 'Chapter 2 of ' + chapters.length, title: 'The second signal', line: 'The log ends on a frequency. Tune the receiver to it.', chapter: 'ruin', tune: true }
      : { kicker: 'Chapter 2 of ' + chapters.length, title: 'The second signal', line: searchLine(ru, 'source'), chapter: 'ruin' };
    else if (open && open.id === 'way') objective = { kicker: 'Chapter 3 of 3', title: 'The way on', line: 'Land at the ruin. Read the name on it, and send it.', chapter: 'way' };
    else if (v.way && v.way.home) objective = { kicker: 'Mission complete', title: 'The crew is home', line: 'Every chapter of this world is done. Find another world.' };
    else if (v.way && v.way.state === 'done') objective = { kicker: 'Chapter 3 of 3', title: 'At the twin', line: v.way.crew ? 'Somebody waits at the twin. Take the crew home.' : 'Read the third log at the twin.', chapter: 'way' };
    else objective = { kicker: 'Found', title: 'The wreck is found', line: 'Read the log again any time.', chapter: 'wreck' };
    const done = chapters.filter((ch) => ch.state === 'done').length;
    return { has: true, intro, chapters, objective, done, of: chapters.length, pulse: !!(stage && stage.pulse) };
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ------------------------------------------------------------ the saved worlds
  function worlds() {
    const marks = marksOf();
    return saved().slice().reverse().map((w) => {
      const m = marks.get(w.seed);
      return { seed: w.seed, typeLabel: w.typeLabel || w.type, type: w.type, designation: w.designation, thumb: w.thumb, ts: w.ts,
        finds: m ? m.finds : 0, home: !!(m && m.home), marks: m ? m.text : '', active: mw && mw.current && mw.current.world.seed === w.seed };
    });
  }

  // ------------------------------------------------------------ the actions
  const click = (sel) => { const el = doc && doc.querySelector(sel); if (el) el.click(); return !!el; };
  const api = {
    ready,
    showStart,
    get mw() { return mw; },
    get doc() { return doc; },
    seed: () => (mw && mw.current ? mw.current.world.seed : first),
    state, world, story, worlds,
    takeFinds: () => fresh.splice(0, fresh.length),
    subscribe(f) { subs.add(f); if (mw) f(state()); return () => subs.delete(f); },
    onFrameKey(f) { keySubs.add(f); },
    refresh() { last = ''; tick(); },
    go(name) { name = String(name || '').trim(); if (!name || !mw) return false; mw.generate(name); return true; },
    randomName: () => WORDS[Math.floor(Math.random() * WORDS.length)] + '-' + Math.floor(Math.random() * 900 + 100),
    forget(name) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(saved().filter((w) => w.seed !== name))); } catch { /* prototype */ }
    },
    // the probe: one button of the app sends, cancels the aim, and recalls
    probe() { click('#probe'); setTimeout(api.refresh, 30); },
    aim() { if (mw.mode === 'orbit' && !state().aiming) api.probe(); },
    cancelAim() { if (state().aiming) api.probe(); },
    recall() { if (mw.mode === 'ground') api.probe(); },
    study() { click('#creature-float'); },
    brief() { mw.briefCarrier(); },
    lost() { const d = doc.getElementById('carrier-lost'); if (d && !d.open) d.showModal(); },
    about() { const d = doc.getElementById('about'); if (d && !d.open) d.showModal(); },
    clear() { click('#info-body .carrier-clear'); setTimeout(api.refresh, 30); },
    aimAt(id) {
      const v = mw.carrier.view;
      const ch = v && v.chapters.find((c) => c.id === id);
      if (ch && mw.mode === 'orbit') mw.aimAtSource(ch.source);
    },
    // the tuner of the sidebar, driven from outside: the same rules and the same words as the app
    tune(text) {
      const t = mw.tuners.side;
      t.field.value = text;
      t.el.querySelector('form').dispatchEvent(new win.Event('submit', { cancelable: true }));
      setTimeout(api.refresh, 30);
      return { kind: t.answer.dataset.kind || '', text: t.answer.textContent };
    },
    inspect(kind) { mw.inspect(kind); },
    inspectPlant(kind) { mw.inspectPlant(kind); },
    music: {
      get on() { return mw ? !mw.music.settings.muted : false; },
      // on, but the browser has not let the sound start yet
      get stalled() { return !!mw && !mw.music.settings.muted && !!mw.music.ctx && mw.music.ctx.state !== 'running'; },
      start() { mw.music.setMuted(false); mw.music.unlock(); },
      get vol() { return mw ? mw.music.settings.vol : 0.5; },
      toggle() { mw.music.setMuted(!mw.music.settings.muted); },
      set(v) { mw.music.setVolume(v); },
    },
    shareUrl: () => `https://codeme.lt/myworlds/#${encodeURIComponent(api.seed())}`,
    async share() {
      try { await navigator.clipboard.writeText(api.shareUrl()); return true; } catch { return false; }
    },
    // A picture of the globe as the reader sees it, bigger than the thumb of the list, taken from
    // the distance the thumb takes. In orbit only; elsewhere the last picture of this world, or the thumb.
    snapshot(size = 520) {
      const seedNow = api.seed();
      if (mw && mw.mode === 'orbit' && !state().busy) {
        try {
          // The camera steps back until the whole globe and its air fit the short side of the
          // canvas, so a portrait phone gets the whole planet too. Then the crop is the globe.
          const cam = mw.camera, keep = cam.position.clone();
          const src = mw.renderer.domElement;
          const f = (src.height / 2) / Math.tan((cam.fov * Math.PI) / 360);
          const rMax = Math.min(src.width, src.height) / 2.4;
          const d = Math.max(3.42, Math.sqrt((f / rMax) ** 2 + 1));
          cam.position.setLength(d); cam.updateMatrixWorld();
          mw.renderer.render(mw.scene, cam);
          const c = document.createElement('canvas');
          c.width = c.height = size;
          const sq = Math.min(Math.min(src.width, src.height), 2.4 * f / Math.sqrt(d * d - 1));
          c.getContext('2d').drawImage(src, (src.width - sq) / 2, (src.height - sq) / 2, sq, sq, 0, 0, size, size);
          cam.position.copy(keep); cam.updateMatrixWorld();
          shots.set(seedNow, c.toDataURL('image/jpeg', 0.85));
        } catch { /* prototype: fall back to the thumb */ }
      }
      return shots.get(seedNow) || world().thumb;
    },
    // the loading card of the app hides while a start screen stands over it
    loader(on) { if (doc) doc.documentElement.classList.toggle('proto-noloader', !on); else api._loader = on; },
    // the overlay of the probe makes room for the chrome of a concept
    hudInsets({ top = 22, bottom = 22, left = 22, right = 22 } = {}) {
      if (!doc) return;
      const r = doc.documentElement.style;
      r.setProperty('--proto-hud-top', `${top}px`);
      r.setProperty('--proto-hud-bottom', `${bottom}px`);
      r.setProperty('--proto-hud-left', `${left}px`);
      r.setProperty('--proto-hud-right', `${right}px`);
    },
    // the radius of the globe on the screen, in CSS px, and its centre: for annotations in orbit
    globe() {
      if (!mw || mw.mode !== 'orbit') return null;
      const cam = mw.camera;
      const d = cam.position.length();
      const R = 1.0;
      if (d <= R) return null;
      const h = frame.clientHeight;
      const f = (h / 2) / Math.tan((cam.fov * Math.PI) / 360);
      const ang = Math.asin(R / d);
      return { x: frame.clientWidth / 2, y: h / 2, r: f * Math.tan(ang), dist: d };
    },
  };
  return api;
}
