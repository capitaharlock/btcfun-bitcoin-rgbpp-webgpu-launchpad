/* Build-time configuration, read in one place.
 *
 * Vite inlines `import.meta.env` into the browser build; the Worker bundle and
 * Node (unit tests, the testnet scripts) have no such object, so the same names
 * fall back to `process.env`. Typed without Vite's client types on purpose: the
 * rules that read a network name or a service URL compile in every runtime.
 */

type Env = Record<string, string | undefined>;

export function env(name: `VITE_${string}`): string | undefined {
  const meta = (import.meta as { env?: Env }).env;
  const proc = (globalThis as { process?: { env?: Env } }).process?.env;
  return meta?.[name] ?? proc?.[name];
}
