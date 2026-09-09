import { configDefaults, defineConfig } from "vitest/config";

// Unit tests live beside the code in src/. The browser suite in e2e/ runs
// under Playwright and must never be collected here: its specs need a real
// page and a running app, and would fail or hang under Vitest.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
