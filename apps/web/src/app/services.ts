/* The composition root: the one place adapters are chosen for ports.
 *
 * Everything above this — providers, hooks, use cases, pages — takes its
 * chain, gateway, ledger and stores from `useServices()` and never names an
 * adapter. So swapping mempool.space for a node, or the public RGB++ queue
 * for the operator's, is a change here and nowhere else, and a test hands
 * the same interfaces fakes. The configuration is the build's:
 * `domain/bitcoin/network` `ACTIVE` and `domain/rgbpp/config` `ACTIVE_RGBPP`.
 */

import { ActivityIndex, httpCertifier } from "@/adapters/activity-index";
import { ckbCells } from "@/adapters/ckb";
import { mempoolProvider } from "@/adapters/mempool";
import { browserBackends } from "@/adapters/mining";
import { RgbppService } from "@/adapters/rgbpp";
import { browserStore, progressStore } from "@/adapters/storage";
import { env } from "@/config/env";
import { ACTIVE } from "@/domain/bitcoin";
import type { ProgressStore } from "@/domain/mining";
import { ACTIVE_RGBPP } from "@/domain/rgbpp";
import type { Certifier, ChainProvider, CkbCells, DeviceStore, Ledger, MiningBackends, RgbppGateway } from "@/ports";

export interface Services {
  chain: ChainProvider;
  rgbpp: RgbppGateway;
  ckb: CkbCells;
  ledger: Ledger;
  certifier: Certifier;
  storage: DeviceStore;
  /** Mining progress per ticket, over `storage`. */
  progress: ProgressStore;
  mining: MiningBackends;
}

/** The services of a browser build. Built once, by `ServicesProvider`. */
export function buildServices(): Services {
  const storage = browserStore;
  return {
    chain: mempoolProvider(ACTIVE),
    rgbpp: new RgbppService(ACTIVE_RGBPP),
    ckb: ckbCells(ACTIVE_RGBPP.ckbRpc),
    ledger: new ActivityIndex(storage, env("VITE_API_BASE") ?? ""),
    certifier: httpCertifier(),
    storage,
    progress: progressStore(storage),
    mining: browserBackends,
  };
}
