/**
 * Trust gate satisfaction stored in flat session metadata (0006 Option A).
 * Each gate uses one key from {@link trustGateMetadataKey}; values are {@link TrustGateSatisfaction}.
 */

import { TRUST_GATE_KINDS, type TrustGateKind } from "./issue-lifecycle-types.js";

/** Prefix for scanning metadata keys (`trustGate*`); full keys are explicit per gate. */
export const TRUST_GATE_SATISFACTION_PREFIX = "trustGate" as const;

/**
 * Stored value for a gate in session metadata (via `updateMetadata`).
 * - `satisfied` — gate passed
 * - `pending` — not yet satisfied / unknown
 * - `failed` — gate explicitly failed (optional use)
 */
export const TRUST_GATE_SATISFACTION_VALUES = ["satisfied", "pending", "failed"] as const;

export type TrustGateSatisfaction = (typeof TRUST_GATE_SATISFACTION_VALUES)[number];

/**
 * Stable metadata key per `TrustGateKind` (flat key=value session files).
 * Example: `human_plan_approval` → `trustGateHumanPlanApproval`
 */
const TRUST_GATE_METADATA_KEYS: Record<TrustGateKind, string> = {
  issue_reproduced: "trustGateIssueReproduced",
  human_plan_approval: "trustGateHumanPlanApproval",
  ci_passing: "trustGateCiPassing",
  artifact_plan_present: "trustGateArtifactPlanPresent",
  artifact_verification_present: "trustGateArtifactVerificationPresent",
  config_waiver: "trustGateConfigWaiver",
  validation_signoff: "trustGateValidationSignoff",
};

export function trustGateMetadataKey(kind: TrustGateKind): string {
  return TRUST_GATE_METADATA_KEYS[kind];
}

/** All metadata keys (stable order follows `TRUST_GATE_KINDS`). */
export const TRUST_GATE_METADATA_KEY_LIST: readonly string[] = TRUST_GATE_KINDS.map((k) =>
  TRUST_GATE_METADATA_KEYS[k],
);
