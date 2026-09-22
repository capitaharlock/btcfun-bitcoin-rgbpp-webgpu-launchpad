import { configDefaults, defineConfig } from "vitest/config";

// Unit tests live beside the code in src/, and beside the build scripts. The browser suite in e2e/ runs
// under Playwright and must never be collected here: its specs need a real
// page and a running app, and would fail or hang under Vitest.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    exclude: [...configDefaults.exclude, "e2e/**"],
    // Certificates in unit tests are signed with the published test key,
    // as the contract tests build the script to trust (`lib/launches/certificate.ts`).
    env: { VITE_PLATFORM_CERT_KEY: "24653eac434488002cc06bbfb7f10fe18991e35f9fe4302dbea6d2353dc0ab1c" },
  },
});
