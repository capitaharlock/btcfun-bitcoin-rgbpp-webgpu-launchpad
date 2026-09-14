---
id: E2
title: "Specify discrete emission, rounding and terminal accounting"
status: cancelled
priority: critical
owner: rjj
category: validation
initiative: economic-validation
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
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

## Evidence so far

Partial, from the review pass in `SH8`, not enough to close this task.

- Rounding direction is now normative in `PROTOCOL.md` §4.1: the subtraction
  rounds down, so `A(n) = M − ceil(M × p)`. The prototype had implemented the
  opposite while declaring this one.
- An independent reference exists and is not another implementation of the same
  approximation: `emission.test.ts` derives `A(n)` from the exact integer
  criterion `(r−1)^H × 2^n < M^H ≤ r^H × 2^n`, checked over every offset of a
  schedule small enough to compute, plus a pinned vector for the candidate
  schedule.
- Terminal cutoff is computed rather than assumed, and moved under the corrected
  rounding — the remainder holds at one atom instead of underflowing to zero.

Still outstanding: error bounds stated as bounds rather than demonstrated by
vectors; reserve decimals and `mul_div` widths; dust, final redemption and
zero-liability states; expired allowance kept distinct from issued-token burns.

## Resolution

Superseded by the standard tokenomics ([decision](../../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)): the emission is the standard reward, specified in PROTOCOL.md §4 and pinned by `contracts/vectors/reward.json`. Kept as history.
