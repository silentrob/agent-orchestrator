/**
 * Resolve plan file path inside a workspace with containment checks (0007 T02 / Delta §2).
 * Shared by web GET `/plan`, core `approvePlanArtifactInWorkspace`, and CLI.
 */

import { existsSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";

const DEFAULT_PLAN_REL = ".ao/plan.md";

/**
 * Resolves the absolute path to the plan file if it stays inside `workspacePath`
 * (after realpath). Rejects traversal (`..`), absolute `rel`, and empty relative result.
 */
export function resolvePlanArtifactPath(
  workspacePath: string,
  relPathFromMetadata: string | undefined,
): string | null {
  const raw = (relPathFromMetadata?.trim() || DEFAULT_PLAN_REL).replace(/^[\\/]+/, "");
  if (!raw) return null;
  if (raw.split(/[/\\]/).includes("..")) return null;

  let baseReal: string;
  try {
    baseReal = realpathSync(workspacePath);
  } catch {
    return null;
  }

  let candidate = resolve(baseReal, raw);
  if (existsSync(candidate)) {
    try {
      candidate = realpathSync(candidate);
    } catch {
      return null;
    }
  }

  const relToBase = relative(baseReal, candidate);
  if (relToBase === "" || relToBase.startsWith("..") || relToBase === "..") {
    return null;
  }

  return candidate;
}
