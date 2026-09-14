---
id: validate-architecture
title: "Technical validation"
status: backlog
priority: critical
oneliner: "Prove the selected wallet, RGB++, CKB, clock and recovery design with measured costs."
modules:
  - validation
target: "Phase 1 \u2014 Architecture proof"
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [economic-validation, security-hardening, liquidity-integration]
---

# Technical validation

## Why this exists

The stack must support the actual authorization and economic lifecycle, including operator failure and two-chain finality. A successful isolated xUDT transfer or cheap hash is insufficient.

## Execution and gate

Implementation starts after E5. Complete V1–V10 plus the LQ1 feasibility assessment before the integrated demo gate is pursued; an unavailable DEX is a recorded finding, not a reason to build an AMM.

Gate order and shared evidence: [roadmap](../../docs/roadmap.md).

## Done when

- Pinned tools reproduce a real-wallet authorization and transfer lifecycle on a compatible network.
- Accepted Bitcoin clock and finality policy, CKB-side reserve, admission completeness and operator-free recovery have demonstrated implementations.
- Math matches the independent reference; full-route fees/capacity/latency and batch contention establish a viable envelope.
- V10 records a go/no-go against explicit cost, finality and recovery constraints.

## Task plan

- [`V1` — Minimal workspace, CI and compatible local networks](../../modules/validation/tasks/V1-monorepo-ci-and-local-ckb-bitcoin-signet.md)
- [`V2` — CKB-VM and xUDT authority spike](../../modules/validation/tasks/V2-ckb-vm-risc-v-script-test-xudt-create-tr.md)
- [`V3` — Current RGB++ SDK, wallet and authorization validation](../../modules/validation/tasks/V3-rgb-sdk-validation-bitcoin-utxo-binding-.md)
- [`V4` — Measure end-to-end cost and latency](../../modules/validation/tasks/V4-benchmark-transactions-and-derive-a-viab.md)
- [`V5` — Deterministic integer math and cross-language vectors](../../modules/validation/tasks/V5-emission-math-test-vectors-decay-pari-mu.md)
- [`V6` — Choose the demo reserve asset and funding model](../../modules/validation/tasks/V6-reserve-asset-investigation-ckb-side-vs-.md)
- [`V7` — PoW verification and browser feasibility measurements](../../modules/validation/tasks/V7-on-chain-pow-verification-cost-webgpu-mi.md)
- [`V8` — Confirmation policy and dual-chain reorg treatment](../../modules/validation/tasks/V8-bitcoin-clock-spv-freshness-and-dual-chain-reorg-policy.md)
- [`V9` — Admission completeness and operator-free recovery spike](../../modules/validation/tasks/V9-admission-completeness-and-operator-free-recovery-spike.md)
- [`V10` — Full batch capacity and per-launch contention envelope](../../modules/validation/tasks/V10-full-batch-capacity-and-per-launch-contention-envelope.md)
