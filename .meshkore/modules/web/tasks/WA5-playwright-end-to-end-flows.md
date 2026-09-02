---
id: WA5
title: "End-to-end demo and failure-path checks"
status: backlog
priority: high
owner: rjj
category: web
initiative: web-app
created: 2026-09-23
updated: 2026-09-23
---

Automate the integrated launch → ticket → mine → settle → verify → redeem path with deterministic local fixtures, plus a recorded real-wallet testnet run.

## Execution

- Phase: 2.
- Prerequisites: `WA2`, `WA3`, `WA4`, `WA6`, `IX4`, `GR4`.

## Done when

- CI covers normal, rejected proof, expired ticket, recovery, final redemption and reorg-status cases.
- Fixture success is distinguished from the actual wallet/network run.
- A reviewer can reproduce the demo with pinned scripts and instructions.
