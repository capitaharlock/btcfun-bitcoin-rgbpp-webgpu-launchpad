---
id: MN2
title: "Browser miner with device-aware controls and WASM parity"
status: backlog
priority: high
owner: rjj
category: mining
initiative: mining-engine
created: 2026-09-23
updated: 2026-09-24
---

The miner exists (CPU workers and WebGPU behind one port, every GPU candidate re-hashed on the CPU; MN8, WA3). What remains is behaviour across real devices.

## Execution

- Phase: 2.
- Prerequisites: `MN8`.

## Done when

- Mining pauses or throttles when the page is hidden or the device is on battery, and says so.
- Hashrate, responsiveness and thermal behaviour are recorded on representative phones and laptops for both backends; a WASM CPU path is added only if it measurably beats the JavaScript workers.
- The live reward stays an estimate for the best hash so far; nothing implies a guaranteed return or an unbiased roll.
