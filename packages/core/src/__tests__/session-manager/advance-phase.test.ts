import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSessionManager } from "../../session-manager.js";
import { writeMetadata, readMetadataRaw, updateMetadata } from "../../metadata.js";
import type { OrchestratorConfig, PluginRegistry, Runtime } from "../../types.js";
import { ISSUE_WORKFLOW_PHASE_METADATA_KEY } from "../../issue-lifecycle-types.js";
import { trustGateMetadataKey } from "../../issue-lifecycle-gates.js";
import { setupTestContext, teardownTestContext, makeHandle, type TestContext } from "../test-utils.js";

let ctx: TestContext;
let tmpDir: string;
let sessionsDir: string;
let mockRuntime: Runtime;
let mockRegistry: PluginRegistry;
let config: OrchestratorConfig;

beforeEach(() => {
  ctx = setupTestContext();
  ({
    tmpDir,
    sessionsDir,
    mockRuntime,
    mockRegistry,
    config,
  } = ctx);
  config.projects["my-app"].requireIssueLifecycleGates = true;
});

afterEach(() => {
  teardownTestContext(ctx);
});

describe("advancePhase", () => {
  it("throws when trust gates block plan → execute and gates are not skipped", async () => {
    const wsPath = join(tmpDir, "ws-advance-blocked");
    mkdirSync(wsPath, { recursive: true });

    writeMetadata(sessionsDir, "app-1", {
      worktree: wsPath,
      branch: "feat/INT-1",
      status: "working",
      project: "my-app",
      issue: "INT-1",
      runtimeHandle: JSON.stringify(makeHandle("rt-1")),
    });
    updateMetadata(sessionsDir, "app-1", {
      [ISSUE_WORKFLOW_PHASE_METADATA_KEY]: "plan",
      workerRole: "planner",
      planArtifactIssue: "INT-1",
    });

    const sm = createSessionManager({ config, registry: mockRegistry });

    await expect(sm.advancePhase!("app-1", { phase: "execute" })).rejects.toThrow(
      /phase advance blocked.*Missing Trust Vector gates/i,
    );
    expect(mockRuntime.sendMessage).not.toHaveBeenCalled();
  });

  it("updates metadata and sends composed prompt when skipGateCheck is true", async () => {
    const wsPath = join(tmpDir, "ws-advance-ok");
    mkdirSync(wsPath, { recursive: true });

    writeMetadata(sessionsDir, "app-1", {
      worktree: wsPath,
      branch: "feat/INT-1",
      status: "working",
      project: "my-app",
      issue: "INT-1",
      runtimeHandle: JSON.stringify(makeHandle("rt-1")),
    });
    updateMetadata(sessionsDir, "app-1", {
      [ISSUE_WORKFLOW_PHASE_METADATA_KEY]: "plan",
      workerRole: "planner",
    });

    vi.mocked(mockRuntime.getOutput).mockResolvedValue("ready");

    const sm = createSessionManager({ config, registry: mockRegistry });
    await sm.advancePhase!("app-1", { phase: "execute" }, { skipGateCheck: true });

    const raw = readMetadataRaw(sessionsDir, "app-1");
    expect(raw?.[ISSUE_WORKFLOW_PHASE_METADATA_KEY]).toBe("execute");
    expect(raw?.workerRole).toBe("executor");

    expect(mockRuntime.sendMessage).toHaveBeenCalled();
    const sent = vi.mocked(mockRuntime.sendMessage).mock.calls[0]?.[1] as string;
    expect(sent).toContain("advanced this session");
    expect(sent).toContain("execute");
  });

  it("allows plan → execute when executor trust gates are satisfied on disk and metadata", async () => {
    const wsPath = join(tmpDir, "ws-advance-gates");
    mkdirSync(join(wsPath, ".ao"), { recursive: true });
    writeFileSync(
      join(wsPath, ".ao/plan.md"),
      `---
status: approved
---

# Plan`,
    );

    writeMetadata(sessionsDir, "app-1", {
      worktree: wsPath,
      branch: "feat/INT-1",
      status: "working",
      project: "my-app",
      issue: "INT-1",
      runtimeHandle: JSON.stringify(makeHandle("rt-1")),
    });
    updateMetadata(sessionsDir, "app-1", {
      [ISSUE_WORKFLOW_PHASE_METADATA_KEY]: "plan",
      workerRole: "planner",
      planArtifactIssue: "INT-1",
      [trustGateMetadataKey("ci_passing")]: "satisfied",
    });

    vi.mocked(mockRuntime.getOutput).mockResolvedValue("ready");

    const sm = createSessionManager({ config, registry: mockRegistry });
    await sm.advancePhase!("app-1", { phase: "execute" });

    const raw = readMetadataRaw(sessionsDir, "app-1");
    expect(raw?.[ISSUE_WORKFLOW_PHASE_METADATA_KEY]).toBe("execute");
    expect(mockRuntime.sendMessage).toHaveBeenCalled();
  });
});
