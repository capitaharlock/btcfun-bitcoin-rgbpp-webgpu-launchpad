/* Creating a launch: sign the announcement, publish it, keep a local copy.
 *
 * A launch is announced once it is registered and certified
 * (`./registration.ts`): the signed announcement (`./announcement.ts`) carries
 * the registration and the certificate, so every page — and every miner's
 * first arming — can check them. It goes to the index, so others can find it,
 * and a local copy is kept so the creator sees it immediately.
 *
 * This file is also the public surface of creating a launch: it re-exports
 * the announcement, the draft, its extras and the registration, so the create
 * page and the Node scripts (`scripts/rgbpp/kit.mjs` loads this path) reach
 * every step through one module.
 */

import { record } from "@/adapters/activity-index";
import { signActivity } from "@/domain/activity";
import type { Vault } from "@/adapters/vault";
import { readStoredList, writeStoredList } from "@/adapters/storage";
import { commitmentId, idMatches, type LaunchCommitment } from "@/domain/launches";
import { commitmentFor, validate, type LaunchDraft } from "@/domain/launches";
import type { Registration } from "./registration";


const LOCAL_KEY = "btcfun:created-launches:v2";

/** Sign the announcement of a registered, certified launch, keep it locally and publish it to the index. */
export async function createLaunch(vault: Vault, draft: LaunchDraft, registration: Registration, certificate: string): Promise<LaunchCommitment> {
  const faults = validate(draft);
  if (Object.keys(faults).length > 0) {
    throw new Error(Object.values(faults)[0] ?? "That launch is not valid.");
  }
  const commitment = commitmentFor(draft, vault.identity, registration, certificate);
  if (!idMatches(commitment)) throw new Error("The certificate does not match this launch.");
  const signed = await signActivity(vault, {
    kind: "launch",
    launch: commitment.id,
    ref: commitmentId(commitment),
    meta: JSON.stringify(commitment),
  });
  remember(commitment);
  await record(signed);
  return commitment;
}

// ── local mirror ─────────────────────────────────────────────────────────────

function remember(commitment: LaunchCommitment): void {
  // Storage full or refused: the index copy still exists, and the page shows it.
  const existing = createdLocally().filter((c) => c.id !== commitment.id);
  writeStoredList(LOCAL_KEY, [commitment, ...existing].slice(0, 50));
}

/** The launches this device created, newest first — as stored, so re-checked by whoever shows them. */
export function createdLocally(): LaunchCommitment[] {
  return readStoredList<LaunchCommitment>(LOCAL_KEY);
}
