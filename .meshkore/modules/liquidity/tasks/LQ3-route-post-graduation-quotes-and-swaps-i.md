---
id: LQ3
title: "Optional swaps, liquidity and actual fee capture"
status: cancelled
priority: low
owner: rjj
category: liquidity
initiative: liquidity-integration
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T13:30:00Z
---

Route user-approved quotes/swaps and index actual liquidity after market activation.

## Execution

- Phase: 5.
- Prerequisites: `LQ2`.

## Done when

- Enforce quote expiry and user output bounds; expose execution venue and fees.
- Report external venue fees separately from any explicitly implemented btc.fun revenue.

## Resolution

Superseded by the [order-book decision](../../../context/decisions/2026-09-24-peer-to-peer-order-book.md): no pool, no AMM and no market maker. A promoter may take their token to an external venue such as UTXOSwap on their own; the platform does not integrate one. Kept as history.
