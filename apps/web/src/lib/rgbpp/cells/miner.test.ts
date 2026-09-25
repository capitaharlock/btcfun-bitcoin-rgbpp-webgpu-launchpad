import { describe, expect, it } from "vitest";
import { ccc } from "@ckb-ccc/core";

import { decodeMinerCell, encodeMinerCell } from "./miner";

describe("miner cell", () => {
  it("names its ticket only when armed, in the seal's byte order", () => {
    const named = { state: "armed", nonce: 1n, anchor: 2, ticket: "ab" + "00".repeat(31) } as const;
    const hex = encodeMinerCell(named);
    expect(ccc.bytesFrom(hex).length).toBe(45);
    expect(hex.endsWith("00".repeat(31) + "ab")).toBe(true);
    expect(decodeMinerCell(hex)).toEqual(named);
    expect(decodeMinerCell("0x00" + hex.slice(4))).toBeNull();
    expect(() => encodeMinerCell({ ...named, state: "idle" })).toThrow();
  });

  it("is a state byte, a nonce and an anchor, little-endian, as in mint-core", () => {
    const cell = { state: "armed", nonce: 0x0102030405060708n, anchor: 0x0a0b0c0d } as const;
    expect(encodeMinerCell(cell)).toBe("0x0108070605040302010d0c0b0a");
    expect(decodeMinerCell(encodeMinerCell(cell))).toEqual(cell);
    expect(decodeMinerCell("0x" + "00".repeat(9))).toBeNull();
    expect(decodeMinerCell("0x02" + "00".repeat(12))).toEqual({ state: "paid", nonce: 0n, anchor: 0 });
    expect(decodeMinerCell("0x03" + "00".repeat(12))).toBeNull();
  });
});
