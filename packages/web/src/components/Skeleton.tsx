// ── State UI ──────────────────────────────────────────────────────────

interface EmptyStateProps {
  message?: string;
  newIssueUrl?: string;
}

export function EmptyState({
  message,
  newIssueUrl,
}: EmptyStateProps) {
  const isDefault = !message;
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      {/* Terminal icon */}
      <svg
        className="mb-4 h-8 w-8 text-[var(--color-border-strong)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M6 9l4 3-4 3M13 15h5" />
      </svg>
      <p className="text-[13px] text-[var(--color-text-muted)]">
        {isDefault ? (
          <>
            No issues assigned yet.{" "}
            {newIssueUrl ? (
              <a
                href={newIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-text-secondary)] underline underline-offset-2 hover:text-[var(--color-text-primary)]"
              >
                Create a new issue
              </a>
            ) : (
              <>
                Start one with{" "}
                <code className="font-[var(--font-mono)] text-[var(--color-text-secondary)]">
                  ao start
                </code>
              </>
            )}
          </>
        ) : (
          message
        )}
      </p>
    </div>
  );
}
