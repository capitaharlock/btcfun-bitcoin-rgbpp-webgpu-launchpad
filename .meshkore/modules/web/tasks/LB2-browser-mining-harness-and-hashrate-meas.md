---
id: LB2
title: "Browser mining harness and hashrate measurement"
status: done
priority: high
owner: rjj
category: web
initiative: interface-prototype
created: 2026-09-23
updated: 2026-09-23
---
Multi-worker SHA-256d grinder against a canonical challenge digest, reporting measured hashrate, attempts and best `clz`. Feeds `V7`'s browser feasibility numbers. WebGPU is detected and reported honestly rather than claimed: the compute path remains V7 scope.

## Done when

- SHA-256d matches known vectors for the empty string and "abc".
- Measured hashrate is reported from real runs, not estimated.
- WebGPU availability is stated without implying an implemented GPU path.
