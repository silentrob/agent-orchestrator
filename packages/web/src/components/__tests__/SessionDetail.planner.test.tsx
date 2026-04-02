import { render, screen, waitFor } from "@testing-library/react";
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
