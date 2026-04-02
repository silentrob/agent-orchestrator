/**
 * Role-specific prompt fragments for worker sessions (planner, executor, validator, …).
 * See docs/specs/role-typed-artifacts.md — L4.5 planner layer (POC).
 */

export interface PlannerArtifactLayerContext {
  projectId: string;
  issueId?: string;
  /** Resolved issue context line if available */
  issueContext?: string;
}

/**
 * Instructions for a **planner** worker: produce `.ao/plan.md` with optional YAML frontmatter,
 * do not land implementation PRs as the planner, and preserve/update existing plans on respawn.
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

### Plan artifact

- Write the plan to **\`.ao/plan.md\`** in this session worktree (create \`.ao/\` if needed).
- Use **optional YAML frontmatter** at the top of the file, between \`---\` lines, aligned with feature-plan style:
  - \`status\`: one of \`draft\`, \`needs_clarification\`, \`approved\`, \`rejected\` (default for new plans: \`draft\`).
  - \`requires_approval\`: boolean — use **\`false\`** unless the user or orchestrator explicitly asked for a human review gate before execution.
  - \`feature_name\` (optional): short title for dashboards.
  - \`issue_id\` (optional): should match the tracker issue when applicable.
- After the closing \`---\`, write the **markdown body** (goals, steps, risks, open questions).

### What you must not do as planner

- Do **not** open an implementation PR or merge production code as the planner session.
- Do **not** discard an existing \`.ao/plan.md\` without explicit user/orchestrator direction.

### Respawn / crash recovery

- If **\`.ao/plan.md\` already exists**, **read it first**, preserve valid frontmatter, and **update** the body (and \`status\` if appropriate). Do not blindly overwrite the whole file.
- Treat the plan file as continuity for humans and for downstream executor sessions.`;
}
