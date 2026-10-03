// PROTOTYPE — the switcher and the boot of one concept. See NOTES.md.
import { makeBridge } from './bridge.js';

const VARIANTS = {
  A: { file: './variant-a.js' },
  B: { file: './variant-b.js' },
  C: { file: './variant-c.js' },
};
const KEYS = Object.keys(VARIANTS);

const q = new URLSearchParams(location.search);
const key = KEYS.includes((q.get('variant') || 'A').toUpperCase()) ? (q.get('variant') || 'A').toUpperCase() : 'A';
const seed = q.get('seed');
const showStart = !seed || q.get('start') === '1';

const frame = document.getElementById('app');
const root = document.getElementById('ui');
const bridge = makeBridge(frame, { seed, showStart });

const mod = await import(VARIANTS[key].file);
document.getElementById('proto-key').textContent = key;
document.getElementById('proto-name').textContent = `— ${mod.meta.name}`;
document.title = `${key} · ${mod.meta.name} — My Worlds UI concepts`;
document.getElementById('proto-map').innerHTML = mod.meta.map;
mod.mount(root, bridge, { showStart });

function go(next, start = false) {
  const p = new URLSearchParams();
  p.set('variant', next);
  const s = bridge.seed();
  if (s && !start) p.set('seed', s);
  if (start && s) { p.set('seed', s); p.set('start', '1'); }
  location.search = p.toString();
}
const cycle = (d) => go(KEYS[(KEYS.indexOf(key) + d + KEYS.length) % KEYS.length]);
document.querySelectorAll('#proto [data-go]').forEach((b) => b.addEventListener('click', () => cycle(+b.dataset.go)));
document.getElementById('proto-start').addEventListener('click', () => go(key, true));
document.getElementById('proto-info').addEventListener('click', () => {
  const m = document.getElementById('proto-map');
  m.hidden = !m.hidden;
});
document.getElementById('proto-min').addEventListener('click', (e) => {
  const nav = document.getElementById('proto');
  nav.classList.toggle('min');
  e.currentTarget.textContent = nav.classList.contains('min') ? '+' : '–';
  document.getElementById('proto-map').hidden = true;
});
// [ and ] cycle the concepts. The arrow keys steer the probe on the ground, so they stay with the app.
const onKey = (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.key === '[') cycle(-1);
  else if (e.key === ']') cycle(1);
};
addEventListener('keydown', onKey);
bridge.onFrameKey(onKey);
