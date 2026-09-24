import { describe as suite, expect, it } from "vitest";

import { describe, findStale } from "./stale.mjs";

const page = { slug: "mint", title: "The mint circuit", page: "docs/mint", sources: ["ops.ts", "script.rs"] };

/** A history where every path is committed at the given time and clean unless listed. */
function history(times, dirty = [], missing = []) {
  return {
    exists: (p) => !missing.includes(p),
    lastCommit: (p) => times[p] ?? null,
    isDirty: (p) => dirty.includes(p),
  };
}

suite("docs staleness", () => {
  it("passes a page committed with or after its sources", () => {
    expect(findStale([page], history({ "docs/mint": 200, "ops.ts": 200, "script.rs": 100 }))).toEqual([]);
  });

  it("flags a source committed after the page", () => {
    const [stale] = findStale([page], history({ "docs/mint": 200, "ops.ts": 300, "script.rs": 100 }));
    expect(stale.findings).toEqual([{ source: "ops.ts", reason: "newer", at: 300 }]);
  });

  it("flags an uncommitted source when the page is untouched", () => {
    const [stale] = findStale([page], history({ "docs/mint": 200, "ops.ts": 100, "script.rs": 100 }, ["script.rs"]));
    expect(stale.findings).toEqual([{ source: "script.rs", reason: "uncommitted" }]);
  });

  it("treats a page being edited as current", () => {
    expect(findStale([page], history({ "docs/mint": 100, "ops.ts": 300 }, ["docs/mint", "ops.ts"]))).toEqual([]);
  });

  it("treats a never-committed page with committed sources as stale", () => {
    expect(findStale([page], history({ "ops.ts": 300 }))).toHaveLength(1);
  });

  it("always reports a declared source that is gone", () => {
    const [stale] = findStale([page], history({}, ["docs/mint"], ["script.rs"]));
    expect(stale.findings).toEqual([{ source: "script.rs", reason: "missing" }]);
  });

  it("names the page and the reason in its report", () => {
    const report = describe(findStale([page], history({ "docs/mint": 200, "ops.ts": 300 })));
    expect(report).toContain("The mint circuit (docs/mint)");
    expect(report).toContain("ops.ts was committed after the page");
  });
});
