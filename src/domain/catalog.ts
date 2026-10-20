import { z } from "zod";
import { AuditInputSchema } from "./contracts";
import { COUNTRIES } from "./custom-input";
import { CUSTOM_SCENARIO_ID, LIVE_ACK, MAX_REQUEST_BYTES, REQUEST_SOURCES, type RequestSource } from "./protocol";

export { CUSTOM_SCENARIO_ID, LIVE_ACK, MAX_REQUEST_BYTES, REQUEST_SOURCES, type RequestSource };

// The public contract between the server and the browser for GET /api/audit. It carries public metadata only: authored
// scenario inputs, coarse availability, public request history (never a body, ID, hash or path) and the plain-text
// lookups the recordings cover. The server validates its own catalog against this schema before sending it, and the
// browser validates what it receives: a drifting shape fails closed rather than rendering something unreviewed.
export const RECORDED_OUTCOMES = ["REPLAYABLE", "RESPONSE_TOO_LARGE_NOT_SAVED", "REVIEW_REQUIRED", "RESPONSE_UNUSABLE", "UNEXPECTED_ENTITY", "INCOMPATIBLE_SCORES"] as const;
export const SHORTLIST_CLASSES = ["ALL_RETURNED", "PARTIAL", "UNEXPECTED_ENTITY", "INCOMPATIBLE_SCORES", "RESPONSE_UNUSABLE"] as const;
export const LIVE_LOCK_REASONS = ["CREDENTIAL_NOT_CONFIGURED", "GRANT_MISSING", "GRANT_INVALID", "GRANT_NOT_YET_VALID", "GRANT_EXPIRED", "GRANT_REVOKED",
  "LIVE_RUN_LIMIT_REACHED", "LIVE_BUDGET_EXHAUSTED", "LEDGER_UNAVAILABLE", "LIVE_BUSY", "LIVE_DISABLED", "READY"] as const;
const text = (max: number) => z.string().min(1).max(max);

export const CatalogSchema = z.strictObject({
  modes: z.strictObject({ synthetic: z.literal("AVAILABLE"), recorded_live: z.enum(["AVAILABLE", "UNAVAILABLE"]), live: z.enum(["LOCKED", "AVAILABLE"]) }),
  scenarios: z.array(z.strictObject({ id: text(64), label: text(120), mode: z.enum(["fixture", "recorded_live"]), available: z.boolean(), input: AuditInputSchema })).max(12),
  recorded_history: z.array(z.strictObject({
    probe: z.enum(["P01", "P02", "P03", "P03R", "P04", "P05", "P06"]), attempt_id: z.uuid(), endpoint: z.enum(["/search", "/v2/tags", "/v2/insights"]),
    recorded_at: z.iso.datetime().nullable(), http_status: z.number().int().min(100).max(599).nullable(), outcome: z.enum(RECORDED_OUTCOMES),
    response_bytes: z.number().int().min(0).max(262_145).nullable(), shortlist_class: z.enum(SHORTLIST_CLASSES).optional(),
  })).max(12),
  // The exact lookups the recordings answer. Anything else is NOT_CAPTURED (UNKNOWN), never a guess.
  recorded_coverage: z.strictObject({ artist: z.array(text(200)).max(8), movie: z.array(text(200)).max(8), place: z.array(text(200)).max(8), tag: z.array(text(200)).max(8) }),
  pending_request: z.strictObject({ id: text(16), state: z.enum(["OWNER_APPROVAL_REQUIRED", "REVIEW_REQUIRED"]), detail: text(400) }).nullable(),
  live_gate: z.strictObject({ status: z.enum(["LOCKED", "AVAILABLE"]), reason: z.enum(LIVE_LOCK_REASONS), detail: text(400),
    remaining_requests: z.number().int().min(0).max(14).nullable(), remaining_runs: z.number().int().min(0).max(5).nullable(), expires_at: z.iso.datetime().nullable() }),
  custom_input: z.strictObject({ schema_revision: z.literal("tastegate.input.v0"), max_preferences: z.literal(3), max_recommendations: z.literal(3), max_constraints: z.literal(8),
    max_claims: z.literal(5), max_text: z.literal(200), max_bytes: z.literal(16_384), countries: z.array(z.strictObject({ code: z.string().regex(/^[A-Z]{2}$/), name: text(60) })).max(30) }),
});
export type Catalog = z.infer<typeof CatalogSchema>;
export const CUSTOM_INPUT_LIMITS = Object.freeze({ schema_revision: "tastegate.input.v0" as const, max_preferences: 3 as const, max_recommendations: 3 as const, max_constraints: 8 as const,
  max_claims: 5 as const, max_text: 200 as const, max_bytes: 16_384 as const, countries: COUNTRIES.map((c) => ({ ...c })) });
