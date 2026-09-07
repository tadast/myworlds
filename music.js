// myworlds — procedural chip-tune ambience. One song per world, seeded by the world.
// Web Audio only: pulse and triangle voices, a noise wash for the wind, one echo.
const STORE_KEY = 'myworlds.music';
const STEP_LOOK = 0.4;      // seconds of notes scheduled ahead
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

// Modes are 7-note scales, so every chord is a diatonic triad and every progression is functional.
const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], minor: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11], phrygianDom: [0, 1, 4, 5, 7, 8, 10],
};
// Chord progressions per mode, as 0-based scale degrees. Each one loops well and ends on a pull back to I.
const PROGS = {
  major: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 4, 3], [0, 2, 5, 3], [3, 4, 5, 0]],
  lydian: [[0, 1, 0, 1], [0, 1, 5, 1], [0, 4, 1, 0], [0, 1, 2, 1]],
  mixolydian: [[0, 6, 3, 0], [0, 3, 6, 3], [0, 6, 0, 3], [0, 3, 0, 6]],
  dorian: [[0, 3, 0, 3], [0, 3, 6, 0], [0, 1, 3, 6], [0, 6, 3, 0]],
  minor: [[0, 5, 2, 6], [0, 6, 5, 4], [0, 3, 4, 0], [5, 6, 0, 4], [0, 5, 3, 4]],
  phrygian: [[0, 1, 0, 1], [0, 1, 6, 0], [0, 6, 1, 0], [0, 3, 1, 0]],
  harmonicMinor: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 4, 0, 4], [0, 5, 4, 0]],
  phrygianDom: [[0, 1, 0, 1], [0, 1, 3, 0], [0, 6, 1, 0], [0, 3, 1, 0]],
};
// Rhythms for one bar of eight steps. A negative number is a rest.
const RHYTHMS = [
  [2, 2, 2, 2], [1, 1, 2, 4], [2, 1, 1, 4], [3, 1, 4], [1, 1, 2, 2, 2], [2, 2, 1, 1, 2], [4, 2, 2], [2, 2, 4],
  [3, 3, 2], [1, 1, 1, 1, 4], [6, 2], [2, 6], [1, 2, 1, 4], [-1, 1, 2, 4], [-2, 2, 4], [3, 1, 2, 2], [2, 1, 1, 2, 2],
];
const CADENCES = [[8], [2, 6], [3, 5], [1, 1, 6], [4, 4]];
// Bass patterns: step, chord-relative degree, length. 7 is the octave.
const BASS = {
  drone: [[0, 0, 8]],
  lift: [[0, 0, 5], [5, 7, 1], [6, 4, 2]],
  pulse: [[0, 0, 2], [2, 7, 2], [4, 4, 2], [6, 7, 2]],
  walk: [[0, 0, 2], [2, 0, 1], [3, 2, 1], [4, 4, 2], [6, 7, 1], [7, 4, 1]],
};
// Arpeggio patterns: chord-relative degrees per step, null is a rest.
const ARPS = {
  up: [0, 2, 4, 7, 0, 2, 4, 7], updown: [0, 2, 4, 7, 4, 2, 0, 2], sparse: [0, null, 4, null, 7, null, 4, null],
  roll: [0, 4, 2, 7, 0, 4, 2, 7], air: [0, null, null, 4, null, 7, null, null], low: [0, 2, 4, 2, 0, 2, 4, 2],
};
// Mood per world type: the modes and patterns to choose from, the wind, the voices.
const MOOD = {
  terran: { modes: ['major', 'mixolydian'], bass: ['lift', 'walk'], arp: ['updown', 'low'], spark: 0, wind: { f: 500, q: 0.8, g: 0.5, lfo: 0.05 }, arpWave: 'p25', lead: 'p50' },
  ocean: { modes: ['lydian', 'major'], bass: ['drone', 'lift'], arp: ['roll', 'updown'], spark: 0.04, wind: { f: 700, q: 0.5, g: 0.8, lfo: 0.08 }, arpWave: 'p50', lead: 'triangle' },
  desert: { modes: ['phrygianDom', 'harmonicMinor'], bass: ['pulse', 'walk'], arp: ['sparse', 'low'], spark: 0, wind: { f: 450, q: 0.9, g: 0.6, lfo: 0.04 }, arpWave: 'p12', lead: 'p25' },
  ice: { modes: ['minor', 'dorian'], bass: ['drone', 'lift'], arp: ['air', 'sparse'], spark: 0.08, wind: { f: 2200, q: 6, g: 0.35, lfo: 0.06 }, arpWave: 'p12', lead: 'p12' },
  lava: { modes: ['phrygian', 'minor'], bass: ['pulse', 'walk'], arp: ['up', 'low'], spark: 0, wind: { f: 260, q: 0.6, g: 0.9, lfo: 0.11, low: true }, arpWave: 'p50', lead: 'p25' },
  gas: { modes: ['lydian', 'dorian'], bass: ['drone'], arp: ['air', 'sparse'], spark: 0.03, wind: { f: 160, q: 0.5, g: 1.1, lfo: 0.03, low: true }, arpWave: 'p50', lead: 'triangle' },
  exotic: { modes: ['harmonicMinor', 'lydian', 'phrygian'], bass: ['lift', 'pulse'], arp: ['roll', 'sparse'], spark: 0.07, wind: { f: 1200, q: 3, g: 0.5, lfo: 0.07 }, arpWave: 'p25', lead: 'p12' },
};
const LOOP_BARS = 28; // intro 4, verse 8, bridge 8, verse 8 with a harmony voice

function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); return { vol: clamp(+s.vol >= 0 ? +s.vol : 0.5, 0, 1), muted: !!s.muted }; }
  catch { return { vol: 0.5, muted: false }; }
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
    this.ctx = null; this.master = null; this.comp = null;
    this.song = null; this.pending = null;
    this.waves = {}; this.noiseBuf = null;
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
    // band-limited pulse waves; 'square' and 'triangle' are built in
    for (const [name, duty] of [['p12', 0.125], ['p25', 0.25], ['p50', 0.5]]) {
      const N = 24, re = new Float32Array(N), im = new Float32Array(N);
      for (let n = 1; n < N; n++) { re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty); }
      this.waves[name] = ctx.createPeriodicWave(re, im, { disableNormalization: false });
    }
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
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
    const ctx = this.ctx, now = ctx.currentTime;
    if (this.song) this._stopSong(this.song);
    const song = this.song = this._compose(world);
    song.stopping = false;
    const out = song.out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(1, now + fadeIn);
    out.connect(this.comp);
    // bus -> lowpass (warm when hot, glassy when cold) -> out, plus a lowpassed echo
    const bus = song.bus = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = song.cutoff; lp.Q.value = 0.5;
    bus.connect(lp).connect(out);
    if (song.echo > 0) {
      const dl = ctx.createDelay(2); dl.delayTime.value = song.stepDur * 3;
      const fb = ctx.createGain(); fb.gain.value = 0.38;
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1800;
      const wet = ctx.createGain(); wet.gain.value = song.echo;
      lp.connect(dl); dl.connect(fb).connect(fl).connect(dl); dl.connect(wet).connect(out);
      song.nodes.push(dl, fb, fl, wet);
    }
    this._wind(song);
    song.nodes.push(bus, lp, out);
    song.next = now + 0.05; song.step = 0;
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
  _wind(song) {
    const ctx = this.ctx, w = song.mood.wind, level = w.g * song.windK * 0.05;
    if (level <= 0.001) return;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = w.low ? 'lowpass' : 'bandpass'; f.frequency.value = w.f * song.windPitch; f.Q.value = w.q;
    const g = ctx.createGain(); g.gain.value = level;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = w.lfo;
    const lg = ctx.createGain(); lg.gain.value = level * 0.6;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(song.bus);
    src.start(); lfo.start();
    song.nodes.push(src, f, g, lfo, lg);
  }

  // ---------------------------------------------------------------- composition
  // The song is a fixed 32-bar loop of note events, written once from the seed.
  // Melodies come from a motif in chord-relative degrees, so a repeat over a new chord stays in tune.
  _compose(world) {
    const rng = mulberry32(cyrb32('music:' + world.seed));
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const type = MOOD[world.type] ? world.type : 'terran';
    const mood = MOOD[type];
    const modeName = pick(mood.modes), scale = MODES[modeName];
    const prog = pick(PROGS[modeName]);
    const s = world.stats || {};
    const temp = parseFloat(s.temp) || 10;
    const day = parseFloat(s.day) || 24;
    const grav = world.gravity || 1;
    // slow days and heavy worlds turn slowly; short days hurry
    const bpm = clamp(54 + (60 - clamp(day, 8, 60)) * 0.9 - (grav - 1) * 10, 50, 104);
    const stepDur = 60 / bpm / 2; // one eighth note
    const root = 48 + Math.floor(rng() * 7) - 3 - clamp(Math.round((grav - 1) * 4), -6, 3);
    const windK = world.hasAtmosphere === false ? 0 : (world.atmoStrength ?? 1);
    const song = {
      seed: world.seed, mood, scale, modeName, prog, stepDur, root,
      raise7: modeName === 'minor', // a leading tone under the V chord, as in the harmonic minor
      cutoff: clamp(4800 - temp * 6, 1400, 6500),
      echo: windK > 0 ? 0.16 + 0.18 * windK : 0.05,
      windK, windPitch: clamp(1 + (temp + 30) / 400, 0.8, 1.6),
      nodes: [], byStep: Array.from({ length: LOOP_BARS * 8 }, () => []),
    };
    // pitch of a chord-relative degree: chord root + rel scale steps, in midi
    song.pitch = (chordDeg, rel, oct = 0) => {
      const idx = chordDeg + rel, o = Math.floor(idx / 7), k = ((idx % 7) + 7) % 7;
      let semi = scale[k];
      if (song.raise7 && chordDeg === 4 && k === 6) semi += 1;
      return root + semi + 12 * (o + oct);
    };
    const put = (bar, step, voice, chordDeg, rel, oct, len, level, env) => {
      if (bar >= LOOP_BARS) return;
      song.byStep[bar * 8 + step].push({ voice, midi: song.pitch(chordDeg, rel, oct), len, level, env });
    };
    const chordAt = (bar) => prog[bar % 4];
    const isChordTone = (rel) => [0, 2, 4].includes(((rel % 7) + 7) % 7);
    const snap = (rel, dir) => { let r = rel; while (!isChordTone(r)) r += dir; return r; };

    // ---- a motif: one bar of rhythm plus chord-relative degrees, mostly stepwise, chord tones on strong beats
    const motif = (startRel, rhythm = pick(RHYTHMS)) => {
      const notes = []; let step = 0, rel = snap(startRel, rng() < 0.5 ? 1 : -1);
      for (let i = 0; i < rhythm.length; i++) {
        const len = rhythm[i];
        if (len < 0) { step -= len; continue; }
        if (notes.length) {
          const r = rng();
          rel += r < 0.16 ? -2 : r < 0.44 ? -1 : r < 0.72 ? 1 : r < 0.88 ? 2 : r < 0.94 ? 0 : (rng() < 0.5 ? 3 : -3);
          if (step % 4 === 0 || len >= 3) rel = snap(rel, rel >= notes[notes.length - 1].rel ? 1 : -1);
        }
        if (rel > 8) rel -= 7; if (rel < -2) rel += 7;
        notes.push({ step, rel, len });
        step += len;
      }
      return notes;
    };
    // ---- a phrase: motif, its sequence over the next chord, a contrast bar, a cadence bar
    // The question ends away from the tonic, the answer ends on it.
    const phrase = (bar0, m1, m2, answer, oct, level, harm) => {
      const bars = [m1, m1, m2];
      let last = m1[0].rel;
      for (let b = 0; b < 3; b++) for (const n of bars[b]) {
        put(bar0 + b, n.step, 'lead', chordAt(bar0 + b), n.rel, oct, n.len, level, n.len >= 3 ? 'held' : 'short');
        if (harm) put(bar0 + b, n.step, 'harm', chordAt(bar0 + b), n.rel - 2, oct, n.len, level * 0.5, 'short');
        last = n.rel;
      }
      // cadence: an approach note then a long target note (absolute degree 0 for the answer, 4 or 1 for the question)
      const cBar = bar0 + 3, cd = answer ? 0 : chordAt(cBar), target = answer ? 0 : (rng() < 0.6 ? 4 : 1);
      const targetRel = (() => { const base = ((target - cd) % 7 + 7) % 7; let best = base, bd = 99; for (const c of [base - 7, base, base + 7]) { if (c < -2 || c > 8) continue; const dd = Math.abs(c - last); if (dd < bd) { bd = dd; best = c; } } return best; })();
      const cad = pick(CADENCES); let step = 0;
      for (let i = 0; i < cad.length; i++) {
        const lastNote = i === cad.length - 1;
        const rel = lastNote ? targetRel : snap(targetRel + (targetRel > last ? -1 : 1) * (cad.length - i), targetRel > last ? -1 : 1);
        put(cBar, step, 'lead', cd, rel, oct, cad[i], level, lastNote ? 'held' : 'short');
        if (harm) put(cBar, step, 'harm', cd, rel - 2, oct, cad[i], level * 0.5, lastNote ? 'held' : 'short');
        step += cad[i];
      }
      return cd;
    };
    // ---- bass and arpeggio for every bar; the answer phrases land on the tonic chord
    const bassPat = BASS[pick(mood.bass)], arpPat = ARPS[pick(mood.arp)];
    const tonicBars = new Set();
    // ---- form: intro (no lead), verse Q+A, bridge Q+A a fifth up and softer, verse again
    const m1 = motif(0), m2 = motif(2), m3 = motif(4, pick(RHYTHMS)), m4 = motif(2);
    const verse = (bar0, level, first, second, harm) => { phrase(bar0, first, second, false, 1, level, harm); tonicBars.add(bar0 + 7); phrase(bar0 + 4, first, second, true, 1, level, harm); };
    verse(4, 0.09, m1, m2, false);
    verse(12, 0.065, m3, m4, false);
    verse(20, 0.085, m1, m2, true);
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const cd = tonicBars.has(bar) ? 0 : chordAt(bar);
      const quiet = bar < 4 || bar >= 12 && bar < 20;
      for (const [st, rel, len] of bassPat) put(bar, st, 'bass', cd, rel, -1, len, bassPat === BASS.drone ? 0.18 : 0.16, len >= 4 ? 'drone' : 'pluck');
      if (bar === LOOP_BARS - 1) continue; // one bar of rest before the loop repeats
      arpPat.forEach((rel, st) => { if (rel !== null && (!quiet || st % 2 === 0)) put(bar, st, 'arp', cd, rel, 0, 1, quiet ? 0.045 : 0.06, 'pluck'); });
      if (mood.spark > 0) for (let st = 0; st < 8; st++) if (rng() < mood.spark) put(bar, st, 'spark', cd, [0, 2, 4][Math.floor(rng() * 3)], 2, 1, 0.03, 'spark');
    }
    return song;
  }

  // ---------------------------------------------------------------- scheduler
  _startTimer() {
    if (this.timer || !this.song) return;
    this.timer = setInterval(() => this._tick(), 90);
    this._tick();
  }
  _stopTimer() { clearInterval(this.timer); this.timer = 0; }
  _tick() {
    const song = this.song, ctx = this.ctx;
    if (!song || !ctx) { this._stopTimer(); return; }
    const horizon = ctx.currentTime + STEP_LOOK;
    if (song.next < ctx.currentTime - 1) song.next = ctx.currentTime + 0.05; // we fell behind (tab hidden); do not rush
    while (song.next < horizon) { this._stepAt(song, song.step, song.next); song.step++; song.next += song.stepDur; }
  }
  _stepAt(song, step, t) {
    const { mood, stepDur } = song;
    for (const ev of song.byStep[step % (LOOP_BARS * 8)]) {
      const wave = ev.voice === 'lead' ? mood.lead : ev.voice === 'arp' || ev.voice === 'harm' ? mood.arpWave : ev.voice === 'bass' ? 'triangle' : 'p12';
      const env = { drone: { a: 0.4, r: 0.8 }, pluck: { a: 0.004, r: 0.3 }, short: { a: 0.01, r: 0.25 }, held: { a: 0.02, r: 0.5, vib: true }, spark: { a: 0.002, r: 0.25 } }[ev.env];
      this._note(song, wave, ev.midi, t, stepDur * ev.len * (ev.voice === 'arp' ? 0.9 : 0.95), ev.level, env);
    }
  }
  _note(song, wave, midi, t, dur, level, env) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    if (this.waves[wave]) osc.setPeriodicWave(this.waves[wave]); else osc.type = wave;
    osc.frequency.value = midiHz(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + env.a);
    g.gain.setValueAtTime(level, t + Math.max(env.a, dur - env.r * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + env.r);
    osc.connect(g).connect(song.bus);
    if (env.vib) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
      const lg = ctx.createGain(); lg.gain.value = 9;
      lfo.connect(lg).connect(osc.detune);
      lfo.start(t + 0.15); lfo.stop(t + dur + env.r + 0.05);
    }
    osc.start(t); osc.stop(t + dur + env.r + 0.05);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
  }
}
