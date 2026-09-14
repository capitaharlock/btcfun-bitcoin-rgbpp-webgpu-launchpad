---
id: V2
title: "CKB-VM and xUDT authority spike"
status: done
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [b6e6afe, 73af52d, 1299b37]
---

Execute a minimal Rust script on CKB-VM and create/transfer a test xUDT. Investigate Type identity, owner-mode/extension paths and liability accounting.

## Execution

- Phase: 1.
- Prerequisites: `V1`.

## Done when

- Publish reproducible binary/script hashes and transaction evidence.
- Document how custom issuance constraints compose with xUDT; demonstrate an unauthorized mint rejection.
- Record voluntary-burn and ordinary-transfer implications without assuming an indexer maintains authoritative supply.

## Resolution

The CKB-VM and xUDT authority spike became the mint script itself: a Rust `ckb-std` type script, owner of the launch's xUDT by input type, tested against the deployed xUDT and RGB++ lock in 24 CKB-VM cases and deployed to CKB testnet (OC2, OC3).
