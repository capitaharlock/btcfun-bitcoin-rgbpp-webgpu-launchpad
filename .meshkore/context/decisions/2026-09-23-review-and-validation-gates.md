---
title: "Review correction, evidence gates and minimal product scope"
updated: 2026-09-23
status: stable
---

> **Partly superseded by [2026-09-24-standard-tokenomics-and-instant-mint](2026-09-24-standard-tokenomics-and-instant-mint.md).**
> The evidence gates and claim discipline below still apply. The 21M ceiling, epoch
> allocation, reserve and redemption do not: the standard tokenomics replaces them.

# Decision

The September 23 design review demonstrated that the existing epoch allocation
can dilute reserve backing and allow isolated entrants to extract previous users'
funds. It also identified unsupported claims about demand, fairness, operator
trust, perpetual residual issuance and graduation. The operator authorized applying
the review to the roadmap and context.

**Adopted now:**

- Economics and threats first (Phase 0), architecture evidence (1), an independently
  verifiable testnet demo (2), community/product validation (3), production review
  (4), and justified market expansion (5).
- First demo: one launch, one real wallet, one CKB-side reserve asset; mining,
  settlement, redemption, independent verification and operator-free recovery.
- Discrete cumulative emission with integer-atom accounting; exact rounding,
  terminal policy and approximation selected by E2. No mandatory Q64.64 for every
  monetary operation. Retain the 21M ceiling; freeze demo parameters only after
  modeling, with 1008/3024 blocks as baseline candidates.
- Redeemable backing remains segregated from pending deposits, fees, creator escrow,
  liquidity contributions and occupied capacity. No reserve-funded graduation.
- A standalone/browser verifier, negative cases and an operator-shutdown drill are
  first-demo requirements. Published queues alone are not trustlessness proofs.
- Existing Bitcoin/CKB communities are the initial product hypothesis. Serious
  fundraising, full marketplace, additional wallets and native BTC custody are
  deferred. A native BTC reserve is not developed in parallel with the demo.
- Independent review and the real-fund gate remain mandatory; later material
  changes reopen the corresponding economic, architecture and security gates.

**Not adopted by this ADR:** a final anti-dilution mint formula, `clz²`, a ticket
fee split, epoch duration, admission/closure mechanism, canonical Bitcoin clock
implementation, selected SDK/wallet/asset, or any assertion of market demand.
Backing-limited issuance `m ≤ ΔR×S/R` for positive R,S is a candidate to test.
`E5` must adopt a complete executable economic model before core implementation.

**Claims withdrawn:** capital protection or guaranteed ticket-cost recovery;
automatically rising floor; supply as direct demand measurement; farm immunity;
unique addresses as humans; universal seconds-fast Bitcoin finality; graduation as
inherently a leap; perpetual positive issuance with finite amounts.

**Superseded records:** the earlier fixed-point, parallel BTC-reserve, positioning,
emission, pari-mutuel and reserve-floor ADRs. Their useful components survive only
as specified in the current protocol. Original text is retained and labeled as
history. Testnet-first remains in force.

**Consequences:** `E1` is next. The roadmap is a plan with falsifiable gates, not
an assertion that the reviewed design already satisfies them. Technical success
can stand on its own if product pilots do not justify commercialization.
