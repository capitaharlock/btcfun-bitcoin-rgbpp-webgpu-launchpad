/* The API's response helpers and request bounds, shared by every route. */

/** Largest body we will parse. An activity event is a few hundred bytes. */
export const MAX_BODY_BYTES = 4096;

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export function error(message: string, status: number): Response {
  return json({ error: message }, status);
}
