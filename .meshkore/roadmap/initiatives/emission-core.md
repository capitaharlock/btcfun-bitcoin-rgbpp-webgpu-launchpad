---
id: emission-core
title: "Emission and reserve core"
status: backlog
priority: critical
oneliner: "Implement the adopted issuance, authority, admission and reserve invariants."
modules:
  - protocol
target: "Phase 2 \u2014 Verifiable demo"
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [economic-validation, validate-architecture, mining-engine, token-launch]
---

# Emission and reserve core

## Why this exists

The technical demonstration depends on scripts enforcing a correct economic model. The reference model is an input, not a replacement for on-chain authorization and validation.

## Execution and gate

E5 and the Phase 1 evidence gate precede core implementation. Follow task prerequisites; PC4 can be extracted from the arithmetic spike before the rest of the core.

Gate order and shared evidence: [roadmap](../../docs/roadmap.md).

## Done when

- Unauthorized issuance, omitted admissions, incorrect allocations and unauthorized backing debits are rejected.
- Discrete allowance expiry, rounded redemption and canonical liabilities match the adopted specification.
- PC7 publishes differential/property/fuzz evidence and original counterexamples as regression cases.

## Task plan

- [`PC1` — Canonical schemas, Cell layout and immutable launch rules](../../modules/protocol/tasks/PC1-protocol-data-structures-cell-layout-and.md)
- [`PC2` — Discrete emission ceiling and permanent allowance expiry](../../modules/protocol/tasks/PC2-emission-engine-block-decay-epoch-budget.md)
- [`PC3` — Admission, closure and weighted allocation validation](../../modules/protocol/tasks/PC3-pari-mutuel-settlement-validation.md)
- [`PC4` — Checked integer arithmetic and selected decay approximation](../../modules/protocol/tasks/PC4-q64-64-math-crate-typescript-port.md)
- [`PC5` — Bound work verification and validated weighting](../../modules/protocol/tasks/PC5-on-chain-pow-verification-and-clz-weight.md)
- [`PC6` — Segregated reserve and integer redemption accounting](../../modules/protocol/tasks/PC6-reserve-floor-and-floor-invariant-redemp.md)
- [`PC7` — Property, differential and fuzz checks for adopted invariants](../../modules/protocol/tasks/PC7-property-fuzz-tests-for-emission-and-res.md)
- [`PC8` — xUDT issuance authority, burns and script version policy](../../modules/protocol/tasks/PC8-xudt-issuance-authority-burns-and-script-version-policy.md)
