/* Certified launches for tests: registered at a fixed txid and signed with the
 * published test key (`TEST_CERT_SECRET`), which test builds trust. Never
 * imported by the app. */

import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

import type { NetworkConfig } from "../bitcoin/network";
import { registrationCommitment, signCertificate, TEST_CERT_SECRET } from "./certificate";
import { commitmentFor, draftTerms, type LaunchCommitment, type LaunchDraft } from "./create";

export const TEST_REGISTRATION_TXID = "ab".repeat(32);

/** The announcement `draft` makes at `tip`, registered and certified as btc.fun's signer would. */
export function certifiedFor(draft: LaunchDraft, creator: string, tip: number, network: NetworkConfig): LaunchCommitment {
  const h0 = tip + draft.opensInBlocks;
  const { args } = draftTerms(draft, h0, network);
  const registration = { txid: TEST_REGISTRATION_TXID, h0, commitment: bytesToHex(registrationCommitment(args)) };
  const certificate = bytesToHex(signCertificate(args, TEST_REGISTRATION_TXID, hexToBytes(TEST_CERT_SECRET)));
  return commitmentFor(draft, creator, registration, certificate, network);
}
