---
feature_number: 0007
plan: "./0007_PLAN.md"
plan_status: approved
tasks_status: complete
created_at: "2026-04-02T12:00:00Z"
---

# Tasks: Plan approval CLI and web (0007)

Derived from [`0007_PLAN.md`](./0007_PLAN.md). **MVP:** approve plan frontmatter (`status: approved`), CLI `ao plan … send` delegating to `SessionManager.send`, web **Approve** button + `POST` handler. Path containment matches `GET /api/sessions/[id]/plan`.

**Guard:** If `requires_approval: true` and plan status ≠ `approved`, abort with: `Plan 0007 not approved (status: <status>).`

---

## Relationship to 0005 / 0006

| Prior plan                                 | This plan adds                                                    |
| ------------------------------------------ | ----------------------------------------------------------------- |
| 0005 planner panel (read-only plan)        | **Write** approval + **send** under `ao plan`; web approve parity |
| 0006 `human_plan_approval` via frontmatter | **Operator-driven** `status: approved` without hand-editing file  |

---

## API Contract Table (verify signatures before each task)

| File                                                      | Export                                                  | Kind                                                          | Signature / notes                                         |
| --------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| `packages/core/src/index.ts`                              | `loadConfig`                                            | function                                                      | loads config                                              |
| `packages/core/src/index.ts`                              | `createSessionManager`                                  | function                                                      | → `SessionManager`                                        |
| `packages/core/src/index.ts`                              | `probePlanArtifact`                                     | function                                                      | `(workspacePath, relPath?) => PlanFrontmatterProbeResult` |
| `packages/core/src/types.ts`                              | `SessionManager`                                        | interface                                                     | `get`, `send`, …                                          |
| `packages/core/src/types.ts`                              | `Session`                                               | interface                                                     | `workspacePath`, `metadata`                               |
| `packages/cli/src/commands/send.ts`                       | `registerSend`                                          | function                                                      | `(program: Command) => void`                              |
| `packages/cli/src/index.ts`                               | CLI registration                                        | —                                                             | `register*` on `Command`                                  |
| `packages/web/src/app/api/sessions/[id]/plan/route.ts`    | `GET`                                                   | handler                                                       | reads plan; `resolvePlanArtifactPath`                     |
| `packages/web/src/app/api/sessions/[id]/message/route.ts` | `POST`                                                  | handler                                                       | validation + `sessionManager.send`                        |
| `packages/web/src/lib/plan-artifact.ts`                   | `resolvePlanArtifactPath`                               | function                                                      | workspace containment                                     |
| `packages/web/src/lib/services.ts`                        | `getServices`                                           | function                                                      | config + `sessionManager` (pattern used by API routes)    |
| `packages/core/src/evaluate-trust-gates.ts`               | `listMissingExecutorTrustGates`                         | function                                                      | gate evaluation (reference for `status: approved`)        |
| **PROPOSED (Delta §1) → T01**                             | `packages/core/src/plan-artifact-approve.ts` (name TBD) | `approvePlanArtifactInWorkspace`, `ApprovePlanArtifactResult` | per plan Delta §1                                         |
| **PROPOSED (Delta §2) → T02**                             | core + web                                              | `resolvePlanArtifactPath` relocated                           | optional shared containment                               |
| **PROPOSED (Delta §3) → T04**                             | `POST …/plan/approve`                                   | route handler                                                 | new file under `app/api/sessions/[id]/plan/approve/`      |

---

## Tasks

### T01 — Core: `approvePlanArtifactInWorkspace` (Delta §1)

- **Priority:** High
- **Effort:** M
- **Status:** `complete`
- **Description:** Implement `approvePlanArtifactInWorkspace(workspacePath, relPathFromMetadata?, opts?)` returning `{ path }`. Enforce path containment equivalent to web `resolvePlanArtifactPath` (duplicate minimal logic in core **or** complete T02 first). Read markdown, parse first `---`…`---` frontmatter, merge `status: approved` plus optional `approved_at` (ISO8601) and `approved_by` from opts, preserve body and other keys, atomic write. Export from `packages/core/src/index.ts`.
- **Dependencies:** none
- **Files to Change:** `packages/core/src/plan-artifact-approve.ts` (or name aligned with repo); `packages/core/src/index.ts`; `packages/core/src/__tests__/plan-artifact-approve.test.ts` (new)
- **Acceptance Criteria:**
  - Unit tests: preserve body; update status; reject path traversal / escape from workspace
  - `pnpm --filter @composio/ao-core typecheck` passes
  - Signature matches Delta §1 in plan

**API entries used:** new Delta §1 only; `probePlanArtifact` behavior as reference for frontmatter shape.

- **Proof of work:** Added `packages/core/src/plan-artifact-approve.ts` (`approvePlanArtifactInWorkspace`, internal `resolvePlanArtifactPath` matching web containment, `parsePlanMarkdown`/`parseSimpleYamlBlock` parity, frontmatter merge + `atomicWriteFileSync`); exported `ApprovePlanArtifactResult` and `approvePlanArtifactInWorkspace` from `packages/core/src/index.ts`.
- **Acceptance Criteria Check-off:**
  - ✓ Unit tests cover body preservation, status/`approved_at`/`approved_by`, traversal (`..` in rel and segments), missing file
  - ✓ `pnpm --filter @composio/ao-core typecheck` passes
  - ✓ Signature matches Delta §1 (`workspacePath`, optional `relPathFromMetadata`, optional `opts?: { approvedBy?: string }` → `{ path }`)
- **Test Artifacts:** `packages/core/src/__tests__/plan-artifact-approve.test.ts` — all tests in `describe("approvePlanArtifactInWorkspace")`.

---

### T02 — Optional: move `resolvePlanArtifactPath` to core (Delta §2)

- **Priority:** Low
- **Effort:** M
- **Status:** `complete`
- **Description:** Move `resolvePlanArtifactPath` from `packages/web/src/lib/plan-artifact.ts` into core (or shared module), re-export for web and use from T01 approve helper so containment is single-sourced. Rewire `GET /api/sessions/[id]/plan` and web tests.
- **Dependencies:** T01 (or implement T01 with duplicate containment and defer T02)
- **Files to Change:** core new/updated module; `packages/web/src/lib/plan-artifact.ts`; `packages/web/src/app/api/sessions/[id]/plan/route.ts`; tests as needed
- **Acceptance Criteria:**
  - Existing web plan GET behavior unchanged (tests green)
  - `pnpm --filter @composio/ao-web test` for touched paths

**API entries used:** Delta §2; existing `resolvePlanArtifactPath` contract preserved.

- **Proof of work:** `packages/core/src/plan-artifact-path.ts` — canonical `resolvePlanArtifactPath`; exported from `packages/core/src/index.ts`; `plan-artifact-approve.ts` imports from `./plan-artifact-path.js` (removed duplicate); `packages/web/src/lib/plan-artifact.ts` re-exports from `@composio/ao-core` (GET `/plan` unchanged import path).
- **Acceptance Criteria Check-off:**
  - ✓ `plan-artifact.test.ts` + `plan-artifact-approve.test.ts` pass; web typecheck passes
  - ✓ Single containment implementation in core
- **Test Artifacts:** existing `plan-artifact.test.ts`, `plan-artifact-approve.test.ts` (no import path change for route tests).

---

### T03 — CLI: `ao plan approve` + `ao plan send`

- **Priority:** High
- **Effort:** M
- **Status:** `complete`
- **Description:** Add `packages/cli/src/commands/plan.ts` with `registerPlan(program)`: subcommand `approve <session>` (loadConfig, getSessionManager, get session, require workspacePath, call `approvePlanArtifactInWorkspace` with `planArtifactRelPath` from metadata); subcommand `send <session> [message...]` delegating to `sessionManager.send` when session exists (mirror `registerSend` options where practical: `-f`/`--file`). Register in `packages/cli/src/index.ts`.
- **Dependencies:** T01
- **Files to Change:** `packages/cli/src/commands/plan.ts` (new); `packages/cli/src/index.ts`; `packages/cli/__tests__/commands/plan.test.ts` (new)
- **Acceptance Criteria:**
  - `ao plan <id> approve` updates plan file when session valid (integration or temp-fixture test)
  - `ao plan <id> send` delivers message via session manager path
  - `pnpm --filter @composio/ao-cli test` passes

**API entries used:** `loadConfig`, `createSessionManager` → `get`, `send`; T01 `approvePlanArtifactInWorkspace`.

- **Proof of work:** `packages/cli/src/commands/plan.ts` — `registerPlan` with `plan approve` (`--approved-by`), `plan send` (`-f`/`--file`); `packages/cli/src/index.ts` — `registerPlan(program)`. Tests mock session manager + `approvePlanArtifactInWorkspace` to assert wiring.
- **Acceptance Criteria Check-off:**
  - ✓ Approve path: tests assert `approvePlanArtifactInWorkspace` called with workspace, `planArtifactRelPath`, optional `approvedBy`; missing session/workspace exit 1 (file update covered in core T01)
  - ✓ Send path: tests assert `sessionManager.send` with inline and `-f` file body
  - ✓ `pnpm --filter @composio/ao-cli test` passes
- **Test Artifacts:** `packages/cli/__tests__/commands/plan.test.ts` — `describe("plan command")` (approve + send, including `-f`).

---

### T04 — Web API: `POST /api/sessions/[id]/plan/approve`

- **Priority:** High
- **Effort:** S
- **Status:** `complete`
- **Description:** Add route handler (Delta §3) under `packages/web/src/app/api/sessions/[id]/plan/approve/route.ts`. Validate `id` like `message` route; `getServices()`; `sessionManager.get(id)`; require `metadata.workerRole === "planner"` (match `SessionDetail` planner panel gate); require `workspacePath`; call `approvePlanArtifactInWorkspace`. Return JSON `{ ok: true }` or structured error with observability pattern used by sibling routes.
- **Dependencies:** T01
- **Files to Change:** `packages/web/src/app/api/sessions/[id]/plan/approve/route.ts` (new); optional `packages/web/src/lib/observability` usage consistent with GET plan
- **Acceptance Criteria:**
  - 403/400 when not planner or missing workspace
  - 200 when approve succeeds
  - Test file under `packages/web/src/app/api/...` or existing API test pattern

**API entries used:** `getServices` / session manager pattern from `message/route.ts` and `plan/route.ts`; T01 helper.

- **Proof of work:** `packages/web/src/app/api/sessions/[id]/plan/approve/route.ts` — `POST` validates id, loads session, `403` if `workerRole !== planner`, `400` if no `workspacePath`, calls `approvePlanArtifactInWorkspace` with `planArtifactRelPath`; `recordApiObservation` + `jsonWithCorrelation`; approve errors mapped to 400/404/500.
- **Acceptance Criteria Check-off:**
  - ✓ 400 invalid id; 404 unknown session; 403 non-planner; 400 no workspace; 200 `{ ok: true }` with temp plan file + planner session
  - ✓ Observability aligned with GET plan / message routes
  - ✓ `pnpm --filter @composio/ao-web test` passes
- **Test Artifacts:** `packages/web/src/__tests__/api-routes.test.ts` — `describe("POST /api/sessions/[id]/plan/approve")`.

---

### T05 — Web UI: Approve button on `PlannerPlanPanel`

- **Priority:** High
- **Effort:** S
- **Status:** `complete`
- **Description:** In `SessionDetail.tsx` `PlannerPlanPanel`, when `showRequiresApproval` is true and `statusLabel` is not `approved` (case-insensitive), show primary **Approve plan** button; on success `POST` approve route then refetch GET plan or update state. Tailwind-only; `data-testid` for tests.
- **Dependencies:** T04
- **Files to Change:** `packages/web/src/components/SessionDetail.tsx`; `packages/web/src/components/__tests__/SessionDetail.planner.test.tsx` or new test file
- **Acceptance Criteria:**
  - Button visible only when approval required and not yet approved
  - After approve, badges/body reflect new state (or refetch)
  - `pnpm --filter @composio/ao-web test` passes

**API entries used:** existing GET plan + new POST approve (T04).

- **Proof of work:** `PlannerPlanPanel` — `refreshKey` refetch loop, `handleApprovePlan` POST `/plan/approve` then increment refresh; `showApproveButton` = `requires_approval` and status not `approved` (case-insensitive); accent primary button, `planner-plan-approve-button` / `planner-plan-approve-error`; optional inline approve error.
- **Acceptance Criteria Check-off:**
  - ✓ Button only when `requires_approval` and status ≠ approved (incl. case); hidden when already approved with `requires_approval` true
  - ✓ Success path refetches GET plan (test mocks POST + second GET; badge/body update)
  - ✓ `pnpm --filter @composio/ao-web test` passes
- **Test Artifacts:** `SessionDetail.planner.test.tsx` — extended planner tests + approve flow.

---

### T06 — Docs pointer (minimal)

- **Priority:** Low
- **Effort:** S
- **Status:** `complete`
- **Description:** Add a short bullet to `AGENTS.md` (or CLI help text only) documenting `ao plan approve` and `ao plan send`. No large doc rewrite.
- **Dependencies:** T03
- **Files to Change:** `AGENTS.md` and/or `packages/cli/src/commands/plan.ts` descriptions
- **Acceptance Criteria:**
  - One discoverable mention of new commands

**API entries used:** none (documentation / strings only).

- **Proof of work:** `AGENTS.md` — new **CLI: planner plan workflow** subsection with two bullets for `ao plan approve` and `ao plan send`; existing `plan.ts` descriptions already summarize the subcommands.
- **Acceptance Criteria Check-off:**
  - ✓ Discoverable mention of both commands in AGENTS.md
- **Test Artifacts:** none (documentation-only).

---

## Future Work (Non-Blocking)

- `ao plan <id> status <draft|pending_approval|rejected>` and other frontmatter transitions
- Dual-write `trustGateHumanPlanApproval=satisfied` in session metadata for visibility
- Tracker/GitHub mirroring of approval

---

## API Reference Audit

| Task | API Contract entries used                                      | Notes                                                             |
| ---- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| T01  | Delta §1 (new)                                                 | `probePlanArtifact` / frontmatter behavior as spec reference only |
| T02  | Delta §2 + `resolvePlanArtifactPath`                           | Optional refactor                                                 |
| T03  | `loadConfig`, `SessionManager.get`, `SessionManager.send`, T01 | —                                                                 |
| T04  | Session GET pattern, T01, planner metadata convention          | Delta §3 route                                                    |
| T05  | GET plan + T04 POST                                            | UI only                                                           |
| T06  | —                                                              | Docs                                                              |

**ERROR: Nonexistent API** — None: T01–T04 use Delta proposals or verified table rows.

---

## Scope Audit

- **IN-SCOPE:** T01–T06 cover approve helper, CLI, web route, web button, minimal docs. Optional T02 is explicitly scoped as Delta §2 from the plan.
- **OUT-OF-SCOPE:** Policy engine, tracker sync, arbitrary status commands, metadata dual-write — listed only under **Future Work**.
