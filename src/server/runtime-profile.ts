// Runtime profile: WHERE this server is allowed to do what. It is resolved once from the process environment, it can only make a
// server MORE restrictive than its default, and it never contains or prints a secret. Five profiles, one safe default:
//
//   development      the owner's machine. Recorded replay and the owner-granted live gate are possible; nothing else changes.
//   test             automated tests. No recordings, no live, no credential.
//   recorded-local   the owner shows recorded evidence locally. Replay on, live off.
//   production-safe  anything reachable by other people. Synthetic and custom plans only: private recordings are never loaded, live is
//                    off, and a credential must not even be present. This is the default for NODE_ENV=production.
//   production-live  RESERVED. Public live access is not authorized: the profile is refused (see PRODUCTION_LIVE_AUTHORIZED). It cannot
//                    be enabled by an environment variable; it needs a reviewed code change and the operator-side controls in
//                    docs/PUBLIC_DEPLOYMENT_PREPARATION.md (quotas, rate limits, kill switch, observability, rollback).
//
// An environment variable alone is never authority for a live request or for showing provider data: even in `development` a live
// request still needs the owner's grant file and a per-run acknowledgement (src/qloo/live-grant.ts).
export const PROFILES = ["development", "test", "recorded-local", "production-safe", "production-live"] as const;
export type RuntimeProfile = typeof PROFILES[number];
// Flipping this constant is a deliberate, reviewed act; no environment variable, flag or request can do it.
export const PRODUCTION_LIVE_AUTHORIZED = false as const;

export type ProfileCapabilities = {
  recorded_replay: boolean; live_possible: boolean; live_environment: "DEVELOPMENT" | "PRODUCTION_LIVE" | null; public_facing: boolean; credential_allowed: boolean;
};
const CAPABILITIES: Readonly<Record<RuntimeProfile, ProfileCapabilities>> = Object.freeze({
  development: { recorded_replay: true, live_possible: true, live_environment: "DEVELOPMENT", public_facing: false, credential_allowed: true },
  test: { recorded_replay: false, live_possible: false, live_environment: null, public_facing: false, credential_allowed: false },
  "recorded-local": { recorded_replay: true, live_possible: false, live_environment: null, public_facing: false, credential_allowed: false },
  "production-safe": { recorded_replay: false, live_possible: false, live_environment: null, public_facing: true, credential_allowed: false },
  "production-live": { recorded_replay: false, live_possible: false, live_environment: "PRODUCTION_LIVE", public_facing: true, credential_allowed: true },
});
// The most restrictive capabilities, used whenever the configuration is invalid.
const SAFE: RuntimeProfile = "production-safe";

export type ConfigIssue = { code: string; severity: "error" | "warning" };
export type ResolvedProfile = {
  requested: string | null; profile: RuntimeProfile; source: "explicit" | "default"; capabilities: ProfileCapabilities;
  issues: ConfigIssue[]; ok: boolean;
};
type Env = Readonly<Record<string, string | undefined>>;
const present = (value: string | undefined) => value !== undefined && value.trim() !== "";
const SECRET_NAME = /(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i;

export function defaultProfile(env: Env): RuntimeProfile {
  return env.NODE_ENV === "production" ? "production-safe" : env.NODE_ENV === "test" || present(env.VITEST) ? "test" : "development";
}
export function resolveRuntimeProfile(env: Env = process.env): ResolvedProfile {
  const issues: ConfigIssue[] = []; const error = (code: string) => issues.push({ code, severity: "error" }); const warn = (code: string) => issues.push({ code, severity: "warning" });
  const requested = present(env.TASTEGATE_PROFILE) ? env.TASTEGATE_PROFILE!.trim() : null;
  let profile: RuntimeProfile = requested === null ? defaultProfile(env) : SAFE; const source = requested === null ? "default" : "explicit";
  if (requested !== null) {
    if (!(PROFILES as readonly string[]).includes(requested)) error("UNKNOWN_PROFILE");
    else if (requested === "production-live" && !PRODUCTION_LIVE_AUTHORIZED) error("PRODUCTION_LIVE_NOT_AUTHORIZED");
    else profile = requested as RuntimeProfile;
  }
  // A key in a variable that the browser bundle would receive is a leak by construction, in every profile.
  for (const name of Object.keys(env)) if (name.startsWith("NEXT_PUBLIC_") && SECRET_NAME.test(name) && present(env[name])) error("PUBLIC_SECRET_VARIABLE");
  const capabilities = CAPABILITIES[profile];
  if (!capabilities.credential_allowed) {
    // A host that must never reach Qloo should not hold the means to. This is checked, not merely documented.
    if (present(env.QLOO_API_KEY)) error("CREDENTIAL_PRESENT_BUT_NOT_ALLOWED");
    if (present(env.LLM_API_KEY)) error("CREDENTIAL_PRESENT_BUT_NOT_ALLOWED");
    if (env.QLOO_MODE === "live") error("LIVE_MODE_NOT_ALLOWED");
  }
  if (capabilities.public_facing && env.NODE_ENV !== "production") warn("PUBLIC_PROFILE_OUTSIDE_PRODUCTION_BUILD");
  if (profile === "development" && env.NODE_ENV === "production" && requested === null) warn("DEVELOPMENT_PROFILE_IN_PRODUCTION_BUILD");
  const hasError = issues.some((i) => i.severity === "error");
  // Fail closed: invalid configuration never widens anything; it falls back to the most restrictive profile.
  const effective: RuntimeProfile = hasError ? SAFE : profile;
  return { requested, profile: effective, source, capabilities: CAPABILITIES[effective], issues, ok: !hasError };
}
// What a server may do right now, in the vocabulary of the routes.
export function profileSummary(resolved: ResolvedProfile) {
  return {
    profile: resolved.profile, profile_source: resolved.source,
    recorded_replay: resolved.capabilities.recorded_replay ? "ENABLED" : "DISABLED_BY_PROFILE",
    live: resolved.capabilities.live_possible ? "OWNER_GRANT_REQUIRED" : "DISABLED_BY_PROFILE",
    // Sorted and de-duplicated so the output is stable and says each problem once.
    config_errors: [...new Set(resolved.issues.filter((i) => i.severity === "error").map((i) => i.code))].sort(),
    config_warnings: [...new Set(resolved.issues.filter((i) => i.severity === "warning").map((i) => i.code))].sort(),
  } as const;
}
