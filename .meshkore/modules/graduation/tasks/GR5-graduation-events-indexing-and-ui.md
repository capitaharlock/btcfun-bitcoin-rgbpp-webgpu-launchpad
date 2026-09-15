---
id: GR5
title: "Market activation indexing and rights display"
status: cancelled
priority: medium
owner: rjj
category: graduation
initiative: graduation-protocol
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T13:30:00Z
---

Expose future market activation and failure states without obscuring retained reserve rights.

## Execution

- Phase: 5.
- Prerequisites: `GR3`, `IX2`.

## Done when

- UI distinguishes liquidity, backing, pending activation and confirmation status.
- Users can see the source of market liquidity and the applicable exit routes.

## Resolution

Superseded by the [order-book decision](../../../context/decisions/2026-09-24-peer-to-peer-order-book.md): the market is an order book between users; the platform activates no pool and deploys no liquidity. Kept as history.
