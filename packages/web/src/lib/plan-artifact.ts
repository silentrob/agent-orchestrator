/**
 * Plan artifact path resolution and `.ao/plan.md` frontmatter parsing (dashboard API).
 */

import { existsSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";

export interface ParsedPlanArtifact {
  frontmatter: Record<string, unknown>;
  body: string;
}

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

  let candidate = resolve(workspacePath, raw);
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

/**
 * Minimal key: value parser for plan frontmatter (booleans + unquoted strings).
 * Malformed lines are skipped; never throws.
 */
function parseSimpleYamlBlock(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    if (!key) continue;
    const val = trimmed.slice(colon + 1).trim();
    if (val === "true") out[key] = true;
    else if (val === "false") out[key] = false;
    else if (/^".*"$/.test(val)) out[key] = val.slice(1, -1);
    else if (/^'.*'$/.test(val)) out[key] = val.slice(1, -1);
    else out[key] = val;
  }
  return out;
}

/**
 * Splits optional YAML frontmatter (`---` fences) from markdown body.
 * If the opening `---` is not closed by a line `---`, returns empty `frontmatter` and `body` = full content (after BOM strip).
 */
export function parsePlanMarkdown(raw: string): ParsedPlanArtifact {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) {
    return { frontmatter: {}, body: text };
  }

  // First line must be --- only (optional trailing whitespace)
  const openEnd = text.indexOf("\n");
  if (openEnd === -1) {
    return { frontmatter: {}, body: text };
  }
  const firstLine = text.slice(0, openEnd).trimEnd();
  if (firstLine !== "---") {
    return { frontmatter: {}, body: text };
  }

  const closeMatch = /\n---\s*(?:\r?\n|$)/.exec(text.slice(openEnd + 1));
  if (!closeMatch || closeMatch.index === undefined) {
    return { frontmatter: {}, body: text };
  }

  const fmText = text.slice(openEnd + 1, openEnd + 1 + closeMatch.index).replace(/\r\n/g, "\n");
  let body = text.slice(openEnd + 1 + closeMatch.index + closeMatch[0].length);
  body = body.replace(/^\r?\n/, "");

  try {
    return { frontmatter: parseSimpleYamlBlock(fmText), body };
  } catch {
    return { frontmatter: {}, body: text };
  }
}
