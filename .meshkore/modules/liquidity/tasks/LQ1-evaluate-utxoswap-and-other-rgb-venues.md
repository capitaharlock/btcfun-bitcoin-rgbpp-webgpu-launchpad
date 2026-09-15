---
id: LQ1
title: "Early venue compatibility and liquidity funding assessment"
status: cancelled
priority: high
owner: rjj
category: liquidity
initiative: liquidity-integration
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T13:30:00Z
---

Evaluate UTXOSwap and other actually available RGB++/CKB venues before designing graduation. This is feasibility research; implementation remains Phase 5.

## Execution

- Phase: 1.
- Prerequisites: `V2`, `V3`, `V6`.

## Done when

- Record current APIs/script deployments, supported xUDT extensions, networks, pool creation and permission requirements.
- Identify both liquidity assets, funder, pool ownership, custody, withdrawals and fees captured by btc.fun if any.
- Write an integrate/defer/reject recommendation with sources and tested evidence; unavailable integration is an allowed finding.

## Resolution

Superseded by the [order-book decision](../../../context/decisions/2026-09-24-peer-to-peer-order-book.md): no pool, no AMM and no market maker. A promoter may take their token to an external venue such as UTXOSwap on their own; the platform does not integrate one. Kept as history.
