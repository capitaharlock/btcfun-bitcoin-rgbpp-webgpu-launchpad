---
id: MN7
title: "Operator shutdown, permissionless completion and exit"
status: backlog
priority: critical
owner: rjj
category: mining
initiative: mining-engine
created: 2026-09-23
updated: 2026-09-23
---

Integrate V9’s recovery route and exercise it with the official services disabled.

## Execution

- Phase: 2.
- Prerequisites: `MN3`, `MN4`, `MN5`, `MN6`.

## Done when

- Another client settles or executes the specified bounded refund/exit using independently available data.
- Withheld submissions, expired windows and partially attempted batches resolve under explicit rules.
- No administrator signature is needed; all fees, delay and availability assumptions are documented.
- Publish a reproducible recovery scenario for the first demo.
