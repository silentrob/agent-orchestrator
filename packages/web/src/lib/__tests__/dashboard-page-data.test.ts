import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAllProjectsMock, getPrimaryProjectIdMock, getProjectNameMock } = vi.hoisted(() => ({
  getAllProjectsMock: vi.fn(),
  getPrimaryProjectIdMock: vi.fn(),
  getProjectNameMock: vi.fn(),
}));

const { getServicesMock } = vi.hoisted(() => ({
  getServicesMock: vi.fn(),
}));

vi.mock("@/lib/project-name", () => ({
  getAllProjects: getAllProjectsMock,
  getPrimaryProjectId: getPrimaryProjectIdMock,
  getProjectName: getProjectNameMock,
}));

vi.mock("@/lib/services", () => ({
  getServices: getServicesMock,
  getSCM: vi.fn(),
}));

vi.mock("@/lib/serialize", () => ({
  sessionToDashboard: vi.fn((s: unknown) => s),
  resolveProject: vi.fn(),
  enrichSessionPR: vi.fn(),
  enrichSessionsMetadata: vi.fn().mockResolvedValue(undefined),
  listDashboardOrchestrators: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/cache", () => ({
  prCache: { get: vi.fn() },
  prCacheKey: vi.fn(),
}));

vi.mock("@/lib/global-pause", () => ({
  resolveGlobalPause: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/project-utils", () => ({
  filterProjectSessions: vi.fn().mockReturnValue([]),
  filterWorkerSessions: vi.fn().mockReturnValue([]),
}));

import {
  resolveDashboardProjectFilter,
  resolveNewIssueUrl,
  getDashboardPageData,
} from "@/lib/dashboard-page-data";
import type { ProjectConfig } from "@composio/ao-core";

describe("resolveDashboardProjectFilter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllProjectsMock.mockReturnValue([
      { id: "mono", name: "Mono" },
      { id: "docs", name: "Docs" },
    ]);
    getPrimaryProjectIdMock.mockReturnValue("mono");
    getProjectNameMock.mockReturnValue("Mono");
  });

  it("keeps valid project ids", () => {
    expect(resolveDashboardProjectFilter("docs")).toBe("docs");
  });

  it("keeps the all-projects sentinel", () => {
    expect(resolveDashboardProjectFilter("all")).toBe("all");
  });

  it("falls back to primary project for unknown ids", () => {
    expect(resolveDashboardProjectFilter("mono-orchestrator")).toBe("mono");
  });

  it("falls back to primary project when no project is given", () => {
    expect(resolveDashboardProjectFilter(undefined)).toBe("mono");
  });
});

function makeProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: "Test Project",
    repo: "owner/repo",
    path: "/tmp/repo",
    ...overrides,
  } as unknown as ProjectConfig;
}

describe("resolveNewIssueUrl", () => {
  it("returns undefined when tracker is not configured", () => {
    expect(resolveNewIssueUrl(makeProjectConfig())).toBeUndefined();
  });

  it("returns a GitHub new-issue URL for the github tracker", () => {
    const project = makeProjectConfig({ tracker: { plugin: "github" } });
    expect(resolveNewIssueUrl(project)).toBe("https://github.com/owner/repo/issues/new");
  });

  it("handles tracker-github plugin prefix", () => {
    const project = makeProjectConfig({ tracker: { plugin: "tracker-github" } });
    expect(resolveNewIssueUrl(project)).toBe("https://github.com/owner/repo/issues/new");
  });

  it("returns a Linear new-issue URL when workspaceSlug is configured", () => {
    const project = makeProjectConfig({ tracker: { plugin: "linear", workspaceSlug: "myteam" } });
    expect(resolveNewIssueUrl(project)).toBe("https://linear.app/myteam/issues/new");
  });

  it("returns undefined for linear tracker without workspaceSlug", () => {
    const project = makeProjectConfig({ tracker: { plugin: "linear" } });
    expect(resolveNewIssueUrl(project)).toBeUndefined();
  });

  it("returns a GitLab new-issue URL for the gitlab tracker", () => {
    const project = makeProjectConfig({ tracker: { plugin: "gitlab" } });
    expect(resolveNewIssueUrl(project)).toBe("https://gitlab.com/owner/repo/-/issues/new");
  });

  it("returns undefined for unknown tracker plugins", () => {
    const project = makeProjectConfig({ tracker: { plugin: "jira" } });
    expect(resolveNewIssueUrl(project)).toBeUndefined();
  });
});

describe("getDashboardPageData — newIssueUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllProjectsMock.mockReturnValue([{ id: "myproject", name: "My Project" }]);
    getPrimaryProjectIdMock.mockReturnValue("myproject");
    getProjectNameMock.mockReturnValue("My Project");
  });

  it("sets newIssueUrl from project tracker config", async () => {
    getServicesMock.mockResolvedValue({
      config: {
        projects: {
          myproject: {
            name: "My Project",
            repo: "owner/repo",
            path: "/tmp/repo",
            tracker: { plugin: "github" },
          },
        },
      },
      registry: {},
      sessionManager: { list: vi.fn().mockResolvedValue([]) },
      lifecycleManager: {},
    });

    const data = await getDashboardPageData("myproject");
    expect(data.newIssueUrl).toBe("https://github.com/owner/repo/issues/new");
  });

  it("leaves newIssueUrl undefined when project has no tracker", async () => {
    getServicesMock.mockResolvedValue({
      config: {
        projects: {
          myproject: {
            name: "My Project",
            repo: "owner/repo",
            path: "/tmp/repo",
          },
        },
      },
      registry: {},
      sessionManager: { list: vi.fn().mockResolvedValue([]) },
      lifecycleManager: {},
    });

    const data = await getDashboardPageData("myproject");
    expect(data.newIssueUrl).toBeUndefined();
  });

  it("leaves newIssueUrl undefined for all-projects view", async () => {
    getServicesMock.mockResolvedValue({
      config: { projects: {} },
      registry: {},
      sessionManager: { list: vi.fn().mockResolvedValue([]) },
      lifecycleManager: {},
    });

    const data = await getDashboardPageData("all");
    expect(data.newIssueUrl).toBeUndefined();
  });
});
