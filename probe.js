// myworlds — the probe: the lifecycle of one landing.
//
// The probe stands in one of four modes: 'orbit', 'descending', 'ground', or 'ascending'. A descent
// fixes the site, asks for the patch, and closes the cover over the screen. The switch to the ground
// waits for the patch, or for PATCH_WAIT. An ascent closes the cover, switches back to the globe,
// and opens the cover again. A new world aborts whatever runs, and the probe stands in orbit.
//
// This file holds the state of the landing and every change of it. It holds no three.js and no DOM,
// so tools/probe-check.mjs walks every transition in Node. app.js builds the ground scene, moves the
// camera, and draws the cover: it calls step() once a frame, and it acts on the event of step().
//
// The state of the landing:
//
//   mode    'orbit', 'descending', 'ground', or 'ascending'
//   site    the site of the landing, fixed at the start of the descent, or null in orbit
//   dive    the dive that runs, `{ kind, phase, t0, dur, path }`, or null. `kind` is 'descend',
//           'ascend', or 'jump' (chapter 3: from the ruin to the twin, ground to ground). `phase` is 'in' while the cover closes and 'out' while it opens. `path` is
//           what the page gave descend() for the camera; the probe does not read it.
//   patch   the patch the worker builds for the site, `{ done, result }`
//   job     the number of the last descent. A patch that arrives for an older descent is dropped.
//   fix     the fix of this landing. It waits for the end of the ascent, where the globe fades its
//           wedge in.
//   stage   the stage of the brief on this landing, or null
//   heard   the key of the search this landing heard, or null. See showProgress() in app.js.
//
// The fix, the stage, and the key belong to one landing. The switch back to the globe drops the
// stage and the key, and the end of the ascent gives the fix to the page. An abort drops all three,
// because the ascent the fix waited for never comes.

export const DIVE_MS = 1200;     // ms, the time the cover of a dive takes to close
// ms, the floor of a descent: the switch to the ground waits at least this long, so the entry the
// cover shows plays out even when the patch is quick. The patch build hides inside it.
export const ENTRY_MS = 4000;
export const PATCH_WAIT = 12000; // ms, the guard on the patch. Past it the probe lands on flat ground.
export const FADE_MS = 600;      // ms, the time the cover takes to open after the switch
// Chapter 3: the jump from the ruin to the twin. The probe stays on the ground the whole time: the
// ruin flares for JUMP_MS while the cover goes white, the ground switches under the cover, and the
// twin flares and fades for JUMP_OUT_MS while the cover opens. See docs/issues/p3-00-the-way-on.md.
export const JUMP_MS = 4200;
export const JUMP_OUT_MS = 2600;

const smooth = (k) => k * k * (3 - 2 * k);   // the smoothstep of three.js from 0 to 1

export class Probe {
  constructor() {
    this.job = 0;
    this._orbit();
  }

  // The probe in orbit, with no landing. This is the one list of the fields of a landing: the end
  // of an ascent and an abort both come here.
  _orbit() {
    this.mode = 'orbit';
    this.site = null;
    this.dive = null;
    this.patch = { done: true, result: null };
    this.view = null;
    this.fix = null;
    this.stage = null;
    this.heard = null;
  }

  // Send the probe down to `site` at time `now`. `view` is a ground camera that a link brings for
  // this landing, and `path` is what the page keeps for the camera of the dive. Gives false while the
  // probe is not in orbit. The page then asks the worker for the patch of `site` under `job`.
  descend(site, now, { view = null, path = null } = {}) {
    if (this.mode !== 'orbit' || !site) return false;
    this.mode = 'descending';
    this.site = { ...site };
    this.view = view;
    this.patch = { done: false, result: null };
    this.job++;
    this.dive = { kind: 'descend', phase: 'in', t0: now, dur: DIVE_MS, path };
    return true;
  }

  // Chapter 3: the probe jumps from the ground it stands on to `site`, the cell of the twin, at time
  // `now`. It stays in the mode 'ground', and the dive holds the frames until the switch. Gives false
  // unless it stands on the ground with no dive. The page then asks the worker for the patch of
  // `site` under `job`, as for a descent. The landing heard nothing yet, so the fix, the stage, and the
  // key go: a jump takes no fix of its own until the page hears the carrier at the twin.
  jump(site, now) {
    if (this.mode !== 'ground' || this.dive || !site) return false;
    this.site = { ...site };
    this.patch = { done: false, result: null };
    this.job++;
    this.fix = null;
    this.stage = null;
    this.heard = null;
    this.dive = { kind: 'jump', phase: 'in', t0: now, dur: JUMP_MS, path: null };
    return true;
  }

  // The patch of descent `job` arrived, or failed with null. A patch of an older descent is dropped.
  patchDone(job, result) {
    const jumping = this.dive && this.dive.kind === 'jump' && this.dive.phase === 'in';
    if (job !== this.job || (this.mode !== 'descending' && !jumping)) return;
    this.patch = { done: true, result: result || null };
  }

  // Recall the probe at time `now`. Gives false unless it stands on the ground with no dive.
  ascend(now) {
    if (this.mode !== 'ground' || this.dive) return false;
    this.dive = { kind: 'ascend', phase: 'in', t0: now, dur: FADE_MS, path: null };
    return true;
  }

  // The landing heard the carrier: the fix it took, the stage of the brief, and the key of the
  // search. Only a probe on the ground hears.
  hear({ fix = null, stage = null, heard = null } = {}) {
    if (this.mode !== 'ground') return;
    this.fix = fix;
    this.stage = stage;
    this.heard = heard;
  }

  // One frame of the dive at time `now`, or null with no dive. Gives:
  //
  //   kind, phase, path   the dive of this frame, before any switch
  //   k                   0 to 1 through the phase, eased
  //   cover               the opacity of the cover, 0 to 1
  //   event               null, or one of:
  //     'enter'     the descent switches to the ground. `patch` is the patch, or null when it
  //                 failed or the guard ran out, and `view` is the camera of a link, or null.
  //     'landed'    the cover is open over the ground
  //     'leave'     the ascent switches to the globe
  //     'surfaced'  the cover is open over the globe, and the probe is in orbit. `fix` is the fix
  //                 that waited for this moment, or null.
  //     'swap'      the jump switches to the ground of the twin under the white cover. `patch` is
  //                 the patch, or null. The event 'landed' ends the jump.
  step(now) {
    const d = this.dive;
    if (!d) return null;
    const raw = Math.min(1, Math.max(0, (now - d.t0) / d.dur));
    const k = smooth(raw);
    const out = { kind: d.kind, phase: d.phase, path: d.path, k, cover: d.phase === 'in' ? k : 1 - k, event: null };
    if (raw < 1) return out;
    if (d.phase === 'in') {
      // the switch waits for the patch, or for the guard, whichever comes first after the floor
      if ((d.kind === 'descend' || d.kind === 'jump') && !this.patch.done && now - d.t0 < PATCH_WAIT) return out;
      if (d.kind === 'descend' && now - d.t0 < ENTRY_MS) return out;
      if (d.kind === 'jump') {
        out.event = 'swap';
        out.patch = this.patch.result;
        this.dive = { ...d, phase: 'out', t0: now, dur: JUMP_OUT_MS };
        return out;
      }
      if (d.kind === 'descend') {
        this.mode = 'ground';
        out.event = 'enter';
        out.patch = this.patch.result;
        out.view = this.view;
        this.view = null;
      } else {
        this.mode = 'ascending';
        this.stage = null;
        this.heard = null;
        out.event = 'leave';
      }
      this.dive = { ...d, phase: 'out', t0: now, dur: FADE_MS };
      return out;
    }
    if (d.kind === 'ascend') {
      out.event = 'surfaced';
      out.fix = this.fix;
      this._orbit();
    } else {
      out.event = 'landed';
      this.dive = null;
    }
    return out;
  }

  // A new world: the probe stands in orbit again, whatever ran. Gives false when it stood there.
  abort() {
    if (this.mode === 'orbit') return false;
    this._orbit();
    return true;
  }
}
