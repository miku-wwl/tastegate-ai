import { loadRecordedEvidence } from "../../../src/qloo/recorded-adapter";
import { sendNative } from "../../../src/qloo/live-transport";
import { QlooServerConfig } from "../../../src/qloo/server-config";
import { createAuditService } from "../../../src/server/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// All policy lives in src/server/audit-service.ts. The browser never supplies a mode implementation, provenance, budget,
// policy, path, provider ID or credential; the owner's private captures and live grant are read from the server's working
// directory only.
const service = createAuditService({
  projectRoot: process.cwd(),
  recordings: () => loadRecordedEvidence(process.cwd()),
  liveConfig: () => QlooServerConfig.load(),
  send: sendNative,
  // Set TASTEGATE_DISABLE_LIVE=1 on any server that must never make a live request (public deployments, automated browser tests).
  liveDisabled: () => process.env.TASTEGATE_DISABLE_LIVE === "1",
});

export async function GET(): Promise<Response> { return service.catalog(); }
export async function POST(request: Request): Promise<Response> { return service.audit(request); }
