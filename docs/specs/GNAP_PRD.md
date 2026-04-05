# GNAP: Git-based Persistent Task State

## Product Requirements Document

## 1. Executive Summary

GNAP (Git-based Persistent Task State) is a crash-resilient task persistence
layer for Agent Orchestrator. It stores structured task context as JSON files
within the repository itself (<repo>/gnap/tasks/), enabling the orchestrator to
recover full task context—goals, dependencies, coordination state—after crashes
or restarts.

## 2. Problem Statement

```
2.1 The Memory Gap
```

Agent Orchestrator manages multiple AI coding agents running in parallel. Each
agent works on a specific task (implementing features, fixing bugs, writing tests)
in isolated git worktrees. The orchestrator coordinates these agents, tracks
dependencies, and routes CI/review feedback.
**The critical problem** : When the orchestrator crashes or restarts, it loses all
in-memory task context.

```
2.2 What Gets Lost on Crash
```

```
Lost Context Impact
Task goals Orchestrator doesn’t know
what each agent was
working on
Dependencies ao-2 depends on ao-
relationships are forgotten
Coordination state Messages already sent get
re-sent (duplicate
notifications)
Original prompts Cannot re-instruct agents
with their original context
Progress summaries No visibility into how far
each task progressed
```

```
2.3 Current Recovery Limitations
The existing recovery system (recovery/manager.ts) can: - Detect orphaned
tmux sessions - Reconstruct basic session metadata from files - Re-attach to
running agents
But it cannot recover: - Why the agent was spawned (the original goal/issue)
```

- Task dependency chains - Whether coordination messages were already sent -
  The full prompt context given to the agent

```
2.4 Real-World Scenario
Before Crash:
￿￿￿ ao-1: "Create formatDuration utility" [in_progress]
￿ ￿￿￿ blocks: ao-2, ao-
￿￿￿ ao-2: "Write tests for formatDuration" [blocked by ao-1]
￿￿￿ ao-3: "Use formatDuration in session-manager" [blocked by ao-1]
```

```
After Crash + Restart:
￿￿￿ ao-1: [tmux session detected, status unknown]
￿￿￿ ao-2: [tmux session detected, status unknown]
￿￿￿ ao-3: [tmux session detected, status unknown]
```

```
Orchestrator sees: "3 running agents... but no idea what they're working on"
```

## 3. Solution: GNAP

```
3.1 Core Concept
Store structured task state as JSON files in the repository:
<project-repo>/
gnap/
tasks/
ao-1.json
ao-2.json
ao-3.json
.gitignore # Excludes *.tmp.* files
Each task file contains complete context:
{
"id": "ao-1",
"sessionId":"ao-1",
"goal":"Create formatDuration utility that converts ms to human readable",
"status": "in_progress",
"blockedBy":[],
```

```
"blocks": ["ao-2", "ao-3"],
"coordinationSent": true ,
"prompt": "Full prompt text given to the agent...",
"progress":"Implemented core function, working on edge cases",
"createdAt":"2026-03-29T06:56:00.446Z",
"updatedAt":"2026-03-29T10:31:15.647Z"
}
```

```
3.2 Why Git-based?
```

Approach Pros Cons

In-memory only Fast Lost on crash
SQLite/Database Queryable Extra dependency,
separate from repo
Metadata files
(~/.agent-orchestrator)

```
Persists Flat key=value, no
structure
GNAP (repo JSON) Structured,
versioned, portable,
human-readable
```

```
Slightly more I/O
```

GNAP advantages: 1. **Survives crashes** : Files persist on disk 2. **Human-
readable** : Developers can inspect task state directly 3. **Portable** : Task con-
text travels with the repo 4. **Versionable** : Can be committed for audit trails
(optional) 5. **No dependencies** : Just filesystem operations

## 4. Technical Implementation

```
4.1 Architecture
￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿
￿ Agent Orchestrator ￿
￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿
￿ ￿
￿ ￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿ ￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿ ￿
￿ ￿ Session Manager ￿￿￿￿￿￿ GNAP Store ￿ ￿
￿ ￿ (spawn/kill) ￿ ￿ (CRUD ops) ￿ ￿
￿ ￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿ ￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿ ￿
￿ ￿ ￿
￿ ￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿ ￿ ￿
￿ ￿ Lifecycle Manager￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿ ￿
￿ ￿ (status updates) ￿ ￿ ￿
￿ ￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿ ￿ ￿
￿ ￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿ ￿
```

￿ ￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿ ￿ gnap/tasks/ ￿ ￿
￿ ￿ Orchestrator ￿￿￿￿￿￿ ￿￿￿ ao-1.json ￿ ￿
￿ ￿ Prompt Generator ￿ ￿ ￿￿￿ ao-2.json ￿ ￿
￿ ￿ (reads on start) ￿ ￿ ￿￿￿ ao-3.json ￿ ￿
￿ ￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿ ￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿ ￿
￿ ￿
￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿￿

**4.2 Data Model**

_// packages/core/src/gnap/types.ts_

**export type** GnapTaskStatus=
| "pending" _// Created but not started_
| "in*progress" *// Agent actively working*
| "blocked" *// Waiting on dependencies*
| "completed" *// Successfully finished*
| "failed" *// Failed with errors*
| "cancelled"; *// Manually killed\_

**exportinterface** GnapTask {
_// Identity_
id:string; _// Same as sessionId_
sessionId: string; _// AO session identifier_

```
// Task Context
goal: string; // What the agent is working on
prompt?:string; // Full prompt given to agent
```

```
// State
status:GnapTaskStatus;
progress?: string; // Last known progress summary
```

```
// Dependencies
blockedBy: string[]; // Tasks this depends on
blocks:string[]; // Tasks waiting for this
```

```
// Coordination
coordinationSent:boolean; // Prevents duplicate messages
```

```
// Timestamps
createdAt: string; // ISO 8601
updatedAt: string; // ISO 8601
```

```
// Optional Context
lineage?: string[]; // Parent task chain
```

```
siblings?: string[]; // Related parallel tasks
metadata?: Record<string,unknown>;
}
```

```
4.3 Store Operations
// packages/core/src/gnap/store.ts
```

```
// Path helpers
getGnapTasksDir(projectPath) // → <project>/gnap/tasks/
getTaskFilePath(projectPath,id) // → <project>/gnap/tasks/<id>.json
ensureGnapDirs(projectPath) // Creates directories + .gitignore
```

```
// CRUD
createTask(projectPath,sessionId, goal,options?) // Create new task
readTask(projectPath, taskId) // Read from disk
writeTask(projectPath,task) // Write to disk
updateTask(projectPath,taskId,updates) // Partial update
deleteTask(projectPath,taskId) // Remove file
```

```
// Listing
listTaskIds(projectPath) // All task IDs
loadAllTasks(projectPath) // All tasks as Record<id, task>
taskExists(projectPath,taskId) // Check existence
```

```
// Dependency Helpers
getBlockedTasks(projectPath,blockingTaskId) // Tasks blocked by this
getDependencies(projectPath,taskId) // Tasks this depends on
areDependenciesCompleted(projectPath, taskId) // All deps done?
```

```
4.4 Atomic Writes
```

All writes useatomicWriteFileSyncto prevent corruption:

```
// Write to temp file first, then rename
function atomicWriteFileSync(filePath: string, content: string): void{
const tempPath=`${filePath}.tmp.${process.pid}.${Date.now()}`;
writeFileSync(tempPath, content);
renameSync(tempPath,filePath); // Atomic on POSIX
}
```

This ensures: - No partial writes if process crashes mid-write - No corrupt JSON
from concurrent access - Temp files are gitignored (_.tmp._)

## 5. Integration Points

**5.1 Session Manager Integration**

**On Spawn** (session-manager.ts→spawn()):

_// After session created, before return_
createGnapTask(
project.path,
sessionId,
spawnConfig.prompt ??spawnConfig.issueId?? "No goal specified",
{
status: "in_progress",
lineage: spawnConfig.lineage,
siblings:spawnConfig.siblings,
prompt: composedPrompt,
}
);

**On Kill** (session-manager.ts→kill()):

_// Before archiving metadata_
updateGnapTask(project.path,sessionId,{ status:"cancelled"});

**5.2 Lifecycle Manager Integration**

**On Status Transition** (lifecycle-manager.ts→checkSession()):

_// After detecting status change_
updateGnapTask(project.path,session.id,{
status:mapSessionStatusToGnap(newStatus),
progress: session.agentInfo?.summary,
});

**Status Mapping** : | Session Status | GNAP Status | |—————-|————-|
| spawning, working, pr_open, ci_pending, review_pending | in_progress | |
merged, closed | completed | | killed | cancelled | | ci_failed, stuck, needs_input,
changes_requested | in_progress |

**On Coordination Message Sent** :

_// After successful send-to-agent_
updateGnapTask(project.path,sessionId,{ coordinationSent: **true** });

**5.3 Orchestrator Prompt Integration**

**On Startup** (orchestrator-prompt.ts→generateOrchestratorPrompt()):

_// Load all GNAP tasks and format for prompt_
**const** gnapTasks= loadAllTasks(project.path);
**const** summary=formatGnapTasksSummary(gnapTasks);

```
if (summary) {
sections.push(`## Current Task Context
```

```
The following tasks were recovered from GNAP persistence:
```

```
${summary}
```

```
Use this context to understand ongoing work, dependencies, and coordination state.`);
}
```

The orchestrator’s system prompt now includes: 1. **Task Context Recovery**
section with manual recovery instructions 2. **Current Task Context** section
with auto-loaded task summaries

## 6. Update Frequency

```
Event When GNAP Updates
Session spawn Immediately
Session kill Immediately
Status change Every 30 seconds (lifecycle poll interval)
Progress update WhenagentInfo.summarychanges
```

```
Current Limitation : Agents don’t write to GNAP directly. Only the or-
chestrator/lifecycle system does. This means GNAP reflects what the lifecycle
manager observes, not real-time self-reporting from agents.
```

## 7. Recovery Flow

```
7.1 Crash Recovery Sequence
```

1. Orchestrator crashes
   ￿￿￿ GNAP files persist on disk
2. Orchestrator restarts
   ￿￿￿ `ao start` launches orchestrator agent
3. Orchestrator prompt generated
   ￿￿￿ `generateOrchestratorPrompt()` called
   ￿￿￿ `loadAllTasks(project.path)` reads gnap/tasks/\*.json
   ￿￿￿ Tasks formatted into "Current Task Context" section

4. Orchestrator agent receives prompt
   ￿￿￿ Sees all task goals, statuses, dependencies
   ￿￿￿ Can resume coordination with full context
5. Orchestrator cross-references with `ao status`
   ￿￿￿ Matches GNAP tasks to live sessions
   ￿￿￿ Identifies tasks needing attention

**7.2 What Orchestrator Sees After Recovery**

## Current Task Context

The following tasks were recovered from GNAP persistence:

### IN PROGRESS (1)

- **ao-2**: Add unit tests for formatDuration
  - Coordination message sent

### CANCELLED (2)

- **ao-1**: Create formatDuration utility
- **ao-3**: Use formatDuration in session-manager.ts

Use this context to understand ongoing work, dependencies, and coordination state.

## 8. File Structure

**8.1 New Files Created**

packages/core/src/gnap/
￿￿￿ types.ts # GnapTask interface, GnapTaskStatus type
￿￿￿ store.ts # CRUD operations, dependency helpers
￿￿￿ index.ts # Public API exports
￿￿￿ **tests**/
￿￿￿ store.test.ts # 39 unit tests

**8.2 Files Modified**

```
File Changes
session-manager.ts Added GNAP create on spawn, update on kill
lifecycle-manager.ts Added GNAP sync on status transitions
orchestrator-prompt.ts Added GNAP loading and prompt injection
index.ts Added GNAP exports
```

```
8.3 Runtime Directory Structure
<project-repo>/
￿￿￿ gnap/
￿ ￿￿￿ .gitignore # Contains: *.tmp.*
￿ ￿￿￿ tasks/
￿ ￿￿￿ ao-1.json
￿ ￿￿￿ ao-2.json
￿ ￿￿￿ ao-3.json
￿￿￿ packages/
￿ ￿￿￿ ...
￿￿￿ ...
```

## 9. Testing

```
9.1 Unit Tests
39 tests covering: - Path helpers and validation - Directory creation (idempotent)
```

- CRUD operations - Dependency helpers - Atomic writes (no leftover temp files)
- JSON format (pretty-printed, newline-terminated) - Edge cases (invalid JSON,
  nonexistent tasks)
  Run with:
  pnpm--filter@composio/ao-core test

```
9.2 Integration Testing
Manual test procedure:
# 1. Build with GNAP changes
pnpm build
```

```
# 2. Start orchestrator
ao start
```

```
# 3. Spawn dependent tasks
ao spawn"Create formatDuration utility"
ao spawn"Write tests for formatDuration"
ao spawn"Use formatDuration in session-manager"
```

```
# 4. Verify GNAP files created
lsgnap/tasks/
# → ao-1.json, ao-2.json, ao-3.json
```

```
# 5. Kill orchestrator (simulate crash)
tmux kill-session-t <orchestrator-session>
```

```
# 6. Restart orchestrator
ao start
```

```
# 7. Ask orchestrator about recovered tasks
>"What tasks were recovered from GNAP persistence?"
# Should list all 3 tasks with goals and statuses
```

## 10. Design Decisions & Rationale

```
10.1 Location: Repository vs Home Directory
Decision : Store in<repo>/gnap/tasks/(repository)
Rationale : - Task context is project-specific - Portable with the codebase - Can
be version-controlled if desired - Easier to inspect during development
Alternative considered : ~/.agent-orchestrator/<project>/gnap/- Re-
jected: Separates task context from code, harder to debug
```

```
10.2 Format: JSON vs Metadata Files
Decision : Structured JSON files
Rationale : - Supports nested data (arrays, objects) - Human-readable and
editable - Easy to parse programmatically - Supports optional fields cleanly
Alternative considered : Flat key=value metadata files - Rejected: Can’t
represent arrays (blockedBy, blocks) or nested prompts
```

```
10.3 Write Strategy: Atomic Writes
Decision : Use temp file + rename pattern
Rationale : - Prevents partial writes on crash - Prevents corruption from con-
current access - Rename is atomic on POSIX systems - Temp files are gitignored
```

**10.4 Read Strategy: On-Demand Loading
Decision** : Load all tasks when generating orchestrator prompt
**Rationale** : - Simple implementation - No background processes needed - Fresh
data on each orchestrator start - Acceptable performance for typical task counts
(<100)

```
Future consideration : Incremental loading for large task sets
```

```
10.5 Agent Writing: Orchestrator-Only
Decision : Only orchestrator/lifecycle writes to GNAP
Rationale : - Simpler architecture - No coordination needed between agents
```

- Agents focus on coding, not state management - Lifecycle manager already
  tracks status changes
  **Future consideration** : MCP tool for agents to update their own progress

## 11. Limitations & Future Work

```
11.1 Current Limitations
```

1. **No real-time agent updates** : Agents can’t self-report progress
2. **30-second sync delay** : Status changes detected at poll interval
3. **No dependency auto-unblocking** : Manual coordination still needed
4. **No task history** : Only current state stored, no change log

```
11.2 Potential Enhancements
```

```
Enhancement Description Effort
Agent GNAP MCP tool Let agents update their
own progress
```

```
Medium
```

```
Dependency auto-resolution Unblock tasks when
dependencies complete
```

```
Medium
```

```
Task history/changelog Track state transitions over
time
```

```
Low
```

```
GNAP dashboard view Visualize task graph in web
UI
```

```
Medium
```

```
Auto-commit GNAP
changes
```

```
Version control task state Low
```

```
Reduce poll interval Faster status sync
(configurable)
```

```
Low
```

## 12. Success Metrics

```
Metric Target Measurement
Context recovery rate 100% Tasks readable after restart
Data integrity 0 corruption No partial/invalid JSON files
Performance impact <50ms Time to load all tasks
Test coverage >90% Unit test coverage for gnap/
```

## 13. Conclusion

```
GNAP addresses a critical gap in Agent Orchestrator’s resilience. By persisting
structured task context to the filesystem, we ensure that:
```

1. **Crashes don’t lose context** : Full task state survives restarts
2. **Coordination continues** : Dependencies and sent-message tracking per-
   sist
3. **Human debugging is easy** : JSON files are inspectable
4. **Implementation is minimal** : ~200 lines of core code, no external de-
   pendencies

The feature integrates cleanly with existing session and lifecycle management,
requiring only targeted additions at spawn, kill, and status transition points.
The orchestrator prompt now automatically includes recovered task context,
enabling seamless resumption of coordination after any interruption.

## Appendix A: API Reference

```
// Create a task
createTask(
projectPath:string,
sessionId: string,
goal: string,
options?: {
status?: GnapTaskStatus;
blockedBy?:string[];
blocks?: string[];
prompt?: string;
lineage?: string[];
siblings?:string[];
}
):GnapTask
```

```
// Read a task
readTask(projectPath: string, taskId: string): GnapTask|null
```

```
// Update a task
updateTask(
projectPath:string,
taskId:string,
updates:Partial<GnapTask>
):GnapTask |null
```

```
// Delete a task
deleteTask(projectPath:string,taskId:string):boolean
```

```
// List all task IDs
listTaskIds(projectPath: string): string[]
```

```
// Load all tasks
loadAllTasks(projectPath: string): Record<string,GnapTask>
```

```
// Check if task exists
taskExists(projectPath:string,taskId:string):boolean
```

```
// Get tasks blocked by a specific task
getBlockedTasks(projectPath:string,blockingTaskId:string):GnapTask[]
```

```
// Get dependencies of a task
getDependencies(projectPath:string,taskId:string):GnapTask[]
```

```
// Check if all dependencies are completed
areDependenciesCompleted(projectPath: string,taskId:string):boolean
```

## Appendix B: Example Task File

### {

```
"id": "ao-1",
"sessionId":"ao-1",
"goal":"Create formatDuration utility in packages/core/src/utils.ts that converts ms to human readable like '2h 30m'",
"status": "in_progress",
"blockedBy":[],
"blocks": ["ao-2", "ao-3"],
"createdAt":"2026-03-29T06:56:00.446Z",
"updatedAt":"2026-03-29T10:31:15.647Z",
"coordinationSent": true ,
"prompt": "You are an AI coding agent managed by the Agent Orchestrator (ao).\n\n## Session Lifecycle\n- You are running inside a managed session...",
"progress":"Implemented core function, adding edge case handling"
}
```

_Document Version: 1.0 Created: March 29, 2026 Author: GNAP Implementa-
tion Team_
