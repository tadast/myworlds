// Prints whole logs of real worlds, so a writer can read a log the way a reader meets it.
//
//   node tools/lore-audit/log-sample.mjs [first seed index] [count] [filter]
//
// The filter is a regular expression. A log is printed when it matches the cause, a slot, the
// outcome of the last entry as "went.<value>", or "ruin" / "noruin" for the ruin of the world. So
// "forage" prints the logs where a person goes to live off the land, "went.one" the logs where
// one person goes toward the call alone, "end.cut" the logs that stop in the middle of a sentence,
// and "^noruin$" the logs of the worlds with no ruin.
//
// The seeds are the ones `audit.mjs --seeds` runs: audit-0, audit-1, and so on.
import * as generate from '../../generate.js';

const first = Number(process.argv[2] || 0), count = Number(process.argv[3] || 3);
const filter = process.argv[4] ? new RegExp(process.argv[4]) : null;
for (let i = first, shown = 0; shown < count && i < first + 400; i++) {
  const { world } = generate.world('audit-' + i, { detail: 24, maxFlora: 200, maxFauna: 40 });
  const log = world.source && world.source.log;
  if (!log) continue;
  const keys = [log.cause, 'went.' + log.went, world.ruin ? 'ruin' : 'noruin', ...log.entries.map((e) => e.slot)];
  if (filter && !keys.some((k) => filter.test(k))) continue;
  shown++;
  const ruin = world.ruin ? `ruin ${world.ruin.freq} MHz ${world.ruin.from}` : 'no ruin';
  console.log(`\n=== audit-${i} · ${world.type} · ${world.stats.temp} · ${log.probe} · cause: ${log.cause} · ${log.days} days · ${ruin}`);
  console.log(log.crew.map((c) => `${c.name} (${c.role})`).join(', ') + ` · keeper ${log.keeper}`
    + (log.lost ? ` · lost ${log.lost.name} (${log.lost.how}, day ${log.lost.day})` : '')
    + (log.went ? ` · went ${log.went}: ${log.goers.join(', ') || 'nobody'} · beacon day ${log.beacon}` : ''));
  for (const e of log.entries) console.log(`\n[day ${e.day} · ${e.slot}] ${e.text}`);
}
