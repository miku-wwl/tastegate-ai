import { P01SummarySchema } from "./p01-profile";
import { QlooServerConfig } from "./server-config";
import { createLocalRawProbeRunner, executeLiveRawProbe, type LocalProbeTransport, type ProbeStore, type ProbeRunOptions } from "./raw-probe-runner";
export type { LocalProbeTransport, ProbeStore, ProbeRequest } from "./raw-probe-runner";

export function createLocalP01Runner(config: QlooServerConfig, transport: LocalProbeTransport, store: ProbeStore) {
  const runner = createLocalRawProbeRunner("P01", config, transport, store);
  return Object.freeze({ async run(options: ProbeRunOptions = {}) { return P01SummarySchema.parse(await runner.run(options)); } });
}
export async function executeLiveP01(options: ProbeRunOptions, store: ProbeStore, config?: QlooServerConfig) {
  return P01SummarySchema.parse(await executeLiveRawProbe("P01", options, store, config));
}
