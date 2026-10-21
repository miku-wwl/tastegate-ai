import { lstat, open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { assertServer } from "./boundary-error";
import { buildP06ShortlistReview, deriveP06Shortlist, inspectAcceptedP06Shortlist } from "./p06-shortlist";

// Local-only administration around the one P06 request. Neither function performs HTTP or reads a credential.
// Writes are exclusive (`wx`, mode 0600) so an existing review is never overwritten.
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

// RETIRED. The single P06 approval was registered once, executed once and sealed, so nothing needs to register another. The
// original registration decided from the owner's free-text reply whether it "named only P06"; that is the defect class closed by
// owner-consent.ts (an exact sentence bound to the terms), so the path was removed instead of patched. The historical checkpoint,
// the consent receipt and the ledger it wrote are untouched and are still read, unchanged, by the modules that verify them.
export async function registerP06Approval(): Promise<never> { throw new Error("P06_APPROVAL_RETIRED"); }
