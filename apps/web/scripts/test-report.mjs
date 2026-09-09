/* Render the browser suite's latest results into TEST_RESULTS.md.
 *
 * Reads Playwright's JSON report and replaces the section between the
 * `results:start` / `results:end` markers at the repository root. Everything
 * outside the markers is written by hand and left alone, so the narrative and
 * the numbers can live in one document without one overwriting the other.
 *
 *   node scripts/test-report.mjs [path/to/results.json]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

const RESULTS = argv[2] ?? fileURLToPath(new URL("../e2e-output/results.json", import.meta.url));
const DOC = fileURLToPath(new URL("../../../TEST_RESULTS.md", import.meta.url));
const START = "<!-- results:start -->";
const END = "<!-- results:end -->";

const report = JSON.parse(readFileSync(RESULTS, "utf8"));

/** Flatten suites into one row per test and project. */
function collect(suite, path = [], out = []) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const last = t.results.at(-1) ?? {};
      out.push({
        file: spec.file,
        title: [...path, spec.title].join(" › "),
        project: t.projectName,
        status: last.status ?? "skipped",
        ms: last.duration ?? 0,
        ux: (t.annotations ?? []).filter((a) => a.type === "ux").map((a) => a.description),
      });
    }
  }
  for (const child of suite.suites ?? []) collect(child, child.title ? [...path, child.title] : path, out);
  return out;
}

const rows = report.suites.flatMap((s) => collect(s, []));
const byFile = new Map();
for (const r of rows) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);

const icon = { passed: "✅", failed: "❌", timedOut: "❌", skipped: "⏭️", interrupted: "⚠️" };
const total = (s) => rows.filter((r) => r.status === s).length;
const started = new Date(report.stats?.startTime ?? Date.now());

let md = `${START}\n\n`;
md += `_Generated from the last run on ${started.toISOString().slice(0, 16).replace("T", " ")} UTC — `;
md += `${rows.length} tests: ${total("passed")} passed, ${total("failed") + total("timedOut")} failed, ${total("skipped")} skipped._\n\n`;

for (const [file, tests] of byFile) {
  const passed = tests.filter((t) => t.status === "passed").length;
  md += `#### \`${file}\` — ${passed}/${tests.length}\n\n`;
  md += "| | Test | Project | Time |\n|---|---|---|---:|\n";
  for (const t of tests) {
    md += `| ${icon[t.status] ?? t.status} | ${t.title.replace(/\|/g, "\\|")} | ${t.project} | ${(t.ms / 1000).toFixed(1)} s |\n`;
  }
  const notes = tests.flatMap((t) => t.ux);
  if (notes.length > 0) {
    md += "\n" + notes.map((n) => `> ${n}`).join("\n>\n") + "\n";
  }
  md += "\n";
}
md += END;

const doc = readFileSync(DOC, "utf8");
const [before] = doc.split(START);
const after = doc.includes(END) ? doc.split(END)[1] : "\n";
writeFileSync(DOC, `${before}${md}${after}`);
console.log(`TEST_RESULTS.md updated: ${rows.length} tests from ${RESULTS}`);
