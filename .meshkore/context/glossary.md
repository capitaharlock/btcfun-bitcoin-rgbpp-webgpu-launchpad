---
title: Glossary
updated: 2026-09-23
status: draft
---

# Glossary

| Term | Meaning |
|---|---|
| Mining Ticket | Paid, authenticated participation under explicit admission, challenge and refund rules; not a guaranteed return |
| Epoch | A canonically bounded admission/work/settlement window; policy selected before implementation |
| Emission ceiling | Maximum cumulative allowance on the Bitcoin-block schedule; actual minting may be lower |
| Expired allowance | Unissued allocation permanently made unavailable; distinct from burning issued tokens |
| Pari-mutuel | Distribution of the eligible epoch mint by validated weights; does not establish fairness or prevent dilution on its own |
| `clz` | Leading zero bits of a candidate hash; `clz²` is a weighting hypothesis to test |
| Redeemable reserve `R` | Spendable backing in the named reserve asset, excluding fees, pending deposits, creator escrow and occupied capacity |
| Outstanding liabilities `S` | Canonical token quantity entitled to that reserve, with unclaimed allocations and burns explicitly accounted for |
| Redemption ratio | `R / S` for `S > 0`, with integer payout rules; not a guarantee of purchase-price recovery |
| Backing-limited issuance | Candidate cap `mint ≤ ΔR × S / R` for `R,S > 0`; genesis and terminal cases require separate rules |
| RGB++ binding | Mapping of Bitcoin UTXO authorization to CKB state under verified protocol rules |
| Single-use seal | State authorization tied to consuming a particular UTXO once; a hash reference alone is insufficient |
| Leap | Explicit migration of asset control/binding across chains; not a synonym for market activation |
| Transaction folding | RGB++ capability mapping multiple CKB operations to a Bitcoin commitment under specific assumptions |
| Accepted Bitcoin clock | Header/height admitted under the protocol's SPV, freshness and confirmation policy |
| Proof Explorer | Verifier exposing evidence, verification result, canonicality assumptions and residual trust |
| Graduation | Deferred market activation; cannot repurpose reserves owed to holders |
| Dormant | Inactive launch with protocol-defined settlement/exit rights and an explicit emission end policy |
| Unique address | Distinct address, not a distinct human or Sybil-resistant identity |
