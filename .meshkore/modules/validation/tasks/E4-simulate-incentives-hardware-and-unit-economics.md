---
id: E4
title: "Simulate incentives, hardware and unit economics"
status: cancelled
priority: critical
owner: rjj
category: validation
initiative: economic-validation
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T13:30:00Z
---

Run seeded adversarial and demand simulations before choosing ticket price, fee split, epoch policy and weight. The previous 85/10/5 split is a baseline scenario only.

## Execution

- Phase: 0.
- Prerequisites: `E3`, `SH2`, `SH3`.

## Done when

- Exercise declining turnout, isolated entrants, creator self-participation, many-ticket strategies, timing, selective submission and redemption races.
- Measure reserve extraction, concentration, returns by cohort, creator incentives and contribution margin across stated assumptions.
- Compare representative work budgets and ticket counts; do not equate address count with participants.
- Include fee spikes, output/Cell funding, infrastructure/subsidy costs and zero external DEX revenue by default.
- Publish sensitivity ranges, limitations and reasons to reject or continue each candidate.

## Resolution

The ticket price, fee split and reward were set by the operator as one standard for every launch ([tokenomics](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md), [fee](../../../context/decisions/2026-09-24-platform-fee-per-ticket.md)); there is no epoch policy or weight left to simulate. The Lab view simulates supply and promoter income per week. Kept as history.
