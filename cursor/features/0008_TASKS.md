---
feature_number: 0008
plan: "./0008_PLAN.md"
plan_status: approved
tasks_status: not started
created_at: "2026-04-02T12:00:00Z"
---

# Tasks: Session lifecycle — phase advance (0008)

Derived from [`0008_PLAN.md`](./0008_PLAN.md) (approved). **North star:** `spawn` creates workers; **`advancePhase`** (Delta §1) transitions an **existing** issue-backed session through **phases** with **policy gates**; **CLI** exposes advance + clearer **status** when transitions are blocked. **Workspace** reconciliation so gate **probes** see `.ao/plan.md` on the advance path (plan §Implementation a–c).

**Guard:** If `0008_PLAN.md` has `requires_approval: true` and `status` ≠ `approved`, abort with: `Plan 0008 not approved (status: <status>).`

---

## Relationship to prior features

| Prior | 0008 adds |
| ----- | --------- |
| 0005 phase metadata + `buildPrompt(issueWorkflowPhase)` | **Runtime** phase change + prompt **resend** on same session |
| 0006 trust gates at **spawn** | Gates on **advance**; `listMissingTransitionGates` (Delta §2) |
| 0007 plan approve | Advance may follow approval; does not replace `approvePlanArtifactInWorkspace` |
| `ao plan approve` / `ao plan send` (0007) | **T07:** Re-validate operator model after `advancePhase` (see T07) |

---

## API Contract Table (verify signatures before each task)

| File | Export | Kind | Signature / notes |
| ---- | ------ | ---- | ----------------- |
| `packages/core/src/types.ts` | `Session` | interface | `metadata: Record<string, string>`, `workspacePath`, … |
| `packages/core/src/types.ts` | `SessionManager` | interface | `spawn`, `get`, `send`, … (no `advancePhase` until Delta §1) |
| `packages/core/src/types.ts` | `SessionId` | type | string |
| `packages/core/src/types.ts` | `WorkerRole` | type | `planner \| executor \| validator \| reproducer` |
| `packages/core/src/types.ts` | `ProjectConfig` | interface | `requireIssueLifecycleGates?`, … |
| `packages/core/src/metadata.ts` | `updateMetadata` | function | `(dataDir, sessionId, updates) => void` |
| `packages/core/src/prompt-builder.ts` | `buildPrompt` | function | `(PromptBuildConfig) => string` |
| `packages/core/src/prompt-builder.ts` | `PromptBuildConfig` | interface | `issueWorkflowPhase?`, `project`, `projectId`, `issueId?`, … |
| `packages/core/src/issue-lifecycle-types.ts` | `IssueWorkflowPhase` | type | union from `ISSUE_WORKFLOW_PHASES` |
| `packages/core/src/issue-lifecycle-types.ts` | `ISSUE_WORKFLOW_PHASE_METADATA_KEY` | const | metadata key for phase |
| `packages/core/src/issue-lifecycle-types.ts` | `defaultIssueWorkflowPhaseForSpawn` | function | spawn default only |
| `packages/core/src/evaluate-trust-gates.ts` | `listMissingExecutorTrustGates` | function | `(ExecutorTrustGateContext) => TrustGateKind[]` |
| `packages/core/src/evaluate-trust-gates.ts` | `ExecutorTrustGateContext` | type | metadata, issueId, planArtifactIssue, probe |
| `packages/core/src/plan-artifact-gates.ts` | `probePlanArtifact` | function | `(workspacePath, relPath?) => PlanFrontmatterProbeResult` |
| `packages/core/src/issue-lifecycle-gates.ts` | `trustGateMetadataKey` | function | `(TrustGateKind) => string` |
| `packages/core/src/config.ts` | `loadConfig` | function | loads YAML |
| `packages/core/src/session-manager.ts` | `createSessionManager` | function | `(SessionManagerDeps) => OpenCodeSessionManager` |
| `packages/cli/src/commands/session.ts` | `registerSession` | function | `(Command) => void` |
| `packages/cli/src/commands/status.ts` | `registerStatus` | function | `(Command) => void` |
| `packages/cli/src/lib/create-session-manager.ts` | `getSessionManager` | function | pattern for CLI services |
| `packages/cli/src/commands/plan.ts` | `registerPlan` | function | `(Command) => void` — `ao plan approve`, `ao plan send` |
| `packages/core/src/plan-artifact-approve.ts` | `approvePlanArtifactInWorkspace` | function | writes plan frontmatter (0007) |
| `packages/core/src/types.ts` | `SessionManager.send` | method | `(sessionId, message) => Promise<void>` |
| **PROPOSED (Delta §1) → T03** | `SessionManager.advancePhase` | method | see 0008 plan |
| **PROPOSED (Delta §2) → T01** | `listMissingTransitionGates` | function | see 0008 plan |

**Note:** `mergeTrustGateMetadataFromIssueSessions` in `session-manager.ts` is **not** exported; T03 may use it **internally** only when implementing `advancePhase` in the same module.

---

## Tasks

### T01 — Core: `listMissingTransitionGates` (Delta §2)

- **Priority:** High
- **Effort:** M
- **Status:** `complete`
- **Description:** Add `listMissingTransitionGates(from, to, ctx)` per 0008 Delta §2, using existing `ExecutorTrustGateContext` for MVP. For transitions into `execute`, delegate or align with `listMissingExecutorTrustGates` semantics; for other edges (e.g. toward `validate`), return missing kinds per plan MVP (may stub with empty or minimal checks). Export from `packages/core/src/index.ts`. Pure functions + unit tests only.
- **Dependencies:** none
- **Files to Change:** `packages/core/src/evaluate-trust-gates.ts` (or new module re-exported from `index.ts`); `packages/core/src/index.ts`; `packages/core/src/__tests__/evaluate-trust-gates.test.ts` (or new test file)
- **Acceptance Criteria:**
  - Signature matches Delta §2 in `0008_PLAN.md`
  - Unit tests: at least plan→execute and execute→validate (or documented stub) cases; no throw on unknown pair if documented
  - `pnpm --filter @composio/ao-core typecheck` and core tests pass

**API entries used:** `listMissingExecutorTrustGates`, `ExecutorTrustGateContext`, `IssueWorkflowPhase`, `TrustGateKind`, **PROPOSED** `listMissingTransitionGates`.

- **Proof of work:** Added `listMissingTransitionGates` in `packages/core/src/evaluate-trust-gates.ts` (into-`execute` delegates to `listMissingExecutorTrustGates`; `execute`→`validate` checks verification metadata; `validate`→`done` checks `validation_signoff`; `reproducer`→`plan` checks `issue_reproduced`; same-phase and other pairs return `[]`). Exported from `packages/core/src/index.ts`.
- **Acceptance Criteria Check-off:**
  - ✓ Signature `(from: IssueWorkflowPhase, to: IssueWorkflowPhase, ctx: ExecutorTrustGateContext) => TrustGateKind[]`
  - ✓ Tests: `describe("listMissingTransitionGates")` in `evaluate-trust-gates.test.ts`
  - ✓ `pnpm --filter @composio/ao-core build` + vitest file pass
- **Test Artifacts:** `packages/core/src/__tests__/evaluate-trust-gates.test.ts` — `listMissingTransitionGates` describe block (9 tests).

---

### T02 — Core: workspace + gate probe for same issue path

- **Priority:** High
- **Effort:** M
- **Status:** `complete`
- **Description:** Implement **one** coherent strategy from `0008_PLAN.md` Implementation (a2): so `probePlanArtifact` used during **advance** to `execute` sees the planner’s `.ao/plan.md` — either **same `workspacePath`** (single session holds plan) or **copy/sync** from planner session path recorded in metadata, or **probe path override** derived from merged issue sessions. Document chosen strategy in code comment. No change to exported `Workspace.create` contract unless explicitly required; prefer metadata-driven probe path inside `advancePhase` implementation.
- **Dependencies:** none (parallel with T01)
- **Files to Change:** `packages/core/src/session-manager.ts` (helpers as needed); tests with temp dirs
- **Acceptance Criteria:**
  - Advancing to execute **without** a visible plan where policy requires it **fails** with actionable error (when `requireIssueLifecycleGates` true)
  - Unit or integration test proves probe sees plan content after chosen strategy

**API entries used:** `probePlanArtifact`, `readMetadata` / internal metadata paths, **internal** `mergeTrustGateMetadataFromIssueSessions` (same file only).

- **Proof of work:** Added `PlanArtifactProbeLocation` + `resolvePlanArtifactProbeForIssue` in `session-manager.ts` (scan other sessions for same `issue`, prefer `workerRole=planner`, probe until file found; else fall back to current worktree + `.ao/plan.md`). Executor-phase **spawn** guard now uses resolved location for `probePlanArtifact` before `listMissingExecutorTrustGates`. Exported from `packages/core/src/index.ts`.
- **Acceptance Criteria Check-off:**
  - ✓ Executor spawn with gates: probe can resolve planner’s tree on same issue (spawn tests pass)
  - ✓ `plan-probe-resolve.test.ts`: planner worktree preferred; fallback when none
- **Test Artifacts:** `packages/core/src/__tests__/plan-probe-resolve.test.ts` — 3 tests.

---

### T03 — Core: `SessionManager.advancePhase` (Delta §1)

- **Priority:** High
- **Effort:** L
- **Status:** `not started`
- **Description:** Extend `SessionManager` / `OpenCodeSessionManager` with `advancePhase(sessionId, target, options?)` per Delta §1. Load session + project; if `project.requireIssueLifecycleGates`, evaluate **transition** gates via T01/T02 probe path; persist `issueWorkflowPhase` and `workerRole` via existing metadata patterns; call `buildPrompt` with new phase + issue context; `send` composed instruction to session. Respect `skipGateCheck` only for tests or explicit danger flag (document). Export updated interface from `types.ts`; implement in `session-manager.ts`; export unchanged factory return type.
- **Dependencies:** T01, T02
- **Files to Change:** `packages/core/src/types.ts`; `packages/core/src/session-manager.ts`; `packages/core/src/index.ts`; `packages/core/src/__tests__/session-manager/` (new or extend spawn tests)
- **Acceptance Criteria:**
  - Signature matches Delta §1
  - `pnpm --filter @composio/ao-core typecheck` passes
  - Tests cover: blocked advance when gates missing; successful advance updates metadata and calls `send` path (mock runtime/agent as existing spawn tests)

**API entries used:** `SessionManager`, `Session`, `buildPrompt`, `PromptBuildConfig`, `updateMetadata`, `get`/`list` patterns, `listMissingTransitionGates` (T01), probe path (T02), `loadConfig` via deps, **PROPOSED** `advancePhase`.

---

### T04 — CLI: `ao session advance`

- **Priority:** High
- **Effort:** M
- **Status:** `not started`
- **Description:** Add subcommand (e.g. `ao session advance <sessionId> --phase <phase>` with optional `--worker-role`) calling `SessionManager.advancePhase` via `getSessionManager` + `loadConfig`. Print clear errors when gates block (surface missing gate kinds). Register in `packages/cli/src/index.ts` under existing `registerSession` or sibling.
- **Dependencies:** T03
- **Files to Change:** `packages/cli/src/commands/session.ts`; `packages/cli/src/index.ts`; `packages/cli/__tests__/commands/session.test.ts` (or new) if pattern exists
- **Acceptance Criteria:**
  - CLI parses args and invokes advance
  - Integration or unit test with mocked `SessionManager`
  - `pnpm --filter @composio/ao-cli typecheck` passes

**API entries used:** `registerSession`, `loadConfig`, `createSessionManager` / `getSessionManager`, **PROPOSED** `advancePhase` on manager.

---

### T05 — CLI: `ao status` — blocked transition / next gate hints

- **Priority:** Medium
- **Effort:** S
- **Status:** `not started`
- **Description:** Extend `registerStatus` output (table or JSON) so operators see when an **advance** would fail: e.g. compact line “advance blocked: human_plan_approval” using metadata + optional dry evaluation. Do not duplicate large policy engine; reuse `listMissingExecutorTrustGates` or T01 for **current** phase → **next** phase preview where feasible.
- **Dependencies:** T01 (for preview), T03 (for parity with real advance)
- **Files to Change:** `packages/cli/src/commands/status.ts`; tests if present
- **Acceptance Criteria:**
  - JSON / text output includes new field or suffix when trust gates block next step
  - No regression in existing status columns

**API entries used:** `registerStatus`, `listMissingExecutorTrustGates`, T01 `listMissingTransitionGates`, `ISSUE_WORKFLOW_PHASE_METADATA_KEY`, `trustGateMetadataKey` / metadata scan (already partially in status.ts).

---

### T06 — Documentation pointer

- **Priority:** Low
- **Effort:** S
- **Status:** `not started`
- **Description:** Add short bullets to `AGENTS.md` (or `packages/cli/src/lib/config-instruction.ts` only if preferred) describing `ao session advance` and the rule: **spawn** creates; **advance** moves phase on the **same** session when gates pass.
- **Dependencies:** T04
- **Files to Change:** `AGENTS.md` and/or `packages/cli/src/lib/config-instruction.ts`
- **Acceptance Criteria:**
  - Conventional-commit-ready doc delta; links to `0008_PLAN.md` optional

**API entries used:** none (documentation only).

---

### T07 — Review / cleanup: `ao plan approve` \| `ao plan send` vs 0008

- **Priority:** Medium
- **Effort:** S
- **Status:** `not started`
- **Description:** After `advancePhase` exists (T03–T04), **review** whether the 0007 CLI model still fits: `ao plan approve` (writes `status: approved` via `approvePlanArtifactInWorkspace`) and `ao plan send` (delegates to `SessionManager.send`) vs **`ao session advance`** (phase + gates + composed prompt). Produce a short **operator story**: when to use approve/send only, when advance is required, and whether any overlap should be **documented**, **deprecated**, or **wired** (e.g. optional `advance` pre-step that assumes approved plan). Update `registerPlan` help text and `AGENTS.md` / config-help if the story changes. No large refactor unless review finds redundancy worth a follow-up task.
- **Dependencies:** T03, T04, T06 (doc baseline for advance)
- **Files to Change:** `packages/cli/src/commands/plan.ts` (descriptions/help); `AGENTS.md`; optional note in `cursor/features/0007_TASKS.md` or 0007 plan cross-link
- **Acceptance Criteria:**
  - Written conclusion (bullet list in this task or linked doc) on whether 0007 commands remain **first-class** alongside advance
  - Help strings for `ao plan` subcommands mention relationship to `ao session advance` where applicable
  - No broken workflows: approve→advance or approve-only paths still coherent with `requireIssueLifecycleGates`

**API entries used:** `registerPlan`, `approvePlanArtifactInWorkspace`, `SessionManager.send`, **PROPOSED** `advancePhase` (post-T03).

---

## Future work (non-blocking) — from 0008 plan

- Tracker label mirror for phase / awaiting approval
- `generateOrchestratorPrompt` copy for issue phase + next gate
- Automated poller: approved plan → `advancePhase`
- Web `POST /api/sessions/[id]/advance` (dashboard parity)

---

## Integrity checks

### API reference audit

| Task | APIs / PROPOSED used | Notes |
| ---- | -------------------- | ----- |
| T01 | `listMissingExecutorTrustGates`, `ExecutorTrustGateContext`, `IssueWorkflowPhase`, `TrustGateKind` | **PROPOSED** `listMissingTransitionGates` — OK |
| T02 | `probePlanArtifact`, internal merge helper | OK |
| T03 | `SessionManager`, `buildPrompt`, `PromptBuildConfig`, `updateMetadata`, T01, T02 | **PROPOSED** `advancePhase` — OK |
| T04 | `registerSession`, `loadConfig`, `getSessionManager` | **PROPOSED** `advancePhase` — OK |
| T05 | `registerStatus`, T01, existing status metadata helpers | OK |
| T06 | none | OK |
| T07 | `registerPlan`, `approvePlanArtifactInWorkspace`, `SessionManager.send`, **PROPOSED** `advancePhase` | OK |

**ERROR: Nonexistent API:** none — all symbols from contract table or Delta tasks.

### Scope audit

- **IN-SCOPE:** Core advance + gates + CLI + status hints + doc pointer; workspace probe strategy for advance path; **T07** review of 0007 `ao plan` UX vs advance.
- **OUT-OF-SCOPE (excluded from tasks):** policy engine DSL, tracker as SoT, SSE/dashboard redesign, automated poller, web advance route (listed Future Work only).

---

## Review checklist (tasks file)

- [ ] Each task maps to `0008_PLAN.md` Implementation or Delta §1/§2
- [ ] No task references exports outside API table except PROPOSED (T01/T03/T07 for `advancePhase`)
- [ ] Future Work separated
- [ ] `tasks_status` updated when work completes

---

## How to mark tasks complete

- Update **Status** per task to `complete` with proof-of-work bullets (see 0007_TASKS pattern).
- Set `tasks_status: complete` in this file header when all required tasks (T01–T07) are done.
