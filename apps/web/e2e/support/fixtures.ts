/* Fixtures every browser test shares.
 *
 *   sim     the simulated chain, installed before the first navigation so no
 *           request can slip out to the real network
 *   app     small verbs over the UI — go somewhere, get a wallet — written
 *           against what a person sees, not against component internals
 *   ux      a place to record experience findings; they end up in
 *           TEST_RESULTS.md next to the pass/fail table
 *
 * A page error fails the test even if every assertion passed. An uncaught
 * exception in the console is a bug a user would hit, whether or not the
 * test happened to be looking at the part of the screen it broke.
 */

import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { ChainSim } from "./chain";

export interface Wallet {
  address: string;
  identity: string;
}

export interface App {
  /** Navigate to a hash route, e.g. `/launch/mesh`. */
  goto(route: string): Promise<void>;
  /** Create a demo key through the wallet page and return what it shows. */
  createDemoKey(): Promise<Wallet>;
  /** Restore a demo key from its 64-hex secret through the wallet page. */
  restoreKey(secretHex: string): Promise<Wallet>;
  /** Pin a launch's opening height before the app first sees it. */
  pinOrigin(launchId: string, height: number): Promise<void>;
  /** Seed arbitrary localStorage before the app loads. */
  seedStorage(entries: Record<string, string>): Promise<void>;
  /** Errors the page raised so far. */
  errors: string[];
}

export interface Ux {
  /** Record something a user would notice — friction, confusion, delight. */
  note(finding: string): void;
}

async function readWallet(page: Page): Promise<Wallet> {
  const address = (await page.locator(".copyable code").first().innerText()).trim();
  await expect(page.getByText(/^Identity/).first()).toBeVisible();
  // The identity row is truncated on screen; read the full key from storage,
  // which is what every signature is made under.
  const identity = await page.evaluate(() => {
    const raw = localStorage.getItem("btcfun:vault:v1");
    return raw ? (JSON.parse(raw) as { identity: string }).identity : "";
  });
  return { address, identity };
}

export const test = base.extend<{ sim: ChainSim; app: App; ux: Ux }>({
  sim: async ({ page }, use) => {
    const sim = new ChainSim();
    await sim.install(page);
    await use(sim);
    expect(sim.unexpected, "the app called provider endpoints the simulator does not know").toEqual([]);
  },

  app: async ({ page, sim }, use) => {
    void sim; // ensure the simulator is installed before anything navigates
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const app: App = {
      errors,
      async goto(route) {
        await page.goto(`/#${route}`);
      },
      async createDemoKey() {
        await page.goto("/#/wallet");
        await page.getByRole("button", { name: "Create a demo key" }).click();
        await expect(page.locator(".copyable code").first()).toHaveText(/^tb1q/);
        return readWallet(page);
      },
      async restoreKey(secretHex) {
        await page.goto("/#/wallet");
        await page.getByRole("button", { name: "Restore from a secret" }).click();
        await page.getByPlaceholder("64 hex characters").fill(secretHex);
        await page.getByRole("button", { name: "Restore", exact: true }).click();
        await expect(page.locator(".copyable code").first()).toHaveText(/^tb1q/);
        return readWallet(page);
      },
      async pinOrigin(launchId, height) {
        await page.addInitScript(
          ([id, h]) => {
            const key = "btcfun:origins:v1";
            const map = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, number>;
            map[id as string] = h as number;
            localStorage.setItem(key, JSON.stringify(map));
          },
          [launchId, height] as const,
        );
      },
      async seedStorage(entries) {
        await page.addInitScript((pairs) => {
          for (const [k, v] of Object.entries(pairs)) localStorage.setItem(k, v);
        }, entries);
      },
    };

    await use(app);
    expect(errors, "the page raised uncaught errors").toEqual([]);
  },

  ux: async ({}, use, testInfo) => {
    await use({
      note(finding) {
        testInfo.annotations.push({ type: "ux", description: finding });
      },
    });
  },
});

/** The value cell of a key/value row, found by the key a person reads. */
export function kv(scope: Page | Locator, key: string | RegExp): Locator {
  return scope.locator("dt").filter({ hasText: key }).first().locator("xpath=following-sibling::dd[1]");
}

/** A displayed amount such as "1,234.5678 MESH" as a number. */
export function amountOf(text: string): number {
  return Number(text.replace(/[^0-9.]/g, ""));
}

export { expect };
