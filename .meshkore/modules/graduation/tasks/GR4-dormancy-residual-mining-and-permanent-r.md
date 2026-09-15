---
id: GR4
title: "Inactive launch closure and operator-free redemption"
status: cancelled
priority: critical
owner: rjj
category: graduation
initiative: graduation-protocol
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T13:30:00Z
---

Implement inactive/closed launch handling for the first demo. This task is intentionally early; it does not depend on deferred market activation.

## Execution

- Phase: 2.
- Prerequisites: `PC2`, `PC6`, `MN7`.

## Done when

- Long inactivity can be advanced with bounded work and the adopted terminal emission policy.
- Pending claims, refunds, creator escrow and final redemption have complete outcomes.
- Remaining holders can use the documented exit path without the official operator, subject to explicit chain/fee/capacity assumptions.
- No claim of nonzero residual emission or economically practical redemption forever.

## Resolution

Superseded by the standard tokenomics and the [order-book decision](../../../context/decisions/2026-09-24-peer-to-peer-order-book.md): there is no reserve to exit from. Tokens are xUDT cells sealed to their holders' Bitcoin UTXOs and stay transferable and sellable whether or not a launch is still minting. Kept as history.
