import { describe, it, expect } from "vitest";
import {
  ISSUE_WORKFLOW_PHASES,
  TRUST_GATE_KINDS,
  ISSUE_WORKFLOW_PHASE_METADATA_KEY,
  defaultIssueWorkflowPhaseForSpawn,
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

  it("uses stable metadata key for issue workflow phase", () => {
    expect(ISSUE_WORKFLOW_PHASE_METADATA_KEY).toBe("issueWorkflowPhase");
  });

  it("defaultIssueWorkflowPhaseForSpawn returns undefined without issueId", () => {
    expect(defaultIssueWorkflowPhaseForSpawn({})).toBeUndefined();
    expect(defaultIssueWorkflowPhaseForSpawn({ issueId: "   " })).toBeUndefined();
  });

  it("defaultIssueWorkflowPhaseForSpawn maps roles when issueId is set", () => {
    expect(defaultIssueWorkflowPhaseForSpawn({ issueId: "INT-1" })).toBe("execute");
    expect(defaultIssueWorkflowPhaseForSpawn({ issueId: "INT-1", workerRole: "planner" })).toBe(
      "plan",
    );
    expect(defaultIssueWorkflowPhaseForSpawn({ issueId: "INT-1", workerRole: "executor" })).toBe(
      "execute",
    );
    expect(defaultIssueWorkflowPhaseForSpawn({ issueId: "INT-1", workerRole: "validator" })).toBe(
      "validate",
    );
    expect(defaultIssueWorkflowPhaseForSpawn({ issueId: "INT-1", workerRole: "reproducer" })).toBe(
      "reproducer",
    );
  });
});
