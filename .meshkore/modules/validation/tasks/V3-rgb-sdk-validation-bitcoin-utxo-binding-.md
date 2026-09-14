---
id: V3
title: "Current RGB++ SDK, wallet and authorization validation"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-24
---

The tooling is chosen — the `rgbpp` SDK on CCC, the public services on testnet3 (`PROTOCOL.md` §6.2) — and the app's own wallet builds every operation. What remains is proof on the live networks and wallet visibility.

## Execution

- Phase: 1.
- Prerequisites: `OC1`.

## Done when

- A real wallet completes open, ticket, mint, transfer and sale on testnet with transaction IDs and proof dependencies (OC1, OC8).
- Who signs each step, the actual lock and type scripts, service dependencies and provisional/confirmed/anchored states are documented.
- An RGB++-aware wallet or explorer shows the minted balance under the launch's type hash; leap is assessed separately and only demonstrated capabilities are claimed.
