/* What a registration is, and what it pays.
 *
 * Creating a launch is paid, once: a Bitcoin transaction pays the platform
 * `REGISTRATION_SATS` and commits to the launch's terms (`certificate.ts`
 * `registrationCommitment`), and btc.fun's signer certifies those terms once
 * it has seen the payment. The rules here are what a payment must contain and
 * how a kept registration is matched back to the draft it paid for; paying,
 * keeping and certifying are the app's (`app/launches/registration.ts`).
 */

import { ACTIVE, type NetworkConfig } from "@/domain/bitcoin";
import { bytesToHex } from "@/domain/codec";
import { ACTIVE_RGBPP, type RgbppConfig } from "@/domain/rgbpp";
import { REGISTRATION_SATS, registrationCommitment } from "./certificate";
import { draftTerms, type LaunchDraft } from "./draft";

/** A registration paid for a draft: its txid and the height the launch opens at, which it committed to. */
export interface Registration {
  txid: string;
  h0: number;
  /** The commitment it carries, hex: which terms it paid for. */
  commitment: string;
}

/** The payment a registration makes: the fee to the platform, committing to the launch. */
export function registrationPayment(draft: LaunchDraft, h0: number, network: NetworkConfig = ACTIVE, config: RgbppConfig = ACTIVE_RGBPP) {
  return { to: config.platformAddress, amountSats: REGISTRATION_SATS, memo: registrationCommitment(draftTerms(draft, h0, network).args) };
}

/**
 * Whether `registration` paid for `draft`: same identity and promoter, at the
 * height the registration committed to. Paying twice for one launch is the
 * mistake this exists to prevent.
 */
export function paidFor(registration: Registration, draft: LaunchDraft, network: NetworkConfig = ACTIVE): boolean {
  return bytesToHex(registrationCommitment(draftTerms(draft, registration.h0, network).args)) === registration.commitment;
}
