/* Which docs pages describe code that changed after them.
 *
 * Pure: the git history is passed in as two questions — when was a path last
 * committed, and does it have uncommitted changes — so the rule itself is
 * unit-tested without a repository.
 *
 * The rule, per page:
 *   - a page with uncommitted changes is being updated, so it is current;
 *   - otherwise it is stale when any source has uncommitted changes, or was
 *     last committed after the page was;
 *   - a declared source that no longer exists is always reported: the page
 *     describes something that is gone.
 * Commit times are compared in whole seconds; a source and its page committed
 * together share a commit and so a time.
 */

/**
 * @typedef {{ slug: string; title: string; page: string; sources: string[] }} DocPage
 * @typedef {{
 *   exists(path: string): boolean;
 *   lastCommit(path: string): number | null;
 *   isDirty(path: string): boolean;
 * }} History
 * @typedef {{ source: string; reason: "missing" | "uncommitted" | "newer"; at?: number }} Finding
 * @typedef {{ page: DocPage; findings: Finding[] }} StalePage
 */

/**
 * @param {readonly DocPage[]} pages
 * @param {History} history
 * @returns {StalePage[]}
 */
export function findStale(pages, history) {
  /** @type {StalePage[]} */
  const stale = [];
  for (const page of pages) {
    const pageDirty = history.isDirty(page.page);
    const pageAt = history.lastCommit(page.page);
    /** @type {Finding[]} */
    const findings = [];
    for (const source of page.sources) {
      if (!history.exists(source)) {
        findings.push({ source, reason: "missing" });
        continue;
      }
      if (pageDirty) continue;
      if (history.isDirty(source)) {
        findings.push({ source, reason: "uncommitted" });
        continue;
      }
      const sourceAt = history.lastCommit(source);
      if (sourceAt !== null && (pageAt === null || sourceAt > pageAt)) {
        findings.push({ source, reason: "newer", at: sourceAt });
      }
    }
    if (findings.length > 0) stale.push({ page, findings });
  }
  return stale;
}

/**
 * A report a person can act on: which page, which source, and why.
 * @param {StalePage[]} stale
 */
export function describe(stale) {
  const why = {
    missing: "is declared but no longer exists",
    uncommitted: "has uncommitted changes the page does not",
    newer: "was committed after the page",
  };
  return stale
    .map(({ page, findings }) =>
      [
        `✗ ${page.title} (${page.page})`,
        ...findings.map((f) => `    ${f.source} ${why[f.reason]}${f.at ? ` (${new Date(f.at * 1000).toISOString()})` : ""}`),
      ].join("\n"),
    )
    .join("\n");
}
