---
title: "Pari-mutuel epoch settlement instead of per-miner reward rate"
updated: 2026-09-23
status: superseded
---

> **Historical decision — superseded by [2026-09-23-review-and-validation-gates](2026-09-23-review-and-validation-gates.md).**
> The original record below is preserved as history, not current guidance.
> Consult `PROTOCOL.md` and the new ADR for adopted scope and unresolved hypotheses.


**Context**: A per-miner rate (BRO-style `clz²` payout) cannot respect a
common `MAX_SUPPLY` — total emission would depend on turnout.

**Decision**: Each epoch's budget is split by work-share,
`B × weightᵢ / Σweights`, settled in one batched CKB transaction. The
netting function is deterministic and the intent queue is published before
broadcast, so any batch can be independently recomputed.

**Consequences**: Supply is bounded by construction; difficulty emerges
from demand (a hot token is genuinely harder to mine); payout is revealed
collectively at epoch close. Hashrate advantage stays log-bounded; capital
advantage is linear but funds the floor.
