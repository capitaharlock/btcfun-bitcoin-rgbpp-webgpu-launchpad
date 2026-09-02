---
id: security-hardening
title: "Security from modeling through production"
status: backlog
priority: critical
oneliner: "Model attacks early and require independent review plus operational readiness before real funds."
modules:
  - security
target: "Phase 0 onward; Phase 4 \u2014 Real-fund gate"
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [economic-validation, validate-architecture, emission-core, product-validation]
---

# Security from modeling through production

## Why this exists

Economic and trust-boundary errors are design inputs, not end-of-roadmap cleanup. Independent review applies to every fund-controlling path, not only future graduation.

## Execution and gate

SH1–SH3 inform E3–E5. V8/IX4/MN7 provide early reorg/recovery evidence; SH4 extends it. SH5–SH7 close the production gate after the product decision. Later economic/script changes reopen relevant gates.

Gate order and shared evidence: [roadmap](../../docs/roadmap.md).

## Done when

- Threats, assumptions and regression evidence cover mint authority, backing, admissions, data availability and two-chain finality.
- Independent review findings are resolved against exact reproducible artifacts.
- Operations, disclosures and the proposed paid-ticket product have documented readiness assessments and an explicit go/no-go before real funds.

## Task plan

- [`SH1` — Early threat model and independent review scope](../../modules/security/tasks/SH1-threat-model-and-contract-audit-scoping.md)
- [`SH2` — Economic attack model and simulation scenarios](../../modules/security/tasks/SH2-emission-and-epoch-economics-attacks.md)
- [`SH3` — PoW, admission and concentration attack analysis](../../modules/security/tasks/SH3-pow-specific-attacks.md)
- [`SH4` — Adversarial reorg and recovery regression suite](../../modules/security/tasks/SH4-reorg-tests-and-indexer-reconciliation.md)
- [`SH5` — Production operations and reproducible deployment gate](../../modules/security/tasks/SH5-ops-hardening-monitoring-runbook-mainnet.md)
- [`SH6` — Independent protocol review and remediation](../../modules/security/tasks/SH6-independent-protocol-review-and-remediation.md)
- [`SH7` — Commercial readiness and real-fund launch decision](../../modules/security/tasks/SH7-commercial-readiness-and-real-fund-launch-decision.md)
