# btc.fun — Bitcoin · WebGPU · RGB++ token launchpad

**Permissionless token issuance on Bitcoin, mined in your browser on the GPU.**

`TypeScript (strict)` · `Bitcoin testnet4` · `WebGPU / WGSL` · `WebAuthn PRF`
· `React 19` · `Vite` · `Cloudflare Workers` · `D1` · `secp256k1` · `BIP32/39/84`

Create a token, pay a real Bitcoin ticket, mine real proof of work at
**186 MH/s in the browser**, and hold a balance any stranger can re-derive from
genesis. No backend owns your keys, your tokens or your history.

```
186 MH/s   WebGPU compute kernel, two fixed SHA-256 compressions per invocation
  7 MH/s   Web Worker fallback, same kernel, same verification
    122    unit tests · 9 routes verified in a real browser, zero console errors
     $0    cost at rest — one Cloudflare Worker over D1, scales to zero
```

## What actually runs today

| | |
|---|---|
| **Bitcoin** | Real testnet4 P2WPKH payments — coin selection, fee from measured transaction weight, OP_RETURN commitments, broadcast. `@scure/btc-signer`, `@noble`, no Buffer polyfill |
| **Mining** | A WGSL compute shader doing SHA-256d over a fixed 40-byte preimage, auto-tuned to a 45 ms dispatch, lock-free hit buffer via `atomicAdd`. Every GPU candidate is re-hashed on the CPU before anything believes it |
| **Wallet** | WebAuthn PRF → BIP39 → BIP84 `m/84'/1'/0'/0/0`. Touch ID derives the key; no seed phrase, no private key in storage. Standard path, so the coins are sweepable by any wallet |
| **Ledger** | Hash-chained signed records, replay-from-genesis as the *only* state producer, exhaustive runtime decoding at the storage boundary |
| **Market** | Signed offers, payment bound to an offer by OP_RETURN, settlement joined across offer + payment + delivery |
| **Edge** | One Cloudflare Worker serving the SPA and `/api` over D1. It verifies with the same module the client runs — it can omit, never forge |

## What is specified but not built

**RGB++ single-use seals, Nervos CKB settlement, xUDT, CKB-VM scripts.** The
protocol is written ([`PROTOCOL.md`](PROTOCOL.md)); there is no Rust and no CKB
SDK in this repository, and nothing here pretends otherwise.

That line is the point of the project, not a caveat on it. Building the offer
book is what made the atomicity gap concrete — the taker pays first, the maker
delivers second, and no amount of care in the client closes it. That is exactly
what single-use seals are for, and the offer format is already shaped so the
seal can be added without changing a caller.

[**`capabilities.md`**](.meshkore/docs/capabilities.md) splits every capability
three ways — implemented, experimental, absent — with the task that unblocks each.

## Engineering

Quality is the deliverable here, ahead of scope. One concept, one
implementation; ports where a second backend is foreseeable (mining backends,
chain providers, the token ledger); discriminated unions over optional soup;
comments that explain *why*. Every rule that can be tested is tested, and the UI
is verified in a real browser before it is called done.

The repository survived an [external technical
audit](.meshkore/docs/audit-2026-09-23.md) with reproductions: fifteen findings,
nine real defects, all fixed with regression tests naming their finding id — a
fee estimator that underpaid every transaction carrying a memo, a market status
that implied evidence it did not have, and an emission schedule that rounded the
opposite way from the formula its own comment declared.

## Read next

- [What is implemented, experimental and absent](.meshkore/docs/capabilities.md)
- [Protocol specification](PROTOCOL.md)
- [Audit findings and disposition](.meshkore/docs/audit-2026-09-23.md)
- [Hosting: why Cloudflare, and what the index may never be](.meshkore/docs/hosting.md)
- [Design history — including the directions already rejected](.meshkore/context/idea-evolution.md)
- [Roadmap and acceptance gates](.meshkore/docs/roadmap.md)

## Run it

```bash
cd apps/web && npm install && npm run dev      # the app
npm test && npm run typecheck                  # 122 tests, strict TS
npm run verify:ui                              # 9 routes + both miners, in Chromium
npm run db:local && npx wrangler dev           # the Worker over a local D1
```

Project management follows the [MeshKore standard](https://meshkore.com/standard).
