---
id: LB6
title: "Ticket purchase, claim flow and chain verification UI"
status: done
priority: high
owner: rjj
category: web
initiative: testnet-spike
created: 2026-09-23
updated: 2026-09-23
---
The loop a visitor actually performs: buy a ticket (a real payment carrying an OP_RETURN commitment), mine against a challenge that commits to that ticket, claim, hold, transfer, and verify. Extends the Proof Explorer with a replay panel. Precursor to `WA2`-`WA4` and `WA6`.

## Done when

- Work cannot start before a ticket exists, because the challenge commits to it.
- Fixture figures and ledger figures are visibly distinct on every screen.
- The Proof Explorer states per claim what is verified, assumed or missing.
- Ticket payments are stated as burned and non-refundable.
