import { describe, expect, it } from "vitest";
import { buildPlannerArtifactLayer } from "../prompt/artifact-layers-by-role.js";

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
