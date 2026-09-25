// myworlds — the probe overlay: what the reader reads over the ground, issue 31.
//
// The reader stands on another world and the frame says nothing about it. The overlay is the
// instrument of the probe: the temperature of the air, the height over the ground, the hour of
// the star, and the strength of the uplink to the relay in orbit. The first three tell the reader
// where they are. The fourth tells them why they cannot go further: the ground does not end at
// the edge of the patch, the link does, and the probe stops where it can still be flown.
//
// The markup lives in index.html, as every other panel of this app does. This file only writes
// the numbers and draws the noise. ground.js hands it one telemetry object per frame; it holds no
// state of the world and it reads no scene.
//
// The noise is a canvas over the frame: grey grain, scanlines, and a vignette that closes in. It
// only runs over the last NOISE_BAND units of the reach (see ground.js), because static that
// arrives early reads as a fault of the app and not as a fact of the world. Under that band the
// canvas is cleared and hidden, and it costs nothing.
const BARS = 5;                 // the bars of the signal block
const GRAIN_DIV = 2;            // the grain is drawn at this fraction of the frame and scaled up
const GRAIN_MS = 45;            // ms between two grain fields: a slower flicker reads as static
const LADDER_MAX = 500;         // metres: the top of the altitude ladder, the ceiling of ground.js
const VIGNETTE = 0.42;          // the part of the short side of the screen one dark band covers
// The shape of one band, from the edge inward. A straight ramp holds one slope and then stops, and
// the eye finds the line where it stops. These stops fall off, so the dark thins out the way it
// does on a lens and no edge of the band can be found.
const VIGNETTE_STOPS = [[0, 1], [0.22, 0.78], [0.45, 0.48], [0.68, 0.22], [0.86, 0.07], [1, 0]];
const TEXT_MS = 120;            // ms between two writes of the numbers. The eye reads no faster.
// The carrier of issue 34. One word states the strength, and it comes off the arc to the source.
// The reader gets every fact of the carrier here, so nothing is lost with the sound off.
//
//   Here    the landing cell is the cell of the source
//   Strong  under CARRIER_STRONG, which is the 6 cells decision 7 gives the range over
//   Clear   under CARRIER_CLEAR, where the error stands under 4 degrees and two fixes cross tight
//   Faint   further out, where the error runs on to 10 degrees at the edge of the reach
//
// The carrier reaches CARRIER_REACH, which is 2.09 radians, so Faint covers 0.6 to 2.09 and the
// block is hidden past that. A landing inside the reach is Faint about two times in three, Clear
// about one time in three, and Strong only when the reader aims for it. See carrierAt() in site.js
// for the error and for the reach.
// A site carries two decimals of a degree, so the site of record stands up to 0.013 of a cell from
// the middle of that cell and the arc on the cell of the source is small but not zero. A tenth of
// a cell clears that rounding and still reaches no further than the cell itself.
const CARRIER_HERE = 0.001;     // radians of arc, which is a tenth of a cell
const CARRIER_STRONG = 0.06;    // radians of arc, which is 6 cells
const CARRIER_CLEAR = 0.6;      // radians of arc, which is 60 cells, a fifth of the half circle

// The seconds of a countdown as hours and minutes. A landing lasts minutes and a day lasts hours,
// so the minutes carry the change the reader sees and the hours carry the fact.
function clock(s) {
  const m = Math.max(0, Math.round(s / 60));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${String(m % 60).padStart(2, '0')} m` : `${m} m`;
}

export class ProbeHud {
  // `onCarrier` runs when the reader presses the carrier block. The block is a real control: it
  // opens the brief of the distress signal. app.js owns the dialog, so the overlay only reports the
  // press. Issue 34.
  constructor(root, { onCarrier } = {}) {
    this.root = root;
    if (!root) return;
    this.canvas = root.querySelector('#probe-noise');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.elTemp = root.querySelector('#hud-temp');
    this.elAlt = root.querySelector('#hud-alt');
    this.elSun = root.querySelector('#hud-sun');
    this.elSunK = root.querySelector('#hud-sun-k');
    this.elSig = root.querySelector('#hud-sig');
    this.elLink = root.querySelector('#hud-link');
    this.elBars = root.querySelector('#hud-bars');
    this.elWarn = root.querySelector('#hud-warn');
    this.elCarrier = root.querySelector('#hud-carrier');
    this.elNeedle = root.querySelector('#hud-needle');
    this.elBrg = root.querySelector('#hud-brg');
    this.elErr = root.querySelector('#hud-err');
    this.elStrength = root.querySelector('#hud-strength');
    this.elRange = root.querySelector('#hud-range');
    this.elHint = root.querySelector('#hud-hint');
    if (this.elCarrier && onCarrier) this.elCarrier.addEventListener('click', onCarrier);
    this.bars = [];
    if (this.elBars) {
      for (let i = 0; i < BARS; i++) {
        const b = document.createElement('i');
        b.style.height = `${7 + i * 3}px`;
        this.elBars.appendChild(b);
        this.bars.push(b);
      }
    }
    this._grainAt = 0;
    this._textAt = 0;
    this._needleAt = null;   // the turn the needle of the carrier stands at. See _writeCarrier().
    this._lit = -1;
    this._state = '';
    this._w = 0; this._h = 0;
    this._noise = 0;      // the ramp the last frame drew, so a clear happens once
    this.grain = null;    // the small canvas the grain is drawn into
  }

  show() {
    if (!this.root) return;
    this.root.hidden = false;
    this._needleAt = null;      // a new landing puts the needle where it stands, with no turn
  }

  // The pulse of the carrier block. Risk 4 of issue 34: a reader may never look at the fifth block.
  // The block pulses on every landing that hears the carrier until the reader opens the brief of
  // that stage of the search, and `hint` names the stage. The pulse runs without end, because one
  // flash on one landing is a thing a reader can miss. Under prefers-reduced-motion the CSS gives a
  // static highlight instead of an animation, so the block still stands out and nothing moves.
  setPulse(on, hint) {
    if (this.elCarrier) this.elCarrier.classList.toggle('pulse', !!on);
    if (hint && this.elHint) this.elHint.textContent = hint;
  }

  hide() {
    if (!this.root) return;
    this.root.hidden = true;
    if (this.ctx && this._w) this.ctx.clearRect(0, 0, this._w, this._h);
    this._noise = 0;
  }

  // The canvas of the noise follows the frame. It is drawn at the device pixels of the page, as
  // the renderer is, so a grain pixel is a pixel and not a blur.
  resize(w, h, dpr) {
    if (!this.canvas) return;
    this._w = w; this._h = h;
    this._dpr = Math.min(2, dpr || 1);
    this.canvas.width = Math.round(w * this._dpr);
    this.canvas.height = Math.round(h * this._dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  }

  // One frame. `tel` is the object ground.telemetry() returns.
  update(tel, now) {
    if (!this.root || this.root.hidden || !tel) return;
    this._writeText(tel, now);
    this._drawNoise(tel.near, now);
  }

  _writeText(tel, now) {
    if (now - this._textAt < TEXT_MS) return;
    this._textAt = now;
    if (this.elTemp) {
      this.elTemp.textContent = tel.tempC == null ? '—' : `${tel.tempC.toFixed(1)}°C`;
    }
    if (this.elAlt) {
      const agl = Math.round(tel.agl);
      this.elAlt.textContent = `${agl}m`;
      // The ladder runs from the ground to the ceiling of the camera, so the marker states the
      // height the reader owns and not a height it can never reach.
      const k = Math.min(1, agl / LADDER_MAX);
      this.elAlt.style.bottom = `${k * 100}%`;
    }
    if (this.elSun && this.elSunK) {
      if (!tel.sun) { this.elSun.textContent = '—'; this.elSunK.textContent = 'Star'; }
      else {
        this.elSunK.textContent = tel.sun.rise ? 'Sunrise' : 'Sunset';
        this.elSun.textContent = clock(tel.sun.seconds);
      }
    }
    const pct = Math.round(tel.signal * 100);
    if (this.elSig) this.elSig.textContent = `${pct}%`;
    const lit = Math.max(0, Math.ceil(pct / (100 / BARS)));
    const weak = pct < 45;
    if (lit !== this._lit || weak !== this._weak) {
      this._lit = lit; this._weak = weak;
      for (let i = 0; i < this.bars.length; i++) {
        this.bars[i].className = i < lit ? (weak ? 'lit hot' : 'lit') : '';
      }
    }
    this._writeCarrier(tel.carrier);
    // Three words, and each one is a fact about the probe and not an order to the reader.
    const state = tel.near > 0.75 ? 'lost' : tel.near > 0.02 ? 'weak' : 'ok';
    if (state !== this._state) {
      this._state = state;
      if (this.elLink) {
        this.elLink.textContent = state === 'lost' ? 'Uplink failing'
          : state === 'weak' ? 'Uplink weak' : 'Uplink nominal';
        this.elLink.classList.toggle('weak', state !== 'ok');
      }
      if (this.elWarn) this.elWarn.classList.toggle('show', state === 'lost');
    }
  }

  // The carrier block. A world with no source gives null and the whole block goes away.
  //
  // The needle turns by `rel`, the bearing less the bearing the view points along, so 0 stands
  // straight ahead. The bearing reads as three digits, because the reader compares one landing
  // against the next and a number of one width is easier to compare. The range states kilometres
  // near the source and units on its cell; both stay away until the probe is near. Decision 7.
  _writeCarrier(c) {
    if (!this.elCarrier) return;
    this.elCarrier.hidden = !c;
    if (!c) return;
    // The needle takes the short way round. rel runs 0 to 360, so a view that turns through north
    // takes it from 359 to 1, and a plain rotate() would then spin the needle the whole way back.
    // The running angle holds the turn the needle has made and it steps by half a circle at most.
    if (this.elNeedle) {
      this._needleAt = this._needleAt == null ? c.rel
        : this._needleAt + ((c.rel - this._needleAt + 540) % 360) - 180;
      this.elNeedle.style.transform = `rotate(${this._needleAt.toFixed(1)}deg)`;
    }
    if (this.elBrg) this.elBrg.textContent = `${String(Math.round(c.brg) % 360).padStart(3, '0')}°`;
    if (this.elErr) this.elErr.textContent = `±${Math.round(c.err)}°`;
    if (this.elStrength) {
      this.elStrength.textContent = c.arc < CARRIER_HERE ? 'Here'
        : c.arc < CARRIER_STRONG ? 'Strong' : c.arc < CARRIER_CLEAR ? 'Clear' : 'Faint';
    }
    if (this.elRange) {
      const text = c.range != null ? `${Math.round(c.range)} u`
        : c.rangeKm != null ? `${c.rangeKm < 10 ? c.rangeKm.toFixed(1) : Math.round(c.rangeKm)} km`
          : '';
      this.elRange.hidden = !text;
      this.elRange.textContent = text;
    }
  }

  // The static. `near` is 0 inside the reach and 1 at it. The grain field is redrawn every
  // GRAIN_MS and the canvas keeps it between two of them, so the flicker reads as a signal and
  // the cost stays flat: one field of a quarter of the frame, scaled up with no smoothing.
  _drawNoise(near, now) {
    const ctx = this.ctx;
    if (!ctx || !this._w) return;
    const n = near <= 0.001 ? 0 : near;
    if (n === 0) {
      if (this._noise !== 0) { ctx.clearRect(0, 0, this._w, this._h); this._noise = 0; }
      return;
    }
    if (now - this._grainAt < GRAIN_MS && this._noise === n) return;
    this._grainAt = now;
    this._noise = n;
    const W = this._w, H = this._h;
    ctx.clearRect(0, 0, W, H);

    const gw = Math.max(1, Math.ceil(W / GRAIN_DIV)), gh = Math.max(1, Math.ceil(H / GRAIN_DIV));
    if (!this.grain || this.grain.width !== gw || this.grain.height !== gh) {
      this.grain = document.createElement('canvas');
      this.grain.width = gw; this.grain.height = gh;
      this._gctx = this.grain.getContext('2d');
      this._gimg = this._gctx.createImageData(gw, gh);
    }
    const px = this._gimg.data, amp = n * n * 120;
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.random() * 255;
      px[i] = v; px[i + 1] = v; px[i + 2] = v;
      px[i + 3] = Math.random() * amp;
    }
    this._gctx.putImageData(this._gimg, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.grain, 0, 0, W, H);
    ctx.restore();

    // The scanlines: one dark line every three, at a tenth of the ramp. They read as a picture
    // carried by a machine and they cost one fill.
    ctx.fillStyle = `rgba(0, 0, 0, ${n * 0.1})`;
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

    // The vignette closes in as the link thins, so the picture narrows before it goes. It runs
    // from the four edges of the screen and not from a circle around the middle: a circle wide
    // enough to clear a wide frame darkens the corners and leaves the middle of the long edges
    // open, and the reader then sees the effect sit in the corners instead of closing the view.
    // Four bands, one per edge, hold the same depth on every screen and on every aspect.
    const depth = Math.min(W, H) * VIGNETTE;
    const band = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      for (const [at, k] of VIGNETTE_STOPS) g.addColorStop(at, `rgba(6, 9, 20, ${n * 0.72 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
    };
    band(0, 0, 0, depth, 0, 0, W, depth);
    band(0, H, 0, H - depth, 0, H - depth, W, depth);
    band(0, 0, depth, 0, 0, 0, depth, H);
    band(W, 0, W - depth, 0, W - depth, 0, depth, H);
  }
}
