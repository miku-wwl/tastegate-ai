import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";

// The judge path in real Chromium against the production build: understand it in 30 seconds, walk the 2-minute guided demo, see the
// two repair questions and the decision trace, then the paired evaluation with its honest null result. Only the authored synthetic
// scenario is used, so nothing here depends on, or can show, any private or provider data.
const PUBLIC_SHOTS = process.env.TASTEGATE_PUBLIC_SCREENSHOT_DIR ?? ".artifacts/screens";
test("the primary custom action moves focus to the real form without starting an audit",async({page})=>{
 const g=guard(page);await page.goto("/");
 await page.getByRole("button",{name:"Audit your own recommendations",exact:true}).click();
 await expect(page.getByRole("radio",{name:"Your own plan"})).toBeChecked();
 await expect(page.getByRole("heading",{name:"What should the gate audit?"})).toBeFocused();
 await page.getByRole("button",{name:"Run the gate",exact:true}).click();
 await expect(page.getByRole("alert").first()).toContainText("Check your input");
 expect(g.external).toEqual([]);expect(g.errors).toEqual([]);
});
test("the home skip link moves keyboard focus into the main content",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"Start the 2-minute guided demo",exact:true}).waitFor();
 await page.keyboard.press("Tab");await expect(page.getByRole("link",{name:"Skip to the content"})).toBeFocused();
 await page.keyboard.press("Enter");await expect(page.locator("main")).toBeFocused();
});
test("a malformed successful response is refused and the guided demo can recover",async({page})=>{
 await page.goto("/");
 const fake=async(route:import("@playwright/test").Route)=>route.request().method()==="POST"?
   route.fulfill({status:200,contentType:"application/json",body:'{"final_status":"PASS"}'}):route.continue();
 await page.route("**/api/audit",fake);
 await page.getByRole("button",{name:"Start the 2-minute guided demo"}).click();
 await expect(page.getByRole("alert").filter({hasText:"The report could not be verified"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Before and after"})).toHaveCount(0);
 await page.unroute("**/api/audit",fake);
 await page.getByRole("button",{name:"Start the 2-minute guided demo"}).click();
 await expect(page.getByRole("heading",{name:"Audit: what holds up"})).toBeFocused();
});
test("the guided result downloads a versioned report with before, after and provenance",async({page})=>{
 await page.goto("/");await page.getByRole("button",{name:"Start the 2-minute guided demo"}).click();
 for(let i=0;i<2;i++)await page.getByTestId("guide-card").getByRole("button",{name:"Next",exact:true}).click();
 const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Download the validated report (JSON)"}).click();
 const download=await pending,path=await download.path();expect(path).not.toBeNull();
 const report=JSON.parse(await readFile(path!,"utf8"));
 expect(report.schema_revision).toBe("tastegate.report.v1b");expect(report.source_mode).toBe("fixture");
 expect(report.original_audits.length).toBeGreaterThan(0);expect(report.repairs[0].accepted).toBe(true);
 expect(report.evidence.length).toBeGreaterThan(0);expect(report.usage.qloo_dispatches).toBe(0);
});
function guard(page: Page) {
  const external: string[] = []; const errors: string[] = [];
  void page.route("**/*", async (route) => { const url = new URL(route.request().url()); if (url.hostname !== "127.0.0.1") { external.push(url.origin); await route.abort(); } else await route.continue(); });
  page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return { external, errors };
}
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
// Names the elements that stick out past the viewport, so a failure says where, not just that.
const culprits = (page: Page) => page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest(".table-wrap"))
  .slice(0, 6).map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").join(".") : "") + " " + Math.round(el.getBoundingClientRect().right)));
async function shot(page: Page, name: string) {
  await mkdir(PUBLIC_SHOTS, { recursive: true }); await page.evaluate(() => window.scrollTo(0, 0));
  const style = await page.addStyleTag({ content: ".topbar, .run-bar { position: static !important; }" });
  await page.screenshot({ path: `${PUBLIC_SHOTS}/${name}.png`, fullPage: true }); await style.evaluate((el) => (el as Element).remove());
}

test("the 30-second explainer and the guided demo walk a synthetic repair end to end", async ({ page }) => {
  const g = guard(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "How it works, in 30 seconds" })).toBeVisible();
  await expect(page.locator(".how-steps li")).toHaveCount(4);
  await expect(page.getByText("UNKNOWN means “no evidence”, never “wrong”.")).toBeVisible();
  await shot(page, "judge-1-explainer");
  const start = page.getByRole("button", { name: "Start the 2-minute guided demo" }); await expect(start).toBeEnabled(); await start.click();
  // Guide step 1 · the audit
  await expect(page.getByRole("heading", { name: "Audit: what holds up" })).toBeFocused();
  const guide = page.getByTestId("guide-card"); await expect(guide).toContainText("Guided demo · step 1 of 3"); await expect(guide).toContainText("Audit: look for the red card");
  await expect(page.getByText("Blocked").first()).toBeVisible(); await shot(page, "judge-2-guided-audit");
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  // Guide step 2 · the repair, with the two separate questions and the synthetic label
  await expect(page.getByRole("heading", { name: "Repair and revalidate" })).toBeFocused(); await expect(guide).toContainText("step 2 of 3");
  await expect(page.getByText("Repair verified").first()).toBeVisible();
  const assessment = page.getByTestId("repair-assessment").first();
  await expect(assessment).toContainText("Hard constraints: VALID"); await expect(assessment).toContainText("Cultural evidence: SUPPORTED"); await expect(assessment).toContainText("SYNTHETIC SUCCESS");
  await expect(assessment).toContainText("second source: separate provider lookup");
  await assessment.getByText(/Mandatory evidence \(10 of 10 met\)/).click(); await expect(assessment).toContainText("Branch corroborated by a second source");
  await expect(page.getByText(/Accepted after revalidation/).first()).toContainText("separate provider lookup"); await shot(page, "judge-3-guided-repair");
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  // Guide step 3 · before/after and the decision trace
  await expect(page.getByRole("heading", { name: "Before and after" })).toBeFocused(); await expect(guide).toContainText("step 3 of 3");
  const trace = page.getByTestId("decision-trace"); await expect(trace).toBeVisible();
  await expect(trace).toContainText("HARD_CONSTRAINT_FAILED"); await expect(trace).toContainText("REPAIR_CONSIDERED"); await expect(trace).toContainText("VALID_REPLACEMENT_VERIFIED"); await expect(trace).toContainText("REPAIR_VERIFIED");
  await expect(trace).toContainText("There is no free-form agent reasoning here"); await expect(trace).toContainText("SYNTHETIC: authored data"); await shot(page, "judge-4-guided-compare");
  await guide.getByRole("button", { name: "Finish the guide" }).click(); await expect(page.getByTestId("guide-card")).toHaveCount(0);
  expect(await overflows(page)).toBe(false);
  expect(g.external).toEqual([]); expect(g.errors).toEqual([]);
});

test("the guide can be left at any time without losing the result", async ({ page }) => {
  const g = guard(page); await page.goto("/");
  await page.getByRole("button", { name: "Start the 2-minute guided demo" }).click();
  await expect(page.getByTestId("guide-card")).toBeVisible(); await page.getByRole("button", { name: "Exit the guide" }).click();
  await expect(page.getByTestId("guide-card")).toHaveCount(0); await expect(page.getByRole("heading", { name: "Audit: what holds up" })).toBeVisible();
  await page.getByRole("navigation", { name: "Progress" }).getByRole("button", { name: "Input" }).click();
  await expect(page.getByRole("heading", { name: "What should the gate audit?" })).toBeVisible();
  expect(g.external).toEqual([]); expect(g.errors).toEqual([]);
});

test("the evaluation page separates coverage, decision difference and independently validated quality, and states the null result", async ({ page }) => {
  const g = guard(page); await page.goto("/results");
  await expect(page.getByRole("heading", { name: "Does the gate keep bad recommendations out?" })).toBeVisible();
  const ablation = page.getByLabel("What Qloo's cultural evidence adds").first(); await expect(ablation).toBeVisible();
  for (const text of ["EVIDENCE_COVERAGE_GAIN", "DECISION_DIFFERENCE", "INDEPENDENTLY_VALIDATED_QUALITY_GAIN", "QUALITY_UPLIFT_NOT_ESTABLISHED", "same gate without cultural evidence"]) await expect(ablation).toContainText(text);
  await expect(page.getByText("Control: rules and identity only")).toBeVisible();
  const priority = page.getByLabel("Priority among valid candidates").first();
  await expect(priority).toContainText("only within one reviewed query");
  await expect(priority).toContainText("only one hard-constraint-valid candidate");
  await shot(page, "judge-5-results");
  expect(await overflows(page)).toBe(false); expect(g.external).toEqual([]); expect(g.errors).toEqual([]);
});

test("the results page supports keyboard skip navigation and phone width", async ({ page }) => {
  const g = guard(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/results");
  await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Skip to the content" })).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page.locator("main")).toBeFocused();
  await expect(page.getByLabel("Priority among valid candidates").first()).toBeVisible();
  expect(await overflows(page)).toBe(false); await shot(page, "judge-6-results-mobile");
  expect(g.external).toEqual([]); expect(g.errors).toEqual([]);
});

test("a phone-width screen has no horizontal scroll through the guided demo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const g = guard(page); await page.goto("/");
  expect(await overflows(page)).toBe(false);
  await page.getByRole("button", { name: "Start the 2-minute guided demo" }).click(); await expect(page.getByTestId("guide-card")).toBeVisible();
  for (const label of ["Next", "Next"]) { expect(await culprits(page)).toEqual([]); expect(await overflows(page)).toBe(false); await page.getByTestId("guide-card").getByRole("button", { name: label, exact: true }).click(); }
  await expect(page.getByTestId("decision-trace")).toBeVisible();
  await page.getByText("Inspect the validated report JSON",{exact:true}).click();
  const json=page.getByTestId("report-json");await expect(json).toBeVisible();await json.focus();await expect(json).toBeFocused();
  expect(await json.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  // The wide trace table scrolls inside its own container, never the page.
  expect(await overflows(page)).toBe(false); expect(g.external).toEqual([]); expect(g.errors).toEqual([]);
});

test("two valid synthetic choices expose priority separately from retention and link decisions to real ledger records", async ({ page }) => {
  const g = guard(page); await page.goto("/");
  await page.getByRole("button", { name: "Compare two valid choices" }).click();
  await expect(page.getByRole("heading", { name: "Before and after" })).toBeFocused();
  const panel = page.getByTestId("cultural-comparison");
  await expect(panel).toContainText("SYNTHETIC");
  await expect(panel).toContainText("Priority changes within one reviewed query.");
  await expect(panel).toContainText("The retained set is unchanged.");
  await expect(panel).toContainText("Independent quality gain: NOT ESTABLISHED.");
  await panel.getByText("Candidate evidence and eligibility (2 assessed)", { exact: true }).click();
  await expect(panel.getByRole("table")).toBeVisible();
  const trace = page.getByTestId("decision-trace");
  const first = trace.getByRole("link", { name: /Open evidence record/ }).first();
  const target = await first.getAttribute("href"); await first.click();
  await expect(page.locator("#evidence-ledger")).toHaveAttribute("open", "");
  expect(await page.evaluate((id) => !!document.getElementById(id!), target!.slice(1))).toBe(true);
  expect(await overflows(page)).toBe(false);
  await shot(page, "phase3d4a-priority");
  await page.setViewportSize({ width: 390, height: 844 }); expect(await overflows(page)).toBe(false);
  await shot(page, "phase3d4a-priority-mobile");
  expect(g.external).toEqual([]); expect(g.errors).toEqual([]);
});
