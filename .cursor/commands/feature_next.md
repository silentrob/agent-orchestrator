# /next-task

next-task must ABORT unless both plan and tasks headers are approved.

You will iterate the feature's task list and execute the next runnable task while enforcing GLOBAL GUARDRAILS.

INPUTS

- Feature number <N>
- Optional: <Feature_Name>
- Files:
  - Plan: ./cursor/features/<N>\_PLAN.md
  - Tasks: ./cursor/features/<Feature_Name><N>\_TASKS.md

GOALS

- Select the correct "next" task.
- Implement ONLY what the task specifies (no scope creep).
- Do not invent or call APIs that are not defined in the Plan’s API Contract Table.
- Update the task status and acceptance criteria upon completion.

PROCEDURE

0. Load Context
   - Open the Plan and extract:
     - IN-SCOPE / OUT-OF-SCOPE
     - API Contract Table
     - Delta Proposals
   - Open the Tasks file.

1. Select Next Runnable Task
   - Order by Status = "not started" → Priority (High, then Medium, then Low) → Task ID (lexical).
   - Ensure all Dependencies are complete; if not, skip to the next candidate.

2. Pre-Flight Checks (HARD GATES)
   - **Scope Fence**: Confirm the task touches ONLY IN-SCOPE items. If not, move the extra to "Future Work (Non-Blocking)" and continue with in-scope subset.
   - **API Reality**: For every file/function referenced in the task:
     - Find the entry in the Plan’s **API Contract Table** and record the file path + signature.
     - If missing, STOP. Create/append to the “Delta Proposal” and generate/append a _blocked_ Delta task; mark current task as `blocked: missing API`.

3. Feature branch (if VCS available)
   - **One branch per plan** — not one branch per task.
   - Branch name: `feat/<N>-<kebab-slug>` where `<kebab-slug>` is a short slug from the plan YAML `feature_name` (lowercase, hyphens, drop punctuation; max ~6–8 words → ~40 chars). If that is awkward, use `feat/plan-<N>`.
   - **First** `/feature_next` run for plan `<N>`: create `feat/<N>-<kebab-slug>` from your base branch (usually `main`) if it does not exist, check it out, then implement.
   - **Later** tasks for the same plan: **check out** that existing feature branch and commit there — do **not** create `feat/<N>/T##-...` per task.
   - **Commit prefix** (every commit, for traceability): `[<N> T##]`

4. Implement (Minimal Surface Area)
   - Open only the **Files to Change** from the task.
   - Implement exactly the behavior required by the **Acceptance Criteria**.
   - If a file must import something:
     - Verify the export exists (file, symbol name, signature) per API Contract Table.
     - Do NOT assume methods on imports. If truly needed, convert to a **Delta Proposal** and pause implementation.
   - Prefer smallest viable change; no refactors unless explicitly part of the task.

5. Tests & Verification
   - Create/modify tests listed under the task.
   - Run unit tests; if failing due to missing API, bounce to Step 2 (Delta flow).
   - Confirm each Acceptance Criterion with a specific test/assert or manual verification note.

6. Hygiene
   - Run formatter and linter.
   - Re-run tests until green.

7. Update Tasks File
   - Change Task Status → `complete` (or `blocked`, with reason).
   - Under the task, add:
     - **Proof of Work**: files changed, key functions touched.
     - **Acceptance Criteria Check-off**: ✓/✗ with brief notes.
     - **Test Artifacts**: test file paths and test names.

8. Commit & PR (if applicable)
   - Commit message:
     - Title: `[<N> T##] <short imperative summary>`
     - Body:
       - Why: 1–2 lines
       - Scope: file list (bulleted)
       - Tests: what was added/updated
       - Acceptance: list of criteria with ✓/✗
   - **PR:** Open (or update) a **single** PR from the plan feature branch `feat/<N>-<kebab-slug>` to your target branch when ready — typically once when the plan is done, or earlier for incremental review; avoid one PR per task unless you explicitly want that.

9. Select Next Task
   - If more runnable tasks remain, list the next 3 candidates with their dependencies and required files (preview only). Do not implement automatically.

HARD RULES

- No invented APIs. Use only entries from the API Contract Table, or create/mark a Delta Proposal + blocked task.
- No scope creep. Anything outside IN-SCOPE is moved to "Future Work (Non-Blocking)".
- Do not modify files outside “Files to Change” unless the task explicitly lists them or they are part of an approved Delta Proposal.
