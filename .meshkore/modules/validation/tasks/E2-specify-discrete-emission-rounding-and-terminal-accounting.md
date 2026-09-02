---
id: E2
title: "Specify discrete emission, rounding and terminal accounting"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: economic-validation
created: 2026-09-23
updated: 2026-09-23
---

Define cumulative integer-atom issuance and epoch differences, including the executable decay approximation and terminal cutoff. Keep expired allowance distinct from issued-token burns.

## Execution

- Phase: 0.
- Prerequisites: `E1`.

## Done when

- Compare the old continuous-density sum with the intended 21M cap; specify the corrected schedule.
- Budgets telescope, are nonnegative, remain bounded and cannot be reclaimed after expiry, including skipped epochs.
- Specify token/reserve decimals, mul_div rounding, intermediate widths, dust, final redemption and zero-liability states.
- Publish a high-precision independent reference plus boundary vectors; fixed-point format is justified by error/cycle needs.
