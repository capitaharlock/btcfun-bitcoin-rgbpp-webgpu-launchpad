---
id: PC6
title: "Segregated reserve and integer redemption accounting"
status: cancelled
priority: critical
owner: rjj
category: protocol
initiative: emission-core
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
---

Implement the adopted reserve model, issuance backing check and rounded redemption with exact liability accounting.

## Execution

- Phase: 2.
- Prerequisites: `PC1`, `PC4`, `PC8`.

## Done when

- Reject unauthorized reserve debits and deposits being counted both as backing and escrow/revenue.
- For intermediate and final withdrawals, payout, rounding dust, zero-state behavior and capacity payer follow the specification.
- Admission/settlement/redemption interleavings cannot extract pending deposits or dilute existing backing under the adopted model.
- Creator escrow and inactive-launch outcomes are enforced; market activation cannot spend holder backing.

## Resolution

Superseded by the standard tokenomics ([decision](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)): the standard issues no reserve and offers no redemption; ticket income is the promoter's. Kept as history.
