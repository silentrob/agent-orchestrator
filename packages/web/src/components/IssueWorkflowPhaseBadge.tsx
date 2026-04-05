"use client";

import type { IssueWorkflowPhase } from "@composio/ao-core";

const LABELS: Record<IssueWorkflowPhase, string> = {
  reproducer: "Reproducer",
  plan: "Plan",
  execute: "Execute",
  validate: "Validate",
  done: "Done",
};

export function IssueWorkflowPhaseBadge({ phase }: { phase: IssueWorkflowPhase }) {
  return (
    <span
      className="rounded border border-[var(--color-border-default)] bg-[var(--color-chip-bg)] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--color-text-secondary)]"
      data-testid="issue-workflow-phase-badge"
      title={`Issue workflow phase: ${phase}`}
    >
      {LABELS[phase]}
    </span>
  );
}
