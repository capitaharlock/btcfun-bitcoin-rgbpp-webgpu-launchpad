---
id: V6
title: "Choose the demo reserve asset and funding model"
status: cancelled
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
---

Select one named asset directly manageable by CKB scripts for the demo. Defer native-BTC reserve implementation; its custody/atomicity model is not hidden behind a replaceable interface.

## Execution

- Phase: 1.
- Prerequisites: `E5`, `V2`.

## Done when

- ADR records denomination, script authority, asset assumptions, decimals, fee payer and output/Cell capacity funding.
- Prove the accounting separates redeemable backing, occupied capacity, pending deposits and all escrow balances.
- No mainnet BTC or fiat value guarantee is implied; terminal withdrawal practicality is documented.

## Resolution

Superseded by the standard tokenomics ([decision](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)): there is no reserve asset. Kept as history.
