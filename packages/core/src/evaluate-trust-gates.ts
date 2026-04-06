/**
 * Pure evaluation of Trust Vector gates for **executor-phase** spawns (0006 T03).
 *
 * **Canonical session assumption:** gate checks run at **spawn** time for a single
 * worker session; issue-scoped plan alignment uses `planArtifactIssue` vs `issueId`
 * from metadata when the planner wrote those keys.
 */

import type { IssueWorkflowPhase, TrustGateKind } from "./issue-lifecycle-types.js";
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

/** MVP ordering for execute → validate transition (0008). */
const VALIDATE_TRANSITION_GATE_ORDER: readonly TrustGateKind[] = [
  "artifact_verification_present",
  "validation_signoff",
];

function sortValidateTransitionGates(gates: TrustGateKind[]): TrustGateKind[] {
  const order = VALIDATE_TRANSITION_GATE_ORDER;
  return [...gates].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function isTrustGateMetadataSatisfied(metadata: Record<string, string>, kind: TrustGateKind): boolean {
  return metadata[trustGateMetadataKey(kind)] === "satisfied";
}

/**
 * Returns Trust Vector gates that are **not** satisfied for a phase transition (`0008` Delta §2).
 *
 * - **Into `execute`:** same MVP rules as {@link listMissingExecutorTrustGates} (plan artifact + CI).
 * - **`execute` → `validate`:** requires `artifact_verification_present` and `validation_signoff` metadata.
 * - **`validate` → `done`:** requires `validation_signoff` metadata.
 * - **`reproducer` → `plan`:** requires `issue_reproduced` metadata.
 * - **`from === to`:** no gates.
 * - **Other pairs:** empty list (no MVP gates; forward/backward skips not policy-enforced here).
 */
export function listMissingTransitionGates(
  from: IssueWorkflowPhase,
  to: IssueWorkflowPhase,
  ctx: ExecutorTrustGateContext,
): TrustGateKind[] {
  if (from === to) {
    return [];
  }

  if (to === "execute") {
    return listMissingExecutorTrustGates(ctx);
  }

  if (from === "execute" && to === "validate") {
    const missing = new Set<TrustGateKind>();
    if (!isTrustGateMetadataSatisfied(ctx.metadata, "artifact_verification_present")) {
      missing.add("artifact_verification_present");
    }
    if (!isTrustGateMetadataSatisfied(ctx.metadata, "validation_signoff")) {
      missing.add("validation_signoff");
    }
    return sortValidateTransitionGates([...missing]);
  }

  if (from === "validate" && to === "done") {
    if (!isTrustGateMetadataSatisfied(ctx.metadata, "validation_signoff")) {
      return ["validation_signoff"];
    }
    return [];
  }

  if (from === "reproducer" && to === "plan") {
    if (!isTrustGateMetadataSatisfied(ctx.metadata, "issue_reproduced")) {
      return ["issue_reproduced"];
    }
    return [];
  }

  return [];
}
