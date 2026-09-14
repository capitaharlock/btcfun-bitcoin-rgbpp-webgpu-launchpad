---
id: PC4
title: "Checked integer arithmetic and selected decay approximation"
status: cancelled
priority: critical
owner: rjj
category: protocol
initiative: emission-core
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
---

Extract the proven arithmetic into a Rust crate and TypeScript port using the E2/V5 specification. Q64.64 is an option only if justified, not a universal monetary representation.

## Execution

- Phase: 2.
- Prerequisites: `V5`.

## Done when

- Cross-language vectors, independent-reference checks and boundary properties run in CI.
- Checked wide intermediates, rounding directions and numeric ranges are documented for every primitive.
- Quotes report denomination, rounding and minimum output rather than silently using floating point.

## Resolution

Superseded by the standard tokenomics ([decision](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)): the reward is an exact integer shift, `10^8 × clz² >> k`, so no decay approximation is needed. Kept as history.
