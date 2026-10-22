import { loadRecordedEvidence, RecordedEvidenceUnavailableError } from "../../../src/qloo/recorded-adapter";
import { sendNative } from "../../../src/qloo/live-transport";
import { QlooServerConfig } from "../../../src/qloo/server-config";
import { createAuditService } from "../../../src/server/audit-service";
import { resolveRuntimeProfile } from "../../../src/server/runtime-profile";
import { loadP07Recordings } from "../../../src/qloo/p07-recording";
import { loadOfficialReferences } from "../../../src/qloo/official-reference-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// All policy lives in src/server/audit-service.ts. The browser never supplies a mode implementation, provenance, budget,
// policy, path, provider ID or credential; the owner's private captures and live grant are read from the server's working
// directory only, and only if this server's runtime profile allows it (src/server/runtime-profile.ts): a public-facing profile
// never loads a private recording and never makes a live request, whatever files or variables exist on the host. An invalid
// configuration resolves to the most restrictive profile (fail closed) and is reported by /api/health.
const resolved = resolveRuntimeProfile(process.env);
const service = createAuditService({
  projectRoot: process.cwd(),
  recordings: () => resolved.capabilities.recorded_replay ? loadRecordedEvidence(process.cwd()) : Promise.reject(new RecordedEvidenceUnavailableError()),
  p07Recordings: () => resolved.capabilities.recorded_replay ? loadP07Recordings(process.cwd()) : Promise.reject(new RecordedEvidenceUnavailableError()),
  officialReferences: () => resolved.capabilities.recorded_replay ? loadOfficialReferences(process.cwd(), ["www.guggenheim.org","whc.unesco.org"]) : Promise.resolve(new Map()),
  liveConfig: () => QlooServerConfig.load(),
  send: sendNative,
  // TASTEGATE_DISABLE_LIVE=1 is an additional operator kill switch on top of the profile (public deployments, automated browser tests).
  liveDisabled: () => !resolved.capabilities.live_possible || process.env.TASTEGATE_DISABLE_LIVE === "1",
  environment: resolved.capabilities.live_environment ?? "DEVELOPMENT",
});

export async function GET(): Promise<Response> { return service.catalog(); }
export async function POST(request: Request): Promise<Response> { return service.audit(request); }
