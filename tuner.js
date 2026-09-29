// myworlds — the tuner of the receiver. Phase 2, p2-39. See "The tuner" in docs/ruin.md.
//
// The last entry of the log of the wreck states a frequency, and the reader types it here. That act
// makes the receiver hold the band of the next search, so the tuner is a field and not a button:
// only a reader who read the number can start that search.
//
// One function builds the form, and the page stands it in two places: under the last entry of the
// card of the wreck, and in the Carrier row of the sidebar. So the two places cannot drift.
//
// The form gives the typed text to the page, and tune() of chapters.js compares it with the band
// and gives back one of five answers, from tuneAnswer() here. The form never holds the band before
// the lock: no attribute, no list, no title, and no hint of the field holds it. The page gives the
// band to the form only after the lock, and the form then shows the band and no field.
//
// tuneAnswer() holds no DOM, so tools/carrier-fix-check.mjs tests every answer in Node.
import { parseFreq } from './ruin-types.js';
import { WRECK_FREQ } from './carrier.js';

export const LOCK_BAND = 0.0005;   // MHz: a number this near the frequency locks the receiver
export const NEAR_BAND = 0.050;    // MHz: a number this near gives the near miss
const SLACK = 1e-9;                // MHz: the error of a float, so 7.3155 against 7.316 counts as 0.0005
const FIELD_MAX = 12;              // characters: '999999999999' still prints as a number, not as 1e+21

// The five answers of p2-39, word for word. The lock prints the band the receiver now holds. The
// near miss and the static print the typed number to three decimals.
const ORDINAL = { 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth' };
export const ANSWERS = {
  nan: 'The receiver takes a number in MHz, for example 406.025.',
  distress: 'The receiver holds the distress band.',
  lock: (f, nth = 2) => `Locked on ${f} MHz. The probe hears a ${ORDINAL[nth] || 'new'} source.`,
  near: (f) => `A pattern under the static on ${f} MHz.`,
  static: (f) => `Static on ${f} MHz.`,
};

// The answer to one text the reader typed, against the frequency of a source, `freq` as
// world.ruin.freq keeps it: `{ kind, text }`. `nth` counts the source the lock makes the receiver
// hear, 2 for the ruin; the text of the lock names it. `kind` is 'nan', 'distress', 'lock', 'near', or
// 'static', and only 'lock' tunes the world. The distress band comes first, because it is the one
// band of the overlay the reader has seen, and a reader who types it must learn that the receiver
// holds it already.
export function tuneAnswer(text, freq, nth = 2) {
  const v = parseFreq(text);
  if (v == null) return { kind: 'nan', text: ANSWERS.nan };
  const within = (a, b, band) => Math.abs(a - b) <= band + SLACK;
  if (within(v, Number(WRECK_FREQ), LOCK_BAND)) return { kind: 'distress', text: ANSWERS.distress };
  const f = Number(freq);
  const typed = v.toFixed(3);
  if (Number.isFinite(f) && within(v, f, LOCK_BAND)) return { kind: 'lock', text: ANSWERS.lock(freq, nth) };
  if (Number.isFinite(f) && within(v, f, NEAR_BAND)) return { kind: 'near', text: ANSWERS.near(typed) };
  return { kind: 'static', text: ANSWERS.static(typed) };
}

let uid = 0;

// One tuner: a label, a field, the unit, a button, and a line of answer, and a locked view for
// after the tune. The page calls this once for each place and keeps the result, so the text in the
// field and the last answer outlive a render of the sidebar.
//
//   onTune(text)   the reader sent a text. The page gives back the answer, `{ kind, text }`; on a
//                  lock it tunes the world and calls set() again before it returns.
//   onEscape()     Escape in the field. Only the sidebar gives it: there it closes the form. The
//                  card gives none, so Escape goes on to the page and closes the card.
//
// set({ seed, freq, tuned }) shows the state of a world. A new seed clears the field and the answer,
// so a second world never shows the answer of the first. The page hides the root element on a world
// that takes no tuner.
export function makeTuner({ onTune, onEscape } = {}) {
  const id = `tuner-${++uid}`;
  const el = document.createElement('div');
  el.className = 'tuner';
  el.innerHTML = `
    <form class="tuner-form" novalidate>
      <label class="tuner-label" for="${id}-field">Tune the receiver</label>
      <div class="tuner-row">
        <input class="tuner-field" id="${id}-field" type="text" inputmode="decimal" autocomplete="off"
          autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"
          maxlength="${FIELD_MAX}" placeholder="406.025" aria-describedby="${id}-answer">
        <span class="tuner-unit">MHz</span>
        <button type="submit" class="tuner-go">Tune</button>
      </div>
    </form>
    <div class="tuner-lock" hidden>
      <span class="tuner-label">Receiver</span>
      <b class="tuner-band"></b>
      <span class="tuner-state">locked</span>
    </div>
    <p class="tuner-answer" id="${id}-answer" aria-live="polite"></p>`;
  const form = el.querySelector('.tuner-form');
  const field = el.querySelector('.tuner-field');
  const lock = el.querySelector('.tuner-lock');
  const band = el.querySelector('.tuner-band');
  const answer = el.querySelector('.tuner-answer');
  let seed = null, freq = null, tuned = false;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (tuned || !seed || !onTune) return;
    const a = onTune(field.value);
    answer.textContent = a.text;
    answer.dataset.kind = a.kind;
  });
  if (onEscape) {
    field.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();   // the page would take the key for the card or the aim
      onEscape();
    });
  }

  function set(next) {
    if (!next || next.seed !== seed) {
      field.value = '';
      answer.textContent = '';
      delete answer.dataset.kind;
    }
    seed = next ? next.seed : null;
    freq = next ? next.freq : null;
    tuned = !!(next && next.tuned);
    form.hidden = tuned;
    lock.hidden = !tuned;
    // the band enters the page here, after the lock, and never before it
    band.textContent = tuned && freq ? `${freq} MHz` : '';
  }

  return {
    el, field, answer,
    set,
    focus() { if (!tuned) field.focus({ preventScroll: true }); },
    get tuned() { return tuned; },
  };
}
