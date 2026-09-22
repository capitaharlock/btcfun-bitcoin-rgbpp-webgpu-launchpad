import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

import vectors from "../../../../../contracts/vectors/reward.json";
import {
  admissionBytes,
  admitted,
  certificateMessage,
  REGISTRATION_SATS,
  registrationCommitment,
  registrationFault,
  signCertificate,
  TEST_CERT_KEY,
  TEST_CERT_SECRET,
} from "./certificate";

const v = vectors.admission;
const args = hexToBytes(v.args);
// The vector's registration is in internal order; the app names txids as explorers print them.
const registration = bytesToHex(hexToBytes(v.registration).reverse());

describe("a launch's admission", () => {
  it("matches the mint script's vectors, byte for byte", () => {
    expect(TEST_CERT_KEY).toBe(v.key);
    expect(REGISTRATION_SATS).toBe(v.registration_sats);
    expect(bytesToHex(certificateMessage(args, registration))).toBe(v.message);
    expect(bytesToHex(registrationCommitment(args))).toBe(v.commitment);
    expect(bytesToHex(signCertificate(args, registration, hexToBytes(TEST_CERT_SECRET)))).toBe(v.signature);
    expect(bytesToHex(admissionBytes(registration, v.signature))).toBe(v.registration + v.signature);
  });

  it("verifies only for these terms, this registration and this key", () => {
    expect(admitted(args, registration, v.signature, v.key)).toBe(true);
    const other = args.slice();
    other[1] ^= 1;
    expect(admitted(other, registration, v.signature, v.key)).toBe(false);
    expect(admitted(args, "00" + registration.slice(2), v.signature, v.key)).toBe(false);
    expect(admitted(args, registration, "00" + v.signature.slice(2), v.key)).toBe(false);
    expect(admitted(args, registration, "not hex", v.key)).toBe(false);
  });

  it("refuses a genuine signature over no registration, as the mint script does", () => {
    const none = "0".repeat(64);
    const unpaid = bytesToHex(signCertificate(args, none, hexToBytes(TEST_CERT_SECRET)));
    expect(admitted(args, none, unpaid, v.key)).toBe(false);
  });

  it("accepts a registration that pays the platform and commits to the launch", () => {
    const platform = "0014" + "aa".repeat(20);
    const memo = { scriptHex: "6a20" + v.commitment, value: 0 };
    expect(registrationFault([{ scriptHex: platform, value: 20_000 }, memo], args, platform)).toBeNull();
    expect(registrationFault([{ scriptHex: platform, value: 19_999 }, memo], args, platform)).toMatch(/19999/);
    expect(registrationFault([{ scriptHex: platform, value: 20_000 }], args, platform)).toMatch(/commit/);
    expect(registrationFault([{ scriptHex: platform, value: 20_000 }, memo], other(args), platform)).toMatch(/commit/);
  });
});

function other(bytes: Uint8Array): Uint8Array {
  const out = bytes.slice();
  out[2] ^= 1;
  return out;
}
