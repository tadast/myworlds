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

// Scale choices per world type. Degrees are semitones from the root.
const SCALES = {
  terran: [[0, 2, 4, 7, 9], [0, 2, 4, 5, 7, 9]],
  ocean: [[0, 2, 4, 6, 7, 9, 11], [0, 4, 7, 9, 11]],
  desert: [[0, 1, 4, 5, 7, 8], [0, 1, 4, 5, 7, 10]],
  ice: [[0, 2, 3, 7, 10], [0, 3, 5, 7, 10]],
  lava: [[0, 1, 3, 5, 7, 10], [0, 1, 3, 6, 7, 10]],
  gas: [[0, 2, 4, 6, 8, 10]],
  exotic: [[0, 3, 6, 9], [0, 2, 4, 6, 8, 11], [0, 1, 5, 6, 10]],
};
// Mood per world type: how busy the arpeggio is, the bass style, sparkle notes, the wind.
const MOOD = {
  terran: { density: 0.7, bass: 'drone', spark: 0, wind: { f: 500, q: 0.8, g: 0.5, lfo: 0.05 }, arp: 'p25', lead: 'p50' },
  ocean: { density: 0.55, bass: 'drone', spark: 0.04, wind: { f: 700, q: 0.5, g: 0.8, lfo: 0.08 }, arp: 'p50', lead: 'triangle' },
  desert: { density: 0.5, bass: 'pulse', spark: 0, wind: { f: 450, q: 0.9, g: 0.6, lfo: 0.04 }, arp: 'p12', lead: 'p25' },
  ice: { density: 0.35, bass: 'drone', spark: 0.09, wind: { f: 2200, q: 6, g: 0.35, lfo: 0.06 }, arp: 'p12', lead: 'p12' },
  lava: { density: 0.7, bass: 'pulse', spark: 0, wind: { f: 260, q: 0.6, g: 0.9, lfo: 0.11, low: true }, arp: 'p50', lead: 'p25' },
  gas: { density: 0.3, bass: 'drone', spark: 0.03, wind: { f: 160, q: 0.5, g: 1.1, lfo: 0.03, low: true }, arp: 'p50', lead: 'triangle' },
  exotic: { density: 0.5, bass: 'drone', spark: 0.07, wind: { f: 1200, q: 3, g: 0.5, lfo: 0.07 }, arp: 'p25', lead: 'p12' },
};

function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); return { vol: clamp(+s.vol >= 0 ? +s.vol : 0.5, 0, 1), muted: !!s.muted }; }
  catch { return { vol: 0.5, muted: false }; }
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
    for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, this._unlock, { passive: true });
  }
  unlock() {
    if (!this.ctx || this.settings.muted) return;
    this.ctx.resume().then(() => {
      if (this.ctx.state !== 'running') return;
      for (const ev of ['pointerdown', 'touchend', 'keydown']) removeEventListener(ev, this._unlock);
      this._startTimer();
    }).catch(() => {});
  }
  _visibility() {
    if (!this.ctx || this.settings.muted) return;
    if (document.hidden) { this._stopTimer(); this.ctx.suspend().catch(() => {}); }
    else this.ctx.resume().then(() => this._startTimer()).catch(() => {});
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
      clearTimeout(this._suspendT);
      this._suspendT = setTimeout(() => { if (this.settings.muted && this.ctx) this.ctx.suspend().catch(() => {}); }, 500);
      return;
    }
    clearTimeout(this._suspendT);
    if (!this._ensure()) return;
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
  _compose(world) {
    const rng = mulberry32(cyrb32('music:' + world.seed));
    const type = MOOD[world.type] ? world.type : 'terran';
    const mood = MOOD[type];
    const scales = SCALES[type];
    const scale = scales[Math.floor(rng() * scales.length)];
    const s = world.stats || {};
    const temp = parseFloat(s.temp) || 10;
    const day = parseFloat(s.day) || 24;
    const grav = world.gravity || 1;
    // slow days and heavy worlds turn slowly; short days hurry
    const bpm = clamp(46 + (60 - clamp(day, 8, 60)) * 0.8 - (grav - 1) * 10, 42, 92);
    const stepDur = 60 / bpm / 2; // one eighth note
    const root = 48 + Math.floor(rng() * 7) - 3 - clamp(Math.round((grav - 1) * 4), -6, 3);
    // chord progression: 4 chords, each a scale degree, the first is the root
    const n = scale.length;
    const prog = [0];
    for (let i = 1; i < 4; i++) { let d; do { d = Math.floor(rng() * n); } while (d === prog[i - 1]); prog.push(d); }
    const chordBars = 2;
    // two arpeggio patterns, 8 steps each
    const pattern = () => Array.from({ length: 8 }, (_, i) => (rng() < mood.density || i === 0) ? { k: Math.floor(rng() * 4), oct: rng() < 0.3 ? 1 : 0 } : null);
    const arps = [pattern(), pattern()];
    const windK = world.hasAtmosphere === false ? 0 : (world.atmoStrength ?? 1);
    return {
      seed: world.seed, mood, scale, prog, chordBars, arps, stepDur, root, rng,
      cutoff: clamp(4800 - temp * 6, 1400, 6500),
      echo: windK > 0 ? 0.18 + 0.2 * windK : 0.06,
      windK, windPitch: clamp(1 + (temp + 30) / 400, 0.8, 1.6),
      lead: { note: 0, at: -1, len: 0 },
      nodes: [],
      degree: (chord, k, oct = 0) => { // k-th note of the chord (thirds), as midi
        const idx = prog[chord] + k * 2, o = Math.floor(idx / n);
        return root + scale[idx % n] + 12 * (o + oct);
      },
    };
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
    const { mood, stepDur, rng } = song;
    const bar = Math.floor(step / 8), inBar = step % 8;
    const chord = Math.floor(bar / song.chordBars) % 4;
    const chordStart = inBar === 0 && bar % song.chordBars === 0;
    // bass
    if (mood.bass === 'drone') {
      if (chordStart) this._note(song, 'triangle', song.degree(chord, 0, -1), t, stepDur * 8 * song.chordBars, 0.20, { a: 0.8, r: 1.2 });
      if (inBar === 4 && bar % song.chordBars === 1 && rng() < 0.5) this._note(song, 'triangle', song.degree(chord, 2, -1), t, stepDur * 4, 0.12, { a: 0.6, r: 0.8 });
    } else if (inBar % 2 === 0) {
      this._note(song, 'triangle', song.degree(chord, inBar === 4 ? 2 : 0, -1), t, stepDur * 1.6, 0.20, { a: 0.005, r: 0.4 });
    }
    // arpeggio: two patterns alternate every four bars, the second half of a phrase is quieter
    const pat = song.arps[Math.floor(bar / 4) % 2][inBar];
    if (pat && (bar % 8 < 6 || rng() < 0.5)) this._note(song, mood.arp, song.degree(chord, pat.k, pat.oct), t, stepDur * 0.9, 0.075, { a: 0.003, r: 0.35 });
    // lead: a slow random walk, one phrase every few bars
    const L = song.lead;
    if (inBar === 0 && bar % 2 === 1 && rng() < 0.55) { L.at = bar; L.count = 1 + Math.floor(rng() * 3); L.pos = Math.floor(rng() * 4); }
    if (L.at === bar && L.count > 0 && inBar === L.pos) {
      L.note = clamp(L.note + Math.floor(rng() * 5) - 2, -2, song.scale.length * 2 - 1);
      const len = 2 + Math.floor(rng() * 4);
      this._note(song, mood.lead, this._scaleMidi(song, L.note) + 12, t, stepDur * len, 0.085, { a: 0.02, r: 0.5, vib: true });
      L.count--; L.pos += len + Math.floor(rng() * 2);
    }
    // sparkle: rare very short high notes on cold or strange worlds
    if (mood.spark > 0 && rng() < mood.spark) this._note(song, 'p12', song.degree(chord, Math.floor(rng() * 3), 2), t, stepDur * 0.5, 0.035, { a: 0.002, r: 0.25 });
  }
  _scaleMidi(song, i) { const n = song.scale.length, o = Math.floor(i / n); return song.root + song.scale[((i % n) + n) % n] + 12 * o; }
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
