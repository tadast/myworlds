// myworlds — procedural chip-tune for each world, seeded by the world.
// Web Audio only: pulse and triangle voices, a pad, light percussion, a noise wash for the wind, a small reverb and an echo.
const STORE_KEY = 'myworlds.music';
const STEP_LOOK = 0.5;      // seconds of notes scheduled ahead
const FADE_IN = 8, FADE_OUT = 1.6, SWAP_IN = 5;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

function cyrb32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


// ---------------------------------------------------------------- material
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], minor: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11], phrygianDom: [0, 1, 4, 5, 7, 8, 10],
  ukrainianDorian: [0, 2, 3, 6, 7, 9, 10], // dorian with a raised 4th: the folk colour of the Witcher scores
};
// Mood per world type: modes, tempo range, swing range, whether the kick plays, the lead timbre pair, the pad cutoff, the wind.
const MOOD = {
  terran: { modes: ['major', 'mixolydian'], tempo: [96, 124], swing: [0.52, 0.58], kick: true, lead: ['p50', 'p25'], padCut: 900, wind: { f: 500, q: 0.8, g: 0.5, lfo: 0.05 } },
  ocean: { modes: ['lydian', 'major'], tempo: [88, 112], swing: [0.55, 0.6], kick: false, lead: ['p50', 'triangle'], padCut: 1100, wind: { f: 700, q: 0.5, g: 0.8, lfo: 0.08 } },
  desert: { modes: ['phrygianDom', 'harmonicMinor', 'ukrainianDorian'], tempo: [92, 118], swing: [0.5, 0.55], kick: true, lead: ['p25', 'p12'], padCut: 800, wind: { f: 450, q: 0.9, g: 0.6, lfo: 0.04 } },
  ice: { modes: ['minor', 'dorian'], tempo: [84, 108], swing: [0.5, 0.54], kick: false, lead: ['p12', 'p12'], padCut: 1600, wind: { f: 2200, q: 6, g: 0.35, lfo: 0.06 } },
  lava: { modes: ['phrygian', 'minor'], tempo: [100, 126], swing: [0.5, 0.53], kick: true, lead: ['p50', 'p25'], padCut: 600, wind: { f: 260, q: 0.6, g: 0.9, lfo: 0.11, low: true } },
  gas: { modes: ['lydian', 'dorian'], tempo: [80, 100], swing: [0.56, 0.62], kick: false, lead: ['p50', 'triangle'], padCut: 700, wind: { f: 160, q: 0.5, g: 1.1, lfo: 0.03, low: true } },
  exotic: { modes: ['ukrainianDorian', 'lydian', 'harmonicMinor'], tempo: [92, 120], swing: [0.52, 0.58], kick: true, lead: ['p25', 'p12'], padCut: 1000, wind: { f: 1200, q: 3, g: 0.5, lfo: 0.07 } },
};
// Chord progressions per mode as 0-based scale degrees. Each one loops well.
const PROGS = {
  major: [[0, 5, 3, 4], [0, 3, 4, 0], [0, 2, 3, 4], [0, 5, 1, 4], [3, 4, 2, 5]],
  mixolydian: [[0, 6, 3, 0], [0, 3, 6, 0], [0, 6, 0, 3]],
  lydian: [[0, 1, 0, 1], [0, 1, 5, 1], [0, 4, 1, 0]],
  dorian: [[0, 3, 0, 3], [0, 3, 6, 0], [0, 1, 3, 6]],
  minor: [[0, 5, 2, 6], [0, 6, 5, 4], [0, 3, 4, 0], [5, 6, 0, 4]],
  phrygian: [[0, 1, 0, 1], [0, 1, 6, 0], [0, 6, 1, 0]],
  harmonicMinor: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 5, 4, 0]],
  phrygianDom: [[0, 1, 0, 1], [0, 1, 3, 0], [0, 6, 1, 0]],
  ukrainianDorian: [[0, 3, 0, 3], [0, 3, 6, 0], [0, 6, 3, 0]],
};
// Rhythm cells for one bar of sixteen steps. A negative number is a rest. Room to breathe.
const CELLS = [
  [4, 4, 8], [2, 2, 4, 8], [4, 2, 2, 4, 4], [3, 3, 2, 8], [2, 2, 4, 2, 2, 4], [6, 2, 8], [4, 4, 4, -4], [2, 2, -4, 4, 4], [3, 3, 2, 4, -4],
  [4, -2, 2, 4, 4], [2, 2, 2, 2, 8], [-2, 2, 4, 8], [4, 4, 2, 2, 4], [6, 2, 4, 4], [2, -2, 4, 2, 2, 4],
];
const CADENCES = [[8, 8], [4, 4, 8], [12, -4], [2, 2, 12], [4, 12], [6, 2, 8]];
const BASS_RHYTHMS = [[0, 4, 8, 12], [0, 6, 8, 14], [0, 8, 12], [0, 3, 6, 8, 11, 14], [0, 8], [0, 6, 8, 12, 14]];
const BARS = 32; // intro 4, A 8, B 8, A' 8, outro 4
const STEPS = BARS * 16;

const pickWith = (rng) => (arr) => arr[Math.floor(rng() * arr.length)];
const gaussWith = (rng) => () => { let s = 0; for (let i = 0; i < 4; i++) s += rng(); return (s - 2) / 1.15; };
const weightedWith = (rng) => (items) => {
  let sum = 0; for (const [, w] of items) sum += w;
  let r = rng() * sum;
  for (const [v, w] of items) { r -= w; if (r <= 0) return v; }
  return items[items.length - 1][0];
};
// Voss-McCartney 1/f noise: several dice, each re-rolled when its bit of the counter flips.
// A melody drawn from it wanders like a tune, not like a random walk.
function voss(rng, dice = 5) {
  const vals = Array.from({ length: dice }, () => rng());
  let n = 0;
  return () => {
    n++;
    for (let k = 0; k < dice; k++) if ((n >> k) & 1 && !((n - 1) >> k & 1)) vals[k] = rng();
    let s = 0; for (const v of vals) s += v;
    return s / dice;
  };
}

// ---------------------------------------------------------------- synth
// Band-limited pulse waves, a deterministic noise buffer, and the voices the song uses.
class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    this.waves = {};
    for (const [name, duty] of [['p12', 0.125], ['p25', 0.25], ['p50', 0.5]]) {
      const N = 32, re = new Float32Array(N), im = new Float32Array(N);
      for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
      this.waves[name] = ctx.createPeriodicWave(re, im, { disableNormalization: false });
    }
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; d[i] = (seed / 4294967296) * 2 - 1; }
    this.noiseBuf = buf;
  }
  osc(wave, hz) {
    const o = this.ctx.createOscillator();
    if (this.waves[wave]) o.setPeriodicWave(this.waves[wave]); else o.type = wave;
    o.frequency.value = hz;
    return o;
  }
  // One note. `wave` is a name or [w1, w2]: the timbre crosses from w1 to w2 at `sweepAt` seconds, the NES duty trick.
  // a/d/s/r: attack, decay, sustain level, release. vib: { rate, depth (cents), delay }.
  note({ wave, midi, t, dur, level, a = 0.005, d = 0, s = 1, r = 0.08, vib, sweepAt, out }) {
    const ctx = this.ctx, f = midiHz(midi), end = t + dur + r + 0.02;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + a);
    if (d > 0) g.gain.setTargetAtTime(level * s, t + a, d / 3);
    const hold = Math.max(t + a, t + dur);
    g.gain.setValueAtTime(d > 0 ? level * s : level, hold);
    g.gain.exponentialRampToValueAtTime(0.0001, hold + r);
    g.connect(out);
    const waves = Array.isArray(wave) ? wave : [wave];
    const oscs = waves.map((w) => this.osc(w, f));
    if (oscs.length === 2) {
      const at = t + (sweepAt ?? Math.min(dur * 0.4, 0.12));
      const g1 = ctx.createGain(), g2 = ctx.createGain();
      g1.gain.setValueAtTime(1, t); g1.gain.setValueAtTime(1, at); g1.gain.linearRampToValueAtTime(0, at + 0.04);
      g2.gain.setValueAtTime(0, t); g2.gain.setValueAtTime(0, at); g2.gain.linearRampToValueAtTime(1, at + 0.04);
      oscs[0].connect(g1).connect(g); oscs[1].connect(g2).connect(g);
    } else oscs[0].connect(g);
    for (const o of oscs) {
      if (vib) {
        const lfo = ctx.createOscillator(); lfo.frequency.value = vib.rate;
        const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(vib.depth, t + (vib.delay || 0) + 0.2);
        lfo.connect(lg).connect(o.detune); lfo.start(t + (vib.delay || 0)); lfo.stop(end);
      }
      o.start(t); o.stop(end);
    }
    oscs[0].onended = () => { for (const o of oscs) o.disconnect(); g.disconnect(); };
  }
  // A soft sustained voice: two detuned oscillators through a lowpass, slow attack and release.
  pad({ midi, t, dur, level, a, r, waves, detune, cutoff, out }) {
    const ctx = this.ctx, f = midiHz(midi), end = t + dur + r + 0.05;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(level, t + a);
    g.gain.setValueAtTime(level, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + r);
    lp.connect(g).connect(out);
    const oscs = waves.map((w, i) => { const o = this.osc(w, f); o.detune.value = (i ? -1 : 1) * detune; o.connect(lp); o.start(t); o.stop(end); return o; });
    oscs[0].onended = () => { for (const o of oscs) o.disconnect(); lp.disconnect(); g.disconnect(); };
  }
  // Percussion from the triangle and the noise channel: a kick, a brushed snare, a hat tick.
  drum(kind, t, level, out) {
    const ctx = this.ctx;
    const noise = (f, type, q, dur, lvl) => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.setValueAtTime(lvl, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(fl).connect(g).connect(out); src.start(t, (t * 7.3) % 1.5); src.stop(t + dur + 0.02);
      src.onended = () => { src.disconnect(); fl.disconnect(); g.disconnect(); };
    };
    const thump = (f0, f1, dur, lvl) => {
      const o = this.osc('triangle', f0); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
      const g = ctx.createGain(); g.gain.setValueAtTime(lvl, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    };
    if (kind === 'kick') { thump(150, 42, 0.16, level * 1.6); noise(1200, 'lowpass', 0.5, 0.03, level * 0.4); }
    else if (kind === 'brush') noise(3500, 'bandpass', 0.6, 0.05, level * 0.5);
    else if (kind === 'hat') noise(8000, 'highpass', 0.5, 0.035, level * 0.7);
  }
  // A looping filtered noise bed with a slow swell: the wind. Returns its nodes.
  noiseBed({ f, q, type, level, lfo, out }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.value = level;
    const l = ctx.createOscillator(); l.frequency.value = lfo;
    const lg = ctx.createGain(); lg.gain.value = level * 0.6;
    l.connect(lg).connect(g.gain);
    src.connect(fl).connect(g).connect(out); src.start(); l.start();
    return [src, fl, g, l, lg];
  }
  // A convolution reverb from a synthesized impulse. Returns { input, nodes }; the wet signal goes to `out`.
  reverb({ seconds, decay, cutoff, wet, out }) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds), ir = ctx.createBuffer(2, n, ctx.sampleRate);
    let seed = 777;
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < n; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; d[i] = ((seed / 4294967296) * 2 - 1) * (1 - i / n) ** decay; }
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
    const input = ctx.createGain(), wg = ctx.createGain(); wg.gain.value = wet;
    input.connect(lp).connect(conv).connect(wg).connect(out);
    return { input, nodes: [input, lp, conv, wg] };
  }
  // A feedback echo. Returns { input, nodes }.
  echo({ time, feedback, wet, cutoff, out }) {
    const ctx = this.ctx;
    const input = ctx.createGain(), dl = ctx.createDelay(3), fb = ctx.createGain(), fl = ctx.createBiquadFilter(), wg = ctx.createGain();
    dl.delayTime.value = time; fb.gain.value = feedback; fl.type = 'lowpass'; fl.frequency.value = cutoff; wg.gain.value = wet;
    input.connect(dl); dl.connect(fl).connect(fb).connect(dl); dl.connect(wg).connect(out);
    return { input, nodes: [input, dl, fb, fl, wg] };
  }
}

// ---------------------------------------------------------------- composition
// The song is a 32-bar loop of note events, written once from the seed, and played like a person:
// timing jitter, accents by beat, a crescendo into each phrase, legato and staccato, a bass line that moves
// against the lead, a soft pad under the chords, light percussion, and a motif that changes when it returns.
function compose(world) {
  const rng = mulberry32(cyrb32('music:' + world.seed)), pick = pickWith(rng), weighted = weightedWith(rng), gauss = gaussWith(rng);
  const type = MOOD[world.type] ? world.type : 'terran', mood = MOOD[type];
  const s = world.stats || {};
  const temp = parseFloat(s.temp) || 10, day = parseFloat(s.day) || 24, grav = world.gravity || 1;
  const windK = world.hasAtmosphere === false ? 0 : (world.atmoStrength ?? 1);
  const modeName = pick(mood.modes), scale = SCALES[modeName];
  // slow days and heavy worlds turn slowly; short days hurry
  const bpm = clamp(mood.tempo[0] + (mood.tempo[1] - mood.tempo[0]) * (1 - clamp((day - 8) / 40, 0, 1)) - (grav - 1) * 10, 72, 132);
  const swing = mood.swing[0] + rng() * (mood.swing[1] - mood.swing[0]);
  const stepDur = 60 / bpm / 4; // one sixteenth
  const root = 57 + Math.floor(rng() * 5) - 2 - clamp(Math.round((grav - 1) * 4), -5, 3);
  const byStep = Array.from({ length: STEPS }, () => []);
  const song = { seed: world.seed, mood, stepDur, swing, bpm, modeName, root, byStep, nodes: [], t0: undefined,
    cutoff: clamp(5200 - temp * 5, 2200, 6500), windK, windPitch: clamp(1 + (temp + 30) / 400, 0.8, 1.6) };

  // ---- harmony: one chord per bar; the cadence bar of an answer splits V | I
  const degPc = (d) => scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  const chordOf = (d) => ({ root: degPc(d), tones: [degPc(d), degPc(d + 2), degPc(d + 4)] });
  const prog = pick(PROGS[modeName]), progB = pick(PROGS[modeName]);
  const chords = []; // [bar] -> [{ chord, from }]
  for (let b = 0; b < BARS; b++) {
    const sec = b < 4 ? 'intro' : b < 12 ? 'A' : b < 20 ? 'B' : b < 28 ? 'A2' : 'outro';
    const pr = sec === 'B' ? progB : prog, k = (b - 4) % 4;
    if (sec === 'intro' || sec === 'outro') chords.push([{ chord: chordOf(b % 2 ? (sec === 'outro' ? 3 : 4) : 0), from: 0 }]);
    else if ((b - 4) % 8 === 7) chords.push([{ chord: chordOf(4), from: 0 }, { chord: chordOf(0), from: 8 }]);
    else chords.push([{ chord: chordOf(pr[k]), from: 0 }]);
  }
  const chordAt = (b, step) => { const cs = chords[b]; let c = cs[0].chord; for (const x of cs) if (step >= x.from) c = x.chord; return c; };
  const pc = (m) => (((m - root) % 12) + 12) % 12;
  const inScale = (m) => scale.includes(pc(m));
  const isChordTone = (m, ch) => ch.tones.some((t) => ((t % 12) + 12) % 12 === pc(m));
  const chordOrScale = (m, ch) => isChordTone(m, ch) || inScale(m);
  const nearest = (m, ch, pred = isChordTone) => { for (let k = 0; k < 12; k++) { if (pred(m + k, ch)) return m + k; if (pred(m - k, ch)) return m - k; } return m; };
  const scaleStep = (m, dir) => { let x = m; do { x += dir; } while (!inScale(x)); return x; };
  const lo = root + 7, hi = root + 24;

  // ---- melody from a 1/f contour: the noise picks a target around a centre, strong beats snap to the chord
  const pink = voss(rng), centre = root + 14;
  const bar = (cell, b, from) => {
    const notes = []; let step = 0, m = from ?? centre;
    for (let i = 0; i < cell.length; i++) {
      const len = cell[i];
      if (len < 0) { step -= len; continue; }
      const ch = chordAt(b, step);
      const target = centre + Math.round((pink() - 0.5) * 12);
      if (notes.length) {
        const dir = target > m ? 1 : -1, dist = Math.abs(target - m);
        m = dist <= 1 ? (rng() < 0.3 ? m : scaleStep(m, dir)) : dist <= 4 ? scaleStep(m, dir) : nearest(m + dir * 3, ch);
      }
      if (step % 8 === 0 || len >= 6) m = nearest(m, ch);
      if (m > hi) m = nearest(m - 12, ch); if (m < lo) m = nearest(m + 12, ch);
      notes.push({ step, m, len });
      step += len;
    }
    return notes;
  };
  // The cadence bar: an approach, then a held goal. The answer lands on the tonic, the question stays away.
  const cadence = (b, last, answer) => {
    const cad = pick(CADENCES), notes = []; let step = 0;
    const count = cad.filter((x) => x > 0).length; let k = 0;
    for (const len of cad) {
      if (len < 0) { step -= len; continue; }
      const ch = chordAt(b, step), isLast = ++k === count;
      let m;
      if (isLast) m = answer ? [root + 12, root + 24].reduce((a, c) => Math.abs(c - last) < Math.abs(a - last) ? c : a) : nearest(last, ch);
      else m = k === 1 ? nearest(last, ch) : scaleStep(last, last > root + 14 ? -1 : 1);
      notes.push({ step, m, len, hold: isLast }); last = m; step += len;
    }
    return notes;
  };
  // Variation for a repeat: one operator per bar.
  const vary = (notes, op, b) => {
    const out = notes.map((n) => ({ ...n }));
    if (op === 'anticipate' && out.length > 1) { const i = 1 + Math.floor(rng() * (out.length - 1)); if (out[i].step > 0 && out[i - 1].len > 1) { out[i].step -= 1; out[i].len += 1; out[i - 1].len -= 1; } }
    if (op === 'octave') for (const n of out) if (n.m + 12 <= hi + 5) n.m += 12;
    if (op === 'tail' && out.length > 1) { const n = out[out.length - 1]; n.m = nearest(n.m + (rng() < 0.5 ? 3 : -3), chordAt(b, n.step)); }
    if (op === 'ornament') for (const n of out) if (n.len >= 4 && rng() < 0.5) n.grace = scaleStep(n.m, rng() < 0.6 ? -1 : 1);
    if (op === 'invert' && out.length > 1) { const p0 = out[0].m; for (let i = 1; i < out.length; i++) { const mirror = p0 - (out[i].m - p0); out[i].m = nearest(clamp(mirror, lo, hi), chordAt(b, out[i].step), out[i].step % 8 === 0 ? isChordTone : chordOrScale); } }
    return out;
  };
  // A four-bar phrase: motif, motif over the next chord, a contrast bar that carries the peak, the cadence.
  const phrase = (b0, cells, answer, from) => {
    const m1 = bar(cells[0], b0, from), m2 = bar(cells[0], b0 + 1, m1[m1.length - 1].m), m3 = bar(cells[1], b0 + 2, m2[m2.length - 1].m);
    let k = 0; for (let i = 1; i < m3.length; i++) if (m3[i].m > m3[k].m) k = i;
    m3[k].m = nearest(Math.min(hi, m3[k].m + 4), chordAt(b0 + 2, m3[k].step));
    return [m1, m2, m3, cadence(b0 + 3, m3[m3.length - 1].m, answer)];
  };
  const put = (b, n, ev) => { if (b < BARS) byStep[b * 16 + n.step].push({ voice: 'lead', midi: n.m, len: n.len, ...ev }); };
  const write = (b0, bars, opts) => bars.forEach((notes, i) => {
    const arch = [0.86, 0.92, 1, 0.9][i]; // a crescendo into the third bar
    for (const n of notes) {
      const acc = n.step % 8 === 0 ? 1 : n.step % 4 === 0 ? 0.9 : 0.78;
      const long = n.len >= 6 || n.hold;
      put(b0 + i, n, { level: opts.level * acc * arch * (1 + gauss() * 0.06), vib: long, harm: opts.harm && (n.step % 4 === 0 || long), grace: n.grace, echo: opts.echo, stacc: !long && n.step % 4 !== 0 && rng() < 0.3 });
    }
  });
  const cellsA = [pick(CELLS), pick(CELLS)], cellsB = [pick(CELLS), pick(CELLS)];
  const Q = phrase(4, cellsA, false), A = phrase(8, cellsA, true, Q[3][Q[3].length - 1].m);
  write(4, Q, { level: 0.1, echo: true }); write(8, A, { level: 0.1, echo: true });
  const BQ = phrase(12, cellsB, false, Q[0][0].m - 2), BA = phrase(16, cellsB, true, BQ[3][BQ[3].length - 1].m);
  write(12, BQ, { level: 0.08, echo: true }); write(16, BA, { level: 0.085, echo: true });
  const ops = ['anticipate', 'ornament', 'octave', 'tail', 'invert'];
  const Q2 = Q.map((n, i) => vary(n, i === 2 ? 'octave' : pick(ops), 20 + i)), A2 = A.map((n, i) => vary(n, i === 3 ? 'ornament' : pick(ops), 24 + i));
  write(20, Q2, { level: 0.105, harm: true }); write(24, A2, { level: 0.105, harm: true, echo: true });
  write(28, [vary(Q[0], 'ornament', 28)], { level: 0.07, echo: true }); // the outro tag: the first bar alone, soft

  // ---- bass: the root on the downbeat, then choices that move against the lead, an approach into the next chord
  let bassRhythm = pick(BASS_RHYTHMS);
  const leadDirAt = (b, st) => {
    const evs = byStep[b * 16 + st].filter((e) => e.voice === 'lead'); if (!evs.length) return 0;
    for (let i = b * 16 + st - 1; i >= Math.max(0, b * 16 - 16); i--) { const pv = byStep[i].filter((e) => e.voice === 'lead'); if (pv.length) return Math.sign(evs[0].midi - pv[0].midi); }
    return 0;
  };
  for (let b = 0; b < BARS; b++) {
    if (rng() < 0.3) bassRhythm = pick(BASS_RHYTHMS);
    const nextRoot = chords[(b + 1) % BARS][0].chord.root;
    for (const st of bassRhythm) {
      const ch = chordAt(b, st);
      const lastInBar = st === bassRhythm[bassRhythm.length - 1] && st >= 12;
      let m;
      if (st === 0 || (chords[b].length > 1 && st === 8)) m = ch.root;
      else if (lastInBar && nextRoot !== ch.root && rng() < 0.6) m = nextRoot + (nextRoot > ch.root ? -1 : 1);
      else {
        const dir = -leadDirAt(b, st) || (rng() < 0.5 ? 1 : -1);
        m = weighted([[ch.root, 3], [ch.tones[2], 3], [ch.root + 12, 2], [ch.tones[1], 1], [ch.root + 12 * dir, 1]]);
      }
      m = root - 12 + m; if (m > root + 2) m -= 12; if (m < root - 14) m += 12;
      const len = Math.max(1, (bassRhythm[bassRhythm.indexOf(st) + 1] ?? 16) - st);
      byStep[b * 16 + st].push({ voice: 'bass', midi: m, len, level: 0.19 * (st === 0 ? 1 : 0.85) * (1 + gauss() * 0.05) });
    }
    // the pad holds each chord; percussion rests in the intro, the first half of B, and the outro
    for (const c of chords[b]) byStep[b * 16 + c.from].push({ voice: 'pad', midis: c.chord.tones.map((t) => root - 12 + t), len: (chords[b].find((x) => x.from > c.from)?.from ?? 16) - c.from });
    const quiet = b < 4 || (b >= 12 && b < 16) || b >= 29;
    if (b >= BARS - 2) continue;
    for (let st = 0; st < 16; st++) {
      const i = b * 16 + st;
      if (mood.kick && !quiet && (st === 0 || st === 10)) byStep[i].push({ voice: 'kick', level: 0.22 });
      if ((st === 4 || st === 12) && b !== 3) byStep[i].push({ voice: 'brush', level: quiet ? 0.2 : 0.3 });
      if (st % 4 === 2) byStep[i].push({ voice: 'hat', level: quiet ? 0.07 : 0.11 * (1 + gauss() * 0.15) });
      if (b % 8 === 3 && st >= 12 && !quiet) byStep[i].push({ voice: 'brush', level: 0.25 });
    }
  }

  // ---- playback
  // Swing delays the off-beat eighth of each pair: `swing` is where it lands in the pair (0.5 = straight).
  song.stepTime = (i) => {
    const pos = i % 4, base = song.t0 + i * stepDur;
    return pos === 2 ? base + (swing - 0.5) * 4 * stepDur : pos === 3 ? base + (swing - 0.5) * 2 * stepDur : base;
  };
  const jitter = (ms) => gauss() * ms / 1000;
  song.play = (synth, ev, t, i) => {
    const d = stepDur, out = song.bus;
    switch (ev.voice) {
      case 'lead': {
        const tt = t + jitter(9), dur = d * ev.len * (ev.stacc ? 0.5 : ev.len <= 2 ? 0.85 : 0.97);
        if (ev.grace) synth.note({ wave: mood.lead[0], midi: ev.grace, t: tt - d * 0.45, dur: d * 0.4, level: ev.level * 0.7, r: 0.03, out });
        synth.note({ wave: mood.lead, midi: ev.midi, t: tt, dur, level: ev.level, a: 0.006, d: 0.15, s: 0.85, r: 0.12, out, sweepAt: 0.09, vib: ev.vib ? { rate: 5.2, depth: 10, delay: 0.25 } : null });
        if (ev.echo) synth.note({ wave: 'p12', midi: ev.midi, t: tt + d * 6, dur: dur * 0.7, level: ev.level * 0.22, r: 0.1, out });
        if (ev.harm) { const h = nearest(ev.midi - 3, chordAt(Math.floor(i / 16) % BARS, i % 16), chordOrScale); synth.note({ wave: 'p25', midi: h, t: tt + jitter(6), dur: dur * 0.9, level: ev.level * 0.4, a: 0.008, r: 0.12, out }); }
        break;
      }
      case 'bass': synth.note({ wave: 'triangle', midi: ev.midi, t: t + jitter(4), dur: d * ev.len * 0.8, level: ev.level, a: 0.006, r: 0.06, out }); break;
      case 'pad': for (const m of ev.midis) synth.pad({ midi: m, t: t - 0.02, dur: d * ev.len, level: 0.028, a: 0.25, r: 0.6, waves: ['p50', 'triangle'], detune: 5, cutoff: mood.padCut, out: song.padBus }); break;
      default: synth.drum(ev.voice, t + jitter(3), ev.level, out);
    }
  };
  // Schedule every step whose time falls in [t0, t1). The loop repeats for as long as the song plays.
  song.schedule = (synth, t0, t1) => {
    let i = Math.max(0, Math.floor((t0 - song.t0) / stepDur) - 1);
    for (; ; i++) {
      const t = song.stepTime(i);
      if (t >= t1) break;
      if (t < t0) continue;
      for (const ev of byStep[i % STEPS]) song.play(synth, ev, t, i);
    }
  };
  return song;
}

// Start muted until the user turns the music on. Browsers block audio before a
// gesture, and silence on arrival is the polite default.
function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); return { vol: clamp(+s.vol >= 0 ? +s.vol : 0.5, 0, 1), muted: s.muted === undefined ? true : !!s.muted }; }
  catch { return { vol: 0.5, muted: true }; }
}

const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];

// A blob URL for a quarter second of 8-bit mono silence in WAV form.
let silentUrl = null;
function silentWav() {
  if (silentUrl) return silentUrl;
  const rate = 8000, n = rate / 4, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  silentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return silentUrl;
}

export class Music {
  constructor() {
    this.settings = loadSettings();
    this.ctx = null; this.master = null; this.comp = null; this.synth = null;
    this.song = null; this.pending = null;
    this.timer = 0;
    this.onchange = null; // UI callback
    this._unlock = () => this.unlock();
    document.addEventListener('visibilitychange', () => this._visibility());
    // iOS marks the context "interrupted" after a call or Siri; any touch brings it back.
    addEventListener('pointerdown', () => { if (this.ctx && this.ctx.state !== 'running' && !this.settings.muted) this.ctx.resume().catch(() => {}); }, { passive: true });
  }

  // ---------------------------------------------------------------- context
  _ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = this.ctx = new AC({ latencyHint: 'playback' });
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18; this.comp.knee.value = 12; this.comp.ratio.value = 4; this.comp.attack.value = 0.01; this.comp.release.value = 0.4;
    this.master = ctx.createGain();
    this.master.gain.value = this.settings.muted ? 0 : this._gain();
    this.comp.connect(this.master).connect(ctx.destination);
    this.synth = new Synth(ctx);
    if (ctx.state !== 'running') this._armUnlock();
    return true;
  }
  _armUnlock() {
    for (const ev of UNLOCK_EVENTS) addEventListener(ev, this._unlock, { passive: true });
  }
  // Call from a user gesture. iOS only starts audio inside a tap, a click, or a key press.
  unlock() {
    if (!this.ctx || this.settings.muted) return;
    this._media(true);
    this.ctx.resume().then(() => {
      if (this.ctx.state !== 'running') return;
      for (const ev of UNLOCK_EVENTS) removeEventListener(ev, this._unlock);
      this._startTimer();
    }).catch(() => {});
  }
  // iOS mutes Web Audio while the ring switch is on silent, unless an HTML media element plays.
  // A looping silent clip, started in a gesture, moves the audio session to playback mode.
  // Playback mode ignores the switch.
  _media(on) {
    if (!on) { this._el?.pause(); return; }
    if (!this._el) {
      const el = this._el = document.createElement('audio');
      el.src = silentWav(); el.loop = true; el.preload = 'auto';
      el.setAttribute('playsinline', ''); el.setAttribute('aria-hidden', 'true');
    }
    const p = this._el.play();
    if (p) p.catch(() => {}); // no gesture yet, or paused at once: the next gesture calls play again
  }
  _visibility() {
    if (!this.ctx || this.settings.muted) return;
    if (document.hidden) { this._stopTimer(); this._media(false); this.ctx.suspend().catch(() => {}); }
    else { this._media(true); this.ctx.resume().then(() => this._startTimer()).catch(() => {}); }
  }
  _gain() { const v = this.settings.vol; return v * v * 0.9; }
  _save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ } this.onchange?.(this.settings); }

  // ---------------------------------------------------------------- public controls
  get playing() { return !!this.ctx && this.ctx.state === 'running' && !this.settings.muted && !!this.song; }
  setVolume(v) {
    this.settings.vol = clamp(v, 0, 1);
    if (this.master && !this.settings.muted) this.master.gain.setTargetAtTime(this._gain(), this.ctx.currentTime, 0.05);
    this._save();
  }
  setMuted(m) {
    this.settings.muted = !!m;
    this._save();
    if (m) {
      if (this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this._stopTimer();
      this._media(false);
      clearTimeout(this._suspendT);
      this._suspendT = setTimeout(() => { if (this.settings.muted && this.ctx) this.ctx.suspend().catch(() => {}); }, 500);
      return;
    }
    clearTimeout(this._suspendT);
    if (!this._ensure()) return;
    this._media(true);
    if (this.pending) { const w = this.pending; this.pending = null; this._start(w, FADE_IN); }
    this.master.gain.setTargetAtTime(this._gain(), this.ctx.currentTime, 0.3);
    if (this.song && !this.song.stopping) this._startTimer();
    if (this.ctx.state !== 'running') this.unlock();
  }
  // Play the song of a world. Muted: remember it and start on unmute.
  play(world) {
    if (this.settings.muted) { this.pending = world; return; }
    if (!this._ensure()) return;
    this._start(world, this.song ? SWAP_IN : FADE_IN);
    if (this.ctx.state !== 'running') this.unlock();
  }

  // ---------------------------------------------------------------- song graph
  _start(world, fadeIn) {
    const ctx = this.ctx, now = ctx.currentTime, synth = this.synth;
    if (this.song) this._stopSong(this.song);
    const song = this.song = compose(world);
    song.stopping = false;
    const out = song.out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(1, now + fadeIn);
    out.connect(this.comp);
    // bus -> lowpass (warm when hot, glassy when cold) -> out, plus a small hall and an echo a dotted eighth later
    const bus = song.bus = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = song.cutoff; lp.Q.value = 0.4;
    bus.connect(lp).connect(out);
    const verb = synth.reverb({ seconds: 2.2, decay: 3, cutoff: 2800, wet: 0.22, out });
    const echo = synth.echo({ time: song.stepDur * 6, feedback: 0.3, wet: 0.2, cutoff: 2000, out });
    lp.connect(verb.input); lp.connect(echo.input);
    const padBus = song.padBus = ctx.createGain(); padBus.connect(out); padBus.connect(verb.input);
    song.nodes.push(bus, lp, padBus, out, ...verb.nodes, ...echo.nodes);
    const w = song.mood.wind, level = w.g * song.windK * 0.025;
    if (level > 0.001) song.nodes.push(...synth.noiseBed({ f: w.f * song.windPitch, q: w.q, type: w.low ? 'lowpass' : 'bandpass', level, lfo: w.lfo, out }));
    song.t0 = now + 0.05; song.cursor = song.t0;
    this._startTimer();
  }
  _stopSong(song) {
    const ctx = this.ctx, now = ctx.currentTime;
    song.stopping = true;
    song.out.gain.cancelScheduledValues(now);
    song.out.gain.setValueAtTime(song.out.gain.value, now);
    song.out.gain.linearRampToValueAtTime(0.0001, now + FADE_OUT);
    setTimeout(() => { for (const n of song.nodes) { try { n.stop?.(); } catch { /* not a source */ } n.disconnect(); } }, (FADE_OUT + 0.2) * 1000);
    if (this.song === song) this.song = null;
  }

  // ---------------------------------------------------------------- scheduler
  _startTimer() {
    if (this.timer || !this.song) return;
    this.timer = setInterval(() => this._tick(), 100);
    this._tick();
  }
  _stopTimer() { clearInterval(this.timer); this.timer = 0; }
  _tick() {
    const song = this.song, ctx = this.ctx;
    if (!song || !ctx) { this._stopTimer(); return; }
    const now = ctx.currentTime;
    if (song.cursor < now - 1) song.cursor = now + 0.05; // we fell behind (tab hidden); do not rush
    const to = now + STEP_LOOK;
    if (to > song.cursor) { song.schedule(this.synth, song.cursor, to); song.cursor = to; }
  }
}
