---
id: E1
title: "Reproduce reserve dilution and define economic requirements"
status: next
priority: critical
owner: rjj
category: validation
initiative: economic-validation
created: 2026-09-23
updated: 2026-09-23
---

Build a minimal executable reference model before creating the full monorepo. Reproduce the old model’s failures and define which properties the replacement must satisfy. Use PROTOCOL.md §4 and docs/design-review.md as inputs.

## Execution

- Phase: 0.
- Prerequisites: `V0`.

## Done when

- Reproduce R=850, S=1000, ΔR=8.5, mint=500: ratio falls from 0.85 to about 0.572333 and the entrant can redeem about 286.1667 before fees.
- Show that one ticket and many tickets can exhaust the same epoch budget under the old rule; supply is not a demand counter.
- Separate reserve-asset backing, individual ticket return and BTC/fiat value; publish counterexamples for the withdrawn guarantees.
- Reference model and deterministic scenarios are runnable without a UI or chain.
