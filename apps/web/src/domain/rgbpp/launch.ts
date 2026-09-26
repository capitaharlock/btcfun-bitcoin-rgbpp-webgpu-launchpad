/* A launch's identity on CKB.
 *
 * The launch terms are the mint script's args (`contracts/mint-core`
 * `LaunchTerms`), and the token is the xUDT whose owner is that script's hash.
 * So the token's type hash commits to the opening height, the promoter's
 * address and the metadata hash: change any of them and it is a different
 * token. There is nothing else to configure — the economics are the standard
 * (`../standard.ts`) and are compiled into the script.
 *
 *   version u8 = 1 | h0 u32 LE | metadata hash [32] | promoter script len u8 | promoter script
 */

import { ccc } from "@ckb-ccc/core";
import { Address, OutScript } from "@scure/btc-signer";

import { ACTIVE, type NetworkConfig } from "@/domain/bitcoin";
import { canonicalDigest } from "@/domain/codec";
import type { RgbppConfig } from "./config";

export const TERMS_VERSION = 1;
/** P2TR and P2WSH scripts are 34 bytes; nothing standard is longer. */
export const MAX_PROMOTER_SCRIPT = 34;
/** xUDT flag: owner mode when an input's type hash equals the owner (RFC 0052). */
export const OWNER_BY_INPUT_TYPE = 0x8000_0000;

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  /** SHA-256 of the image bytes, hex, or empty when there is no image. */
  imageHash: string;
}

export interface LaunchTerms {
  /** Bitcoin height at which minting opens and the halving clock starts. */
  h0: number;
  metadataHash: Uint8Array;
  /** The scriptPubKey every ticket pays. */
  promoterScript: Uint8Array;
}

export function metadataHash(meta: TokenMetadata): Uint8Array {
  return canonicalDigest([
    ["v", "btcfun/token/1"],
    ["name", meta.name],
    ["symbol", meta.symbol],
    ["description", meta.description],
    ["image", meta.imageHash],
  ]);
}

export function promoterScriptFor(address: string, network: NetworkConfig = ACTIVE): Uint8Array {
  return OutScript.encode(Address(network.params).decode(address));
}

export function encodeTerms(terms: LaunchTerms): Uint8Array {
  if (!Number.isInteger(terms.h0) || terms.h0 < 0 || terms.h0 > 0xffff_ffff) {
    throw new RangeError(`h0 out of range: ${terms.h0}`);
  }
  if (terms.metadataHash.length !== 32) throw new RangeError("the metadata hash is 32 bytes");
  const script = terms.promoterScript;
  if (script.length === 0 || script.length > MAX_PROMOTER_SCRIPT) {
    throw new RangeError(`promoter script must be 1..${MAX_PROMOTER_SCRIPT} bytes`);
  }
  return ccc.bytesConcat(
    [TERMS_VERSION],
    ccc.numLeToBytes(terms.h0, 4),
    terms.metadataHash,
    [script.length],
    script,
  );
}

export function decodeTerms(args: ccc.BytesLike): LaunchTerms {
  const bytes = ccc.bytesFrom(args);
  if (bytes[0] !== TERMS_VERSION) throw new RangeError(`unknown launch terms version ${bytes[0]}`);
  if (bytes.length < 38) throw new RangeError("launch terms are truncated");
  const length = bytes[37];
  if (length === 0 || length > MAX_PROMOTER_SCRIPT || bytes.length !== 38 + length) {
    throw new RangeError("launch terms carry a malformed promoter script");
  }
  return {
    h0: Number(ccc.numLeFromBytes(bytes.slice(1, 5))),
    metadataHash: bytes.slice(5, 37),
    promoterScript: bytes.slice(38),
  };
}

export function mintScript(config: RgbppConfig, terms: LaunchTerms): ccc.Script {
  return ccc.Script.from({ ...config.mint, args: encodeTerms(terms) });
}

export function tokenScript(config: RgbppConfig, mint: ccc.Script): ccc.Script {
  return ccc.Script.from({
    ...config.xudt,
    args: ccc.bytesConcat(ccc.bytesFrom(mint.hash()), ccc.numLeToBytes(OWNER_BY_INPUT_TYPE, 4)),
  });
}

/** The token's permanent identifier: its xUDT type hash. */
export function tokenId(config: RgbppConfig, terms: LaunchTerms): ccc.Hex {
  return tokenScript(config, mintScript(config, terms)).hash();
}
