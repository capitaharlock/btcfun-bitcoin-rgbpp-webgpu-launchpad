---
id: IX2
title: "Reconciled allowance, liabilities and reserve metrics"
status: backlog
priority: high
owner: rjj
category: indexer
initiative: indexer-api
created: 2026-09-23
updated: 2026-09-23
---

Expose scheduled/expired allowance, issued burns, outstanding liabilities, spendable backing and segregated escrow as separate metrics.

## Execution

- Phase: 2.
- Prerequisites: `IX1`, `PC6`.

## Done when

- All amounts reconcile to canonical state with explicit reserve denomination and confirmation status.
- Redemption estimates include rounding and practical withdrawal costs.
- Supply is not labeled demand, addresses are not labeled people, and reserve value is not guaranteed P&L.
