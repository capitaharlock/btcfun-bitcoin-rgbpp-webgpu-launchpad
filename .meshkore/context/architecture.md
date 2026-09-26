---
title: Architecture
updated: 2026-09-26
status: draft
---

# Architecture

```text
Browser + app wallet (BIP84, Bitcoin testnet3)
  ├─ miner (WebGPU, CPU fallback) — reward shown live with the standard's function
  ├─ plans RGB++ operations: open, ticket, mint, transfer, sale
  ├─ signs the Bitcoin side; the commitment sits in OP_RETURN at output 0
  └─ proof page: recomputes any mint from the two chains
                    │
Bitcoin testnet3 ── SPV client on CKB testnet
                    │
RGB++ lock ── CKB cells / CKB-VM
               ├─ miner cell per miner and launch (idle | armed), type = mint script
               ├─ token cells: xUDT, owner mode by input type = mint script hash
               └─ mint script args = launch terms (version, h0, promoter script, metadata hash)
                    │
RGB++ queue service: attaches the SPV proof, submits the CKB side;
its paymaster adds CKB capacity for a BTC fee. Anyone can complete
the same transaction without it.
                    │
Cloudflare Worker + D1: signed announcements and listings; never authoritative
```

Authority for every transition comes from spending a Bitcoin UTXO that an RGB++
lock binds a cell to: the Bitcoin transaction commits to the CKB transaction,
and the RGB++ lock accepts it only with an SPV proof of that Bitcoin
transaction. The mint script relies on that check rather than repeating it, and
reads the same proof for the ticket payment and the ticket's confirming height.

**Mint script.** One Rust `no_std` type script, one code hash for every launch,
deployed on CKB testnet with `hash_type: data1` in a cell nobody can spend
(`contracts/deployments/testnet.json`). It validates open, ticket, mint and close
transitions of a miner cell, the promoter payment per armed cell, the anchor
window and the exact reward. The xUDT's owner mode requires the mint script, so
the token cannot be minted any other way. Measured per whole transaction in the
CKB-VM tests: open about 42k cycles, ticket about 273k, mint about 313k.

**Rate fixed by the ticket.** A signed mint must never become invalid: once its
Bitcoin transaction spends sealed UTXOs, its committed CKB transaction is the
only way those cells move. The reward is therefore priced at the ticket's
anchor, not at the mint's confirmation, and a mint may not re-arm, so nothing a
mint is checked against depends on when it confirms.

**Separate outputs.** The miner cell and the tokens are sealed to different
Bitcoin outputs, so a transfer never has to move the miner cell, and plain
UTXOs used for funding are only those the RGB++ service reports as carrying no
cells.

**Sales.** The seller signs its listed UTXO and the price output with
`SIGHASH_SINGLE | ANYONECANPAY`; the buyer adds the commitment, their token
output, funding and change, and broadcasts alone. The index stores the listing
as signed public data and gives it no control over funds.

**Index.** Launches, mints, transfers and listings are derived from
transactions; the Worker is a rebuildable projection that may omit but cannot
forge. Balances and supply are read from CKB, through a configurable endpoint.

Report provisional, CKB-confirmed and Bitcoin-anchored status separately.
Confirmation policy and reorg treatment remain open (`V8`). Graduation is not
inherently a leap and is deferred.

**Repository:** `contracts/` (mint script, shared core, CKB-VM tests, reward
vectors, deployment record) and `apps/web` (client, miner, Worker). Do not
scaffold empty packages to demonstrate breadth.

## Code architecture — `apps/web`

The client is organised as ports and adapters (hexagonal), because it is a
client of three externals it must not trust — a Bitcoin data provider, the
RGB++ assets service, a CKB node — and two device capabilities — WebAuthn PRF,
WebGPU — each of which must be swappable, and because the rules that decide
money have to be readable and testable with no network at all.

```text
src/
  domain/    the rules: protocol (tokenomics, challenge), codecs, Bitcoin and
             RGB++ transaction shapes and plans, launches, market, mining,
             signed activity. No I/O, no React, no browser API.
  ports/     the interfaces the application needs from outside: ChainProvider,
             RgbppGateway, CkbCells, Ledger, Certifier, Vault, MiningBackends,
             DeviceStore. Each names the second implementation it foresees.
  adapters/  one folder per external technology, implementing a port:
             mempool.space, the RGB++ service, a CKB node, the activity index,
             the vault (passkey, local, demo), CPU/GPU mining, browser storage.
  app/       composition and use cases: `services.ts` builds the adapters once;
             providers, hooks, the router, launch creation, mining sessions,
             the operation store and the submit use case.
  ui/        the design system: primitives with their own stylesheets, theme
             tokens, formatting, pixel art.
  features/  feature components (arcade, launch, launches, market, mining,
             wallet, diagram).
  pages/     route targets. docs/ the public documentation, itself pages.
  config/    build-time configuration, read in one place.
```

Dependency direction: `domain ← ports ← adapters ← app ← features/pages`;
`ui` serves the layers above it and never reaches into the app. Adapters are
constructed only in `app/services.ts` and the providers; everything else
receives them through `useServices()`, so a test or a script can supply a
double. Cross-module imports use the `@/` alias and the module's explicit
barrel; inside a module, imports are relative. `src/architecture.test.ts`
reads every import and fails the unit suite on the first one that points the
wrong way, on a domain module that does I/O, or on an import that bypasses a
barrel.

The same separation holds outside `src/`: `worker/` is the index's server side
and depends only on `domain/`; `e2e/support/` simulates the ports in a browser;
`scripts/` drives the real testnet through the same modules the browser runs.

