// myworlds — the stroke icons of the interface. 24 by 24, drawn in currentColor.
//
//   icon(name, size, stroke)   the markup of one icon, as a string
//   fillIcons(root)            puts the icon into every [data-icon] element under root
//   wave(stroke)               the wave of a signal, an SVG twice as wide as its box
const PATHS = {
  planet: '<circle cx="12" cy="12" r="6.5"/><path d="M3.2 15.6c-1.4 2.2-1.2 3.7 1.1 3.9 3 .3 8.6-1.6 12.7-4.6 3.8-2.7 5.3-5.6 3.6-6.6-.7-.4-1.8-.4-3.1-.1"/>',
  signal: '<path d="M12 13v8"/><circle cx="12" cy="11" r="2"/><path d="M8.2 7.2a5.4 5.4 0 0 0 0 7.6M15.8 7.2a5.4 5.4 0 0 1 0 7.6M5.3 4.3a9.5 9.5 0 0 0 0 13.4M18.7 4.3a9.5 9.5 0 0 1 0 13.4"/>',
  down: '<path d="M12 4v14M6 12l6 6 6-6"/>',
  up: '<path d="M12 20V6M6 12l6-6 6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19l8-8"/>',
  paw: '<circle cx="7" cy="10" r="1.8"/><circle cx="11" cy="6.5" r="1.8"/><circle cx="15.5" cy="7.5" r="1.8"/><circle cx="18" cy="11.5" r="1.8"/><path d="M8.5 17.5c0-3 2-5 4-5s4.5 2 4.5 4.5-2 3-4.2 3-4.3 0-4.3-2.5z"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  pad: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="16" cy="11" r=".9" fill="currentColor"/><circle cx="18" cy="13.5" r=".9" fill="currentColor"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  cross: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  wave: '<path d="M2 12c2 0 2-5 4-5s2 10 4 10 2-12 4-12 2 14 4 14 2-7 4-7"/>',
};

export const icon = (name, size = 22, stroke = 1.8) =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;

export function fillIcons(root) {
  for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon, +el.dataset.size || 22);
}

// The wave of a signal: one path, twice as wide as its box. The style slides it by half its width,
// so it runs without a seam. The arrival draws it in orange, and the signal block of the probe
// overlay draws it in the colour of its chapter, through currentColor.
const WAVE_PATH = (() => {
  const w = 800, h = 40;
  let d = `M0 ${h / 2}`;
  for (let i = 0; i <= 192; i++) {
    const x = (i / 192) * w;
    const y = h / 2 + Math.sin((i / 8) * Math.PI * 2) * 13 * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)));
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
})();

export const wave = (stroke = 'currentColor') =>
  `<svg viewBox="0 0 800 40" preserveAspectRatio="none" aria-hidden="true"><path d="${WAVE_PATH}" fill="none" stroke="${stroke}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
