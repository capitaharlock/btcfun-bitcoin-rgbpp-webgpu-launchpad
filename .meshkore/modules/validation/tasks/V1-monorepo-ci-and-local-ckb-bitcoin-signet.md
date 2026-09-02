---
id: V1
title: "Minimal workspace, CI and compatible local networks"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-23
---

Set up only the Rust/TypeScript workspace and network tools needed by the spike. Verify the selected Bitcoin/CKB network pairing across wallets, SPV and scripts; reachable endpoints alone are insufficient.

## Execution

- Phase: 1.
- Prerequisites: `E5`.

## Done when

- Pinned toolchains and dependencies reproduce locally and in CI.
- Local/regtest fixtures support controlled failures; one compatible public testnet route is documented.
- Network IDs, script deployments and service requirements are recorded; no unnecessary application packages are scaffolded.
