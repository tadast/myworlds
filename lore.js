// myworlds — the lore engine. It turns facts about a world and facts about an organism into text.
// The worker loads it with importScripts(); the page loads it with a script tag. It exposes
// self.Lore.
//
// The engine holds no animal words and no plant words. species.js brings the fauna vocabulary,
// and the flora file will bring its own. Keep it that way, so one engine serves both.
//
// Three ideas carry the whole file.
//
// 1. Tags. makeEnv() turns the numbers of a planet — temperature, gravity, day length, moons,
//    rings, ocean, plants, activity — into a set of short words. "frozen", "lowgrav", "moonless".
// 2. Gates. Every line of text may name the tags it needs and the tags it forbids. A line about
//    rain never reaches a world that has no liquid water, because the line is gated on "rainy".
// 3. Slots. A story is an ordered set of named parts. A later pass can fill a part or replace a
//    part, and the story is joined again. Nothing rewrites text by searching it.
'use strict';

(function () {
  // ---------------------------------------------------------------- small helpers
  const pick = (rng, a) => a[Math.floor(rng() * a.length)];
  const rr = (rng, a, b) => a + rng() * (b - a);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const round1 = (x) => Math.round(x * 10) / 10;
  const NUMS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];
  const num = (n) => (n >= 0 && n < NUMS.length ? NUMS[n] : String(n));

  // ---------------------------------------------------------------- gates
  // A gate is one string of terms, tested against the tag set of the world.
  //   "cold"            the world must have the tag
  //   "!gas"            the world must not have the tag
  //   "woody|fungal"    the world must have one of the two
  // An empty gate passes everywhere. parseGate() also counts the terms, because a line that
  // names a condition of the planet outranks a line that fits any planet. See weightOf().
  const gateCache = new Map();
  function parseGate(str) {
    if (!str) return { need: [], ban: [], n: 0 };
    let g = gateCache.get(str);
    if (g) return g;
    const need = [], ban = [];
    for (const term of str.split(/\s+/)) {
      if (!term) continue;
      if (term[0] === '!') ban.push(term.slice(1));
      else need.push(term.split('|'));
    }
    g = { need, ban, n: need.length + ban.length };
    gateCache.set(str, g);
    return g;
  }
  function matchTags(gate, tags) {
    for (const b of gate.ban) if (tags.has(b)) return false;
    for (const any of gate.need) {
      let ok = false;
      for (const t of any) if (tags.has(t)) { ok = true; break; }
      if (!ok) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- pools
  // A pool is an array of lines. A line is a string, or an object:
  //   { t: 'the text', tags: 'cold !gas', if: (ctx) => ..., w: 2 }
  // `t` is the text, `tags` is the gate, `if` is a test on the organism, `w` is the weight.
  function pool(list) {
    return list.map((e) => (typeof e === 'string' ? { t: e } : e));
  }
  function gateOf(e) {
    if (!e._g) e._g = parseGate(e.tags);
    return e._g;
  }
  // How strongly one condition raises a line above a line with no condition. At 0.9 a line with
  // one tag is about twice as likely as a plain line of the same weight, and a line with three
  // tags is about four times as likely. The planet therefore shows through without shutting the
  // general lines out.
  const SPECIFICITY = 0.9;
  function weightOf(e) {
    const w = e.w == null ? 1 : e.w;
    return w * (1 + SPECIFICITY * (gateOf(e).n + (e.if ? 1 : 0)));
  }
  // Every line of a pool that fits this context.
  function candidates(list, ctx) {
    const out = [];
    for (const e of list) {
      if (e.tags && !matchTags(gateOf(e), ctx.tags)) continue;
      if (e.if && !e.if(ctx)) continue;
      out.push(e);
    }
    return out;
  }
  // One line, by weight. Returns null when the pool has nothing for this context, so a caller
  // can fall back rather than print undefined.
  function choose(rng, list, ctx) {
    const c = candidates(list, ctx);
    if (!c.length) return null;
    let total = 0;
    for (const e of c) total += weightOf(e);
    let r = rng() * total;
    for (const e of c) { r -= weightOf(e); if (r <= 0) return e; }
    return c[c.length - 1];
  }
  // One line, or null when the pool has nothing for this context. `used` holds the lines already
  // spent, so a line is not repeated. With `strict`, a pool whose every line is spent gives null
  // rather than a repeat: an optional slot would rather be dropped than say the same sentence
  // twice in one world. A core slot leaves `strict` off, because it must produce something.
  function line(rng, list, ctx, used, strict) {
    let c = candidates(list, ctx);
    if (used && used.size) {
      const fresh = c.filter((e) => !used.has(e));
      if (fresh.length) c = fresh;
      else if (strict) return null;
    }
    if (!c.length) return null;
    let total = 0;
    for (const e of c) total += weightOf(e);
    let r = rng() * total;
    let hit = c[c.length - 1];
    for (const e of c) { r -= weightOf(e); if (r <= 0) { hit = e; break; } }
    if (used) used.add(hit);
    return hit;
  }

  // ---------------------------------------------------------------- text
  const TOKEN = /\{(\w+)\}/g;
  // Replaces {name} with tokens.name. An unknown token is left as it is, so the audit tool sees it.
  function fill(text, tokens) {
    return text.replace(TOKEN, (m, k) => (tokens[k] == null ? m : tokens[k]));
  }
  function tokensIn(text) {
    const out = [];
    let m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(text))) out.push(m[1]);
    return out;
  }
  // Joins the named parts of a story in order and drops the empty ones.
  function assemble(parts, order) {
    return order.map((k) => parts[k]).filter(Boolean).join(' ');
  }
  // Calls build(attempt) until the result is not in `used`. Keeps the last try either way, so a
  // world with few words still gets a name.
  function unique(build, used, tries) {
    let name = '';
    for (let i = 0; i < (tries || 8); i++) {
      name = build(i);
      if (!used.has(name)) break;
    }
    used.add(name);
    return name;
  }

  // ---------------------------------------------------------------- the world facts
  // The caller passes raw numbers. makeEnv() returns the same numbers plus the tag set that every
  // gate tests. A field the caller does not know may be left out: an unknown moon count adds no
  // moon tag, so no line claims a moon that may not be there.
  //
  // Temperature bands, in degrees Celsius:
  //   frozen  < -40      cold  -40 to 5     temperate  5 to 32     hot  32 to 120    molten >= 120
  // Two finer tags ride along: `subzero` below 0 and `searing` at or above 60.
  function makeEnv(f) {
    const tags = new Set();
    const add = (t) => { if (t) tags.add(t); };
    const env = {
      type: f.type, tempC: f.tempC, gravity: f.gravity, dayHours: f.dayHours,
      radiusKm: f.radiusKm, land: f.land, moons: f.moons, moonNames: f.moonNames || [],
      rings: !!f.rings, activity: f.activity || null, floraTags: f.floraTags || [],
      plantWord: f.plantWord || null,
      floraDensity: f.floraDensity == null ? 0 : f.floraDensity, tags,
    };
    add(f.type);

    const t = f.tempC;
    if (t != null) {
      add(t < -40 ? 'frozen' : t < 5 ? 'cold' : t < 32 ? 'temperate' : t < 120 ? 'hot' : 'molten');
      if (t < 0) add('subzero');
      if (t >= 60) add('searing');
      if (t > 0 && t < 100) add('waterliquid');
    }

    const g = f.gravity;
    if (g != null) {
      add(g < 0.7 ? 'lowgrav' : g > 1.35 ? 'highgrav' : 'fairgrav');
      if (g < 0.5) add('feathergrav');
      if (g > 1.8) add('crushgrav');
    }

    const d = f.dayHours;
    if (d != null) {
      add(d < 12 ? 'shortday' : d >= 36 ? 'longday' : 'evenday');
      if (d >= 48) add('slowspin');
    }

    if (f.moons != null) {
      add(f.moons === 0 ? 'moonless' : f.moons === 1 ? 'onemoon' : f.moons === 2 ? 'twomoons' : 'manymoons');
      if (f.moons > 0) add('moonlit');
    }
    if (f.rings) add('ringed');

    const noGround = f.type === 'gas';
    if (noGround) add('noground');
    if (f.land != null && !noGround) {
      if (f.land >= 0.995) add('dryworld');
      else {
        add('hasocean');
        if (f.land < 0.2) add('mostlysea');
        if (f.land > 0.8) add('mostlyland');
      }
    }
    // Rain needs liquid water in the air and a surface to fall on.
    if (tags.has('waterliquid') && tags.has('hasocean') && !noGround) add('rainy');
    // A tide needs a moon to raise it, a sea for it to move, and a sea that is not frozen solid.
    if (f.moons > 0 && tags.has('hasocean') && tags.has('waterliquid')) add('tides');

    // Plants. The caller resolves its own kinds into tags, because a plant kind is generator
    // knowledge and this file holds none. See FLORA_LORE in worker.js.
    if (!env.floraTags.length) add('noflora');
    else {
      add('flora');
      if (env.floraDensity < 0.5) add('sparseflora');
      for (const t of env.floraTags) add(t);
    }
    if (f.activity) add(ACTIVITY_TAG[f.activity] || null);
    return env;
  }
  const ACTIVITY_TAG = {
    volcano: 'volcanic', fissure: 'volcanic', geyser: 'geysers', aurora: 'auroral', lightning: 'stormy',
  };

  // ---------------------------------------------------------------- relations between organisms
  // A rule reads an ordered pair and says whether it holds. `t` is the line the first one gets,
  // `mirror` is the line the second one gets. {other} names the partner.
  //
  // relate() walks every ordered pair once, in a fixed order, so a seed always gives the same
  // relations. `maxPer` caps how many relations one organism may carry, so no story turns into a
  // list. A pair that already has a relation in either direction is skipped.
  function relate(rng, members, rules, opts) {
    const maxPer = (opts && opts.maxPer) || 1;
    const chance = opts && opts.chance != null ? opts.chance : 1;
    const ctxOf = (opts && opts.ctxOf) || ((a, b) => ({ a, b }));
    const count = new Map(), taken = new Set(), out = [];
    const bump = (m) => count.set(m, (count.get(m) || 0) + 1);
    const full = (m) => (count.get(m) || 0) >= maxPer;
    for (let i = 0; i < members.length; i++) {
      for (let j = 0; j < members.length; j++) {
        if (i === j) continue;
        const a = members[i], b = members[j];
        if (full(a) || full(b)) continue;
        const key = i < j ? i + ':' + j : j + ':' + i;
        if (taken.has(key)) continue;
        const ctx = ctxOf(a, b);
        const fits = rules.filter((r) => r.when(ctx));
        if (!fits.length) continue;
        if (rng() >= chance) { continue; }
        let total = 0;
        for (const r of fits) total += r.w == null ? 1 : r.w;
        let x = rng() * total, rule = fits[fits.length - 1];
        for (const r of fits) { x -= r.w == null ? 1 : r.w; if (x <= 0) { rule = r; break; } }
        taken.add(key);
        bump(a); if (rule.mirror) bump(b);
        out.push({ a, b, rule, ctx });
      }
    }
    return out;
  }

  self.Lore = {
    pick, num,
    pool, choose, line, candidates, gateOf, matchTags, parseGate,
    fill, tokensIn, assemble, unique,
    makeEnv, relate, ACTIVITY_TAG,
  };
})();
