/* The certificate signer: `POST /api/certify`, the one place btc.fun decides
 * something (decision `2026-09-25-paid-registration-and-certificate`).
 *
 * It decides only whether a launch may exist — never who owns what — and anyone
 * can re-check a certificate and the payment it names from the two chains.
 */

import { registrationFault, signCertificate } from "../src/lib/launches/certificate";
import type { Env } from "./index";
import { error, json, MAX_BODY_BYTES } from "./http";

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
export async function certify(request: Request, env: Env): Promise<Response> {
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
