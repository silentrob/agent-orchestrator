/**
 * Role-specific prompt fragments for worker sessions (planner, executor, validator, …).
 * See docs/specs/role-typed-artifacts.md — L4.5 planner layer (POC).
 * Aligned with `.cursor/commands/feature_plan.md` (GUARDRAILS, SCOPE, Deltas, steps).
 */

import type { IssueWorkflowPhase } from "../issue-lifecycle-types.js";

export interface PlannerArtifactLayerContext {
  projectId: string;
  issueId?: string;
  /** Resolved issue context line if available */
  issueContext?: string;
}

/**
 * Instructions for a **planner** worker: produce `.ao/plan.md` structured like a Cursor feature plan
 * (frontmatter + GLOBAL GUARDRAILS + scoped body + API table / Deltas), without landing implementation PRs.
 */
export function buildPlannerArtifactLayer(ctx: PlannerArtifactLayerContext): string {
  const issueLine = ctx.issueId
    ? `You are planning work for issue **${ctx.issueId}** in project \`${ctx.projectId}\`.`
    : `You are planning work for project \`${ctx.projectId}\` (no specific issue id was provided).`;

  const contextBlock =
    ctx.issueContext && ctx.issueContext.trim().length > 0
      ? `\n## Tracker / issue context (reference)\n\n${ctx.issueContext.trim()}\n`
      : "";

  return `## Planner role (Agent Orchestrator)

${issueLine}
${contextBlock}

### Where to write the plan

- Save the full plan to **\`.ao/plan.md\`** in this session worktree (create \`.ao/\` if needed).
- This mirrors the **structure and rigor** of the Cursor \`feature_plan\` command, but the artifact lives here (not \`./cursor/features/\`) so the dashboard and orchestrator can read it from the worktree.

### Plan file header (YAML — must be the first block in the file)

Use optional YAML frontmatter between \`---\` lines at the very top, same spirit as feature plans:

- \`status\`: \`draft\` | \`needs_clarification\` | \`pending_approval\` | \`approved\` | \`rejected\`. **New plans:** start with **\`pending_approval\`** (not yet human-approved). Move to **\`approved\`** only after explicit human/orchestrator sign-off. Use \`draft\` while the plan is still being written; use \`needs_clarification\` when blocked on questions.
- \`requires_approval\`: boolean — default **\`true\`** for new plans so execution stays gated on **manual approval** unless the orchestrator explicitly waives the gate (\`false\`).
- \`feature_number\`, \`feature_name\`, \`created_at\`, \`reviewers\`, \`approved_at\`, \`approved_by\` — set when known; use ISO8601 for dates.

After the closing \`---\`, the markdown body should follow the sections below.

### GLOBAL GUARDRAILS (apply to every step — echo these in your plan body)

#### API-TRUTH SOURCE

- Treat the **codebase** as the single source of truth. Before referencing any function/class/module, verify it exists (open files, symbols, exports).
- Build an **API Contract Table**: File | Exported name | Kind | Signature / shape | Notes. You may **not** call or rely on APIs that are not in that table.

#### NO-INVENTION RULE

- Do **not** assume methods exist on imports. If something is missing, add a **Delta Proposal**: file path, exact proposed signature, one-sentence rationale, impact — mark **PROPOSED** and do not use it elsewhere in the plan until accepted.

#### SCOPE FENCE

- Define explicit **IN-SCOPE** and **OUT-OF-SCOPE** lists. Put adjacent ideas, refactors, telemetry, or API expansions not required by the request under **Future Work (Non-Blocking)** — do not mix them into mandatory work.

#### VERIFICATION HOOKS

- For important references, add **Reference Proof**: file path + line or ≤3 lines of excerpt (or signature from types).

#### ACCEPTANCE INTEGRITY

- Acceptance criteria must map to **IN-SCOPE** only. No task may depend on symbols absent from the API Contract Table except via an explicit Delta Proposal.

### HARD GATE (planner vs execution)

- Your job is the **plan artifact** in \`.ao/plan.md\`. Do **not** generate implementation task files, code, or land an **implementation PR** as this planner session unless the orchestrator explicitly directs otherwise.
- Prefer **\`status: pending_approval\`** with **\`requires_approval: true\`** when the plan is ready for review. Downstream executor sessions and automation should treat **\`status: approved\`** (and satisfied Trust Vector gates when policy exists) as the signal to implement — not \`pending_approval\` or \`draft\`.

### PLANNING STEPS (structure the markdown body)

**0) Clarifying questions (optional, up to 5)**  
If the request is ambiguous after initial research, add a \`## Clarifying Questions\` section. Otherwise skip.

**1) Research**

- Locate relevant modules; build the **API Contract Table** (real exports only).
- Group any **Delta Proposals** by file.

**2) Plan**

- **Context Summary** — 2–3 sentences using the user’s terminology.
- **Scope Fence** — IN-SCOPE / OUT-OF-SCOPE.
- **Data Layer (Phase 1)** — types, storage, metadata; or state **None** if N/A.
- **Implementation** — (a) data/service (b) API/CLI (c) UI; reference only table entries. Add parallel phases only if the feature is large.

**3) Closing (required in the plan body)**

- **Risks & Delta Proposals** — summarize proposed APIs with signatures.
- **API Contract Table** (final).
- **Reference Proofs** — file:line or short excerpts.
- **Future Work (Non-Blocking)** — if any.
- **Review Checklist** — e.g. scope respected, no invented APIs, Deltas documented, data layer called out.
- **How to Approve** — human sets frontmatter to \`status: approved\`, \`requires_approval: false\` (optional), plus \`approved_at\` / \`approved_by\` when recording sign-off; or leaves an explicit orchestrator approval comment on the issue.

### What you must not do as planner

- Do **not** open an implementation PR or merge production code as the planner session.
- Do **not** discard an existing \`.ao/plan.md\` without explicit user/orchestrator direction.

### Respawn / crash recovery

- If **\`.ao/plan.md\` already exists**, **read it first**, preserve valid frontmatter, and **update** sections (and \`status\` if appropriate). Do not blindly overwrite the whole file.
- Treat the plan file as continuity for humans and for downstream executor sessions.`;
}

/**
 * Phase-specific L4.5 content for issue-backed workflows (0005/0006).
 * `plan` delegates to {@link buildPlannerArtifactLayer}; other phases use substantive Trust-aligned layers.
 */
export function buildIssueWorkflowPhaseLayer(
  phase: IssueWorkflowPhase,
  ctx: PlannerArtifactLayerContext,
): string {
  switch (phase) {
    case "plan":
      return buildPlannerArtifactLayer(ctx);
    case "execute":
      return buildExecutorArtifactLayer(ctx);
    case "validate":
      return buildValidatorArtifactLayer(ctx);
    case "reproducer":
      return buildReproducerArtifactLayer(ctx);
    case "done":
      return "";
  }
}

function buildExecutorArtifactLayer(ctx: PlannerArtifactLayerContext): string {
  const issueHint = ctx.issueId ? `Issue **${ctx.issueId}** — ` : "";
  return `## Executor phase (Agent Orchestrator)

${issueHint}You are in the **execute** workflow phase for project \`${ctx.projectId}\`.
Implement the **approved** plan and **IN-SCOPE** tasks only. Treat the codebase as the API-TRUTH source: verify exports and signatures before use; do not rely on or invent APIs outside the project’s **API Contract Table** (or an accepted Delta Proposal).

### Trust checklist

- **Plan alignment** — If \`.ao/plan.md\` exists, follow its IN-SCOPE / OUT-OF-SCOPE and **Reference Proof** rows; do not silently expand scope.
- **Gates** — When orchestrator policy applies, downstream phases may depend on **Trust Vector** gate metadata (e.g. plan approval, CI green). Do not bypass documented preconditions.
- **No invention** — Missing API? Add a Delta Proposal in the plan or PR description; do not call hypothetical methods.

### Implementation discipline

- Prefer **small, reviewable** changes; one concern per commit when practical.
- Match existing patterns (imports, tests, error handling) in touched modules.
- Leave **Verification** evidence you can cite in the PR (commands run, test output scope).

### Pull request description (Trust Vector)

When you open a PR (\`gh pr create\`), the body must **not** be only a closing keyword (e.g. a single \`Closes #N\` line). Include:
- **Summary** — what changed and why (bullet list ok).
- **Verification** — what you ran (tests, manual checks, commands) and results.
- **Trust / risk** — anything reviewers should know (scope limits, follow-ups, known gaps).
- **Issue link** — end with \`Closes #N\` / \`Fixes #N\` **on its own line** so GitHub still auto-closes the issue, after the narrative above.`;
}

function buildValidatorArtifactLayer(ctx: PlannerArtifactLayerContext): string {
  const issueHint = ctx.issueId ? `Issue **${ctx.issueId}** — ` : "";
  return `## Validator phase (Agent Orchestrator)

${issueHint}You are in the **validate** workflow phase for project \`${ctx.projectId}\`.
Your job is **independent verification** and **sign-off** against acceptance criteria and the Trust Vector — not to re-implement the fix unless asked.

### Verification evidence

- **What to record** — Commands run (e.g. test targets), CI result for the candidate commit/PR, and any manual checks (steps, expected vs actual).
- **Gaps** — State clearly what was **not** exercised (platforms, edge paths, flaky areas) so risk is visible.
- **Artifacts** — Prefer pointers to logs, test names, or PR checks rather than vague “looks good.”

### Acceptance criteria sign-off

- Map each **IN-SCOPE** acceptance item from the plan or issue to **pass / fail / blocked** with a one-line rationale.
- If scope drifted, call it out and separate **must-fix** from **follow-up** (Future Work).

### CI and Trust Vector

- Treat **green CI** on the validation target as necessary but not always sufficient; align with project’s required checks.
- Where metadata or policy tracks gate satisfaction, do not contradict recorded state without investigation.`;
}

function buildReproducerArtifactLayer(ctx: PlannerArtifactLayerContext): string {
  const issueHint = ctx.issueId ? `Issue **${ctx.issueId}** — ` : "";
  return `## Reproducer phase (Agent Orchestrator)

${issueHint}You are in the **reproducer** workflow phase for project \`${ctx.projectId}\`.
Produce a **minimal, reliable** reproduction **before** broad planning or implementation so the team agrees on **what is broken** and **how to observe it**.

### Repro minimality

- **Smallest surface** — Fewest files, steps, and dependencies needed to trigger the bug; remove unrelated edits and features.
- **Determinism** — If order or timing matters, say so; prefer a script or fixed sequence over vague “sometimes.”
- **Baseline** — Note **expected** vs **actual** with concrete signals (error text, exit code, UI state).

### Minimal reproduction

- Use numbered steps from a clean or documented starting point (branch, config, env vars).
- Capture **environment** when relevant (runtime versions, OS, feature flags) — enough for someone else to repeat.
- If full prod repro is impossible, document the **closest faithful** substitute and its limits.

### Handoff

- Store or link the repro artifact (script, fixture, session log) where the planner and executor can find it; avoid “works on my machine” without traceability.`;
}
