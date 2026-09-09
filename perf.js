// myworlds — the frame clock and the perf overlay.
//
// One clock measures the frame time for the whole page. The adaptive LOD of the ground reads it,
// and the overlay of `?perf` shows it. The clock holds a rolling average of the last 30 frames,
// and it estimates the refresh rate of the display over the first 60 frames it counts.
//
// Three kinds of frame do not count. A frame during the dive draws two scenes and a fade, so it
// says nothing about the ground. A frame in the first second after load carries the build of the
// world. A frame over 100 ms is a tab switch, not a slow frame.
//
// The clock keeps two numbers. `avg` is the mean interval between two frames, which is the frame
// time the reader sees. `avgWork` is the mean time the app spends inside its own frame callback.
// The two answer two different questions. The interval says whether the machine holds the
// refresh; it cannot fall under the refresh, so it can never show the headroom that is left. The
// work says how much of the frame the app uses, and it falls as far as the app is fast. The LOD
// controller needs both: the interval to know it must come down, the work to know it may go out.

const WINDOW = 30;         // frames in the rolling average
const HZ_FRAMES = 60;      // frames the estimate of the refresh rate reads
const WARMUP_MS = 1000;    // the first second after load carries the build of the world
const SPIKE_MS = 100;      // a frame over this is a tab switch
const HZ_QUANTILE = 0.2;   // a low quantile of the intervals: the display cannot draw faster
const RATES = [30, 50, 60, 75, 90, 100, 120, 144, 165, 240, 360];

class Perf {
  constructor() {
    this.start = performance.now();
    this.last = 0;                       // the time of the last frame that counts, or 0
    this.ring = new Float64Array(WINDOW);
    this.n = 0;                          // frames in the window
    this.i = 0;                          // the next slot of the ring
    this.sum = 0;
    this.wring = new Float64Array(WINDOW);
    this.wn = 0; this.wi = 0; this.wsum = 0;
    this.counts = false;                 // the frame that runs now goes into the window
    this.hz = 60;                        // the estimate of the refresh rate
    this.target = 1000 / 60;             // ms, the frame time the LOD controller aims at
    this.hzDone = false;
    this.hzList = [];
  }

  // the mean frame time of the window in ms, or 0 while the window is empty
  get avg() { return this.n ? this.sum / this.n : 0; }

  // the mean time the app spends inside one frame callback, in ms
  get avgWork() { return this.wn ? this.wsum / this.wn : 0; }

  // Both windows are full, so the averages are worth a decision.
  get ready() { return this.n >= WINDOW && this.wn >= WINDOW; }

  // Drop the windows. The app calls this when it enters or leaves the ground, because the frames
  // of the other mode say nothing about the one the reader is now in.
  reset() {
    this.n = 0; this.i = 0; this.sum = 0; this.last = 0;
    this.wn = 0; this.wi = 0; this.wsum = 0;
  }

  // One frame, at the head of the frame callback. `ignore` drops both this frame and the interval
  // that follows it, because that interval spans a frame the clock cannot read.
  frame(now, ignore) {
    const prev = this.last;
    this.last = ignore ? 0 : now;
    this.counts = false;
    if (ignore || !prev || now - this.start < WARMUP_MS) return;
    const ms = now - prev;
    if (ms > SPIKE_MS) return;
    this.counts = true;

    if (this.n < WINDOW) { this.ring[this.i] = ms; this.sum += ms; this.n++; }
    else { this.sum += ms - this.ring[this.i]; this.ring[this.i] = ms; }
    this.i = (this.i + 1) % WINDOW;
    if (!this.hzDone) this._estimate(ms);
  }

  // The work of one frame, at the foot of the same frame callback.
  work(ms) {
    if (!this.counts || ms > SPIKE_MS) return;
    if (this.wn < WINDOW) { this.wring[this.wi] = ms; this.wsum += ms; this.wn++; }
    else { this.wsum += ms - this.wring[this.wi]; this.wring[this.wi] = ms; }
    this.wi = (this.wi + 1) % WINDOW;
  }

  // The refresh rate, from a low quantile of the first HZ_FRAMES intervals. The mean would read
  // the load of the machine as well; a low quantile reads the fastest frames, and no frame can
  // come faster than the display. The value snaps to the nearest common rate within 12% of it.
  _estimate(ms) {
    this.hzList.push(ms);
    if (this.hzList.length < HZ_FRAMES) return;
    const s = this.hzList.slice().sort((a, b) => a - b);
    const q = s[Math.floor(s.length * HZ_QUANTILE)];
    let hz = q > 0 ? 1000 / q : 60;
    let near = RATES[0];
    for (const r of RATES) if (Math.abs(hz - r) < Math.abs(hz - near)) near = r;
    if (Math.abs(hz - near) < near * 0.12) hz = near;
    this.hz = Math.min(360, Math.max(24, Math.round(hz)));
    this.target = 1000 / Math.min(60, this.hz);
    this.hzDone = true;
    this.hzList.length = 0;
  }
}

export const perf = new Perf();

// ---------------------------------------------------------------- the overlay
// The app builds this only with `?perf` in the query string, so the page pays nothing without the
// flag: no element, no style, and no work in the frame loop.
export class Hud {
  constructor() {
    const el = document.createElement('div');
    el.id = 'perf-hud';
    el.style.cssText = [
      'position:fixed', 'left:8px', 'bottom:8px', 'z-index:60',
      'padding:6px 9px', 'border-radius:6px',
      'background:rgba(6,10,22,.78)', 'color:#cfe0ff',
      'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
      'white-space:pre', 'pointer-events:none', 'user-select:none',
    ].join(';');
    document.body.appendChild(el);
    this.el = el;
  }

  // rows: an array of [label, value] pairs. The labels line up in one column.
  update(rows) {
    let w = 0;
    for (const r of rows) w = Math.max(w, r[0].length);
    this.el.textContent = rows.map((r) => `${r[0].padEnd(w)}  ${r[1]}`).join('\n');
  }

  dispose() { this.el.remove(); }
}
