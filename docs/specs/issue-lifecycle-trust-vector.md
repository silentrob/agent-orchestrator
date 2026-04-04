# Issue lifecycle and Trust Vector

## Brief

**Status:** Proposal (0004)  
**Date:** 2026-04-02  
**Related:** [Feature plan 0004](../../cursor/features/0004_PLAN.md), `role-typed-artifacts.md` (artifact semantics), `issue-lifecycle-state-persistence.md` (storage sketch)

---

## 1. Purpose

Define the **issue-centric** collaboration model for Agent Orchestrator: a tracker **issue** plus (typically) **one git worktree / branch** moves through **phases** (Plan → Execute → Validate, with an optional pre-Plan **Reproducer**). Advancement is gated by a **Trust Vector** — discrete **policy checks** — rather than by chaining unrelated **sessions** as the primary abstraction.

This document is the **north-star spec** for that model. It **supersedes** the **0003** direction where handoff was framed as: separate planner session → durable snapshot → executor spawn with copied plan text. That pipeline remains a **possible deployment** of artifacts, but it is **not** the defining product shape for 0004. See §5.

---

## 2. Unit of work

| Concept      | Meaning                                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Issue**    | Tracker id (e.g. `INT-1234`) — the stable handle for human and machine policy.                                                                                                                                       |
| **Worktree** | One checkout + branch for delivery of that issue, unless explicitly scaled out (parallel experiments are optional).                                                                                                  |
| **Session**  | AO **runtime** (tmux/agent) attached to work — an implementation detail. One long-lived **issue worker** may advance through **phases** in place; separate sessions are for scale-out, not the default mental model. |

---

## 3. Phases (happy path)

Phases align with **role-typed artifact semantics** in `docs/specs/role-typed-artifacts.md` (planner / executor / validator kinds) but **do not** require one OS session per role.

| Phase                       | Intent                       | Typical artifact kinds (role-typed)             | Gate before next phase (examples)                            |
| --------------------------- | ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| **Reproducer** _(optional)_ | Prove bug, capture baseline  | `repro-steps`, `failing-test`, `screenshot`, …  | Policy: evidence sufficient for planning                     |
| **Plan**                    | Intent, scope, risks, deltas | `plan`, `decision`, `research`, `risk`          | Human approval, or `requires_approval: false` + auto-advance |
| **Execute**                 | Implementation, tests, PR    | `implementation-note`, `diff-summary`, PR ref   | PR exists; CI green or waived                                |
| **Validate**                | Verification, sign-off       | `test-report`, `verification`, `review-summary` | Validator pass; optional human                               |

Exact phase names and transitions may be refined in core types (`IssueWorkflowPhase` — see tasks) and persistence sketch.

---

## 4. Trust Vector

**Trust Vector** = the ordered set of **checks** that must **pass** to **advance** an issue to the next phase (or to treat an artifact as authoritative). Gates are **discrete**; between them the workflow may **pause** (e.g. `awaiting_approval`, CI pending).

**Examples (not exhaustive):**

| Kind        | Description                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| **Human**   | Approve plan, request changes, approve merge — framed as **gates on the issue**, not only on a “planner session id”. |
| **Machine** | CI status, required checks, presence of required artifacts (e.g. plan document exists before execute).               |
| **Config**  | Per-project policy (mandatory validator, who may waive a gate) — future **policy engine** alignment.                 |

Implementation details (metadata keys, issue index files) live in `issue-lifecycle-state-persistence.md`.

---

## 5. Relation to 0003 (supersession)

Feature **0003** emphasized:

- Planner **session** as owner of approve/request-changes UX keyed by session id
- **Durable snapshot** + **executor** fed by `--prompt` / path in a **new** worktree

Feature **0004** treats that as **one possible integration pattern**, not the primary user model. The **north star** is:

- **Gates on the issue** and **phase** in a **shared worktree** by default
- **Executor** / **validator** as **phases** (permissions + prompts), not necessarily **new spawns**
- **Trust Vector** as first-class policy, not only metadata mirrors on a planner row

Reverted or unmerged 0003 APIs are **not** assumed present on branches that only ship 0004 docs/types until explicitly reintroduced.

---

## 6. Relation to role-typed artifacts

`role-typed-artifacts.md` defines **contracts**: which **artifact kinds** each **role** may produce. In 0004, interpret **role** as **phase-local responsibility** on a **single collaboration surface** unless you explicitly scale out. Prompt layers (L4.5x) attach to **phase**, not only to “spawn three sessions.”

---

## 7. Out of scope (this document)

- Concrete **API routes**, **CLI** commands, or **dashboard** layouts
- **Guaranteed** LLM adherence (policy + UX only)
- Full **v5** artifact manifest implementation

---

_Document version: 1.0_
