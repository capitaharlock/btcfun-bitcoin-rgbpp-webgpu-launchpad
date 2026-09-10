# Test results

Every user journey of btc.fun, exercised in a real Chromium browser — the path
that works and every path that must be refused — first against a simulated
Bitcoin chain whose clock the tests control, then on testnet4 with real
satoshis. This document is the account of that campaign: what was tested, what
it found, what changed, and the latest numbers.

| Layer | Tests | Result |
|---|---:|---|
| Unit — rules, encodings, signatures, payments | 135 | all passing |
| Browser — simulated chain (`ui`) | 87 | all passing |
| Browser — phone layout (`mobile`) | 9 | all passing |
| Browser — live testnet4 (`live`) | 10 | all passing, real satoshis — [live run](#live-testnet4-two-browsers-real-satoshis) |

```bash
cd apps/web
npm test                     # unit
npm run test:browser         # browser, simulated chain + phone layout
npm run test:browser:headed  # the same, on screen
npm run test:browser:live    # real testnet4 money, on screen (needs the funded wallet)
npm run test:report          # refresh the generated section below
```

## How the browser suite works

**A simulated chain.** The app's clock is the Bitcoin block height: epochs,
issuance and whether a launch is open all derive from the tip. The suite
replaces the provider with a simulator it steers, so a test can live through a
day (144 blocks), a week (1,008), the twenty-first day and the end of issuance
in seconds. Every transaction the page signs is captured and parsed — its
inputs spent, its outputs credited back to the right wallet — so tests check
what *would* have been broadcast without spending anything. Any request the
simulator does not recognise fails the test, so nothing reaches the network by
accident.

**Real browsers, real journeys.** Tests drive what a person sees: labels,
buttons, the text on the screen. Two-person journeys run in two separate
browser contexts with separate storage, exactly like two people on two
machines. An uncaught page error fails a test even when every assertion passed.

**Expected values from first principles.** Time tests compute the schedule from
`1 − 2^(−n/H)`, not from the app's own code, so a regression in the schedule
cannot agree with itself.

## What was covered

| Area | Works as intended | Refused as it must be |
|---|---|---|
| Navigation | all nine routes render; four sections in order; chain tip shown; unknown launch and route handled; provider outage survived | — |
| Wallet | demo key; funds appear; restore is deterministic; secret round-trips; disconnect forgets | short secret; non-hex secret (in plain words) |
| Create a token | the whole wizard signs and lands in the grid; opens for mining when the chain reaches it; draft survives a detour to the wallet page; halvings stated | one-character, digit-first, punctuated and reserved symbols; long symbols; short name and description; opening now or in the past; sub-dust ticket; committing without a wallet |
| Time | day 0, 1, 7, 14, 21, 42; allowance halves each week; countdown tracks the chain; a new block reaches an open page; issuance ends at the terminal block | — |
| Mining | ticket pays the burn address with its commitment and a fair fee; GPU and CPU mine and claim; the proof explorer replays it | no wallet; empty wallet; one sat short; a second claim on one ticket; a ticket carried into the next epoch |
| Holdings | position shown; transfer; a newcomer receives a chain | malformed, short, zero, negative, over-precise and over-balance transfers; sending to yourself; a forged chain; non-JSON; corrupt storage; reset without confirmation |
| Market | a complete sale between two browsers | non-JSON offer; tampered price; wrong launch; seller paying themselves; overselling; zero price; unaffordable payment (nothing broadcast); expired offer |
| Activity | local-only feed shows your own actions; figures called announcements | a tampered event is shown as failing its signature |
| Phone | no horizontal scroll on any page; sections reachable | — |

## What the campaign changed in the product

Each of these started as a test describing how the product should behave, and
ended as a feature that makes it so.

- **Market settlement between two people.** A buyer's payment now names both
  the offer and the buyer in its `OP_RETURN`, and the seller's page finds it on
  chain by itself and offers to deliver. Who is owed the tokens comes from the
  chain, so nobody watching it can claim someone else's payment. Each side is
  told its next step as it happens.
- **Receiving tokens.** Holdings has a Receive panel that works before the first
  token, and accepts only a chain that extends what is already held — someone
  else's history can never overwrite yours.
- **Epoch block lookup that keeps asking.** A launch that has just opened waits
  for its block to be served instead of giving up for the epoch. Found on
  testnet4, where the provider announced a block before it could serve it.
- **A wizard that remembers.** The draft and step persist while the visitor goes
  to get a wallet, and are cleared once the launch is committed.
- **Chain resets that ask first,** naming how many records would be deleted.
- **Accessible forms and navigation.** Labels are associated with their fields;
  the four sections are links that open in a new tab.
- **A layout that fits a phone,** on every page.
- **Readable errors,** where an internal function name used to be — and a
  failed payment reports where the person clicked, not inside a folded row.
- **A lapsed ticket is named,** instead of vanishing from the page when its
  epoch closes unused.
- **"Reading the chain…"** while the first tip is on its way, with the figures
  dimmed, instead of placeholder epochs shown as fact.
- **Sellers see their address being watched** for payments, and can check at
  once.

## Live testnet4: two browsers, real satoshis

Alice is the funded wallet, restored through the wallet page. Bob is a fresh
demo key holding no bitcoin at all.

<!-- live:start -->
_Run of 2026-09-23 21:46 UTC — 10/10 steps passed, headed Chromium, real testnet4._

| | Step | Time |
|---|---|---:|
| ✅ | Alice restores the funded wallet through the wallet page | 1.7 s |
| ✅ | Bob creates a demo key with no bitcoin at all | 1.0 s |
| ✅ | Alice buys a real MESH ticket, found on testnet4 | 0.7 s |
| ✅ | Alice mines on the GPU and claims MESH | 1.2 s |
| ✅ | Alice sends Bob two MESH, and Bob receives the chain | 2.5 s |
| ✅ | Bob lists one MESH for sale | 1.0 s |
| ✅ | Alice pays Bob for real; the payment names the offer and Alice | 1.2 s |
| ✅ | Bob's page finds the payment on testnet4 by itself, and he delivers | 1.7 s |
| ✅ | Alice creates a token through the wizard | 2.8 s |
| ✅ | testnet4 opens the new token, and Alice mines it for real | 75.8 s |

What each step recorded:

- Alice restored the funded wallet; the page showed 0.00088609 tBTC.
- Ticket 420ef844159984edc8519d087ea3bf67b0172e2a4d400ee51b6fc564b2729431: 2000 sat to the MESH burn address, fee 187 sat (1.00 sat/vB).
- MESH claimed: Claim 28,032.7766 MESH after 0.6 s on the GPU.
- Payment dfe8b1691aad16f33a8bb62d4f1bed0f75f715f82d003854c357183803296ac0: 1000 sat to Bob, memo naming the offer and Alice's key.
- A real sale settled between two browsers: Bob learned of the payment from testnet4, delivered, and Alice received.
- LIVEQA opened at 153738 after 1.0 min; Claim 86,464.9031 LIVEQA after 0.6 s on the GPU — mined on the token we created.

On the explorer:

- [`420ef844159984ed…`](https://mempool.space/testnet4/tx/420ef844159984edc8519d087ea3bf67b0172e2a4d400ee51b6fc564b2729431)
- [`dfe8b1691aad16f3…`](https://mempool.space/testnet4/tx/dfe8b1691aad16f33a8bb62d4f1bed0f75f715f82d003854c357183803296ac0)
<!-- live:end -->

## Experience notes

Observations recorded by the tests themselves are quoted under each file in the
generated section below. Every note the campaign raised has been turned into
one of the changes above; none remains open.

## Latest run

<!-- results:start -->

_Generated from the last run on 2026-09-23 21:40 UTC — 96 tests: 96 passed, 0 failed, 0 skipped._

#### `ui/activity.spec.ts` — 3/3

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | activity › with no index, the feed says it is local and still shows your own actions | ui | 20.9 s |
| ✅ | activity › the feed calls its figures announcements, not receipts | ui | 1.3 s |
| ✅ | activity › a tampered event in local storage is shown as failing its signature | ui | 18.2 s |

> Without an index the feed labels itself 'local only' and still lists the visitor's own mint, marked 'you'.

#### `ui/create-wizard.spec.ts` — 14/14

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | create a token › the whole wizard, signed with a wallet, lands in the launches grid | ui | 6.1 s |
| ✅ | create a token › a committed token opens for mining once the chain reaches its height | ui | 6.5 s |
| ✅ | create a token › the draft survives leaving the wizard to connect a wallet | ui | 2.9 s |
| ✅ | create a token › the emission step states the halvings the schedule promises | ui | 1.4 s |
| ✅ | create a token › stays on the rails › refuses a symbol with one character | ui | 1.5 s |
| ✅ | create a token › stays on the rails › refuses a symbol with starts with a digit | ui | 1.6 s |
| ✅ | create a token › stays on the rails › refuses a symbol with punctuation | ui | 2.5 s |
| ✅ | create a token › stays on the rails › refuses a symbol with a seeded launch's symbol | ui | 1.9 s |
| ✅ | create a token › stays on the rails › lowercase is accepted and shown as the uppercase symbol it becomes | ui | 1.2 s |
| ✅ | create a token › stays on the rails › a symbol longer than eight characters cannot be typed | ui | 1.2 s |
| ✅ | create a token › stays on the rails › name and one-line description need real content | ui | 2.1 s |
| ✅ | create a token › stays on the rails › a launch cannot open in the past or right now | ui | 2.1 s |
| ✅ | create a token › stays on the rails › a ticket below the dust limit is refused | ui | 1.4 s |
| ✅ | create a token › stays on the rails › committing without a wallet offers to connect one instead | ui | 1.9 s |

> Commit → open → grid takes three clicks and the new token is visible immediately, marked as not yet open.
>
> Step 4 sends a walletless user to the wallet page; on return they land on step 4 with everything intact, one click from signing.

#### `ui/holdings.spec.ts` — 14/14

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | holdings › a claimed balance appears as a position with its records | ui | 20.3 s |
| ✅ | holdings › receiving refuses what is not a chain, and a launch the browser has never seen | ui | 1.2 s |
| ✅ | holdings › resetting a chain asks first, because it cannot be undone | ui | 17.5 s |
| ✅ | holdings › sending › a transfer moves tokens and the receiver can import the chain to see them | ui | 20.0 s |
| ✅ | holdings › sending › refuses to send a malformed recipient key | ui | 17.0 s |
| ✅ | holdings › sending › refuses to send a key that is one character short | ui | 17.4 s |
| ✅ | holdings › sending › refuses to send zero | ui | 17.0 s |
| ✅ | holdings › sending › refuses to send more than is held | ui | 16.7 s |
| ✅ | holdings › sending › refuses to send a negative amount | ui | 17.0 s |
| ✅ | holdings › sending › refuses to send more decimals than the token has | ui | 16.7 s |
| ✅ | holdings › sending › refuses to send to yourself | ui | 16.5 s |
| ✅ | holdings › the chain cannot be forged › an imported chain with an inflated balance is rejected, and nothing changes | ui | 17.0 s |
| ✅ | holdings › the chain cannot be forged › an import that is not JSON is refused in plain words | ui | 17.1 s |
| ✅ | holdings › the chain cannot be forged › corrupted storage is reported, never shown as an empty wallet | ui | 0.9 s |

> Reset chain now names how many records it will delete and needs a second, explicit click.
>
> A recipient with no tokens yet can import the chain they were sent straight from the holdings page.
>
> A corrupted local chain is named as such on the launch page instead of reading as a zero balance.

#### `ui/layout.spec.ts` — 18/18

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | layout › / has no horizontal scroll | ui | 3.2 s |
| ✅ | layout › /create has no horizontal scroll | ui | 1.5 s |
| ✅ | layout › /market has no horizontal scroll | ui | 1.3 s |
| ✅ | layout › /activity has no horizontal scroll | ui | 1.5 s |
| ✅ | layout › /holdings has no horizontal scroll | ui | 1.1 s |
| ✅ | layout › /wallet has no horizontal scroll | ui | 1.3 s |
| ✅ | layout › /launch/mesh has no horizontal scroll | ui | 1.1 s |
| ✅ | layout › /launch/mesh/proof has no horizontal scroll | ui | 1.0 s |
| ✅ | layout › the four sections stay reachable | ui | 1.9 s |
| ✅ | layout › / has no horizontal scroll | mobile | 2.9 s |
| ✅ | layout › /create has no horizontal scroll | mobile | 1.6 s |
| ✅ | layout › /market has no horizontal scroll | mobile | 1.2 s |
| ✅ | layout › /activity has no horizontal scroll | mobile | 1.3 s |
| ✅ | layout › /holdings has no horizontal scroll | mobile | 1.5 s |
| ✅ | layout › /wallet has no horizontal scroll | mobile | 1.0 s |
| ✅ | layout › /launch/mesh has no horizontal scroll | mobile | 1.1 s |
| ✅ | layout › /launch/mesh/proof has no horizontal scroll | mobile | 1.1 s |
| ✅ | layout › the four sections stay reachable | mobile | 1.9 s |

#### `ui/market.spec.ts` — 8/8

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | market › a complete sale between two browsers | ui | 24.7 s |
| ✅ | market › refuses › an offer that is not JSON | ui | 1.9 s |
| ✅ | market › refuses › an offer whose price was edited after signing | ui | 18.7 s |
| ✅ | market › refuses › an offer for a different launch | ui | 19.8 s |
| ✅ | market › refuses › to let a seller pay their own offer | ui | 17.2 s |
| ✅ | market › refuses › to sell more than is held, or for nothing | ui | 17.2 s |
| ✅ | market › refuses › a payment the buyer cannot afford, without broadcasting anything | ui | 17.6 s |
| ✅ | market › refuses › to pay an offer once it has expired | ui | 17.8 s |

> A two-browser sale now completes with two hand-overs — the offer out, the chain back. The seller learns of the payment from the chain.

#### `ui/mining.spec.ts` — 8/8

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | mining › the ticket pays the launch's burn address, commits on chain and pays a fair fee | ui | 17.2 s |
| ✅ | mining › mine on the GPU and claim: the balance is signed, replayed and shown | ui | 17.8 s |
| ✅ | mining › mine on the CPU and claim: the balance is signed, replayed and shown | ui | 21.6 s |
| ✅ | mining › before it can start › without a wallet, mining explains what is missing | ui | 4.2 s |
| ✅ | mining › before it can start › with an empty wallet, the ticket cannot be bought | ui | 2.0 s |
| ✅ | mining › before it can start › one sat short of ticket plus fee is still refused | ui | 1.8 s |
| ✅ | mining › after a claim › the same ticket cannot claim twice | ui | 17.4 s |
| ✅ | mining › after a claim › a ticket bought for one epoch does not carry into the next | ui | 16.9 s |

> Ticket transaction: 2000 sat to the burn address, fee 185 sat for ~161 vB, memo "btcfun:t1:mesh:0:021937f533386907".
>
> GPU: reached 24 zero bits and the claim button in 0.4 s.
>
> CPU: reached 24 zero bits and the claim button in 4.8 s.
>
> An unused ticket that outlives its epoch is named as lapsed, next to the offer of a new one.

#### `ui/navigation.spec.ts` — 14/14

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | navigation › renders / without errors | ui | 3.0 s |
| ✅ | navigation › renders /create without errors | ui | 1.5 s |
| ✅ | navigation › renders /market without errors | ui | 1.5 s |
| ✅ | navigation › renders /activity without errors | ui | 1.1 s |
| ✅ | navigation › renders /holdings without errors | ui | 1.3 s |
| ✅ | navigation › renders /wallet without errors | ui | 1.3 s |
| ✅ | navigation › renders /lab without errors | ui | 1.1 s |
| ✅ | navigation › renders /launch/mesh without errors | ui | 1.0 s |
| ✅ | navigation › renders /launch/mesh/proof without errors | ui | 1.1 s |
| ✅ | navigation › the four main sections are in the header, in order | ui | 1.5 s |
| ✅ | navigation › the chain tip shown in the header is the provider's | ui | 1.6 s |
| ✅ | navigation › an unknown launch says so instead of rendering an empty page | ui | 1.6 s |
| ✅ | navigation › an unknown route falls back to the front page | ui | 2.5 s |
| ✅ | navigation › a provider outage degrades the header, not the app | ui | 1.5 s |

> With the Bitcoin provider down the app still renders every page from its fallback height.

#### `ui/time.spec.ts` — 10/10

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | the schedule over time › at opening, the page shows the schedule's share and epoch | ui | 4.3 s |
| ✅ | the schedule over time › after one day, the page shows the schedule's share and epoch | ui | 1.5 s |
| ✅ | the schedule over time › after seven days — one half-life, the page shows the schedule's share and epoch | ui | 1.5 s |
| ✅ | the schedule over time › after fourteen days — two half-lives, the page shows the schedule's share and epoch | ui | 1.4 s |
| ✅ | the schedule over time › on day twenty-one — three half-lives, the page shows the schedule's share and epoch | ui | 1.6 s |
| ✅ | the schedule over time › after six weeks, the page shows the schedule's share and epoch | ui | 1.4 s |
| ✅ | the schedule over time › each half-life halves what an epoch may mint | ui | 2.8 s |
| ✅ | the schedule over time › the countdown to the epoch close tracks the chain | ui | 3.2 s |
| ✅ | the schedule over time › a new block reaches an open page without a reload | ui | 17.1 s |
| ✅ | the schedule over time › past the terminal block the whole supply has been offered and nothing more | ui | 0.9 s |

> Epoch allowance on MESH: 86464.9031 at opening, 43232.4515 on day 7, 10808.1128 on day 21 — halving every week as specified.
>
> Beyond the terminal block the page shows 100% scheduled and a zero epoch allowance — issuance visibly over.

#### `ui/wallet.spec.ts` — 7/7

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | wallet › a demo key yields a testnet address and an empty balance | ui | 1.5 s |
| ✅ | wallet › funds arriving on chain show up without a reload | ui | 2.0 s |
| ✅ | wallet › restoring the same secret twice yields the same wallet | ui | 3.2 s |
| ✅ | wallet › the revealed secret round-trips to the same address | ui | 2.6 s |
| ✅ | wallet › disconnecting forgets the wallet on reload | ui | 2.5 s |
| ✅ | wallet › refuses bad secrets › too short keeps Restore disabled | ui | 1.5 s |
| ✅ | wallet › refuses bad secrets › 64 characters that are not hex are rejected in words a person understands | ui | 1.8 s |

> A malformed secret is refused with a readable message and no wallet is created.

<!-- results:end -->
