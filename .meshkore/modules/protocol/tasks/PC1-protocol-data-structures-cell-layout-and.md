---
id: PC1
title: "Canonical schemas, Cell layout and immutable launch rules"
status: backlog
priority: critical
owner: rjj
category: protocol
initiative: emission-core
created: 2026-09-23
updated: 2026-09-23
---

Define canonical binary schemas and the actual Cell/script decomposition for the adopted protocol. Include launch-height commitment and versioned immutable economics.

## Execution

- Phase: 2.
- Prerequisites: `E5`, `V2`, `V5`, `V6`, `V8`, `V9`, `V10`.

## Done when

- Each field has an authoritative script and encoding; distinguish emitted/expired/burned amounts and outstanding liabilities.
- Per-launch state, intents, reserves and escrow have explicit consumption rules and no shared cross-token bottleneck.
- Concurrent issuance/redemption and pending backing follow the adopted atomicity rules.
