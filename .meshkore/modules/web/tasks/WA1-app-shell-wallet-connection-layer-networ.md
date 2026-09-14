---
id: WA1
title: "Minimal app and one compatible wallet"
status: done
priority: high
owner: rjj
category: web
initiative: web-app
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [fa56c41, f54962e, e4ab164, c6fabf7]
---

Build the smallest React/TypeScript shell for the selected wallet and network, retaining an adapter boundary for future support.

## Execution

- Phase: 2.
- Prerequisites: `TC3`, `V3`.

## Done when

- The chosen real wallet signs every required demo flow, not just a generic PSBT.
- Network/asset mismatch and unavailable dependencies produce actionable errors.

## Resolution

The app's own passkey wallet (`apps/web/src/lib/bitcoin/vault.ts`, `passkey.ts`, `state/WalletProvider.tsx`) signs every demo flow — open, ticket, mint, transfer and sale (`lib/rgbpp/operations.ts`, `lib/rgbpp/sale.ts`). An address on another network is refused and a provider outage degrades the page rather than breaking it (`e2e/ui/wallet.spec.ts`, `create-wizard.spec.ts`, `holdings.spec.ts`, `navigation.spec.ts`). Confirmation on the live networks is OC8; wallets beyond the app's own are an open decision (`PROTOCOL.md` §2).
