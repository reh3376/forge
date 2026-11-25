# Freshness models (D-21 §14)

TLA+ models of the law "a hub never shows its trust state current while an update is withheld longer than the threshold, and staleness never stops it running" (`docs/decisions/security-framework.md` §14). Checked on 2026-11-25 with the repository's pinned TLC (`scripts/tla/tlc.sh`, tla2tools 1.7.4, `-deadlock` because the bounded clock ends every behaviour):

| Model | Configuration | Result |
|---|---|---|
| `Fresh_challenge.tla` (nonce challenge-response, age on the hub's monotonic clock) | `Fresh_challenge.cfg`: 2 versions, time 5, threshold 1, 3 nonces; the network drops, delays and replays; the wall clock can be held back | passes: 970,238 distinct states, depth 22 |
| `Fresh_receipt.tla` (broadcast, fresh on receipt) | `Fresh_receipt.cfg` | fails at depth 6: a replayed statement counted fresh while version 2 is withheld |
| `Fresh_statement.tla` (broadcast, fresh by the statement's time) | `Fresh_statement.cfg` | fails: the wall clock held at 0 while real time reaches 2 |
| `Src_k1.tla` (several sources, one answer enough, forge-core compromised) | `Src_k1.cfg` | fails: the compromised core answers version 1 at time 3 |
| `Src_k2.tla` (two agreeing answers, none newer) | `Src_k2.cfg`: 3 versions, time 6, threshold 2, 3 sources, 1 compromised, honest answers droppable | passes: 905,702 distinct states, depth 26 |

`Freshness.tla` and `FreshnessSources.tla` are the shared definitions. A larger bound (3 versions, time 7) of the challenge model reached 93 million states without finishing. "Staleness never stops a hub" is structural: no action stops the hub and none depends on staleness.
