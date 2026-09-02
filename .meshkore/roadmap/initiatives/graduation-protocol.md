---
id: graduation-protocol
title: "Inactive launch exits and deferred market activation"
status: backlog
priority: medium
oneliner: "Complete inactive-launch exits early; redesign market activation only after validation."
modules:
  - graduation
target: "Phase 2 \u2014 Dormancy; Phase 5 \u2014 Optional activation"
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [emission-core, mining-engine, liquidity-integration, product-validation]
---

# Inactive launch exits and deferred market activation

## Why this exists

Dormant holders need a usable exit even if no market is ever built. The old graduation rule counted addresses as humans and proposed spending assets already owed to holders.

## Execution and gate

GR4 is part of the first demo and does not depend on graduation. GR1–GR3 and GR5 are deferred until the product gate and early LQ1 feasibility result; real-fund activation also requires production approval and review of new scripts.

Gate order and shared evidence: [roadmap](../../docs/roadmap.md).

## Done when

- GR4 demonstrates long-inactivity accounting, pending-right resolution and operator-free exit under explicit fee/capacity assumptions.
- Before activation work, a new ADR names separate liquidity funding, token sources, pool ownership and withdrawal rights.
- Market creation never takes redeemable backing, revives expired supply or claims Sybil resistance from address counts.

## Task plan

- [`GR4` — Inactive launch closure and operator-free redemption](../../modules/graduation/tasks/GR4-dormancy-residual-mining-and-permanent-r.md)
- [`GR1` — Deferred market activation economics and rights](../../modules/graduation/tasks/GR1-graduation-conditions-and-state-machine.md)
- [`GR2` — Finalize launch and separately funded liquidity allocation](../../modules/graduation/tasks/GR2-close-mining-finalise-supply-deploy-rese.md)
- [`GR3` — Activation adapter, atomicity and recovery](../../modules/graduation/tasks/GR3-graduation-adapter-interface-atomicity-a.md)
- [`GR5` — Market activation indexing and rights display](../../modules/graduation/tasks/GR5-graduation-events-indexing-and-ui.md)
