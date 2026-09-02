---
id: MN2
title: "Browser miner with device-aware controls and WASM parity"
status: backlog
priority: high
owner: rjj
category: mining
initiative: mining-engine
created: 2026-09-23
updated: 2026-09-23
---

Build the miner for the adopted ticket/challenge lifecycle, reusing canonical encodings. Surface live work without implying guaranteed return.

## Execution

- Phase: 2.
- Prerequisites: `V7`, `PC5`, `MN1`.

## Done when

- WebGPU and WASM produce equivalent verifiable candidates; UI remains responsive.
- Explicit start/stop, visibility/resource handling and fallback are tested on representative devices.
- Display estimated costs, deadline, best work and hardware-dependent uncertainty; do not label the roll unbiased.
