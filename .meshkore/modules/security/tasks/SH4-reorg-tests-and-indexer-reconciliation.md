---
id: SH4
title: "Adversarial reorg and recovery regression suite"
status: backlog
priority: critical
owner: rjj
category: security
initiative: security-hardening
created: 2026-09-23
updated: 2026-09-24
---

Expand V8 fixtures into reproducible dual-chain regression tests for the mint script, the client and the index, including a CKB transaction already committed by a reorganised Bitcoin transaction.

## Execution

- Phase: 2–4.
- Prerequisites: `PC7`, `IX4`, `MN7`.

## Done when

- Exercise same-height hash replacement, long queue lag and shallow and deep reorgs.
- Supply and projected state follow the declared policy, with irreversible residual risks documented.
- Recovery without btc.fun's services remains executable after upgrades to scripts or SDK dependencies.
