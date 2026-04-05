---
feature_number: 0005
plan: "./0005_PLAN.md"
plan_status: approved
tasks_status: in progress
created_at: "2026-04-02T00:00:00Z"
---

# Tasks: Issue lifecycle runtime (0005)

Derived from [`0005_PLAN.md`](./0005_PLAN.md). Executes **runtime** work after **0004** (specs + types only).

**Guard:** If `requires_approval: true` and plan status ≠ `approved`, abort with: `Plan 0005 not approved (status: <status>).`

---

## Relationship to 0004

| 0004 delivered                              | 0005 implements                                          |
| ------------------------------------------- | -------------------------------------------------------- |
| Specs + Trust Vector docs                   | Read/write **phase** and gate **hints** on real sessions |
| `IssueWorkflowPhase`, `TrustGateKind` types | **Metadata keys**, **`buildPrompt`** wiring, **UI/CLI**  |

---

## API Contract Table (seed — verify signatures before each task)

| File                                         | Export                                                                             | Notes         |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | ------------- |
| `packages/core/src/issue-lifecycle-types.ts` | `IssueWorkflowPhase`, `ISSUE_WORKFLOW_PHASES`, `TrustGateKind`, `TRUST_GATE_KINDS` | 0004          |
| `packages/core/src/prompt-builder.ts`        | `buildPrompt`, `PromptBuildConfig`                                                 | extend in T02 |
| `packages/core/src/types.ts`                 | `Session`, `SessionSpawnConfig`                                                    | metadata      |
| `packages/core/src/metadata.ts`              | `updateMetadata`                                                                   | T01           |
| `packages/core/src/session-manager.ts`       | `createSessionManager`, `spawn`                                                    | T01           |

---

## Tasks

### T01 — Session metadata: canonical keys + default phase on spawn

- **Priority:** High
- **Effort:** M
- **Status:** `complete`
- **Description:** Define stable string keys (e.g. `issueWorkflowPhase`) for `Session.metadata`. On `spawn` when `issueId` is set, default phase to `plan` or `execute` per 0005 plan §Approach (document choice). Persist via existing metadata write path. Ensure `get` returns values for dashboard/lifecycle.
- **Dependencies:** none
- **Files to Change:** `packages/core/src/session-manager.ts` (spawn path); `packages/core/src/types.ts` or `issue-lifecycle-types.ts` (key constants); tests under `packages/core/src/__tests__/`
- **Acceptance Criteria:**
  - New sessions with `issueId` receive default phase in metadata
  - Keys documented in one place (const export or comment block)
  - Core tests cover spawn metadata
  - `pnpm --filter @composio/ao-core typecheck` passes

**Proof of Work:** `issue-lifecycle-types.ts` — `ISSUE_WORKFLOW_PHASE_METADATA_KEY`, `IssueSpawnPhaseContext`, `defaultIssueWorkflowPhaseForSpawn` (planner→plan, executor/omitted→execute, validator→validate, reproducer→reproducer); `session-manager.ts` spawn sets metadata before `updateMetadata`; `index.ts` re-exports; tests in `issue-lifecycle-types.test.ts` + `spawn.test.ts` describe `issue workflow phase metadata (0005)`.

**Acceptance Criteria Check-off:** ✓ issueId+metadata; ✓ key const export; ✓ spawn + unit tests; ✓ typecheck.

**Test Artifacts:** `issue-lifecycle-types.test.ts` — metadata key + `defaultIssueWorkflowPhaseForSpawn` cases; `spawn.test.ts` — execute default, planner→plan, no issueId→undefined.

---

### T02 — `PromptBuildConfig` + `buildPrompt`: phase-aware layer

- **Priority:** High
- **Effort:** M
- **Status:** `not started`
- **Description:** Add optional `issueWorkflowPhase` to `PromptBuildConfig`. When set, append phase-appropriate content: at minimum existing `buildPlannerArtifactLayer` when phase is `plan`; thin placeholder sections for `execute` / `validate` if full L4.5b/c do not exist yet. Do not duplicate entire planner layer on every poll — only in prompt build path used at launch / explicit rebuild.
- **Dependencies:** T01
- **Files to Change:** `packages/core/src/prompt-builder.ts`; wire from `session-manager` spawn only where `composedPrompt` is built (align with existing planner branch); `packages/core/src/__tests__/`
- **Acceptance Criteria:**
  - Typecheck + new/updated unit tests for `buildPrompt` with phase
  - No change to unrelated prompt layers

---

### T03 — Web: expose phase on session detail (and list if low-cost)

- **Priority:** High
- **Effort:** M
- **Status:** `not started`
- **Description:** Map `metadata.issueWorkflowPhase` (or chosen key) into dashboard types and show a compact badge or line on `SessionDetail` / `SessionCard` when present. Tailwind-only; existing patterns.
- **Dependencies:** T01
- **Files to Change:** `packages/web/src/lib/types.ts` or session mapping; `SessionDetail.tsx` / `SessionCard.tsx`; tests in `packages/web/src/__tests__/`
- **Acceptance Criteria:**
  - Phase visible when metadata set
  - `pnpm --filter @composio/ao-web test` for touched components passes (or add tests)

---

### T04 — CLI: `ao status` (or session list) shows phase

- **Priority:** Medium
- **Effort:** S
- **Status:** `not started`
- **Description:** When printing session rows, include phase column or suffix if metadata present. Prefer smallest change (e.g. `packages/cli` status command).
- **Dependencies:** T01
- **Files to Change:** CLI status formatting + snapshot/tests if any
- **Acceptance Criteria:**
  - Phase appears in `ao status` output for sessions with metadata
  - No breaking change to default output width (truncate or optional column)

---

### T05 — Orchestrator prompt: document phase + next steps

- **Priority:** Medium
- **Effort:** S
- **Status:** `not started`
- **Description:** Extend `generateOrchestratorPrompt` with a short subsection: reading `issueWorkflowPhase` from session metadata, Trust Vector gates, pointer to 0004 specs. No new APIs.
- **Dependencies:** T01
- **Files to Change:** `packages/core/src/orchestrator-prompt.ts`; `orchestrator-prompt.test.ts`
- **Acceptance Criteria:**
  - Prompt mentions phase metadata keys and trust gates concept
  - Tests assert key strings present

---

### T06 _(optional)_ — Config flag: spawn guard by phase / gate

- **Priority:** Low
- **Effort:** L
- **Status:** `not started`
- **Description:** If project config enables `requireIssueLifecycleGates` (name TBD), reject or warn on `spawn` when phase gate not satisfied. **Optional slice** — may defer to 0006.
- **Dependencies:** T01, T02
- **Files to Change:** `packages/core/src/config.ts` (Zod); `session-manager.ts`; docs
- **Acceptance Criteria:** Documented + tested opt-in behavior; default off

---

## Future Work (Non-Blocking)

- Issue-index file for phase (see persistence sketch) when session metadata is insufficient.
- Gate satisfaction writers (lifecycle reactions).
- Tracker label sync.

---

## Integrity checks (initial)

- **Scope:** Execution only; no duplicate of 0004 spec work.
- **API:** All symbols must exist in core before use — extend Delta in-task if needed.

---

_Tasks version: 1.0_
