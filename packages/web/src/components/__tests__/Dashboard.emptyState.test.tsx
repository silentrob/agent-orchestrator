import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "../Dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  const eventSourceMock = {
    onmessage: null,
    onerror: null,
    close: vi.fn(),
  };
  const eventSourceConstructor = vi.fn(() => eventSourceMock as unknown as EventSource);
  global.EventSource = Object.assign(eventSourceConstructor, {
    CONNECTING: 0,
    OPEN: 1,
    CLOSED: 2,
  }) as unknown as typeof EventSource;
  global.fetch = vi.fn();
});

describe("Dashboard empty state", () => {
  it("shows empty state when there are no sessions (single-project view)", () => {
    render(<Dashboard initialSessions={[]} />);
    expect(screen.getByText(/No issues assigned yet/i)).toBeInTheDocument();
  });

  it("does not show empty state when sessions exist", () => {
    const { queryByText } = render(
      <Dashboard
        initialSessions={[
          {
            id: "s1",
            projectId: "proj",
            status: "working",
            activity: "active",
            branch: "feat/x",
            issueId: null,
            issueUrl: null,
            issueLabel: null,
            issueTitle: null,
            summary: "Working on it",
            summaryIsFallback: false,
            createdAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            pr: null,
            metadata: {},
            issueWorkflowPhase: null,
            trustGates: {},
            trustGateSummary: null,
          },
        ]}
      />,
    );
    expect(queryByText(/No issues assigned yet/i)).not.toBeInTheDocument();
  });

  it("shows a create issue link when newIssueUrl is provided", () => {
    render(<Dashboard initialSessions={[]} newIssueUrl="https://github.com/test/repo/issues/new" />);
    const link = screen.getByRole("link", { name: /create a new issue/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://github.com/test/repo/issues/new");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("falls back to ao start instruction when newIssueUrl is not provided", () => {
    render(<Dashboard initialSessions={[]} />);
    expect(screen.getByText(/ao start/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /create a new issue/i })).not.toBeInTheDocument();
  });
});
