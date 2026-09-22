---
title: "A launch is registered for a fee and admitted by btc.fun's certificate"
updated: 2026-09-25
status: stable
---

# Decision

Creating a launch costs `REGISTRATION_SATS` = 20,000 sats, paid once, on
Bitcoin, to the platform. The payment commits in an `OP_RETURN` to the launch's
terms — `sha256("btc.fun/launch-registration/v1" ‖ terms args)` — so it pays
for one launch and no other. btc.fun's signer (`POST /api/certify` on the
Worker) reads that transaction, checks the amount and the commitment, and signs
`sha256("btc.fun/launch-certificate/v1" ‖ terms args ‖ registration txid)`
with the platform's certificate key (BIP340). The signature is deterministic:
asking twice gives the same certificate.

The mint script (`contracts/mint`) holds the platform's certificate public key.
Arming a paid miner cell — the only way a miner enters a launch, since nobody
may open an idle cell — requires the certificate in the btc.fun witness, before
the creating ticket. Idle cells exist only as a mint leaves them, so every
ticket and every mint of a launch descends from a certified arming: **a token
of btc.fun's mint script can be minted only where btc.fun admitted its launch.**

The platform's own launches (DEMO and the official set) are admitted by the
platform without a fee: their registration txid is all zeros and the
certificate is signed with the same key.

# Why

- **No free spam.** An announcement used to cost nothing, so anyone could fill
  the catalogue with junk. A fee paid in Bitcoin is a filter nobody can fake,
  and it pays for hosting the launch.
- **Tokens that exist only here.** Before, anyone could build terms by hand and
  mint a token under btc.fun's script outside the platform. Every ticket
  already paid the platform its share — that was enforced — but nothing said
  the launch had been admitted. Now the script says it.
- **A place to validate projects.** Admission is the point where btc.fun can
  check a launch before it can take a single ticket; the certificate is the
  record that it did.

# How it was built

- **The certificate is not in the terms.** 96 more bytes in the terms would be
  96 more CKB in every miner cell's type script: 321 CKB against the 255 the
  paymaster's 316-CKB cell can give once it keeps its minimum change. The
  certificate travels in the arming's btc.fun witness instead, and the token's
  identity stays its terms.
- **No check at cell creation.** A paid cell is created in a transaction the
  RGB++ queue completes with the paymaster's input, which moves any witness
  past the inputs; the check waits for the arming, where the witness is ours.
  A paid cell of an uncertified launch can never be armed; the app never offers
  such a launch.
- **Shared implementation.** `apps/web/src/lib/launches/certificate.ts` is used
  by the browser, the Worker and the scripts; `contracts/mint-core` has the
  Rust side; `contracts/vectors/reward.json` (`admission`) holds a vector both
  reproduce byte for byte, signed with a published test key (`0x42` × 32).
  Contract tests build the script trusting that key (`--features
  test-cert-key`); the deployed binary trusts only the platform key.

# Consequences

- **btc.fun becomes an authority over one thing.** The Worker was an index that
  decided nothing (`.meshkore/docs/hosting.md`). It now decides which launches
  may exist. It still decides nothing about ownership, balances or mints, and
  anyone can re-check a certificate and the payment it names from the two
  chains.
- **The signing key is a critical secret.** It is a Worker secret (`CERT_KEY`)
  and a gitignored local file (`apps/web/.platform-cert-key.json`) for the
  platform's own launches. A leaked key admits launches without a fee — every
  ticket of them still pays the platform. Rotating it needs a new script
  version: the key is compiled in.
- **The registration is verified at broadcast, not at a block.** A creator is
  not held ten minutes; a registration later double-spent costs the platform
  one fee and nobody else anything.
- **Launches announced before this script are obsolete**, as with every
  script version; the official launches are admitted again.
- **The creator's page shows what a launch earns** — the ticket share, the fee
  and an illustrative daily range — beside the steps, because that is the
  first thing a creator asks.
