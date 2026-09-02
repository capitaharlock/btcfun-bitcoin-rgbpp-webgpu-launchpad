---
id: SH4
title: "Adversarial reorg and recovery regression suite"
status: backlog
priority: critical
owner: rjj
category: security
initiative: security-hardening
created: 2026-09-23
updated: 2026-09-23
---

Expand V8 fixtures into reproducible dual-chain protocol and indexer recovery tests, including accepted cross-chain transitions.

## Execution

- Phase: 2–4.
- Prerequisites: `PC7`, `IX4`, `MN7`.

## Done when

- Exercise same-height hash replacement, long relayer lag, competing settlement and shallow/deep reorgs.
- Accepted supply/liabilities and projected state follow the declared policy, with irreversible residual risks documented.
- Operator-off recovery scenarios remain executable after upgrades to scripts or SDK dependencies.
