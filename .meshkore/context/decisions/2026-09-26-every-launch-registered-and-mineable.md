---
title: "Every launch pays its registration, and every registered launch is mined"
updated: 2026-09-26
status: stable
---

# Decision

There is no unpaid admission. The platform's own launches (DEMO and the
official set) are registered exactly like anyone's: a Bitcoin payment of
`REGISTRATION_SATS` to the platform committing to the terms, certified by the
same public signer (`POST /api/certify`). The mint script refuses a certificate
over an all-zero registration txid (`contracts/mint-core` `admitted`), so the
exception the previous record allowed cannot be used by anyone, the platform
included. Script `0x4e4599…19a5` (deployed 2026-09-26) replaces `0x36aaa3…8154`;
the launches admitted under the exception are gone from the site.

Every launch the site lists — which means every launch whose certificate
verifies — can be mined from the site. The testnet showcase rule (mining offered
on the featured DEMO only) is withdrawn; DEMO stays featured first in the
catalogue.

Creating a launch is one action after the form: the page pays, asks for the
certificate — again every few seconds while Bitcoin's explorers have not seen
the payment, never waiting for a confirmation — and signs the announcement.
A fifth step summarises what the launch rests on (registration txid,
certificate, token id, announcer) and leads to its mint page, which waits for
the opening block and says why.

# Why

- **One rule, no exceptions.** A registration that pays nothing is a hole the
  key's holder could use without leaving a trace on Bitcoin. With a real
  payment behind every launch, "certified" always means "someone paid, and here
  is the transaction": the registration is each launch's genesis on Bitcoin.
- **A created token is real.** A creator who paid should see miners able to buy
  tickets on the launch the moment it opens, not a greyed-out button.
- **Speed.** Payment, certificate and announcement were three presses; the
  last two ask nothing of the creator and now follow the first.

# Consequences

- Seeding the site's official launches costs the platform's own wallet 20,000
  sats each plus fees; the payment lands at the platform's address.
- `apps/web/.platform-cert-key.json` is no longer used to certify launches; the
  scripts register through the deployed signer like the browser does
  (`scripts/rgbpp/kit.mjs` `register`). The key still exists as the Worker's
  `CERT_KEY`.
- The narrower "finish a ticket on a closed launch" path is gone with the
  closed state (`domain/mining/loop.ts`): every listed launch is open.
