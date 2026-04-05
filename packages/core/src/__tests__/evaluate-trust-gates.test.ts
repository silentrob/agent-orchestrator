import { describe, expect, it } from "vitest";
import {
  isPlanIssueAligned,
  listMissingExecutorTrustGates,
  MVP_EXECUTOR_TRUST_GATE_KINDS,
} from "../evaluate-trust-gates.js";
import { trustGateMetadataKey } from "../issue-lifecycle-gates.js";
import type { PlanFrontmatterProbeResult } from "../plan-artifact-gates.js";

function metaCi(status: "satisfied" | "pending" | "failed" | undefined): Record<string, string> {
  const key = trustGateMetadataKey("ci_passing");
  return status === undefined ? {} : { [key]: status };
}

describe("isPlanIssueAligned", () => {
  it("returns true when planArtifactIssue is unset", () => {
    expect(isPlanIssueAligned(undefined, "4")).toBe(true);
    expect(isPlanIssueAligned("", "4")).toBe(true);
  });

  it("returns false when plan issue set but spawn issue missing", () => {
    expect(isPlanIssueAligned("4", undefined)).toBe(false);
    expect(isPlanIssueAligned("4", "")).toBe(false);
  });

  it("returns true when normalized ids match", () => {
    expect(isPlanIssueAligned("4", "#4")).toBe(true);
    expect(isPlanIssueAligned("INT-1", "int-1")).toBe(true);
  });

  it("returns false on mismatch", () => {
    expect(isPlanIssueAligned("4", "5")).toBe(false);
  });
});

describe("listMissingExecutorTrustGates", () => {
  it("lists ci_passing when metadata not satisfied", () => {
    const ctx = {
      metadata: metaCi("pending"),
      issueId: "1",
      probe: null,
    };
    expect(listMissingExecutorTrustGates(ctx)).toEqual(
      expect.arrayContaining(["ci_passing", "artifact_plan_present", "human_plan_approval"]),
    );
  });

  it("lists artifact and human when probe missing", () => {
    const ctx = {
      metadata: metaCi("satisfied"),
      issueId: "1",
      probe: null,
    };
    expect(listMissingExecutorTrustGates(ctx)).toEqual(["artifact_plan_present", "human_plan_approval"]);
  });

  it("satisfied when ci green, plan file present, and status approved", () => {
    const probe: PlanFrontmatterProbeResult = {
      path: "/tmp/.ao/plan.md",
      found: true,
      status: "approved",
      requiresApproval: true,
    };
    const ctx = {
      metadata: metaCi("satisfied"),
      issueId: "42",
      probe,
    };
    expect(listMissingExecutorTrustGates(ctx)).toEqual([]);
  });

  it("waives human_plan_approval when requires_approval false", () => {
    const probe: PlanFrontmatterProbeResult = {
      path: "/tmp/.ao/plan.md",
      found: true,
      status: "draft",
      requiresApproval: false,
    };
    const ctx = {
      metadata: metaCi("satisfied"),
      issueId: "42",
      probe,
    };
    expect(listMissingExecutorTrustGates(ctx)).toEqual([]);
  });

  it("fails closed on planArtifactIssue vs issueId mismatch", () => {
    const probe: PlanFrontmatterProbeResult = {
      path: "/tmp/.ao/plan.md",
      found: true,
      status: "approved",
      requiresApproval: true,
    };
    const ctx = {
      metadata: metaCi("satisfied"),
      issueId: "2",
      planArtifactIssue: "1",
      probe,
    };
    expect(listMissingExecutorTrustGates(ctx)).toEqual(["artifact_plan_present", "human_plan_approval"]);
  });

  it("returns only MVP gate kinds in MVP order when multiple missing", () => {
    const ctx = {
      metadata: {},
      issueId: "1",
      probe: null,
    };
    const missing = listMissingExecutorTrustGates(ctx);
    expect(missing.every((g) => MVP_EXECUTOR_TRUST_GATE_KINDS.includes(g))).toBe(true);
    expect(missing).toEqual(["artifact_plan_present", "human_plan_approval", "ci_passing"]);
  });
});
