/* Bitcoin network configuration.
 *
 * A config object rather than scattered constants, because mainnet is a stated
 * future step (`.meshkore/docs/roadmap.md` Phase 4) and the difference between
 * networks is exactly this data: derivation coin type, address prefix, API base
 * and explorer URLs. Call sites take a `NetworkConfig`; none of them branch on
 * the network name.
 *
 * Testnet3 is the demo network because it is the one the public RGB++
 * services verify: the Bitcoin SPV client on CKB testnet follows testnet3, and
 * no RGB++ deployment follows testnet4. Testnet4 remains selectable for the
 * earlier ticket experiments. Nothing here may be pointed at mainnet before the
 * real-fund review gate.
 */

import { NETWORK, TEST_NETWORK, type BTC_NETWORK } from "@scure/btc-signer/utils";

export type NetworkId = "testnet3" | "testnet4" | "mainnet";

export interface NetworkConfig {
  id: NetworkId;
  /** Human label for badges. */
  label: string;
  /** @scure/btc-signer network parameters (address version bytes, bech32 hrp). */
  params: BTC_NETWORK;
  /** BIP84 account path for the primary receive key. */
  bip84Path: string;
  /** Expected bech32 prefix — used to reject a cached cross-network address. */
  addressPrefix: string;
  /** mempool.space REST base. */
  api: string;
  /** Where to send people to inspect a transaction or address. */
  explorer: string;
  /** Where a visitor gets coins. Empty on mainnet, obviously. */
  faucets: ReadonlyArray<{ name: string; url: string }>;
}

export const TESTNET3: NetworkConfig = {
  id: "testnet3",
  label: "testnet3",
  params: TEST_NETWORK,
  bip84Path: "m/84'/1'/0'/0/0",
  addressPrefix: "tb1",
  api: import.meta.env.VITE_MEMPOOL_API ?? "https://mempool.space/testnet/api",
  explorer: "https://mempool.space/testnet",
  faucets: [
    { name: "coinfaucet.eu", url: "https://coinfaucet.eu/en/btc-testnet/" },
    { name: "bitcoinfaucet.uo1.net", url: "https://bitcoinfaucet.uo1.net/" },
  ],
};

export const TESTNET4: NetworkConfig = {
  id: "testnet4",
  label: "testnet4",
  params: TEST_NETWORK,
  bip84Path: "m/84'/1'/0'/0/0",
  addressPrefix: "tb1",
  api: import.meta.env.VITE_MEMPOOL_API ?? "https://mempool.space/testnet4/api",
  explorer: "https://mempool.space/testnet4",
  faucets: [
    { name: "mempool.space", url: "https://mempool.space/testnet4/faucet" },
    { name: "faucet.testnet4.dev", url: "https://faucet.testnet4.dev" },
  ],
};

export const MAINNET: NetworkConfig = {
  id: "mainnet",
  label: "mainnet",
  params: NETWORK,
  bip84Path: "m/84'/0'/0'/0/0",
  addressPrefix: "bc1",
  api: "https://mempool.space/api",
  explorer: "https://mempool.space",
  faucets: [],
};

/**
 * The network this build talks to.
 *
 * Deliberately not switchable at runtime: a UI toggle between testnet and
 * mainnet is how people sign a mainnet transaction believing it is a test.
 * Changing network is a build decision.
 */
export const ACTIVE: NetworkConfig =
  import.meta.env.VITE_BITCOIN_NETWORK === "mainnet"
    ? MAINNET
    : import.meta.env.VITE_BITCOIN_NETWORK === "testnet4"
      ? TESTNET4
      : TESTNET3;

export function txUrl(txid: string, network: NetworkConfig = ACTIVE): string {
  return `${network.explorer}/tx/${txid}`;
}

export function addressUrl(address: string, network: NetworkConfig = ACTIVE): string {
  return `${network.explorer}/address/${address}`;
}

/** True if an address belongs to this network, by bech32 prefix. */
export function matchesNetwork(address: string, network: NetworkConfig = ACTIVE): boolean {
  return address.startsWith(network.addressPrefix);
}

/** Relay dust threshold for P2WPKH. Outputs below this are non-standard. */
export const DUST_SATS = 294;

/** Fee rate used when the API cannot be reached, in sat/vB. */
export const FALLBACK_FEE_RATE = 1;
