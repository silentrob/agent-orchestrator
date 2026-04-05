/**
 * Issue-centric workflow vocabulary (0004).
 * `issueWorkflowPhase` metadata is set on spawn when `issueId` is present (0005 T01).
 */

import type { WorkerRole } from "./types.js";

/** Session metadata key for `IssueWorkflowPhase` (flat key=value store). */
export const ISSUE_WORKFLOW_PHASE_METADATA_KEY = "issueWorkflowPhase" as const;

/** Ordered phases for the default happy path; `reproducer` is optional (strict debug flows). */
export const ISSUE_WORKFLOW_PHASES = ["reproducer", "plan", "execute", "validate", "done"] as const;

export type IssueWorkflowPhase = (typeof ISSUE_WORKFLOW_PHASES)[number];

/**
 * Discrete trust / policy gates (Trust Vector). Exact enforcement is policy-defined.
 * Includes reproducer-derived and validator-style gates named in role-typed-artifacts §8.5.
 */
export const TRUST_GATE_KINDS = [
  "issue_reproduced",
  "human_plan_approval",
  "ci_passing",
  "artifact_plan_present",
  "artifact_verification_present",
  "config_waiver",
  "validation_signoff",
] as const;

export type TrustGateKind = (typeof TRUST_GATE_KINDS)[number];

/** Inputs for choosing default phase on spawn (0005). */
export interface IssueSpawnPhaseContext {
  issueId?: string;
  workerRole?: WorkerRole;
}

/**
 * Default `issueWorkflowPhase` when spawning with an `issueId`.
 * No `issueId` → do not set metadata (undefined).
 * Role mapping: planner→plan, executor→execute, validator→validate, reproducer→reproducer; omitted role→execute.
 */
export function defaultIssueWorkflowPhaseForSpawn(
  ctx: IssueSpawnPhaseContext,
): IssueWorkflowPhase | undefined {
  if (!ctx.issueId?.trim()) return undefined;
  switch (ctx.workerRole) {
    case "planner":
      return "plan";
    case "validator":
      return "validate";
    case "reproducer":
      return "reproducer";
    case "executor":
      return "execute";
    default:
      return "execute";
  }
}
