# Issue lifecycle state persistence (sketch)

## Brief

**Status:** Proposal (design only)  
**Date:** 2026-04-02  
**Related:** [`issue-lifecycle-trust-vector.md`](./issue-lifecycle-trust-vector.md), [`packages/core/src/types.ts`](../../packages/core/src/types.ts) (`Session`)

---

## Purpose

Sketch **where** issue **phase** (Plan → Execute → Validate, …) and **Trust Vector** **gate** completion might be stored. This is **not** a commitment to a single implementation or one PR — it informs [`0004_PLAN.md`](../../cursor/features/0004_PLAN.md) follow-up work.

---

## Candidate 1: Session metadata (flat key–value)

AO already persists per-session rows as **key=value** files under the project sessions directory. The **`Session`** type exposes **`metadata: Record<string, string>`** in core (`packages/core/src/types.ts`).

**Idea:** Mirror issue phase and last-satisfied gates on the **primary issue worker** session, e.g. `issuePhase=plan`, `gatePlanApproved=1`, or compact JSON in one key if needed later.

| Pros                                                                        | Cons                                                                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Reuses existing **`updateMetadata`** / read paths; no new storage subsystem | Tied to **session id**; if the session is killed and metadata archived, issue state may need **reconciliation** by `issueId` |
| Works with dashboard and CLI that already list sessions                     | Multiple sessions for the same issue (scale-out) → **which row is canonical** must be defined                                |
| String values match today’s flat format                                     | Heavy structured state may be awkward without JSON blobs or namespaced keys                                                  |

---

## Candidate 2: Issue-index file (JSON or key–value) under project AO dir

**Idea:** A file keyed by **`projectId` + `issueId`** (e.g. `issues/<sanitized-issue-id>/state.json` next to `sessions/` / `worktrees/`) holding phase, gate vector, timestamps, optional pointer to primary `sessionId`.

| Pros                                                 | Cons                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Issue-first**: survives arbitrary session churn    | New read/write helpers, migration, and **locking** if concurrent writers                       |
| Single canonical row per issue                       | Duplication risk if metadata **also** mirrors the same fields                                  |
| Fits “where is this issue?” without hunting sessions | Path hygiene and **sanitized issue id** rules (align with branch slug / existing path helpers) |

---

## Candidate 3 (optional): Tracker labels / custom fields

**Idea:** Push phase or coarse gate state to GitHub / Linear / GitLab via existing tracker plugins.

| Pros                                       | Cons                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| Visible in **tracker UI**; good for humans | Rate limits, **eventual consistency**, not all trackers support rich fields |
| Survives AO reinstall if issue is remote   | **Not** authoritative for low-level AO policy unless synced carefully       |

---

## Recommendation (non-binding)

- **Short term:** Prototype with **session metadata** on a single **canonical** issue session (document how that session is chosen), plus optional **issue-index** for durability if sessions are ephemeral.
- **Trust gates (implemented — plan 0006 MVP):** Option **A** uses **flat session metadata** with one key per `TrustGateKind`, derived in code by `trustGateMetadataKey()` (e.g. `ci_passing` → `trustGateCiPassing`). Stored values are satisfaction strings (`satisfied` \| `pending` \| `failed`). Canonical definitions and the full key map live in [`packages/core/src/issue-lifecycle-gates.ts`](../../packages/core/src/issue-lifecycle-gates.ts) (re-exported from `@composio/ao-core`). The MVP slice includes gates such as **`artifact_plan_present`**, **`human_plan_approval`**, and **`ci_passing`** (see `issue-lifecycle-trust-vector.md` and plan `0006`). Option **B** (a single serialized `trustGateVector` JSON string) remains deferred.
- **Trust gates** beyond that MVP remain representable as the same **namespaced keys** or a single serialized structure if policy later requires it.

---

## Out of scope (this document)

- Schema versioning, migrations, or APIs
- Dashboard / CLI surfaces

---

_Document version: 1.1 — Recommendation updated for 0006 Option A implementation._
