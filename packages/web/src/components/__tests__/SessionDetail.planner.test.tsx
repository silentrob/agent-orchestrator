import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionDetail } from "../SessionDetail";
import { makeSession } from "../../__tests__/helpers";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../DirectTerminal", () => ({
  DirectTerminal: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="direct-terminal">{sessionId}</div>
  ),
}));

describe("SessionDetail planner plan panel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          path: "/w/.ao/plan.md",
          body: "## Plan\n\nDo the thing.",
          frontmatter: { status: "draft", requires_approval: true },
          issueId: "INT-9",
        }),
      } as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not render the planner plan panel when workerRole is not planner", () => {
    render(
      <SessionDetail
        session={makeSession({
          id: "exec-1",
          metadata: { workerRole: "executor" },
        })}
      />,
    );

    expect(screen.queryByTestId("planner-plan-panel")).toBeNull();
  });

  it("fetches plan API and shows body, status badge, and requires_approval when true", async () => {
    render(
      <SessionDetail
        session={makeSession({
          id: "plan-1",
          metadata: { workerRole: "planner" },
        })}
      />,
    );

    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/sessions/plan-1/plan");

    await waitFor(() => {
      expect(screen.getByTestId("planner-plan-body").textContent).toContain("## Plan");
    });

    expect(screen.getByTestId("planner-plan-badge-status").textContent).toContain("draft");
    expect(screen.getByTestId("planner-plan-badge-requires-approval").textContent).toContain(
      "Requires approval",
    );
    expect(screen.getByTestId("planner-plan-approve-button")).toBeInTheDocument();
  });

  it("omits requires_approval badge when frontmatter flag is false", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        path: "/w/.ao/plan.md",
        body: "Body only",
        frontmatter: { status: "approved", requires_approval: false },
        issueId: null,
      }),
    } as Response);

    render(
      <SessionDetail
        session={makeSession({
          id: "plan-2",
          metadata: { workerRole: "planner" },
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("planner-plan-body").textContent).toContain("Body only");
    });

    expect(screen.getByTestId("planner-plan-badge-status").textContent).toContain("approved");
    expect(screen.queryByTestId("planner-plan-badge-requires-approval")).toBeNull();
    expect(screen.queryByTestId("planner-plan-approve-button")).toBeNull();
  });

  it("does not show approve button when status is approved even if requires_approval is true", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        path: "/w/.ao/plan.md",
        body: "Done",
        frontmatter: { status: "approved", requires_approval: true },
        issueId: null,
      }),
    } as Response);

    render(
      <SessionDetail
        session={makeSession({
          id: "plan-approved",
          metadata: { workerRole: "planner" },
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("planner-plan-body").textContent).toContain("Done");
    });

    expect(screen.queryByTestId("planner-plan-approve-button")).toBeNull();
  });

  it("posts approve then refetches plan so status updates", async () => {
    let planLoads = 0;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/plan/approve")) {
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      if (url.includes("/plan") && !url.includes("/plan/approve")) {
        planLoads += 1;
        if (planLoads === 1) {
          return {
            ok: true,
            json: async () => ({
              path: "/w/.ao/plan.md",
              body: "## Before",
              frontmatter: { status: "pending_approval", requires_approval: true },
              issueId: null,
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            path: "/w/.ao/plan.md",
            body: "## After",
            frontmatter: { status: "approved", requires_approval: true },
            issueId: null,
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    render(
      <SessionDetail
        session={makeSession({
          id: "plan-approve-flow",
          metadata: { workerRole: "planner" },
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("planner-plan-approve-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("planner-plan-approve-button"));

    await waitFor(() => {
      expect(screen.getByTestId("planner-plan-badge-status").textContent).toContain("approved");
    });
    expect(screen.getByTestId("planner-plan-body").textContent).toContain("## After");
    expect(screen.queryByTestId("planner-plan-approve-button")).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some((c) => String(c[0]).includes("/plan/approve"))).toBe(
      true,
    );
  });

  it("shows API error message when plan fetch fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "Plan file not found" }),
    } as Response);

    render(
      <SessionDetail
        session={makeSession({
          id: "plan-404",
          metadata: { workerRole: "planner" },
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("planner-plan-error").textContent).toContain("Plan file not found");
    });
  });
});
