/* Loading the app's own modules in Node.
 *
 * The end-to-end runner has to exercise the *same* code the browser runs —
 * a second implementation of coin selection or challenge derivation would
 * test itself rather than the product. Vite's SSR loader resolves imports
 * exactly as the app does, so `lib/bitcoin/payment.ts` here is the file that
 * ships, extensionless imports and all.
 *
 * No new dependency: Vite is already how this app is built.
 */

import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

let server = null;

/**
 * An in-memory `localStorage`, because several modules legitimately keep a
 * local mirror there — the activity feed, the offer book, created launches.
 *
 * This is a shim for a *browser API Node lacks*, not a substitute for any of
 * the app's own logic: the modules under test still run their real code
 * against it. Without it those paths throw and the runner would be reduced to
 * testing the parts that happen to avoid storage.
 */
function installStorage() {
  if (globalThis.localStorage) return;
  const map = new Map();
  globalThis.localStorage = {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => void map.set(String(k), String(v)),
    removeItem: (k) => void map.delete(String(k)),
    clear: () => map.clear(),
  };
}

/** Start the loader. Call `close()` when the run ends or Node will not exit. */
export async function open() {
  installStorage();
  server ??= await createServer({
    root,
    configFile: false,
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: "custom",
    // The app reads these through `import.meta.env`; in Node there is no
    // index.html to inject them, so they are defined here instead. An unset
    // variable must become the literal `undefined` rather than "", or the
    // `??` defaults in `network.ts` never fire and the API base is empty.
    define: Object.fromEntries(
      ["VITE_BITCOIN_NETWORK", "VITE_MEMPOOL_API", "VITE_API_BASE", "VITE_RP_ID", "VITE_RGBPP_SERVICE"].map((name) => [
        `import.meta.env.${name}`,
        process.env[name] ? JSON.stringify(process.env[name]) : "undefined",
      ]),
    ),
  });
  return server;
}

/** Import one module from `src/`, e.g. `load("lib/bitcoin/payment.ts")`. */
export async function load(path) {
  const s = await open();
  return s.ssrLoadModule(`/src/${path}`);
}

/** Import several at once; returns them in the order given. */
export async function loadAll(...paths) {
  await open();
  return Promise.all(paths.map(load));
}

export async function close() {
  await server?.close();
  server = null;
}
