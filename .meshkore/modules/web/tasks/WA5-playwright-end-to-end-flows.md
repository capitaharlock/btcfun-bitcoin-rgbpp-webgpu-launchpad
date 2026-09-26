---
id: WA5
title: "End-to-end demo and failure-path checks"
status: backlog
priority: high
owner: rjj
category: web
initiative: web-app
created: 2026-09-23
updated: 2026-09-24
---

The deterministic browser suite over simulated Bitcoin, RGB++ and CKB covers create, ticket, mine, mint, transfer, sale and proof, with the mint rules as an independent oracle (`.meshkore/docs/testing/results.md`). What remains is the recorded real-network run and the cases the simulators do not yet produce.

## Execution

- Phase: 2.
- Prerequisites: `OC8`, `WA6`, `IX4`.

## Done when

- The suite covers reorg-status and invalid-mint-from-the-browser cases.
- Fixture success is distinguished from the recorded real-wallet testnet run (OC8).
- A reviewer can reproduce the demo with pinned scripts and instructions.
