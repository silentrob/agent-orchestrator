---
feature_number: 0006
plan: "./0006_PLAN.md"
plan_status: approved
tasks_status: in progress
created_at: "2026-04-02T00:00:00Z"
---

# Tasks: Trust gates between phases (0006)

Derived from [`0006_PLAN.md`](./0006_PLAN.md). **Data layer:** **Option A** — per-gate metadata keys (`trustGate*` + satisfaction value), MVP gates `artifact_plan_present`, `human_plan_approval`, `ci_passing`.

**Guard:** If `requires_approval: true` and plan status ≠ `approved`, abort with: `Plan 0006 not approved (status: <status>).`

---

## Relationship to 0005

| 0005 delivered | 0006 implements |
| --- | --- |
| `issueWorkflowPhase` metadata, phase prompts (thin non-planner), UI/CLI phase | **Persisted gate satisfaction** (Option A keys), **spawn evaluation** for executor when `requireIssueLifecycleGates`, **plan file probe**, **lifecycle CI hook**, **deeper phase prompts**, **gate visibility** |

---

## API Contract Table (verify signatures before each task)

| File | Export | Kind | Signature / notes |
| --- | --- | --- | --- |
| `packages/core/src/issue-lifecycle-types.ts` | `ISSUE_WORKFLOW_PHASE_METADATA_KEY` | const | string |
| `packages/core/src/issue-lifecycle-types.ts` | `ISSUE_WORKFLOW_PHASES`, `IssueWorkflowPhase` | const, type | phases array + union |
| `packages/core/src/issue-lifecycle-types.ts` | `TRUST_GATE_KINDS`, `TrustGateKind` | const, type | gates array + union |
| `packages/core/src/issue-lifecycle-types.ts` | `defaultIssueWorkflowPhaseForSpawn` | function | `(ctx: IssueSpawnPhaseContext) => IssueWorkflowPhase \| undefined` |
| `packages/core/src/types.ts` | `WorkerRole`, `SessionSpawnConfig`, `ProjectConfig` | type | includes `requireIssueLifecycleGates?`, `workerRole?` |
| `packages/core/src/metadata.ts` | `updateMetadata` | function | `(dataDir, sessionId, Partial<Record<string,string>>) => void` |
| `packages/core/src/metadata.ts` | `readMetadataRaw` | function | reads flat metadata (for tests / gate reads if needed) |
| `packages/core/src/session-manager.ts` | `createSessionManager` → `spawn` | factory + method | spawn guard ~946–957 |
| `packages/core/src/lifecycle-manager.ts` | `createLifecycleManager` | factory | uses `updateMetadata` (see ~700) |
| `packages/core/src/prompt/artifact-layers-by-role.ts` | `buildIssueWorkflowPhaseLayer`, `buildPlannerArtifactLayer` | function | string prompts |
| `packages/core/src/prompt-builder.ts` | `buildPrompt`, `PromptBuildConfig` | function, type | optional `issueWorkflowPhase` |
| `packages/core/src/index.ts` | issue lifecycle re-exports | module | ~93–104 |
| `packages/cli/src/commands/status.ts` | `registerStatus` | function | session table |
| `packages/web/src/lib/types.ts` | `DashboardSession` | type | session DTO |
| `packages/web/src/lib/serialize.ts` | `sessionToDashboard` | function | `Session` → dashboard |
| **PROPOSED (Delta §1) → T01** | `packages/core/src/issue-lifecycle-gates.ts` | `TRUST_GATE_SATISFACTION_PREFIX`, `trustGateMetadataKey(kind)` | new file |
| **PROPOSED (Delta §2) → T02** | `packages/core/src/plan-artifact-gates.ts` | `PlanFrontmatterProbeResult`, `probePlanArtifact(workspacePath, relPath?)` | new file |

---

## Tasks

### T01 — Gate metadata keys (Option A) + `trustGateMetadataKey`

- **Priority:** High
- **Effort:** S
- **Status:** `complete`
- **Description:** Add `issue-lifecycle-gates.ts` with `TRUST_GATE_SATISFACTION_PREFIX`, `trustGateMetadataKey(kind: TrustGateKind): string`, and a small **satisfaction value** union or const (e.g. `satisfied` | `pending` | `failed`) documented in file header. Keys must map each `TrustGateKind` to a single flat metadata key compatible with `updateMetadata`. Export from `packages/core/src/index.ts`.
- **Dependencies:** none
- **Files to Change:** `packages/core/src/issue-lifecycle-gates.ts` (new); `packages/core/src/index.ts`; `packages/core/src/__tests__/issue-lifecycle-gates.test.ts` (new)
- **Acceptance Criteria:**
  - Every `TrustGateKind` maps to a stable string key via `trustGateMetadataKey`
  - Unit tests cover exhaustive mapping + no collisions
  - `pnpm --filter @composio/ao-core typecheck` passes

**API entries used:** `TrustGateKind`, `TRUST_GATE_KINDS` (`issue-lifecycle-types.ts`); `index.ts` export pattern.

**Proof of Work:** Added `packages/core/src/issue-lifecycle-gates.ts` (`TRUST_GATE_SATISFACTION_PREFIX`, `TRUST_GATE_SATISFACTION_VALUES`, `TrustGateSatisfaction`, `trustGateMetadataKey`, `TRUST_GATE_METADATA_KEY_LIST`); re-exports in `packages/core/src/index.ts`.

**Acceptance Criteria Check-off:** ✓ exhaustive mapping; ✓ no duplicate keys; ✓ `pnpm --filter @composio/ao-core typecheck` passes.

**Test Artifacts:** `packages/core/src/__tests__/issue-lifecycle-gates.test.ts` — `maps every TrustGateKind`, `has no duplicate metadata keys`, `TRUST_GATE_METADATA_KEY_LIST matches`.

---

### T02 — `probePlanArtifact` (plan frontmatter)

- **Priority:** High
- **Effort:** M
- **Status:** `complete`
- **Description:** Add `plan-artifact-gates.ts` implementing `PlanFrontmatterProbeResult` and `probePlanArtifact(workspacePath, relPath?)` using line-based `---` YAML frontmatter slice (consistent with `spawn.test.ts` fixtures). Resolve default `.ao/plan.md` when `relPath` omitted. No new YAML dependency unless already in repo; prefer minimal parsing.
- **Dependencies:** none
- **Files to Change:** `packages/core/src/plan-artifact-gates.ts` (new); `packages/core/src/index.ts`; `packages/core/src/__tests__/plan-artifact-gates.test.ts` (new)
- **Acceptance Criteria:**
  - Missing file → `found: false`, safe path in result
  - Sample frontmatter extracts `status`, `requires_approval` when present
  - Core tests + typecheck pass

**API entries used:** new Delta §2 exports only.

**Proof of Work:** `packages/core/src/plan-artifact-gates.ts` — `PlanFrontmatterProbeResult`, `probePlanArtifact`, internal `parsePlanFrontmatter` (exported for tests); `index.ts` re-exports probe + type.

**Acceptance Criteria Check-off:** ✓ missing file `found: false` + path; ✓ `status` / `requiresApproval` from frontmatter; ✓ typecheck + tests.

**Test Artifacts:** `packages/core/src/__tests__/plan-artifact-gates.test.ts` — missing file, default path, custom relPath, `parsePlanFrontmatter` cases.

---

### T03 — Pure gate evaluation helpers (executor transition)

- **Priority:** High
- **Effort:** M
- **Status:** `complete`
- **Description:** Implement pure helpers (same module as T01 or sibling) that, given **metadata record** + optional `PlanFrontmatterProbeResult` + `spawnConfig` context (`issueId`, `planArtifactIssue` rules), compute **which MVP gates are missing** for allowing an **execute**-phase spawn when `requireIssueLifecycleGates` is on. Enforce plan mitigation: when `planArtifactIssue` is set, it must match `issueId` before treating plan-based gates as satisfied. Document canonical session assumption in JSDoc (single worker per issue for gate evaluation at spawn).
- **Dependencies:** T01, T02
- **Files to Change:** `packages/core/src/issue-lifecycle-gates.ts` or `evaluate-trust-gates.ts` (new); tests
- **Acceptance Criteria:**
  - Unit tests: satisfied / pending combinations for `artifact_plan_present`, `human_plan_approval`, `ci_passing`
  - Mismatch `planArtifactIssue` vs `issueId` fails closed (gate not satisfied)
  - No filesystem access in pure evaluator except via injected probe result

**API entries used:** `TrustGateKind`; `defaultIssueWorkflowPhaseForSpawn`; `SessionSpawnConfig` fields; T01/T02 new exports.

**Proof of Work:** `packages/core/src/evaluate-trust-gates.ts` — `MVP_EXECUTOR_TRUST_GATE_KINDS`, `ExecutorTrustGateContext`, `listMissingExecutorTrustGates`, `isPlanIssueAligned`; `index.ts` re-exports.

**Acceptance Criteria Check-off:** ✓ MVP combinations covered in tests; ✓ `planArtifactIssue`/`issueId` mismatch fails closed; ✓ pure (no fs — probe injected).

**Test Artifacts:** `packages/core/src/__tests__/evaluate-trust-gates.test.ts` — `isPlanIssueAligned` cases; `listMissingExecutorTrustGates` ci/artifact/human/mismatch/MVP order.

---

### T04 — `session-manager.spawn`: replace stub guard with evaluation

- **Priority:** High
- **Effort:** M
- **Status:** `complete`
- **Description:** When `project.requireIssueLifecycleGates` and resolved spawn phase is **execute**, call **T03** with metadata (pre-spawn empty or existing), **T02** probe when workspace path exists, and `spawnConfig.issueId` / planner metadata keys (`planArtifactRelPath`, `planArtifactIssue`) already set by spawn for planner sessions. **Allow** spawn when gates satisfied; otherwise **throw** listing **missing gates** (operator-actionable). Non-execute phases keep current behavior unless plan specifies otherwise.
- **Dependencies:** T03
- **Files to Change:** `packages/core/src/session-manager.ts`; `packages/core/src/__tests__/session-manager/spawn.test.ts`
- **Acceptance Criteria:**
  - Tests cover: gates satisfied → executor spawn succeeds; missing gate → error message lists gate kinds
  - Existing `requireIssueLifecycleGates` tests updated from “always throws execute” to new semantics
  - Typecheck passes

**API entries used:** `createSessionManager`/`spawn`; `updateMetadata` (indirect if metadata read helpers used); T03 helpers.

**Proof of Work:** `session-manager.ts` — `mergeTrustGateMetadataFromIssueSessions`, post-workspace executor gate block calling `probePlanArtifact` + `listMissingExecutorTrustGates`; cleanup workspace + reserved metadata on failure.

**Acceptance Criteria Check-off:** ✓ failure lists missing gates; ✓ success path with sibling CI + `.ao/plan.md`; ✓ planner/disabled cases preserved; ✓ typecheck.

**Test Artifacts:** `spawn.test.ts` describe `requireIssueLifecycleGates` — rejects when gates missing; allows executor with seed session + plan file.

---

### T05 — Lifecycle: set `ci_passing` gate when CI green

- **Priority:** Medium
- **Effort:** M
- **Status:** `complete`
- **Description:** In `lifecycle-manager.ts`, when SCM reports CI **passing** for the session’s PR (reuse existing CI summary path ~502–504), write `trustGateCiPassing=satisfied` via `trustGateMetadataKey` + `updateMetadata`. Do not downgrade on transient failures without a defined policy — minimal: set satisfied on green; leave pending otherwise (document in code comment).
- **Dependencies:** T01
- **Files to Change:** `packages/core/src/lifecycle-manager.ts`; `packages/core/src/__tests__/lifecycle-manager.test.ts` (if exists) or targeted test
- **Acceptance Criteria:**
  - When CI transitions to green, metadata contains satisfied key for `ci_passing`
  - No new dependency on web; core tests or existing lifecycle tests extended

**API entries used:** `createLifecycleManager` internals; `updateMetadata`; `trustGateMetadataKey` (T01).

**Proof of Work:** `lifecycle-manager.ts` — `recordTrustGateCiPassingWhenGreen` + calls after cached and uncached CI failure checks; uses `updateSessionMetadata` + `trustGateMetadataKey("ci_passing")`.

**Acceptance Criteria Check-off:** ✓ green writes `trustGateCiPassing=satisfied`; ✓ failing leaves key unset; ✓ no web dep.

**Test Artifacts:** `lifecycle-manager.test.ts` — `persists trustGateCiPassing satisfied when SCM reports CI passing`, `does not set trustGateCiPassing when CI is failing`.

---

### T06 — Deepen `execute` / `validate` / `reproducer` prompt layers

- **Priority:** Medium
- **Effort:** M
- **Status:** `complete`
- **Description:** Expand `buildIssueWorkflowPhaseLayer` branches for `execute`, `validate`, `reproducer` with Trust-aligned content (checklist, verification evidence, repro minimality) per plan §b; keep file under team line limits or split helpers in same folder. Avoid duplicating entire `BASE_AGENT_PROMPT`.
- **Dependencies:** none (soft: T01 for naming consistency in prose)
- **Files to Change:** `packages/core/src/prompt/artifact-layers-by-role.ts`; `packages/core/src/__tests__/artifact-layers-by-role.test.ts`; `packages/core/src/__tests__/prompt-builder.test.ts` if strings change
- **Acceptance Criteria:**
  - Tests assert new subsection headings or keywords for each phase
  - `pnpm --filter @composio/ao-core test` for touched tests passes

**API entries used:** `buildIssueWorkflowPhaseLayer`, `buildPlannerArtifactLayer`; `buildPrompt` indirect.

**Proof of Work:** `artifact-layers-by-role.ts` — `buildExecutorArtifactLayer`, `buildValidatorArtifactLayer`, `buildReproducerArtifactLayer` (replacing placeholders) with Trust checklist, PR discipline, verification evidence / sign-off / CI, repro minimality / minimal reproduction / handoff.

**Acceptance Criteria Check-off:** ✓ subsection headings per phase in tests; ✓ core tests green.

**Test Artifacts:** `artifact-layers-by-role.test.ts` — execute/validate/reproducer describe cases assert `###` headings.

---

### T07 — CLI: `ao status` gate summary

- **Priority:** Medium
- **Effort:** S
- **Status:** `not started`
- **Description:** When session metadata contains keys matching `TRUST_GATE_SATISFACTION_PREFIX` / `trustGateMetadataKey` pattern, show compact **gates** column or dim suffix (e.g. satisfied gates count or first pending). Reuse `padCol` / width constraints from Phase column.
- **Dependencies:** T01
- **Files to Change:** `packages/cli/src/commands/status.ts`; `packages/cli/__tests__/commands/status.test.ts`
- **Acceptance Criteria:**
  - Output includes gate info when metadata keys present
  - JSON mode includes gate fields if applicable
  - `pnpm --filter @composio/ao-cli test` or root test scope passes for CLI

**API entries used:** `registerStatus` path only; metadata shape as flat strings.

---

### T08 — Web: dashboard gate summary

- **Priority:** Medium
- **Effort:** M
- **Status:** `not started`
- **Description:** Map trust gate keys from `session.metadata` into `DashboardSession` (optional field e.g. `trustGateSummary`) in `sessionToDashboard`. Show compact badge or line on `SessionDetail` / `SessionCard` (Tailwind-only, existing patterns).
- **Dependencies:** T01
- **Files to Change:** `packages/web/src/lib/types.ts`; `packages/web/src/lib/serialize.ts`; `packages/web/src/components/SessionDetail.tsx` and/or `SessionCard.tsx`; `packages/web/src/__tests__/*`
- **Acceptance Criteria:**
  - Gate summary visible when metadata keys present
  - `pnpm --filter @composio/ao-web test` passes

**API entries used:** `sessionToDashboard`; `DashboardSession`.

---

### T09 — Docs: persistence sketch cross-link

- **Priority:** Low
- **Effort:** S
- **Status:** `not started`
- **Description:** Update `docs/specs/issue-lifecycle-state-persistence.md` Recommendation § to reference implemented Option A key names and point to `issue-lifecycle-gates.ts`. No large rewrite.
- **Dependencies:** T01
- **Files to Change:** `docs/specs/issue-lifecycle-state-persistence.md`
- **Acceptance Criteria:**
  - Doc references real file path after T01 merge
  - Describes Option A as implemented for 0006 MVP

**API entries used:** none (documentation only; aligns with T01 file).

---

## API Reference Audit

| Task | API Contract entries used | Notes |
| --- | --- | --- |
| T01 | `TrustGateKind`, `TRUST_GATE_KINDS`; `index.ts` export | Adds Delta §1 |
| T02 | (Delta §2 new) | New file |
| T03 | T01, T02, `defaultIssueWorkflowPhaseForSpawn`, `SessionSpawnConfig` | Pure logic |
| T04 | `spawn`, T03, `probePlanArtifact` | Session manager |
| T05 | `lifecycle-manager`, `updateMetadata`, T01 | CI hook |
| T06 | `buildIssueWorkflowPhaseLayer` | Prompts |
| T07 | `registerStatus`, metadata keys | CLI |
| T08 | `sessionToDashboard`, `DashboardSession` | Web |
| T09 | — | Docs only |

**ERROR: Nonexistent API** — None: all references resolve to the table or Delta tasks T01/T02.

---

## Scope Audit

- **IN-SCOPE covered:** gate persistence Option A, spawn evaluation, plan probe, lifecycle CI satisfied, prompt depth, CLI/web visibility, doc pointer.
- **OUT-OF-SCOPE (not in tasks):** policy engine DSL, tracker mirror, new agent plugins, artifact manifest, 0003 HTTP routes — listed in plan **Future Work**; no tasks added.

---

## Future Work (Non-Blocking)

- Issue-index file (persistence Candidate 2) if session churn requires it.
- Tracker label mirror for gates.
- `trustGateVector` JSON (Option B) if key count grows.
