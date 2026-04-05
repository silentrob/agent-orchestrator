/**
 * Approve plan artifact frontmatter in a workspace (0007).
 * Path containment matches `packages/web/src/lib/plan-artifact.ts` `resolvePlanArtifactPath`.
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";

import { atomicWriteFileSync } from "./atomic-write.js";

const DEFAULT_PLAN_REL = ".ao/plan.md";

export interface ApprovePlanArtifactResult {
  path: string;
}

/**
 * Resolves the absolute path to the plan file if it stays inside `workspacePath`
 * (after realpath). Rejects traversal (`..`), absolute `rel`, and empty relative result.
 * Duplicated from web `resolvePlanArtifactPath` until Delta §2 consolidates.
 */
function resolvePlanArtifactPath(
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

function parsePlanMarkdown(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) {
    return { frontmatter: {}, body: text };
  }

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

function serializeYamlScalar(v: unknown): string {
  if (v === true || v === false) return v ? "true" : "false";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") {
    const s = v;
    if (s === "" || /[\n:#'"\\]/.test(s) || s.trim() !== s) {
      return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return s;
  }
  return String(v);
}

function serializeFrontmatterBlock(rec: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(rec)) {
    lines.push(`${k}: ${serializeYamlScalar(v)}`);
  }
  return lines.join("\n");
}

function buildPlanMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const fm = serializeFrontmatterBlock(frontmatter);
  if (body === "") {
    return `---\n${fm}\n---\n`;
  }
  return `---\n${fm}\n---\n\n${body}`;
}

/**
 * Updates YAML frontmatter `status` to `approved`; sets `approved_at` (ISO8601) and optional `approved_by`.
 * Idempotent when already approved (still rewrites with fresh `approved_at`).
 */
export function approvePlanArtifactInWorkspace(
  workspacePath: string,
  relPathFromMetadata: string | undefined,
  opts?: { approvedBy?: string },
): ApprovePlanArtifactResult {
  const resolved = resolvePlanArtifactPath(workspacePath, relPathFromMetadata);
  if (!resolved) {
    throw new Error("Plan path resolves outside workspace or is invalid");
  }
  if (!existsSync(resolved)) {
    throw new Error(`Plan file not found: ${resolved}`);
  }

  let raw: string;
  try {
    raw = readFileSync(resolved, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read plan file: ${resolved}`, { cause: err });
  }

  const { frontmatter, body } = parsePlanMarkdown(raw);
  const merged: Record<string, unknown> = { ...frontmatter };
  merged.status = "approved";
  merged.approved_at = new Date().toISOString();
  if (opts?.approvedBy !== undefined) {
    merged.approved_by = opts.approvedBy;
  }

  const next = buildPlanMarkdown(merged, body);
  try {
    atomicWriteFileSync(resolved, next);
  } catch (err) {
    throw new Error(`Failed to write plan file: ${resolved}`, { cause: err });
  }

  return { path: resolved };
}
