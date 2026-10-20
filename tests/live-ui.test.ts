import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InputScreen, type Plan, type Source } from "../app/screens/input-screen";
import { emptyForm } from "../app/custom-form";
import { CUSTOM_INPUT_LIMITS, type Catalog } from "../src/domain/catalog";
import { getRecordedScenarioInput } from "../src/scenarios/recorded-nyc";
import { getScenario } from "../src/fixtures/scenarios";

// The live controls, rendered in each state. These are the guardrails a person actually sees: a locked gate cannot be
// selected, a live run needs its own acknowledgement, and a synthetic scenario never offers live at all.
const catalog = (live: Partial<Catalog["live_gate"]> = {}, recorded: "AVAILABLE" | "UNAVAILABLE" = "AVAILABLE"): Catalog => ({
  modes: { synthetic: "AVAILABLE", recorded_live: recorded, live: live.status ?? "LOCKED" },
  scenarios: [{ id: "recorded-nyc-evening", label: "NYC evening plan — audited with recorded Qloo responses", mode: "recorded_live", available: recorded === "AVAILABLE", input: getRecordedScenarioInput() },
    { id: "valid-only", label: "A valid synthetic recommendation", mode: "fixture", available: true, input: getScenario("valid-only").input }],
  recorded_history: [], recorded_coverage: { artist: ["Radiohead"], movie: [], place: ["Blue Note New York"], tag: [] }, pending_request: null,
  live_gate: { status: "LOCKED", reason: "GRANT_MISSING", detail: "The owner has not created a live grant. Live requests stay locked until they do.", remaining_requests: null, remaining_runs: null, expires_at: null, ...live },
  custom_input: CUSTOM_INPUT_LIMITS as unknown as Catalog["custom_input"],
});
const READY: Partial<Catalog["live_gate"]> = { status: "AVAILABLE", reason: "READY", detail: "An owner-created live grant is active. A live run still needs your confirmation each time.", remaining_requests: 9, remaining_runs: 2, expires_at: "2026-10-20T12:00:00.000Z" };
const render = (over: { catalog?: Catalog; plan?: Plan; source?: Source; liveAck?: boolean } = {}) => renderToStaticMarkup(createElement(InputScreen, {
  catalog: over.catalog ?? catalog(), plan: over.plan ?? { kind: "scenario", id: "recorded-nyc-evening" }, onPlan: () => {}, source: over.source ?? "recorded", onSource: () => {},
  liveAck: over.liveAck ?? false, onLiveAck: () => {}, form: emptyForm(), onForm: () => {}, formIssues: [], problem: null, busy: false, onRun: () => {}, headingRef: null }));
const tag = (html: string, pattern: RegExp) => html.match(pattern)?.[0] ?? "";
const runButton = (html: string) => tag(html, /<button[^>]*class="primary[^"]*"[^>]*>[^<]*<\/button>/);

describe("live controls in each state", () => {
  it("locked: the live option cannot be chosen, the reason is shown, no acknowledgement exists and the run button is the ordinary one", () => {
    const html = render();
    expect(tag(html, /<input[^>]*value="live"[^>]*>/)).toContain("disabled"); expect(html).toContain("Locked: The owner has not created a live grant");
    expect(html).not.toContain('type="checkbox"'); expect(runButton(html)).toContain(">Run the gate<"); expect(html).toContain("Live Qloo: locked");
    expect(html).toContain("How the owner unlocks it"); expect(html).toContain("never start a live request");
  });
  it("ready: live is selectable but never selected by default; choosing recorded shows no acknowledgement", () => {
    const html = render({ catalog: catalog(READY) });
    expect(tag(html, /<input[^>]*value="live"[^>]*>/)).not.toContain("disabled"); expect(tag(html, /<input[^>]*value="live"[^>]*>/)).not.toContain("checked");
    expect(tag(html, /<input[^>]*value="recorded"[^>]*>/)).toContain("checked"); expect(html).not.toContain('type="checkbox"'); expect(runButton(html)).toContain(">Run the gate<");
    expect(html).toContain("Left in the grant"); expect(html).toContain("<strong>9</strong>");
  });
  it("live chosen: the run button is labelled for real requests and stays disabled until the acknowledgement is ticked", () => {
    const unconfirmed = render({ catalog: catalog(READY), source: "live", liveAck: false });
    expect(unconfirmed).toContain('type="checkbox"'); expect(unconfirmed).toContain("sends real requests to Qloo with the owner’s credential"); expect(unconfirmed).toContain("up to 9 remain");
    expect(runButton(unconfirmed)).toContain("Run LIVE (sends real Qloo requests)"); expect(runButton(unconfirmed)).toContain("disabled"); expect(runButton(unconfirmed)).toContain("primary live");
    const confirmed = render({ catalog: catalog(READY), source: "live", liveAck: true }); expect(runButton(confirmed)).not.toContain("disabled"); expect(tag(confirmed, /<input[^>]*type="checkbox"[^>]*>/)).toContain("checked");
  });
  it("a locked gate with live somehow selected cannot run: the user is never silently switched to recorded", () => {
    const html = render({ catalog: catalog(), source: "live", liveAck: true }); expect(runButton(html)).toContain("disabled");
  });
  it("a synthetic scenario offers no evidence source at all, so it can never be run live", () => {
    const html = render({ catalog: catalog(READY), plan: { kind: "scenario", id: "valid-only" }, source: "live", liveAck: true });
    expect(html).not.toContain("Evidence source"); expect(html).not.toContain('name="source"'); expect(runButton(html)).toContain(">Run the gate<"); expect(runButton(html)).not.toContain("disabled");
  });
  it("a custom plan chooses its source in the same way; with no recordings it can still run, and says every lookup will be UNKNOWN", () => {
    const ready = render({ catalog: catalog(READY), plan: { kind: "custom" } }); expect(ready).toContain("Evidence source"); expect(ready).toContain("Load the worked example");
    const down = render({ catalog: catalog({}, "UNAVAILABLE"), plan: { kind: "custom" } });
    expect(tag(down, /<input[^>]*value="recorded"[^>]*>/)).not.toContain("disabled"); expect(runButton(down)).not.toContain("disabled");
    expect(down).toContain("This server holds no recordings, so every lookup is UNKNOWN"); expect(down).not.toContain("Unavailable on this server.</span>");
  });
  it("the unavailable recorded scenario is shown as unavailable, not substituted", () => {
    const html = render({ catalog: catalog({}, "UNAVAILABLE") }); expect(html).toContain("Unavailable on this server: the owner’s private recordings are not present.");
    expect(tag(html, /<input[^>]*value="recorded-nyc-evening"[^>]*>/)).toContain("disabled");
  });
});
