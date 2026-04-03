---
feature_number: 0002
plan: "./0002_PLAN.md"
plan_status: approved
tasks_status: approved
created_at: "2026-04-02T12:00:00Z"
---

# Tasks: Planner agent POC (0002)

Derived from `0002_PLAN.md` (approved). No scope beyond IN-SCOPE.

## API Contract Table (verified)

| File                                       | Exported name                | Kind      | Signature / shape                                                          |
| ------------------------------------------ | ---------------------------- | --------- | -------------------------------------------------------------------------- |
| `packages/core/src/session-manager.ts`     | `createSessionManager`       | function  | `createSessionManager(deps: SessionManagerDeps) -> OpenCodeSessionManager` |
| `packages/core/src/types.ts`               | `SessionManager`             | interface | `spawn`, `spawnOrchestrator`, `restore`, `get`, …                          |
| `packages/core/src/types.ts`               | `SessionSpawnConfig`         | interface | `projectId`, optional `issueId`, `prompt`, `agent`, …                      |
| `packages/core/src/types.ts`               | `Session`                    | interface | `workspacePath`, `metadata`, `issueId`, …                                  |
| `packages/core/src/prompt-builder.ts`      | `buildPrompt`                | function  | `buildPrompt(config: PromptBuildConfig) -> string`                         |
| `packages/core/src/orchestrator-prompt.ts` | `generateOrchestratorPrompt` | function  | `generateOrchestratorPrompt(opts: OrchestratorPromptConfig) -> string`     |
| `packages/core/src/metadata.ts`            | `updateMetadata`             | function  | `updateMetadata(dataDir, sessionId, updates) -> void`                      |
| `packages/web/src/lib/services.ts`         | `getServices`                | function  | returns `sessionManager`, …                                                |
| `packages/web/src/app/api/spawn/route.ts`  | `POST`                       | handler   | spawns via `sessionManager.spawn`                                          |

**PROPOSED (Delta — implement in tasks below):** `workerRole` on `SessionSpawnConfig`; `buildPlannerArtifactLayer`; `resolvePlanArtifactPath`; `parsePlanMarkdown`.

---

## Tasks

### T01 — `SessionSpawnConfig.workerRole`

- **Priority:** High
- **Effort:** S
- **Status:** complete
- **Description:** Add optional `workerRole?: "planner" | "executor" | "validator" | "reproducer"` to `SessionSpawnConfig` per plan Delta. No runtime behavior change until T03.
- **Dependencies:** none
- **Files to Change:** `packages/core/src/types.ts`; any type tests referencing `SessionSpawnConfig`
- **Acceptance Criteria:**
  - TypeScript compiles; union matches plan Delta exactly.
  - `SessionSpawnConfig` remains backward compatible (field optional).

- **Proof of Work:** Added exported `WorkerRole` type and optional `workerRole` on `SessionSpawnConfig` in `packages/core/src/types.ts`. Extended `packages/core/src/__tests__/types.test.ts`.
- **Acceptance Criteria Check-off:**
  - ✓ `pnpm --filter @composio/ao-core typecheck` passes.
  - ✓ Union is `planner` | `executor` | `validator` | `reproducer` via `WorkerRole`.
  - ✓ Field optional; configs without `workerRole` still valid.
- **Test Artifacts:** `packages/core/src/__tests__/types.test.ts` — `SessionSpawnConfig.workerRole` describe, two tests (`backward compatible`, `each WorkerRole literal`).

### T02 — `buildPlannerArtifactLayer` + export

- **Priority:** High
- **Effort:** M
- **Status:** complete
- **Description:** New module with `PlannerArtifactLayerContext` and `buildPlannerArtifactLayer(ctx)` per plan Delta. Content must cover `.ao/plan.md`, YAML frontmatter fields/defaults (`requires_approval` default false), read-update on respawn, no implementation PR as planner. Export from `@composio/ao-core`.
- **Dependencies:** none
- **Files to Change:** `packages/core/src/prompt/artifact-layers-by-role.ts` (new); `packages/core/src/index.ts`; `packages/core/src/__tests__/` or colocated `*.test.ts`
- **Acceptance Criteria:**
  - Exported signatures match plan Delta exactly.
  - Unit test asserts non-empty string and mentions plan path + frontmatter + respawn guidance.

- **Proof of Work:** Added `packages/core/src/prompt/artifact-layers-by-role.ts` (`PlannerArtifactLayerContext`, `buildPlannerArtifactLayer`). Exported from `packages/core/src/index.ts`. Tests in `packages/core/src/__tests__/artifact-layers-by-role.test.ts`.
- **Acceptance Criteria Check-off:**
  - ✓ `PlannerArtifactLayerContext` / `buildPlannerArtifactLayer(ctx): string` match plan Delta.
  - ✓ Tests cover `.ao/plan.md`, frontmatter/YAML/`requires_approval`, respawn/read-existing guidance.
- **Test Artifacts:** `artifact-layers-by-role.test.ts` — five tests (main guidance, issue+project, no issueId, issueContext, no implementation PR).

### T03 — Spawn: metadata + planner prompt composition

- **Priority:** High
- **Effort:** L
- **Status:** complete
- **Description:** In `createSessionManager` → `spawn`, after metadata write: `updateMetadata` with `workerRole` when set; for `workerRole === "planner"` set `planArtifactRelPath` default `.ao/plan.md` and `planArtifactIssue` when `issueId` present. Concatenate `buildPlannerArtifactLayer({ projectId, issueId, issueContext })` ahead of or merged with `buildPrompt` result when planner. Optional minimal fs probe: if `.ao/plan.md` exists under `workspacePath`, append short “Existing plan on disk” block to composed prompt (plan §A4).
- **Dependencies:** T01, T02
- **Files to Change:** `packages/core/src/session-manager.ts`; integration/unit tests as feasible
- **Acceptance Criteria:**
  - Spawning with `workerRole: "planner"` persists metadata keys on disk via `updateMetadata`.
  - Composed prompt includes planner layer; existing file probe behavior matches chosen minimal strategy (probe or document agent-only — implement one per plan).
  - Uses `buildPrompt`, `updateMetadata` from API table.

- **Proof of Work:** `session-manager.ts` — import `buildPlannerArtifactLayer`; after `buildPrompt`, append planner layer + optional “Existing plan on disk” when `.ao/plan.md` exists; merge `workerRole` / `planArtifactRelPath` / `planArtifactIssue` into `session.metadata` before `updateMetadata`. Tests: `spawn.test.ts` describe `planner workerRole (0002)`.
- **Acceptance Criteria Check-off:**
  - ✓ Planner spawn persists `workerRole`, `planArtifactRelPath`, `planArtifactIssue` on disk and on returned `session.metadata`.
  - ✓ Launch prompt includes planner layer; `existsSync` probe appends existing-plan section when file present.
  - ✓ Uses `buildPrompt`, `updateMetadata`, `buildPlannerArtifactLayer` (delta).
- **Test Artifacts:** `spawn.test.ts` — `persists planner metadata and includes planner layer in launch prompt`, `appends Existing plan on disk when .ao/plan.md exists before spawn`, `persists workerRole without planner artifact keys or planner prompt for executor`.

### T04 — Restore path audit for planner metadata

- **Priority:** Medium
- **Effort:** S
- **Status:** complete
- **Description:** Audit `SessionManager.restore` / metadata hydration so `workerRole`, `planArtifactRelPath`, `planArtifactIssue` remain available on `Session.get` after restore. Fix only if gap found.
- **Dependencies:** T03
- **Files to Change:** `packages/core/src/session-manager.ts` (only if audit finds gap); tests
- **Acceptance Criteria:**
  - Documented audit outcome in PR or task comment.
  - If gap: restored planner session exposes same metadata keys for web plan API.

- **Proof of Work / audit outcome:**
  - **Active metadata restore:** `readMetadataRaw` → `metadataToSession` sets `session.metadata` to the full raw record; step 9 `updateMetadata` merges deltas only — **no gap**; planner keys remain on disk and on `get()`.
  - **Archive restore:** `writeMetadata` rewrote the active file using only typed `SessionMetadata` fields, **dropping** extension keys (e.g. `workerRole`, `planArtifactRelPath`, `planArtifactIssue`). **Fix:** after archive `writeMetadata`, merge back keys from archived `raw` not in `WRITE_METADATA_FILE_KEYS` via `extraMetadataKeysFromRaw` + `updateMetadata`.
- **Acceptance Criteria Check-off:**
  - ✓ Audit documented above.
  - ✓ Gap closed: post–archive-restore disk + `sessionManager.get` retain planner extension keys.
- **Test Artifacts:** `restore.test.ts` — `preserves extension metadata keys when restoring from archive (planner POC 0002)`.

### T05 — Orchestrator prompt: Planner workflow (POC)

- **Priority:** Medium
- **Effort:** S
- **Status:** not started
- **Description:** Extend `generateOrchestratorPrompt` with subsection documenting `ao spawn` flags for planner, `.ao/plan.md` location, frontmatter meaning, crash recovery / same-issue respawn.
- **Dependencies:** T06 (so documented CLI flags match implementation)
- **Files to Change:** `packages/core/src/orchestrator-prompt.ts`; `packages/core/src/__tests__/` if present for orchestrator prompt
- **Acceptance Criteria:**
  - New section present in generated string.
  - Uses only `generateOrchestratorPrompt` / `OrchestratorPromptConfig` (API table).

### T06 — CLI: `--prompt` and `--worker-role`

- **Priority:** High
- **Effort:** M
- **Status:** complete
- **Description:** Add Commander options to `ao spawn` forwarding `prompt` and `workerRole` to `sessionManager.spawn`.
- **Dependencies:** T01
- **Files to Change:** `packages/cli/src/commands/spawn.ts`; CLI tests if any
- **Acceptance Criteria:**
  - `ao spawn` accepts optional `--prompt` and `--worker-role <role>` with validation against planner union.
  - `sm.spawn` receives `prompt` / `workerRole` per options.

- **Proof of Work:** `spawn.ts` — `SpawnSessionOptions`, `parseWorkerRole` / `WORKER_ROLES`, `--prompt` and `--worker-role` options; `spawnSession` passes through to `sm.spawn`; decompose multi-spawn includes same fields. Tests in `packages/cli/__tests__/commands/spawn.test.ts`.
- **Acceptance Criteria Check-off:**
  - ✓ Flags accepted; roles validated against full `WorkerRole` union (planner, executor, validator, reproducer).
  - ✓ `getSessionManager` → `spawn` receives `prompt` / `workerRole` when provided.
- **Test Artifacts:** `spawn.test.ts` — `passes --prompt and --worker-role to sessionManager.spawn()`, `rejects invalid --worker-role`.

### T07 — Web POST `/api/spawn`: `prompt` + `workerRole`

- **Priority:** Medium
- **Effort:** S
- **Status:** not started
- **Description:** Extend JSON body validation to accept optional `prompt` and `workerRole`; pass through to `sessionManager.spawn`.
- **Dependencies:** T01
- **Files to Change:** `packages/web/src/app/api/spawn/route.ts`; `packages/web/src/__tests__/api-routes.test.ts` or equivalent
- **Acceptance Criteria:**
  - Valid body spawns with forwarded fields; invalid `workerRole` returns 400.
  - Uses `getServices`, `sessionManager.spawn` (API table).

### T08 — `resolvePlanArtifactPath` + `parsePlanMarkdown`

- **Priority:** High
- **Effort:** M
- **Status:** complete
- **Description:** Implement PROPOSED helpers: resolved absolute path must stay under `workspacePath` (prefix / realpath check); parse `---` YAML frontmatter + body; invalid YAML yields empty frontmatter or explicit error contract documented in API response.
- **Dependencies:** none
- **Files to Change:** `packages/web/src/lib/plan-artifact.ts` (new, suggested); tests under `packages/web/src/lib/__tests__/`
- **Acceptance Criteria:**
  - Unit tests: traversal `../` rejected; valid frontmatter split; no frontmatter → body = full file.
  - Signatures match plan Delta for `ParsedPlanArtifact` / `parsePlanMarkdown` / `resolvePlanArtifactPath`.

- **Proof of Work:** Added `packages/web/src/lib/plan-artifact.ts` (`ParsedPlanArtifact`, `parsePlanMarkdown`, `resolvePlanArtifactPath`) with simple YAML block parser and realpath-based containment checks. Tests in `packages/web/src/lib/__tests__/plan-artifact.test.ts`.
- **Acceptance Criteria Check-off:**
  - ✓ `../` and symlink escape rejected; default `.ao/plan.md` resolves under workspace (realpath-safe assertion).
  - ✓ Frontmatter/body split; no frontmatter → body = full file; unclosed fence → empty frontmatter + full raw body.
  - ✓ Signatures match plan Delta.
- **Test Artifacts:** `plan-artifact.test.ts` — seven tests (parse ×3, resolve ×4).

### T09 — `GET /api/sessions/[id]/plan`

- **Priority:** High
- **Effort:** M
- **Status:** complete
- **Description:** Read-only route: `get` session; 404 if missing or no `workspacePath`; resolve path via T08; read file with size cap (~256KB per plan); return JSON `{ path, body, frontmatter, issueId }`.
- **Dependencies:** T08
- **Files to Change:** `packages/web/src/app/api/sessions/[id]/plan/route.ts` (new); tests
- **Acceptance Criteria:**
  - 404 for missing session / missing file / path escape.
  - 200 JSON shape matches plan; uses `getServices`, `sessionManager.get`.

- **Proof of Work:** `packages/web/src/app/api/sessions/[id]/plan/route.ts` — `GET` loads session via `getServices` / `sessionManager.get`; 404 for missing session, no `workspacePath`, invalid resolved path, or missing file; capped UTF-8 read (256KB) + `parsePlanMarkdown`; observability `recordApiObservation` + `jsonWithCorrelation`. `resolvePlanArtifactPath` now resolves relative paths from `realpathSync(workspacePath)` so non-existent plan paths under symlinked temp dirs (e.g. macOS `/var` vs `/private/var`) still validate containment. Tests in `packages/web/src/__tests__/api-routes.test.ts`.
- **Acceptance Criteria Check-off:**
  - ✓ 404 missing session, no workspace, traversal `../` in metadata, missing file on disk.
  - ✓ 200 returns `{ path, body, frontmatter, issueId }`; uses `getServices` / `sessionManager.get`.
- **Test Artifacts:** `api-routes.test.ts` — `GET /api/sessions/[id]/plan` describe (5 tests).

### T10 — Session detail: planner plan panel

- **Priority:** High
- **Effort:** M
- **Status:** complete
- **Description:** When `session.metadata["workerRole"] === "planner"`, fetch plan API; show body (read-only) and badges for `status`, `requires_approval` if true. Tailwind only; no new UI libraries.
- **Dependencies:** T09
- **Files to Change:** `packages/web/src/components/SessionDetail.tsx`; `packages/web/src/components/__tests__/` as needed
- **Acceptance Criteria:**
  - Component test or manual test checklist: planner shows panel; non-planner unchanged.
  - No `style=` attributes per project rules.

- **Proof of Work:** `SessionDetail.tsx` — `PlannerPlanPanel` + `isRecord` helper; section gated on `metadata["workerRole"] === "planner"`; `GET /api/sessions/[id]/plan` on mount; loading / error / OK states; `<pre>` for body; badges for string `frontmatter.status` and `requires_approval === true` only. New panel uses Tailwind/CSS variables only (no `style=`). Tests: `SessionDetail.planner.test.tsx`.
- **Acceptance Criteria Check-off:**
  - ✓ Planner sessions render plan panel + fetch; non-planner sessions omit panel.
  - ✓ New UI uses no inline `style=` (existing `SessionTopStrip` unchanged).
- **Test Artifacts:** `SessionDetail.planner.test.tsx` — four tests (omit panel, success + badges, no requires_approval badge, API error).

---

## Future Work (Non-Blocking) — not tasks

From plan OUT-OF-SCOPE / Future Work: v5 manifest, policy enforcement on `approved`, cross-session listing by issue, SSE updates, spawn prompt length validation.

---

## Integrity Checks

### API Reference Audit

| Task | APIs / Deltas used                                                                             |
| ---- | ---------------------------------------------------------------------------------------------- |
| T01  | Delta only (extends `SessionSpawnConfig`)                                                      |
| T02  | Delta only (`buildPlannerArtifactLayer`)                                                       |
| T03  | `createSessionManager`/`spawn` (internal), `buildPrompt`, `updateMetadata`, Delta `workerRole` |
| T04  | `SessionManager.restore`, `SessionManager.get`                                                 |
| T05  | `generateOrchestratorPrompt`                                                                   |
| T06  | `sessionManager.spawn` (via CLI `getSessionManager`), Delta `SessionSpawnConfig`               |
| T07  | `getServices`, `sessionManager.spawn`, Delta `SessionSpawnConfig`                              |
| T08  | Delta only                                                                                     |
| T09  | `getServices`, `sessionManager.get`, T08 helpers                                               |
| T10  | Client fetch to T09 route; `session.metadata` from `DashboardSession`                          |

**ERROR: Nonexistent API:** none — all non-exported symbols are implemented in Delta tasks T01–T02, T08.

### Scope Audit

- All tasks map to IN-SCOPE spawn metadata, planner prompt, orchestrator docs, CLI/web spawn extensions, plan read API, Session detail UI, restore audit, safety helpers.
- OUT-OF-SCOPE items appear only under Future Work; no task implements policy gates, v5 artifacts, or tracker mirroring.
