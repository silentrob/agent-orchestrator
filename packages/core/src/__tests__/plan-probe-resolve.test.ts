import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { writeMetadata } from "../metadata.js";
import { resolvePlanArtifactProbeForIssue } from "../session-manager.js";

describe("resolvePlanArtifactProbeForIssue", () => {
  it("returns planner worktree when another session has the plan file", () => {
    const root = mkdtempSync(join(tmpdir(), "ao-probe-"));
    const sessionsDir = join(root, "sessions");
    mkdirSync(sessionsDir, { recursive: true });

    const plannerWt = join(root, "wt-planner");
    const execWt = join(root, "wt-exec");
    mkdirSync(join(plannerWt, ".ao"), { recursive: true });
    writeFileSync(
      join(plannerWt, ".ao/plan.md"),
      "---\nstatus: approved\nrequires_approval: true\n---\n\nbody\n",
      "utf-8",
    );

    writeMetadata(sessionsDir, "app-planner", {
      worktree: plannerWt,
      branch: "feat/7",
      status: "working",
      issue: "7",
      project: "app",
      workerRole: "planner",
      planArtifactRelPath: ".ao/plan.md",
    });

    const loc = resolvePlanArtifactProbeForIssue({
      sessionsDir,
      issueId: "7",
      currentSessionId: "app-exec",
      currentWorkspacePath: execWt,
    });

    expect(loc.workspacePath).toBe(plannerWt);
    expect(loc.relPath).toBe(".ao/plan.md");
  });

  it("falls back to current workspace when no other session has the plan", () => {
    const root = mkdtempSync(join(tmpdir(), "ao-probe-fb-"));
    const sessionsDir = join(root, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    const execWt = join(root, "wt-exec");

    const loc = resolvePlanArtifactProbeForIssue({
      sessionsDir,
      issueId: "99",
      currentSessionId: "app-exec",
      currentWorkspacePath: execWt,
    });

    expect(loc.workspacePath).toBe(execWt);
    expect(loc.relPath).toBe(".ao/plan.md");
  });

  it("uses current workspace when issue id is empty", () => {
    const execWt = join(tmpdir(), "empty-issue-wt");
    const loc = resolvePlanArtifactProbeForIssue({
      sessionsDir: join(tmpdir(), "noop"),
      issueId: undefined,
      currentSessionId: "x",
      currentWorkspacePath: execWt,
    });
    expect(loc).toEqual({ workspacePath: execWt, relPath: ".ao/plan.md" });
  });
});
