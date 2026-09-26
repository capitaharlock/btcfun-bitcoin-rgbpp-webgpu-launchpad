import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

import { TEST_CERT_KEY } from "./src/domain/launches/certificate-key";

// Unit tests live beside the code in src/, and beside the build scripts. The browser suite in e2e/ runs
// under Playwright and must never be collected here: its specs need a real
// page and a running app, and would fail or hang under Vitest.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    exclude: [...configDefaults.exclude, "e2e/**"],
    // Certificates in unit tests are signed with the published test key,
    // as the contract tests build the script to trust (`domain/launches/certificate.ts`).
    env: { VITE_PLATFORM_CERT_KEY: TEST_CERT_KEY },
  },
}));
