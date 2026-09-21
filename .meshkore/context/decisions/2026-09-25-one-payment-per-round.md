---
title: "One payment per round: a fixed 14,983-sat ticket, a paid cell armed by the next signature, a mint that pays only the network"
updated: 2026-09-25
status: stable
---

# Decision

Supersedes the ticket price and split of
`2026-09-24-standard-tokenomics-and-instant-mint` and
`2026-09-24-platform-fee-per-ticket`; the reward, the halving and the
instant per-ticket mint of the first stand unchanged.

A round of mining has one payment, the ticket, at one price:

```text
TICKET_SATS            14,983   always; network fees are not part of it
PAYMASTER_BUDGET_SATS   7,000   taken first, only when the round creates its miner cell
PLATFORM_PERCENT           11   of what remains, rounded down; the promoter gets the rest

new cell   7,000 paymaster + 878 platform + 7,105 promoter
re-arm             1,648 platform + 13,335 promoter
```

A paymaster asking more than its budget is paid the difference on its own
line, on top of the ticket. The split never moves.

The transactions of a round:

```text
TICKET   with an idle miner cell: re-arms it (anchor = tip) and pays the re-arm split
         without one: creates the cell, state `paid`, from the paymaster's capacity,
         and pays the new-cell split and the paymaster
ARM      only after a creating ticket: spends the paid cell, arms it; network fee only.
         The creating ticket rides whole in the btc.fun witness
MINE     local search; starts as soon as the armed cell's transaction exists
MINT     network fee only. Without a token cell the miner cell dissolves into it
         (nonce in the btc.fun witness); with one, the cell returns idle carrying the nonce
```

Rounds one and two therefore pay the paymaster; from the third, the ticket
re-arms the idle cell and no paymaster is paid.

Before signing the ticket, the wallet must hold the ticket, its network fee
and the network fees still to come in the round (the arming, when there is
one, and the mint). Fees are paid at `max(3 sat/vB, mempool.space "fastest")`
and sized by the rule that signs (`lib/rgbpp/bitcoin.ts` `fundingNeeded`).
Nothing signs by itself: every transaction waits for its own press, for every
wallet.

# Why

- **The promoter was paid too little.** The previous round took three
  signatures and three payments — opening (7,000 to the paymaster), ticket
  (10,000) and a first mint (7,000 to the paymaster again) — so the promoter
  received 39 % of what a first-time miner paid. One price with the paymaster
  budget inside it gives the promoter 7,105 of a first round and 13,335 of every
  round from the third.
- **A ticket that creates its cell cannot be checked when it lands.** It spends
  no sealed output, so no RGB++ lock verifies its Bitcoin transaction on CKB:
  a cell created armed could be forged for free with a CKB transaction built by
  hand. So it is created `paid`, and the script checks the payment when the
  cell is armed. The arming spends the paid cell's output 1, which the RGB++
  lock verifies, and carries the creating transaction, which is authentic
  because it hashes to the txid the cell is sealed to. The cost is one more
  signature, network fee only, in rounds that create a cell.
- **A first mint cannot keep the miner cell.** The paymaster's 316 CKB cannot
  hold both a miner cell (193 CKB) and a token cell (~158 CKB). Dissolving the
  miner cell into the token cell makes the first mint free of the paymaster,
  and the second round pays for a new cell out of its ticket instead.

# Consequences

- The mint script (`contracts/mint`) is a new version with a new code hash,
  deployed on CKB testnet 2026-09-25. Launches announced against the previous
  script name a different token and are obsolete; the official launches are
  announced again.
- Guards that keep one payment to one cell: a paid cell cannot move, is never
  created beside an RGB++ input, is armed only from its ticket's output 1 and
  only beside other paid cells, and the creating payment is counted across every
  cell the arming arms. `contracts/tests` covers each.
- The btc.fun witness — the first witness past the inputs — relies on the RGB++
  queue replacing only the placeholder witnesses of sealed inputs. The rest of
  the RGB++ pipeline does not depend on it, and a queue that dropped it would
  only fail an arming or a first mint (a ticket's value, never a balance). The
  live testnet run is what confirms it; until then it is labelled unverified.
- Nothing a mint checks depends on confirmation time; the arming, like the old
  ticket, is the only height-dependent step, and it carries no balance.

# Amendment (2026-09-25): mining starts at the ticket

In a round that creates its cell, the challenge was the arming's output, so
mining waited for the ticket to confirm and land on CKB before the arming could
even be signed. The armed cell now names its ticket — 32 bytes of txid after the
13 — and the challenge is that ticket's output 1 in every round. The script lets
only the arming of a paid cell write the name, equal to the paid cell's seal, so
the challenge still did not exist before the payment and still mints once. The
miner mines from the moment the ticket is broadcast; the arming is signed during
mining; only the mint waits for the armed cell. The paid cell carries the
ticket's anchor, and its capacity is sized for the named form (225 CKB, inside
the paymaster's cell). Mint script redeployed on CKB testnet
(`contracts/deployments/testnet.json`); launches announced before it are
obsolete.
