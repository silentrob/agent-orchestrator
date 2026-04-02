import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parsePlanMarkdown, resolvePlanArtifactPath } from "../plan-artifact.js";

describe("parsePlanMarkdown", () => {
  it("returns full content as body when there is no frontmatter", () => {
    const raw = "# Plan\n\nHello";
    expect(parsePlanMarkdown(raw)).toEqual({ frontmatter: {}, body: "# Plan\n\nHello" });
  });

  it("parses YAML frontmatter and body", () => {
    const raw = `---
status: draft
requires_approval: false
feature_name: "My feature"
---
# Body start

More text.
`;
    const { frontmatter, body } = parsePlanMarkdown(raw);
    expect(frontmatter.status).toBe("draft");
    expect(frontmatter.requires_approval).toBe(false);
    expect(frontmatter.feature_name).toBe("My feature");
    expect(body).toContain("# Body start");
    expect(body).toContain("More text.");
  });

  it("treats unclosed frontmatter as no parse — empty frontmatter and full raw as body fallback", () => {
    const raw = `---
status: draft
Still going without closing`;
    const r = parsePlanMarkdown(raw);
    expect(r.frontmatter).toEqual({});
    expect(r.body).toBe(raw);
  });
});

describe("resolvePlanArtifactPath", () => {
  it("rejects relative paths with ..", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ao-plan-art-"));
    try {
      expect(resolvePlanArtifactPath(tmp, "../etc/passwd")).toBeNull();
      expect(resolvePlanArtifactPath(tmp, ".ao/../../etc/passwd")).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("resolves default .ao/plan.md under workspace", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ao-plan-art-"));
    try {
      mkdirSync(join(tmp, ".ao"), { recursive: true });
      const planFile = join(tmp, ".ao", "plan.md");
      writeFileSync(planFile, "x");
      const abs = resolvePlanArtifactPath(tmp, undefined);
      expect(abs).toBeTruthy();
      expect(abs).toBe(realpathSync(planFile));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns null when plan file would be workspace root", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ao-plan-art-"));
    try {
      writeFileSync(join(tmp, "marker"), "");
      expect(resolvePlanArtifactPath(tmp, ".")).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns null when symlink target escapes workspace", () => {
    const outside = mkdtempSync(join(tmpdir(), "ao-plan-out-"));
    const inside = mkdtempSync(join(tmpdir(), "ao-plan-in-"));
    try {
      const target = join(outside, "secret.md");
      writeFileSync(target, "secret");
      const linkDir = join(inside, ".ao");
      mkdirSync(linkDir, { recursive: true });
      symlinkSync(outside, join(linkDir, "escape"));
      const abs = resolvePlanArtifactPath(inside, ".ao/escape/secret.md");
      expect(abs).toBeNull();
    } finally {
      rmSync(outside, { recursive: true, force: true });
      rmSync(inside, { recursive: true, force: true });
    }
  });
});
