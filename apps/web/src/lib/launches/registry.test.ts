import { describe, expect, it } from "vitest";
import type { LaunchCommitment } from "./create";
import { resolveAnnouncements } from "./registry";

const launch = (id: string, creator: string, name: string): LaunchCommitment =>
  ({ id, creator, name }) as unknown as LaunchCommitment;

describe("resolveAnnouncements", () => {
  it("keeps the first announcer as the creator, whatever a later copycat signs", () => {
    const [only] = resolveAnnouncements([], [
      { commitment: launch("pizza-1", "copycat", "Fake links"), receivedAt: 20 },
      { commitment: launch("pizza-1", "creator", "Pizza Day"), receivedAt: 10 },
    ]);
    expect(only?.name).toBe("Pizza Day");
  });

  it("lets the creator update, newest by arrival", () => {
    const [only] = resolveAnnouncements([], [
      { commitment: launch("pizza-1", "creator", "v1"), receivedAt: 10 },
      { commitment: launch("pizza-1", "creator", "v2"), receivedAt: 30 },
      { commitment: launch("pizza-1", "copycat", "v3"), receivedAt: 40 },
    ]);
    expect(only?.name).toBe("v2");
  });

  it("shows a local announcement until the index has one, and never over another creator's", () => {
    expect(resolveAnnouncements([launch("new-1", "me", "Mine")], []).map((c) => c.name)).toEqual(["Mine"]);
    const shown = resolveAnnouncements([launch("pizza-1", "me", "Mine")], [
      { commitment: launch("pizza-1", "creator", "Pizza Day"), receivedAt: 10 },
    ]);
    expect(shown.map((c) => c.name)).toEqual(["Pizza Day"]);
  });
});
