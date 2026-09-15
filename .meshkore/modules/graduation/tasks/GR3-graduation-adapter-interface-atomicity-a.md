---
id: GR3
title: "Activation adapter, atomicity and recovery"
status: cancelled
priority: high
owner: rjj
category: graduation
initiative: graduation-protocol
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T13:30:00Z
---

Define unsigned market-activation actions and failure recovery for the selected venue; identify whether an actual cross-chain leap is involved.

## Execution

- Phase: 5.
- Prerequisites: `GR2`.

## Done when

- Failed/partial activation preserves holder backing and leaves a recoverable state.
- Permissionless exit and authority boundaries are verified; no adapter has implicit custody.
- New scripts or changed economic behavior receive independent review before real-fund use.

## Resolution

Superseded by the [order-book decision](../../../context/decisions/2026-09-24-peer-to-peer-order-book.md): the market is an order book between users; the platform activates no pool and deploys no liquidity. Kept as history.
