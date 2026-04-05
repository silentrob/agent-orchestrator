# Recovery Context and Learnings

## Brief Unified Spec

**Status:** Proposal  
**Date:** 2026-04-01  
**Supersedes (conceptually):** `GNAP_PRD.md` + `design-session-persistence.md` (partial merge)

---

## 1) Problem

AO currently has two related context gaps:

1. **Respawn continuity gap**  
   A worker that dies and respawns for the same issue often starts from scratch instead of resuming prior conversation/work.

2. **Coordination recovery gap**  
   After orchestrator restart, task-level context (goal/dependencies/coordination state) is incomplete, increasing duplicate messages and poor routing.

We also lack a durable **cross-run improvement memory** that accumulates practical lessons for future sessions.

---

## 2) Goals

- Recover worker/orchestrator continuity automatically when possible.
- Recover coordination context after restart without introducing noisy or redundant stores.
- Keep prompt context LLM-friendly (compact markdown summaries, not raw JSON payloads).
- Add a lightweight in-repo `LEARNINGS.md` loop for future-agent coordination and self-improvement (path configurable via `project.learningsFilePath`, default `docs/LEARNINGS.md`).
- Support optional portability export/import for recovery + learnings context.

Non-goals:

- Full artifact platform in this phase.
- Heavy planning system in this phase.

---

## 3) Unified Architecture

### A. Continuity Engine (from session persistence design)

At spawn/respawn for same issue:

1. Try native agent resume (`getRestoreCommand()`).
2. If unavailable/fails, inject compact previous-session context.
3. Else start fresh.

Policy is configurable per project (default: resume-first).

### B. Coordination Snapshot (from GNAP intent, adapted)

Maintain minimal coordination fields alongside existing AO session metadata model:

- `goal`
- `status`
- `blockedBy`
- `blocks`
- `coordinationSent`
- `progressSummary`
- `updatedAt`
- `resumedFrom` (lineage)

This is runtime operational state, not source code.

### C. Learnings Loop (new)

Add in-repo `docs/LEARNINGS.md` (or configurable equivalent):

- Loaded at spawn if present.
- Updated at completion via reflection proposal + merge/dedupe rules.
- Entries include evidence and confidence.

### D. How the pieces chain together (control flow)

**Worker respawn (`spawn()`), same `issueId` + same agent plugin:**

1. If `project.workerRespawnStrategy === "fresh"` → skip recovery; `getLaunchCommand()` only.
2. Else call `findArchivedSessionForIssue(sessionsDir, issueId, agentName)`:
   - Scan `sessions/archive/` for metadata whose `issue` matches and whose `agent` matches (do **not** resume a Claude thread with a Codex restore command).
   - If multiple matches, pick the **latest** by archive filename timestamp suffix (same rule as `readArchivedMetadataRaw` “most recent wins”).
3. If a candidate archive exists and `strategy === "resume"`:
   - Rebuild a minimal `Session` via `metadataToSession(archivedSessionId, raw, projectId)`.
   - Set `workspacePath` to the **current** spawn worktree (archived path may differ).
   - `restoreCmd = await getRestoreCommand(session, project)`. If non-null → use it; record `resumedFrom` on the new session metadata.
4. If no native restore command (null, unsupported agent, or thrown error):
   - If `strategy === "context-inject"` **or** resume failed and strategy is not `"fresh"` → `buildPreviousSessionContext(archived.raw, workspacePath, plugins)`; prepend markdown to `composedPrompt`, then `truncateContext()`; `getLaunchCommand()`.
5. If no archived session or context builder returns null → fresh launch.

**Orchestrator respawn (`spawnOrchestrator()`):** When `orchestratorSessionStrategy === "reuse"` and the prior orchestrator metadata was archived in-process, attempt the same `getRestoreCommand()` path against **that** archived row before falling back to `getLaunchCommand()`. No extra project-level flag beyond existing reuse semantics.

---

## 4) Storage Strategy (resolved)

### Canonical runtime store

Use AO project data directory as canonical for operational recovery state:

- aligned with existing metadata/archive behavior
- avoids repository churn from high-frequency updates

### In-repo learning store

Use repository file for durable, human-curated team memory:

- `docs/LEARNINGS.md` (default path)
- versionable and reviewable in git

### Portability

Add optional export/import command(s):

- export runtime recovery snapshot + learnings bundle
- import into another environment/repo clone when needed

This gives portability without making runtime writes repo-native by default.

**Coordination snapshot path (concrete):** Store task-level coordination JSON under the AO **data directory** (same tree as `sessions/`, `worktrees/`), not in the git repo — e.g. `coordination/tasks/<sessionId>.json`. One file per active or recently active worker session key; tombstone or archive on completion if you need audit without keeping hot paths huge. Alternatively a single `coordination/project-index.json` with a `tasks: Record<sessionId, CoordinationTask>` object; prefer **per-session files** if many concurrent tasks reduce rewrite contention.

---

## 5) Prompt Context Format Rules

Do not inject raw JSON into prompts.

Inject compact markdown sections:

- `## Previous Session Context`
  - last status, key actions, changed files/commits, open PR, retry guidance
- `## Current Coordination Context`
  - active tasks grouped by status with dependencies
- `## Team Learnings`
  - top N high-confidence relevant entries

Hard limits:

- max chars/tokens per section
- deterministic truncation strategy
- prefer bullets over nested structures

---

## 6) Learnings.md Schema (human-readable)

Each learning entry should include:

- `Context`
- `Learning`
- `Rule`
- `Evidence` (PR/session/file)
- `Confidence` (`low|medium|high`)
- `Last-Validated`

Example:

```md
## L-2026-04-01-01

- Context: INT-42 edge auth runtime
- Learning: jsonwebtoken had edge runtime incompatibility.
- Rule: Prefer jose for edge-compatible JWT flows.
- Evidence: PR #123, session app-7
- Confidence: high
- Last-Validated: 2026-04-01
```

Update behavior:

- dedupe by normalized Rule + Context
- prefer updating/strengthening evidence over duplicate append
- reject low-signal/no-evidence entries

---

## 6.1) Previous-session context builder (fallback “how”)

When native resume is unavailable, reuse the **`PreviousSessionContext`** shape and source priority from session persistence design:

| Source (order)            | Field used                                   | Notes                                      |
| ------------------------- | -------------------------------------------- | ------------------------------------------ |
| Archived metadata         | `summary`, `status`, `pr`, `branch`          | `summary` is best-effort agent extraction  |
| Git                       | commits on branch not on default; diff names | Skip if worktree missing or branch absent  |
| Tracker plugin (optional) | PR title/body/comments                       | Only if `pr` present and plugin configured |

Render **only** markdown sections (see §5); never pass the raw `Record<string, string>` metadata blob into the prompt.

**Truncation:** Cap injected previous-session markdown (e.g. `MAX_CONTEXT_INJECTION_CHARS ≈ 4000`). Preserve title, agent summary, and closing “continue from here” instructions; trim commit/file lists from the bottom with a `... (truncated)` marker.

**Module boundary:** Implement as `buildPreviousSessionContext()` (+ `truncateContext`) in a dedicated core module (e.g. `session-context-builder.ts`) so `spawn()` stays orchestration-only.

---

## 6.2) Coordination snapshot — schema and writers

Align fields with GNAP intent but keep storage in the **data dir** (§4). Suggested TypeScript shape:

```typescript
type CoordinationTaskStatus =
  | "pending"
  | "in_progress"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

interface CoordinationTask {
  id: string; // sessionId
  sessionId: string;
  goal: string;
  prompt?: string;
  status: CoordinationTaskStatus;
  progressSummary?: string;
  blockedBy: string[];
  blocks: string[];
  coordinationSent: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string;
  resumedFrom?: string; // lineage: prior session id if respawn chain
  lineage?: string[];
  siblings?: string[];
}
```

**Who writes what (same spirit as GNAP PRD):**

| Event                                                | Writer                         | Updates                                                                                                 |
| ---------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `spawn()`                                            | session-manager                | `create` / upsert task: `goal`, `status: in_progress`, `prompt`, `lineage`/`siblings` from spawn config |
| `kill()` / cancel                                    | session-manager                | `status: cancelled`                                                                                     |
| Lifecycle poll (`checkSession` / status transitions) | lifecycle-manager              | `status` map from session status, `progressSummary` from `agentInfo.summary`                            |
| Coordination message successfully sent               | orchestrator / messaging layer | `coordinationSent: true`                                                                                |
| Respawn with resume                                  | session-manager                | `resumedFrom` on **new** session row; optional link from old archived metadata                          |

**Orchestrator prompt:** `loadAllTasks`-style aggregation over `coordination/tasks/*.json` → format as markdown `## Current Coordination Context` (group by status, list `blockedBy` / `blocks` as bullets). On empty dir, omit the section.

**Atomic writes:** Use temp file + rename per task file to avoid torn JSON on crash (same pattern as GNAP `atomicWriteFileSync`).

---

## 6.3) Learnings pipeline — load, propose, merge

**Load (read path):**

- Resolve path: `project.learningsFilePath ?? "docs/LEARNINGS.md"` relative to **repository root** (not data dir).
- If file missing or empty → no `## Team Learnings` section.
- Parse entries by heading `## L-...` or horizontal rule blocks; extract bullet keys (`Context`, `Learning`, `Rule`, …).
- Select **top N** by `Confidence` (high first), then recency (`Last-Validated`), then optional keyword match to current `issueId` / title (lightweight string score, not embeddings in MVP).
- Render as short bullets under `## Team Learnings` with a character budget (e.g. 2–3k chars).

**Propose (write path on session completion):**

- Trigger: terminal session status (`completed`, `failed`, `cancelled`) after lifecycle confirms; debounce once per session id.
- Input: final `agentInfo.summary`, session metadata (`pr`, `branch`, `issueId`), optional diff stat / test outcome flags from lifecycle.
- Produce a **structured proposal** (internal JSON or scratch buffer), not direct file write: e.g. `{ context, learning, rule, evidence[], confidence }`.
- Evidence must cite at least one of: PR URL/number, session id, commit sha, or artifact id. No evidence → discard proposal.

**Merge:**

1. Normalize `Rule` + `Context` (lowercase, collapse whitespace) for dedupe key.
2. If key exists → append evidence to existing entry, bump `Confidence` if new evidence is stronger, refresh `Last-Validated`.
3. If new → append new `## L-<date>-<seq>` section.
4. Optional: cap file size (drop lowest-confidence oldest entries).

**Human gate (recommended for v1):** CLI `ao learnings apply --from-session <id>` or merge bot PR; automatic silent append is higher risk for repo noise.

---

## 6.4) Export / import bundle

**Export** (e.g. `ao recovery export --output bundle.zip`):

- Include: sanitized `coordination/tasks/*.json` (strip internal paths if needed), copy of `docs/LEARNINGS.md`, and a **manifest** `recovery-manifest.json` with `{ exportedAt, projectId, issueIds[], sessionIds[] }`.
- Optionally include a redacted dump of archived session metadata **keys** useful for debugging (no secrets): `issue`, `agent`, `status`, `resumedFrom`, timestamps — not full prompts.

**Import** (e.g. `ao recovery import bundle.zip`):

- Validate schema version; merge coordination files into target data dir with rename on `sessionId` collision (or `--force`).
- Never overwrite `LEARNINGS.md` blindly; run same merge rules as §6.3 or write to `LEARNINGS.imported.md` for manual review.

---

## 6.5) Prompt assembly order and budgets

When multiple sections apply, **prepend** in this order so the model sees recovery before the main task:

1. `## Previous Session Context` (if any)
2. `## Current Coordination Context` (if any)
3. Issue / tracker body (existing)
4. `## Team Learnings` (if any)
5. Rest of composed prompt (rules, decomposition, role layers, …)

**Per-section budgets (suggested defaults, configurable):**

| Section          | Max chars (order of magnitude) |
| ---------------- | ------------------------------ |
| Previous session | ~4k                            |
| Coordination     | ~3k                            |
| Team learnings   | ~2–3k                          |

If the total injected recovery block would exceed a global cap, drop learnings first, then trim coordination to in-progress + blocked only, then truncate previous session per §6.1.

---

## 6.6) Implementation touchpoints (code map)

| Area                            | Likely modules                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Resume + archive lookup         | `session-manager.ts`, new helper `findArchivedSessionForIssue`                  |
| Context fallback                | `session-context-builder.ts` (`buildPreviousSessionContext`, `truncateContext`) |
| Metadata                        | `metadata.ts` / types: `resumedFrom`, `workerRespawnStrategy`                   |
| Coordination CRUD               | new `coordination/store.ts` (or extend metadata service) + lifecycle hooks      |
| Orchestrator recovery text      | `generateOrchestratorPrompt()` (or equivalent)                                  |
| Learnings load in worker prompt | `prompt-builder.ts` after base layers                                           |
| Learnings merge                 | new `learnings/merge.ts` + CLI subcommand                                       |
| Export/import                   | CLI package, zip manifest                                                       |

Detailed test matrix (resume vs inject vs fresh, cross-agent skip, multi-archive ordering) remains as in `design-session-persistence.md` §6.

---

## 7) Phased Delivery

### Phase 1 (small, high impact)

- Auto-resume in `spawn()` for same-issue sessions.
- Resume attempt in `spawnOrchestrator()` where applicable.
- Prompt fallback context injection (compact summary format).

### Phase 2

- Coordination snapshot fields + restart reconstruction summary.
- Prompt section for recovered coordination context.

### Phase 3

- `docs/LEARNINGS.md` load in prompt builder.
- Reflection capture on terminal session completion.
- Merge/dedupe rules.

### Phase 4

- Export/import portability for recovery + learnings bundle.

---

## 8) Success Criteria

- Respawned sessions become productive faster (less restart-from-zero behavior).
- Lower duplicate coordination messages after orchestrator restart.
- Prompt size remains bounded while context quality improves.
- Learnings file remains useful (high signal, deduped, evidenced).

---

## 9) Rationale Summary

This design combines the strongest elements of both prior proposals:

- **Session persistence strengths:** native resume and practical fallback chain.
- **GNAP strengths:** explicit coordination context and restart recoverability.
- **New addition:** durable team-level learning loop in-repo for continuous improvement.

It also resolves storage disagreement by separating:

- operational runtime memory (AO data dir), and
- durable collaborative learning memory (in-repo file).
