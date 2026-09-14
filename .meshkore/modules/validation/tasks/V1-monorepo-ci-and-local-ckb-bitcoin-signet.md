---
id: V1
title: "Minimal workspace, CI and compatible local networks"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-24
---

Toolchains are pinned (`contracts/rust-toolchain.toml`, `apps/web/package-lock.json`) and the simulated chains cover controlled failures in the browser suite. What remains is continuous integration and a documented public route.

## Execution

- Phase: 1.
- Prerequisites: `OC1`.

## Done when

- CI builds the mint script, runs `cargo test`, the unit suite and the browser suite on every change.
- The public route — Bitcoin testnet3, CKB testnet, the RGB++ services and the deployed scripts — is recorded with network IDs and service requirements.
- No unnecessary application packages are scaffolded.
