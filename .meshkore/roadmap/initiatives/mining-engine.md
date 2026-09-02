---
id: mining-engine
title: "Mining and recoverable settlement"
status: backlog
priority: critical
oneliner: "Complete tickets, browser work, claims and redemption with operator-free recovery."
modules:
  - mining
target: "Phase 2 \u2014 Verifiable demo"
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [emission-core, token-launch, provable-trust, web-app]
---

# Mining and recoverable settlement

## Why this exists

This is the core interaction and the critical admission/accounting boundary. A published queue alone cannot provide completeness, censorship resistance or liveness.

## Execution and gate

Implement V9’s reviewed admission/closure and recovery paths using the measured V10 limits. MN6 belongs to provable-trust and is a prerequisite for MN7.

Gate order and shared evidence: [roadmap](../../docs/roadmap.md).

## Done when

- At least two miners complete a correctly accounted epoch with a real wallet and canonical challenge encoding.
- Pending tickets, late/withheld work and service crashes resolve under explicit rules without silent requeue.
- Shutting down official services permits independent settlement or a bounded refund/exit with available evidence.

## Task plan

- [`MN1` — Authenticated tickets and segregated payment accounting](../../modules/mining/tasks/MN1-mining-ticket-purchase-and-payment-split.md)
- [`MN2` — Browser miner with device-aware controls and WASM parity](../../modules/mining/tasks/MN2-webgpu-browser-miner-with-wasm-fallback.md)
- [`MN3` — Replaceable epoch settlement implementation](../../modules/mining/tasks/MN3-epoch-settlement-service.md)
- [`MN4` — Claim signing and explicit two-chain confirmation states](../../modules/mining/tasks/MN4-claim-flow-wallet-signing-and-confirmati.md)
- [`MN5` — Redemption quotes and complete withdrawal flow](../../modules/mining/tasks/MN5-redemption-sell-back-to-the-reserve-at-t.md)
- [`MN7` — Operator shutdown, permissionless completion and exit](../../modules/mining/tasks/MN7-operator-shutdown-permissionless-completion-and-exit.md)
