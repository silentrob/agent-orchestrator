# Plan approval and orchestrator handoff

## Brief

**Status:** Proposal (historical + errata)  
**Date:** 2026-04-02  
**Related:** [`issue-lifecycle-trust-vector.md`](./issue-lifecycle-trust-vector.md), [`role-typed-artifacts.md`](./role-typed-artifacts.md), [Feature plan 0004](../../cursor/features/0004_PLAN.md)

---

## Errata / Supersession (0004)

Feature **0003** described a **session-centric** handoff: a **planner** session owning approve/request-changes UX keyed by **session id**, **durable snapshots** under the AO project dir, **metadata mirrors** on that session, **POST** routes for approve/request-changes, and **executor** spawn fed by **`--prompt`** / path from a **new** worktree.

**0004 supersedes that handoff as the product north star.** Trust and progression are modeled as **issue-centric phases** and a **Trust Vector** (policy gates), not as “spawn planner → snapshot → spawn executor” as the default story. See [`issue-lifecycle-trust-vector.md`](./issue-lifecycle-trust-vector.md) and [`0004_PLAN.md`](../../cursor/features/0004_PLAN.md).

**Branches that reverted 0003** do **not** ship those HTTP APIs or snapshot writers unless they are **reintroduced** intentionally. This document is retained so **still-valid ideas** (below) remain discoverable without implying current code exists.

### What remains useful (implementation-agnostic)

- **Plan as a file** (e.g. `.ao/plan.md`) with **YAML frontmatter** (`status`, `requires_approval`, optional `approved_at` / `approved_by`) as a human- and machine-readable **plan artifact**.
- **Orchestrator** needing a **machine-readable** signal that a plan is “ready for execution” — in 0004 this becomes **gate state** on the **issue**, not only metadata on a single session row.
- **Durability** of an approved plan across session teardown may still matter; 0004 does not forbid snapshots — it reframes them as **optional persistence**, not the primary collaboration model.

### Navigation

| Topic                       | Canonical spec (0004)                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| Phases, gates, Trust Vector | [`issue-lifecycle-trust-vector.md`](./issue-lifecycle-trust-vector.md) |
| Role semantics vs phases    | [`role-typed-artifacts.md`](./role-typed-artifacts.md) §8              |

---

## Historical note (0003 shape — not current contract)

The following bullets summarized the **pre-0004** integration pattern; they are **not** a commitment to APIs on any given branch.

- Human **approve** / **request changes** could update worktree `.ao/plan.md` frontmatter and write a **durable issue-scoped snapshot** so the plan survives planner teardown.
- **Orchestrator** could read **session metadata** (`planApprovalStatus`, …) and/or **GET** plan by **project + issue** after the planner session is gone.
- **Executor** could receive approved plan text via **`ao spawn … --prompt`** or env pointing at a snapshot path.

If these flows return in code, update this document and cross-link routes from `packages/web` / `packages/core` explicitly.

---

_Document version: 2.0 (0004 errata)_
