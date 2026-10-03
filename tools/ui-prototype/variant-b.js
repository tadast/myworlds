// PROTOTYPE — concept B, "Field journal". A narrative spine: the screen holds the objective, the
// journal, and one call to action. Everything else lives in the journal. See NOTES.md.
import { icon } from './icons.js';
import { esc, CONTROLS } from './bridge.js';

export const meta = {
  name: 'Field journal',
  map: `
  <h3>B — Field journal</h3>
  <p>Story first. The planet gets the screen; the chrome is three things: the objective, the journal, and one call to action that is always the next move. Everything else is a page of the journal.</p>
  <h4>Topology</h4>
  <pre>Prologue ──name──▶ Chapter card ──Begin──▶ Planet
   (headline answers the name)              │
                                            ├─ Objective (top left) ─┐
                                            ├─ Journal (top right) ──┴▶ Journal
                                            │                          ├ I   Log      (story, actions)
                                            │                          ├ II  Atlas    (facts)
                                            │                          ├ III Life     (creatures, plants)
                                            │                          ├ IV  Worlds   (switch, new)
                                            │                          └ V   Settings (sound, controls)
                                            └─ CTA (bottom right / bottom bar): Send ▸ Choose ▸ Return</pre>
  <h4>Hierarchy</h4>
  <ol>
    <li><b>The next move</b> — one gold button: Send the probe, Return to orbit.</li>
    <li><b>Why</b> — the objective card says the next step of the story in one line.</li>
    <li><b>Everything else</b> — one tap away, in the journal, never on the planet.</li>
  </ol>
  <h4>Trade-off</h4>
  <p>Most cinematic and the strongest story. Facts and worlds cost one more tap, and the journal is a big full-screen context switch.</p>`,
};

const CSS = `
.B { position: absolute; inset: 0; color: #f4ead9; font-family: Fredoka, ui-rounded, system-ui, sans-serif;
  --serif: Fraunces, 'Iowan Old Style', Georgia, serif; --gold: #e9b872; --gold2: #d08b3d; --muted: #b0a796; --line: rgba(244,234,217,.14);
  --ink: rgba(9, 11, 22, .78); --safe-b: env(safe-area-inset-bottom); --safe-t: env(safe-area-inset-top); }
.B * { box-sizing: border-box; }
.B [hidden] { display: none !important; }
.B button { font: inherit; color: inherit; }
.B .pe { pointer-events: auto; }
.B .fade { transition: opacity .5s ease, transform .5s ease; }
.B .gone { opacity: 0 !important; pointer-events: none !important; }
.B .sc { font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: var(--muted); font-weight: 500; }
.B .serif { font-family: var(--serif); }
.B .ink { background: var(--ink); border: 1px solid var(--line); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }

/* ---------- prologue */
.b-pro { position: absolute; inset: 0; pointer-events: auto; display: grid; place-items: center; text-align: center; padding: 24px;
  background: radial-gradient(ellipse at 50% 42%, rgba(7,9,20,.55) 0%, rgba(7,9,20,.86) 55%, rgba(5,6,14,.98) 100%); animation: b-fadein 1.2s ease; }
@keyframes b-fadein { from { opacity: 0; } }
.b-pro .col { width: min(760px, 100%); display: flex; flex-direction: column; align-items: center; gap: 22px; }
.b-pro h1 { text-wrap: balance; margin: 0; font-family: var(--serif); font-weight: 300; font-style: italic; font-size: clamp(40px, 7.4vw, 92px); line-height: 1.02; letter-spacing: -.02em; min-height: 2.04em;
  display: flex; align-items: center; justify-content: center; }
.b-pro h1 .nm { font-style: normal; font-weight: 500; color: var(--gold); }
.b-pro .lede { margin: 0; font-family: var(--serif); font-size: clamp(17px, 2vw, 21px); color: #d9cfbf; line-height: 1.5; max-width: 560px; font-weight: 300; }
.b-line { position: relative; width: min(460px, 100%); display: flex; align-items: center; border-bottom: 1.5px solid rgba(244,234,217,.35); transition: border-color .3s; }
.b-line:focus-within { border-color: var(--gold); }
.b-line input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; color: #fff; font: 400 26px var(--serif); padding: 10px 4px; text-align: center; }
.b-line input::placeholder { color: rgba(244,234,217,.35); font-style: italic; }
.b-line button { position: absolute; right: 0; width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--gold); color: #1f1407 !important; cursor: pointer; display: grid; place-items: center;
  opacity: 0; transform: scale(.8); transition: .25s; }
.b-line.has button { opacity: 1; transform: none; }
.b-stars { all: unset; cursor: pointer; font-family: var(--serif); font-style: italic; color: var(--muted); font-size: 17px; display: inline-flex; align-items: center; gap: 8px; }
.b-stars:hover { color: var(--gold); }
.b-cont { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.b-cont button { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: rgba(244,234,217,.04); border-radius: 999px; padding: 5px 14px 5px 5px; cursor: pointer; font-size: 14px; }
.b-cont button:hover { border-color: var(--gold); }
.b-cont img { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; background: #222; }
.b-cont i { font-style: normal; color: var(--gold); font-size: 11px; }
.b-foot { position: absolute; left: 0; right: 0; bottom: calc(18px + var(--safe-b)); display: flex; justify-content: center; gap: 26px; font-size: 14px; color: var(--muted); }
.b-foot button { all: unset; cursor: pointer; }
.b-foot button:hover { color: #fff; }

/* ---------- the chapter card */
.b-chap { position: absolute; inset: 0; pointer-events: auto; display: grid; place-items: center; padding: 24px;
  background: radial-gradient(ellipse at 50% 50%, rgba(6,8,18,.72) 0%, rgba(6,8,18,.9) 70%); animation: b-fadein .9s ease; text-align: center; }
.b-chap .col { width: min(600px, 100%); display: flex; flex-direction: column; align-items: center; gap: 14px; }
.b-chap h1 { margin: 0; font-family: var(--serif); font-weight: 400; font-size: clamp(46px, 8vw, 88px); line-height: 1; letter-spacing: -.02em; animation: b-rise 1.2s cubic-bezier(.2,.8,.2,1); }
@keyframes b-rise { from { opacity: 0; transform: translateY(14px); letter-spacing: .04em; } }
.b-rule { width: 60px; height: 1px; background: var(--gold); margin: 6px 0; }
.b-chap h2 { margin: 0; font-family: var(--serif); font-style: italic; font-weight: 400; font-size: clamp(22px, 3vw, 30px); color: var(--gold); }
.b-chap p { margin: 0; font-family: var(--serif); font-size: clamp(16px, 2vw, 19px); line-height: 1.6; color: #e2d8c7; font-weight: 300; animation: b-fadein 2s ease; }
.b-chap .acts { display: flex; gap: 18px; align-items: center; margin-top: 12px; flex-wrap: wrap; justify-content: center; }
.b-btn { border: 0; border-radius: 999px; padding: 14px 26px; cursor: pointer; font-weight: 500; font-size: 16px; background: linear-gradient(180deg, #f6d29b, var(--gold)); color: #24170a !important;
  display: inline-flex; align-items: center; gap: 10px; box-shadow: 0 10px 34px rgba(233,184,114,.25); }
.b-btn:hover { filter: brightness(1.06); }
.b-link { all: unset; cursor: pointer; color: var(--muted); font-size: 15px; display: inline-flex; align-items: center; gap: 6px; }
.b-link:hover { color: #fff; }

/* ---------- on the planet */
.b-obj { position: absolute; left: 20px; top: calc(20px + var(--safe-t)); width: 330px; border-radius: 20px; padding: 14px 16px 14px; cursor: pointer; text-align: left; }
.b-obj .t { font-family: var(--serif); font-style: italic; font-size: 22px; margin: 4px 0 4px; line-height: 1.15; }
.b-obj p { margin: 0; font-size: 14px; line-height: 1.4; color: #ddd3c2; }
.b-obj .dots { display: flex; gap: 6px; margin-top: 10px; align-items: center; }
.b-obj .dots i { width: 7px; height: 7px; border-radius: 50%; border: 1px solid var(--gold); }
.b-obj .dots i.on { background: var(--gold); }
.b-obj .dots span { margin-left: 4px; font-size: 11px; color: var(--muted); }
.b-obj.ground { top: auto; bottom: calc(22px + var(--safe-b)); }
.b-jbtn { position: absolute; right: 20px; top: calc(20px + var(--safe-t)); height: 48px; border-radius: 999px; padding: 0 18px 0 14px; display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 15px; }
.b-jbtn .badge { position: absolute; top: 6px; left: 30px; width: 9px; height: 9px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 0 3px rgba(9,11,22,.9); }
.b-name { position: absolute; left: 22px; bottom: calc(24px + var(--safe-b)); font-family: var(--serif); }
.b-name b { display: block; font-weight: 400; font-size: 30px; line-height: 1; }
.b-name span { font-style: italic; color: var(--muted); font-size: 15px; }
.b-cta { position: absolute; right: 22px; bottom: calc(22px + var(--safe-b)); height: 64px; border-radius: 999px; padding: 0 26px 0 10px; border: 0; cursor: pointer;
  display: flex; align-items: center; gap: 14px; text-align: left; background: linear-gradient(180deg, #f8d7a4, var(--gold) 60%, #dc9a4f); color: #23160a !important;
  box-shadow: 0 14px 44px rgba(233,160,80,.32), inset 0 1px 0 rgba(255,255,255,.5); transition: transform .15s, filter .2s; }
.b-cta:hover { filter: brightness(1.05); }
.b-cta:active { transform: scale(.98); }
.b-cta .c { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: rgba(35,22,10,.12); }
.b-cta b { display: block; font-weight: 600; font-size: 18px; line-height: 1.1; }
.b-cta small { display: block; font-size: 12.5px; opacity: .72; }
.b-cta.ghost { background: rgba(9,11,22,.6); color: #f4ead9 !important; border: 1px solid rgba(244,234,217,.35); box-shadow: none; backdrop-filter: blur(12px); }
.b-cta.ghost .c { background: rgba(244,234,217,.08); }
.b-cta.off { background: rgba(9,11,22,.55); color: var(--muted) !important; box-shadow: none; cursor: default; border: 1px solid var(--line); }
.b-ctx { position: absolute; right: 22px; bottom: calc(100px + var(--safe-b)); border-radius: 999px; padding: 11px 18px 11px 14px; cursor: pointer; display: flex; align-items: center; gap: 8px;
  font-size: 15px; border: 1px solid rgba(244,234,217,.45); background: rgba(9,11,22,.55); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); animation: b-pop .35s cubic-bezier(.2,.8,.2,1); }
@keyframes b-pop { from { transform: translateY(8px); opacity: 0; } }
.b-ctx:hover { border-color: var(--gold); }
.b-aimhint { position: absolute; left: 50%; top: calc(64px + var(--safe-t)); transform: translateX(-50%); text-align: center; text-shadow: 0 2px 18px rgba(0,0,0,.8); pointer-events: none; }
.b-aimhint b { display: block; font-family: var(--serif); font-style: italic; font-weight: 400; font-size: 34px; }
.b-aimhint span { color: #ddd3c2; font-size: 15px; }
.b-toast { position: absolute; left: 50%; bottom: calc(110px + var(--safe-b)); transform: translateX(-50%); padding: 10px 18px; border-radius: 999px; font-size: 14px; }

/* ---------- the journal */
.b-jr { position: absolute; inset: 0; pointer-events: auto; background: rgba(5,6,14,.72); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: grid; place-items: center; animation: b-fadein .35s ease; }
.b-book { position: relative; width: min(1100px, calc(100% - 48px)); height: min(780px, calc(100% - 48px)); border-radius: 26px; overflow: hidden; display: grid; grid-template-columns: 250px 1fr;
  background: linear-gradient(180deg, #121426, #0c0e1c); border: 1px solid var(--line); box-shadow: 0 40px 120px rgba(0,0,0,.6); animation: b-open .45s cubic-bezier(.2,.8,.2,1); }
@keyframes b-open { from { transform: translateY(16px) scale(.985); opacity: 0; } }
.b-book::after { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .5; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.25'/%3E%3C/svg%3E"); }
.b-nav { border-right: 1px solid var(--line); padding: 26px 18px; display: flex; flex-direction: column; gap: 4px; background: rgba(244,234,217,.02); }
.b-nav .who { display: flex; align-items: center; gap: 10px; margin: 0 6px 22px; }
.b-nav .who img, .b-nav .who .ph { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; background: radial-gradient(circle at 35% 30%, #5b86c8, #13213f); }
.b-nav .who b { display: block; font-family: var(--serif); font-weight: 400; font-size: 21px; line-height: 1.1; }
.b-nav .who span { font-size: 12px; color: var(--muted); }
.b-tab { all: unset; cursor: pointer; display: flex; align-items: baseline; gap: 12px; padding: 10px 12px; border-radius: 12px; font-family: var(--serif); font-size: 19px; color: #cfc5b4; }
.b-tab i { font-style: normal; font-size: 12px; color: var(--muted); width: 22px; font-family: var(--serif); }
.b-tab:hover { background: rgba(244,234,217,.05); color: #fff; }
.b-tab.on { background: rgba(233,184,114,.12); color: var(--gold); }
.b-tab.on i { color: var(--gold); }
.b-nav .spacer { flex: 1; }
.b-close { position: absolute; right: 16px; top: 16px; z-index: 2; height: 40px; border-radius: 999px; border: 1px solid var(--line); background: rgba(9,11,22,.6); padding: 0 14px 0 10px; display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px; color: #ddd3c2 !important; }
.b-page { overflow: auto; padding: 44px 56px 56px; overscroll-behavior: contain; }
.b-page h2 { margin: 0 0 6px; font-family: var(--serif); font-weight: 400; font-size: 44px; letter-spacing: -.01em; line-height: 1.05; }
.b-page h2 em { color: var(--gold); }
.b-page .sub { font-family: var(--serif); font-style: italic; color: var(--muted); font-size: 18px; margin: 0 0 26px; }
.b-prose { font-family: var(--serif); font-weight: 300; font-size: 19px; line-height: 1.65; color: #e6dccb; max-width: 640px; margin: 0 0 28px; }
.b-prose::first-letter { float: left; font-size: 3.4em; line-height: .86; padding: 6px 10px 0 0; color: var(--gold); font-weight: 400; }
.b-entry { position: relative; display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 6px 18px; padding: 22px 0; border-top: 1px solid var(--line); max-width: 680px; }
.b-entry .num { font-family: var(--serif); font-size: 34px; color: var(--muted); line-height: 1; padding-top: 2px; }
.b-entry.open .num { color: var(--gold); }
.b-entry.closed { opacity: .5; }
.b-entry h3 { margin: 0 0 4px; font-family: var(--serif); font-style: italic; font-weight: 400; font-size: 26px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.b-tag { font-family: Fredoka, sans-serif; font-style: normal; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; padding: 4px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
.b-tag.open { border-color: rgba(233,184,114,.5); color: var(--gold); }
.b-tag.done { border-color: rgba(160,220,180,.4); color: #a8dfb8; }
.b-entry p { margin: 0; font-size: 15.5px; line-height: 1.5; color: #d6ccbb; }
.b-entry .next { margin-top: 10px; color: var(--gold); font-family: var(--serif); font-style: italic; font-size: 18px; }
.b-entry .fixes { margin-top: 10px; display: flex; flex-direction: column; gap: 3px; font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
.b-entry .acts { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px 20px; }
.b-act { all: unset; cursor: pointer; color: #f0e2c9; border-bottom: 1px solid rgba(233,184,114,.45); font-size: 15px; padding-bottom: 1px; }
.b-act:hover { color: var(--gold); border-color: var(--gold); }
.b-tune { display: flex; align-items: center; gap: 10px; margin-top: 14px; max-width: 360px; border-bottom: 1.5px solid rgba(233,184,114,.5); }
.b-tune input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; color: #fff; font: 22px var(--serif); padding: 6px 0; letter-spacing: .06em; }
.b-tune input::placeholder { color: rgba(244,234,217,.3); font-style: italic; letter-spacing: 0; }
.b-tune span { color: var(--muted); }
.b-tune button { border: 0; background: none; color: var(--gold) !important; cursor: pointer; font-size: 15px; font-weight: 500; }
.b-tune-ans { margin-top: 8px; font-family: var(--serif); font-style: italic; color: var(--muted); min-height: 1.2em; }
.b-tune-ans[data-kind="near"] { color: var(--gold); }
.b-tune-ans[data-kind="lock"] { color: #a8dfb8; }
.b-specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border-top: 1px solid var(--line); max-width: 760px; }
.b-spec { padding: 18px 18px 18px 0; border-bottom: 1px solid var(--line); min-width: 0; }
.b-spec b { display: block; font-family: var(--serif); font-weight: 400; font-size: 26px; line-height: 1.15; }
.b-spec.wide { grid-column: span 3; }
.b-spec.wide b { font-size: 20px; }
.b-list { list-style: none; margin: 0; padding: 0; max-width: 680px; border-top: 1px solid var(--line); }
.b-list li { display: flex; align-items: center; gap: 16px; padding: 14px 4px; border-bottom: 1px solid var(--line); cursor: pointer; }
.b-list li:hover { background: rgba(244,234,217,.03); }
.b-list .ix { font-family: var(--serif); color: var(--muted); width: 26px; font-size: 15px; }
.b-list .nm { flex: 1; min-width: 0; font-family: var(--serif); font-size: 21px; }
.b-list .nm small { display: block; font-family: Fredoka, sans-serif; font-size: 12.5px; color: var(--muted); margin-top: 2px; }
.b-list .go { color: var(--gold); font-size: 14px; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.b-list img, .b-list .ph { width: 54px; height: 54px; border-radius: 50%; object-fit: cover; background: radial-gradient(circle at 35% 30%, #5b86c8, #13213f); flex: none; }
.b-list li.on .nm { color: var(--gold); }
.b-list .del { all: unset; cursor: pointer; color: var(--muted); padding: 6px; border-radius: 8px; }
.b-list .del:hover { color: #fff; background: rgba(255,255,255,.06); }
.b-h { font-family: var(--serif); font-style: italic; font-size: 24px; font-weight: 400; margin: 34px 0 12px; }
.b-note { font-family: var(--serif); font-style: italic; color: var(--muted); font-size: 17px; }
.b-keys { border-collapse: collapse; width: 100%; max-width: 620px; font-size: 15px; }
.b-keys td { padding: 9px 0; border-bottom: 1px solid var(--line); }
.b-keys td:first-child { width: 40%; color: var(--gold); font-family: var(--serif); }
.b-keys small { display: block; color: var(--muted); font-size: 12px; font-family: Fredoka, sans-serif; }
.b-new { display: flex; align-items: center; gap: 16px; max-width: 680px; margin-bottom: 8px; flex-wrap: wrap; }
.b-new .b-line { width: 320px; }
.b-new .b-line input { text-align: left; font-size: 22px; }

@media (max-width: 760px) {
  .b-pro .col { gap: 18px; }
  .b-pro h1 { min-height: 2.1em; }
  .b-line input { font-size: 22px; }
  .b-foot { gap: 18px; font-size: 13px; }
  .b-obj { left: 12px; right: 76px; width: auto; top: calc(12px + var(--safe-t)); padding: 10px 14px; border-radius: 16px; }
  .b-obj .t { font-size: 18px; margin: 2px 0; }
  .b-obj p { font-size: 13px; }
  .b-obj .sc, .b-obj .dots { display: none; }
  .b-obj.ground { display: none; }
  .b-jbtn { right: 12px; top: calc(12px + var(--safe-t)); width: 52px; height: 52px; padding: 0; justify-content: center; }
  .b-jbtn span { display: none; }
  .b-jbtn .badge { left: auto; right: 8px; top: 8px; }
  .b-name { display: none; }
  .b-cta { left: 14px; right: 14px; bottom: calc(14px + var(--safe-b)); justify-content: center; padding: 0 22px; }
  .b-cta .c { position: absolute; left: 10px; }
  .b-cta > span:last-child { text-align: center; }
  .b-ctx { left: 50%; right: auto; transform: translateX(-50%); bottom: calc(90px + var(--safe-b)); white-space: nowrap; max-width: calc(100vw - 28px); }
  .b-ctx { animation: none; }
  .b-aimhint b { font-size: 26px; }
  .b-book { width: 100%; height: 100%; border-radius: 0; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; border: 0; }
  .b-nav { flex-direction: row; overflow-x: auto; padding: calc(12px + var(--safe-t)) 12px 10px; gap: 2px; border-right: 0; border-bottom: 1px solid var(--line); scrollbar-width: none; }
  .b-nav .who, .b-nav .spacer { display: none; }
  .b-tab { font-size: 16px; padding: 8px 12px; white-space: nowrap; }
  .b-tab i { width: auto; }
  .b-close { top: calc(10px + var(--safe-t)); right: 10px; width: 40px; padding: 0; justify-content: center; }
  .b-close span { display: none; }
  .b-nav { padding-right: 60px; }
  .b-page { padding: 24px 20px calc(40px + var(--safe-b)); }
  .b-page h2 { font-size: 34px; }
  .b-prose { font-size: 17px; }
  .b-entry { grid-template-columns: 40px minmax(0, 1fr); }
  .b-entry .num { font-size: 26px; }
  .b-entry h3 { font-size: 22px; }
  .b-specs { grid-template-columns: 1fr 1fr; }
  .b-spec.wide { grid-column: span 2; }
  .b-spec b { font-size: 22px; }
}
`;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const WORDN = ['', 'one', 'two', 'three'];

export function mount(root, B, { showStart }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  root.innerHTML = `
  <div class="B">
    <button type="button" class="b-obj ink pe fade gone" data-act="journal:log"></button>
    <button type="button" class="b-jbtn ink pe fade gone" data-act="journal:log">${icon('book', 20)}<span>Journal</span></button>
    <div class="b-name fade gone"></div>
    <div class="b-aimhint fade gone"><b>Choose where to land.</b><span>Tap the planet. Drag to turn it first.</span></div>
    <button type="button" class="b-ctx pe fade gone" data-act="study"></button>
    <button type="button" class="b-cta pe fade gone" data-act="cta"></button>
    <div class="b-toast ink fade gone"></div>
    <section class="b-chap" hidden></section>
    <section class="b-jr" hidden></section>
    <section class="b-pro" ${showStart ? '' : 'hidden'}></section>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const el = { obj: $('.b-obj'), jbtn: $('.b-jbtn'), name: $('.b-name'), aim: $('.b-aimhint'), ctx: $('.b-ctx'), cta: $('.b-cta'), toast: $('.b-toast'),
    chap: $('.b-chap'), jr: $('.b-jr'), pro: $('.b-pro') };
  const show = (e, on) => e.classList.toggle('gone', !on);
  let S = { loading: true };
  let proOn = showStart;
  let page = null;            // the open page of the journal, or null
  let chapFor = showStart ? null : 'pending';
  let seenStory = '';
  let lastSeed = null;

  // ------------------------------------------------------------ prologue
  function renderPro() {
    const ws = B.worlds().slice(0, 3);
    el.pro.innerHTML = `
      <div class="col">
        <span class="sc">✦ My Worlds</span>
        <h1 class="b-head">Every name hides a planet.</h1>
        <p class="lede">Speak a name, and a world answers: a star, a sky, a sea, and the creatures under them. The same name always finds the same world.</p>
        <form class="b-line" data-form="go"><input name="seed" maxlength="40" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="a name, a word…" aria-label="A name"><button type="submit" aria-label="Find it">${icon('arrow', 20, 2.2)}</button></form>
        <button type="button" class="b-stars" data-act="stars">${icon('spark', 18)}or let the stars choose</button>
        ${ws.length ? `<div class="b-cont">${ws.map((w) => `<button type="button" data-act="world:${esc(w.seed)}">${w.thumb ? `<img alt="" src="${w.thumb}">` : '<img alt="">'}${esc(w.seed)}${w.marks ? ` <i>${esc(w.marks)}</i>` : ''}</button>`).join('')}</div>` : ''}
      </div>
      <div class="b-foot"><button type="button" data-act="journal:settings">How to explore</button><button type="button" data-act="about">About</button><button type="button" data-act="sound">Sound ${B.music.on ? 'on' : 'off'}</button></div>`;
  }
  function headline(name) {
    const h = el.pro.querySelector('.b-head');
    if (!h) return;
    name = name.trim();
    h.innerHTML = name ? `<span><span class="nm">${esc(name)}</span> hides a planet.</span>` : 'Every name hides a planet.';
    el.pro.querySelector('.b-line').classList.toggle('has', !!name);
  }

  // ------------------------------------------------------------ the chapter card
  function renderChap() {
    const w = B.world(), st = B.story();
    let kick = `${esc(w.designation)} · ${esc(w.typeLabel)}`, title, h2, p, go = 'Begin';
    if (st.has) {
      const o = st.objective;
      const cur = st.chapters.find((c) => c.state === 'open');
      const n = cur ? cur.n : st.of;
      if (st.done === 0 && st.chapters[0].fixes.length === 0) {
        title = `Chapter ${WORDN[1]}`; h2 = 'The distress signal'; p = st.intro.text;
      } else {
        title = cur ? `Chapter ${WORDN[n]}` : 'The end'; h2 = o.title; p = `Welcome back to ${w.seed}. ${o.line}`; go = 'Continue';
      }
    } else {
      title = 'Uncharted'; h2 = w.gas ? 'A world of storms' : 'First light'; p = w.gas ? 'There is no ground to land on. Watch the storms turn, and zoom in to find what swims in this sky.' : 'No record holds this world. Nobody has walked here. Send the probe down and meet whatever lives here.'; go = 'Explore';
    }
    el.chap.innerHTML = `<div class="col">
      <span class="sc">${kick}</span>
      <h1>${esc(w.seed)}</h1>
      <div class="b-rule"></div>
      <span class="sc" style="color:#e9b872">${esc(title)}</span>
      <h2>${esc(h2)}</h2>
      <p>${esc(p)}</p>
      <div class="acts"><button type="button" class="b-btn" data-act="chap-ok">${esc(go)}${icon('arrow', 18, 2.2)}</button>${st.has ? '<button type="button" class="b-link" data-act="journal:log">Open the journal</button>' : ''}</div>
    </div>`;
    el.chap.hidden = false;
  }

  // ------------------------------------------------------------ the journal
  const PAGES = [['log', 'Log'], ['atlas', 'Atlas'], ['life', 'Life'], ['worlds', 'Worlds'], ['settings', 'Settings']];
  const thumb = (src) => (src ? `<img alt="" src="${src}">` : '<span class="ph"></span>');
  function pageLog() {
    const st = B.story(), w = B.world();
    if (!st.has) return `<h2>The log of <em>${esc(w.seed)}</em></h2><p class="sub">${esc(st.objective.kicker)}</p>
      <p class="b-prose">${esc(w.gas ? 'A world of gas and storm. There is no ground to land on, and no signal reaches us from here. Watch it turn.' : 'No signal reaches us from this world, and no record names it. Nobody has walked here. The pages of this log are yours to fill: send the probe down and see what lives here.')}</p>`;
    const tag = (s) => `<span class="b-tag ${s}">${s === 'done' ? 'Done' : s === 'open' ? 'Now' : 'Locked'}</span>`;
    return `<h2>The log of <em>${esc(w.seed)}</em></h2>
      <p class="sub">${st.done} of ${st.of} chapters · ${esc(w.designation)}</p>
      <p class="b-prose">${esc(st.intro.text)}</p>
      ${st.chapters.map((c) => `
      <div class="b-entry ${c.state}">
        <div class="num">${ROMAN[c.n]}</div>
        <div>
          <h3>${c.locked ? 'Locked' : `${esc(c.title)} ${tag(c.state)}`}</h3>
          <p>${esc(c.goal)} <span style="color:#b0a796">${esc(c.status)}${c.band ? ' · ' + esc(c.band) : ''}</span></p>
          ${c.state === 'open' && st.objective.chapter === c.id ? `<div class="next">→ ${esc(st.objective.line)}</div>` : ''}
          ${c.fixes.length ? `<div class="fixes">${c.fixes.map((f, i) => `<span>Landing ${i + 1} · bearing ${String(Math.round(f.brg) % 360).padStart(3, '0')}° ± ${Math.round(f.err)}° · ${Math.abs(f.lat).toFixed(1)}° ${f.lat < 0 ? 'S' : 'N'}, ${Math.abs(f.lon).toFixed(1)}° ${f.lon < 0 ? 'W' : 'E'}</span>`).join('')}</div>` : ''}
          ${c.tune ? `<form class="b-tune" data-form="tune"><input name="f" inputmode="decimal" autocomplete="off" placeholder="the frequency" aria-label="Frequency in MHz"><span>MHz</span><button type="submit">Tune</button></form><div class="b-tune-ans"></div>` : ''}
          ${c.actions.length ? `<div class="acts">${c.actions.filter((a) => !(a.orbitOnly && S.mode !== 'orbit')).map((a) => `<button type="button" class="b-act" data-act="${a.id}${a.chapter ? ':' + a.chapter : ''}">${esc(a.label)}</button>`).join('')}</div>` : ''}
        </div>
      </div>`).join('')}`;
  }
  function pageAtlas() {
    const w = B.world();
    return `<h2>${esc(w.seed)}</h2><p class="sub">${esc(w.designation)} · ${esc(w.typeLabel)}</p>
      <div class="b-specs">${w.facts.map((f) => `<div class="b-spec ${['star', 'moons', 'activity'].includes(f.k) ? 'wide' : ''}"><span class="sc">${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join('')}</div>
      <p style="margin-top:28px"><button type="button" class="b-act" data-act="share">Copy a link to ${esc(w.seed)}</button></p>`;
  }
  function pageLife() {
    const w = B.world();
    const ground = S.mode === 'ground';
    return `<h2>Life</h2><p class="sub">What lives on ${esc(w.seed)}</p>
      <div class="b-h" style="margin-top:0">Creatures</div>
      ${w.fauna.length ? `<ul class="b-list">${w.fauna.map((f, i) => `<li data-act="fauna:${f.kind}"><span class="ix">${i + 1}.</span><span class="nm">${esc(f.name)}</span><span class="go">Study ${icon('arrow', 14, 2)}</span></li>`).join('')}</ul>` : '<p class="b-note">None seen yet.</p>'}
      <div class="b-h">Plants${ground ? ' here' : ''}</div>
      ${ground && w.flora.length ? `<ul class="b-list">${w.flora.map((p, i) => `<li data-act="plant:${p.kind}"><span class="ix">${i + 1}.</span><span class="nm">${esc(p.name)}</span><span class="go">Study ${icon('arrow', 14, 2)}</span></li>`).join('')}</ul>`
        : `<p class="b-note">${w.gas ? 'A gas giant grows no plants.' : 'Plants keep to the ground. Land the probe, and they will be written here.'}</p>`}`;
  }
  function pageWorlds() {
    const ws = B.worlds();
    return `<h2>Your worlds</h2><p class="sub">${ws.length} ${ws.length === 1 ? 'world' : 'worlds'} found so far</p>
      <div class="b-new"><form class="b-line" data-form="go"><input name="seed" maxlength="40" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="find another world…" aria-label="A name"><button type="submit" aria-label="Find it">${icon('arrow', 18, 2.2)}</button></form>
        <button type="button" class="b-stars" data-act="stars">${icon('spark', 16)}or let the stars choose</button></div>
      <ul class="b-list" style="margin-top:18px">${ws.map((w) => `<li class="${w.active ? 'on' : ''}" data-act="world:${esc(w.seed)}">${thumb(w.thumb)}
        <span class="nm">${esc(w.seed)}<small>${esc(w.typeLabel)}${w.finds ? ` · ${w.finds} of 3 chapters ${esc(w.marks)}` : ''}</small></span>
        <span class="go">${w.active ? 'You are here' : `Travel ${icon('arrow', 14, 2)}`}</span>
        <button type="button" class="del" data-act="forget:${esc(w.seed)}" title="Forget this world" aria-label="Forget ${esc(w.seed)}">${icon('close', 14)}</button></li>`).join('')}</ul>`;
  }
  function pageSettings() {
    const row = ([d, t, touch]) => `<tr><td>${esc(d)}${touch ? `<small>${esc(touch)}</small>` : ''}</td><td>${esc(t)}</td></tr>`;
    return `<h2>Settings</h2><p class="sub">Sound, and how to explore</p>
      <div class="b-h" style="margin-top:0">Sound</div>
      <p><button type="button" class="b-act" data-act="sound">${B.music.on ? 'Silence the music of the world' : 'Play the music of the world'}</button></p>
      <input type="range" min="0" max="100" value="${Math.round(B.music.vol * 100)}" data-input="vol" aria-label="Volume" style="width:260px;accent-color:#e9b872" ${B.music.on ? '' : 'disabled'}>
      <div class="b-h">In orbit</div><table class="b-keys">${CONTROLS.orbit.map(row).join('')}</table>
      <div class="b-h">On the ground</div><table class="b-keys">${CONTROLS.ground.map(row).join('')}</table>
      <p style="margin-top:28px;display:flex;gap:24px;flex-wrap:wrap"><button type="button" class="b-act" data-act="about">About My Worlds</button><button type="button" class="b-act" data-act="prologue">Back to the prologue</button></p>`;
  }
  function renderJournal() {
    if (!page) { el.jr.hidden = true; return; }
    const pageEl = el.jr.querySelector('.b-page');
    if (pageEl && pageEl.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const ready = !S.loading;
    const w = ready ? B.world() : null;
    const top = pageEl && el.jr.dataset.page === page ? pageEl.scrollTop : 0;
    el.jr.innerHTML = `<div class="b-book">
      <nav class="b-nav"><div class="who">${w ? thumb(w.thumb) : ''}<span><b>${w ? esc(w.seed) : ''}</b><span>${w ? esc(w.typeLabel) : ''}</span></span></div>
        ${PAGES.map(([k, l], i) => `<button type="button" class="b-tab ${page === k ? 'on' : ''}" data-act="journal:${k}"><i>${ROMAN[i + 1]}</i>${l}</button>`).join('')}
        <div class="spacer"></div></nav>
      <div class="b-page">${!ready ? '' : page === 'log' ? pageLog() : page === 'atlas' ? pageAtlas() : page === 'life' ? pageLife() : page === 'worlds' ? pageWorlds() : pageSettings()}</div>
      <button type="button" class="b-close" data-act="journal-close">${icon('close', 16)}<span>Close</span></button>
    </div>`;
    el.jr.dataset.page = page;
    el.jr.querySelector('.b-page').scrollTop = top;
    el.jr.hidden = false;
    if (page === 'log') seenStory = S.storyKey;
  }
  function openJournal(p) { page = p; if (proOn) { proOn = false; el.pro.hidden = true; } el.chap.hidden = true; B.cancelAim(); renderJournal(); render(); }

  // ------------------------------------------------------------ the frame
  function render() {
    const s = S;
    const ready = !s.loading && !s.busy;
    const covered = proOn || !!page || !el.chap.hidden;
    const quiet = covered || !ready || s.dive || s.card || s.dialog || s.mode === 'descending' || s.mode === 'ascending';
    const ground = s.mode === 'ground';
    if (!proOn && ready && chapFor === 'pending') {
      chapFor = s.seed;
      setTimeout(() => { if (chapFor === s.seed && !S.busy && !proOn && !page) { renderChap(); render(); } }, 700);
    }
    const st = ready ? B.story() : null;
    if (st) {
      const o = st.objective;
      el.obj.innerHTML = `<span class="sc">${esc(o.kicker)}</span><div class="t">${esc(o.title)}</div><p>${esc(o.line)}</p>
        ${st.has ? `<div class="dots">${st.chapters.map((c) => `<i class="${c.state === 'done' ? 'on' : ''}"></i>`).join('')}<span>${st.done} of ${st.of}</span></div>` : ''}`;
      el.obj.classList.toggle('ground', ground);
      const w = B.world();
      el.name.innerHTML = `<b>${esc(w.seed)}</b><span>${esc(w.typeLabel)}</span>`;
    }
    show(el.obj, !quiet && !s.aiming);
    show(el.jbtn, !quiet && !s.aiming);
    show(el.name, !quiet && !ground && !s.aiming);
    show(el.aim, !quiet && s.aiming);
    const badge = st && st.has && s.storyKey !== seenStory;
    let b = el.jbtn.querySelector('.badge');
    if (badge && !b) el.jbtn.insertAdjacentHTML('beforeend', '<i class="badge"></i>');
    if (!badge && b) b.remove();
    // the call to action
    let cls = 'b-cta pe fade', ic = 'down', t = 'Send the probe', sub = 'Choose a place to land';
    if (s.gas) { cls += ' off'; ic = 'wave'; t = 'No ground to land on'; sub = 'This is a gas giant'; }
    else if (s.aiming) { cls += ' ghost'; ic = 'close'; t = 'Cancel'; sub = 'Stay in orbit'; }
    else if (ground) { ic = 'up'; t = 'Return to orbit'; sub = 'Recall the probe'; }
    el.cta.className = cls;
    el.cta.innerHTML = `<span class="c">${icon(ic, 22, 2.2)}</span><span><b>${t}</b><small>${sub}</small></span>`;
    show(el.cta, !quiet);
    if (s.ctx) el.ctx.innerHTML = `${icon('target', 17, 2)}${esc(s.ctx)}`;
    show(el.ctx, !quiet && ground && !!s.ctx);
    const phone = innerWidth <= 760;
    B.hudInsets({ top: phone ? 80 : 84, bottom: phone ? 96 + (s.ctx ? 52 : 0) : 104, left: phone ? 12 : 22, right: phone ? 12 : 22 });
  }

  // ------------------------------------------------------------ input
  function go(name) {
    B.loader(true);
    if (!B.go(name)) return;
    S = { ...S, busy: true };
    page = null; el.jr.hidden = true; el.chap.hidden = true;
    chapFor = 'pending';
    if (proOn) { proOn = false; el.pro.hidden = true; }
    render();
  }
  function stars(fromPro) {
    const name = B.randomName();
    if (fromPro) {
      const input = el.pro.querySelector('input');
      let i = 0;
      const t = setInterval(() => {
        i++;
        input.value = name.slice(0, i); headline(input.value);
        if (i >= name.length) { clearInterval(t); setTimeout(() => go(name), 700); }
      }, 55);
    } else go(name);
  }
  function toast(t) { el.toast.textContent = t; show(el.toast, true); clearTimeout(toast.t); toast.t = setTimeout(() => show(el.toast, false), 1600); }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    const [act, arg] = t.dataset.act.split(/:(.*)/s);
    if (act === 'forget') { e.stopPropagation(); B.forget(arg); renderJournal(); return; }
    if (act === 'journal') openJournal(arg);
    else if (act === 'journal-close') { page = null; renderJournal(); }
    else if (act === 'cta') {
      if (S.gas) return;
      if (S.aiming) B.cancelAim(); else if (S.mode === 'ground') B.recall(); else if (S.mode === 'orbit') B.aim();
    }
    else if (act === 'study') B.study();
    else if (act === 'chap-ok') { el.chap.hidden = true; }
    else if (act === 'stars') stars(proOn);
    else if (act === 'world') go(arg);
    else if (act === 'fauna') B.inspect(+arg);
    else if (act === 'plant') B.inspectPlant(+arg);
    else if (act === 'brief') B.brief();
    else if (act === 'lost') B.lost();
    else if (act === 'clear') { B.clear(); setTimeout(renderJournal, 60); }
    else if (act === 'aim') { page = null; renderJournal(); B.aimAt(arg); }
    else if (act === 'about') B.about();
    else if (act === 'share') B.share().then((ok) => toast(ok ? 'Link copied' : B.shareUrl()));
    else if (act === 'sound') { B.music.toggle(); setTimeout(() => { if (proOn) renderPro(); renderJournal(); }, 30); }
    else if (act === 'prologue') { B.loader(false); page = null; el.jr.hidden = true; proOn = true; renderPro(); el.pro.hidden = false; }
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
      if (a.kind === 'lock') { f.querySelector('input').blur(); setTimeout(renderJournal, 1200); }
    }
  });
  root.addEventListener('input', (e) => {
    if (e.target.dataset.input === 'vol') B.music.set(e.target.value / 100);
    else if (proOn && e.target.closest('.b-pro')) headline(e.target.value);
  });
  const onEsc = (e) => {
    if (e.key !== 'Escape') return;
    if (page) { page = null; renderJournal(); render(); }
    else if (!el.chap.hidden) { el.chap.hidden = true; render(); }
  };
  addEventListener('keydown', onEsc);
  B.onFrameKey((e) => { onEsc(e); if ((e.key === 'j' || e.key === 'J') && !proOn) openJournal(page ? null : 'log'); });
  addEventListener('resize', render);

  B.subscribe((s) => {
    if (s.seed && lastSeed !== null && s.seed !== lastSeed && chapFor !== 'pending') chapFor = 'pending';
    if (s.seed) lastSeed = s.seed;
    S = s;
    renderJournal();
    render();
  });
  if (proOn) { B.loader(false); renderPro(); }
}
