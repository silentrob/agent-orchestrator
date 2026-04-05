# AGENTS.md

> Full project context, architecture, conventions, and plugin standards are in **CLAUDE.md**.

## Commands

```bash
pnpm install                            # Install dependencies
pnpm build                              # Build all packages
pnpm dev                                # Web dashboard dev server (Next.js + 2 WS servers)
pnpm typecheck                          # Type check all packages
pnpm test                               # All tests (excludes web)
pnpm --filter @composio/ao-web test     # Web tests
pnpm lint                               # ESLint check
pnpm lint:fix                           # ESLint fix
pnpm format                             # Prettier format
```

## CLI: planner plan workflow

- **`ao plan approve <session>`** — Marks the session plan file (default `.ao/plan.md`, or `planArtifactRelPath` in metadata) as human-approved by updating YAML frontmatter (`status: approved`).
- **`ao plan send <session> [message…]`** — Same delivery path as **`ao send`**; use for feedback to a planner session under the `plan` subcommand.

## CLI: issue workflow phase (advance)

- **`ao spawn`** creates a **new** worker session (metadata sets initial `issueWorkflowPhase` when an issue is present).
- **`ao session advance <session> --phase <phase>`** moves the **same** session to a target workflow phase when Trust Vector gates allow it (see `requireIssueLifecycleGates`); it updates metadata and sends composed prompt guidance like a fresh prompt for that phase.
- Use **`ao status`** (table **Advance** column or JSON `advanceBlocked`) to see what would block the next canonical phase transition without running advance.
- Design notes: `cursor/features/0008_PLAN.md`.

## Architecture TL;DR

Monorepo (pnpm) with packages: `core`, `cli`, `web`, and `plugins/*`. The web dashboard is a Next.js 15 app (App Router) with React 19 and Tailwind CSS v4. Data flows from `agent-orchestrator.yaml` through core's `loadConfig()` to API routes, served via SSR and a 5s-interval SSE stream. Terminal sessions use WebSocket connections to tmux PTYs. See CLAUDE.md for the full plugin architecture (8 slots), session lifecycle, and data flow.

## Config: issue lifecycle (optional)

Per project, `requireIssueLifecycleGates` (boolean, default off): when `true`, worker spawns that resolve to the **execute** phase with an `issueId` are rejected until Trust Vector gate satisfaction is persisted in metadata. Until gate writers exist, leave this disabled or use non-executor worker roles. See `docs/specs/issue-lifecycle-trust-vector.md`.

## Key Files

- `packages/core/src/types.ts` — All plugin interfaces (Agent, Runtime, Workspace, etc.)
- `packages/core/src/session-manager.ts` — Session CRUD
- `packages/core/src/lifecycle-manager.ts` — State machine + polling loop
- `packages/web/src/components/Dashboard.tsx` — Main dashboard view
- `packages/web/src/components/SessionDetail.tsx` — Session detail view
- `packages/web/src/app/globals.css` — Design tokens
