/* Creating a launch: sign the announcement, publish it, keep a local copy.
 *
 * A launch is announced once it is registered and certified
 * (`./registration.ts`): the signed announcement (`domain/launches/announcement.ts`)
 * carries the registration and the certificate, so every page — and every
 * miner's first arming — can check them. It goes to the ledger, so others can
 * find it, and a local copy is kept so the creator sees it immediately.
 */

import { signActivity } from "@/domain/activity";
import { commitmentFor, commitmentId, idMatches, validate, type LaunchCommitment, type LaunchDraft, type Registration } from "@/domain/launches";
import type { DeviceStore, Ledger, Vault } from "@/ports";

const LOCAL_KEY = "btcfun:created-launches:v2";
/** Launches kept on the device, newest first. The ledger has the rest. */
const KEEP = 50;

export interface CreatePorts {
  vault: Vault;
  ledger: Pick<Ledger, "record">;
  store: DeviceStore;
}

/** Sign the announcement of a registered, certified launch, keep it locally and publish it. */
export async function createLaunch({ vault, ledger, store }: CreatePorts, draft: LaunchDraft, registration: Registration, certificate: string): Promise<LaunchCommitment> {
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
  // Storage full or refused: the ledger copy still exists, and the page shows it.
  const existing = createdLocally(store).filter((c) => c.id !== commitment.id);
  store.writeList(LOCAL_KEY, [commitment, ...existing].slice(0, KEEP));
  await ledger.record(signed);
  return commitment;
}

/** The launches this device created, newest first — as stored, so re-checked by whoever shows them. */
export function createdLocally(store: DeviceStore): LaunchCommitment[] {
  return store.readList<LaunchCommitment>(LOCAL_KEY);
}
