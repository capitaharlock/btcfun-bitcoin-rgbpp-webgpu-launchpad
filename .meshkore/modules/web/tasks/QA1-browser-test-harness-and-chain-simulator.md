---
id: QA1
title: "Browser test harness and chain simulator"
status: done
priority: high
owner: rjj
category: code
initiative: browser-qa
created: 2026-09-23
updated: 2026-09-23
---

Playwright with three projects — `ui` (deterministic), `mobile` (Pixel 7 layout) and `live` (testnet4, opt-in) — on top of a simulated mempool.space provider that answers only the endpoints the app calls and refuses anything else.

## Done when

- The simulator controls the block height, so a test moves time by moving the tip.
- Broadcast transactions are parsed, their inputs spent and their outputs credited, so the page sees change and payments the way it would on a real node.
- An uncaught page error fails a test even when every assertion passed.
- `npm run test:browser` runs the deterministic suite; `npm run test:browser:headed` shows it.
