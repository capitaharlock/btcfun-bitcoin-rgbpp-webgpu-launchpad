---
id: LB4
title: "Passkey wallet and chain access on testnet4"
status: done
priority: high
owner: rjj
category: web
initiative: testnet-spike
created: 2026-09-23
updated: 2026-09-23
---
A real wallet: WebAuthn PRF output as root entropy, BIP39/BIP84 derivation at `m/84'/1'/0'/0/0`, UTXOs, fee estimation, coin selection and signed P2WPKH transactions over mempool.space. A browser-stored demo key exists as an explicit, labelled fallback where no platform authenticator does. Precursor to `WA1` and input to `V9`'s recovery questions.

## Done when

- The address is standard BIP84 and sweepable by any BIP39 wallet.
- No private key is persisted on the passkey path; keys live only inside `use()`.
- Coin selection conserves value and always covers the fee its own size implies.
- Connecting twice restores the same wallet rather than enrolling a new one.
