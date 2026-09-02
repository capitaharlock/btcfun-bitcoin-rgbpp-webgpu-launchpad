---
id: V2
title: "CKB-VM and xUDT authority spike"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-23
---

Execute a minimal Rust script on CKB-VM and create/transfer a test xUDT. Investigate Type identity, owner-mode/extension paths and liability accounting.

## Execution

- Phase: 1.
- Prerequisites: `V1`.

## Done when

- Publish reproducible binary/script hashes and transaction evidence.
- Document how custom issuance constraints compose with xUDT; demonstrate an unauthorized mint rejection.
- Record voluntary-burn and ordinary-transfer implications without assuming an indexer maintains authoritative supply.
