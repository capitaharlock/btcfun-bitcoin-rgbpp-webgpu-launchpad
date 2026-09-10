---
id: QA6
title: "Holdings: send, receive and the rails"
status: done
priority: high
owner: rjj
category: code
initiative: browser-qa
created: 2026-09-23
updated: 2026-09-23
---

Transfers between identities, receiving a chain as a newcomer, and every way a transfer or an import must be refused.

## Done when

- Malformed keys, zero, negative, over-precise and over-balance amounts, and self-transfers are refused.
- A forged chain is rejected and nothing changes; corrupt storage is reported, never read as zero.
- Resetting a chain takes a second, explicit click.
