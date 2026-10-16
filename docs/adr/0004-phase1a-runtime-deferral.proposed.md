# ADR-004: Phase 1A offline core; optional Runtime integration deferred

Status: **ACCEPTED for Phase 1A by explicit human approval in this session**.
Date: 2026-10-16 (Pacific/Auckland).

The current request authorizes an executable synthetic TypeScript audit core and explicitly excludes the optional Python archive. Root AGENTS.md nevertheless requires dependency/installed-API verification before code and describes Runtime acceptance unconditionally. Applying those requirements to this read-only phase would add an unrelated Python integration; omitting them without an explicit scoped amendment would leave a repository-instruction conflict.

Proposed decision:

- Phase 1A implements only strict domain contracts, separate fixture/live ports, a bounded read-only Audit → Repair → Revalidate flow, focused tests and minimal local inspection.
- No Python archive, Python dependency/environment, execution gateway, approval engine, durable claims or receipt system is implemented in this phase.
- Runtime installation, installed API inspection and durable SIDE_EFFECT acceptance are deferred until a separately approved phase actually integrates the Runtime. The exact existing pin and all safety requirements remain binding then.
- Fixture execution is labeled synthetic throughout. Live Qloo requests remain blocked; no speculative response schema or automatic live-to-fixture fallback is implemented.
- The frozen strategy and historical Phase 0 reports remain unchanged. This decision supersedes only their proposed Runtime-first ordering for this explicitly authorized offline phase.
- No license is added until the owner confirms the intended MIT grant and copyright attribution. No commit, push, public deployment or next phase is authorized.

The exact additive amendment is in [AGENTS.phase1a.patch](../proposals/AGENTS.phase1a.patch). The owner explicitly approved applying that patch and continuing Phase 1A, and separately confirmed authority to grant MIT with copyright attribution `miku-wwl`. The patch was then applied without changing existing Runtime sections. The `.proposed.md` filename is retained to preserve the exact review link; this status records its subsequent acceptance. Future Runtime integration still needs separate approval.
