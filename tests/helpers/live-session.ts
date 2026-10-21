import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runAuthorizedLiveAudit } from "../../src/audit/workflow";
import type { Confirmation, ProviderAuditReport } from "../../src/domain/contracts";
import { openAuthorizedLiveSession } from "../../src/qloo/live-adapter-authorized";
import { approvedGrant } from "./live-grant";
import { QlooServerConfig } from "../../src/qloo/server-config";
import { RECORDED_INSIGHTS_POLICY, getRecordedScenarioInput } from "../../src/scenarios/recorded-nyc";
import { KEY, world, type Seen, type WorldOptions } from "./live-world";

// Runs the authorized-live workflow against the authored provider double in a throwaway root with its own grant. Nothing
// reaches a network; the real adapter, ledger and grant code all run.
export async function runLiveReport(confirmations?: Confirmation[], options: WorldOptions = {}, input: unknown = getRecordedScenarioInput()): Promise<{ report: ProviderAuditReport; seen: Seen }> {
  await mkdir(".artifacts", { recursive: true }); const root = await mkdtemp(resolve(".artifacts/live-model-")); const seen: Seen = [];
  try {
    await mkdir(join(root, "private"), { mode: 0o700 });
    await approvedGrant(root, { maxRuns: 2 });
    const session = await openAuthorizedLiveSession({ projectRoot: root, config: () => QlooServerConfig.load({ QLOO_MODE: "live", QLOO_API_KEY: KEY }), send: world(seen, options) });
    if (session.status !== "AVAILABLE") throw new Error("live session unavailable: " + session.reason);
    try { return { report: await runAuthorizedLiveAudit(input, session.adapter, { scenarioId: "live-model", insightsPolicy: RECORDED_INSIGHTS_POLICY, confirmations }), seen }; }
    finally { session.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
}
