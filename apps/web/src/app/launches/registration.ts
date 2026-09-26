/* Paying for a launch, and getting it certified.
 *
 * What a registration is and pays is `domain/launches/registration.ts`. This
 * is the doing: sign and broadcast the payment, keep it on the device the
 * moment it is broadcast, and ask the signer for the certificate — again,
 * while Bitcoin has not shown it the payment.
 *
 * A registration is paid before it is certified, so it is kept the moment it
 * is broadcast (`pendingRegistration`): a reload, a failed certificate request
 * or a second attempt picks it up instead of paying again.
 */

import { ACTIVE, buildPayment, type NetworkConfig, type Utxo } from "@/domain/bitcoin";
import { bytesToHex } from "@/domain/codec";
import { draftTerms, paidFor, registrationPayment, type LaunchDraft, type Registration } from "@/domain/launches";
import { RegistrationNotSeen, type Certifier, type DeviceStore, type Vault } from "@/ports";

export type { Registration } from "@/domain/launches";

const REGISTRATION_KEY = "btcfun:registrations:v1";
/** Registrations kept on the device. Older ones are in the wallet's activity. */
const KEEP = 20;

/** The registration already paid for this draft, if any. */
export function pendingRegistration(store: DeviceStore, draft: LaunchDraft, network: NetworkConfig = ACTIVE): Registration | null {
  return store.readList<Registration>(REGISTRATION_KEY).find((r) => paidFor(r, draft, network)) ?? null;
}

export interface PaymentPorts {
  vault: Vault;
  store: DeviceStore;
  /** Where the payment goes out. The RGB++ gateway's broadcast, in the app. */
  broadcast: (hex: string) => Promise<string>;
}

/**
 * Pay the registration: sign it with the wallet, broadcast it, and keep it
 * before anything else can fail. `utxos` must be plain coins — never a sealed
 * output.
 */
export async function payRegistration(
  { vault, store, broadcast }: PaymentPorts,
  draft: LaunchDraft,
  h0: number,
  utxos: readonly Utxo[],
  feeRate: number,
  network: NetworkConfig = ACTIVE,
): Promise<Registration> {
  const payment = registrationPayment(draft, h0, network);
  const signed = await vault.use((key) => buildPayment(key, { ...payment, feeRate, utxos }));
  const txid = await broadcast(signed.hex);
  const registration = { txid, h0, commitment: bytesToHex(payment.memo) };
  // Storage refused: the txid is still shown on screen and in the wallet's activity.
  store.writeList(REGISTRATION_KEY, [registration, ...store.readList<Registration>(REGISTRATION_KEY)].slice(0, KEEP));
  return registration;
}

/** How long `certify` keeps asking while Bitcoin has not seen the payment: 5 s apart, 5 minutes in all. */
export const CERTIFY_RETRY = { everyMs: 5_000, tries: 60 };

/** The certificate of a paid registration, asked for again while the signer has not seen the payment. */
export async function certify(
  certifier: Certifier,
  draft: LaunchDraft,
  registration: Registration,
  { retry = CERTIFY_RETRY, signal, network = ACTIVE }: { retry?: typeof CERTIFY_RETRY; signal?: AbortSignal; network?: NetworkConfig } = {},
): Promise<string> {
  const { args } = draftTerms(draft, registration.h0, network);
  for (let attempt = 1; ; attempt++) {
    try {
      return await certifier.certify(args, registration.txid);
    } catch (err) {
      if (!(err instanceof RegistrationNotSeen) || attempt >= retry.tries || signal?.aborted) throw err;
      await new Promise((r) => setTimeout(r, retry.everyMs));
    }
  }
}
