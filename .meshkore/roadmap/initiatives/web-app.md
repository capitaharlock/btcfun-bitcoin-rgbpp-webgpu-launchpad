---
id: web-app
title: "Minimal verifiable web experience"
status: backlog
priority: high
oneliner: "Let a non-developer complete and understand the real mining and exit lifecycle."
modules:
  - web
target: "Phase 2 \u2014 Integrated demo"
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [mining-engine, indexer-api, provable-trust, product-validation]
---

# Minimal verifiable web experience

## Why this exists

The demo should make costs, evidence, variable rewards and recovery understandable. A polished marketplace does not establish that the core loop is usable.

## Execution and gate

Select one wallet. Lightweight UX experiments may start under PV1, but this initiative is complete only after the real integrated flows and failure cases pass. WA6 is owned by provable-trust.

Gate order and shared evidence: [roadmap](../../docs/roadmap.md).

## Done when

- A non-developer can create a launch, pay, mine, submit, claim, inspect evidence and redeem.
- Fees, capacity, reserve denomination and provisional/final states are explicit.
- WA5 covers real flow fixtures, negative cases and a recorded real-wallet testnet run; official-service outage is demonstrated.

## Task plan

- [`WA1` — Minimal app and one compatible wallet](../../modules/web/tasks/WA1-app-shell-wallet-connection-layer-networ.md)
- [`WA2` — Launch page and evidence-aware state display](../../modules/web/tasks/WA2-launch-flow-and-token-page.md)
- [`WA3` — Mining experience and understandable settlement reveal](../../modules/web/tasks/WA3-the-mine-experience-grinding-hash-reveal.md)
- [`WA4` — Holdings, redemption value and recovery UI](../../modules/web/tasks/WA4-portfolio-your-floor-burn-dashboard-feed.md)
- [`WA5` — End-to-end demo and failure-path checks](../../modules/web/tasks/WA5-playwright-end-to-end-flows.md)
