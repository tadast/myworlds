// myworlds — the worker. It runs generation off the main thread. generate.js holds all the work;
// this file turns a message into a call of generate.js and the result into a message. app.js starts
// it as a module worker: new Worker('./worker.js', { type: 'module' }).
//
// In:   { type: 'generate', seed, opts }
//       { type: 'patch', seed, site: { lat, lon, kind }, opts }
// Out:  { type: 'progress', pct, label }, any number of them
//       { type: 'done', result } or { type: 'patch-done', result }
//       { type: 'error', message }
import * as generate from './generate.js';

// Every buffer under a result, once. generate.js keeps no typed array it returns, so the worker
// gives them all to the page and copies none of them.
function buffers(value, out = new Set(), seen = new Set()) {
  if (ArrayBuffer.isView(value)) out.add(value.buffer);
  else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const v of Object.values(value)) buffers(v, out, seen);
  }
  return out;
}

const progress = (pct, label) => self.postMessage({ type: 'progress', pct, label });

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'generate') {
      const result = generate.world(msg.seed, msg.opts || {}, progress);
      self.postMessage({ type: 'done', result }, [...buffers(result)]);
    } else if (msg.type === 'patch') {
      const result = generate.patch(msg.seed, msg.site, msg.opts || {}, progress);
      self.postMessage({ type: 'patch-done', result }, [...buffers(result)]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.stack || err) });
  }
};
