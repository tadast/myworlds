// PROTOTYPE — concept C, "Constellation". Spatial: the levels are places. Cosmos (all your worlds),
// Orbit (one world), Surface (the probe). A depth rail shows where you are, and its foot is the one
// big button: the move down or up. Facts are pinned onto the globe by a scan; the story is signals.
// See NOTES.md.
import { icon } from './icons.js';
import { esc, CONTROLS } from './bridge.js';

export const meta = {
  name: 'Constellation',
  map: `
  <h3>C — Constellation</h3>
  <p>Navigation is space. Your worlds float in a cosmos around an unnamed star; you fly into one. A depth rail on the right says where you are — Cosmos, Orbit, Surface — and its foot is the big button that moves you one level down or up. Facts are pinned onto the globe itself; the story is a set of radio signals.</p>
  <h4>Topology</h4>
  <pre>        ✦ COSMOS   your worlds orbit the unnamed star
            │        type a name · catch a shooting star · tap a planet
            ▼ fly in
        ◯ ORBIT    ── Scan: facts pinned around the globe
            │       ── Signal ribbon ▸ Signals drawer (chapters as bands, tuner)
            │       ── Life tray (creatures)
            ▼ LAND (big button)          ▲ RECALL (same button)
        ▪ SURFACE  ── Life tray (creatures + plants here) · study chip</pre>
  <h4>Hierarchy</h4>
  <ol>
    <li><b>Where am I, and the next level</b> — the rail, with the big Land / Recall button at its foot (bottom right, the thumb zone).</li>
    <li><b>The signal</b> — the ribbon at the top: what calls from this world, and the next step.</li>
    <li><b>The world itself</b> — Scan writes the facts onto the planet; nothing sits in a list.</li>
  </ol>
  <h4>Trade-off</h4>
  <p>The most playful and the most "place"-like; the world list becomes a toy. Hardest to build well, and the scan callouts need care on small screens (the phone gets a fact strip instead).</p>`,
};

const CSS = `
.C { position: absolute; inset: 0; color: #eef2ff; font-family: Fredoka, ui-rounded, system-ui, sans-serif;
  --aur1: #7cf0ff; --aur2: #9b8cff; --aur3: #ff8fd6; --muted: #9aa6cc; --glass: rgba(12, 14, 34, .62); --line: rgba(170, 190, 255, .18);
  --safe-b: env(safe-area-inset-bottom); --safe-t: env(safe-area-inset-top); }
.C * { box-sizing: border-box; }
.C [hidden] { display: none !important; }
.C button { font: inherit; color: inherit; }
.C .pe { pointer-events: auto; }
.C .fade { transition: opacity .45s ease, transform .45s ease; }
.C .gone { opacity: 0 !important; pointer-events: none !important; }
.C .glass { background: var(--glass); border: 1px solid var(--line); backdrop-filter: blur(16px) saturate(1.3); -webkit-backdrop-filter: blur(16px) saturate(1.3); }
.C .k { font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); }
.C .grad { background: linear-gradient(90deg, var(--aur1), var(--aur2) 50%, var(--aur3)); -webkit-background-clip: text; background-clip: text; color: transparent; }

/* ---------- the cosmos */
.c-cos { z-index: 1; position: absolute; inset: 0; pointer-events: auto; overflow: hidden; background: radial-gradient(ellipse at 50% 55%, #121338 0%, #070818 55%, #030410 100%); transition: opacity .8s ease; }
.c-cos.out { opacity: 0; pointer-events: none; }
.c-cos canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.c-neb { position: absolute; inset: -20%; pointer-events: none; opacity: .55; filter: blur(40px);
  background: radial-gradient(circle at 30% 35%, rgba(124,240,255,.18), transparent 40%), radial-gradient(circle at 72% 60%, rgba(255,143,214,.14), transparent 42%), radial-gradient(circle at 55% 30%, rgba(155,140,255,.16), transparent 45%);
  animation: c-drift 40s ease-in-out infinite alternate; }
@keyframes c-drift { to { transform: translate(3%, -2%) rotate(4deg); } }
.c-ring { position: absolute; left: 50%; top: 50%; border: 1px dashed rgba(170,190,255,.12); border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; }
.c-star { position: absolute; left: 50%; top: 50%; width: 120px; height: 120px; transform: translate(-50%, -50%); border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, #fff 0%, #fff6e0 12%, rgba(255,214,160,.65) 26%, rgba(155,140,255,.25) 52%, transparent 72%);
  filter: drop-shadow(0 0 calc(18px + var(--glow, 0) * 2px) rgba(255,220,180,.8)); animation: c-breathe 4s ease-in-out infinite; transition: width .3s, height .3s; }
@keyframes c-breathe { 50% { transform: translate(-50%, -50%) scale(1.08); } }
.c-center { z-index: 150; position: absolute; left: 50%; top: calc(50% + 78px); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 10px; width: min(420px, calc(100vw - 32px)); text-align: center; }
.c-h1 { text-align: center; position: absolute; top: calc(62px + var(--safe-t)); left: 50%; transform: translateX(-50%); z-index: 200; text-shadow: 0 2px 20px rgba(3,4,16,.9); width: max-content; max-width: calc(100vw - 32px); margin: 0; font-weight: 600; font-size: clamp(26px, 4vw, 40px); line-height: 1.1; }
.c-h1 small { display: block; font-size: 15px; font-weight: 400; color: var(--muted); margin-top: 8px; }
.c-name { width: 100%; height: 54px; border-radius: 999px; display: flex; align-items: center; padding: 0 6px 0 22px; }
.c-name input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; color: #fff; font: 500 19px Fredoka, sans-serif; text-align: center; }
.c-name input::placeholder { color: #7f8ab3; }
.c-name button { width: 42px; height: 42px; border-radius: 50%; border: 0; cursor: pointer; display: grid; place-items: center; color: #10122a !important;
  background: linear-gradient(135deg, var(--aur1), var(--aur2) 60%, var(--aur3)); }
.c-name:focus-within { border-color: rgba(124,240,255,.6); box-shadow: 0 0 0 4px rgba(124,240,255,.12); }
.c-surprise { all: unset; cursor: pointer; color: var(--muted); font-size: 14px; display: inline-flex; gap: 6px; align-items: center; }
.c-surprise:hover { color: #fff; }
.c-pl { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; border: 0; background: none; padding: 0; will-change: transform; }
.c-pl .orb { position: relative; width: var(--s, 60px); height: var(--s, 60px); border-radius: 50%; overflow: visible; transition: transform .25s; }
.c-pl .orb img, .c-pl .orb .ph { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; background: radial-gradient(circle at 35% 30%, #5b86c8, #13213f);
  box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 0 24px var(--halo, rgba(124,196,255,.35)), inset -8px -10px 18px rgba(0,0,0,.55); }
.c-pl .orb::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 1px solid transparent; transition: .25s; }
.c-pl:hover .orb { transform: scale(1.14); }
.c-pl:hover .orb::after, .c-pl.cur .orb::after { border-color: rgba(124,240,255,.6); }
.c-pl.far .lb { opacity: 0; transition: opacity .2s; }
.c-pl.far:hover .lb { opacity: 1; }
.c-pl .lb { font-size: 12.5px; color: #cfd6f5; white-space: nowrap; text-shadow: 0 2px 8px rgba(0,0,0,.8); }
.c-pl .mk { position: absolute; top: -8px; right: -6px; font-size: 11px; color: #ffd27a; text-shadow: 0 0 8px rgba(255,210,122,.8); }
.c-pl.fly { transition: transform .9s cubic-bezier(.6,0,.2,1), opacity .9s; }
.c-shoot { z-index: 160; position: absolute; left: 0; top: 0; width: 46px; height: 46px; margin: -23px; border: 0; background: none; cursor: pointer; padding: 0; }
.c-shoot::before { content: ''; position: absolute; right: 50%; top: 50%; width: 140px; height: 2px; margin-top: -1px; transform-origin: right center; transform: rotate(var(--ang, 0deg));
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.85)); border-radius: 2px; }
.c-shoot::after { content: ''; position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; margin: -4px; border-radius: 50%; background: #fff; box-shadow: 0 0 14px 4px rgba(200,230,255,.9); }
.c-shoot span { position: absolute; left: 30px; top: 22px; white-space: nowrap; font-size: 12px; color: #fff; opacity: .9; }
.c-tl { z-index: 200; position: absolute; left: 20px; top: calc(18px + var(--safe-t)); font-weight: 600; font-size: 16px; display: flex; gap: 8px; align-items: center; }
.c-tl i { font-style: normal; color: #ffd27a; }
.c-tr { z-index: 200; position: absolute; right: 16px; top: calc(14px + var(--safe-t)); display: flex; gap: 8px; }
.c-ib { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; cursor: pointer; }
.c-ib:hover { border-color: rgba(124,240,255,.5); }
.c-ib.on { background: rgba(124,240,255,.16); border-color: rgba(124,240,255,.6); color: #dffaff; }
.c-hint { z-index: 150; text-shadow: 0 1px 8px #030410; position: absolute; left: 50%; bottom: calc(22px + var(--safe-b)); transform: translateX(-50%); display: flex; gap: 22px; color: var(--muted); font-size: 13px; white-space: nowrap; }
.c-hint b { color: #fff; font-weight: 500; }

/* ---------- orbit */
.c-title { position: absolute; left: 22px; top: calc(18px + var(--safe-t)); cursor: pointer; text-align: left; border: 0; background: none; padding: 0; text-shadow: 0 2px 16px rgba(0,0,0,.6); }
.c-title b { display: block; font-size: clamp(30px, 4vw, 44px); font-weight: 600; line-height: 1; letter-spacing: -.01em; }
.c-title span { display: block; margin-top: 6px; font-size: 13px; color: #c5cdef; }
.c-rib { position: absolute; left: 50%; top: calc(52px + var(--safe-t)); transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 7px 16px 7px 8px; border-radius: 999px; cursor: pointer;
  max-width: min(560px, calc(100vw - 24px)); }
.c-rib .wv { width: 54px; height: 26px; border-radius: 999px; overflow: hidden; background: rgba(124,240,255,.08); flex: none; position: relative; }
.c-rib .wv svg { position: absolute; left: 0; top: 0; height: 26px; width: 108px; animation: c-wave 1.6s linear infinite; }
@keyframes c-wave { to { transform: translateX(-54px); } }
.c-rib .tx { min-width: 0; text-align: left; }
.c-rib b { display: block; font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-rib small { display: block; font-size: 12px; color: #c5cdef; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-rib.quiet .wv svg { animation: none; opacity: .4; }

/* the rail */
.c-rail { position: absolute; right: 20px; bottom: calc(22px + var(--safe-b)); display: flex; flex-direction: column; align-items: center; gap: 0; }
.c-node { position: relative; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; border: 1px solid var(--line); background: var(--glass); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: #c5cdef; }
.c-node img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.c-node.here { border: 2px solid var(--aur1); box-shadow: 0 0 0 4px rgba(124,240,255,.14), 0 0 20px rgba(124,240,255,.35); color: #fff; }
.c-node .lbl { position: absolute; right: calc(100% + 12px); top: 50%; transform: translateY(-50%); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); white-space: nowrap; text-shadow: 0 1px 6px rgba(0,0,0,.8); }
.c-node.here .lbl { color: #dffaff; }
.c-wire { width: 2px; height: 26px; background: linear-gradient(var(--line), var(--line)); }
.c-wire.lit { background: linear-gradient(rgba(124,240,255,.6), rgba(124,240,255,.15)); }
.c-big { position: relative; margin-top: 8px; width: 82px; height: 82px; border-radius: 50%; border: 0; cursor: pointer; display: grid; place-items: center; color: #0d0f26 !important;
  background: conic-gradient(from 210deg, var(--aur1), var(--aur2), var(--aur3), var(--aur1)); box-shadow: 0 10px 40px rgba(155,140,255,.5); transition: transform .15s; }
.c-big::before { content: ''; position: absolute; inset: 4px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ffffff, #e9ecff 55%, #c9cff6); }
.c-big .ico { position: relative; }
.c-big:hover { transform: scale(1.05); }
.c-big:active { transform: scale(.95); }
.c-big::after { content: ''; position: absolute; inset: -8px; border-radius: 50%; border: 2px solid rgba(124,240,255,.55); animation: c-ping 2.2s ease-out infinite; }
@keyframes c-ping { from { transform: scale(.92); opacity: 1; } to { transform: scale(1.35); opacity: 0; } }
.c-big .lbl { position: absolute; right: calc(100% + 14px); top: 50%; transform: translateY(-50%); white-space: nowrap; padding: 9px 14px; border-radius: 999px; font-weight: 600; font-size: 15px;
  color: #fff; background: rgba(12,14,34,.75); border: 1px solid rgba(124,240,255,.35); backdrop-filter: blur(10px); }
.c-big.off { background: #2a2f52; box-shadow: none; cursor: default; }
.c-big.off::after { display: none; }
.c-big.off::before { background: #1c2040; }
.c-big.off { color: #6f789f !important; }
.c-big.aim::after { border-color: rgba(255,143,214,.7); }
.c-big.busy::after { animation: c-spin 1s linear infinite; border-color: transparent; border-top-color: #fff; opacity: 1; }
@keyframes c-spin { to { transform: rotate(360deg); } }

/* scan */
.c-scan { position: absolute; inset: 0; pointer-events: none; }
.c-scan svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.c-scan .call { position: absolute; transform: translate(var(--tx, 0), -50%); padding: 7px 12px; border-radius: 12px; white-space: nowrap; pointer-events: auto; animation: c-pop .5s cubic-bezier(.2,.8,.2,1) both; }
.c-scan .call b { display: block; font-weight: 500; font-size: 15px; }
.c-scan .call .k { font-size: 9.5px; }
.c-scan .call.btn { cursor: pointer; border-color: rgba(124,240,255,.45); }
.c-scan .call.btn:hover { background: rgba(124,240,255,.14); }
@keyframes c-pop { from { opacity: 0; transform: translate(var(--tx, 0), -50%) scale(.9); } }
.c-strip { position: absolute; left: 0; right: 0; bottom: calc(108px + var(--safe-b)); display: none; gap: 8px; overflow-x: auto; padding: 0 14px; scrollbar-width: none; pointer-events: auto; }
.c-strip .call { flex: none; padding: 8px 12px; border-radius: 14px; }
.c-strip .call b { display: block; font-weight: 500; font-size: 14px; white-space: nowrap; }

/* drawers: signals, life, settings */
.c-dr { position: absolute; left: 50%; top: calc(100px + var(--safe-t)); transform: translateX(-50%); width: min(560px, calc(100vw - 24px)); max-height: calc(100dvh - 240px); overflow: auto; border-radius: 24px; padding: 20px 20px 18px;
  animation: c-down .4s cubic-bezier(.2,.8,.2,1); box-shadow: 0 30px 80px rgba(0,0,0,.55); overscroll-behavior: contain; }
@keyframes c-down { from { opacity: 0; transform: translate(-50%, -14px); } }
.c-dr h2 { margin: 0 0 4px; font-size: 22px; font-weight: 600; }
.c-dr .x { position: absolute; right: 12px; top: 12px; width: 36px; height: 36px; border-radius: 12px; border: 0; background: rgba(255,255,255,.07); cursor: pointer; display: grid; place-items: center; }
.c-quote { margin: 12px 0 16px; padding: 12px 14px; border-left: 2px solid var(--aur3); background: rgba(255,143,214,.06); border-radius: 0 12px 12px 0; font-size: 14.5px; line-height: 1.5; color: #e7e2f5; }
.c-dial { position: relative; height: 34px; margin: 6px 0 14px; border-radius: 10px; background: repeating-linear-gradient(90deg, rgba(255,255,255,.14) 0 1px, transparent 1px 12px); }
.c-dial::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: rgba(255,255,255,.12); }
.c-dial i { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1.5px; border-radius: 2px; }
.c-dial i.on { background: var(--aur1); box-shadow: 0 0 12px var(--aur1); }
.c-dial i.lock { background: rgba(255,255,255,.25); }
.c-dial i.q { background: var(--aur3); box-shadow: 0 0 12px var(--aur3); animation: c-blink 1.2s steps(2) infinite; }
@keyframes c-blink { 50% { opacity: .25; } }
.c-ch { display: grid; grid-template-columns: 112px 1fr; gap: 4px 14px; padding: 14px 0; border-top: 1px solid var(--line); }
.c-ch .fq { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 15px; color: var(--aur1); padding-top: 3px; }
.c-ch.closed { opacity: .5; }
.c-ch.closed .fq { color: var(--muted); }
.c-ch.done .fq { color: #b6f5c8; }
.c-ch h3 { margin: 0; font-size: 17px; font-weight: 500; display: flex; align-items: center; gap: 8px; }
.c-ch p { margin: 3px 0 0; font-size: 13.5px; color: #c5cdef; line-height: 1.4; }
.c-ch .nx { color: #ffd0ee; }
.c-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.c-chip { border: 1px solid var(--line); background: rgba(255,255,255,.05); border-radius: 999px; padding: 7px 13px; cursor: pointer; font-size: 13.5px; display: inline-flex; align-items: center; gap: 6px; }
.c-chip:hover { border-color: rgba(124,240,255,.6); }
.c-chip.hot { border-color: rgba(124,240,255,.55); color: #dffaff; }
.c-tune { display: flex; gap: 6px; margin-top: 10px; }
.c-tune input { flex: 1; min-width: 0; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: rgba(0,0,0,.3); color: #fff; padding: 0 12px; font: 16px 'IBM Plex Mono', monospace; }
.c-tune input:focus { outline: 0; border-color: var(--aur1); }
.c-tune-ans { font-size: 12.5px; color: var(--muted); margin-top: 6px; min-height: 1em; }
.c-tune-ans[data-kind="near"] { color: #ffd0ee; }
.c-tune-ans[data-kind="lock"] { color: #b6f5c8; }
.c-tray { position: absolute; left: 0; right: 250px; bottom: calc(22px + var(--safe-b)); display: flex; gap: 10px; overflow-x: auto; padding: 4px 22px; scrollbar-width: none; pointer-events: auto; }
.c-card { flex: none; width: 150px; padding: 12px; border-radius: 18px; cursor: pointer; text-align: left; animation: c-pop2 .4s cubic-bezier(.2,.8,.2,1) both; }
@keyframes c-pop2 { from { opacity: 0; transform: translateY(14px); } }
.c-card .ico { color: var(--aur1); }
.c-card b { display: block; font-weight: 500; font-size: 14px; margin-top: 8px; line-height: 1.25; }
.c-card span { font-size: 11px; color: var(--muted); }
.c-card.plant .ico { color: #a7f3a0; }
.c-card.note { cursor: default; width: 220px; }
.c-pop { z-index: 3; position: absolute; right: 16px; top: calc(66px + var(--safe-t)); width: min(340px, calc(100vw - 24px)); max-height: calc(100dvh - 200px); overflow: auto; border-radius: 20px; padding: 16px; animation: c-down2 .3s ease; }
@keyframes c-down2 { from { opacity: 0; transform: translateY(-8px); } }
.c-pop h3 { margin: 4px 0 8px; font-size: 13px; font-weight: 500; color: var(--muted); letter-spacing: .12em; text-transform: uppercase; }
.c-keys { width: 100%; border-collapse: collapse; font-size: 13px; }
.c-keys td { padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
.c-keys td:first-child { color: var(--aur1); width: 44%; }
.c-keys small { display: block; color: var(--muted); font-size: 11px; }
.c-ctx { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(30px + var(--safe-b)); display: flex; align-items: center; gap: 10px; padding: 11px 18px 11px 12px; border-radius: 999px; border: 0; cursor: pointer;
  background: #fff; color: #10122a !important; font-weight: 600; font-size: 15px; white-space: nowrap; box-shadow: 0 10px 30px rgba(0,0,0,.4); max-width: calc(100vw - 150px); }
.c-ctx span { overflow: hidden; text-overflow: ellipsis; }
.c-aim { position: absolute; left: 50%; top: calc(52px + var(--safe-t)); transform: translateX(-50%); padding: 10px 18px; border-radius: 999px; font-size: 15px; white-space: nowrap; display: flex; gap: 8px; align-items: center; }
.c-aim .ico { color: var(--aur3); }
.c-toast { z-index: 3; position: absolute; left: 50%; top: calc(100px + var(--safe-t)); transform: translateX(-50%); padding: 9px 16px; border-radius: 999px; font-size: 14px; }
.c-arr { position: absolute; left: 50%; top: calc(52px + var(--safe-t)); transform: translateX(-50%); width: min(520px, calc(100vw - 24px)); border-radius: 24px; padding: 18px 20px; box-shadow: 0 30px 80px rgba(0,0,0,.55);
  animation: c-unfold .7s cubic-bezier(.2,.8,.2,1); transform-origin: 50% 0; }
@keyframes c-unfold { from { opacity: 0; transform: translateX(-50%) scaleY(.3); } }
.c-arr .k { color: #ffd0ee; display: flex; align-items: center; gap: 8px; }
.c-arr h2 { margin: 8px 0 6px; font-size: 22px; font-weight: 600; }
.c-arr p { margin: 0 0 14px; font-size: 15px; line-height: 1.5; color: #dfe3f8; }
.c-arr .wv2 { height: 34px; margin: 0 0 12px; border-radius: 10px; overflow: hidden; background: rgba(124,240,255,.06); position: relative; }
.c-arr .wv2 svg { position: absolute; left: 0; top: 0; height: 34px; width: 200%; animation: c-wave2 2.2s linear infinite; }
@keyframes c-wave2 { to { transform: translateX(-50%); } }
.c-go { border: 0; border-radius: 999px; padding: 11px 18px; cursor: pointer; font-weight: 600; color: #10122a !important; background: linear-gradient(90deg, var(--aur1), var(--aur2) 60%, var(--aur3)); display: inline-flex; align-items: center; gap: 8px; }
.c-ghost { border: 1px solid var(--line); background: none; border-radius: 999px; padding: 10px 16px; cursor: pointer; }
#app.c-away { transform: scale(.32); filter: blur(8px) brightness(.5); opacity: 0; transition: transform .9s cubic-bezier(.6,0,.2,1), filter .9s, opacity .9s; }
#app.c-back { transition: transform 1s cubic-bezier(.2,.8,.2,1), filter 1s, opacity .6s; }

@media (max-width: 760px) {
  .c-center { top: auto; bottom: calc(34px + var(--safe-b)); }
  .c-h1 { top: calc(52px + var(--safe-t)); font-size: 24px; white-space: normal; width: calc(100vw - 32px); text-align: center; }
  .c-star { width: 96px; height: 96px; }
  .c-hint { display: none; }
  .c-title { left: 14px; top: calc(12px + var(--safe-t)); max-width: calc(100vw - 150px); }
  .c-title b { font-size: 28px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c-title span { font-size: 12px; }
  .c-tr { right: 10px; top: calc(10px + var(--safe-t)); gap: 6px; }
  .c-ib { width: 40px; height: 40px; border-radius: 12px; }
  .c-rib { top: calc(76px + var(--safe-t)); left: 12px; right: 12px; transform: none; max-width: none; }
  .c-arr { top: calc(76px + var(--safe-t)); }
  .c-dr { top: calc(76px + var(--safe-t)); max-height: calc(100dvh - 250px); }
  .c-rail { right: 14px; bottom: calc(14px + var(--safe-b)); }
  .c-node .lbl { display: none; }
  .c-big { width: 76px; height: 76px; }
  .c-big .lbl { font-size: 14px; padding: 8px 12px; }
  .c-scan .call { display: none; }
  .c-strip { display: flex; }
  .c-tray { right: 0; bottom: calc(108px + var(--safe-b)); padding: 4px 12px; }
  .c-rail.compact .c-node, .c-rail.compact .c-wire { display: none; }
  .c-card { width: 132px; }
  .c-ctx { left: 14px; transform: none; bottom: calc(26px + var(--safe-b)); max-width: calc(100vw - 120px); }
  .c-aim { top: calc(76px + var(--safe-t)); }
}
`;

const WAVE = (w, h, n, amp) => {
  let d = `M0 ${h / 2}`;
  for (let i = 0; i <= n * 8; i++) {
    const x = (i / (n * 8)) * w;
    const y = h / 2 + Math.sin((i / 8) * Math.PI * 2) * amp * (0.55 + 0.45 * Math.sin(i * 1.7));
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="#7cf0ff" stroke-width="1.6"/></svg>`;
};
const HALO = { terran: 'rgba(110,190,255,.45)', ocean: 'rgba(80,160,255,.5)', desert: 'rgba(255,190,110,.45)', ice: 'rgba(200,235,255,.5)', lava: 'rgba(255,110,70,.55)', gas: 'rgba(255,200,140,.4)', exotic: 'rgba(200,120,255,.5)' };

export function mount(root, B, { showStart }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const frame = document.getElementById('app');
  root.innerHTML = `
  <div class="C">
    <button type="button" class="c-title pe fade gone" data-act="scan"></button>
    <div class="c-scan" hidden><svg></svg><div class="calls"></div></div>
    <div class="c-strip fade gone"></div>
    <button type="button" class="c-rib glass pe fade gone" data-act="signals"></button>
    <div class="c-aim glass fade gone">${icon('cross', 18)}Tap the planet where the probe should land</div>
    <div class="c-tr pe fade gone">
      <button type="button" class="c-ib glass" data-act="scan" title="Scan this world" aria-label="Scan this world">${icon('scan', 20)}</button>
      <button type="button" class="c-ib glass" data-act="life" title="Life" aria-label="Life">${icon('paw', 20)}</button>
      <button type="button" class="c-ib glass" data-act="settings" title="Settings" aria-label="Settings">${icon('gear', 20)}</button>
    </div>
    <div class="c-tray fade gone"></div>
    <button type="button" class="c-ctx pe fade gone" data-act="study"></button>
    <div class="c-rail pe fade gone">
      <button type="button" class="c-node" data-act="cosmos" aria-label="Cosmos: all your worlds">${icon('spark', 18)}<span class="lbl">Cosmos</span></button>
      <span class="c-wire"></span>
      <button type="button" class="c-node c-orbit" data-act="orbitnode" aria-label="Orbit"><span class="lbl">Orbit</span></button>
      <span class="c-wire"></span>
      <button type="button" class="c-node c-surf" data-act="surfnode" aria-label="Surface">${icon('target', 18)}<span class="lbl">Surface</span></button>
      <button type="button" class="c-big" data-act="big"><span class="lbl"></span></button>
    </div>
    <section class="c-dr glass pe" hidden></section>
    <section class="c-arr glass pe" hidden></section>
    <section class="c-pop glass pe" hidden></section>
    <div class="c-toast glass fade gone"></div>
    <section class="c-cos ${showStart ? '' : 'out'}">
      <canvas></canvas><div class="c-neb"></div>
      <div class="rings"></div>
      <div class="c-star"></div>
      <div class="pls"></div>
      <h1 class="c-h1"><span class="grad">Every name hides a planet.</span><small>Name a star, and fly to the world that circles it.</small></h1>
      <div class="c-center">
        <form class="c-name glass" data-form="go"><input name="seed" maxlength="40" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="Name a star…" aria-label="A name"><button type="submit" aria-label="Fly there">${icon('arrow', 20, 2.4)}</button></form>
        <button type="button" class="c-surprise" data-act="surprise">${icon('spark', 16)}Surprise me</button>
      </div>
      <button type="button" class="c-shoot" hidden aria-label="Catch a shooting star: a random world"><span>catch it ✦</span></button>
      <div class="c-tl">✦ <span>My Worlds</span></div>
      <div class="c-tr" style="opacity:1">
        <button type="button" class="c-ib glass" data-act="settings" title="How to fly, sound, about" aria-label="Settings">${icon('pad', 20)}</button>
        <button type="button" class="c-ib glass c-back" data-act="back" title="Back to the world" aria-label="Back to the world" hidden>${icon('close', 20)}</button>
      </div>
      <div class="c-hint"><span><b>Type</b> a name</span><span><b>Tap</b> a world to fly in</span><span><b>Catch</b> a shooting star for a surprise</span></div>
    </section>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const el = { title: $('.c-title'), scan: $('.c-scan'), strip: $('.c-strip'), rib: $('.c-rib'), aim: $('.c-aim'), tr: $('.C > .c-tr'), tray: $('.c-tray'), ctx: $('.c-ctx'),
    rail: $('.c-rail'), big: $('.c-big'), dr: $('.c-dr'), arr: $('.c-arr'), pop: $('.c-pop'), toast: $('.c-toast'), cos: $('.c-cos'), shoot: $('.c-shoot') };
  const show = (e, on) => e.classList.toggle('gone', !on);
  let S = { loading: true };
  let cosmos = showStart;
  let scan = false, drawer = null, tray = false, pop = false;
  let arrFor = showStart ? null : 'pending';
  let lastSeed = null;
  if (cosmos) frame.classList.add('c-away');

  // ------------------------------------------------------------ the cosmos
  const cv = el.cos.querySelector('canvas');
  const ctx2 = cv.getContext('2d');
  const stars = Array.from({ length: 320 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), p: Math.random() * 6.28 }));
  let mx = 0, my = 0;
  el.cos.addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });
  let planets = [];
  function buildCosmos() {
    const ws = B.worlds();
    const box = el.cos.querySelector('.pls');
    box.innerHTML = ws.map((w, i) => `<button type="button" class="c-pl ${w.active && !showStart ? 'cur' : ''}" data-act="world:${esc(w.seed)}" style="--halo:${HALO[w.type] || HALO.terran}">
      <span class="orb">${w.thumb ? `<img alt="" src="${w.thumb}">` : '<span class="ph"></span>'}${w.marks ? `<i class="mk">${esc(w.marks)}</i>` : ''}</span><span class="lb">${esc(w.seed)}</span></button>`).join('');
    planets = [...box.children].map((node, i) => ({ node, i, n: ws.length }));
    node0 = null;
  }
  let node0 = null;
  let spin = 0;
  let shoot = null, nextShoot = performance.now() + 3500;
  let t0 = performance.now();
  function frameLoop(now) {
    requestAnimationFrame(frameLoop);
    if (!cosmos && el.cos.classList.contains('out')) return;
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2.clearRect(0, 0, w, h);
    for (const s of stars) {
      const x = ((s.x + mx * s.z * 0.04) % 1) * w, y = ((s.y + my * s.z * 0.04) % 1) * h;
      const a = 0.25 + 0.75 * s.z * (0.6 + 0.4 * Math.sin(now / 900 + s.p));
      ctx2.fillStyle = `rgba(220,230,255,${a})`;
      ctx2.fillRect(x, y, s.z * 1.8 + 0.4, s.z * 1.8 + 0.4);
    }
    const cx = w / 2, cy = h / 2;
    // a sunflower spiral: the newest world nearest the star, the oldest at the rim, the whole field
    // turning slowly. The ellipse lays it in perspective, and the front of it is bigger and brighter.
    spin += dt * 0.025;
    const phone = innerWidth <= 760;
    // landscape lays the spiral flat; a portrait phone stands it up, so the tall screen holds it
    const portrait = h > w * 1.15;
    const rx = portrait ? w / 2 - 26 : Math.max(270, Math.min(w * 0.5 - 30, (h * 0.5 - 40) / 0.6));
    const ry = portrait ? h / 2 - 150 : rx * 0.6;
    const r0n = portrait ? 0.42 : Math.min(0.6, 210 / rx);
    for (const p of planets) {
      if (p.node.classList.contains('fly')) continue;
      const k = Math.sqrt((p.i + 0.6) / Math.max(1, p.n));
      const Rn = r0n + (1 - r0n) * k;
      const a = p.i * 2.39996 + spin * (1.4 - k);
      const x = cx + Math.cos(a) * Rn * rx + mx * 30 * k;
      const y = cy + Math.sin(a) * Rn * ry + my * 20 * k;
      const depth = (Math.sin(a) + 1) / 2;   // 0 back, 1 front
      const size = (phone ? 34 : 50) * (0.78 + depth * 0.4) * (1.25 - 0.55 * k);
      p.node.style.setProperty('--s', `${size}px`);
      p.node.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`;
      p.node.style.zIndex = String(Math.round(depth * 100));
      p.node.style.opacity = String(0.5 + depth * 0.5);
      p.node.classList.toggle('far', p.i >= (phone ? 8 : 16));
    }
    // a shooting star now and then
    if (!shoot && now > nextShoot) {
      const fromLeft = Math.random() < 0.5;
      shoot = { x: fromLeft ? -40 : w + 40, y: h * (0.12 + Math.random() * 0.3), vx: (fromLeft ? 1 : -1) * (w * 0.16), vy: h * 0.05, t: 0 };
      el.shoot.hidden = false;
      el.shoot.style.setProperty('--ang', `${Math.atan2(shoot.vy, shoot.vx) * 180 / Math.PI}deg`);
    }
    if (shoot) {
      shoot.t += dt; shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt;
      el.shoot.style.transform = `translate(${shoot.x}px, ${shoot.y}px)`;
      if (shoot.x < -80 || shoot.x > w + 80) { shoot = null; el.shoot.hidden = true; nextShoot = now + 6000 + Math.random() * 5000; }
    }
  }
  requestAnimationFrame(frameLoop);
  el.shoot.addEventListener('click', () => { flash('Caught one ✦'); goNamed(B.randomName()); });

  function toCosmos() {
    if (S.mode === 'ground') { B.recall(); flash('Recalling the probe…'); const t = setInterval(() => { if (S.mode === 'orbit') { clearInterval(t); toCosmos(); } }, 200); return; }
    B.cancelAim();
    drawer = null; tray = false; pop = false; scan = false;
    cosmos = true;
    frame.classList.remove('c-back'); frame.classList.add('c-away');
    buildCosmos();
    el.cos.querySelector('.c-back').hidden = false;
    el.cos.classList.remove('out');
    render();
  }
  function fromCosmos() {
    cosmos = false;
    frame.classList.add('c-back'); frame.classList.remove('c-away');
    el.cos.classList.add('out');
    setTimeout(() => frame.classList.remove('c-back'), 1100);
    render();
  }
  function goNamed(name, node) {
    name = String(name || '').trim();
    if (!name) return;
    const same = S.seed === name;
    if (node) {
      const r = node.getBoundingClientRect();
      node.classList.add('fly');
      node.style.transform = `translate(${innerWidth / 2 - r.width / 2}px, ${innerHeight / 2 - r.height / 2}px) scale(6)`;
      node.style.opacity = '0';
    }
    setTimeout(() => {
      if (!same) { B.go(name); S = { ...S, busy: true }; arrFor = 'pending'; }
      fromCosmos();
    }, node ? 650 : 200);
  }

  // ------------------------------------------------------------ orbit pieces
  function ribbon(st, s) {
    if (!st.has) return `<span class="wv">${WAVE(108, 26, 2, 3)}</span><span class="tx"><b>${esc(st.objective.title)}</b><small>${esc(st.objective.line)}</small></span>`;
    const o = st.objective;
    const band = st.chapters.find((c) => c.id === o.chapter);
    return `<span class="wv">${WAVE(108, 26, 2, 9)}</span><span class="tx"><b>${esc(o.title)}${band && band.band && band.band[0] !== '—' ? ` · ${esc(band.band)}` : ''}</b><small>${esc(o.line)}</small></span>`;
  }
  function renderDrawer() {
    if (!drawer || S.loading) { el.dr.hidden = true; return; }
    if (el.dr.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const st = B.story(), w = B.world();
    let h = `<button type="button" class="x" data-act="close-dr" aria-label="Close">${icon('close', 18)}</button>`;
    if (!st.has) {
      h += `<h2>Signals</h2><p style="color:#c5cdef;margin:6px 0 0">${esc(w.gas ? 'The storms hiss on every band. Nothing here calls for help.' : 'Static on every band. Nothing on this world calls out. Land anywhere, and meet what lives here.')}</p>`;
    } else {
      // the dial: the three bands as marks over 3 to 30 MHz, and the distress band at the right end
      const pos = (c) => (c.id === 'wreck' ? 96 : c.id === 'ruin' ? (!c.band || c.band[0] === '—' ? 50 : 4 + ((parseFloat(c.band) - 3) / 27) * 84) : 70);
      h += `<h2>Signals of ${esc(w.seed)}</h2><span class="k">${st.done} of ${st.of} found</span>
        <div class="c-quote">${esc(st.intro.text)}</div>
        <div class="c-dial">${st.chapters.map((c) => `<i class="${c.state === 'closed' ? 'lock' : c.state === 'open' ? 'q' : 'on'}" style="left:${pos(c)}%" title="${esc(c.title)}"></i>`).join('')}</div>
        ${st.chapters.map((c) => `<div class="c-ch ${c.state}">
          <div class="fq">${c.locked ? '— — —' : c.id === 'way' ? 'a name' : esc(c.band)}</div>
          <div><h3>${c.state === 'done' ? icon('check', 16, 2.4) : c.state === 'closed' ? icon('lock', 15) : icon('signal', 16)}${esc(c.title)}</h3>
            <p>${esc(c.goal)} <span style="color:#9aa6cc">${esc(c.status)}</span></p>
            ${c.state === 'open' && st.objective.chapter === c.id ? `<p class="nx">→ ${esc(st.objective.line)}</p>` : ''}
            ${c.tune ? `<form class="c-tune" data-form="tune"><input name="f" inputmode="decimal" placeholder="Tune the receiver, MHz" autocomplete="off" aria-label="Frequency in MHz"><button type="submit" class="c-go">Tune</button></form><div class="c-tune-ans"></div>` : ''}
            ${c.actions.length ? `<div class="c-acts">${c.actions.filter((a) => !(a.orbitOnly && S.mode !== 'orbit')).map((a) => `<button type="button" class="c-chip ${a.id === 'aim' ? 'hot' : ''}" data-act="${a.id}${a.chapter ? ':' + a.chapter : ''}">${esc(a.label)}</button>`).join('')}</div>` : ''}
          </div></div>`).join('')}`;
    }
    const top = el.dr.scrollTop;
    el.dr.innerHTML = h;
    el.dr.scrollTop = top;
    el.dr.hidden = false;
  }
  function renderTray() {
    const w = B.world();
    const ground = S.mode === 'ground';
    const fauna = w.fauna.map((f, i) => `<button type="button" class="c-card glass" data-act="fauna:${f.kind}" style="animation-delay:${i * 50}ms">${icon('paw', 22)}<b>${esc(f.name)}</b><span>Creature · study</span></button>`).join('');
    const flora = ground ? w.flora.map((p, i) => `<button type="button" class="c-card glass plant" data-act="plant:${p.kind}" style="animation-delay:${(w.fauna.length + i) * 50}ms">${icon('leaf', 22)}<b>${esc(p.name)}</b><span>Plant here · study</span></button>`).join('')
      : `<div class="c-card glass note"><span>${w.gas ? 'A gas giant grows no plants.' : 'Plants live on the ground. Land to meet them.'}</span></div>`;
    el.tray.innerHTML = fauna + flora;
  }
  function renderPop() {
    if (!pop) { el.pop.hidden = true; return; }
    const row = ([d, t, touch]) => `<tr><td>${esc(d)}${touch ? `<small>${esc(touch)}</small>` : ''}</td><td>${esc(t)}</td></tr>`;
    el.pop.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><button type="button" class="c-chip" data-act="sound">${icon(B.music.on ? 'sound' : 'mute', 16)}Music ${B.music.on ? 'on' : 'off'}</button>
      <input type="range" min="0" max="100" value="${Math.round(B.music.vol * 100)}" data-input="vol" aria-label="Volume" style="flex:1;accent-color:#9b8cff" ${B.music.on ? '' : 'disabled'}></div>
      <h3 style="margin-top:16px">How to fly · orbit</h3><table class="c-keys">${CONTROLS.orbit.map(row).join('')}</table>
      <h3 style="margin-top:16px">How to fly · surface</h3><table class="c-keys">${CONTROLS.ground.map(row).join('')}</table>
      <div class="c-acts" style="margin-top:14px">${cosmos ? '' : `<button type="button" class="c-chip" data-act="share">${icon('share', 15)}Copy link</button>`}<button type="button" class="c-chip" data-act="about">${icon('info', 15)}About</button></div>`;
    el.pop.hidden = false;
  }
  // the scan: facts pinned around the globe, recomputed each frame from the camera
  function scanLoop() {
    if (!scan || cosmos) return;
    requestAnimationFrame(scanLoop);
    const g = B.globe();
    if (!g) return;
    const svg = el.scan.querySelector('svg');
    const calls = el.scan.querySelectorAll('.call[data-ang]');
    const w = B.world();
    const tilt = (w.tiltDeg * Math.PI) / 180;
    const ax = Math.sin(tilt) * g.r * 1.32, ay = -Math.cos(tilt) * g.r * 1.32;
    let lines = `<circle cx="${g.x}" cy="${g.y}" r="${g.r + 6}" fill="none" stroke="rgba(124,240,255,.35)" stroke-dasharray="3 6"/>
      <line x1="${g.x - ax}" y1="${g.y - ay}" x2="${g.x + ax}" y2="${g.y + ay}" stroke="rgba(255,143,214,.75)" stroke-width="1.5" stroke-dasharray="6 5"/>
      <circle cx="${g.x + ax}" cy="${g.y + ay}" r="3.5" fill="#ff8fd6"/>
      <line x1="${g.x}" y1="${g.y}" x2="${g.x + g.r}" y2="${g.y}" stroke="rgba(124,240,255,.6)" stroke-width="1"/>
      <circle cx="${g.x}" cy="${g.y}" r="2.5" fill="#7cf0ff"/>`;
    calls.forEach((c) => {
      const ang = +c.dataset.ang;
      const side = Math.cos(ang) >= 0 ? 1 : -1;
      const ex = g.x + Math.cos(ang) * (g.r + 8), ey = g.y + Math.sin(ang) * (g.r + 8);
      const ox = g.x + Math.cos(ang) * (g.r + 46), oy = g.y + Math.sin(ang) * (g.r + 46);
      const lx = ox + side * 26;
      lines += `<polyline points="${ex},${ey} ${ox},${oy} ${lx},${oy}" fill="none" stroke="rgba(170,190,255,.45)" stroke-width="1"/><circle cx="${ex}" cy="${ey}" r="2.5" fill="#cfd6f5"/>`;
      c.style.left = `${lx + side * 6}px`; c.style.top = `${oy}px`;
      c.style.setProperty('--tx', side > 0 ? '0' : '-100%');
    });
    if (c0) { c0.style.left = `${g.x + ax + 10}px`; c0.style.top = `${g.y + ay}px`; c0.style.setProperty('--tx', '0'); }
    if (cr) { cr.style.left = `${g.x + g.r / 2}px`; cr.style.top = `${g.y - 16}px`; cr.style.setProperty('--tx', '-50%'); }
    svg.innerHTML = lines;
  }
  let c0 = null, cr = null;
  function startScan() {
    const w = B.world();
    const pick = w.facts.filter((f) => f.k !== 'radius');
    const left = pick.slice(0, Math.ceil(pick.length / 2)), right = pick.slice(Math.ceil(pick.length / 2));
    const spread = (n, mid) => Array.from({ length: n }, (_, i) => mid + (n === 1 ? 0 : ((i / (n - 1)) - 0.5) * 1.5));
    const la = spread(left.length, Math.PI), ra = spread(right.length + 1, 0);
    const call = (f, ang, i) => `<div class="call glass" data-ang="${ang}" style="animation-delay:${i * 60}ms"><span class="k">${esc(f.label)}</span><b>${esc(f.value)}</b></div>`;
    el.scan.querySelector('.calls').innerHTML =
      left.map((f, i) => call(f, la[i], i)).join('') +
      right.map((f, i) => call(f, ra[i], i + left.length)).join('') +
      `<div class="call glass btn" data-ang="${ra[right.length]}" data-act="life" style="animation-delay:${pick.length * 60}ms"><span class="k">Life</span><b>${w.fauna.length} ${w.fauna.length === 1 ? 'creature' : 'creatures'} ›</b></div>` +
      `<div class="call glass cr" style="animation-delay:40ms;padding:4px 10px"><span class="k">Radius</span><b style="font-size:13px">${esc((w.facts.find((f) => f.k === 'radius') || {}).value || '')}</b></div>`;
    c0 = null; cr = el.scan.querySelector('.cr');
    el.strip.innerHTML = w.facts.map((f) => `<div class="call glass"><span class="k">${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join('');
    requestAnimationFrame(scanLoop);
  }

  // ------------------------------------------------------------ the arrival: the signal unfolds
  function renderArr() {
    const st = B.story(), w = B.world();
    if (!st.has) { flash(`${w.seed} · ${w.typeLabel} · ${st.objective.kicker}`); return; }
    if (st.done > 0 || st.chapters[0].fixes.length) { flash(`Welcome back to ${w.seed}`); return; }
    el.arr.innerHTML = `<div class="k"><span style="width:8px;height:8px;border-radius:50%;background:#ff8fd6;display:inline-block;animation:c-blink 1s steps(2) infinite"></span>Incoming · ${esc(st.intro.years)} years old · ${esc(st.intro.band)}</div>
      <h2>A distress signal from ${esc(w.designation)}</h2>
      <div class="wv2">${WAVE(800, 34, 12, 12)}</div>
      <p>${esc(st.intro.text)}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="c-go" data-act="arr-ok">${icon('signal', 16)}Follow the signal</button><button type="button" class="c-ghost" data-act="arr-close">Later</button></div>`;
    el.arr.hidden = false;
  }
  function flash(t) { el.toast.textContent = t; show(el.toast, true); clearTimeout(flash.t); flash.t = setTimeout(() => show(el.toast, false), 2200); }

  // ------------------------------------------------------------ the frame
  function render() {
    const s = S;
    const ready = !s.loading && !s.busy;
    const quiet = cosmos || !ready || s.dive || s.card || s.dialog || s.mode === 'descending' || s.mode === 'ascending';
    const ground = s.mode === 'ground';
    if (!cosmos && ready && arrFor === 'pending') {
      arrFor = s.seed;
      setTimeout(() => { if (arrFor === s.seed && !S.busy && !cosmos) { renderArr(); render(); } }, 1000);
    }
    const arriving = !el.arr.hidden;
    if (arriving && (s.card || s.dialog || cosmos)) el.arr.hidden = true;
    const st = ready ? B.story() : null;
    if (st) {
      const w = B.world();
      el.title.innerHTML = `<b>${esc(w.seed)}</b><span>${esc(w.typeLabel)} · ${esc(w.designation)}</span>`;
      el.rib.innerHTML = ribbon(st, s);
      el.rib.classList.toggle('quiet', !st.has);
      el.rail.querySelector('.c-orbit').innerHTML = `${w.thumb ? `<img alt="" src="${w.thumb}">` : icon('planet', 18)}<span class="lbl">Orbit</span>`;
    }
    show(el.title, !quiet && !ground && !s.aiming);
    show(el.tr, !quiet && !s.aiming);
    show(el.rib, !quiet && !s.aiming && !drawer && !arriving);
    show(el.aim, !quiet && s.aiming);
    show(el.rail, !quiet || (!cosmos && (s.mode === 'descending' || s.mode === 'ascending')));
    el.scan.hidden = !(scan && !quiet && !ground && !s.aiming);
    show(el.strip, scan && !quiet && !ground && !s.aiming);
    show(el.tray, tray && !quiet && !s.aiming);
    el.rail.classList.toggle('compact', (tray || (scan && !ground)) && innerWidth <= 760);
    if (tray && !quiet) renderTray();
    root.querySelector('.C > .c-tr [data-act="scan"]').classList.toggle('on', scan);
    root.querySelector('.C > .c-tr [data-act="life"]').classList.toggle('on', tray);
    root.querySelector('.C > .c-tr [data-act="settings"]').classList.toggle('on', pop && !cosmos);
    // the rail
    const nodes = el.rail.querySelectorAll('.c-node');
    nodes[0].classList.toggle('here', cosmos);
    nodes[1].classList.toggle('here', !cosmos && !ground);
    nodes[2].classList.toggle('here', ground);
    el.rail.querySelectorAll('.c-wire')[1].classList.toggle('lit', ground);
    const big = el.big;
    big.className = 'c-big';
    let ic = 'down', lbl = 'Land a probe';
    if (s.gas) { big.classList.add('off'); ic = 'lock'; lbl = 'No surface'; }
    else if (s.aiming) { big.classList.add('aim'); ic = 'close'; lbl = 'Cancel'; }
    else if (ground) { ic = 'up'; lbl = 'Recall'; }
    else if (s.mode !== 'orbit') { big.classList.add('off', 'busy'); ic = 'probe'; lbl = s.mode === 'descending' ? 'Landing…' : 'Climbing…'; }
    big.innerHTML = `${icon(ic, 30, 2.4)}<span class="lbl">${lbl}</span>`;
    // the context action
    if (s.ctx) el.ctx.innerHTML = `${icon('target', 18, 2)}<span>${esc(s.ctx)}</span>`;
    show(el.ctx, !quiet && ground && !!s.ctx && !tray);
    if (drawer && quiet) el.dr.hidden = true; else if (drawer) renderDrawer();
    if (pop) renderPop();
    const phone = innerWidth <= 760;
    B.hudInsets({ top: phone ? 120 : 110, bottom: 22, left: phone ? 12 : 22, right: phone ? 104 : 130 });
  }

  // ------------------------------------------------------------ input
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    const [act, arg] = t.dataset.act.split(/:(.*)/s);
    if (act === 'world') { goNamed(arg, t); return; }
    if (act === 'surprise') { const n = B.randomName(); const inp = el.cos.querySelector('input'); inp.value = n; glow(n); setTimeout(() => goNamed(n), 500); return; }
    if (act === 'back') { fromCosmos(); return; }
    if (act === 'cosmos') { toCosmos(); return; }
    if (act === 'scan') { scan = !scan; tray = false; drawer = null; el.dr.hidden = true; if (scan) startScan(); }
    else if (act === 'life') { tray = !tray; scan = false; drawer = null; el.dr.hidden = true; }
    else if (act === 'settings') { pop = !pop; renderPop(); }
    else if (act === 'signals') { drawer = drawer ? null : 'signals'; scan = false; tray = false; renderDrawer(); }
    else if (act === 'close-dr') { drawer = null; el.dr.hidden = true; }
    else if (act === 'big' || act === 'surfnode' || act === 'orbitnode') {
      if (S.gas) return;
      if (act === 'orbitnode' && S.mode !== 'ground') return;
      if (act === 'surfnode' && S.mode === 'ground') return;
      drawer = null; el.dr.hidden = true; scan = false; tray = false; el.arr.hidden = true;
      if (S.aiming) B.cancelAim(); else if (S.mode === 'ground') B.recall(); else if (S.mode === 'orbit') B.aim();
    }
    else if (act === 'study') B.study();
    else if (act === 'fauna') B.inspect(+arg);
    else if (act === 'plant') B.inspectPlant(+arg);
    else if (act === 'brief') B.brief();
    else if (act === 'lost') B.lost();
    else if (act === 'clear') { B.clear(); setTimeout(renderDrawer, 60); }
    else if (act === 'aim') { drawer = null; el.dr.hidden = true; B.aimAt(arg); }
    else if (act === 'about') B.about();
    else if (act === 'share') B.share().then((ok) => flash(ok ? 'Link copied' : B.shareUrl()));
    else if (act === 'sound') { B.music.toggle(); setTimeout(renderPop, 30); }
    else if (act === 'arr-ok') { el.arr.hidden = true; drawer = 'signals'; renderDrawer(); }
    else if (act === 'arr-close') { el.arr.hidden = true; }
    render();
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.dataset.form === 'go') goNamed(f.querySelector('input').value);
    else if (f.dataset.form === 'tune') {
      const a = B.tune(f.querySelector('input').value);
      const ans = f.nextElementSibling;
      ans.textContent = a.text; ans.dataset.kind = a.kind;
      if (a.kind === 'lock') { f.querySelector('input').blur(); setTimeout(renderDrawer, 1200); }
    }
  });
  const glow = (v) => el.cos.querySelector('.c-star').style.setProperty('--glow', String(Math.min(30, v.length * 3)));
  root.addEventListener('input', (e) => {
    if (e.target.dataset.input === 'vol') B.music.set(e.target.value / 100);
    else if (e.target.closest('.c-name')) glow(e.target.value);
  });
  const onEsc = (e) => {
    if (e.key !== 'Escape') return;
    if (pop) pop = false; else if (drawer) { drawer = null; el.dr.hidden = true; } else if (!el.arr.hidden) el.arr.hidden = true;
    else if (scan || tray) { scan = false; tray = false; }
    renderPop(); render();
  };
  addEventListener('keydown', onEsc);
  B.onFrameKey(onEsc);
  addEventListener('resize', () => { render(); if (scan) startScan(); });

  B.ready.then(() => { buildCosmos(); B.doc.addEventListener('pointerdown', () => { if (pop) { pop = false; renderPop(); render(); } }, true); });
  B.subscribe((s) => {
    if (s.seed && lastSeed !== null && s.seed !== lastSeed && arrFor !== 'pending') arrFor = 'pending';
    if (s.seed) lastSeed = s.seed;
    const wasScan = scan;
    S = s;
    if (s.mode !== 'orbit' && scan) scan = false;
    render();
    if (wasScan && !scan) el.scan.hidden = true;
  });
  if (cosmos) { B.loader(false); buildCosmos(); }
  const _go = B.go;
  B.go = (n) => { B.loader(true); return _go(n); };
}
