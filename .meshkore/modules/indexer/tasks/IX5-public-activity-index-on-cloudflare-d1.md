---
id: IX5
title: "Public activity index on Cloudflare D1"
status: done
priority: high
owner: rjj
category: indexer
initiative: testnet-spike
created: 2026-09-23
updated: 2026-09-23
---
A Cloudflare Worker over D1 that accepts signed activity events, verifies them with the same module the client runs, and serves a feed. Serves the SPA from the same origin so there is no CORS and one deploy. Zero cost at rest; decision recorded in `.meshkore/docs/hosting.md`.

## Done when

- The server shares one verification implementation with the client.
- A tampered event is refused; the event id is its own content digest, so replay is a collision.
- The client works with the index absent, local-first and publish-second.
- Verified against a local D1: accept, refuse, feed, stats and asset serving.
