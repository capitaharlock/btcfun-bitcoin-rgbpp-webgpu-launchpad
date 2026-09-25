/* Paying for a launch, and getting it certified.
 *
 * Creating a launch is paid, once: a Bitcoin transaction pays the platform
 * `REGISTRATION_SATS` and commits to the launch's terms, btc.fun's signer
 * checks it and certifies the terms (`./certificate.ts`), and the mint script
 * lets a miner into a launch only with that certificate.
 *
 * A registration is paid before it is certified, so it is kept on the device
 * the moment it is broadcast (`pendingRegistration`): a reload, a failed
 * certificate request or a second attempt picks it up instead of paying again.
 */

import type { Vault } from "../bitcoin";
import { ACTIVE, type NetworkConfig } from "../bitcoin/network";
import { buildPayment } from "../bitcoin/payment";
import type { Utxo } from "../bitcoin/provider";
import { bytesToHex } from "../bytes";
import { ACTIVE_RGBPP } from "../rgbpp/config";
import { readStoredList, writeStoredList } from "../storage";
import { REGISTRATION_SATS, registrationCommitment } from "./certificate";
import { draftTerms, type LaunchDraft } from "./draft";

/** A registration paid for a draft: its txid and the height the launch opens at, which it committed to. */
export interface Registration {
  txid: string;
  h0: number;
  /** The commitment it carries, hex: which terms it paid for. */
  commitment: string;
}

const REGISTRATION_KEY = "btcfun:registrations:v1";

/**
 * The registration already paid for this draft, if any: same identity and
 * promoter, whatever height it opens at. Paying twice for one launch is the
 * mistake this exists to prevent.
 */
export function pendingRegistration(draft: LaunchDraft, network: NetworkConfig = ACTIVE): Registration | null {
  for (const r of readStoredList<Registration>(REGISTRATION_KEY)) {
    if (bytesToHex(registrationCommitment(draftTerms(draft, r.h0, network).args)) === r.commitment) return r;
  }
  return null;
}

function keepRegistration(r: Registration): void {
  // Storage refused: the txid is still shown on screen and in the wallet's activity.
  writeStoredList(REGISTRATION_KEY, [r, ...readStoredList<Registration>(REGISTRATION_KEY)].slice(0, 20));
}

/** The payment a registration makes: the fee to the platform, committing to the launch. */
export function registrationPayment(draft: LaunchDraft, h0: number, network: NetworkConfig = ACTIVE) {
  return { to: ACTIVE_RGBPP.platformAddress, amountSats: REGISTRATION_SATS, memo: registrationCommitment(draftTerms(draft, h0, network).args) };
}

/**
 * Pay the registration: sign it with the wallet, broadcast it, and keep it
 * before anything else can fail. `utxos` must be plain coins — never a sealed
 * output.
 */
export async function payRegistration(
  vault: Vault,
  draft: LaunchDraft,
  h0: number,
  utxos: readonly Utxo[],
  feeRate: number,
  broadcast: (hex: string) => Promise<string>,
): Promise<Registration> {
  const payment = registrationPayment(draft, h0);
  const signed = await vault.use((key) => buildPayment(key, { ...payment, feeRate, utxos }));
  const txid = await broadcast(signed.hex);
  const registration = { txid, h0, commitment: bytesToHex(payment.memo) };
  keepRegistration(registration);
  return registration;
}

/**
 * The signer has not seen the registration yet. Not a failure: Bitcoin's
 * explorers learn of a transaction seconds after it is sent, so the request is
 * simply repeated.
 */
export class RegistrationNotSeen extends Error {}

/** Ask btc.fun's signer (`origin`, this site by default) for the certificate of a paid registration. */
export async function requestCertificate(draft: LaunchDraft, registration: Registration, origin = ""): Promise<string> {
  const { args } = draftTerms(draft, registration.h0);
  const res = await fetch(`${origin}/api/certify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ args: bytesToHex(args), registration: registration.txid }),
  });
  const body = (await res.json().catch(() => ({}))) as { certificate?: string; error?: string };
  if (res.status === 404) throw new RegistrationNotSeen(body.error ?? "The registration is not known to Bitcoin yet.");
  if (!res.ok || !body.certificate) throw new Error(body.error ?? `The certificate request failed (${res.status}).`);
  return body.certificate;
}

/** How long `certify` keeps asking while Bitcoin has not seen the payment: 5 s apart, 5 minutes in all. */
export const CERTIFY_RETRY = { everyMs: 5_000, tries: 60 };

/** The certificate of a paid registration, asked for again while the signer has not seen the payment. */
export async function certify(
  draft: LaunchDraft,
  registration: Registration,
  { origin = "", retry = CERTIFY_RETRY, signal }: { origin?: string; retry?: typeof CERTIFY_RETRY; signal?: AbortSignal } = {},
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await requestCertificate(draft, registration, origin);
    } catch (err) {
      if (!(err instanceof RegistrationNotSeen) || attempt >= retry.tries || signal?.aborted) throw err;
      await new Promise((r) => setTimeout(r, retry.everyMs));
    }
  }
}
