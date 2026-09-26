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
 * be totalled into a supply or a volume. `src/domain/activity/types.ts` states the
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
 * `.meshkore/docs/hosting.md`.
 */

import { certify } from "./certify";
import { writeEvent } from "./events";
import { readFeed, readStats } from "./feed";
import { error, json } from "./http";

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
