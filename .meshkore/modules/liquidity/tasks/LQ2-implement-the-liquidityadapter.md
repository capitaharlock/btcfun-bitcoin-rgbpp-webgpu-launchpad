---
id: LQ2
title: "Implement the reviewed liquidity adapter"
status: cancelled
priority: medium
owner: rjj
category: liquidity
initiative: liquidity-integration
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T13:30:00Z
---

Build the adapter against the selected supported venue after activation economics and product demand are approved.

## Execution

- Phase: 5.
- Prerequisites: `GR3`, `LQ1`.

## Done when

- A test token receives a separately funded market through unsigned user-authorized actions.
- Verify asset/script compatibility and accounting on the selected network; never debit redemption backing.

## Resolution

Superseded by the [order-book decision](../../../context/decisions/2026-09-24-peer-to-peer-order-book.md): no pool, no AMM and no market maker. A promoter may take their token to an external venue such as UTXOSwap on their own; the platform does not integrate one. Kept as history.
