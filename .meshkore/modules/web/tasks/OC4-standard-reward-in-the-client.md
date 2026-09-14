---
id: OC4
title: "Standard reward in the client, live while mining"
status: done
priority: high
owner: rjj
category: web
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [015bd24, bebaab6]
---

Replace the epoch schedule with the standard reward, computed exactly as the
script does, and show it while the miner runs: the best hash so far, what it
mints now, and the blocks left before the next halving.

## Done when

- `reward()` passes the same vectors as the script.
- The mining screen updates the mintable amount as better hashes arrive.
- The launch page shows supply minted, tickets sold and the current halving.

## Resolution

`lib/standard.ts` reproduces the shared vectors; the mining panel shows "mintable now" — the standard reward for the best hash at the ticket's rate — and the launch page shows supply, token cells and miner cells read from CKB.
