import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { AuditReportSchema } from "../../src/domain/report-schema";

test("browser performs actual offline audit, shows residual uncertainty and saves evidence", async ({ page }) => {
  const externalRequests: string[] = []; const errors: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") { externalRequests.push(url.origin); await route.abort(); }
    else await route.continue();
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/"); await expect(page.getByText("OFFLINE · AUTHORED SYNTHETIC FIXTURES · NO QLOO API CALLS")).toBeVisible();
  const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/audit") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Run synthetic audit" }).click();
  const response = await responsePromise; expect(response.status()).toBe(200);
  const report = AuditReportSchema.parse(await response.json());
  await expect(page.getByRole("status")).toHaveText("Final status: UNKNOWN. Completion: partial.");
  await expect(page.getByText("Accepted after revalidation", { exact: false })).toBeVisible();
  await page.getByText(/Inspect generated evidence JSON/).click();
  expect(JSON.parse(await page.getByTestId("report-json").innerText()).run_id).toBe(report.run_id);
  expect(report.usage.fixture_calls).toBe(10); expect(report.usage.qloo_dispatches).toBe(0);
  expect(externalRequests).toEqual([]); expect(errors).toEqual([]);
  await mkdir(".artifacts", { recursive: true });
  await writeFile(".artifacts/phase1a-browser-run.json", JSON.stringify({ evidence_kind: "ACTUAL_LOCAL_BROWSER_EXECUTION_SYNTHETIC_DATA", report, externalRequests, errors }, null, 2) + "\n");
  await page.screenshot({ path: ".artifacts/phase1a-inspector.png", fullPage: true });
});

test("browser shows a validated repair and a rejected replacement on separate runs", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Synthetic scenario").selectOption("wrong-city-repair");
  await page.getByRole("button", { name: "Run synthetic audit" }).click();
  await expect(page.getByRole("status")).toHaveText("Final status: PASS. Completion: complete.");
  await page.getByLabel("Synthetic scenario").selectOption("repair-fails");
  await page.getByRole("button", { name: "Run synthetic audit" }).click();
  await expect(page.getByRole("status")).toHaveText("Final status: BLOCKED. Completion: complete.");
  await expect(page.getByText("Rejected after revalidation", { exact: false })).toBeVisible();
});

test("HTTP server rejects live mode and expanded client budgets", async ({ request }) => {
  for (const extra of [{ mode: "live" }, { maxCalls: 99 }, { evidence: [] }]) {
    const response = await request.post("/api/audit", { data: { scenario: "nyc-evening", ...extra } });
    expect(response.status()).toBe(400);
  }
});

test("offline inspector remains usable in a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  await page.getByLabel("Synthetic scenario").selectOption("valid-only");
  await page.getByRole("button", { name: "Run synthetic audit" }).click();
  await expect(page.getByRole("status")).toHaveText("Final status: PASS. Completion: complete.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/phase1a-mobile.png", fullPage: true });
});
