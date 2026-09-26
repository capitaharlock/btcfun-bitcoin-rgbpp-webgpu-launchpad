/* The services (`app/services.ts`) as React context.
 *
 * Mounted above every other provider, so the wallet, the registry and the
 * tokens read the chain and the index through the same instances — one CKB
 * cache, one RGB++ token. A test mounts it with its own `services`, and the
 * whole tree runs against fakes without a network.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { buildServices, type Services } from "@/app/services";

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services?: Services; children: ReactNode }) {
  const value = useMemo(() => services ?? buildServices(), [services]);
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error("useServices must be used inside <ServicesProvider>");
  return ctx;
}
