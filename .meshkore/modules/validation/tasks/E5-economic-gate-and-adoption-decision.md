---
id: E5
title: "Economic gate and adoption decision"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: economic-validation
created: 2026-09-23
updated: 2026-09-23
---

Write an ADR selecting a complete economic state machine or explicitly rejecting the candidate. Simulation evidence is required; this task does not certify deployed safety.

## Execution

- Phase: 0.
- Prerequisites: `E2`, `E3`, `E4`, `SH1`, `SH2`, `SH3`.

## Done when

- Original counterexamples fail against the replacement for explained reasons; no accepted scenario extracts old backing through cheap new issuance.
- Conservation, issuance bounds, redemption rounding and recovery rights have executable properties and disclosed assumptions.
- Adopt one demo parameter set and initial segment, or stop economic implementation with a concrete redesign decision.
- Update PROTOCOL.md and any affected acceptance criteria before PC1–PC8 implement the adopted rules.
