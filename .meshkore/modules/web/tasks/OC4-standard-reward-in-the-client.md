---
id: OC4
title: "Standard reward in the client, live while mining"
status: backlog
priority: high
owner: rjj
category: web
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
---

Replace the epoch schedule with the standard reward, computed exactly as the
script does, and show it while the miner runs: the best hash so far, what it
mints now, and the blocks left before the next halving.

## Done when

- `reward()` passes the same vectors as the script.
- The mining screen updates the mintable amount as better hashes arrive.
- The launch page shows supply minted, tickets sold and the current halving.
