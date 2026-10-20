import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { AuditReportSchema, ProviderAuditReportSchema } from "../../src/domain/report-schema";

// The test server runs with an authored fake live configuration AND the operator kill switch (see playwright.config.ts):
// the app must stay synthetic/recorded only, can never start a live request, and must never echo that canary key.
const canary = "local-browser-canary-not-a-provider-key";
const recordedHere = existsSync("private/qloo-probes/p05/attempts/154bd4c0-ea64-49c5-ad95-cb57efd7647a/response.raw.json");
const PUBLIC_SHOTS = ".artifacts/screens"; const PRIVATE_SHOTS = "private/phase2b-screens";
function guard(page: Page) {
  const externalRequests: string[] = []; const errors: string[] = [];
  void page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") { externalRequests.push(url.origin); await route.abort(); } else await route.continue();
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return { externalRequests, errors };
}
const auditResponse = (page: Page) => page.waitForResponse((r) => r.url().endsWith("/api/audit") && r.request().method() === "POST");
const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
const step = (page: Page, name: string) => page.getByRole("navigation", { name: "Progress" }).getByRole("button", { name });
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
// Scrolled to the top first: a full-page capture otherwise paints the sticky header at the current scroll offset.
// The capture also un-pins the sticky header and run bar (a pinned element would be painted mid-page in a full-page image).
async function shot(page: Page, dir: string, name: string) {
  await mkdir(dir, { recursive: true }); await page.evaluate(() => window.scrollTo(0, 0));
  const style = await page.addStyleTag({ content: ".topbar, .run-bar { position: static !important; }" });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true }); await style.evaluate((el) => (el as Element).remove());
}
async function runScenario(page: Page, label: RegExp) {
  await page.getByRole("radio", { name: label }).check();
  const pending = auditResponse(page); await page.getByRole("button", { name: "Run the gate" }).click(); return await pending;
}

test("a synthetic audit walks the five screens, keeps residual uncertainty visible and saves evidence", async ({ page }) => {
  const g = guard(page);
  await page.goto("/");
  const chips = page.getByLabel("Data modes");
  await expect(page.getByRole("button", { name: "Run the gate" })).toBeVisible(); // the catalog has loaded
  await expect(chips).toContainText("FIXTURE: available"); await expect(chips).toContainText("LIVE: locked"); await expect(chips).not.toContainText("…");
  await expect(page.getByRole("navigation", { name: "Progress" }).getByRole("button")).toHaveCount(5);
  await expect(step(page, "Input")).toHaveAttribute("aria-current", "step"); await expect(step(page, "Audit")).toBeDisabled();
  await shot(page, PUBLIC_SHOTS, "synthetic-1-input");
  const response = await runScenario(page, /NYC evening: mixed evidence/); expect(response.status()).toBe(200);
  const report = AuditReportSchema.parse(await response.json());
  expect(report.source_mode).toBe("fixture");
  expect(JSON.stringify(report)).not.toContain(canary); expect(await page.content()).not.toContain(canary);
  // Synthetic runs have no identity step: it is marked not needed, and the audit opens directly, with focus on its heading.
  await expect(heading(page, "Audit: what holds up")).toBeFocused(); await expect(page.getByRole("status")).toHaveText("Final status: UNKNOWN. Completion: partial.");
  await expect(page.getByRole("note").first()).toContainText("FIXTURE"); await expect(step(page, "Identity (not needed)")).toBeDisabled();
  await expect(page.getByText("What the gate found")).toBeVisible(); await shot(page, PUBLIC_SHOTS, "synthetic-3-audit");
  await page.getByRole("button", { name: "Next: Repair" }).click();
  await expect(heading(page, "Repair and revalidate")).toBeFocused(); await expect(page.getByText(/^Accepted after revalidation:/)).toBeVisible();
  await expect(page.getByText("Repair verified").first()).toBeVisible(); await shot(page, PUBLIC_SHOTS, "synthetic-4-repair");
  await page.getByRole("button", { name: "Next: Compare" }).click();
  await expect(heading(page, "Before and after")).toBeFocused(); await expect(page.getByLabel("What changed")).toBeVisible();
  await shot(page, PUBLIC_SHOTS, "synthetic-5-compare");
  await page.getByText("Inspect the validated report JSON").click();
  expect(JSON.parse(await page.getByTestId("report-json").innerText()).run_id).toBe(report.run_id);
  expect(report.usage.fixture_calls).toBe(9); expect(report.usage.qloo_dispatches).toBe(0);
  expect(g.externalRequests).toEqual([]); expect(g.errors).toEqual([]);
  await mkdir(".artifacts", { recursive: true });
  await writeFile(".artifacts/phase2b-browser-run.json", JSON.stringify({ evidence_kind: "ACTUAL_LOCAL_BROWSER_EXECUTION_SYNTHETIC_DATA", report, externalRequests: g.externalRequests, errors: g.errors }, null, 2) + "\n");
});

test("repair is reported honestly: verified, then rejected on a separate run, never relabelled", async ({ page }) => {
  await page.goto("/");
  await runScenario(page, /Wrong city → validated repair/);
  await expect(page.getByRole("status")).toHaveText("Final status: PASS. Completion: complete.");
  await page.getByRole("button", { name: "Next: Repair" }).click();
  await expect(page.getByText("Repair verified").first()).toBeVisible(); await expect(page.getByText(/passed every revalidation gate/)).toBeVisible();
  await page.getByRole("button", { name: "Next: Compare" }).click();
  await expect(page.getByText("Replace — revalidated alternative")).toBeVisible();
  await page.getByRole("button", { name: "Audit another plan" }).click();
  await expect(heading(page, "What should the gate audit?")).toBeFocused();
  await runScenario(page, /Replacement also violates the city constraint/);
  await expect(page.getByRole("status")).toHaveText("Final status: BLOCKED. Completion: complete.");
  await page.getByRole("button", { name: "Next: Repair" }).click();
  await expect(page.getByText("Replacement rejected").first()).toBeVisible(); await expect(page.getByText("Repair verified")).toHaveCount(0);
  await expect(page.getByText(/^Rejected after revalidation:/)).toBeVisible(); await expect(page.getByText(/is not\s+presented as repaired/)).toBeVisible();
  await page.getByRole("button", { name: "Next: Compare" }).click();
  await expect(page.getByText("Remove — failed a hard check")).toBeVisible(); await expect(page.getByText("Replace — revalidated alternative")).toHaveCount(0);
});

test("HTTP server rejects live mode, expanded budgets, forgery and every live attempt on a switched-off server", async ({ request }) => {
  for (const body of [{ scenario: "nyc-evening", mode: "live" }, { scenario: "nyc-evening", maxCalls: 99 }, { scenario: "nyc-evening", evidence: [] },
    { scenario: "nyc-evening", confirmations: [] }, { scenario: "recorded-nyc-evening", confirmations: [{ target_id: "evil", decision: "skip" }] },
    { scenario: "recorded-nyc-evening", confirmations: [{ target_id: "p1", decision: "select", ref: "not-a-reference" }] },
    { scenario: "nyc-evening", source: "live", live_ack: "RUN_LIVE_QLOO_REQUESTS" }, { scenario: "recorded-nyc-evening", source: "fixture" }]) {
    expect((await request.post("/api/audit", { data: body })).status()).toBe(400);
  }
  // The operator kill switch is set on this server: even a well-formed, acknowledged live request is refused before any gate.
  const refused = await request.post("/api/audit", { data: { scenario: "recorded-nyc-evening", source: "live", live_ack: "RUN_LIVE_QLOO_REQUESTS" } });
  expect(refused.status()).toBe(403); expect(await refused.json()).toEqual({ error: "LIVE_UNAVAILABLE", reason: "LIVE_DISABLED" });
  const catalog = await (await request.get("/api/audit")).json();
  expect(catalog.modes.live).toBe("LOCKED"); expect(catalog.live_gate).toMatchObject({ status: "LOCKED", reason: "LIVE_DISABLED" }); expect(JSON.stringify(catalog)).not.toContain(canary);
  const oversized = await request.post("/api/audit", { data: { scenario: "nyc-evening", padding: "x".repeat(30_000) } }); expect(oversized.status()).toBe(413);
});

test("the live gate is visible, labelled and cannot be started from the page", async ({ page }) => {
  const g = guard(page); await page.goto("/");
  const card = page.getByRole("region", { name: /Live Qloo: locked/ });
  await expect(card).toBeVisible(); await expect(card).toContainText("switched off by the operator");
  await card.getByText("How the owner unlocks it").click(); await expect(card).toContainText("It is never sent to the browser");
  await page.getByRole("radio", { name: "Your own plan" }).check();
  await expect(page.getByRole("radio", { name: /LIVE — fresh Qloo requests/ })).toBeDisabled();
  await expect(page.getByRole("checkbox")).toHaveCount(0); // no acknowledgement box exists while live is locked
  await shot(page, PUBLIC_SHOTS, "live-locked");
  expect(await page.content()).not.toContain(canary); expect(g.externalRequests).toEqual([]); expect(g.errors).toEqual([]);
});

test("a custom plan: guided form, coverage hints, validation and JSON export/import", async ({ page }) => {
  const g = guard(page); await page.goto("/");
  await page.getByRole("radio", { name: "Your own plan" }).check();
  // Validation first: nothing is sent while the form is incomplete.
  let posted = 0; page.on("request", (r) => { if (r.method() === "POST") posted++; });
  // A custom plan can always be run (with no recordings every lookup is UNKNOWN), so validation applies either way.
  await expect(page.getByRole("button", { name: "Run the gate" })).toBeEnabled();
  await page.getByRole("button", { name: "Run the gate" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Check your input" }); await expect(alert).toBeVisible();
  await expect(alert.getByRole("link", { name: "The city is required." })).toBeVisible(); expect(posted).toBe(0);
  await page.getByRole("button", { name: "Load the worked example" }).click();
  await expect(page.getByLabel("City")).toHaveValue("New York");
  if (recordedHere) {
    await expect(page.getByText(/A recorded Qloo response exists for this exact text/)).toHaveCount(2); // Radiohead, Blue Note New York
    await expect(page.getByText(/No recording for this text/)).toHaveCount(1);                           // Corner Jazz Cellar
    await page.getByLabel("Name of the place").first().fill("blue note new york");
    await page.getByRole("button", { name: /Use “Blue Note New York”/ }).click(); await expect(page.getByLabel("Name of the place").first()).toHaveValue("Blue Note New York");
  } else await expect(page.getByText(/No recording for this text/)).toHaveCount(3);
  // Unsafe characters are refused where they are typed, and never echoed back.
  const bad = "x" + String.fromCodePoint(0x202e) + "y";
  await page.getByLabel("City").fill(bad); await page.getByRole("button", { name: "Export input (JSON)" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Fix the highlighted fields" })).toBeVisible(); await expect(page.getByText(/aren’t allowed/).first()).toBeVisible();
  // The typed value stays in the user's own field; no message, alert or hint repeats it.
  expect((await page.locator(".field-error, [role=alert], .hint").allInnerTexts()).join(" ")).not.toContain(String.fromCodePoint(0x202e));
  await page.getByLabel("City").fill("New York");
  // Export, then import the exported file into a fresh form.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export input (JSON)" }).click()]);
  const exported = JSON.parse(readFileSync((await download.path())!, "utf8")); expect(download.suggestedFilename()).toBe("tastegate-input.json");
  expect(exported).toMatchObject({ schema_revision: "tastegate.input.v0", destination: "New York" }); expect(exported.recommendations.length).toBe(2);
  await page.getByLabel("City").fill("Elsewhere");
  await page.locator('input[type="file"]').setInputFiles({ name: "input.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(page.getByLabel("City")).toHaveValue("New York"); await expect(page.getByText("Imported. Review the fields below")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{ not json") });
  await expect(page.getByText("That file isn’t valid JSON. Nothing was imported.")).toBeVisible(); await expect(page.getByLabel("City")).toHaveValue("New York");
  await page.locator('input[type="file"]').setInputFiles({ name: "huge.json", mimeType: "application/json", buffer: Buffer.from(" ".repeat(20_000)) });
  await expect(page.getByText("That file is larger than 16 KiB. Nothing was imported.")).toBeVisible();
  await shot(page, PUBLIC_SHOTS, "custom-form");
  expect(posted).toBe(0); expect(await page.content()).not.toContain(canary); expect(g.externalRequests).toEqual([]); expect(g.errors).toEqual([]);
});

test("every form control has an accessible name, and keyboard users get a skip link and focused headings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run the gate" })).toBeVisible(); // the page has hydrated; focus is still at the document start
  await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Skip to the content" })).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page).toHaveURL(/#main$/);
  await page.getByRole("radio", { name: "Your own plan" }).check();
  const unlabeled = await page.evaluate(() => [...document.querySelectorAll("input, select, textarea")].filter((el) => !(el as HTMLInputElement).labels?.length && !el.getAttribute("aria-label")).length);
  expect(unlabeled).toBe(0);
  expect(await page.locator("h1").count()).toBe(1);
});

test("recorded Qloo evidence: explicit identity confirmation, then an out-of-city discovery is rejected", async ({ page }) => {
  const g = guard(page);
  await page.goto("/");
  const card = page.getByRole("radio", { name: /audited with recorded Qloo responses/ });
  if (!recordedHere) {
    await expect(card).toBeDisabled(); await expect(page.getByText(/Unavailable on this server/).first()).toBeVisible(); return;
  }
  await card.check();
  await expect(page.getByRole("radio", { name: /RECORDED — replay/ })).toBeChecked();
  await page.getByRole("button", { name: "Run the gate" }).click();
  await expect(page.getByRole("status")).toHaveText("Waiting for your confirmation: 4 identities.");
  await expect(heading(page, "Confirm identities")).toBeFocused(); await expect(step(page, "Audit")).toBeDisabled();
  const proceed = page.getByRole("button", { name: /Continue the audit/ });
  await expect(proceed).toBeDisabled();
  // Choices by public query label; candidate IDs never reach the page.
  await page.getByRole("radio", { name: /^Radiohead — artist/ }).check();
  await page.getByRole("radio", { name: /^In the Mood for Love — movie/ }).check();
  await page.getByRole("radio", { name: /^Jazz — genre · music/ }).check();
  await page.getByRole("radio", { name: /^Blue Note — place/ }).check();
  await mkdir(PRIVATE_SHOTS, { recursive: true }); await shot(page, PRIVATE_SHOTS, "recorded-2-identity");
  const pending = auditResponse(page);
  await proceed.click();
  const report = ProviderAuditReportSchema.parse(await (await pending).json());
  expect(report.source_mode).toBe("recorded_live");
  // Five recorded replays (3 identities, the recorded venue, the recorded discovery) plus, once the approved shortlist request has been executed
  // and sealed, a sixth: the one-query ranking. Honest gaps: the second venue, the replacement's independent lookup and, before P06, the ranking.
  const ranked = report.evidence.some((e) => e.capture?.probe === "P06");
  expect(report.usage).toMatchObject({ qloo_dispatches: 0, recorded_replays: ranked ? 6 : 5, unavailable_operations: ranked ? 2 : 3 });
  await expect(page.getByRole("status")).toHaveText("Final status: UNKNOWN. Completion: partial.");
  await expect(heading(page, "Audit: what holds up")).toBeFocused(); await expect(page.getByRole("note").first()).toContainText("RECORDED");
  await expect(page.getByText(/according to the provider's own data/)).toBeVisible(); await shot(page, PRIVATE_SHOTS, "recorded-3-audit");
  await page.getByRole("button", { name: "Next: Repair" }).click();
  await expect(page.getByText("Replacement rejected").first()).toBeVisible(); await expect(page.getByText(/geography-filtered discovery request/)).toBeVisible();
  await expect(page.getByText("Repair verified")).toHaveCount(0); await shot(page, PRIVATE_SHOTS, "recorded-4-repair");
  await page.getByRole("button", { name: "Next: Compare" }).click();
  // With a sealed ranking the verified venue is REVIEW (ranked in the same query as the proposal); without it, "not yet established".
  await expect(page.getByText(ranked ? "Keep — needs human review" : "Keep — cultural fit not yet established")).toBeVisible();
  if (ranked) await expect(page.getByText(/Rank [12] in query/).first()).toBeVisible();
  await shot(page, PRIVATE_SHOTS, "recorded-5-compare");
  expect(await page.content()).not.toContain(canary);
  expect(g.externalRequests).toEqual([]); expect(g.errors).toEqual([]);
});

test("a custom plan audited against the recordings: covered lookups use evidence, the rest is UNKNOWN", async ({ page }) => {
  test.skip(!recordedHere, "needs the owner's private recordings");
  const g = guard(page); await page.goto("/");
  await page.getByRole("radio", { name: "Your own plan" }).check(); await page.getByRole("button", { name: "Load the worked example" }).click();
  const pending = auditResponse(page); await page.getByRole("button", { name: "Run the gate" }).click();
  const report = ProviderAuditReportSchema.parse(await (await pending).json());
  expect(report).toMatchObject({ source_mode: "recorded_live", scenario_id: "custom-input", usage: { qloo_dispatches: 0 } });
  await expect(heading(page, "Confirm identities")).toBeFocused(); await expect(page.getByRole("note").first()).toContainText("RECORDED");
  await page.getByRole("radio", { name: /^Radiohead — artist/ }).check(); await page.getByRole("radio", { name: /^Blue Note — place/ }).check();
  const second = auditResponse(page); await page.getByRole("button", { name: /Continue the audit/ }).click();
  const done = ProviderAuditReportSchema.parse(await (await second).json());
  await expect(heading(page, "Audit: what holds up")).toBeFocused();
  const uncovered = done.original_audits.find((a) => a.candidate_id === "rec-2")!; expect(uncovered.verdict).toBe("UNKNOWN"); expect(done.final_status).not.toBe("PASS");
  await expect(page.getByRole("article", { name: /Corner Jazz Cellar: Unknown/ })).toBeVisible();
  await shot(page, PRIVATE_SHOTS, "custom-3-audit");
  expect(await page.content()).not.toContain(canary); expect(g.externalRequests).toEqual([]); expect(g.errors).toEqual([]);
});

test("the product remains usable in a mobile viewport on every screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  expect(await overflows(page)).toBe(false); await shot(page, PUBLIC_SHOTS, "mobile-1-input");
  await page.getByRole("radio", { name: "Your own plan" }).check(); await page.getByRole("button", { name: "Load the worked example" }).click();
  expect(await overflows(page)).toBe(false); await shot(page, PUBLIC_SHOTS, "mobile-1-custom");
  await page.getByRole("radio", { name: "Ready-made sample plans" }).check();
  await runScenario(page, /A valid synthetic recommendation/);
  await expect(page.getByRole("status")).toHaveText("Final status: PASS. Completion: complete.");
  expect(await overflows(page)).toBe(false); await shot(page, PUBLIC_SHOTS, "mobile-3-audit");
  await page.getByRole("button", { name: "Next: Repair" }).click(); expect(await overflows(page)).toBe(false); await shot(page, PUBLIC_SHOTS, "mobile-4-repair");
  await page.getByRole("button", { name: "Next: Compare" }).click(); expect(await overflows(page)).toBe(false); await shot(page, PUBLIC_SHOTS, "mobile-5-compare");
});

test("the evaluation results page states method, numbers, honest limits and what was not run", async ({ page }) => {
  const g = guard(page); await page.goto("/results");
  await expect(page.getByRole("heading", { name: "Does the gate keep bad recommendations out?" })).toBeVisible();
  const holdout = page.getByRole("region", { name: /Seeded holdout/ });
  await expect(holdout).toContainText("RUN"); await expect(holdout.getByRole("table")).toBeVisible();
  await expect(holdout.getByRole("columnheader", { name: "TasteGate" })).toBeVisible();
  await expect(holdout.getByRole("row", { name: /Hard-constraint violations that reach the user/ })).toBeVisible();
  const live = page.getByRole("region", { name: /Live Qloo requests/ }); await expect(live).toContainText("NOT RUN"); await expect(live.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "What this does not show" })).toBeVisible();
  expect(await overflows(page)).toBe(false); await shot(page, PUBLIC_SHOTS, "results");
  await page.setViewportSize({ width: 390, height: 844 }); expect(await overflows(page)).toBe(false); await shot(page, PUBLIC_SHOTS, "mobile-results");
  expect(await page.content()).not.toContain(canary); expect(g.externalRequests).toEqual([]); expect(g.errors).toEqual([]);
  await page.goto("/"); await page.getByRole("link", { name: "Evaluation results" }).click(); await expect(page).toHaveURL(/\/results$/);
});
