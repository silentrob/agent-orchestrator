# Agent Orchestrator: Session Artifacts

## Implementation Plan

**Author:** AO Team
**Date:** 2026-03-30
**Status:** Proposal

---

## Table of Contents

0. [Competitor Analysis](#0-competitor-analysis)
1. [Problem Definition](#1-problem-definition)
2. [Architecture Overview](#2-architecture-overview)
3. [End-to-End Flow](#3-end-to-end-flow)
4. [Phase 0 — Foundation: Types, Interfaces, Scaffold](#4-phase-0)
5. [Phase 1 — Artifact Service Implementation](#5-phase-1)
6. [Deferred Phases (Post-MVP)](#6-deferred-phases)
7. [Appendix — Design Decisions](#appendix)

---

## 0. Competitor Analysis

How do other agent orchestration systems and coding tools handle persistent artifacts across sessions? We compare five systems against our proposed approach for the specific use case of **creating, storing, and discovering session outputs across multiple agent sessions**.

| System                                                 | Type                         | Storage                                 | Cross-Session Discovery                     |
| ------------------------------------------------------ | ---------------------------- | --------------------------------------- | ------------------------------------------- |
| [GSD 2.0](https://github.com/gsd-build/gsd-2)          | CLI agent orchestrator       | Markdown files in `.gsd/`               | Pre-loaded into prompt by dispatch pipeline |
| [Paperclip](https://github.com/paperclipai/paperclip)  | Orchestration server         | PostgreSQL                              | API callbacks at runtime                    |
| [DeerFlow 2.0](https://github.com/bytedance/deer-flow) | Multi-agent research harness | Thread-scoped filesystem + checkpointer | None — artifacts die with thread            |
| [Cursor](https://cursor.com)                           | AI code editor               | SQLite + files                          | `@Past Chats` (lossy summaries)             |
| [Claude Code](https://claude.ai/code)                  | CLI coding agent             | JSONL + markdown                        | Session Memory summaries (lossy)            |
| **AO (Proposed)**                                      | **Agent orchestrator**       | **Filesystem + `manifest.json`**        | **On-demand CLI (`list/grep/read`)**        |

### Scorecard

How each system rates on the key metrics for cross-session artifact persistence. Rated: **Strong** / Partial / Weak / None.

| Metric                         | GSD 2.0                             | Paperclip                                | DeerFlow 2.0                       | Cursor                       | Claude Code                      | **AO (Proposed)**                           |
| ------------------------------ | ----------------------------------- | ---------------------------------------- | ---------------------------------- | ---------------------------- | -------------------------------- | ------------------------------------------- |
| Publish arbitrary artifacts    | Weak — text summaries only          | Partial — versioned docs + work products | Partial — files in `outputs/`      | None                         | None                             | **Strong** — any file + external refs       |
| Cross-session discovery        | **Strong** — pre-loaded by pipeline | Partial — API callbacks                  | None                               | Weak — `@Past Chats` (lossy) | Weak — session summaries (lossy) | **Strong** — CLI `list/grep/read`           |
| Content search across sessions | None                                | None                                     | None                               | None                         | Weak — keyword on logs           | **Strong** — `ao artifact grep`             |
| Issue/task scoping             | Partial — hierarchy-based           | **Strong** — join table                  | None                               | None                         | None                             | **Strong** — `issueId` field                |
| Structured metadata            | None — implicit from path           | Partial — JSONB blob                     | None                               | Partial — frontmatter        | Partial — memory tags            | **Strong** — category, status, tags, MIME   |
| Multi-agent sharing            | Partial — shared `.gsd/` dir        | **Strong** — REST API                    | Weak — same thread only            | None                         | None                             | **Strong** — CLI across any session         |
| Orchestrator visibility        | Partial — reads files directly      | **Strong** — API queries                 | Weak — lead reads shared FS        | None                         | None                             | **Strong** — `list/grep` + metadata sync    |
| Security guards                | None                                | Partial — DB isolation                   | Partial — sandbox                  | None                         | None                             | **Strong** — path traversal + file blocking |
| Crash / recovery resilience    | **Strong** — lock files + forensics | **Strong** — DB transactions             | Partial — checkpointer             | None                         | Partial — JSONL on disk          | **Strong** — manifest + sidecar recovery    |
| Cross-session memory           | Partial — `KNOWLEDGE.md`            | None                                     | **Strong** — LLM-summarized facts  | Weak — manual rules          | **Strong** — 4-layer auto memory | Weak — deferred (artifacts as raw memory)   |
| Conflict detection             | None                                | **Strong** — optimistic concurrency      | None                               | None                         | None                             | None — deferred                             |
| No external dependencies       | **Strong** — files only             | Weak — requires PostgreSQL               | Partial — optional SQLite/Postgres | Partial — local SQLite       | **Strong** — files only          | **Strong** — files only                     |

### Feature Support Matrix

Which specific capabilities each system supports (**Y** = yes, **P** = partial, **-** = no).

| Feature                                                  | GSD 2.0 | Paperclip | DeerFlow | Cursor | Claude Code | **AO** |
| -------------------------------------------------------- | :-----: | :-------: | :------: | :----: | :---------: | :----: |
| Publish files as artifacts                               |    -    |     P     |    P     |   -    |      -      | **Y**  |
| Publish external references (PRs, URLs)                  |    -    |     P     |    -     |   -    |      -      | **Y**  |
| Auto-publish PRs                                         |    -    |     -     |    -     |   -    |      -      | **Y**  |
| List artifacts by session                                |    -    |     P     |    -     |   -    |      -      | **Y**  |
| List artifacts by issue                                  |    -    |     Y     |    -     |   -    |      -      | **Y**  |
| Full-text search across artifacts                        |    -    |     -     |    -     |   -    |      -      | **Y**  |
| Filter by category/status/tags                           |    -    |     P     |    -     |   -    |      -      | **Y**  |
| Artifact status lifecycle (draft → published → verified) |    -    |     -     |    -     |   -    |      -      | **Y**  |
| Pre-load context into agent prompt                       |    Y    |     P     |    -     |   P    |      P      | **Y**  |
| On-demand context discovery at runtime                   |    -    |     Y     |    -     |   P    |      -      | **Y**  |
| Delete / tombstone artifacts                             |    -    |     -     |    -     |   -    |      -      | **Y**  |
| Concurrent write safety                                  |    P    |     Y     |    -     |   -    |      -      | **Y**  |
| Manifest / index recovery from disk                      |    P    |     Y     |    P     |   -    |      -      | **Y**  |
| Orchestrator summary view                                |    P    |     Y     |    -     |   -    |      -      | **Y**  |

### Key Takeaways for Our Approach

**What we do that nobody else does:**

- **Cross-session content search.** `ao artifact grep "payment gateway"` searching across all sessions' text artifacts. None of the five competitors have this.
- **External reference artifacts.** PRs, deployments, and issues tracked as first-class artifacts with metadata — not just files on disk or conversation summaries.
- **Combined session + issue scoping.** Filter by session (`--session ao-5`) OR by issue (`--issue INT-42`) across all sessions.
- **Orchestrator-aware artifact system.** The orchestrator can query artifacts to verify work and make routing decisions. Cursor and Claude Code have no orchestrator concept. GSD reads `.gsd/` directly but has no structured query layer.

**What we should watch:**

- **GSD's pre-loading approach** may be more reliable than our on-demand discovery. If agents consistently forget to call `ao artifact list`, we may need a `--with-context` flag to inline specific artifacts at spawn time (already noted as an open question).
- **Claude Code's four-layer memory** is the gold standard for single-agent session memory. Our artifact system complements it — artifacts are structured outputs, Claude Code's memory is accumulated knowledge. The two work at different levels.
- **Paperclip's conflict detection** is worth revisiting post-MVP if artifacts evolve from write-once to collaborative documents.
- **DeerFlow's long-term memory** (LLM-summarized facts with confidence scoring) is a more sophisticated approach to cross-session knowledge than raw artifact files — worth considering for the deferred Knowledge Management phase.
- **Cursor's removed Memories feature** is a cautionary signal: automatic persistence that the user doesn't control can cause more problems than it solves. Our explicit `ao artifact publish` approach (agent decides what to publish) avoids this.

---

## 1. Problem Definition

When AO spawns an agent session to work on a task, the agent produces outputs — PRs, design documents, research findings, test reports, screenshots. Today, when that session ends, these outputs are scattered across worktrees with no way to discover, search, or verify them.

This creates three concrete failures:

**Failure 1 — Blind orchestrator.** The orchestrator spawns 10 sessions but cannot ask "show me the design doc from ao-5 so I can verify it before starting the next task." It can only see session status and PR URL.

**Failure 2 — Lost context.** Session ao-5 researched an API and wrote findings. Session ao-12 needs that context but has no way to find it. The findings died with ao-5's worktree.

**Failure 3 — Invisible outputs.** Session ao-10 created a PR, a design doc, and a test report. There's no way to search across all session outputs ("find every session that mentioned payment gateway"), verify them, or track their status.

The solution is a **first-class artifact system** where agents publish their outputs, and orchestrators/users discover, search, and load them across sessions.

---

## 2. Architecture Overview

### What is an Artifact?

Anything an agent produces that should be visible to the orchestrator or user:

- A PR (stored as a reference — link + metadata, not a copy)
- A design document
- A findings doc (gotchas, lessons, research results)
- A test report
- A screenshot proving a feature works
- Any other file output

Agents publish artifacts via `ao artifact publish`. Orchestrators and users consume them via `ao artifact list`, `ao artifact grep`, and `ao artifact read`.

**What is NOT an artifact?** External inputs — things others produce that agents consume. PR review comments are not artifacts (they're fetched live from GitHub via the SCM plugin).

### Directory Layout

```
~/.agent-orchestrator/{hash}-{projectId}/
├── sessions/                         # Existing: session metadata
├── worktrees/                        # Existing: git worktrees
└── artifacts/                        # NEW: first-class session output artifacts
    ├── manifest.json                 # Artifact index: entries with mimeType, category, status
    ├── manifest.lock                    # File lock for concurrent write safety
    ├── ao-5/                         # Per-session artifact directory
    │   ├── design-doc-auth-flow.md       # Design document
    │   ├── design-doc-auth-flow.md.meta.json  # Sidecar metadata (for manifest recovery)
    │   ├── findings.md                   # Gotchas and lessons learned
    │   ├── findings.md.meta.json
    │   ├── screenshot-login.png          # Screenshot
    │   ├── screenshot-login.png.meta.json
    │   └── test-report.html              # Test report
    ├── ao-12/
    │   └── coverage-summary.json         # Coverage data
    └── ao-15/
        └── analysis-results.xlsx         # Spreadsheet output
```

### How It Integrates with Existing AO

**Prompt injection:** A new Layer 5 is added to the existing `buildPrompt()` pipeline in `prompt-builder.ts`. It tells the agent about artifact CLI commands. This layer is conditional — only included when artifacts are initialized for the project.

**Environment:** Two new env vars added alongside existing `AO_SESSION` in `session-manager.ts`:

- `AO_ARTIFACTS_DIR` — absolute path to the `artifacts/` directory.
- `AO_ISSUE_ID` — the issue identifier (e.g. `INT-42`, `#123`). Set from the same spawn argument that drives branch naming and prompt context — when the user runs `ao spawn INT-42`, the session manager already resolves `issueId = "INT-42"` for `buildPrompt()` and branch creation (`feat/INT-42`). This same value is forwarded to the environment. Empty string if no issue is provided (e.g., `ao spawn --claim-pr 123`). Used by `ao artifact publish` to auto-populate `issueId` on artifacts without the agent needing to pass `--issue`.

**Prompt delivery:** Uses the existing mechanism — post-launch `sendMessage()` for Claude Code agents. No new injection path.

**Orchestrator:** A new section is appended to `generateOrchestratorPrompt()` listing artifact read commands (`ao artifact list`, `ao artifact grep`, `ao artifact read`).

**Session exit:** No special cleanup. Artifacts published during the session are already persisted. Manifest is already up to date (written on each publish).

### Manifest

`manifest.json` is the single index of all artifacts. It is:

- **Updated on each publish** — `publish()` acquires a file lock (`manifest.lock`), reads, appends, and rewrites atomically. This prevents concurrent publishes from two agents stomping each other's entries.
- **Regenerable** — if corrupted or deleted, rebuilt by scanning `artifacts/` subdirectories and reading sidecar `.meta.json` files (see below).
- **The query source** — `list`, `grep`, `stats` all read the manifest first to find matching artifacts.

### Sidecar Metadata

Each published artifact gets a companion `<filename>.meta.json` alongside it:

```
artifacts/ao-5/
├── design-doc.md
├── design-doc.md.meta.json    # { id, category, description, tags, issueId, ... }
├── findings.md
└── findings.md.meta.json
```

Written by `publish()` at the same time as the manifest entry. Cost: one small file per artifact. Benefit: `rebuildManifest()` can reconstruct full metadata (description, tags, issueId, category, status) instead of producing skeleton entries with only filename and path.

### Auto-Published Artifacts

PR reference artifacts are **auto-published by the lifecycle manager** when it detects a new PR for a session (via SCM polling). The agent does not need to run `ao artifact publish-ref` for PRs — the orchestrator handles it automatically. This ensures PR artifacts are never missed, even if the agent forgets.

---

## 3. End-to-End Flow

### Sequence Diagram

```
══════════════════════════════════════════════════════════════════
 PHASE 1 — SESSION SPAWN
══════════════════════════════════════════════════════════════════

  User/Orch          SessionManager      PromptBuilder     ArtifactService     Filesystem
      │                    │                   │                  │                 │
      │  ao spawn INT-42   │                   │                  │                 │
      │───────────────────>│                   │                  │                 │
      │                    │  isInitialized()? │                  │                 │
      │                    │──────────────────────────────────────>                 │
      │                    │       false       │                  │                 │
      │                    │<─────────────────────────────────────│                 │
      │                    │  init()           │                  │                 │
      │                    │──────────────────────────────────────>                 │
      │                    │                   │                  │  mkdir artifacts/│
      │                    │                   │                  │  write manifest  │
      │                    │                   │                  │────────────────> │
      │                    │       ready       │                  │                 │
      │                    │<─────────────────────────────────────│                 │
      │                    │                   │                  │                 │
      │                    │  buildPrompt({    │                  │                 │
      │                    │    artifactContext │                  │                 │
      │                    │  })               │                  │                 │
      │                    │──────────────────>│                  │                 │
      │                    │                   │  Assembles:      │                 │
      │                    │                   │  L1: BASE_AGENT  │                 │
      │                    │                   │  L2: Config      │                 │
      │                    │                   │  L3: User rules  │                 │
      │                    │                   │  L4: Decomp      │                 │
      │                    │                   │  L5: Artifacts   │                 │
      │                    │   composedPrompt  │                  │                 │
      │                    │<─────────────────│                  │                 │
      │                    │                   │                  │                 │
      │                    │  runtime.create({ env: AO_SESSION, AO_ARTIFACTS_DIR })│
      │                    │  ... wait 5s ...                     │                 │
      │                    │  sendMessage(composedPrompt)         │                 │
      │                    │─────────────────────────────────────────> Agent (ao-5) │
      │                    │                   │                  │                 │


══════════════════════════════════════════════════════════════════
 PHASE 2 — AGENT WORKS & PUBLISHES ARTIFACTS
══════════════════════════════════════════════════════════════════

  Agent (ao-5)                              ArtifactService          Filesystem
      │                                          │                       │
      │  (implements auth feature, creates PR)   │                       │
      │                                          │                       │
      │  ao artifact publish-ref                 │                       │
      │    --type pr --url .../pull/42            │                       │
      │    --session ao-5                        │                       │
      │─────────────────────────────────────────>│  add ref entry        │
      │                                          │──────────────────────>│
      │  OK: artifact:abc (pr)                   │    manifest.json      │
      │<─────────────────────────────────────────│                       │
      │                                          │                       │
      │  ao artifact publish ./design-doc.md     │                       │
      │    --category document --session ao-5    │                       │
      │─────────────────────────────────────────>│  copy file + entry    │
      │                                          │──────────────────────>│
      │  OK: artifact:def (document)             │  artifacts/ao-5/      │
      │<─────────────────────────────────────────│  design-doc.md        │
      │                                          │                       │
      │  ao artifact publish ./findings.md       │                       │
      │    --category document                   │                       │
      │    --description "Auth gotchas"          │                       │
      │    --session ao-5                        │                       │
      │─────────────────────────────────────────>│  copy file + entry    │
      │                                          │──────────────────────>│
      │  OK: artifact:ghi (document)             │  artifacts/ao-5/      │
      │<─────────────────────────────────────────│  findings.md          │
      │                                          │                       │
      │  ao artifact publish ./report.html       │                       │
      │    --category test-report --session ao-5 │                       │
      │─────────────────────────────────────────>│  copy file + entry    │
      │                                          │──────────────────────>│
      │  OK: artifact:jkl (test-report)          │  artifacts/ao-5/      │
      │<─────────────────────────────────────────│  report.html          │


══════════════════════════════════════════════════════════════════
 PHASE 3 — SESSION EXITS
══════════════════════════════════════════════════════════════════

  Agent (ao-5)                                              Filesystem
      │                                                         │
      │  Task complete. Session ends.                           │
      │                                                         │
      │  (Nothing happens — artifacts already persisted.)       │
      │                                                         │


══════════════════════════════════════════════════════════════════
 PHASE 4 — NEXT SESSION DISCOVERS PREVIOUS WORK
══════════════════════════════════════════════════════════════════

  User/Orch          SessionManager                         Agent (ao-12)       ArtifactService     Filesystem
      │                    │                                     │                    │                 │
      │  ao spawn INT-99   │                                     │                    │                 │
      │  --prompt "Check   │                                     │                    │                 │
      │   ao-5's findings" │                                     │                    │                 │
      │───────────────────>│  (same spawn flow as Phase 1)       │                    │                 │
      │                    │────────────────────────────────────>│                    │                 │
      │                    │                                     │                    │                 │
      │                    │                                     │  ao artifact list  │                 │
      │                    │                                     │    --session ao-5  │                 │
      │                    │                                     │───────────────────>│  read manifest  │
      │                    │                                     │                    │────────────────>│
      │                    │                                     │  abc: pr-auth (pr) │                 │
      │                    │                                     │  def: design-doc   │                 │
      │                    │                                     │  ghi: findings     │                 │
      │                    │                                     │  jkl: report       │                 │
      │                    │                                     │<───────────────────│                 │
      │                    │                                     │                    │                 │
      │                    │                                     │  ao artifact read  │                 │
      │                    │                                     │    ghi             │                 │
      │                    │                                     │───────────────────>│  read findings  │
      │                    │                                     │                    │────────────────>│
      │                    │                                     │  "Auth gotchas:    │                 │
      │                    │                                     │   jsonwebtoken     │                 │
      │                    │                                     │   breaks on Edge,  │                 │
      │                    │                                     │   use jose..."     │                 │
      │                    │                                     │<───────────────────│                 │
      │                    │                                     │                    │                 │
      │                    │                                     │  ao artifact grep  │                 │
      │                    │                                     │    "payment"       │                 │
      │                    │                                     │───────────────────>│  read all text  │
      │                    │                                     │                    │  artifacts      │
      │                    │                                     │                    │────────────────>│
      │                    │                                     │  design-doc:L42    │                 │
      │                    │                                     │<───────────────────│                 │
      │                    │                                     │                    │                 │
      │                    │                                     │  Has full context. │                 │
      │                    │                                     │  Proceeds.         │                 │


══════════════════════════════════════════════════════════════════
 PHASE 5 — ORCHESTRATOR REVIEWS & COORDINATES
══════════════════════════════════════════════════════════════════

  Orchestrator                                ArtifactService          Filesystem
      │                                            │                       │
      │  ao artifact list --session ao-5           │                       │
      │───────────────────────────────────────────>│  read manifest        │
      │                                            │──────────────────────>│
      │  4 artifacts: pr, 2 docs, test-report      │                       │
      │<───────────────────────────────────────────│                       │
      │                                            │                       │
      │  ao artifact grep "auth"                   │                       │
      │───────────────────────────────────────────>│  grep text artifacts  │
      │                                            │──────────────────────>│
      │  Matches across ao-5 artifacts             │                       │
      │<───────────────────────────────────────────│                       │
      │                                            │                       │
      │  Decides: ao-5 auth done.                  │                       │
      │  Spawn next: ao spawn INT-100              │                       │
      │    --prompt "Payment — check ao-5 artifacts"                       │
      │                                            │                       │
```

### Flow Summary

| Phase             | What Happens                                                                             | Key Mechanism                              |
| ----------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| **1. Spawn**      | Artifact commands injected as Layer 5 in `buildPrompt()`. `AO_ARTIFACTS_DIR` set in env. | `prompt-builder.ts` → `artifact-prompt.ts` |
| **2. Work**       | Agent publishes outputs as artifacts via CLI. Each publish updates manifest atomically.  | `ao artifact publish` / `publish-ref`      |
| **3. Exit**       | Nothing — artifacts already persisted to disk. No cleanup needed.                        | Filesystem durability                      |
| **4. Discover**   | Next session uses `list`, `grep`, `read` to find and load previous work on-demand.       | `ao artifact list/grep/read`               |
| **5. Coordinate** | Orchestrator reviews artifacts across sessions to verify work and plan next tasks.       | Same CLI, orchestrator prompt section      |

---

## 4. Phase 0 — Foundation: Types, Interfaces, Scaffold

**Goal:** Define all types, interfaces, and configuration. Zero runtime behavior changes.

**Duration:** 1 day

### 4.1 Type Definitions

Add to `packages/core/src/types.ts`:

#### Artifact Entry

```typescript
export interface ArtifactEntry {
  id: string; // auto-generated UUID
  sessionId: string; // which session produced it
  issueId?: string; // which issue this relates to (e.g. "INT-42", "#123")
  filename: string; // display name
  path: string; // relative path within artifacts/{sessionId}/
  mimeType: string; // "image/png", "text/markdown", etc.
  category: ArtifactCategory;
  status: ArtifactStatus;
  size: number; // bytes (0 for reference artifacts)
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  description?: string; // human-readable
  tags?: string[];
  isReference?: boolean; // true = external (e.g., PR on GitHub)
  referenceUrl?: string; // URL for reference artifacts
  referenceType?: string; // "pr" | "issue" | "deployment" | "external"
  deletedAt?: string; // ISO 8601 — set on tombstone delete
  deletedBy?: string; // session ID that deleted this
}

export type ArtifactStatus = "draft" | "published" | "verified" | "archived" | "deleted";

export type ArtifactCategory = "pr" | "document" | "test-report" | "screenshot" | "log" | "other";
```

#### Manifest

```typescript
export interface ArtifactManifest {
  schemaVersion: number;
  updatedAt: string;
  entries: ArtifactEntry[];
}
```

#### Filter & Search Result

```typescript
export interface ArtifactFilter {
  sessionId?: string;
  issueId?: string; // filter by issue across all sessions
  category?: ArtifactCategory;
  status?: ArtifactStatus;
  isReference?: boolean;
  tags?: string[];
  createdAfter?: string;
  createdBefore?: string;
  lastN?: number; // last N sessions
  includeDeleted?: boolean; // include tombstoned artifacts (default: false)
}

export interface ArtifactSearchResult {
  artifact: ArtifactEntry;
  matches: {
    line: number;
    content: string;
    context?: string;
  }[];
}
```

### 4.2 Service Interface

```typescript
export interface ArtifactService {
  readonly name: string;

  // Publish
  publish(
    sessionId: string,
    filePath: string,
    meta: Partial<ArtifactEntry>,
  ): Promise<ArtifactEntry>;
  publishReference(
    sessionId: string,
    meta: {
      referenceType: string;
      referenceUrl: string;
      category: ArtifactCategory;
      description: string;
    },
  ): Promise<ArtifactEntry>;

  // Query
  list(filter?: ArtifactFilter): Promise<ArtifactEntry[]>;
  get(artifactId: string): Promise<{ entry: ArtifactEntry; absolutePath: string | null } | null>;
  readContent(artifactId: string): Promise<string | null>;
  grep(pattern: string, filter?: ArtifactFilter): Promise<ArtifactSearchResult[]>;

  // Lifecycle
  updateStatus(artifactId: string, status: ArtifactStatus): Promise<ArtifactEntry>;
  delete(artifactId: string, options?: { purge?: boolean; deletedBy?: string }): Promise<void>;

  // Initialization
  init(): Promise<void>;
  isInitialized(): Promise<boolean>;
  rebuildManifest(): Promise<void>; // rebuild from filesystem scan
}
```

### 4.3 Plugin Slot Registration

Add `"artifact"` to `PluginSlot` in `types.ts`:

```typescript
export type PluginSlot =
  | "runtime"
  | "agent"
  | "workspace"
  | "tracker"
  | "scm"
  | "notifier"
  | "terminal"
  | "artifact"; // NEW
```

Register default plugin in `plugin-registry.ts`:

```typescript
{ slot: "artifact", name: "file", pkg: "@composio/ao-plugin-artifact-file" }
```

### 4.4 Package Scaffold

Create `packages/plugins/artifact-file/` with:

- `package.json` — name `@composio/ao-plugin-artifact-file`, dep on `@composio/ao-core`
- `tsconfig.json` — standard plugin config
- `src/index.ts` — stub implementation (all reads return null, all writes are no-ops)

Update `pnpm-workspace.yaml` to include the new package.

### 4.5 Files Summary

| Action | File                                           | What                                                                                                                   |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Modify | `packages/core/src/types.ts`                   | Add ArtifactEntry, ArtifactManifest, ArtifactFilter, ArtifactSearchResult, ArtifactService, `"artifact"` to PluginSlot |
| Modify | `packages/core/src/plugin-registry.ts`         | Register `artifact-file` plugin                                                                                        |
| Modify | `packages/core/src/index.ts`                   | Re-export new types                                                                                                    |
| Create | `packages/plugins/artifact-file/package.json`  | Package scaffold                                                                                                       |
| Create | `packages/plugins/artifact-file/tsconfig.json` | TypeScript config                                                                                                      |
| Create | `packages/plugins/artifact-file/src/index.ts`  | Stub implementation                                                                                                    |
| Modify | `pnpm-workspace.yaml`                          | Add plugin to workspace                                                                                                |

**Exit criteria:** `pnpm build` passes. `pnpm test` passes. No runtime behavior changes.

---

## 5. Phase 1 — Artifact Service Implementation

**Goal:** Implement the file-based ArtifactService. Agents can publish and search artifacts. Artifact directory initializes on first session.

**Duration:** 3-4 days

### 5.1 Artifact Service Implementation

Implement in `packages/plugins/artifact-file/src/`:

**`artifact-service.ts`:**

- `init()` — Create `artifacts/` directory with empty `manifest.json` (`{ schemaVersion: 1, entries: [] }`).
- `isInitialized()` — Check if `artifacts/manifest.json` exists.
- `ensureManifest()` — Internal helper called before any read operation. If `manifest.json` is missing but artifact directories exist, call `rebuildManifest()`. If nothing exists, return empty manifest.
- `publish(sessionId, filePath, meta)` — Create `artifacts/{sessionId}/` if needed. Run publish guards (see below). Copy file. Write sidecar `.meta.json` alongside the file. Assign UUID. Detect MIME type. Acquire file lock (`manifest.lock`), read manifest, append entry, write manifest atomically, release lock. Then sync to session metadata:
  ```typescript
  // After updating manifest, write summary to session metadata
  // so lifecycle manager can see artifact activity without touching the artifact store
  updateMetadata(sessionsDir, sessionId, {
    artifactCount: String(sessionEntries.length),
    artifactLastAt: new Date().toISOString(),
  });
  ```
- `publishReference(sessionId, meta)` — Create reference entry (no file copy). Size = 0. Sync to session metadata.
- `list(filter)` — Read manifest, filter entries by sessionId, issueId, category, status, tags, date range, lastN sessions. **Exclude deleted entries by default** — only include them when `filter.includeDeleted` is true. Return `ArtifactEntry[]`.
- `get(artifactId)` — Look up entry in manifest. Return entry + resolved absolute path.
- `readContent(artifactId)` — Read text content of artifact. Return null for binary (based on `isGreppable()` MIME check).
- `grep(pattern, filter)` — Read manifest. Filter to greppable entries only (text MIME types, not deleted, not references). Read each matching file from disk. Regex match. Return `ArtifactSearchResult[]` with matching lines + context.
- `updateStatus(artifactId, status)` — Update status in manifest, write atomically.
- `delete(artifactId, options)` — Tombstone: remove file, set status to "deleted". With `purge: true`: remove file AND manifest entry.
- `rebuildManifest()` — Scan `artifacts/` subdirectories. For each file, read its `.meta.json` sidecar to recover full metadata (category, description, tags, issueId, status). Rebuild manifest with complete entries. Called by `ensureManifest()` on missing manifest, and explicitly on `ao start` startup.

**`guards.ts`** — publish-time safety checks:

```typescript
// Block sensitive files
const BLOCKED_PATTERNS = [".env", ".secret", "credentials", "id_rsa", "node_modules/", ".git/"];

export function validatePublish(filePath: string, worktreePath: string): void {
  // 1. Block sensitive files
  const name = path.basename(filePath);
  if (BLOCKED_PATTERNS.some((p) => name.includes(p) || filePath.includes(p))) {
    throw new Error(`Blocked: ${filePath} matches security filter`);
  }

  // 2. Block path traversal — file must be within the worktree
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(worktreePath)) {
    throw new Error(`Blocked: path outside worktree`);
  }
}
```

**`utils.ts`:**

- Atomic writes (write to `.tmp` + `rename()`)
- File locking (`manifest.lock` via `flock` or `proper-lockfile`)
- MIME type detection
- UUID generation
- Sidecar read/write (`<file>.meta.json`)
- `isGreppable(entry)` — determines if an artifact can be text-searched:

  ```typescript
  const TEXT_MIMES = new Set([
    "text/plain",
    "text/markdown",
    "text/html",
    "text/csv",
    "application/json",
    "application/xml",
  ]);

  export function isGreppable(entry: ArtifactEntry): boolean {
    if (entry.isReference) return false;
    if (entry.status === "deleted") return false;
    if (!TEXT_MIMES.has(entry.mimeType)) return false;
    return true;
  }
  ```

### 5.2 Session Integration

Modify `packages/core/src/session-manager.ts`:

**In `spawn()`:**

```typescript
// Before buildPrompt():
if (artifactService && !(await artifactService.isInitialized())) {
  await artifactService.init();
}

const composedPrompt = buildPrompt({
  ...existingConfig,
  artifactContext: {
    artifactsDir: getArtifactsDir(config.configPath),
  },
});

// Environment:
handle = await plugins.runtime.create({
  environment: {
    ...existingEnv,
    AO_ARTIFACTS_DIR: artifactsDir, // NEW
    AO_ISSUE_ID: issueId ?? "", // NEW — auto-populates issueId on artifacts
  },
});
```

### 5.3 Prompt Layer

Create `packages/core/src/artifact-prompt.ts`:

**`buildArtifactLayer(artifactContext)`** — called as Layer 5 in `buildPrompt()`. Reads the manifest at build time to inject a summary line:

```markdown
## Artifacts

You can publish output artifacts that persist across sessions.
Other agents and the orchestrator can discover and read them.

There are currently {N} artifacts from {M} sessions. Run `ao artifact list` to see them.

### Publish Commands

- `ao artifact publish <file> --category <cat>`
  Publish a file as an artifact. Categories: pr, document, test-report, screenshot, log, other.
  Add --description for discoverability. Session and issue are auto-detected from environment.

- `ao artifact publish-ref --type pr --url <url>`
  Register an external artifact by reference. Note: PR artifacts are also auto-published
  by the orchestrator when it detects a new PR, so you may not need to do this manually.

### Discovery Commands

- `ao artifact list [--session <id>] [--issue <id>] [--category <cat>]`
- `ao artifact grep <pattern>` — Search across all text-based artifacts
- `ao artifact read <id>` — Read a specific artifact

### What to Publish

Publish anything that others should see or that future sessions might need:

- Design docs, research findings, decision rationale
- Test reports, coverage data
- Screenshots, recordings
- Gotchas and lessons learned (write a findings doc, publish it)
```

The `{N} artifacts from {M} sessions` line is computed by reading the manifest at spawn time. If there are 0 artifacts, the line is omitted. This nudges agents to actually discover existing work rather than starting blind.

**`buildOrchestratorArtifactSection()`** — appended to orchestrator prompt:

```markdown
## Session Artifacts

Agents publish their outputs as artifacts. Use these to verify work and plan next steps:

- `ao artifact list [--session <id>] [--issue <id>] [--category <cat>]` — List published artifacts
- `ao artifact grep <pattern>` — Search across artifact content
- `ao artifact read <id>` — Read artifact content
```

**Changes to existing files:**

| File                                       | Change                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `packages/core/src/prompt-builder.ts`      | Add `artifactContext` to `PromptBuildConfig`, call `buildArtifactLayer()` as Layer 5 |
| `packages/core/src/orchestrator-prompt.ts` | Append `buildOrchestratorArtifactSection()` when artifacts are initialized           |

### 5.4 CLI Commands

Create `packages/cli/src/commands/artifact.ts`:

**Environment defaults:** `--session` defaults to `$AO_SESSION`, `--issue` defaults to `$AO_ISSUE_ID`. Agents never need to pass these flags — they're only needed when a human or orchestrator runs commands from outside a session context.

**Project resolution:** All commands accept `--project <projectId>`. When omitted, resolve from `AO_ARTIFACTS_DIR` env var (agent context) or default to the first project in config (single-project setups). Same pattern AO uses for other CLI commands.

```
ao artifact publish <file>               # Publish a session output artifact
    --category <pr|document|test-report|screenshot|log|other>
    --description <text>
    --session <sessionId>                # Default: $AO_SESSION
    --issue <issueId>                    # Default: $AO_ISSUE_ID
    --status <draft|published>           # Default: published
    --tags <tag1,tag2,...>
    --project <projectId>                # Default: auto-detect
ao artifact publish-ref                  # Register an external artifact by reference
    --type <pr|issue|deployment|external>
    --url <url>
    --description <text>
    --session <sessionId>                # Default: $AO_SESSION
    --project <projectId>
ao artifact list                         # List all artifacts
    --session <sessionId>                # Filter by session
    --issue <issueId>                    # Filter by issue (across all sessions)
    --category <category>                # Filter by category
    --status <status>                    # Filter by lifecycle status
    --last <N>                           # Only from last N sessions
    --include-deleted                    # Include tombstoned artifacts
    --format <table|json|paths>          # Output format (default: table)
    --project <projectId>
ao artifact show <id>                    # Show metadata + content preview
ao artifact read <id>                    # Print raw text content to stdout
ao artifact update <id>                  # Update artifact metadata
    --status <draft|published|verified|archived>
    --description <text>
    --tags <tag1,tag2,...>
ao artifact summary                      # One-line summary of artifact state
    --session <sessionId>                # Scope to session
    --project <projectId>
    # Example output: "ao-5: 4 artifacts (1 pr, 2 documents, 1 test-report). Last: 2h ago."
ao artifact grep <pattern>              # Full-text search (text MIME types only)
    --session <sessionId>                # Scope to specific session
    --issue <issueId>                    # Scope to issue (across all sessions)
    --category <category>                # Scope to category
    --last <N>                           # Scope to last N sessions
    --context <N>                        # Show N surrounding lines (default: 2)
    --project <projectId>
ao artifact stats                        # Show counts and sizes (active vs deleted)
    --include-deleted                    # Include tombstoned artifacts in totals
    --project <projectId>
ao artifact delete <id>                  # Tombstone: remove file, keep manifest entry
ao artifact delete <id> --purge          # Hard delete: remove file AND manifest entry
```

### 5.5 Files Summary

| Action | File                                                   | What                                                                       |
| ------ | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Create | `artifact-file/src/artifact-service.ts`                | ArtifactService: publish, query, grep, ensureManifest                      |
| Create | `artifact-file/src/guards.ts`                          | Publish guards: sensitive file blocking, path traversal check              |
| Create | `artifact-file/src/utils.ts`                           | Atomic writes, file locking, MIME detection, UUID, sidecar IO, isGreppable |
| Create | `artifact-file/src/__tests__/artifact-service.test.ts` | Unit tests: publish, query, grep, lifecycle, references                    |
| Create | `packages/core/src/artifact-prompt.ts`                 | `buildArtifactLayer()` + `buildOrchestratorArtifactSection()`              |
| Modify | `packages/core/src/prompt-builder.ts`                  | Add `artifactContext` to `PromptBuildConfig`, call Layer 5                 |
| Modify | `packages/core/src/orchestrator-prompt.ts`             | Append artifact section when initialized                                   |
| Modify | `packages/core/src/session-manager.ts`                 | Init artifacts on spawn, set `AO_ARTIFACTS_DIR` + `AO_ISSUE_ID` env vars   |
| Modify | `packages/core/src/lifecycle-manager.ts`               | Auto-publish PR reference artifact when new PR detected for a session      |
| Create | `packages/cli/src/commands/artifact.ts`                | Artifact CLI commands                                                      |
| Modify | `packages/cli/src/index.ts`                            | Register `ao artifact` subcommands                                         |

**Exit criteria:**

- Spawn a session → `artifacts/` directory created with `manifest.json`. Layer 5 prompt includes artifact count summary.
- `ao artifact publish ./screenshot.png --category other` (from within a session) → `--session` and `--issue` auto-detected from env vars. File copied to `artifacts/ao-1/screenshot.png`, sidecar `screenshot.png.meta.json` written, entry in manifest. Session metadata updated with `artifactCount` and `artifactLastAt`.
- Agent creates a PR → lifecycle manager auto-publishes a PR reference artifact (no agent action needed).
- `ao artifact publish ./design-doc.md --category document` → file copied, sidecar written, entry in manifest.
- `ao artifact publish .env` → **rejected** (sensitive file guard).
- `ao artifact publish /etc/passwd` → **rejected** (path traversal guard).
- Two agents publishing concurrently → both entries appear in manifest (file lock prevents data loss).
- `ao artifact list` returns all non-deleted artifacts. `--session`, `--issue`, `--include-deleted` filters work.
- `ao artifact read <id>` prints text content to stdout.
- `ao artifact grep "payment"` returns matching lines across text-based artifacts only (skips binary, deleted, references).
- `ao artifact summary --session ao-1` → "ao-1: 4 artifacts (1 pr, 2 documents, 1 test-report). Last: 2h ago."
- `ao artifact update <id> --status verified` updates lifecycle status.
- `ao artifact stats` shows active vs deleted counts and sizes.
- `ao artifact list --project my-project` works from a human terminal without `AO_ARTIFACTS_DIR`.
- Delete `manifest.json` → next read operation rebuilds from sidecar `.meta.json` files. Also rebuilt explicitly on `ao start`.

---

## 6. Deferred Phases (Post-MVP)

### Phase 2 — Planning System

**Goal:** Add structured planning on top of artifacts — project definition, phase management, state derivation, decisions tracking.

**Key features:**

- `planning/` directory with PROJECT.md, STATE.md, DECISIONS.md, phases/, research/
- State derivation from file tree (rebuildState on session exit)
- Phase management (create, list, status tracking)
- DecisionService for architectural decisions
- Planning prompt layer injecting STATE.md + PROJECT.md into agent context

### Phase 3 — Knowledge Management

**Goal:** If the artifact-based approach proves insufficient for persisting discrete facts, add a structured knowledge layer with per-session writes, merge-on-exit, dedup, and confidence scoring.

### Phase 4 — Orchestrator Integration

**Goal:** Orchestrator queries artifacts for routing and verification. Event system for real-time notifications.

### Phase 5 — Dashboard + API

**Goal:** REST API + web dashboard for artifact browsing and project state.

### Known Limitations

- **Manifest grows unbounded.** Over months of use, `manifest.json` accumulates thousands of entries including tombstoned deletes. Every `list()` and `grep()` reads the entire file. When this becomes a problem: archive old entries to `manifest.archive.json`, or split into per-session manifests merged on read.

### Future Enhancements

- **Content search index:** Pre-built index for `ao artifact grep` if direct file reads become slow at scale (1000+ artifacts).
- **`--with-context` flag on `ao spawn`:** Inline specific artifacts into the agent's prompt at spawn time.
- **Bulk artifact cleanup:** `--older-than`, `--status`, `--dry-run` flags.
- **XLSX/DOCX text extraction:** Extract text from binary formats for grep.

---

## Appendix — Design Decisions

### Decision 1: Artifacts as the Primary Persistence Mechanism

**Problem:** How should agents persist outputs (docs, findings, lessons) across sessions?

**Decision:** All agent outputs are artifacts. There is no separate knowledge system, no planning state, no merge pipeline. Agents publish files via `ao artifact publish`. Other agents discover them via `ao artifact list/grep/read`.

**Why:** A single system (publish → manifest → query) is simpler than multiple parallel persistence systems. The artifact CLI + manifest covers the three core needs: publish, discover, load. If structured knowledge or planning state is needed later, it can be layered on top.

### Decision 2: Context Discovery Strategy

**Problem:** How should agents access artifacts from previous sessions?

**Decision:** On-demand discovery.

On spawn, the agent's prompt includes artifact CLI commands (Layer 5 in `buildPrompt()`). The agent uses `ao artifact list`, `ao artifact grep`, and `ao artifact read` during its session to find and load relevant context. The orchestrator can hint what to read via the spawn prompt (e.g., `--prompt "Check artifacts from session ao-5"`).

**Why not preload:** Wastes tokens on context the agent may not need. A bug fix session doesn't need every previous artifact. Let the agent discover what's relevant.

**Open question:** If agents consistently miss relevant artifacts, consider adding `--with-context artifact:ao-5` to `ao spawn` to inline specific artifacts into the prompt.

### Decision 3: Issue-Scoped Artifacts (inspired by Paperclip)

**Problem:** Multiple sessions may work on the same issue (e.g., session ao-5 starts INT-42, gets stuck, session ao-8 continues it). How do you find all artifacts for an issue across sessions?

**Decision:** Add optional `issueId` to `ArtifactEntry`. Auto-populated from `AO_ISSUE_ID` env var (set at spawn time from the issue context). Enables `ao artifact list --issue INT-42` to find all artifacts across all sessions that worked on that issue.

**Why:** Session-scoped queries (`--session ao-5`) require knowing which session worked on what. Issue-scoped queries (`--issue INT-42`) are the natural question: "what was produced for this task?" This pattern is borrowed from [Paperclip](https://github.com/paperclipai/paperclip), which links documents to issues via a join table. We achieve the same with a simple field on the entry — no join table needed.

**What we didn't copy from Paperclip:**

- PostgreSQL storage — filesystem + manifest is simpler for single-machine AO
- Session compaction policies — Claude Code handles its own context window
- API callback pattern — CLI is simpler and doesn't require a running server
- Document revision system — artifacts are mostly write-once at MVP; conflict detection can be added later if needed

### Decision 4: No Separate Search Index

**Problem:** How should `ao artifact grep` work?

**Decision:** Read files directly from disk. `grep()` reads the manifest to get the list of text artifacts, then reads each file and regex matches.

**Why:** At MVP scale (tens to hundreds of artifacts), direct file reads are fast enough (~100ms for 100 files). A pre-built search index (JSONL, SQLite, etc.) adds complexity for an optimization that isn't needed yet.

**Post-MVP:** If grep becomes slow at scale (1000+ artifacts), add a content index.

---

## MVP Phase Summary

| Phase                   | Duration | Key Deliverable                                                      | Depends On |
| ----------------------- | -------- | -------------------------------------------------------------------- | ---------- |
| **0: Foundation**       | 1 day    | Types, interfaces, plugin scaffold, config                           | Nothing    |
| **1: Artifact Service** | 3-4 days | File-based ArtifactService (publish, query, grep), prompt layer, CLI | Phase 0    |

**Total MVP: ~4-5 days**

```
Phase 0 ──→ Phase 1
```
