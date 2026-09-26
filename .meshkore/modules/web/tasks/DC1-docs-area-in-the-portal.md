---
id: DC1
title: "Docs area in the portal, reached from the footer"
status: done
priority: high
owner: rjj
category: web
initiative: public-docs
created: 2026-09-24
updated: 2026-09-24
completed_at: 2026-09-24T15:10:00Z
---

A `#/docs` section with one page per topic and a footer link to it: overview
and technologies (Bitcoin testnet3, RGB++, CKB, xUDT, the mint script, the
browser miner), the standard tokenomics and the platform fee, when tokens are
delivered, transfers, ownership, the order book, verification, and what testnet
means. User-level text first, a technical layer below it.

## Done when

- Every topic above has a page, linked from the footer and navigable on a phone.
- No statement contradicts `PROTOCOL.md` or the decisions.
- A browser test visits every page.

## Resolution

A lazy `#/docs` view (`apps/web/src/pages/Docs.tsx`, route in `src/App.tsx`) with a side contents list that folds into a menu on phones, and a **Docs** link in the footer. Eight pages under `src/docs/pages/<slug>/` — overview & technologies, tokenomics, the mint circuit (including when tokens are delivered and the *landing* state), where a token lives, transfers, the market, verification, testnet & honesty — each written at user level with a folded technical layer (`src/docs/parts.tsx`). Figures come from `domain/protocol/standard.ts`, `domain/rgbpp/index.ts` and `domain/rgbpp/sale.ts` rather than being retyped; `ANCHOR_GRACE_BLOCKS` joined `domain/protocol/standard.ts`, pinned by test to the Rust constant. Browser test `e2e/ui/docs.spec.ts` visits every page on desktop and phone.
