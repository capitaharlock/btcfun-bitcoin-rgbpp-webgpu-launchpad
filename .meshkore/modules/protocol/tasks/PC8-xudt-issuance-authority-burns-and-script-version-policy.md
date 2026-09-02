---
id: PC8
title: "xUDT issuance authority, burns and script version policy"
status: backlog
priority: critical
owner: rjj
category: protocol
initiative: emission-core
created: 2026-09-23
updated: 2026-09-23
---

Implement the concrete xUDT owner-mode/extension design and unique mint authority compatible with RGB++ and the reserve liability model.

## Execution

- Phase: 2.
- Prerequisites: `PC1`, `V2`, `V3`, `SH1`.

## Done when

- No owner key, alternate owner-mode path or fabricated state Cell can bypass issuance constraints.
- Full Type identity and all supported mint/transfer/burn paths are documented and tested.
- Voluntary burns and unclaimed allocations preserve canonical liabilities without relying on the indexer.
- Pin script code/dependencies; define immutable deployments or explicit reviewed migrations without silent administrator control.
