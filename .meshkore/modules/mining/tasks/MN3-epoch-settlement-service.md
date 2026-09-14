---
id: MN3
title: "Replaceable epoch settlement implementation"
status: cancelled
priority: critical
owner: rjj
category: mining
initiative: mining-engine
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
---

Implement a durable reference settler for the adopted admission, close, timeout and batch-limit policy.

## Execution

- Phase: 2.
- Prerequisites: `PC3`, `MN1`, `V10`.

## Done when

- At least two concurrent miners settle with correct accepted membership, weights, liabilities and balances.
- Crash/restart and competing settlers are idempotent; errors and missed deadlines remain visible.
- No silent omission or cross-epoch requeue; all pending tickets reach the specified resolution.
- Data needed for independent settlement is available outside an ephemeral operator queue.

## Resolution

Superseded by the standard tokenomics ([decision](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)): there is no epoch to settle; the RGB++ queue completes each operation on its own. Kept as history.
