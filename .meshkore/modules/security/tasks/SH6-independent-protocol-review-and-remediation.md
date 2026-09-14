---
id: SH6
title: "Independent protocol review and remediation"
status: backlog
priority: critical
owner: rjj
category: security
initiative: security-hardening
created: 2026-09-23
updated: 2026-09-24
---

Obtain an independent review of the deployed mint script, its xUDT authority and the sale construction; remediate findings before any real-fund release.

## Execution

- Phase: 4.
- Prerequisites: `PC7`, `SH4`, `PV3`.

## Done when

- Scope includes xUDT owner mode, ticket payment, the anchor and SPV assumptions, work verification, miner-cell transitions and the `SIGHASH_SINGLE | ANYONECANPAY` sale.
- Findings have severity, reproducible cases and a documented resolution or an explicit launch-blocking status.
- The review applies to exact source and dependency revisions and reproducible binaries; material changes trigger a focused re-review.
