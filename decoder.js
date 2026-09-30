// myworlds — the decoder of chapter 3: the reader reads the name on the card of the ruin.
//
// The last row of the card of the ruin holds the name in the script of the makers. From chapter 3
// on, the row holds this form under it:
//
//   the reply   the call sign of the ship, as the ruin sends it back: each glyph over its letter.
//               It is the key. The same script writes every glyph, so a glyph of the reply that
//               stands in the name too has the same letter there
//   the sounds  the sixteen sounds the probe hears in the call. A name is two to four of them. A tap
//               on a sound writes its letters into the fields from the field that has the focus
//   the name    one field under each glyph of the name. Two equal glyphs share one letter, so a
//               letter typed under one glyph fills every field of that glyph
//   the send    the button sends the name. The ruin lights each glyph that is right, and the right
//               name opens the way. There is no limit on the sends
//
// The letters belong to the reader and not to one world: the codex of carrier-store.js keeps them,
// and the fields of the next world start with them. A glyph that lit in a send is proven, and its
// field shows it in the colour of the ruin.
//
// The form never holds the name. sendName() of way-types.js runs in the page, and the form shows the
// answer it gets back. It holds no three.js. See docs/issues/p3-00-the-way-on.md.

// A glyph as inline SVG, on the pattern of glyphSvg() of ground-source.js: the strokes of one glyph
// hanging from the rule at y = 0, in a box of one unit. The SVG holds no text.
const f3 = (v) => String(Math.round(v * 1000) / 1000);
function glyphCell(g) {
  const W = 0.7, lines = [], dots = [];
  for (const s of g || []) {
    if (s.length === 1) dots.push(`<circle cx="${f3(s[0][0] * W)}" cy="${f3(s[0][1])}" r="0.075"/>`);
    else lines.push(`<polyline points="${s.map(([x, y]) => `${f3(x * W)},${f3(y)}`).join(' ')}"/>`);
  }
  const rule = g && g.length ? '<line x1="-0.2" y1="0" x2="0.9" y2="0"/>' : '';
  return `<svg viewBox="-0.2 -0.15 1.1 1.3" width="22" height="26" aria-hidden="true" focusable="false">`
    + `<g fill="none" stroke="currentColor" stroke-width="0.085" stroke-linecap="round" stroke-linejoin="round">${rule}${lines.join('')}</g>`
    + `<g fill="currentColor">${dots.join('')}</g></svg>`;
}

let serial = 0;

// Build one decoder.
//
//   key       wayKey() of way-types.js: the glyphs and the slots of the name, the reply, the sounds
//   codex     readCodex() of carrier-store.js: { letters, proven }
//   probe     the name of the ship, for the label of the reply
//   onChange  (codex) => void, after every letter the reader types
//   onSend    (text) => the answer of sendName(): { kind, lit, text }
//
// Gives { el, focus() }.
export function makeDecoder({ key, codex, probe, onChange, onSend }) {
  const id = `dec${++serial}`;
  const el = document.createElement('div');
  el.className = 'decoder';
  const reply = key.reply
    ? `<div class="dec-part"><span class="dec-label">The reply · the call sign of ${esc(probe || 'the ship')}</span>`
      + `<div class="dec-line dec-reply">${key.reply.glyphs.map((g, i) => {
        const ch = key.reply.text[i] || '';
        return g.length ? `<span class="dec-cell">${glyphCell(g)}<b>${esc(ch)}</b></span>` : '<span class="dec-gap"></span>';
      }).join('')}</div></div>`
    : '';
  const sounds = `<div class="dec-part"><span class="dec-label">The sounds of the call</span>`
    + `<div class="dec-sounds">${key.sounds.map((s) => `<button type="button" class="chip dec-sound" data-sound="${s}">${s}</button>`).join('')}</div></div>`;
  const cells = key.glyphs.map((g, i) => `<label class="dec-cell dec-in" data-i="${i}">${glyphCell(g)}`
    + `<input type="text" maxlength="1" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"`
    + ` data-slot="${key.slots[i]}" data-i="${i}" aria-label="The letter of mark ${i + 1}"></label>`).join('');
  el.innerHTML = reply + sounds
    + `<form class="dec-part dec-form" novalidate><span class="dec-label" id="${id}-label">The name</span>`
    + `<div class="dec-line dec-name" role="group" aria-labelledby="${id}-label">${cells}</div>`
    + `<div class="dec-row"><button type="submit" class="dec-send">Send the name</button>`
    + `<button type="button" class="chip dec-clear">Clear</button></div>`
    + `<p class="dec-answer" id="${id}-answer" aria-live="polite"></p></form>`;

  const form = el.querySelector('.dec-form');
  const inputs = [...el.querySelectorAll('.dec-name input')];
  const answer = el.querySelector('.dec-answer');
  const letters = { ...codex.letters };
  const proven = { ...codex.proven };
  let focusAt = 0;

  // Every field of one glyph shows the letter of the codex, and a proven letter takes the colour.
  const paint = () => {
    for (const f of inputs) {
      const k = f.dataset.slot;
      f.value = letters[k] ? letters[k].toUpperCase() : '';
      f.parentElement.classList.toggle('known', !!proven[k] && letters[k] != null);
    }
  };
  const save = () => { if (onChange) onChange({ letters: { ...letters }, proven: { ...proven } }); };
  const clearMarks = () => inputs.forEach((f) => f.parentElement.classList.remove('lit', 'dark'));
  const setLetter = (k, ch) => {
    if (ch) {
      if (letters[k] !== ch) delete proven[k];
      letters[k] = ch;
    } else {
      delete letters[k];
      delete proven[k];
    }
  };
  // A letter moves the focus to the next mark, filled or not, so a reader who types the whole name
  // from the first mark puts each letter under its own glyph. The focus selects the letter there,
  // so the next key replaces it.
  const next = (i) => Math.min(inputs.length - 1, i + 1);

  inputs.forEach((f, i) => {
    f.addEventListener('focus', () => { focusAt = i; f.select(); });
    f.addEventListener('input', () => {
      const ch = (f.value.match(/[a-z]/i) || [''])[0].toLowerCase();
      setLetter(f.dataset.slot, ch);
      clearMarks();
      paint();
      save();
      if (ch) inputs[next(i)].focus();
    });
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !f.value && i > 0) {
        e.preventDefault();
        const b = inputs[i - 1];
        setLetter(b.dataset.slot, '');
        clearMarks(); paint(); save();
        b.focus();
      } else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); inputs[i - 1].focus(); }
      else if (e.key === 'ArrowRight' && i < inputs.length - 1) { e.preventDefault(); inputs[i + 1].focus(); }
    });
  });

  // A sound writes its letters from the field that last held the focus.
  el.querySelectorAll('.dec-sound').forEach((b) => b.addEventListener('click', () => {
    let i = focusAt;
    for (const ch of b.dataset.sound) {
      if (i >= inputs.length) break;
      setLetter(inputs[i].dataset.slot, ch);
      i++;
    }
    clearMarks(); paint(); save();
    focusAt = Math.min(inputs.length - 1, i);
    inputs[focusAt].focus();
  }));

  el.querySelector('.dec-clear').addEventListener('click', () => {
    for (const f of inputs) if (!proven[f.dataset.slot]) setLetter(f.dataset.slot, '');
    clearMarks(); paint(); save();
    answer.textContent = '';
    const first = inputs.find((f) => !f.value);
    (first || inputs[0]).focus();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = inputs.map((f) => f.value || ' ').join('');
    const a = onSend ? onSend(text) : null;
    if (!a) return;
    answer.textContent = a.text;
    answer.dataset.kind = a.kind;
    if (a.kind === 'empty' || a.kind === 'short') return;
    // The ruin lights each right glyph. A lit glyph is proven in the codex.
    a.lit.forEach((on, i) => {
      const cell = inputs[i].parentElement;
      cell.classList.toggle('lit', on);
      cell.classList.toggle('dark', !on);
      if (on) proven[inputs[i].dataset.slot] = true;
    });
    save();
    if (a.kind === 'open') el.classList.add('open');
  });

  paint();
  return {
    el,
    focus() { const first = inputs.find((f) => !f.value); (first || inputs[0]).focus(); },
  };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
