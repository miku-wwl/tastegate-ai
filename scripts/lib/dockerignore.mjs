// A small, dependency-free model of .dockerignore matching, used to prove which files would enter a Docker build context WITHOUT a
// container runtime. It is an APPROXIMATION of Docker's rules (not Docker itself): patterns are matched against slash-separated paths
// relative to the context root; `*` stays inside one path segment, `**` crosses segments, `?` is one non-slash character; a pattern that
// matches a directory excludes everything under it; later patterns win, and a leading `!` re-includes. When a container runtime is
// available the gate can be compared against a real build; until then a mismatch would only make this check stricter than Docker, because
// every sensitive pattern is written in the explicit `**/name` form.
const SLASH = String.fromCharCode(47);
const escape = (ch) => ".+^${}()|[]".includes(ch) || ch === String.fromCharCode(92) ? String.fromCharCode(92) + ch : ch;

export function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") { i++; if (glob[i + 1] === SLASH) { i++; out += "(?:.*" + SLASH + ")?"; } else out += ".*"; }
      else out += "[^" + SLASH + "]*";
    } else if (ch === "?") out += "[^" + SLASH + "]";
    else out += escape(ch);
  }
  return new RegExp("^" + out + "$");
}
export function parseDockerignore(text) {
  const rules = [];
  for (const raw of text.split(String.fromCharCode(10))) {
    let line = raw.replace(String.fromCharCode(13), "").trim();
    if (!line || line.startsWith("#")) continue;
    const negate = line.startsWith("!"); if (negate) line = line.slice(1).trim();
    line = line.replace(/^[/]+/, "").replace(/[/]+$/, "");
    if (line) rules.push({ negate, glob: line, re: globToRegExp(line) });
  }
  return rules;
}
// True if `rel` (a slash-separated path relative to the context root) is excluded: the path itself or any parent directory matches.
export function isExcluded(rules, rel) {
  const parts = rel.split(SLASH); let excluded = false;
  for (const rule of rules) {
    let hit = false;
    for (let n = 1; n <= parts.length && !hit; n++) hit = rule.re.test(parts.slice(0, n).join(SLASH));
    if (hit) excluded = !rule.negate;
  }
  return excluded;
}
export const contextFiles = (rules, files) => files.filter((f) => !isExcluded(rules, f));
