/**
 * Pure evaluation of Trust Vector gates for **executor-phase** spawns (0006 T03).
 *
 * **Canonical session assumption:** gate checks run at **spawn** time for a single
 * worker session; issue-scoped plan alignment uses `planArtifactIssue` vs `issueId`
 * from metadata when the planner wrote those keys.
 */

import type { TrustGateKind } from "./issue-lifecycle-types.js";
import type { PlanFrontmatterProbeResult } from "./plan-artifact-gates.js";
import { trustGateMetadataKey } from "./issue-lifecycle-gates.js";

/** MVP slice for executor transition (`0006` plan). */
export const MVP_EXECUTOR_TRUST_GATE_KINDS: readonly TrustGateKind[] = [
  "artifact_plan_present",
  "human_plan_approval",
  "ci_passing",
];

export interface ExecutorTrustGateContext {
  /** Flat session metadata (`trustGate*` keys written by AO). */
  metadata: Record<string, string>;
  /** Issue id for this spawn (e.g. `4`, `#4`). */
  issueId?: string;
  /** Planner metadata: issue the plan artifact was authored for. */
  planArtifactIssue?: string;
  /** Result of {@link probePlanArtifact} — no I/O in this module beyond injected data. */
  probe: PlanFrontmatterProbeResult | null;
}

/**
 * Returns MVP executor gates that are **not** satisfied for an execute-phase spawn.
 * Order: `artifact_plan_present`, `human_plan_approval`, `ci_passing` (only those present in output).
 */
export function listMissingExecutorTrustGates(ctx: ExecutorTrustGateContext): TrustGateKind[] {
  const missing = new Set<TrustGateKind>();

  if (!isCiPassingGateSatisfied(ctx.metadata)) {
    missing.add("ci_passing");
  }

  if (!isPlanIssueAligned(ctx.planArtifactIssue, ctx.issueId)) {
    missing.add("artifact_plan_present");
    missing.add("human_plan_approval");
    return sortMvpGates([...missing]);
  }

  if (!isArtifactPlanPresentSatisfied(ctx.probe)) {
    missing.add("artifact_plan_present");
  }

  if (!isHumanPlanApprovalSatisfied(ctx.probe)) {
    missing.add("human_plan_approval");
  }

  return sortMvpGates([...missing]);
}

/** Exported for tests — `planArtifactIssue` must match `issueId` when both are set; fail closed if plan issue set but spawn issue missing. */
export function isPlanIssueAligned(planArtifactIssue?: string, issueId?: string): boolean {
  const p = planArtifactIssue?.trim();
  const i = issueId?.trim();
  if (p && !i) return false;
  if (p && i && normalizeIssueId(p) !== normalizeIssueId(i)) return false;
  return true;
}

function normalizeIssueId(value: string): string {
  return value.trim().replace(/^#/, "").toLowerCase();
}

function isCiPassingGateSatisfied(metadata: Record<string, string>): boolean {
  return metadata[trustGateMetadataKey("ci_passing")] === "satisfied";
}

function isArtifactPlanPresentSatisfied(probe: PlanFrontmatterProbeResult | null): boolean {
  return Boolean(probe?.found);
}

/**
 * Human approval: if frontmatter waives approval (`requires_approval: false`), satisfied.
 * Otherwise require `status: approved` (case-insensitive).
 */
function isHumanPlanApprovalSatisfied(probe: PlanFrontmatterProbeResult | null): boolean {
  if (!probe?.found) return false;
  if (probe.requiresApproval === false) return true;
  const s = probe.status?.trim().toLowerCase();
  return s === "approved";
}

function sortMvpGates(gates: TrustGateKind[]): TrustGateKind[] {
  const order = MVP_EXECUTOR_TRUST_GATE_KINDS;
  return [...gates].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
