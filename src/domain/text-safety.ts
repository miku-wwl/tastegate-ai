// Dependency-free text safety shared by the server and the browser form (so the browser can warn before the server
// rejects). Numeric ranges, not escape sequences or a regex class: invisible and line-separator characters must never be
// pasted into source, and a range table is auditable. C0/C1 controls, soft hyphen, Arabic letter mark, Mongolian vowel
// separator, zero-width and bidi marks/overrides/isolates, line/paragraph separators, BOM and interlinear annotation.
const UNSAFE_RANGES: ReadonlyArray<readonly [number, number]> = [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e],
  [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb]];
export function hasUnsafeCharacters(value: string): boolean {
  for (const ch of value) { const cp = ch.codePointAt(0)!; if (UNSAFE_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)) return true; }
  return false;
}
export const RESERVED_ID_PREFIXES = ["repair:", "synthetic:", "qloo-ref:"] as const;
