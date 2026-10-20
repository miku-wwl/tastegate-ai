import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import ResultsPage from "../app/results/page";
import results from "../data/evaluation-results.json";
import { RESULTS_SCHEMA } from "../src/eval/publish";

// The published file is what a judge reads. It must stay aggregate-only, honest about what was not run, and renderable.
describe("published evaluation results", () => {
  const text = JSON.stringify(results);
  it("has the reviewed schema, all four strata and a stated seed", () => {
    expect(results.schema).toBe(RESULTS_SCHEMA); expect(Object.keys(results.strata)).toEqual(["SYNTHETIC", "SYNTHETIC_HOLDOUT", "RECORDED_LIVE", "AUTHORIZED_LIVE"]);
    expect(results.holdout_seed).toBe(20261020); expect(results.strata.AUTHORIZED_LIVE).toMatchObject({ status: "NOT RUN", cases: 0, comparison: null });
  });
  it("contains counts and fixed labels only: no provider identifier, name, path or secret", () => {
    for (const forbidden of ["qloo-ref:", "entity_id", "sha256", "private/", "api_key", "X-Api-Key", "Radiohead", "Blue Note", "Village Vanguard", "hackathon.api"]) expect(text).not.toContain(forbidden);
    expect(text).not.toMatch(/"description"/);
  });
  it("shows no recorded-derived numbers unless the owner chose to publish them", () => {
    const recorded = results.strata.RECORDED_LIVE as { status: string; comparison: unknown };
    expect(["WITHHELD", "NOT RUN", "RUN"]).toContain(recorded.status); if (recorded.status !== "RUN") expect(recorded.comparison).toBeNull();
  });
  it("renders every stratum with its status, a table where one was run, and the limits", () => {
    const html = renderToStaticMarkup(createElement(ResultsPage));
    for (const title of ["Authored development cases (synthetic)", "Seeded holdout (synthetic)", "Recorded Qloo responses", "Live Qloo requests", "What this does not show", "How it was measured"]) expect(html).toContain(title);
    expect(html).toContain("NOT RUN"); expect(html).toContain("Hard-constraint violations that reach the user"); expect(html).toContain("<caption>");
    expect(html).not.toContain("undefined"); expect(html).not.toContain("NaN");
  });
  it("the counted result matches what was published: TasteGate lets no violating item through in a scored stratum that was run", () => {
    for (const key of ["SYNTHETIC", "SYNTHETIC_HOLDOUT"] as const) {
      const c = (results.strata[key] as unknown as { comparison: { policies: Record<string, { shipped_violating: number; shipped_unverifiable: number }> } }).comparison;
      expect(c.policies.TASTEGATE!.shipped_violating).toBe(0); expect(c.policies.TASTEGATE!.shipped_unverifiable).toBe(0);
      expect(c.policies.AS_PROPOSED!.shipped_violating).toBeGreaterThan(0); expect(c.policies.TOP_HIT_UNCHECKED!.shipped_violating).toBeGreaterThan(0);
    }
  });
});
