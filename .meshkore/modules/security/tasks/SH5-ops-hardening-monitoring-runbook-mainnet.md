---
id: SH5
title: "Production operations and reproducible deployment gate"
status: backlog
priority: critical
owner: rjj
category: security
initiative: security-hardening
created: 2026-09-23
updated: 2026-09-23
---

Prepare production operations without deploying mainnet: dependency pinning, reproducible contract builds, hash verification, monitoring, durable data, backups and incident handling.

## Execution

- Phase: 4.
- Prerequisites: `WA5`, `SH4`, `PV3`.

## Done when

- Rehearse service loss, restore and permissionless recovery without privileged reserve access.
- Monitor solvency/accounting, pending ticket age, relayer lag, batch limits and subsidy spending.
- Document deployment identities, fee payer, capacity budget and incident communications/runbook.
- Production checklist references independent review and commercial readiness; this task alone cannot authorize launch.
