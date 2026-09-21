---
title: Hosting and deployment
category: docs
tags: [deploy, cost, cloudflare]
updated: 2026-09-23
owner: rjj
status: draft
related: [testnet-spike, web-app]
---

# Hosting and deployment

Constraint: near-zero cost at rest. The prototype will sit idle for days at a
time, so anything billed per running hour is disqualified regardless of how
cheap the hour is. Preference order given by the operator: Cloudflare, then
Fly.io, then Vercel.

## Decision

**One Cloudflare Worker serving both the SPA and the API, over D1.**

| Piece | Service | Cost at rest | Cost in use |
|---|---|---|---|
| Static app | Worker assets binding | 0 | Free to 100k req/day |
| API | Same Worker, `/api/*` | 0 | Shares the same quota |
| Database | D1 (SQLite) | 0 | Free to 5 GB, 5M row reads and 100k writes/day |

D1 is the part that makes this work. It is SQLite with no instance to keep
warm: an idle database costs nothing and has no cold start worth the name,
because there is no machine to wake. Serving the app from the *same* Worker
removes the second origin, so there is no CORS layer, no preflight on every
write, and one `wrangler deploy` for the whole thing.

## Why not the alternatives

**Fly.io** was the operator's second preference and does suspend machines, but a
suspended machine still has a volume, still has a cold start measured in
seconds, and still needs a Postgres somewhere. The latency is also wrong: this
app is read-mostly and global, which is the case edge compute exists for.

**Vercel** would mean Vercel for the app and a separate database provider —
Neon or Turso — so two vendors, two dashboards and a free tier that has to hold
on both sides.

**Cloudflare KV** was considered for the index and rejected: it is eventually
consistent, and a feed that can show an event and then stop showing it is worse
than a feed that is briefly empty. **Durable Objects** would give strong
ordering but bill for duration, which is the thing being avoided.

## What the index is allowed to be

The Worker is an index, never an authority (PROTOCOL.md §2, §3). It accepts
events that were already signed by their actor, checks the signature with the
same `faultIn` the browser runs, stores them, and hands them back for the client
to check again. It cannot forge an event, alter one, or make an invalid claim
look valid.

This is load-bearing for the cost model as much as for the trust model: because
the server decides nothing, it needs no auth, no sessions, no rate-limit
infrastructure beyond what the platform gives, and no recovery story. Losing the
whole database costs discovery, not ownership — every wallet keeps its own
records, and the client works with the index absent.

## Deploying

```sh
cd apps/web
npm install

wrangler d1 create btcfun-activity        # once; put the id in wrangler.toml
npm run db:remote                         # apply worker/schema.sql

npm run deploy                            # docs:check, build, typecheck, upload
```

The public URL is https://btcfun.rjj.workers.dev. It is stable because the
Worker's name (`btcfun`) is fixed in `wrangler.toml`. A custom domain can be
added later as a Worker route without changing anything else.

Local development, in two modes:

```sh
npm run dev        # Vite only. The index is absent; the app runs local-only.
npm run db:local   # once, to create the local D1 file
npm run dev:edge   # wrangler: the real Worker, real D1, real /api
```

`npm run dev` deliberately works without wrangler. The activity client writes
every event locally first and publishes second, so the whole app is usable with
no index at all — which is both the offline story and the honest one.

## Still open

- Whether the offer book moves into the index alongside activity. It would make
  offers discoverable rather than hand-delivered, at the cost of the operator
  being able to omit one. That trade is the same one §5.1 describes and should
  be decided with `MK1`, not here.
- Retention. Events are never deleted today; at free-tier scale that is fine for
  a long time, but a prototype that runs for a year needs a policy.
