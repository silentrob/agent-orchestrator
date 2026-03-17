# Tracker: Disk (file-based)

A tracker plugin that uses **markdown files with YAML front-matter** on disk instead of an external API. The orchestrator "polls" by reading the filesystem when it needs issue state (e.g. `listIssues`, `getIssue`, `isCompleted`).

## Use cases

- Local-only or air-gapped workflows
- Simple backlogs in the repo (e.g. `issues/` or `.ao/issues/`)
- No dependency on GitHub/Linear/Jira; edit issues in your editor or via scripts
- Easy to version-control and diff

## Issue format

Each issue is a single markdown file. Identifier is the **filename without extension** (e.g. `42`, `feat-auth`, `INT-001`).

```markdown
---
title: Add user authentication
state: open
labels: [backend, p0]
assignee: alice
priority: 1
---

## Description

Implement login and signup with email/password and OAuth.
```

### Front-matter fields

| Field       | Type     | Required | Description |
|------------|----------|----------|-------------|
| `title`    | string   | yes      | Issue title |
| `state`    | string   | no       | `open`, `in_progress`, `closed`, `cancelled` (default: `open`) |
| `labels`   | string[] | no       | Labels/tags |
| `assignee` | string   | no       | Assignee identifier |
| `priority` | number   | no       | Numeric priority |

The **body** of the file (below the front-matter) is the issue description. No need to duplicate it in front-matter.

### Labels (orchestrator semantics)

Use the **same label names** as GitHub so the backlog poller, dashboard, and verify flow work correctly. The orchestrator is tracker-agnostic and passes these strings to any tracker:

| Label                 | Purpose |
|-----------------------|--------|
| `agent:backlog`       | Available for the agent to claim (backlog poll lists these) |
| `agent:in-progress`   | Agent is working on this (set when a session is spawned) |
| `agent:blocked`        | Agent is blocked |
| `agent:done`          | Agent completed this |
| `merged-unverified`   | PR merged; awaiting human verification on staging |
| `verified`            | Verification passed (with `ao verify`) |
| `verification-failed` | Verification failed (with `ao verify --fail`) |

Example issue the backlog will pick up:

```markdown
---
title: Add disk tracker to README
state: open
labels: [agent:backlog, docs]
---
```

You do **not** run "Setup labels" for the disk tracker (that API creates GitHub labels via `gh`). For disk, you just add these label strings in front-matter when editing issue files.

## Project config

Use the existing `tracker` slot with plugin `disk` and an optional directory:

```yaml
# agent-orchestrator.yaml (project section)
tracker:
  plugin: disk
  # Optional: directory relative to project path (default: ".ao/issues")
  issuesDir: issues
```

- Issues directory is `{project.path}/{issuesDir}`.
- Default `issuesDir` is `.ao/issues` so it can be kept out of the main tree or committed.

## Polling

There is no background daemon. "Polling" means:

- Whenever the core calls `getIssue`, `listIssues`, or `isCompleted`, the plugin reads from disk.
- So the orchestrator/session-manager naturally sees up-to-date state each time it queries.

Optional future: file watcher to invalidate caches or emit events; for many workflows, read-on-demand is enough.

## Tracker interface mapping

| Method         | Implementation |
|----------------|----------------|
| `getIssue`     | Read one file by id (filename), parse front-matter + body |
| `isCompleted`  | Read file, check `state === 'closed' \|\| state === 'cancelled'` |
| `issueUrl`     | `file://` path or relative path to the markdown file |
| `issueLabel`   | Return the issue id (e.g. filename) |
| `branchName`   | `feat/issue-{id}` (sanitize id for branch rules) |
| `generatePrompt` | Build prompt from title + description + labels |
| `listIssues`   | List `*.md` in issues dir, parse each, apply filters (state, labels, limit) |
| `updateIssue`  | Read file, update front-matter/body, write back |
| `createIssue`  | Create new `.md` file with next id or given id |

## File naming

- One issue per file: `{id}.md`.
- Id can be numeric (`42.md`) or slug (`feat-auth.md`). No spaces; safe for branches and URLs.
- `listIssues` discovers issues by glob `*.md`; the id is the basename without extension.

## Implementation notes

- Use a simple front-matter parser (e.g. strip between first `---` and second `---`, then parse YAML) or a small dependency like `gray-matter` if preferred.
- Write back with consistent formatting so diffs stay readable.
- Concurrent writes: last-write-wins; optional locking or "conflict" detection can be added later.
