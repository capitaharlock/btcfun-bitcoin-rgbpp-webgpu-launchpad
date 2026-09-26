# btc.fun — Bitcoin · RGB++ · CKB token launchpad

**Community tokens mined in the browser, issued on CKB and owned on Bitcoin.**

`Rust (no_std) · CKB-VM` · `RGB++` · `xUDT` · `TypeScript (strict)` · `CCC`
· `WebGPU / WGSL` · `WebAuthn PRF` · `React 19` · `Vite` · `Cloudflare Workers` · `D1`

Every token follows one standard. Buy a ticket on Bitcoin, mine against it in
the browser, and mint what the result is worth, in that moment, into a Bitcoin
output you control. The rule is enforced by a script on CKB, not by this app,
and anyone can recompute any mint from the two chains.

## How it works

```text
TICKET   pay 10,000 sats: 9,500 to the launch's promoter, 500 to the platform; the ticket's Bitcoin output is the challenge
MINE     search for a nonce in the browser; the reward for the best hash is shown live
MINT     spend the ticket output; the tokens exist in that transaction's output
         → transfer, sell, verify, or buy the next ticket
```

```text
challenge = sha256(ticket_txid ‖ ticket_vout)
clz       = leading zero bits of sha256d(challenge ‖ nonce)        mintable from 16
k         = halvings (every 1008 Bitcoin blocks) from the launch's opening to the ticket's anchor
reward    = floor(10^8 × clz² / 2^k) atoms                          8 decimals
```

- **One standard.** A creator chooses the token's identity (symbol, name, one
  sentence, an accent colour), the Bitcoin address that receives ticket income
  and the opening height. Nothing economic: supply, tickets sold and halving are
  comparable between launches.
- **The ticket fixes the rate.** Its anchor must lie within 144 blocks of the
  ticket's SPV-proven confirmation. A signed mint therefore never depends on
  when it confirms, and can never be stranded by a halving.
- **No cap, bounded anyway.** Mints are independent and can run in parallel.
  The reward reaches zero after at most 43 halvings, and the cost of a token
  doubles every week while the ticket price stays fixed.
- **No reserve, no floor, no redemption.** Ticket income is the promoter's
  revenue. A token is worth what someone will pay for it.

## What it is built from

| | |
|---|---|
| **Mint script** | A Rust `no_std` CKB type script that enforces open, ticket, mint and close of a per-miner *miner cell*, the promoter payment and the exact reward. Deployed on CKB testnet in an unspendable cell (`contracts/deployments/testnet.json`, code hash `0xb8af59e9…c72f`). Per whole transaction: open ~42k cycles, ticket ~273k, mint ~313k |
| **Token** | An RGB++ xUDT on CKB bound to a Bitcoin UTXO. Owner mode by input type, with the mint script hash as owner, so the token can be minted no other way |
| **Network** | Bitcoin testnet3 with CKB testnet: the public RGB++ services verify testnet3, and testnet4 has no SPV client on CKB |
| **Settlement** | The app builds the CKB transaction and the Bitcoin transaction that commits to it. The RGB++ queue service attaches the SPV proof and submits; its paymaster provides CKB capacity for a BTC fee. It cannot change what was committed, and anyone can complete the same transaction without it |
| **Sales** | The seller signs its token UTXO and price with `SIGHASH_SINGLE \| ANYONECANPAY`; the buyer completes and broadcasts alone. Payment and delivery are one transaction |
| **Mining** | A WGSL compute shader doing SHA-256d over a fixed 40-byte preimage, with a Web Worker fallback. Every GPU candidate is re-hashed on the CPU before anything believes it |
| **Wallet** | WebAuthn PRF → BIP39 → BIP84. A standard path, so the coins are sweepable by any wallet |
| **Proof** | A page that takes a mint's Bitcoin txid and re-checks every rule from raw chain data: commitment, ticket, hash and amount |
| **Edge** | One Cloudflare Worker serving the SPA and `/api` over D1, holding signed announcements and listings. It can omit, never forge |

## Status

The mint script is deployed and passes 24 CKB-VM tests, including weak hashes,
unpaid tickets, work against another ticket, an idle cell minting again and
amounts above or below the reward. The client passes 65 browser tests over
simulated Bitcoin, RGB++ and CKB, with the mint rules as the oracle.
The Rust and TypeScript reward functions pass the same vectors.

Pending: the live end-to-end run over RGB++ on testnet (funds), and a redeploy
of the Worker so the public index carries listing payloads. Nothing here has
been reviewed for real money, and nothing points at mainnet.

[**`capabilities.md`**](.meshkore/docs/capabilities.md) splits every capability
into implemented, pending and absent, with the task that unblocks each.

## Documentation stays with the code

The portal's docs (`#/docs`, linked from the footer) explain every circuit —
the mint, delivery, ownership, transfers, the order book, verification — with
flowcharts declared as data (`apps/web/src/features/diagram/`). Each page
lists the files it describes in `apps/web/src/docs/sources.json`, and
`npm run docs:check` fails when one of those files was committed after its
page, or has uncommitted changes the page does not. `npm run deploy` runs it
first, so a stale page stops the deploy.

The rule: a change to a documented behaviour updates its page in the same
change — even if only to confirm the page still holds.

## Engineering

Quality is the deliverable here, ahead of scope. One concept, one
implementation; ports where a second backend is foreseeable; discriminated
unions over optional soup; comments that explain *why*. Every rule that can be
tested is tested, and the UI is verified in a real browser before it is called
done. Nothing is named more strongly than the code can support.

## Read next

- [Protocol specification](PROTOCOL.md)
- [What is implemented, pending and absent](.meshkore/docs/capabilities.md)
- [Test results: what is tested and what testing found](.meshkore/docs/testing/results.md)
- [The decision: one standard, an instant mint](.meshkore/context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)
- [Hosting: why Cloudflare, and what the index may never be](.meshkore/docs/hosting.md)
- [Design history — including the directions already rejected](.meshkore/context/idea-evolution.md)
- [Roadmap and acceptance gates](.meshkore/docs/roadmap.md)

## Run it

```bash
cd apps/web && npm install
npm run dev                    # the app
npm test && npm run typecheck  # unit tests, strict TS
npm run test:browser           # the browser suite, simulated chains + phone layout
npm run test:browser:headed    # the same, on screen
npm run build                  # production build, Worker included
npm run db:local && npm run dev:edge   # the Worker over a local D1
```

### The mint script

```bash
cd contracts && cargo build -p btcfun-mint --release --target riscv64imac-unknown-none-elf && cargo test
```

### On the real network (testnet only)

```bash
cd apps/web
npm run e2e:wallet                     # create the runner's wallet, print the address to fund
npm run ckb:deploy-mint -- --dry-run   # deploy the mint script to CKB testnet; drop --dry-run to send
npm run rgbpp:live -- <step>           # launch | open | ticket | mine | mint | transfer | status
```

`rgbpp:live` walks a token's whole life with the app's own modules — every
Bitcoin transaction is built exactly as the browser builds it — and records
each step so the steps can run minutes apart while Bitcoin confirms and the
RGB++ queue completes the CKB side. The configuration is CKB testnet's only.

Project management follows the [MeshKore standard](https://meshkore.com/standard).
