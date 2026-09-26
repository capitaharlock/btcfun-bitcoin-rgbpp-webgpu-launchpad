import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bytesToHex } from "@/domain/codec";
import { deriveAddress } from "@/domain/bitcoin";
import { MAINNET, TESTNET3 } from "@/domain/bitcoin";
import { connectDemo, createLocal, current, demoEntropy, exportLocalSecret, forget } from "./vault";

/** The address the shared demo wallet is funded at; published in the UI and the docs. */
const DEMO_ADDRESS = "tb1qjjq482m9pj7dvge0l2r07a3fcyflktrzgzf6tz";

/** A Map-backed localStorage: the vault's only persistence, absent under Node. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("demo vault", () => {
  it("derives the published testnet3 address", () => {
    expect(deriveAddress(demoEntropy(TESTNET3), TESTNET3)).toBe(DEMO_ADDRESS);
  });

  it("hands out a fresh copy, so a caller's wipe cannot zero the next use", () => {
    const first = demoEntropy(TESTNET3);
    first.fill(0);
    expect(bytesToHex(demoEntropy(TESTNET3))).not.toBe("00".repeat(32));
  });

  it("connects without storing any secret, and survives a reload", async () => {
    const vault = await connectDemo(TESTNET3);
    expect(vault.kind).toBe("demo");
    expect(vault.address).toBe(DEMO_ADDRESS);
    expect(vault.identity).toMatch(/^0[23][0-9a-f]{64}$/);
    expect(localStorage.getItem("btcfun:vault:v1")).not.toMatch(/secret/);
    expect(exportLocalSecret()).toBeNull();
    expect(current()?.address).toBe(DEMO_ADDRESS);
  });

  it("signs with the key its address was derived from", async () => {
    const vault = await connectDemo(TESTNET3);
    expect(await vault.use((key) => key.address)).toBe(DEMO_ADDRESS);
  });

  it("refuses mainnet, where a public key would be an open till", async () => {
    expect(() => demoEntropy(MAINNET)).toThrow(/only on testnet3/);
    await expect(connectDemo(MAINNET)).rejects.toThrow(/only on testnet3/);
    expect(current()).toBeNull();
  });
});

describe("log out", () => {
  it("forgets a demo wallet", async () => {
    await connectDemo(TESTNET3);
    forget();
    expect(current()).toBeNull();
  });

  it("forgets a browser-stored wallet and its secret", async () => {
    const vault = await createLocal();
    expect(exportLocalSecret()).toHaveLength(32);
    expect(current()?.address).toBe(vault.address);
    forget();
    expect(current()).toBeNull();
    expect(exportLocalSecret()).toBeNull();
  });

  it("leaves records that belong to an address, not to the session", async () => {
    await connectDemo(TESTNET3);
    localStorage.setItem("btcfun:operations:v1", "{}");
    forget();
    expect(localStorage.getItem("btcfun:operations:v1")).toBe("{}");
  });
});
