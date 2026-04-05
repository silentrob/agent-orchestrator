import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("SessionDetail issue workflow phase", () => {
  it("renders phase badge when issueWorkflowPhase is set", () => {
    render(
      <SessionDetail
        session={makeSession({
          id: "phase-1",
          issueWorkflowPhase: "validate",
        })}
      />,
    );
    expect(screen.getByTestId("issue-workflow-phase-badge").textContent).toContain("Validate");
  });

  it("does not render phase badge when issueWorkflowPhase is null", () => {
    render(
      <SessionDetail
        session={makeSession({
          id: "phase-2",
          issueWorkflowPhase: null,
        })}
      />,
    );
    expect(screen.queryByTestId("issue-workflow-phase-badge")).toBeNull();
  });

  it("renders trust gate summary when trustGateSummary is set", () => {
    render(
      <SessionDetail
        session={makeSession({
          id: "gates-1",
          trustGateSummary: "1✓ humanPlanApproval:p",
          trustGates: {
            trustGateCiPassing: "satisfied",
            trustGateHumanPlanApproval: "pending",
          },
        })}
      />,
    );
    expect(screen.getByTestId("trust-gate-summary").textContent).toContain("1✓");
  });

  it("does not render trust gate chip when trustGateSummary is null", () => {
    render(
      <SessionDetail
        session={makeSession({
          id: "gates-2",
          trustGateSummary: null,
        })}
      />,
    );
    expect(screen.queryByTestId("trust-gate-summary")).toBeNull();
  });
});
