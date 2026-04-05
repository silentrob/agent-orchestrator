import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { approvePlanArtifactInWorkspace } from "../plan-artifact-approve.js";

describe("approvePlanArtifactInWorkspace", () => {
  let dir: string;

  afterEach(() => {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("updates status, sets approved_at and optional approved_by, preserves body and other keys", () => {
    dir = mkdtempSync(join(tmpdir(), "ao-plan-approve-"));
    mkdirSync(join(dir, ".ao"), { recursive: true });
    const planPath = join(dir, ".ao/plan.md");
    writeFileSync(
      planPath,
      "---\nstatus: pending_approval\nrequires_approval: true\ncustom: kept\n---\n\n## Plan\n\nDo the thing.\n",
      "utf-8",
    );

    const result = approvePlanArtifactInWorkspace(dir, undefined, { approvedBy: "alice" });
    expect(result.path).toBe(realpathSync(planPath));

    const next = readFileSync(planPath, "utf-8");
    expect(next).toContain("status: approved");
    expect(next).toMatch(/approved_at: "?[\d-T:.Z]+"?/);
    expect(next).toContain("approved_by: alice");
    expect(next).toContain("requires_approval: true");
    expect(next).toContain("custom: kept");
    expect(next).toContain("## Plan");
    expect(next).toContain("Do the thing.");
  });

  it("adds frontmatter when file had no valid frontmatter fence", () => {
    dir = mkdtempSync(join(tmpdir(), "ao-plan-approve-"));
    mkdirSync(join(dir, ".ao"), { recursive: true });
    const planPath = join(dir, ".ao/plan.md");
    writeFileSync(planPath, "Plain body only\n", "utf-8");

    approvePlanArtifactInWorkspace(dir, undefined);

    const next = readFileSync(planPath, "utf-8");
    expect(next.startsWith("---\n")).toBe(true);
    expect(next).toContain("status: approved");
    expect(next).toContain("Plain body only");
  });

  it("throws when plan path resolves outside workspace (traversal in rel path)", () => {
    dir = mkdtempSync(join(tmpdir(), "ao-plan-approve-"));
    expect(() => approvePlanArtifactInWorkspace(dir, "../../../etc/passwd")).toThrow(
      /outside workspace or is invalid/i,
    );
  });

  it("throws when resolved path escapes workspace via .. segments", () => {
    dir = mkdtempSync(join(tmpdir(), "ao-plan-approve-"));
    mkdirSync(join(dir, "sub"), { recursive: true });
    writeFileSync(join(dir, "sub/plan.md"), "---\nstatus: draft\n---\n", "utf-8");

    expect(() => approvePlanArtifactInWorkspace(dir, "sub/../../outside.md")).toThrow(
      /outside workspace or is invalid/i,
    );
  });

  it("throws when plan file is missing", () => {
    dir = mkdtempSync(join(tmpdir(), "ao-plan-approve-"));
    mkdirSync(join(dir, ".ao"), { recursive: true });
    expect(() => approvePlanArtifactInWorkspace(dir, undefined)).toThrow(/not found/i);
  });

  it("writes atomically (file exists before and after)", () => {
    dir = mkdtempSync(join(tmpdir(), "ao-plan-approve-"));
    mkdirSync(join(dir, ".ao"), { recursive: true });
    const planPath = join(dir, ".ao/plan.md");
    writeFileSync(planPath, "---\nstatus: pending_approval\n---\n\nx\n", "utf-8");

    approvePlanArtifactInWorkspace(dir, undefined);
    expect(existsSync(planPath)).toBe(true);
    expect(readFileSync(planPath, "utf-8")).toContain("status: approved");
  });
});
