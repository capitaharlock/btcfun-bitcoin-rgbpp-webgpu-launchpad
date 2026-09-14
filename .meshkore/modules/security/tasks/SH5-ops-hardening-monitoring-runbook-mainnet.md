---
id: SH5
title: "Production operations and reproducible deployment gate"
status: backlog
priority: critical
owner: rjj
category: security
initiative: security-hardening
created: 2026-09-23
updated: 2026-09-24
---

Prepare production operations without deploying mainnet: dependency pinning, reproducible contract builds, hash verification, monitoring, durable index data, backups and incident handling.

## Execution

- Phase: 4.
- Prerequisites: `WA5`, `SH4`, `PV3`.

## Done when

- Rehearse loss of the Worker and index, restore, and operation completion without btc.fun's services.
- Monitor queue lag, pending operations, paymaster spend and index drift from chain.
- Document deployment identities, fee payer, CKB capacity budget and incident communications and runbook.
- The production checklist references independent review and commercial readiness; this task alone cannot authorize launch.
