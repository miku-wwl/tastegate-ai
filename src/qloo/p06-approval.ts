import { randomUUID } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { assertServer } from "./boundary-error";
import { P06_PROFILE, P06CheckpointSchema, SAVED_P03R_ATTEMPT, SAVED_P05_ATTEMPT, validP06Checkpoint } from "./p06-profile";
import { SAVED_P01_ATTEMPT } from "./p02-profile";
import { buildP06ShortlistReview, deriveP06Shortlist, inspectAcceptedP06Shortlist } from "./p06-shortlist";
import { inspectPrivateProbeLedger } from "./raw-probe-store";

// Local-only administration around the one P06 request. Neither function performs HTTP or reads a credential.
// Writes are exclusive (`wx`, mode 0600) so an existing review, checkpoint or receipt is never overwritten.
async function privateBase(projectRoot: string): Promise<string> {
  const root = await realpath(projectRoot); let folder = root;
  for (const part of ["private", "qloo-probes"]) {
    folder = join(folder, part); const info = await lstat(folder);
    if (info.isSymbolicLink() || !info.isDirectory() || await realpath(folder) !== folder || (process.platform !== "win32" && (info.mode & 0o077) !== 0))
      throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
  }
  return folder;
}
async function exclusiveWrite(path: string, text: string): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
}
// Creates the private shortlist review from the two manifest-verified captures. The review has no discretion: its
// content is fully determined by the named captures, so a hand-edited file can never differ from the derivation.
export async function prepareP06ShortlistReview(projectRoot: string): Promise<{ status: "CREATED" }> {
  assertServer();
  try {
    const base = await privateBase(projectRoot);
    await exclusiveWrite(join(base, "p06-shortlist-review.private.json"), JSON.stringify(buildP06ShortlistReview(await deriveP06Shortlist(projectRoot)), null, 2) + "\n");
    await inspectAcceptedP06Shortlist(projectRoot);
    return { status: "CREATED" };
  } catch { throw new Error("P06_REVIEW_PREPARATION_FAILED"); }
}

const MAX_REPLY = 500;
// The owner's verbatim reply must name P06 and no other probe: one approval is bound to one request.
export function ownerReplyNamesOnlyP06(reply: string): boolean {
  return reply.trim().length > 0 && reply.length <= MAX_REPLY && /(^|[^A-Za-z0-9])P06([^A-Za-z0-9]|$)/.test(reply) &&
    !/(^|[^A-Za-z0-9])P(0[1-57-9]|10)([^A-Za-z0-9]|$)/.test(reply) && !/(^|[^A-Za-z0-9])P03-?R([^A-Za-z0-9]|$)/.test(reply);
}
export type P06Registration = { status: "REGISTERED"; attempt_id: string; approved_at: string; approval_expires_at: string; window_minutes: 5 };
// Writes the single-use P06 checkpoint plus a consent receipt. Call ONLY after an explicit, P06-only owner reply.
// All bindings are re-derived from verified evidence; the timestamp records local registration, not a human click.
export async function registerP06Approval(projectRoot: string, input: { ownerReply: string; gateId: string; now?: number }): Promise<P06Registration> {
  assertServer();
  try {
    if (!ownerReplyNamesOnlyP06(input.ownerReply) || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.gateId)) throw new Error();
    const base = await privateBase(projectRoot);
    // One approval file ever: an existing checkpoint (consumed or not) is never replaced, so no orphan receipt is written either.
    try { await lstat(join(base, "p06-checkpoint.json")); throw new Error(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(); }
    const binding = await inspectAcceptedP06Shortlist(projectRoot);
    // Every earlier probe must be settled exactly as reviewed, and P06 must be fresh: a consumed approval cannot be re-registered.
    for (const prior of ["P01", "P02", "P03", "P04", "P03R", "P05"] as const) {
      const ledger = await inspectPrivateProbeLedger(projectRoot, prior);
      if (ledger.reserved_attempts !== 1 || ledger.recorded_dispatches !== 1 || ledger.unresolved_attempts !== 0) throw new Error();
    }
    const own = await inspectPrivateProbeLedger(projectRoot, "P06");
    if (own.reserved_attempts !== 0 || own.recorded_dispatches !== 0 || own.unresolved_attempts !== 0) throw new Error();
    const now = input.now ?? Date.now(); const attempt = randomUUID();
    const approvedAt = new Date(now).toISOString(); const expiresAt = new Date(now + 5 * 60_000).toISOString();
    const checkpoint = P06CheckpointSchema.parse({ revision: "tastegate.p06.checkpoint.v1", profile_revision: P06_PROFILE.revision,
      attempt_id: attempt, previous_attempt_id: null, prior_reserved_attempts: 0, prior_attempts_reviewed: true,
      credential_exposure_risk_acknowledged: true, credential_basis: "ORIGINALLY_ISSUED_EVENT_KEY", unknown_entitlements_acknowledged: true,
      host_and_header_reviewed: true, request_shape_reviewed: true, usage_rights_confirmed: true, private_capture_permitted: true,
      private_directory_access_reviewed: true, quota: { remaining_calls: "UNKNOWN", rate_limit_per_minute: "UNKNOWN", concurrency_limit: "UNKNOWN", key_expires_at: "UNKNOWN" },
      approval: "APPROVE_P06_SHORTLIST_RANK_ONLY", max_dispatches: 1, approved_at: approvedAt, approval_expires_at: expiresAt,
      max_response_bytes: 262_144, request_timeout_ms: 4000, signal_entity_id: binding.signalEntityId, signal_entity_type: "urn:entity:artist",
      signal_review_sha256: binding.signalReviewSha256, p01_raw_sha256: binding.p01RawSha256, p01_source_attempt_id: SAVED_P01_ATTEMPT,
      shortlist_review_sha256: binding.shortlistReviewSha256, shortlist_entity_ids: [binding.nycEntityId, binding.controlEntityId],
      shortlist_source_attempts: { reviewed_nyc_candidate: SAVED_P03R_ATTEMPT, positive_control: SAVED_P05_ATTEMPT },
      signal_identity_reviewed: true, shortlist_identity_reviewed: true, no_geographic_tag_or_explanation_parameters: true,
      unreviewed_semantics_acknowledged: true, shortlist_semantics_unverified_acknowledged: true,
      prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P03: 1, P04: 1, P03R: 1, P05: 1 } });
    if (!validP06Checkpoint(checkpoint, now)) throw new Error();
    const url = new URL(P06_PROFILE.path, P06_PROFILE.origin);
    url.search = new URLSearchParams({ "filter.type": "urn:entity:place", "signal.interests.entities": binding.signalEntityId,
      "filter.results.entities": `${binding.nycEntityId},${binding.controlEntityId}`, take: "2" }).toString();
    const receipt = { revision: "tastegate.p06.owner-consent-receipt.v1", gate_id: input.gateId, owner_reply: input.ownerReply,
      local_registration_utc: approvedAt, approval_expires_at: expiresAt, timestamp_is: "LOCAL_REGISTRATION_NOT_ASSERTED_HUMAN_CLICK_TIME",
      attempt_id: attempt, profile_revision: P06_PROFILE.revision, request: { method: "GET", url: url.toString() },
      max_dispatches: 1, concurrency: 1, timeout_ms: 4000, max_response_bytes: 262_144, retries: 0, redirects: 0,
      destination: `private/qloo-probes/p06/attempts/${attempt}/`, private_shortlist_review_sha256: binding.shortlistReviewSha256,
      accepted_risks: ["POSSIBLE_PRIOR_CREDENTIAL_EXPOSURE", "ROTATION_REVOCATION_UNCONFIRMED", "UNKNOWN_QUOTA_RATE_PROVIDER_CONCURRENCY_EXPIRY_SHORTLIST_ENTITLEMENT",
        "UNVERIFIED_SHORTLIST_RANKING_SEMANTICS", "PRIVATE_RESPONSE_CAPTURE"],
      does_not_authorize: ["SECOND_P06", "EARLIER_PROBE_REPEATS", "P07_P10", "EXTRA_PARAMETERS", "ENTITY_PROMOTION", "PRODUCT_LIVE_MODE", "COMMIT_PUSH_DEPLOY_DEVPOST"] };
    // Receipt first: a checkpoint without a receipt must never exist. Both are exclusive, so nothing is overwritten.
    await exclusiveWrite(join(base, `p06-approval-receipt-${attempt}.json`), JSON.stringify(receipt, null, 2) + "\n");
    await exclusiveWrite(join(base, "p06-checkpoint.json"), JSON.stringify(checkpoint, null, 2) + "\n");
    return { status: "REGISTERED", attempt_id: attempt, approved_at: approvedAt, approval_expires_at: expiresAt, window_minutes: 5 };
  } catch { throw new Error("P06_APPROVAL_REGISTRATION_FAILED"); }
}
