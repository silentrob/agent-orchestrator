# Role-Typed Artifacts and Prompt Layers

## Brief Spec

**Status:** Proposal  
**Date:** 2026-04-02  
**Related:** [`issue-lifecycle-trust-vector.md`](./issue-lifecycle-trust-vector.md) (issue-centric phases + Trust Vector — **0004**), `planning-artifact-persistence-v5.md` (Session Artifacts — generic model)

---

## 1. Problem

The generic artifact proposal treats every worker as a symmetric “publisher” of arbitrary categories (`document`, `test-report`, `pr`, …). That pushes policy, discovery hints, and guardrails into a single **Layer 5** on `buildPrompt()`, which risks making the prompt builder a catch-all and leaves the orchestrator without a clear **contract** for who produces what.

We want **predictable handoffs**: planning outputs feed execution; execution outputs feed validation; validators do not silently become implementers.

---

## 2. Approach

Introduce **explicit worker roles** (not arbitrary agent personalities). Each role has a **narrow artifact contract** and a **dedicated prompt layer**. Shared storage (manifest, sidecars, CLI) can stay close to v5, but **metadata and enforcement** are role-first.

### 2.1 Roles (MVP)

| Role                        | Primary responsibility                                  | May produce (artifact kinds)                                        | Must not                                                                    |
| --------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Planner**                 | Decompose, decide, document intent                      | `plan`, `decision`, `research`, `risk`                              | Land production code, open implementation PRs as “the worker”               |
| **Executor**                | Implement, test locally, open PR                        | `implementation-note`, `pr-ref` (or auto), `diff-summary`           | Replace approved plan without explicit override                             |
| **Validator**               | Verify behavior, CI interpretation, sign-off            | `test-report`, `verification`, `review-summary`                     | Broad feature implementation                                                |
| **Reproducer** _(optional)_ | Prove the bug exists **before** a plan commits to a fix | `repro-steps`, `failing-test`, `screenshot`, `baseline-observation` | Propose architecture or land non-test product changes intended as “the fix” |

**Reproducer** is an edge-case role for **debugging existing code**: validate the issue, add a **failing test** (red), and/or capture **evidence** (e.g. logs, **screenshots** of broken UI) so the Planner never argues from theory alone. It is **pre-Executor** and usually **pre-Planner** when strict verification is required.

Roles are orthogonal to **agent plugin** (Claude Code, Codex, …): the same plugin runs with different `role` and prompt layers.

### 2.2 Artifact kinds (role-scoped enums)

Instead of one flat `ArtifactCategory` for all agents, kinds are **grouped by role**:

- **Planner-only:** `plan`, `decision`, `research`, `risk`
- **Executor-only:** `implementation-note`, `diff-summary` (plus PR auto-publish as today)
- **Validator-only:** `test-report`, `verification`, `review-summary`
- **Reproducer-only:** `repro-steps`, `failing-test`, `screenshot`, `baseline-observation`

**Screenshots:** use `screenshot` with metadata `observationPhase: baseline` (broken / before fix) vs `observationPhase: post-fix` (after Executor change — often produced in a follow-up Validator or Reproducer pass for regression evidence). For **pre-plan** flows, baseline captures are mandatory when screenshots are the proof; post-fix pairs are optional until after implementation.

Cross-role kinds (e.g. `document`) are allowed only when tagged with `producerRole` and validated at publish time.

**Storage-level** entries still carry: `sessionId`, `issueId`, `mimeType`, `category`/`kind`, `producerRole`, optional `inputArtifactIds` (lineage).

### 2.3 Prompt integration (not one generic layer)

- **Keep** `buildPrompt()` base layers (lifecycle, project, rules, decomposition) as they are.
- **Add** small, composable builders, e.g.:
  - `buildPlannerArtifactLayer(ctx)`
  - `buildExecutorArtifactLayer(ctx)`
  - `buildValidatorArtifactLayer(ctx)`
- **Spawn** selects exactly one role layer from `SessionSpawnConfig` (or orchestrator-declared role).
- **Do not** add a single “Layer 5: everything about artifacts” blob for all workers.

Orchestrator prompt gains role-aware hints: “next step is validator; required inputs are plan + PR ref.”

### 2.4 Enforcement

- **Publish path:** `ao artifact publish` (or service) rejects `kind` ∉ allowed set for `producerRole`.
- **Optional:** orchestrator-only spawns for planner/validator to reduce permission surface.

---

## 3. Orchestration Handoff (sketch)

**Default (greenfield or low-risk):**

1. Orchestrator spawns **Planner** for issue → consumes tracker context → publishes `plan` + `decision`.
2. Orchestrator spawns **Executor** with `--prompt` / metadata pointing at plan artifact ids → implements → PR + `implementation-note`.
3. Orchestrator spawns **Validator** with PR + plan refs → publishes `test-report` / `verification`.

**Debug / existing-code (strict pre-plan verification):**

0. Orchestrator spawns **Reproducer** first → publishes `repro-steps`, optional **`failing-test`** (expected red), and/or **`screenshot`** with `observationPhase: baseline` (and logs in `baseline-observation` if needed).
1. **Planner** must consume those artifact ids as inputs; the plan explicitly references the established broken baseline (not a hypothetical).
2. **Executor** implements the fix; may extend or adjust tests as planned.
3. **Validator** confirms green CI / behavior; may attach **`screenshot`** with `observationPhase: post-fix` for UI issues, paired with baseline for human-readable regression proof.

Recovery and learnings (`recovery-context-and-learnings.md`) remain separate: they address crash/coordination memory, not structured multi-role outputs.

### 3.1 Use case summary (pre-plan verify)

| Goal                            | Reproducer output                                          | Why before Planner                                                   |
| ------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Confirm bug is real             | `failing-test` (red), `repro-steps`, `screenshot` baseline | Avoid planning against misunderstood or non-reproducible issues      |
| UI / visual regressions         | Two screenshots (`baseline` → later `post-fix`)            | Planner and Executor align on observable expected change             |
| Flaky or environ-sensitive bugs | `baseline-observation` + repro-steps                       | Captures constraints (flags, data shape) in artifacts, not only chat |

---

## 4. Phasing

| Phase              | Deliverable                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| **0**              | Types: `WorkerRole`, role-scoped `ArtifactKind`, `producerRole` on entries; config on spawn               |
| **1**              | Role-specific prompt layers + publish validation                                                          |
| **2**              | Reuse v5 storage (manifest, sidecars, lock) + CLI filtered by `--role` / `--kind`                         |
| **3**              | Orchestrator prompt templates for handoff (required prior artifacts)                                      |
| **4** _(optional)_ | Reproducer role + kind allow-list; policy flag “require baseline artifacts before plan” per project/issue |

---

## 5. Differences from `planning-artifact-persistence-v5.md`

| Topic                      | v5 (Session Artifacts)                                                                                | This spec (Role-typed)                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Producer model**         | Any session is a generic publisher; categories are open (`document`, `test-report`, `screenshot`, …). | Each session has a **role**; **kinds are allow-listed per role**.                                               |
| **Prompt integration**     | Single **Layer 5** in `buildPrompt()` for all agents when artifacts initialized.                      | **Role-specific prompt layers** only; avoids ultra-generic builder.                                             |
| **Orchestrator reasoning** | “List/grep/read artifacts” — discoverability-first.                                                   | **Contract-first**: who must produce what before the next role runs.                                            |
| **Validation / policy**    | Guards at publish time (path, secrets); category is user/agent chosen.                                | **Kind ↔ role** enforcement + optional orchestrator-only roles.                                                 |
| **Handoff clarity**        | Implicit via issue + session ids and human prompts.                                                   | Explicit **lineage** (`inputArtifactIds`, producer role on entries).                                            |
| **Scope of MVP**           | Full CLI surface (`list`, `grep`, `read`, `stats`, lifecycle status, …).                              | Can **reuse v5 storage and CLI** but **narrow MVP** to role + kind validation + layered prompts.                |
| **Risk**                   | Prompt and product surface grow with every new category/feature.                                      | Role explosion must be managed (MVP three roles + optional **Reproducer** for debug flows).                     |
| **Pre-plan evidence**      | Not modeled; any session can publish a `test-report` anytime.                                         | Explicit **Reproducer** path and artifact kinds so “broken baseline” is a **first-class handoff** into Planner. |

**What we keep from v5:** filesystem layout under AO data dir, `manifest.json` + sidecars + lock, `AO_ARTIFACTS_DIR` / `AO_ISSUE_ID`, auto-publish PR refs from lifecycle, on-demand `list`/`grep`/`read` for discovery.

**What we change:** treat artifacts as **outputs of a typed pipeline** (planner → executor → validator), not as a flat bag of session outputs; split prompt injection by role instead of one generic artifact layer.

---

## 6. Relation to Other Specs

- **`recovery-context-and-learnings.md`:** runtime recovery + `LEARNINGS.md` — complementary; not replaced by role-typed artifacts.
- **`GNAP_PRD.md` / session persistence designs:** coordination state in metadata vs structured plan files — planner role artifacts can **subsume** some “plan as file” intent without duplicating GNAP’s graph in repo JSON.
- **`issue-lifecycle-trust-vector.md`:** issue-centric **phases** (Plan → Execute → Validate) and **Trust Vector** gates; roles here are **semantic contracts** that map to **phase-local** prompts and optional reproducer-derived gates (e.g. `issue_reproduced`) — see §8.

---

## 7. Implementation mechanics (how)

### 7.1 Types and spawn config

**`WorkerRole`** (string union or const enum):

`"planner" | "executor" | "validator" | "reproducer"`

**`ArtifactKind`** — implement as a discriminated union or as `ArtifactKind` + runtime allow-list:

```typescript
const PLANNER_KINDS = ["plan", "decision", "research", "risk"] as const;
const EXECUTOR_KINDS = ["implementation-note", "diff-summary", "pr-ref"] as const; // pr-ref often auto
const VALIDATOR_KINDS = ["test-report", "verification", "review-summary"] as const;
const REPRODUCER_KINDS = [
  "repro-steps",
  "failing-test",
  "screenshot",
  "baseline-observation",
] as const;

const KINDS_BY_ROLE: Record<WorkerRole, readonly string[]> = {
  planner: PLANNER_KINDS,
  executor: EXECUTOR_KINDS,
  validator: VALIDATOR_KINDS,
  reproducer: REPRODUCER_KINDS,
};

function allowedKinds(role: WorkerRole): readonly string[] {
  return KINDS_BY_ROLE[role];
}
```

**`SessionSpawnConfig` / env:** Add `role: WorkerRole` (default `"executor"` for backward compatibility — see §8). Optionally mirror as `AO_WORKER_ROLE` for subprocesses and artifact CLI.

**Manifest / sidecar extensions (v5-compatible):** Each manifest entry and `.meta.json` sidecar includes:

| Field              | Type                       | Required                                                                      |
| ------------------ | -------------------------- | ----------------------------------------------------------------------------- |
| `producerRole`     | `WorkerRole`               | yes for new publishes; optional on read for legacy rows                       |
| `kind`             | `string`                   | replaces or narrows flat `category` — `kind` is authoritative when both exist |
| `inputArtifactIds` | `string[]`                 | optional; UUIDs of artifacts this output explicitly depends on                |
| `observationPhase` | `"baseline" \| "post-fix"` | required for `screenshot` when issue is UI/debug workflow                     |

Legacy entries with only `category` map through a one-time compatibility table (e.g. `category: "test-report"` → `kind: "test-report"`, `producerRole: "validator"`) **only for display**; new publishes must supply `kind` + `producerRole`.

### 7.2 Publish-path validation (pseudo-code)

```typescript
function validatePublish(role: WorkerRole, kind: string, meta: SidecarMeta): void {
  if (!allowedKinds(role).includes(kind)) {
    throw new PublishRejectedError(
      `kind "${kind}" is not allowed for role "${role}". Allowed: ${allowedKinds(role).join(", ")}`,
    );
  }
  if (kind === "screenshot" && !meta.observationPhase) {
    throw new PublishRejectedError(`screenshot requires observationPhase baseline | post-fix`);
  }
  for (const id of meta.inputArtifactIds ?? []) {
    if (!artifactExists(id)) throw new PublishRejectedError(`unknown inputArtifactId ${id}`);
  }
}
```

Orchestrator-only enforcement: optionally reject spawns with `role: "planner"` unless `spawnSource === "orchestrator"` (config flag).

### 7.3 Prompt layers — placement and contents

**Do not** add a single Layer 5 blob for all workers. Keep v5 layers **L1–L4** unchanged (base agent, config, rules, decomposition). Insert **one** role-specific block **after** L4 and **before** any generic “artifact CLI cheat sheet”:

| Layer | Source                              | Contents                                                                                                                                        |
| ----- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| L4.5a | `buildPlannerArtifactLayer(ctx)`    | How to publish `plan` / `decision`; requirement to reference `inputArtifactIds` when continuing work; pointer to `ao artifact list --kind plan` |
| L4.5b | `buildExecutorArtifactLayer(ctx)`   | PR + `implementation-note` expectations; forbidden: replacing plan without override token in prompt                                             |
| L4.5c | `buildValidatorArtifactLayer(ctx)`  | CI interpretation, `verification` vs `test-report`; link PR + plan artifacts                                                                    |
| L4.5d | `buildReproducerArtifactLayer(ctx)` | Repro-first: failing test red, baseline screenshot, `baseline-observation` for env constraints                                                  |

**Optional thin L5 (shared):** A short, role-agnostic block listing `AO_ARTIFACTS_DIR`, `ao artifact publish`, `list`, `grep`, `read` — **without** duplicating role rules (those stay in L4.5x). If L5 is omitted for a project with artifacts disabled, L4.5x is omitted too.

**`PromptBuildConfig` extension:**

```typescript
interface PromptBuildConfig {
  // ...existing...
  workerRole?: WorkerRole;
  /** Artifact ids the orchestrator requires this session to consume (handoff). */
  requiredInputArtifactIds?: string[];
}
```

When `requiredInputArtifactIds` is set, each role layer prepends: “You must read artifacts: …” with resolved titles from manifest.

### 7.4 Orchestrator handoff template (concrete)

Append to orchestrator system prompt (or per-issue block):

```markdown
## Handoff contract (issue {{issueId}})

- Current role: **{{role}}**
- Required prior artifacts: {{#each requiredArtifacts}}`{{id}}` ({{kind}}) {{/each}}
- Next expected role after success: **{{nextRole}}**
- Before spawning next role, verify manifest contains: {{nextRoleRequirements}}
```

`nextRoleRequirements` examples: after Planner → “at least one `plan` artifact”; after Executor → “`pr-ref` or open PR + `implementation-note`”; after Reproducer (strict mode) → “`repro-steps` and (`failing-test` or `screenshot` baseline)”.

### 7.5 CLI filtering

Extend v5 CLI:

- `ao artifact list --role planner --kind plan` — filter manifest entries by `producerRole` and/or `kind`.
- `ao artifact publish ... --role executor --kind implementation-note` — required flags once role enforcement is on; CLI sets sidecar `producerRole` / `kind` (spawn supplies default role via env).

`grep` / `read` unchanged; filters apply to `list` first to reduce token waste in agent scripts.

### 7.6 End-to-end sequence (default vs debug)

**Default (greenfield):**

```
Orchestrator → spawn(role=planner) → plan artifacts
           → spawn(role=executor, inputArtifactIds=[plan…]) → PR + notes
           → spawn(role=validator, inputArtifactIds=[plan…, pr…]) → verification
```

**Debug (pre-plan verify):**

```
Orchestrator → spawn(role=reproducer) → repro + baseline evidence
           → spawn(role=planner, inputArtifactIds=[repro…]) → plan references baseline
           → spawn(role=executor) → fix
           → spawn(role=validator) → optional post-fix screenshot pair
```

### 7.7 Files and modules (suggested map)

| Concern                         | Location                                                                  |
| ------------------------------- | ------------------------------------------------------------------------- |
| Role + kind types               | `packages/core/src/types.ts` or `artifact-policy.ts`                      |
| `validatePublish` / allow-lists | `packages/core/src/artifact-policy.ts`                                    |
| Prompt L4.5x builders           | `packages/core/src/prompt/artifact-layers-by-role.ts` (or split per file) |
| `buildPrompt` wiring            | `prompt-builder.ts` — branch on `workerRole`                              |
| Publish CLI / service           | artifact package — call `validatePublish` before write                    |
| Manifest schema version bump    | increment `schemaVersion` when adding required fields                     |

---

## 8. Resolved positions (0004 alignment)

Former **§8 Open Questions** are narrowed here and aligned with [`issue-lifecycle-trust-vector.md`](./issue-lifecycle-trust-vector.md).

### 8.1 Default role when `ao spawn` omits `--worker-role`

**Position:** **Backward compatibility:** omitting role continues to mean “ordinary implementation worker” behavior (effectively **executor** semantics). Explicit `--worker-role` selects planner, validator, reproducer, or executor.

### 8.2 Single-session role switch vs separate sessions

**Position:** **Both are valid.** The **issue-centric** model (0004) treats planner / executor / validator as **phase responsibilities** and **artifact contracts** on **one collaboration surface** — often **one worktree** and optionally **one long-lived session** that advances **phase** (prompt + policy). **Separate spawns** per role remain a supported **scale-out / isolation** pattern; they are not required for every issue.

### 8.3 Same worktree vs separate worktrees

**Position:** **Same worktree / branch per issue** is the **default** for delivery: roles attach to **phases**, not necessarily to three isolated checkouts. Multiple worktrees for the same issue are optional (e.g. parallel experiments). Enforcement strength is a **policy** concern (future spawn / gate checks).

### 8.4 When is Reproducer mandatory

**Position:** **Configurable:** per-project policy, per-issue label, and/or orchestrator decision. Strict debug flows should require reproducer **artifacts** (or equivalent evidence) before Plan; greenfield features may skip Reproducer entirely.

### 8.5 Trust gates derived from Reproducer / Validator artifacts

**Position:** Policy may define gates such as **`issue_reproduced`** (pre–Plan: required reproducer/baseline evidence satisfied) and **`validation_signoff`** or equivalent (post–Execute: validator artifacts + optional CI). Exact identifiers live in core `TrustGateKind` (see 0004 tasks) and [`issue-lifecycle-trust-vector.md`](./issue-lifecycle-trust-vector.md) §4. Naming avoids overloading “validated” with the entire Validate phase.

### 8.6 `failing-test` and git paths

**Position:** Unchanged from prior draft: prefer in-repo paths when publishing; copies under `artifacts/` remain implementation-defined.

---

_Document version: 1.3_
