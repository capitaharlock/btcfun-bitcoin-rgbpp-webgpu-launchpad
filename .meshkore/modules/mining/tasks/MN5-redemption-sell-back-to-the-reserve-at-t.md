---
id: MN5
title: "Redemption quotes and complete withdrawal flow"
status: backlog
priority: high
owner: rjj
category: mining
initiative: mining-engine
created: 2026-09-23
updated: 2026-09-23
---

Build, quote and sign redemption in the named reserve asset with integer payouts, fees and capacity requirements.

## Execution

- Phase: 2.
- Prerequisites: `PC6`, `MN4`.

## Done when

- Intermediate and final withdrawals obey the adopted rounding and terminal rules.
- A quote distinguishes gross backing entitlement, fees/capacity and net output; user bounds are enforced.
- Never promise ticket-cost recovery or exact real-number floor invariance.
