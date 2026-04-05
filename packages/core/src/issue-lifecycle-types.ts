/**
 * Issue-centric workflow vocabulary (0004).
 * Not wired into spawn or buildPrompt yet — consumers use these for policy and UI.
 */

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
