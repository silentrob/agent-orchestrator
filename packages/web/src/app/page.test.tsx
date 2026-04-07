import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const dashboardSpy = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/Dashboard", () => ({
  Dashboard: (props: Record<string, unknown>) => {
    dashboardSpy(props);
    return <div data-testid="dashboard" />;
  },
}));

vi.mock("@/lib/dashboard-page-data", () => ({
  getDashboardPageData: vi.fn().mockResolvedValue({
    sessions: [],
    globalPause: null,
    orchestrators: [],
    projectName: "Test",
    projects: [],
    selectedProjectId: "myproject",
    newIssueUrl: "https://github.com/owner/repo/issues/new",
  }),
  getDashboardProjectName: vi.fn().mockReturnValue("Test"),
  resolveDashboardProjectFilter: vi.fn().mockReturnValue("myproject"),
}));

describe("Home page", () => {
  it("passes newIssueUrl from pageData to Dashboard", async () => {
    const { default: Home } = await import("./page");
    const element = await Home({ searchParams: Promise.resolve({}) });
    render(element);

    expect(screen.getByTestId("dashboard")).toBeInTheDocument();
    expect(dashboardSpy).toHaveBeenCalledWith(
      expect.objectContaining({ newIssueUrl: "https://github.com/owner/repo/issues/new" }),
    );
  });
});
