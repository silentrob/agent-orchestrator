---
feature_number: 0004
plan: "./0004_PLAN.md"
plan_status: approved
tasks_status: in progress
created_at: "2026-04-02T00:00:00Z"
---

# Tasks: Issue-centric lifecycle — Plan, Execute, Validate (0004)

Derived from `0004_PLAN.md` (approved). No scope beyond IN-SCOPE.

**Guard:** If `requires_approval: true` and `status != approved`, abort with: `Plan 0004 not approved (status: <status>).`

---

## API Contract Table (verified)

| File                                                  | Exported name                | Kind      | Signature / shape                                                          | Reference proof        |
| ----------------------------------------------------- | ---------------------------- | --------- | -------------------------------------------------------------------------- | ---------------------- |
| `packages/core/src/types.ts`                          | `WorkerRole`                 | type      | `"planner" \| "executor" \| "validator" \| "reproducer"`                   | L203                   |
| `packages/core/src/types.ts`                          | `SessionSpawnConfig`         | interface | `workerRole?: WorkerRole`, `issueId?`, `prompt?`, …                        | L205–L220              |
| `packages/core/src/types.ts`                          | `Session`                    | interface | `metadata: Record<string, string>`, `issueId`, `workspacePath`, …          | L148–L190              |
| `packages/core/src/types.ts`                          | `SessionManager`             | interface | `spawn`, `get`, `send`, …                                                  | L1302–L1315            |
| `packages/core/src/session-manager.ts`                | `createSessionManager`       | function  | `createSessionManager(deps: SessionManagerDeps) -> OpenCodeSessionManager` | default export factory |
| `packages/core/src/prompt-builder.ts`                 | `buildPrompt`                | function  | `buildPrompt(config: PromptBuildConfig) -> string`                         | L153                   |
| `packages/core/src/prompt-builder.ts`                 | `PromptBuildConfig`          | interface | `project`, `projectId`, `issueId?`, `userPrompt?`, `lineage?`, `siblings?` | L46–L67                |
| `packages/core/src/prompt/artifact-layers-by-role.ts` | `buildPlannerArtifactLayer`  | function  | `(ctx: PlannerArtifactLayerContext) -> string`                             | export                 |
| `packages/core/src/orchestrator-prompt.ts`            | `generateOrchestratorPrompt` | function  | `(opts: OrchestratorPromptConfig) -> string`                               | export                 |
| `packages/core/src/orchestrator-prompt.ts`            | `OrchestratorPromptConfig`   | interface | `config`, `projectId`, `project`                                           | export                 |
| `packages/core/src/metadata.ts`                       | `updateMetadata`             | function  | `(dataDir, sessionId, updates: Partial<Record<string, string>>) -> void`   | export                 |

---

## Delta Proposals (PROPOSED — implement in tasks below)

| File                                         | Export               | Kind      | Signature (exact)                                                                                                                           |
| -------------------------------------------- | -------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/issue-lifecycle-types.ts` | `IssueWorkflowPhase` | type      | String union: `"reproducer" \| "plan" \| "execute" \| "validate" \| "done"`                                                                 |
| `packages/core/src/issue-lifecycle-types.ts` | `TrustGateKind`      | type      | String union covering MVP gates from 0004 §3 (human plan approval, CI, artifact presence, config waiver) — exact literals in implementation |
| `packages/core/src/index.ts`                 | —                    | re-export | Export new types from `issue-lifecycle-types.js`                                                                                            |

---

## Tasks

### T01 — Branch baseline (Option A)

- **Priority:** High
- **Effort:** S
- **Status:** `complete`
- **Description:** Feature branch reset to `1a551a74` (0002 through T07 + `buildPlannerArtifactLayer` alignment); 0003 commits removed per `0004_PLAN.md` §7 Option A.
- **Dependencies:** none
- **Files to Change:** none (git-only)
- **Acceptance Criteria:**
  - `HEAD` is `1a551a74` on `feat/0002-planner-poc` (or successor branch)
  - No `[0003 T**]` commits in range `main..HEAD`

---

### T02 — Spec: issue lifecycle + Trust Vector + 0003 supersession

- **Priority:** High
- **Effort:** M
- **Status:** `complete`
- **Description:** Add `docs/specs/issue-lifecycle-trust-vector.md` documenting issue-centric phases (Plan → Execute → Validate), Trust Vector policy gates, same-worktree collaboration intent, and explicit supersession of 0003 multi-session handoff where it conflicts with 0004.
- **Dependencies:** T01
- **Files to Change:** `docs/specs/issue-lifecycle-trust-vector.md` (new)
- **Acceptance Criteria:**
  - Document lists phases, example gates, and relation to `role-typed-artifacts.md` semantics
  - States that 0003 session-centric snapshot handoff is not the north star
  - Links to `cursor/features/0004_PLAN.md`

**Proof of Work:** `docs/specs/issue-lifecycle-trust-vector.md` — §2 unit of work, §3 phases table, §4 Trust Vector, §5 0003 supersession, §6 `role-typed-artifacts.md` relation; link to `../../cursor/features/0004_PLAN.md`.

**Acceptance Criteria Check-off:** ✓ phases + gates + role-typed relation; ✓ §5 states 0003 multi-session/snapshot handoff is not the north star; ✓ link to `0004_PLAN.md`.

**Test Artifacts:** N/A (markdown spec).

---

### T03 — Spec: update `role-typed-artifacts.md` §8 open questions

- **Priority:** High
- **Effort:** S
- **Status:** `complete`
- **Description:** Resolve or narrow §8 items: same-worktree / phase transition vs separate sessions; default spawn role; reproducer policy — aligned with 0004 issue-centric model. If `docs/specs/role-typed-artifacts.md` is missing from the tree, add it with full prior content **or** minimal structure plus §8 + pointer to `issue-lifecycle-trust-vector.md` (maintainer choice).
- **Dependencies:** T02
- **Files to Change:** `docs/specs/role-typed-artifacts.md` (create or update)
- **Acceptance Criteria:**
  - §8 no longer leaves “same worktree” fully open without a documented stance
  - Cross-link to `issue-lifecycle-trust-vector.md`

**Proof of Work:** `docs/specs/role-typed-artifacts.md` — new file (not on `main`); §§1–7 restored from prior spec draft; **§8** retitled **“Resolved positions (0004 alignment)”** with subsections 8.1–8.6 (default role, role switch, same worktree, reproducer policy, trust gates `issue_reproduced` / `validation_signoff`, failing-test paths); links to `./issue-lifecycle-trust-vector.md`.

**Acceptance Criteria Check-off:** ✓ same-worktree / phase vs separate sessions documented (§8.2–8.3); ✓ cross-links to `issue-lifecycle-trust-vector.md` (§6, §8.5, Related).

**Test Artifacts:** N/A (markdown).

---

### T04 — Spec: plan-approval handoff errata (0003 superseded)

- **Priority:** Medium
- **Effort:** S
- **Status:** `complete`
- **Description:** Add or update `docs/specs/plan-approval-and-orchestrator-handoff.md` with a short **Errata / Supersession** section: 0003-style durable snapshot + session-only UX is superseded by issue-centric gates per 0004; preserve any still-valid bits (e.g. frontmatter ideas) where applicable. If file missing, create stub with errata + link to 0004 specs.
- **Dependencies:** T02
- **Files to Change:** `docs/specs/plan-approval-and-orchestrator-handoff.md` (create or update)
- **Acceptance Criteria:**
  - Errata section references `0004_PLAN.md` / `issue-lifecycle-trust-vector.md`
  - No claim that 0003 APIs exist on current branch unless reintroduced

**Proof of Work:** `docs/specs/plan-approval-and-orchestrator-handoff.md` — **Errata / Supersession (0004)** + “What remains useful” (frontmatter, gate signal, optional durability); **Historical note** explicitly not a current API contract; links to `../../cursor/features/0004_PLAN.md`, `./issue-lifecycle-trust-vector.md`, `./role-typed-artifacts.md`.

**Acceptance Criteria Check-off:** ✓ errata links `0004_PLAN.md` and `issue-lifecycle-trust-vector.md`; ✓ states reverted branches do not ship 0003 APIs unless reintroduced.

**Test Artifacts:** N/A (markdown).

---

### T05 — Spec: persistence sketch (phase + gate storage)

- **Priority:** Medium
- **Effort:** S
- **Status:** `not started`
- **Description:** Add `docs/specs/issue-lifecycle-state-persistence.md` sketching where issue phase and gate state may live (session metadata keys vs issue-index file vs tracker labels), tradeoffs, and **no commitment** to full implementation in one PR — per 0004 IN-SCOPE §2.
- **Dependencies:** T02
- **Files to Change:** `docs/specs/issue-lifecycle-state-persistence.md` (new)
- **Acceptance Criteria:**
  - Enumerates at least two storage options with pros/cons
  - References `Session.metadata` as one candidate (`types.ts` `Session`)

---

### T06 — Core: `IssueWorkflowPhase` + `TrustGateKind` types

- **Priority:** High
- **Effort:** S
- **Status:** `not started`
- **Description:** Add `packages/core/src/issue-lifecycle-types.ts` with exported string-literal unions for workflow phase and trust gate kinds (MVP set from 0004 §3 table + Trust Vector examples). Re-export from `packages/core/src/index.ts`. Add Vitest file asserting type exports are stable strings.
- **Dependencies:** T05 (conceptual alignment with persistence sketch)
- **Files to Change:** `packages/core/src/issue-lifecycle-types.ts` (new); `packages/core/src/index.ts`; `packages/core/src/__tests__/issue-lifecycle-types.test.ts` (new)
- **Acceptance Criteria:**
  - `pnpm --filter @composio/ao-core typecheck` passes
  - `pnpm --filter @composio/ao-core exec vitest run src/__tests__/issue-lifecycle-types.test.ts` passes
  - No wiring into `sessionManager.spawn` or `buildPrompt` (Future Work)

---

## Future Work (Non-Blocking) — 0004 phasing 4.2–4.4

- **4.2** Phase-aware prompt injection (`buildPrompt` / `PromptBuildConfig` extension — **PROPOSED Delta**, not in current API table).
- **4.3** Dashboard / CLI read path for phase + next gate.
- **4.4** Optional spawn or phase-advance guard from config (`SessionManager.spawn` — uses contract from `types.ts`).

---

## Integrity checks

### API Reference Audit

| Task    | Uses API Contract entries | Notes                                                                                          |
| ------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| T01     | none                      | git                                                                                            |
| T02–T05 | none                      | markdown only                                                                                  |
| T06     | **PROPOSED Delta only**   | New file `issue-lifecycle-types.ts`; re-export via `index.ts` pattern matches existing exports |

**ERROR: Nonexistent API** — None for T01–T05. T06 uses **Delta Proposals** only.

### Scope Audit

- **IN-SCOPE covered:** design docs (T02–T05), core type enumeration (T06), branch baseline (T01).
- **OUT-OF-SCOPE** items (v5 manifest, SSE, LLM guarantees, phase-aware `buildPrompt`, dashboard/CLI read path, spawn guard) listed under **Future Work** only — no tasks assigned.

---

_Plan 0004 tasks version: 1.0_
