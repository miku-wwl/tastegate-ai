import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// WCAG 2.2 AA contrast for the text/background pairs the stylesheet actually uses (normal text needs 4.5:1, large or UI text 3:1).
// The pairs are read from the stylesheet's own color tokens, so a palette change that breaks contrast fails here.
const css = readFileSync("app/style.css", "utf8").replace(/\r\n/g, "\n");
const root = /:root \{([^}]*)\}/.exec(css)?.[1] ?? "";
const tokens = Object.fromEntries([...root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]));
const channel = (hex: string, i: number) => { const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
const ratio = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
const WHITE = "#ffffff";
const t = (name: string) => { const v = tokens[name]; if (!v) throw new Error(`missing token --${name}`); return v; };

describe("color contrast (AA)", () => {
  it("reads every token it relies on", () => { expect(Object.keys(tokens).length).toBeGreaterThan(20); });
  it.each([
    ["pass", "pass-bg"], ["review", "review-bg"], ["blocked", "blocked-bg"], ["unknown", "unknown-bg"], ["repair", "repair-bg"], ["recorded", "recorded-bg"],
    ["synthetic", "synthetic-bg"], ["locked", "locked-bg"], ["live", "live-bg"], ["brand", "brand-soft"],
  ])("status colors %s on %s are readable as normal text", (fg, bg) => { expect(ratio(t(fg), t(bg))).toBeGreaterThanOrEqual(4.5); });
  it.each([
    ["ink", "bg"], ["ink", "surface"], ["ink", "surface-2"], ["muted", "bg"], ["muted", "surface"], ["muted", "surface-2"], ["brand", "bg"], ["brand", "surface"], ["brand", "surface-2"],
    ["blocked", "surface"], ["blocked", "bg"], ["pass", "surface"], ["review", "surface"],
  ])("body text %s on %s", (fg, bg) => { expect(ratio(t(fg), t(bg))).toBeGreaterThanOrEqual(4.5); });
  it("the accent color is used only for focus outlines, never for text", () => { expect([...css.matchAll(/var\(--accent\)/g)].length).toBe(css.split("\n").filter((l) => l.includes("var(--accent)") && /outline/.test(l)).length); });
  it("white text on the solid buttons and the step marker", () => {
    expect(ratio(t("brand-ink"), t("brand"))).toBeGreaterThanOrEqual(4.5); expect(ratio(WHITE, t("live"))).toBeGreaterThanOrEqual(4.5); expect(ratio(WHITE, t("ink"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(WHITE, "#0a4a3d")).toBeGreaterThanOrEqual(4.5); expect(ratio(WHITE, "#6f1639")).toBeGreaterThanOrEqual(4.5); // hover colors
  });
  it("focus indicators and component borders are distinguishable (3:1)", () => {
    expect(ratio(t("accent"), t("bg"))).toBeGreaterThanOrEqual(3); expect(ratio(t("accent"), t("surface"))).toBeGreaterThanOrEqual(3);
    expect(ratio(t("brand"), t("surface"))).toBeGreaterThanOrEqual(3);
  });
  it("the stylesheet honours reduced motion and keeps a visible focus style", () => {
    expect(css).toContain("prefers-reduced-motion: reduce"); expect(css).toMatch(/:focus-visible \{[^}]*outline: 3px solid/);
  });
});
