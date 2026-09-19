// Prints whole logs of real worlds, so a writer can read a log the way a reader meets it.
//
//   node tools/lore-audit/log-sample.mjs [first seed index] [count] [filter]
//
// The filter is a regular expression. A log is printed when it matches the cause or a slot, so
// "forage" prints the logs where a person goes to live off the land.
//
// The seeds are the ones `audit.mjs --seeds` runs: audit-0, audit-1, and so on.
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.self = globalThis;
for (const f of ['lore.js', 'species.js', 'flora-lore.js', 'source-lore.js']) require(path.join(root, f));
globalThis.importScripts = () => {};
globalThis.postMessage = () => {};
new Function('self', readFileSync(path.join(root, 'worker.js'), 'utf8') + '\n;self.__generate = generate;')(globalThis);

const first = Number(process.argv[2] || 0), count = Number(process.argv[3] || 3);
const filter = process.argv[4] ? new RegExp(process.argv[4]) : null;
for (let i = first, shown = 0; shown < count && i < first + 400; i++) {
  let world = null;
  globalThis.postMessage = (m) => { if (m.type === 'done') world = m.result.world; };
  globalThis.__generate('audit-' + i, { detail: 24, maxFlora: 200, maxFauna: 40 });
  const log = world && world.source && world.source.log;
  if (!log) continue;
  if (filter && !filter.test(log.cause) && !log.entries.some((e) => filter.test(e.slot))) continue;
  shown++;
  console.log(`\n=== audit-${i} · ${world.type} · ${world.stats.temp} · ${log.probe} · cause: ${log.cause} · ${log.days} days`);
  console.log(log.crew.map((c) => `${c.name} (${c.role})`).join(', ') + ` · keeper ${log.keeper}`);
  for (const e of log.entries) console.log(`\n[day ${e.day} · ${e.slot}] ${e.text}`);
}
