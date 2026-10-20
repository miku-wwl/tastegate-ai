import { runAudit } from "../audit/workflow";
import { AuditInputSchema, type AuditInput, type Entity } from "../domain/contracts";
import { createFixtureAdapter } from "../qloo/fixture-adapter";
import type { FixtureWorld } from "../qloo/ports";
import { gateOutcome } from "./baselines";
import type { Built, EvalCase } from "./harness";
import { classifyEntity, planLimit } from "./oracle";

// A seeded, synthetic holdout. Every plan is generated from a seed, and the generator (not the gate) knows what each slot
// really is, so the oracle is independent of the audit rules. The generator and its invariants were written before the
// holdout seed was ever run against the gate; a failing plan is reported, never quietly re-seeded.
//   HONEST LIMITS: a synthetic world proves the logic handles constructed failure patterns, not that real recommendations
//   behave this way. It is not Qloo data and says nothing about cultural relevance.
export const HOLDOUT_SEED = 20_261_020;
export type SlotKind = "valid" | "wrong_city" | "wrong_country" | "wrong_type" | "unresolvable" | "missing_city" | "ambiguous";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296; };
}
const CITIES: ReadonlyArray<readonly [string, string]> = [["Alderport", "US"], ["Brightwater", "GB"], ["Cinderfall", "CA"], ["Dunmere", "AU"], ["Eastvale", "NZ"],
  ["Fernhollow", "FR"], ["Glenmoor", "DE"], ["Harrowgate", "ES"], ["Ironbridge", "IT"], ["Juniper Bay", "JP"]];
const ADJECTIVES = ["Amber", "Birch", "Cobalt", "Dune", "Ember", "Fable", "Garnet", "Hollow", "Indigo", "Juniper", "Kestrel", "Lumen", "Marble", "Nimbus", "Opal", "Quartz", "Russet", "Slate", "Tidal", "Umber"];
const NOUNS = ["Room", "Hall", "Cellar", "Garden", "Terrace", "Loft", "Atrium", "Annex", "Court", "Studio", "Gallery", "Lounge"];
const COUNTRY_OTHER = ["US", "GB", "CA", "AU", "NZ", "FR", "DE", "ES", "IT", "JP"];

type Slot = { id: string; kind: SlotKind; intended: Entity | null };
type Generated = { input: AuditInput; world: FixtureWorld; slots: Slot[]; limit: number; tooMany: boolean };

export function generatePlan(seed: number, index: number): Generated {
  const rng = mulberry32((Math.imul(seed, 1_000_003) + Math.imul(index + 1, 7_919)) >>> 0);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!;
  const [city, country] = pick(CITIES);
  const used = new Set<string>(); let serial = 0;
  const name = () => { for (;;) { const n = `SYNTHETIC ${pick(ADJECTIVES)} ${pick(NOUNS)}`; if (!used.has(n)) { used.add(n); return n; } } };
  const place = (over: Partial<Entity> & { name: string }): Entity => ({ id: `synthetic:e${++serial}`, kind: "place", city, country, ...over });
  const otherCity = () => { for (;;) { const c = pick(CITIES); if (c[0] !== city) return c; } };
  const count = 1 + Math.floor(rng() * 3);
  const tooMany = count >= 2 && rng() < 0.12; const limit = tooMany ? count - 1 : Math.min(3, count + Math.floor(rng() * 2));
  const entities: Entity[] = []; const slots: Slot[] = []; let ambiguous = 0;
  const kindFor = (): SlotKind => {
    const x = rng();
    const k: SlotKind = x < 0.42 ? "valid" : x < 0.56 ? "wrong_city" : x < 0.64 ? "wrong_country" : x < 0.70 ? "wrong_type" : x < 0.80 ? "unresolvable" : x < 0.90 ? "missing_city" : x < 0.96 ? "ambiguous" : "valid";
    return k === "ambiguous" && ambiguous++ >= 1 ? "valid" : k;
  };
  const recommendations: AuditInput["recommendations"] = [];
  for (let i = 0; i < count; i++) {
    const kind = kindFor(); const n = name(); let intended: Entity | null = null;
    if (kind === "valid") { intended = place({ name: n }); entities.push(intended); }
    else if (kind === "wrong_city") { intended = place({ name: n, city: otherCity()[0] }); entities.push(intended); }
    else if (kind === "wrong_country") { intended = place({ name: n, country: pick(COUNTRY_OTHER.filter((c) => c !== country)) }); entities.push(intended); }
    else if (kind === "wrong_type") { intended = place({ name: n, kind: "brand" }); entities.push(intended); }
    else if (kind === "missing_city") { intended = place({ name: n, city: null }); entities.push(intended); }
    else if (kind === "ambiguous") {
      const real = place({ name: n }); const decoy = place({ name: n, city: otherCity()[0] }); intended = real;
      if (rng() < 0.5) entities.push(real, decoy); else entities.push(decoy, real);
    }
    slots.push({ id: `rec-${i + 1}`, kind, intended });
    recommendations.push({ id: `rec-${i + 1}`, name: n, address_hint: null, claims: rng() < 0.3 ? ["The agent says you will love it."] : [] });
  }
  const artist: Entity = { id: "synthetic:artist", name: `SYNTHETIC Artist ${index + 1}`, kind: "artist", city: null, country: null }; entities.push(artist);
  let discoveries: string[] = [];
  if (rng() < 0.75) {
    const x = rng(); const d = x < 0.6 ? place({ name: name() }) : x < 0.9 ? place({ name: name(), city: otherCity()[0] }) : place({ name: name(), kind: "brand" });
    entities.push(d); discoveries = [d.id];
  }
  const rankable = entities.filter((e) => e.kind !== "artist" && rng() < 0.85).map((e) => e.id).sort(() => rng() - 0.5);
  const input = AuditInputSchema.parse({ schema_revision: "tastegate.input.v0",
    preferences: [{ id: "pref-1", text: artist.name, kind: "artist", confirmed_anchor: artist.name }],
    task: "Audit a seeded synthetic plan.", destination: city,
    constraints: [{ id: "c1", kind: "city", value: city }, { id: "c2", kind: "country", value: country }, { id: "c3", kind: "entity_type", value: "place" }, { id: "c4", kind: "max_items", value: limit }],
    recommendations });
  const world: FixtureWorld = { fixtureId: `holdout-${seed}-${index}`, entities, tags: [], discoveries, rankOrder: rankable, explainability: "missing" };
  return { input, world, slots, limit, tooMany };
}

// What must hold for ANY plan, whatever the gate decides. None of it depends on how the audit allocates replacements.
function invariants(report: Parameters<NonNullable<EvalCase["check"]>>[0], built: Built): string[] {
  const failures: string[] = []; const kinds = built.slotKinds ?? {}; const limit = planLimit(built.input);
  const outcome = gateOutcome(report);
  const judged = (e: Entity | null) => classifyEntity(e ? built.truthOf?.(e.id) ?? e : null, built.input); // TRUE facts, whatever the adapter reported
  for (const item of outcome.shipped) if (judged(item.entity).class === "VIOLATING") failures.push(`violating item shipped (${item.slot})`);
  if (limit !== null && outcome.shipped.length > limit) failures.push("shipped plan exceeds its own size limit");
  for (const repair of report.repairs.filter((r) => r.accepted)) {
    const proposed = outcome.shipped.find((s) => s.origin === "replacement" && s.slot === repair.replaces)?.entity ?? null;
    if (judged(proposed).class !== "VALID") failures.push(`accepted replacement is not provably valid (${repair.replaces})`);
  }
  const ambiguousPresent = Object.values(kinds).includes("ambiguous");
  if (ambiguousPresent && report.stop_reason !== "NEEDS_INPUT") failures.push("ambiguous identity did not stop for a human decision");
  const tooMany = limit !== null && built.input.recommendations.length > limit;
  for (const [slot, kind] of Object.entries(kinds)) {
    const audit = report.original_audits.find((a) => a.candidate_id === slot);
    if (!audit) { if (!ambiguousPresent) failures.push(`slot ${slot} was not audited`); continue; }
    if (kind === "ambiguous" && audit.resolution === "resolved") failures.push(`ambiguous slot auto-resolved (${slot})`);
    if (kind === "unresolvable" && audit.resolution === "resolved") failures.push(`fabricated identity (${slot})`);
    if (ambiguousPresent) continue; // a paused audit is not complete: only identity and safety are checkable
    if (kind === "valid" && !tooMany && audit.verdict === "BLOCKED") failures.push(`false rejection (${slot})`);
    if ((kind === "wrong_city" || kind === "wrong_country" || kind === "wrong_type") && audit.verdict !== "BLOCKED") failures.push(`violation not flagged (${slot}, ${kind})`);
    if (kind === "missing_city" && (audit.hard_constraints === "pass" || audit.verdict === "PASS" || audit.verdict === "BLOCKED")) failures.push(`missing city fact mishandled (${slot})`);
  }
  const claimsSupported = report.original_audits.filter((a) => (report.input.recommendations.find((x) => x.id === a.candidate_id)?.claims.length ?? 0) > 0 && !a.findings.some((f) => f.code === "CLAIM_UNVERIFIED")).length;
  if (claimsSupported) failures.push("a free-text claim was marked supported");
  return failures;
}

export function holdoutCases(count = 60, seed = HOLDOUT_SEED): EvalCase[] {
  return Array.from({ length: count }, (_, index): EvalCase => ({
    id: `H${String(index + 1).padStart(3, "0")}`, stratum: "SYNTHETIC_HOLDOUT", category: "holdout", paired: true, gold: null, check: invariants,
    description: `Seeded synthetic plan ${index + 1} (seed ${seed})`,
    build: (): Built => {
      const g = generatePlan(seed, index); const adapter = createFixtureAdapter(g.world);
      return { input: g.input, adapter, runGate: () => runAudit(g.input, adapter), slotKinds: Object.fromEntries(g.slots.map((s) => [s.id, s.kind])),
        intended: (slot) => g.slots.find((s) => s.id === slot)?.intended ?? null, truthOf: (id) => g.world.entities.find((e) => e.id === id) ?? null };
    },
  }));
}
