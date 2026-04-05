import { describe, it, expect } from "vitest";
import {
  ISSUE_WORKFLOW_PHASES,
  TRUST_GATE_KINDS,
  type IssueWorkflowPhase,
  type TrustGateKind,
} from "../issue-lifecycle-types.js";

describe("issue-lifecycle-types", () => {
  it("exports stable IssueWorkflowPhase literals in order", () => {
    expect([...ISSUE_WORKFLOW_PHASES]).toEqual([
      "reproducer",
      "plan",
      "execute",
      "validate",
      "done",
    ]);
  });

  it("IssueWorkflowPhase satisfies exhaustive string union", () => {
    const phases: IssueWorkflowPhase[] = [...ISSUE_WORKFLOW_PHASES];
    expect(phases).toHaveLength(5);
  });

  it("exports stable TrustGateKind literals", () => {
    expect(TRUST_GATE_KINDS).toEqual([
      "issue_reproduced",
      "human_plan_approval",
      "ci_passing",
      "artifact_plan_present",
      "artifact_verification_present",
      "config_waiver",
      "validation_signoff",
    ]);
  });

  it("TrustGateKind satisfies exhaustive string union", () => {
    const gates: TrustGateKind[] = [...TRUST_GATE_KINDS];
    expect(gates).toHaveLength(7);
  });
});
