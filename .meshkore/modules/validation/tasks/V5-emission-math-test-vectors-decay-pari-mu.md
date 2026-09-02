---
id: V5
title: "Deterministic integer math and cross-language vectors"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-23
---

Implement the adopted reference arithmetic in Rust and TypeScript. Use exact integer monetary amounts and only the fixed-point approximation justified by E2.

## Execution

- Phase: 1.
- Prerequisites: `V1`, `E2`, `E5`.

## Done when

- Shared vectors cover decay boundaries, allocation, expiry, cap checks, redemption, zero/terminal states and overflow.
- Both implementations match an independent high-precision reference within the specified approximation bound.
- Rust/TypeScript outputs agree bit-for-bit; a shared mistake is tested against reference properties, not just parity.
