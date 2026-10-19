import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { AuditReportSchema, ProviderAuditReportSchema } from "../../src/domain/report-schema";

// The test server runs with an authored fake live configuration (see playwright.config.ts); the app must
// stay synthetic/recorded only and never echo that canary key.
const canary = "local-browser-canary-not-a-provider-key";
const recordedHere = existsSync("private/qloo-probes/p05/attempts/154bd4c0-ea64-49c5-ad95-cb57efd7647a/response.raw.json");
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

test("browser performs a synthetic audit, shows residual uncertainty and saves evidence", async ({ page }) => {
  const g = guard(page);
  await page.goto("/"); await expect(page.getByText("Live Qloo: locked")).toBeVisible();
  await page.getByRole("radio", { name: /NYC evening: mixed evidence/ }).check();
  const pending = auditResponse(page);
  await page.getByRole("button", { name: "Run the gate" }).click();
  const response = await pending; expect(response.status()).toBe(200);
  const report = AuditReportSchema.parse(await response.json());
  expect(report.source_mode).toBe("fixture");
  expect(JSON.stringify(report)).not.toContain(canary); expect(await page.content()).not.toContain(canary);
  await expect(page.getByRole("status")).toHaveText("Final status: UNKNOWN. Completion: partial.");
  await expect(page.getByText(/^Accepted after revalidation:/)).toBeVisible();
  await expect(page.getByText("What the gate found")).toBeVisible();
  await page.getByText("Inspect the validated report JSON").click();
  expect(JSON.parse(await page.getByTestId("report-json").innerText()).run_id).toBe(report.run_id);
  expect(report.usage.fixture_calls).toBe(10); expect(report.usage.qloo_dispatches).toBe(0);
  expect(g.externalRequests).toEqual([]); expect(g.errors).toEqual([]);
  await mkdir(".artifacts", { recursive: true });
  await writeFile(".artifacts/phase2a-browser-run.json", JSON.stringify({ evidence_kind: "ACTUAL_LOCAL_BROWSER_EXECUTION_SYNTHETIC_DATA",
    report, externalRequests: g.externalRequests, errors: g.errors }, null, 2) + "\n");
  await page.screenshot({ path: ".artifacts/phase2a-synthetic-result.png", fullPage: true });
});

test("browser shows a validated repair and a rejected replacement on separate runs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("radio", { name: /Wrong city → validated repair/ }).check();
  await page.getByRole("button", { name: "Run the gate" }).click();
  await expect(page.getByRole("status")).toHaveText("Final status: PASS. Completion: complete.");
  await expect(page.getByText("Replace — revalidated alternative")).toBeVisible();
  await page.getByRole("radio", { name: /Replacement also violates the city constraint/ }).check();
  await page.getByRole("button", { name: "Run the gate" }).click();
  await expect(page.getByRole("status")).toHaveText("Final status: BLOCKED. Completion: complete.");
  await expect(page.getByText(/^Rejected after revalidation:/)).toBeVisible();
});

test("HTTP server rejects live mode, expanded budgets and confirmation forgery", async ({ request }) => {
  for (const body of [{ scenario: "nyc-evening", mode: "live" }, { scenario: "nyc-evening", maxCalls: 99 }, { scenario: "nyc-evening", evidence: [] },
    { scenario: "nyc-evening", confirmations: [] }, { scenario: "recorded-nyc-evening", confirmations: [{ target_id: "evil", decision: "skip" }] },
    { scenario: "recorded-nyc-evening", confirmations: [{ target_id: "p1", decision: "select", ref: "not-a-reference" }] }]) {
    const response = await request.post("/api/audit", { data: body });
    expect(response.status()).toBe(400);
  }
  const catalog = await (await request.get("/api/audit")).json();
  expect(catalog.modes.live).toBe("LOCKED"); expect(JSON.stringify(catalog)).not.toContain(canary);
});

test("recorded Qloo evidence: explicit identity confirmation, then an out-of-city discovery is rejected", async ({ page }) => {
  const g = guard(page);
  await page.goto("/");
  const card = page.getByRole("radio", { name: /audited with recorded Qloo responses/ });
  if (!recordedHere) {
    await expect(card).toBeDisabled(); await expect(page.getByText(/Unavailable on this server/)).toBeVisible(); return;
  }
  await card.check();
  await page.getByRole("button", { name: "Run the gate" }).click();
  await expect(page.getByRole("status")).toHaveText("Waiting for your confirmation: 4 identities.");
  const proceed = page.getByRole("button", { name: /Continue the audit/ });
  await expect(proceed).toBeDisabled();
  // Choices by public query label; candidate IDs never reach the page.
  await page.getByRole("radio", { name: /^Radiohead — artist/ }).check();
  await page.getByRole("radio", { name: /^In the Mood for Love — movie/ }).check();
  await page.getByRole("radio", { name: /^Jazz — genre · music/ }).check();
  await page.getByRole("radio", { name: /^Blue Note — place/ }).check();
  const pending = auditResponse(page);
  await proceed.click();
  const report = ProviderAuditReportSchema.parse(await (await pending).json());
  expect(report.usage).toMatchObject({ qloo_dispatches: 0, recorded_replays: 5, unavailable_operations: 4 });
  await expect(page.getByRole("status")).toHaveText("Final status: UNKNOWN. Completion: partial.");
  await expect(page.getByText(/according to the provider's own data/)).toBeVisible();
  await expect(page.getByText("Keep — cultural fit not yet established")).toBeVisible();
  expect(await page.content()).not.toContain(canary);
  expect(g.externalRequests).toEqual([]); expect(g.errors).toEqual([]);
  // Contains provider-derived names: kept in the ignored private area, never in public artifacts.
  await mkdir("private/phase2a-local-screens", { recursive: true });
  await page.screenshot({ path: "private/phase2a-local-screens/e2e-recorded-result.png", fullPage: true });
});

test("the product remains usable in a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  await page.getByRole("radio", { name: /A valid synthetic recommendation/ }).check();
  await page.getByRole("button", { name: "Run the gate" }).click();
  await expect(page.getByRole("status")).toHaveText("Final status: PASS. Completion: complete.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/phase2a-mobile.png", fullPage: true });
});
