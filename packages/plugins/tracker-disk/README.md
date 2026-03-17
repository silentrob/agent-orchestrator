# tracker-disk

Tracker plugin that uses **markdown files with YAML front-matter** on disk. No external API — the orchestrator polls by reading the filesystem when it needs issue state.

## Config

In your project config (e.g. `agent-orchestrator.yaml`):

```yaml
tracker:
  plugin: disk
  issuesDir: .ao/issues   # optional; default is ".ao/issues"
```

Issues live under `{project.path}/{issuesDir}/` as one file per issue: `{id}.md`.

## Issue format

Each issue is a single markdown file. The **id** is the filename without `.md` (e.g. `42`, `feat-auth`).

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

Supported front-matter: `title`, `state` (`open` | `in_progress` | `closed` | `cancelled`), `labels`, `assignee`, `priority`. The body is the issue description.

## Design

See [docs/plugins/tracker-disk.md](../../../docs/plugins/tracker-disk.md) for the full design and interface mapping.
