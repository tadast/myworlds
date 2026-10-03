// PROTOTYPE — concept A, "Flight deck", round 2. The dock is the only navigation. Its four tabs open
// one window, almost the whole screen, and the probe is the raised button in the middle of the dock.
// One layer shows at a time: the title, the arrival, the window, or a card of the app. See NOTES.md.
import { icon } from './icons.js';
import { esc, CONTROLS } from './bridge.js';

export const meta = {
  name: 'Flight deck',
  map: `
  <h3>A — Flight deck (round 2)</h3>
  <p>A game HUD. One dock holds everything, and the probe is the big raised button in its middle. The four tabs open one window that fills the screen above the dock; the tabs stay, so they switch pages, and the middle button closes the window.</p>
  <h4>Topology</h4>
  <pre>Title ──name / dice / continue──▶ Distress signal ──▶ Planet
                                                       │
   dock:  [Worlds] [Story] (● PROBE) [Planet] [Menu]
              └───────┴───────┬─────────┴───────┘
                     one window, four pages
                     the middle button: ✕ close
   in orbit: ● Send probe ▸ aim ▸ land     on the ground: ● Recall</pre>
  <h4>Layers — one at a time</h4>
  <ol>
    <li>A card or a dialog of the app (study, brief, log, about)</li>
    <li>The window (Worlds, Story, Planet, Menu)</li>
    <li>The title screen</li>
    <li>The arrival: the distress signal, or welcome back</li>
    <li>The planet: world chip, objective, study chip, dock</li>
  </ol>
  <p>A card opened from the window hides the window, and the window comes back when the card closes.</p>
  <h4>Story without spoilers</h4>
  <p>A locked chapter shows only "Locked". The page always offers the other way to play: meet the creatures, land and look.</p>`,
};

const CSS = `
.A { position: absolute; inset: 0; font-family: Fredoka, ui-rounded, system-ui, sans-serif; color: #eef1ff;
  --glass: rgba(10, 14, 30, 0.74); --line: rgba(140, 200, 255, 0.16); --muted: #9aa3c7; --accent: #7cc4ff;
  --warm: #ffb86b; --warm2: #ff7d54; --mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace; --serif: Fraunces, Georgia, serif;
  --dock-h: 74px; --dock-b: 18px; --safe-b: env(safe-area-inset-bottom); --safe-t: env(safe-area-inset-top); }
.A * { box-sizing: border-box; }
.A [hidden] { display: none !important; }
.A button { font: inherit; color: inherit; }
.A .pe { pointer-events: auto; }
.A .glass { background: var(--glass); border: 1px solid var(--line); backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2); }
.A .fade { transition: opacity .3s ease, transform .3s ease; }
.A .gone { opacity: 0 !important; pointer-events: none !important; }
.A .mono { font-family: var(--mono); letter-spacing: .02em; }
.A .kick { font-family: var(--mono); font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
.A .serif { font-family: var(--serif); }
@keyframes a-spin { to { transform: rotate(360deg); } }
@keyframes a-blink { 50% { opacity: .2; } }
@keyframes a-wave { to { transform: translateX(-50%); } }

/* ---------- title */
.a-title { position: absolute; inset: 0; pointer-events: auto; display: flex; align-items: center;
  background: linear-gradient(100deg, rgba(7,10,22,.96) 0%, rgba(7,10,22,.88) 30%, rgba(7,10,22,.35) 55%, rgba(7,10,22,0) 72%); }
.a-title .col { width: min(580px, 100%); padding: 48px 56px; display: flex; flex-direction: column; gap: 18px; }
.a-title .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; color: var(--warm); font-size: 15px; }
.a-title h1 { margin: 0; font-size: clamp(38px, 5.4vw, 64px); line-height: 1.02; font-weight: 600; letter-spacing: -.01em; }
.a-title h1 em { font-style: normal; background: linear-gradient(90deg, #9fd6ff, #ffb86b); -webkit-background-clip: text; background-clip: text; color: transparent; }
.a-title p.lede { margin: 0; color: #c5cbe6; font-size: 17px; line-height: 1.45; max-width: 460px; }
.a-form { display: flex; gap: 8px; align-items: stretch; }
.a-field { flex: 1; display: flex; align-items: center; min-width: 0; border-radius: 16px; padding: 0 6px 0 16px; height: 56px;
  background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16); transition: border-color .2s, box-shadow .2s; }
.a-field:focus-within { border-color: var(--accent); box-shadow: 0 0 0 4px rgba(124,196,255,.15); }
.a-field input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; color: #fff; font: 500 19px Fredoka, sans-serif; }
.a-field input::placeholder { color: #7d86ab; }
.a-icobtn { width: 44px; height: 44px; border-radius: 12px; border: 0; background: rgba(255,255,255,.08); display: grid; place-items: center; cursor: pointer; flex: none; }
.a-icobtn:hover { background: rgba(255,255,255,.16); }
.a-icobtn.spin .ico { animation: a-spin .5s ease; }
.a-go { height: 56px; padding: 0 22px; border-radius: 16px; border: 0; cursor: pointer; font-weight: 600; font-size: 17px; color: #1b1205 !important;
  background: linear-gradient(180deg, #ffd39a, var(--warm)); display: flex; align-items: center; gap: 8px; box-shadow: 0 8px 30px rgba(255,184,107,.28); white-space: nowrap; }
.a-go:hover { filter: brightness(1.06); }
.a-recent .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.a-wchip { display: flex; align-items: center; gap: 8px; padding: 5px 12px 5px 5px; border-radius: 999px; cursor: pointer;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); font-size: 14px; }
.a-wchip:hover { border-color: var(--accent); }
.a-wchip img { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: #111a33; }
.a-wchip i { font-style: normal; color: var(--warm); font-size: 11px; }
.a-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.a-step { padding: 12px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07); }
.a-step b { display: block; font-weight: 500; font-size: 14px; margin: 6px 0 2px; }
.a-step span { color: var(--muted); font-size: 12.5px; line-height: 1.35; }
.a-step .n { color: var(--accent); }
.a-links { display: flex; gap: 18px; color: var(--muted); font-size: 14px; flex-wrap: wrap; }
.a-links button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.a-links button:hover { color: #fff; }

/* ---------- the planet: world chip, objective, aim, study chip */
.a-world { position: absolute; left: 16px; top: calc(16px + var(--safe-t)); display: flex; align-items: center; gap: 10px; padding: 6px 16px 6px 6px; border-radius: 999px; cursor: pointer; text-align: left; max-width: calc(100vw - 32px); }
.a-world img, .a-world .ph { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: radial-gradient(circle at 35% 30%, #4b7fd0, #0d1a3a); flex: none; }
.a-world b { display: block; font-weight: 600; font-size: 17px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.a-world span { display: block; font-size: 12px; color: var(--muted); white-space: nowrap; }
.a-obj { position: absolute; right: 78px; top: calc(16px + var(--safe-t)); width: 340px; padding: 12px 14px; border-radius: 18px; cursor: pointer; text-align: left; display: flex; gap: 12px; }
.a-obj .dot { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: none; color: var(--warm); background: rgba(255,184,107,.12); }
.a-obj b { display: block; font-weight: 500; font-size: 15px; margin: 2px 0; }
.a-obj p { margin: 0; color: #c5cbe6; font-size: 13px; line-height: 1.35; }
.a-obj .bar { display: flex; gap: 4px; margin-top: 8px; }
.a-obj .bar i { height: 3px; flex: 1; border-radius: 2px; background: rgba(255,255,255,.12); }
.a-obj .bar i.on { background: var(--warm); }
.a-obj .bar i.open { background: linear-gradient(90deg, var(--warm) 40%, rgba(255,255,255,.12) 40%); }
.a-aim { position: absolute; left: 50%; top: calc(18px + var(--safe-t)); transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 16px; border-radius: 999px; white-space: nowrap; }
.a-aim .ico { color: var(--accent); animation: a-spin 4s linear infinite; }
.a-aim button { border: 0; border-radius: 999px; padding: 8px 14px; background: rgba(255,255,255,.1); cursor: pointer; }
.a-stack { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--dock-b) + var(--safe-b) + var(--dock-h) + 34px); width: min(560px, calc(100vw - 24px));
  display: flex; flex-direction: column-reverse; align-items: center; gap: 10px; pointer-events: none; }
.a-gobj { display: flex; align-items: flex-start; gap: 10px; padding: 9px 16px 9px 12px; border-radius: 18px; font-size: 14px; line-height: 1.4; color: #e2e6f8; cursor: pointer; text-align: left; max-width: 100%; }
.a-gobj .ico { color: var(--warm); flex: none; margin-top: 1px; }
.a-gobj .more { color: var(--muted); font-size: 12px; white-space: nowrap; margin-left: 2px; }
.a-ctx { display: flex; align-items: center; gap: 10px; padding: 10px 18px 10px 12px; border-radius: 999px; border: 0; cursor: pointer; white-space: nowrap;
  background: #f4f7ff; color: #0b1430 !important; font-weight: 600; font-size: 15px; box-shadow: 0 10px 30px rgba(0,0,0,.35); max-width: calc(100vw - 32px); }
.a-ctx .ico { color: #2f6fd0; }
.a-ctx span { overflow: hidden; text-overflow: ellipsis; }
.a-snd { position: absolute; right: 16px; top: calc(16px + var(--safe-t)); height: 48px; min-width: 48px; border-radius: 999px; display: flex; align-items: center; gap: 10px;
  padding: 0 4px; font-size: 14px; color: #dfe4f8; }
.a-snd > button { all: unset; cursor: pointer; height: 100%; display: flex; align-items: center; gap: 10px; padding: 0 10px; border-radius: 999px; }
.a-snd > input { margin-right: 10px; }
.a-snd:hover { border-color: rgba(255,184,107,.5); }
.a-snd .eq { display: flex; align-items: flex-end; gap: 3px; height: 18px; }
.a-snd .eq i { width: 3px; border-radius: 2px; background: var(--warm); animation: a-eq 1s ease-in-out infinite; }
.a-snd .eq i:nth-child(1) { animation-delay: -.2s; } .a-snd .eq i:nth-child(2) { animation-delay: -.6s; }
.a-snd .eq i:nth-child(3) { animation-delay: -.4s; } .a-snd .eq i:nth-child(4) { animation-delay: -.8s; }
@keyframes a-eq { 0%, 100% { height: 4px; } 50% { height: 18px; } }
.a-snd.off { color: var(--muted); }
.a-snd.invite { color: #1b1205; background: linear-gradient(180deg, #ffd39a, var(--warm)); border: 0; font-weight: 600; box-shadow: 0 8px 30px rgba(255,184,107,.3); }
.a-snd.invite .ico { animation: a-tilt 1.6s ease-in-out infinite; }
@keyframes a-tilt { 50% { transform: rotate(-12deg) scale(1.1); } }
.a-snd input { width: 0; opacity: 0; transition: width .25s, opacity .25s; accent-color: var(--warm); }
.a-snd.on:hover input { width: 96px; opacity: 1; }
.a-toast { position: absolute; left: 50%; top: calc(20px + var(--safe-t)); transform: translateX(-50%); padding: 9px 16px; border-radius: 999px; font-size: 14px; z-index: 5; }

/* ---------- the dock */
.a-dock { position: absolute; left: 50%; bottom: calc(var(--dock-b) + var(--safe-b)); transform: translateX(-50%); width: 480px; height: var(--dock-h);
  border-radius: 26px; display: grid; grid-template-columns: 1fr 1fr 112px 1fr 1fr; align-items: center; padding: 0 6px; }
.a-dock.deck { background: rgba(14, 19, 38, .96); }
.a-tab { height: 60px; border: 0; background: none; border-radius: 16px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  color: #b9c0de; font-size: 11.5px; position: relative; }
.a-tab:hover, .a-tab.on { color: #fff; background: rgba(255,255,255,.07); }
.a-tab.on { color: var(--warm); }
.a-tab.on::after { content: ''; position: absolute; bottom: 4px; width: 16px; height: 2px; border-radius: 2px; background: var(--warm); }
.a-tab .badge { position: absolute; top: 8px; right: calc(50% - 18px); width: 8px; height: 8px; border-radius: 50%; background: var(--warm); box-shadow: 0 0 0 3px rgba(10,14,30,.9); }
.a-probe { position: relative; justify-self: center; margin-top: -40px; display: flex; flex-direction: column; align-items: center; gap: 6px; border: 0; background: none; cursor: pointer; }
.a-probe .orb { position: relative; width: 84px; height: 84px; border-radius: 50%; display: grid; place-items: center; color: #2a1405;
  background: radial-gradient(circle at 35% 28%, #ffe2b8, var(--warm) 45%, var(--warm2) 100%);
  box-shadow: 0 0 0 6px rgba(10,14,30,.92), 0 0 0 7px rgba(255,184,107,.45), 0 12px 40px rgba(255,140,80,.45); transition: transform .15s; }
.a-probe:hover .orb { transform: scale(1.04); }
.a-probe:active .orb { transform: scale(.96); }
.a-probe .orb::before { content: ''; position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(255,184,107,.7); animation: a-ping 2.4s ease-out infinite; pointer-events: none; }
@keyframes a-ping { from { transform: scale(1); opacity: .9; } to { transform: scale(1.55); opacity: 0; } }
.a-probe.nudge .orb::before { animation-duration: .9s; border-width: 3px; }
.a-probe .lbl { font-weight: 600; font-size: 12.5px; color: var(--warm); white-space: nowrap; }
.a-probe.aim .orb, .a-probe.shut .orb { background: radial-gradient(circle at 35% 28%, #fff, #dbe9ff 60%, #a9c9f5); color: #10203d; box-shadow: 0 0 0 6px rgba(10,14,30,.92), 0 0 0 7px rgba(255,255,255,.35), 0 12px 40px rgba(0,0,0,.4); }
.a-probe.aim .orb::before { border-color: rgba(124,196,255,.8); }
.a-probe.shut .orb::before { display: none; }
.a-probe.aim .lbl, .a-probe.shut .lbl { color: #dbe9ff; }
.a-probe.recall .orb { background: radial-gradient(circle at 35% 28%, #e6f4ff, #7cc4ff 50%, #3c7fd6); color: #071631; box-shadow: 0 0 0 6px rgba(10,14,30,.92), 0 0 0 7px rgba(124,196,255,.5), 0 12px 40px rgba(80,150,255,.45); }
.a-probe.recall .orb::before { border-color: rgba(124,196,255,.7); }
.a-probe.recall .lbl { color: #9fd6ff; }
.a-probe.off { cursor: default; }
.a-probe.off .orb { background: #2a3150; color: #6e7698; box-shadow: 0 0 0 6px rgba(10,14,30,.92), 0 0 0 7px rgba(255,255,255,.1); }
.a-probe.off .orb::before { display: none; }
.a-probe.off .lbl { color: #6e7698; }
.a-probe.busy .orb::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 2px solid transparent; border-top-color: #fff; animation: a-spin 1s linear infinite; }

/* ---------- the arrival: the signal unfolds */
.a-arrive { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100vw - 24px)); border-radius: 26px; padding: 20px 22px 18px;
  box-shadow: 0 30px 90px rgba(0,0,0,.6); }
.a-arrive.unfold { animation: a-unfold .8s cubic-bezier(.2,.8,.2,1); transform-origin: 50% 0; }
@keyframes a-unfold { from { opacity: 0; transform: translate(-50%, -50%) scaleY(.25); } 60% { opacity: 1; } }
.a-arrive .kick { display: flex; align-items: center; gap: 8px; color: #ffd3a1; }
.a-arrive .kick i { width: 8px; height: 8px; border-radius: 50%; background: var(--warm); animation: a-blink 1s steps(2) infinite; flex: none; }
.a-arrive h2 { margin: 10px 0 10px; font-size: 24px; font-weight: 600; line-height: 1.15; }
.a-arrive p { margin: 0 0 12px; color: #d5daf0; font-size: 15px; line-height: 1.55; }
.a-arrive p.alt { color: var(--muted); font-size: 13.5px; display: flex; gap: 8px; align-items: flex-start; }
.a-arrive p.alt .ico { flex: none; color: #a7e3a0; margin-top: 1px; }
.a-arrive .acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
.a-wv { position: relative; height: 40px; margin: 0 0 14px; border-radius: 12px; overflow: hidden; background: rgba(255,184,107,.07); border: 1px solid rgba(255,184,107,.14); }
.a-wv svg { position: absolute; left: 0; top: 0; height: 100%; width: 200%; animation: a-wave 2.4s linear infinite; }
.a-wv::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(10,14,30,.9), transparent 18%, transparent 82%, rgba(10,14,30,.9)); }

/* ---------- buttons shared by the window and the cards */
.a-btn { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); border-radius: 12px; padding: 10px 14px; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; font-size: 14px; }
.a-btn:hover { border-color: var(--accent); }
.a-btn.primary { background: linear-gradient(180deg, #ffd39a, var(--warm)); color: #1b1205 !important; border: 0; font-weight: 600; }
.a-btn.big { padding: 13px 20px; font-size: 16px; border-radius: 14px; }
.a-chip { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); border-radius: 999px; padding: 7px 12px; cursor: pointer; font-size: 13.5px; display: inline-flex; gap: 6px; align-items: center; }
.a-chip:hover { border-color: var(--accent); }
.a-chip.warm { border-color: rgba(255,184,107,.4); color: var(--warm); }

/* ---------- the window */
.a-deck { position: absolute; inset: 0; pointer-events: auto; background: rgba(4, 6, 16, .62); backdrop-filter: blur(12px) saturate(1.1); -webkit-backdrop-filter: blur(12px) saturate(1.1); animation: a-fadein .3s ease; }
@keyframes a-fadein { from { opacity: 0; } }
.a-book { position: absolute; left: 50%; transform: translateX(-50%); top: calc(16px + var(--safe-t)); bottom: calc(var(--dock-b) + var(--safe-b) + var(--dock-h) + 26px); width: min(1180px, calc(100% - 32px));
  border-radius: 28px; overflow: hidden; display: flex; flex-direction: column; background: linear-gradient(180deg, #11162d, #0a0d1d); border: 1px solid var(--line);
  box-shadow: 0 40px 120px rgba(0,0,0,.6); animation: a-open .4s cubic-bezier(.2,.8,.2,1); }
.a-deck.solo .a-book { bottom: calc(16px + var(--safe-b)); }
@keyframes a-open { from { opacity: 0; transform: translate(-50%, 18px) scale(.985); } }
.a-book::after { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .45; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.25'/%3E%3C/svg%3E"); }
.a-bhead { display: flex; align-items: center; gap: 12px; padding: 16px 16px 0 28px; flex: none; }
.a-bhead .where { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
.a-bhead .where img, .a-bhead .where .ph { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: radial-gradient(circle at 35% 30%, #4b7fd0, #0d1a3a); flex: none; }
.a-bhead .where span { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.a-bhead .where b { color: #eef1ff; font-weight: 500; }
.a-x { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: rgba(255,255,255,.05); cursor: pointer; display: grid; place-items: center; flex: none; }
.a-x:hover { border-color: var(--accent); }
.a-page { flex: 1; overflow: auto; padding: 10px 52px 52px; overscroll-behavior: contain; position: relative; z-index: 1; }
.a-page h1 { margin: 6px 0 4px; font-family: var(--serif); font-weight: 400; font-size: clamp(38px, 4.6vw, 58px); letter-spacing: -.015em; line-height: 1.02; }
.a-page h1 em { font-style: italic; color: var(--warm); }
.a-sub { margin: 0 0 26px; color: var(--muted); font-size: 15px; }
.a-h { font-family: var(--serif); font-style: italic; font-weight: 400; font-size: 26px; margin: 40px 0 14px; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.a-h .kick { font-style: normal; }
.a-note { color: var(--muted); font-size: 14.5px; line-height: 1.5; margin: 0 0 14px; max-width: 640px; }

/* planet page */
.a-hero { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 34px; align-items: center; margin-top: 8px; }
.a-orb { position: relative; width: 210px; height: 210px; border-radius: 50%; flex: none; animation: a-float 7s ease-in-out infinite; }
@keyframes a-float { 50% { transform: translateY(-6px); } }
.a-orb img, .a-orb .ph { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; background: radial-gradient(circle at 35% 30%, #4b7fd0, #0d1a3a);
  box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 0 60px var(--halo, rgba(124,196,255,.4)), inset -18px -22px 40px rgba(0,0,0,.45); }
.a-orb::after { content: ''; position: absolute; inset: -14px; border-radius: 50%; border: 1px dashed rgba(124,196,255,.25); animation: a-spin 60s linear infinite; }
.a-lede { font-family: var(--serif); font-weight: 300; font-size: 19px; line-height: 1.55; color: #dfe3f6; margin: 10px 0 16px; max-width: 620px; }
.a-specs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid var(--line); }
.a-spec { padding: 16px 16px 16px 0; border-bottom: 1px solid var(--line); min-width: 0; }
.a-spec b { display: block; font-family: var(--serif); font-weight: 400; font-size: 26px; line-height: 1.15; margin-top: 4px; }
.a-spec.wide { grid-column: span 2; }
.a-spec.wide b { font-size: 20px; }
.a-life { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.a-card { text-align: left; padding: 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.035); cursor: pointer; display: flex; flex-direction: column; gap: 10px; min-height: 120px; }
.a-card:hover { border-color: rgba(124,196,255,.5); background: rgba(124,196,255,.06); }
.a-card .ico { color: var(--accent); }
.a-card.plant .ico { color: #a7e3a0; }
.a-card b { font-weight: 500; font-size: 15.5px; line-height: 1.25; flex: 1; }
.a-card span { font-size: 12.5px; color: var(--muted); display: flex; align-items: center; gap: 4px; }
.a-card.plain { cursor: default; justify-content: center; }
.a-card.plain:hover { border-color: rgba(255,255,255,.08); background: rgba(255,255,255,.035); }
.a-card.lock { border-style: dashed; border-color: rgba(255,255,255,.14); background: repeating-linear-gradient(135deg, rgba(255,255,255,.02) 0 10px, transparent 10px 20px); }
.a-card.lock .ico { color: #59607e; }
.a-card.lock b { color: #8c93b3; letter-spacing: .06em; }
.a-card.lock:hover { border-color: rgba(255,184,107,.4); background: repeating-linear-gradient(135deg, rgba(255,184,107,.04) 0 10px, transparent 10px 20px); }
.a-card.new { border-color: rgba(255,184,107,.55); box-shadow: 0 0 0 3px rgba(255,184,107,.12); }
.a-meter { display: flex; align-items: center; gap: 12px; margin: -4px 0 16px; }
.a-meter .bar { flex: 0 1 240px; height: 6px; border-radius: 3px; background: rgba(255,255,255,.08); overflow: hidden; }
.a-meter .bar i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--accent), var(--warm)); }
.a-meter span { font-size: 12.5px; color: var(--muted); }

/* story page */
.a-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 46px; align-items: start; }
.a-tx { border-radius: 20px; padding: 18px 20px; background: linear-gradient(135deg, rgba(255,184,107,.1), rgba(255,184,107,.02)); border: 1px solid rgba(255,184,107,.2); }
.a-tx .kick { color: #ffd3a1; display: flex; align-items: center; gap: 8px; }
.a-tx .kick i { width: 7px; height: 7px; border-radius: 50%; background: var(--warm); animation: a-blink 1.4s steps(2) infinite; }
.a-tx .a-wv { margin: 12px 0 14px; }
.a-prose { font-family: var(--serif); font-weight: 300; font-size: 18px; line-height: 1.62; color: #ecdfcc; margin: 0; }
.a-prose::first-letter { float: left; font-size: 3.3em; line-height: .86; padding: 6px 10px 0 0; color: var(--warm); font-weight: 400; }
.a-tx .meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11px; color: #d8b892; margin-top: 12px; }
.a-now { margin-top: 18px; border-radius: 20px; padding: 18px 20px; background: rgba(124,196,255,.06); border: 1px solid rgba(124,196,255,.22); }
.a-now h3 { margin: 6px 0 6px; font-family: var(--serif); font-style: italic; font-weight: 400; font-size: 26px; }
.a-now p { margin: 0 0 14px; color: #d7def5; font-size: 15px; line-height: 1.5; }
.a-wander { margin-top: 18px; display: flex; gap: 14px; align-items: flex-start; padding: 16px 18px; border-radius: 20px; background: rgba(167,227,160,.05); border: 1px solid rgba(167,227,160,.18); }
.a-wander .ico { color: #a7e3a0; flex: none; margin-top: 2px; }
.a-wander p { margin: 0 0 10px; color: #d4e5d2; font-size: 14.5px; line-height: 1.5; }
.a-entry { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 4px 16px; padding: 20px 0; border-top: 1px solid var(--line); }
.a-entry:first-of-type { border-top: 0; padding-top: 6px; }
.a-entry .num { font-family: var(--serif); font-size: 34px; color: var(--muted); line-height: 1; }
.a-entry.open .num { color: var(--warm); }
.a-entry.done .num { color: var(--accent); }
.a-entry.closed { opacity: .55; }
.a-entry h3 { margin: 0 0 4px; font-family: var(--serif); font-style: italic; font-weight: 400; font-size: 24px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.a-entry.closed h3 { font-style: normal; font-family: Fredoka, sans-serif; font-size: 17px; font-weight: 500; color: var(--muted); gap: 8px; }
.a-tag { font-family: var(--mono); font-style: normal; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
.a-tag.open { border-color: rgba(255,184,107,.5); color: var(--warm); }
.a-tag.done { border-color: rgba(124,196,255,.45); color: var(--accent); }
.a-entry p { margin: 0; font-size: 14.5px; line-height: 1.5; color: #cfd5ee; }
.a-entry .st { margin-top: 6px; font-size: 11.5px; color: var(--muted); display: flex; gap: 12px; flex-wrap: wrap; }
.a-entry .fixes { margin-top: 8px; display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; color: var(--muted); }
.a-entry .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.a-tune { display: flex; gap: 6px; max-width: 380px; }
.a-tune input { flex: 1; min-width: 0; height: 44px; border-radius: 12px; border: 1px solid rgba(255,255,255,.16); background: rgba(0,0,0,.25); color: #fff; padding: 0 12px; font: 16px var(--mono); }
.a-tune input:focus { outline: 0; border-color: var(--accent); }
.a-tune-ans { font-size: 13px; color: var(--muted); margin-top: 8px; min-height: 1em; }
.a-tune-ans[data-kind="near"] { color: var(--warm); }
.a-tune-ans[data-kind="lock"] { color: #8ff0b5; }

/* worlds page */
.a-whead { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.a-whead .a-form { width: min(460px, 100%); }
.a-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-top: 26px; }
.a-wcard { position: relative; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); border-radius: 18px; padding: 16px 8px 14px; cursor: pointer; text-align: center; min-width: 0; }
.a-wcard:hover { border-color: rgba(124,196,255,.5); }
.a-wcard.on { border-color: var(--warm); background: rgba(255,184,107,.07); }
.a-wcard img, .a-wcard .ph { width: 84px; height: 84px; border-radius: 50%; object-fit: cover; display: block; margin: 0 auto 10px; background: radial-gradient(circle at 35% 30%, #4b7fd0, #0d1a3a); box-shadow: 0 0 22px rgba(124,196,255,.18); }
.a-wcard b { display: block; font-weight: 500; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.a-wcard span { display: block; font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.a-wcard i { position: absolute; left: 10px; top: 8px; font-style: normal; font-size: 11px; color: var(--warm); }
.a-wcard .here { position: absolute; right: 10px; top: 8px; font-family: var(--mono); font-size: 9px; letter-spacing: .14em; color: var(--warm); }
.a-wcard .del { position: absolute; right: 6px; bottom: 6px; width: 24px; height: 24px; border-radius: 8px; border: 0; background: rgba(0,0,0,.35); color: #aab; cursor: pointer; display: grid; place-items: center; opacity: 0; }
.a-wcard:hover .del { opacity: 1; }

/* menu page */
.a-menu { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: 46px; align-items: start; }
.a-keys { width: 100%; border-collapse: collapse; font-size: 14px; }
.a-keys td { padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,.06); vertical-align: top; }
.a-keys td:first-child { width: 42%; padding-right: 10px; }
.a-keys kbd { font: 11.5px var(--mono); padding: 3px 7px; border-radius: 6px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); }
.a-keys .t { display: block; color: var(--muted); font-size: 11.5px; margin-top: 4px; }
.a-range { width: 100%; accent-color: var(--warm); margin-top: 12px; }
.a-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

/* ---------- phone */
@media (max-width: 760px) {
  .A { --dock-h: 70px; --dock-b: 0px; }
  .a-title { align-items: flex-end; background: linear-gradient(0deg, rgba(7,10,22,.98) 0%, rgba(7,10,22,.92) 52%, rgba(7,10,22,.4) 72%, rgba(7,10,22,0) 86%); }
  .a-title .col { padding: 24px 18px calc(22px + var(--safe-b)); gap: 14px; }
  .a-title h1 { font-size: 38px; }
  .a-title p.lede { font-size: 15.5px; }
  .a-go { padding: 0 16px; }
  .a-go .t { display: none; }
  .a-steps { gap: 6px; }
  .a-step { padding: 9px; }
  .a-step span { display: none; }
  .a-world { top: calc(10px + var(--safe-t)); left: 10px; padding: 4px 14px 4px 4px; max-width: calc(100vw - 84px); }
  .a-snd { right: 10px; top: calc(10px + var(--safe-t)); height: 44px; min-width: 44px; padding: 0 12px; }
  .a-snd.invite .t { display: none; }
  .a-snd input { display: none; }
  .a-world img, .a-world .ph { width: 34px; height: 34px; }
  .a-world b { font-size: 15px; }
  .a-obj { top: calc(62px + var(--safe-t)); left: 10px; right: auto; width: auto; max-width: calc(100vw - 20px); padding: 8px 12px 8px 8px; border-radius: 16px; align-items: center; }
  .a-obj .dot { width: 28px; height: 28px; }
  .a-obj .kick, .a-obj .bar { display: none; }
  .a-obj b { font-size: 13.5px; margin: 0; }
  .a-obj p { font-size: 12px; }
  .a-dock { left: 0; right: 0; width: auto; transform: none; border-radius: 22px 22px 0 0; height: calc(var(--dock-h) + var(--safe-b)); padding-bottom: var(--safe-b); border-bottom: 0; grid-template-columns: 1fr 1fr 96px 1fr 1fr; }
  .a-probe { margin-top: -34px; }
  .a-probe .orb { width: 74px; height: 74px; }
  .a-aim { top: calc(10px + var(--safe-t)); font-size: 14px; }
  .a-arrive { top: auto; bottom: calc(20px + var(--safe-b)); transform: translateX(-50%); max-height: calc(100dvh - 40px); overflow: auto; }
  .a-arrive.unfold { animation: a-unfold2 .8s cubic-bezier(.2,.8,.2,1); transform-origin: 50% 100%; }
  @keyframes a-unfold2 { from { opacity: 0; transform: translateX(-50%) scaleY(.25); } 60% { opacity: 1; } }
  .a-arrive h2 { font-size: 21px; }
  .a-arrive p { font-size: 14.5px; }
  .a-book { left: 0; right: 0; width: auto; transform: none; top: 0; bottom: calc(var(--dock-h) + var(--safe-b) - 1px); border-radius: 0; border: 0; animation: a-open2 .35s cubic-bezier(.2,.8,.2,1); }
  @keyframes a-open2 { from { opacity: 0; transform: translateY(24px); } }
  .a-deck.solo .a-book { bottom: 0; }
  .a-bhead { padding: calc(12px + var(--safe-t)) 12px 0 18px; }
  .a-page { padding: 6px 18px 64px; }
  .a-page h1 { font-size: 38px; }
  .a-h { font-size: 22px; margin-top: 30px; }
  .a-hero { grid-template-columns: 1fr; gap: 18px; justify-items: center; text-align: center; }
  .a-hero .a-lede { font-size: 17px; }
  .a-orb { width: 150px; height: 150px; }
  .a-specs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .a-spec b { font-size: 22px; }
  .a-life { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .a-card { min-height: 108px; }
  .a-cols, .a-menu { grid-template-columns: minmax(0, 1fr); gap: 26px; }
  .a-prose { font-size: 16.5px; }
  .a-entry { grid-template-columns: 38px minmax(0, 1fr); }
  .a-entry .num { font-size: 26px; }
  .a-entry h3 { font-size: 21px; }
  .a-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .a-wcard { padding: 12px 4px 10px; }
  .a-wcard img, .a-wcard .ph { width: 58px; height: 58px; }
  .a-wcard .del { opacity: .7; }
}
@media (max-width: 380px) { .a-steps { display: none; } }
`;

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const an = (word) => (/^[aeiou]/i.test(word) ? 'An' : 'A');
const WAVE = (() => {
  const w = 800, h = 40;
  let d = `M0 ${h / 2}`;
  for (let i = 0; i <= 192; i++) {
    const x = (i / 192) * w;
    const y = h / 2 + Math.sin((i / 8) * Math.PI * 2) * 13 * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)));
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="#ffb86b" stroke-width="1.6"/></svg>`;
})();
const HALO = { terran: 'rgba(110,190,255,.5)', ocean: 'rgba(80,160,255,.55)', desert: 'rgba(255,190,110,.5)', ice: 'rgba(200,235,255,.55)', lava: 'rgba(255,110,70,.6)', gas: 'rgba(255,200,140,.45)', exotic: 'rgba(200,120,255,.55)' };
const PAGES = { worlds: 'Your worlds', story: 'Story', planet: 'Planet', menu: 'Menu' };

export function mount(root, B, { showStart }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  root.innerHTML = `
  <div class="A">
    <button type="button" class="a-world glass pe fade gone" data-act="deck:planet"></button>
    <button type="button" class="a-obj glass pe fade gone" data-act="deck:story"></button>
    <div class="a-aim glass pe fade gone">${icon('cross', 18)}<span>Tap the planet where the probe should land</span><button type="button" data-act="cancel-aim">Cancel</button></div>
    <div class="a-stack">
      <button type="button" class="a-gobj glass pe fade gone" data-act="deck:story"></button>
      <button type="button" class="a-ctx pe fade gone" data-act="study"></button>
    </div>
    <div class="a-snd glass pe fade gone"></div>
    <section class="a-arrive glass pe" hidden></section>
    <section class="a-deck" hidden><div class="a-book" role="dialog" aria-modal="true"><div class="a-bhead"></div><div class="a-page"></div></div></section>
    <nav class="a-dock glass pe fade gone">
      <button type="button" class="a-tab" data-act="deck:worlds">${icon('globe')}<span>Worlds</span></button>
      <button type="button" class="a-tab" data-act="deck:story">${icon('signal')}<span>Story</span></button>
      <button type="button" class="a-probe" data-act="probe"><span class="orb"></span><span class="lbl"></span></button>
      <button type="button" class="a-tab" data-act="deck:planet">${icon('planet')}<span>Planet</span></button>
      <button type="button" class="a-tab" data-act="deck:menu">${icon('menu')}<span>Menu</span></button>
    </nav>
    <div class="a-toast glass fade gone"></div>
    <section class="a-title" hidden></section>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const el = { snd: $('.a-snd'), world: $('.a-world'), obj: $('.a-obj'), aim: $('.a-aim'), gobj: $('.a-gobj'), ctx: $('.a-ctx'), arrive: $('.a-arrive'),
    deck: $('.a-deck'), bhead: $('.a-bhead'), page: $('.a-page'), dock: $('.a-dock'), probe: $('.a-probe'), toast: $('.a-toast'), title: $('.a-title') };
  const show = (e, on) => e.classList.toggle('gone', !on);
  let S = { loading: true };
  let deck = null;               // the page of the window: worlds, story, planet, menu, or null
  let titleOn = showStart;
  let arrival = false;           // the arrival card stands
  let arrivalFor = showStart ? null : 'pending';
  let appWait = 0;               // a card of the app was asked for: the window steps aside until it opens
  let seenStory = '';
  let lastSeed = null;
  let nudgeUntil = 0;
  let heroShot = null;
  let seenFound = -1;            // the size of the field guide the Planet page last showed
  let soundAsked = false;        // the reader has used the sound button once
  try { soundAsked = localStorage.getItem('myworlds.proto.sound') === '1'; } catch { /* prototype */ }           // the picture of the globe the Planet page opened with

  // The one layer that shows. A card or a dialog of the app wins, then the window, the title, and
  // the arrival. The chrome of the planet shows only when none of them does.
  function layer() {
    if (S.card || S.dialog || performance.now() < appWait) return 'app';
    if (deck) return 'deck';
    if (titleOn) return 'title';
    if (arrival) return 'arrival';
    return 'none';
  }
  const askApp = (fn) => { appWait = performance.now() + 700; render(); fn(); setTimeout(render, 720); };
  const thumb = (src) => (src ? `<img alt="" src="${src}">` : '<span class="ph"></span>');

  // ------------------------------------------------------------ title
  function renderTitle() {
    const ws = B.worlds().slice(0, 4);
    el.title.innerHTML = `
      <div class="col">
        <div class="brand">✦ <span>My Worlds</span></div>
        <h1>Every name hides <em>a planet.</em></h1>
        <p class="lede">Type a name and a world answers: its star, its seas, its creatures, its song. The same name always finds the same world.</p>
        <form class="a-form" data-form="go">
          <label class="a-field"><input name="seed" maxlength="40" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="Your name, or any word" aria-label="A name">
            <button type="button" class="a-icobtn" data-act="dice" title="Roll a random world" aria-label="Roll a random world">${icon('dice', 20)}</button></label>
          <button type="submit" class="a-go"><span class="t">Find it</span>${icon('arrow', 20, 2.2)}</button>
        </form>
        ${ws.length ? `<div class="a-recent"><span class="kick">Continue exploring</span><div class="row">${ws.map((w) => `
          <button type="button" class="a-wchip" data-act="world:${esc(w.seed)}">${w.thumb ? `<img alt="" src="${w.thumb}">` : '<img alt="">'}${esc(w.seed)}${w.marks ? `<i>${esc(w.marks)}</i>` : ''}</button>`).join('')}</div></div>` : ''}
        <div class="a-steps">
          <div class="a-step"><span class="n">${icon('star', 18)}</span><b>Name it</b><span>Any word is a seed. Or roll the dice.</span></div>
          <div class="a-step"><span class="n">${icon('paw', 18)}</span><b>Meet it</b><span>Zoom in close to watch its creatures.</span></div>
          <div class="a-step"><span class="n">${icon('down', 18)}</span><b>Land on it</b><span>Follow a signal, or just wander.</span></div>
        </div>
        <div class="a-links"><button type="button" data-act="deck:menu">${icon('pad', 18)}Controls</button><button type="button" data-act="about">${icon('info', 18)}About</button><button type="button" data-act="sound">${icon(B.music.on ? 'sound' : 'mute', 18)}Sound ${B.music.on ? 'on' : 'off'}</button></div>
      </div>`;
  }

  // ------------------------------------------------------------ the window
  function pagePlanet() {
    const w = B.world();
    const ground = S.mode === 'ground';
    const shot = heroShot && heroShot.seed === w.seed ? heroShot.src : w.thumb;
    const f = (k) => (w.facts.find((x) => x.k === k) || {}).value;
    const kind = `${w.typeLabel.toLowerCase().replace(/ world$/, '')} world`;
    const star = String(f('star') || '');
    const sun = !star ? '' : /^binary/i.test(star) ? ', under two suns' : `, under ${an(star).toLowerCase()} ${star.split(',')[0]}`;
    const lede = w.gas
      ? `A gas giant ${f('radius')} in radius. It has no ground: the clouds thicken into storms all the way down. A day lasts ${f('day')}.`
      : `${an(kind)} ${kind} ${f('radius')} in radius. A day lasts ${f('day')}, and the air holds ${f('temp')} on average${sun}.`;
    const known = w.fauna.filter((c) => c.found).length;
    const lock = (what, hint, i) => `<button type="button" class="a-card lock" data-act="hint:${what}" style="animation-delay:${i * 40}ms">${icon(what === 'plant' ? 'leaf' : 'paw', 24)}<b>Undiscovered</b><span>${hint}</span></button>`;
    const plantsHere = ground ? w.flora.map((p, i) => p.found
      ? `<button type="button" class="a-card plant" data-act="plant:${p.kind}">${icon('leaf', 24)}<b>${esc(p.name)}</b><span>Plant here · study ${icon('arrow', 13, 2)}</span></button>`
      : lock('plant', 'Tap it on the ground to study it', i)).join('') || `<div class="a-card plant plain">${icon('leaf', 24)}<b>Nothing grows here</b><span>Land on another cell to find plants</span></div>` : '';
    const plantsKnown = !ground ? w.floraKnown.map((p) => `<div class="a-card plant plain">${icon('leaf', 24)}<b>${esc(p.name)}</b><span>Found on a landing · study it on the ground</span></div>`).join('') : '';
    const life = `
      <h2 class="a-h" id="a-life">Field guide <span class="kick">${known} of ${w.fauna.length} creatures${ground && w.flora.length ? ` · ${w.flora.filter((p) => p.found).length} of ${w.flora.length} plants here` : ground ? '' : w.floraKnown.length ? ` · ${w.floraKnown.length} plants` : ''}</span></h2>
      <div class="a-meter"><div class="bar"><i style="width:${w.fauna.length ? Math.round((known / w.fauna.length) * 100) : 0}%"></i></div><span>${known === w.fauna.length && known ? 'Every creature of this world is in your guide.' : 'Find a creature on the planet and study it, and it joins your guide.'}</span></div>
      <p class="a-note">No story needed. Zoom in close from orbit and tap a creature, or land the probe and tap what moves and what grows around it.</p>
      <div class="a-life">
        ${w.fauna.map((c, i) => c.found
          ? `<button type="button" class="a-card" data-act="fauna:${c.kind}">${icon('paw', 24)}<b>${esc(c.name)}</b><span>Creature · study ${icon('arrow', 13, 2)}</span></button>`
          : lock('creature', ground ? 'Find it here, or zoom in from orbit' : 'Zoom in close and tap it', i)).join('') || '<div class="a-card plain"><span>No creatures live here.</span></div>'}
        ${plantsHere}${plantsKnown}
        ${!ground && !w.gas ? `<button type="button" class="a-card plant" data-act="land">${icon('down', 24)}<b>${w.floraKnown.length ? 'More plants' : 'The plants'}</b><span>They live on the ground. Land the probe to meet them ${icon('arrow', 13, 2)}</span></button>` : ''}
      </div>`;
    return `
      <header class="a-hero">
        <div class="a-orb" style="--halo:${HALO[w.type] || HALO.terran}">${thumb(shot)}</div>
        <div><span class="kick">${esc(w.designation)} · ${esc(w.typeLabel)}</span>
          <h1>${esc(w.seed)}</h1>
          <p class="a-lede">${esc(lede)}</p>
          <button type="button" class="a-chip" data-act="share">${icon('share', 15)}Copy a link to ${esc(w.seed)}</button></div>
      </header>
      ${ground ? life : ''}
      <h2 class="a-h">At a glance</h2>
      <div class="a-specs">${w.facts.map((x) => `<div class="a-spec ${['star', 'moons', 'activity'].includes(x.k) ? 'wide' : ''}"><span class="kick">${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join('')}</div>
      ${ground ? '' : life}`;
  }
  function pageStory() {
    const st = B.story(), w = B.world();
    const wander = `<div class="a-wander">${icon('paw', 22)}<div><p>The story can wait. Every creature of ${esc(w.seed)} is on the Planet page, and the probe can land anywhere just to look around.</p>
      <button type="button" class="a-chip" data-act="deck:planet:life">Meet the creatures ${icon('arrow', 14, 2)}</button></div></div>`;
    if (!st.has) {
      return `<span class="kick">Story</span><h1>${esc(st.objective.title)}</h1><p class="a-sub">${esc(st.objective.kicker)} · ${esc(w.designation)}</p>
        <div class="a-cols"><div>
          <p class="a-prose">${esc(w.gas ? 'A world of gas and storm. No signal reaches us from here, and there is no ground to land on. Watch it turn, and look for what swims in its sky.' : 'No signal reaches us from this world, and no record names it. Nobody has walked here before. This one has no mystery to solve: send the probe down and see what lives here.')}</p>
        </div><div>${wander}</div></div>`;
    }
    const o = st.objective;
    const cur = st.chapters.find((c) => c.id === o.chapter) || {};
    let cta = '';
    if (cur.tune) cta = `<form class="a-tune" data-form="tune"><input name="f" inputmode="decimal" placeholder="Frequency, MHz" autocomplete="off" aria-label="Frequency in MHz"><button type="submit" class="a-btn primary">Tune</button></form><div class="a-tune-ans"></div>`;
    else if (cur.state === 'open' && S.mode === 'orbit' && !S.gas) cta = `<button type="button" class="a-btn primary big" data-act="land">${icon('down', 18, 2.2)}Send the probe</button>`;
    else if (S.mode === 'ground') cta = `<button type="button" class="a-btn big" data-act="close">${icon('target', 18)}Back to the probe</button>`;
    const entries = st.chapters.map((c) => c.locked ? `
      <div class="a-entry closed"><div class="num">${ROMAN[c.n]}</div><div><h3>${icon('lock', 16)} Locked</h3><p>${esc(c.goal)}</p></div></div>` : `
      <div class="a-entry ${c.state}"><div class="num">${ROMAN[c.n]}</div><div>
        <h3>${esc(c.title)} <span class="a-tag ${c.state}">${c.state === 'done' ? 'Done' : 'Now'}</span></h3>
        <p>${esc(c.goal)}</p>
        <div class="st mono"><span>${esc(c.status)}</span>${c.band ? `<span>${esc(c.band)}</span>` : ''}</div>
        ${c.fixes.length ? `<div class="fixes mono">${c.fixes.map((x, i) => `<span>Landing ${i + 1} · ${String(Math.round(x.brg) % 360).padStart(3, '0')}° ±${Math.round(x.err)}° · ${Math.abs(x.lat).toFixed(1)}${x.lat < 0 ? 'S' : 'N'} ${Math.abs(x.lon).toFixed(1)}${x.lon < 0 ? 'W' : 'E'}</span>`).join('')}</div>` : ''}
        ${c.actions.length ? `<div class="acts">${c.actions.filter((a) => !(a.orbitOnly && S.mode !== 'orbit')).map((a) => `<button type="button" class="a-chip ${a.id === 'aim' ? 'warm' : ''}" data-act="${a.id}${a.chapter ? ':' + a.chapter : ''}">${esc(a.label)}</button>`).join('')}</div>` : ''}
      </div></div>`).join('');
    return `<span class="kick">Story · ${st.done} of ${st.of} chapters</span><h1>The signal from <em>${esc(w.seed)}</em></h1><p class="a-sub">${esc(w.designation)} · ${esc(w.typeLabel)}</p>
      <div class="a-cols">
        <div>
          <div class="a-tx"><span class="kick"><i></i>Received ${esc(st.intro.years)} years ago · ${esc(st.intro.band)}</span><div class="a-wv">${WAVE}</div>
            <p class="a-prose">${esc(st.intro.text)}</p>
            <div class="meta mono"><span>CARRIER ${esc(st.intro.ship)}</span><span>CREW ${esc(st.intro.crew)}</span></div></div>
          <div class="a-now"><span class="kick">${esc(o.kicker)}</span><h3>${esc(o.title)}</h3><p>${esc(o.line)}</p>${cta}</div>
          ${wander}
        </div>
        <div><h2 class="a-h" style="margin-top:6px">Chapters</h2>${entries}</div>
      </div>`;
  }
  function pageWorlds() {
    const ws = B.worlds();
    return `<div class="a-whead"><div><span class="kick">${ws.length} ${ws.length === 1 ? 'world' : 'worlds'} charted</span><h1>Your worlds</h1></div>
        <form class="a-form" data-form="go">
          <label class="a-field"><input name="seed" maxlength="40" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="A new name…" aria-label="A name">
            <button type="button" class="a-icobtn" data-act="dice" title="Roll a random world" aria-label="Roll a random world">${icon('dice', 20)}</button></label>
          <button type="submit" class="a-go"><span class="t">Find it</span>${icon('arrow', 20, 2.2)}</button>
        </form></div>
      <div class="a-grid">${ws.map((w) => `
        <div class="a-wcard ${w.active ? 'on' : ''}" role="button" tabindex="0" data-act="world:${esc(w.seed)}">
          ${thumb(w.thumb)}<b>${esc(w.seed)}</b><span>${esc(w.typeLabel)}</span>${w.marks ? `<i title="Chapters done">${esc(w.marks)}</i>` : ''}${w.active ? '<span class="here">HERE</span>' : ''}
          <button type="button" class="del" data-act="forget:${esc(w.seed)}" title="Forget this world" aria-label="Forget ${esc(w.seed)}">${icon('close', 12)}</button>
        </div>`).join('')}</div>`;
  }
  function pageMenu() {
    const row = ([d, t, touch]) => `<tr><td><kbd>${esc(d)}</kbd>${touch ? `<span class="t">${esc(touch)}</span>` : ''}</td><td>${esc(t)}</td></tr>`;
    return `<span class="kick">Settings</span><h1>Menu</h1><p class="a-sub">Sound, and how to explore</p>
      <div class="a-menu">
        <div>
          <h2 class="a-h" style="margin-top:0">Sound</h2>
          <div class="a-row"><span>The music of each world</span><button type="button" class="a-btn" data-act="sound">${icon(B.music.on ? 'sound' : 'mute', 16)}${B.music.on ? 'On' : 'Off'}</button></div>
          <input class="a-range" type="range" min="0" max="100" value="${Math.round(B.music.vol * 100)}" data-input="vol" aria-label="Volume" ${B.music.on ? '' : 'disabled'}>
          <h2 class="a-h">More</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="a-btn" data-act="about">${icon('info', 16)}About My Worlds</button>
            ${titleOn ? '' : `<button type="button" class="a-btn" data-act="title">${icon('star', 16)}Title screen</button>`}
          </div>
        </div>
        <div>
          <h2 class="a-h" style="margin-top:0">In orbit</h2><table class="a-keys">${CONTROLS.orbit.map(row).join('')}</table>
          <h2 class="a-h">On the ground</h2><table class="a-keys">${CONTROLS.ground.map(row).join('')}</table>
        </div>
      </div>`;
  }
  function renderDeck(anchor) {
    if (!deck) return;
    if (el.page.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;   // the reader is typing
    const ready = !S.loading;
    const w = ready && !titleOn ? B.world() : null;
    el.bhead.innerHTML = `<div class="where">${w ? `${thumb(w.thumb)}<span><b>${esc(w.seed)}</b> · ${esc(PAGES[deck])}</span>` : `<span><b>My Worlds</b> · ${esc(PAGES[deck])}</span>`}</div>
      <button type="button" class="a-x" data-act="close" aria-label="Close">${icon('close', 18)}</button>`;
    const same = el.deck.dataset.page === deck;
    const top = same ? el.page.scrollTop : 0;
    el.page.innerHTML = !ready ? '' : deck === 'planet' ? pagePlanet() : deck === 'story' ? pageStory() : deck === 'worlds' ? pageWorlds() : pageMenu();
    el.deck.dataset.page = deck;
    el.page.scrollTop = top;
    if (anchor) { const a = el.page.querySelector(`#a-${anchor}`); if (a) el.page.scrollTop = a.offsetTop - 16; }
    if (deck === 'story') seenStory = S.storyKey;
    if (deck === 'planet') seenFound = S.found;
  }
  function openDeck(page, anchor) {
    if (page === deck && !anchor) { deck = null; render(); return; }
    deck = page;
    B.cancelAim();
    if (page === 'planet' && !S.loading && !titleOn) heroShot = { seed: S.seed, src: B.snapshot() };
    renderDeck(anchor);
    render();
  }

  // ------------------------------------------------------------ the arrival
  function renderArrival() {
    const st = B.story(), w = B.world();
    const wander = `<p class="alt">${icon('paw', 16)}<span>Or just explore: zoom in to watch the creatures, and land the probe to walk among them.</span></p>`;
    let h, unfold = false;
    if (st.has && st.done === 0 && st.chapters[0].fixes.length === 0) {
      unfold = true;
      h = `<div class="kick"><i></i>Incoming · ${esc(st.intro.years)} years old · ${esc(st.intro.band)}</div>
        <h2>A distress signal from ${esc(w.designation)}</h2>
        <div class="a-wv">${WAVE}</div>
        <p>${esc(st.intro.text)}</p>${wander}
        <div class="acts"><button type="button" class="a-btn primary" data-act="arrive-signal">${icon('signal', 16)}Follow the signal</button><button type="button" class="a-btn" data-act="arrive-close">Just explore</button></div>`;
    } else if (st.has) {
      h = `<div class="kick" style="color:#9fd6ff">Welcome back · ${st.done} of ${st.of} chapters</div>
        <h2>${esc(w.seed)}</h2><p><b style="font-weight:500">${esc(st.objective.title)}.</b> ${esc(st.objective.line)}</p>
        <div class="acts"><button type="button" class="a-btn primary" data-act="arrive-close">Continue</button><button type="button" class="a-btn" data-act="deck:story">Open the story</button></div>`;
    } else {
      h = `<div class="kick" style="color:#9fd6ff">${esc(st.objective.kicker)} · ${esc(w.designation)}</div>
        <h2>${esc(w.seed)} · ${esc(w.typeLabel)}</h2><p>${esc(w.gas ? 'No signal reaches us from here, and there is no ground. Zoom in to find what swims in its sky.' : 'No signal reaches us from here, and nobody has walked here. Zoom in to meet the creatures, and land the probe anywhere to look around.')}</p>
        <div class="acts"><button type="button" class="a-btn primary" data-act="arrive-close">Explore</button><button type="button" class="a-btn" data-act="deck:planet:life">Meet the creatures</button></div>`;
    }
    el.arrive.innerHTML = h;
    el.arrive.classList.toggle('unfold', unfold);
    arrival = true;
  }

  // ------------------------------------------------------------ the frame
  function render() {
    const s = S;
    const ready = !s.loading && !s.busy;
    const L = layer();
    const moving = s.dive || s.mode === 'descending' || s.mode === 'ascending';
    if (!titleOn && ready && arrivalFor === 'pending') {
      arrivalFor = s.seed;
      setTimeout(() => { if (arrivalFor === s.seed && !S.busy && !titleOn) { renderArrival(); render(); } }, 900);
    }
    if (L !== 'none') show(el.toast, false);
    el.title.hidden = L !== 'title';
    el.deck.hidden = L !== 'deck';
    el.deck.classList.toggle('solo', titleOn);
    el.arrive.hidden = L !== 'arrival';
    const base = L === 'none' && ready && !moving;
    const ground = s.mode === 'ground';
    // the dock: the planet's, or the window's
    show(el.dock, ready && (base || (L === 'deck' && !titleOn)));
    el.dock.classList.toggle('deck', L === 'deck');
    const p = el.probe;
    p.className = 'a-probe';
    let lbl = 'Send probe', ic = 'down';
    if (L === 'deck') { p.classList.add('shut'); lbl = 'Close'; ic = 'close'; }
    else if (s.gas) { p.classList.add('off'); lbl = 'No surface'; ic = 'lock'; }
    else if (s.aiming) { p.classList.add('aim'); lbl = 'Cancel'; ic = 'close'; }
    else if (ground) { p.classList.add('recall'); lbl = 'Recall probe'; ic = 'up'; }
    else if (s.mode !== 'orbit') { p.classList.add('off', 'busy'); lbl = s.mode === 'descending' ? 'Landing…' : 'Climbing…'; }
    if (performance.now() < nudgeUntil && L !== 'deck') p.classList.add('nudge');
    p.querySelector('.lbl').textContent = lbl;
    p.querySelector('.orb').innerHTML = icon(ic, 30, 2.2);
    root.querySelectorAll('.a-tab').forEach((t) => t.classList.toggle('on', L === 'deck' && t.dataset.act === `deck:${deck}`));
    const st = ready ? B.story() : null;
    const storyTab = root.querySelector('.a-tab[data-act="deck:story"]');
    const badge = st && st.has && s.storyKey !== seenStory && deck !== 'story';
    const b = storyTab.querySelector('.badge');
    if (badge && !b) storyTab.insertAdjacentHTML('beforeend', '<i class="badge"></i>');
    if (!badge && b) b.remove();
    const planetTab = root.querySelector('.a-tab[data-act="deck:planet"]');
    const pBadge = seenFound >= 0 && s.found > seenFound && deck !== 'planet';
    const pb = planetTab.querySelector('.badge');
    if (pBadge && !pb) planetTab.insertAdjacentHTML('beforeend', '<i class="badge"></i>');
    if (!pBadge && pb) pb.remove();
    // the sound of the world, on the planet itself
    const on = ready && B.music.on && !B.music.stalled;
    el.snd.className = `a-snd glass pe fade ${on ? 'on' : soundAsked ? 'off' : 'invite'}`;
    el.snd.title = on ? 'Music on · click to silence' : 'Turn on the music of this world';
    const sndKey = `${on}|${soundAsked}`;
    if (el.snd.dataset.k !== sndKey) {
      el.snd.dataset.k = sndKey;
      el.snd.innerHTML = `<button type="button" data-act="sound" aria-label="${on ? 'Silence the music' : 'Play the music'}">${on ? '<span class="eq"><i></i><i></i><i></i><i></i></span>'
        : soundAsked ? icon('mute', 20) : `${icon('sound', 20)}<span class="t">Turn on the music</span>`}</button>${on ? `<input type="range" min="0" max="100" value="${Math.round(B.music.vol * 100)}" data-input="vol" aria-label="Volume">` : ''}`;
    }
    show(el.snd, base);
    // the chrome of the planet
    if (st && base) {
      const o = st.objective;
      const bar = st.has ? `<div class="bar">${st.chapters.map((c) => `<i class="${c.state === 'done' ? 'on' : c.state === 'open' ? 'open' : ''}"></i>`).join('')}</div>` : '';
      el.obj.innerHTML = `<span class="dot">${icon(st.has ? 'signal' : s.gas ? 'wave' : 'paw', 18)}</span><span><span class="kick">${esc(o.kicker)}</span><b>${esc(o.title)}</b><p>${esc(o.line)}</p>${bar}</span>`;
      el.gobj.innerHTML = `${icon('signal', 16)}<span>${esc(o.line)} <span class="more">Story ›</span></span>`;
      const w = B.world();
      el.world.innerHTML = `${thumb(w.thumb)}<span style="min-width:0"><b>${esc(w.seed)}</b><span>${esc(w.typeLabel)} · ${esc(w.designation)}</span></span>`;
    }
    show(el.world, base && !ground && !s.aiming);
    show(el.obj, base && !ground && !s.aiming);
    show(el.gobj, base && ground && !!(st && st.has));
    show(el.aim, base && s.aiming);
    if (s.ctx) el.ctx.innerHTML = `${icon('target', 18, 2)}<span>${esc(s.ctx)}</span>${icon('arrow', 16, 2.2)}`;
    show(el.ctx, base && ground && !!s.ctx);
    // the probe overlay makes room for the dock
    const phone = innerWidth <= 760;
    // The objective and the study chip stand over the dock, so the overlay lifts its foot over them.
    const over = (!el.gobj.classList.contains('gone') ? el.gobj.offsetHeight + 10 : 0) + (!el.ctx.classList.contains('gone') ? 54 : 0);
    B.hudInsets({ top: phone ? 62 : 76, bottom: (phone ? 78 : 106) + 30 + over, left: phone ? 12 : 22, right: phone ? 12 : 22 });
  }

  // ------------------------------------------------------------ input
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
    B.loader(true);
    if (!B.go(name)) return;
    S = { ...S, busy: true };
    deck = null; arrival = false; titleOn = false;
    arrivalFor = 'pending';
    render();
  }
  function toast(t, ms = 2200) { el.toast.textContent = t; show(el.toast, true); clearTimeout(toast.t); toast.t = setTimeout(() => show(el.toast, false), ms); }
  function land() { deck = null; arrival = false; render(); if (S.mode === 'orbit' && !S.gas && !S.aiming) B.aim(); }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    const [act, arg, sub] = t.dataset.act.split(':');
    if (act === 'forget') { e.stopPropagation(); B.forget(t.dataset.act.slice(7)); renderDeck(); return; }
    if (act === 'deck') { arrival = false; openDeck(arg, sub); return; }
    if (act === 'close') { deck = null; }
    else if (act === 'probe') {
      if (deck) deck = null;
      else if (S.gas || (S.mode !== 'orbit' && S.mode !== 'ground')) return;
      else B.probe();
    }
    else if (act === 'land') land();
    else if (act === 'cancel-aim') B.cancelAim();
    else if (act === 'study') B.study();
    else if (act === 'dice') {
      const input = t.closest('form').querySelector('input');
      t.classList.add('spin'); setTimeout(() => t.classList.remove('spin'), 500);
      scramble(input, B.randomName(), () => go(input.value));
      return;
    }
    else if (act === 'world') { if (e.target.closest('.del')) return; go(t.dataset.act.slice(6)); return; }
    else if (act === 'fauna') askApp(() => B.inspect(+arg));
    else if (act === 'plant') askApp(() => B.inspectPlant(+arg));
    else if (act === 'brief') askApp(() => B.brief());
    else if (act === 'lost') askApp(() => B.lost());
    else if (act === 'about') askApp(() => B.about());
    else if (act === 'clear') { B.clear(); setTimeout(renderDeck, 60); }
    else if (act === 'aim') { deck = null; render(); B.aimAt(arg); }
    else if (act === 'share') B.share().then((ok) => toast(ok ? 'Link copied' : B.shareUrl()));
    else if (act === 'sound') {
      soundAsked = true;
      try { localStorage.setItem('myworlds.proto.sound', '1'); } catch { /* prototype */ }
      if (B.music.stalled) B.music.start(); else B.music.toggle();
      setTimeout(() => { if (titleOn) renderTitle(); renderDeck(); render(); }, 30);
    }
    else if (act === 'hint') toast(arg === 'plant' ? 'Plants live on the ground: land, tap one, and study it.' : 'Find it on the planet: zoom in close and tap it, or land and tap it on the ground.');
    else if (act === 'title') { B.loader(false); deck = null; titleOn = true; renderTitle(); }
    else if (act === 'arrive-signal') { arrival = false; nudgeUntil = performance.now() + 4000; setTimeout(render, 4100); }
    else if (act === 'arrive-close') { arrival = false; }
    render();
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.dataset.form === 'go') go(f.querySelector('input').value);
    else if (f.dataset.form === 'tune') {
      const a = B.tune(f.querySelector('input').value);
      const ans = f.nextElementSibling;
      ans.textContent = a.text; ans.dataset.kind = a.kind;
      if (a.kind === 'lock') { f.querySelector('input').blur(); setTimeout(renderDeck, 1200); }
    }
  });
  root.addEventListener('input', (e) => { if (e.target.dataset.input === 'vol') B.music.set(e.target.value / 100); });
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (deck) { deck = null; render(); }
    else if (arrival) { arrival = false; render(); }
  };
  addEventListener('keydown', onKey);
  B.onFrameKey(onKey);
  addEventListener('resize', render);

  B.ready.then(() => { if (titleOn) renderTitle(); render(); });
  B.subscribe((s) => {
    if (s.seed && lastSeed !== null && s.seed !== lastSeed && arrivalFor !== 'pending') arrivalFor = 'pending';
    if (s.seed) lastSeed = s.seed;
    S = s;
    if (s.card || s.dialog) appWait = 0;
    if (seenFound < 0 && !s.loading) seenFound = s.found;
    // A find is announced when its card closes, so the toast never stands on the card.
    if (!s.card && !s.dialog) {
      const finds = B.takeFinds();
      if (finds.length) {
        const f = finds[finds.length - 1];
        toast(f.type === 'creature' ? `✦ New in your field guide: ${f.name} · ${f.n} of ${f.of} creatures` : `✦ New in your field guide: ${f.name}`, 3200);
      }
    }
    if (deck && !(s.card || s.dialog)) renderDeck();
    render();
  });
  if (titleOn) { B.loader(false); renderTitle(); }
  render();
}
