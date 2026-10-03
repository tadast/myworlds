// PROTOTYPE — concept A, "Flight deck". A flat hub: one persistent dock, every function one tap away,
// the probe as the raised button in the middle of the dock. See NOTES.md.
import { icon } from './icons.js';
import { esc, CONTROLS } from './bridge.js';

export const meta = {
  name: 'Flight deck',
  map: `
  <h3>A — Flight deck</h3>
  <p>A game HUD. One dock holds everything, and the probe is the big raised button in its middle: the thumb finds it without looking. Flat topology: every function is one tap from the planet.</p>
  <h4>Topology</h4>
  <pre>Title ──name / dice / continue──▶ Planet
                                   │
   dock:  [Worlds] [Story] (● PROBE) [Planet] [Menu]
              │       │        │         │       │
            sheet   sheet   aim ▸ land  sheet   sheet
                             recall ◂ ground
   one sheet at a time · right panel on desktop · bottom sheet on phone</pre>
  <h4>Hierarchy</h4>
  <ol>
    <li><b>Probe</b> — the one warm colour on screen. Send in orbit, Recall on the ground.</li>
    <li><b>Objective</b> — the next step of the story, top right (orbit) or over the dock (ground).</li>
    <li><b>Where am I</b> — the world chip, top left.</li>
    <li><b>Everything else</b> — behind the four dock tabs.</li>
  </ol>
  <h4>Trade-off</h4>
  <p>Fastest to use and to learn. Least cinematic: the dock is always there, so the planet never has the screen to itself.</p>`,
};

const CSS = `
.A { position: absolute; inset: 0; font-family: Fredoka, ui-rounded, system-ui, sans-serif; color: #eef1ff;
  --glass: rgba(10, 14, 30, 0.74); --line: rgba(140, 200, 255, 0.16); --muted: #9aa3c7; --accent: #7cc4ff;
  --warm: #ffb86b; --warm2: #ff7d54; --mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
  --dock-h: 74px; --dock-b: 18px; --safe-b: env(safe-area-inset-bottom); }
.A * { box-sizing: border-box; }
.A [hidden] { display: none !important; }
.A button { font: inherit; color: inherit; }
.A .pe { pointer-events: auto; }
.A .glass { background: var(--glass); border: 1px solid var(--line); backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2); }
.A .fade { transition: opacity .35s ease, transform .35s ease; }
.A .gone { opacity: 0 !important; pointer-events: none !important; transform: translateY(8px); }
.A .mono { font-family: var(--mono); letter-spacing: .02em; }
.A .kick { font-family: var(--mono); font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }

/* ---------- title */
.a-title { position: absolute; inset: 0; pointer-events: auto; display: flex; align-items: center;
  background: linear-gradient(100deg, rgba(7,10,22,.96) 0%, rgba(7,10,22,.88) 30%, rgba(7,10,22,.35) 55%, rgba(7,10,22,0) 72%); }
.a-title .col { width: min(560px, 100%); padding: 48px 56px; display: flex; flex-direction: column; gap: 18px; }
.a-title .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; letter-spacing: .02em; color: var(--warm); font-size: 15px; }
.a-title h1 { margin: 0; font-size: clamp(38px, 5.4vw, 64px); line-height: 1.02; font-weight: 600; letter-spacing: -.01em; }
.a-title h1 em { font-style: normal; background: linear-gradient(90deg, #9fd6ff, #ffb86b); -webkit-background-clip: text; background-clip: text; color: transparent; }
.a-title p.lede { margin: 0; color: #c5cbe6; font-size: 17px; line-height: 1.45; max-width: 440px; }
.a-form { display: flex; gap: 8px; align-items: stretch; margin-top: 6px; }
.a-field { flex: 1; display: flex; align-items: center; min-width: 0; border-radius: 16px; padding: 0 6px 0 16px; height: 56px;
  background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16); transition: border-color .2s, box-shadow .2s; }
.a-field:focus-within { border-color: var(--accent); box-shadow: 0 0 0 4px rgba(124,196,255,.15); }
.a-field input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; color: #fff; font: 500 19px Fredoka, sans-serif; }
.a-field input::placeholder { color: #7d86ab; }
.a-icobtn { width: 44px; height: 44px; border-radius: 12px; border: 0; background: rgba(255,255,255,.08); display: grid; place-items: center; cursor: pointer; flex: none; }
.a-icobtn:hover { background: rgba(255,255,255,.16); }
.a-icobtn.spin .ico { animation: a-roll .5s ease; }
@keyframes a-roll { to { transform: rotate(360deg); } }
.a-go { height: 56px; padding: 0 22px; border-radius: 16px; border: 0; cursor: pointer; font-weight: 600; font-size: 17px; color: #1b1205 !important;
  background: linear-gradient(180deg, #ffd39a, var(--warm)); display: flex; align-items: center; gap: 8px; box-shadow: 0 8px 30px rgba(255,184,107,.28); }
.a-go:hover { filter: brightness(1.06); }
.a-recent { display: flex; flex-direction: column; gap: 8px; }
.a-recent .row { display: flex; gap: 8px; flex-wrap: wrap; }
.a-wchip { display: flex; align-items: center; gap: 8px; padding: 5px 12px 5px 5px; border-radius: 999px; cursor: pointer;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); font-size: 14px; }
.a-wchip:hover { border-color: var(--accent); }
.a-wchip img { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: #111a33; }
.a-wchip i { font-style: normal; color: var(--warm); font-size: 11px; }
.a-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 8px; }
.a-step { padding: 12px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07); }
.a-step b { display: block; font-weight: 500; font-size: 14px; margin: 6px 0 2px; }
.a-step span { color: var(--muted); font-size: 12.5px; line-height: 1.35; }
.a-step .n { color: var(--accent); }
.a-links { display: flex; gap: 18px; color: var(--muted); font-size: 14px; }
.a-links button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.a-links button:hover { color: #fff; }

/* ---------- top: the world chip and the objective */
.a-world { text-align: left; position: absolute; left: 16px; top: 16px; display: flex; align-items: center; gap: 10px; padding: 6px 16px 6px 6px; border-radius: 999px; cursor: pointer; max-width: calc(100vw - 32px); }
.a-world img, .a-world .ph { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: radial-gradient(circle at 35% 30%, #4b7fd0, #0d1a3a); flex: none; }
.a-world b { display: block; font-weight: 600; font-size: 17px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.a-world span { display: block; font-size: 12px; color: var(--muted); white-space: nowrap; }
.a-obj { position: absolute; right: 16px; top: 16px; width: 340px; padding: 12px 14px 12px 14px; border-radius: 18px; cursor: pointer; text-align: left; display: flex; gap: 12px; }
.a-obj .dot { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: none; color: var(--warm); background: rgba(255,184,107,.12); }
.a-obj b { display: block; font-weight: 500; font-size: 15px; margin: 2px 0 2px; }
.a-obj p { margin: 0; color: #c5cbe6; font-size: 13px; line-height: 1.35; }
.a-obj .bar { display: flex; gap: 4px; margin-top: 8px; }
.a-obj .bar i { height: 3px; flex: 1; border-radius: 2px; background: rgba(255,255,255,.12); }
.a-obj .bar i.on { background: var(--warm); }
.a-obj .bar i.open { background: linear-gradient(90deg, var(--warm) 40%, rgba(255,255,255,.12) 40%); }

/* ---------- the dock */
.a-dock { position: absolute; left: 50%; bottom: calc(var(--dock-b) + var(--safe-b)); transform: translateX(-50%); width: 480px; height: var(--dock-h);
  border-radius: 26px; display: grid; grid-template-columns: 1fr 1fr 112px 1fr 1fr; align-items: center; padding: 0 6px; }
.a-tab { height: 60px; border: 0; background: none; border-radius: 16px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  color: #b9c0de; font-size: 11.5px; position: relative; }
.a-tab:hover, .a-tab.on { color: #fff; background: rgba(255,255,255,.06); }
.a-tab.on::after { content: ''; position: absolute; bottom: 4px; width: 16px; height: 2px; border-radius: 2px; background: var(--accent); }
.a-tab .badge { position: absolute; top: 8px; right: calc(50% - 18px); width: 8px; height: 8px; border-radius: 50%; background: var(--warm); box-shadow: 0 0 0 3px rgba(10,14,30,.9); }
.a-probe { position: relative; justify-self: center; margin-top: -40px; display: flex; flex-direction: column; align-items: center; gap: 6px; border: 0; background: none; cursor: pointer; }
.a-probe .orb { width: 84px; height: 84px; border-radius: 50%; display: grid; place-items: center; color: #2a1405;
  background: radial-gradient(circle at 35% 28%, #ffe2b8, var(--warm) 45%, var(--warm2) 100%);
  box-shadow: 0 0 0 6px rgba(10,14,30,.9), 0 0 0 7px rgba(255,184,107,.45), 0 12px 40px rgba(255,140,80,.45); transition: transform .15s, filter .2s; }
.a-probe:hover .orb { transform: scale(1.04); }
.a-probe:active .orb { transform: scale(.96); }
.a-probe .orb::before { content: ''; position: absolute; top: 0; left: 50%; width: 84px; height: 84px; margin-left: -42px; border-radius: 50%;
  border: 2px solid rgba(255,184,107,.7); animation: a-ping 2.4s ease-out infinite; pointer-events: none; }
@keyframes a-ping { from { transform: scale(1); opacity: .9; } to { transform: scale(1.55); opacity: 0; } }
.a-probe .lbl { font-weight: 600; font-size: 12.5px; color: var(--warm); white-space: nowrap; letter-spacing: .01em; }
.a-probe.aim .orb { background: radial-gradient(circle at 35% 28%, #fff, #dbe9ff 60%, #a9c9f5); color: #10203d; }
.a-probe.aim .orb::before { border-color: rgba(124,196,255,.8); }
.a-probe.aim .lbl { color: #cfe6ff; }
.a-probe.recall .orb { background: radial-gradient(circle at 35% 28%, #e6f4ff, #7cc4ff 50%, #3c7fd6); color: #071631; box-shadow: 0 0 0 6px rgba(10,14,30,.9), 0 0 0 7px rgba(124,196,255,.5), 0 12px 40px rgba(80,150,255,.45); }
.a-probe.recall .orb::before { border-color: rgba(124,196,255,.7); }
.a-probe.recall .lbl { color: #9fd6ff; }
.a-probe.off { cursor: default; }
.a-probe.off .orb { background: #2a3150; color: #6e7698; box-shadow: 0 0 0 6px rgba(10,14,30,.9), 0 0 0 7px rgba(255,255,255,.1); }
.a-probe.off .orb::before { display: none; }
.a-probe.off .lbl { color: #6e7698; }
.a-probe.busy .orb::after { content: ''; position: absolute; width: 96px; height: 96px; border-radius: 50%; border: 2px solid transparent; border-top-color: #fff; animation: a-roll 1s linear infinite; }

/* ---------- aim bar, objective strip, context chip */
.a-aim { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 16px; border-radius: 999px; white-space: nowrap; }
.a-aim .ico { color: var(--accent); animation: a-roll 4s linear infinite; }
.a-aim button { border: 0; border-radius: 999px; padding: 8px 14px; background: rgba(255,255,255,.1); cursor: pointer; }
.a-gobj { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--dock-b) + var(--safe-b) + var(--dock-h) + 34px); max-width: min(520px, calc(100vw - 32px));
  display: flex; align-items: center; gap: 8px; padding: 7px 14px; border-radius: 999px; font-size: 13px; color: #d7dcf3; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.a-gobj .ico { color: var(--warm); flex: none; }
.a-gobj span { overflow: hidden; text-overflow: ellipsis; }
.a-ctx { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--dock-b) + var(--safe-b) + var(--dock-h) + 78px);
  display: flex; align-items: center; gap: 10px; padding: 10px 18px 10px 12px; border-radius: 999px; border: 0; cursor: pointer; white-space: nowrap;
  background: #f4f7ff; color: #0b1430 !important; font-weight: 600; font-size: 15px; box-shadow: 0 10px 30px rgba(0,0,0,.35); max-width: calc(100vw - 32px); }
.a-ctx .ico { color: #2f6fd0; }
.a-ctx span { overflow: hidden; text-overflow: ellipsis; }

/* ---------- the sheet */
.a-sheet { position: absolute; right: 16px; top: 16px; bottom: calc(var(--dock-b) + var(--safe-b) + var(--dock-h) + 14px); width: 400px; border-radius: 24px; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 30px 80px rgba(0,0,0,.5); }
.a-sheet header { display: flex; align-items: center; gap: 10px; padding: 16px 16px 10px 20px; }
.a-sheet header h2 { margin: 0; font-size: 20px; font-weight: 600; flex: 1; }
.a-sheet header .x { width: 36px; height: 36px; border-radius: 12px; border: 0; background: rgba(255,255,255,.07); cursor: pointer; display: grid; place-items: center; }
.a-sheet .body { flex: 1; overflow: auto; padding: 4px 20px 22px; overscroll-behavior: contain; }
.a-sheet .handle { display: none; }
.a-sec { margin: 18px 0 8px; }
.a-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.a-fact { padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06); min-width: 0; }
.a-fact.wide { grid-column: 1 / -1; }
.a-fact .kick { font-size: 9.5px; }
.a-fact b { display: block; font-weight: 500; font-size: 17px; margin-top: 3px; }
.a-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.a-chip { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); border-radius: 999px; padding: 7px 12px; cursor: pointer; font-size: 13.5px; display: inline-flex; gap: 6px; align-items: center; }
.a-chip:hover { border-color: var(--accent); }
.a-chip.warm { border-color: rgba(255,184,107,.4); color: var(--warm); }
.a-note { color: var(--muted); font-size: 13px; line-height: 1.45; margin: 6px 0 0; }
.a-head { display: flex; gap: 12px; align-items: center; }
.a-head img, .a-head .ph { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; background: radial-gradient(circle at 35% 30%, #4b7fd0, #0d1a3a); }
.a-head b { font-size: 22px; font-weight: 600; display: block; }
.a-btn { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); border-radius: 12px; padding: 10px 14px; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; font-size: 14px; }
.a-btn:hover { border-color: var(--accent); }
.a-btn.primary { background: linear-gradient(180deg, #ffd39a, var(--warm)); color: #1b1205 !important; border: 0; font-weight: 600; }
.a-tx { position: relative; padding: 14px 14px 14px 16px; border-radius: 16px; background: linear-gradient(135deg, rgba(255,184,107,.12), rgba(255,184,107,.03)); border: 1px solid rgba(255,184,107,.22); }
.a-tx p { margin: 6px 0 10px; font-size: 14.5px; line-height: 1.5; color: #e9ddcd; }
.a-tx .meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11px; color: #d8b892; }
.a-tl { list-style: none; margin: 0; padding: 0; position: relative; }
.a-tl::before { content: ''; position: absolute; left: 15px; top: 18px; bottom: 18px; width: 2px; background: rgba(255,255,255,.08); }
.a-tl li { position: relative; padding: 0 0 18px 46px; }
.a-tl .node { position: absolute; left: 0; top: 0; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: #151b36; border: 1px solid rgba(255,255,255,.12); color: var(--muted); }
.a-tl li.done .node { background: rgba(124,196,255,.15); border-color: rgba(124,196,255,.5); color: var(--accent); }
.a-tl li.open .node { background: var(--warm); border-color: var(--warm); color: #2a1405; box-shadow: 0 0 0 5px rgba(255,184,107,.15); }
.a-tl li.closed { opacity: .55; }
.a-tl h3 { margin: 4px 0 2px; font-size: 16px; font-weight: 500; }
.a-tl .goal { margin: 0; color: #c5cbe6; font-size: 13.5px; line-height: 1.4; }
.a-tl .st { margin-top: 6px; font-size: 11.5px; color: var(--muted); display: flex; gap: 12px; flex-wrap: wrap; }
.a-tl .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.a-tune { display: flex; gap: 6px; margin-top: 10px; }
.a-tune input { flex: 1; min-width: 0; height: 40px; border-radius: 10px; border: 1px solid rgba(255,255,255,.16); background: rgba(0,0,0,.25); color: #fff; padding: 0 10px; font: 15px var(--mono); }
.a-tune input:focus { outline: 0; border-color: var(--accent); }
.a-tune-ans { font-size: 12.5px; color: var(--muted); margin-top: 6px; min-height: 1em; }
.a-tune-ans[data-kind="near"] { color: var(--warm); }
.a-tune-ans[data-kind="lock"] { color: #8ff0b5; }
.a-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.a-wcard { position: relative; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); border-radius: 16px; padding: 10px 6px 10px; cursor: pointer; text-align: center; min-width: 0; }
.a-wcard:hover { border-color: rgba(124,196,255,.5); }
.a-wcard.on { border-color: var(--accent); background: rgba(124,196,255,.08); }
.a-wcard img, .a-wcard .ph { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; display: block; margin: 0 auto 6px; background: radial-gradient(circle at 35% 30%, #4b7fd0, #0d1a3a); box-shadow: 0 0 18px rgba(124,196,255,.15); }
.a-wcard b { display: block; font-weight: 500; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.a-wcard span { display: block; font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.a-wcard i { position: absolute; left: 8px; top: 6px; font-style: normal; font-size: 11px; color: var(--warm); }
.a-wcard .del { position: absolute; right: 4px; top: 4px; width: 22px; height: 22px; border-radius: 8px; border: 0; background: rgba(0,0,0,.35); color: #aab; cursor: pointer; display: grid; place-items: center; opacity: 0; }
.a-wcard:hover .del { opacity: 1; }
.a-keys { width: 100%; border-collapse: collapse; font-size: 13px; }
.a-keys td { padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.06); vertical-align: top; }
.a-keys td:first-child { width: 42%; padding-right: 10px; }
.a-keys kbd { font: 11px var(--mono); padding: 3px 6px; border-radius: 6px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); }
.a-keys .t { display: block; color: var(--muted); font-size: 11px; margin-top: 3px; }
.a-range { width: 100%; accent-color: var(--warm); }
.a-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

/* ---------- the arrival */
.a-arrive { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, calc(100vw - 28px)); border-radius: 24px; padding: 20px 22px 18px;
  box-shadow: 0 30px 90px rgba(0,0,0,.6); animation: a-in .6s cubic-bezier(.2,.8,.2,1); }
@keyframes a-in { from { opacity: 0; transform: translate(-50%, -44%) scale(.97); } }
.a-arrive .kick { display: flex; align-items: center; gap: 8px; color: var(--warm); }
.a-arrive .kick i { width: 8px; height: 8px; border-radius: 50%; background: var(--warm); animation: a-blink 1s steps(2) infinite; }
@keyframes a-blink { 50% { opacity: .2; } }
.a-arrive h2 { margin: 10px 0 8px; font-size: 24px; font-weight: 600; line-height: 1.15; }
.a-arrive p { margin: 0 0 12px; color: #d5daf0; font-size: 15px; line-height: 1.5; }
.a-arrive .meta { display: flex; gap: 6px 16px; flex-wrap: wrap; font-size: 11px; color: var(--muted); margin-bottom: 16px; }
.a-arrive .meta b { color: #eef1ff; font-weight: 500; }
.a-arrive .acts { display: flex; gap: 8px; }
.a-toast { position: absolute; left: 50%; top: 20px; transform: translateX(-50%); padding: 9px 16px; border-radius: 999px; font-size: 14px; }

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
  .a-world { top: calc(10px + env(safe-area-inset-top)); left: 10px; padding: 4px 14px 4px 4px; }
  .a-world img, .a-world .ph { width: 34px; height: 34px; }
  .a-world b { font-size: 15px; }
  .a-obj { top: calc(62px + env(safe-area-inset-top)); left: 10px; right: auto; width: auto; max-width: calc(100vw - 20px); padding: 8px 12px 8px 8px; border-radius: 16px; align-items: center; }
  .a-obj .dot { width: 28px; height: 28px; }
  .a-obj .kick, .a-obj .bar { display: none; }
  .a-obj b { font-size: 13.5px; margin: 0; }
  .a-obj p { font-size: 12px; }
  .a-dock { left: 0; right: 0; width: auto; transform: none; border-radius: 22px 22px 0 0; height: calc(var(--dock-h) + var(--safe-b)); padding-bottom: var(--safe-b); border-bottom: 0; grid-template-columns: 1fr 1fr 96px 1fr 1fr; }
  .a-probe { margin-top: -34px; }
  .a-probe .orb { width: 74px; height: 74px; }
  .a-probe .orb::before { width: 74px; height: 74px; margin-left: -37px; }
  .a-sheet { left: 0; right: 0; top: auto; width: auto; bottom: calc(var(--dock-h) + var(--safe-b) - 1px); max-height: 74dvh; height: 74dvh; border-radius: 24px 24px 0 0; border-bottom: 0;
    box-shadow: 0 -20px 60px rgba(0,0,0,.45); animation: a-up .3s cubic-bezier(.2,.8,.2,1); }
  @keyframes a-up { from { transform: translateY(40px); opacity: 0; } }
  .a-sheet .body { padding-bottom: 60px; }
  .a-sheet .handle { display: block; width: 40px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.2); margin: 8px auto 0; }
  .a-sheet header { padding-top: 8px; }
  .a-wcard .del { opacity: .7; }
  .a-aim { top: calc(10px + env(safe-area-inset-top)); font-size: 14px; }
  .a-arrive { top: auto; bottom: calc(var(--dock-h) + var(--safe-b) + 16px); transform: translateX(-50%); animation: a-in2 .6s cubic-bezier(.2,.8,.2,1); }
  @keyframes a-in2 { from { opacity: 0; transform: translate(-50%, 20px); } }
}
@media (max-width: 380px) { .a-steps { display: none; } }
`;

export function mount(root, B, { showStart }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  root.innerHTML = `
  <div class="A">
    <button type="button" class="a-world glass pe fade gone" data-act="sheet:planet"></button>
    <button type="button" class="a-obj glass pe fade gone" data-act="sheet:story"></button>
    <div class="a-aim glass pe fade gone">${icon('cross', 18)}<span>Tap the planet where the probe should land</span><button type="button" data-act="cancel-aim">Cancel</button></div>
    <button type="button" class="a-gobj glass pe fade gone" data-act="sheet:story"></button>
    <button type="button" class="a-ctx pe fade gone" data-act="study"></button>
    <aside class="a-sheet glass pe fade gone" aria-live="polite"><div class="handle"></div><header><h2></h2><button type="button" class="x" data-act="close" aria-label="Close">${icon('close', 18)}</button></header><div class="body"></div></aside>
    <nav class="a-dock glass pe fade gone">
      <button type="button" class="a-tab" data-act="sheet:worlds">${icon('globe')}<span>Worlds</span></button>
      <button type="button" class="a-tab" data-act="sheet:story">${icon('signal')}<span>Story</span></button>
      <button type="button" class="a-probe" data-act="probe"><span class="orb">${icon('down', 30, 2.2)}</span><span class="lbl">Send probe</span></button>
      <button type="button" class="a-tab" data-act="sheet:planet">${icon('planet')}<span>Planet</span></button>
      <button type="button" class="a-tab" data-act="sheet:menu">${icon('menu')}<span>Menu</span></button>
    </nav>
    <div class="a-arrive glass pe" hidden></div>
    <div class="a-toast glass fade gone"></div>
    <section class="a-title" ${showStart ? '' : 'hidden'}></section>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const el = { world: $('.a-world'), obj: $('.a-obj'), aim: $('.a-aim'), gobj: $('.a-gobj'), ctx: $('.a-ctx'), sheet: $('.a-sheet'), dock: $('.a-dock'),
    probe: $('.a-probe'), arrive: $('.a-arrive'), toast: $('.a-toast'), title: $('.a-title') };
  const show = (e, on) => e.classList.toggle('gone', !on);
  let S = { loading: true };
  let sheet = null;              // worlds, story, planet, menu
  let titleOn = showStart;
  let seenStory = '';            // the story key the reader has seen in the Story sheet
  let arrivalFor = showStart ? null : 'pending';
  let lastSeed = null;

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
          <div class="a-step"><span class="n">${icon('planet', 18)}</span><b>Orbit it</b><span>Drag to spin. Zoom in to find the life.</span></div>
          <div class="a-step"><span class="n">${icon('down', 18)}</span><b>Land on it</b><span>Send the probe, and answer the signals.</span></div>
        </div>
        <div class="a-links"><button type="button" data-act="sheet:menu">${icon('pad', 18)}Controls</button><button type="button" data-act="about">${icon('info', 18)}About</button><button type="button" data-act="sound">${icon(B.music.on ? 'sound' : 'mute', 18)}Sound ${B.music.on ? 'on' : 'off'}</button></div>
      </div>`;
  }
  function leaveTitle() {
    B.loader(true);
    titleOn = false;
    el.title.hidden = true;
    render();
  }

  // ------------------------------------------------------------ sheets
  const facts = (w) => `<div class="a-facts">${w.facts.map((f) => `<div class="a-fact ${f.k === 'star' || f.k === 'moons' || f.k === 'activity' ? 'wide' : ''}"><span class="kick">${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join('')}</div>`;
  const thumb = (src) => (src ? `<img alt="" src="${src}">` : '<span class="ph"></span>');
  function sheetPlanet() {
    const w = B.world();
    const ground = S.mode === 'ground';
    const life = `
      <div class="a-sec kick">Creatures</div>
      <div class="a-chips">${w.fauna.length ? w.fauna.map((f) => `<button type="button" class="a-chip" data-act="fauna:${f.kind}">${icon('paw', 15)}${esc(f.name)}</button>`).join('') : '<span class="a-note">None seen.</span>'}</div>
      <div class="a-sec kick">Plants ${ground ? 'here' : ''}</div>
      ${ground && w.flora.length ? `<div class="a-chips">${w.flora.map((p) => `<button type="button" class="a-chip" data-act="plant:${p.kind}">${icon('leaf', 15)}${esc(p.name)}</button>`).join('')}</div>`
        : `<p class="a-note">${w.gas ? 'A gas giant grows no plants.' : 'Plants live on the ground. Land the probe to study them.'}</p>`}`;
    return `
      <div class="a-head">${thumb(w.thumb)}<div><b>${esc(w.seed)}</b><span class="kick">${esc(w.designation)} · ${esc(w.typeLabel)}</span></div></div>
      ${ground ? life : ''}
      <div class="a-sec kick">Facts</div>${facts(w)}
      ${ground ? '' : life}
      <div class="a-sec"><button type="button" class="a-btn" data-act="share">${icon('share', 16)}Copy a link to ${esc(w.seed)}</button></div>`;
  }
  function sheetStory() {
    const st = B.story();
    if (!st.has) {
      return `<div class="a-tx" style="background:rgba(124,196,255,.06);border-color:rgba(124,196,255,.18)"><span class="kick">${esc(st.objective.kicker)}</span><p style="color:#d5daf0">${esc(st.objective.line)}</p></div>
        <p class="a-note">No signal reaches us from this world. There is no story to follow here — only a world to explore.</p>`;
    }
    const nodeIcon = (s) => (s === 'done' ? icon('check', 16, 2.4) : s === 'open' ? icon('signal', 16) : icon('lock', 15));
    return `
      <div class="a-tx"><span class="kick" style="color:#ffb86b">Received ${esc(st.intro.years)} years ago</span>
        <p>${esc(st.intro.text)}</p>
        <div class="meta mono"><span>BAND ${esc(st.intro.band)}</span><span>CARRIER ${esc(st.intro.ship)}</span><span>CREW ${esc(st.intro.crew)}</span></div></div>
      <div class="a-sec kick">Chapters · ${st.done} of ${st.of} done</div>
      <ol class="a-tl">${st.chapters.map((c) => `
        <li class="${c.state}">
          <span class="node">${nodeIcon(c.state)}</span>
          <span class="kick">Chapter ${c.n}</span>
          <h3>${esc(c.title)}</h3>
          <p class="goal">${esc(c.goal)}</p>
          <div class="st mono"><span>${esc(c.status)}</span>${c.band ? `<span>${esc(c.band)}</span>` : ''}</div>
          ${c.state === 'open' && st.objective.chapter === c.id ? `<p class="goal" style="margin-top:8px;color:#ffd3a1">${icon('arrow', 14)} ${esc(st.objective.line)}</p>` : ''}
          ${c.tune ? `<form class="a-tune" data-form="tune"><input name="f" inputmode="decimal" placeholder="Frequency, MHz" autocomplete="off" aria-label="Frequency in MHz"><button type="submit" class="a-btn primary">Tune</button></form><div class="a-tune-ans"></div>` : ''}
          ${c.actions.length ? `<div class="acts">${c.actions.filter((a) => !(a.orbitOnly && S.mode !== 'orbit')).map((a) => `<button type="button" class="a-chip ${a.id === 'aim' ? 'warm' : ''}" data-act="${a.id}${a.chapter ? ':' + a.chapter : ''}">${esc(a.label)}</button>`).join('')}</div>` : ''}
        </li>`).join('')}</ol>`;
  }
  function sheetWorlds() {
    const ws = B.worlds();
    return `
      <form class="a-form" data-form="go" style="margin:0 0 6px">
        <label class="a-field" style="height:48px"><input name="seed" maxlength="40" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="A new name…" aria-label="A name">
          <button type="button" class="a-icobtn" data-act="dice" title="Roll a random world" style="width:38px;height:38px">${icon('dice', 18)}</button></label>
        <button type="submit" class="a-go" style="height:48px;padding:0 14px">${icon('arrow', 18, 2.2)}</button>
      </form>
      <div class="a-sec kick">${ws.length} ${ws.length === 1 ? 'world' : 'worlds'} charted</div>
      <div class="a-grid">${ws.map((w) => `
        <div class="a-wcard ${w.active ? 'on' : ''}" role="button" tabindex="0" data-act="world:${esc(w.seed)}">
          ${thumb(w.thumb)}<b>${esc(w.seed)}</b><span>${esc(w.typeLabel)}</span>${w.marks ? `<i title="Chapters done">${esc(w.marks)}</i>` : ''}
          <button type="button" class="del" data-act="forget:${esc(w.seed)}" title="Forget this world" aria-label="Forget ${esc(w.seed)}">${icon('close', 12)}</button>
        </div>`).join('')}</div>`;
  }
  function sheetMenu() {
    const row = ([d, t, touch]) => `<tr><td><kbd>${esc(d)}</kbd>${touch ? `<span class="t">${esc(touch)}</span>` : ''}</td><td>${esc(t)}</td></tr>`;
    return `
      <div class="a-sec kick">Sound</div>
      <div class="a-row"><span>Music of this world</span><button type="button" class="a-btn" data-act="sound">${icon(B.music.on ? 'sound' : 'mute', 16)}${B.music.on ? 'On' : 'Off'}</button></div>
      <input class="a-range" type="range" min="0" max="100" value="${Math.round(B.music.vol * 100)}" data-input="vol" aria-label="Volume" ${B.music.on ? '' : 'disabled'}>
      <div class="a-sec kick">Controls · in orbit</div>
      <table class="a-keys">${CONTROLS.orbit.map(row).join('')}</table>
      <div class="a-sec kick">Controls · on the ground</div>
      <table class="a-keys">${CONTROLS.ground.map(row).join('')}</table>
      <div class="a-sec" style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="a-btn" data-act="about">${icon('info', 16)}About My Worlds</button>
        <button type="button" class="a-btn" data-act="title">${icon('star', 16)}Title screen</button>
      </div>`;
  }
  const TITLES = { worlds: 'Your worlds', story: 'Story', planet: 'Planet', menu: 'Menu' };
  function renderSheet() {
    if (!sheet) return;
    const body = el.sheet.querySelector('.body');
    if (body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;   // the reader is typing
    el.sheet.querySelector('h2').textContent = TITLES[sheet];
    const top = body.scrollTop;
    body.innerHTML = sheet === 'planet' ? sheetPlanet() : sheet === 'story' ? sheetStory() : sheet === 'worlds' ? sheetWorlds() : sheetMenu();
    body.scrollTop = top;
    if (sheet === 'story') seenStory = S.storyKey;
  }
  function openSheet(name) {
    sheet = sheet === name ? null : name;
    if (titleOn && sheet) leaveTitle();
    if (sheet) { B.cancelAim(); el.sheet.querySelector('.body').scrollTop = 0; }
    renderSheet();
    render();
  }

  // ------------------------------------------------------------ the arrival
  function renderArrival() {
    const st = B.story();
    const w = B.world();
    let h;
    if (st.has && st.done === 0 && st.chapters[0].fixes.length === 0) {
      h = `<div class="kick"><i></i>Incoming record · ${esc(st.intro.years)} years old</div>
        <h2>Distress signal from ${esc(w.designation)}</h2>
        <p>${esc(st.intro.text)}</p>
        <div class="meta mono"><span>BAND <b>${esc(st.intro.band)}</b></span><span>CARRIER <b>${esc(st.intro.ship)}</b></span><span>CREW <b>${esc(st.intro.crew)}</b></span></div>
        <div class="acts"><button type="button" class="a-btn primary" data-act="arrive-ok">${icon('signal', 16)}Start the search</button><button type="button" class="a-btn" data-act="arrive-close">Later</button></div>`;
    } else if (st.has) {
      h = `<div class="kick" style="color:#7cc4ff">Welcome back · ${st.done} of ${st.of} chapters done</div>
        <h2>${esc(w.seed)}</h2><p><b style="font-weight:500">${esc(st.objective.title)}.</b> ${esc(st.objective.line)}</p>
        <div class="acts"><button type="button" class="a-btn primary" data-act="arrive-close">Continue</button><button type="button" class="a-btn" data-act="arrive-story">Open the story</button></div>`;
    } else {
      h = `<div class="kick" style="color:#7cc4ff">${esc(st.objective.kicker)} · ${esc(w.designation)}</div>
        <h2>${esc(w.seed)} · ${esc(w.typeLabel)}</h2><p>${esc(st.objective.line)}</p>
        <div class="acts"><button type="button" class="a-btn primary" data-act="arrive-close">Explore</button></div>`;
    }
    el.arrive.innerHTML = h;
    el.arrive.hidden = false;
  }

  // ------------------------------------------------------------ the frame
  function render() {
    const s = S;
    const ready = !s.loading && !s.busy;
    const quiet = titleOn || !ready || s.dive || s.card || s.dialog || s.mode === 'descending' || s.mode === 'ascending';
    const ground = s.mode === 'ground';
    if (!titleOn && ready && arrivalFor === 'pending') {
      arrivalFor = s.seed;
      setTimeout(() => { if (arrivalFor === s.seed && !S.busy && !titleOn) { renderArrival(); render(); } }, 900);
    }
    const arriving = !el.arrive.hidden;
    if (arriving && (s.card || s.dialog || titleOn)) el.arrive.hidden = true;

    show(el.dock, !quiet);
    show(el.world, !quiet && !ground && !s.aiming);
    const st = ready ? B.story() : null;
    // the dock
    const p = el.probe;
    p.className = 'a-probe';
    let lbl = 'Send probe', ic = 'down';
    if (s.gas) { p.classList.add('off'); lbl = 'No surface'; ic = 'lock'; }
    else if (s.aiming) { p.classList.add('aim'); lbl = 'Cancel'; ic = 'close'; }
    else if (ground) { p.classList.add('recall'); lbl = 'Recall probe'; ic = 'up'; }
    else if (s.mode !== 'orbit') { p.classList.add('off', 'busy'); lbl = s.mode === 'descending' ? 'Landing…' : 'Climbing…'; }
    p.querySelector('.lbl').textContent = lbl;
    p.querySelector('.orb').innerHTML = icon(ic, 30, 2.2);
    root.querySelectorAll('.a-tab').forEach((t) => t.classList.toggle('on', t.dataset.act === `sheet:${sheet}`));
    const storyTab = root.querySelector('[data-act="sheet:story"].a-tab');
    const badge = st && st.has && s.storyKey !== seenStory && sheet !== 'story';
    let b = storyTab.querySelector('.badge');
    if (badge && !b) storyTab.insertAdjacentHTML('beforeend', '<i class="badge"></i>');
    if (!badge && b) b.remove();
    // the objective
    if (st && !quiet) {
      const o = st.objective;
      const bar = st.has ? `<div class="bar">${st.chapters.map((c) => `<i class="${c.state === 'done' ? 'on' : c.state === 'open' ? 'open' : ''}"></i>`).join('')}</div>` : '';
      el.obj.innerHTML = `<span class="dot">${icon(st.has ? 'signal' : s.gas ? 'wave' : 'star', 18)}</span><span><span class="kick">${esc(o.kicker)}</span><b>${esc(o.title)}</b><p>${esc(o.line)}</p>${bar}</span>`;
      el.gobj.innerHTML = `${icon('signal', 15)}<span>${esc(o.line)}</span>`;
    }
    const phone = innerWidth <= 760;
    show(el.obj, !quiet && !ground && !s.aiming && !(sheet && !phone) && !(phone && sheet) && !arriving);
    show(el.gobj, !quiet && ground && !sheet && !!(st && st.has));
    show(el.aim, !quiet && s.aiming);
    // the context action
    if (s.ctx) el.ctx.innerHTML = `${icon('target', 18, 2)}<span>${esc(s.ctx)}</span>${icon('arrow', 16, 2.2)}`;
    show(el.ctx, !quiet && ground && !!s.ctx && !sheet);
    // the sheet
    show(el.sheet, !!sheet && !quiet);
    el.world.innerHTML = ready ? (() => { const w = B.world(); return `${thumb(w.thumb)}<span style="min-width:0"><b>${esc(w.seed)}</b><span>${esc(w.typeLabel)} · ${esc(w.designation)}</span></span>`; })() : '';
    // room for the dock under the probe overlay
    const dockTop = phone ? 70 + 8 : 18 + 74 + 14;
    B.hudInsets({ top: phone ? 60 : 22, bottom: dockTop + 40, left: phone ? 12 : 22, right: phone ? 12 : 22 });
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
    if (!B.go(name)) return;
    S = { ...S, busy: true };
    sheet = null;
    el.arrive.hidden = true;
    arrivalFor = 'pending';
    if (titleOn) leaveTitle();
    renderSheet(); render();
  }
  function toast(t) {
    el.toast.textContent = t;
    show(el.toast, true);
    clearTimeout(toast.t);
    toast.t = setTimeout(() => show(el.toast, false), 1600);
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    const [act, arg] = t.dataset.act.split(/:(.*)/s);
    e.preventDefault();
    if (act === 'sheet') openSheet(arg);
    else if (act === 'close') openSheet(sheet);
    else if (act === 'probe') {
      if (S.gas || (S.mode !== 'orbit' && S.mode !== 'ground')) return;
      sheet = null; el.arrive.hidden = true; renderSheet();
      B.probe();
    }
    else if (act === 'cancel-aim') B.cancelAim();
    else if (act === 'study') B.study();
    else if (act === 'dice') {
      const input = t.closest('form').querySelector('input');
      t.classList.add('spin'); setTimeout(() => t.classList.remove('spin'), 500);
      scramble(input, B.randomName(), () => go(input.value));
    }
    else if (act === 'world') { if (e.target.closest('.del')) return; go(arg); }
    else if (act === 'forget') { e.stopPropagation(); B.forget(arg); renderSheet(); }
    else if (act === 'fauna') B.inspect(+arg);
    else if (act === 'plant') B.inspectPlant(+arg);
    else if (act === 'brief') B.brief();
    else if (act === 'lost') B.lost();
    else if (act === 'clear') { B.clear(); setTimeout(renderSheet, 60); }
    else if (act === 'aim') { openSheet(sheet); B.aimAt(arg); }
    else if (act === 'about') B.about();
    else if (act === 'share') B.share().then((ok) => toast(ok ? 'Link copied' : B.shareUrl()));
    else if (act === 'sound') { B.music.toggle(); setTimeout(() => { if (titleOn) renderTitle(); renderSheet(); }, 30); }
    else if (act === 'title') { B.loader(false); sheet = null; titleOn = true; renderTitle(); el.title.hidden = false; render(); }
    else if (act === 'arrive-ok') { el.arrive.hidden = true; render(); }
    else if (act === 'arrive-close') { el.arrive.hidden = true; render(); }
    else if (act === 'arrive-story') { el.arrive.hidden = true; openSheet('story'); }
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
      if (a.kind === 'lock') { f.querySelector('input').blur(); setTimeout(renderSheet, 900); }
    }
  });
  root.addEventListener('input', (e) => { if (e.target.dataset.input === 'vol') B.music.set(e.target.value / 100); });
  const esc2 = (e) => {
    if (e.key !== 'Escape') return;
    if (sheet) { openSheet(sheet); }
    else if (!el.arrive.hidden) { el.arrive.hidden = true; render(); }
  };
  addEventListener('keydown', esc2);
  B.onFrameKey(esc2);
  addEventListener('resize', render);

  B.ready.then(() => {
    // a tap on the planet on a phone puts the sheet away, so the planet is the reader's again
    B.doc.addEventListener('pointerdown', () => { if (sheet && innerWidth <= 760) { sheet = null; render(); } }, true);
    if (titleOn) renderTitle();
  });
  B.subscribe((s) => {
    const seedChanged = s.seed && s.seed !== lastSeed;
    if (seedChanged && lastSeed !== null && arrivalFor !== 'pending') arrivalFor = 'pending';
    if (s.seed) lastSeed = s.seed;
    S = s;
    if (s.aiming && sheet) sheet = null;
    renderSheet();
    render();
  });
  if (titleOn) { B.loader(false); renderTitle(); }
}
