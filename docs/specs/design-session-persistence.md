# Design Doc: Worker Session Persistence on Respawn

**Author:** adil (adil.shaikh\_\_)  
**Date:** 2026-03-28  
**Status:** Draft  
**Related Issues:** #183 (Codex getRestoreCommand — already implemented), #161 (resume workarounds), #138 (historical session visibility)

---

## 1. Problem Statement

When an AO worker session dies (crash, rate limit, OOM, manual kill) and is respawned for the same issue, the new worker starts from scratch with zero conversation history. The worker has to:

- Re-read the entire issue
- Re-analyze the codebase
- Re-discover what approach to take
- Potentially repeat the exact same mistake that caused the previous failure

This wastes tokens, time, and compute. For complex issues where a worker was 80% done, respawn means starting from 0%.

**The core problem:** The resume infrastructure exists in the agent plugins (`getRestoreCommand()` for Claude Code and Codex), but `spawn()` never uses it. Only the manual `ao session restore` path calls `getRestoreCommand()`. The automated respawn path always starts fresh.

---

## 2. Current Architecture

### 2.1 Session Lifecycle

```
ao start
  └─ spawnOrchestrator()          # Always uses getLaunchCommand() — fresh start
       └─ Orchestrator reads issue backlog
            └─ spawn(issueId)      # Always uses getLaunchCommand() — fresh start
                 └─ Worker starts from scratch

ao session restore <id>
  └─ restore()                     # Uses getRestoreCommand() — resumes conversation ✅
       └─ Worker picks up where it left off
```

The gap: `spawn()` and `spawnOrchestrator()` never call `getRestoreCommand()`, even when a previous session for the same issue exists on disk.

### 2.2 What Each Agent Supports Today

| Agent       | `getRestoreCommand()` | Resume Command                           | Session Storage                       |
| ----------- | --------------------- | ---------------------------------------- | ------------------------------------- |
| Claude Code | ✅ Implemented        | `claude --resume <uuid>`                 | `~/.claude/projects/{path}/*.jsonl`   |
| Codex       | ✅ Implemented        | `codex resume <threadId>`                | `~/.codex/sessions/*.jsonl`           |
| OpenCode    | ❌ Not implemented    | N/A (uses session ID reuse during spawn) | Internal DB                           |
| Aider       | ❌ Not implemented    | N/A                                      | `.aider.chat.history.md` in workspace |

### 2.3 Data That Persists on Disk After Kill

**Session Metadata** (`~/.agent-orchestrator/{hash}/sessions/`):

- Flat key-value files per session: worktree, branch, issue, PR, agent, status, timestamps, runtime handle, opencode session ID
- On `deleteMetadata(sessionsDir, id, archive=true)`: copied to `sessions/archive/{id}_{timestamp}` before deletion
- Readable via `readArchivedMetadataRaw(sessionsDir, id)`

**Git Worktrees:**

- Created at workspace path (e.g., `.git/worktrees/{branch-name}`)
- Contain all code changes, commits, staged files from previous worker
- Survive process death — they're just directories on disk
- Branch name derived from issue: `feat/{issueId}-{slug}` or `feat/{issueId}`

**Agent Session Files:**

- Claude Code: `~/.claude/projects/{encoded-workspace-path}/*.jsonl` — full conversation with tool calls, reasoning, outputs
- Codex: `~/.codex/sessions/*.jsonl` — thread data with model info
- Aider: `.aider.chat.history.md` in the workspace directory

**GitHub State:**

- PRs, issue comments, CI results — fully independent of AO runtime

### 2.4 Key Code Paths

**`spawn()` — `packages/core/src/session-manager.ts` line ~893:**

```typescript
async function spawn(spawnConfig: SessionSpawnConfig): Promise<Session> {
  // ... resolves plugins, creates worktree, builds prompt ...

  const launchCommand = plugins.agent.getLaunchCommand(agentLaunchConfig); // ← ALWAYS fresh
  // Never checks for archived sessions
  // Never calls getRestoreCommand()
}
```

**`spawnOrchestrator()` — line ~1196:**

```typescript
async function spawnOrchestrator(orchestratorConfig: OrchestratorSpawnConfig): Promise<Session> {
  // ... checks if runtime is alive ...
  // If dead: archives metadata (if reuse strategy), deletes, reserves new ID

  const launchCommand = plugins.agent.getLaunchCommand(agentLaunchConfig); // ← ALWAYS fresh
  // Has the archived metadata but doesn't use it for restore
}
```

**`restore()` — line ~2199 (the working path we want to replicate):**

```typescript
async function restore(sessionId: SessionId): Promise<Session> {
  // ... finds session metadata (active or archived) ...
  // ... validates restorability, rebuilds workspace ...

  if (plugins.agent.getRestoreCommand) {
    const restoreCmd = await plugins.agent.getRestoreCommand(session, project); // ← USES RESUME ✅
    launchCommand = restoreCmd ?? plugins.agent.getLaunchCommand(agentLaunchConfig);
  }
}
```

### 2.5 Metadata Archive System

When a session is killed:

```typescript
// metadata.ts line 184
export function deleteMetadata(dataDir, sessionId, archive = true) {
  // Copies to: sessions/archive/{sessionId}_{ISO-timestamp}
  // Original key-value file contains: worktree, branch, issue, pr, agent,
  //   status, createdAt, runtimeHandle, opencodeSessionId, summary
}
```

Reading archived metadata:

```typescript
// metadata.ts line 204
export function readArchivedMetadataRaw(dataDir, sessionId) {
  // Scans archive/ dir for files matching {sessionId}_*
  // Returns the latest one (sorted by timestamp suffix)
}
```

This archive system already stores everything needed to find a previous session for the same issue. It's just not queried during `spawn()`.

---

## 3. Proposed Changes

### 3.1 Gap 1: Auto-Resume in `spawn()` for Same-Issue Sessions

**Goal:** When `spawn()` is called for an issue that had a previous worker session, automatically attempt to resume that session's conversation instead of starting fresh.

**Changes to `packages/core/src/session-manager.ts`:**

#### 3.1.1 New helper: `findArchivedSessionForIssue()`

```typescript
/**
 * Search archived sessions for a previous session that worked on the same issue.
 * Returns the most recent archived session metadata, or null if none found.
 */
function findArchivedSessionForIssue(
  sessionsDir: string,
  issueId: string,
  agentName: string,
): { sessionId: string; raw: Record<string, string> } | null {
  const archiveDir = join(sessionsDir, "archive");
  if (!existsSync(archiveDir)) return null;

  // Scan all archived metadata files
  const candidates: { sessionId: string; raw: Record<string, string>; timestamp: string }[] = [];

  for (const file of readdirSync(archiveDir)) {
    const raw = parseKeyValueContent(readFileSync(join(archiveDir, file), "utf-8"));
    if (raw["issue"] === issueId && raw["agent"] === agentName) {
      // Extract timestamp from filename: {sessionId}_{ISO-timestamp}
      const parts = file.split("_");
      const timestamp = parts.slice(1).join("_"); // Everything after first underscore
      const sessionId = parts[0];
      candidates.push({ sessionId, raw, timestamp });
    }
  }

  if (candidates.length === 0) return null;

  // Return the most recent archived session
  candidates.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return { sessionId: candidates[0].sessionId, raw: candidates[0].raw };
}
```

#### 3.1.2 Modify `spawn()` to attempt resume

In `spawn()`, after building `agentLaunchConfig` and before creating the runtime (around line 1060):

```typescript
// --- NEW: Attempt to resume previous session for same issue ---
let launchCommand: string;
let resumedFromSession: string | null = null;

if (spawnConfig.issueId && plugins.agent.getRestoreCommand) {
  const archived = findArchivedSessionForIssue(
    sessionsDir,
    spawnConfig.issueId,
    selection.agentName,
  );

  if (archived) {
    // Reconstruct a minimal Session object for getRestoreCommand()
    const archivedSession = metadataToSession(
      archived.sessionId,
      archived.raw,
      spawnConfig.projectId,
    );
    // Override workspacePath to the current worktree (may differ from archived)
    archivedSession.workspacePath = workspacePath;

    try {
      const restoreCmd = await plugins.agent.getRestoreCommand(archivedSession, project);
      if (restoreCmd) {
        launchCommand = restoreCmd;
        resumedFromSession = archived.sessionId;
        log.info(
          `Resuming conversation from archived session ${archived.sessionId} for issue ${spawnConfig.issueId}`,
        );
      }
    } catch (err) {
      log.warn(
        `Failed to build restore command from archived session ${archived.sessionId}: ${err}`,
      );
      // Fall through to fresh launch
    }
  }
}

if (!launchCommand) {
  launchCommand = plugins.agent.getLaunchCommand(agentLaunchConfig);
}
// --- END NEW ---
```

#### 3.1.3 Track resume in metadata

Add to the session metadata write:

```typescript
writeMetadata(sessionsDir, sessionId, {
  // ... existing fields ...
  resumedFrom: resumedFromSession, // Track lineage
});
```

**Changes to `packages/core/src/metadata.ts`:**

- Add `resumedFrom?: string` to `SessionMetadata` interface
- Add serialization/deserialization for the new field

**Changes to `packages/core/src/types.ts`:**

- Add `resumedFrom?: string` to `SessionSpawnConfig` (optional, for explicit override)

#### 3.1.4 Configuration

Add to `ProjectConfig` in `types.ts`:

```typescript
/** Strategy for handling previous sessions when spawning for the same issue.
 * - "resume" (default): attempt getRestoreCommand(), fall back to fresh launch
 * - "fresh": always start fresh (current behavior)
 * - "context-inject": don't resume, but inject summary from previous session (see Gap 4)
 */
workerRespawnStrategy?: "resume" | "fresh" | "context-inject";
```

This lets users opt out if they want the current behavior.

---

### 3.2 Gap 2: Auto-Resume in `spawnOrchestrator()`

**Goal:** When `ao start` is run after killing everything, the orchestrator should resume its previous conversation if possible.

**Changes to `packages/core/src/session-manager.ts`:**

In `spawnOrchestrator()`, around line 1350 (after archiving old metadata, before building launch command):

```typescript
// --- NEW: Attempt orchestrator resume ---
let launchCommand: string;

if (orchestratorSessionStrategy === "reuse" && plugins.agent.getRestoreCommand) {
  // Check if we archived metadata earlier in this function
  const archived = readArchivedMetadataRaw(sessionsDir, sessionId);
  if (archived) {
    const archivedSession = metadataToSession(sessionId, archived, orchestratorConfig.projectId);
    archivedSession.workspacePath = project.path;

    try {
      const restoreCmd = await plugins.agent.getRestoreCommand(archivedSession, project);
      if (restoreCmd) {
        launchCommand = restoreCmd;
        log.info(`Resuming orchestrator from archived session`);
      }
    } catch (err) {
      log.warn(`Orchestrator resume failed: ${err}`);
    }
  }
}

if (!launchCommand) {
  launchCommand = plugins.agent.getLaunchCommand(agentLaunchConfig);
}
// --- END NEW ---
```

**No additional config needed** — controlled by existing `orchestratorSessionStrategy: "reuse"` setting.

---

### 3.3 Gap 3: `getRestoreCommand()` for OpenCode and Aider

**Goal:** Implement resume support for agents that currently lack it.

#### 3.3.1 OpenCode — `packages/plugins/agent-opencode/src/index.ts`

OpenCode already has session ID reuse during `spawn()` via `opencodeIssueSessionStrategy`. The `getRestoreCommand()` implementation should leverage this:

```typescript
async getRestoreCommand(session: Session, project: ProjectConfig): Promise<string | null> {
  // OpenCode's resume mechanism is session ID reuse, not a CLI flag.
  // The session ID is passed via environment variable or config.
  // If we have a stored opencodeSessionId, build a launch command that includes it.

  const opencodeSessionId = session.metadata?.opencodeSessionId;
  if (!opencodeSessionId) return null;

  // Build the same launch command but with the opencodeSessionId injected
  // into the agent config so it resumes the existing session.
  // This reuses the existing opencodeIssueSessionStrategy logic.
  return null; // Delegate to spawn()'s existing reuse mechanism

  // NOTE: If OpenCode adds a --resume flag in the future, use it here instead.
}
```

**Assessment:** OpenCode's reuse mechanism during `spawn()` already partially covers this. The main gap is that `restore()` can't resume OpenCode sessions. If OpenCode's CLI adds a `--resume` flag, this becomes straightforward. Until then, the context injection fallback (Gap 4) is the best option for OpenCode.

#### 3.3.2 Aider — `packages/plugins/agent-aider/src/index.ts`

Aider stores conversation history in `.aider.chat.history.md` in the workspace. It also supports `--restore-chat-history` flag.

```typescript
async getRestoreCommand(session: Session, project: ProjectConfig): Promise<string | null> {
  if (!session.workspacePath) return null;

  // Check if chat history file exists
  const chatFile = join(session.workspacePath, ".aider.chat.history.md");
  if (!existsSync(chatFile)) return null;

  // Check file isn't empty/stale
  const stats = statSync(chatFile);
  if (stats.size === 0) return null;

  // Build aider command with --restore-chat-history
  // This tells aider to load the previous conversation
  const parts: string[] = ["aider", "--restore-chat-history"];

  // Add model flags from config
  if (project.agentConfig?.model) {
    parts.push("--model", shellEscape(project.agentConfig.model as string));
  }

  // Add any other configured flags (from getLaunchCommand pattern)
  // ...

  return parts.join(" ");
}
```

**NOTE:** Verify that `--restore-chat-history` is a real Aider flag. If not, the context injection fallback (Gap 4) handles Aider.

**Files to modify:**

- `packages/plugins/agent-opencode/src/index.ts` — add `getRestoreCommand()`
- `packages/plugins/agent-aider/src/index.ts` — add `getRestoreCommand()`
- Corresponding test files

---

### 3.4 Gap 4: Cross-Session Context Injection Fallback

**Goal:** When native resume isn't possible (agent doesn't support it, session files are corrupted, context window is full), inject a summary of the previous session as the initial prompt for the new worker.

This is the **universal fallback** that works for ALL agents.

#### 3.4.1 New module: `packages/core/src/session-context-builder.ts`

```typescript
/**
 * Build context summary from a previous session's artifacts.
 * Used as fallback when native resume (getRestoreCommand) isn't available.
 */

export interface PreviousSessionContext {
  /** Human-readable summary of what the previous session did */
  summary: string;
  /** Git commits made by the previous session */
  commits: string[];
  /** Files modified */
  modifiedFiles: string[];
  /** PR number if one was opened */
  prNumber?: string;
  /** Error or reason the session ended */
  endReason?: string;
  /** Session metadata summary field (if agent extracted one) */
  agentSummary?: string;
}

/**
 * Extract context from a previous session's artifacts.
 *
 * Sources (in priority order):
 * 1. Session metadata `summary` field (agent-generated summary)
 * 2. Git log on the branch (concrete work done)
 * 3. PR description and comments (if PR was opened)
 * 4. Agent session files (Claude Code JSONL, Codex JSONL — last few exchanges)
 */
export async function buildPreviousSessionContext(
  archivedMetadata: Record<string, string>,
  workspacePath: string,
  plugins: { tracker?: TrackerPlugin },
): Promise<PreviousSessionContext | null> {
  const context: PreviousSessionContext = {
    summary: "",
    commits: [],
    modifiedFiles: [],
  };

  // 1. Agent summary from metadata
  if (archivedMetadata["summary"]) {
    context.agentSummary = archivedMetadata["summary"];
  }

  // 2. Git log — commits on this branch not on default branch
  try {
    const branch = archivedMetadata["branch"];
    if (branch && existsSync(workspacePath)) {
      const { stdout: logOutput } = await execAsync(
        `git -C ${shellEscape(workspacePath)} log --oneline ${shellEscape(branch)} --not origin/main -- 2>/dev/null || true`,
      );
      if (logOutput.trim()) {
        context.commits = logOutput.trim().split("\n").slice(0, 20); // Cap at 20 commits
      }

      // Modified files
      const { stdout: diffOutput } = await execAsync(
        `git -C ${shellEscape(workspacePath)} diff --name-only origin/main...${shellEscape(branch)} 2>/dev/null || true`,
      );
      if (diffOutput.trim()) {
        context.modifiedFiles = diffOutput.trim().split("\n");
      }
    }
  } catch {
    // Git info is best-effort
  }

  // 3. PR info
  if (archivedMetadata["pr"]) {
    context.prNumber = archivedMetadata["pr"];
  }

  // 4. End reason from status
  if (archivedMetadata["status"]) {
    context.endReason = archivedMetadata["status"]; // "killed", "crashed", "rate-limited", etc.
  }

  // Build human-readable summary
  const parts: string[] = [];
  parts.push("## Previous Session Context");
  parts.push(
    `A previous worker session worked on this same issue and ended with status: ${context.endReason ?? "unknown"}.`,
  );

  if (context.agentSummary) {
    parts.push(`\n### Agent Summary\n${context.agentSummary}`);
  }

  if (context.commits.length > 0) {
    parts.push(`\n### Commits Made\n${context.commits.map((c) => `- ${c}`).join("\n")}`);
  }

  if (context.modifiedFiles.length > 0) {
    parts.push(`\n### Files Modified\n${context.modifiedFiles.map((f) => `- ${f}`).join("\n")}`);
  }

  if (context.prNumber) {
    parts.push(
      `\n### PR Opened\nPR #${context.prNumber} was opened. Check its status and review comments before continuing.`,
    );
  }

  parts.push(
    `\n### Instructions\nReview the previous work. Do NOT start over from scratch. Continue from where the previous session left off. If the previous approach had issues, learn from them and try a different approach.`,
  );

  context.summary = parts.join("\n");

  return context.commits.length > 0 || context.agentSummary ? context : null;
}
```

#### 3.4.2 Integrate into `spawn()`

Extend the spawn() modification from Gap 1 with a fallback chain:

```typescript
// In spawn(), the full resume logic becomes:

let launchCommand: string;
let composedPromptWithContext = composedPrompt; // Original prompt from issue

if (spawnConfig.issueId) {
  const archived = findArchivedSessionForIssue(
    sessionsDir,
    spawnConfig.issueId,
    selection.agentName,
  );

  if (archived) {
    const strategy = project.workerRespawnStrategy ?? "resume";

    // Strategy 1: Try native resume
    if (strategy === "resume" && plugins.agent.getRestoreCommand) {
      const archivedSession = metadataToSession(
        archived.sessionId,
        archived.raw,
        spawnConfig.projectId,
      );
      archivedSession.workspacePath = workspacePath;

      try {
        const restoreCmd = await plugins.agent.getRestoreCommand(archivedSession, project);
        if (restoreCmd) {
          launchCommand = restoreCmd;
        }
      } catch (err) {
        log.warn(`Resume failed, falling back to context injection: ${err}`);
      }
    }

    // Strategy 2: Context injection (fallback, or explicit "context-inject" strategy)
    if (!launchCommand && strategy !== "fresh") {
      const prevContext = await buildPreviousSessionContext(archived.raw, workspacePath, plugins);
      if (prevContext) {
        // Prepend context to the issue prompt
        composedPromptWithContext = `${prevContext.summary}\n\n---\n\n${composedPrompt}`;
      }
    }
  }
}

if (!launchCommand) {
  // Update the agentLaunchConfig with the enriched prompt
  agentLaunchConfig.prompt = composedPromptWithContext;
  launchCommand = plugins.agent.getLaunchCommand(agentLaunchConfig);
}
```

#### 3.4.3 Context size management

Previous session context must respect agent context window limits:

```typescript
const MAX_CONTEXT_INJECTION_CHARS = 4000; // ~1000 tokens

export function truncateContext(
  context: string,
  maxChars: number = MAX_CONTEXT_INJECTION_CHARS,
): string {
  if (context.length <= maxChars) return context;

  // Keep the header, agent summary, and instructions. Truncate commits/files.
  const lines = context.split("\n");
  let result = "";
  for (const line of lines) {
    if (result.length + line.length > maxChars - 100) {
      result += "\n... (truncated, see git log for full history)";
      break;
    }
    result += line + "\n";
  }
  return result;
}
```

---

## 4. Execution Order

The four gaps have dependencies. Recommended implementation order:

### Phase 1: Foundation (Gap 1 + Gap 4)

1. **`findArchivedSessionForIssue()` helper** — search archives by issue ID
2. **`buildPreviousSessionContext()` module** — extract context from artifacts
3. **Modify `spawn()` with the full fallback chain:**
   - Try `getRestoreCommand()` (native resume)
   - Fall back to context injection
   - Fall back to fresh launch
4. **Add `workerRespawnStrategy` config option**
5. **Track `resumedFrom` in metadata**

This gives immediate value for Claude Code and Codex (native resume) and universal fallback for OpenCode and Aider (context injection).

### Phase 2: Orchestrator Resume (Gap 2)

6. **Modify `spawnOrchestrator()` to attempt resume** when strategy is `"reuse"` and runtime is dead

Lower priority since the orchestrator is mostly stateless by design.

### Phase 3: Agent Plugin Parity (Gap 3)

7. **OpenCode `getRestoreCommand()`** — implement when/if OpenCode adds CLI resume support
8. **Aider `getRestoreCommand()`** — implement using `--restore-chat-history` or equivalent

These can be done independently as agent CLIs evolve.

---

## 5. Files to Modify

| File                                                          | Change                                                                                | Gap     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------- |
| `packages/core/src/session-manager.ts`                        | Add `findArchivedSessionForIssue()`, modify `spawn()` and `spawnOrchestrator()`       | 1, 2    |
| `packages/core/src/session-context-builder.ts`                | **New file** — `buildPreviousSessionContext()`                                        | 4       |
| `packages/core/src/types.ts`                                  | Add `workerRespawnStrategy` to `ProjectConfig`, `resumedFrom` to `SessionSpawnConfig` | 1       |
| `packages/core/src/metadata.ts`                               | Add `resumedFrom` field to `SessionMetadata`                                          | 1       |
| `packages/plugins/agent-opencode/src/index.ts`                | Add `getRestoreCommand()`                                                             | 3       |
| `packages/plugins/agent-aider/src/index.ts`                   | Add `getRestoreCommand()`                                                             | 3       |
| `packages/core/src/__tests__/session-manager.test.ts`         | Tests for resume-on-spawn, context injection                                          | 1, 2, 4 |
| `packages/core/src/__tests__/session-context-builder.test.ts` | **New file** — tests for context extraction                                           | 4       |

---

## 6. Testing Strategy

### Unit Tests

- `findArchivedSessionForIssue()` — finds correct session, handles no archives, handles multiple archives for same issue (picks latest)
- `buildPreviousSessionContext()` — extracts git commits, handles missing worktree, handles empty git history, truncates long context
- `spawn()` with resume — mocks `getRestoreCommand()`, verifies it's called when archived session exists, verifies fallback to `getLaunchCommand()` when resume fails

### Integration Tests

- Kill a Claude Code worker mid-task → `ao start` → verify new worker resumes conversation
- Kill a Codex worker mid-task → `ao start` → verify new worker resumes conversation
- Kill an Aider worker mid-task → `ao start` → verify new worker gets context injection
- Kill everything, delete agent session files → `ao start` → verify context injection uses git log
- Test `workerRespawnStrategy: "fresh"` → verify no resume attempted

### Edge Cases

- Archived session exists but agent session files were deleted → falls back to context injection
- Multiple archived sessions for same issue → uses most recent
- Archived session for different agent (e.g., switched from Claude Code to Codex) → skip, don't try to resume cross-agent
- Corrupted agent session file → `getRestoreCommand()` returns null → falls back to context injection
- Context injection with empty git history → skips context, starts fresh
- Worker respawned for same issue while old worktree is still locked → handle worktree conflicts

---

## 7. Risks and Mitigations

| Risk                                                                           | Mitigation                                                                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Resumed session has stale/wrong context (issue was updated since last session) | Context injection includes "review the issue for updates" instruction. Native resume preserves full history so agent can see changes. |
| Resumed conversation exceeds context window                                    | Agent handles this natively (Claude Code truncates old messages). For context injection, we cap at 4000 chars.                        |
| Archive directory grows unbounded                                              | Already handled — `cleanup` command exists. Could add TTL-based archive pruning later.                                                |
| `getRestoreCommand()` succeeds but agent can't actually resume (corrupt state) | Agent will fail fast → lifecycle worker detects → respawns fresh (no resume loop because we only try resume once per spawn)           |
| Performance: scanning archive dir on every spawn                               | Archive dirs are small (tens of files). If needed, add an index file later.                                                           |
| Cross-agent resume (session was Claude Code, respawn uses Codex)               | `findArchivedSessionForIssue()` filters by agent name — only matches same agent.                                                      |

---

## 8. Success Metrics

After implementation:

- **Respawn recovery time:** Worker should be productive within 1-2 minutes of respawn (vs 5-10 minutes re-discovering context)
- **Token waste reduction:** Measure tokens spent in first 5 minutes of respawned workers (before vs after)
- **Retry loop prevention:** Workers that failed due to a specific approach should try a different approach on respawn (context tells them what failed)
- **Zero regression:** Workers with `workerRespawnStrategy: "fresh"` behave exactly as today
