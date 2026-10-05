// myworlds — the worker. It runs generation off the main thread. generate.js holds all the work;
// this file turns a message into a call of generate.js and the result into a message. app.js starts
// it as a module worker: new Worker('./worker.js', { type: 'module' }).
//
// In:   { type: 'generate', seed, opts }
//       { type: 'patch', id, seed, site: { lat, lon, kind }, opts }
// Out:  { type: 'progress', id, pct, label }, any number of them
//       { type: 'done', result } or { type: 'patch-done', id, result }
//       { type: 'error', id, message }
//
// Each reply carries the id of the request it answers. A patch request has an id, and a generate
// request has none. The page drops the reply of a patch that it does not wait for now.
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

self.onmessage = (e) => {
  const msg = e.data;
  const id = msg.id;
  const progress = (pct, label) => self.postMessage({ type: 'progress', id, pct, label });
  try {
    if (msg.type === 'generate') {
      const result = generate.world(msg.seed, msg.opts || {}, progress);
      self.postMessage({ type: 'done', result }, [...buffers(result)]);
    } else if (msg.type === 'patch') {
      const result = generate.patch(msg.seed, msg.site, msg.opts || {}, progress);
      self.postMessage({ type: 'patch-done', id, result }, [...buffers(result)]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err && err.stack || err) });
  }
};
