import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureSha256, inspectCapturedBody, sealReviewedCapture, verifyCaptureSeal } from "../src/qloo/capture-review";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const raw = Buffer.from(JSON.stringify({ success: true, results: { entities: [] } }));
async function seed() {
  const root = await mkdtemp(join(tmpdir(), "tastegate-review-")); roots.push(root);
  const id = randomUUID(), dir = join(root, "private/qloo-probes/p07/attempts", id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  for (const name of ["attempt.json", "summary.json", "response.raw.json"]) await writeFile(join(dir, name), name === "response.raw.json" ? raw : "{}", { mode: 0o600 });
  const review = { body_sha256: captureSha256(raw), structural_review: "REVIEWED", projection_revision: "authored-test.v1", reviewed_utc: new Date().toISOString() };
  return { root, id, dir, review };
}
describe("offline capture inspection and integrity seal (authored bytes)", () => {
  it("reports compatibility without enabling replay, identity validation or repair", () => {
    expect(inspectCapturedBody(raw)).toMatchObject({ status: "REVIEWED_PROJECTION_COMPATIBLE", replay: "NOT_ENABLED", repair: "NOT_VERIFIED", interpretation: { class: "D_EMPTY" } });
    expect(inspectCapturedBody(Buffer.from('{"unobserved":"shape"}')).status).toBe("SCHEMA_REVIEW_REQUIRED");
  });
  it.each([Buffer.from("invalid"), Buffer.from([0xff]), Buffer.alloc(0), Buffer.alloc(262145)])("refuses invalid or out-of-budget bytes", (bytes) => {
    expect(() => inspectCapturedBody(bytes)).toThrow();
  });
  it("seals exact reviewed bytes once, preserves originals, and does not promote a recording", async () => {
    const s = await seed(); const before = await readFile(join(s.dir, "response.raw.json"));
    expect(await sealReviewedCapture(s.root, s.id, s.review)).toEqual({ status: "SEALED_REPLAY_NOT_ENABLED", files: 3, repair: "NOT_VERIFIED" });
    const seal = JSON.parse(await readFile(join(s.dir, "capture-review-seal.json"), "utf8"));
    expect(seal.files).toContainEqual({ name: "response.raw.json", sha256: captureSha256(before) });
    await expect(sealReviewedCapture(s.root, s.id, s.review)).rejects.toThrow("CAPTURE_SEAL_REFUSED");
    expect(await readFile(join(s.dir, "response.raw.json"))).toEqual(before);
    expect(await verifyCaptureSeal(s.root, s.id)).toMatchObject({ status: "CAPTURE_REVIEW_INTACT_REPLAY_NOT_ENABLED", repair: "NOT_VERIFIED" });
    await writeFile(join(s.dir, "summary.json"), '{"edited":true}');
    await expect(verifyCaptureSeal(s.root, s.id)).rejects.toThrow("CAPTURE_SEAL_INVALID");
  });
  it.each(["drift", "unreviewed", "unknown_shape", "traversal", "missing_file"])("fails closed on %s", async (damage) => {
    const s = await seed();
    if (damage === "drift") await writeFile(join(s.dir, "response.raw.json"), "{}");
    if (damage === "unknown_shape") { const bytes = Buffer.from("{}"); await writeFile(join(s.dir, "response.raw.json"), bytes); s.review.body_sha256 = captureSha256(bytes); }
    if (damage === "missing_file") await rm(join(s.dir, "summary.json"));
    await expect(sealReviewedCapture(s.root, damage === "traversal" ? "../escape" : s.id,
      damage === "unreviewed" ? { ...s.review, structural_review: "OWNER_ASSERTION" } : s.review)).rejects.toThrow("CAPTURE_SEAL_REFUSED");
  });
});
