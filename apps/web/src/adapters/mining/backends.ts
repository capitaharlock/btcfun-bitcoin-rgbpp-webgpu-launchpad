/* The devices this browser can mine with, as the `MiningBackends` port:
 * worker threads always, WebGPU when the browser grants an adapter. */

import type { MiningBackends } from "@/ports";
import { CpuBackend } from "./cpu-backend";
import { GpuBackend } from "./gpu-backend";

export const browserBackends: MiningBackends = {
  cpu: () => new CpuBackend(),
  gpu: () => GpuBackend.create(),
  probe: async () => [CpuBackend.probe(), await GpuBackend.probe()],
};
