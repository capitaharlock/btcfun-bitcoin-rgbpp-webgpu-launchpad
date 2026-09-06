---
id: MN8
title: "WebGPU kernel and the mining backend port"
status: done
priority: high
owner: rjj
category: mining
initiative: testnet-spike
created: 2026-09-23
updated: 2026-09-23
---
Put mining behind a port with CPU-worker and WebGPU adapters, and implement the WGSL kernel. The preimage is fixed at 40 bytes (`challenge32 || nonce_le64`, PROTOCOL.md §4.2), so each invocation is two SHA-256 compressions with no length branching. Results return through a lock-free hit buffer whose threshold rises with the best candidate, rather than a mutex over a shared best. Batch size auto-tunes toward a 45 ms dispatch. Feeds `V7`'s browser feasibility numbers and `MN2`.

## Done when

- Measured hashrate is reported from real runs on both backends, not estimated.
- Every candidate is re-hashed by the CPU implementation before it is accepted;
  a driver-compiled kernel is not trusted on its own word.
- `stop()` releases the device without a pending readback being rejected.
- A browser harness gates the whole thing on a real Chromium.
