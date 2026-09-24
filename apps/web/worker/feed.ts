/* Reading the activity feed: `GET /api/activity` and `GET /api/stats`.
 *
 * Rows go back as they were signed, with no verdict attached: the client checks
 * every signature itself (see `index.ts` on why the index is not an authority).
 */

import type { Env } from "./index";
import { json } from "./http";

/** Events returned by one feed request. Bounded so a bad client cannot ask
 *  for the whole table and turn a free tier into a bill. */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 60;

interface Row {
  id: string;
  body: string;
  signature: string;
  received_at: number;
}

export async function readFeed(url: URL, env: Env): Promise<Response> {
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

export async function readStats(env: Env): Promise<Response> {
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
