# 08 Sociality gene

Status: CLOSED, 2026-09-08, merged as d223dee.

Type: AFK. Phase 1. Blocked by: none. Read `docs/issues/README.md` first, in particular "The sociality gene" and "Metres for a creature". Read `docs/fauna.md`.

## What to build

Two additions to `species.js`, both deterministic per seed, and no change to the globe rendering.

1. **`G.social`.** Roll `{ kind, n, spread }` per species. Weights: land `quad` and `hexapod` herd 60%, pair 15%, solitary 25%. `biped`, `tripod`, `monopod` herd 30%, pair 30%, solitary 40%. `serpent` solitary 80%, pair 20%. Air `wings` herd 50% and `swarm` plans always herd. `sac` and `fins` solitary 70%, pair 30%. Sub-surface species solitary 60%, pair 20%, herd 20%. Herd `n` is 4 to 14. `spread` in metres is `n` times the body metres times 0.8, so a herd of large animals has room.
2. **`Species.bodyMetres(G)`.** Returns `{ metres, axis }` from the same numbers `sizeText` uses. `axis` is `'height'` for `monopod`, `biped`, `tripod`, `quad`, `hexapod`, `periscope`, `sac`; and `'length'` for `serpent`, `wings`, `fins`, `arch`, `plough`. `sizeText` must call the same function so the lore and the scale cannot drift.
3. **Lore.** The manner and the story mention the sociality when it fits: "moves in herds of twelve", "hunts in pairs", "keeps to itself". Add to the modular story parts in the same style as the existing text. The `herd` temperament that already exists for animals with a high pause factor should be consistent with `G.social`: when `social.kind` is `herd`, the manner text says so, and a solitary species never gets the `herd` manner.
4. **Docs.** Add `social` and `bodyMetres` to the genome table in `docs/fauna.md`.

## Acceptance criteria

- [x] `__mw.current.world.species[i].social` exists for every species and is the same on reload.
- [x] The inspector card for a herd species mentions the herd in the manner or the story. A solitary species never says "herd".
- [x] `Species.bodyMetres(G).metres` equals the leading number in `lore.size` for every locomotion. Verify with a console loop over the species of five seeds.
- [x] Names, sizes, and stories of `Auralis` species are unchanged except for the new sociality sentence. Rolling `social` must come after the existing rolls in the RNG stream, so nothing earlier shifts.
  - Decision, 2026-09-08: this criterion and item 3 disagree. The old code gives the `herd` manner from a high pause factor. The new gene can make the same species solitary. The card then states two facts that cannot both be true. Item 3 wins. A solitary species loses the herd sentence, and gets the `wary` sentence in its place. Two `Auralis` stories change. Names, latin names, and sizes do not change.
- [x] `docs/fauna.md` updated.

## Blocked by

None. Can start immediately.
