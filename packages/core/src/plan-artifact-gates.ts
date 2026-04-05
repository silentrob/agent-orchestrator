/**
 * Read `.ao/plan.md` (or override path) for Trust gate evaluation (0006 T02).
 * Uses a small line-based parser — no full YAML dependency.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_PLAN_REL = ".ao/plan.md";

export interface PlanFrontmatterProbeResult {
  /** Resolved absolute or workspace-relative path probed (always set). */
  path: string;
  /** Whether the file exists on disk. */
  found: boolean;
  /** `status` from YAML frontmatter when present. */
  status?: string;
  /** `requires_approval` from frontmatter when present (boolean). */
  requiresApproval?: boolean;
}

/**
 * Probe the plan markdown file for YAML frontmatter between the first pair of `---` lines.
 * @param workspacePath — session worktree root (absolute path recommended)
 * @param relPath — relative path inside worktree; defaults to `.ao/plan.md`
 */
export function probePlanArtifact(workspacePath: string, relPath?: string): PlanFrontmatterProbeResult {
  const relative = relPath?.trim() || DEFAULT_PLAN_REL;
  const path = join(workspacePath, relative);

  if (!existsSync(path)) {
    return { path, found: false };
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return { path, found: false };
  }

  const parsed = parsePlanFrontmatter(raw);
  return {
    path,
    found: true,
    ...parsed,
  };
}

/** Exported for unit tests — parses first `---` … `---` block only. */
export function parsePlanFrontmatter(fileContent: string): Pick<
  PlanFrontmatterProbeResult,
  "status" | "requiresApproval"
> {
  const lines = fileContent.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return {};
  }

  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) {
    return {};
  }

  const block = lines.slice(1, end).join("\n");
  return parseFrontmatterKeyValues(block);
}

function parseFrontmatterKeyValues(block: string): Pick<PlanFrontmatterProbeResult, "status" | "requiresApproval"> {
  const result: Pick<PlanFrontmatterProbeResult, "status" | "requiresApproval"> = {};

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const statusMatch = /^status:\s*(.+)$/.exec(trimmed);
    if (statusMatch) {
      result.status = stripYamlScalar(statusMatch[1] ?? "");
      continue;
    }

    const reqMatch = /^requires_approval:\s*(.+)$/.exec(trimmed);
    if (reqMatch) {
      result.requiresApproval = parseYamlBoolean(reqMatch[1] ?? "");
    }
  }

  return result;
}

function stripYamlScalar(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseYamlBoolean(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "no" || v === "off") return false;
  return undefined;
}
