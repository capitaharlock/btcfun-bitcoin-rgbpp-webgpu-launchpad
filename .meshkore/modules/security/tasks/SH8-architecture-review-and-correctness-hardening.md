---
id: SH8
title: "Architecture review and correctness hardening"
status: done
priority: critical
owner: rjj
category: security
initiative: testnet-spike
created: 2026-09-23
updated: 2026-09-23
---

A full review pass over the prototype before it is shown to anyone: trust
boundaries, the Bitcoin payment path, the ledger's validation surface, the
market's settlement rule, mining lifecycle and the wording of every claim the
code and the UI make.

Nine defects were found and fixed, each with a regression test. The rest of the
pass was about language — several names promised guarantees the code did not
deliver, which is the more dangerous kind of defect because nothing fails.

## Defects fixed

- **Fee estimation ignored output shape.** Coin selection counted outputs
  instead of measuring them, so an OP_RETURN was priced as a 31 vB P2WPKH output
  when an 80-byte memo makes it 92 vB. Every ticket and every offer fill carries
  a memo, so the normal path underpaid by roughly 40%. Size now derives from the
  real scriptPubKeys in weight units, and `buildPayment` measures the finalised
  transaction and refuses to return one that underpays.
- **Launch identity was a reusable symbol.** Two creators committing to
  different terms produced the same id, which is the namespace for the ledger,
  the reserve address and ticket memos — so the second launch would have
  inherited the first one's chain. The id is now derived from the genesis
  commitment.
- **The ledger accepted record kinds it did not implement.** A typed cast stood
  in for a runtime check at the storage boundary, so an unknown `kind` fell
  through to the transfer branch. One exhaustive decoder now owns that boundary,
  and it rejects unsigned extra fields too.
- **The verifier accepted a claim the author refused to write.** A
  zero-allocation claim minted nothing but still raised the declared reserve.
  Author and validator must agree on what a valid chain is.
- **An offer showed settled without the delivery.** Status came from a memo
  prefix on any transfer, so one atom closed a five-token sale with no payment
  recorded. Settlement is now a join across offer, payment and delivering record.
- **A cancelled mining session could start anyway.** `stop()` during the await
  in `start()` was ignored. A generation counter now invalidates a run at every
  await.
- **Emission rounded against its own specification.** The comment declared
  `floor(M × (1 − p))`; the code computed `M − floor(M × p)`. One atom, and no
  property test could catch it because monotonicity and telescoping hold under
  either direction. The test now checks against an exact integer reference that
  avoids fixed point entirely.
- **Corrupt storage read as an empty wallet.** A parse failure returned `[]`, so
  a damaged chain looked new and the next append would have overwritten it.
  Empty, readable and corrupt are now distinct states, and the raw bytes stay
  recoverable.
- **Non-canonical nonces and challenges.** Nonces 0 and 2^64 produced the same
  preimage, so one piece of work had two signed representations.

## Wording corrected

The index called a checked signature `verified`, which reads as "this happened".
It proves authorship and nothing more, so it is now `authentic`, the Worker
returns no verdict of its own, and the feed says it carries announcements rather
than receipts. `replay()` now states what it does **not** check — the ticket
txid, the satoshis paid and the block hash all come from the record itself — and
the Proof Explorer gained a row for the epoch-opening gap.

## Done when

- Every defect found carries a regression test. — done, 122 tests across 8 files.
- No name in the code or the UI promises more than the code delivers. — done.
- Implemented capability is separated from the target architecture in one
  canonical place. — [capabilities.md](../../../docs/capabilities.md).
- Findings that are scope rather than defects stay assigned. — `E1`–`E5` for
  economics, `V3`/`V8`/`V9` for settlement and admission, `SH7` for custody.

## Notes

Two rules came out of this pass and now apply across `apps/web`:

**Validate untrusted input once, at the boundary, with an exhaustive decoder.**
Two of the nine were the same mistake in different files — a TypeScript cast
standing in for a runtime check on JSON from storage.

**Never name a thing more strongly than the code can support.** `verified` for a
checked signature, `settled` for an unmatched memo, "records verified" for a
replay that never saw a payment. Each was one word, and each implied a guarantee
that did not exist.
