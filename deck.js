// myworlds — the interface over the planet: the title, the dock, the window, and the chrome.
//
// The dock is the only navigation. Its four tabs open one window that fills the screen above the
// dock, and the probe is the raised button in its middle: Send probe in orbit, Cancel while the
// reader aims, Recall probe on the ground, and Close while the window stands open. See docs/ui.md.
//
// One layer shows at a time, from the top:
//
//   app       the study card or a dialog of app.js
//   window    Worlds, Story, Planet, or Menu
//   title     the start screen
//   arrival   the distress signal of a new world, or the welcome back
//   none      the planet: the world chip, the objective, the study chip, the sound, and the dock
//
// A card opened from the window hides the window, and the window comes back when the card closes.
//
// The page calls sync() on every frame. It reads a few cheap values of the app and renders only
// when one of them changes. The story changes only on an event of the progress, and the page then
// calls touch(). The markup of the shell stands in index.html, under #ui.
//
//   makeDeck(app, { title })   the interface; `app` is the handle app.js gives, see below
//
// `app` holds what the interface reads: world, mode, dive, busy, aiming, card, modal, study, view,
// stage, plants, guide, tuner, and music. It holds what the interface does: generate(), random(),
// worlds(), forget(), probe(), aim(), stopAim(), openStudy(), inspect(), inspectPlant(), brief(),
// lost(), about(), clear(), aimAt(), shareUrl(), snapshot(), and hold().
import { icon, fillIcons, wave } from './icons.js';
import { storyOf } from './story.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// "An" before a vowel sound: a vowel, or a letter of a star class that reads with one, as "an M3".
const an = (word) => (/^[aeiou]/i.test(word) || /^[AEFHILMNORSX]\d/.test(word) ? 'An' : 'A');
const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const PAGES = { worlds: 'Your worlds', story: 'Story', planet: 'Planet', menu: 'Menu' };
// The glow of the globe on the Planet page, by world type.
const HALO = {
  terran: 'rgba(110,190,255,.5)', ocean: 'rgba(80,160,255,.55)', desert: 'rgba(255,190,110,.5)', ice: 'rgba(200,235,255,.55)',
  lava: 'rgba(255,110,70,.6)', gas: 'rgba(255,200,140,.45)', exotic: 'rgba(200,120,255,.55)',
};
// The controls, by place: the key or the gesture, what it does, and the touch that does the same.
const CONTROLS = {
  orbit: [
    ['Drag', 'Spin and tilt the planet', 'One finger'],
    ['Scroll', 'Zoom in and out', 'Pinch'],
    ['Click a creature', 'Study it, when you zoom in close', 'Tap'],
  ],
  ground: [
    ['Drag', 'Move over the ground', 'One finger, or hold'],
    ['Right-drag', 'Look around', 'Two fingers: slide'],
    ['Scroll', 'Climb and sink', 'Two fingers: pinch'],
    ['W A S D', 'Fly level', null],
    ['Space, E / C, Q', 'Up / down', null],
    ['Shift', 'Run', null],
    ['Arrows, R F', 'Turn and tilt the view', 'Two fingers: twist'],
    ['Click', 'Mark a creature or a plant, then study it', 'Tap'],
  ],
  any: [
    ['/', 'Find a world by name', null],
    ['Esc', 'Close the window or the card', null],
  ],
};
// The wave of the distress signal. See wave() in icons.js.
const WAVE = `<div class="wave">${wave('#ffb86b')}</div>`;
const thumb = (src) => (src ? `<img alt="" src="${src}">` : '<span class="ph"></span>');
const fixLine = (x, i) => `Landing ${i + 1} · ${String(Math.round(x.brg) % 360).padStart(3, '0')}° ±${Math.round(x.err)}° · `
  + `${Math.abs(x.lat).toFixed(1)}${x.lat < 0 ? 'S' : 'N'} ${Math.abs(x.lon).toFixed(1)}${x.lon < 0 ? 'W' : 'E'}`;

export function makeDeck(app, { title = false } = {}) {
  const root = document.getElementById('ui');
  fillIcons(root);
  const $ = (s) => root.querySelector(s);
  const el = {
    world: $('.world-chip'), objective: $('.objective'), aim: $('.aim-bar'), goal: $('.ground-goal'), study: $('.study-chip'),
    sound: $('.sound'), arrival: $('.arrival'), window: $('.window'), head: $('.book-head'), page: $('.page'),
    dock: $('.dock'), probe: $('.probe-btn'), toast: $('.toast'), title: $('.title'),
  };
  const show = (e, on) => e.classList.toggle('gone', !on);

  let page = null;             // the page of the window: worlds, story, planet, menu, or null
  let titleOn = title;
  let arrival = false;         // the arrival card stands
  let arrivedSeed = null;      // the world the last arrival was for
  let pending = null;          // a name the reader asked for while a world still builds
  let rev = 0;                 // touch() counts the changes of the story
  let key = '';
  let lastLayer = '';
  let stale = false;           // a render of the page waited for the reader to leave a field
  let lockedAt = 0;            // the tuner of the Story page locked then, and shows its answer a moment
  let seenStory = '';          // the story the Story page last showed
  let seenFound = -1;          // the size of the field guide the Planet page last showed
  let nudgeUntil = 0;          // the probe button pulses fast until then
  let heroShot = null;         // the picture of the globe the Planet page opened with
  const finds = [];            // the finds the toast has not announced yet

  // ------------------------------------------------------------ the state
  const ready = () => !!app.world && !app.busy;
  const moving = () => app.dive || app.mode === 'descending' || app.mode === 'ascending';
  function layer() {
    if (app.card || app.modal) return 'app';
    if (page) return 'window';
    if (titleOn) return 'title';
    if (arrival) return 'arrival';
    return 'none';
  }
  const story = () => (app.world ? storyOf(app.world, app.view, { mode: app.mode, stage: app.stage }) : null);
  // The story as the Story tab knows it: a change lights the badge until the reader opens the page.
  const storyKey = (st) => (st && st.has ? JSON.stringify([st.objective, st.chapters.map((c) => [c.state, c.status])]) : '');
  const guideSize = () => { const g = app.guide; return g.fauna.length + g.flora.length; };
  const typing = () => el.page.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';

  // ------------------------------------------------------------ the title
  function renderTitle() {
    const ws = app.worlds().slice(0, 4);
    const on = app.music.on;
    el.title.innerHTML = `
      <div class="col">
        <div class="brand">✦ <span>My Worlds</span></div>
        <h1>Every name hides <em>a planet.</em></h1>
        <p class="lede">Type a name and a world answers: its star, its seas, its creatures, its song. The same name always finds the same world.</p>
        ${nameForm('Your name, or any word')}
        ${ws.length ? `<div class="recent"><span class="kick">Continue exploring</span><div class="row">${ws.map((w) => `
          <button type="button" class="world-pill" data-act="world:${esc(w.seed)}">${w.thumb ? `<img alt="" src="${w.thumb}">` : '<span class="ph"></span>'}${esc(w.seed)}${w.marks ? `<i>${esc(w.marks)}</i>` : ''}</button>`).join('')}</div></div>` : ''}
        <div class="steps">
          <div class="step"><span class="n">${icon('star', 18)}</span><b>Name it</b><span>Any word is a seed. Or roll the dice.</span></div>
          <div class="step"><span class="n">${icon('paw', 18)}</span><b>Meet it</b><span>Zoom in close to watch its creatures.</span></div>
          <div class="step"><span class="n">${icon('down', 18)}</span><b>Land on it</b><span>Follow a signal, or just wander.</span></div>
        </div>
        <div class="links">
          <button type="button" data-act="window:menu">${icon('pad', 18)}Controls</button>
          <button type="button" data-act="about">${icon('info', 18)}About</button>
          <button type="button" data-act="sound">${icon(on ? 'sound' : 'mute', 18)}Sound ${on ? 'on' : 'off'}</button>
        </div>
      </div>`;
  }
  const nameForm = (hint) => `
    <form class="name-form" data-form="go">
      <label class="name-field"><input name="seed" maxlength="40" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="${hint}" aria-label="A name">
        <button type="button" class="icon-btn" data-act="dice" title="Roll a random world" aria-label="Roll a random world">${icon('dice', 20)}</button></label>
      <button type="submit" class="go-btn"><span class="t">Find it</span>${icon('arrow', 20, 2.2)}</button>
    </form>`;

  // ------------------------------------------------------------ the pages of the window
  function pagePlanet() {
    const w = app.world, s = w.stats, g = app.guide;
    const ground = app.mode === 'ground';
    const shot = heroShot && heroShot.seed === w.seed ? heroShot.src : (app.worlds().find((x) => x.seed === w.seed) || {}).thumb;
    const facts = [
      ['radius', 'Radius', s.radius], ['gravity', 'Gravity', s.gravity], ['day', 'Day', s.day], s.tilt && ['tilt', 'Tilt', s.tilt],
      ['temp', 'Temperature', s.temp], s.land && ['land', 'Land', s.land], s.activity && ['activity', 'Activity', s.activity],
      w.star && ['star', 'Star', w.star.label], ['moons', 'Moons', w.moons.length ? w.moons.map((m) => m.name).join(', ') : 'None'],
    ].filter(Boolean);
    const gas = w.type === 'gas';
    const kind = `${w.typeLabel.toLowerCase().replace(/ world$/, '')} world`;
    const star = w.star ? String(w.star.label) : '';
    const sun = !star ? '' : /^binary/i.test(star) ? ', under two suns' : `, under ${an(star).toLowerCase()} ${star.split(',')[0]}`;
    const lede = gas
      ? `A gas giant ${s.radius} in radius. It has no ground: the clouds thicken into storms all the way down. A day lasts ${s.day}.`
      : `${an(kind)} ${kind} ${s.radius} in radius. A day lasts ${s.day}, and the air holds ${s.temp} on average${sun}.`;
    // The creatures: the species the globe shows, and any other species of this world the reader
    // found on the ground. A creature is locked until the reader studies it.
    const kinds = [...new Set([...(w.faunaKinds || []), ...g.fauna.filter((k) => w.species[k])])];
    const known = kinds.filter((k) => g.fauna.includes(k)).length;
    const lock = (what, hint) => `<button type="button" class="card lock" data-act="hint:${what}">${icon(what === 'plant' ? 'leaf' : 'paw', 24)}<b>Undiscovered</b><span>${hint}</span></button>`;
    const plants = app.plants;
    const plantsHere = !ground ? '' : plants.map((p) => g.flora.includes(p.lore.name)
      ? `<button type="button" class="card plant" data-act="plant:${p.kind}">${icon('leaf', 24)}<b>${esc(p.lore.name)}</b><span>Plant here · study ${icon('arrow', 13, 2)}</span></button>`
      : lock('plant', 'Tap it on the ground to study it')).join('')
      || `<div class="card plant plain">${icon('leaf', 24)}<b>Nothing grows here</b><span>Land on another cell to find plants</span></div>`;
    const plantsKnown = ground ? '' : g.flora.map((name) => `<div class="card plant plain">${icon('leaf', 24)}<b>${esc(name)}</b><span>Found on a landing · study it on the ground</span></div>`).join('');
    const herePlants = plants.filter((p) => g.flora.includes(p.lore.name)).length;
    const count = `${known} of ${kinds.length} creatures${ground && plants.length ? ` · ${herePlants} of ${plants.length} plants here` : !ground && g.flora.length ? ` · ${g.flora.length} plants` : ''}`;
    const life = `
      <h2 class="h" id="life">Field guide <span class="kick">${count}</span></h2>
      <div class="meter"><div class="bar"><i style="width:${kinds.length ? Math.round((known / kinds.length) * 100) : 0}%"></i></div>
        <span>${known === kinds.length && known ? 'Every creature of this world is in your guide.' : 'Find a creature on the planet and study it, and it joins your guide.'}</span></div>
      <p class="note">No story needed. Zoom in close from orbit and tap a creature, or land the probe and tap what moves and what grows around it.</p>
      <div class="life">
        ${kinds.map((k) => g.fauna.includes(k)
          ? `<button type="button" class="card" data-act="fauna:${k}">${icon('paw', 24)}<b>${esc(w.species[k].lore.name)}</b><span>Creature · study ${icon('arrow', 13, 2)}</span></button>`
          : lock('creature', ground ? 'Find it here, or zoom in from orbit' : 'Zoom in close and tap it')).join('') || '<div class="card plain"><span>No creatures live here.</span></div>'}
        ${plantsHere}${plantsKnown}
        ${!ground && !gas ? `<button type="button" class="card plant" data-act="land">${icon('down', 24)}<b>${g.flora.length ? 'More plants' : 'The plants'}</b><span>They live on the ground. Land the probe to meet them ${icon('arrow', 13, 2)}</span></button>` : ''}
      </div>`;
    seenFound = guideSize();
    return `
      <header class="hero">
        <div class="globe-orb" style="--halo:${HALO[w.type] || HALO.terran}">${thumb(shot)}</div>
        <div><span class="kick">${esc(w.designation)} · ${esc(w.typeLabel)}</span>
          <h1 id="book-title">${esc(w.seed)}</h1>
          <p class="lede">${esc(lede)}</p>
          <button type="button" class="pill" data-act="share">${icon('share', 15)}Copy a link to ${esc(w.seed)}</button></div>
      </header>
      ${ground ? life : ''}
      <h2 class="h">At a glance</h2>
      <div class="specs">${facts.map(([k, label, value]) => `<div class="spec ${['star', 'moons', 'activity'].includes(k) ? 'wide' : ''}"><span class="kick">${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</div>
      ${ground ? '' : life}`;
  }

  function pageStory() {
    const st = story(), w = app.world;
    seenStory = storyKey(st);
    const wander = `<div class="wander">${icon('paw', 22)}<div><p>The story can wait. Every creature of ${esc(w.seed)} is on the Planet page, and the probe can land anywhere just to look around.</p>
      <button type="button" class="pill" data-act="window:planet:life">Meet the creatures ${icon('arrow', 14, 2)}</button></div></div>`;
    if (!st.has) {
      return `<span class="kick">Story</span><h1 id="book-title">${esc(st.objective.title)}</h1><p class="sub">${esc(st.objective.kicker)} · ${esc(w.designation)}</p>
        <div class="cols"><div>
          <p class="prose">${esc(w.type === 'gas'
            ? 'A world of gas and storm. No signal reaches us from here, and there is no ground to land on. Watch it turn, and look for what swims in its sky.'
            : 'No signal reaches us from this world, and no record names it. Nobody has walked here before. This one has no mystery to solve: send the probe down and see what lives here.')}</p>
        </div><div>${wander}</div></div>`;
    }
    const o = st.objective;
    const cur = st.chapters.find((c) => c.id === o.chapter) || {};
    let cta = '';
    if (o.tune) cta = '<div class="tune-slot"></div>';
    else if (cur.state === 'open' && app.mode === 'orbit') cta = `<button type="button" class="btn primary big" data-act="land">${icon('down', 18, 2.2)}Send the probe</button>`;
    else if (app.mode === 'ground') cta = `<button type="button" class="btn big" data-act="close">${icon('target', 18)}Back to the probe</button>`;
    const entries = st.chapters.map((c) => (c.locked ? `
      <div class="entry closed"><div class="num">${ROMAN[c.n]}</div><div><h3>${icon('lock', 16)} Locked</h3><p>${esc(c.goal)}</p></div></div>` : `
      <div class="entry ${c.state}"><div class="num">${ROMAN[c.n]}</div><div>
        <h3>${esc(c.title)} <span class="tag ${c.state}">${c.state === 'done' ? 'Done' : 'Now'}</span></h3>
        <p>${esc(c.goal)}</p>
        <div class="st mono"><span>${esc(c.status)}</span>${c.band ? `<span>${esc(c.band)}</span>` : ''}</div>
        ${c.fixes.length ? `<div class="fixes mono">${c.fixes.map((x, i) => `<span>${fixLine(x, i)}</span>`).join('')}</div>` : ''}
        ${c.actions.length ? `<div class="acts">${c.actions.filter((a) => !(a.orbitOnly && app.mode !== 'orbit')).map((a) => `<button type="button" class="pill ${a.id === 'aim' ? 'warm' : ''}" data-act="${a.id}${a.chapter ? ':' + a.chapter : ''}">${esc(a.label)}</button>`).join('')}</div>` : ''}
      </div></div>`)).join('');
    return `<span class="kick">Story · ${st.done} of ${st.of} chapters</span><h1 id="book-title">The signal from <em>${esc(w.seed)}</em></h1><p class="sub">${esc(w.designation)} · ${esc(w.typeLabel)}</p>
      <div class="cols">
        <div>
          <div class="transmission"><span class="kick"><i></i>Received ${esc(st.intro.years)} years ago · ${esc(st.intro.band)}</span>${WAVE}
            <p class="prose">${esc(st.intro.text)}</p>
            <div class="meta mono"><span>CARRIER ${esc(st.intro.ship)}</span><span>CREW ${esc(st.intro.crew)}</span></div></div>
          <div class="now"><span class="kick">${esc(o.kicker)}</span><h3>${esc(o.title)}</h3><p>${esc(o.line)}</p>${cta}</div>
          ${wander}
        </div>
        <div><h2 class="h first">Chapters</h2>${entries}</div>
      </div>`;
  }

  function pageWorlds() {
    const ws = app.worlds();
    return `<div class="worlds-head"><div><span class="kick">${ws.length} ${ws.length === 1 ? 'world' : 'worlds'} charted</span><h1 id="book-title">Your worlds</h1></div>
        ${nameForm('A new name…')}</div>
      <div class="worlds-grid">${ws.map((w) => `
        <div class="world-card ${w.active ? 'on' : ''}" role="button" tabindex="0" data-act="world:${esc(w.seed)}">
          ${thumb(w.thumb)}<b>${esc(w.seed)}</b><span>${esc(w.typeLabel)}</span>${w.marks ? `<i title="${esc(w.title)}">${esc(w.marks)}</i>` : ''}${w.active ? '<span class="here">HERE</span>' : ''}
          <button type="button" class="del" data-act="forget:${esc(w.seed)}" title="Forget this world" aria-label="Forget ${esc(w.seed)}">${icon('close', 12)}</button>
        </div>`).join('') || '<p class="note">No worlds yet. Type a name above.</p>'}</div>`;
  }

  function pageMenu() {
    const m = app.music;
    const row = ([k, does, touch]) => `<tr><td><kbd>${esc(k)}</kbd>${touch ? `<span class="t">${esc(touch)}</span>` : ''}</td><td>${esc(does)}</td></tr>`;
    return `<span class="kick">Settings</span><h1 id="book-title">Menu</h1><p class="sub">Sound, and how to explore</p>
      <div class="menu">
        <div>
          <h2 class="h first">Sound</h2>
          <div class="setting"><span>The music of each world</span><button type="button" class="btn" data-act="sound">${icon(m.on ? 'sound' : 'mute', 16)}${m.on ? 'On' : 'Off'}</button></div>
          <input class="range" type="range" min="0" max="100" value="${Math.round(m.vol * 100)}" data-input="vol" aria-label="Volume" ${m.on ? '' : 'disabled'}>
          <h2 class="h">More</h2>
          <div class="acts">
            <button type="button" class="btn" data-act="about">${icon('info', 16)}About My Worlds</button>
            ${titleOn ? '' : `<button type="button" class="btn" data-act="title">${icon('star', 16)}Title screen</button>`}
          </div>
        </div>
        <div>
          <h2 class="h first">In orbit</h2><table class="keys">${CONTROLS.orbit.map(row).join('')}</table>
          <h2 class="h">On the ground</h2><table class="keys">${CONTROLS.ground.map(row).join('')}</table>
          <h2 class="h">Anywhere</h2><table class="keys">${CONTROLS.any.map(row).join('')}</table>
        </div>
      </div>`;
  }

  function renderPage(anchor) {
    if (!page) return;
    if (typing()) { stale = true; return; }
    // A lock in the tuner of the Story page shows its answer for a moment before the page moves on.
    if (el.page.contains(app.tuner.el) && app.tuner.tuned) {
      if (!lockedAt) { lockedAt = performance.now(); setTimeout(() => renderPage(), 1800); }
      if (performance.now() - lockedAt < 1750) return;
    }
    lockedAt = 0;
    stale = false;
    const w = ready() && !titleOn ? app.world : null;
    el.head.innerHTML = `<div class="where">${w ? `${thumb((app.worlds().find((x) => x.seed === w.seed) || {}).thumb)}<span><b>${esc(w.seed)}</b> · ${esc(PAGES[page])}</span>` : `<span><b>My Worlds</b> · ${esc(PAGES[page])}</span>`}</div>
      <button type="button" class="close-btn" data-act="close" aria-label="Close">${icon('close', 18)}</button>`;
    const same = el.window.dataset.page === page;
    const top = same ? el.page.scrollTop : 0;
    // The Worlds and the Menu pages need no world; the Planet and the Story pages wait for one.
    const needs = page === 'planet' || page === 'story';
    el.page.innerHTML = needs && !w ? '' : page === 'planet' ? pagePlanet() : page === 'story' ? pageStory() : page === 'worlds' ? pageWorlds() : pageMenu();
    // The tuner of tuner.js stands in the Now panel of the Story page while the band waits for it.
    const slot = el.page.querySelector('.tune-slot');
    if (slot) { slot.appendChild(app.tuner.el); app.tuner.el.hidden = false; }
    el.window.dataset.page = page;
    el.page.scrollTop = top;
    if (anchor) { const a = el.page.querySelector(`#${anchor}`); if (a) el.page.scrollTop = a.offsetTop - 16; }
  }

  function openPage(next, anchor) {
    if (next === page && !anchor) { page = null; render(); return; }
    page = next;
    arrival = false;
    app.stopAim();
    if (next === 'planet' && ready() && !titleOn) heroShot = { seed: app.world.seed, src: app.snapshot() };
    renderPage(anchor);
    render();
    const x = el.head.querySelector('.close-btn');
    if (x) x.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ the arrival
  function renderArrival() {
    const st = story(), w = app.world;
    const wander = `<p class="alt">${icon('paw', 16)}<span>Or just explore: zoom in to watch the creatures, and land the probe to walk among them.</span></p>`;
    let h, unfold = false;
    if (st.has && st.done === 0 && st.chapters[0].fixes.length === 0) {
      unfold = true;
      h = `<div class="kick"><i></i>Incoming · ${esc(st.intro.years)} years old · ${esc(st.intro.band)}</div>
        <h2>A distress signal from ${esc(w.designation)}</h2>
        ${WAVE}
        <p>${esc(st.intro.text)}</p>${wander}
        <div class="acts"><button type="button" class="btn primary" data-act="arrive-signal">${icon('signal', 16)}Follow the signal</button><button type="button" class="btn" data-act="arrive-close">Just explore</button></div>`;
    } else if (st.has) {
      h = `<div class="kick blue">Welcome back · ${st.done} of ${st.of} chapters</div>
        <h2>${esc(w.seed)}</h2><p><b>${esc(st.objective.title)}.</b> ${esc(st.objective.line)}</p>
        <div class="acts"><button type="button" class="btn primary" data-act="arrive-close">Continue</button><button type="button" class="btn" data-act="window:story">Open the story</button></div>`;
    } else {
      h = `<div class="kick blue">${esc(st.objective.kicker)} · ${esc(w.designation)}</div>
        <h2>${esc(w.seed)} · ${esc(w.typeLabel)}</h2><p>${esc(w.type === 'gas'
          ? 'No signal reaches us from here, and there is no ground. Zoom in to find what swims in its sky.'
          : 'No signal reaches us from here, and nobody has walked here. Zoom in to meet the creatures, and land the probe anywhere to look around.')}</p>
        <div class="acts"><button type="button" class="btn primary" data-act="arrive-close">Explore</button><button type="button" class="btn" data-act="window:planet:life">Meet the creatures</button></div>`;
    }
    el.arrival.innerHTML = h;
    el.arrival.classList.toggle('unfold', unfold);
    arrival = true;
  }

  // ------------------------------------------------------------ the frame
  function render() {
    const ok = ready();
    // The arrival belongs to the orbit: a landing from a link or a script closes it.
    if (arrival && app.mode !== 'orbit') arrival = false;
    const L = layer();
    const ground = app.mode === 'ground';
    const gas = !!app.world && app.world.type === 'gas';
    if (L !== 'none') show(el.toast, false);
    // The window holds the controls of the ground while it stands open, so the keys scroll the page.
    if ((L === 'window') !== (lastLayer === 'window')) app.hold(L === 'window');
    lastLayer = L;
    el.title.hidden = L !== 'title';
    document.documentElement.classList.toggle('titled', titleOn);
    el.window.hidden = L !== 'window';
    el.window.classList.toggle('solo', titleOn);
    el.arrival.hidden = L !== 'arrival';
    const base = L === 'none' && ok && !moving();
    show(el.dock, ok && !moving() && (base || (L === 'window' && !titleOn)));
    el.dock.classList.toggle('open', L === 'window');

    // The probe button: one place, five jobs.
    const p = el.probe;
    p.className = 'probe-btn';
    let lbl = 'Send probe', ic = 'down';
    if (L === 'window') { p.classList.add('shut'); lbl = 'Close'; ic = 'close'; }
    else if (gas) { p.classList.add('off'); lbl = 'No surface'; ic = 'lock'; }
    else if (app.aiming) { p.classList.add('aim'); lbl = 'Cancel'; ic = 'close'; }
    else if (ground) { p.classList.add('recall'); lbl = 'Recall probe'; ic = 'up'; }
    if (performance.now() < nudgeUntil && L !== 'window') p.classList.add('nudge');
    p.querySelector('.lbl').textContent = lbl;
    p.querySelector('.orb').innerHTML = icon(ic, 30, 2.2);
    p.setAttribute('aria-label', lbl === 'Send probe' ? 'Send the probe to the surface' : lbl === 'Recall probe' ? 'Recall the probe' : lbl);
    for (const t of root.querySelectorAll('.tab')) {
      const on = L === 'window' && t.dataset.act === `window:${page}`;
      t.classList.toggle('on', on);
      t.setAttribute('aria-pressed', String(on));
    }

    // The badges: a change of the story, and a new find in the field guide.
    const st = ok ? story() : null;
    badge('story', !!(st && st.has && storyKey(st) !== seenStory && page !== 'story'));
    if (ok && seenFound < 0) seenFound = guideSize();
    badge('planet', ok && seenFound >= 0 && guideSize() > seenFound && page !== 'planet');

    // The sound of the world, on the planet itself. It asks once, until the reader first uses it.
    const m = app.music;
    const on = ok && m.on && !m.stalled;
    el.sound.className = `sound glass ${on ? 'on' : m.asked ? 'off' : 'invite'}${base ? '' : ' gone'}`;
    el.sound.title = on ? 'Music on · click to silence' : 'Turn on the music of this world';
    const sndKey = `${on}|${m.asked}`;
    if (el.sound.dataset.k !== sndKey) {
      el.sound.dataset.k = sndKey;
      el.sound.innerHTML = `<button type="button" data-act="sound" aria-label="${on ? 'Silence the music' : 'Play the music'}">${on
        ? '<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' : m.asked ? icon('mute', 20) : `${icon('sound', 20)}<span class="t">Turn on the music</span>`}</button>${on
        ? `<input type="range" min="0" max="100" value="${Math.round(m.vol * 100)}" data-input="vol" aria-label="Volume">` : ''}`;
    }

    // The chrome of the planet.
    if (st && base) {
      const o = st.objective;
      const bar = st.has ? `<span class="bar">${st.chapters.map((c) => `<i class="${c.state === 'done' ? 'on' : c.state === 'open' ? 'open' : ''}"></i>`).join('')}</span>` : '';
      el.objective.innerHTML = `<span class="dot">${icon(st.has ? 'signal' : gas ? 'wave' : 'paw', 18)}</span><span><span class="kick">${esc(o.kicker)}</span><b>${esc(o.title)}</b><span class="line">${esc(o.line)}</span>${bar}</span>`;
      el.goal.innerHTML = `${icon('signal', 16)}<span>${esc(o.line)} <span class="more">Story ›</span></span>`;
      const w = app.world;
      el.world.innerHTML = `${thumb((app.worlds().find((x) => x.seed === w.seed) || {}).thumb)}<span class="name"><b>${esc(w.seed)}</b><span>${esc(w.typeLabel)} · ${esc(w.designation)}</span></span>`;
    }
    show(el.world, base && !ground && !app.aiming);
    show(el.objective, base && !ground && !app.aiming);
    show(el.goal, base && ground && !!(st && st.has));
    show(el.aim, base && app.aiming);
    if (app.study) el.study.innerHTML = `${icon('target', 18, 2)}<span>${esc(app.study)}</span>${icon('arrow', 16, 2.2)}`;
    show(el.study, base && ground && !!app.study);

    // The probe overlay makes room for the chrome: under the sound button at the top, and over the
    // dock, the objective, and the study chip at the foot. style.css reads the two values.
    const phone = innerWidth <= 760;
    const over = (!el.goal.classList.contains('gone') ? el.goal.offsetHeight + 10 : 0) + (!el.study.classList.contains('gone') ? 54 : 0);
    const r = document.documentElement.style;
    r.setProperty('--ui-top', `${phone ? 62 : 76}px`);
    r.setProperty('--ui-bottom', `${(phone ? 78 : 106) + 30 + over}px`);
  }
  function badge(tab, on) {
    const t = root.querySelector(`.tab[data-act="window:${tab}"]`);
    const b = t.querySelector('.badge');
    if (on && !b) t.insertAdjacentHTML('beforeend', '<i class="badge" aria-hidden="true"></i>');
    if (!on && b) b.remove();
  }

  // ------------------------------------------------------------ input
  // The dice writes a random name, letter by letter, and then finds the world.
  function scramble(input, target, done) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let i = 0;
    const n = 14;
    const t = setInterval(() => {
      i++;
      const k = Math.floor((i / n) * target.length);
      input.value = target.slice(0, k) + Array.from({ length: target.length - k }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      if (i >= n) { clearInterval(t); input.value = target; setTimeout(done, 250); }
    }, 38);
  }
  function go(name) {
    name = String(name || '').trim();
    if (!name) return;
    page = null; arrival = false; titleOn = false;
    arrivedSeed = null;
    if (app.world && app.world.seed === name && !app.busy) { render(); arriveSoon(); return; }
    if (app.busy) pending = name; else app.generate(name);
    render();
  }
  function toast(text, ms = 2200) {
    el.toast.textContent = text;
    show(el.toast, true);
    clearTimeout(toast.t);
    toast.t = setTimeout(() => show(el.toast, false), ms);
  }
  function land() {
    page = null; arrival = false;
    render();
    if (app.mode === 'orbit' && app.world && app.world.type !== 'gas' && !app.aiming) app.aim();
  }
  function soundPress() {
    const m = app.music;
    if (m.stalled) m.start(); else m.toggle();
    setTimeout(() => { if (titleOn) renderTitle(); renderPage(); render(); }, 30);
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    const [act, arg, sub] = t.dataset.act.split(':');
    const rest = t.dataset.act.slice(act.length + 1);
    if (act === 'forget') { e.stopPropagation(); app.forget(rest); renderPage(); return; }
    if (act === 'window') { openPage(arg, sub); return; }
    if (act === 'close') page = null;
    else if (act === 'probe') {
      if (page) page = null;
      else if (!app.world || app.world.type === 'gas' || moving()) return;
      else app.probe();
    } else if (act === 'land') land();
    else if (act === 'cancel-aim') app.stopAim();
    else if (act === 'study') app.openStudy();
    else if (act === 'dice') {
      const input = t.closest('form').querySelector('input');
      t.classList.add('spin'); setTimeout(() => t.classList.remove('spin'), 500);
      scramble(input, app.random(), () => go(input.value));
      return;
    } else if (act === 'world') { if (e.target.closest('.del')) return; go(rest); return; }
    else if (act === 'fauna') app.inspect(+arg);
    else if (act === 'plant') app.inspectPlant(+arg);
    else if (act === 'brief') app.brief();
    else if (act === 'lost') app.lost();
    else if (act === 'about') app.about();
    else if (act === 'clear') app.clear();
    else if (act === 'aim') { page = null; render(); app.aimAt(arg); }
    else if (act === 'share') {
      const url = app.shareUrl();
      navigator.clipboard.writeText(url).then(() => toast('Link copied'), () => toast(url, 6000));
    } else if (act === 'sound') { soundPress(); return; }
    else if (act === 'hint') {
      toast(arg === 'plant' ? 'Plants live on the ground: land, tap one, and study it.'
        : 'Find it on the planet: zoom in close and tap it, or land and tap it on the ground.', 3200);
    } else if (act === 'title') { page = null; titleOn = true; renderTitle(); }
    else if (act === 'arrive-signal') { arrival = false; nudgeUntil = performance.now() + 4000; setTimeout(render, 4100); }
    else if (act === 'arrive-close') arrival = false;
    render();
  });
  root.addEventListener('keydown', (e) => {
    // A world card is a div with a role, so Enter and Space open it as they open a button.
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('world-card')) { e.preventDefault(); e.target.click(); }
  });
  root.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.dataset.form !== 'go') return;
    e.preventDefault();
    const input = f.querySelector('input');
    input.blur();
    go(input.value);
  });
  root.addEventListener('input', (e) => { if (e.target.dataset.input === 'vol') app.music.set(e.target.value / 100); });
  addEventListener('resize', render);

  // The arrival waits a moment, so the reader sees the planet first.
  function arriveSoon() {
    const seed = app.world && app.world.seed;
    arrivedSeed = seed;
    setTimeout(() => {
      if (!app.world || app.world.seed !== seed || app.busy || titleOn || page || app.mode !== 'orbit') return;
      renderArrival();
      render();
    }, 700);
  }

  if (titleOn) renderTitle();
  render();

  return {
    // Every frame. Cheap: one short key, and a render only when it changes.
    sync() {
      if (pending && !app.busy) { const n = pending; pending = null; app.generate(n); }
      if (ready() && !titleOn && app.world.seed !== arrivedSeed) arriveSoon();
      const m = app.music;
      const k = [app.world && app.world.seed, app.mode, app.dive, app.busy, app.aiming, app.card, app.modal, app.study, rev, m.on, m.stalled, m.asked].join('|');
      if (stale && !typing()) renderPage();
      if (k !== key) {
        const wasApp = key && key.split('|')[5] + key.split('|')[6] !== 'falsefalse';
        key = k;
        if (page && !(app.card || app.modal)) renderPage();
        render();
        // A find is announced when its card closes, so the toast never stands on the card.
        if (wasApp && !app.card && !app.modal && finds.length) {
          const all = finds.splice(0), f = all[all.length - 1];
          toast(f.type === 'creature' ? `✦ New in your field guide: ${f.name} · ${f.n} of ${f.of} creatures` : `✦ New in your field guide: ${f.name}`, 3200);
        }
      }
    },
    // The story or the guide changed: render the window and the chrome again.
    touch() { rev++; },
    // A new find of the field guide: `{ type, name, n, of }`.
    found(f) { finds.push(f); rev++; },
    // Escape: the window closes, then the arrival. Gives true when it closed one.
    escape() {
      if (page) { page = null; render(); return true; }
      if (arrival) { arrival = false; render(); return true; }
      return false;
    },
    // The slash key: the Worlds page, with the focus in the field of a new name.
    findWorld() {
      if (page !== 'worlds') openPage('worlds');
      const input = el.page.querySelector('.name-form input');
      if (input) input.focus();
    },
  };
}
