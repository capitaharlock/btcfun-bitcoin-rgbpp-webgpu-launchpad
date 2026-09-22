# btc.fun — Protocol Specification

**Status:** standard tokenomics adopted; on-chain implementation in progress on testnet.
**Stack:** Bitcoin, RGB++, Nervos CKB, xUDT, CKB-VM/RISC-V, Rust and TypeScript.

Community tokens mined in the browser, issued on CKB and owned on Bitcoin.

Execution order and acceptance gates: [roadmap](.meshkore/docs/roadmap.md).
Counterexamples and source notes: [review](.meshkore/docs/design-review.md).
Historical decisions: [evolution](.meshkore/context/idea-evolution.md).

## 1. Product and objectives

A launchpad where every token follows the same rules. A person buys a ticket on
Bitcoin, mines against it in the browser, and mints what the result is worth, in
that moment, into a Bitcoin output they control. The creator chooses the token's
identity and receives its ticket income; the protocol chooses everything else.

The project also exists to show that a real product can be built on RGB++ and
CKB with independently checkable issuance, ownership and settlement, using the
current tooling as its authors intended rather than around it.

Loop: `TICKET → MINE → MINT → (TRANSFER | SELL) → VERIFY`.

A ticket does not guarantee a result worth its cost. Proof-of-work here
distributes application tokens; it does not secure Bitcoin consensus.

## 2. Decision status

Adopted (2026-09-24, [standard tokenomics](.meshkore/context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)):
one standard for every launch; fixed ticket price; instant per-ticket mint with
reward `10^8 × clz² / 2^k`; a halving every 1008 Bitcoin blocks counted from the
launch's opening; no creator-chosen supply or economic parameter; ticket income
paid to the promoter; tokens are xUDT on CKB bound to Bitcoin UTXOs by RGB++; the
mint rule is enforced by a CKB script. Testnet before any reviewed real-fund
deployment.

Withdrawn: capital protection; an automatically rising floor; a per-launch hard
cap with epoch budgets and pari-mutuel allocation; a ticket-funded reserve with
redemption; supply as a direct measure of demand; farm immunity; address counts
as unique people; a public queue as sufficient proof of trustless settlement;
graduation automatically being a leap; perpetual nonzero emission with finite
arithmetic.

Open: platform fee on tickets (v1 has none); Bitcoin network of the first public
demo (RGB++ testnet services verify testnet3, see §6.2); wallet support beyond
the app's own.

## 3. Verifiable trust

The Proof Explorer and a standalone verifier must inspect evidence independently
of btc.fun's backend: the Bitcoin ticket and mint transactions, the RGB++
commitment, the SPV-proven height, the mining hash and the minted amount. State
what each proof establishes and its trust roots.

Fetching from a public endpoint is not itself proof of chain canonicality. Distinguish
local consistency, inclusion, confirmations and chain-selection assumptions. Export
portable proof bundles and support user-selected endpoints or local nodes. Invalid,
incomplete and stale evidence must be distinguishable from a valid proof.

Publish a Build Log from ADRs, including superseded decisions and unresolved
hypotheses.

## 4. Standard tokenomics

The same constants apply to every launch. They are protocol constants, compiled
into the mint script; a launch cannot override them.

| Constant | Value | Meaning |
|---|---|---|
| `DECIMALS` | 8 | atoms per whole token = 10^8 |
| `UNIT` | 10^8 atoms | reward per `clz²` before halving (one whole token) |
| `HALVING_BLOCKS` | 1008 | Bitcoin blocks between halvings (about one week) |
| `MIN_CLZ` | 16 | smallest mintable result |
| `TICKET_SATS` | 14,983 | price of one ticket, whatever the round; network fees are separate |
| `PAYMASTER_BUDGET_SATS` | 7,000 | taken first, only when the round creates its miner cell, for the RGB++ paymaster |
| `PLATFORM_PERCENT` | 11 | the platform's percentage of what remains, rounded down, paid to the platform script fixed in the mint script |
| promoter share | the rest | 7,105 in a round that creates its cell, 13,335 in one that re-arms |
| `ANCHOR_GRACE_BLOCKS` | 144 | how far behind its confirming block a ticket's anchor may be |

### 4.1 Reward

```text
challenge = sha256(ticket_txid ‖ ticket_vout)
clz       = leading zero bits of sha256d(challenge ‖ nonce)
k         = floor((anchor − h0) / HALVING_BLOCKS)
reward    = floor(UNIT × clz² / 2^k)      atoms, if clz ≥ MIN_CLZ
```

The ticket outpoint is output 1 of the ticket transaction (§4.2): the armed
miner cell's own UTXO when a ticket re-arms it, and the ticket the cell names
when it was armed from `paid`. It is encoded as the txid in
internal byte order followed by the output index as little-endian `u32`. Hashing
it to 32 bytes keeps the preimage at 40 bytes, one SHA-256 block, which is what
the GPU kernel grinds. `nonce` is 8 bytes, little-endian. `h0` is fixed when
the launch is created.

`anchor` is the ticket's height: arming fixes the rate its mint is paid at.
The wallet declares the tip it saw when it signed the ticket (a paid cell keeps
it for its arming, unless it is too old to confirm in time; then the tip at the
arming), and the mint script
accepts that declaration only if it is no earlier than `h0`, no later than the
block that confirms the arming — proven to the RGB++ lock by the Bitcoin SPV
client — and at most `ANCHOR_GRACE_BLOCKS` before it.

Pricing at the ticket rather than at the mint is a safety property, not a
convenience. Once a Bitcoin transaction spends sealed UTXOs, the CKB
transaction it commits to is the only way those cells move again. If a mint's
validity depended on the height it confirms at, a mint that confirmed after a
halving would be invalid forever and the balance it carried would be stranded.
With the rate fixed by the ticket, every condition a mint is checked against is
known before it is signed.

All arithmetic is exact integer arithmetic. `UNIT × clz²` is at most
`10^8 × 256² < 2^43`, so it fits a `u64`, and the division is a right shift. The
client computes the same function to show the reward live; the TypeScript and
Rust implementations pass the same vectors.

Worked values: a 24-bit hash in the first week mints 576 tokens; the same hash
in the fourth week mints 72. A 40-bit hash is 2^16 times more work than a 24-bit
hash and mints 2.8 times as much, so the reward grows with effort but hardware
advantage stays logarithmic.

### 4.2 Tickets and the challenge

A miner holds at most one **miner cell** per launch: a CKB cell whose lock is an
RGB++ lock bound to one of the miner's Bitcoin UTXOs and whose type is the
launch's mint script. It is `paid`, `armed` or `idle`. A round has one payment,
the ticket (decision `2026-09-25-one-payment-per-round`).

- **Ticket, re-arming.** With an idle cell, a Bitcoin transaction spends the
  cell's UTXO and pays the re-arm split: 13,335 sats to the promoter and 1,648
  to the platform. Its RGB++ commitment moves the cell to output 1 of the same
  transaction, armed at the declared anchor.
- **Ticket, creating.** Without a cell, a Bitcoin transaction pays the new-cell
  split — 7,105 to the promoter, 878 to the platform, 7,000 to the RGB++
  paymaster, whose capacity the queue adds — and creates the cell at output 1 in
  state `paid`. It spends no sealed UTXO, so nothing on CKB verifies it: the
  script lets anyone create a paid cell, but never beside an RGB++ input, and
  checks the payment when the cell is armed.
- **Arm.** A second Bitcoin transaction, paying only the network, spends the
  paid cell's output 1 and arms the cell at the declared anchor, naming the
  ticket's txid in the cell's data (45 bytes instead of 13); the script requires
  that name to equal the paid cell's seal, and forbids it anywhere else. The creating
  transaction rides in the *btc.fun witness* — the first witness past the
  inputs, which the RGB++ queue leaves as written — without its witness data; the
  script accepts it only if it hashes to the txid the cell is sealed to and pays
  the new-cell split for every cell the arming arms. A paid cell cannot move and
  is armed only beside other paid cells, so one payment arms one cell.
- **The challenge** is the ticket's output 1: it does not exist before the
  ticket is paid, so work cannot be precomputed, and one ticket arms one cell
  that mints once, so work cannot be reused. Mining may start as soon as the
  ticket is broadcast — also in a round that creates its cell, whose arming
  happens while the miner mines. Only the mint waits for the armed cell.
- **Mint.** A Bitcoin transaction, paying only the network, spends the armed
  cell's UTXO and increases the miner's xUDT balance by exactly `reward`. With a
  token cell already held, the miner cell returns to idle carrying the nonce and
  the balance grows in that cell. Without one, the miner cell's capacity becomes
  the token cell and the nonce travels in the btc.fun witness: the paymaster's
  one cell cannot hold both, so the next round's ticket creates a new cell.
  Rounds one and two pay the paymaster; from the third, none. The next ticket
  is its own transaction: a mint that re-armed would bring the anchor check —
  the one condition that depends on confirmation time — into a transaction that
  carries the balance.
- **Close.** Consuming a miner cell without recreating it returns its capacity.

Before the ticket is signed the wallet must hold the ticket, its network fee
and the network fees still to come in the round (arming and mint): a ticket
without the fees to mint it would be lost. Mining transactions pay
`max(3 sat/vB, mempool.space "fastest")`, sized by the rule that signs them.

A ticket has no expiry: its rate is fixed when it is bought, so a person may
mine against it for a minute or for ten days. The interface shows the blocks
left before the next halving when a ticket is bought, since that is the moment
the rate is set.

### 4.3 Supply

There is no maximum supply. Mints are independent and can run in parallel,
which a shared cap would forbid. Supply is bounded by the halving instead:

- The reward reaches exactly zero once `2^k > UNIT × clz²`. For every possible
  hash that is `k = 43`, about 43 weeks after `h0`; for realistic browser hashes
  (clz ≤ 40) it is `k = 38`. A ticket anchored after that mints nothing.
- The ticket price is fixed while the reward halves weekly, so the cost of
  producing one token doubles every week. Mining continues only while people
  value the result above that cost.
- Total supply is the sum of every mint. It is published live, per launch, from
  the chain, together with the tickets sold and the current halving.

A small launch sells few tickets and issues little; a popular one sells more and
issues more. Because the rules are identical, those numbers are comparable
between launches.

### 4.4 Revenue

Each ticket pays the promoter's share to the promoter's Bitcoin address and the
platform's to the platform, both inside the ticket transaction, and the mint
script checks both outputs when the cell is armed. The platform script is
compiled into the mint script, so no launch can redirect the fee; an arming of
several cells owes one share per cell (decision
`2026-09-25-one-payment-per-round`, which supersedes
`2026-09-24-platform-fee-per-ticket`). The standard issues
no reserve, promises no floor and offers no redemption: a token is worth what
someone will pay for it. The interface states this wherever a ticket is bought.

### 4.5 Registration and admission

A launch is registered once, for `REGISTRATION_SATS` = 20,000 sats paid on
Bitcoin to the platform, in a transaction whose `OP_RETURN` carries
`sha256("btc.fun/launch-registration/v1" ‖ terms args)`. btc.fun's signer checks
the payment and signs `sha256("btc.fun/launch-certificate/v1" ‖ terms args ‖
registration txid)` with the platform's certificate key (BIP340,
deterministic). The announcement carries the registration txid and the
certificate; the app lists only launches whose certificate verifies. The mint
script requires the certificate at the arming of a paid cell and refuses to
create an idle cell, so every mint descends from a certified arming (decision
`2026-09-25-paid-registration-and-certificate`). The platform admits its own
launches without a fee: registration txid all zeros.

## 5. Tokens after minting

A minted balance is an ordinary RGB++ xUDT: transferable by a Bitcoin
transaction that spends its UTXO, visible to any wallet that reads RGB++ assets,
and identified by its xUDT type hash, which is derived from the launch's mint
script. Anyone can issue another xUDT; nobody can issue this one outside the
mint rule, because the owner mode that permits minting requires the mint script.

### 5.1 Peer-to-peer sales without a counterparty online

Finding from the `testnet-spike` offer-book experiment, recorded so it is not
rediscovered: a signed offer plus a separate payment is not a swap. The taker
pays on Bitcoin and the maker authorises the token movement separately, so a
maker who takes the payment and never authorises keeps both.

The standard sale closes this with the single-use seal RGB++ already provides.
The seller isolates the amount for sale in its own UTXO and signs, with
`SIGHASH_SINGLE | ANYONECANPAY`, only two things: that UTXO as an input and the
price paid to the seller as the matching output. The buyer later completes the
transaction alone — their funding inputs, their token output and the RGB++
commitment — and broadcasts it. Payment and delivery are one Bitcoin
transaction, so neither leg can happen without the other. Cancelling means
spending the listed UTXO. A listing sells in full; partial sales are several
listings.

### 5.2 Bids

The market is an order book between users: no pool, no automated market
maker, no market maker, no custody. Every price in it is one a person signed.

A resting bid that executes by itself is not possible without a custodian: the
sale's commitment names the seller's cell, so only someone who knows that cell
can finish it. A bid is therefore a signed intention, not escrow. The bidder
publishes the token, the amount in atoms, the total price in sats and their own
address, signed by the same identity whose address it names; nothing is locked.
A holder meets it by signing an ordinary §5.1 listing for exactly those terms,
labelled with the bid's id, and the bidder completes that listing as any buyer
would. Until then either side can walk away, and anyone else may buy the
listing, because the label is not part of what the seller signed. The bidder
withdraws a bid with a signed `cancel` event that names it; only the author's
withdrawal counts.

The index stores bids and withdrawals as it stores every event — signature
checked, nothing decided. A sale is counted as a trade only when its Bitcoin
transaction spends the listed output first and pays the seller the listed
price; a bid is filled only when that sale delivered to the bidder's address.
See decision `2026-09-24-peer-to-peer-order-book`.

## 6. Transaction architecture and trust boundaries

### 6.1 Bitcoin clock and finality

The halving clock is a ticket's anchor, bounded by the ticket's confirming
height as proven by the Bitcoin SPV client that RGB++ already depends on (§4.1).
CKB header references are not Bitcoin proofs, and no operator-supplied height is
accepted.

Specify confirmation thresholds, what the interface shows while a mint waits for
them, and what happens when CKB has accepted a transition referring to a Bitcoin
branch that is later reorganised. Document residual finality assumptions;
indexer rollback alone cannot undo accepted protocol state.

### 6.2 RGB++ binding

RGB++ binds each CKB cell to a Bitcoin UTXO: the Bitcoin transaction that spends
the UTXO commits, in an `OP_RETURN`, to the CKB transaction that consumes the
cell, and the RGB++ lock accepts the CKB transaction only with an SPV proof of
that Bitcoin transaction. The mint script relies on that check rather than
repeating it, and reads the same proof for the ticket payment and its confirming height.

Tooling: the current RGB++ SDK (`rgbpp`, built on CCC) with CCC for CKB. The
public RGB++ testnet services verify Bitcoin testnet3; the Signet service was
unreachable when checked on 2026-09-24, and testnet4 has no SPV client on CKB.
The whole app runs on testnet3, so payments, tickets and tokens share one chain. Label provisional, CKB-confirmed and Bitcoin-anchored states honestly.

### 6.3 The mint script

A Rust `no_std` type script on CKB-VM, one code hash for every launch. Its args
carry the launch terms: format version, `h0`, the promoter's Bitcoin
`scriptPubKey` and the hash of the launch metadata. It validates, per
transaction:

- create: one paid miner cell, only in a transaction with no RGB++ input, no
  xUDT balance change; an idle cell is never created, only left by a mint;
- re-arm: idle in, armed out, the Bitcoin transaction pays the promoter the
  re-arm share for every miner cell of theirs it arms and the platform its share
  for every miner cell it arms, the armed cell's anchor is valid, no xUDT
  balance change;
- arm: paid in (sealed to output 1 of its creating ticket), armed out, only
  paid cells beside it; the btc.fun witness starts with the launch's admission
  (registration txid ‖ btc.fun's certificate over the args and that txid),
  which must verify against the compiled platform key; the creating ticket
  after it hashes to the seal's txid and pays the new-cell shares for every cell armed; the anchor is
  valid; no xUDT balance change; a paid cell may otherwise only close;
- mint: armed in, and either idle out carrying the nonce or no miner cell out
  with the nonce in the btc.fun witness; the xUDT balance under this launch
  increases by exactly `reward` at the consumed ticket's anchor; a mint that
  re-arms is refused;
- close: miner cell consumed, xUDT balance does not increase.

The launch's xUDT uses owner mode by input type (`flags & 0x80000000`) with the
mint script's hash as owner, so minting is possible only in a transaction the
mint script has approved.

### 6.4 State and indexer

Launches, mints, transfers and listings are derived from transactions; the API
is a rebuildable projection. The index may hold listings, which are public signed
data and give it no control over funds. Expose provisional status until the
chosen confirmation policy permits final display.

## 7. xUDT identity and metadata

Decimals are 8 for every launch. Name, symbol and description are recorded with
the launch and hashed into the mint script's args, so the token's identity
commits to them. The image is stored by content hash; where the bytes live
(on-chain cell, the app's storage or a content-addressed network) is decided by
`TC2`. Wallets that do not read the metadata still show the balance under the
type hash.

## 8. Liquidity and business boundary

Evaluate existing RGB++/CKB venues (`LQ1`) for actual asset support, custody,
permissions and exits before building anything of our own. Adapters build
unsigned actions for user review; they never hold funds.

Promoter revenue is ticket income. Measure operating costs, including CKB
capacity for miner cells, and who pays them. Community pilots test engagement
and comprehension separately from correctness; testnet behaviour does not
establish willingness to pay.

## 9. Implementation baseline

Rust `no_std` + `ckb-std` for scripts, tested with `ckb-testtool` and measured
in cycles. TypeScript client with CCC and the RGB++ SDK. Exact integer amounts
everywhere; the Rust and TypeScript reward functions pass the same vectors.

```text
contracts/      the mint script and its tests
apps/web        the client, including the browser miner
```

React/Vite/TypeScript for the client, one Cloudflare Worker with D1 for the
public index (`.meshkore/docs/hosting.md`).

## 10. Acceptance properties

- A mint approved only for a valid proof of work against an armed, paid ticket.
- `reward` identical in script and client; no overflow; zero from the terminal halving.
- Each ticket mints at most once; a mint without a ticket fails.
- The promoter receives every ticket payment the script accepts.
- A sale delivers tokens and payment in one transaction or not at all.
- Costs, capacity and latency measured on testnet and published.

## 11. First successful demonstration

A reviewer opens a launch, buys a ticket, mines, mints and sees the balance in
the app and in an RGB++-aware explorer; transfers part to a second wallet;
lists part for sale; and a third person buys it without the seller online.

Then the reviewer attempts a mint with an insufficient hash, a reused ticket, an
inflated amount and an unpaid ticket. Each must fail on-chain. Publish
transaction IDs, script hashes, cycles, bytes and capacity, and known limitations.

## 12. Deferred scope

Automatic graduation, multiple chains, Fiber/Lightning, jackpots, fundraising or
vesting, a custom AMM, governance, and any creator-configurable economics.

## 13. Open decisions and owners

| Decision | Task |
|---|---|
| Mint script, owner mode and cycle budget | OC2 |
| RGB++ tooling, network and wallet visibility | OC1, V3 |
| Capacity for miner cells: who pays | OC3 |
| Confirmation policy and reorg treatment | V8 |
| Metadata and image storage | TC2 |
| Sale construction with `SIGHASH_SINGLE \| ANYONECANPAY` | OC5 |
| Platform fee on tickets | PV3 |
| Venue compatibility | LQ1 |
