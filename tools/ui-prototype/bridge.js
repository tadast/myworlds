// PROTOTYPE — the bridge between a concept and the real app in the iframe. It holds data and
// actions, and no layout: each concept renders all of its own UI. See NOTES.md.
import { marksOf } from '../../chapters.js';

const STORE_KEY = 'myworlds.v1';
const WORDS = ['Aurora', 'Pebble', 'Nimbus', 'Tadas', 'Juniper', 'Comet', 'Marble', 'Saffron', 'Willow', 'Quasar', 'Pumpkin', 'Zephyr', 'Lumen', 'Basil', 'Orchid', 'Tundra', 'Kepler', 'Mango', 'Fjord', 'Nova'];
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export const numWord = (n) => (n < 20 ? NUM[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + NUM[n % 10] : '') : String(n));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
`;

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

  const saved = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; } };
  const first = seed || (saved().length ? saved()[saved().length - 1].seed : 'Auralis');
  frame.src = `../index.html#${encodeURIComponent(first)}`;

  frame.addEventListener('load', () => {
    win = frame.contentWindow; doc = frame.contentDocument;
    const s = doc.createElement('style');
    s.textContent = HIDE;
    doc.head.appendChild(s);
    if (api._loader === false) doc.documentElement.classList.add('proto-noloader');
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
    return {
      loading: false,
      busy: !!(overlay && overlay.classList.contains('show')),
      seed: w.seed,
      type: w.type,
      gas: w.type === 'gas',
      mode,                                   // orbit, descending, ground, ascending
      dive: !!mw.probe.dive,
      aiming: !!(aimEl && !aimEl.hidden),
      ctx: cf && cf.classList.contains('show') ? cf.textContent : '',
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
    const s = state();
    const k = JSON.stringify(s);
    if (k === last) return;
    last = k;
    subs.forEach((f) => f(s));
  }

  // ------------------------------------------------------------ the world
  function world() {
    const w = mw.current.world, s = w.stats;
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
      fauna: (w.faunaKinds || []).map((k) => ({ kind: k, name: w.species[k].lore.name })),
      flora: (mw.plants || []).map((p) => ({ kind: p.kind, name: p.lore.name })),
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
      text: `${cap(numWord(log.years))} years ago a distress signal reached us from ${w.designation}. The carrier ${log.probe} went down here with a crew of ${numWord(log.crew.length)}. Nobody came back. You came to find out what happened.`,
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
      if (n === 0) return `Land the probe anywhere to listen for the ${thing === 'wreck' ? 'beacon' : 'signal'}.`;
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
      goal: `Find the wreck of the ${log.probe}.`,
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
    // the objective: the first chapter that is not done
    const open = chapters.find((ch) => ch.state === 'open');
    let objective;
    if (open && open.id === 'wreck') objective = { kicker: 'Chapter 1 of ' + chapters.length, title: 'The distress signal', line: searchLine(wr, 'wreck'), chapter: 'wreck' };
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
      get vol() { return mw ? mw.music.settings.vol : 0.5; },
      toggle() { mw.music.setMuted(!mw.music.settings.muted); },
      set(v) { mw.music.setVolume(v); },
    },
    shareUrl: () => `https://codeme.lt/myworlds/#${encodeURIComponent(api.seed())}`,
    async share() {
      try { await navigator.clipboard.writeText(api.shareUrl()); return true; } catch { return false; }
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
