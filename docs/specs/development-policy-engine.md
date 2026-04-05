# Development Policy Engine (DPE)

**Status:** Draft  
**Author:** Rob
**Date:** 2026-03-24  
**Target Merge:** TBD

---

## Overview

This spec proposes a **Development Policy Engine (DPE)** for `agent-orchestrator`: a plugin-native policy layer that enforces repo discipline and phase-aware risk controls for agent-driven work.

Today the system is strong at orchestration (spawn, runtime, workspace, tracker, scm, lifecycle), but weak at risk governance. A task in a prototype app and a task in a production service are treated with roughly the same behavioral freedom. DPE closes that gap without introducing a heavyweight control plane.

**Key change:** introduce policy evaluation between orchestration intent and repository mutation:

```
Agent intent -> Policy Engine -> Workspace/SCM execution
```

---

## Problem Statement

Current AO behavior can lead to "chaos with good intentions":

1. **Uniform behavior across project maturity** — no built-in difference between prototype vs production guardrails.
2. **Silent impact risk** — breaking or large-surface changes can proceed without explicit declaration.
3. **Inconsistent repo discipline** — no first-class enforcement for branch/worktree isolation by policy.
4. **Weak merge governance** — auto-merge decisions are event/reaction driven, but not policy-aware.

AO already has the right execution primitives (worktrees, sessions, SCM checks, lifecycle reactions). DPE composes on top of those primitives to enforce explicit constraints.

---

## Goals

- Enforce git-isolated execution (branch/worktree policy).
- Require explicit version impact metadata for task execution.
- Make controls phase-aware (`prototype`, `beta`, `production`, `maintenance`).
- Add deterministic policy gates at spawn and merge points.
- Keep the implementation plugin-native and lightweight (no DB, no new service).

### Non-Goals

- Not a planning/work graph system.
- Not a replacement for CI/CD.
- Not a replacement for tracker workflows.
- Not full multi-agent resource leasing.

---

## Product Shape

### Working Name

**Development Policy Engine (DPE)**

### Type

Plugin for `agent-orchestrator` with a new `policy` slot in core types.

### Core Promise

Give agent-driven development "senior-engineer guardrails" by default, while staying composable with existing AO plugins.

---

## Current State (Architecture Constraints)

Grounded in current codebase behavior:

- Plugin slots are fixed (`runtime`, `agent`, `workspace`, `tracker`, `scm`, `notifier`, `terminal`).
- There is no generic `PluginContext` or policy hook bus.
- `SessionManager.spawn()` is the primary pre-execution choke point.
- `LifecycleManager` drives event/reaction automation (including merge-related behavior).
- SCM plugin (`scm-github`) already exposes mergeability, CI, and review state primitives.
- Worktree isolation exists via `workspace-worktree` plugin but is not policy-mandated.

Implication: DPE needs either:

1. A new **`policy` plugin slot** (recommended), or
2. New ad-hoc hook surfaces added into existing managers.

This spec assumes option (1).

---

## Proposed Architecture

## 1. New Plugin Slot

Add `policy` to `PluginSlot` and register it through plugin registry builtins.

```ts
type PluginSlot =
  | "runtime"
  | "agent"
  | "workspace"
  | "tracker"
  | "scm"
  | "notifier"
  | "terminal"
  | "policy";
```

## 2. Policy Plugin Interface

```ts
export interface Policy {
  getPolicy(projectPath: string): Promise<DevelopmentPolicy>;

  onSpawn(
    task: SessionSpawnConfig,
    project: ProjectConfig,
    sessionDraft: Partial<SessionMetadata>,
  ): Promise<PolicySpawnResult>;

  onMergeAttempt(session: Session, mergeContext: PolicyMergeContext): Promise<PolicyMergeResult>;

  buildPolicyPromptSection(policy: DevelopmentPolicy, task: SessionSpawnConfig): string;
}
```

## 3. Integration Points

### Spawn Gate (`SessionManager.spawn()`)

- Call `policy.onSpawn(...)` before workspace creation.
- If blocked in strict mode, abort spawn with actionable violation output.
- If warning-only mode, continue and annotate metadata.

### Prompt Injection (`buildPrompt`)

- Add policy section to worker prompt so agent behavior aligns with enforced constraints.

### Merge Gate (`LifecycleManager` + merge path)

- Before auto-merge (and any orchestrated merge action), call `policy.onMergeAttempt(...)`.
- Block merge when policy conditions fail (e.g., missing approval, diff too large).

---

## Policy Model

## 1. Project Phase

```ts
type ProjectPhase = "prototype" | "beta" | "production" | "maintenance";
```

Phase controls strictness defaults; explicit policy values can override phase defaults.

## 2. Version Impact

```ts
type VersionImpact = {
  bump: "none" | "patch" | "minor" | "major";
  breaking: boolean;
  rationale: string;
};
```

Execution policy:

- Missing declaration -> block or warn based on strictness.
- Major + protected phase (`production`/`maintenance`) -> requires approval.

## 3. Development Policy Schema

```ts
interface DevelopmentPolicy {
  phase: ProjectPhase;

  git: {
    requireBranch: boolean;
    allowDirectMain: boolean;
    useWorktrees: boolean;
    branchPrefix?: string;
  };

  versioning: {
    requireDeclaration: boolean;
    requireApprovalForMajor: boolean;
  };

  constraints: {
    maxFilesChanged?: number;
    maxDiffSize?: number;
    enforceAllowedSurfaces: boolean;
    allowedPaths?: string[];
    deniedPaths?: string[];
  };

  gates: {
    preExecution: boolean;
    preMerge: boolean;
    requireCIGreen?: boolean;
    requireReviewApproval?: boolean;
  };

  evaluation: {
    strictMode: boolean;
    logViolations: boolean;
  };
}
```

---

## Policy Evaluation Lifecycle

## 1. Pre-Execution Gate

Checks before workspace/runtime creation:

- branch/worktree policy compliance
- version impact declaration present
- file-surface scope metadata (if enabled)

Outputs:

- `allowed: true` with warnings, or
- `allowed: false` with machine-readable violations

## 2. During Execution (MVP + Future)

MVP:

- prompt-level enforcement and metadata tracking only

Future:

- optional hard enforcement via agent/workspace hooks (deny writes outside surface)

## 3. Pre-Merge Gate

Checks before merge actions:

- diff size and file count thresholds
- version impact vs phase policy
- CI/review requirements

---

## Git Strategy

Opinionated default:

```
main
└── feat/<feature-id>
    └── task execution in isolated worktree(s)
```

Why this default:

- preserves execution isolation
- avoids branch explosion
- keeps merge workflow straightforward

---

## Configuration

Repo-local policy source of truth:

`.agent/policy.json`

```json
{
  "phase": "production",
  "git": {
    "requireBranch": true,
    "allowDirectMain": false,
    "useWorktrees": true
  },
  "versioning": {
    "requireDeclaration": true,
    "requireApprovalForMajor": true
  },
  "constraints": {
    "maxFilesChanged": 10,
    "enforceAllowedSurfaces": true
  },
  "gates": {
    "preExecution": true,
    "preMerge": true,
    "requireCIGreen": true,
    "requireReviewApproval": true
  },
  "evaluation": {
    "strictMode": true,
    "logViolations": true
  }
}
```

Optional AO-level defaults/overrides can be layered via `agent-orchestrator.yaml` once schema support is added.

---

## Example Flow

1. Task arrives with issue context and `versionImpact`.
2. DPE validates policy at spawn gate.
3. AO creates feature branch + worktree.
4. Agent executes with explicit policy context in prompt.
5. DPE validates merge gate against diff/CI/reviews.
6. Merge allowed or blocked with actionable reasons.

---

## Delivery Plan

## Phase 1 (MVP)

- Add `policy` slot + core wiring.
- Implement DPE plugin package with spawn gate.
- Support `.agent/policy.json` loading + validation.
- Prompt injection with effective policy summary.
- Violation reporting in spawn errors.

## Phase 2

- Merge gate integration with lifecycle auto-merge path.
- Session metadata logging for policy violations.
- Status/dashboard surfacing of policy failures.

## Phase 3

- Allowed-surface hard enforcement hooks.
- Per-task override semantics (with escalation rules).
- Optional approvals workflow integration.

---

## Acceptance Criteria

- [ ] A project can define `.agent/policy.json` and AO loads it for new sessions.
- [ ] Spawn is blocked when required version impact declaration is missing (strict mode).
- [ ] Spawn is blocked when direct-main execution is disallowed and target branch violates policy.
- [ ] Prompt contains a generated "Development Policy" section.
- [ ] Auto-merge path consults policy gate before merging.
- [ ] Violations include machine-readable rule identifiers and human-readable remediation.

---

## Risks and Mitigations

| Risk                                               | Impact | Mitigation                                                   |
| -------------------------------------------------- | ------ | ------------------------------------------------------------ |
| New plugin slot increases core surface area        | Medium | Keep interface narrow and additive                           |
| Policy false positives block valid work            | High   | strict/warn modes, clear error messages, incremental rollout |
| Config sprawl between AO YAML and repo policy file | Medium | define precedence order and document it                      |
| Runtime enforcement complexity (allowed surfaces)  | Medium | ship prompt-level first, hard enforcement later              |

---

## Open Questions

1. Should DPE be a new slot (`policy`) or a cross-manager hook framework?
2. Where should task-level `versionImpact` live in existing spawn/decompose payloads?
3. Should merge gate block only auto-merge or all orchestrated merge attempts?
4. What is precedence between AO config policy overrides and `.agent/policy.json`?
5. Should missing policy file default to permissive, warning, or strict block?
6. Do we want phase presets baked into core, plugin, or config examples only?

---

## Positioning

If AO is the execution engine, DPE is the governor:

> A policy layer that makes agent-driven development behave like a disciplined senior engineer.
