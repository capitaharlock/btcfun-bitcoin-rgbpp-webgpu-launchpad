---
title: "A 5 % platform fee inside every ticket, paid in the same transaction"
updated: 2026-09-24
status: stable
---

# Decision

A ticket costs 10,000 sats, split inside the ticket's own Bitcoin transaction:

```text
9,500 sats  → the launch's promoter (95 %)
  500 sats  → the platform          (5 %)
```

The mint script arms a miner cell only when both outputs are present. The
platform's output script is compiled into the mint script, not carried in the
launch terms, so no launch can redirect it. A transaction that arms cells of
several launches owes the platform one fee per armed cell, whoever the
promoters are; a promoter whose address is the platform's owes both shares to
that one script.

Testnet3 platform address: `tb1q7hq7fdm88ewl4g6g7l865ltnau9f0ga76e6gye`.

# Why

- **Income goes straight to the promoter.** The platform never holds a
  promoter's money: each ticket pays them directly, in the block it confirms.
- **The fee must be relayable.** 5 % of the previous 5,000-sat ticket is
  250 sats, below the 294-sat dust limit of a P2WPKH output, so Bitcoin nodes
  would not relay it. Doubling the ticket keeps the fee at exactly 5 % and makes
  both shares standard outputs. Charging a fixed 330 sats on a 5,000-sat ticket
  (6.6 %) or taking the fee in tokens on CKB were rejected: the first breaks the
  stated percentage, the second adds CKB capacity cost to every mint.
- **Enforced, not trusted.** An off-chain fee could be skipped by any client
  that builds its own ticket. In the script, a ticket without the fee does not
  arm, so no tokens can be minted from it.

# Consequences

- The mint script was redeployed (code hash `0x43771432…`); launches under the
  earlier script are a different token identity. None were live.
- `TICKET_SATS` 10,000, `PLATFORM_FEE_SATS` 500 and `PROMOTER_SATS` 9,500 are
  part of the standard (`PROTOCOL.md` §4) and of the shared vectors.
- Changing the fee or the platform address is a new script version, visible as a
  new code hash — never a silent change to existing launches.
