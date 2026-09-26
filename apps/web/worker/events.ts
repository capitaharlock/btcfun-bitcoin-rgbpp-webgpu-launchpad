/* Accepting an activity event: `POST /api/activity`.
 *
 * An event is stored only when its signature checks, with the same module the
 * client runs; it is never taken as evidence that what it describes happened.
 */

import { activityId, faultIn } from "../src/domain/activity/verify";
import type { SignedActivity } from "../src/domain/activity/types";
import type { Env } from "./index";
import { error, json, MAX_BODY_BYTES } from "./http";

export async function writeEvent(request: Request, env: Env): Promise<Response> {
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
