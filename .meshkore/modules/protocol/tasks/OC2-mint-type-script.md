---
id: OC2
title: "The mint script"
status: done
priority: critical
owner: rjj
category: protocol
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
---

Rust `no_std` type script implementing `PROTOCOL.md` §4 and §6.3: open, ticket,
mint and close transitions of the miner cell, with the xUDT balance change
checked against the standard reward.

## Done when

- Unit tests pass the shared reward vectors (`contracts/vectors/reward.json`).
- `ckb-testtool` tests cover each transition and each rejection: weak hash,
  reused ticket, inflated amount, unpaid ticket, wrong promoter, mint before `h0`.
- Cycle cost per transition is measured and recorded.

## Result

`contracts/mint` (Rust, `ckb-std`), with the rules that need no chain API in
`contracts/mint-core`. 24 CKB-VM tests run it against the deployed xUDT and a
build of the RGB++ lock whose only change is a mocked SPV lookup.

| Transition | Cycles, whole transaction |
|---|---:|
| Open | 42,483 |
| Ticket | 273,458 |
| Mint | 312,518 |

A reused ticket is refused by Bitcoin itself — the sealed UTXO can be spent
once — and work against one ticket does not count for another, which a test
covers. The nonce lives in the miner cell the mint creates, not in a witness:
the RGB++ queue service rewrites the witnesses of RGB++ inputs, and output data
is covered by the Bitcoin commitment.

A mint is priced at its ticket's anchor and reads no witness or height, so once
signed it cannot become invalid; the one height-dependent check (the anchor
being within a day of the ticket's confirmation) runs when a ticket is bought,
where a delay can cost only the empty miner cell. A mint that re-arms is
refused for the same reason.
