/* Fail when a docs page is older than the code it describes.
 *
 * Each page in `src/docs/sources.json` lists the files whose behaviour it
 * explains. A change to one of them without a change to the page is how
 * documentation drifts into saying something false, so the deploy refuses it
 * (`npm run deploy` runs this first). The fix is to read the page against the
 * change and update it in the same commit — even if only to confirm it still
 * holds, since touching the page is the record that someone checked.
 *
 *   npm run docs:check
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";

import { describe, findStale } from "./docs-check/stale.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MANIFEST = fileURLToPath(new URL("../src/docs/sources.json", import.meta.url));

/** @param {string[]} args */
function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

const { pages } = JSON.parse(readFileSync(MANIFEST, "utf8"));

const stale = findStale(pages, {
  exists: (path) => existsSync(`${ROOT}${path}`),
  lastCommit: (path) => {
    const at = git(["log", "-1", "--format=%ct", "--", path]);
    return at ? Number(at) : null;
  },
  // Untracked files count: a new source is a change like any other.
  isDirty: (path) => git(["status", "--porcelain", "--", path]) !== "",
});

if (stale.length === 0) {
  console.log(`docs:check ✓ ${pages.length} pages are at least as recent as the code they describe.`);
} else {
  console.error(`docs:check ✗ ${stale.length} of ${pages.length} pages are stale:\n`);
  console.error(describe(stale));
  console.error("\nUpdate each page to match its sources, in the same change. See src/docs/sources.json.");
  exit(1);
}
