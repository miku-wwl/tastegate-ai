import type { AuditInput, Entity } from "../domain/contracts";

// Ground truth for scoring, computed from entity attributes alone. It deliberately does NOT import the audit rules or any
// workflow code, so an evaluation cannot pass merely because the gate and its own scorer share a bug.
//   VALID        every applicable hard fact is present and matches the plan's constraints
//   VIOLATING    at least one hard fact is present and contradicts a constraint
//   UNVERIFIABLE a required fact is missing, or the entity is not known (nothing can be claimed either way)
export type TruthClass = "VALID" | "VIOLATING" | "UNVERIFIABLE";
export type Truth = { class: TruthClass; failed: Array<"city" | "country" | "type"> };
type Facts = Pick<Entity, "kind" | "city" | "country">;
const fold = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase("en-US");

export function classifyEntity(entity: Facts | null, input: AuditInput): Truth {
  if (!entity) return { class: "UNVERIFIABLE", failed: [] };
  const city = input.constraints.find((c) => c.kind === "city")?.value; const country = input.constraints.find((c) => c.kind === "country")?.value;
  const wantsPlace = input.constraints.some((c) => c.kind === "entity_type");
  const failed: Truth["failed"] = [];
  if (typeof city === "string" && entity.city !== null && fold(entity.city) !== fold(city)) failed.push("city");
  if (typeof country === "string" && entity.country !== null && entity.country !== country) failed.push("country");
  if (wantsPlace && entity.kind !== "place") failed.push("type");
  if (failed.length) return { class: "VIOLATING", failed };
  const missing = (typeof city === "string" && entity.city === null) || (typeof country === "string" && entity.country === null);
  return { class: missing ? "UNVERIFIABLE" : "VALID", failed: [] };
}
// A plan larger than its own size limit breaks a hard constraint no matter which items it holds.
export const planLimit = (input: AuditInput): number | null => { const c = input.constraints.find((x) => x.kind === "max_items"); return c ? Number(c.value) : null; };
