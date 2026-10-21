import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { assertServer } from "./boundary-error";
import { CONSENT_REVISION, isConsentSubjectId, replyIsCanonicalApproval } from "./owner-consent";
import { inspectAcceptedP05Signal } from "./p05-signal";
import { SAVED_P01_ATTEMPT } from "./p02-profile";
import { P07_OFFER_WINDOW_HOURS, P07_EXECUTION_WINDOW_MINUTES, P07_DOES_NOT_AUTHORIZE, P07_PROPOSAL_DIR, P07ConsumedSchema, P07ProposalSchema, decodeJson,
  p07Digest, p07Statement, readPrivateSmall, type P07Proposal } from "./p07-consent";
import { P07_PROFILE, P07CheckpointSchema, p07RequestSha256, p07RequestUrl, validP07Checkpoint } from "./p07-profile";
import { inspectPrivateProbeLedger } from "./raw-probe-store";

// Local-only administration around the one P07 request. Nothing here performs HTTP or reads a credential.
//   prepareP07Gate      writes an unsigned PROPOSAL (the exact request, by hash, plus limits) and returns the one sentence that approves it
//   registerP07Approval accepts ONLY that sentence, consumes the proposal, then writes a consent receipt and the single-use checkpoint
//   withdrawP07Gate     withdraws a proposal, or revokes an approval that has not run (the runner refuses a withdrawn approval)
// Writes are exclusive (`wx`, mode 0600): nothing is overwritten, and every record of an earlier attempt is kept.
export const P07_PARAMETER_SUPPORT = Object.freeze([
  { parameter: "filter.type", value: "urn:entity:place", support: "DOCUMENTED_REQUIRED", conflict: false },
  { parameter: "signal.interests.entities", value: "<PRIVATE_REVIEWED_RADIOHEAD_ID>", support: "DOCUMENTED_OPTIONAL_FOR_PLACE", conflict: false },
  { parameter: "filter.location.query", value: "New York City", support: "DOCUMENTED_IN_INSIGHTS_REFERENCE_AND_PARAMETER_REFERENCE_NOT_LISTED_FOR_PLACE_IN_ENTITY_TYPE_GUIDE", conflict: true },
  { parameter: "filter.location.radius", value: "0", support: "DOCUMENTED_METERS_ZERO_MEANS_STRICTLY_INSIDE_THE_LOCALITY", conflict: false },
  { parameter: "take", value: "3", support: "DOCUMENTED_DEFAULT_20_MAXIMUM_50", conflict: false },
] as const);
export const P07_KNOWN_UNCERTAINTIES = Object.freeze([
  "LOCALITY_FILTER_MAY_BE_SILENTLY_IGNORED_FOR_PLACE_SO_HTTP_200_PROVES_NOTHING",
  "FUZZY_LOCALITY_MATCH_MAY_RESOLVE_ANOTHER_AREA_OR_RETURN_HTTP_400",
  "RADIUS_ZERO_MAY_RETURN_FEWER_THAN_THREE_PLACES_OR_NONE",
  "RETURNED_GEOCODE_CITY_MAY_BE_A_BOROUGH_NAME_RATHER_THAN_NEW_YORK",
  "UNKNOWN_QUOTA_RATE_LIMIT_CONCURRENCY_AND_KEY_EXPIRY",
  "POSSIBLE_PRIOR_CREDENTIAL_EXPOSURE_ROTATION_UNCONFIRMED",
  "ONE_REQUEST_MAY_YIELD_NO_VERIFIABLE_REPLACEMENT",
] as const);
const PRIOR = ["P01", "P02", "P03", "P04", "P03R", "P05", "P06"] as const;

async function privateBase(projectRoot: string): Promise<string> {
  const root = await realpath(projectRoot); let folder = root;
  for (const part of ["private", "qloo-probes"]) {
    folder = join(folder, part); const info = await lstat(folder);
    if (info.isSymbolicLink() || !info.isDirectory() || await realpath(folder) !== folder || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
  }
  return folder;
}
async function proposalDir(base: string, create: boolean): Promise<string | null> {
  const dir = join(base, P07_PROPOSAL_DIR);
  let info; try { info = await lstat(dir); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
    if (!create) return null; await mkdir(dir, { mode: 0o700 }); info = await lstat(dir);
  }
  if (info.isSymbolicLink() || !info.isDirectory() || await realpath(dir) !== dir || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
  return dir;
}
async function exclusiveWrite(path: string, value: unknown): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + "\n"); await handle.sync(); } finally { await handle.close(); }
}
async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE"); }
}
// Every earlier probe must be settled exactly as reviewed (one dispatch each) and P07 must not have been attempted.
async function requireFreshChain(projectRoot: string): Promise<void> {
  for (const prior of PRIOR) {
    const ledger = await inspectPrivateProbeLedger(projectRoot, prior);
    if (ledger.reserved_attempts !== 1 || ledger.recorded_dispatches !== 1 || ledger.unresolved_attempts !== 0) throw new Error("PRIOR_ATTEMPTS_NOT_REVIEWED");
  }
  const own = await inspectPrivateProbeLedger(projectRoot, "P07");
  if (own.reserved_attempts !== 0 || own.recorded_dispatches !== 0 || own.unresolved_attempts !== 0) throw new Error("P07_ALREADY_ATTEMPTED");
}
type Marker = "consumed" | "withdrawn";
const marked = (dir: string, id: string, marker: Marker) => exists(join(dir, `${id}.${marker}.json`));
async function readProposal(dir: string, id: string): Promise<P07Proposal> {
  if (!isConsentSubjectId(id)) throw new Error("PROPOSAL_INVALID");
  const bytes = await readPrivateSmall(dir, [`${id}.json`], 4096); if (!bytes) throw new Error("PROPOSAL_MISSING");
  const proposal = P07ProposalSchema.parse(decodeJson(bytes));
  if (proposal.attempt_id !== id || Date.parse(proposal.approve_before) - Date.parse(proposal.created_at) !== P07_OFFER_WINDOW_HOURS * 3_600_000 || proposal.terms_sha256 !== p07Digest(proposal))
    throw new Error("PROPOSAL_INVALID");
  return proposal;
}

export type P07Gate = { status: "GATE_PREPARED_NO_REQUEST_SENT"; probe: "P07"; attempt_id: string; approve_before: string; approval_statement: string;
  request: { method: "GET"; origin: string; path: string; parameters: Record<string, string>; private_values: string };
  bindings: { artist_identity: "ACCEPTED_FOR_P05_ONLY_REVERIFIED"; prior_probes: Record<string, string>; own_ledger: string };
  limits: { max_dispatches: 1; concurrency: 1; retries: 0; redirects: 0; timeout_ms: 4000; max_response_bytes: 262144; execution_window_minutes: number };
  destination: string; parameter_support: typeof P07_PARAMETER_SUPPORT; known_uncertainties: typeof P07_KNOWN_UNCERTAINTIES; does_not_authorize: readonly string[] };
// Writes the proposal for the exact request the verified evidence produces. The offer lapses after 48 hours and only one offer can be open.
export async function prepareP07Gate(projectRoot: string, input: { now?: number } = {}): Promise<P07Gate> {
  assertServer();
  try {
    const now = input.now ?? Date.now(); const base = await privateBase(projectRoot);
    await requireFreshChain(projectRoot);
    if (await exists(join(base, "p07-checkpoint.json"))) throw new Error("P07_APPROVAL_EXISTS");
    const binding = await inspectAcceptedP05Signal(projectRoot);
    const dir = await proposalDir(base, true); if (!dir) throw new Error();
    for (const name of await readdir(dir)) {
      const parts = name.split("."); if (parts.length !== 2 || parts[1] !== "json" || !isConsentSubjectId(parts[0])) continue;
      const existing = await readProposal(dir, parts[0]!).catch(() => null);
      if (existing && Date.parse(existing.approve_before) > now && !await marked(dir, existing.attempt_id, "consumed") && !await marked(dir, existing.attempt_id, "withdrawn")) throw new Error("P07_GATE_ALREADY_OPEN");
    }
    const attempt = randomUUID(); const approveBefore = new Date(now + P07_OFFER_WINDOW_HOURS * 3_600_000).toISOString();
    const base7 = { attempt_id: attempt, approve_before: approveBefore, request_sha256: p07RequestSha256(binding.entityId), signal_review_sha256: binding.reviewSha256, p01_raw_sha256: binding.p01RawSha256 };
    const proposal = P07ProposalSchema.parse({ revision: "tastegate.p07.proposal.v1", created_at: new Date(now).toISOString(), profile_revision: P07_PROFILE.revision, ...base7, terms_sha256: p07Digest(base7) });
    await exclusiveWrite(join(dir, `${attempt}.json`), proposal);
    return { status: "GATE_PREPARED_NO_REQUEST_SENT", probe: "P07", attempt_id: attempt, approve_before: approveBefore, approval_statement: p07Statement(proposal),
      request: { method: "GET", origin: P07_PROFILE.origin, path: P07_PROFILE.path, parameters: { ...P07_PROFILE.params }, private_values: "The artist ID replaces the marker at execution, from the re-verified private identity review; it is never printed." },
      bindings: { artist_identity: "ACCEPTED_FOR_P05_ONLY_REVERIFIED", prior_probes: Object.fromEntries(PRIOR.map((p) => [p, "1 dispatch, settled, reviewed"])), own_ledger: "0 attempts" },
      limits: { max_dispatches: 1, concurrency: 1, retries: 0, redirects: 0, timeout_ms: 4000, max_response_bytes: 262_144, execution_window_minutes: P07_EXECUTION_WINDOW_MINUTES },
      destination: `private/qloo-probes/p07/attempts/${attempt}/`, parameter_support: P07_PARAMETER_SUPPORT, known_uncertainties: P07_KNOWN_UNCERTAINTIES, does_not_authorize: [...P07_DOES_NOT_AUTHORIZE] };
  } catch { throw new Error("P07_GATE_PREPARATION_FAILED"); }
}

// Read-only review: re-derive the artist, exact request and limits. No renewal, consumption, credential or HTTP.
export async function reviewP07Gate(projectRoot: string, input: { proposalId: string; now?: number }) {
  assertServer();
  try {
    const now = input.now ?? Date.now(); const base = await privateBase(projectRoot);
    await requireFreshChain(projectRoot);
    if (await exists(join(base, "p07-checkpoint.json"))) throw new Error();
    const dir = await proposalDir(base, false); if (!dir) throw new Error();
    const proposal = await readProposal(dir, input.proposalId);
    if (now < Date.parse(proposal.created_at) || now >= Date.parse(proposal.approve_before) ||
        await marked(dir, proposal.attempt_id, "consumed") || await marked(dir, proposal.attempt_id, "withdrawn")) throw new Error();
    const binding = await inspectAcceptedP05Signal(projectRoot);
    if (proposal.request_sha256 !== p07RequestSha256(binding.entityId) || proposal.signal_review_sha256 !== binding.reviewSha256 ||
        proposal.p01_raw_sha256 !== binding.p01RawSha256) throw new Error();
    return { status: "GATE_REVALIDATED_NO_REQUEST_SENT" as const, probe: "P07" as const, attempt_id: proposal.attempt_id,
      approve_before: proposal.approve_before, approval_statement: p07Statement(proposal), profile: P07_PROFILE,
      limits: { max_dispatches: 1, concurrency: 1, retries: 0, redirects: 0, timeout_ms: 4000, max_response_bytes: 262144, execution_window_minutes: P07_EXECUTION_WINDOW_MINUTES },
      destination: "private/qloo-probes/p07/attempts/" + proposal.attempt_id + "/",
      parameter_support: P07_PARAMETER_SUPPORT, known_uncertainties: P07_KNOWN_UNCERTAINTIES,
      does_not_authorize: P07_DOES_NOT_AUTHORIZE };
  } catch { throw new Error("P07_GATE_REVIEW_FAILED"); }
}

export type P07Registration = { status: "REGISTERED"; attempt_id: string; approved_at: string; approval_expires_at: string; window_minutes: number };
// Registers the single-use approval ONLY if the reply is exactly the sentence for this proposal, every binding still re-verifies
// against the private evidence, and nothing about P07 has happened yet. The timestamp records local registration, not a human click.
export async function registerP07Approval(projectRoot: string, input: { proposalId: string; ownerReply: string; now?: number }): Promise<P07Registration> {
  assertServer();
  try {
    if (!isConsentSubjectId(input.proposalId) || typeof input.ownerReply !== "string") throw new Error();
    const now = input.now ?? Date.now(); const base = await privateBase(projectRoot);
    const dir = await proposalDir(base, false); if (!dir) throw new Error();
    const proposal = await readProposal(dir, input.proposalId);
    if (await marked(dir, proposal.attempt_id, "consumed") || await marked(dir, proposal.attempt_id, "withdrawn")) throw new Error();
    if (Date.parse(proposal.created_at) > now || Date.parse(proposal.approve_before) <= now) throw new Error();
    if (!replyIsCanonicalApproval(input.ownerReply, p07Statement(proposal))) throw new Error();
    // One approval file ever. Then re-derive the request from CURRENT verified evidence: if the evidence or the profile drifted since the gate was prepared, the sentence no longer approves what would be sent.
    if (await exists(join(base, "p07-checkpoint.json"))) throw new Error();
    await requireFreshChain(projectRoot);
    const binding = await inspectAcceptedP05Signal(projectRoot);
    if (proposal.request_sha256 !== p07RequestSha256(binding.entityId) || proposal.signal_review_sha256 !== binding.reviewSha256 || proposal.p01_raw_sha256 !== binding.p01RawSha256) throw new Error();
    const approvedAt = new Date(now).toISOString(); const expiresAt = new Date(now + P07_EXECUTION_WINDOW_MINUTES * 60_000).toISOString();
    const checkpoint = P07CheckpointSchema.parse({ revision: "tastegate.p07.checkpoint.v1", profile_revision: P07_PROFILE.revision,
      attempt_id: proposal.attempt_id, previous_attempt_id: null, prior_reserved_attempts: 0, prior_attempts_reviewed: true,
      credential_exposure_risk_acknowledged: true, credential_basis: "ORIGINALLY_ISSUED_EVENT_KEY", unknown_entitlements_acknowledged: true,
      host_and_header_reviewed: true, request_shape_reviewed: true, usage_rights_confirmed: true, private_capture_permitted: true,
      private_directory_access_reviewed: true, quota: { remaining_calls: "UNKNOWN", rate_limit_per_minute: "UNKNOWN", concurrency_limit: "UNKNOWN", key_expires_at: "UNKNOWN" },
      approval: "APPROVE_P07_NYC_DISCOVERY_ONLY", max_dispatches: 1, approved_at: approvedAt, approval_expires_at: expiresAt,
      max_response_bytes: 262_144, request_timeout_ms: 4000, signal_entity_id: binding.entityId, signal_entity_type: "urn:entity:artist",
      signal_review_sha256: binding.reviewSha256, p01_raw_sha256: binding.p01RawSha256, p01_source_attempt_id: SAVED_P01_ATTEMPT, signal_identity_reviewed: true,
      request_sha256: proposal.request_sha256, consent_terms_sha256: proposal.terms_sha256, consent_proposal_id: proposal.attempt_id,
      location_parameters_reviewed: true, locality_filter_unverified_acknowledged: true, silent_parameter_ignore_acknowledged: true, unreviewed_semantics_acknowledged: true,
      prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P03: 1, P04: 1, P03R: 1, P05: 1, P06: 1 } });
    if (!validP07Checkpoint(checkpoint, now)) throw new Error();
    const receipt = { revision: "tastegate.p07.owner-consent-receipt.v1", consent_revision: CONSENT_REVISION, attempt_id: proposal.attempt_id, proposal_id: proposal.attempt_id,
      owner_reply: input.ownerReply.trim(), local_registration_utc: approvedAt, approval_expires_at: expiresAt, timestamp_is: "LOCAL_REGISTRATION_NOT_ASSERTED_HUMAN_CLICK_TIME",
      profile_revision: P07_PROFILE.revision, terms_sha256: proposal.terms_sha256, request_sha256: proposal.request_sha256, request: { method: "GET", url: p07RequestUrl(binding.entityId) },
      max_dispatches: 1, concurrency: 1, timeout_ms: 4000, max_response_bytes: 262_144, retries: 0, redirects: 0, destination: `private/qloo-probes/p07/attempts/${proposal.attempt_id}/`,
      accepted_risks: ["POSSIBLE_PRIOR_CREDENTIAL_EXPOSURE", "ROTATION_REVOCATION_UNCONFIRMED", "UNKNOWN_QUOTA_RATE_PROVIDER_CONCURRENCY_EXPIRY",
        "LOCALITY_FILTER_UNVERIFIED_SILENT_IGNORE_POSSIBLE", "PRIVATE_RESPONSE_CAPTURE"], does_not_authorize: [...P07_DOES_NOT_AUTHORIZE] };
    // Order matters: spend the offer first, then the receipt, then the checkpoint. A crash leaves NO approval (the owner prepares a new gate), never a replayable one.
    await exclusiveWrite(join(dir, `${proposal.attempt_id}.consumed.json`), P07ConsumedSchema.parse({ revision: "tastegate.p07.proposal-consumed.v1", attempt_id: proposal.attempt_id, consumed_utc: approvedAt }));
    await exclusiveWrite(join(base, `p07-approval-receipt-${proposal.attempt_id}.json`), receipt);
    await exclusiveWrite(join(base, "p07-checkpoint.json"), checkpoint);
    return { status: "REGISTERED", attempt_id: proposal.attempt_id, approved_at: approvedAt, approval_expires_at: expiresAt, window_minutes: P07_EXECUTION_WINDOW_MINUTES };
  } catch { throw new Error("P07_APPROVAL_REGISTRATION_FAILED"); }
}

// Withdraws an offer, or revokes an approval that has not run: the runner refuses an approval whose proposal is withdrawn.
export async function withdrawP07Gate(projectRoot: string, input: { proposalId: string; now?: number }): Promise<{ status: "WITHDRAWN" }> {
  assertServer();
  try {
    const base = await privateBase(projectRoot); const dir = await proposalDir(base, false); if (!dir) throw new Error();
    const proposal = await readProposal(dir, input.proposalId);
    await exclusiveWrite(join(dir, `${proposal.attempt_id}.withdrawn.json`), { revision: "tastegate.p07.proposal-withdrawn.v1", attempt_id: proposal.attempt_id, withdrawn_utc: new Date(input.now ?? Date.now()).toISOString() });
    return { status: "WITHDRAWN" };
  } catch { throw new Error("P07_WITHDRAWAL_FAILED"); }
}

export type P07State = { state: "NO_GATE" | "GATE_OPEN_AWAITING_APPROVAL" | "GATE_EXPIRED" | "GATE_WITHDRAWN" | "APPROVAL_REGISTERED_NOT_EXECUTED" | "EXECUTED_ONCE_OR_INTERRUPTED";
  attempt_id: string | null; approve_before: string | null; ledger: { reserved_attempts: number; recorded_dispatches: number; unresolved_attempts: number } };
// Read-only, public-safe view of where P07 stands. It prints no hash, URL or provider identifier.
export async function inspectP07State(projectRoot: string, input: { now?: number } = {}): Promise<P07State> {
  assertServer();
  try {
    const now = input.now ?? Date.now(); const base = await privateBase(projectRoot);
    const ledger = await inspectPrivateProbeLedger(projectRoot, "P07");
    const summary = { reserved_attempts: ledger.reserved_attempts, recorded_dispatches: ledger.recorded_dispatches, unresolved_attempts: ledger.unresolved_attempts };
    const dir = await proposalDir(base, false); let latest: P07Proposal | null = null;
    if (dir) for (const name of await readdir(dir)) {
      const parts = name.split("."); if (parts.length !== 2 || parts[1] !== "json" || !isConsentSubjectId(parts[0])) continue;
      const proposal = await readProposal(dir, parts[0]!).catch(() => null);
      if (proposal && (!latest || Date.parse(proposal.created_at) > Date.parse(latest.created_at))) latest = proposal;
    }
    const id = latest?.attempt_id ?? null; const until = latest?.approve_before ?? null;
    if (ledger.reserved_attempts > 0) return { state: "EXECUTED_ONCE_OR_INTERRUPTED", attempt_id: ledger.last_attempt_id, approve_before: until, ledger: summary };
    if (await exists(join(base, "p07-checkpoint.json"))) return { state: "APPROVAL_REGISTERED_NOT_EXECUTED", attempt_id: id, approve_before: until, ledger: summary };
    if (!latest || !dir) return { state: "NO_GATE", attempt_id: null, approve_before: null, ledger: summary };
    if (await marked(dir, latest.attempt_id, "withdrawn")) return { state: "GATE_WITHDRAWN", attempt_id: id, approve_before: until, ledger: summary };
    return { state: Date.parse(latest.approve_before) > now ? "GATE_OPEN_AWAITING_APPROVAL" : "GATE_EXPIRED", attempt_id: id, approve_before: until, ledger: summary };
  } catch { throw new Error("P07_STATE_UNAVAILABLE"); }
}
