import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockLoadConfig,
  mockRegister,
  mockCreateSessionManager,
  mockRegistry,
  mockProbePlanArtifact,
  mockApprovePlanArtifact,
  mockUpdateMetadata,
  mockGetSessionsDir,
  mockIsOrchestratorSession,
  tmuxPlugin,
  claudePlugin,
  opencodePlugin,
  worktreePlugin,
  scmPlugin,
  trackerGithubPlugin,
  trackerLinearPlugin,
} = vi.hoisted(() => {
  const mockLoadConfig = vi.fn();
  const mockRegister = vi.fn();
  const mockCreateSessionManager = vi.fn();
  const mockRegistry = {
    register: mockRegister,
    get: vi.fn(),
    list: vi.fn(),
    loadBuiltins: vi.fn(),
    loadFromConfig: vi.fn(),
  };

  return {
    mockLoadConfig,
    mockRegister,
    mockCreateSessionManager,
    mockRegistry,
    mockProbePlanArtifact: vi.fn(),
    mockApprovePlanArtifact: vi.fn(),
    mockUpdateMetadata: vi.fn(),
    mockGetSessionsDir: vi.fn().mockReturnValue("/tmp/sessions"),
    mockIsOrchestratorSession: vi.fn().mockReturnValue(false),
    tmuxPlugin: { manifest: { name: "tmux" } },
    claudePlugin: { manifest: { name: "claude-code" } },
    opencodePlugin: { manifest: { name: "opencode" } },
    worktreePlugin: { manifest: { name: "worktree" } },
    scmPlugin: { manifest: { name: "github" } },
    trackerGithubPlugin: { manifest: { name: "github" } },
    trackerLinearPlugin: { manifest: { name: "linear" } },
  };
});

vi.mock("@composio/ao-core", () => ({
  loadConfig: mockLoadConfig,
  createPluginRegistry: () => mockRegistry,
  createSessionManager: mockCreateSessionManager,
  createLifecycleManager: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    getStates: vi.fn(),
    check: vi.fn(),
  }),
  decompose: vi.fn(),
  getLeaves: vi.fn(),
  getSiblings: vi.fn(),
  formatPlanTree: vi.fn(),
  probePlanArtifact: mockProbePlanArtifact,
  approvePlanArtifactInWorkspace: mockApprovePlanArtifact,
  updateMetadata: mockUpdateMetadata,
  getSessionsDir: mockGetSessionsDir,
  isOrchestratorSession: mockIsOrchestratorSession,
  DEFAULT_DECOMPOSER_CONFIG: {},
  TERMINAL_STATUSES: new Set(["merged", "killed"]) as ReadonlySet<string>,
}));

const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn().mockReturnValue("---\nstatus: pending_approval\n---\n\n## Plan body"),
}));

vi.mock("node:fs", () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}));

vi.mock("@composio/ao-plugin-runtime-tmux", () => ({ default: tmuxPlugin }));
vi.mock("@composio/ao-plugin-agent-claude-code", () => ({ default: claudePlugin }));
vi.mock("@composio/ao-plugin-agent-opencode", () => ({ default: opencodePlugin }));
vi.mock("@composio/ao-plugin-workspace-worktree", () => ({ default: worktreePlugin }));
vi.mock("@composio/ao-plugin-scm-github", () => ({ default: scmPlugin }));
vi.mock("@composio/ao-plugin-tracker-github", () => ({ default: trackerGithubPlugin }));
vi.mock("@composio/ao-plugin-tracker-linear", () => ({ default: trackerLinearPlugin }));

describe("services", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRegister.mockClear();
    mockCreateSessionManager.mockReset();
    mockLoadConfig.mockReset();
    mockLoadConfig.mockReturnValue({
      configPath: "/tmp/agent-orchestrator.yaml",
      port: 3000,
      readyThresholdMs: 300_000,
      defaults: { runtime: "tmux", agent: "claude-code", workspace: "worktree", notifiers: [] },
      projects: {},
      notifiers: {},
      notificationRouting: { urgent: [], action: [], warning: [], info: [] },
      reactions: {},
    });
    mockCreateSessionManager.mockReturnValue({});
    delete (globalThis as typeof globalThis & { _aoServices?: unknown })._aoServices;
    delete (globalThis as typeof globalThis & { _aoServicesInit?: unknown })._aoServicesInit;
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { _aoServices?: unknown })._aoServices;
    delete (globalThis as typeof globalThis & { _aoServicesInit?: unknown })._aoServicesInit;
  });

  it("registers the OpenCode agent plugin with web services", async () => {
    const { getServices } = await import("../lib/services");

    await getServices();

    expect(mockRegister).toHaveBeenCalledWith(opencodePlugin);
  });

  it("caches initialized services across repeated calls", async () => {
    const { getServices } = await import("../lib/services");

    const first = await getServices();
    const second = await getServices();

    expect(first).toBe(second);
    expect(mockCreateSessionManager).toHaveBeenCalledTimes(1);
  });
});

describe("pollBacklog", () => {
  const mockUpdateIssue = vi.fn();
  const mockListIssues = vi.fn();
  const mockSpawn = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    mockRegister.mockClear();
    mockCreateSessionManager.mockReset();
    mockLoadConfig.mockReset();
    mockUpdateIssue.mockClear();
    mockListIssues.mockClear();
    mockSpawn.mockClear();

    mockLoadConfig.mockReturnValue({
      configPath: "/tmp/agent-orchestrator.yaml",
      port: 3000,
      readyThresholdMs: 300_000,
      defaults: { runtime: "tmux", agent: "claude-code", workspace: "worktree", notifiers: [] },
      projects: {
        "test-project": {
          path: "/tmp/test-project",
          tracker: { plugin: "github" },
          backlog: { label: "agent:backlog", maxConcurrent: 5 },
        },
      },
      notifiers: {},
      notificationRouting: { urgent: [], action: [], warning: [], info: [] },
      reactions: {},
    });

    mockCreateSessionManager.mockReturnValue({
      spawn: mockSpawn,
      list: vi.fn().mockResolvedValue([]),
    });

    delete (globalThis as typeof globalThis & { _aoServices?: unknown })._aoServices;
    delete (globalThis as typeof globalThis & { _aoServicesInit?: unknown })._aoServicesInit;
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { _aoServices?: unknown })._aoServices;
    delete (globalThis as typeof globalThis & { _aoServicesInit?: unknown })._aoServicesInit;
  });

  it("removes agent:backlog label when claiming an issue", async () => {
    mockListIssues.mockResolvedValue([
      {
        id: "123",
        title: "Test Issue",
        description: "Test description",
        url: "https://github.com/test/test/issues/123",
        state: "open",
        labels: ["agent:backlog"],
      },
    ]);

    mockRegistry.get.mockImplementation((slot: string) => {
      if (slot === "tracker") {
        return {
          name: "github",
          listIssues: mockListIssues,
          updateIssue: mockUpdateIssue,
        };
      }
      if (slot === "agent") {
        return { name: "claude-code" };
      }
      if (slot === "runtime") {
        return { name: "tmux" };
      }
      if (slot === "workspace") {
        return { name: "worktree" };
      }
      return null;
    });

    const { pollBacklog } = await import("../lib/services");
    await pollBacklog();

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "test-project",
        issueId: "123",
        workerRole: "planner",
      }),
    );

    expect(mockUpdateIssue).toHaveBeenCalledWith(
      "123",
      {
        labels: ["agent:in-progress"],
        removeLabels: ["agent:backlog"],
        comment: "Claimed by agent orchestrator — session spawned.",
      },
      expect.objectContaining({ tracker: { plugin: "github" } }),
    );
  });

  it("spawns with executor when backlogDefaultWorkerRole is executor", async () => {
    mockLoadConfig.mockReturnValue({
      configPath: "/tmp/agent-orchestrator.yaml",
      port: 3000,
      readyThresholdMs: 300_000,
      defaults: { runtime: "tmux", agent: "claude-code", workspace: "worktree", notifiers: [] },
      projects: {
        "test-project": {
          path: "/tmp/test-project",
          tracker: { plugin: "github" },
          backlogDefaultWorkerRole: "executor",
        },
      },
      notifiers: {},
      notificationRouting: { urgent: [], action: [], warning: [], info: [] },
      reactions: {},
    });

    mockListIssues.mockResolvedValue([
      {
        id: "456",
        title: "Exec Issue",
        description: "d",
        url: "https://github.com/test/test/issues/456",
        state: "open",
        labels: ["agent:backlog"],
      },
    ]);

    mockRegistry.get.mockImplementation((slot: string) => {
      if (slot === "tracker") {
        return {
          name: "github",
          listIssues: mockListIssues,
          updateIssue: mockUpdateIssue,
        };
      }
      if (slot === "agent") {
        return { name: "claude-code" };
      }
      if (slot === "runtime") {
        return { name: "tmux" };
      }
      if (slot === "workspace") {
        return { name: "worktree" };
      }
      return null;
    });

    const { pollBacklog } = await import("../lib/services");
    await pollBacklog();

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "test-project",
        issueId: "456",
        workerRole: "executor",
      }),
    );
  });
});

describe("pollBacklog — plan push and LGTM approval", () => {
  const mockUpdateIssue = vi.fn();
  const mockGetIssueComments = vi.fn();
  const mockSpawn = vi.fn();
  const mockListSessions = vi.fn();

  const basePlannerSession = {
    id: "test-project-1",
    projectId: "test-project",
    status: "working" as const,
    activity: null,
    branch: "feat/issue-42",
    issueId: "42",
    pr: null,
    workspacePath: "/tmp/workspaces/test-project-1",
    runtimeHandle: null,
    agentInfo: null,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    metadata: { workerRole: "planner", planArtifactRelPath: ".ao/plan.md" },
  };

  beforeEach(async () => {
    vi.resetModules();
    mockRegister.mockClear();
    mockCreateSessionManager.mockReset();
    mockLoadConfig.mockReset();
    mockUpdateIssue.mockClear();
    mockGetIssueComments.mockClear();
    mockSpawn.mockClear();
    mockListSessions.mockClear();
    mockProbePlanArtifact.mockClear();
    mockApprovePlanArtifact.mockClear();
    mockUpdateMetadata.mockClear();
    mockIsOrchestratorSession.mockReturnValue(false);

    mockLoadConfig.mockReturnValue({
      configPath: "/tmp/agent-orchestrator.yaml",
      port: 3000,
      readyThresholdMs: 300_000,
      defaults: { runtime: "tmux", agent: "claude-code", workspace: "worktree", notifiers: [] },
      projects: {
        "test-project": {
          path: "/tmp/test-project",
          tracker: { plugin: "github" },
        },
      },
      notifiers: {},
      notificationRouting: { urgent: [], action: [], warning: [], info: [] },
      reactions: {},
    });

    mockListSessions.mockResolvedValue([]);

    mockCreateSessionManager.mockReturnValue({
      spawn: mockSpawn,
      list: mockListSessions,
    });

    mockRegistry.get.mockImplementation((slot: string) => {
      if (slot === "tracker") {
        return {
          name: "github",
          listIssues: vi.fn().mockResolvedValue([]),
          updateIssue: mockUpdateIssue,
          getIssueComments: mockGetIssueComments,
        };
      }
      return null;
    });

    delete (globalThis as typeof globalThis & { _aoServices?: unknown })._aoServices;
    delete (globalThis as typeof globalThis & { _aoServicesInit?: unknown })._aoServicesInit;
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { _aoServices?: unknown })._aoServices;
    delete (globalThis as typeof globalThis & { _aoServicesInit?: unknown })._aoServicesInit;
  });

  it("posts plan as tracker comment when plan is pending_approval", async () => {
    mockListSessions.mockResolvedValue([basePlannerSession]);
    mockProbePlanArtifact.mockReturnValue({
      path: "/tmp/workspaces/test-project-1/.ao/plan.md",
      found: true,
      status: "pending_approval",
    });

    const { pollBacklog } = await import("../lib/services");
    await pollBacklog();

    expect(mockUpdateMetadata).toHaveBeenCalledWith(
      "/tmp/sessions",
      "test-project-1",
      { planPostedToTracker: "true" },
    );
    expect(mockUpdateIssue).toHaveBeenCalledWith(
      "42",
      expect.objectContaining({
        labels: ["agent:plan-pending"],
        comment: expect.stringContaining("awaiting approval"),
      }),
      expect.any(Object),
    );
  });

  it("does not post plan again when planPostedToTracker is already true", async () => {
    const alreadyPostedSession = {
      ...basePlannerSession,
      metadata: { ...basePlannerSession.metadata, planPostedToTracker: "true" },
    };
    mockListSessions.mockResolvedValue([alreadyPostedSession]);
    mockProbePlanArtifact.mockReturnValue({
      path: "/tmp/workspaces/test-project-1/.ao/plan.md",
      found: true,
      status: "pending_approval",
    });

    const { pollBacklog } = await import("../lib/services");
    await pollBacklog();

    expect(mockUpdateMetadata).not.toHaveBeenCalled();
  });

  it("approves plan when LGTM is found in a comment", async () => {
    const postedSession = {
      ...basePlannerSession,
      metadata: { ...basePlannerSession.metadata, planPostedToTracker: "true" },
    };
    mockListSessions.mockResolvedValue([postedSession]);
    mockProbePlanArtifact.mockReturnValue({
      path: "/tmp/workspaces/test-project-1/.ao/plan.md",
      found: true,
      status: "pending_approval",
    });
    mockGetIssueComments.mockResolvedValue([
      { id: "1", author: "alice", body: "LGTM", createdAt: "2026-04-06T12:00:00Z" },
    ]);

    const { pollBacklog } = await import("../lib/services");
    await pollBacklog();

    expect(mockApprovePlanArtifact).toHaveBeenCalledWith(
      "/tmp/workspaces/test-project-1",
      ".ao/plan.md",
      { approvedBy: "alice" },
    );
    expect(mockUpdateIssue).toHaveBeenCalledWith(
      "42",
      expect.objectContaining({
        labels: ["agent:plan-approved"],
        removeLabels: ["agent:plan-pending"],
        comment: expect.stringContaining("alice"),
      }),
      expect.any(Object),
    );
  });

  it("approves plan when 👍 emoji is found in a comment", async () => {
    const postedSession = {
      ...basePlannerSession,
      metadata: { ...basePlannerSession.metadata, planPostedToTracker: "true" },
    };
    mockListSessions.mockResolvedValue([postedSession]);
    mockProbePlanArtifact.mockReturnValue({
      path: "/tmp/workspaces/test-project-1/.ao/plan.md",
      found: true,
      status: "pending_approval",
    });
    mockGetIssueComments.mockResolvedValue([
      { id: "2", author: "bob", body: "👍 looks good", createdAt: "2026-04-06T13:00:00Z" },
    ]);

    const { pollBacklog } = await import("../lib/services");
    await pollBacklog();

    expect(mockApprovePlanArtifact).toHaveBeenCalledWith(
      "/tmp/workspaces/test-project-1",
      ".ao/plan.md",
      { approvedBy: "bob" },
    );
  });

  it("skips LGTM polling when plan is already approved", async () => {
    const postedSession = {
      ...basePlannerSession,
      metadata: { ...basePlannerSession.metadata, planPostedToTracker: "true" },
    };
    mockListSessions.mockResolvedValue([postedSession]);
    mockProbePlanArtifact.mockReturnValue({
      path: "/tmp/workspaces/test-project-1/.ao/plan.md",
      found: true,
      status: "approved",
    });

    const { pollBacklog } = await import("../lib/services");
    await pollBacklog();

    expect(mockGetIssueComments).not.toHaveBeenCalled();
    expect(mockApprovePlanArtifact).not.toHaveBeenCalled();
  });

  it("skips plan operations when tracker has no getIssueComments", async () => {
    const postedSession = {
      ...basePlannerSession,
      metadata: { ...basePlannerSession.metadata, planPostedToTracker: "true" },
    };
    mockListSessions.mockResolvedValue([postedSession]);
    mockProbePlanArtifact.mockReturnValue({
      path: "/tmp/workspaces/test-project-1/.ao/plan.md",
      found: true,
      status: "pending_approval",
    });
    mockRegistry.get.mockImplementation((slot: string) => {
      if (slot === "tracker") {
        return {
          name: "github",
          listIssues: vi.fn().mockResolvedValue([]),
          updateIssue: mockUpdateIssue,
          // no getIssueComments
        };
      }
      return null;
    });

    const { pollBacklog } = await import("../lib/services");
    await pollBacklog();

    expect(mockApprovePlanArtifact).not.toHaveBeenCalled();
  });
});
