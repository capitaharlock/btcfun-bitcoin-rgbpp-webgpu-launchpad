---
id: PC8
title: "xUDT issuance authority, burns and script version policy"
status: done
priority: critical
owner: rjj
category: protocol
initiative: emission-core
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [b6e6afe, 73af52d]
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

## Resolution

The launch's xUDT names the mint script's hash as owner under the input-type flag, so minting is possible only in a transaction the script approves; no key can bypass it. Burns are allowed (the balance may shrink, never grow outside a mint). The script is deployed with `hash_type: data1` in a cell nobody can spend, so its version is its code hash and cannot be swapped.
