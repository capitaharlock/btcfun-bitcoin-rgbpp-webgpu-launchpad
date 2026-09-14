---
id: economic-validation
title: "Economic model validation"
status: cancelled
priority: critical
oneliner: "Turn the review counterexamples into executable economic rules before implementing contracts."
modules:
  - validation
target: "Phase 0 \u2014 Economic correction"
created: 2026-09-23
updated: 2026-09-24
owner: rjj
related: [security-hardening, validate-architecture, product-validation]
---

> **Superseded by the [standard tokenomics](../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md).** The economic model is decided; E4 (incentive and unit-economics simulation) remains useful and stays open.

# Economic model validation

## Why this exists

The old model can dilute backing and reward isolated entrants with previous participants’ reserves. Its claims must be replaced by a complete, tested state machine rather than copied into scripts.

## Execution and gate

V0 records the completed roadmap revision. Start E1 next; SH1–SH3 supply the early threat and incentive analysis. E5 is the economic adoption gate. Small product research tasks may run alongside this work.

Gate order and shared evidence: [roadmap](../../docs/roadmap.md).

## Done when

- The old failures are reproducible and the chosen replacement passes the stated adversarial scenarios.
- Discrete emission, reserve/liability accounting, admission timing, refunds, creator escrow and terminal states are specified.
- E5 adopts the model and one demo parameter set in an ADR, or explicitly rejects it before contract implementation.

## Task plan

- [`V0` — Revise roadmap and context after design review](../../modules/validation/tasks/V0-revise-roadmap-and-context-after-design-review.md)
- [`E1` — Reproduce reserve dilution and define economic requirements](../../modules/validation/tasks/E1-reproduce-reserve-dilution-and-define-economic-requirements.md)
- [`E2` — Specify discrete emission, rounding and terminal accounting](../../modules/validation/tasks/E2-specify-discrete-emission-rounding-and-terminal-accounting.md)
- [`E3` — Design ticket admission, backing and exit rules](../../modules/validation/tasks/E3-design-ticket-admission-backing-and-exit-rules.md)
- [`E4` — Simulate incentives, hardware and unit economics](../../modules/validation/tasks/E4-simulate-incentives-hardware-and-unit-economics.md)
- [`E5` — Economic gate and adoption decision](../../modules/validation/tasks/E5-economic-gate-and-adoption-decision.md)
