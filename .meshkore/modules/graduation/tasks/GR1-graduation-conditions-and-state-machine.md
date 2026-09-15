---
id: GR1
title: "Deferred market activation economics and rights"
status: cancelled
priority: high
owner: rjj
category: graduation
initiative: graduation-protocol
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T13:30:00Z
---

Redesign optional market activation after product validation. Separate demand/distribution indicators from Sybil-resistant identity claims.

## Execution

- Phase: 5.
- Prerequisites: `PV3`, `LQ1`, `E5`.

## Done when

- Document liquidity capital and token sources without taking redeemable backing or reviving expired allowance.
- Specify pool ownership, withdrawals, token-holder rights and concentration assumptions.
- Reject address-count graduation as proof that a whale cannot satisfy the conditions.
- Adopt a new ADR before implementing activation; material economic changes reopen simulation and review gates.

## Resolution

Superseded by the [order-book decision](../../../context/decisions/2026-09-24-peer-to-peer-order-book.md): the market is an order book between users; the platform activates no pool and deploys no liquidity. Kept as history.
