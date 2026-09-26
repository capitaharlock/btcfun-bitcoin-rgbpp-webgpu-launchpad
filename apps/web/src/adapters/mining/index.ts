/* Public surface of `adapters/mining`. Everything another module may use is named here;
 * the files behind it are internal. */

export { CpuBackend } from "./cpu-backend";
export { GpuBackend } from "./gpu-backend";
export { HIT_WORDS, buildKernel } from "./shader";
export type { KernelLayout } from "./shader";
