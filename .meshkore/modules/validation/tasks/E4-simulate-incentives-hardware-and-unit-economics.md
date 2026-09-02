---
id: E4
title: "Simulate incentives, hardware and unit economics"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: economic-validation
created: 2026-09-23
updated: 2026-09-23
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
