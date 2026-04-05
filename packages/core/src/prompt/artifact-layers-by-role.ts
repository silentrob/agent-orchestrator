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

- \`status\`: \`draft\` | \`needs_clarification\` | \`approved\` | \`rejected\` (new plans: start \`draft\`).
- \`requires_approval\`: boolean — for AO POC default **\`false\`** unless the user or orchestrator explicitly wants a human review gate before execution. If \`true\`, note that downstream automation should check the header (when policy exists).
- \`feature_number\`, \`feature_name\`, \`created_at\`, \`reviewers\` — set when known; use ISO8601 for dates.

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
- Prefer **\`status: draft\`** until a human approves (orchestrator may later align with \`feature_tasks\` / execution commands). Downstream commands should **abort** if they require \`status: approved\` and the header is not approved — when that policy is in use.

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
- **How to Approve** — e.g. set \`status: approved\`, \`approved_at\`, \`approved_by\` in frontmatter, or explicit orchestrator approval phrase.

### What you must not do as planner

- Do **not** open an implementation PR or merge production code as the planner session.
- Do **not** discard an existing \`.ao/plan.md\` without explicit user/orchestrator direction.

### Respawn / crash recovery

- If **\`.ao/plan.md\` already exists**, **read it first**, preserve valid frontmatter, and **update** sections (and \`status\` if appropriate). Do not blindly overwrite the whole file.
- Treat the plan file as continuity for humans and for downstream executor sessions.`;
}

/**
 * Phase-specific L4.5 content for issue-backed workflows (0005).
 * `plan` delegates to {@link buildPlannerArtifactLayer}; other phases use thin placeholders until full L4.5b/c exist.
 */
export function buildIssueWorkflowPhaseLayer(
  phase: IssueWorkflowPhase,
  ctx: PlannerArtifactLayerContext,
): string {
  switch (phase) {
    case "plan":
      return buildPlannerArtifactLayer(ctx);
    case "execute":
      return buildExecutorPhasePlaceholder(ctx);
    case "validate":
      return buildValidatorPhasePlaceholder(ctx);
    case "reproducer":
      return buildReproducerPhasePlaceholder(ctx);
    case "done":
      return "";
  }
}

function buildExecutorPhasePlaceholder(ctx: PlannerArtifactLayerContext): string {
  const issueHint = ctx.issueId ? `Issue **${ctx.issueId}** — ` : "";
  return `## Executor phase (Agent Orchestrator)

${issueHint}You are in the **execute** workflow phase for project \`${ctx.projectId}\`.
Implement the approved plan and in-scope tasks; do not rely on or invent APIs outside the project’s API Contract Table. Prefer small, reviewable changes.`;
}

function buildValidatorPhasePlaceholder(ctx: PlannerArtifactLayerContext): string {
  const issueHint = ctx.issueId ? `Issue **${ctx.issueId}** — ` : "";
  return `## Validator phase (Agent Orchestrator)

${issueHint}You are in the **validate** workflow phase for project \`${ctx.projectId}\`.
Focus on verification, CI alignment, and sign-off against acceptance criteria and the Trust Vector where applicable.`;
}

function buildReproducerPhasePlaceholder(ctx: PlannerArtifactLayerContext): string {
  const issueHint = ctx.issueId ? `Issue **${ctx.issueId}** — ` : "";
  return `## Reproducer phase (Agent Orchestrator)

${issueHint}You are in the **reproducer** workflow phase for project \`${ctx.projectId}\`.
Produce a minimal, reliable reproduction of the issue before downstream planning or implementation.`;
}
