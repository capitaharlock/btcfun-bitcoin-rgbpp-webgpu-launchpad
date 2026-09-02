---
id: liquidity-integration
title: "Early venue research and deferred integration"
status: backlog
priority: medium
oneliner: "Check actual venue capabilities early and implement only a funded, justified market design."
modules:
  - liquidity
target: "Phase 1 \u2014 Feasibility; Phase 5 \u2014 Integration"
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [validate-architecture, graduation-protocol, product-validation]
---

# Early venue research and deferred integration

## Why this exists

Pool creation, extension support, exits and funding sources constrain graduation. An interface alone cannot solve custody, liquidity or revenue capture.

## Execution and gate

LQ1 is an early research dependency. LQ2–LQ4 await GR1–GR3 and product validation; use testnet and independently review new fund-controlling behavior before real-fund release.

Gate order and shared evidence: [roadmap](../../docs/roadmap.md).

## Done when

- Early assessment records current contracts/APIs, permissions, asset support and liquidity funding, including an explicit defer/reject outcome if needed.
- Any implemented adapter uses separately funded liquidity and user-authorized transactions.
- Failure and independent-exit tests preserve reserve liabilities; external fees are not assumed to accrue to btc.fun.

## Task plan

- [`LQ1` — Early venue compatibility and liquidity funding assessment](../../modules/liquidity/tasks/LQ1-evaluate-utxoswap-and-other-rgb-venues.md)
- [`LQ2` — Implement the reviewed liquidity adapter](../../modules/liquidity/tasks/LQ2-implement-the-liquidityadapter.md)
- [`LQ3` — Optional swaps, liquidity and actual fee capture](../../modules/liquidity/tasks/LQ3-route-post-graduation-quotes-and-swaps-i.md)
- [`LQ4` — Market creation failure and independent exit verification](../../modules/liquidity/tasks/LQ4-handle-failed-market-creation-verify-per.md)
