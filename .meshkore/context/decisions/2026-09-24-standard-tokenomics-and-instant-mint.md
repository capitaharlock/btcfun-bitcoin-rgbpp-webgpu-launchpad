---
title: "One standard tokenomics for every launch, with an instant per-ticket mint"
updated: 2026-09-24
status: stable
---

# Decision

Every btc.fun token follows the same economic rules. A creator chooses the
token's identity (name, symbol, image, description) and the Bitcoin address its
ticket income is paid to. A creator chooses nothing economic: not the supply,
not the reward, not the ticket price, not the halving period.

A mint is a single miner's result, settled when it happens. There is no epoch,
no shared budget and no wait for other participants.

```text
TICKET    pay the fixed ticket price → a Bitcoin UTXO that is the mining challenge
MINE      search locally for a nonce; the reward for the best hash is shown live
MINT      spend the ticket UTXO; the tokens exist in that transaction's output
REPEAT    the mint transaction may buy the next ticket in the same transaction
```

Reward for one ticket, in atoms (8 decimals):

```text
reward = floor(10^8 × clz² / 2^k)      if clz ≥ 16, else not mintable
k      = floor((h_mint − h0) / 1008)   halvings since the launch opened
```

`clz` is the number of leading zero bits of `sha256d(challenge ‖ nonce)`, where
the challenge is the hash of the ticket's outpoint,
`h_mint` is the Bitcoin height that confirms the mint transaction and `h0` is
the launch's opening height. The canonical constants live in `PROTOCOL.md` §4.

# Why

- **Immediacy.** A miner sees what the current hash is worth while mining and
  receives exactly that. Mining stops being a lottery resolved later by other
  people's turnout, and the loop — pay, mine, receive, repeat — is a game a
  person can decide to play for one minute or ten days.
- **Comparable tokens.** Identical rules make every launch's supply the product
  of one thing: how many tickets people bought, and when. A small project
  issues little and earns little; a popular one issues more and earns more.
  Nobody can make a token look scarce by choosing a small number.
- **Bounded without a cap.** Supply has no hard maximum, which is what allows
  mints to happen independently and in parallel. It is bounded by the halving
  instead: the reward is an integer that reaches exactly zero after at most 43
  halvings (about ten months), and far earlier in value, because the ticket
  costs the same while what it yields halves every week.
- **The ticket anchors the work.** The challenge is the ticket's own output,
  which does not exist until the ticket is paid. Work cannot be precomputed or
  reused, and the promoter is paid before anyone mines.

# Consequences

- Supersedes the per-launch 21,000,000 ceiling, the epoch budget, the
  pari-mutuel allocation and the ticket-funded reserve with redemption. The
  standard issues no reserve and promises no floor: ticket income is revenue
  for the promoter, and the interface says so.
- The per-miner rate that the pari-mutuel record rejected is adopted. That
  rejection assumed a hard cap; this decision gives up the cap on purpose and
  replaces it with a supply that is finite in practice.
- Emission is not perpetual. The terminal halving is computed and published,
  consistent with the withdrawal of perpetual nonzero emission in §2.
- The rule is enforced on CKB by the mint type script, not by the client. The
  client's copy exists only to show the reward live, and both are tested
  against the same vectors.
- A platform fee on tickets is an open decision. Version 1 pays the whole
  ticket to the promoter.
