/* The dependency rules of the hexagonal layout, checked on every run.
 *
 * A layout is only an architecture while its boundaries hold, and boundaries
 * erode one convenient import at a time. This test reads every module's
 * imports and fails on the first one that points the wrong way, so the rules
 * in `.meshkore/context/architecture.md` are enforced rather than described:
 *
 *   domain    the rules; imports nothing above it and does no I/O
 *   ports     the interfaces the application needs from outside; only domain
 *   adapters  one per external technology; domain and ports
 *   app       composition, providers, hooks, use cases; adapters only where
 *             they are constructed (`app/services.ts`, `app/providers/`)
 *   ui        the design system; domain for formatting, never the app
 *   features  feature components; the app, never an adapter
 *   pages     route targets; the same as features, plus docs
 *   docs      the public documentation describes the application, so it may
 *             read the app's constants and hooks like a page does
 *
 * Cross-module imports name the module (`@/domain/rgbpp`), never a file inside
 * it: a module's public surface is its barrel.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname);

type Layer = "domain" | "ports" | "adapters" | "app" | "ui" | "features" | "pages" | "docs" | "config" | "test" | "root";

const ALLOWED: Record<Layer, readonly Layer[]> = {
  config: [],
  domain: ["domain", "config"],
  ports: ["ports", "domain"],
  adapters: ["adapters", "ports", "domain", "config"],
  app: ["app", "ports", "domain", "ui", "config", "adapters"],
  ui: ["ui", "domain", "config"],
  features: ["features", "app", "ports", "domain", "ui", "config"],
  pages: ["pages", "features", "app", "ports", "domain", "ui", "docs", "config"],
  docs: ["docs", "features", "app", "domain", "ui", "config"],
  test: ["test", "domain", "ports", "adapters", "app", "ui", "features", "config"],
  root: ["app", "ui", "features", "pages", "domain", "config"],
};

/** Where adapters may be constructed; everything else reaches them through `useServices`. */
const COMPOSITION_ROOTS = [/^app\/services\.ts$/, /^app\/providers\//];

/** Modules whose barrel is the only public surface. */
const BARRELLED = /^(domain|ports|adapters)\/[^/]+$/;

/** What a domain module must never do itself. */
const IO_IN_DOMAIN = [/\bfetch\(/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bwindow\./, /\bdocument\./, /import\.meta\.env/, /from "react"/];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(p);
  }
  return out;
}

function layerOf(rel: string): Layer {
  const head = rel.split("/")[0];
  if (!rel.includes("/")) return "root";
  return (["domain", "ports", "adapters", "app", "ui", "features", "pages", "docs", "config", "test"] as const).find((l) => l === head) ?? "root";
}

function moduleOf(rel: string): string {
  const parts = rel.split("/");
  return parts.length >= 3 ? parts.slice(0, 2).join("/") : parts[0];
}

const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"|import\(\s*"([^"]+)"\s*\)|^\s*import\s+"([^"]+)"/gm;

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(IMPORT)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** A specifier as a src-relative path without extension, or null for packages. */
function targetOf(file: string, spec: string): string | null {
  if (spec.startsWith("@/")) return spec.slice(2).replace(/\.(css|json|tsx?)$/, "");
  if (spec.startsWith(".")) return relative(SRC, resolve(dirname(file), spec)).replace(/\.(css|json|tsx?)$/, "");
  return null;
}

const files = walk(SRC).filter((f) => !/\.test\.tsx?$/.test(f) && !f.endsWith("architecture.test.ts"));

describe("architecture", () => {
  it("every layer imports only the layers below it", () => {
    const faults: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file);
      const from = layerOf(rel);
      for (const spec of importsOf(file)) {
        const target = targetOf(file, spec);
        if (target === null || target.startsWith("..")) continue;
        const to = layerOf(target);
        if (to === "root") continue;
        if (!ALLOWED[from].includes(to)) faults.push(`${rel} → ${spec} (${from} may not depend on ${to})`);
        if (to === "adapters" && from === "app" && !COMPOSITION_ROOTS.some((r) => r.test(rel))) {
          faults.push(`${rel} → ${spec} (adapters are constructed in app/services.ts and the providers only)`);
        }
      }
    }
    expect(faults).toEqual([]);
  });

  it("cross-module imports go through the module's barrel", () => {
    const faults: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file);
      for (const spec of importsOf(file)) {
        if (!spec.startsWith("@/")) continue;
        const target = spec.slice(2);
        const mod = moduleOf(target);
        if (!BARRELLED.test(mod)) continue;
        if (target !== mod && moduleOf(rel) !== mod) faults.push(`${rel} → ${spec} (import @/${mod})`);
      }
    }
    expect(faults).toEqual([]);
  });

  it("the domain does no I/O of its own", () => {
    const faults: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file);
      if (layerOf(rel) !== "domain") continue;
      const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      for (const rule of IO_IN_DOMAIN) if (rule.test(text)) faults.push(`${rel} matches ${rule}`);
    }
    expect(faults).toEqual([]);
  });
});
