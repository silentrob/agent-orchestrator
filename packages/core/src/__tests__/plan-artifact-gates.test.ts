import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import { parsePlanFrontmatter, probePlanArtifact } from "../plan-artifact-gates.js";

describe("probePlanArtifact", () => {
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

  it("returns found: false and path ending in .ao/plan.md when file missing", () => {
    dir = mkdtempSync(join(tmpdir(), "ao-plan-probe-"));
    const result = probePlanArtifact(dir);
    expect(result.found).toBe(false);
    expect(result.path).toBe(join(dir, ".ao/plan.md"));
    expect(result.status).toBeUndefined();
  });

  it("reads default .ao/plan.md when relPath omitted", () => {
    dir = mkdtempSync(join(tmpdir(), "ao-plan-probe-"));
    mkdirSync(join(dir, ".ao"), { recursive: true });
    writeFileSync(
      join(dir, ".ao/plan.md"),
      "---\nstatus: pending_approval\nrequires_approval: true\n---\n\nBody\n",
      "utf-8",
    );
    const result = probePlanArtifact(dir);
    expect(result.found).toBe(true);
    expect(result.path).toBe(join(dir, ".ao/plan.md"));
    expect(result.status).toBe("pending_approval");
    expect(result.requiresApproval).toBe(true);
  });

  it("respects custom relPath", () => {
    dir = mkdtempSync(join(tmpdir(), "ao-plan-probe-"));
    writeFileSync(
      join(dir, "custom-plan.md"),
      "---\nstatus: approved\nrequires_approval: false\n---\n",
      "utf-8",
    );
    const result = probePlanArtifact(dir, "custom-plan.md");
    expect(result.found).toBe(true);
    expect(result.status).toBe("approved");
    expect(result.requiresApproval).toBe(false);
  });
});

describe("parsePlanFrontmatter", () => {
  it("extracts status and requires_approval from a standard block", () => {
    const raw = "---\nstatus: draft\nrequires_approval: true\n---\nPrior plan\n";
    expect(parsePlanFrontmatter(raw)).toEqual({
      status: "draft",
      requiresApproval: true,
    });
  });

  it("returns empty object when file does not start with frontmatter", () => {
    expect(parsePlanFrontmatter("no frontmatter")).toEqual({});
  });

  it("strips quoted status values", () => {
    const raw = '---\nstatus: "pending_approval"\n---\n';
    expect(parsePlanFrontmatter(raw).status).toBe("pending_approval");
  });
});
