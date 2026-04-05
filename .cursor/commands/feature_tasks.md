Guard: “If requires_approval: true and status != approved, abort with: Plan <N> not approved (status: <status>).”

# GLOBAL GUARDRAILS (apply to every step)

## API-TRUTH SOURCE

- You MUST treat the codebase as the single source of truth.
- Before referencing any function/class/module, enumerate the **actual** exports using @Symbols and file reads.
- Build an **API Contract Table** listing: File, Exported Name, Kind (fn/class/const/type), Signature (name(args)->return), Notes.
- You may NOT call or describe any API that is not present in the table.

## NO-INVENTION RULE

- You may NOT assume methods exist on imported modules. If something is missing:
  - Create a **Delta Proposal**: file path, exact proposed signature, rationale (1 sentence), and impact.
  - Mark it clearly as "PROPOSED" and do not use it anywhere else unless explicitly accepted in the plan.

## SCOPE FENCE

- Define **IN-SCOPE** and **OUT-OF-SCOPE** lists explicitly. OUT-OF-SCOPE includes any adjacent features, refactors, UI polish, telemetry, or API expansions not required by the user request.
- If you catch yourself adding anything outside IN-SCOPE, move it to a "Future Work (Non-Blocking)" list — do NOT mix it into the current plan/tasks.

## VERIFICATION HOOKS

- For each referenced export, include a **Reference Proof**: line number or code excerpt (≤3 lines) and file path.
- If TS is present, prefer signatures from type definitions (.d.ts/.ts). If JS-only, infer from JSDoc or implementation header.

## ACCEPTANCE INTEGRITY

- Acceptance criteria must map 1:1 to IN-SCOPE requirements only.
- No task may list files/functions not present in the API Contract Table unless they are in a Delta Proposal.

Input: the feature plan (./cursor/features/<N>\_PLAN.md) or equivalent context. Convert it into an actionable task list while enforcing the GLOBAL GUARDRAILS.

STEPS

1. Load Plan:
   - Extract IN-SCOPE, API Contract Table, Delta Proposals, and Implementation sections.

2. Task Generation:
   - Create or update `./cursor/features/<Feature_Name><N>_TASKS.md`.
   - Tasks MUST map 1:1 to plan items (or grouped steps). No new features.
   - For any Delta Proposal, create tasks that add those exports with exact signatures (behind a feature flag or isolated commit), or mark them as **blocked** until approved.

3. Each Task includes:
   - **Task ID**: T01, T02, …
   - **Priority**: High / Medium / Low
   - **Effort**: S / M / L / XL
   - **Status**: `not started` (unless otherwise implied)
   - **Description**: 1–3 sentences (use plan’s wording)
   - **Dependencies**: other tasks (by ID) or migrations
   - **Files to Change**: explicit paths
   - **Acceptance Criteria**: bullet list, testable, only IN-SCOPE

4. Integrity Checks (must appear at the end of the file):
   - **API Reference Audit**: For each task, list the API Contract entries it uses. If a task references a non-existent export, flag **ERROR: Nonexistent API** and move that reference to the relevant Delta Proposal task.
   - **Scope Audit**: confirm no task touches OUT-OF-SCOPE items. If detected, move them to "Future Work (Non-Blocking)".

HARD RULES

- Do NOT invent APIs. Use only the API Contract Table or Delta Proposal tasks.
- Do NOT expand scope. If it’s not IN-SCOPE, it goes to Future Work.
- Keep tasks atomic and testable. No prose, no code.
