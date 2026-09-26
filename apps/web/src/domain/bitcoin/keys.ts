/* Key derivation and message signing.
 *
 * 32 bytes of root entropy become a BIP39 mnemonic, a BIP32 master seed and the
 * BIP84 receive key at `m/84'/coin'/0'/0/0`. Standard paths on purpose: the
 * address this produces can be swept by any BIP39 wallet from the same
 * mnemonic, so a visitor's testnet coins are never trapped in this app.
 *
 * `WalletKey` owns secret material and must be wiped. Every function that
 * derives one takes the entropy and returns a handle with `wipe()`; nothing
 * here keeps a module-level copy.
 *
 * WIPING IS BEST-EFFORT, and saying otherwise would be the more dangerous
 * mistake. The byte arrays this module allocates are zeroed — the seed, the
 * BIP32 master and child, the private key — but the BIP39 mnemonic is a
 * JavaScript string, and strings cannot be cleared: it stays readable until the
 * garbage collector happens to reclaim it, and the engine may have copied it
 * before then. The mnemonic exists because BIP39/BIP84 derivation is what makes
 * these coins sweepable by any standard wallet, which is worth more to a
 * visitor than an unswept address would be. See the threat model in
 * `passkey.ts`.
 */

import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { p2wpkh } from "@scure/btc-signer";

import { bytesToHex, hexToBytes } from "@/domain/codec";
import { signDigestWith, verifySignature } from "@/domain/codec";
import { ACTIVE, type NetworkConfig } from "./network";

export interface WalletKey {
  /** secp256k1 private key. Wiped by `wipe()`; never persisted or logged. */
  readonly privateKey: Uint8Array;
  /** 33-byte compressed public key. Safe to publish — it is the identity. */
  readonly publicKey: Uint8Array;
  /** Native SegWit (P2WPKH) receive address for the active network. */
  readonly address: string;
  /** scriptPubKey for that address, needed when signing inputs. */
  readonly script: Uint8Array;
  wipe(): void;
}

/** Derive the primary key from 32 bytes of root entropy. */
export function deriveKey(entropy: Uint8Array, network: NetworkConfig = ACTIVE): WalletKey {
  if (entropy.length !== 32) throw new RangeError("deriveKey: expected 32 bytes of entropy");

  const mnemonic = entropyToMnemonic(entropy, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed);
  seed.fill(0);

  const child = master.derive(network.bip84Path);
  if (!child.privateKey || !child.publicKey) throw new Error("BIP32 derivation produced no key");

  const privateKey = Uint8Array.from(child.privateKey);
  const publicKey = Uint8Array.from(child.publicKey);
  // Both nodes, not just the master: the child holds the same private key this
  // function is about to return, and leaving it live doubles the window.
  child.wipePrivateData();
  master.wipePrivateData();

  const payment = p2wpkh(publicKey, network.params);
  if (!payment.address || !payment.script) throw new Error("Could not derive a P2WPKH address");

  return {
    privateKey,
    publicKey,
    address: payment.address,
    script: payment.script,
    wipe: () => privateKey.fill(0),
  };
}

/** The address for some entropy, without keeping the key around. */
export function deriveAddress(entropy: Uint8Array, network: NetworkConfig = ACTIVE): string {
  const key = deriveKey(entropy, network);
  key.wipe();
  return key.address;
}

/**
 * Sign a 32-byte digest with the wallet key.
 *
 * Compact 64-byte ECDSA, the same curve and encoding Bitcoin uses, so a ledger
 * record and a transaction input are authorised by provably the same key. The
 * caller hashes; this never hashes for you, because signing something you did
 * not hash yourself is how a signature ends up covering the wrong bytes.
 */
export function signDigest(key: WalletKey, digest: Uint8Array): Uint8Array {
  return signDigestWith(key.privateKey, digest);
}

/** Verify a compact signature against a public key. Never throws on bad input. */
export const verifyDigest = verifySignature;

/**
 * The address an identity's key receives at, or null if it is not a key.
 * Links a signed event to the Bitcoin address it names: an order that pays or
 * delivers anywhere else was not written by the owner of that address.
 */
export function addressOfIdentity(identity: string, network: NetworkConfig = ACTIVE): string | null {
  try {
    return p2wpkh(hexToBytes(identity), network.params).address ?? null;
  } catch {
    return null;
  }
}

/** Public key as hex — the stable identity used by ledger records. */
export function identityOf(key: WalletKey): string {
  return bytesToHex(key.publicKey);
}
