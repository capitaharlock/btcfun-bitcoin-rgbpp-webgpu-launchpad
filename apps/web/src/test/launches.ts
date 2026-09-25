/* Certified launches for tests: registered at a fixed txid and signed with the
 * published test key (`TEST_CERT_SECRET`), which test builds trust. Never
 * imported by the app. */

import { deriveKey } from "../lib/bitcoin/keys";
import { TESTNET3, type NetworkConfig } from "../lib/bitcoin/network";
import { bytesToHex, hexToBytes } from "../lib/bytes";
import type { LaunchCommitment } from "../lib/launches/announcement";
import { registrationCommitment, signCertificate, TEST_CERT_SECRET } from "../lib/launches/certificate";
import { commitmentFor, draftTerms, NO_LINKS, NO_STORY, type LaunchDraft } from "../lib/launches/draft";

/** An identity that announces launches in tests. */
export const TEST_CREATOR = "02" + "11".repeat(32);

/** A complete, valid draft on testnet3, without links, story or image. */
export const meshDraft: LaunchDraft = {
  symbol: "MESH",
  name: "Meshwork",
  blurb: "Community token for a mesh-relay operators' group.",
  accent: "var(--amber)",
  promoter: deriveKey(new Uint8Array(32).fill(7), TESTNET3).address,
  opensInBlocks: 6,
  links: NO_LINKS,
  story: NO_STORY,
  image: "",
};

export const TEST_REGISTRATION_TXID = "ab".repeat(32);

/** The announcement `draft` makes at `tip`, registered and certified as btc.fun's signer would. */
export function certifiedFor(draft: LaunchDraft, creator: string, tip: number, network: NetworkConfig): LaunchCommitment {
  const h0 = tip + draft.opensInBlocks;
  const { args } = draftTerms(draft, h0, network);
  const registration = { txid: TEST_REGISTRATION_TXID, h0, commitment: bytesToHex(registrationCommitment(args)) };
  const certificate = bytesToHex(signCertificate(args, TEST_REGISTRATION_TXID, hexToBytes(TEST_CERT_SECRET)));
  return commitmentFor(draft, creator, registration, certificate, network);
}
