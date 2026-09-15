---
id: LQ4
title: "Market creation failure and independent exit verification"
status: cancelled
priority: high
owner: rjj
category: liquidity
initiative: liquidity-integration
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T13:30:00Z
---

Test failures and permissionless exit with the portal/adapter service unavailable.

## Execution

- Phase: 5.
- Prerequisites: `LQ2`.

## Done when

- No failed market action strands backing or changes existing holder redemption rights.
- Liquidity owners can execute the reviewed exit path independently; publish reproducible evidence.
- Material new fund-controlling code is reviewed before real-fund deployment.

## Resolution

Superseded by the [order-book decision](../../../context/decisions/2026-09-24-peer-to-peer-order-book.md): no pool, no AMM and no market maker. A promoter may take their token to an external venue such as UTXOSwap on their own; the platform does not integrate one. Kept as history.
