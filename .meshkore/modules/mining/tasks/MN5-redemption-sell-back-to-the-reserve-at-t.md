---
id: MN5
title: "Redemption quotes and complete withdrawal flow"
status: cancelled
priority: high
owner: rjj
category: mining
initiative: mining-engine
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
---

Build, quote and sign redemption in the named reserve asset with integer payouts, fees and capacity requirements.

## Execution

- Phase: 2.
- Prerequisites: `PC6`, `MN4`.

## Done when

- Intermediate and final withdrawals obey the adopted rounding and terminal rules.
- A quote distinguishes gross backing entitlement, fees/capacity and net output; user bounds are enforced.
- Never promise ticket-cost recovery or exact real-number floor invariance.

## Resolution

Superseded by the standard tokenomics ([decision](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)): there is no reserve to redeem against. Kept as history.
