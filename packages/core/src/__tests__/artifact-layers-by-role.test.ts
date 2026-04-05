import { describe, expect, it } from "vitest";
import {
  buildPlannerArtifactLayer,
  buildIssueWorkflowPhaseLayer,
} from "../prompt/artifact-layers-by-role.js";

describe("buildPlannerArtifactLayer", () => {
  it("returns a non-empty string with plan path, frontmatter guidance, and respawn guidance", () => {
    const text = buildPlannerArtifactLayer({ projectId: "my-app", issueId: "INT-42" });
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(".ao/plan.md");
    expect(text).toContain("---");
    expect(text).toMatch(/frontmatter|YAML/i);
    expect(text).toMatch(/requires_approval/);
    expect(text).toMatch(/respawn|already exists|read it first/i);
  });

  it("aligns with feature_plan-style GUARDRAILS, SCOPE, and Delta rules", () => {
    const text = buildPlannerArtifactLayer({ projectId: "my-app" });
    expect(text).toMatch(/GLOBAL GUARDRAILS/i);
    expect(text).toMatch(/API-TRUTH|API Contract Table/i);
    expect(text).toMatch(/NO-INVENTION|Delta Proposal/i);
    expect(text).toMatch(/SCOPE FENCE|IN-SCOPE|OUT-OF-SCOPE/i);
    expect(text).toMatch(/VERIFICATION HOOKS|Reference Proof/i);
    expect(text).toMatch(/ACCEPTANCE INTEGRITY/i);
    expect(text).toMatch(/HARD GATE/i);
    expect(text).toMatch(/PLANNING STEPS|Clarifying Questions/i);
    expect(text).toMatch(/feature_plan/i);
  });

  it("includes issue id and project id when provided", () => {
    const text = buildPlannerArtifactLayer({ projectId: "p1", issueId: "GH-7" });
    expect(text).toContain("GH-7");
    expect(text).toContain("p1");
  });

  it("omits issue line specifics when issueId is omitted", () => {
    const text = buildPlannerArtifactLayer({ projectId: "solo" });
    expect(text).toContain("solo");
    expect(text).toMatch(/no specific issue id/i);
  });

  it("appends issueContext when provided", () => {
    const text = buildPlannerArtifactLayer({
      projectId: "p",
      issueId: "I-1",
      issueContext: "Title: Fix login\nBody: …",
    });
    expect(text).toContain("Title: Fix login");
  });

  it("discourages implementation PRs as planner", () => {
    const text = buildPlannerArtifactLayer({ projectId: "p" });
    expect(text).toContain("implementation PR");
    expect(text).toMatch(/not.*open.*implementation PR/i);
  });
});

describe("buildIssueWorkflowPhaseLayer", () => {
  const ctx = { projectId: "my-app", issueId: "INT-1" };

  it("delegates plan to buildPlannerArtifactLayer", () => {
    const text = buildIssueWorkflowPhaseLayer("plan", ctx);
    expect(text).toContain("## Planner role");
    expect(text).toContain(".ao/plan.md");
  });

  it("returns execute placeholder for execute", () => {
    const text = buildIssueWorkflowPhaseLayer("execute", ctx);
    expect(text).toContain("## Executor phase");
    expect(text).toContain("execute");
    expect(text).toContain("INT-1");
  });

  it("returns validate placeholder for validate", () => {
    const text = buildIssueWorkflowPhaseLayer("validate", ctx);
    expect(text).toContain("## Validator phase");
    expect(text).toContain("Trust Vector");
  });

  it("returns reproducer placeholder for reproducer", () => {
    const text = buildIssueWorkflowPhaseLayer("reproducer", ctx);
    expect(text).toContain("## Reproducer phase");
  });

  it("returns empty string for done", () => {
    expect(buildIssueWorkflowPhaseLayer("done", ctx)).toBe("");
  });
});
