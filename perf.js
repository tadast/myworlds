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

  // the slowest frame interval of the window in ms, or 0 while the window is empty. A mean of 16 ms
  // with one frame of 90 ms reads as smooth in the mean and as a stutter on the screen.
  get worst() {
    let m = 0;
    for (let k = 0; k < this.n; k++) m = Math.max(m, this.ring[k]);
    return m;
  }

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

// ---------------------------------------------------------------- the GPU clock
// The work of the clock above is the time on the CPU. The graphics card runs the frame after the
// CPU has sent it, so a frame can cost 4 ms of work and 45 ms on the card. This clock reads the
// time on the card with a timer query, EXT_disjoint_timer_query_webgl2. A result comes back some
// frames late, so the clock keeps a small pool of queries and reads each one when it is ready.
//
// The app builds this clock only with `?perf`. A browser without the extension gives `ok` false,
// and the overlay then says so.
const GPU_POOL = 6;        // queries in flight; a result comes back 2 to 4 frames late

export class GpuClock {
  constructor(gl) {
    this.gl = gl;
    this.ext = gl.getExtension && gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.ok = !!(this.ext && gl.createQuery);
    this.free = [];
    this.busy = [];          // queries that were ended and wait for a result, oldest first
    this.active = null;
    this.ring = new Float64Array(WINDOW);
    this.n = 0; this.i = 0; this.sum = 0;
  }

  // the mean time of one frame on the card in ms, or 0 while no result has come back
  get avg() { return this.n ? this.sum / this.n : 0; }

  // At the head of the frame callback. A full pool skips the frame, and the mean reads the others.
  begin() {
    if (!this.ok || this.active) return;
    this._poll();
    const q = this.free.pop() || (this.busy.length + 1 < GPU_POOL ? this.gl.createQuery() : null);
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  // At the foot of the same frame callback.
  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.busy.push(this.active);
    this.active = null;
  }

  _poll() {
    const gl = this.gl;
    // A disjoint event (a change of clock, a sleep of the card) makes every result in flight
    // worthless, so the clock drops them all.
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.busy.length) {
      const q = this.busy[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.busy.shift();
      const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      this.free.push(q);
      if (disjoint || ms > SPIKE_MS * 4) continue;
      if (this.n < WINDOW) { this.ring[this.i] = ms; this.sum += ms; this.n++; }
      else { this.sum += ms - this.ring[this.i]; this.ring[this.i] = ms; }
      this.i = (this.i + 1) % WINDOW;
    }
  }

  reset() { this.n = 0; this.i = 0; this.sum = 0; }
}

// ---------------------------------------------------------------- the overlay
// The app builds this only with `?perf` in the query string, so the page pays nothing without the
// flag: no element, no style, and no work in the frame loop.
//
// The overlay stands at the top left, under the world chip. The sound button and the objective of
// the interface hold the top right, and the dock holds the foot. See docs/ui.md.
export class Hud {
  constructor() {
    const el = document.createElement('div');
    el.id = 'perf-hud';
    el.style.cssText = [
      'position:fixed', 'left:8px', 'top:calc(76px + env(safe-area-inset-top))', 'z-index:60',
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
