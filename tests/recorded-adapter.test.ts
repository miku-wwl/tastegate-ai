import { rm } from "node:fs/promises";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecordedAdapter, loadRecordedEvidence, RecordedEvidenceUnavailableError, RECORDED_SPECS } from "../src/qloo/recorded-adapter";
import { providerRef } from "../src/qloo/provider-ref";
import { AUTHORED, authoredBodies, seedRecordedRoot } from "./helpers/recorded-root";

const roots: string[] = [];
const seed = async (options?: Parameters<typeof seedRecordedRoot>[0]) => { const root = await seedRecordedRoot(options); roots.push(root); return root; };
const ctx = { runId: "authored", callId: "authored", signal: new AbortController().signal };
const attemptDir = (probe: string) => { const s = RECORDED_SPECS.find((x) => x.probe === probe)!; return `private/qloo-probes/${probe.toLowerCase()}/attempts/${s.attempt}`; };
beforeEach(() => { vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this suite")); });
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
afterAll(async () => { for (const root of roots) await rm(root, { recursive: true, force: true }); });

describe("verified loading of owner-approved recordings", () => {
  it("verifies every capture and keeps the oversized P03 as non-replayable history", async () => {
    const set = await loadRecordedEvidence(await seed());
    expect(set.history.map((h) => [h.probe, h.outcome])).toEqual([["P01", "REPLAYABLE"], ["P02", "REPLAYABLE"],
      ["P03", "RESPONSE_TOO_LARGE_NOT_SAVED"], ["P03R", "REPLAYABLE"], ["P04", "REPLAYABLE"], ["P05", "REPLAYABLE"]]);
    expect(set.discovery.capture.request_params["signal.interests.entities"]).toBe(providerRef("entity", AUTHORED.artist));
    expect(JSON.stringify([...set.searches.values()])).not.toContain(AUTHORED.venue);
  });
  const tamper = (path: string, edit: (text: string) => string) => (files: Map<string, Buffer>) => { files.set(path, Buffer.from(edit(files.get(path)!.toString("utf8")))); };
  it.each([
    ["a changed raw byte", { mutate: tamper(`${attemptDir("P03R")}/response.raw.json`, (t) => t.replace("New York", "New Yorx")) }],
    ["a raw file missing from the manifest", { skipManifestEntry: `${attemptDir("P02")}/response.raw.json` }],
    ["an altered request profile", { mutate: tamper(`${attemptDir("P01")}/attempt.json`, (t) => t.replace('"take":"5"', '"take":"6"')) }],
    ["a summary claiming another HTTP status", { mutate: tamper(`${attemptDir("P04")}/summary.json`, (t) => t.replace('"http_status":200', '"http_status":201')) }],
    ["a P05 signal unbound from the reviewed identity", { mutate: tamper(`${attemptDir("P05")}/attempt.json`, (t) => t.replace(`"signal_entity_id":"${AUTHORED.artist}"`, `"signal_entity_id":"${AUTHORED.otherArtist}"`)) }],
    ["an edited identity review", { mutate: tamper("private/qloo-probes/p05-radiohead-identity.private.json", (t) => t.replace("independent_review_completed\":true", "independent_review_completed\":true,\"x\":1")) }],
    ["a reviewed artist absent from the P01 capture", { bodies: authoredBodies({ P01: { results: [{ entity_id: AUTHORED.otherArtist, name: "Other", types: ["urn:entity:artist"] }] } }) }],
    ["an Insights subtype mismatch", { bodies: authoredBodies({ P05: { success: true, results: { entities: [{ entity_id: AUTHORED.far, name: "X", type: "urn:entity", subtype: "urn:entity:brand" }] } } }) }],
    ["more results than the reviewed take", { bodies: authoredBodies({ P03R: { results: [1, 2].map((n) => ({ entity_id: `v${n}`, name: "V", types: ["urn:entity:place"] })) } }) }],
  ])("makes recorded mode unavailable on %s, with a fixed error", async (_, options) => {
    const error = await loadRecordedEvidence(await seed(options)).catch((e) => e);
    expect(error).toBeInstanceOf(RecordedEvidenceUnavailableError); expect(error.message).toBe("RECORDED_EVIDENCE_UNAVAILABLE");
  });
  it("is unavailable when the private directory does not exist", async () => {
    const root = await seed(); await rm(`${root}/private`, { recursive: true, force: true });
    await expect(loadRecordedEvidence(root)).rejects.toBeInstanceOf(RecordedEvidenceUnavailableError);
  });
});

describe("exact-request replay without network I/O", () => {
  it("answers only the recorded lookups and marks everything else unavailable", async () => {
    const adapter = createRecordedAdapter(await loadRecordedEvidence(await seed()));
    const hit = await adapter.searchEntity({ query: "Blue Note New York", requested_kind: "place" }, ctx);
    expect(hit.capture?.probe).toBe("P03R"); expect(hit.snapshot.kind).toBe("entity_lookup");
    for (const request of [{ query: "Blue Note", requested_kind: "place" as const }, { query: "Blue Note New York", requested_kind: "artist" as const },
      { query: "Village Vanguard", requested_kind: "place" as const }]) {
      const miss = await adapter.searchEntity(request, ctx);
      expect(miss).toMatchObject({ capture: null, snapshot: { kind: "unavailable", reason: "NOT_CAPTURED", request: { operation: "entity_lookup", ...request } } });
    }
    expect((await adapter.searchTags("jazz", ctx)).capture?.probe).toBe("P04");
    expect((await adapter.searchTags("Jazz", ctx)).snapshot.kind).toBe("unavailable");
    const rank = await adapter.rankPlaces({ preference_entity_ids: [providerRef("entity", AUTHORED.artist)], preference_tag_ids: [], candidate_entity_ids: [] }, ctx);
    expect(rank).toMatchObject({ capture: null, snapshot: { kind: "unavailable", reason: "APPROVAL_REQUIRED" } });
  });
  it("replays discovery only for the exact recorded context and applies exclusions client-side", async () => {
    const adapter = createRecordedAdapter(await loadRecordedEvidence(await seed()));
    const artist = providerRef("entity", AUTHORED.artist); const far = providerRef("entity", AUTHORED.far);
    const exact = { preference_entity_ids: [artist], preference_tag_ids: [], exclude_entity_ids: [], signal_scope: "first_confirmed_artist" as const, take: 1, exclusion: "client" as const };
    const hit = await adapter.discoverPlaces(exact, ctx);
    expect(hit.snapshot).toMatchObject({ kind: "discover_places", client_excluded_ids: [], scores: [{ entity_id: far, query_affinity: 0.5 }], candidates: [{ id: far, city: "Authored City" }] });
    const excluded = await adapter.discoverPlaces({ ...exact, exclude_entity_ids: [far] }, ctx);
    expect(excluded.snapshot).toMatchObject({ kind: "discover_places", candidates: [], client_excluded_ids: [far] });
    for (const changed of [{ preference_entity_ids: [providerRef("entity", AUTHORED.otherArtist)] }, { preference_tag_ids: [providerRef("tag", AUTHORED.musicTag)] },
      { take: 2 }, { exclusion: "server" as const }, { signal_scope: "all_confirmed" as const }])
      expect((await adapter.discoverPlaces({ ...exact, ...changed }, ctx)).snapshot).toMatchObject({ kind: "unavailable", reason: "NOT_CAPTURED" });
  });
  it("returns copies, so callers cannot mutate the verified recordings", async () => {
    const adapter = createRecordedAdapter(await loadRecordedEvidence(await seed()));
    const first = await adapter.searchEntity({ query: "Radiohead", requested_kind: "artist" }, ctx);
    if (first.snapshot.kind === "entity_lookup") first.snapshot.matches[0]!.name = "Mutated";
    const second = await adapter.searchEntity({ query: "Radiohead", requested_kind: "artist" }, ctx);
    expect(second.snapshot.kind === "entity_lookup" && second.snapshot.matches[0]!.name).toBe("Authored Band");
  });
});
