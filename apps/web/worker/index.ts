/* The activity index: a Cloudflare Worker over D1.
 *
 * WHAT IT IS FOR. Everything else in this app works with no server at all —
 * keys, mining, the ledger, the offer book. The one thing a single browser
 * cannot do is let strangers see each other. That is all this exists for, and
 * the design follows from keeping it that narrow.
 *
 * WHAT IT IS NOT. It is not an authority. It stores events that were already
 * signed by their actor, checks each signature with the *same module the client
 * uses*, and hands them back for the client to check again. It cannot forge an
 * event or alter one. Losing it costs discovery, never ownership — which is the
 * operator posture PROTOCOL.md §2 requires and the reason there is no "trust
 * me" surface here.
 *
 * AND IT DOES NOT ESTABLISH THAT ANYTHING HAPPENED. Accepting an event means
 * its signature is genuine, nothing more: the actor could equally have signed a
 * mint that never occurred or a purchase nobody paid for, and this Worker holds
 * no ledger to replay against and no Bitcoin node to confirm with. It therefore
 * returns no verdict of its own — no `verified` flag — and its rows must never
 * be totalled into a supply or a volume. `src/lib/activity/types.ts` states the
 * same boundary for the client.
 *
 * ONE EXCEPTION: THE CERTIFICATE. `POST /api/certify` is the one place btc.fun
 * decides something (decision `2026-09-25-paid-registration-and-certificate`).
 * It checks that a Bitcoin transaction paid the launch registration and
 * committed to the launch's terms, then signs those terms; the mint script
 * takes tickets only for signed terms. It decides only whether a launch may
 * exist — never who owns what — and anyone can re-check a certificate and the
 * payment it names from the two chains.
 *
 * WHY THIS SHAPE COSTS NOTHING. One Worker serves both the SPA assets and the
 * API, so there is no second origin and no CORS. D1 is SQLite that scales to
 * zero: no idle cost, no machine to keep warm. Cloudflare's free tier covers
 * 100k requests and 100k D1 writes a day, which is far past anything this
 * prototype will see. The alternatives were considered and rejected in
 * `.meshkore/docs/deploy/hosting.md`.
 */

import { faultIn } from "../src/lib/activity/verify";
import { activityId } from "../src/lib/activity/verify";
import type { SignedActivity } from "../src/lib/activity/types";
import { registrationFault, signCertificate } from "../src/lib/launches/certificate";

export interface Env {
  DB: D1Database;
  /** Static assets binding — the built SPA. */
  ASSETS: Fetcher;
  /** The certificate signer's secret, hex (a Worker secret). */
  CERT_KEY?: string;
  /** mempool.space REST base of the network registrations are paid on. */
  MEMPOOL_API: string;
  /** The platform's scriptPubKey, hex: where a registration pays. */
  PLATFORM_SCRIPT: string;
}

/** Events returned by one feed request. Bounded so a bad client cannot ask
 *  for the whole table and turn a free tier into a bill. */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 60;

/** Largest body we will parse. An activity event is a few hundred bytes. */
const MAX_BODY_BYTES = 4096;

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      // Anything that is not the API is the single-page app.
      return env.ASSETS.fetch(request);
    }

    try {
      switch (`${request.method} ${url.pathname}`) {
        case "GET /api/health":
          return json({ ok: true });
        case "GET /api/activity":
          return await readFeed(url, env);
        case "POST /api/activity":
          return await writeEvent(request, env);
        case "GET /api/stats":
          return await readStats(env);
        case "POST /api/certify":
          return await certify(request, env);
        default:
          return error("No such endpoint.", 404);
      }
    } catch (cause) {
      // Never leak a stack to the client; the index is public.
      console.error("[index]", cause);
      return error("The index failed to handle that request.", 500);
    }
  },
} satisfies ExportedHandler<Env>;

// ── reads ────────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  body: string;
  signature: string;
  received_at: number;
}

async function readFeed(url: URL, env: Env): Promise<Response> {
  const launch = url.searchParams.get("launch");
  const kind = url.searchParams.get("kind");
  const limit = clampLimit(url.searchParams.get("limit"));

  // Parameterised in every branch — the query shape varies, the values never
  // reach SQL as text.
  const where: string[] = [];
  const params: unknown[] = [];
  if (launch) {
    where.push("launch = ?");
    params.push(launch);
  }
  if (kind) {
    where.push("kind = ?");
    params.push(kind);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const { results } = await env.DB.prepare(
    `SELECT id, body, signature, received_at FROM events ${clause}
     ORDER BY received_at DESC, id DESC LIMIT ?`,
  )
    .bind(...params, limit)
    .all<Row>();

  const events = (results ?? []).flatMap((row) => {
    // A row that no longer parses is a storage fault, not something to serve.
    let body: unknown;
    try {
      body = JSON.parse(row.body);
    } catch {
      return [];
    }
    // No `authentic` flag is sent. The client checks every signature itself,
    // and a server-supplied verdict would be a claim it has no standing to
    // make — believing it is exactly the habit this design is trying to avoid.
    return [
      {
        id: row.id,
        signed: { body, signature: row.signature },
        receivedAt: row.received_at,
      },
    ];
  });

  return json({ events });
}

async function readStats(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT kind, COUNT(*) AS n FROM events GROUP BY kind`,
  ).all<{ kind: string; n: number }>();

  const byKind: Record<string, number> = {};
  for (const row of results ?? []) byKind[row.kind] = row.n;

  const total = Object.values(byKind).reduce((a, b) => a + b, 0);
  return json({ total, byKind });
}

function clampLimit(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(value));
}

// ── writes ───────────────────────────────────────────────────────────────────

async function writeEvent(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return error("Event too large.", 413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return error("Body is not JSON.", 400);
  }

  const signed = parsed as SignedActivity;

  // The whole security model, in one call: the same `faultIn` the browser runs.
  // A server-side reimplementation is how a server ends up accepting what the
  // client would reject, so there is exactly one.
  const fault = faultIn(signed);
  if (fault) return error(fault, 400);

  const id = activityId(signed.body);

  // The id is the content digest, so a replay is a primary-key collision rather
  // than a duplicate row. `OR IGNORE` makes publishing idempotent, which the
  // client relies on when it retries a best-effort publish.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO events (id, kind, launch, actor, body, signature, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      signed.body.kind,
      signed.body.launch,
      signed.body.actor,
      JSON.stringify(signed.body),
      signed.signature,
      Math.floor(Date.now() / 1000),
    )
    .run();

  return json({ id }, 201);
}

// ── the certificate ──────────────────────────────────────────────────────────

const HEX = (bytes: number) => new RegExp(`^[0-9a-f]{${bytes * 2}}$`);
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Certify a launch whose registration is paid: the named transaction must pay
 * the platform `REGISTRATION_SATS` and commit to exactly these terms (the mint
 * script's args). It is read from mempool.space — accepted once broadcast, not
 * waiting for a block — so a creator is not held for ten minutes; a
 * registration later double-spent costs the platform one fee, never a miner
 * anything. The signature is deterministic, so asking twice changes nothing.
 */
async function certify(request: Request, env: Env): Promise<Response> {
  if (!env.CERT_KEY) return error("The certificate signer is not configured.", 503);
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return error("Too large.", 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return error("Not JSON.", 400);
  }
  const { args, registration } = body;
  // Terms version 1: version, h0, metadata hash, script length, script (`contracts/mint-core` `LaunchTerms`).
  if (typeof args !== "string" || !/^01([0-9a-f]{2}){37,71}$/.test(args)) return error("Bad terms.", 400);
  const bytes = fromHex(args);
  if (bytes[37] === 0 || bytes[37] > 34 || bytes.length !== 38 + bytes[37]) return error("Bad terms.", 400);
  if (typeof registration !== "string" || !HEX(32).test(registration) || /^0+$/.test(registration)) return error("Bad registration txid.", 400);

  const res = await fetch(`${env.MEMPOOL_API}/tx/${registration}`);
  if (res.status === 404 || res.status === 400) return error("That registration transaction is not known to Bitcoin yet.", 404);
  if (!res.ok) return error("Could not read the registration transaction.", 502);
  const tx = (await res.json()) as { vout?: Array<{ scriptpubkey?: string; value?: number }> };
  const outputs = (tx.vout ?? []).map((o) => ({ scriptHex: o.scriptpubkey ?? "", value: o.value ?? 0 }));
  const fault = registrationFault(outputs, bytes, env.PLATFORM_SCRIPT);
  if (fault) return error(`That transaction does not register this launch: ${fault}.`, 422);

  return json({ certificate: toHex(signCertificate(bytes, registration, fromHex(env.CERT_KEY))) });
}
