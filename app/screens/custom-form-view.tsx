"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { MAX_IMPORT_BYTES } from "../../src/domain/protocol";
import {
  INTEREST_KINDS, LIMITS, clientIssues, coverageHint, exampleForm, formToInput, interestCoverage, parseImport,
  type Coverage, type FieldIssue, type FormState, type InterestKind,
} from "../custom-form";

// The "your own plan" form. Everything typed here is untrusted text: the server normalizes and validates it again.
export function CustomFormView({ form, onChange, issues, coverage, countries, live }: {
  form: FormState; onChange: (next: FormState) => void; issues: FieldIssue[]; coverage: Coverage; countries: ReadonlyArray<{ code: string; name: string }>; live: boolean }) {
  const [importMessage, setImportMessage] = useState(""); const [exportProblem, setExportProblem] = useState<FieldIssue[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);
  // Problems from the last run attempt plus problems found by the last export attempt; both clear as soon as the form changes.
  const errorsFor = (field: string) => [...issues, ...exportProblem].filter((i) => i.field === field);
  const props = (field: string) => ({ id: `f-${field}`, "aria-invalid": errorsFor(field).length ? true as const : undefined, "aria-describedby": errorsFor(field).length ? `e-${field}` : undefined });
  // Plain render helpers (not nested components): a nested component type would remount on every keystroke.
  const errorList = (field: string) => errorsFor(field).map((e, n) => <p key={n} id={n === 0 ? `e-${field}` : undefined} className="field-error">{e.message}</p>);
  const set = (patch: Partial<FormState>) => { if (exportProblem.length) setExportProblem([]); onChange({ ...form, ...patch }); };
  const setInterest = (n: number, patch: Partial<FormState["interests"][number]>) => set({ interests: form.interests.map((x, i) => i === n ? { ...x, ...patch } : x) });
  const setRec = (n: number, patch: Partial<FormState["recommendations"][number]>) => set({ recommendations: form.recommendations.map((x, i) => i === n ? { ...x, ...patch } : x) });

  function exportJson() {
    const problems = clientIssues(form, countries); setExportProblem(problems); if (problems.length) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(formToInput(form), null, 2) + "\n"], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "tastegate-input.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { setImportMessage("That file is larger than 16 KiB. Nothing was imported."); return; }
    const result = parseImport(await file.text());
    if (result.ok) { setExportProblem([]); onChange(result.form); setImportMessage("Imported. Review the fields below, then run the gate."); } else setImportMessage(result.message);
  }
  function hint(known: string[], term: string, accept: (value: string) => void) {
    if (live) return term.trim() ? <p className="hint">Live mode searches Qloo for this exact text (one request).</p> : null;
    const h = coverageHint(known, term);
    if (h.state === "empty") return null;
    if (h.state === "covered") return <p className="hint hint-covered">✓ A recorded Qloo response exists for this exact text.</p>;
    if (h.state === "near") return <p className="hint hint-near">Did you mean “{h.suggestion}”? Recorded replay needs the exact text, capital letters included.{" "}
      <button type="button" className="link" onClick={() => accept(h.suggestion!)}>Use “{h.suggestion}”</button></p>;
    return <p className="hint hint-none">No recording for this text, so the recorded run reports it as UNKNOWN — not as wrong.</p>;
  }
  const general = errorsFor("");
  return <div className="form-grid">
    {general.length > 0 && <p role="alert" className="alert">{general.map((g) => g.message).join(" ")}</p>}
    <div className="form-actions" role="group" aria-label="Input file">
      <button type="button" className="secondary" onClick={() => { setExportProblem([]); onChange(exampleForm()); setImportMessage("Loaded the worked example."); }}>Load the worked example</button>
      <button type="button" className="secondary" onClick={() => fileInput.current?.click()}>Import input (JSON)</button>
      <button type="button" className="secondary" onClick={exportJson}>Export input (JSON)</button>
      <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label="Choose an input JSON file" onChange={importJson} />
    </div>
    {importMessage && <p role="status" className="muted small">{importMessage}</p>}
    {exportProblem.length > 0 && <p role="alert" className="alert">Fix the highlighted fields before exporting.</p>}

    <fieldset className="panel form-group"><legend>Where is the plan?</legend>
      <div className="row-grid two">
        <div className="field"><label htmlFor="f-city">City</label><input type="text" {...props("city")} value={form.city} autoComplete="off" maxLength={LIMITS.city + 20}
          onChange={(e) => set({ city: e.target.value })} />{errorList("city")}</div>
        <div className="field"><label htmlFor="f-country">Country</label><select {...props("country")} value={form.country} onChange={(e) => set({ country: e.target.value })}>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>{errorList("country")}</div>
      </div>
      <p className="muted small">Every recommendation must be a real <strong>place</strong> in this city and country. Those are hard constraints: a place that fails one is blocked, never ranked up.</p>
      <div className="field narrow"><label htmlFor="f-maxItems">Largest plan allowed</label>
        <select id="f-maxItems" value={form.maxItems} onChange={(e) => set({ maxItems: Number(e.target.value) as 1 | 2 | 3 })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n} item{n > 1 ? "s" : ""}</option>)}</select></div>
    </fieldset>

    <fieldset className="panel form-group"><legend>Taste signals (up to {LIMITS.interests})</legend>
      {form.interests.map((interest, n) => <div className="row-card" key={n}>
        <div className="row-grid">
          <div className="field"><label htmlFor={`f-interests.${n}.kind`}>Kind</label><select id={`f-interests.${n}.kind`} value={interest.kind} onChange={(e) => setInterest(n, { kind: e.target.value as InterestKind })}>
            {INTEREST_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></div>
          <div className="field"><label htmlFor={`f-interests.${n}.text`}>What you like</label><input type="text" {...props(`interests.${n}.text`)} value={interest.text} autoComplete="off" onChange={(e) => setInterest(n, { text: e.target.value })} />{errorList(`interests.${n}.text`)}</div>
          <div className="field"><label htmlFor={`f-interests.${n}.search`}>Search Qloo for <span className="muted">(optional)</span></label><input type="text" {...props(`interests.${n}.search`)} value={interest.search}
            placeholder={interest.text || "defaults to what you like"} autoComplete="off" onChange={(e) => setInterest(n, { search: e.target.value })} />{errorList(`interests.${n}.search`)}</div>
        </div>
        {hint(interestCoverage(coverage, interest.kind), interest.search || interest.text, (value) => setInterest(n, { search: value }))}
        {form.interests.length > 1 && <button type="button" className="link danger" onClick={() => set({ interests: form.interests.filter((_, i) => i !== n) })}>Remove this signal</button>}
      </div>)}
      {errorList("interests")}
      {form.interests.length < LIMITS.interests && <button type="button" className="secondary" onClick={() => set({ interests: [...form.interests, { kind: "artist", text: "", search: "" }] })}>Add a taste signal</button>}
    </fieldset>

    <fieldset className="panel form-group"><legend>Recommendations to audit (up to {LIMITS.recommendations})</legend>
      {form.recommendations.map((rec, n) => <div className="row-card" key={n}>
        <div className="row-grid two">
          <div className="field"><label htmlFor={`f-recommendations.${n}.name`}>Name of the place</label><input type="text" {...props(`recommendations.${n}.name`)} value={rec.name} autoComplete="off" onChange={(e) => setRec(n, { name: e.target.value })} />{errorList(`recommendations.${n}.name`)}</div>
          <div className="field"><label htmlFor={`f-recommendations.${n}.address`}>Address or area <span className="muted">(optional)</span></label><input type="text" {...props(`recommendations.${n}.address`)} value={rec.address} autoComplete="off" onChange={(e) => setRec(n, { address: e.target.value })} />{errorList(`recommendations.${n}.address`)}</div>
        </div>
        {hint(coverage.place, rec.name, (value) => setRec(n, { name: value }))}
        <div className="field"><label htmlFor={`f-recommendations.${n}.claims`}>Claims the agent made <span className="muted">(optional, one per line)</span></label>
          <textarea {...props(`recommendations.${n}.claims`)} value={rec.claims} rows={2} onChange={(e) => setRec(n, { claims: e.target.value })} />{errorList(`recommendations.${n}.claims`)}
          <p className="muted small">Claims are never verified or marked as supported; they are listed as open questions.</p></div>
        {form.recommendations.length > 1 && <button type="button" className="link danger" onClick={() => set({ recommendations: form.recommendations.filter((_, i) => i !== n) })}>Remove this recommendation</button>}
      </div>)}
      {errorList("recommendations")}
      {form.recommendations.length < LIMITS.recommendations && <button type="button" className="secondary" onClick={() => set({ recommendations: [...form.recommendations, { name: "", address: "", claims: "" }] })}>Add a recommendation</button>}
    </fieldset>

    <div className="field"><label htmlFor="f-task">What was the agent asked? <span className="muted">(optional)</span></label>
      <textarea {...props("task")} value={form.task} rows={2} onChange={(e) => set({ task: e.target.value })} />{errorList("task")}</div>
  </div>;
}
