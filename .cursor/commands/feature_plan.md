# FILE HEADER (must be the first block written to the file)

---

status: draft # allowed: draft | needs_clarification | approved | rejected
requires_approval: true # downstream commands MUST check this
feature_number: <N>
feature_name: "<set from user prompt or TBD>"
created_at: "<ISO8601>"
reviewers: ["<TBD>"]

---

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

You will receive a user feature description. Produce a concise engineering plan while enforcing the GLOBAL GUARDRAILS.

# HARD GATE: REVIEW REQUIRED

- This command **must STOP at draft**. Do NOT generate tasks or code.
- Downstream commands (tasks/execution) must ABORT unless this file header has `status: approved`.

STEPS 0) Clarify (optional, up to 5 Qs):

- If the request is ambiguous after initial research, ask up to five clarifying questions in a "## Clarifying Questions" section. Do not proceed until answers are incorporated.

1. Research:
   - Use @Symbols and targeted file opens to locate relevant modules.
   - Build the **API Contract Table** (see guardrails). Include only real exports.
   - If anything needed is missing, add a **Delta Proposal** section (grouped by file).

2. Plan:
   - **Context Summary**: 2–3 sentences using the user’s exact terminology.
   - **Scope Fence**: Explicit IN-SCOPE / OUT-OF-SCOPE lists.
   - **Data Layer (Phase 1)**: types, schema, migrations. If none, say "None".
   - **Implementation**:
     a) Data/Service logic (step-by-step; reference only items from API Contract Table)
     b) API layer (endpoints/handlers; reference real files/functions)
     c) UI layer (components, states, events; reference real files)
     _Only add parallel phases if the feature is large; otherwise a single section is fine._

   - **Risks & Delta Proposals**: call out any proposed new APIs with exact signatures and minimal rationale.

3. Output:
   - Save the plan to `./cursor/features/<N>_PLAN.md` (N = next sequential number starting at 0001).
   - At the end, include:
     - **API Contract Table** (final)
     - **Reference Proofs** (file:line or short excerpt)
     - **Future Work (Non-Blocking)** (if any)
     - **Review Checklist** (bulleted; see below)
     - **How to Approve** (instructions; see below)

# REVIEW CHECKLIST (append to the file)

- [ ] IN-SCOPE/OUT-OF-SCOPE are explicit and respected
- [ ] All referenced exports exist in the API Contract Table with proofs
- [ ] No invented APIs; any gaps are in Delta Proposals with exact signatures
- [ ] Data layer needs are specified or explicitly "None"
- [ ] Implementation steps reference only verified exports
- [ ] Risks are identified; Future Work separated from scope

# HOW TO APPROVE (append to the file)

- Approver may either:
  1. Reply in chat: **APPROVE PLAN <N>**, or
  2. Edit header: set `status: approved`, and add `approved_at: "<ISO8601>"`, `approved_by: "<name>"`
