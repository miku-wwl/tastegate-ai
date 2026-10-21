import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CONSENT_REVISION, canonicalApproval, termsDigest, type ConsentTerms } from "./owner-consent";
import type { P05SignalBinding } from "./p05-signal";
import { P07_PROFILE, p07RequestSha256, type P07Checkpoint } from "./p07-profile";

// The terms of the single P07 request and the records that prove the owner approved exactly those terms. Everything here is
// local: no HTTP, no credential. The admin module (p07-approval.ts) writes the records; the runner side only VERIFIES them, so
// this module deliberately imports nothing that reads the probe ledger.
export const P07_OFFER_WINDOW_HOURS = 48;
export const P07_EXECUTION_WINDOW_MINUTES = 5;
export const P07_DOES_NOT_AUTHORIZE = ["SECOND_P07", "EARLIER_PROBE_REPEATS", "P08_P10", "EXTRA_OR_ALTERED_PARAMETERS", "ENTITY_PROMOTION", "PRODUCT_LIVE_MODE", "COMMIT_PUSH_DEPLOY_DEVPOST"] as const;
const sha = z.string().regex(/^[a-f0-9]{64}$/);

export const P07ProposalSchema = z.strictObject({ revision: z.literal("tastegate.p07.proposal.v1"), attempt_id: z.uuidv4(),
  created_at: z.iso.datetime(), approve_before: z.iso.datetime(), profile_revision: z.literal(P07_PROFILE.revision),
  request_sha256: sha, signal_review_sha256: sha, p01_raw_sha256: sha, terms_sha256: sha });
export type P07Proposal = z.infer<typeof P07ProposalSchema>;

// Everything the owner approves. The artist ID appears only as the hash of the full request URL, so these terms (and the digest
// printed in the owner's sentence) reveal no provider identifier.
export function p07Terms(t: { attemptId: string; approveBefore: string; requestSha256: string; signalReviewSha256: string; p01RawSha256: string }): ConsentTerms {
  return {
    probe: "P07", profile_revision: P07_PROFILE.revision,
    request: { method: "GET", origin: P07_PROFILE.origin, path: P07_PROFILE.path, parameters: { ...P07_PROFILE.params }, request_sha256: t.requestSha256 },
    bindings: { artist_identity_review_sha256: t.signalReviewSha256, p01_raw_sha256: t.p01RawSha256,
      prior_probe_dispatches_reviewed: { P01: 1, P02: 1, P03: 1, P04: 1, P03R: 1, P05: 1, P06: 1 } },
    limits: { max_dispatches: 1, concurrency: 1, retries: 0, redirects: 0, timeout_ms: 4000, max_response_bytes: 262_144, execution_window_minutes: P07_EXECUTION_WINDOW_MINUTES },
    approve_before: t.approveBefore, attempt_id: t.attemptId, destination: `private/qloo-probes/p07/attempts/${t.attemptId}/`,
    locality_filter_support: "DOCUMENTED_WITH_PLACE_SUPPORT_CONFLICT_SILENT_IGNORE_POSSIBLE", single_use_approval: true,
    does_not_authorize: [...P07_DOES_NOT_AUTHORIZE],
  };
}
export function p07Digest(proposal: Pick<P07Proposal, "attempt_id" | "approve_before" | "request_sha256" | "signal_review_sha256" | "p01_raw_sha256">): string {
  return termsDigest("PROBE_P07", proposal.attempt_id, p07Terms({ attemptId: proposal.attempt_id, approveBefore: proposal.approve_before, requestSha256: proposal.request_sha256,
    signalReviewSha256: proposal.signal_review_sha256, p01RawSha256: proposal.p01_raw_sha256 }));
}
export const p07Statement = (proposal: Pick<P07Proposal, "attempt_id" | "terms_sha256">): string => canonicalApproval("PROBE_P07", proposal.attempt_id, proposal.terms_sha256);

export const P07ReceiptSchema = z.strictObject({ revision: z.literal("tastegate.p07.owner-consent-receipt.v1"), consent_revision: z.literal(CONSENT_REVISION),
  attempt_id: z.uuidv4(), proposal_id: z.uuidv4(), owner_reply: z.string().min(1).max(200),
  local_registration_utc: z.iso.datetime(), approval_expires_at: z.iso.datetime(), timestamp_is: z.literal("LOCAL_REGISTRATION_NOT_ASSERTED_HUMAN_CLICK_TIME"),
  profile_revision: z.literal(P07_PROFILE.revision), terms_sha256: sha, request_sha256: sha,
  request: z.strictObject({ method: z.literal("GET"), url: z.string().min(1).max(2048) }),
  max_dispatches: z.literal(1), concurrency: z.literal(1), timeout_ms: z.literal(4000), max_response_bytes: z.literal(262_144), retries: z.literal(0), redirects: z.literal(0),
  destination: z.string().min(1).max(300), accepted_risks: z.array(z.string().max(120)).max(12), does_not_authorize: z.array(z.string().max(80)).max(12) });
export type P07Receipt = z.infer<typeof P07ReceiptSchema>;
export const P07ConsumedSchema = z.strictObject({ revision: z.literal("tastegate.p07.proposal-consumed.v1"), attempt_id: z.uuidv4(), consumed_utc: z.iso.datetime() });

export const P07_PROPOSAL_DIR = "p07-proposals";
// Bounded private read: every path component must be a real (non-link) directory, the file a regular file under the cap.
export async function readPrivateSmall(root: string, parts: readonly string[], cap: number): Promise<Buffer | null> {
  let path = root;
  for (const part of parts) {
    path = join(path, part);
    let info; try { info = await lstat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE"); }
    if (info.isSymbolicLink() || await realpath(path) !== path || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
  }
  const info = await lstat(path); if (!info.isFile() || info.size > cap) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE");
  const bytes = await readFile(path); if (bytes.length > cap) throw new Error("PRIVATE_EVIDENCE_UNAVAILABLE"); return bytes;
}
export const decodeJson = (bytes: Buffer): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

// Execution-time check, fail closed: the approval must still be exactly what the owner's sentence approved. It re-derives the
// request from the profile and the VERIFIED artist binding, the digest from the stored record, and the sentence from both, and
// requires the proposal to be consumed (so a checkpoint hand-written beside no consent cannot run).
export async function verifyP07Consent(projectRoot: string, checkpoint: P07Checkpoint, binding: P05SignalBinding): Promise<boolean> {
  try {
    const root = await realpath(projectRoot); const base = ["private", "qloo-probes"] as const;
    const receiptBytes = await readPrivateSmall(root, [...base, `p07-approval-receipt-${checkpoint.attempt_id}.json`], 16_384); if (!receiptBytes) return false;
    const receipt = P07ReceiptSchema.parse(decodeJson(receiptBytes));
    const proposalBytes = await readPrivateSmall(root, [...base, P07_PROPOSAL_DIR, `${checkpoint.attempt_id}.json`], 4096); if (!proposalBytes) return false;
    const proposal = P07ProposalSchema.parse(decodeJson(proposalBytes));
    const consumedBytes = await readPrivateSmall(root, [...base, P07_PROPOSAL_DIR, `${checkpoint.attempt_id}.consumed.json`], 4096); if (!consumedBytes) return false;
    if (P07ConsumedSchema.parse(decodeJson(consumedBytes)).attempt_id !== checkpoint.attempt_id) return false;
    if (await readPrivateSmall(root, [...base, P07_PROPOSAL_DIR, `${checkpoint.attempt_id}.withdrawn.json`], 4096)) return false;
    const requestSha = p07RequestSha256(binding.entityId);
    const digest = p07Digest(proposal);
    return proposal.attempt_id === checkpoint.attempt_id && receipt.attempt_id === checkpoint.attempt_id && receipt.proposal_id === checkpoint.attempt_id &&
      checkpoint.consent_proposal_id === checkpoint.attempt_id && proposal.terms_sha256 === digest && receipt.terms_sha256 === digest && checkpoint.consent_terms_sha256 === digest &&
      proposal.request_sha256 === requestSha && receipt.request_sha256 === requestSha && checkpoint.request_sha256 === requestSha &&
      proposal.signal_review_sha256 === binding.reviewSha256 && proposal.p01_raw_sha256 === binding.p01RawSha256 &&
      receipt.owner_reply === p07Statement(proposal) && Date.parse(receipt.local_registration_utc) <= Date.parse(proposal.approve_before) &&
      Date.parse(checkpoint.approved_at) >= Date.parse(proposal.created_at);
  } catch { return false; }
}
